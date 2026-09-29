"""The launch film's score, v2. Every sound is made here (no samples): a bright
128 BPM track in E major. A filtered arpeggio opens, the kick lands with the
first screen, chords stab on the offbeats, a snare roll builds into the end
card, one big chord resolves it. Cut to timeline.json. Writes public/score.wav."""
import json

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
T = json.load(open("timeline.json"))
BEAT = 60 / T["bpm"]
N = int(T["durationSeconds"] * SR)
rng = np.random.default_rng(128)
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
    t = t_(0.4)
    f = 48 + 140 * np.exp(-t / 0.025)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.2)
    click = hp(noise(0.4), 3000) * np.exp(-t / 0.003) * 0.35
    return np.tanh(2.0 * (body + click)) * g


def clap(g=1.0):
    t = t_(0.35)
    env = sum((t >= d) * np.exp(-np.clip(t - d, 0, None) / (0.01 if k < 2 else 0.12)) for k, d in enumerate((0, 0.012, 0.024)))
    return bp(noise(0.35), 1000, 4200) * env * 0.85 * g


def hat(open_=False, g=1.0):
    t = t_(0.35)
    return hp(noise(0.35), 8000) * np.exp(-t / (0.09 if open_ else 0.022)) * 0.38 * g


def snare(g=1.0):
    t = t_(0.25)
    tone = np.sin(2 * np.pi * 190 * t) * np.exp(-t / 0.05) * 0.5
    return (bp(noise(0.25), 1500, 7000) * np.exp(-t / 0.07) + tone) * 0.6 * g


def saw(f, sec, det=0.0):
    ph = f * (1 + det) * t_(sec)
    return 2 * (ph - np.floor(ph + 0.5))


def square(f, sec):
    return np.sign(np.sin(2 * np.pi * f * t_(sec)))


def arp_note(f, sec, cutoff):
    t = t_(sec)
    x = 0.6 * saw(f, sec) + 0.4 * square(f * 2, sec) * 0.5
    return lp(x, cutoff) * np.exp(-t / 0.11) * np.minimum(1, t / 0.002) * 0.3


def stab(freqs, sec=0.22):
    t = t_(sec)
    x = sum(saw(f, sec, d) for f in freqs for d in (-0.006, 0, 0.007)) / (3 * len(freqs))
    return lp(x, 3200) * np.exp(-t / 0.09) * np.minimum(1, t / 0.003) * 0.9


def bass(f, sec):
    t = t_(sec)
    x = lp(saw(f, sec) + 0.7 * np.sin(2 * np.pi * f * t), 300)
    return np.tanh(2.0 * x * np.minimum(1, t / 0.004) * np.exp(-t / (sec * 1.1))) * 0.6


def impact(sec=2.5, size=1.0):
    t = t_(sec)
    f = 32 + 90 * np.exp(-t / 0.15)
    sub = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.8)
    air = lp(noise(sec), 6000) * np.exp(-t / 0.45) * 0.25
    return np.tanh(1.4 * (sub + air)) * size


def sweep(sec, up=True):
    t = t_(sec)
    shape = (t / sec) ** 2 if up else (1 - t / sec) ** 2
    return hp(noise(sec), 1500) * shape * 0.35


def pad(freqs, sec):
    t = t_(sec)
    x = sum(saw(f, sec, d) for f in freqs for d in (-0.004, 0, 0.005)) / (3 * len(freqs))
    return lp(x, 1800) * np.minimum(1, t / 0.4) * np.minimum(1, (sec - t) / 0.5) * 0.45


# E major: C#m - A - E - B, one chord per two bars (8 beats)
CH = {"C#m": (69.30, [277.18, 329.63, 415.30]), "A": (55.0, [277.18, 329.63, 440.0]),
      "E": (82.41, [329.63, 415.30, 493.88]), "B": (61.74, [311.13, 369.99, 493.88])}
PROG = ["C#m", "A", "E", "B"]


def chord(beat):
    return PROG[int(beat // 8) % 4]


start, drop, end_ = T["home"]["from"], T["end"]["from"], T["durationSeconds"] / BEAT

# the arpeggio runs the whole film; its filter opens across the intro
for k in range(int(end_ * 4)):
    beat = k / 4
    if beat >= drop - 2 and beat < drop:
        continue
    c = CH[chord(beat)][1]
    f = [c[0], c[1], c[2], c[1] * 2][k % 4] * 2
    cutoff = 700 + 2600 * min(1, beat / start) if beat < start else 3300
    add(b(beat), arp_note(f, BEAT * 0.45, cutoff), 0.55 if beat < start else 0.42, pan=0.35 * np.sin(k * 0.7), verb=0.3)

# the groove: kick with the first screen, clap on 2 and 4, open hats on the offbeats
for beat in range(int(start), int(drop)):
    if beat >= drop - 2:
        continue
    add(b(beat), kick(1.0))
    if beat % 2 == 1:
        add(b(beat), clap(), 0.9, verb=0.25)
    add(b(beat + 0.5), hat(True), 0.7, pan=0.2)
    add(b(beat + 0.25), hat(), 0.35, pan=-0.2)
    add(b(beat + 0.75), hat(), 0.3, pan=-0.2)
    add(b(beat + 0.5), stab(CH[chord(beat)][1]), 0.5, pan=-0.15, verb=0.3)
    add(b(beat), bass(CH[chord(beat)][0], BEAT * 0.9), 0.95)

# a lift at every new screen
for name in ("home", "picks", "winners", "darts", "billfold"):
    s = T[name]["from"]
    add(b(s) - 0.5, sweep(0.5), 0.8)
    add(b(s), impact(1.4, 0.55), verb=0.3)
add(b(T["picks"]["flipAt"]), sweep(0.3), 0.5)

# the build: a snare roll into the end card, then one big chord
for k in range(16):
    beat = drop - 4 + k * 0.25
    add(b(beat), snare(0.35 + 0.045 * k), pan=0.1 * np.sin(k), verb=0.3)
add(b(drop - 2), sweep(b(2), True), 1.0)
add(b(drop), impact(3.5, 1.1), verb=0.5)
add(b(drop), kick(1.2))
add(b(drop), pad([164.81, 207.65, 246.94, 329.63, 415.30], b(end_ - drop)), 1.3, verb=0.5)
add(b(drop), bass(41.2, b(4)), 1.1)
for k, f in enumerate((659.25, 830.61, 987.77, 1318.51)):
    add(b(drop) + 0.07 * k, arp_note(f, 1.2, 4000), 0.9, pan=-0.3 + 0.2 * k, verb=0.6)

mix_l, mix_r = L.copy(), R.copy()
ir_t = t_(2.2)
for buf in (mix_l, mix_r):
    ir = lp(noise(2.2), 7000) * np.exp(-ir_t / 0.5)
    buf += signal.fftconvolve(send, ir)[:N] * 0.018
mix = hp(np.stack([mix_l, mix_r]), 28).T
mix = np.tanh(1.7 * mix / np.max(np.abs(mix))) / np.tanh(1.7)
fade = np.ones(N)
fade[-int(1.2 * SR):] = np.linspace(1, 0, int(1.2 * SR))
mix *= fade[:, None] * 0.92
wavfile.write("public/score.wav", SR, (mix * 32767).astype(np.int16))
print("score.wav", N / SR, "s")
