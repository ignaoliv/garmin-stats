import type { VercelRequest, VercelResponse } from '@vercel/node'
import { contraseñaValida, crearCookie, cookieBorrada, haySesion } from '../lib/api/sesion'

/**
 * Entrar y salir del panel.
 *
 * GET  → dice si la sesión sigue viva, para que la app sepa si mostrar el
 *        login sin tener que pedir datos y comerse un 401.
 * POST → valida la contraseña y deja la cookie.
 * DELETE → cierra la sesión.
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === 'GET') {
    return res.status(200).json({ sesion: haySesion(req.headers.cookie) })
  }

  if (req.method === 'DELETE') {
    res.setHeader('Set-Cookie', cookieBorrada())
    return res.status(200).json({ sesion: false })
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST, DELETE')
    return res.status(405).json({ error: 'método no permitido' })
  }

  if (!process.env.SITE_PASSWORD) {
    // Sin contraseña configurada no se entra: fallar cerrado, nunca abierto.
    return res.status(500).json({ error: 'el sitio no tiene contraseña configurada' })
  }

  const cuerpo = typeof req.body === 'string' ? safeJson(req.body) : req.body
  if (!contraseñaValida(cuerpo?.password)) {
    return res.status(401).json({ error: 'contraseña incorrecta' })
  }

  res.setHeader('Set-Cookie', crearCookie())
  return res.status(200).json({ sesion: true })
}

function safeJson(s: string): { password?: unknown } | null {
  try { return JSON.parse(s) } catch { return null }
}
