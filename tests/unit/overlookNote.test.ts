import { describe, expect, it } from "vitest";
import catalog from "../../assets/specs/asset-catalog.json";
import { SUMMIT_OVERLOOK_NOTE_ID, foundNoteView } from "../../src/content/foundNotes";
import { buildDialoguePages, pageShowsRewards } from "../../src/ui/dialogueConversation";
import {
  OVERLOOK_NOTE_PLACEMENT_ID,
  mainlandOverlookCampPlacements,
  overlookCampScatterReservation,
  overlookNoteAnchor
} from "../../src/world/MainlandEnvironmentLayout";
import { WorldLayout } from "../../src/world/WorldLayout";

const LOOKOUT = { x: -435.8, z: -606 };
const ENGLISH = "I came here often these days. The journey to climb here is exhausting, yet it makes me feel alive. Looking into the vast ocean in front of me makes me feel sad. It is vast, yet the emptiness inside me is even greater. This overthinking will never end. I'll never find peace.";

describe("summit overlook camp", () => {
  it("keeps the bench, fire, food and note on dry ground near the overlook", () => {
    const placements = mainlandOverlookCampPlacements();
    expect(placements.map((placement) => placement.assetId)).toEqual([
      "prop_bench_wood_a",
      "prop_fire_pit_a",
      "item_bread_loaf_a",
      "item_pie_a",
      "item_apple_a",
      "prop_ground_note_a"
    ]);
    const note = placements.find((placement) => placement.id === OVERLOOK_NOTE_PLACEMENT_ID);
    expect(note).toBeDefined();
    expect(overlookNoteAnchor()).toEqual({ x: note!.x, z: note!.z });
    const reservation = overlookCampScatterReservation();
    expect(reservation.radius).toBe(3.5);
    expect(Math.hypot(reservation.x - LOOKOUT.x, reservation.z - LOOKOUT.z)).toBeLessThanOrEqual(2.01);
    const bench = placements[0]!;
    const toHarborX = 64 - bench.x;
    const toHarborZ = 60 - bench.z;
    const harborDistance = Math.hypot(toHarborX, toHarborZ);
    const facing = Math.sin(bench.rotationY) * toHarborX + Math.cos(bench.rotationY) * toHarborZ;
    expect(facing / harborDistance).toBeGreaterThan(0.99);
    const heights = placements.map((placement) => WorldLayout.terrainHeight(placement.x, placement.z));
    expect(Math.max(...heights) - Math.min(...heights)).toBeLessThan(1.5);
    for (const placement of placements) {
      expect(catalog.assets.some((asset) => asset.id === placement.assetId), placement.assetId).toBe(true);
      expect(WorldLayout.isWater(placement.x, placement.z), placement.id).toBe(false);
      expect(WorldLayout.isWalkable(placement.x, placement.z), placement.id).toBe(true);
      expect(WorldLayout.terrainNormalY(placement.x, placement.z), placement.id).toBeGreaterThan(0.45);
      expect(Math.hypot(placement.x - LOOKOUT.x, placement.z - LOOKOUT.z), placement.id).toBeLessThan(6);
    }
  });

  it("reads as one dialogue page, with the written paragraph and no quest reward", () => {
    const note = foundNoteView(SUMMIT_OVERLOOK_NOTE_ID, "en");
    expect(note?.title).toBe("A note");
    expect(note?.lines).toEqual([ENGLISH]);
    const pages = buildDialoguePages({
      success: true,
      segments: [{ kind: "recognition", lines: [...note!.lines] }]
    }, [...note!.lines]);
    expect(pages).toHaveLength(1);
    expect(pages[0]?.text).toBe(ENGLISH);
    expect(pages[0]?.segment.kind).toBe("recognition");
    expect(pages[0]?.segment.questId).toBeUndefined();
    expect(pageShowsRewards(pages[0])).toBe(false);

    const turkish = foundNoteView(SUMMIT_OVERLOOK_NOTE_ID, "tr");
    expect(turkish?.title).toBe("Bir not");
    expect(turkish?.lines[0]).not.toBe(ENGLISH);
    expect(foundNoteView("note.missing", "en")).toBeNull();
  });
});
