#!/usr/bin/env bash
#
# extract-frames.sh — turn a source video into an optimized frame sequence
# for <canvas> scroll playback.
#
#   ./scripts/extract-frames.sh <input.mp4> <name> [fps] [width] [format] [quality] [start] [dur]
#
#   input.mp4  source video
#   name       output slug -> assets/frames/<name>/<name>_0001.<ext>
#   fps        frames per second to sample        (default 24)
#   width      output frame width in px           (default 1600)
#   format     webp | jpg                         (default webp)
#   quality    encoder quality 0-100              (default 82)
#   start      trim: seconds to skip from head    (default 0)
#   dur        trim: seconds to keep after start  (default: to end)
#
# Trimming matters for scroll sequences: a clip that opens on an empty or
# black frame wastes the first stretch of the user's scroll on nothing.
#
# Examples:
#   ./scripts/extract-frames.sh assets/video/hero.mp4 hero
#   ./scripts/extract-frames.sh assets/video/hero.mp4 hero 30 1920 jpg 86
#   ./scripts/extract-frames.sh assets/video/dashboard.mp4 dashboard 24 1600 webp 82 0.9
#
# NOTE: this build of ffmpeg has no libwebp encoder, so WebP is produced by
# piping PNG frames through `cwebp`. Install both with:
#   brew install ffmpeg webp
set -euo pipefail

IN="${1:?usage: extract-frames.sh <input.mp4> <name> [fps] [width] [format] [quality]}"
NAME="${2:?missing output name}"
FPS="${3:-24}"
WIDTH="${4:-1600}"
FORMAT="${5:-webp}"
QUALITY="${6:-82}"
START="${7:-0}"
DUR="${8:-}"

# -ss before -i seeks by keyframe (fast); -t bounds the kept span.
TRIM=()
[ "$START" != "0" ] && TRIM+=(-ss "$START")
[ -n "$DUR" ] && TRIM+=(-t "$DUR")

# NOTE: macOS ships bash 3.2, where "${TRIM[@]}" on an EMPTY array is an
# unbound-variable error under `set -u`. Every expansion below therefore uses
# the ${TRIM[@]+"${TRIM[@]}"} guard, which yields nothing when it is empty.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUT="$ROOT/assets/frames/$NAME"

[ -f "$IN" ] || { echo "error: no such file: $IN" >&2; exit 1; }
command -v ffmpeg >/dev/null || { echo "error: ffmpeg not found (brew install ffmpeg)" >&2; exit 1; }

rm -rf "$OUT"; mkdir -p "$OUT"

TRIMNOTE=""
[ "$START" != "0" ] && TRIMNOTE=" (from ${START}s)"
echo "==> $NAME: ${FPS}fps @ ${WIDTH}px -> $FORMAT q$QUALITY${TRIMNOTE}"

# scale=W:-2 keeps the aspect ratio and forces an even height (required by most codecs).
# :flags=lanczos gives noticeably crisper downscales than the default bicubic.
VF="fps=${FPS},scale=${WIDTH}:-2:flags=lanczos"

case "$FORMAT" in
  jpg|jpeg)
    # ffmpeg -q:v is an inverted scale: 2 = best, 31 = worst. Map 0-100 -> 2-31.
    QV=$(python3 -c "print(max(2, min(31, round(31 - ($QUALITY/100) * 29))))")
    ffmpeg -loglevel error -stats ${TRIM[@]+"${TRIM[@]}"} -i "$IN" -vf "$VF" -q:v "$QV" "$OUT/${NAME}_%04d.jpg"
    ;;
  webp)
    command -v cwebp >/dev/null || { echo "error: cwebp not found (brew install webp)" >&2; exit 1; }
    TMP="$(mktemp -d)"
    trap 'rm -rf "$TMP"' EXIT
    ffmpeg -loglevel error -stats ${TRIM[@]+"${TRIM[@]}"} -i "$IN" -vf "$VF" "$TMP/${NAME}_%04d.png"
    echo "==> encoding webp (parallel)..."
    # -m 6 = slowest/best compression search. Worth it: these are built once.
    find "$TMP" -name '*.png' -print0 \
      | xargs -0 -P "$(sysctl -n hw.ncpu)" -I{} \
        sh -c 'cwebp -quiet -q '"$QUALITY"' -m 6 "$1" -o "'"$OUT"'/$(basename "${1%.png}").webp"' _ {}
    ;;
  *)
    echo "error: format must be 'webp' or 'jpg'" >&2; exit 1
    ;;
esac

COUNT=$(find "$OUT" -type f -name "*.${FORMAT/jpeg/jpg}" | wc -l | tr -d ' ')
SIZE=$(du -sh "$OUT" | cut -f1)
echo "==> done: $COUNT frames, $SIZE total -> assets/frames/$NAME/"
echo "    set frameCount: $COUNT in js/main.js"
