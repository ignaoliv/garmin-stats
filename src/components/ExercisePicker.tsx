import { useEffect, useMemo, useState } from 'react'

export interface Ejercicio {
  id: string
  nombre: string
  categoria: string
  claveGarmin: string | null
  equipo: string | null
  nivel: string | null
  mecanica: string | null
  fuerza: string | null
  primarios: string[]
  secundarios: string[]
  instrucciones: string[]
  imagenes: string[]
}

const MUSCULO_ES: Record<string, string> = {
  abdominals: 'abdominales', abductors: 'abductores', adductors: 'aductores',
  biceps: 'bíceps', calves: 'gemelos', chest: 'pecho', forearms: 'antebrazos',
  glutes: 'glúteos', hamstrings: 'isquios', lats: 'dorsales',
  'lower back': 'lumbares', 'middle back': 'espalda media', neck: 'cuello',
  quadriceps: 'cuádriceps', shoulders: 'hombros', traps: 'trapecios', triceps: 'tríceps',
}
export const musculoEs = (m: string) => MUSCULO_ES[m] ?? m

const NIVEL_ES: Record<string, string> = { beginner: 'principiante', intermediate: 'intermedio', expert: 'avanzado' }

/**
 * Two-frame loop of the exercise photos.
 *
 * free-exercise-db ships a start and an end position per exercise, so alternating
 * them reads as the movement itself — closer to what you need before choosing an
 * exercise than a single still.
 */
function Animacion({ imagenes, alt, activo }: { imagenes: string[]; alt: string; activo: boolean }) {
  const [frame, setFrame] = useState(0)
  useEffect(() => {
    if (!activo || imagenes.length < 2) return
    const id = setInterval(() => setFrame(f => (f + 1) % imagenes.length), 850)
    return () => clearInterval(id)
  }, [activo, imagenes.length])

  if (!imagenes.length) {
    return <div className="w-full aspect-[4/3] rounded-lg bg-surface-sunk grid place-items-center text-[13px] text-ink-faint">sin imagen</div>
  }
  return (
    <div className="relative w-full aspect-[4/3] rounded-lg overflow-hidden bg-surface-sunk">
      {imagenes.map((src, i) => (
        <img
          key={src}
          src={src}
          alt={i === 0 ? alt : ''}
          className="absolute inset-0 w-full h-full object-cover transition-opacity duration-300"
          style={{ opacity: i === frame ? 1 : 0 }}
        />
      ))}
    </div>
  )
}

