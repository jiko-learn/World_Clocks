#include "api_routes.h"

#include "config_store.h"
#include "system_info.h"
#include "web_server.h"
#include "wifi_manager.h"

#include <ArduinoJson.h>
#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <WiFi.h>

namespace {

constexpr const char* kJson = "application/json";
constexpr size_t kReplyBuffer = 512;
constexpr const char* kFwVersion = "0.1.0";

char replyBuffer[kReplyBuffer];
char requestBuffer[1024];

void sendJson(AsyncWebServerRequest* request, JsonVariantConst doc,
              int code = 200) {
  const size_t len = serializeJson(doc, replyBuffer, sizeof(replyBuffer));
  if (len == 0) {
    request->send(code, kJson, "{\"error\":\"serialize_failed\"}");
    return;
  }
  AsyncWebServerResponse* response = request->beginResponse(
      code, kJson, reinterpret_cast<const uint8_t*>(replyBuffer), len);
  response->addHeader("Cache-Control", "no-store");
  request->send(response);
}

const char* modeName() {
  switch (wifiManager::mode()) {
    case WifiMode::Idle:
      return "idle";
    case WifiMode::Connecting:
      return "connecting";
    case WifiMode::Connected:
      return "connected";
    case WifiMode::Provisioning:
      return "provisioning";
    default:
      return "unknown";
  }
}

void handleHealth(AsyncWebServerRequest* request) {
  JsonDocument doc;
  doc["ok"] = true;
  doc["fw"] = kFwVersion;
  doc["uptime"] = systemInfo::uptimeSeconds();
  doc["heap"] = systemInfo::freeHeap();
  doc["minHeap"] = systemInfo::minFreeHeap();
  doc["totalHeap"] = systemInfo::totalHeap();
  const uint32_t maxAlloc = systemInfo::maxAllocHeap();
  doc["maxAlloc"] = maxAlloc;
  doc["frag"] = systemInfo::fragmentation(maxAlloc);
  doc["mode"] = modeName();
  doc["connected"] = wifiManager::isConnected();
  doc["ip"] = wifiManager::ipString().c_str();
  doc["rssi"] = wifiManager::isConnected() ? systemInfo::rssi() : 0;
  doc["temp"] = round(systemInfo::chipTemperature() * 10.0f) / 10.0f;
  doc["cpu"] = systemInfo::cpuLoad();

  static unsigned long cachedFsUsed = 0;
  static unsigned long cachedFsTotal = 0;
  static uint32_t lastFsCheck = 0;
  const uint32_t nowMs = millis();
  if (webServer::fsMounted()) {
    if (cachedFsTotal == 0 || nowMs - lastFsCheck > 60000) {
      cachedFsUsed = static_cast<unsigned long>(LittleFS.usedBytes());
      cachedFsTotal = static_cast<unsigned long>(LittleFS.totalBytes());
      lastFsCheck = nowMs;
    }
    doc["fsUsed"] = cachedFsUsed;
    doc["fsTotal"] = cachedFsTotal;
  }

  const time_t now = time(nullptr);
  doc["epoch"] = (now > 1600000000) ? static_cast<uint32_t>(now) : 0;
  doc["timeSynced"] = (now > 1600000000);
  sendJson(request, doc);
}

void handleConfigGet(AsyncWebServerRequest* request) {
  const DeviceConfig& cfg = configStore::get();
  JsonDocument doc;
  doc["ssid"] = cfg.ssid;
  doc["hostname"] = cfg.hostname;
  doc["hasPassword"] = cfg.password[0] != '\0';
  doc["useStaticIp"] = cfg.useStaticIp;
  doc["ip"] = cfg.ip.toString().c_str();
  doc["gateway"] = cfg.gateway.toString().c_str();
  doc["subnet"] = cfg.subnet.toString().c_str();
  doc["dns"] = cfg.dns.toString().c_str();
  sendJson(request, doc);
}

bool applyIp(JsonVariantConst parent, const char* key, IPAddress& out,
             bool required) {
  const char* value = parent[key] | "";
  if (value[0] == '\0') {
    return !required;
  }
  IPAddress parsed;
  if (!parsed.fromString(value)) {
    return false;
  }
  out = parsed;
  return true;
}

void handleConfigPut(AsyncWebServerRequest* request, uint8_t* data, size_t len,
                     size_t index, size_t total) {
  if (index == 0) {
    requestBuffer[0] = '\0';
  }
  if (index + len >= sizeof(requestBuffer)) {
    request->send(413, kJson, "{\"error\":\"body_too_large\"}");
    return;
  }
  memcpy(requestBuffer + index, data, len);
  requestBuffer[index + len] = '\0';
  if (index + len < total) {
    return;
  }

  JsonDocument doc;
  if (deserializeJson(doc, requestBuffer, index + len)) {
    JsonDocument err;
    err["error"] = "invalid_json";
    sendJson(request, err, 400);
    return;
  }

  DeviceConfig& cfg = configStore::get();

  const char* ssid = doc["ssid"] | "";
  const char* hostname = doc["hostname"] | "";
  if (hostname[0] != '\0' && strlen(hostname) >= sizeof(cfg.hostname)) {
    JsonDocument err;
    err["error"] = "hostname_too_long";
    sendJson(request, err, 400);
    return;
  }

  bool credentialsChanged = false;
  if (doc["ssid"].is<const char*>()) {
    credentialsChanged = strncmp(cfg.ssid, ssid, sizeof(cfg.ssid)) != 0;
    strlcpy(cfg.ssid, ssid, sizeof(cfg.ssid));
  }
  if (doc["password"].is<const char*>()) {
    strlcpy(cfg.password, doc["password"] | "", sizeof(cfg.password));
    credentialsChanged = true;
  }
  if (hostname[0] != '\0') {
    strlcpy(cfg.hostname, hostname, sizeof(cfg.hostname));
  }

  if (doc["useStaticIp"].is<bool>()) {
    cfg.useStaticIp = doc["useStaticIp"].as<bool>();
  }

  IPAddress ip = cfg.ip;
  IPAddress gateway = cfg.gateway;
  IPAddress subnet = cfg.subnet;
  IPAddress dns = cfg.dns;
  const bool ok = applyIp(doc, "ip", ip, false) &&
                  applyIp(doc, "gateway", gateway, false) &&
                  applyIp(doc, "subnet", subnet, false) &&
                  applyIp(doc, "dns", dns, false);
  if (!ok) {
    JsonDocument err;
    err["error"] = "invalid_ip";
    sendJson(request, err, 400);
    return;
  }
  cfg.ip = ip;
  cfg.gateway = gateway;
  cfg.subnet = subnet;
  cfg.dns = dns;

  if (!configStore::save()) {
    JsonDocument err;
    err["error"] = "save_failed";
    sendJson(request, err, 500);
    return;
  }

  if (credentialsChanged) {
    wifiManager::applyConfig();
  }

  JsonDocument res;
  res["ok"] = true;
  res["reconnecting"] = credentialsChanged;
  sendJson(request, res);
}

void handleWifiReset(AsyncWebServerRequest* request) {
  wifiManager::requestCredentialReset();
  JsonDocument doc;
  doc["ok"] = true;
  doc["mode"] = modeName();
  sendJson(request, doc);
}

void handleLink(AsyncWebServerRequest* request) {
  JsonDocument doc;
  doc["rssi"] = wifiManager::isConnected() ? systemInfo::rssi() : 0;
  doc["connected"] = wifiManager::isConnected();
  doc["uptime"] = systemInfo::uptimeSeconds();
  sendJson(request, doc);
}

void handleState(AsyncWebServerRequest* request) {
  JsonDocument doc;
  doc["uptime"] = systemInfo::uptimeSeconds();
  doc["ip"] = wifiManager::ipString().c_str();
  doc["rssi"] = wifiManager::isConnected() ? systemInfo::rssi() : 0;
  doc["connected"] = wifiManager::isConnected();
  sendJson(request, doc);
}

void handleTime(AsyncWebServerRequest* request) {
  const time_t now = time(nullptr);
  JsonDocument doc;
  doc["epoch"] = static_cast<uint32_t>(now);
  doc["synced"] = (now > 1600000000);
  doc["uptime"] = systemInfo::uptimeSeconds();
  sendJson(request, doc);
}

void noop(AsyncWebServerRequest*) {}

}

namespace apiRoutes {

void registerRoutes(AsyncWebServer& server) {
  server.on("/api/health", HTTP_GET, handleHealth, nullptr, nullptr);
  server.on("/api/time", HTTP_GET, handleTime, nullptr, nullptr);
  server.on("/api/config", HTTP_GET, handleConfigGet, nullptr, nullptr);
  server.on("/api/config", HTTP_PUT, noop, nullptr, handleConfigPut);
  server.on("/api/wifi/reset", HTTP_POST, handleWifiReset, nullptr, nullptr);
  server.on("/api/state", HTTP_GET, handleState, nullptr, nullptr);
  server.on("/api/link", HTTP_GET, handleLink, nullptr, nullptr);
}

}
