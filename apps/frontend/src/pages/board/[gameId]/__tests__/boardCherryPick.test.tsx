// THE GRID THAT ANSWERS GIT CHERRY-PICK'S OWN PICK (#108). Cherry-pick
// (`operation-git-cherry-pick`) raises the same `pickFromDiscard` kind Inside
// does (`boardAi.test.tsx`'s own describe block), but over the whole discard
// rather than its releases, and under sudo takes two — a shape
// `_useInsideStaging`'s row was never built for. `_useCherryPickStaging`
// gives it a sibling surface rather than widening that row.
import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { mockReducedMotion } from '~/test/reducedMotion'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The opening is outside this test; keep the real board and event queue.
vi.mock('~/features/game-intro/useDealIntro', () => ({
  useDealIntro: ({ onDone }: { onDone: () => void }) => {
    useEffect(onDone, [onDone])
    return {
      active: false,
      beat: null,
      shadow: null,
      staged: [],
      overlays: null,
      gapAt: null,
      gapSize: 0,
      faceDown: () => false,
    }
  },
}))
const exits = vi.hoisted(() => ({
  items: [] as string[][],
  // …and what each card was sent to: the pose it lands on, the layer it rides
  sent: [] as { key: string; scatter?: { rot: number }; layer?: number }[],
  pending: null as Promise<void> | null,
}))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...actual,
    useDiscardExit: () => ({
      overlay: [],
      send: (items: { key: string; scatter?: { rot: number }; layer?: number }[]) => {
        exits.items.push(items.map((item) => item.key))
        exits.sent.push(...items)
        return exits.pending ?? Promise.resolve()
      },
      reset: () => {},
      FLIGHT_MS: 0,
    }),
  }
})

// The deal out of the discard comes first — the scene's own `deal` phase — and
// the selection states, badges and the confirm bar wait for it to finish.
const DEAL_WAIT = 800
async function afterDeal() {
  await act(async () => {
    if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(DEAL_WAIT)
    else await new Promise((resolve) => setTimeout(resolve, DEAL_WAIT))
  })
}

