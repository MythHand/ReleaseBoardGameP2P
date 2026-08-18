import type { Event } from '@release/engine'
import { forViewer, rejectionsIn } from './audience'

const publicEvent: Event = { id: 1, type: 'turnStarted', player: 'a', index: 0 }
// `handTransfer` is genuinely private to its two ends: nobody else may know it
// happened at all. A draw is NOT that shape any more — see the redaction tests.
const privateEvent: Event = {
  id: 2,
  type: 'handTransfer',
  from: 'a',
  to: 'b',
  card: 'attack-bug',
  visibleTo: ['a', 'b'],
}
const rejection: Event = {
  id: 3,
  type: 'rejected',
  action: { type: 'PASS', player: 'b', at: 0 },
  reason: 'not your turn',
}

const drawnEvent: Event = {
  id: 4,
  type: 'drawn',
  player: 'a',
  card: 'attack-bug',
  pile: 0,
  deckSize: 30,
}

it('passes public events to everyone', () => {
  expect(forViewer([publicEvent], 'b')).toEqual([publicEvent])
})

it('withholds an event from a viewer outside its audience', () => {
  expect(forViewer([privateEvent], 'c')).toEqual([])
  expect(forViewer([privateEvent], 'a')).toEqual([privateEvent])
})

it('never includes a rejection, not even for the actor named in it', () => {
  expect(forViewer([rejection], 'b')).toEqual([])
})

it('preserves order when mixing audiences', () => {
  const out = forViewer([publicEvent, privateEvent, rejection], 'a')
  expect(out.map((e) => e.id)).toEqual([1, 2])
})

it('shows a draw to the whole table, with the card only for the drawer', () => {
  const [mine] = forViewer([drawnEvent], 'a') as [Extract<Event, { type: 'drawn' }>]
  const [theirs] = forViewer([drawnEvent], 'b') as [Extract<Event, { type: 'drawn' }>]
  expect(mine.card).toBe('attack-bug')
  // The event itself survives for the onlooker — that is what makes an
  // opponent's draw animatable at all.
  expect(theirs.card).toBeUndefined()
  expect(theirs.player).toBe('a')
})

it('collects rejections separately', () => {
  expect(rejectionsIn([publicEvent, rejection])).toEqual([rejection])
})
