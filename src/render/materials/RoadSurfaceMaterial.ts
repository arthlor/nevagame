import { COASTAL_FIELD_GLSL, createCoastalUniforms, type CoastalUniforms } from "../water/CoastalOptics";
import * as THREE from "three";

import { CANONICAL_RENDER_CONFIG, type VisualRenderConfig } from "../config/VisualRenderConfig";
import {
  createSurfaceFallbackTexture,
  loadSurfaceTexture,
  POLYHAVEN_SURFACE_TEXTURES
} from "./ExternalSurfaceTextures";
import { PaletteMaterials } from "./PaletteMaterials";
import { applyWorldAtmosphere } from "../atmosphere/AtmosphereMaterial";
import { PALETTE_HEX } from "./PaletteTokens";
import { ROAD_COVERAGE_GLSL } from "./RoadCoverage";
import { ROAD_CLASS_PROFILES, ROAD_WHEEL_GAUGE_METERS } from "../../world/RoadClasses";
import {
  SURFACE_FIELD_FRAGMENT_GLSL,
  SURFACE_FIELD_VERTEX_ASSIGNMENTS,
  SURFACE_FIELD_VERTEX_DECLARATIONS
} from "./SurfaceFieldShader";

export const ROAD_SURFACE_PROGRAM_CACHE_KEY = "neva-road-surface-r174-v33-cart-tracks";

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
      `[RoadSurfaceMaterial] Three.js r174 ${stage} shader chunk drift: expected exactly one ${marker}, found ${occurrences}`
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
${SURFACE_FIELD_VERTEX_DECLARATIONS}
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
${SURFACE_FIELD_VERTEX_ASSIGNMENTS}
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
uniform sampler2D roadSourceRoughnessTexture;
uniform float roadEdgeCellScale;
uniform float roadSourceSampleScale;
uniform float roadSourceMesoSampleScale;
uniform float roadSourceRotation;
uniform float roadSourceLodBias;
uniform float roadExternalColorStrength;
uniform float roadExternalRoughnessStrength;
uniform float roadFineDetailStrength;
uniform float roadEarthBrownness;
uniform float roadRouteIdentityColorMix;
uniform float roadLocalGroundColorMix;
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
uniform float roadPolygonVariationStrength;
uniform float roadPolygonJaggedStrength;
uniform float roadPolygonFacetLightingStrength;
uniform float roadEdgeFadeStart;
uniform float roadEdgeFadeFull;
uniform float roadRoughness;
uniform float roadRoughnessVariation;
uniform float roadWetness;
uniform float roadWetnessColorMix;
uniform float roadWetnessRoughnessMix;
uniform float roadSharedTransitionMix;
uniform vec3 roadPackedColor;
uniform vec3 roadDryColor;
uniform vec3 roadLightColor;
uniform vec3 roadShoulderGrassColor;
uniform vec3 roadMineralColor;
uniform vec3 roadDampColor;
varying vec3 vRoadWorldPosition;
varying float vRoadOpacity;
varying vec2 vRoadFrame;
varying vec3 vRoadContext;
${SURFACE_FIELD_FRAGMENT_GLSL}
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
// Reuse the shoulder's cell identity for broad patch variation.
vec4 roadPolygonCell = roadEdgeCell;
float roadPolygonSignal = roadPolygonCell.x;
vec2 roadFineUv = nevaRoadWorldUv(roadSourceSampleScale);
vec2 roadMesoUv = nevaRoadWorldUv(roadSourceMesoSampleScale);
vec3 roadFineSample = texture2D(roadSourceColorTexture, roadFineUv, roadSourceLodBias).rgb;
vec3 roadMesoSample = texture2D(roadSourceColorTexture, roadMesoUv, roadSourceLodBias + 0.45).rgb;
float roadFineLuma = dot(roadFineSample, vec3(0.299, 0.587, 0.114));
float roadMesoLuma = dot(roadMesoSample, vec3(0.299, 0.587, 0.114));
float roadFineDelta = clamp((roadFineLuma - roadMesoLuma) * 3.6 * roadFineDetailStrength, -0.24, 0.24);
float roadSourceLuma = mix(0.38, 0.68, smoothstep(0.1, 0.9, mix(roadMesoLuma, roadFineLuma, 0.35 * roadFineDetailStrength)));
vec3 roadGreenSample = mix(roadMesoSample, roadFineSample, 0.42 * roadFineDetailStrength);
float roadGreenHint = clamp((roadGreenSample.g - max(roadGreenSample.r, roadGreenSample.b)) * 5.5, 0.0, 1.0);
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

