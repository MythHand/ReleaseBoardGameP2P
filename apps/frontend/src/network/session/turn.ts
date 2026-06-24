export function nextTurn(args: {
  seating: string[]
  current: string
  eliminated?: string[]
}): string {
  const eliminated = new Set(args.eliminated ?? [])
  const n = args.seating.length
  const start = args.seating.indexOf(args.current)
  for (let step = 1; step <= n; step += 1) {
    const candidate = args.seating[(start + step) % n]
    if (!eliminated.has(candidate)) return candidate
  }
  throw new Error('No eligible player remains for the next turn')
}
