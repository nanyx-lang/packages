// Semantic versions, and the release tags that name them.

const VERSION = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/;

/** The version a release tag names (`v1.2.0` or `1.2.0`), or null if the tag isn't a version. */
export function versionOfTag(tag) {
  const version = tag.startsWith("v") ? tag.slice(1) : tag;
  return VERSION.test(version) ? version : null;
}

function compareIdentifiers(a, b) {
  const numeric = (s) => /^\d+$/.test(s);
  if (numeric(a) && numeric(b)) return Number(a) - Number(b);
  if (numeric(a)) return -1;
  if (numeric(b)) return 1;
  return a < b ? -1 : a > b ? 1 : 0;
}

/** Semantic version order: negative if `a` comes before `b`. */
export function compareVersions(a, b) {
  const [, ...pa] = VERSION.exec(a);
  const [, ...pb] = VERSION.exec(b);
  for (let i = 0; i < 3; i++) {
    const d = Number(pa[i]) - Number(pb[i]);
    if (d !== 0) return d;
  }
  // A pre-release comes before the release itself.
  if (pa[3] === undefined || pb[3] === undefined) return (pa[3] === undefined) - (pb[3] === undefined);
  const ia = pa[3].split(".");
  const ib = pb[3].split(".");
  for (let i = 0; i < Math.min(ia.length, ib.length); i++) {
    const d = compareIdentifiers(ia[i], ib[i]);
    if (d !== 0) return d;
  }
  return ia.length - ib.length;
}
