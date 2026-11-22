import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonFiles } from "../scripts/lib/registry.mjs";
import { packages } from "../src/lib/packages.mjs";

test("Pages output preserves the registry and serves the site from the root of its domain", () => {
  const root = process.cwd();
  const output = join(root, "_site");
  assert.deepEqual(readFileSync(join(output, "config.json")), readFileSync(join(root, "config.json")));
  const source = readJsonFiles(root, "index");
  assert.deepEqual(readJsonFiles(output, "index"), source);
  const html = readFileSync(join(output, "index.html"), "utf8");
  assert.match(html, /href="\/nanyx\.svg"/);
  assert.ok(existsSync(join(output, "nanyx.svg")));
  const stylesheet = html.match(/href="(\/_astro\/[^"]+\.css)"/);
  assert.ok(stylesheet, "the generated stylesheet must be at the root");
  assert.ok(existsSync(join(output, stylesheet[1].slice(1))));
  for (const entry of packages(root)) {
    assert.ok(html.includes(`href="/${entry.path}"`));
    assert.ok(html.includes(entry.name));
    assert.ok(html.includes(entry.latest));
  }
});
