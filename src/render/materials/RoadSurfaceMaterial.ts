import { COASTAL_FIELD_GLSL, createCoastalUniforms, type CoastalUniforms } from "../water/CoastalOptics";
import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import {
  createSurfaceFallbackTexture,
  loadSurfaceTexture,
  surfaceTextureDiagnostics,
  POLYHAVEN_SURFACE_TEXTURES,
  type SurfaceTextureLoader
} from "./ExternalSurfaceTextures";
import { PaletteMaterials } from "./PaletteMaterials";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { PALETTE_HEX } from "./PaletteTokens";
import { ROAD_COVERAGE_GLSL } from "./RoadCoverage";
import { ROAD_CLASS_PROFILES, ROAD_WHEEL_GAUGE_METERS } from "../../world/RoadClasses";
import { GROUND_POLYGON_CELL_GLSL } from "./GroundPolygonCells";
import { GROUND_STONES_GLSL } from "./GroundStoneShader";

export const ROAD_SURFACE_PROGRAM_CACHE_KEY = "neva-road-surface-r186-v36-embedded-stones";

type RoadSurfaceConfig = VisualRenderConfig["roadSurface"];

interface RoadSurfaceShaderSource {
  vertexShader: string;
  fragmentShader: string;
  uniforms: Record<string, { value: unknown }>;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? THREE.MathUtils.clamp(value, 0, 1) : 0;
}

function replaceShaderChunk(
  source: string,
  marker: string,
  replacement: string,
  stage: "vertex" | "fragment"
): string {
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1) {
    throw new Error(
      `[RoadSurfaceMaterial] Three.js r186 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`
    );
  }
  return source.replace(marker, replacement);
}

