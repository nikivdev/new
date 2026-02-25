import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { existsSync } from "node:fs"
import tailwindcss from "@tailwindcss/vite"
import { tanstackStart } from "@tanstack/react-start/plugin/vite"
import react from "@vitejs/plugin-react"
import { nitro } from "nitro/vite"
import { defineConfig } from "vite"
import tsConfigPaths from "vite-tsconfig-paths"
import wasm from "vite-plugin-wasm"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")
const jazz2Root = "/Users/nikiv/code/org/1f/jazz"
const jazz2Packages = resolve(jazz2Root, "packages")
const hasLocalJazz = existsSync(jazz2Packages)
const nitroPreset = process.env.NITRO_PRESET || "bun"

export default defineConfig(({ ssrBuild }) => ({
  server: {
    allowedHosts: true,
    fs: {
      allow: [__dirname, repoRoot, jazz2Root],
    },
  },
  build: {
    // Allow native top-level await output (avoids extra transforms).
    target: "esnext",
  },
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    nitro({ preset: nitroPreset }),
    wasm(),
    react({
      babel: {
        plugins: [["babel-plugin-react-compiler", { target: "19" }]],
      },
    }),
  ],
  resolve: {
    alias: [
      { find: "@", replacement: resolve(__dirname, "src") },
      ...(hasLocalJazz ? [
        { find: "@jazz/react", replacement: resolve(jazz2Packages, "jazz-react/src/index.ts") },
        { find: "@jazz/client", replacement: resolve(jazz2Packages, "jazz-client/src/index.ts") },
        {
          find: /^@jazz\/schema$/,
          replacement: resolve(jazz2Packages, "jazz-schema/src/index.ts"),
        },
        {
          find: /^@jazz\/schema\/(.+)$/,
          replacement: resolve(jazz2Packages, "jazz-schema/src/$1.ts"),
        },
        {
          find: "groove-wasm",
          replacement: resolve(jazz2Root, "crates/groove-wasm/pkg"),
        },
      ] : []),
      {
        find: "cloudflare:workers",
        replacement: resolve(__dirname, "src/shims/cloudflare-workers.ts"),
      },
    ],
  },
}))
