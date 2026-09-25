/**
 * Cloudless sky radiance along a view direction: the zenith/horizon gradient,
 * the twilight glow on the sunward horizon, the anti-solar rose band, the
 * horizon's luminous haze line and the sun's aureole. The sky, its water
 * reflection probe and the aerial perspective share this one function, so
 * distant terrain fades into exactly the sky behind it at every hour.
 *
 * `sunGlow` and `antiTwilight` carry a colour (rgb) and strength (a). Both
 * replace the gradient rather than add to it: ACES keeps a saturated amber or
 * rose only when the green and blue under it are gone, so a summed glow over
 * the warm ring tone-maps to cream. `aureole` is the visible sun colour (rgb)
 * and broad-lobe strength (a); `shape` is (glow falloff, horizon band).
 */
export const SKY_RADIANCE_GLSL = /* glsl */ `
vec3 nevaSkyRadiance(vec3 ray, vec3 zenith, vec3 horizon, vec3 sunDirection, vec4 sunGlow,
    vec4 antiTwilight, vec4 aureole, vec2 shape) {
  float elevation = max(0.0, ray.y);
  vec3 sky = mix(horizon, zenith, 1.0 - exp(-elevation * 3.1));
  vec2 rayAzimuth = ray.xz / max(0.0001, length(ray.xz));
  vec2 sunAzimuth = sunDirection.xz / max(0.0001, length(sunDirection.xz));
  float sunward = 0.5 + 0.5 * dot(rayAzimuth, sunAzimuth);
  sky += horizon * exp(-elevation * 16.0) * shape.y;
  float glow = exp(-elevation * shape.x) * sunward * sunward * sunward * sunGlow.a;
  sky = mix(sky, sunGlow.rgb, clamp(glow, 0.0, 1.0));
  float away = 1.0 - sunward;
  float belt = exp(-abs(elevation - 0.09) * 15.0) * away * away * antiTwilight.a;
  sky = mix(sky, antiTwilight.rgb, clamp(belt, 0.0, 1.0));
  float toSun = max(0.0, dot(ray, sunDirection));
  float toSun2 = toSun * toSun;
  float toSun6 = toSun2 * toSun2 * toSun2;
  float toSun32 = toSun6 * toSun6;
  toSun32 = toSun32 * toSun32 * toSun6 * toSun2;
  return sky + aureole.rgb * (toSun32 * 0.16 + toSun6 * aureole.a);
}
`;
