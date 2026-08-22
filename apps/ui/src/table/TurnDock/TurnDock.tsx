import { type CSSProperties, useEffect, useState } from 'react'
import Badge from '@/primitives/Badge'
import Button from '@/primitives/Button'
import HudSurface from '@/primitives/HudSurface'
import RingTimer from '@/primitives/RingTimer'
import StatusDot from '@/primitives/StatusDot'
import Typography from '@/primitives/Typography'
import Reveal from './Reveal'
import Swap, { type SwapMotion } from './Swap'
import styles from './TurnDock.module.css'

// Swap timings by role (200–550ms band). Opacity-only fades — no movement. The
// opponent name is sequential: it waits for the previous content (a key, or the
// previous nick) to clear (delayIn) before fading in — one motion for both first
// appearance and every opponent→opponent change.
const SOFT: SwapMotion = { out: 220, in: 300 } // phase / key label
const MODE: SwapMotion = { out: 240, in: 340 } // opponent → your turn (key back)
const NAME: SwapMotion = { out: 240, in: 320, delayIn: 260 } // name appears (after prev clears)

// Input-lockout: after the action key appears / swaps to a new action, ignore
// clicks for a beat — an inertia-click aimed at the previous key would otherwise
// fire the new action. Invisible (the key stays fully lit); ~one fade-in long.
const LOCKOUT_MS = 300

// Widest of the given strings — reserves a fixed slot so a text box never resizes
// between states (all values are known up front).
const longest = (...xs: string[]): string => xs.reduce((a, b) => (b.length > a.length ? b : a))

// Turn dock — the technical turn-control area on the Table screen. Lives at the
// bottom-left, under the draw decks, left of the player's hand. Assembled from
// HUD primitives (HudSurface / RingTimer / StatusDot / Button hud / Badge);
// presentational + i18n-agnostic (copy via props, timer values passed in).
//
// One fixed footprint AND one fixed layout across every state — the action key,
// its under-caption and the "drawn" badge each hold a constant slot; only their
// content swaps:
//  - 'draw'     my turn, card not drawn yet → DRAW key + PUSH-locked caption
//  - 'push'     my turn, already drawn      → PUSH key + "drawn" badge
//  - 'waiting'  an opponent's turn          → active player in the key's slot
//  - 'reaction' a decision is owed BY ME — a defence, a 503 (amber, or red danger)
//  - 'attack'   somebody else's fresh release is open to me → PASS key, violet.
//               Passing says only "not this moment": the window ends early when
//               every responder has passed, and until it does the pass can be
//               taken back from the same key, which then reads "unpass". The
//               engine never bars a later attack because of it.
//  - 'hold'     the table waits on something not mine to press — my own release
//               under the window (caption says so), or someone else's decision
//               (their name in the key's slot). Reaction accent, live ring, no
//               key: everything a key could offer is illegal right now.
//
// Paying a release's own price is deliberately NOT a state here (#101): it is
// one action inside a turn, not a state of the table, so the dock keeps the
// turn's own phase and accent while the cost is owed. What is wanted of the
// player is said by the ask on the table, and the key stays live because
// pressing it takes the staged release back first (`dock.ts`).
export type TurnDockState = 'draw' | 'push' | 'waiting' | 'reaction' | 'attack' | 'hold'

export interface TurnDockCopy {
  yourTurn: string
  turnOf: string
  reaction: string
  reactionDanger: string
  // 'attack' — the phase word, its caption, and the key once you have passed
  attack: string
  canAttack: string
  passed: string
  unpass: string
  draw: string
  push: string
  pass: string
  drawn: string
  locked: string
  canDefend: string
  // 'hold' with no activePlayer: your own release is the window's target
  underAttack: string
}

interface TurnDockProps {
  state: TurnDockState
  // seconds left on the clock — the ticking number reads as the timer. Omitted
  // when the state has no deadline, which leaves a bare ring: a rendered `0`
  // would read as a timer stuck at zero rather than as no timer at all.
  seconds?: number
  // 0..1 of the time still left — drives the ring sweep
  progress: number
  // localized strings — sourced from the central catalog by the consumer and
  // passed in (the library stays i18n-agnostic)
  copy: TurnDockCopy
  // active player's name — shown in 'waiting' / 'reaction'
  activePlayer?: string
  // reaction only: red danger tone (e.g. Error 503) vs the default amber
  danger?: boolean
  // 'attack' only: this seat has already passed on the open window. The key
  // turns into "unpass" rather than disappearing — a pass is a statement about
  // this moment, not a forfeit, and taking it back is a legal move for as long
  // as the window stands.
  passed?: boolean
  // game paused (e.g. a peer dropped / host stepped away): the block desaturates
  // to grey — the frozen timer value is passed in as usual by the consumer
  paused?: boolean
  onDraw?: () => void
  onPush?: () => void
  onPass?: () => void
  // 'attack' with `passed`: takes the pass back
  onUnpass?: () => void
}

const PHASE_KEY: Record<TurnDockState, keyof TurnDockCopy> = {
  draw: 'yourTurn',
  push: 'yourTurn',
  waiting: 'turnOf',
  reaction: 'reaction',
  attack: 'attack',
  hold: 'reaction',
}

function accentFor(state: TurnDockState, danger: boolean): string {
  if (state === 'reaction' || state === 'hold') {
    return danger ? 'var(--danger-accent)' : 'var(--reaction-accent)'
  }
  // The offensive half of a window gets its own hue: the same ring, the same
  // key, but "I may hit" and "I must answer" are opposite situations and the
  // dock is read at a glance.
  if (state === 'attack') return 'var(--attack-accent)'
  if (state === 'waiting') return 'var(--idle-accent)'
  return 'var(--turn-accent)'
}

