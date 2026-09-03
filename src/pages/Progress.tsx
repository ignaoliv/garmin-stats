import {
  LineChart, Line, BarChart, Bar, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useState } from 'react'
import { useYearComparison, useTrainingPatterns, useConsistencyHeatmap } from '../hooks/useTrainingInsights'
import { useActivityStore } from '../stores/activityStore'
import Heatmap from '../components/Heatmap'
import PeriodDetail, { type Period } from '../components/PeriodDetail'
import { Card, CardHeader, StatTile, ChartTooltip, Insight, LegendItem } from '../components/ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'

/**
 * One distinct hue per season. A single-hue ramp made adjacent years hard to
 * tell apart, so these are four separate hues instead — validated as a set
 * against this surface (worst adjacent CVD ΔE 8.4, normal-vision ΔE 19.3).
 * Orange is deliberately absent: it belongs to the strength series.
 */

const YEAR_HUES = ['#3987e5', '#d55181', '#c98500', '#199e70']
const yearColor = (i: number) => YEAR_HUES[i % YEAR_HUES.length]

export default function Progress() {
  const loading = useActivityStore(s => s.loading)
  const activities = useActivityStore(s => s.activities)
  const yoy = useYearComparison(4)
  const patterns = useTrainingPatterns()
  const heat = useConsistencyHeatmap(364)
  const [periodo, setPeriodo] = useState<Period | null>(null)

  if (loading) {
    return <div className="flex-1 flex items-center justify-center"><div className="text-ink-secondary animate-pulse text-[15px]">Cargando…</div></div>
  }
  if (activities.length === 0) {
    return <div className="flex-1 p-8"><Card className="p-6"><p className="text-[15px] text-ink-secondary">Sin datos todavía. Sincronizá primero.</p></Card></div>
  }

  const thisYear = new Date().getFullYear()
  // yoy.years is capped at the last 4 seasons; the archive itself goes back further.
  const firstYear = Math.min(...activities.map(a => +a.startTime.slice(0, 4)))
  const maxDuration = Math.max(...patterns.durationBuckets.map(b => b.sessions), 1)
  const maxHour = Math.max(...patterns.byHour.map(b => b.sessions), 1)
  const avgHour = patterns.byHour.reduce((a, h) => a + h.sessions, 0) / 24
  const avgBucket = patterns.durationBuckets.reduce((a, b) => a + b.sessions, 0) / patterns.durationBuckets.length
  const hoursDelta = yoy.ytd.hours - yoy.ytdPrev.hours
  const pctDelta = yoy.ytdPrev.hours > 0 ? (hoursDelta / yoy.ytdPrev.hours) * 100 : 0

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-5 page-in">

        <header>
          <h1 className="text-2xl font-bold text-ink-primary">Progreso</h1>
          <p className="text-[14px] text-ink-muted mt-1">
            Comparativa entre temporadas y tus patrones de entrenamiento · {activities.length.toLocaleString('es-ES')} actividades desde {firstYear}
          </p>
        </header>

        {/* ── Year to date ───────────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
            <h2 className="text-[15px] font-semibold text-ink-primary">{thisYear} vs {thisYear - 1}</h2>
            <span className="text-[13px] text-ink-muted">mismo período: 1 de enero → hoy</span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
            <StatTile label="Horas entrenadas" value={yoy.ytd.hours.toFixed(0)} unit="h" delta={hoursDelta} deltaUnit=" h" />
            <StatTile label="Sesiones" value={String(yoy.ytd.sessions)} delta={yoy.ytd.sessions - yoy.ytdPrev.sessions} />
            <StatTile label="Distancia" value={yoy.ytd.distance.toFixed(0)} unit="km" delta={yoy.ytd.distance - yoy.ytdPrev.distance} deltaUnit=" km" />
          </div>
          <div className="mt-3">
            <Insight tone={hoursDelta >= 0 ? 'good' : 'warning'}>
              {yoy.ytdPrev.hours === 0
                ? `Sin datos del mismo período de ${thisYear - 1} para comparar.`
                : hoursDelta >= 0
                  ? `Llevás ${hoursDelta.toFixed(0)} h más que a esta altura de ${thisYear - 1} (${pctDelta > 0 ? '+' : ''}${Math.round(pctDelta)}%).`
                  : `Llevás ${Math.abs(hoursDelta).toFixed(0)} h menos que a esta altura de ${thisYear - 1} (${Math.round(pctDelta)}%).`}
            </Insight>
          </div>
        </section>

        {/* ── The race ───────────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader title="La carrera del año" hint="Horas acumuladas desde el 1 de enero · últimas 4 temporadas. La línea más clara es el año en curso." />
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={yoy.cumulative} margin={{ top: 8, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={48} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={50} unit=" h" />
              <Tooltip
                content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(0)} h acumuladas`} />}
                cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 3' }}
              />
              {yoy.years.map((y, i) => (
                <Line
                  key={y}
                  type="monotone"
                  dataKey={String(y)}
                  name={String(y)}
                  stroke={yearColor(i)}
                  strokeWidth={y === thisYear ? 3 : 2}
                  dot={false}
                  connectNulls={false}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
            {yoy.years.map((y, i) => (
              <LegendItem
                key={y}
                color={yearColor(i)}
                label={String(y)}
                value={`${yoy.totals.find(t => t.year === y)!.hours.toFixed(0)} h`}
              />
            ))}
          </div>
        </Card>

        {/* ── Monthly volume ─────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader title="Volumen mes a mes" hint="Horas por mes en cada temporada" />
          <ResponsiveContainer width="100%" height={260}>
            {/* Click handling lives at the category level: with 12 months × 4
                seasons the individual bars render about 1px wide, which is not
                a hittable target. The whole month column is. */}
            <BarChart
              data={yoy.monthly}
              margin={{ top: 8, right: 12, bottom: 0, left: -14 }}
              barCategoryGap="18%"
              barGap={2}
              style={{ cursor: 'pointer' }}
              onClick={(state) => {
                // Recharts types this loosely; the category index is a number.
                const i = Number(state?.activeTooltipIndex)
                if (!Number.isInteger(i) || i < 0) return
                setPeriodo({ tipo: 'mes', month: i, years: yoy.years })
              }}
            >
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="month" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={50} unit=" h" />
              <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(1)} h`} />} />
              <Legend wrapperStyle={{ fontSize: 13, color: '#cbd5e1', paddingTop: 8 }} iconType="square" iconSize={11} />
              {yoy.years.map((y, i) => (
                <Bar key={y} dataKey={String(y)} name={String(y)} fill={yearColor(i)} radius={[3, 3, 0, 0]} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <p className="text-[13px] text-ink-muted mt-2">Hacé clic en un mes para ver sus actividades.</p>
          {periodo?.tipo === 'mes' && (
            <PeriodDetail key={`m-${periodo.month}`} period={periodo} onClose={() => setPeriodo(null)} />
          )}
        </Card>

        {/* ── Season totals ──────────────────────────────────────────────── */}
        <Card className="p-5 overflow-x-auto">
          <CardHeader title="Totales por temporada" hint="Hacé clic en un año para ver sus actividades" />
          <table className="w-full text-[14px] tabular-nums min-w-[620px]">
            <thead>
              <tr className="text-[13px] text-ink-muted text-left border-b border-surface-line">
                <th className="pb-2 pr-4 font-medium">Año</th>
                <th className="pb-2 pr-4 font-medium text-right">Sesiones</th>
                <th className="pb-2 pr-4 font-medium text-right">Horas</th>
                <th className="pb-2 pr-4 font-medium text-right">Distancia</th>
                <th className="pb-2 pr-4 font-medium text-right">Desnivel</th>
                <th className="pb-2 pr-4 font-medium text-right">Calorías</th>
                <th className="pb-2 font-medium text-right">Carga (TSS)</th>
              </tr>
            </thead>
            <tbody>
              {[...yoy.totals].reverse().map(t => (
                <tr
                  key={t.year}
                  onClick={() => setPeriodo({ tipo: 'año', year: t.year })}
                  className="border-b border-surface-line last:border-0 cursor-pointer hover:bg-surface-hover transition-colors"
                >
                  <td className="py-2.5 pr-4">
                    <span className="inline-flex items-center gap-2 font-semibold text-ink-primary">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ background: yearColor(yoy.years.indexOf(t.year)) }} />
                      {t.year}
                      {t.year === thisYear && <span className="text-[12px] font-normal text-ink-muted">(en curso)</span>}
                    </span>
                  </td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary">{t.sessions}</td>
                  <td className="py-2.5 pr-4 text-right text-ink-primary font-semibold">{t.hours.toFixed(0)} h</td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary">{t.distance.toFixed(0)} km</td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary">{t.elevation.toLocaleString('es-ES')} m</td>
                  <td className="py-2.5 pr-4 text-right text-ink-secondary">{t.calories.toLocaleString('es-ES')}</td>
                  <td className="py-2.5 text-right text-ink-secondary">{Math.round(t.tss).toLocaleString('es-ES')}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {periodo?.tipo === 'año' && (
            <PeriodDetail key={`y-${periodo.year}`} period={periodo} onClose={() => setPeriodo(null)} />
          )}
        </Card>

        {/* ── Consistency ────────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader title="Constancia" hint="Un cuadro por día del último año, coloreado por carga de entrenamiento" />
          <Heatmap days={heat.days} weeks={heat.weeks} monthTicks={heat.monthTicks} />
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4 pt-4 border-t border-surface-line">
            <MiniStat label="Días activos" value={`${heat.activeDays}`} hint={`de ${heat.totalDays} (${Math.round(heat.activeDays / heat.totalDays * 100)}%)`} />
            <MiniStat label="Racha más larga" value={`${heat.longestStreak}`} hint="días seguidos" />
            <MiniStat label="Racha actual" value={`${heat.currentStreak}`} hint="días seguidos" />
            <MiniStat label="Media semanal" value={(heat.activeDays / (heat.totalDays / 7)).toFixed(1)} hint="días por semana" />
          </div>
        </Card>

        {/* ── Habits ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <CardHeader title="A qué hora entrenás" hint="Todas tus actividades por hora de inicio" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={patterns.byHour} margin={{ top: 4, right: 62, bottom: 0, left: -22 }} barCategoryGap="12%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ ...AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval={2} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v} sesiones`} />} />
                <ReferenceLine
                  y={avgHour}
                  stroke="#cbd5e1"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: `media ${avgHour.toFixed(0)}`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
                />
                <Bar dataKey="sessions" name="Sesiones" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {patterns.byHour.map(h => (
                    <Cell key={h.hour} fill={h.sessions === maxHour ? '#3987e5' : '#33456b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-surface-line">
              <Insight tone="neutral">
                Tu franja habitual son las <strong className="text-ink-primary">{patterns.peakHour}</strong>, y tu día más activo el <strong className="text-ink-primary">{patterns.peakDay.toLowerCase()}</strong>.
              </Insight>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Cuánto duran tus sesiones" hint="Reparto de todas las actividades por duración" />
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={patterns.durationBuckets} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis type="category" dataKey="bucket" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={false} width={64} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v} sesiones`} />} />
                <ReferenceLine
                  x={avgBucket}
                  stroke="#cbd5e1"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: `media ${avgBucket.toFixed(0)}`, position: 'top', fill: '#cbd5e1', fontSize: 11 }}
                />
                <Bar dataKey="sessions" name="Sesiones" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                  {patterns.durationBuckets.map(b => (
                    <Cell key={b.bucket} fill={b.sessions === maxDuration ? '#3987e5' : '#33456b'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Sport mix per season ───────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader title="Mezcla de deportes por temporada" hint="Horas dedicadas a cada disciplina, año por año" />
          <div className="space-y-4">
            {[...yoy.totals].reverse().map(t => (
              <div key={t.year}>
                <div className="flex items-baseline justify-between mb-1.5">
                  <span className="text-[14px] font-semibold text-ink-primary">{t.year}</span>
                  <span className="text-[13px] text-ink-muted tabular-nums">{t.hours.toFixed(0)} h totales</span>
                </div>
                <div className="flex h-6 rounded-md overflow-hidden gap-[2px]">
                  {t.bySport.filter(s => s.hours / t.hours > 0.005).map(s => (
                    <div
                      key={s.sport}
                      title={`${s.label}: ${s.hours.toFixed(1)} h (${Math.round(s.hours / t.hours * 100)}%)`}
                      style={{ width: `${(s.hours / t.hours) * 100}%`, background: s.color }}
                    />
                  ))}
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1.5">
                  {t.bySport.filter(s => s.hours / t.hours > 0.03).map(s => (
                    <LegendItem key={s.sport} color={s.color} label={s.label} value={`${Math.round(s.hours / t.hours * 100)}%`} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <div className="h-2" />
      </div>
    </div>
  )
}

function MiniStat({ label, value, hint }: { label: string; value: string; hint: string }) {
  return (
    <div className="bg-surface-card border border-surface-line rounded-lg px-4 py-3">
      <div className="text-[13px] text-ink-muted mb-1">{label}</div>
      <div className="text-2xl font-bold text-ink-primary tabular-nums leading-none">{value}</div>
      <div className="text-[13px] text-ink-muted mt-1">{hint}</div>
    </div>
  )
}
