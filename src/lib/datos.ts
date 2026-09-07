/**
 * De dónde salen los datos.
 *
 * Local, salen de archivos estáticos en `public/data/`. Desplegado no pueden
 * salir de ahí: el repositorio es público y esto son rutas de GPS, frecuencia
 * cardíaca y sueño. En Vercel viven en un blob privado y se leen a través de
 * `/api/datos/…`, que valida la sesión antes de devolver nada.
 *
 * La diferencia entre un caso y el otro es una variable de entorno. Todo el
 * resto de la aplicación pide los datos por nombre y no se entera.
 */

const BASE = (import.meta.env.VITE_DATOS_BASE as string | undefined)?.replace(/\/$/, '') ?? '/data'

/** Archivos de datos que publica la sincronización. */
export type Archivo =
  | 'activities'
  | 'stats'
  | 'steps'
  | 'sleep'
  | 'wellness'
  | 'plan'
  | 'eventos'
  | 'insights'

export const rutaDe = (nombre: string) => `${BASE}/${nombre}.json`

/**
 * Lee un archivo de datos, o devuelve null si todavía no existe.
 *
 * El chequeo de content-type no es paranoia: ante un archivo que falta, el
 * servidor de desarrollo responde el index.html con un 200, y sin esto la
 * aplicación intenta parsear HTML como JSON y revienta con un error que no
 * dice nada.
 */
export async function leer<T = unknown>(nombre: string): Promise<T | null> {
  try {
    const r = await fetch(rutaDe(nombre), { credentials: 'same-origin' })
    if (!r.ok) return null
    if (!r.headers.get('content-type')?.includes('json')) return null
    return (await r.json()) as T
  } catch {
    // Sin red, o el archivo no está: quien llama decide qué mostrar.
    return null
  }
}

/**
 * Igual que `leer`, pero distingue "no está" de "falló".
 *
 * La lista de actividades es la única lectura donde la diferencia importa: sin
 * ella no hay nada que dibujar y hay que decir por qué.
 */
export async function leerOFallar<T = unknown>(nombre: string): Promise<T> {
  const r = await fetch(rutaDe(nombre), { credentials: 'same-origin' })
  if (!r.ok) throw new Error(`No se encontró ${rutaDe(nombre)} (estado ${r.status})`)
  return (await r.json()) as T
}
