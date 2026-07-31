import { useTranslation } from '@release/translation'
import { DEFAULT_SETUP, Table } from '@release/ui'
import { Outlet } from 'react-router'

// Placeholder board state — empty hands/zones. Real state arrives with the
// game-rules engine (separate spec). TableState is structural; only DEFAULT_SETUP
// is imported from @release/ui.
const PLACEHOLDER_STATE = {
  you: {
    name: '',
    hand: [],
    release: { frontend: undefined, backend: undefined, database: undefined },
  },
  opponents: [],
  decks: { main: 0, events: 0, discard: null, discardCount: 0 },
  // matches the dock's previous hardcoded default ('push') until the
  // game-rules engine supplies a real turn/hasDrawn
  turn: 'you',
  hasDrawn: true,
  selfId: 'you',
  history: [],
  setup: DEFAULT_SETUP,
}

export default function BoardPage() {
  // All Table copy comes from the central catalog via i18next — one namespace per
  // sub-block, matching the @release/ui prop names.
  const { t } = useTranslation()
  return (
    <div data-testid="board-page">
      <Table
        state={PLACEHOLDER_STATE}
        room={{ participants: [], spectators: [] }}
        // matches the dock's previous hardcoded defaults until the
        // game-rules engine (and its deadline clock) lands
        dock={{ seconds: 16, progress: 0.55 }}
        copy={{
          table: t('table', { returnObjects: true }),
          modes: t('gameModes', { returnObjects: true }),
          rules: t('rulesBlock', { returnObjects: true }),
          seat: t('seat', { returnObjects: true }),
          participants: t('participants', { returnObjects: true }),
          history: t('moveHistory', { returnObjects: true }),
          reconnect: t('reconnect', { returnObjects: true }),
          gameOver: t('gameOver', { returnObjects: true }),
          lobbyCode: t('lobbyCode', { returnObjects: true }),
          turnDock: t('turnDock', { returnObjects: true }),
        }}
      />
      <Outlet />
    </div>
  )
}
