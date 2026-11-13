// Brings every registered package's index file up to date with its releases: `node scripts/sync.mjs`.

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { download, listReleases } from "./lib/github.mjs";
import { parseRepository } from "./lib/names.mjs";
import { formatJson, indexPath, readJsonFiles, readRegistration } from "./lib/registry.mjs";
import { syncPackage } from "./lib/sync.mjs";

const reports = [];
const updated = [];

for (const [path, text] of readJsonFiles(process.cwd(), "registry")) {
  const { registration, problems } = readRegistration(path, text);
  if (!registration) {
    reports.push(...problems);
    continue;
  }
  const target = indexPath(registration.name);
  try {
    const index = existsSync(target) ? JSON.parse(readFileSync(target, "utf8")) : null;
    const { owner, repo } = parseRepository(registration.repository);
    const releases = await listReleases(owner, repo);
    const result = await syncPackage({ registration, index, releases, download });
    reports.push(...result.reports);
    if (result.changed) {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, formatJson(result.index));
      updated.push(registration.name);
    }
  } catch (e) {
    reports.push(`${registration.name} couldn't be synced: ${e.message}`);
  }
}

const summary =
  (updated.length === 0 ? "No index files changed.\n" : `Updated: ${updated.join(", ")}.\n`) +
  (reports.length === 0 ? "" : "\nReports:\n\n" + reports.map((r) => `- ${r}`).join("\n") + "\n");
console.log(summary);
for (const report of reports) console.log(`::warning::${report}`);
if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
