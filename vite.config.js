import { defineConfig } from 'vite'
import { handle } from './server/api.js'

// In dev the API runs as Vite middleware (files saved to /data and /public/uploads).
// On Vercel the same handler runs from /api (files saved to Vercel Blob).
export default defineConfig({
  plugins: [{ name: 'vali-api', configureServer: (s) => { s.middlewares.use('/api', (req, res) => handle(req, res)) } }],
})
