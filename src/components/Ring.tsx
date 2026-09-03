import type { ReactNode } from 'react'

/**
 * Progress ring.
 *
 * Only for values that are progress toward a target — something with a real
 * zero and a 100% that means something. A value on a bipolar or banded scale
 * (training balance, acute:chronic ratio) belongs on a rail, where the zones
 * stay visible; a ring would have to invent a percentage it does not have.
 */
export default function Ring({
  pct,
  color,
  size = 120,
  grosor = 10,
  children,
  etiqueta,
}: {
  pct: number
  color: string
  size?: number
  grosor?: number
  children?: ReactNode
  etiqueta?: string
}) {
  const r = (size - grosor) / 2
  const c = 2 * Math.PI * r
  // Clamp so an overshoot (more steps than the goal) fills the ring instead of
  // wrapping past the start and reading as a smaller number.
  const p = Math.max(0, Math.min(100, pct))

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        className="-rotate-90"
        role="img"
        aria-label={etiqueta ?? `${Math.round(pct)} por ciento`}
      >
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke="var(--color-surface-line)" strokeWidth={grosor} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none"
          stroke={color} strokeWidth={grosor} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - p / 100)}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.22, 1, 0.36, 1)' }} />
      </svg>
      <div className="absolute inset-0 grid place-items-center">
        <div className="text-center leading-none">{children}</div>
      </div>
    </div>
  )
}
