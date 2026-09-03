import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { Card } from './ui'
import Icon from './Icon'
import AIProgress from './AIProgress'

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

// Los diálogos se montan en <body>: cualquier ancestro con transform o
// backdrop-filter (la barra lateral, sin ir más lejos) pasa a ser el bloque
// contenedor de sus descendientes `position: fixed` y los encierra.
  return createPortal(
    <div
      className="fixed inset-0 z-[1000] flex items-start justify-center p-4 sm:p-8 overflow-y-auto bg-surface-scrim/80 backdrop-blur-sm fade-in"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Análisis completo de tu entrenamiento"
    >
      <div
        className="w-full max-w-[820px] my-auto rounded-2xl glass-strong modal-in"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 px-6 pt-5 pb-4 border-b border-surface-line">
          <div className="min-w-0">
            <div className="flex items-center gap-2 mb-1.5">
              <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tone.color }} />
              <span className="text-[13px] font-medium" style={{ color: tone.color }}>{tone.label}</span>
            </div>
            <h2 className="text-[21px] font-bold text-ink-primary leading-snug">{data.titular}</h2>
          </div>
          <button
            onClick={onClose}
            className="shrink-0 w-8 h-8 rounded-lg text-ink-muted hover:text-ink-primary hover:bg-surface-hover transition-colors"
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-5 space-y-5">
          <p className="text-[15px] text-ink-secondary leading-relaxed">{data.resumen}</p>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div>
              <h3 className="text-[13px] font-semibold text-ink-muted mb-2.5">Qué muestran los números</h3>
              <ul className="space-y-2">
                {data.observaciones?.map((o, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] text-ink-secondary leading-relaxed">
                    <span className="text-ink-faint shrink-0">·</span><span>{o}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-ink-muted mb-2.5">Qué haría ahora</h3>
              <ul className="space-y-2">
                {data.recomendaciones?.map((r, i) => (
                  <li key={i} className="flex gap-2.5 text-[14px] text-ink-secondary leading-relaxed">
                    <span className="shrink-0" style={{ color: tone.color }}>→</span><span>{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Bloque icono="corazon" bloque={data.recuperacion} />
            <Bloque icono="pasos" bloque={data.pasos} />
          </div>

          <p className="text-[12px] text-ink-muted pt-3 border-t border-surface-line">
            Generado el {new Date(data.generado + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })} con {data.modelo}. No es consejo médico.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Bloque({ icono, bloque }: { icono: "corazon" | "pasos"; bloque?: Bloque }) {
  if (!bloque) return null
  const t = TONE[bloque.estado] ?? TONE.bien
  return (
    <div className="rounded-lg border p-4" style={{ borderColor: `${t.color}40`, background: `${t.color}0f` }}>
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color: t.color }}><Icon name={icono} size={17} /></span>
        <span className="text-[14px] font-semibold" style={{ color: t.color }}>{bloque.titular}</span>
      </div>
      <p className="text-[14px] text-ink-secondary leading-relaxed">{bloque.detalle}</p>
    </div>
  )
}

const hoyLocal = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function InsightsCard({ compacto = false }: { compacto?: boolean } = {}) {
  const [data, setData] = useState<Insights | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [regenerando, setRegenerando] = useState(false)

  useEffect(() => {
    let cancelado = false

    const cargar = async () => {
      const r = await fetch('/data/insights.json').catch(() => null)
      const guardado: Insights | null =
        r?.ok && r.headers.get('content-type')?.includes('json') ? await r.json() : null
      if (cancelado) return
      if (guardado) setData(guardado)

      // The analysis reads today's training, steps, sleep and resting heart
      // rate, so one generated yesterday is describing a different day.
      if (guardado?.generado === hoyLocal()) return

      setRegenerando(true)
      try {
        const res = await fetch('/api/insights')
        const nuevo = await res.json()
        if (!cancelado && res.ok && !nuevo.error) setData(nuevo)
      } catch {
        // Keep yesterday's analysis rather than blanking the card.
      } finally {
        if (!cancelado) setRegenerando(false)
      }
    }

    cargar()
    return () => { cancelado = true }
  }, [])

  if (!data) {
    if (!regenerando) return null
    if (compacto) {
      return (
        <div className="flex items-center gap-3 px-3.5 py-2.5 rounded-xl glass shimmer">
          <span className="w-9 h-9 rounded-full grid place-items-center text-accent-soft">
            <Icon name="cerebro" size={19} />
          </span>
          <span className="text-[13px] text-ink-secondary">Analizando tu día…</span>
        </div>
      )
    }
    return (
      <Card className="p-4">
        <AIProgress
          titulo="Analizando tu día"
          detalle="entrenamiento, pasos, sueño y recuperación"
          esperaTipica={25}
          lineas={2}
        />
      </Card>
    )
  }
  const tone = TONE[data.estado] ?? TONE.bien

  // En el encabezado el análisis compite con el título, así que va condensado:
  // el titular y el estado alcanzan para decidir si vale abrirlo.
  if (compacto) {
    return (
      <>
        <button
          onClick={() => setAbierto(true)}
          className="group flex items-center gap-3 w-full sm:w-auto sm:max-w-[420px] text-left
                     px-3.5 py-2.5 rounded-xl glass rise-in transition-colors
                     hover:bg-surface-hover focus:outline-none focus-visible:ring-2
                     focus-visible:ring-accent focus-visible:ring-offset-2
                     focus-visible:ring-offset-[#0b1220]"
          aria-label={`${tone.label}: ${data.titular}. Ver el análisis completo`}
        >
          <span className="halo-ring relative shrink-0 w-9 h-9 rounded-full grid place-items-center
                           text-accent-soft group-hover:text-accent transition-colors">
            <span className="relative z-10"><Icon name="cerebro" size={19} /></span>
          </span>

          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ background: tone.color }} />
              <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: tone.color }}>{tone.label}</span>
              {regenerando && (
                <span className="w-2.5 h-2.5 ml-0.5 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin"
                  title="Actualizando con los datos de hoy" />
              )}
            </span>
            <span className="block text-[15px] font-semibold text-ink-primary leading-snug truncate">{data.titular}</span>
          </span>

          <span className="shrink-0 text-ink-muted group-hover:text-ink-primary transition-colors" aria-hidden="true">
            <Icon name="chevron-derecha" size={17} />
          </span>
        </button>

        {abierto && <DetailModal data={data} onClose={() => setAbierto(false)} />}
      </>
    )
  }

  return (
    <>
      <Card className="p-4 rise-in">
        <div className="flex items-center gap-3 sm:gap-4 flex-wrap sm:flex-nowrap">
          <button
            onClick={() => setAbierto(true)}
            className="halo-ring relative shrink-0 w-11 h-11 rounded-full grid place-items-center
                       text-accent-soft hover:text-accent transition-colors focus:outline-none
                       focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2
                       focus-visible:ring-offset-[#172033]"
            aria-label="Ver el análisis completo"
            title="Ver el análisis completo"
          >
            <span className="relative z-10"><Icon name="cerebro" size={21} /></span>
          </button>

          {/* min-w-0 lets the truncation actually engage inside a flex row. */}
          <div className="min-w-0 flex-1 basis-0 min-w-[160px]">
            <div className="flex items-center gap-2 mb-0.5">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: tone.color }} />
              <span className="text-[12px] font-medium whitespace-nowrap" style={{ color: tone.color }}>{tone.label}</span>
            </div>
            <div className="flex items-center gap-2 min-w-0">
              <p className="text-[16px] font-semibold text-ink-primary leading-snug truncate">{data.titular}</p>
              {regenerando && (
                <span className="w-3 h-3 shrink-0 rounded-full border-2 border-accent border-t-transparent animate-spin"
                  title="Actualizando con los datos de hoy" />
              )}
            </div>
          </div>

          <button
            onClick={() => setAbierto(true)}
            className="shrink-0 px-3.5 py-2 rounded-lg text-[13px] font-medium text-ink-secondary
                       border border-surface-line hover:border-surface-line-strong hover:text-ink-primary
                       hover:bg-surface-hover transition-colors whitespace-nowrap hidden sm:block"
          >
            Ver detalle
          </button>
        </div>
      </Card>

      {abierto && <DetailModal data={data} onClose={() => setAbierto(false)} />}
    </>
  )
}
