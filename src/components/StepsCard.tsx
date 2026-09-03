import { ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useSteps } from '../hooks/useSteps'
import { Card, CardHeader, ChartTooltip, LegendItem, Delta } from './ui'
import Ring from './Ring'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const MET = '#34d399'      // reached the goal
const SHORT = '#33456b'    // fell short

export default function StepsCard({
  windowDays = 30, compacto = false,
}: { windowDays?: number; compacto?: boolean }) {
  const s = useSteps(windowDays)

  // Nothing to show until fetch/steps.py has run at least once.
  if (!s.loaded || s.dias.length === 0) return null

  const pct = Math.round((s.diasCumplidos / s.ventana.length) * 100)
  const pctHoy = Math.round(((s.hoy?.pasos ?? 0) / s.objetivo) * 100)
  const media7 = s.ventana[s.ventana.length - 1]?.media7 ?? null

  // Compact form for the daily screen: today against the goal and the seven-day
  // habit, with the full thirty-day breakdown one click away. The alternative —
  // the whole card in both places — is the duplication this app just removed.
  if (compacto) {
    return (
      <Card className="p-5">
        <CardHeader
          title="Pasos"
          hint={`Objetivo diario de ${s.objetivo.toLocaleString('es-ES')}`}
          action={{ to: '/salud', label: 'Ver detalle →' }}
        />
        <div className="flex items-center gap-6 flex-wrap">
          <Ring
            pct={pctHoy}
            color={pctHoy >= 100 ? MET : 'var(--color-accent)'}
            size={96} grosor={9}
            etiqueta={`${pctHoy}% del objetivo de pasos de hoy`}
          >
            <div className="metric" style={{ color: pctHoy >= 100 ? MET : 'var(--color-accent)' }}>{pctHoy}%</div>
          </Ring>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-8 gap-y-4">
            <div>
              <div className="label mb-1.5">Hoy</div>
              <div className="metric-lg">{(s.hoy?.pasos ?? 0).toLocaleString('es-ES')}</div>
            </div>
            {media7 !== null && (
              <div>
                <div className="label mb-1.5">Media 7 días</div>
                <div className="metric-lg">{media7.toLocaleString('es-ES')}</div>
              </div>
            )}
            <div>
              <div className="label mb-1.5">Objetivo</div>
              <div className="metric-lg">{s.diasCumplidos}<span className="metric-unit">de {s.ventana.length} días</span></div>
            </div>
          </div>
        </div>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Pasos diarios"
        hint={`Últimos ${windowDays} días · objetivo de ${s.objetivo.toLocaleString('es-ES')} pasos`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5 items-stretch">
        {/* Progress toward a goal: the one shape that says it without a sentence. */}
        <div className="glass-sunk rounded-lg px-4 py-3 flex items-center gap-3.5">
          <Ring
            pct={pctHoy}
            color={pctHoy >= 100 ? MET : 'var(--color-accent)'}
            size={78} grosor={8}
            etiqueta={`${pctHoy}% del objetivo de pasos de hoy`}
          >
            <div className="text-[16px] font-bold tabular-nums text-ink-primary">{pctHoy}%</div>
          </Ring>
          <div className="min-w-0">
            <div className="label mb-1.5">Hoy</div>
            <div className="metric">{(s.hoy?.pasos ?? 0).toLocaleString('es-ES')}</div>
            <div className="label-plain mt-1">de {s.objetivo.toLocaleString('es-ES')}</div>
          </div>
        </div>
        <div className="glass-sunk rounded-lg px-4 py-3">
          <div className="label mb-2">Media diaria</div>
          <div className="metric-lg">
            {s.media.toLocaleString('es-ES')}
          </div>
          <Delta value={s.media - s.mediaPrevia} />
        </div>
        <div className="glass-sunk rounded-lg px-4 py-3 flex items-center gap-3.5">
          <Ring pct={pct} color={MET} size={78} grosor={8}
            etiqueta={`Objetivo cumplido el ${pct} por ciento de los días`}>
            <div className="text-[16px] font-bold tabular-nums text-ink-primary">{pct}%</div>
          </Ring>
          <div className="min-w-0">
            <div className="label mb-1.5">Objetivo</div>
            <div className="metric">{s.diasCumplidos}</div>
            <div className="label-plain mt-1">de {s.ventana.length} días</div>
          </div>
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
        <ComposedChart data={s.ventana} margin={{ top: 4, right: 74, bottom: 0, left: -6 }} barCategoryGap="16%">
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
                formatter={(v, n, row) =>
                  n === 'Media de 7 días'
                    ? `${Number(v).toLocaleString('es-ES')} pasos de media`
                    : `${Number(v).toLocaleString('es-ES')} pasos · ${((Number(row?.distancia_m ?? 0)) / 1000).toFixed(1)} km`
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
          {/* The bars are the noise; this is the habit. */}
          <Line
            type="monotone"
            dataKey="media7"
            name="Media de 7 días"
            stroke="var(--color-accent)"
            strokeWidth={2.5}
            dot={false}
            connectNulls
            isAnimationActive={false}
          />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
        <LegendItem color={MET} label="Objetivo alcanzado" value={`${s.diasCumplidos} días`} />
        <LegendItem color={SHORT} label="Por debajo del objetivo" />
        <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
          <span className="w-4 h-[2.5px] rounded inline-block bg-accent" />
          Media móvil de 7 días
        </span>
      </div>
    </Card>
  )
}
