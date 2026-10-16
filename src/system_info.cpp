#include "system_info.h"

#include <WiFi.h>
#include <esp_freertos_hooks.h>
#include <esp_heap_caps.h>

#include <freertos/FreeRTOS.h>
#include <freertos/task.h>

namespace {

constexpr uint32_t kLogIntervalMs = 30000;
uint32_t lastLogAt = 0;

volatile uint32_t idleCountCore0 = 0;
volatile uint32_t idleCountCore1 = 0;
uint32_t idleBaselineCore0 = 0;
uint32_t idleBaselineCore1 = 0;
uint32_t lastCpuSampleAt = 0;
uint8_t currentLoad0 = 0;
uint8_t currentLoad1 = 0;
uint8_t currentLoadAvg = 0;

bool idleHookCore0() {
  idleCountCore0++;
  return false;
}

bool idleHookCore1() {
  idleCountCore1++;
  return false;
}

}

namespace systemInfo {

void begin() {
  lastLogAt = millis();
  lastCpuSampleAt = millis();
  esp_register_freertos_idle_hook_for_cpu(idleHookCore0, 0);
  esp_register_freertos_idle_hook_for_cpu(idleHookCore1, 1);
}

void loop() {
  const uint32_t now = millis();
  const uint32_t elapsedCpu = now - lastCpuSampleAt;
  if (elapsedCpu >= 1000) {
    const uint32_t c0 = idleCountCore0;
    const uint32_t c1 = idleCountCore1;
    idleCountCore0 = 0;
    idleCountCore1 = 0;
    lastCpuSampleAt = now;

    const uint32_t norm0 = (elapsedCpu > 0) ? (c0 * 1000 / elapsedCpu) : c0;
    const uint32_t norm1 = (elapsedCpu > 0) ? (c1 * 1000 / elapsedCpu) : c1;

    if (norm0 > idleBaselineCore0) {
      idleBaselineCore0 = norm0;
    }
    if (norm1 > idleBaselineCore1) {
      idleBaselineCore1 = norm1;
    }

    if (idleBaselineCore0 > 0) {
      const int load0 = 100 - static_cast<int>((norm0 * 100) / idleBaselineCore0);
      currentLoad0 = (load0 < 0) ? 0 : (load0 > 100 ? 100 : static_cast<uint8_t>(load0));
    }
    if (idleBaselineCore1 > 0) {
      const int load1 = 100 - static_cast<int>((norm1 * 100) / idleBaselineCore1);
      currentLoad1 = (load1 < 0) ? 0 : (load1 > 100 ? 100 : static_cast<uint8_t>(load1));
    }
    currentLoadAvg = static_cast<uint8_t>((currentLoad0 + currentLoad1) / 2);
  }

  if (now - lastLogAt < kLogIntervalMs) {
    return;
  }
  lastLogAt = now;
  Serial.printf("[sys] heap=%lu free, frag=%u%%, cpu=%u%% (c0=%u%% c1=%u%%), temp=%.1fC, uptime=%lus\n",
                static_cast<unsigned long>(freeHeap()), fragmentation(),
                currentLoadAvg, currentLoad0, currentLoad1, chipTemperature(),
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
  return temperatureRead();
}

uint8_t cpuLoad() {
  return currentLoadAvg;
}

uint8_t cpuLoadCore0() {
  return currentLoad0;
}

uint8_t cpuLoadCore1() {
  return currentLoad1;
}

}