// Packed earth: warm dust and browner soil in broad patches. The supporting
// map adds meso wear only; its fine grain stays quiet.
vec3 roadEarth = mix(roadPackedColor, roadDryColor,
  clamp(roadEarthBrownness + (0.53 - roadSourceLuma) * 0.45, 0.0, 1.0));
roadEarth *= mix(0.96, 1.04, roadSourceLuma);
roadEarth = mix(roadEarth, roadLightColor, smoothstep(0.035, 0.16, roadFineDelta) * 0.18 * roadFineDetailStrength);
roadEarth = mix(roadEarth, roadDryColor, smoothstep(0.035, 0.16, -roadFineDelta) * 0.16 * roadFineDetailStrength);
roadEarth = mix(roadEarth, roadShoulderGrassColor,
  max(roadGreenHint, 0.22) * (1.0 - smoothstep(roadEdgeFadeFull, 0.88, vRoadOpacity)) * roadCoverage * 0.46);
vec3 roadPolygonColor = mix(roadPackedColor, roadLightColor, smoothstep(0.2, 0.84, roadPolygonSignal));
roadPolygonColor = mix(roadPolygonColor, roadDryColor, 0.22);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadPolygonColor,
  roadPolygonVariationStrength * smoothstep(roadEdgeFadeStart, roadEdgeFadeFull, vRoadOpacity)
);
diffuseColor.rgb = mix(diffuseColor.rgb, roadEarth, roadCoverage * roadExternalColorStrength);
float sharedRoadWetness = nevaSurfaceWeatherWetness(roadWetness);
float sharedRoadBoundary = nevaSurfaceTransitionWeight(1.0, 0.72);
// Boundary variation uses its existing edge cell, rather than running the same
// nine-candidate search a third time for a second copy of the shoulder field.
float sharedRoadCellSignal = roadEdgeSignal;
vec3 sharedRoadIdentity = mix(
  roadLightColor,
  roadPackedColor,
  clamp(nevaSurfacePathWeight() + nevaSurfaceShoulderWeight() * 0.28, 0.0, 1.0)
);
sharedRoadIdentity = mix(
  sharedRoadIdentity,
  nevaSurfaceWeightedPalette(
    roadLightColor,
    roadLightColor,
    roadDryColor,
    roadDryColor,
    roadPackedColor,
    roadDryColor,
    roadLightColor,
    roadPackedColor,
    roadDryColor,
    roadPackedColor,
    sharedRoadIdentity
  ),
  0.28
);
sharedRoadIdentity = mix(
  sharedRoadIdentity,
  roadDryColor,
  nevaSurfaceShoulderWeight() * 0.22
);
sharedRoadIdentity *= mix(0.98, 1.02, sharedRoadCellSignal);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  sharedRoadIdentity,
  roadCoverage * roadSharedTransitionMix * sharedRoadBoundary
);
diffuseColor.rgb = mix(
  diffuseColor.rgb,
  roadDryColor,
  sharedRoadWetness * roadWetnessColorMix * roadSharedTransitionMix * sharedRoadBoundary
);
vec4 coastalRoadField = nevaOpticsField(vRoadWorldPosition.xz);
float roadPackedUse = clamp(roadArterial + roadLane * 0.46 + roadJunction * 0.5, 0.0, 1.0);
float roadDetailFilter = 1.0 - smoothstep(0.18, 0.85,
  max(length(dFdx(vRoadWorldPosition.xz)), length(dFdy(vRoadWorldPosition.xz))));
// Traffic and the underlying ground cause the broad identity. The shared map
// remains fine wear, never a second road footprint or a photo albedo.
vec3 roadRouteColor = mix(roadLightColor, roadPackedColor, roadPackedUse);
diffuseColor.rgb = mix(diffuseColor.rgb, roadRouteColor,
  roadCoverage * roadCoreMix * roadRouteIdentityColorMix);
