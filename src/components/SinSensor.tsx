import { Card } from './ui'
import Icon from './Icon'

/**
 * Lo que falta, dicho en vez de escondido.
 *
 * Estas tarjetas desaparecían solas cuando no había dato. Para quien tiene el
 * dispositivo y todavía no sincronizó está bien —vuelven en cuanto hay datos—,
 * pero para quien NO lo tiene la pantalla queda a medias sin explicar por qué,
 * y lo razonable es pensar que está mal instalado.
 *
 * La distinción importa porque los dispositivos de Garmin miden cosas muy
 * distintas: un ciclocomputador no tiene muñeca, así que no hay pulso en
 * reposo, ni estrés, ni sueño, ni pasos. No es una falla, es que ese aparato no
 * mide eso.
 *
 * Se muestra compacta a propósito. Una tarjeta vacía del tamaño de la llena
 * llenaría el panel de huecos con la misma prominencia que los datos reales.
 */
export default function SinSensor({
  titulo, necesita, nota,
}: {
  titulo: string
  /** Qué hace falta para que esto aparezca, en una frase. */
  necesita: string
  /** Opcional: qué hacer al respecto. */
  nota?: string
}) {
  return (
    <Card className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span className="shrink-0 mt-0.5 text-ink-faint"><Icon name="info" size={17} /></span>
        <div className="min-w-0">
          <div className="text-[15px] font-medium text-ink-secondary">{titulo}</div>
          <p className="text-[13px] text-ink-muted leading-relaxed mt-0.5">
            {necesita}
            {nota && <> {nota}</>}
          </p>
        </div>
      </div>
    </Card>
  )
}
