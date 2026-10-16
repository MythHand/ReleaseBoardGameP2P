// Who is speaking, from sound levels alone. Pure: audio.ts samples the
// analysers and feeds the numbers in, so the thresholds are testable without a
// browser. Tuned by ear on a live call — adjust together, not one at a time.

// How often the graph is sampled. A timer, not rAF: rAF stops in a background
// tab, and voice does not.
export const SPEAKING_POLL_MS = 100
// RMS of a time-domain frame (−1…1) above which a voice counts as speaking.
export const SPEAKING_ON_RMS = 0.02
// How long a voice keeps its ring after falling quiet, so a phrase reads as one
// ring rather than one blink per syllable.
export const SPEAKING_HOLD_MS = 300

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) sum += s * s
  return Math.sqrt(sum / samples.length)
}

export interface SpeakingDetector {
  // The current set when it differs from the last one reported, else null.
  update(levels: ReadonlyMap<string, number>, now: number): ReadonlySet<string> | null
}

export function createSpeakingDetector(): SpeakingDetector {
  const lastLoud = new Map<string, number>()
  let reported = new Set<string>()
  return {
    update(levels, now) {
      for (const id of [...lastLoud.keys()]) if (!levels.has(id)) lastLoud.delete(id)
      for (const [id, level] of levels) if (level >= SPEAKING_ON_RMS) lastLoud.set(id, now)
      const speaking = new Set<string>()
      for (const [id, at] of lastLoud) {
        if (now - at < SPEAKING_HOLD_MS) speaking.add(id)
        else lastLoud.delete(id)
      }
      const same = speaking.size === reported.size && [...speaking].every((id) => reported.has(id))
      if (same) return null
      reported = speaking
      return speaking
    },
  }
}
