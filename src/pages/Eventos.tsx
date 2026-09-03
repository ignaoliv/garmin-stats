import { useState } from 'react'
import { Card } from '../components/ui'
import Icon from '../components/Icon'
import PlanGenerator from '../components/PlanGenerator'
import { useActivityStore } from '../stores/activityStore'
import { useFitnessHistory } from '../hooks/useFitnessHistory'
import { proyectarForma, tssDiarioReciente, cargaNecesaria } from '../utils/proyeccion'
import {
  useEventos, cuentaRegresiva, diasHasta, ETIQUETA_DISCIPLINA, type Evento,
} from '../hooks/useEventos'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

const tituloMes = (f: string) => {
  const [a, m] = f.split('-').map(Number)
  return `${MESES[m - 1]} ${a}`
}

const diaCorto = (f: string) => {
  const [, m, d] = f.split('-').map(Number)
  return { dia: String(d), mes: MESES[m - 1].slice(0, 3) }
}

function Chip({ activo, onClick, children }: {
  activo: boolean; onClick: () => void; children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={activo}
      className={`px-3 py-1.5 rounded-lg text-[13px] font-medium whitespace-nowrap border transition-colors ${
        activo
          ? 'bg-accent/15 border-accent/50 text-accent'
          : 'bg-surface-card border-surface-line text-ink-muted hover:text-ink-secondary hover:border-surface-line-strong'
      }`}
    >
      {children}
    </button>
  )
}

function BotonVoy({ marcado, onClick }: { marcado: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={marcado}
      title={marcado ? 'Sacarla de tus carreras' : 'Marcar que vas'}
      className={`shrink-0 px-3 py-1.5 rounded-lg text-[13px] font-medium border transition-colors ${
        marcado
          ? 'bg-state-good/15 border-state-good/50 text-state-good'
          : 'bg-surface-card border-surface-line text-ink-muted hover:text-ink-primary hover:border-surface-line-strong'
      }`}
    >
      {marcado ? '✓ Vas' : 'Voy'}
    </button>
  )
}

/** Con qué forma llegás si seguís entrenando como venís. */
function Proyeccion({ dias }: { dias: number }) {
  const actividades = useActivityStore(s => s.activities)
  const { current } = useFitnessHistory()
  if (!current || dias <= 0) return null

  const tssDiario = tssDiarioReciente(actividades, 28)
  const p = proyectarForma(current.ctl, current.atl, tssDiario, dias)
  const cambio = p.ctl - Math.round(current.ctl)
  const paraDiez = cargaNecesaria(current.ctl, current.ctl + 10, dias)

  return (
    <div className="mt-4 pt-4 border-t border-surface-line">
      <p className="label mb-2">Si seguís así</p>
      <div className="flex items-baseline gap-4 flex-wrap">
        <span className="text-[14px] text-ink-secondary">
          Llegás con fitness <strong className="text-ink-primary metric">{p.ctl}</strong>
          <span className="text-ink-muted">
            {' '}({cambio >= 0 ? '+' : ''}{cambio} desde {Math.round(current.ctl)})
          </span>
        </span>
      </div>
      <p className="text-[13px] text-ink-muted mt-1.5 leading-relaxed">
        Asume que sostenés los {p.tssDiario} TSS por día de las últimas 4 semanas.
        {paraDiez !== null && paraDiez > p.tssDiario && (
          <> Para llegar 10 puntos más arriba harían falta {paraDiez} TSS diarios.</>
        )}
      </p>
    </div>
  )
}

function FilaEvento({ ev, marcado, onToggle }: {
  ev: Evento; marcado: boolean; onToggle: () => void
}) {
  const { dia, mes } = diaCorto(ev.fecha)
  return (
    <div className="flex items-center gap-4 px-4 py-3 rounded-xl border border-surface-line
                    hover:border-surface-line-strong hover:bg-surface-hover transition-colors">
      <div className="shrink-0 w-12 text-center">
        <div className="metric text-[20px] leading-none text-ink-primary">{dia}</div>
        <div className="text-[11px] text-ink-muted uppercase tracking-wide mt-0.5">{mes}</div>
      </div>

      <div className="min-w-0 flex-1">
        <a
          href={ev.url} target="_blank" rel="noopener noreferrer"
          className="text-[15px] font-semibold text-ink-primary hover:text-accent transition-colors block truncate"
        >
          {ev.nombre}
        </a>
        <p className="text-[13px] text-ink-muted truncate mt-0.5">
          {ETIQUETA_DISCIPLINA[ev.disciplina] ?? ev.disciplina}
          {ev.localidad && <> · {ev.localidad}</>}
          {ev.provincia && ev.provincia !== ev.localidad && <>, {ev.provincia}</>}
        </p>
      </div>

      <span className="hidden sm:block shrink-0 text-[13px] text-ink-muted tabular-nums">
        {cuentaRegresiva(ev.fecha)}
      </span>
      <BotonVoy marcado={marcado} onClick={onToggle} />
    </div>
  )
}

