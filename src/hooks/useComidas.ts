import { useCallback, useEffect, useMemo, useState } from 'react'
import { leer } from '../lib/datos'

export interface AlimentoRegistrado {
  nombre: string
  consulta?: string
  gramos: number
  confianza?: 'alta' | 'media' | 'baja'
  encontrado?: boolean
  fuente?: string | null
  coincidencia?: string | null
  nutrientes?: Record<string, number> | null
  /** Los otros candidatos de la tabla, con sus valores por 100 g. Viajan con
   *  el alimento porque salen de la misma búsqueda: elegir otro no cuesta una
   *  vuelta más a la red. */
  alternativas?: { descripcion: string; id?: number; fuente?: string;
                   por_100g: Record<string, number> }[]
}

export interface Comida {
  id: string
  fecha: string
  hora: string
  momento?: string | null
  nombre: string
  alimentos: AlimentoRegistrado[]
  total: Record<string, number>
  nota?: string
  origen?: string
  corregido?: boolean
}

/** Hoy en la zona del navegador. `toISOString()` corre el día de tarde, que en
 *  un registro de comidas manda la cena al día siguiente. */
export function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export function useComidas(dia = hoyLocal()) {
  const [todas, setTodas] = useState<Comida[]>([])
  const [cargando, setCargando] = useState(true)

  const recargar = useCallback(() => {
    return leer<{ comidas?: Comida[] }>('comidas')
      .then(d => setTodas(d?.comidas ?? []))
      .finally(() => setCargando(false))
  }, [])

  useEffect(() => { recargar() }, [recargar])

  const delDia = useMemo(
    () => todas.filter(c => c.fecha === dia).sort((a, b) => a.hora.localeCompare(b.hora)),
    [todas, dia],
  )

  const total = useMemo(() => {
    const t: Record<string, number> = {}
    for (const c of delDia) {
      for (const [k, v] of Object.entries(c.total ?? {})) {
        if (typeof v === 'number') t[k] = (t[k] ?? 0) + v
      }
    }
    return Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v * 10) / 10]))
  }, [delDia])

  /** Los últimos 14 días con registro, para ver si el hábito se sostiene. */
  const ultimosDias = useMemo(() => {
    const porDia = new Map<string, number>()
    for (const c of todas) {
      const kcal = c.total?.calorias
      if (typeof kcal === 'number') porDia.set(c.fecha, (porDia.get(c.fecha) ?? 0) + kcal)
    }
    return [...porDia.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-14)
      .map(([fecha, kcal]) => {
        const [, m, d] = fecha.split('-')
        return { fecha, label: `${d}/${m}`, kcal: Math.round(kcal) }
      })
  }, [todas])

  return { cargando, todas, delDia, total, ultimosDias, recargar }
}
