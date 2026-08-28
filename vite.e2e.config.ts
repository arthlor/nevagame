import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { runtimeAssetCatalogPlugin } from "./tools/vite/runtimeAssetCatalogPlugin";

// Stable acceptance-run config: keep the development debug harness and public
// assets, but do not watch the repository's actively edited Vite config.
export default defineConfig({
  plugins: [runtimeAssetCatalogPlugin(process.cwd()), react()],
  resolve: {
    alias: {
      "@": path.resolve(process.cwd(), "./src")
    }
  },
  server: {
    host: "127.0.0.1",
    port: 3313,
    watch: {
      // Other workspace agents may continue editing renderer files while the
      // long acceptance route is running. The route must observe one loaded
      // build, so do not let those edits trigger a session-resetting HMR.
      ignored: [
        "**/src/**",
        "**/tools/**",
        "**/assets/**",
        "**/public/assets/**",
        "**/output/**",
        "**/test-results/**",
        "**/vite.config.ts",
        "**/vite.e2e.config.ts"
      ]
    }
  },
  build: {
    target: "es2022"
  }
});
