// Running the Nanyx compiler on package assets: `nanyx manifest --json` to read a manifest, and `nanyx api-check` to
// check that a new version is a big enough bump from an older one.

import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { packageFiles, readManifestJson } from "./manifest.mjs";

// The compiler's own errors start with this; the report is the lines without it.
const ERROR_PREFIX = "error: ";

function run(nanyx, args) {
  const result = spawnSync(nanyx, args, { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  if (result.error) throw new Error(`${nanyx}: ${result.error.message}`);
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

const lines = (text) =>
  text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line !== "");

function withTemporaryDirectory(action) {
  const directory = mkdtempSync(join(tmpdir(), "nanyx-packages-"));
  try {
    return action(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/** The compiler at the path `nanyx`, as the sync uses it. */
export function compiler(nanyx) {
  return {
    /** The index's fields from the manifest in a package asset (see `readManifestJson`), or `{ problems }`. */
    readPackage(bytes) {
      const unpacked = packageFiles(bytes);
      if (unpacked.problems) return unpacked;
      return withTemporaryDirectory((directory) => {
        const folder = join(directory, "package");
        for (const file of unpacked.files) {
          const target = join(folder, file.path);
          mkdirSync(dirname(target), { recursive: true });
          writeFileSync(target, file.read());
        }
        let result;
        try {
          result = run(nanyx, ["manifest", "--json", folder]);
        } catch (e) {
          return { problems: [`the compiler couldn't run: ${e.message}`] };
        }
        const { status, stdout, stderr } = result;
        if (status !== 0)
          return { problems: [`the compiler can't read its manifest: ${lines(stderr.split(folder + "/").join("")).join("; ")}`] };
        try {
          return readManifestJson(stdout);
        } catch (e) {
          return { problems: [`the compiler's JSON for its manifest can't be read: ${e.message}`] };
        }
      });
    },

    /**
     * Whether the asset `newer` is a big enough bump from `older`: `{ passed: true }`, `{ passed: false, report }` with
     * the lines saying what to fix, or `{ error }` if the check couldn't be made.
     */
    apiCheck(older, newer) {
      return withTemporaryDirectory((directory) => {
        const olderPath = join(directory, `older-${older.version}.nyxpkg`);
        const newerPath = join(directory, `newer-${newer.version}.nyxpkg`);
        writeFileSync(olderPath, older.bytes);
        writeFileSync(newerPath, newer.bytes);
        let result;
        try {
          result = run(nanyx, ["api-check", olderPath, newerPath]);
        } catch (e) {
          return { error: `the compiler couldn't run: ${e.message}` };
        }
        const { status, stderr } = result;
        const errors = lines(stderr).map((line) => line.split(directory + "/").join(""));
        if (status === 0) return { passed: true };
        if (status === 1) {
          const report = errors.filter((line) => line.startsWith(ERROR_PREFIX)).map((line) => line.slice(ERROR_PREFIX.length));
          return { passed: false, report: report.length > 0 ? report : errors };
        }
        return { error: `nanyx api-check exited with ${status ?? "a signal"}${errors.length > 0 ? `: ${errors.join("; ")}` : ""}` };
      });
    },
  };
}
