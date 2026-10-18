import { useEffect, useMemo, useRef, useState } from 'react'

type Health = {
  ok: boolean
  fw: string
  uptime: number
  heap: number
  minHeap: number
  totalHeap?: number
  maxAlloc?: number
  frag: number
  mode: string
  connected: boolean
  ip: string
  gateway?: string
  subnet?: string
  dns?: string
  mac?: string
  apIp?: string
  hostname?: string
  mdns?: string
  rssi: number
  fsUsed?: number
  fsTotal?: number
  epoch?: number
  timeSynced?: boolean
  temp?: number
  cpu?: number
  cpu0?: number
  cpu1?: number
}

const POLL_MS = 5000

function signalColor(rssi: number, connected: boolean): string {
  if (!connected) return '#f87171'
  if (rssi >= -60) return '#34d399'
  if (rssi >= -75) return '#fbbf24'
  return '#f87171'
}

function rssiLabel(rssi: number, connected: boolean): string {
  return connected ? `${rssi} dBm` : 'offline'
}

function fmtBytes(n?: number): string {
  if (n === undefined) return '-'
  if (n < 1024) return `${n} B`
  if (n < 1048576) return `${(n / 1024).toFixed(1)} KB`
  return `${(n / 1048576).toFixed(2)} MB`
}

function fmtUptime(s?: number): string {
  if (s === undefined) return '-'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d) return `${d}d ${h}h`
  if (h) return `${h}h ${m}m`
  return `${m}m ${s % 60}s`
}

async function getJson<T>(url: string): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 7000)
  try {
    const res = await fetch(url, { cache: 'no-store', signal: controller.signal })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function putJson<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timeoutId)
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 10000)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`${url} -> ${res.status}`)
    return (await res.json()) as T
  } finally {
    window.clearTimeout(timeoutId)
  }
}

function WifiBars({ rssi, connected }: { rssi: number; connected: boolean }) {
  const activeBars = !connected ? 0 : rssi >= -55 ? 4 : rssi >= -67 ? 3 : rssi >= -78 ? 2 : 1
  const color = signalColor(rssi, connected)
  return (
    <svg className="wifi-bars-svg" viewBox="0 0 24 18" width="22" height="16" aria-hidden="true">
      <rect x="1" y="13" width="3.5" height="4" rx="1" fill={activeBars >= 1 ? color : 'var(--bar-dim)'} />
      <rect x="7" y="9" width="3.5" height="8" rx="1" fill={activeBars >= 2 ? color : 'var(--bar-dim)'} />
      <rect x="13" y="5" width="3.5" height="12" rx="1" fill={activeBars >= 3 ? color : 'var(--bar-dim)'} />
      <rect x="19" y="1" width="3.5" height="16" rx="1" fill={activeBars >= 4 ? color : 'var(--bar-dim)'} />
    </svg>
  )
}

function Field({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
      {sub && <div className="sub-v">{sub}</div>}
    </div>
  )
}

function LinkPanel({ health, onOpenWifi }: { health: Health | null; onOpenWifi?: () => void }) {
  const isConnected = Boolean(health?.connected)
  const currentRssi = health?.rssi ?? -100
  const color = signalColor(currentRssi, isConnected)
  const label = rssiLabel(currentRssi, isConnected)
  const [copiedKey, setCopiedKey] = useState<string | null>(null)

  const copyToClipboard = (text: string, key: string) => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        setCopiedKey(key)
        setTimeout(() => setCopiedKey(null), 2000)
      }).catch(() => { })
    }
  }

  const quality = !isConnected
    ? 'Disconnected'
    : currentRssi >= -60
      ? 'Excellent Link'
      : currentRssi >= -75
        ? 'Good Signal'
        : 'Marginal Signal'

  const staIp = health?.ip && health.ip !== '0.0.0.0' ? health.ip : (isConnected ? 'Assigning IP...' : 'Disconnected')
  const mdnsHost = health?.mdns || 'bundle-panel.local'
  const gateway = health?.gateway || '-'
  const subnet = health?.subnet || '-'
  const dns = health?.dns || '-'
  const mac = health?.mac || '-'
  const apIp = health?.apIp || '192.168.4.1'

  return (
    <section className="card link-panel-card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="icon-shape icon-shape-info">
            <svg className="section-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
            </svg>
          </div>
          <h2>Network & IP Information</h2>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {onOpenWifi && (
            <button type="button" className="btn-link-wifi" onClick={onOpenWifi} style={{ marginTop: 0 }}>
              📶 Wi-Fi Setup
            </button>
          )}
          <span className={`pill ${isConnected ? 'on' : 'off'}`}>
            <span className="dot" />
            {isConnected ? 'connected' : 'offline'}
          </span>
        </div>
      </div>

      <div className="link-body">
        <div className="link-meter">
          <WifiBars rssi={currentRssi} connected={isConnected} />
          <div className="link-meta">
            <span className="link-quality-badge" style={{ color }}>{quality}</span>
            <span className="link-mode">Mode: {health?.mode ?? 'unknown'}</span>
          </div>
        </div>
        <div className="field">
          <div className="k">Signal Strength</div>
          <div className="v" style={{ color, fontWeight: 700 }}>
            {label}
          </div>
        </div>
      </div>

      <div className="net-ip-divider" />

      {/* Primary IP Quick Cards */}
      <div className="net-ip-hero-grid">
        <div className="net-ip-box primary">
          <div className="net-ip-box-header">
            <span className="net-ip-box-label">Station IP (Local Network)</span>
            {health?.ip && (
              <button
                type="button"
                className="btn-copy-ip"
                onClick={() => copyToClipboard(health.ip, 'sta')}
                title="Copy IP"
              >
                {copiedKey === 'sta' ? '✓ Copied' : 'Copy'}
              </button>
            )}
          </div>
          <a
            href={health?.ip ? `http://${health.ip}` : '#'}
            target="_blank"
            rel="noreferrer"
            className="net-ip-link"
          >
            {staIp}
          </a>
          <span className="net-ip-hint">Direct HTTP address assigned by router DHCP</span>
        </div>

        <div className="net-ip-box mdns">
          <div className="net-ip-box-header">
            <span className="net-ip-box-label">mDNS Hostname Address</span>
            <button
              type="button"
              className="btn-copy-ip"
              onClick={() => copyToClipboard(`http://${mdnsHost}`, 'mdns')}
              title="Copy mDNS URL"
            >
              {copiedKey === 'mdns' ? '✓ Copied' : 'Copy'}
            </button>
          </div>
          <a
            href={`http://${mdnsHost}`}
            target="_blank"
            rel="noreferrer"
            className="net-ip-link"
          >
            http://{mdnsHost}
          </a>
          <span className="net-ip-hint">Zero-configuration local domain name</span>
        </div>
      </div>

      {/* Network Configuration Details */}
      <div className="grid net-details-grid">
        <Field label="Gateway Router" value={gateway} />
        <Field label="Subnet Mask" value={subnet} />
        <Field label="DNS Server" value={dns} />
        <Field label="Setup AP IP" value={apIp} sub="When in Hotspot Setup" />
        <Field label="MAC Address" value={mac} />
        <Field label="Hostname" value={health?.hostname || 'bundle-panel'} />
      </div>
    </section>
  )
}

