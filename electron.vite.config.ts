import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, swcPlugin } from 'electron-vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

const rootDir = dirname(fileURLToPath(import.meta.url))

export default defineConfig({
	main: {
		plugins: [swcPlugin()],
		build: {
			rollupOptions: {
				input: {
					index: resolve(rootDir, 'electron/main/index.ts'),
				},
				external: ['@xenova/transformers', '@electric-sql/pglite', 'chokidar', '@meridius-labs/apple-on-device-ai', 'just-bash'],
				treeshake: 'smallest'
			},
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "./electron"),
				"@karabiner/relay": resolve(__dirname, "./src/packages/relay")
			},
		},
	},
	preload: {
		build: {
			rollupOptions: {
				input: {
					index: resolve(rootDir, 'electron/preload/index.ts'),
				},
				treeshake: 'smallest'
			},
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "./electron"),
				"@karabiner/relay": resolve(__dirname, "./src/packages/relay")
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
					settings: resolve(rootDir, 'electron/renderer/settings.html'),
					search: resolve(rootDir, 'electron/renderer/search.html'),
					chat: resolve(rootDir, 'electron/renderer/chat.html'),
				},
				treeshake: 'smallest'
			},
		},
		resolve: {
			alias: {
				"@": resolve(__dirname, "./electron"),
				"@karabiner/relay": resolve(__dirname, "./src/packages/relay")
			},
		},
		plugins: [react(), tailwindcss() as any],
	},
})
