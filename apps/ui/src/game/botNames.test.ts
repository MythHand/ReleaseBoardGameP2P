import { BOT_NICKNAMES, botNames } from './botNames'

it('picks distinct nicknames from the list', () => {
  const names = botNames('host-peer-1', 5)
  expect(names).toHaveLength(5)
  expect(new Set(names).size).toBe(5)
  for (const n of names) expect(BOT_NICKNAMES).toContain(n)
})

// Every peer derives the names on its own, so the same host id must give the
// same names everywhere.
it('gives the same names for the same host id', () => {
  expect(botNames('host-peer-1', 5)).toEqual(botNames('host-peer-1', 5))
})

// Adding a bot must not rename the ones already seated.
it('keeps the seated bots named when one more is added', () => {
  expect(botNames('host-peer-1', 3)).toEqual(botNames('host-peer-1', 4).slice(0, 3))
})

it('gives different rooms different lineups', () => {
  const lineups = new Set(Array.from({ length: 20 }, (_, i) => botNames(`host-${i}`, 3).join()))
  expect(lineups.size).toBeGreaterThan(1)
})

it('stays unique past the end of the list', () => {
  const names = botNames('host', BOT_NICKNAMES.length + 2)
  expect(new Set(names).size).toBe(names.length)
})
