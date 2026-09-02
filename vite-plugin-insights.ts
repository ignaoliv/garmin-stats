import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Plugin } from 'vite'

/**
 * Dev-server endpoint that generates a per-activity analysis on demand.
 *
 * The Cloudflare token has to stay out of the browser bundle, so the call runs
 * here in the Node process and the page only ever sees the resulting JSON.
 * This means analyses are generated while `npm run dev` is running; a static
 * build serves whatever files were already produced.
 */
export function insightsPlugin(): Plugin {
  const root = process.cwd()
  const inFlight = new Map<string, Promise<string>>()

  const run = (id: string): Promise<string> =>
    new Promise((ok, fail) => {
      const proc = spawn('python3', [resolve(root, 'fetch/activity_insight.py'), id], {
        cwd: root,
        // 3 minutes: the model call itself is the slow part.
        timeout: 180_000,
      })
      let out = '', err = ''
      proc.stdout.on('data', d => (out += d))
      proc.stderr.on('data', d => (err += d))
      proc.on('close', code => (code === 0 ? ok(out) : fail(new Error(err || `exit ${code}`))))
      proc.on('error', fail)
    })

  return {
    name: 'garmin-activity-insights',
    configureServer(server) {
      server.middlewares.use('/api/activity-insight', async (req, res) => {
        const id = (req.url || '').replace(/^\//, '').split('?')[0]
        res.setHeader('Content-Type', 'application/json; charset=utf-8')

        if (!/^\d+$/.test(id)) {
          res.statusCode = 400
          res.end(JSON.stringify({ error: 'id de actividad inválido' }))
          return
        }

        const cached = resolve(root, 'public/data', `insight_${id}.json`)
        if (existsSync(cached)) {
          res.end(readFileSync(cached, 'utf8'))
          return
        }

        try {
          // Collapse concurrent requests for the same activity — React strict
          // mode and quick re-navigation would otherwise pay for it twice.
          if (!inFlight.has(id)) inFlight.set(id, run(id).finally(() => inFlight.delete(id)))
          const body = await inFlight.get(id)!
          res.end(body.trim() || JSON.stringify({ error: 'sin respuesta' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: (e as Error).message.slice(0, 300) }))
        }
      })
    },
  }
}
