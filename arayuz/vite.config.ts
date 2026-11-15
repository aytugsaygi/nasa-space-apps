import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, type Plugin } from 'vite'

/**
 * Geliştirmede backend (server/api.ts) Vite'ın içinde çalışır: tek komutla (npm run dev) arayüz ve API birlikte açılır.
 * Yayında aynı API server/index.ts ile sunulur.
 */
function vitalisApi(): Plugin {
  return {
    name: 'vitalis-api',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith('/api/')) return next()
        try {
          const api = (await server.ssrLoadModule('/server/api.ts')) as { handle: (q: typeof req, r: typeof res) => Promise<boolean> }
          if (!(await api.handle(req, res))) next()
        } catch (e) {
          next(e)
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss(), vitalisApi()],
  server: { port: 5173 },
})
