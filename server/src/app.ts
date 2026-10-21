import express from 'express'
import type { HealthResponse } from '@wand/shared'

export function createApp() {
  const app = express()
  app.use(express.json())

  app.get('/api/health', (_req, res) => {
    const body: HealthResponse = { ok: true, service: 'wand-server' }
    res.json(body)
  })

  return app
}
