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
