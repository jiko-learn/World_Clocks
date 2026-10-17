#pragma once

#include <Arduino.h>
#include <String.h>
#include <vector>

enum class WifiMode {
  Idle,
  Connecting,
  Connected,
  Provisioning,
  Failed
};

struct ScannedAp {
  String ssid;
  int rssi;
  bool secure;
  uint8_t channel;
};

namespace wifiManager {

void begin();
void loop();

void startProvisioning();
void requestCredentialReset();
void applyConfig();

WifiMode mode();
bool isConnected();
String ipString();

void triggerScan();
bool isScanning();
bool getScannedNetworks(std::vector<ScannedAp>& list);

}
