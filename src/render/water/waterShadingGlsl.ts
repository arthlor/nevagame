import { COASTAL_FIELD_GLSL } from "./CoastalOptics";
import { CLOUD_SHADOW_RECEIVER_GLSL } from "../atmosphere/CloudShadows";
import { AERIAL_PERSPECTIVE_GLSL } from "../atmosphere/AerialPerspective";
import { WATER_CAUSTICS_GLSL } from "./waterCausticsGlsl";
import {
  OCEAN_CONTACT_FOAM_UNIFORMS_GLSL,
  OCEAN_CONTACT_FOAM_FUNCTION_GLSL,
  OCEAN_NOISE_GLSL,
  OCEAN_SSR_GLSL,
} from "./oceanShaderGlsl";

/** One optical response for coarse water and the near tessellation. */
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
  uniform float uRefractionPixels;
  uniform float uRippleNormalStrength;
  uniform float uCausticStrength;
  uniform vec2 uCausticDepthFade;
  uniform vec3 uCausticSunDirection;
  uniform float uCausticSunStrength;
  uniform vec3 uDistantSlope;
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
  uniform vec3 uSkyColor;
  uniform vec3 uSkyHorizonColor;
  uniform vec3 uFogColor;
  uniform float uFogNear;
  uniform float uFogFar;
  uniform float uFogDistanceDesaturation;
  uniform float uPolygonCellScale;
  uniform float uPolygonColorVariation;
  uniform float uPolygonNormalStrength;
  uniform float uNormalQuantization;
  uniform float uFresnelStrength;
  uniform float uSunGlintStrength;
  uniform float uShallowStartMeters;
  uniform float uShallowEndMeters;
  uniform float uShallowColorStrength;
  uniform float uNearShoreNormalScale;
  uniform float uDepthRampStartMeters;
  uniform float uDepthRampEndMeters;
  uniform float uDepthColorStrength;
  uniform float uRapidsFoamStrength;
  uniform float uRapidsGradeStart;
  uniform float uRapidsGradeFull;
  uniform float uRapidsCellScale;
  uniform float uRapidsFlowSpeed;
  uniform float uEdgeOpacity;
  uniform float uBodyOpacity;
  uniform float uOpacityRampMeters;
  uniform float uGlitterFocusNearMeters;
  uniform float uGlitterFocusFarMeters;
  uniform float uGlitterFarBroadening;
  uniform int uReflectionMode; // 0 = flat, 1 = skyGradient, 2 = skyGradient+sun
