import type { Sport } from '../types/garmin'

export function formatPace(secPerKm: number | null): string {
  if (!secPerKm) return '–'
  const m = Math.floor(secPerKm / 60)
  const s = Math.round(secPerKm % 60)
  return `${m}:${String(s).padStart(2, '0')} /km`
}

export function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = Math.round(seconds % 60)
  if (h > 0) return `${h}h ${String(m).padStart(2, '0')}m`
  return `${m}:${String(s).padStart(2, '0')}`
}

export function formatDistance(km: number, sport: Sport): string {
  if (sport === 'swimming') {
    const m = Math.round(km * 1000)
    return m >= 1000 ? `${(m / 1000).toFixed(2)} km` : `${m} m`
  }
  return `${km.toFixed(2)} km`
}

export function formatElevation(m: number): string {
  return `${Math.round(m)} m`
}

export function formatDate(isoString: string): string {
  const d = new Date(isoString)
  return d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
}

export function formatShortDate(isoString: string): string {
  const d = new Date(isoString.slice(0, 10) + 'T00:00:00')
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })
}

export function formatRelativeTime(isoString: string): string {
  const now = new Date()
  const d = new Date(isoString)
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (days === 0) return 'Hoy'
  if (days === 1) return 'Ayer'
  if (days < 7) return `Hace ${days} días`
  if (days < 30) return `Hace ${Math.floor(days / 7)} sem.`
  if (days < 365) return `Hace ${Math.floor(days / 30)} meses`
  return `Hace ${Math.floor(days / 365)} años`
}

// Sport naming/colour lives in sports.ts (single source of truth for the taxonomy).
export { sportLabel, sportIcon, sportColor } from './sports'
