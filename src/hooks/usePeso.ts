import { useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'

interface Registro {
  fecha: string
  kg: number
  imc?: number | null
  grasa_pct?: number | null
  musculo_kg?: number | null
  origen?: string | null
}

export interface PuntoPeso {
  fecha: string
  label: string
  kg: number | null
  /** Media móvil de las últimas mediciones, no de los últimos días: el peso se
   *  registra salteado y una media por calendario quedaría casi siempre vacía. */
  suave: number | null
}

export interface Peso {
  cargado: boolean
  actual: number | null
  fechaActual: string | null
  /** Contra la medición anterior. */
  cambioUltimo: number | null
  /** Contra la primera medición del período dibujado. */
  cambioPeriodo: number | null
  minimo: { kg: number; fecha: string } | null
  maximo: { kg: number; fecha: string } | null
  serie: PuntoPeso[]
  /** Tramos sin medir de más de 45 días: el gráfico no los cruza con una línea. */
  huecos: { desde: string; hasta: string; dias: number; kg: number }[]
  /** Grasa y músculo necesitan balanza inteligente; con carga manual no vienen. */
  tieneComposicion: boolean
}

const VACIO: Peso = {
  cargado: false, actual: null, fechaActual: null, cambioUltimo: null,
  cambioPeriodo: null, minimo: null, maximo: null, serie: [], huecos: [],
  tieneComposicion: false,
}

/** A partir de acá, dos mediciones no son una tendencia sino dos momentos. */
const HUECO_DIAS = 45

const dias = (a: string, b: string) =>
  Math.round((new Date(b + 'T12:00:00').getTime() - new Date(a + 'T12:00:00').getTime()) / 86_400_000)

export function usePeso(): Peso {
  const [registros, setRegistros] = useState<Registro[] | null>(null)

  useEffect(() => {
    leer<{ registros?: Registro[] }>('peso').then(d => setRegistros(d?.registros ?? []))
  }, [])

  return useMemo(() => {
    if (!registros) return VACIO
    const rs = [...registros].filter(r => r.kg > 0).sort((a, b) => a.fecha.localeCompare(b.fecha))
    if (rs.length === 0) return { ...VACIO, cargado: true }

    const huecos = rs.slice(1).flatMap((r, i) => {
      const d = dias(rs[i].fecha, r.fecha)
      return d > HUECO_DIAS
        ? [{ desde: rs[i].fecha, hasta: r.fecha, dias: d, kg: Math.round((r.kg - rs[i].kg) * 10) / 10 }]
        : []
    })

    // La serie lleva un punto nulo dentro de cada hueco. Sin eso Recharts une
    // los extremos con una recta y dibuja un año de subida gradual que nadie
    // midió: once kilos que aparecen como si se hubieran registrado.
    const serie: PuntoPeso[] = []
    const ventana: number[] = []
    rs.forEach((r, i) => {
      if (i > 0 && dias(rs[i - 1].fecha, r.fecha) > HUECO_DIAS) {
        serie.push({ fecha: `${rs[i - 1].fecha}~`, label: '', kg: null, suave: null })
        ventana.length = 0
      }
      ventana.push(r.kg)
      if (ventana.length > 5) ventana.shift()
      const [, m, d] = r.fecha.split('-')
      serie.push({
        fecha: r.fecha,
        label: `${d}/${m}`,
        kg: r.kg,
        suave: ventana.length >= 3
          ? Math.round((ventana.reduce((a, b) => a + b, 0) / ventana.length) * 10) / 10
          : null,
      })
    })

    const ultimo = rs[rs.length - 1]
    const anterior = rs.length > 1 ? rs[rs.length - 2] : null
    const porKg = [...rs].sort((a, b) => a.kg - b.kg)

    return {
      cargado: true,
      actual: ultimo.kg,
      fechaActual: ultimo.fecha,
      cambioUltimo: anterior ? Math.round((ultimo.kg - anterior.kg) * 10) / 10 : null,
      cambioPeriodo: Math.round((ultimo.kg - rs[0].kg) * 10) / 10,
      minimo: { kg: porKg[0].kg, fecha: porKg[0].fecha },
      maximo: { kg: porKg[porKg.length - 1].kg, fecha: porKg[porKg.length - 1].fecha },
      serie,
      huecos,
      tieneComposicion: rs.some(r => r.grasa_pct || r.musculo_kg),
    }
  }, [registros])
}
