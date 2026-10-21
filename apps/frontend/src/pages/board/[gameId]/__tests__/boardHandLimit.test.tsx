// The hand limit on the board (#104): while the engine owes us the decision,
// the fan is the picker. A pull takes a cell in the grid; at the limit the fan
// refuses the drop and the kit glides the card home; the last card dispatches
// one RESOLVE carrying every uid.
//
// Reduced motion defaults ON here: most assertions are about what the board
// DID rather than about elapsed animation. The concurrency test turns it off
// and parks both carriers before landing, so the promise that one flight never
// blocks the next pull is tested directly.
import type { Event } from '@release/engine'
import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import handArrivalStyles from '@/animations/useHandArrival.module.css'
import type { BoardActions } from '~/entities/game/board'
import Board from '../_Board'
import { introFixture, makeBoardProps } from './fixture'

const motion = vi.hoisted(() => ({ reduced: true }))
const flights = vi.hoisted(() => ({
  release: [] as (() => void)[],
  raises: [] as string[][],
  // the node each raised carrier stands on, by its key — what a card still in
  // the air is carried on by when the keeper answers for us
  els: new Map<string, HTMLDivElement>(),
}))
const arrivals = vi.hoisted(() => ({ refuse: false }))
const exits = vi.hoisted(() => ({ items: [] as string[][], release: () => {} }))

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...actual,
    useHandArrival: (...args: Parameters<typeof actual.useHandArrival>) => {
      const step = actual.useHandArrival(...args)
      return arrivals.refuse ? { ...step, arrive: async () => false } : step
    },
    nextFrames: () => new Promise<void>((resolve) => setTimeout(resolve, 0)),
    wait: () => Promise.resolve(),
    useDiscardExit: () => ({
      overlay: [],
      send: (items: { key: string }[]) => {
        exits.items.push(items.map((item) => item.key))
        return new Promise<void>((resolve) => {
          exits.release = resolve
        })
      },
      reset: () => {},
      FLIGHT_MS: 0,
    }),
    useFlyer: () => ({
      overlay: [],
      raise: (items: { key: string }[]) => {
        flights.raises.push(items.map((item) => item.key))
        const els = items.map((item) => {
          const el = document.createElement('div')
          flights.els.set(item.key, el)
          return el
        })
        return new Promise<HTMLDivElement[]>((resolve) => {
          flights.release.push(() => resolve(els))
        })
      },
      elOf: (key: string) => flights.els.get(key) ?? null,
      pin: () => {},
      glide: () => Promise.resolve(),
      patch: () => {},
      drop: () => {},
    }),
  }
})

// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const bug = cardById('attack-bug')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const debugger_ = cardById('protection-debugger')!
// biome-ignore lint/style/noNonNullAssertion: known catalogue entries
const hotfix = cardById('defense-hotfix')!

const HAND: { uid: string; card: CardData }[] = [
  { uid: 'attack-bug#0', card: bug },
  { uid: 'protection-debugger#0', card: debugger_ },
  { uid: 'defense-hotfix#0', card: hotfix },
]

function boardOverLimit(
  excess: number,
  actions: BoardActions = {},
  events: Event[] = [],
  pending = true,
  intro?: ReturnType<typeof handLimitIntro>,
) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: { ...base.state.you, hand: HAND },
          turn: base.state.selfId,
          hasDrawn: true,
          pending: pending
            ? {
                kind: 'handLimit',
                player: base.state.selfId,
                excess,
                options: HAND.map((c) => c.uid),
              }
            : null,
        },
        actions,
        intro:
          intro ??
          (events.length > 0 ? { gameId: null, view: null, events, onDone: () => {} } : undefined),
      })}
    />
  )
}

function handLimitIntro(events: Event[] = []) {
  return { gameId: 'hand-limit-handoff', view: introFixture().view, events, onDone: vi.fn() }
}

