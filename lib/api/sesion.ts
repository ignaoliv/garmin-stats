/**
 * Sesión del panel.
 *
 * El sitio es de una sola persona, así que no hay usuarios ni base de sesiones:
 * hay una contraseña en `SITE_PASSWORD` y una cookie firmada que dice hasta
 * cuándo vale. La cookie no guarda la contraseña, guarda un vencimiento y su
 * firma; sin el secreto no se puede fabricar una.
 *
 * Esto reemplaza a la protección de despliegue de Vercel a propósito: aquella
 * bloquea TODAS las rutas, incluidas las de API, y habría que esquivarla con un
 * secreto de bypass para que el cron pueda sincronizar. Acá el HTML es público
 * —no tiene nada adentro— y lo que se protege son los datos.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'

const COOKIE = 'gs_sesion'

/** Un mes. La idea es escribir la contraseña una vez desde el teléfono. */
const DURACION_S = 30 * 24 * 60 * 60

function secreto(): string | null {
  return process.env.SITE_PASSWORD || null
}

const firmar = (dato: string, clave: string) =>
  createHmac('sha256', clave).update(dato).digest('base64url')

/** Comparación en tiempo constante: comparar con === filtra información por
 *  cuánto tarda en fallar, que es como se adivina un secreto byte a byte. */
function igual(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export function crearCookie(): string {
  const clave = secreto()
  if (!clave) throw new Error('falta SITE_PASSWORD')
  const vence = String(Date.now() + DURACION_S * 1000)
  const valor = `${vence}.${firmar(vence, clave)}`
  return [
    `${COOKIE}=${valor}`,
    'Path=/',
    'HttpOnly',
    'Secure',
    'SameSite=Lax',
    `Max-Age=${DURACION_S}`,
  ].join('; ')
}

export function cookieBorrada(): string {
  return `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

export function haySesion(cookieHeader: string | undefined): boolean {
  const clave = secreto()
  if (!clave || !cookieHeader) return false

  const cruda = cookieHeader
    .split(';')
    .map(c => c.trim())
    .find(c => c.startsWith(`${COOKIE}=`))
  if (!cruda) return false

  const [vence, firma] = cruda.slice(COOKIE.length + 1).split('.')
  if (!vence || !firma) return false
  if (!igual(firma, firmar(vence, clave))) return false
  return Number(vence) > Date.now()
}

/** ¿La contraseña que mandaron es la nuestra? */
export function contraseñaValida(intento: unknown): boolean {
  const clave = secreto()
  return typeof intento === 'string' && !!clave && igual(intento, clave)
}

/**
 * El cron no tiene cookie: se identifica con su propio secreto.
 *
 * Va aparte de la contraseña del panel para que rotar una no obligue a rotar
 * la otra, y para que el secreto que vive en una tarea automática no sea el
 * mismo que escribís vos en el teléfono.
 */
export function esElCron(authHeader: string | undefined): boolean {
  const s = process.env.CRON_SECRET
  return !!s && !!authHeader && igual(authHeader, `Bearer ${s}`)
}
