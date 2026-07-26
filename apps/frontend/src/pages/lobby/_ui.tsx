import type { ReactNode } from 'react'
import styles from './_ui.module.css'

// Shared styling for the lobby status flow (/lobby/:lobbyId) — the Shell, the
// card, and the back link around the join form / interstitial / status screens.
export const label = styles.label
export const ghostBtn = styles.ghostBtn
export const card = styles.card
export { styles }

export function Shell({ children }: { children: ReactNode }) {
  return <main className={styles.shell}>{children}</main>
}
