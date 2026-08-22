import { wait } from '@release/ui/animations'
import { type ReactNode, useCallback, useRef, useState } from 'react'
import type { BeatRun } from '~/entities/game/board'
import styles from './eliminateBeat.module.css'
import type { BeatPlan } from './planBeats'

// A player is out, and the whole table watches it happen: the board has already
// settled into its eliminated state, and the clip plays over the top of it
// (#103). Ported from the playground's own Error503Story — `playEliminationGif`
// and the `.gifOverlay` layer.
//
// The beat PUBLISHES NOTHING. The eliminated state is the projection's own
// (`fake/project.ts:184` → `toBoardState`), so the seat, the hand and the zone
// read as out because the board says so, not because this beat said so — which
// is what keeps them out for the rest of the match once the clip is gone.

// Bundled, not fetched: the app has no backend and no CDN in front of it
// (CLAUDE.md's Architecture Rule). Vite emits each clip as its own hashed file
// rather than folding it into the JS, so nothing here is paid for until the
// overlay actually mounts. SORTED, because the pick below is an index: glob
// order is Vite's to change, and a clip that moves would silently become a
// different clip on a peer running an older build.
export const ELIMINATION_CLIPS: string[] = Object.entries(
  import.meta.glob('./eliminate/*.mp4', { eager: true, query: '?url', import: 'default' }),
)
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([, url]) => url as string)

/** a beat after the table has emptied, before the clip comes in — landing on
 *  the same frame reads as a cut */
export const ELIM_DELAY = 400
/** loop for at least this long, then let the current loop finish */
export const ELIM_MIN_MS = 5000
/**
 * And leave after this long no matter what. Not a rule about the game — an
 * engineering floor under one: the loop is ended by `ended`, and a stalled
 * stream never fires it. The beat owns the table while it runs, so without this
 * a clip that hangs holds one player's board dead for the rest of the match.
 */
export const ELIM_CEILING_MS = 12000

export function useEliminateBeat() {
  const [clip, setClip] = useState<string | null>(null)
  const started = useRef(0)
  const resolve = useRef<(() => void) | null>(null)
  const ceiling = useRef<ReturnType<typeof setTimeout> | null>(null)

  // One way out, however the clip got here: the overlay goes, the watchdog is
  // disarmed, and the beat's own promise resolves exactly once.
  const finish = useCallback(() => {
    if (ceiling.current) clearTimeout(ceiling.current)
    ceiling.current = null
    setClip(null)
    resolve.current?.()
    resolve.current = null
  }, [])

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'eliminated' }>, _ctx: BeatRun): Promise<void> => {
      if (ELIMINATION_CLIPS.length === 0) return
      // Resolved from the elimination itself rather than picked at random: every
      // peer holds this event id already, so one elimination is one clip on
      // every screen — a table watching the same thing, at no cost on the wire.
      const src = ELIMINATION_CLIPS[plan.eventId % ELIMINATION_CLIPS.length]
      await wait(ELIM_DELAY)
      started.current = Date.now()
      setClip(src)
      return new Promise<void>((res) => {
        resolve.current = res
        ceiling.current = setTimeout(finish, ELIM_CEILING_MS)
      })
    },
    [finish],
  )

  // one loop finished: play it again until the floor is reached, then leave
  const onEnded = useCallback(
    (e: React.SyntheticEvent<HTMLVideoElement>) => {
      if (Date.now() - started.current < ELIM_MIN_MS) {
        const v = e.currentTarget
        v.currentTime = 0
        void v.play()
        return
      }
      finish()
    },
    [finish],
  )

  // A missing file, or a codec the browser refuses. Nothing is invented in its
  // place: the board is already in its eliminated state, which is what carries
  // the news — the clip was the punctuation, not the sentence.
  const onError = useCallback(() => finish(), [finish])

  // A new match cancels what is in the air — the same reason every other runner
  // has a reset: a clip left playing would cover a board that no longer exists.
  const reset = useCallback(() => finish(), [finish])

  const overlay: ReactNode[] = clip
    ? [
        <div key="elimination" className={styles.overlay} data-testid="elimination-clip">
          <video
            // a media element does NOT re-fetch when `src` changes: keyed by the
            // source, so a different clip is a different element (I5)
            key={clip}
            className={styles.video}
            src={clip}
            autoPlay
            muted
            playsInline
            onEnded={onEnded}
            onError={onError}
          />
        </div>,
      ]
    : []

  return { overlay, run, reset }
}
