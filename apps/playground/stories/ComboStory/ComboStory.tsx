import type { CardData } from '@release/ui'
import type React from 'react'
import type { CSSProperties } from 'react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { nextFrames, play, wait } from '@/animations'
import { cardById, cardCanTarget, isComboSource, validComboTarget } from '@/cards'
import Arrow, { useArrow } from '@/primitives/Arrow'
import Card, { CARD_RATIO } from '@/primitives/Card'
import CardPair from '@/primitives/CardPair'
import Pile from '@/primitives/Pile'
import Hand from '@/table/Hand'
import { CARD_W, slotPlacement } from '@/table/Hand/fan'
import type { HandPlayDrop } from '@/table/Hand/Hand'
import ReleaseZone from '@/table/ReleaseZone'
import { type Lang, pick, useLang } from '../../Playground/lang'
import { reorderHand } from '../interactive/reorderHand'
import { useDiscardExit } from '../interactive/useDiscardExit'
import { useHandArrival } from '../interactive/useHandArrival'
import styles from './ComboStory.module.css'

type Loc = Record<Lang, string>

// Combo — a card played TOGETHER with another one of yours (Sudo over a card it
// can enhance, Code Review over a Release).
//
// The gesture is the same as everywhere else: pulling a card OUT of the fan puts
// it INTO the turn — it flies to the centre of the table and stands there, open
// to everyone. What it acts on is CLICKED: first the partner in your own hand,
// then, if the partner needs one, a target on the table. Cancelling returns the
// whole staging to the fan at once; the turn is not spent, but the table saw it.

interface HandItem {
  uid: string
  card: CardData
}

interface DiscardEntry {
  card: CardData // the discard holds SINGLE cards; a combo splits into two entries
  rot: number
  dx: number
  dy: number
}
interface ReleasedEntry {
  card: CardData
  aux: CardData
}
interface Rect {
  left: number
  top: number
  width: number
  height: number
}

let _u = 0
const nextUid = () => `c${++_u}`

const makeHand = (): HandItem[] =>
  [
    'support-sudo',
    'attack-security-bug', // sudo-able + targets → center → discard
    'operation-system-upgrade', // sudo-able, no target → center → discard
    'support-code-review',
    'release-frontend', // release → release zone
    'release-database',
    // biome-ignore lint/style/noNonNullAssertion: every id above is a known catalogue id
  ].map((id) => ({ uid: nextUid(), card: cardById(id)! }))

const TARGETS: { id: string; label: Loc }[] = [
  { id: 'tr', label: { ru: 'свежий релиз оппонента', en: "opponent's fresh release" } },
  { id: 'th', label: { ru: 'рука оппонента', en: "opponent's hand" } },
]
const RELEASE_SLOTS = ['frontend', 'backend', 'database']

const MERGE_MS = 620 // the two cards fold into a pair at the centre
const PAIR_HOLD = 2100 // the assembled pair is held open to everyone

