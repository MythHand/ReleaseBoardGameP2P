"""Synthesize the loader's logo sound: generated layers, shaped by a reference.

Every layer below is generated here. The reference gives only the SHAPE — how
loud each frequency band (BANDS) is, 20 ms at a time — and the generated layers
take on those dynamics. The actions land on the milliseconds the logo animation
is timed to: 0.55 s digital burst, 0.87 s cut into the glitch, 1.60 s the
power-off hit, low echoes after it.

usage: logo-theme.py <reference.f32> <out.wav>
  reference: any sound to take the band shape from, as raw float32 stereo at
  44.1 kHz — e.g. `ffmpeg -i in.wav -f f32le -ac 2 -ar 44100 reference.f32`
"""
import sys
import wave

import numpy as np

SR = 44100
# The output runs 3.6 s, so the boom dies away on its own; the logo holds until
# 4.0 s, so the tail rings under the hold and no timing moves. A longer
# reference is cut to it, a shorter one padded with silence.
LENGTH = 3.6
ref = np.fromfile(sys.argv[1], dtype=np.float32).reshape(-1, 2)[: int(LENGTH * SR)]
ref = np.vstack([ref, np.zeros((int(LENGTH * SR) - len(ref), 2), np.float32)])
N = len(ref)
t = np.arange(N) / SR

BANDS = [(20, 60), (60, 120), (120, 250), (250, 500), (500, 1000), (1000, 2000), (2000, 4000), (4000, 8000), (8000, 21000)]
HOP = int(0.02 * SR)


def bandpass(x, lo, hi):
    X = np.fft.rfft(x)
    f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f >= hi)] = 0
    return np.fft.irfft(X, len(x))


def envelope(x):
    """RMS per HOP, linearly interpolated back to sample rate."""
    frames = np.sqrt(
        np.array([np.mean(x[i : i + HOP] ** 2) if i < len(x) else 0 for i in range(0, len(x), HOP)])
        + 1e-20
    )
    centers = np.arange(len(frames)) * HOP + HOP / 2
    return np.interp(np.arange(len(x)), centers, frames)


def tones(freqs, wobble=0.0, seed=0, shift=0.0):
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    for f in freqs:
        # slow random pitch drift + tremolo: the "loosening" of a failing set
        drift = np.cumsum(r.standard_normal(N)) / np.sqrt(N) * wobble
        vib = wobble * 0.012 * np.sin(2 * np.pi * r.uniform(5, 13) * t + r.uniform(0, 6.28))
        phase = 2 * np.pi * np.cumsum(f * (1 + vib + drift * 0.01)) / SR
        trem = 1 + wobble * 0.5 * np.sin(2 * np.pi * r.uniform(7, 19) * t + r.uniform(0, 6.28))
        out += np.sin(phase + r.uniform(0, 6.28) + shift) * trem
    return out


def stepped_digital(seed):
    """Bright tones that jump between steps (the burst's stair-stepped lines)."""
    r = np.random.default_rng(seed)
    out = np.zeros(N)
    for base in (3475, 6113, 10837, 2091, 2624):
        f = np.full(N, float(base))
        for cut in (0.72, 0.80, 0.86):  # where the burst's lines bend
            f[t >= cut] *= r.uniform(0.85, 1.15)
        out += np.sign(np.sin(2 * np.pi * np.cumsum(f) / SR)) * 0.3  # square: digital
    # crush: hold every 6th sample
    out = np.repeat(out[::6], 6)[:N]
    return out


def crackle(seed):
    """Sparse clicks, denser towards the hit, plus hiss."""
    r = np.random.default_rng(seed)
    x = r.standard_normal(N) * 0.15
    p = np.clip((t - 0.85) / 0.75, 0, 1) * 0.004  # click probability per sample
    clicks = (r.random(N) < p).astype(float) * r.choice([-1, 1], N)
    clicks[int(1.0 * SR)] = 1.0  # a lone click near 1.0 s
    clicks[int(1.6 * SR)] = 3.0  # the set switching off: one hard transient
    return x + np.convolve(clicks, np.exp(-np.arange(40) / 6), "same")


def whine():
    """The thin high lines of a picture tube cooling down after the hit."""
    fade = np.where(t > 1.6, np.exp(-(t - 1.6) / 0.12), 0.0)  # gone by ~1.9 s
    return sum(np.sin(2 * np.pi * f * t) for f in (9950, 14300, 17640, 19845)) * fade


# The same generators feed both channels; how far apart they are set in phase
# gives each band its stereo picture: the sub wide and nearly out of phase, the
# 93 Hz hum in the middle, the rest loose.
SHIFT = {47: 2.2, 93: 1.2, 186: 1.57, 250: 1.46, 500: 1.72}


def channel(ch):
    k = ch  # 0 = left, 1 = right: the right channel takes the shift
    digital = stepped_digital(3 + 100 * ch)
    crack = crackle(4 + 100 * ch)
    carriers = [
        np.sin(2 * np.pi * 47 * t + k * SHIFT[47]),
        tones([93], wobble=0.3, seed=1, shift=k * SHIFT[93]),
        tones([186, 199], wobble=0.4, seed=2, shift=k * SHIFT[186]),
        tones([234, 241, 277, 283, 331, 350, 382, 486], wobble=1.0, seed=5, shift=k * SHIFT[250]),
        tones([501, 552], wobble=1.0, seed=6, shift=k * SHIFT[500]) + crack,
        crack + digital,
        digital + crack,
        digital + crack,
        digital + crack + whine(),
    ]
    low, high = np.zeros(N), np.zeros(N)
    for (lo, hi), c in zip(BANDS, carriers):
        target = envelope(bandpass(ref[:, ch].astype(float), lo, hi))
        own = bandpass(c, lo, hi)
        if hi <= 1000:
            low += own / envelope(own) * target
        else:
            high += own / envelope(own) * target
    return low, high


