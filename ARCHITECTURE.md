# Technical Architecture & Engineering Decisions

This document details the architectural choices, memory optimizations, and build pipelines implemented in **World Clocks**.

---

## 1. Flash Partitioning (`partitions_bun.csv`)

Standard ESP32 boards equipped with 4MB SPI flash typically use the default partition scheme with two OTA application slots (~1.25 MB each). Because OTA is not utilized in this project, allocating space for a second dormant application slot wastes valuable flash memory.

`partitions_bun.csv` reallocates the flash geometry:

| Name | Type | SubType | Offset | Size | Purpose |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `nvs` | `data` | `nvs` | `0x9000` | `20 KB` (`0x5000`) | Non-volatile key-value storage (WiFi credentials) |
| `otadata` | `data` | `ota` | `0xe000` | `8 KB` (`0x2000`) | Boot partition metadata |
| `app0` | `app` | `ota_0` | `0x10000` | `1.875 MB` (`0x1E0000`) | Firmware application binary |
| `spiffs` | `data` | `spiffs` | `0x1F0000` | `2.0625 MB` (`0x210000`) | LittleFS web asset storage |

> [!NOTE]
> The LittleFS partition is explicitly named `spiffs` because Arduino core's `LittleFS.h` mounts by partition name (`"spiffs"` label) rather than filesystem subtype.

---

## 2. Automated SCons Pipeline (`scripts/build_web.py`)

PlatformIO hooks `scripts/build_web.py` into the SCons build lifecycle via `extra_scripts = pre:scripts/build_web.py`.

```
        Developer modifies web/src/*
                     │
                     ▼
  SCons checks SHA-256 fingerprint (.build-stamp)
   ├── Matches current fingerprint ──> Skip npm build (fast firmware iterations)
   └── Content changed:
         1. Invokes `npm run build`
         2. Vite bundles JS/CSS into data/
         3. `gzip.mjs` pre-compresses into .gz
         4. SCons packs data/ into LittleFS image
```

### Pre-compression Advantage
Browsers sending `Accept-Encoding: gzip` receive pre-compressed `.gz` assets directly from flash. The ESP32 does **not** compress files dynamically on-the-fly, avoiding CPU spikes and dynamic memory allocations.

---

## 3. Microcontroller RAM Optimizations

Embedded microcontrollers operate under strict memory constraints (320 KB SRAM shared between system heap, RTOS tasks, and network stack).

### Optimizations Applied:
1. **Eliminated Large Static Buffers**:
   - Replaced a legacy 4,096-byte serialization buffer (`linkBuffer[4096]`) with a lean 512-byte reply buffer.
2. **Retired Redundant Background Loop (`link_monitor`)**:
   - Removed a 60-sample ring buffer that polled RSSI every 5 seconds. Instantaneous RSSI is read on-demand during `/api/health` queries.
   - **Result**: Static RAM reduced from **53,224 bytes (16.2%)** to **48,632 bytes (14.8%)** — freeing **~4.6 KB permanent static RAM**.
3. **ArduinoJson Trim Flags**:
   - `-DARDUINOJSON_ENABLE_STD_STRING=0`
   - `-DARDUINOJSON_ENABLE_STD_STREAM=0`
   - `-DARDUINOJSON_ENABLE_ARDUINO_PRINT=0`
   Prevents pulling in heavy C++ standard library streams and strings.

### RAM & Heap Monitoring Telemetry:
To provide comprehensive visibility into ESP32 memory health without polling overhead, `systemInfo` exposes:
- **`ESP.getHeapSize()` (`totalHeap`)**: The total dynamic DRAM allocated to the heap region (~327 KB).
- **`ESP.getFreeHeap()` (`heap`)**: Instantaneous available bytes.
- **`ESP.getMinFreeHeap()` (`minHeap`)**: Lowest recorded free memory since boot, pinpointing the peak memory usage watermark.
- **`heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT)` (`maxAlloc`)**: Largest contiguous allocatable block, exposing memory fragmentation severity beyond a raw percentage.
- **`heap_caps_get_free_size()` vs largest block (`frag`)**: Derived fragmentation percentage (`100 - (largest * 100 / free)`).

---

## 4. Frontend Runtime & Rendering Optimizations

The client dashboard is optimized for smooth 60 FPS operation with minimal garbage collection.

### 1. Preact Aliasing
In `web/vite.config.ts`:
```ts
alias: [
  { find: 'react-dom/client', replacement: 'preact/compat/client' },
  { find: 'react-dom', replacement: 'preact/compat' },
  { find: 'react', replacement: 'preact/compat' },
]
```
Replaces React 19 (~223 KB raw) with Preact's lightweight compatibility layer, dropping the gzipped bundle to **~9.2 KB**.

### 2. Static Dial Geometry
In `AnalogClock`, the 60 watch dial tick markers are computed once at module load as a constant (`DIAL_TICKS`), avoiding the instantiation of 60 SVG line components on every second tick per clock.

### 3. Cached `Intl.DateTimeFormat` Formatters
Two formatter instances (`BKK_FORMATTER` and `NYC_FORMATTER`) are instantiated once globally, preventing repeated object creation on every 1,000 ms timer interval.

### 4. Non-Overflowing Card Layout
Each clock card adopts a centered vertical flow:
- Header: City + Day/Night badge (`width: 100%`)
- Center: 140px analog clock dial
- Bottom: 34px tabular digits, AM/PM tag, date, and timezone.
This guarantees zero horizontal spillage or clipping on displays ranging from 320px mobile to desktop.

### 5. Dedicated RAM & Heap Visualizer
Inside the System Status section, a specialized nested `.ram-card` visualizes memory state:
- **Adaptive Progress Track**: Dynamically transitions fill color:
  - `< 70%`: Healthy Emerald (`var(--ok)`)
  - `70% - 85%`: Elevated Amber (`var(--warn)`)
  - `> 85%`: Critical Coral (`var(--bad)`)
- **Sub-Grid Breakdowns**: Displays Free RAM, Peak Watermark (`Min Free`), Fragmentation %, and Maximum Allocatable Block without triggering mobile layout overflow.

### 6. Dual Light/Dark Theme Engine
- **Tokenized CSS Variables**: Global colors are defined under `:root` (dark default) and `[data-theme="light"]`.
- **Analog Clock Scalability**: SVG dial elements, concentric border rings, indices, and watch hands bind to CSS variables (`var(--dial-bg)`, `var(--hand-hour)`, `var(--dial-tick-major)`), enabling seamless theme transitions without re-mounting or re-rendering SVG DOM nodes.
- **Resilient Persistence**: Theme preference uses a fault-tolerant initialization chain:
  `localStorage` -> `prefers-color-scheme` media query -> Dark default fallback. Safe for headless SSR/LinkeDOM.