export default function ComboStory() {
  const { lang } = useLang()
  const slotRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const centerRef = useRef<HTMLDivElement>(null)
  const discardRef = useRef<HTMLDivElement>(null)
  const flyRef = useRef<HTMLDivElement>(null)
  const handWrapRef = useRef<HTMLDivElement>(null)

  const [hand, setHand] = useState<HandItem[]>(makeHand)
  // the staging area at the centre: [source] while a partner is awaited,
  // [source, partner] once they merged into a pair
  const [staged, setStaged] = useState<HandItem[]>([])
  const [merged, setMerged] = useState(false) // the pair flyer owns the centre
  const [phase, setPhase] = useState<'idle' | 'partner' | 'target'>('idle')
  // arrow geometry + cursor tracking. `aiming` is the arrow's OWN state: it is
  // drawn only while a choice is actually pending, never during an animation.
  const { from, to, active: aiming, aim, stop } = useArrow()
  const [playing, setPlaying] = useState(false)
  const [released, setReleased] = useState<Record<string, ReleasedEntry>>({})
  const [discardPile, setDiscardPile] = useState<DiscardEntry[]>([])
  const { overlay: discardOverlay, send: sendToDiscard } = useDiscardExit(discardRef, (cards) =>
    setDiscardPile((p) => [...p, ...cards]),
  )
  // cancel: the whole staging goes back into the fan at once
  const {
    overlay: returnOverlay,
    gapAt: returnGap,
    gapSize: returnSize,
    arrive: returnToHand,
    reset: resetReturn,
  } = useHandArrival(handWrapRef, (gap, landed) =>
    setHand((h) => {
      const next = h.slice()
      next.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
      return next
    }),
  )
  const [flyPair, setFlyPair] = useState<{ main: CardData; aux: CardData } | null>(null)
  // hand → centre (single). It carries where it mounts: a flyer is position:fixed,
  // so without coordinates its first painted frame lands at its flow position
  const [entering, setEntering] = useState<{ card: CardData; at: Rect } | null>(null)
  const [log, setLog] = useState<string | null>(null)

  const enterRef = useRef<HTMLDivElement>(null)
  // read from handlers that run after an await / from a captured closure (I8)
  const phaseRef = useRef(phase)
  phaseRef.current = phase
  const stagedRef = useRef<HandItem[]>([])
  stagedRef.current = staged

  // a miss cancels only while a choice is actually pending — never mid-animation
  const cancellable = phase !== 'idle' && !playing
  const source = staged[0] ?? null
  const partner = staged[1] ?? null
  const color =
    phase === 'target' && partner
      ? `var(--cat-${partner.card.category})`
      : source
        ? `var(--cat-${source.card.category})`
        : 'var(--brand-green)'

  // the card box of a card sitting in the fan — from the fan geometry, NOT from a
  // slot's getBoundingClientRect: a slot is rotated, so its bounding rect is the
  // box AROUND the tilted card and a flight from it jumps on the first frame (I6)
  const slotBox = (i: number, total = hand.length): Rect | undefined => {
    const hr = handWrapRef.current?.getBoundingClientRect()
    if (!hr) return undefined
    const base = slotPlacement(i, total)
    const height = CARD_W * CARD_RATIO
    return {
      left: hr.left + hr.width / 2 + base.x - CARD_W / 2,
      top: hr.bottom + base.y - height,
      width: CARD_W,
      height,
    }
  }

  const aimFromCentre = () => {
    const c = centerRef.current?.getBoundingClientRect()
    if (c) aim({ x: c.left + c.width / 2, y: c.top + c.height / 2 }, { x: c.left, y: c.top })
  }

  const hideFlyer = () => {
    setFlyPair(null)
    setMerged(false)
    if (flyRef.current) flyRef.current.style.opacity = '0'
  }

  // transform that places a card from a source rect into the centre's coordinates
  const enterTransform = (srcRect: Rect, boxRect: DOMRect) => {
    const dx = srcRect.left + srcRect.width / 2 - (boxRect.left + boxRect.width / 2)
    const dy = srcRect.top + srcRect.height / 2 - (boxRect.top + boxRect.height / 2)
    const s = srcRect.width / boxRect.width
    return `translate(${dx}px, ${dy}px) scale(${s})`
  }

  // cancel — the whole staging goes back to the MIDDLE of the fan at once, on the
  // slot's bottom-centre pivot (the landing every other scene uses), with the fan
  // opening room for all of them while they travel
  // biome-ignore lint/correctness/useExhaustiveDependencies: hideFlyer is an inline fn touching only refs/state setters; adding it would re-create the callback (and re-subscribe the window listener) on every render
  const cancelStage = useCallback(async () => {
    const items = stagedRef.current
    stop()
    setPhase('idle')
    if (items.length === 0) return
    const cRect = centerRef.current?.getBoundingClientRect()
    const el = flyRef.current
    // where each card physically is: a lone staged card fills the centre slot; a
    // merged pair sits in the flyer, and the step measures each half off its own
    // anchor (staged[0] became the pair's aux, staged[1] its main)
    // the key is the card's identity in the hand — the step hands it back on landing
    const leaving =
      items.length === 1
        ? [{ key: items[0].uid, card: items[0].card, from: cRect }]
        : [
            { key: items[0].uid, card: items[0].card, el, anchor: 'aux' as const, from: cRect },
            { key: items[1].uid, card: items[1].card, el, anchor: 'main' as const, from: cRect },
          ]
    const flight = returnToHand(leaving, hand.length)
    setStaged([])
    hideFlyer()
    await flight
  }, [hand.length, stop, returnToHand])

  // a press on nothing valid cancels the staging. Presses on a target and inside
  // the hand stop propagation — those are answers, not a miss.
  useEffect(() => {
    if (!cancellable) return
    const onDown = () => void cancelStage()
    window.addEventListener('mousedown', onDown)
    return () => window.removeEventListener('mousedown', onDown)
  }, [cancellable, cancelStage])

  // the assembled pair leaves the centre: a release settles into its zone slot,
  // anything else splits into two singles in the discard
  const resolve = async (main: HandItem, aux: HandItem, hold: boolean, targetLabel?: string) => {
    const el = flyRef.current
    const cRect = centerRef.current?.getBoundingClientRect()
    if (!el || !cRect) return
    if (hold) await wait(PAIR_HOLD)
    if (main.card.category === 'release') {
      const key = main.card.name.toLowerCase()
      const toRect = slotRefs.current[key]?.getBoundingClientRect()
      if (toRect) {
        const anim = play('playToReleaseZone', el, { from: cRect, to: toRect })
        if (anim) await anim.finished
      }
      setReleased((r) => ({ ...r, [key]: { card: main.card, aux: aux.card } }))
      await nextFrames() // let the final card paint before hiding the flyer
      hideFlyer()
    } else {
      // The pair leaves through the shared exit step: it splits into its two
      // singles, each from where it actually stands, both at once.
      // Hand it over while it is STILL on screen — the step measures both halves
      // as it starts. Only then is the staging cleared: the centre slot renders
      // the source whenever the pair is gone, so hiding first would put the
      // source card back on the table for the whole flight.
      const leaving = sendToDiscard([
        { key: 'combo', card: main.card, aux: aux.card, el, from: cRect, layer: 0 },
      ])
      setStaged([])
      hideFlyer()
      await leaving
    }
    setLog(
      targetLabel
        ? `${aux.card.name} + ${main.card.name} ⟶ ${targetLabel}`
        : `${aux.card.name} + ${main.card.name}`,
    )
    setStaged([])
    setPhase('idle')
    stop()
    setPlaying(false)
  }

  // GESTURE — pulling a combo source out of the fan puts it on the table and opens
  // the assembly. Anything else is not a combo start: the drop is rejected and the
  // Hand glides the card back.
  const handPlay = (uid: string, drop: HandPlayDrop): boolean => {
    if (playing || staged.length > 0) return false
    const item = hand.find((it) => it.uid === uid)
    const rect = drop.rect
    if (!item || !rect || !isComboSource(item.card)) return false
    setHand((h) => h.filter((it) => it.uid !== uid))
    setStaged([item])
    setPhase('partner')
    void (async () => {
      const cRect = centerRef.current?.getBoundingClientRect()
      setEntering({ card: item.card, at: rect })
      await nextFrames() // I2 — let it paint at `at` before it starts moving
      const el = enterRef.current
      if (el && cRect) {
        const anim = play('playToCenter', el, { from: rect, to: cRect })
        if (anim) await anim.finished
      }
      setEntering(null)
      aimFromCentre()
    })()
    return true
  }

  // the staging waits for a partner — a click on a hand card answers it
  const pickPartner = (i: number) => {
    if (phaseRef.current !== 'partner' || playing) return
    const src = stagedRef.current[0]
    const item = hand[i]
    if (!src || !item) return
    if (!validComboTarget(src.card, item.card)) return void cancelStage()
    const mainHand = slotBox(i)
    const cRect = centerRef.current?.getBoundingClientRect()
    if (!mainHand || !cRect) return
    stop() // the choice is made — nothing is being pointed at while the pair folds
    setPlaying(true)
    setHand((h) => h.filter((it) => it.uid !== item.uid))
    setStaged([src, item])
    setMerged(true)
    setFlyPair({ main: item.card, aux: src.card })
    void (async () => {
      await nextFrames()
      const el = flyRef.current
      if (!el) return
      // I3 — a leftover fill:forwards on the container or the nested cards would
      // overwrite the transforms set below
      for (const a of el.getAnimations?.({ subtree: true }) ?? []) a.cancel()
      el.style.left = `${cRect.left}px`
      el.style.top = `${cRect.top}px`
      el.style.width = `${cRect.width}px`
      el.style.transform = 'none'
      const mainEl = el.querySelector<HTMLElement>('[data-main]')
      const auxEl = el.querySelector<HTMLElement>('[data-aux]')
      if (!mainEl || !auxEl) return
      const enterMain = enterTransform(mainHand, cRect)
      // the source is ALREADY standing at the centre — it only folds under
      const enterAux = 'translate(0px, 0px) scale(1)'
      mainEl.style.transform = enterMain
      auxEl.style.transform = enterAux
      el.style.opacity = '1'
      await nextFrames()

      // MERGING AT THE CENTRE — the partner arrives and the pair folds together
      const a1 = mainEl.animate(
        [{ transform: enterMain }, { transform: 'translate(0, 0) scale(1)' }],
        { duration: MERGE_MS, easing: 'cubic-bezier(0.4, 0, 0.2, 1)', fill: 'forwards' },
      )
      const a2 = auxEl.animate(
        [{ transform: enterAux }, { transform: 'translateY(-26%) rotate(-7deg)' }],
        { duration: MERGE_MS, easing: 'cubic-bezier(0.2, 0.9, 0.1, 1)', fill: 'forwards' },
      )
      await Promise.all([a1.finished, a2.finished])

      if (cardCanTarget(item.card)) {
        // the pair waits at the centre for a target — the player's own beat is the hold
        setPlaying(false)
        setPhase('target')
        aimFromCentre()
        return
      }
      await resolve(item, src, true)
    })()
  }

  const onTargetDown = (e: React.MouseEvent, t: { id: string; label: Loc }) => {
    e.stopPropagation()
    if (phaseRef.current !== 'target') return
    const [src, prt] = stagedRef.current
    if (!src || !prt) return
    stop() // the choice is made — the arrow points at nothing while the play flies
    setPlaying(true)
    void resolve(prt, src, false, t.label[lang])
  }

  const reset = () => {
    stop()
    setPhase('idle')
    setStaged([])
    setPlaying(false)
    setReleased({})
    setDiscardPile([])
    setEntering(null)
    resetReturn()
    hideFlyer()
    setLog(null)
    setHand(makeHand())
  }

  // While a partner is still awaited, the cards the source can be played with
  // light up — here the TYPE is the message, so they keep their category accent.
  // The moment one is picked the highlight goes: it now points at a choice that
  // no longer exists and only pulls attention away from the table.
  const accentAt = (i: number) =>
    phase === 'partner' &&
    staged.length === 1 &&
    source &&
    hand[i] &&
    validComboTarget(source.card, hand[i].card)
      ? color
      : undefined

  return (
    <div className={styles.root}>
      <p className={styles.hint}>
        {lang === 'ru' ? (
          <>
            Вытащи <b>Sudo</b> / <b>Code Review</b> из руки — карта встанет в центр стола, а в руке
            подсветятся карты, с которыми её можно сыграть. Клик по подсвеченной складывает пару;
            атака добавит стрелку цели. Нажатие мимо возвращает всю сборку в руку.
          </>
        ) : (
          <>
            Pull <b>Sudo</b> / <b>Code Review</b> out of the hand — it stands at the centre of the
            table and the cards it can be played with light up in the fan. A click on one folds the
            pair; an attack adds an arrow to a target. A press on nothing returns the whole staging.
          </>
        )}
      </p>
      <div className={styles.toolbar}>
        <button type="button" className={styles.reset} onClick={reset}>
          {pick(lang, { ru: 'сброс', en: 'reset' })}
        </button>
        {log && (
          <span className={styles.log}>
            {pick(lang, { ru: 'сыграно', en: 'played' })}: {log}
          </span>
        )}
      </div>

      <div className={styles.targets}>
        {TARGETS.map((t) => {
          // the same rule the hand's highlight follows: the moment the choice is
          // made the highlight goes out. It also has to go out THEN and not when
          // the phase finally resets — the staging is already cleared, so the
          // accent it was lit in no longer exists and it would fall back to the
          // neutral colour, flashing green while the play is still flying.
          const lit = phase === 'target' && !playing
          return (
            // biome-ignore lint/a11y/noStaticElementInteractions: pointer-only combo target (mousedown to play); sandbox story
            <div
              key={t.id}
              className={`${styles.target} ${lit ? styles.lit : ''}`}
              style={lit ? ({ '--hl': color } as CSSProperties) : undefined}
              onMouseDown={(e) => onTargetDown(e, t)}
            >
              {t.label[lang]}
            </div>
          )
        })}
      </div>

      {/* the staging area — the source stands here until its partner joins it */}
      <div className={styles.centerSlot} ref={centerRef}>
        {source && !merged && !entering && (
          <Card card={source.card} interactive={false} width="100%" />
        )}
      </div>

      <div className={styles.discard}>
        <Pile
          heap={discardPile}
          count={discardPile.length}
          width={116}
          boxRef={discardRef}
          logoVariant={lang}
          label={pick(lang, { ru: 'сброс', en: 'discard' })}
        />
      </div>

      <div className={styles.bottom}>
        <ReleaseZone
          size="92px"
          release={Object.fromEntries(RELEASE_SLOTS.map((key) => [key, released[key]?.card]))}
          support={Object.fromEntries(RELEASE_SLOTS.map((key) => [key, released[key]?.aux]))}
          slotRef={(key, el) => {
            slotRefs.current[key] = el
          }}
        />

        {/* biome-ignore lint/a11y/noStaticElementInteractions: pointer-only guard so a press in the fan is never read as "pointed at nothing"; the Hand owns the real interaction */}
        <div
          className={styles.hand}
          ref={handWrapRef}
          // the pair assembles and then waits at the CENTRE — the hand's zoom
          // preview rises into exactly that space and would cover the play. So
          // while the cards are on the table the fan goes inert: the overlay case
          // of the three in docs/animations/README, not the "flight in progress" one.
          style={{ pointerEvents: merged || playing ? 'none' : undefined }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <Hand
            items={hand}
            gapAt={returnGap}
            gapSize={returnSize}
            accentAt={accentAt}
            onPlay={handPlay}
            onCardClick={phase === 'partner' ? pickPartner : undefined}
            onReorder={(uid, toIndex) => setHand((h) => reorderHand(h, uid, toIndex))}
          />
        </div>
      </div>

      {aiming && <Arrow from={from} to={to} color={color} />}

      {/* the source on its way from the fan to the centre */}
      {entering && (
        <div
          className={styles.entering}
          ref={enterRef}
          style={{ left: entering.at.left, top: entering.at.top, inlineSize: entering.at.width }}
        >
          <Card card={entering.card} interactive={false} width="100%" />
        </div>
      )}

      {returnOverlay}

      {discardOverlay}

      <div className={styles.flyer} ref={flyRef} aria-hidden="true">
        {flyPair && <CardPair main={flyPair.main} aux={flyPair.aux} width="100%" />}
      </div>
    </div>
  )
}
