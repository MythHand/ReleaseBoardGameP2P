// Forked from apps/ui/src/table/Table/testFixture.ts (2026-08-11, #89).
//
// The kit fixture imports the locale JSON directly
// (`@release/translation/locales/en/common.json`); the frontend's Vite alias
// for `@release/translation` points at the package's `index.ts` file rather
// than its `src` directory, so that subpath does not resolve here. `index.ts`
// already assembles the same object as `resources.en.common`, so that's the
// public-surface route to the same data.
import type { Event, PlayerView } from '@release/engine'
import { resources } from '@release/translation'
// `makeTable` builds the deterministic mock snapshot (roster, hand, history…)
// that both the kit's Table suite and this ported one assert against. It is
// not part of `@release/ui`'s public barrel — same as the icon/asset imports
// elsewhere in this app (`@/icons/DiceIcon`, `@/brand/ReleaseLogo`) that reach
// past the barrel for pieces it does not export.
import { makeTable } from '@/mocks/table'
import type { BoardProps } from '~/entities/game/board'

const enCommon = resources.en.common

// Full, valid props for Board. Tests override only the slice they assert on:
//   makeBoardProps({ room: { ...base.room, role: 'guest' } })
export function makeBoardProps(over: Partial<BoardProps> = {}): BoardProps {
  const mock = makeTable(3)
  return {
    state: {
      you: mock.you,
      opponents: mock.opponents,
      decks: mock.decks,
      turn: mock.turn,
      selfId: 'you',
      history: mock.history,
      setup: mock.setup,
      playable: [],
      frozen: [],
    },
    room: {
      role: 'host',
      code: '4F2A-9K',
      participants: mock.participants,
      spectators: mock.spectators,
    },
    copy: {
      table: {
        ...enCommon.table,
        generalTitle: 'general',
        pauseGame: 'pause game',
        pauseOn: 'on',
        pauseOff: 'off',
        pauseHint: 'freezes the turn timer for everyone',
      },
      modes: enCommon.gameModes,
      rules: enCommon.rulesBlock,
      seat: enCommon.seat,
      participants: enCommon.participants,
      history: enCommon.moveHistory,
      reconnect: enCommon.reconnect,
      gameOver: enCommon.gameOver,
      lobbyCode: enCommon.lobbyCode,
      turnDock: enCommon.turnDock,
      pending: enCommon.pending,
      window: enCommon.window,
    },
    // A frozen clock, so a test that does not care about the countdown gets a
    // stable one and a test that does overrides it with both bounds it needs.
    now: 0,
    ...over,
  } as BoardProps
}

// The opening as the intro reads it: a projection nobody has moved in yet, and
// the deal events that produced it. Same shapes as the sequencer's own suite
// (features/game-intro/__tests__/useDealIntro.test.tsx) — minimal but real, no
// casts, so drift in PlayerView / Event is a compile error here too.
export function introFixture(): { gameId: string; view: PlayerView; events: Event[] } {
  return {
    // The opening plays once per game, so the intro is keyed by the match id
    // rather than by anything on the projection.
    gameId: 'g1',
    view: {
      self: {
        id: 'p1',
        name: 'One',
        hand: [
          { uid: 'protection-debugger#0', id: 'protection-debugger' },
          { uid: 'attack-bug#1', id: 'attack-bug' },
        ],
        release: {},
        playable: [],
        targets: {},
        combos: {},
        frozen: [],
      },
      opponents: [{ id: 'p2', name: 'Two', handCount: 2, release: {}, eliminated: false }],
      decks: { piles: [100], events: 21, discardCount: 0 },
      turn: { player: 'p1', index: 0, hasDrawn: false },
      window: null,
      pending: null,
      // `Setup` is Record<string, string> in both the engine and the kit.
      setup: {},
      over: null,
      tally: null,
    },
    events: [
      { id: 1, type: 'dealt', player: 'p1', count: 2, open: ['protection-debugger'] },
      { id: 2, type: 'dealt', player: 'p2', count: 2, open: ['protection-debugger'] },
    ],
  }
}
