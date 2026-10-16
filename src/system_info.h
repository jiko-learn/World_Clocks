#pragma once

#include <Arduino.h>

namespace systemInfo {

void begin();
void loop();
void recordWorkTime(uint32_t workMicros);

uint32_t totalHeap();
uint32_t freeHeap();
uint32_t minFreeHeap();
uint32_t maxAllocHeap();
uint8_t fragmentation(size_t largestFree = 0);
int8_t rssi();
uint32_t uptimeSeconds();
float chipTemperature();
uint8_t cpuLoad();

}
