import { describe, expect, it } from 'vitest'
import { cardTrail, findings, heapTrace } from './logAnalysis'
import type { LogEntry } from './recorder'

// A recording as the stand writes it: one `screen` line per painted frame that
// differed, each naming every visible card by the place it stands in.
const screen = (t: number, cards: Record<string, string[]>): LogEntry => ({
  t,
  from: 'screen',
  kind: 'screen',
  data: { cards },
})

describe('findings', () => {
  // the System Upgrade answers, 03.10: the carrier came down, the heap had not
  // had the card filed, and the live board brought it back 620 ms later
  it('finds a card gone between two places, however long it was gone', () => {
    const found = findings([
      screen(0, { flyer: ['protection-debugger'] }),
      screen(100, { flyer: [] }),
      screen(720, { 'heapCard<stack<box': ['protection-debugger'] }),
    ])
    expect(found).toEqual([
      expect.objectContaining({
        kind: 'gone',
        card: 'protection-debugger',
        t: 100,
        lasted: 620,
        before: ['flyer'],
        during: [],
        after: ['heapCard<stack<box'],
      }),
    ])
  })

  // Error 503 answered with a Debugger: the fan kept drawing it the whole flight
  it('finds a card standing where it was and where it went at once', () => {
    const found = findings([
      screen(0, { 'faceWrap<fan<hand': ['protection-debugger#2'] }),
      screen(10, {
        'faceWrap<fan<hand': ['protection-debugger#2'],
        flyer: ['protection-debugger'],
      }),
      screen(465, { flyer: ['protection-debugger'] }),
    ])
    expect(found).toEqual([
      expect.objectContaining({ kind: 'twice', card: 'protection-debugger', lasted: 455 }),
    ])
  })

  it('finds a card that passed through another place for a moment', () => {
    const found = findings([
      screen(0, { 'board-centre-staged': ['operation-system-upgrade'] }),
      screen(10, { 'board-centre-partner': ['operation-system-upgrade'] }),
      screen(31, { 'board-operation-standing': ['operation-system-upgrade'] }),
    ])
    expect(found).toEqual([
      expect.objectContaining({ kind: 'hop', lasted: 21, during: ['board-centre-partner'] }),
    ])
  })

  it('finds nothing in the game moving on: a card leaving for good, a second copy, a hover', () => {
    expect(
      findings([
        // dealt into a closed hand: gone, and it stays gone
        screen(0, { flyer: ['attack-bug'] }),
        screen(400, { flyer: [] }),
        screen(5000, { flyer: [] }),
        // a second System Upgrade played while the first lies in the heap
        screen(6000, { heapCard: ['operation-system-upgrade'] }),
        screen(6100, {
          heapCard: ['operation-system-upgrade'],
          centre: ['operation-system-upgrade'],
        }),
        screen(9000, {
          heapCard: ['operation-system-upgrade'],
          centre: ['operation-system-upgrade'],
        }),
        // the zoom on hover is a copy on purpose
        screen(9100, { fan: ['defense-hotfix'] }),
        screen(9110, { fan: ['defense-hotfix'], 'zoom<hand': ['defense-hotfix'] }),
        screen(9130, { fan: ['defense-hotfix'] }),
      ]),
    ).toEqual([])
  })

  it('takes a card back after the window as the game, not a slip', () => {
    const entries = [
      screen(0, { fan: ['attack-bug'] }),
      screen(100, { fan: [] }),
      screen(3000, { fan: ['attack-bug'] }),
    ]
    expect(findings(entries)).toEqual([])
    expect(findings(entries, { window: 5000 })).toHaveLength(1)
  })
})

it('traces the heap and one card frame by frame between two moments', () => {
  const entries: LogEntry[] = [
    screen(0, { flyer: ['protection-debugger'], 'heapCard<stack<box': ['attack-bug'] }),
    { t: 5, from: 'board', kind: 'beatPublish', data: { key: 'upgrade:1' } },
    screen(10, { 'heapCard<stack<box': ['attack-bug', 'protection-debugger'] }),
  ]
  expect(heapTrace(entries, 0, 20)).toEqual([
    '      0 heap(1)[..attack-bug]  flyer:protection-debugger',
    '      5 beatPublish upgrade:1',
    '     10 heap(2)[..attack-bug,protection-debugger]  ',
  ])
  expect(cardTrail(entries, 'protection-debugger')).toEqual([
    '      0 flyer',
    '     10 heapCard<stack<box',
  ])
})
