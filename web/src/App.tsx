import { useEffect, useState } from 'react'
import { HealthResponse } from '@wand/shared'

type ServerStatus = 'checking' | 'connected' | 'unreachable'

// M0 placeholder shell: proves web → Vite proxy → server → shared schema wiring.
// Replaced by the canvas editor in M2.
function App() {
  const [status, setStatus] = useState<ServerStatus>('checking')

  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/health', { signal: controller.signal })
      .then((res) => res.json())
      .then((body) => setStatus(HealthResponse.safeParse(body).success ? 'connected' : 'unreachable'))
      .catch(() => {
        if (!controller.signal.aborted) setStatus('unreachable')
      })
    return () => controller.abort()
  }, [])

  return (
    <main>
      <h1>Workflow Studio</h1>
      <p data-status={status}>Server: {status}</p>
    </main>
  )
}

export default App
