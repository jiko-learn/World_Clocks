#include "console.h"

#include "config_store.h"
#include "system_info.h"
#include "wifi_manager.h"

#include <LittleFS.h>
#include <WiFi.h>
#include <esp_wifi.h>

namespace {

constexpr size_t kLineBufferSize = 96;
constexpr uint32_t kInterByteTimeoutMs = 250;
char lineBuffer[kLineBufferSize];
size_t lineLength = 0;
uint32_t lastByteAt = 0;

bool copyArg(char* dest, size_t destSize, const char* value) {
  const size_t len = strlen(value);
  if (len >= destSize) {
    return false;
  }
  memcpy(dest, value, len + 1);
  return true;
}

void printUsage() {
  Serial.println("[cmd] show | ssid <n> | pass <p> | host <n> | scan | radio | fstest | reset | reboot");
}

void handleShow() {
  const DeviceConfig& cfg = configStore::get();
  Serial.printf("[cmd] ssid=%s password=%s host=%s staticIp=%d\n", cfg.ssid,
                cfg.password[0] ? "<set>" : "<empty>", cfg.hostname,
                cfg.useStaticIp ? 1 : 0);
  Serial.printf("[cmd] ip=%s gw=%s mask=%s dns=%s\n", cfg.ip.toString().c_str(),
                cfg.gateway.toString().c_str(), cfg.subnet.toString().c_str(),
                cfg.dns.toString().c_str());
  Serial.printf("[cmd] mode=%d ip=%s uptime=%lus heap=%lu frag=%u%% cpu=%u%% temp=%.1fC\n",
                static_cast<int>(wifiManager::mode()),
                wifiManager::ipString().c_str(),
                static_cast<unsigned long>(systemInfo::uptimeSeconds()),
                static_cast<unsigned long>(systemInfo::freeHeap()),
                systemInfo::fragmentation(),
                systemInfo::cpuLoad(),
                systemInfo::chipTemperature());
}

void execute(char* line) {
  char* arg = strchr(line, ' ');
  if (arg) {
    *arg = '\0';
    ++arg;
    while (*arg == ' ') {
      ++arg;
    }
  }

  if (strcmp(line, "show") == 0) {
    printUsage();
    handleShow();
    return;
  }

  if (strcmp(line, "ssid") == 0) {
    DeviceConfig& cfg = configStore::get();
    if (!arg || !copyArg(cfg.ssid, sizeof(cfg.ssid), arg) || !configStore::save()) {
      Serial.println("[cmd] usage: ssid <name> (too long or save failed)");
      return;
    }
    Serial.printf("[cmd] ssid set to '%s', reconnecting\n", cfg.ssid);
    wifiManager::applyConfig();
    return;
  }

  if (strcmp(line, "pass") == 0) {
    DeviceConfig& cfg = configStore::get();
    if (!arg || !copyArg(cfg.password, sizeof(cfg.password), arg) ||
        !configStore::save()) {
      Serial.println("[cmd] usage: pass <password> (too long or save failed)");
      return;
    }
    Serial.println("[cmd] password set, reconnecting");
    wifiManager::applyConfig();
    return;
  }

  if (strcmp(line, "host") == 0) {
    DeviceConfig& cfg = configStore::get();
    if (!arg || !copyArg(cfg.hostname, sizeof(cfg.hostname), arg) ||
        !configStore::save()) {
      Serial.println("[cmd] usage: host <name> (too long or save failed)");
      return;
    }
    Serial.printf("[cmd] hostname set to '%s'\n", cfg.hostname);
    wifiManager::applyConfig();
    return;
  }

  if (strcmp(line, "scan") == 0) {
    Serial.println("[cmd] scanning...");
    WiFi.disconnect();
    delay(150);
    const int n = WiFi.scanNetworks(false, true);
    for (int i = 0; i < n; i++) {
      Serial.printf("[cmd] ch=%-3d rssi=%-4d ssid=%s\n", WiFi.channel(i),
                    WiFi.RSSI(i), WiFi.SSID(i).c_str());
    }
    WiFi.scanDelete();
    Serial.printf("[cmd] scan done, %d networks\n", n);
    wifiManager::applyConfig();
    return;
  }

  if (strcmp(line, "radio") == 0) {
    WiFi.setSleep(false);
    WiFi.setTxPower(WIFI_POWER_17dBm);
    wifi_ps_type_t ps = WIFI_PS_NONE;
    esp_wifi_get_ps(&ps);
    const char* psName = (ps == WIFI_PS_NONE)     ? "NONE"
                         : (ps == WIFI_PS_MIN_MODEM) ? "MIN_MODEM"
                                                    : "MAX_MODEM";
    Serial.printf("[cmd] radio: ps=%s txPower=17dBm status=%d rssi=%d\n", psName,
                  static_cast<int>(WiFi.status()),
                  wifiManager::isConnected() ? WiFi.RSSI() : 0);
    return;
  }

  if (strcmp(line, "fstest") == 0) {
    uint32_t t0 = millis();
    fs::File f = LittleFS.open("/index.html", FILE_READ);
    uint32_t t1 = millis();
    Serial.printf("[cmd] open=%d took=%lums\n", f ? 1 : 0,
                  static_cast<unsigned long>(t1 - t0));
    if (f) {
      const size_t size = f.size();
      uint8_t buf[64];
      const size_t read = f.read(buf, sizeof(buf));
      uint32_t t2 = millis();
      Serial.printf("[cmd] size=%u read=%u readMs=%lums magic=%02x%02x%02x%02x\n",
                    static_cast<unsigned>(size), static_cast<unsigned>(read),
                    static_cast<unsigned long>(t2 - t1), buf[0], buf[1],
                    buf[2], buf[3]);
      f.close();
      Serial.println("[cmd] fstest ok");
    } else {
      Serial.println("[cmd] fstest FAILED: cannot open /index.html");
    }
    return;
  }

  if (strcmp(line, "reset") == 0) {
    Serial.println("[cmd] credentials cleared, entering provisioning");
    wifiManager::requestCredentialReset();
    return;
  }

  if (strcmp(line, "reboot") == 0) {
    Serial.println("[cmd] rebooting");
    delay(200);
    ESP.restart();
    return;
  }

  Serial.printf("[cmd] unknown: %s\n", line);
  printUsage();
}

void handleLine() {
  while (lineLength > 0 &&
         (lineBuffer[lineLength - 1] == '\r' || lineBuffer[lineLength - 1] == '\n')) {
    lineBuffer[--lineLength] = '\0';
  }
  if (lineLength == 0) {
    return;
  }
  lineBuffer[lineLength] = '\0';
  execute(lineBuffer);
  lineLength = 0;
}

}

namespace console {

void begin() {
  lineLength = 0;
  while (Serial.available() > 0) {
    Serial.read();
  }
  lastByteAt = millis();
  printUsage();
}

void loop() {
  if (lineLength > 0 && millis() - lastByteAt > kInterByteTimeoutMs) {
    lineLength = 0;
    Serial.println("[cmd] partial line timed out, discarded");
  }

  while (Serial.available() > 0) {
    const int c = Serial.read();
    if (c < 0) {
      break;
    }
    lastByteAt = millis();

    if (c == '\n' || c == '\r') {
      handleLine();
      continue;
    }

    if (c < 0x20 && c != '\t') {
      if (lineLength > 0) {
        lineLength = 0;
        Serial.println("[cmd] unexpected control byte, line discarded");
      }
      continue;
    }

    if (lineLength + 1 < sizeof(lineBuffer)) {
      lineBuffer[lineLength++] = static_cast<char>(c);
    } else {
      lineLength = 0;
      Serial.println("[cmd] line too long, discarded");
    }
  }
}

}
