#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required to build the extension package." >&2
  exit 1
fi

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path('manifest.json').read_text(encoding='utf-8'))
print(manifest['version'])
PY
)"
PACKAGE_NAME="forum-keyword-monitor-${VERSION}.zip"
OUT_DIR="$ROOT_DIR/dist"
OUT_FILE="$OUT_DIR/$PACKAGE_NAME"

mkdir -p "$OUT_DIR"
rm -f "$OUT_FILE"

zip -r -FS "$OUT_FILE" \
  manifest.json \
  icons \
  src \
  -x '*/.DS_Store' \
  -x '__MACOSX/*'

printf 'Created %s\n' "$OUT_FILE"
