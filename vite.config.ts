import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  plugins: [react()],
  build: {
    // xlsx-js-style 僅在使用者匯出 Excel 時動態載入；其單一套件檔案約 863 kB，
    // 不屬於首屏資源，因此將警告門檻設在略高於該已知的延遲載入 chunk。
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/node_modules/@firebase/firestore/')) {
            return 'firebase-firestore'
          }

          if (id.includes('/node_modules/@firebase/auth/')) {
            return 'firebase-auth'
          }

          if (id.includes('/node_modules/@firebase/functions/')) {
            return 'firebase-functions'
          }

          if (id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/')) {
            return 'firebase-core'
          }

          return undefined
        },
      },
    },
  },
})
