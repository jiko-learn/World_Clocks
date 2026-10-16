#include "wifi_manager.h"

#include "config_store.h"

#include <DNSServer.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <esp_wifi.h>

namespace {

constexpr uint32_t kInitialBackoffMs = 1000;
constexpr uint32_t kMaxBackoffMs = 30000;
constexpr uint32_t kAttemptGraceMs = 20000;
constexpr uint8_t kMaxAttempts = 5;
constexpr uint32_t kLinkLostGraceMs = 5000;
constexpr const char* kApSsid = "bun-setup";
constexpr const char* kApPass = "bunpanel123";

WifiMode currentMode = WifiMode::Idle;
uint32_t attemptStartedAt = 0;
uint32_t retryAt = 0;
uint32_t linkLostAt = 0;
uint32_t backoffMs = kInitialBackoffMs;
uint8_t attempts = 0;
bool waitingToRetry = false;

DNSServer dnsServer;

void tuneRadio() {
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_17dBm);
  wifi_country_t country = {};
  country.cc[0] = 'T';
  country.cc[1] = 'H';
  country.cc[2] = '\0';
  country.schan = 1;
  country.nchan = 14;
  country.policy = WIFI_COUNTRY_POLICY_MANUAL;
  esp_wifi_set_country(&country);
}

void startMdns() {
  const char* hostname = configStore::get().hostname;
  if (!hostname[0]) {
    return;
  }
  if (MDNS.begin(hostname)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[mdns] http://%s.local\n", hostname);
  } else {
    Serial.println("[mdns] begin failed");
  }
}

void applyStationConfig() {
  const DeviceConfig& cfg = configStore::get();
  WiFi.mode(WIFI_STA);
  tuneRadio();
  WiFi.setHostname(cfg.hostname);
  if (cfg.useStaticIp) {
    WiFi.config(cfg.ip, cfg.gateway, cfg.subnet, cfg.dns);
  } else {
    WiFi.config(IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0),
                IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0));
  }
  WiFi.setAutoReconnect(true);
}

void beginAttempt() {
  const DeviceConfig& cfg = configStore::get();
  WiFi.begin(cfg.ssid, cfg.password);
  attemptStartedAt = millis();
  waitingToRetry = false;
}

void startConnecting() {
  applyStationConfig();
  backoffMs = kInitialBackoffMs;
  attempts = 0;
  beginAttempt();
  currentMode = WifiMode::Connecting;
  Serial.printf("[wifi] connecting to %s\n", configStore::get().ssid);
}

void handleConnecting() {
  if (WiFi.status() == WL_CONNECTED) {
    currentMode = WifiMode::Connected;
    tuneRadio();
    startMdns();
    configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
    Serial.printf("[wifi] connected, ip=%s (NTP started)\n", wifiManager::ipString().c_str());
    return;
  }

  const uint32_t now = millis();

  if (!waitingToRetry) {
    if (now - attemptStartedAt < kAttemptGraceMs) {
      return;
    }

    attempts++;
    WiFi.disconnect();

    backoffMs = backoffMs * 2 > kMaxBackoffMs ? kMaxBackoffMs : backoffMs * 2;
    Serial.printf("[wifi] attempt %u failed, retrying in %lu ms\n", attempts,
                  static_cast<unsigned long>(backoffMs));
    if (attempts >= kMaxAttempts) {
      Serial.println(
          "[wifi] connection failed after max attempts; starting fallback provisioning AP (bun-setup at 192.168.4.1)");
      wifiManager::startProvisioning();
      return;
    }

    retryAt = now + backoffMs;
    waitingToRetry = true;
    return;
  }

  if (static_cast<int32_t>(now - retryAt) < 0) {
    return;
  }

  beginAttempt();
}

}

namespace wifiManager {

void begin() {
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
      Serial.printf("[wifi] disconnected, reason=%u\n", info.wifi_sta_disconnected.reason);
    } else if (event == ARDUINO_EVENT_WIFI_STA_CONNECTED) {
      Serial.printf("[wifi] station connected to AP (ch=%u)\n", info.wifi_sta_connected.channel);
    } else if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) {
      Serial.printf("[wifi] got ip: %s\n", IPAddress(info.got_ip.ip_info.ip.addr).toString().c_str());
    }
  });

  if (configStore::hasCredentials()) {
    startConnecting();
  } else {
    startProvisioning();
  }
}

void loop() {
  switch (currentMode) {
    case WifiMode::Connecting:
      handleConnecting();
      break;

    case WifiMode::Connected:
      if (WiFi.status() != WL_CONNECTED) {
        if (linkLostAt == 0) {
          linkLostAt = millis();
        } else if (millis() - linkLostAt > kLinkLostGraceMs) {
          Serial.println("[wifi] link lost for >5s, reconnecting");
          linkLostAt = 0;
          startConnecting();
        }
      } else {
        linkLostAt = 0;
      }
      break;

    case WifiMode::Provisioning:
      dnsServer.processNextRequest();
      break;

    default:
      break;
  }
}

void startProvisioning() {
  dnsServer.stop();
  WiFi.mode(WIFI_AP);
  const bool ok = WiFi.softAP(kApSsid, kApPass);
  tuneRadio();
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", WiFi.softAPIP());
  currentMode = WifiMode::Provisioning;
  Serial.printf("[wifi] provisioning AP %s (up=%d) at %s\n", kApSsid, ok,
                WiFi.softAPIP().toString().c_str());
}

void requestCredentialReset() {
  configStore::clear();
  startProvisioning();
}

void applyConfig() {
  dnsServer.stop();
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  if (configStore::hasCredentials()) {
    startConnecting();
  } else {
    startProvisioning();
  }
}

WifiMode mode() {
  return currentMode;
}

bool isConnected() {
  return currentMode == WifiMode::Connected && WiFi.status() == WL_CONNECTED;
}

String ipString() {
  return isConnected() ? WiFi.localIP().toString() : WiFi.softAPIP().toString();
}

}
