#include "web_server.h"

#include "api_routes.h"

#include <ESPAsyncWebServer.h>
#include <LittleFS.h>
#include <vector>

namespace {

AsyncWebServer server(80);
bool fsReady = false;
std::vector<uint8_t> indexGz;

void sendIndex(AsyncWebServerRequest* request) {
  if (indexGz.empty()) {
    if (!fsReady) {
      request->send(503, "text/plain", "filesystem unavailable");
      return;
    }
    request->send(404, "text/plain", "index.html.gz not found");
    return;
  }
  AsyncWebServerResponse* response = request->beginResponse_P(
      200, "text/html", indexGz.data(), indexGz.size());
  response->addHeader("Content-Encoding", "gzip");
  response->addHeader("Cache-Control", "no-cache");
  request->send(response);
}

void handleNotFound(AsyncWebServerRequest* request) {
  const String& url = request->url();
  if (url.startsWith("/api/")) {
    request->send(404, "application/json", "{\"error\":\"not_found\"}");
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

  server.on("/", HTTP_GET, sendIndex);
  server.on("/index.html", HTTP_GET, sendIndex);

  server.serveStatic("/", LittleFS, "/")
      .setDefaultFile("index.html")
      .setCacheControl("public, max-age=600");

  server.onNotFound(handleNotFound);

  server.begin();
  Serial.println("[web] listening on port 80");
  return true;
}

bool fsMounted() {
  return fsReady;
}

}  // namespace webServer
