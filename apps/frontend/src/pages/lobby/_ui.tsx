import type { ReactNode } from 'react'

// Shared throwaway-prototype styling for the lobby screens. Not from @release/ui
// by design (the polished Lobby is reimplemented separately); kept in one place
// so the flow, session view, and both forms stay visually consistent.
export const field = 'flex flex-col gap-1.5 text-sm'
export const label = 'font-semibold text-fg/70 tracking-base'
export const input =
  'rounded-lg border border-fg/15 bg-surface-1 px-3 py-2 text-fg outline-none focus:border-brand-green'
export const primaryBtn =
  'rounded-lg bg-brand-green px-5 py-2.5 font-semibold text-bg tracking-base transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40'
export const ghostBtn =
  'rounded-lg border border-fg/15 px-4 py-2 font-semibold text-fg/80 tracking-base transition-colors hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-40'
export const dangerBtn =
  'rounded-lg border border-red-500/30 px-4 py-2 font-semibold text-red-400 tracking-base transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-40'
export const card = 'rounded-2xl border border-fg/10 bg-surface-1 p-6'

export const MAX_PLAYER_OPTIONS = [2, 3, 4, 5, 6]

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-screen max-w-xl flex-col justify-center gap-4 px-6 py-20">
      {children}
    </main>
  )
}
