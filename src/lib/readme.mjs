// What a package's page shows from GitHub, read when the site is built: its repository's description, from GitHub's API
// (with `$GITHUB_TOKEN`, if set), and its README at the release tag of its newest version, as sanitized HTML.

import MarkdownIt from "markdown-it";
import sanitizeHtml from "sanitize-html";

const API = "https://api.github.com";

async function get(path) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", "User-Agent": "nanyx-packages" };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(API + path, { headers, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${path}: ${response.status}`);
  return response.json();
}

const markdown = new MarkdownIt({ html: true, linkify: true });
const isAbsolute = (url) => /^[a-z][a-z0-9+.-]*:/i.test(url) || url.startsWith("//") || url.startsWith("#");

/**
 * `text`, the Markdown of the README at `path` in `owner/repo` at `tag`, as HTML that is safe to put in a page: only
 * the elements and attributes GitHub would show, with links and images relative to the README made absolute, to the
 * repository's files at that tag.
 */
export function renderReadme(text, { owner, repo, tag, path }) {
  const directory = path.includes("/") ? path.slice(0, path.lastIndexOf("/") + 1) : "";
  const resolve = (url, kind) => {
    if (!url || isAbsolute(url)) return url;
    const root = kind === "raw"
      ? `https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(tag)}/`
      : `https://github.com/${owner}/${repo}/blob/${encodeURIComponent(tag)}/`;
    return url.startsWith("/") ? new URL(url.slice(1), root).toString() : new URL(directory + url, root).toString();
  };
  return sanitizeHtml(markdown.render(text), {
    allowedTags: [...sanitizeHtml.defaults.allowedTags, "img", "h1", "h2", "details", "summary", "picture", "source", "del", "ins", "kbd", "sup", "sub"],
    allowedAttributes: {
      a: ["href", "title"],
      img: ["src", "alt", "title", "width", "height"],
      source: ["srcset", "media"],
      th: ["align"],
      td: ["align"],
      code: ["class"],
      ol: ["start"],
      details: ["open"],
    },
    allowedSchemes: ["http", "https", "mailto"],
    allowedClasses: { code: [/^language-[\w-]+$/] },
    transformTags: {
      a: (tagName, attribs) => ({ tagName, attribs: { ...attribs, href: resolve(attribs.href, "blob") } }),
      img: (tagName, attribs) => ({ tagName, attribs: { ...attribs, src: resolve(attribs.src, "raw") } }),
    },
  });
}

// The names a README is looked for under, at the root of the repository, in GitHub's order of preference.
const README_NAMES = ["README.md", "readme.md", "Readme.md", "README.markdown", "README"];

async function getText(url) {
  const response = await fetch(url, { headers: { "User-Agent": "nanyx-packages" }, signal: AbortSignal.timeout(20_000) });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET ${url}: ${response.status}`);
  return response.text();
}

/**
 * The README at the root of `owner/repo` at `tag`, as HTML (null if it has none), read from the repository's raw
 * files, which need no token; or, if it can't be read, why not, so the page can say so and the build goes on.
 */
export async function readReadme({ owner, repo, tag }) {
  try {
    for (const path of README_NAMES) {
      const text = await getText(`https://raw.githubusercontent.com/${owner}/${repo}/${encodeURIComponent(tag)}/${path}`);
      if (text !== null) return { readme: path.endsWith("README") ? `<pre>${escapeHtml(text)}</pre>` : renderReadme(text, { owner, repo, tag, path }), problem: null };
    }
    return { readme: null, problem: null };
  } catch (e) {
    console.warn(`Couldn't read the README of ${owner}/${repo} at ${tag}: ${e.message}`);
    return { readme: null, problem: e.message };
  }
}

const escapeHtml = (text) => text.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);

/** The description of `owner/repo` on GitHub, or null if it has none or GitHub's API can't be reached. */
export async function readDescription({ owner, repo }) {
  try {
    return (await get(`/repos/${owner}/${repo}`))?.description || null;
  } catch (e) {
    console.warn(`Couldn't read the description of ${owner}/${repo}: ${e.message}`);
    return null;
  }
}
