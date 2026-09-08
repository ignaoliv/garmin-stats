import { useEffect, useRef, useState } from 'react'
import { Card, CardHeader, explicarError } from './ui'
import Icon from './Icon'
import AIProgress from './AIProgress'
import { useObjetivo } from '../hooks/useObjetivo'
import { OBJETIVOS, objetivoPorId, type ComponentePuntuado, type Puntaje } from '../lib/objetivos'
import { enviar } from '../lib/acciones'

interface Palanca { titulo: string; accion: string; porque?: string }

interface Brief {
  titular: string
  estado: 'bien' | 'atencion' | 'alerta'
  lectura: string
  palancas: Palanca[]
  esta_semana: string[]
}

/**
 * El brief cuesta una llamada al modelo, así que sobrevive a un F5.
 *
 * La firma es el objetivo más los puntajes de sus piezas: si alguno cambió, el
 * texto guardado ya no describe estos datos y se descarta en vez de mostrarse
 * viejo. Es exactamente el caso que un simple "guardalo por objetivo" no cubre.
 */
const CACHE = 'gs_objetivo_brief'

function firmaDe(id: string, p: Puntaje) {
  return `${id}:${p.score}:${p.componentes.map(c => `${c.id}=${c.puntos}`).join(',')}`
}

function leerCache(firma: string): Brief | null {
  try {
    const g = JSON.parse(localStorage.getItem(CACHE) || 'null')
    return g?.firma === firma ? (g.brief as Brief) : null
  } catch {
    return null
  }
}

const TONO = {
  bien:     { color: '#34d399', label: 'Bien encaminado' },
  atencion: { color: '#fbbf24', label: 'Hay algo que mover' },
  alerta:   { color: '#f87171', label: 'Atención' },
} as const

/** El color de una pieza sale de su puntaje, y siempre va con el número al
 *  lado: el color solo no le dice nada a quien no distingue verde de naranja. */
function colorDe(puntos: number) {
  if (puntos >= 70) return '#34d399'
  if (puntos >= 50) return '#fbbf24'
  if (puntos >= 30) return '#fb923c'
  return '#f87171'
}

function Pieza({ c }: { c: ComponentePuntuado }) {
  const color = colorDe(c.puntos)
  return (
    <div className="py-2.5 border-b border-white/[0.05] last:border-0">
      <div className="flex items-baseline justify-between gap-3 mb-1.5">
        <span className="text-[14px] text-ink-primary">{c.label}</span>
        <span className="text-[14px] font-semibold tabular-nums shrink-0" style={{ color }}>
          {c.puntos}
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
        <div className="h-full rounded-full transition-[width] duration-700 ease-out"
          style={{ width: `${c.puntos}%`, background: color }} />
      </div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 text-[12px]">
        <span className="text-ink-secondary tabular-nums">{c.valor}</span>
        {/* Contra qué se lo mide: sin esto el puntaje es un veredicto sin juicio. */}
        <span className="text-ink-muted">meta: {c.meta}</span>
      </div>
    </div>
  )
}

/**
 * El objetivo, arriba de todo.
 *
 * El resto del panel contesta "cómo venís". Esta tarjeta contesta "cómo venís
 * para lo que querés", que es otra pregunta: los mismos nueve mil pasos son
 * excelentes para bajar de peso y bastante irrelevantes para correr más rápido.
 *
 * El puntaje y el desglose se calculan en el navegador y están siempre; el
 * brief es lo único que depende del modelo, y se pide apretando un botón. Si
 * el modelo falla, la tarjeta sigue diciendo todo lo que sabe.
 */
