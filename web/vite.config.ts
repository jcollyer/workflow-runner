import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

const API_TARGET = process.env.API_TARGET ?? 'http://localhost:3001'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    // Same-origin /api in the browser: no CORS, and EventSource works without extra config.
    proxy: {
      '/api': API_TARGET,
    },
  },
})