float roadMineral = clamp(nevaSurfaceCliffWeight() + nevaSurfaceRiverbedWeight() * 0.45, 0.0, 1.0);
float roadDamp = clamp(nevaSurfaceDampSoilWeight() + nevaSurfaceWetShorelineWeight() * 0.4, 0.0, 1.0);
float roadSand = clamp(nevaSurfaceBeachWeight(), 0.0, 1.0);
vec3 roadLocalColor = mix(roadDryColor, roadMineralColor, roadMineral);
roadLocalColor = mix(roadLocalColor, roadDampColor, roadDamp);
roadLocalColor = mix(roadLocalColor, roadLightColor, roadSand);
diffuseColor.rgb = mix(diffuseColor.rgb, roadLocalColor,
  roadCoverage * roadLocalGroundColorMix * clamp(roadMineral + roadDamp + roadSand, 0.0, 1.0));
diffuseColor.rgb = mix(diffuseColor.rgb, roadLightColor, roadLooseShoulder * roadShoulderColorMix);
// Plants gather in less-used shoulder pockets; compacted strips stay bare.
float roadShoulderGrowth = clamp(
  0.6 + roadShoulderGrowthContrast * (roadTrail + roadLane * 0.45 - roadArterial * 0.35)
  * (1.0 - roadJunction * 0.8), 0.3, 1.25
);
float roadShoulderTufts = roadLooseShoulder * (1.0 - roadTrackWear)
  * smoothstep(0.32, 0.64, roadMesoLuma) * (0.35 + roadGreenHint * 0.65)
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
// Rain gathers in the tracks' low spots.
float roadPuddle = roadTrackTrough * sharedRoadWetness * roadCoverage
  * smoothstep(0.5, 0.72, nevaRoadNoise(vec2(roadStation / 2.3, roadTrackSide * 7.9)));
