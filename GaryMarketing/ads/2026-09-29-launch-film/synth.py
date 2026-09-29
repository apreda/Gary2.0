"""The launch film's score. Every sound is made here (no samples), 120 BPM, cut
to timeline.json: a quiet open on the mark, a steady pulse under the tour, a
lift on every new section, a resolve on the end card. Writes public/score.wav."""
import json

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
T = json.load(open("timeline.json"))
BEAT = 60 / T["bpm"]
N = int(T["durationSeconds"] * SR)
rng = np.random.default_rng(29)
L, R, send = np.zeros(N), np.zeros(N), np.zeros(N)


def b(beat): return beat * BEAT
def t_(sec): return np.arange(int(sec * SR)) / SR
def noise(sec): return rng.standard_normal(int(sec * SR))
def sos(kind, f, order=2): return signal.butter(order, f, kind, fs=SR, output="sos")
def bp(x, lo, hi): return signal.sosfilt(sos("bandpass", [lo, hi]), x)
def lp(x, f): return signal.sosfilt(sos("lowpass", f), x)
def hp(x, f): return signal.sosfilt(sos("highpass", f), x)


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


def kick(g=1.0):
    t = t_(0.45)
    f = 44 + 110 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.24)
    return np.tanh(1.5 * body) * g


def hat(g=1.0):
    t = t_(0.2)
    return hp(noise(0.2), 7500) * np.exp(-t / 0.03) * 0.3 * g


def impact(sec=2.4, size=1.0):
    t = t_(sec)
    f = 30 + 80 * np.exp(-t / 0.2)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.9)
    air = lp(noise(sec), 4200) * np.exp(-t / 0.6) * 0.18
    return np.tanh(1.3 * (sub + air)) * size


def whoosh(sec=0.6):
    t = t_(sec)
    return bp(noise(sec), 400, 3200) * np.sin(np.pi * t / sec) ** 2 * 0.45


def riser(sec):
    t = t_(sec)
    tone = np.sin(2 * np.pi * np.cumsum(220 * (2 ** (t / sec))) / SR) * 0.18
    return (hp(noise(sec), 2000) * 0.25 + tone) * (t / sec) ** 2.4


def saw(f, sec, det=0.0):
    ph = f * (1 + det) * t_(sec)
    return 2 * (ph - np.floor(ph + 0.5))


def pad(freqs, sec, cutoff=1200):
    t = t_(sec)
    x = sum(saw(f, sec, d) for f in freqs for d in (-0.004, 0, 0.005))
    x = lp(x / (3 * len(freqs)), cutoff)
    return x * np.minimum(1, t / 0.6) * np.minimum(1, (sec - t) / 0.6) * 0.5


def bass(f, sec):
    t = t_(sec)
    x = lp(saw(f, sec) + 0.6 * np.sin(np.pi * f * t), 220)
    return np.tanh(1.6 * x * np.minimum(1, t / 0.006) * np.exp(-t / (sec * 0.9))) * 0.5


def pluck(f, g=1.0):
    t = t_(1.2)
    x = np.sin(2 * np.pi * f * t) + 0.3 * np.sin(4 * np.pi * f * t) + 0.08 * np.sin(6 * np.pi * f * t)
    return x * np.exp(-t / 0.35) * np.minimum(1, t / 0.002) * 0.36 * g


def bell(f, g=1.0):
    t = t_(2.5)
    x = sum(a * np.sin(2 * np.pi * f * m * t) * np.exp(-t / d) for m, a, d in ((1, 1, 1.2), (2.76, 0.4, 0.6), (5.4, 0.2, 0.3)))
    return x * 0.22 * g


# D major colour, one chord per section: D, Bm, G, A, D, G, D
CH = {"D": (73.42, [293.66, 369.99, 440.0, 554.37]), "Bm": (61.74, [293.66, 369.99, 493.88]),
      "G": (98.0, [293.66, 392.0, 493.88, 587.33]), "A": (110.0, [329.63, 440.0, 554.37]),
      "Em": (82.41, [329.63, 392.0, 493.88])}
SECTIONS = [("intro", "D"), ("home", "Bm"), ("picks", "G"), ("winners", "A"), ("darts", "Em"), ("billfold", "G"), ("end", "D")]

pad_bus, bass_bus = np.zeros(N), np.zeros(N)
for name, c in SECTIONS:
    s, e = T[name]["from"], T[name]["to"]
    place(pad_bus, b(s), pad(CH[c][1], b(e - s) + 0.6, 900 if name == "intro" else 1400), 1.0)

# the open: a low swell, one bell on the mark, the wordmark
add(0, impact(3.0, 0.55), verb=0.4)
add(b(0.3), bell(587.33, 0.9), verb=0.6)
add(b(1.2), bell(880.0, 0.55), pan=0.2, verb=0.6)
add(b(3), riser(b(6) - b(3)), 0.6)

# the tour: a steady pulse, a lift on every new section
for name, c in SECTIONS[1:-1]:
    s, e = T[name]["from"], T[name]["to"]
    add(b(s) - 0.35, whoosh(0.7), 0.6)
    add(b(s), impact(1.8, 0.7), verb=0.3)
    for k, f in enumerate(CH[c][1][:3]):
        add(b(s) + 0.05 * k, pluck(f * 2, 0.7), pan=-0.25 + 0.25 * k, verb=0.45)
    for beat in range(int(s), int(e)):
        add(b(beat), kick(0.75 if beat % 2 == 0 else 0.45))
        add(b(beat + 0.5), hat(0.8), pan=0.2)
        place(bass_bus, b(beat), bass(CH[c][0], BEAT * 0.85), 1.0)
add(b(T["picks"]["flipAt"]), whoosh(0.35), 0.5, pan=-0.2)
add(b(T["billfold"]["cardAt"]), bell(1174.66, 0.5), pan=0.2, verb=0.5)

# the close: the floor drops, the mark returns, a resolve
e0 = T["end"]["from"]
add(b(e0) - 0.4, whoosh(0.8), 0.7)
add(b(e0), impact(3.2, 0.95), verb=0.5)
for k, f in enumerate((587.33, 739.99, 880.0, 1174.66)):
    add(b(e0) + 0.12 * k, pluck(f, 0.85), pan=-0.3 + 0.2 * k, verb=0.55)
add(b(e0 + 1), bell(587.33, 0.7), verb=0.7)

duck = np.ones(N)
for k in range(T["home"]["from"], T["end"]["from"]):
    i0 = int(b(k) * SR)
    seg = 1 - 0.45 * np.exp(-np.arange(int(0.25 * SR)) / SR / 0.09)
    j = min(N, i0 + len(seg))
    duck[i0:j] = np.minimum(duck[i0:j], seg[: j - i0])
add(0, pad_bus * duck, 0.5, verb=0.25)
add(0, bass_bus * duck, 0.85)
ir_t = t_(2.6)
for buf in (L, R):
    ir = lp(noise(2.6), 6000) * np.exp(-ir_t / 0.7)
    buf += signal.fftconvolve(send, ir)[:N] * 0.02
mix = hp(np.stack([L, R]), 25).T
mix = np.tanh(1.5 * mix / np.max(np.abs(mix))) / np.tanh(1.5)
fade = np.ones(N)
fade[-int(1.5 * SR):] = np.linspace(1, 0, int(1.5 * SR))
mix *= fade[:, None] * 0.9
wavfile.write("public/score.wav", SR, (mix * 32767).astype(np.int16))
print("score.wav", N / SR, "s")
