import { test } from "node:test";
import assert from "node:assert/strict";
import { confusableWith, nameProblems, ownerOfNamespace, parseRepository } from "../scripts/lib/names.mjs";
import { compareVersions, versionOfTag } from "../scripts/lib/versions.mjs";

test("a dotted lower-case name is well formed", () => {
  assert.deepEqual(nameProblems("acme.web"), []);
  assert.deepEqual(nameProblems("acme.web_tools.http"), []);
});

test("a name without a namespace is refused", () => {
  assert.deepEqual(nameProblems("json"), ['"json" needs a namespace: a published package\'s name has at least two parts, as in acme.web']);
});

test("a name with capitals or hyphens is refused", () => {
  assert.match(nameProblems("Acme.web")[0], /must be lower case/);
  assert.match(nameProblems("acme.web-tools")[0], /must be lower case/);
});

test("nanyx belongs to nanyx-lang, and other namespaces to the account of that name", () => {
  assert.equal(ownerOfNamespace("nanyx"), "nanyx-lang");
  assert.equal(ownerOfNamespace("acme"), "acme");
});

test("names differing in underscores or look-alike characters are confusable", () => {
  assert.equal(confusableWith("acme.web_tools", ["acme.webtools"]), "acme.webtools");
  assert.equal(confusableWith("acme.modern", ["acme.rnodern"]), "acme.rnodern");
  assert.equal(confusableWith("acme.l0g", ["acme.log"]), "acme.log");
  assert.equal(confusableWith("acme.web", ["acme.web", "acme.http"]), undefined);
});

test("a repository address is a github.com owner and repository", () => {
  assert.deepEqual(parseRepository("https://github.com/acme/acme.web"), { owner: "acme", repo: "acme.web" });
  assert.equal(parseRepository("https://github.com/acme/acme.web/"), null);
  assert.equal(parseRepository("https://gitlab.com/acme/web"), null);
});

test("a tag names a version with or without a v", () => {
  assert.equal(versionOfTag("v1.2.0"), "1.2.0");
  assert.equal(versionOfTag("1.2.0-beta.1"), "1.2.0-beta.1");
  assert.equal(versionOfTag("release-1"), null);
  assert.equal(versionOfTag("v1.2"), null);
});

test("versions sort as semantic versions", () => {
  const sorted = ["1.10.0", "1.2.0", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0-alpha", "0.9.9"].sort(compareVersions);
  assert.deepEqual(sorted, ["0.9.9", "1.2.0-alpha", "1.2.0-beta.2", "1.2.0-beta.10", "1.2.0", "1.10.0"]);
});
