import { defineConfig } from "astro/config";
import react from "@astrojs/react";
import { cpSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

export default defineConfig({
  site: "https://nanyx-lang.github.io",
  base: "/packages",
  outDir: "./_site",
  integrations: [
    react(),
    {
      name: "package-index",
      hooks: {
        "astro:build:done": ({ dir }) => {
          const out = fileURLToPath(dir);
          cpSync("config.json", `${out}/config.json`);
          if (existsSync("index")) cpSync("index", `${out}/index`, { recursive: true });
        },
      },
    },
  ],
});
