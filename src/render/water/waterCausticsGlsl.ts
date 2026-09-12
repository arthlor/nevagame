/**
 * Local differential refraction on a shallow receiver plane. This estimates
 * focusing from the actual optical normal; it is not a traced caustic map.
 * Both footprints use the same varying bed depth, so sloping bathymetry alone
 * cannot create light patterns under a flat surface.
 */
export const WATER_CAUSTICS_GLSL = /* glsl */ `
  float nevaFootprintArea(vec2 footprint) {
    vec2 dx = dFdx(footprint);
    vec2 dy = dFdy(footprint);
    return abs(dx.x * dy.y - dx.y * dy.x);
  }

  float nevaWaterCausticFocus(vec3 surfacePosition, vec3 normal, float depth, vec3 sunDirection) {
    vec3 incident = -normalize(sunDirection);
    vec3 flatRay = refract(incident, vec3(0.0, 1.0, 0.0), 1.0 / 1.333);
    vec3 bentRay = refract(incident, normal, 1.0 / 1.333);
    vec2 flatFootprint = surfacePosition.xz + flatRay.xz * depth / max(0.2, -flatRay.y);
    vec2 bentFootprint = surfacePosition.xz + bentRay.xz * depth / max(0.2, -bentRay.y);
    float flatArea = nevaFootprintArea(flatFootprint);
    float bentArea = nevaFootprintArea(bentFootprint);
    // Bound foldovers and vanishing screen footprints before division. Keep
    // both focusing and defocusing instead of adding an all-positive glow.
    float ratio = flatArea / max(1e-10, bentArea);
    return (clamp(ratio, 0.75, 1.35) - 1.0) * smoothstep(1e-10, 1e-8, flatArea);
  }
`;
