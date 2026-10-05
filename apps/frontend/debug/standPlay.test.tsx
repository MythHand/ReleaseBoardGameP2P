// THE STAND, PLAYED (#168). Plays made through the real board on the real
// engine (`standHarness.tsx`), each pinning what a recording on the stand caught.

import type { Action } from '@release/engine'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import { createScenario, DEFAULT_AI_CARD } from './scenarios'
import {
  arrowUp,
  fanUids,
  freshRelease,
  pull,
  Stand,
  type Table,
  uidOf,
  wait,
} from './standHarness'

it('Bug on a hand, on your own turn: once the attack is accepted, nothing takes it up again', async () => {
  const start = createScenario('blindStealPlay', 'stand', DEFAULT_AI_CARD)
  const sent: Action[] = []
  render(<Stand start={start} viewer="you" sent={sent} />)
  await wait(1000)

  pull(uidOf(start, 'you', 'attack-bug'))
  await wait(700)
  fireEvent.click(screen.getByTestId('seat-p2'))
  await wait(2500)

  expect(sent.map((a) => a.type)).toContain('PLAY')
  expect(sent.map((a) => a.type)).not.toContain('TAKE_BACK')
  expect(arrowUp()).toBe(false)
})

it('Bug on a fresh release: once the attack is accepted, it is not sent home', async () => {
  const state = freshRelease()
  const sent: Action[] = []
  render(<Stand start={state} viewer="p2" sent={sent} />)
  await wait(1000)

  pull(uidOf(state, 'p2', 'attack-bug'))
  await wait(4000)

  expect(sent.map((a) => a.type)).toContain('ATTACK')
  expect(sent.map((a) => a.type)).not.toContain('TAKE_BACK')
}, 15_000)

// ===== one attack at a time (resolution.md §1; #168) =====

it('a second opponent’s Bug, put out after the first one’s, is refused and goes home', async () => {
  const state = freshRelease()
  const sent: Action[] = []
  const table: { current: Table | null } = { current: null }
  render(<Stand start={state} viewer="p3" sent={sent} table={table} delayed />)
  await wait(1000)

  // this opponent puts their Bug out; it is still on its way to the table…
  const late = uidOf(state, 'p3', 'attack-bug')
  pull(late)
  await wait(100)
  // …when the first opponent's Bug reaches it
  act(() =>
    table.current?.apply({
      type: 'SHOW',
      player: 'p2',
      card: uidOf(state, 'p2', 'attack-bug'),
      at: Date.now(),
    }),
  )
  act(() => table.current?.deliver())
  await wait(3000)
  // whatever the board sent after the refusal reaches the table too
  act(() => table.current?.deliver())

  const mine = sent.filter((a) => 'player' in a && a.player === 'p3').map((a) => a.type)
  expect(mine).toContain('SHOW')
  expect(mine).not.toContain('ATTACK')
  expect(fanUids()).toContain(late)
}, 15_000)

it('a Sudo whose own time ran out goes home on its player’s screen, and the time starts anew', async () => {
  const state = freshRelease()
  const sent: Action[] = []
  const table: { current: Table | null } = { current: null }
  render(<Stand start={state} viewer="p2" sent={sent} table={table} />)
  await wait(1000)

  const sudo = uidOf(state, 'p2', 'support-sudo')
  pull(sudo)
  await wait(1000)
  expect(fanUids()).not.toContain(sudo)
  const held = table.current?.state().window
  expect(held?.held).toBe('p2')

  // the keeper's clock reaches the Sudo's own deadline
  act(() => table.current?.apply({ type: 'WINDOW_EXPIRED', at: held?.deadline ?? 0 }))
  await wait(1500)

  expect(fanUids()).toContain(sudo)
  expect(table.current?.state().window).toMatchObject({ round: 2 })
}, 15_000)
