import { Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, Cell, ReferenceArea, ReferenceLine,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useActivityStore } from '../stores/activityStore'
import { formatDuration, formatPace } from '../utils/formatters'
import { sportColor, sportIcon, sportLabel } from '../utils/sports'
import { daysAgo } from '../utils/date'
import { useFitnessHistory } from '../hooks/useFitnessHistory'
import { useWeekComparison } from '../hooks/useWeekComparison'
import { useSportVolume } from '../hooks/useSportVolume'
import { useTrainingStreak } from '../hooks/useTrainingStreak'
import { useZoneDistribution } from '../hooks/useZoneDistribution'
import { useWeeklyLoad } from '../hooks/useWeeklyLoad'
import { useStrength } from '../hooks/useStrength'
import { useACWR, useConsistencyHeatmap } from '../hooks/useTrainingInsights'
import Heatmap from '../components/Heatmap'
import { Card, CardHeader, StatTile, LegendItem, ChartTooltip, Insight } from '../components/ui'
import InsightsCard from '../components/InsightsCard'
import StepsCard from '../components/StepsCard'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'

function LoadingScreen() {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-ink-secondary animate-pulse text-[15px]">Cargando tus entrenamientos…</div>
    </div>
  )
}

function EmptyScreen() {
  return (
    <div className="flex-1 p-8 max-w-2xl">
      <Card className="p-6">
        <h2 className="text-state-warning font-semibold text-lg mb-2">Sin datos de Garmin</h2>
        <p className="text-[15px] text-ink-secondary mb-4">Ejecutá estos comandos para descargar tus actividades:</p>
        <div className="bg-surface-overlay border border-surface-line rounded-lg p-4 font-mono text-[13px] text-ink-secondary space-y-1.5">
          <div>cp .env.example .env</div>
          <div>cd fetch &amp;&amp; pip install -r requirements.txt</div>
          <div>python3 fetch/sync.py --limit 20</div>
        </div>
      </Card>
    </div>
  )
}

/** Plain-language reading of the training-balance number. */
function formStatus(tsb: number): { label: string; tone: 'good' | 'warning' | 'neutral'; text: string; color: string } {
  if (tsb > 15)  return { label: 'Muy descansado', tone: 'neutral', color: '#38bdf8', text: 'Estás fresco pero perdiendo forma. Buen momento para competir, o para volver a cargar.' }
  if (tsb > 5)   return { label: 'Descansado',     tone: 'good',    color: '#34d399', text: 'Recuperado y con la carga bajo control. Podés meter una sesión fuerte.' }
  if (tsb > -10) return { label: 'En equilibrio',  tone: 'good',    color: '#34d399', text: 'Carga y descanso balanceados. Es la zona donde se construye forma de manera sostenible.' }
  if (tsb > -25) return { label: 'Entrenando fuerte', tone: 'warning', color: '#fbbf24', text: 'Estás acumulando fatiga a propósito. Sostenible unas semanas, pero planificá una de descarga.' }
  return { label: 'Sobrecargado', tone: 'warning', color: '#fb923c', text: 'La fatiga supera bastante a tu forma. Bajá el volumen unos días para asimilar el trabajo.' }
}

