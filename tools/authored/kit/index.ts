/**
 * Neva's authored asset kit: everything a Three.js asset generator builds with.
 *
 * Generators live in `tools/authored/generators/` and are registered by catalog generator name;
 * the art pipeline (`npm run art:generate`) runs them in Node and sends their GLBs through the same
 * validation, optimisation, cache and publication as every other catalog asset. See
 * `tools/authored/README.md`.
 */
export * from "./clips";
export * from "./lod";
export * from "./markers";
export * from "./palette";
export * from "./random";
export * from "./rig";
export * from "./surface";
export * from "./types";
