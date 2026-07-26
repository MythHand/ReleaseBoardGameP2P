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
  history: [],
  setup: DEFAULT_SETUP,
  participants: [],
  spectators: [],
}

export default function BoardPage() {
  // All Table copy comes from the central catalog via i18next — one namespace per
  // sub-block, matching the @release/ui prop names.
  const { t } = useTranslation()
  return (
    <div data-testid="board-page">
      <Table
        state={PLACEHOLDER_STATE}
        copy={t('table', { returnObjects: true })}
        modesCopy={t('gameModes', { returnObjects: true })}
        rulesCopy={t('rulesBlock', { returnObjects: true })}
        seatCopy={t('seat', { returnObjects: true })}
        participantsCopy={t('participants', { returnObjects: true })}
        historyCopy={t('moveHistory', { returnObjects: true })}
        reconnectCopy={t('reconnect', { returnObjects: true })}
        gameOverCopy={t('gameOver', { returnObjects: true })}
        lobbyCodeCopy={t('lobbyCode', { returnObjects: true })}
        turnDockCopy={t('turnDock', { returnObjects: true })}
      />
      <Outlet />
    </div>
  )
}
