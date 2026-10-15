import { useCallback, useEffect, useRef, useState } from 'react'

type Health = {
  ok: boolean
  fw: string
  uptime: number
  heap: number
  minHeap: number
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

type Config = {
  ssid: string
  hostname: string
  hasPassword: boolean
  useStaticIp: boolean
}

type LinkSample = { rssi: number; c: boolean; m: number }

type LinkData = {
  intervalMs: number
  reconnects: number
  count: number
  samples: LinkSample[]
}

type Status = { kind: 'idle' } | { kind: 'busy' } | { kind: 'ok'; text: string } | { kind: 'err'; text: string }

const POLL_MS = 5000

// RSSI -> bar height. Floor/ceiling chosen to make ordinary variation
// visible instead of a flat line pinned near the top.
const RSSI_FLOOR = -90
const RSSI_CEIL = -30

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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="row">
      <span>{label}</span>
      <span>{value}</span>
    </div>
  )
}

function LinkPanel({ data }: { data: LinkData | null }) {
  if (!data || data.samples.length === 0) {
    return (
      <section className="card">
        <h2>Link quality</h2>
        <p className="sub">collecting samples…</p>
      </section>
    )
  }

  const samples = data.samples
  const width = 320
  const height = 56
  const barW = width / Math.max(samples.length, 1)
  const span = RSSI_CEIL - RSSI_FLOOR

  const bars = samples.map((s, i) => {
    const clamped = Math.max(RSSI_FLOOR, Math.min(RSSI_CEIL, s.rssi))
    const h = ((clamped - RSSI_FLOOR) / span) * height
    return (
      <rect
        key={i}
        x={i * barW}
        y={height - h}
        width={Math.max(barW - 1, 0.6)}
        height={h}
        fill={signalColor(s.rssi, s.c)}
      />
    )
  })

  const connectedSamples = samples.filter((s) => s.c)
  const avg =
    connectedSamples.length > 0
      ? Math.round(
          connectedSamples.reduce((a, s) => a + s.rssi, 0) / connectedSamples.length,
        )
      : null
  const worst = connectedSamples.length > 0
    ? Math.min(...connectedSamples.map((s) => s.rssi))
    : null
  const offlineCount = samples.filter((s) => !s.c).length

  return (
    <section className="card">
      <h2>Link quality</h2>
      <p className="sub">
        RSSI over the last {Math.round((samples.length * data.intervalMs) / 1000)}s · one sample
        every {Math.round(data.intervalMs / 1000)}s
      </p>
      <svg className="chart" viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img"
        aria-label="Signal strength history">
        <line x1="0" y1={height * 0.33} x2={width} y2={height * 0.33} className="gridline" />
        <line x1="0" y1={height * 0.66} x2={width} y2={height * 0.66} className="gridline" />
        {bars}
      </svg>
      <div className="row">
        <span>Current</span>
        <span>
          {rssiLabel(samples[samples.length - 1].rssi, samples[samples.length - 1].c)}
        </span>
      </div>
      <div className="row">
        <span>Average / worst</span>
        <span>
          {avg === null ? '-' : `${avg} / ${worst} dBm`}
        </span>
      </div>
      <div className="row">
        <span>Offline samples</span>
        <span>{offlineCount} of {samples.length}</span>
      </div>
      <div className="row">
        <span>Reconnects</span>
        <span>{data.reconnects}</span>
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

function parseZoneParts(date: Date, timeZone: string) {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    }).formatToParts(date)

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

  const ticks = Array.from({ length: 12 }, (_, i) => {
    const angle = (i * 30 * Math.PI) / 180
    const isMajor = i % 3 === 0
    const r1 = isMajor ? 36 : 40
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
        stroke={isMajor ? '#e6edf3' : '#30363d'}
        strokeWidth={isMajor ? 1.8 : 1}
        strokeLinecap="round"
      />
    )
  })

  return (
    <svg className="clock-analog" viewBox="0 0 100 100" role="img" aria-label="Analog clock">
      <circle cx="50" cy="50" r="46" fill="#040608" stroke="var(--line)" strokeWidth="1.5" />
      {ticks}
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="26"
        stroke="#e6edf3"
        strokeWidth="3.2"
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 50 50)`}
      />
      <line
        x1="50"
        y1="50"
        x2="50"
        y2="16"
        stroke="#8b949e"
        strokeWidth="2.2"
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} 50 50)`}
      />
      <line
        x1="50"
        y1="57"
        x2="50"
        y2="13"
        stroke={accentColor}
        strokeWidth="1.2"
        strokeLinecap="round"
        transform={`rotate(${secondAngle} 50 50)`}
      />
      <circle cx="50" cy="50" r="3.2" fill={accentColor} />
      <circle cx="50" cy="50" r="1.2" fill="#000000" />
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

  const bkk = parseZoneParts(now, ZONES[0].timeZone)
  const nyc = parseZoneParts(now, ZONES[1].timeZone)
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
          <AnalogClock h={bkk.h} m={bkk.m} s={bkk.s} accentColor={ZONES[0].accentColor} />
          <div className="clock-content">
            <div className="clock-top">
              <span className="clock-city">{ZONES[0].city}</span>
              <span className="clock-badge">
                {bkk.isDay ? '☀️ Day' : '🌙 Night'} · {bkk.tzName}
              </span>
            </div>
            <div className="clock-time-row">
              <span className="clock-digits">{bkk.digits}</span>
              <span className="clock-ampm">{bkk.ampm}</span>
            </div>
            <div className="clock-date">{bkk.dateStr}</div>
          </div>
        </div>

        <div className="clock-box">
          <AnalogClock h={nyc.h} m={nyc.m} s={nyc.s} accentColor={ZONES[1].accentColor} />
          <div className="clock-content">
            <div className="clock-top">
              <span className="clock-city">{ZONES[1].city}</span>
              <span className="clock-badge">
                {nyc.isDay ? '☀️ Day' : '🌙 Night'} · {nyc.tzName}
              </span>
            </div>
            <div className="clock-time-row">
              <span className="clock-digits">{nyc.digits}</span>
              <span className="clock-ampm">{nyc.ampm}</span>
            </div>
            <div className="clock-date">{nyc.dateStr}</div>
          </div>
        </div>
      </div>

      <div className="clock-footer">
        <span>
          Time Difference: <strong className="clock-diff-highlight">{bkk.city} is {diffHours} hours ahead</strong> of {nyc.city}
        </span>
        <span>UTC+7 vs {nyc.tzName}</span>
      </div>
    </section>
  )
}

