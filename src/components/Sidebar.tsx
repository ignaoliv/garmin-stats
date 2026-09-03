import { NavLink } from 'react-router-dom'
import { useActivityStore } from '../stores/activityStore'
import Icon, { type IconName } from './Icon'
import SyncButton from './SyncButton'

/**
 * Grouped rail. Eleven flat entries gave no sense of what belonged with what;
 * three short groups let the eye skip straight to the right area.
 */
const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Resumen', icon: 'dashboard' },
  { to: '/activities', label: 'Actividades', icon: 'actividades' },
  { to: '/entrenar', label: 'Entrenar', icon: 'fuerza' },
  { to: '/analizar', label: 'Analizar', icon: 'progreso' },
  { to: '/salud', label: 'Salud', icon: 'corazon' },
]

export default function Sidebar() {
  const stats = useActivityStore(s => s.stats)
  const activities = useActivityStore(s => s.activities)

  return (
    <aside className="w-16 lg:w-[218px] shrink-0 glass border-y-0 border-l-0 rounded-none flex flex-col min-h-screen transition-[width]">
      <div className="px-3 lg:px-5 pt-5 pb-4">
        <div className="text-ink-primary font-semibold text-[15px] tracking-[-0.02em]">
          <span className="lg:hidden">GS</span>
          <span className="hidden lg:inline">Garmin Stats</span>
        </div>
        <div className="label-plain mt-0.5 hidden lg:block">
          {activities.length > 0 ? `${activities.length.toLocaleString('es-ES')} actividades` : 'Sin datos aún'}
        </div>
      </div>

      <nav className="flex-1 px-2 pb-4">
        <div className="space-y-0.5">
              {NAV.map(({ to, label, icon }) => (
                <NavLink
                  key={to}
                  to={to}
                  end={to === '/'}
                  title={label}
                  className={({ isActive }) =>
                    `relative flex items-center gap-3 px-3 py-2 rounded-lg text-[13.5px] transition-colors
                     justify-center lg:justify-start ${
                       isActive
                         ? 'bg-white/[0.07] text-ink-primary font-medium'
                         : 'text-ink-muted hover:text-ink-secondary hover:bg-white/[0.035]'
                     }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      {/* A thin bar rather than a filled pill: reads as "you are
                          here" without turning the rail into a row of buttons. */}
                      {isActive && (
                        <span className="absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-r bg-accent" />
                      )}
                      <Icon name={icon} />
                      <span className="hidden lg:inline">{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
        </div>
      </nav>

      <div className="px-2 pb-2">
        <SyncButton />
      </div>

      <div className="px-5 py-4 border-t border-white/[0.06] hidden lg:block">
        <NavLink to="/settings" className="flex items-center gap-3 text-[13.5px] text-ink-muted hover:text-ink-secondary transition-colors">
          <Icon name="ajustes" />
          Ajustes
        </NavLink>
        {stats && (
          <div className="label-plain mt-3 text-[12px]">
            Última sync {new Date(stats.syncedAt).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
          </div>
        )}
      </div>
    </aside>
  )
}
