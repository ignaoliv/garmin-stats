import { Card, CardHeader } from './ui'
import { useReadiness } from '../hooks/useReadiness'
import SinSensor from './SinSensor'

function colorDe(puntos: number) {
  if (puntos >= 75) return '#34d399'
  if (puntos >= 50) return '#fde047'
  if (puntos >= 25) return '#fb923c'
  return '#f43f5e'
}

/**
 * Preparación del día.
 *
 * Es el equivalente al Training Readiness de Garmin, escrito acá porque ese
 * número lo calcula el reloj y un Venu original no lo produce — la API
 * devuelve vacío, igual que el HRV status y el tiempo de recuperación.
 *
 * La tarjeta muestra el desglose y no sólo el número, a propósito: un 60 por
 * fatiga acumulada y un 60 por una noche mala piden cosas distintas, y el
 * número solo no las distingue.
 */
export default function ReadinessCard() {
  const r = useReadiness()
  if (!r.cargado) return null
  if (r.score === null) return (
    <SinSensor titulo="Preparación"
      necesita="Se calcula con el pulso en reposo, el estrés y la batería corporal, además de tu carga."
      nota={`Faltan datos para: ${r.faltantes.join(', ').toLowerCase()}.`} />
  )

  return (
    <Card className="p-5">
      <CardHeader
        title="Preparación"
        hint={r.hace === 0 ? 'Con los datos de hoy'
          : r.hace === 1 ? 'Con los datos de ayer'
          : `Última medición hace ${r.hace} días`}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div>
          <div className="flex items-end gap-3 mb-2">
            <span className="text-[56px] leading-none font-bold tabular-nums"
              style={{ color: r.banda.color }}>{r.score}</span>
            <span className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
              style={{ color: r.banda.color, borderColor: `${r.banda.color}66`,
                       background: `${r.banda.color}1a` }}>
              {r.banda.label}
            </span>
          </div>

          <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
            <div className="h-full rounded-full transition-[width] duration-700 ease-out"
              style={{ width: `${r.score}%`, background: r.banda.color }} />
          </div>
          <div className="flex justify-between text-[12px] text-ink-muted mb-3">
            <span>0</span><span>50</span><span>100</span>
          </div>

          <p className="text-[14px] text-ink-secondary leading-relaxed">{r.banda.texto}</p>

          {/* De dónde sale el número hay que decirlo, no dejarlo suponer:
              alguien podría compararlo con lo que muestra su reloj. */}
          <p className="label-plain mt-3">
            {r.fuente === 'garmin'
              ? 'Este es el Training Readiness que calcula tu reloj. El desglose de al lado es nuestro y sirve para ver qué lo está moviendo.'
              : 'Las franjas son las de Garmin, pero el cálculo es nuestro: tu reloj no produce el Training Readiness original.'}
          </p>
        </div>

        <div>
          <div className="label mb-1">Qué lo está moviendo</div>
          {r.piezas.map(p => {
            const color = colorDe(p.puntos)
            return (
              <div key={p.id} className="py-2.5 border-b border-white/[0.05] last:border-0">
                <div className="flex items-baseline justify-between gap-3 mb-1.5">
                  <span className="text-[14px] text-ink-primary">{p.label}</span>
                  <span className="text-[14px] font-semibold tabular-nums shrink-0" style={{ color }}>
                    {p.puntos}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${p.puntos}%`, background: color }} />
                </div>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
                  <span className="text-ink-secondary tabular-nums">{p.valor}</span>
                  <span className="text-ink-muted">meta: {p.meta}</span>
                </div>
              </div>
            )
          })}

          {r.faltantes.length > 0 && (
            <p className="label-plain mt-3">
              Sin datos para {r.faltantes.join(', ').toLowerCase()}; esas piezas quedan
              fuera del promedio en vez de contar como cero.
            </p>
          )}
        </div>
      </div>
    </Card>
  )
}
