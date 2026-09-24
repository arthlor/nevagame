import { COASTAL_FIELD_GLSL } from "./CoastalOptics";
import { CLOUD_SHADOW_RECEIVER_GLSL } from "../atmosphere/CloudShadows";
import { AERIAL_PERSPECTIVE_GLSL } from "../atmosphere/AerialPerspective";
import {
  OCEAN_CONTACT_FOAM_UNIFORMS_GLSL,
  OCEAN_CONTACT_FOAM_FUNCTION_GLSL,
  OCEAN_NOISE_GLSL,
  OCEAN_SSR_GLSL,
} from "./oceanShaderGlsl";

/** One optical response for every horizontal water surface and the falling sheet. */
export const WATER_SHADING_UNIFORMS_GLSL = /* glsl */ `
  ${COASTAL_FIELD_GLSL}
  ${CLOUD_SHADOW_RECEIVER_GLSL}
  ${AERIAL_PERSPECTIVE_GLSL}
  ${OCEAN_CONTACT_FOAM_UNIFORMS_GLSL}
  uniform mat4 uOpticsProjection;
  uniform float uCameraNear;
  uniform float uCameraFar;
  uniform int uSsrEnabled;
  uniform float uSsrStrength;
  uniform float uSssStrength;
  uniform float uBoatFoamStrength;
  uniform vec3 uWaterAbsorption;
  uniform vec3 uFreshwaterAbsorptionScale;
  uniform float uRoughTurbidity;
  uniform vec4 uLakeBounds;
  uniform float uLakeRippleScale;
  uniform float uLakeCurrentScale;
  uniform float uRefractionPixels;
  uniform float uCausticStrength;
  uniform vec2 uCausticDepthFade;
  uniform vec3 uCausticSunDirection;
  uniform float uCausticSunStrength;
  uniform int uSceneCaptureEnabled;
  uniform sampler2D uOpaqueColor;
  uniform sampler2D uOpaqueDepth;
  uniform vec2 uOpticsViewport;
  uniform mat4 uOpticsInverseProjection;
  uniform float uTime;
  uniform float uReducedMotion;
  uniform vec3 uShallowColor;
  uniform vec3 uMidColor;
  uniform vec3 uDeepColor;
  uniform vec3 uFoamColor;
  uniform vec3 uSunDirection;
  uniform vec3 uSunColor;
  uniform float uKeyLightStrength;
  uniform float uDaylight;
  uniform float uRoughness;
  uniform float uRainIntensity;
  uniform vec3 uSkyColor;
  uniform vec3 uSkyHorizonColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFresnelStrength;
  uniform float uSunGlintStrength;
  /** Tileable detail normals (RGB) and crest height (A). */
  uniform sampler2D uWaterNormalMap;
  /** Tile size in metres: large wind layer, small wind layer, river, spare. */
  uniform vec4 uDetailScale;
  /** Detail strength: sea, river (the lake scales the river by uLakeRippleScale). */
  uniform vec2 uDetailStrength;
  /** Drift velocity (m/s) of the large (xy) and small (zw) sea layers. */
  uniform vec4 uDetailDrift;
  /** Tier detail: (overall gain, small-layer weight). Low keeps one layer. */
  uniform vec2 uDetailTier;
  /** Atmosphere sky probe (upper hemisphere, equirectangular, mipmapped). */
  uniform sampler2D uSkyProbe;
  uniform float uSkyProbeEnabled;
  uniform float uSkyProbeMaxLod;
  /** Constant micro-slope variance, then its gain with sea roughness. */
  uniform vec2 uMicroSlope;
  uniform float uShallowEndMeters;
  uniform float uDepthRampStartMeters;
  uniform float uDepthRampEndMeters;
  uniform float uDepthColorStrength;
  uniform float uRapidsFoamStrength;
  uniform float uRapidsGradeStart;
  uniform float uRapidsGradeFull;
  uniform float uRapidsCellScale;
  uniform float uRapidsFlowSpeed;
  uniform float uRiverFlowSpeed;
  uniform float uRiverFlowDepthStart;
  uniform float uRiverFlowDepthFull;
  uniform float uRiverFlowLaneStrength;
  uniform float uRiverDepthShadeStrength;
  uniform float uRiverEdgeDepthFade;
  uniform float uRiverEdgeOpacity;
  uniform float uRiverEdgeFoamStrength;
  uniform float uRiverEdgeFoamScale;
  uniform float uPlungeRingSpeed;
  uniform float uPlungeRingWavelength;
  uniform float uPlungeRingStrength;
  uniform float uPlungeRingSpan;
  /** Fold values that begin and complete a breaking crest. */
  uniform vec2 uWhitecapFold;
  uniform float uWhitecapScatter;
  uniform float uWhitecapStrength;
  /** Strength of the sun-facing face brightening on the water body. */
  uniform float uCrestShading;
  /** Surf: energy gain, dissolve scale, shoreward drift, whiteness. */
  uniform vec4 uSurfFoam;
  /** Swash lip and object contact: (band width in metres, strength). */
  uniform vec2 uEdgeFoam;
  uniform int uReflectionMode; // 0 = flat, 1 = skyGradient, 2 = skyGradient+sun
`;

/**
 * Detail-normal and sky-reflection sampling shared by the horizontal
 * surfaces and the falling sheet (fragment stage only).
 */
