import { Link } from 'react-router-dom'
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, ReferenceLine,
} from 'recharts'
import { useMemo } from 'react'
import { useStrength } from '../hooks/useStrength'
import { useTrainingPatterns } from '../hooks/useTrainingInsights'
import { useActivityStore } from '../stores/activityStore'
import { formatDuration } from '../utils/formatters'
import { daysAgo } from '../utils/date'
import { Card, CardHeader, StatTile, ChartTooltip, Insight, LegendItem } from '../components/ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const STRENGTH = '#d95926'

export default function Strength() {
  const loading = useActivityStore(s => s.loading)
  const s = useStrength(16)
  const patterns = useTrainingPatterns('strength')

  // Strength hours per calendar month, one series per season.
  const { monthly, years } = useMemo(() => {
    const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
    const ys = [...new Set(s.sessions.map(a => +a.startTime.slice(0, 4)))].sort((a, b) => b - a).slice(0, 3).sort((a, b) => a - b)
    const rows = MONTHS.map((month, mi) => {
      const row: Record<string, string | number> = { month }
      for (const y of ys) {
        row[String(y)] = +(
          s.sessions
            .filter(a => +a.startTime.slice(0, 4) === y && +a.startTime.slice(5, 7) === mi + 1)
            .reduce((acc, a) => acc + a.duration, 0) / 3600
        ).toFixed(1)
      }
      return row
    })
    return { monthly: rows, years: ys }
  }, [s.sessions])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-ink-secondary animate-pulse text-[15px]">Cargando…</div>
      </div>
    )
  }

  if (s.totalSessions === 0) {
    return (
      <div className="flex-1 p-8 max-w-2xl">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-primary mb-2">Sin sesiones de fuerza</h2>
          <p className="text-[15px] text-ink-secondary">
            No se encontraron actividades de fuerza. Se detectan por el tipo que envía Garmin
            (<code className="text-ink-muted">strength_training</code>) o por el título de la sesión.
          </p>
        </Card>
      </div>
    )
  }

  const maxWeekday = Math.max(...s.byWeekday.map(d => d.sessions), 1)
  const avgPerWeekWindow = s.weekly.length ? s.weekly.reduce((a, w) => a + w.sessions, 0) / s.weekly.length : 0
  const avgPerWeekday = s.byWeekday.reduce((a, d) => a + d.sessions, 0) / 7
  const favouriteDay = s.byWeekday.reduce((a, b) => (b.sessions > a.sessions ? b : a))
  const activeWeeks = s.weekly.filter(w => w.sessions > 0).length
  const trend = s.last30 - s.prev30

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-5 page-in">

        <header>
          <h1 className="text-2xl font-bold text-ink-primary">🏋️ Fuerza</h1>
          <p className="text-[14px] text-ink-muted mt-1">
            {s.totalSessions} sesiones · {s.totalHours.toFixed(0)} horas acumuladas
            {s.lastSession && <> · última {daysAgo(s.lastSession.startTime) === 0 ? 'hoy' : `hace ${daysAgo(s.lastSession.startTime)} días`}</>}
          </p>
        </header>

        {/* ── Headline numbers ───────────────────────────────────────────── */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="Últimos 30 días" value={String(s.last30)} unit="sesiones" delta={trend} accent={STRENGTH} />
          <StatTile label="Volumen 30 días" value={s.hours30.toFixed(1)} unit="h" delta={s.hours30 - s.prevHours30} deltaUnit=" h" accent={STRENGTH} />
          <StatTile label="Duración media" value={String(s.avgMinutes)} unit="min" hint="por sesión" accent={STRENGTH} />
          <StatTile label="Racha" value={String(s.weekStreak)} unit="sem" hint="semanas seguidas entrenando" accent={STRENGTH} />
        </div>

        {/* ── Consistency ────────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader title="Constancia" hint="Sesiones por semana · últimas 16 semanas" />
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={s.weekly} margin={{ top: 4, right: 66, bottom: 0, left: -16 }} barCategoryGap="22%">
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={16} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} allowDecimals={false} />
              <Tooltip
                cursor={{ fill: '#ffffff08' }}
                content={<ChartTooltip formatter={(v, _n, row) => `${v} sesiones · ${row?.minutes ?? 0} min en total`} />}
              />
              <ReferenceLine
                y={avgPerWeekWindow}
                stroke="#cbd5e1"
                strokeDasharray="5 4"
                strokeWidth={1.5}
                label={{ value: `media ${avgPerWeekWindow.toFixed(1)}`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
              />
              <Bar dataKey="sessions" name="Sesiones" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                {s.weekly.map((w, i) => (
                  <Cell key={w.weekStart} fill={i === s.weekly.length - 1 ? '#3987e5' : STRENGTH} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
            <LegendItem color={STRENGTH} label="Semanas anteriores" />
            <LegendItem color="#3987e5" label="Semana en curso" />
          </div>
          <div className="mt-3">
            <Insight tone={activeWeeks >= 12 ? 'good' : activeWeeks >= 8 ? 'neutral' : 'warning'}>
              Entrenaste fuerza en {activeWeeks} de las últimas 16 semanas
              ({Math.round((activeWeeks / 16) * 100)}%), con un promedio histórico de {s.avgPerWeek.toFixed(1)} sesiones por semana.
              {activeWeeks < 8 && ' Para ganar fuerza, lo habitual es sostener al menos 2 sesiones semanales.'}
            </Insight>
          </div>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

          {/* ── Weekday pattern ──────────────────────────────────────────── */}
          <Card className="p-5">
            <CardHeader title="Qué días entrenás" hint="Reparto histórico por día de la semana" />
            <ResponsiveContainer width="100%" height={210}>
              <BarChart data={s.byWeekday} margin={{ top: 4, right: 62, bottom: 0, left: -18 }} barCategoryGap="24%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="day" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v} sesiones`} />} />
                <ReferenceLine
                  y={avgPerWeekday}
                  stroke="#cbd5e1"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: `media ${avgPerWeekday.toFixed(0)}`, position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }}
                />
                <Bar dataKey="sessions" name="Sesiones" radius={[4, 4, 0, 0]} isAnimationActive={false}>
                  {s.byWeekday.map(d => (
                    <Cell key={d.day} fill={d.sessions === maxWeekday ? STRENGTH : '#7a4530'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-surface-line">
              <Insight tone="neutral">
                Tu día fuerte es el <strong className="text-ink-primary">{favouriteDay.day.toLowerCase()}</strong>, con {favouriteDay.sessions} sesiones.
              </Insight>
            </div>
          </Card>

          {/* ── Effort ───────────────────────────────────────────────────── */}
          <Card className="p-5">
            <CardHeader title="Esfuerzo" hint="Promedios de todas tus sesiones de fuerza" />
            <div className="space-y-3">
              <Row label="Frecuencia cardíaca media" value={s.avgHR > 0 ? `${s.avgHR} bpm` : 'sin datos'} />
              <Row label="Calorías totales" value={`${s.totalCalories.toLocaleString('es-ES')} kcal`} />
              <Row label="Calorías por sesión" value={`${Math.round(s.totalCalories / s.totalSessions)} kcal`} />
              <Row label="Tiempo total bajo carga" value={`${s.totalHours.toFixed(0)} h`} />
              <Row label="Promedio histórico" value={`${s.avgPerWeek.toFixed(1)} sesiones/semana`} />
            </div>
            <div className="mt-4 pt-3 border-t border-surface-line">
              <Insight tone="neutral">
                Garmin no envía series, repeticiones ni kilos en el resumen de actividad.
                Para eso hace falta pedir el detalle de ejercicios en la sincronización.
              </Insight>
            </div>
          </Card>
        </div>

        {/* ── Season comparison ──────────────────────────────────────────── */}
        {years.length > 1 && (
          <Card className="p-5">
            <CardHeader title="Fuerza año a año" hint="Horas de gimnasio por mes en cada temporada" />
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={monthly} margin={{ top: 8, right: 12, bottom: 0, left: -16 }} barCategoryGap="18%" barGap={2}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="month" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={{ stroke: GRID }} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={50} unit=" h" />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${Number(v).toFixed(1)} h`} />} />
                <Legend wrapperStyle={{ fontSize: 13, color: '#cbd5e1', paddingTop: 8 }} iconType="square" iconSize={11} />
                {years.map((y, i) => (
                  <Bar
                    key={y}
                    dataKey={String(y)}
                    name={String(y)}
                    fill={['#d95926', '#3987e5', '#199e70'][i] ?? '#d95926'}
                    radius={[3, 3, 0, 0]}
                    isAnimationActive={false}
                  />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        {/* ── Habits ─────────────────────────────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card className="p-5">
            <CardHeader title="A qué hora hacés fuerza" hint="Sesiones por hora de inicio" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={patterns.byHour} margin={{ top: 4, right: 8, bottom: 0, left: -24 }} barCategoryGap="12%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="hour" tick={{ ...AXIS, fontSize: 11 }} tickLine={false} axisLine={{ stroke: GRID }} interval={2} />
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} allowDecimals={false} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v} sesiones`} />} />
                <Bar dataKey="sessions" name="Sesiones" radius={[3, 3, 0, 0]} isAnimationActive={false}>
                  {patterns.byHour.map(h => (
                    <Cell key={h.hour} fill={h.hour === patterns.peakHour ? STRENGTH : '#7a4530'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="mt-3 pt-3 border-t border-surface-line">
              <Insight tone="neutral">
                Casi siempre entrenás fuerza a las <strong className="text-ink-primary">{patterns.peakHour}</strong>.
              </Insight>
            </div>
          </Card>

          <Card className="p-5">
            <CardHeader title="Cuánto duran" hint="Reparto de tus sesiones de fuerza por duración" />
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={patterns.durationBuckets} layout="vertical" margin={{ top: 4, right: 48, bottom: 0, left: 0 }} barCategoryGap="20%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} allowDecimals={false} />
                <YAxis type="category" dataKey="bucket" tick={{ ...AXIS, fill: '#cbd5e1' }} tickLine={false} axisLine={false} width={64} />
                <Tooltip cursor={{ fill: '#ffffff08' }} content={<ChartTooltip formatter={(v) => `${v} sesiones`} />} />
                <Bar dataKey="sessions" name="Sesiones" fill={STRENGTH} radius={[0, 3, 3, 0]} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </Card>
        </div>

        {/* ── Session log ────────────────────────────────────────────────── */}
        <section>
          <h2 className="text-[15px] font-semibold text-ink-primary mb-3">Historial de sesiones</h2>
          <div className="space-y-2">
            {s.sessions.slice(0, 20).map(a => (
              <Link
                key={a.id}
                to={`/activity/${a.id}`}
                className="flex items-center gap-4 px-4 py-3 rounded-xl border border-surface-line bg-surface-card hover:border-surface-line-strong hover:bg-surface-hover lift"
              >
                <span
                  className="w-9 h-9 rounded-lg shrink-0 flex items-center justify-center text-base"
                  style={{ background: `${STRENGTH}26`, border: `1px solid ${STRENGTH}59` }}
                >
                  🏋️
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-medium text-ink-primary truncate">{a.title}</div>
                  <div className="text-[13px] text-ink-muted">
                    {new Date(a.startTime).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                  </div>
                </div>
                <div className="flex items-center gap-6 shrink-0 text-right tabular-nums">
                  <div>
                    <div className="text-[15px] font-semibold text-ink-primary">{formatDuration(a.duration)}</div>
                    <div className="text-[13px] text-ink-muted">duración</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-[15px] font-semibold text-ink-primary">{a.avgHR > 0 ? a.avgHR : '—'}</div>
                    <div className="text-[13px] text-ink-muted">bpm medio</div>
                  </div>
                  <div className="hidden sm:block">
                    <div className="text-[15px] font-semibold text-ink-primary">{a.calories || '—'}</div>
                    <div className="text-[13px] text-ink-muted">kcal</div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
          {s.sessions.length > 20 && (
            <p className="text-[13px] text-ink-muted mt-3">
              Mostrando 20 de {s.sessions.length} sesiones.
            </p>
          )}
        </section>

        <div className="h-2" />
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 pb-3 border-b border-surface-line last:border-0 last:pb-0">
      <span className="text-[14px] text-ink-secondary">{label}</span>
      <span className="text-[15px] font-semibold text-ink-primary tabular-nums whitespace-nowrap">{value}</span>
    </div>
  )
}
