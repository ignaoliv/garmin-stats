import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { useActivityStore } from './stores/activityStore'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Entrenar from './pages/Entrenar'
import Carreras from './pages/Eventos'
import Analizar from './pages/Analizar'
import Salud from './pages/Salud'
import Activities from './pages/Activities'
import ActivityDetailPage from './pages/ActivityDetail'
import Settings from './pages/Settings'

export default function App() {
  const loadActivities = useActivityStore(s => s.loadActivities)
  const loadStats = useActivityStore(s => s.loadStats)

  useEffect(() => {
    loadActivities()
    loadStats()
  }, [loadActivities, loadStats])

  return (
    <BrowserRouter>
      <div className="flex h-screen overflow-hidden">
        <Sidebar />
        <main className="flex-1 overflow-hidden flex flex-col">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/activities" element={<Activities />} />
            <Route path="/activity/:id" element={<ActivityDetailPage />} />
            <Route path="/entrenar" element={<Entrenar />} />
            <Route path="/carreras" element={<Carreras />} />
            <Route path="/analizar" element={<Analizar />} />
            <Route path="/salud" element={<Salud />} />
            <Route path="/settings" element={<Settings />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  )
}