export default function TurnDock({
  state,
  seconds,
  progress,
  copy,
  activePlayer,
  danger = false,
  passed = false,
  paused = false,
  onDraw,
  onPush,
  onPass,
  onUnpass,
}: TurnDockProps) {
  const mine = state === 'draw' || state === 'push'
  const reactionDanger = state === 'reaction' && danger
  const phase = reactionDanger ? copy.reactionDanger : copy[PHASE_KEY[state]]
  const accent = accentFor(state, danger)
  const accentStyle = { '--btn-accent': accent } as CSSProperties

  // 'hold' splits by what fills the key's slot: a named decider says enough on
  // its own; an empty slot (your own release under the window) gets the why.
  const attackPassed = state === 'attack' && passed
  const caption =
    state === 'draw'
      ? copy.locked
      : state === 'reaction'
        ? copy.canDefend
        : state === 'attack'
          ? // having passed is a state worth saying out loud: the window is still
            // open, the key still works, and the caption is what tells you the
            // pass is yours to take back rather than a door that shut.
            attackPassed
            ? copy.passed
            : copy.canAttack
          : state === 'hold' && !activePlayer
            ? copy.underAttack
            : null

  // key/label states share one Button frame (draw / push / reaction / attack);
  // 'waiting' shows the active player's name instead.
  const buttonMode = mine || state === 'reaction' || state === 'attack'
  const label =
    state === 'draw'
      ? copy.draw
      : state === 'push'
        ? copy.push
        : attackPassed
          ? copy.unpass
          : copy.pass
  const handler =
    state === 'draw' ? onDraw : state === 'push' ? onPush : attackPassed ? onUnpass : onPass

  // re-arm the lockout whenever the actionable key changes (or reappears) —
  // pass↔unpass is a change of action on one key, so it re-arms too.
  const keyId = buttonMode ? `${state}${attackPassed ? ':unpass' : ''}` : 'idle'
  const [keyLocked, setKeyLocked] = useState(true)
  // biome-ignore lint/correctness/useExhaustiveDependencies: keyId is the re-arm trigger, not read inside
  useEffect(() => {
    setKeyLocked(true)
    const id = setTimeout(() => setKeyLocked(false), LOCKOUT_MS)
    return () => clearTimeout(id)
  }, [keyId])
  const onKey = () => {
    if (!keyLocked) handler?.()
  }

  // phase + key label share one plain fade; the action slot fades the name in
  // after the previous content clears (sequential), the key back in flat.
  const modeAnim = state === 'waiting' ? NAME : MODE

  // opponent's turn — the ring is dimmed (empty arc, bare track) with NO
  // countdown: their per-phase inactivity timer resets on every action, so a
  // mirrored number would only jump for a watcher and means nothing to them.
  const idleRing = state === 'waiting'

  // widest known value per text slot — reserves a fixed box (no reflow)
  const phaseSizer = longest(
    copy.yourTurn,
    copy.turnOf,
    copy.reaction,
    copy.reactionDanger,
    copy.attack,
  )
  const labelSizer = longest(copy.draw, copy.push, copy.pass, copy.unpass)
  const captionSizer = longest(
    copy.locked,
    copy.canDefend,
    copy.underAttack,
    copy.canAttack,
    copy.passed,
  )

  return (
    <HudSurface accent={accent} className={`${styles.dock} ${paused ? styles.paused : ''}`}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <StatusDot accent={accent} pulse={state !== 'waiting'} />
          <Swap
            token={phase}
            anim={SOFT}
            align="start"
            sizer={
              <Typography as="span" base="label-md" tk="tk-22" className={styles.phase}>
                {phaseSizer}
              </Typography>
            }
          >
            <Typography as="span" base="label-md" tk="tk-22" className={styles.phase}>
              {phase}
            </Typography>
          </Swap>
          <Reveal when={state === 'push'} className={styles.chip}>
            <Badge tone="hud">{copy.drawn}</Badge>
          </Reveal>
        </div>

        <div className={styles.body}>
          <RingTimer
            progress={idleRing ? 0 : progress}
            value={idleRing ? undefined : seconds}
            accent={accent}
          />

          <div className={styles.action}>
            <div className={styles.actionMain}>
              <Swap token={buttonMode ? 'btn' : 'name'} anim={modeAnim} fill>
                {buttonMode ? (
                  <Button
                    variant="hud"
                    data-testid="dock-key"
                    className={styles.key}
                    style={accentStyle}
                    onClick={onKey}
                  >
                    <Swap token={label} anim={SOFT} sizer={labelSizer}>
                      {label}
                    </Swap>
                  </Button>
                ) : (
                  <Swap token={activePlayer ?? ''} anim={NAME} fill className={styles.name}>
                    <Typography as="span" base="mono-xl">
                      {activePlayer}
                    </Typography>
                  </Swap>
                )}
              </Swap>
            </div>

            <div className={styles.caption}>
              <Swap
                token={caption ?? '∅'}
                sizer={
                  <Typography as="span" base="label-sm" tk="tk-10">
                    {captionSizer}
                  </Typography>
                }
              >
                {caption && (
                  <Typography as="span" base="label-sm" tk="tk-10">
                    {caption}
                  </Typography>
                )}
              </Swap>
            </div>
          </div>
        </div>
      </div>
    </HudSurface>
  )
}
