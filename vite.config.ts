import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  root: "src/mainview",
  build: {
    outDir: "../../dist",
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks: {
          editor: ["@blocknote/core", "@blocknote/react"],
          tree: ["@pierre/trees", "@pierre/trees/react"],
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
