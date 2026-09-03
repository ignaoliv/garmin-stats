import { Link } from 'react-router-dom'
import { Card } from './ui'
import { useEventos, diasHasta, ETIQUETA_DISCIPLINA } from '../hooks/useEventos'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} de ${MESES[m - 1]}`
}

/** La cuenta regresiva del próximo evento anotado.
 *
 *  Sólo aparece si se anotó a alguno. El Resumen es para lo que está pasando
 *  con su entrenamiento, no un escaparate de lo que hay dando vueltas: los
 *  eventos a los que todavía no se anotó viven en su propia sección. */
export default function ProximoEvento() {
  const { mios } = useEventos()
  if (mios.length === 0) return null

  const [proxima, ...resto] = mios
  const dias = diasHasta(proxima.fecha)
  const semanas = Math.floor(dias / 7)

  return (
    <Card className="p-5 rise-in">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-4">
        <div className="flex items-end gap-2.5 shrink-0">
          <span className="metric-xl text-accent leading-none">{dias}</span>
          <span className="text-[14px] text-ink-muted mb-2">
            {dias === 1 ? 'día' : 'días'}
            {semanas >= 2 && <span className="text-ink-faint"> · {semanas} semanas</span>}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <p className="label">
            {ETIQUETA_DISCIPLINA[proxima.disciplina] ?? proxima.disciplina} · {fechaLarga(proxima.fecha)}
          </p>
          <a
            href={proxima.url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-[17px] font-semibold text-ink-primary hover:text-accent transition-colors
                       block truncate leading-snug"
          >
            {proxima.nombre}
          </a>
          <p className="text-[13px] text-ink-muted truncate mt-0.5">
            {proxima.localidad}
            {resto.length > 0 && (
              <> · y {resto.length} {resto.length === 1 ? 'evento más' : 'eventos más'} anotados</>
            )}
          </p>
        </div>

        <Link
          to="/eventos"
          className="shrink-0 px-3.5 py-2 rounded-lg text-[13px] font-medium text-ink-secondary
                     border border-surface-line hover:border-surface-line-strong hover:text-ink-primary
                     hover:bg-surface-hover transition-colors"
        >
          Ver eventos →
        </Link>
      </div>
    </Card>
  )
}
