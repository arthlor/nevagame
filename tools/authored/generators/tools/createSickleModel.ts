import * as THREE from "three";

import { SurfaceBuilder, addGripMarker, type AuthoredModel, type GeneratorContext, type Station } from "../../kit";
import { rope } from "../props/parts";

/**
 * Crescent geometry per style, glTF XY: the blade's back follows a circle about `centre`, from the
 * heel at `heel` degrees sweeping `sweep` degrees to the tip, `width` deep at the heel.
 */
interface SickleStyle {
  centre: readonly [number, number];
  radius: number;
  heel: number;
  sweep: number;
  width: number;
  /** Handle radius scale. */
  girth: number;
}

const STYLES: Record<string, SickleStyle> = {
  classic: { centre: [0.285, 0.205], radius: 0.2, heel: 160, sweep: 212, width: 0.066, girth: 1 },
  // A heavy reaping hook: a deep, wide crescent reaching well past the hand.
  broad: { centre: [0.34, 0.25], radius: 0.255, heel: 158, sweep: 205, width: 0.112, girth: 1.14 },
  // A fine, narrow crescent balanced by a brass pommel.
  balanced: { centre: [0.27, 0.225], radius: 0.215, heel: 162, sweep: 222, width: 0.05, girth: 0.94 }
};

/**
 * Harvest sickle, glTF space, the grip at the origin: the handle runs along +Y and the crescent
 * sweeps out over +X, thin through Z, as the right palm holds it (the runtime docks
 * `tool_primary_grip`, whose frame is unchanged from the Blender sickles).
 *
 * Redesigned from the Blender sickles' runs of angled boxes: the blade is one forged lamina, a true
 * crescent thick along its back and thinning to a bright honed inner edge, joined to the handle by a
 * gooseneck tang through a ferrule; the handle is turned, with a swelling grip and a knob. Styles:
 * `classic` (the starter sickle); `broad`, a deep reaping hook with an ochre twine grip wrap and a
 * hanging loop; `balanced`, a slender blade with a serrated edge, a brass ferrule and a brass
 * counterweight pommel. Palette order: handle wood, forged iron, then the style's accent.
 */
