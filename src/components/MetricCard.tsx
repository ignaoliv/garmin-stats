interface MetricCardProps {
  label: string
  value: string | number
  unit?: string
  sub?: string
  color?: string
  large?: boolean
}

export default function MetricCard({ label, value, unit, sub, color, large }: MetricCardProps) {
  return (
    <div className="bg-surface-card border border-surface-line rounded-xl p-4 flex flex-col gap-1">
      <div className="text-[13px] text-ink-muted uppercase tracking-wider">{label}</div>
      <div className={`font-bold tabular-nums leading-none ${large ? 'text-4xl' : 'text-2xl'}`} style={color ? { color } : {}}>
        {value}
        {unit && <span className="text-[14px] font-normal text-ink-secondary ml-1">{unit}</span>}
      </div>
      {sub && <div className="text-[13px] text-ink-muted mt-0.5">{sub}</div>}
    </div>
  )
}
