import { useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'

interface DiaCrudo {
  fecha: string
  caloriasTotales?: number
  caloriasActivas?: number
}

export interface PuntoCalorias {
  fecha: string
  label: string
  total: number | null
  activas: number | null
}

export interface Calorias {
  cargado: boolean
  /** Media diaria del período dibujado. */
  media: number | null
  mediaPrevia: number | null
  /** Cuánto del total fue movimiento, en promedio. */
  activasMedia: number | null
  ultimo: PuntoCalorias | null
  serie: PuntoCalorias[]
  /** Cuántos de los días de la ventana tienen medición. */
  cobertura: { conDato: number; dias: number }
}

const VACIO: Calorias = {
  cargado: false, media: null, mediaPrevia: null, activasMedia: null,
  ultimo: null, serie: [], cobertura: { conDato: 0, dias: 0 },
}

const DIAS = 30

export function useCalorias(): Calorias {
  const [dias, setDias] = useState<DiaCrudo[] | null>(null)

  useEffect(() => {
    leer<{ dias?: DiaCrudo[] }>('wellness').then(d => setDias(d?.dias ?? []))
  }, [])

  return useMemo(() => {
    if (!dias) return VACIO

    const porFecha = new Map(dias.map(r => [r.fecha, r]))
    const hoy = new Date()
    hoy.setHours(12, 0, 0, 0)

    // Clave local, nunca toISOString(): de tarde corre el día y el último punto
    // aparece vacío.
    const clave = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

    const ventana = (desde: number, hasta: number): PuntoCalorias[] => {
      const out: PuntoCalorias[] = []
      for (let i = desde - 1; i >= hasta; i--) {
        const d = new Date(hoy)
        d.setDate(d.getDate() - i)
        const k = clave(d)
        const r = porFecha.get(k)
        const [, m, dd] = k.split('-')
        out.push({
          fecha: k,
          label: `${dd}/${m}`,
          total: typeof r?.caloriasTotales === 'number' ? Math.round(r.caloriasTotales) : null,
          activas: typeof r?.caloriasActivas === 'number' ? Math.round(r.caloriasActivas) : null,
        })
      }
      return out
    }

    const serie = ventana(DIAS, 0)
    const previa = ventana(DIAS * 2, DIAS)

    const promedio = (v: (number | null)[]) => {
      const n = v.filter((x): x is number => x !== null)
      return n.length ? Math.round(n.reduce((a, b) => a + b, 0) / n.length) : null
    }

    const conDato = serie.filter(p => p.total !== null).length
    // El último día con medición, no el último del calendario: hoy suele estar
    // a medio contar y mostrarlo como cifra del día engaña.
    const ultimo = [...serie].reverse().find(p => p.total !== null) ?? null

    return {
      cargado: true,
      media: promedio(serie.map(p => p.total)),
      mediaPrevia: promedio(previa.map(p => p.total)),
      activasMedia: promedio(serie.map(p => p.activas)),
      ultimo,
      serie,
      cobertura: { conDato, dias: DIAS },
    }
  }, [dias])
}
