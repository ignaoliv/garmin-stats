import { useEffect, useState } from 'react'
import Icon from './Icon'

/**
 * Waiting state for anything the model generates.
 *
 * Deliberately does NOT fake a progress bar. There are only two real phases —
 * assembling the digest, which is instant, and the model call, which is all of
 * the wait — and the API reports nothing in between. A bar creeping to 90% and
 * stalling is worse than an honest elapsed counter.
 *
 * The skeleton has the shape of what is coming, so the wait reads as "this is
 * being written" rather than "this is broken".
 */
export default function AIProgress({
  titulo = 'Analizando tus datos',
  detalle,
  esperaTipica = 40,
  lineas = 3,
}: {
  titulo?: string
  detalle?: string
  /** Rough seconds this usually takes, used to set expectations, not to fake a bar. */
  esperaTipica?: number
  lineas?: number
}) {
  const [segundos, setSegundos] = useState(0)

  useEffect(() => {
    const id = setInterval(() => setSegundos(s => s + 1), 1000)
    return () => clearInterval(id)
  }, [])

  const tarda = segundos > esperaTipica * 1.5

  return (
    <div className="rounded-xl border border-white/[0.07] p-5" aria-live="polite" aria-busy="true">
      <div className="flex items-center gap-3 mb-4">
        <span className="relative grid place-items-center w-9 h-9 rounded-full shrink-0"
          style={{ background: 'color-mix(in oklab, var(--color-accent) 16%, transparent)' }}>
          <span className="pulse-dot text-accent"><Icon name="cerebro" size={18} /></span>
        </span>
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink-primary">{titulo}</p>
          <p className="label-plain mt-0.5 tabular-nums">
            {segundos}s
            {detalle && <> · {detalle}</>}
          </p>
        </div>
      </div>

      <div className="space-y-2.5">
        {Array.from({ length: lineas }).map((_, i) => (
          <div key={i} className="shimmer rounded h-3"
            style={{ width: `${[100, 92, 74, 88, 66][i % 5]}%`, animationDelay: `${i * 140}ms` }} />
        ))}
      </div>

      {tarda && (
        <p className="label-plain mt-4">
          Está tardando más de lo habitual. Suele resolverse solo; si falla, se conserva
          lo anterior y podés reintentar.
        </p>
      )}
    </div>
  )
}
