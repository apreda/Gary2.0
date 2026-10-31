import os, sys, time, json
os.environ.setdefault("TRANSFORMERS_VERBOSITY", "error"); os.environ.setdefault("TQDM_DISABLE", "1")
import mlx.core as mx, numpy as np, soundfile as sf
from mlx_audio.tts.utils import load_model
OUT = "/Volumes/KINGSTON/ml/out/garyvoice"
TEXT = ("Alright, here's the deal. Charlotte beat these guys by seven on Monday, and now Washington's laying a point and a half at home? "
        "I don't buy it. The Hornets owned the glass. Twenty offensive boards. So I'm taking the points, small stake. "
        "Now, if Schroder sits, I'm off it. Simple as that. You win some, you lose some. But you don't chase. Not ever.")
VOICES = {
 "coach": "A man in his sixties with a deep, gravelly baritone, roughened by decades of cigars. Big-chested and gruff, but warm underneath. A slight East Coast edge in his vowels. He talks at an easy, unhurried pace, plain and direct, with dry humor and total confidence, like an old-school bettor holding court at his corner table. Conversational and close to the microphone, never shouting, never selling.",
 "jersey": "An older man, low and gravelly, a voice worn down by years of cigars. Dry, unhurried, sure of himself. He speaks in short, clipped sentences with a slight New Jersey edge and lets the pauses do the work. Confident and calm, never shouting, never selling. Sounds like the sharpest friend at the bar explaining a bet he already made.",
 "gravel": "An older man with a deep, heavily gravelled voice, rough and hoarse from decades of cigars, almost a rasp. A noticeable East Coast accent. Dry and unhurried, short clipped sentences, a little amused. Quiet confidence with no volume behind it. Never shouts, never rushes, sounds like he has seen every line before.",
 "warm": "A big, stocky man around sixty with a deep, warm, smoky voice and a light gravel texture from cigars. A trace of a Chicago and East Coast accent. Friendly and easygoing, with a low chuckle in his voice, speaking at a relaxed conversational pace like he is talking to a buddy across the table. Confident, plainspoken, never loud.",
}
seeds = [int(s) for s in sys.argv[1:]] or [7, 21]
t0 = time.time(); model = load_model("mlx-community/Qwen3-TTS-12Hz-1.7B-VoiceDesign-bf16"); print("loaded", round(time.time()-t0,1), flush=True)
sr = int(getattr(model, "sample_rate", 24000))
for name, instr in VOICES.items():
    for seed in seeds:
        mx.random.seed(seed); t = time.time()
        chunks = [r.audio for r in model.generate_voice_design(text=TEXT, instruct=instr, language="English", temperature=0.9, top_k=50, top_p=1.0, repetition_penalty=1.05, max_tokens=2048, verbose=False)]
        a = np.asarray(mx.concatenate(chunks, axis=0) if len(chunks) > 1 else chunks[0], dtype=np.float32).reshape(-1)
        a = a / max(1.0, float(np.max(np.abs(a))))
        path = f"{OUT}/{name}-{seed}.wav"; sf.write(path, a, sr)
        print(name, seed, f"{len(a)/sr:.1f}s in {time.time()-t:.1f}s", flush=True)
