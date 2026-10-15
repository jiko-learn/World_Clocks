#pragma once

#include <Arduino.h>
#include <String.h>

enum class WifiMode {
  Idle,
  Connecting,
  Connected,
  Provisioning,
  Failed
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

}
