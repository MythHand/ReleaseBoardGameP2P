export const MAX_SPECTATORS = 28

export function spectatorLimitColor(value: number) {
  if (value <= 8) return 'var(--mint)'
  if (value <= 18) return 'var(--gold)'
  return 'var(--coral)'
}
