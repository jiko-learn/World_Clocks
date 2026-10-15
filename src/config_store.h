#pragma once

#include <Arduino.h>
#include <IPAddress.h>

constexpr uint16_t kConfigVersion = 1;

struct DeviceConfig {
  char ssid[33];
  char password[65];
  char hostname[32];
  bool useStaticIp;
  IPAddress ip;
  IPAddress gateway;
  IPAddress subnet;
  IPAddress dns;
  uint16_t version;
};

namespace configStore {

bool begin();
DeviceConfig& get();
bool save();
void clear();
bool hasCredentials();

}
