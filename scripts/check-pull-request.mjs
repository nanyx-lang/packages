// Checks a pull request against its base: `node scripts/check-pull-request.mjs <base commit>`.

import { appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { checkPullRequest } from "./lib/check.mjs";
import { getRepository } from "./lib/github.mjs";
import { readJsonFiles } from "./lib/registry.mjs";

const base = process.argv[2];
if (!base) throw new Error("usage: check-pull-request.mjs <base commit>");

const git = (...args) => execFileSync("git", args, { encoding: "utf8", maxBuffer: 1 << 28 });

function filesAt(commit, folder) {
  const files = new Map();
  for (const path of git("ls-tree", "-r", "--name-only", commit, "--", folder).split("\n"))
    if (path.endsWith(".json")) files.set(path, git("show", `${commit}:${path}`));
  return files;
}

const problems = await checkPullRequest({
  base: { registry: filesAt(base, "registry"), index: filesAt(base, "index") },
  head: { registry: readJsonFiles(process.cwd(), "registry"), index: readJsonFiles(process.cwd(), "index") },
  getRepository,
});

const summary =
  problems.length === 0
    ? "The registrations and index changes in this pull request pass the checks.\n"
    : "This pull request can't be merged as it is:\n\n" + problems.map((p) => `- ${p}`).join("\n") + "\n";
console.log(summary);
for (const problem of problems) console.log(`::error::${problem}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
process.exitCode = problems.length === 0 ? 0 : 1;
