/**
 * Objetivos de salud: de todas las métricas de la app a un número.
 *
 * La idea es que la app deje de contestar sólo "cómo venís" y pase a contestar
 * "cómo venís PARA LO QUE QUERÉS". Los mismos 9.000 pasos son excelentes si el
 * objetivo es bajar de peso y bastante irrelevantes si el objetivo es correr
 * más rápido, así que el objetivo elegido es el que decide qué métricas pesan.
 *
 * El puntaje se calcula acá, en el navegador, y a propósito:
 *   · es determinista y se puede revisar leyendo este archivo;
 *   · cambia de objetivo al instante, sin ida y vuelta al servidor;
 *   · sigue funcionando si el modelo no contesta.
 * Al modelo se le pide lo que un promedio ponderado no sabe hacer: leer las
 * piezas juntas y decir qué conviene mover primero.
 *
 * Sobre los umbrales: cada componente dice de dónde salió el suyo. Cuando hay
 * una referencia pública (los 150 minutos semanales de la OMS, los dos días de
 * fuerza, 1,6 g de proteína por kilo) se usa esa. Cuando no la hay, el umbral
 * es una convención razonable y está escrito para poder discutirlo, no
 * escondido en una constante suelta.
 */

// ─── Las métricas que alimentan todo esto ────────────────────────────────────

export interface Metricas {
  /** Pasos: media diaria de los últimos 30 días y objetivo del reloj. */
  pasosMedia: number | null
  pasosObjetivo: number

  /** Frecuencia cardíaca en reposo, y cuánto se movió contra los 30 días previos. */
  fcReposo: number | null
  fcReposoDelta: number | null

  /** Sueño: horas medias por noche y cuántas noches de las últimas 30 hay medidas. */
  sueñoHoras: number | null
  sueñoNoches: number

  /** Peso actual y ritmo de cambio en kilos por semana (negativo = bajando). */
  peso: number | null
  pesoKgSemana: number | null
  pesoDiasMedidos: number

  /** Entrenamiento de los últimos 30 días, llevado a semana. */
  sesionesSemana: number | null
  minutosSemana: number | null
  fuerzaSemana: number | null
  cardioSemana: number | null

  /** Reparto de intensidad: porcentaje del tiempo en zonas 1 y 2. */
  pctAerobico: number | null

  /** Carga: fitness, fatiga, forma y la relación agudo/crónico. */
  ctl: number | null
  tsb: number | null
  acwr: number | null

  /** VO₂max actual y cuánto cambió contra la medición de hace ~90 días. */
  vo2: number | null
  vo2Delta: number | null

  /** Gasto calórico de movimiento, media diaria de 30 días. */
  caloriasActivas: number | null

  /** Comida registrada: proteína media diaria y cuántos días tienen registro. */
  proteinaDia: number | null
  diasConComida: number
}

export const METRICAS_VACIAS: Metricas = {
  pasosMedia: null, pasosObjetivo: 10000,
  fcReposo: null, fcReposoDelta: null,
  sueñoHoras: null, sueñoNoches: 0,
  peso: null, pesoKgSemana: null, pesoDiasMedidos: 0,
  sesionesSemana: null, minutosSemana: null, fuerzaSemana: null, cardioSemana: null,
  pctAerobico: null,
  ctl: null, tsb: null, acwr: null,
  vo2: null, vo2Delta: null,
  caloriasActivas: null,
  proteinaDia: null, diasConComida: 0,
}

// ─── Curvas ──────────────────────────────────────────────────────────────────
//
// Cuatro formas y nada más. Un umbral duro ("¿llegó a 8.000 pasos? sí o no")
// convierte 7.900 en un cero y esconde todo el progreso; las rampas dan crédito
// parcial, que es lo que hace que el número se mueva cuando uno mejora.

const acotar = (v: number) => Math.max(0, Math.min(100, Math.round(v)))

/** Más es mejor: en `piso` da 0, en `techo` da 100. */
const subiendo = (v: number, piso: number, techo: number) =>
  acotar(((v - piso) / (techo - piso)) * 100)

/** Menos es mejor: en `peor` da 0, en `mejor` da 100. */
const bajando = (v: number, peor: number, mejor: number) =>
  acotar(((peor - v) / (peor - mejor)) * 100)

/** Dentro de la banda da 100 y afuera cae linealmente a lo largo de `margen`. */
const banda = (v: number, min: number, max: number, margen: number) =>
  v >= min && v <= max ? 100 : acotar(100 - ((v < min ? min - v : v - max) / margen) * 100)

