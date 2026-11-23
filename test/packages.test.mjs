import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { packages, tagOf } from "../src/lib/packages.mjs";
import { renderReadme } from "../src/lib/readme.mjs";

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

test("a package's versions are listed newest first, each marked, with its asset's address made absolute", (t) => {
  const root = mkdtempSync(join(tmpdir(), "nanyx-packages-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "index", "acme"), { recursive: true });
  writeFileSync(join(root, "index", "acme", "acme.web.json"), JSON.stringify({
    name: "acme.web",
    repository: "https://github.com/acme/acme.web",
    versions: [
      { version: "1.0.0", url: "https://github.com/acme/acme.web/releases/download/v1.0.0/acme.web-1.0.0.nyxpkg", available: true, unlisted: false },
      { version: "1.1.0", url: "../files/acme.web-1.1.0.nyxpkg", available: true, unlisted: false },
      { version: "1.2.0", url: "https://github.com/acme/acme.web/releases/download/1.2.0/acme.web-1.2.0.nyxpkg", available: true, unlisted: true },
      { version: "2.0.0-beta.1", url: "https://github.com/acme/acme.web/releases/download/v2.0.0-beta.1/acme.web-2.0.0-beta.1.nyxpkg", available: false, unlisted: false },
    ],
  }));
  const [entry] = packages(root);
  assert.equal(entry.page, "packages/acme.web/");
  assert.deepEqual(entry.github, { owner: "acme", repo: "acme.web" });
  assert.deepEqual(
    entry.versions.map(({ version, latest, unlisted, available, prerelease }) => [version, latest, unlisted, available, prerelease]),
    [
      ["2.0.0-beta.1", false, false, false, true],
      ["1.2.0", false, true, true, false],
      ["1.1.0", true, false, true, false],
      ["1.0.0", false, false, true, false],
    ],
  );
  assert.equal(entry.versions[2].url, "https://packages.nanyx.dev/index/files/acme.web-1.1.0.nyxpkg");
  assert.equal(tagOf(entry.versions[1]), "1.2.0");
  assert.equal(tagOf(entry.versions[3]), "v1.0.0");
  assert.equal(tagOf(entry.versions[2]), "v1.1.0");
});

test("a README is rendered without scripts or handlers, with relative links and images in the repository at the tag", () => {
  const html = renderReadme(
    [
      "# acme.web",
      "",
      "See [the guide](docs/guide.md), [the licence](/LICENSE) and [a section](#usage).",
      "",
      "![logo](images/logo.png) <img src=\"./x.svg\" onerror=\"alert(1)\">",
      "",
      "<script>alert(1)</script>",
      "",
      "[bad](javascript:alert(1)) <a href=\"javascript:alert(1)\">bad</a>",
      "",
      "```nanyx",
      "def x = 1",
      "```",
    ].join("\n"),
    { owner: "acme", repo: "acme.web", tag: "v1.0.0", path: "README.md" },
  );
  assert.match(html, /<h1>acme\.web<\/h1>/);
  assert.ok(html.includes('href="https://github.com/acme/acme.web/blob/v1.0.0/docs/guide.md"'));
  assert.ok(html.includes('href="https://github.com/acme/acme.web/blob/v1.0.0/LICENSE"'));
  assert.ok(html.includes('href="#usage"'));
  assert.ok(html.includes('src="https://raw.githubusercontent.com/acme/acme.web/v1.0.0/images/logo.png"'));
  assert.ok(html.includes('src="https://raw.githubusercontent.com/acme/acme.web/v1.0.0/x.svg"'));
  assert.ok(html.includes('<code class="language-nanyx">'));
  assert.doesNotMatch(html, /<script|onerror|href="javascript:/i);
});
