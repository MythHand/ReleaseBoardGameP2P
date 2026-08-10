import type { Event } from '@release/engine'
import { toTableOver, toTableState } from '@release/table-adapter'
import { useTranslation } from '@release/translation'
import { DEFAULT_SETUP, isCounting, Table } from '@release/ui'
import { Outlet, useNavigate, useParams } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import { seatsFor } from '~/entities/game/seats'
import { useGame } from '~/features/play-game/useGame'
import { useNow } from '~/features/play-game/useNow'
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
  const navigate = useNavigate()
  const { gameId } = useParams()

  // The roster is a room fact, not a game fact — the engine's projection has no
  // concept of a spectator — so it comes from the session, split by role exactly
  // as the lobby splits it.
  const peers = Object.values(session.state?.peers ?? {})
  const participants = peers.filter((p) => p.role === 'host' || p.role === 'player')
  const spectators = peers.filter((p) => p.role === 'guest')

  // `toTableOver` renames the engine's `over.winner` — a playerId minted as
  // p1..pN (see ~/entities/game/seats) — but Table.tsx resolves `over.winnerId`
  // against `room.participants`, which are peers keyed by *peer* id. PlayerId
  // and peer id are separate spaces that happen to both be strings, so without
  // this translation the lookup silently misses and the overlay names no one.
  //
  // The miss is reachable rather than theoretical — `over` rides the projection
  // and the roster rides the session, so a projection can land before the roster
  // syncs, and a winning peer can be pruned from `peers` on disconnect. Falling
  // back to the playerId there would restore the very defect above, and just as
  // quietly, so a miss yields no id at all and says so where a developer will
  // see it. The complaint is what catches the next id crossing too.
  const seats = seatsFor(session.state?.peers ?? {})
  const engineOver = game.view ? toTableOver(game.view) : null
  const winnerSeat = engineOver ? seats.find((s) => s.playerId === engineOver.winnerId) : undefined
  if (engineOver && !winnerSeat && import.meta.env.DEV) {
    console.error(
      `[board] no seat for winner ${engineOver.winnerId}: the engine names seats p1..pN, the roster is keyed by peer id. Roster: ${seats.map((s) => `${s.playerId}=${s.peerId}`).join(', ') || '(empty)'}`,
    )
  }
  const over = engineOver ? { ...engineOver, winnerId: winnerSeat?.peerId ?? '' } : null

  // Two different consumers, so two blocks: `moveHistory` is the kit's own chrome
  // (the draw badge, the elimination suffix), `historyLabels` is one label per
  // member of the engine's Event union for the adapter to map onto.
  const labels = t('historyLabels', { returnObjects: true }) as Record<Event['type'], string>
  const state = game.view ? toTableState(game.view, game.events, labels) : EMPTY_TABLE

  // The clock runs only while the dock actually draws a counting ring, so it is
  // asked from the same predicate the ring is derived from. Restating that rule
  // here would let the two drift, and the countdown would freeze for whichever
  // state they stopped agreeing about.
  const now = useNow(isCounting(state, state.selfId))

  return (
    <div className={styles.page} data-testid="board-page">
      <Table
        state={state}
        over={over}
        now={now}
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
          onOverContinue: () => navigate(`/board/${gameId}/stats`),
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
          pending: t('pending', { returnObjects: true }),
          window: t('window', { returnObjects: true }),
        }}
      />
      <Outlet />
    </div>
  )
}
