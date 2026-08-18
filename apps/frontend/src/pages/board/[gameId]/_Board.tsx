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
  Card,
  cardById,
  centerOf,
  type DockView,
  Drawer,
  deriveDock,
  GameModes,
  GameOver,
  GearIcon,
  Hand,
  HudBackground,
  LangSwitcher,
  LobbyCode,
  MoveHistory,
  Participants,
  PauseGame,
  PendingPrompt,
  Pile,
  pileWidthFor,
  Reconnect,
  type ReleaseSlots,
  ReleaseZone,
  Rules,
  Seat,
  Slider,
  type TableActions,
  TabRail,
  type TabRailItem,
  Toggle,
  TurnDock,
  Typography,
  useArrow,
} from '@release/ui'
import { HEAP_SHOW, restTransform } from '@release/ui/animations'
import type React from 'react'
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
// The screen's geometry is the KIT's stylesheet, imported rather than copied:
// where every block sits, how big it is, what it overlaps. The board is a fork
// of @release/ui's Table and the playground is where this screen is designed
// and approved, so a second copy of those values would drift one at a time with
// nothing to catch it — a type check cannot see a position. `opening` holds only
// what the deal adds on top.
import kit from '@/table/Table/Table.module.css'
import { useBoardAnchors } from '~/entities/game/board'
import type { BoardProps, Panel } from '~/entities/game/board/types'
import { useBeats } from '~/features/board-beats'
import { useDealIntro } from '~/features/game-intro/useDealIntro'
import opening from './_Board.module.css'
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

// The board while the intro runs: nothing the player does may reach the game.
// One frozen object, so the gesture hook is not handed a new identity on every
// frame of the deal.
const INERT_ACTIONS: TableActions = {}

const cls = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' ')

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
    <section className={kit.group}>
      {title && (
        <Typography as="div" base="tag" tk="tk-10" className={kit.groupHead}>
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
    <div className={kit.field}>
      {label && (
        <Typography as="div" variant="metaLabel" className={kit.fieldLabel}>
          {label}
        </Typography>
      )}
      {children}
      {hint && (
        <Typography as="div" base="mono-xs" className={kit.fieldHint}>
          {hint}
        </Typography>
      )}
    </div>
  )
}

