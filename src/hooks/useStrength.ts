import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { ActivitySummary } from '../types/garmin'

export interface StrengthWeek {
  weekStart: string   // ISO date of the Monday
  label: string       // "12 ago"
  sessions: number
  minutes: number
}

export interface StrengthData {
  sessions: ActivitySummary[]
  totalSessions: number
  totalHours: number
  /** Sessions in the trailing 30 days, and in the 30 before that. */
  last30: number
  prev30: number
  hours30: number
  prevHours30: number
  avgMinutes: number
  avgPerWeek: number
  /** Consecutive weeks, up to now, with at least one session. */
  weekStreak: number
  weekly: StrengthWeek[]
  byWeekday: { day: string; sessions: number }[]
  avgHR: number
  totalCalories: number
  lastSession: ActivitySummary | null
}

const DAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

function mondayOf(d: Date): Date {
  const m = new Date(d)
  const day = m.getDay()
  m.setDate(m.getDate() + (day === 0 ? -6 : 1 - day))
  m.setHours(0, 0, 0, 0)
  return m
}

export function useStrength(windowWeeks = 16): StrengthData {
  const activities = useActivityStore(s => s.activities)

  return useMemo(() => {
    const sessions = activities.filter(a => a.sport === 'strength')
    const now = Date.now()
    const dayMs = 86_400_000

    const inWindow = (a: ActivitySummary, fromDaysAgo: number, toDaysAgo: number) => {
      const t = new Date(a.startTime).getTime()
      return t >= now - fromDaysAgo * dayMs && t < now - toDaysAgo * dayMs
    }

    const recent = sessions.filter(a => inWindow(a, 30, 0))
    const previous = sessions.filter(a => inWindow(a, 60, 30))
    const totalSeconds = sessions.reduce((s, a) => s + a.duration, 0)

    // ── Weekly buckets, including the weeks with nothing in them ──────────
    const weekly: StrengthWeek[] = []
    const thisMonday = mondayOf(new Date())
    for (let i = windowWeeks - 1; i >= 0; i--) {
      const start = new Date(thisMonday)
      start.setDate(start.getDate() - i * 7)
      const end = new Date(start)
      end.setDate(end.getDate() + 7)
      const inWeek = sessions.filter(a => {
        const t = new Date(a.startTime).getTime()
        return t >= start.getTime() && t < end.getTime()
      })
      weekly.push({
        weekStart: start.toISOString().slice(0, 10),
        label: start.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
        sessions: inWeek.length,
        minutes: Math.round(inWeek.reduce((s, a) => s + a.duration, 0) / 60),
      })
    }

    // Streak counts back from the most recently completed week, so a quiet
    // Monday doesn't read as a broken streak.
    let weekStreak = 0
    for (let i = weekly.length - 1; i >= 0; i--) {
      if (weekly[i].sessions > 0) weekStreak++
      else if (i < weekly.length - 1) break
    }

    const byWeekday = DAY_LABELS.map((day, idx) => ({
      day,
      sessions: sessions.filter(a => {
        const wd = new Date(a.startTime).getDay()
        return (wd === 0 ? 6 : wd - 1) === idx
      }).length,
    }))

    const withHR = sessions.filter(a => a.avgHR > 0)
    const firstDate = sessions.length ? new Date(sessions.at(-1)!.startTime).getTime() : now
    const spanWeeks = Math.max((now - firstDate) / (dayMs * 7), 1)

    return {
      sessions,
      totalSessions: sessions.length,
      totalHours: totalSeconds / 3600,
      last30: recent.length,
      prev30: previous.length,
      hours30: recent.reduce((s, a) => s + a.duration, 0) / 3600,
      prevHours30: previous.reduce((s, a) => s + a.duration, 0) / 3600,
      avgMinutes: sessions.length ? Math.round(totalSeconds / sessions.length / 60) : 0,
      avgPerWeek: sessions.length / spanWeeks,
      weekStreak,
      weekly,
      byWeekday,
      avgHR: withHR.length ? Math.round(withHR.reduce((s, a) => s + a.avgHR, 0) / withHR.length) : 0,
      totalCalories: sessions.reduce((s, a) => s + (a.calories || 0), 0),
      lastSession: sessions[0] ?? null,
    }
  }, [activities, windowWeeks])
}
