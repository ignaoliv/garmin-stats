import { BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useSteps } from '../hooks/useSteps'
import { Card, CardHeader, ChartTooltip, LegendItem, Delta } from './ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const MET = '#34d399'      // reached the goal
const SHORT = '#33456b'    // fell short

export default function StepsCard({ windowDays = 30 }: { windowDays?: number }) {
  const s = useSteps(windowDays)

  // Nothing to show until fetch/steps.py has run at least once.
  if (!s.loaded || s.dias.length === 0) return null

  const pct = Math.round((s.diasCumplidos / s.ventana.length) * 100)

  return (
    <Card className="p-5">
      <CardHeader
        title="Pasos diarios"
        hint={`Últimos ${windowDays} días · objetivo de ${s.objetivo.toLocaleString('es-ES')} pasos`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="glass-sunk rounded-lg px-4 py-3">
          <div className="label mb-2">Hoy</div>
          <div className="metric-lg">
            {(s.hoy?.pasos ?? 0).toLocaleString('es-ES')}
          </div>
          <div className="text-[13px] text-ink-muted mt-1">
            {Math.round(((s.hoy?.pasos ?? 0) / s.objetivo) * 100)}% del objetivo
          </div>
        </div>
        <div className="glass-sunk rounded-lg px-4 py-3">
          <div className="label mb-2">Media diaria</div>
          <div className="metric-lg">
            {s.media.toLocaleString('es-ES')}
          </div>
          <Delta value={s.media - s.mediaPrevia} />
        </div>
        <div className="glass-sunk rounded-lg px-4 py-3">
          <div className="label mb-2">Objetivo cumplido</div>
          <div className="metric-lg">{s.diasCumplidos}</div>
          <div className="text-[13px] text-ink-muted mt-1">de {s.ventana.length} días ({pct}%)</div>
        </div>
        <div className="glass-sunk rounded-lg px-4 py-3">
          <div className="label mb-2">Tu mejor día</div>
          <div className="metric-lg">
            {(s.mejor?.pasos ?? 0).toLocaleString('es-ES')}
          </div>
          <div className="text-[13px] text-ink-muted mt-1">
            {s.mejor ? new Date(s.mejor.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={s.ventana} margin={{ top: 4, right: 74, bottom: 0, left: -6 }} barCategoryGap="16%">
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={26} />
          <YAxis
            tick={AXIS}
            tickLine={false}
            axisLine={false}
            width={52}
            tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)}k` : String(v))}
          />
          <Tooltip
            cursor={{ fill: '#ffffff08' }}
            content={
              <ChartTooltip
                formatter={(v, _n, row) =>
                  `${Number(v).toLocaleString('es-ES')} pasos · ${((Number(row?.distancia_m ?? 0)) / 1000).toFixed(1)} km`
                }
              />
            }
          />
          <ReferenceLine
            y={s.objetivo}
            stroke="#cbd5e1"
            strokeDasharray="5 4"
            strokeWidth={1.5}
            label={{ value: `objetivo ${(s.objetivo / 1000).toFixed(0)}k`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
          />
          <Bar dataKey="pasos" name="Pasos" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {s.ventana.map(d => (
              <Cell key={d.fecha} fill={d.cumplido ? MET : SHORT} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
        <LegendItem color={MET} label="Objetivo alcanzado" value={`${s.diasCumplidos} días`} />
        <LegendItem color={SHORT} label="Por debajo del objetivo" />
      </div>
    </Card>
  )
}
