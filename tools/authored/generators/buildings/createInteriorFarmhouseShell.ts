import * as THREE from "three";
import { addCollisionMarkers, assembleLodLevels, type AuthoredModel, type GeneratorContext, type V3 } from "../../kit";
import { Architecture } from "./architectureParts";
import { rope } from "../props/parts";

/**
 * Interior farmhouse shell (ported from the frozen `interior_farmhouse_shell` family).
 *
 * glTF space: +Y up, ground-centred at (0, 0, 0), metres. The room's long axis runs X.
 *
 * Gameplay datum (matches `src/world/FarmhouseInterior.ts` and the catalog
 * `collisionPrimitives`, which are unchanged by this port):
 * - south wall (-Z) is the entry: a 1.3 m open passage at x = 0 lines up with
 *   `FARMHOUSE_INTERIOR_DOOR` (z = -3.1) and the front collision gap (|x| < 0.6).
 * - north wall (+Z) is the hearth end: the wall itself is SOLID across its full
 *   width. `prop_fireplace_hearth_a` (2.4 m wide at z = +2.85, collision
 *   |x| < 1.15, z 2.3..3.4) plugs the catalog's legacy north collision gap, so
 *   the shell builds a stone flue breast above the mantel line, flanking stone
 *   pilasters, and a raised hearth apron in front of the prop instead of a hole.
 * - side windows are recessed glowing assemblies on solid walls (the interior
 *   pocket is a separate map area, so windows read as daylight, not portals).
 *   The west window sits south of the bookcase zone; the east window lights the
 *   dining table. Two further windows flank the south entry door.
 * - floor top lands at y = 0.17 (`FARMHOUSE_INTERIOR_BOUNDS.floorY`); the solid
 *   plank ceiling closes the room at 3.5 m, under the 3.7 m camera ceiling.
 *
 * Construction datum: stone wainscot -> plaster field -> dark timber frame
 * (corner posts, plates, rails) -> wall plates carry the five ceiling beams ->
 * beams carry the plank ceiling. No visual spans without support.
 *
 * Catalog palette order: stone_warm_01, plaster_cream_01, wood_honey_01,
 * wood_dark_01, emissive_window_01.
 */
