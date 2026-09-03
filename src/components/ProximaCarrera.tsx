import { Link } from 'react-router-dom'
import { Card } from './ui'
import Icon from './Icon'
import { useEventos, diasHasta, cuentaRegresiva, ETIQUETA_DISCIPLINA } from '../hooks/useEventos'

const MESES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
]

function fechaLarga(fecha: string): string {
  const [, m, d] = fecha.split('-').map(Number)
  return `${d} de ${MESES[m - 1]}`
}

/** La cuenta regresiva de la próxima carrera anotada, o la puerta de entrada a
 *  la sección si todavía no anotó ninguna. Sólo desaparece del todo cuando no
 *  hay ni una carrera que ofrecer. */
export default function ProximaCarrera() {
  const { mios, filtrados } = useEventos()

  // Sin ninguna marcada no hay cuenta regresiva, pero sí hay algo que decir:
  // que la sección existe y cuántas carreras hay esperando. Callarse acá era
  // dejar la función escondida detrás de un menú.
  if (mios.length === 0) {
    if (filtrados.length === 0) return null
    const primera = filtrados[0]
    return (
      <Link
        to="/carreras"
        className="glass rounded-2xl p-4 flex items-center gap-3 rise-in transition-colors
                   hover:bg-surface-hover group"
      >
        <span className="shrink-0 w-9 h-9 rounded-full grid place-items-center
                         text-accent-soft group-hover:text-accent transition-colors">
          <Icon name="records" size={19} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-semibold text-ink-primary leading-snug">
            {filtrados.length} {filtrados.length === 1 ? 'carrera' : 'carreras'} en tu zona
          </span>
          <span className="block text-[13px] text-ink-muted truncate">
            La próxima: {primera.nombre}, {cuentaRegresiva(primera.fecha)} · marcá a cuál vas y te
            armo el plan
          </span>
        </span>
        <span className="shrink-0 text-ink-muted group-hover:text-ink-primary transition-colors">
          <Icon name="chevron-derecha" size={17} />
        </span>
      </Link>
    )
  }

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
              <> · y {resto.length} {resto.length === 1 ? 'carrera más' : 'carreras más'} anotadas</>
            )}
          </p>
        </div>

        <Link
          to="/carreras"
          className="shrink-0 px-3.5 py-2 rounded-lg text-[13px] font-medium text-ink-secondary
                     border border-surface-line hover:border-surface-line-strong hover:text-ink-primary
                     hover:bg-surface-hover transition-colors"
        >
          Ver carreras →
        </Link>
      </div>
    </Card>
  )
}
