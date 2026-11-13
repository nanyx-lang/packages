import { test } from "node:test";
import assert from "node:assert/strict";
import { readManifest, readManifestFromArchive } from "../scripts/lib/manifest.mjs";
import { makeZip } from "./helpers.mjs";

test("a manifest's name, version, compiler version and dependencies are read", () => {
  const manifest = readManifest(`
# A comment
[package]
name = "acme.web" # trailing comment
version = "1.2.0"
nanyx = "0.14"
sources = [
  "src/**/*.nyx", # with a comment
]

[dependencies]
acme.core = "^2.1"
"acme.json" = { version = "1.0" }

[linters.default]
unused = "none"
`);
  assert.deepEqual(manifest, {
    name: "acme.web",
    version: "1.2.0",
    nanyx: "0.14",
    dependencies: { "acme.core": "^2.1", "acme.json": "1.0" },
    problems: [],
  });
});

test("a manifest without a version says so", () => {
  assert.deepEqual(readManifest('[package]\nname = "acme.web"\n').problems, ["the manifest has no [package] version"]);
});

test("a path dependency can't be published", () => {
  const { problems } = readManifest('[package]\nname = "a.b"\nversion = "1.0.0"\n[dependencies]\na.c = { path = "../c" }\n');
  assert.deepEqual(problems, ["the dependency a.c doesn't come from the index, so the package can't be published"]);
});

test("the manifest is found at the root of the archive or in its one folder", () => {
  const manifest = '[package]\nname = "a.b"\nversion = "1.0.0"\n';
  assert.equal(readManifestFromArchive(makeZip({ "a.b.nyxp": manifest, "src/x.nyx": "" })).name, "a.b");
  assert.equal(readManifestFromArchive(makeZip({ "a.b-1.0.0/a.b.nyxp": manifest })).version, "1.0.0");
});

test("an archive without a manifest, or that isn't a zip, is refused", () => {
  assert.deepEqual(readManifestFromArchive(makeZip({ "src/x.nyx": "" })).problems, ["the asset has no .nyxp manifest at its root"]);
  assert.deepEqual(readManifestFromArchive(Buffer.from("hello")).problems, ["the asset isn't a zip of the package's sources: not a zip file"]);
});
