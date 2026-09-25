"""The reel's score, written to the edit in timeline.json.

Every sound is synthesized here (no samples, nothing to license). The grid is
120 BPM; the footage events (rattle, rip, land, stamp, each pack opening) sit
on it because the edit was timed to the beat. Writes public/score.wav.
"""
import json
import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
T = json.load(open("timeline.json"))
BEAT = 60 / T["bpm"]
DUR = T["durationSeconds"]
N = int(DUR * SR)
rng = np.random.default_rng(7)

L = np.zeros(N)
R = np.zeros(N)
send = np.zeros(N)          # reverb send (mono)


def b(beat):
    return beat * BEAT


def place(buf, start_s, x, gain=1.0):
    i = int(round(start_s * SR))
    if i >= N:
        return
    j = min(N, i + len(x))
    buf[i:j] += gain * x[: j - i]


def add(start_s, x, gain=1.0, pan=0.0, verb=0.0):
    place(L, start_s, x, gain * np.sqrt(0.5 * (1 - pan)))
    place(R, start_s, x, gain * np.sqrt(0.5 * (1 + pan)))
    if verb:
        place(send, start_s, x, gain * verb)


def t_(sec):
    return np.arange(int(sec * SR)) / SR


def bp(x, lo, hi, order=2):
    sos = signal.butter(order, [lo, hi], "bandpass", fs=SR, output="sos")
    return signal.sosfilt(sos, x)


def lp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "lowpass", fs=SR, output="sos"), x)


def hp(x, f, order=2):
    return signal.sosfilt(signal.butter(order, f, "highpass", fs=SR, output="sos"), x)


def noise(sec):
    return rng.standard_normal(int(sec * SR))


# ---------------------------------------------------------------- instruments

def kick(gain=1.0):
    t = t_(0.5)
    f = 46 + 110 * np.exp(-t / 0.035)
    ph = 2 * np.pi * np.cumsum(f) / SR
    body = np.sin(ph) * np.exp(-t / 0.28)
    click = hp(noise(0.5), 2500) * np.exp(-t / 0.004) * 0.35
    return np.tanh(1.6 * (body + click)) * gain


def clap():
    t = t_(0.4)
    env = np.zeros_like(t)
    for k, d in enumerate([0, 0.011, 0.022]):
        env += (t >= d) * np.exp(-np.clip(t - d, 0, None) / (0.012 if k < 2 else 0.13))
    return bp(noise(0.4), 900, 3200) * env * 0.9


def hat(open_=False):
    t = t_(0.3)
    return hp(noise(0.3), 7000) * np.exp(-t / (0.12 if open_ else 0.028)) * 0.45


def saw(freq, sec, detune=0.0):
    t = t_(sec)
    ph = (freq * (1 + detune)) * t
    return 2 * (ph - np.floor(ph + 0.5))


def bass_note(freq, sec):
    t = t_(sec)
    x = saw(freq, sec) + 0.6 * np.sin(2 * np.pi * freq / 2 * t)
    x = lp(x, 260)
    env = np.minimum(1, t / 0.005) * np.exp(-t / (sec * 0.9))
    return np.tanh(1.8 * x * env) * 0.55


def pad_chord(freqs, sec, cutoff=1400):
    t = t_(sec)
    x = np.zeros_like(t)
    for f in freqs:
        for d in (-0.004, 0.0, 0.005):
            x += saw(f, sec, d)
    x = lp(x / (3 * len(freqs)), cutoff)
    env = np.minimum(1, t / 0.25) * np.minimum(1, (sec - t) / 0.3)
    return x * env * 0.5


def pluck(freq, gain=1.0):
    t = t_(0.9)
    x = (np.sin(2 * np.pi * freq * t) + 0.35 * np.sin(4 * np.pi * freq * t) + 0.12 * np.sin(6 * np.pi * freq * t))
    x *= np.exp(-t / 0.22) * np.minimum(1, t / 0.002)
    return x * 0.42 * gain


def thud():
    t = t_(0.35)
    f = 58 + 60 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.09)
    return (body + lp(noise(0.35), 600) * np.exp(-t / 0.03) * 0.3) * 0.7


def impact(sec=2.2, size=1.0):
    t = t_(sec)
    f = 32 + 85 * np.exp(-t / 0.18)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    crash = lp(noise(sec), 5200) * np.exp(-t / 0.55) * 0.35
    crack = bp(noise(sec), 1200, 5000) * np.exp(-t / 0.02) * 0.6
    return np.tanh(1.4 * (sub + crash + crack)) * size


