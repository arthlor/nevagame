import {
  CURRENT_SCHEMA_VERSION,
  type SaveEnvelope
} from "../../src/persistence/SaveSchema";
import { migrateContractSettlement57 } from "../../src/persistence/migrateContractSettlement57";
import { migrateVillageTrade65 } from "../../src/persistence/migrateVillageTrade65";
import { migrateTradeEconomy66 } from "../../src/persistence/migrateTradeEconomy66";
import { migrateProcessingWorkTiers58 } from "../../src/persistence/migrateProcessingWorkTiers58";
import { migrateWorkCeiling72 } from "../../src/persistence/migrateWorkCeiling72";
import { migrateQuestCreditTracks73 } from "../../src/persistence/migrateQuestCreditTracks73";
import { migrateSatchelSlots77 } from "../../src/persistence/migrateSatchelSlots77";

/**
 * Models a development save whose schema branch is at head while its authored
 * world data still carries an older layout revision. Apply the schema-only
 * v57/v58 steps so the envelope stamp agrees with its retained payload; v59 and
 * v60-v63 are layout steps. The v65 station/schema additions are retained while
 * the predecessor layout stamp deliberately remains behind. v66 adds demand;
 * v67–v70 only move layout and v71 only moves a player pose, so their schema
 * stamp can precede pose recovery. v72 (Work ceiling) and v73 (quest-credit
 * tracks) are schema-only state steps, applied like v57/v58. v74 only joins
 * road aprons, so its schema stamp can precede that pose recovery. v77 only
 * appends empty player-satchel slots. v78 changes only the shared road surface,
 * so its schema stamp can likewise precede layout recovery.
 */
export function headSchemaDevelopmentSave(predecessor: SaveEnvelope): SaveEnvelope {
  const schemaState = migrateProcessingWorkTiers58(migrateContractSettlement57(structuredClone(predecessor.state)));
  // Reapplying v65 to a newer predecessor replaces its existing stations and
  // loses saved facing. Only synthesize additions the predecessor lacks.
  const stationsState = predecessor.schemaVersion < 65
    ? migrateVillageTrade65({ ...schemaState, world: { ...schemaState.world, layoutRevision: 34 } })
    : schemaState;
  const tradeState = migrateTradeEconomy66(stationsState);
  const state = migrateSatchelSlots77(migrateQuestCreditTracks73(migrateWorkCeiling72(tradeState)));
  state.schemaVersion = CURRENT_SCHEMA_VERSION;
  state.world.layoutRevision = predecessor.state.world.layoutRevision;
  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error("Update headSchemaDevelopmentSave for the current save schema");
  }
  return {
    ...structuredClone(predecessor),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    state
  };
}
