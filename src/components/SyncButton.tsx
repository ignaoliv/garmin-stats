import { useEffect, useState } from 'react'
import Icon from './Icon'
import { pedir } from '../lib/acciones'

type Estado = 'idle' | 'sincronizando' | 'ok' | 'error'

/**
 * Runs the full sync from the interface.
 *
 * It is deliberately loud about taking a while: the script walks every
 * activity and Garmin rate-limits the account, so a spinner with no sense of
 * duration invites a second click that would only make things worse. The
 * elapsed counter is the honest version of a progress bar we cannot draw.
 */
/**
 * Sincronizar con Garmin.
 *
 * Vive en dos lados a propósito. En el escritorio, abajo del riel lateral.
 * En el teléfono el riel no existe —`hidden lg:flex`— así que el botón se
 * repite en la cabecera del Resumen con `enLinea`, que es donde el pulgar
 * llega. Sin eso el botón estaba desplegado pero era invisible justo en el
 * dispositivo desde el que se usa la app.
 */
export default function SyncButton({ compacto = false, enLinea = false }:
  { compacto?: boolean; enLinea?: boolean }) {
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
      await pedir('/api/sincronizar')
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
        className={`flex items-center gap-2.5 rounded-lg text-[13.5px] transition-colors
                    ${enLinea
                      ? 'px-3.5 py-2 border border-surface-line bg-surface-card hover:border-surface-line-strong'
                      : 'w-full px-3 py-2 justify-center lg:justify-start'}
                    
                    ${estado === 'sincronizando'
                      ? 'text-ink-muted cursor-wait'
                      : 'text-ink-secondary hover:text-ink-primary hover:bg-white/[0.05]'}`}
      >
        <span className={estado === 'sincronizando' ? 'animate-spin' : ''}>
          <Icon name="sincronizar" size={17} />
        </span>
        {!compacto && (
          <span>
            {estado === 'sincronizando' ? `Sincronizando ${mmss}` : 'Sincronizar'}
          </span>
        )}
      </button>

      {mensaje && (
        <p
          className="text-[12px] mt-1.5 px-3 leading-relaxed"
          style={{ color: estado === 'error' ? 'var(--color-state-warning)' : 'var(--color-state-good)' }}
        >
          {mensaje}
        </p>
      )}

      {estado === 'sincronizando' && (
        <p className="text-[12px] text-ink-faint mt-1.5 px-3 leading-relaxed">
          Trae las actividades nuevas y actualiza pasos, sueño, recuperación y
          peso. Suele tardar cerca de un minuto.
        </p>
      )}
    </div>
  )
}