const uno = (n: number, d = 1) => n.toLocaleString('es-ES', { minimumFractionDigits: d, maximumFractionDigits: d })

// ─── Componentes y objetivos ─────────────────────────────────────────────────

export interface Evaluacion {
  puntos: number
  /** Lo que se muestra al lado de la etiqueta: el número real, con su unidad. */
  valor: string
  /** Contra qué se lo está midiendo. Sin esto el puntaje es un veredicto sin juicio. */
  meta: string
}

export interface Componente {
  id: string
  label: string
  peso: number
  /** `null` cuando falta el dato: el componente sale del promedio en vez de puntuar cero. */
  evaluar: (m: Metricas) => Evaluacion | null
}

export interface Objetivo {
  id: string
  nombre: string
  /** Una línea que dice qué significa elegir esto. */
  resumen: string
  componentes: Componente[]
}

// Componentes que aparecen en más de un objetivo. Se definen una vez para que
// "pasos" signifique lo mismo en todos lados y sólo cambie su peso.

const pasos = (peso: number, piso: number, techo: number): Componente => ({
  id: 'pasos', label: 'Pasos diarios', peso,
  evaluar: m => m.pasosMedia === null ? null : {
    puntos: subiendo(m.pasosMedia, piso, techo),
    valor: `${m.pasosMedia.toLocaleString('es-ES')} por día`,
    meta: `${techo.toLocaleString('es-ES')} sostenidos`,
  },
})

const sueño = (peso: number): Componente => ({
  id: 'sueño', label: 'Sueño', peso,
  evaluar: m => m.sueñoHoras === null || m.sueñoNoches < 5 ? null : {
    puntos: banda(m.sueñoHoras, 7, 9, 2),
    valor: `${uno(m.sueñoHoras)} h por noche`,
    meta: '7 a 9 horas',
  },
})

const fcReposo = (peso: number, peor: number, mejor: number): Componente => ({
  id: 'fc', label: 'FC en reposo', peso,
  evaluar: m => m.fcReposo === null ? null : {
    puntos: bajando(m.fcReposo, peor, mejor),
    // Viene promediada, así que llega con decimales: "43,46 ppm" no es más
    // preciso que "43", es más difícil de leer.
    valor: `${Math.round(m.fcReposo)} ppm`,
    meta: `por debajo de ${mejor}`,
  },
})

const fuerza = (peso: number, techo: number): Componente => ({
  id: 'fuerza', label: 'Sesiones de fuerza', peso,
  evaluar: m => m.fuerzaSemana === null ? null : {
    puntos: subiendo(m.fuerzaSemana, 0, techo),
    valor: `${uno(m.fuerzaSemana)} por semana`,
    meta: `${techo} por semana`,
  },
})

const aerobico = (peso: number): Componente => ({
  id: 'aerobico', label: 'Tiempo en zonas bajas', peso,
  evaluar: m => m.pctAerobico === null ? null : {
    puntos: subiendo(m.pctAerobico, 40, 80),
    valor: `${Math.round(m.pctAerobico)}% en Z1–Z2`,
    meta: 'más del 80%',
  },
})

