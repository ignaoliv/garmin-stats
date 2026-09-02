import type { ActivitySummary, Sport } from '../types/garmin'

/**
 * Sport taxonomy.
 *
 * Order is the categorical colour order and is NOT cosmetic: the hues were
 * validated as a set against the app surface (#0f172a) for colour-vision
 * deficiency separation, so slots must be assigned in this order and never
 * cycled. Slots are ordered by how much of this athlete's training they hold.
 * `other` is the deliberate fold-to-neutral bucket, not a categorical hue.
 */
export const SPORTS: Sport[] = ['cycling', 'strength', 'cardio', 'walking', 'running', 'swimming']

export const SPORT_META: Record<Sport, { label: string; icon: string; color: string }> = {
  cycling:  { label: 'Ciclismo', icon: '🚴', color: '#3987e5' },
  strength: { label: 'Fuerza',   icon: '🏋️', color: '#d95926' },
  cardio:   { label: 'Cardio',   icon: '❤️', color: '#199e70' },
  walking:  { label: 'Caminar',  icon: '🚶', color: '#c98500' },
  running:  { label: 'Running',  icon: '🏃', color: '#d55181' },
  swimming: { label: 'Natación', icon: '🏊', color: '#9085e9' },
  other:    { label: 'Otro',     icon: '⚡', color: '#7c8aa3' },
}

export const sportLabel = (s: Sport) => SPORT_META[s]?.label ?? 'Otro'
export const sportIcon  = (s: Sport) => SPORT_META[s]?.icon  ?? '⚡'
export const sportColor = (s: Sport) => SPORT_META[s]?.color ?? SPORT_META.other.color

/** Garmin `activityType.typeKey` → our category. */
const RAW_SPORT_MAP: Record<string, Sport> = {
  running: 'running', trail_running: 'running', treadmill_running: 'running',
  track_running: 'running', virtual_run: 'running', indoor_running: 'running',
  cycling: 'cycling', road_cycling: 'cycling', road_biking: 'cycling', indoor_cycling: 'cycling',
  virtual_ride: 'cycling', mountain_biking: 'cycling', gravel_cycling: 'cycling',
  cyclocross: 'cycling', track_cycling: 'cycling', commuting: 'cycling',
  swimming: 'swimming', open_water_swimming: 'swimming', lap_swimming: 'swimming',
  pool_swimming: 'swimming',
  strength_training: 'strength', indoor_strength: 'strength', pilates: 'strength',
  yoga: 'strength', breathwork: 'strength',
  indoor_cardio: 'cardio', cardio_training: 'cardio', hiit: 'cardio',
  elliptical: 'cardio', indoor_rowing: 'cardio', rowing_v2: 'cardio', stair_climbing: 'cardio',
  walking: 'walking', casual_walking: 'walking', speed_walking: 'walking',
  hiking: 'walking',
}

/**
 * Title fallback, in Spanish and English.
 *
 * Needed because activities synced before `rawSport` existed collapsed every
 * non-endurance session into `other` — which is exactly why strength work was
 * invisible. Drops out on its own once a sync has repopulated `rawSport`.
 */
const TITLE_PATTERNS: [RegExp, Sport][] = [
  [/fuerza|strength|pesas|gimnasio|\bgym\b|musculaci|pilates|yoga/i, 'strength'],
  [/cardio|el[ií]ptic|hiit|remo\b|rowing|escalador/i, 'cardio'],
  [/caminar|caminata|walk|hiking|senderismo|trekking/i, 'walking'],
  [/correr|carrera|running|trote|marat/i, 'running'],
  [/ciclismo|bici|cycling|ride|mtb/i, 'cycling'],
  [/nataci|swim|pileta|piscina/i, 'swimming'],
]

/**
 * Resolve an activity's category. Prefers the raw Garmin type, falls back to
 * the title, and only then gives up and returns whatever the file carried.
 */
export function sportOf(a: Pick<ActivitySummary, 'sport' | 'title'> & { rawSport?: string | null }): Sport {
  const raw = a.rawSport?.toLowerCase()
  if (raw && RAW_SPORT_MAP[raw]) return RAW_SPORT_MAP[raw]

  if (a.sport === 'other' || !a.sport) {
    for (const [re, sport] of TITLE_PATTERNS) if (re.test(a.title)) return sport
  }
  return a.sport ?? 'other'
}

/** True for sports measured in time-under-load rather than distance. */
export const isTimeBased = (s: Sport) => s === 'strength' || s === 'cardio'
