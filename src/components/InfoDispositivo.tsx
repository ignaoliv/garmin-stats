import { useEffect, useState } from 'react'
import Icon from './Icon'
import { createPortal } from 'react-dom'
import MetricasDisponibles from './MetricasDisponibles'

/**
 * Reference sheet for what this device measures, reachable from the rail.
 *
 * It answers a question you ask once — "why is there no HRV here?" — so it does
 * not belong in the daily scroll of a page. In the rail it stays findable
 * without taking room from the data.
 */
export default function InfoDispositivo() {
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    if (!abierto) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setAbierto(false)
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [abierto])

  return (
    <>
      <button
        onClick={() => setAbierto(true)}
        title="Qué mide tu dispositivo"
        aria-label="Qué mide tu dispositivo"
        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors
                   justify-center lg:justify-start text-ink-muted hover:text-ink-secondary hover:bg-white/[0.05]"
      >
        <Icon name="info" size={17} />
        <span className="hidden lg:inline">Qué mide tu reloj</span>
      </button>

      {abierto && createPortal(
        <div
          className="fixed inset-0 z-[1000] bg-surface-scrim/85 backdrop-blur-sm fade-in
                     flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
          onClick={() => setAbierto(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Qué mide tu dispositivo"
        >
          <div className="w-full max-w-[680px] my-auto modal-in" onClick={e => e.stopPropagation()}>
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setAbierto(false)}
                className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition-colors"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <MetricasDisponibles />
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
