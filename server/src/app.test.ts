import type { AddressInfo } from 'node:net'
import type { Server } from 'node:http'
import { afterAll, beforeAll, expect, test } from 'vitest'
import { HealthResponse } from '@wand/shared'
import { createApp } from './app.ts'

let server: Server
let baseUrl: string

beforeAll(async () => {
  server = createApp().listen(0)
  await new Promise((resolve) => server.once('listening', resolve))
  baseUrl = `http://localhost:${(server.address() as AddressInfo).port}`
})

afterAll(() => {
  server.close()
})

test('GET /api/health returns a body matching the shared schema', async () => {
  const res = await fetch(`${baseUrl}/api/health`)
  expect(res.status).toBe(200)
  expect(HealthResponse.safeParse(await res.json()).success).toBe(true)
})
