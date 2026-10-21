import { createApp } from './app.ts'
import { DEFAULT_FAILURE_RATE, defaultExecutionOptions } from './execution.ts'

const PORT = Number(process.env.PORT ?? 3001)
// Override for demos, e.g. FAILURE_RATE=0.5 npm run dev:server
const FAILURE_RATE = Number(process.env.FAILURE_RATE ?? DEFAULT_FAILURE_RATE)
if (!(FAILURE_RATE >= 0 && FAILURE_RATE <= 1)) {
  throw new Error(`FAILURE_RATE must be a number between 0 and 1, got "${process.env.FAILURE_RATE}"`)
}

createApp({ execution: defaultExecutionOptions(FAILURE_RATE) }).listen(PORT, () => {
  console.log(`wand-server listening on http://localhost:${PORT} (failure rate ${FAILURE_RATE})`)
})
