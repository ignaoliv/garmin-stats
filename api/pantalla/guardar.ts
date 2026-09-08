import type { VercelRequest, VercelResponse } from '@vercel/node'
import { get, put } from '@vercel/blob'
import { haySesion } from '../../lib/api/sesion.js'

const ARCHIVO = 'datos/pantalla.json'

interface Registro {
  clave: string
  periodo: 'semana' | 'dia'
  /** Lunes de la semana, o el día, según el período. */
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

/** Hoy en Buenos Aires. La función corre en Washington, así que `new Date()` a
 *  la noche ya está en el día siguiente y una carga de las 22 se guardaría con
 *  fecha de mañana — el mismo cuidado que en comida/guardar.ts. */
function hoyLocal(): string {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  return f
}

/** El lunes de la semana de `iso`. iOS arranca la semana en lunes (L M M J V S D). */
function lunesDe(iso: string): string {
  const d = new Date(iso + 'T12:00:00Z')
  const dia = (d.getUTCDay() + 6) % 7          // 0 = lunes
  d.setUTCDate(d.getUTCDate() - dia)
  return d.toISOString().slice(0, 10)
}

async function leerArchivo(): Promise<Registro[]> {
  try {
    // `useCache: false` por la misma razón que en el resto: la lectura privada
    // pasa por una caché de borde y sin esto una segunda carga en el mismo rato
    // haría merge sobre la versión anterior y perdería la primera.
    const r = await get(ARCHIVO, { access: 'private', useCache: false })
    if (r?.statusCode !== 200) return []
    const texto = await new Response(r.stream as never).text()
    return JSON.parse(texto).registros ?? []
  } catch {
    return []
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!haySesion(req.headers.cookie)) return res.status(401).json({ error: 'sin sesión' })
  if (req.method !== 'POST') return res.status(405).json({ error: 'usa POST' })

  const b = req.body ?? {}
  const periodo: 'semana' | 'dia' = b.periodo === 'dia' ? 'dia' : 'semana'
  const hoy = hoyLocal()
  const desde = periodo === 'semana' ? lunesDe(hoy) : hoy
  const dispositivo = typeof b.dispositivo === 'string' ? b.dispositivo.slice(0, 40) : null

  // La vista semanal es ACUMULATIVA: si cargás el martes y otra vez el jueves,
  // el segundo informe contiene al primero. Por eso la clave es la semana y el
  // dispositivo, y una carga nueva REEMPLAZA a la anterior en vez de sumarse.
  // Guardar las dos daría una semana contada dos veces.
  const clave = `${desde}|${dispositivo ?? ''}`

  const registro: Registro = {
    clave, periodo, desde,
    cargado: new Date().toISOString(),
    dispositivo,
    diasTranscurridos: b.dias_transcurridos ?? null,
    totalMin: b.total_min ?? null,
    promedioDiarioMin: b.promedio_diario_min ?? null,
    cambioPct: b.cambio_pct ?? null,
    categorias: Array.isArray(b.categorias) ? b.categorias.slice(0, 8) : [],
    apps: Array.isArray(b.apps) ? b.apps.slice(0, 20) : [],
    activaciones: b.activaciones ?? null,
    nota: typeof b.nota === 'string' ? b.nota.slice(0, 300) : undefined,
  }

  if (registro.totalMin === null && registro.apps.length === 0) {
    return res.status(400).json({ error: 'el informe no trae ningún número' })
  }

  const previos = await leerArchivo()
  const registros = [...previos.filter(r => r.clave !== clave), registro]
    .sort((a, b2) => a.desde.localeCompare(b2.desde))

  await put(ARCHIVO, JSON.stringify({ actualizado: new Date().toISOString(), registros }), {
    access: 'private',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
  })

  return res.status(200).json({ ok: true, clave, registros: registros.length })
}
