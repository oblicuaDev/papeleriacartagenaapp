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
})