diffuseColor.rgb = mix(diffuseColor.rgb, roadDampColor * 0.7, roadPuddle * roadPuddleStrength);
float coastalRoadWeight = coastalRoadField.a * (1.0 - smoothstep(13.0, 24.0, -coastalRoadField.b));
diffuseColor.rgb = mix(diffuseColor.rgb, roadCoastalSand * mix(0.97, 1.0, roadSourceLuma), coastalRoadWeight);
diffuseColor.a *= 1.0 - smoothstep(0.25, 0.65, coastalRoadWeight);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentRoughness,
    `${fragmentRoughness}
float roadSourceRoughness = mix(
  texture2D(roadSourceRoughnessTexture, roadMesoUv, roadSourceLodBias + 0.45).r,
  texture2D(roadSourceRoughnessTexture, roadFineUv, roadSourceLodBias).r,
  0.28 * roadFineDetailStrength
);
roadSourceRoughness = mix(0.90, 0.97, mix(0.42, 0.72, smoothstep(0.18, 0.82, roadSourceRoughness)));
roughnessFactor = clamp(
  mix(
    roadRoughness + (roadPolygonSignal - 0.5) * roadRoughnessVariation,
    roadSourceRoughness,
    roadExternalRoughnessStrength
  ),
  0.88,
  0.98
);
roughnessFactor = mix(
  roughnessFactor,
  max(0.84, roughnessFactor - sharedRoadWetness * 0.08),
  roadCoverage * roadWetnessRoughnessMix * roadSharedTransitionMix
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
roughnessFactor = mix(roughnessFactor, roadPuddleRoughness, roadPuddle * roadPuddleStrength);`,
    "fragment"
  );
  shader.fragmentShader = replaceShaderChunk(
    shader.fragmentShader,
    fragmentNormal,
    `${fragmentNormal}
normal = nevaSurfaceFacetNormal(
  normal,
  roadPolygonCell,
  roadPolygonFacetLightingStrength,
  roadCoverage
);
// Shallow relief follows the tracks and the existing aggregate signal. It
// changes only the lighting normal, never the physical road or its silhouette.
float roadRelief = (roadFineDelta * roadFineDetailStrength * (1.0 - roadTrackTrough * 0.65)
  - roadTrackTrough * roadTrackReliefStrength + roadLooseShoulder * 0.12)
  * roadReliefNormalStrength * roadDetailFilter * (1.0 - coastalRoadWeight);
vec3 roadDx = dFdx(-vViewPosition), roadDy = dFdy(-vViewPosition);
vec3 roadR1 = cross(roadDy, normal), roadR2 = cross(normal, roadDx);
float roadDet = dot(roadDx, roadR1);
vec3 roadGradient = sign(roadDet) * (dFdx(roadRelief) * roadR1 + dFdy(roadRelief) * roadR2);
normal = normalize(abs(roadDet) * normal - roadGradient);`,
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
    const roadRoughnessFallback = createSurfaceFallbackTexture("roughness");
    this.ownedExternalTextures.add(roadColorFallback);
    this.ownedExternalTextures.add(roadRoughnessFallback);
    this.shaderUniforms = {
      ...createCoastalUniforms(null, new THREE.Vector4(0, 0, 1, 1)),
      roadCoastalSand: { value: new THREE.Color(PALETTE_HEX.sand_coastal_01) },
      roadSourceColorTexture: { value: roadColorFallback },
      roadSourceRoughnessTexture: { value: roadRoughnessFallback },
      roadEdgeCellScale: { value: config.polygonEdgeCellScaleMeters },
      roadSourceSampleScale: { value: config.externalTexture.sampleScaleMeters },
      roadSourceMesoSampleScale: { value: config.externalTexture.mesoSampleScaleMeters },
      roadSourceRotation: { value: config.externalTexture.rotationRadians },
      roadSourceLodBias: { value: config.externalTexture.lodBias },
      roadExternalColorStrength: { value: config.externalTexture.colorStrength },
      roadExternalRoughnessStrength: { value: config.externalTexture.roughnessStrength },
      roadFineDetailStrength: { value: config.externalTexture.fineDetailStrength },
      roadEarthBrownness: { value: config.earthBrownness },
      roadRouteIdentityColorMix: { value: config.routeIdentityColorMix },
      roadLocalGroundColorMix: { value: config.localGroundColorMix },
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
      roadPolygonVariationStrength: { value: config.polygonVariationStrength },
      roadPolygonJaggedStrength: { value: config.polygonJaggedStrength },
      roadPolygonFacetLightingStrength: { value: config.polygonFacetLightingStrength },
      roadEdgeFadeStart: { value: config.edgeFadeStart },
      roadEdgeFadeFull: { value: config.edgeFadeFull },
      roadRoughness: { value: config.roughness },
      roadRoughnessVariation: { value: config.roughnessVariation },
      roadWetness: { value: 0 },
      roadWetnessColorMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.colorMix },
      roadWetnessRoughnessMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.wetness.roughnessMix },
      roadSharedTransitionMix: { value: CANONICAL_RENDER_CONFIG.groundSurface.roadWetnessMix },
      roadPackedColor: { value: new THREE.Color(PALETTE_HEX.path_dust_01) },
      roadDryColor: { value: new THREE.Color(PALETTE_HEX.soil_dry_01) },
      roadLightColor: { value: new THREE.Color(PALETTE_HEX.sand_warm_01) },
      roadShoulderGrassColor: { value: new THREE.Color(PALETTE_HEX.foliage_olive_01) },
      roadMineralColor: { value: new THREE.Color(PALETTE_HEX.stone_warm_01) },
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
    loader: Pick<THREE.TextureLoader, "loadAsync"> = new THREE.TextureLoader()
  ): Promise<void> {
    if (this.externalTextureLoadPromise) return this.externalTextureLoadPromise;

    const jobs = [
      {
        uniformName: "roadSourceColorTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.roadColor
      },
      {
        uniformName: "roadSourceRoughnessTexture",
        spec: POLYHAVEN_SURFACE_TEXTURES.roadRoughness
      }
    ] as const;

    this.externalTextureLoadPromise = Promise.all(
      jobs.map(async ({ uniformName, spec }) => {
        const texture = await loadSurfaceTexture(spec, loader);
        if (!texture) return;
        if (this.disposed) { texture.dispose(); return; }
        texture.anisotropy = 8;

        const uniform = this.shaderUniforms[uniformName];
        const previous = uniform.value;
        uniform.value = texture;
        if (previous instanceof THREE.Texture) {
          this.ownedExternalTextures.delete(previous);
          previous.dispose();
        }
        this.ownedExternalTextures.add(texture);
      })
    ).then(() => {
      if (!this.disposed) this.material.needsUpdate = true;
    });

    return this.externalTextureLoadPromise;
  }

  public get wetness(): number {
    return this.shaderUniforms.roadWetness.value as number;
  }

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