def riser(sec):
    t = t_(sec)
    n = noise(sec)
    out = np.zeros_like(t)
    blocks = 40
    for k in range(blocks):
        a, z = k * len(t) // blocks, (k + 1) * len(t) // blocks
        fc = 300 * (20 ** (k / blocks))
        out[a:z] = bp(n, fc * 0.7, min(fc * 1.4, SR / 2 - 100))[a:z]
    tone = np.sin(2 * np.pi * np.cumsum(180 * (4 ** (t / sec))) / SR) * 0.25
    return (out + tone) * (t / sec) ** 2.2 * 0.8


def reverse_swell(sec):
    x = impact(sec, 0.8)[::-1]
    t = t_(sec)
    return x * (t / sec) ** 1.5


def rip():
    t = t_(0.42)
    n = noise(0.42)
    out = np.zeros_like(t)
    for k in range(12):
        a, z = k * len(t) // 12, (k + 1) * len(t) // 12
        fc = 6000 * (0.3 ** (k / 12))
        out[a:z] = bp(n, fc * 0.6, fc * 1.5)[a:z]
    crackle = (rng.random(len(t)) > 0.985) * rng.standard_normal(len(t)) * 1.2
    return (out * 1.3 + hp(crackle, 2000)) * np.exp(-t / 0.2) * 0.9


def crinkle():
    t = t_(0.05)
    return bp(noise(0.05), 2500, 7000) * np.exp(-t / 0.012) * 0.5


def flap():
    t = t_(0.03)
    return bp(noise(0.03), 1500, 5000) * np.exp(-t / 0.004) * 0.5


def chalk(sec=0.55):
    """A circle drawn in chalk: grainy scratch that swells and trails off,
    two strokes as the hand comes round past where it began."""
    t = t_(sec)
    grain = bp(noise(sec), 1800, 6500) * (0.55 + 0.45 * np.abs(np.sin(2 * np.pi * 23 * t + 3 * np.sin(2 * np.pi * 5 * t))))
    stroke = np.sin(np.pi * np.clip(t / (sec * 0.8), 0, 1)) ** 0.7 + 0.5 * np.exp(-((t - sec * 0.85) / 0.04) ** 2)
    ticks = hp((rng.random(len(t)) > 0.992) * rng.standard_normal(len(t)), 3000) * 0.8
    return (grain * stroke + ticks * stroke) * 0.38


def whoosh(sec=0.45):
    t = t_(sec)
    env = np.sin(np.pi * t / sec) ** 2
    return bp(noise(sec), 500, 3500) * env * 0.5


# ---------------------------------------------------------------- arrangement

HZ = {"D1": 36.71, "Bb0": 29.14, "F1": 43.65, "C1": 32.70, "A0": 27.50,
      "D2": 73.42, "Bb1": 58.27, "F2": 87.31, "C2": 65.41, "A1": 55.0}
CHORDS = {
    "Dm": ("D2", [293.66, 349.23, 440.00], [587.33, 698.46, 880.00]),
    "Bb": ("Bb1", [233.08, 293.66, 349.23], [466.16, 587.33, 698.46]),
    "F": ("F2", [261.63, 349.23, 440.00], [523.25, 698.46, 880.00]),
    "C": ("C2", [261.63, 329.63, 392.00], [523.25, 659.25, 783.99]),
    "A": ("A1", [277.18, 329.63, 440.00], [554.37, 659.25, 880.00]),
}
# one chord per bar of four beats; None is the bumper's hole
BARS = [(0, "Dm"), (4, "Bb"), (8, "Dm"), (12, "Bb"), (16, "F"), (20, "C"), (24, "A"),
        (30, "Dm"), (34, "Bb"), (38, "Bb"), (42, "F")]


def chord_at(beat):
    name = None
    for start, c in BARS:
        if beat >= start:
            name = c
    return name


bass_bus = np.zeros(N)
pad_bus = np.zeros(N)

# pad under everything but the bumper
for i, (start, name) in enumerate(BARS):
    end = BARS[i + 1][0] if i + 1 < len(BARS) else 47
    if start == 24:
        end = 28
    root, mids, _ = CHORDS[name]
    sec = b(end - start)
    cutoff = 900 if start < 8 else 1600
    place(pad_bus, b(start), pad_chord(mids, sec + 0.3, cutoff), 0.9)

# ---- hook (B0-B2): two slams with the headline
add(b(0), impact(2.0, 0.9), verb=0.25)
add(b(1), impact(1.2, 0.6), verb=0.25)

