import type { ReactNode } from 'react'
import type { SwitchLang } from '@/blocks/LangSwitcher'
import type { LobbyCodeCopy } from '@/blocks/LobbyCode'
import type { RulesCopy } from '@/blocks/Rules'
import type { Card } from '@/cards/types'
import type { GameModesCopy, Setup } from '@/game/modes'
import type { GameOverCopy } from '@/table/GameOver/GameOver'
import type { HandItem } from '@/table/Hand/Hand'
import type { HistoryEntry, MoveHistoryCopy } from '@/table/MoveHistory/MoveHistory'
import type { Participant, ParticipantsCopy, Spectator } from '@/table/Participants/Participants'
import type { PauseGameCopy, PausePlayer } from '@/table/PauseGame/PauseGame'
import type { ReconnectCopy } from '@/table/Reconnect'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import type { SeatCopy } from '@/table/Seat/Seat'
import type { TurnDockCopy, TurnDockState } from '@/table/TurnDock/TurnDock'

export type Panel = 'settings' | 'history' | 'participants' | 'rules' | 'modes'

export interface TableOpponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

// Everything the engine's projection can answer. Assembled by the consumer's
// adapter; nothing here is room- or session-shaped.
export interface TableState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
  }
  opponents: TableOpponent[]
  decks: {
    main: number
    events: number
    discard?: Card | null
    discardCount: number
  }
  turn?: string
  history: HistoryEntry[]
  setup: Setup
}

// Everything the session/P2P layer answers. The engine has no concept of a
// spectator, a room code, or a pause.
export interface TableRoom {
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
}

// Собственный «хром»-текст стола по языку (бейдж выбывания + подписи стопок).
export interface TableChromeCopy {
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

export interface TableCopyBundle {
  table: TableChromeCopy
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
}

export interface TableSlots {
  // App-only chrome the playground has no equivalent of: navigation out of the
  // match, and the consumer's non-fatal error notice.
  corner?: ReactNode
  banner?: ReactNode
}

export interface TableOver {
  winnerId: string
  condition?: 'release' | 'lastStanding'
}

export interface TableProps {
  state: TableState
  room: TableRoom
  copy: TableCopyBundle
  slots?: TableSlots
  over?: TableOver | null
  onOverContinue?: () => void
  view?: ViewState | null
  turnDockState?: TurnDockState
  turnDockDanger?: boolean
  turnDockSeconds?: number
  turnDockProgress?: number
  // Controlled/uncontrolled: omit both and Table owns the open panel. Supply
  // `panel` and Table renders exactly what it is told, reporting intent through
  // `onPanelChange` — which is how the page binds the drawer to the URL.
  panel?: Panel | null
  onPanelChange?: (panel: Panel | null) => void
}

// Retired in Task 3 — kept here so Task 1 stays a pure regrouping.
export type ViewState = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'
