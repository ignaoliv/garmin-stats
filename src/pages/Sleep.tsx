import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts'
import { useSleep, type NocheEvaluada } from '../hooks/useSleep'
import { Card, CardHeader, Insight, LegendItem, ChartTooltip } from '../components/ui'
import Ring from '../components/Ring'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const FASES = [
  { clave: 'profundo_s', label: 'Profundo', color: '#3987e5' },
  { clave: 'rem_s', label: 'REM', color: '#9085e9' },
  { clave: 'ligero_s', label: 'Ligero', color: '#38bdf8' },
  { clave: 'despierto_s', label: 'Despierto', color: '#7c8aa3' },
] as const

const h = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`
const color = (p: number | null) => (p === null ? '#94a3b8' : p >= 80 ? '#34d399' : p >= 60 ? '#fbbf24' : '#f87171')
const fechaLarga = (f: string) =>
  new Date(f + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })

function Factores({ noche }: { noche: NocheEvaluada }) {
  return (
    <div className="space-y-3">
      {noche.factores.map(f => (
        <div key={f.clave}>
          <div className="flex items-baseline justify-between gap-3 mb-1">
            <span className="text-[14px] text-ink-primary">{f.etiqueta}</span>
            <span className="text-[14px] font-semibold text-ink-primary tabular-nums">{f.valor}</span>
          </div>
          <div className="h-1.5 rounded-full bg-surface-sunk overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${f.puntaje ?? 0}%`, background: color(f.puntaje) }} />
          </div>
          <p className="text-[12px] text-ink-muted mt-1">{f.detalle} <span className="text-ink-faint">Ideal: {f.ideal}.</span></p>
        </div>
      ))}
    </div>
  )
}

