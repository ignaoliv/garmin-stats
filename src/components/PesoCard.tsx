import {
  ComposedChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import { usePeso } from '../hooks/usePeso'
import { Card, CardHeader, ChartTooltip, Insight } from './ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const PESO = 'var(--color-sport-swimming)'

const fechaLarga = (f: string) => {
  const M = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre']
  const [a, m, d] = f.split('-').map(Number)
  return `${d} de ${M[m - 1]} de ${a}`
}

/**
 * La evolución del peso.
 *
 * El peso se registra salteado —acá van de una vez por día a una vez por mes—
 * así que la línea no puede tratarse como una serie continua. Los tramos sin
 * medir de más de mes y medio quedan cortados a propósito: unir los extremos
 * dibuja una subida gradual que nadie midió.
 */
export default function PesoCard() {
  const p = usePeso()
  if (!p.cargado || p.actual === null) return null

  const baja = (p.cambioUltimo ?? 0) < 0
  const dominio: [string, string] = ['dataMin - 1.5', 'dataMax + 1.5']

  return (
    <Card className="p-5">
      <CardHeader title="Peso" hint={`Última medición · ${fechaLarga(p.fechaActual!)}`} />

      <div className="flex flex-wrap items-end gap-x-8 gap-y-3 mb-4">
        <div>
          <div className="label mb-1">Hoy</div>
          <div className="metric-lg" style={{ color: PESO }}>
            {p.actual.toFixed(1)}<span className="metric-unit">kg</span>
          </div>
        </div>
        {p.cambioUltimo !== null && (
          <div>
            <div className="label mb-1">Desde la anterior</div>
            <div className="metric" style={{ color: baja ? 'var(--color-state-good)' : 'var(--color-ink-primary)' }}>
              {p.cambioUltimo > 0 ? '+' : ''}{p.cambioUltimo.toFixed(1)}
              <span className="metric-unit">kg</span>
            </div>
          </div>
        )}
        {p.minimo && (
          <div>
            <div className="label mb-1">Tu mínimo</div>
            <div className="metric">{p.minimo.kg.toFixed(1)}<span className="metric-unit">kg</span></div>
            <div className="label-plain mt-0.5 text-[12px]">{fechaLarga(p.minimo.fecha)}</div>
          </div>
        )}
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={p.serie} margin={{ top: 4, right: 10, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id="gPeso" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#9085e9" stopOpacity={0.22} />
              <stop offset="100%" stopColor="#9085e9" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={44} />
          {/* Sin cero forzado: entre 91 y 106 kg el cero deja una línea plana. */}
          <YAxis domain={dominio} tick={AXIS} tickLine={false} axisLine={false} width={44}
            tickFormatter={v => Number(v).toFixed(0)} />
          <Tooltip
            cursor={{ stroke: GRID }}
            content={<ChartTooltip formatter={(v, n) =>
              `${Number(v).toFixed(1)} kg${n === 'Tendencia' ? ' de tendencia' : ''}`} />}
          />
          {p.minimo && (
            <ReferenceLine y={p.minimo.kg} stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5}
              label={{ value: `mínimo ${p.minimo.kg.toFixed(0)}`, position: 'right',
                       fill: '#cbd5e1', fontSize: 11, dx: -6 }} />
          )}
          {/* connectNulls en false es lo que corta los tramos sin medir. */}
          <Area type="monotone" dataKey="kg" name="Peso" stroke={PESO} strokeWidth={2}
            fill="url(#gPeso)" connectNulls={false} dot={{ r: 2.5, fill: PESO, strokeWidth: 0 }}
            isAnimationActive animationDuration={650} animationEasing="ease-out" />
          <Line type="monotone" dataKey="suave" name="Tendencia" stroke="#cbd5e1" strokeWidth={1.5}
            strokeDasharray="4 3" dot={false} connectNulls={false}
            isAnimationActive animationDuration={650} animationEasing="ease-out" />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-4 h-[2px] rounded-full" style={{ background: PESO }} />
          Cada medición
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-4 h-[1.5px] rounded-full border-t border-dashed border-ink-secondary" />
          Tendencia de las últimas 5
        </span>
      </div>

      {p.huecos.length > 0 && (
        <div className="mt-4">
          <Insight tone="neutral">
            {p.huecos.length === 1 ? 'Hay un tramo sin medir' : `Hay ${p.huecos.length} tramos sin medir`}
            {' '}y la línea queda cortada ahí a propósito: unir los extremos dibujaría
            un cambio gradual que nadie registró. El más largo va del{' '}
            {fechaLarga(p.huecos[p.huecos.length - 1].desde)} al{' '}
            {fechaLarga(p.huecos[p.huecos.length - 1].hasta)}, con{' '}
            {p.huecos[p.huecos.length - 1].kg > 0 ? '+' : ''}
            {p.huecos[p.huecos.length - 1].kg} kg entre una punta y la otra.
          </Insight>
        </div>
      )}

      {!p.tieneComposicion && (
        <p className="label-plain mt-3">
          Sin grasa corporal ni masa muscular: eso lo mide una balanza inteligente,
          y estos registros están cargados a mano.
        </p>
      )}
    </Card>
  )
}
