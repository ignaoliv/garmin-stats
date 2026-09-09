import { subiendo, bajando, banda } from './objetivos'

/**
 * Preparación: con qué cuerpo arrancás el día.
 *
 * POR QUÉ ESTÁ ESCRITO ACÁ Y NO VIENE DE GARMIN. Garmin tiene su "Training
 * Readiness", pero lo calcula el reloj y sólo lo hacen los modelos nuevos
 * —Forerunner 255/955, Fenix 7, Venu 3 para arriba—. Con un Venu original la
 * API devuelve vacío, igual que el HRV status y el tiempo de recuperación. No
 * es un problema de permisos ni de la sincronización: ese reloj no lo produce.
 *
 * QUÉ USA GARMIN, según su propio manual: puntaje de sueño de anoche, tiempo de
 * recuperación, estado del HRV, carga aguda, historial de sueño de 3 noches e
 * historial de estrés de 3 días. De esos seis, dos dependen de sensores que
 * este reloj no tiene y dos son de sueño, que acá está medido 7 noches de cada
 * 30 porque casi nunca se duerme con el reloj puesto.
 *
 * ASÍ QUE ESTO NO ES EL NÚMERO DE GARMIN, es el más parecido que se puede armar
 * con lo que este reloj sí mide. Cada pieza se eligió mirando si de verdad
 * varía en los datos reales, no por parecer razonable: la "batería al
 * despertar" quedó afuera justamente por eso — existe sólo las noches con
 * reloj y da 100 en seis de siete.
 *
 * Las bandas sí son las de Garmin, para que el número se lea con la misma vara.
 */

export interface Entrada {
  /** FC en reposo de hoy y la media de los 30 días previos. */
  fcHoy: number | null
  fcBase: number | null
  /** Forma del modelo de carga: fitness menos fatiga. */
  tsb: number | null
  /** Media del nivel de estrés de los últimos 3 días. */
  estres3d: number | null
  /** Hasta dónde bajó la batería corporal ayer. */
  bateriaMin: number | null
  /** Horas dormidas anoche, si hubo medición. */
  sueñoHoras: number | null
}

export interface Pieza {
  id: string
  label: string
  peso: number
  puntos: number
  valor: string
  meta: string
}

export interface Preparacion {
  score: number | null
  banda: { label: string; color: string; texto: string }
  piezas: Pieza[]
  faltantes: string[]
  cobertura: number
}

/** Las mismas franjas que usa Garmin, para que el número se lea igual. */
const BANDAS = [
  { desde: 95, label: 'Óptima',   color: '#a78bfa', texto: 'Lo mejor que vas a estar. Si tenías algo duro planeado, es hoy.' },
  { desde: 75, label: 'Alta',     color: '#38bdf8', texto: 'Listo para exigirte. El cuerpo asimiló lo que veníais haciendo.' },
  { desde: 50, label: 'Moderada', color: '#34d399', texto: 'Para entrenar estás. Sostené la carga, no la subas.' },
  { desde: 25, label: 'Baja',     color: '#fb923c', texto: 'Aflojá hoy. Una sesión suave suma más que una fuerte a medias.' },
  { desde: 0,  label: 'Muy baja', color: '#f43f5e', texto: 'Dejá que el cuerpo se recupere. Forzar acá es cómo se llega a una lesión.' },
]

const uno = (n: number) => n.toLocaleString('es-ES', { minimumFractionDigits: 1, maximumFractionDigits: 1 })

export function preparacion(e: Entrada): Preparacion {
  const piezas: Pieza[] = []
  const faltantes: string[] = []

  const sumar = (
    id: string, label: string, peso: number,
    puntos: number | null, valor: string, meta: string,
  ) => {
    if (puntos === null) { faltantes.push(label); return }
    piezas.push({ id, label, peso, puntos, valor, meta })
  }

  // La FC en reposo contra TU base, no contra una tabla: 38 ppm es excelente
  // para cualquiera, pero si venís de 36 algo pasó. Es el reemplazo del estado
  // de HRV que este reloj no calcula, y mide lo mismo por otra vía — cuánto le
  // está costando al corazón el reposo.
  sumar('fc', 'FC en reposo', 30,
    e.fcHoy !== null && e.fcBase !== null ? bajando(e.fcHoy - e.fcBase, 4, -3) : null,
    e.fcHoy !== null && e.fcBase !== null
      ? `${e.fcHoy} ppm · ${e.fcHoy - e.fcBase >= 0 ? '+' : ''}${uno(e.fcHoy - e.fcBase)} vs tu base`
      : '',
    'igual o por debajo de tu base')

  // Carga aguda. Muy negativo es fatiga acumulada; muy positivo es descanso, y
  // descansar de más tampoco es estar preparado para rendir, así que es banda
  // y no rampa.
  sumar('carga', 'Carga acumulada', 25,
    e.tsb !== null ? banda(e.tsb, -10, 12, 22) : null,
    e.tsb !== null ? `forma ${e.tsb > 0 ? '+' : ''}${Math.round(e.tsb)}` : '',
    'entre −10 y +12')

  sumar('estres', 'Estrés de 3 días', 20,
    e.estres3d !== null ? bajando(e.estres3d, 45, 15) : null,
    e.estres3d !== null ? `${Math.round(e.estres3d)} sobre 100` : '',
    'por debajo de 25')

  // Cuánto te drenó el día de ayer. Se usa la mínima y no la del despertar
  // porque aquella da 100 casi siempre y no distingue un día de otro.
  sumar('bateria', 'Batería de ayer', 15,
    e.bateriaMin !== null ? subiendo(e.bateriaMin, 10, 55) : null,
    e.bateriaMin !== null ? `bajó hasta ${e.bateriaMin}` : '',
    'no bajar de 55')

  // El sueño es la pieza que más pesa para Garmin y la que menos tenemos. Entra
  // sólo si hubo medición: contarla como cero por no haber usado el reloj
  // hundiría el score por un dato que no existe, no por una mala noche.
  sumar('sueño', 'Sueño de anoche', 10,
    e.sueñoHoras !== null ? subiendo(e.sueñoHoras, 4.5, 7.5) : null,
    e.sueñoHoras !== null ? `${uno(e.sueñoHoras)} h` : '',
    '7 h o más')

  const total = 100
  const pesos = piezas.reduce((s, p) => s + p.peso, 0)
  const cobertura = pesos / total
  const score = cobertura < 0.5
    ? null
    : Math.round(piezas.reduce((s, p) => s + p.puntos * p.peso, 0) / pesos)

  return {
    score,
    banda: BANDAS.find(b => (score ?? 0) >= b.desde) ?? BANDAS[BANDAS.length - 1],
    piezas: piezas.sort((a, b) => a.puntos - b.puntos),
    faltantes,
    cobertura,
  }
}
