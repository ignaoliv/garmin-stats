import type { VercelRequest, VercelResponse } from '@vercel/node'
import { get } from '@vercel/blob'
import { haySesion } from '../../lib/api/sesion.js'

/**
 * Sirve un archivo de datos desde el blob privado.
 *
 * El blob es privado, así que sin este intermediario no hay forma de leerlo
 * desde el navegador — y con él, sólo con sesión.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!haySesion(req.headers.cookie)) {
    return res.status(401).json({ error: 'sin sesión' })
  }

  const archivo = String(req.query.archivo ?? '')
  // Lista blanca de forma: nombre de archivo y nada más. Sin esto, un `../` o
  // una barra alcanzan para pedir cualquier otra cosa del store.
  if (!/^[a-z0-9_-]+\.json$/i.test(archivo)) {
    return res.status(400).json({ error: 'nombre inválido' })
  }

  try {
    const r = await get(`datos/${archivo}`, { access: 'private' })
    if (r?.statusCode !== 200) return res.status(404).json({ error: 'no existe' })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('X-Content-Type-Options', 'nosniff')
    // Privado y corto: son datos personales y cambian con cada sincronización.
    res.setHeader('Cache-Control', 'private, max-age=60')

    const { Readable } = await import('node:stream')
    return Readable.fromWeb(r.stream as never).pipe(res)
  } catch {
    return res.status(404).json({ error: 'no existe' })
  }
}
