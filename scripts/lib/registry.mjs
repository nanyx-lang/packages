// Registrations (`registry/<namespace>/<name>.json`) and index files (`index/<namespace>/<name>.json`).

import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { nameProblems, namespaceOf, parseRepository } from "./names.mjs";

export const registrationPath = (name) => `registry/${namespaceOf(name)}/${name}.json`;
export const indexPath = (name) => `index/${namespaceOf(name)}/${name}.json`;

/** Every `.json` file under `folder` in `root`, by its path relative to `root`, with `/` separators. */
export function readJsonFiles(root, folder) {
  const files = new Map();
  const base = join(root, folder);
  if (!existsSync(base)) return files;
  for (const entry of readdirSync(base, { recursive: true, withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const full = join(entry.parentPath ?? entry.path, entry.name);
    const relative = full.slice(root.length + 1).split("\\").join("/");
    files.set(relative, readFileSync(full, "utf8"));
  }
  return files;
}

/** A registration file's contents, and every problem with it that can be seen without GitHub. */
export function readRegistration(path, text) {
  let registration;
  try {
    registration = JSON.parse(text);
  } catch (e) {
    return { problems: [`${path} isn't valid JSON: ${e.message}`] };
  }
  if (registration === null || typeof registration !== "object" || Array.isArray(registration))
    return { problems: [`${path} must be a JSON object: { "name": ..., "repository": ... }`] };
  const problems = [];
  const extra = Object.keys(registration).filter((k) => k !== "name" && k !== "repository");
  if (extra.length > 0) problems.push(`${path}: a registration has only "name" and "repository", not ${extra.map((k) => `"${k}"`).join(", ")}`);
  const { name, repository } = registration;
  problems.push(...nameProblems(name).map((p) => `${path}: ${p}`));
  if (typeof name === "string" && problems.length === 0 && path !== registrationPath(name))
    problems.push(`${path}: the registration of ${name} belongs at ${registrationPath(name)}`);
  if (parseRepository(repository) === null)
    problems.push(`${path}: "repository" must be a GitHub repository's address, such as https://github.com/acme/acme.web`);
  return { registration: problems.length === 0 ? registration : undefined, problems };
}

/** Writes an index file's JSON as the repository keeps it. */
export const formatJson = (value) => JSON.stringify(value, null, 2) + "\n";
