import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useActivityStore } from './stores/activityStore'
import Sidebar from './components/Sidebar'
import Sesion from './components/Sesion'
import BarraInferior from './components/BarraInferior'
import Dashboard from './pages/Dashboard'
import Entrenar from './pages/Entrenar'
import Eventos from './pages/Eventos'
import Analizar from './pages/Analizar'
import Salud from './pages/Salud'
import Comida from './pages/Comida'
import Activities from './pages/Activities'
import ActivityDetailPage from './pages/ActivityDetail'
import Settings from './pages/Settings'

/**
 * El panel, ya con sesión.
 *
 * Separado de App a propósito: la carga de datos vive acá adentro para que no
 * arranque hasta que haya sesión. Cuando estaba arriba, pedía las actividades
 * mientras se mostraba la puerta, se comía un 401, y el store quedaba en
 * estado de error — así que al entrar la contraseña aparecía "Sin datos de
 * Garmin" en vez del panel, porque nada volvía a intentar.
 */
function Panel() {
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)

  useEffect(() => {
    loadActivities()
    loadStats()
  }, [loadActivities, loadStats])

  return (
    <BrowserRouter>
      <div className="flex flex-col lg:flex-row h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 min-w-0 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/activity/:id" element={<ActivityDetailPage />} />
            <Route path="/entrenar" element={<Entrenar />} />
            <Route path="/eventos" element={<Eventos />} />
            <Route path="/analizar" element={<Analizar />} />
            <Route path="/salud" element={<Salud />} />
            <Route path="/comida" element={<Comida />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
        <BarraInferior />
      </div>
    </BrowserRouter>
  )
}

export default function App() {
  return (
    <Sesion>
      <Panel />
    </Sesion>
  )
}