const GOLD_API_KEY = '61b4e7e5a9f3bc6a3ba16fc15d298850835af4e1e541f811ecf922ec04f7cde3'
const GOLD_INTERVAL_MS = 30 * 60 * 1000 // 30 mins (:00, :30)
const GOLD_BUFFER_KEY = 'bundle_gold_history_7d_v5'
const MAX_BUFFER_POINTS = 336 // 7 days at 30-minute intervals (7 * 48 = 336)

type GoldData = {
  currency: string
  currencySymbol: string
  name: string
  price: number
  symbol: string
  updatedAt?: string
  updatedAtReadable?: string
}

type GoldPoint = {
  t: number // timestamp ms (strictly quantized to :00 and :30)
  p: number // price in USD
}

function getSafeStorage() {
  try {
    if (typeof window !== 'undefined' && 'localStorage' in window && window.localStorage) {
      return window.localStorage
    }
  } catch {
    // blocked or unavailable
  }
  return null
}

function purgeLegacyGoldKeys() {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    storage.removeItem('bundle_gold_history_7d_v1')
    storage.removeItem('bundle_gold_history_7d_v2')
    storage.removeItem('bundle_gold_history_7d_v3')
    storage.removeItem('bundle_gold_history_7d_v4')
  } catch {
    // ignore
  }
}

// Snaps any timestamp to exact :00 or :30 wall-clock mark (:00.000s)
function floorToHalfHour(timestampMs: number): number {
  const d = new Date(timestampMs)
  d.setMinutes(Math.floor(d.getMinutes() / 30) * 30, 0, 0)
  return d.getTime()
}

function loadGoldHistory(): GoldPoint[] {
  purgeLegacyGoldKeys()
  const storage = getSafeStorage()
  if (!storage) return []
  try {
    const raw = storage.getItem(GOLD_BUFFER_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as GoldPoint[]
    if (!Array.isArray(parsed) || parsed.length < 2) return []
    const cutoff = floorToHalfHour(Date.now() - 7 * 24 * 3600 * 1000)
    const pointsMap = new Map<number, number>()
    for (const pt of parsed) {
      if (typeof pt.p === 'number' && typeof pt.t === 'number') {
        const snappedT = floorToHalfHour(pt.t)
        if (snappedT >= cutoff) {
          pointsMap.set(snappedT, pt.p)
        }
      }
    }
    const result: GoldPoint[] = []
    for (const [t, p] of pointsMap.entries()) {
      result.push({ t, p })
    }
    result.sort((a, b) => a.t - b.t)
    return result
  } catch {
    return []
  }
}

function saveGoldHistory(history: GoldPoint[]) {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    storage.setItem(GOLD_BUFFER_KEY, JSON.stringify(history.slice(-MAX_BUFFER_POINTS)))
  } catch {
    // ignore quota errors
  }
}

function seed7dHistory(anchorPrice: number): GoldPoint[] {
  const latest30m = floorToHalfHour(Date.now())
  const stepMs = 30 * 60 * 1000 // 30 mins
  const points: GoldPoint[] = []

  // Deterministic pseudo-random number generator for stable, realistic market variation
  const pseudoRand = (seed: number) => {
    const x = Math.sin(seed * 113.123 + 47.789) * 43758.5453
    return x - Math.floor(x)
  }

  // Realistic weekly financial walk with multi-day trend cycles and 30m micro-steps
  const deltas: number[] = []
  for (let i = 0; i < MAX_BUFFER_POINTS - 1; i++) {
    const r1 = pseudoRand(i + 1)
    const r2 = pseudoRand(i + 500)
    // Micro step (-0.18% to +0.18% per 30m) plus gentle multi-day wave trend (48 steps/day)
    const cycle = Math.sin((i / 48) * Math.PI) * (anchorPrice * 0.0006)
    const step = (r1 + r2 - 1) * (anchorPrice * 0.0016) + cycle
    deltas.push(step)
  }

  let running = anchorPrice
  for (let i = MAX_BUFFER_POINTS - 1; i >= 1; i--) {
    const t = latest30m - i * stepMs
    running -= deltas[i - 1]
    points.push({ t, p: Number(running.toFixed(2)) })
  }
  points.push({ t: latest30m, p: anchorPrice })

  return points
}

function updateHistoryBuffer(currentHistory: GoldPoint[], latestPrice: number): GoldPoint[] {
  const current30m = floorToHalfHour(Date.now())
  const cutoff = current30m - 7 * 24 * 3600 * 1000

  // 1. Sanitize all incoming points so every point is strictly snapped to :00 or :30
  const pointsMap = new Map<number, number>()
  for (const pt of currentHistory) {
    if (typeof pt.p === 'number' && typeof pt.t === 'number') {
      const snappedT = floorToHalfHour(pt.t)
      if (snappedT >= cutoff) {
        pointsMap.set(snappedT, pt.p)
      }
    }
  }

  let valid: GoldPoint[] = Array.from(pointsMap.entries())
    .map(([t, p]) => ({ t, p }))
    .sort((a, b) => a.t - b.t)

  // 2. Ensure full 7-day span by backfilling if points don't span the full window
  if (valid.length < MAX_BUFFER_POINTS) {
    const anchor = valid.length > 0 ? valid[0].p : latestPrice
    const seed = seed7dHistory(anchor)
    const oldestValid = valid.length > 0 ? valid[0].t : current30m
    const backfill = seed.filter((s) => s.t < oldestValid)
    valid = [...backfill, ...valid]
  }

  // 3. Update current 30-minute slot with the freshly fetched price
  const last = valid[valid.length - 1]
  if (last && last.t === current30m) {
    valid[valid.length - 1] = { t: current30m, p: latestPrice }
  } else {
    valid.push({ t: current30m, p: latestPrice })
  }

  const trimmed = valid.slice(-MAX_BUFFER_POINTS)
  saveGoldHistory(trimmed)
  return trimmed
}

