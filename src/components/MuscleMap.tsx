/**
 * Front/back body diagram with the worked muscles highlighted.
 *
 * Schematic rather than anatomical: the job is to answer "what does this
 * session hit, and what does it skip" at a glance, which a simplified silhouette
 * does as well as a detailed drawing and far more legibly at this size.
 *
 * Muscle keys follow free-exercise-db's vocabulary so the mapping in
 * src/data/exercise_meta.json plugs straight in.
 */
const PRIMARY = '#ef4444'
const SECONDARY = '#fbbf24'
const IDLE = '#2c3852'
const OUTLINE = '#46526e'

type Shape = { d?: string; cx?: number; cy?: number; rx?: number; ry?: number }

// Rough but recognisable regions. Coordinates are in a 120×260 body box.
const FRONT: Record<string, Shape[]> = {
  neck:        [{ d: 'M52 30 h16 v10 h-16 z' }],
  shoulders:   [{ cx: 36, cy: 52, rx: 11, ry: 9 }, { cx: 84, cy: 52, rx: 11, ry: 9 }],
  chest:       [{ d: 'M45 44 h14 v20 q-7 5 -14 0 z' }, { d: 'M61 44 h14 v20 q-7 5 -14 0 z' }],
  biceps:      [{ cx: 30, cy: 74, rx: 8, ry: 14 }, { cx: 90, cy: 74, rx: 8, ry: 14 }],
  forearms:    [{ cx: 26, cy: 102, rx: 7, ry: 15 }, { cx: 94, cy: 102, rx: 7, ry: 15 }],
  abdominals:  [{ d: 'M48 68 h24 v34 q-12 6 -24 0 z' }],
  adductors:   [{ d: 'M52 112 h16 v22 q-8 4 -16 0 z' }],
  quadriceps:  [{ cx: 47, cy: 146, rx: 12, ry: 26 }, { cx: 73, cy: 146, rx: 12, ry: 26 }],
  calves:      [{ cx: 46, cy: 200, rx: 9, ry: 22 }, { cx: 74, cy: 200, rx: 9, ry: 22 }],
}

const BACK: Record<string, Shape[]> = {
  neck:        [{ d: 'M52 30 h16 v10 h-16 z' }],
  traps:       [{ d: 'M44 40 h32 l-8 22 h-16 z' }],
  shoulders:   [{ cx: 36, cy: 52, rx: 11, ry: 9 }, { cx: 84, cy: 52, rx: 11, ry: 9 }],
  lats:        [{ d: 'M42 58 h14 v30 l-14 -8 z' }, { d: 'M64 58 h14 v22 l-14 8 z' }],
  'middle back': [{ d: 'M56 60 h8 v28 h-8 z' }],
  triceps:     [{ cx: 30, cy: 74, rx: 8, ry: 14 }, { cx: 90, cy: 74, rx: 8, ry: 14 }],
  forearms:    [{ cx: 26, cy: 102, rx: 7, ry: 15 }, { cx: 94, cy: 102, rx: 7, ry: 15 }],
  'lower back':[{ d: 'M48 90 h24 v16 h-24 z' }],
  glutes:      [{ cx: 52, cy: 118, rx: 11, ry: 11 }, { cx: 68, cy: 118, rx: 11, ry: 11 }],
  abductors:   [{ cx: 38, cy: 122, rx: 6, ry: 9 }, { cx: 82, cy: 122, rx: 6, ry: 9 }],
  hamstrings:  [{ cx: 47, cy: 152, rx: 12, ry: 24 }, { cx: 73, cy: 152, rx: 12, ry: 24 }],
  calves:      [{ cx: 46, cy: 200, rx: 9, ry: 22 }, { cx: 74, cy: 200, rx: 9, ry: 22 }],
}

const SILHOUETTE =
  'M60 12 a10 10 0 0 1 0 20 a10 10 0 0 1 0 -20 M60 32 ' +
  'C40 34 30 42 26 56 L20 118 h9 l6 -52 v46 ' +
  'l4 62 l3 66 h13 l3 -66 l2 -30 l2 30 l3 66 h13 l3 -66 l4 -62 v-46 l6 52 h9 ' +
  'L94 56 C90 42 80 34 60 32 z'

function Body({
  regiones, primarios, secundarios, etiqueta,
}: {
  regiones: Record<string, Shape[]>
  primarios: Set<string>
  secundarios: Set<string>
  etiqueta: string
}) {
  const fill = (m: string) => (primarios.has(m) ? PRIMARY : secundarios.has(m) ? SECONDARY : IDLE)
  return (
    <figure className="flex flex-col items-center gap-1.5 m-0">
      <svg viewBox="0 0 120 260" width="118" height="256" role="img" aria-label={`Músculos trabajados, vista ${etiqueta}`}>
        <path d={SILHOUETTE} fill="#131c2e" stroke={OUTLINE} strokeWidth="1.4" strokeLinejoin="round" />
        {Object.entries(regiones).map(([musculo, formas]) =>
          formas.map((f, i) => {
            const activo = primarios.has(musculo) || secundarios.has(musculo)
            const common = {
              fill: fill(musculo),
              stroke: activo ? '#0b1220' : 'none',
              strokeWidth: 0.8,
              opacity: activo ? 0.95 : 0.55,
            }
            return f.d
              ? <path key={`${musculo}${i}`} d={f.d} {...common} />
              : <ellipse key={`${musculo}${i}`} cx={f.cx} cy={f.cy} rx={f.rx} ry={f.ry} {...common} />
          }),
        )}
      </svg>
      <figcaption className="text-[12px] text-ink-muted">{etiqueta}</figcaption>
    </figure>
  )
}

export default function MuscleMap({
  primarios = [], secundarios = [],
}: { primarios?: string[]; secundarios?: string[] }) {
  const p = new Set(primarios)
  // A muscle worked directly should never also read as secondary.
  const s = new Set(secundarios.filter(m => !p.has(m)))

  return (
    <div>
      <div className="flex items-start justify-center gap-4">
        <Body regiones={FRONT} primarios={p} secundarios={s} etiqueta="Frente" />
        <Body regiones={BACK} primarios={p} secundarios={s} etiqueta="Espalda" />
      </div>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 mt-3">
        {[[PRIMARY, 'Primarios'], [SECONDARY, 'Secundarios'], [IDLE, 'Sin trabajar']].map(([c, l]) => (
          <span key={l} className="flex items-center gap-1.5 text-[13px] text-ink-secondary">
            <span className="w-3 h-3 rounded-full inline-block" style={{ background: c }} />
            {l}
          </span>
        ))}
      </div>
    </div>
  )
}
