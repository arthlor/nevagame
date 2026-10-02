import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import { runtimeAssetCatalogPlugin } from "../vite/runtimeAssetCatalogPlugin";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// The normal runtime catalog derives from the current catalog and published files.
// Do not use a frozen extraction bundle or a second asset catalog here.
export default defineConfig({
  root,
  plugins: [runtimeAssetCatalogPlugin(root)],
  resolve: { alias: { "@": path.join(root, "src") } }
});
