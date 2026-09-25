"""The Darts reel's score, written to timeline.json. Every sound is made here
(no samples). 120 BPM; each dart that lands in the picture lands on the beat.
Writes public/score.wav."""
import json

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
T = json.load(open("timeline.json"))
BEAT = 60 / T["bpm"]
N = int(T["durationSeconds"] * SR)
rng = np.random.default_rng(24)
L, R, send = np.zeros(N), np.zeros(N), np.zeros(N)


def b(beat):
    return beat * BEAT


def t_(sec):
    return np.arange(int(sec * SR)) / SR


def noise(sec):
    return rng.standard_normal(int(sec * SR))


def sos(kind, f, order=2):
    return signal.butter(order, f, kind, fs=SR, output="sos")


def bp(x, lo, hi):
    return signal.sosfilt(sos("bandpass", [lo, hi]), x)


def lp(x, f):
    return signal.sosfilt(sos("lowpass", f), x)


def hp(x, f):
    return signal.sosfilt(sos("highpass", f), x)


def place(buf, s, x, g):
    i = int(round(s * SR))
    if i >= N or i + len(x) <= 0:
        return
    a = max(0, -i)
    j = min(N, i + len(x))
    buf[max(i, 0):j] += g * x[a: j - i]


def add(s, x, g=1.0, pan=0.0, verb=0.0):
    place(L, s, x, g * np.sqrt(0.5 * (1 - pan)))
    place(R, s, x, g * np.sqrt(0.5 * (1 + pan)))
    if verb:
        place(send, s, x, g * verb)


# ---------------------------------------------------------------- sounds
def kick(g=1.0):
    t = t_(0.45)
    f = 44 + 120 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.26)
    click = hp(noise(0.45), 2500) * np.exp(-t / 0.004) * 0.3
    return np.tanh(1.7 * (body + click)) * g


def clap():
    t = t_(0.4)
    env = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) / (0.012 if k < 2 else 0.14)) for k, d in enumerate((0, 0.011, 0.023)))
    return bp(noise(0.4), 900, 3400) * env * 0.9


def hat(open_=False):
    t = t_(0.3)
    return hp(noise(0.3), 7200) * np.exp(-t / (0.11 if open_ else 0.025)) * 0.42


def impact(sec=2.2, size=1.0):
    t = t_(sec)
    f = 30 + 90 * np.exp(-t / 0.17)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.85)
    crash = lp(noise(sec), 5200) * np.exp(-t / 0.5) * 0.32
    crack = bp(noise(sec), 1200, 5200) * np.exp(-t / 0.02) * 0.6
    return np.tanh(1.4 * (sub + crash + crack)) * size


def clank(sec=1.2):
    """Lights on: a struck metal plate."""
    t = t_(sec)
    x = sum(a * np.sin(2 * np.pi * f * t) * np.exp(-t / d) for f, a, d in ((212, 0.5, 0.5), (597, 0.35, 0.35), (1131, 0.25, 0.25), (1874, 0.18, 0.18), (2741, 0.1, 0.1)))
    return (x + bp(noise(sec), 2000, 7000) * np.exp(-t / 0.015) * 0.5) * 0.6


def flutter(sec=0.2):
    t = t_(sec)
    return bp(noise(sec), 700, 4200) * (t / sec) ** 2 * (0.6 + 0.4 * np.sin(2 * np.pi * 38 * t)) * 0.5


def thunk(g=1.0):
    """A dart into sisal: a woody thock, a steel tick, the shaft shivering."""
    t = t_(0.5)
    f = 118 + 90 * np.exp(-t / 0.012)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.055)
    fiber = bp(noise(0.5), 700, 3200) * np.exp(-t / 0.018) * 0.9
    tick = sum(np.sin(2 * np.pi * f_ * t) * np.exp(-t / 0.09) for f_ in (2930, 4170)) * 0.07
    shiver = np.sin(2 * np.pi * 180 * t) * (0.5 + 0.5 * np.sin(2 * np.pi * 26 * t)) * np.exp(-t / 0.12) * 0.12
    return np.tanh(1.8 * (body * 0.9 + fiber + tick + shiver)) * g


def whoosh(sec=0.45):
    t = t_(sec)
    return bp(noise(sec), 500, 3600) * np.sin(np.pi * t / sec) ** 2 * 0.5


def riser(sec):
    t = t_(sec)
    n = noise(sec)
    out = np.zeros_like(t)
    for k in range(40):
        a, z = k * len(t) // 40, (k + 1) * len(t) // 40
        fc = 300 * (20 ** (k / 40))
        out[a:z] = bp(n, fc * 0.7, min(fc * 1.4, SR / 2 - 100))[a:z]
    tone = np.sin(2 * np.pi * np.cumsum(170 * (4 ** (t / sec))) / SR) * 0.22
    return (out + tone) * (t / sec) ** 2.2 * 0.8


