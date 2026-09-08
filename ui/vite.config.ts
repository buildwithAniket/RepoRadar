import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// The app reads seen-repos.json and reports/*.md straight from the repo root, so the dev
// server must be allowed to serve files one level above ui/.
const repoRoot = fileURLToPath(new URL('..', import.meta.url))

export default defineConfig({
  plugins: [react()],
  // Relative base so the built assets resolve correctly when served from a GitHub Pages
  // project subpath (https://<user>.github.io/RepoRadar/) as well as from the repo root.
  base: './',
  server: {
    port: 5173,
    fs: { allow: [repoRoot] },
  },
  build: { outDir: 'dist' },
  test: { environment: 'node', include: ['src/**/*.test.ts'] },
})
