import { useEffect, useState } from 'react'
import { Card } from './ui'

interface Insight {
  titular: string
  tipo_sesion: string
  resumen: string
  observaciones: string[]
  cumplimiento: {
    hubo_plan: boolean
    veredicto: 'cumplido' | 'parcial' | 'no_cumplido' | 'indeterminable'
    detalle: string
  }
  modelo: string
}

const VERDICT = {
  cumplido:       { color: '#34d399', label: 'Plan cumplido' },
  parcial:        { color: '#fbbf24', label: 'Plan cumplido a medias' },
  no_cumplido:    { color: '#f87171', label: 'Plan no cumplido' },
  indeterminable: { color: '#94a3b8', label: 'No se puede determinar' },
} as const

/**
 * Analysis of a single session, generated the first time the page is opened.
 *
 * The result is cached as a static JSON file, so a second visit is instant and
 * costs nothing; the dev-server endpoint only runs the model on a miss.
 */
export default function ActivityInsight({ activityId }: { activityId: number }) {
  const [data, setData] = useState<Insight | null>(null)
  const [state, setState] = useState<'idle' | 'generando' | 'error'>('idle')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setData(null)
    setState('idle')

    const load = async () => {
      // Static file first: no server round-trip once it exists.
      // Vite answers a missing file with index.html and a 200, so `ok` alone
      // would happily hand us an HTML page to parse as JSON.
      const cached = await fetch(`/data/insight_${activityId}.json`).catch(() => null)
      if (cancelled) return
      if (cached?.ok && cached.headers.get('content-type')?.includes('json')) {
        try {
          setData(await cached.json())
          return
        } catch {
          // fall through and regenerate
        }
      }

      setState('generando')
      try {
        const res = await fetch(`/api/activity-insight/${activityId}`)
        const body = await res.json()
        if (cancelled) return
        if (!res.ok || body.error) throw new Error(body.error || `HTTP ${res.status}`)
        setData(body)
        setState('idle')
      } catch (e) {
        if (cancelled) return
        setError((e as Error).message)
        setState('error')
      }
    }
    load()
    return () => { cancelled = true }
  }, [activityId])

  if (state === 'generando') {
    return (
      <Card className="p-5">
        <div className="flex items-center gap-3">
          <span className="w-4 h-4 rounded-full border-2 border-[#fc5200] border-t-transparent animate-spin" />
          <div>
            <p className="text-[15px] font-medium text-[#f1f5f9]">Analizando esta sesión…</p>
            <p className="text-[13px] text-[#94a3b8] mt-0.5">Puede tardar unos segundos. Se guarda para la próxima vez.</p>
          </div>
        </div>
      </Card>
    )
  }

  if (state === 'error') {
    return (
      <Card className="p-5">
        <p className="text-[14px] text-[#94a3b8]">
          No se pudo generar el análisis: <span className="text-[#cbd5e1]">{error}</span>
        </p>
      </Card>
    )
  }

  if (!data) return null
  const v = VERDICT[data.cumplimiento?.veredicto] ?? VERDICT.indeterminable
  const showPlan = data.cumplimiento?.hubo_plan

  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4 mb-3 flex-wrap">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[#fc5200] mb-1">{data.tipo_sesion}</p>
          <h2 className="text-[19px] font-bold text-[#f1f5f9] leading-snug">{data.titular}</h2>
        </div>
        {showPlan && (
          <span
            className="px-3 py-1.5 rounded-lg text-[13px] font-semibold border shrink-0"
            style={{ color: v.color, borderColor: `${v.color}66`, background: `${v.color}1a` }}
          >
            {v.label}
          </span>
        )}
      </div>

      <p className="text-[15px] text-[#cbd5e1] leading-relaxed mb-4">{data.resumen}</p>

      <ul className="space-y-2 mb-4">
        {data.observaciones?.map((o, i) => (
          <li key={i} className="flex gap-2.5 text-[14px] text-[#cbd5e1] leading-relaxed">
            <span className="text-[#64748b] shrink-0">·</span>
            <span>{o}</span>
          </li>
        ))}
      </ul>

      {showPlan && data.cumplimiento.detalle && (
        <div className="rounded-lg border p-3.5 mb-4" style={{ borderColor: `${v.color}40`, background: `${v.color}0f` }}>
          <p className="text-[13px] font-semibold mb-1" style={{ color: v.color }}>Contra el plan</p>
          <p className="text-[14px] text-[#cbd5e1] leading-relaxed">{data.cumplimiento.detalle}</p>
        </div>
      )}

      <p className="text-[12px] text-[#94a3b8] pt-3 border-t border-[#28334a]">
        Análisis generado con {data.modelo}. No es consejo médico.
      </p>
    </Card>
  )
}
