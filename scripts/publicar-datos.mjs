/**
 * Sube los datos de public/data a Vercel Blob, en privado.
 *
 * La carga inicial no puede correr en Vercel: son 1047 actividades y 43 MB, y
 * bajarlas de cero desde una función es pelearse con el tiempo de ejecución y
 * con el límite de peticiones de Garmin. Se hace una vez desde acá, y después
 * la sincronización diaria sube sólo lo que cambió.
 *
 * `access: 'private'` no es opcional: esto son rutas de GPS, frecuencia
 * cardíaca y sueño. Con acceso público cualquiera con la URL las lee, y las
 * URLs de Blob no son secretas.
 *
 * Uso:
 *   node scripts/publicar-datos.mjs            # todo
 *   node scripts/publicar-datos.mjs --resumen  # sólo los archivos chicos
 *   node scripts/publicar-datos.mjs --dry-run  # qué subiría, sin subir
 */
import { readFileSync } from 'node:fs'
import { readFile, readdir, stat } from 'node:fs/promises'

import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { put, list } from '@vercel/blob'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..')
const ORIGEN = join(RAIZ, 'public', 'data')
const PREFIJO = 'datos'

/** Los que necesita el panel para dibujarse. El resto son los detalles de cada
 *  actividad, que se piden de a uno cuando abrís una. */
const RESUMEN = ['activities', 'stats', 'steps', 'sleep', 'wellness', 'plan', 'eventos', 'insights']

/**
 * Los que escribe el SERVIDOR y no la sincronización. Estos nunca se suben.
 *
 * comidas.json lo escribe api/comida/guardar.ts cada vez que registrás un plato
 * desde el teléfono, así que la copia buena vive arriba y la de acá está vieja
 * o vacía. Subirla es pisar comidas reales con nada — que es exactamente lo que
 * estuvo a punto de pasar el 8 de septiembre de 2026, con tres comidas cargadas
 * arriba y el archivo local en cero.
 *
 * Si querés la copia de arriba en local, va en el otro sentido: bajala.
 */
const DEL_SERVIDOR = ['comidas.json']

/** Cuántas subidas en paralelo. Más que esto y Blob empieza a cortar. */
const EN_PARALELO = 8

function token() {
  const t = process.env.BLOB_READ_WRITE_TOKEN
  if (t) return t
  // Sin dependencias extra: leer el .env a mano alcanza y evita sumar dotenv
  // sólo para esto.
  try {
    const env = readFileSync(join(RAIZ, '.env'), 'utf8')
    const m = env.match(/^BLOB_READ_WRITE_TOKEN=(.+)$/m)
    if (m) return m[1].trim()
  } catch {}
  console.error(
    'ERROR: falta BLOB_READ_WRITE_TOKEN.\n' +
    '  Está en Vercel → Storage → tu store → .env.local, y va en el .env de\n' +
    '  este proyecto, que ya está ignorado por git.',
  )
  process.exit(1)
}


async function main() {
  const args = new Set(process.argv.slice(2))
  const soloResumen = args.has('--resumen')
  const simulacro = args.has('--dry-run')
  const TOKEN = simulacro ? 'sin-token' : token()

  const archivos = (await readdir(ORIGEN))
    .filter(f => f.endsWith('.json'))
    .filter(f => !DEL_SERVIDOR.includes(f))
    .filter(f => !soloResumen || RESUMEN.includes(f.replace(/\.json$/, '')))

  if (archivos.length === 0) {
    console.error(`ERROR: no hay .json en ${ORIGEN}. ¿Corriste fetch/sync.py?`)
    process.exit(1)
  }

  // Lo que ya está arriba, para no resubir lo que no cambió. Una carga inicial
  // interrumpida se retoma donde quedó en vez de empezar de nuevo.
  const yaEsta = new Map()
  if (!simulacro) {
    let cursor
    do {
      const página = await list({ prefix: `${PREFIJO}/`, cursor, limit: 1000, token: TOKEN })
      for (const b of página.blobs) yaEsta.set(b.pathname, b.size)
      cursor = página.hasMore ? página.cursor : undefined
    } while (cursor)
    console.log(`Ya hay ${yaEsta.size} archivos en el blob.`)
  }

  let subidos = 0, saltados = 0, bytes = 0
  const errores = []

  const subir = async nombre => {
    const ruta = join(ORIGEN, nombre)
    const destino = `${PREFIJO}/${nombre}`
    const info = await stat(ruta)

    if (yaEsta.get(destino) === info.size) { saltados++; return }

    if (simulacro) { subidos++; bytes += info.size; return }

    const cuerpo = await readFile(ruta)
    try {
      await put(destino, cuerpo, {
        access: 'private',
        contentType: 'application/json',
        // Sin sufijo al azar: la app pide `datos/steps.json` por nombre, no
        // una URL que le devolvieron.
        addRandomSuffix: false,
        allowOverwrite: true,
        token: TOKEN,
      })
      subidos++; bytes += info.size
    } catch (e) {
      errores.push(`${nombre}: ${e.message}`)
    }
  }

  console.log(
    `${simulacro ? '[simulacro] ' : ''}Publicando ${archivos.length} archivos ` +
    `en ${PREFIJO}/ como privados…`,
  )
  console.log(`  (${DEL_SERVIDOR.join(', ')} no se toca: lo escribe el servidor)`)

  const cola = [...archivos]
  await Promise.all(
    Array.from({ length: EN_PARALELO }, async () => {
      while (cola.length) {
        const n = cola.shift()
        await subir(n)
        const hechos = subidos + saltados
        if (hechos % 100 === 0) process.stdout.write(`  ${hechos}/${archivos.length}\r`)
      }
    }),
  )

  const mb = (bytes / 1024 / 1024).toFixed(1)
  console.log(`\n✔ ${subidos} subidos (${mb} MB) · ${saltados} sin cambios`)
  if (errores.length) {
    console.error(`\n⚠ ${errores.length} fallaron:`)
    for (const e of errores.slice(0, 10)) console.error('   ', e)
    process.exit(1)
  }
}

main().catch(e => { console.error(e); process.exit(1) })
