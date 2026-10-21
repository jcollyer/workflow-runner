import { z } from 'zod'

export const HealthResponse = z.object({
  ok: z.literal(true),
  service: z.literal('wand-server'),
})
export type HealthResponse = z.infer<typeof HealthResponse>
