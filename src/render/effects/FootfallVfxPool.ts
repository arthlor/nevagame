import * as THREE from "three";
import { PaletteMaterials } from "../materials/PaletteMaterials";

/**
 * Gait-driven ground contact effects. Kept separate from `FarmVfxPool` because
 * footfalls fire many times a second and need a much smaller, lower, shorter
 * burst than an authored action. Presentation only: the caller supplies the
 * surface already classified by `footstepSurfaceAt`.
 */
export type FootfallSurface = "dirt" | "wood" | "dock" | "grass" | "sand" | "water";
export type FootfallChannel = "dust" | "leaf" | "water";

export function footfallChannelForSurface(surface: FootfallSurface): FootfallChannel {
  if (surface === "water") return "water";
  if (surface === "grass") return "leaf";
  return "dust";
}

const CHANNEL_SIZES: Readonly<Record<FootfallChannel, number>> = {
  dust: 72,
  leaf: 48,
  water: 48
};

const CHANNEL_COUNTS: Readonly<Record<FootfallChannel, number>> = {
  dust: 5,
  leaf: 4,
  water: 6
};

const CHANNEL_DURATIONS: Readonly<Record<FootfallChannel, number>> = {
  dust: 0.34,
  leaf: 0.5,
  water: 0.3
};

const TAU = Math.PI * 2;

interface Particle {
  active: boolean;
  bornAt: number;
  duration: number;
  phase: number;
  readonly start: THREE.Vector3;
}

interface ParticleChannel {
  mesh: THREE.InstancedMesh;
  particles: Particle[];
  cursor: number;
}

export class FootfallVfxPool {
  public readonly group = new THREE.Group();
  private readonly channels: Record<FootfallChannel, ParticleChannel>;
  private readonly dummy = new THREE.Object3D();
  private sequence = 0;

  public constructor() {
    this.group.name = "pooled_footfall_vfx";
    this.channels = {
      dust: this.createChannel(
        "dust",
        "footfall_dust",
        new THREE.TetrahedronGeometry(0.05, 0),
        "soil_warm_01"
      ),
      leaf: this.createChannel(
        "leaf",
        "footfall_leaf",
        new THREE.PlaneGeometry(0.045, 0.11),
        "foliage_highlight_01",
        THREE.DoubleSide
      ),
      water: this.createChannel(
        "water",
        "footfall_water",
        new THREE.OctahedronGeometry(0.045, 0),
        "water_shallow_01"
      )
    };
  }

  public spawn(
    surface: FootfallSurface,
    target: { x: number; y: number; z: number },
    timeSeconds: number,
    options: { reducedMotion?: boolean } = {}
  ): void {
    const kind = footfallChannelForSurface(surface);
    const channel = this.channels[kind];
    const countScale = options.reducedMotion ? 0.4 : 1;
    const count = Math.max(1, Math.round(CHANNEL_COUNTS[kind] * countScale));
    for (let index = 0; index < count; index++) {
      const particle = channel.particles[channel.cursor];
      channel.cursor = (channel.cursor + 1) % channel.particles.length;
      particle.active = true;
      particle.bornAt = timeSeconds;
      particle.duration = CHANNEL_DURATIONS[kind];
      particle.phase = (index / count + this.sequence * 0.173) % 1;
      particle.start.set(target.x, target.y, target.z);
    }
    this.sequence += 1;
  }

  public update(timeSeconds: number): void {
    this.updateChannel("dust", timeSeconds);
    this.updateChannel("leaf", timeSeconds);
    this.updateChannel("water", timeSeconds);
  }

  public cancel(): void {
    for (const channel of Object.values(this.channels)) {
      for (const particle of channel.particles) particle.active = false;
      channel.mesh.count = 0;
    }
  }

  public dispose(): void {
    for (const channel of Object.values(this.channels)) channel.mesh.geometry.dispose();
  }

  private createChannel(
    kind: FootfallChannel,
    name: string,
    geometry: THREE.BufferGeometry,
    token: "soil_warm_01" | "water_shallow_01" | "foliage_highlight_01",
    side: THREE.Side = THREE.FrontSide
  ): ParticleChannel {
    const material = PaletteMaterials.standard(token, { flatShading: true, roughness: 0.92 });
    material.side = side;
    const size = CHANNEL_SIZES[kind];
    const mesh = new THREE.InstancedMesh(geometry, material, size);
    mesh.name = name;
    mesh.count = 0;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    mesh.frustumCulled = false;
    mesh.castShadow = false;
    mesh.receiveShadow = false;
    this.group.add(mesh);
    return {
      mesh,
      particles: Array.from({ length: size }, () => ({
        active: false,
        bornAt: 0,
        duration: 1,
        phase: 0,
        start: new THREE.Vector3()
      })),
      cursor: 0
    };
  }

  private updateChannel(kind: FootfallChannel, timeSeconds: number): void {
    const channel = this.channels[kind];
    let visibleIndex = 0;
    for (const particle of channel.particles) {
      if (!particle.active || timeSeconds < particle.bornAt) continue;
      const progress = (timeSeconds - particle.bornAt) / particle.duration;
      if (progress >= 1) {
        particle.active = false;
        continue;
      }
      this.sampleParticle(kind, particle, THREE.MathUtils.clamp(progress, 0, 1));
      this.dummy.updateMatrix();
      channel.mesh.setMatrixAt(visibleIndex, this.dummy.matrix);
      visibleIndex += 1;
    }
    channel.mesh.count = visibleIndex;
    if (visibleIndex > 0) channel.mesh.instanceMatrix.needsUpdate = true;
  }

  private sampleParticle(kind: FootfallChannel, particle: Particle, progress: number): void {
    const angle = particle.phase * TAU;
    const rise = Math.sin(progress * Math.PI);
    this.dummy.position.copy(particle.start);
    this.dummy.rotation.set(angle * 0.7, angle + progress * 2.6, angle * 0.5);

    if (kind === "water") {
      const radius = 0.1 * progress;
      this.dummy.position.x += Math.cos(angle) * radius;
      this.dummy.position.z += Math.sin(angle) * radius;
      this.dummy.position.y += rise * 0.09;
      this.dummy.scale.setScalar((1 - progress) * 0.85);
      return;
    }

    const radius = (kind === "leaf" ? 0.16 : 0.12) * progress;
    this.dummy.position.x += Math.cos(angle) * radius;
    this.dummy.position.z += Math.sin(angle) * radius;
    this.dummy.position.y += rise * (kind === "leaf" ? 0.12 : 0.05);
    this.dummy.scale.setScalar(1 - progress);
  }
}
