import { GROUND_POLYGON_CELL_GLSL } from "./GroundPolygonCells";

/** Shared vertex contract for all world-XZ ground surface materials. */
export const SURFACE_FIELD_VERTEX_DECLARATIONS = `
attribute vec4 surfaceWeights0;
attribute vec4 surfaceWeights1;
attribute vec4 surfaceCauses;
varying vec4 vSurfaceWeights0;
varying vec4 vSurfaceWeights1;
varying vec4 vSurfaceCauses;`;

export const SURFACE_FIELD_VERTEX_ASSIGNMENTS = `
vSurfaceWeights0 = max(surfaceWeights0, vec4(0.0));
vSurfaceWeights1 = max(surfaceWeights1, vec4(0.0));
vSurfaceCauses = max(surfaceCauses, vec4(0.0));`;

/** Shared field helpers. High-frequency cell terms are filtered by the caller's
 * material stages and remain in stable world-XZ coordinates. */
export const SURFACE_FIELD_FRAGMENT_GLSL = `${GROUND_POLYGON_CELL_GLSL}
varying vec4 vSurfaceWeights0;
varying vec4 vSurfaceWeights1;
varying vec4 vSurfaceCauses;

float nevaSurfaceGrassWeight() {
  return clamp(vSurfaceWeights0.x, 0.0, 1.0);
}

float nevaSurfaceMeadowWeight() {
  return clamp(vSurfaceWeights0.y, 0.0, 1.0);
}

float nevaSurfaceDrySoilWeight() {
  return clamp(vSurfaceWeights0.z, 0.0, 1.0);
}

float nevaSurfaceDampSoilWeight() {
  return clamp(vSurfaceWeights0.w, 0.0, 1.0);
}

float nevaSurfacePathWeight() {
  return clamp(vSurfaceWeights1.x, 0.0, 1.0);
}

float nevaSurfaceShoulderWeight() {
  return clamp(vSurfaceWeights1.y, 0.0, 1.0);
}

float nevaSurfaceBeachWeight() {
  return clamp(vSurfaceWeights1.z, 0.0, 1.0);
}

float nevaSurfaceRiverbedWeight() {
  return clamp(vSurfaceWeights1.w, 0.0, 1.0);
}

float nevaSurfaceWetShorelineWeight() {
  return clamp(vSurfaceCauses.x, 0.0, 1.0);
}

float nevaSurfaceCliffWeight() {
  return clamp(vSurfaceCauses.y, 0.0, 1.0);
}

float nevaSurfaceFarmInfluence() {
  return clamp(vSurfaceCauses.z, 0.0, 1.0);
}

float nevaSurfaceWetness() {
  return clamp(vSurfaceCauses.w, 0.0, 1.0);
}

float nevaSurfaceWeatherWetness(float weatherWetness) {
  return clamp(
    max(
      nevaSurfaceWetness() * clamp(weatherWetness, 0.0, 1.0),
      nevaSurfaceDampSoilWeight() * 0.42
    ),
    0.0,
    1.0
  );
}

float nevaSurfaceRoughness(float dryRoughness, float wetRoughness, float weatherWetness) {
  return mix(dryRoughness, wetRoughness, nevaSurfaceWeatherWetness(weatherWetness));
}

float nevaSurfaceTransitionWeight(float pathStrength, float edgeStrength) {
  return clamp(
    nevaSurfacePathWeight() * pathStrength
      + (
        nevaSurfaceShoulderWeight()
        + nevaSurfaceBeachWeight()
        + nevaSurfaceRiverbedWeight()
        + nevaSurfaceWetShorelineWeight()
        + nevaSurfaceCliffWeight()
      ) * edgeStrength
      + nevaSurfaceFarmInfluence() * edgeStrength * 0.35,
    0.0,
    1.0
  );
}

vec3 nevaSurfaceWeightedPalette(
  vec3 grassColor,
  vec3 meadowColor,
  vec3 drySoilColor,
  vec3 dampSoilColor,
  vec3 pathColor,
  vec3 shoulderColor,
  vec3 beachColor,
  vec3 riverbedColor,
  vec3 wetShorelineColor,
  vec3 cliffColor,
  vec3 fallbackColor
) {
  float total =
    nevaSurfaceGrassWeight()
    + nevaSurfaceMeadowWeight()
    + nevaSurfaceDrySoilWeight()
    + nevaSurfaceDampSoilWeight()
    + nevaSurfacePathWeight()
    + nevaSurfaceShoulderWeight()
    + nevaSurfaceBeachWeight()
    + nevaSurfaceRiverbedWeight()
    + nevaSurfaceWetShorelineWeight()
    + nevaSurfaceCliffWeight();
  if (total <= 0.0001) return fallbackColor;
  return (
    grassColor * nevaSurfaceGrassWeight()
    + meadowColor * nevaSurfaceMeadowWeight()
    + drySoilColor * nevaSurfaceDrySoilWeight()
    + dampSoilColor * nevaSurfaceDampSoilWeight()
    + pathColor * nevaSurfacePathWeight()
    + shoulderColor * nevaSurfaceShoulderWeight()
    + beachColor * nevaSurfaceBeachWeight()
    + riverbedColor * nevaSurfaceRiverbedWeight()
    + wetShorelineColor * nevaSurfaceWetShorelineWeight()
    + cliffColor * nevaSurfaceCliffWeight()
  ) / total;
}

vec3 nevaSurfaceFacetNormal(vec3 baseNormal, vec4 cell, float strength, float mask) {
  vec3 facetAxis = abs(baseNormal.y) > 0.92
    ? vec3(1.0, 0.0, 0.0)
    : vec3(0.0, 1.0, 0.0);
  vec3 facetTangent = normalize(cross(facetAxis, baseNormal));
  vec3 facetBitangent = cross(baseNormal, facetTangent);
  return normalize(
    baseNormal + mask * strength * (
      facetTangent * (cell.y - 0.5)
      + facetBitangent * (cell.z - 0.5)
    ) * 2.4
  );
}`;
