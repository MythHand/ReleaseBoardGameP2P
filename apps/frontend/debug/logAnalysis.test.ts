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

type Pose = [number, number, number, number, number]
// …and as it writes it now, each card with how it lies beside it
const lying = (t: number, at: Record<string, [string, Pose][]>): LogEntry => ({
  t,
  from: 'screen',
  kind: 'screen',
  data: {
    cards: Object.fromEntries(Object.entries(at).map(([w, list]) => [w, list.map(([id]) => id)])),
    poses: Object.fromEntries(Object.entries(at).map(([w, list]) => [w, list.map(([, p]) => p)])),
  },
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

  // the Cherry-pick, 04.10: the cards had landed in the heap and the heap then
  // re-stacked itself — the same cards, the same spots, another on top
  it('finds two cards at rest that swapped which one lies on top', () => {
    const found = findings([
      lying(0, {
        'heapCard<stack<box': [
          ['attack-bug', [100, 100, 80, 7, 0]],
          ['defense-hotfix', [104, 102, 80, -3, 1]],
        ],
      }),
      lying(16, {
        'heapCard<stack<box': [
          ['attack-bug', [100, 100, 80, 7, 0]],
          ['defense-hotfix', [104, 102, 80, -3, 1]],
        ],
      }),
      lying(32, {
        'heapCard<stack<box': [
          ['attack-bug', [100, 100, 80, 7, 1]],
          ['defense-hotfix', [104, 102, 80, -3, 0]],
        ],
      }),
    ])
    expect(found).toEqual([
      expect.objectContaining({
        kind: 'layer',
        card: 'attack-bug / defense-hotfix',
        t: 32,
        before: ['defense-hotfix over attack-bug'],
        during: ['attack-bug over defense-hotfix'],
      }),
    ])
  })

  it('finds a card at rest that jumped to another pose in one frame and stayed', () => {
    const at = (x: number, rot: number): [number, number, number, number, number] => [
      x,
      100,
      80,
      rot,
      0,
    ]
    const found = findings([
      lying(0, { flyer: [['attack-bug', at(100, 0)]] }),
      lying(16, { flyer: [['attack-bug', at(100, 0)]] }),
      lying(32, { 'heapCard<stack<box': [['attack-bug', at(112, 9)]] }),
      lying(48, { 'heapCard<stack<box': [['attack-bug', at(112, 9)]] }),
    ])
    expect(found).toEqual([expect.objectContaining({ kind: 'snap', card: 'attack-bug', t: 32 })])
  })

  // the fan settling after a hover, 04.10: an eased slide's last frames move a
  // pixel or two and rest between them — read as jumps, they buried the one real one
  it('takes the tail of an eased slide for no jump', () => {
    const at = (x: number): [number, number, number, number, number] => [x, 100, 80, 0, 0]
    expect(
      findings([
        lying(0, { fan: [['attack-bug#6', at(100)]] }),
        lying(16, { fan: [['attack-bug#6', at(100)]] }),
        lying(32, { fan: [['attack-bug#6', at(102)]] }),
        lying(48, { fan: [['attack-bug#6', at(102)]] }),
      ]),
    ).toEqual([])
  })

  it('takes a card in flight for neither: passing over another, and coming to rest', () => {
    const resting: [string, [number, number, number, number, number]] = [
      'defense-hotfix',
      [100, 100, 80, 0, 0],
    ]
    expect(
      findings([
        lying(0, { heap: [resting], flyer: [['attack-bug', [300, 100, 80, 0, 1]]] }),
        lying(16, { heap: [resting], flyer: [['attack-bug', [200, 100, 80, 0, 1]]] }),
        // under the card at rest as it settles — the carrier tucking in, not a swap
        lying(32, {
          heap: [
            [resting[0], [100, 100, 80, 0, 1]],
            ['attack-bug', [110, 100, 80, 0, 0]],
          ],
        }),
        lying(48, {
          heap: [
            [resting[0], [100, 100, 80, 0, 1]],
            ['attack-bug', [110, 100, 80, 0, 0]],
          ],
        }),
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
    '      0 heap(1)[attack-bug]  flyer:protection-debugger',
    '      5 beatPublish upgrade:1',
    '     10 heap(2)[attack-bug,protection-debugger]  ',
  ])
  expect(cardTrail(entries, 'protection-debugger')).toEqual([
    '      0 flyer',
    '     10 heapCard<stack<box',
  ])
})

it('traces the heap as the eye sees it: bottom to top, each card at its angle', () => {
  const entries: LogEntry[] = [
    lying(0, {
      'heapCard<stack<box': [
        ['attack-bug', [100, 100, 80, 7, 1]],
        ['defense-hotfix', [104, 102, 80, -3, 0]],
      ],
    }),
  ]
  expect(heapTrace(entries)).toEqual(['      0 heap(2)[defense-hotfix@-3°,attack-bug@7°]  '])
})

// A CARD MOVED WITH NO FLIGHT. The AI 503 refused, 04.10: the hand flew out, and
// then the trigger standing at the left was in the heap the next frame, and the
// AI card standing at the centre was drawn nowhere — each still drawn once or
// gone for good, so neither count saw a thing.
describe('a card moved with no flight', () => {
  const left: Pose = [757, 525, 150, 0, 0]
  const heap: Pose = [1575, 585, 146, -11.5, 0]
  const centre: Pose = [946, 525, 200, 0, 1]
  const standing = (t: number) =>
    lying(t, { aiSlot: [['trigger-ai', left]], 'board-ai-effect': [['ai-error-503', centre]] })

  it('finds a standing card that was somewhere else the next frame, and one that vanished', () => {
    const found = findings([
      standing(0),
      standing(300),
      standing(600),
      lying(620, { 'heapCard<stack<box': [['trigger-ai', heap]] }),
    ])
    expect(found.map((f) => [f.kind, f.card])).toEqual([
      ['left', 'ai-error-503'],
      ['jump', 'trigger-ai'],
    ])
  })

  it('takes a card that leaves through a carrier for neither', () => {
    const found = findings([
      standing(0),
      standing(300),
      standing(600),
      lying(620, {
        'flyer<board-table': [
          ['trigger-ai', left],
          ['ai-error-503', centre],
        ],
      }),
      lying(1000, { 'heapCard<stack<box': [['trigger-ai', heap]], 'pose<flyer': [['back', heap]] }),
      lying(1100, { 'heapCard<stack<box': [['trigger-ai', heap]] }),
    ])
    expect(found.filter((f) => f.kind === 'jump' || f.kind === 'left')).toEqual([])
  })

  it('takes a hand-over to the place that draws it on the same spot for no jump', () => {
    const found = findings([
      lying(0, { 'cherry-cell-attack-bug#1<cells': [['attack-bug#1', heap]] }),
      lying(300, { 'cherry-cell-attack-bug#1<cells': [['attack-bug#1', heap]] }),
      lying(320, { 'heapCard<stack<box': [['attack-bug', heap]] }),
    ])
    expect(found.filter((f) => f.kind === 'jump')).toEqual([])
  })

  // a card that came to rest on a face-down pile went INTO it, and a heap
  // leaving as one stack is drawn by its carrier with the top card only
  it('takes a card gone into a face-down pile, or into a stack leaving as one, for no vanishing', () => {
    const onDeck: Pose = [101, 439, 150, 0, 5]
    const deck = (t: number, cards: Record<string, [string, Pose][]>) => {
      const e = lying(t, cards)
      e.data.decks = [[30, 340, 150, 210]]
      return e
    }
    const intoDeck = findings([
      deck(0, { cell: [['release-backend', onDeck]] }),
      deck(600, { cell: [['release-backend', onDeck]] }),
      deck(620, {}),
    ])
    const intoStack = findings([
      lying(0, {
        'heapCard<stack<box': [
          ['operation-git-branch', heap],
          ['support-sudo', heap],
        ],
      }),
      lying(600, {
        'heapCard<stack<box': [
          ['operation-git-branch', heap],
          ['support-sudo', heap],
        ],
      }),
      lying(620, { 'flyer<board-table': [['support-sudo', heap]] }),
    ])
    expect([...intoDeck, ...intoStack].filter((f) => f.kind === 'left')).toEqual([])
  })

  it('takes neither from a card that had only just come to rest, or a scenario rebuilt', () => {
    const brief = findings([
      lying(0, { 'board-ai-effect': [['ai-error-503', centre]] }),
      lying(200, { 'board-ai-effect': [['ai-error-503', centre]] }),
      lying(220, {}),
    ])
    const rebuilt = findings([
      standing(0),
      standing(600),
      { t: 610, from: 'stand', kind: 'scenario', data: { scenario: 'aiTrigger' } },
      lying(620, { 'heapCard<stack<box': [['trigger-ai', heap]] }),
    ])
    expect([...brief, ...rebuilt].filter((f) => f.kind === 'jump' || f.kind === 'left')).toEqual([])
  })
})
