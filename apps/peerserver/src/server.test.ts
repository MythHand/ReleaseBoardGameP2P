import type http from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './server.js'

describe('createServer', () => {
  let server: http.Server

  afterEach(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((err) => (err ? reject(err) : resolve()))
      }),
  )

  async function listen(): Promise<number> {
    server = createServer({ port: 0, peerPath: '/', peerKey: 'peerjs' })
    await new Promise<void>((resolve) => {
      server.listen(0, resolve)
    })
    const address = server.address()
    if (address === null || typeof address === 'string') throw new Error('no port assigned')
    return address.port
  }

  it('responds ok on /health', async () => {
    const port = await listen()
    const res = await fetch(`http://127.0.0.1:${port}/health`)
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'ok' })
  })

  it('serves the PeerServer id endpoint under the mount path', async () => {
    const port = await listen()
    const res = await fetch(`http://127.0.0.1:${port}/peerjs/id`)
    expect(res.status).toBe(200)
    expect(await res.text()).not.toBe('')
  })
})
