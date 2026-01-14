#!/bin/bash
# Build script for the metalfile tool itself

cd "$(dirname "$0")"

# Use the tool to build itself (bootstrap)
if [ -f src/metalfile ]; then
  ./src/metalfile build Metalfile.yml
else
  # Fallback if tool not built yet
  bash ../build-from-metalfile.sh
fi