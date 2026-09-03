import { useState } from 'react'
import { Card, CardHeader, Insight, explicarError } from './ui'
import PlanCalendar, { type SemanaPlan, type BloquePlan } from './PlanCalendar'

interface Plan {
  titulo: string
  resumen: string
  advertencias: string[]
  ajustes_de_carga?: { estado: 'subir' | 'sostener' | 'bajar'; detalle: string; regla: string }
  semanas: SemanaPlan[]
  modelo: string
}

const AJUSTE = {
  subir:     { color: '#34d399', label: 'Hay margen para subir' },
  sostener:  { color: '#fbbf24', label: 'Sostener la carga' },
  bajar:     { color: '#f87171', label: 'Conviene bajar' },
} as const

const bonito = (k: string) => k.replace(/_/g, ' ').toLowerCase()
const fmt = (b: BloquePlan) =>
  b.duracion_s ? `${b.sets} × ${b.duracion_s}s` : `${b.sets} × ${b.reps} reps`

export default function PlanGenerator() {
  const [semanas, setSemanas] = useState(4)
  const [dias, setDias] = useState(3)
  const [objetivo, setObjetivo] = useState('ganar fuerza general manteniendo el ciclismo')
  const [plan, setPlan] = useState<Plan | null>(null)
  const [estado, setEstado] = useState<'idle' | 'generando' | 'enviando' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')
  const [inicio, setInicio] = useState(() => new Date(Date.now() + 86400000).toISOString().slice(0, 10))

  const generar = async () => {
    setEstado('generando'); setMensaje(''); setPlan(null)
    try {
      const res = await fetch('/api/plan-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weeks: semanas, days: dias, objetivo }),
      })
      const body = await res.json()
      if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`)
      setPlan(body); setEstado('idle')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  const enviarTodo = async () => {
    if (!plan) return
    setEstado('enviando'); setMensaje('')
    const base = new Date(inicio + 'T00:00:00')
    let ok = 0, fallo = 0
    let motivo = ''
    for (const sem of plan.semanas) {
      for (const ses of sem.sesiones) {
        const f = new Date(base)
        f.setDate(f.getDate() + (sem.numero - 1) * 7 + ses.dia_offset)
        try {
          // Sequential on purpose: each call logs into Garmin, and firing them
          // in parallel is a reliable way to get the account rate-limited.
          const r = await fetch('/api/strength-workout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: `S${sem.numero} · ${ses.nombre}`,
              description: `${plan.titulo} — ${sem.foco}`,
              date: f.toISOString().slice(0, 10),
              bloques: ses.bloques.map(b => ({
                category: b.category, exercise: null,
                sets: b.sets, reps: b.reps ?? 0,
                duracion_s: b.duracion_s ?? null,
                weight_kg: 0, rest_s: b.rest_s,
              })),
            }),
          })
          const body = await r.json()
          if (!r.ok || body.error) throw new Error(body.error)
          ok++
          setMensaje(`Enviando… ${ok} sesiones creadas`)
        } catch (e) { fallo++; if (!motivo) motivo = explicarError(e) }
      }
    }
    setEstado('idle')
    setMensaje(fallo === 0
      ? `Listo: ${ok} sesiones creadas y agendadas desde el ${base.toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}.`
      : `${ok} creadas, ${fallo} fallaron. ${motivo}`)
  }

  const totalSesiones = plan?.semanas.reduce((n, s) => n + s.sesiones.length, 0) ?? 0
  const ajuste = plan?.ajustes_de_carga ? (AJUSTE[plan.ajustes_de_carga.estado] ?? AJUSTE.sostener) : null

  return (
    <Card className="p-5">
      <CardHeader
        title="🧠 Generar un plan completo"
        hint="La IA lo arma mirando tu carga real, tu recuperación y tu historial de fuerza"
      />

      <div className="grid grid-cols-1 sm:grid-cols-[1fr_110px_110px] gap-3 mb-3">
        <label className="block">
          <span className="text-[13px] text-ink-muted block mb-1.5">Objetivo</span>
          <input value={objetivo} onChange={e => setObjetivo(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[15px] text-ink-primary focus:outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="text-[13px] text-ink-muted block mb-1.5">Semanas</span>
          <input type="number" min={1} max={12} value={semanas} onChange={e => setSemanas(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[15px] text-ink-primary tabular-nums focus:outline-none focus:border-accent" />
        </label>
        <label className="block">
          <span className="text-[13px] text-ink-muted block mb-1.5">Días/sem</span>
          <input type="number" min={1} max={6} value={dias} onChange={e => setDias(Number(e.target.value))}
            className="w-full px-3 py-2 rounded-lg bg-surface-sunk border border-surface-line text-[15px] text-ink-primary tabular-nums focus:outline-none focus:border-accent" />
        </label>
      </div>

      <button onClick={generar} disabled={estado === 'generando'}
        className="w-full py-2.5 rounded-xl border border-accent text-accent hover:bg-accent hover:text-white
                   text-[15px] font-semibold transition-colors disabled:opacity-60">
        {estado === 'generando' ? 'Diseñando el plan…' : plan ? 'Generar otro' : 'Generar plan'}
      </button>

      {estado === 'error' && <div className="mt-3"><Insight tone="warning">{mensaje}</Insight></div>}

      {plan && (
        <div className="mt-5 pt-5 border-t border-surface-line space-y-4">
          <div>
            <h3 className="text-[18px] font-bold text-ink-primary">{plan.titulo}</h3>
            <p className="text-[14px] text-ink-secondary leading-relaxed mt-1.5">{plan.resumen}</p>
          </div>

          {plan.ajustes_de_carga && ajuste && (
            <div className="rounded-lg border p-4" style={{ borderColor: `${ajuste.color}40`, background: `${ajuste.color}0f` }}>
              <p className="text-[14px] font-semibold mb-1.5" style={{ color: ajuste.color }}>
                Ajuste de carga · {ajuste.label}
              </p>
              <p className="text-[14px] text-ink-secondary leading-relaxed">{plan.ajustes_de_carga.detalle}</p>
              <p className="text-[13px] text-ink-muted mt-2 pt-2 border-t border-surface-line">
                <strong className="text-ink-secondary">Regla:</strong> {plan.ajustes_de_carga.regla}
              </p>
            </div>
          )}

          {plan.advertencias?.length > 0 && (
            <ul className="space-y-1.5">
              {plan.advertencias.map((a, i) => (
                <li key={i} className="flex gap-2.5 text-[14px] text-ink-secondary leading-relaxed">
                  <span className="text-state-warning shrink-0">!</span><span>{a}</span>
                </li>
              ))}
            </ul>
          )}

          <div>
            <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
              <h4 className="text-[15px] font-semibold text-ink-primary">El plan en el calendario</h4>
              <label className="flex items-center gap-2">
                <span className="text-[13px] text-ink-muted">Empieza el</span>
                <input type="date" value={inicio} onChange={e => setInicio(e.target.value)}
                  className="px-3 py-1.5 rounded-lg bg-surface-sunk border border-surface-line text-[14px] text-ink-primary focus:outline-none focus:border-accent" />
              </label>
            </div>
            <PlanCalendar semanas={plan.semanas} inicio={inicio} />
          </div>

          <details className="rounded-lg glass-sunk">
            <summary className="px-4 py-3 text-[14px] font-medium text-ink-secondary cursor-pointer select-none hover:text-ink-primary">
              Ver el plan como lista
            </summary>
            <div className="px-4 pb-4 space-y-3">
              {plan.semanas.map(s => (
                <div key={s.numero}>
                  <p className="text-[14px] font-semibold text-ink-primary">Semana {s.numero} · {s.foco}</p>
                  <p className="text-[13px] text-ink-muted mb-2">{s.progresion}</p>
                  <div className="space-y-1.5">
                    {s.sesiones.map((ses, i) => (
                      <div key={i} className="flex flex-wrap items-baseline gap-x-3 text-[14px]">
                        <span className="text-ink-muted tabular-nums w-[52px] shrink-0">día {ses.dia_offset + 1}</span>
                        <span className="text-ink-primary font-medium">{ses.nombre}</span>
                        <span className="text-ink-secondary">
                          {ses.bloques.map(b => `${bonito(b.category)} ${fmt(b)}`).join(' · ')}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </details>

          <div className="rounded-lg border border-surface-line p-4">
            <button onClick={enviarTodo} disabled={estado === 'enviando'}
              className="w-full py-2.5 px-4 rounded-xl bg-accent hover:bg-accent-press text-white
                         text-[15px] font-semibold transition-colors disabled:opacity-60">
              {estado === 'enviando' ? 'Enviando…' : `Mandar las ${totalSesiones} sesiones a Garmin`}
            </button>
            {mensaje && estado !== 'error' && (
              <div className="mt-3"><Insight tone={mensaje.startsWith('Listo') ? 'good' : 'neutral'}>{mensaje}</Insight></div>
            )}
            <p className="text-[12px] text-ink-muted mt-3 leading-relaxed">
              Se crea una sesión por día del plan y se agenda en tu calendario. Son {totalSesiones} llamadas
              a Garmin, una por vez para no gatillar el límite de la cuenta.
            </p>
          </div>

          <p className="text-[12px] text-ink-muted pt-2 border-t border-surface-line">
            Plan generado con {plan.modelo} sobre tus datos. No es consejo médico.
          </p>
        </div>
      )}
    </Card>
  )
}
