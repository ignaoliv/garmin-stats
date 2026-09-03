/**
 * Hacia dónde va la forma si el entrenamiento sigue como viene.
 *
 * CTL es una media exponencial de 42 días de la carga diaria, así que sostener
 * la carga actual no deja la forma quieta: la sigue empujando hacia el promedio
 * de las últimas semanas. Proyectarla es correr esa misma media hacia adelante
 * con la carga diaria que se viene sosteniendo.
 *
 * Es una proyección, no una promesa: asume que se entrena parecido y que no hay
 * lesiones, enfermedad ni viajes de por medio.
 */

const K_CTL = 2 / (42 + 1)
const K_ATL = 2 / (7 + 1)

export interface Proyeccion {
  ctl: number
  atl: number
  tsb: number
  /** Carga diaria media que asume la proyección. */
  tssDiario: number
  dias: number
}

/**
 * @param ctlHoy   Fitness de hoy.
 * @param atlHoy   Fatiga de hoy.
 * @param tssDiario Carga diaria media sostenida (TSS/día).
 * @param dias     Días hasta la fecha objetivo.
 */
export function proyectarForma(
  ctlHoy: number, atlHoy: number, tssDiario: number, dias: number,
): Proyeccion {
  let ctl = ctlHoy
  let atl = atlHoy
  for (let i = 0; i < Math.max(0, dias); i++) {
    ctl += (tssDiario - ctl) * K_CTL
    atl += (tssDiario - atl) * K_ATL
  }
  return {
    ctl: Math.round(ctl),
    atl: Math.round(atl),
    tsb: Math.round(ctl - atl),
    tssDiario: Math.round(tssDiario),
    dias,
  }
}

/** Carga diaria media de los últimos `dias` días, que es lo que se viene
 *  sosteniendo de verdad — incluidos los días de descanso, que cuentan cero. */
export function tssDiarioReciente(
  actividades: { startTime: string; tss?: number | null }[], dias = 28,
): number {
  const corte = new Date()
  corte.setDate(corte.getDate() - dias)
  const total = actividades
    .filter(a => new Date(a.startTime) >= corte)
    .reduce((s, a) => s + (a.tss ?? 0), 0)
  return total / dias
}

/** Cuánta carga diaria haría falta para llegar a cierto fitness en N días.
 *  Se resuelve por bisección porque la media exponencial no se despeja lindo. */
export function cargaNecesaria(
  ctlHoy: number, objetivo: number, dias: number,
): number | null {
  if (dias <= 0) return null
  let bajo = 0
  let alto = 400
  for (let i = 0; i < 40; i++) {
    const medio = (bajo + alto) / 2
    let ctl = ctlHoy
    for (let d = 0; d < dias; d++) ctl += (medio - ctl) * K_CTL
    if (ctl < objetivo) bajo = medio
    else alto = medio
  }
  // Más de 300 TSS por día no lo sostiene nadie: es un objetivo fuera de alcance.
  return alto > 300 ? null : Math.round(alto)
}
