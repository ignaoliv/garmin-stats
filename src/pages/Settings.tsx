import { useActivityStore } from '../stores/activityStore'
import type { UserSettings } from '../types/garmin'

export default function Settings() {
  const settings = useActivityStore(s => s.settings)
  const updateSettings = useActivityStore(s => s.updateSettings)

  function set<K extends keyof UserSettings>(key: K, value: UserSettings[K]) {
    updateSettings({ [key]: value })
  }

  return (
    <div className="flex-1 p-6 overflow-y-auto page-in max-w-xl">
      <h1 className="text-xl font-bold text-ink-primary mb-1">Ajustes</h1>
      <p className="text-[14px] text-ink-muted mb-8">Parámetros fisiológicos para los cálculos de zonas y TSS.</p>

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

      <div className="mt-8 p-4 bg-surface-card border border-surface-line rounded-xl text-[13px] text-ink-muted space-y-1">
        <p>Los ajustes se guardan localmente en tu navegador (localStorage).</p>
        <p>Cambiarlos afecta retroactivamente a todos los cálculos de CTL/ATL/TSB y zonas.</p>
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
