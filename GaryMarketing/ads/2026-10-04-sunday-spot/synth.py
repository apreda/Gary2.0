"""The Sunday spot's score. Every sound is made here (no samples), 120 BPM so a beat is 15 frames.
Act 1 is a stadium: stomp, stomp, clap under brass hits and a crowd, cut dead on the joke.
Act 2 is a quiet electric piano in D major with one soft note per card dealt.
Act 3 brings the stomp-stomp-clap back under the end card. Writes public/score.wav."""
import json

import numpy as np
from scipy import signal
from scipy.io import wavfile

SR = 48000
T = json.load(open("timeline.json"))
BEAT = 60 / T["bpm"]
FPS = T["fps"]
N = int(T["durationSeconds"] * SR)
rng = np.random.default_rng(1004)


def b(beat): return beat * BEAT
def fr(frame): return frame / FPS
def t_(sec): return np.arange(int(sec * SR)) / SR
def noise(sec): return rng.standard_normal(int(sec * SR))
def sos(kind, f, order=2): return signal.butter(order, f, kind, fs=SR, output="sos")
def bp(x, lo, hi): return signal.sosfilt(sos("bandpass", [lo, hi]), x)
def lp(x, f): return signal.sosfilt(sos("lowpass", f), x)
def hp(x, f): return signal.sosfilt(sos("highpass", f), x)
def midi(n): return 440.0 * 2 ** ((n - 69) / 12)


class Bus:
    def __init__(self):
        self.L, self.R, self.send = np.zeros(N), np.zeros(N), np.zeros(N)

    def _place(self, buf, s, x, g):
        i = int(round(s * SR))
        if i >= N or i + len(x) <= 0:
            return
        a, j = max(0, -i), min(N, i + len(x))
        buf[max(i, 0):j] += g * x[a: j - i]

    def add(self, s, x, g=1.0, pan=0.0, verb=0.0):
        self._place(self.L, s, x, g * np.sqrt(0.5 * (1 - pan)))
        self._place(self.R, s, x, g * np.sqrt(0.5 * (1 + pan)))
        if verb:
            self._place(self.send, s, x, g * verb)


def stomp(g=1.0):
    t = t_(0.5)
    f = 46 + 80 * np.exp(-t / 0.03)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.15)
    thud = lp(noise(0.5), 240) * np.exp(-t / 0.06) * 1.3
    slap = bp(noise(0.5), 300, 1400) * np.exp(-t / 0.014) * 0.7
    return np.tanh(1.8 * (body + thud + slap)) * g


def clap(g=1.0, hands=16):
    """A stand's worth of hands: the claps land a few milliseconds apart."""
    t = t_(0.6)
    out = np.zeros(len(t))
    for _ in range(hands):
        d = rng.uniform(0, 0.03)
        x = bp(noise(0.6), rng.uniform(800, 1400), rng.uniform(2600, 4600))
        out += x * (t >= d) * np.exp(-np.clip(t - d, 0, None) / rng.uniform(0.03, 0.1)) * rng.uniform(0.5, 1)
    return out / (hands ** 0.5) * 0.55 * g


def boom(g=1.0, sec=2.4):
    t = t_(sec)
    f = 36 + 70 * np.exp(-t / 0.08)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t / 0.6)
    crack = lp(noise(sec), 2200) * np.exp(-t / 0.05) * 0.9
    return np.tanh(1.7 * (body + crack)) * g


def braam(notes, sec=1.8, g=1.0):
    t = t_(sec)
    x = np.zeros(len(t))
    for n in notes:
        for det in (-0.13, 0.0, 0.12):
            x += signal.sawtooth(2 * np.pi * midi(n + det) * t + rng.uniform(0, 6.28))
    x /= len(notes) * 3
    att = np.minimum(t / 0.012, 1)
    low = lp(x, 700) * np.exp(-t / (sec * 0.5))
    bite = bp(x, 700, 4200) * np.exp(-t / (sec * 0.22))
    return np.tanh(3.0 * (low + 0.9 * bite) * att) * g


def bass(n, g=1.0):
    t = t_(0.24)
    x = signal.sawtooth(2 * np.pi * midi(n) * t) + 0.6 * np.sin(2 * np.pi * midi(n) * t)
    return lp(x, 520) * np.minimum(t / 0.004, 1) * np.exp(-t / 0.09) * g


def tick(g=1.0):
    t = t_(0.08)
    return hp(noise(0.08), 6500) * np.exp(-t / 0.011) * g


