import { LANDSCAPE_WIND_GLSL } from "../motion/LandscapeWind";
import { MEADOW_COLOR_FIELD_GLSL } from "./MeadowColorField";

/**
 * The R2 low-discrepancy step (Roberts 2018). The first N points of the
 * sequence are evenly spread for every N, so drawing a prefix of a patch is a
 * uniform lower density rather than a thinned-out corner.
 */
export const MEADOW_R2_STEP = Object.freeze([0.7548776662466927, 0.5698402909980532] as const);

/** Uniforms, varyings and helpers the blade vertex stage needs. */
export const MEADOW_FIELD_VERTEX_DECLARATIONS = /* glsl */ `
uniform sampler2D meadowHeights;
uniform sampler2D meadowCover;
uniform sampler2D meadowExclusion;
// originX, originZ, step, vertices per side
uniform vec4 meadowGrid;
// originX, originZ, texel meters, texels per side
uniform vec4 meadowExclusionGrid;
// tile size, far blade count at this level, far blade spacing, root sink
uniform vec4 meadowTiles;
// near radius, near fade, outer radius, outer fade
uniform vec4 meadowRadii;
// short height min/max, meadow height min/max
uniform vec4 meadowHeightRange;
// width min/max, far width scale, dry height scale
uniform vec4 meadowWidthRange;
// lean min/max, wind amplitude, presence push
uniform vec4 meadowMotion;
// normal up share, across-width roundness, value jitter, unused
uniform vec4 meadowShading;
uniform float meadowTime;
uniform vec2 meadowWindDir;
uniform float meadowWindStrength;
uniform float meadowMotionScale;
// presence x, z, strength, radius
uniform vec4 meadowPresence;
varying float vMeadowT;
varying vec3 vMeadowRootColor;
varying vec3 vMeadowBodyColor;
varying vec3 vMeadowTipColor;
varying float vMeadowValue;
${LANDSCAPE_WIND_GLSL}
${MEADOW_COLOR_FIELD_GLSL}

uint meadowPcg(uint v) {
  uint state = v * 747796405u + 2891336453u;
  uint word = ((state >> ((state >> 28u) + 4u)) ^ state) * 277803737u;
  return (word >> 22u) ^ word;
}

float meadowUnit(inout uint seed) {
  seed = meadowPcg(seed);
  return float(seed >> 8u) * (1.0 / 16777216.0);
}

float meadowHeightTexel(ivec2 cell) {
  int last = int(meadowGrid.w) - 1;
  return texelFetch(meadowHeights, clamp(cell, ivec2(0), ivec2(last)), 0).r;
}

// The drawn terrain: PlaneGeometry splits each cell along its (0,1)-(1,0) diagonal.
float meadowTerrainHeight(vec2 xz, out vec3 terrainNormal) {
  vec2 grid = (xz - meadowGrid.xy) / meadowGrid.z;
  vec2 cell = clamp(floor(grid), vec2(0.0), vec2(meadowGrid.w - 2.0));
  vec2 f = clamp(grid - cell, 0.0, 1.0);
  ivec2 c = ivec2(cell);
  float h00 = meadowHeightTexel(c);
  float h10 = meadowHeightTexel(c + ivec2(1, 0));
  float h01 = meadowHeightTexel(c + ivec2(0, 1));
  float h11 = meadowHeightTexel(c + ivec2(1, 1));
  // A bilinear gradient keeps neighbouring roots from shading as facets.
  float slopeX = mix(h10 - h00, h11 - h01, f.y) / meadowGrid.z;
  float slopeZ = mix(h01 - h00, h11 - h10, f.x) / meadowGrid.z;
  terrainNormal = normalize(vec3(-slopeX, 1.0, -slopeZ));
  return f.x + f.y <= 1.0
    ? h00 + (h10 - h00) * f.x + (h01 - h00) * f.y
    : h11 + (h01 - h11) * (1.0 - f.x) + (h10 - h11) * (1.0 - f.y);
}

vec2 meadowRotate(vec2 v, float angle) {
  float s = sin(angle);
  float c = cos(angle);
  return vec2(v.x * c - v.y * s, v.x * s + v.y * c);
}
`;

/**
 * Builds one blade from `position = (t, side, bladeIndex)`. The whole blade
 * is resolved here because the normal is needed before `begin_vertex`; the
 * result feeds `transformed` through `meadowLocalPosition`.
 */
