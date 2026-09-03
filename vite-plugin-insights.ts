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

  const runArgs = (script: string, args: string[], timeout = 180_000): Promise<string> =>
    new Promise((ok, fail) => {
      const proc = spawn('python3', [resolve(root, script), ...args], { cwd: root, timeout })
      let out = '', err = ''
      proc.stdout.on('data', d => (out += d))
      proc.stderr.on('data', d => (err += d))
      proc.on('close', code => (code === 0 ? ok(out) : fail(new Error(err || `exit ${code}`))))
      proc.on('error', fail)
    })

  const runWithInput = (script: string, input: string): Promise<string> =>
    new Promise((ok, fail) => {
      const proc = spawn('python3', [resolve(root, script), '--from-stdin'], {
        cwd: root,
        timeout: 120_000,
      })
      let out = '', err = ''
      proc.stdout.on('data', d => (out += d))
      proc.stderr.on('data', d => (err += d))
      proc.on('close', code => (code === 0 ? ok(out) : fail(new Error(err || `exit ${code}`))))
      proc.on('error', fail)
      proc.stdin.write(input)
      proc.stdin.end()
    })

  return {
    name: 'garmin-activity-insights',
    configureServer(server) {
      // Full sync: activities, plan, steps, sleep, wellness, then the local
      // enrichment pass. Generous timeout because it walks every activity and
      // Garmin is rate limited, so it cannot be hurried.
      server.middlewares.use('/api/sync', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        try {
          if (!inFlight.has('__sync__')) {
            inFlight.set('__sync__', runArgs('fetch/sync.py', [], 20 * 60_000)
              .finally(() => inFlight.delete('__sync__')))
          }
          const salida = await inFlight.get('__sync__')!
          // The script is chatty; the last lines are what says how it went.
          const lineas = salida.trim().split('\n').filter(l => !l.includes('already cached'))
          res.end(JSON.stringify({ ok: true, resumen: lineas.slice(-6) }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: (e as Error).message.slice(0, 400) }))
        }
      })

      // Daily refresh of the dashboard analysis. Reads local data and calls the
      // model; writes nothing to Garmin.
      server.middlewares.use('/api/insights', async (_req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        try {
          if (!inFlight.has('__insights__')) {
            inFlight.set('__insights__', runArgs('fetch/insights.py', ['--json'])
              .finally(() => inFlight.delete('__insights__')))
          }
          const body = await inFlight.get('__insights__')!
          res.end(body.trim() || JSON.stringify({ error: 'sin respuesta' }))
        } catch (e) {
          res.statusCode = 500
          res.end(JSON.stringify({ error: (e as Error).message.slice(0, 400) }))
        }
      })

      // Plan generation only reads local data and calls the model; no writes.
      server.middlewares.use('/api/plan-ai', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'usa POST' }))
          return
        }
        let body = ''
        req.on('data', c => (body += c))
        req.on('end', async () => {
          try {
            const out = await runWithInput('fetch/plan_ai.py', body)
            res.end(out.trim() || JSON.stringify({ error: 'sin respuesta' }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: (e as Error).message.slice(0, 400) }))
          }
        })
      })

      // Creating a workout writes to the user's Garmin account, so it runs here
      // in Node with the credentials from .env rather than from the browser.
      server.middlewares.use('/api/strength-workout', async (req, res) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8')
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end(JSON.stringify({ error: 'usa POST' }))
          return
        }
        let body = ''
        req.on('data', c => (body += c))
        req.on('end', async () => {
          try {
            const out = await runWithInput('fetch/strength_workout.py', body)
            res.end(out.trim() || JSON.stringify({ error: 'sin respuesta' }))
          } catch (e) {
            res.statusCode = 500
            res.end(JSON.stringify({ error: (e as Error).message.slice(0, 400) }))
          }
        })
      })

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
