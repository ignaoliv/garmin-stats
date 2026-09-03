import Tabs from '../components/Tabs'
import Strength from './Strength'
import PlanStrength from './PlanStrength'
import Eventos from './Eventos'

/** Looking at how strength is going and planning the next block are the same
 *  workflow, so they live behind one entry. */
export default function Entrenar() {
  return (
    <Tabs
      titulo="Entrenar"
      subtitulo="Tu fuerza, la planificación y las carreras de la región"
      pestañas={[
        { clave: 'fuerza', label: 'Fuerza', render: () => <Strength /> },
        { clave: 'planificar', label: 'Planificar', render: () => <PlanStrength /> },
        { clave: 'eventos', label: 'Carreras', render: () => <Eventos /> },
      ]}
    />
  )
}
