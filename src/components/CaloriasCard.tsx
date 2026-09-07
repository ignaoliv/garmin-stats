import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useCalorias } from '../hooks/useCalorias'
import { Card, CardHeader, ChartTooltip, Delta, Insight } from './ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'

/**
 * Calorías del día: cuánto gastó el cuerpo en total.
 *
 * El total incluye el metabolismo basal, que es la mayor parte y casi no varía
 * —ronda las 2.300 kcal—, así que mirar sólo el total esconde el movimiento.
 * Por eso la barra separa la parte activa: es la única que responde a lo que
 * hiciste ese día.
 */
export default function CaloriasCard() {
  const c = useCalorias()
  if (!c.cargado || c.media === null) return null

  const basal = c.media !== null && c.activasMedia !== null ? c.media - c.activasMedia : null
  const parcial = c.cobertura.conDato < c.cobertura.dias

  return (
    <Card className="p-5">
      <CardHeader title="Calorías" hint="Gasto diario · últimos 30 días" />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-4">
        <div>
          <div className="label mb-1">Media diaria</div>
          <div className="metric-lg">
            {c.media.toLocaleString('es-ES')}<span className="metric-unit">kcal</span>
          </div>
          {c.mediaPrevia !== null && <Delta value={c.media - c.mediaPrevia} unit=" kcal" />}
        </div>
        {c.activasMedia !== null && (
          <div>
            <div className="label mb-1">De movimiento</div>
            <div className="metric">{c.activasMedia.toLocaleString('es-ES')}</div>
            {basal !== null && (
              <div className="label-plain mt-0.5">{basal.toLocaleString('es-ES')} en reposo</div>
            )}
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={150}>
        <ComposedChart data={c.serie} margin={{ top: 4, right: 8, bottom: 0, left: -6 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={34} />
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46}
            tickFormatter={v => `${Math.round(v / 100) / 10}k`} />
          <Tooltip
            cursor={{ fill: '#ffffff08' }}
            content={<ChartTooltip
              formatter={(v, n) => `${Number(v).toLocaleString('es-ES')} kcal${
                n === 'De movimiento' ? ' de movimiento' : ''}`}
            />}
          />
          {c.media !== null && (
            <ReferenceLine y={c.media} stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: `media ${c.media.toLocaleString('es-ES')}`, position: 'right',
                       fill: '#cbd5e1', fontSize: 11, dx: -6 }} />
          )}
          <Bar dataKey="total" name="Total del día" fill="var(--color-sport-walking)"
            fillOpacity={0.28} radius={[3, 3, 0, 0]}
            isAnimationActive animationDuration={650} animationEasing="ease-out" />
          {/* La parte activa es la que se mueve; el total es su telón de fondo. */}
          <Line type="monotone" dataKey="activas" name="De movimiento"
            stroke="var(--color-sport-walking)" strokeWidth={2.5} dot={false} connectNulls
            isAnimationActive animationDuration={650} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-4 h-2.5 rounded-[3px]" style={{ background: 'var(--color-sport-walking)', opacity: 0.35 }} />
          Total del día
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-4 h-[2.5px] rounded-full" style={{ background: 'var(--color-sport-walking)' }} />
          De movimiento
        </span>
      </div>

      {parcial && (
        <div className="mt-3">
          <Insight tone="neutral">
            {c.cobertura.conDato} de los últimos {c.cobertura.dias} días tienen medición: los
            demás son días sin el reloj puesto y quedan fuera de la media.
          </Insight>
        </div>
      )}
    </Card>
  )
}
