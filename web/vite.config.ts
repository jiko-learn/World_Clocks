import { defineConfig } from 'vite'

const devMockPlugin = {
  name: 'mock-esp32-api',
  configureServer(server: any) {
    server.middlewares.use((req: any, res: any, next: any) => {
      const url = req.url?.split('?')[0]
      if (url === '/api/health') {
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ok: true,
            fw: '0.1.0',
            uptime: 4242,
            heap: 233760,
            minHeap: 214804,
            frag: 39,
            mode: 'connected',
            connected: true,
            ip: '192.168.1.34',
            rssi: -56,
            fsUsed: 94208,
            fsTotal: 2162688,
            epoch: Math.floor(Date.now() / 1000),
          })
        )
        return
      }
      if (url === '/api/link') {
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            intervalMs: 5000,
            reconnects: 2,
            count: 14,
            samples: [
              { rssi: -58, c: true, m: 2 },
              { rssi: -56, c: true, m: 2 },
              { rssi: -54, c: true, m: 2 },
              { rssi: -58, c: true, m: 2 },
              { rssi: -60, c: true, m: 2 },
              { rssi: -62, c: true, m: 2 },
              { rssi: -64, c: true, m: 2 },
              { rssi: -58, c: true, m: 2 },
              { rssi: -56, c: true, m: 2 },
              { rssi: -55, c: true, m: 2 },
              { rssi: -57, c: true, m: 2 },
              { rssi: -56, c: true, m: 2 },
            ],
          })
        )
        return
      }
      if (url === '/api/config') {
        res.setHeader('Content-Type', 'application/json')
        res.end(
          JSON.stringify({
            ssid: 'ppk_true_wifi',
            hostname: 'bundle-panel',
            hasPassword: true,
            useStaticIp: false,
          })
        )
        return
      }
      next()
    })
  },
}

export default defineConfig({
  plugins: [devMockPlugin],
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
