import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'
import { formatPace, formatDuration } from '../utils/formatters'
import { computePRs } from '../utils/calculations'
import type { PR } from '../utils/calculations'

function PRTable({ title, prs, icon }: { title: string; prs: PR[]; icon: string }) {
  if (prs.length === 0) return null
  return (
    <div className="bg-[#172033] border border-[#28334a] rounded-xl p-4">
      <h2 className="text-[14px] font-medium text-[#f1f5f9] mb-4">{icon} {title}</h2>
      <table className="w-full text-[14px]">
        <thead>
          <tr className="text-left text-[13px] text-[#94a3b8] border-b border-[#28334a]">
            <th className="pb-2 pr-4">Distancia</th>
            <th className="pb-2 pr-4">Tiempo</th>
            <th className="pb-2 pr-4">Ritmo</th>
            <th className="pb-2">Fecha</th>
          </tr>
        </thead>
        <tbody>
          {prs.map(pr => (
            <tr key={pr.label} className="border-b border-[#28334a]/60 hover:bg-[#172033]">
              <td className="py-2.5 pr-4 font-medium text-[#f1f5f9]">{pr.label}</td>
              <td className="py-2.5 pr-4 font-mono text-[#f1f5f9]">{formatDuration(pr.duration)}</td>
              <td className="py-2.5 pr-4 font-mono text-[#cbd5e1]">{formatPace(pr.pace)}</td>
              <td className="py-2.5">
                <Link to={`/activity/${pr.activityId}`} className="text-[#fc5200] hover:text-[#ff7a3d]">
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
      <h1 className="text-xl font-bold text-[#f1f5f9] mb-1">Récords Personales</h1>
      <p className="text-[14px] text-[#94a3b8] mb-6">Mejores tiempos por distancia</p>

      {!hasAny ? (
        <div className="text-center py-16 text-[#94a3b8] text-[14px]">
          No hay suficientes datos para calcular récords.
        </div>
      ) : (
        <div className="space-y-4">
          <PRTable title="Running" icon="🏃" prs={personalRecords.running ?? []} />
          <PRTable title="Ciclismo" icon="🚴" prs={personalRecords.cycling ?? []} />
        </div>
      )}
    </div>
  )
}
