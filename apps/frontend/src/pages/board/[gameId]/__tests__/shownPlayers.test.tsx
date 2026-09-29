import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { cardById } from '@release/ui'
import { fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react'
import { expect, it } from 'vitest'
import {
  type BoardState,
  type HistoryLabels,
  type ShownCard,
  toBoardState,
  useBoardAnchors,
} from '~/entities/game/board'
import { placeRect, shownSource } from '~/features/board-beats/shownBeat'
import { mockReducedMotion } from '~/test/reducedMotion'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

const shown = (player: string, id: string): ShownCard => {
  const card = cardById(id)
  if (!card) throw new Error(`unknown card ${id}`)
  return { player, uid: `${player}:${id}`, card }
}

function boardWithShown(cards: ShownCard[]) {
  const props = makeBoardProps()
  const state: BoardState = {
    ...props.state,
    you: { ...props.state.you, hand: [] },
    shown: cards,
  }
  return <Board {...props} state={state} />
}

it('keeps both opponents’ staged attacks visible during one release response window', () => {
  const engine = createFakeEngine()
  let game = engine.createGame({
    gameId: 'concurrent-shown',
    seed: 4242,
    players: [
      { id: 'you', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
      { id: 'p3', name: 'Cy' },
    ],
    setup: {
      handLimit: 'base',
      releases: 'base',
      releaseCond: 'easy',
      ai: 'base',
      gitBranch: 'base',
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  game.players.you.hand = [{ uid: 'release', id: 'release-frontend' }]
  game.players.p2.hand = [{ uid: 'bug', id: 'attack-bug' }]
  game.players.p3.hand = [{ uid: 'memory', id: 'attack-out-of-memory' }]
  const released = engine.reduce(game, { type: 'PLAY', player: 'you', card: 'release', at: 1000 })
  expect(released.events.some((event) => event.type === 'windowOpened')).toBe(true)
  game = released.state
  for (const [player, card] of [
    ['p2', 'bug'],
    ['p3', 'memory'],
  ]) {
    expect(engine.project(game, player).window?.canAttackWith).toContain(card)
    const result = engine.reduce(game, { type: 'SHOW', player, card, at: 1001 })
    expect(result.events.some((event) => event.type === 'rejected')).toBe(false)
    game = result.state
  }
  const props = makeBoardProps()
  render(
    <Board {...props} state={toBoardState(engine.project(game, 'you'), [], {} as HistoryLabels)} />,
  )
  const cards = screen.getAllByTestId('board-centre-shown')
  expect(cards).toHaveLength(2)
  expect(cards[0].querySelector('[data-card="attack-bug"]')).not.toBeNull()
  expect(cards[1].querySelector('[data-card="attack-out-of-memory"]')).not.toBeNull()
})

it('does not fold one player’s support underneath another player’s attack', () => {
  render(boardWithShown([shown('p2', 'support-sudo'), shown('p3', 'attack-bug')]))
  const cards = screen.getAllByTestId('board-centre-shown')
  expect(cards).toHaveLength(2)
  expect(cards.every((card) => card.querySelector('[data-aux]') == null)).toBe(true)
  expect(cards[0].querySelector('[data-card="support-sudo"]')).not.toBeNull()
  expect(cards[1].querySelector('[data-card="attack-bug"]')).not.toBeNull()
})

it('keeps a player’s own support pair together alongside another player’s shown card', () => {
  render(
    boardWithShown([
      shown('p2', 'support-sudo'),
      shown('p3', 'attack-out-of-memory'),
      shown('p2', 'attack-bug'),
    ]),
  )
  const cards = screen.getAllByTestId('board-centre-shown')
  expect(cards).toHaveLength(2)
  expect(cards[0].querySelector('[data-main] [data-card="attack-bug"]')).not.toBeNull()
  expect(cards[0].querySelector('[data-aux] [data-card="support-sudo"]')).not.toBeNull()
  expect(cards[1].querySelector('[data-card="attack-out-of-memory"]')).not.toBeNull()
})

it('gives simultaneous owners separate visible places and uses those places as flight origins', () => {
  const cards = [shown('p2', 'attack-bug'), shown('p3', 'attack-out-of-memory')]
  const { rerender } = render(boardWithShown(cards))
  const groups = () => Array.from(document.querySelectorAll<HTMLElement>('[data-shown-player]'))
  expect(groups().map((group) => group.style.translate)).toEqual(['-84px 0', '84px 0'])
  expect(groups()[0].textContent).toContain('kernel_panic')
  expect(groups()[1].textContent).toContain('segfault')

  const { result } = renderHook(useBoardAnchors)
  const centre = document.createElement('div')
  centre.getBoundingClientRect = () => new DOMRect(400, 300, 150, 210)
  result.current.centre.current = centre
  const state = { ...makeBoardProps().state, shown: cards }
  expect(placeRect('solo', result.current, state, 'p2')?.left).toBe(316)
  expect(placeRect('solo', result.current, state, 'p3')?.left).toBe(484)
  const departure = shownSource(state, 'p3', ['attack-out-of-memory'], result.current)
  expect(departure?.rect.left).toBe(484)
  expect(departure?.next.shown).toEqual([cards[0]])

  rerender(boardWithShown([cards[0]]))
  expect(groups()).toHaveLength(1)
  expect(groups()[0].style.translate).toBe('0px 0')
  expect(screen.getAllByTestId('board-centre-shown')).toHaveLength(1)
})

it('keeps an opponent separate while the local gesture waits for its SHOW echo', async () => {
  const motion = mockReducedMotion(true)
  try {
    const props = makeBoardProps()
    const own = shown('you', 'attack-bug')
    const state = {
      ...props.state,
      turn: 'you',
      hasDrawn: true,
      you: { ...props.state.you, hand: [own] },
      playable: [own.uid],
      targets: { [own.uid]: [{ kind: 'player' as const, player: 'p2' }] },
      shown: [shown('p2', 'attack-out-of-memory')],
    }
    render(<Board {...props} state={state} />)
    const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${own.uid}"]`)
    if (!slot) throw new Error('missing local attack')
    fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
    fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
    fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
    await waitFor(() => expect(screen.getByTestId('board-centre-staged')).toBeTruthy())
    const opponent = document.querySelector<HTMLElement>('[data-shown-player="p2"]')
    expect(Number.parseFloat(opponent?.style.translate ?? '0')).toBeLessThan(-150)
    expect(opponent?.textContent).toContain('kernel_panic')
    const centre = document.querySelector<HTMLElement>('[data-board-centre]')
    expect(centre?.dataset.shownSelf).toBe('you')
  } finally {
    motion.mockRestore()
  }
})
