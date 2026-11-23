# The Nanyx package index

This repository is the index of published [Nanyx](https://github.com/nanyx-lang/nanyx) packages. It is served as
static files at **https://packages.nanyx.dev/**, and a client only ever reads those files over HTTPS.

The index stores no packages. A package's versions are the releases of its own GitHub repository, and the index
records, for each version, where its asset is and its SHA-256. Registering a package is a pull request here;
after that, every release the package makes is picked up by a workflow that runs every hour.

The design is on the [Packaging](https://github.com/nanyx-lang/nanyx/blob/main/docs/src/content/work-in-progress/packaging.md)
page of the Nanyx docs.

## The format

The format is versioned. This README describes **format 1**.

### `config.json`

```json
{
  "format": 1,
  "index": "https://packages.nanyx.dev/index/"
}
```

A client reads `config.json` first. `format` is the format version, and a client refuses a format it doesn't know.
`index` is where the index files are. A client builds every other address from it, so the index can move by changing
`config.json` and leaving a redirect. It moved from `https://nanyx-lang.github.io/packages/` this way: GitHub Pages
redirects the old addresses to `packages.nanyx.dev`.

### Index files

Each package has one file, at `<index><namespace>/<name>.json`, where the namespace is the first part of the name:
`acme.web` is at `https://packages.nanyx.dev/index/acme/acme.web.json`.

```json
{
  "name": "acme.web",
  "repository": "https://github.com/acme/acme.web",
  "versions": [
    {
      "version": "1.2.0",
      "url": "https://github.com/acme/acme.web/releases/download/v1.2.0/acme.web-1.2.0.nyxpkg",
      "sha256": "9f2c41…",
      "nanyx": "0.14",
      "dependencies": { "acme.core": "^2.1" },
      "yanked": false,
      "available": true
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `name` | The package's name. |
| `repository` | The GitHub repository whose releases are the package's versions. |
| `versions` | Every version ever recorded, oldest first in semantic version order. A version is never removed. |
| `version` | A semantic version: `1.2.0` or `1.2.0-beta.1`. |
| `url` | Where the version's asset is downloaded from. |
| `sha256` | The asset's SHA-256, in hex, as it was when the version was first recorded. It never changes. |
| `nanyx` | The oldest compiler the version builds with, from its manifest's `package.nanyx`, or `null` if it gives none. |
| `dependencies` | Its manifest's `dependencies`, each `(package = …, version = …)`: package name to version requirement. |
| `yanked` | `true` once the version has been yanked. New resolutions don't pick a yanked version, but a lockfile that names it still installs it. |
| `available` | `false` while the version's release or asset is missing from GitHub. |

A client checks the hash of everything it downloads against `sha256`, and refuses it if they differ.

## Releasing a version

A version is a release of the package's repository that has:

- a tag naming the version: `v1.2.0` or `1.2.0`. Other tags are ignored.
- an asset named `<name>-<version>.nyxpkg`, such as `acme.web-1.2.0.nyxpkg`. Releases without it are ignored.

Make the asset with `nanyx pack`, which writes `<name>-<version>.nyxpkg`: a zip of the package's `.nyxp` manifest,
its sources and its `api.json`, the API its public modules export. From the package's folder, for example:

```sh
nanyx pack
gh release create v1.2.0 acme.web-1.2.0.nyxpkg
```

The sync reads the manifest with the compiler (`nanyx manifest --json`), so any manifest the compiler accepts can be
read. A release is reported, and not recorded, if:

- the manifest's `package.name` and `package.version` don't match the release.
- its `package.repository`, if it gives one, isn't the repository the package is registered with. The manifest
  writes it as `owner/name`, `nanyx-lang/json`, and it is compared with the registration's address without regard to
  case.
- it has a dependency found by its `path` or on GitHub: only dependencies from the index can be published.
- it fails the release check.

### The release check

Versions are semantic, and the index enforces it. When a new version has a recorded version below it, the sync runs
`nanyx api-check <older.nyxpkg> <newer.nyxpkg>`, where the older one is the newest recorded version below the new one
that isn't yanked and is available. The compiler compares the two `api.json` files and refuses the new version if its
number is too small for the changes: removing or changing something needs a new major version, adding something a
new minor version (one place lower before `1.0.0`). A version that fails isn't recorded, and the report says what to
fix. A package's first version isn't checked.

Versions found in the same run are checked in order, each against the one before it. The older asset is downloaded
again for the check. A version can't be checked if that asset no longer has its recorded SHA-256, if `api-check`
exits with a usage error, or if the compiler can't run: it is reported, saying which, isn't recorded, and is tried
again on the next run.

Draft releases are ignored. Pre-releases are recorded like any other release.

**A version can't be changed.** Its hash is recorded the first time the sync sees it. If the asset is replaced, the
index keeps the old hash, so clients refuse the new asset, and the sync reports the mismatch. To fix a release,
publish a new version.

## Registering a package

Open a pull request that adds `registry/<namespace>/<name>.json`:

```json
{ "name": "acme.web", "repository": "https://github.com/acme/acme.web" }
```

The pull request's checks refuse it, saying why, if:

- the name isn't lower case words separated by dots, or has only one part (`json` can't be registered; `acme.json`
  can).
- the name is already registered, or differs from a registered name only in `_` or in characters that look alike
  (`rn` and `m`, `0` and `o`, `1`, `i` and `l`, and so on).
- the repository doesn't exist, is private, or isn't owned by the namespace's owner. A namespace belongs to the
  GitHub user or organisation of the same name, in lower case: `acme.web` must be in a repository owned by `acme`.
  The `nanyx` namespace belongs to `nanyx-lang`.

A maintainer reviews and merges registrations by hand. Once one is merged, the sync runs and records the package's
existing releases. A registration can't be changed or removed by a pull request; ask a maintainer.

### Removing a package

Only a maintainer removes a package, and only one that nothing should depend on, such as a test: once it is gone,
the index no longer lists its versions, so a lockfile that names one of them can't install it, and its name can be
registered again. Remove the registration and the index file, `registry/<namespace>/<name>.json` and
`index/<namespace>/<name>.json`, in the same pull request. The checks refuse it, as they refuse any removal, so the
maintainer merges it over them. Both files go together: the sync only reads registrations and never deletes an index
file, so an index file left behind stays listed, unchanged, while an index file removed with its registration kept is
written again on the next run from the releases as they are then, with their hashes taken afresh.

## Yanking a version

Open a pull request that changes the version's `"yanked"` to `true` in its index file. The checks refuse a pull
request that changes anything else in an index file. Unyanking is the same change back.

## The workflows

- **Check** runs on every pull request: the scripts' tests, then `scripts/check-pull-request.mjs`, which checks
  added registrations and changes to index files.
- **Sync** runs every hour, on every push to `main`, and by hand (Actions → Sync → Run workflow). For every
  registered package it reads the repository's releases, downloads each new version's asset, records its hash
  and its manifest's fields, checks the release, and commits the changed index files to `main` with the workflow's own
  token. Then it publishes the site to Pages. It reads manifests and checks releases with the latest compiler
  release (`compiler/<version>` in nanyx-lang/nanyx, its `linux-x64` archive), downloaded once per run; the run's log
  and summary say which version. Problems (a replaced asset, a release that has gone, a manifest that doesn't match,
  a failed release check) are shown as warnings in the run's summary. A version whose release has gone is marked `"available": false`,
  and back to `true` if the release returns; it is never removed.

GitHub disables scheduled workflows in a repository with no activity for 60 days. If the index stops updating,
enable Sync again on the Actions tab and run it by hand.

The registry scripts use only Node's own modules. The site uses Astro, React and Tailwind, with the same theme as
the Nanyx docs. Use Node 22.23.4 or newer, run `npm ci`, then `npm run dev` for local development. `npm run build` writes the Pages site to
`_site`, including unchanged copies of `config.json` and `index/`, to be served at the root of `packages.nanyx.dev`. Run the registry
tests with `npm test`; they run a fake compiler, `test/fake-nanyx/nanyx`, and need neither the network nor a real one.
Run the built-site checks with `npm run build && npm run test:site`.
