import * as THREE from "three";

/** Deforms only this held instance; the grip/reel and cached catalog geometry stay intact. */
export class FishingRodBend {
  private readonly parts: Array<{ mesh: THREE.Mesh; points: Float32Array; toLocal: THREE.Matrix4; reel: boolean }> = [];
  private readonly base = new THREE.Vector3();
  private readonly tip = new THREE.Vector3();
  private readonly axis = new THREE.Vector3();
  private readonly pull = new THREE.Vector3();
  private readonly point = new THREE.Vector3();
  private readonly bentTip = new THREE.Vector3();
  private readonly inverseRoot = new THREE.Matrix4();
  private readonly aimDirection = new THREE.Vector3();
  private readonly aimGripWorld = new THREE.Vector3();
  private readonly aimedGripWorld = new THREE.Vector3();
  private readonly aimRootWorld = new THREE.Vector3();
  private readonly aimLocalDirection = new THREE.Vector3();
  private readonly aimParentQuaternion = new THREE.Quaternion();
  private readonly aimTargetQuaternion = new THREE.Quaternion();
  private readonly aimQuaternion = new THREE.Quaternion();
  private aimInitialized = false;
  private readonly length: number;
  private lastBend = -1;
  private readonly reelCenter = new THREE.Vector3();
  private readonly handle = new THREE.Vector3();
  private readonly secondaryGrip: THREE.Object3D | undefined;
  private readonly gripRootRotation = new THREE.Quaternion();
  private readonly gripRotation = new THREE.Quaternion();
  private readonly gripParentRotation = new THREE.Quaternion();
  private readonly gripWorldPoint = new THREE.Vector3();
  private readonly reelRotation = new THREE.Matrix4();
  private reelAngle = 0;
  private lastElapsed = 0;
  /** Sprung bend so a sudden slack release lets the blank whip back past straight. */
  private bendValue = 0;
  private bendVelocity = 0;

  constructor(private readonly root: THREE.Group) {
    root.updateWorldMatrix(true, true);
    const foregrip = root.getObjectByName("rod_primary_grip") ?? root.getObjectByName("rod_foregrip");
    const tiptop = root.getObjectByName("rod_line_exit")
      ?? root.getObjectByName("rod_guide_tiptop")
      ?? root.getObjectByName("rod_tiptop_sleeve");
    if (!foregrip || !tiptop) throw new Error("Fishing rod is missing its authored grip/tip nodes");
    this.nodeCenterInRoot(foregrip, this.base);
    this.nodeCenterInRoot(tiptop, this.tip);
    const spool = root.getObjectByName("rod_reel_spool");
    const handle = root.getObjectByName("rod_secondary_grip")
      ?? root.getObjectByName("rod_reel_handle_knob");
    if (!spool || !handle) throw new Error("Fishing rod is missing its reel/handle nodes");
    this.nodeCenterInRoot(spool, this.reelCenter);
    this.nodeCenterInRoot(handle, this.handle);
    this.secondaryGrip = root.getObjectByName("rod_secondary_grip");
    if (this.secondaryGrip) {
      root.getWorldQuaternion(this.gripParentRotation).invert();
      this.secondaryGrip.getWorldQuaternion(this.gripRootRotation).premultiply(this.gripParentRotation);
    }
    this.axis.subVectors(this.tip, this.base);
    this.length = this.axis.length();
    this.axis.normalize();
    this.inverseRoot.copy(root.matrixWorld).invert();
    root.traverse(node => {
      if (!(node instanceof THREE.Mesh)) return;
      const toRoot = new THREE.Matrix4().multiplyMatrices(this.inverseRoot, node.matrixWorld);
      node.geometry = node.geometry.clone();
      const position = node.geometry.getAttribute("position");
      const points = new Float32Array(position.count * 3);
      for (let i = 0; i < position.count; i++) {
        this.point.fromBufferAttribute(position, i).applyMatrix4(toRoot).toArray(points, i * 3);
      }
      node.frustumCulled = false;
      this.parts.push({ mesh: node, points, toLocal: toRoot.clone().invert(),
        reel: ["rod_reel_spool", "rod_reel_line_coil", "rod_reel_crank_arm", "rod_reel_handle_knob"].includes(node.name) });
    });
    this.bentTip.copy(this.tip);
    this.aimQuaternion.copy(root.quaternion);
  }

