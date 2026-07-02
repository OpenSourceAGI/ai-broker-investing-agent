import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('recharts')) return 'vendor-recharts'
            if (id.includes('lucide-react')) return 'vendor-icons'
          }
          return undefined
        },
      },
    },
  },
  // Dev UI port 3000; API is separate (default http://localhost:8000 via VITE_API_BASE_URL in frontend/.env).
  server: { port: 3000 },
})
