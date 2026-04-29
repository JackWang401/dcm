#!/bin/bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

if command -v python3 >/dev/null 2>&1; then
  PYTHON_BIN="python3"
elif command -v python >/dev/null 2>&1; then
  PYTHON_BIN="python"
else
  echo "Python is not installed on this Mac."
  read -r -p "Press Enter to close..."
  exit 1
fi

"$PYTHON_BIN" app.py &
SERVER_PID=$!

sleep 2
open "http://127.0.0.1:8765"

echo "DCM Editor is running at http://127.0.0.1:8765"
echo "Close this Terminal window to stop the server."

wait "$SERVER_PID"
