# Technical Architecture & Engineering Decisions

This document details the architectural choices, memory optimizations, thermal telemetry subsystem, and build pipelines implemented in **World Clocks**.

---

## 1. Flash Partitioning (`partitions_bundle.csv`)

Standard ESP32 boards equipped with 4MB SPI flash typically use the default partition scheme with two OTA application slots (~1.25 MB each). Because OTA is not utilized in this project, allocating space for a second dormant application slot wastes valuable flash memory.

`partitions_bundle.csv` reallocates the flash geometry:

| Name | Type | SubType | Offset | Size | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `nvs` | `data` | `nvs` | `0x9000` | `20 KB` (`0x5000`) | Non-volatile key-value storage (WiFi credentials) |
| `otadata` | `data` | `ota` | `0xe000` | `8 KB` (`0x2000`) | Boot partition metadata |
| `app0` | `app` | `ota_0` | `0x10000` | `1.875 MB` (`0x1E0000`) | Firmware application binary |
| `spiffs` | `data` | `spiffs` | `0x1F0000` | `2.0625 MB` (`0x210000`) | LittleFS web asset storage |

> [!NOTE]
> The LittleFS partition is explicitly named `spiffs` because Arduino core's `LittleFS.h` mounts by partition name (`"spiffs"` label) rather than filesystem subtype.

---

## 2. Automated Build & Single-Payload Inlining Pipeline (`scripts/gzip.mjs`)

PlatformIO hooks `scripts/build_web.py` into the SCons build lifecycle via `extra_scripts = pre:scripts/build_web.py`.

```
        Developer modifies web/src/*
                     │
                     ▼
  SCons checks SHA-256 fingerprint (.build-stamp)
   ├── Matches current fingerprint ──> Skip npm build (fast firmware iterations)
   └── Content changed:
         1. Invokes `npm run build`
         2. Vite bundles JS & CSS
         3. `gzip.mjs` inlines CSS `<style>` and JS `<script>` into index.html
         4. Removes external asset directory
         5. Level-9 gzip compresses `index.html` into `index.html.gz` (~14.9 KB)
         6. SCons packs data/ into LittleFS image
```

### Single-File Inlining Advantage:
Browsers open up to 6 connections per origin, but ESPAsyncWebServer has a limited number of active TCP client slots on embedded chips. Serving JS and CSS as separate external HTTP requests causes network stalling, head-of-line blocking, and TCP connection resets on poor 2.4 GHz WiFi links. Inlining into a single self-contained gzipped HTML file ensures the entire dashboard transfers in a single HTTP request.

---

## 3. Microcontroller RAM & Telemetry Optimizations

Embedded microcontrollers operate under strict memory constraints (320 KB SRAM shared between system heap, RTOS tasks, and network stack).

### Optimizations Applied:
1. **Eliminated Large Static Buffers**:
   - Replaced a legacy 4,096-byte serialization buffer (`linkBuffer[4096]`) with a lean 512-byte reply buffer.
2. **Instantaneous Telemetry vs Polling Rings**:
   - Polling ring buffers in C++ burn valuable heap. Real-time metrics are read on-demand during `/api/health` queries.
   - **Result**: Static RAM reduced to **14.8%** (~48.6 KB) — preserving over 85% of dynamic memory.
3. **ArduinoJson Trim Flags**:
   - `-DARDUINOJSON_ENABLE_STD_STRING=0`
   - `-DARDUINOJSON_ENABLE_STD_STREAM=0`
   - `-DARDUINOJSON_ENABLE_ARDUINO_PRINT=0`
   Prevents pulling in heavy C++ standard library streams and strings.

### CPU & Thermal Monitoring Subsystem:
- **`systemInfo::chipTemperature()`**: Reads internal ESP32 TSENS diode via `temperatureRead()` on supported silicon revisions, rounded to 1 decimal place.
- **`systemInfo::cpuLoad()`**: Calculates real-time CPU core utilization based on idle task hooks or runtime cycle counters.
- **Heap Diagnostics**:
  - `totalHeap`: Total DRAM pool allocated to dynamic heap.
  - `heap`: Instantaneous free bytes.
  - `minHeap`: Watermark lowest free memory since boot.
  - `maxAlloc`: Largest allocatable block via `heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT)`.
  - `frag`: Memory fragmentation percentage.

---

## 4. Frontend Runtime & UI/UX Pro Max Architecture

The client dashboard is optimized for sub-100ms first paint and smooth 60 FPS operation with minimal garbage collection.

### 1. Preact Aliasing
In `web/vite.config.ts`, `react` and `react-dom` are aliased to `preact/compat`. Drops the bundle size by over 85% compared to full React 19.

### 2. Zero External Assets (No Google Fonts / CDN)
External web fonts require DNS lookup, TLS handshake, and network transfers that block rendering on slow connections. All typography uses native system font stacks (`-apple-system`, `BlinkMacSystemFont`, `Segoe UI`, `Roboto`) with `font-variant-numeric: tabular-nums` for rock-solid tabular data alignment.

### 3. Tactile Light Mode Architecture
Standard flat light themes suffer from washed-out white-on-white surfaces. The light mode implements an architectural titanium-slate canvas (`#ebedf2`) against crisp white cards (`#ffffff`), brushed metallic dials (`#e2e8f0` with radial highlights), and high-contrast borders (`#cbd5e1`), achieving strict WCAG AAA/AA contrast.

### 4. Interactive Thermal Feature Instrument
- 0°C to 100°C graduated visual gauge with real-time sliding needle marker.
- Live temperature conversion between Celsius and Fahrenheit.
- Session peak and low tracking in local state.
- Thermal zone status pills: `Cool` (<45°C), `Nominal` (45–60°C), `Warm` (60–75°C), `Hot` (>75°C).

### 5. Static Dial Geometry & Cached Formatters
Tick lines on analog clocks are precomputed at module load, and `Intl.DateTimeFormat` instances are cached to eliminate periodic memory churn on 1-second intervals.