export default function ObjetivoCard() {
  const { elegido, elegir, metricas, puntaje } = useObjetivo()
  const objetivo = objetivoPorId(elegido)

  const [brief, setBrief] = useState<Brief | null>(null)
  const [estado, setEstado] = useState<'idle' | 'cargando' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  const firma = firmaDe(elegido, puntaje)

  // Al cambiar de objetivo —o al cambiar los datos— el texto anterior deja de
  // ser cierto, y lo peor que puede hacer es quedarse en pantalla. Se busca el
  // guardado que corresponda a esta firma; si no hay, la tarjeta vuelve al botón.
  const previa = useRef('')
  useEffect(() => {
    if (previa.current === firma) return
    previa.current = firma
    setBrief(leerCache(firma))
    setEstado('idle')
  }, [firma])

  async function pedirBrief() {
    setEstado('cargando')
    setMensaje('')
    try {
      const r = await enviar('/api/objetivo/brief', {
        objetivo: { id: objetivo.id, nombre: objetivo.nombre, resumen: objetivo.resumen },
        score: puntaje.score,
        banda: puntaje.banda.label,
        componentes: puntaje.componentes.map(c => ({
          label: c.label, puntos: c.puntos, peso: c.peso, valor: c.valor, meta: c.meta,
        })),
        faltantes: puntaje.faltantes,
        metricas,
      })
      setBrief(r as unknown as Brief)
      setEstado('idle')
      try {
        localStorage.setItem(CACHE, JSON.stringify({ firma, brief: r }))
      } catch { /* sin persistencia, y ya */ }
    } catch (e) {
      setEstado('error')
      setMensaje(explicarError(e))
    }
  }

  const tono = brief ? TONO[brief.estado] ?? TONO.atencion : null

  return (
    <Card className="p-5">
      <CardHeader
        title="Objetivo"
        hint="Elegí qué querés lograr y tus métricas se puntúan contra eso"
      />

      {/* El selector. En el teléfono desplaza en horizontal en vez de apilarse:
          cinco botones a lo alto empujan el puntaje fuera de la pantalla, que
          es justo lo que se viene a mirar. */}
      <div className="-mx-1 px-1 overflow-x-auto overscroll-x-contain mb-5">
        <div className="flex gap-2 min-w-max" role="tablist" aria-label="Objetivos">
          {OBJETIVOS.map(o => {
            const activo = o.id === elegido
            return (
              <button
                key={o.id}
                role="tab"
                aria-selected={activo}
                onClick={() => elegir(o.id)}
                className={`px-3.5 py-2 rounded-xl text-[13px] font-medium whitespace-nowrap border transition-colors ${
                  activo
                    ? 'text-accent border-accent/50 bg-accent/10'
                    : 'text-ink-secondary border-surface-line hover:border-surface-line-strong hover:bg-surface-hover'
                }`}
              >
                {o.nombre}
              </button>
            )
          })}
        </div>
      </div>

      <p className="text-[13px] text-ink-muted leading-relaxed -mt-3 mb-5">{objetivo.resumen}</p>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
        <div>
          {puntaje.score === null ? (
            <div className="glass-sunk rounded-xl p-4">
              <p className="text-[15px] font-medium text-ink-primary mb-1.5">Todavía no alcanza</p>
              <p className="text-[13px] text-ink-secondary leading-relaxed">
                Para puntuar este objetivo hace falta más de la mitad de sus piezas medidas.
                Faltan: {puntaje.faltantes.join(', ').toLowerCase()}.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-end gap-3 mb-2">
                <span className="text-[56px] leading-none font-bold tabular-nums"
                  style={{ color: puntaje.banda.color }}>
                  {puntaje.score}
                </span>
                <span className="mb-2 px-2.5 py-1 rounded-lg text-[13px] font-semibold border"
                  style={{ color: puntaje.banda.color,
                           borderColor: `${puntaje.banda.color}66`,
                           background: `${puntaje.banda.color}1a` }}>
                  {puntaje.banda.label}
                </span>
              </div>

              <div className="h-2 rounded-full bg-white/[0.06] overflow-hidden mb-1.5">
                <div className="h-full rounded-full transition-[width] duration-700 ease-out"
                  style={{ width: `${puntaje.score}%`, background: puntaje.banda.color }} />
              </div>
              <div className="flex justify-between text-[12px] text-ink-muted mb-3">
                <span>0</span><span>50</span><span>100</span>
              </div>

              <p className="text-[14px] text-ink-secondary leading-relaxed">{puntaje.banda.texto}</p>
            </>
          )}

          {puntaje.score !== null && puntaje.faltantes.length > 0 && (
            <p className="label-plain mt-3">
              Sin datos para {puntaje.faltantes.join(', ').toLowerCase()}:
              {puntaje.faltantes.length === 1 ? ' esa pieza queda' : ' esas piezas quedan'}
              {' '}fuera del puntaje en vez de contar como cero.
            </p>
          )}
        </div>

        <div>
          <div className="label mb-1">Las piezas, de la más floja a la más firme</div>
          {puntaje.componentes.map(c => <Pieza key={c.id} c={c} />)}
        </div>
      </div>

      {/* ── El brief ─────────────────────────────────────────────────────── */}
      <div className="mt-5 pt-4 border-t border-surface-line">
        {estado === 'cargando' ? (
          <AIProgress
            titulo="Leyendo tus métricas contra este objetivo"
            detalle="Llama 3.3 en Cloudflare"
            esperaTipica={25}
          />
        ) : brief ? (
          <div className="fade-in">
            <div className="flex items-start justify-between gap-4 mb-2">
              <div className="min-w-0">
                {tono && (
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tono.color }} />
                    <span className="text-[13px] font-medium" style={{ color: tono.color }}>{tono.label}</span>
                  </div>
                )}
                <h3 className="text-[17px] font-bold text-ink-primary leading-snug">{brief.titular}</h3>
              </div>
              <button onClick={pedirBrief}
                className="shrink-0 text-[13px] font-medium text-ink-muted hover:text-accent">
                Rehacer
              </button>
            </div>

            <p className="text-[14px] text-ink-secondary leading-relaxed mb-4">{brief.lectura}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {brief.palancas.map((p, i) => (
                <div key={i} className="glass-sunk rounded-xl px-4 py-3">
                  <div className="flex items-baseline gap-2 mb-1.5">
                    <span className="text-[12px] font-semibold text-accent tabular-nums">{i + 1}</span>
                    <span className="text-[14px] font-semibold text-ink-primary">{p.titulo}</span>
                  </div>
                  <p className="text-[13px] text-ink-secondary leading-relaxed">{p.accion}</p>
                  {p.porque && <p className="text-[12px] text-ink-muted leading-relaxed mt-1.5">{p.porque}</p>}
                </div>
              ))}
            </div>

            {brief.esta_semana.length > 0 && (
              <div className="mt-4">
                <div className="label mb-2">Esta semana</div>
                <ul className="space-y-1.5">
                  {brief.esta_semana.map((a, i) => (
                    <li key={i} className="flex gap-2.5 text-[14px] text-ink-secondary leading-relaxed">
                      <span className="text-accent shrink-0">·</span>{a}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <button
              onClick={pedirBrief}
              disabled={puntaje.componentes.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[14px] font-medium
                         text-accent border border-accent/50 bg-accent/10
                         hover:bg-accent/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <Icon name="cerebro" size={17} />
              Pedirle el brief a la IA
            </button>
            <span className="text-[13px] text-ink-muted">
              Qué mover primero y qué hacer esta semana, leyendo las piezas juntas.
            </span>
          </div>
        )}

        {estado === 'error' && (
          <p className="text-[13px] text-state-warning mt-3">{mensaje}</p>
        )}
      </div>
    </Card>
  )
}
