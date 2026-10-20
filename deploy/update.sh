#!/usr/bin/env bash
# On the VPS, from the cloned repo: pull, build, gzip, publish.
#   bash deploy/update.sh
# The build briefly needs 1-2 GB of RAM; afterwards only nginx runs.
set -euo pipefail
cd "$(dirname "$0")/.."
DIR=/var/www/id-card
S=; [ "$(id -u)" -ne 0 ] && S=sudo

git pull --ff-only
npm ci --no-audit --no-fund
npm run build
node deploy/precompress.mjs

# Copy into a fresh folder, then swap, so a half-finished copy is never served.
$S rm -rf "$DIR.new" "$DIR.old"
$S mkdir -p "$DIR.new"
$S cp -r out/. "$DIR.new/"
$S find "$DIR.new" -name '*.ts' -delete
$S chmod -R a+rX "$DIR.new"
[ -d "$DIR" ] && $S mv "$DIR" "$DIR.old"
$S mv "$DIR.new" "$DIR"
$S rm -rf "$DIR.old"
echo "published to $DIR"
