import { useEffect, useState } from 'react'
import { useActivityStore } from '../stores/activityStore'
import type { UserSettings } from '../types/garmin'
import { enviar, pedir } from '../lib/acciones'
import { Insight, explicarError } from '../components/ui'

/**
 * Los parámetros fisiológicos.
 *
 * Hasta ahora esta pantalla mentía. Guardaba los valores en el navegador, pero
 * el TSS de cada actividad lo calcula la sincronización con SU propia copia —y
 * estaba clavada en 185 y 165, que venían del repositorio original, o sea de
 * otra persona—. El navegador respeta el TSS ya calculado, así que cambiar acá
 * la FC máxima no movía absolutamente nada en el 98% de las actividades.
 *
 * Ahora se guardan del lado del servidor, donde la sincronización los lee. Lo
 * que se muestra en pantalla no cambia solo: hay que volver a calcular la carga
 * del historial, y eso la pantalla lo dice en vez de fingir que ya está.
 */
export default function Settings() {
  const settings = useActivityStore(s => s.settings)
  const updateSettings = useActivityStore(s => s.updateSettings)

  const [estado, setEstado] = useState<'idle' | 'guardando' | 'guardado' | 'error'>('idle')
  const [mensaje, setMensaje] = useState('')

  // Lo que tiene el servidor manda sobre lo que quedó en este navegador: es lo
  // que de verdad se usó para calcular los números que estás viendo.
  useEffect(() => {
    pedir('/api/perfil')
      .then(p => updateSettings({
        maxHR: Number(p.maxHR) || settings.maxHR,
        lthrRunning: Number(p.lthr) || settings.lthrRunning,
        ftp: Number(p.ftp) || settings.ftp,
      }))
      .catch(() => { /* sin sesión o sin servidor: quedan los del navegador */ })
    // Sólo al montar: después manda lo que edita la persona.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    updateSettings({ [key]: value })
    setEstado('idle')
  }

  const guardar = async () => {
    setEstado('guardando'); setMensaje('')
    try {
      await enviar('/api/perfil', {
        maxHR: settings.maxHR,
        lthr: settings.lthrRunning,
        ftp: settings.ftp,
      })
      setEstado('guardado')
    } catch (e) {
      setEstado('error'); setMensaje(explicarError(e))
    }
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto page-in max-w-xl">
      <h1 className="text-xl font-bold text-ink-primary mb-1">Ajustes</h1>
      <p className="text-[14px] text-ink-muted mb-5">
        Parámetros fisiológicos. De acá salen las zonas de frecuencia cardíaca y la
        carga de cada sesión, y de esa carga salen el fitness, la fatiga, el estado
        de forma y la preparación del día.
      </p>

      <div className="mb-8">
        <Insight tone="neutral">
          La FC máxima es la que más pesa: el mismo esfuerzo a 150 ppm cuenta un 35%
          más si tu máxima es 170 que si es 185. Si no la sabés, usá la más alta que
          hayas visto en un esfuerzo duro; la fórmula por edad se equivoca seguido.
        </Insight>
      </div>

      <div className="space-y-6">
        <Field
          label="FC Máxima"
          unit="bpm"
          value={settings.maxHR}
          min={140}
          max={220}
          onChange={v => set('maxHR', v)}
          hint="Usada para calcular las zonas de FC (Z1-Z5)."
        />

        <Field
          label="FTP (Functional Threshold Power)"
          unit="W"
          value={settings.ftp}
          min={100}
          max={500}
          onChange={v => set('ftp', v)}
          hint="Potencia que puedes mantener ~1h. Para ciclismo."
        />

        <Field
          label="FC en Umbral Láctico (Running)"
          unit="bpm"
          value={settings.lthrRunning}
          min={120}
          max={200}
          onChange={v => set('lthrRunning', v)}
          hint="FC aproximada en tu umbral láctico corriendo. Suele ser el 87-93% de FCmax."
        />

        <div>
          <label className="block text-[14px] text-ink-secondary mb-1">
            Ritmo en Umbral (Running)
          </label>
          <div className="flex items-center gap-2">
            <input
              type="number"
              value={Math.floor(settings.thresholdPace / 60)}
              min={3}
              max={8}
              onChange={e => set('thresholdPace', Number(e.target.value) * 60 + (settings.thresholdPace % 60))}
              className="w-20 bg-surface-card border border-surface-line rounded-lg px-3 py-2 text-[14px] text-ink-primary"
            />
            <span className="text-ink-muted">min</span>
            <input
              type="number"
              value={settings.thresholdPace % 60}
              min={0}
              max={59}
              onChange={e => set('thresholdPace', Math.floor(settings.thresholdPace / 60) * 60 + Number(e.target.value))}
              className="w-20 bg-surface-card border border-surface-line rounded-lg px-3 py-2 text-[14px] text-ink-primary"
            />
            <span className="text-ink-muted">seg /km</span>
          </div>
          <p className="text-[13px] text-ink-muted mt-1">Tu ritmo en umbral láctico corriendo. Usado para calcular TSS de running.</p>
        </div>
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          onClick={guardar}
          disabled={estado === 'guardando'}
          className="px-5 py-2.5 rounded-xl bg-accent text-white text-[15px] font-semibold
                     hover:bg-accent-soft disabled:opacity-50"
        >
          {estado === 'guardando' ? 'Guardando…' : 'Guardar'}
        </button>
        {estado === 'guardado' && (
          <span className="text-[14px] text-state-good">Guardado</span>
        )}
        {estado === 'error' && (
          <span className="text-[14px] text-state-warning">{mensaje}</span>
        )}
      </div>

      {/* El pie de antes decía que cambiar esto afectaba "retroactivamente" a
          los cálculos de CTL/ATL/TSB. No era cierto: la carga de cada sesión ya
          está calculada en el archivo y el navegador la respeta tal cual. Decir
          lo que realmente pasa es más útil que prometer de más. */}
      <div className="mt-6 p-4 bg-surface-card border border-surface-line rounded-xl
                      text-[13px] text-ink-muted space-y-2">
        <p className="text-ink-secondary">Qué cambia y cuándo</p>
        <p>
          <strong className="text-ink-secondary">Las zonas de frecuencia cardíaca</strong> se
          recalculan al instante: se dibujan en el navegador con estos valores.
        </p>
        <p>
          <strong className="text-ink-secondary">La carga de cada sesión</strong> no. Está
          calculada dentro de los datos, sesión por sesión, a partir del pulso
          segundo a segundo — y por eso es mejor que una estimación por promedio.
          Las sesiones nuevas van a usar estos valores desde la próxima
          sincronización; para rehacer el historial hay que volver a procesarlo
          desde tu computadora con <code className="text-ink-secondary">python3 fetch/enrich.py</code> y
          publicar los datos de nuevo.
        </p>
      </div>
    </div>
  )
}

function Field({
  label, unit, value, min, max, onChange, hint
}: {
  label: string
  unit: string
  value: number
  min: number
  max: number
  onChange: (v: number) => void
  hint?: string
}) {
  return (
    <div>
      <label className="block text-[14px] text-ink-secondary mb-1">{label}</label>
      <div className="flex items-center gap-3">
        <input
          type="number"
          value={value}
          min={min}
          max={max}
          onChange={e => onChange(Number(e.target.value))}
          className="w-28 bg-surface-card border border-surface-line rounded-lg px-3 py-2 text-[14px] text-ink-primary"
        />
        <span className="text-ink-muted text-[14px]">{unit}</span>
        <input
          type="range"
          min={min}
          max={max}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          className="flex-1 accent-blue-500"
        />
      </div>
      {hint && <p className="text-[13px] text-ink-muted mt-1">{hint}</p>}
    </div>
  )
}
