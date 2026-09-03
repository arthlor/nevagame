import { describe, expect, it } from "vitest";
import { ContentRegistry } from "../../src/content/ContentRegistry";
import { applyOfflineProgression } from "../../src/persistence/offlineDelta";
import { PhysicsWorld } from "../../src/physics/PhysicsWorld";
import { SHORE_MASK_METERS_PER_TEXEL, SHORE_MASK_RESOLUTION } from "../../src/render/water/FacetedWater";
import { Simulation } from "../../src/simulation/Simulation";
import { createInitialGameState } from "../../src/simulation/core/createInitialState";
import { sampleFarmEnvironment } from "../../src/simulation/farming/FarmEnvironmentSample";
import { createWorldEnvironmentLayout, generateSunreachCausalCompositionPlacements } from "../../src/world/WorldEnvironmentLayout";
import { SUNREACH_ROUTES } from "../../src/world/SunreachWorld";
import { WATER_SURFACE, WorldLayout } from "../../src/world/WorldLayout";
import { WORLD_SAILING_ROUTES } from "../../src/world/WorldMoorings";
import {
  SUNREACH_ANCHORS,
  WORLD_ISLAND_DEFINITIONS
} from "../../src/world/WorldIslands";

describe("Sunreach world contract", () => {
  it("registers the locked island, terrain patch, coast, regions, and anchors", () => {
    const island = WORLD_ISLAND_DEFINITIONS["island.sunreach"];
    expect(island.biomeId).toBe("biome.sunreach_warm_dry");
    expect(island.terrainPatch).toMatchObject({
      id: "terrain.sunreach",
      center: { x: 500, z: 60 },
      sizeMeters: 360,
      resolution: 256
    });
    expect(island.terrainPatch.bounds).toEqual({ minX: 320, maxX: 680, minZ: -120, maxZ: 240 });
    expect(island.regions).toEqual([
      "region.sunreach_cove",
      "region.sunreach_terraces",
      "region.sunreach_scrub",
      "region.sunreach_ridge"
    ]);
    expect(island.coastLoop.length).toBeGreaterThanOrEqual(20);
    expect(SUNREACH_ANCHORS).toMatchObject({
      dockBoat: { x: 343, z: 58 },
      dockPlayer: { x: 355, z: 58 },
      coveMarket: { x: 373, z: 56 },
      terraceFarm: { x: 455, z: 5 },
      dryScrub: { x: 515, z: 75 },
      exposedRidge: { x: 590, z: 25 },
      southernReefView: { x: 520, z: 180 }
    });
    const heightfield = WorldLayout.terrainHeightfieldForPatch("terrain.sunreach");
    expect(heightfield).toHaveLength((island.terrainPatch.resolution + 1) ** 2);
    expect(heightfield.every(Number.isFinite)).toBe(true);
    expect(createWorldEnvironmentLayout(42).staticPlacements).toContainEqual(
      expect.objectContaining({ id: "authored.sunreach.cove-market", x: 373, z: 56 })
    );
  });

  it("uses one closed-coast marine field for land, cove, channel, reef, and ecology", () => {
    expect(WorldLayout.islandAt(455, 5)).toBe("island.sunreach");
    expect(WorldLayout.waterSignedDistance(455, 5)).toBeLessThan(0);
    expect(WorldLayout.islandAt(343, 58)).toBe(null);
    expect(WorldLayout.waterSignedDistance(343, 58)).toBeGreaterThan(0);

    const cove = WorldLayout.marineSampleAt(343, 58);
    const channel = WorldLayout.marineSampleAt(288, 96);
    const reef = WorldLayout.marineSampleAt(548, 194);
    expect(cove.coveShelter).toBeGreaterThan(channel.coveShelter);
    expect(channel.openWaterExposure).toBeGreaterThan(cove.openWaterExposure);
    expect(reef.reefInfluence).toBeGreaterThan(cove.reefInfluence);
    expect(channel.ecologyWeights["ecology.neva"] + channel.ecologyWeights["ecology.sunreach"]).toBeCloseTo(1);
    expect(WorldLayout.fishingEcologyAt(548, 194).id).toBe("ecology.sunreach");
    expect(Math.hypot(channel.waveDirection.x, channel.waveDirection.z)).toBeCloseTo(1);
    expect(Math.hypot(channel.flowDirection.x, channel.flowDirection.z)).toBeCloseTo(1);
  });

  it("keeps the full skiff route sailable and derives its gate from open-water exposure", () => {
    const route = WORLD_SAILING_ROUTES[0];
    expect(route.requiredBoatTypeId).toBe("boat.skiff");
    for (const point of route.points) expect(WorldLayout.isSailable(point.x, point.z)).toBe(true);
    expect(route.points.some((point) => WorldLayout.navigationRequirementAt(point.x, point.z)?.id === "navigation.open_channel")).toBe(true);
    expect(WorldLayout.navigationRequirementAt(SUNREACH_ANCHORS.dockBoat.x, SUNREACH_ANCHORS.dockBoat.z)).toBe(null);
    const routeMeters = route.points.slice(1).reduce((total, point, index) =>
      total + Math.hypot(point.x - route.points[index].x, point.z - route.points[index].z), 0);
    const skiff = ContentRegistry.boats.get("boat.skiff")!;
    const roundTripFuelAtFullThrottle = (routeMeters / skiff.maxSpeed)
      * createInitialGameState(1).clock.minutesPerRealSecond
      * 2
      * 2;
    expect(roundTripFuelAtFullThrottle).toBeLessThan(skiff.fuelCapacity);
  });

  it("physically stops the rowboat with one readable notice while the skiff crosses", async () => {
    const rowboatPhysics = await PhysicsWorld.create();
    const rowboatSim = new Simulation();
    expect(rowboatSim.setDebugBoatDriving("boat.player_rowboat", {
      x: 210,
      z: 112,
      headingRadians: Math.PI / 2
    })).toBe(true);
    const notices: string[] = [];
    rowboatSim.events.on("Notification", (event) => notices.push(event.message));
    let rowboatBlocked = false;
    for (let frameIndex = 0; frameIndex < 720; frameIndex++) {
      const resolved = rowboatPhysics.step(
        rowboatSim.state,
        { x: 0, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        frameIndex / 60
      );
      expect(rowboatSim.commitPhysicsFrame(resolved.frame).success).toBe(true);
      rowboatBlocked ||= resolved.boatMotion["boat.player_rowboat"]?.isCollisionBlocked === true;
      if (rowboatBlocked && rowboatSim.state.boats["boat.player_rowboat"].speed === 0) break;
    }
    expect(rowboatBlocked).toBe(true);
    expect(rowboatSim.state.boats["boat.player_rowboat"].speed).toBe(0);
    expect(notices).toEqual(["The open channel needs the Coastal Fishing Skiff."]);
    rowboatPhysics.dispose();

    const skiffPhysics = await PhysicsWorld.create();
    const skiffSim = new Simulation();
    expect(skiffSim.prepareDebugSkiffReview()).toBe(true);
    expect(skiffSim.setDebugBoatDriving("boat.player_skiff", {
      x: 210,
      z: 112,
      headingRadians: Math.PI / 2
    })).toBe(true);
    for (let frameIndex = 0; frameIndex < 480; frameIndex++) {
      const resolved = skiffPhysics.step(
        skiffSim.state,
        { x: 0, z: -1, sprint: false },
        "boat-driving",
        1 / 60,
        frameIndex / 60
      );
      expect(skiffSim.commitPhysicsFrame(resolved.frame).success).toBe(true);
    }
    expect(skiffSim.state.boats["boat.player_skiff"].x).toBeGreaterThan(250);
    skiffPhysics.dispose();
  });

  it("keeps failed ground and vessel recovery on the nearest island", () => {
    expect(WorldLayout.nearestValidGround({ x: 500, z: 260 }, 1)).toEqual(SUNREACH_ANCHORS.dockPlayer);
    expect(WorldLayout.nearestValidSailable({ x: 500, z: 60 }, 1)).toEqual(SUNREACH_ANCHORS.dockBoat);
    expect(WorldLayout.nearestValidGround({ x: 0, z: 400 }, 1)).toEqual({ x: -65, z: -60.5 });
  });

  it("grades every authored land route onto walkable patch-aware traversal", () => {
    const compiled = WorldLayout.compiledRouteNetwork();
    for (const route of SUNREACH_ROUTES) {
      const samples = compiled.find((candidate) => candidate.route.id === route.id)?.samples ?? [];
      expect(samples.length).toBeGreaterThan(2);
      for (const sample of samples) {
        expect(WorldLayout.isWalkable(sample.point.x, sample.point.z)).toBe(true);
        expect(Number.isFinite(WorldLayout.traversalSurfaceHeight(sample.point.x, sample.point.z))).toBe(true);
      }
    }
  });

  it("derives the locked warm-dry climate without adding a second weather state", () => {
    const state = createInitialGameState(42);
    const weather = { ...state.weather, temperatureC: 20, precipitation: 0.8, windSpeed: 7 };
    const neva = WorldLayout.climateSampleAt(-65, -55, weather);
    const cove = WorldLayout.climateSampleAt(373, 56, weather);
    const ridge = WorldLayout.climateSampleAt(590, 25, weather);
    expect(neva).toMatchObject({ climateId: "temperate", temperatureC: 20, rainfallEffectiveness: 1, evaporationMultiplier: 1 });
    expect(cove).toMatchObject({ climateId: "warm", temperatureC: 24, rainfallEffectiveness: 0.65, effectivePrecipitation: 0.52 });
    expect(ridge.evaporationMultiplier).toBeGreaterThanOrEqual(cove.evaporationMultiplier);

    const environment = sampleFarmEnvironment(state.farms["farm.sunreach_terraces"], weather);
    expect(environment).toMatchObject({
      islandId: "island.sunreach",
      biomeId: "biome.sunreach_warm_dry",
      climateId: "warm",
      moistureRetention: 0.45,
      rainfallEffectiveness: 0.65
    });
  });

  it("keeps realtime and offline Sunreach crop growth and local cargo freshness identical", () => {
    const realtimeState = createInitialGameState(20260902);
    realtimeState.player.x = SUNREACH_ANCHORS.terraceFarm.x;
    realtimeState.player.z = SUNREACH_ANCHORS.terraceFarm.z;
    realtimeState.player.currentRegionId = "region.sunreach_terraces";
    realtimeState.weather = {
      ...realtimeState.weather,
      type: "clear",
      temperatureC: 24,
      precipitation: 0,
      nextWeatherMinute: realtimeState.clock.currentMinute + 600,
      nextWeatherType: "clear"
    };
    realtimeState.crops["crop.sunreach_parity"] = {
      id: "crop.sunreach_parity",
      cropId: "crop.sunflower",
      farmId: "farm.sunreach_terraces",
      x: 0,
      z: 0,
      rotationRadians: 0,
      plantedAtMinute: realtimeState.clock.currentMinute,
      lastUpdatedMinute: realtimeState.clock.currentMinute,
      effectiveGrowthMinutes: 0,
      moisture: 72,
      health: 100,
      stage: "seeded",
      averageMoistureAccum: 72,
      moistureSampleCount: 1
    };
    realtimeState.farms["farm.sunreach_terraces"].placedCropIds.push("crop.sunreach_parity");
    realtimeState.fishCargo["cargo.sunreach_parity"] = {
      id: "cargo.sunreach_parity",
      speciesId: "fish.sea_bream",
      weightKg: 2.2,
      quality: "common",
      caughtAtMinute: realtimeState.clock.currentMinute,
      freshness: 100,
      cargoClass: "small",
      location: { type: "player", containerId: realtimeState.player.inventoryId }
    };
    realtimeState.player.carriedFishCargoId = "cargo.sunreach_parity";
    const offlineState = structuredClone(realtimeState);
    const savedAt = 1_788_340_000_000;
    offlineState.metadata.lastSavedUtcMs = savedAt;

    const realtime = new Simulation(realtimeState);
    realtime.advanceGameMinutes(60);
    applyOfflineProgression(
      offlineState,
      savedAt + (60 / offlineState.clock.minutesPerRealSecond) * 1000
    );

    expect(offlineState.crops["crop.sunreach_parity"]).toEqual(realtime.state.crops["crop.sunreach_parity"]);
    expect(offlineState.fishCargo["cargo.sunreach_parity"].freshness).toBeCloseTo(
      realtime.state.fishCargo["cargo.sunreach_parity"].freshness,
      8
    );
  });

  it("keeps composition deterministic, island-qualified, local, and structurally complete", () => {
    const first = generateSunreachCausalCompositionPlacements(42);
    const second = generateSunreachCausalCompositionPlacements(42);
    expect(second).toBe(first);
    expect(first).toHaveLength(148);
    expect(first.every((placement) => placement.id.startsWith("seeded-fill.island.sunreach/"))).toBe(true);
    expect(first.every((placement) => placement.islandId === "island.sunreach" && WorldLayout.islandAt(placement.x, placement.z) === "island.sunreach")).toBe(true);
    expect(first.filter((placement) => placement.compositionTag?.category === "tree")).toHaveLength(48);
    expect(first.filter((placement) => placement.compositionTag?.category === "bush")).toHaveLength(62);
    expect(first.filter((placement) => placement.compositionTag?.category === "rock")).toHaveLength(38);
  });

  it("preserves shoreline and mesh sampling density in the expanded rectangular water contract", () => {
    expect(SHORE_MASK_METERS_PER_TEXEL).toBeCloseTo(750 / (SHORE_MASK_RESOLUTION - 1));
    expect(Math.round(WATER_SURFACE.width / SHORE_MASK_METERS_PER_TEXEL) + 1).toBe(785);
    expect(Math.round(WATER_SURFACE.depth / SHORE_MASK_METERS_PER_TEXEL) + 1).toBe(512);
    expect(WATER_SURFACE.width / WATER_SURFACE.segmentsX).toBeCloseTo(750 / 144, 2);
    expect(WATER_SURFACE.depth / WATER_SURFACE.segmentsZ).toBeCloseTo(750 / 144, 8);
  });

  it("locks Sunreach fish locality and their revised catch roles", () => {
    ContentRegistry.initializeAndValidate();
    const sardine = ContentRegistry.fishSpecies.get("fish.sardine")!;
    const bream = ContentRegistry.fishSpecies.get("fish.sea_bream")!;
    const amberjack = ContentRegistry.fishSpecies.get("fish.amberjack")!;
    expect(sardine).toMatchObject({ ecologyIds: ["ecology.sunreach"], isSportFish: false });
    expect(bream).toMatchObject({ ecologyIds: ["ecology.sunreach"], isSportFish: false });
    expect(bream.tags).toContain("physical-basic-catch");
    expect(amberjack).toMatchObject({ ecologyIds: ["ecology.sunreach"], isSportFish: true });
    expect(ContentRegistry.markets.get("market.sunreach_cove")?.retail.itemIds).toEqual(
      expect.arrayContaining(["item.crushed_ice", "item.boat_fuel"])
    );
    // Residents stay local: a reef or river species belongs to one island.
    // Migratory open-ocean pelagics are the stated exception — they range
    // across both, which is what stops Sunreach's two spawn points from
    // rolling the same single species forever.
    const RANGING_PELAGICS = new Set(["fish.tuna", "fish.sailfish"]);
    const SUNREACH_RESIDENTS = new Set(["fish.sardine", "fish.sea_bream", "fish.amberjack"]);
    for (const fish of ContentRegistry.fishSpecies.values()) {
      if (SUNREACH_RESIDENTS.has(fish.id)) continue;
      if (RANGING_PELAGICS.has(fish.id)) {
        expect(fish.ecologyIds, fish.id).toEqual(["ecology.neva", "ecology.sunreach"]);
        expect(fish.habitats, `${fish.id} must be pelagic to range`).toContain("offshore");
        continue;
      }
      expect(fish.ecologyIds, fish.id).toEqual(["ecology.neva"]);
    }
  });
});
