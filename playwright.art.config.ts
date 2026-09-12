import { defineConfig } from "@playwright/test";
import base from "./playwright.config";

/**
 * DEV art benchmark (`npm run art:benchmark`): the gameplay-camera capture and
 * draw/triangle diagnostics of `art-pipeline.spec.ts`, against the same dev
 * server as the e2e suite. Its unmerged editor scene is diagnostic evidence,
 * not the production budget (`playwright.budget.config.ts`), and its captures
 * take minutes, so the default `test:e2e` run excludes it.
 */
export default defineConfig({
  ...base,
  testMatch: "art-pipeline.spec.ts",
  testIgnore: []
});
