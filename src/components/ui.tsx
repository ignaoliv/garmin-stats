import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'

/**
 * Turn a raw fetch failure into something the user can act on.
 *
 * These endpoints live in the Vite dev server, so the common failure is simply
 * that it is not running — and "Failed to fetch" says nothing about that.
 */
export function explicarError(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e)
  if (/failed to fetch|networkerror|load failed/i.test(m)) {
    return 'No se pudo conectar con el servidor. Verificá que "npm run dev" esté corriendo; ' +
           'si lo iniciaste antes de la última actualización, reinicialo para que tome los endpoints nuevos.'
  }
  if (/429|rate.?limit/i.test(m)) {
    return 'Garmin está limitando la cuenta por demasiadas conexiones seguidas. Esperá unos minutos y reintentá.'
  }
  return m
}

/** Panel surface. One border, one radius, no glow — everything sits on this. */
export function Card({ children, className = '', id }: { children: ReactNode; className?: string; id?: string }) {
  return (
    <section id={id} className={`glass rounded-2xl ${className}`}>
      {children}
    </section>
  )
}

/**
 * Section title. 13px at ~72% lightness clears WCAG AA on the card surface;
 * the old 12px slate-500 did not.
 */
export function CardHeader({
  title,
  hint,
  action,
}: {
  title: string
  hint?: string
  action?: { to: string; label: string }
}) {
  return (
    <div className="flex items-baseline justify-between gap-4 mb-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-primary leading-tight">{title}</h2>
        {hint && <p className="text-[13px] text-ink-muted mt-0.5">{hint}</p>}
      </div>
      {action && (
        <Link
          to={action.to}
          className="text-[13px] font-medium text-accent hover:text-accent-soft shrink-0 whitespace-nowrap"
        >
          {action.label}
        </Link>
      )}
    </div>
  )
}

/**
 * A single number that has to be read at a glance. The label is a real 13px
 * sentence rather than 11px letter-spaced caps, which is what made the old
 * tiles hard to scan.
 */
export function StatTile({
  label,
  value,
  unit,
  delta,
  deltaUnit = '',
  hint,
  accent,
}: {
  label: string
  value: string
  unit?: string
  delta?: number
  deltaUnit?: string
  hint?: string
  accent?: string
}) {
  return (
    <div className="bg-surface-card border border-surface-line rounded-xl px-4 py-3.5">
      <div className="flex items-center gap-2 mb-1.5">
        {accent && <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: accent }} />}
        <span className="text-[13px] font-medium text-ink-muted">{label}</span>
      </div>
      <div className="text-[28px] leading-none font-bold text-ink-primary tabular-nums">
        {value}
        {unit && <span className="text-[15px] font-medium text-ink-muted ml-1">{unit}</span>}
      </div>
      {delta !== undefined && <Delta value={delta} unit={deltaUnit} />}
      {hint && !delta && <div className="text-[13px] text-ink-muted mt-1.5">{hint}</div>}
    </div>
  )
}

/** Change vs. the previous period. Arrow + sign, so it is never colour-alone. */
export function Delta({ value, unit = '' }: { value: number; unit?: string }) {
  const flat = Math.abs(value) < 0.05
  const color = flat ? '#94a3b8' : value > 0 ? '#34d399' : '#f87171'
  const arrow = flat ? '=' : value > 0 ? '▲' : '▼'
  const abs = Math.abs(value)
  const text = flat
    ? 'igual que la semana pasada'
    : `${arrow} ${abs >= 10 ? Math.round(abs).toLocaleString('es-ES') : abs.toFixed(1)}${unit}`
  return (
    <div className="text-[13px] mt-1.5 font-medium tabular-nums" style={{ color }}>
      {text}
    </div>
  )
}

/** Legend swatch. Present whenever ≥2 series share a chart. */
export function LegendItem({ color, label, value }: { color: string; label: string; value?: string }) {
  return (
    <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
      <span className="w-3 h-3 rounded-[3px] shrink-0" style={{ background: color }} />
      {label}
      {value && <span className="text-ink-muted tabular-nums">{value}</span>}
    </span>
  )
}

/** Shared Recharts tooltip. Values keep ink colours; the swatch carries identity. */
export function ChartTooltip({
  active,
  payload,
  label,
  formatter,
}: {
  active?: boolean
  payload?: { name?: string; value?: number | string; color?: string; payload?: Record<string, unknown> }[]
  label?: string | number
  formatter?: (value: number | string, name: string, row?: Record<string, unknown>) => string
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="bg-surface-overlay border border-surface-line-strong rounded-lg px-3 py-2 shadow-xl">
      {label !== undefined && label !== '' && (
        <div className="text-[13px] font-semibold text-ink-primary mb-1.5">{String(label)}</div>
      )}
      <div className="space-y-1">
        {payload.map((p, i) => (
          <div key={i} className="flex items-center gap-2 text-[13px] whitespace-nowrap">
            <span className="w-2.5 h-2.5 rounded-[2px] shrink-0" style={{ background: p.color }} />
            <span className="text-ink-secondary">{p.name}</span>
            <span className="text-ink-primary font-semibold tabular-nums ml-auto">
              {formatter ? formatter(p.value ?? 0, p.name ?? '', p.payload) : String(p.value)}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

/** Explains what a number means, in words, under the chart that shows it. */
export function Insight({ tone, children }: { tone: 'good' | 'warning' | 'neutral'; children: ReactNode }) {
  const map = {
    good:    { color: '#34d399', icon: '✓' },
    warning: { color: '#fbbf24', icon: '!' },
    neutral: { color: '#94a3b8', icon: 'i' },
  }[tone]
  return (
    <div className="flex items-start gap-2 text-[13px] leading-relaxed" style={{ color: map.color }}>
      <span
        className="shrink-0 w-4 h-4 rounded-full border flex items-center justify-center text-[10px] font-bold mt-0.5"
        style={{ borderColor: map.color }}
      >
        {map.icon}
      </span>
      <span>{children}</span>
    </div>
  )
}
