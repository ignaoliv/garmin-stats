import { useRef, useState } from 'react'
import { Card, CardHeader, Insight, StatTile, explicarError } from '../components/ui'
import Icon from '../components/Icon'
import AIProgress from '../components/AIProgress'
import BalanceCard from '../components/BalanceCard'
import { enviar, comidaDisponible } from '../lib/acciones'
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

/** Los momentos del día. Son los mismos que acepta fetch/comidas.py. */
const MOMENTOS = ['Desayuno', 'Almuerzo', 'Merienda', 'Cena', 'Colación'] as const
type Momento = typeof MOMENTOS[number]

/** Cuál proponer según la hora.
 *
 *  Escribir el nombre a mano era pedirle tipear a alguien que está por comer,
 *  con una mano en el teléfono. Casi siempre es uno de cinco, y a esta hora
 *  casi siempre es uno solo. */
function momentoProbable(): Momento {
  const h = new Date().getHours()
  if (h < 11) return 'Desayuno'
  if (h < 15) return 'Almuerzo'
  if (h < 19) return 'Merienda'
  if (h < 23) return 'Cena'
  return 'Colación'
}

const n = (v: number | undefined, dec = 0) =>
  v === undefined ? '—' : v.toLocaleString('es-ES', { maximumFractionDigits: dec })

interface Analisis {
  alimentos: AlimentoRegistrado[]
  total: Record<string, number>
  sin_resolver: string[]
  nota: string
}

/** Achica la foto antes de subirla.
 *
 *  Una foto de teléfono son 3 o 4 MB, y en base64 crece un tercio más. Desde
 *  el celular con datos eso es la diferencia entre esperar dos segundos y
 *  esperar veinte, y el modelo no ve nada más por los píxeles de sobra. */
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
    // createImageBitmap no decodifica todo: un HEIC de iPhone que el sistema
    // no convirtió, o un archivo con la extensión cambiada, lo hacen fallar.
    // Achicar es una optimización, no un requisito: si no se puede, se manda
    // la foto tal cual y tarda un poco más. Peor sería no poder cargar nada.
    return await new Promise<string>((ok, fail) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result).split(',')[1])
      r.onerror = () => fail(new Error('No se pudo leer la foto'))
      r.readAsDataURL(f)
    })
  }
}

