import { useEffect, useState } from 'react'
import { Card, CardHeader } from './ui'
import { evaluarMetricas, type Evaluada } from '../utils/metricas'

const ESTADO = {
  disponible:    { color: 'var(--color-state-good)',    label: 'Registrando' },
  parcial:       { color: 'var(--color-state-warning)', label: 'Parcial' },
  'sin-registro':{ color: 'var(--color-ink-faint)',     label: 'Sin registro' },
} as const

/**
 * What this device measures, and what it does not.
 *
 * The absent rows are the reason this exists. A metric that is simply missing
 * from a dashboard reads as one that does not matter; listed with its reason,
 * it reads as a known gap in the hardware — and the row is already wired, so a
 * device that reports it starts filling this in with no code change.
 */
export default function MetricasDisponibles() {
  const [metricas, setMetricas] = useState<Evaluada[] | null>(null)

  useEffect(() => {
    const leer = (u: string, k: string) =>
      fetch(u)
        .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
        .then(d => (d?.[k] ?? []) as Record<string, unknown>[])
        .catch(() => [])

    Promise.all([leer('/data/sleep.json', 'noches'), leer('/data/wellness.json', 'dias')])
      .then(([noches, dias]) => setMetricas(evaluarMetricas(noches, dias)))
  }, [])

  if (!metricas) return null
  const ausentes = metricas.filter(m => m.estado === 'sin-registro')

  return (
    <Card className="p-5">
      <CardHeader
        title="Qué mide tu dispositivo"
        hint="Detectado de los datos, no de la marca: si cambiás de reloj, esta lista se actualiza sola"
      />

      <div className="space-y-px">
        {metricas.map(m => {
          const e = ESTADO[m.estado]
          return (
            <div key={m.clave} className="flex items-start gap-3 py-2.5 border-b border-white/[0.05] last:border-0">
              <span className="w-1.5 h-1.5 rounded-full shrink-0 mt-2" style={{ background: e.color }} />
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline justify-between gap-3 flex-wrap">
                  <span className={`text-[14px] ${m.estado === 'sin-registro' ? 'text-ink-muted' : 'text-ink-primary'}`}>
                    {m.nombre}
                  </span>
                  <span className="text-[12px] tabular-nums shrink-0" style={{ color: e.color }}>
                    {m.estado === 'sin-registro' ? e.label : `${m.conDato} de ${m.total}`}
                  </span>
                </div>
                <p className="label-plain mt-0.5">{m.descripcion}</p>
                {m.estado === 'sin-registro' && m.motivoAusencia && (
                  <p className="text-[12.5px] text-ink-faint mt-1 leading-relaxed">{m.motivoAusencia}</p>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {ausentes.length > 0 && (
        <p className="label-plain mt-4 pt-3 border-t border-white/[0.06] leading-relaxed">
          Las {ausentes.length} métricas sin registro ya están cableadas: si algún día usás un
          dispositivo que las reporte, aparecen solas al sincronizar.
        </p>
      )}
    </Card>
  )
}
