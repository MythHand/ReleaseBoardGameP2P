import type { Event } from '@release/engine'
import { forViewer, rejectionsIn } from './audience'

const publicEvent: Event = { id: 1, type: 'turnStarted', player: 'a', index: 0 }
const privateEvent: Event = {
  id: 2,
  type: 'drawn',
  player: 'a',
  card: 'attack-bug',
  pile: 0,
  deckSize: 30,
  visibleTo: ['a'],
}
const rejection: Event = {
  id: 3,
  type: 'rejected',
  action: { type: 'PASS', player: 'b', at: 0 },
  reason: 'not your turn',
}

it('passes public events to everyone', () => {
  expect(forViewer([publicEvent], 'b')).toEqual([publicEvent])
})

it('withholds an event from a viewer outside its audience', () => {
  expect(forViewer([privateEvent], 'b')).toEqual([])
  expect(forViewer([privateEvent], 'a')).toEqual([privateEvent])
})

it('never includes a rejection, not even for the actor named in it', () => {
  expect(forViewer([rejection], 'b')).toEqual([])
})

it('preserves order when mixing audiences', () => {
  const out = forViewer([publicEvent, privateEvent, rejection], 'a')
  expect(out.map((e) => e.id)).toEqual([1, 2])
})

it('collects rejections separately', () => {
  expect(rejectionsIn([publicEvent, rejection])).toEqual([rejection])
})
