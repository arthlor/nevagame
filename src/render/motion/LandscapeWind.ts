import { CANONICAL_RENDER_CONFIG } from "../config/VisualRenderConfig";

const wind = CANONICAL_RENDER_CONFIG.vegetationWind;

/** A shared traveling front for rooted cover and canopy, in world meters. */
export const LANDSCAPE_WIND_GLSL = /* glsl */ `
float nevaLandscapeGust(vec2 root, vec2 heading, float seconds) {
  vec2 crosswind = vec2(-heading.y, heading.x);
  float along = dot(root, heading);
  float across = dot(root, crosswind);
  float phase = (along - seconds * ${wind.gustTravelMetersPerSecond.toFixed(6)})
    * ${ (Math.PI * 2 / wind.gustWavelengthMeters).toFixed(6) };
  float front = sin(phase + sin(across * 0.043) * 0.65) * 0.5 + 0.5;
  return 0.24 + 0.76 * front * front;
}
// Placement yaw and scale must not rotate the weather into another heading.
vec3 nevaWindWorldToLocal(vec3 offset, mat4 worldFromLocal) {
  return vec3(
    dot(offset, worldFromLocal[0].xyz) / max(0.000001, dot(worldFromLocal[0].xyz, worldFromLocal[0].xyz)),
    dot(offset, worldFromLocal[1].xyz) / max(0.000001, dot(worldFromLocal[1].xyz, worldFromLocal[1].xyz)),
    dot(offset, worldFromLocal[2].xyz) / max(0.000001, dot(worldFromLocal[2].xyz, worldFromLocal[2].xyz))
  );
}
`;
