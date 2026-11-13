import { test } from "node:test";
import assert from "node:assert/strict";
import { sha256, syncPackage } from "../scripts/lib/sync.mjs";
import { makePackage, release } from "./helpers.mjs";

const registration = { name: "acme.web", repository: "https://github.com/acme/acme.web" };
const url = (tag, version) => `https://github.com/acme/acme.web/releases/download/${tag}/acme.web-${version}.nyxpkg`;

function downloads(files) {
  return async (u) => {
    if (!(u in files)) throw new Error(`unexpected download ${u}`);
    return files[u];
  };
}

test("a new release is recorded with its hash and its manifest's dependencies", async () => {
  const bytes = makePackage("acme.web", "1.2.0", '[dependencies]\nacme.core = "2.1"\n');
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("v1.2.0", [["acme.web-1.2.0.nyxpkg", url("v1.2.0", "1.2.0")]]), release("nightly", [])],
    download: downloads({ [url("v1.2.0", "1.2.0")]: bytes }),
  });
  assert.deepEqual(result.reports, []);
  assert.equal(result.changed, true);
  assert.deepEqual(result.index, {
    name: "acme.web",
    repository: "https://github.com/acme/acme.web",
    versions: [
      {
        version: "1.2.0",
        url: url("v1.2.0", "1.2.0"),
        sha256: sha256(bytes),
        nanyx: null,
        dependencies: { "acme.core": "2.1" },
        yanked: false,
        available: true,
      },
    ],
  });
});

test("a release without the package's asset is skipped", async () => {
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("v1.0.0", [["something-else.zip", "https://example.com/x"]])],
    download: downloads({}),
  });
  assert.deepEqual(result.index.versions, []);
  assert.deepEqual(result.reports, []);
});

test("a release whose manifest names another version is reported and not recorded", async () => {
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("1.0.0", [["acme.web-1.0.0.nyxpkg", url("1.0.0", "1.0.0")]])],
    download: downloads({ [url("1.0.0", "1.0.0")]: makePackage("acme.web", "0.9.0") }),
  });
  assert.deepEqual(result.index.versions, []);
  assert.deepEqual(result.reports, ["acme.web 1.0.0 (release 1.0.0) isn't recorded: its manifest gives the version 0.9.0"]);
});

const recorded = (version, sha, extra = {}) => ({
  version,
  url: url(`v${version}`, version),
  sha256: sha,
  nanyx: null,
  dependencies: {},
  yanked: false,
  available: true,
  ...extra,
});

test("a replaced asset is reported and the recorded hash is kept", async () => {
  const index = { ...registration, versions: [recorded("1.0.0", "a".repeat(64))] };
  const result = await syncPackage({
    registration,
    index,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0"), "sha256:" + "b".repeat(64)]])],
    download: downloads({}),
  });
  assert.equal(result.changed, false);
  assert.equal(result.index.versions[0].sha256, "a".repeat(64));
  assert.deepEqual(result.reports, [
    `acme.web 1.0.0: the asset was replaced (its SHA-256 is now ${"b".repeat(64)}); the index keeps ${"a".repeat(64)}`,
  ]);
});

test("without a digest from GitHub, the asset is downloaded to compare its hash", async () => {
  const bytes = makePackage("acme.web", "1.0.0");
  const index = { ...registration, versions: [recorded("1.0.0", sha256(bytes))] };
  const result = await syncPackage({
    registration,
    index,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0")]])],
    download: downloads({ [url("v1.0.0", "1.0.0")]: bytes }),
  });
  assert.deepEqual(result.reports, []);
  assert.equal(result.changed, false);
});

test("a version whose release is gone is kept, marked unavailable, and comes back with its release", async () => {
  const index = { ...registration, versions: [recorded("1.0.0", "a".repeat(64), { yanked: true })] };
  const gone = await syncPackage({ registration, index, releases: [], download: downloads({}) });
  assert.deepEqual(gone.index.versions, [recorded("1.0.0", "a".repeat(64), { yanked: true, available: false })]);
  assert.deepEqual(gone.reports, ["acme.web 1.0.0: the release or its asset is gone, so the version is marked unavailable"]);

  const back = await syncPackage({
    registration,
    index: gone.index,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0"), "sha256:" + "a".repeat(64)]])],
    download: downloads({}),
  });
  assert.deepEqual(back.index.versions, [recorded("1.0.0", "a".repeat(64), { yanked: true })]);
  assert.deepEqual(back.reports, ["acme.web 1.0.0 is available again"]);
});

test("a repository that can't be found is reported and its versions kept", async () => {
  const index = { ...registration, versions: [recorded("1.0.0", "a".repeat(64))] };
  const result = await syncPackage({ registration, index, releases: null, download: downloads({}) });
  assert.equal(result.index.versions[0].available, false);
  assert.equal(result.reports[0], "acme.web: the repository https://github.com/acme/acme.web can't be found");
});

test("versions are kept in semantic version order", async () => {
  const index = { ...registration, versions: [recorded("1.10.0", "a".repeat(64))] };
  const bytes = makePackage("acme.web", "1.9.0");
  const result = await syncPackage({
    registration,
    index,
    releases: [
      release("v1.10.0", [["acme.web-1.10.0.nyxpkg", url("v1.10.0", "1.10.0"), "sha256:" + "a".repeat(64)]]),
      release("v1.9.0", [["acme.web-1.9.0.nyxpkg", url("v1.9.0", "1.9.0")]]),
    ],
    download: downloads({ [url("v1.9.0", "1.9.0")]: bytes }),
  });
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.9.0", "1.10.0"]);
});