export default function Sleep() {
  const s = useSleep()

  if (!s.cargado) {
    return <div className="flex-1 grid place-items-center text-ink-secondary text-[15px] animate-pulse">Cargando…</div>
  }

  if (s.noches.length === 0) {
    return (
      <div className="flex-1 p-6 max-w-2xl page-in">
        <Card className="p-6">
          <h2 className="text-lg font-semibold text-ink-primary mb-2">Sin datos de sueño</h2>
          <p className="text-[15px] text-ink-secondary leading-relaxed">
            Garmin sólo registra el sueño las noches que dormís con el reloj puesto.
            Ejecutá <code className="text-ink-muted">python3 fetch/sleep.py</code> después de una noche con el reloj.
          </p>
        </Card>
      </div>
    )
  }

  const grafico = s.noches.map(n => ({
    fecha: new Date(n.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    profundo_s: n.profundo_s / 3600,
    rem_s: n.rem_s / 3600,
    ligero_s: n.ligero_s / 3600,
    despierto_s: n.despierto_s / 3600,
    puntaje: n.puntaje,
  }))

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-7 space-y-6 page-in">

        <header>
          <h1 className="title-page">Sueño</h1>
          <p className="label-plain mt-2">
            {s.cobertura.conRegistro} noches registradas en {s.cobertura.diasBarridos} días ({s.cobertura.pct}% de cobertura)
          </p>
        </header>

        {s.cobertura.pct < 50 && (
          <Card className="p-4">
            <Insight tone="warning">
              Con {s.cobertura.pct}% de cobertura no hay serie suficiente para ver tendencias ni comparar semanas.
              Cada noche que duermas con el reloj se suma sola al correr el sync.
            </Insight>
          </Card>
        )}

        {s.ultima && (
          <Card className="p-5">
            <CardHeader title="Última noche" hint={fechaLarga(s.ultima.fecha)} />
            <div className="grid grid-cols-1 lg:grid-cols-[auto_1fr] gap-6 items-start">
              <div className="flex flex-col items-center gap-3">
                <Ring pct={s.ultima.puntaje ?? 0} color={color(s.ultima.puntaje)} size={128} etiqueta={`Puntaje de sueño ${s.ultima.puntaje ?? 0} de 100`}>
                  <div className="metric-lg" style={{ color: color(s.ultima.puntaje) }}>{s.ultima.puntaje ?? '—'}</div>
                  <div className="label-plain mt-1">de 100</div>
                </Ring>
                <div className="text-center">
                  <div className="text-[20px] font-bold text-ink-primary tabular-nums">{h(s.ultima.total_s)}</div>
                  <div className="text-[13px] text-ink-muted">dormidas</div>
                </div>
              </div>
              <Factores noche={s.ultima} />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-surface-line">
              {[
                ['SpO₂ medio', s.ultima.spo2_medio ? `${s.ultima.spo2_medio}%` : '—'],
                ['SpO₂ mínimo', s.ultima.spo2_minimo ? `${s.ultima.spo2_minimo}%` : '—'],
                ['Respiración', s.ultima.respiracion_media ? `${s.ultima.respiracion_media}/min` : '—'],
                ['Body battery', s.ultima.bateria_inicio != null && s.ultima.bateria_fin != null
                  ? `${s.ultima.bateria_inicio} → ${s.ultima.bateria_fin}` : '—'],
              ].map(([k, v]) => (
                <div key={k} className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="label mb-2">{k}</div>
                  <div className="metric">{v}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <CardHeader title="Fases del sueño" hint="Cada noche registrada, en horas" />
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={grafico} margin={{ top: 4, right: 8, bottom: 0, left: -18 }} barCategoryGap="24%">
              <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="fecha" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
              <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44} unit=" h" />
              <Tooltip cursor={{ fill: '#ffffff08' }}
                content={<ChartTooltip formatter={(v, n) => `${Number(v).toFixed(1)} h de ${String(n).toLowerCase()}`} />} />
              <ReferenceLine y={7} stroke="#cbd5e1" strokeDasharray="5 4" strokeWidth={1.5}
                label={{ value: 'objetivo 7h', position: 'right', fill: '#cbd5e1', fontSize: 11, dx: -4 }} />
              {FASES.map(f => (
                <Bar key={f.clave} dataKey={f.clave} name={f.label} stackId="s" fill={f.color}
                  radius={f.clave === 'despierto_s' ? [3, 3, 0, 0] : undefined} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
          <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-surface-line">
            {FASES.map(f => <LegendItem key={f.clave} color={f.color} label={f.label} />)}
          </div>
        </Card>

        {s.medias && s.noches.length > 2 && (
          <Card className="p-5">
            <CardHeader title="Promedios" hint={`Sobre las ${s.noches.length} noches registradas`} />
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {[
                ['Puntaje medio', String(s.medias.puntaje)],
                ['Sueño medio', h(s.medias.total_s)],
                ['Profundo medio', h(s.medias.profundo_s)],
                ['REM medio', h(s.medias.rem_s)],
              ].map(([k, v]) => (
                <div key={k} className="glass-sunk rounded-lg px-4 py-3">
                  <div className="label mb-2">{k}</div>
                  <div className="metric-lg">{v}</div>
                </div>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <CardHeader title="Qué mide Oura y qué podemos reproducir" hint="Con los datos que da tu Venu" />
          <div className="overflow-x-auto">
            <table className="w-full text-[14px] min-w-[520px]">
              <thead>
                <tr className="text-[13px] text-ink-muted text-left border-b border-surface-line">
                  <th className="pb-2 pr-4 font-medium">Métrica de Oura</th>
                  <th className="pb-2 pr-4 font-medium">Acá</th>
                  <th className="pb-2 font-medium">Nota</th>
                </tr>
              </thead>
              <tbody>
                {[
                  ['Duración total', 'sí', 'Idéntica'],
                  ['Eficiencia', 'sí', 'Dormido sobre tiempo en cama'],
                  ['Sueño profundo', 'sí', 'Garmin separa las fases'],
                  ['REM', 'sí', 'Garmin separa las fases'],
                  ['Continuidad', 'sí', 'Tiempo despierto durante la noche'],
                  ['Latencia', 'parcial', 'Garmin no reporta cuánto tardaste en dormirte'],
                  ['Regularidad horaria', 'parcial', 'Necesita varias noches seguidas'],
                  ['Balance de HRV', 'no', 'El Venu no registra HRV'],
                  ['Temperatura corporal', 'no', 'El Venu no la mide'],
                  ['SpO₂ nocturno', 'extra', 'Oura no lo destaca; tu reloj sí lo da'],
                  ['Frecuencia respiratoria', 'extra', 'Lo mismo'],
                ].map(([m, e, n]) => (
                  <tr key={m} className="border-b border-surface-line last:border-0">
                    <td className="py-2 pr-4 text-ink-primary">{m}</td>
                    <td className="py-2 pr-4">
                      <span className="text-[13px] font-medium" style={{
                        color: e === 'sí' ? '#34d399' : e === 'no' ? '#f87171' : e === 'extra' ? '#38bdf8' : '#fbbf24',
                      }}>{e}</span>
                    </td>
                    <td className="py-2 text-ink-muted text-[13px]">{n}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <div className="h-2" />
      </div>
    </div>
  )
}
