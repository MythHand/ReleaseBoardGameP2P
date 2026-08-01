import type { Event } from '@release/engine'
import { toTableState } from '@release/table-adapter'
import { useTranslation } from '@release/translation'
import { DEFAULT_SETUP, Table } from '@release/ui'
import { Outlet } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import { useGame } from '~/features/play-game/useGame'
import styles from './_layout.module.css'

// What the table shows before the first projection arrives — a beat on a live
// connection, indefinitely for a spectator, who holds no seat to be projected
// to. Empty rather than fake: an invented hand would be a lie the player could
// click on.
const EMPTY_TABLE = {
  you: { name: '', hand: [], release: {} },
  opponents: [],
  decks: { main: 0, events: 0, discard: null, discardCount: 0 },
  turn: undefined,
  hasDrawn: false,
  selfId: '',
  history: [],
  setup: DEFAULT_SETUP,
  playable: [],
  frozen: [],
}

export default function BoardPage() {
  // All Table copy comes from the central catalog via i18next — one namespace per
  // sub-block, matching the @release/ui prop names.
  const { t, i18n } = useTranslation()
  const session = useSession()
  const game = useGame()

  // The roster is a room fact, not a game fact — the engine's projection has no
  // concept of a spectator — so it comes from the session, split by role exactly
  // as the lobby splits it.
  const peers = Object.values(session.state?.peers ?? {})
  const participants = peers.filter((p) => p.role === 'host' || p.role === 'player')
  const spectators = peers.filter((p) => p.role === 'guest')

  // Two different consumers, so two blocks: `moveHistory` is the kit's own chrome
  // (the draw badge, the elimination suffix), `historyLabels` is one label per
  // member of the engine's Event union for the adapter to map onto.
  const labels = t('historyLabels', { returnObjects: true }) as Record<Event['type'], string>
  const state = game.view ? toTableState(game.view, game.events, labels) : EMPTY_TABLE

  return (
    <div className={styles.page} data-testid="board-page">
      <Table
        state={state}
        room={{
          role: session.isHost ? 'host' : 'guest',
          code: session.roomCode ?? undefined,
          participants,
          spectators,
          onKickSpectator: session.kick,
          lang: i18n.resolvedLanguage === 'ru' ? 'ru' : 'en',
          onLangChange: (lang) => {
            void i18n.changeLanguage(lang)
          },
        }}
        actions={{
          onPlay: game.play,
          onDraw: game.draw,
          onPush: game.push,
          onAttack: game.attack,
          onPass: game.pass,
          onUnpass: game.unpass,
          onResolve: game.resolve,
        }}
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
