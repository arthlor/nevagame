import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

import { runtimeAssetCatalogPlugin } from "./tools/vite/runtimeAssetCatalogPlugin";
import { artYardPlugin } from "./tools/vite/artYardPlugin";

export default defineConfig({
  plugins: [runtimeAssetCatalogPlugin(__dirname), artYardPlugin(__dirname), react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src")
    }
  },
  server: {
    port: 3000,
    host: true,
    // Browser tests and the catalog pipeline write evidence beside the source
    // tree. Those artifacts are not runtime modules and must not trigger a
    // full-page reload in the middle of held-key or commit-marker flows.
    watch: {
      ignored: [
        "**/generated/**",
        "**/output/**",
        "**/test-results/**",
        "**/tests/visual/**",
        "**/public/assets/**"
      ]
    }
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/three")) return "three";
          if (id.includes("@dimforge/rapier3d-compat")) return "rapier";
          if (id.includes("node_modules/react")) return "react";
        }
      }
    }
  }
});
