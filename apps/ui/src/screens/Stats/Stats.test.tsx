import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import Stats, { type StatPlayer, type StatsCopy } from './Stats'

const copy: StatsCopy = {
  title: 'Match results',
  subtitle: 'Match over',
  winnerLabel: 'winner',
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
  expect(getByText('winner')).toBeTruthy()
  expect(getAllByText('you').length).toBeGreaterThan(0)
})
