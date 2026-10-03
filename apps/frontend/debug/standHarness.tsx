// THE STAND, FOR A TEST (#168). The real board on the real engine, wired the way
// `main.tsx` wires them, and a play made through the board's own gestures — the
// recordings that caught a play the table had accepted being taken up again
// came from exactly this, and a harness that wires only part of the board did
// not reproduce it. Shared by the stand's tests.

import type { Action, Event, GameState } from '@release/engine'
import { resources } from '@release/translation'
import { act, fireEvent } from '@testing-library/react'
import { useMemo, useRef, useState } from 'react'
import arrowStyles from '@/primitives/Arrow/Arrow.module.css'
import { toBoardOver, toBoardState } from '~/entities/game/board'
import { forViewer, rejectionsIn } from '~/network/session/audience'
import { makeBoardProps } from '~/pages/board/[gameId]/__tests__/fixture'
import Board from '~/pages/board/[gameId]/_Board'
import { createScenario, DEFAULT_AI_CARD, engine, seedLog } from './scenarios'

type Intent = Action extends infer A ? (A extends Action ? Omit<A, 'at'> : never) : never

const labels = resources.en.common.historyLabels as Record<Event['type'], string>

// The table's side, for a test to act on directly: another seat's action, or a
// deadline's, sent the way the keeper would apply it.
export interface Table {
  apply: (action: Action) => void
  state: () => GameState
  /** what this seat sent while `delayed` reaches the table now, in order */
  deliver: () => void
}

export function Stand({
  start,
  viewer,
  sent,
  table,
  delayed = false,
}: {
  start: GameState
  viewer: string
  sent: Action[]
  table?: { current: Table | null }
  // this seat's actions are on the wire until the test delivers them — the
  // round trip the stand's own instant keeper never has
  delayed?: boolean
}) {
  const [run, setRun] = useState(() => ({ state: start, events: seedLog(start) }))
  const runRef = useRef(run)
  const wire = useRef<Action[]>([])
  const [seeded] = useState(() => run.events.at(-1)?.id ?? 0)
  const apply = (action: Action) => {
    sent.push(action)
    const result = engine.reduce(runRef.current.state, action)
    runRef.current = { state: result.state, events: [...runRef.current.events, ...result.events] }
    setRun(runRef.current)
  }
  const send = (intent: Intent) => {
    const action: Action = { ...intent, at: Date.now() }
    if (delayed && intent.type !== 'CLOCK_STARTED') wire.current.push(action)
    else apply(action)
  }
  if (table)
    table.current = {
      apply,
      state: () => runRef.current.state,
      deliver: () => {
        for (const action of wire.current.splice(0)) apply(action)
      },
    }
  const view = useMemo(() => engine.project(run.state, viewer), [run.state, viewer])
  const events = useMemo(() => forViewer(run.events, viewer), [run.events, viewer])
  // the viewer's own refusals, as `main.tsx` hands them over
  const rejections = useMemo(
    () =>
      rejectionsIn(run.events).filter(
        (e) => e.type === 'rejected' && 'player' in e.action && e.action.player === viewer,
      ),
    [run.events, viewer],
  )
  const board = useMemo(() => toBoardState(view, events, labels), [view, events])
  const base = makeBoardProps()
  return (
    <Board
      state={board}
      over={toBoardOver(view)}
      now={Date.now()}
      intro={{
        gameId: `stand:${viewer}`,
        view,
        events,
        restoredThrough: seeded,
        onDone: () => send({ type: 'CLOCK_STARTED' }),
      }}
      rejections={rejections}
      room={base.room}
      copy={base.copy}
      actions={{
        onPlay: (card, target, combo) =>
          send({ type: 'PLAY', player: viewer, card, target, combo }),
        onResolve: (choice) => send({ type: 'RESOLVE', player: viewer, choice }),
        onAttack: (card, combo) => send({ type: 'ATTACK', player: viewer, card, combo }),
        onShow: (card) => send({ type: 'SHOW', player: viewer, card }),
        onTakeBack: () => send({ type: 'TAKE_BACK', player: viewer }),
      }}
    />
  )
}

export const wait = (ms: number) =>
  act(async () => {
    await new Promise((r) => setTimeout(r, ms))
  })

// Hand's own drag contract, as `boardStaging.test.tsx` drives it.
export function pull(uid: string) {
  const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${uid}"]`)
  if (!slot) throw new Error(`no fan slot for ${uid}`)
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
}

export const uidOf = (state: GameState, player: string, id: string) => {
  const uid = state.players[player].hand.find((c) => c.id === id)?.uid
  if (!uid) throw new Error(`${player} holds no ${id}`)
  return uid
}

export const arrowUp = () => document.querySelector(`.${arrowStyles.origin}`) !== null

export const fanUids = () =>
  [...document.querySelectorAll<HTMLElement>('[data-hand-slot]')].map((s) => s.dataset.handSlot)

// The release down and paid for, through the engine: the scene starts at the
// opponents' time to attack it.
export function freshRelease(): GameState {
  let state = createScenario('release', 'stand', DEFAULT_AI_CARD)
  const step = (action: Action) => {
    state = engine.reduce(state, action).state
  }
  step({ type: 'CLOCK_STARTED', at: Date.now() })
  step({
    type: 'PLAY',
    player: 'you',
    card: uidOf(state, 'you', 'release-frontend'),
    at: Date.now(),
  })
  step({
    type: 'RESOLVE',
    player: 'you',
    choice: { kind: 'discardForRelease', card: uidOf(state, 'you', 'support-code-review') },
    at: Date.now(),
  })
  if (!state.window) throw new Error('the release opened no time to attack it')
  return state
}
