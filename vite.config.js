import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // Redirige /api/v1/* al backend Node.js local
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      // Redirige uploads al backend local
      '/uploads': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    // Separa dependencias pesadas en chunks dedicados para que el bundle
    // principal no exceda 500KB. Las paginas siguen siendo eager-loaded
    // (no introducimos React.lazy aun) para no romper navegacion existente.
    // TODO: cuando se aplique code splitting por ruta usar React.lazy en App.jsx.
    chunkSizeWarningLimit: 700,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          'charts': ['recharts'],
          'xlsx': ['xlsx'],
          'icons': ['lucide-react'],
        },
      },
    },
  },
})
