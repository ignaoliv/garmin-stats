import { useEffect, useMemo, useState } from 'react'

export interface StepDay {
  fecha: string
  pasos: number
  distancia_m: number
  objetivo: number
}

export interface StepsData {
  loaded: boolean
  dias: StepDay[]
  /** Trailing window, oldest first, with gaps filled as zero days. */
  ventana: (StepDay & { label: string; cumplido: boolean })[]
  hoy: StepDay | null
  objetivo: number
  media: number
  mediaPrevia: number
  mejor: StepDay | null
  diasCumplidos: number
  totalPasos: number
  kmTotales: number
}

const VACIO: StepsData = {
  loaded: false, dias: [], ventana: [], hoy: null, objetivo: 10000,
  media: 0, mediaPrevia: 0, mejor: null, diasCumplidos: 0, totalPasos: 0, kmTotales: 0,
}

export function useSteps(windowDays = 30): StepsData {
  const [dias, setDias] = useState<StepDay[] | null>(null)

  useEffect(() => {
    fetch('/data/steps.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(d => setDias(d?.dias ?? []))
      .catch(() => setDias([]))
  }, [])

  return useMemo(() => {
    if (!dias) return VACIO
    if (dias.length === 0) return { ...VACIO, loaded: true }

    const byDate = new Map(dias.map(d => [d.fecha, d]))
    const objetivo = dias.find(d => d.objetivo > 0)?.objetivo ?? 10000

    // Walk real calendar days so a day Garmin never recorded reads as zero
    // rather than silently collapsing the timeline.
    const build = (from: number, to: number) => {
      const out: StepDay[] = []
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      for (let i = from; i > to; i--) {
        const d = new Date(today)
        d.setDate(d.getDate() - i + 1)
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
        out.push(byDate.get(key) ?? { fecha: key, pasos: 0, distancia_m: 0, objetivo })
      }
      return out
    }

    const actual = build(windowDays, 0)
    const previa = build(windowDays * 2, windowDays)
    const mean = (rows: StepDay[]) => (rows.length ? rows.reduce((s, r) => s + r.pasos, 0) / rows.length : 0)

    const ventana = actual.map(d => ({
      ...d,
      label: new Date(d.fecha + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }),
      cumplido: d.pasos >= objetivo,
    }))

    const conDatos = dias.filter(d => d.pasos > 0)
    // Local date parts, not toISOString(): after 21:00 in Argentina the UTC date
    // is already tomorrow, and "hoy" silently showed zero steps.
    const now = new Date()
    const hoyKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`

    return {
      loaded: true,
      dias,
      ventana,
      hoy: byDate.get(hoyKey) ?? null,
      objetivo,
      media: Math.round(mean(actual)),
      mediaPrevia: Math.round(mean(previa)),
      mejor: conDatos.reduce<StepDay | null>((a, b) => (!a || b.pasos > a.pasos ? b : a), null),
      diasCumplidos: actual.filter(d => d.pasos >= objetivo).length,
      totalPasos: conDatos.reduce((s, d) => s + d.pasos, 0),
      kmTotales: conDatos.reduce((s, d) => s + d.distancia_m, 0) / 1000,
    }
  }, [dias, windowDays])
}