function boardAfterAcceptedHandLimit(events: Event[], intro: ReturnType<typeof handLimitIntro>) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: { ...base.state.you, hand: [HAND[2]] },
          turn: base.state.selfId,
          hasDrawn: true,
          pending: null,
          decks: { ...base.state.decks, discardCount: 2 },
        },
        intro: { ...intro, events },
      })}
    />
  )
}

// The same drag the kit's own contract expects: down on the slot, past Hand's
// 6px threshold, released well outside the hand's band.
async function pullCardFromFan(index: number) {
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

const fanSlots = () => document.querySelectorAll('[data-hand-slot]').length
const filledCells = () => document.querySelectorAll('[data-grid-card]').length

function rejectedHandLimit(cards: string[], player = 'you', id = 9): Event {
  return {
    id,
    type: 'rejected',
    action: {
      type: 'RESOLVE',
      player,
      choice: { kind: 'handLimit', cards },
      at: 0,
    },
    reason: 'illegal',
  }
}

function acceptedHandLimit(): Event[] {
  return [
    { id: 10, type: 'discarded', player: 'you', card: 'attack-bug', reason: 'handLimit' },
    {
      id: 11,
      type: 'discarded',
      player: 'you',
      card: 'protection-debugger',
      reason: 'handLimit',
    },
  ] as Event[]
}

it.each([
  {
    name: "another player's",
    event: rejectedHandLimit(['attack-bug#0'], 'p2', 10),
  },
  {
    name: 'a different card list',
    event: rejectedHandLimit(['protection-debugger#0'], 'you', 10),
  },
])('keeps the local grid locked for $name rejection', async ({ event }) => {
  const onResolve = vi.fn()
  const actions = { onResolve }
  // An exact rejection already in the feed is stale for this dispatch and must
  // stay ignored alongside the fresh non-matching event under test.
  const stale = rejectedHandLimit(['attack-bug#0'], 'you', 8)
  const view = render(boardOverLimit(1, actions, [stale]))
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledTimes(1)

  view.rerender(boardOverLimit(1, actions, [stale, event]))
  await act(async () => {})
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)
})

it('keeps a two-card grid locked for a reversed rejection and unlocks for exact order', async () => {
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(2, actions))
  await pullCardFromFan(0)
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'handLimit',
    cards: ['attack-bug#0', 'protection-debugger#0'],
  })
  expect(filledCells()).toBe(2)

  const reversed = rejectedHandLimit(['protection-debugger#0', 'attack-bug#0'], 'you', 10)
  view.rerender(boardOverLimit(2, actions, [reversed]))
  await act(async () => {})
  expect(filledCells()).toBe(2)
  expect(fanSlots()).toBe(HAND.length - 2)

  const exact = rejectedHandLimit(['attack-bug#0', 'protection-debugger#0'], 'you', 11)
  view.rerender(boardOverLimit(2, actions, [reversed, exact]))
  await act(async () => {})
  expect(filledCells()).toBe(0)
  expect(fanSlots()).toBe(HAND.length)
})

it('a pull under the limit takes a cell in the grid', async () => {
  render(boardOverLimit(2))
  await pullCardFromFan(0)
  expect(screen.getByTestId('board-discard-grid')).toBeTruthy()
  // the grid was sized for the WHOLE excess before the first card moved
  expect(document.querySelectorAll('[data-grid-cell]')).toHaveLength(2)
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)
})

it('refuses the drop once the limit is met and the fan keeps the card', async () => {
  render(boardOverLimit(1))
  await pullCardFromFan(0)
  expect(fanSlots()).toBe(HAND.length - 1)
  // one card was owed and one is placed: this pull is refused, and the kit
  // settles the card back into its own slot (Hand.tsx's own glide)
  await pullCardFromFan(0)
  expect(fanSlots()).toBe(HAND.length - 1)
  expect(filledCells()).toBe(1)
})

it('dispatches one RESOLVE with exactly the excess when the last cell fills', async () => {
  const onResolve = vi.fn()
  render(boardOverLimit(2, { onResolve }))
  await pullCardFromFan(0)
  expect(onResolve).not.toHaveBeenCalled()
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledTimes(1)
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'handLimit',
    cards: ['attack-bug#0', 'protection-debugger#0'],
  })
})

