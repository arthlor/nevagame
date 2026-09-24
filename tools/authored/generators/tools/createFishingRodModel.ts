import * as THREE from "three";

import {
  SurfaceBuilder, addGripMarker, addMarker,
  type AuthoredModel, type FaceContext, type GeneratorContext, type Station, type V3
} from "../../kit";
import { rope, v3 } from "../props/parts";

/** Palette roles and construction per rod tier. Token fields index the catalog palette. */
interface RodStyle {
  grip: number;
  blank: number;
  seat: number;
  metal: number;
  wrap: number;
  line: number;
  /** Reel side plates / drum. */
  reelBody: number;
  knob: number;
  gripShape: "turned" | "cork" | "wrapped";
  reel: "fly" | "star";
  butt: "cap" | "gimbal";
  /** A six-sided split-cane blank with alternating strip tones instead of a round one. */
  splitCane: boolean;
  /** Blank thickness scale. */
  gauge: number;
  /** Willow: branch nodes swelling along the blank and a slight natural wander. */
  knots: boolean;
  /** Decorative whipping bands between guides. */
  bands: number;
  /** A roller tip-top instead of a ring. */
  roller: boolean;
  /** Spoked front plate on the fly reel. */
  spokes: boolean;
}

const STYLES: Record<string, RodStyle> = {
  willow: {
    grip: 0, blank: 1, seat: 1, metal: 2, wrap: 3, line: 4, reelBody: 1, knob: 0,
    gripShape: "turned", reel: "fly", butt: "cap", splitCane: false, gauge: 1.05, knots: true, bands: 0, roller: false, spokes: false
  },
  river: {
    grip: 0, blank: 1, seat: 1, metal: 2, wrap: 3, line: 4, reelBody: 1, knob: 0,
    gripShape: "cork", reel: "fly", butt: "cap", splitCane: false, gauge: 1, knots: false, bands: 2, roller: false, spokes: false
  },
  heavy_sport: {
    grip: 1, blank: 0, seat: 0, metal: 2, wrap: 3, line: 4, reelBody: 0, knob: 0,
    gripShape: "wrapped", reel: "star", butt: "gimbal", splitCane: false, gauge: 1.2, knots: false, bands: 1, roller: false, spokes: false
  },
  offshore: {
    grip: 0, blank: 1, seat: 1, metal: 2, wrap: 3, line: 4, reelBody: 1, knob: 0,
    gripShape: "turned", reel: "star", butt: "gimbal", splitCane: false, gauge: 1.3, knots: false, bands: 1, roller: true, spokes: false
  },
  master: {
    grip: 0, blank: 1, seat: 1, metal: 2, wrap: 3, line: 4, reelBody: 2, knob: 0,
    gripShape: "cork", reel: "fly", butt: "cap", splitCane: true, gauge: 0.95, knots: false, bands: 0, roller: false, spokes: true
  }
};

const BLANK_BASE = 0.36;
const REEL_Y = 0.15;
const X = new THREE.Vector3(1, 0, 0);

/**
 * Fishing rod, glTF space: the rod runs up +Y from the butt, the reel and guides hang on its +Z side
 * (below the rod in the hand), the reel's handle on the +X side (the angler's left)
 * and the blank carries a slight static curve toward them, metres. The contract with the runtime is
 * unchanged from the Blender rods: `rod_primary_grip` and `rod_secondary_grip` (the reel knob) are
 * palm frames, `rod_line_exit` and the `rod_guide_tiptop` node sit at the tip-top guide, and
 * `FishingRodBend` bends every mesh along the grip-to-tip axis except the reel's rotating parts,
 * `rod_reel_spool`, `rod_reel_line_coil`, `rod_reel_crank_arm` and `rod_reel_handle_knob`, which it
 * turns about the reel axle (+X) through the spool's centre.
 *
 * Redesigned from the Blender rods' three straight tapered beams: the blank is one smooth tapered
 * loft of many stations, so it bends as a continuous curve, with brass ferrules; guides are wire
 * rings on V-feet bound with whippings; the line runs from the reel through every guide. Tiers:
 * `willow`, a natural branch blank with nodes, a turned grip and a wooden reel; `river`, cork rings
 * and reinforcing bands; `heavy_sport`, a leather-wrapped grip, a gimbal butt and a star-drag reel;
 * `offshore`, a heavy dark blank, a big star-drag reel and a roller tip-top; `master`, a hexagonal
 * split-cane blank, an agate stripping guide, tipped silk whippings and a spoked brass reel.
 */
