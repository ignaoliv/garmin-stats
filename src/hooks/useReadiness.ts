import { useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'
import { useSleep } from './useSleep'
import { useFitnessHistory } from './useFitnessHistory'
import { preparacion, type Preparacion } from '../lib/readiness'

interface Dia {
  fecha: string
  fcReposo?: number
  estresMedio?: number
  bateriaMin?: number
}

const DIA = 86_400_000
const dias = (fecha: string) =>
  Math.round((Date.now() - new Date(fecha + 'T12:00:00').getTime()) / DIA)

export interface Readiness extends Preparacion {
  cargado: boolean
  /** De qué día es la lectura: una FC de hace cuatro días no es "hoy". */
  fecha: string | null
  hace: number | null
}

export function useReadiness(): Readiness {
  const [datos, setDatos] = useState<Dia[] | null>(null)
  const sueño = useSleep()
  const { current: fitness } = useFitnessHistory()

  useEffect(() => {
    leer<{ dias?: Dia[] }>('wellness').then(d => setDatos(d?.dias ?? []))
  }, [])

  return useMemo(() => {
    const vacio = { cargado: false, fecha: null, hace: null }
    if (!datos) return { ...preparacion({ fcHoy: null, fcBase: null, tsb: null, estres3d: null, bateriaMin: null, sueñoHoras: null }), ...vacio }

    const orden = [...datos].sort((a, b) => a.fecha.localeCompare(b.fecha))
    const ultimo = [...orden].reverse().find(d => d.fcReposo !== undefined) ?? orden[orden.length - 1]

    // La base son los 30 días PREVIOS al último, sin incluirlo: comparar el día
    // contra un promedio que ya lo contiene achica la diferencia justo cuando
    // más importa verla.
    const previos = ultimo
      ? orden.filter(d => d.fecha < ultimo.fecha && dias(d.fecha) <= 31 && d.fcReposo !== undefined)
      : []
    const fcBase = previos.length >= 5
      ? Math.round((previos.reduce((s, d) => s + d.fcReposo!, 0) / previos.length) * 10) / 10
      : null

    const u3 = orden.filter(d => dias(d.fecha) <= 3 && d.estresMedio !== undefined)
    const estres3d = u3.length
      ? u3.reduce((s, d) => s + d.estresMedio!, 0) / u3.length
      : null

    // La batería que interesa es la de AYER: cuánto te drenó el día que ya
    // terminó. La de hoy todavía se está escribiendo y a la mañana siempre se
    // ve bien.
    const ayer = orden.filter(d => dias(d.fecha) >= 1 && d.bateriaMin !== undefined).pop()

    const anoche = sueño.ultima && dias(sueño.ultima.fecha) <= 1 ? sueño.ultima : null
    const sueñoHoras = anoche?.total_s ? Math.round((anoche.total_s / 3600) * 10) / 10 : null

    return {
      ...preparacion({
        fcHoy: ultimo?.fcReposo ?? null,
        fcBase,
        tsb: fitness?.tsb ?? null,
        estres3d,
        bateriaMin: ayer?.bateriaMin ?? null,
        sueñoHoras,
      }),
      cargado: true,
      fecha: ultimo?.fecha ?? null,
      hace: ultimo ? dias(ultimo.fecha) : null,
    }
  }, [datos, sueño, fitness])
}
