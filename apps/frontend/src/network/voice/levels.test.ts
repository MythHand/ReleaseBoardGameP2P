import { expect, it } from 'vitest'
import { createSpeakingDetector, rms, SPEAKING_HOLD_MS, SPEAKING_ON_RMS } from './levels'

const loud = SPEAKING_ON_RMS * 2
const quiet = SPEAKING_ON_RMS / 4

it('computes the RMS of a frame', () => {
  expect(rms(new Float32Array([0, 0, 0, 0]))).toBe(0)
  expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
})

it('turns on above the threshold and reports only changes', () => {
  const d = createSpeakingDetector()
  expect(d.update(new Map([['a', quiet]]), 0)).toBeNull()
  expect(d.update(new Map([['a', loud]]), 100)).toEqual(new Set(['a']))
  expect(d.update(new Map([['a', loud]]), 200)).toBeNull()
})

it('holds through a short pause and drops after the hold', () => {
  const d = createSpeakingDetector()
  d.update(new Map([['a', loud]]), 0)
  expect(d.update(new Map([['a', quiet]]), SPEAKING_HOLD_MS - 1)).toBeNull()
  expect(d.update(new Map([['a', quiet]]), SPEAKING_HOLD_MS)).toEqual(new Set())
})

it('a member missing from the levels stops speaking at once', () => {
  const d = createSpeakingDetector()
  d.update(
    new Map([
      ['a', loud],
      ['b', loud],
    ]),
    0,
  )
  expect(d.update(new Map([['b', loud]]), 100)).toEqual(new Set(['b']))
})
