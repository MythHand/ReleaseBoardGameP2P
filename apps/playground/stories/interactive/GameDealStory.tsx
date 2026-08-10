import enCommon from '@release/translation/locales/en/common.json'
import ruCommon from '@release/translation/locales/ru/common.json'
import { useEffect, useRef, useState } from 'react'
import { play, type Rect, restTransform, type Scatter, scatterAt, wait } from '@/animations'
import { CARDS, cardById } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Card, { cardBoxIn } from '@/primitives/Card'
import HudBackground from '@/primitives/HudBackground'
import Pile from '@/primitives/Pile'
import TabRail from '@/primitives/TabRail'
import Typography from '@/primitives/Typography'
import Hand from '@/table/Hand'
import type { HandItem } from '@/table/Hand/Hand'
import ReleaseZone from '@/table/ReleaseZone'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import Seat from '@/table/Seat'
import TurnDock from '@/table/TurnDock/TurnDock'
import { pick, useLang } from '../../Playground/lang'
import HoverSelect from '../controls/HoverSelect'
import styles from './GameDealStory.module.css'
import { useFlyer } from './useFlyer'
import { useHandArrival } from './useHandArrival'

// The opening of a match — the first thing a player ever sees at this table.
// It is the move from the lobby INTO the game.
//
// Step 1 — the interface arrives:
//   1.1 the right-hand page rail
//   1.2 the background — the HUD layer, whose own faint grid is the table's
//   2.  the piles: the two decks at the left edge, the discard at the right
//   3.  the opponents' seats on top, the turn dock at the bottom
//
// Step 2 — the deal, by the rules (docs/rules-board-game.md): one Debugger and
// four random base cards each, five in hand, no trigger among them.
//   • round by round, and each round starts with the PLAYER — the table is dealt
//     the way a table is dealt, not player by player;
//   • the player's cards do not fly into the fan one at a time. They gather at
//     the centre first, each landing at its own scatter, the way cards land in
//     the discard heap — so they overlap the open Debugger under them;
//   • an opponent's card goes straight into their seat, where their hand is;
//   • the FIRST round is the Debugger, dealt face up for everyone to see. The
//     four that follow travel closed;
//   • the whole heap goes into the fan at once, still closed, and only when it
//     is all in does the hand turn over;
//   • the player's release zone appears only after that — it is theirs, and it
//     arrives once they have a hand to play from. An opponent's zone is part of
//     the seat block and came with it, undivided.

const DECK_MAIN = 104 // the base deck, whole (by the rules)
const DECK_EVENTS = 21 // the events deck, whole
const HAND_SIZE = 5 // 1 Debugger + 4 random, by the rules
const CARD_W = 150 // a card on this table, the deck's own width

const DEBUGGER = 'protection-debugger'
// the opening hand holds no triggers: by the rules an AI / Error 503 dealt at
// setup goes back and another card is taken instead
const DEAL_POOL = CARDS.filter(
  (c) => c.deck === 'base' && c.category !== 'trigger' && c.id !== DEBUGGER,
)

const EMPTY_RELEASE: ReleaseSlots = { frontend: undefined, backend: undefined, database: undefined }

// the same roster the shared table mock uses; the dev line picks how many of
// them sit down, so the choreography can be watched at any table size
const OPPONENT_POOL = [
  { id: 'p2', name: 'kernel_panic' },
  { id: 'p3', name: 'segfault' },
  { id: 'p4', name: 'null_ptr' },
  { id: 'p5', name: 'race_cond' },
  { id: 'p6', name: 'off_by_one' },
]

// The beats of the arrival. This is a screen being entered, not interface
// feedback: every block takes its time and there is a real pause between one
// beat and the next.
const RAIL_MS = 640
const BG_MS = 900 // the ambience takes the longest — it is the room lighting up
const PILE_MS = 620
const PILE_STAGGER = 180 // the discard follows the decks, it does not pop with them
const SEAT_MS = 560
const SEAT_STAGGER = 140
const DOCK_DELAY = 320 // the dock comes just after the seats, same beat
const ZONE_MS = 620
const BEAT = 320 // the pause between one beat and the next

// the deal's own rhythm
const DEAL_LEAD = 420 // after the table is set, before the first card leaves
const DEAL_STEP = 230 // between one card leaving the deck and the next
const ROUND_GAP = 160 // an extra breath between rounds, so rounds are countable
const HEAP_HOLD = 640 // the finished heap stands open before it goes to the fan
const FLIP_HOLD = 380 // it is all in the hand — then it turns over
const REVEAL_HOLD = 620 // the hand is read, and only then the zone arrives

