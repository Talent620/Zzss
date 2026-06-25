#!/usr/bin/env bash
# build-binaries.sh — produce standalone Aegis CLI binaries with Node SEA.
#
#   ./tools/build-binaries.sh           # builds Linux (+ Windows if node-win zip present)
#
# Output (in dist/, git-ignored):
#   aegis.cjs          single-file CommonJS bundle (run with: node aegis.cjs)
#   aegis-linux-x64    standalone Linux executable (no Node needed)
#   aegis-win-x64.exe  standalone Windows executable (no Node needed; unsigned)
#
# Requires dev deps: esbuild, postject (npm i -D esbuild postject).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p dist
FUSE="NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
NODEVER="$(node -v)"

echo "[1/4] bundle src/cli.ts -> dist/aegis.cjs"
./node_modules/.bin/esbuild src/cli.ts --bundle --platform=node --target=node22 --format=cjs --outfile=dist/aegis.cjs

echo "[2/4] generate SEA blob"
cat > dist/sea-config.json <<JSON
{ "main": "dist/aegis.cjs", "output": "dist/sea-prep.blob", "disableExperimentalSEAWarning": true }
JSON
node --experimental-sea-config dist/sea-config.json

echo "[3/4] build Linux binary"
cp "$(command -v node)" dist/aegis-linux-x64
node -e "const{inject}=require('postject');const fs=require('fs');inject('dist/aegis-linux-x64','NODE_SEA_BLOB',fs.readFileSync('dist/sea-prep.blob'),{sentinelFuse:'$FUSE'}).then(()=>console.log(' linux ok'))"
chmod +x dist/aegis-linux-x64

echo "[4/4] build Windows binary (if matching node.exe available)"
WIN="dist/node-${NODEVER}-win-x64/node.exe"
if [ ! -f "$WIN" ]; then
  echo "  fetching node ${NODEVER} win-x64"
  curl -fsSL "https://nodejs.org/dist/${NODEVER}/node-${NODEVER}-win-x64.zip" -o dist/node-win.zip
  (cd dist && unzip -o -q node-win.zip "node-${NODEVER}-win-x64/node.exe")
fi
cp "$WIN" dist/aegis-win-x64.exe
node -e "const{inject}=require('postject');const fs=require('fs');inject('dist/aegis-win-x64.exe','NODE_SEA_BLOB',fs.readFileSync('dist/sea-prep.blob'),{sentinelFuse:'$FUSE'}).then(()=>console.log(' windows ok'))"

echo "done. binaries in dist/"
