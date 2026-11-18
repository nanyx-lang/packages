import { readJsonFiles } from "../../scripts/lib/registry.mjs";

export function packages(root) {
  return [...readJsonFiles(root, "index")]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([path, text]) => {
      const { name, repository, versions } = JSON.parse(text);
      return {
        path,
        name,
        repository,
        latest: versions.filter((version) => version.available && !version.yanked).at(-1)?.version ?? "none",
      };
    });
}