def saw(f, sec, det=0.0):
    t = t_(sec)
    ph = f * (1 + det) * t
    return 2 * (ph - np.floor(ph + 0.5))


def bass(f, sec):
    t = t_(sec)
    x = lp(saw(f, sec) + 0.6 * np.sin(np.pi * f * t), 240)
    return np.tanh(1.8 * x * np.minimum(1, t / 0.005) * np.exp(-t / (sec * 0.9))) * 0.55


def pad(freqs, sec, cutoff=1400):
    t = t_(sec)
    x = sum(saw(f, sec, d) for f in freqs for d in (-0.004, 0, 0.005))
    x = lp(x / (3 * len(freqs)), cutoff)
    return x * np.minimum(1, t / 0.25) * np.minimum(1, (sec - t) / 0.3) * 0.5


def pluck(f, g=1.0):
    t = t_(0.9)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(4 * np.pi * f * t) + 0.1 * np.sin(6 * np.pi * f * t)
    return x * np.exp(-t / 0.22) * np.minimum(1, t / 0.002) * 0.42 * g


def sparkle(sec=0.8):
    t = t_(sec)
    x = np.zeros_like(t)
    for k, f in enumerate((1760, 2093, 2637, 3136, 3520)):
        s0 = k * 0.06
        tt = np.clip(t - s0, 0, None)
        x += (t >= s0) * np.sin(2 * np.pi * f * tt) * np.exp(-tt / 0.25) * 0.12
    return x


# ---------------------------------------------------------------- arrangement
CH = {"Dm": (73.42, [293.66, 349.23, 440.0], [587.33, 698.46, 880.0]),
      "Bb": (58.27, [233.08, 293.66, 349.23], [466.16, 587.33, 698.46]),
      "F": (87.31, [261.63, 349.23, 440.0], [523.25, 698.46, 880.0]),
      "C": (65.41, [261.63, 329.63, 392.0], [523.25, 659.25, 783.99]),
      "Gm": (98.0, [293.66, 392.0, 466.16], [587.33, 783.99, 932.33])}
BARS = [(0, "Dm"), (4, "Bb"), (8, "Dm"), (10, "Dm"), (14, "Bb"), (18, "F"), (22, "Gm"), (26, "Bb"), (30, "F")]


def chord(beat):
    name = "Dm"
    for s, c in BARS:
        if beat >= s:
            name = c
    return name


bass_bus, pad_bus = np.zeros(N), np.zeros(N)
for i, (s, c) in enumerate(BARS):
    e = BARS[i + 1][0] if i + 1 < len(BARS) else 36
    place(pad_bus, b(s), pad(CH[c][1], b(e - s) + 0.3, 900 if s < 10 else 1500), 0.9)


def groove(start, end, half=False, hats=True):
    for k in range(int(start * 4), int(end * 4)):
        beat, six = k / 4, k % 4
        if six == 0 and (not half or int(beat) % 2 == 0):
            add(b(beat), kick())
        if six == 0 and int(beat) % 2 == 1:
            add(b(beat), clap(), 0.8, verb=0.3)
        if hats and six == 2:
            add(b(beat), hat(int(beat) % 4 == 3), 0.8, pan=0.25)
        elif hats and six in (1, 3):
            add(b(beat), hat(), 0.38, pan=-0.25)
        if six in (0, 2) and not half:
            place(bass_bus, b(beat), bass(CH[chord(beat)][0], BEAT * 0.45), 1.0)
        if half and six == 0:
            place(bass_bus, b(beat), bass(CH[chord(beat)][0], BEAT * 0.9), 1.0)


# the open: lights on, three darts, the drop onto the phone, the push in
add(b(0), impact(2.0, 0.85), verb=0.3)
add(b(0), clank(), 0.9, verb=0.5)
for k in range(0, 16):
    add(b(k / 2), hat(), 0.3, pan=0.3 if k % 2 else -0.3)
for k in range(0, 4):
    place(bass_bus, b(k), bass(CH["Dm"][0], BEAT * 0.9), 0.7)
for land in T["open3d"]["lands"]:
    add(b(land) - 0.2, flutter(), 0.9, pan=0.3)
    add(b(land), thunk(1.1), pan=-0.1 + 0.1 * land, verb=0.25)
add(b(4), impact(1.4, 0.6), verb=0.3)
for k in range(4, 10):
    add(b(k), kick(0.5 + 0.08 * (k - 4)))
