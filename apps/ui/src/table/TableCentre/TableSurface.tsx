import type { ReactNode, Ref } from 'react'
import Overlay from '@/primitives/Overlay'
import styles from './TableSurface.module.css'

// THE SURFACE A STEP PUTS OVER THE TABLE while it asks for an answer: the row a
// Rebase is reordered in, the grid a Cherry-pick is picked from, the band a
// named card is requested on.
//
// It is one component because it is one thing, and it had been assembled five
// times: three scenes shared a stylesheet and each still wrote its own rule for
// the cursor; two more built the whole construction separately. The rule that
// kept being missed is the one that matters most — A SURFACE MUST NOT LET THE
// MOUSE THROUGH — and it was missed in exactly the scene whose own content box
// happened to be transparent (owner, 22.09).
//
// WHAT IT OWNS: the layer, the blocking, the dimming, and the switch to the
// flight band once the answer is committed.
//
// WHAT IT DOES NOT: anything that comes from the effect itself — what stands in
// it, how the answer is given, where the content sits. Those are the scene's,
// and folding them in here is how two different questions start looking like
// one.

export interface TableSurfaceProps {
  /**
   * The answer is given. There is no surface left to read — only cards flying
   * home in it — so it drops to the flight band and stops blocking: they travel
   * over a table that is already back to normal and land IN it rather than over
   * it.
   */
  committed?: boolean
  /**
   * How heavily the table is dimmed under it. `none` still BLOCKS: being
   * unavailable and looking unavailable are separate, and only the second is
   * the scene's to choose.
   */
  dim?: 'base' | 'heavy' | 'none'
  /** the scene's own name for this surface, for tests and for anything that
   *  looks the table over and needs to find it */
  testId?: string
  /** …and for its blocking layer, which scenes used to name themselves */
  blockTestId?: string
  /** the surface's own node, for a scene that measures it */
  surfaceRef?: Ref<HTMLDivElement>
  children: ReactNode
}

export default function TableSurface({
  committed = false,
  dim = 'base',
  testId,
  blockTestId,
  surfaceRef,
  children,
}: TableSurfaceProps) {
  return (
    <div
      className={`${styles.surface} ${committed ? styles.flight : ''}`}
      ref={surfaceRef}
      {...(testId ? { 'data-testid': testId } : {})}
    >
      {/* THE DIMMING IS THE KIT'S OVERLAY, which fades — both ways, since it is
          kept mounted and told whether it is up. Drawn by hand it snapped on and
          off, which is a question arriving and leaving without a moment in
          between (owner, 22.09). It never takes the cursor: blocking is the
          layer below's, and it has to stop the instant the answer is given
          while the dimming is still fading out. */}
      {dim !== 'none' && (
        <Overlay
          shown={!committed}
          className={`${styles.dim} ${dim === 'heavy' ? styles.heavy : ''}`}
        />
      )}
      {!committed && (
        <div
          className={styles.block}
          aria-hidden="true"
          {...(blockTestId ? { 'data-testid': blockTestId } : {})}
        />
      )}
      {children}
    </div>
  )
}