export function createFishingRodModel(context: GeneratorContext): AuthoredModel {
  const { spec } = context;
  const ID = spec.id;
  const p = context.parameters;
  const styleName = String(p.style ?? "willow");
  const style = STYLES[styleName];
  if (!style) throw new Error(`${ID}: unknown rod style ${styleName}`);
  const length = Number(p.length ?? 2.25);
  const guideCount = Math.max(2, Number(p.guideCount ?? 5));
  const bend = Number(p.bendFactor ?? 0.08);
  const spool = Number(p.reelSpoolRadius ?? 0.055);
  const g = style.gauge;

  const root = new THREE.Group();
  root.name = `${ID}_root`;
  const body = new SurfaceBuilder(spec.palette);

  // The blank's centreline and taper.
  const span = length - BLANK_BASE;
  const knotAt = [0.17, 0.39, 0.6, 0.8];
  const blankPoint = (t: number): THREE.Vector3 => new THREE.Vector3(
    style.knots ? 0.004 * Math.sin(t * 9) * t : 0,
    BLANK_BASE + t * span,
    t ** 1.8 * bend
  );
  const blankTangent = (t: number): THREE.Vector3 => blankPoint(Math.min(1, t + 0.001)).sub(blankPoint(Math.max(0, t - 0.001))).normalize();
  const blankRadius = (t: number): number => {
    const base = THREE.MathUtils.lerp(0.0165 * g, 0.0038 * g, t ** 0.85);
    const knot = style.knots ? knotAt.reduce((sum, k) => sum + 0.32 * Math.exp(-(((t - k) / 0.01) ** 2)), 0) : 0;
    return base * (1 + knot);
  };
  /** Toward the guides: perpendicular to the blank, on its +Z side. */
  const guideSide = (t: number): THREE.Vector3 => {
    const tangent = blankTangent(t);
    return new THREE.Vector3(0, -tangent.z, tangent.y).normalize();
  };

  // Butt, rear grip, reel seat, foregrip.
  const turnedTone = (q: THREE.Vector3): number => 0.88 + 0.12 * Math.sin(q.y * 70) ** 2;
  const gripLoft = (profile: ReadonlyArray<readonly [number, number]>, capStart?: number): void => {
    const stations: Station[] = [];
    if (style.gripShape !== "turned") {
      // Cork rings (or leather wraps): a station every ring, each ring faintly pillowed.
      const [y0] = profile[0];
      const [y1] = profile[profile.length - 1];
      const rings = Math.round((y1 - y0) / 0.02);
      for (let i = 0; i <= rings; i += 1) {
        const y = y0 + ((y1 - y0) * i) / rings;
        const r = radiusOn(profile, y) * (i % 2 && style.gripShape === "cork" ? 1.02 : 1);
        stations.push({ p: [0, y, 0], w: r, h: r });
      }
    } else {
      for (const [y, r] of profile) stations.push({ p: [0, y, 0], w: r, h: r });
    }
    const sides = 8;
    body.addLoft(stations, {
      sides, ref: [0, 0, 1], capStart, token: style.grip,
      shade: style.gripShape === "cork"
        ? ({ u, centroid }: FaceContext) => (Math.floor(u) % 2 ? 0.93 : 1.01) * (0.97 + 0.05 * Math.sin(centroid.x * 400 + centroid.z * 300))
        : style.gripShape === "wrapped"
          ? ({ u, theta }: FaceContext) => ((Math.floor(u) + Math.floor((theta / (Math.PI * 2)) * sides + sides)) % 4 < 2 ? 1 : 0.84)
          : 1,
      tone: style.gripShape === "turned" ? turnedTone : undefined
    });
  };
  if (style.butt === "cap") {
    body.addLoft([[-0.362, 0.008], [-0.358, 0.02], [-0.35, 0.025], [-0.322, 0.025], [-0.318, 0.022]]
      .map(([y, r]): Station => ({ p: [0, y, 0], w: r * g, h: r * g })), { sides: 10, ref: [0, 0, 1], capStart: 0.3, token: style.metal });
  } else {
    // Gimbal butt: a brass cup with a cross slot for a fighting belt.
    body.addLoft([[-0.41, 0.022], [-0.405, 0.027], [-0.33, 0.027], [-0.322, 0.024]]
      .map(([y, r]): Station => ({ p: [0, y, 0], w: r * g, h: r * g })), { sides: 12, ref: [0, 0, 1], capStart: 0.05, token: style.metal });
    const slot = 0.026 * g;
    for (const [ax, az] of [[1, 0], [0, 1]]) {
      body.addBox([-ax * slot, -0.4108, -az * slot], [ax * slot, -0.4108, az * slot], [0.004, 0.0015], { ref: [0, 1, 0], token: style.seat, shade: 0.72 });
    }
  }
  gripLoft(style.gripShape === "turned"
    ? [[-0.32, 0.021], [-0.3, 0.025], [-0.2, 0.027], [-0.12, 0.026], [-0.04, 0.023], [0.02, 0.022], [0.05, 0.021]]
    : [[-0.32, 0.023], [-0.28, 0.025], [-0.15, 0.026], [-0.05, 0.024], [0.05, 0.022]]);
  const ringAt = (y: number, r: number, token: number, w = 0.005): void => {
    body.addLoft([[y - w, r * 0.9], [y, r], [y + w, r * 0.9]]
      .map(([yy, rr]): Station => ({ p: [0, yy, 0], w: rr, h: rr })), { sides: 8, ref: [0, 0, 1], capStart: 0, capEnd: 0, token, shade: 0.96 });
  };
  ringAt(0.055, 0.024, style.metal);
  body.addLoft([[0.058, 0.019], [0.24, 0.019]].map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })),
    { sides: 8, ref: [0, 0, 1], token: style.seat, flat: true });
  ringAt(0.085, 0.023, style.metal, 0.009);
  ringAt(0.215, 0.023, style.metal, 0.009);
  ringAt(0.236, 0.025, style.metal, 0.004);
  ringAt(0.25, 0.022, style.metal, 0.003);
  gripLoft([[0.255, 0.022], [0.3, 0.021], [0.34, 0.019], [0.365, 0.0175]]);

  // The blank: one smooth taper from the foregrip to the tip, enough stations to bend as a curve.
  const stationCount = 22;
  body.addLoft(Array.from({ length: stationCount + 1 }, (_, i): Station => {
    const t = i / stationCount;
    const r = blankRadius(t);
    return { p: v3(blankPoint(t)), w: r, h: r };
  }), {
    sides: 6, ref: [1, 0, 0], capEnd: 0.4, token: style.blank, flat: style.splitCane,
    phase: style.splitCane ? Math.PI / 6 : 0,
    shade: style.splitCane
      ? ({ theta }: FaceContext) => (Math.round((theta / (Math.PI * 2)) * 6 + 6) % 2 ? 0.9 : 1.02)
      : undefined,
    tone: style.knots ? (q) => 0.9 + 0.12 * Math.sin(q.y * 23) ** 2 : undefined
  });
  const sleeve = (t: number, halfLength: number, scale: number, token: number, shade = 1): void => {
    const c = blankPoint(t);
    const tangent = blankTangent(t);
    const r = blankRadius(t) * scale;
    body.addLoft([-1, 0, 1].map((k): Station => {
      const rr = k === 0 ? r : r * 0.92;
      return { p: v3(c.clone().addScaledVector(tangent, k * halfLength)), w: rr, h: rr };
    }), { sides: 6, ref: [1, 0, 0], capStart: 0, capEnd: 0, token, shade, phase: style.splitCane ? Math.PI / 6 : 0 });
  };
  for (const t of [0.35, 0.7]) sleeve(t, 0.014, 1.28, style.metal);
  // Winding check where the blank leaves the foregrip.
  sleeve(0.004, 0.006, 1.3, style.wrap);

  // Guides on V-feet, bound with whippings; the last is the tip-top.
  const guides: THREE.Vector3[] = [];
  const shrink = (t: number): number => 1 - t * 0.58;
  for (let i = 0; i < guideCount - 1; i += 1) {
    const t = 0.12 + (i / (guideCount - 1)) * 0.88;
    const b = blankPoint(t);
    const tangent = blankTangent(t);
    const n = guideSide(t);
    const r = blankRadius(t);
    const stripper = i === 0 && style.splitCane;
    const ringR = 0.02 * shrink(t) * (stripper ? 1.2 : 1) * Math.max(1, g * 0.9);
    const wire = 0.0026 * shrink(t) + 0.0008;
    const centre = b.clone().addScaledVector(n, r + ringR + 0.007);
    guides.push(centre);
    rope(body, Array.from({ length: 9 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return centre.clone().addScaledVector(X, Math.cos(a) * ringR).addScaledVector(n, Math.sin(a) * ringR);
    }), wire, style.metal, { sides: 3, caps: false });
    if (stripper) {
      // Agate liner in the stripping guide.
      rope(body, Array.from({ length: 9 }, (_, k) => {
        const a = (k / 8) * Math.PI * 2;
        return centre.clone().addScaledVector(X, Math.cos(a) * (ringR - wire * 1.6)).addScaledVector(n, Math.sin(a) * (ringR - wire * 1.6));
      }), wire * 0.9, style.wrap, { sides: 3, caps: false });
    }
    const foot = 0.02 * shrink(t) + 0.008;
    rope(body, [
      b.clone().addScaledVector(tangent, -foot).addScaledVector(n, r * 0.9),
      centre.clone().addScaledVector(n, -ringR),
      b.clone().addScaledVector(tangent, foot).addScaledVector(n, r * 0.9)
    ], wire * 0.9, style.metal, { sides: 3 });
    const whip = (foot + 0.006) / (span);
    sleeve(t - whip * 0.6, foot * 0.42, 1.08, style.wrap);
    sleeve(t + whip * 0.6, foot * 0.42, 1.08, style.wrap);
    if (style.splitCane) {
      // Tipping: a fine metal ring at the outer end of each whipping.
      sleeve(t - whip * 1.2, 0.0015, 1.2, style.metal);
      sleeve(t + whip * 1.2, 0.0015, 1.2, style.metal);
    }
  }
  // Decorative bands between guides.
  for (let i = 0; i < guideCount - 1; i += 1) {
    const t0 = 0.12 + (i / (guideCount - 1)) * 0.88;
    const t1 = 0.12 + ((i + 1) / (guideCount - 1)) * 0.88;
    for (let k = 1; k <= style.bands; k += 1) sleeve(THREE.MathUtils.lerp(t0, t1, k / (style.bands + 1)), 0.004, 1.12, style.wrap, 0.94);
  }

  // Tip-top: its own node at the guide centre, so the runtime reads its position.
  const tipBlank = blankPoint(1);
  const tipTangent = blankTangent(1);
  const tipN = guideSide(1);
  const tipRing = 0.02 * shrink(1) * 1.1 * Math.max(1, g * 0.9);
  const tipCentre = tipBlank.clone().addScaledVector(tipN, blankRadius(1) + tipRing + 0.004);
  guides.push(tipCentre);
  const tip = new SurfaceBuilder(spec.palette);
  const local = (q: THREE.Vector3): THREE.Vector3 => q.clone().sub(tipCentre);
  // Sleeve over the blank's end and a post up to the ring (or the roller's cheeks).
  const sleeveR = blankRadius(1) * 1.35;
  tip.addLoft([-0.02, -0.004, 0.004].map((d): Station => ({ p: v3(local(tipBlank.clone().addScaledVector(tipTangent, d))), w: sleeveR, h: sleeveR })),
    { sides: 6, ref: [1, 0, 0], capStart: 0, capEnd: 0.5, token: style.metal });
  if (style.roller) {
    for (const side of [-1, 1]) {
      tip.addBox(v3(local(tipBlank.clone().addScaledVector(X, side * 0.008))), v3(local(tipCentre.clone().addScaledVector(tipN, tipRing * 0.4).addScaledVector(X, side * 0.008))),
        [0.002, tipRing * 0.9], { ref: v3(tipTangent), token: style.metal });
    }
    tip.addLoft([[-0.007, tipRing * 0.55], [-0.005, tipRing * 0.75], [0.005, tipRing * 0.75], [0.007, tipRing * 0.55]]
      .map(([x, r]): Station => ({ p: [x, 0, 0], w: r, h: r })), { sides: 10, ref: [0, 1, 0], capStart: 0.2, capEnd: 0.2, token: style.wrap });
  } else {
    rope(tip, [local(tipBlank.clone().addScaledVector(tipN, blankRadius(1))), local(tipCentre.clone().addScaledVector(tipN, -tipRing))], 0.0022, style.metal, { sides: 3 });
    rope(tip, Array.from({ length: 9 }, (_, k) => {
      const a = (k / 8) * Math.PI * 2;
      return new THREE.Vector3().addScaledVector(X, Math.cos(a) * tipRing).addScaledVector(tipN, Math.sin(a) * tipRing);
    }), 0.0026, style.metal, { sides: 4, caps: false });
  }
  const tipMesh = tip.buildMesh("rod_guide_tiptop");
  tipMesh.position.copy(tipCentre);
  root.add(tipMesh);
  addMarker("rod_line_exit", v3(tipCentre), "line_exit", root);

  // The reel hangs below the rod (+Z, with the guides) and its handle is on
  // the rod's +X side: held in the right hand that is the angler's left, a
  // left-hand retrieve, so the left hand cranks just below and ahead of the
  // right hand instead of reaching across it.
  const H = 1;
  const fly = style.reel === "fly";
  const frameR = spool * (fly ? 1.15 : 1.2);
  const reelZ = 0.034 + frameR;
  const centre = new THREE.Vector3(0, REEL_Y, reelZ);
  const half = fly ? 0.017 + spool * 0.1 : 0.026 + spool * 0.16;
  const at = (x: number, dy: number, dz: number): V3 => [x, REEL_Y + dy, reelZ + dz];
  // Foot under the hoods and the stem out to the frame.
  body.addBox([0, 0.09, 0.022], [0, 0.21, 0.022], [0.012, 0.0035], { ref: [0, 0, 1], token: style.metal, bevel: 0.002 });
  body.addBox([0, REEL_Y, 0.02], [0, REEL_Y, reelZ - frameR * 0.85], [0.008, 0.016], { ref: [0, 1, 0], token: style.metal, bevel: 0.002 });
  const plate = (x0: number, x1: number, r: number, token: number, shade = 1): void => {
    body.addLoft([[x0, r * 0.94], [x0 + 0.0015, r], [x1 - 0.0015, r], [x1, r * 0.94]]
      .map(([x, rr]): Station => ({ p: [x, REEL_Y, reelZ], w: rr, h: rr })), { sides: 12, ref: [0, 1, 0], capStart: 0, capEnd: 0, token, shade });
    for (const [x, face] of [[x0, -1], [x1, 1]] as const) body.addDisc([x, REEL_Y, reelZ], [face, 0, 0], r * 0.94, { token, sides: 12, shade: shade * 0.96 });
  };
  const pillar = (angle: number, r: number): void => {
    const dy = Math.cos(angle) * r;
    const dz = Math.sin(angle) * r;
    rope(body, [at(-half, dy, dz), at(half, dy, dz)], fly ? 0.0035 : 0.005, style.metal, { sides: 5 });
  };
  if (fly) {
    // Back plate on the frame, away from the handle; the front plate turns with the spool.
    if (H > 0) plate(-half - 0.006, -half, frameR, style.reelBody);
    else plate(half, half + 0.006, frameR, style.reelBody);
    for (const a of [Math.PI * 0.95, Math.PI * 0.55, Math.PI * 1.35]) pillar(a, frameR * 0.92);
    body.addDisc([-H * (half + 0.0065), REEL_Y, reelZ], [-H, 0, 0], frameR * 0.28, { token: style.metal, sides: 10, dome: 0.004 });
  } else {
    // Two side plates with brass rims, pillars below, a star drag on the handle side.
    for (const [x0, x1] of [[-half - 0.012, -half], [half, half + 0.012]] as const) {
      plate(x0, x1, frameR, style.reelBody);
      const rimX = x0 < 0 ? x0 : x1;
      rope(body, Array.from({ length: 13 }, (_, k) => {
        const a = (k / 12) * Math.PI * 2;
        return new THREE.Vector3(rimX, REEL_Y + Math.cos(a) * frameR, reelZ + Math.sin(a) * frameR);
      }), 0.0035, style.metal, { sides: 3, caps: false });
    }
    for (const a of [Math.PI * 0.75, Math.PI, Math.PI * 1.25]) pillar(a, frameR * 0.9);
    // Thumb bar across the top.
    rope(body, [at(-half, frameR * 0.92, -frameR * 0.1), at(half, frameR * 0.92, -frameR * 0.1)], 0.005, style.metal, { sides: 5 });
    const starX = H * (half + 0.012);
    body.addLoft([[starX, 0.016], [starX + H * 0.006, 0.013], [starX + H * 0.012, 0.009]].map(([x, r]): Station => ({ p: [x, REEL_Y, reelZ], w: r, h: r })),
      { sides: 10, ref: [0, 1, 0], capStart: 0, token: style.metal });
    const starR = spool * 0.55;
    body.addPanel({
      cols: 20, rows: 1, thickness: 0.004, wrap: true,
      point: (u, v) => {
        const a = u * Math.PI * 2;
        const point = 0.5 + 0.5 * Math.cos(a * 5);
        const r = THREE.MathUtils.lerp(0.012, starR * (0.55 + 0.45 * point ** 3), v);
        return new THREE.Vector3(starX + H * 0.004, REEL_Y + Math.cos(a) * r, reelZ + Math.sin(a) * r);
      },
      token: () => style.metal, shade: () => 0.96
    });
  }

  // Rotating parts: each its own mesh, named for the runtime, built about the reel axle.
  const spoolSurface = new SurfaceBuilder(spec.palette);
  const drumHalf = fly ? half : half - 0.002;
  const rimR = fly ? frameR * 0.97 : frameR * 0.9;
  spoolSurface.addLoft([
    [-drumHalf, rimR], [-drumHalf + 0.003, rimR], [-drumHalf + 0.004, spool * 0.5],
    [drumHalf - 0.004, spool * 0.5], [drumHalf - 0.003, rimR], [drumHalf, rimR]
  ].map(([x, r]): Station => ({ p: [x, REEL_Y, reelZ], w: r, h: r })), {
    sides: 12, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: fly ? style.reelBody : style.seat, shade: 0.94
  });
  if (fly) {
    // The front plate: solid, or spoked with open windows.
    spoolSurface.addPanel({
      cols: style.spokes ? 20 : 12, rows: style.spokes ? 3 : 1, thickness: 0.004, wrap: true,
      point: (u, v) => {
        const a = u * Math.PI * 2;
        const r = THREE.MathUtils.lerp(spool * 0.2, frameR, v);
        return new THREE.Vector3(drumHalf + 0.002, REEL_Y + Math.cos(a) * r, reelZ + Math.sin(a) * r);
      },
      inside: (u, v) => !style.spokes || v < 0.34 || v > 0.67 || Math.floor(u * 20) % 4 === 0,
      token: (_, v) => (style.spokes && v > 0.67 ? style.metal : style.reelBody),
      shade: (_, v) => (style.spokes && v > 0.67 ? 1.02 : 0.96)
    });
  }
  if (fly) spoolSurface.addDisc([H * (drumHalf + 0.004), REEL_Y, reelZ], [H, 0, 0], spool * 0.2, { token: style.metal, sides: 10, dome: 0.004 });
  root.add(spoolSurface.buildMesh("rod_reel_spool"));

  const coil = new SurfaceBuilder(spec.palette);
  const coilR = spool * 0.78;
  coil.addLoft([-drumHalf + 0.004, drumHalf - 0.004].map((x): Station => ({ p: [x, REEL_Y, reelZ], w: coilR, h: coilR })), {
    sides: 12, ref: [0, 1, 0], capStart: 0, capEnd: 0, token: style.line,
    shade: ({ theta }: FaceContext) => (Math.round((theta / (Math.PI * 2)) * 12 + 12) % 2 ? 0.94 : 1)
  });
  root.add(coil.buildMesh("rod_reel_line_coil"));

  const armX = H * (fly ? drumHalf + 0.008 : half + 0.028);
  const armLength = spool * 0.8;
  const crank = new SurfaceBuilder(spec.palette);
  crank.addBox([armX, REEL_Y - armLength * (fly ? 0.3 : 0.55), reelZ], [armX, REEL_Y + armLength, reelZ], [0.0035, fly ? 0.0065 : 0.009],
    { ref: [1, 0, 0], token: style.metal, bevel: 0.002 });
  crank.addDisc([armX + H * 0.004, REEL_Y, reelZ], [H, 0, 0], fly ? 0.008 : 0.012, { token: style.metal, sides: 8, dome: 0.004 });
  if (!fly) crank.addEllipsoid([armX, REEL_Y - armLength * 0.55, reelZ], [0.008, 0.014, 0.012], { token: style.metal, sides: 8 });
  root.add(crank.buildMesh("rod_reel_crank_arm"));

  const knob = new SurfaceBuilder(spec.palette);
  const knobFrom = armX + H * 0.004;
  const knobTo = knobFrom + H * (fly ? 0.022 : 0.028);
  knob.addLoft([[knobFrom, 0.004], [knobFrom + H * 0.004, 0.009], [knobTo - H * 0.008, fly ? 0.0085 : 0.011], [knobTo - H * 0.002, fly ? 0.0095 : 0.012], [knobTo, 0.006]]
    .map(([x, r]): Station => ({ p: [x, REEL_Y + armLength, reelZ], w: r, h: fly ? r : r * 1.4 })),
  { sides: 8, ref: [0, 1, 0], capStart: 0, capEnd: 0.4, token: style.knob, tone: turnedTone });
  root.add(knob.buildMesh("rod_reel_handle_knob"));

  // Line from the spool, through every guide, to the tip-top.
  const rodward = new THREE.Vector3(0, 0.6, -0.8);
  const lineStart = centre.clone().addScaledVector(rodward, coilR);
  const linePath = [lineStart, ...guides];
  for (let i = 0; i < linePath.length - 1; i += 1) {
    rope(body, [linePath[i], linePath[i + 1]], 0.0014, style.line, { sides: 3, caps: false });
  }
  root.add(body.buildMesh(`${ID}_mesh`));

  // Hands, as a right-handed angler holds a spinning rod. The right palm sits
  // on the reel seat's -X side facing the reel's handle side, thumb along the
  // top of the grip and fingers wrapping down round the reel stem. The grip
  // crosses the palm on the power-grip diagonal, 45 degrees off the finger
  // line, so a little ulnar deviation lays the butt along the forearm. The
  // left hand holds the crank knob from the angler's left, palm towards the
  // reel; the knob spins in the fingers, so only its position binds the hand.
  const wrap = THREE.MathUtils.degToRad(45);
  addGripMarker("rod_primary_grip", [-0.021, 0.13, 0], [0, Math.sin(wrap), Math.cos(wrap)], [1, 0, 0], root);
  addGripMarker("rod_secondary_grip", [(knobFrom + knobTo) / 2, REEL_Y + armLength, reelZ], [-H * 0.45, 0.75, 0.45], [-H, 0, 0], root);
  return { root, clips: [] };
}

/** Radius at a height along a (height, radius) profile. */
function radiusOn(profile: ReadonlyArray<readonly [number, number]>, y: number): number {
  for (let i = 1; i < profile.length; i += 1) {
    const [y0, r0] = profile[i - 1];
    const [y1, r1] = profile[i];
    if (y <= y1) return THREE.MathUtils.lerp(r0, r1, THREE.MathUtils.clamp((y - y0) / (y1 - y0), 0, 1));
  }
  return profile[profile.length - 1][1];
}
