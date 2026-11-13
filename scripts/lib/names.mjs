// Package names: how they are spelled, which GitHub account owns them, and when two are too alike.

// The compiler's rule for a manifest's `name` (`Manifest.namePattern` in Package.fs).
const NAME = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/;

/** Every problem with a package name, or none. */
export function nameProblems(name) {
  if (typeof name !== "string" || name === "") return ["the name is missing"];
  const problems = [];
  if (!NAME.test(name)) problems.push(`"${name}" must be lower case, with words separated by dots: acme.web`);
  if (!name.includes(".")) problems.push(`"${name}" needs a namespace: a published package's name has at least two parts, as in acme.web`);
  if (name.length > 64) problems.push(`"${name}" is longer than 64 characters`);
  return problems;
}

/** The namespace of a package name: its first part. */
export const namespaceOf = (name) => name.split(".")[0];

/** The GitHub account, in lower case, that owns a namespace. `nanyx` belongs to the Nanyx project. */
export const ownerOfNamespace = (namespace) => (namespace === "nanyx" ? "nanyx-lang" : namespace);

// Spellings that read alike, each replaced by one of them. Longer ones come first.
const LOOK_ALIKE = [
  ["rn", "m"],
  ["vv", "w"],
  ["cl", "d"],
  ["0", "o"],
  ["1", "l"],
  ["i", "l"],
  ["5", "s"],
];

/** What a name looks like once case, `_`, `-` and look-alike characters are ignored. */
export function skeleton(name) {
  let s = name.toLowerCase().replace(/[-_]/g, "");
  for (const [from, to] of LOOK_ALIKE) s = s.split(from).join(to);
  return s;
}

/** The name in `others` that `name` would be confused with, if any. */
export function confusableWith(name, others) {
  const own = skeleton(name);
  return others.find((other) => other !== name && skeleton(other) === own);
}

/** The owner and repository of a GitHub repository URL, or null if it isn't one. */
export function parseRepository(url) {
  const match = /^https:\/\/github\.com\/([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)$/.exec(url ?? "");
  return match ? { owner: match[1], repo: match[2] } : null;
}
