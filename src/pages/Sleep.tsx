import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
  LineChart, Line, Area, ComposedChart } from 'recharts'
import { useSleep, type NocheEvaluada } from '../hooks/useSleep'
import { Card, CardHeader, Insight, LegendItem, ChartTooltip } from '../components/ui'
import Ring from '../components/Ring'
import MetricasDisponibles from '../components/MetricasDisponibles'

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

  // SpO2 and breathing rate are the two things this watch reports that Oura
  // does not headline, so they get their own trend rather than a tile that only
  // shows last night.
  const oxigeno = s.noches
    .filter(n => n.spo2_medio != null)
    .map(n => ({
      fecha: new Date(n.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      medio: n.spo2_medio,
      minimo: n.spo2_minimo,
      respiracion: n.respiracion_media,
    }))

  const resp = s.noches.map(n => n.respiracion_media).filter((v): v is number => v != null)
  const mediaResp = resp.length ? resp.reduce((a, b) => a + b, 0) / resp.length : null

  const grafico = s.noches.map(n => ({
    fecha: new Date(n.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
    profundo_s: n.profundo_s / 3600,
    rem_s: n.rem_s / 3600,
    ligero_s: n.ligero_s / 3600,
    despierto_s: n.despierto_s / 3600,
    puntaje: n.puntaje,
  }))

  return (
    <div className="pb-2">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-6 page-in">


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

        {oxigeno.length > 1 && (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card className="p-5">
              <CardHeader
                title="Oxigenación nocturna"
                hint="Saturación media y mínima de cada noche · por debajo de 90% de forma repetida conviene consultarlo"
              />
              <ResponsiveContainer width="100%" height={200}>
                <ComposedChart data={oxigeno} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={[80, 100]} unit="%" />
                  <Tooltip content={<ChartTooltip formatter={(v, n) => `${v}% ${String(n).toLowerCase()}`} />}
                    cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1, strokeDasharray: '4 3' }} />
                  <ReferenceLine y={90} stroke="var(--color-state-warning)" strokeDasharray="5 4" strokeWidth={1.5}
                    label={{ value: '90%', position: 'right', fill: 'var(--color-state-warning)', fontSize: 11, dx: -4 }} />
                  <Area type="monotone" dataKey="minimo" name="Mínimo" stroke="none" fill="var(--color-sport-swimming)" fillOpacity={0.18} isAnimationActive={false} />
                  <Line type="monotone" dataKey="medio" name="Media" stroke="var(--color-sport-swimming)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line type="monotone" dataKey="minimo" name="Mínimo" stroke="var(--color-sport-swimming)" strokeWidth={1.5} strokeDasharray="4 3" dot={false} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-4 mt-3 pt-3 border-t border-white/[0.06]">
                <LegendItem color="var(--color-sport-swimming)" label="Media de la noche" />
                <span className="flex items-center gap-2 text-[13px] text-ink-secondary">
                  <span className="w-4 h-0 border-t-2 border-dashed inline-block" style={{ borderColor: 'var(--color-sport-swimming)' }} />
                  Mínimo alcanzado
                </span>
              </div>
            </Card>

            <Card className="p-5">
              <CardHeader
                title="Frecuencia respiratoria"
                hint="Es muy estable en cada persona: una subida sostenida suele adelantarse a un resfrío o a fatiga acumulada"
              />
              <ResponsiveContainer width="100%" height={200}>
                <LineChart data={oxigeno} margin={{ top: 4, right: 8, bottom: 0, left: -18 }}>
                  <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="fecha" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} />
                  <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} domain={['dataMin - 2', 'dataMax + 2']} />
                  <Tooltip content={<ChartTooltip formatter={(v) => `${v} respiraciones por minuto`} />}
                    cursor={{ stroke: 'var(--color-ink-faint)', strokeWidth: 1, strokeDasharray: '4 3' }} />
                  {mediaResp !== null && (
                    <ReferenceLine y={mediaResp} stroke="var(--color-ink-secondary)" strokeDasharray="5 4" strokeWidth={1.5}
                      label={{ value: `tu media ${mediaResp.toFixed(1)}`, position: 'right', fill: 'var(--color-ink-secondary)', fontSize: 11, dx: -4 }} />
                  )}
                  <Line type="monotone" dataKey="respiracion" name="Respiración" stroke="var(--color-sport-cardio)" strokeWidth={2.5} dot={{ r: 3 }} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        )}

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

        <MetricasDisponibles />

        <div className="h-2" />
      </div>
    </div>
  )
}
