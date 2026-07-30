import { type ReactNode, useEffect, useRef, useState } from 'react'
import LangSwitcher, { type SwitchLang } from '@/blocks/LangSwitcher'
import LobbyCode, { type LobbyCodeCopy } from '@/blocks/LobbyCode'
import Rules, { type RulesCopy } from '@/blocks/Rules'
import type { Card } from '@/cards/types'
import type { GameModesCopy, Setup } from '@/game/modes'
import GearIcon from '@/icons/GearIcon'
import Badge from '@/primitives/Badge'
import Drawer from '@/primitives/Drawer'
import HudBackground from '@/primitives/HudBackground'
import Pile from '@/primitives/Pile'
import Slider from '@/primitives/Slider'
import TabRail, { type TabRailItem } from '@/primitives/TabRail'
import Toggle from '@/primitives/Toggle'
import Typography from '@/primitives/Typography'
import GameModes from '@/table/GameModes'
import GameOver from '@/table/GameOver'
import type { GameOverCondition, GameOverCopy } from '@/table/GameOver/GameOver'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import MoveHistory from '@/table/MoveHistory'
import type { HistoryEntry, MoveHistoryCopy } from '@/table/MoveHistory/MoveHistory'
import Participants from '@/table/Participants'
import type { Participant, ParticipantsCopy, Spectator } from '@/table/Participants/Participants'
import PauseGame, { type PauseGameCopy, type PausePlayer } from '@/table/PauseGame/PauseGame'
import Reconnect, { type ReconnectCopy } from '@/table/Reconnect'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import type { SeatCopy } from '@/table/Seat/Seat'
import TurnDock, { type TurnDockCopy, type TurnDockState } from '@/table/TurnDock/TurnDock'
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

type Panel = 'settings' | 'history' | 'participants' | 'rules' | 'modes'
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
  modesCopy: GameModesCopy
  // текст правил по языку (панель «правила»)
  rulesCopy: RulesCopy
  // текст мест оппонентов по языку (статус / счётчик карт)
  seatCopy: SeatCopy
  // текст панели «участники» по языку
  participantsCopy: ParticipantsCopy
  // текст ленты ходов по языку
  historyCopy: MoveHistoryCopy
  // текст окна переподключения по языку
  reconnectCopy: ReconnectCopy
  // текст окна завершения партии по языку
  gameOverCopy: GameOverCopy
  // собственный «хром»-текст стола по языку
  copy: TableCopy
  // текст блока кода игры (передаётся дальше в LobbyCode)
  lobbyCodeCopy: LobbyCodeCopy
  // текущий язык и его смена — для свитчера языка в служебной вкладке
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  // код игры — показывается в служебной вкладке (для зрителей), с копированием
  code?: string
  // роль: хост видит управление (лимит зрителей, исключение зрителей)
  role?: 'host' | 'guest'
  // лимит зрителей и его смена — слайдер в служебной вкладке (только для хоста)
  spectatorLimit?: number
  onSpectatorLimitChange?: (n: number) => void
  // исключение зрителя из панели «участники» (только для хоста)
  onKickSpectator?: (id: string) => void
  // состояние служебного дока хода (в игре — от логики; в песочнице — из истории)
  turnDockState?: TurnDockState
  // danger-тон реакции (напр. Error 503) — красная реакция вместо янтарной
  turnDockDanger?: boolean
  // localized TurnDock strings — from the central catalog, supplied by the consumer
  turnDockCopy: TurnDockCopy
  // turn clock — seconds left and 0..1 progress driving the TurnDock ring;
  // passed through so game/sandbox turn state controls the countdown (the
  // defaults are static placeholders until the rules engine wires it up)
  turnDockSeconds?: number
  turnDockProgress?: number
  // ===== pause (host-only) =====
  // game paused — greys the dock and shows the pause window over the play area
  // (the right-hand nav stays live). Toggled by the host from settings.
  paused?: boolean
  // host toggles pause on/off from the settings drawer; the window's central
  // resume button calls this with `false`
  onPauseChange?: (on: boolean) => void
  // readiness lamps in the pause window — one per player (green ready / red not)
  pausePlayers?: PausePlayer[]
  // which lamp is the local player's (tappable) and which is the host's (tagged)
  pauseSelfId?: string
  pauseHostId?: string
  // toggle the local player's readiness lamp
  onPauseToggleReady?: () => void
  // localized pause-window strings — required for the window to render
  pauseCopy?: PauseGameCopy
}

