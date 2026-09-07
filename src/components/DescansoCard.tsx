import { Link } from 'react-router-dom'
import {
  AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { useDescanso } from '../hooks/useDescanso'
import { Card, CardHeader, Insight, ChartTooltip } from './ui'
import Ring from './Ring'
import Icon from './Icon'

const TONO = {
  bien:        'var(--color-state-good)',
  atencion:    'var(--color-state-warning)',
  alerta:      'var(--color-state-critical)',
  'sin-datos': 'var(--color-ink-muted)',
} as const

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const FC = 'var(--color-metric-fc)'

const h = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`

/**
 * Recovery on the main screen.
 *
 * Built around resting heart rate rather than sleep on purpose: sleep is
 * recorded on a small fraction of nights here, so a card that led with it would
 * be empty most days. Resting HR is measured almost daily and its direction is
 * the classic recovery signal, so it carries the headline and sleep appears
 * alongside when there is a recent night.
 */
export default function DescansoCard() {
  const d = useDescanso()
  if (!d.cargado || d.estado === 'sin-datos') return null

  const color = TONO[d.estado]
  const nocheReciente = d.ultimaNoche && d.diasDesdeUltimaNoche !== null && d.diasDesdeUltimaNoche <= 2

  return (
    <Card className="p-5">
      <CardHeader
        title="Descanso"
        hint="Cómo venís recuperando · últimas 2 semanas"
        action={{ to: '/salud', label: 'Ver sueño →' }}
      />

      <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
        <div className="flex items-center gap-5">
          {nocheReciente && d.ultimaNoche?.puntaje !== null && d.ultimaNoche ? (
            <Ring
              pct={d.ultimaNoche.puntaje ?? 0}
              color={color}
              size={104}
              grosor={9}
              etiqueta={`Puntaje de sueño ${d.ultimaNoche.puntaje} de 100`}
            >
              <div className="metric" style={{ color }}>{d.ultimaNoche.puntaje}</div>
              <div className="label-plain mt-1 text-[11.5px]">sueño</div>
            </Ring>
          ) : (
            <div className="w-[104px] h-[104px] rounded-full grid place-items-center shrink-0"
              style={{ border: `2px dashed color-mix(in oklab, ${color} 35%, transparent)` }}>
              <div className="text-center px-3">
                <Icon name="sueno" size={20} className="mx-auto mb-1 text-ink-faint" />
                <div className="text-[11px] text-ink-faint leading-tight">
                  {d.diasDesdeUltimaNoche !== null ? `hace ${d.diasDesdeUltimaNoche} días` : 'sin registro'}
                </div>
              </div>
            </div>
          )}

          <div className="space-y-3">
            <div>
              <div className="label mb-1">FC en reposo</div>
              <div className="metric-lg">
                {d.fcReposo?.toFixed(0)}<span className="metric-unit">ppm</span>
              </div>
            </div>
            {d.bateriaMax !== null && (
              <div>
                <div className="label mb-1">Body battery</div>
                <div className="metric">{d.bateriaMax.toFixed(0)}<span className="metric-unit">máx</span></div>
              </div>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center gap-2 mb-1.5">
            <span className="w-2 h-2 rounded-full shrink-0" style={{ background: color }} />
            <span className="text-[14px] font-medium" style={{ color }}>{d.titular}</span>
          </div>
          <p className="text-[14.5px] text-ink-secondary leading-relaxed">{d.detalle}</p>

          {!nocheReciente && (
            <div className="mt-4">
              <Insight tone="neutral">
                {d.diasDesdeUltimaNoche === null
                  ? 'Todavía no hay ninguna noche registrada: el sueño sólo se mide durmiendo con el reloj.'
                  : `La última noche medida fue hace ${d.diasDesdeUltimaNoche} días${d.ultimaNoche ? ` (${h(d.ultimaNoche.total_s)})` : ''}. El sueño sólo se registra durmiendo con el reloj puesto.`}
              </Insight>
            </div>
          )}

          {d.estres !== null && (
            <p className="label-plain mt-3">
              Estrés medio {d.estres.toFixed(0)} sobre 100 en el mismo período.
            </p>
          )}
        </div>
      </div>

      {d.serieFC.some(p => p.media7 !== null) && (
        <div className="mt-5 pt-4 border-t border-white/[0.06]">
          <div className="flex items-baseline justify-between mb-2">
            <span className="label">FC en reposo · últimos 90 días</span>
            <span className="text-[12px] text-ink-muted">
              menos pulsaciones es mejor
            </span>
          </div>

          <ResponsiveContainer width="100%" height={168}>
            <AreaChart data={d.serieFC} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
              <defs>
                <linearGradient id="gFC" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#1e9aad" stopOpacity={0.28} />
                  <stop offset="100%" stopColor="#1e9aad" stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={40} />
              {/* Sin cero forzado: entre 35 y 60 ppm, arrancar en cero aplasta
                  la curva y esconde justo lo que se viene a mirar. */}
              <YAxis domain={['dataMin - 3', 'dataMax + 3']} tick={AXIS} tickLine={false}
                axisLine={false} width={44} allowDecimals={false} unit=" " />
              <Tooltip
                cursor={{ stroke: GRID }}
                content={<ChartTooltip
                  formatter={(v, n) => `${Number(v).toFixed(n === 'Media de 7 días' ? 1 : 0)} ppm${
                    n === 'Media de 7 días' ? ' de media' : ''}`}
                />}
              />
              {d.fcReposoMedia !== null && (
                <ReferenceLine
                  y={d.fcReposoMedia}
                  stroke="#cbd5e1"
                  strokeDasharray="5 4"
                  strokeWidth={1.5}
                  label={{ value: `media ${d.fcReposoMedia.toFixed(0)}`, position: 'right',
                           fill: '#cbd5e1', fontSize: 11, dx: -6 }}
                />
              )}
              {/* El diario es el ruido y se queda como relleno: dibujarlo también
                  como línea daba dos trazos del mismo tono peleando, y no se
                  sabía cuál leer. La progresión es una sola línea. */}
              <Area type="monotone" dataKey="fc" name="FC del día" stroke="#1e9aad"
                strokeOpacity={0.18} strokeWidth={1} fill="url(#gFC)" connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
              <Line type="monotone" dataKey="media7" name="Media de 7 días" stroke={FC}
                strokeWidth={2.5} dot={false} connectNulls
                isAnimationActive animationDuration={650} animationEasing="ease-out" />
            </AreaChart>
          </ResponsiveContainer>

          <div className="flex flex-wrap gap-4 mt-2">
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-[2.5px] rounded-full" style={{ background: FC }} />
              Media de 7 días
            </span>
            <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
              <span className="w-4 h-2.5 rounded-[3px]"
                style={{ background: FC, opacity: 0.22 }} />
              Lectura de cada día
            </span>
          </div>
        </div>
      )}

      <p className="label-plain mt-4 pt-3 border-t border-white/[0.06]">
        <Link to="/salud" className="text-accent hover:text-accent-soft">Ver el detalle del sueño</Link>
        {' '}y qué mide tu dispositivo.
      </p>
    </Card>
  )
}
