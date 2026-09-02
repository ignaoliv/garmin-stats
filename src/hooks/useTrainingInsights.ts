import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { estimateTSS } from '../utils/calculations'
import { SPORT_META } from '../utils/sports'
import type { ActivitySummary, Sport } from '../types/garmin'

const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const dayMs = 86_400_000

// ─── Year over year ───────────────────────────────────────────────────────────

export interface YearTotals {
  year: number
  sessions: number
  hours: number
  distance: number
  elevation: number
  calories: number
  tss: number
  bySport: { sport: Sport; label: string; color: string; hours: number }[]
}

export interface YoYData {
  years: number[]
  totals: YearTotals[]
  /** Hours per calendar month, one key per year: { month: 'Ene', '2025': 8.1, '2026': 12.4 } */
  monthly: Record<string, string | number>[]
  /** Cumulative hours by day-of-year — the "race" between seasons. */
  cumulative: Record<string, string | number>[]
  /** Same-period comparison: Jan 1 → today, this year vs last. */
  ytd: { hours: number; sessions: number; distance: number }
  ytdPrev: { hours: number; sessions: number; distance: number }
}

export function useYearComparison(maxYears = 4): YoYData {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const now = new Date()
    const thisYear = now.getFullYear()

    const present = [...new Set(activities.map(a => +a.startTime.slice(0, 4)))].sort((a, b) => b - a)
    const years = present.slice(0, maxYears).sort((a, b) => a - b)

    const totals: YearTotals[] = years.map(year => {
      const acts = activities.filter(a => +a.startTime.slice(0, 4) === year)
      const bySportHours = new Map<Sport, number>()
      for (const a of acts) bySportHours.set(a.sport, (bySportHours.get(a.sport) ?? 0) + a.duration / 3600)
      return {
        year,
        sessions: acts.length,
        hours: acts.reduce((s, a) => s + a.duration, 0) / 3600,
        distance: acts.reduce((s, a) => s + a.distance, 0),
        elevation: acts.reduce((s, a) => s + (a.elevationGain ?? 0), 0),
        calories: acts.reduce((s, a) => s + (a.calories ?? 0), 0),
        tss: acts.reduce((s, a) => s + estimateTSS(a, settings), 0),
        bySport: [...bySportHours.entries()]
          .map(([sport, hours]) => ({ sport, label: SPORT_META[sport].label, color: SPORT_META[sport].color, hours }))
          .sort((a, b) => b.hours - a.hours),
      }
    })

    const monthly = MONTHS.map((month, mi) => {
      const row: Record<string, string | number> = { month }
      for (const year of years) {
        row[String(year)] = +(
          activities
            .filter(a => +a.startTime.slice(0, 4) === year && +a.startTime.slice(5, 7) === mi + 1)
            .reduce((s, a) => s + a.duration, 0) / 3600
        ).toFixed(1)
      }
      return row
    })

    // Cumulative hours sampled weekly, so the lines stay readable.
    const cumulative: Record<string, string | number>[] = []
    const running: Record<number, number> = Object.fromEntries(years.map(y => [y, 0]))
    const todayDoy = Math.floor((now.getTime() - new Date(thisYear, 0, 1).getTime()) / dayMs)
    for (let doy = 0; doy < 366; doy += 7) {
      const row: Record<string, string | number> = {
        doy,
        label: new Date(2024, 0, 1 + doy).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      }
      for (const year of years) {
        const start = new Date(year, 0, 1).getTime()
        running[year] += activities
          .filter(a => {
            const t = new Date(a.startTime).getTime()
            return t >= start + doy * dayMs && t < start + (doy + 7) * dayMs
          })
          .reduce((s, a) => s + a.duration, 0) / 3600
        // Don't draw the current year past today — it would nosedive to a flat line.
        row[String(year)] = year === thisYear && doy > todayDoy ? (null as unknown as number) : +running[year].toFixed(1)
      }
      cumulative.push(row)
    }

    const sameWindow = (year: number) => {
      const start = new Date(year, 0, 1).getTime()
      const end = new Date(year, now.getMonth(), now.getDate(), 23, 59, 59).getTime()
      const acts = activities.filter(a => {
        const t = new Date(a.startTime).getTime()
        return t >= start && t <= end
      })
      return {
        hours: acts.reduce((s, a) => s + a.duration, 0) / 3600,
        sessions: acts.length,
        distance: acts.reduce((s, a) => s + a.distance, 0),
      }
    }

    return { years, totals, monthly, cumulative, ytd: sameWindow(thisYear), ytdPrev: sameWindow(thisYear - 1) }
  }, [activities, settings, maxYears])
}

