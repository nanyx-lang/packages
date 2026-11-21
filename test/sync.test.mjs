import { test } from "node:test";
import assert from "node:assert/strict";
import { compiler } from "../scripts/lib/compiler.mjs";
import { sha256, syncPackage as sync } from "../scripts/lib/sync.mjs";
import { fakeNanyx, makePackage, release } from "./helpers.mjs";

const syncPackage = (options) => sync({ compiler: compiler(fakeNanyx), ...options });

const registration = { name: "acme.web", repository: "https://github.com/acme/acme.web" };
const url = (tag, version) => `https://github.com/acme/acme.web/releases/download/${tag}/acme.web-${version}.nyxpkg`;

function downloads(files) {
  return async (u) => {
    if (!(u in files)) throw new Error(`unexpected download ${u}`);
    return files[u];
  };
}

test("a new release is recorded with its hash and its manifest's dependencies", async () => {
  const bytes = makePackage("acme.web", "1.2.0", { dependencies: [{ package: "acme.core", version: "2.1" }] });
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

test("a manifest naming another repository is reported and not recorded", async () => {
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0")]])],
    download: downloads({ [url("v1.0.0", "1.0.0")]: makePackage("acme.web", "1.0.0", { pkg: { repository: "https://github.com/evil/acme.web" } }) }),
  });
  assert.deepEqual(result.index.versions, []);
  assert.deepEqual(result.reports, [
    "acme.web 1.0.0 (release v1.0.0) isn't recorded: its manifest gives the repository https://github.com/evil/acme.web, but the package is registered with https://github.com/acme/acme.web",
  ]);
});

test("a manifest giving its repository as owner/name, as the compiler writes it, is the repository registered", async () => {
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0")]])],
    download: downloads({ [url("v1.0.0", "1.0.0")]: makePackage("acme.web", "1.0.0", { pkg: { repository: "acme/acme.web" } }) }),
  });
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.0.0"]);
  assert.deepEqual(result.reports, []);
});

test("a manifest giving another repository as owner/name is reported and not recorded", async () => {
  const result = await syncPackage({
    registration,
    index: null,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0")]])],
    download: downloads({ [url("v1.0.0", "1.0.0")]: makePackage("acme.web", "1.0.0", { pkg: { repository: "evil/acme.web" } }) }),
  });
  assert.deepEqual(result.index.versions, []);
  assert.equal(result.reports.length, 1);
});

// The release check. Each version is described by its exports, and an entry already in the index by its recorded hash.
const asset = (version, exports) => makePackage("acme.web", version, { exports });
const releaseOf = (version) => release(`v${version}`, [["acme.web-" + version + ".nyxpkg", url(`v${version}`, version)]]);

test("a first version isn't checked, and later ones in the same run are checked against the one before", async () => {
  const files = {
    [url("v1.0.0", "1.0.0")]: asset("1.0.0", ["a"]),
    [url("v1.1.0", "1.1.0")]: asset("1.1.0", ["a", "b"]),
    [url("v1.1.1", "1.1.1")]: asset("1.1.1", ["a"]),
  };
  const result = await syncPackage({
    registration,
    index: null,
    releases: [releaseOf("1.1.1"), releaseOf("1.1.0"), releaseOf("1.0.0")],
    download: downloads(files),
  });
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.0.0", "1.1.0"]);
  assert.deepEqual(result.reports, [
    "acme.web 1.1.1 (release v1.1.1) isn't recorded: it fails the release check against 1.1.0: acme.web 1.1.1 removes b, so it needs a new major version",
  ]);
});

test("a new version is checked against the newest recorded version below it that isn't yanked and is available", async () => {
  const older = asset("1.0.0", ["a"]);
  const index = {
    ...registration,
    versions: [
      recorded("1.0.0", sha256(older)),
      recorded("1.1.0", "b".repeat(64), { yanked: true }),
      recorded("1.2.0", "c".repeat(64), { available: false }),
      recorded("3.0.0", "d".repeat(64)),
    ],
  };
  const result = await syncPackage({
    registration,
    index,
    releases: [
      release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0"), "sha256:" + sha256(older)]]),
      release("v1.1.0", [["acme.web-1.1.0.nyxpkg", url("v1.1.0", "1.1.0"), "sha256:" + "b".repeat(64)]]),
      release("v3.0.0", [["acme.web-3.0.0.nyxpkg", url("v3.0.0", "3.0.0"), "sha256:" + "d".repeat(64)]]),
      releaseOf("1.3.0"),
    ],
    // 1.3.0 only adds to 1.0.0, so a minor bump is enough. 1.1.0's and 1.2.0's assets aren't downloaded at all.
    download: downloads({ [url("v1.0.0", "1.0.0")]: older, [url("v1.3.0", "1.3.0")]: asset("1.3.0", ["a", "c"]) }),
  });
  assert.deepEqual(result.reports, []);
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.0.0", "1.1.0", "1.2.0", "1.3.0", "3.0.0"]);
});

test("a new version isn't checked against an older one whose asset was replaced", async () => {
  const index = { ...registration, versions: [recorded("1.0.0", "a".repeat(64))] };
  const result = await syncPackage({
    registration,
    index,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0"), "sha256:" + "a".repeat(64)]]), releaseOf("1.0.1")],
    download: downloads({ [url("v1.0.0", "1.0.0")]: asset("1.0.0", []), [url("v1.0.1", "1.0.1")]: asset("1.0.1", []) }),
  });
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.0.0"]);
  assert.deepEqual(result.reports, [
    "acme.web 1.0.1 (release v1.0.1) isn't recorded: it can't be checked against 1.0.0: that version's asset no longer has its recorded SHA-256",
  ]);
});

test("a release check the compiler can't make is reported, saying why, and the version isn't recorded", async () => {
  const older = asset("1.0.0", []);
  const index = { ...registration, versions: [recorded("1.0.0", sha256(older))] };
  const failing = {
    readPackage: compiler(fakeNanyx).readPackage,
    apiCheck: () => ({ error: "nanyx api-check exited with 2: error: There is no file 'older.nyxpkg'" }),
  };
  const result = await sync({
    registration,
    index,
    releases: [release("v1.0.0", [["acme.web-1.0.0.nyxpkg", url("v1.0.0", "1.0.0"), "sha256:" + sha256(older)]]), releaseOf("1.0.1")],
    download: downloads({ [url("v1.0.0", "1.0.0")]: older, [url("v1.0.1", "1.0.1")]: asset("1.0.1", []) }),
    compiler: failing,
  });
  assert.deepEqual(result.index.versions.map((v) => v.version), ["1.0.0"]);
  assert.deepEqual(result.reports, [
    "acme.web 1.0.1 (release v1.0.1) isn't recorded: it can't be checked against 1.0.0: nanyx api-check exited with 2: error: There is no file 'older.nyxpkg'",
  ]);
});
