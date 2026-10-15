#include "system_info.h"

#include <WiFi.h>
#include <esp_heap_caps.h>

namespace {

constexpr uint32_t kLogIntervalMs = 30000;
uint32_t lastLogAt = 0;

}

namespace systemInfo {

void begin() {
  lastLogAt = millis();
}

void loop() {
  const uint32_t now = millis();
  if (now - lastLogAt < kLogIntervalMs) {
    return;
  }
  lastLogAt = now;
  Serial.printf("[sys] heap=%lu free, frag=%u%%, uptime=%lus\n",
                static_cast<unsigned long>(freeHeap()), fragmentation(),
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

}
