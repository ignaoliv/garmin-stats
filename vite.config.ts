import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { insightsPlugin } from './vite-plugin-insights.js'

export default defineConfig({
  plugins: [tailwindcss(), react(), insightsPlugin()],
})
