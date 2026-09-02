// tools/content/validate.ts
//
// Content gate for CI.
//
// This deliberately does NOT reimplement validation. `ContentRegistry`
// already cross-validates crops, fish, recipes, markets, NPCs, quests, ranks
// and contracts, and throws on the first broken reference — including proving
// the quest chain is a single acyclic path reachable from `quest.act1_welcome`.
// A second schema would be a second owner for the same facts.
//
// Run: npm run content:validate

import { ContentRegistry } from "../../src/content/ContentRegistry";

function main(): void {
  try {
    ContentRegistry.initializeAndValidate();
  } catch (error) {
    console.error("[NEVA CONTENT] validation failed");
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
    return;
  }

  const counts: Array<[string, number]> = [
    ["items", ContentRegistry.items.size],
    ["crops", ContentRegistry.crops.size],
    ["fish species", ContentRegistry.fishSpecies.size],
    ["recipes", ContentRegistry.recipes.size],
    ["markets", ContentRegistry.markets.size],
    ["boats", ContentRegistry.boats.size],
    ["rods", ContentRegistry.rods.size],
    ["npcs", ContentRegistry.npcs.size],
    ["quests", ContentRegistry.quests.size],
    ["contract templates", ContentRegistry.contractTemplates.size]
  ];

  console.info("[NEVA CONTENT] validation passed");
  for (const [label, count] of counts) {
    console.info(`  ${String(count).padStart(4)}  ${label}`);
  }
}

main();
