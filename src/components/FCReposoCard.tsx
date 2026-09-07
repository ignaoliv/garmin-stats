import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useDescanso } from '../hooks/useDescanso'
import { Card, CardHeader, ChartTooltip } from './ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const FC = 'var(--color-metric-fc)'

/**
 * La frecuencia cardíaca en reposo, con su progresión.
 *
 * Vive en su propia tarjeta y no dentro de Descanso: con el gráfico adentro,
 * aquella quedaba al doble de alto que la de al lado y dejaba un hueco enorme
 * en la fila.
 */
export default function FCReposoCard() {
  const d = useDescanso()
  if (!d.cargado || d.fcReposo === null) return null

  const hayCurva = d.serieFC.some(p => p.media7 !== null)
  const delta = d.fcReposoPrevia !== null ? d.fcReposo - d.fcReposoPrevia : null

  return (
    <Card className="p-5">
      <CardHeader title="FC en reposo" hint="Últimos 90 días · menos pulsaciones es mejor" />

      <div className="flex items-end gap-4 mb-1">
        <span className="metric-lg" style={{ color: FC }}>
          {d.fcReposo.toFixed(0)}<span className="metric-unit">ppm</span>
        </span>
        {delta !== null && (
          <span className="text-[13px] mb-1.5" style={{ color: delta <= 0 ? 'var(--color-state-good)' : 'var(--color-state-warning)' }}>
            {delta <= 0 ? '▼' : '▲'} {Math.abs(delta).toFixed(0)} en dos semanas
          </span>
        )}
      </div>
      <p className="label-plain mb-3">
        {d.fcReposoMedia !== null && `Tu media de los 90 días es ${d.fcReposoMedia.toFixed(0)}.`}
      </p>

      {hayCurva && (
        <>
          <ResponsiveContainer width="100%" height={168}>
            <AreaChart data={d.serieFC} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gFCsolo" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e9aad" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#1e9aad" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
              {/* Sin cero forzado: entre 35 y 60 ppm el cero aplasta la curva. */}
              <YAxis domain={['dataMin - 3', 'dataMax + 3']} tick={AXIS} tickLine={false}
                axisLine={false} width={40} allowDecimals={false} />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={<ChartTooltip
                  formatter={(v, n) => `${Number(v).toFixed(n === 'Media de 7 días' ? 1 : 0)} ppm${
                    n === 'Media de 7 días' ? ' de media' : ''}`}
                />}
              />
              {d.fcReposoMedia !== null && (
                <ReferenceLine y={d.fcReposoMedia} stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5}
                  label={{ value: `media ${d.fcReposoMedia.toFixed(0)}`, position: 'right',
                           fill: '#cbd5e1', fontSize: 11, dx: -6 }} />
              )}
              {/* El diario es el ruido y se queda como relleno; la progresión es
                  una sola línea. */}
              <Area type="monotone" dataKey="fc" name="FC del día" stroke="#1e9aad"
                strokeOpacity={0.18} strokeWidth={1} fill="url(#gFCsolo)" connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
              <Line type="monotone" dataKey="media7" name="Media de 7 días" stroke={FC}
                strokeWidth={2.5} dot={false} connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-[2.5px] rounded-full" style={{ background: FC }} />
              Media de 7 días
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-2.5 rounded-[3px]" style={{ background: FC, opacity: 0.22 }} />
              Lectura de cada día
            </span>
          </div>
        </>
      )}
    </Card>
  )
}
