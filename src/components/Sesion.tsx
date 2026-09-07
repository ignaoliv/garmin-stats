import { useEffect, useState, type ReactNode } from 'react'
import { requiereSesion } from '../lib/datos'

/**
 * La puerta del panel.
 *
 * Sólo aparece cuando la app corre contra la API — o sea, desplegada. En local
 * los datos son archivos en disco y no hay nada que custodiar, así que pedir
 * una contraseña ahí sería teatro.
 *
 * El HTML de la app es público a propósito: no contiene ningún dato. Lo que
 * está cerrado es la API, que no devuelve nada sin esta cookie.
 */
export default function Sesion({ children }: { children: ReactNode }) {
  const [estado, setEstado] = useState<'mirando' | 'adentro' | 'afuera'>(
    requiereSesion ? 'mirando' : 'adentro',
  )
  const [clave, setClave] = useState('')
  const [error, setError] = useState('')
  const [enviando, setEnviando] = useState(false)

  useEffect(() => {
    if (!requiereSesion) return
    fetch('/api/entrar')
      .then(r => r.json())
      .then(d => setEstado(d?.sesion ? 'adentro' : 'afuera'))
      .catch(() => setEstado('afuera'))
  }, [])

  if (estado === 'adentro') return <>{children}</>

  if (estado === 'mirando') {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-[15px] text-ink-secondary animate-pulse">Un segundo…</p>
      </div>
    )
  }

  const entrar = async (e: React.FormEvent) => {
    e.preventDefault()
    setEnviando(true); setError('')
    try {
      const r = await fetch('/api/entrar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: clave }),
      })
      if (r.ok) { setEstado('adentro'); return }
      const d = await r.json().catch(() => null)
      setError(d?.error ?? 'No se pudo entrar')
    } catch {
      setError('No se pudo conectar')
    } finally {
      setEnviando(false)
    }
  }

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <form onSubmit={entrar} className="glass rounded-2xl p-6 w-full max-w-[360px] panel-in">
        <h1 className="text-[20px] font-bold text-ink-primary">Garmin Stats</h1>
        <p className="label-plain mt-1.5 mb-5">Tu panel de entrenamiento</p>

        <label className="block">
          <span className="text-[13px] text-ink-muted block mb-1.5">Contraseña</span>
          <input
            type="password"
            value={clave}
            onChange={e => setClave(e.target.value)}
            autoFocus
            autoComplete="current-password"
            className="w-full px-3 py-2.5 rounded-lg bg-surface-sunk border border-surface-line
                       text-[15px] text-ink-primary focus:outline-none focus:border-accent"
          />
        </label>

        {error && (
          <p className="text-[13px] text-state-critical mt-2.5" role="alert">{error}</p>
        )}

        <button
          type="submit"
          disabled={enviando || !clave}
          className="mt-4 w-full py-2.5 rounded-xl border border-accent text-accent
                     hover:bg-accent hover:text-white text-[15px] font-semibold
                     transition-colors disabled:opacity-50"
        >
          {enviando ? 'Entrando…' : 'Entrar'}
        </button>
      </form>
    </div>
  )
}
