/** Shared weather-shaped density for visible clouds and projected sunlight. */
export const CLOUD_FIELD_GLSL = /* glsl */ `
uniform vec2 uCloudOffset;
uniform vec4 uCloudLayer;
uniform vec4 uWeather;
uniform float uErosion;
uniform float uSeed;
float hash31(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.yzx + 33.33);
  return fract((p.x + p.y) * p.z);
}
float noise3(vec3 p) {
  vec3 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash31(i), hash31(i + vec3(1,0,0)), f.x),
                 mix(hash31(i + vec3(0,1,0)), hash31(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash31(i + vec3(0,0,1)), hash31(i + vec3(1,0,1)), f.x),
                 mix(hash31(i + vec3(0,1,1)), hash31(i + vec3(1,1,1)), f.x), f.y), f.z);
}

float weatherShape(vec2 position) {
  vec3 p = vec3(position / uCloudLayer.z, uSeed);
  return noise3(p) * 0.66 + noise3(p * 2.13 + 17.1) * 0.34;
}

float cloudDensity(vec3 position, bool detail) {
  float height = (position.y - uCloudLayer.x) / uCloudLayer.y;
  if (height <= 0.0 || height >= 1.0) return 0.0;
  vec2 advected = position.xz - uCloudOffset;
  float weather = weatherShape(advected);
  // A sheltered base beneath rising billows. The weather footprint groups the
  // clouds; a separate height-varying body prevents each group becoming a slab.
  float profile = smoothstep(0.0, 0.12, height) * (1.0 - smoothstep(0.60, 1.0, height));
  float threshold = mix(0.72, 0.23, uWeather.x);
  vec3 bodyPoint = vec3(advected / uCloudLayer.z, height * 1.8) + uSeed;
  float billow = noise3(bodyPoint * 1.7 + 31.4);
  float shape = weather + (billow - 0.42) * 0.30 - (1.0 - profile) * 0.30;
  if (detail) {
    vec3 p = vec3(advected / uCloudLayer.z, height * 0.8) + uSeed;
    // Detail only erodes an existing weather-shaped mass.
    shape -= (1.0 - noise3(p * 5.7)) * uErosion * mix(1.0, 0.45, height);
  }
  return smoothstep(threshold, threshold + 0.17, shape) * profile;
}

`;
