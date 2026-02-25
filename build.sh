#!/usr/bin/env bash
# Build the metalfile Debian package from the manifest without self-bootstrapping.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
MANIFEST="${1:-$ROOT/Metalfile.yml}"

if ! command -v yq >/dev/null; then
  echo "yq is required. Install with: sudo apt install yq" >&2
  exit 1
fi

MANIFEST_DIR="$(cd "$(dirname "$MANIFEST")" && pwd)"
MANIFEST_FILE="$(basename "$MANIFEST")"
cd "$MANIFEST_DIR"

PKG_NAME=$(yq -r '.package.name' "$MANIFEST_FILE")
PKG_VERSION=$(yq -r '.package.version' "$MANIFEST_FILE")
PKG_ARCH=$(yq -r '.package.architecture' "$MANIFEST_FILE")
PKG_DEPENDS=$(yq -r '.package.depends | join(", ")' "$MANIFEST_FILE")
PKG_DESC=$(yq -r '.package.description' "$MANIFEST_FILE")

BUILD_ROOT="$MANIFEST_DIR/deb-build/$PKG_NAME"
STAGE="$BUILD_ROOT/root"
rm -rf "$BUILD_ROOT"
mkdir -p "$STAGE/DEBIAN" "$MANIFEST_DIR/dist"

cat > "$STAGE/DEBIAN/control" <<EOF
Package: $PKG_NAME
Version: $PKG_VERSION
Section: misc
Priority: optional
Architecture: $PKG_ARCH
Depends: $PKG_DEPENDS
Maintainer: Metalfile Builder <builder@metalfile.org>
Description: $PKG_DESC
EOF

for script in postinst prerm postrm; do
  SCRIPT_CONTENT=$(yq -r --exit-status ".$script" "$MANIFEST_FILE" 2>/dev/null || true)
  if [ -n "$SCRIPT_CONTENT" ] && [ "$SCRIPT_CONTENT" != "null" ]; then
    echo '#!/bin/bash' > "$STAGE/DEBIAN/$script"
    printf '%s\n' "$SCRIPT_CONTENT" >> "$STAGE/DEBIAN/$script"
    chmod +x "$STAGE/DEBIAN/$script"
  fi
done

yq -r '.files[] | "\(.src) \(.dest)"' "$MANIFEST_FILE" | while read -r src dest; do
  mkdir -p "$(dirname "$STAGE$dest")"
  cp -r "$MANIFEST_DIR/$src" "$STAGE$dest"
done

OUTPUT="$MANIFEST_DIR/dist/${PKG_NAME}_${PKG_VERSION}_${PKG_ARCH}.deb"
dpkg-deb --build "$STAGE" "$OUTPUT"
rm -rf "$BUILD_ROOT"
echo "Built package -> $OUTPUT"