// светофор для лимита зрителей (зеркало палитры из экрана Lobby):
// 0–8 зелёный, 9–18 жёлтый, 19–28 красный
const SPEC_MAX = 28
function specColorFor(n: number) {
  if (n <= 8) return '#8fd9b0'
  if (n <= 18) return '#e3b341'
  return '#ff6b81'
}

// Ширина выезжающей панели зависит от типа контента вкладки.
const DRAWER_WIDTH: Record<Panel, number> = {
  settings: 320, // настройки — узкая
  history: 420, // история — немного шире
  participants: 420, // участники — как история
  modes: 680, // режимы — как правила
  rules: 680, // правила — сильно шире
}

// Собственный «хром»-текст стола по языку (бейдж выбывания + подписи стопок).
export interface TableCopy {
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

const EMPTY_RELEASE: ReleaseSlots = {
  frontend: undefined,
  backend: undefined,
  database: undefined,
}

// ===== settings drawer building blocks =====
// A titled cluster of settings fields. The heading is optional: a non-host
// player sees a single, self-evident group and needs no heading; the host sees
// two groups (general + host controls) and both are titled to tell them apart.
function SettingsGroup({ title, children }: { title?: string; children: ReactNode }) {
  return (
    <section className={styles.group}>
      {title && (
        <Typography as="div" base="tag" tk="tk-10" className={styles.groupHead}>
          {title}
        </Typography>
      )}
      {children}
    </section>
  )
}

// One settings unit — the single pattern shared by every control: a caption on
// top, the control, and an optional hint below. The control owns its own width
// (the spectator slider fills via .sliderFull).
function SettingsField({
  label,
  hint,
  children,
}: {
  label?: string
  hint?: string
  children: ReactNode
}) {
  return (
    <div className={styles.field}>
      {label && (
        <Typography as="div" variant="metaLabel" className={styles.fieldLabel}>
          {label}
        </Typography>
      )}
      {children}
      {hint && (
        <Typography as="div" base="mono-xs" className={styles.fieldHint}>
          {hint}
        </Typography>
      )}
    </div>
  )
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Table({
  state,
  over = null,
  onOverContinue,
  view = null,
  modesCopy,
  rulesCopy,
  seatCopy,
  participantsCopy,
  historyCopy,
  reconnectCopy,
  gameOverCopy,
  copy,
  lobbyCodeCopy,
  lang,
  onLangChange,
  code,
  role = 'guest',
  spectatorLimit,
  onSpectatorLimitChange,
  onKickSpectator,
  turnDockState = 'push',
  turnDockDanger = false,
  turnDockCopy,
  turnDockSeconds = 16,
  turnDockProgress = 0.55,
  paused = false,
  onPauseChange,
  pausePlayers = [],
  pauseSelfId,
  pauseHostId,
  onPauseToggleReady,
  pauseCopy,
}: TableProps) {
  const { you, opponents, decks, turn, history, setup, participants, spectators } = state
  const [panel, setPanel] = useState<Panel | null>(null)

  const isHost = role === 'host'
  const codeCopy = lobbyCodeCopy
  const turnCopy = turnDockCopy
  // служебный док хода — состояние приходит пропсами (в игре — от логики хода,
  // в песочнице — из селектора истории); имя активного игрока берём со стола
  const dockPlayer = opponents[0]?.name
  // секция управления хоста в настройках: лимит зрителей и/или пауза игры
  const canLimitSpectators = isHost && Boolean(onSpectatorLimitChange) && spectatorLimit != null
  const canPause = isHost && Boolean(onPauseChange) && Boolean(copy.pauseGame)
  const hostControls = canLimitSpectators || canPause
  const hasUpperSettings = Boolean(lang && onLangChange) || Boolean(code)

  // текстовые вкладки рейла (порядок = сверху вниз), подписи — по языку
  const textTabs: TabRailItem[] = [
    { id: 'history', label: copy.tabHistory },
    { id: 'participants', label: copy.tabParticipants },
    { id: 'rules', label: copy.tabRules },
    { id: 'modes', label: copy.tabModes },
  ]

  // квадратная вкладка «настройки» (шестерёнка) — когда есть что показать
  // (свитчер языка и/или код игры); служебный слот под визуальные опции
  const hasSettings = Boolean(onLangChange) || Boolean(code) || Boolean(hostControls)
  const railItems: TabRailItem[] = hasSettings
    ? [{ id: 'settings', label: copy.settings, icon: <GearIcon /> }, ...textTabs]
    : textTabs

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
      <HudBackground tone="neutral" className={styles.bgLayer} />

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
        <Pile label={copy.deck} deck="base" count={decks.main} width={150} countPos="tl" />
        <Pile label={copy.events} deck="ai" count={decks.events} width={150} countPos="tl" />
      </div>

      <div className={styles.discard}>
        <Pile label={copy.discard} topCard={decks.discard} count={decks.discardCount} width={116} />
      </div>

      <div className={styles.you}>
        {youEliminated ? (
          <Badge size="lg" className={styles.youBadge}>
            {copy.youEliminated}
          </Badge>
        ) : (
          <>
            <ReleaseZone release={you.release} size="100px" />
            <div className={styles.handWrap}>
              <Hand items={you.hand} />
            </div>
          </>
        )}
      </div>

      {/* служебный док хода — низ слева, под колодами, слева от руки */}
      <div className={styles.turnDock}>
        <TurnDock
          state={turnDockState}
          danger={turnDockDanger}
          seconds={turnDockSeconds}
          progress={turnDockProgress}
          activePlayer={dockPlayer}
          copy={turnCopy}
          paused={paused}
        />
      </div>

      {/* вертикальный рейл у правого края — переключает панели drawer */}
      <TabRail items={railItems} active={panel} onSelect={(id) => toggle(id as Panel)} />

      {/* выезжающая панель поверх контента (ширина — per-tab) */}
      <Drawer open={panel !== null} width={drawerWidth} className={styles.drawer}>
        {panel === 'settings' && (
          <div className={styles.settings}>
            {hasUpperSettings && (
              <SettingsGroup title={isHost ? copy.generalTitle : undefined}>
                {lang && onLangChange && (
                  <SettingsField label={copy.langTitle}>
                    <LangSwitcher
                      value={lang}
                      onChange={onLangChange}
                      variant="full"
                      align="start"
                    />
                  </SettingsField>
                )}
                {code && (
                  <SettingsField label={copy.codeTitle}>
                    <LobbyCode
                      code={code}
                      copy={codeCopy}
                      align="start"
                      reverse
                      showLabel={false}
                    />
                  </SettingsField>
                )}
              </SettingsGroup>
            )}
            {hostControls && (
              <>
                {hasUpperSettings && <div className={styles.divider} />}
                <SettingsGroup title={copy.hostTitle}>
                  {canLimitSpectators && (
                    <SettingsField label={copy.specLimit}>
                      <Slider
                        value={spectatorLimit ?? 0}
                        min={0}
                        max={SPEC_MAX}
                        onChange={(n) => onSpectatorLimitChange?.(n)}
                        color={specColorFor(spectatorLimit ?? 0)}
                        fill
                        className={styles.sliderFull}
                      />
                    </SettingsField>
                  )}
                  {canPause && (
                    <SettingsField label={copy.pauseGame} hint={copy.pauseHint}>
                      <Toggle on={paused} onChange={(on) => onPauseChange?.(on)}>
                        {(paused ? copy.pauseOn : copy.pauseOff) ?? copy.pauseGame}
                      </Toggle>
                    </SettingsField>
                  )}
                </SettingsGroup>
              </>
            )}
          </div>
        )}
        {panel === 'history' && <MoveHistory entries={history} copy={historyCopy} />}
        {panel === 'participants' && (
          <Participants
            players={participants}
            spectators={spectators}
            copy={participantsCopy}
            isHost={isHost}
            onKickSpectator={onKickSpectator}
          />
        )}
        {panel === 'rules' && (
          <div className={styles.scrollPanel}>
            <Rules copy={rulesCopy} />
          </div>
        )}
        {panel === 'modes' && <GameModes setup={setup} copy={modesCopy} />}
      </Drawer>

      {/* pause window — over the play area, below the right-hand nav (its own
          z-index), so the rail + drawer stay live while the game is frozen */}
      {paused && pauseCopy && (
        <PauseGame
          players={pausePlayers}
          selfId={pauseSelfId}
          hostId={pauseHostId}
          isHost={isHost}
          onToggleReady={onPauseToggleReady}
          onResume={() => onPauseChange?.(false)}
          copy={pauseCopy}
        />
      )}

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