function patchRoadSurfaceShader(
  shader: RoadSurfaceShaderSource,
  uniforms: RoadSurfaceShaderSource["uniforms"]
): void {
  const vertexCommon = "#include <common>";
  const vertexBegin = "#include <begin_vertex>";
  const vertexColor = "#include <color_vertex>";
  const vertexWorldPosition = "#include <worldpos_vertex>";
  const fragmentCommon = "#include <common>";
  const fragmentColor = "#include <color_fragment>";
  const fragmentRoughness = "#include <roughnessmap_fragment>";
  const fragmentNormal = "#include <normal_fragment_begin>";

  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexCommon,
    `${vertexCommon}
attribute vec2 roadFrame;
attribute vec3 roadContext;
varying vec2 vRoadFrame;
varying vec3 vRoadContext;
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexBegin,
    `${vertexBegin}
vRoadFrame = roadFrame;
vRoadContext = roadContext;`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexColor,
    `${vertexColor}
#ifdef USE_COLOR_ALPHA
vRoadOpacity = vColor.a;
#else
vRoadOpacity = 1.0;
#endif`,
    "vertex"
  );
  shader.vertexShader = replaceShaderChunk(
    shader.vertexShader,
    vertexWorldPosition,
    `${vertexWorldPosition}
vRoadWorldPosition = (modelMatrix * vec4(transformed, 1.0)).xyz;`,
    "vertex"
  );

  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentCommon,
    `${fragmentCommon}
uniform sampler2D roadSourceColorTexture;
uniform float roadEdgeCellScale;
uniform float roadStoneCellScale;
uniform float roadStoneCoreDensity;
uniform float roadStoneShoulderDensity;
uniform float roadStoneColorMix;
uniform float roadStoneNormalStrength;
uniform float roadStoneRoughness;
uniform vec3 roadStoneCoolColor;
uniform vec3 roadStoneLightColor;
uniform vec3 roadStoneWarmColor;
uniform float roadSourceSampleScale;
uniform float roadSourceRotation;
uniform float roadSourceLodBias;
uniform float roadExternalColorStrength;
uniform float roadRouteIdentityColorMix;
uniform float roadRouteRoughnessContrast;
uniform float roadShoulderGrowthContrast;
uniform float roadWheelGauge;
uniform vec3 roadClassHalfWidths;
uniform vec3 roadClassShoulderWidths;
uniform float roadTrackHalfWidth;
uniform float roadTrackDriftMeters;
uniform vec2 roadTrackDriftFrequency;
uniform float roadTrackBreakupScale;
uniform float roadTrackBreakup;
uniform float roadTrackColorMix;
uniform float roadTrackReliefStrength;
uniform float roadPuddleStrength;
uniform float roadPuddleRoughness;
uniform float roadLaneMedianGrassMix;
uniform float roadMedianPatchScale;
uniform float roadCrownDustMix;
uniform float roadFootLineHalfWidth;
uniform float roadFootLineColorMix;
uniform float roadReliefNormalStrength;
uniform float roadWearRoughnessReduction;
uniform float roadShoulderColorMix;
uniform float roadEdgeGrassMix;
uniform float roadPolygonJaggedStrength;
uniform float roadEdgeFadeStart;
uniform float roadEdgeFadeFull;
uniform float roadShoreBlendInland;
uniform float roadShoreBlendCrown;
uniform float roadRoughness;
uniform float roadRoughnessVariation;
uniform float roadWetness;
uniform float roadWetnessColorMix;
uniform float roadWetnessRoughnessMix;
uniform vec3 roadPackedColor;
uniform vec3 roadDryColor;
uniform vec3 roadLightColor;
uniform vec3 roadShoulderGrassColor;
uniform vec3 roadDampColor;
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;
varying vec2 vRoadFrame;
varying vec3 vRoadContext;
${GROUND_POLYGON_CELL_GLSL}
${GROUND_STONES_GLSL}
${COASTAL_FIELD_GLSL}
uniform vec3 roadCoastalSand;

vec2 nevaRoadWorldUv(float sampleScale) {
  vec2 position = vRoadWorldPosition.xz / max(sampleScale, 0.001);
  float rotationSin = sin(roadSourceRotation);
  float rotationCos = cos(roadSourceRotation);
  return vec2(
    position.x * rotationCos - position.y * rotationSin,
    position.x * rotationSin + position.y * rotationCos
  );
}

// Smooth value noise over the shared cell hash, for breakup along a road.
float nevaRoadNoise(vec2 position) {
  vec2 cell = floor(position);
  vec2 local = fract(position);
  local = local * local * (3.0 - 2.0 * local);
  float a = nevaGroundCellJitter(cell).x;
  float b = nevaGroundCellJitter(cell + vec2(1.0, 0.0)).x;
  float c = nevaGroundCellJitter(cell + vec2(0.0, 1.0)).x;
  float d = nevaGroundCellJitter(cell + vec2(1.0, 1.0)).x;
  return mix(mix(a, b, local.x), mix(c, d, local.x), local.y);
}`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentColor,
    `${fragmentColor}
${ROAD_COVERAGE_GLSL}
diffuseColor.a = roadCoverage;
// Broad palette is baked once from the canonical local surface. One supporting
// sample changes its value slightly; photographic RGB never becomes albedo.
vec2 roadSourceUv = nevaRoadWorldUv(roadSourceSampleScale);
vec3 roadSourceSample = texture2D(roadSourceColorTexture, roadSourceUv, roadSourceLodBias).rgb;
float roadSourceLuma = clamp(dot(roadSourceSample, vec3(0.299, 0.587, 0.114)), 0.0, 1.0);
float roadGreenHint = clamp((roadSourceSample.g - max(roadSourceSample.r, roadSourceSample.b)) * 5.5, 0.0, 1.0);
diffuseColor.rgb *= mix(1.0, mix(0.96, 1.04, roadSourceLuma), roadExternalColorStrength);
float roadCoreMix = smoothstep(0.52, 0.88, vRoadOpacity);

// The road's own frame: signed metres across its centre line and metres along
// it, exact on every vertex, so tracks are straight, anti-aliased lines rather
// than wear interpolated across whatever triangles the mesh happens to have.
float roadClassCode = vRoadContext.x * 3.0;
float roadArterial = 1.0 - step(0.5, roadClassCode);
float roadTrail = step(1.5, roadClassCode) * (1.0 - step(2.5, roadClassCode));
float roadShared = step(2.5, roadClassCode);
float roadLane = clamp(1.0 - roadArterial - roadTrail - roadShared, 0.0, 1.0);
float roadJunction = max(clamp(vRoadContext.z, 0.0, 1.0), roadShared);
// The loose shoulder follows the exact frame on a road's own strip; shared
// surfaces keep the value sampled at their vertices.
vec3 roadClassWeights = vec3(roadArterial, roadLane, roadTrail);
float roadHalfWidth = dot(roadClassWeights, roadClassHalfWidths);
float roadShoulderWidth = dot(roadClassWeights, roadClassShoulderWidths);
float roadFrameShoulder = smoothstep(roadHalfWidth * 0.86, roadHalfWidth + roadShoulderWidth, abs(vRoadFrame.x));
float roadLooseShoulder = mix(roadFrameShoulder, clamp(vRoadContext.y, 0.0, 1.0), roadShared);
float roadStation = vRoadFrame.y;
float roadFrameAa = max(fwidth(vRoadFrame.x), 0.004);
// Both tracks drift together over tens of metres, so their spacing never
// changes; walkers wander a little more than wheels.
float roadDrift = (sin(roadStation * roadTrackDriftFrequency.x) * 0.62
  + sin(roadStation * roadTrackDriftFrequency.y + 1.7) * 0.38)
  * roadTrackDriftMeters * (1.0 + roadTrail);
float roadAcross = vRoadFrame.x - roadDrift;
float roadTrackOffset = abs(abs(roadAcross) - roadWheelGauge * 0.5);
float roadTrackSide = step(0.0, roadAcross);
// A track fills in or grasses over for a few metres now and then.
float roadTrackKeep = mix(0.15, 1.0, smoothstep(roadTrackBreakup - 0.18, roadTrackBreakup + 0.18,
  nevaRoadNoise(vec2(roadStation / roadTrackBreakupScale, roadTrackSide * 13.7 + 3.1))));
float roadWheelUse = (roadArterial + roadLane * 0.85) * (1.0 - roadJunction);
// A soft-shouldered band, darkest where the wheels ran, not a hard-edged groove.
float roadTrack = (1.0 - smoothstep(roadTrackHalfWidth * 0.45, roadTrackHalfWidth + roadFrameAa, roadTrackOffset))
  * roadWheelUse * roadTrackKeep * roadCoverage;
float roadTrackTrough = exp(-pow(roadTrackOffset / (roadTrackHalfWidth * 1.25 + roadFrameAa), 2.0))
  * roadWheelUse * roadTrackKeep;
// Between the tracks: a dusty crown on cart roads, a grass strip on farm lanes.
float roadBetween = 1.0 - smoothstep(roadWheelGauge * 0.5 - roadTrackHalfWidth * 3.4,
  roadWheelGauge * 0.5 - roadTrackHalfWidth * 1.5, abs(roadAcross));
float roadMedianPatch = smoothstep(0.28, 0.62, nevaRoadNoise(vec2(roadStation / roadMedianPatchScale, 5.1)));
float roadMedianGrass = roadBetween * roadLane * (1.0 - roadJunction) * mix(0.4, 1.0, roadMedianPatch) * roadCoverage;
float roadCrownDust = roadBetween * roadArterial * (1.0 - roadJunction) * roadCoverage;
// A footpath is worn to one line down its middle.
float roadFootLine = (1.0 - smoothstep(roadFootLineHalfWidth * 0.45, roadFootLineHalfWidth + roadFrameAa, abs(roadAcross)))
  * roadTrail * (1.0 - roadJunction) * roadCoverage;
float roadTrackWear = max(roadTrack, roadFootLine * 0.6);

float sharedRoadWetness = clamp(roadWetness, 0.0, 1.0);
vec4 coastalRoadField = nevaOpticsField(vRoadWorldPosition.xz);
float roadPackedUse = clamp(roadArterial + roadLane * 0.46 + roadJunction * 0.5, 0.0, 1.0);
float roadDetailFilter = 1.0 - smoothstep(0.18, 0.85,
  max(length(dFdx(vRoadWorldPosition.xz)), length(dFdy(vRoadWorldPosition.xz))));
// One earth family keeps route identities quiet; width and wear carry the use.
vec3 roadRouteColor = mix(roadDryColor, roadPackedColor, 0.56 + roadPackedUse * 0.18);
diffuseColor.rgb = mix(diffuseColor.rgb, roadRouteColor,
  roadCoverage * roadCoreMix * roadRouteIdentityColorMix);
diffuseColor.rgb = mix(diffuseColor.rgb, roadLightColor, roadLooseShoulder * roadShoulderColorMix);
diffuseColor.rgb = mix(diffuseColor.rgb, roadDampColor,
  sharedRoadWetness * roadWetnessColorMix * roadCoverage);
// Plants gather in less-used shoulder pockets; compacted strips stay bare.
float roadShoulderGrowth = clamp(
  0.6 + roadShoulderGrowthContrast * (roadTrail + roadLane * 0.45 - roadArterial * 0.35)
  * (1.0 - roadJunction * 0.8), 0.3, 1.25
);
float roadShoulderTufts = roadLooseShoulder * (1.0 - roadTrackWear)
  * smoothstep(0.32, 0.64, roadSourceLuma) * (0.35 + roadGreenHint * 0.65)
  * roadShoulderGrowth;
diffuseColor.rgb = mix(diffuseColor.rgb, roadShoulderGrassColor,
  roadShoulderTufts * roadShoulderColorMix);
// The loose outer shoulder takes the surrounding grass palette before the
// alpha edge, leaving a dusty-to-sparse-growth transition on the road itself.
float roadShoulderGrassFringe = roadLooseShoulder
  * mix(0.3, 1.0, 1.0 - smoothstep(0.42, 0.9, vRoadOpacity)) * roadShoulderGrowth;
diffuseColor.rgb = mix(diffuseColor.rgb, roadShoulderGrassColor,
  roadShoulderGrassFringe * roadEdgeGrassMix);
// Crown, median and foot line, then the wheel tracks over them.
diffuseColor.rgb = mix(diffuseColor.rgb, roadLightColor, roadCrownDust * roadCrownDustMix);
diffuseColor.rgb = mix(diffuseColor.rgb, roadShoulderGrassColor * mix(0.86, 1.06, roadMedianPatch),
  roadMedianGrass * roadLaneMedianGrassMix);
diffuseColor.rgb = mix(diffuseColor.rgb, roadLightColor, roadFootLine * roadFootLineColorMix);
vec3 roadTrackColor = mix(roadDryColor, roadDampColor, 0.42);
diffuseColor.rgb = mix(diffuseColor.rgb, roadTrackColor, roadTrack * roadTrackColorMix);
// The brooks' rounded gravel lies flush in worked earth. Fewer stones survive
// wheel wear; distance filtering removes subpixel colour and normal detail.
vec2 roadStoneCoord = vRoadWorldPosition.xz / roadStoneCellScale;
float roadStoneFootprint = max(length(dFdx(roadStoneCoord)), length(dFdy(roadStoneCoord)));
float roadStoneFilter = 1.0 - smoothstep(0.35, 1.2, roadStoneFootprint);
float roadStoneKeep = mix(roadStoneCoreDensity, roadStoneShoulderDensity, roadLooseShoulder)
  * (1.0 - roadTrackWear * 0.65);
vec2 roadStoneSlope = vec2(0.0);
float roadStoneNearest = 8.0;
vec4 roadStone = vec4(0.0);
if (roadStoneFilter > 0.0) {
  roadStone = nevaGroundStones(roadStoneCoord, roadStoneKeep, roadStoneSlope, roadStoneNearest);
}
float roadStoneMask = roadStone.x * roadStoneFilter * roadCoverage;
vec3 roadStoneColor = mix(mix(roadStoneCoolColor, roadStoneLightColor,
  smoothstep(0.55, 0.95, roadStone.w) * 0.7), roadStoneWarmColor, step(0.9, roadStone.w));
roadStoneColor *= (0.88 + 0.12 * clamp(roadStone.y, 0.0, 1.0)) * (1.0 - sharedRoadWetness * 0.15);
diffuseColor.rgb = mix(diffuseColor.rgb, roadStoneColor, roadStoneMask * roadStoneColorMix);
// Rain gathers in the tracks' low spots.
float roadPuddle = roadTrackTrough * sharedRoadWetness * roadCoverage
  * smoothstep(0.5, 0.72, nevaRoadNoise(vec2(roadStation / 2.3, roadTrackSide * 7.9)));
diffuseColor.rgb = mix(diffuseColor.rgb, roadDampColor * 0.7, roadPuddle * roadPuddleStrength);
// Signed shore distance is positive in the water. Thin the shoulders into the
// beach first and keep the crown opaque until the last few metres, then let
// that crown feather out. Do not drop the whole ribbon's alpha at once:
// alpha testing turns that into a hard ghost rectangle.
float shoreInland = max(0.0, -coastalRoadField.b);
float shoreInWater = smoothstep(0.0, 0.75, coastalRoadField.b);
float shoreShoulderDissolve = 1.0 - smoothstep(roadShoreBlendCrown, roadShoreBlendInland, shoreInland);
float shoreCrownDissolve = 1.0 - smoothstep(0.0, roadShoreBlendCrown, shoreInland);
float shoreLateral = smoothstep(0.0, roadHalfWidth + roadShoulderWidth, abs(vRoadFrame.x));
float shoreDissolve = mix(shoreCrownDissolve, shoreShoulderDissolve, shoreLateral);
shoreDissolve = max(shoreDissolve, shoreInWater);
shoreDissolve *= max(coastalRoadField.a, shoreInWater);
diffuseColor.rgb = mix(diffuseColor.rgb, roadCoastalSand * mix(0.97, 1.0, roadSourceLuma), shoreDissolve);
float shoreKeep = 1.0 - smoothstep(0.35, 0.85, shoreDissolve);
diffuseColor.a *= shoreKeep;
float coastalRoadWeight = shoreDissolve;`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
roughnessFactor = clamp(
  roadRoughness + (roadSourceLuma - 0.5) * roadRoughnessVariation
    - sharedRoadWetness * roadWetnessRoughnessMix * roadCoverage,
  0.84, 0.99
);
roughnessFactor = clamp(
  roughnessFactor - roadPackedUse * roadRouteRoughnessContrast * roadCoreMix
    + roadTrail * roadRouteRoughnessContrast * 0.35 * roadLooseShoulder,
  0.84, 0.99
);
// The same tracks that darken the earth are smoother packed ground.
roughnessFactor = max(0.84, roughnessFactor
  - roadTrackWear * roadWearRoughnessReduction * (1.0 + sharedRoadWetness * 0.35)
    * (1.0 - coastalRoadWeight));
