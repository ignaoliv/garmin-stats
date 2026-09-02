import { NavLink } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/activities', label: 'Actividades', icon: '▤' },
  { to: '/fuerza', label: 'Fuerza', icon: '🏋️' },
  { to: '/planificar', label: 'Planificar', icon: '📋' },
  { to: '/progreso', label: 'Progreso', icon: '📊' },
  { to: '/fitness', label: 'Fitness & Forma', icon: '📈' },
  { to: '/zones', label: 'Zonas', icon: '🔥' },
  { to: '/performance', label: 'Rendimiento', icon: '⚡' },
  { to: '/records', label: 'Récords', icon: '🏅' },
  { to: '/settings', label: 'Ajustes', icon: '⚙' },
]

export default function Sidebar() {
  const stats = useActivityStore(s => s.stats)
  const activities = useActivityStore(s => s.activities)

  return (
    <aside className="w-16 lg:w-56 shrink-0 bg-[#131c2e] border-r border-[#28334a] flex flex-col min-h-screen transition-[width]">
      {/* Logo */}
      <div className="px-3 lg:px-5 py-5 border-b border-[#28334a]">
        <div className="text-[#f1f5f9] font-bold text-lg tracking-tight">
          <span className="lg:hidden">GS</span>
          <span className="hidden lg:inline">Garmin Stats</span>
        </div>
        <div className="text-[#94a3b8] text-[13px] mt-0.5 hidden lg:block">
          {activities.length > 0 ? `${activities.length} actividades` : 'Sin datos aún'}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 py-4 px-2 space-y-0.5">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-[14px] transition-colors justify-center lg:justify-start ${
                isActive
                  ? 'bg-[#fc5200]/15 text-[#ff7a3d] font-semibold'
                  : 'text-[#cbd5e1] hover:text-[#f1f5f9] hover:bg-[#1e2942]'
              }`
            }
          >
            <span className="text-base" title={label}>{icon}</span>
            <span className="hidden lg:inline">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Sync info */}
      {stats && (
        <div className="px-5 py-4 border-t border-[#28334a] hidden lg:block">
          <div className="text-[13px] text-[#94a3b8]">
            Última sync
          </div>
          <div className="text-[13px] text-[#cbd5e1] mt-0.5">
            {new Date(stats.syncedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className="mt-3 text-[12px] text-[#94a3b8] leading-relaxed">
            Para actualizar:<br />
            <code className="text-[#cbd5e1]">cd fetch && python sync.py</code>
          </div>
        </div>
      )}
    </aside>
  )
}
