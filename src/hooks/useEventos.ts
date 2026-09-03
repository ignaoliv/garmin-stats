import { useCallback, useEffect, useMemo, useState } from 'react'

export interface Evento {
  id: string
  nombre: string
  fecha: string
  disciplina: string
  localidad: string
  provincia: string
  url: string
  imagen: string | null
  resumen: string
}

export interface Preferencias {
  disciplinas: string[]
  provincia: string | null
}

const CLAVE_PREFS = 'eventos:preferencias'
const CLAVE_VOY = 'eventos:voy'

/** Lo que hace la persona con estos datos, no lo que trae el archivo. */
const POR_DEFECTO: Preferencias = { disciplinas: ['ciclismo'], provincia: 'Buenos Aires' }

export const ETIQUETA_DISCIPLINA: Record<string, string> = {
  ciclismo: 'Ciclismo',
  running: 'Running',
  triatlon: 'Triatlón',
  duatlon: 'Duatlón',
  natacion: 'Natación',
  'aguas-abiertas': 'Aguas abiertas',
  trekking: 'Trekking',
  caminata: 'Caminata',
  'carrera-con-obstaculos': 'Con obstáculos',
  'disciplinas-combinadas': 'Combinadas',
  canicross: 'Canicross',
  dogrun: 'Dogrun',
  tetratlon: 'Tetratlón',
}

/** Hoy en la zona del navegador.
 *
 *  Con toISOString() una fecha de la tarde se va al día siguiente en UTC, que
 *  es como una cuenta regresiva termina marcando un día de menos. */
function hoyLocal(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/** Días entre hoy y la fecha del evento, contados a mediodía para que el
 *  cambio de horario de verano no coma ni agregue un día. */
export function diasHasta(fecha: string): number {
  const [a, m, d] = fecha.split('-').map(Number)
  const evento = new Date(a, m - 1, d, 12)
  const hoy = new Date()
  hoy.setHours(12, 0, 0, 0)
  return Math.round((evento.getTime() - hoy.getTime()) / 86_400_000)
}

export function cuentaRegresiva(fecha: string): string {
  const d = diasHasta(fecha)
  if (d < 0) return 'ya pasó'
  if (d === 0) return 'es hoy'
  if (d === 1) return 'mañana'
  if (d < 14) return `en ${d} días`
  const semanas = Math.round(d / 7)
  if (d < 60) return `en ${semanas} semanas`
  return `en ${Math.round(d / 30)} meses`
}

function leer<T>(clave: string, porDefecto: T): T {
  try {
    const crudo = localStorage.getItem(clave)
    return crudo ? { ...porDefecto, ...JSON.parse(crudo) } : porDefecto
  } catch {
    // Ventana privada, almacenamiento bloqueado: se sigue con lo de fábrica.
    return porDefecto
  }
}

function guardar(clave: string, valor: unknown): void {
  try {
    localStorage.setItem(clave, JSON.stringify(valor))
  } catch {
    // Que no se pueda recordar la preferencia no es motivo para romper la vista.
  }
}

export function useEventos() {
  const [todos, setTodos] = useState<Evento[]>([])
  const [actualizado, setActualizado] = useState<string | null>(null)
  const [cargando, setCargando] = useState(true)
  const [prefs, setPrefs] = useState<Preferencias>(() => leer(CLAVE_PREFS, POR_DEFECTO))
  const [voy, setVoy] = useState<string[]>(() => {
    try {
      const crudo = localStorage.getItem(CLAVE_VOY)
      return crudo ? JSON.parse(crudo) : []
    } catch {
      return []
    }
  })

  useEffect(() => {
    let cancelado = false
    fetch('/data/eventos.json')
      .then(r => (r.ok && r.headers.get('content-type')?.includes('json') ? r.json() : null))
      .then(d => {
        if (cancelado || !d) return
        setTodos(d.eventos ?? [])
        setActualizado(d.actualizado ?? null)
      })
      .catch(() => {})
      .finally(() => { if (!cancelado) setCargando(false) })
    return () => { cancelado = true }
  }, [])

  const actualizarPrefs = useCallback((cambio: Partial<Preferencias>) => {
    setPrefs(p => {
      const nuevo = { ...p, ...cambio }
      guardar(CLAVE_PREFS, nuevo)
      return nuevo
    })
  }, [])

  const alternarVoy = useCallback((id: string) => {
    setVoy(v => {
      const nuevo = v.includes(id) ? v.filter(x => x !== id) : [...v, id]
      guardar(CLAVE_VOY, nuevo)
      return nuevo
    })
  }, [])

  const hoy = hoyLocal()

  const proximos = useMemo(
    () => todos.filter(e => e.fecha >= hoy).sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [todos, hoy],
  )

  const filtrados = useMemo(() => proximos.filter(e =>
    (prefs.disciplinas.length === 0 || prefs.disciplinas.includes(e.disciplina)) &&
    (!prefs.provincia || e.provincia === prefs.provincia),
  ), [proximos, prefs])

  /** Los que marcó, aunque no entren en el filtro actual: anotarse a una
   *  carrera pesa más que la disciplina que esté mirando en este momento. */
  const mios = useMemo(
    () => proximos.filter(e => voy.includes(e.id)),
    [proximos, voy],
  )

  const disciplinasDisponibles = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const e of proximos) cuenta.set(e.disciplina, (cuenta.get(e.disciplina) ?? 0) + 1)
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [proximos])

  const provinciasDisponibles = useMemo(() => {
    const cuenta = new Map<string, number>()
    for (const e of proximos) {
      if (prefs.disciplinas.length && !prefs.disciplinas.includes(e.disciplina)) continue
      cuenta.set(e.provincia, (cuenta.get(e.provincia) ?? 0) + 1)
    }
    return [...cuenta.entries()].sort((a, b) => b[1] - a[1])
  }, [proximos, prefs.disciplinas])

  return {
    cargando, actualizado, proximos, filtrados, mios, voy,
    prefs, actualizarPrefs, alternarVoy,
    disciplinasDisponibles, provinciasDisponibles,
    total: todos.length,
  }
}
