import { useMemo, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { Sport } from '../types/garmin'
import { estimateZonesFromHR, HR_ZONE_DEFS } from '../utils/calculations'
import { formatDuration } from '../utils/formatters'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

/**
 * Seconds per zone for one activity.
 *
 * Prefers Garmin's own per-zone measurement. The estimate below drops the whole
 * session into a single zone based on average heart rate, which turns an
 * interval workout into one flat block — this page was still doing that while
 * the real numbers sat unused in the synced data.
 */
function segundosPorZona(act: { zonasFC?: number[]; avgHR: number; duration: number }, maxHR: number): number[] {
  if (act.zonasFC?.length === 5 && act.zonasFC.some(s => s > 0)) return act.zonasFC
  const out = [0, 0, 0, 0, 0]
  estimateZonesFromHR(act.avgHR, act.duration, maxHR).forEach(z => { out[z.zone - 1] = z.seconds })
  return out
}

export default function ZoneAnalysis() {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)
  const [sport, setSport] = useState<Sport | 'all'>('all')

  const filtered = useMemo(() =>
    activities.filter(a => sport === 'all' || a.sport === sport),
    [activities, sport]
  )

  const zoneSeconds = useMemo(() => {
    const totals: number[] = [0, 0, 0, 0, 0]
    for (const act of filtered) {
      segundosPorZona(act, settings.maxHR).forEach((s, i) => { totals[i] += s })
    }
    return totals
  }, [filtered, settings.maxHR])

  const totalSeconds = zoneSeconds.reduce((a, b) => a + b, 0)
  const estimadas = useMemo(
    () => filtered.filter(a => !(a.zonasFC?.length === 5 && a.zonasFC.some(s => s > 0))).length,
    [filtered],
  )

  const weeklyZoneData = useMemo(() => {
    const weeks: Record<string, number[]> = {}
    for (const act of filtered) {
      const d = new Date(act.startTime)
      const day = d.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(d)
      monday.setDate(d.getDate() + diff)
      // Local date parts: toISOString() shifts evening sessions into the next week.
      const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`
      if (!weeks[weekKey]) weeks[weekKey] = [0, 0, 0, 0, 0]
      segundosPorZona(act, settings.maxHR).forEach((s, i) => { weeks[weekKey][i] += s / 3600 })
    }
    return Object.entries(weeks)
      .sort(([a], [b]) => a.localeCompare(b))
      .slice(-24)
      .map(([date, zones]) => ({
        date: date.slice(5),
        z1: +zones[0].toFixed(2),
        z2: +zones[1].toFixed(2),
        z3: +zones[2].toFixed(2),
        z4: +zones[3].toFixed(2),
        z5: +zones[4].toFixed(2),
      }))
  }, [filtered, settings.maxHR])

  return (
    <div className="px-6 pb-6 page-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-ink-primary">Análisis de Zonas</h1>
          <p className="text-[14px] text-ink-muted mt-0.5">Distribución del tiempo por zonas de FC</p>
        </div>
        <div className="flex bg-surface-card rounded-lg p-0.5 gap-0.5">
          {(['all', 'running', 'cycling', 'swimming'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={`px-3 py-1.5 rounded-md text-[14px] transition-colors ${
                sport === s ? 'bg-blue-600 text-white' : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {s === 'all' ? 'Todos' : s === 'running' ? '🏃' : s === 'cycling' ? '🚴' : '🏊'}
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-3 mb-8">
        {HR_ZONE_DEFS.map((def, i) => {
          const pct = totalSeconds > 0 ? (zoneSeconds[i] / totalSeconds) * 100 : 0
          return (
            <div key={def.zone} className="flex items-center gap-4">
              <div className="w-6 text-[13px] font-medium" style={{ color: def.color }}>Z{def.zone}</div>
              <div className="w-24 text-[13px] text-ink-secondary">{def.name}</div>
              <div className="flex-1 bg-surface-card rounded-full h-3">
                <div
                  className="h-3 rounded-full transition-all"
                  style={{ width: `${pct}%`, background: def.color }}
                />
              </div>
              <div className="w-16 text-[13px] text-ink-secondary text-right font-mono">{formatDuration(zoneSeconds[i])}</div>
              <div className="w-10 text-[13px] text-ink-muted text-right">{pct.toFixed(0)}%</div>
            </div>
          )
        })}
      </div>

      {weeklyZoneData.length > 0 && (
        <div className="bg-surface-card border border-surface-line rounded-xl p-4">
          <div className="text-[13px] text-ink-muted uppercase tracking-wider mb-4">Distribución semanal (últimas 24 semanas)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyZoneData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-surface-line)" />
              <XAxis dataKey="date" tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }} />
              <YAxis tick={{ fill: 'var(--color-ink-muted)', fontSize: 12 }} unit="h" />
              <Tooltip
                contentStyle={{ background: 'var(--color-surface-overlay)', border: '1px solid var(--color-surface-line-strong)', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: 'var(--color-ink-muted)' }}
                formatter={(v: unknown) => [`${Number(v).toFixed(1)}h`]}
              />
              {HR_ZONE_DEFS.map(def => (
                <Bar key={def.zone} dataKey={`z${def.zone}`} name={def.name} stackId="a" fill={def.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 label-plain">
        {estimadas === 0
          ? `Tiempo por zona medido por Garmin en las ${filtered.length} actividades del filtro.`
          : `${filtered.length - estimadas} actividades con zonas medidas por Garmin y ${estimadas} estimadas desde la FC media (FCmax ${settings.maxHR} bpm).`}
      </p>
    </div>
  )
}
