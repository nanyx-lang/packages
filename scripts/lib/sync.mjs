// Bringing one package's index file up to date with its repository's releases.

import { createHash } from "node:crypto";
import { readManifestFromArchive } from "./manifest.mjs";
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

// A new version's index entry, or the reasons it can't be recorded.
async function newEntry(name, version, asset, download) {
  const bytes = await download(asset.browser_download_url);
  const manifest = readManifestFromArchive(bytes);
  const problems = [...manifest.problems];
  if (manifest.name && manifest.name !== name) problems.push(`its manifest names the package ${manifest.name}`);
  if (manifest.version && manifest.version !== version) problems.push(`its manifest gives the version ${manifest.version}`);
  if (problems.length > 0) return { problems };
  return {
    entry: {
      version,
      url: asset.browser_download_url,
      sha256: sha256(bytes),
      nanyx: manifest.nanyx,
      dependencies: manifest.dependencies,
      yanked: false,
      available: true,
    },
  };
}

// The asset's SHA-256 if it differs from the one recorded: from the digest GitHub gives, or by downloading it.
async function replacedHash(entry, asset, download) {
  const digest = asset.digest?.startsWith("sha256:") ? asset.digest.slice("sha256:".length) : sha256(await download(asset.browser_download_url));
  return digest === entry.sha256 ? null : digest;
}

/**
 * The package's index file after reading its releases, and what the sync should report. A version, once recorded,
 * keeps its hash and is never removed: a replaced asset is reported, and a missing one marks the version unavailable.
 *
 * `releases` is null when the repository doesn't exist. `download` returns the bytes at a URL.
 */
export async function syncPackage({ registration, index, releases, download }) {
  const { name, repository } = registration;
  const reports = [];
  const versions = new Map((index?.versions ?? []).map((v) => [v.version, { ...v }]));
  const released = releases === null ? new Map() : releasedVersions(name, releases);
  if (releases === null) reports.push(`${name}: the repository ${repository} can't be found`);

  for (const [version, { tag, asset }] of released) {
    const entry = versions.get(version);
    if (entry === undefined) {
      const result = await newEntry(name, version, asset, download);
      if (result.entry) versions.set(version, result.entry);
      else reports.push(`${name} ${version} (release ${tag}) isn't recorded: ${result.problems.join("; ")}`);
      continue;
    }
    if (!entry.available) {
      entry.available = true;
      reports.push(`${name} ${version} is available again`);
    }
    const replaced = await replacedHash(entry, asset, download);
    if (replaced !== null)
      reports.push(`${name} ${version}: the asset was replaced (its SHA-256 is now ${replaced}); the index keeps ${entry.sha256}`);
  }

  for (const entry of versions.values()) {
    if (entry.available && !released.has(entry.version)) {
      entry.available = false;
      reports.push(`${name} ${entry.version}: the release or its asset is gone, so the version is marked unavailable`);
    }
  }

  const updated = {
    name,
    repository,
    versions: [...versions.values()].sort((a, b) => compareVersions(a.version, b.version)),
  };
  const changed = JSON.stringify(updated) !== JSON.stringify(index);
  return { index: updated, reports, changed };
}
