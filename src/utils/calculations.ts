import type { ActivitySummary, FitnessPoint, HRZone, UserSettings } from '../types/garmin'

// ─── TSS Estimation ─────────────────────────────────────────────────────────

/**
 * Estimates TSS for activities that don't have it from Garmin.
 * Uses TRIMP-derived method based on HR zones.
 */
export function estimateTSS(activity: ActivitySummary, settings: UserSettings): number {
  if (activity.tss != null) return activity.tss

  const durationHours = activity.movingTime / 3600
  const hrReserve = (activity.avgHR - 60) / (settings.maxHR - 60)

  // TRIMP exponential weighting
  const trimp = durationHours * 60 * hrReserve * 0.64 * Math.exp(1.92 * hrReserve)
  // Normalize: assume 100 TSS ≈ 1h at threshold (TRIMP ~100 at threshold)
  const thresholdHRReserve = (settings.lthrRunning - 60) / (settings.maxHR - 60)
  const thresholdTRIMP = 60 * thresholdHRReserve * 0.64 * Math.exp(1.92 * thresholdHRReserve)

  return Math.round((trimp / thresholdTRIMP) * 100)
}

// ─── CTL / ATL / TSB ────────────────────────────────────────────────────────

/**
 * Calculates the complete Fitness & Freshness time series.
 * CTL (Fitness) = 42-day EMA of daily TSS
 * ATL (Fatigue) = 7-day EMA of daily TSS
 * TSB (Form)    = CTL - ATL
 */
export function calculateFitnessHistory(
  activities: ActivitySummary[],
  settings: UserSettings
): FitnessPoint[] {
  if (activities.length === 0) return []

  // Build daily TSS map
  const dailyTSS: Record<string, number> = {}
  for (const act of activities) {
    const date = act.startTime.slice(0, 10)
    const tss = estimateTSS(act, settings)
    dailyTSS[date] = (dailyTSS[date] ?? 0) + tss
  }

  // Sort and fill date range
  const dates = Object.keys(dailyTSS).sort()
  if (dates.length === 0) return []

  const startDate = new Date(dates[0])
  const endDate = new Date()
  const allDates: string[] = []
  const d = new Date(startDate)
  while (d <= endDate) {
    allDates.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }

  // EMA calculation
  const ctlK = 2 / (42 + 1)  // 42-day EMA factor
  const atlK = 2 / (7 + 1)   // 7-day EMA factor

  let ctl = 0
  let atl = 0
  const points: FitnessPoint[] = []

  for (const date of allDates) {
    const tss = dailyTSS[date] ?? 0
    ctl = ctl + ctlK * (tss - ctl)
    atl = atl + atlK * (tss - atl)
    points.push({
      date,
      ctl: Math.round(ctl * 10) / 10,
      atl: Math.round(atl * 10) / 10,
      tsb: Math.round((ctl - atl) * 10) / 10,
      tss,
    })
  }

  return points
}

// ─── HR Zones ───────────────────────────────────────────────────────────────

export interface ZoneDef {
  zone: number
  name: string
  color: string
  minPct: number
  maxPct: number
}

export const HR_ZONE_DEFS: ZoneDef[] = [
  { zone: 1, name: 'Z1 Suave', color: '#38bdf8', minPct: 0, maxPct: 0.6 },
  { zone: 2, name: 'Z2 Aeróbico', color: '#34d399', minPct: 0.6, maxPct: 0.7 },
  { zone: 3, name: 'Z3 Tempo', color: '#fbbf24', minPct: 0.7, maxPct: 0.8 },
  { zone: 4, name: 'Z4 Umbral', color: '#fb923c', minPct: 0.8, maxPct: 0.9 },
  { zone: 5, name: 'Z5 Máximo', color: '#f87171', minPct: 0.9, maxPct: 1.0 },
]

export function getZoneBPM(maxHR: number): { zone: number; low: number; high: number }[] {
  return HR_ZONE_DEFS.map((z, i) => ({
    zone: z.zone,
    low: Math.round(maxHR * z.minPct),
    high: i === HR_ZONE_DEFS.length - 1 ? maxHR : Math.round(maxHR * z.maxPct),
  }))
}

