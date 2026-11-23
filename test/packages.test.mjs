import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packages } from "../src/lib/packages.mjs";

test("package listing keeps index order and selects the last available, listed version", (t) => {
  const root = mkdtempSync(join(tmpdir(), "nanyx-packages-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "index", "acme"), { recursive: true });
  const write = (name, versions) => writeFileSync(join(root, "index", "acme", `${name}.json`), JSON.stringify({
    name, repository: `https://github.com/acme/${name}`, versions,
  }));
  write("acme.z", [
    { version: "1.0.0", available: true, unlisted: false },
    { version: "2.0.0", available: true, unlisted: false },
    { version: "3.0.0", available: true, unlisted: true },
    { version: "3.1.0", available: true, yanked: true },
    { version: "4.0.0", available: false, unlisted: false },
  ]);
  write("acme.a", [{ version: "1.0.0", available: false, unlisted: false }]);
  assert.deepEqual(packages(root).map(({ path, latest }) => [path, latest]), [
    ["index/acme/acme.a.json", "none"],
    ["index/acme/acme.z.json", "2.0.0"],
  ]);
});