add(b(4.2), whoosh(1.2), 0.7)
add(b(6.5), sparkle(), 0.9, verb=0.4)
add(b(7), riser(b(10) - b(7)), 0.9)
add(b(8.6), whoosh(0.7), 0.9)

# Thursday Night Football: the drop, a hit on every cut, the number
add(b(10), impact(2.2, 1.1), verb=0.35)
groove(10, 18)
for c in T["tnf"]["cuts"][1:]:
    add(b(c["beat"]) - 0.06, whoosh(0.16), 0.5)
add(b(16), impact(1.4, 0.9), verb=0.35)
for k, f in enumerate(CH["Dm"][2]):
    add(b(16) + 0.03 * k, pluck(f, 0.8), pan=-0.2 + 0.2 * k, verb=0.4)

# tonight's home runs: the board resets, five darts on straight eighths
add(b(18) - 0.1, whoosh(0.3), 0.8)
groove(18, 22, half=True)
for k, beat in enumerate(T["hr"]["darts"]):
    add(b(beat) - 0.12, flutter(0.14), 0.7, pan=0.3)
    add(b(beat), thunk(1.0), pan=0.3 - 0.15 * k, verb=0.2)
    add(b(beat) + 0.01, pluck(CH["F"][2][k % 3] * (2 if k >= 3 else 1), 0.75), pan=-0.2, verb=0.35)

# Sunday: the floor drops, a slow build into the card
add(b(22), impact(1.6, 0.45), verb=0.6)
groove(22, 26, half=True, hats=False)
add(b(23), riser(b(26) - b(23)), 0.7)

# the card
add(b(26), impact(3.0, 1.05), verb=0.5)
add(b(26), clank(), 0.5, verb=0.6)
groove(26, 34, half=True)
for k, f in enumerate((698.46, 880.0, 1046.5, 1396.91)):
    add(b(26) + 0.08 * k, pluck(f, 0.9), pan=-0.3 + 0.2 * k, verb=0.5)

# ---------------------------------------------------------------- mix
duck = np.ones(N)
for k in range(0, 36):
    i0 = int(b(k) * SR)
    seg = 1 - 0.55 * np.exp(-np.arange(int(0.25 * SR)) / SR / 0.09)
    j = min(N, i0 + len(seg))
    duck[i0:j] = np.minimum(duck[i0:j], seg[: j - i0])
add(0, pad_bus * duck, 0.55, verb=0.2)
add(0, bass_bus * duck, 0.9)
ir_t = t_(2.2)
for buf in (L, R):
    ir = lp(noise(2.2), 6000) * np.exp(-ir_t / 0.55)
    buf += signal.fftconvolve(send, ir)[:N] * 0.02
mix = hp(np.stack([L, R]), 25).T
peak = np.max(np.abs(mix))
mix = np.tanh(1.6 * mix / peak) / np.tanh(1.6)
fade = np.ones(N)
fade[-int(0.4 * SR):] = np.linspace(1, 0, int(0.4 * SR))
mix *= fade[:, None] * 0.93
wavfile.write("public/score.wav", SR, (mix * 32767).astype(np.int16))
print("score.wav", N / SR, "s")

# ---------------------------------------------------------------- cover
# Under the poster frame: a low swell, one quiet dart, a chime, air into the film.
CN = SR
cL, cR = np.zeros(CN), np.zeros(CN)


def cadd(s, x, g=1.0, pan=0.0):
    i = int(round(s * SR))
    j = min(CN, i + len(x))
    if i < CN:
        cL[i:j] += x[: j - i] * g * np.sqrt(0.5 * (1 - pan))
        cR[i:j] += x[: j - i] * g * np.sqrt(0.5 * (1 + pan))


# soft: a low swell under the poster, one quiet dart, a chime, air into the film
tt = t_(1.0)
cadd(0, np.sin(2 * np.pi * 52 * tt) * np.minimum(1, tt / 0.05) * np.exp(-tt / 0.5) * 0.5)
cadd(0, lp(thunk(0.8), 2500), 0.55)
for k, f in enumerate((698.46, 880.0, 1046.5)):
    cadd(0.04 + 0.05 * k, pluck(f, 0.4), pan=-0.25 + 0.25 * k)
cadd(0.35, whoosh(0.3), 0.45)
cover = hp(np.stack([cL, cR]), 25).T
cover = np.tanh(1.6 * cover / peak) / np.tanh(1.6) * 0.93
wavfile.write("public/cover.wav", SR, (cover * 32767).astype(np.int16))
print("cover.wav 1.0 s")
