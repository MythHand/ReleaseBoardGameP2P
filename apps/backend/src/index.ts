import { buildServer } from './server'

const PORT = Number(process.env.PORT ?? 3001)

const start = async () => {
  const app = await buildServer()
  try {
    await app.listen({ port: PORT, host: '0.0.0.0' })
  } catch (err) {
    app.log.error(err)
    process.exit(1)
  }
}

void start()
