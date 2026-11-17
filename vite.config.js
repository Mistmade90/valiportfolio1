import { defineConfig } from 'vite'
import { handle } from './server/api.js'

export default defineConfig({
  plugins: [{ name: 'vali-api', configureServer: (s) => { s.middlewares.use('/api', (req, res) => handle(req, res)) } }],
})
