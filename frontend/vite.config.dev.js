import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

export default defineConfig(mergeConfig(baseConfig, {
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
    hmr: {
      // El puerto al que se conecta el websocket de HMR desde el navegador es el
      // PUBLICADO por Docker, no el del contenedor. Coinciden mientras el mapeo
      // sea 5173:5173; cuando hay que publicar en otro puerto —convivir con el
      // entorno dev de `modulo-reportes`, que ya ocupa 5173— el cliente seguiria
      // llamando al 5173 del host, es decir, al Vite del OTRO proyecto.
      clientPort: Number(process.env.VITE_HMR_CLIENT_PORT) || 5173
    },
  },
}))