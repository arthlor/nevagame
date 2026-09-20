/**
 * Shared GLSL chunks adapted from WaterThreeJS
 * (https://github.com/achrefelouafi/WaterThreeJS) for Neva's cozy baseline.
 *
 * Adaptation notes (Art Pipeline §6, 04 §8):
 * - Neva's GPU wave field displaces vertically only, so there is no
 *   horizontal Gerstner map to invert here; buoyancy samples the same
 *   vertical field on the CPU.
 * - Boat foam is an *energy* field dissolved through FBM with the coastal,
 *   rock, rapids and whitecap energy. It never mixes straight to the foam
 *   color, which is what stamped the hard milky halo in the first attempt.
 * - SSR marches the shared opaque snapshot owned by RendererPipeline and
 *   blends onto the analytic sky by uSsrStrength. Projection/near/far are
 *   shared coastal uniforms so capture updates reach both water surfaces.
 */

export const OCEAN_NOISE_GLSL = /* glsl */ `
  float oceanHash12(vec2 p) {
    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
    p3 += dot(p3, p3.yzx + 33.33);
    return fract((p3.x + p3.y) * p3.z);
  }

  float oceanValueNoise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(oceanHash12(i), oceanHash12(i + vec2(1.0, 0.0)), u.x),
      mix(oceanHash12(i + vec2(0.0, 1.0)), oceanHash12(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float oceanFbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    vec2 shift = vec2(100.0);
    mat2 rot = mat2(cos(0.5), sin(0.5), -sin(0.5), cos(0.5));
    for (int i = 0; i < 3; ++i) {
      v += a * oceanValueNoise(p);
      p = rot * p * 2.0 + shift;
      a *= 0.5;
    }
    return v;
  }
`;

export const OCEAN_CONTACT_FOAM_UNIFORMS_GLSL = /* glsl */ `
  uniform int uBodyCount;
  uniform vec4 uBodies[16];
  uniform vec2 uBodyVel[16];
`;

export const OCEAN_CONTACT_FOAM_FUNCTION_GLSL = /* glsl */ `
  // Boat contact *energy* (WaterThreeJS capsule wake). smoothstep edges stay
  // ordered (edge0 < edge1); the upstream reversed calls are written as
  // 1.0 - smoothstep(lo, hi, x) so behavior is defined on all drivers.
  float oceanContactEnergy(vec2 worldXz) {
    float contact = 0.0;
    for (int i = 0; i < 16; i++) {
      if (i >= uBodyCount) break;
      vec4 b = uBodies[i];
      if (b.w < 0.01) continue;
      vec2 dp = worldXz - b.xy;
      vec2 v = uBodyVel[i];
      float sp = length(v);
      float r = max(b.z, 0.1);
      if (sp > 0.25) {
        vec2 vd = v / sp;
        float along = dot(dp, vd);
        dp -= vd * clamp(along, -r * min(2.0 + sp * 0.9, 7.0), 0.0);
      }
      float q = length(dp) / r;
      contact += (1.0 - smoothstep(0.85, 2.4, q)) * b.w;
    }
    return min(contact, 1.6);
  }
`;

export const OCEAN_SSR_GLSL = /* glsl */ `
  // Screen-space reflection march (WaterThreeJS): 32 steps with gentle
  // geometric acceleration, interpolation refinement between the last two
  // samples, and a screen-edge confidence fade. Returns scene color and
  // writes 0 when the ray finds nothing, so the caller keeps the sky.
  float oceanSceneEyeDepth(vec2 uv, sampler2D depthTex, float nearPlane, float farPlane) {
    float d = texture2D(depthTex, uv).x;
    return -(nearPlane * farPlane) / ((farPlane - nearPlane) * d - farPlane);
  }

  vec3 oceanRaymarchSSR(
    vec3 worldPos,
    vec3 reflectDir,
    mat4 viewMat,
    mat4 projMat,
    sampler2D colorTex,
    sampler2D depthTex,
    float nearPlane,
    float farPlane,
    out float hitMask
  ) {
    hitMask = 0.0;
    vec3 viewPos = (viewMat * vec4(worldPos, 1.0)).xyz;
    vec3 viewReflect = normalize((viewMat * vec4(reflectDir, 0.0)).xyz);
    if (viewReflect.z >= -0.01) return vec3(0.0);

    const int STEPS = 32;
    float stepLen = 2.2;
    float prevDiff = 0.0;
    vec2 prevUV = vec2(0.0);
    bool hasPrevious = false;
    for (int i = 1; i <= STEPS; i++) {
      vec3 p = viewPos + viewReflect * (stepLen * float(i));
      vec4 clip = projMat * vec4(p, 1.0);
      if (clip.w <= 0.0) break;
      vec2 uv = clip.xy / clip.w * 0.5 + 0.5;
      if (uv.x < 0.0 || uv.x > 1.0 || uv.y < 0.0 || uv.y > 1.0) break;
      float sceneEye = oceanSceneEyeDepth(uv, depthTex, nearPlane, farPlane);
      float rayEye = -p.z;
      float diff = rayEye - sceneEye;
      if (hasPrevious && prevDiff < 0.0 && diff >= 0.0 && diff < 1.5 && sceneEye < farPlane * 0.97) {
        float t = -prevDiff / max(0.0001, diff - prevDiff);
        vec2 hitUV = mix(prevUV, uv, clamp(t, 0.0, 1.0));
        vec2 edge = smoothstep(0.0, 0.14, hitUV) * smoothstep(0.0, 0.14, 1.0 - hitUV);
        hitMask = edge.x * edge.y * (1.0 - float(i) / float(STEPS) * 0.4);
        return texture2D(colorTex, hitUV).rgb;
      }
      hasPrevious = true;
      prevDiff = diff;
      prevUV = uv;
      stepLen *= 1.06;
    }
    return vec3(0.0);
  }
`;
