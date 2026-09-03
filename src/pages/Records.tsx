import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'
import { formatPace, formatDuration } from '../utils/formatters'
import { computePRs } from '../utils/calculations'
import type { PR } from '../utils/calculations'

function PRTable({ title, prs, icon }: { title: string; prs: PR[]; icon: string }) {
  if (prs.length === 0) return null
  return (
    <div className="bg-surface-card border border-surface-line rounded-xl p-4">
      <h2 className="text-[14px] font-medium text-ink-primary mb-4">{icon} {title}</h2>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[13px] text-ink-muted border-b border-surface-line">
            <th className="pb-2 pr-4">Distancia</th>
            <th className="pb-2 pr-4">Tiempo</th>
            <th className="pb-2 pr-4">Ritmo</th>
            <th className="pb-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr key={pr.label} className="border-b border-surface-line/60 hover:bg-surface-card">
              <td className="py-2.5 pr-4 font-medium text-ink-primary">{pr.label}</td>
              <td className="py-2.5 pr-4 font-mono text-ink-primary">{formatDuration(pr.duration)}</td>
              <td className="py-2.5 pr-4 font-mono text-ink-secondary">{formatPace(pr.pace)}</td>
              <td className="py-2.5">
                <Link to={`/activity/${pr.activityId}`} className="text-accent hover:text-accent-soft">
                  {pr.date}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function Records() {
  const activities = useActivityStore(s => s.activities)
  const personalRecords = useMemo(() => computePRs(activities), [activities])
  const hasAny = Object.values(personalRecords).some(prs => prs.length > 0)

  return (
    <div className="flex-1 p-6 overflow-y-auto page-in">
      <h1 className="text-xl font-bold text-ink-primary mb-1">Récords Personales</h1>
      <p className="text-[14px] text-ink-muted mb-6">Mejores tiempos por distancia</p>

      {!hasAny ? (
        <div className="text-center py-16 text-ink-muted text-[14px]">
          No hay suficientes datos para calcular récords.
        </div>
      ) : (
        <div className="space-y-4">
          <PRTable title="Running" icon="" prs={personalRecords.running ?? []} />
          <PRTable title="Ciclismo" icon="" prs={personalRecords.cycling ?? []} />
        </div>
      )}
    </div>
  )
}
