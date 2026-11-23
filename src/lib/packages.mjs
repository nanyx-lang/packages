import { isUnlisted, readJsonFiles } from "../../scripts/lib/registry.mjs";
import { parseRepository } from "../../scripts/lib/names.mjs";

// The address the index files are served from, which a relative `url` in one is read against, as the compiler does.
const INDEX = "https://packages.nanyx.dev/";

/** Where a package's page is, relative to the site's root. */
export const pagePath = (name) => `packages/${name}/`;

// The newest version a resolution can pick: the last that is listed and available.
const latestOf = (versions) => versions.filter((version) => version.available && !isUnlisted(version)).at(-1);

/** Every package in the index, by name, with what its page shows that the index file gives. */
export function packages(root) {
  return [...readJsonFiles(root, "index")]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, text]) => {
      const { name, repository, versions } = JSON.parse(text);
      const latest = latestOf(versions);
      return {
        path,
        page: pagePath(name),
        name,
        repository,
        github: parseRepository(repository),
        latest: latest?.version ?? "none",
        // Newest first, each with its asset's address made absolute.
        versions: versions
          .map((version) => ({
            ...version,
            url: version.url ? new URL(version.url, new URL(path, INDEX)).toString() : null,
            unlisted: isUnlisted(version),
            prerelease: version.version.includes("-"),
            latest: version === latest,
          }))
          .reverse(),
      };
    });
}

/** The release tag a version's asset was downloaded from, from its address, or else `v<version>`. */
export function tagOf(version) {
  const match = /\/releases\/download\/([^/]+)\//.exec(version.url ?? "");
  return match ? decodeURIComponent(match[1]) : `v${version.version}`;
}