export const OBJETIVOS: Objetivo[] = [
  {
    id: 'recomposicion',
    nombre: 'Recomposición corporal',
    resumen: 'Bajar grasa sin perder músculo. La balanza se mueve poco a propósito: lo que cambia es de qué está hecho el peso.',
    componentes: [
      fuerza(25, 3),
      {
        // 1,6 g/kg es el consenso de las revisiones sobre hipertrofia; por
        // debajo de ~1,2 el músculo se pierde junto con la grasa, que es
        // exactamente lo que este objetivo trata de evitar.
        id: 'proteina', label: 'Proteína', peso: 20,
        evaluar: m => {
          if (m.proteinaDia === null || m.diasConComida < 3) return null
          const gkg = m.peso ? m.proteinaDia / m.peso : null
          return gkg === null
            ? { puntos: subiendo(m.proteinaDia, 60, 130), valor: `${Math.round(m.proteinaDia)} g por día`, meta: '1,6 g por kilo' }
            : { puntos: subiendo(gkg, 0.7, 1.6), valor: `${uno(gkg, 1)} g por kilo`, meta: '1,6 g por kilo' }
        },
      },
      {
        // El peso casi quieto es la señal de que la recomposición está pasando.
        // Bajar rápido acá no es mejor: es masa magra yéndose con la grasa.
        id: 'peso', label: 'Ritmo del peso', peso: 20,
        evaluar: m => m.pesoKgSemana === null ? null : {
          puntos: banda(m.pesoKgSemana, -0.4, 0.1, 0.5),
          valor: `${m.pesoKgSemana > 0 ? '+' : ''}${uno(m.pesoKgSemana, 2)} kg por semana`,
          meta: 'entre −0,4 y +0,1',
        },
      },
      pasos(15, 4000, 9000),
      sueño(10),
      {
        id: 'cardio', label: 'Cardio semanal', peso: 10,
        evaluar: m => m.cardioSemana === null ? null : {
          puntos: subiendo(m.cardioSemana, 0, 2.5),
          valor: `${uno(m.cardioSemana)} sesiones`,
          meta: '2 a 3 por semana',
        },
      },
    ],
  },
  {
    id: 'bajar_peso',
    nombre: 'Bajar de peso',
    resumen: 'Perder grasa a un ritmo sostenible. Medio kilo por semana es rápido y ya es mucho; más que eso se recupera.',
    componentes: [
      {
        id: 'peso', label: 'Ritmo del peso', peso: 30,
        evaluar: m => m.pesoKgSemana === null ? null : {
          puntos: banda(m.pesoKgSemana, -0.8, -0.2, 0.6),
          valor: `${m.pesoKgSemana > 0 ? '+' : ''}${uno(m.pesoKgSemana, 2)} kg por semana`,
          meta: 'entre −0,2 y −0,8',
        },
      },
      pasos(25, 5000, 11000),
      {
        id: 'gasto', label: 'Gasto de movimiento', peso: 15,
        evaluar: m => m.caloriasActivas === null ? null : {
          puntos: subiendo(m.caloriasActivas, 250, 700),
          valor: `${m.caloriasActivas.toLocaleString('es-ES')} kcal por día`,
          meta: '700 kcal activas',
        },
      },
      {
        id: 'constancia', label: 'Constancia', peso: 15,
        evaluar: m => m.sesionesSemana === null ? null : {
          puntos: subiendo(m.sesionesSemana, 1, 4),
          valor: `${uno(m.sesionesSemana)} sesiones por semana`,
          meta: '4 por semana',
        },
      },
      sueño(15),
    ],
  },
  {
    id: 'fondo',
    nombre: 'Fondo aeróbico',
    resumen: 'Aguantar más tiempo a ritmo cómodo. Se construye con volumen suave, no con sesiones duras.',
    componentes: [
      {
        id: 'volumen', label: 'Volumen semanal', peso: 25,
        evaluar: m => m.minutosSemana === null ? null : {
          puntos: subiendo(m.minutosSemana, 60, 360),
          valor: `${uno(m.minutosSemana / 60)} h por semana`,
          meta: '6 h por semana',
        },
      },
      aerobico(20),
      {
        id: 'ctl', label: 'Fitness acumulado', peso: 20,
        evaluar: m => m.ctl === null ? null : {
          puntos: subiendo(m.ctl, 15, 60),
          valor: `${Math.round(m.ctl)} CTL`,
          meta: '60 de base',
        },
      },
      {
        id: 'constancia', label: 'Constancia', peso: 15,
        evaluar: m => m.sesionesSemana === null ? null : {
          puntos: subiendo(m.sesionesSemana, 2, 5),
          valor: `${uno(m.sesionesSemana)} sesiones por semana`,
          meta: '5 por semana',
        },
      },
      fcReposo(20, 70, 48),
    ],
  },
  {
    id: 'salud',
    nombre: 'Salud general',
    resumen: 'Lo que las guías de salud pública piden a cualquier adulto: moverse todos los días, dormir, y fuerza dos veces por semana.',
    componentes: [
      pasos(25, 4000, 9000),
      fcReposo(20, 75, 52),
      sueño(20),
      {
        // Los 150 minutos semanales de actividad moderada son la recomendación
        // de la OMS, y los dos días de fuerza vienen del mismo documento.
        id: 'minutos', label: 'Minutos de actividad', peso: 20,
        evaluar: m => m.minutosSemana === null ? null : {
          puntos: subiendo(m.minutosSemana, 0, 150),
          valor: `${Math.round(m.minutosSemana)} min por semana`,
          meta: '150 min (OMS)',
        },
      },
      fuerza(15, 2),
    ],
  },
  {
    id: 'rendimiento',
    nombre: 'Rendimiento',
    resumen: 'Llegar más rápido a una fecha. Acá importa la carga acumulada y que la progresión no se vaya de rosca.',
    componentes: [
      {
        id: 'ctl', label: 'Fitness acumulado', peso: 25,
        evaluar: m => m.ctl === null ? null : {
          puntos: subiendo(m.ctl, 25, 80),
          valor: `${Math.round(m.ctl)} CTL`,
          meta: '80 de base',
        },
      },
      {
        // Entre 0,8 y 1,3 es la ventana donde la carga sube sin que el riesgo
        // de lesión se dispare. Acá pasarse puntúa tan mal como quedarse corto.
        id: 'acwr', label: 'Progresión de carga', peso: 20,
        evaluar: m => m.acwr === null || m.acwr === 0 ? null : {
          puntos: banda(m.acwr, 0.8, 1.3, 0.4),
          valor: uno(m.acwr, 2),
          meta: 'entre 0,8 y 1,3',
        },
      },
      aerobico(15),
      {
        id: 'vo2', label: 'VO₂max', peso: 15,
        evaluar: m => m.vo2 === null ? null : {
          puntos: m.vo2Delta === null ? 50 : banda(m.vo2Delta, 0, 3, 2),
          valor: m.vo2Delta === null
            ? `${uno(m.vo2)} ml/kg/min`
            : m.vo2Delta === 0
              ? `${uno(m.vo2)} · sin cambios en 90 días`
              : `${uno(m.vo2)} · ${m.vo2Delta > 0 ? '+' : ''}${uno(m.vo2Delta)} en 90 días`,
          meta: 'subiendo o sostenido',
        },
      },
      {
        id: 'forma', label: 'Forma', peso: 10,
        evaluar: m => m.tsb === null ? null : {
          puntos: banda(m.tsb, -20, 5, 20),
          valor: `${m.tsb > 0 ? '+' : ''}${Math.round(m.tsb)}`,
          meta: 'entre −20 y +5',
        },
      },
      sueño(15),
    ],
  },
]

