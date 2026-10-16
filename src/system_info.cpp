#include "system_info.h"

#include <WiFi.h>
#include <esp_heap_caps.h>

namespace {

constexpr uint32_t kLogIntervalMs = 30000;
uint32_t lastLogAt = 0;

uint32_t workMicrosAccum = 0;
uint32_t lastCpuSampleAt = 0;
uint8_t currentCpuLoad = 0;
float cachedChipTemp = 38.0f;
uint32_t lastTempSampleAt = 0;

}

namespace systemInfo {

void begin() {
  lastLogAt = millis();
  lastCpuSampleAt = millis();
  lastTempSampleAt = 0;
  workMicrosAccum = 0;
}

void recordWorkTime(uint32_t workMicros) {
  workMicrosAccum += workMicros;
}

void loop() {
  const uint32_t now = millis();
  const uint32_t elapsedCpu = now - lastCpuSampleAt;
  if (elapsedCpu >= 1000) {
    const uint64_t totalAvailableMicros = static_cast<uint64_t>(elapsedCpu) * 1000ULL;
    if (totalAvailableMicros > 0) {
      uint32_t load = static_cast<uint32_t>((static_cast<uint64_t>(workMicrosAccum) * 100ULL) / totalAvailableMicros);
      currentCpuLoad = (load > 100) ? 100 : static_cast<uint8_t>(load);
    }
    workMicrosAccum = 0;
    lastCpuSampleAt = now;
  }

  // Note: ESP32 internal TSENS shares SAR ADC2 with Wi-Fi PHY.
  // Calling temperatureRead() while Wi-Fi is active disrupts RF and causes packet loss.
  // We keep cachedChipTemp at an initial safe value or sample only if Wi-Fi is idle.
  (void)now;

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
