// What a pull request to the index may change: add registrations, and yank or unyank versions.

import { confusableWith, namespaceOf, ownerOfNamespace, parseRepository } from "./names.mjs";
import { readRegistration } from "./registry.mjs";

const changedPaths = (base, head) =>
  [...new Set([...base.keys(), ...head.keys()])].filter((path) => base.get(path) !== head.get(path)).sort();

// The problems with a registration the pull request adds, including its repository's owner on GitHub.
async function addedRegistrationProblems(path, text, allNames, getRepository) {
  const { registration, problems } = readRegistration(path, text);
  if (!registration) return problems;
  const { name, repository } = registration;
  const like = confusableWith(name, allNames);
  if (like) problems.push(`${path}: ${name} is too like the registered package ${like}`);
  const namespace = namespaceOf(name);
  const owner = ownerOfNamespace(namespace);
  const { owner: urlOwner, repo } = parseRepository(repository);
  const found = await getRepository(urlOwner, repo);
  if (found === null) problems.push(`${path}: the repository ${repository} can't be found`);
  else if (found.private) problems.push(`${path}: the repository ${repository} is private`);
  else if (found.owner.toLowerCase() !== owner)
    problems.push(
      `${path}: the namespace ${namespace} belongs to the GitHub account ${owner}, but ${repository} is owned by ${found.owner}`,
    );
  return problems;
}

// The problems with a change to an index file: only "yanked" may change.
function indexChangeProblems(path, before, after) {
  const onlyYanked = `${path}: index files are written by the sync; a pull request may only change a version's "yanked"`;
  if (before === undefined) return [`${path}: index files are written by the sync; a pull request can't add one`];
  if (after === undefined) return [`${path}: versions are never removed from the index; yank them instead`];
  let old, now;
  try {
    old = JSON.parse(before);
    now = JSON.parse(after);
  } catch (e) {
    return [`${path} isn't valid JSON: ${e.message}`];
  }
  const problems = [];
  for (const v of now.versions ?? []) if (typeof v.yanked !== "boolean") problems.push(`${path}: "yanked" of ${v.version} must be true or false`);
  const withOldYanks = {
    ...now,
    versions: (now.versions ?? []).map((v, i) => ({ ...v, yanked: old.versions?.[i]?.yanked })),
  };
  if (JSON.stringify(withOldYanks) !== JSON.stringify(old)) problems.push(onlyYanked);
  return problems;
}

/**
 * Every reason to refuse a pull request, given the registry and index files before and after it (maps from path
 * to contents) and a way to look up a GitHub repository. An empty list means the checks pass.
 */
export async function checkPullRequest({ base, head, getRepository }) {
  const problems = [];
  const allNames = [...head.registry.keys()].map((path) => path.split("/").pop().replace(/\.json$/, ""));
  for (const path of changedPaths(base.registry, head.registry)) {
    if (base.registry.has(path))
      problems.push(`${path}: a registration can't be changed or removed by a pull request; ask a maintainer`);
    else problems.push(...(await addedRegistrationProblems(path, head.registry.get(path), allNames, getRepository)));
  }
  for (const path of changedPaths(base.index, head.index))
    problems.push(...indexChangeProblems(path, base.index.get(path), head.index.get(path)));
  return problems;
}
