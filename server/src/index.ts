import { createApp } from './app.ts'

const PORT = Number(process.env.PORT ?? 3001)

createApp().listen(PORT, () => {
  console.log(`wand-server listening on http://localhost:${PORT}`)
})
