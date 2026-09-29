import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import { type ShownCard, shownLayout, shownPlaceOf, shownPlayerOffset } from './shownLayout'

// Where another player's cards stand while they make a play (resolution.md §1)
// — the same places our own staging stands a play in.

const shown = (id: string, n = 0): ShownCard => {
  const card = cardById(id)
  if (!card) throw new Error(`unknown card ${id}`)
  return { player: 'p2', uid: `${id}#${n}`, card }
}

const RELEASE = shown('release-frontend')
const REVIEW = shown('support-code-review')
const SUDO = shown('support-sudo')
const BUG = shown('attack-bug')
const BRANCH = shown('operation-git-branch')

describe('shownLayout', () => {
  it('stands a release waiting for its cost at the stage slot', () => {
    const layout = shownLayout([RELEASE])
    expect(layout).toEqual({ stage: RELEASE })
    expect(shownPlaceOf(layout, RELEASE.uid)).toBe('stage')
  })

  it('stands a support waiting for its partner in the row, the second place empty', () => {
    const layout = shownLayout([SUDO])
    expect(layout).toEqual({ row: [SUDO, null] })
    expect(shownPlaceOf(layout, SUDO.uid)).toBe('row0')
  })

  it('stands a sudo beside the git operation it goes with', () => {
    const layout = shownLayout([SUDO, BRANCH])
    expect(layout).toEqual({ row: [SUDO, BRANCH] })
    expect(shownPlaceOf(layout, BRANCH.uid)).toBe('row1')
  })

  it('lays an attack on its sudo at the middle', () => {
    const layout = shownLayout([SUDO, BUG])
    expect(layout).toEqual({ pair: { main: BUG, aux: SUDO, at: 'solo' } })
    expect(shownPlaceOf(layout, SUDO.uid)).toBe('solo')
  })

  it('folds a Code Review with its release in the row’s first place', () => {
    const layout = shownLayout([REVIEW, RELEASE])
    expect(layout).toEqual({ pair: { main: RELEASE, aux: REVIEW, at: 'row0' } })
    expect(shownPlaceOf(layout, RELEASE.uid)).toBe('row0')
    expect(shownPlaceOf(layout, REVIEW.uid)).toBe('row0')
  })

  it('stands a card that aims at the middle', () => {
    const layout = shownLayout([BUG])
    expect(layout).toEqual({ solo: BUG })
    expect(shownPlaceOf(layout, BUG.uid)).toBe('solo')
  })

  it('has nothing to stand when nothing is shown', () => {
    expect(shownLayout([])).toEqual({})
    expect(shownPlaceOf({}, BUG.uid)).toBeNull()
  })
})

it('spaces two and three solo owners by their occupied cards while keeping local staging at zero', () => {
  const other = { ...BUG, player: 'p3', uid: 'other-bug' }
  expect(shownPlayerOffset([BUG], 'you', 'p2')).toBe(0)
  expect(shownPlayerOffset([BUG, other], 'you', 'p2')).toBe(-84)
  expect(shownPlayerOffset([BUG, other], 'you', 'p3')).toBe(84)
  const own = { ...BUG, player: 'you', uid: 'own-bug' }
  expect(shownPlayerOffset([BUG, own, other], 'you', 'you')).toBe(0)
  expect(shownPlayerOffset([BUG, own, other], 'you', 'p2')).toBe(-168)
  expect(shownPlayerOffset([BUG, own, other], 'you', 'p3')).toBe(168)
})

it('keeps all six players inside the measured table, with distinct visible card positions', () => {
  const cards = Array.from({ length: 6 }, (_, i) => ({ ...BUG, player: `p${i}`, uid: `bug${i}` }))
  const offsets = cards.map(({ player }) => shownPlayerOffset(cards, 'p0', player, 800))
  expect(offsets[0]).toBe(0)
  expect(new Set(offsets).size).toBe(6)
  expect(Math.min(...offsets) - 75).toBeGreaterThanOrEqual(-400)
  expect(Math.max(...offsets) + 75).toBeLessThanOrEqual(400)
  expect(offsets[1]).toBeLessThan(0)
  expect(offsets[2]).toBeGreaterThan(0)
})

it('reserves the local gesture before its SHOW echo arrives', () => {
  expect(shownPlayerOffset([BUG], 'you', 'p2', 800, true)).toBeLessThan(-150)
})
