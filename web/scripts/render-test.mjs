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
  totalHeap: 327680,
  maxAlloc: 114688,
  frag: 39,
  mode: 'connected',
  connected: true,
  ip: '192.168.1.34',
  rssi: -56,
  fsUsed: 94208,
  fsTotal: 2162688,
  temp: 52.4,
  cpu: 12,
  cpu0: 8,
  cpu1: 16,
}
const CONFIG = { ssid: 'ppk_true_wifi', hostname: 'bundle-panel', hasPassword: true, useStaticIp: false }
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

import { existsSync } from 'node:fs'

let jsCode = ''
if (existsSync(join(dataDir, 'assets'))) {
  const jsName = readdirSync(join(dataDir, 'assets')).find((f) => f.endsWith('.js.gz') || f.endsWith('.js'))
  if (jsName) {
    const raw = readFileSync(join(dataDir, 'assets', jsName))
    jsCode = jsName.endsWith('.gz') ? gunzipSync(raw).toString('utf-8') : raw.toString('utf-8')
  }
}
if (!jsCode && existsSync(join(dataDir, 'index.html.gz'))) {
  const html = gunzipSync(readFileSync(join(dataDir, 'index.html.gz'))).toString('utf-8')
  const startTag = '<script type="module">'
  const start = html.indexOf(startTag)
  const end = html.lastIndexOf('</script>')
  if (start !== -1 && end > start) {
    jsCode = html.substring(start + startTag.length, end)
  }
}

if (!jsCode) {
  console.error('no built bundle found in data/assets or data/index.html.gz - run `npm run build` first')
  process.exit(1)
}

const bundlePath = join(mkdtempSync(join(tmpdir(), 'bundleweb-')), 'bundle.mjs')
writeFileSync(bundlePath, jsCode)


const { window, document } = parseHTML(
  '<!doctype html><html><body><div id="root"></div></body></html>',
)

const memStorage = new Map()
globalThis.localStorage = {
  getItem: (k) => memStorage.get(k) ?? null,
  setItem: (k, v) => memStorage.set(k, String(v)),
  removeItem: (k) => memStorage.delete(k),
  clear: () => memStorage.clear(),
}

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
  else if (target.includes('gold-api.com')) {
    body = {
      currency: 'USD',
      currencySymbol: '$',
      exchangeRate: 1.0,
      name: 'Gold',
      price: 4183.5,
      symbol: 'XAU',
      updatedAt: '2026-10-16T09:30:19Z',
      updatedAtReadable: 'a few seconds ago',
    }
  }
  return { ok: true, status: 200, json: async () => body }
}

await import(pathToFileURL(bundlePath).href)

// Let the initial fetches resolve and Preact flush.
await new Promise((r) => setTimeout(r, 50))

const root = document.getElementById('root')
const text = root.textContent || ''
const html = root.innerHTML || ''

const expectations = [
  ['heading', 'Bundle Server'],
  ['uptime value', '1h 10m'],
  ['heap value', '228.3 KB'],
  ['ram title', 'RAM (Heap)'],
  ['free ram label', 'Free RAM'],
  ['fragmentation', '39%'],
  ['address', '192.168.1.34'],
  ['firmware', '0.1.0'],
  ['signal', '-56 dBm'],
  ['filesystem', '92.0 KB / 2.06 MB'],
  ['link panel heading', 'Link quality'],
  ['cpu title', 'CPU & Thermal'],
  ['cpu value', '12%'],
  ['temp value', '52.4°C'],
  ['clock speed', '240 MHz'],
  ['gold heading', 'Live Gold Price'],
  ['gold symbol', 'XAU / USD'],
  ['gold sync badge', '⏱ 30m sync'],
  ['gold chart title', '7D Price Movement'],
  ['gold chart timeline', 'Now'],
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

// Assert Theme Toggle works and sets data-theme="light"
const themeBtn = document.querySelector('.theme-toggle')
if (!themeBtn) {
  failed += 1
  console.log('  FAIL  Theme toggle button not found')
} else {
  console.log('  PASS  Theme toggle button found with text:', themeBtn.textContent?.trim())
  // Test click to switch to light mode (needs bubbling in LinkeDOM)
  themeBtn.dispatchEvent(new window.Event('click', { bubbles: true }))
  await new Promise((r) => setTimeout(r, 50))
  const isLight = document.documentElement.getAttribute('data-theme') === 'light'
  if (isLight && themeBtn.textContent?.includes('🌙')) {
    console.log('  PASS  Successfully toggled to Light Theme (data-theme="light")')
  } else {
    failed += 1
    console.log('  FAIL  Toggling theme failed, current data-theme:', document.documentElement.getAttribute('data-theme'))
  }
}

console.log(`\n  bundle: inlined  raw=${readFileSync(bundlePath).length} B  dom=${html.length} B`)

if (failed > 0) {
  console.error(`\n${failed} expectation(s) failed. Rendered text:\n${text.slice(0, 600)}`)
  process.exit(1)
}
console.log('\nall render expectations passed')
// The app's polling timer keeps the event loop alive, so exit explicitly.
process.exit(0)