export function createSickleModel(context: GeneratorContext): AuthoredModel {
  const ID = context.spec.id;
  const styleName = String(context.parameters.style ?? "classic");
  const style = STYLES[styleName];
  if (!style) throw new Error(`${ID}: unknown sickle style ${styleName}`);
  const WOOD = 0;
  const IRON = 1;
  const ACCENT = context.spec.palette.length > 2 ? 2 : IRON;
  const root = new THREE.Group();
  root.name = `${ID}_root`;
  addGripMarker("tool_primary_grip", [0.05, 0, 0], [0, 0, -1], [-1, 0, 0], root);
  const surface = new SurfaceBuilder(context.spec.palette);
  const g = style.girth;

  // Turned handle: knob (or pommel), swelling grip, collar.
  const turned: ReadonlyArray<readonly [number, number]> = styleName === "balanced"
    ? [[-0.15, 0.022], [-0.1, 0.024], [-0.02, 0.027], [0.08, 0.025], [0.16, 0.021], [0.175, 0.027], [0.19, 0.027], [0.2, 0.021]]
    : [[-0.19, 0.012], [-0.182, 0.03], [-0.165, 0.034], [-0.15, 0.022], [-0.1, 0.025], [-0.02, 0.028],
      [0.08, 0.026], [0.16, 0.022], [0.175, 0.028], [0.19, 0.028], [0.2, 0.022]];
  surface.addLoft(turned.map(([y, r]): Station => ({ p: [0, y, 0], w: r * g, h: r * g })), {
    sides: 8, ref: [0, 0, 1], capStart: 0.4, token: WOOD,
    tone: (p) => 0.9 + 0.1 * Math.sin((p.y + 0.2) * 40) ** 2
  });
  const FERRULE = styleName === "balanced" ? ACCENT : IRON;
  surface.addLoft([
    { p: [0, 0.198, 0], w: 0.026 * g, h: 0.026 * g },
    { p: [0, 0.206, 0], w: 0.03 * g, h: 0.03 * g },
    { p: [0, 0.232, 0], w: 0.03 * g, h: 0.03 * g },
    { p: [0, 0.24, 0], w: 0.022 * g, h: 0.022 * g }
  ], { sides: 8, ref: [0, 0, 1], capEnd: 0.2, token: FERRULE, shade: 0.9 });

  if (styleName === "balanced") {
    // Brass counterweight pommel: a pear-shaped bulb with a collar and a finial.
    surface.addLoft([[-0.148, 0.022], [-0.16, 0.03], [-0.19, 0.044], [-0.215, 0.042], [-0.232, 0.028], [-0.24, 0.012]]
      .map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })), { sides: 10, ref: [0, 0, 1], capEnd: 0.5, token: ACCENT });
    surface.addLoft([[-0.143, 0.024], [-0.147, 0.029], [-0.151, 0.024]].map(([y, r]): Station => ({ p: [0, y, 0], w: r, h: r })),
      { sides: 10, ref: [0, 0, 1], token: ACCENT, shade: 0.86 });
  }
  if (styleName === "broad") {
    // Ochre twine wrapped round the grip, and a hanging loop through the knob.
    const turns = 11;
    rope(surface, Array.from({ length: turns * 8 + 1 }, (_, i) => {
      const a = (i / 8) * Math.PI * 2;
      const y = -0.13 + (i / (turns * 8)) * 0.19;
      return new THREE.Vector3(Math.cos(a) * 0.03 * g, y, Math.sin(a) * 0.03 * g);
    }), 0.0075, ACCENT, { sides: 3, caps: false });
    rope(surface, Array.from({ length: 11 }, (_, i) => {
      const a = (i / 10) * Math.PI * 2;
      return new THREE.Vector3(0, -0.215 - 0.035 + Math.cos(a) * 0.035, Math.sin(a) * 0.022);
    }), 0.005, ACCENT, { sides: 4, caps: false });
  }

  // Gooseneck tang from the ferrule to the heel of the blade.
  const [cx, cy] = style.centre;
  const onBack = (degrees: number, radius: number): THREE.Vector3 => {
    const a = THREE.MathUtils.degToRad(degrees);
    return new THREE.Vector3(cx + Math.cos(a) * radius, cy + Math.sin(a) * radius, 0);
  };
  rope(surface, [[0, 0.235, 0], [0.018, 0.262, 0], [0.05, 0.278, 0], onBack(style.heel, style.radius - 0.02)], 0.009 * g, IRON, { sides: 6, shade: 0.88 });

  // The blade: u runs heel to tip round the crescent, v from the back to the honed edge. The
  // balanced blade's edge is toothed: every other edge vertex sits a little back.
  const cols = styleName === "balanced" ? 24 : 16;
  const width = (u: number): number => style.width * (1 - u) ** 0.7 + 0.003;
  const tooth = (u: number, v: number): number =>
    styleName === "balanced" && v === 1 && u > 0.05 && u < 0.9 && Math.round(u * cols) % 2 === 1 ? 0.006 : 0;
  surface.addPanel({
    cols, rows: 3,
    thickness: (_, v) => THREE.MathUtils.lerp(0.009 * g, 0.0025, v),
    point: (u, v) => onBack(style.heel - style.sweep * u, style.radius - width(u) * v + tooth(u, v)),
    token: () => IRON,
    shade: (_, v) => (v > 0.66 ? 1.04 : 1),
    tone: (_, v) => 0.8 + 0.2 * v
  });
  if (styleName === "broad") {
    // A forged spine rib along the back of the broad blade.
    rope(surface, Array.from({ length: 9 }, (_, i) => onBack(style.heel - style.sweep * 0.85 * (i / 8), style.radius - 0.008)),
      0.006, IRON, { sides: 5, shade: 0.84, taper: [1, 0.5] });
  }

  root.add(surface.buildMesh(`${ID}_mesh`));
  return { root, clips: [] };
}
