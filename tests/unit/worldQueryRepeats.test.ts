import { describe, expect, it } from "vitest";
import { sampleNevaLandforms } from "../../src/world/NevaLandforms";
import { WorldLayout } from "../../src/world/WorldLayout";

// One terrain or surface sample asks the river, coast, marine and landform
// owners about the same point several times in a row, so each keeps its last
// answer. A stale answer would depend on the query asked before it, so the
// same keys asked again in another order, each twice, must agree exactly.
function expectOrderIndependent<K, T>(keys: readonly K[], query: (key: K) => T, reorder: (keys: readonly K[]) => K[]): void {
  const expected = new Map(keys.map((key) => [key, structuredClone(query(key))]));
  for (const key of reorder(keys)) {
    const first = query(key);
    expect(query(key)).toBe(first);
    expect(structuredClone(first)).toEqual(expected.get(key));
  }
}

const reversed = <K>(keys: readonly K[]): K[] => [...keys].reverse();

/**
 * Points listed column by column are asked again row by row, so neighbours in
 * one pass never share the axis their neighbours shared in the other; a key
 * that compared one axis would answer one of the passes stale.
 */
function grid(minX: number, maxX: number, stepX: number, minZ: number, maxZ: number, stepZ: number) {
  const points: { x: number; z: number }[] = [];
  for (let x = minX; x <= maxX; x += stepX) for (let z = minZ; z <= maxZ; z += stepZ) points.push({ x, z });
  return points;
}
const rowByRow = (points: readonly { x: number; z: number }[]) => [...points].sort((a, b) => a.z - b.z || a.x - b.x);

describe("repeated world queries", () => {
  it("answer the river section of each station regardless of the station asked before", () => {
    expectOrderIndependent(Array.from({ length: 131 }, (_, index) => -200 + index * 2.3),
      (z) => WorldLayout.riverSectionAt(z), reversed);
  });

  it("answer the southern coastline regardless of the column asked before", () => {
    expectOrderIndependent(Array.from({ length: 161 }, (_, index) => -250 + index * 3.1),
      (x) => WorldLayout.coastlineZ(x), reversed);
  });

  it("answer the marine sample of each point regardless of the point asked before", () => {
    expectOrderIndependent([...grid(-300, 900, 37.3, -300, 400, 41.7), ...grid(60, 160, 7.5, 40, 130, 6.5)],
      ({ x, z }) => WorldLayout.marineSampleAt(x, z), rowByRow);
  });

  it("answer the landform of each point regardless of the point asked before", () => {
    // The summits and shoulders, and a finer patch across the headwater
    // cirque, where authored and sculpted forms blend.
    expectOrderIndependent([...grid(-240, 120, 17.3, -280, 90, 19.1), ...grid(-70, 30, 4.5, -160, -120, 4.5)],
      ({ x, z }) => sampleNevaLandforms(x, z), rowByRow);
  });

  it("share frozen answers, so one consumer cannot edit what another reads", () => {
    const section = WorldLayout.riverSectionAt(-40);
    const marine = WorldLayout.marineSampleAt(120, 90);
    const landform = sampleNevaLandforms(-61, -170);
    for (const shared of [section, section.tangent, marine, marine.waveDirection, marine.flowDirection, marine.ecologyWeights, landform]) {
      expect(Object.isFrozen(shared)).toBe(true);
    }
    expect(() => { (section as { centerX: number }).centerX = 0; }).toThrow(TypeError);
  });
});
