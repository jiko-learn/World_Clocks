#pragma once

#include <Arduino.h>

constexpr uint8_t kLinkHistorySize = 60;

struct LinkSample {
  uint8_t rssi;       // dBm + 100, clamped to 0..200 (uint8 holds 0..255)
  uint8_t state;      // WifiMode as reported by wifiManager
  uint8_t connected;  // 1 when the STA has an IP
  uint8_t pad;
  uint32_t t;         // uptime seconds when sampled, for correlating with
                      // router/network changes
};

namespace linkMonitor {

void begin();
void loop();

uint8_t count();
LinkSample at(uint8_t indexFromOldest);  // oldest-first, 0..count()-1
LinkSample latest();
uint32_t reconnectCount();
uint32_t sampleIntervalMs();

}