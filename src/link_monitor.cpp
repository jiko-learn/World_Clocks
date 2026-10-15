#include "link_monitor.h"

#include "wifi_manager.h"

#include <WiFi.h>

namespace {

constexpr uint32_t kSampleIntervalMs = 5000;

LinkSample samples[kLinkHistorySize];
uint8_t head = 0;
uint8_t filled = 0;
uint32_t lastSampleAt = 0;
uint32_t reconnects = 0;
bool lastConnected = false;
bool haveLastConnected = false;

uint8_t encodeRssi(int32_t rssi) {
  const int32_t shifted = rssi + 100;
  if (shifted < 0) {
    return 0;
  }
  if (shifted > 200) {
    return 200;
  }
  return static_cast<uint8_t>(shifted);
}

LinkSample takeSample() {
  LinkSample s{};
  s.rssi = encodeRssi(wifiManager::isConnected() ? WiFi.RSSI() : 0);
  s.state = static_cast<uint8_t>(wifiManager::mode());
  s.connected = wifiManager::isConnected() ? 1 : 0;
  s.t = millis() / 1000;
  return s;
}

}

namespace linkMonitor {

void begin() {
  head = 0;
  filled = 0;
  reconnects = 0;
  haveLastConnected = false;
  lastSampleAt = millis();
}

void loop() {
  const uint32_t now = millis();
  if (now - lastSampleAt < kSampleIntervalMs) {
    return;
  }
  lastSampleAt = now;

  const LinkSample sample = takeSample();
  samples[head] = sample;
  head = (head + 1) % kLinkHistorySize;
  if (filled < kLinkHistorySize) {
    filled++;
  }

  if (haveLastConnected && sample.connected != (lastConnected ? 1 : 0)) {
    if (sample.connected) {
      reconnects++;
    }
  }
  lastConnected = sample.connected != 0;
  haveLastConnected = true;
}

uint8_t count() {
  return filled;
}

LinkSample at(uint8_t indexFromOldest) {
  if (filled == 0 || indexFromOldest >= filled) {
    return LinkSample{};
  }
  // Oldest-first ordering. Once the ring is full the oldest entry sits at
  // head; before that, entries were written from index 0 upward.
  const uint8_t base = (filled < kLinkHistorySize) ? 0 : head;
  return samples[(base + indexFromOldest) % kLinkHistorySize];
}

LinkSample latest() {
  if (filled == 0) {
    return LinkSample{};
  }
  return at(static_cast<uint8_t>(filled - 1));
}

uint32_t reconnectCount() {
  return reconnects;
}

uint32_t sampleIntervalMs() {
  return kSampleIntervalMs;
}

}