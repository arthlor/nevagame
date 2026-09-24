import { CLOUD_FIELD_GLSL } from "./cloudFieldGlsl";

/** Linear-radiance sky. The display material/OutputPass owns tone mapping. */
export const ATMOSPHERE_SKY_FRAGMENT = /* glsl */ `
uniform mat4 uInverseProjection;
uniform mat3 uCameraRotation;
uniform vec3 uEye;
uniform vec3 uZenith;
uniform vec3 uHorizon;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uMoonDirection;
uniform vec3 uMoonColor;
uniform vec3 uLightningDirection;
uniform vec2 uDiscRadius;
uniform vec4 uSkyState;
uniform float uMaxDistance;
uniform float uHaze;
uniform float uVolumeBlend;
varying vec2 vUv;

${CLOUD_FIELD_GLSL}
vec3 cloudLight(vec3 position, vec3 ray, float density, bool volume) {
  float opticalDepth = density * uCloudLayer.y * 0.48;
  #if SKY_VOLUME == 1
    if (volume) {
      opticalDepth = 0.0;
      float lightStep = uCloudLayer.y / float(LIGHT_STEPS);
      for (int j = 0; j < LIGHT_STEPS; j++) {
        opticalDepth += cloudDensity(position + uSunDirection * lightStep * (float(j) + 0.5), false) * lightStep;
      }
    }
  #endif
  float sunlight = exp(-opticalDepth * uCloudLayer.w);
  float forward = pow(max(0.0, dot(ray, uSunDirection)), 12.0);
  float daylight = uSkyState.x;
  vec3 ambient = mix(uMoonColor * 0.055, mix(uHorizon, vec3(1.0), 0.55) * 0.48, daylight);
  vec3 direct = uSunColor * daylight * (0.62 + forward * 0.65) * sunlight;
  vec3 radiance = (ambient + direct) * mix(1.0, 0.72, uWeather.y);
  float flash = pow(max(0.0, dot(ray, uLightningDirection)), 14.0) * uWeather.z;
  return radiance + uMoonColor * flash * 2.0;
}

void main() {
  #ifdef SKY_EQUIRECT
  // Reflection probe: the upper hemisphere as an equirectangular strip
  // (u: azimuth, v: elevation 0..π/2), sampled by the water's reflections.
  float probeAzimuth = vUv.x * 6.28318530718 - 3.14159265359;
  float probeElevation = vUv.y * 1.57079632679;
  vec3 ray = vec3(cos(probeElevation) * sin(probeAzimuth), sin(probeElevation),
    cos(probeElevation) * cos(probeAzimuth));
  #else
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 nearView = uInverseProjection * vec4(ndc, -1.0, 1.0);
  vec4 farView = uInverseProjection * vec4(ndc, 1.0, 1.0);
  vec3 ray = normalize(uCameraRotation * (farView.xyz / farView.w - nearView.xyz / nearView.w));
  #endif
  float elevation = max(0.0, ray.y);
  float upper = 1.0 - exp(-elevation * 3.1);
  vec3 sky = mix(uHorizon, uZenith, upper);
  float sunAngle = dot(ray, uSunDirection);
  float sunHalo = pow(max(0.0, sunAngle), 32.0) * 0.16;
  sky += uSunColor * sunHalo * uSkyState.y * (1.0 - uWeather.x * 0.65);
  float sunEdge = cos(uDiscRadius.x);
  float moonEdge = cos(uDiscRadius.y);
  float sunDisc = smoothstep(sunEdge - 0.000012, sunEdge + 0.000012, sunAngle);
  float moonDisc = smoothstep(moonEdge - 0.000018, moonEdge + 0.000018, dot(ray, uMoonDirection));
  #ifndef SKY_EQUIRECT
  // The probe leaves the discs out: the water's specular lobe owns the sun
  // and moon, and a second disc in the reflection would double them.
  sky += uSunColor * sunDisc * uSkyState.y * 5.0;
  sky += uMoonColor * moonDisc * uSkyState.z * 1.25;
  #endif
  float starTransmittance = 1.0 - moonDisc;
  if (ray.y > 0.015) {
    // The high veil sits behind the lower cloud deck.
    float highDistance = (uCloudLayer.x + uCloudLayer.y * 3.0 - uEye.y) / ray.y;
    vec2 highPoint = (uEye + ray * highDistance).xz - uCloudOffset * 1.37;
    float veil = weatherShape(highPoint * vec2(0.24, 1.4) + 410.0);
    veil = smoothstep(0.58, 0.78, veil) * uWeather.x * 0.11 * smoothstep(0.03, 0.25, ray.y);
    sky = mix(sky, uHorizon * mix(0.5, 1.1, uSkyState.x), veil);
    starTransmittance *= 1.0 - veil;
    float entry = max(0.0, (uCloudLayer.x - uEye.y) / ray.y);
    float exitDistance = min(uMaxDistance, (uCloudLayer.x + uCloudLayer.y - uEye.y) / ray.y);
    if (exitDistance > entry) {
      vec3 radiance = vec3(0.0);
      float transmittance = 1.0;
      // Fixed spatial jitter breaks the visible horizontal strata at lower
      // sample counts. It has no frame index, history, or flashing noise.
      float sampleOffset = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
      #if SKY_VOLUME == 1
      if (uVolumeBlend > 0.0) {
        float stepLength = (exitDistance - entry) / float(PRIMARY_STEPS);
        for (int i = 0; i < PRIMARY_STEPS; i++) {
          vec3 position = uEye + ray * (entry + (float(i) + sampleOffset) * stepLength);
          float density = cloudDensity(position, true);
          if (density > 0.002) {
            float stepT = exp(-density * uCloudLayer.w * stepLength);
            radiance += transmittance * (1.0 - stepT) * cloudLight(position, ray, density, true);
            transmittance *= stepT;
            if (transmittance < 0.015) break;
          }
        }
      }
      #endif
      if (uVolumeBlend < 1.0) {
        // Several broad strata keep the silhouette rounded at lower tiers.
        // Lighting uses an analytic depth estimate instead of a nested march.
        float layerT = 1.0;
        vec3 layerRadiance = vec3(0.0);
        float layerLength = (exitDistance - entry) / float(LAYER_STEPS);
        for (int i = 0; i < LAYER_STEPS; i++) {
          vec3 position = uEye + ray * (entry + (float(i) + sampleOffset) * layerLength);
          float density = cloudDensity(position, true);
          float stepT = exp(-density * uCloudLayer.w * layerLength);
          layerRadiance += layerT * (1.0 - stepT) * cloudLight(position, ray, density, false);
          layerT *= stepT;
          if (layerT < 0.015) break;
        }
        transmittance = mix(layerT, transmittance, uVolumeBlend);
        radiance = mix(layerRadiance, radiance, uVolumeBlend);
      }
      float distantHaze = 1.0 - exp(-entry * uHaze);
      radiance = mix(radiance, sky * (1.0 - transmittance), distantHaze);
      sky = sky * transmittance + radiance;
      starTransmittance *= transmittance;
    }
  }
  // Alpha carries visibility for sharp stars in the existing display pass.
  gl_FragColor = vec4(max(sky, vec3(0.0)), starTransmittance);
}
`;

