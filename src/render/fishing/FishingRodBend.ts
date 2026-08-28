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
  private readonly length: number;
  private lastBend = -1;
  private readonly reelCenter = new THREE.Vector3();
  private readonly handle = new THREE.Vector3();
  private readonly reelRotation = new THREE.Matrix4();
  private reelAngle = 0;
  private lastElapsed = 0;

  constructor(private readonly root: THREE.Group) {
    root.updateWorldMatrix(true, true);
    const foregrip = root.getObjectByName("rod_foregrip");
    const tiptop = root.getObjectByName("rod_guide_tiptop") ?? root.getObjectByName("rod_tiptop_sleeve");
    if (!foregrip || !tiptop) throw new Error("Fishing rod is missing its authored grip/tip nodes");
    root.worldToLocal(new THREE.Box3().setFromObject(foregrip).getCenter(this.base));
    root.worldToLocal(new THREE.Box3().setFromObject(tiptop).getCenter(this.tip));
    const spool = root.getObjectByName("rod_reel_spool");
    const handle = root.getObjectByName("rod_reel_handle_knob");
    if (!spool || !handle) throw new Error("Fishing rod is missing its reel/handle nodes");
    root.worldToLocal(new THREE.Box3().setFromObject(spool).getCenter(this.reelCenter));
    root.worldToLocal(new THREE.Box3().setFromObject(handle).getCenter(this.handle));
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
  }

  public update(bend: number, endpoint: THREE.Vector3, retrieval = 0, elapsed = 0): void {
    const dt = THREE.MathUtils.clamp(elapsed - this.lastElapsed, 0, 0.1);
    this.lastElapsed = elapsed;
    this.reelAngle = (this.reelAngle + retrieval * dt * 5) % (Math.PI * 2);
    this.reelRotation.makeRotationX(this.reelAngle);
    if (bend === 0 && this.lastBend === 0) return;
    this.lastBend = bend;
    this.root.updateWorldMatrix(true, false);
    this.pull.copy(endpoint);
    this.root.worldToLocal(this.pull).sub(this.base);
    this.pull.addScaledVector(this.axis, -this.pull.dot(this.axis)).normalize();
    for (const part of this.parts) {
      const position = part.mesh.geometry.getAttribute("position");
      for (let i = 0; i < position.count; i++) {
        this.point.fromArray(part.points, i * 3);
        if (part.reel) this.rotateReelPoint(this.point);
        this.deform(this.point, bend).applyMatrix4(part.toLocal);
        position.setXYZ(i, this.point.x, this.point.y, this.point.z);
      }
      position.needsUpdate = true;
      part.mesh.geometry.computeVertexNormals();
    }
    this.deform(this.bentTip.copy(this.tip), bend);
  }

  private deform(point: THREE.Vector3, bend: number): THREE.Vector3 {
    const along = (point.x - this.base.x) * this.axis.x
      + (point.y - this.base.y) * this.axis.y + (point.z - this.base.z) * this.axis.z;
    if (along <= 0 || bend < 0.0001) return point;
    const t = Math.min(1, along / Math.max(0.01, this.length));
    const radius = this.length / bend;
    return point.addScaledVector(this.axis, Math.sin(bend * t) * radius - this.length * t)
      .addScaledVector(this.pull, (1 - Math.cos(bend * t)) * radius);
  }

  public getTipWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.root.localToWorld(target.copy(this.bentTip));
  }

  private rotateReelPoint(point: THREE.Vector3): THREE.Vector3 {
    return point.sub(this.reelCenter).applyMatrix4(this.reelRotation).add(this.reelCenter);
  }

  public getGripWorld(target: THREE.Vector3): THREE.Vector3 {
    return this.root.localToWorld(this.rotateReelPoint(target.copy(this.handle)));
  }

  public dispose(): void {
    for (const { mesh } of this.parts) mesh.geometry.dispose();
  }
}
