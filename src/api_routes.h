#pragma once

#include <Arduino.h>

class AsyncWebServer;

namespace apiRoutes {

void registerRoutes(AsyncWebServer& server);

}