roughnessFactor = mix(roughnessFactor, roadStoneRoughness - sharedRoadWetness * 0.12,
  roadStoneMask * roadStoneColorMix * (1.0 - coastalRoadWeight));
roughnessFactor = mix(roughnessFactor, roadPuddleRoughness, roadPuddle * roadPuddleStrength);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentNormal,
    `${fragmentNormal}
// Quiet lighting-only wheel relief shares the same track mask as color and
// roughness. Geometry and the collision surface remain unchanged by shading.
float roadRelief = -roadTrackTrough * roadTrackReliefStrength
  * roadReliefNormalStrength * roadDetailFilter * (1.0 - coastalRoadWeight);
vec3 roadDx = dFdx(-vViewPosition), roadDy = dFdy(-vViewPosition);
vec3 roadR1 = cross(roadDy, normal), roadR2 = cross(normal, roadDx);
float roadDet = dot(roadDx, roadR1);
vec3 roadGradient = sign(roadDet) * (dFdx(roadRelief) * roadR1 + dFdy(roadRelief) * roadR2);
normal = normalize(abs(roadDet) * normal - roadGradient);
vec3 roadStoneTilt = (viewMatrix * vec4(roadStoneSlope.x, 0.0, roadStoneSlope.y, 0.0)).xyz;
normal = normalize(normal + roadStoneTilt * roadStoneNormalStrength * roadStoneMask
  * (1.0 - coastalRoadWeight));`,
    "fragment"
  );

  Object.assign(shader.uniforms, uniforms);
}