// Стол = активное состояние игры. Каждый блок позиционируется независимо
// (абсолютно), без жёсткой сетки. Заполняет экран без скролла.
export default function Board({
  state: live,
  room,
  copy,
  slots,
  over = null,
  actions: liveActions,
  dock,
  now,
  panel: panelProp,
  onPanelChange,
  intro,
}: BoardProps) {
  // ===== the opening =====
  // Every node a flight aims at or leaves from — the board's own registry, not
  // just the deal's. The shift the `hudIn` preset applies rides on `transform`,
  // so a block whose own transform holds its position (the seats' row, the
  // decks column) is animated through an INNER node — hence the wrappers below
  // rather than the positioned blocks themselves.
  const anchors = useBoardAnchors()

  // The blocks stay hidden from the FIRST committed frame until the intro is
  // over — not merely while it is `active`. `hudIn` only holds a block down
  // once its own animation exists, and the last of them is armed seconds in.
  const [introOver, setIntroOver] = useState(false)
  const onIntroDone = useCallback(() => {
    setIntroOver(true)
    intro?.onDone()
  }, [intro?.onDone])
  const deal = useDealIntro({
    live,
    gameId: intro?.gameId ?? null,
    view: intro?.view ?? null,
    events: intro?.events ?? [],
    refs: anchors,
    onDone: onIntroDone,
  })
  // One queue, for everything that moves. The opening goes in as beat zero and
  // the wire's own beats queue behind it — one place that decides what plays,
  // in what order, and whether it plays at all under prefers-reduced-motion.
  //
  // `enabled` gates only the WIRE's beats, not the opening: until the deal is
  // over, the events that produced the board's first projection are the deal's
  // own, and replaying them as discards would fly cards that never left a hand
  // on screen.
  const beats = useBeats({
    live,
    events: intro?.events ?? [],
    anchors,
    enabled: introOver || intro == null,
    intro: deal.beat,
  })
  const entering = intro != null && !introOver
  const enter = entering ? opening.enter : undefined
  // While the deal runs the board renders its shadow of the projection, and
  // afterwards a beat renders its own. The shadow's last frame IS the
  // projection, so either handover changes nothing on screen — provided nothing
  // here keys off `introPhase`, and nothing does. The deal wins the tie: it is
  // the only shadow that exists before the queue is even armed.
  const state = deal.shadow ?? beats.shadow ?? live
  // Only the opening freezes the table. A discard is a thing that HAPPENED, not
  // a thing being decided, so the fan stays live while one flies out
  // (docs/animations/README.md — "Gating the hand", approach 3); `exclusive` is
  // the queue's own answer, and today nothing but the opening sets it.
  const actions = deal.active || beats.exclusive ? INERT_ACTIONS : liveActions

  const { you, opponents, decks, turn, history, setup } = state
  const derived = deriveDock(state, state.selfId, now)
  // Nobody is on turn during the opening: the dock stands in its waiting state
  // and names the moment where it would name a player.
  const dockView: DockView = deal.active
    ? { state: 'waiting', danger: false, seconds: 0, progress: 0, activePlayer: undefined }
    : { ...derived, ...dock }
  const dockCopy = deal.active
    ? { ...copy.turnDock, turnOf: copy.turnDock.gameStart }
    : copy.turnDock
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
  // (The slot comes from `anchors.handSlotAt` — the board's own registry, which
  // the deal and the beat queue read too, rather than a third copy of the
  // `[data-hand-slot]` query living in this effect.)
  const arrow = useArrow()
  // biome-ignore lint/correctness/useExhaustiveDependencies: `you.hand` is read to resolve the selected uid's slot element, not watched — see the comment above for why it must stay out of the dependency array
  useEffect(() => {
    if (gestures.phase !== 'selected') {
      arrow.stop()
      return
    }
    const index = gestures.selected ? you.hand.findIndex((c) => c.uid === gestures.selected) : -1
    const slotEl = index >= 0 ? anchors.handSlotAt(index) : null
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

  // Escape skips the opening. Same window binding and the same reason as the
  // cancel above; `finish` is idempotent, so a second press is a no-op.
  const dealFinish = deal.finish
  useEffect(() => {
    if (!deal.active) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dealFinish()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [deal.active, dealFinish])

  // A click that lands outside any hand slot while a target is pending reads
  // as "changed my mind" — cancel. Clicks that land on a legal target already
  // resolve (and reset) through onTargetPick before bubbling here, so this is
  // a no-op in that case, not a race.
  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    // …and anywhere on the table while the opening plays, it skips it.
    if (deal.active) {
      dealFinish()
      return
    }
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
    <div className={kit.table} onClick={handleTableClick} role="presentation">
      {/* the table's own ambience — a layer, so the opening can bring it in
          whole without touching the screen's base fill */}
      <div className={cls(opening.bgWrap, enter)} ref={anchors.bg}>
        <HudBackground tone="neutral" className={kit.bgLayer} />
      </div>
      <Arrow from={arrow.from} to={arrow.to} />

      {slots?.banner && <div className={kit.banner}>{slots.banner}</div>}
      {slots?.corner && <div className={kit.corner}>{slots.corner}</div>}

      {/* the seats: each in its own wrapper, so the opening can drop them in one
          after another and the deal can aim a card at the seat it belongs to */}
      <div className={kit.opponents} ref={anchors.seats}>
        {opponents.map((p) => {
          const eliminated = Boolean(p.eliminated)
          const disconnected = disconnectedIds.has(p.id)
          // выбыл → карты в сброс: пустая зона релиза, рука = 0
          const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
          return (
            <div
              key={p.id}
              className={enter}
              ref={(el) => {
                anchors.bindSeat(p.id, el)
              }}
            >
              <Seat
                player={shown}
                active={turn === p.id}
                eliminated={eliminated}
                disconnected={disconnected}
                copy={copy.seat}
                slotRef={(key, el) => anchors.bindReleaseSlot(p.id, key, el)}
                onPick={(target) => gestures.onTargetPick(target)}
                targets={gestures.targets}
              />
            </div>
          )
        })}
      </div>

      <div className={kit.decks}>
        <div className={cls(opening.deckStack, enter)} ref={anchors.decks}>
          <div className={opening.pileRow}>
            {decks.main.map((count, i) => (
              <Pile
                // biome-ignore lint/suspicious/noArrayIndexKey: a pile IS its index — the engine names it that way in `drawn.pile`, and a split leaves the halves where the pile was
                key={i}
                label={copy.table.deck}
                deck="base"
                count={count}
                width={pileWidthFor(decks.main.length)}
                countPos="tl"
                boxRef={(el) => anchors.bindPile(i, el)}
              />
            ))}
          </div>
          <Pile
            label={copy.table.events}
            deck="ai"
            count={decks.events}
            width={150}
            countPos="tl"
          />
        </div>
      </div>

      {/* сброс — наброшенная куча, как на столе: видны верхние карты, под ними
          «глубина» стопки, счётчик показывает весь сброс */}
      <div className={kit.discard}>
        <div className={enter} ref={anchors.discard}>
          <Pile
            label={copy.table.discard}
            heap={decks.discardHeap}
            heapShow={HEAP_SHOW}
            topCard={decks.discard}
            count={decks.discardCount}
            width={116}
            boxRef={anchors.discardBox}
          />
        </div>
      </div>

      {/* the centre: where cards stand while the table is looking at them — the
          player's own cards gather here during the opening, and every drawn card
          stages here for the rest of the match. Mounted for the whole life of
          the board, because a flight cannot aim at a node that is not there yet.
          pointer-events: none — outside a beat it is an empty box and must not
          catch clicks meant for the table. */}
      <div className={opening.centre} data-board-centre ref={anchors.centre}>
        {intro &&
          deal.staged.map((s) => {
            const data = cardById(s.card)
            if (!data) return null
            return (
              <div
                key={s.uid}
                className={opening.stagedCard}
                style={{ transform: restTransform(s.sc) }}
              >
                <Card card={data} faceDown={s.faceDown} interactive={false} width="100%" />
              </div>
            )
          })}
      </div>

      <div className={kit.you}>
        {youEliminated ? (
          <Badge size="lg" className={kit.youBadge}>
            {copy.table.youEliminated}
          </Badge>
        ) : (
          <>
            {/* the zone is the last thing to arrive: it is yours, and it comes
                once you have a hand to play from */}
            <div className={enter} ref={anchors.zone}>
              <ReleaseZone
                release={you.release}
                size="100px"
                player={state.selfId}
                slotRef={(key, el) => anchors.bindReleaseSlot(state.selfId, key, el)}
                onPick={(target) => gestures.onTargetPick(target)}
                targets={gestures.targets}
              />
            </div>
            <div className={kit.handWrap} ref={anchors.hand}>
              <Hand
                items={you.hand}
                // the fan opens room for the arriving heap while it travels —
                // the deal wins the tie, exclusive against every other beat
                // the same way it already wins the shadow's
                gapAt={deal.gapAt ?? beats.gapAt}
                gapSize={deal.gapAt == null ? beats.gapSize : deal.gapSize}
                // while the deal runs the hand is held: no clicks reach the
                // gesture machine, and the cards that travelled closed stay
                // closed until the flip. Both are gone the moment it ends, so
                // the released hand is the plain one this board always drew.
                onCardClick={deal.active ? undefined : (i) => gestures.onCardClick(i)}
                accentAt={gestures.accentAt}
                renderFace={
                  deal.active
                    ? (item, ctx) => (
                        <Card
                          card={item.card}
                          faceDown={deal.faceDown(item.uid)}
                          interactive={false}
                          tilt={ctx.tilt}
                          width={ctx.width}
                          state={ctx.state}
                          accent={ctx.accent}
                        />
                      )
                    : undefined
                }
              />
            </div>
          </>
        )}
      </div>

      {/* служебный док хода — низ слева, под колодами, слева от руки */}
      <div className={kit.turnDock}>
        <div className={enter} ref={anchors.dock}>
          <TurnDock
            state={dockView.state}
            danger={dockView.danger}
            seconds={dockView.seconds}
            progress={dockView.progress}
            activePlayer={dockView.activePlayer}
            copy={dockCopy}
            paused={paused}
            onDraw={actions?.onDraw ? () => actions.onDraw?.() : undefined}
            onPush={actions?.onPush}
            onPass={actions?.onPass}
          />
        </div>
        {/* you already passed on the open window — TurnDock has no notion of
            "unpass", so the affordance to take it back lives here instead */}
        {state.window?.passed.includes(state.selfId) && (
          <Button variant="tech" className={kit.unpass} onClick={() => actions?.onUnpass?.()}>
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

      {/* вертикальный рейл у правого края — переключает панели drawer. Слой
          нужен только чтобы вести его появление, не трогая его собственный
          transform (the rail is the first thing the opening brings in). */}
      {/* `inert` while the opening runs: the layer is faded to nothing but its
          buttons would still take a click and a Tab stop, so a player could open
          a drawer they cannot see. */}
      <div className={cls(opening.railLayer, enter)} ref={anchors.rail} inert={entering}>
        <TabRail items={railItems} active={panel} onSelect={(id) => toggle(id as Panel)} />
      </div>

      {/* выезжающая панель поверх контента (ширина — per-tab) */}
      <Drawer open={panel !== null} width={drawerWidth} className={kit.drawer}>
        {panel === 'settings' && (
          <div className={kit.settings}>
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
                {hasUpperSettings && <div className={kit.divider} />}
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
                        className={kit.sliderFull}
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
          <div className={kit.scrollPanel}>
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

      {/* the cards in the air: the carrier for the deal, the arrival step for
          the heap going into the fan, and the exit step for a card leaving it
          for the discard. Last, so they fly over everything. */}
      {deal.overlays}
      {beats.overlays}
    </div>
  )
}
