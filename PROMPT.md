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
- Partition Table (`partitions_bundle.csv`):
  - 4MB flash: nvs (0x9000, 20KB), otadata (0xe000, 8KB), app0 (0x10000, 1.875MB), spiffs (0x1F0000, 2.06MB LittleFS).
  - Note: Label the LittleFS partition as "spiffs" because Arduino's LittleFS.h mounts by the "spiffs" label.
- Build Flags:
  - `-Os -DCORE_DEBUG_LEVEL=0`
  - `-DARDUINOJSON_ENABLE_STD_STRING=0 -DARDUINOJSON_ENABLE_STD_STREAM=0 -DARDUINOJSON_ENABLE_ARDUINO_PRINT=0`
- Pre-build Script (`scripts/build_web.py`):
  - SCons script checking SHA-256 fingerprint of `web/` sources.
  - Automatically runs `npm run build` (which compiles and inlines assets into a single `data/index.html.gz`).

### 2. ESP32 Firmware Functionality (`src/`)
- `web_server.cpp`: Mounts LittleFS, serves precompressed `.gz` assets from `/` with `public, max-age=600`, and sets up API routes.
- `api_routes.cpp`:
  - `GET /api/health`: JSON with `ok`, `fw`, `uptime`, `heap`, `minHeap`, `totalHeap`, `maxAlloc`, `frag`, `mode`, `connected`, `ip`, `rssi`, `temp`, `cpu`, `fsUsed`, `fsTotal`, `epoch`, `timeSynced`.
  - `GET /api/time`: Epoch and sync status.
  - `GET /api/config`, `PUT /api/config`, `POST /api/wifi/reset`.
  - `GET /api/link`: Basic RSSI and connection state.
  - Keep RAM lean: Use a single 512-byte reply buffer, no bulky static buffers.
- `system_info.cpp`: Tracks total heap (`ESP.getHeapSize()`), free heap (`ESP.getFreeHeap()`), min free heap (`ESP.getMinFreeHeap()`), max alloc block (`heap_caps_get_largest_free_block()`), heap fragmentation, chip temperature (`systemInfo::chipTemperature()`), CPU load percentage (`systemInfo::cpuLoad()`), uptime, and RSSI.
- `wifi_manager.cpp`: Manages STA mode with NVS persistence (`Preferences`), fallback to provisioning AP, and mDNS responder.
- `console.cpp`: Non-blocking 115200 baud serial CLI with commands: `show`, `ssid <n>`, `pass <p>`, `host <n>`, `scan`, `radio`, `reset`, `reboot`.
- `main.cpp`: Setup and non-blocking loop with 5ms sleep.

### 3. Frontend Web App (`web/`)
- Stack: Vite + React + TypeScript, aliasing `react` and `react-dom` to `preact/compat`.
- Design: UI/UX Pro Max Bento-Grid architecture, Swiss typography, native system fonts (zero external Google font latency).
- Dual-theme UI:
  - Dark mode: OLED-friendly deep slate `#090d16` canvas with `#111827` cards.
  - Light mode: Soft titanium-slate `#ebedf2` canvas with `#ffffff` cards and brushed metallic dials to prevent bleached white-on-white surfaces.
- Components:
  1. Header Card:
     - Title "Bundle Server", firmware version badge, theme toggle button (`☀️ Light` / `🌙 Dark`), and connection status pill with live pulsing indicator dot.
  2. Dual Timezone Clock Card:
     - Two clocks: Bangkok (Asia/Bangkok, UTC+7) and New York (America/New_York, UTC-4/5).
     - Structure per clock: City name, Country tag, Day/Night badge with inline SVGs, 148px SVG analog watch face with cardinal 12/3/6/9 ticks, 36px bold digital tabular digits, AM/PM tag, date, timezone string.
     - Relative time difference banner (`Bangkok is 11 hours ahead of New York · UTC+7 vs EDT`).
  3. System Status & Bento Grid:
     - Primary grid: Uptime, Firmware version, IP address, Filesystem usage (`LittleFS`).
     - RAM (Heap) Card: Visual progress gauge (Used / Total RAM with adaptive color transitions), Free RAM, Peak watermark (`Min Free`), Fragmentation %, and Maximum Allocatable Block.
     - CPU & Thermal Feature Card:
       - Graduated 0°C to 100°C visual thermal track with real-time sliding needle marker.
       - Dual Celsius (`XX.X°C`) and Fahrenheit conversion (`YY.Y°F`).
       - Live thermal status pill (`Cool`, `Nominal`, `Warm`, `Hot`).
       - Session trackers (`Low`, `Peak`, and `Tjunction Max: 110°C`).
       - Dedicated CPU cores load progress bar and 240 MHz clock frequency badge.
  4. Link Quality Card:
     - 4-bar dynamic SVG WiFi signal meter, live RSSI in dBm, link quality rating, and mode.
- Scripts:
  - `scripts/gzip.mjs`: Inlines CSS and JS into `index.html` and precompresses to `index.html.gz` (~14.9 KB total).
  - `scripts/render-test.mjs`: Headless LinkeDOM test suite verifying DOM elements, theme toggle, and thermal telemetry rendering.
```
