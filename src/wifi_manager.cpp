#include "wifi_manager.h"

#include "config_store.h"

#include <DNSServer.h>
#include <ESPmDNS.h>
#include <WiFi.h>
#include <algorithm>
#include <esp_netif.h>
#include <esp_wifi.h>

namespace {

constexpr uint32_t kInitialBackoffMs = 3000;
constexpr uint32_t kMaxBackoffMs = 30000;
constexpr uint32_t kAttemptGraceMs = 15000;
constexpr uint8_t kMaxAttempts = 5;
constexpr uint32_t kLinkLostGraceMs = 15000;
constexpr const char* kApSsid = "bundle-setup";
constexpr const char* kApPass = "bundlepanel123";

WifiMode currentMode = WifiMode::Idle;
uint32_t attemptStartedAt = 0;
uint32_t retryAt = 0;
uint32_t linkLostAt = 0;
uint32_t backoffMs = kInitialBackoffMs;
uint8_t attempts = 0;
bool waitingToRetry = false;

DNSServer dnsServer;
static std::vector<ScannedAp> cachedScan;

void tuneRadio() {
  WiFi.setSleep(false);
  WiFi.setTxPower(WIFI_POWER_17dBm);
  wifi_country_t country;
  if (esp_wifi_get_country(&country) == ESP_OK) {
    country.cc[0] = 'T';
    country.cc[1] = 'H';
    country.cc[2] = ' ';
    country.schan = 1;
    country.nchan = 13;
    country.policy = WIFI_COUNTRY_POLICY_AUTO;
    esp_wifi_set_country(&country);
  }
}

void startMdns() {
  const char* hostname = configStore::get().hostname;
  if (!hostname[0]) {
    hostname = "bundle-panel";
  }
  MDNS.end();
  if (MDNS.begin(hostname)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("[mdns] http://%s.local\n", hostname);
  } else {
    Serial.println("[mdns] begin failed");
  }
}

void applyStationConfig() {
  const DeviceConfig& cfg = configStore::get();
  WiFi.persistent(false);
  WiFi.mode(WIFI_AP_STA);
  WiFi.softAP(kApSsid, kApPass);
  dnsServer.setErrorReplyCode(DNSReplyCode::NoError);
  dnsServer.start(53, "*", WiFi.softAPIP());
  Serial.printf("[wifi] fallback AP %s active at %s\n", kApSsid, WiFi.softAPIP().toString().c_str());
  tuneRadio();
  WiFi.setMinSecurity(WIFI_AUTH_OPEN);
  WiFi.setScanMethod(WIFI_ALL_CHANNEL_SCAN);
  WiFi.setAutoReconnect(true);
  WiFi.setHostname(cfg.hostname);

  // Never assume the last IP and gateway. Always do fresh clean DHCP negotiation.
  WiFi.config(IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0),
              IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0));
  esp_netif_t* netif = esp_netif_get_handle_from_ifkey("WIFI_STA_DEF");
  if (netif) {
    esp_netif_dhcpc_stop(netif);
    esp_netif_dhcpc_start(netif);
  }
}

void beginAttempt() {
  const DeviceConfig& cfg = configStore::get();
  Serial.printf("[wifi] beginAttempt ssid='%s' pass_len=%u\n", cfg.ssid, strlen(cfg.password));
  tuneRadio();
  WiFi.disconnect(false);
  delay(100);

  WiFi.begin(cfg.ssid, cfg.password);

  // Disable PMF (802.11w) after WiFi.begin for compatibility with True Online / Sagemcom routers
  wifi_config_t conf;
  if (esp_wifi_get_config(WIFI_IF_STA, &conf) == ESP_OK) {
    conf.sta.pmf_cfg.capable = false;
    conf.sta.pmf_cfg.required = false;
    esp_wifi_set_config(WIFI_IF_STA, &conf);
  }

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
    esp_wifi_set_ps(WIFI_PS_NONE);
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
          "[wifi] 5 attempts failed; starting fallback AP bundle-setup so user can configure wifi");
      attempts = 0;
      backoffMs = kInitialBackoffMs;
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
      esp_wifi_set_ps(WIFI_PS_NONE);
      Serial.printf("[wifi] got ip: %s\n", IPAddress(info.got_ip.ip_info.ip.addr).toString().c_str());
    }
  });

  // Reset to Wi-Fi setup every time the board starts.
  // Never assume the last IP or gateway.
  configStore::clear();
  WiFi.persistent(false);
  WiFi.disconnect(true, true);
  WiFi.config(IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0),
              IPAddress(0, 0, 0, 0), IPAddress(0, 0, 0, 0));
  startProvisioning();
  Serial.println("[wifi] reset to Wi-Fi setup on startup (hotspot bundle-setup at 192.168.4.1)");
}

void loop() {
  dnsServer.processNextRequest();
  switch (currentMode) {
    case WifiMode::Connecting:
      handleConnecting();
      break;

    case WifiMode::Connected:
      if (WiFi.status() != WL_CONNECTED) {
        if (linkLostAt == 0) {
          linkLostAt = millis();
        } else if (millis() - linkLostAt > kLinkLostGraceMs) {
          Serial.println("[wifi] link lost for >15s, reconnecting");
          linkLostAt = 0;
          startConnecting();
        }
      } else {
        linkLostAt = 0;
      }
      break;

    case WifiMode::Provisioning:
      break;

    default:
      break;
  }
}

void startProvisioning() {
  dnsServer.stop();
  WiFi.mode(WIFI_AP_STA);
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

static bool scanning = false;
static uint32_t scanStartedAt = 0;

void triggerScan() {
  if (scanning) {
    return;
  }
  if (WiFi.getMode() == WIFI_AP) {
    WiFi.mode(WIFI_AP_STA);
  }
  tuneRadio();
  scanning = true;
  scanStartedAt = millis();
  WiFi.scanNetworks(true, true, false, 300);
  Serial.println("[wifi] async network scan started");
}

bool isScanning() {
  if (!scanning) {
    return false;
  }
  int16_t status = WiFi.scanComplete();
  if (status == WIFI_SCAN_RUNNING) {
    if (millis() - scanStartedAt > 12000) {
      WiFi.scanDelete();
      scanning = false;
      Serial.println("[wifi] scan timed out");
    }
    return true;
  }
  if (status >= 0) {
    cachedScan.clear();
    for (int i = 0; i < status; ++i) {
      String ssid = WiFi.SSID(i);
      if (ssid.length() == 0) continue;
      int rssi = WiFi.RSSI(i);
      bool secure = WiFi.encryptionType(i) != WIFI_AUTH_OPEN;
      uint8_t channel = WiFi.channel(i);
      bool found = false;
      for (auto& item : cachedScan) {
        if (item.ssid == ssid) {
          found = true;
          if (rssi > item.rssi) {
            item.rssi = rssi;
            item.secure = secure;
            item.channel = channel;
          }
          break;
        }
      }
      if (!found) {
        cachedScan.push_back({ssid, rssi, secure, channel});
      }
    }
    std::sort(cachedScan.begin(), cachedScan.end(),
              [](const ScannedAp& a, const ScannedAp& b) {
                return a.rssi > b.rssi;
              });
    WiFi.scanDelete();
    Serial.printf("[wifi] scan finished, %u unique APs found\n", static_cast<unsigned>(cachedScan.size()));
  }
  scanning = false;
  return false;
}

bool getScannedNetworks(std::vector<ScannedAp>& list) {
  isScanning();
  list = cachedScan;
  return !scanning;
}

}
