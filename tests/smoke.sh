#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
APP_DIR="$ROOT/tests/simple-app"
DEB_DIR="$APP_DIR/hello-deb"
DEB_FILE="$APP_DIR/hello-deb.deb"

rm -rf "$DEB_DIR" "$DEB_FILE"

chmod +x "$APP_DIR/hello.sh"
"$ROOT/src/metalfile" build "$APP_DIR/Metalfile.yml"

test -f "$DEB_FILE"
dpkg-deb -f "$DEB_FILE" Package | grep -qx 'hello'
dpkg-deb -c "$DEB_FILE" | grep -q '/opt/hello/hello.sh'
dpkg-deb -c "$DEB_FILE" | grep -q '/etc/hello/config.json'

# Verify DEBIAN/conffiles lists the config path
dpkg-deb -e "$DEB_FILE" "$DEB_DIR/DEBIAN"
grep -qx '/etc/hello/config.json' "$DEB_DIR/DEBIAN/conffiles"

TMP_DIR="$(mktemp -d)"
dpkg-deb -x "$DEB_FILE" "$TMP_DIR"
test -x "$TMP_DIR/opt/hello/hello.sh"
"$TMP_DIR/opt/hello/hello.sh" | grep -q 'Hello from metalfile test'
rm -rf "$TMP_DIR" "$DEB_DIR" "$DEB_FILE"

echo "Smoke test passed."
