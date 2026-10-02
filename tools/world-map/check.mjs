import { checkFreshness } from "./inputs.mjs";
try {
  const result = checkFreshness();
  console.info(`World map is fresh (${result.inputCount} source/dependency files, ${result.inputFingerprint.slice(0, 12)}).`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
}
