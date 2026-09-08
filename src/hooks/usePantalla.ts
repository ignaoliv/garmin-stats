import { useCallback, useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'

export interface Registro {
  clave: string
  periodo: 'semana' | 'dia'
  desde: string
  cargado: string
  dispositivo: string | null
  diasTranscurridos: number | null
  totalMin: number | null
  promedioDiarioMin: number | null
  cambioPct: number | null
  categorias: { nombre: string; min: number }[]
  apps: { nombre: string; min: number }[]
  activaciones: number | null
  nota?: string
}

export interface Punto {
  desde: string
  label: string
  /** Minutos por día, no del período: una semana de 2 días y otra de 7 no se
   *  pueden comparar en total, sólo en promedio. */
  redesDia: number | null
  pantallaDia: number | null
  parcial: boolean
}

export interface Pantalla {
  cargado: boolean
  ultimo: Registro | null
  registros: Registro[]
  serie: Punto[]
  /** Minutos diarios en redes del último informe. */
  redesDia: number | null
  /** Qué porción del tiempo en pantalla se fue en redes. */
  pctRedes: number | null
  /** 0-100, y acá MÁS ES MÁS CONSUMO, al revés que el resto de la app. */
  indice: number | null
  banda: { label: string; color: string; texto: string } | null
  /** Las apps de redes del último informe, de mayor a menor. */
  redes: { nombre: string; min: number; minDia: number }[]
}

const VACIO: Pantalla = {
  cargado: false, ultimo: null, registros: [], serie: [],
  redesDia: null, pctRedes: null, indice: null, banda: null, redes: [],
}

/** Las que cuentan como redes cuando hay que decidir app por app.
 *
 *  iOS ya trae su categoría "Redes sociales" y ese es el número que manda;
 *  esta lista sólo sirve para señalar cuáles de las apps listadas son las que
 *  nos interesan. WhatsApp queda afuera a propósito: mucho de eso es
 *  conversación, no scroll, y meterlo infla el índice con algo distinto. */
const REDES = ['instagram', 'tiktok', 'x', 'twitter', 'facebook', 'reddit', 'threads', 'snapchat']

export const esRed = (nombre: string) => {
  const n = nombre.trim().toLowerCase()
  return REDES.includes(n) || REDES.some(r => r.length > 2 && n.includes(r))
}

/**
 * Las bandas.
 *
 * El corte de arriba está en tres horas diarias porque es donde el índice llega
 * a 100; no es un umbral clínico ni pretende serlo. Sirve para ver si la aguja
 * se mueve entre una semana y la siguiente, que es lo único que se puede
 * accionar.
 */
const BANDAS = [
  { desde: 75, label: 'Muy alto', color: '#f43f5e', texto: 'Más de dos horas y media por día en redes. Es la franja donde el teléfono organiza el día en vez de acompañarlo.' },
  { desde: 50, label: 'Alto',     color: '#fb923c', texto: 'Alrededor de dos horas diarias. Suele ser el rango donde uno no siente que “usa mucho el teléfono”, pero el número dice otra cosa.' },
  { desde: 25, label: 'Moderado', color: '#fde047', texto: 'Cerca de una hora por día. Es un uso normal; mirá la tendencia más que el número suelto.' },
  { desde: 0,  label: 'Bajo',     color: '#34d399', texto: 'Poco tiempo en redes para lo que es el promedio. Lo que importa acá es sostenerlo.' },
]

/** 3 h diarias marcan el techo de la escala. Debajo, proporcional. */
const TECHO_MIN = 180

export function usePantalla() {
  const [registros, setRegistros] = useState<Registro[] | null>(null)

  const recargar = useCallback(
    () => leer<{ registros?: Registro[] }>('pantalla').then(d => setRegistros(d?.registros ?? [])),
    [],
  )
  useEffect(() => { recargar() }, [recargar])

  const datos = useMemo<Pantalla>(() => {
    if (!registros) return VACIO
    if (registros.length === 0) return { ...VACIO, cargado: true }

    const orden = [...registros].sort((a, b) => a.desde.localeCompare(b.desde))

    const porDia = (r: Registro, min: number | null) => {
      if (min === null) return null
      const d = r.periodo === 'dia' ? 1 : (r.diasTranscurridos ?? 7)
      return Math.round(min / Math.max(1, d))
    }
    const redesDe = (r: Registro) =>
      r.categorias.find(c => c.nombre.toLowerCase().includes('redes'))?.min ?? null

    const serie: Punto[] = orden.map(r => {
      const [, m, d] = r.desde.split('-')
      return {
        desde: r.desde,
        label: `${d}/${m}`,
        redesDia: porDia(r, redesDe(r)),
        pantallaDia: r.promedioDiarioMin ?? porDia(r, r.totalMin),
        // Una semana a medio transcurrir es una lectura provisoria y conviene
        // que se note: si no, un martes parece una semana floja.
        parcial: r.periodo === 'semana' && (r.diasTranscurridos ?? 7) < 7,
      }
    })

    const ultimo = orden[orden.length - 1]
    const redesMin = redesDe(ultimo)
    const redesDia = porDia(ultimo, redesMin)
    const pantallaDia = ultimo.promedioDiarioMin ?? porDia(ultimo, ultimo.totalMin)

    const indice = redesDia === null
      ? null
      : Math.max(0, Math.min(100, Math.round((redesDia / TECHO_MIN) * 100)))

    const dias = ultimo.periodo === 'dia' ? 1 : (ultimo.diasTranscurridos ?? 7)

    return {
      cargado: true,
      ultimo,
      registros: orden,
      serie,
      redesDia,
      pctRedes: redesMin !== null && ultimo.totalMin
        ? Math.round((redesMin / ultimo.totalMin) * 100)
        : null,
      indice,
      banda: indice === null ? null : (BANDAS.find(b => indice >= b.desde) ?? BANDAS[BANDAS.length - 1]),
      redes: ultimo.apps
        .filter(a => esRed(a.nombre))
        .map(a => ({ ...a, minDia: Math.round(a.min / Math.max(1, dias)) }))
        .sort((a, b) => b.min - a.min),
      pantallaDia,
    } as Pantalla
  }, [registros])

  return { ...datos, recargar }
}

/** Minutos a "2 h 06" o "47 min". */
export function horas(min: number | null | undefined): string {
  if (min === null || min === undefined) return '—'
  return min >= 60 ? `${Math.floor(min / 60)} h ${String(min % 60).padStart(2, '0')}` : `${min} min`
}