// ─── Consistency heatmap ──────────────────────────────────────────────────────

export interface HeatDay {
  date: string
  weekIndex: number
  weekday: number   // 0 = Monday
  tss: number
  minutes: number
  count: number
  level: 0 | 1 | 2 | 3 | 4
}

export interface HeatmapData {
  days: HeatDay[]
  weeks: number
  monthTicks: { weekIndex: number; label: string }[]
  activeDays: number
  totalDays: number
  longestStreak: number
  currentStreak: number
}

export function useConsistencyHeatmap(windowDays = 364): HeatmapData {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const byDate = new Map<string, { tss: number; minutes: number; count: number }>()
    for (const a of activities) {
      const key = a.startTime.slice(0, 10)
      const cur = byDate.get(key) ?? { tss: 0, minutes: 0, count: 0 }
      cur.tss += estimateTSS(a, settings)
      cur.minutes += a.duration / 60
      cur.count += 1
      byDate.set(key, cur)
    }

    // Start on the Monday at or before the window start, so columns are weeks.
    const end = new Date()
    end.setHours(0, 0, 0, 0)
    const start = new Date(end.getTime() - windowDays * dayMs)
    const shift = start.getDay() === 0 ? 6 : start.getDay() - 1
    start.setDate(start.getDate() - shift)

    const days: HeatDay[] = []
    const monthTicks: { weekIndex: number; label: string }[] = []
    let seenMonth = -1

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const weekIndex = Math.floor((d.getTime() - start.getTime()) / (7 * dayMs))
      const weekday = d.getDay() === 0 ? 6 : d.getDay() - 1
      const hit = byDate.get(date)
      const tss = hit?.tss ?? 0
      const level: HeatDay['level'] = tss === 0 ? 0 : tss < 30 ? 1 : tss < 60 ? 2 : tss < 100 ? 3 : 4

      if (d.getMonth() !== seenMonth && weekday === 0) {
        seenMonth = d.getMonth()
        monthTicks.push({ weekIndex, label: MONTHS[seenMonth] })
      }
      days.push({ date, weekIndex, weekday, tss: Math.round(tss), minutes: Math.round(hit?.minutes ?? 0), count: hit?.count ?? 0, level })
    }

    let longestStreak = 0
    let run = 0
    for (const d of days) {
      if (d.count > 0) { run++; longestStreak = Math.max(longestStreak, run) } else run = 0
    }
    let currentStreak = 0
    for (let i = days.length - 1; i >= 0 && days[i].count > 0; i--) currentStreak++

    const activeDays = days.filter(d => d.count > 0).length
    return {
      days,
      weeks: (days.at(-1)?.weekIndex ?? 0) + 1,
      monthTicks,
      activeDays,
      totalDays: days.length,
      longestStreak,
      currentStreak,
    }
  }, [activities, settings, windowDays])
}

// ─── When do you train ────────────────────────────────────────────────────────

export interface PatternData {
  byWeekday: { day: string; sessions: number; hours: number }[]
  byHour: { hour: string; sessions: number }[]
  durationBuckets: { bucket: string; sessions: number }[]
  peakHour: string
  peakDay: string
}

const DAYS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']

