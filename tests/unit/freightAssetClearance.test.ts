import * as THREE from "three";
import { describe, expect, it } from "vitest";
import catalog from "../../assets/specs/asset-catalog.json";
import { buildAuthoredModel } from "../../tools/authored/pipeline/build";
import type { CatalogAssetSpec } from "../../tools/authored/kit";

function build(id: string) {
  const spec = catalog.assets.find(asset => asset.id === id) as CatalogAssetSpec;
  return { spec, ...buildAuthoredModel(spec) };
}

function support(root: THREE.Object3D, point: THREE.Vector3): number {
  const ray = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0.07, 0)), new THREE.Vector3(0, -1, 0), 0, 0.2);
  return ray.intersectObject(root, true)[0]?.point.y ?? -Infinity;
}

describe("freight asset working clearances", () => {
  it("supports every ship cargo socket on the level deck", () => {
    const { root } = build("boat_trading_ship_a");
    for (let slot = 1; slot <= 10; slot++) {
      const socket = root.getObjectByName(`boat_trading_ship_a_cargo_${String(slot).padStart(2, "0")}`)!;
      const point = socket.getWorldPosition(new THREE.Vector3());
      expect(support(root, point), socket.name).toBeCloseTo(point.y, 3);
      for (const x of [-0.3, 0, 0.3]) for (const z of [-0.3, 0, 0.3]) {
        const sample = point.clone().add(new THREE.Vector3(x, 0.12, z));
        const overhead = new THREE.Raycaster(sample, new THREE.Vector3(0, 1, 0), 0, 1.25);
        expect(overhead.intersectObject(root, true), `${socket.name} cargo clearance at ${x},${z}`).toHaveLength(0);
      }
    }
  });

  it("supports ship helm feet and leaves room for the helmsman and angler", () => {
    const { root } = build("boat_trading_ship_a");
    for (const suffix of ["foot_left_socket", "foot_right_socket", "fishing_station"]) {
      const point = root.getObjectByName(`boat_trading_ship_a_${suffix}`)!.getWorldPosition(new THREE.Vector3());
      expect(Math.abs(support(root, point) - point.y), suffix).toBeLessThan(0.02);
    }
    for (const suffix of ["driver_station", "fishing_station"]) {
      const point = root.getObjectByName(`boat_trading_ship_a_${suffix}`)!.getWorldPosition(new THREE.Vector3());
      for (const x of [-0.20, 0, 0.20]) for (const z of [-0.20, 0, 0.20]) {
        const headroom = new THREE.Raycaster(point.clone().add(new THREE.Vector3(x, 0.15, z)), new THREE.Vector3(0, 1, 0), 0, 1.65);
        expect(headroom.intersectObject(root, true), `${suffix} body clearance at ${x},${z}`).toHaveLength(0);
      }
    }
  });

  it("puts both retained ship hand contacts on the wheel", () => {
    const { root } = build("boat_trading_ship_a");
    for (const side of ["left", "right"]) {
      const point = root.getObjectByName(`boat_trading_ship_a_helm_grip_${side}`)!.getWorldPosition(new THREE.Vector3());
      const wheel = new THREE.Raycaster(point.clone().add(new THREE.Vector3(0, 0, -0.15)), new THREE.Vector3(0, 0, 1), 0, 0.20);
      const hit = wheel.intersectObject(root, true)[0];
      expect(hit, side).toBeDefined();
      expect(Math.abs(hit.point.z - point.z), side).toBeLessThan(0.04);
    }
  });

  it.each(["neva", "pinewatch", "reedhaven", "highridge", "sunreach"])("keeps %s's packing marker supported and its front approach open", village => {
    const { root } = build(`station_trade_${village}_a`);
    const socket = root.getObjectByName(`station_trade_${village}_a_work_surface`)!;
    const point = socket.getWorldPosition(new THREE.Vector3());
    expect(Math.abs(support(root, point) - point.y)).toBeLessThan(0.02);
    const approach = new THREE.Raycaster(new THREE.Vector3(0, 0.8, 2), new THREE.Vector3(0, 0, -1), 0, 0.9);
    expect(approach.intersectObject(root, true)).toHaveLength(0);
  });

  it.each([4, 6])("keeps %i freight slots supported and opens the tailgate away from the load", slots => {
    const id = `prop_merchant_carriage_${slots}_a`;
    const { root, clips, spec } = build(id);
    for (let slot = 1; slot <= slots; slot++) {
      const marker = root.getObjectByName(`${id}_cargo_${String(slot).padStart(2, "0")}`)!;
      const point = marker.getWorldPosition(new THREE.Vector3());
      expect(Math.abs(support(root, point) - point.y), marker.name).toBeLessThan(0.01);
    }
    const gate = root.getObjectByName(`${id}_tailgate`)!;
    const mixer = new THREE.AnimationMixer(root);
    const action = mixer.clipAction(clips.find(clip => clip.name === "load")!);
    action.setLoop(THREE.LoopOnce, 1); action.clampWhenFinished = true; action.play();
    for (const time of [0.2, 0.4, 0.6, 0.8, 1.6]) {
      mixer.setTime(time); root.updateMatrixWorld(true);
      const hinge = gate.getWorldPosition(new THREE.Vector3());
      const upperEdge = gate.localToWorld(new THREE.Vector3(0, 0.45, 0));
      expect(upperEdge.z).toBeLessThan(hinge.z);
      expect(new THREE.Box3().setFromObject(gate).min.y).toBeGreaterThan(0.5);
    }
    for (const name of spec.requiredNodes) expect(root.getObjectByName(name), name).toBeDefined();
    mixer.stopAllAction(); mixer.uncacheRoot(root);
  });
});