it.each([
  1, 2,
] as const)('keeps a Cherry-pick arrival in its landing slot across projections (%s picks)', async (picks) => {
  vi.useFakeTimers()
  mockReducedMotion(false)
  let finishReturn = () => {}
  exits.pending = new Promise<void>((resolve) => {
    finishReturn = resolve
  })
  try {
    const base = makeBoardProps()
    const hand = ['defense-hotfix', 'attack-bug', 'support-sudo'].map((id, i) =>
      handItem(`original-${i}`, id),
    )
    const picked = handItem('picked', 'release-frontend')
    const pending = cherryPending(
      [
        { uid: picked.uid, id: picked.card.id },
        { uid: 'deck', id: 'release-backend' },
        { uid: 'rest', id: 'protection-debugger' },
      ],
      picks,
    )
    const state = { ...base.state, you: { ...base.state.you, hand }, pending }
    const intro = { gameId: 'cherry-arrival', view: null, onDone: () => {}, events: [] }
    const props = { ...base, state, intro, actions: { onResolve: vi.fn() } }
    const { container, rerender } = render(<Board {...props} />)
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-picked'))
    if (picks === 2) fireEvent.click(screen.getByTestId('cherry-cell-deck'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    const accepted = {
      ...props,
      state: { ...state, pending: null, you: { ...state.you, hand: [...hand, picked] } },
      intro: {
        ...intro,
        events: [
          {
            id: 1,
            type: 'takenFromDiscard' as const,
            player: 'you',
            card: picked.card.id,
            to: 'hand' as const,
          },
        ],
      },
    }
    rerender(<Board {...accepted} />)
    // Keep the heap return pending: landing must update the fan itself,
    // without waiting for another animation or the final live projection.
    for (let i = 0; i < 25; i++) await act(() => vi.advanceTimersByTimeAsync(100))
    const names = () =>
      [...container.querySelectorAll('[data-hand-slot]')].map((slot) =>
        ['Hotfix', 'Bug', 'Frontend', 'Sudo'].find((name) => slot.textContent?.includes(name)),
      )
    expect(names()).toEqual(['Hotfix', 'Bug', 'Frontend', 'Sudo'])
    await act(async () => {
      finishReturn()
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(names()).toEqual(['Hotfix', 'Bug', 'Frontend', 'Sudo'])
    rerender(<Board {...accepted} state={{ ...accepted.state, history: [] }} />)
    expect(names()).toEqual(['Hotfix', 'Bug', 'Frontend', 'Sudo'])
  } finally {
    finishReturn()
    exits.pending = null
    vi.useRealTimers()
  }
})

// Same shape as `boardAi.test.tsx`'s own `cherryPending` (not exported from
// there, so mirrored here rather than reached for across files) — the
// regression suite that first proved Cherry-pick must NOT land on Inside's
// row.
const handItem = (uid: string, id: string) => {
  const card = cardById(id)
  if (!card) throw new Error(`Unknown fixture card: ${id}`)
  return { uid, card }
}

const cherryPending = (options: { uid: string; id: string }[], picks: 1 | 2 = 1) => ({
  kind: 'pickFromDiscard' as const,
  raisedAt: 1,
  player: 'you',
  options,
  picks,
  source: 'operation-git-cherry-pick',
})

// `makeBoardProps` + `render(<Board .../>)` — the same rendering the rest of
// this suite (including `boardAi.test.tsx`'s Cherry-pick regression tests)
// already uses; there is no separate `renderBoard` export to reuse instead.
function renderBoard(over: { pending: ReturnType<typeof cherryPending>; actions?: object }) {
  const base = makeBoardProps()
  return render(
    <Board
      {...makeBoardProps({
        state: { ...base.state, pending: over.pending },
        actions: over.actions,
      })}
    />,
  )
}

describe("the grid that answers Git Cherry-pick's own pick", () => {
  it('gives an operation-git-cherry-pick pending the grid, not the panel', async () => {
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending([
        { uid: 'c1', id: 'attack-bug' },
        { uid: 'c2', id: 'release-frontend' },
      ]),
      actions: { onResolve },
    })
    expect(screen.getByTestId('board-cherry-grid')).not.toBeNull()
    expect(screen.queryByTestId('board-inside-row')).toBeNull()

    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({ kind: 'pickFromDiscard', card: 'c2' })
  })

  // THE PILE KEEPS WHAT THE GRID DOES NOT HOLD. Without sudo the engine offers
  // no trigger, and the pile used to lift itself whole for the grid anyway: the
  // Error 503s were in neither place for the whole pick and came back mid-heap
  // as the grid closed (owner's recording, 04.10).
  it('leaves on the pile the cards the grid does not hold', async () => {
    const base = makeBoardProps()
    const heapCard = (eventId: number, id: string) => ({
      uid: `d${eventId}`,
      card: handItem('x', id).card,
      rot: 0,
      dx: 0,
      dy: 0,
    })
    render(
      <Board
        {...makeBoardProps({
          state: {
            ...base.state,
            decks: {
              ...base.state.decks,
              discard: handItem('x', 'release-frontend').card,
              discardCount: 3,
              discardHeap: [
                heapCard(1, 'attack-bug'),
                heapCard(2, 'trigger-error-503'),
                heapCard(3, 'release-frontend'),
              ],
            },
            pending: cherryPending([
              { uid: 'c1', id: 'attack-bug' },
              { uid: 'c2', id: 'release-frontend' },
            ]),
          },
        })}
      />,
    )
    await afterDeal()
    // the 503 lies on the pile — the one card left there — and not in the grid
    const pile = [...document.querySelectorAll('[class*="heapCard"] [data-card]')].map((el) =>
      el.getAttribute('data-card'),
    )
    expect(pile).toEqual(['trigger-error-503'])
    const grid = screen.getByTestId('board-cherry-grid')
    expect(grid.querySelector('[data-card="trigger-error-503"]')).toBeNull()
  })

  it('names both roles under a sudo pick and sends toDeck', async () => {
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending(
        [
          { uid: 'c1', id: 'attack-bug' },
          { uid: 'c2', id: 'release-frontend' },
        ],
        2,
      ),
      actions: { onResolve },
    })
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c1'))
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({
      kind: 'pickFromDiscard',
      card: 'c1',
      toDeck: 'c2',
    })
  })

  it('clears sudo selection marks on confirm and restores them after rejection', async () => {
    mockReducedMotion(false)
    const base = makeBoardProps()
    const pending = cherryPending(
      [
        { uid: 'hand', id: 'attack-bug' },
        { uid: 'deck', id: 'release-frontend' },
      ],
      2,
    )
    const choice = { kind: 'pickFromDiscard' as const, card: 'hand', toDeck: 'deck' }
    const props = {
      ...base,
      state: { ...base.state, pending },
      actions: { onResolve: vi.fn() },
    }
    const { rerender } = render(<Board {...props} />)
    await afterDeal()
    const handCell = screen.getByTestId('cherry-cell-hand')
    const deckCell = screen.getByTestId('cherry-cell-deck')
    const cardState = (cell: HTMLElement) =>
      cell.querySelector('[data-card]')?.getAttribute('data-state')

    fireEvent.click(handCell)
    fireEvent.click(deckCell)
    expect(cardState(handCell)).toBe('selected')
    expect(cardState(deckCell)).toBe('selected')
    expect(handCell.textContent).toContain('→ hand')
    expect(deckCell.textContent).toContain('→ deck')

    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
    expect(props.actions.onResolve).toHaveBeenCalledWith(choice)
    expect(cardState(handCell)).toBe('idle')
    expect(cardState(deckCell)).toBe('idle')
    expect(handCell.textContent).not.toContain('→ hand')
    expect(deckCell.textContent).not.toContain('→ deck')

    rerender(
      <Board
        {...props}
        intro={{
          gameId: null,
          view: null,
          onDone: () => {},
          events: [
            {
              id: 10,
              type: 'rejected',
              reason: 'that is not the offer',
              action: { type: 'RESOLVE', player: 'you', at: 0, choice },
            },
          ],
        }}
      />,
    )
    expect(cardState(handCell)).toBe('selected')
    expect(cardState(deckCell)).toBe('selected')
    expect(handCell.textContent).toContain('→ hand')
    expect(deckCell.textContent).toContain('→ deck')
    expect(screen.getByRole('button', { name: /confirm/i }).hasAttribute('disabled')).toBe(false)
  })

  // Task A4's own line: the flights must never cross it. `play()` drives
  // WAAPI directly and does not check the preference — the CSS-transition
  // dealing/reveal legs and the `later()` timers are what have to ask, or a
  // reduced-motion player would wait on a flight nobody rendered.
  it('resolves at once under reduced motion, with nothing left flying', () => {
    const mm = mockReducedMotion(true)
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending([
        { uid: 'c1', id: 'attack-bug' },
        { uid: 'c2', id: 'release-frontend' },
      ]),
      actions: { onResolve },
    })
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({ kind: 'pickFromDiscard', card: 'c2' })
    expect(screen.queryByTestId('board-cherry-grid')).toBeNull()
    mm.mockRestore()
  })

  it('does not return unpicked cards before the engine accepts the choice', async () => {
    exits.items = []
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending([
        { uid: 'c1', id: 'attack-bug' },
        { uid: 'c2', id: 'release-frontend' },
      ]),
      actions: { onResolve },
    })
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({ kind: 'pickFromDiscard', card: 'c2' })
    expect(exits.items.flat()).not.toContain('c1')
  })
})

