import { isComplete, openWindow, recordResponse, resolveOrder } from './attackWindow'

const seating = ['turn', 'a', 'b', 'c']

function open() {
  return openWindow({ releaseCard: 'Frontend', releasePlayer: 'turn', codeReview: false, seating })
}

it('pends every player except the release player', () => {
  expect(open().pending.sort()).toEqual(['a', 'b', 'c'])
})

it('records responses and completes when all answer', () => {
  let w = open()
  w = recordResponse(w, { player: 'a', kind: 'pass' })
  w = recordResponse(w, { player: 'b', kind: 'attack', card: 'Bug' })
  expect(isComplete(w)).toBe(false)
  w = recordResponse(w, { player: 'c', kind: 'pass' })
  expect(isComplete(w)).toBe(true)
})

it('ignores duplicate / unknown responders', () => {
  let w = open()
  w = recordResponse(w, { player: 'a', kind: 'pass' })
  w = recordResponse(w, { player: 'a', kind: 'attack', card: 'Bug' }) // duplicate
  w = recordResponse(w, { player: 'zzz', kind: 'pass' }) // unknown
  expect(w.responses).toHaveLength(1)
})

it('resolveOrder returns attacks in seating order', () => {
  let w = open()
  w = recordResponse(w, { player: 'c', kind: 'attack', card: 'Legacy Code' })
  w = recordResponse(w, { player: 'a', kind: 'attack', card: 'Bug' })
  w = recordResponse(w, { player: 'b', kind: 'pass' })
  expect(resolveOrder(w).map((r) => r.player)).toEqual(['a', 'c'])
})
