import Tabs from '../components/Tabs'
import Sleep from './Sleep'
import StepsCard from '../components/StepsCard'
import MetricasDisponibles from '../components/MetricasDisponibles'

function Movimiento() {
  return (
    <div className="max-w-[1180px] mx-auto px-6 py-6 space-y-6 page-in">
      <StepsCard windowDays={30} />
      <MetricasDisponibles />
    </div>
  )
}

/** Sleep, daily movement and what the device can actually measure. */
export default function Salud() {
  return (
    <Tabs
      titulo="Salud"
      subtitulo="Sueño, movimiento diario y recuperación"
      pestañas={[
        { clave: 'sueno', label: 'Sueño', render: () => <Sleep /> },
        { clave: 'movimiento', label: 'Pasos', render: () => <Movimiento /> },
      ]}
    />
  )
}