// A pick you cannot move is a pick you cannot correct. `canSelect` refused
// every unpicked card the moment `picks` was full, and the click handler
// returned the array unchanged — so the only way out of a mis-click was to
// notice that clicking the CHOSEN card releases it. On the deployed
// playground that reads as a dead grid, which is how it was reported.
describe('changing a pick before confirming', () => {
  it('moves the single pick to the card clicked next', async () => {
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending([
        { uid: 'c1', id: 'attack-bug' },
        { uid: 'c2', id: 'release-frontend' },
      ]),
      actions: { onResolve },
    })
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c1'))
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({ kind: 'pickFromDiscard', card: 'c2' })
  })

  // Two slots full: the new card takes the OLDEST one's place, so the pick
  // that survives is the one chosen most recently.
  it('replaces the oldest of two sudo picks', async () => {
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending(
        [
          { uid: 'c1', id: 'attack-bug' },
          { uid: 'c2', id: 'release-frontend' },
          { uid: 'c3', id: 'release-backend' },
        ],
        2,
      ),
      actions: { onResolve },
    })
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c1'))
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByTestId('cherry-cell-c3'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({
      kind: 'pickFromDiscard',
      card: 'c2',
      toDeck: 'c3',
    })
  })

  // The swap is not a licence to reach an illegal pair. A trigger may only
  // ever hold the DECK slot, so a base pick — whose only slot is the hand —
  // still refuses one, full or not.
  it('refuses to swap a trigger into the single hand slot', async () => {
    const onResolve = vi.fn()
    renderBoard({
      pending: cherryPending([
        { uid: 'c1', id: 'release-frontend' },
        { uid: 'c2', id: 'trigger-error-503' },
      ]),
      actions: { onResolve },
    })
    await afterDeal()
    fireEvent.click(screen.getByTestId('cherry-cell-c1'))
    fireEvent.click(screen.getByTestId('cherry-cell-c2'))
    fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
    expect(onResolve).toHaveBeenCalledWith({ kind: 'pickFromDiscard', card: 'c1' })
  })
})

