"""Synthesize a short click tick from a recipe of frequencies and an envelope.

The recipe is the constants below — set the partials, the noise layer and the
envelope to get another tick. The defaults give the loader's line tick:
  length   20.57 ms, 44.1 kHz stereo
  onset    R 4.4 ms, L 6.4 ms (the same click, ~2 ms apart: width, not two sounds)
  attack   ~1 ms to the peak, then a fall to silence over ~16 ms
  partials 565, 1004, 2130, 2570, 3700, 5265 Hz (1004 and 3700 strongest, the
           rest ~8-9 dB under), over low-passed broadband noise

usage: tick.py <out.wav> [seed]
"""
import sys
import wave

import numpy as np

SR = 44100
N = 907  # samples: 20.57 ms
rng = np.random.default_rng(int(sys.argv[2]) if len(sys.argv) > 2 else 7)

PARTIALS = [(565, -8.5), (1004, 0.0), (2130, -9.0), (2570, -8.5), (3700, 0.0), (5265, -8.0)]
NOISE_DB = -9.0  # broadband layer relative to the strongest partial
NOISE_LP = 6000  # Hz, one-pole low-pass on the noise
FALL = 0.016  # s from the peak to silence
SHAPE = 0.8  # <1 holds the level a little before it falls
ATTACK = 0.0008  # s
PEAK = 0.092


def one_channel(onset_s: float) -> np.ndarray:
    t = np.arange(N) / SR - onset_s
    fall = np.clip(1 - (t - ATTACK) / FALL, 0, 1) ** SHAPE
    env = np.where(t < 0, 0.0, np.where(t < ATTACK, t / ATTACK, fall))
    tone = np.zeros(N)
    for f, db in PARTIALS:
        tone += 10 ** (db / 20) * np.sin(2 * np.pi * f * t + rng.uniform(0, 2 * np.pi))
    white = rng.standard_normal(N)
    a = np.exp(-2 * np.pi * NOISE_LP / SR)
    noise = np.zeros(N)
    for i in range(1, N):
        noise[i] = (1 - a) * white[i] + a * noise[i - 1]
    noise *= 10 ** (NOISE_DB / 20) * np.abs(tone).max() / np.abs(noise).max()
    x = (tone + noise) * env
    return x / np.abs(x).max() * PEAK


left = one_channel(0.0064)
right = one_channel(0.0044)
stereo = np.stack([left, right], axis=1).astype(np.float32)

out = sys.argv[1]
with wave.open(out, "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(stereo, -1, 1) * 32767).astype("<i2").tobytes())
print(out, N, "samples")
