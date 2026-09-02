import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { estimateZonesFromHR, HR_ZONE_DEFS } from '../utils/calculations'
import { isoDateOffset } from '../utils/date'
import type { Sport } from '../types/garmin'

export interface ZoneSlice {
  zone: string
  pct: number
  hours: number
  color: string
}

export interface ZoneDistributionData {
  slices: ZoneSlice[]
  isAerobicFocused: boolean
  /** Sessions that had no real zone data and fell back to the estimate. */
  estimadas: number
}

export function useZoneDistribution(windowDays = 30, sport: Sport | 'all' = 'all'): ZoneDistributionData {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const cutoff = isoDateOffset(windowDays)
    const recent = activities.filter(a =>
      a.startTime.slice(0, 10) >= cutoff &&
      (sport === 'all' || a.sport === sport)
    )

    const totals = [0, 0, 0, 0, 0]
    let estimadas = 0
    for (const a of recent) {
      // Garmin's own per-zone seconds when the sync captured them. The estimate
      // below drops the entire session into a single zone based on average
      // heart rate, which turns an interval workout into one flat block.
      if (a.zonasFC && a.zonasFC.length === 5 && a.zonasFC.some(s => s > 0)) {
        a.zonasFC.forEach((s, i) => { totals[i] += s / 3600 })
      } else {
        estimateZonesFromHR(a.avgHR, a.duration, settings.maxHR)
          .forEach(z => { totals[z.zone - 1] += z.seconds / 3600 })
        estimadas++
      }
    }

    const total = totals.reduce((s, v) => s + v, 0) || 1
    const slices = HR_ZONE_DEFS.map((z, i) => ({
      zone: z.name,
      pct: Math.round(totals[i] / total * 100),
      hours: +totals[i].toFixed(2),
      color: z.color,
    }))

    const aerobicPct = slices[0].pct + slices[1].pct
    return { slices, isAerobicFocused: aerobicPct >= 60, estimadas }
  }, [activities, settings.maxHR, windowDays, sport])
}
