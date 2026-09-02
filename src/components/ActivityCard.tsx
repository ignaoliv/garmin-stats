import { Link } from 'react-router-dom'
import type { ActivitySummary } from '../types/garmin'
import { formatPace, formatDuration, formatDistance, formatRelativeTime, sportLabel, sportColor, sportIcon } from '../utils/formatters'

interface Props {
  activity: ActivitySummary
  compact?: boolean
}

export default function ActivityCard({ activity: a, compact }: Props) {
  const color = sportColor(a.sport)

  return (
    <Link
      to={`/activity/${a.id}`}
      className="block bg-[#172033] border border-[#28334a] rounded-xl p-4 hover:border-[#3a4767] hover:bg-[#172033] transition-colors"
    >
      {/* Header row */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{sportIcon(a.sport)}</span>
        <div className="flex-1 min-w-0">
          <div className="text-[14px] font-medium text-[#f1f5f9] truncate">{a.title}</div>
          <div className="text-[13px] text-[#94a3b8]">{formatRelativeTime(a.startTime)} · {sportLabel(a.sport)}</div>
        </div>
        {a.aerobicTE != null && (
          <div className="text-[13px] px-2 py-0.5 rounded-full border" style={{ color, borderColor: color + '40', background: color + '15' }}>
            TE {a.aerobicTE.toFixed(1)}
          </div>
        )}
      </div>

      {/* Main metrics */}
      <div className="grid grid-cols-3 gap-2 mt-3">
        <Metric label="Distancia" value={formatDistance(a.distance, a.sport)} />
        <Metric label="Duración" value={formatDuration(a.duration)} />
        {a.sport === 'running' && a.avgPace
          ? <Metric label="Ritmo" value={formatPace(a.avgPace)} />
          : a.sport === 'cycling' && a.avgSpeed
          ? <Metric label="Velocidad" value={`${a.avgSpeed} km/h`} />
          : a.sport === 'swimming' && a.swolf
          ? <Metric label="SWOLF" value={String(Math.round(a.swolf))} />
          : <Metric label="FC Media" value={a.avgHR > 0 ? `${a.avgHR} bpm` : '–'} />
        }
      </div>

      {!compact && (
        <div className="grid grid-cols-3 gap-2 mt-2">
          <Metric label="FC Media" value={a.avgHR > 0 ? `${a.avgHR} bpm` : '–'} />
          <Metric label="Elevación" value={`${a.elevationGain} m`} />
          <Metric label="TSS" value={a.tss != null ? String(Math.round(a.tss)) : '–'} />
        </div>
      )}
    </Link>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[13px] text-[#94a3b8]">{label}</div>
      <div className="text-[14px] font-medium text-[#f1f5f9]">{value}</div>
    </div>
  )
}
