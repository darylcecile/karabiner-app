import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, swcPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	main: {
		plugins: [swcPlugin()],
		build: {
			rollupOptions: {
				input: {
					index: resolve(rootDir, 'electron/main/index.ts'),
				},
			},
		},
	},
	preload: {
		build: {
			rollupOptions: {
				input: {
					index: resolve(rootDir, 'electron/preload/index.ts'),
				},
			},
		},
	},
	renderer: {
		root: resolve(rootDir, 'electron/renderer'),
		server: {
			host: '127.0.0.1',
			port: 5173,
		},
		build: {
			rollupOptions: {
				input: {
					index: resolve(rootDir, 'electron/renderer/index.html'),
				},
			},
		},
		plugins: [tailwindcss() as any],
	},
})
