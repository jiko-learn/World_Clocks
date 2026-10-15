import { useEffect, useRef, useState } from 'react'

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
  rssi: number
  fsUsed?: number
  fsTotal?: number
  epoch?: number
  timeSynced?: boolean
}

const POLL_MS = 5000

function signalColor(rssi: number, connected: boolean): string {
  if (!connected) return '#f85149'
  if (rssi >= -60) return '#3fb950'
  if (rssi >= -72) return '#d29922'
  return '#f85149'
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
  const res = await fetch(url, { cache: 'no-store' })
  if (!res.ok) throw new Error(`${url} -> ${res.status}`)
  return (await res.json()) as T
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field">
      <div className="k">{label}</div>
      <div className="v">{value}</div>
    </div>
  )
}

function LinkPanel({ health }: { health: Health | null }) {
  const isConnected = Boolean(health?.connected)
  const currentRssi = health?.rssi ?? -100
  const color = signalColor(currentRssi, isConnected)
  const label = rssiLabel(currentRssi, isConnected)

  return (
    <section className="card">
      <div className="card-header">
        <h2>Link quality</h2>
        <span className={`pill ${isConnected ? 'on' : 'off'}`}>
          {isConnected ? 'connected' : 'offline'}
        </span>
      </div>
      <div className="field">
        <div className="k">Signal</div>
        <div className="v" style={{ color, fontWeight: 700 }}>
          {label}
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
    accentColor: '#3fb950',
  },
  {
    city: 'New York',
    country: 'United States',
    timeZone: 'America/New_York',
    accentColor: '#58a6ff',
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

const NYC_FORMATTER = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
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

const DIAL_TICKS = Array.from({ length: 60 }, (_, i) => {
  const angle = (i * 6 * Math.PI) / 180
  const isHour = i % 5 === 0
  const isMajor = i % 15 === 0
  const r1 = isMajor ? 34 : isHour ? 37 : 41.5
  const r2 = 44
  const x1 = 50 + r1 * Math.sin(angle)
  const y1 = 50 - r1 * Math.cos(angle)
  const x2 = 50 + r2 * Math.sin(angle)
  const y2 = 50 - r2 * Math.cos(angle)
  return (
    <line
      key={i}
      x1={x1}
      y1={y1}
      x2={x2}
      y2={y2}
      stroke={isMajor ? 'var(--dial-tick-major)' : isHour ? 'var(--dial-tick-hour)' : 'var(--dial-tick-sub)'}
      strokeWidth={isMajor ? 2.2 : isHour ? 1.5 : 0.8}
      strokeLinecap="round"
    />
  )
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
  const hourAngle = ((h % 12) + m / 60 + s / 3600) * 30
  const minuteAngle = (m + s / 60) * 6
  const secondAngle = s * 6

  return (
    <svg className="clock-analog" viewBox="0 0 100 100" role="img" aria-label="Analog clock">
      <circle cx="50" cy="50" r="47" fill="var(--dial-bg)" stroke="var(--line)" strokeWidth="1.5" />
      <circle cx="50" cy="50" r="45" fill="none" stroke="var(--dial-inner-ring)" strokeWidth="0.8" />
      {DIAL_TICKS}
      {/* Hour hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="24"
        stroke="var(--hand-hour)"
        strokeWidth="3.4"
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      {/* Minute hand */}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="15"
        stroke="var(--hand-min)"
        strokeWidth="2.4"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      {/* Second hand with tail */}
      <line
        x1="50"
        y1="58"
        x2="50"
        y2="11"
        stroke={accentColor}
        strokeWidth="1.2"
        strokeLinecap="round"
        transform={`rotate(${secondAngle} 50 50)`}
      />
      <circle cx="50" cy="50" r="3.2" fill={accentColor} />
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
  const nyc = parseZoneParts(now, NYC_FORMATTER, ZONES[1].timeZone)
  const diffHours = (bkk.h - nyc.h + 24) % 24

  return (
    <section className="card clock-card">
      <div className="clock-header">
        <h2>Dual Timezone Clocks</h2>
        <span className={`pill ${serverEpoch ? 'on' : ''}`}>
          {serverEpoch ? '● NTP Synced' : '● Live Clock'}
        </span>
      </div>

      <div className="clock-grid">
        <div className="clock-box">
          <div className="clock-top">
            <span className="clock-city">{ZONES[0].city}</span>
            <span className="clock-badge">
              {bkk.isDay ? '☀️ Day' : '🌙 Night'}
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
              <span>·</span>
              <span>{bkk.tzName}</span>
            </div>
          </div>
        </div>

        <div className="clock-box">
          <div className="clock-top">
            <span className="clock-city">{ZONES[1].city}</span>
            <span className="clock-badge">
              {nyc.isDay ? '☀️ Day' : '🌙 Night'}
            </span>
          </div>
          <AnalogClock h={nyc.h} m={nyc.m} s={nyc.s} accentColor={ZONES[1].accentColor} />
          <div className="clock-content">
            <div className="clock-time-row">
              <span className="clock-digits">{nyc.digits}</span>
              <span className="clock-ampm">{nyc.ampm}</span>
            </div>
            <div className="clock-date">
              <span>{nyc.dateStr}</span>
              <span>·</span>
              <span>{nyc.tzName}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="clock-footer">
        <span>
          Time Difference: <strong className="clock-diff-highlight">{ZONES[0].city} is {diffHours} hours ahead</strong> of {ZONES[1].city}
        </span>
        <span>UTC+7 vs {nyc.tzName}</span>
      </div>
    </section>
  )
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = window.localStorage.getItem('theme')
        if (saved === 'dark' || saved === 'light') return saved
        if (window.matchMedia?.('(prefers-color-scheme: light)').matches) return 'light'
      }
    } catch {}
    return 'dark'
  })
  const alive = useRef(true)

  useEffect(() => {
    try {
      document.documentElement.setAttribute('data-theme', theme)
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('theme', theme)
      }
    } catch {}
  }, [theme])

  const toggleTheme = () => {
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'))
  }

  useEffect(() => {
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let timer: number
    const tick = async () => {
      try {
        const h = await getJson<Health>('/api/health')
        if (alive.current) setHealth(h)
      } catch {
        if (alive.current) setHealth(null)
      }
      timer = window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => window.clearTimeout(timer)
  }, [])

  const online = health !== null

  return (
    <main>
      <header className="card app-header">
        <div className="header-info">
          <h1>Bun Server</h1>
          <p className="sub">ESP32 self-hosted panel</p>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
          >
            {theme === 'dark' ? '☀️ Light' : '🌙 Dark'}
          </button>
          <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'online' : 'offline'}</span>
        </div>
      </header>

      <DualClockPanel serverEpoch={health?.epoch} />

      <section className="card">
        <h2>System status</h2>
        <div className="grid">
          <Field label="Uptime" value={fmtUptime(health?.uptime)} />
          <Field label="Firmware" value={health?.fw ?? '-'} />
          <Field label="Address" value={health?.ip ?? '-'} />
          <Field
            label="Filesystem"
            value={health?.fsTotal ? `${fmtBytes(health.fsUsed)} / ${fmtBytes(health.fsTotal)}` : '-'}
          />
        </div>

        <div className="ram-card">
          <div className="ram-header">
            <span className="ram-title">RAM (Heap)</span>
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
      </section>

      <LinkPanel health={health} />
    </main>
  )
}
