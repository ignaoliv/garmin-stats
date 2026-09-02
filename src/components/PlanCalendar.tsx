import { useEffect, useMemo, useState } from 'react'

export interface BloquePlan {
  category: string
  sets: number
  reps?: number
  duracion_s?: number
  rest_s: number
  nota?: string
}
export interface SesionPlan { nombre: string; dia_offset: number; bloques: BloquePlan[] }
export interface SemanaPlan { numero: number; foco: string; progresion: string; sesiones: SesionPlan[] }

interface Agendado { fecha: string; titulo: string }

const DIAS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const bonito = (k: string) => k.replace(/_/g, ' ').toLowerCase()
const resumen = (b: BloquePlan) => (b.duracion_s ? `${b.sets}×${b.duracion_s}s` : `${b.sets}×${b.reps}`)

const claveLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

export default function PlanCalendar({
  semanas, inicio,
}: { semanas: SemanaPlan[]; inicio: string }) {
  const [agenda, setAgenda] = useState<Agendado[]>([])
  const [abierta, setAbierta] = useState<{ sesion: SesionPlan; fecha: Date; semana: number } | null>(null)

  // What Garmin already has scheduled, so a clash is visible while planning
  // rather than after uploading.
  useEffect(() => {
    fetch('/data/plan.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(d => setAgenda((d?.programados ?? []).map((w: { fecha: string; titulo: string }) => ({ fecha: w.fecha, titulo: w.titulo }))))
      .catch(() => setAgenda([]))
  }, [])

  const filas = useMemo(() => {
    const base = new Date(inicio + 'T00:00:00')
    // Start the grid on the Monday of the first week so columns are weekdays.
    const primerLunes = new Date(base)
    primerLunes.setDate(base.getDate() - ((base.getDay() + 6) % 7))

    return semanas.map(sem => {
      const dias = Array.from({ length: 7 }, (_, i) => {
        const d = new Date(primerLunes)
        d.setDate(primerLunes.getDate() + (sem.numero - 1) * 7 + i)
        const offsetDesdeInicio = Math.round((d.getTime() - base.getTime()) / 86400000)
        const enEstaSemana = offsetDesdeInicio - (sem.numero - 1) * 7
        return {
          fecha: d,
          sesiones: sem.sesiones.filter(s => s.dia_offset === enEstaSemana),
          agendados: agenda.filter(a => a.fecha === claveLocal(d)),
        }
      })
      return { semana: sem, dias }
    })
  }, [semanas, inicio, agenda])

  const hoy = claveLocal(new Date())

  return (
    <div>
      <div className="grid grid-cols-7 gap-1.5 mb-1.5">
        {DIAS.map(d => (
          <div key={d} className="text-[12px] font-medium text-[#94a3b8] text-center py-1">{d}</div>
        ))}
      </div>

      <div className="space-y-3">
        {filas.map(({ semana, dias }) => (
          <div key={semana.numero}>
            <div className="flex items-baseline gap-2 mb-1.5">
              <span className="text-[13px] font-semibold text-[#f1f5f9]">Semana {semana.numero}</span>
              <span className="text-[13px] text-[#94a3b8] truncate">{semana.foco}</span>
            </div>
            <div className="grid grid-cols-7 gap-1.5">
              {dias.map(({ fecha, sesiones, agendados }) => {
                const esHoy = claveLocal(fecha) === hoy
                const vacio = sesiones.length === 0 && agendados.length === 0
                return (
                  <div
                    key={fecha.toISOString()}
                    className={`rounded-lg border p-1.5 min-h-[74px] ${
                      esHoy ? 'border-[#fc5200] bg-[#fc5200]/5' : 'border-[#28334a] bg-[#131c2e]'
                    }`}
                  >
                    <div className={`text-[12px] tabular-nums mb-1 ${esHoy ? 'text-[#fc5200] font-semibold' : 'text-[#94a3b8]'}`}>
                      {fecha.getDate()}
                    </div>

                    {sesiones.map((s, i) => (
                      <button
                        key={i}
                        onClick={() => setAbierta({ sesion: s, fecha, semana: semana.numero })}
                        className="w-full text-left mb-1 px-1.5 py-1 rounded bg-[#fc5200]/20 border border-[#fc5200]/45
                                   hover:bg-[#fc5200]/35 transition-colors"
                      >
                        <span className="block text-[12px] font-medium text-[#ffb083] leading-tight truncate">{s.nombre}</span>
                        <span className="block text-[11px] text-[#94a3b8] leading-tight">
                          {s.bloques.length} ejercicios
                        </span>
                      </button>
                    ))}

                    {/* Already on the Garmin calendar — shown dimmed so a clash
                        with an existing ride reads immediately. */}
                    {agendados.map((a, i) => (
                      <div key={i} className="px-1.5 py-1 rounded bg-[#1e2942] border border-[#28334a] mb-1">
                        <span className="block text-[11px] text-[#94a3b8] leading-tight truncate" title={a.titulo}>
                          🚴 {a.titulo}
                        </span>
                      </div>
                    ))}

                    {vacio && <span className="text-[11px] text-[#4a5771]">descanso</span>}
                  </div>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap gap-4 mt-4 pt-3 border-t border-[#28334a]">
        <span className="flex items-center gap-1.5 text-[13px] text-[#cbd5e1]">
          <span className="w-3 h-3 rounded-[3px] bg-[#fc5200]/40 border border-[#fc5200]/60" /> Sesión del plan
        </span>
        <span className="flex items-center gap-1.5 text-[13px] text-[#cbd5e1]">
          <span className="w-3 h-3 rounded-[3px] bg-[#1e2942] border border-[#28334a]" /> Ya agendado en Garmin
        </span>
      </div>

      {abierta && (
        <div className="fixed inset-0 z-[1002] bg-[#060c17]/85 backdrop-blur-sm flex items-start justify-center p-4 sm:p-8 overflow-y-auto fade-in"
          onClick={() => setAbierta(null)} role="dialog" aria-modal="true">
          <div className="w-full max-w-[520px] my-auto rounded-2xl border border-[#28334a] bg-[#172033] shadow-2xl modal-in"
            onClick={e => e.stopPropagation()}>
            <div className="px-5 pt-4 pb-3 border-b border-[#28334a] flex items-start justify-between gap-4">
              <div>
                <h3 className="text-[18px] font-bold text-[#f1f5f9]">{abierta.sesion.nombre}</h3>
                <p className="text-[13px] text-[#94a3b8] mt-0.5">
                  Semana {abierta.semana} · {abierta.fecha.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                </p>
              </div>
              <button onClick={() => setAbierta(null)} className="w-8 h-8 rounded-lg text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1e2942]" aria-label="Cerrar">✕</button>
            </div>
            <div className="p-5 space-y-2.5">
              {abierta.sesion.bloques.map((b, i) => (
                <div key={i} className="rounded-lg border border-[#28334a] bg-[#131c2e] px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-[15px] font-medium text-[#f1f5f9] capitalize">{bonito(b.category)}</span>
                    <span className="text-[15px] font-semibold text-[#ffb083] tabular-nums shrink-0">{resumen(b)}</span>
                  </div>
                  <p className="text-[13px] text-[#94a3b8] mt-1">
                    descanso {b.rest_s}s{b.nota ? ` · ${b.nota}` : ''}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