export default function App() {
  const [health, setHealth] = useState<Health | null>(null)
  const [link, setLink] = useState<LinkData | null>(null)
  const [config, setConfig] = useState<Config | null>(null)
  const [ssid, setSsid] = useState('')
  const [pass, setPass] = useState('')
  const [host, setHost] = useState('')
  const [status, setStatus] = useState<Status>({ kind: 'idle' })
  const alive = useRef(true)

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
      try {
        const l = await getJson<LinkData>('/api/link')
        if (alive.current) setLink(l)
      } catch {
        if (alive.current) setLink(null)
      }
      timer = window.setTimeout(tick, POLL_MS)
    }
    void tick()
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    void (async () => {
      try {
        const c = await getJson<Config>('/api/config')
        if (!alive.current) return
        setConfig(c)
        setSsid(c.ssid ?? '')
        setHost(c.hostname ?? '')
      } catch {
        /* panel still renders without it */
      }
    })()
  }, [])

  const save = useCallback(async () => {
    setStatus({ kind: 'busy' })
    try {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ssid, password: pass, hostname: host }),
      })
      const body = (await res.json()) as { ok?: boolean; error?: string; reconnecting?: boolean }
      if (!res.ok || !body.ok) {
        setStatus({ kind: 'err', text: `Error: ${body.error ?? res.status}` })
        return
      }
      setPass('')
      setStatus({
        kind: 'ok',
        text: body.reconnecting ? 'Saved. Reconnecting to WiFi...' : 'Saved.',
      })
    } catch {
      setStatus({ kind: 'err', text: 'Error: request failed' })
    }
  }, [ssid, pass, host])

  const forget = useCallback(async () => {
    if (!window.confirm('Forget the saved WiFi network and start provisioning?')) return
    setStatus({ kind: 'busy' })
    try {
      await fetch('/api/wifi/reset', { method: 'POST' })
      setConfig(null)
      setSsid('')
      setPass('')
      setStatus({ kind: 'ok', text: 'Credentials cleared. Device is provisioning.' })
    } catch {
      setStatus({ kind: 'err', text: 'Error: request failed' })
    }
  }, [])

  const online = health !== null

  return (
    <main>
      <header>
        <h1>Bun Server</h1>
        <p className="sub">ESP32 self-hosted panel</p>
        <span className={`pill ${online ? 'on' : 'off'}`}>{online ? 'online' : 'offline'}</span>
      </header>

      <DualClockPanel serverEpoch={health?.epoch} />

      <section className="card">
        <div className="grid">
          <Field label="Uptime" value={fmtUptime(health?.uptime)} />
          <Field label="Free heap" value={fmtBytes(health?.heap)} />
          <Field label="Fragmentation" value={health ? `${health.frag}%` : '-'} />
          <Field label="Address" value={health?.ip ?? '-'} />
        </div>
      </section>

      <section className="card">
        <Row label="WiFi mode" value={health?.mode ?? '-'} />
        <Row label="Signal" value={health?.connected ? `${health.rssi} dBm` : '-'} />
        <Row label="Firmware" value={health?.fw ?? '-'} />
        <Row
          label="Filesystem"
          value={health?.fsTotal ? `${fmtBytes(health.fsUsed)} / ${fmtBytes(health.fsTotal)}` : '-'}
        />
      </section>

      <LinkPanel data={link} />

      <section className="card">
        <h2>WiFi settings</h2>
        <label htmlFor="ssid">SSID</label>
        <input id="ssid" value={ssid} autoComplete="off" onChange={(e) => setSsid(e.target.value)} />
        <label htmlFor="pass">Password</label>
        <input
          id="pass"
          type="password"
          value={pass}
          autoComplete="new-password"
          placeholder={config?.hasPassword ? 'unchanged' : ''}
          onChange={(e) => setPass(e.target.value)}
        />
        <label htmlFor="host">Hostname</label>
        <input id="host" value={host} autoComplete="off" onChange={(e) => setHost(e.target.value)} />
        <div className="actions">
          <button onClick={save} disabled={status.kind === 'busy'}>
            Save and reconnect
          </button>
          <button className="ghost" onClick={forget} disabled={status.kind === 'busy'}>
            Forget network
          </button>
        </div>
        <div className="msg">{status.kind === 'ok' || status.kind === 'err' ? status.text : ''}</div>
      </section>
    </main>
  )
}
