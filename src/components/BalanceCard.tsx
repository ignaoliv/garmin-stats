import {
  ComposedChart, Bar, Line, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts'
import { useCalorias } from '../hooks/useCalorias'
import { useComidas } from '../hooks/useComidas'
import { Card, CardHeader } from './ui'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const COMIDO = '#38bdf8'
const GASTADO = 'var(--color-sport-walking)'

const kcal = (v: number | null | undefined) =>
  v === null || v === undefined ? '—' : Math.round(v).toLocaleString('es-ES')

/**
 * Lo que entró contra lo que salió.
 *
 * LA REGLA QUE SOSTIENE TODO: un día sin comidas registradas NO es un día de
 * cero calorías, es un día sin datos. Contarlo como cero daría un déficit
 * enorme y falso justo los días que te olvidaste de cargar — que son
 * exactamente los días en que uno querría creerle al número.
 *
 * Por eso el balance sólo existe donde hay registro de comida, el acumulado
 * suma únicamente esos días, y la tarjeta dice cuántos son. Un acumulado de
 * tres días es un acumulado de tres días, no una semana.
 */
export default function BalanceCard() {
  const c = useCalorias()
  const { ultimosDias } = useComidas()

  if (!c.cargado || c.serie.length === 0) return null

  const comidoPorDia = new Map(ultimosDias.map(d => [d.fecha, d.kcal]))

  const serie = c.serie.slice(-7).map(d => {
    const comido = comidoPorDia.get(d.fecha) ?? null
    return {
      fecha: d.fecha,
      label: d.label,
      comido,
      gastado: d.total,
      balance: comido !== null && d.total !== null ? comido - d.total : null,
    }
  })

  const conAmbos = serie.filter(d => d.balance !== null)
  const comidoTotal = conAmbos.reduce((s, d) => s + (d.comido ?? 0), 0)
  const gastadoTotal = conAmbos.reduce((s, d) => s + (d.gastado ?? 0), 0)
  const balance = comidoTotal - gastadoTotal

  const hoy = serie[serie.length - 1]

  if (conAmbos.length === 0) {
    return (
      <Card className="p-5">
        <CardHeader title="Consumido vs gastado" hint="Últimos 7 días" />
        <p className="text-[14px] text-ink-secondary leading-relaxed">
          Todavía no hay ningún día con comidas registradas y gasto medido a la vez.
          Registrá lo que comés y acá aparece el balance.
        </p>
      </Card>
    )
  }

  return (
    <Card className="p-5">
      <CardHeader
        title="Consumido vs gastado"
        hint={`Últimos 7 días · ${conAmbos.length} con comida registrada`}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <div className="glass-sunk rounded-lg px-3 py-2.5">
          <div className="label mb-1">Hoy comiste</div>
          <div className="metric" style={{ color: COMIDO }}>{kcal(hoy?.comido)}</div>
          <div className="label-plain mt-0.5">kcal</div>
        </div>
        <div className="glass-sunk rounded-lg px-3 py-2.5">
          <div className="label mb-1">Hoy gastaste</div>
          <div className="metric" style={{ color: GASTADO }}>{kcal(hoy?.gastado)}</div>
          <div className="label-plain mt-0.5">kcal, todo incluido</div>
        </div>
        <div className="glass-sunk rounded-lg px-3 py-2.5">
          <div className="label mb-1">Balance de hoy</div>
          <div className="metric" style={{
            color: hoy?.balance === null || hoy?.balance === undefined ? 'var(--color-ink-muted)'
              : hoy.balance <= 0 ? 'var(--color-state-good)' : 'var(--color-state-warning)',
          }}>
            {hoy?.balance === null || hoy?.balance === undefined
              ? '—' : `${hoy.balance > 0 ? '+' : ''}${kcal(hoy.balance)}`}
          </div>
          <div className="label-plain mt-0.5">
            {hoy?.balance === null || hoy?.balance === undefined ? 'sin registrar' : 'kcal'}
          </div>
        </div>
        <div className="glass-sunk rounded-lg px-3 py-2.5">
          <div className="label mb-1">Acumulado</div>
          <div className="metric" style={{
            color: balance <= 0 ? 'var(--color-state-good)' : 'var(--color-state-warning)',
          }}>
            {balance > 0 ? '+' : ''}{kcal(balance)}
          </div>
          <div className="label-plain mt-0.5">
            en {conAmbos.length} {conAmbos.length === 1 ? 'día' : 'días'}
          </div>
        </div>
      </div>

      <ResponsiveContainer width="100%" height={190}>
        <ComposedChart data={serie} margin={{ top: 4, right: 8, bottom: 0, left: -8 }}>
          <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
          {/* Un solo eje: las dos series son kilocalorías. */}
          <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48}
            tickFormatter={v => `${Math.round(Number(v) / 100) / 10}k`} />
          <Tooltip
            cursor={{ fill: '#ffffff08' }}
            content={({ active, payload, label }) => {
              if (!active || !payload?.length) return null
              const d = payload[0].payload as typeof serie[number]
              return (
                <div className="rounded-lg px-3 py-2 glass-strong text-[13px]">
                  <div className="text-ink-muted mb-1">{label}</div>
                  <div className="text-ink-primary tabular-nums">
                    {d.comido === null ? 'sin registrar' : `${kcal(d.comido)} kcal comidas`}
                  </div>
                  <div className="text-ink-secondary tabular-nums">{kcal(d.gastado)} kcal gastadas</div>
                  {d.balance !== null && (
                    <div className="tabular-nums mt-1" style={{
                      color: d.balance <= 0 ? 'var(--color-state-good)' : 'var(--color-state-warning)',
                    }}>
                      {d.balance > 0 ? '+' : ''}{kcal(d.balance)} de balance
                    </div>
                  )}
                </div>
              )
            }}
          />
          <Bar dataKey="comido" name="Comido" radius={[3, 3, 0, 0]}
            isAnimationActive animationDuration={650}>
            {serie.map(d => <Cell key={d.fecha} fill={COMIDO} />)}
          </Bar>
          <Line type="monotone" dataKey="gastado" name="Gastado" stroke={GASTADO}
            strokeWidth={2.5} dot={{ r: 3 }} connectNulls
            isAnimationActive animationDuration={650} />
        </ComposedChart>
      </ResponsiveContainer>

      <div className="flex flex-wrap gap-4 mt-2">
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-3 h-2.5 rounded-[3px]" style={{ background: COMIDO }} />Comido
        </span>
        <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
          <span className="w-4 h-[2.5px] rounded-full" style={{ background: GASTADO }} />Gastado
        </span>
      </div>

      {conAmbos.length < serie.length && (
        <p className="label-plain mt-3">
          Los días sin barra no son días sin comer: son días sin registrar, y quedan
          fuera del acumulado en vez de contar como cero.
        </p>
      )}
    </Card>
  )
}
