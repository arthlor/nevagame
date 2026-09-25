import {
  CURRENT_SCHEMA_VERSION,
  type SaveEnvelope
} from "../../src/persistence/SaveSchema";
import { migrateContractSettlement57 } from "../../src/persistence/migrateContractSettlement57";
import { migrateProcessingWorkTiers58 } from "../../src/persistence/migrateProcessingWorkTiers58";

/**
 * Models a development save whose schema branch is at head while its authored
 * world data still carries an older layout revision. Apply the schema-only
 * v57/v58 steps so the envelope stamp agrees with its retained payload; v59 and
 * v60 are layout-only steps, so such a save carries only their schema stamp.
 */
export function headSchemaDevelopmentSave(predecessor: SaveEnvelope): SaveEnvelope {
  const state = {
    ...migrateProcessingWorkTiers58(migrateContractSettlement57(structuredClone(predecessor.state))),
    schemaVersion: 60
  };
  if (state.schemaVersion !== CURRENT_SCHEMA_VERSION) {
    throw new Error("Update headSchemaDevelopmentSave for the current save schema");
  }
  return {
    ...structuredClone(predecessor),
    schemaVersion: CURRENT_SCHEMA_VERSION,
    state
  };
}
