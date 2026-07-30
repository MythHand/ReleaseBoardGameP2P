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
//  - 'reaction' reaction window on a release → PASS key (amber, or red danger)
export type TurnDockState = 'draw' | 'push' | 'waiting' | 'reaction'

export interface TurnDockCopy {
  yourTurn: string
  turnOf: string
  reaction: string
  reactionDanger: string
  draw: string
  push: string
  pass: string
  drawn: string
  locked: string
  canDefend: string
}

interface TurnDockProps {
  state: TurnDockState
  // seconds left on the clock — the ticking number reads as the timer
  seconds: number
  // 0..1 of the time still left — drives the ring sweep
  progress: number
  // localized strings — sourced from the central catalog by the consumer and
  // passed in (the library stays i18n-agnostic)
  copy: TurnDockCopy
  // active player's name — shown in 'waiting' / 'reaction'
  activePlayer?: string
  // reaction only: red danger tone (e.g. Error 503) vs the default amber
  // "attack a release" reaction
  danger?: boolean
  // game paused (e.g. a peer dropped / host stepped away): the block desaturates
  // to grey — the frozen timer value is passed in as usual by the consumer
  paused?: boolean
  onDraw?: () => void
  onPush?: () => void
  onPass?: () => void
}

const PHASE_KEY: Record<TurnDockState, keyof TurnDockCopy> = {
  draw: 'yourTurn',
  push: 'yourTurn',
  waiting: 'turnOf',
  reaction: 'reaction',
}

function accentFor(state: TurnDockState, danger: boolean): string {
  if (state === 'reaction') return danger ? 'var(--danger-accent)' : 'var(--reaction-accent)'
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
  paused = false,
  onDraw,
  onPush,
  onPass,
}: TurnDockProps) {
  const mine = state === 'draw' || state === 'push'
  const reactionDanger = state === 'reaction' && danger
  const phase = reactionDanger ? copy.reactionDanger : copy[PHASE_KEY[state]]
  const accent = accentFor(state, danger)
  const accentStyle = { '--btn-accent': accent } as CSSProperties

  const caption = state === 'draw' ? copy.locked : state === 'reaction' ? copy.canDefend : null

  // key/label states share one Button frame (draw / push / reaction); 'waiting'
  // shows the active player's name instead.
  const buttonMode = mine || state === 'reaction'
  const label = state === 'draw' ? copy.draw : state === 'push' ? copy.push : copy.pass
  const handler = state === 'draw' ? onDraw : state === 'push' ? onPush : onPass

  // re-arm the lockout whenever the actionable key changes (or reappears)
  const keyId = buttonMode ? state : 'idle'
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
  const phaseSizer = longest(copy.yourTurn, copy.turnOf, copy.reaction, copy.reactionDanger)
  const labelSizer = longest(copy.draw, copy.push, copy.pass)
  const captionSizer = longest(copy.locked, copy.canDefend)

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
                  <Button variant="hud" className={styles.key} style={accentStyle} onClick={onKey}>
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
