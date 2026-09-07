/**
 * Las acciones que necesitan servidor: sincronizar, generar análisis, mandar
 * entrenamientos al reloj.
 *
 * Hoy viven en el plugin del servidor de desarrollo, o sea que existen sólo
 * cuando corrés `npm run dev`. Desplegado no existen todavía, y Vercel contesta
 * su página de 404 en HTML — que la app intentaba parsear como JSON y devolvía
 * "Unexpected token 'T', \"The page c\"…", un error que no le dice nada a nadie.
 *
 * Todo pasa por acá para que la respuesta a "esto no está disponible acá" se
 * escriba una sola vez y suene igual en todos lados.
 */

/** ¿Estamos corriendo contra los archivos locales o contra la API desplegada? */
const desplegado = (import.meta.env.VITE_DATOS_BASE as string | undefined)?.startsWith('/api') ?? false

export class AccionNoDisponible extends Error {
  constructor() {
    super(
      'Esta acción todavía no está disponible en la versión publicada: ' +
      'por ahora corre sólo en tu computadora con `npm run dev`.',
    )
    this.name = 'AccionNoDisponible'
  }
}

/** Las acciones de servidor no existen desplegadas, y conviene saberlo antes
 *  de apretar el botón y no después de un error críptico. */
export const accionesDisponibles = !desplegado

async function leerRespuesta(r: Response): Promise<Record<string, unknown>> {
  // Un 404 de Vercel llega como HTML. Mirar el content-type antes de parsear
  // convierte un error incomprensible en una frase.
  if (!r.headers.get('content-type')?.includes('json')) {
    if (r.status === 404) throw new AccionNoDisponible()
    throw new Error(`El servidor respondió ${r.status} sin JSON.`)
  }
  const cuerpo = await r.json()
  if (!r.ok || cuerpo?.error) throw new Error(cuerpo?.error || `HTTP ${r.status}`)
  return cuerpo
}

export async function pedir(ruta: string): Promise<Record<string, unknown>> {
  if (desplegado) throw new AccionNoDisponible()
  return leerRespuesta(await fetch(ruta))
}

export async function enviar(ruta: string, cuerpo: unknown): Promise<Record<string, unknown>> {
  if (desplegado) throw new AccionNoDisponible()
  return leerRespuesta(await fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(cuerpo),
  }))
}
