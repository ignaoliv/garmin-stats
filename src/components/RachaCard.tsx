import { useState } from 'react'
import { Card, CardHeader } from './ui'
import { useRacha } from '../hooks/useRacha'
import { sportColor, sportIcon, sportLabel } from '../utils/sports'

const LETRAS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/**
 * La racha de semanas y el mes de un vistazo.
 *
 * La idea es de Strava y está bien resuelta: la racha se cuenta por SEMANAS,
 * no por días. Por días, cualquiera que descanse martes y jueves —o sea,
 * cualquiera que entrene en serio— queda en racha 1 para siempre y el número
 * deja de decir nada. Por semanas mide lo que uno quiere sostener de verdad:
 * no faltar una semana entera.
 *
 * El calendario no dibuja intensidad, sólo presencia y de qué deporte. Para la
 * carga ya está el mapa de constancia, que colorea por TSS; acá lo que importa
 * es la forma del mes — dónde están los huecos y qué días se repiten.
 */
export default function RachaCard({ compacto = false }: { compacto?: boolean }) {
  const [offset, setOffset] = useState(0)
  const r = useRacha(offset)

  if (!r.cargado) return null

  return (
    <Card className="p-5">
      <CardHeader
        title="Tu racha"
        hint={r.semanas > 0
          ? `${r.semanas} ${r.semanas === 1 ? 'semana seguida' : 'semanas seguidas'} entrenando`
          : 'Todavía sin racha en curso'}
      />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-5">
        <div>
          <div className="label mb-1">Semanas seguidas</div>
          <div className="metric-lg" style={{ color: 'var(--color-accent)' }}>
            {r.semanas}
          </div>
        </div>
        <div>
          <div className="label mb-1">Sesiones en la racha</div>
          <div className="metric">{r.sesiones}</div>
        </div>
        {r.mejorSemanas > 0 && (
          <div>
            <div className="label mb-1">Tu mejor racha</div>
            <div className="metric">{r.mejorSemanas}</div>
            <div className="label-plain mt-0.5">
              {r.semanas >= r.mejorSemanas ? 'la estás igualando' : 'semanas'}
            </div>
          </div>
        )}
      </div>

      {/* ── El mes ───────────────────────────────────────────────────────── */}
      <div className="max-w-[360px]">
      <div className="flex items-center justify-between mb-2.5">
        <span className="text-[15px] font-medium text-ink-primary first-letter:uppercase">{r.mes}</span>
        <div className="flex items-center gap-1">
          <button onClick={() => setOffset(o => o - 1)} aria-label="Mes anterior"
            className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover">‹</button>
          <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset >= 0}
            aria-label="Mes siguiente"
            className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover
                       disabled:opacity-30">›</button>
        </div>
      </div>

      <div className="grid grid-cols-7 gap-1">
        {LETRAS.map((l, i) => (
          <div key={i} className="text-center text-[11px] text-ink-muted pb-0.5">{l}</div>
        ))}

        {r.grilla.map(d => {
          const principal = d.deportes[0]
          const activo = d.sesiones > 0
          return (
            <div
              key={d.fecha}
              title={activo
                ? `${d.fecha}: ${d.deportes.map(sportLabel).join(', ')}`
                : d.fecha}
              className={`aspect-square rounded-full flex items-center justify-center relative
                          text-[12px] tabular-nums transition-colors ${
                d.deOtroMes ? 'opacity-25' : ''
              } ${
                activo ? 'font-semibold' : d.esFuturo ? 'text-ink-faint' : 'text-ink-muted'
              }`}
              style={activo ? {
                background: `${sportColor(principal)}26`,
                border: `1.5px solid ${sportColor(principal)}`,
                color: sportColor(principal),
              } : {
                border: `1px solid ${d.esHoy ? 'var(--color-accent)' : 'transparent'}`,
              }}
            >
              {activo
                ? <span className="text-[13px] leading-none">{sportIcon(principal)}</span>
                : d.dia}
              {/* Más de una sesión en el día: un punto, como hace Strava. */}
              {d.sesiones > 1 && (
                <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full"
                  style={{ background: sportColor(principal) }} />
              )}
            </div>
          )
        })}
      </div>

      </div>

      {!compacto && (
        <p className="label-plain mt-3">
          {r.diasActivos} {r.diasActivos === 1 ? 'día' : 'días'} con actividad en el mes.
          El punto marca los días con más de una sesión.
        </p>
      )}
    </Card>
  )
}
