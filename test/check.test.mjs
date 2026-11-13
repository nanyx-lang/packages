import { test } from "node:test";
import assert from "node:assert/strict";
import { checkPullRequest } from "../scripts/lib/check.mjs";

const repositories = {
  "acme/acme.web": { owner: "acme", private: false },
  "Acme/acme.json": { owner: "Acme", private: false },
  "mallory/acme.http": { owner: "mallory", private: false },
  "acme/secret": { owner: "acme", private: true },
};
const getRepository = async (owner, repo) => repositories[`${owner}/${repo}`] ?? null;

const registration = (name, repository) => JSON.stringify({ name, repository });
const existing = new Map([["registry/acme/acme.web.json", registration("acme.web", "https://github.com/acme/acme.web")]]);

function check(head, { base = existing, baseIndex = new Map(), headIndex = baseIndex } = {}) {
  return checkPullRequest({
    base: { registry: base, index: baseIndex },
    head: { registry: new Map([...base, ...head]), index: headIndex },
    getRepository,
  });
}

test("a registration by the namespace's owner passes, whatever the case of the owner's name", async () => {
  assert.deepEqual(await check([["registry/acme/acme.json.json", registration("acme.json", "https://github.com/Acme/acme.json")]]), []);
});

test("a registration whose repository belongs to another account is refused, saying why", async () => {
  assert.deepEqual(await check([["registry/acme/acme.http.json", registration("acme.http", "https://github.com/mallory/acme.http")]]), [
    "registry/acme/acme.http.json: the namespace acme belongs to the GitHub account acme, but https://github.com/mallory/acme.http is owned by mallory",
  ]);
});

test("the nanyx namespace belongs to nanyx-lang", async () => {
  assert.deepEqual(await check([["registry/nanyx/nanyx.http.json", registration("nanyx.http", "https://github.com/acme/acme.web")]]), [
    "registry/nanyx/nanyx.http.json: the namespace nanyx belongs to the GitHub account nanyx-lang, but https://github.com/acme/acme.web is owned by acme",
  ]);
});

test("a name too like a registered one is refused", async () => {
  assert.deepEqual(await check([["registry/acme/acme.vveb.json", registration("acme.vveb", "https://github.com/acme/acme.web")]]), [
    "registry/acme/acme.vveb.json: acme.vveb is too like the registered package acme.web",
  ]);
});

test("changing an existing registration is refused", async () => {
  assert.deepEqual(await check([["registry/acme/acme.web.json", registration("acme.web", "https://github.com/acme/other")]]), [
    "registry/acme/acme.web.json: a registration can't be changed or removed by a pull request; ask a maintainer",
  ]);
});

test("a malformed registration, or one in the wrong place, is refused", async () => {
  assert.deepEqual(await check([["registry/acme/x.json", '{ "name": "acme.x", "repository": "https://github.com/acme/x", "owner": 1 }']]), [
    'registry/acme/x.json: a registration has only "name" and "repository", not "owner"',
  ]);
  assert.deepEqual(await check([["registry/acme/x.json", registration("acme.x", "https://github.com/acme/acme.web")]]), [
    "registry/acme/x.json: the registration of acme.x belongs at registry/acme/acme.x.json",
  ]);
  const [invalid, ...rest] = await check([["registry/acme/acme.x.json", "{"]]);
  assert.match(invalid, /^registry\/acme\/acme\.x\.json isn't valid JSON: /);
  assert.deepEqual(rest, []);
});

test("a private or missing repository is refused", async () => {
  assert.deepEqual(await check([["registry/acme/acme.secret.json", registration("acme.secret", "https://github.com/acme/secret")]]), [
    "registry/acme/acme.secret.json: the repository https://github.com/acme/secret is private",
  ]);
  assert.deepEqual(await check([["registry/acme/acme.gone.json", registration("acme.gone", "https://github.com/acme/gone")]]), [
    "registry/acme/acme.gone.json: the repository https://github.com/acme/gone can't be found",
  ]);
});

const index = (yanked, sha = "a") =>
  JSON.stringify({ name: "acme.web", repository: "https://github.com/acme/acme.web", versions: [{ version: "1.0.0", sha256: sha, yanked }] });

test("yanking a version passes", async () => {
  const path = "index/acme/acme.web.json";
  assert.deepEqual(await check([], { baseIndex: new Map([[path, index(false)]]), headIndex: new Map([[path, index(true)]]) }), []);
});

test("changing anything in an index file but yanked is refused", async () => {
  const path = "index/acme/acme.web.json";
  assert.deepEqual(await check([], { baseIndex: new Map([[path, index(false)]]), headIndex: new Map([[path, index(false, "b")]]) }), [
    'index/acme/acme.web.json: index files are written by the sync; a pull request may only change a version\'s "yanked"',
  ]);
  assert.deepEqual(await check([], { baseIndex: new Map(), headIndex: new Map([[path, index(false)]]) }), [
    "index/acme/acme.web.json: index files are written by the sync; a pull request can't add one",
  ]);
});
