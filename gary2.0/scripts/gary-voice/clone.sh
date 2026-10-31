#!/bin/sh
# Make a designed take Gary's live voice: instant-clone it into Cartesia (Pro plan or above; the free tier
# refuses clones) and point gary_voice_config at the new voice. Usage: ./clone.sh [gary-coach.wav]
set -e
HERE=$(cd "$(dirname "$0")" && pwd)
CLIP=${1:-$HERE/gary-coach.wav}
KEY=$(grep '^CARTESIA_API_KEY=' "$HERE/../../.env" | cut -d= -f2)
ID=$(curl -s -X POST https://api.cartesia.ai/voices/clone \
  -H "Authorization: Bearer $KEY" -H "Cartesia-Version: 2026-08-14" \
  -F "clip=@$CLIP" -F "name=Gary" -F "language=en" -F "access=private" \
  -F "description=Gary, the Gary app's AI bettor. Designed from words with Qwen3-TTS VoiceDesign; not a real person." \
  | python3 -c 'import sys,json; d=json.load(sys.stdin); print(d["id"]) if "id" in d else sys.exit("clone refused: " + json.dumps(d))')
cd "$HERE/../.." && npx supabase db query --linked "update public.gary_voice_config set voice_id='$ID', updated_at=now() where id=1" -o json >/dev/null
echo "Gary's voice is now $ID"
