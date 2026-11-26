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
    assert.ok(html.includes(`href="/${entry.page}"`));
    assert.ok(html.includes(entry.name));
    assert.ok(html.includes(entry.latest));
  }
});

test("each package has a page with its versions, downloads, installation and index file", () => {
  const root = process.cwd();
  const entries = packages(root);
  assert.ok(entries.length > 0);
  for (const entry of entries) {
    const file = join(root, "_site", entry.page, "index.html");
    assert.ok(existsSync(file), `${entry.page} must be built`);
    const html = readFileSync(file, "utf8");
    assert.ok(html.includes(`<h1`) && html.includes(entry.name));
    assert.ok(html.includes(`href="/${entry.path}"`), "the page links to the index file");
    assert.ok(html.includes(`href="${entry.repository}"`), "the page links to the repository");
    assert.ok(html.includes(`nanyx install ${entry.name}`));
    const shown = entry.versions.find((version) => version.latest) ?? entry.versions[0];
    assert.ok(html.includes(`::install ${entry.name} ${shown.version}`));
    for (const version of entry.versions) {
      assert.ok(html.includes(`>${version.version}<`), `${entry.name} ${version.version} is listed`);
      if (version.available) assert.ok(html.includes(`href="${version.url}"`), `${entry.name} ${version.version} can be downloaded`);
    }
    assert.ok(!/yanked/i.test(html), "versions are shown as unlisted, not yanked");
    assert.ok(!/<script(?![^>]*type="module")[^>]*src=/.test(html.split('class="readme')[1] ?? ""), "README HTML has no scripts");
  }
});
