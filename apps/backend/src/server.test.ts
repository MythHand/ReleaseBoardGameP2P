import { expect, it } from 'vitest'
import { buildServer } from './server'

it('POST /sessions then GET /sessions/:id returns the session', async () => {
  const app = await buildServer()
  const created = await app.inject({ method: 'POST', url: '/sessions' })
  expect(created.statusCode).toBe(200)
  const { id } = created.json<{ id: string; code: string }>()
  const fetched = await app.inject({ method: 'GET', url: `/sessions/${id}` })
  expect(fetched.statusCode).toBe(200)
  expect(fetched.json<{ id: string }>().id).toBe(id)
  await app.close()
})
