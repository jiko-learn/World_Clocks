import { defineConfig } from 'vite'

export default defineConfig({
  plugins: [],
  base: '/',
  resolve: {
    // Source is plain React; the runtime is swapped for Preact. React 19 +
    // react-dom is ~223 KB raw, which on a marginal 2.4 GHz link is ~45 TCP
    // segments and regularly fails to transfer. Preact's compat layer keeps
    // the same component/API shape at a fraction of the size.
    // Order matters: most specific first.
    alias: [
      { find: 'react-dom/test-utils', replacement: 'preact/test-utils' },
      { find: 'react-dom/client', replacement: 'preact/compat/client' },
      { find: 'react-dom', replacement: 'preact/compat' },
      { find: 'react/jsx-dev-runtime', replacement: 'preact/jsx-dev-runtime' },
      { find: 'react/jsx-runtime', replacement: 'preact/jsx-runtime' },
      { find: 'react', replacement: 'preact/compat' },
    ],
  },
  build: {
    outDir: '../data',
    emptyOutDir: true,
    sourcemap: false,
    target: 'es2018',
    cssCodeSplit: false,
    modulePreload: { polyfill: false },
    reportCompressedSize: true,
    // Single entry with no dynamic imports, so Rollup emits a single JS
    // chunk anyway. Browsers hold up to 6 connections per origin and the
    // ESP32 has ~5-10 usable sessions, so every extra chunk is a real cost.
  },
})
