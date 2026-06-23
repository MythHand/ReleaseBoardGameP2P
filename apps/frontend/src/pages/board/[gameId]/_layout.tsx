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
  return (
    <div data-testid="board-page">
      <Table state={PLACEHOLDER_STATE} />
      <Outlet />
    </div>
  )
}
