import type { CSSProperties, ReactNode } from 'react'
import Typography from '@/primitives/Typography'
import styles from './AskLine.module.css'
import { CENTRE_TOP } from './centre'

// THE line that says what the table is waiting for — «релиз стоит одной карты»,
// «выбери карту». It belongs to the centre and hangs under it, which is why it
// lives here and reads `CENTRE_TOP`: where the centre is has one source, and the
// ask follows it instead of repeating the number.
//
// It was written twice before this — the scene's CSS and the board's fork of it,
// equal to the pixel because the second was quoted off the first, and held there
// by attention alone. The motion (appear in place, rise 14px, 260ms) is the
// component's; the copy is the caller's, since the kit carries no text.
//
// Always mounted: it fades OUT as well as in. `shown` is the phase, not the
// presence — unmounting it would make every answer end with a snap.

interface AskLineProps {
  /** is the table waiting for something right now */
  shown: boolean
  /** what it says — plain text, or a row of the text and a control beside it */
  children: ReactNode
}

export default function AskLine({ shown, children }: AskLineProps) {
  return (
    <div
      className={styles.ask}
      data-shown={shown}
      aria-hidden={!shown}
      style={{ '--centre-top': `${CENTRE_TOP}%` } as CSSProperties}
    >
      {typeof children === 'string' ? (
        <Typography base="label-sm" tk="tk-16">
          {children}
        </Typography>
      ) : (
        children
      )}
    </div>
  )
}
