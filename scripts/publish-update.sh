#!/bin/zsh
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
KEY="$HOME/.tauri/perch.key"
REPO="Gowtham-reddy23/perch-updates"

if [[ ! -f "$KEY" ]]; then
  echo "Missing signing key at $KEY"
  exit 1
fi

export TAURI_SIGNING_PRIVATE_KEY="$(cat "$KEY")"
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD=""

cd "$ROOT"
npm run dmg

APP_NAME="Alt-AK"
APP="$ROOT/src-tauri/target/release/bundle/macos/${APP_NAME}.app"
codesign --force --deep --sign - "$APP"
cd "$ROOT/src-tauri/target/release/bundle/macos"
rm -f "${APP_NAME}.app.tar.gz" "${APP_NAME}.app.tar.gz.sig"
tar -czf "${APP_NAME}.app.tar.gz" "${APP_NAME}.app"
cd "$ROOT"
export TAURI_SIGNING_PRIVATE_KEY_PATH="$KEY"
npx tauri signer sign "$ROOT/src-tauri/target/release/bundle/macos/${APP_NAME}.app.tar.gz"

python3 - "$ROOT" "$REPO" <<'PY'
import json, pathlib, sys
from datetime import datetime, timezone
root, repo = sys.argv[1], sys.argv[2]
conf = json.loads(pathlib.Path(root, "src-tauri/tauri.conf.json").read_text())
version = conf["version"]
sig = pathlib.Path(root, "src-tauri/target/release/bundle/macos/Alt-AK.app.tar.gz.sig").read_text().strip()
doc = {
    "version": version,
    "notes": f"Alt-AK {version}",
    "pub_date": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
    "platforms": {
        "darwin-aarch64": {
            "signature": sig,
            "url": f"https://github.com/{repo}/releases/download/v{version}/Alt-AK.app.tar.gz",
        }
    },
}
out = pathlib.Path(root, "src-tauri/target/release/bundle/macos/latest.json")
out.write_text(json.dumps(doc, indent=2) + "\n")
print(version)
PY

VERSION="$(python3 -c 'import json; print(json.load(open("src-tauri/tauri.conf.json"))["version"])')"
cd "$ROOT/src-tauri/target/release/bundle/macos"
gh release create "v$VERSION" --repo "$REPO" --title "Alt-AK $VERSION" --notes "Alt-AK $VERSION" latest.json "Alt-AK.app.tar.gz"
echo "Published v$VERSION"
