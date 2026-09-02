import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { aggregateByWeek } from '../utils/calculations'

export interface WeekLoadPoint {
  week: string
  tss: number
  rampPct: number
  riskLevel: 'ok' | 'warn' | 'high'
}

export function useWeeklyLoad(windowWeeks = 16): WeekLoadPoint[] {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const weeks = aggregateByWeek(activities, settings).slice(-windowWeeks)

    return weeks.map((w, i) => {
      const prevTSS = weeks[i - 1]?.totalTSS ?? w.totalTSS
      const rampPct = prevTSS > 0 ? ((w.totalTSS - prevTSS) / prevTSS) * 100 : 0
      const riskLevel = rampPct > 15 ? 'high' : rampPct > 8 ? 'warn' : 'ok'
      return {
        week: new Date(w.weekStart + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        tss: Math.round(w.totalTSS),
        rampPct: +rampPct.toFixed(0),
        riskLevel,
      }
    })
  }, [activities, settings, windowWeeks])
}