export function hrZoneForBPM(bpm: number, maxHR: number): number {
  const pct = bpm / maxHR
  for (let i = HR_ZONE_DEFS.length - 1; i >= 0; i--) {
    if (pct >= HR_ZONE_DEFS[i].minPct) return i + 1
  }
  return 1
}

/**
 * Returns seconds spent in each zone for an activity that lacks zone data from Garmin.
 */
export function estimateZonesFromHR(
  avgHR: number,
  duration: number,
  maxHR: number
): HRZone[] {
  const zone = hrZoneForBPM(avgHR, maxHR)
  return HR_ZONE_DEFS.map((z) => ({
    zone: z.zone,
    name: z.name,
    seconds: z.zone === zone ? duration : 0,
    lowBPM: Math.round(maxHR * z.minPct),
    highBPM: Math.round(maxHR * z.maxPct),
  }))
}

// ─── Weekly / Monthly Aggregation ───────────────────────────────────────────

export interface WeekSummary {
  weekStart: string   // YYYY-MM-DD (Monday)
  totalTSS: number
  totalDistance: number
  totalDuration: number
  byType: Record<string, { distance: number; duration: number; count: number }>
}

export function aggregateByWeek(activities: ActivitySummary[], settings: UserSettings): WeekSummary[] {
  const weeks: Record<string, WeekSummary> = {}

  for (const act of activities) {
    const d = new Date(act.startTime)
    // Get Monday of this week
    const day = d.getDay()
    const diff = (day === 0 ? -6 : 1 - day)
    const monday = new Date(d)
    monday.setDate(d.getDate() + diff)
    // Build the key from LOCAL date parts. toISOString() converts to UTC, which
    // pushed evening activities onto the next day and split one week into two.
    const weekKey = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`

    if (!weeks[weekKey]) {
      weeks[weekKey] = {
        weekStart: weekKey,
        totalTSS: 0,
        totalDistance: 0,
        totalDuration: 0,
        byType: {},
      }
    }

    const w = weeks[weekKey]
    const tss = estimateTSS(act, settings)
    w.totalTSS += tss
    w.totalDistance += act.distance
    w.totalDuration += act.duration

    const sport = act.sport
    if (!w.byType[sport]) w.byType[sport] = { distance: 0, duration: 0, count: 0 }
    w.byType[sport].distance += act.distance
    w.byType[sport].duration += act.duration
    w.byType[sport].count += 1
  }

  return Object.values(weeks).sort((a, b) => a.weekStart.localeCompare(b.weekStart))
}

// ─── Personal Records ────────────────────────────────────────────────────────

export interface PR {
  distance: number   // km
  label: string
  activityId: number
  date: string
  pace: number       // sec/km
  duration: number   // seconds
}

const RUNNING_DISTANCES = [
  { km: 1, label: '1 km' },
  { km: 5, label: '5 km' },
  { km: 10, label: '10 km' },
  { km: 21.097, label: 'Half Marathon' },
  { km: 42.195, label: 'Marathon' },
]

const CYCLING_DISTANCES = [
  { km: 40, label: '40 km' },
  { km: 90, label: '90 km' },
  { km: 180, label: '180 km (Full IM)' },
]

export function computePRs(activities: ActivitySummary[]): Record<string, PR[]> {
  const running = activities.filter(a => a.sport === 'running')
  const cycling = activities.filter(a => a.sport === 'cycling')

  return {
    running: findPRsForSport(running, RUNNING_DISTANCES),
    cycling: findPRsForSport(cycling, CYCLING_DISTANCES),
  }
}

function findPRsForSport(
  activities: ActivitySummary[],
  distances: { km: number; label: string }[]
): PR[] {
  return distances.map(({ km, label }) => {
    const candidates = activities.filter(a => a.distance >= km * 0.95)
    if (candidates.length === 0) return null

    // Best pace for approximately this distance
    let best: PR | null = null
    for (const act of candidates) {
      if (!act.avgPace) continue
      const pace = act.avgPace
      if (!best || pace < best.pace) {
        best = {
          distance: km,
          label,
          activityId: act.id,
          date: act.startTime.slice(0, 10),
          pace,
          duration: Math.round(km * pace),
        }
      }
    }
    return best
  }).filter(Boolean) as PR[]
}