  /** Keeps the blank pointed into the live pull without inheriting camera motion. */
  public aimToward(endpoint: THREE.Vector3, deltaSeconds: number): void {
    this.root.updateWorldMatrix(true, false);
    this.root.localToWorld(this.aimGripWorld.copy(this.base));
    this.aimDirection.subVectors(endpoint, this.aimGripWorld);
    if (this.aimDirection.lengthSq() < 0.0001) return;
    this.aimDirection.normalize();
    if (this.root.parent) {
      this.root.parent.getWorldQuaternion(this.aimParentQuaternion).invert();
      this.aimLocalDirection.copy(this.aimDirection).applyQuaternion(this.aimParentQuaternion).normalize();
    } else {
      this.aimLocalDirection.copy(this.aimDirection);
    }
    this.aimTargetQuaternion.setFromUnitVectors(this.axis, this.aimLocalDirection);
    if (!this.aimInitialized) {
      this.aimQuaternion.copy(this.aimTargetQuaternion);
      this.aimInitialized = true;
    } else {
      this.aimQuaternion.slerp(
        this.aimTargetQuaternion,
        1 - Math.exp(-Math.max(0, deltaSeconds) * 10)
      );
    }
    this.root.quaternion.copy(this.aimQuaternion);
    this.root.updateWorldMatrix(true, false);
    // Aim about the actual primary grip, which need not be the asset origin.
    // Keeping this point fixed avoids asking the holding wrist to stretch.
    this.root.localToWorld(this.aimedGripWorld.copy(this.base));
    this.root.getWorldPosition(this.aimRootWorld);
    this.aimRootWorld.add(this.aimGripWorld).sub(this.aimedGripWorld);
    if (this.root.parent) this.root.parent.worldToLocal(this.aimRootWorld);
    this.root.position.copy(this.aimRootWorld);
    this.root.updateWorldMatrix(false, true);
  }

  public resetAim(baseQuaternion: THREE.Quaternion): void {
    this.aimInitialized = false;
    this.aimQuaternion.copy(baseQuaternion);
    this.root.quaternion.copy(baseQuaternion);
  }

  /** Restores the authored straight blank and clears every spring/reel accumulator. */
  public resetDynamics(): void {
    this.bendValue = 0;
    this.bendVelocity = 0;
    this.reelAngle = 0;
    this.lastElapsed = 0;
    this.lastBend = 0;
    this.reelRotation.identity();
    this.updateGripMarker();
    this.bentTip.copy(this.tip);
    for (const part of this.parts) {
      const position = part.mesh.geometry.getAttribute("position");
      for (let index = 0; index < position.count; index++) {
        this.point.fromArray(part.points, index * 3).applyMatrix4(part.toLocal);
        position.setXYZ(index, this.point.x, this.point.y, this.point.z);
      }
      position.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
    }
  }

