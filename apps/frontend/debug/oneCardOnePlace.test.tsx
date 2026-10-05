// ONE CARD, ONE PLACE — the plays the stand's recordings caught breaking it
// (#168, 02.10), played through the real board on the real engine and watched
// after every change to the page (`sentinel.ts`). Each names the cards it
// watches; each must end with nothing to report.

import type { Action, GameState } from '@release/engine'
import { act, fireEvent, render } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createScenario, DEFAULT_AI_CARD, engine } from './scenarios'
import { watchCards } from './sentinel'
import { freshRelease, pull, Stand, type Table, uidOf, wait } from './standHarness'

const now = () => Date.now()

function mount(start: GameState, viewer: string) {
  const sent: Action[] = []
  const table: { current: Table | null } = { current: null }
  render(<Stand start={start} viewer={viewer} sent={sent} table={table} />)
  const apply = (action: Action) => act(() => table.current?.apply(action))
  return { apply, state: () => table.current?.state() as GameState }
}

// The fan's own click: pressed and let go without moving (Hand's `onSlotDown`)
const click = (uid: string) => {
  const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${uid}"]`)
  if (!slot) throw new Error(`no fan slot for ${uid}`)
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: 0 })
}

it('Bug thrown at a fresh release: one place all the way to the centre', async () => {
  const start = freshRelease()
  mount(start, 'p2')
  await wait(1000)
  const watch = watchCards(['attack-bug'])
  pull(uidOf(start, 'p2', 'attack-bug'))
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 20_000)

it('Sudo folded with Bug and thrown at a fresh release: one place each', async () => {
  const start = freshRelease()
  mount(start, 'p2')
  await wait(1000)
  const watch = watchCards(['attack-bug', 'support-sudo'])
  pull(uidOf(start, 'p2', 'support-sudo'))
  await wait(1000)
  click(uidOf(start, 'p2', 'attack-bug'))
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 20_000)

// What the stand recorded here — the attack drawn at the centre under its own
// copy flying to the discard, for the whole flight — needs that flight, and this
// page plays none: the exit lands at once. The play is still walked to its end.
it('a hit taken: the attack leaves the centre for the discard in one place', async () => {
  let start = freshRelease()
  const bug = uidOf(start, 'p2', 'attack-bug')
  for (const action of [
    { type: 'SHOW', player: 'p2', card: bug, at: now() },
    { type: 'ATTACK', player: 'p2', card: bug, at: now() },
  ] as Action[])
    start = engine.reduce(start, action).state
  const { apply } = mount(start, 'you')
  await wait(1000)
  const watch = watchCards(['attack-bug', 'release-frontend'])
  apply({ type: 'RESOLVE', player: 'you', choice: { kind: 'defend', card: null }, at: now() })
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 20_000)

it('a Crush not answered: the release leaves its zone in one place', async () => {
  const start = createScenario('aiTrigger', 'stand', DEFAULT_AI_CARD)
  const { apply } = mount(start, 'you')
  await wait(1000)
  const watch = watchCards(['release-frontend', 'ai-crush-frontend', 'trigger-ai'])
  apply({ type: 'DRAW', player: 'you', pile: 0, at: now() })
  await wait(6000)
  apply({ type: 'PASS', player: 'you', at: now() })
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 30_000)

// What the stand recorded here — the Debugger back in the fan for the whole of
// its flight to the discard — needs that flight too; this page lands it at once.
it('Error 503 answered with the Debugger: the Debugger leaves the fan in one place', async () => {
  const start = createScenario('alarm503', 'stand', DEFAULT_AI_CARD)
  const { apply } = mount(start, 'you')
  await wait(1000)
  const watch = watchCards(['protection-debugger', 'trigger-error-503'])
  apply({ type: 'DRAW', player: 'you', pile: 0, at: now() })
  await wait(3000)
  // answered the way the stand answers it: the Debugger pulled out of the fan
  pull(uidOf(start, 'you', 'protection-debugger'))
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 30_000)

// What the stand recorded here — the operation going from its carrier to the
// row and up into a carrier again — needs the operation beat to stand it, and on
// this page, where every place measures nothing, the beat gives way to the
// projection. The play is still walked to the table.
it('Cherry-pick played with Sudo: the operation stands at the centre in one place', async () => {
  const dealt = createScenario('cherry', 'stand', DEFAULT_AI_CARD)
  // one Cherry-pick on the table, so the card the watch follows is the only one
  const hand = dealt.players.you.hand
  const second = hand.filter((c) => c.id === 'operation-git-cherry-pick')[1]
  const start: GameState = {
    ...dealt,
    players: {
      ...dealt.players,
      you: { ...dealt.players.you, hand: hand.filter((c) => c !== second) },
    },
  }
  mount(start, 'you')
  await wait(1000)
  const watch = watchCards(['operation-git-cherry-pick', 'support-sudo'])
  pull(uidOf(start, 'you', 'support-sudo'))
  await wait(1000)
  click(uidOf(start, 'you', 'operation-git-cherry-pick'))
  await wait(4000)
  expect(watch.check()).toEqual([])
}, 20_000)