export function createInteriorFarmhouseShellModel(context: GeneratorContext): AuthoredModel {
  const { spec, parameters: p, seed } = context;
  const root = new THREE.Group();
  root.name = spec.rootNode;

  const width = Number(p.width ?? 8.8);
  const depth = Number(p.depth ?? 6.8);
  const wallH = Number(p.wallHeight ?? 3.5);
  const floorPlanks = Math.max(8, Math.round(Number(p.floorPlanks ?? 20)));
  const beamCount = Math.max(3, Math.round(Number(p.ceilingBeams ?? 5)));

  const hw = width / 2; // 4.4
  const hd = depth / 2; // 3.4
  const floorTop = 0.17;
  const [STONE, PLASTER, HONEY, DARK, GLOW] = spec.palette.map((_, i) => i);

  const doorW = 1.3;
  const doorH = 2.5;
  const wainscotH = 0.9;

  assembleLodLevels(spec, root, (level) => {
    const a = new Architecture(spec.palette, level, seed);
    const group = new THREE.Group();
    group.name = `${spec.id}_LOD${level}_room`;

    // ---------------------------------------------------------------- floor
    // Planks run along Z, side by side along X. The dark bearers underneath
    // carry them; the honey skirting closes the wall base everywhere except
    // the entry passage and the hearth apron.
    const plankW = width / floorPlanks;
    for (let i = 0; i < floorPlanks; i += 1) {
      const x = -hw + (i + 0.5) * plankW;
      a.box([x, floorTop - 0.045, 0], [plankW - 0.012, 0.09, depth], HONEY, a.shade());
    }
    for (const bz of [-hd + 0.5, 0, hd - 0.5]) {
      a.beam([-hw + 0.1, floorTop - 0.11, bz], [hw - 0.1, floorTop - 0.11, bz], [0.06, 0.05], DARK);
    }
    const skirt = (cx: number, cz: number, w: number, d: number): void => {
      a.box([cx, floorTop + 0.07, cz], [w, 0.14, d], DARK, 0.9);
    };
    skirt(0, hd - 0.19, width - 0.3, 0.08); // north, behind hearth apron
    skirt(-hw + 0.19, 0, 0.08, depth - 0.3); // west
    skirt(hw - 0.19, 0, 0.08, depth - 0.3); // east
    skirt(-(doorW / 2 + (width / 2 - doorW / 2) / 2), -hd + 0.19, width / 2 - doorW / 2 - 0.15, 0.08);
    skirt((doorW / 2 + (width / 2 - doorW / 2) / 2), -hd + 0.19, width / 2 - doorW / 2 - 0.15, 0.08);

    // ---------------------------------------------------------------- walls
    // Each wall: stone wainscot box, plaster field box, dark cap rail at the
    // wainscot line, corner posts, and a wall plate at the head. LOD0 faces
    // the wainscot with staggered masonry courses; higher LODs keep the plain
    // stone box so the datum survives decimation-free.
    const wallCore = (cx: number, cz: number, w: number, d: number): void => {
      a.box([cx, wainscotH / 2, cz], [w, wainscotH, d], STONE, 0.86);
      a.box([cx, (wainscotH + wallH) / 2, cz], [w, wallH - wainscotH, d], PLASTER, 0.97);
    };
    const capRail = (from: V3, to: V3): void => {
      a.beam(from, to, [0.05, 0.045], HONEY);
    };

    // North (hearth) wall: solid full width.
    wallCore(0, hd, width, 0.3);
    capRail([-hw, wainscotH + 0.02, hd - 0.17], [hw, wainscotH + 0.02, hd - 0.17]);
    // South (entry) wall: two leaves plus a header over the passage.
    const leafW = (width - doorW) / 2;
    wallCore(-(doorW / 2 + leafW / 2), -hd, leafW, 0.3);
    wallCore(doorW / 2 + leafW / 2, -hd, leafW, 0.3);
    a.box([0, (doorH + wallH) / 2, -hd], [doorW + 0.24, wallH - doorH, 0.3], PLASTER, 0.97);
    // West / east walls: solid full depth.
    wallCore(-hw, 0, 0.3, depth);
    wallCore(hw, 0, 0.3, depth);
    capRail([-hw + 0.17, wainscotH + 0.02, -hd], [-hw + 0.17, wainscotH + 0.02, hd]);
    capRail([hw - 0.17, wainscotH + 0.02, -hd], [hw - 0.17, wainscotH + 0.02, hd]);

    if (level < 2) {
      // Staggered wainscot joints on the room faces; LOD2 keeps the plain
      // stone box so the datum survives without the joint cost.
      const course = (cx: number, cz: number, span: number, yaw: number): void => {
        a.masonry([cx, 0.02, cz], span, wainscotH - 0.06, 0.05, 3, Math.max(4, Math.round(span / 0.62)), STONE, yaw);
      };
      course(0, hd - 0.16, width - 0.4, Math.PI);
      course(-(doorW / 2 + leafW / 2), -hd + 0.16, leafW - 0.2, 0);
      course(doorW / 2 + leafW / 2, -hd + 0.16, leafW - 0.2, 0);
      course(-hw + 0.16, 0, depth - 0.4, Math.PI / 2);
      course(hw - 0.16, 0, depth - 0.4, -Math.PI / 2);
    }

    // Corner posts land on the floor and meet the plates; plates run the full
    // perimeter so every beam end has a bearing.
    for (const sx of [-1, 1]) {
      for (const sz of [-1, 1]) {
        a.beam([sx * hw, 0.1, sz * hd], [sx * hw, wallH, sz * hd], [0.14, 0.14], DARK);
      }
    }
    a.beam([-hw, wallH + 0.05, -hd], [hw, wallH + 0.05, -hd], [0.11, 0.11], DARK);
    a.beam([-hw, wallH + 0.05, hd], [hw, wallH + 0.05, hd], [0.11, 0.11], DARK);
    a.beam([-hw, wallH + 0.05, -hd], [-hw, wallH + 0.05, hd], [0.11, 0.11], DARK);
    a.beam([hw, wallH + 0.05, -hd], [hw, wallH + 0.05, hd], [0.11, 0.11], DARK);
    // Mid rails tie the frame at the wainscot cap on the window walls.
    for (const sx of [-1, 1]) {
      a.beam([sx * hw, wainscotH + 0.02, -hd], [sx * hw, wainscotH + 0.02, hd], [0.07, 0.07], DARK);
    }

    // ------------------------------------------------------------ entry
    // Open passage: posts, lintel, and a worn stone threshold. The plank leaf
    // hangs on the west jamb and rests folded flat against the leaf wall, so
    // the trigger passage stays walkable while the opening reads as a door.
    for (const sx of [-1, 1]) {
      a.beam([sx * (doorW / 2 + 0.02), 0.12, -hd], [sx * (doorW / 2 + 0.02), doorH, -hd], [0.075, 0.075], DARK);
    }
    a.beam([-(doorW / 2 + 0.1), doorH + 0.06, -hd], [doorW / 2 + 0.1, doorH + 0.06, -hd], [0.09, 0.09], DARK);
    a.box([0, floorTop + 0.015, -hd], [doorW + 0.3, 0.1, 0.62], STONE, 0.92);

    // Folded door leaf: three honey boards, dark ledges top and bottom, a
    // diagonal brace, strap hinges on the jamb edge, and a ring handle.
    // LOD2 keeps a single slab so the silhouette survives at distance.
    const doorLeafW = doorW - 0.06;
    const leafH = doorH - 0.06;
    const leafY = floorTop + leafH / 2 + 0.03;
    const hingeX = -(doorW / 2 + 0.02);
    const leafCX = hingeX - doorLeafW / 2;
    const leafZ = -hd + 0.27;
    if (level < 2) {
      const boards = 3;
      for (let i = 0; i < boards; i += 1) {
        const bx = hingeX - ((i + 0.5) * doorLeafW) / boards;
        a.box([bx, leafY, leafZ], [doorLeafW / boards - 0.012, leafH, 0.05], HONEY, a.shade());
      }
      for (const ly of [leafY - leafH / 2 + 0.22, leafY + leafH / 2 - 0.22]) {
        a.box([leafCX, ly, leafZ + 0.045], [doorLeafW - 0.06, 0.14, 0.03], DARK, 0.9);
      }
      a.beam([hingeX - 0.08, leafY - leafH / 2 + 0.3, leafZ + 0.045],
        [hingeX - doorLeafW + 0.08, leafY + leafH / 2 - 0.3, leafZ + 0.045], [0.05, 0.02], HONEY);
    } else {
      a.box([leafCX, leafY, leafZ], [doorLeafW, leafH, 0.05], HONEY, 0.95);
    }
    // Strap hinges wrap the jamb edge; the ring handle hangs near the free edge.
    for (const hy of [leafY - leafH / 2 + 0.35, leafY + leafH / 2 - 0.35]) {
      a.box([hingeX + 0.02, hy, leafZ], [0.16, 0.05, 0.07], DARK, 0.7);
    }
    if (level < 2) {
      const hx = hingeX - doorLeafW + 0.18;
      a.box([hx, leafY + 0.1, leafZ + 0.045], [0.07, 0.1, 0.03], DARK, 0.7);
      const ring = Array.from({ length: 10 }, (_, i): V3 => {
        const t = (i / 10) * Math.PI * 2;
        return [hx + Math.cos(t) * 0.07, leafY - 0.02 + Math.sin(t) * 0.07, leafZ + 0.06];
      });
      rope(a.surface, ring, 0.012, DARK, { sides: 4, caps: false });
    }

    // ------------------------------------------------------------ hearth
    // Stone flue breast rises above the fireplace prop's mantel line to the
    // ceiling; pilasters flank the prop; the apron catches embers in the room.
    const breastW = 1.7;
    const propTop = 2.6;
    a.box([0, (propTop + wallH) / 2 + 0.05, hd - 0.28], [breastW, wallH - propTop, 0.26], STONE, 0.88);
    a.box([0, wallH - 0.12, hd - 0.28], [breastW + 0.24, 0.2, 0.34], STONE, 0.94);
    for (const sx of [-1, 1]) {
      a.box([sx * 1.5, 1.35, hd - 0.24], [0.3, 2.7, 0.22], STONE, 0.86);
      a.box([sx * 1.5, 2.78, hd - 0.24], [0.38, 0.16, 0.3], STONE, 0.93);
    }
    if (a.fine) {
      a.masonry([0, propTop + 0.1, hd - 0.42], breastW - 0.2, wallH - propTop - 0.3, 0.06, 2, 3, STONE, Math.PI);
    }
    a.box([0, floorTop + 0.03, hd - 1.05], [3.0, 0.06, 1.1], STONE, 0.9);

    // ------------------------------------------------------------ windows
    // Recessed daylight assemblies: dark recess, emissive pane proud of the
    // plaster, honey frame, sill, and (LOD0/1) a mullion cross. All sizes are
    // world-axis: `along` names the wall's long axis. Nothing pierces the wall.
    const windowUnit = (x: number, z: number, along: "x" | "z", inward: 1 | -1): void => {
      const w = 1.3;
      const h = 1.15;
      const cy = 1.75;
      const recessSize: V3 = along === "x" ? [w + 0.1, h + 0.1, 0.1] : [0.1, h + 0.1, w + 0.1];
      const paneSize: V3 = along === "x" ? [w, h, 0.03] : [0.03, h, w];
      // Recess straddles the plaster face; pane sits proud in the room.
      if (along === "x") {
        a.box([x, cy, z - inward * 0.01], recessSize, DARK, 0.8);
        a.box([x, cy, z + inward * 0.055], paneSize, GLOW, 1.0);
        a.beam([x - w / 2 - 0.05, cy - h / 2, z + inward * 0.08], [x - w / 2 - 0.05, cy + h / 2, z + inward * 0.08], [0.055, 0.055], HONEY);
        a.beam([x + w / 2 + 0.05, cy - h / 2, z + inward * 0.08], [x + w / 2 + 0.05, cy + h / 2, z + inward * 0.08], [0.055, 0.055], HONEY);
        a.beam([x - w / 2 - 0.08, cy + h / 2 + 0.03, z + inward * 0.08], [x + w / 2 + 0.08, cy + h / 2 + 0.03, z + inward * 0.08], [0.055, 0.055], HONEY);
        a.box([x, cy - h / 2 - 0.06, z + inward * 0.12], [w + 0.3, 0.09, 0.22], HONEY, 0.95);
        if (level < 2) {
          a.beam([x, cy - h / 2, z + inward * 0.07], [x, cy + h / 2, z + inward * 0.07], [0.028, 0.028], DARK);
          a.beam([x - w / 2, cy, z + inward * 0.07], [x + w / 2, cy, z + inward * 0.07], [0.028, 0.028], DARK);
        }
      } else {
        a.box([x - inward * 0.01, cy, z], recessSize, DARK, 0.8);
        a.box([x + inward * 0.055, cy, z], paneSize, GLOW, 1.0);
        a.beam([x + inward * 0.08, cy - h / 2, z - w / 2 - 0.05], [x + inward * 0.08, cy + h / 2, z - w / 2 - 0.05], [0.055, 0.055], HONEY);
        a.beam([x + inward * 0.08, cy - h / 2, z + w / 2 + 0.05], [x + inward * 0.08, cy + h / 2, z + w / 2 + 0.05], [0.055, 0.055], HONEY);
        a.beam([x + inward * 0.08, cy + h / 2 + 0.03, z - w / 2 - 0.08], [x + inward * 0.08, cy + h / 2 + 0.03, z + w / 2 + 0.08], [0.055, 0.055], HONEY);
        a.box([x + inward * 0.12, cy - h / 2 - 0.06, z], [0.22, 0.09, w + 0.3], HONEY, 0.95);
        if (level < 2) {
          a.beam([x + inward * 0.07, cy - h / 2, z], [x + inward * 0.07, cy + h / 2, z], [0.028, 0.028], DARK);
          a.beam([x + inward * 0.07, cy, z - w / 2], [x + inward * 0.07, cy, z + w / 2], [0.028, 0.028], DARK);
        }
      }
    };
    windowUnit(-hw + 0.16, -2.0, "z", 1); // west, over the reading corner
    windowUnit(hw - 0.16, -1.0, "z", -1); // east, over the dining table
    windowUnit(-2.7, -hd + 0.16, "x", 1); // south-west, flanks the entry
    windowUnit(2.7, -hd + 0.16, "x", 1); // south-east, flanks the entry

    // ------------------------------------------------------------ ceiling
    // Solid plank ceiling on five beams; each beam bears on the side plates
    // and is braced at the corners. No view to the void from the room.
    const beamY = wallH - 0.07;
    for (let i = 0; i < beamCount; i += 1) {
      const z = -hd + ((i + 0.5) * depth) / beamCount;
      a.beam([-hw - 0.05, beamY, z], [hw + 0.05, beamY, z], [0.09, 0.09], DARK);
    }
    if (level < 2) {
      for (const sx of [-1, 1]) {
        for (const sz of [-1, 1]) {
          a.beam(
            [sx * (hw - 0.15), beamY - 0.5, sz * (hd - 0.15)],
            [sx * (hw - 0.02), beamY - 0.02, sz * (hd - 0.55)],
            [0.055, 0.055],
            DARK
          );
        }
      }
    }
    const ceilBoards = a.count(14, 10, 1);
    for (let i = 0; i < ceilBoards; i += 1) {
      const z = -hd + ((i + 0.5) * depth) / ceilBoards;
      a.box([0, wallH + 0.045, z], [width, 0.09, depth / ceilBoards - 0.012], HONEY, a.shade());
    }

    group.add(a.mesh(`${spec.id}_LOD${level}_shell`));
    return group;
  });

  addCollisionMarkers(spec, root);
  return { root, clips: [] };
}