export function useTrainingPatterns(sport?: Sport): PatternData {
  const activities = useActivityStore(s => s.activities)

  return useMemo(() => {
    const acts: ActivitySummary[] = sport ? activities.filter(a => a.sport === sport) : activities

    const byWeekday = DAYS.map((day, i) => {
      const rows = acts.filter(a => {
        const wd = new Date(a.startTime).getDay()
        return (wd === 0 ? 6 : wd - 1) === i
      })
      return { day, sessions: rows.length, hours: +(rows.reduce((s, a) => s + a.duration, 0) / 3600).toFixed(1) }
    })

    const byHour = Array.from({ length: 24 }, (_, h) => ({
      hour: `${String(h).padStart(2, '0')}h`,
      sessions: acts.filter(a => +a.startTime.slice(11, 13) === h).length,
    }))

    const BUCKETS: [string, number, number][] = [
      ['<30 min', 0, 30], ['30-45', 30, 45], ['45-60', 45, 60],
      ['1-1.5 h', 60, 90], ['1.5-2 h', 90, 120], ['2-3 h', 120, 180], ['>3 h', 180, Infinity],
    ]
    const durationBuckets = BUCKETS.map(([bucket, lo, hi]) => ({
      bucket,
      sessions: acts.filter(a => a.duration / 60 >= lo && a.duration / 60 < hi).length,
    }))

    const peak = byHour.reduce((a, b) => (b.sessions > a.sessions ? b : a), byHour[0])
    const peakD = byWeekday.reduce((a, b) => (b.sessions > a.sessions ? b : a), byWeekday[0])
    return { byWeekday, byHour, durationBuckets, peakHour: peak.hour, peakDay: peakD.day }
  }, [activities, sport])
}

// ─── Acute:chronic workload ratio ─────────────────────────────────────────────

export interface ACWRPoint { date: string; acute: number; chronic: number; ratio: number }

export interface ACWRData {
  series: ACWRPoint[]
  current: number
  acute: number
  chronic: number
  zone: 'low' | 'safe' | 'high' | 'danger'
  label: string
  advice: string
  color: string
}

export function useACWR(windowDays = 120): ACWRData {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const daily = new Map<string, number>()
    for (const a of activities) {
      const k = a.startTime.slice(0, 10)
      daily.set(k, (daily.get(k) ?? 0) + estimateTSS(a, settings))
    }

    const end = new Date(); end.setHours(0, 0, 0, 0)
    const series: ACWRPoint[] = []
    for (let i = windowDays - 1; i >= 0; i--) {
      const day = new Date(end.getTime() - i * dayMs)
      const sumBack = (n: number) => {
        let total = 0
        for (let d = 0; d < n; d++) {
          const t = new Date(day.getTime() - d * dayMs)
          const k = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`
          total += daily.get(k) ?? 0
        }
        return total
      }
      const acute = sumBack(7)
      const chronic = sumBack(28) / 4   // 28-day load expressed as a weekly average
      series.push({
        date: `${String(day.getDate()).padStart(2, '0')}/${String(day.getMonth() + 1).padStart(2, '0')}`,
        acute: Math.round(acute),
        chronic: Math.round(chronic),
        ratio: chronic > 0 ? +(acute / chronic).toFixed(2) : 0,
      })
    }

    const last = series.at(-1) ?? { acute: 0, chronic: 0, ratio: 0, date: '' }
    const r = last.ratio
    const zone = r === 0 ? 'low' : r < 0.8 ? 'low' : r <= 1.3 ? 'safe' : r <= 1.5 ? 'high' : 'danger'
    const meta = {
      low:    { label: 'Carga baja',    color: '#38bdf8', advice: 'Estás entrenando por debajo de tu media del último mes. Sin riesgo, pero tampoco estás construyendo.' },
      safe:   { label: 'Zona óptima',   color: '#34d399', advice: 'Tu carga reciente está en línea con tu base. Es el rango donde se progresa con menor riesgo de lesión.' },
      high:   { label: 'Carga elevada', color: '#fbbf24', advice: 'Subiste el volumen bastante por encima de tu media. Sostenible poco tiempo; vigilá molestias.' },
      danger: { label: 'Salto brusco',  color: '#f87171', advice: 'Tu semana supera con mucho tu base de 4 semanas. Es el patrón más asociado a lesiones por sobrecarga.' },
    }[zone]

    return { series, current: r, acute: last.acute, chronic: last.chronic, zone, ...meta }
  }, [activities, settings, windowDays])
}
