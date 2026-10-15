/**
 * Render the built bundle in a real DOM and assert the dashboard paints.
 *
 * Guards against a bundle that returns 200 over HTTP but renders nothing -
 * a silent failure that neither curl nor a byte-count check would catch.
 *
 * Run: npm test
 */
import { parseHTML } from 'linkedom'
import { gunzipSync } from 'node:zlib'
import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const projectDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const dataDir = join(projectDir, 'data')

const HEALTH = {
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
}
const CONFIG = { ssid: 'ppk_true_wifi', hostname: 'bun-panel', hasPassword: true, useStaticIp: false }
const LINK = {
  intervalMs: 5000,
  reconnects: 2,
  count: 4,
  samples: [
    { rssi: -55, c: true, m: 2 },
    { rssi: -80, c: true, m: 2 },
    { rssi: 0, c: false, m: 3 },
    { rssi: -58, c: true, m: 2 },
  ],
}

const jsName = readdirSync(join(dataDir, 'assets')).find((f) => f.endsWith('.js.gz'))
if (!jsName) {
  console.error('no built bundle found in data/assets - run `npm run build` first')
  process.exit(1)
}

const bundlePath = join(mkdtempSync(join(tmpdir(), 'bunweb-')), 'bundle.mjs')
writeFileSync(bundlePath, gunzipSync(readFileSync(join(dataDir, 'assets', jsName))))

const { window, document } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
)

globalThis.window = window
globalThis.document = document
globalThis.location = { href: 'http://device.local/' }
globalThis.confirm = () => true
// Node 23 exposes `navigator` as a getter-only global, so it needs a define.
Object.defineProperty(globalThis, 'navigator', {
  value: window.navigator,
  configurable: true,
  writable: true,
})
globalThis.fetch = async (url) => {
  const target = String(url)
  let body = CONFIG
  if (target.includes('/api/health')) body = HEALTH
  else if (target.includes('/api/link')) body = LINK
  return { ok: true, status: 200, json: async () => body }
}

await import(pathToFileURL(bundlePath).href)

// Let the initial fetches resolve and Preact flush.
await new Promise((r) => setTimeout(r, 50))

const root = document.getElementById('root')
const text = root.textContent || ''
const html = root.innerHTML || ''

const expectations = [
  ['heading', 'Bun Server'],
  ['uptime value', '1h 10m'],
  ['heap value', '228.3 KB'],
  ['fragmentation', '39%'],
  ['address', '192.168.1.34'],
  ['firmware', '0.1.0'],
  ['signal', '-56 dBm'],
  ['filesystem', '92.0 KB / 2.06 MB'],
  ['link panel heading', 'Link quality'],
]

let failed = 0
for (const [label, needle] of expectations) {
  const ok = text.includes(needle)
  if (!ok) failed += 1
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}: "${needle}"`)
}

// Assert WiFi settings inputs are NOT present
const ssidEl = document.getElementById('ssid')
const hostEl = document.getElementById('host')
if (ssidEl || hostEl) {
  failed += 1
  console.log('  FAIL  WiFi settings inputs should not exist on dashboard')
} else {
  console.log('  PASS  WiFi settings inputs removed from dashboard')
}

console.log(`\n  bundle: ${jsName}  raw=${readFileSync(bundlePath).length} B  dom=${html.length} B`)

if (failed > 0) {
  console.error(`\n${failed} expectation(s) failed. Rendered text:\n${text.slice(0, 600)}`)
  process.exit(1)
}
console.log('\nall render expectations passed')
// The app's polling timer keeps the event loop alive, so exit explicitly.
process.exit(0)
