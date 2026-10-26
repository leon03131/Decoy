import fs from "node:fs";
import path from "node:path";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const LOCALES = path.resolve(__dirname, "src/locales");

/**
 * `virtual:languages`: the list of available languages ({ code, name, rtl }) read from src/locales at build time.
 * Importing the names from the JSON files themselves would pull every translation into the main bundle; this keeps
 * each language as its own lazily loaded chunk.
 */
function languagesPlugin(): Plugin {
  const id = "virtual:languages";
  const resolved = "\0" + id;
  const read = () =>
    fs
      .readdirSync(LOCALES)
      .filter((f) => f.endsWith(".json"))
      .map((f) => {
        const code = f.slice(0, -".json".length);
        const meta = JSON.parse(fs.readFileSync(path.join(LOCALES, f), "utf8").replace(/^﻿/, ""))._meta ?? {};
        return { code, name: meta.name ?? code, rtl: !!meta.rtl };
      });
  return {
    name: "decoy-languages",
    resolveId: (source) => (source === id ? resolved : undefined),
    load(loadId) {
      if (loadId !== resolved) return undefined;
      for (const f of fs.readdirSync(LOCALES)) this.addWatchFile(path.join(LOCALES, f));
      return `export default ${JSON.stringify(read())};`;
    },
  };
}

export default defineConfig({
  plugins: [react(), languagesPlugin()],
  clearScreen: false,
  // 127.0.0.1 on purpose: "localhost" can resolve to IPv6 (::1) only, which breaks on machines without IPv6
  server: { host: "127.0.0.1", port: 1420, strictPort: true },
  build: { target: "es2022", chunkSizeWarningLimit: 1200 },
});