`;

export const WATER_SURFACE_SHADING_GLSL = /* glsl */ `
  ${WATER_CAUSTICS_GLSL}
  ${OCEAN_NOISE_GLSL}
  ${OCEAN_CONTACT_FOAM_FUNCTION_GLSL}
  ${OCEAN_SSR_GLSL}
  vec3 nevaViewPosition(vec2 uv, float depth) {
    vec4 point = uOpticsInverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
    return point.xyz / point.w;
  }
  vec4 nevaShadeWaterSurface(vec3 worldPosition, vec3 shadingNormal, float waveHeight,
    float signedWaterDistance, vec3 regionWeights) {
    float baselineElevation = worldPosition.y - waveHeight;
    if (nevaHeadwaterContains(worldPosition.xz) || baselineElevation > 0.001) {
      signedWaterDistance = profileAt(worldPosition.xz).r * 32.0 - 16.0;
      if (signedWaterDistance <= 0.0) discard;
    }
    // W07 surface ownership: the falling segment is drawn by its own sheet, so
    // no horizontal water surface may span the drop. The edge dissolves over
    // 15 cm with a world-stable screen-door pattern instead of a hard line,
    // so the sheet-to-surface join cannot shade as a seam. (The position hash
    // is static in world space: no swimming, no sorting risk, unlike alpha.)
    if (nevaInsideHeadwaterFallBand(worldPosition.xz)) {
      float bandEdge = min(worldPosition.z - uHeadwaterFallBand.x, uHeadwaterFallBand.y - worldPosition.z);
      float bandHash = fract(sin(dot(floor(worldPosition.xz * 9.0), vec2(12.9898, 78.233))) * 43758.5453);
      if (bandHash > smoothstep(0.0, 0.15, bandEdge)) discard;
    }
    vec4 field = nevaOpticsField(worldPosition.xz);
    float waterDepth = max(0.0, field.r + waveHeight);
    // Opaque terrain normally clips the shore; this also rejects interpolation
    // leaks at culling/terrain-patch edges without drawing a second coastline.
    if (field.r + waveHeight < -0.06) discard;
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    float cameraDistance = distance(cameraPosition, worldPosition);
    // Filter wave slopes around the canonical stream plane. Flattening the
    // downhill grade toward horizontal turns distant rapids into sky mirrors.
    float surfaceGrade = nevaHeadwaterElevationAndGrade(worldPosition.xz).y;
    vec3 baseNormal = normalize(vec3(0.0, 1.0, -surfaceGrade));
    float slopeFilter = mix(1.0, uDistantSlope.z, smoothstep(uDistantSlope.x, uDistantSlope.y, cameraDistance));
    // At a grazing view, tiny slopes sweep the reflection between sky and
    // horizon. Average their response instead of drawing parallel bright bands.
    slopeFilter *= mix(0.22, 1.0, smoothstep(0.04, 0.34, viewDirection.y));
    vec3 normal = normalize(mix(baseNormal, shadingNormal, slopeFilter));
    float pixelFootprint = max(length(dFdx(worldPosition.xz)), length(dFdy(worldPosition.xz)));
    float rippleFilter = (1.0 - smoothstep(0.25, 1.4, pixelFootprint))
      * mix(1.0, 0.02, smoothstep(35.0, 170.0, cameraDistance));
    if (uRippleNormalStrength > 0.0) {
      vec3 ripple = nevaScrollingDetailNormal(worldPosition.xz * 5.0, uTime,
        0.46 * (1.0 - uReducedMotion), uRippleNormalStrength * rippleFilter);
      normal = normalize(normal + (ripple - vec3(0.0, 1.0, 0.0)) * smoothstep(0.03, 0.5, waterDepth));
    }
    float ndv = clamp(dot(viewDirection, normal), 0.0, 1.0);
    float fresnel = clamp((0.02 + 0.98 * pow(1.0 - ndv, 5.0)) * uFresnelStrength, 0.02, 0.98);
    vec3 reflectView = reflect(-viewDirection, normal);
    vec3 sky = mix(uSkyHorizonColor, uSkyColor, smoothstep(0.015, 0.58, reflectView.y));
    // A broad fair-weather sky lobe supplies a soft reflection signal for the ripples.
    float cloudReflection = smoothstep(0.12, 0.42, nevaGradientNoise(reflectView.xz / max(0.12, reflectView.y + 0.18) * 2.3));
    sky = mix(sky, uSkyHorizonColor * 1.08, cloudReflection * 0.08);
    float light = mix(0.19, 1.0, uDaylight);
    float cloudSunlight = nevaCloudSunlight(worldPosition);
    vec3 body = mix(uShallowColor, uMidColor, smoothstep(0.15, uShallowEndMeters, waterDepth));
    body = mix(body, uDeepColor, smoothstep(uDepthRampStartMeters, uDepthRampEndMeters, waterDepth) * uDepthColorStrength);
    body *= light * mix(1.0, cloudSunlight, 0.55 * uDaylight);
    // Restrained backlit-crest translucency (WaterThreeJS SSS): a faint warm
    // glow through thin crests toward the sun, scaled by the configured
    // strength so it never washes the sea cyan.
    float sssBack = max(0.0, dot(viewDirection, -normalize(uSunDirection)));
    body += uShallowColor * (sssBack * sssBack * smoothstep(0.02, 0.22, waveHeight) * uSssStrength * uDaylight * cloudSunlight);
    float refractedCos = sqrt(max(0.08, 1.0 - (1.0 - ndv * ndv) / (1.333 * 1.333)));
    float thickness = waterDepth / refractedCos;
    vec3 behind = vec3(0.0);
    bool captured = uSceneCaptureEnabled == 1;
    if (captured) {
      // Evaluate derivatives before the per-pixel refraction validity branch.
      // Surface normals, wave time and depth are shared with the visible water.
      float causticFocus = nevaWaterCausticFocus(worldPosition, normal,
        min(waterDepth, uCausticDepthFade.y), uCausticSunDirection);
      vec2 uv = gl_FragCoord.xy / uOpticsViewport;
      vec2 offset = (mat3(viewMatrix) * normal).xy * uRefractionPixels / uOpticsViewport;
      offset *= smoothstep(0.03, 0.7, waterDepth);
      vec2 refractedUv = uv + offset;
      vec2 margin = 0.5 / uOpticsViewport;
      float sampledDepth = texture2D(uOpaqueDepth, clamp(refractedUv, margin, 1.0 - margin)).r;
      bool valid = all(greaterThanEqual(refractedUv, margin)) && all(lessThanEqual(refractedUv, 1.0 - margin))
        && sampledDepth > gl_FragCoord.z + 0.000001;
      vec2 readUv = valid ? refractedUv : uv;
      sampledDepth = texture2D(uOpaqueDepth, readUv).r;
      vec3 waterView = (viewMatrix * vec4(worldPosition, 1.0)).xyz;
      vec3 receiverView = nevaViewPosition(readUv, sampledDepth);
      thickness = sampledDepth < 0.999999
        ? max(0.0, length(receiverView - waterView)) : 80.0;
      behind = texture2D(uOpaqueColor, readUv).rgb;
      if (sampledDepth < 0.999999 && sampledDepth > gl_FragCoord.z + 0.000001) {
        vec3 receiverWorld = worldPosition + transpose(mat3(viewMatrix)) * (receiverView - waterView);
        float receiverDepth = max(0.0, worldPosition.y - receiverWorld.y);
        float causticWeight = smoothstep(0.04, 0.3, receiverDepth)
          * (1.0 - smoothstep(uCausticDepthFade.x, uCausticDepthFade.y, max(receiverDepth, waterDepth)))
          * (1.0 - smoothstep(0.35, 0.8, uRoughness)) * rippleFilter
          * smoothstep(0.08, 0.35, uCausticSunDirection.y) * uCausticSunStrength * cloudSunlight;
        // The captured haze is already integrated. Modulate the visible bed
        // radiance only, before transmission and the single aerial composite.
        vec3 bedRadiance = max(vec3(0.0), behind - nevaAerialSegment(receiverWorld).rgb);
        behind += bedRadiance * causticFocus * causticWeight * uCausticStrength;
      }
    }
    // High-tier screen-space reflections (WaterThreeJS): march the shared
    // snapshot and blend onto the analytic sky by the configured strength.
    // Misses keep the sky, so the worst case is the current look.
    vec3 reflectionColor = sky;
    if (captured && uSsrEnabled == 1 && uSsrStrength > 0.001) {
      float ssrHit = 0.0;
      vec3 ssrColor = oceanRaymarchSSR(
        worldPosition, reflectView, viewMatrix, uOpticsProjection,
        uOpaqueColor, uOpaqueDepth, uCameraNear, uCameraFar, ssrHit);
      reflectionColor = mix(sky, ssrColor, clamp(ssrHit, 0.0, 1.0) * uSsrStrength);
    }
    vec3 transmission = exp(-uWaterAbsorption * min(thickness, 100.0));
    float averageTransmission = dot(transmission, vec3(0.2126, 0.7152, 0.0722));
    float alpha = clamp(1.0 - averageTransmission * (1.0 - fresnel), 0.045, 1.0);
    vec3 color = body * (1.0 - transmission) * (1.0 - fresnel) + reflectionColor * light * fresnel;
    color = captured ? color + behind * transmission * (1.0 - fresnel) : color / max(0.045, alpha);
    if (uReflectionMode >= 2) {
      vec3 halfVector = normalize(viewDirection + normalize(uSunDirection));
      float exponent = mix(170.0, 48.0, clamp(uRoughness + pixelFootprint * 0.13, 0.0, 1.0));
      float glint = pow(max(dot(normal, halfVector), 0.0), exponent) * uSunGlintStrength * uKeyLightStrength;
      // Distance-faded micro-sparkle (WaterThreeJS glitter): jittered lobe
      // that dissolves with range and footprint instead of aliasing.
      float glitterFade = exp(-cameraDistance * 0.012) * rippleFilter;
      float sparkleJitter = oceanHash12(worldPosition.xz * 12.0 + floor(uTime * 4.0));
      float sparkle = pow(max(dot(normal, halfVector), 0.0), 64.0)
        * step(0.70, sparkleJitter) * 0.40 * uSunGlintStrength * glitterFade;
      color += uSunColor * (glint + sparkle) * (0.25 + 0.75 * fresnel) * cloudSunlight;
    }
    vec3 wash = nevaCoastalWash(worldPosition.xz, field.b);
    float coastalFoam = wash.x * field.a;
    // Scene thickness supplies rock contact, gated by this arriving wave packet.
    float rockFoam = captured ? (1.0 - smoothstep(0.035, 0.23, thickness))
      * smoothstep(0.25, 0.48, wash.z) * (1.0 - smoothstep(0.55, 0.72, wash.z))
      * smoothstep(0.9, 3.0, field.b) * field.a * 0.4 : 0.0;
    // Hull contact energy dissolved through FBM (WaterThreeJS): dense only
    // where energy is high, feathering out as it fades. Scaled restrained so
    // moored hulls read as a faint ring and the wake pool keeps the trail.
    float boatFoam = 0.0;
    float boatEnergy = oceanContactEnergy(worldPosition.xz) * uBoatFoamStrength;
    if (boatEnergy > 0.001) {
      float boatTex = oceanFbm(worldPosition.xz * 0.5 - vec2(uTime * 0.12, uTime * 0.07));
      float boatThr = 1.0 - clamp(boatEnergy, 0.0, 1.0);
      boatFoam = smoothstep(boatThr - 0.2, boatThr + 0.2, boatTex)
        * smoothstep(0.0, 0.12, boatEnergy);
    }
    float foam = max(max(coastalFoam, rockFoam), boatFoam);
    float downhillGrade = max(0.0, -surfaceGrade);
    if (downhillGrade > uRapidsGradeStart) {
      // The headwater profile descends toward +Z. Advect broken narrow ribbons
      // along that grade; broad polygon cells read as slabs across the stream.
      vec2 rapidUv = (worldPosition.xz - vec2(0.0,
        uTime * uRapidsFlowSpeed * (1.0 - uReducedMotion))) / uRapidsCellScale;
      float rapidBend = nevaGradientNoise(rapidUv * vec2(0.65, 0.6));
      float rapidRibbon = smoothstep(0.72, 0.97,
        0.5 + 0.5 * sin(rapidUv.x * 5.2 + rapidBend * 8.0));
      float rapidPacket = smoothstep(-0.08, 0.3,
        nevaGradientNoise(rapidUv * vec2(0.8, 1.1) + vec2(11.3, 7.1)));
      float rapidFilter = 1.0 - smoothstep(0.12, 0.6, pixelFootprint / uRapidsCellScale);
      foam = max(foam, smoothstep(uRapidsGradeStart, uRapidsGradeFull, downhillGrade)
        * smoothstep(0.05, 0.5, waterDepth) * rapidRibbon * rapidPacket * rapidFilter * uRapidsFoamStrength);
    }
    // Landing apron: the plunge must read through the rapids below it, so the
    // impact foams the horizontal water itself past the landing line,
    // stretched downstream into the pool. Without this the sheet ends bright,
    // the rapids below go dark, and the watercourse reads as cut in two. The
    // floor keeps the whole apron lifted, not just the noise peaks.
    {
      vec2 landingDelta = worldPosition.xz - uHeadwaterLandingXZ;
      landingDelta.y *= 0.5;
      float landingReach = 1.0 - smoothstep(0.0, 3.5, length(landingDelta));
      float apronPattern = nevaGradientNoise(worldPosition.xz * 1.4
        + vec2(uTime * 0.22, -uTime * 0.5));
      foam = max(foam, landingReach * (0.55 + 0.45 * apronPattern)
        * uRapidsFoamStrength * 1.5);
    }
    float whitecap = smoothstep(0.7, 1.0, uRoughness) * regionWeights.z
      * smoothstep(0.13, 0.3, waveHeight) * smoothstep(0.012, 0.04, 1.0 - normal.y);
    foam = clamp(max(foam, whitecap * 0.42), 0.0, 0.92);
    color = mix(color, uFoamColor * mix(0.17, 1.0, uDaylight), foam);
    alpha = mix(alpha, 1.0, foam);
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    vec4 aerial = nevaAerialSegment(worldPosition);
    color = color * aerial.a + aerial.rgb;
    if (captured) {
      // The opaque snapshot already contains camera-segment haze. Keep that
      // captured contribution once, including its share of the inscattering.
      vec3 capturedWeight = transmission * (1.0 - fresnel) * (1.0 - foam);
      color += capturedWeight * (behind * (1.0 - aerial.a) - aerial.rgb);
    }
    return vec4(color, captured ? 1.0 : mix(alpha, 1.0, fogFactor));
  }
`;
