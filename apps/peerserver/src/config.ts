export interface Config {
  port: number
  peerPath: string
  peerKey: string
}

export function parseConfig(env: Record<string, string | undefined>): Config {
  const rawPort = env.PORT ?? '9000'
  const port = Number(rawPort)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid PORT: "${rawPort}"`)
  }
  return {
    port,
    peerPath: env.PEER_PATH ?? '/',
    peerKey: env.PEER_KEY ?? 'peerjs',
  }
}
