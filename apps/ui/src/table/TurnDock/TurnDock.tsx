import type { CSSProperties } from 'react'
import Badge from '@/primitives/Badge'
import Button from '@/primitives/Button'
import HudSurface from '@/primitives/HudSurface'
import RingTimer from '@/primitives/RingTimer'
import StatusDot from '@/primitives/StatusDot'
import Typography from '@/primitives/Typography'
import styles from './TurnDock.module.css'

// Turn dock — the technical turn-control area on the Table screen. Lives at the
// bottom-left, under the draw decks, left of the player's hand. Assembled from
// HUD primitives (HudSurface / RingTimer / StatusDot / Button hud / Avatar /
// Badge); presentational + i18n-agnostic (copy via props, timer values passed in).
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

export const TURN_DOCK_COPY_RU: TurnDockCopy = {
  yourTurn: 'ваш ход',
  turnOf: 'ход соперника',
  reaction: 'реакция',
  reactionDanger: 'error 503',
  draw: 'добор',
  push: 'PUSH',
  pass: 'пас',
  drawn: 'добор ✓',
  locked: 'PUSH после добора',
  canDefend: 'можно отбить',
}

export const TURN_DOCK_COPY_EN: TurnDockCopy = {
  yourTurn: 'your turn',
  turnOf: 'opponent turn',
  reaction: 'reaction',
  reactionDanger: 'error 503',
  draw: 'draw',
  push: 'PUSH',
  pass: 'pass',
  drawn: 'draw ✓',
  locked: 'PUSH after draw',
  canDefend: 'you can defend',
}

interface TurnDockProps {
  state: TurnDockState
  // seconds left on the clock — the ticking number reads as the timer
  seconds: number
  // 0..1 of the time still left — drives the ring sweep
  progress: number
  copy?: TurnDockCopy
  // active player's name — shown in 'waiting' / 'reaction'
  activePlayer?: string
  // reaction only: red danger tone (e.g. Error 503) vs the default amber
  // "attack a release" reaction
  danger?: boolean
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
  copy = TURN_DOCK_COPY_RU,
  activePlayer,
  danger = false,
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

  return (
    <HudSurface accent={accent} className={styles.dock}>
      <div className={styles.inner}>
        <div className={styles.top}>
          <StatusDot accent={accent} pulse={state !== 'waiting'} />
          <Typography as="span" base="label-md" tk="tk-22" className={styles.phase}>
            {phase}
          </Typography>
          {state === 'push' && (
            <Badge tone="hud" className={styles.chip}>
              {copy.drawn}
            </Badge>
          )}
        </div>

        <div className={styles.body}>
          <RingTimer progress={progress} value={seconds} accent={accent} />

          <div className={styles.action}>
            <div className={styles.actionMain}>
              {mine && (
                <Button
                  variant="hud"
                  style={accentStyle}
                  onClick={state === 'draw' ? onDraw : onPush}
                >
                  {state === 'draw' ? copy.draw : copy.push}
                </Button>
              )}
              {state === 'reaction' && (
                <Button variant="hud" style={accentStyle} onClick={onPass}>
                  {copy.pass}
                </Button>
              )}
              {state === 'waiting' && activePlayer && (
                <Typography as="span" base="mono-xl" className={styles.name}>
                  {activePlayer}
                </Typography>
              )}
            </div>

            <div className={styles.caption}>
              {caption && (
                <Typography as="span" base="label-sm" tk="tk-10">
                  {caption}
                </Typography>
              )}
            </div>
          </div>
        </div>
      </div>
    </HudSurface>
  )
}
