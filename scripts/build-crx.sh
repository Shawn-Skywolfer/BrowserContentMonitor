#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v zip >/dev/null 2>&1; then
  echo "Error: zip is required to build the extension package." >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "Error: openssl is required to build the CRX package." >&2
  exit 1
fi

VERSION="$(python3 - <<'PY'
import json
from pathlib import Path
manifest = json.loads(Path('manifest.json').read_text(encoding='utf-8'))
print(manifest['version'])
PY
)"

OUT_DIR="$ROOT_DIR/dist"
PACKAGE_BASENAME="forum-keyword-monitor-${VERSION}"
ZIP_FILE="$OUT_DIR/${PACKAGE_BASENAME}.zip"
CRX_FILE="$OUT_DIR/${PACKAGE_BASENAME}.crx"
KEY_FILE="${1:-$OUT_DIR/forum-keyword-monitor.pem}"

mkdir -p "$OUT_DIR"

if [[ ! -f "$KEY_FILE" ]]; then
  mkdir -p "$(dirname "$KEY_FILE")"
  openssl genrsa -out "$KEY_FILE" 2048 >/dev/null 2>&1
  chmod 600 "$KEY_FILE"
  printf 'Created private key %s\n' "$KEY_FILE"
  printf 'Keep this key to preserve the extension ID across future CRX builds.\n'
fi

rm -f "$ZIP_FILE" "$CRX_FILE"
zip -q -r -FS "$ZIP_FILE" \
  manifest.json \
  icons \
  src \
  -x '*/.DS_Store' \
  -x '__MACOSX/*'

TMP_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

PUBLIC_DER="$TMP_DIR/public.der"
SIGNED_DATA="$TMP_DIR/signed-data.bin"
SIGNING_PAYLOAD="$TMP_DIR/signing-payload.bin"
SIGNATURE="$TMP_DIR/signature.bin"

openssl rsa -in "$KEY_FILE" -pubout -outform DER -out "$PUBLIC_DER" >/dev/null 2>&1

python3 - "$PUBLIC_DER" "$SIGNED_DATA" <<'PY'
import hashlib
import sys
from pathlib import Path

public_key = Path(sys.argv[1]).read_bytes()
crx_id = hashlib.sha256(public_key).digest()[:16]
Path(sys.argv[2]).write_bytes(b'\x0a' + bytes([len(crx_id)]) + crx_id)
PY

python3 - "$SIGNED_DATA" "$ZIP_FILE" "$SIGNING_PAYLOAD" <<'PY'
import struct
import sys
from pathlib import Path

signed_data = Path(sys.argv[1]).read_bytes()
archive = Path(sys.argv[2]).read_bytes()
payload = b'CRX3 SignedData\x00' + struct.pack('<I', len(signed_data)) + signed_data + archive
Path(sys.argv[3]).write_bytes(payload)
PY

openssl dgst -sha256 \
  -sign "$KEY_FILE" \
  -sigopt rsa_padding_mode:pss \
  -sigopt rsa_pss_saltlen:-1 \
  -out "$SIGNATURE" \
  "$SIGNING_PAYLOAD"

python3 - "$PUBLIC_DER" "$SIGNATURE" "$SIGNED_DATA" "$ZIP_FILE" "$CRX_FILE" <<'PY'
import hashlib
import struct
import sys
from pathlib import Path

public_key = Path(sys.argv[1]).read_bytes()
signature = Path(sys.argv[2]).read_bytes()
signed_data = Path(sys.argv[3]).read_bytes()
archive = Path(sys.argv[4]).read_bytes()
out_file = Path(sys.argv[5])


def varint(value: int) -> bytes:
    chunks = []
    while value > 0x7F:
        chunks.append((value & 0x7F) | 0x80)
        value >>= 7
    chunks.append(value)
    return bytes(chunks)


def bytes_field(field_number: int, value: bytes) -> bytes:
    tag = (field_number << 3) | 2
    return varint(tag) + varint(len(value)) + value

proof = bytes_field(1, public_key) + bytes_field(2, signature)
header = bytes_field(2, proof) + bytes_field(10000, signed_data)
crx = b'Cr24' + struct.pack('<II', 3, len(header)) + header + archive
out_file.write_bytes(crx)

crx_id = hashlib.sha256(public_key).digest()[:16]
chrome_id = ''.join(chr(ord('a') + nibble) for byte in crx_id for nibble in (byte >> 4, byte & 0x0F))
print(f'Created {out_file}')
print(f'Extension ID: {chrome_id}')
PY
