import { useEffect, useMemo, useState } from 'react'
import { useSleep, type NocheEvaluada } from './useSleep'
import { leer } from '../lib/datos'

interface DiaBienestar {
  fecha: string
  fcReposo?: number
  estresMedio?: number
  bateriaMin?: number
  bateriaMax?: number
}

export interface Descanso {
  cargado: boolean
  /** Resting heart rate is the backbone here: measured almost every day, and a
   *  rising baseline is the classic marker of accumulated fatigue. */
  fcReposo: number | null
  fcReposoPrevia: number | null
  fcReposoTendencia: 'mejora' | 'estable' | 'empeora' | null
  bateriaMax: number | null
  estres: number | null
  ultimaNoche: NocheEvaluada | null
  diasDesdeUltimaNoche: number | null
  /** Overall read, and the sentence that explains it. */
  estado: 'bien' | 'atencion' | 'alerta' | 'sin-datos'
  titular: string
  detalle: string
  /** La progresión diaria para el gráfico, más vieja primero. */
  serieFC: PuntoFC[]
  /** Media del período dibujado, para la línea de referencia. */
  fcReposoMedia: number | null
}

export interface PuntoFC {
  fecha: string
  /** Etiqueta corta para el eje. */
  label: string
  fc: number | null
  /** Media móvil de 7 días: la señal debajo del ruido diario. */
  media7: number | null
}

/** Cuántos días dibuja el gráfico. La cobertura de FC en reposo es casi
 *  perfecta a 60 días y del 97% a 90, así que noventa entra sin huecos feos y
 *  alcanza para ver una tendencia y no sólo la semana. */
const DIAS_GRAFICO = 90

const VACIO: Descanso = {
  cargado: false, fcReposo: null, fcReposoPrevia: null, fcReposoTendencia: null,
  bateriaMax: null, estres: null, ultimaNoche: null, diasDesdeUltimaNoche: null,
  estado: 'sin-datos', titular: '', detalle: '', serieFC: [], fcReposoMedia: null,
}

export function useDescanso(): Descanso {
  const [dias, setDias] = useState<DiaBienestar[] | null>(null)
  const sueño = useSleep()

  useEffect(() => {
    leer<{ dias?: DiaBienestar[] }>('wellness').then(d => setDias(d?.dias ?? []))
  }, [])

  return useMemo(() => {
    if (!dias || !sueño.cargado) return VACIO

    const ahora = Date.now()
    const enVentana = (r: DiaBienestar, desde: number, hasta: number) => {
      const t = new Date(r.fecha + 'T00:00:00').getTime()
      return t >= ahora - desde * 86_400_000 && t < ahora - hasta * 86_400_000
    }
    const media = (rows: DiaBienestar[], k: keyof DiaBienestar) => {
      const v = rows.map(r => r[k]).filter((x): x is number => typeof x === 'number')
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null
    }

    const u14 = dias.filter(r => enVentana(r, 14, 0))
    const p14 = dias.filter(r => enVentana(r, 28, 14))
    const fcReposo = media(u14, 'fcReposo')
    const fcReposoPrevia = media(p14, 'fcReposo')

    // Fewer beats is better: a falling baseline is an improvement, not a decline.
    let tendencia: Descanso['fcReposoTendencia'] = null
    if (fcReposo !== null && fcReposoPrevia !== null) {
      const d = fcReposo - fcReposoPrevia
      tendencia = d <= -1 ? 'mejora' : d >= 1.5 ? 'empeora' : 'estable'
    }

    const ultimaNoche = sueño.ultima
    const diasDesde = ultimaNoche
      ? Math.round((ahora - new Date(ultimaNoche.fecha + 'T00:00:00').getTime()) / 86_400_000)
      : null

    let estado: Descanso['estado'] = 'sin-datos'
    let titular = 'Sin datos de descanso'
    let detalle = 'Sincronizá para traer la frecuencia cardíaca en reposo.'

    if (fcReposo !== null) {
      if (tendencia === 'empeora') {
        estado = 'atencion'
        titular = 'Recuperación en baja'
        detalle = `Tu FC en reposo subió de ${fcReposoPrevia!.toFixed(0)} a ${fcReposo.toFixed(0)} ppm en dos semanas. Suele indicar fatiga acumulada, estrés o algo incubándose.`
      } else if (tendencia === 'mejora') {
        estado = 'bien'
        titular = 'Recuperando bien'
        detalle = `Tu FC en reposo bajó de ${fcReposoPrevia!.toFixed(0)} a ${fcReposo.toFixed(0)} ppm. Menos pulsaciones en reposo es mejor: el corazón está más eficiente.`
      } else {
        estado = 'bien'
        titular = 'Descanso estable'
        detalle = `Tu FC en reposo se mantiene en ${fcReposo.toFixed(0)} ppm, sin cambios en las últimas dos semanas.`
      }
    }

    // ── La progresión ───────────────────────────────────────────────────────
    // Un día suelto de FC en reposo no dice nada: salta de 54 a 44 y vuelve a
    // 49 sin que haya pasado nada. Lo que importa es hacia dónde va la línea,
    // así que el diario va tenue y la media móvil de 7 días es la que se lee.
    const porFecha = new Map(dias.map(r => [r.fecha, r]))
    const hoy = new Date()
    hoy.setHours(12, 0, 0, 0)
    const crudo: { fecha: string; fc: number | null }[] = []
    for (let i = DIAS_GRAFICO - 1; i >= 0; i--) {
      const d = new Date(hoy)
      d.setDate(d.getDate() - i)
      // Clave local, nunca toISOString(): en horario de tarde corre el día.
      const clave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
      const fc = porFecha.get(clave)?.fcReposo
      crudo.push({ fecha: clave, fc: typeof fc === 'number' ? fc : null })
    }

    const serieFC: PuntoFC[] = crudo.map((p, i) => {
      const trozo = crudo.slice(Math.max(0, i - 6), i + 1)
                         .map(x => x.fc).filter((x): x is number => x !== null)
      const [, m, dd] = p.fecha.split('-')
      return {
        ...p,
        label: `${dd}/${m}`,
        // Con menos de cuatro lecturas en la ventana la media es ruido con
        // nombre de media, así que no se dibuja.
        media7: trozo.length >= 4
          ? Math.round((trozo.reduce((a, b) => a + b, 0) / trozo.length) * 10) / 10
          : null,
      }
    })

    const conDato = serieFC.map(p => p.fc).filter((x): x is number => x !== null)
    const fcReposoMedia = conDato.length
      ? Math.round((conDato.reduce((a, b) => a + b, 0) / conDato.length) * 10) / 10
      : null

    return {
      cargado: true,
      fcReposo, fcReposoPrevia, fcReposoTendencia: tendencia,
      bateriaMax: media(u14, 'bateriaMax'),
      estres: media(u14, 'estresMedio'),
      ultimaNoche, diasDesdeUltimaNoche: diasDesde,
      estado, titular, detalle,
      serieFC, fcReposoMedia,
    }
  }, [dias, sueño])
}
