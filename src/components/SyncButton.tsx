import { useEffect, useState } from 'react'
import Icon from './Icon'

type Estado = 'idle' | 'sincronizando' | 'ok' | 'error'

/**
 * Runs the full sync from the interface.
 *
 * It is deliberately loud about taking a while: the script walks every
 * activity and Garmin rate-limits the account, so a spinner with no sense of
 * duration invites a second click that would only make things worse. The
 * elapsed counter is the honest version of a progress bar we cannot draw.
 */
export default function SyncButton({ compacto = false }: { compacto?: boolean }) {
  const [estado, setEstado] = useState<Estado>('idle')
  const [segundos, setSegundos] = useState(0)
  const [mensaje, setMensaje] = useState('')

  useEffect(() => {
    if (estado !== 'sincronizando') return
    const id = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [estado])

  const sincronizar = async () => {
    if (estado === 'sincronizando') return
    setEstado('sincronizando'); setSegundos(0); setMensaje('')
    try {
      const res = await fetch('/api/sync')
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`)
      setEstado('ok')
      setMensaje('Datos actualizados')
      // Everything on screen reads from the JSON files the sync just rewrote,
      // and those are fetched by many independent components — a reload is the
      // honest way to show the new numbers everywhere at once.
      setTimeout(() => window.location.reload(), 900)
    } catch (e) {
      setEstado('error')
      setMensaje((e as Error).message.includes('429') || (e as Error).message.includes('403')
        ? 'Garmin está limitando la cuenta. Probá en unos minutos.'
        : (e as Error).message)
    }
  }

  const mmss = `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, '0')}`

  return (
    <div>
      <button
        onClick={sincronizar}
        disabled={estado === 'sincronizando'}
        title="Sincronizar con Garmin"
        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors
                    justify-center lg:justify-start
                    ${estado === 'sincronizando'
                      ? 'text-ink-muted cursor-wait'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05]'}`}
      >
        <span className={estado === 'sincronizando' ? 'animate-spin' : ''}>
          <Icon name="sincronizar" size={17} />
        </span>
        {!compacto && (
          <span className="hidden lg:inline">
            {estado === 'sincronizando' ? `Sincronizando ${mmss}` : 'Sincronizar'}
          </span>
        )}
      </button>

      {mensaje && (
        <p
          className="hidden lg:block text-[12px] mt-1.5 px-3 leading-relaxed"
          style={{ color: estado === 'error' ? 'var(--color-state-warning)' : 'var(--color-state-good)' }}
        >
          {mensaje}
        </p>
      )}

      {estado === 'sincronizando' && (
        <p className="hidden lg:block text-[12px] text-ink-faint mt-1.5 px-3 leading-relaxed">
          Recorre todas las actividades y baja plan, pasos, sueño y recuperación.
          Puede tardar varios minutos.
        </p>
      )}
    </div>
  )
}