it('returns unpicked cards only after the engine accepts the local pick', async () => {
  mockReducedMotion(false)
  exits.items = []
  const onResolve = vi.fn()
  const base = makeBoardProps()
  const pending = cherryPending([
    { uid: 'a', id: 'attack-bug' },
    { uid: 'b', id: 'release-frontend' },
  ])
  const props = { ...base, state: { ...base.state, pending }, actions: { onResolve } }
  const { rerender } = render(<Board {...props} />)
  await afterDeal()
  fireEvent.click(screen.getByTestId('cherry-cell-b'))
  fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
  expect(exits.items.flat()).not.toContain('a')
  rerender(
    <Board
      {...props}
      state={{ ...base.state, pending: null }}
      intro={{
        gameId: null,
        view: null,
        onDone: () => {},
        events: [
          { id: 1, type: 'takenFromDiscard', player: 'you', card: 'release-frontend', to: 'hand' },
        ],
      }}
    />,
  )
  await vi.waitFor(() => expect(exits.items.flat()).toContain('a'), { timeout: 3000 })
})

// EACH CARD GOES HOME TO ITS OWN SPOT. A Cherry-pick played over a Cherry-pick
// lying in the pile: the projection after the answer already holds the new one
// (it stands at the centre, but the engine has filed it), and the card going
// home was claimed by NAME in that heap — the first Cherry-pick flew onto the
// second's pose, on top, and the pile turned it back to its own the moment it
// took over (owner's recording, 04.10).
it('sends a card home to the spot it was lifted from, not to another copy of it', async () => {
  mockReducedMotion(false)
  exits.sent = []
  const base = makeBoardProps()
  const entry = (eventId: number, id: string) => ({
    uid: `d${eventId}`,
    card: handItem('x', id).card,
    ...scatterAt(eventId),
  })
  const lying = [entry(1, 'attack-bug'), entry(103, 'operation-git-cherry-pick')]
  const decks = { ...base.state.decks, discardCount: 2, discardHeap: lying }
  const pending = cherryPending([
    { uid: 'c1', id: 'attack-bug' },
    { uid: 'c2', id: 'operation-git-cherry-pick' },
  ])
  const props = {
    ...base,
    state: { ...base.state, decks, pending },
    actions: { onResolve: vi.fn() },
  }
  const { rerender } = render(<Board {...props} />)
  await afterDeal()
  fireEvent.click(screen.getByTestId('cherry-cell-c1'))
  fireEvent.click(screen.getByRole('button', { name: /confirm|подтвердить/i }))
  // the answer's projection: the Bug gone, the new Cherry-pick filed on top
  const answered = {
    ...decks,
    discardHeap: [lying[1], entry(108, 'operation-git-cherry-pick')],
  }
  rerender(
    <Board
      {...props}
      state={{ ...props.state, decks: answered, pending: null }}
      intro={{
        gameId: null,
        view: null,
        onDone: () => {},
        events: [
          { id: 109, type: 'takenFromDiscard', player: 'you', card: 'attack-bug', to: 'hand' },
        ],
      }}
    />,
  )
  await vi.waitFor(() => expect(exits.sent.map((s) => s.key)).toContain('c2'), { timeout: 3000 })
  const home = exits.sent.find((s) => s.key === 'c2')
  // its own pose, and the bottom of what is left — not the new one's, on top
  expect(home?.scatter?.rot).toBe(scatterAt(103).rot)
  expect(home?.layer).toBe(0)
})

