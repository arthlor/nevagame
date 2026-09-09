import * as THREE from "three";

export interface ScreenProjection {
  /** The point is in front of the camera and inside the safe viewport rect. */
  onScreen: boolean;
  /** Viewport pixels. Off-screen, this is the clamped position on the edge. */
  x: number;
  /** Viewport pixels. Off-screen, this is the clamped position on the edge. */
  y: number;
  /**
   * Which way the target lies, in degrees, 0 pointing up the screen and
   * increasing clockwise. Only meaningful when `onScreen` is false.
   */
  angleDeg: number;
}

export interface Viewport {
  width: number;
  height: number;
}

const viewSpace = new THREE.Vector3();

/**
 * Projects a world point into viewport pixels, and — when it does not land on
 * screen — onto the edge of a rect inset by `edgeMargin`, along with the
 * bearing an arrow there should point.
 *
 * The case that matters is a target *behind* the camera. `Vector3.project`
 * divides by a negative w there, which silently mirrors the point into the
 * opposite corner: an objective directly behind you renders an arrow pointing
 * forwards. So the perspective divide is done here with the sign of w kept, and
 * a behind-camera point is flipped back and forced off-screen.
 */
export function projectWorldToScreen(
  world: { x: number; y: number; z: number },
  camera: THREE.Camera,
  viewport: Viewport,
  edgeMargin = 56
): ScreenProjection {
  viewSpace.set(world.x, world.y, world.z).applyMatrix4(camera.matrixWorldInverse);
  // Cameras look down -z in view space, so a non-negative z is behind the lens.
  const behind = viewSpace.z >= 0;
  viewSpace.applyMatrix4(camera.projectionMatrix);

  let ndcX = viewSpace.x;
  let ndcY = viewSpace.y;
  if (behind) {
    ndcX = -ndcX;
    ndcY = -ndcY;
  }

  const screenX = (ndcX * 0.5 + 0.5) * viewport.width;
  const screenY = (-ndcY * 0.5 + 0.5) * viewport.height;

  const centreX = viewport.width / 2;
  const centreY = viewport.height / 2;
  const halfWidth = Math.max(1, centreX - edgeMargin);
  const halfHeight = Math.max(1, centreY - edgeMargin);

  const onScreen =
    !behind &&
    Number.isFinite(screenX) &&
    Number.isFinite(screenY) &&
    Math.abs(screenX - centreX) <= halfWidth &&
    Math.abs(screenY - centreY) <= halfHeight;

  if (onScreen) {
    return { onScreen: true, x: screenX, y: screenY, angleDeg: 0 };
  }

  let dx = screenX - centreX;
  let dy = screenY - centreY;
  // A target exactly on the camera axis behind the player has no direction of
  // its own. Point straight down, which reads as "turn around".
  if (!Number.isFinite(dx) || !Number.isFinite(dy) || (dx === 0 && dy === 0)) {
    dx = 0;
    dy = 1;
  }

  const scale = Math.min(
    halfWidth / Math.max(Math.abs(dx), 1e-6),
    halfHeight / Math.max(Math.abs(dy), 1e-6)
  );

  return {
    onScreen: false,
    x: centreX + dx * scale,
    y: centreY + dy * scale,
    angleDeg: (Math.atan2(dx, -dy) * 180) / Math.PI
  };
}
