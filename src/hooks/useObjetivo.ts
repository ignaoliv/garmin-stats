import { useCallback, useEffect, useMemo, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'
import { useSteps } from './useSteps'
import { useDescanso } from './useDescanso'
import { useSleep } from './useSleep'
import { usePeso } from './usePeso'
import { useCalorias } from './useCalorias'
import { useComidas } from './useComidas'
import { useZoneDistribution } from './useZoneDistribution'
import { useFitnessHistory } from './useFitnessHistory'
import { useACWR } from './useTrainingInsights'
import { objetivoPorId, puntuar, METRICAS_VACIAS, type Metricas, type Puntaje } from '../lib/objetivos'

/** La elección vive en el navegador: es una preferencia, no un dato de salud,
 *  y no vale la pena un viaje al servidor ni un archivo en el blob. */
const CLAVE = 'gs_objetivo'

const DIA = 86_400_000

/** Semanas que representan los últimos 30 días. Dividir por 4 exagera un 7%. */
const SEMANAS_MES = 30 / 7

function leerElegido(): string {
  try {
    return localStorage.getItem(CLAVE) || 'recomposicion'
  } catch {
    // Navegador con el almacenamiento bloqueado: se elige igual, no persiste.
    return 'recomposicion'
  }
}

/**
 * El ritmo del peso, en kilos por semana.
 *
 * No es la resta entre la primera y la última medición del mes: con dos
 * mediciones pegadas al principio y ninguna después, esa resta dice cualquier
 * cosa. Se busca el par más separado dentro de los últimos 90 días, con al
 * menos 14 días entre ellos — abajo de eso lo que se mide es la retención de
 * líquido de la semana, no la tendencia.
 */
function ritmoDelPeso(serie: { fecha: string; kg: number | null }[]) {
  const puntos = serie.filter(p => p.kg !== null) as { fecha: string; kg: number }[]
  if (puntos.length < 2) return { kgSemana: null, dias: puntos.length }

  const corte = Date.now() - 90 * DIA
  const recientes = puntos.filter(p => new Date(p.fecha + 'T12:00:00').getTime() >= corte)
  if (recientes.length < 2) return { kgSemana: null, dias: recientes.length }

  const primero = recientes[0]
  const ultimo = recientes[recientes.length - 1]
  const dias = (new Date(ultimo.fecha + 'T12:00:00').getTime()
    - new Date(primero.fecha + 'T12:00:00').getTime()) / DIA
  if (dias < 14) return { kgSemana: null, dias: recientes.length }

  return {
    kgSemana: Math.round(((ultimo.kg - primero.kg) / (dias / 7)) * 100) / 100,
    dias: recientes.length,
  }
}

export interface ObjetivoState {
  elegido: string
  elegir: (id: string) => void
  metricas: Metricas
  puntaje: Puntaje
  /** Mientras las fuentes cargan, el puntaje todavía no significa nada. */
  cargando: boolean
}

/**
 * Junta en un solo lugar las métricas que hoy viven repartidas en diez tarjetas
 * y las puntúa contra el objetivo elegido.
 *
 * Se apoya en los hooks que ya existen en vez de volver a leer los JSON: cada
 * uno tiene sus propias reglas para los huecos —qué noche cuenta, qué día de
 * pasos es real— y duplicarlas acá sería tener dos versiones de la verdad.
 */
export function useObjetivo(): ObjetivoState {
  const [elegido, setElegido] = useState(leerElegido)

  const elegir = useCallback((id: string) => {
    setElegido(id)
    try { localStorage.setItem(CLAVE, id) } catch { /* sin persistencia, y ya */ }
  }, [])

  const activities = useActivityStore(s => s.activities)
  const stats = useActivityStore(s => s.stats)
  const pasos = useSteps(30)
  const descanso = useDescanso()
  const sleep = useSleep()
  const peso = usePeso()
  const calorias = useCalorias()
  const { todas: comidas } = useComidas()
  const { slices } = useZoneDistribution(30)
  const { current: fitness } = useFitnessHistory()
  const acwr = useACWR(120)

  const metricas = useMemo<Metricas>(() => {
    const desde = Date.now() - 30 * DIA
    const mes = activities.filter(a => new Date(a.startTime).getTime() >= desde)
    const hay = mes.length > 0 || activities.length > 0

    const cuenta = (f: (s: string) => boolean) =>
      mes.filter(a => f(a.sport)).length / SEMANAS_MES

    // VO₂max: la última medición contra la más cercana a 90 días atrás. Garmin
    // la publica de a saltos, así que se toma la última anterior al corte.
    const vo2Hist = stats?.vo2maxHistory ?? []
    const vo2 = vo2Hist.length ? vo2Hist[vo2Hist.length - 1].value : null
    const corte90 = Date.now() - 90 * DIA
    const previo = [...vo2Hist].reverse().find(v => new Date(v.date).getTime() < corte90)
    const vo2Delta = vo2 !== null && previo ? Math.round((vo2 - previo.value) * 10) / 10 : null

    // Proteína: media de los días CON registro de la última semana, no de los
    // siete días. Un día sin registrar es un día sin datos, no un día sin comer.
    const desde7 = new Date(Date.now() - 7 * DIA).toISOString().slice(0, 10)
    const porDia = new Map<string, number>()
    for (const c of comidas) {
      if (c.fecha < desde7) continue
      const p = c.total?.proteinas
      if (typeof p === 'number') porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + p)
    }
    const proteinaDia = porDia.size
      ? Math.round([...porDia.values()].reduce((a, b) => a + b, 0) / porDia.size)
      : null

    return {
      ...METRICAS_VACIAS,
      pasosMedia: pasos.loaded && pasos.media > 0 ? pasos.media : null,
      pasosObjetivo: pasos.objetivo,

      fcReposo: descanso.fcReposo,
      fcReposoDelta: descanso.fcReposo !== null && descanso.fcReposoPrevia !== null
        ? descanso.fcReposo - descanso.fcReposoPrevia : null,

      sueñoHoras: sleep.medias ? Math.round((sleep.medias.total_s / 3600) * 10) / 10 : null,
      sueñoNoches: sleep.cobertura.conRegistro,

      peso: peso.actual,
      ...(() => {
        const r = ritmoDelPeso(peso.serie)
        return { pesoKgSemana: r.kgSemana, pesoDiasMedidos: r.dias }
      })(),

      sesionesSemana: hay ? Math.round((mes.length / SEMANAS_MES) * 10) / 10 : null,
      minutosSemana: hay
        ? Math.round(mes.reduce((s, a) => s + a.duration, 0) / 60 / SEMANAS_MES)
        : null,
      fuerzaSemana: hay ? Math.round(cuenta(s => s === 'strength') * 10) / 10 : null,
      cardioSemana: hay
        ? Math.round(cuenta(s => s !== 'strength' && s !== 'walking') * 10) / 10
        : null,

      pctAerobico: slices.length >= 2 && slices.some(z => z.pct > 0)
        ? slices[0].pct + slices[1].pct : null,

      ctl: fitness?.ctl ?? null,
      tsb: fitness?.tsb ?? null,
      acwr: acwr.current || null,

      vo2, vo2Delta,

      caloriasActivas: calorias.activasMedia,

      proteinaDia,
      diasConComida: porDia.size,
    }
  }, [activities, stats, pasos, descanso, sleep, peso, calorias, comidas, slices, fitness, acwr])

  const puntaje = useMemo(
    () => puntuar(objetivoPorId(elegido), metricas),
    [elegido, metricas],
  )

  return {
    elegido, elegir, metricas, puntaje,
    cargando: !pasos.loaded && !descanso.cargado && activities.length === 0,
  }
}

/** Re-lee la preferencia si otra pestaña la cambió. Barato y evita que dos
 *  ventanas abiertas muestren objetivos distintos hasta recargar. */
export function useSincronizarObjetivo(elegir: (id: string) => void) {
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === CLAVE && e.newValue) elegir(e.newValue)
    }
    addEventListener('storage', onStorage)
    return () => removeEventListener('storage', onStorage)
  }, [elegir])
}
