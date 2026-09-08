import { NavLink } from 'react-router-dom'
import Icon, { type IconName } from './Icon'

/**
 * La navegación en el teléfono.
 *
 * El riel lateral se comía 64 píxeles de ancho permanentes en una pantalla de
 * 390, y en esos 64 sólo cabía un ícono sin etiqueta — pagaba el precio de una
 * columna y no daba ni el nombre de la sección. Abajo el pulgar llega solo, no
 * roba ancho y las etiquetas entran.
 *
 * Son siete destinos y no caben cinco cómodos, así que la fila desplaza en
 * horizontal. Esconder los últimos dos detrás de un "más" los volvería
 * invisibles; que asomen a medias dice que hay más y se llega con el dedo.
 */
const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: '/', label: 'Resumen', icon: 'dashboard' },
  { to: '/comida', label: 'Comida', icon: 'comida' },
  { to: '/pantalla', label: 'Pantalla', icon: 'pantalla' },
  { to: '/entrenar', label: 'Entrenar', icon: 'fuerza' },
  { to: '/salud', label: 'Salud', icon: 'corazon' },
  { to: '/analizar', label: 'Analizar', icon: 'progreso' },
  { to: '/eventos', label: 'Eventos', icon: 'records' },
  { to: '/activities', label: 'Actividades', icon: 'actividades' },
  { to: '/settings', label: 'Ajustes', icon: 'ajustes' },
]

export default function BarraInferior() {
  return (
    <nav
      className="lg:hidden shrink-0 glass border-x-0 border-b-0 rounded-none
                 overflow-x-auto overscroll-x-contain"
      // El área segura de abajo: sin esto la barra queda debajo de la línea
      // del iPhone y el último milímetro no se puede tocar.
      style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      aria-label="Secciones"
    >
      <div className="flex min-w-max">
        {NAV.map(({ to, label, icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === '/'}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center gap-1 shrink-0
               w-[76px] pt-2.5 pb-2 text-[11px] leading-none transition-colors ${
                 isActive ? 'text-accent' : 'text-ink-muted'
               }`
            }
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <span className="absolute top-0 left-1/2 -translate-x-1/2 h-[2.5px] w-8
                                   rounded-b bg-accent" />
                )}
                <Icon name={icon} size={21} />
                <span>{label}</span>
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}
