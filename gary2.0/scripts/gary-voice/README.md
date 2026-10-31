# Gary's voice

Gary talks on Home through the `gary-voice` edge function: Claude Opus 5.5 writes the answer from his picks,
and Cartesia Sonic 3.6 speaks it in real time. Which voice speaks lives in `public.gary_voice_config.voice_id`,
so swapping it never needs an app build.

**The voice is designed, not cloned from anyone.** `design.py` runs Qwen3-TTS VoiceDesign (Alibaba Qwen,
Apache 2.0) locally through mlx-audio and invents a voice from a written description of the man (Adam, Sep 21:
"Mike Ditka with a slight East Coast accent"; Gary is the cigar-and-aviators bear in the sweater vest). The
takes kept here:

| file | description used | pitch | gravel (HNR, lower = rougher) | pace |
| --- | --- | --- | --- | --- |
| `gary-coach.wav` | deep gravelly baritone, big-chested and gruff but warm, slight East Coast edge | 105 Hz | 8.8 dB | 3.1 words/s |
| `gary-gravel.wav` | heavily gravelled, almost a rasp, noticeable East Coast accent, dry | 110 Hz | 8.7 dB | 2.6 words/s |

Qwen3-TTS renders about 3x slower than real time on this Mac, too slow to answer live, so a take becomes the
live voice by instant-cloning it into Cartesia: `./clone.sh` (or `./clone.sh gary-gravel.wav`). Cartesia's free
tier refuses clones and has no commercial license; Pro ($5/month) or above is needed.

Until then the live voice is Cartesia's library voice "Clint" (`db69127a-dbaf-4fa9-b425-2fe67680c348`), the
deepest and roughest of its library (94 Hz, 7.6 dB).

To design new takes: a Python 3.12 venv with `mlx-audio==0.5.5 soundfile numpy`, the model
`mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16` (4.5 GB, cached on KINGSTON), then
`PYTHONDONTWRITEBYTECODE=1 python -I design.py 7 21` (seeds). On the exFAT KINGSTON drive, delete the venv's
`._*` files first or transformers fails reading them.
