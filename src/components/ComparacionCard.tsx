import { Card, CardHeader } from './ui'
import { useComparaciones, type Totales, type Comparacion } from '../hooks/useComparaciones'

const METRICAS: { clave: keyof Totales; label: string; unidad: string; dec: number }[] = [
  { clave: 'sesiones', label: 'Sesiones', unidad: '', dec: 0 },
  { clave: 'horas', label: 'Horas', unidad: 'h', dec: 1 },
  { clave: 'km', label: 'Distancia', unidad: 'km', dec: 1 },
  { clave: 'carga', label: 'Carga', unidad: 'TSS', dec: 0 },
]

const num = (v: number, dec: number) =>
  v.toLocaleString('es-AR', { minimumFractionDigits: dec, maximumFractionDigits: dec })

function Fila({ c }: { c: Comparacion }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2 mb-3">
        <h3 className="text-[15px] font-semibold text-ink-primary">{c.label}</h3>
        <span className="text-[13px] text-ink-muted">{c.titulo}</span>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {METRICAS.map(m => {
          const ahora = c.actual[m.clave]
          const antes = c.previo[m.clave]
          const delta = ahora - antes
          // Sin base no hay porcentaje: dividir por cero da Infinity y "▲∞%"
          // no es un hallazgo.
          const pct = antes > 0 ? Math.round((delta / antes) * 100) : null
          const sube = delta > 0
          const igual = Math.abs(delta) < (m.dec ? 0.05 : 0.5)

          return (
            <div key={m.clave} className="glass-sunk rounded-lg px-3 py-2.5">
              <div className="label mb-1">{m.label}</div>
              <div className="metric">
                {num(ahora, m.dec)}
                {m.unidad && <span className="metric-unit">{m.unidad}</span>}
              </div>
              <div className="text-[12px] mt-1 tabular-nums" style={{
                color: igual ? 'var(--color-ink-muted)'
                  : sube ? 'var(--color-state-good)' : 'var(--color-state-warning)',
              }}>
                {igual ? 'igual que antes' : (
                  <>
                    {sube ? '▲' : '▼'} {num(Math.abs(delta), m.dec)}
                    {pct !== null && <span className="text-ink-muted"> · {sube ? '+' : '−'}{Math.abs(pct)}%</span>}
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Dónde terminó el período anterior. Va como referencia y NUNCA como
          vara de comparación: contra dos días transcurridos, el total de siete
          diría que venís mal todas las semanas. */}
      <p className="label-plain mt-2.5">
        {c.clave === 'semana' ? 'La semana pasada' : 'El mes pasado'} terminó con{' '}
        {c.previoCompleto.sesiones} sesiones, {num(c.previoCompleto.horas, 1)} h y{' '}
        {num(c.previoCompleto.km, 1)} km.
        {c.transcurrido < c.total && (
          <> Te quedan {c.total - c.transcurrido} {c.total - c.transcurrido === 1 ? 'día' : 'días'}.</>
        )}
      </p>
    </div>
  )
}

/**
 * Semana contra semana y mes contra mes.
 *
 * La comparación va siempre contra el MISMO TRAMO transcurrido del período
 * anterior, no contra el período entero. Es la trampa en la que ya caímos con
 * el resumen semanal: un martes al mediodía contra un mes completo da "▼ 18
 * sesiones" todos los meses — aritméticamente cierto, deportivamente absurdo.
 *
 * El total del período anterior igual se muestra, abajo y en letra chica,
 * porque saber dónde terminó es útil. Lo que no se hace es usarlo de vara.
 */
export default function ComparacionCard() {
  const comparaciones = useComparaciones()
  if (comparaciones.every(c => c.actual.sesiones === 0 && c.previo.sesiones === 0)) return null

  return (
    <Card className="p-5">
      <CardHeader
        title="Cómo venís"
        hint="Contra el mismo tramo del período anterior, no contra el total"
      />
      <div className="space-y-6">
        {comparaciones.map(c => <Fila key={c.clave} c={c} />)}
      </div>
    </Card>
  )
}