export const WATER_SURFACE_SAMPLING_GLSL = /* glsl */ `
  /**
   * One tap of the tileable detail normals: (height gradient in the tile
   * frame, Toksvig variance). Mip averaging shortens the encoded normal where the
   * ripples are unresolved; that shortfall is their slope variance, which the
   * reflection and glint then treat as roughness instead of aliasing.
   */
  vec3 nevaDetailTap(vec2 uv) {
    vec3 n = texture(uWaterNormalMap, uv).xyz * 2.0 - 1.0;
    float len = max(length(n), 0.001);
    float variance = max(0.0, (1.0 - len) / len);
    n /= len;
    return vec3(-n.xy / max(n.z, 0.25), variance);
  }

  /**
   * Sky seen along a reflected direction. With the atmosphere's probe this is
   * the real sky — its gradient, clouds and sun halo — blurred by roughness
   * through the probe's mips; without it, the analytic gradient.
   *
   * The probe holds the sky's HDR radiance while the water body is authored
   * in palette units, so the probe is rescaled to the palette sky's mean
   * brightness (its coarsest mip is that mean). Its structure survives; its
   * scale cannot swamp the body and bleach the sea to the sky's colour.
   */
  vec3 nevaSkyReflection(vec3 direction, float sigma, float light) {
    vec3 d = normalize(vec3(direction.x, max(direction.y, 0.0), direction.z));
    if (uSkyProbeEnabled > 0.5) {
      vec2 uv = vec2(atan(d.x, d.z) / 6.28318530718 + 0.5, asin(clamp(d.y, 0.0, 1.0)) / 1.57079632679);
      float lod = clamp(log2(1.0 + sigma * 64.0), 0.0, uSkyProbeMaxLod);
      vec3 probe = textureLod(uSkyProbe, uv, lod).rgb;
      vec3 mean = textureLod(uSkyProbe, vec2(0.5, 0.6), uSkyProbeMaxLod).rgb;
      const vec3 luma = vec3(0.2126, 0.7152, 0.0722);
      float paletteMean = dot(mix(uSkyHorizonColor, uSkyColor, 0.7) * light, luma);
      return probe * (paletteMean / max(dot(mean, luma), 0.0001));
    }
    return mix(uSkyHorizonColor, uSkyColor, smoothstep(0.02, 0.5, d.y)) * light;
  }

`;

/**
 * Surface-detail fields shared by the horizontal water surfaces. Every field
 * is anchored in world space and fades against its own period, so none of
 * them swims or aliases.
 */
export const WATER_DETAIL_GLSL = /* glsl */ `
  ${WATER_SURFACE_SAMPLING_GLSL}
  /**
   * Sea ripples: two differently scaled layers of the detail tile, drifting
   * in fixed directions at different speeds so their interference never
   * repeats visibly. Texture space is tied to the world by constant
   * transforms only: turning it by a direction that varies across the map or
   * with the wind shears the ripples into streaks and swings the sea. The
   * tile's ripples lean along its x axis, laid here along world z, the way
   * the swell travels. Returns (world gradient, variance).
   */
  vec3 nevaMarineDetail(vec2 p, float time) {
    vec3 large = nevaDetailTap((p.yx - time * uDetailDrift.yx) / uDetailScale.x);
    const mat2 turn = mat2(0.8192, 0.5736, -0.5736, 0.8192);
    vec2 q = turn * (p - time * uDetailDrift.zw);
    vec3 small = nevaDetailTap(q.yx / uDetailScale.y + 0.37);
    float smallWeight = 0.38 * uDetailTier.y;
    vec2 gradient = large.yx * (1.0 - smallWeight) + (transpose(turn) * small.yx) * smallWeight;
    float variance = large.z * (1.0 - smallWeight) * (1.0 - smallWeight) + small.z * smallWeight * smallWeight;
    return vec3(gradient, variance);
  }

  /**
   * Current-borne ripples: the classic two-phase flow map. Texture space is
   * world-aligned; each copy is offset downstream by at most one cycle's
   * travel and restarts while its weight is zero, and the two copies half a
   * cycle apart cross-fade. The offset is bounded, so a bending current can
   * only nudge the ripples, never shear them into stripes.
   */
  vec3 nevaRiverDetail(vec2 p, vec2 flow, float speed, float time) {
    const float cycleSeconds = 1.8;
    float cycle = time / cycleSeconds;
    float phaseA = fract(cycle);
    float phaseB = fract(cycle + 0.5);
    float weightA = 1.0 - abs(2.0 * phaseA - 1.0);
    vec2 travel = flow * (speed * cycleSeconds);
    vec2 uv = p / uDetailScale.z;
    vec3 a = nevaDetailTap(uv - travel * phaseA / uDetailScale.z + floor(cycle) * vec2(0.31, 0.47));
    vec3 b = nevaDetailTap(uv - travel * phaseB / uDetailScale.z + floor(cycle + 0.5) * vec2(0.31, 0.47) + 0.5);
    return mix(b, a, weightA);
  }

  /** Soft, bubbly foam coverage in [0, 1] that drifts with the water. */
  float nevaFoamPattern(vec2 p, vec2 drift) {
    return oceanFbm(p * 0.85 + drift) * 0.62 + nevaNoise01(p * 3.3 - drift * 1.7) * 0.38;
  }

  // Voronoi edge network (F2 - F1): the bright lines a wavy surface focuses
  // onto a shallow bed.
  float nevaCausticLayer(vec2 p) {
    vec2 cell = floor(p);
    vec2 local = fract(p);
    float first = 8.0;
    float second = 8.0;
    for (int y = -1; y <= 1; y++) {
      for (int x = -1; x <= 1; x++) {
        vec2 offset = vec2(float(x), float(y));
        vec2 feature = offset + 0.5 + 0.42 * nevaNoiseHash2(cell + offset) - local;
        float d = dot(feature, feature);
        if (d < first) { second = first; first = d; }
        else if (d < second) { second = d; }
      }
    }
    return 1.0 - smoothstep(0.0, 0.32, sqrt(second) - sqrt(first));
  }

  /**
   * Caustic network on a bed point, distorted by the surface slope above it.
   * Two layers drift in different directions and multiply, so the network
   * breaks and re-forms instead of sliding as one sheet. Returns a signed
   * response around zero: bright filaments and slightly dimmer cells.
   */
  float nevaCaustics(vec2 bed, vec2 slope, float time) {
    vec2 p = bed * 0.72 + slope * 0.8;
    float a = nevaCausticLayer(p + vec2(time * 0.13, time * 0.07));
    float b = nevaCausticLayer(p * 1.37 + vec2(-time * 0.08, time * 0.11) + 5.3);
    return a * b * 1.6 - 0.22;
  }

  /**
   * Rain rings: each cell of a 0.6 m lattice receives drops at its own
   * rhythm; a ring expands from the impact and fades. Returns the slope the
   * ring front adds to the surface.
   */
  vec2 nevaRainRipples(vec2 xz, float time) {
    vec2 slope = vec2(0.0);
    for (int layer = 0; layer < 2; layer++) {
      float scale = layer == 0 ? 1.0 / 0.6 : 1.0 / 0.43;
      vec2 p = xz * scale + float(layer) * vec2(0.37, 0.71);
      vec2 cell = floor(p);
      for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
          vec2 id = cell + vec2(float(x), float(y));
          vec2 jitter = nevaNoiseHash2(id * 1.7 + float(layer) * 9.1);
          vec2 center = id + 0.5 + jitter * 0.32;
          float phase = fract(time * (0.55 + 0.25 * fract(jitter.x * 7.3)) + jitter.y * 3.1);
          vec2 delta = p - center;
          float radius = length(delta);
          float front = phase * 1.1;
          float ring = sin(clamp((radius - front) * 18.0, -3.14159, 3.14159))
            * (1.0 - smoothstep(0.0, 0.16, abs(radius - front))) * (1.0 - phase) * (1.0 - phase);
          slope += delta / max(radius, 0.0001) * ring;
        }
      }
    }
    return slope * 0.24;
  }
`;

