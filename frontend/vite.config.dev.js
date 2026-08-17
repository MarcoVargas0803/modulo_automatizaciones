import { defineConfig, mergeConfig } from 'vite'
import baseConfig from './vite.config.js'

export default defineConfig(mergeConfig(baseConfig, {
  server: {
    watch: {
      usePolling: true,
      interval: 500,
    },
    hmr: {
      clientPort: 5173
    },
  },
}))