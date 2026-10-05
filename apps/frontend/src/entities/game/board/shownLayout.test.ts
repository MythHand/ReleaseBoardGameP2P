import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import { type ShownCard, shownLayout, shownPlaceOf } from './shownLayout'

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
