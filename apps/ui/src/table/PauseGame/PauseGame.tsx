import { type CSSProperties, useEffect, useRef, useState } from 'react'
import Button from '@/primitives/Button'
import Overlay from '@/primitives/Overlay'
import StatusDot from '@/primitives/StatusDot'
import Typography from '@/primitives/Typography'
import styles from './PauseGame.module.css'

export interface PausePlayer {
  id: string
  name: string
  ready: boolean
}

// Text — via props (i18n-agnostic); strings come from the central catalog.
export interface PauseGameCopy {
  title: string
  // shown while at least one player is not ready…
  subtitle: string
  // …and swapped for this once everyone is ready (host's cue to resume)
  subtitleReady: string
  // markers appended to a lamp — the local player / the host
  you: string
  host: string
  // status words for a green / red lamp
  ready: string
  notReady: string
  // host resume CTA
  resume: string
}

interface PauseGameProps {
  players: PausePlayer[]
  // which lamp belongs to the local player — only that one is tappable
  selfId?: string
  // which lamp belongs to the host — tagged with the host marker
  hostId?: string
  // the host sees the central resume button (and un-pauses from settings too)
  isHost?: boolean
  // toggle the local player's readiness lamp
  onToggleReady?: () => void
  // host resume — ungated: the lamps are a readiness signal for the host, not a
  // lock on the button
  onResume?: () => void
  copy: PauseGameCopy
}

// Anti-spam: after tapping your own lamp, swallow taps for a beat so a rapid
// green/red flicker can't be spammed to the table.
const LOCKOUT_MS = 1500

// Pause window over the table — the host froze the game (settings → pause). The
// screen behind reads as blocked and the turn timer is frozen for everyone; the
// right-hand nav stays live (the overlay sits below the rail/drawer z-layer, so
// the Table needs no extra wiring). Shows one readiness lamp per player — each
// player toggles their own (green ready / red not, default red) — and, for the
// host, a central resume button. Resume is ungated: the lamps only signal
// readiness to the host, they don't lock the button.
export default function PauseGame({
  players,
  selfId,
  hostId,
  isHost = false,
  onToggleReady,
  onResume,
  copy,
}: PauseGameProps) {
  const [locked, setLocked] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => () => clearTimeout(timer.current), [])

  const tapSelf = () => {
    if (locked) return
    onToggleReady?.()
    setLocked(true)
    timer.current = setTimeout(() => setLocked(false), LOCKOUT_MS)
  }

  // once everyone's lamp is green the subtitle turns into the host's resume cue
  const allReady = players.length > 0 && players.every((p) => p.ready)

  return (
    <Overlay className={styles.over}>
      <div className={styles.card}>
        <span className={styles.mark} aria-hidden="true" />
        <Typography as="div" variant="panelTitle" className={styles.title}>
          {copy.title}
        </Typography>
        <Typography as="div" base="mono-xs" className={styles.subtitle}>
          {allReady ? copy.subtitleReady : copy.subtitle}
        </Typography>

        <ul className={styles.lamps}>
          {players.map((p) => {
            const self = p.id === selfId
            const accent = p.ready ? 'var(--brand-green)' : 'var(--coral)'
            const status = p.ready ? copy.ready : copy.notReady
            // lamp markers: local player and/or host
            const marks = [self ? copy.you : null, p.id === hostId ? copy.host : null].filter(
              Boolean,
            )
            const body = (
              <>
                <StatusDot accent={accent} pulse={!p.ready} size={10} />
                <Typography as="span" base="mono-xl" className={styles.name}>
                  {p.name}
                  {marks.length > 0 && <span className={styles.you}> · {marks.join(' · ')}</span>}
                </Typography>
                <Typography
                  as="span"
                  base="label-sm"
                  tk="tk-10"
                  className={styles.status}
                  style={{ '--lamp': accent } as CSSProperties}
                >
                  {status}
                </Typography>
              </>
            )
            return (
              <li key={p.id} className={styles.lamp}>
                {self ? (
                  <button
                    type="button"
                    className={styles.selfBtn}
                    onClick={tapSelf}
                    data-locked={locked ? '' : undefined}
                  >
                    {body}
                  </button>
                ) : (
                  <div className={styles.row}>{body}</div>
                )}
              </li>
            )
          })}
        </ul>

        {isHost && (
          <div className={styles.actions}>
            <Button onClick={onResume}>{copy.resume}</Button>
          </div>
        )}
      </div>
    </Overlay>
  )
}
