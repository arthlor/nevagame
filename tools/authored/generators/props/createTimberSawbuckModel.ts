/**
 * Forest Logging Yard & Sawbuck Trestle - authored (code -> GLB) source.
 *
 * Authentic working forestry station for Pinewatch Forest Village (`biome.pine_forest`),
 * anchoring the mainland timber economy.
 *
 * Features:
 *   1. Barked pine logs resting on heavy ground skids with wooden stop chocks and an iron cant hook.
 *   2. Sturdy X-frame sawbuck trestle holding a sawn log with an embedded two-person crosscut saw
 *      ("misery whip") and a heap of fresh golden sawdust underneath.
 *   3. Stickered timber drying stacks with longitudinal foundation bearers, stacked lumber planks,
 *      and transverse aeration battens/stickers topped by a protective rain-shedding rooflet.
 *   4. Traditional woodcutter's shaving horse bench (schnitzelbank) with splayed legs, foot clamp
 *      pedal, two-handled iron drawknife, and curled wood shavings.
 *   5. Split cordwood firewood stack held between vertical stakes, plus a heavy birch chopping stump
 *      with an embedded felling axe and scattered wood chips.
 *
 * Deterministic: every station and jitter draws from `mulberry32(context.seed)`.
 */

import * as THREE from "three";

import {
  SurfaceBuilder,
  addCollisionMarkers,
  mulberry32,
  type AuthoredModel,
  type GeneratorContext,
  type Station,
} from "../../kit/index";
import { lumps, timber, v3 } from "./parts";

