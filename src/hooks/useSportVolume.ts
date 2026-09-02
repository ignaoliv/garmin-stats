import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { isoDateOffset } from '../utils/date'
import { SPORTS, SPORT_META } from '../utils/sports'
import type { Sport } from '../types/garmin'

export interface SportVolume {
  sport: Sport
  label: string
  color: string
  hours: number
  count: number
  pct: number
}

export interface SportsVolumeData {
  /** Every tracked sport, biggest first, zero-volume ones dropped. */
  ranked: SportVolume[]
  bySport: Record<Sport, SportVolume>
  totalHours: number
  totalCount: number
}

export function useSportVolume(windowDays = 30): SportsVolumeData {
  const activities = useActivityStore(s => s.activities)

  return useMemo(() => {
    const cutoff = isoDateOffset(windowDays)
    const recent = activities.filter(a => a.startTime.slice(0, 10) >= cutoff)

    const all: Sport[] = [...SPORTS, 'other']
    const bySport = Object.fromEntries(
      all.map(s => [s, { sport: s, label: SPORT_META[s].label, color: SPORT_META[s].color, hours: 0, count: 0, pct: 0 }])
    ) as Record<Sport, SportVolume>

    for (const a of recent) {
      const bucket = bySport[a.sport] ?? bySport.other
      bucket.hours += a.duration / 3600
      bucket.count += 1
    }

    const totalHours = all.reduce((s, sp) => s + bySport[sp].hours, 0)
    for (const s of all) bySport[s].pct = totalHours > 0 ? (bySport[s].hours / totalHours) * 100 : 0

    const ranked = all
      .map(s => bySport[s])
      .filter(v => v.count > 0)
      .sort((a, b) => b.hours - a.hours)

    return { ranked, bySport, totalHours, totalCount: recent.length }
  }, [activities, windowDays])
}