export const SKY_DISPLAY_FRAGMENT = /* glsl */ `
uniform sampler2D uSky;
uniform vec2 uSkyTexel;
uniform mat4 uInverseProjection;
uniform mat3 uCameraRotation;
uniform vec4 uSkyState;
uniform vec3 uMoonColor;
uniform float uSeed;
uniform vec4 uStars;
varying vec2 vUv;

vec3 starHash(vec3 cell) {
  cell = fract(cell * vec3(0.1031, 0.1030, 0.0973));
  cell += dot(cell, cell.yxz + 33.33);
  return fract((cell.xxy + cell.yxx) * cell.zyx);
}

float starRadiance(vec3 ray) {
  // Cube-direction cells avoid polar stretching. Inset centers leave room for
  // each point's filter footprint at cell and cube-face boundaries.
  vec3 magnitude = abs(ray);
  vec2 plane;
  float face;
  if (magnitude.x >= magnitude.y && magnitude.x >= magnitude.z) {
    plane = ray.yz / magnitude.x;
    face = ray.x > 0.0 ? 0.0 : 1.0;
  } else if (magnitude.y >= magnitude.z) {
    plane = ray.xz / magnitude.y;
    face = ray.y > 0.0 ? 2.0 : 3.0;
  } else {
    plane = ray.xy / magnitude.z;
    face = ray.z > 0.0 ? 4.0 : 5.0;
  }
  vec2 cell = floor((plane * 0.5 + 0.5) * uStars.x);
  vec3 random = starHash(vec3(cell, face * 173.0 + uSeed));
  vec2 center = (cell + mix(vec2(0.18), vec2(0.82), random.xy)) / uStars.x * 2.0 - 1.0;
  vec3 direction;
  if (face < 2.0) direction = vec3(face == 0.0 ? 1.0 : -1.0, center);
  else if (face < 4.0) direction = vec3(center.x, face == 2.0 ? 1.0 : -1.0, center.y);
  else direction = vec3(center, face == 4.0 ? 1.0 : -1.0);
  float distanceToStar = length(cross(ray, normalize(direction)));
  float brightness = min(1.0, random.z / uStars.y);
  float radius = uStars.z * mix(0.65, 1.4, brightness * brightness);
  // Integrate a small point over its pixel footprint, preserving energy when
  // it becomes subpixel. No frame noise, twinkle, or cloud-resolution shimmer.
  float pixel = max(length(dFdx(ray)), length(dFdy(ray))) * 0.6;
  float radiusSq = radius * radius;
  float filteredSq = radiusSq + pixel * pixel;
  return step(random.z, uStars.y) * exp(-2.0 * distanceToStar * distanceToStar / filteredSq)
    * radiusSq / filteredSq * mix(0.35, 1.0, brightness) * uStars.w;
}

void main() {
  vec4 sky = texture2D(uSky, vUv) * 0.2941176471;
  sky += texture2D(uSky, vUv + uSkyTexel * vec2(1.333333, 1.333333)) * 0.1764705882;
  sky += texture2D(uSky, vUv + uSkyTexel * vec2(-1.333333, 1.333333)) * 0.1764705882;
  sky += texture2D(uSky, vUv + uSkyTexel * vec2(1.333333, -1.333333)) * 0.1764705882;
  sky += texture2D(uSky, vUv + uSkyTexel * vec2(-1.333333, -1.333333)) * 0.1764705882;
  vec2 ndc = vUv * 2.0 - 1.0;
  vec4 nearView = uInverseProjection * vec4(ndc, -1.0, 1.0);
  vec4 farView = uInverseProjection * vec4(ndc, 1.0, 1.0);
  vec3 ray = normalize(uCameraRotation * (farView.xyz / farView.w - nearView.xyz / nearView.w));
  float stars = starRadiance(ray) * uSkyState.w * smoothstep(0.03, 0.25, ray.y) * sky.a;
  gl_FragColor = vec4(sky.rgb + uMoonColor * stars, 1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}
`;

export const SKY_QUAD_VERTEX = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 1.0, 1.0);
}
`;