export default function Comida() {
  // El día que se está mirando. Antes la pantalla era siempre hoy, así que una
  // comida cargada tarde —o el día que te acordaste al otro día— no había forma
  // de tocarla.
  const [dia, setDia] = useState(hoyLocal)
  const { delDia, total, recargar } = useComidas(dia)
  const esHoy = dia === hoyLocal()

  const correrDia = (pasos: number) => {
    const d = new Date(dia + 'T12:00:00')
    d.setDate(d.getDate() + pasos)
    const iso = d.toISOString().slice(0, 10)
    // No se puede editar el futuro: no comiste todavía.
    if (iso <= hoyLocal()) setDia(iso)
  }
  // Una sola entrada, y SIN `capture`: con capture el teléfono abre la cámara
  // directo y no deja llegar al carrete. Sin él, iOS muestra su hoja con las
  // tres opciones —fototeca, sacar foto, elegir archivo— que es la elección
  // que el sistema ya sabe presentar mejor que dos botones nuestros.
  const archivo = useRef<HTMLInputElement>(null)

  const [analisis, setAnalisis] = useState<Analisis | null>(null)
  const [vista, setVista] = useState<string | null>(null)
  const [momento, setMomento] = useState<Momento>(momentoProbable)
  const [estado, setEstado] = useState<'idle' | 'analizando' | 'guardando' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [texto, setTexto] = useState('')
  const [nuevoNombre, setNuevoNombre] = useState('')
  const [nuevoGramos, setNuevoGramos] = useState('')
  /** Qué fila está esperando a la tabla; -1 es la de agregar. */
  const [buscando, setBuscando] = useState<number | null>(null)
  /** El id de la comida guardada que se está editando, si es que hay una. */
  const [editando, setEditando] = useState<{ id: string; hora: string } | null>(null)
  /** Qué alimento tiene abiertas sus alternativas. */
  const [abierto, setAbierto] = useState<number | null>(null)

  const analizar = async (f: File) => {
    setEstado('analizando'); setMensaje(''); setAnalisis(null)
    setVista(URL.createObjectURL(f))
    try {
      const b64 = await achicar(f)
      const r = await enviar('/api/comida/analizar', { imagen_b64: b64, nota: texto.trim() })
      setAnalisis(r as unknown as Analisis)
      setEstado('idle')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  /** El total sale SIEMPRE de la lista, nunca se ajusta a mano.
   *
   *  Con alimentos que se agregan, se sacan, se renombran y se reescalan, un
   *  total que se actualiza por su cuenta se desincroniza en cuanto se olvide
   *  un camino. Recalcularlo entero es barato y no puede quedar mal. */
  const conTotal = (alimentos: AlimentoRegistrado[], resto: Partial<Analisis> = {}) => {
    const t: Record<string, number> = {}
    for (const x of alimentos) {
      for (const [k, v] of Object.entries(x.nutrientes ?? {})) t[k] = (t[k] ?? 0) + v
    }
    setAnalisis({
      nota: analisis?.nota ?? '',
      sin_resolver: alimentos.filter(x => !x.encontrado).map(x => x.nombre),
      ...analisis,
      ...resto,
      alimentos,
      total: Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10])),
    } as Analisis)
  }

  /** Corregir los gramos es la parte importante: de una foto plana no se saca
   *  el volumen, así que los nutrientes se reescalan sobre lo que confirmás. */
  const cambiarGramos = (i: number, gramos: number) => {
    if (!analisis) return
    const a = analisis.alimentos[i]
    const factor = a.gramos > 0 ? gramos / a.gramos : 0
    conTotal(analisis.alimentos.map((x, j) =>
      j !== i ? x : {
        ...x,
        gramos,
        nutrientes: x.nutrientes
          ? Object.fromEntries(Object.entries(x.nutrientes).map(([k, v]) => [k, Math.round(v * factor * 10) / 10]))
          : x.nutrientes,
      },
    ))
  }

  /** Cambiar el alimento por otro de la tabla.
   *
   *  No vuelve a la red: los candidatos vinieron con sus valores por 100 g en
   *  la misma búsqueda, así que sólo hay que reescalarlos a los gramos que ya
   *  están puestos. */
  const cambiarAlimento = (i: number, alt: NonNullable<AlimentoRegistrado['alternativas']>[number]) => {
    if (!analisis) return
    const a = analisis.alimentos[i]
    const factor = a.gramos / 100
    // El elegido y el que estaba se intercambian de lugar: así se puede volver
    // atrás si te arrepentís, sin perder la opción anterior.
    const resto = (a.alternativas ?? []).filter(x => x.descripcion !== alt.descripcion)
    const previo = a.coincidencia && a.nutrientes
      ? [{ descripcion: a.coincidencia, fuente: a.fuente ?? 'USDA',
           por_100g: Object.fromEntries(
             Object.entries(a.nutrientes).map(([k, v]) => [k, Math.round((v / (factor || 1)) * 10) / 10])) }]
      : []
    conTotal(analisis.alimentos.map((x, j) => j !== i ? x : {
      ...x,
      encontrado: true,
      fuente: alt.fuente ?? 'USDA',
      coincidencia: alt.descripcion,
      nutrientes: Object.fromEntries(
        Object.entries(alt.por_100g).map(([k, v]) => [k, Math.round(v * factor * 10) / 10])),
      alternativas: [...previo, ...resto],
    }))
    setAbierto(null)
  }

  const quitar = (i: number) => {
    if (!analisis) return
    conTotal(analisis.alimentos.filter((_, j) => j !== i))
  }

  /** Renombrar vuelve a buscar en la tabla.
   *
   *  Es el arreglo de fondo para cuando el modelo identifica mal: antes podías
   *  corregir los gramos de algo que no era lo que comiste, o sea corregir la
   *  cantidad de un alimento equivocado. Ahora escribís qué era y los números
   *  se rehacen contra la tabla. */
  const renombrar = async (i: number, nombre: string) => {
    if (!analisis) return
    const a = analisis.alimentos[i]
    if (!nombre.trim() || nombre.trim() === a.nombre) return
    setBuscando(i)
    try {
      const r = await enviar('/api/comida/alimento', { nombre: nombre.trim(), gramos: a.gramos })
      const nuevo = (r as unknown as Analisis).alimentos[0]
      if (nuevo) conTotal(analisis.alimentos.map((x, j) => (j === i ? nuevo : x)))
    } catch (e) {
      setMensaje(explicarError(e))
    } finally {
      setBuscando(null)
    }
  }

  const agregar = async () => {
    const nombre = nuevoNombre.trim()
    const gramos = Number(nuevoGramos)
    if (!nombre || !(gramos > 0)) return
    setBuscando(-1)
    try {
      const r = await enviar('/api/comida/alimento', { nombre, gramos })
      const nuevo = (r as unknown as Analisis).alimentos[0]
      if (nuevo) {
        conTotal([...(analisis?.alimentos ?? []), nuevo])
        setNuevoNombre(''); setNuevoGramos('')
      }
    } catch (e) {
      setMensaje(explicarError(e))
    } finally {
      setBuscando(null)
    }
  }

  /** Describir lo que comiste, con o sin foto.
   *
   *  Con foto, el texto viaja como nota y guía la identificación — el backend
   *  siempre lo aceptó y la pantalla nunca se lo mandaba, que era parte de por
   *  qué acertaba menos de lo que podía. Sin foto, es la entrada principal:
   *  vos sabés que eran dos milanesas, la foto tiene que adivinarlo. */
  const describir = async () => {
    if (!texto.trim()) return
    setEstado('analizando'); setMensaje('')
    try {
      const r = await enviar('/api/comida/texto', { texto: texto.trim() })
      const nuevo = r as unknown as Analisis
      if (analisis) conTotal([...analisis.alimentos, ...nuevo.alimentos])
      else setAnalisis(nuevo)
      setTexto('')
      setEstado('idle')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  /** Traer una comida guardada al editor de arriba.
   *
   *  Reusa el mismo bloque de corrección que usa una foto recién analizada, en
   *  vez de tener un segundo editor: son la misma tarea —revisar alimentos y
   *  gramos— y dos editores se desincronizan en cuanto uno cambie. */
  const editar = (c: typeof delDia[number]) => {
    setEditando({ id: c.id, hora: c.hora })
    setAnalisis({
      alimentos: c.alimentos,
      total: c.total ?? {},
      sin_resolver: c.alimentos.filter(a => !a.encontrado).map(a => a.nombre),
      nota: c.nota ?? '',
    })
    const m = MOMENTOS.find(x => x.toLowerCase() === (c.momento ?? '').toLowerCase())
    setMomento(m ?? momentoProbable())
    setVista(null); setMensaje('')
    document.getElementById('editor-comida')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const cancelar = () => {
    setEditando(null); setAnalisis(null); setVista(null); setMensaje('')
  }

  const borrar = async (id: string) => {
    setEstado('guardando')
    try {
      await enviar('/api/comida/guardar', { id, borrar: true })
      await recargar()
      if (editando?.id === id) cancelar()
      setEstado('idle'); setMensaje('Borrada')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  const guardar = async () => {
    if (!analisis) return
    setEstado('guardando'); setMensaje('')
    try {
      await enviar('/api/comida/guardar', {
        // Con id, el servidor reemplaza en vez de agregar: eso es editar.
        ...(editando ? { id: editando.id, hora: editando.hora } : {}),
        // La fecha va SIEMPRE explícita. Sin esto el servidor la calcula como
        // "ahora", y editar una comida de anteayer la mudaba a hoy.
        fecha: dia,
        nombre: momento,
        momento: momento.toLowerCase(),
        alimentos: analisis.alimentos,
        total: analisis.total,
        nota: analisis.nota,
        origen: 'foto',
        corregido: true,
      })
      await recargar()
      setAnalisis(null); setVista(null); setMomento(momentoProbable()); setEditando(null)
      setEstado('idle'); setMensaje(editando ? 'Actualizada' : 'Guardada')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-4 sm:px-6 py-6 sm:py-7 space-y-6 page-in">
        <header>
          <h1 className="title-page">Comida</h1>
          <p className="label-plain mt-2">Sacá una foto o escribí lo que comiste. Elegí el día para cargar o corregir hacia atrás</p>
        </header>

        {/* ── Lo que va del día ──────────────────────────────────────────── */}
        <section>
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-1.5">
              <button onClick={() => correrDia(-1)} aria-label="Día anterior"
                className="w-9 h-9 rounded-lg border border-surface-line text-ink-secondary
                           hover:text-ink-primary hover:bg-surface-hover">‹</button>
              {/* Un campo de fecha nativo: en el teléfono abre el selector del
                  sistema, que se maneja mejor que cualquier calendario nuestro. */}
              <input type="date" value={dia} max={hoyLocal()}
                onChange={e => { if (e.target.value) setDia(e.target.value) }}
                aria-label="Día que estás mirando"
                className="px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line
                           text-[15px] text-ink-primary tabular-nums
                           focus:outline-none focus:border-accent" />
              <button onClick={() => correrDia(1)} disabled={esHoy} aria-label="Día siguiente"
                className="w-9 h-9 rounded-lg border border-surface-line text-ink-secondary
                           hover:text-ink-primary hover:bg-surface-hover disabled:opacity-30">›</button>
              {!esHoy && (
                <button onClick={() => setDia(hoyLocal())}
                  className="ml-1 px-3 py-2 rounded-lg text-[13px] text-accent hover:bg-accent/10">
                  Hoy
                </button>
              )}
            </div>
            <span className="text-[13px] text-ink-muted">
              {delDia.length === 0 ? 'sin registrar' :
               `${delDia.length} ${delDia.length === 1 ? 'comida' : 'comidas'}`}
            </span>
          </div>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 stagger">
            {MACROS.map(([k, etiqueta, unidad]) => (
              <StatTile key={k} label={etiqueta} value={n(total[k])} unit={unidad} />
            ))}
          </div>
        </section>

        <BalanceCard />

        {/* ── Sacar la foto ──────────────────────────────────────────────── */}
        <Card className="p-5" id="editor-comida">
          <CardHeader
            title={editando
              ? `Editando la comida de las ${editando.hora}`
              : esHoy ? 'Agregar una comida' : `Agregar una comida al ${dia.split('-').reverse().slice(0, 2).join('/')}`}
            hint="El modelo identifica los alimentos; los nutrientes salen de una tabla de composición. Todo se puede corregir antes de guardar"
          />

          <input
            ref={archivo} type="file" accept="image/*" className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) analizar(f); e.target.value = '' }}
          />

          {/* Un solo campo con dos usos, y por eso el texto de ayuda cambia:
              solo, es la entrada principal —vos sabés que eran dos milanesas y
              la foto tiene que adivinarlo—; junto a una foto, viaja como nota
              y guía la identificación. */}
          <div className="mb-3">
            <textarea
              value={texto}
              onChange={e => setTexto(e.target.value)}
              rows={2}
              placeholder="Contá qué comiste: dos milanesas con puré y una ensalada"
              aria-label="Descripción de lo que comiste"
              className="w-full px-3 py-2.5 rounded-xl bg-surface-sunk border border-surface-line
                         text-[16px] text-ink-primary leading-relaxed resize-y
                         focus:outline-none focus:border-accent placeholder:text-ink-faint"
            />
            <div className="flex flex-wrap items-center gap-3 mt-2">
              <button
                onClick={describir}
                disabled={!texto.trim() || estado === 'analizando'}
                className="px-4 py-2.5 rounded-xl bg-accent text-white text-[15px] font-semibold
                           hover:bg-accent-soft disabled:opacity-40"
              >
                {estado === 'analizando' ? 'Calculando…' : 'Agregar lo que escribí'}
              </button>
              <span className="text-[13px] text-ink-muted">
                {analisis
                  ? 'Se suma a la lista de abajo.'
                  : 'O sacá una foto: si escribís algo también, sirve de pista para identificar el plato.'}
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => archivo.current?.click()}
              disabled={!comidaDisponible || estado === 'analizando'}
              className="px-4 py-2.5 rounded-xl border border-accent text-accent hover:bg-accent
                         hover:text-white text-[15px] font-semibold transition-colors
                         disabled:opacity-50 flex items-center gap-2"
            >
              <Icon name="camara" size={18} />
              {estado === 'analizando' ? 'Analizando…' : 'Agregar una foto'}
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
                {editando
                  ? 'Cambiá lo que haga falta: los nombres vuelven a buscarse en la tabla y los nutrientes se recalculan solos.'
                  : 'De una foto no se saca el volumen: la porción es una estimación y es lo que más se equivoca. Corregí los gramos antes de guardar — los nutrientes se recalculan solos.'}
              </Insight>

              <div className="space-y-2">
                {analisis.alimentos.map((a, i) => {
                  const c = CONFIANZA[a.confianza ?? 'media'] ?? CONFIANZA.media
                  return (
                    /* En el teléfono el nombre va en su propia línea y los
                       controles debajo. Todo en una fila dejaba los nombres en
                       "C…", "E…", "B…" — y no se puede corregir la porción de
                       algo que no se lee. */
                    <div key={i} className="px-4 py-3 rounded-xl border border-surface-line">
                      <div className="flex items-start gap-2.5">
                        <span className="w-2 h-2 rounded-full shrink-0 mt-2"
                          style={{ background: c.color }} title={c.texto} />
                        <div className="min-w-0 flex-1">
                          {/* El nombre es un campo, no un rótulo. Si el modelo
                              erró el alimento, corregir los gramos sólo
                              corregía la cantidad de algo equivocado. */}
                          <input
                            defaultValue={a.nombre}
                            onBlur={e => renombrar(i, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
                            aria-label={`Nombre del alimento ${i + 1}`}
                            className="w-full bg-transparent text-[15px] font-medium text-ink-primary
                                       rounded-md -ml-1 px-1 py-0.5 border border-transparent
                                       hover:border-surface-line focus:outline-none focus:border-accent
                                       focus:bg-surface-sunk"
                          />
                          <div className="text-[12px] text-ink-muted px-1">
                            {buscando === i
                              ? <span className="text-accent">buscando en la tabla…</span>
                              : a.encontrado
                                ? <>{a.fuente}: {a.coincidencia}</>
                                : <span className="text-state-warning">sin datos nutricionales para esto</span>}
                            {buscando !== i && <>{' · '}{c.texto}</>}
                          </div>

                          {/* De dónde salió el número, y cómo cambiarlo.
                              La tabla lista los derivados pegados al alimento
                              —harina de papa, manzana deshidratada, clara de
                              huevo— y ninguna regla los separa siempre bien.
                              Cuando el puntaje se equivoca, elegís vos. */}
                          {(a.alternativas?.length ?? 0) > 0 && (
                            <div className="px-1 mt-1">
                              <button
                                onClick={() => setAbierto(abierto === i ? null : i)}
                                className="text-[12px] text-accent hover:underline"
                              >
                                {abierto === i ? 'Cerrar' : '¿No es esto? Elegir otro'}
                              </button>
                              {abierto === i && (
                                <div className="mt-1.5 space-y-1">
                                  {a.alternativas!.map(alt => (
                                    <button
                                      key={alt.descripcion}
                                      onClick={() => cambiarAlimento(i, alt)}
                                      className="w-full flex items-baseline gap-2 text-left px-2.5 py-2
                                                 rounded-lg border border-surface-line
                                                 hover:border-accent hover:bg-accent/[0.06]
                                                 transition-colors"
                                    >
                                      <span className="text-[13px] text-ink-secondary flex-1 min-w-0">
                                        {alt.descripcion}
                                      </span>
                                      <span className="text-[13px] text-ink-primary tabular-nums shrink-0">
                                        {Math.round((alt.por_100g.calorias ?? 0) * a.gramos / 100)}
                                        <span className="text-ink-muted"> kcal</span>
                                      </span>
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                        <button onClick={() => quitar(i)} title="Sacar este alimento"
                          aria-label={`Sacar ${a.nombre}`}
                          className="shrink-0 -mt-1 -mr-1 w-9 h-9 rounded-lg text-ink-muted
                                     hover:text-state-critical hover:bg-surface-hover
                                     transition-colors">✕</button>
                      </div>

                      <div className="flex items-center gap-3 mt-2.5 pl-[18px]">
                        <label className="flex items-center gap-1.5">
                          <input
                            type="number" min={0} step={5} value={a.gramos}
                            onChange={e => cambiarGramos(i, Number(e.target.value))}
                            aria-label={`Gramos de ${a.nombre}`}
                            className="w-[92px] px-2.5 py-2 rounded-lg bg-surface-sunk border
                                       border-surface-line text-[16px] text-ink-primary tabular-nums
                                       focus:outline-none focus:border-accent"
                          />
                          <span className="text-[13px] text-ink-muted">g</span>
                        </label>
                        <span className="ml-auto metric text-[19px]">
                          {n(a.nutrientes?.calorias)}
                          <span className="metric-unit">kcal</span>
                        </span>
                      </div>
                    </div>
                  )
                })}
                {/* Agregar lo que el modelo no vio: una guarnición tapada,
                    el aceite de cocción, el pan que va aparte. */}
                <div className="flex flex-wrap items-center gap-2 px-4 py-3 rounded-xl
                                border border-dashed border-surface-line">
                  <input
                    value={nuevoNombre}
                    onChange={e => setNuevoNombre(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') agregar() }}
                    placeholder="Agregar un alimento"
                    aria-label="Nombre del alimento a agregar"
                    className="flex-1 min-w-[140px] px-2.5 py-2 rounded-lg bg-surface-sunk
                               border border-surface-line text-[16px] text-ink-primary
                               focus:outline-none focus:border-accent"
                  />
                  <input
                    type="number" min={1} step={10} value={nuevoGramos}
                    onChange={e => setNuevoGramos(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') agregar() }}
                    placeholder="g"
                    aria-label="Gramos del alimento a agregar"
                    className="w-[86px] px-2.5 py-2 rounded-lg bg-surface-sunk border
                               border-surface-line text-[16px] text-ink-primary tabular-nums
                               focus:outline-none focus:border-accent"
                  />
                  <button
                    onClick={agregar}
                    disabled={!nuevoNombre.trim() || !(Number(nuevoGramos) > 0) || buscando === -1}
                    className="px-3.5 py-2 rounded-lg border border-accent text-accent text-[14px]
                               font-semibold hover:bg-accent hover:text-white transition-colors
                               disabled:opacity-40 disabled:hover:bg-transparent
                               disabled:hover:text-accent"
                  >
                    {buscando === -1 ? 'Buscando…' : 'Agregar'}
                  </button>
                </div>
              </div>

              {analisis.nota && <p className="label-plain">{analisis.nota}</p>}

              <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
                {MACROS.map(([k, etiqueta, unidad]) => (
                  <StatTile key={k} label={etiqueta} value={n(analisis.total[k])} unit={unidad} />
                ))}
              </div>

              <details className="rounded-xl border border-surface-line px-4 py-3">
                <summary className="text-[13.5px] text-ink-secondary cursor-pointer">
                  Micronutrientes
                </summary>
                <div className="grid grid-cols-2 xl:grid-cols-4 gap-x-6 gap-y-2 mt-3">
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

              <div>
                <span className="text-[13px] text-ink-muted block mb-2">Qué comida es</span>
                <div className="flex flex-wrap gap-2" role="radiogroup" aria-label="Momento del día">
                  {MOMENTOS.map(m => {
                    const elegido = m === momento
                    return (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={elegido}
                        onClick={() => setMomento(m)}
                        className={`px-3.5 py-2 rounded-lg text-[14px] font-medium border
                                    transition-colors ${
                          elegido
                            ? 'bg-accent/15 border-accent/50 text-accent'
                            : 'bg-surface-card border-surface-line text-ink-muted hover:text-ink-secondary'
                        }`}
                      >
                        {m}
                      </button>
                    )
                  })}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button onClick={guardar} disabled={estado === 'guardando' || analisis.alimentos.length === 0}
                  className="flex-1 min-w-[180px] py-3 rounded-xl border border-accent text-accent
                             hover:bg-accent hover:text-white text-[15px] font-semibold
                             transition-colors disabled:opacity-50">
                  {estado === 'guardando' ? 'Guardando…'
                    : editando ? 'Guardar los cambios'
                    : `Guardar ${momento.toLowerCase()}`}
                </button>
                {/* Salir sin guardar. Sin esto, abrir una comida para mirarla
                    te dejaba encerrado en el editor. */}
                <button onClick={cancelar}
                  className="px-5 py-3 rounded-xl border border-surface-line text-ink-secondary
                             hover:text-ink-primary hover:bg-surface-hover text-[15px]">
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </Card>

        {/* ── Lo registrado hoy ───────────────────────────────────────────── */}
        {delDia.length > 0 && (
          <Card className="p-5">
            <CardHeader
              title={esHoy ? 'Registrado hoy' : 'Registrado ese día'}
              hint="Tocá una comida para corregirla"
            />
            <div className="space-y-2">
              {delDia.map(c => (
                <div key={c.id}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl border transition-colors ${
                    editando?.id === c.id
                      ? 'border-accent bg-accent/[0.07]'
                      : 'border-surface-line hover:border-surface-line-strong'
                  }`}>
                  <button onClick={() => editar(c)}
                    className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    aria-label={`Editar ${c.nombre}`}>
                    <span className="text-[13px] text-ink-muted tabular-nums shrink-0">{c.hora}</span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[15px] font-medium text-ink-primary truncate">{c.nombre}</span>
                      <span className="block text-[12px] text-ink-muted truncate">
                        {c.alimentos.map(a => a.nombre).join(' · ')}
                      </span>
                    </span>
                    <span className="metric text-[18px] shrink-0">{n(c.total?.calorias)}</span>
                    <span className="text-[12px] text-ink-muted shrink-0">kcal</span>
                  </button>
                  <button onClick={() => borrar(c.id)} title="Borrar esta comida"
                    aria-label={`Borrar ${c.nombre}`}
                    className="shrink-0 w-9 h-9 rounded-lg text-ink-muted hover:text-state-critical
                               hover:bg-surface-hover transition-colors">✕</button>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>
    </div>
  )
}
