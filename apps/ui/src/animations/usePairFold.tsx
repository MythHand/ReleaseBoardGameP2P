import { useRef, useState } from 'react'
import type { Card as CardType } from '@/cards/types'
import CardPair, { PAIR_AUX_POSE } from '@/primitives/CardPair'
import { play } from './play'
import { enterPose } from './presets'
import type { Rect } from './scatter'
import { nextFrames } from './timing'
import styles from './usePairFold.module.css'

// THE step "two cards become one pair on the table" — the third movement packed
// out of the scenes, after the arrival in the hand and the exit to the discard.
//
// The preset `foldIntoPair` was already there; the MOVE was not. Every caller
// wrote the same six lines around it — raise a carrier holding a <CardPair>,
// paint both halves at the poses they would have standing where they really are,
// wait a frame, run the fold on each half in parallel — and there were four such
// callers: the scene, and three on the board. A preset is a brick; this is the
// gesture built out of it, and a gesture written four times drifts four ways.
//
// The rules it holds:
//   • BOTH halves start from where they really are on screen. The main card from
//     the hand slot it left, the aux from the place it was standing on the table
//     — nothing teleports to a common origin first.
//   • the aux lands on CardPair's OWN resting pose (PAIR_AUX_POSE), so handing
//     the finished pair over to a static render changes nothing on screen.
//   • the pair is mounted INVISIBLE and revealed in the same tick its halves get
//     their entry poses (I2). This is the blind spot of the flyer form: a carrier
//     paints before the caller can reach into it, so three of the four copies
//     showed the pair already folded for a frame or two before it started to
//     fold. Here it cannot happen — there is no frame in which the halves have
//     no entry pose and the node is visible.
//   • the node STAYS UP after the fold. The caller hands the pair to whatever
//     renders it at rest and only then calls `release()` — dropping it here would
//     blink the pair out between the last frame and the static render (I4's
//     reason, from the other side).

// how long the two halves travel — the fold's own duration, and the value the
// scene the step was packed out of has always used
const FOLD_MS = 620

export interface Folding {
  /** the card that ends up on top — the play itself */
  main: CardType
  /** the card tucked under it: a Sudo behind an attack, a Code Review under a release */
  aux: CardType
  /** where the main card is NOW — the slot it leaves, measured before it is let go (I1) */
  mainFrom: Rect
  /** where the aux card is NOW — the place on the table it was already standing in */
  auxFrom: Rect
  /** the pair's place on the table: the box it folds into */
  box: Rect
  /** the tilt the pair rests at once it is there — a played card lies at its own angle (I11) */
  pose?: string
  /** its layer, when something else is in the air at the same time (I9) */
  layer?: number
  /** how long the fold takes; the default is the approved one */
  dur?: number
}

interface Mounted extends Folding {
  seq: number
}

export function usePairFold() {
  const [pair, setPair] = useState<Mounted | null>(null)
  const nodeRef = useRef<HTMLDivElement | null>(null)
  const seq = useRef(0)

  /** the pair's node — for a caller that has something of its own to do with it */
  const node = () => nodeRef.current

  /** the static render has taken over: the node can go */
  const release = () => setPair(null)

  const fold = async (it: Folding): Promise<void> => {
    setPair({ ...it, seq: ++seq.current })
    await nextFrames() // mounted — and still invisible
    const el = nodeRef.current
    const mainEl = el?.querySelector<HTMLElement>('[data-main]')
    const auxEl = el?.querySelector<HTMLElement>('[data-aux]')
    // a fold with no node means the scene never rendered `overlay` — and without
    // this it would simply not happen, with no error anywhere (the same silence
    // useDiscardExit had to answer for)
    if (!el || !mainEl || !auxEl) {
      console.error('usePairFold: no pair node — is `overlay` rendered?')
      return
    }
    for (const a of el.getAnimations()) a.cancel() // I3
    // the entry poses and the reveal happen in ONE tick, BEFORE a frame is
    // painted: the first frame the pair is visible in is the frame its halves
    // are still apart. `enterPose` is the same formula the fold starts from, so
    // the painted frame and the animation's first keyframe are the same pose.
    mainEl.style.transform = enterPose(it.mainFrom, it.box)
    auxEl.style.transform = enterPose(it.auxFrom, it.box)
    el.dataset.shown = 'true'
    await nextFrames() // I2 — both halves have painted apart before they move
    const dur = it.dur ?? FOLD_MS
    const a1 = play('foldIntoPair', mainEl, { from: it.mainFrom, box: it.box, dur })
    const a2 = play('foldIntoPair', auxEl, {
      from: it.auxFrom,
      box: it.box,
      pose: PAIR_AUX_POSE,
      dur,
      snap: true, // the tucked half lands with a settle, as CardPair rests it
    })
    await Promise.all([a1?.finished, a2?.finished])
  }

  const overlay = pair && (
    <div
      key={pair.seq} // a fresh node per fold (I5)
      className={styles.flyer}
      ref={(el) => {
        nodeRef.current = el
      }}
      style={{
        left: pair.box.left,
        top: pair.box.top,
        inlineSize: pair.box.width,
        zIndex: pair.layer == null ? undefined : `calc(var(--z-flight) + ${pair.layer})`,
        transform: pair.pose,
      }}
    >
      <CardPair main={pair.main} aux={pair.aux} width="100%" />
    </div>
  )

  return { overlay, fold, release, node, FOLD_MS }
}
