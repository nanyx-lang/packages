import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { readJsonFiles } from "../scripts/lib/registry.mjs";
import { packages } from "../src/lib/packages.mjs";

test("Pages output preserves the registry and uses base-prefixed site assets and links", () => {
  const root = process.cwd();
  const output = join(root, "_site");
  assert.deepEqual(readFileSync(join(output, "config.json")), readFileSync(join(root, "config.json")));
  const source = readJsonFiles(root, "index");
  assert.deepEqual(readJsonFiles(output, "index"), source);
  const html = readFileSync(join(output, "index.html"), "utf8");
  assert.match(html, /href="\/packages\/nanyx\.svg"/);
  assert.ok(existsSync(join(output, "nanyx.svg")));
  const stylesheet = html.match(/href="(\/packages\/_astro\/[^"]+\.css)"/);
  assert.ok(stylesheet, "the generated stylesheet must use the Pages base");
  assert.ok(existsSync(join(output, stylesheet[1].slice("/packages/".length))));
  for (const entry of packages(root)) {
    assert.ok(html.includes(`href="/packages/${entry.path}"`));
    assert.ok(html.includes(entry.name));
    assert.ok(html.includes(entry.latest));
  }
});
