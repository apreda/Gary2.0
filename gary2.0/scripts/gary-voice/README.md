# Gary's voice

Gary speaks through **Qwen3-TTS VoiceDesign** (Alibaba Qwen, Apache 2.0) running
on Apple Silicon through **mlx-audio** (MIT). The voice is *designed from words*:
a text instruction in `voice.txt` describes the man, and the model invents the
voice from that description. There is no reference recording and no clone of a
real person, and there never will be one in this folder.

- Model: `mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16`
  (the MLX conversion of `Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign`; both carry
  the Apache 2.0 license on Hugging Face). Download size: **4.52 GB**
  (`model.safetensors` 3.83 GB + `speech_tokenizer/model.safetensors` 0.68 GB),
  cached under `~/.cache/huggingface/hub/`.
- Library: `mlx-audio==0.5.5`, Python 3.12 in `./.venv` (created with uv).
- Output: 24 kHz, mono, 16-bit PCM WAV.
- Machine it was verified on: Apple Silicon, 24 GB, macOS 25.5.

## Install (one time)

```sh
cd /Users/adam.preda/Gary2.0/gary2.0/scripts/gary-voice
/opt/homebrew/bin/uv venv --python 3.12 .venv
/opt/homebrew/bin/uv pip install --python .venv/bin/python -r requirements.txt
```

The venv is about 400 MB. The first render downloads the model (about
4.52 GB); nothing else is needed. `ffmpeg` is not required for WAV.

Optional, to fetch the model ahead of the first render:

```sh
.venv/bin/hf download mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16
```

## Render one line

```sh
.venv/bin/python say.py --text "Start with the price." --out /tmp/line.wav
.venv/bin/python say.py --text "Start with the price." --out /tmp/line.wav --voice voice-b.txt --seed 7
```

`say.py` contract (this is exactly how the worker calls it):

```
python say.py --text "<text>" --out /path/file.wav [--voice voice.txt] [--seed N]
```

- exit **0** and a 24 kHz mono WAV at `--out` on success; nothing on stdout.
- exit **1** and one `error: ...` line on stderr on failure (no partial file is
  left at `--out`; the file is written to `<out>.part` and renamed at the end).
- `--voice` defaults to `voice.txt` next to the script.
- `--seed N` makes the take repeatable; without it every call is a fresh take.
- `--text-file path` instead of `--text` for long copy.
- Also accepted: `--temperature` (0.9), `--top-k` (50), `--top-p` (1.0),
  `--repetition-penalty` (1.05), `--max-tokens` (4096, that is 12.5 speech
  tokens per second, so about five minutes of audio), `--model <hf id>`.
- `GARY_VOICE_VERBOSE=1` prints model-load and render timings to stderr.
- `GARY_VOICE_MODEL=<hf id>` overrides the model (must be a VoiceDesign build;
  `say.py` refuses anything else so the voice is never cloned from audio).

The model is loaded once per process and kept in `RENDERER`; a caller that
imports `say.py` and calls `get_renderer().render(text, instruct, out)` in a
loop pays the load once. One CLI call is one load plus one render.

### How the worker calls it

`gary2.0/src/services/cloudModelJob.js`, lane `gary-voice`:

```js
const py = '/Users/adam.preda/Gary2.0/gary2.0/scripts/gary-voice/.venv/bin/python';
const say = '/Users/adam.preda/Gary2.0/gary2.0/scripts/gary-voice/say.py';
execFile(py, [say, '--text', text, '--out', outWav], { timeout: 40_000 }, cb);
// exit 0 -> upload outWav; else the stderr line is the failure reason
```

Budget: the spec gives the voice job 40 seconds. See the timings below for what
one reply costs on this Mac; a typical Gary reply (two or three sentences)
lands well inside the budget, a full paragraph is closer to the line.

## The voice instruction

`voice.txt` (the voice in use):

> An older man, low and gravelly, a voice worn down by years of cigars. Dry,
> unhurried, sure of himself. He speaks in short, clipped sentences with a
> slight New Jersey edge and lets the pauses do the work. Confident and calm,
> never shouting, never selling. Sounds like the sharpest friend at the bar
> explaining a bet he already made.

`voice-b.txt` (more gravel, thicker Jersey):

