import { useEffect, useMemo, useState } from 'react'
import { useSleep, type NocheEvaluada } from './useSleep'

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
}

const VACIO: Descanso = {
  cargado: false, fcReposo: null, fcReposoPrevia: null, fcReposoTendencia: null,
  bateriaMax: null, estres: null, ultimaNoche: null, diasDesdeUltimaNoche: null,
  estado: 'sin-datos', titular: '', detalle: '',
}

export function useDescanso(): Descanso {
  const [dias, setDias] = useState<DiaBienestar[] | null>(null)
  const sueño = useSleep()

  useEffect(() => {
    fetch('/data/wellness.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(d => setDias(d?.dias ?? []))
      .catch(() => setDias([]))
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

    return {
      cargado: true,
      fcReposo, fcReposoPrevia, fcReposoTendencia: tendencia,
      bateriaMax: media(u14, 'bateriaMax'),
      estres: media(u14, 'estresMedio'),
      ultimaNoche, diasDesdeUltimaNoche: diasDesde,
      estado, titular, detalle,
    }
  }, [dias, sueño])
}
