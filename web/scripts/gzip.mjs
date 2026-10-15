import { gzipSync } from 'node:zlib'
import { readdirSync, readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { dirname, join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const projectDir = dirname(dirname(dirname(fileURLToPath(import.meta.url))))
const dataDir = join(projectDir, 'data')

// Already-compressed formats: gzip would not shrink them meaningfully.
const SKIP_EXT = new Set(['.gz', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.woff', '.woff2', '.zip', '.br'])

// Below this, gzip framing costs more than it saves.
const MIN_BYTES = 256

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

const targets = walk(dataDir).filter((f) => !SKIP_EXT.has(extname(f).toLowerCase()))

let rawTotal = 0
let gzTotal = 0
let count = 0

for (const file of targets) {
  const raw = readFileSync(file)
  if (raw.length < MIN_BYTES) {
    console.log(`[web] skip ${relative(dataDir, file)} (${raw.length} B)`)
    continue
  }

  const gz = gzipSync(raw, { level: 9 })
  writeFileSync(`${file}.gz`, gz)
  // The original MUST go: ESPAsyncWebServer's AsyncFileResponse opens the
  // plain path first and only falls back to <path>.gz. If both exist the
  // plain file wins and the compression is silently unused.
  unlinkSync(file)

  rawTotal += raw.length
  gzTotal += gz.length
  count += 1
  console.log(`[web] gz ${relative(dataDir, file)}: ${raw.length} -> ${gz.length} B`)
}

if (count > 0) {
  console.log(
    `[web] precompressed ${count} file(s): ${rawTotal} -> ${gzTotal} B ` +
      `(${(100 - (gzTotal * 100) / rawTotal).toFixed(1)}% smaller)`,
  )
} else {
  console.log('[web] nothing to precompress')
}
