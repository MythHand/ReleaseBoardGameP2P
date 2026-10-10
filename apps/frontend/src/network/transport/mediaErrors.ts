export function routeMediaError(
  error: { type?: string; message: string },
  dataDials: ReadonlySet<string>,
  targets: ReadonlyMap<string, (error: unknown) => void>,
): boolean {
  if (error.type !== 'peer-unavailable') return false
  for (const [peerId, fail] of targets) {
    if (error.message === `Could not connect to peer ${peerId}` && !dataDials.has(peerId)) {
      fail(error)
      return true
    }
  }
  return false
}
