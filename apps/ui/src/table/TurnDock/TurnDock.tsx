import styles from './TurnDock.module.css'

// Turn dock — the technical turn-control area on the Table screen. Lives at the
// bottom-left, under the draw decks, left of the player's hand.
//
// A deliberately custom, game-HUD element (not built from @release/ui primitives)
// — ring timer, oversized readout, an energized action key, techno grid + glow.
// Presentational + i18n-agnostic: copy via props, timer values passed in (no
// timer logic here). One fixed footprint across every state; only content swaps:
//  - 'draw'     my turn, card not drawn yet → DRAW key, PUSH-locked hint
//  - 'push'     my turn, already drawn      → PUSH key + "drawn" chip
//  - 'waiting'  an opponent's turn          → whose turn + ring, no action
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
  turnOf: 'ходит',
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
  turnOf: 'turn',
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

const R = 54
const C = 2 * Math.PI * R

const PHASE_KEY: Record<TurnDockState, keyof TurnDockCopy> = {
  draw: 'yourTurn',
  push: 'yourTurn',
  waiting: 'turnOf',
  reaction: 'reaction',
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
  const dash = C * (1 - Math.min(Math.max(progress, 0), 1))
  const mine = state === 'draw' || state === 'push'
  const reactionDanger = state === 'reaction' && danger
  const phase = reactionDanger ? copy.reactionDanger : copy[PHASE_KEY[state]]

  return (
    <div className={styles.dock} data-state={state} data-danger={reactionDanger ? '' : undefined}>
      <div className={styles.grid} aria-hidden="true" />
      <div className={styles.glow} aria-hidden="true" />

      <div className={styles.top}>
        <span className={styles.dot} aria-hidden="true" />
        <span className={styles.phase}>{phase}</span>
        {state === 'push' && <span className={styles.chip}>{copy.drawn}</span>}
      </div>

      <div className={styles.body}>
        <div className={styles.ring}>
          <svg viewBox="0 0 128 128" className={styles.ringSvg} aria-hidden="true">
            <circle className={styles.ringTrack} cx="64" cy="64" r={R} />
            <circle
              className={styles.ringProg}
              cx="64"
              cy="64"
              r={R}
              strokeDasharray={C}
              strokeDashoffset={dash}
            />
          </svg>
          <div className={styles.num}>{seconds}</div>
        </div>

        <div className={styles.action}>
          {mine && (
            <button
              type="button"
              className={styles.key}
              onClick={state === 'draw' ? onDraw : onPush}
            >
              <span className={styles.glint} aria-hidden="true" />
              <span className={styles.bracket}>[</span>
              <span className={styles.keyLabel}>{state === 'draw' ? copy.draw : copy.push}</span>
              <span className={styles.bracket}>]</span>
            </button>
          )}
          {state === 'draw' && <span className={styles.locked}>{copy.locked}</span>}

          {state === 'waiting' && activePlayer && (
            <div className={styles.spectate}>
              <span className={styles.avatar}>{activePlayer[0]?.toUpperCase()}</span>
              <span className={styles.name}>{activePlayer}</span>
            </div>
          )}

          {state === 'reaction' && (
            <>
              <button type="button" className={styles.key} onClick={onPass}>
                <span className={styles.glint} aria-hidden="true" />
                <span className={styles.bracket}>[</span>
                <span className={styles.keyLabel}>{copy.pass}</span>
                <span className={styles.bracket}>]</span>
              </button>
              <span className={styles.locked}>{copy.canDefend}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