export const WATER_SURFACE_SHADING_GLSL = /* glsl */ `
  ${OCEAN_NOISE_GLSL}
  ${OCEAN_CONTACT_FOAM_FUNCTION_GLSL}
  ${OCEAN_SSR_GLSL}
  ${WATER_DETAIL_GLSL}
  vec3 nevaViewPosition(vec2 uv, float depth) {
    vec4 point = uOpticsInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return point.xyz / point.w;
  }

  /**
   * Shade one fragment of horizontal water.
   *
   *   waveNormal     interpolated analytic normal of the resolved bands
   *   waveHeight     vertical displacement (waves + swash) at this point
   *   regionWeights  (river, sea, ocean)
   *   localFlow      unit travel/current direction
   *   waveFold       trochoid fold, the physical whitecap signal
   *   surfEnergy     breaking energy returned by the shoaling damp
   *   slopeVariance  (unresolved, resolved) wave slope variance
   *   cellMeters     lattice spacing that produced this triangle
   */
  vec4 nevaShadeWaterSurface(vec3 worldPosition, vec3 waveNormal, float waveHeight,
    vec3 regionWeights, vec2 localFlow, float waveFold, float surfEnergy,
    vec2 slopeVariance, float cellMeters) {
    vec4 field = nevaOpticsField(worldPosition.xz);
    float baselineElevation = worldPosition.y - waveHeight;
    if ((nevaHeadwaterContains(worldPosition.xz) || baselineElevation > 0.001) && field.b <= 0.0) discard;
    // The falling segment is drawn by its own sheet, so no horizontal surface
    // may span the drop. The edge dissolves over 15 cm with a world-stable
    // screen-door pattern instead of a hard line.
    if (nevaInsideHeadwaterFallBand(worldPosition.xz)) {
      float bandEdge = min(worldPosition.z - uHeadwaterFallBand.x, uHeadwaterFallBand.y - worldPosition.z);
      float bandHash = fract(sin(dot(floor(worldPosition.xz * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
      if (bandHash < smoothstep(0.0, 0.15, bandEdge)) discard;
    }
    float fieldDepth = field.r + waveHeight;
    // Opaque terrain normally clips the shore; this also rejects the parts of
    // the continuous sea surface that lie under the land.
    if (fieldDepth < -0.06) discard;
    float waterDepth = max(0.0, fieldDepth);
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    float cameraDistance = distance(cameraPosition, worldPosition);
    float pixelFootprint = max(length(dFdx(worldPosition.xz)), length(dFdy(worldPosition.xz)));
    float time = uTime * (1.0 - uReducedMotion * 0.65);
    float marineWeight = regionWeights.y + regionWeights.z;
    float riverWeight = regionWeights.x;
    float light = mix(0.19, 1.0, uDaylight);
    float cloudSunlight = nevaCloudSunlight(worldPosition);
    vec3 sunDirection = normalize(uSunDirection);

    // ---- Normals -----------------------------------------------------------
    // The interpolated analytic normal carries every wave the lattice draws;
    // the detail layers add the ripples it cannot, as slopes on top of it.
    // Everything too small for the pixel ends up in the slope variance.
    float surfaceGrade = nevaHeadwaterElevationAndGrade(worldPosition.xz).y;
    vec3 baseNormal = normalize(vec3(0.0, 1.0, -surfaceGrade));
    vec3 geometric = normalize(waveNormal);
    vec2 slope = -geometric.xz / max(geometric.y, 0.2);
    float detailVariance = 0.0;
    float lakeRadius = length((worldPosition.xz - uLakeBounds.xy) / uLakeBounds.zw);
    float lakeWeight = (1.0 - smoothstep(0.72, 1.06, lakeRadius)) * riverWeight;
    float currentWeight = riverWeight * mix(1.0, uLakeCurrentScale, lakeWeight);
    vec2 riverFlow = length(localFlow) > 0.001 ? normalize(localFlow) : vec2(0.0, 1.0);
    float flowDepth = clamp(waterDepth / max(0.15, uRiverFlowDepthFull), uRiverFlowDepthStart, 1.0);
    float flowSpeed = uRiverFlowSpeed * flowDepth * (1.0 - uReducedMotion * 0.65);
    // Ripples settle toward the waterline and thin out with distance, where
    // the mips have already folded them into roughness.
    float detailReach = mix(1.0, 0.45, smoothstep(60.0, 420.0, cameraDistance)) * smoothstep(0.02, 0.45, waterDepth)
      * uDetailTier.x;
    if (marineWeight > 0.02 && detailReach > 0.001) {
      vec3 marine = nevaMarineDetail(worldPosition.xz, time);
      float strength = uDetailStrength.x * (0.55 + 0.9 * uRoughness) * marineWeight * detailReach;
      slope += marine.xy * strength;
      detailVariance += marine.z * strength * strength;
    }
    if (riverWeight > 0.02 && detailReach > 0.001) {
      vec3 river = nevaRiverDetail(worldPosition.xz, riverFlow, max(0.05, flowSpeed * currentWeight), time);
      if (lakeWeight > 0.001) river = mix(river, nevaMarineDetail(worldPosition.xz, time * 0.35), lakeWeight);
      float strength = uDetailStrength.y * mix(1.0, uLakeRippleScale, lakeWeight) * riverWeight * detailReach;
      slope += river.xy * strength;
      detailVariance += river.z * strength * strength;
    }
    // Rain rings on every surface near the camera.
    if (uRainIntensity > 0.01) {
      float rainFade = nevaDetailFade(0.6, pixelFootprint);
      if (rainFade > 0.002) slope -= nevaRainRipples(worldPosition.xz, time) * uRainIntensity * rainFade;
    }
    vec3 normal = normalize(vec3(-slope.x, 1.0, -slope.y));
    float slopeVar = slopeVariance.x + detailVariance + uMicroSlope.x + uMicroSlope.y * uRoughness;
    float sigma = sqrt(slopeVar);

    // ---- Fresnel and sky reflection ---------------------------------------
    // Unresolved slopes act as roughness: tilted micro-faces face the viewer
    // more, lowering the grazing Fresnel, and they reflect a higher, bluer
    // band of sky, blurred, rather than a mirror of the pale horizon.
    float ndv = clamp(dot(viewDirection, normal), 0.0, 1.0);
    float ndvEffective = clamp(ndv + sigma * 0.9 * (1.0 - ndv), 0.0, 1.0);
    float fresnel = clamp((0.02 + 0.98 * pow(1.0 - ndvEffective, 5.0)) * uFresnelStrength, 0.02, 0.96);
    vec3 reflectView = reflect(-viewDirection, normal);
    reflectView.y += sigma * 0.6;
    vec3 sky = uReflectionMode == 0
      ? mix(uSkyHorizonColor, uSkyColor, 0.45) * light
      : nevaSkyReflection(reflectView, sigma, light);

    // ---- Water body --------------------------------------------------------
    vec3 body = mix(uShallowColor, uMidColor, smoothstep(0.15, uShallowEndMeters, waterDepth));
    body = mix(body, uDeepColor, smoothstep(uDepthRampStartMeters, uDepthRampEndMeters, waterDepth) * uDepthColorStrength);
    body *= light * mix(1.0, cloudSunlight, 0.55 * uDaylight);
    // Faces tilted toward the sun scatter a little more light than the backs
    // of the troughs; measured against still water, so the mean is unchanged.
    float faceLight = dot(normal, sunDirection) - dot(baseNormal, sunDirection);
    body *= 1.0 + faceLight * uCrestShading * mix(0.35, 1.0, uDaylight) * cloudSunlight;
    // Subsurface glow: light entering a crest's sunward face and leaving
    // through the thin top toward a viewer looking into the sun.
    float sssForward = pow(max(0.0, dot(viewDirection, -normalize(sunDirection + normal * 0.35))), 4.0);
    float crestThin = smoothstep(-0.05, 0.35, waveHeight) * smoothstep(0.4, 2.5, waterDepth);
    body += uShallowColor * (sssForward * crestThin * uSssStrength * 2.2 * uDaylight * cloudSunlight
      + uSssStrength * 0.25 * max(0.0, waveHeight) * light);
    // The carved thalweg is the deepest river water and reads darkest.
    float riverDepth = smoothstep(0.35, 1.9, waterDepth) * riverWeight;
    body = mix(body, uDeepColor * light * mix(1.0, cloudSunlight, 0.55 * uDaylight),
      riverDepth * uRiverDepthShadeStrength * (1.0 - fresnel * 0.5));
    // Broad drifting patches of lighter and darker water survive the
    // distance filter, so a wide channel still reads as moving from the bank.
    // World-aligned two-phase advection, like the ripples.
    if (currentWeight > 0.02) {
      float laneCycle = time / 6.0;
      float laneWeight = 1.0 - abs(2.0 * fract(laneCycle) - 1.0);
      vec2 laneTravel = riverFlow * (flowSpeed * 6.0);
      float laneField = mix(
        nevaGradientNoise((worldPosition.xz - laneTravel * fract(laneCycle + 0.5)) * 0.11 + floor(laneCycle + 0.5) * 3.7 + 7.7),
        nevaGradientNoise((worldPosition.xz - laneTravel * fract(laneCycle)) * 0.11 + floor(laneCycle) * 3.7),
        laneWeight);
      body *= 1.0 + laneField * uRiverFlowLaneStrength * currentWeight;
    }

    // ---- Transmission, refraction, caustics --------------------------------
    float refractedCos = sqrt(max(0.08, 1.0 - (1.0 - ndv * ndv) / (1.333 * 1.333)));
    float thickness = waterDepth / refractedCos;
    // Water above the nearest opaque surface straight below this pixel. On
    // the captured tier it is exact, which puts contact foam on rocks, posts
    // and hulls; elsewhere it is the baked bed depth.
    float contactDepth = waterDepth;
    vec3 behind = vec3(0.0);
    bool captured = uSceneCaptureEnabled == 1;
    // Freshwater carries silt and a moving surface, so its network is fainter.
    float causticGate = smoothstep(0.08, 0.35, uCausticSunDirection.y) * uCausticSunStrength * cloudSunlight
      * (1.0 - smoothstep(0.35, 0.8, uRoughness)) * nevaDetailFade(2.5, pixelFootprint)
      * mix(1.0, 0.45, riverWeight);
    if (captured) {
      vec2 uv = gl_FragCoord.xy / uOpticsViewport;
      vec2 offset = (mat3(viewMatrix) * normal).xy * uRefractionPixels / uOpticsViewport;
      offset *= smoothstep(0.03, 0.7, waterDepth);
      vec2 refractedUv = uv + offset;
      vec2 margin = 0.5 / uOpticsViewport;
      float straightDepth = texture2D(uOpaqueDepth, uv).r;
      float sampledDepth = texture2D(uOpaqueDepth, clamp(refractedUv, margin, 1.0 - margin)).r;
      bool valid = all(greaterThanEqual(refractedUv, margin)) && all(lessThanEqual(refractedUv, 1.0 - margin))
        && sampledDepth > gl_FragCoord.z + 0.000001;
      vec2 readUv = valid ? refractedUv : uv;
      sampledDepth = valid ? sampledDepth : straightDepth;
      vec3 waterView = (viewMatrix * vec4(worldPosition, 1.0)).xyz;
      vec3 receiverView = nevaViewPosition(readUv, sampledDepth);
      thickness = sampledDepth < 0.999999 ? max(0.0, length(receiverView - waterView)) : 80.0;
      behind = texture2D(uOpaqueColor, readUv).rgb;
      if (straightDepth < 0.999999 && straightDepth > gl_FragCoord.z + 0.000001) {
        vec3 straightView = nevaViewPosition(uv, straightDepth);
        vec3 straightWorld = worldPosition + transpose(mat3(viewMatrix)) * (straightView - waterView);
        contactDepth = max(0.0, worldPosition.y - straightWorld.y);
      }
      if (sampledDepth < 0.999999 && causticGate > 0.001) {
        vec3 receiverWorld = worldPosition + transpose(mat3(viewMatrix)) * (receiverView - waterView);
        float receiverDepth = max(0.0, worldPosition.y - receiverWorld.y);
        float causticWeight = smoothstep(0.04, 0.3, receiverDepth)
          * (1.0 - smoothstep(uCausticDepthFade.x, uCausticDepthFade.y, receiverDepth)) * causticGate;
        if (causticWeight > 0.001) {
          float caustic = nevaCaustics(receiverWorld.xz, normal.xz * receiverDepth, time);
          // The captured haze is already integrated: modulate the bed only.
          vec3 bedRadiance = max(vec3(0.0), behind - nevaAerialSegment(receiverWorld).rgb);
          behind += bedRadiance * caustic * causticWeight * uCausticStrength;
        }
      }
    } else if (causticGate > 0.001) {
      // Without the scene capture the bed shows through the body colour, so
      // the network lightens the shallow body instead.
      float causticWeight = smoothstep(0.08, 0.4, waterDepth)
        * (1.0 - smoothstep(uCausticDepthFade.x, uCausticDepthFade.y, waterDepth)) * causticGate;
      if (causticWeight > 0.001) {
        float caustic = nevaCaustics(worldPosition.xz, normal.xz * waterDepth, time);
        body += uShallowColor * light * caustic * causticWeight * uCausticStrength * 0.35;
      }
    }

    // ---- Reflection colour (SSR on the captured High tier) -----------------
    vec3 reflectionColor = sky;
    // Rough water blurs a reflection into the sky, so the march is skipped
    // where its weight below would be zero.
    if (captured && uSsrEnabled == 1 && uSsrStrength > 0.001 && fresnel > 0.035 && uRoughness < 0.85 && sigma < 0.3) {
      float ssrHit = 0.0;
      vec3 ssrColor = oceanRaymarchSSR(
        worldPosition, reflectView, viewMatrix, uOpticsProjection,
        uOpaqueColor, uOpaqueDepth, uCameraNear, uCameraFar, ssrHit);
      // Rough water blurs a reflection into the sky it would otherwise show.
      reflectionColor = mix(sky, ssrColor, clamp(ssrHit, 0.0, 1.0) * uSsrStrength
        * (1.0 - smoothstep(0.08, 0.3, sigma)));
    }
    // Rough water is stirred and aerated: it hides the bed, where clear
    // water let the terrain facets show through metres of open channel.
    float turbidity = 1.0 + uRoughTurbidity * smoothstep(0.3, 0.9, uRoughness);
    vec3 transmission = exp(-uWaterAbsorption * mix(vec3(1.0), uFreshwaterAbsorptionScale, riverWeight)
      * turbidity * min(thickness, 100.0));
    float averageTransmission = dot(transmission, vec3(0.2126, 0.7152, 0.0722));
    float alpha = clamp(1.0 - averageTransmission * (1.0 - fresnel), 0.045, 1.0);
    // Coverage and absorption are separate: the exposed bed fades into water
    // cleanly on every tier.
    float shorelineCoverage = smoothstep(-0.02, 0.06, fieldDepth) * mix(1.0,
      mix(uRiverEdgeOpacity, 1.0, smoothstep(0.0, max(0.05, uRiverEdgeDepthFade), waterDepth)), riverWeight);
    vec3 color = body * (1.0 - transmission) * (1.0 - fresnel) + reflectionColor * fresnel;
    color = captured ? color + behind * transmission * (1.0 - fresnel) : color / max(0.045, alpha);

    // ---- Sun and moon glint -------------------------------------------------
    // GGX lobe whose width follows the slope variance: tight sparkles on the
    // near ripples, widening with distance into a coherent glitter path.
    if (uReflectionMode >= 2 && uKeyLightStrength > 0.001) {
      vec3 halfVector = normalize(viewDirection + sunDirection);
      float nh = max(dot(normal, halfVector), 0.0);
      float alphaG = clamp(sqrt(2.0 * slopeVar), 0.035, 1.0);
      float alpha2 = alphaG * alphaG;
      float denominator = nh * nh * (alpha2 - 1.0) + 1.0;
      float ggx = alpha2 / (3.14159265 * denominator * denominator);
      float vh = clamp(dot(viewDirection, halfVector), 0.0, 1.0);
      float sunFresnel = 0.02 + 0.98 * pow(1.0 - vh, 5.0);
      float nl = max(dot(normal, sunDirection), 0.0);
      float visibility = 0.25 / max(0.05, max(ndv, 0.05) * max(nl, 0.05) + 0.2);
      float sunUp = smoothstep(-0.02, 0.08, sunDirection.y);
      float glint = min(ggx * sunFresnel * visibility * nl, 30.0) * uSunGlintStrength * uKeyLightStrength * sunUp;
      color += uSunColor * glint * cloudSunlight;
    }

    // ---- Foam ----------------------------------------------------------------
    float foam = 0.0;
    // Swash lip and contact: the run-up sheet's leading edge, and wherever the
    // water meets a rock, post or hull. A thin edge band dissolved through a
    // world-anchored pattern, so it never draws a permanent white outline, and
    // faded on footprint because it is well under a metre across.
    // The band is measured in metres from the edge, not in water depth: on a
    // nearly flat beach a few centimetres of water spans metres of sand, and
    // a depth band turned the whole swash sheet white. Depth over the local
    // gradient is the horizontal distance to where the water ends, whether
    // that is a gentle beach or the steep face of a rock.
    float depthGradient = length(vec2(dFdx(contactDepth), dFdy(contactDepth))) / max(pixelFootprint, 1e-4);
    float bedGradient = length(vec2(dFdx(field.g), dFdy(field.g))) / max(pixelFootprint, 1e-4);
    // Over the faceted seabed the exact contact depth follows every terrain
    // triangle, and its contours drew zig-zag foam lines; the baked bed is
    // smooth. The exact depth is kept only where it rises steeply — the face
    // of a rock, a post or a hull.
    float steepContact = smoothstep(0.35, 0.9, depthGradient);
    float edgeDepth = mix(waterDepth, contactDepth, steepContact);
    float edgeGradient = max(mix(bedGradient, depthGradient, steepContact), 0.02);
    float edgeMeters = edgeDepth / edgeGradient;
    float edgeBand = uEdgeFoam.x * (1.0 + uRoughness * 0.8);
    float edge = smoothstep(0.0, 0.1, edgeMeters) * (1.0 - smoothstep(edgeBand * 0.35, edgeBand, edgeMeters))
      * (1.0 - smoothstep(0.03, 0.14, edgeDepth));
    if (edge > 0.001) {
      float edgePattern = nevaFoamPattern(worldPosition.xz * 1.4, vec2(time * 0.17, -time * 0.13));
      // Shores always carry the lip; rocks, posts and hulls only once the sea
      // is rough enough to break against them — calm water lies still around
      // a moored boat.
      float objectContact = captured ? 0.6 * steepContact * smoothstep(0.3, 0.7, uRoughness) : 0.0;
      float edgeRegion = marineWeight * max(smoothstep(0.02, 0.2, field.a), objectContact)
        + riverWeight * 0.3;
      foam = max(foam, edge * smoothstep(0.32, 0.7, edgePattern) * edgeRegion * uEdgeFoam.y
        * nevaDetailFade(1.4, pixelFootprint));
    }
    // Hull contact: broken, bubbly water around a moving hull. Coverage is
    // capped like the surf's, so even a hull at full speed wears a lace of
    // foam with holes in it rather than a white blob.
    float boatEnergy = clamp(oceanContactEnergy(worldPosition.xz), 0.0, 1.0);
    if (boatEnergy > 0.001) {
      vec2 boatPoint = worldPosition.xz * 1.1 - vec2(time * 0.12, time * 0.07);
      float boatThreshold = mix(0.8, 0.46, boatEnergy);
      float boatCoverage = smoothstep(boatThreshold - 0.07, boatThreshold + 0.05, nevaFoamPattern(boatPoint, vec2(0.0)));
      boatCoverage *= mix(1.0, smoothstep(0.3, 0.55, nevaNoise01(boatPoint * 4.3)), 0.6 * nevaDetailFade(0.4, pixelFootprint));
      foam = max(foam, boatCoverage * uBoatFoamStrength * smoothstep(0.0, 0.12, boatEnergy));
    }
    float downhillGrade = max(0.0, -surfaceGrade);
    if (downhillGrade > uRapidsGradeStart && riverWeight > 0.02) {
      // Broken narrow ribbons advected along the authored channel tangent:
      // riffle lines follow the bend instead of lying across the stream.
      vec2 rapidAcross = vec2(-riverFlow.y, riverFlow.x);
      vec2 rapidAdvected = worldPosition.xz - riverFlow * (uTime * uRapidsFlowSpeed * (1.0 - uReducedMotion));
      vec2 rapidUv = vec2(dot(rapidAdvected, rapidAcross), dot(rapidAdvected, riverFlow)) / uRapidsCellScale;
      float rapidBend = nevaGradientNoise(rapidUv * vec2(0.65, 0.6));
      float rapidRibbon = smoothstep(0.72, 0.97, 0.5 + 0.5 * sin(rapidUv.x * 5.2 + rapidBend * 8.0));
      float rapidPatch = nevaGradientNoise(worldPosition.xz * 0.24 + vec2(0.0, uTime * 0.24));
      float rapidPacket = smoothstep(0.05, 0.5, nevaNoise01(rapidUv * vec2(0.8, 1.1) + vec2(11.3, 7.1)));
      float rapidGate = smoothstep(uRapidsGradeStart, uRapidsGradeFull, downhillGrade + (rapidPatch - 0.5) * 0.22);
      float rapidFilter = 1.0 - smoothstep(0.12, 0.6, pixelFootprint / uRapidsCellScale);
      foam = max(foam, rapidGate * smoothstep(0.05, 0.5, waterDepth) * rapidRibbon * rapidPacket
        * rapidFilter * uRapidsFoamStrength * riverWeight);
    }
    // Broken lace where the shallowing river drags along its bank, carried
    // downstream on the same bounded two-phase advection as the ripples.
    if (currentWeight > 0.02) {
      float edgeShallow = (1.0 - smoothstep(0.12, 0.55, waterDepth)) * currentWeight;
      float laceFade = nevaDetailFade(uRiverEdgeFoamScale, pixelFootprint);
      if (edgeShallow > 0.01 && laceFade > 0.002) {
        float laceCycle = time / 3.0;
        float laceWeight = 1.0 - abs(2.0 * fract(laceCycle) - 1.0);
        vec2 laceTravel = riverFlow * (flowSpeed * 3.0);
        vec2 laceUv = worldPosition.xz / uRiverEdgeFoamScale;
        float laceA = nevaNoise01(laceUv - laceTravel * fract(laceCycle) / uRiverEdgeFoamScale + floor(laceCycle) * 1.7);
        float laceB = nevaNoise01(laceUv - laceTravel * fract(laceCycle + 0.5) / uRiverEdgeFoamScale
          + floor(laceCycle + 0.5) * 1.7 + 4.3);
        float lace = smoothstep(0.62, 0.8, mix(laceB, laceA, laceWeight));
        foam = max(foam, edgeShallow * lace * uRiverEdgeFoamStrength * laceFade);
      }
    }
    // Landing apron: the plunge boils white and sends broken rings across the
    // flat pool water.
    if (nevaHeadwaterContains(worldPosition.xz) && worldPosition.z >= uHeadwaterFallBand.y) {
      vec2 landingDelta = worldPosition.xz - uHeadwaterLandingXZ;
      landingDelta.x += sin(landingDelta.y * 0.55) * smoothstep(0.0, 5.0, landingDelta.y) * 0.8;
      landingDelta.y *= 0.62;
      float landingDistance = length(landingDelta);
      float landingReach = 1.0 - smoothstep(0.7, 4.8, landingDistance);
      float apronFlat = 1.0 - smoothstep(0.1, 0.3, downhillGrade);
      float apronPattern = nevaNoise01(worldPosition.xz * 1.4 + vec2(uTime * 0.22, -uTime * 0.5));
      float ringPhase = landingDistance - uTime * uPlungeRingSpeed * (1.0 - uReducedMotion * 0.7);
      float ringWave = 0.5 + 0.5 * sin(ringPhase * 6.2831853 / max(0.2, uPlungeRingWavelength));
      float ringBreakup = smoothstep(0.28, 0.72, apronPattern);
      float rings = pow(ringWave, 3.0) * ringBreakup
        * nevaDetailFade(uPlungeRingWavelength * 0.5, pixelFootprint);
      float ringFade = (1.0 - smoothstep(0.0, uPlungeRingSpan, landingDistance))
        * smoothstep(0.15, 0.9, landingDistance);
      foam = max(foam, landingReach * (0.5 + 0.5 * apronPattern) * uRapidsFoamStrength * 1.1
        * mix(0.35, 1.0, apronFlat));
      foam = max(foam, rings * ringFade * uPlungeRingStrength * (0.6 + 0.4 * apronPattern) * apronFlat);
    }
    // Breaking crests: the trochoid folding on itself out at sea, and the
    // train collapsing as it runs out of depth (the surf line). They share
    // one dissolve so they never stack into a solid band.
    float depthGate = smoothstep(0.02, 0.12, waterDepth);
    // Whitecaps need wind: a fair-weather swell never breaks in open water,
    // however its crests happen to line up. A rough sea breaks everywhere a
    // little and most on the folding crests, so a storm reads as scattered
    // flecks rather than a few big patches where the crests align.
    float whitecapWeather = smoothstep(0.3, 0.75, uRoughness);
    float foldShare = mix(uWhitecapScatter, 1.0, smoothstep(uWhitecapFold.x, uWhitecapFold.y, waveFold))
      * (regionWeights.y * 0.55 + regionWeights.z) * depthGate * whitecapWeather;
    float surfShare = clamp(surfEnergy * uSurfFoam.x, 0.0, 1.0) * depthGate;
    float breakDrive = max(foldShare, surfShare);
    if (breakDrive > 0.001) {
      // Aerated water is patchy and full of holes: coverage is capped near
      // two thirds even where breaking is strongest, and bubbles punch
      // through the patches, so surf never lies on the water as one milky
      // sheet. Surf drifts shoreward along the local travel direction.
      // Breaking water drifts with the swell in its fixed direction: a drift
      // along the baked local direction grew with time and sheared where the
      // direction turned.
      vec2 breakDrift = normalize(uDetailDrift.xy + vec2(0.0, 0.0001)) * (time * uSurfFoam.z);
      // One fixed scale: scaling world coordinates (hundreds of metres) by a
      // factor that varies across the surf zone compressed the noise into
      // combed stripes and staircase edges wherever the surf changed.
      vec2 breakPoint = worldPosition.xz * uSurfFoam.y;
      float breakTexture = nevaFoamPattern(breakPoint, -breakDrift);
      // Open-water whitecaps stay broken: where the swell trains line up the
      // fold drive covers tens of metres, and a surf-line threshold whitened
      // two thirds of it into one blob. Even the steepest group now whitens
      // about a third; only a surf line reaches two thirds.
      float threshold = min(mix(0.84, 0.68, foldShare), mix(0.78, 0.4, surfShare));
      float coverage = smoothstep(threshold - 0.08, threshold + 0.05, breakTexture);
      float bubbles = nevaNoise01(breakPoint * 4.6 + breakDrift * 1.9);
      coverage *= mix(1.0, smoothstep(0.28, 0.52, bubbles), 0.7 * nevaDetailFade(0.4, pixelFootprint));
      float whiteness = max(min(1.0, foldShare * 2.0) * uWhitecapStrength, surfShare * uSurfFoam.w);
      foam = max(foam, coverage * whiteness * nevaDetailFade(3.0, pixelFootprint * 0.5));
    }
    foam = clamp(foam, 0.0, 0.94);
    // Foam is a matte, bright scatterer: lit by sun and sky, never glossy.
    vec3 foamLit = uFoamColor * mix(0.17, 1.0, uDaylight)
      * (0.8 + 0.2 * clamp(dot(normal, sunDirection) * 1.5, 0.0, 1.0)) * mix(1.0, cloudSunlight, 0.35);
    color = mix(color, foamLit, foam);
    alpha = mix(alpha, 1.0, foam);

    // ---- Atmosphere ------------------------------------------------------------
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    vec4 aerial = nevaAerialSegment(worldPosition);
    color = color * aerial.a + aerial.rgb;
    if (captured) {
      // The opaque snapshot already contains camera-segment haze: keep that
      // captured contribution once, including its share of inscattering.
      vec3 capturedWeight = transmission * (1.0 - fresnel) * (1.0 - foam);
      color += capturedWeight * (behind * (1.0 - aerial.a) - aerial.rgb);
    }
    color = captured ? mix(behind, color, shorelineCoverage) : color;
    return vec4(color, captured ? 1.0 : mix(alpha * shorelineCoverage, 1.0, fogFactor));
  }
`;
