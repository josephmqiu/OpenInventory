#!/usr/bin/env bash
# Encode the captured WebM flows into optimized, looping GIFs for the README.
#
#   scripts/media/encode.sh
#
# Two-pass ffmpeg palette pipeline (palettegen + paletteuse) for clean text and
# small files. Aspect ratio is always preserved (scale=W:-2) — never squished.
# Source WebMs are kept under docs/media/raw/ so an MP4 can be produced later
# without re-recording.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
RAW="$ROOT/docs/media/raw"
OUT="$ROOT/docs/media"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

FPS=14
DESKTOP_W=900
MOBILE_W=360

encode() {
  local in="$1" name w
  name="$(basename "$in" .webm)"
  case "$name" in
    *mobile*) w=$MOBILE_W ;;
    *)        w=$DESKTOP_W ;;
  esac
  # Recording starts at browser-context creation, so each clip opens with a
  # second or two of the dark page loading. Trim that leading black so the GIF
  # starts on real content.
  local start
  start=$(ffmpeg -i "$in" -vf "blackdetect=d=0.1:pix_th=0.10" -an -f null - 2>&1 \
    | grep -oE 'black_start:0 black_end:[0-9.]+' | head -1 | grep -oE '[0-9.]+$')
  start=${start:-0}
  local pal="$TMP/$name.png" out="$OUT/$name.gif"
  local filters="fps=$FPS,scale=$w:-2:flags=lanczos"
  echo "[encode] $name  (width $w, trim ${start}s)"
  ffmpeg -y -loglevel error -ss "$start" -i "$in" -vf "$filters,palettegen=stats_mode=diff" "$pal"
  ffmpeg -y -loglevel error -ss "$start" -i "$in" -i "$pal" \
    -lavfi "$filters[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=3:diff_mode=rectangle" \
    "$out"
  local kb
  kb=$(( $(stat -f%z "$out" 2>/dev/null || stat -c%s "$out") / 1024 ))
  echo "[encode]   -> docs/media/$name.gif  (${kb} KB)"
}

for f in "$RAW"/*.webm; do
  [ -e "$f" ] || continue
  encode "$f"
done
echo "[encode] done -> docs/media/"
