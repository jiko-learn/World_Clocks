#include "config_store.h"

#include <Preferences.h>
#include <string.h>

namespace {

constexpr const char* kNamespace = "bunpanel";
constexpr const char* kKeyBlob = "cfg";
constexpr const char* kKeyVersion = "ver";

DeviceConfig current;

DeviceConfig defaults() {
  DeviceConfig c;
  strlcpy(c.ssid, "", sizeof(c.ssid));
  strlcpy(c.password, "", sizeof(c.password));
  strlcpy(c.hostname, "bun-panel", sizeof(c.hostname));
  c.useStaticIp = false;
  c.ip = IPAddress(0, 0, 0, 0);
  c.gateway = IPAddress(0, 0, 0, 0);
  c.subnet = IPAddress(255, 255, 255, 0);
  c.dns = IPAddress(0, 0, 0, 0);
  c.version = kConfigVersion;
  return c;
}

DeviceConfig load() {
  DeviceConfig c = defaults();
  Preferences p;
  if (!p.begin(kNamespace, true)) {
    return c;
  }
  const uint16_t stored = p.getUShort(kKeyVersion, 0);
  if (stored == kConfigVersion) {
    p.getBytes(kKeyBlob, &c, sizeof(c));
    c.version = kConfigVersion;
  }
  p.end();
  return c;
}

}

namespace configStore {

bool begin() {
  current = load();
  return true;
}

DeviceConfig& get() {
  return current;
}

bool save() {
  current.version = kConfigVersion;
  Preferences p;
  if (!p.begin(kNamespace, false)) {
    return false;
  }
  p.putUShort(kKeyVersion, kConfigVersion);
  const bool ok = p.putBytes(kKeyBlob, &current, sizeof(current));
  p.end();
  return ok;
}

void clear() {
  Preferences p;
  if (p.begin(kNamespace, false)) {
    p.clear();
    p.end();
  }
  current = defaults();
}

bool hasCredentials() {
  return current.ssid[0] != '\0';
}

}
