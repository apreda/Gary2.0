import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
  build: {
    // Admin pages pull in heavy backend services — accepted for now,
    // but they're code-split so regular users never download them.
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks: {
          // Isolate heavy backend services into an admin-only chunk
          // so they're never loaded on the public-facing pages
          'admin-services': [
            './src/services/ballDontLieService.js',
            './src/services/oddsService.js',
            './src/services/openaiService.js',
            './src/services/picksService.js',
            './src/services/resultsCheckerService.js',
            './src/services/garyPerformanceService.js',
            './src/services/propResultsService.js',
          ],
        },
      },
    },
  },
})