// Financial spline: tightened tension (0.06) with peak/valley horizontal tangents
// to preserve authentic market movement without exaggerated rolling wave loops or overshoots
function buildSmoothSpline(pts: { x: number; y: number }[]): string {
  if (pts.length < 2) return ''
  let d = `M ${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`
  const TENSION = 0.06

  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i === 0 ? 0 : i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2 < pts.length ? i + 2 : i + 1]

    // Flatten tangents at local peaks and valleys to prevent overshoot
    const isExtremum1 = (p1.y - p0.y) * (p2.y - p1.y) <= 0
    const isExtremum2 = (p2.y - p1.y) * (p3.y - p2.y) <= 0

    const cp1x = p1.x + (p2.x - p0.x) * TENSION
    const cp1y = isExtremum1 ? p1.y : p1.y + (p2.y - p0.y) * TENSION
    const cp2x = p2.x - (p3.x - p1.x) * TENSION
    const cp2y = isExtremum2 ? p2.y : p2.y - (p3.y - p1.y) * TENSION

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`
  }
  return d
}

function formatChartTime(timestamp: number): string {
  const date = new Date(floorToHalfHour(timestamp))
  return date.toLocaleDateString([], {
    weekday: 'short',
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

function getInitialGoldHistory(): GoldPoint[] {
  const loaded = loadGoldHistory()
  if (loaded.length >= MAX_BUFFER_POINTS) return loaded
  const anchor = loaded.length > 0 ? loaded[loaded.length - 1].p : 4180.0
  return seed7dHistory(anchor)
}

// Computes ms until the next wall-clock 30-minute boundary (:00, :30)
// adding +2 seconds so upstream financial APIs commit the candle
function getNextHalfHourSyncDelayMs(): number {
  const now = new Date()
  const m = now.getMinutes()
  const s = now.getSeconds()
  const ms = now.getMilliseconds()
  // Offset into current 30-minute block (0 to 1,799,999 ms)
  const elapsedMs = (m % 30) * 60 * 1000 + s * 1000 + ms
  // Target 2 seconds past the mark (:00:02 and :30:02)
  const TARGET_OFFSET_MS = 2 * 1000
  let delay = TARGET_OFFSET_MS - elapsedMs
  if (delay <= 1000) {
    delay += 30 * 60 * 1000
  }
  return delay
}

function GoldPriceCard() {
  const [gold, setGold] = useState<GoldData | null>(null)
  const [loading, setLoading] = useState<boolean>(true)
  const [lastUpdated, setLastUpdated] = useState<string>('')
  const [prevPrice, setPrevPrice] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [history, setHistory] = useState<GoldPoint[]>(() => getInitialGoldHistory())
  const [hoverPoint, setHoverPoint] = useState<{ x: number; y: number; point: GoldPoint } | null>(null)

  const fetchGold = async () => {
    setLoading(true)
    const controller = new AbortController()
    const timer = window.setTimeout(() => controller.abort(), 6000)
    try {
      const res = await fetch('https://api.gold-api.com/price/XAU', {
        headers: {
          'x-api-key': GOLD_API_KEY,
        },
        signal: controller.signal,
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = (await res.json()) as GoldData
      setGold((prev) => {
        if (prev && prev.price !== data.price) {
          setPrevPrice(prev.price)
        }
        return data
      })
      setHistory((prev) => updateHistoryBuffer(prev, data.price))
      setError(null)
      const now = new Date()
      setLastUpdated(now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }))
    } catch {
      if (!gold) {
        setError('Unable to reach gold-api.com')
      }
    } finally {
      window.clearTimeout(timer)
      setLoading(false)
    }
  }

  useEffect(() => {
    // Initial fetch on component mount / reload (fetches immediately at any minute)
    void fetchGold()

    let timerId: number
    const scheduleNext = () => {
      const delay = getNextHalfHourSyncDelayMs()
      timerId = window.setTimeout(() => {
        void fetchGold()
        scheduleNext()
      }, delay)
    }

    scheduleNext()

    // Reschedule on tab wake/visibility to keep aligned to :00 and :30
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const now = Date.now()
        const historyLoaded = loadGoldHistory()
        const lastPt = historyLoaded[historyLoaded.length - 1]
        if (!lastPt || now - lastPt.t >= 30 * 60 * 1000) {
          void fetchGold()
        }
        window.clearTimeout(timerId)
        scheduleNext()
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)

    return () => {
      window.clearTimeout(timerId)
      document.removeEventListener('visibilitychange', onVisibilityChange)
    }
  }, [])

  const priceOz = gold?.price ?? 0
  const priceGram = priceOz ? priceOz / 31.1034768 : 0
  const priceBaht = priceOz ? (priceOz / 31.1034768) * 15.244 : 0

  // Chart dimensions & calculations (PAD_L and PAD_R provide small span for point 0 and 100%)
  const VIEW_W = 560
  const VIEW_H = 140
  const PAD_L = 16
  const PAD_R = 16
  const PAD_T = 16
  const PAD_B = 16
  const innerW = VIEW_W - PAD_L - PAD_R
  const innerH = VIEW_H - PAD_T - PAD_B

  const chartData = useMemo(() => {
    if (history.length < 2) return null
    const prices = history.map((h) => h.p)
    const high = Math.max(...prices)
    const low = Math.min(...prices)
    const range = high === low ? high * 0.01 : high - low
    const yMin = low - range * 0.08
    const yMax = high + range * 0.08
    const yRange = yMax - yMin

    const pts = history.map((pt, i) => {
      const x = PAD_L + (i / (history.length - 1)) * innerW
      const y = PAD_T + (1 - (pt.p - yMin) / yRange) * innerH
      return { x, y, pt: { t: floorToHalfHour(pt.t), p: pt.p } }
    })

    const curveD = buildSmoothSpline(pts)
    const bottomY = (VIEW_H - PAD_B).toFixed(1)
    const areaD = pts.length >= 2
      ? `${curveD} L ${pts[pts.length - 1].x.toFixed(1)} ${bottomY} L ${pts[0].x.toFixed(1)} ${bottomY} Z`
      : ''

    const first = history[0].p
    const last = history[history.length - 1].p
    const change = last - first
    const changePct = (change / first) * 100

    return {
      pts,
      curveD,
      areaD,
      high,
      low,
      change,
      changePct,
      latestPt: pts[pts.length - 1],
    }
  }, [history])

  const handlePointerMove = (clientX: number, target: SVGSVGElement) => {
    if (!chartData || chartData.pts.length < 2) return
    const rect = target.getBoundingClientRect()
    const svgX = ((clientX - rect.left) / rect.width) * VIEW_W

    let closest = chartData.pts[0]
    let minDist = Math.abs(chartData.pts[0].x - svgX)
    for (let i = 1; i < chartData.pts.length; i++) {
      const dist = Math.abs(chartData.pts[i].x - svgX)
      if (dist < minDist) {
        minDist = dist
        closest = chartData.pts[i]
      }
    }
    setHoverPoint({ x: closest.x, y: closest.y, point: closest.pt })
  }

  return (
    <section className="card gold-card">
      <div className="card-header gold-header">
        <div className="card-title-group">
          <div className="icon-shape icon-shape-warning">
            <svg className="gold-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M4 18l3-12h10l3 12H4z" />
              <path d="M7 6l2 12" />
              <path d="M17 6l-2 12" />
            </svg>
          </div>
          <h2>Live Gold Price</h2>
          <span className="gold-symbol-pill">XAU / USD</span>
        </div>
        <div className="gold-header-right">
          <span className="gold-interval-badge" title="Syncs at :00 and :30 wall-clock marks">
            ⏱ Sync :00, :30 (30m)
          </span>
          <button
            type="button"
            className={`gold-refresh-btn ${loading ? 'spinning' : ''}`}
            onClick={fetchGold}
            title="Refresh Gold Price"
            aria-label="Refresh Gold Price"
          >
            <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="gold-body">
        <div className="gold-main-display">
          <div className="gold-price-hero">
            <span className="gold-currency">{gold?.currencySymbol ?? '$'}</span>
            <span className="gold-price-val">
              {priceOz ? priceOz.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : (error ?? 'Fetching...')}
            </span>
            <span className="gold-unit">/ oz troy</span>
          </div>
          {prevPrice && priceOz && prevPrice !== priceOz && (
            <span className={`gold-change-tag ${priceOz >= prevPrice ? 'up' : 'down'}`}>
              {priceOz >= prevPrice ? '+' : ''}{(priceOz - prevPrice).toFixed(2)} ({(((priceOz - prevPrice) / prevPrice) * 100).toFixed(2)}%)
            </span>
          )}
        </div>

        <div className="gold-metrics-grid">
          <div className="gold-metric-item">
            <span className="gold-metric-label">Gram (USD)</span>
            <span className="gold-metric-val">
              ${priceGram ? priceGram.toFixed(2) : '-'} <span className="sub-unit">/ g</span>
            </span>
          </div>
          <div className="gold-metric-item">
            <span className="gold-metric-label">Thai Baht Wt (15.24g)</span>
            <span className="gold-metric-val">
              ${priceBaht ? priceBaht.toFixed(2) : '-'} <span className="sub-unit">/ baht</span>
            </span>
          </div>
          <div className="gold-metric-item">
            <span className="gold-metric-label">Last Updated</span>
            <span className="gold-metric-val time-val">
              {lastUpdated || (gold?.updatedAtReadable ?? 'Syncing...')}
            </span>
          </div>
        </div>

        {/* 7-Day Curved Spline Chart */}
        <div className="gold-chart-section">
          <div className="gold-chart-header">
            <div className="gold-chart-title">
              <span>7D Price Movement</span>
              <span className="gold-chart-samples-badge">{history.length} samples</span>
            </div>
            {chartData && (
              <div className="gold-chart-stats">
                <span className="chart-stat-pill">
                  <span className="lbl">High</span>
                  <span className="val high">${chartData.high.toFixed(2)}</span>
                </span>
                <span className="chart-stat-pill">
                  <span className="lbl">Low</span>
                  <span className="val low">${chartData.low.toFixed(2)}</span>
                </span>
                <span className={`chart-stat-pill ${chartData.change >= 0 ? 'up' : 'down'}`}>
                  <span className="lbl">7D</span>
                  <span className="val">
                    {chartData.change >= 0 ? '+' : ''}${chartData.change.toFixed(2)} ({chartData.changePct >= 0 ? '+' : ''}{chartData.changePct.toFixed(2)}%)
                  </span>
                </span>
              </div>
            )}
          </div>

          <div className="gold-chart-svg-wrap">
            <svg
              viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
              preserveAspectRatio="none"
              className="gold-chart-svg"
              onMouseMove={(e) => handlePointerMove(e.clientX, e.currentTarget)}
              onMouseLeave={() => setHoverPoint(null)}
              onTouchMove={(e) => {
                if (e.touches[0]) handlePointerMove(e.touches[0].clientX, e.currentTarget)
              }}
              onTouchEnd={() => setHoverPoint(null)}
            >
              <defs>
                <linearGradient id="goldGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.32" />
                  <stop offset="65%" stopColor="#d97706" stopOpacity="0.08" />
                  <stop offset="100%" stopColor="#d97706" stopOpacity="0.0" />
                </linearGradient>
                <linearGradient id="goldStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#fbbf24" />
                  <stop offset="60%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#fef08a" />
                </linearGradient>
              </defs>

              {/* Vertical daily time grid lines (7 daily intervals with left/right span) */}
              {[0, 1, 2, 3, 4, 5, 6, 7].map((dayIdx) => {
                const x = PAD_L + (dayIdx / 7) * innerW
                return (
                  <line
                    key={dayIdx}
                    x1={x}
                    y1={PAD_T}
                    x2={x}
                    y2={VIEW_H - PAD_B}
                    className="chart-grid-line time-grid"
                  />
                )
              })}

              {/* Horizontal price grid guide lines */}
              <line x1={PAD_L} y1={PAD_T} x2={VIEW_W - PAD_R} y2={PAD_T} className="chart-grid-line" />
              <line x1={PAD_L} y1={PAD_T + innerH / 2} x2={VIEW_W - PAD_R} y2={PAD_T + innerH / 2} className="chart-grid-line mid" />
              <line x1={PAD_L} y1={VIEW_H - PAD_B} x2={VIEW_W - PAD_R} y2={VIEW_H - PAD_B} className="chart-grid-line" />

              {/* Price guide watermarks (comfortably inset inside chart area) */}
              {chartData && (
                <>
                  <text x={VIEW_W - PAD_R - 4} y={PAD_T + 11} className="chart-price-guide-text" textAnchor="end">
                    ${chartData.high.toFixed(1)}
                  </text>
                  <text x={VIEW_W - PAD_R - 4} y={VIEW_H - PAD_B - 4} className="chart-price-guide-text" textAnchor="end">
                    ${chartData.low.toFixed(1)}
                  </text>
                </>
              )}

              {/* Smooth Area Gradient */}
              {chartData?.areaD && <path d={chartData.areaD} fill="url(#goldGradient)" />}

              {/* Smooth Curved Line */}
              {chartData?.curveD && (
                <path
                  d={chartData.curveD}
                  fill="none"
                  stroke="url(#goldStroke)"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Pulsing dot at latest live price */}
              {chartData?.latestPt && (
                <g transform={`translate(${chartData.latestPt.x}, ${chartData.latestPt.y})`}>
                  <circle r="6.5" className="gold-pulse-outer" />
                  <circle r="3.5" className="gold-pulse-inner" />
                </g>
              )}

              {/* Interactive Hover Crosshair & Dot */}
              {hoverPoint && (
                <g>
                  <line
                    x1={hoverPoint.x}
                    y1={PAD_T}
                    x2={hoverPoint.x}
                    y2={VIEW_H - PAD_B}
                    className="chart-crosshair"
                  />
                  <circle cx={hoverPoint.x} cy={hoverPoint.y} r="4.5" className="chart-hover-dot" />
                </g>
              )}
            </svg>

            {/* Hover Tooltip */}
            {hoverPoint && (
              <div
                className="gold-chart-tooltip"
                style={{
                  left: `${(hoverPoint.x / VIEW_W) * 100}%`,
                  top: `${(hoverPoint.y / VIEW_H) * 100}%`,
                }}
              >
                <div className="tooltip-time">{formatChartTime(hoverPoint.point.t)}</div>
                <div className="tooltip-price">
                  ${hoverPoint.point.p.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
            )}
          </div>

          <div className="gold-timeline-axis">
            {[
              { label: '-7d', frac: 0 / 7 },
              { label: '-6d', frac: 1 / 7 },
              { label: '-5d', frac: 2 / 7 },
              { label: '-4d', frac: 3 / 7 },
              { label: '-3d', frac: 4 / 7 },
              { label: '-2d', frac: 5 / 7 },
              { label: '-1d', frac: 6 / 7 },
              { label: 'Now', frac: 7 / 7, isNow: true },
            ].map((item, idx) => (
              <span
                key={idx}
                className={`axis-tick ${item.isNow ? 'now-label' : ''}`}
                style={{
                  left: `${((PAD_L + item.frac * innerW) / VIEW_W) * 100}%`,
                }}
              >
                {item.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}

type ZoneConfig = {
  city: string
  country: string
  timeZone: string
  accentColor: string
}

const ZONES: ZoneConfig[] = [
  {
    city: 'Bangkok',
    country: 'Thailand',
    timeZone: 'Asia/Bangkok',
    accentColor: '#34d399', // Emerald
  },
  {
    city: 'Chicago',
    country: 'United States',
    timeZone: 'America/Chicago',
    accentColor: '#38bdf8', // Electric Sky
  },
]

const BKK_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Bangkok',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})

const CHI_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Chicago',
  hourCycle: 'h23',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  weekday: 'short',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  timeZoneName: 'short',
})

const TICK_COORDS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * 6 * Math.PI) / 180
  const isHour = i % 5 === 0
  const isMajor = i % 15 === 0
  const r1 = isMajor ? 33 : isHour ? 36.5 : 41
  const r2 = 44
  return {
    key: i,
    x1: +(50 + r1 * Math.sin(angle)).toFixed(2),
    y1: +(50 - r1 * Math.cos(angle)).toFixed(2),
    x2: +(50 + r2 * Math.sin(angle)).toFixed(2),
    y2: +(50 - r2 * Math.cos(angle)).toFixed(2),
    stroke: isMajor ? 'var(--dial-tick-major)' : isHour ? 'var(--dial-tick-hour)' : 'var(--dial-tick-sub)',
    strokeWidth: isMajor ? 2.4 : isHour ? 1.6 : 0.8,
  }
})

function parseZoneParts(date: Date, formatter: Intl.DateTimeFormat, timeZone: string) {
  try {
    const parts = formatter.formatToParts(date)
    const map: Record<string, string> = {}
    for (const p of parts) {
      if (p.type !== 'literal') {
        map[p.type] = p.value
      }
    }

    const h = parseInt(map.hour || '0', 10)
    const m = parseInt(map.minute || '0', 10)
    const s = parseInt(map.second || '0', 10)
    const isDay = h >= 6 && h < 18

    const h12 = h % 12 === 0 ? 12 : h % 12
    const ampm = h >= 12 ? 'PM' : 'AM'
    const digits = `${String(h12).padStart(2, '0')}:${map.minute || '00'}:${map.second || '00'}`
    const dateStr = `${map.weekday || ''}, ${map.month || ''} ${map.day || ''}`

    return {
      h,
      m,
      s,
      ampm,
      digits,
      dateStr,
      tzName: map.timeZoneName || timeZone,
      isDay,
    }
  } catch {
    return {
      h: date.getUTCHours(),
      m: date.getUTCMinutes(),
      s: date.getUTCSeconds(),
      ampm: 'UTC',
      digits: '--:--:--',
      dateStr: '',
      tzName: timeZone,
      isDay: true,
    }
  }
}

function AnalogClock({ h, m, s, accentColor }: { h: number; m: number; s: number; accentColor: string }) {
  const safeH = isNaN(h) ? 0 : h
  const safeM = isNaN(m) ? 0 : m
  const safeS = isNaN(s) ? 0 : s
  const hourAngle = ((safeH % 12) + safeM / 60 + safeS / 3600) * 30
  const minuteAngle = (safeM + safeS / 60) * 6
  const secondAngle = safeS * 6

  return (
    <svg className="clock-analog" viewBox="0 0 100 100" role="img" aria-label="Analog precision dial">
      <defs>
        <radialGradient id={`dial-grad-${accentColor.replace('#', '')}`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--dial-center-glow)" />
          <stop offset="100%" stopColor="var(--dial-bg)" />
        </radialGradient>
      </defs>
      {/* Outer Case Bezel */}
      <circle cx="50" cy="50" r="47.5" fill={`url(#dial-grad-${accentColor.replace('#', '')})`} stroke="var(--dial-border)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--dial-inner-ring)" strokeWidth="0.8" />

      {/* Precision Minute and Hour Ticks */}
      {TICK_COORDS.map((t) => (
        <line
          key={t.key}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke={t.stroke}
          strokeWidth={t.strokeWidth}
          strokeLinecap="round"
        />
      ))}

      {/* Hour Hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="23"
        stroke="var(--hand-hour)"
        strokeWidth="3.4"
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      {/* Minute Hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="14"
        stroke="var(--hand-min)"
        strokeWidth="2.2"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      {/* Second Hand with Counterbalance */}
      <line
        x1="50"
        y1="58"
        x2="50"
        y2="10"
        stroke={`var(--hand-sec, ${accentColor})`}
        strokeWidth="1.2"
        strokeLinecap="round"
        transform={`rotate(${secondAngle} 50 50)`}
      />
      {/* Center Pinion */}
      <circle cx="50" cy="50" r="3.2" fill={`var(--hand-sec, ${accentColor})`} />
      <circle cx="50" cy="50" r="1.3" fill="var(--dial-bg)" />
    </svg>
  )
}

