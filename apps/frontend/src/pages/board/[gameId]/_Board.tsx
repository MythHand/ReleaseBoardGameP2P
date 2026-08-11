// Forked from apps/ui/src/table/Table/Table.tsx (2026-08-11, #89).
//
// The board screen lives here now because the deal intro animates into the real
// Hand's DOM, which a component in another package cannot expose. @release/ui's
// Table keeps its copy and keeps serving the playground's TableStory — so the
// two will drift, and contract.test-d.ts is what makes the drift a compile
// error instead of a misrender.

import {
  Arrow,
  Badge,
  Button,
  centerOf,
  Drawer,
  deriveDock,
  GameModes,
  GameOver,
  GearIcon,
  Hand,
  HEAP_SHOW,
  HudBackground,
  LangSwitcher,
  LobbyCode,
  MoveHistory,
  Participants,
  PauseGame,
  PendingPrompt,
  Pile,
  Reconnect,
  type ReleaseSlots,
  ReleaseZone,
  Rules,
  Seat,
  Slider,
  TabRail,
  type TabRailItem,
  Toggle,
  TurnDock,
  Typography,
  useArrow,
} from '@release/ui'
import type React from 'react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import type { BoardProps, Panel } from '~/entities/game/board/types'
import styles from './_Board.module.css'
import { useBoardInteractions } from './_useBoardInteractions'

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
export default function Board({
  state,
  room,
  copy,
  slots,
  over = null,
  actions,
  dock,
  now,
  panel: panelProp,
  onPanelChange,
}: BoardProps) {
  const { you, opponents, decks, turn, history, setup } = state
  const derived = deriveDock(state, state.selfId, now)
  const dockView = { ...derived, ...dock }
  const {
    role = 'guest',
    code,
    participants,
    spectators,
    spectatorLimit,
    onSpectatorLimitChange,
    onKickSpectator,
    lang,
    onLangChange,
    paused = false,
    onPauseChange,
    pausePlayers = [],
    pauseSelfId,
    pauseHostId,
    onPauseToggleReady,
  } = room
  const [ownPanel, setOwnPanel] = useState<Panel | null>(null)
  const controlled = panelProp !== undefined
  const panel = controlled ? panelProp : ownPanel

  // gesture machine (Tasks 6–7): turns clicks into completed intents. Legality
  // is always the engine's answer (state.playable / actions.legalTargets) —
  // Table only renders what the hook decided, never re-derives it.
  const gestures = useBoardInteractions({
    state,
    actions,
    comboOptions: (card) => state.comboOptions?.[card] ?? [],
  })

  // targeting arrow: origin is the SOURCE card's slot — `gestures.selected`,
  // resolved through `data-hand-slot` — not whatever was clicked most
  // recently. `selected` stays the source through the whole combo-then-target
  // sequence (the partner click only sets `combo`), so re-deriving the origin
  // from it on every phase change keeps the arrow anchored to the source even
  // when a combo partner is picked afterwards. The tip follows the cursor via
  // the mousemove listener inside useArrow, which is only mounted while
  // `active` is true — kept in lockstep with `phase === 'selected'` here, so
  // it comes down on every exit from that phase, including unmount.
  //
  // The effect is keyed on `phase`/`selected` only — NOT on `you.hand` — on
  // purpose: it arms once per selection, not once per render. `you.hand` is a
  // fresh array on every projection update (Milestone 3's `toTableState`
  // rebuilds `TableState` from scratch each time), and `Table` re-renders on
  // the turn clock; if `you.hand` were a dependency, every such re-render
  // while a target is pending would re-run `arrow.aim(origin)`, which sets
  // `to = origin` and snaps the tracked cursor position back to the source —
  // discarding whatever the mousemove listener had followed it to. `you.hand`
  // is still read inside the effect (to resolve the selected uid's slot
  // element), just not watched for changes.
  const handRef = useRef<HTMLDivElement>(null)
  const arrow = useArrow()
  // biome-ignore lint/correctness/useExhaustiveDependencies: `you.hand` is read to resolve the selected uid's slot element, not watched — see the comment above for why it must stay out of the dependency array
  useEffect(() => {
    if (gestures.phase !== 'selected') {
      arrow.stop()
      return
    }
    const index = gestures.selected ? you.hand.findIndex((c) => c.uid === gestures.selected) : -1
    const slotEl =
      index >= 0
        ? handRef.current?.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
        : undefined
    if (slotEl) arrow.aim(centerOf(slotEl))
  }, [gestures.phase, gestures.selected, arrow.aim, arrow.stop])

  // Escape cancels an in-flight target selection. Bound to the window (not a
  // React onKeyDown) so it fires regardless of what currently has focus, and
  // — like the arrow's mousemove — only while there is something to cancel.
  useEffect(() => {
    if (gestures.phase !== 'selected') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') gestures.cancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [gestures.phase, gestures.cancel])

  // A click that lands outside any hand slot while a target is pending reads
  // as "changed my mind" — cancel. Clicks that land on a legal target already
  // resolve (and reset) through onTargetPick before bubbling here, so this is
  // a no-op in that case, not a race.
  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (gestures.phase !== 'selected') return
    const target = e.target as HTMLElement
    if (target.closest('[data-hand-slot]')) return
    gestures.cancel()
  }

  const isHost = role === 'host'
  // секция управления хоста в настройках: лимит зрителей и/или пауза игры
  const canLimitSpectators = isHost && Boolean(onSpectatorLimitChange) && spectatorLimit != null
  const canPause = isHost && Boolean(onPauseChange) && Boolean(copy.table.pauseGame)
  const hostControls = canLimitSpectators || canPause
  const hasUpperSettings = Boolean(lang && onLangChange) || Boolean(code)

  // текстовые вкладки рейла (порядок = сверху вниз), подписи — по языку
  const textTabs: TabRailItem[] = [
    { id: 'history', label: copy.table.tabHistory },
    { id: 'participants', label: copy.table.tabParticipants },
    { id: 'rules', label: copy.table.tabRules },
    { id: 'modes', label: copy.table.tabModes },
  ]

  // квадратная вкладка «настройки» (шестерёнка) — когда есть что показать
  // (свитчер языка и/или код игры); служебный слот под визуальные опции
  const hasSettings = Boolean(onLangChange) || Boolean(code) || Boolean(hostControls)
  const railItems: TabRailItem[] = hasSettings
    ? [{ id: 'settings', label: copy.table.settings, icon: <GearIcon /> }, ...textTabs]
    : textTabs

  // завершение партии — оверлей поверх стола (триггерится извне)
  const overWinner = over ? participants.find((p) => p.id === over.winnerId) : null
  const youEliminated = Boolean(you.eliminated)
  const disconnectedIds = new Set(room.disconnected ?? [])

  const toggle = (p: Panel) => {
    const next = panel === p ? null : p
    if (!controlled) setOwnPanel(next)
    onPanelChange?.(next)
  }

  // при закрытии держим ширину последней открытой вкладки — чтобы панель
  // уезжала своей шириной, без скачка; при смене вкладок ширина плавно меняется
  const lastOpen = useRef<Panel>('history')
  useEffect(() => {
    if (panel) lastOpen.current = panel
  }, [panel])
  const drawerWidth = DRAWER_WIDTH[panel ?? lastOpen.current]

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: backdrop click-to-cancel for an in-flight target selection; the accessible affordance is the Escape handler above
    <div className={styles.table} onClick={handleTableClick} role="presentation">
      <HudBackground tone="neutral" className={styles.bgLayer} />
      <Arrow from={arrow.from} to={arrow.to} />

      {slots?.banner && <div className={styles.banner}>{slots.banner}</div>}
      {slots?.corner && <div className={styles.corner}>{slots.corner}</div>}

      <div className={styles.opponents}>
        {opponents.map((p) => {
          const eliminated = Boolean(p.eliminated)
          const disconnected = disconnectedIds.has(p.id)
          // выбыл → карты в сброс: пустая зона релиза, рука = 0
          const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
          return (
            <Seat
              key={p.id}
              player={shown}
              active={turn === p.id}
              eliminated={eliminated}
              disconnected={disconnected}
              copy={copy.seat}
              onPick={(target) => gestures.onTargetPick(target)}
              targets={gestures.targets}
            />
          )
        })}
      </div>

      <div className={styles.decks}>
        <Pile label={copy.table.deck} deck="base" count={decks.main} width={150} countPos="tl" />
        <Pile label={copy.table.events} deck="ai" count={decks.events} width={150} countPos="tl" />
      </div>

      {/* сброс — наброшенная куча, как на столе: видны верхние карты, под ними
          «глубина» стопки, счётчик показывает весь сброс */}
      <div className={styles.discard}>
        <Pile
          label={copy.table.discard}
          heap={decks.discardHeap}
          heapShow={HEAP_SHOW}
          topCard={decks.discard}
          count={decks.discardCount}
          width={116}
        />
      </div>

      <div className={styles.you}>
        {youEliminated ? (
          <Badge size="lg" className={styles.youBadge}>
            {copy.table.youEliminated}
          </Badge>
        ) : (
          <>
            <ReleaseZone
              release={you.release}
              size="100px"
              player={state.selfId}
              onPick={(target) => gestures.onTargetPick(target)}
              targets={gestures.targets}
            />
            <div className={styles.handWrap} ref={handRef}>
              <Hand
                items={you.hand}
                onCardClick={(i) => gestures.onCardClick(i)}
                accentAt={gestures.accentAt}
              />
            </div>
          </>
        )}
      </div>

      {/* служебный док хода — низ слева, под колодами, слева от руки */}
      <div className={styles.turnDock}>
        <TurnDock
          state={dockView.state}
          danger={dockView.danger}
          seconds={dockView.seconds}
          progress={dockView.progress}
          activePlayer={dockView.activePlayer}
          copy={copy.turnDock}
          paused={paused}
          onDraw={actions?.onDraw ? () => actions.onDraw?.() : undefined}
          onPush={actions?.onPush}
          onPass={actions?.onPass}
        />
        {/* you already passed on the open window — TurnDock has no notion of
            "unpass", so the affordance to take it back lives here instead */}
        {state.window?.passed.includes(state.selfId) && (
          <Button variant="tech" className={styles.unpass} onClick={() => actions?.onUnpass?.()}>
            {copy.window.unpass}
          </Button>
        )}
      </div>

      {/* the engine is waiting on a decision from you — a pending owed to you
          always renders, regardless of whose turn the projection says it is */}
      {state.pending?.player === state.selfId && (
        <PendingPrompt
          pending={state.pending}
          hand={you.hand}
          copy={copy.pending}
          onResolve={(choice) => actions?.onResolve?.(choice)}
        />
      )}

      {/* вертикальный рейл у правого края — переключает панели drawer */}
      <TabRail items={railItems} active={panel} onSelect={(id) => toggle(id as Panel)} />

      {/* выезжающая панель поверх контента (ширина — per-tab) */}
      <Drawer open={panel !== null} width={drawerWidth} className={styles.drawer}>
        {panel === 'settings' && (
          <div className={styles.settings}>
            {hasUpperSettings && (
              <SettingsGroup title={isHost ? copy.table.generalTitle : undefined}>
                {lang && onLangChange && (
                  <SettingsField label={copy.table.langTitle}>
                    <LangSwitcher
                      value={lang}
                      onChange={onLangChange}
                      variant="full"
                      align="start"
                    />
                  </SettingsField>
                )}
                {code && (
                  <SettingsField label={copy.table.codeTitle}>
                    <LobbyCode
                      code={code}
                      copy={copy.lobbyCode}
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
                <SettingsGroup title={copy.table.hostTitle}>
                  {canLimitSpectators && (
                    <SettingsField label={copy.table.specLimit}>
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
                    <SettingsField label={copy.table.pauseGame} hint={copy.table.pauseHint}>
                      <Toggle on={paused} onChange={(on) => onPauseChange?.(on)}>
                        {(paused ? copy.table.pauseOn : copy.table.pauseOff) ??
                          copy.table.pauseGame}
                      </Toggle>
                    </SettingsField>
                  )}
                </SettingsGroup>
              </>
            )}
          </div>
        )}
        {panel === 'history' && (
          <div data-testid="panel-history">
            <MoveHistory entries={history} copy={copy.history} />
          </div>
        )}
        {panel === 'participants' && (
          <Participants
            players={participants}
            spectators={spectators}
            copy={copy.participants}
            isHost={isHost}
            onKickSpectator={onKickSpectator}
          />
        )}
        {panel === 'rules' && (
          <div className={styles.scrollPanel}>
            <Rules copy={copy.rules} />
          </div>
        )}
        {panel === 'modes' && <GameModes setup={setup} copy={copy.modes} />}
      </Drawer>

      {/* pause window — over the play area, below the right-hand nav (its own
          z-index), so the rail + drawer stay live while the game is frozen */}
      {paused && copy.pause && (
        <PauseGame
          players={pausePlayers}
          selfId={pauseSelfId}
          hostId={pauseHostId}
          isHost={isHost}
          onToggleReady={onPauseToggleReady}
          onResume={() => onPauseChange?.(false)}
          copy={copy.pause}
        />
      )}

      {room.connection === 'reconnecting' && <Reconnect copy={copy.reconnect} />}

      {over && (
        <GameOver
          winner={overWinner}
          condition={over.condition}
          onContinue={actions?.onOverContinue}
          copy={copy.gameOver}
        />
      )}
    </div>
  )
}