# ---- unveil A (B2-B8): ticking tension, the rattle, the rip, a riser into the land
for k in range(2 * 4, 8 * 4):                # 16ths from B2 to B8
    add(b(k / 4), hat(), 0.35 + 0.25 * (k % 2 == 0), pan=0.3 if k % 2 else -0.3)
for k in range(2, 8):
    add(b(k), kick(0.55))
    place(bass_bus, b(k), bass_note(HZ["D2"] if k < 4 else HZ["Bb1"], BEAT * 0.9), 0.8)
r0, r1 = T["events"]["rattle"]
x = r0
while x < r1:
    add(x, crinkle(), 0.9 + 0.3 * rng.random(), pan=rng.uniform(-0.4, 0.4))
    x += 1 / 16.3
add(T["events"]["rip"], rip(), 1.1, verb=0.3)
add(T["events"]["rise"] - 0.1, whoosh(0.6), 0.9)
add(b(5), riser(b(8) - b(5)), 0.9)

# ---- the land (B8): the drop
add(b(8), impact(2.4, 1.15), verb=0.35)
c0, c1 = T["events"]["clatter"]
x = c0 + 0.05
step = 0.035
while x < c1:
    add(x, flap(), 0.8, pan=rng.uniform(-0.5, 0.5))
    x += step
    step *= 1.06
add(T["events"]["stamp"], impact(1.0, 0.7), verb=0.3)
add(T["events"]["park"] - 0.1, whoosh(0.4), 0.6)
for at in T["events"]["chalk"]:
    add(at, chalk(), 1.0, pan=rng.uniform(-0.25, 0.25), verb=0.12)
add(T["events"]["sign"], chalk(0.35), 0.6, pan=0.2)
add(b(20), riser(b(22) - b(20)), 0.55)
add(b(21.5), whoosh(0.5), 0.8)


def groove(start, end, halftime=False):
    for k in range(int(start * 4), int(end * 4)):
        beat = k / 4
        sixteenth = k % 4
        if sixteenth == 0:
            if not halftime or int(beat) % 2 == 0:
                add(b(beat), kick(1.0))
            if int(beat) % 2 == 1:
                add(b(beat), clap(), 0.8, verb=0.35)
        if sixteenth == 2:
            add(b(beat), hat(open_=int(beat) % 4 == 3), 0.8, pan=0.25)
        elif sixteenth in (1, 3):
            add(b(beat), hat(), 0.4, pan=-0.25)
        if sixteenth in (0, 2) and not halftime:
            name = chord_at(beat)
            place(bass_bus, b(beat), bass_note(HZ[CHORDS[name][0]], BEAT * 0.45), 1.0)
        if halftime and sixteenth == 0:
            name = chord_at(beat)
            place(bass_bus, b(beat), bass_note(HZ[CHORDS[name][0]], BEAT * 0.9), 1.0)


groove(8, 14)
groove(14, 22, halftime=True)   # the scorebook: room for the chalk
groove(22, 28)

