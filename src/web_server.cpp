#include "web_server.h"

#include "api_routes.h"

#include <ESPAsyncWebServer.h>
#include <LittleFS.h>

namespace {

AsyncWebServer server(80);
bool fsReady = false;

void handleNotFound(AsyncWebServerRequest* request) {
  if (request->url().startsWith("/api/")) {
    request->send(404, "application/json", "{\"error\":\"not_found\"}");
    return;
  }
  if (!fsReady) {
    request->send(503, "text/plain", "filesystem unavailable");
    return;
  }
  request->send(LittleFS, "/index.html", "text/html");
}

}

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

  apiRoutes::registerRoutes(server);

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

}
