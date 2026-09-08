import { useRef, useState } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell,
} from 'recharts'
import { Card, CardHeader, ChartTooltip, Insight, explicarError } from '../components/ui'
import Icon from '../components/Icon'
import AIProgress from '../components/AIProgress'
import { usePantalla, horas, esRed } from '../hooks/usePantalla'
import { enviar } from '../lib/acciones'

const AXIS = { fill: '#94a3b8', fontSize: 12 }
const GRID = '#28334a'
const REDES_COLOR = '#f43f5e'
const PANTALLA_COLOR = '#38bdf8'

interface Analisis {
  dispositivo: string | null
  periodo: 'semana' | 'dia'
  promedio_diario_min: number | null
  total_min: number | null
  dias_transcurridos: number | null
  cambio_pct: number | null
  actualizado: string | null
  categorias: { nombre: string; min: number }[]
  apps: { nombre: string; min: number }[]
  activaciones: number | null
  nota: string
}

/** Achica la captura antes de subirla. Igual que en Comida: una captura de
 *  iPhone son 350 KB y en base64 crece un tercio, y el modelo no lee mejor por
 *  los píxeles de sobra. El respaldo con FileReader está por los HEIC que
 *  `createImageBitmap` no decodifica. */
async function achicar(f: File, lado = 1024): Promise<string> {
  try {
    const bitmap = await createImageBitmap(f)
    const escala = Math.min(1, lado / Math.max(bitmap.width, bitmap.height))
    const lienzo = document.createElement('canvas')
    lienzo.width = Math.round(bitmap.width * escala)
    lienzo.height = Math.round(bitmap.height * escala)
    lienzo.getContext('2d')!.drawImage(bitmap, 0, 0, lienzo.width, lienzo.height)
    return lienzo.toDataURL('image/jpeg', 0.85).split(',')[1]
  } catch {
    return await new Promise<string>((ok, fail) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result).split(',')[1])
      r.onerror = () => fail(new Error('No se pudo leer la captura'))
      r.readAsDataURL(f)
    })
  }
}

/**
 * Tiempo en pantalla, cargado a mano desde una captura.
 *
 * Por qué a mano y no automático: Apple cerró la API de Screen Time a
 * propósito. Los datos sólo se pueden mostrar dentro de una extensión
 * sandboxeada y de ahí no salen — ni a tu propia app, ni a un servidor. Lo
 * comprobamos también por el otro lado: la base local de la Mac existe pero
 * sólo tiene uso de la Mac, y los datos del iPhone viven en una carpeta que
 * exige Acceso Total al Disco. Así que la foto no es un atajo perezoso, es el
 * único camino que queda abierto sin abrirle el disco entero a nadie.
 *
 * A cambio, el modelo acá no estima nada: transcribe números que ya están
 * escritos, que es mucho más confiable que adivinar gramos de un plato.
 */