# ---- REVEAL ALL: four packs, each on its beat; a win climbs, a loss thuds
wins = 0
for i, res in enumerate(T["reveal"]["results"]):
    beat = T["reveal"]["from"] + 1 + i
    if res == "W":
        tones = CHORDS[chord_at(beat)][2]
        f = tones[wins % 3] * (2 ** (wins // 3 * 0.0))
        add(b(beat), pluck(f, 1.0 + 0.04 * wins), pan=0.15, verb=0.35)
        add(b(beat) + 0.002, pluck(f * 2, 0.35), pan=-0.15, verb=0.35)
        wins += 1
    else:
        add(b(beat), thud(), 1.0)
    add(b(beat) - 0.09, whoosh(0.18), 0.35)

# ---- bumper (B28-B30): the floor drops out, a swell back in
add(b(28), impact(1.6, 0.3), verb=0.6)
add(b(28.5), reverse_swell(b(30) - b(28.5)), 0.9)

# ---- recap (B30-B38): the morning after
add(b(30), impact(2.2, 1.1), verb=0.35)
add(b(31), impact(1.2, 0.75), verb=0.3)
groove(30, 38, halftime=True)

# ---- end card (B38-B47)
add(b(38), impact(3.0, 1.0), verb=0.5)
groove(38, 45, halftime=True)
for k, f in enumerate([698.46, 880.00, 1046.50, 1396.91]):
    add(b(38) + 0.08 * k, pluck(f, 0.9), pan=(-0.3 + 0.2 * k), verb=0.5)

# ---------------------------------------------------------------- mix

# sidechain: pad and bass duck under every kick
duck = np.ones(N)
for k in range(int(8 * 1), int(45)):
    i0 = int(b(k) * SR)
    tail = np.arange(int(0.25 * SR)) / SR
    seg = 1 - 0.55 * np.exp(-tail / 0.09)
    j = min(N, i0 + len(seg))
    duck[i0:j] = np.minimum(duck[i0:j], seg[: j - i0])
add(0, pad_bus * duck, 0.55, verb=0.2)
add(0, bass_bus * duck, 0.9)

# reverb: decorrelated exponential-noise impulse
ir_t = t_(2.2)
irL = lp(noise(2.2), 6000) * np.exp(-ir_t / 0.55)
irR = lp(noise(2.2), 6000) * np.exp(-ir_t / 0.55)
wetL = signal.fftconvolve(send, irL)[:N] * 0.02
wetR = signal.fftconvolve(send, irR)[:N] * 0.02
L += wetL
R += wetR

mix = np.stack([L, R], axis=1)
mix = hp(mix.T, 25).T
peak = np.max(np.abs(mix))
mix = np.tanh(1.25 * mix / peak) / np.tanh(1.25)
fade = np.ones(N)
fade[-int(0.35 * SR):] = np.linspace(1, 0, int(0.35 * SR))
mix *= fade[:, None] * 0.89
wavfile.write("public/score.wav", SR, (mix * 32767).astype(np.int16))
print("score.wav", mix.shape[0] / SR, "s, peak", np.max(np.abs(mix)))

# ---------------------------------------------------------------- 3D intro
# Two seconds ahead of the reel for the Blender version: the phone drifts and
# turns under a filtered pulse, then the push into the screen rides a riser
# that lands on the reel's first slam (B0 of score.wav).
IN = int(T["intro3d"]["seconds"] * SR)
iL, iR = np.zeros(IN), np.zeros(IN)


def iadd(start_s, x, gain=1.0, pan=0.0):
    i = int(round(start_s * SR))
    j = min(IN, i + len(x))
    if i >= IN:
        return
    iL[i:j] += x[: j - i] * gain * np.sqrt(0.5 * (1 - pan))
    iR[i:j] += x[: j - i] * gain * np.sqrt(0.5 * (1 + pan))


iadd(0, lp(pad_chord(CHORDS["Dm"][1], 2.0, 700), 900), 0.9)
for k in range(4):
    iadd(k * BEAT, lp(kick(0.6 + 0.1 * k), 180), 1.0)
iadd(0.05, whoosh(1.2), 0.55, pan=0.4)
iadd(0.55, lp(noise(0.4), 5000) * np.exp(-t_(0.4) / 0.12) * 0.08, 1.0, pan=-0.3)   # the glint off the titanium
iadd(1.0, riser(1.0), 0.8)
iadd(1.15, whoosh(0.85), 1.0)
intro = np.stack([iL, iR], axis=1)
intro = hp(intro.T, 25).T
intro = np.tanh(1.25 * intro / peak) / np.tanh(1.25) * 0.89
fin = np.minimum(1, np.arange(IN) / (0.08 * SR))
wavfile.write("public/intro.wav", SR, (intro * fin[:, None] * 32767).astype(np.int16))
print("intro.wav", IN / SR, "s")

# ---------------------------------------------------------------- cover
# Under the poster frame the organic cuts open on: a low swell, a quiet
# chime, air into the film's first hit.
CN = SR
cL, cR = np.zeros(CN), np.zeros(CN)


def cadd(start_s, x, gain=1.0, pan=0.0):
    i = int(round(start_s * SR))
    j = min(CN, i + len(x))
    if i >= CN:
        return
    cL[i:j] += x[: j - i] * gain * np.sqrt(0.5 * (1 - pan))
    cR[i:j] += x[: j - i] * gain * np.sqrt(0.5 * (1 + pan))


# soft: a low swell under the poster, a quiet chime, air into the film
tt = t_(1.0)
cadd(0, np.sin(2 * np.pi * 52 * tt) * np.minimum(1, tt / 0.05) * np.exp(-tt / 0.5) * 0.5)
cadd(0, lp(noise(1.0), 900) * np.minimum(1, tt / 0.1) * np.exp(-tt / 0.35) * 0.12)
for k, f in enumerate((698.46, 880.0, 1046.5)):
    cadd(0.03 + 0.05 * k, pluck(f, 0.45), pan=-0.25 + 0.25 * k)
cadd(0.35, whoosh(0.3), 0.45)
cover = hp(np.stack([cL, cR]), 25).T
cover = np.tanh(1.25 * cover / peak) / np.tanh(1.25) * 0.89
wavfile.write("public/cover.wav", SR, (cover * 32767).astype(np.int16))
print("cover.wav 1.0 s")
