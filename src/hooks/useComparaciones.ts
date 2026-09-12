import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { estimateTSS } from '../utils/calculations'
import type { ActivitySummary } from '../types/garmin'

export interface Totales {
  sesiones: number
  horas: number
  km: number
  carga: number
}

export interface Comparacion {
  clave: 'semana' | 'mes'
  label: string
  /** Qué período se está mirando, en palabras. */
  titulo: string
  actual: Totales
  /** El período anterior RECORTADO al mismo tramo transcurrido. */
  previo: Totales
  /** El período anterior entero, para saber dónde terminó. */
  previoCompleto: Totales
  /** Cuánto va transcurrido y de cuánto. */
  transcurrido: number
  total: number
  /** true cuando el período ya terminó y la comparación es de iguales. */
  completo: boolean
}

const VACIO: Totales = { sesiones: 0, horas: 0, km: 0, carga: 0 }

function sumar(
  acts: ActivitySummary[],
  settings: ReturnType<typeof useActivityStore.getState>['settings'],
): Totales {
  return {
    sesiones: acts.length,
    horas: Math.round((acts.reduce((s, a) => s + a.duration, 0) / 3600) * 10) / 10,
    km: Math.round(acts.reduce((s, a) => s + (a.distance ?? 0), 0) * 10) / 10,
    carga: Math.round(acts.reduce((s, a) => s + estimateTSS(a, settings), 0)),
  }
}

/**
 * Semana contra semana y mes contra mes.
 *
 * LA REGLA QUE SOSTIENE TODO, y que ya nos mordió una vez: el período anterior
 * se compara RECORTADO al mismo tramo transcurrido. Un martes al mediodía
 * contra un mes entero da "▼ 18 sesiones" todos los meses — es cierto en
 * aritmética y es un disparate deportivo.
 *
 * Por eso se devuelven los dos: `previo` recortado, que es contra lo que se
 * compara, y `previoCompleto`, que sirve para decir dónde terminó aquel
 * período sin usarlo como vara.
 */
export function useComparaciones(): Comparacion[] {
  const activities = useActivityStore(s => s.activities)
  const settings = useActivityStore(s => s.settings)

  return useMemo(() => {
    const ahora = new Date()

    const entre = (desde: Date, hasta: Date) =>
      activities.filter(a => {
        const t = new Date(a.startTime)
        return t >= desde && t < hasta
      })

    // ── Semana (arranca el lunes) ───────────────────────────────────────────
    const lunes = new Date(ahora)
    lunes.setHours(0, 0, 0, 0)
    lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7))
    const lunesPrevio = new Date(lunes)
    lunesPrevio.setDate(lunesPrevio.getDate() - 7)

    // El mismo instante de la semana pasada, con hora y todo: a las 10 de la
    // mañana del martes no se compara contra el martes entero.
    const mismoPuntoSemana = new Date(ahora.getTime() - 7 * 86_400_000)
    const diaDeLaSemana = Math.floor((ahora.getTime() - lunes.getTime()) / 86_400_000) + 1

    // ── Mes ─────────────────────────────────────────────────────────────────
    const primeroDelMes = new Date(ahora.getFullYear(), ahora.getMonth(), 1)
    const primeroPrevio = new Date(ahora.getFullYear(), ahora.getMonth() - 1, 1)
    const finPrevio = new Date(ahora.getFullYear(), ahora.getMonth(), 1)

    // El mismo día del mes pasado. Si el mes anterior es más corto —un 31 de
    // marzo contra febrero— se corta en su último día en vez de desbordar al
    // mes siguiente, que contaría actividades que no corresponden.
    const diaDelMes = ahora.getDate()
    const ultimoDiaPrevio = new Date(ahora.getFullYear(), ahora.getMonth(), 0).getDate()
    const mismoPuntoMes = new Date(primeroPrevio)
    mismoPuntoMes.setDate(Math.min(diaDelMes, ultimoDiaPrevio))
    mismoPuntoMes.setHours(ahora.getHours(), ahora.getMinutes(), 0, 0)

    const diasDelMes = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 0).getDate()

    const nombreMes = (d: Date) => d.toLocaleDateString('es-AR', { month: 'long' })

    return [
      {
        clave: 'semana' as const,
        label: 'Esta semana',
        titulo: diaDeLaSemana <= 2
          ? 'La semana recién arranca'
          : `Van ${diaDeLaSemana} días, contra los mismos ${diaDeLaSemana} de la semana pasada`,
        actual: activities.length ? sumar(entre(lunes, ahora), settings) : VACIO,
        previo: sumar(entre(lunesPrevio, mismoPuntoSemana), settings),
        previoCompleto: sumar(entre(lunesPrevio, lunes), settings),
        transcurrido: diaDeLaSemana,
        total: 7,
        completo: false,
      },
      {
        clave: 'mes' as const,
        label: 'Este mes',
        titulo: diaDelMes <= 3
          ? `${nombreMes(ahora)} recién arranca`
          : `Van ${diaDelMes} días, contra los mismos ${diaDelMes} de ${nombreMes(primeroPrevio)}`,
        actual: sumar(entre(primeroDelMes, ahora), settings),
        previo: sumar(entre(primeroPrevio, mismoPuntoMes), settings),
        previoCompleto: sumar(entre(primeroPrevio, finPrevio), settings),
        transcurrido: diaDelMes,
        total: diasDelMes,
        completo: false,
      },
    ]
  }, [activities, settings])
}
