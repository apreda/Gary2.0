import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Load env file based on `mode` in the current directory.
  // Set the third parameter to '' to load all env regardless of the `VITE_` prefix.
  const env = loadEnv(mode, process.cwd(), '')
  
  // Expose process.env as import.meta.env in JS
  const processEnvValues = {
    'process.env': Object.entries(env).reduce(
      (prev, [key, val]) => {
        return {
          ...prev,
          [key]: val,
        }
      },
      {},
    )
  }

  return {
    plugins: [react()],
    define: processEnvValues,
    build: {
      sourcemap: true
    },
    optimizeDeps: {
      exclude: ['@vercel/analytics/react']
    },
    // Explicitly declare external packages that shouldn't be processed
    ssr: {
      external: ['@vercel/analytics/react']
    },
    css: {
      postcss: {
        plugins: [
          tailwindcss,
          autoprefixer,
        ],
      },
    },
  }
})
