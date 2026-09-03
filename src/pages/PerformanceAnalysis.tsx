import { formatDuration } from '../utils/formatters'
import {
  useAerobicEfficiency,
  useTriathlonBalance,
  useCadenceData,
  useVo2maxTrend,
  useConsistencyHeatmap,
} from '../hooks/usePerformanceData'
import { useWeeklyLoad } from '../hooks/useWeeklyLoad'
import { useActivityStore } from '../stores/activityStore'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar, ScatterChart, Scatter,
  ReferenceLine, ReferenceArea, Cell,
} from 'recharts'

const RAMP_COLOR: Record<string, string> = { ok: '#3b82f6', warn: '#eab308', high: '#ef4444' }

// ─── Section wrapper ──────────────────────────────────────────────────────────
function Section({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-surface-line rounded-xl p-5">
      <div className="mb-4">
        <div className="text-[14px] font-medium text-ink-primary">{title}</div>
        {sub && <div className="text-[13px] text-ink-muted mt-0.5">{sub}</div>}
      </div>
      {children}
    </div>
  )
}

// ─── Insight chip ─────────────────────────────────────────────────────────────
function Insight({ label, color }: { label: string; color: string }) {
  return (
    <div className="text-[13px] px-2.5 py-1 rounded-full border"
      style={{ borderColor: color + '40', background: color + '12', color }}>
      {label}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/** VO2max reference bands, low to high. One source for legend, areas and line. */
const VO2_BANDS = [
  { min: 0,  max: 48, label: 'Mejorable',  range: '<48',   color: '#f87171' },
  { min: 48, max: 55, label: 'Buena',      range: '48–54', color: '#fbbf24' },
  { min: 55, max: 60, label: 'Excelente',  range: '55–59', color: '#38bdf8' },
  { min: 60, max: 99, label: 'Elite',      range: '≥60',   color: '#34d399' },
]

const vo2Band = (v: number) => VO2_BANDS.find(b => v >= b.min && v < b.max) ?? VO2_BANDS[0]

/**
 * Hard-stop gradient stops for the line stroke.
 *
 * An SVG gradient runs top (0) to bottom (1) while the y-scale runs the other
 * way, so each band boundary maps to (max - value) / (max - min) and gets two
 * stops at the same offset to switch colour abruptly rather than blending.
 */
function vo2GradientStops([min, max]: [number, number]) {
  const at = (v: number) => `${(((max - v) / (max - min)) * 100).toFixed(2)}%`
  const stops: React.ReactElement[] = []
  const visible = VO2_BANDS.filter(b => b.max > min && b.min < max)
  visible.forEach((b, i) => {
    const top = Math.min(b.max, max)
    const bottom = Math.max(b.min, min)
    stops.push(<stop key={`${b.label}-a`} offset={at(top)} stopColor={b.color} />)
    stops.push(<stop key={`${b.label}-b`} offset={at(bottom)} stopColor={b.color} />)
    void i
  })
  return stops
}

export default function PerformanceAnalysis() {
  const activities = useActivityStore(s => s.activities)

  const { data: efData, trendPct: efTrend } = useAerobicEfficiency()
  const balance = useTriathlonBalance(21)
  const cadenceData = useCadenceData()
  const { points: vo2Points, current: currentVo2 } = useVo2maxTrend()
  const weeklyLoad = useWeeklyLoad(16)
  const heatmap = useConsistencyHeatmap(28)

  const avgWeeklyTSS = weeklyLoad.length
    ? Math.round(weeklyLoad.slice(-8).reduce((s, w) => s + w.tss, 0) / Math.min(weeklyLoad.length, 8))
    : 0

  // An explicit domain is what lets the gradient stops line up with the bands;
  // 'auto' would leave the pixel mapping unknown. Padded so the line never
  // touches the frame.
  const vo2Values = vo2Points.map(p => p.vo2max).filter((v): v is number => typeof v === 'number')
  const vo2Domain: [number, number] = vo2Values.length
    ? [Math.floor(Math.min(...vo2Values) - 2), Math.ceil(Math.max(...vo2Values) + 2)]
    : [30, 60]

  // Same band table as the chart, so the header label and the colour agree.
  const vo2Label = currentVo2 ? vo2Band(currentVo2).label : null

  const insights = deriveInsights({ balance, efTrend, weeklyLoad, heatmap, cadenceData })

  if (activities.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-ink-muted text-[14px]">
        Sin datos. Ejecuta el script de sync primero.
      </div>
    )
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto page-in">
      <h1 className="text-xl font-bold text-ink-primary mb-1">Análisis de Rendimiento</h1>
      <p className="text-[14px] text-ink-muted mb-5">Forma física, puntos de mejora y estado actual</p>

      {insights.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {insights.map((ins, i) => <Insight key={i} label={ins.text} color={ins.color} />)}
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">

        {/* 1 · Aerobic Efficiency */}
        <Section
          title="Eficiencia Aeróbica"
          sub={efTrend != null
            ? `Running: ${efTrend > 0 ? '+' : ''}${efTrend}% en 12 meses`
            : 'Velocidad / FC — sube = mejor base aeróbica'}
        >
          {efData.some(d => d.run || d.bike) ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={efData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#28334a" />
                <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} width={36} />
                <Tooltip
                  contentStyle={{ background: '#0b1425', border: '1px solid #3a4767', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown, n: unknown) => [Number(v).toFixed(2), String(n)]}
                />
                <Line type="monotone" dataKey="run"  name="Running EF" stroke="#ef4444" dot={{ r: 3 }} strokeWidth={2} connectNulls />
                <Line type="monotone" dataKey="bike" name="Cycling EF" stroke="#f97316" dot={{ r: 3 }} strokeWidth={2} connectNulls />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="Sin datos suficientes" />
          )}
          <p className="text-[13px] text-ink-muted mt-2">Running: km/h ÷ bpm × 100. Cycling: W ÷ bpm. Sube = mejoras.</p>
        </Section>

        {/* 2 · Triathlon Balance */}
        <Section
          title="Balance Triatleta (últimas 3 semanas)"
          sub="Real vs ideal olímpico (Swim 15% / Bike 50% / Run 35%)"
        >
          <div className="space-y-4 py-2">
            {balance.map(row => {
              const color = Math.abs(row.gap) < 8 ? '#22c55e' : Math.abs(row.gap) < 15 ? '#eab308' : '#ef4444'
              return (
                <div key={row.sport}>
                  <div className="flex justify-between text-[13px] mb-1">
                    <span className="text-ink-secondary">{row.emoji} {row.sport}</span>
                    <span style={{ color }}>
                      {row.actual}% real · {row.ideal}% ideal · {row.gap > 0 ? '+' : ''}{row.gap}pp · {row.hours}h
                    </span>
                  </div>
                  <div className="relative h-2.5 bg-surface-hover rounded-full">
                    <div className="h-2.5 rounded-full" style={{ width: `${Math.min(row.actual, 100)}%`, background: color }} />
                    <div className="absolute top-0 h-2.5 w-0.5 bg-ink-secondary" style={{ left: `${row.ideal}%` }} />
                  </div>
                </div>
              )
            })}
          </div>
          <p className="text-[13px] text-ink-muted mt-3">Línea blanca = objetivo ideal. Rojo = desbalance importante.</p>
        </Section>

        {/* 3 · Cadence vs Speed */}
        <Section
          title="Cadencia vs Velocidad (Running)"
          sub="Zona verde = cadencia óptima (170–180 spm)"
        >
          {cadenceData.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <ScatterChart margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#28334a" />
                <XAxis dataKey="cadencia" name="Cadencia" unit=" spm" tick={{ fill: '#94a3b8', fontSize: 12 }} type="number" domain={['auto', 'auto']} />
                <YAxis dataKey="velocidad" name="Velocidad" unit=" km/h" tick={{ fill: '#94a3b8', fontSize: 12 }} width={42} />
                <Tooltip
                  contentStyle={{ background: '#0b1425', border: '1px solid #3a4767', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown, n: unknown) => [String(v), String(n)]}
                />
                <ReferenceArea x1={170} x2={180} fill="#22c55e" fillOpacity={0.08} />
                <ReferenceLine x={170} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.5} />
                <ReferenceLine x={180} stroke="#22c55e" strokeDasharray="4 2" strokeOpacity={0.5} />
                <Scatter data={cadenceData} fill="#ef4444">
                  {cadenceData.map((entry, i) => (
                    <Cell key={i} fill={entry.optimal ? '#22c55e' : '#ef4444'} fillOpacity={0.7} />
                  ))}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="Sin datos de cadencia" />
          )}
        </Section>

        {/* 4 · VO2max Trend */}
        {/* Bands are the reference the legend promises; the line is coloured by
            the band it sits in, via a gradient whose stops are pinned to the
            y-scale, instead of a flat hue that means nothing. */}
        <Section
          title="Tendencia VO2max"
          sub={currentVo2 ? `Actual: ${currentVo2.toFixed(1)} ml/kg/min — ${vo2Label}` : 'Estimado por Garmin'}
        >
          {vo2Points.length > 1 ? (
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={vo2Points} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="vo2Bands" x1="0" y1="0" x2="0" y2="1">
                    {vo2GradientStops(vo2Domain)}
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#28334a" />
                <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} interval={Math.floor(vo2Points.length / 6)} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} width={38} domain={vo2Domain} allowDataOverflow />
                <Tooltip
                  contentStyle={{ background: '#0b1425', border: '1px solid #3a4767', borderRadius: 8, fontSize: 12 }}
                  formatter={(v: unknown) => [`${Number(v).toFixed(1)} — ${vo2Band(Number(v)).label}`, 'VO2max']}
                />
                {/* No background band here on purpose: every recorded value sits
                    inside a single band, so a wash across the whole plot would
                    say nothing. The band is carried by the line's own colour. */}
                <Line
                  type="monotone"
                  dataKey="vo2max"
                  stroke="url(#vo2Bands)"
                  strokeWidth={2.5}
                  isAnimationActive={false}
                  dot={(props: { cx?: number; cy?: number; payload?: { vo2max?: number }; index?: number }) => (
                    <circle
                      key={props.index}
                      cx={props.cx}
                      cy={props.cy}
                      r={3}
                      fill={vo2Band(props.payload?.vo2max ?? 0).color}
                      stroke="#101826"
                      strokeWidth={1}
                    />
                  )}
                />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <Empty label={vo2Points.length === 0 ? 'Sin datos VO2max' : 'Pocas mediciones aún'} />
          )}
          <div className="flex gap-3 mt-2 flex-wrap">
            {VO2_BANDS.slice().reverse().map(b => (
              <span key={b.label} className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
                <span className="w-3 h-3 rounded-[3px] inline-block" style={{ background: b.color }} />
                {b.range} {b.label}
              </span>
            ))}
          </div>
        </Section>

        {/* 5 · Weekly TSS Load */}
        <Section
          title="Carga Semanal TSS"
          sub={`Media últimas 8 semanas: ${avgWeeklyTSS} TSS · Rojo = ramp >15% (riesgo lesión)`}
        >
          {weeklyLoad.length > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyLoad} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#28334a" />
                <XAxis dataKey="week" tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} width={36} />
                <Tooltip
                  contentStyle={{ background: '#0b1425', border: '1px solid #3a4767', borderRadius: 8, fontSize: 11 }}
                  formatter={(v: unknown) => [String(v), 'TSS']}
                />
                <ReferenceLine y={avgWeeklyTSS} stroke="#475569" strokeDasharray="4 2"
                  label={{ value: 'media', fill: '#94a3b8', fontSize: 9 }} />
                <Bar dataKey="tss" radius={[3, 3, 0, 0]}>
                  {weeklyLoad.map((w, i) => (
                    <Cell key={i} fill={RAMP_COLOR[w.riskLevel]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <Empty label="Sin datos suficientes" />
          )}
        </Section>

        {/* 6 · Consistency Heatmap */}
        <Section
          title="Consistencia (últimos 28 días)"
          sub={`${heatmap.activeDaysCount} días con actividad · Intensidad = horas`}
        >
          <div className="space-y-2 py-1">
            {(['running', 'cycling', 'swimming'] as const).map(sport => {
              const data = heatmap.bySport[sport]
              const emoji = sport === 'running' ? '🏃' : sport === 'cycling' ? '🚴' : '🏊'
              const rgb = sport === 'running' ? '239,68,68' : sport === 'cycling' ? '249,115,22' : '59,130,246'
              const maxH = Math.max(...data, 0.01)
              return (
                <div key={sport} className="flex items-center gap-2">
                  <div className="w-5 text-[14px]">{emoji}</div>
                  <div className="flex gap-0.5 flex-1">
                    {data.map((h, i) => (
                      <div
                        key={i}
                        className="flex-1 rounded-sm"
                        style={{
                          height: 20,
                          background: h > 0
                            ? `rgba(${rgb},${0.15 + (h / maxH) * 0.85})`
                            : 'rgba(51,65,85,0.3)',
                        }}
                        title={`${heatmap.dates[i]}: ${h > 0 ? formatDuration(h * 3600) : '–'}`}
                      />
                    ))}
                  </div>
                </div>
              )
            })}
            <div className="flex gap-0.5 pl-7">
              {heatmap.dates.map((d, i) => (
                i % 7 === 0
                  ? <div key={i} className="flex-1 text-center" style={{ fontSize: 8, color: '#475569' }}>{d.slice(3)}</div>
                  : <div key={i} className="flex-1" />
              ))}
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function Empty({ label }: { label: string }) {
  return <div className="h-48 flex items-center justify-center text-ink-muted text-[14px]">{label}</div>
}

function deriveInsights({
  balance,
  efTrend,
  weeklyLoad,
  heatmap,
  cadenceData,
}: {
  balance: ReturnType<typeof useTriathlonBalance>
  efTrend: number | null
  weeklyLoad: ReturnType<typeof useWeeklyLoad>
  heatmap: ReturnType<typeof useConsistencyHeatmap>
  cadenceData: ReturnType<typeof useCadenceData>
}): { text: string; color: string }[] {
  const result: { text: string; color: string }[] = []

  const swim = balance.find(b => b.sport === 'Natación')
  if (swim && swim.actual < swim.ideal - 10) result.push({ text: '🏊 Natación infraentrenada', color: '#ef4444' })

  if (efTrend != null && efTrend > 2)  result.push({ text: '📈 Eficiencia aeróbica mejorando', color: '#22c55e' })
  if (efTrend != null && efTrend < -2) result.push({ text: '📉 Eficiencia aeróbica bajando — más Z1/Z2', color: '#f97316' })

  const highRiskWeeks = weeklyLoad.filter(w => w.riskLevel === 'high').length
  if (highRiskWeeks >= 2) result.push({ text: '⚠️ Rampas de carga elevadas — riesgo de lesión', color: '#f97316' })

  if (heatmap.activeDaysCount >= 20) result.push({ text: '✅ Consistencia excelente (28 días)', color: '#22c55e' })
  else if (heatmap.activeDaysCount < 12) result.push({ text: '⚡ Aumenta la frecuencia de entrenamiento', color: '#eab308' })

  const lowCadence = cadenceData.filter(c => !c.optimal).length
  if (cadenceData.length > 0 && lowCadence > cadenceData.length * 0.4) {
    result.push({ text: '👟 Cadencia baja — trabaja frecuencia de zancada', color: '#eab308' })
  }

  return result
}
