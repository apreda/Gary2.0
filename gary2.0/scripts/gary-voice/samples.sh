#!/bin/zsh
# Render the Gary paragraph with the three candidate voice instructions.
# Output: Gary2.0/outputs/gary-voice/gary-a.wav, gary-b.wav, gary-c.wav
# Usage: ./samples.sh [seed]    (default seed 7; same seed = same take per voice)
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
OUT="$(cd "$HERE/../../.." && pwd)/outputs/gary-voice"
PY="$HERE/.venv/bin/python"
SEED="${1:-7}"
mkdir -p "$OUT"

if [[ ! -x "$PY" ]]; then
  echo "error: no venv at $HERE/.venv — see README.md (uv venv + uv pip install)" >&2
  exit 1
fi

SMOKE="Start with the price. That is the whole game tonight, and it is the part most people skip."

read -r -d '' PARAGRAPH <<'TXT'
Start with the price. The Rams side is juiced to minus one twenty at six and a half. That is the book telling you it wants this closer to seven. Giants plus six and a half at minus one oh two is the cheapest ticket on the board tonight. Melbourne is a legitimate excuse. I am not pretending the Rams are bad. I am saying the number already knows all of that, and I will take the points at near even money.
TXT

render() {  # render <voice file> <out wav> <text>
  local voice="$1" out="$2" text="$3" t0 t1
  t0=$(date +%s)
  if GARY_VOICE_VERBOSE=1 "$PY" "$HERE/say.py" --text "$text" --out "$out" --voice "$HERE/$voice" --seed "$SEED"; then
    t1=$(date +%s)
    echo "$(basename "$out")  $(( t1 - t0 ))s wall  $(du -h "$out" | cut -f1)  ($voice)"
  else
    echo "error: $voice failed on $(basename "$out")" >&2
    return 1
  fi
}

# A short line first so a broken install surfaces in seconds, not minutes.
render voice.txt "$OUT/smoke.wav" "$SMOKE" || exit 1

render voice.txt   "$OUT/gary-a.wav" "$PARAGRAPH"
render voice-b.txt "$OUT/gary-b.wav" "$PARAGRAPH"
render voice-c.txt "$OUT/gary-c.wav" "$PARAGRAPH"
