// A stand-in for the Nanyx compiler in the tests, with the contract of the two commands the sync runs.
//
// `nanyx manifest --json <dir>`: the one .nyxp manifest in <dir> is JSON here (what the real command prints), and is
// printed back. A manifest that isn't JSON is an error: stderr, exit 1.
//
// `nanyx api-check <older.nyxpkg> <newer.nyxpkg>`: each package's api.json is `{ "exports": [...] }`. Removing an
// export needs a major bump, adding one a minor bump (for 0.x, one place lower). Exit 0 with the changes on stdout,
// exit 1 with `error: ` lines on stderr, or exit 2 for a usage error.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { packageFiles } from "../../scripts/lib/manifest.mjs";

const [command, ...args] = process.argv.slice(2);

function usage(message) {
  process.stderr.write(`${message}\n`);
  process.exit(2);
}

if (command === "manifest") {
  if (args[0] !== "--json" || args.length !== 2) usage("usage: nanyx manifest --json <path>");
  const manifests = readdirSync(args[1]).filter((f) => f.endsWith(".nyxp"));
  if (manifests.length !== 1) usage(`error: ${args[1]} has ${manifests.length} .nyxp manifests`);
  const path = join(args[1], manifests[0]);
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    process.stderr.write(`${path}(1,1): error NYX0021: Invalid manifest\n`);
    process.exit(1);
  }
  process.stdout.write(JSON.stringify(manifest, null, 2) + "\n");
  process.exit(0);
}

if (command === "api-check") {
  if (args.length !== 2) usage("usage: nanyx api-check <older.nyxpkg> <newer.nyxpkg>");
  const read = (path) => {
    let bytes;
    try {
      bytes = readFileSync(path);
    } catch {
      usage(`error: can't read ${path}`);
    }
    const { files, problems } = packageFiles(bytes);
    if (problems) usage(`error: ${path}: ${problems.join("; ")}`);
    const text = (test) => files.find((f) => test(f.path))?.read().toString("utf8");
    const manifest = JSON.parse(text((p) => p.endsWith(".nyxp")));
    const api = JSON.parse(text((p) => p === "api.json") ?? '{ "exports": [] }');
    return { name: manifest.package.name, version: manifest.package.version, exports: api.exports };
  };
  const older = read(args[0]);
  const newer = read(args[1]);
  const removed = older.exports.filter((e) => !newer.exports.includes(e));
  const added = newer.exports.filter((e) => !older.exports.includes(e));
  const [o, n] = [older.version, newer.version].map((v) => v.split(/[.-]/).slice(0, 3).map(Number));
  // The place (0 major, 1 minor, 2 patch) the bump changed, and the place the changes need.
  const changed = n[0] !== o[0] ? 0 : n[1] !== o[1] ? 1 : 2;
  const zero = o[0] === 0 ? 1 : 0;
  const needed = Math.min(2, (removed.length > 0 ? 0 : added.length > 0 ? 1 : 2) + zero);
  if (changed > needed) {
    const place = ["major", "minor", "patch"][needed];
    for (const e of removed) process.stderr.write(`error: ${newer.name} ${newer.version} removes ${e}, so it needs a new ${place} version\n`);
    for (const e of added) process.stderr.write(`error: ${newer.name} ${newer.version} adds ${e}, so it needs a new ${place} version\n`);
    process.exit(1);
  }
  for (const e of removed) process.stdout.write(`removed: ${e}\n`);
  for (const e of added) process.stdout.write(`added: ${e}\n`);
  process.stdout.write(`${newer.name} ${newer.version} is a big enough bump from ${older.version}\n`);
  process.exit(0);
}

usage(`error: unknown command ${command}`);