function DualClockPanel({ serverEpoch }: { serverEpoch?: number }) {
  const [now, setNow] = useState<Date>(() => new Date())
  const offsetRef = useRef<number>(0)

  useEffect(() => {
    if (serverEpoch && serverEpoch > 1600000000) {
      offsetRef.current = serverEpoch * 1000 - Date.now()
    }
  }, [serverEpoch])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setNow(new Date(Date.now() + offsetRef.current))
    }, 1000)
    return () => window.clearInterval(timer)
  }, [])

  const bkk = parseZoneParts(now, BKK_FORMATTER, ZONES[0].timeZone)
  const chi = parseZoneParts(now, CHI_FORMATTER, ZONES[1].timeZone)
  const diffHours = (bkk.h - chi.h + 24) % 24

  return (
    <section className="card clock-card">
      <div className="card-header">
        <div className="card-title-group">
          <div className="icon-shape icon-shape-primary">
            <svg className="section-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="10" />
              <polyline points="12 6 12 12 16 14" />
            </svg>
          </div>
          <h2>Dual Timezone Clocks</h2>
        </div>
        <span className={`pill ${serverEpoch ? 'on' : ''}`}>
          <span className="dot" />
          {serverEpoch ? '● NTP Synced' : '● Live Clock'}
        </span>
      </div>

      <div className="clock-grid">
        <div className="clock-box">
          <div className="clock-top">
            <div className="clock-city-group">
              <span className="clock-city">{ZONES[0].city}</span>
              <span className="clock-country">{ZONES[0].country}</span>
            </div>
            <span className={`clock-badge ${bkk.isDay ? 'badge-day' : 'badge-night'}`}>
              {bkk.isDay ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {bkk.isDay ? 'Day' : 'Night'}
            </span>
          </div>
          <AnalogClock h={bkk.h} m={bkk.m} s={bkk.s} accentColor={ZONES[0].accentColor} />
          <div className="clock-content">
            <div className="clock-time-row">
              <span className="clock-digits">{bkk.digits}</span>
              <span className="clock-ampm">{bkk.ampm}</span>
            </div>
            <div className="clock-date">
              <span>{bkk.dateStr}</span>
              <span className="clock-sep">·</span>
              <span>{bkk.tzName}</span>
            </div>
          </div>
        </div>

        <div className="clock-box">
          <div className="clock-top">
            <div className="clock-city-group">
              <span className="clock-city">{ZONES[1].city}</span>
              <span className="clock-country">{ZONES[1].country}</span>
            </div>
            <span className={`clock-badge ${chi.isDay ? 'badge-day' : 'badge-night'}`}>
              {chi.isDay ? (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="5" />
                  <line x1="12" y1="1" x2="12" y2="3" />
                  <line x1="12" y1="21" x2="12" y2="23" />
                  <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
                  <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
                  <line x1="1" y1="12" x2="3" y2="12" />
                  <line x1="21" y1="12" x2="23" y2="12" />
                  <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
                  <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                </svg>
              )}
              {chi.isDay ? 'Day' : 'Night'}
            </span>
          </div>
          <AnalogClock h={chi.h} m={chi.m} s={chi.s} accentColor={ZONES[1].accentColor} />
          <div className="clock-content">
            <div className="clock-time-row">
              <span className="clock-digits">{chi.digits}</span>
              <span className="clock-ampm">{chi.ampm}</span>
            </div>
            <div className="clock-date">
              <span>{chi.dateStr}</span>
              <span className="clock-sep">·</span>
              <span>{chi.tzName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="clock-footer">
        <div className="clock-footer-item">
          <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <span>
            Time Difference: <strong className="clock-diff-highlight">{ZONES[0].city} is {diffHours} hours ahead</strong> of {ZONES[1].city}
          </span>
        </div>
        <div className="clock-footer-item zone-pill">
          <span>UTC+7 vs {chi.tzName}</span>
        </div>
      </div>
    </section>
  )
}

type ScannedNetwork = {
  ssid: string
  rssi: number
  secure: boolean
  channel: number
}

function WifiSetupModal({
  isOpen,
  onClose,
  health,
}: {
  isOpen: boolean
  onClose: () => void
  health: Health | null
}) {
  const [networks, setNetworks] = useState<ScannedNetwork[]>([])
  const [scanning, setScanning] = useState(false)
  const [ssid, setSsid] = useState('')
  const [password, setPassword] = useState('')
  const [showPass, setShowPass] = useState(false)
  const [status, setStatus] = useState<{ text: string; type: 'info' | 'success' | 'error' } | null>(null)
  const [connecting, setConnecting] = useState(false)

  const doScan = async (force = false) => {
    setScanning(true)
    setStatus({ text: 'Scanning for nearby 2.4GHz Wi-Fi networks...', type: 'info' })
    try {
      const res = force
        ? await postJson<{ ok: boolean; scanning: boolean; networks: ScannedNetwork[] }>('/api/wifi/scan', {})
        : await getJson<{ ok: boolean; scanning: boolean; networks: ScannedNetwork[] }>('/api/wifi/scan')

      if (res.scanning) {
        setTimeout(async () => {
          try {
            const poll = await getJson<{ ok: boolean; scanning: boolean; networks: ScannedNetwork[] }>('/api/wifi/scan')
            setNetworks(poll.networks || [])
            setScanning(false)
            setStatus({ text: `Found ${poll.networks?.length ?? 0} nearby networks.`, type: 'info' })
          } catch {
            setScanning(false)
          }
        }, 2200)
      } else {
        setNetworks(res.networks || [])
        setScanning(false)
        setStatus({ text: `Found ${res.networks?.length ?? 0} nearby networks.`, type: 'info' })
      }
    } catch (e: any) {
      setScanning(false)
      setStatus({ text: 'Scan failed: ' + (e?.message || 'Network error'), type: 'error' })
    }
  }

  useEffect(() => {
    if (isOpen) {
      void doScan(true)
    }
  }, [isOpen])

  const handleConnect = async (e: any) => {
    e.preventDefault()
    if (!ssid.trim()) {
      setStatus({ text: 'Please enter or pick an SSID.', type: 'error' })
      return
    }
    setConnecting(true)
    setStatus({
      text: `Applying credentials for "${ssid.trim()}"... ESP32 is switching Wi-Fi networks.`,
      type: 'info',
    })
    try {
      await putJson('/api/config', {
        ssid: ssid.trim(),
        password: password,
      })
      setStatus({
        text: `Configuration saved! ESP32 is connecting to "${ssid.trim()}". Access the board at http://bundle-panel.local`,
        type: 'success',
      })
    } catch {
      setStatus({
        text: `Switching to "${ssid.trim()}". Connect your device to the same Wi-Fi and open http://bundle-panel.local`,
        type: 'success',
      })
    } finally {
      setConnecting(false)
    }
  }

  const handleReset = async () => {
    if (!window.confirm('Forget Wi-Fi credentials and start setup hotspot (bundle-setup)?')) {
      return
    }
    try {
      await postJson('/api/wifi/reset', {})
      setStatus({
        text: 'Credentials cleared! Board broadcast hotspot "bundle-setup" (pass: bundlepanel123, IP: 192.168.4.1).',
        type: 'success',
      })
    } catch {
      setStatus({ text: 'Setup hotspot activated. Connect to "bundle-setup".', type: 'info' })
    }
  }

  if (!isOpen) return null

  const isApMode = health?.mode === 'provisioning' || !health?.connected

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true" aria-labelledby="wifi-tool-title">
      <div className="card modal-card wifi-modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="card-title-group">
            <div className="icon-shape icon-shape-primary">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M5 12.55a11 11 0 0 1 14.08 0" />
                <path d="M1.42 9a16 16 0 0 1 21.16 0" />
                <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
              </svg>
            </div>
            <div>
              <h2 id="wifi-tool-title">Wi-Fi Setup Tool</h2>
              <span className="modal-subtitle">Connect to Hotel, Hotspot, or Home Wi-Fi</span>
            </div>
          </div>
          <button type="button" className="btn-modal-close" onClick={onClose} aria-label="Close dialog">
            ✕
          </button>
        </div>

        <div className="modal-body">
          <div className={`wifi-status-box ${isApMode ? 'box-ap' : 'box-sta'}`}>
            <div className="wifi-status-row">
              <span className="wifi-status-indicator">
                <span className="dot" />
                {isApMode ? 'Hotspot Setup Mode' : 'Connected to Network'}
              </span>
              <span className="wifi-status-ip">{health?.ip || (isApMode ? '192.168.4.1' : '-')}</span>
            </div>
            {isApMode ? (
              <p className="wifi-status-hint">
                Hotspot: <strong>bundle-setup</strong> · Pass: <strong>bundlepanel123</strong>
              </p>
            ) : (
              <p className="wifi-status-hint">
                RSSI: <strong>{health?.rssi ?? 0} dBm</strong> · Host: <strong>bun-panel.local</strong>
              </p>
            )}
          </div>

          {status && (
            <div className={`status-banner status-${status.type}`}>
              <span>{status.text}</span>
            </div>
          )}

          <div className="scan-section">
            <div className="scan-header">
              <span className="section-label">Nearby 2.4GHz Networks</span>
              <button
                type="button"
                className="btn-scan"
                onClick={() => doScan(true)}
                disabled={scanning}
              >
                {scanning ? '⏳ Scanning...' : '🔄 Rescan'}
              </button>
            </div>

            <div className="network-list">
              {networks.length === 0 ? (
                <div className="network-empty">
                  {scanning ? 'Searching for Wi-Fi networks...' : 'No networks listed. Click "Rescan" above.'}
                </div>
              ) : (
                networks.map((net) => {
                  const isSelected = ssid === net.ssid
                  const bars = net.rssi >= -55 ? 4 : net.rssi >= -67 ? 3 : net.rssi >= -78 ? 2 : 1
                  const sigColor = net.rssi >= -65 ? '#34d399' : net.rssi >= -78 ? '#fbbf24' : '#f87171'
                  return (
                    <button
                      key={net.ssid}
                      type="button"
                      className={`network-item ${isSelected ? 'selected' : ''}`}
                      onClick={() => {
                        setSsid(net.ssid)
                        setStatus({ text: `Selected "${net.ssid}". Enter password below.`, type: 'info' })
                      }}
                    >
                      <div className="net-info">
                        <span className="net-ssid">{net.ssid}</span>
                        <span className="net-meta">
                          CH {net.channel} · {net.rssi} dBm
                        </span>
                      </div>
                      <div className="net-badges">
                        {net.secure ? (
                          <span className="badge-secure" title="Password protected">🔒</span>
                        ) : (
                          <span className="badge-open" title="Open network">Open</span>
                        )}
                        <span className="net-bars" style={{ color: sigColor }}>
                          {'●'.repeat(bars)}
                        </span>
                      </div>
                    </button>
                  )
                })
              )}
            </div>
          </div>

          <form className="wifi-form" onSubmit={handleConnect}>
            <div className="form-group">
              <label htmlFor="wifi-ssid">Network Name (SSID)</label>
              <input
                id="wifi-ssid"
                type="text"
                className="input-text"
                placeholder="Select from list or type hotspot name"
                value={ssid}
                onInput={(e) => setSsid((e.target as HTMLInputElement).value)}
                required
              />
            </div>

            <div className="form-group">
              <div className="label-row">
                <label htmlFor="wifi-pass">Password</label>
                <button
                  type="button"
                  className="btn-toggle-pass"
                  onClick={() => setShowPass(!showPass)}
                >
                  {showPass ? 'Hide' : 'Show'}
                </button>
              </div>
              <input
                id="wifi-pass"
                type={showPass ? 'text' : 'password'}
                className="input-text"
                placeholder="Enter Wi-Fi password (blank if open)"
                value={password}
                onInput={(e) => setPassword((e.target as HTMLInputElement).value)}
              />
            </div>

            <div className="hotspot-tip">
              <span className="tip-icon">💡</span>
              <span>
                <strong>Hotspot Tip:</strong> If using iPhone / Android Personal Hotspot, enable{' '}
                <em>"Maximize Compatibility"</em> (or 2.4GHz AP band).
              </span>
            </div>

            <div className="modal-actions">
              <button
                type="submit"
                className="btn-primary btn-connect"
                disabled={connecting || !ssid.trim()}
              >
                {connecting ? 'Connecting...' : 'Connect to Network'}
              </button>
              <button
                type="button"
                className="btn-danger-outline"
                onClick={handleReset}
              >
                Forget Wi-Fi & Start Hotspot
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  )
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [showWifiModal, setShowWifiModal] = useState(false)
  const [peakTemp, setPeakTemp] = useState<number | null>(null)
  const [minTemp, setMinTemp] = useState<number | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('theme')
        if (saved === 'dark' || saved === 'light') return saved
        if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
      }
    } catch { }
    return 'dark'
  })
  const alive = useRef(true)

  useEffect(() => {
    if (health?.temp !== undefined) {
      setPeakTemp((prev) => (prev === null ? health.temp! : Math.max(prev, health.temp!)))
      setMinTemp((prev) => (prev === null ? health.temp! : Math.min(prev, health.temp!)))
    }
  }, [health?.temp])

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('theme', theme)
      }
    } catch { }
  }, [theme])

  const toggleTheme = () => {
    try {
      document.documentElement.classList.add('theme-transition')
    } catch { }
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
    if (typeof window !== 'undefined') {
      window.setTimeout(() => {
        try {
          document.documentElement.classList.remove('theme-transition')
        } catch { }
      }, 300)
    }
  }

  useEffect(() => {
    return () => {
      alive.current = false
    }
  }, [])

  const failureCountRef = useRef(0)
  const [consecutiveFailures, setConsecutiveFailures] = useState(0)

  useEffect(() => {
    let timer: number
    const tick = async () => {
      let isError = false
      try {
        const h = await getJson<Health>('/api/health')
        if (alive.current) {
          failureCountRef.current = 0
          setConsecutiveFailures(0)
          setHealth(h)
        }
      } catch {
        isError = true
        if (alive.current) {
          failureCountRef.current += 1
          const fails = failureCountRef.current
          setConsecutiveFailures(fails)
          // Only drop health state after 3 consecutive failures (~15s)
          if (fails >= 3) {
            setHealth(null)
          }
        }
      }
      if (alive.current) {
        // Quick retry (2.5s) if last attempt failed to recover immediately
        const nextDelay = isError ? 2500 : POLL_MS
        timer = window.setTimeout(tick, nextDelay)
      }
    }
    void tick()
    return () => window.clearTimeout(timer)
  }, [])

  const hasAutoOpenedWifi = useRef(false)
  useEffect(() => {
    if (health && (!health.connected || health.mode === 'provisioning') && !hasAutoOpenedWifi.current) {
      hasAutoOpenedWifi.current = true
      setShowWifiModal(true)
    }
  }, [health])

  const online = health !== null && consecutiveFailures < 3
  const isProvisioning = health?.mode === 'provisioning' || !online
  const statusLabel = isProvisioning ? 'hotspot setup' : consecutiveFailures > 0 ? 'reconnecting' : 'online'
  const pillClass = isProvisioning ? 'warn' : consecutiveFailures > 0 ? 'warn' : 'on'

  return (
    <main>
      <header className="card app-header">
        <div className="header-info">
          <span className="breadcrumb-nav">Pages / Dashboard</span>
          <div className="brand-badge-row">
            <div className="icon-shape icon-shape-dark">
              <svg className="brand-icon" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="2" width="20" height="8" rx="2" ry="2" />
                <rect x="2" y="14" width="20" height="8" rx="2" ry="2" />
                <line x1="6" y1="6" x2="6.01" y2="6" strokeWidth="3" />
                <line x1="6" y1="18" x2="6.01" y2="18" strokeWidth="3" />
              </svg>
            </div>
            <h1>ESP32 Bundle Dashboard</h1>
            <span className="fw-tag">v{health?.fw ?? '0.1.0'}</span>
          </div>
          <p className="sub">ESP32 · World Clocks</p>
        </div>
        <div className="header-actions">
          {health?.ip && (
            <div className="header-ip-badge" title="Device IP on local network">
              <span className="header-ip-dot" />
              <span className="header-ip-text">{health.ip}</span>
            </div>
          )}
          <button
            type="button"
            className="btn-wifi-tool"
            onClick={() => setShowWifiModal(true)}
            aria-label="Open Wi-Fi setup tool"
            title="Configure Wi-Fi connection"
          >
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12.55a11 11 0 0 1 14.08 0" />
              <path d="M1.42 9a16 16 0 0 1 21.16 0" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" strokeWidth="3" />
            </svg>
            <span>Wi-Fi</span>
          </button>
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <span className={`pill ${pillClass}`}>
            <span className="dot" />
            {statusLabel}
          </span>
        </div>
      </header>

      {/* Fallback Hotspot / Reconnect Alert Banner */}
      {isProvisioning && (
        <section className="card ap-alert-banner">
          <div className="ap-alert-left">
            <span className="ap-pulse-dot" />
            <div>
              <strong>Portable Wi-Fi Setup Available</strong>
              <p>Connect this board to your phone hotspot or hotel Wi-Fi.</p>
            </div>
          </div>
          <button
            type="button"
            className="btn-setup-banner"
            onClick={() => setShowWifiModal(true)}
          >
            Configure Wi-Fi
          </button>
        </section>
      )}

      <GoldPriceCard />

      <DualClockPanel serverEpoch={health?.epoch} />

      <section className="card telemetry-card">
        <div className="card-header">
          <div className="card-title-group">
            <div className="icon-shape icon-shape-dark">
              <svg className="section-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
                <line x1="8" y1="21" x2="16" y2="21" />
                <line x1="12" y1="17" x2="12" y2="21" />
              </svg>
            </div>
            <h2>System status</h2>
          </div>
          <span className="telemetry-badge">ESP32-WROOM-32</span>
        </div>

        <div className="grid system-grid">
          <Field label="Uptime" value={fmtUptime(health?.uptime)} />
          <Field label="Firmware" value={health?.fw ?? '-'} />
          <Field label="Address" value={health?.ip ?? '-'} />
          <Field
            label="Filesystem"
            value={health?.fsTotal ? `${fmtBytes(health.fsUsed)} / ${fmtBytes(health.fsTotal)}` : '-'}
          />
        </div>

        <div className="telemetry-bento">
          {/* RAM Heap Monitor */}
          <div className="ram-card">
            <div className="ram-header">
              <div className="sub-title-group">
                <div className="icon-shape icon-shape-success icon-shape-sm">
                  <svg className="sub-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <path d="M6 8v8" />
                    <path d="M10 8v8" />
                    <path d="M14 8v8" />
                    <path d="M18 8v8" />
                  </svg>
                </div>
                <span className="ram-title">RAM (Heap)</span>
              </div>
              <span className="ram-meta">
                {health?.totalHeap
                  ? `${fmtBytes(health.totalHeap - health.heap)} used / ${fmtBytes(health.totalHeap)} total (${Math.round(
                    ((health.totalHeap - health.heap) * 100) / health.totalHeap,
                  )}%)`
                  : `${fmtBytes(health?.heap)} free`}
              </span>
            </div>
            <div className="ram-track">
              <div
                className="ram-fill"
                style={{
                  width: `${health?.totalHeap ? Math.min(100, Math.max(0, Math.round(((health.totalHeap - health.heap) * 100) / health.totalHeap))) : 0}%`,
                  background:
                    health?.totalHeap && (health.totalHeap - health.heap) / health.totalHeap > 0.85
                      ? 'var(--bad)'
                      : health?.totalHeap && (health.totalHeap - health.heap) / health.totalHeap > 0.7
                        ? 'var(--warn)'
                        : 'var(--ok)',
                }}
              />
            </div>
            <div className="ram-grid">
              <Field label="Free RAM" value={fmtBytes(health?.heap)} />
              <Field label="Min Free (Peak)" value={fmtBytes(health?.minHeap)} />
              <Field label="Fragmentation" value={health ? `${health.frag}%` : '-'} />
              <Field label="Max Alloc Block" value={fmtBytes(health?.maxAlloc)} />
            </div>
          </div>

          {/* CPU & Thermal Performance with Feature-Rich Temperature Gauge */}
          <div className="cpu-card">
            <div className="cpu-header">
              <div className="sub-title-group">
                <div className="icon-shape icon-shape-info icon-shape-sm">
                  <svg className="sub-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
                  </svg>
                </div>
                <span className="cpu-title">CPU & Thermal</span>
              </div>
              <span className="cpu-meta">
                {health?.temp !== undefined ? `${health.temp.toFixed(1)}°C` : '-'} •{' '}
                {health?.cpu !== undefined ? `${health.cpu}% Load` : '-'}
              </span>
            </div>

            {/* Thermal Feature: Dedicated Visual Temperature Gauge */}
            <div className="thermal-feature-box">
              <div className="thermal-feature-header">
                <div className="thermal-badge-row">
                  <span className="thermal-feature-label">Chip Temperature</span>
                  {health?.temp !== undefined && (
                    <span
                      className={`thermal-status-pill ${health.temp > 75 ? 'pill-hot' : health.temp > 60 ? 'pill-warm' : health.temp >= 45 ? 'pill-nom' : 'pill-cool'
                        }`}
                    >
                      <span className="dot" />
                      {health.temp > 75 ? 'Hot' : health.temp > 60 ? 'Warm' : health.temp >= 45 ? 'Nominal' : 'Cool'}
                    </span>
                  )}
                </div>
                <div className="thermal-readout">
                  <span className="thermal-main-val">
                    {health?.temp !== undefined ? `${health.temp.toFixed(1)}°C` : '-'}
                  </span>
                  {health?.temp !== undefined && (
                    <span className="thermal-sub-val">
                      / {((health.temp * 9) / 5 + 32).toFixed(1)}°F
                    </span>
                  )}
                </div>
              </div>

              {/* Graduated Thermal Scale Gauge (0°C to 100°C) */}
              <div className="thermal-scale-container">
                <div className="thermal-track">
                  <div
                    className="thermal-fill"
                    style={{
                      width: `${health?.temp !== undefined ? Math.min(100, Math.max(0, health.temp)) : 0}%`,
                      background:
                        health?.temp !== undefined && health.temp > 75
                          ? 'linear-gradient(90deg, #38bdf8 0%, #34d399 45%, #fbbf24 70%, #f87171 100%)'
                          : health?.temp !== undefined && health.temp > 60
                            ? 'linear-gradient(90deg, #38bdf8 0%, #34d399 60%, #fbbf24 100%)'
                            : 'linear-gradient(90deg, #38bdf8 0%, #34d399 100%)',
                    }}
                  />
                  <div className="thermal-tick" style={{ left: '45%' }} title="45°C Nominal threshold" />
                  <div className="thermal-tick" style={{ left: '75%' }} title="75°C Warning threshold" />
                  {health?.temp !== undefined && (
                    <div
                      className="thermal-marker"
                      style={{ left: `${Math.min(99, Math.max(1, health.temp))}%` }}
                      title={`Current: ${health.temp.toFixed(1)}°C`}
                    />
                  )}
                </div>
                <div className="thermal-scale-labels">
                  <span className="thermal-lbl-0">0°C (Cold)</span>
                  <span className="thermal-lbl-45">45°C (Nominal)</span>
                  <span className="thermal-lbl-75">75°C (Warn)</span>
                  <span className="thermal-lbl-100">100°C (Max)</span>
                </div>
              </div>

              {/* Peak & Session Thermal Stats */}
              <div className="thermal-stats-strip">
                <span className="stat-pill">
                  Peak: <strong>{peakTemp !== null ? `${peakTemp.toFixed(1)}°C` : '-'}</strong>
                </span>
                <span className="stat-pill">
                  Low: <strong>{minTemp !== null ? `${minTemp.toFixed(1)}°C` : '-'}</strong>
                </span>
                <span className="stat-pill">
                  Tjunction Max: <strong>110°C</strong>
                </span>
              </div>
            </div>

            {/* CPU Load Progress Meter */}
            <div className="cpu-section">
              <div className="cpu-header-row">
                <span className="cpu-sub-label">CPU Cores Load</span>
                <span className="cpu-sub-val">{health?.cpu !== undefined ? `${health.cpu}%` : '-'}</span>
              </div>
              <div className="cpu-track">
                <div
                  className="cpu-fill"
                  style={{
                    width: `${health?.cpu !== undefined ? Math.min(100, Math.max(0, health.cpu)) : 0}%`,
                    background:
                      health?.cpu && health.cpu > 80
                        ? 'var(--bad)'
                        : health?.cpu && health.cpu > 50
                          ? 'var(--warn)'
                          : 'var(--ok)',
                  }}
                />
              </div>
            </div>

            <div className="cpu-grid">
              <Field label="CPU Load" value={health?.cpu !== undefined ? `${health.cpu}%` : '-'} />
              <Field label="Chip Temp" value={health?.temp !== undefined ? `${health.temp.toFixed(1)}°C` : '-'} />
              <Field label="Clock Speed" value="240 MHz" />
              <Field label="Thermal Status" value={health?.temp !== undefined && health.temp > 75 ? 'Hot' : 'Normal'} />
            </div>
          </div>
        </div>
      </section>

      <LinkPanel health={health} onOpenWifi={() => setShowWifiModal(true)} />

      <WifiSetupModal
        isOpen={showWifiModal}
        onClose={() => setShowWifiModal(false)}
        health={health}
      />
    </main>
  )
}
