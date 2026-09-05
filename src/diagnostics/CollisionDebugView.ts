import * as THREE from "three";
import type { PhysicsWorld } from "../physics/PhysicsWorld";
import type { CollisionDebugSnapshot, DebugCollider } from "../physics/CollisionDebug";

/** DEV-only, read-only walking inspection. Loaded by GameApp only in development. */
export class CollisionDebugView {
  private readonly geometry = new THREE.BufferGeometry();
  private readonly material = new THREE.LineBasicMaterial({
    vertexColors: true, depthTest: false, depthWrite: false, transparent: true,
    opacity: 0.85, toneMapped: false
  });
  private readonly lines = new THREE.LineSegments(this.geometry, this.material);
  private readonly overlay = document.createElement("div");
  private readonly panel = document.createElement("section");
  private readonly readout = document.createElement("pre");
  private readonly labels: Array<{ node: HTMLDivElement; position: THREE.Vector3 }> = [];
  private readonly projected = new THREE.Vector3();
  private enabled = false;
  private lastSampleMs = -Infinity;
  private lastBlocker = "";
  private lastBlockerMs = -Infinity;

  public constructor(scene: THREE.Scene, private readonly host: HTMLElement) {
    this.lines.name = "dev-walking-colliders";
    this.lines.renderOrder = 10000;
    this.lines.frustumCulled = false;
    this.lines.visible = false;
    scene.add(this.lines);
    this.overlay.dataset.testid = "collision-debug";
    this.overlay.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:100;display:none";
    this.panel.setAttribute("aria-label", "Walking collision debugger");
    this.panel.style.cssText = "position:absolute;z-index:1;right:12px;top:72px;max-width:min(440px,90%);max-height:65%;overflow:auto;background:#101820ee;color:#f4f4ef;padding:10px;font:12px/1.45 monospace;pointer-events:auto;border:1px solid #b5c4ce";
    const close = document.createElement("button");
    close.textContent = "Hide blockers (F3)";
    close.onclick = () => this.setEnabled(false);
    this.readout.style.cssText = "margin:8px 0 0;white-space:pre-wrap;overflow-wrap:anywhere;font:inherit";
    this.panel.append(close, this.readout);
    this.overlay.append(this.panel);
    document.body.append(this.overlay);
    window.addEventListener("keydown", this.onKeyDown);
    this.setEnabled(new URLSearchParams(window.location.search).has("colliders"));
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.code !== "F3" || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    if (target instanceof HTMLElement && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
    event.preventDefault();
    if (!event.repeat) this.setEnabled(!this.enabled);
  };

  public setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    this.overlay.style.display = enabled ? "block" : "none";
    this.lines.visible = enabled;
    this.lastSampleMs = -Infinity;
    if (!enabled) {
      this.lastBlocker = "";
      this.lastBlockerMs = -Infinity;
    }
  }

  public update(physics: PhysicsWorld, camera: THREE.Camera, player: { x: number; y: number; z: number }, nowMs: number): void {
    if (!this.enabled) return;
    // Geometry and the DOM list update at 10 Hz; projected labels follow the camera every frame.
    if (nowMs - this.lastSampleMs >= 100) {
      this.lastSampleMs = nowMs;
      this.refresh(physics.collisionDebugSnapshot(player), nowMs);
    }
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const bounds = this.host.getBoundingClientRect();
    camera.updateMatrixWorld();
    for (const label of this.labels) {
      this.projected.copy(label.position).project(camera);
      const visible = Math.abs(this.projected.x) <= 1 && Math.abs(this.projected.y) <= 1 && Math.abs(this.projected.z) <= 1;
      label.node.style.display = visible ? "block" : "none";
      label.node.style.left = `${bounds.left + (this.projected.x * 0.5 + 0.5) * width}px`;
      label.node.style.top = `${bounds.top + (-this.projected.y * 0.5 + 0.5) * height}px`;
    }
  }