> An older man with a deep, heavily gravelled voice, rough and hoarse from
> decades of cigars, almost a rasp. A thick, unmistakable New Jersey accent.
> Dry and unhurried, short clipped sentences, a little tired, a little amused.
> Quiet confidence with no volume behind it. Never shouts, never rushes,
> sounds like he has seen every line before.

`voice-c.txt` (less gravel, neutral accent):

> An older man with a low, smooth, lightly textured voice, a touch of gravel
> but mostly warmth. A neutral American accent with only a trace of the
> Northeast. Dry, patient and unhurried, clipped sentences with a measured,
> even rhythm. Speaks with easy confidence, low volume, never shouting, like a
> veteran broadcaster talking one on one.

To change Gary's voice, edit `voice.txt` and re-run `samples.sh`. Keep the
instruction to one paragraph in plain words: who he is, the texture, the pace,
the accent, the volume. The model reads it literally.

## Samples

```sh
./samples.sh          # seed 7
./samples.sh 11       # another take of all three
```

Renders a short smoke line first (so a broken install fails in seconds), then
the Gary paragraph with each instruction into
`/Users/adam.preda/Gary2.0/outputs/gary-voice/`:

- `smoke.wav`  the short line, `voice.txt`
- `gary-a.wav` the paragraph, `voice.txt`
- `gary-b.wav` the paragraph, `voice-b.txt`
- `gary-c.wav` the paragraph, `voice-c.txt`

The paragraph:

> Start with the price. The Rams side is juiced to minus one twenty at six and
> a half. That is the book telling you it wants this closer to seven. Giants
> plus six and a half at minus one oh two is the cheapest ticket on the board
> tonight. Melbourne is a legitimate excuse. I am not pretending the Rams are
> bad. I am saying the number already knows all of that, and I will take the
> points at near even money.

### Measured on this Mac (September 21, 2026)

| Render | Audio | Render time | Wall (incl. model load) |
|---|---|---|---|
| Smoke line, `voice.txt` | 5.4 s | 6.1 s | 11 s |
| Paragraph, `voice.txt` (gary-a) | 25.0 s | 27.5 s | 33 s |
| Paragraph, `voice-b.txt` (gary-b) | about 27 s | about 30 s | 35 s |
| Paragraph, `voice-c.txt` (gary-c) | about 23 s | about 24 s | 29 s |

- Speed: about 0.9x realtime once the model is loaded (a second of speech
  costs a little more than a second), plus the model load.
- Model load: 22 s cold (first load after the download), 4.5 s warm.
- Model download: 4.52 GB, 127 s on this connection (about 35 MB/s).
- Memory: the bf16 model is about 4.5 GB resident; the Mac has 24 GB.
- A two-sentence reply (3 s of audio) is 8 s wall end to end.
- Disk after install: the venv 0.4 GB + the model 4.5 GB. The internal disk was
  at 10 GB free before and 5.6 GB after; it needs room.

## Disk

The model lives in the Hugging Face cache on the internal disk
(`~/.cache/huggingface/hub/`, 4.5 GB). The Mac's internal disk is nearly full,
and a render under memory pressure grows swap on that same disk. Two ways to
give it room, either one a founder call:

- Put the cache on the external drive: run `say.py` with
  `HF_HOME=/Volumes/KINGSTON/hf` (and download once with that variable set).
  The worker then depends on the drive being mounted.
- Use the smaller build of the same voice model:
  `GARY_VOICE_MODEL=mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-4bit`
  (2.31 GB; the 8-bit build is 3.08 GB). Same instruction, same contract;
  re-run `samples.sh` to hear the difference.

## Notes

- Text goes in as one pass; the model does not split long copy on its own.
  Splitting into separate calls would give each piece a slightly different
  voice (every call re-designs the voice from the instruction), so `say.py`
  deliberately renders the whole text in one call. Spell numbers and prices
  out in words the way the paragraph above does; that is what Gary's copy
  already does.
- Randomness lives in MLX's global generator, so `--seed` pins the take.
- Fallback if Qwen3-TTS ever stops working on this Mac: Chatterbox
  (resemble-ai, MIT) with the same `say.py` contract. It needs a self-recorded
  reference clip (a few seconds of Adam or a hired voice, never a public
  figure). Not needed today; Qwen3-TTS installed and rendered on the first try.
  Never a non-commercial model.