# ---- the low end from the cut on, designed rather than shaped ---------------
CUT, HIT = 0.87, 1.60


def glide(f0, f1, t0, t1):
    """Exponential pitch path f0 -> f1 between t0 and t1, held outside."""
    k = np.clip((t - t0) / (t1 - t0), 0, 1)
    return f0 * (f1 / f0) ** k


def osc(freq_path, phase=0.0):
    return np.sin(2 * np.pi * np.cumsum(freq_path) / SR + phase)


def extras(ch):
    """What is laid over the shaped sound: depth and a clear slide in part 2,
    and the boom from the hit on."""
    r = np.random.default_rng(70 + ch)
    in2 = np.clip((t - CUT) / (HIT - CUT), 0, 1) * (t >= CUT) * (t < HIT)
    # part 2: a sinking layer between the hum and the cluster, so the slide is
    # heard without taking the cluster (and its upper voices) down with it
    sink = glide(1.0, 0.72, CUT, HIT)
    slide = np.zeros(N)
    for f, a in ((212, 1.0), (223, 0.8), (178, 0.6)):
        trem = 1 + 0.4 * np.sin(2 * np.pi * r.uniform(7, 14) * t + r.uniform(0, 6.28))
        slide += a * osc(f * sink, r.uniform(0, 6.28)) * trem
    slide *= 10 ** (-43 / 20) * np.sqrt(2) / 1.6 * (0.4 + 0.6 * in2) * (t >= CUT) * (t < HIT)
    # part 2: sub depth under it, growing towards the hit
    rumble = osc(glide(55, 40, CUT, HIT), ch * 0.3) * (1 + 0.3 * np.sin(2 * np.pi * 9 * t + ch))
    rumble *= 10 ** (-40 / 20) * np.sqrt(2) * (0.25 + 0.75 * in2**1.5) * (t >= CUT) * (t < HIT)
    return slide + rumble, boom_wave(ch)


def boom_wave(ch):
    """The boom: ONE bass note, 93 Hz, hollow and buzzing — its 3rd harmonic is
    the loudest, the 1st 6 dB under, then the 6th, 4th, 2nd, 5th. It slides up
    into pitch as it lands, holds ~0.15 s, and closes from the top down, so what
    is left is the note's own low end. A sub an octave under gives it weight;
    it is not the boom."""
    r = np.random.default_rng(40 + ch)
    land = HIT - 0.015  # the note starts climbing into the hit just before it
    since = np.clip(t - land, 0, None)
    after = np.clip(t - HIT, 0, None)
    on = (t >= land) * (1 - np.exp(-since / 0.004))
    f0 = np.where(t < HIT + 0.03, glide(76, 93, land, HIT + 0.03), glide(93, 90, HIT + 0.03, HIT + 1.2))
    phase = 2 * np.pi * np.cumsum(f0) / SR
    hold = np.clip(after - 0.15, 0, None)  # the level holds, then each voice decays
    voices = ((1, -6, 0.34), (2, -28, 0.16), (3, 0, 0.115), (4, -24, 0.08),
              (5, -29, 0.07), (6, -17, 0.06), (7, -35, 0.04))
    note = sum(10 ** (db / 20) * np.sin(k * phase + r.uniform(0, 6.28)) * np.exp(-hold / tau)
               for k, db, tau in voices) * on
    sub = np.sin(phase / 2) * 10 ** (-9 / 20) * on * np.exp(-after / 0.3)
    crack = bandpass(r.standard_normal(N), 800, 4000) * on * np.exp(-after / 0.012)
    crack /= np.abs(crack).max() + 1e-12
    hit = note + sub + 0.12 * crack
    wave_ = hit.copy()
    for delay, gain in ((0.12, 0.3), (0.26, 0.18), (0.43, 0.1)):
        d = int((delay + 0.011 * ch) * SR)
        wave_[d:] += gain * bandpass(hit, 40, 200)[: N - d]  # the room answers with the note's low end only
    # set the hit's own level, so it lands as a boom
    w = (t >= HIT) & (t < HIT + 0.15)
    return wave_ * 10 ** (-17 / 20) / np.sqrt(np.mean(wave_[w] ** 2))


# The shaped low end keeps its own thunk for a moment after the hit, then gives
# the floor to the boom instead of ringing on in part 2's tone.
low_out = np.where(t > HIT, np.exp(-(t - HIT) / 0.03), 1.0)
parts = []
for ch in (0, 1):
    low, high = channel(ch)
    layers, boom = extras(ch)
    parts.append(high + low * low_out + layers + boom)
out = np.stack(parts, axis=1)

# Where the reference is silent, so is this: the band filters otherwise smear a
# faint floor over the leading and trailing silence.
level = envelope(np.abs(ref).max(axis=1).astype(float))
gate = ((level > 10 ** (-90 / 20)) | (t > HIT)).astype(float)  # the boom outlives the reference's tail
fade = int(0.004 * SR)
gate = np.convolve(gate, np.ones(fade) / fade, "same")
out *= gate[:, None]
out *= np.clip((t[-1] - t) / 0.08, 0, 1)[:, None]  # land on silence at the file's end
peak = np.abs(out).max()
if peak > 0.98:  # the band envelopes set the level; only guard against clipping
    out *= 0.98 / peak
print('peak', round(float(peak), 3))
with wave.open(sys.argv[2], "wb") as w:
    w.setnchannels(2)
    w.setsampwidth(2)
    w.setframerate(SR)
    w.writeframes((np.clip(out, -1, 1) * 32767).astype("<i2").tobytes())
print(sys.argv[2], f"{N / SR:.3f}s")
