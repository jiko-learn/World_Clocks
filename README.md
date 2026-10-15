# ESP32 World Clocks & System Telemetry Server

A lightweight, self-hosted dual timezone world clock and real-time hardware telemetry dashboard for the ESP32. The web frontend is built with modern Vite and Preact, pre-compressed with gzip, and served asynchronously directly from the ESP32's onboard LittleFS flash memory.

---

## Features

- **Luxury Dual Timezone Clocks**:
  - Live analog dials (140px custom SVG) with 60-tick watch dials, cardinal indices (12, 3, 6, 9), styled hour/minute hands, and counterbalanced accent second hands.
  - Large 34px bold digital tabular readout with AM/PM tag, day of the week, date, and timezone (`Asia/Bangkok` & `America/New_York`).
  - Day/Night status badges (`☀️ Day` / `🌙 Night`).
  - Live comparative time difference banner (`Bangkok is 11 hours ahead of New York`).
  - NTP synchronization status (`● NTP Synced` or `● Live Clock`).
- **Hardware Telemetry Dashboard**:
  - Real-time device metrics: Uptime, Free heap, Heap fragmentation %, IP address, Firmware version, and Filesystem usage.
- **Link Quality Indicator**:
  - Clean single-number signal panel displaying live RSSI in dBm with color-coded strength (`#3fb950`, `#d29922`, `#f85149`) and connection status pill.
- **Ultra-Lean Embedded Footprint**:
  - Static RAM usage: **14.8%** (48.6 KB out of 320 KB).
  - Web bundle payload: **~10.5 KB gzipped total** across HTML, CSS, and JS.
  - Zero dynamic heap fragmentation from web transfers.
- **Serial Management Console**:
  - Non-blocking 115,200 baud command-line interface accessible via USB-Serial.

---

## Hardware Requirements

- **Microcontroller**: ESP32 Dev Module (ESP32-D0WD-V3, 4MB Flash, dual-core Xtensa 240MHz).
- **USB Interface**: USB-Serial cable / onboard CH340 or CP2102.
- **Power**: Standard 5V USB.

---

## Project Structure

```
World_Clocks/
├── platformio.ini           # PlatformIO configuration & library pinning
├── partitions_bun.csv       # Custom 4MB partition table (2.06MB LittleFS)
├── scripts/
│   └── build_web.py         # SCons pre-build hook automating npm build
├── src/
│   ├── main.cpp             # Setup and non-blocking main loop
│   ├── api_routes.h/.cpp    # REST API endpoints (/api/health, /api/time, etc.)
│   ├── web_server.h/.cpp    # ESPAsyncWebServer setup & static file routing
│   ├── wifi_manager.h/.cpp  # WiFi STA & AP provisioning management
│   ├── config_store.h/.cpp  # NVS (Preferences) credential storage
│   ├── system_info.h/.cpp   # Memory & hardware metrics collector
│   └── console.h/.cpp       # 115200 baud serial interactive CLI
├── web/                     # Frontend client (Vite + Preact + TypeScript)
│   ├── src/
│   │   ├── App.tsx          # Main dashboard component
│   │   ├── main.tsx         # Preact DOM mount
│   │   └── styles.css       # Lean dark-mode stylesheet (2.9 KB)
│   ├── scripts/
│   │   ├── gzip.mjs         # Asset pre-compression script
│   │   └── render-test.mjs  # Headless LinkeDOM automated test suite
│   ├── vite.config.ts       # Vite config with React-to-Preact aliases
│   └── package.json
└── data/                    # LittleFS root containing pre-gzipped web bundle
    ├── index.html.gz
    └── assets/
        ├── index-*.js.gz
        └── style-*.css.gz
```

---

## Quick Start

### 1. Prerequisites
- [PlatformIO Core](https://platformio.org/) (`pio`)
- [Node.js](https://nodejs.org/) (v18+) & `npm`

### 2. Frontend Development & Test
To develop the frontend with live mock API endpoints:

```bash
cd web
npm install
npm run dev          # Starts local Vite preview at http://localhost:5173
npm run typecheck    # Verifies TypeScript types
npm test             # Runs headless DOM render tests
```

### 3. Build & Flash to ESP32

Plug your ESP32 board into USB, then run:

```bash
# Build the web bundle and LittleFS filesystem image, then flash filesystem
pio run -t uploadfs

# Compile and upload firmware binary
pio run -t upload
```

### 4. Open Serial Monitor

```bash
pio device monitor -b 115200
```

---

## Serial Console Commands

Connect via serial terminal (`115200` baud, newline ending) to configure or inspect the board:

| Command | Description | Example |
| :--- | :--- | :--- |
| `show` | Display current network configuration and hardware status | `show` |
| `ssid <name>` | Set target WiFi network SSID and reconnect | `ssid MyHomeWifi` |
| `pass <key>` | Set target WiFi password and reconnect | `pass Secret123` |
| `host <name>` | Set mDNS hostname | `host world-clocks` |
| `scan` | Scan and list visible WiFi access points with RSSI | `scan` |
| `radio` | Inspect power save mode, TX power, and current RSSI | `radio` |
| `reset` | Clear saved WiFi credentials and enter provisioning mode | `reset` |
| `reboot` | Perform software restart | `reboot` |

---

## REST API Reference

All responses return `application/json` with `Cache-Control: no-store`.

### `GET /api/health`
Returns system telemetry, memory stats, filesystem usage, and NTP epoch.
```json
{
  "ok": true,
  "fw": "0.1.0",
  "uptime": 4242,
  "heap": 233760,
  "minHeap": 214804,
  "frag": 39,
  "mode": "connected",
  "connected": true,
  "ip": "192.168.1.34",
  "rssi": -56,
  "fsUsed": 94208,
  "fsTotal": 2162688,
  "epoch": 1776307200,
  "timeSynced": true
}
```

### `GET /api/time`
Returns current UNIX epoch and sync status.
```json
{
  "epoch": 1776307200,
  "synced": true,
  "uptime": 4242
}
```

### `GET /api/link`
Returns instantaneous signal strength and connection state.
```json
{
  "rssi": -56,
  "connected": true,
  "uptime": 4242
}
```

---

## License

MIT License. Feel free to adapt and customize for your own ESP32 projects.
