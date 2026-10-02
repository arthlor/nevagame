import { expect, test } from "@playwright/test";
import type * as THREE from "three";
import type { NevaDebugApi } from "../../src/app/GameApp";
import { STARTER_FARM_LAYOUT } from "../../src/world/FarmLayout";

interface CropShadowWitness {
  name: string;
  assetId: string;
  uuid: string;
  addedAfterObservation: boolean;
  nativePasses: number;
  maximumCount: number;
}

type WitnessWindow = Window & {
  __NEVA_DEBUG?: NevaDebugApi;
  __NEVA_PROBE: { scene: THREE.Scene };
  __nevaCropShadowWitness: CropShadowWitness[];
  __nevaWatchedCropId: string | null;
  __nevaReleaseCropShadowWitness: () => void;
};

test.use({ contextOptions: { reducedMotion: "reduce" }, viewport: { width: 1440, height: 900 } });

test("a newly planted crop remains in native shadows through stage changes", async ({ page }, testInfo) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && /shader|webgl|program|THREE/i.test(message.text())) errors.push(message.text());
  });
  await page.addInitScript(() => {
    localStorage.setItem("neva.graphics-quality.v1", "high");
    localStorage.setItem("neva.locale", "en");
  });
  await page.goto("/?debug=1&worldAcceptance=1&debugStart=farm");
  await page.waitForFunction(() => window.__NEVA_DEBUG?.snapshot().bootReady === true, undefined, { timeout: 180_000 });
  const welcome = await page.evaluate(() => {
    const debug = window.__NEVA_DEBUG!;
    if (!debug.moveToNpc("npc.elspeth")) throw new Error("Elspeth is unavailable");
    return debug.execute({ type: "quest.talk-npc", npcId: "npc.elspeth" });
  });
  expect(welcome.success, JSON.stringify(welcome)).toBe(true);
  await page.evaluate(({ x, z }) => {
    window.__NEVA_DEBUG!.teleport(x, z);
    window.__NEVA_DEBUG!.setReviewEnvironment({ minute: 600, weather: "clear", presentationTimeSeconds: null });
  }, STARTER_FARM_LAYOUT.origin);

  // Observe real template additions and native shadow submissions; leave
  // classification, mesh creation and growth with their production owners.
  await page.evaluate(() => {
    const target = window as unknown as WitnessWindow;
    const root = target.__NEVA_PROBE.scene.getObjectByName("crop_instance_renderer");
    if (!root) throw new Error("Crop presentation root is unavailable");
    const originals = new Map<THREE.InstancedMesh, THREE.InstancedMesh["onBeforeShadow"]>();
    target.__nevaCropShadowWitness = [];
    target.__nevaWatchedCropId = null;
    const observe = (child: THREE.Object3D, addedAfterObservation: boolean) => {
      const mesh = child as THREE.InstancedMesh;
      if (!mesh.isInstancedMesh || !mesh.castShadow || !mesh.name.includes("_instances")
        || mesh.name === "crop_disturbed_soil_instances") return;
      const witness: CropShadowWitness = {
        name: mesh.name, assetId: mesh.name.split("_instances")[0], uuid: mesh.uuid,
        addedAfterObservation, nativePasses: 0, maximumCount: 0
      };
      target.__nevaCropShadowWitness.push(witness);
      const original = mesh.onBeforeShadow;
      originals.set(mesh, original);
      mesh.onBeforeShadow = (...args: Parameters<typeof original>) => {
        const batch = mesh.userData.cropBatch as { cropIds?: string[] } | undefined;
        if (mesh.count > 0 && target.__nevaWatchedCropId
          && batch?.cropIds?.includes(target.__nevaWatchedCropId)) {
          witness.nativePasses += 1;
          witness.maximumCount = Math.max(witness.maximumCount, mesh.count);
        }
        original.apply(mesh, args);
      };
    };
    const added = ({ child }: { child: THREE.Object3D }) => observe(child, true);
    // A grown stage may share an already loaded decorative-crop template.
    for (const child of root.children) observe(child, false);
    root.addEventListener("childadded", added);
    target.__nevaReleaseCropShadowWitness = () => {
      root.removeEventListener("childadded", added);
      for (const [mesh, original] of originals) mesh.onBeforeShadow = original;
    };
  });

  try {
    const before = await page.evaluate(() => window.__NEVA_DEBUG!.snapshot().cropIds);
    const planted = await page.evaluate(() => window.__NEVA_DEBUG!.execute({
      type: "crop.plant-near", farmId: "farm.starter_garden", cropId: "crop.wheat"
    }));
    expect(planted.success, JSON.stringify(planted)).toBe(true);
    const cropId = await page.evaluate(before => {
      const target = window as unknown as WitnessWindow;
      const id = window.__NEVA_DEBUG!.snapshot().cropIds.find(id => !before.includes(id));
      target.__nevaWatchedCropId = id ?? null;
      return id;
    }, before);
    expect(cropId).toBeTruthy();
    const submittedStages = () => page.evaluate(() =>
      (window as unknown as WitnessWindow).__nevaCropShadowWitness.filter(row => row.nativePasses > 0));
    await expect.poll(async () => (await submittedStages()).length, { timeout: 20_000 }).toBeGreaterThan(0);

    const stageCount = async () => new Set((await submittedStages()).map(row => row.assetId)).size;
    for (let step = 0; step < 12 && await stageCount() < 2; step += 1) {
      await page.evaluate(() => window.__NEVA_DEBUG!.advanceGameMinutes(30));
      await page.waitForTimeout(500);
    }
    await expect.poll(stageCount, { timeout: 20_000 }).toBeGreaterThan(1);
    const witness = await submittedStages();
    expect(witness.some(row => row.addedAfterObservation)).toBe(true);
    expect(witness.every(row => row.maximumCount > 0)).toBe(true);
    const diagnostics = await page.evaluate(() => window.__NEVA_DEBUG!.renderDiagnostics());
    expect(diagnostics.world.pipeline.failedStages).toEqual([]);
    expect(diagnostics.world.shadowAtlas.cascades).toBe(2);
    expect(errors).toEqual([]);
    await testInfo.attach("crop-stage-native-shadow-submissions", {
      body: JSON.stringify({ cropId, witness, shadowAtlas: diagnostics.world.shadowAtlas, errors }, null, 2),
      contentType: "application/json"
    });
  } finally {
    await page.evaluate(() => (window as unknown as WitnessWindow).__nevaReleaseCropShadowWitness());
  }
});
