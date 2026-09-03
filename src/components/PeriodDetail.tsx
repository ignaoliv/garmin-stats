import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'
import { sportColor, sportIcon, sportLabel, SPORT_META } from '../utils/sports'
import { formatDuration, formatPace } from '../utils/formatters'
import type { Sport } from '../types/garmin'

export type Period =
  | { tipo: 'año'; year: number }
  /** A calendar month, switchable across the seasons that have data. */
  | { tipo: 'mes'; month: number; years: number[] }

const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
               'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/**
 * Activities inside a clicked period.
 *
 * The chart answers "how much"; this answers "of what" — without navigating
 * away and losing the comparison you were looking at.
 */
export default function PeriodDetail({ period, onClose }: { period: Period; onClose: () => void }) {
  const activities = useActivityStore(s => s.activities)
  const [filtro, setFiltro] = useState<Sport | 'todos'>('todos')
  // For a month, default to the most recent season that actually has sessions.
  const [year, setYear] = useState<number>(() =>
    period.tipo === 'año' ? period.year : (period.years.at(-1) ?? new Date().getFullYear()))

  const key = period.tipo === 'año'
    ? String(period.year)
    : `${year}-${String(period.month + 1).padStart(2, '0')}`

  const label = period.tipo === 'año'
    ? `Temporada ${period.year}`
    : `${MESES[period.month]} de ${year}`

  const { rows, porDeporte, totales } = useMemo(() => {
    const inPeriod = activities.filter(a => a.startTime.startsWith(key))
    const bySport = new Map<Sport, { horas: number; count: number }>()
    for (const a of inPeriod) {
      const cur = bySport.get(a.sport) ?? { horas: 0, count: 0 }
      cur.horas += a.duration / 3600
      cur.count += 1
      bySport.set(a.sport, cur)
    }
    return {
      rows: inPeriod
        .filter(a => filtro === 'todos' || a.sport === filtro)
        .sort((a, b) => b.startTime.localeCompare(a.startTime)),
      porDeporte: [...bySport.entries()]
        .map(([sport, v]) => ({ sport, ...v }))
        .sort((a, b) => b.horas - a.horas),
      totales: {
        sesiones: inPeriod.length,
        horas: inPeriod.reduce((s, a) => s + a.duration, 0) / 3600,
        km: inPeriod.reduce((s, a) => s + a.distance, 0),
        desnivel: inPeriod.reduce((s, a) => s + (a.elevationGain ?? 0), 0),
      },
    }
  }, [activities, key, filtro])

  return (
    <div className="mt-4 rounded-xl border border-surface-line bg-surface-sunk overflow-hidden panel-in">
      <div className="flex items-center justify-between gap-4 px-4 py-3 border-b border-surface-line flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-ink-primary capitalize">{label}</h3>
          <p className="text-[13px] text-ink-muted mt-0.5 tabular-nums">
            {totales.sesiones} {totales.sesiones === 1 ? 'sesión' : 'sesiones'} · {totales.horas.toFixed(1)} h · {totales.km.toFixed(0)} km
            {totales.desnivel > 0 && <> · {Math.round(totales.desnivel).toLocaleString('es-ES')} m de desnivel</>}
          </p>
        </div>
        <button
          onClick={onClose}
          className="text-[13px] text-ink-muted hover:text-ink-primary px-2.5 py-1 rounded-lg hover:bg-surface-hover transition-colors shrink-0"
        >
          Cerrar ✕
        </button>
      </div>

      {period.tipo === 'mes' && period.years.length > 1 && (
        <div className="flex flex-wrap gap-2 px-4 py-2.5 border-b border-surface-line">
          <span className="text-[13px] text-ink-muted self-center mr-1">Temporada:</span>
          {period.years.map(y => (
            <FilterChip key={y} active={y === year} onClick={() => setYear(y)} label={String(y)} />
          ))}
        </div>
      )}

      {totales.sesiones === 0 ? (
        <p className="px-4 py-8 text-center text-[14px] text-ink-muted">Sin actividades en este período.</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2 px-4 py-3 border-b border-surface-line">
            <FilterChip active={filtro === 'todos'} onClick={() => setFiltro('todos')} label={`Todos (${totales.sesiones})`} />
            {porDeporte.map(s => (
              <FilterChip
                key={s.sport}
                active={filtro === s.sport}
                onClick={() => setFiltro(s.sport)}
                color={SPORT_META[s.sport].color}
                label={`${sportIcon(s.sport)} ${sportLabel(s.sport)} (${s.count})`}
              />
            ))}
          </div>

          <div className="max-h-[420px] overflow-y-auto">
            {rows.map(a => (
              <Link
                key={a.id}
                to={`/activity/${a.id}`}
                className="flex items-center gap-3 px-4 py-2.5 border-b border-surface-line last:border-0 hover:bg-surface-hover transition-colors"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: sportColor(a.sport) }} />
                <span className="text-[13px] text-ink-muted tabular-nums w-[86px] shrink-0">
                  {new Date(a.startTime).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}
                </span>
                <span className="text-[14px] text-ink-primary truncate flex-1 min-w-0">{a.title}</span>
                <span className="text-[13px] text-ink-secondary tabular-nums w-[70px] text-right shrink-0">
                  {a.distance > 0 ? `${a.distance.toFixed(1)} km` : '—'}
                </span>
                <span className="text-[13px] text-ink-secondary tabular-nums w-[64px] text-right shrink-0">
                  {formatDuration(a.duration)}
                </span>
                <span className="hidden sm:block text-[13px] text-ink-muted tabular-nums w-[76px] text-right shrink-0">
                  {a.avgPace ? formatPace(a.avgPace) : a.avgSpeed ? `${a.avgSpeed.toFixed(1)} km/h` : '—'}
                </span>
                <span className="hidden sm:block text-[13px] text-ink-muted tabular-nums w-[60px] text-right shrink-0">
                  {a.avgHR > 0 ? `${a.avgHR} bpm` : '—'}
                </span>
              </Link>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function FilterChip({
  active, onClick, label, color,
}: { active: boolean; onClick: () => void; label: string; color?: string }) {
  return (
    <button
      onClick={onClick}
      className={`px-2.5 py-1 rounded-lg text-[13px] font-medium border transition-colors ${
        active
          ? 'text-ink-primary border-transparent'
          : 'text-ink-secondary border-surface-line hover:border-surface-line-strong'
      }`}
      style={active ? { background: color ?? '#fc5200' } : undefined}
    >
      {label}
    </button>
  )
}
