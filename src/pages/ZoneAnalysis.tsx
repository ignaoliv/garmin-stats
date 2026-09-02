import { useMemo, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { Sport } from '../types/garmin'
import { estimateZonesFromHR, HR_ZONE_DEFS } from '../utils/calculations'
import { formatDuration } from '../utils/formatters'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer
} from 'recharts'

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
      const zones = estimateZonesFromHR(act.avgHR, act.duration, settings.maxHR)
      zones.forEach(z => { totals[z.zone - 1] += z.seconds })
    }
    return totals
  }, [filtered, settings.maxHR])

  const totalSeconds = zoneSeconds.reduce((a, b) => a + b, 0)

  const weeklyZoneData = useMemo(() => {
    const weeks: Record<string, number[]> = {}
    for (const act of filtered) {
      const d = new Date(act.startTime)
      const day = d.getDay()
      const diff = day === 0 ? -6 : 1 - day
      const monday = new Date(d)
      monday.setDate(d.getDate() + diff)
      const weekKey = monday.toISOString().slice(0, 10)
      if (!weeks[weekKey]) weeks[weekKey] = [0, 0, 0, 0, 0]
      const zones = estimateZonesFromHR(act.avgHR, act.duration, settings.maxHR)
      zones.forEach(z => { weeks[weekKey][z.zone - 1] += z.seconds / 3600 })
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
    <div className="flex-1 p-6 overflow-y-auto page-in">
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-[#f1f5f9]">Análisis de Zonas</h1>
          <p className="text-[14px] text-[#94a3b8] mt-0.5">Distribución del tiempo por zonas de FC</p>
        </div>
        <div className="flex bg-[#172033] rounded-lg p-0.5 gap-0.5">
          {(['all', 'running', 'cycling', 'swimming'] as const).map(s => (
            <button
              key={s}
              onClick={() => setSport(s)}
              className={`px-3 py-1.5 rounded-md text-[14px] transition-colors ${
                sport === s ? 'bg-blue-600 text-white' : 'text-[#cbd5e1] hover:text-[#f1f5f9]'
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
              <div className="w-24 text-[13px] text-[#cbd5e1]">{def.name}</div>
              <div className="flex-1 bg-[#172033] rounded-full h-3">
                <div
                  className="h-3 rounded-full transition-all"
                  style={{ width: `${pct}%`, background: def.color }}
                />
              </div>
              <div className="w-16 text-[13px] text-[#cbd5e1] text-right font-mono">{formatDuration(zoneSeconds[i])}</div>
              <div className="w-10 text-[13px] text-[#94a3b8] text-right">{pct.toFixed(0)}%</div>
            </div>
          )
        })}
      </div>

      {weeklyZoneData.length > 0 && (
        <div className="bg-[#172033] border border-[#28334a] rounded-xl p-4">
          <div className="text-[13px] text-[#94a3b8] uppercase tracking-wider mb-4">Distribución semanal (últimas 24 semanas)</div>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={weeklyZoneData} margin={{ top: 5, right: 10, bottom: 5, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#28334a" />
              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 12 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} unit="h" />
              <Tooltip
                contentStyle={{ background: '#0b1425', border: '1px solid #3a4767', borderRadius: 8, fontSize: 12 }}
                labelStyle={{ color: '#94a3b8' }}
                formatter={(v: unknown) => [`${Number(v).toFixed(1)}h`]}
              />
              {HR_ZONE_DEFS.map(def => (
                <Bar key={def.zone} dataKey={`z${def.zone}`} name={def.name} stackId="a" fill={def.color} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <p className="mt-4 text-[13px] text-[#94a3b8]">
        Zonas estimadas en base a FC media y FCmax configurada ({settings.maxHR} bpm).
      </p>
    </div>
  )
}
