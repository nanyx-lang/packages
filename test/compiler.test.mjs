import { test } from "node:test";
import assert from "node:assert/strict";
import { compiler } from "../scripts/lib/compiler.mjs";
import { fakeNanyx, makePackage, makeZip } from "./helpers.mjs";

const nanyx = compiler(fakeNanyx);
const version = (v, exports) => ({ version: v, bytes: makePackage("acme.web", v, { exports }) });

test("a package's manifest is read with `nanyx manifest --json`", () => {
  const bytes = makePackage("acme.web", "1.2.0", { pkg: { nanyx: "0.14" }, dependencies: [{ package: "acme.core", version: "^2.1" }] });
  assert.deepEqual(nanyx.readPackage(bytes), {
    name: "acme.web",
    version: "1.2.0",
    nanyx: "0.14",
    repository: null,
    dependencies: { "acme.core": "^2.1" },
    problems: [],
  });
});

test("a manifest the compiler refuses is reported with what it says", () => {
  const { problems } = nanyx.readPackage(makeZip({ "acme.web.nyxp": "(package = (name = " }));
  assert.deepEqual(problems, ["the compiler can't read its manifest: acme.web.nyxp(1,1): error NYX0021: Invalid manifest"]);
});

test("a big enough bump passes the release check", () => {
  assert.deepEqual(nanyx.apiCheck(version("1.0.0", ["a"]), version("1.1.0", ["a", "b"])), { passed: true });
});

test("a bump too small fails with the compiler's errors, without their prefix", () => {
  assert.deepEqual(nanyx.apiCheck(version("1.0.0", ["a", "b"]), version("1.1.0", ["a", "c"])), {
    passed: false,
    report: ["acme.web 1.1.0 removes b, so it needs a new major version", "acme.web 1.1.0 adds c, so it needs a new major version"],
  });
});

test("a release check that can't be made is an error", () => {
  const result = nanyx.apiCheck({ version: "1.0.0", bytes: Buffer.from("not a zip") }, version("1.1.0", []));
  assert.match(result.error, /^nanyx api-check exited with 2: error: older-1\.0\.0\.nyxpkg: the asset isn't a zip/);
});

test("a compiler that can't run is reported as a problem with the package", () => {
  const { problems } = compiler("/nonexistent/nanyx").readPackage(makePackage("acme.web", "1.0.0"));
  assert.match(problems[0], /^the compiler couldn't run: \/nonexistent\/nanyx: /);
});

test("a compiler that can't run during a release check is an error, not an exception", () => {
  const result = compiler("/nonexistent/nanyx").apiCheck(version("1.0.0", []), version("1.0.1", []));
  assert.match(result.error, /^the compiler couldn't run: \/nonexistent\/nanyx: /);
});