export const MEADOW_FIELD_BLADE_VERTEX = /* glsl */ `
vec3 objectNormal = vec3(0.0, 1.0, 0.0);
vec3 meadowLocalPosition = vec3(0.0);
{
  float bladeT = position.x;
  float bladeSide = position.y;
  float bladeIndex = position.z;
  mat4 meadowTileWorld = modelMatrix * instanceMatrix;
  vec3 meadowTileOrigin = meadowTileWorld[3].xyz;
  ivec2 tile = ivec2(floor(meadowTileOrigin.xz / meadowTiles.x + 0.5));
  uint tileSeed = meadowPcg(uint(tile.x + 65536) * 1973u ^ meadowPcg(uint(tile.y + 65536) + 40503u));
  uint shiftSeed = tileSeed;
  vec2 tileShift = vec2(meadowUnit(shiftSeed), meadowUnit(shiftSeed));
  uint seed = meadowPcg(tileSeed ^ (uint(bladeIndex) * 2654435761u));
  vec2 sequence = fract(vec2(0.5) + bladeIndex * vec2(${MEADOW_R2_STEP[0]}, ${MEADOW_R2_STEP[1]}) + tileShift);
  // The sequence is a rank-1 lattice; jitter at the sparse spacing hides its rows.
  vec2 jitter = (vec2(meadowUnit(seed), meadowUnit(seed)) - 0.5) * meadowTiles.z * 0.9;
  vec2 rootXZ = meadowTileOrigin.xz + sequence * meadowTiles.x + jitter;

  vec2 coverUv = ((rootXZ - meadowGrid.xy) / meadowGrid.z + 0.5) / meadowGrid.w;
  vec4 cover = textureLod(meadowCover, coverUv, 0.0);
  vec2 exclusionUv = (rootXZ - meadowExclusionGrid.xy) / (meadowExclusionGrid.z * meadowExclusionGrid.w);
  float exclusion = textureLod(meadowExclusion, exclusionUv, 0.0).r;
  bool inside = all(greaterThanEqual(coverUv, vec2(0.0))) && all(lessThanEqual(coverUv, vec2(1.0)));
  NevaMeadowSample meadowColor = nevaMeadowSample(rootXZ, cover.g, cover.b, cover.a);
  // Semantic cover stays primary. Sparse patch edges reveal a little more
  // ground without cutting holes in the connected low carpet.
  float density = inside
    ? cover.r * (1.0 - smoothstep(0.3, 0.6, exclusion)) * mix(nevaMeadowPatch.x, 1.0, meadowColor.growth)
    : 0.0;
  float survival = meadowUnit(seed);
  // Blades near a density edge shorten instead of popping in and out.
  float presence = smoothstep(survival - 0.14, survival + 0.02, density);

  float anchorDistance = distance(rootXZ, nevaMeadowField.xy);
  float outerFade = 1.0 - smoothstep(meadowRadii.z - meadowRadii.w, meadowRadii.z, anchorDistance);
  float nearFade = bladeIndex >= meadowTiles.y
    ? 1.0 - smoothstep(meadowRadii.x, meadowRadii.x + meadowRadii.y, anchorDistance)
    : 1.0;
  float scale = presence * outerFade * nearFade;

  vec3 terrainNormal;
  float ground = meadowTerrainHeight(rootXZ, terrainNormal) - meadowTiles.w;
  float tallness = clamp(cover.g * (0.45 + 1.05 * meadowColor.growth) - 0.15, 0.0, 1.0);
  float heightPick = meadowUnit(seed);
  float bladeHeight = mix(
    mix(meadowHeightRange.x, meadowHeightRange.y, heightPick),
    mix(meadowHeightRange.z, meadowHeightRange.w, heightPick),
    tallness
  );
  bladeHeight *= mix(1.0, meadowWidthRange.w, cover.b) * mix(nevaMeadowPatch.y, 1.0, meadowColor.growth) * scale;
  float farWidth = mix(1.0, meadowWidthRange.z, smoothstep(meadowRadii.x, meadowRadii.z, anchorDistance));
  float bladeWidth = mix(meadowWidthRange.x, meadowWidthRange.y, meadowUnit(seed)) * farWidth * mix(0.45, 1.0, scale);
  if (scale < 0.02) {
    bladeHeight = 0.0;
    bladeWidth = 0.0;
  }

  // Lean mostly with the local clump so patches read as combed, not random.
  float clumpAngle = nevaMeadowNoise(rootXZ * 0.21 + vec2(17.0, -9.0)) * 6.2831853;
  float ownAngle = meadowUnit(seed) * 6.2831853;
  vec2 leanDirection = normalize(mix(vec2(cos(ownAngle), sin(ownAngle)), vec2(cos(clumpAngle), sin(clumpAngle)), 0.5) + vec2(0.0001));
  vec2 sideDirection = meadowRotate(vec2(-leanDirection.y, leanDirection.x), (meadowUnit(seed) - 0.5) * 0.9);
  float lean = mix(meadowMotion.x, meadowMotion.y, meadowUnit(seed)) * bladeHeight;

  vec2 windDirection = normalize(meadowWindDir + vec2(0.0001));
  float gust = nevaLandscapeGust(rootXZ, windDirection, meadowTime);
  float flutter = sin(meadowTime * 2.1 + meadowUnit(seed) * 23.0);
  float heightShare = bladeHeight / 0.25;
  float sway = meadowMotion.z * meadowWindStrength * meadowMotionScale * heightShare;
  vec2 windBend = windDirection * sway * (0.85 * gust + 0.15 * flutter)
    + vec2(-windDirection.y, windDirection.x) * sway * 0.12 * flutter;
  vec2 away = rootXZ - meadowPresence.xy;
  float awayLength = length(away);
  float push = meadowPresence.z * (1.0 - smoothstep(0.0, meadowPresence.w, awayLength));
  vec2 pushBend = (away / max(awayLength, 0.0001)) * push * meadowMotion.w * heightShare;
  vec2 bend = leanDirection * lean + windBend + pushBend;
  float bendRatio = min(length(bend) / max(bladeHeight, 0.001), 0.92);
  float tipHeight = bladeHeight * sqrt(1.0 - bendRatio * bendRatio);

  // Quadratic curve: rises from the root, then gives way to the bend.
  vec3 control = vec3(bend.x * 0.12, bladeHeight * 0.55, bend.y * 0.12);
  vec3 tip = vec3(bend.x, tipHeight, bend.y);
  float t = bladeT;
  vec3 spine = 2.0 * (1.0 - t) * t * control + t * t * tip;
  vec3 tangent = normalize(2.0 * (1.0 - t) * control + 2.0 * t * (tip - control) + vec3(0.0, 0.0001, 0.0));
  float halfWidth = bladeWidth * 0.5 * mix(0.55, 1.0, smoothstep(0.0, 0.3, t)) * pow(max(1.0 - t, 0.0), 0.75);
  vec3 side = vec3(sideDirection.x, 0.0, sideDirection.y);
  vec3 world = vec3(rootXZ.x, ground, rootXZ.y) + spine + side * bladeSide * halfWidth;

  vec3 faceNormal = normalize(cross(side, tangent));
  if (faceNormal.y < 0.0) faceNormal = -faceNormal;
  vec3 rounded = normalize(faceNormal + side * bladeSide * meadowShading.y);
  objectNormal = normalize(mix(rounded, terrainNormal, meadowShading.x));

  // Tiles are pure translations, so the local offset is the world offset.
  meadowLocalPosition = world - meadowTileOrigin;
  vMeadowT = t;
  vMeadowRootColor = meadowColor.root;
  vMeadowBodyColor = meadowColor.body;
  vMeadowTipColor = meadowColor.tip;
  vMeadowValue = 1.0 + (meadowUnit(seed) - 0.5) * 2.0 * meadowShading.z;
}
`;

