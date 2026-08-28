import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export interface ContactShadowMesh extends THREE.Mesh<THREE.CircleGeometry, THREE.ShaderMaterial> {}

/**
 * A small analytic footprint keeps characters attached to uneven ground
 * without the hard-edged decal that reads as a dark blob in close gameplay
 * views. It is presentation-only and never participates in collision.
 */
export function createContactShadowMesh(
  radiusX: number,
  radiusZ: number,
  opacity: number
): ContactShadowMesh {
  const geometry = new THREE.CircleGeometry(1, 24);
  geometry.rotateX(-Math.PI / 2);
  const material = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    toneMapped: false,
    uniforms: {
      uColor: { value: new THREE.Color(PALETTE_HEX.foliage_shadow_01) },
      uOpacity: { value: opacity }
    },
    vertexShader: `
      varying vec2 vContactUv;
      void main() {
        vContactUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: `
      uniform vec3 uColor;
      uniform float uOpacity;
      varying vec2 vContactUv;
      void main() {
        float radial = distance(vContactUv, vec2(0.5)) * 2.0;
        float edge = 1.0 - smoothstep(0.42, 1.0, radial);
        float alpha = edge * uOpacity;
        if (alpha < 0.004) discard;
        gl_FragColor = vec4(uColor, alpha);
      }
    `
  });
  const mesh = new THREE.Mesh(geometry, material) as ContactShadowMesh;
  mesh.scale.set(radiusX, 1, radiusZ);
  mesh.renderOrder = 1;
  return mesh;
}

export function setContactShadowOpacity(mesh: ContactShadowMesh, opacity: number): void {
  mesh.material.uniforms.uOpacity.value = opacity;
}
