// The GitHub REST API calls the workflows make, with the workflow's token.

const API = "https://api.github.com";

function headers() {
  const h = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nanyx-packages" };
  if (process.env.GITHUB_TOKEN) h.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  return h;
}

async function get(path) {
  const response = await fetch(API + path, { headers: headers() });
  if (response.status === 404) return { status: 404, body: null, next: null };
  if (!response.ok) throw new Error(`GET ${path}: ${response.status} ${await response.text()}`);
  const next = /<([^>]+)>;\s*rel="next"/.exec(response.headers.get("link") ?? "")?.[1]?.slice(API.length) ?? null;
  return { status: response.status, body: await response.json(), next };
}

/** A repository, with its owner's current login and numeric ID, or null if it doesn't exist. */
export async function getRepository(owner, repo) {
  const { body } = await get(`/repos/${owner}/${repo}`);
  return body && { owner: body.owner.login, ownerId: body.owner.id, fullName: body.full_name, private: body.private };
}

/** Every published release of a repository, or null if the repository doesn't exist. */
export async function listReleases(owner, repo) {
  const releases = [];
  let path = `/repos/${owner}/${repo}/releases?per_page=100`;
  while (path) {
    const page = await get(path);
    if (page.status === 404) return null;
    releases.push(...page.body);
    path = page.next;
  }
  return releases.filter((r) => !r.draft);
}

/** The bytes at a URL, following redirects. */
export async function download(url) {
  const response = await fetch(url, { headers: { "User-Agent": "nanyx-packages" } });
  if (!response.ok) throw new Error(`${url}: ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}
