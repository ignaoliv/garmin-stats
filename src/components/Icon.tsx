/**
 * One icon system for the whole interface.
 *
 * The navigation previously mixed geometric glyphs (◉ ▤ ⚙) with colour emoji
 * (🏋️ 📊 😴). They render at different sizes, weights and colours and cannot be
 * tinted by state, which is what made the rail look unfinished. These are
 * single-stroke paths that inherit currentColor and align on a 24px grid.
 */
const PATHS: Record<string, string> = {
  dashboard: 'M4 13h6V4H4v9Zm0 7h6v-5H4v5Zm10 0h6v-9h-6v9Zm0-16v5h6V4h-6Z',
  actividades: 'M4 6h16M4 12h16M4 18h10',
  fuerza: 'M6.5 7v10M17.5 7v10M3.5 9.5v5M20.5 9.5v5M6.5 12h11',
  planificar: 'M8 3v3M16 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1ZM9 14h2M14 14h2',
  sueno: 'M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z',
  progreso: 'M4 20V10M10 20V4M16 20v-7M22 20H2',
  fitness: 'M3 17l5-6 4 3 5-7 4 4',
  zonas: 'M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-4.5 5-9 5-9Zm0 15a3 3 0 0 0 3-3c0-1.8-3-4.5-3-4.5S9 13.2 9 15a3 3 0 0 0 3 3Z',
  rendimiento: 'M13 2 4 14h6l-1 8 9-12h-6l1-8Z',
  records: 'M8 3h8v5a4 4 0 1 1-8 0V3ZM5 5h3M16 5h3M12 12v4M9 21h6M10 16h4l1 5H9l1-5Z',
  ajustes: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8.4-3a8.4 8.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a8.3 8.3 0 0 0-2.2-1.3L15.3 2h-4l-.4 2.6a8.3 8.3 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8.4 8.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a8.3 8.3 0 0 0 2.2 1.3l.4 2.6h4l.4-2.6a8.3 8.3 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.06-.43.1-.86.1-1.3Z',
  cerebro: 'M12 5a3 3 0 0 0-5.9-.7A2.8 2.8 0 0 0 3.5 7a2.8 2.8 0 0 0 .4 1.5A3 3 0 0 0 3 11a3 3 0 0 0 1.2 2.4A3 3 0 0 0 4 15a3 3 0 0 0 3 3 3 3 0 0 0 5 1.9ZM12 5a3 3 0 0 1 5.9-.7A2.8 2.8 0 0 1 20.5 7a2.8 2.8 0 0 1-.4 1.5A3 3 0 0 1 21 11a3 3 0 0 1-1.2 2.4A3 3 0 0 1 20 15a3 3 0 0 1-3 3 3 3 0 0 1-5 1.9ZM12 5v14.9',
  pasos: 'M8.5 4.5c1.4 0 2.2 1.2 2.2 3 0 1.6-.6 3.2-.6 4.6 0 1.2.6 1.9.6 3.1 0 1.3-.9 2.3-2.2 2.3s-2.2-1-2.2-2.3c0-1.2.6-1.9.6-3.1 0-1.4-.6-3-.6-4.6 0-1.8.8-3 2.2-3ZM16 8.5c1.2 0 1.9 1 1.9 2.5 0 1.4-.5 2.7-.5 3.9 0 1 .5 1.6.5 2.6 0 1.1-.8 2-1.9 2s-1.9-.9-1.9-2c0-1 .5-1.6.5-2.6 0-1.2-.5-2.5-.5-3.9 0-1.5.7-2.5 1.9-2.5Z',
  corazon: 'M12 20s-7-4.4-7-9a4 4 0 0 1 7-2.6A4 4 0 0 1 19 11c0 4.6-7 9-7 9Z',
  info: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm0-13h.01M11 12h1v5h1',
  sincronizar: 'M20 11a8 8 0 0 0-14.1-4.6M4 13a8 8 0 0 0 14.1 4.6M20 5v6h-6M4 19v-6h6',
}

export type IconName = keyof typeof PATHS

export default function Icon({
  name, size = 19, className = '',
}: { name: IconName; size?: number; className?: string }) {
  const d = PATHS[name]
  if (!d) return null
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.75} strokeLinecap="round" strokeLinejoin="round"
      className={className} aria-hidden="true"
    >
      <path d={d} />
    </svg>
  )
}