it('accepts another pull while the previous card is still in flight', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  render(boardOverLimit(2, { onResolve }))

  await pullCardFromFan(0)
  expect(flights.release).toHaveLength(1)
  await pullCardFromFan(0)

  // Both cards left the fan even though neither carrier has landed. A
  // single-flight guard would leave one card behind and one pending resolver.
  expect(flights.release).toHaveLength(2)
  expect(fanSlots()).toBe(HAND.length - 2)
  expect(onResolve).not.toHaveBeenCalled()

  await act(async () => {
    for (const land of flights.release.splice(0)) land()
    await new Promise((r) => setTimeout(r, 80))
  })
  expect(onResolve).toHaveBeenCalledTimes(1)
  motion.reduced = true
})

it('invalidates a parked flight when the pending clears before landing', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))

  try {
    await pullCardFromFan(0)
    expect(flights.release).toHaveLength(1)
    const staleLand = flights.release.shift()

    view.rerender(boardOverLimit(1, actions, [], false))
    await act(async () => {})
    expect(screen.queryByTestId('board-discard-grid')).toBeNull()
    expect(fanSlots()).toBe(HAND.length)

    await act(async () => {
      staleLand?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(screen.queryByTestId('board-discard-grid')).toBeNull()
    expect(onResolve).not.toHaveBeenCalled()

    // A later decision starts from a clean generation: the stale landing above
    // cannot leave a hidden placed card or a landed count behind it.
    view.rerender(boardOverLimit(1, actions))
    await pullCardFromFan(0)
    expect(flights.release).toHaveLength(1)
    await act(async () => {
      flights.release.shift()?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(onResolve).toHaveBeenCalledTimes(1)
    expect(onResolve).toHaveBeenCalledWith({ kind: 'handLimit', cards: ['attack-bug#0'] })
  } finally {
    motion.reduced = true
  }
})

it('unlocks and returns the cards when the engine rejects the RESOLVE', async () => {
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))
  await pullCardFromFan(0)
  expect(filledCells()).toBe(1)
  expect(fanSlots()).toBe(HAND.length - 1)

  view.rerender(boardOverLimit(1, actions, [rejectedHandLimit(['attack-bug#0'])]))
  await act(async () => {})
  expect(filledCells()).toBe(0)
  expect(fanSlots()).toBe(HAND.length)
})

it('opens a fan gap while a rejected card animates home', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))

  try {
    await pullCardFromFan(0)
    await act(async () => {
      flights.release.shift()?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(filledCells()).toBe(1)
    const before = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[1]?.style.transform

    view.rerender(boardOverLimit(1, actions, [rejectedHandLimit(['attack-bug#0'])]))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })

    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeTruthy()
    const during = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[1]?.style.transform
    expect(during).not.toBe(before)

    await act(async () => {
      await new Promise((r) => setTimeout(r, 520))
    })
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeNull()
    expect(fanSlots()).toBe(HAND.length)
  } finally {
    motion.reduced = true
  }
})

it('restores every rejected uid when only some grid cells have return geometry', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(2, actions))

  try {
    await pullCardFromFan(0)
    await pullCardFromFan(0)
    await act(async () => {
      for (const land of flights.release.splice(0)) land()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(onResolve).toHaveBeenCalledWith({
      kind: 'handLimit',
      cards: ['attack-bug#0', 'protection-debugger#0'],
    })

    const missing = document.querySelector<HTMLElement>('[data-grid-cell="1"]')
    if (!missing) throw new Error('missing second grid cell')
    vi.spyOn(missing, 'getBoundingClientRect').mockReturnValueOnce(undefined as unknown as DOMRect)
    view.rerender(
      boardOverLimit(2, actions, [rejectedHandLimit(['attack-bug#0', 'protection-debugger#0'])]),
    )
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeTruthy()

    await act(async () => {
      await new Promise((r) => setTimeout(r, 520))
    })
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeNull()
    // Geometry controls what can animate, never which rejected UIDs recover.
    expect(fanSlots()).toBe(HAND.length)
  } finally {
    motion.reduced = true
  }
})

