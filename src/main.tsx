import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// Leaflet ships its own stylesheet; without it the tiles stack unpositioned
// and the map renders as a broken collage.
import 'leaflet/dist/leaflet.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary.tsx'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
