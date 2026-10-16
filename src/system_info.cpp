#include "system_info.h"

#include <WiFi.h>
#include <esp_freertos_hooks.h>
#include <esp_heap_caps.h>

namespace {

constexpr uint32_t kLogIntervalMs = 30000;
uint32_t lastLogAt = 0;

volatile uint32_t idleTicksCore0 = 0;
volatile uint32_t idleTicksCore1 = 0;
uint32_t prevIdleTicks0 = 0;
uint32_t prevIdleTicks1 = 0;
uint32_t baselineIdle0 = 0;
uint32_t baselineIdle1 = 0;
uint32_t lastCpuSampleAt = 0;
uint8_t currentCpuLoad = 0;

float cachedChipTemp = 0.0f;
uint32_t lastTempSampleAt = 0;

bool idleHookCore0() {
  idleTicksCore0++;
  return true;
}

bool idleHookCore1() {
  idleTicksCore1++;
  return true;
}

void updateCpuLoad(uint32_t elapsedMs) {
  if (elapsedMs == 0) {
    return;
  }

  const uint32_t t0 = idleTicksCore0;
  const uint32_t t1 = idleTicksCore1;
  const uint32_t delta0 = t0 - prevIdleTicks0;
  const uint32_t delta1 = t1 - prevIdleTicks1;
  prevIdleTicks0 = t0;
  prevIdleTicks1 = t1;

  // Rate normalized to 1000ms
  const uint32_t rate0 = (delta0 * 1000) / elapsedMs;
  const uint32_t rate1 = (delta1 * 1000) / elapsedMs;

  // Dynamically record peak idle loops as 100% idle baseline
  if (rate0 > baselineIdle0) {
    baselineIdle0 = rate0;
  }
  if (rate1 > baselineIdle1) {
    baselineIdle1 = rate1;
  }

  int load0 = 0;
  if (baselineIdle0 > 0) {
    load0 = 100 - static_cast<int>((static_cast<uint64_t>(rate0) * 100ULL) / baselineIdle0);
    if (load0 < 0) load0 = 0;
    if (load0 > 100) load0 = 100;
  }

  int load1 = 0;
  if (baselineIdle1 > 0) {
    load1 = 100 - static_cast<int>((static_cast<uint64_t>(rate1) * 100ULL) / baselineIdle1);
    if (load1 < 0) load1 = 0;
    if (load1 > 100) load1 = 100;
  }

  currentCpuLoad = static_cast<uint8_t>((load0 + load1) / 2);
}

void updateTemperature() {
  const float raw = temperatureRead();
  if (raw > 0.0f && raw < 120.0f) {
    if (cachedChipTemp <= 0.0f) {
      cachedChipTemp = raw;
    } else {
      cachedChipTemp = (0.7f * cachedChipTemp) + (0.3f * raw);
    }
  }
}

}  // namespace

namespace systemInfo {

void begin() {
  lastLogAt = millis();
  lastCpuSampleAt = millis();
  lastTempSampleAt = millis();

  esp_register_freertos_idle_hook_for_cpu(idleHookCore0, 0);
  esp_register_freertos_idle_hook_for_cpu(idleHookCore1, 1);

  updateTemperature();
}

void recordWorkTime(uint32_t /*workMicros*/) {
  // Retained for API compatibility; FreeRTOS idle hook tracks true dual-core load
}

void loop() {
  const uint32_t now = millis();
  const uint32_t elapsedCpu = now - lastCpuSampleAt;

  if (elapsedCpu >= 1000) {
    lastCpuSampleAt = now;
    updateCpuLoad(elapsedCpu);
  }

  if (now - lastTempSampleAt >= 2000) {
    lastTempSampleAt = now;
    updateTemperature();
  }

  if (now - lastLogAt < kLogIntervalMs) {
    return;
  }
  lastLogAt = now;
  Serial.printf("[sys] heap=%lu free, frag=%u%%, cpu=%u%%, temp=%.1fC, uptime=%lus\n",
                static_cast<unsigned long>(freeHeap()), fragmentation(),
                currentCpuLoad, cachedChipTemp,
                static_cast<unsigned long>(uptimeSeconds()));
}

uint32_t totalHeap() {
  return ESP.getHeapSize();
}

uint32_t freeHeap() {
  return ESP.getFreeHeap();
}

uint32_t minFreeHeap() {
  return ESP.getMinFreeHeap();
}

uint32_t maxAllocHeap() {
  return heap_caps_get_largest_free_block(MALLOC_CAP_DEFAULT);
}

uint8_t fragmentation(size_t largestFree) {
  const size_t freeBytes = heap_caps_get_free_size(MALLOC_CAP_DEFAULT);
  if (freeBytes == 0) {
    return 0;
  }
  const size_t largest = (largestFree > 0) ? largestFree : maxAllocHeap();
  return static_cast<uint8_t>(100 - (largest * 100 / freeBytes));
}

int8_t rssi() {
  return WiFi.RSSI();
}

uint32_t uptimeSeconds() {
  return millis() / 1000;
}

float chipTemperature() {
  return cachedChipTemp;
}

uint8_t cpuLoad() {
  return currentCpuLoad;
}

}
