// src/persistence/SaveMigrations.ts

import { CURRENT_SCHEMA_VERSION, SaveEnvelope } from "./SaveSchema";
import { GameState } from "../simulation/core/types";

export type MigrationFunction = (data: unknown) => unknown;

export const MIGRATIONS: Record<number, MigrationFunction> = {
  2: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    return { ...previous, schemaVersion: 2, basicFishing: null };
  },
  3: (state: unknown) => {
    const previous = state as Record<string, unknown>;
    const boats = (previous.boats ?? {}) as Record<string, Record<string, unknown>>;
    const migratedBoats = Object.fromEntries(
      Object.entries(boats).map(([boatId, boat]) => [
        boatId,
        {
          ...boat,
          dockedMarketId: boat.isDocked === true ? "market.harbor" : null
        }
      ])
    );
    return { ...previous, schemaVersion: 3, sportFishing: null, boats: migratedBoats };
  }
};

export function migrateSaveData(envelope: SaveEnvelope): SaveEnvelope {
  let currentVersion = envelope.schemaVersion;
  let state = envelope.state as unknown;

  while (currentVersion < CURRENT_SCHEMA_VERSION) {
    const migration = MIGRATIONS[currentVersion + 1];
    if (migration) {
      state = migration(state);
      currentVersion += 1;
    } else {
      break;
    }
  }

  return {
    schemaVersion: currentVersion,
    state: state as GameState,
    savedAtUtcMs: envelope.savedAtUtcMs,
    checksum: envelope.checksum
  };
}