export default function Pantalla() {
  const p = usePantalla()
  const archivo = useRef<HTMLInputElement>(null)

  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [vistas, setVistas] = useState<string[]>([])
  const [estado, setEstado] = useState<'idle' | 'analizando' | 'guardando' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  const analizar = async (fs: File[]) => {
    setEstado('analizando'); setMensaje(''); setAnalisis(null)
    try {
      setVistas(fs.map(f => URL.createObjectURL(f)))
      const imagenes_b64 = await Promise.all(fs.slice(0, 3).map(f => achicar(f)))
      const r = await enviar('/api/pantalla/analizar', { imagenes_b64 })
      setAnalisis(r as unknown as Analisis)
      setEstado('idle')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  const guardar = async () => {
    if (!analisis) return
    setEstado('guardando')
    try {
      await enviar('/api/pantalla/guardar', analisis)
      setAnalisis(null); setVistas([]); setMensaje('Guardado')
      setEstado('idle')
      await p.recargar()
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  const cambiarMin = (lista: 'categorias' | 'apps', i: number, min: number) => {
    if (!analisis) return
    const copia = [...analisis[lista]]
    copia[i] = { ...copia[i], min: Math.max(0, min) }
    setAnalisis({ ...analisis, [lista]: copia })
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 pt-7 pb-2">
        <h1 className="title-page">Pantalla</h1>
        <p className="label-plain mt-2">Cuánto tiempo se van en redes, desde el resumen de tu iPhone</p>
      </div>

      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 space-y-6 page-in">

        {/* ── El índice ──────────────────────────────────────────────────── */}
        {p.cargado && p.indice !== null && p.banda && (
          <Card className="p-5">
            <CardHeader
              title="Índice de scroll"
              hint={p.ultimo?.periodo === 'semana'
                ? `Semana del ${p.ultimo.desde.split('-').reverse().slice(0, 2).join('/')}${
                    (p.ultimo.diasTranscurridos ?? 7) < 7 ? ` · ${p.ultimo.diasTranscurridos} días cargados` : ''}`
                : 'Último día cargado'}
            />

            <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
              <div>
                {/* Acá más es MÁS consumo, al revés que el score del Objetivo.
                    Por eso la etiqueta dice "alto" y no "bien": un número que
                    sube no es una buena noticia. */}
                <div className="flex items-end gap-3 mb-2">
                  <span className="text-[56px] leading-none font-bold tabular-nums"
                    style={{ color: p.banda.color }}>{p.indice}</span>
                  <span className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
                    style={{ color: p.banda.color, borderColor: `${p.banda.color}66`,
                             background: `${p.banda.color}1a` }}>
                    {p.banda.label}
                  </span>
                </div>
                <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                  <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                    style={{ width: `${p.indice}%`, background: p.banda.color }} />
                </div>
                <div className="flex justify-between text-[12px] text-ink-muted mb-3">
                  <span>0</span><span>1 h 30 diarias</span><span>3 h</span>
                </div>
                <p className="text-[14px] text-ink-secondary leading-relaxed">{p.banda.texto}</p>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 content-start">
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="label mb-1">En redes</div>
                  <div className="metric" style={{ color: REDES_COLOR }}>{horas(p.redesDia)}</div>
                  <div className="label-plain mt-0.5">por día</div>
                </div>
                <div className="glass-sunk rounded-lg px-3 py-2.5">
                  <div className="label mb-1">Pantalla total</div>
                  <div className="metric">{horas(p.ultimo?.promedioDiarioMin ?? null)}</div>
                  <div className="label-plain mt-0.5">por día</div>
                </div>
                {p.pctRedes !== null && (
                  <div className="glass-sunk rounded-lg px-3 py-2.5">
                    <div className="label mb-1">Proporción</div>
                    <div className="metric">{p.pctRedes}%</div>
                    <div className="label-plain mt-0.5">del tiempo en pantalla</div>
                  </div>
                )}
                {p.ultimo?.cambioPct !== null && p.ultimo?.cambioPct !== undefined && (
                  <div className="glass-sunk rounded-lg px-3 py-2.5">
                    <div className="label mb-1">Contra el período previo</div>
                    <div className="metric" style={{
                      color: p.ultimo.cambioPct <= 0 ? 'var(--color-state-good)' : 'var(--color-state-warning)',
                    }}>
                      {p.ultimo.cambioPct > 0 ? '+' : ''}{p.ultimo.cambioPct}%
                    </div>
                    <div className="label-plain mt-0.5">lo calcula iOS</div>
                  </div>
                )}
                {p.ultimo?.activaciones !== null && p.ultimo?.activaciones !== undefined && (
                  <div className="glass-sunk rounded-lg px-3 py-2.5">
                    <div className="label mb-1">Activaciones</div>
                    <div className="metric">{p.ultimo.activaciones}</div>
                    <div className="label-plain mt-0.5">veces que lo levantaste</div>
                  </div>
                )}
              </div>
            </div>

            {p.redes.length > 0 && (
              <div className="mt-5 pt-4 border-t border-surface-line">
                <div className="label mb-2.5">Qué redes</div>
                <div className="space-y-2">
                  {p.redes.map(a => (
                    <div key={a.nombre} className="flex items-center gap-3">
                      <span className="text-[14px] text-ink-primary w-28 shrink-0 truncate">{a.nombre}</span>
                      <div className="flex-1 h-2 rounded-full bg-white/[0.06] overflow-hidden">
                        <div className="h-full rounded-full"
                          style={{ width: `${Math.min(100, (a.minDia / 180) * 100)}%`, background: REDES_COLOR }} />
                      </div>
                      <span className="text-[13px] text-ink-secondary tabular-nums w-24 text-right shrink-0">
                        {horas(a.minDia)}/día
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}

        {/* ── La evolución ───────────────────────────────────────────────── */}
        {p.serie.length >= 2 && (
          <Card className="p-5">
            <CardHeader title="Cómo viene" hint="Minutos por día en cada informe cargado" />
            <ResponsiveContainer width="100%" height={200}>
              <ComposedChart data={p.serie} margin={{ top: 4, right: 8, bottom: 0, left: -14 }}>
                <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={AXIS} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={24} />
                {/* Un solo eje: las dos series son minutos por día. */}
                <YAxis tick={AXIS} tickLine={false} axisLine={false} width={44}
                  tickFormatter={v => `${Math.round(Number(v) / 60)}h`} />
                <Tooltip cursor={{ fill: '#ffffff08' }}
                  content={<ChartTooltip formatter={v => `${horas(Number(v))} por día`} />} />
                <Bar dataKey="redesDia" name="En redes" radius={[3, 3, 0, 0]}
                  isAnimationActive animationDuration={650}>
                  {p.serie.map(s => (
                    // Las semanas a medio transcurrir van translúcidas: son una
                    // lectura provisoria y no deben leerse como una semana floja.
                    <Cell key={s.desde} fill={REDES_COLOR} fillOpacity={s.parcial ? 0.4 : 1} />
                  ))}
                </Bar>
                <Line type="monotone" dataKey="pantallaDia" name="Pantalla total"
                  stroke={PANTALLA_COLOR} strokeWidth={2.5} dot={{ r: 3 }} connectNulls
                  isAnimationActive animationDuration={650} />
              </ComposedChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-4 mt-2">
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <span className="w-3 h-2.5 rounded-[3px]" style={{ background: REDES_COLOR }} />En redes
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <span className="w-4 h-[2.5px] rounded-full" style={{ background: PANTALLA_COLOR }} />Pantalla total
              </span>
              <span className="flex items-center gap-1.5 text-[12px] text-ink-muted">
                <span className="w-3 h-2.5 rounded-[3px]" style={{ background: REDES_COLOR, opacity: 0.4 }} />
                Semana incompleta
              </span>
            </div>
          </Card>
        )}

        {/* ── Cargar una captura ─────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Cargar el resumen"
            hint="Ajustes → Tiempo en pantalla. Sacá la captura y subila; el modelo lee los números"
          />

          <input
            ref={archivo} type="file" accept="image/*" multiple className="hidden"
            onChange={e => {
              const fs = Array.from(e.target.files ?? [])
              if (fs.length) analizar(fs)
              e.target.value = ''
            }}
          />

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => archivo.current?.click()}
              disabled={estado === 'analizando' || estado === 'guardando'}
              className="px-4 py-2.5 rounded-xl border border-accent text-accent hover:bg-accent
                         hover:text-white text-[15px] font-semibold transition-colors
                         disabled:opacity-50 flex items-center gap-2"
            >
              <Icon name="camara" size={18} />
              {estado === 'analizando' ? 'Leyendo…' : 'Subir captura'}
            </button>
            {vistas.map((v, i) => (
              <img key={i} src={v} alt="La captura"
                className="h-[46px] w-[46px] object-cover rounded-lg border border-surface-line" />
            ))}
          </div>

          <p className="label-plain mt-3">
            Podés subir hasta tres capturas del mismo período — la lista de apps no entra en
            una pantalla, y las activaciones están más abajo todavía. Se leen juntas como un
            solo informe.
          </p>

          {estado === 'analizando' && (
            <div className="mt-4">
              <AIProgress titulo="Leyendo la captura"
                detalle="transcribe los minutos que están escritos, no los estima"
                esperaTipica={20} lineas={2} />
            </div>
          )}

          {estado === 'error' && <div className="mt-3"><Insight tone="warning">{mensaje}</Insight></div>}
          {mensaje === 'Guardado' && <div className="mt-3"><Insight tone="good">Guardado.</Insight></div>}

          {/* ── Corregir antes de guardar ─────────────────────────────────── */}
          {analisis && (
            <div className="mt-5 pt-5 border-t border-surface-line space-y-4">
              <Insight tone="neutral">
                Revisá los minutos antes de guardar. El modelo lee bien, pero un 41 y un 47
                se parecen bastante en una captura.
              </Insight>

              <div className="flex flex-wrap gap-x-6 gap-y-2 text-[14px]">
                <span className="text-ink-secondary">
                  {analisis.dispositivo ?? 'dispositivo desconocido'}
                </span>
                <span className="text-ink-secondary">
                  vista por {analisis.periodo}
                  {analisis.dias_transcurridos ? ` · ${analisis.dias_transcurridos} días` : ''}
                </span>
                {analisis.actualizado && (
                  <span className="text-ink-muted">actualizado {analisis.actualizado}</span>
                )}
              </div>

              {(['categorias', 'apps'] as const).map(lista => (
                analisis[lista].length > 0 && (
                  <div key={lista}>
                    <div className="label mb-2">{lista === 'categorias' ? 'Categorías' : 'Apps'}</div>
                    <div className="space-y-1.5">
                      {analisis[lista].map((x, i) => (
                        <div key={`${x.nombre}-${i}`} className="flex items-center gap-3">
                          <span className={`text-[14px] flex-1 truncate ${
                            lista === 'apps' && esRed(x.nombre) ? 'text-ink-primary font-medium' : 'text-ink-secondary'
                          }`}>
                            {x.nombre}
                          </span>
                          <input
                            type="number" value={x.min} min={0}
                            onChange={e => cambiarMin(lista, i, Number(e.target.value))}
                            className="w-20 px-2 py-1 rounded-lg bg-surface-sunk border border-surface-line
                                       text-[14px] text-ink-primary tabular-nums text-right"
                          />
                          <span className="text-[13px] text-ink-muted w-8">min</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ))}

              {analisis.nota && <p className="label-plain">{analisis.nota}</p>}

              <button
                onClick={guardar}
                disabled={estado === 'guardando'}
                className="px-4 py-2.5 rounded-xl bg-accent text-white text-[15px] font-semibold
                           hover:bg-accent-soft disabled:opacity-50"
              >
                {estado === 'guardando' ? 'Guardando…' : 'Guardar informe'}
              </button>
            </div>
          )}
        </Card>

        {p.cargado && p.registros.length === 0 && !analisis && (
          <p className="label-plain">
            Todavía no cargaste ningún resumen. Con el primero ya vas a ver el índice; con
            dos o más, la evolución.
          </p>
        )}
      </div>
    </div>
  )
}
