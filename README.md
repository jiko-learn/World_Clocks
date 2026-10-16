# ESP32 World Clocks & System Telemetry Server

A lightweight, self-hosted dual timezone world clock and real-time hardware telemetry dashboard for the ESP32. Built with Vite, Preact, and TypeScript, pre-compressed with gzip, and served asynchronously from onboard LittleFS flash memory.

Designed with **`ui-ux-pro-max`** design standards: Swiss minimalism, OLED Dark Mode, tactile Slate Light Mode, and Bento-Box telemetry architecture.

---

## Features

- **Luxury Dual Timezone Clocks**:
  - Live analog dials (148px custom SVG) with 60-tick watch dials, cardinal indices (12, 3, 6, 9), styled hour/minute hands, and counterbalanced accent second hands.
  - Large 36px bold digital tabular readout with AM/PM tag, day of the week, date, and timezone (`Asia/Bangkok` & `America/New_York`).
  - Day/Night status badges with bespoke inline SVGs (`☀️ Day` / `🌙 Night`).
  - Live comparative time difference banner (`Bangkok is 11 hours ahead of New York · UTC+7 vs EDT/EST`).
  - NTP synchronization status (`● NTP Synced` or `● Live Clock`).
- **Chip Temperature & CPU Load Telemetry (Feature Instrument)**:
  - **Dynamic Thermal Scale Gauge (0°C to 100°C)**:
    - Multi-zone gradient track: Cool blue (<45°C), Emerald green (45–60°C), Amber (60–75°C), Alert coral (>75°C).
    - Real-time needle marker tracking temperature.
    - Dual-unit display: Primary Celsius (`38.0°C`) with live Fahrenheit conversion (`100.4°F`).
    - Thermal status indicator: `Cool`, `Nominal`, `Warm`, `Hot`.
    - Session thermal stats: Lowest recorded, Peak recorded, and Silicon limit (`Tjunction Max: 110°C`).
  - **Dedicated CPU Cores Load Meter**:
    - Real-time CPU percentage progress bar (`0–100%`) with adaptive warning thresholds.
    - 240 MHz dual-core clock frequency readout.
- **Hardware Telemetry & RAM Monitor**:
  - Live system stats: Uptime, Firmware version, IP address, and Filesystem storage (`LittleFS`).
  - Dedicated **RAM (Heap) Monitor**:
    - Real-time memory utilization bar with dynamic status color thresholds (Green `< 70%`, Amber `70–85%`, Red `> 85%`).
    - Exact heap statistics: Total dynamic RAM (~320 KB), Used RAM, Free RAM, Peak memory pressure watermark (`Min Free`), Fragmentation %, and Maximum allocatable contiguous block.
- **Link Quality & WiFi Panel**:
  - 4-bar dynamic SVG WiFi signal indicator with live RSSI in dBm, link quality rating, and pulsing status dot.
- **Adaptive Light & Dark Themes (Anti-Glare / High Contrast)**:
  - **OLED Dark Mode**: Deep `#090d16` canvas with `#111827` cards and electric cyan/emerald accents.
  - **Tactile Slate Light Mode**: Soft titanium-slate `#ebedf2` canvas with `#ffffff` cards and brushed metallic dials—eliminates washed-out white zones and provides high contrast (WCAG AAA/AA).
  - Persistent preference storage via browser `localStorage`.
- **Ultra-Lean Embedded Footprint**:
  - Web bundle payload: **~14.9 KB gzipped total** across HTML, CSS, and JS inlined into a single file. Loads in a single TCP packet.
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
├── partitions_bundle.csv    # Custom 4MB partition table (2.06MB LittleFS)
├── scripts/
│   └── build_web.py         # SCons pre-build hook automating npm build
├── src/
│   ├── main.cpp             # Setup and non-blocking main loop
│   ├── api_routes.h/.cpp    # REST API endpoints (/api/health, /api/time, etc.)
│   ├── web_server.h/.cpp    # ESPAsyncWebServer setup & static file routing
│   ├── wifi_manager.h/.cpp  # WiFi STA & AP provisioning management
│   ├── config_store.h/.cpp  # NVS (Preferences) credential storage
│   ├── system_info.h/.cpp   # Memory, CPU load & temperature collector
│   └── console.h/.cpp       # 115200 baud serial interactive CLI
├── web/                     # Frontend client (Vite + Preact + TypeScript)
│   ├── src/
│   │   ├── App.tsx          # Main dashboard component with Thermal Gauge
│   │   ├── main.tsx         # Preact DOM mount
│   │   └── styles.css       # Design-system stylesheet with Dark/Light modes
│   ├── scripts/
│   │   ├── gzip.mjs         # Inlines CSS/JS into single index.html.gz
│   │   └── render-test.mjs  # Headless LinkeDOM automated test suite
│   ├── vite.config.ts       # Vite config with React-to-Preact aliases
│   └── package.json
├── data/                    # LittleFS root containing single inlined index.html.gz
│   └── index.html.gz
└── .agents/skills/          # Installed agent skills (ui-ux-pro-max, caveman)
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

# Build and flash C++ firmware binary
pio run -t upload

# Open serial monitor
pio device monitor -b 115200
```