  public update(
    bend: number, endpoint: THREE.Vector3, retrieval = 0, elapsed = 0,
    rodDirection = 0, shakeAmplitude = 0
  ): void {
    const dt = Math.max(0, elapsed - this.lastElapsed);
    this.lastElapsed = elapsed;
    const previousReelAngle = this.reelAngle;
    this.reelAngle = (this.reelAngle + retrieval * dt * 5) % (Math.PI * 2);
    this.reelRotation.makeRotationX(this.reelAngle);
    this.updateGripMarker();

    // Exact damped-spring step keeps a throttled sample stable and consumes the
    // same encounter time as the reel. Releasing load still permits overshoot.
    const displacement = this.bendValue - bend;
    const damping = 7.5;
    const frequency = Math.sqrt(90 - damping * damping);
    const decay = Math.exp(-damping * dt);
    const cosine = Math.cos(frequency * dt);
    const sine = Math.sin(frequency * dt);
    this.bendValue = bend + decay * (displacement * cosine
      + (this.bendVelocity + damping * displacement) / frequency * sine);
    this.bendVelocity = decay * (this.bendVelocity * cosine
      - (damping * this.bendVelocity + 90 * displacement) / frequency * sine);
    const effectiveBend = THREE.MathUtils.clamp(
      this.bendValue + Math.sin(elapsed * 34) * shakeAmplitude * 0.05,
      -0.12,
      1.35
    );
    if (Math.abs(effectiveBend) < 0.0006 && Math.abs(this.bendVelocity) < 0.02 && this.lastBend === 0 && this.reelAngle === previousReelAngle) return;
    this.lastBend = Math.abs(effectiveBend) < 0.0006 ? 0 : effectiveBend;

    this.root.updateWorldMatrix(true, false);
    this.pull.copy(endpoint);
    this.root.worldToLocal(this.pull).sub(this.base);
    this.pull.addScaledVector(this.axis, -this.pull.dot(this.axis)).normalize();
    // Steering the rod loads it sideways: swing the bend plane toward the input.
    if (Math.abs(rodDirection) > 0.001) this.pull.applyAxisAngle(this.axis, rodDirection * 0.5).normalize();
    for (const part of this.parts) {
      const position = part.mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        this.point.fromArray(part.points, i * 3);
        if (part.reel) this.rotateReelPoint(this.point);
        else this.deform(this.point, effectiveBend);
        this.point.applyMatrix4(part.toLocal);
        position.setXYZ(i, this.point.x, this.point.y, this.point.z);
      }
      position.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
    }
    this.deform(this.bentTip.copy(this.tip), effectiveBend);
  }

  private deform(point: THREE.Vector3, bend: number): THREE.Vector3 {
    const along = (point.x - this.base.x) * this.axis.x
      + (point.y - this.base.y) * this.axis.y + (point.z - this.base.z) * this.axis.z;
    if (along <= 0 || Math.abs(bend) < 0.0001) return point;
    const t = Math.min(1, along / Math.max(0.01, this.length));
    const radius = this.length / bend;
    return point.addScaledVector(this.axis, Math.sin(bend * t) * radius - this.length * t)
      .addScaledVector(this.pull, (1 - Math.cos(bend * t)) * radius);
  }

  public getTipWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.root.localToWorld(target.copy(this.bentTip));
  }

  private nodeCenterInRoot(node: THREE.Object3D, target: THREE.Vector3): THREE.Vector3 {
    if (node instanceof THREE.Mesh) new THREE.Box3().setFromObject(node).getCenter(target);
    else node.getWorldPosition(target);
    return this.root.worldToLocal(target);
  }

  private rotateReelPoint(point: THREE.Vector3): THREE.Vector3 {
    return point.sub(this.reelCenter).applyMatrix4(this.reelRotation).add(this.reelCenter);
  }

  private updateGripMarker(): void {
    if (!this.secondaryGrip) return;
    this.root.updateWorldMatrix(true, true);
    this.rotateReelPoint(this.gripWorldPoint.copy(this.handle));
    this.root.localToWorld(this.gripWorldPoint);
    this.gripRotation.setFromRotationMatrix(this.reelRotation).multiply(this.gripRootRotation);
    this.root.getWorldQuaternion(this.gripParentRotation);
    this.gripRotation.premultiply(this.gripParentRotation);
    if (this.secondaryGrip.parent) {
      this.secondaryGrip.parent.worldToLocal(this.gripWorldPoint);
      this.secondaryGrip.parent.getWorldQuaternion(this.gripParentRotation).invert();
      this.gripRotation.premultiply(this.gripParentRotation);
    }
    this.secondaryGrip.position.copy(this.gripWorldPoint);
    this.secondaryGrip.quaternion.copy(this.gripRotation);
    this.secondaryGrip.updateWorldMatrix(false, true);
  }

  public getGripWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.root.localToWorld(this.rotateReelPoint(target.copy(this.handle)));
  }

  public dispose(): void {
    for (const { mesh } of this.parts) mesh.geometry.dispose();
  }
}
