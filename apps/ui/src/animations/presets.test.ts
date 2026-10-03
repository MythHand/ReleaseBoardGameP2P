import { afterEach, describe, expect, it, vi } from 'vitest'
import { PRESETS, type PresetFn } from './presets'

// jsdom ships no WAAPI, and this package has no global test setup to add one
// (the frontend's `test-setup.ts` is where that lives). This suite is not about
// the flight — it is about what a preset DECLARES, so the stub records the
// keyframes instead of playing them.
const declared = (name: string, params?: Record<string, unknown>) => {
  let seen: { frames: Keyframe[]; options: KeyframeAnimationOptions } | null = null
  const el = document.createElement('div')
  el.animate = ((frames: Keyframe[], options: KeyframeAnimationOptions) => {
    seen = { frames, options }
    return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation
  }) as never
  const preset = PRESETS[name]
  if (typeof preset !== 'function') throw new Error(`${name} should be a function preset`)
  preset(el, params)
  if (!seen) throw new Error(`${name} declared no animation`)
  return seen as { frames: Keyframe[]; options: KeyframeAnimationOptions }
}

// A preset that persists its end state (`fill: 'both'` / `'forwards'`) leaves
// that state on the element FOREVER. On a preset applied to a BLOCK rather than
// to a flying card, any transform value other than `none` is then a permanent
// stacking context — and a stacking context traps its children's z-index inside
// it, however high they set it.
//
// `hudIn` is the block preset: the board's opening plays it on the deck column,
// the discard, every seat and the dock (`features/game-intro/useDealIntro.ts`).
// Three of those hold a `Pile`, and `Pile.module.css`'s `.count` sits at
// `calc(var(--z-flight) + 40)` exactly so a card flying past passes UNDER the
// badge. Its comment names the precondition: that works "only while the
// consumer's placement is not a stacking context". Ending `hudIn` on
// `translate(0, 0)` broke it — the counter blinked behind every card that left
// a pile, reported on PR #132.
describe('hudIn', () => {
  it('ends on `none`, so the block it reveals is not left a stacking context', () => {
    const { frames, options } = declared('hudIn', { dx: -34, dur: 10 })
    // the pairing IS the bug: a persisted end state plus a real transform value
    expect(options.fill).toBe('both')
    expect((frames.at(-1) as { transform?: string }).transform).toBe('none')
  })

  it('still starts from its offset, so the movement is unchanged', () => {
    const { frames } = declared('hudIn', { dx: -34, dy: 12, dur: 10 })
    expect((frames[0] as { transform?: string }).transform).toBe('translate(-34px, 12px)')
  })
})

// POINT A IS THE CARD. A travel reads where it starts off the element it moves
// — its box and the pose it stands in — and is never told. Told, it flew the
// difference between the told rect and the target from wherever the card really
// was, and a release with its Code Review landed beside its slot by exactly the
// gap between the two (#168).
describe('travel start', () => {
  const box = { left: 200, top: 100, width: 150, height: 210 }
  const to = { left: 500, top: 500, width: 100, height: 140 }
  // centre to centre: (550, 570) − (275, 205), scaled by width
  const landing = 'translate(275px, 365px) scale(0.6666666666666666) rotate(0deg)'

  const standingAt = (rect: typeof box, pose?: { look: string; e: number; f: number }) => {
    let seen: Keyframe[] = []
    const el = document.createElement('div')
    el.getBoundingClientRect = () => ({ ...rect }) as DOMRect
    if (pose) {
      el.style.transform = pose.look
      Object.defineProperty(el, 'offsetWidth', { value: box.width })
      Object.defineProperty(el, 'offsetHeight', { value: box.height })
      // jsdom has no DOMMatrix: the pose's translation is all the start needs
      const moved = { e: pose.e, f: pose.f }
      vi.stubGlobal(
        'DOMMatrixReadOnly',
        class {
          e = moved.e
          f = moved.f
        },
      )
    }
    el.animate = ((frames: Keyframe[]) => {
      seen = frames
      return { cancel: () => {}, finished: Promise.resolve() } as unknown as Animation
    }) as never
    return { el, frames: () => seen }
  }

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('starts a card standing square on the keyframe it always did, from where it stands', () => {
    const { el, frames } = standingAt(box)
    ;(PRESETS.playToReleaseZone as PresetFn)(el, { to })
    expect(frames().map((k) => k.transform)).toEqual([
      'translate(0, 0) scale(1) rotate(0deg)',
      landing,
    ])
  })

  it('does not take a start from the caller', () => {
    const { el, frames } = standingAt(box)
    const elsewhere = { left: 0, top: 0, width: 150, height: 210 }
    ;(PRESETS.playToReleaseZone as PresetFn)(el, { from: elsewhere, to })
    expect(frames()[1]?.transform).toBe(landing)
  })

  it('starts a card standing in a pose IN that pose, and aims from its own box', () => {
    // the pose moves the card's centre by (16, −12); what the screen reports is
    // the box around the turned card, centred on the moved centre
    const around = { left: 201, top: 70, width: 180, height: 246 }
    const look = 'translate(16px, -12px) rotate(6deg)'
    const { el, frames } = standingAt(around, { look, e: 16, f: -12 })
    ;(PRESETS.dealToSeat as PresetFn)(el, { to })
    expect(frames()[0]?.transform).toBe(look)
    expect(frames()[1]?.transform).toBe(landing)
  })

  it('still turns the start by `rotateFrom`', () => {
    const { el, frames } = standingAt(box)
    ;(PRESETS.takeFromSeat as PresetFn)(el, { to, rotateFrom: 180 })
    expect(frames()[0]?.transform).toBe('translate(0, 0) scale(1) rotate(180deg)')
  })
})

describe('playToReleaseZone', () => {
  // A landing in the zone is one straight flight on the LAND curve. A waypoint
  // that sent the card sideways first (#178) bent every landing into a hook
  // and was removed by the owner's decision.
  it('flies straight to a slot far to the side, with no waypoint', () => {
    const to = { left: 500, top: 500, width: 100, height: 133 }
    expect(declared('playToReleaseZone', { to }).frames).toHaveLength(2)
  })
})