export default function Eventos() {
  const {
    cargando, actualizado, filtrados, mios, voy, prefs, actualizarPrefs, alternarVoy,
    disciplinasDisponibles, provinciasDisponibles, total,
  } = useEventos()
  const [preparando, setPreparando] = useState<Evento | null>(null)

  const marco = (hijo: React.ReactNode) => (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 py-7 space-y-6 page-in">
        <header>
          <h1 className="title-page">Carreras</h1>
          <p className="label-plain mt-2">
            Las carreras de tu zona y cómo llegás a las que elegís
          </p>
        </header>
        {hijo}
      </div>
    </div>
  )

  if (cargando) {
    return marco(<p className="text-[15px] text-ink-secondary animate-pulse">Cargando el calendario…</p>)
  }

  if (total === 0) {
    return marco(
      <Card className="p-6">
        <h2 className="text-[17px] font-semibold text-ink-primary mb-2">Todavía no bajaste el calendario</h2>
        <p className="text-[14px] text-ink-secondary mb-4">
          Las carreras salen de calendariodecarreras.ar, que las publica como datos estructurados.
          El botón de sincronizar también las actualiza.
        </p>
        <code className="block bg-surface-overlay border border-surface-line rounded-lg p-3
                         font-mono text-[13px] text-ink-secondary">
          python3 fetch/eventos.py
        </code>
      </Card>,
    )
  }

  const alternarDisciplina = (d: string) => {
    const puestas = prefs.disciplinas.includes(d)
      ? prefs.disciplinas.filter(x => x !== d)
      : [...prefs.disciplinas, d]
    actualizarPrefs({ disciplinas: puestas })
  }

  // Agrupado por mes: una lista corrida de cien carreras no se lee.
  const porMes = new Map<string, Evento[]>()
  for (const e of filtrados) {
    const k = e.fecha.slice(0, 7)
    if (!porMes.has(k)) porMes.set(k, [])
    porMes.get(k)!.push(e)
  }

  return marco(
    <>
      {mios.length > 0 && (
        <section>
          <h2 className="text-[15px] font-semibold text-ink-primary mb-3">Tus carreras</h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 stagger">
            {mios.map(ev => {
              const dias = diasHasta(ev.fecha)
              return (
                <Card key={ev.id} className="p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="label">
                        {ETIQUETA_DISCIPLINA[ev.disciplina] ?? ev.disciplina} · {ev.localidad}
                      </p>
                      <a
                        href={ev.url} target="_blank" rel="noopener noreferrer"
                        className="text-[16px] font-semibold text-ink-primary hover:text-accent
                                   transition-colors block leading-snug"
                      >
                        {ev.nombre}
                      </a>
                    </div>
                    <BotonVoy marcado onClick={() => alternarVoy(ev.id)} />
                  </div>

                  <div className="flex items-end gap-2 mt-3">
                    <span className="metric-lg text-accent leading-none">{dias}</span>
                    <span className="text-[13px] text-ink-muted mb-1">
                      {dias === 1 ? 'día' : 'días'}
                      {dias >= 14 && <> · {Math.floor(dias / 7)} semanas</>}
                    </span>
                  </div>

                  <Proyeccion dias={dias} />

                  <button
                    onClick={() => setPreparando(preparando?.id === ev.id ? null : ev)}
                    className="mt-4 w-full py-2 rounded-lg border border-surface-line text-[13.5px]
                               font-medium text-ink-secondary hover:text-ink-primary
                               hover:border-surface-line-strong hover:bg-surface-hover transition-colors"
                  >
                    {preparando?.id === ev.id ? 'Cerrar el plan' : 'Preparar un plan hasta esta carrera'}
                  </button>
                </Card>
              )
            })}
          </div>

          {preparando && (
            <div className="mt-4">
              <PlanGenerator
                key={preparando.id}
                evento={{
                  nombre: preparando.nombre,
                  fecha: preparando.fecha,
                  disciplina: preparando.disciplina,
                  localidad: preparando.localidad,
                }}
              />
            </div>
          )}
        </section>
      )}

      <section className="space-y-3">
        <h2 className="text-[15px] font-semibold text-ink-primary">Qué se viene en tu zona</h2>
        <div className="flex flex-wrap items-center gap-2">
          {disciplinasDisponibles.map(([d, n]) => (
            <Chip key={d} activo={prefs.disciplinas.includes(d)} onClick={() => alternarDisciplina(d)}>
              {ETIQUETA_DISCIPLINA[d] ?? d} <span className="text-ink-faint">{n}</span>
            </Chip>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Chip activo={!prefs.provincia} onClick={() => actualizarPrefs({ provincia: null })}>
            Todo el país
          </Chip>
          {provinciasDisponibles.slice(0, 8).map(([p, n]) => (
            <Chip key={p} activo={prefs.provincia === p} onClick={() => actualizarPrefs({ provincia: p })}>
              {p} <span className="text-ink-faint">{n}</span>
            </Chip>
          ))}
        </div>
      </section>

      {filtrados.length === 0 ? (
        <Card className="p-6">
          <p className="text-[15px] text-ink-secondary">
            No hay carreras con esos filtros. Probá sumando disciplinas o mirando todo el país.
          </p>
        </Card>
      ) : (
        [...porMes.entries()].map(([mes, eventos]) => (
          <section key={mes}>
            <div className="flex items-baseline justify-between mb-3">
              <h3 className="text-[15px] font-semibold text-ink-primary capitalize">
                {tituloMes(eventos[0].fecha)}
              </h3>
              <span className="text-[13px] text-ink-muted">
                {eventos.length} {eventos.length === 1 ? 'carrera' : 'carreras'}
              </span>
            </div>
            <div className="space-y-2">
              {eventos.map(ev => (
                <FilaEvento key={ev.id} ev={ev} marcado={voy.includes(ev.id)}
                  onToggle={() => alternarVoy(ev.id)} />
              ))}
            </div>
          </section>
        ))
      )}

      <p className="flex items-center gap-2 text-[12px] text-ink-muted pt-2">
        <Icon name="info" size={14} />
        {filtrados.length} de {total} carreras · fuente calendariodecarreras.ar
        {actualizado && <> · actualizado el {actualizado}</>}
      </p>
    </>,
  )
}
