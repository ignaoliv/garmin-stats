import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useEstres, duracion } from '../hooks/useEstres'
import { Card, CardHeader, ChartTooltip } from './ui'
import SinSensor from './SinSensor'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'

const ESTADO = {
  calmo:    { color: '#34d399', label: 'Calmo',    texto: 'La mayor parte del día el cuerpo estuvo en reposo.' },
  moderado: { color: '#fbbf24', label: 'Moderado', texto: 'Un día con carga mental o física por encima de lo tranquilo.' },
  alto:     { color: '#f43f5e', label: 'Alto',     texto: 'El cuerpo pasó buena parte del día activado. Mirá el sueño de esta noche.' },
} as const

/**
 * El estrés que mide el reloj, que es variabilidad cardíaca y no un estado de
 * ánimo.
 *
 * La tarjeta muestra dos cosas distintas a propósito. El número grande es el
 * promedio del día, que sirve para comparar días entre sí; la barra de abajo es
 * el reparto de las horas, que es lo que el promedio esconde. Un 25 de media
 * puede ser un día parejo o dos horas de estrés alto metidas en un día
 * tranquilo, y no son la misma cosa.
 */
export default function EstresCard() {
  const e = useEstres(90)
  if (!e.cargado) return null
  if (e.nivel === null) return (
    <SinSensor titulo="Estrés"
      necesita="Lo estima un reloj de muñeca a partir de la variabilidad del pulso."
      nota="Los ciclocomputadores no lo calculan." />
  )

  const estado = e.estado ? ESTADO[e.estado] : ESTADO.calmo
  const delta = e.media30 !== null ? e.nivel - e.media30 : null
  const hayCurva = e.serie.some(p => p.media7 !== null)

  return (
    <Card className="p-5">
      <CardHeader
        title="Estrés"
        hint="Últimos 90 días · lo estima el reloj por la variabilidad del pulso"
      />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-1">
        <div>
          <div className="label mb-1">
            {e.hace === 0 ? 'Hoy' : e.hace === 1 ? 'Ayer' : `Hace ${e.hace} días`}
          </div>
          <div className="flex items-end gap-3">
            <span className="metric-lg" style={{ color: estado.color }}>
              {e.nivel.toFixed(0)}<span className="metric-unit">/100</span>
            </span>
            <span className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
              style={{ color: estado.color, borderColor: `${estado.color}66`, background: `${estado.color}1a` }}>
              {estado.label}
            </span>
          </div>
        </div>

        {e.bateria && (
          <div>
            <div className="label mb-1">Batería corporal</div>
            <div className="metric">
              <span style={{ color: '#34d399' }}>+{e.bateria.cargada}</span>
              <span className="text-ink-muted mx-1.5">/</span>
              <span style={{ color: '#f43f5e' }}>−{e.bateria.gastada}</span>
            </div>
            <div className="label-plain mt-0.5">cargada y gastada en el día</div>
          </div>
        )}
      </div>

      <p className="label-plain mb-4">
        {estado.texto}
        {delta !== null && Math.abs(delta) >= 2 && (
          <> Tu media de 30 días es {e.media30!.toFixed(0)}, así que este día quedó{' '}
            {delta > 0 ? 'por encima' : 'por debajo'} de lo habitual.</>
        )}
      </p>

      {/* ── El reparto del día ──────────────────────────────────────────── */}
      {e.reparto.length > 0 && (
        <div className="mb-5">
          <div className="flex items-baseline justify-between mb-2">
            <span className="label">Cómo se repartió el día</span>
            <span className="text-[12px] text-ink-muted">sobre el tiempo medido</span>
          </div>

          {/* Barra apilada. El hueco de 2px entre tramos es lo que evita que dos
              colores contiguos se lean como uno solo. */}
          <div className="flex gap-[2px] h-3.5 rounded-full overflow-hidden mb-2.5">
            {e.reparto.filter(t => t.segundos > 0).map(t => (
              <div key={t.clave} style={{ width: `${t.pct}%`, background: t.color }}
                title={`${t.label}: ${duracion(t.segundos)}`} />
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
            {e.reparto.map(t => (
              <div key={t.clave} className="flex items-baseline gap-2">
                <span className="w-2.5 h-2.5 rounded-[3px] shrink-0 translate-y-[1px]"
                  style={{ background: t.color }} />
                <div className="min-w-0">
                  <div className="text-[13px] text-ink-secondary">{t.label}</div>
                  <div className="text-[13px] text-ink-primary tabular-nums">
                    {t.segundos > 0 ? duracion(t.segundos) : '—'}
                    {t.segundos > 0 && (
                      <span className="text-ink-muted"> · {Math.round(t.pct)}%</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Lo que queda afuera se dice, no se esconde: si no, la barra
              parecería cubrir las 24 horas y no las cubre. */}
          {(e.entrenando > 0 || e.sinMedir > 0) && (
            <p className="label-plain mt-3">
              Quedan fuera {e.entrenando > 0 && <>{duracion(e.entrenando)} de entrenamiento</>}
              {e.entrenando > 0 && e.sinMedir > 0 && ' y '}
              {e.sinMedir > 0 && <>{duracion(e.sinMedir)} sin medir</>}
              . Garmin descuenta el ejercicio a propósito: ahí el pulso alto no es estrés.
            </p>
          )}
        </div>
      )}

      {/* ── La progresión ──────────────────────────────────────────────── */}
      {hayCurva && (
        <>
          <ResponsiveContainer width="100%" height={168}>
            <AreaChart data={e.serie} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gEstres" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#fb923c" stopOpacity={0.26} />
                  <stop offset="100%" stopColor="#fb923c" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
              {/* Desde cero: acá el cero existe de verdad y la escala 0-100 es
                  la que le da sentido al número. */}
              <YAxis domain={[0, 'dataMax + 8']} tick={AXIS} tickLine={false}
                axisLine={false} width={34} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={<ChartTooltip
                  formatter={(v, n) => `${Number(v).toFixed(n === 'Media de 7 días' ? 1 : 0)} sobre 100${
                    n === 'Media de 7 días' ? ' de media' : ''}`}
                />}
              />
              {/* El 26 es donde Garmin deja de llamarlo calmo. */}
              <ReferenceLine y={26} stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: 'fin de calmo', position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -6 }} />
              <Area type="monotone" dataKey="nivel" name="Nivel del día" stroke="#fb923c"
                strokeOpacity={0.18} strokeWidth={1} fill="url(#gEstres)" connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
              <Line type="monotone" dataKey="media7" name="Media de 7 días" stroke="#fb923c"
                strokeWidth={2.5} dot={false} connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-[2.5px] rounded-full" style={{ background: '#fb923c' }} />
              Media de 7 días
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-2.5 rounded-[3px]" style={{ background: '#fb923c', opacity: 0.22 }} />
              Nivel de cada día
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
