import type { VercelRequest, VercelResponse } from '@vercel/node'
import { get, put } from '@vercel/blob'
import { haySesion } from '../lib/api/sesion.js'

const ARCHIVO = 'datos/perfil.json'

/** Los mismos límites que valida fetch/perfil.py. Se validan de los dos lados
 *  porque los dos escriben: la pantalla por acá y la instalación desde la
 *  línea de comandos. */
const LIMITES: Record<string, [number, number]> = {
  maxHR: [120, 230], lthr: [100, 210], ftp: [50, 600],
}
const POR_DEFECTO = { maxHR: 185, lthr: 165, ftp: 200 }

function validar(entrada: Record<string, unknown>) {
  const salida = { ...POR_DEFECTO }
  for (const [clave, [bajo, alto]] of Object.entries(LIMITES)) {
    const v = entrada[clave]
    if (typeof v === 'number' && Number.isFinite(v) && v >= bajo && v <= alto) {
      salida[clave as keyof typeof salida] = Math.round(v)
    }
  }
  // Un umbral por encima de la máxima rompe la fórmula del TRIMP: el
  // denominador se vuelve mayor que 1 y la intensidad sale al revés.
  if (salida.lthr >= salida.maxHR) salida.lthr = Math.round(salida.maxHR * 0.9)
  return salida
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!haySesion(req.headers.cookie)) return res.status(401).json({ error: 'sin sesión' })

  if (req.method === 'GET') {
    try {
      const r = await get(ARCHIVO, { access: 'private', useCache: false })
      if (r?.statusCode !== 200) return res.status(200).json(POR_DEFECTO)
      const texto = await new Response(r.stream as never).text()
      return res.status(200).json(validar(JSON.parse(texto)))
    } catch {
      return res.status(200).json(POR_DEFECTO)
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'usa GET o POST' })

  const cuerpo = (typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body) ?? {}
  const perfil = validar(cuerpo)
  try {
    await put(ARCHIVO, JSON.stringify(perfil, null, 1), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
    })
    return res.status(200).json(perfil)
  } catch (e) {
    return res.status(500).json({ error: (e as Error).message })
  }
}
