export function classifyLoadFailure(error: unknown, online: boolean): 'offline' | 'load' | 'application' {
  if (!online) return 'offline'
  const message = error instanceof Error ? error.message : String(error)
  return /dynamically imported module|Importing a module script failed|Unable to preload CSS|Loading.*chunk/i.test(message)
    ? 'load' : 'application'
}
