// Forked from apps/ui/src/table/Table/types.ts (2026-08-11, #89).
//
// The board screen lives here now because the deal intro animates into the real
// Hand's DOM, which a component in another package cannot expose. @release/ui's
// Table keeps its copy and keeps serving the playground's TableStory — so the
// two will drift, and contract.test-d.ts is what makes the drift a compile
// error instead of a misrender.

import type {
  CardData,
  DockView,
  GameModesCopy,
  GameOverCopy,
  HandItem,
  HeapCard,
  HistoryEntry,
  LobbyCodeCopy,
  MoveHistoryCopy,
  Participant,
  ParticipantsCopy,
  PauseGameCopy,
  PausePlayer,
  PendingPromptCopy,
  ReconnectCopy,
  ReleaseSlots,
  RulesCopy,
  SeatCopy,
  Setup,
  Spectator,
  SwitchLang,
  TableActions,
  TablePending,
  TableWindow,
  TurnDockCopy,
  WindowCopy,
} from '@release/ui'
import type { ReactNode } from 'react'

export type Panel = 'settings' | 'history' | 'participants' | 'rules' | 'modes'

export interface BoardOpponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
  eliminated?: boolean
}

// Everything the engine's projection can answer. Assembled by the consumer's
// adapter; nothing here is room- or session-shaped.
export interface BoardState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
    eliminated?: boolean
  }
  opponents: BoardOpponent[]
  decks: {
    main: number
    events: number
    // верх сброса одной картой — запасной вид, когда куча не передана
    discard?: CardData | null
    // сброс как он есть на столе: наброшенная куча. Необязательно — экран
    // остаётся рабочим у потребителя, который её ещё не отдаёт.
    discardHeap?: HeapCard[]
    discardCount: number
  }
  turn?: string
  // whether the player on turn has already drawn this turn — drives the dock
  // between its 'draw' and 'push' phases
  hasDrawn?: boolean
  // the local player's id, as the projection names it (`PlayerView.self.id`)
  selfId: string
  history: HistoryEntry[]
  setup: Setup
  playable: string[]
  frozen: string[]
  pending?: TablePending | null
  window?: TableWindow | null
  // Keyed by card uid — the projection's answer to "what may pair with this",
  // so the kit looks the pairing up rather than deciding it.
  comboOptions?: Record<string, string[]>
  // Set by the deal intro while it runs. The board renders one state in every
  // phase; during the intro that state is the intro's shadow of the projection,
  // and this names which phase produced it. Absent means the live projection.
  introPhase?: 'setup' | 'dealing' | 'settling'
}

// Everything the session/P2P layer answers. The engine has no concept of a
// spectator, a room code, or a pause.
export interface BoardRoom {
  role?: 'host' | 'guest'
  code?: string
  participants: Participant[]
  spectators: Spectator[]
  spectatorLimit?: number
  onSpectatorLimitChange?: (n: number) => void
  onKickSpectator?: (id: string) => void
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  paused?: boolean
  onPauseChange?: (on: boolean) => void
  pausePlayers?: PausePlayer[]
  pauseSelfId?: string
  pauseHostId?: string
  onPauseToggleReady?: () => void
  // Connection is a session fact, never a game fact. `reconnecting` is the
  // local peer; `disconnected` names peers seen as gone.
  connection?: 'online' | 'reconnecting'
  disconnected?: string[]
}

// Собственный «хром»-текст стола по языку (бейдж выбывания + подписи стопок).
export interface BoardChromeCopy {
  youEliminated: string
  deck: string
  events: string
  discard: string
  // подпись вкладки-настроек (для screen-reader на иконке-шестерёнке)
  settings: string
  // заголовок группы общих настроек — показывается только хосту (у него две
  // группы: общие + управление хоста; у прочих одна группа, заголовок не нужен)
  generalTitle?: string
  // подписи полей в панели настроек
  langTitle: string
  codeTitle: string
  // заголовок группы управления хоста + подпись поля лимита зрителей
  hostTitle: string
  specLimit: string
  // поле паузы (опционально — рендерится только вместе с обработчиком паузы):
  // подпись поля, состояние тумблера (вкл / выкл) и строка-пояснение
  pauseGame?: string
  pauseOn?: string
  pauseOff?: string
  pauseHint?: string
  // подписи текстовых вкладок рейла
  tabHistory: string
  tabParticipants: string
  tabRules: string
  tabModes: string
}

export interface BoardCopyBundle {
  table: BoardChromeCopy
  modes: GameModesCopy
  rules: RulesCopy
  seat: SeatCopy
  participants: ParticipantsCopy
  history: MoveHistoryCopy
  reconnect: ReconnectCopy
  gameOver: GameOverCopy
  lobbyCode: LobbyCodeCopy
  turnDock: TurnDockCopy
  pause?: PauseGameCopy
  pending: PendingPromptCopy
  window: WindowCopy
}

export interface BoardSlots {
  // App-only chrome the playground has no equivalent of: navigation out of the
  // match, and the consumer's non-fatal error notice.
  corner?: ReactNode
  banner?: ReactNode
}

export interface BoardOver {
  winnerId: string
  condition?: 'release' | 'lastStanding'
}

export interface BoardProps {
  state: BoardState
  room: BoardRoom
  copy: BoardCopyBundle
  slots?: BoardSlots
  over?: BoardOver | null
  actions?: TableActions
  // override for the dock derived from `state` — the playground's manual
  // selector uses this to force a specific demo state
  dock?: Partial<DockView>
  // The consumer's clock. The kit never reads the system clock itself, so a
  // live countdown is the consumer ticking this. Required: optional here would
  // let a consumer compile while every deadline silently sweeps against a
  // default, which is the shape that hid the missing `pending` and `window`
  // copy — a page that built cleanly and showed a dead ring.
  now: number
  // Controlled/uncontrolled: omit both and Table owns the open panel. Supply
  // `panel` and Table renders exactly what it is told, reporting intent through
  // `onPanelChange` — which is how the page binds the drawer to the URL.
  panel?: Panel | null
  onPanelChange?: (panel: Panel | null) => void
}
