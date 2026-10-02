import path from "node:path";
import fs from "node:fs";

import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

import { runtimeAssetCatalogPlugin } from "./tools/vite/runtimeAssetCatalogPlugin.ts";
import { artYardPlugin } from "./tools/vite/artYardPlugin.ts";
import { layoutEditorPlugin } from "./tools/vite/layoutEditorPlugin.ts";
import { productionArtifactsPlugin } from "./tools/vite/productionArtifactsPlugin.ts";
import { environmentLayoutBakePlugin } from "./tools/vite/environmentLayoutBakePlugin.ts";

/** Serve `/assets/audio/*.mp3` from disk so ingest during a running Vite session is audible. */
function runtimeAudioPlugin(rootDirectory: string): Plugin {
  return {
    name: "neva-runtime-audio",
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const match = request.url?.match(/^\/assets\/audio\/([a-z0-9-]+\.mp3)(?:\?.*)?$/);
        if (!match) {
          next();
          return;
        }
        const file = path.resolve(rootDirectory, "public/assets/audio", match[1]);
        if (!fs.existsSync(file)) {
          next();
          return;
        }
        response.statusCode = 200;
        response.setHeader("Content-Type", "audio/mpeg");
        response.setHeader("Cache-Control", "no-cache");
        fs.createReadStream(file).pipe(response);
      });
    }
  };
}

export default defineConfig({
  plugins: [
    productionArtifactsPlugin(),
    runtimeAudioPlugin(import.meta.dirname),
    runtimeAssetCatalogPlugin(import.meta.dirname),
    environmentLayoutBakePlugin(import.meta.dirname),
    artYardPlugin(import.meta.dirname),
    layoutEditorPlugin(import.meta.dirname),
    react()
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src")
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
        "**/public/assets/**",
        "**/assets/audio/licenses/**"
      ]
    }
  },
  build: {
    target: "es2022",
    assetsInlineLimit: 4096,
    chunkSizeWarningLimit: 1500,
    rolldownOptions: {
      input: {
        main: path.resolve(import.meta.dirname, "index.html"),
        artYard: path.resolve(import.meta.dirname, "tools/art-yard/viewer.html")
      },
      output: {
        codeSplitting: {
          includeDependenciesRecursively: false,
          groups: [
            { name: "three-nodes", test: /node_modules[\\/]three[\\/](?:build[\\/]three\.(?:webgpu|tsl)|examples[\\/]jsm[\\/]tsl[\\/])/ },
            { name: "three", test: /node_modules[\\/]three[\\/]/ },
            { name: "rapier", test: /@dimforge[\\/]rapier3d/ },
            { name: "react", test: /node_modules[\\/](react|react-dom|scheduler)[\\/]/ }
          ]
        }
      }
    }
  }
});
