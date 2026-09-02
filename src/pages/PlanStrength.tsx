import { useMemo, useState } from 'react'
import MuscleMap from '../components/MuscleMap'
import ExercisePicker, { type Ejercicio, musculoEs } from '../components/ExercisePicker'
import { Card, CardHeader, Insight } from '../components/ui'
import meta from '../data/exercise_meta.json'

const MUSCULOS = meta.musculosPorCategoria as Record<string, { primarios: string[]; secundarios: string[] }>

interface Bloque {
  id: number
  category: string
  exercise: string          // Garmin key, or '' when the movement has none
  titulo: string            // what the athlete sees, from the exercise library
  imagenes: string[]
  primarios: string[]
  sets: number
  reps: number
  weight_kg: number
  rest_s: number
}

const nuevoBloque = (id: number): Bloque => ({
  id, category: 'BENCH_PRESS', exercise: '', titulo: '', imagenes: [], primarios: [],
  sets: 3, reps: 10, weight_kg: 20, rest_s: 90,
})

const bonito = (k: string) => k.replace(/_/g, ' ').toLowerCase().replace(/^./, c => c.toUpperCase())

export default function PlanStrength() {
  const [nombre, setNombre] = useState('')
  const [fecha, setFecha] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))
  const [bloques, setBloques] = useState<Bloque[]>([nuevoBloque(1)])
  const [estado, setEstado] = useState<'idle' | 'enviando' | 'ok' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [eligiendo, setEligiendo] = useState<number | null>(null)

  const { primarios, secundarios } = useMemo(() => {
    const p = new Set<string>(), s = new Set<string>()
    for (const b of bloques) {
      // The library knows the exact muscles for a chosen exercise; the category
      // map is the fallback for a block that is still just a category.
      if (b.primarios.length) {
        b.primarios.forEach(x => p.add(x))
      } else {
        MUSCULOS[b.category]?.primarios.forEach(x => p.add(x))
      }
      MUSCULOS[b.category]?.secundarios.forEach(x => s.add(x))
    }
    return { primarios: [...p], secundarios: [...s] }
  }, [bloques])

  const totalSeries = bloques.reduce((n, b) => n + b.sets, 0)
  const volumen = bloques.reduce((n, b) => n + b.sets * b.reps * b.weight_kg, 0)
  const duracionMin = Math.round(bloques.reduce((n, b) => n + b.sets * (b.reps * 3 + b.rest_s), 0) / 60)

  const set = (id: number, campo: keyof Bloque, valor: string | number) =>
    setBloques(bs => bs.map(b => (b.id === id ? { ...b, [campo]: valor } : b)))

  const enviar = async () => {
    setEstado('enviando'); setMensaje('')
    try {
      const res = await fetch('/api/strength-workout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: nombre.trim() || 'Fuerza',
          description: 'Creado desde Garmin Stats',
          date: fecha || null,
          bloques: bloques.map(({ category, exercise, sets, reps, weight_kg, rest_s }) => ({
            category, exercise: exercise || null, sets, reps, weight_kg, rest_s,
          })),
        }),
      })
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`)
      setEstado('ok')
      setMensaje(
        body.programado
          ? `Subido y agendado para el ${new Date(body.programado + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}. Sincronizá el reloj.`
          : 'Subido a tu biblioteca de Garmin (sin fecha, no aparece en el calendario).',
      )
    } catch (e) {
      setEstado('error'); setMensaje((e as Error).message)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-[#101826]">
      <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-5 page-in">

        <header>
          <h1 className="text-2xl font-bold text-[#f1f5f9]">🏋️ Planificar fuerza</h1>
          <p className="text-[14px] text-[#94a3b8] mt-1">
            Armá la sesión, mirá qué músculos trabaja y mandala al reloj.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 items-start">

          {/* ── Editor ───────────────────────────────────────────────────── */}
          <div className="space-y-4">
            <Card className="p-5">
              <CardHeader title="La sesión" hint="Nombre y día en que la vas a hacer" />
              <div className="grid grid-cols-1 sm:grid-cols-[1fr_170px] gap-3">
                <label className="block">
                  <span className="text-[13px] text-[#94a3b8] block mb-1.5">Nombre</span>
                  <input
                    value={nombre}
                    onChange={e => setNombre(e.target.value)}
                    placeholder="Empuje A"
                    className="w-full px-3 py-2 rounded-lg bg-[#131c2e] border border-[#28334a] text-[15px]
                               text-[#f1f5f9] placeholder:text-[#64748b] focus:outline-none focus:border-[#fc5200]"
                  />
                </label>
                <label className="block">
                  <span className="text-[13px] text-[#94a3b8] block mb-1.5">Fecha</span>
                  <input
                    type="date"
                    value={fecha}
                    onChange={e => setFecha(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg bg-[#131c2e] border border-[#28334a] text-[15px]
                               text-[#f1f5f9] focus:outline-none focus:border-[#fc5200]"
                  />
                </label>
              </div>
            </Card>

            {bloques.map((b, i) => (
              <Card key={b.id} className="p-5">
                <div className="flex items-start justify-between gap-3 mb-4">
                  <h3 className="text-[15px] font-semibold text-[#f1f5f9]">Ejercicio {i + 1}</h3>
                  {bloques.length > 1 && (
                    <button
                      onClick={() => setBloques(bs => bs.filter(x => x.id !== b.id))}
                      className="text-[13px] text-[#94a3b8] hover:text-[#f87171] transition-colors"
                    >
                      Quitar
                    </button>
                  )}
                </div>

                <div className="flex items-start gap-4 mb-4">
                  <button
                    onClick={() => setEligiendo(b.id)}
                    className="w-[104px] shrink-0 rounded-lg overflow-hidden border border-[#28334a] hover:border-[#fc5200] transition-colors"
                    aria-label="Elegir ejercicio"
                  >
                    {b.imagenes[0]
                      ? <img src={b.imagenes[0]} alt="" className="w-full aspect-[4/3] object-cover" />
                      : <span className="w-full aspect-[4/3] grid place-items-center text-[12px] text-[#64748b] bg-[#131c2e]">elegir</span>}
                  </button>

                  <div className="min-w-0 flex-1">
                    <p className="text-[16px] font-semibold text-[#f1f5f9] leading-snug">
                      {b.titulo || bonito(b.category)}
                    </p>
                    <p className="text-[13px] text-[#94a3b8] mt-0.5">
                      {b.primarios.length
                        ? b.primarios.map(musculoEs).join(', ')
                        : (MUSCULOS[b.category]?.primarios ?? []).map(musculoEs).join(', ') || '—'}
                    </p>
                    <button
                      onClick={() => setEligiendo(b.id)}
                      className="text-[13px] font-medium text-[#fc5200] hover:text-[#ff7a3d] mt-1.5"
                    >
                      {b.titulo ? 'Cambiar ejercicio' : 'Elegir ejercicio'} →
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {([
                    ['sets', 'Series', 1, 20, 1],
                    ['reps', 'Repeticiones', 1, 100, 1],
                    ['weight_kg', 'Peso (kg)', 0, 400, 0.5],
                    ['rest_s', 'Descanso (s)', 0, 600, 15],
                  ] as const).map(([campo, label, min, max, step]) => (
                    <label key={campo} className="block">
                      <span className="text-[13px] text-[#94a3b8] block mb-1.5">{label}</span>
                      <input
                        type="number" min={min} max={max} step={step}
                        value={b[campo]}
                        onChange={e => set(b.id, campo, Number(e.target.value))}
                        className="w-full px-3 py-2 rounded-lg bg-[#131c2e] border border-[#28334a] text-[15px] text-[#f1f5f9] tabular-nums focus:outline-none focus:border-[#fc5200]"
                      />
                    </label>
                  ))}
                </div>
              </Card>
            ))}

            <button
              onClick={() => setBloques(bs => [...bs, nuevoBloque(Math.max(...bs.map(x => x.id), 0) + 1)])}
              className="w-full py-3 rounded-xl border border-dashed border-[#3a4767] text-[14px] font-medium
                         text-[#cbd5e1] hover:text-[#f1f5f9] hover:border-[#fc5200] transition-colors"
            >
              + Agregar ejercicio
            </button>
          </div>

          {/* ── Resumen ──────────────────────────────────────────────────── */}
          <div className="space-y-4 lg:sticky lg:top-6">
            <Card className="p-5">
              <CardHeader title="Músculos que trabaja" />
              <MuscleMap primarios={primarios} secundarios={secundarios} />
            </Card>

            <Card className="p-5">
              <CardHeader title="Resumen" />
              <dl className="space-y-2.5">
                {[
                  ['Ejercicios', String(bloques.length)],
                  ['Series totales', String(totalSeries)],
                  ['Volumen', `${volumen.toLocaleString('es-ES')} kg`],
                  ['Duración estimada', `${duracionMin} min`],
                ].map(([k, v]) => (
                  <div key={k} className="flex items-baseline justify-between gap-3">
                    <dt className="text-[14px] text-[#cbd5e1]">{k}</dt>
                    <dd className="text-[15px] font-semibold text-[#f1f5f9] tabular-nums">{v}</dd>
                  </div>
                ))}
              </dl>

              <button
                onClick={enviar}
                disabled={estado === 'enviando'}
                className="w-full mt-5 py-3 rounded-xl bg-[#fc5200] hover:bg-[#e04a00] text-white
                           text-[15px] font-semibold transition-colors disabled:opacity-60"
              >
                {estado === 'enviando' ? 'Enviando…' : 'Enviar a Garmin'}
              </button>

              {mensaje && (
                <div className="mt-3">
                  <Insight tone={estado === 'ok' ? 'good' : 'warning'}>{mensaje}</Insight>
                </div>
              )}

              <p className="text-[12px] text-[#94a3b8] mt-4 pt-3 border-t border-[#28334a] leading-relaxed">
                Se crea en tu cuenta de Garmin y, si ponés fecha, se agenda en el calendario —
                que es lo que lo baja al reloj.
              </p>
            </Card>
          </div>
        </div>

        <div className="h-2" />
      </div>

      {eligiendo !== null && (
        <ExercisePicker
          onClose={() => setEligiendo(null)}
          onPick={(e: Ejercicio) =>
            setBloques(bs => bs.map(b => b.id === eligiendo ? {
              ...b,
              category: e.categoria,
              // Only a name Garmin recognises is sent; otherwise the watch shows
              // the category, which is still the right movement pattern.
              exercise: e.claveGarmin ?? '',
              titulo: e.nombre,
              imagenes: e.imagenes,
              primarios: e.primarios,
            } : b))
          }
        />
      )}
    </div>
  )
}
