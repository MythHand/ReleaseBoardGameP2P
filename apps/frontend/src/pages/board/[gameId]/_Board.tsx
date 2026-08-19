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
  CardPair,
  cardById,
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
  useCardPreview,
} from '@release/ui'
import { HEAP_SHOW, restTransform } from '@release/ui/animations'
import type React from 'react'
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
// The screen's geometry is the KIT's stylesheet, imported rather than copied:
// where every block sits, how big it is, what it overlaps. The board is a fork
// of @release/ui's Table and the playground is where this screen is designed
// and approved, so a second copy of those values would drift one at a time with
// nothing to catch it — a type check cannot see a position. `opening` holds only
// what the deal adds on top.
import kit from '@/table/Table/Table.module.css'
import { COVER_POSE, useBoardAnchors } from '~/entities/game/board'
import type { BoardProps, Panel, StagedHandoff } from '~/entities/game/board/types'
import { useBeats } from '~/features/board-beats'
import { useDealIntro } from '~/features/game-intro/useDealIntro'
import { useHandOrder } from '~/features/hand-order/useHandOrder'
import opening from './_Board.module.css'
import { useBoardInteractions } from './_useBoardInteractions'
import { useBoardStaging } from './_useBoardStaging'
import { useDefenseStaging } from './_useDefenseStaging'

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
  state: liveRaw,
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

  // reading a card that stands at the centre — the shared block from the kit.
  // Five slots here (the release, its cost, the attack, the defender's sudo,
  // the cover), and each of them reads on its own.
  const { slotProps: previewProps, overlay: previewOverlay } = useCardPreview()

  // The player's own sort of their fan, applied to the projection BEFORE the
  // intro, the queue or the staging gesture see it — so every shadow a beat
  // publishes and every rect a flight measures already agrees with the fan on
  // screen. The engine has no hand order (it is a private, presentation fact),
  // which is why the overlay lives here and not in an action.
  const handOrder = useHandOrder(intro?.gameId ?? null)
  const live = useMemo(() => handOrder.arrange(liveRaw), [handOrder, liveRaw])

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
  // The staging → beat handoff (#100): a ref because the combo beat reads it
  // once at run start (I8), not a render's worth of state it would have to
  // wait on. Built below, once `useBoardStaging` exists to build it FROM — but
  // declared here, ahead of `useBeats`, because the ref's IDENTITY is all the
  // queue needs at this point; the layout effect that keeps `.current` current
  // runs after every hook regardless of where it sits in the function.
  const handoffRef = useRef<StagedHandoff | null>(null)
  // The same seam's second fact (#101, Task 11): a stable ref to
  // `useBoardStaging`'s own `clearPaidCost`, for the same reason `handoffRef`
  // above is a ref rather than a direct value — declared here, ahead of
  // `useBeats`, kept current by the layout effect further down once `staging`
  // exists to read it FROM.
  const clearPaidCostRef = useRef<(() => void) | null>(null)
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
    staging: handoffRef,
    clearPaidCost: clearPaidCostRef,
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

  // gesture machine: turns clicks into completed intents. Legality is always
  // the engine's answer (state.playable / state.targets) — Table only renders
  // what the hook decided, never re-derives it.
  const gestures = useBoardInteractions({ state, actions })

  // the staging gesture: pulling a card that needs a target out of the fan —
  // stands it at the centre, aims the arrow, dispatches on a lit target. Inert
  // under the same gate the click actions already have: the deal or an
  // exclusive beat owns the table.
  const staging = useBoardStaging({
    state,
    anchors,
    actions,
    events: intro?.events ?? [],
    enabled: !(deal.active || beats.exclusive),
  })

  // a `defend` pending owed to us means the defence hook owns the fan instead
  // of the turn hook — the two never run at once (the engine suspends normal
  // play while a window/pending is open), and this is the ONE derived
  // constant every call site below picks a hook by, rather than repeating the
  // condition at each one.
  const answering = state.pending?.kind === 'defend' && state.pending.player === state.selfId
  // the defence gesture (#101, Task 16): pulling a legal defence out of the
  // fan drops it over the attack and answers the pending at once. Same
  // `enabled` gate as the turn hook — the hook's own `pending` read is what
  // keeps it inert the rest of the time.
  const defenseStaging = useDefenseStaging({
    state,
    anchors,
    actions,
    events: intro?.events ?? [],
    enabled: !(deal.active || beats.exclusive),
  })
  // the defence once its own flight has landed (or at once, under reduced
  // motion) — gates the static cover render below against the carrier still
  // flying it there, same reason `stagedRelease` waits on `stageLanded`.
  const stagedCover =
    answering && defenseStaging.landed && defenseStaging.overlay.length === 0
      ? defenseStaging.staged?.main
      : undefined
  // its own node, for the staging → beat handoff below — the static cover
  // render, once it lands, is what `defenseBeat.runCovered` finds already
  // standing where the cover goes (Task 16's own report: Carry #2).
  const coverStagedRef = useRef<HTMLDivElement>(null)
  // the fan's own gap-while-a-return-flight-travels, from whichever hook is
  // live — `Hand`'s own gapAt/gapSize props fold this in below, behind the
  // deal's and the beat queue's own (unrelated) gaps.
  const liveGapAt = answering ? defenseStaging.gapAt : staging.gapAt
  const liveGapSize = answering ? defenseStaging.gapSize : staging.gapSize

  // the ONE card standing at the centre before a partner folds in — a plain
  // aim (`main`) or a support awaiting one (`support`). Once merged the pair
  // flyer owns the centre instead (see `opening.pairFlyer` below). A solo
  // release is excluded on purpose: `_useBoardStaging` stages it too (so the
  // fan hides it and a rejection returns it, the same as any other pull), but
  // it belongs at the STAGE slot, not here — `stagedRelease` below renders it
  // there, off the projection's own pending rather than off `staged`.
  const soloStaged =
    staging.staged && !staging.staged.merged && staging.staged.main?.card.category !== 'release'
      ? (staging.staged.support ?? staging.staged.main)
      : null
  // its own node, for the staging → beat handoff below — a plain aim/support
  // never merges, so it never gets the pair flyer's persistent node instead.
  const soloStagedRef = useRef<HTMLDivElement>(null)

  // the pending "defend" the attack slot answers for — read ONCE so the hover
  // preview below and the paint further down can never drift on what counts
  // as "occupying" the slot. `staging.staged` wins over a pending: the two can
  // only coincide for the instant between the local attacker's own dispatch
  // and the layout effect below collapsing it, and both readers now resolve
  // that tie the same way because they read the same value.
  const pendingDefend = !staging.staged && state.pending?.kind === 'defend' ? state.pending : null

  // the release standing at the stage slot while its cost is unpaid — read
  // ONCE, same reason as `pendingDefend` above, and its OWNERSHIP stated here
  // explicitly rather than leaned on the engine's own redaction of `.release`
  // the way the pre-fix render did: without the `player` check, an opponent's
  // own `discardForRelease` would still assign to this const (with `.release`
  // simply absent), which happens to resolve to nothing below only because
  // the redaction is doing that work silently — the same two-readers-drift
  // class already fixed once on this branch (see `pendingDefend`'s own note).
  const costPending =
    state.pending?.kind === 'discardForRelease' && state.pending.player === state.selfId
      ? state.pending
      : null
  // The staging gesture's OWN idea of the standing release — the same card
  // `onHandPlay` committed the instant it was pulled, kept (in `staging`)
  // until the projected pending arrives. `costPending` above is the canonical
  // source once it exists, but it is a network round trip away: on a fast
  // connection (the host peer's own can be near-instant) it can lag behind
  // the LOCAL flight that carries the release here, and on a slow one it can
  // arrive well after that flight has already landed — without this fallback
  // the slot would show nothing for that whole gap.
  const stagedReleaseLocal =
    staging.staged?.phase === 'dispatched' &&
    !staging.staged.support &&
    staging.staged.main?.card.category === 'release'
      ? staging.staged.main
      : undefined
  // `stageLanded` gates BOTH sources at once: the carrier that flew the
  // release to this slot still holds it until ITS OWN flight lands, and
  // rendering the static card any earlier — even off the projection, which
  // can arrive mid-flight on a fast connection — would double it, the same
  // reason `soloStaged` below is gated on `staging.overlay`. `releaseReturning`
  // (Task 9, fix round 1) is the SAME class of guard for the opposite
  // direction: a cancel's own return flight carries this exact card away, and
  // `costPending`/`stagedReleaseLocal` stay exactly as they were for the whole
  // flight (the projection is a round trip behind), so without it the static
  // render would double against THAT carrier instead. Deliberately NOT folded
  // into `staging.overlay.length === 0` the way `soloStaged` is — `overlay`
  // also carries the cost-payment flyer, which legitimately coexists with a
  // visible standing release.
  const stagedRelease =
    staging.stageLanded && !staging.releaseReturning
      ? ((costPending ? you.hand.find((c) => c.uid === costPending.release) : undefined) ??
        stagedReleaseLocal)
      : undefined

  // The staging → beat handoff (#100): kept current in a layout effect,
  // because `el` has to be the DOM node as THIS render actually committed it —
  // the pair flyer once a partner has folded in, the solo staged node
  // otherwise. `release` is the hook's own no-flight clear; the combo beat
  // calls it once its own read of this says the staged play is the one
  // standing where it is about to fold one in (I8).
  //
  // One ref, whichever hook is live (#101, Task 16): `answering` picks the
  // source the same way every other call site does, so `defenseBeat.runCovered`
  // reads OUR defence's own handoff for a `covered` beat, never a stale one
  // left over from the turn hook. `coverStagedRef` only binds once
  // `defenseStaging.landed` is true (both deps below), so `el` is non-null
  // exactly when the static cover render is what is actually standing there —
  // never a flyer that a reduced-motion path never raised (Carry #2).
  //
  // `defenseStaging.landed`/`.overlay` do not appear inside this effect's own
  // body — biome's static check reads them as removable — but they are what
  // makes it RE-RUN once `coverStagedRef.current` actually binds: `landed`
  // flips true (and `overlay` drops back to `[]`) on the SAME render the
  // static cover child mounts, and only a re-run of this effect, AFTER that
  // commit, ever reads the ref's freshly-bound value. Dropping either
  // dependency leaves `handoffRef.current.el` stuck at whatever it was the
  // last time `staged`/`release` changed identity — typically null, from the
  // instant right after the pull, before the ref had anything to bind to.
  // biome-ignore lint/correctness/useExhaustiveDependencies: landed/overlay gate a ref read, not a value the effect body itself references
  useLayoutEffect(() => {
    if (answering) {
      const ds = defenseStaging.staged
      handoffRef.current =
        ds?.phase === 'dispatched' && ds.main
          ? {
              mainUid: ds.main.uid,
              supportUid: ds.support?.uid,
              el: coverStagedRef.current,
              release: defenseStaging.release,
            }
          : null
      return
    }
    const s = staging.staged
    handoffRef.current =
      s?.phase === 'dispatched' && s.main
        ? {
            mainUid: s.main.uid,
            supportUid: s.support?.uid,
            el: s.merged ? staging.pairRef.current : soloStagedRef.current,
            release: staging.release,
          }
        : null
  }, [
    answering,
    defenseStaging.staged,
    defenseStaging.landed,
    defenseStaging.overlay,
    defenseStaging.release,
    staging.staged,
    staging.pairRef,
    staging.release,
  ])

  // The same seam's second fact (#101, Task 11): `clearPaidCostRef` kept
  // current the same way `handoffRef` above is. `staging.clearPaidCost` is
  // stable for the life of the mount (a `useCallback` with no deps), so this
  // effect fires once and never again in practice — it exists for the same
  // structural reason `handoffRef`'s does, not because the value actually
  // changes.
  useLayoutEffect(() => {
    clearPaidCostRef.current = staging.clearPaidCost
  }, [staging.clearPaidCost])

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

  // Escape cancels a staged card the same way a miss on the table does —
  // armed only while there is something to cancel (I8: a press after the play
  // already dispatched must not turn into a return flight). Widened to a
  // release awaiting its cost too (#101, Task 9): `staging.staged` is already
  // null by the time `staging.costOptions` is populated — the catch-up effect
  // in `_useBoardStaging.ts` clears it the moment the pending echoes back —
  // so the release's own window has nothing else to key its arming off.
  useEffect(() => {
    const armed = staging.staged ?? staging.costOptions.length > 0
    if (!armed || staging.dispatched) return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') staging.cancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [staging.staged, staging.dispatched, staging.costOptions.length, staging.cancel])

  // A release awaiting its cost has no `staging.staged` to key a click-based
  // miss off (see the Escape effect above) — so its own "changed my mind" is a
  // dedicated `mousedown` listener instead, ported from the approved source
  // (`DefenseReleaseStory`'s own `cancelStaged`/mousedown effect): the fan's
  // own pull gesture starts on mousedown too, so the press this has to ignore
  // is the SAME event a drag begins on, not the click that follows it. Kept
  // separate from `handleTableClick` below (rather than widened into it) so a
  // single physical press cannot fire `staging.cancel()` twice over — once
  // from this listener, once from the click that follows the same press —
  // and race `onResolve`/`arrival.arrive` against themselves.
  useEffect(() => {
    if (staging.costOptions.length === 0) return
    const onMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      if (target.closest('[data-hand-slot]')) return
      staging.cancel()
    }
    window.addEventListener('mousedown', onMouseDown)
    return () => window.removeEventListener('mousedown', onMouseDown)
  }, [staging.costOptions.length, staging.cancel])

  // Escape cancels a staged defence the same way a miss on the table does —
  // see `handleTableClick`'s own `answering` branch below. Task 16's plain
  // path commits and dispatches in the same tick (no cancellable aim phase),
  // so this is armed only for the brief span between a rejection and
  // `cancel()`'s own return flight taking over (`defenseStaging.cancel`'s own
  // guard refuses anything still `phase: 'dispatched'`).
  useEffect(() => {
    if (!answering) return
    const s = defenseStaging.staged
    if (!s || s.phase === 'dispatched') return
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') defenseStaging.cancel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [answering, defenseStaging.staged, defenseStaging.cancel])

  // A click that lands outside any hand slot while a card is staged reads as
  // "changed my mind" — cancel. Clicks that land on a lit target already
  // resolve through onTargetPick before bubbling here (I8's own guard in
  // `useBoardStaging` makes that safe even where the target itself does not
  // stop propagation); clicks inside the hand are the fan's own business.
  const handleTableClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (deal.active) {
      dealFinish()
      return
    }
    if (answering) {
      const s = defenseStaging.staged
      if (!s || s.phase === 'dispatched') return
      const target = e.target as HTMLElement
      if (target.closest('[data-hand-slot]')) return
      defenseStaging.cancel()
      return
    }
    if (!staging.staged || staging.dispatched) return
    const target = e.target as HTMLElement
    if (target.closest('[data-hand-slot]')) return
    staging.cancel()
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
    // biome-ignore lint/a11y/noStaticElementInteractions: click-anywhere-skips-the-opening AND click-anywhere-cancels-staging (handleTableClick owns both); the accessible affordance for each is its own Escape handler above
    <div
      className={kit.table}
      onClick={handleTableClick}
      role="presentation"
      data-testid="board-table"
    >
      {/* the table's own ambience — a layer, so the opening can bring it in
          whole without touching the screen's base fill */}
      <div className={cls(opening.bgWrap, enter)} ref={anchors.bg}>
        <HudBackground tone="neutral" className={kit.bgLayer} />
      </div>
      <Arrow from={staging.arrow.from} to={staging.arrow.to} />

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
                support={p.support}
                slotRef={(key, el) => anchors.bindReleaseSlot(p.id, key, el)}
                onPick={(t) => staging.onTargetPick(t)}
                targets={staging.targets}
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

      {/* the release stands here and does NOT land — by the rules it costs one
          card, and the cost is shown open beside it. Only then does it settle
          into its zone slot and the attack window opens. */}
      <div
        className={opening.stageSlot}
        data-centre-slot="stage"
        ref={anchors.stage}
        {...previewProps(stagedRelease?.card ?? null)}
      >
        {stagedRelease && <Card card={stagedRelease.card} interactive={false} width="100%" />}
      </div>
      <div
        className={opening.costSlot}
        data-centre-slot="cost"
        ref={anchors.cost}
        {...previewProps(staging.paidCost?.card ?? null)}
      >
        {/* the card that paid the release's cost — held open here, not
            discarded on the spot, until the combo beat's own cost leg flies it
            on and clears `paidCost` in the same commit (#101, Task 11:
            comboBeat.tsx's `runRelease`) */}
        {staging.paidCost && <Card card={staging.paidCost.card} interactive={false} width="100%" />}
      </div>
      {/* the defender's own Sudo waits in its OWN place until a defence is
          chosen for it — the arrow says what it is aimed at */}
      <div
        className={opening.sudoSlot}
        data-centre-slot="sudo"
        ref={anchors.sudo}
        {...previewProps(null)}
      />
      {/* the defence covering the attack — offset and tilted the other way.
          Axis-aligned itself (I6): the tilt lives on the inner `.pose` child,
          the same way the discard heap's own resting cards carry theirs, so
          `anchors.cover`'s own rect stays the true card box a flight can aim
          at. Rendered once the pulled defence's own flight has landed (or at
          once under reduced motion) — `defenseBeat.runCovered` finds this
          exact node already standing here through the handoff (#101, Task 16:
          Carry #2), rather than falling back to a seat box that is never
          bound for the local player. */}
      <div
        className={opening.coverSlot}
        data-centre-slot="cover"
        ref={anchors.cover}
        {...previewProps(stagedCover?.card ?? null)}
      >
        {stagedCover && (
          <div
            ref={coverStagedRef}
            className={opening.pose}
            style={{ transform: restTransform(COVER_POSE) }}
            data-testid="board-cover-staged"
          >
            <Card card={stagedCover.card} interactive={false} width="100%" />
          </div>
        )}
      </div>

      {/* the attack slot — where cards stand while the table is looking at them:
          the player's own cards gather here during the opening, and every drawn
          card stages here for the rest of the match. Mounted for the whole life
          of the board, because a flight cannot aim at a node that is not there
          yet. Empty, it must not catch clicks meant for the table underneath —
          `.centre:empty` in `_Board.module.css` owns that, now that the cover
          slot sits on top of it too. */}
      <div
        className={opening.centre}
        data-board-centre
        data-centre-slot="attack"
        ref={anchors.centre}
        {...previewProps(pendingDefend ? cardById(pendingDefend.attackCard) : null)}
      >
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
        {/* the pulled card stands here once the flyer has dropped it — while
            the carrier or a return flight still holds it, the static render
            would double it (ComboStory.tsx's own guard on this). Once a
            partner folds in, the pair flyer below owns the centre instead. */}
        {soloStaged && staging.overlay.length === 0 && (
          <div ref={soloStagedRef} className={opening.centreCard} data-testid="board-centre-staged">
            <Card card={soloStaged.card} interactive={false} width="100%" />
          </div>
        )}
        {pendingDefend &&
          (() => {
            const data = cardById(pendingDefend.attackCard)
            if (!data) return null
            // sudo stands the pair; a plain hit stands the one card, as before.
            const aux = pendingDefend.sudo ? cardById('support-sudo') : null
            return (
              <div
                className={opening.centreCard}
                data-testid="board-centre-pending"
                data-pending-play
              >
                {aux ? (
                  <CardPair main={data} aux={aux} width="100%" />
                ) : (
                  <Card card={data} interactive={false} width="100%" />
                )}
              </div>
            )
          })()}
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
                support={you.support}
                size="100px"
                player={state.selfId}
                slotRef={(key, el) => anchors.bindReleaseSlot(state.selfId, key, el)}
                onPick={(t) => staging.onTargetPick(t)}
                targets={staging.targets}
              />
            </div>
            {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only guard so a press in the fan is never read as "pointed at nothing" while a pair stands merged; the Hand owns the real interaction (ComboStory's own hand wrapper carries the same guard) */}
            <div
              className={kit.handWrap}
              ref={anchors.hand}
              // the pair assembles and then waits at the CENTRE — the hand's
              // zoom preview rises into exactly that space and would cover it
              // (ComboStory's own reason). So while a pair stands merged the
              // fan goes inert, and a press inside it must not read as the
              // miss `handleTableClick` cancels on.
              style={{ pointerEvents: staging.staged?.merged ? 'none' : undefined }}
              onMouseDown={staging.staged?.merged ? (e) => e.stopPropagation() : undefined}
            >
              <Hand
                // a `defend` pending owed to us means the defence hook owns
                // the fan (#101, Task 16) — `answering` picks the source at
                // every call site below, rather than merging the two hooks'
                // outputs.
                items={answering ? defenseStaging.handItems : staging.handItems}
                // the fan opens room for the arriving heap while it travels —
                // the deal wins the tie against every other beat the same way
                // it already wins the shadow's, and the staging gesture's own
                // return-flight gap is last: it opens only once nothing else
                // owns the fan.
                gapAt={deal.gapAt ?? beats.gapAt ?? liveGapAt}
                gapSize={
                  deal.gapAt == null
                    ? beats.gapAt == null
                      ? liveGapSize
                      : beats.gapSize
                    : deal.gapSize
                }
                // a support awaiting a partner lights the hand cards it can
                // fold with — off outside that phase (Hand ignores undefined).
                accentAt={answering ? defenseStaging.accentAt : staging.accentAt}
                // while the deal runs the hand is held: no clicks reach either
                // gesture machine, and the cards that travelled closed stay
                // closed until the flip. Both are gone the moment it ends, so
                // the released hand is the plain one this board always drew.
                // A partner pick is a click too, not a pull — it routes here
                // while the staging gesture is waiting for one. A release's
                // cost is a click as well: routed by which gesture is live
                // (`costOptions.length > 0`) rather than a second handler —
                // `staging.onCardClick` itself checks that first.
                onCardClick={
                  deal.active
                    ? undefined
                    : answering
                      ? (i) => defenseStaging.onCardClick(i)
                      : staging.staged?.phase === 'partner' || staging.costOptions.length > 0
                        ? (i) => staging.onCardClick(i)
                        : (i) => gestures.onCardClick(i)
                }
                // drag-mode: a card that needs a target — or a legal defence
                // answering an open `defend` pending — is pulled out of the
                // fan, not clicked. Off during the deal, same as the click
                // gesture above.
                onPlay={
                  deal.active
                    ? undefined
                    : answering
                      ? defenseStaging.onHandPlay
                      : staging.onHandPlay
                }
                // the reorder gesture's commit — without it the kit settles the
                // card into its new slot and the next projection render snaps
                // it back. `to` indexes the fan AS RENDERED (minus any staged
                // card), which is exactly what the commit expects.
                onReorder={
                  deal.active
                    ? undefined
                    : (uid, to) =>
                        handOrder.commit(
                          you.hand,
                          answering ? defenseStaging.handItems : staging.handItems,
                          uid,
                          to,
                        )
                }
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
          always renders, regardless of whose turn the projection says it is.
          A release's own cost is the one exception: the cards on the table
          (the fan, via `staging.onCostPick`) ask for it instead, and a panel
          on top would be a second asker for the same decision. */}
      {state.pending?.player === state.selfId && state.pending.kind !== 'discardForRelease' && (
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
      {staging.overlay}
      {defenseStaging.overlay}
      {previewOverlay}

      {/* the pair flyer — a persistent node (I10: position: fixed against the
          viewport, no containing block above it, same as every other flight
          carrier). The fold paints frame by frame directly on its
          [data-main]/[data-aux] children; the CardPair mount just needs to
          exist for that to have something to grab. */}
      <div
        className={opening.pairFlyer}
        ref={staging.pairRef}
        aria-hidden="true"
        data-testid="board-pair-staged"
      >
        {staging.staged?.merged && staging.staged.support && staging.staged.main && (
          <CardPair
            main={staging.staged.main.card}
            aux={staging.staged.support.card}
            width="100%"
          />
        )}
      </div>
    </div>
  )
}
