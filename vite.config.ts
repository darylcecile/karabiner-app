import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
	plugins: [react()],
	root: "src/mainview",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		// Disable minification: Vite's esbuild minifier corrupts xterm.js v6's
		// pre-built ESM bundle. The `requestMode` method contains a local enum
		// compiled to `let r; ...(r||={})`. esbuild re-minifies this into
		// `(void 0||(n={}))` where `n` is never declared, causing a
		// ReferenceError at runtime when a TUI app queries terminal modes.
		minify: false,
	},
	server: {
		port: 5173,
		strictPort: true,
	},
});
