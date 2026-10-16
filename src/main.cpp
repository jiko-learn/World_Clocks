#include <Arduino.h>

#include "config_store.h"
#include "console.h"
#include "system_info.h"
#include "web_server.h"
#include "wifi_manager.h"

void setup() {
  Serial.begin(115200);
  const uint32_t serialDeadline = millis() + 2000;
  while (!Serial && millis() < serialDeadline) {
    delay(10);
  }

  configStore::begin();
  Serial.printf("[cfg] hostname=%s, credentials=%s\n",
                configStore::get().hostname,
                configStore::hasCredentials() ? "present" : "absent");

  console::begin();
  systemInfo::begin();
  wifiManager::begin();
  webServer::begin();
}

void loop() {
  const uint32_t t0 = micros();
  console::loop();
  wifiManager::loop();
  systemInfo::loop();
  const uint32_t workUs = micros() - t0;
  systemInfo::recordWorkTime(workUs);
  delay(5);
}
