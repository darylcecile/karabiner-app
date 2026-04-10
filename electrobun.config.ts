import type { ElectrobunConfig } from "electrobun";

export default {
  app: {
    name: "Karabiner",
    identifier: "app.karabiner.dev",
    version: "0.1.0",
  },
  build: {
    copy: {
      "dist/index.html": "views/mainview/index.html",
      "dist/assets": "views/mainview/assets",
      "node_modules/@electric-sql/pglite/dist/vector.tar.gz": "vector.tar.gz",
      "node_modules/@electric-sql/pglite/dist/pglite.data": "bun/pglite.data",
      "node_modules/@electric-sql/pglite/dist/pglite.wasm": "bun/pglite.wasm",
      "node_modules/@electric-sql/pglite/dist/initdb.wasm": "bun/initdb.wasm",
      "node_modules/@electric-sql/pglite/dist/initdb.js": "bun/initdb.js",
      "registry.karabiner.json": "bun/registry.karabiner.json",
      "extensions": "bun/official-extensions",
    },
    watchIgnore: ["dist/**"],
    mac: {
      bundleCEF: false,
    },
    linux: {
      bundleCEF: false,
    },
    win: {
      bundleCEF: false,
    },
  },
} satisfies ElectrobunConfig;
