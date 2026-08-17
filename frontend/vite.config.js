import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

const projectRoot = fileURLToPath(new URL('.', import.meta.url))

export default defineConfig({
  root: projectRoot,
  plugins: [react()],
  resolve: {
    // Alias del núcleo: '@' apunta a src/. Permite imports estables entre
    // módulos (@/shared/..., @/modules/...) sin cadenas de '../../..'.
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    host: true,
    proxy: {
      '/api': {
        target: process.env.VITE_API_TARGET || 'http://localhost:3001',
        changeOrigin: true,
      },
      // Ningún módulo de este portal sube archivos, así que no hay proxy de
      // '/uploads'. Si vuelve uno que suba (evidencias, comprobantes), hay que
      // añadirlo aquí además del bloque de Express en backend/src/app.js: sin
      // él, el dev server devuelve el index.html de la SPA en vez del archivo.
    }
  }
})
