import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
	const isProd = mode === 'production'

	return {
		plugins: [react()],
		define: {
			// Do not expose server env to the client bundle
			'process.env': {}
		},
		build: {
			// Avoid leaking internals via source maps in production bundles
			sourcemap: false
		},
		// Configure optimizations for Vercel Analytics
		optimizeDeps: {
			include: ['@vercel/analytics/react']
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
