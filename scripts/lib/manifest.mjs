// What the index records from a package's manifest. The compiler reads the manifest (a Nanyx record) and prints it
// as JSON with `nanyx manifest --json`: a record is an object, a list an array, and a tag a string like "#error".

import { readZip } from "./zip.mjs";

export const MANIFEST_EXTENSION = ".nyxp";

const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

/**
 * The index's fields from the JSON `nanyx manifest --json` prints: the package's name, version, oldest compiler
 * (`package.nanyx`) and repository (`package.repository`), each null if it isn't given, and its dependencies from
 * the index, by name; or the problems that stop the version being recorded.
 */
export function readManifestJson(json) {
  const manifest = typeof json === "string" ? JSON.parse(json) : json;
  if (!isRecord(manifest)) return { problems: ["the manifest isn't a record"] };
  const pkg = isRecord(manifest.package) ? manifest.package : {};
  const problems = [];
  const string = (key) => {
    const value = pkg[key];
    if (value === undefined) return null;
    if (typeof value !== "string") {
      problems.push(`the manifest's package.${key} must be a string`);
      return null;
    }
    return value;
  };
  const name = string("name");
  const version = string("version");
  const nanyx = string("nanyx");
  const repository = string("repository");
  if (pkg.name === undefined) problems.push("the manifest has no package.name");
  if (pkg.version === undefined) problems.push("the manifest has no package.version");

  const dependencies = {};
  const list = manifest.dependencies ?? [];
  if (!Array.isArray(list)) problems.push("the manifest's dependencies must be a list");
  else
    for (const dependency of list) {
      const label = dependency?.package ?? dependency?.module ?? JSON.stringify(dependency);
      const fromIndex =
        isRecord(dependency) &&
        typeof dependency.package === "string" &&
        typeof dependency.version === "string" &&
        Object.keys(dependency).every((key) => key === "package" || key === "version");
      if (fromIndex) dependencies[dependency.package] = dependency.version;
      else problems.push(`the dependency ${label} doesn't come from the index, so the package can't be published`);
    }
  return { name, version, nanyx, repository, dependencies, problems };
}

/**
 * The files of a package archive, with the paths of the package's folder: the archive's root, or its one top-level
 * folder. Until the `.nyxpkg` format lands, a package archive is a zip of the package's sources.
 * Returns `{ files: [{ path, read }] }`, each path relative to the package's folder, or `{ problems }`.
 */
export function packageFiles(buffer) {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (e) {
    return { problems: [`the asset isn't a zip of the package's sources: ${e.message}`] };
  }
  const unsafe = entries.filter(
    (e) => e.path.startsWith("/") || e.path.includes("\\") || e.path.includes("\0") || e.path.split("/").some((part) => part === ".." || part === "."),
  );
  if (unsafe.length > 0) return { problems: [`the asset has paths outside its folder: ${unsafe.map((e) => e.path).join(", ")}`] };
  const topFolders = new Set(entries.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")));
  const prefix = topFolders.size === 1 && !topFolders.has("") ? [...topFolders][0] + "/" : "";
  const files = entries.map((e) => ({ path: e.path.slice(prefix.length), read: e.read }));
  if (!files.some((f) => !f.path.includes("/") && f.path.endsWith(MANIFEST_EXTENSION)))
    return { problems: [`the asset has no ${MANIFEST_EXTENSION} manifest at its root`] };
  return { files };
}