  private refresh(snapshot: CollisionDebugSnapshot, nowMs: number): void {
    const positions: number[] = [];
    const colors: number[] = [];
    const lateral = new Set(snapshot.contacts.filter((c) => c.lateral).map((c) => c.handle));
    const matrix = new THREE.Matrix4();
    const point = new THREE.Vector3();
    const color = new THREE.Color();
    for (const collider of snapshot.colliders) {
      color.set(collider.id.startsWith("player:") ? 0x60ddff : lateral.has(collider.handle) ? 0xff6464 : 0xffd166);
      const source = collider.shape.kind === "box"
        ? new THREE.BoxGeometry(collider.shape.halfExtents.x * 2, collider.shape.halfExtents.y * 2, collider.shape.halfExtents.z * 2)
        : new THREE.CapsuleGeometry(collider.shape.radius, collider.shape.halfHeight * 2, 4, 8);
      const edges = collider.shape.kind === "box" ? new THREE.EdgesGeometry(source) : new THREE.WireframeGeometry(source);
      matrix.compose(new THREE.Vector3().copy(collider.position), new THREE.Quaternion().copy(collider.rotation), new THREE.Vector3(1, 1, 1));
      const vertices = edges.getAttribute("position");
      for (let i = 0; i < vertices.count; i++) {
        point.fromBufferAttribute(vertices, i).applyMatrix4(matrix);
        positions.push(point.x, point.y, point.z);
        colors.push(color.r, color.g, color.b);
      }
      source.dispose();
      edges.dispose();
    }
    // Contact normals expose terrain/road collisions too, without drawing an island-sized wire mesh.
    for (const contact of snapshot.contacts) {
      positions.push(contact.point.x, contact.point.y, contact.point.z,
        contact.point.x + contact.normal.x, contact.point.y + contact.normal.y, contact.point.z + contact.normal.z);
      color.set(contact.lateral ? 0xff6464 : 0x90ffae);
      colors.push(color.r, color.g, color.b, color.r, color.g, color.b);
    }
    this.geometry.dispose();
    this.geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    this.geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.geometry.setDrawRange(0, positions.length / 3);

    const contactNames = [...new Set(snapshot.contacts.filter((c) => c.lateral).map((c) => c.id))];
    const restriction = snapshot.walkabilityLimited ? "WorldLayout walkability / water / interior restriction" : "";
    if (snapshot.blocked) {
      this.lastBlocker = [restriction, ...contactNames].filter(Boolean).join("\n") || "Movement limited; no lateral collider contact reported";
      this.lastBlockerMs = nowMs;
    }
    const nearby = snapshot.colliders.filter((c) => !c.id.startsWith("player:"));
    const labeled = [...nearby.filter((c) => lateral.has(c.handle)), ...nearby.filter((c) => !lateral.has(c.handle))].slice(0, 12);
    for (const label of this.labels) label.node.remove();
    this.labels.length = 0;
    labeled.forEach((collider, index) => this.addLabel(collider, index + 1, lateral.has(collider.handle)));
    const support = [...new Set(snapshot.contacts.filter((c) => !c.lateral).map((c) => c.id))];
    this.readout.textContent = [
      "WALKING COLLIDERS · 25 m",
      "Yellow: solid objects · Cyan: player capsule",
      "Red: lateral contact · Green: support normal",
      "Outlines are visible through scenery.",
      "Terrain/roads: contact normals only.",
      "",
      !snapshot.walking ? "Walking solver inactive in this mode." : snapshot.blocked ? "BLOCKED" : "No walking blockage reported.",
      restriction,
      contactNames.length ? `Lateral contact: ${contactNames.join(", ")}` : "",
      support.length ? `Support: ${support.join(", ")}` : "",
      !snapshot.blocked && nowMs - this.lastBlockerMs < 5000 ? `Last blockage:\n${this.lastBlocker}` : snapshot.blocked ? this.lastBlocker : "",
      "",
      `${nearby.length} nearby solids; nearest/contact labels:`,
      ...labeled.map((c, i) => `${i + 1}. ${c.id} (${c.distance.toFixed(1)} m)`)
    ].filter((line) => line !== "").join("\n");
  }

  private addLabel(collider: DebugCollider, number: number, contact: boolean): void {
    const node = document.createElement("div");
    node.textContent = String(number);
    node.style.cssText = `position:absolute;transform:translate(-50%,-50%);padding:1px 4px;background:#101820dd;color:${contact ? "#ff6464" : "#ffd166"};font:bold 12px monospace;border:1px solid currentColor`;
    this.overlay.append(node);
    this.labels.push({ node, position: new THREE.Vector3().copy(collider.position) });
  }

  public dispose(): void {
    window.removeEventListener("keydown", this.onKeyDown);
    this.lines.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.overlay.remove();
  }
}
