// Builds the static site Pages serves: `node scripts/build-site.mjs <folder>`.

import { cpSync, existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonFiles } from "./lib/registry.mjs";

const out = process.argv[2];
if (!out) throw new Error("usage: build-site.mjs <folder>");
mkdirSync(out, { recursive: true });
cpSync("config.json", join(out, "config.json"));
if (existsSync("index")) cpSync("index", join(out, "index"), { recursive: true });

const escape = (s) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const rows = [...readJsonFiles(process.cwd(), "index")]
  .sort(([a], [b]) => (a < b ? -1 : 1))
  .map(([path, text]) => {
    const { name, repository, versions } = JSON.parse(text);
    const latest = versions.filter((v) => v.available && !v.yanked).at(-1)?.version ?? "none";
    return `<tr><td><a href="${escape(path)}">${escape(name)}</a></td><td>${escape(latest)}</td><td><a href="${escape(repository)}">${escape(repository)}</a></td></tr>`;
  });

writeFileSync(
  join(out, "index.html"),
  `<!doctype html>
<html lang="en">
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Nanyx packages</title>
<style>body{font-family:system-ui,sans-serif;max-width:60rem;margin:2rem auto;padding:0 1rem}td,th{text-align:left;padding:.25rem 1rem .25rem 0}</style>
<h1>Nanyx packages</h1>
<p>The package index for <a href="https://github.com/nanyx-lang/nanyx">Nanyx</a>. Its format and how to register a package are described in <a href="https://github.com/nanyx-lang/packages#readme">the repository's README</a>.</p>
<table>
<tr><th>Package</th><th>Latest version</th><th>Repository</th></tr>
${rows.join("\n")}
</table>
`,
);
