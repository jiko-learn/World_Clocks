# Reproduction Prompt for World Clocks Project

Use the following complete, turnkey prompt to reproduce this exact project from scratch in any fresh workspace with an AI agent or developer:

---

```markdown
Create an ESP32 self-hosted Dual Timezone World Clock & System Monitor project using PlatformIO and a modern Vite/Preact frontend stored in LittleFS.

### 1. PlatformIO & Firmware Architecture
- Board: `esp32dev`, platform `espressif32@6.2.0`, framework `arduino`, monitor speed `115200`.
- Libraries (pinned exact):
  - `ESP32Async/ESPAsyncWebServer @ 3.12.1`
  - `ESP32Async/AsyncTCP @ 3.5.0`
  - `bblanchon/ArduinoJson @ 7.4.3`
- Partition Table (`partitions_bun.csv`):
  - 4MB flash: nvs (0x9000, 20KB), otadata (0xe000, 8KB), app0 (0x10000, 1.875MB), spiffs (0x1F0000, 2.06MB LittleFS).
  - Note: Label the LittleFS partition as "spiffs" because Arduino's LittleFS.h mounts by the "spiffs" label.
- Build Flags:
  - `-Os -DCORE_DEBUG_LEVEL=0`
  - `-DARDUINOJSON_ENABLE_STD_STRING=0 -DARDUINOJSON_ENABLE_STD_STREAM=0 -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0`
- Pre-build Script (`scripts/build_web.py`):
  - SCons script that checks content hashes of `web/` sources.
  - Automatically runs `npm run build` (which compiles and gzips assets into `data/`).

### 2. ESP32 Firmware Functionality (`src/`)
- `web_server.cpp`: Mounts LittleFS, serves precompressed `.gz` assets from `/` with `public, max-age=600`, and sets up API routes.
- `api_routes.cpp`:
  - `GET /api/health`: JSON with `ok`, `fw`, `uptime`, `heap`, `minHeap`, `totalHeap`, `maxAlloc`, `frag`, `mode`, `connected`, `ip`, `rssi`, `fsUsed`, `fsTotal`, `epoch`, `timeSynced`.
  - `GET /api/time`: Epoch and sync status.
  - `GET /api/config`, `PUT /api/config`, `POST /api/wifi/reset`.
  - `GET /api/link`: Basic RSSI and connection state.
  - Keep RAM lean: Use a single 512-byte reply buffer, no bulky 4KB static buffers.
- `system_info.cpp`: Tracks total heap (`ESP.getHeapSize()`), free heap (`ESP.getFreeHeap()`), min free heap (`ESP.getMinFreeHeap()`), max alloc block (`heap_caps_get_largest_free_block()`), heap fragmentation, uptime, and RSSI.
- `wifi_manager.cpp`: Manages STA mode with NVS persistence (`Preferences`), fallback to provisioning AP, and mDNS responder.
- `console.cpp`: Non-blocking 115200 baud serial CLI with commands: `show`, `ssid <n>`, `pass <p>`, `host <n>`, `scan`, `radio`, `reset`, `reboot`.
- `main.cpp`: Setup and non-blocking loop with 5ms sleep.

### 3. Frontend Web App (`web/`)
- Stack: Vite + React + TypeScript, aliasing `react` and `react-dom` to `preact/compat`.
- Single-page dark mode UI (`#000000` background, `#0d1117` cards, `#21262d` borders, `#3fb950` accent):
  1. Top Header Card:
     - Title "Bun Server", subtitle "ESP32 self-hosted panel", and live status pill (`● online` / `○ offline`).
  2. Dual Timezone Clock Card:
     - Two clocks: Bangkok (Asia/Bangkok, UTC+7) and New York (America/New_York, UTC-4/5).
     - Structure per clock card:
       - Header: City name (`font-weight: 700`) and Day/Night badge (`☀️ Day` / `🌙 Night`).
       - Center: 140px SVG analog watch face with precomputed 60-tick dial (cardinal 12/3/6/9 markers), smooth hour/minute hands, and accent second hand with counter-balance tail.
       - Bottom: 34px bold digital tabular numbers (`02:33:15 PM`), followed by date and timezone string (`Fri, Oct 16 · Asia/Bangkok`).
       - Reusable top-level `Intl.DateTimeFormat` instances to prevent garbage collection churn.
     - Footer: Time difference summary banner (`Bangkok is 11 hours ahead of New York · UTC+7 vs EDT`).
  3. System Status Card:
     - Primary grid: Uptime, Firmware version, IP address, Filesystem usage (`LittleFS`).
     - Dedicated RAM (Heap) Section:
       - Visual progress gauge showing Used / Total RAM with adaptive color transitions (`#3fb950` < 70%, `#d29922` 70-85%, `#f85149` > 85%).
       - Metric sub-grid: Free RAM, Peak watermark (`Min Free`), Fragmentation %, and Maximum Allocatable Block.
  4. Link Quality Card:
     - Strictly 1 single number panel: Header with status pill, label "Signal", and bold colored dBm value (e.g. `-56 dBm`).
- No form inputs, SSID/password fields, or history bar charts on the main dashboard.
- Scripts:
  - `scripts/gzip.mjs`: Compresses `data/` assets (`index.html.gz`, `style-*.css.gz`, `index-*.js.gz`).
  - `scripts/render-test.mjs`: Node LinkeDOM test suite verifying that all DOM elements render without regression.
```
