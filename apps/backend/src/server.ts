import websocket from '@fastify/websocket'
import Fastify, { type FastifyInstance } from 'fastify'
import { createSession, getSession, joinSession } from './sessions'
import { joinRoom, leaveRoom, relay } from './signaling'

export async function buildServer(): Promise<FastifyInstance> {
  const app = Fastify({ logger: true })
  await app.register(websocket)

  app.get('/healthz', async () => ({ status: 'ok' }))

  app.post('/sessions', async () => {
    const s = createSession()
    return { id: s.id, code: s.code }
  })

  app.post<{ Params: { id: string } }>('/sessions/:id/join', async (req, reply) => {
    const session = getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'session not found' })
    const result = joinSession(session.code)
    if (!result) return reply.code(404).send({ error: 'session not found' })
    return { sessionId: result.session.id, peerId: result.peerId }
  })

  app.get<{ Params: { id: string } }>('/sessions/:id', async (req, reply) => {
    const session = getSession(req.params.id)
    if (!session) return reply.code(404).send({ error: 'session not found' })
    return { id: session.id, code: session.code, peers: session.peers.length }
  })

  app.get<{ Params: { id: string } }>(
    '/sessions/:id/signal',
    { websocket: true },
    (socket, req) => {
      const { id } = req.params
      if (!getSession(id)) {
        socket.close(1008, 'unknown session')
        return
      }
      joinRoom(id, socket)
      socket.on('message', (raw: Buffer) => relay(id, socket, raw.toString()))
      socket.on('close', () => leaveRoom(id, socket))
    },
  )

  return app
}
