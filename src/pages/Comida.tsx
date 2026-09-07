import { useRef, useState } from 'react'
import { Card, CardHeader, Insight, StatTile, explicarError } from '../components/ui'
import Icon from '../components/Icon'
import AIProgress from '../components/AIProgress'
import { enviar, accionesDisponibles } from '../lib/acciones'
import { useComidas, hoyLocal, type AlimentoRegistrado } from '../hooks/useComidas'

const CONFIANZA = {
  alta:  { color: 'var(--color-state-good)',     texto: 'se ve claro' },
  media: { color: 'var(--color-state-warning)',  texto: 'porción estimada' },
  baja:  { color: 'var(--color-state-serious)',  texto: 'revisá esto' },
} as const

const MACROS: [string, string, string][] = [
  ['calorias', 'Calorías', 'kcal'],
  ['proteinas', 'Proteína', 'g'],
  ['carbohidratos', 'Carbohidratos', 'g'],
  ['grasas', 'Grasas', 'g'],
]

const MICROS: [string, string, string][] = [
  ['fibra', 'Fibra', 'g'],
  ['azucares', 'Azúcares', 'g'],
  ['sodio', 'Sodio', 'mg'],
  ['potasio', 'Potasio', 'mg'],
  ['calcio', 'Calcio', 'mg'],
  ['hierro', 'Hierro', 'mg'],
  ['magnesio', 'Magnesio', 'mg'],
  ['vitamina_c', 'Vitamina C', 'mg'],
]

const n = (v: number | undefined, dec = 0) =>
  v === undefined ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: dec })

interface Analisis {
  alimentos: AlimentoRegistrado[]
  total: Record<string, number>
  sin_resolver: string[]
  nota: string
}