interface Staged {
  uid: string
  card: CardType
  sc: Scatter
  faceDown: boolean
}

const rectOf = (el: Element | null | undefined): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

// where a card of the heap rests at the centre
const heapRect = (centre: Rect, sc: Scatter): Rect => ({
  left: centre.left + sc.dx,
  top: centre.top + sc.dy,
  width: centre.width,
  height: centre.height,
})

export default function GameDealStory() {
  const { lang } = useLang()
  const copy = lang === 'en' ? enCommon : ruCommon

  const rail = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const decks = useRef<HTMLDivElement>(null)
  const discard = useRef<HTMLDivElement>(null)
  const seats = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const deckBox = useRef<HTMLDivElement>(null) // the base deck's card box — the source
  const centre = useRef<HTMLDivElement>(null) // where the player's cards gather
  const handRef = useRef<HTMLDivElement>(null)
  const seatRefs = useRef<Record<string, HTMLDivElement | null>>({})
  const started = useRef(false) // StrictMode mounts twice — the intro plays once

  const [run, setRun] = useState(0)
  const [oppCount, setOppCount] = useState(3)
  const opponents = OPPONENT_POOL.slice(0, oppCount)
  const [deck, setDeck] = useState(DECK_MAIN)
  const [oppCards, setOppCards] = useState<Record<string, number>>({})
  const [staged, setStaged] = useState<Staged[]>([]) // the heap at the centre
  const [hand, setHand] = useState<HandItem[]>([])
  const [revealed, setRevealed] = useState(false)

  const { overlay: flyerOverlay, raise, drop } = useFlyer()
  const {
    overlay: arrivalOverlay,
    gapAt,
    gapSize,
    arrive,
  } = useHandArrival(handRef, (_gap, landed) =>
    setHand(landed.map((l) => ({ uid: l.key, card: l.card }))),
  )

  // biome-ignore lint/correctness/useExhaustiveDependencies: `run` re-arms the whole scene; the refs and steps are read, not watched
  useEffect(() => {
    if (started.current) return
    started.current = true
    let cancelled = false
    const halt = () => cancelled

    // ===== step 1 — the interface arrives =====
    const intro = async () => {
      // 1.1 — the page rail slides in from its own edge
      play('hudIn', rail.current, { dx: 44, dur: RAIL_MS })
      await wait(RAIL_MS + BEAT)
      if (halt()) return

      // 1.2 — the table itself: the HUD layer with its grid, a plain fade
      play('hudIn', bg.current, { dur: BG_MS })
      await wait(BG_MS + BEAT)
      if (halt()) return

      // 2 — the piles take their places: the decks from the left edge, the
      // discard from the right, one after the other rather than together
      play('hudIn', decks.current, { dx: -34, dur: PILE_MS })
      play('hudIn', discard.current, { dx: 34, dur: PILE_MS, delay: PILE_STAGGER })
      await wait(PILE_MS + PILE_STAGGER + BEAT)
      if (halt()) return

      // 3 — the players: the seats drop in from above (each after the one before
      // it), the dock rises from below in the same beat
      for (const [i, el] of [...(seats.current?.children ?? [])].entries()) {
        play('hudIn', el, { dy: -28, dur: SEAT_MS, delay: i * SEAT_STAGGER })
      }
      play('hudIn', dock.current, { dy: 30, dur: SEAT_MS, delay: DOCK_DELAY })
      await wait(SEAT_MS + DOCK_DELAY + BEAT)
    }

    // one card leaves the deck for the centre and stays there, at its own
    // scatter — the heap the player's hand will be lifted out of
    const toCentre = async (index: number, card: CardType, faceDown: boolean) => {
      const from = rectOf(deckBox.current)
      const to = rectOf(centre.current)
      if (!from || !to) return null
      const sc = scatterAt(index, CARD_W)
      const key = `c${index}`
      const [el] = await raise([{ key, at: from, card, faceDown }])
      // the same Scatter drives the flight and the rest, so the card lands
      // exactly where it then lies (the discard heap's own coupling)
      const anim = play('drawToCenter', el, { from, to, rotate: sc.rot, dx: sc.dx, dy: sc.dy })
      if (anim) await anim.finished
      const placed: Staged = { uid: `d${index}`, card, sc, faceDown }
      setStaged((h) => [...h, placed])
      drop(key)
      return placed
    }

    // one card leaves the deck for an opponent's seat and sinks into the hand
    // hidden there — the counter on the seat is that hand
    const toSeat = async (index: number, id: string, card: CardType, faceDown: boolean) => {
      const from = rectOf(deckBox.current)
      const seat = rectOf(seatRefs.current[id])
      if (!from || !seat) return
      const key = `s${index}`
      const [el] = await raise([{ key, at: from, card, faceDown }])
      // aim at a card-sized box INSIDE the seat, not at the seat itself — its
      // rect is far wider than a card and the card would inflate to it
      const anim = play('dealToSeat', el, { from, to: cardBoxIn(seat, from.width * 0.7) })
      if (anim) await anim.finished
      setOppCards((c) => ({ ...c, [id]: (c[id] ?? 0) + 1 }))
      drop(key)
    }

    // ===== step 2 — the deal =====
    const deal = async () => {
      await wait(DEAL_LEAD)
      if (halt()) return

      // the player's five: the Debugger first, then four random ones
      const mine = [
        cardById(DEBUGGER),
        ...Array.from(
          { length: HAND_SIZE - 1 },
          () => DEAL_POOL[Math.floor(Math.random() * DEAL_POOL.length)],
        ),
      ].filter((c): c is CardType => Boolean(c))

      const flights: Promise<unknown>[] = []
      // what landed at the centre, by round — collected HERE and not read back
      // off `staged` later: this closure never re-runs, so its `staged` would
      // still be the empty array it was at mount (I8)
      const placed: (Staged | null)[] = new Array(HAND_SIZE).fill(null)
      let n = 0
      for (let round = 0; round < HAND_SIZE; round++) {
        // the first round is the Debugger, and it is dealt open
        const open = round === 0
        // the player is dealt first in every round
        flights.push(
          toCentre(round, mine[round], !open).then((p) => {
            placed[round] = p
          }),
        )
        setDeck((d) => d - 1)
        await wait(DEAL_STEP)
        if (halt()) return

        for (const o of opponents) {
          const card = open
            ? cardById(DEBUGGER)
            : DEAL_POOL[Math.floor(Math.random() * DEAL_POOL.length)]
          if (card) flights.push(toSeat(n++, o.id, card, !open))
          setDeck((d) => d - 1)
          await wait(DEAL_STEP)
          if (halt()) return
        }
        await wait(ROUND_GAP)
        if (halt()) return
      }
      await Promise.all(flights)
      if (halt()) return

      // the finished heap stands open for a beat, then the whole of it goes into
      // the fan at once — still closed
      await wait(HEAP_HOLD)
      if (halt()) return
      const to = rectOf(centre.current)
      if (!to) return
      const heap = placed.filter((p): p is Staged => p != null)
      setStaged([]) // the centre empties in the same commit the flight starts
      await arrive(
        heap.map((s) => ({
          key: s.uid,
          card: s.card,
          faceDown: s.faceDown,
          from: heapRect(to, s.sc),
          rot: s.sc.rot,
        })),
        0,
      )
      if (halt()) return

      // it is all in the hand — now it turns over
      await wait(FLIP_HOLD)
      if (halt()) return
      setRevealed(true)

      // and only then does the player's own zone arrive
      await wait(REVEAL_HOLD)
      if (halt()) return
      play('hudIn', zone.current, { dy: 22, dur: ZONE_MS })
    }

    const runAll = async () => {
      await intro()
      if (halt()) return
      await deal()
    }
    void runAll()
    return () => {
      cancelled = true
    }
  }, [run])

  function restart() {
    started.current = false
    drop()
    setDeck(DECK_MAIN)
    setOppCards({})
    setStaged([])
    setHand([])
    setRevealed(false)
    setRun((n) => n + 1)
  }

  return (
    <div className={styles.root} key={run}>
      {/* The technical line is a ROW of the playground, not a layer over the
          screen: it takes its own height, and the stage below owns everything
          left. Nothing inside the stage needs to dodge it. */}
      <div className={styles.controls}>
        <button type="button" className={styles.btn} onClick={restart}>
          <Typography base="label-sm" tk="tk-16">
            {pick(lang, { ru: 'рестарт', en: 'restart' })}
          </Typography>
        </button>
        {/* how many sit at the table. Changing it replays the whole thing — the
            deal is built round by round around who is seated. */}
        <HoverSelect
          label={pick(lang, { ru: 'оппонентов', en: 'opponents' })}
          value={String(oppCount)}
          options={OPPONENT_POOL.map((_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
          onChange={(v) => {
            setOppCount(Number(v))
            restart()
          }}
        />
        <span className={styles.total}>
          {pick(lang, { ru: 'всего', en: 'total' })}: {oppCount + 1}
        </span>
      </div>

      <div className={styles.stage}>
        {/* the table's background — the HUD layer, whose own faint grid IS the
            grid of this table. It arrives whole in beat 1.2. */}
        <div className={styles.bg} ref={bg}>
          <HudBackground tone="neutral" className={styles.hud} />
        </div>

        {/* opponents — one row on top, as on the table. Their hands are hidden in
            the seats: the counter IS the hand a dealt card sinks into. */}
        <div className={styles.opponents} ref={seats}>
          {opponents.map((o) => (
            <div
              key={o.id}
              className={styles.enter}
              ref={(el) => {
                seatRefs.current[o.id] = el
              }}
            >
              <Seat
                player={{
                  id: o.id,
                  name: o.name,
                  handCount: oppCards[o.id] ?? 0,
                  release: EMPTY_RELEASE,
                }}
                copy={copy.seat}
              />
            </div>
          ))}
        </div>

        {/* draw decks — left edge. The base deck is the one being dealt from, so
            its count goes down with every card that leaves. */}
        <div className={styles.decks}>
          <div className={styles.enter} ref={decks}>
            <Pile
              label={copy.table.deck}
              deck="base"
              count={deck}
              width={CARD_W}
              countPos="tl"
              boxRef={deckBox}
            />
            <Pile
              label={copy.table.events}
              deck="ai"
              count={DECK_EVENTS}
              width={CARD_W}
              countPos="tl"
            />
          </div>
        </div>

        {/* discard — empty, so it shows the game's mark and the zone it holds */}
        <div className={styles.discard}>
          <div className={styles.enter} ref={discard}>
            <Pile label={copy.table.discard} count={0} width={116} logoVariant={lang} />
          </div>
        </div>

        {/* the centre: the player's own cards gather here before they go into the
            fan, each at its own scatter — a small heap, not a neat stack */}
        <div className={styles.centre} ref={centre}>
          {staged.map((s) => (
            <div
              key={s.uid}
              className={styles.stagedCard}
              style={{ transform: restTransform(s.sc) }}
            >
              <Card card={s.card} faceDown={s.faceDown} interactive={false} width="100%" />
            </div>
          ))}
        </div>

        {/* the dock stands in the opponent-turn state — nobody is on turn — but
            names the moment instead of a player */}
        <div className={styles.turnDock}>
          <div className={styles.enter} ref={dock}>
            <TurnDock
              state="waiting"
              seconds={0}
              progress={0}
              copy={{
                ...copy.turnDock,
                turnOf: pick(lang, { ru: 'старт игры', en: 'game start' }),
              }}
            />
          </div>
        </div>

        {/* your area — the fan fills up with the deal, the zone arrives after it */}
        <div className={styles.you}>
          <div className={styles.enter} ref={zone}>
            <ReleaseZone release={EMPTY_RELEASE} size="100px" />
          </div>
          <div className={styles.handWrap} ref={handRef}>
            <Hand
              items={hand}
              gapAt={gapAt}
              gapSize={gapSize}
              // the hand lands closed and turns over as one — every card except
              // the Debugger, which was dealt open and stays open
              renderFace={(item, ctx) => (
                <Card
                  card={item.card}
                  faceDown={!revealed && item.card.id !== DEBUGGER}
                  interactive={false}
                  tilt={ctx.tilt}
                  width={ctx.width}
                />
              )}
            />
          </div>
        </div>

        {/* the page rail, as on the table. Inert: this page is a choreography, not
            the panels — a tab that opened nothing would read as broken. */}
        <div className={styles.railLayer} ref={rail}>
          <TabRail
            items={[
              { id: 'history', label: copy.table.tabHistory },
              { id: 'participants', label: copy.table.tabParticipants },
              { id: 'rules', label: copy.table.tabRules },
              { id: 'modes', label: copy.table.tabModes },
            ]}
            active={null}
            onSelect={() => {}}
          />
        </div>

        {/* the cards in the air: the carrier for the deal, the arrival step for
            the heap going into the fan */}
        {flyerOverlay}
        {arrivalOverlay}
      </div>
    </div>
  )
}