def crowd(sec):
    x = bp(noise(sec), 260, 2800)
    m = np.abs(lp(noise(sec), 3.0))
    return x * (0.55 + 0.45 * m / (m.max() + 1e-9))


def riser(sec, g=1.0):
    t = t_(sec)
    r = t / sec
    n = noise(sec)
    x = bp(n, 250, 1400) * (1 - r) + hp(n, 3200) * r
    tone = np.sin(2 * np.pi * np.cumsum(180 + 900 * r ** 2) / SR) * 0.25
    return (x + tone) * r ** 2.2 * g


def whoosh(sec=0.45, g=1.0):
    t = t_(sec)
    env = np.exp(-((t - sec * 0.55) / (sec * 0.22)) ** 2)
    return bp(noise(sec), 500, 3600) * env * g


def ep(n, sec=3.0, g=1.0):
    """Electric piano: a sine with a little FM that settles."""
    t = t_(sec)
    f = midi(n)
    x = np.sin(2 * np.pi * f * t + 1.3 * np.exp(-t / 0.3) * np.sin(2 * np.pi * f * t))
    x += 0.22 * np.sin(2 * np.pi * 2 * f * t) * np.exp(-t / 0.2)
    return x * np.minimum(t / 0.005, 1) * np.exp(-t / (sec * 0.38)) * g


def pluck(n, g=1.0):
    t = t_(0.5)
    f = midi(n)
    x = np.sin(2 * np.pi * f * t) + 0.35 * np.sin(2 * np.pi * 3 * f * t) * np.exp(-t / 0.04)
    return x * np.minimum(t / 0.003, 1) * np.exp(-t / 0.13) * g


def flick(g=1.0):
    t = t_(0.14)
    return (bp(noise(0.14), 1500, 6000) * np.exp(-((t - 0.035) / 0.022) ** 2) * 0.7
            + bp(noise(0.14), 300, 900) * (t >= 0.06) * np.exp(-np.clip(t - 0.06, 0, None) / 0.012)) * g


DM, BB, F, C = [38, 45, 50, 53, 57], [34, 41, 46, 50, 53], [41, 48, 53, 57, 60], [36, 43, 48, 52, 55]
E = T["events"]
CUT = b(E["cutBeat"])

# ── Act 1: the stadium ────────────────────────────────────────────────────────
a1 = Bus()
a1.add(0, boom(1.0), 0.95, verb=0.35)
a1.add(0, braam(DM, 2.6), 0.5, verb=0.45)
a1.add(b(0.5), riser(b(2.5)), 0.22, verb=0.2)
roots = {3: 38, 7: 34, 10: 41, 13: 36}
root = 38
for beat2 in range(6, 32):                          # eighth notes from beat 3 to beat 16
    beat = beat2 / 2
    if beat in roots:
        root = roots[beat]
        a1.add(b(beat), braam({38: DM, 34: BB, 41: F, 36: C}[root], 1.9), 0.42, verb=0.4)
        a1.add(b(beat), boom(0.8, 1.6), 0.6, verb=0.25)
    a1.add(b(beat), bass(root), 0.3)
for c in range(3, 15, 2):                           # stomp, stomp, clap
    a1.add(b(c), stomp(), 0.85, verb=0.18)
    a1.add(b(c + 0.5), stomp(), 0.8, verb=0.18)
    a1.add(b(c + 1), clap(), 0.8, verb=0.3)
a1.add(b(15), stomp(), 0.85, verb=0.18)
for f in E["tickFrames"]:
    a1.add(fr(f), tick(), 0.22, pan=rng.uniform(-0.4, 0.4))
for k in range(12):                                 # the roll into the count
    a1.add(b(15) + b(1) * (k / 12) ** 0.8, clap(0.25 + 0.06 * k, hands=6), 0.5, verb=0.25)
a1.add(b(14.5), riser(b(1.5)), 0.3, verb=0.2)
a1.add(b(16), boom(1.0), 0.95, verb=0.35)
a1.add(b(16), braam([50, 57, 62, 65, 69], 1.6), 0.5, verb=0.45)
a1.add(b(16), clap(1.2), 0.7, verb=0.3)
a1.add(b(17.5), boom(1.0), 1.0, verb=0.35)
a1.add(b(17.5), braam([45, 52, 57, 61, 64, 69], 1.8), 0.56, verb=0.45)   # A major: it never resolves
a1.add(b(17.5), clap(1.2), 0.7, verb=0.3)
cr_t = np.arange(N) / SR
cr_env = np.interp(cr_t, [0, 0.15, b(3), b(15), b(16), b(17.5), CUT], [0.0, 0.2, 0.11, 0.14, 0.24, 0.3, 0.32])
a1.L += crowd(N / SR)[:N] * cr_env * 0.5
a1.R += crowd(N / SR)[:N] * cr_env * 0.5
a1.send += crowd(N / SR)[:N] * cr_env * 0.12
gate = np.clip(1 - (cr_t - CUT) / 0.012, 0, 1)      # the cut: everything stops on the joke
for buf in (a1.L, a1.R, a1.send):
    buf *= gate

