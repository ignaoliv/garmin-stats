import type { VercelRequest, VercelResponse } from '@vercel/node'
import { get, put } from '@vercel/blob'
import { haySesion } from '../../lib/api/sesion.js'

const ARCHIVO = 'datos/comidas.json'

interface Comida {
  id: string
  fecha: string
  hora: string
  nombre: string
  alimentos: unknown[]
  total: Record<string, number>
  nota?: string
  origen?: string
  corregido?: boolean
}

/** Fecha y hora locales de Buenos Aires.
 *
 *  La función corre en Washington, así que `new Date()` a la noche ya está en
 *  el día siguiente: una cena de las 22 quedaría registrada mañana. */
function ahoraLocal() {
  const f = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Argentina/Buenos_Aires',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date())
  const p = (t: string) => f.find(x => x.type === t)?.value ?? '00'
  return { fecha: `${p('year')}-${p('month')}-${p('day')}`, hora: `${p('hour')}:${p('minute')}` }
}

async function leerArchivo(): Promise<Comida[]> {
  try {
    // `useCache: false` importa especialmente acá: editando se guarda varias
    // veces seguidas, y sin esto la segunda lectura devuelve la versión previa
    // a la primera y el cambio anterior se pierde al reescribir el archivo.
    const r = await get(ARCHIVO, { access: 'private', useCache: false })
    if (r?.statusCode !== 200) return []
    const texto = await new Response(r.stream as never).text()
    return JSON.parse(texto).comidas ?? []
  } catch {
    // Todavía no existe: la primera comida lo crea.
    return []
  }
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!haySesion(req.headers.cookie)) return res.status(401).json({ error: 'sin sesión' })
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'usa POST' })
  }

  const cuerpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {}
  const { fecha, hora } = ahoraLocal()

  // Borrar es el mismo archivo con una comida menos. Va por acá y no por un
  // endpoint aparte porque comparte todo: leer el blob sin caché, filtrar y
  // reescribir. Separarlo eran cuarenta líneas duplicadas para un `filter`.
  if (cuerpo.borrar && cuerpo.id) {
    try {
      const previas = await leerArchivo()
      const comidas = previas.filter(c => c.id !== cuerpo.id)
      if (comidas.length === previas.length) {
        return res.status(404).json({ error: 'esa comida no existe' })
      }
      await put(ARCHIVO, JSON.stringify({ actualizado: fecha, comidas }, null, 1), {
        access: 'private',
        contentType: 'application/json',
        addRandomSuffix: false,
        allowOverwrite: true,
      })
      return res.status(200).json({ ok: true, borrada: cuerpo.id })
    } catch (e) {
      return res.status(500).json({ error: (e as Error).message })
    }
  }

  const comida: Comida = {
    id: cuerpo.id || Math.random().toString(36).slice(2, 14),
    fecha: cuerpo.fecha || fecha,
    hora: cuerpo.hora || hora,
    nombre: String(cuerpo.nombre || 'Comida').trim() || 'Comida',
    alimentos: Array.isArray(cuerpo.alimentos) ? cuerpo.alimentos : [],
    total: cuerpo.total ?? {},
    nota: cuerpo.nota ?? '',
    origen: cuerpo.origen ?? 'foto',
    corregido: !!cuerpo.corregido,
  }

  try {
    const previas = await leerArchivo()
    // Reemplaza si ya existía ese id, para poder editar una guardada.
    const comidas = [...previas.filter(c => c.id !== comida.id), comida]
      .sort((a, b) => (a.fecha + a.hora).localeCompare(b.fecha + b.hora))

    await put(ARCHIVO, JSON.stringify({ actualizado: fecha, comidas }, null, 1), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return res.status(200).json(comida)
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
