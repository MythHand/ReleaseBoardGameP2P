import { useEffect, useRef, useState } from 'react'
import Rules, { RULES_COPY_RU, type RulesCopy } from '@/blocks/Rules'
import type { Card } from '@/cards/types'
import { type GameModesCopy, MODES_COPY_RU, type Setup } from '@/game/modes'
import Drawer from '@/primitives/Drawer'
import Pile from '@/primitives/Pile'
import TabRail, { type TabRailItem } from '@/primitives/TabRail'
import GameModes from '@/table/GameModes'
import GameOver from '@/table/GameOver'
import {
  GAME_OVER_COPY_RU,
  type GameOverCondition,
  type GameOverCopy,
} from '@/table/GameOver/GameOver'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import MoveHistory from '@/table/MoveHistory'
import {
  type HistoryEntry,
  MOVE_HISTORY_COPY_RU,
  type MoveHistoryCopy,
} from '@/table/MoveHistory/MoveHistory'
import Participants from '@/table/Participants'
import {
  PARTICIPANTS_COPY_RU,
  type Participant,
  type ParticipantsCopy,
  type Spectator,
} from '@/table/Participants/Participants'
import Reconnect, { RECONNECT_COPY_RU, type ReconnectCopy } from '@/table/Reconnect'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import { SEAT_COPY_RU, type SeatCopy } from '@/table/Seat/Seat'
import styles from './Table.module.css'

interface Opponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

interface TableState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
  }
  opponents: Opponent[]
  decks: {
    main: number
    events: number
    discard?: Card | null
    discardCount: number
  }
  turn?: string
  history: HistoryEntry[]
  setup: Setup
  participants: Participant[]
  spectators: Spectator[]
}

type Panel = 'history' | 'participants' | 'rules' | 'modes'
type View = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'

interface Over {
  winnerId: string
  condition?: GameOverCondition
}

interface TableProps {
  state: TableState
  over?: Over | null
  onOverContinue?: () => void
  view?: View | null
  // текст режимов по языку (read-only панель «игровой режим»)
  modesCopy?: GameModesCopy
  // текст правил по языку (панель «правила»)
  rulesCopy?: RulesCopy
  // текст мест оппонентов по языку (статус / счётчик карт)
  seatCopy?: SeatCopy
  // текст панели «участники» по языку
  participantsCopy?: ParticipantsCopy
  // текст ленты ходов по языку
  historyCopy?: MoveHistoryCopy
  // текст окна переподключения по языку
  reconnectCopy?: ReconnectCopy
  // текст окна завершения партии по языку
  gameOverCopy?: GameOverCopy
  // собственный «хром»-текст стола по языку
  copy?: TableCopy
}

// Ширина выезжающей панели зависит от типа контента вкладки.
const DRAWER_WIDTH: Record<Panel, number> = {
  history: 420, // история — немного шире
  participants: 420, // участники — как история
  modes: 460, // режимы — немного шире
  rules: 680, // правила — сильно шире
}

// Вкладки рейла (порядок = сверху вниз). Текст — собственный «хром» стола.
const RAIL_ITEMS: TabRailItem[] = [
  { id: 'history', label: 'история' },
  { id: 'participants', label: 'участники' },
  { id: 'rules', label: 'правила' },
  { id: 'modes', label: 'игровой режим' },
]

// Собственный «хром»-текст стола по языку (бейдж выбывания + подписи стопок).
export interface TableCopy {
  youEliminated: string
  deck: string
  events: string
  discard: string
}

export const TABLE_COPY_RU: TableCopy = {
  youEliminated: 'вы выбыли из игры',
  deck: 'колода',
  events: 'события',
  discard: 'сброс',
}

export const TABLE_COPY_EN: TableCopy = {
  youEliminated: 'you are out',
  deck: 'deck',
  events: 'events',
  discard: 'discard',
}

const EMPTY_RELEASE: ReleaseSlots = {
  frontend: undefined,
  backend: undefined,
  database: undefined,
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Table({
  state,
  over = null,
  onOverContinue,
  view = null,
  modesCopy = MODES_COPY_RU,
  rulesCopy = RULES_COPY_RU,
  seatCopy = SEAT_COPY_RU,
  participantsCopy = PARTICIPANTS_COPY_RU,
  historyCopy = MOVE_HISTORY_COPY_RU,
  reconnectCopy = RECONNECT_COPY_RU,
  gameOverCopy = GAME_OVER_COPY_RU,
  copy = TABLE_COPY_RU,
}: TableProps) {
  const { you, opponents, decks, turn, history, setup, participants, spectators } = state
  const [panel, setPanel] = useState<Panel | null>(null)

  // завершение партии — оверлей поверх стола (триггерится извне)
  const overWinner = over ? participants.find((p) => p.id === over.winnerId) : null
  const youEliminated = view === 'youEliminated'

  const toggle = (p: Panel) => setPanel((cur) => (cur === p ? null : p))

  // при закрытии держим ширину последней открытой вкладки — чтобы панель
  // уезжала своей шириной, без скачка; при смене вкладок ширина плавно меняется
  const lastOpen = useRef<Panel>('history')
  useEffect(() => {
    if (panel) lastOpen.current = panel
  }, [panel])
  const drawerWidth = DRAWER_WIDTH[panel ?? lastOpen.current]

  return (
    <div className={styles.table}>
      <div className={styles.opponents}>
        {opponents.map((p, i) => {
          const eliminated = view === 'oppEliminated' && i === 0
          const disconnected = view === 'oppDisconnect' && i === 0
          // выбыл → карты в сброс: пустая зона релиза, рука = 0
          const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
          return (
            <Seat
              key={p.id}
              player={shown}
              active={turn === p.id}
              eliminated={eliminated}
              disconnected={disconnected}
              copy={seatCopy}
            />
          )
        })}
      </div>

      <div className={styles.decks}>
        <Pile label={copy.deck} deck="base" count={decks.main} width="150px" countPos="tl" />
        <Pile label={copy.events} deck="ai" count={decks.events} width="150px" countPos="tl" />
      </div>

      <div className={styles.discard}>
        <Pile
          label={copy.discard}
          topCard={decks.discard}
          count={decks.discardCount}
          width="116px"
        />
      </div>

      <div className={styles.you}>
        {youEliminated ? (
          <div className={styles.youBadge}>{copy.youEliminated}</div>
        ) : (
          <>
            <ReleaseZone release={you.release} size="100px" />
            <div className={styles.handWrap}>
              <Hand items={you.hand} />
            </div>
          </>
        )}
      </div>

      {/* вертикальный рейл у правого края — переключает панели drawer */}
      <TabRail items={RAIL_ITEMS} active={panel} onSelect={(id) => toggle(id as Panel)} />

      {/* выезжающая панель поверх контента (ширина — per-tab) */}
      <Drawer open={panel !== null} width={drawerWidth} className={styles.drawer}>
        {panel === 'history' && <MoveHistory entries={history} copy={historyCopy} />}
        {panel === 'participants' && (
          <Participants players={participants} spectators={spectators} copy={participantsCopy} />
        )}
        {panel === 'rules' && (
          <div className={styles.scrollPanel}>
            <Rules copy={rulesCopy} />
          </div>
        )}
        {panel === 'modes' && <GameModes setup={setup} copy={modesCopy} />}
      </Drawer>

      {view === 'youDisconnect' && <Reconnect copy={reconnectCopy} />}

      {over && (
        <GameOver
          winner={overWinner}
          condition={over.condition}
          onContinue={onOverContinue}
          copy={gameOverCopy}
        />
      )}
    </div>
  )
}
