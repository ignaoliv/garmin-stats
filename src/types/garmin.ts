export type Sport =
  | 'running'
  | 'cycling'
  | 'swimming'
  | 'strength'
  | 'cardio'
  | 'walking'
  | 'other'

export interface HRZone {
  zone: number
  name: string
  seconds: number
  lowBPM: number | null
  highBPM: number | null
}

export interface StrengthExercise {
  name: string
  sets: number
  reps: number
  volumeKg: number      // Σ reps × peso
  maxWeightKg: number
}

export interface StrengthDetail {
  exercises: StrengthExercise[]
  totalSets: number
  totalReps: number
  totalVolumeKg: number
}

export interface StreamPoint {
  seconds: number
  km: number
  hr: number | null
  speed: number | null       // km/h
  power: number | null       // watts
  cadence: number | null
  elevation: number | null   // m
}

export interface Lap {
  index: number
  distance: number     // km
  duration: number     // seconds
  avgHR: number | null
  avgPace: number | null  // sec/km
  avgSpeed: number | null // km/h
  avgPower: number | null // watts
  elevationGain: number
}

export interface ActivitySummary {
  id: number
  title: string
  sport: Sport
  rawSport?: string | null  // Garmin activityType.typeKey, kept for accurate grouping
  workoutId?: number | null // set when the session ran a planned workout
  zonasFC?: number[]        // real seconds per HR zone [z1..z5], straight from Garmin
  tssOrigen?: string        // 'trimp-stream' when computed from the per-second stream
  startTime: string    // ISO local datetime
  distance: number     // km
  duration: number     // seconds
  movingTime: number   // seconds
  elevationGain: number
  avgHR: number
  maxHR: number
  calories: number
  tss: number | null
  avgPace: number | null    // sec/km (running/swim)
  avgSpeed: number | null   // km/h (cycling)
  avgPower: number | null   // watts (cycling)
  normalizedPower: number | null
  avgCadence: number | null
  vo2max: number | null
  aerobicTE: number | null
  anaerobicTE: number | null
  // Swimming only
  swolf?: number | null
  avgStrokesPerLength?: number | null
}

export interface ActivityDetail extends ActivitySummary {
  laps: Lap[]
  hrZones: HRZone[]
  gpxCoords: [number, number][]  // [lat, lon] pairs
  avgStrideLength?: number | null
  trainingEffect?: number | null
  strength?: StrengthDetail    // only present on gym sessions
  streams?: StreamPoint[]      // downsampled in-activity time series
}

export interface FitnessPoint {
  date: string   // YYYY-MM-DD
  ctl: number    // Chronic Training Load (Fitness)
  atl: number    // Acute Training Load (Fatigue)
  tsb: number    // Training Stress Balance (Form)
  tss: number    // TSS accumulated that day
}

export interface GlobalStats {
  totalActivities: number
  byType: Record<string, number>
  vo2maxHistory: { date: string; value: number }[]
  syncedAt: string
}

export interface UserSettings {
  maxHR: number
  ftp: number          // Functional Threshold Power (watts)
  lthrRunning: number  // Lactate threshold HR for running
  thresholdPace: number // seconds per km at threshold
  ftpDate?: string
}

export const DEFAULT_SETTINGS: UserSettings = {
  maxHR: 185,
  ftp: 250,
  lthrRunning: 165,
  thresholdPace: 270, // ~4:30/km
}