export default function Dashboard() {
  const activities = useActivityStore(s => s.activities)
  const stats = useActivityStore(s => s.stats)
  const loading = useActivityStore(s => s.loading)
  const error = useActivityStore(s => s.error)

  const { current: fitness, sparkPoints } = useFitnessHistory()
  const { current: week, previous: lastWeek } = useWeekComparison()
  const { ranked: sportVolume, totalHours, totalCount } = useSportVolume(30)
  const streak = useTrainingStreak()
  const { slices: zoneSlices, isAerobicFocused, estimadas: zonasEstimadas } = useZoneDistribution(30)
  const weeklyLoad = useWeeklyLoad(16)
  const strength = useStrength(12)
  const acwr = useACWR(120)
  const heat = useConsistencyHeatmap(182)

  if (loading) return <LoadingScreen />
  if (error || activities.length === 0) return <EmptyScreen />

  const tsb = fitness?.tsb ?? 0
  const ctl = fitness?.ctl ?? 0
  const atl = fitness?.atl ?? 0
  const form = formStatus(tsb)
  const vo2 = stats?.vo2maxHistory?.length ? stats.vo2maxHistory.at(-1)!.value : null
  const aerobicPct = zoneSlices.slice(0, 2).reduce((s, z) => s + z.pct, 0)
  const avgWeeklyTSS = weeklyLoad.length ? weeklyLoad.reduce((s, w) => s + w.tss, 0) / weeklyLoad.length : 0
  const avgStrengthPerWeek = strength.weekly.length
    ? strength.weekly.reduce((s, w) => s + w.sessions, 0) / strength.weekly.length
    : 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-5 page-in">

        {/* ── Page header ────────────────────────────────────────────────── */}
        <header className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-ink-primary">Resumen</h1>
            <p className="text-[14px] text-ink-muted mt-1">
              {activities.length.toLocaleString('es-ES')} actividades registradas
              {stats?.syncedAt && (
                <> · última sincronización {new Date(stats.syncedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}</>
              )}
            </p>
          </div>
          {streak > 1 && (
            <div className="flex items-center gap-2.5 px-3.5 py-2 rounded-xl bg-surface-card border border-surface-line">
              <span className="text-xl">🔥</span>
              <div>
                <div className="text-[15px] font-bold text-state-warning leading-tight">{streak} días seguidos</div>
                <div className="text-[13px] text-ink-muted">entrenando</div>
              </div>
            </div>
          )}
        </header>

        <InsightsCard />

        {/* ── Training balance ───────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Estado de forma"
            hint="Forma = Fitness − Fatiga. Positivo es descanso; negativo, carga acumulada."
            action={{ to: '/fitness', label: 'Ver detalle →' }}
          />

          <div className="grid grid-cols-1 lg:grid-cols-[300px_1fr] gap-6">
            <div>
              <div className="flex items-end gap-3 mb-2">
                <span className="text-[56px] leading-none font-bold tabular-nums" style={{ color: form.color }}>
                  {tsb > 0 ? '+' : ''}{Math.round(tsb)}
                </span>
                <span
                  className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
                  style={{ color: form.color, borderColor: `${form.color}66`, background: `${form.color}1a` }}
                >
                  {form.label}
                </span>
              </div>
              <p className="text-[14px] text-ink-secondary leading-relaxed mb-4">{form.text}</p>

              <div className="grid grid-cols-2 gap-3">
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#3987e5' }} />
                    <span className="text-[13px] text-ink-muted">Fitness</span>
                  </div>
                  <div className="text-xl font-bold text-ink-primary tabular-nums">{Math.round(ctl)}</div>
                  <div className="text-[12px] text-ink-muted">media 42 días</div>
                </div>
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2.5 h-2.5 rounded-full" style={{ background: '#d95926' }} />
                    <span className="text-[13px] text-ink-muted">Fatiga</span>
                  </div>
                  <div className="text-xl font-bold text-ink-primary tabular-nums">{Math.round(atl)}</div>
                  <div className="text-[12px] text-ink-muted">media 7 días</div>
                </div>
              </div>

              {vo2 !== null && (
                <div className="mt-3 flex items-baseline gap-2 px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line">
                  <span className="text-[13px] text-ink-muted">VO₂max</span>
                  <span className="text-lg font-bold text-ink-primary tabular-nums">{vo2.toFixed(1)}</span>
                  <span className="text-[13px] text-ink-muted">ml/kg/min</span>
                </div>
              )}
            </div>

            <div>
              <ResponsiveContainer width="100%" height={210}>
                <AreaChart data={sparkPoints} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
                  <defs>
                    <linearGradient id="gCTL" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#3987e5" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="#3987e5" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={44} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} />
                  <Tooltip
                    content={<ChartTooltip formatter={(v) => String(Math.round(Number(v)))} />}
                    cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 3' }}
                  />
                  <Area type="monotone" dataKey="ctl" name="Fitness" stroke="#3987e5" strokeWidth={2} fill="url(#gCTL)" dot={false} />
                  <Area type="monotone" dataKey="atl" name="Fatiga" stroke="#d95926" strokeWidth={2} fill="none" dot={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex gap-4 mt-2 pl-8">
                <LegendItem color="#3987e5" label="Fitness (CTL)" />
                <LegendItem color="#d95926" label="Fatiga (ATL)" />
              </div>
            </div>
          </div>
        </Card>

        {/* ── This week ──────────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-ink-primary">Esta semana</h2>
            <span className="text-[13px] text-ink-muted">comparado con la semana anterior</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            <StatTile label="Sesiones"  value={String(week.count)}                 delta={week.count - lastWeek.count} />
            <StatTile label="Distancia" value={week.distance.toFixed(1)} unit="km" delta={week.distance - lastWeek.distance} deltaUnit=" km" />
            <StatTile label="Tiempo"    value={(week.duration / 3600).toFixed(1)} unit="h" delta={(week.duration - lastWeek.duration) / 3600} deltaUnit=" h" />
            <StatTile label="Carga"     value={String(Math.round(week.tss))} unit="TSS" delta={week.tss - lastWeek.tss} />
          </div>
        </section>

        {/* ── Sport mix + HR zones ───────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          <Card className="p-5">
            <CardHeader
              title="En qué entrenaste"
              hint={`Últimos 30 días · ${totalHours.toFixed(1)} h en ${totalCount} sesiones`}
            />
            {sportVolume.length === 0 ? (
              <p className="text-[14px] text-ink-muted py-8 text-center">Sin actividades en los últimos 30 días.</p>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(sportVolume.length * 42, 130)}>
                <BarChart data={sportVolume} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="22%">
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit=" h" />
                  <YAxis type="category" dataKey="label" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={false} width={82} />
                  <Tooltip
                    cursor={{ fill: '#ffffff08' }}
                    content={
                      <ChartTooltip
                        formatter={(v, _n, row) =>
                          `${Number(v).toFixed(1)} h · ${row?.count ?? 0} sesiones · ${Math.round(Number(row?.pct ?? 0))}%`
                        }
                      />
                    }
                  />
                  <Bar dataKey="hours" name="Volumen" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                    {sportVolume.map(s => <Cell key={s.sport} fill={s.color} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
            <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3 pt-3 border-t border-surface-line">
              {sportVolume.map(s => (
                <LegendItem key={s.sport} color={s.color} label={`${sportIcon(s.sport)} ${s.label}`} value={`${Math.round(s.pct)}%`} />
              ))}
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Zonas de frecuencia cardíaca" hint={zonasEstimadas === 0
                ? 'Tiempo medido por Garmin · últimos 30 días'
                : `Últimos 30 días · ${zonasEstimadas} ${zonasEstimadas === 1 ? 'sesión estimada' : 'sesiones estimadas'}`} />
            <ResponsiveContainer width="100%" height={190}>
              <BarChart data={zoneSlices} layout="vertical" margin={{ top: 0, right: 48, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit="%" domain={[0, 'dataMax']} />
                <YAxis type="category" dataKey="zone" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={false} width={104} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v}% del tiempo`} />} />
                <Bar dataKey="pct" name="Tiempo" radius={[0, 4, 4, 0]} isAnimationActive={false}>
                  {zoneSlices.map(z => <Cell key={z.zone} fill={z.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-surface-line">
              <Insight tone={isAerobicFocused ? 'good' : 'warning'}>
                {isAerobicFocused
                  ? `Buena base aeróbica: ${Math.round(aerobicPct)}% del tiempo en Z1–Z2, por encima del 60% recomendado.`
                  : `Solo ${Math.round(aerobicPct)}% del tiempo en Z1–Z2. Lo habitual es apuntar a más del 60% en zonas bajas.`}
              </Insight>
            </div>
          </Card>
        </div>

        {/* ── Injury-risk ratio ──────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Riesgo de sobrecarga"
            hint="Relación entre tu carga de los últimos 7 días y tu base de las últimas 4 semanas"
          />
          <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
            <div>
              <div className="flex items-end gap-3 mb-3">
                <span className="text-[52px] leading-none font-bold tabular-nums" style={{ color: acwr.color }}>
                  {acwr.current.toFixed(2)}
                </span>
                <span
                  className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
                  style={{ color: acwr.color, borderColor: `${acwr.color}66`, background: `${acwr.color}1a` }}
                >
                  {acwr.label}
                </span>
              </div>

              {/* Zone rail: shows where the number sits, not just its colour. */}
              <div className="relative h-2.5 rounded-full overflow-hidden flex mb-1.5">
                <div style={{ width: '40%', background: '#38bdf8' }} />
                <div style={{ width: '25%', background: '#34d399' }} />
                <div style={{ width: '10%', background: '#fbbf24' }} />
                <div style={{ width: '25%', background: '#f87171' }} />
                <div
                  className="absolute top-[-3px] w-1 h-[17px] rounded-full bg-ink-primary border border-surface-base"
                  style={{ left: `calc(${Math.min(Math.max((acwr.current / 2) * 100, 0), 99)}% - 2px)` }}
                />
              </div>
              <div className="flex justify-between text-[12px] text-ink-muted mb-3">
                <span>0</span><span>0.8</span><span>1.3</span><span>1.5</span><span>2.0</span>
              </div>

              <p className="text-[14px] text-ink-secondary leading-relaxed">{acwr.advice}</p>

              <div className="grid grid-cols-2 gap-3 mt-4">
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="text-[13px] text-ink-muted mb-1">Carga aguda</div>
                  <div className="text-lg font-bold text-ink-primary tabular-nums">{acwr.acute}</div>
                  <div className="text-[12px] text-ink-muted">TSS · 7 días</div>
                </div>
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="text-[13px] text-ink-muted mb-1">Carga crónica</div>
                  <div className="text-lg font-bold text-ink-primary tabular-nums">{acwr.chronic}</div>
                  <div className="text-[12px] text-ink-muted">TSS · media semanal 28d</div>
                </div>
              </div>
            </div>

            <div>
              <ResponsiveContainer width="100%" height={230}>
                <AreaChart data={acwr.series} margin={{ top: 8, right: 8, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id="gRatio" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#34d399" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="#34d399" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={44} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} domain={[0, 2]} />
                  <ReferenceArea y1={0.8} y2={1.3} fill="#34d399" fillOpacity={0.08} />
                  <ReferenceLine y={1.3} stroke="#fbbf24" strokeDasharray="4 3" strokeWidth={1.5} />
                  <ReferenceLine y={0.8} stroke="#38bdf8" strokeDasharray="4 3" strokeWidth={1.5} />
                  <Tooltip
                    content={<ChartTooltip formatter={(v, _n, row) => `${v} · agudo ${row?.acute ?? 0} / crónico ${row?.chronic ?? 0} TSS`} />}
                    cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 3' }}
                  />
                  <Area type="monotone" dataKey="ratio" name="Ratio agudo:crónico" stroke="#34d399" strokeWidth={2} fill="url(#gRatio)" dot={false} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-2 pl-6">
                <LegendItem color="#34d399" label="Ratio agudo:crónico" />
                <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
                  <span className="w-4 h-2 rounded-[2px] inline-block" style={{ background: '#34d39929', border: '1px solid #34d39966' }} />
                  Zona segura (0,8–1,3)
                </span>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Strength ───────────────────────────────────────────────────── */}
        {strength.totalSessions > 0 && (
          <Card className="p-5">
            <CardHeader
              title="🏋️ Fuerza"
              hint={`${strength.totalSessions} sesiones registradas · ${strength.totalHours.toFixed(0)} h acumuladas`}
              action={{ to: '/fuerza', label: 'Ver análisis completo →' }}
            />
            <div className="grid grid-cols-1 lg:grid-cols-[repeat(3,150px)_1fr] gap-4 items-start">
              <div className="glass-sunk rounded-lg px-4 py-3">
                <div className="text-[13px] text-ink-muted mb-1">Últimos 30 días</div>
                <div className="text-2xl font-bold text-ink-primary tabular-nums">{strength.last30}</div>
                <div className="text-[13px] text-ink-muted">sesiones</div>
              </div>
              <div className="glass-sunk rounded-lg px-4 py-3">
                <div className="text-[13px] text-ink-muted mb-1">Duración media</div>
                <div className="text-2xl font-bold text-ink-primary tabular-nums">{strength.avgMinutes}</div>
                <div className="text-[13px] text-ink-muted">minutos</div>
              </div>
              <div className="glass-sunk rounded-lg px-4 py-3">
                <div className="text-[13px] text-ink-muted mb-1">Racha</div>
                <div className="text-2xl font-bold text-ink-primary tabular-nums">{strength.weekStreak}</div>
                <div className="text-[13px] text-ink-muted">semanas seguidas</div>
              </div>

              <div>
                <div className="text-[13px] text-ink-muted mb-2">Sesiones por semana · últimas 12</div>
                <ResponsiveContainer width="100%" height={104}>
                  <BarChart data={strength.weekly} margin={{ top: 4, right: 62, bottom: 0, left: -26 }} barCategoryGap="26%">
                    <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={22} />
                    <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} allowDecimals={false} />
                    <Tooltip
                      cursor={{ fill: '#ffffff08' }}
                      content={<ChartTooltip formatter={(v, _n, row) => `${v} sesiones · ${row?.minutes ?? 0} min`} />}
                    />
                    <ReferenceLine
                      y={avgStrengthPerWeek}
                      stroke="#cbd5e1"
                      strokeDasharray="5 4"
                      strokeWidth={1.5}
                      label={{ value: `media ${avgStrengthPerWeek.toFixed(1)}`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
                    />
                    <Bar dataKey="sessions" name="Sesiones" fill="#d95926" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </Card>
        )}

        {/* ── Weekly load ────────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Carga semanal"
            hint="TSS por semana · últimas 16 semanas"
            action={{ to: '/fitness', label: 'Ver detalle →' }}
          />
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={weeklyLoad} margin={{ top: 4, right: 66, bottom: 0, left: -16 }} barCategoryGap="20%">
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="week" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={18} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                content={<ChartTooltip formatter={(v, _n, row) => `${v} TSS${row?.rampPct ? ` · ${Number(row.rampPct) > 0 ? '+' : ''}${row.rampPct}% vs semana previa` : ''}`} />}
              />
              <ReferenceLine
                y={avgWeeklyTSS}
                stroke="#cbd5e1"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{ value: `media ${Math.round(avgWeeklyTSS)}`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
              />
              <Bar dataKey="tss" name="Carga" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {weeklyLoad.map((w, i) => (
                  <Cell key={w.week} fill={i === weeklyLoad.length - 1 ? '#3987e5' : '#33456b'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
            <LegendItem color="#3987e5" label="Semana en curso" value={`${Math.round(week.tss)} TSS`} />
            <LegendItem color="#33456b" label="Semanas anteriores" />
          </div>
        </Card>

        <StepsCard windowDays={30} />

        {/* ── Consistency ────────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Constancia"
            hint="Últimos 6 meses · cada cuadro es un día, más brillante = más carga"
            action={{ to: '/progreso', label: 'Ver año completo →' }}
          />
          <Heatmap days={heat.days} weeks={heat.weeks} monthTicks={heat.monthTicks} cell={13} gap={3} />
        </Card>

        {/* ── Recent activities ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-ink-primary">Últimas actividades</h2>
            <Link to="/activities" className="text-[13px] font-medium text-accent hover:text-accent-soft">Ver todas →</Link>
          </div>
          <div className="space-y-2 stagger">
            {activities.slice(0, 6).map(a => (
              <Link
                key={a.id}
                to={`/activity/${a.id}`}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-surface-line bg-surface-card hover:border-surface-line-strong hover:bg-surface-hover lift"
              >
                <span
                  className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-base"
                  style={{ background: `${sportColor(a.sport)}26`, border: `1px solid ${sportColor(a.sport)}59` }}
                >
                  {sportIcon(a.sport)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-ink-primary truncate">{a.title}</div>
                  <div className="text-[13px] text-ink-muted">
                    {sportLabel(a.sport)} · {daysAgo(a.startTime) === 0 ? 'hoy' : daysAgo(a.startTime) === 1 ? 'ayer' : `hace ${daysAgo(a.startTime)} días`}
                  </div>
                </div>

                <div className="flex items-center gap-6 shrink-0 text-right tabular-nums">
                  {a.distance > 0 && (
                    <div className="hidden sm:block">
                      <div className="text-[15px] font-semibold text-ink-primary">{a.distance.toFixed(1)} km</div>
                      <div className="text-[13px] text-ink-muted">
                        {a.avgPace ? formatPace(a.avgPace) : a.avgSpeed ? `${a.avgSpeed.toFixed(1)} km/h` : ''}
                      </div>
                    </div>
                  )}
                  <div>
                    <div className="text-[15px] font-semibold text-ink-primary">{formatDuration(a.duration)}</div>
                    <div className="text-[13px] text-ink-muted">{a.avgHR > 0 ? `${a.avgHR} bpm` : '—'}</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>

        <div className="h-2" />
      </div>
    </div>
  )
}
