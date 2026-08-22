import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import Stats, { type StatPlayer, type StatsCopy } from './Stats'

const copy: StatsCopy = {
  title: 'Match results',
  subtitle: 'Match over',
  winnerLabel: 'match winner',
  winnerTag: 'winner',
  selfTag: 'you',
  colName: 'player',
  colLoc: 'location',
  colAttack: 'attack',
  colDefense: 'defense',
  toLobby: 'to lobby',
  location: { game: 'in game', stats: 'on stats', lobby: 'in lobby', offline: 'offline' },
  achievements: {
    ddos: { title: 'King of DDoS', unit: 'times played DDoS' },
    ai: { title: 'AI Addict', unit: 'AI cards from deck' },
    err503: { title: 'Lucky One', unit: 'Error 503s from deck' },
    cherryPick: { title: 'Treasure Hunter', unit: 'times pulled from discard' },
    attackedInto: { title: 'Bug Magnet', unit: 'attack cards taken' },
  },
}

const players: StatPlayer[] = [
  {
    id: 'a',
    name: 'Ann',
    location: 'stats',
    attack: 5,
    defense: 1,
    ddos: 3,
    attackedInto: 0,
    ai: 0,
    err503: 0,
    cherryPick: 0,
  },
  {
    id: 'b',
    name: 'Bo',
    location: 'lobby',
    attack: 1,
    defense: 4,
    ddos: 0,
    attackedInto: 2,
    ai: 0,
    err503: 0,
    cherryPick: 0,
  },
]

// Which plates reach the screen at all is decided here and nowhere else — by
// `leader()`, on two rules the layout cannot know and the copy cannot show: a
// tie awards nobody, and a metric nobody scored awards nobody either. Until
// these, the only test that caught either break lived in `@release/web`
// (`statsRealMatch.test.tsx`) — the wrong package for a rule that ships from
// this one, and one deletion away from leaving it unguarded.

// A plate's title is its only per-achievement string on screen, so it doubles
// as the plate's identity. Leaf elements only: every ancestor's `textContent`
// carries the title too, and counting those would report one plate several
// times and in the wrong order.
const PLATE_TITLES = ['Bug Magnet', 'AI Addict', 'Treasure Hunter', 'Lucky One', 'King of DDoS']

const platesInOrder = (container: HTMLElement): string[] =>
  [...container.querySelectorAll<HTMLElement>('*')]
    .filter((el) => el.children.length === 0 && PLATE_TITLES.includes(el.textContent ?? ''))
    .map((el) => el.textContent ?? '')

it('calls back when the lobby button is pressed', () => {
  const onToLobby = vi.fn()
  const { getByText } = render(
    <Stats winnerId="a" selfId="a" copy={copy} players={players} onToLobby={onToLobby} />,
  )

  fireEvent.click(getByText('to lobby'))

  expect(onToLobby).toHaveBeenCalledTimes(1)
})

it('renders the button with no handler, rather than refusing to render', () => {
  // The playground passes no handler; the screen must not require one.
  const { getByText } = render(<Stats winnerId="a" copy={copy} players={players} />)
  expect(getByText('to lobby')).toBeTruthy()
  fireEvent.click(getByText('to lobby'))
})

it('names the winner and marks the local player', () => {
  const { getByText, getAllByText } = render(
    <Stats winnerId="a" selfId="b" copy={copy} players={players} />,
  )
  // `winnerLabel` renders in exactly one place — the winner block — so this
  // fails if that block stops rendering. Asserting on the winner's NAME would
  // not: this fixture makes Ann the sole DDoS leader, so her name is on her
  // achievement plate and her table row whether or not she is announced.
  expect(getByText('match winner')).toBeTruthy()
  expect(getAllByText('Ann').length).toBeGreaterThan(0)
  // Bo is the local player, marked by a badge beside the nickname rather than
  // by replacing it — `selfTag` is the only source of this string.
  expect(getAllByText('you').length).toBeGreaterThan(0)
})

it('shows no winner block when no one has won', () => {
  // The negative control for the test above. Without it, "the block is present"
  // would also be satisfied by a screen that renders it unconditionally.
  const { queryByText } = render(<Stats winnerId="" selfId="b" copy={copy} players={players} />)
  expect(queryByText('match winner')).toBeNull()
})

it('gives a tied achievement to nobody, so the row of plates may come up short', () => {
  // Both players played three DDoS: the metric happened, and happened at its
  // maximum, yet nobody is its holder. The plate is left off rather than
  // awarded to whichever row the reducer reached first.
  const tied = players.map((p) => ({ ...p, ddos: 3 }))
  const { queryByText, getByText } = render(<Stats winnerId="a" copy={copy} players={tied} />)

  expect(queryByText('King of DDoS')).toBeNull()
  // The control that makes the absence mean something: a metric with a sole
  // leader in the same render still gets its plate, so the one above is missing
  // by the tie rule and not because plates stopped rendering.
  expect(getByText('Bug Magnet')).toBeTruthy()
})

it('gives no plate for a metric nobody scored, even with nobody to tie against', () => {
  // A table of ONE, deliberately: with two players a metric nobody scored is
  // already suppressed by the tie above (they tie at zero), so a two-player
  // fixture here would pass with the zero rule deleted. Alone, that player is
  // the sole leader of everything — and a plate reading "AI Addict · 0" is
  // exactly what the zero rule exists to prevent.
  const alone: StatPlayer[] = [{ ...players[0], ddos: 0, attackedInto: 0 }]
  const { queryByText } = render(<Stats winnerId="a" copy={copy} players={alone} />)

  expect(queryByText('AI Addict')).toBeNull()
  expect(queryByText('Lucky One')).toBeNull()
  expect(queryByText('Treasure Hunter')).toBeNull()
  expect(queryByText('King of DDoS')).toBeNull()
  expect(queryByText('Bug Magnet')).toBeNull()
})

it('still awards a plate to a lone player who actually scored', () => {
  // The control for the test above: alone is not the reason a plate is absent.
  const alone: StatPlayer[] = [{ ...players[0], ddos: 2 }]
  const { getByText } = render(<Stats winnerId="a" copy={copy} players={alone} />)

  expect(getByText('King of DDoS')).toBeTruthy()
})

it('renders the plates in their designed order, the wide one first', () => {
  // Every metric given a sole leader, so all five plates render and the order
  // is the whole assertion. It is a design decision, not an incidental one:
  // «Забагованный» is the wide plate and takes a row of its own, and the four
  // ordinary ones follow in pairs.
  const all: StatPlayer[] = [
    { ...players[0], attackedInto: 5, ai: 4, cherryPick: 3, err503: 0, ddos: 0 },
    { ...players[1], attackedInto: 0, ai: 0, cherryPick: 0, err503: 2, ddos: 1 },
  ]
  const { container } = render(<Stats winnerId="a" copy={copy} players={all} />)

  expect(platesInOrder(container)).toEqual([
    'Bug Magnet',
    'AI Addict',
    'Treasure Hunter',
    'Lucky One',
    'King of DDoS',
  ])
})
