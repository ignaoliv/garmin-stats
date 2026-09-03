import { useEffect, useMemo, useState } from 'react'

export interface Noche {
  fecha: string
  total_s: number
  profundo_s: number
  ligero_s: number
  rem_s: number
  despierto_s: number
  en_cama_s: number | null
  inicio_local: number | null
  fin_local: number | null
  spo2_medio: number | null
  spo2_minimo: number | null
  respiracion_media: number | null
  bateria_inicio: number | null
  bateria_fin: number | null
}

export interface Factor {
  clave: string
  etiqueta: string
  valor: string
  puntaje: number | null      // 0-100, null when it cannot be computed
  ideal: string
  detalle: string
}

export interface NocheEvaluada extends Noche {
  puntaje: number | null
  factores: Factor[]
  eficiencia: number | null
  pctProfundo: number
  pctRem: number
}

const h = (s: number) => `${Math.floor(s / 3600)}h ${String(Math.round((s % 3600) / 60)).padStart(2, '0')}m`

/**
 * Score a night the way Oura frames it: a headline number that is only ever a
 * summary of named contributors, each shown with its own target, so a low score
 * is explainable rather than mysterious.
 *
 * Contributors Garmin cannot supply — HRV balance and body temperature, which
 * Oura leans on heavily — are deliberately absent rather than approximated.
 */
function evaluar(n: Noche): NocheEvaluada {
  const eficiencia = n.en_cama_s ? Math.round((n.total_s / n.en_cama_s) * 100) : null
  const pctProfundo = n.total_s ? (n.profundo_s / n.total_s) * 100 : 0
  const pctRem = n.total_s ? (n.rem_s / n.total_s) * 100 : 0

  // Each contributor maps its value onto 0-100 against a reference band.
  const banda = (v: number, malo: number, bueno: number) =>
    Math.max(0, Math.min(100, Math.round(((v - malo) / (bueno - malo)) * 100)))

  const horas = n.total_s / 3600

  // One threshold per factor, shared by the bar and the wording, so a full bar
  // can never sit next to a sentence calling the value low.
  const bien = (p: number | null) => p !== null && p >= 80
  const factores: Factor[] = [
    {
      clave: 'duracion',
      etiqueta: 'Duración',
      valor: h(n.total_s),
      // Below 5h is poor, 7h+ is the target; over 9h stops adding.
      puntaje: horas >= 7 ? 100 : banda(horas, 4, 7),
      ideal: '7 a 9 h',
      detalle: horas >= 7
        ? 'Dormiste lo suficiente.'
        : `Te faltaron ${h(Math.max(0, 7 * 3600 - n.total_s))} para llegar a 7 horas.`,
    },
    {
      clave: 'eficiencia',
      etiqueta: 'Eficiencia',
      valor: eficiencia !== null ? `${eficiencia}%` : '—',
      puntaje: eficiencia !== null ? (eficiencia >= 85 ? 100 : banda(eficiencia, 60, 85)) : null,
      ideal: '85% o más',
      detalle: eficiencia === null
        ? 'No se pudo calcular el tiempo en cama.'
        : eficiencia >= 85 ? 'Pasaste en cama casi sólo el tiempo que dormiste.' : 'Pasaste bastante tiempo en cama sin dormir.',
    },
    {
      clave: 'profundo',
      etiqueta: 'Sueño profundo',
      valor: `${h(n.profundo_s)} · ${Math.round(pctProfundo)}%`,
      // 13-23% of the night is the usual adult reference band.
      puntaje: pctProfundo >= 13 ? 100 : banda(pctProfundo, 0, 13),
      ideal: '13 a 23% de la noche',
      detalle: '',
    },
    {
      clave: 'rem',
      etiqueta: 'REM',
      valor: `${h(n.rem_s)} · ${Math.round(pctRem)}%`,
      puntaje: pctRem >= 20 ? 100 : banda(pctRem, 0, 20),
      ideal: '20 a 25% de la noche',
      detalle: '',
    },
    {
      clave: 'desvelos',
      etiqueta: 'Continuidad',
      valor: `${Math.round(n.despierto_s / 60)} min despierto`,
      puntaje: n.despierto_s <= 600 ? 100 : banda(n.despierto_s / 60, 60, 10),
      ideal: 'menos de 10 min',
      detalle: n.despierto_s <= 600 ? 'Dormiste de corrido.' : 'Hubo interrupciones durante la noche.',
    },
  ]

  // Fill the two stage factors now that their scores exist.
  const prof = factores.find(f => f.clave === 'profundo')!
  prof.detalle = bien(prof.puntaje)
    ? 'Buena proporción de sueño profundo, la fase que más repara físicamente.'
    : 'Poco sueño profundo: es la fase que más repara físicamente.'
  const rem = factores.find(f => f.clave === 'rem')!
  rem.detalle = bien(rem.puntaje)
    ? 'Buena proporción de REM, la fase asociada a la recuperación mental.'
    : 'Poco REM: es la fase asociada a la recuperación mental.'

  const puntuados = factores.map(f => f.puntaje).filter((p): p is number => p !== null)
  const puntaje = puntuados.length ? Math.round(puntuados.reduce((a, b) => a + b, 0) / puntuados.length) : null

  return { ...n, eficiencia, pctProfundo, pctRem, puntaje, factores }
}

export interface SleepData {
  cargado: boolean
  noches: NocheEvaluada[]
  ultima: NocheEvaluada | null
  cobertura: { conRegistro: number; diasBarridos: number; pct: number }
  medias: { total_s: number; puntaje: number; profundo_s: number; rem_s: number } | null
}

export function useSleep(): SleepData {
  const [raw, setRaw] = useState<Noche[] | null>(null)

  useEffect(() => {
    fetch('/data/sleep.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(d => setRaw(d?.noches ?? []))
      .catch(() => setRaw([]))
  }, [])

  return useMemo(() => {
    if (!raw) return { cargado: false, noches: [], ultima: null, cobertura: { conRegistro: 0, diasBarridos: 0, pct: 0 }, medias: null }
    const noches = raw.map(evaluar)
    if (noches.length === 0) {
      return { cargado: true, noches, ultima: null, cobertura: { conRegistro: 0, diasBarridos: 0, pct: 0 }, medias: null }
    }
    const primera = new Date(noches[0].fecha + 'T00:00:00').getTime()
    const dias = Math.max(1, Math.round((Date.now() - primera) / 86_400_000))
    const media = (f: (n: NocheEvaluada) => number) => Math.round(noches.reduce((a, n) => a + f(n), 0) / noches.length)

    return {
      cargado: true,
      noches,
      ultima: noches[noches.length - 1],
      cobertura: { conRegistro: noches.length, diasBarridos: dias, pct: Math.round((noches.length / dias) * 100) },
      medias: {
        total_s: media(n => n.total_s),
        puntaje: media(n => n.puntaje ?? 0),
        profundo_s: media(n => n.profundo_s),
        rem_s: media(n => n.rem_s),
      },
    }
  }, [raw])
}
