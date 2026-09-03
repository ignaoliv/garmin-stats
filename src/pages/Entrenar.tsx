import Tabs from '../components/Tabs'
import Strength from './Strength'
import PlanStrength from './PlanStrength'

/** Looking at how strength is going and planning the next block are the same
 *  workflow, so they live behind one entry. */
export default function Entrenar() {
  return (
    <Tabs
      titulo="Entrenar"
      subtitulo="Tu fuerza y la planificación de las próximas sesiones"
      pestañas={[
        { clave: 'fuerza', label: 'Fuerza', render: () => <Strength /> },
        { clave: 'planificar', label: 'Planificar', render: () => <PlanStrength /> },
      ]}
    />
  )
}
