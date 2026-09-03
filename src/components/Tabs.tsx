import { useState, type ReactNode } from 'react'

export interface Pestaña {
  clave: string
  label: string
  render: () => ReactNode
}

/**
 * Section switcher for the merged pages.
 *
 * Four separate nav entries for "look at my trends" made the rail long and the
 * information scattered; one entry with sections keeps the depth without asking
 * the user to remember which of four pages held which chart.
 *
 * Only the active section is mounted, so the heavy chart pages stay off the
 * render path until asked for.
 */
export default function Tabs({
  pestañas, titulo, subtitulo, inicial,
}: {
  pestañas: Pestaña[]
  titulo: string
  subtitulo?: string
  inicial?: string
}) {
  const [activa, setActiva] = useState(inicial ?? pestañas[0]?.clave)
  const actual = pestañas.find(p => p.clave === activa) ?? pestañas[0]

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-[1180px] mx-auto px-6 pt-7 pb-2">
        <h1 className="title-page">{titulo}</h1>
        {subtitulo && <p className="label-plain mt-2">{subtitulo}</p>}

        <div className="flex gap-1 mt-5 -mb-px overflow-x-auto" role="tablist">
          {pestañas.map(p => {
            const esActiva = p.clave === actual?.clave
            return (
              <button
                key={p.clave}
                role="tab"
                aria-selected={esActiva}
                onClick={() => setActiva(p.clave)}
                className={`px-3.5 py-2 text-[14px] rounded-t-lg border-b-2 whitespace-nowrap transition-colors ${
                  esActiva
                    ? 'border-accent text-ink-primary font-medium'
                    : 'border-transparent text-ink-muted hover:text-ink-secondary'
                }`}
              >
                {p.label}
              </button>
            )
          })}
        </div>
        <div className="border-b border-white/[0.07]" />
      </div>

      <div key={actual?.clave} className="fade-in">{actual?.render()}</div>
    </div>
  )
}
