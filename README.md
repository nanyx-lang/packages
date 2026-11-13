# The Nanyx package index

This repository is the index of published [Nanyx](https://github.com/nanyx-lang/nanyx) packages. It is served as
static files at **https://nanyx-lang.github.io/packages/**, and a client only ever reads those files over HTTPS.

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
  "index": "https://nanyx-lang.github.io/packages/index/"
}
```

A client reads `config.json` first. `format` is the format version, and a client refuses a format it doesn't know.
`index` is where the index files are. A client builds every other address from it, so the index can move (to
`packages.nanyx.dev`, say) by changing `config.json` and leaving a redirect.

### Index files

Each package has one file, at `<index><namespace>/<name>.json`, where the namespace is the first part of the name:
`acme.web` is at `https://nanyx-lang.github.io/packages/index/acme/acme.web.json`.

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
| `nanyx` | The oldest compiler the version builds with, from its manifest's `[package] nanyx`, or `null` if it gives none. |
| `dependencies` | Its manifest's `[dependencies]`: package name to version requirement. |
| `yanked` | `true` once the version has been yanked. New resolutions don't pick a yanked version, but a lockfile that names it still installs it. |
| `available` | `false` while the version's release or asset is missing from GitHub. |

A client checks the hash of everything it downloads against `sha256`, and refuses it if they differ.

## Releasing a version

A version is a release of the package's repository that has:

- a tag naming the version: `v1.2.0` or `1.2.0`. Other tags are ignored.
- an asset named `<name>-<version>.nyxpkg`, such as `acme.web-1.2.0.nyxpkg`. Releases without it are ignored.

Until the `.nyxpkg` format is settled ([nanyx-lang/nanyx#863](https://github.com/nanyx-lang/nanyx/issues/863)),
the asset is a **zip of the package's sources**, with the package's `.nyxp` manifest at the zip's root or inside its
one top-level folder. The manifest's `name` and `version` must match the release; a release that doesn't is
reported and not recorded. From the package's folder, for example:

```sh
tar --format zip -cf acme.web-1.2.0.nyxpkg acme.web.nyxp src
gh release create v1.2.0 acme.web-1.2.0.nyxpkg
```

(`tar -a` chooses the format from the file's extension, and doesn't know `.nyxpkg`, so name the format.)

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

## Yanking a version

Open a pull request that changes the version's `"yanked"` to `true` in its index file. The checks refuse a pull
request that changes anything else in an index file. Unyanking is the same change back.

## The workflows

- **Check** runs on every pull request: the scripts' tests, then `scripts/check-pull-request.mjs`, which checks
  added registrations and changes to index files.
- **Sync** runs every hour, on every push to `main`, and by hand (Actions → Sync → Run workflow). For every
  registered package it reads the repository's releases, downloads each new version's asset, records its hash
  and its manifest's fields, and commits the changed index files to `main` with the workflow's own token. Then it
  publishes the site to Pages. Problems (a replaced asset, a release that has gone, a manifest that doesn't match)
  are shown as warnings in the run's summary. A version whose release has gone is marked `"available": false`,
  and back to `true` if the release returns; it is never removed.

GitHub disables scheduled workflows in a repository with no activity for 60 days. If the index stops updating,
enable Sync again on the Actions tab and run it by hand.

The scripts use only Node's own modules. Run their tests with `npm test`.
