import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Le client importe la logique/les types partagés via "@shared/...".
      '@shared': fileURLToPath(new URL('../shared', import.meta.url)),
    },
  },
  server: {
    // Autorise le dev server à servir le dossier shared/ (hors de client/).
    fs: { allow: ['..'] },
  },
})