export function createTimberSawbuckModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const random = mulberry32(context.seed);
  const root = new THREE.Group();
  root.name = `${ID}_root`;

  // Palette tokens: bark, weathered structural timber, fresh warm wood, sawn honey planks/chips, iron, dark metal.
  const surface = new SurfaceBuilder(spec.palette);
  const BARK = 0;
  const WEATHERED = 1;
  const WARM = 2;
  const HONEY = 3;
  const IRON = 4;
  const METAL_DARK = 5;

  // ---------------------------------------------------------------------------
  // 1. BARKED PINE LOGS ON HEAVY SKIDS (Rear Left / Center: x ~ -0.4, z ~ -1.1)
  // ---------------------------------------------------------------------------
  const skidZ1 = -1.9;
  const skidZ2 = -0.3;
  const logLen = 3.6;
  const pileX = -0.5;

  // Two heavy ground skids (transverse squared timbers with angled beveled ends)
  for (const z of [skidZ1, skidZ2]) {
    timber(
      surface,
      [pileX - logLen / 2 - 0.25, 0.08, z],
      [pileX + logLen / 2 + 0.25, 0.08, z],
      [0.09, 0.09],
      WEATHERED,
      { ref: [0, 1, 0], bevel: 0.025, shade: 0.82 + random() * 0.12 }
    );
  }

  // 5 Heavy barked pine logs in 2 tiers (3 bottom, 2 top)
  const logRows = [
    { count: 3, y: 0.35, zCenter: (skidZ1 + skidZ2) / 2, spacing: 0.48 },
    { count: 2, y: 0.74, zCenter: (skidZ1 + skidZ2) / 2, spacing: 0.48 },
  ];

  for (let rIdx = 0; rIdx < logRows.length; rIdx++) {
    const row = logRows[rIdx];
    for (let k = 0; k < row.count; k++) {
      const zOffset = (k - (row.count - 1) / 2) * row.spacing;
      const z = row.zCenter + zOffset;
      const y = row.y;
      const radius = 0.22 * (0.94 + random() * 0.1);
      const shiftX = (random() - 0.5) * 0.18;

      const pStart = new THREE.Vector3(pileX - logLen / 2 + shiftX, y, z);
      const pEnd = new THREE.Vector3(pileX + logLen / 2 + shiftX, y, z);

      // Bark cylinder with subtle organic lumpiness
      surface.addLoft(
        [
          { p: v3(pStart), w: radius, h: radius },
          { p: v3(pEnd), w: radius * 0.96, h: radius * 0.96 },
        ],
        {
          sides: 9,
          ref: [0, 1, 0],
          capStart: 0,
          capEnd: 0,
          flat: true,
          radial: lumps(rIdx * 7 + k + 1, 0.05),
          token: BARK,
          shade: 0.86 + random() * 0.14,
        }
      );

      // Sawn log ends showing annual growth rings (two concentric discs)
      for (const [end, sign] of [[pStart, -1], [pEnd, 1]] as const) {
        surface.addDisc([end.x + sign * 0.003, end.y, end.z], [sign, 0, 0], radius * 0.98, {
          token: HONEY,
          sides: 9,
          shade: 0.94 + random() * 0.08,
        });
        surface.addDisc([end.x + sign * 0.007, end.y, end.z], [sign, 0, 0], radius * 0.48, {
          token: WARM,
          sides: 7,
          shade: 0.82,
        });
        surface.addDisc([end.x + sign * 0.01, end.y, end.z], [sign, 0, 0], radius * 0.18, {
          token: BARK,
          sides: 5,
          shade: 0.72,
        });
      }
    }
  }

  // Heavy wooden wedge chocks at outer ends of skids to lock logs in place
  for (const x of [pileX - logLen / 2 + 0.35, pileX + logLen / 2 - 0.35]) {
    for (const z of [skidZ1 - 0.28, skidZ2 + 0.28]) {
      const signZ = z > 0 ? 1 : -1;
      timber(
        surface,
        [x, 0.16, z],
        [x, 0.42, z - signZ * 0.12],
        [0.08, 0.06],
        WEATHERED,
        { ref: [1, 0, 0], halfEnd: [0.08, 0.02], shade: 0.78 }
      );
    }
  }

  // Iron Cant Hook / Peavey tool leaning against front of log pile
  const cantX = pileX - 0.8;
  const cantZ = skidZ2 + 0.4;
  timber(
    surface,
    [cantX, 0.05, cantZ],
    [cantX - 0.35, 1.25, cantZ - 0.45],
    [0.024, 0.024],
    HONEY,
    { ref: [0, 1, 0], bevel: 0.006, shade: 0.9 }
  );
  // Curved iron clasp & hook
  timber(
    surface,
    [cantX - 0.18, 0.65, cantZ - 0.24],
    [cantX - 0.08, 0.72, cantZ - 0.12],
    [0.016, 0.028],
    IRON,
    { ref: [0, 0, 1] }
  );
  timber(
    surface,
    [cantX - 0.08, 0.72, cantZ - 0.12],
    [cantX - 0.16, 0.52, cantZ - 0.06],
    [0.014, 0.022],
    IRON,
    { ref: [0, 0, 1] }
  );

  // ---------------------------------------------------------------------------
  // 2. SAWBUCK TRESTLE & CROSSCUT TWO-PERSON SAW (Left Front: x ~ -2.0, z ~ 0.8)
  // ---------------------------------------------------------------------------
  const trestleX1 = -2.55;
  const trestleX2 = -1.45;
  const trestleZ = 0.85;
  const trestleH = 0.95;
  const spreadZ = 0.46;

  // Two X-frame trestle ends
  for (const tx of [trestleX1, trestleX2]) {
    // Leg A (leaning from -Z to +Z)
    timber(
      surface,
      [tx, 0.02, trestleZ - spreadZ],
      [tx, trestleH + 0.22, trestleZ + spreadZ * 0.75],
      [0.048, 0.048],
      WEATHERED,
      { ref: [1, 0, 0], bevel: 0.008, shade: 0.84 }
    );
    // Leg B (leaning from +Z to -Z)
    timber(
      surface,
      [tx + 0.05, 0.02, trestleZ + spreadZ],
      [tx + 0.05, trestleH + 0.22, trestleZ - spreadZ * 0.75],
      [0.048, 0.048],
      WEATHERED,
      { ref: [1, 0, 0], bevel: 0.008, shade: 0.86 }
    );
    // Central connecting iron pivot bolt & washer
    surface.addBox(
      [tx - 0.04, trestleH * 0.62, trestleZ],
      [tx + 0.09, trestleH * 0.62, trestleZ],
      [0.025, 0.025],
      { ref: [0, 1, 0], token: METAL_DARK }
    );
  }

  // Longitudinal stretcher beam locking the two X-frames together
  timber(
    surface,
    [trestleX1 - 0.18, trestleH * 0.42, trestleZ],
    [trestleX2 + 0.18, trestleH * 0.42, trestleZ],
    [0.042, 0.05],
    WEATHERED,
    { ref: [0, 1, 0], bevel: 0.008, shade: 0.8 }
  );

  // Sawn pine log resting in the V-saddle of the sawbuck
  const buckLogLen = 2.4;
  const buckLogX = (trestleX1 + trestleX2) / 2;
  const buckLogY = trestleH * 0.68 + 0.16;
  const buckLogR = 0.17;
  const buckLogStart = new THREE.Vector3(buckLogX - buckLogLen / 2, buckLogY, trestleZ);
  const buckLogEnd = new THREE.Vector3(buckLogX + buckLogLen / 2, buckLogY, trestleZ);

  surface.addLoft(
    [
      { p: v3(buckLogStart), w: buckLogR, h: buckLogR },
      { p: v3(buckLogEnd), w: buckLogR * 0.95, h: buckLogR * 0.95 },
    ],
    {
      sides: 9,
      ref: [0, 1, 0],
      capStart: 0,
      capEnd: 0,
      flat: true,
      radial: lumps(19, 0.04),
      token: BARK,
      shade: 0.9,
    }
  );

  // Freshly sawn face on the cantilevered log end
  surface.addDisc([buckLogEnd.x + 0.003, buckLogEnd.y, buckLogEnd.z], [1, 0, 0], buckLogR * 0.98, {
    token: HONEY,
    sides: 9,
    shade: 0.98,
  });
  surface.addDisc([buckLogEnd.x + 0.006, buckLogEnd.y, buckLogEnd.z], [1, 0, 0], buckLogR * 0.45, {
    token: WARM,
    sides: 7,
    shade: 0.85,
  });
  surface.addDisc([buckLogStart.x - 0.003, buckLogStart.y, buckLogStart.z], [-1, 0, 0], buckLogR * 0.98, {
    token: HONEY,
    sides: 9,
    shade: 0.92,
  });

  // Crosscut Two-Person Logging Saw ("Misery Whip") resting in kerf cut
  const sawCutX = buckLogX + 0.25;
  const sawLen = 1.62;
  const sawH = 0.13;
  const sawY = buckLogY + 0.05;

  // Curved steel saw blade
  surface.addBox(
    [sawCutX, sawY - sawH / 2, trestleZ - sawLen / 2],
    [sawCutX, sawY + sawH / 2, trestleZ + sawLen / 2],
    [0.006, sawH / 2],
    { ref: [0, 1, 0], token: IRON, shade: 0.95 }
  );

  // Raker & peg teeth along lower cutting edge
  const numTeeth = 18;
  const toothPitch = (sawLen - 0.2) / numTeeth;
  for (let t = 0; t < numTeeth; t++) {
    const tz = trestleZ - sawLen / 2 + 0.1 + t * toothPitch;
    timber(
      surface,
      [sawCutX, sawY - sawH / 2, tz],
      [sawCutX, sawY - sawH / 2 - 0.024, tz + toothPitch * 0.45],
      [0.005, 0.012],
      IRON,
      { ref: [1, 0, 0], shade: 0.9 }
    );
  }

  // Upright turned wooden grip handles at both blade ends
  for (const endZ of [trestleZ - sawLen / 2 + 0.03, trestleZ + sawLen / 2 - 0.03]) {
    // Metal mounting socket
    surface.addBox(
      [sawCutX - 0.015, sawY - 0.06, endZ - 0.02],
      [sawCutX + 0.015, sawY + 0.08, endZ + 0.02],
      [0.018, 0.02],
      { ref: [0, 1, 0], token: METAL_DARK }
    );
    // Vertical turned grip handle
    timber(
      surface,
      [sawCutX, sawY - 0.14, endZ],
      [sawCutX, sawY + 0.26, endZ],
      [0.02, 0.02],
      HONEY,
      { ref: [1, 0, 0], bevel: 0.008, shade: 0.92 }
    );
  }

  // Golden sawdust pile on the ground directly below the saw cut
  const dustX = sawCutX;
  const dustZ = trestleZ;
  const dustRings: Array<[number, number]> = [
    [0.01, 0.52],
    [0.04, 0.45],
    [0.09, 0.32],
    [0.15, 0.14],
    [0.18, 0.02],
  ];
  surface.addLoft(
    dustRings.map(([h, r]): Station => ({ p: [dustX, h, dustZ], w: r, h: r * 0.85 })),
    {
      sides: 9,
      ref: [0, 0, 1],
      capStart: 0,
      capEnd: 0.4,
      flat: true,
      radial: lumps(41, 0.12),
      token: HONEY,
      shade: 1.0,
    }
  );

  // ---------------------------------------------------------------------------
  // 3. STICKERED TIMBER DRYING STACKS (Right Side: x ~ 2.1, z ~ -0.4)
  // ---------------------------------------------------------------------------
  const stackX = 2.1;
  const stackZ = -0.4;
  const plankLen = 2.9;
  const plankW = 0.22;
  const plankT = 0.038;
  const stackWidth = 1.35;

  // 3 Heavy longitudinal ground foundation bearers
  for (const bx of [stackX - stackWidth / 2 + 0.12, stackX, stackX + stackWidth / 2 - 0.12]) {
    timber(
      surface,
      [bx, 0.08, stackZ - plankLen / 2 + 0.25],
      [bx, 0.08, stackZ + plankLen / 2 - 0.25],
      [0.07, 0.07],
      WEATHERED,
      { ref: [0, 1, 0], bevel: 0.02, shade: 0.8 }
    );
  }

  // 5 Tiers of sawn pine boards separated by transverse aeration battens/stickers
  const numLayers = 5;
  const boardsPerLayer = 4;
  for (let l = 0; l < numLayers; l++) {
    const layerY = 0.18 + l * 0.125;

    // Boards in this tier
    for (let b = 0; b < boardsPerLayer; b++) {
      const bx = stackX - stackWidth / 2 + 0.16 + b * (plankW + 0.07);
      const bJitterZ = (random() - 0.5) * 0.06;
      timber(
        surface,
        [bx, layerY, stackZ - plankLen / 2 + bJitterZ],
        [bx, layerY, stackZ + plankLen / 2 + bJitterZ],
        [plankW / 2, plankT / 2],
        HONEY,
        { ref: [0, 1, 0], bevel: 0.006, shade: 0.88 + random() * 0.15 }
      );
    }

    // Transverse aeration stickers (battens) resting on top of this tier
    if (l < numLayers - 1) {
      const stickerY = layerY + plankT / 2 + 0.015;
      for (const sz of [stackZ - plankLen / 2 + 0.35, stackZ, stackZ + plankLen / 2 - 0.35]) {
        timber(
          surface,
          [stackX - stackWidth / 2 - 0.05, stickerY, sz],
          [stackX + stackWidth / 2 + 0.05, stickerY, sz],
          [0.018, 0.018],
          WEATHERED,
          { ref: [0, 1, 0], bevel: 0.003, shade: 0.82 }
        );
      }
    }
  }

  // Protective overhanging rain-shedding rooflet on top of stack
  const roofY = 0.18 + numLayers * 0.125 + 0.04;
  for (let r = 0; r < boardsPerLayer + 1; r++) {
    const rx = stackX - stackWidth / 2 + 0.12 + r * (plankW + 0.04);
    timber(
      surface,
      [rx, roofY, stackZ - plankLen / 2 - 0.12],
      [rx, roofY - 0.03, stackZ + plankLen / 2 + 0.12],
      [plankW / 2 + 0.01, 0.02],
      WEATHERED,
      { ref: [0, 1, 0], bevel: 0.006, shade: 0.76 + random() * 0.1 }
    );
  }

  // ---------------------------------------------------------------------------
  // 4. WOODCUTTER'S SHAVING HORSE BENCH (Front Right: x ~ 1.5, z ~ 1.1)
  // ---------------------------------------------------------------------------
  const horseX = 1.45;
  const horseZ = 1.15;
  const horseYaw = -0.25;
  const cosH = Math.cos(horseYaw);
  const sinH = Math.sin(horseYaw);

  function horsePt(lx: number, ly: number, lz: number): THREE.Vector3 {
    return new THREE.Vector3(horseX + lx * cosH - lz * sinH, ly, horseZ + lx * sinH + lz * cosH);
  }

  // Angled shaving horse bed plank (~1.4 m long, sloping down toward operator seat)
  const bedStart = horsePt(-0.65, 0.48, 0);
  const bedEnd = horsePt(0.75, 0.40, 0);
  timber(surface, bedStart, bedEnd, [0.12, 0.035], WARM, {
    ref: [0, 1, 0],
    bevel: 0.008,
    shade: 0.9,
  });

  // Raised working head / anvil block at front of bed
  const anvilA = horsePt(-0.55, 0.52, 0);
  const anvilB = horsePt(-0.15, 0.56, 0);
  timber(surface, anvilA, anvilB, [0.09, 0.04], WARM, {
    ref: [0, 1, 0],
    bevel: 0.008,
    shade: 0.86,
  });

  // 4 Splayed rustic timber legs
  const legOffsets = [
    [-0.55, -0.16],
    [-0.55, 0.16],
    [0.65, -0.18],
    [0.65, 0.18],
  ] as const;

  for (const [lx, lz] of legOffsets) {
    const topPt = horsePt(lx, 0.44, lz * 0.6);
    const btmPt = horsePt(lx + (lx > 0 ? 0.08 : -0.08), 0.02, lz * 1.5);
    timber(surface, topPt, btmPt, [0.032, 0.032], WEATHERED, {
      ref: [1, 0, 0],
      bevel: 0.006,
      shade: 0.82,
    });
  }

  // Pivoting swinging dumbhead clamp arm passing vertically through bed slot
  const pivotTop = horsePt(-0.28, 0.66, 0);
  const pivotBtm = horsePt(-0.25, 0.12, 0);
  timber(surface, pivotTop, pivotBtm, [0.045, 0.03], WEATHERED, {
    ref: [0, 1, 0],
    bevel: 0.006,
    shade: 0.8,
  });

  // Horizontal clamping crosshead block
  const clampL = horsePt(-0.28, 0.66, -0.14);
  const clampR = horsePt(-0.28, 0.66, 0.14);
  timber(surface, clampL, clampR, [0.035, 0.035], WARM, {
    ref: [0, 1, 0],
    bevel: 0.006,
    shade: 0.88,
  });

  // Foot treadle crossbar at the bottom
  const treadleL = horsePt(-0.25, 0.12, -0.18);
  const treadleR = horsePt(-0.25, 0.12, 0.18);
  timber(surface, treadleL, treadleR, [0.028, 0.028], WEATHERED, {
    ref: [0, 1, 0],
    bevel: 0.005,
    shade: 0.78,
  });

  // Two-handled iron drawknife resting across the clamping bridge
  const dkHandleL = horsePt(-0.22, 0.61, -0.22);
  const dkHandleR = horsePt(-0.22, 0.61, 0.22);

  // Curved steel blade
  timber(
    surface,
    horsePt(-0.26, 0.59, -0.16),
    horsePt(-0.26, 0.59, 0.16),
    [0.016, 0.006],
    IRON,
    { ref: [0, 1, 0], shade: 0.98 }
  );
  // Tangs and turned wooden handles
  timber(surface, horsePt(-0.26, 0.59, -0.16), dkHandleL, [0.006, 0.006], IRON, { ref: [0, 1, 0] });
  timber(surface, horsePt(-0.26, 0.59, 0.16), dkHandleR, [0.006, 0.006], IRON, { ref: [0, 1, 0] });
  timber(
    surface,
    horsePt(-0.22, 0.61, -0.18),
    horsePt(-0.16, 0.63, -0.25),
    [0.018, 0.018],
    HONEY,
    { ref: [0, 1, 0], bevel: 0.004, shade: 0.95 }
  );
  timber(
    surface,
    horsePt(-0.22, 0.61, 0.18),
    horsePt(-0.16, 0.63, 0.25),
    [0.018, 0.018],
    HONEY,
    { ref: [0, 1, 0], bevel: 0.004, shade: 0.95 }
  );

  // Curled wood shavings scattered under the shaving horse
  for (let s = 0; s < 7; s++) {
    const sa = random() * Math.PI * 2;
    const sd = 0.15 + random() * 0.22;
    const sp = horsePt(-0.28 + Math.cos(sa) * sd, 0.02, Math.sin(sa) * sd);
    timber(
      surface,
      sp,
      new THREE.Vector3(sp.x + (random() - 0.5) * 0.1, 0.04, sp.z + (random() - 0.5) * 0.1),
      [0.014, 0.004],
      HONEY,
      { ref: [0, 1, 0], shade: 1.0 }
    );
  }

  // ---------------------------------------------------------------------------
  // 5. SPLIT CORDWOOD STACK & CHOPPING STUMP (Rear Left: x ~ -2.7, z ~ -0.9)
  // ---------------------------------------------------------------------------
  const cordX = -2.65;
  const cordZ = -0.9;
  const cordLen = 1.85;

  // Two vertical driven stakes bounding the stack ends
  for (const cx of [cordX - cordLen / 2, cordX + cordLen / 2]) {
    timber(
      surface,
      [cx, 0.02, cordZ],
      [cx, 1.15, cordZ],
      [0.04, 0.04],
      WEATHERED,
      { ref: [0, 0, 1], bevel: 0.006, shade: 0.8 }
    );
  }

  // Ground bearer sticks for cordwood
  for (const bx of [cordX - cordLen / 2 + 0.2, cordX + cordLen / 2 - 0.2]) {
    timber(
      surface,
      [bx, 0.04, cordZ - 0.25],
      [bx, 0.04, cordZ + 0.25],
      [0.03, 0.03],
      WEATHERED,
      { ref: [0, 1, 0], shade: 0.78 }
    );
  }

  // Neatly stacked triangular / quarter-split cordwood billets (4 tiers)
  const cordTiers = 4;
  const logsPerTier = 6;
  const billetLen = 0.46;
  for (let tier = 0; tier < cordTiers; tier++) {
    const cy = 0.10 + tier * 0.16;
    for (let k = 0; k < logsPerTier; k++) {
      const cx = cordX - cordLen / 2 + 0.18 + k * 0.26 + (random() - 0.5) * 0.03;
      // Triangular wedge split billet
      timber(
        surface,
        [cx, cy, cordZ - billetLen / 2],
        [cx, cy, cordZ + billetLen / 2],
        [0.07, 0.06],
        WARM,
        {
          ref: [0, 1, 0],
          bevel: 0.015,
          halfEnd: [0.065, 0.055],
          shade: 0.85 + random() * 0.15,
        }
      );
      // Bark face on back edge
      surface.addBox(
        [cx - 0.06, cy - 0.05, cordZ - billetLen / 2],
        [cx + 0.06, cy + 0.05, cordZ - billetLen / 2 + 0.015],
        [0.06, 0.05],
        { ref: [0, 1, 0], token: BARK, shade: 0.8 }
      );
    }
  }

  // Heavy birch chopping stump block
  const stumpX = cordX + 0.85;
  const stumpZ = cordZ + 0.85;
  const stumpH = 0.52;
  const stumpR = 0.28;

  surface.addLoft(
    [
      { p: [stumpX, 0, stumpZ], w: stumpR * 1.05, h: stumpR * 1.05 },
      { p: [stumpX, stumpH * 0.5, stumpZ], w: stumpR, h: stumpR },
      { p: [stumpX, stumpH, stumpZ], w: stumpR * 0.96, h: stumpR * 0.96 },
    ],
    {
      sides: 9,
      ref: [0, 0, 1],
      capStart: 0,
      capEnd: 0,
      flat: true,
      radial: lumps(55, 0.06),
      token: BARK,
      shade: 0.88,
    }
  );
  // Sawn top surface of chopping block with radial knife checks
  surface.addDisc([stumpX, stumpH + 0.004, stumpZ], [0, 1, 0], stumpR * 0.95, {
    token: HONEY,
    sides: 9,
    shade: 0.92,
  });
  surface.addDisc([stumpX, stumpH + 0.007, stumpZ], [0, 1, 0], stumpR * 0.35, {
    token: WARM,
    sides: 7,
    shade: 0.82,
  });

  // Forged Iron Felling Axe embedded into the chopping stump
  const axeBitY = stumpH + 0.02;
  // Iron axe head
  surface.addBox(
    [stumpX - 0.03, axeBitY, stumpZ - 0.08],
    [stumpX + 0.03, axeBitY + 0.12, stumpZ + 0.10],
    [0.016, 0.05],
    { ref: [0, 1, 0], token: IRON, shade: 0.96 }
  );
  // Curved ash wood axe haft (handle) leaning upward
  timber(
    surface,
    [stumpX, axeBitY + 0.08, stumpZ + 0.04],
    [stumpX + 0.22, axeBitY + 0.72, stumpZ + 0.38],
    [0.018, 0.024],
    HONEY,
    { ref: [1, 0, 0], bevel: 0.004, shade: 0.94 }
  );

  // Scattered chopped firewood chips around the stump base
  for (let c = 0; c < 8; c++) {
    const ca = random() * Math.PI * 2;
    const cd = stumpR + 0.12 + random() * 0.25;
    const cx = stumpX + Math.cos(ca) * cd;
    const cz = stumpZ + Math.sin(ca) * cd;
    timber(
      surface,
      [cx, 0.02, cz],
      [cx + (random() - 0.5) * 0.08, 0.05, cz + (random() - 0.5) * 0.08],
      [0.02, 0.015],
      HONEY,
      { ref: [0, 1, 0], bevel: 0.003, shade: 0.95 }
    );
  }

  // ---------------------------------------------------------------------------
  // Build and attach mesh + collision markers
  // ---------------------------------------------------------------------------
  root.add(surface.buildMesh(`${ID}_mesh`));
  addCollisionMarkers(spec, root);

  return { root, clips: [] };
}
