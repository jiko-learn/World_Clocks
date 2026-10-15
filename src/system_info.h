#pragma once

#include <Arduino.h>

namespace systemInfo {

void begin();
void loop();

uint32_t freeHeap();
uint32_t minFreeHeap();
uint8_t fragmentation();
int8_t rssi();
uint32_t uptimeSeconds();

}
