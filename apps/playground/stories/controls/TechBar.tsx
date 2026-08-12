import type { ReactNode } from 'react'
import styles from './TechBar.module.css'

// The technical control line of a playground page — one shape for every page
// that has one. Geometry comes from TableStory, the reference page shell:
//
//   .root   flex column, 100vh, overflow hidden
//   <TechBar>            — this row, takes its own height
//   .stage  position: relative; flex: 1; min-block-size: 0; overflow: hidden
//
// The stage is the DEMO AREA: everything the scene paints over itself (a scrim,
// an overlay, a video) is `inset: 0` of the stage, never of the page. That is
// why the bar must not float — a floating bar would cut into the demo area
// without the demo knowing its height.
export default function TechBar({ children }: { children: ReactNode }) {
  return <div className={styles.bar}>{children}</div>
}
