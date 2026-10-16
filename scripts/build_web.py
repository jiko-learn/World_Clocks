"""Build the Vite/React frontend into data/ before the firmware build.

Cached on a content hash of the web sources so routine firmware edits do
not re-run npm.
"""

import hashlib
import os
import shutil
import subprocess
import sys

Import("env")  # noqa: F821  (injected by SCons)

PROJECT_DIR = env.subst("$PROJECT_DIR")  # noqa: F821
WEB_DIR = os.path.join(PROJECT_DIR, "web")
DATA_DIR = os.path.join(PROJECT_DIR, "data")
STAMP = os.path.join(WEB_DIR, ".build-stamp")

WATCH_FILES = [
    "index.html",
    "package.json",
    "package-lock.json",
    "vite.config.ts",
    "tsconfig.json",
    "scripts/gzip.mjs",
]
WATCH_DIRS = ["src"]


def fingerprint():
    digest = hashlib.sha256()

    def add(path, label):
        digest.update(label.encode("utf-8"))
        with open(path, "rb") as handle:
            digest.update(handle.read())

    for rel in WATCH_FILES:
        path = os.path.join(WEB_DIR, rel)
        if os.path.exists(path):
            add(path, rel)

    for rel_dir in WATCH_DIRS:
        root = os.path.join(WEB_DIR, rel_dir)
        if not os.path.isdir(root):
            continue
        for dirpath, dirnames, filenames in os.walk(root):
            dirnames[:] = sorted(d for d in dirnames if d != "node_modules")
            for name in sorted(filenames):
                path = os.path.join(dirpath, name)
                add(path, os.path.relpath(path, WEB_DIR))

    return digest.hexdigest()


def assets_present():
    for name in ("index.html.gz", "index.html"):
        if os.path.exists(os.path.join(DATA_DIR, name)):
            return True
    return False


def run(cmd):
    print("[web] %s" % " ".join(cmd))
    if subprocess.call(cmd, cwd=WEB_DIR) != 0:
        sys.exit("[web] failed: %s" % " ".join(cmd))


current = fingerprint()
previous = ""
if os.path.exists(STAMP):
    with open(STAMP) as handle:
        previous = handle.read().strip()

if previous == current and assets_present():
    print("[web] assets up to date, skipping npm build")
else:
    if not shutil.which("npm"):
        if assets_present():
            print("[web] npm not found; keeping existing assets in data/")
        else:
            sys.exit(
                "[web] npm not found and data/ is empty. Install Node.js, or run "
                "`npm install && npm run build` inside web/."
            )
    else:
        if not os.path.isdir(os.path.join(WEB_DIR, "node_modules")):
            print("[web] installing dependencies")
            run(["npm", "ci"] if os.path.exists(os.path.join(WEB_DIR, "package-lock.json"))
                else ["npm", "install"])
        print("[web] building frontend")
        run(["npm", "run", "build"])

    with open(STAMP, "w") as handle:
        handle.write(current)


def patch_asyncwebserver():
    resp_path = os.path.join(
        PROJECT_DIR, ".pio", "libdeps", "esp32dev", "ESPAsyncWebServer", "src", "WebResponses.cpp"
    )
    if os.path.exists(resp_path):
        with open(resp_path, "r", encoding="utf-8") as f:
            content = f.read()
        target = "bool AsyncWebServerResponse::_finished() const {\n  return _state > RESPONSE_WAIT_ACK;\n}"
        replacement = "bool AsyncWebServerResponse::_finished() const {\n  return (_state > RESPONSE_WAIT_ACK) && (_ackedLength >= _writtenLength);\n}"
        if target in content:
            content = content.replace(target, replacement)
            print("[patch] applied _ackedLength ACK check to ESPAsyncWebServer")

        target2 = "    size_t const pcb_written = request->client()->add(_assembled_headers.c_str() + _writtenHeadersLength, _assembled_headers.length() - _writtenHeadersLength);\n    _writtenLength += pcb_written;\n    _writtenHeadersLength += pcb_written;"
        replacement2 = "    size_t const pcb_written = request->client()->add(_assembled_headers.c_str() + _writtenHeadersLength, _assembled_headers.length() - _writtenHeadersLength);\n    _writtenHeadersLength += pcb_written;\n    if (_writtenHeadersLength < _assembled_headers.length()) {\n#if ASYNCWEBSERVER_USE_CHUNK_INFLIGHT\n      _in_flight += pcb_written;\n      --_in_flight_credit;  // take a credit\n#endif\n      _writtenLength += pcb_written;"
        old_part = "    size_t const pcb_written = request->client()->add(_assembled_headers.c_str() + _writtenHeadersLength, _assembled_headers.length() - _writtenHeadersLength);\n    _writtenLength += pcb_written;\n    _writtenHeadersLength += pcb_written;\n    if (_writtenHeadersLength < _assembled_headers.length()) {"
        if old_part in content:
            content = content.replace(old_part, replacement2)
            print("[patch] fixed header double-counting in ESPAsyncWebServer")
        partial_target = "        if (added_len != _send_buffer_len - _send_buffer_offset) {\n          // we were not able to add entire buffer's content to tcp buffs, leave it for later\n          // (this should not happen normally unless connection's TCP window suddenly changed from remote or mem pressure)\n          _send_buffer_offset += added_len;\n          break;\n        } else {\n          _send_buffer_len = _send_buffer_offset = 0;  // consider buffer empty\n        }\n        payloadlen += added_len;"
        partial_replacement = "        payloadlen += added_len;\n        if (added_len != _send_buffer_len - _send_buffer_offset) {\n          // we were not able to add entire buffer's content to tcp buffs, leave it for later\n          // (this should not happen normally unless connection's TCP window suddenly changed from remote or mem pressure)\n          _send_buffer_offset += added_len;\n          break;\n        } else {\n          _send_buffer_len = _send_buffer_offset = 0;  // consider buffer empty\n        }"
        if partial_target in content:
            content = content.replace(partial_target, partial_replacement)
            print("[patch] fixed partial write accounting in ESPAsyncWebServer")

        with open(resp_path, "w", encoding="utf-8") as f:
            f.write(content)


patch_asyncwebserver()