export const MEADOW_FIELD_FRAGMENT_DECLARATIONS = /* glsl */ `
// root shade, root roughness, tip roughness, unused
uniform vec4 meadowSurface;
// translucency strength, power
uniform vec2 meadowTranslucency;
varying float vMeadowT;
varying vec3 vMeadowRootColor;
varying vec3 vMeadowBodyColor;
varying vec3 vMeadowTipColor;
varying float vMeadowValue;
`;

export const MEADOW_FIELD_COLOR_FRAGMENT = /* glsl */ `
float meadowT = clamp(vMeadowT, 0.0, 1.0);
vec3 meadowBladeColor = mix(
  mix(vMeadowRootColor, vMeadowBodyColor, smoothstep(0.0, 0.45, meadowT)),
  vMeadowTipColor,
  smoothstep(0.35, 1.0, meadowT)
);
meadowBladeColor *= mix(meadowSurface.x, 1.0, smoothstep(0.0, 0.55, meadowT)) * vMeadowValue;
diffuseColor.rgb = meadowBladeColor;
`;

/**
 * Both faces of a blade share one up-biased normal: without the DoubleSide
 * flip a back face shades like the meadow around it, not like a dark card.
 */
export const MEADOW_FIELD_NORMAL_FRAGMENT = /* glsl */ `
normal = normalize(vNormal);
nonPerturbedNormal = normal;
`;

export const MEADOW_FIELD_ROUGHNESS_FRAGMENT = /* glsl */ `
roughnessFactor = mix(meadowSurface.y, meadowSurface.z, smoothstep(0.2, 1.0, clamp(vMeadowT, 0.0, 1.0)));
`;

/**
 * Sunlight through a backlit upper blade. It rides the standard direct-light
 * path, so the cast shadow and cloud shade already in `directLight.color`
 * dim it exactly as they dim the lit face.
 */
export const MEADOW_FIELD_TRANSLUCENCY = /* glsl */ `
void RE_Direct_Meadow( const in IncidentLight directLight, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, const in PhysicalMaterial material, inout ReflectedLight reflectedLight ) {
  RE_Direct_Physical( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );
  float meadowBacklight = pow( clamp( dot( -geometryViewDir, directLight.direction ), 0.0, 1.0 ), meadowTranslucency.y );
  reflectedLight.directDiffuse += directLight.color * material.diffuseColor * meadowBacklight
    * meadowTranslucency.x * smoothstep( 0.2, 1.0, clamp( vMeadowT, 0.0, 1.0 ) );
}
#undef RE_Direct
#define RE_Direct RE_Direct_Meadow
`;
