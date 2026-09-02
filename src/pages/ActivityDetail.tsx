import { useEffect, useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  AreaChart, Area, BarChart, Bar, Cell, XAxis, YAxis,
  CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts'
import type { ActivityDetail, StreamPoint } from '../types/garmin'
import { useActivityStore } from '../stores/activityStore'
import { formatPace, formatDuration, formatDistance, formatDate } from '../utils/formatters'
import { sportLabel, sportIcon, sportColor } from '../utils/sports'
import { HR_ZONE_DEFS } from '../utils/calculations'
import ActivityMap from '../components/ActivityMap'
import { Card, CardHeader, ChartTooltip, Insight } from '../components/ui'
import ActivityInsight from '../components/ActivityInsight'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'

/** One row of the in-activity chart stack. */
interface Channel {
  key: keyof StreamPoint
  label: string
  unit: string
  color: string
  decimals?: number
}

const CHANNELS: Channel[] = [
  { key: 'hr',        label: 'Frecuencia cardíaca', unit: 'bpm',  color: '#f87171' },
  { key: 'speed',     label: 'Velocidad',           unit: 'km/h', color: '#3987e5', decimals: 1 },
  { key: 'power',     label: 'Potencia',            unit: 'W',    color: '#d95926' },
  { key: 'cadence',   label: 'Cadencia',            unit: 'rpm',  color: '#199e70' },
  { key: 'elevation', label: 'Altitud',             unit: 'm',    color: '#c98500' },
]

export default function ActivityDetailPage() {
  const { id } = useParams<{ id: string }>()
  const loadDetail = useActivityStore(s => s.loadDetail)
  const activities = useActivityStore(s => s.activities)
  const [detail, setDetail] = useState<ActivityDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [axis, setAxis] = useState<'km' | 'seconds'>('km')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    loadDetail(Number(id)).then(d => {
      setDetail(d)
      setLoading(false)
    })
  }, [id, loadDetail])

  const summary = activities.find(a => a.id === Number(id))
  const act = detail ?? summary
  const streams = detail?.streams ?? []

  // Only chart channels that actually carry data in this activity, each with
  // its own mean/max so the reference line and the caption agree.
  const active = useMemo(
    () =>
      CHANNELS.map(c => {
        const vals = streams
          .map(p => p[c.key])
          .filter((v): v is number => typeof v === 'number')
        if (!vals.length) return null
        return {
          ...c,
          avg: vals.reduce((s, v) => s + v, 0) / vals.length,
          max: Math.max(...vals),
        }
      }).filter((c): c is Channel & { avg: number; max: number } => c !== null),
    [streams],
  )
  const hasDistance = streams.some(p => p.km > 0)
  const xKey = hasDistance && axis === 'km' ? 'km' : 'seconds'

  if (loading) {
    return <div className="flex-1 flex items-center justify-center text-[#cbd5e1] text-[15px] animate-pulse">Cargando actividad…</div>
  }
  if (!act) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#cbd5e1] text-[15px]">
        Actividad no encontrada.
        <Link to="/activities" className="text-[#fc5200] hover:text-[#ff7a3d] ml-1.5">Volver</Link>
      </div>
    )
  }

  const accent = sportColor(act.sport)
  const zoneTotal = (detail?.hrZones ?? []).reduce((s, z) => s + z.seconds, 0)
  const isBike = act.sport === 'cycling'
  const isRun = act.sport === 'running'

  // Sport-aware headline metrics: only what this discipline actually measures.
  const tiles: { label: string; value: string; unit?: string }[] = []
  if (act.distance > 0) tiles.push({ label: 'Distancia', value: formatDistance(act.distance, act.sport) })
  tiles.push({ label: 'Duración', value: formatDuration(act.duration) })
  if (isBike || act.avgSpeed) tiles.push({ label: 'Velocidad media', value: act.avgSpeed ? act.avgSpeed.toFixed(1) : '—', unit: 'km/h' })
  if (isRun && act.avgPace) tiles.push({ label: 'Ritmo medio', value: formatPace(act.avgPace) })
  if (act.avgHR > 0) tiles.push({ label: 'FC media', value: String(act.avgHR), unit: 'bpm' })
  if (act.maxHR > 0) tiles.push({ label: 'FC máxima', value: String(act.maxHR), unit: 'bpm' })
  if (act.avgCadence) tiles.push({ label: 'Cadencia media', value: String(act.avgCadence), unit: isBike ? 'rpm' : 'ppm' })
  if (act.avgPower) tiles.push({ label: 'Potencia media', value: String(act.avgPower), unit: 'W' })
  if (act.normalizedPower) tiles.push({ label: 'Potencia normalizada', value: String(act.normalizedPower), unit: 'W' })
  if (act.elevationGain > 0) tiles.push({ label: 'Desnivel +', value: String(Math.round(act.elevationGain)), unit: 'm' })
  if (act.calories > 0) tiles.push({ label: 'Calorías', value: act.calories.toLocaleString('es-ES'), unit: 'kcal' })
  if (act.tss != null) tiles.push({ label: 'Carga', value: String(Math.round(act.tss)), unit: 'TSS' })

  const fmtX = (v: number) => (xKey === 'km' ? `${v} km` : formatDuration(v))

  return (
    <div className="flex-1 overflow-y-auto bg-[#101826]">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-5 page-in">

        <header>
          <Link to="/activities" className="text-[13px] text-[#fc5200] hover:text-[#ff7a3d] mb-2 inline-block">← Actividades</Link>
          <div className="flex items-center gap-3 min-w-0">
            <span
              className="w-11 h-11 rounded-xl shrink-0 flex items-center justify-center text-xl"
              style={{ background: `${accent}26`, border: `1px solid ${accent}59` }}
            >
              {sportIcon(act.sport)}
            </span>
            <div className="min-w-0">
              <h1 className="text-2xl font-bold text-[#f1f5f9] leading-tight">{act.title}</h1>
              <p className="text-[14px] text-[#94a3b8] mt-0.5">{formatDate(act.startTime)} · {sportLabel(act.sport)}</p>
            </div>
          </div>
        </header>

        <ActivityInsight activityId={act.id} />

        {/* ── Metrics + route, side by side ──────────────────────────────── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">

          <div className="grid grid-cols-2 gap-3 content-start stagger">
            {tiles.map(t => (
              <div key={t.label} className="bg-[#172033] border border-[#28334a] rounded-xl px-4 py-3.5 flex flex-col justify-center">
                <div className="text-[13px] text-[#94a3b8] mb-1.5">{t.label}</div>
                <div className="text-[24px] leading-none font-bold text-[#f1f5f9] tabular-nums">
                  {t.value}
                  {t.unit && <span className="text-[14px] font-medium text-[#94a3b8] ml-1">{t.unit}</span>}
                </div>
              </div>
            ))}
          </div>

          {detail?.gpxCoords && detail.gpxCoords.length > 0 ? (
            <Card className="p-4 flex flex-col min-h-[360px]" id="recorrido">
              <div className="flex items-baseline justify-between gap-3 mb-3">
                <h2 className="text-[15px] font-semibold text-[#f1f5f9] leading-tight">Recorrido</h2>
                <span className="text-[13px] text-[#94a3b8]">{detail.gpxCoords.length} puntos GPS</span>
              </div>
              {/* min-h-0 lets the map shrink inside the flex column instead of
                  overflowing it. */}
              <div className="flex-1 min-h-0">
                <ActivityMap coords={detail.gpxCoords} height="100%" />
              </div>
            </Card>
          ) : (
            <Card className="p-4 flex items-center justify-center min-h-[280px]">
              <p className="text-[14px] text-[#94a3b8]">Esta actividad no tiene recorrido GPS</p>
            </Card>
          )}
        </div>

        {/* ── In-activity evolution ──────────────────────────────────────── */}
        {active.length > 0 ? (
          <Card className="p-5">
            <div className="flex items-start justify-between gap-4 mb-4 flex-wrap">
              <div>
                <h2 className="text-[15px] font-semibold text-[#f1f5f9] leading-tight">Evolución del entrenamiento</h2>
                <p className="text-[13px] text-[#94a3b8] mt-0.5">{streams.length} muestras a lo largo de la sesión</p>
              </div>
              {hasDistance && (
                <div className="flex rounded-lg border border-[#28334a] overflow-hidden shrink-0">
                  {(['km', 'seconds'] as const).map(mode => (
                    <button
                      key={mode}
                      onClick={() => setAxis(mode)}
                      className={`px-3 py-1.5 text-[13px] font-medium transition-colors ${
                        axis === mode ? 'bg-[#fc5200] text-white' : 'text-[#cbd5e1] hover:bg-[#1e2942]'
                      }`}
                    >
                      {mode === 'km' ? 'Distancia' : 'Tiempo'}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* One chart per channel, sharing an x-axis: never two y-scales on one plot. */}
            <div className="space-y-4">
              {active.map((c, i) => (
                <div key={c.key}>
                  <div className="flex items-baseline gap-2 mb-1">
                    <span className="w-3 h-3 rounded-[3px] inline-block" style={{ background: c.color }} />
                    <span className="text-[14px] font-medium text-[#f1f5f9]">{c.label}</span>
                    <span className="text-[13px] text-[#94a3b8]">
                      media {c.avg.toFixed(c.decimals ?? 0)} {c.unit} · máx {c.max.toFixed(c.decimals ?? 0)} {c.unit}
                    </span>
                  </div>
                  <ResponsiveContainer width="100%" height={128}>
                    <AreaChart data={streams} margin={{ top: 4, right: 74, bottom: 0, left: -18 }} syncId="activity">
                      <defs>
                        <linearGradient id={`g-${c.key}`} x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={c.color} stopOpacity={0.35} />
                          <stop offset="100%" stopColor={c.color} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                      <XAxis
                        dataKey={xKey}
                        tick={i === active.length - 1 ? AXIS : false}
                        height={i === active.length - 1 ? 26 : 4}
                        tickLine={false}
                        axisLine={{ stroke: GRID }}
                        tickFormatter={fmtX}
                        minTickGap={44}
                        type="number"
                        domain={['dataMin', 'dataMax']}
                      />
                      <YAxis tick={AXIS} tickLine={false} axisLine={false} width={46} domain={['auto', 'auto']} />
                      <Tooltip
                        content={<ChartTooltip formatter={(v) => `${v} ${c.unit}`} />}
                        labelFormatter={(v) => fmtX(Number(v))}
                        cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 3' }}
                      />
                      <Area
                        type="monotone"
                        dataKey={c.key}
                        name={c.label}
                        stroke={c.color}
                        strokeWidth={2}
                        fill={`url(#g-${c.key})`}
                        dot={false}
                        connectNulls
                        isAnimationActive={false}
                      />
                      {/* Mean of the session — drawn over the area so it stays
                          readable, in ink rather than the series colour. */}
                      <ReferenceLine
                        y={c.avg}
                        stroke="#cbd5e1"
                        strokeDasharray="5 4"
                        strokeWidth={1.5}
                        ifOverflow="extendDomain"
                        label={{
                          value: `media ${c.avg.toFixed(c.decimals ?? 0)}`,
                          position: 'right',
                          fill: '#cbd5e1',
                          fontSize: 11,
                dx: -4,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ))}
            </div>
            <p className="text-[13px] text-[#94a3b8] mt-3 pt-3 border-t border-[#28334a]">
              Los gráficos están sincronizados: al pasar el mouse por uno, todos marcan el mismo punto.
            </p>
          </Card>
        ) : (
          <Card className="p-5">
            <CardHeader title="Evolución del entrenamiento" />
            <Insight tone="neutral">
              Esta actividad todavía no tiene series temporales guardadas. Se descargan corriendo
              <code className="text-[#cbd5e1] mx-1">python3 fetch/sync.py --refresh-all</code>.
            </Insight>
          </Card>
        )}

        {/* ── HR zones ───────────────────────────────────────────────────── */}
        {zoneTotal > 0 && (
          <Card className="p-5">
            <CardHeader title="Zonas de frecuencia cardíaca" hint="Tiempo en cada zona durante esta actividad" />
            <div className="space-y-2.5">
              {(detail?.hrZones ?? []).map((z, i) => {
                const pct = Math.round((z.seconds / zoneTotal) * 100)
                const def = HR_ZONE_DEFS[i]
                return (
                  <div key={z.zone} className="flex items-center gap-3">
                    <span className="w-[104px] shrink-0 text-[14px] text-[#cbd5e1]">{def?.name ?? z.name}</span>
                    <div className="flex-1 h-6 rounded-md bg-[#131c2e] overflow-hidden">
                      <div className="h-full rounded-md" style={{ width: `${pct}%`, background: def?.color ?? accent }} />
                    </div>
                    <span className="w-16 text-right text-[14px] text-[#f1f5f9] tabular-nums">{formatDuration(z.seconds)}</span>
                    <span className="w-10 text-right text-[14px] text-[#94a3b8] tabular-nums">{pct}%</span>
                  </div>
                )
              })}
            </div>
          </Card>
        )}

        {/* ── Strength detail ────────────────────────────────────────────── */}
        {detail?.strength && detail.strength.exercises.length > 0 && (
          <Card className="p-5">
            <CardHeader
              title="Ejercicios"
              hint={`${detail.strength.totalSets} series · ${detail.strength.totalReps} repeticiones`}
            />
            <div className="space-y-2">
              {detail.strength.exercises.map(e => (
                <div key={e.name} className="flex items-center gap-4 px-3 py-2.5 rounded-lg bg-[#131c2e] border border-[#28334a]">
                  <span className="flex-1 text-[14px] text-[#f1f5f9]">{e.name === 'Unknown' ? 'Ejercicio sin identificar' : e.name}</span>
                  <span className="text-[14px] text-[#cbd5e1] tabular-nums">{e.sets} series</span>
                  <span className="text-[14px] text-[#cbd5e1] tabular-nums w-20 text-right">{e.reps} reps</span>
                  {e.maxWeightKg > 0 && <span className="text-[14px] text-[#f1f5f9] tabular-nums w-20 text-right">{e.maxWeightKg} kg</span>}
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* ── Splits ─────────────────────────────────────────────────────── */}
        {detail?.laps && detail.laps.length > 1 && (
          <Card className="p-5">
            <CardHeader title="Parciales" hint={`${detail.laps.length} tramos`} />
            <ResponsiveContainer width="100%" height={Math.min(Math.max(detail.laps.length * 26, 120), 420)}>
              <BarChart data={detail.laps} layout="vertical" margin={{ top: 0, right: 56, bottom: 0, left: 0 }} barCategoryGap="18%">
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" horizontal={false} />
                <XAxis type="number" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} unit=" km/h" />
                <YAxis type="category" dataKey="index" tick={AXIS} tickLine={false} axisLine={false} width={34} />
                <Tooltip
                  cursor={{ fill: '#ffffff08' }}
                  content={
                    <ChartTooltip
                      formatter={(v, _n, row) =>
                        `${v} km/h · ${formatDuration(Number(row?.duration ?? 0))} · ${row?.avgHR ?? '—'} bpm`
                      }
                    />
                  }
                  labelFormatter={(v) => `Tramo ${v}`}
                />
                <Bar dataKey="avgSpeed" name="Velocidad" radius={[0, 3, 3, 0]} isAnimationActive={false}>
                  {detail.laps.map(l => <Cell key={l.index} fill={accent} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Card>
        )}

        <div className="h-2" />
      </div>
    </div>
  )
}