export default function ExercisePicker({
  onPick, onClose,
}: { onPick: (e: Ejercicio) => void; onClose: () => void }) {
  const [todos, setTodos] = useState<Ejercicio[] | null>(null)
  const [q, setQ] = useState('')
  const [musculo, setMusculo] = useState('')
  const [equipo, setEquipo] = useState('')
  const [detalle, setDetalle] = useState<Ejercicio | null>(null)

  useEffect(() => {
    fetch('/exercises.json').then(r => r.json()).then(setTodos).catch(() => setTodos([]))
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && (detalle ? setDetalle(null) : onClose())
    document.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose, detalle])

  const { musculos, equipos, resultados } = useMemo(() => {
    const t = todos ?? []
    const ms = [...new Set(t.flatMap(e => e.primarios))].sort()
    const eq = [...new Set(t.map(e => e.equipo).filter(Boolean) as string[])].sort()
    const term = q.trim().toLowerCase()
    return {
      musculos: ms,
      equipos: eq,
      resultados: t.filter(e =>
        (!term || e.nombre.toLowerCase().includes(term) || musculoEs(e.primarios[0] ?? '').includes(term)) &&
        (!musculo || e.primarios.includes(musculo)) &&
        (!equipo || e.equipo === equipo),
      ),
    }
  }, [todos, q, musculo, equipo])

  return (
    <div className="fixed inset-0 z-[1000] bg-surface-scrim/85 backdrop-blur-sm fade-in flex items-start justify-center p-4 sm:p-8 overflow-y-auto"
      onClick={onClose} role="dialog" aria-modal="true" aria-label="Elegir ejercicio">
      <div className="w-full max-w-[1000px] my-auto rounded-2xl glass-strong modal-in"
        onClick={e => e.stopPropagation()}>

        <div className="px-5 pt-4 pb-3 border-b border-surface-line flex items-start justify-between gap-4">
          <div>
            <h2 className="text-[19px] font-bold text-ink-primary">Elegir ejercicio</h2>
            <p className="text-[13px] text-ink-muted mt-0.5">
              {todos ? `${resultados.length} de ${todos.length} ejercicios` : 'Cargando…'}
            </p>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition-colors" aria-label="Cerrar">✕</button>
        </div>

        <div className="px-5 py-3 border-b border-surface-line grid grid-cols-1 sm:grid-cols-[1fr_160px_160px] gap-2.5">
          <input
            value={q} onChange={e => setQ(e.target.value)} placeholder="Buscar por nombre o músculo…"
            className="px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[14px] text-ink-primary placeholder:text-ink-faint focus:outline-none focus:border-accent"
          />
          <select value={musculo} onChange={e => setMusculo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[14px] text-ink-primary focus:outline-none focus:border-accent">
            <option value="">Todos los músculos</option>
            {musculos.map(m => <option key={m} value={m}>{musculoEs(m)}</option>)}
          </select>
          <select value={equipo} onChange={e => setEquipo(e.target.value)}
            className="px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[14px] text-ink-primary focus:outline-none focus:border-accent">
            <option value="">Todo el equipamiento</option>
            {equipos.map(x => <option key={x} value={x}>{x}</option>)}
          </select>
        </div>

        <div className="p-5 max-h-[62vh] overflow-y-auto">
          {!todos ? (
            <p className="text-[14px] text-ink-muted text-center py-10">Cargando ejercicios…</p>
          ) : resultados.length === 0 ? (
            <p className="text-[14px] text-ink-muted text-center py-10">Ningún ejercicio coincide con la búsqueda.</p>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {resultados.slice(0, 120).map(e => (
                <button key={e.id} onClick={() => setDetalle(e)}
                  className="text-left rounded-xl border border-surface-line bg-surface-sunk p-2 hover:border-accent transition-colors">
                  <Animacion imagenes={e.imagenes} alt={e.nombre} activo />
                  <p className="text-[13px] font-medium text-ink-primary mt-2 leading-snug line-clamp-2">{e.nombre}</p>
                  <p className="text-[12px] text-ink-muted mt-0.5">
                    {e.primarios.map(musculoEs).join(', ') || '—'}
                  </p>
                </button>
              ))}
            </div>
          )}
          {todos && resultados.length > 120 && (
            <p className="text-[13px] text-ink-muted text-center mt-4">
              Mostrando 120 de {resultados.length}. Afiná la búsqueda para ver el resto.
            </p>
          )}
        </div>
      </div>

      {detalle && (
        <div className="fixed inset-0 z-[1001] bg-surface-scrim/90 flex items-start justify-center p-4 sm:p-8 overflow-y-auto fade-in"
          onClick={() => setDetalle(null)}>
          <div className="w-full max-w-[720px] my-auto rounded-2xl glass-strong modal-in"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 border-b border-surface-line flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold text-ink-primary">{detalle.nombre}</h3>
                <p className="text-[13px] text-ink-muted mt-0.5">
                  {[detalle.equipo, detalle.nivel && NIVEL_ES[detalle.nivel], detalle.mecanica].filter(Boolean).join(' · ')}
                </p>
              </div>
              <button onClick={() => setDetalle(null)} className="w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover" aria-label="Cerrar">✕</button>
            </div>

            <div className="p-5 grid grid-cols-1 sm:grid-cols-[260px_1fr] gap-5">
              <div>
                <Animacion imagenes={detalle.imagenes} alt={detalle.nombre} activo />
                <div className="mt-3 space-y-1.5">
                  <p className="text-[13px] text-ink-secondary">
                    <span className="text-ink-muted">Primarios: </span>
                    {detalle.primarios.map(musculoEs).join(', ') || '—'}
                  </p>
                  {detalle.secundarios.length > 0 && (
                    <p className="text-[13px] text-ink-secondary">
                      <span className="text-ink-muted">Secundarios: </span>
                      {detalle.secundarios.map(musculoEs).join(', ')}
                    </p>
                  )}
                </div>
              </div>
              <div>
                <h4 className="text-[13px] font-semibold text-ink-muted mb-2">Cómo se hace</h4>
                <ol className="space-y-2 list-decimal list-inside">
                  {detalle.instrucciones.map((ins, i) => (
                    <li key={i} className="text-[14px] text-ink-secondary leading-relaxed">{ins}</li>
                  ))}
                </ol>
              </div>
            </div>

            <div className="px-5 pb-5 flex flex-wrap gap-3 items-center">
              <button onClick={() => { onPick(detalle); onClose() }}
                className="px-5 py-2.5 rounded-xl bg-accent hover:bg-accent-press text-white text-[15px] font-semibold transition-colors">
                Usar este ejercicio
              </button>
              {!detalle.claveGarmin && (
                <span className="text-[12px] text-ink-muted max-w-[380px] leading-relaxed">
                  Garmin no tiene una clave propia para este movimiento: en el reloj se va a ver
                  como <strong className="text-ink-secondary">{detalle.categoria.replace(/_/g, ' ').toLowerCase()}</strong>.
                </span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
