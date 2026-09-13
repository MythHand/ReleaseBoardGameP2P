import { describe, expect, it } from 'vitest'
import { parseEventLog } from './events'

describe('parseEventLog privacy invariants', () => {
  it('accepts canonical private event audiences', () => {
    expect(
      parseEventLog([
        {
          id: 1,
          type: 'handTransfer',
          from: 'p1',
          to: 'p2',
          card: 'bug',
          visibleTo: ['p1', 'p2'],
        },
        {
          id: 2,
          type: 'takenFromDiscard',
          player: 'p1',
          card: 'sudo',
          to: 'deck',
          visibleTo: ['p1'],
        },
      ]),
    ).not.toBeNull()
  })

  it.each([
    [
      'a hand transfer with no private audience',
      { id: 1, type: 'handTransfer', from: 'p1', to: 'p2', card: 'bug' },
    ],
    [
      'a hand transfer with the wrong private audience',
      {
        id: 1,
        type: 'handTransfer',
        from: 'p1',
        to: 'p2',
        card: 'bug',
        visibleTo: ['p1', 'p3'],
      },
    ],
    [
      'a private discard-to-deck event with no audience',
      { id: 1, type: 'takenFromDiscard', player: 'p1', card: 'sudo', to: 'deck' },
    ],
    [
      'a private discard-to-deck event with the wrong audience',
      {
        id: 1,
        type: 'takenFromDiscard',
        player: 'p1',
        card: 'sudo',
        to: 'deck',
        visibleTo: ['p2'],
      },
    ],
    [
      'a public event with a forged private audience',
      { id: 1, type: 'dealt', player: 'p1', count: 5, visibleTo: ['p1'] },
    ],
    [
      'an event carrying an unexpected payload field',
      { id: 1, type: 'dealt', player: 'p1', count: 5, secret: 'card-id' },
    ],
  ] as const)('rejects %s', (_case, event) => {
    expect(parseEventLog([event])).toBeNull()
  })
})
