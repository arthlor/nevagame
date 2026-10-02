/** Rounded, world-space gravel shared by brook banks and embedded road stones. */
export const GROUND_STONES_GLSL = /* glsl */ `
float nevaStoneHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }

// One or no stone per cell, with independently varied size, stretch and turn.
// Returns body, rounded crown and colour seed; slope and nearest also describe
// that same stone so lighting and the grit between stones agree with its shape.
vec4 nevaGroundStones(vec2 p, float keep, out vec2 slope, out float nearest) {
  vec2 n = floor(p), f = fract(p);
  vec4 stone = vec4(0.0);
  slope = vec2(0.0);
  nearest = 8.0;
  for (int j = -1; j <= 1; j++) {
    for (int i = -1; i <= 1; i++) {
      vec2 cell = n + vec2(float(i), float(j));
      if (nevaStoneHash(cell + 3.7) > keep) continue;
      float size = nevaStoneHash(cell + 9.1);
      float turn = nevaStoneHash(cell + 5.3) * 6.2831853;
      vec2 toCentre = vec2(float(i), float(j)) + vec2(nevaStoneHash(cell), nevaStoneHash(cell + vec2(17.3, 5.1))) * 0.5 + 0.25 - f;
      vec2 r = mat2(cos(turn), -sin(turn), sin(turn), cos(turn)) * toCentre;
      r.x /= 1.0 + size * 0.55;
      float radius = mix(0.26, 0.44, size);
      float d = length(r) / radius;
      nearest = min(nearest, d);
      float body = 1.0 - smoothstep(0.78, 1.0, d);
      if (body > stone.x) {
        stone = vec4(body, 1.0 - d * d, 0.0, nevaStoneHash(cell + 11.9));
        slope = -toCentre / radius;
      }
    }
  }
  return stone;
}
`;
