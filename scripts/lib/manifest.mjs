// Reading a package's `.nyxp` manifest: the part of TOML manifests use, enough for the index's fields.

import { readZip } from "./zip.mjs";

export const MANIFEST_EXTENSION = ".nyxp";

// Splits `text` at `separator` where it is outside quotes and brackets.
function splitOutside(text, separator) {
  const parts = [];
  let depth = 0;
  let quote = null;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === separator && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return { parts, depth, quote };
}

function stripComment(line) {
  let quote = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote) {
      if (c === "\\" && quote === '"') i++;
      else if (c === quote) quote = null;
    } else if (c === '"' || c === "'") quote = c;
    else if (c === "#") return line.slice(0, i);
  }
  return line;
}

function parseKey(text) {
  return splitOutside(text.trim(), ".")
    .parts.map((part) => {
      const p = part.trim();
      if (p.startsWith('"')) return JSON.parse(p);
      if (p.startsWith("'")) return p.slice(1, -1);
      return p;
    })
    .join(".");
}

function parseValue(text) {
  const t = text.trim();
  if (t.startsWith('"') && t.endsWith('"') && !t.startsWith('"""')) return JSON.parse(t);
  if (t.startsWith("'") && t.endsWith("'") && !t.startsWith("'''")) return t.slice(1, -1);
  if (t.startsWith("{") && t.endsWith("}")) {
    const table = {};
    const inner = t.slice(1, -1).trim();
    if (inner === "") return table;
    for (const pair of splitOutside(inner, ",").parts) {
      const { parts } = splitOutside(pair, "=");
      table[parseKey(parts[0])] = parseValue(parts.slice(1).join("="));
    }
    return table;
  }
  return { unread: t };
}

/** The tables of a TOML document, each a map from (dotted) key to value. */
export function parseToml(text) {
  const tables = { "": {} };
  let current = "";
  let pending = "";
  for (const rawLine of text.split(/\r?\n/)) {
    const line = pending + stripComment(rawLine);
    // A value that spans lines (an array or inline table) is read once it is closed.
    if (splitOutside(line, "\0").depth > 0) {
      pending = line + "\n";
      continue;
    }
    pending = "";
    const trimmed = line.trim();
    if (trimmed === "") continue;
    if (trimmed.startsWith("[[")) {
      current = null;
    } else if (trimmed.startsWith("[")) {
      current = parseKey(trimmed.slice(1, -1));
      tables[current] ??= {};
    } else if (current !== null) {
      const { parts } = splitOutside(trimmed, "=");
      if (parts.length < 2) throw new Error(`can't read the line "${trimmed}"`);
      tables[current][parseKey(parts[0])] = parseValue(parts.slice(1).join("="));
    }
  }
  return tables;
}

/** What the index records from a manifest, or the problems that stop it being recorded. */
export function readManifest(text) {
  let tables;
  try {
    tables = parseToml(text);
  } catch (e) {
    return { problems: [`the manifest isn't valid TOML: ${e.message}`] };
  }
  const pkg = tables.package ?? {};
  const problems = [];
  const string = (key) => {
    const value = pkg[key];
    if (value === undefined) return null;
    if (typeof value !== "string") problems.push(`[package] ${key} must be a string`);
    return typeof value === "string" ? value : null;
  };
  const name = string("name");
  const version = string("version");
  const nanyx = string("nanyx");
  if (name === null) problems.push("the manifest has no [package] name");
  if (version === null) problems.push("the manifest has no [package] version");
  const dependencies = {};
  for (const [dependency, value] of Object.entries(tables.dependencies ?? {})) {
    if (typeof value === "string") dependencies[dependency] = value;
    else if (typeof value?.version === "string" && value.path === undefined && value.git === undefined)
      dependencies[dependency] = value.version;
    else problems.push(`the dependency ${dependency} doesn't come from the index, so the package can't be published`);
  }
  return { name, version, nanyx, dependencies, problems };
}

/**
 * The manifest in a package archive: the one `.nyxp` file at its root, or inside the one folder at its root.
 * Until the `.nyxpkg` format lands, a package archive is a zip of the package's sources.
 */
export function readManifestFromArchive(buffer) {
  let entries;
  try {
    entries = readZip(buffer);
  } catch (e) {
    return { problems: [`the asset isn't a zip of the package's sources: ${e.message}`] };
  }
  const topFolders = new Set(entries.map((e) => (e.path.includes("/") ? e.path.split("/")[0] : "")));
  const prefix = topFolders.size === 1 && !topFolders.has("") ? [...topFolders][0] + "/" : "";
  const manifests = entries.filter(
    (e) => e.path.startsWith(prefix) && !e.path.slice(prefix.length).includes("/") && e.path.endsWith(MANIFEST_EXTENSION),
  );
  if (manifests.length !== 1)
    return {
      problems: [
        manifests.length === 0
          ? `the asset has no ${MANIFEST_EXTENSION} manifest at its root`
          : `the asset has more than one ${MANIFEST_EXTENSION} manifest: ${manifests.map((m) => m.path).join(", ")}`,
      ],
    };
  return readManifest(manifests[0].read().toString("utf8"));
}