# ── Act 2 and the end card ────────────────────────────────────────────────────
a2 = Bus()
a2.add(CUT, stomp(), 0.5)                            # one dry thud, then nothing
for beat, notes in ((22, [50, 54, 57, 61, 64]), (26, [43, 59, 62, 66]), (30, [47, 57, 62, 66]), (33, [45, 62, 64, 69])):
    for k, n in enumerate(notes):
        a2.add(b(beat) + 0.012 * k, ep(n), 0.2, pan=(k - 2) * 0.15, verb=0.55)
scale = [62, 64, 66, 69, 71, 74, 76, 78, 81, 86]
for k, f in enumerate(E["dealFrames"]):
    a2.add(fr(f), flick(), 0.26, pan=rng.uniform(-0.3, 0.3), verb=0.15)
    a2.add(fr(f) + 0.05, pluck(scale[k % len(scale)]), 0.2, pan=rng.uniform(-0.3, 0.3), verb=0.5)
a2.add(fr(E["flipFrame"]), whoosh(), 0.2, verb=0.3)
a2.add(fr(E["flipFrame"]) + 0.42, ep(86, 2.0), 0.1, verb=0.7)

END = E["endBeat"]
DMAJ = [38, 45, 50, 54, 57, 62, 66]
a2.add(b(END), stomp(), 0.85, verb=0.18)
a2.add(b(END + 0.5), stomp(), 0.8, verb=0.18)
a2.add(b(END + 1), clap(1.2), 0.85, verb=0.3)
a2.add(b(END + 1), boom(1.0, 3.0), 0.95, verb=0.35)
a2.add(b(END + 1), braam(DMAJ, 4.2), 0.5, verb=0.5)
for k, n in enumerate([74, 78, 81, 86]):
    a2.add(b(END + 1) + 0.07 * k, ep(n, 2.6), 0.09, pan=(k - 1.5) * 0.3, verb=0.7)
for rep, g in ((END + 2, 0.6), (END + 4, 0.42)):     # the stands keep it going under the button
    a2.add(b(rep), stomp(), 0.8 * g, verb=0.18)
    a2.add(b(rep + 0.5), stomp(), 0.75 * g, verb=0.18)
    a2.add(b(rep + 1), clap(), 0.8 * g, verb=0.3)
roar = np.interp(cr_t, [b(END + 0.8), b(END + 1.2), b(END + 3), N / SR], [0, 0.3, 0.12, 0.0], left=0, right=0)
a2.L += crowd(N / SR)[:N] * roar * 0.5
a2.R += crowd(N / SR)[:N] * roar * 0.5
a2.send += crowd(N / SR)[:N] * roar * 0.12

# ── Room, master ──────────────────────────────────────────────────────────────
ir_t = t_(2.0)
ir = [lp(noise(2.0), 5200) * np.exp(-ir_t / 0.45) for _ in range(2)]
tail = np.clip(1 - (cr_t - CUT) / 0.28, 0, 1) ** 2   # the stadium's echo dies fast after the cut
wet = [signal.fftconvolve(a1.send, ir[k])[:N] * 0.02 * tail + signal.fftconvolve(a2.send, ir[k])[:N] * 0.02 for k in range(2)]
L = a1.L + a2.L + wet[0]
R = a1.R + a2.R + wet[1]
mix = np.stack([L, R], axis=1)
mix = np.tanh(1.25 * mix / np.percentile(np.abs(mix), 99.7))
fade = np.clip((N / SR - cr_t) / 0.5, 0, 1)
mix *= fade[:, None]
mix = mix / np.abs(mix).max() * 0.92
wavfile.write("public/score.wav", SR, (mix * 32767).astype(np.int16))
quiet = mix[int((CUT + 0.3) * SR): int(b(21.5) * SR)]
print(f"score.wav {N / SR:.2f}s  peak {np.abs(mix).max():.2f}  rms {np.sqrt((mix ** 2).mean()):.3f}  silence-after-cut rms {np.sqrt((quiet ** 2).mean()):.4f}")
