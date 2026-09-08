import { useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'

interface DiaBienestar {
  fecha: string
  estresMedio?: number
  estresMaximo?: number
  /** Segundos del día en cada categoría. Ojo: `estresMedio` es el NIVEL
   *  promedio (0-100) y `estresSegMedio` son los segundos en la categoría
   *  "medio". Se parecen demasiado como para no aclararlo. */
  estresSegReposo?: number
  estresSegBajo?: number
  estresSegMedio?: number
  estresSegAlto?: number
  estresSegActividad?: number
  estresSegSinMedir?: number
  bateriaCargada?: number
  bateriaGastada?: number
}

export interface PuntoEstres {
  fecha: string
  label: string
  nivel: number | null
  /** La progresión, que es lo que se puede leer; el día suelto es ruido. */
  media7: number | null
}

export interface Tramo {
  clave: 'reposo' | 'bajo' | 'medio' | 'alto'
  label: string
  color: string
  segundos: number
  pct: number
}

export interface Estres {
  cargado: boolean
  /** Nivel medio del último día con medición, sobre 100. */
  nivel: number | null
  fecha: string | null
  /** Cuántos días atrás es esa lectura: una de hace una semana no es "hoy". */
  hace: number | null
  /** Media de los últimos 30 días, para saber si el día se sale de lo normal. */
  media30: number | null
  /** Etiqueta del nivel, en las palabras que usa Garmin. */
  estado: 'calmo' | 'moderado' | 'alto' | null
  serie: PuntoEstres[]
  /** El reparto del último día sobre el tiempo MEDIDO. */
  reparto: Tramo[]
  /** Lo que queda fuera del reparto, en segundos. */
  entrenando: number
  sinMedir: number
  bateria: { cargada: number; gastada: number } | null
  /** Cuántos de los últimos 30 días tienen reparto. */
  diasConReparto: number
}

const VACIO: Estres = {
  cargado: false, nivel: null, fecha: null, hace: null, media30: null,
  estado: null, serie: [], reparto: [], entrenando: 0, sinMedir: 0,
  bateria: null, diasConReparto: 0,
}

/**
 * Los cuatro estados, con la paleta ya validada.
 *
 * Reposo es una categoría aparte —no es estrés bajo, es ausencia de estrés— y
 * bajo/medio/alto son una rampa de severidad. Los colores salieron de correr el
 * validador: el naranja y el rojo que uno elegiría de taquito quedan a ΔE 10,6
 * para visión normal, o sea indistinguibles pegados en una barra apilada.
 */
export const TRAMOS = [
  { clave: 'reposo', label: 'En reposo', color: '#34d399', campo: 'estresSegReposo' },
  { clave: 'bajo',   label: 'Bajo',      color: '#fde047', campo: 'estresSegBajo' },
  { clave: 'medio',  label: 'Medio',     color: '#fb923c', campo: 'estresSegMedio' },
  { clave: 'alto',   label: 'Alto',      color: '#f43f5e', campo: 'estresSegAlto' },
] as const

/** Garmin llama CALM a menos de 25 y las apps suelen cortar el alto en 50. */
function clasificar(n: number): Estres['estado'] {
  return n < 26 ? 'calmo' : n < 51 ? 'moderado' : 'alto'
}

export function useEstres(dias = 90): Estres {
  const [datos, setDatos] = useState<DiaBienestar[] | null>(null)

  useEffect(() => {
    leer<{ dias?: DiaBienestar[] }>('wellness').then(d => setDatos(d?.dias ?? []))
  }, [])

  return useMemo(() => {
    if (!datos) return VACIO
    if (datos.length === 0) return { ...VACIO, cargado: true }

    const ahora = Date.now()
    const corte = ahora - dias * 86_400_000
    const ventana = datos
      .filter(r => new Date(r.fecha + 'T12:00:00').getTime() >= corte)
      .sort((a, b) => a.fecha.localeCompare(b.fecha))

    // La media móvil se calcula sobre los días CON medición dentro de una
    // ventana de calendario: un día sin reloj no debe contar como un cero, que
    // arrastraría la curva hacia abajo justo cuando faltan datos.
    const serie: PuntoEstres[] = ventana.map((r, i) => {
      const previos = ventana
        .slice(Math.max(0, i - 6), i + 1)
        .map(x => x.estresMedio)
        .filter((x): x is number => typeof x === 'number')
      const [, m, d] = r.fecha.split('-')
      return {
        fecha: r.fecha,
        label: `${d}/${m}`,
        nivel: typeof r.estresMedio === 'number' ? r.estresMedio : null,
        media7: previos.length >= 3
          ? Math.round((previos.reduce((a, b) => a + b, 0) / previos.length) * 10) / 10
          : null,
      }
    })

    const conNivel = ventana.filter(r => typeof r.estresMedio === 'number')
    const u30 = conNivel.filter(r => new Date(r.fecha + 'T12:00:00').getTime() >= ahora - 30 * 86_400_000)
    const media30 = u30.length
      ? Math.round((u30.reduce((s, r) => s + r.estresMedio!, 0) / u30.length) * 10) / 10
      : null

    const ultimo = [...ventana].reverse().find(r => typeof r.estresSegReposo === 'number')
      ?? conNivel[conNivel.length - 1]
    if (!ultimo) return { ...VACIO, cargado: true, serie }

    // Los campos se leen por nombre porque vienen de TRAMOS, que es la misma
    // lista que pinta la leyenda: así el color y el número no pueden
    // desalinearse por tocar uno solo de los dos.
    const seg = (c: keyof DiaBienestar) => {
      const v = ultimo[c]
      return typeof v === 'number' ? v : 0
    }

    // El reparto es sobre el tiempo MEDIDO, no sobre las 24 horas. El rato de
    // entrenamiento Garmin lo saca a propósito —el pulso alto ahí no es
    // estrés— y el resto es reloj afuera; meterlos en la misma barra diría que
    // dormiste tranquilo cuando en realidad no te estaban midiendo.
    const medido = TRAMOS.reduce((s, t) => s + seg(t.campo), 0)
    const reparto: Tramo[] = medido > 0
      ? TRAMOS.map(t => ({
          clave: t.clave, label: t.label, color: t.color,
          segundos: seg(t.campo),
          pct: (seg(t.campo) / medido) * 100,
        }))
      : []

    const nivel = typeof ultimo.estresMedio === 'number' ? ultimo.estresMedio : null

    return {
      cargado: true,
      nivel,
      fecha: ultimo.fecha,
      hace: Math.round((ahora - new Date(ultimo.fecha + 'T12:00:00').getTime()) / 86_400_000),
      media30,
      estado: nivel !== null ? clasificar(nivel) : null,
      serie,
      reparto,
      entrenando: seg('estresSegActividad'),
      sinMedir: seg('estresSegSinMedir'),
      bateria: typeof ultimo.bateriaCargada === 'number'
        ? { cargada: ultimo.bateriaCargada, gastada: ultimo.bateriaGastada ?? 0 }
        : null,
      diasConReparto: ventana.filter(r =>
        typeof r.estresSegReposo === 'number'
        && new Date(r.fecha + 'T12:00:00').getTime() >= ahora - 30 * 86_400_000).length,
    }
  }, [datos, dias])
}

/** Segundos a "3 h 20" o "45 min". Las horas con decimal se leen peor. */
export function duracion(segundos: number): string {
  const min = Math.round(segundos / 60)
  if (min < 60) return `${min} min`
  const h = Math.floor(min / 60)
  const m = min % 60
  return m ? `${h} h ${m}` : `${h} h`
}