export default function Comida() {
  const { delDia, total, recargar } = useComidas()
  const archivo = useRef<HTMLInputElement>(null)

  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [nombre, setNombre] = useState('')
  const [estado, setEstado] = useState<'idle' | 'analizando' | 'guardando' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  const analizar = async (f: File) => {
    setEstado('analizando'); setMensaje(''); setAnalisis(null)
    setVista(URL.createObjectURL(f))
    try {
      const b64 = await new Promise<string>((ok, fail) => {
        const r = new FileReader()
        r.onload = () => ok(String(r.result).split(',')[1])
        r.onerror = () => fail(new Error('No se pudo leer la foto'))
        r.readAsDataURL(f)
      })
      const r = await enviar('/api/comida/analizar', { imagen_b64: b64 })
      setAnalisis(r as unknown as Analisis)
      setEstado('idle')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  /** Corregir los gramos es la parte importante: de una foto plana no se saca
   *  el volumen, así que los nutrientes se reescalan sobre lo que confirmás. */
  const cambiarGramos = (i: number, gramos: number) => {
    if (!analisis) return
    const a = analisis.alimentos[i]
    const factor = a.gramos > 0 ? gramos / a.gramos : 0
    const nuevos = analisis.alimentos.map((x, j) =>
      j !== i ? x : {
        ...x,
        gramos,
        nutrientes: x.nutrientes
          ? Object.fromEntries(Object.entries(x.nutrientes).map(([k, v]) => [k, Math.round(v * factor * 10) / 10]))
          : x.nutrientes,
      },
    )
    const t: Record<string, number> = {}
    for (const x of nuevos) {
      for (const [k, v] of Object.entries(x.nutrientes ?? {})) t[k] = (t[k] ?? 0) + v
    }
    setAnalisis({ ...analisis, alimentos: nuevos, total: Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ) })
  }

  const quitar = (i: number) => {
    if (!analisis) return
    const nuevos = analisis.alimentos.filter((_, j) => j !== i)
    const t: Record<string, number> = {}
    for (const x of nuevos) for (const [k, v] of Object.entries(x.nutrientes ?? {})) t[k] = (t[k] ?? 0) + v
    setAnalisis({ ...analisis, alimentos: nuevos, total: Object.fromEntries(
      Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]),
    ) })
  }

  const guardar = async () => {
    if (!analisis) return
    setEstado('guardando'); setMensaje('')
    try {
      await enviar('/api/comida/guardar', {
        nombre: nombre.trim() || 'Comida',
        alimentos: analisis.alimentos,
        total: analisis.total,
        nota: analisis.nota,
        origen: 'foto',
        corregido: true,
      })
      await recargar()
      setAnalisis(null); setVista(null); setNombre('')
      setEstado('idle'); setMensaje('Guardada')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-7 space-y-6 page-in">
        <header>
          <h1 className="title-page">Comida</h1>
          <p className="label-plain mt-2">Sacá una foto del plato y se calculan los nutrientes</p>
        </header>

        {!accionesDisponibles && (
          <Insight tone="neutral">
            Analizar fotos necesita el servidor local: por ahora corre con
            <code className="mx-1">npm run dev</code>, no en la versión publicada.
          </Insight>
        )}

        {/* ── Lo que va del día ──────────────────────────────────────────── */}
        <section>
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-[15px] font-semibold text-ink-primary">Hoy</h2>
            <span className="text-[13px] text-ink-muted">
              {delDia.length === 0 ? 'todavía sin registrar' :
               `${delDia.length} ${delDia.length === 1 ? 'comida' : 'comidas'}`}
            </span>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 stagger">
            {MACROS.map(([k, etiqueta, unidad]) => (
              <StatTile key={k} label={etiqueta} value={n(total[k])} unit={unidad} />
            ))}
          </div>
        </section>

        {/* ── Sacar la foto ──────────────────────────────────────────────── */}
        <Card className="p-5">
          <CardHeader
            title="Agregar una comida"
            hint="El modelo identifica los alimentos; los nutrientes salen de una tabla de composición"
          />

          <input
            ref={archivo}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) analizar(f) }}
          />

          <div className="flex flex-wrap gap-3">
            <button
              onClick={() => archivo.current?.click()}
              disabled={!accionesDisponibles || estado === 'analizando'}
              className="px-4 py-2.5 rounded-xl border border-accent text-accent hover:bg-accent
                         hover:text-white text-[15px] font-semibold transition-colors
                         disabled:opacity-50 flex items-center gap-2"
            >
              <Icon name="pasos" size={18} />
              {estado === 'analizando' ? 'Analizando…' : 'Sacar o elegir una foto'}
            </button>
            {vista && (
              <img src={vista} alt="La foto del plato"
                className="h-[46px] w-[46px] object-cover rounded-lg border border-surface-line" />
            )}
          </div>

          {estado === 'analizando' && (
            <div className="mt-4">
              <AIProgress
                titulo="Mirando el plato"
                detalle="identifica los alimentos y busca sus nutrientes en la tabla"
                esperaTipica={35}
                lineas={3}
              />
            </div>
          )}

          {estado === 'error' && <div className="mt-3"><Insight tone="warning">{mensaje}</Insight></div>}
          {mensaje === 'Guardada' && <div className="mt-3"><Insight tone="good">Guardada.</Insight></div>}

          {/* ── El resultado, para corregir antes de guardar ──────────────── */}
          {analisis && (
            <div className="mt-5 pt-5 border-t border-surface-line space-y-4">
              <Insight tone="neutral">
                De una foto no se saca el volumen: la porción es una estimación y es
                lo que más se equivoca. Corregí los gramos antes de guardar — los
                nutrientes se recalculan solos.
              </Insight>

              <div className="space-y-2">
                {analisis.alimentos.map((a, i) => {
                  const c = CONFIANZA[a.confianza ?? 'media'] ?? CONFIANZA.media
                  return (
                    <div key={i} className="flex flex-wrap items-center gap-3 px-4 py-3 rounded-xl
                                            border border-surface-line">
                      <span className="w-2 h-2 rounded-full shrink-0" style={{ background: c.color }}
                        title={c.texto} />
                      <div className="min-w-0 flex-1">
                        <div className="text-[15px] font-medium text-ink-primary truncate">{a.nombre}</div>
                        <div className="text-[12px] text-ink-muted truncate">
                          {a.encontrado
                            ? <>{a.fuente}: {a.coincidencia}</>
                            : <span className="text-state-warning">sin datos nutricionales para esto</span>}
                          {' · '}{c.texto}
                        </div>
                      </div>
                      <label className="flex items-center gap-1.5 shrink-0">
                        <input
                          type="number" min={0} step={5} value={a.gramos}
                          onChange={e => cambiarGramos(i, Number(e.target.value))}
                          className="w-[86px] px-2.5 py-1.5 rounded-lg bg-surface-sunk border
                                     border-surface-line text-[15px] text-ink-primary tabular-nums
                                     focus:outline-none focus:border-accent"
                        />
                        <span className="text-[13px] text-ink-muted">g</span>
                      </label>
                      <span className="w-[74px] text-right metric text-[17px] shrink-0">
                        {n(a.nutrientes?.calorias)}
                      </span>
                      <button onClick={() => quitar(i)} title="Sacar este alimento"
                        className="shrink-0 w-8 h-8 rounded-lg text-ink-muted hover:text-state-critical
                                   hover:bg-surface-hover transition-colors">✕</button>
                    </div>
                  )
                })}
              </div>

              {analisis.nota && <p className="label-plain">{analisis.nota}</p>}

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                {MACROS.map(([k, etiqueta, unidad]) => (
                  <StatTile key={k} label={etiqueta} value={n(analisis.total[k])} unit={unidad} />
                ))}
              </div>

              <details className="rounded-xl border border-surface-line px-4 py-3">
                <summary className="text-[13.5px] text-ink-secondary cursor-pointer">
                  Micronutrientes
                </summary>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-x-6 gap-y-2 mt-3">
                  {MICROS.map(([k, etiqueta, unidad]) => (
                    <div key={k} className="flex items-baseline justify-between gap-2">
                      <span className="text-[13px] text-ink-muted">{etiqueta}</span>
                      <span className="text-[14px] text-ink-primary tabular-nums">
                        {n(analisis.total[k], 1)} <span className="text-ink-muted text-[12px]">{unidad}</span>
                      </span>
                    </div>
                  ))}
                </div>
                <p className="label-plain mt-3">
                  Los micronutrientes salen de la tabla de composición, no del modelo.
                  Sólo suman los alimentos que se pudieron identificar.
                </p>
              </details>

              <div className="flex flex-wrap gap-3 items-end">
                <label className="flex-1 min-w-[200px]">
                  <span className="text-[13px] text-ink-muted block mb-1.5">Nombre</span>
                  <input value={nombre} onChange={e => setNombre(e.target.value)}
                    placeholder="Almuerzo"
                    className="w-full px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line
                               text-[15px] text-ink-primary focus:outline-none focus:border-accent" />
                </label>
                <button onClick={guardar} disabled={estado === 'guardando' || analisis.alimentos.length === 0}
                  className="px-5 py-2.5 rounded-xl border border-accent text-accent hover:bg-accent
                             hover:text-white text-[15px] font-semibold transition-colors disabled:opacity-50">
                  {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ── Lo registrado hoy ───────────────────────────────────────────── */}
        {delDia.length > 0 && (
          <Card className="p-5">
            <CardHeader title="Registrado hoy" hint={`${hoyLocal()}`} />
            <div className="space-y-2">
              {delDia.map(c => (
                <div key={c.id} className="flex items-center gap-4 px-4 py-3 rounded-xl border border-surface-line">
                  <span className="text-[13px] text-ink-muted tabular-nums shrink-0">{c.hora}</span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[15px] font-medium text-ink-primary truncate">{c.nombre}</div>
                    <div className="text-[12px] text-ink-muted truncate">
                      {c.alimentos.map(a => a.nombre).join(' · ')}
                    </div>
                  </div>
                  <span className="metric text-[18px] shrink-0">{n(c.total?.calorias)}</span>
                  <span className="text-[12px] text-ink-muted shrink-0">kcal</span>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
