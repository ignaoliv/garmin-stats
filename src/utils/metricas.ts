/**
 * Metric registry.
 *
 * Every metric the app knows how to show is declared here whether or not the
 * current device records it. Availability is DETECTED from the data rather than
 * hard-coded per device: swap a Venu for a ring that reports HRV and skin
 * temperature and those rows fill themselves in, no code change.
 *
 * Declaring the gap is the point. Hiding a metric implies it does not exist;
 * showing it greyed out with a reason says "your device does not report this",
 * which is a different and more useful statement.
 */
export type Estado = 'disponible' | 'parcial' | 'sin-registro'

export interface Metrica {
  clave: string
  nombre: string
  descripcion: string
  /** Where the value lives, for detection. */
  fuente: 'sueño' | 'bienestar'
  campo: string
  unidad?: string
  /** Present in Oura's model, for the comparison table. */
  enOura: boolean
  /** Why a device might not report it, shown when there is no data at all. */
  motivoAusencia?: string
}

export const METRICAS: Metrica[] = [
  { clave: 'duracion', nombre: 'Duración del sueño', descripcion: 'Tiempo total dormido', fuente: 'sueño', campo: 'total_s', enOura: true },
  { clave: 'profundo', nombre: 'Sueño profundo', descripcion: 'La fase que más repara físicamente', fuente: 'sueño', campo: 'profundo_s', enOura: true },
  { clave: 'rem', nombre: 'REM', descripcion: 'La fase asociada a la recuperación mental', fuente: 'sueño', campo: 'rem_s', enOura: true },
  { clave: 'continuidad', nombre: 'Continuidad', descripcion: 'Tiempo despierto durante la noche', fuente: 'sueño', campo: 'despierto_s', enOura: true },
  {
    clave: 'spo2', nombre: 'Oxigenación nocturna', unidad: '%',
    descripcion: 'Saturación de oxígeno en sangre mientras dormís. Caídas marcadas y repetidas pueden señalar apneas.',
    fuente: 'sueño', campo: 'spo2_medio', enOura: false,
    motivoAusencia: 'Requiere sensor de pulsioximetría y que esté activado durante el sueño.',
  },
  {
    clave: 'respiracion', nombre: 'Frecuencia respiratoria', unidad: 'resp/min',
    descripcion: 'Respiraciones por minuto durante la noche. Es estable en cada persona, así que una subida sostenida suele preceder a un resfrío o a fatiga acumulada.',
    fuente: 'sueño', campo: 'respiracion_media', enOura: true,
    motivoAusencia: 'Requiere sensor óptico con medición de respiración.',
  },
  { clave: 'fcReposo', nombre: 'FC en reposo', unidad: 'ppm', descripcion: 'Pulsaciones en reposo; bajarlas indica mejor recuperación', fuente: 'bienestar', campo: 'fcReposo', enOura: true },
  { clave: 'bateria', nombre: 'Body battery', descripcion: 'Reservas de energía estimadas', fuente: 'bienestar', campo: 'bateriaMax', enOura: false },
  { clave: 'estres', nombre: 'Estrés', descripcion: 'Nivel medio de estrés del día', fuente: 'bienestar', campo: 'estresMedio', enOura: false },
  {
    clave: 'hrv', nombre: 'Variabilidad cardíaca (HRV)', unidad: 'ms',
    descripcion: 'Variación entre latidos. Es la señal de recuperación más usada, y el eje del puntaje de disposición de Oura.',
    fuente: 'bienestar', campo: 'hrv', enOura: true,
    motivoAusencia: 'Tu dispositivo no reporta HRV nocturno. Lo registran los Garmin de la línea Forerunner, Fenix y Venu 3 en adelante, además de Oura y Whoop.',
  },
  {
    clave: 'temperatura', nombre: 'Temperatura corporal', unidad: '°C',
    descripcion: 'Desvío respecto de tu línea de base. Sube ante infección, alcohol o fase lútea.',
    fuente: 'bienestar', campo: 'temperatura', enOura: true,
    motivoAusencia: 'Tu dispositivo no tiene sensor de temperatura. Lo tienen Oura, Whoop y los Garmin con Health Snapshot avanzado.',
  },
]

export interface Evaluada extends Metrica {
  estado: Estado
  conDato: number
  total: number
  cobertura: number
}

/**
 * Classify each metric against the data actually on disk.
 *
 * 'parcial' matters as its own state: a metric present on 6 of 7 nights is
 * working, while one present on 4 of 121 days is technically "available" and
 * practically useless. Treating both as simply present would flatter the app.
 */
export function evaluarMetricas(
  noches: Record<string, unknown>[],
  dias: Record<string, unknown>[],
): Evaluada[] {
  return METRICAS.map(m => {
    const filas = m.fuente === 'sueño' ? noches : dias
    const conDato = filas.filter(r => r[m.campo] !== null && r[m.campo] !== undefined).length
    const total = filas.length
    const cobertura = total ? conDato / total : 0
    const estado: Estado = conDato === 0 ? 'sin-registro' : cobertura >= 0.6 ? 'disponible' : 'parcial'
    return { ...m, estado, conDato, total, cobertura }
  })
}
