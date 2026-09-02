import { useEffect, useState } from 'react'
import { Card } from './ui'

interface Bloque {
  estado: 'bien' | 'atencion' | 'alerta'
  titular: string
  detalle: string
}

interface Insights {
  titular: string
  estado: 'bien' | 'atencion' | 'alerta'
  resumen: string
  observaciones: string[]
  recomendaciones: string[]
  recuperacion?: Bloque
  pasos?: Bloque
  generado: string
  modelo: string
}

const TONE = {
  bien:     { color: '#34d399', label: 'Todo en orden' },
  atencion: { color: '#fbbf24', label: 'Prestá atención' },
  alerta:   { color: '#f87171', label: 'Alerta' },
} as const

function BrainIcon({ size = 21 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 5a3 3 0 0 0-5.9-.7A2.8 2.8 0 0 0 3.5 7a2.8 2.8 0 0 0 .4 1.5A3 3 0 0 0 3 11a3 3 0 0 0 1.2 2.4A3 3 0 0 0 4 15a3 3 0 0 0 3 3 3 3 0 0 0 5 1.9Z" />
      <path d="M12 5a3 3 0 0 1 5.9-.7A2.8 2.8 0 0 1 20.5 7a2.8 2.8 0 0 1-.4 1.5A3 3 0 0 1 21 11a3 3 0 0 1-1.2 2.4A3 3 0 0 1 20 15a3 3 0 0 1-3 3 3 3 0 0 1-5 1.9Z" />
      <path d="M12 5v14.9" />
    </svg>
  )
}

/** The full analysis, out of the way until asked for. */
function DetailModal({ data, onClose }: { data: Insights; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    // Freeze the page behind the dialog so scrolling stays inside it.
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onClose])

  const tone = TONE[data.estado] ?? TONE.bien

  return (
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-[#060c17]/80 backdrop-blur-sm fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Análisis completo de tu entrenamiento"
    >
      <div
        className="w-full max-w-[820px] my-auto rounded-2xl border border-[#28334a] bg-[#172033] shadow-2xl modal-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-[#28334a]">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tone.color }} />
              <span className="text-[13px] font-medium" style={{ color: tone.color }}>{tone.label}</span>
            </div>
            <h2 className="text-[21px] font-bold text-[#f1f5f9] leading-snug">{data.titular}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg text-[#94a3b8] hover:text-[#f1f5f9] hover:bg-[#1e2942] transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-[15px] text-[#cbd5e1] leading-relaxed">{data.resumen}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-[13px] font-semibold text-[#94a3b8] mb-2.5">Qué muestran los números</h3>
              <ul className="space-y-2">
                {data.observaciones?.map((o, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] text-[#cbd5e1] leading-relaxed">
                    <span className="text-[#64748b] shrink-0">·</span><span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-[#94a3b8] mb-2.5">Qué haría ahora</h3>
              <ul className="space-y-2">
                {data.recomendaciones?.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] text-[#cbd5e1] leading-relaxed">
                    <span className="shrink-0" style={{ color: tone.color }}>→</span><span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloque icono="💓" bloque={data.recuperacion} />
            <Bloque icono="👟" bloque={data.pasos} />
          </div>

          <p className="text-[12px] text-[#94a3b8] pt-3 border-t border-[#28334a]">
            Generado el {new Date(data.generado + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} con {data.modelo}. No es consejo médico.
          </p>
        </div>
      </div>
    </div>
  )
}

function Bloque({ icono, bloque }: { icono: string; bloque?: Bloque }) {
  if (!bloque) return null
  const t = TONE[bloque.estado] ?? TONE.bien
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: `${t.color}40`, background: `${t.color}0f` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span className="text-base">{icono}</span>
        <span className="text-[14px] font-semibold" style={{ color: t.color }}>{bloque.titular}</span>
      </div>
      <p className="text-[14px] text-[#cbd5e1] leading-relaxed">{bloque.detalle}</p>
    </div>
  )
}

export default function InsightsCard() {
  const [data, setData] = useState<Insights | null>(null)
  const [abierto, setAbierto] = useState(false)

  useEffect(() => {
    fetch('/data/insights.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(setData)
      .catch(() => setData(null))
  }, [])

  if (!data) return null
  const tone = TONE[data.estado] ?? TONE.bien

  return (
    <>
      <Card className="p-4 rise-in">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setAbierto(true)}
            className="halo-ring relative shrink-0 w-11 h-11 rounded-full grid place-items-center
                       text-[#ff9a5c] hover:text-[#fc5200] transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-[#fc5200] focus-visible:ring-offset-2
                       focus-visible:ring-offset-[#172033]"
            aria-label="Ver el análisis completo"
            title="Ver el análisis completo"
          >
            <span className="relative z-10"><BrainIcon /></span>
          </button>

          {/* min-w-0 lets the truncation actually engage inside a flex row. */}
          <div className="min-w-0 flex-1 basis-0 min-w-[160px]">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone.color }} />
              <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: tone.color }}>{tone.label}</span>
            </div>
            <p className="text-[16px] font-semibold text-[#f1f5f9] leading-snug truncate">{data.titular}</p>
          </div>

          <button
            onClick={() => setAbierto(true)}
            className="shrink-0 px-3.5 py-2 rounded-lg text-[13px] font-medium text-[#cbd5e1]
                       border border-[#28334a] hover:border-[#3a4767] hover:text-[#f1f5f9]
                       hover:bg-[#1e2942] transition-colors whitespace-nowrap hidden sm:block"
          >
            Ver detalle
          </button>
        </div>
      </Card>

      {abierto && <DetailModal data={data} onClose={() => setAbierto(false)} />}
    </>
  )
}
