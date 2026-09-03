import { NavLink } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'

const NAV = [
  { to: '/', label: 'Dashboard', icon: '◉' },
  { to: '/activities', label: 'Actividades', icon: '▤' },
  { to: '/fuerza', label: 'Fuerza', icon: '🏋️' },
  { to: '/planificar', label: 'Planificar', icon: '📋' },
  { to: '/sueno', label: 'Sueño', icon: '😴' },
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
    <aside className="w-16 lg:w-56 shrink-0 glass border-y-0 border-l-0 rounded-none flex flex-col min-h-screen transition-[width]">
      {/* Logo */}
      <div className="px-3 lg:px-5 py-5 border-b border-surface-line">
        <div className="text-ink-primary font-bold text-lg tracking-tight">
          <span className="lg:hidden">GS</span>
          <span className="hidden lg:inline">Garmin Stats</span>
        </div>
        <div className="text-ink-muted text-[13px] mt-0.5 hidden lg:block">
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
                  ? 'bg-accent/15 text-accent-soft font-semibold'
                  : 'text-ink-secondary hover:text-ink-primary hover:bg-surface-hover'
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
        <div className="px-5 py-4 border-t border-surface-line hidden lg:block">
          <div className="text-[13px] text-ink-muted">
            Última sync
          </div>
          <div className="text-[13px] text-ink-secondary mt-0.5">
            {new Date(stats.syncedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
          </div>
          <div className="mt-3 text-[12px] text-ink-muted leading-relaxed">
            Para actualizar:<br />
            <code className="text-ink-secondary">cd fetch && python sync.py</code>
          </div>
        </div>
      )}
    </aside>
  )
}
