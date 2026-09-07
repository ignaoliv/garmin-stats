import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { estimateTSS } from '../utils/calculations'
import { startOfWeek, endOfWeek } from '../utils/date'
import type { ActivitySummary } from '../types/garmin'

export interface WeekTotals {
  count: number
  distance: number   // km
  duration: number   // seconds
  tss: number
  elevation: number  // m
  calories: number
}

export interface WeekComparisonData {
  thisWeek: ActivitySummary[]
  lastWeek: ActivitySummary[]
  current: WeekTotals
  /** La semana pasada hasta el mismo día y hora, que es contra lo que se compara. */
  previous: WeekTotals
  /** La semana pasada entera, para saber dónde terminó. */
  previousFull: WeekTotals
  /** Días de la semana ya transcurridos, 1 el lunes. */
  daysIn: number
}

function sumWeek(acts: ActivitySummary[], settings: ReturnType<typeof useActivityStore.getState>['settings']): WeekTotals {
  return {
    count: acts.length,
    distance: acts.reduce((s, a) => s + a.distance, 0),
    duration: acts.reduce((s, a) => s + a.duration, 0),
    tss: acts.reduce((s, a) => s + estimateTSS(a, settings), 0),
    elevation: acts.reduce((s, a) => s + (a.elevationGain ?? 0), 0),
    calories: acts.reduce((s, a) => s + (a.calories ?? 0), 0),
  }
}

export function useWeekComparison(): WeekComparisonData {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  const thisWeek = useMemo(() => {
    const mon = startOfWeek()
    return activities.filter(a => new Date(a.startTime) >= mon)
  }, [activities])

  const lastWeek = useMemo(() => {
    const mon = startOfWeek(1)
    const sun = endOfWeek(1)
    return activities.filter(a => {
      const t = new Date(a.startTime)
      return t >= mon && t <= sun
    })
  }, [activities])

  /* La semana pasada recortada al mismo tramo transcurrido.
   *
   * Comparar un lunes al mediodía contra siete días completos daba "▼ 8
   * sesiones" todos los lunes: verdad aritmética, disparate deportivo. La
   * comparación va contra los mismos días de la semana anterior. */
  const lastWeekSoFar = useMemo(() => {
    const mon = startOfWeek(1)
    const corte = new Date(mon.getTime() + (Date.now() - startOfWeek().getTime()))
    return activities.filter(a => {
      const t = new Date(a.startTime)
      return t >= mon && t < corte
    })
  }, [activities])

  const current = useMemo(() => sumWeek(thisWeek, settings), [thisWeek, settings])
  const previous = useMemo(() => sumWeek(lastWeekSoFar, settings), [lastWeekSoFar, settings])
  const previousFull = useMemo(() => sumWeek(lastWeek, settings), [lastWeek, settings])

  const daysIn = Math.floor((Date.now() - startOfWeek().getTime()) / 86_400_000) + 1

  return { thisWeek, lastWeek, current, previous, previousFull, daysIn }
}