it('invalidates a returning carrier when the pending clears before it lands', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))

  try {
    await pullCardFromFan(0)
    await act(async () => {
      flights.release.shift()?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(onResolve).toHaveBeenCalledTimes(1)

    view.rerender(boardOverLimit(1, actions, [rejectedHandLimit(['attack-bug#0'])]))
    await act(async () => {
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeTruthy()

    view.rerender(boardOverLimit(1, actions, [], false))
    await act(async () => {})
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeNull()
    expect(fanSlots()).toBe(HAND.length)

    // The old arrival's timer may still settle internally. A new decision must
    // keep its own picked uid and dispatch independently when its carrier lands.
    view.rerender(boardOverLimit(1, actions))
    await pullCardFromFan(0)
    expect(fanSlots()).toBe(HAND.length - 1)
    expect(flights.release).toHaveLength(1)
    await act(async () => {
      flights.release.shift()?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(onResolve).toHaveBeenCalledTimes(2)
    expect(onResolve).toHaveBeenLastCalledWith({
      kind: 'handLimit',
      cards: ['attack-bug#0'],
    })
  } finally {
    motion.reduced = true
  }
})

it('cleans up synchronously when a rejected-card arrival is refused', async () => {
  motion.reduced = false
  flights.release = []
  const onResolve = vi.fn()
  const actions = { onResolve }
  const view = render(boardOverLimit(1, actions))

  try {
    await pullCardFromFan(0)
    await act(async () => {
      flights.release.shift()?.()
      await new Promise((r) => setTimeout(r, 80))
    })
    expect(filledCells()).toBe(1)

    arrivals.refuse = true
    view.rerender(boardOverLimit(1, actions, [rejectedHandLimit(['attack-bug#0'])]))
    await act(async () => {})

    expect(filledCells()).toBe(0)
    expect(fanSlots()).toBe(HAND.length)
    expect(document.querySelector(`.${handArrivalStyles.arriving}`)).toBeNull()
  } finally {
    arrivals.refuse = false
    motion.reduced = true
  }
})

it('clears the local grid when reduced motion skips the beat', async () => {
  const view = render(boardOverLimit(1))
  await pullCardFromFan(0)
  expect(filledCells()).toBe(1)

  // The accepted projection clears the pending. With reduced motion the queue
  // runs no hand-limit beat, so the hook's own catch-up is the only release.
  view.rerender(boardOverLimit(1, {}, [], false))
  await act(async () => {})
  expect(screen.queryByTestId('board-discard-grid')).toBeNull()
  expect(fanSlots()).toBe(HAND.length)
})

// Bad Vibe-Coding's own case: one card, mid-turn, no turn ending behind it.
it('plays the same gesture for a mid-turn single card', async () => {
  const onResolve = vi.fn()
  render(boardOverLimit(1, { onResolve }))
  await pullCardFromFan(0)
  expect(onResolve).toHaveBeenCalledWith({ kind: 'handLimit', cards: ['attack-bug#0'] })
})

// The seam (#104): once the RESOLVE is out, the grid the player filled is what
// the beat flies — so the page must be offering it. Asserted through the board's
// own render rather than the ref: the cells are still standing and still hold
// their cards after the dispatch, which is exactly what the beat measures.
it('keeps the filled grid standing after the dispatch, for the beat to take', async () => {
  render(boardOverLimit(2, { onResolve: vi.fn() }))
  await pullCardFromFan(0)
  await pullCardFromFan(0)
  expect(screen.getByTestId('board-discard-grid')).toBeTruthy()
  expect(filledCells()).toBe(2)
  // and the fan does not get them back while it stands
  expect(fanSlots()).toBe(HAND.length - 2)
})

it('stops advertising a grid card as grabbable once the choice is dispatched', async () => {
  render(boardOverLimit(2, { onResolve: vi.fn() }))
  await pullCardFromFan(0)
  expect(document.querySelector('[data-grid-card]')?.getAttribute('data-grabbable')).toBe('true')

  await pullCardFromFan(0)
  const locked = Array.from(document.querySelectorAll('[data-grid-card]'))
  expect(locked).toHaveLength(2)
  expect(locked.every((card) => card.getAttribute('data-grabbable') == null)).toBe(true)
})

it('hands the local grid straight to the accepted discard beat', async () => {
  flights.raises = []
  exits.items = []
  exits.release = () => {}
  const onResolve = vi.fn()
  const intro = handLimitIntro()
  const view = render(boardOverLimit(2, { onResolve }, [], true, intro))
  try {
    await vi.waitFor(() => expect(intro.onDone).toHaveBeenCalledTimes(1))
    await pullCardFromFan(0)
    await pullCardFromFan(0)
    expect(onResolve).toHaveBeenCalledWith({
      kind: 'handLimit',
      cards: ['attack-bug#0', 'protection-debugger#0'],
    })

    // The picker was deliberately reduced, but the accepted batch must run.
    motion.reduced = false
    await act(async () => {
      view.rerender(boardAfterAcceptedHandLimit(acceptedHandLimit(), intro))
      await Promise.resolve()
    })
    await vi.waitFor(() => expect(exits.items.length + flights.raises.length).toBeGreaterThan(0))

    // Adoption sends the cards that are already standing. A missing board
    // handoff would reconstruct that grid from fan-origin flyers instead.
    expect(flights.raises).toEqual([])
    await vi.waitFor(() => expect(exits.items).toEqual([['d10', 'd11']]))

    // `send` is deliberately parked: the static grid must already be gone while
    // the discard exit owns the handover, but the fan remains filtered.
    await vi.waitFor(() => expect(screen.queryByTestId('board-discard-grid')).toBeNull())
    expect(fanSlots()).toBe(HAND.length - 2)

    exits.release()
    await act(async () => {})
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('hands off when onResolve synchronously advances to the accepted projection', async () => {
  flights.raises = []
  exits.items = []
  exits.release = () => {}
  const intro = handLimitIntro()
  let rerender: ReturnType<typeof render>['rerender'] = () => {}
  const onResolve = vi.fn(() => {
    // The keeper can accept its own action synchronously. This rerender happens
    // in the same turn as `finish()`, before Board's later handoff layout effect
    // has published the now-dispatched grid ref.
    motion.reduced = false
    rerender(boardAfterAcceptedHandLimit(acceptedHandLimit(), intro))
  })
  const view = render(boardOverLimit(2, { onResolve }, [], true, intro))
  rerender = view.rerender

  try {
    await vi.waitFor(() => expect(intro.onDone).toHaveBeenCalledTimes(1))
    await pullCardFromFan(0)
    await pullCardFromFan(0)

    expect(onResolve).toHaveBeenCalledWith({
      kind: 'handLimit',
      cards: ['attack-bug#0', 'protection-debugger#0'],
    })
    await vi.waitFor(() => expect(exits.items.length + flights.raises.length).toBeGreaterThan(0))

    expect(flights.raises).toEqual([])
    await vi.waitFor(() => expect(exits.items).toEqual([['d10', 'd11']]))
    await vi.waitFor(() => expect(screen.queryByTestId('board-discard-grid')).toBeNull())

    exits.release()
    await act(async () => {})
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('explains excess discards until the hand limit is satisfied without a panel', async () => {
  render(boardOverLimit(2))
  const copy = makeBoardProps().copy
  const ask = screen.getByTestId('board-ask')
  expect(ask.textContent).toBe(copy.table.askHandLimit)
  expect(ask.getAttribute('data-shown')).toBe('true')
  await pullCardFromFan(0)
  expect(ask.getAttribute('data-shown')).toBe('true')
  await pullCardFromFan(0)
  expect(ask.getAttribute('data-shown')).toBe('false')
  expect(ask.hasAttribute('inert')).toBe(true)
  // the cards on the table are the question — a panel would ask it twice, and
  // would cover the grid it is asking about
  expect(screen.queryByText(copy.pending.handLimit.prompt)).toBeNull()
})

// THE KEEPER ANSWERED WHILE A CARD WAS STILL IN OUR HANDS (#266, ditayler's P2).
// The answer carries that very card on from where it is; it never flies a second
// copy of it out of the fan, and the landing it was heading for sends nothing.
// a condition polled until it holds — the helpers below wait on the board, and
// the tests that call them make the assertions
async function until(holds: () => boolean | Promise<boolean>) {
  await vi.waitFor(async () => {
    if (!(await holds())) throw new Error('not yet')
  })
}

async function keeperAnswersMidFlight(pulls: number, landFirst: boolean) {
  motion.reduced = true
  flights.raises = []
  flights.release = []
  flights.els.clear()
  exits.items = []
  exits.release = () => {}
  const onResolve = vi.fn()
  const onDraft = vi.fn()
  const actions = { onResolve, onDraft }
  const intro = handLimitIntro()
  const view = render(boardOverLimit(2, actions, [], true, intro))
  await until(() => intro.onDone.mock.calls.length === 1)
  motion.reduced = false
  view.rerender(boardOverLimit(2, actions, [], true, intro))
  for (let i = 0; i < pulls; i++) {
    await pullCardFromFan(0)
    if (landFirst && i === 0) {
      await act(async () => {
        flights.release.shift()?.()
        await new Promise((r) => setTimeout(r, 80))
      })
    }
  }
  await act(async () => {
    view.rerender(boardAfterAcceptedHandLimit(acceptedHandLimit(), intro))
    await Promise.resolve()
  })
  // every parked raise comes down — the gesture's own, still in the air, and
  // whatever the answer raised for itself
  await until(async () => {
    await act(async () => {
      for (const land of flights.release.splice(0)) land()
      await new Promise((r) => setTimeout(r, 20))
    })
    return exits.items.length > 0
  })
  return { onResolve, onDraft }
}

it('carries a card still in the air to its cell on into the keeper answer', async () => {
  try {
    const { onResolve } = await keeperAnswersMidFlight(1, false)
    expect(exits.items).toEqual([['d10', 'd11']])
    // the Bug was in the air (`hl1`): carried on, not raised again; only the
    // keeper's own pick, the Debugger, flies out of the fan
    expect(flights.raises).toEqual([['hl1'], ['hl11']])
    // the landing it was flying to sent no answer of its own
    expect(onResolve).not.toHaveBeenCalled()
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('carries the card in the air on beside the one already in the grid', async () => {
  try {
    const { onResolve } = await keeperAnswersMidFlight(2, true)
    expect(exits.items).toEqual([['d10', 'd11']])
    // the Bug stands in its cell, the Debugger was in the air: nothing else is raised
    expect(flights.raises).toEqual([['hl1'], ['hl2']])
    expect(onResolve).not.toHaveBeenCalled()
  } finally {
    exits.release()
    motion.reduced = true
  }
})

// The keeper's answer arriving while a card of the hand limit is on our CURSOR.
function answerWith(events: Event[], hand: typeof HAND, intro: ReturnType<typeof handLimitIntro>) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: { ...base.state.you, hand },
          turn: base.state.selfId,
          hasDrawn: true,
          pending: null,
          decks: { ...base.state.decks, discardCount: 2 },
        },
        intro: { ...intro, events },
      })}
    />
  )
}
const discarded = (id: number, card: string): Event =>
  ({ id, type: 'discarded', player: 'you', card, reason: 'handLimit' }) as Event

async function onTheCursor(
  take: () => void,
  events: Event[],
  hand: typeof HAND,
  before: (actions: { onDraft: ReturnType<typeof vi.fn> }) => Promise<void> = async () => {},
) {
  flights.raises = []
  flights.release = []
  flights.els.clear()
  exits.items = []
  exits.release = () => {}
  const onResolve = vi.fn()
  const onDraft = vi.fn()
  const actions = { onResolve, onDraft }
  const intro = handLimitIntro()
  const view = render(boardOverLimit(2, actions, [], true, intro))
  await until(() => intro.onDone.mock.calls.length === 1)
  await before({ onDraft })
  motion.reduced = false
  view.rerender(boardOverLimit(2, actions, [], true, intro))
  take()
  await act(async () => {
    view.rerender(answerWith(events, hand, intro))
    await Promise.resolve()
  })
  await until(async () => {
    await act(async () => {
      for (const land of flights.release.splice(0)) land()
      await new Promise((r) => setTimeout(r, 20))
    })
    return exits.items.length > 0
  })
  return { onResolve, onDraft }
}

it('takes a card carried back out of the grid off the choice, and carries it on if discarded', async () => {
  try {
    const { onResolve } = await onTheCursor(
      () => {
        const cell = document.querySelector<HTMLElement>('[data-grid-card="attack-bug#0"]')
        if (!cell) throw new Error('missing grid card')
        fireEvent.mouseDown(cell, { clientX: 0, clientY: 0 })
      },
      acceptedHandLimit(),
      [HAND[2]],
      async ({ onDraft }) => {
        await pullCardFromFan(0)
        expect(onDraft).toHaveBeenLastCalledWith({ kind: 'handLimit', cards: ['attack-bug#0'] })
      },
    )
    // carried on from the cursor into its cell: only the Debugger left the fan
    expect(flights.raises).toEqual([['hl11']])
    // letting go of the mouse afterwards answers nothing
    fireEvent.mouseUp(window, { clientX: 0, clientY: 0 })
    await act(async () => {})
    expect(onResolve).not.toHaveBeenCalled()
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('tells the keeper a card carried back out of the grid is no longer chosen', async () => {
  const onDraft = vi.fn()
  const actions = { onDraft }
  render(boardOverLimit(2, actions))
  await pullCardFromFan(0)
  expect(onDraft).toHaveBeenLastCalledWith({ kind: 'handLimit', cards: ['attack-bug#0'] })
  const cell = document.querySelector<HTMLElement>('[data-grid-card="attack-bug#0"]')
  if (!cell) throw new Error('missing grid card')
  fireEvent.mouseDown(cell, { clientX: 0, clientY: 0 })
  await act(async () => {})
  expect(onDraft).toHaveBeenLastCalledWith({ kind: 'handLimit', cards: [] })
})

// held in the fan, not yet let go of
const holdInFan = (index: number) => () => {
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
}

it('carries a card held in the fan on into a cell when the keeper discards it', async () => {
  try {
    const { onResolve } = await onTheCursor(holdInFan(0), acceptedHandLimit(), [HAND[2]])
    // the Bug came off the cursor; only the Debugger flew out of the fan
    expect(flights.raises).toEqual([['hl11']])
    fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
    await act(async () => {})
    expect(onResolve).not.toHaveBeenCalled()
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('sends a card held in the fan home when the keeper discards two others', async () => {
  try {
    await onTheCursor(
      holdInFan(0),
      [discarded(10, 'protection-debugger'), discarded(11, 'defense-hotfix')],
      [HAND[0]],
    )
    // both the keeper's cards came out of the fan; the held Bug was not one of them
    expect(flights.raises).toEqual([['hl10', 'hl11']])
    // …and it glides back into its place in the fan from under the cursor
    await act(async () => {
      await new Promise((r) => setTimeout(r, 600))
    })
    expect(document.querySelector('[data-hand-slot]')).not.toBeNull()
    expect(fanSlots()).toBe(1)
  } finally {
    exits.release()
    motion.reduced = true
  }
})

it('takes no new card into the grid while the keeper answer plays', async () => {
  try {
    const { onResolve, onDraft } = await keeperAnswersMidFlight(1, false)
    const raised = flights.raises.length
    const drafts = onDraft.mock.calls.length
    // the exit is parked: the answer is still on the table
    await pullCardFromFan(0)
    expect(flights.raises).toHaveLength(raised)
    expect(onDraft).toHaveBeenCalledTimes(drafts)
    expect(onResolve).not.toHaveBeenCalled()
  } finally {
    exits.release()
    motion.reduced = true
  }
})