// …and across the table the same: the watcher's cells ARE the heap's entries,
// and each goes home to its own. The taken copy is the TOPMOST of its kind —
// the one the projection takes out. Before, the first copy was taken and the
// rest went home to made-up poses, and the pile re-laid them all once it took
// over (owner's recording, 04.10).
it('sends a watched pick home to the spots the cards were lifted from', async () => {
  mockReducedMotion(false)
  exits.sent = []
  const base = makeBoardProps()
  const actor = base.state.opponents[0].id
  const entry = (eventId: number, id: string) => ({
    uid: `d${eventId}`,
    card: handItem('x', id).card,
    ...scatterAt(eventId),
  })
  const lying = [entry(1, 'attack-bug'), entry(2, 'release-frontend'), entry(3, 'attack-bug')]
  const decks = { ...base.state.decks, discardCount: 3, discardHeap: lying }
  const pending = { ...cherryPending([]), player: actor }
  const props = { ...base, state: { ...base.state, decks, pending } }
  const { rerender } = render(<Board {...props} />)
  await afterDeal()
  rerender(
    <Board
      {...props}
      state={{ ...props.state, decks: { ...decks, discardHeap: lying.slice(0, 2) }, pending: null }}
      intro={{
        gameId: null,
        view: null,
        onDone: () => {},
        events: [
          { id: 4, type: 'takenFromDiscard', player: actor, card: 'attack-bug', to: 'hand' },
        ],
      }}
    />,
  )
  await vi.waitFor(() => expect(exits.sent.length).toBeGreaterThan(0), { timeout: 3000 })
  expect(exits.sent.map((s) => [s.key, s.scatter?.rot, s.layer])).toEqual([
    ['d1', scatterAt(1).rot, 0],
    ['d2', scatterAt(2).rot, 1],
  ])
})

it.each([false, true])('reopens a refused Cherry-pick choice (single offer: %s)', (single) => {
  mockReducedMotion(true)
  const base = makeBoardProps()
  const onResolve = vi.fn()
  const options = [
    { uid: 'a', id: 'attack-bug' },
    ...(single ? [] : [{ uid: 'b', id: 'release-frontend' }]),
  ]
  const pending = cherryPending(options)
  const state = { ...base.state, pending }
  const { rerender } = render(<Board {...base} state={state} actions={{ onResolve }} />)
  if (!single) {
    fireEvent.click(screen.getByTestId('cherry-cell-a'))
    fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  }
  expect(onResolve).toHaveBeenCalledTimes(1)
  rerender(
    <Board
      {...base}
      state={state}
      actions={{ onResolve }}
      intro={{
        gameId: null,
        view: null,
        onDone: () => {},
        events: [
          {
            id: 10,
            type: 'rejected',
            reason: 'that is not the offer',
            action: {
              type: 'RESOLVE',
              player: 'you',
              at: 0,
              choice: { kind: 'pickFromDiscard', card: 'a' },
            },
          },
        ],
      }}
    />,
  )
  expect(screen.getByTestId('board-cherry-grid')).toBeTruthy()
  if (!single) fireEvent.click(screen.getByTestId('cherry-cell-b'))
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))
  expect(onResolve).toHaveBeenCalledTimes(2)
  expect(onResolve).toHaveBeenLastCalledWith({ kind: 'pickFromDiscard', card: single ? 'a' : 'b' })
})
