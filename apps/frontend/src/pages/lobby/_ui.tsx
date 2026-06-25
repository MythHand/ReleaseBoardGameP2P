import type { ReactNode } from 'react'

// Shared styling for the lobby status flow (/lobby/:lobbyId) — the Shell, the
// card, and the back link around the join form / interstitial / status screens.
export const label = 'font-semibold text-fg/70 tracking-base'
export const ghostBtn =
  'rounded-lg border border-fg/15 px-4 py-2 font-semibold text-fg/80 tracking-base transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'
export const card = 'rounded-2xl border border-fg/10 bg-surface-1 p-6'

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-20">
      {children}
    </main>
  )
}
