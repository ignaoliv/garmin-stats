import { useState, useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { Sport } from '../types/garmin'
import ActivityCard from '../components/ActivityCard'

const SPORTS: { value: Sport | 'all'; label: string }[] = [
  { value: 'all', label: 'Todos' },
  { value: 'running', label: '🏃 Running' },
  { value: 'cycling', label: '🚴 Ciclismo' },
  { value: 'swimming', label: '🏊 Natación' },
  { value: 'other', label: '⚡ Otro' },
]

export default function Activities() {
  const activities = useActivityStore(s => s.activities)
  const [sportFilter, setSportFilter] = useState<Sport | 'all'>('all')
  const [yearFilter, setYearFilter] = useState<string>('all')
  const [page, setPage] = useState(0)

  const PAGE_SIZE = 20

  const years = useMemo(() => {
    const ys = new Set(activities.map(a => a.startTime.slice(0, 4)))
    return ['all', ...Array.from(ys).sort().reverse()]
  }, [activities])

  const filtered = useMemo(() => {
    return activities.filter(a => {
      if (sportFilter !== 'all' && a.sport !== sportFilter) return false
      if (yearFilter !== 'all' && !a.startTime.startsWith(yearFilter)) return false
      return true
    })
  }, [activities, sportFilter, yearFilter])

  const paginated = filtered.slice(0, (page + 1) * PAGE_SIZE)
  const hasMore = paginated.length < filtered.length

  return (
    <div className="flex-1 p-6 overflow-y-auto page-in">
      <h1 className="text-xl font-bold text-ink-primary mb-4">Actividades</h1>

      {/* Filters */}
      <div className="flex gap-3 mb-6 flex-wrap">
        <div className="flex bg-surface-card rounded-lg p-0.5 gap-0.5">
          {SPORTS.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => { setSportFilter(value); setPage(0) }}
              className={`px-3 py-1.5 rounded-md text-[14px] transition-colors ${
                sportFilter === value
                  ? 'bg-blue-600 text-white'
                  : 'text-ink-secondary hover:text-ink-primary'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        <select
          value={yearFilter}
          onChange={e => { setYearFilter(e.target.value); setPage(0) }}
          className="bg-surface-card border border-surface-line rounded-lg px-3 py-1.5 text-[14px] text-ink-secondary"
        >
          {years.map(y => (
            <option key={y} value={y}>{y === 'all' ? 'Todos los años' : y}</option>
          ))}
        </select>

        <div className="text-[14px] text-ink-muted self-center">
          {filtered.length} actividades
        </div>
      </div>

      {/* List */}
      <div className="space-y-3">
        {paginated.map(a => (
          <ActivityCard key={a.id} activity={a} />
        ))}
      </div>

      {hasMore && (
        <button
          onClick={() => setPage(p => p + 1)}
          className="mt-6 w-full py-3 rounded-xl border border-surface-line text-ink-secondary hover:text-ink-primary hover:border-surface-line-strong transition-colors text-[14px]"
        >
          Cargar más ({filtered.length - paginated.length} restantes)
        </button>
      )}

      {filtered.length === 0 && (
        <div className="text-center py-16 text-ink-muted">
          No hay actividades con estos filtros.
        </div>
      )}
    </div>
  )
}
