import { useMemo } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { Sport } from '../types/garmin'

export interface DiaDelMes {
  fecha: string
  dia: number
  /** Vacío si no entrenaste. El primero es el que pinta el ícono. */
  deportes: Sport[]
  sesiones: number
  /** Días de otro mes que entran en la grilla para completar las semanas. */
  deOtroMes: boolean
  esHoy: boolean
  esFuturo: boolean
}

export interface Racha {
  cargado: boolean
  /** Semanas seguidas con al menos una actividad. */
  semanas: number
  /** Cuántas actividades entran en esa racha. */
  sesiones: number
  /** La racha más larga del historial, para saber contra qué se está midiendo. */
  mejorSemanas: number
  /** El mes que se está mirando, ya completado a semanas enteras. */
  grilla: DiaDelMes[]
  mes: string
  /** Días con actividad en el mes mirado. */
  diasActivos: number
}

const VACIA: Racha = {
  cargado: false, semanas: 0, sesiones: 0, mejorSemanas: 0,
  grilla: [], mes: '', diasActivos: 0,
}

const DIA = 86_400_000

/** El lunes de la semana de una fecha. Acá la semana arranca el lunes, como en
 *  Garmin y como en el calendario de Strava. */
function lunesDe(d: Date): Date {
  const x = new Date(d)
  x.setHours(12, 0, 0, 0)
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7))
  return x
}

const iso = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

/**
 * La racha de semanas y el calendario del mes.
 *
 * Es la idea que Strava resolvió bien: una racha por SEMANAS y no por días.
 * Por días, cualquiera que descanse martes y jueves —o sea, cualquiera que
 * entrene en serio— tiene racha 1 para siempre y el número deja de decir nada.
 * Por semanas, la racha mide lo que uno realmente quiere sostener: no faltar
 * una semana entera.
 *
 * La semana en curso no rompe la racha si todavía no entrenaste. Un lunes a la
 * mañana con cero sesiones no es una racha cortada, es un lunes a la mañana.
 */
export function useRacha(mesOffset = 0): Racha {
  const activities = useActivityStore(s => s.activities)

  return useMemo(() => {
    if (activities.length === 0) return VACIA

    // Actividades por día, con sus deportes.
    const porDia = new Map<string, Sport[]>()
    for (const a of activities) {
      const k = a.startTime.slice(0, 10)
      const lista = porDia.get(k)
      if (lista) lista.push(a.sport)
      else porDia.set(k, [a.sport])
    }

    // ── La racha ────────────────────────────────────────────────────────────
    const semanasConActividad = new Set<string>()
    for (const k of porDia.keys()) {
      semanasConActividad.add(iso(lunesDe(new Date(k + 'T12:00:00'))))
    }

    const contarDesde = (inicio: Date) => {
      let semanas = 0
      const cursor = new Date(inicio)
      while (semanasConActividad.has(iso(cursor))) {
        semanas++
        cursor.setDate(cursor.getDate() - 7)
      }
      return semanas
    }

    const estaSemana = lunesDe(new Date())
    // Si la semana en curso todavía no tiene nada, se cuenta desde la anterior:
    // la racha sigue viva hasta que la semana termine sin entrenar.
    const semanas = semanasConActividad.has(iso(estaSemana))
      ? contarDesde(estaSemana)
      : contarDesde(new Date(estaSemana.getTime() - 7 * DIA))

    // Sesiones dentro de la racha.
    let sesiones = 0
    const arranque = semanasConActividad.has(iso(estaSemana))
      ? estaSemana
      : new Date(estaSemana.getTime() - 7 * DIA)
    const desdeRacha = new Date(arranque)
    desdeRacha.setDate(desdeRacha.getDate() - (semanas - 1) * 7)
    if (semanas > 0) {
      const corte = desdeRacha.getTime()
      sesiones = activities.filter(a => new Date(a.startTime).getTime() >= corte).length
    }

    // La mejor racha del historial, recorriendo las semanas ordenadas.
    const ordenadas = [...semanasConActividad].sort()
    let mejor = 0, corrida = 0
    for (let i = 0; i < ordenadas.length; i++) {
      const previa = i > 0
        ? new Date(new Date(ordenadas[i] + 'T12:00:00').getTime() - 7 * DIA)
        : null
      corrida = previa && iso(previa) === ordenadas[i - 1] ? corrida + 1 : 1
      mejor = Math.max(mejor, corrida)
    }

    // ── El calendario del mes ───────────────────────────────────────────────
    const hoy = new Date()
    const base = new Date(hoy.getFullYear(), hoy.getMonth() + mesOffset, 1)
    const primero = new Date(base.getFullYear(), base.getMonth(), 1)
    const ultimo = new Date(base.getFullYear(), base.getMonth() + 1, 0)

    // La grilla arranca el lunes de la semana del día 1 y termina el domingo de
    // la semana del último: así cada fila es una semana completa y los días
    // caen siempre bajo su letra.
    const desde = lunesDe(primero)
    const hasta = lunesDe(ultimo)
    hasta.setDate(hasta.getDate() + 6)

    const hoyIso = iso(hoy)
    const grilla: DiaDelMes[] = []
    for (let t = new Date(desde); t <= hasta; t.setDate(t.getDate() + 1)) {
      const k = iso(t)
      const deportes = porDia.get(k) ?? []
      grilla.push({
        fecha: k,
        dia: t.getDate(),
        deportes,
        sesiones: deportes.length,
        deOtroMes: t.getMonth() !== base.getMonth(),
        esHoy: k === hoyIso,
        esFuturo: k > hoyIso,
      })
    }

    return {
      cargado: true,
      semanas,
      sesiones,
      mejorSemanas: mejor,
      grilla,
      mes: base.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }),
      diasActivos: grilla.filter(d => !d.deOtroMes && d.sesiones > 0).length,
    }
  }, [activities, mesOffset])
}
