import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/Repair-Record-System/' : '/',
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
            return 'firebase'
          }

          if (id.includes('/node_modules/xlsx-js-style/')) {
            return 'xlsx'
          }

          if (id.includes('/node_modules/html2canvas/')) {
            return 'html2canvas'
          }

          if (id.includes('/node_modules/jspdf/')) {
            return 'jspdf'
          }

          return undefined
        },
      },
    },
  },
}))