export const objetivoPorId = (id: string) =>
  OBJETIVOS.find(o => o.id === id) ?? OBJETIVOS[0]

// ─── El puntaje ──────────────────────────────────────────────────────────────

export interface ComponentePuntuado extends Evaluacion {
  id: string
  label: string
  peso: number
}

export interface Puntaje {
  score: number | null
  banda: { label: string; color: string; texto: string }
  componentes: ComponentePuntuado[]
  /** Los que no se pudieron calcular, para poder decir qué falta. */
  faltantes: string[]
  /** Qué proporción del peso total sí tenía datos. */
  cobertura: number
}

/**
 * Las bandas están puestas donde significan algo, no cada 20 puntos: 75 es
 * "esto ya está donde tiene que estar" y 50 es "la mitad de las piezas están
 * en su lugar".
 */
const BANDAS = [
  { desde: 85, label: 'En punto',      color: '#34d399', texto: 'Las piezas de este objetivo están donde tienen que estar. Lo que queda es sostenerlo.' },
  { desde: 70, label: 'Bien encaminado', color: '#34d399', texto: 'Vas bien. Hay una o dos piezas por acomodar, no un cambio de plan.' },
  { desde: 50, label: 'En camino',     color: '#fbbf24', texto: 'La mitad del objetivo está cubierta. Mové la pieza más floja antes de tocar el resto.' },
  { desde: 30, label: 'Arrancando',    color: '#fb923c', texto: 'Hay una base, pero varias piezas todavía no están. Elegí una y sostenela dos semanas.' },
  { desde: 0,  label: 'Lejos',         color: '#f87171', texto: 'Hoy tus datos no apuntan a este objetivo. Es un punto de partida, no un veredicto.' },
]

export function puntuar(objetivo: Objetivo, m: Metricas): Puntaje {
  const componentes: ComponentePuntuado[] = []
  const faltantes: string[] = []
  let suma = 0
  let pesos = 0

  for (const c of objetivo.componentes) {
    const e = c.evaluar(m)
    if (!e) {
      faltantes.push(c.label)
      continue
    }
    componentes.push({ ...e, id: c.id, label: c.label, peso: c.peso })
    suma += e.puntos * c.peso
    pesos += c.peso
  }

  const total = objetivo.componentes.reduce((s, c) => s + c.peso, 0)
  const cobertura = total ? pesos / total : 0

  // Con menos de la mitad del peso cubierto el promedio deja de ser un puntaje
  // y pasa a ser una opinión sobre dos datos sueltos. Mejor decir que faltan
  // datos que publicar un número que nadie puede defender.
  const score = cobertura < 0.5 ? null : Math.round(suma / pesos)

  return {
    score,
    banda: BANDAS.find(b => (score ?? 0) >= b.desde) ?? BANDAS[BANDAS.length - 1],
    // El más flojo arriba: es el que hay que mirar.
    componentes: componentes.sort((a, b) => a.puntos - b.puntos),
    faltantes,
    cobertura,
  }
}
