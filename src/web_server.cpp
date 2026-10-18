#include "web_server.h"

#include "api_routes.h"
#include "wifi_manager.h"

#include <ESPAsyncWebServer.h>
#include <LittleFS.h>

#include <vector>

namespace {

AsyncWebServer server(80);
bool fsReady = false;
std::vector<uint8_t> indexGz;

void sendIndex(AsyncWebServerRequest* request) {
  if (request->client()) {
    request->client()->setNoDelay(true);
  }
  Serial.printf("[web] sendIndex url='%s'\n", request->url().c_str());
  if (indexGz.empty()) {
    if (!fsReady) {
      request->send(503, "text/plain", "filesystem unavailable");
      return;
    }
    request->send(404, "text/plain", "index.html.gz not found");
    return;
  }
  AsyncWebServerResponse* response = request->beginResponse(
      "text/html",
      indexGz.size(),
      [](uint8_t* buffer, size_t maxLen, size_t index) -> size_t {
        if (index >= indexGz.size()) {
          return 0;
        }
        const size_t len = std::min(maxLen, indexGz.size() - index);
        memcpy(buffer, indexGz.data() + index, len);
        return len;
      });
  response->addHeader("Content-Encoding", "gzip");
  response->addHeader("Cache-Control", "no-cache, no-store, must-revalidate");
  response->addHeader("Pragma", "no-cache");
  response->addHeader("Expires", "0");
  request->send(response);
  Serial.printf("[web] sendIndex served %u bytes\n", static_cast<unsigned>(indexGz.size()));
}

void handleNotFound(AsyncWebServerRequest* request) {
  const String& url = request->url();
  if (url.startsWith("/api/")) {
    request->send(404, "application/json", "{\"error\":\"not_found\"}");
    return;
  }
  if (wifiManager::mode() == WifiMode::Provisioning) {
    const String& host = request->host();
    if (host != "192.168.4.1" && !host.startsWith("bundle-panel") && !host.startsWith("bun-panel")) {
      request->redirect("http://192.168.4.1/");
      return;
    }
  }
  if (url.endsWith(".ico") || url.endsWith(".png") || url.endsWith(".jpg") ||
      url.endsWith(".svg") || url.endsWith(".map") || url.endsWith(".json") ||
      url.endsWith(".txt")) {
    request->send(404, "text/plain", "not found");
    return;
  }
  sendIndex(request);
}

}  // namespace

namespace webServer {

bool begin() {
  fsReady = LittleFS.begin(true);
  if (!fsReady) {
    Serial.println("[web] LittleFS mount failed");
    return false;
  }
  Serial.printf("[web] littlefs %lu/%lu bytes used\n",
                static_cast<unsigned long>(LittleFS.usedBytes()),
                static_cast<unsigned long>(LittleFS.totalBytes()));

  if (LittleFS.exists("/index.html.gz")) {
    File f = LittleFS.open("/index.html.gz", "r");
    if (f) {
      const size_t sz = f.size();
      indexGz.resize(sz);
      f.read(indexGz.data(), sz);
      f.close();
      Serial.printf("[web] cached index.html.gz into RAM (%u bytes)\n", static_cast<unsigned>(sz));
    }
  } else {
    Serial.println("[web] /index.html.gz not found in LittleFS");
  }

  apiRoutes::registerRoutes(server);

  server.on("/ping", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send(200, "text/plain", "pong");
  });
  server.on("/favicon.ico", HTTP_GET, [](AsyncWebServerRequest* req) {
    req->send(204);
  });
  server.on("/", HTTP_GET, sendIndex);
  server.on("/index.html", HTTP_GET, sendIndex);

  // Captive portal probes
  auto captiveRedirect = [](AsyncWebServerRequest* req) {
    req->redirect("http://192.168.4.1/");
  };
  server.on("/hotspot-detect.html", HTTP_GET, captiveRedirect);
  server.on("/generate_204", HTTP_GET, captiveRedirect);
  server.on("/gen_204", HTTP_GET, captiveRedirect);
  server.on("/connecttest.txt", HTTP_GET, captiveRedirect);
  server.on("/ncsi.txt", HTTP_GET, captiveRedirect);

  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("[web] listening on port 80");
  return true;
}

bool fsMounted() {
  return fsReady;
}

}  // namespace webServer
