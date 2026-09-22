#!/usr/bin/env python
"""Gary's voice — render one line of text to a 24 kHz mono WAV.

Engine: Qwen3-TTS VoiceDesign (Apache 2.0) through mlx-audio on Apple Silicon.
The voice is designed from a text instruction (voice.txt); no reference audio,
never a clone of a real person.

Contract (the worker calls it exactly like this):

    python say.py --text "<text>" --out /path/file.wav [--voice voice.txt] [--seed N]

  exit 0  -> a 24 kHz, mono, 16-bit PCM WAV exists at --out
  exit 1  -> the reason is on stderr ("error: ...")

Nothing is printed on success. The model is loaded once per process and
cached in RENDERER for any further render() calls made from the same process.
Set GARY_VOICE_VERBOSE=1 to get timing lines on stderr.
"""

import argparse
import contextlib
import os
import sys
import time
from pathlib import Path

# Keep the libraries quiet: the contract is "only errors on stderr".
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error")
os.environ.setdefault("HF_HUB_DISABLE_PROGRESS_BARS", "1")
os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
os.environ.setdefault("TQDM_DISABLE", "1")

HERE = Path(__file__).resolve().parent
DEFAULT_MODEL = os.environ.get(
    "GARY_VOICE_MODEL", "mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"
)
DEFAULT_VOICE = HERE / "voice.txt"
SAMPLE_RATE = 24000
VERBOSE = os.environ.get("GARY_VOICE_VERBOSE", "") not in ("", "0")

RENDERER = None  # the one model per process


@contextlib.contextmanager
def quiet_stdout():
    """mlx-audio print()s progress lines on stdout while loading; the contract
    is silence on success, so send them to stderr when verbose, else drop them."""
    if VERBOSE:
        with contextlib.redirect_stdout(sys.stderr):
            yield
    else:
        with open(os.devnull, "w") as sink, contextlib.redirect_stdout(sink):
            yield


def log(msg):
    if VERBOSE:
        print(msg, file=sys.stderr, flush=True)


def fail(msg, code=1):
    print(f"error: {msg}", file=sys.stderr, flush=True)
    sys.exit(code)


class Renderer:
    """Holds the loaded model; one per process."""

    def __init__(self, model_id):
        import mlx.core as mx  # noqa: F401  (fails early if MLX is missing)
        from mlx_audio.tts.utils import load_model

        t0 = time.time()
        self.model_id = model_id
        with quiet_stdout():
            self.model = load_model(model_id)
        if getattr(self.model, "speech_tokenizer", None) is None:
            raise RuntimeError(f"{model_id} loaded without its speech tokenizer")
        if getattr(self.model.config, "tts_model_type", None) != "voice_design":
            raise RuntimeError(
                f"{model_id} is not a VoiceDesign model; the voice must be designed "
                "from words, never cloned from audio"
            )
        self.sample_rate = int(getattr(self.model, "sample_rate", SAMPLE_RATE))
        log(f"model loaded in {time.time() - t0:.1f}s ({model_id}, {self.sample_rate} Hz)")

    def render(self, text, instruct, out_path, seed=None, temperature=0.9,
               top_k=50, top_p=1.0, repetition_penalty=1.05, max_tokens=4096):
        import mlx.core as mx
        import numpy as np
        from scipy.io import wavfile

        if seed is not None:
            mx.random.seed(int(seed))

        t0 = time.time()
        chunks = []
        with quiet_stdout():
          for result in self.model.generate_voice_design(
            text=text,
            instruct=instruct,
            language="English",
            temperature=temperature,
            top_k=top_k,
            top_p=top_p,
            repetition_penalty=repetition_penalty,
            max_tokens=max_tokens,
            verbose=False,
          ):
            chunks.append(result.audio)
        if not chunks:
            raise RuntimeError("the model produced no audio")

        audio = mx.concatenate(chunks, axis=0) if len(chunks) > 1 else chunks[0]
        samples = np.asarray(audio, dtype=np.float32).reshape(-1)
        if samples.size == 0:
            raise RuntimeError("the model produced an empty waveform")

        # 24 kHz mono, 16-bit PCM. Resample only if the model ever changes rate.
        if self.sample_rate != SAMPLE_RATE:
            from mlx_audio.resample import resample_audio_array
            samples = np.asarray(
                resample_audio_array(samples, self.sample_rate, SAMPLE_RATE),
                dtype=np.float32,
            ).reshape(-1)
        peak = float(np.max(np.abs(samples))) if samples.size else 0.0
        if peak > 1.0:
            samples = samples / peak
        pcm = (np.clip(samples, -1.0, 1.0) * 32767.0).astype(np.int16)

        out_path = Path(out_path)
        out_path.parent.mkdir(parents=True, exist_ok=True)
        tmp = out_path.with_name(out_path.name + ".part")
        wavfile.write(str(tmp), SAMPLE_RATE, pcm)
        os.replace(tmp, out_path)

        seconds = pcm.size / SAMPLE_RATE
        elapsed = time.time() - t0
        log(f"rendered {seconds:.1f}s of audio in {elapsed:.1f}s "
            f"({seconds / elapsed if elapsed else 0:.2f}x realtime) -> {out_path}")
        return out_path


def get_renderer(model_id=DEFAULT_MODEL):
    global RENDERER
    if RENDERER is None or RENDERER.model_id != model_id:
        RENDERER = Renderer(model_id)
    return RENDERER


def read_text_file(path):
    return Path(path).read_text(encoding="utf-8").strip()


def main(argv=None):
    p = argparse.ArgumentParser(description="Render a line in Gary's voice to WAV.")
    src = p.add_mutually_exclusive_group(required=True)
    src.add_argument("--text", help="the text to speak")
    src.add_argument("--text-file", help="a UTF-8 file holding the text to speak")
    p.add_argument("--out", required=True, help="output WAV path (24 kHz mono)")
    p.add_argument("--voice", default=str(DEFAULT_VOICE),
                   help="file holding the voice design instruction (default: voice.txt)")
    p.add_argument("--seed", type=int, default=None, help="sampling seed for a repeatable take")
    p.add_argument("--model", default=DEFAULT_MODEL, help="Hugging Face model id (VoiceDesign)")
    p.add_argument("--temperature", type=float, default=0.9)
    p.add_argument("--top-k", type=int, default=50)
    p.add_argument("--top-p", type=float, default=1.0)
    p.add_argument("--repetition-penalty", type=float, default=1.05)
    p.add_argument("--max-tokens", type=int, default=4096,
                   help="cap on speech tokens (12.5 per second of audio)")
    args = p.parse_args(argv)

    text = (args.text if args.text is not None else read_text_file(args.text_file)).strip()
    if not text:
        fail("no text to speak")
    try:
        instruct = read_text_file(args.voice)
    except OSError as e:
        fail(f"cannot read voice instruction {args.voice}: {e}")
    if not instruct:
        fail(f"voice instruction {args.voice} is empty")
    if not args.out.lower().endswith(".wav"):
        fail("--out must end in .wav")

    try:
        renderer = get_renderer(args.model)
        renderer.render(
            text, instruct, args.out, seed=args.seed,
            temperature=args.temperature, top_k=args.top_k, top_p=args.top_p,
            repetition_penalty=args.repetition_penalty, max_tokens=args.max_tokens,
        )
    except KeyboardInterrupt:
        fail("interrupted", 130)
    except Exception as e:  # one line on stderr, non-zero exit
        fail(f"{type(e).__name__}: {e}")

    out = Path(args.out)
    if not out.is_file() or out.stat().st_size <= 44:
        fail(f"no WAV written at {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
