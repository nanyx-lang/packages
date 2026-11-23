// Bringing one package's index file up to date with its repository's releases.

import { createHash } from "node:crypto";
import { withUnlisted } from "./registry.mjs";
import { compareVersions, versionOfTag } from "./versions.mjs";

/** The name of the asset a release of `name` at `version` carries. */
export const assetName = (name, version) => `${name}-${version}.nyxpkg`;

export const sha256 = (buffer) => createHash("sha256").update(buffer).digest("hex");

// Each release whose tag is a version and which carries the package's asset, by version.
function releasedVersions(name, releases) {
  const found = new Map();
  for (const release of releases) {
    const version = versionOfTag(release.tag_name);
    if (version === null) continue;
    const asset = release.assets.find((a) => a.name === assetName(name, version));
    if (asset && !found.has(version)) found.set(version, { tag: release.tag_name, asset });
  }
  return found;
}

// A new version's index entry and its asset's bytes, or the reasons it can't be recorded.
async function newEntry(registration, version, asset, download, compiler) {
  const { name } = registration;
  const bytes = await download(asset.browser_download_url);
  const manifest = compiler.readPackage(bytes);
  const problems = [...manifest.problems];
  if (manifest.name && manifest.name !== name) problems.push(`its manifest names the package ${manifest.name}`);
  if (manifest.version && manifest.version !== version) problems.push(`its manifest gives the version ${manifest.version}`);
  if (manifest.repository && !sameRepository(manifest.repository, registration.repository))
    problems.push(`its manifest gives the repository ${manifest.repository}, but the package is registered with ${registration.repository}`);
  if (problems.length > 0) return { problems };
  return {
    bytes,
    entry: {
      version,
      url: asset.browser_download_url,
      sha256: sha256(bytes),
      nanyx: manifest.nanyx,
      dependencies: manifest.dependencies,
      unlisted: false,
      available: true,
    },
  };
}

// A repository as `owner/name`, in lower case: a manifest writes it so, `nanyx-lang/json`, and a registration as its
// address, `https://github.com/nanyx-lang/json`, either perhaps with `.git` or a `/` after it.
const repositoryKey = (repository) =>
  repository
    .replace(/(\.git)?\/*$/, "")
    .replace(/^https:\/\/github\.com\//i, "")
    .toLowerCase();

const sameRepository = (a, b) => repositoryKey(a) === repositoryKey(b);

// The newest recorded version below `version` that isn't unlisted and is available, or null.
function previousVersion(versions, version) {
  let previous = null;
  for (const entry of versions.values())
    if (!entry.unlisted && entry.available && compareVersions(entry.version, version) < 0 && (previous === null || compareVersions(entry.version, previous.version) > 0))
      previous = entry;
  return previous;
}

// The problems that stop `entry` being recorded because it isn't a big enough bump from the version before it, if
// there is one. `assets` holds the bytes of the versions already downloaded in this run.
async function releaseCheckProblems(versions, entry, bytes, assets, download, compiler) {
  const previous = previousVersion(versions, entry.version);
  if (previous === null) return [];
  let olderBytes = assets.get(previous.version);
  if (olderBytes === undefined) {
    olderBytes = await download(previous.url);
    if (sha256(olderBytes) !== previous.sha256)
      return [`it can't be checked against ${previous.version}: that version's asset no longer has its recorded SHA-256`];
    assets.set(previous.version, olderBytes);
  }
  const result = compiler.apiCheck({ version: previous.version, bytes: olderBytes }, { version: entry.version, bytes });
  if (result.passed) return [];
  if (result.error) return [`it can't be checked against ${previous.version}: ${result.error}`];
  return [`it fails the release check against ${previous.version}: ${result.report.join("; ")}`];
}

// The asset's SHA-256 if it differs from the one recorded: from the digest GitHub gives, or by downloading it.
async function replacedHash(entry, asset, download) {
  const digest = asset.digest?.startsWith("sha256:") ? asset.digest.slice("sha256:".length) : sha256(await download(asset.browser_download_url));
  return digest === entry.sha256 ? null : digest;
}

/**
 * The package's index file after reading its releases, and what the sync should report. A version, once recorded,
 * keeps its hash and is never removed: a replaced asset is reported, and a missing one marks the version unavailable.
 * A new version is recorded only if the compiler can read its manifest and, when a version below it is recorded, it
 * is a big enough bump from the newest of those that isn't unlisted and is available. A version's `"yanked"`, the field's
 * old name, is read as `"unlisted"` and written as it.
 *
 * `releases` is null when the repository doesn't exist. `download` returns the bytes at a URL. `compiler` reads a
 * package asset's manifest (`readPackage`) and checks a release (`apiCheck`), as `compiler.mjs` does.
 */
export async function syncPackage({ registration, index, releases, download, compiler }) {
  const { name, repository } = registration;
  const reports = [];
  const versions = new Map((index?.versions ?? []).map((v) => [v.version, withUnlisted(v)]));
  const released = releases === null ? new Map() : releasedVersions(name, releases);
  if (releases === null) reports.push(`${name}: the repository ${repository} can't be found`);

  for (const entry of versions.values()) {
    const release = released.get(entry.version);
    if (release === undefined) {
      if (entry.available) {
        entry.available = false;
        reports.push(`${name} ${entry.version}: the release or its asset is gone, so the version is marked unavailable`);
      }
      continue;
    }
    if (!entry.available) {
      entry.available = true;
      reports.push(`${name} ${entry.version} is available again`);
    }
    const replaced = await replacedHash(entry, release.asset, download);
    if (replaced !== null)
      reports.push(`${name} ${entry.version}: the asset was replaced (its SHA-256 is now ${replaced}); the index keeps ${entry.sha256}`);
  }

  // New versions oldest first, so each is checked against the versions recorded before it, these included.
  const assets = new Map();
  const added = [...released].filter(([version]) => !versions.has(version)).sort(([a], [b]) => compareVersions(a, b));
  for (const [version, { tag, asset }] of added) {
    const result = await newEntry(registration, version, asset, download, compiler);
    const problems = result.problems ?? (await releaseCheckProblems(versions, result.entry, result.bytes, assets, download, compiler));
    if (problems.length > 0) {
      reports.push(`${name} ${version} (release ${tag}) isn't recorded: ${problems.join("; ")}`);
      continue;
    }
    versions.set(version, result.entry);
    assets.set(version, result.bytes);
  }

  const updated = {
    name,
    repository,
    versions: [...versions.values()].sort((a, b) => compareVersions(a.version, b.version)),
  };
  const changed = JSON.stringify(updated) !== JSON.stringify(index);
  return { index: updated, reports, changed };
}
