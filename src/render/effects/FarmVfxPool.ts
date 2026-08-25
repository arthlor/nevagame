import * as THREE from "three";
import { PaletteMaterials } from "../materials/PaletteMaterials";

export type FarmVfxKind = "dirt" | "water" | "straw" | "pickup" | "workstation";

export interface FarmVfxPoint {
  x: number;
  y: number;
  z: number;
}

interface Particle {
  active: boolean;
  bornAt: number;
  duration: number;
  phase: number;
  start: THREE.Vector3;
  end: THREE.Vector3;
}

interface ParticleChannel {
  mesh: THREE.InstancedMesh;
  particles: Particle[];
  cursor: number;
}

const CHANNEL_SIZES: Readonly<Record<FarmVfxKind, number>> = {
  dirt: 24,
  water: 40,
  straw: 28,
  pickup: 20,
  workstation: 24
};

const TAU = Math.PI * 2;

/** Small, deterministic presentation pools. They never own or mutate gameplay state. */
export class FarmVfxPool {
  public readonly group = new THREE.Group();
  private readonly channels: Record<FarmVfxKind, ParticleChannel>;
  private readonly dummy = new THREE.Object3D();
  private spawnSequence = 0;

  constructor() {
    this.group.name = "pooled_farming_vfx";
    this.channels = {
      dirt: this.createChannel(
        "dirt",
        "farm_vfx_dirt",
        new THREE.TetrahedronGeometry(0.1, 0),
        "soil_warm_01"
      ),
      water: this.createChannel(
        "water",
        "farm_vfx_water",
        new THREE.OctahedronGeometry(0.065, 0),
        "water_shallow_01"
      ),
      straw: this.createChannel(
        "straw",
        "farm_vfx_straw_leaf",
        new THREE.PlaneGeometry(0.08, 0.22),
        "accent_ochre_01"
      ),
      pickup: this.createChannel(
        "pickup",
        "farm_vfx_pickup",
        new THREE.OctahedronGeometry(0.075, 0),
        "foliage_highlight_01"
      ),
      workstation: this.createChannel(
        "workstation",
        "farm_vfx_workstation",
        new THREE.TetrahedronGeometry(0.07, 0),
        "wood_honey_01"
      )
    };
  }

  spawn(
    kind: FarmVfxKind,
    target: FarmVfxPoint,
    timeSeconds: number,
    options: { origin?: FarmVfxPoint; reducedMotion?: boolean } = {}
  ): void {
    const countScale = options.reducedMotion ? 0.45 : 1;
    if (kind === "water") {
      const origin = options.origin ?? { x: target.x, y: target.y + 1.15, z: target.z - 0.7 };
      const count = Math.max(4, Math.round(10 * countScale));
      for (let index = 0; index < count; index++) {
        const delay = index * (0.18 / Math.max(1, count - 1));
        this.activate(kind, origin, target, timeSeconds + delay, 0.22, index / count);
      }
      return;
    }

    const burstCounts: Record<Exclude<FarmVfxKind, "water">, number> = {
      dirt: 8,
      straw: 10,
      pickup: 7,
      workstation: 8
    };
    const durations: Record<Exclude<FarmVfxKind, "water">, number> = {
      dirt: 0.52,
      straw: 0.74,
      pickup: 0.64,
      workstation: 0.82
    };
    const count = Math.max(3, Math.round(burstCounts[kind] * countScale));
    for (let index = 0; index < count; index++) {
      const phase = (index / count + this.spawnSequence * 0.137) % 1;
      this.activate(kind, target, target, timeSeconds, durations[kind], phase);
    }
    this.spawnSequence += 1;
  }

  update(timeSeconds: number): void {
    this.updateChannel("dirt", timeSeconds);
    this.updateChannel("water", timeSeconds);
    this.updateChannel("straw", timeSeconds);
    this.updateChannel("pickup", timeSeconds);
    this.updateChannel("workstation", timeSeconds);
  }

  cancel(kind?: FarmVfxKind): void {
    const channels = kind ? [this.channels[kind]] : Object.values(this.channels);
    for (const channel of channels) {
      for (const particle of channel.particles) particle.active = false;
      channel.mesh.count = 0;
    }
  }

  dispose(): void {
    for (const channel of Object.values(this.channels)) {
      channel.mesh.geometry.dispose();
    }
  }

  private createChannel(
    kind: FarmVfxKind,
    name: string,
    geometry: THREE.BufferGeometry,
    token: "soil_warm_01" | "water_shallow_01" | "accent_ochre_01" | "foliage_highlight_01" | "wood_honey_01"
  ): ParticleChannel {
    const size = CHANNEL_SIZES[kind];
    const mesh = new THREE.InstancedMesh(
      geometry,
      PaletteMaterials.standard(token, { flatShading: true, roughness: 0.78 }),
      size
    );
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
        start: new THREE.Vector3(),
        end: new THREE.Vector3()
      })),
      cursor: 0
    };
  }

  private activate(
    kind: FarmVfxKind,
    start: FarmVfxPoint,
    end: FarmVfxPoint,
    bornAt: number,
    duration: number,
    phase: number
  ): void {
    const channel = this.channels[kind];
    const particle = channel.particles[channel.cursor];
    channel.cursor = (channel.cursor + 1) % channel.particles.length;
    particle.active = true;
    particle.bornAt = bornAt;
    particle.duration = duration;
    particle.phase = phase;
    particle.start.set(start.x, start.y, start.z);
    particle.end.set(end.x, end.y, end.z);
  }

  private updateChannel(kind: FarmVfxKind, timeSeconds: number): void {
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

  private sampleParticle(kind: FarmVfxKind, particle: Particle, progress: number): void {
    const angle = particle.phase * TAU;
    this.dummy.rotation.set(0, angle + progress * 2.4, angle * 0.37 + progress * 3.2);

    if (kind === "water") {
      this.dummy.position.lerpVectors(particle.start, particle.end, progress);
      this.dummy.position.y += Math.sin(progress * Math.PI) * 0.58;
      const waterScale = Math.sin(progress * Math.PI) * 0.78 + 0.22;
      this.dummy.scale.setScalar(waterScale);
      return;
    }

    const spread = kind === "pickup" ? 0.24 : kind === "workstation" ? 0.34 : 0.48;
    const radial = Math.sin(progress * Math.PI) * spread;
    this.dummy.position.copy(particle.start);
    this.dummy.position.x += Math.cos(angle) * radial;
    this.dummy.position.z += Math.sin(angle) * radial;

    if (kind === "pickup") {
      this.dummy.position.y += 0.12 + progress * 1.05 + Math.sin(progress * Math.PI) * 0.18;
    } else if (kind === "workstation") {
      this.dummy.position.y += 0.34 + progress * 0.62 + Math.sin(progress * Math.PI) * 0.12;
    } else {
      this.dummy.position.y += 0.06 + Math.sin(progress * Math.PI) * (kind === "straw" ? 0.72 : 0.42);
    }

    const fadeScale = Math.max(0.05, (1 - progress) * (kind === "straw" ? 1.2 : 1));
    if (kind === "straw") {
      this.dummy.scale.set(fadeScale, fadeScale, fadeScale);
    } else {
      this.dummy.scale.setScalar(fadeScale);
    }
  }
}
