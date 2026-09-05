import * as THREE from "three";
import { describe, expect, it, vi } from "vitest";
import { RigidAnimationBatch } from "../../src/render/scene/RigidAnimationBatch";
import { ASSET_IDS } from "../../src/render/assets/AssetCatalog";
import { loadHumanoidAsset } from "../helpers/humanoidAssets";

function geometry(): THREE.BufferGeometry {
  const result = new THREE.BoxGeometry();
  result.clearGroups();
  return result;
}

function batches(root: THREE.Object3D): THREE.BatchedMesh[] {
  return root.children.filter((child): child is THREE.BatchedMesh => child instanceof THREE.BatchedMesh);
}

function expectMatrix(actual: THREE.Matrix4, expected: THREE.Matrix4): void {
  actual.elements.forEach((value, index) => expect(value).toBeCloseTo(expected.elements[index], 5));
}

describe("rigid animation batching", () => {
  it("keeps animation targets, nested attachments and socket transforms intact", () => {
    const root = new THREE.Group();
    root.position.set(10, 3, -2);
    root.rotation.y = 0.6;
    root.scale.setScalar(1.4);
    const material = new THREE.MeshStandardMaterial();
    const body = new THREE.Mesh(geometry(), material);
    body.name = "body";
    const head = new THREE.Mesh(body.geometry, material);
    head.name = "head";
    body.add(head);
    root.add(body);
    const socket = new THREE.Object3D();
    socket.position.y = 2;
    body.add(socket);
    const rider = new THREE.SkinnedMesh(geometry(), material);
    socket.add(rider);
    const helper = new RigidAnimationBatch(root);
    const batch = batches(root)[0];
    expect(batches(root)).toHaveLength(1);
    expect(batch.instanceCount).toBe(2);
    expect(body.layers.mask).toBe(0);
    expect(body.visible).toBe(true);
    expect(head.parent).toBe(body);
    expect(socket.parent).toBe(body);
    expect(rider.layers.mask).toBe(1);
    const mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(new THREE.AnimationClip("move", 1, [
      new THREE.VectorKeyframeTrack("body.position", [0, 1], [0, 0, 0, 2, 1, 0]),
      new THREE.VectorKeyframeTrack("head.position", [0, 1], [0, 1, 0, 0, 2, 0])
    ])).play();
    mixer.update(0.5);
    helper.update();
    expect(body.position.x).toBe(1);
    const inverse = root.matrixWorld.clone().invert();
    for (const [index, source] of [body, head].entries()) {
      expectMatrix(batch.getMatrixAt(index, new THREE.Matrix4()), inverse.clone().multiply(source.matrixWorld));
    }
    expectMatrix(socket.matrixWorld, body.matrixWorld.clone().multiply(socket.matrix));
    expect(batch.boundingSphere?.radius).toBeGreaterThan(1);
    const upload = vi.spyOn(batch, "setMatrixAt");
    helper.update();
    expect(upload).not.toHaveBeenCalled();
    mixer.stopAllAction();
    helper.dispose();
  });

  it("follows nested LOD visibility without hiding children through render layers", () => {
    const root = new THREE.Group();
    const lod = new THREE.LOD();
    const material = new THREE.MeshStandardMaterial();
    const sources = [new THREE.Mesh(geometry(), material), new THREE.Mesh(geometry(), material)];
    lod.addLevel(sources[0], 0);
    lod.addLevel(sources[1], 10);
    root.add(lod);
    const helper = new RigidAnimationBatch(root);
    const batch = batches(root)[0];
    const camera = new THREE.PerspectiveCamera();
    for (const distance of [0, 20, 0]) {
      camera.position.z = distance;
      camera.updateMatrixWorld(true);
      lod.update(camera);
      helper.update();
      expect(batch.getVisibleAt(0)).toBe(distance === 0);
      expect(batch.getVisibleAt(1)).toBe(distance !== 0);
    }
    lod.visible = false;
    helper.update();
    expect(batch.getVisibleAt(0)).toBe(false);
    expect(batch.getVisibleAt(1)).toBe(false);
    lod.visible = true;
    helper.update();
    expect(batch.getVisibleAt(0)).toBe(true);
    helper.dispose();
  });

  it("partitions material identity, shadow policy, layers and render order", () => {
    const root = new THREE.Group();
    const materials = [new THREE.MeshStandardMaterial(), new THREE.MeshStandardMaterial()];
    const sourceGeometry = geometry();
    const variants = [
      { material: materials[0], cast: false, receive: false, layers: 1, order: 0 },
      { material: materials[0], cast: true, receive: false, layers: 1, order: 0 },
      { material: materials[0], cast: false, receive: true, layers: 1, order: 0 },
      { material: materials[0], cast: false, receive: false, layers: 2, order: 0 },
      { material: materials[0], cast: false, receive: false, layers: 1, order: 2 },
      { material: materials[1], cast: false, receive: false, layers: 1, order: 0 }
    ];
    for (const variant of variants) {
      for (let count = 0; count < 2; count += 1) {
        const source = new THREE.Mesh(sourceGeometry, variant.material);
        source.castShadow = variant.cast;
        source.receiveShadow = variant.receive;
        source.layers.mask = variant.layers;
        source.renderOrder = variant.order;
        root.add(source);
      }
    }
    const helper = new RigidAnimationBatch(root);
    expect(batches(root)).toHaveLength(variants.length);
    batches(root).forEach((batch, index) => {
      const variant = variants[index];
      expect(batch.material).toBe(variant.material);
      expect(batch.castShadow).toBe(variant.cast);
      expect(batch.receiveShadow).toBe(variant.receive);
      expect(batch.layers.mask).toBe(variant.layers);
      expect(batch.renderOrder).toBe(variant.order);
      expect(batch.perObjectFrustumCulled).toBe(true);
    });
    helper.dispose();
  });

  it("leaves skinning, morphs, transparency, partial geometry and custom rendering alone", () => {
    const root = new THREE.Group();
    const material = new THREE.MeshStandardMaterial();
    const skin = new THREE.SkinnedMesh(geometry(), material);
    const morph = new THREE.Mesh(geometry(), material);
    morph.geometry.morphAttributes.position = [morph.geometry.getAttribute("position").clone()];
    const transparent = new THREE.Mesh(geometry(), new THREE.MeshStandardMaterial({ transparent: true }));
    const partial = new THREE.Mesh(geometry(), material);
    partial.geometry.setDrawRange(0, 3);
    const custom = new THREE.Mesh(geometry(), material);
    custom.onBeforeRender = () => undefined;
    const depth = new THREE.Mesh(geometry(), material);
    depth.customDepthMaterial = new THREE.MeshDepthMaterial();
    const sources = [skin, morph, transparent, partial, custom, depth];
    root.add(...sources);
    const helper = new RigidAnimationBatch(root);
    expect(batches(root)).toHaveLength(0);
    for (const source of sources) expect(source.layers.mask).toBe(1);
    helper.dispose();
  });

  it("restores source layers and disposes only owned batch resources", () => {
    const root = new THREE.Group();
    const sourceGeometry = geometry();
    const material = new THREE.MeshStandardMaterial();
    const sources = [new THREE.Mesh(sourceGeometry, material), new THREE.Mesh(sourceGeometry, material)];
    sources.forEach((source) => { source.layers.mask = 3; });
    root.add(...sources);
    const geometryDispose = vi.spyOn(sourceGeometry, "dispose");
    const materialDispose = vi.spyOn(material, "dispose");
    const helper = new RigidAnimationBatch(root);
    const batchDispose = vi.spyOn(batches(root)[0], "dispose");
    helper.dispose();
    helper.dispose();
    expect(batchDispose).toHaveBeenCalledTimes(1);
    expect(geometryDispose).not.toHaveBeenCalled();
    expect(materialDispose).not.toHaveBeenCalled();
    expect(batches(root)).toHaveLength(0);
    for (const source of sources) expect(source.layers.mask).toBe(3);
  });

  it("preserves the published donkey's animated meshes and rider contacts across every clip", async () => {
    const root = await loadHumanoidAsset(ASSET_IDS.FAUNA_DONKEY_A);
    const control = await loadHumanoidAsset(ASSET_IDS.FAUNA_DONKEY_A);
    const sources: THREE.Mesh[] = [];
    root.traverse((node) => { if (node instanceof THREE.Mesh) sources.push(node); });
    const helper = new RigidAnimationBatch(root);
    const submitted = batches(root);
    expect(submitted.length).toBeGreaterThan(0);
    expect(submitted.length).toBeLessThan(sources.length / 2);
    const sourceByName = new Map(sources.map((source) => [source.name, source]));
    const clips = root.userData.animationClips as THREE.AnimationClip[];
    for (const clip of clips) {
      const mixer = new THREE.AnimationMixer(root);
      const controlMixer = new THREE.AnimationMixer(control);
      mixer.clipAction(clip).play();
      controlMixer.clipAction(clip).play();
      for (const progress of [0.1, 0.3, 0.5]) {
        mixer.update(clip.duration * progress);
        controlMixer.update(clip.duration * progress);
        helper.update();
        control.updateWorldMatrix(true, true);
        control.traverse((node) => {
          const counterpart = sourceByName.get(node.name);
          if (counterpart) expectMatrix(counterpart.matrixWorld, node.matrixWorld);
        });
        for (const suffix of ["rider_socket", "stirrup_left_socket", "stirrup_right_socket", "rein_grip_left", "rein_grip_right"]) {
          const name = `fauna_donkey_a_${suffix}`;
          const socket = root.getObjectByName(name);
          const controlSocket = control.getObjectByName(name);
          expect(socket, name).toBeDefined();
          expectMatrix(socket!.matrixWorld, controlSocket!.matrixWorld);
        }
        for (const batch of submitted) {
          const expected = sources.filter((source) => source.layers.mask === 0 && source.material === batch.material
            && !!source.geometry.index === !!batch.geometry.index
            && Object.keys(source.geometry.attributes).sort().join() === Object.keys(batch.geometry.attributes).sort().join()
            && Object.entries(source.geometry.attributes).every(([name, attribute]) => {
              const target = batch.geometry.getAttribute(name);
              return attribute.normalized === target.normalized && attribute.itemSize === target.itemSize
                && attribute.array.constructor === target.array.constructor;
            }));
          expect(batch.instanceCount).toBe(expected.length);
          expected.forEach((source, index) => {
            expectMatrix(batch.getMatrixAt(index, new THREE.Matrix4()), root.matrixWorld.clone().invert().multiply(source.matrixWorld));
            if (clip === clips[0] && progress === 0.1) {
              const range = batch.getGeometryRangeAt(batch.getGeometryIdAt(index))!;
              let maximumAttributeError = 0;
              for (const [name, attribute] of Object.entries(source.geometry.attributes)) {
                const target = batch.geometry.getAttribute(name);
                for (let vertex = 0; vertex < attribute.count; vertex += 1) {
                  for (let component = 0; component < attribute.itemSize; component += 1) {
                    maximumAttributeError = Math.max(maximumAttributeError,
                      Math.abs(attribute.getComponent(vertex, component) - target.getComponent(range.vertexStart + vertex, component)));
                  }
                }
              }
              expect(maximumAttributeError).toBe(0);
              const sourceIndex = source.geometry.index!;
              expect(range.indexCount).toBe(sourceIndex.count);
              let indexMismatches = 0;
              for (let offset = 0; offset < sourceIndex.count; offset += 1) {
                if (sourceIndex.getX(offset) !== batch.geometry.index!.getX(range.indexStart + offset) - range.vertexStart) {
                  indexMismatches += 1;
                }
              }
              expect(indexMismatches).toBe(0);
            }
          });
        }
      }
      mixer.stopAllAction();
      controlMixer.stopAllAction();
    }
    helper.dispose();
  });
});
