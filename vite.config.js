import { defineConfig } from 'vite'
import { resolve } from 'node:path'

// Vite builds only the shared CSS/JS bundle. The 393 HTML pages are rendered by
// build/build.mjs, which reads the manifest below to pick up the hashed filenames.
export default defineConfig({
  root: resolve('src'),
  publicDir: false,
  build: {
    // Written outside dist/ because build/build.mjs wipes dist/ before it
    // renders; it copies this directory back in afterwards.
    outDir: resolve('.vite-out'),
    emptyOutDir: true,
    manifest: 'manifest.json',
    cssCodeSplit: false,
    target: 'es2020',
    rollupOptions: {
      input: resolve('src/main.js'),
      output: {
        entryFileNames: 'itlr.[hash].js',
        assetFileNames: 'itlr.[hash][extname]',
      },
    },
  },
})
