import { useEffect, useRef, useState } from 'react'
import type { Map as LeafletMap, Polyline, CircleMarker } from 'leaflet'

interface Props {
  coords: [number, number][]
  /** Pixel height, or a CSS length like '100%' to fill a flex parent. */
  height?: number | string
  /** Route colour. Defaults to the app's "tech green". */
  color?: string
}

export const ROUTE_GREEN = '#00e676'

/**
 * Basemap source.
 *
 * Strava's map credits "© OpenMapTiles © OpenStreetMap" — OpenMapTiles data
 * with a custom dark style. That source needs an API key, so when
 * VITE_MAPTILER_KEY is present we use the very same OpenMapTiles data through
 * MapTiler; otherwise we fall back to the plain OSM raster, darkened by the CSS
 * filter in index.css. Every keyless "minimal" basemap (CARTO, Esri, the OSM
 * mirrors) now serves a placeholder tile instead of map data.
 */
const MAPTILER_KEY = import.meta.env.VITE_MAPTILER_KEY as string | undefined

const TILES = MAPTILER_KEY
  ? {
      // streets-v2-dark is the closest match to Strava's own style: dark blue
      // ground, blue water, legible street grid.
      url: `https://api.maptiler.com/maps/streets-v2-dark/{z}/{x}/{y}.png?key=${MAPTILER_KEY}`,
      attribution: '© MapTiler © OpenMapTiles © OpenStreetMap',
      filtered: false,
      // MapTiler serves 512px rasters; pairing that with zoomOffset -1 keeps
      // labels crisp instead of upscaled.
      tileSize: 512,
      zoomOffset: -1,
    }
  : {
      url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
      attribution: '© OpenStreetMap',
      filtered: true,
      tileSize: 256,
      zoomOffset: 0,
    }

const DRAW_MS = 2600

export default function ActivityMap({ coords, height = 420, color = ROUTE_GREEN }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<LeafletMap | null>(null)
  const routeRef = useRef<Polyline | null>(null)
  const riderRef = useRef<CircleMarker | null>(null)
  const rafRef = useRef<number | null>(null)
  const safetyRef = useRef<number | null>(null)
  const revealRef = useRef<(() => void) | null>(null)
  const [replayKey, setReplayKey] = useState(0)

  useEffect(() => {
    if (!containerRef.current || coords.length === 0) return
    let disposed = false

    import('leaflet').then((L) => {
      if (disposed || !containerRef.current) return

      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }

      const map = L.map(containerRef.current, {
        zoomControl: true,
        scrollWheelZoom: false,
        attributionControl: true,
      })

      const layer = L.tileLayer(TILES.url, {
        maxZoom: 19,
        attribution: TILES.attribution,
        tileSize: TILES.tileSize,
        zoomOffset: TILES.zoomOffset,
      })
      layer.addTo(map)
      // Only the raw OSM raster needs darkening; a styled dark basemap must not
      // be inverted on top of its own styling.
      map.getContainer().classList.toggle('map-filtered', TILES.filtered)

      // Casing under the route keeps it legible over both dark and light tiles.
      L.polyline(coords, { color: '#04140c', weight: 8, opacity: 0.5 }).addTo(map)
      const route = L.polyline(coords, { color, weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round' })
      route.addTo(map)
      routeRef.current = route

      const frame = () => map.fitBounds(route.getBounds(), { padding: [26, 26] })
      frame()

      const pin = (at: [number, number], fill: string, label: string) =>
        L.circleMarker(at, { radius: 6.5, color: '#ffffff', fillColor: fill, fillOpacity: 1, weight: 2.5 })
          .addTo(map)
          .bindTooltip(label, { direction: 'top' })

      pin(coords[0], '#16a34a', 'Inicio')
      pin(coords[coords.length - 1], '#dc2626', 'Final')

      const rider = L.circleMarker(coords[0], {
        radius: 7,
        color: '#ffffff',
        fillColor: color,
        fillOpacity: 1,
        weight: 2.5,
      })
      riderRef.current = rider

      mapRef.current = map

      // Leaflet measures the container before the card finishes laying out, so
      // re-measure and re-frame; fitting against a stale size left the route
      // off-screen entirely.
      const settle = () => {
        if (disposed || mapRef.current !== map) return
        map.invalidateSize()
        frame()
      }
      setTimeout(settle, 80)
      const ro = new ResizeObserver(settle)
      ro.observe(containerRef.current)

      // ── Draw-in animation ────────────────────────────────────────────────
      const path = route.getElement() as SVGPathElement | null
      const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches

      const reveal = () => {
        if (!path) return
        path.style.strokeDasharray = ''
        path.style.strokeDashoffset = ''
        if (map.hasLayer(rider)) map.removeLayer(rider)
      }
      revealRef.current = reveal

      // requestAnimationFrame does not fire while the document is hidden. Hiding
      // the route first and relying on rAF to reveal it left the map blank
      // whenever the page started in a background tab, so only animate when the
      // page is actually visible — and keep a timer as a backstop, since timers
      // fire (throttled) even when rAF does not.
      if (path && !reduced && !document.hidden) {
        const len = path.getTotalLength()
        path.style.strokeDasharray = `${len}`
        path.style.strokeDashoffset = `${len}`
        rider.addTo(map)

        const started = performance.now()
        const tick = (now: number) => {
          if (disposed || mapRef.current !== map) return
          // easeOutCubic: quick out of the gate, settles at the finish.
          const raw = Math.min((now - started) / DRAW_MS, 1)
          const t = 1 - Math.pow(1 - raw, 3)
          path.style.strokeDashoffset = `${len * (1 - t)}`
          // Guard the lookup: a NaN or out-of-range index hands Leaflet
          // undefined and it throws reading .lat mid-animation.
          const idx = Math.max(0, Math.min(Math.round(t * (coords.length - 1)), coords.length - 1))
          const at = coords[idx]
          if (at) rider.setLatLng(at)
          if (raw < 1) rafRef.current = requestAnimationFrame(tick)
          else reveal()
        }
        rafRef.current = requestAnimationFrame(tick)
        safetyRef.current = window.setTimeout(() => {
          if (!disposed && mapRef.current === map) reveal()
        }, DRAW_MS + 800)
      }

      return () => ro.disconnect()
    })

    return () => {
      disposed = true
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      if (safetyRef.current) clearTimeout(safetyRef.current)
      rafRef.current = null
      safetyRef.current = null
      revealRef.current = null
      riderRef.current = null
      routeRef.current = null
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
    }
  }, [coords, color, replayKey])

  if (coords.length === 0) {
    return (
      <div
        className="rounded-xl bg-surface-sunk border border-surface-line flex items-center justify-center text-ink-muted text-[14px]"
        style={{ height }}
      >
        Esta actividad no tiene recorrido GPS
      </div>
    )
  }

  return (
    <div className="relative h-full">
      <div
        ref={containerRef}
        className="rounded-xl overflow-hidden border border-surface-line w-full h-full"
        style={{ height }}
      />
      <button
        onClick={() => setReplayKey(k => k + 1)}
        className="absolute top-3 right-3 z-[500] px-3 py-1.5 rounded-lg text-[13px] font-medium
                   bg-surface-base/90 border border-surface-line text-ink-secondary
                   hover:text-ink-primary hover:border-surface-line-strong transition-colors"
        title="Volver a reproducir el recorrido"
      >
        ▶ Reproducir
      </button>
    </div>
  )
}
