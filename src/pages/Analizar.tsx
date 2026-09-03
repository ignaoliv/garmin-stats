import Tabs from '../components/Tabs'
import Progress from './Progress'
import PerformanceAnalysis from './PerformanceAnalysis'
import FitnessChartPage from './FitnessChartPage'
import ZoneAnalysis from './ZoneAnalysis'

/**
 * Everything that answers "how am I trending".
 *
 * These were four separate nav entries showing overlapping views of the same
 * history — the consistency heatmap alone appeared on three pages. One entry
 * with sections keeps the depth and removes the guessing about which page held
 * which chart.
 */
export default function Analizar() {
  return (
    <Tabs
      titulo="Analizar"
      subtitulo="Tendencias, temporadas y rendimiento"
      pestañas={[
        { clave: 'progreso', label: 'Progreso', render: () => <Progress /> },
        { clave: 'forma', label: 'Forma', render: () => <FitnessChartPage /> },
        { clave: 'rendimiento', label: 'Rendimiento', render: () => <PerformanceAnalysis /> },
        { clave: 'zonas', label: 'Zonas', render: () => <ZoneAnalysis /> },
      ]}
    />
  )
}
