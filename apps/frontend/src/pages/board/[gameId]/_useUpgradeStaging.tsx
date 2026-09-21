import type { Event } from '@release/engine'
import type { HandCardState, HandPlayDrop, TableActions } from '@release/ui'
import { Card, ConfirmAction, cardById, rowPlaceStyle, Typography } from '@release/ui'
import { play, useFlyer } from '@release/ui/animations'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { upgradeSlot } from '~/entities/game/board/upgradeSlot'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import opening from './_Board.module.css'
import { useResolveFeedback } from './_useResolveFeedback'
import styles from './_useUpgradeStaging.module.css'

// System Upgrade — the one pending that owes several seats at once. Three
// modes, and which one this seat is in comes from the pending itself:
//
//   owed, discarding  → this seat is being asked; pull one card and commit
//   picking, actor    → the open cards become a choice
//   anything else     → the open cards stand, read-only, and nothing is said
//
// Nothing is said on purpose. The board's one line under the centre names what
// the table wants FROM YOU when nothing else can say it — a defence, a cost, a
// discard down to the limit. It never reports what other seats are doing, and
// the scene has no such line at all: what the centre is doing is read off the
// centre. A standing "waiting for the others" was here until 17.09 and was the
// only broadcast of its kind on the board; it also outlived what it described,
// since it did not watch whether anyone still owed a card.
//
// The standing cards come from `pending.thrown`, which is public and survives
// every batch boundary. The beat hands its arrivals over to these same slots
// and, on the final base answer, sends the standing row to discard (I7).
export function useUpgradeStaging(args: {
  state: BoardState
  anchors: BoardAnchors
  events?: Event[]
  actions?: TableActions
  copy: { prompt: string; takePrompt: string; confirm: string }
  enabled: boolean
}) {
  const { state, actions, copy, enabled } = args
  const pending = state.pending?.kind === 'systemUpgrade' ? state.pending : null

  const asked = pending?.phase === 'discarding' && pending.owed.includes(state.selfId)
  const picking = pending?.phase === 'picking' && pending.actor === state.selfId

  const reduced = useReducedMotion()
  const flyer = useFlyer()
  const [given, setGiven] = useState<string | null>(null)
  const [taken, setTaken] = useState<string | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const attempt = useRef(0)
  const inFlight = useRef(false)
  const current = useRef({ pending, asked, enabled })
  current.current = { pending, asked, enabled }
  useLayoutEffect(
    () => () => {
      attempt.current += 1
    },
    [],
  )

  // Nothing armed survives the pending it was armed for — the discipline every
  // sibling staging hook keeps, latched on the pending and not on the mount.
  useEffect(() => {
    if (!pending) {
      attempt.current += 1
      inFlight.current = false
      if (reduced || !confirmed || given == null) {
        flyer.drop()
        setGiven(null)
        setConfirmed(false)
      }
      setTaken(null)
    }
  }, [pending, confirmed, given, reduced, flyer.drop])

  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    attempt.current += 1
    inFlight.current = false
    setConfirmed(false)
    setGiven(null)
    flyer.drop()
  })

  const onHandPlay = (uid: string, drop: HandPlayDrop) => {
    const item = state.you.hand.find((c) => c.uid === uid)
    if (!enabled || !asked || inFlight.current || given || !item) return false
    inFlight.current = true
    const token = ++attempt.current
    const valid = () =>
      token === attempt.current &&
      current.current.pending?.actor === pending?.actor &&
      current.current.pending?.source === pending?.source &&
      current.current.asked &&
      current.current.enabled
    setGiven(uid)
    void (async () => {
      const target = upgradeSlot(args.anchors, state.selfId)?.getBoundingClientRect()
      if (!reduced && target && drop.rect) {
        const [el] = await flyer.raise([{ key: 'upgrade-local', card: item.card, at: drop.rect }])
        if (el && valid())
          await play('playToCenter', el, { from: drop.rect, to: target, duration: 460 })?.finished
      }
      if (!valid()) {
        if (token === attempt.current) {
          inFlight.current = false
          setGiven(null)
          flyer.drop()
        }
        return
      }
      setConfirmed(true)
      resolve({ kind: 'upgradeDiscard', card: uid })
    })()
    return true
  }
  const handItems = state.you.hand.filter((c) => c.uid !== given)
  const stateAt = (index: number): HandCardState =>
    enabled && asked && !given && !confirmed && handItems[index] ? 'playable' : 'idle'
  const interaction = {
    asked: Boolean(enabled && asked),
    onHandPlay,
    handItems,
    stateAt,
    accentAt: (index: number) =>
      stateAt(index) === 'playable' ? 'var(--danger-accent)' : undefined,
    stagedUid: given,
    el: () => flyer.elOf('upgrade-local'),
    release: () => {
      flyer.drop()
      setGiven(null)
      setConfirmed(false)
      inFlight.current = false
    },
    overlay: flyer.overlay,
  }
  if (!pending || !enabled) return { surface: null, ...interaction }

  // One place per seat this pending is owed to or has heard from, in a row from
  // the centre module (`rowPlaceStyle`) rather than a flex row of this hook's
  // own: the centre of the table is one geometry, declared once, and a row of
  // open cards is the shape it comes in when the count is what decides it. The
  // seat order is the row's order, so a seat's place never moves under it when
  // another one answers.
  const seats = [...new Set([...pending.owed, ...pending.thrown.map((t) => t.player)])].sort()
  const centre = (
    <>
      {seats.map((player, i) => {
        const place = rowPlaceStyle('upgrade', seats.length, i)
        const t = pending.thrown.find((entry) => entry.player === player)
        if (!t)
          return (
            <div key={player} data-upgrade-slot={player} className={styles.cell} style={place} />
          )
        const data = cardById(t.card.id)
        if (!data) return null
        // THE PLACE AND THE CARD ARE TWO NODES, never one. A place positions
        // itself with a transform, and a flight's very first frame sets its own
        // transform from zero — so a card that IS its place loses that
        // positioning the instant it takes off and flies from half a card away.
        // The module says the same thing from the other side: the place stays
        // the true card box so flights can aim at it (I6), and everything a card
        // does to itself lives on the node inside it.
        return (
          <div key={player} data-upgrade-slot={player} className={styles.cell} style={place}>
            <button
              type="button"
              data-upgrade-card=""
              data-testid={`upgrade-thrown-${t.card.uid}`}
              className={styles.thrown}
              disabled={!picking}
              onClick={() => picking && setTaken(t.card.uid)}
            >
              <Card
                card={data}
                interactive={false}
                width="100%"
                state={taken === t.card.uid ? 'selected' : 'idle'}
                // one out of a set — the uniform selection colour
                accent="var(--select-accent)"
              />
            </button>
          </div>
        )
      })}
    </>
  )

  if (confirmed) return { surface: centre, ...interaction }

  if (asked) {
    return {
      ...interaction,
      surface: (
        <div className={styles.surface} data-testid="board-upgrade-ask">
          {centre}
          <div className={opening.ask} data-shown="true" role="status">
            <Typography as="div" base="label-sm" tk="tk-16" className={opening.askLine}>
              {copy.prompt}
            </Typography>
          </div>
        </div>
      ),
    }
  }

  if (picking) {
    return {
      ...interaction,
      surface: (
        <div className={styles.surface}>
          {centre}
          <ConfirmAction
            open
            label={copy.confirm}
            caption={copy.takePrompt}
            disabled={taken == null}
            onConfirm={() => {
              if (!taken || !pending.thrown.some((t) => t.card.uid === taken)) return
              setConfirmed(true)
              resolve({ kind: 'upgradeTake', card: taken })
            }}
          />
        </div>
      ),
    }
  }

  // Answered, or never asked: the cards simply stand.
  return { ...interaction, surface: <div className={styles.surface}>{centre}</div> }
}