/**
 * Render-only worked-ground color breakup for the canonical shared road mesh.
 * It changes material response only; geometry and Rapier keep using the exact
 * indexed surface produced by WorldLayout.buildPathGeometry().
 */
export class RoadSurfaceMaterial {
  private disposed = false;
  public readonly material: THREE.MeshStandardMaterial;
  private readonly shaderUniforms: RoadSurfaceShaderSource["uniforms"];
  private readonly ownedExternalTextures = new Set<THREE.Texture>();
  private externalTextureLoadPromise: Promise<void> | null = null;

  public constructor(config: RoadSurfaceConfig = CANONICAL_RENDER_CONFIG.roadSurface) {
    const roadColorFallback = createSurfaceFallbackTexture("color");
    this.ownedExternalTextures.add(roadColorFallback);
    this.shaderUniforms = {
      ...createCoastalUniforms(null, new THREE.Vector4(0, 0, 1, 1)),
      roadCoastalSand: { value: new THREE.Color(PALETTE_HEX.sand_coastal_01) },
      roadSourceColorTexture: { value: roadColorFallback },
      roadEdgeCellScale: { value: config.polygonEdgeCellScaleMeters },
      roadStoneCellScale: { value: config.stones.cellScaleMeters },
      roadStoneCoreDensity: { value: config.stones.coreDensity },
      roadStoneShoulderDensity: { value: config.stones.shoulderDensity },
      roadStoneColorMix: { value: config.stones.colorMix },
      roadStoneNormalStrength: { value: config.stones.normalStrength },
      roadStoneRoughness: { value: config.stones.roughness },
      roadStoneCoolColor: { value: new THREE.Color(PALETTE_HEX.stone_cool_01) },
      roadStoneLightColor: { value: new THREE.Color(PALETTE_HEX.stone_coastal_light_01) },
      roadStoneWarmColor: { value: new THREE.Color(PALETTE_HEX.stone_coastal_warm_01) },
      roadSourceSampleScale: { value: config.externalTexture.sampleScaleMeters },
      roadSourceRotation: { value: config.externalTexture.rotationRadians },
      roadSourceLodBias: { value: config.externalTexture.lodBias },
      roadExternalColorStrength: { value: config.externalTexture.colorStrength },
      roadRouteIdentityColorMix: { value: config.routeIdentityColorMix },
      roadRouteRoughnessContrast: { value: config.routeRoughnessContrast },
      roadShoulderGrowthContrast: { value: config.shoulderGrowthContrast },
      roadWheelGauge: { value: ROAD_WHEEL_GAUGE_METERS },
      roadClassHalfWidths: { value: new THREE.Vector3(
        ROAD_CLASS_PROFILES.arterial.widthMeters * 0.5,
        ROAD_CLASS_PROFILES.lane.widthMeters * 0.5,
        ROAD_CLASS_PROFILES.trail.widthMeters * 0.5
      ) },
      roadClassShoulderWidths: { value: new THREE.Vector3(
        ROAD_CLASS_PROFILES.arterial.shoulderWidthMeters,
        ROAD_CLASS_PROFILES.lane.shoulderWidthMeters,
        ROAD_CLASS_PROFILES.trail.shoulderWidthMeters
      ) },
      roadTrackHalfWidth: { value: config.wheelTracks.halfWidthMeters },
      roadTrackDriftMeters: { value: config.wheelTracks.driftMeters },
      roadTrackDriftFrequency: { value: new THREE.Vector2(
        (Math.PI * 2) / config.wheelTracks.driftWavelengthsMeters[0],
        (Math.PI * 2) / config.wheelTracks.driftWavelengthsMeters[1]
      ) },
      roadTrackBreakupScale: { value: config.wheelTracks.breakupScaleMeters },
      roadTrackBreakup: { value: config.wheelTracks.breakup },
      roadTrackColorMix: { value: config.wheelTracks.colorMix },
      roadTrackReliefStrength: { value: config.wheelTracks.reliefStrength },
      roadPuddleStrength: { value: config.wheelTracks.puddleStrength },
      roadPuddleRoughness: { value: config.wheelTracks.puddleRoughness },
      roadLaneMedianGrassMix: { value: config.laneMedianGrassMix },
      roadMedianPatchScale: { value: config.medianPatchScaleMeters },
      roadCrownDustMix: { value: config.crownDustMix },
      roadFootLineHalfWidth: { value: config.footLineHalfWidthMeters },
      roadFootLineColorMix: { value: config.footLineColorMix },
      roadReliefNormalStrength: { value: config.reliefNormalStrength },
      roadWearRoughnessReduction: { value: config.wearRoughnessReduction },
      roadShoulderColorMix: { value: config.shoulderColorMix },
      roadEdgeGrassMix: { value: config.edgeGrassMix },
      roadPolygonJaggedStrength: { value: config.polygonJaggedStrength },
      roadEdgeFadeStart: { value: config.edgeFadeStart },
      roadEdgeFadeFull: { value: config.edgeFadeFull },
      roadShoreBlendInland: { value: config.shoreBlendInlandMeters },
      roadShoreBlendCrown: { value: config.shoreBlendCrownMeters },
      roadRoughness: { value: config.roughness },
      roadRoughnessVariation: { value: config.roughnessVariation },
      roadWetness: { value: 0 },
      roadWetnessColorMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.colorMix },
      roadWetnessRoughnessMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.roughnessMix },
      roadPackedColor: { value: new THREE.Color(PALETTE_HEX.path_dust_01) },
      roadDryColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      roadLightColor: { value: new THREE.Color(PALETTE_HEX.sand_warm_01) },
      roadShoulderGrassColor: { value: new THREE.Color(PALETTE_HEX.foliage_olive_01) },
      roadDampColor: { value: new THREE.Color(PALETTE_HEX.soil_damp_01) }
    };

    const canonicalBase = PaletteMaterials.standard("path_dust_01", {
      vertexColors: true,
      vertexColorMode: "replace",
      flatShading: false,
      roughness: config.roughness
    });
    this.material = canonicalBase.clone();
    this.material.name = "road_surface_path_dust_01";
    // Keep the worked-ground ribbon in the opaque pass. Its vertex alpha now
    // feeds a narrow alpha-tested, alpha-to-coverage edge instead of a broad
    // transparent overlay, so camera order cannot change the merge.
    this.material.transparent = false;
    this.material.depthWrite = true;
    this.material.alphaTest = 0.5;
    this.material.alphaToCoverage = true;
    this.material.polygonOffset = true;
    this.material.polygonOffsetFactor = -3;
    this.material.polygonOffsetUnits = -3;
    this.material.onBeforeCompile = (shader) => {
      patchRoadSurfaceShader(shader as RoadSurfaceShaderSource, this.shaderUniforms);
    };
    this.material.customProgramCacheKey = () => ROAD_SURFACE_PROGRAM_CACHE_KEY;
    applyWorldAtmosphere(this.material);
    this.material.needsUpdate = true;
  }

  public bindCoastalField(uniforms: CoastalUniforms): void {
    Object.assign(this.shaderUniforms, uniforms);
    this.material.needsUpdate = true;
  }

  public loadExternalTextures(
    loader: SurfaceTextureLoader
  ): Promise<void> {
    if (this.externalTextureLoadPromise) return this.externalTextureLoadPromise;

    this.externalTextureLoadPromise = (async () => {
      const texture = await loadSurfaceTexture(POLYHAVEN_SURFACE_TEXTURES.roadColor, loader);
      if (!texture) return;
      if (this.disposed) { texture.dispose(); return; }
      texture.anisotropy = 8;
      const uniform = this.shaderUniforms.roadSourceColorTexture;
      const previous = uniform.value;
      uniform.value = texture;
      if (previous instanceof THREE.Texture) {
        this.ownedExternalTextures.delete(previous);
        previous.dispose();
      }
      this.ownedExternalTextures.add(texture);
      this.material.needsUpdate = true;
    })();

    return this.externalTextureLoadPromise;
  }

  public get wetness(): number {
    return this.shaderUniforms.roadWetness.value as number;
  }

  public textureDiagnostics() { return surfaceTextureDiagnostics(this.ownedExternalTextures); }

  public setWetness(value: number): void {
    this.shaderUniforms.roadWetness.value = clamp01(value);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.material.dispose();
    for (const texture of this.ownedExternalTextures) texture.dispose();
    this.ownedExternalTextures.clear();
  }
}
