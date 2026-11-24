import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

/**
 * Local-dev only: serves /api/* using the same handler files Vercel deploys,
 * so `npm run dev` works without the Vercel CLI. Reads keys from .env.local.
 */
function localApi(env) {
  return {
    name: 'local-api',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use('/api/parse-rule', async (req, res) => {
        let body = ''
        for await (const chunk of req) body += chunk
        try { req.body = body ? JSON.parse(body) : {} } catch { req.body = {} }

        res.status = (code) => { res.statusCode = code; return res }
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
          return res
        }

        const mod = await server.ssrLoadModule('/api/parse-rule.js')
        await mod.default(req, res)
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return { plugins: [react(), localApi(env)] }
})
