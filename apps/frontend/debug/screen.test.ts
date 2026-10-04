import { afterEach, expect, it } from 'vitest'
import { readScreen } from './screen'

// The screen reader knows no beat and no case: it names where each visible card
// stands by what marks the page around it, and notices a card shown twice.

afterEach(() => {
  document.body.innerHTML = ''
})

it('says where each card stands, by the places marked around it', () => {
  document.body.innerHTML = `
    <div data-testid="board-table">
      <div data-hand-slot="attack-bug#6"><div data-card="attack-bug"></div></div>
      <div data-board-centre><div data-pending-play><div data-card="defense-hotfix"></div></div></div>
      <div class="_flyer_x1y2"><div data-card="attack-bug"></div></div>
      <div data-testid="seat-p2"><div data-face-down></div></div>
    </div>`
  const frame = readScreen()
  expect(frame.cards).toEqual({
    'fan<board-table': ['attack-bug#6'],
    'pending<centre<board-table': ['defense-hotfix'],
    'flyer<board-table': ['attack-bug'],
    'seat-p2<board-table': ['back'],
  })
  // the copy in the fan and a copy in the air the page does not name: one card twice
  expect(frame.twice).toEqual(['attack-bug'])
})

// HOW EACH CARD LIES, beside where it stands: its angle and its layer — the
// order the page paints the cards in, which is what says which covers which.
// The heap names its own layers; a carrier in the air is painted over them all,
// though the page holds it first.
it('says how each card lies: its angle, and which card is painted over which', () => {
  document.body.innerHTML = `
    <div class="_flyer_x1y2" style="position: fixed; z-index: 50; transform: rotate(-4deg)">
      <div data-card="attack-ddos"></div>
    </div>
    <div class="_box_a1">
      <div class="_heapCard_b2" style="position: absolute; z-index: 1; transform: rotate(7deg)">
        <div data-card="attack-bug"></div>
      </div>
      <div class="_heapCard_b2" style="position: absolute; z-index: 0; transform: rotate(-3deg)">
        <div data-card="defense-hotfix"></div>
      </div>
    </div>`
  const frame = readScreen()
  expect(frame.cards['heapCard<box']).toEqual(['attack-bug', 'defense-hotfix'])
  // the angle each is drawn at
  expect(frame.poses['heapCard<box'].map((p) => p[3])).toEqual([7, -3])
  expect(frame.poses.flyer[0][3]).toBe(-4)
  // the layer: the Hotfix under the Bug though the page holds it later, and the
  // carrier over both though the page holds it first
  expect(frame.poses['heapCard<box'].map((p) => p[4])).toEqual([1, 0])
  expect(frame.poses.flyer[0][4]).toBe(2)
})

it('does not take two named copies of one card for one card drawn twice', () => {
  document.body.innerHTML = `
    <div data-hand-slot="defense-hotfix#1"><div data-card="defense-hotfix"></div></div>
    <div data-hand-slot="defense-hotfix#2"><div data-card="defense-hotfix"></div></div>
    <div data-testid="cherry-cell-defense-hotfix#1"><div data-card="defense-hotfix"></div></div>`
  const frame = readScreen()
  expect(frame.cards.fan).toEqual(['defense-hotfix#1', 'defense-hotfix#2'])
  // …but the same named copy in two places is
  expect(frame.twice).toEqual(['defense-hotfix'])
})
