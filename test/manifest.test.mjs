import { test } from "node:test";
import assert from "node:assert/strict";
import { packageFiles, readManifestJson } from "../scripts/lib/manifest.mjs";
import { fixture, makeZip } from "./helpers.mjs";

test("the index's fields are read from the compiler's JSON for a manifest", () => {
  assert.deepEqual(readManifestJson(fixture("acme.web.json")), {
    name: "acme.web",
    version: "1.2.0",
    nanyx: "0.14",
    repository: "https://github.com/acme/acme.web",
    dependencies: { "acme.core": "^2.1", "acme.json": "1.0" },
    problems: [],
  });
});

test("a manifest without a compiler version, repository or dependencies gives null and none", () => {
  assert.deepEqual(readManifestJson(fixture("minimal.json")), {
    name: "acme.web",
    version: "0.1.0",
    nanyx: null,
    repository: null,
    dependencies: {},
    problems: [],
  });
});

test("a dependency found by its path or on GitHub can't be published", () => {
  assert.deepEqual(readManifestJson(fixture("unpublishable.json")).problems, [
    "the dependency acme.util doesn't come from the index, so the package can't be published",
    "the dependency acme.http doesn't come from the index, so the package can't be published",
    "the dependency retry doesn't come from the index, so the package can't be published",
  ]);
});

test("a manifest without a version, or with a field of the wrong kind, says so", () => {
  assert.deepEqual(readManifestJson({ package: { name: "acme.web" } }).problems, ["the manifest has no package.version"]);
  assert.deepEqual(readManifestJson({ package: { name: "acme.web", version: "1.0.0", nanyx: ["0.14"] } }).problems, [
    "the manifest's package.nanyx must be a string",
  ]);
});

test("the package's files are at the root of the archive or in its one folder", () => {
  const paths = (zip) => packageFiles(zip).files.map((f) => f.path).sort();
  assert.deepEqual(paths(makeZip({ "a.b.nyxp": "{}", "src/x.nyx": "" })), ["a.b.nyxp", "src/x.nyx"]);
  assert.deepEqual(paths(makeZip({ "a.b-1.0.0/a.b.nyxp": "{}", "a.b-1.0.0/src/x.nyx": "" })), ["a.b.nyxp", "src/x.nyx"]);
});

test("an archive without a manifest, that isn't a zip, or with paths outside its folder is refused", () => {
  assert.deepEqual(packageFiles(makeZip({ "src/x.nyx": "" })).problems, ["the asset has no .nyxp manifest at its root"]);
  assert.deepEqual(packageFiles(Buffer.from("hello")).problems, ["the asset isn't a zip of the package's sources: not a zip file"]);
  assert.deepEqual(packageFiles(makeZip({ "a.b.nyxp": "{}", "../evil.nyx": "" })).problems, ["the asset has paths outside its folder: ../evil.nyx"]);
});
