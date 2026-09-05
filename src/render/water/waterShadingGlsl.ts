import { COASTAL_FIELD_GLSL } from "./CoastalOptics";

/** One optical response for coarse water and the near tessellation. */
export const WATER_SHADING_UNIFORMS_GLSL = /* glsl */ `
  ${COASTAL_FIELD_GLSL}
  uniform vec3 uWaterAbsorption;
  uniform float uRefractionPixels;
  uniform float uRippleNormalStrength;
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
    vec4 field = nevaOpticsField(worldPosition.xz);
    float waterDepth = max(0.0, field.r + waveHeight);
    // Opaque terrain normally clips the shore; this also rejects interpolation
    // leaks at culling/terrain-patch edges without drawing a second coastline.
    if (field.r + waveHeight < -0.06) discard;
    vec3 viewDirection = normalize(cameraPosition - worldPosition);
    // Filter distant slopes before Fresnel magnifies sub-pixel wave bands at
    // grazing angles. Geometry and CPU buoyancy retain their shared heights.
    float slopeFilter = mix(1.0, 0.12, smoothstep(30.0, 150.0, distance(cameraPosition, worldPosition)));
    vec3 normal = normalize(mix(vec3(0.0, 1.0, 0.0), shadingNormal, slopeFilter));
    float pixelFootprint = max(length(dFdx(worldPosition.xz)), length(dFdy(worldPosition.xz)));
    float rippleFilter = (1.0 - smoothstep(0.25, 1.4, pixelFootprint))
      * mix(1.0, 0.02, smoothstep(35.0, 170.0, distance(cameraPosition, worldPosition)));
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
    vec3 body = mix(uShallowColor, uMidColor, smoothstep(0.15, uShallowEndMeters, waterDepth));
    body = mix(body, uDeepColor, smoothstep(uDepthRampStartMeters, uDepthRampEndMeters, waterDepth) * uDepthColorStrength);
    body *= light;
    float refractedCos = sqrt(max(0.08, 1.0 - (1.0 - ndv * ndv) / (1.333 * 1.333)));
    float thickness = waterDepth / refractedCos;
    vec3 behind = vec3(0.0);
    bool captured = uSceneCaptureEnabled == 1;
    if (captured) {
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
      thickness = sampledDepth < 0.999999
        ? max(0.0, length(nevaViewPosition(readUv, sampledDepth) - waterView)) : 80.0;
      behind = texture2D(uOpaqueColor, readUv).rgb;
    }
    vec3 transmission = exp(-uWaterAbsorption * min(thickness, 100.0));
    float averageTransmission = dot(transmission, vec3(0.2126, 0.7152, 0.0722));
    float alpha = clamp(1.0 - averageTransmission * (1.0 - fresnel), 0.045, 1.0);
    vec3 color = body * (1.0 - transmission) * (1.0 - fresnel) + sky * light * fresnel;
    color = captured ? color + behind * transmission * (1.0 - fresnel) : color / max(0.045, alpha);
    if (uReflectionMode >= 2) {
      vec3 halfVector = normalize(viewDirection + normalize(uSunDirection));
      float exponent = mix(170.0, 48.0, clamp(uRoughness + pixelFootprint * 0.13, 0.0, 1.0));
      float glint = pow(max(dot(normal, halfVector), 0.0), exponent) * uSunGlintStrength * uKeyLightStrength;
      color += uSunColor * glint * (0.25 + 0.75 * fresnel);
    }
    vec3 wash = nevaCoastalWash(worldPosition.xz, field.b);
    float coastalFoam = wash.x * field.a;
    // Scene thickness supplies rock contact, gated by this arriving wave packet.
    float rockFoam = captured ? (1.0 - smoothstep(0.035, 0.23, thickness))
      * smoothstep(0.25, 0.48, wash.z) * (1.0 - smoothstep(0.55, 0.72, wash.z))
      * smoothstep(0.9, 3.0, field.b) * field.a * 0.4 : 0.0;
    float foam = max(coastalFoam, rockFoam);
    float downhillGrade = max(0.0, -nevaHeadwaterElevationAndGrade(worldPosition.xz).y);
    if (downhillGrade > uRapidsGradeStart) {
      vec4 rapidCell = nevaGroundPolygonCell(worldPosition.xz - vec2(0.0,
        uTime * uRapidsFlowSpeed * (1.0 - uReducedMotion)), uRapidsCellScale);
      foam = max(foam, smoothstep(uRapidsGradeStart, uRapidsGradeFull, downhillGrade)
        * smoothstep(0.05, 0.5, waterDepth) * smoothstep(0.5, 0.76, rapidCell.x) * uRapidsFoamStrength);
    }
    float whitecap = smoothstep(0.7, 1.0, uRoughness) * regionWeights.z
      * smoothstep(0.13, 0.3, waveHeight) * smoothstep(0.012, 0.04, 1.0 - normal.y);
    foam = clamp(max(foam, whitecap * 0.42), 0.0, 0.92);
    color = mix(color, uFoamColor * mix(0.17, 1.0, uDaylight), foam);
    alpha = mix(alpha, 1.0, foam);
    float cameraDistance = distance(cameraPosition, worldPosition);
    float fogFactor = smoothstep(uFogNear, uFogFar, cameraDistance);
    color = mix(color, uFogColor, fogFactor * 0.82);
    return vec4(color, captured ? 1.0 : mix(alpha, 1.0, fogFactor));
  }
`;
