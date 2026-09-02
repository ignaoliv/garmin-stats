import { useState } from 'react'
import type { HeatDay } from '../hooks/useTrainingInsights'

/** Load ramp: one hue, light → dark is inverted here (dark surface ⇒ dim → bright). */
const LEVEL_FILL = ['#1b2439', '#123f52', '#12657a', '#1a9bb0', '#38d0dd']
const LEVEL_LABEL = ['descanso', 'suave', 'moderado', 'fuerte', 'muy fuerte']
const DAY_LABELS = ['L', '', 'M', '', 'V', '', 'D']

export default function Heatmap({
  days,
  weeks,
  monthTicks,
  cell = 12,
  gap = 3,
}: {
  days: HeatDay[]
  weeks: number
  monthTicks: { weekIndex: number; label: string }[]
  cell?: number
  gap?: number
}) {
  const [hover, setHover] = useState<HeatDay | null>(null)
  const step = cell + gap
  const width = weeks * step
  const height = 7 * step

  return (
    <div className="relative">
      <div className="flex gap-2">
        {/* Weekday rail */}
        <div className="flex flex-col shrink-0" style={{ gap, paddingTop: 18 }}>
          {DAY_LABELS.map((d, i) => (
            <div key={i} className="text-[11px] text-[#94a3b8] leading-none flex items-center" style={{ height: cell }}>
              {d}
            </div>
          ))}
        </div>

        <div className="overflow-x-auto">
          <svg width={width} height={height + 18} role="img" aria-label="Constancia de entrenamiento del último año">
            {monthTicks.map(t => (
              <text key={`${t.weekIndex}-${t.label}`} x={t.weekIndex * step} y={11} fill="#94a3b8" fontSize={11}>
                {t.label}
              </text>
            ))}
            {days.map(d => (
              <rect
                key={d.date}
                x={d.weekIndex * step}
                y={18 + d.weekday * step}
                width={cell}
                height={cell}
                rx={2.5}
                fill={LEVEL_FILL[d.level]}
                stroke={hover?.date === d.date ? '#f1f5f9' : 'transparent'}
                strokeWidth={1.5}
                onMouseEnter={() => setHover(d)}
                onMouseLeave={() => setHover(null)}
                style={{ cursor: 'pointer' }}
              />
            ))}
          </svg>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 mt-3 flex-wrap">
        <div className="text-[13px] text-[#cbd5e1] min-h-[20px]">
          {hover ? (
            <>
              <strong className="text-[#f1f5f9]">
                {new Date(hover.date + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
              </strong>
              {hover.count > 0
                ? ` · ${hover.count} ${hover.count === 1 ? 'actividad' : 'actividades'} · ${hover.minutes} min · ${hover.tss} TSS`
                : ' · sin actividad'}
            </>
          ) : (
            <span className="text-[#94a3b8]">Pasá el mouse por un día para ver el detalle.</span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[12px] text-[#94a3b8] shrink-0">
          <span>menos</span>
          {LEVEL_FILL.map((c, i) => (
            <span key={c} title={LEVEL_LABEL[i]} className="w-3 h-3 rounded-[2px] inline-block" style={{ background: c }} />
          ))}
          <span>más</span>
        </div>
      </div>
    </div>
  )
}
