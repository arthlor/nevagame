import type { SeasonId } from "../../simulation/core/types";
import * as THREE from "three";
import { PALETTE_HEX } from "../materials/PaletteTokens";

export type QualityTier = "low" | "medium" | "high";

export const QUALITY_TIERS: readonly QualityTier[] = ["low", "medium", "high"];

export type WaterReflectionQuality = "flat" | "skyGradient" | "skyGradient+sun";

export interface WaterSurfaceTierQuality {
  readonly reflection: WaterReflectionQuality;
  readonly detailNormal: boolean;
}

/**
 * Player-anchored meadow carpet per tier. Density is a stable prefix of one
 * low-discrepancy blade sequence, so a lower tier keeps a subset of the same
 * blades rather than a reshuffled field.
 */
export interface MeadowFieldTierQuality {
  /** Tiles inside this radius draw the dense near patch. */
  readonly nearRadiusMeters: number;
  /** Blades have shrunk to nothing at this radius; terrain carries the carpet beyond. */
  readonly radiusMeters: number;
  readonly nearBladesPerSquareMeter: number;
  readonly farBladesPerSquareMeter: number;
  /** Discrete: staged at tier boundaries with the other shadow ownership. */
  readonly receiveShadows: boolean;
}

const SHARED_GROUND_WETNESS = {
  riseSeconds: 3,
  fallSeconds: 8,
  colorMix: 0.06,
  roughnessMix: 0.12
};

export interface VisualRenderConfig {
  outputColorSpace: THREE.ColorSpace;
  toneMapping: THREE.ToneMapping;
  exposure: number;
  nightExposure: number;
  qualityTier: QualityTier;
  seasons: Record<SeasonId, { tintHex: string; tintMix: number; desaturation: number; ambientMix: number }>;
  windowStagger: { maximumDelay: number; fadeWidth: number };
  coastalStone: {
    mineralScale: number;
    mineralStrength: number;
    grainScale: number;
    grainStrength: number;
    dampHeight: number;
    dampStrength: number;
  };
  transitions: {
    /** Presentation response for integer simulation-clock steps and explicit time skips. */
    timeOfDayResponseSeconds: number;
    /** Visual handoff duration for each adjacent graphics tier. */
    qualitySecondsPerTier: number;
    /** Rate-limit expensive density/LOD rebuilds while the tier is moving. */
    qualityRebuildIntervalSeconds: number;
  };
  sun: {
    maxElevationDeg: number;
    noonAzimuthDeg: number;
    colorHex: string;
    /** Low-sun key colour, reached as the sun approaches the horizon. */
    horizonColorHex: string;
    intensity: number;
    /** Solar height at which the key reaches full strength. */
    daylightFullSolarHeight: number;
    /** Solar height at which the key has fully set, below the horizon so the
     * warm low-sun key survives the last minutes on either side of it. */
    daylightZeroSolarHeight: number;
    /**
     * The ember at the centre of the golden band: `horizonColorHex` offset in
     * HSL, reached only while the sun is within `solarWidth` of the horizon.
     * The golden band owns the broad low-sun window; this is its deepest note.
     */
    ember: { hueOffset: number; saturationLift: number; lightnessOffset: number; solarWidth: number };
    /**
     * Extra key strength across the golden band. A grazing sun lights open
     * ground at a shallow angle, so without it the warm key reads only on
     * walls and the land falls back to the fill colour.
     */
    goldenKeyLift: number;
  };
  moon: {
    colorHex: string;
    intensity: number;
    cloudAttenuationFloor: number;
    stormAttenuation: number;
    discSize: number;
  };
  skyFill: {
    skyColorHex: string;
    groundColorHex: string;
    clearDayHueOffset: number;
    clearDaySaturationLift: number;
    clearDayLightnessOffset: number;
    clearDayHorizonBlueMix: number;
    nightSkyColorHex: string;
    nightGroundColorHex: string;
    nightSkyColorStrength: number;
    nightGroundColorStrength: number;
    intensity: number;
    nightIntensity: number;
    /** Extra hemisphere fill at the solar horizon so dawn/dusk never undercut night. */
    twilightFillLift: number;
    /** Warm zenith mix at the horizon hour. */
    twilightZenithHorizonMix: number;
    /** Keep night exposure until solar daylight exceeds this. */
    twilightExposureHold: number;
    /**
     * Ambient daylight at 04:00 / equivalent dusk, in the same 0–1 space as solar
     * daylight, so labeled dawn/dusk start above night rather than matching it.
     */
    dawnDuskEdgeAmbient: number;
    /**
     * Clear twilight has its own sky rather than the pale overcast one: a
     * deeper, cooler zenith offset in HSL from the clear-day zenith. The warm
     * low-sun colour then belongs to the sunward horizon, not the whole dome.
     */
    twilightZenith: { hueOffset: number; saturationLift: number; lightnessOffset: number };
    /** Anti-solar rose band above the horizon at clear twilight, offset from `horizon_warm_01`. */
    antiTwilight: { hueOffset: number; saturationLift: number; lightnessOffset: number };
    /** Clear twilight pulls the hemisphere sky colour toward that cooler zenith, so shade reads cool. */
    twilightCoolFillMix: number;
    /** …and the hemisphere ground colour toward the low-sun colour: the bounce off sunlit ground. */
    twilightWarmBounceMix: number;
    /** Hue offset carrying the night sky, horizon and fill from sea teal toward moonlit blue. */
    nightHueOffset: number;
    /**
     * Clear golden hour, while the sun is still up. The skylight really does
     * fall as the sun lowers, and a grazing key reaches open ground weakly, so
     * a full-strength fill left the land blue-grey. Fill and the uniform warm
     * horizon ring are scaled down (the sunward glow carries the brightness)
     * and exposure lifts a little to hold the midtones.
     */
    twilightFillScale: number;
    twilightHorizonScale: number;
    twilightExposureLift: number;
  };
  twilight: {
    /** Extends the dawn/dusk ambient ramp beyond label boundaries without a hard edge. */
    ambientShoulderMinutes: number;
    /** Solar-height half-width of the horizon band that owns golden-hour colour. */
    solarWidth: number;
    /** Moon stays up until the sun is this far above the horizon. */
    moonHoldSolarHeight: number;
    moonFadeWidth: number;
    /** Window lights stay full until solar daylight reaches this. */
    practicalHoldDaylight: number;
    practicalFadeWidth: number;
  };
  atmosphere: {
    cloudBaseMeters: number;
    cloudHeightMeters: number;
    cloudScaleMeters: number;
    cloudExtinction: number;
    cloudErosion: number;
    cloudMaxDistanceMeters: number;
    cloudShadowSpanMeters: number;
    cloudShadowStrength: number;
    weatherResponseSeconds: number;
    windSpeedScale: number;
    horizonHaze: number;
    /**
     * Upper-hemisphere sky probe the water reflects (equirectangular strip,
     * mipmapped for rough water), refreshed every `refreshFrames` frames.
     */
    reflectionProbe: {
      width: number;
      height: number;
      refreshFrames: number;
    };
    aerialPerspective: {
      clearMistDensity: number;
      poorVisibilityMistDensity: number;
      mistVisibilityStart: number;
      mistVisibilityFull: number;
      mistHeightMeters: number;
      nearFadeStartMeters: number;
      nearFadeEndMeters: number;
      boundaryFadeStart: number;
      /**
       * Forward scattering toward the sun along every sightline: haze glows in
       * the key's colour when looking toward a low sun and stays cool away
       * from it. A multiple of the key colour, faded with the visible sun.
       */
      sunScatter: number;
      /** Width of that forward lobe: higher hugs the sun. */
      sunScatterPower: number;
      /**
       * Morning valley mist, added to the low-lying layer on clear and cloudy
       * mornings only. It rises from `dawnMistMinutes[0]`, peaks at `[1]` and
       * has burnt off by `[2]` (clock minutes).
       */
      dawnMistDensity: number;
      dawnMistMinutes: readonly [number, number, number];
    };
    /**
     * Directional terms composed in `atmosphereSkyShader`, and therefore in the
     * water's reflection probe as well. Every strength scales the frame's own
     * colours, so they follow time of day and weather without a second palette.
     */
    sky: {
      /** Radiance of the sunward horizon glow (the key colour squared); the twilight envelope sets its reach. */
      sunwardGlow: number;
      /** Vertical concentration of that glow; higher hugs the horizon. */
      sunwardGlowFalloff: number;
      /** Anti-solar rose band above the horizon at clear twilight. */
      antiTwilightBand: number;
      /** Luminous haze line along the horizon at every hour. */
      horizonBand: number;
      /** Broad forward-scattering aureole around the sun. */
      aureole: number;
      /** Sun-disc radiance high in the sky and at the horizon, where extinction reddens and dims it. */
      sunDiscIntensity: number;
      sunDiscHorizonIntensity: number;
      /** Soft glow around the moon. */
      moonHalo: number;
      /** Forward-scattered rim on sunward cloud edges. */
      cloudSilverLining: number;
      /** How much darker cloud bases are than sunlit tops while the sun is high. */
      cloudBaseShade: number;
      /** Rose afterglow on clouds while the sun sits just below the horizon. */
      cloudAfterglow: number;
      /**
       * Warm light on cloud bases across the golden band, strongest toward
       * the sun. The deck sits far lower than real cloud, so a low sun would
       * otherwise never reach its underside the way a sunset sky shows it.
       */
      cloudTwilightGlow: number;
    };
    /**
     * The visible storm bolt, composed over the clouds in the storm flash's
     * direction and drawn only while a strike is lit. Reduced motion
     * suppresses the strike, and with it the bolt.
     */
    lightningBolt: {
      distanceMeters: number;
      /** Angular core width of the channel. */
      widthRadians: number;
      /** Angular zig-zag amplitude of the channel. */
      jitterRadians: number;
      intensity: number;
    };
    sunDiscRadiusRadians: number;
    moonDiscRadiusRadians: number;
    quality: Record<QualityTier, { resolutionScale: number; maximumWidth: number; primarySteps: number; lightSteps: number; layerSteps: number; shadowResolution: number }>;
  };
  shadows: {
    type: Record<QualityTier, THREE.ShadowMapType>;
    intensity: number;
    /** Shadow opacity and softness while the moon owns the shadow pass. */
    nightIntensity: number;
    nightRadius: number;
    bias: number;
    normalBias: number;
    radius: number;
    near: number;
    far: number;
    followSnap: boolean;
    /** Player, NPCs and mounts cast their real silhouette, not a blob proxy. */
    castCharacters: boolean;
    castSmallProps: boolean;
    castRocks: boolean;
    castAmbientFlyers: boolean;
    /**
     * Dual-map shadow compositing. A committed static atlas (all non-dynamic
     * casters, re-rendered on a bounded budget) is combined with a per-frame
     * dynamic map (characters, fauna, boats, packs) into the light's shadow
     * map. The committed light-space frame is held between atlas refreshes so
     * map content and sampled matrix always agree. Disabled falls back to the
     * single per-frame shadow map.
     */
    atlas: {
      enabled: boolean;
      /** Frames a static atlas render stays valid before wind motion refreshes it. */
      staticRefreshFrames: number;
      /** Re-center the committed shadow frame before focus nears the ortho edge. */
      recenterMeters: number;
      /** Sun/moon direction delta that invalidates cached static depth. */
      directionEpsilonRadians: number;
    };
  };
  quality: Record<
    QualityTier,
    {
      shadowMapSize: number;
      shadowCameraSize: number;
      pixelRatioCap: number;
      dynamicContactShadows: boolean;
      ambientOcclusion: "off" | "contact" | "gtao";
      postProcessPixelRatioCap: number;
      practicalLightBudget: number;
      lodDistanceScale: number;
      /** Small landscape props and understory; trees/buildings retain the fog horizon. */
      landscapeDetailDrawDistanceMeters: number;
      /** Per catalog asset, independent of how much of the continent is populated. */
      groundCoverInstanceCap: number;
      groundCoverDrawDistanceMeters: number;
      shortGrassDrawDistanceMeters: number;
      shortGrassFarInstanceCap: number;
      groundCoverFarDistanceMeters: number;
      groundCoverDensityScale: number;
      rainDropCount: number;
      rainSplashCount: number;
      fireflyCount: number;
      waterSurface: WaterSurfaceTierQuality;
      meadowField: MeadowFieldTierQuality;
    }
  >;
  contact: {
    enabled: boolean;
    opacity: number;
    playerRadius: number;
  };
  farmGround: {
    cultivationMarginMeters: number;
    gridSegments: number;
    furrowCount: number;
    furrowSegments: number;
    clodCount: number;
  };
  groundSurface: {
    shortCoverRootShade: number;
    /**
     * Rooted cover bends its authored normals toward the instance's terrain
     * normal by this share. Thin blades otherwise face sideways or down and
     * are lit by the ground bounce alone, which reads as grey or black shards.
     */
    foliageNormalUp: number;
    polygonCellScaleMeters: number;
    edgeCellScaleMeters: number;
    wetness: {
      riseSeconds: number;
      fallSeconds: number;
      colorMix: number;
      roughnessMix: number;
    };
    cultivatedEdgeMix: number;
    cultivatedWetnessMix: number;
    roadWetnessMix: number;
  };
  rainSurfaces: {
    /** Albedo darkening, roughness reduction, minimum wet roughness. */
    wood: readonly [number, number, number];
    stone: readonly [number, number, number];
    foliage: readonly [number, number, number];
  };
  terrainSurface: {
    textureSize: number;
    largeSampleScaleMeters: number;
    smallSampleScaleMeters: number;
    externalTextures: {
      leafySampleScaleMeters: number;
      sparseSampleScaleMeters: number;
      leafyRotationRadians: number;
      sparseRotationRadians: number;
      colorStrength: number;
      roughnessStrength: number;
      beach: {
        fineSampleScaleMeters: number;
        mesoSampleScaleMeters: number;
        rotationRadians: number;
        lodBias: number;
        fineMix: number;
        colorStrength: number;
        roughnessStrength: number;
      };
    };
    polygonCellScaleMeters: number;
    smallLayerRotationRadians: number;
    colorVariationStrength: number;
    paletteVariationStrength: number;
    meadowColorMix: number;
    dryClimateColorMix: number;
    dryRidgeExposureStrength: number;
    mountainRockExposureStrength: number;
    mountainDryClimateStrength: number;
    polygonVariationStrength: number;
    polygonJaggedStrength: number;
    polygonFacetLightingStrength: number;
    pathTransition: {
      shoulderStart: number;
      shoulderFull: number;
      coreStart: number;
      coreFull: number;
      underlayStrength: number;
    };
    roughnessVariation: number;
    normals: {
      continuityStartNormalY: number;
      fullyFacetedNormalY: number;
      cliffWeightStart: number;
      cliffWeightFull: number;
      facetedColorBlend: number;
      /**
       * How much of the slope-driven faceting survives on ground the world does
       * not consider a cliff. Steep soil and sand share their angle with rock
       * but not their material.
       */
      softSurfaceFacetingScale: number;
    };
    wetness: {
      riseSeconds: number;
      fallSeconds: number;
      colorMix: number;
    };
    roughness: {
      dry: number;
      wet: number;
      min: number;
      max: number;
    };
    shoreline: {
      exposedHeadlandStrength: number;
      beachColorMix: number;
      wetColorMix: number;
      cliffColorMix: number;
      rainDarkening: number;
      beachRoughness: number;
      wetRoughness: number;
      cliffRoughness: number;
      facetStrength: number;
    };
  };
  roadSurface: {
    externalTexture: {
      sampleScaleMeters: number;
      mesoSampleScaleMeters: number;
      rotationRadians: number;
      lodBias: number;
      colorStrength: number;
      roughnessStrength: number;
      /** Attenuates fine-map color, roughness, and relief without losing meso wear. */
      fineDetailStrength: number;
    };
    polygonCellScaleMeters: number;
    polygonEdgeCellScaleMeters: number;
    wearColorMix: number;
    crownGrassMix: number;
    reliefNormalStrength: number;
    wearRoughnessReduction: number;
    shoulderColorMix: number;
    edgeGrassMix: number;
    polygonVariationStrength: number;
    polygonJaggedStrength: number;
    polygonFacetLightingStrength: number;
    edgeFadeStart: number;
    edgeFadeFull: number;
    roughness: number;
    roughnessVariation: number;
  };
  waterSurface: {
    /**
     * Camera-centred LOD lattice (`WaterLod.ts`): one-metre cells around the
     * camera, doubling with every ring, drawn as instanced patches. It
     * carries every wave band a ring can resolve; the detail normals carry
     * the rest. `rangeScale` and `morphStartRatio` must satisfy the crack-free
     * inequality `waterLodRanges` checks at construction.
     */
    lod: {
      finestCellMeters: number;
      /** Cells per patch side; even, so odd vertices can morph away. */
      patchCells: number;
      levels: number;
      /** Ring radius as a multiple of the ring's node size. */
      rangeScale: number;
      /** Share of each ring's radius at which morphing toward the next begins. */
      morphStartRatio: number;
      /** Instance budget per patch kind. */
      maxNodes: number;
      /** Finest ring each tier may draw; Low starts one ring coarser. */
      finestLevel: Record<QualityTier, number>;
    };
    optics: {
      absorptionPerMeter: readonly [number, number, number];
      /** Inland water filters the same palette through its suspended minerals. */
      freshwaterAbsorptionScale: readonly [number, number, number];
      /**
       * Extra extinction a rough sea adds (stirred sediment and bubbles), as a
       * multiple of `absorptionPerMeter` at full roughness. Calm water keeps
       * its clarity; a storm hides the bed instead of showing its facets.
       */
      roughTurbidity: number;
      /** Sheltered lake detail and residual outlet drift; geometry remains shared. */
      lakeRippleScale: number;
      lakeCurrentScale: number;
      refractionPixels: number;
      causticStrength: number;
      /** Full shallow response begins fading at the first depth, gone at the second. */
      causticDepthFadeMeters: readonly [number, number];
      /** Backwash foam lace left on the sand by the swash. */
      foamStrength: number;
      /** High-tier screen-space reflection blend onto the analytic sky. */
      ssrStrength: number;
      /** Restrained backlit-crest translucency added to the shallow body. */
      sssStrength: number;
      /** Whiteness of the broken hull-contact foam; moored hulls carry less energy. */
      boatFoamStrength: number;
    };
    /**
     * Ripples below the lattice, from the tileable detail normal map
     * (`WaterDetailNormals.ts`). The sea layers two tiles turned to the wind;
     * rivers carry one tile downstream on the two-phase flow scheme; the lake
     * uses the river strength scaled by `optics.lakeRippleScale`. Mips fold
     * unresolved ripples into slope variance, so distance reads as roughness.
     */
    detailNormals: {
      /** Tile size in metres: large wind layer, small wind layer, river. */
      tileMeters: readonly [number, number, number];
      /** Slope gain: sea (calm; grows with roughness), river. */
      strength: readonly [number, number];
      /** Drift of the large and small wind layers, m/s. */
      driftMetersPerSecond: readonly [number, number];
      /** Share of the detail kept on tiers without `detailNormal` (large layer only). */
      reducedTierStrength: number;
    };
    /**
     * Slope variance below the lattice (capillary ripples): constant, then
     * gain at full sea roughness. Together with the wave bands a ring cannot
     * draw, it widens the sun lobe and lifts the reflected sky.
     */
    microSlopeVariance: readonly [number, number];
    fresnelStrength: number;
    sunGlintStrength: number;
    /**
     * Whitecaps: the wave field's own fold (the trochoid's horizontal
     * Jacobian) marks the crests, and the shading only lets them break once
     * the sea is rough, so a fair-weather swell never whitens. `foldRange` is
     * where a crest starts and finishes breaking; `scatter` is the share of
     * the drive a rough sea carries between crests, so a storm shows broken
     * flecks everywhere instead of a few large patches where crests align.
     */
    whitecap: {
      foldRange: readonly [number, number];
      scatter: number;
      strength: number;
    };
    /**
     * How much faces tilted toward the sun brighten the water body (and the
     * backs of troughs darken): a restrained scattering cue that gives the
     * swell volume. Measured against still water, so the mean colour is
     * unchanged.
     */
    crestShading: {
      strength: number;
    };
    /**
     * Surf. Waves damp to nothing as they run out of depth; this is the share
     * of that removed energy handed back as breaking foam, so the waterline
     * gets a surf line that grows with sea state. `dissolveScale` is the
     * world scale (cycles per metre) of the break-up pattern shared by surf
     * and whitecaps, and `driftMetersPerSecond` pushes surf shoreward.
     */
    surf: {
      energyGain: number;
      dissolveScale: number;
      driftMetersPerSecond: number;
      /** Surf breaks whiter than an open-water whitecap, so it has its own. */
      foamStrength: number;
    };
    /**
     * Swash lip and contact foam: a band `bandMeters` wide (horizontally) at
     * the water's edge — the run-up sheet's leading edge and, on the captured
     * tier once the sea is rough, around rocks, posts and hulls.
     */
    edgeFoam: {
      bandMeters: number;
      strength: number;
    };
    /** Depth at which the shallow turquoise has given way to the mid colour. */
    shallowEndMeters: number;
    /** Depth range over which the body reaches the deep colour. */
    depthRampStartMeters: number;
    depthRampEndMeters: number;
    depthColorStrength: number;
    headwaters: {
      /** Only the bounded headwater band receives these extra water rows. */
      maxRowSpacingMeters: number;
      /** Column spacing of the dedicated headwater surface. */
      surfaceColumnSpacingMeters: number;
      /**
       * Row spacing across the authored fall face. The default band spacing
       * cannot hold the fall's chord error, because a steeper drop needs
       * proportionally finer rows.
       */
      fallRowSpacingMeters: number;
      rapidsFoamStrength: number;
      rapidsGradeStart: number;
      rapidsGradeFull: number;
      rapidsCellScaleMeters: number;
      rapidsFlowMetersPerSecond: number;
      /**
       * River current: surface detail drifts downstream along the authored
       * channel tangent. Speed is reached once the channel is
       * `riverFlowDepthFullMeters` deep and never drops below the start
       * fraction, so bank shallows read slower than the thalweg.
       */
      riverFlowMetersPerSecond: number;
      riverFlowDepthStart: number;
      riverFlowDepthFullMeters: number;
      /**
       * Large advected lanes that survive distance filtering, so a wide river
       * still reads as moving water from the bank and from above.
       */
      riverFlowLaneStrength: number;
      /** How strongly the carved thalweg darkens the river body. */
      riverDepthShadeStrength: number;
      /** Shallow bank water fades in over this depth instead of cutting. */
      riverEdgeDepthFadeMeters: number;
      /** Opacity the river water thins to at the waterline. */
      riverEdgeOpacity: number;
      /** Broken foam lace that travels with the current at the water's edge. */
      riverEdgeFoamStrength: number;
      riverEdgeFoamScaleMeters: number;
      /** Radial rings that leave the fall landing and spread into the pool. */
      plungeRingSpeedMetersPerSecond: number;
      plungeRingWavelengthMeters: number;
      plungeRingStrength: number;
      plungeRingSpanMeters: number;
      /**
       * Dedicated presentation for the authored falling segment. Geometry,
       * foam and streak tuning live here; the topology itself stays owned by
       * `NEVA_HEADWATERS.fall`.
       */
      fall: {
        rows: Record<QualityTier, number>;
        acrossSegments: number;
        /** Animated sheet displacement; also widens the render bounds. */
        rippleMeters: number;
        /**
         * Slow rope-like ribs across the curtain. The fragment normal follows
         * the same field, so the ropes catch the light as a rounded volume.
         */
        ribMeters: number;
        /** Detail-normal ripples carried down the sheet: tile metres (across, along), strength. */
        detail: { tileMeters: readonly [number, number]; strength: number };
        /**
         * How far the sheet leaves the terrain profile for a free ballistic
         * arc. 0 hugs the carved face, 1 falls exactly under gravity from the
         * lip to the landing; both ends stay pinned to the authored stations.
         */
        nappeDetach: number;
        /**
         * Convexity of the falling sheet's cross-section. The centre pushes
         * out along the local surface normal while the edges tuck back, so the
         * curtain reads as a rounded volume rather than a flat plane.
         */
        crossBulgeMeters: number;
        /** Width growth toward the landing as the falling water spreads. */
        widthSpread: number;
        /** Mid-fall waist, where the accelerating sheet narrows before impact. */
        widthWaistMeters: number;
        /**
         * Submerged foot. The sheet continues down the ballistic arc past the
         * landing, so its geometry edge sits below the pool surface and the
         * plunge enters the water instead of ending on a visible cut line.
         * `sinkRunMeters` is the downstream extension; because the final
         * descent is near-vertical, a few centimetres bury the tip by about a
         * metre. `sinkRows` are the rows reserved below the landing.
         */
        sinkRunMeters: number;
        sinkRows: number;
        /**
         * Falling thread tuning. Threads stretch with descent (arc-dependent
         * phase stretch) instead of scrolling as rigid bands.
         */
        streakStrength: number;
        streakSpeed: number;
        streakScale: number;
        /** Across-sheet phase span: turns streak bands into falling threads. */
        streakThreadCount: number;
        /** Arc stretch of the thread phase: higher = longer falling filaments. */
        streakAcceleration: number;
        /** Mid-fall pull of the threads toward the channel centre. */
        threadConvergence: number;
        breakupStrength: number;
        /** Bright band where the water turns over the lip. */
        crestSpan: number;
        crestStrength: number;
        /** Arc where falling water starts to read as aerated white water. */
        aerationStart: number;
        /** Opacity of the falling body outside the glassy crest band. */
        bodyOpacity: number;
        impactFoamStrength: number;
        impactFoamSpan: number;
        /** Vertical impact plumes that rise off the plunge boil. */
        impactPlumeStrength: number;
        /** Foam that spreads from the landing across the pool apron. */
        apronFoamStrength: number;
        apronMeters: number;
        /**
         * Falling-water spray above the plunge pool: deterministic billboard
         * puffs that rise and dissolve. No texture, one draw call per tier.
         */
        mist: {
          count: Record<QualityTier, number>;
          sizeMeters: number;
          spreadMeters: number;
          riseMeters: number;
          driftMeters: number;
          cycleSeconds: number;
          opacity: number;
          /** Edge erosion so the puffs never read as soft discs. */
          erosion: number;
        };
      };
    };
    /**
     * Mainland brooks (`BrookSurface.ts`): a thin ribbon of running water on
     * each traced course, over the gravel bed `MainlandBrooks` cuts. Detail
     * scrolls downstream faster on steeper reaches, which break into foam.
     */
    brooks: {
      /** Knot spacing of the ribbon along its course. */
      spacingMeters: number;
      /** The ribbon's soft edge runs this far past the water's width. */
      edgeOverlapMeters: number;
      /** Opacity eases in from the source and out into the water a brook joins. */
      sourceFadeMeters: number;
      mouthFadeMeters: number;
      confluenceFadeMeters: number;
      flowMetersPerSecond: number;
      /** Extra flow speed per unit of bed grade. */
      gradeFlowGain: number;
      rippleScaleMeters: number;
      rippleStrength: number;
      rapidsGradeStart: number;
      rapidsGradeFull: number;
      rapidsFoamStrength: number;
      edgeFoamStrength: number;
      opacity: number;
      roughness: number;
    };
    quality: Record<QualityTier, WaterSurfaceTierQuality>;
  };
  practicalLights: {
    colorHex: string;
    localIntensity: number;
    localDistance: number;
    decay: number;
  };
  stars: {
    gridResolution: number;
    density: number;
    radiusRadians: number;
    intensity: number;
  };
  fireflies: {
    maxDistanceMeters: number;
    fadeStartMeters: number;
    sizeMeters: number;
    baseOpacity: number;
    motionRadiusMeters: number;
    verticalMotionMeters: number;
    motionSpeed: number;
    pulseSpeed: number;
    nightStartAmbient: number;
    nightFullAmbient: number;
  };
  gtao: {
    blendIntensity: number;
    radius: number;
    thickness: number;
    distanceFallOff: number;
    samples: number;
    denoiseSamples: number;
    resolutionScale: number;
    movingRefreshFrames: number;
    settledRefreshFrames: number;
    maxDistance: number;
    fadeDistance: number;
  };
  weather: {
    stormFogNear: number;
    stormFogFar: number;
    stormSunMultiplier: number;
    lightningColorHex: string;
    lightningIntensity: number;
    lightningCycleSeconds: number;
    lightningDurationSeconds: number;
    rain: {
      gravity: number;
      terminalSpeed: number;
      windCoupling: number;
      windResponse: number;
      volumeRadius: number;
      spawnHeight: number;
      recycleClearance: number;
      visiblePrecipitationFloor: number;
      dropLengthMin: number;
      dropLengthMax: number;
      dropWidth: number;
      splashDuration: number;
      splashSizeTerrain: number;
      splashSizeWater: number;
      streakOpacity: number;
      splashOpacity: number;
    };
  };
  fog: {
    colorHex: string;
    near: number;
    far: number;
    clearDayNear: number;
    clearDayFar: number;
    distanceDesaturation: number;
  };
  /**
   * Emissive response. Drawn as additive glow sprites parented to the practical
   * lights rather than a fullscreen bloom pass: low and medium tiers render with
   * no `EffectComposer` at all, so a real bloom chain would cost a pass and a
   * render target on exactly the hardware that can least afford one. The sprites
   * are capped by `quality[tier].practicalLightBudget`, so this is at most four
   * extra draws on high. There is no luminance threshold in this approach.
   */
  bloom: {
    enabled: boolean;
    strength: number;
    glowSizeMeters: number;
  };
  grade: {
    saturation: number;
    contrast: number;
    warmth: number;
  };
  /** Opaque main-view foliage coverage around the camera and toward the player. */
  foliageObstruction: {
    nearCameraInnerMeters: number;
    nearCameraOuterMeters: number;
    corridorRadiusCameraMeters: number;
    corridorRadiusPlayerMeters: number;
    focusHeightMeters: number;
  };
  /**
   * Canopy sway. Ground cover, clouds and the windmill already move; the trees
   * that dominate every gameplay frame did not, which read as a photograph
   * rather than a place. Applied as a vertex offset inside the shared vegetation
   * variant material, so it adds no draw call, attribute or material.
   */
  vegetationWind: {
    /** Lateral canopy travel in meters at full wind. */
    amplitudeMeters: number;
    coastalAmplitudeMeters: number;
    /** Model height below which the trunk stays planted. */
    trunkHoldMeters: number;
    /** Height above the trunk hold over which sway reaches full strength. */
    canopySpanMeters: number;
    gustWavelengthMeters: number;
    gustTravelMetersPerSecond: number;
  };
  /**
   * Shared meadow colour field and the renderer-owned grass carpet. Terrain
   * and blades evaluate the same palette field at the same world position, so
   * the near carpet, the ground between its blades and the distant meadow the
   * terrain carries alone cannot drift apart.
   */
  meadow: {
    palette: {
      /** Deep root shade, split into warm and cool macro regions. */
      rootHex: string;
      rootCoolHex: string;
      /** Mid-blade body. */
      bodyHex: string;
      bodyCoolHex: string;
      bodyWarmHex: string;
      /** Sunlit tips. */
      tipHex: string;
      tipWarmHex: string;
      /** Dry straw tips on dry meadow and Sunreach scrub. */
      strawHex: string;
    };
    /** Macro palette regions (lush, warm, cool) in meters. */
    macroScaleMeters: number;
    /** Meso clump scale in meters; drives clump height and value. */
    mesoScaleMeters: number;
    /** Terrain adoption of the carpet colour across vegetated ground. */
    terrainCarpetMix: number;
    /** Share of tip colour in the carpet seen from a distance. */
    carpetTipShare: number;
    /**
     * Value of the carpet seen from a distance relative to a sunlit blade:
     * the dark gaps and self-shading between blades, so the terrain that
     * carries the meadow past the blade radius matches the live carpet.
     */
    carpetValue: number;
    /** Ground under the live blades takes the thatch colour by this share. */
    underCarpetShade: number;
    field: {
      tileSizeMeters: number;
      /** Blades built into the near patch; the densest tier draws all of them. */
      maxBladesPerSquareMeter: number;
      /** Width over which extra near blades shrink out past the near radius. */
      nearFadeMeters: number;
      /** Width over which every blade shrinks out before the outer radius. */
      outerFadeMeters: number;
      nearSegments: number;
      farSegments: number;
      shortHeightMeters: readonly [number, number];
      meadowHeightMeters: readonly [number, number];
      widthMeters: readonly [number, number];
      /** Width growth toward the outer radius, keeping coverage as blades thin out. */
      farWidthScale: number;
      /** Static lean as a share of blade height. */
      leanRange: readonly [number, number];
      dryHeightScale: number;
      /** Low-growth density/height scales and shared terrain/blade value range. */
      patchResponse: readonly [number, number, number, number];
      /** Base value at the root; bases stay subdued without dark strokes. */
      rootShade: number;
      /** Blade normal share bent toward the terrain normal. */
      normalUp: number;
      /** Across-width normal curvature so a flat blade shades as a folded leaf. */
      normalRoundness: number;
      /** Per-blade value variation around the patch colour. */
      valueJitter: number;
      roughnessRoot: number;
      roughnessTip: number;
      /** Backlit sunlight carried through the upper blade. */
      translucency: number;
      translucencyPower: number;
      /** Tip travel in meters at full wind for a 0.25 m blade. */
      windAmplitudeMeters: number;
      /** Tip travel away from the player at full presence for a 0.25 m blade. */
      presencePushMeters: number;
      /** Roots sink by this much so slopes never show a floating base. */
      rootSinkMeters: number;
      /** Exclusion raster resolution for roads, pads and collision footprints. */
      exclusionTexelMeters: number;
    };
  };
  fishSchools: {
    memberCount: number;
    modelScale: number;
    roamingRadiusMeters: number;
    hullClearanceMeters: number;
    feedingResponse: number;
    rippleLifetimeSeconds: number;
    rippleOpacity: number;
  };
  motion: {
    locomotionBlendSeconds: number;
    actionBlendSeconds: number;
    recoveryBlendSeconds: number;
    groundingMaxFootOffsetMeters: number;
    groundingMaxTiltRadians: number;
    groundingBodyTiltScale: number;
    groundingWalkFootIkScale: number;
    groundingRunFootIkScale: number;
    groundingResponse: number;
    groundingContactBlendSeconds: number;
    groundingFootLockDistanceMeters: number;
    groundingFootUnlockDistanceMeters: number;
    groundingFootReachSofteningMeters: number;
    cameraLookAheadSeconds: number;
    cameraLookAheadMaxMeters: number;
    cameraLookAheadResponse: number;
    cameraLandingImpulseMeters: number;
    cameraLandingResponse: number;
    cameraBoatAccelerationMeters: number;
    cameraBoatYawMeters: number;
    cameraBoatForwardLeadMeters: number;
    ambientScale: number;
    reducedMotionScale: number;
    reducedMotionSecondaryScale: number;
    footIkEnabled: boolean;
    footIkMaxBendRadians: number;
    secondarySpringStiffness: number;
    secondarySpringDamping: number;
  };
  boats: {
    /**
     * Hull vertical response to the sampled wave field. The four-point average
     * under-reads a short cross/detail crest that passes between hull samples,
     * which buries the hull in a storm; blending toward the highest hull sample
     * makes the hull ride the crest it is actually in. 0 = flat average,
     * 1 = full crest ride.
     */
    crestRideBlend: number;
    /** Bounded presentation lift, scaled by rough-water excess and speed. */
    roughWaterLiftMeters: number;
    /** Hull heave/pitch/roll smoothing toward the sampled field, per second. */
    buoyancyResponsePerSecond: number;
    /** Contact-foam strength at rest, plus speed and sea-state gains. */
    contactFoamBase: number;
    contactFoamSpeedGain: number;
    contactFoamRoughnessGain: number;
    contactFoamRadiusScale: number;
    /** Full normalized storm-helm heel (|1|) in radians, presentation only. */
    stormHeelMaxRadians: number;
    /** Permanent list a wrecked hull takes in the water. */
    wreckListRadians: number;
  };
}

/**
 * The single renderer baseline. Weather and time-of-day may modulate these
 * values through the lighting rig; zones and assets must not override them.
 */
export const CANONICAL_RENDER_CONFIG: VisualRenderConfig = {
  outputColorSpace: THREE.SRGBColorSpace,
  toneMapping: THREE.ACESFilmicToneMapping,
  exposure: 1.04,
  nightExposure: 1.24,
  qualityTier: "high",
  seasons: {
    spring: { tintHex: PALETTE_HEX.foliage_sage_01, tintMix: 0, desaturation: 0, ambientMix: 0 },
    summer: { tintHex: PALETTE_HEX.accent_ochre_01, tintMix: 0.22, desaturation: 0.04, ambientMix: 0.035 },
    autumn: { tintHex: PALETTE_HEX.roof_terracotta_01, tintMix: 0.48, desaturation: 0.22, ambientMix: 0.06 },
    winter: { tintHex: PALETTE_HEX.sky_pale_01, tintMix: 0.28, desaturation: 0.62, ambientMix: 0.08 }
  },
  windowStagger: { maximumDelay: 0.5, fadeWidth: 0.3 },
  coastalStone: {
    mineralScale: 2.3,
    mineralStrength: 0.20,
    grainScale: 21,
    grainStrength: 0.07,
    dampHeight: 0.40,
    dampStrength: 0.16
  },
  transitions: {
    timeOfDayResponseSeconds: 0.75,
    qualitySecondsPerTier: 0.9,
    qualityRebuildIntervalSeconds: 0.12
  },
  sun: {
    maxElevationDeg: 50,
    noonAzimuthDeg: 45,
    colorHex: PALETTE_HEX.sun_daylight_01,
    horizonColorHex: PALETTE_HEX.horizon_gold_01,
    // The key must out-run the hemisphere fill or shadowed ground stays as
    // bright as lit ground and the world reads as an unlit diorama.
    intensity: 3.05,
    // The old ramp reached full strength only at a solar height of 0.2 and hit
    // zero at -0.08, so the key was down to a fifth of its strength exactly when
    // it was lowest and warmest. That deleted the golden hour: the warm colour
    // was there, but nothing was left to cast it. Full strength now arrives just
    // above the horizon and the falloff finishes below it.
    daylightFullSolarHeight: 0.07,
    daylightZeroSolarHeight: -0.1,
    // Gold alone read as pale amber once ACES rolled it off; the last minutes
    // either side of the horizon carry a deeper, redder ember.
    ember: { hueOffset: -0.018, saturationLift: 0.12, lightnessOffset: -0.05, solarWidth: 0.09 },
    goldenKeyLift: 0.35
  },
  moon: {
    colorHex: PALETTE_HEX.sky_pale_01,
    // Night keeps its existing moon/fill relationship; daytime coastal
    // calibration must not erase the dark-hour silhouette structure.
    intensity: 1.1,
    cloudAttenuationFloor: 0.68,
    stormAttenuation: 0.45,
    discSize: 24
  },
  skyFill: {
    skyColorHex: PALETTE_HEX.sky_pale_01,
    groundColorHex: PALETTE_HEX.sand_coastal_wet_01,
    // Clear noon reads as a luminous Mediterranean summer zenith: cooler hue,
    // high saturation, and only a mild value drop so the dome stays bright
    // rather than storm-dark. Cloudy/rainy weather still inherits sky_pale_01.
    clearDayHueOffset: 0.032,
    clearDaySaturationLift: 0.44,
    clearDayLightnessOffset: -0.09,
    clearDayHorizonBlueMix: 0.84,
    nightSkyColorHex: PALETTE_HEX.water_deep_01,
    nightGroundColorHex: PALETTE_HEX.foliage_shadow_01,
    nightSkyColorStrength: 0.82,
    nightGroundColorStrength: 1.08,
    intensity: 1.45,
    // Held in proportion to the daytime fill: a night ambient that nearly
    // matches day flattens the moonlit world as badly as an over-bright fill
    // flattens noon.
    nightIntensity: 0.52,
    twilightFillLift: 0.3,
    twilightZenithHorizonMix: 0.28,
    twilightExposureHold: 0.4,
    dawnDuskEdgeAmbient: 0.46,
    // Clear golden hour used to drop back to the pale overcast dome, which
    // tone-mapped to a milky beige sky and a grey-olive world. It now keeps a
    // deeper cool zenith, and the warm colour moves to the sunward horizon.
    twilightZenith: { hueOffset: 0.02, saturationLift: -0.06, lightnessOffset: -0.4 },
    antiTwilight: { hueOffset: -0.045, saturationLift: 0.08, lightnessOffset: -0.24 },
    twilightCoolFillMix: 0.5,
    twilightWarmBounceMix: 0.55,
    nightHueOffset: 0.045,
    twilightFillScale: 0.62,
    twilightHorizonScale: 0.3,
    twilightExposureLift: 0.08
  },
  twilight: {
    ambientShoulderMinutes: 90,
    solarWidth: 0.24,
    moonHoldSolarHeight: 0.16,
    moonFadeWidth: 0.26,
    // Re-centred on the wider daylight ramp above: window lights are half up at
    // the moment of sunset and fully up once the key has gone.
    practicalHoldDaylight: 0.36,
    practicalFadeWidth: 0.55
  },
  atmosphere: {
    cloudBaseMeters: 145,
    cloudHeightMeters: 86,
    cloudScaleMeters: 145,
    cloudExtinction: 0.045,
    cloudErosion: 0.16,
    cloudMaxDistanceMeters: 2400,
    cloudShadowSpanMeters: 900,
    cloudShadowStrength: 0.64,
    weatherResponseSeconds: 7,
    windSpeedScale: 0.075,
    horizonHaze: 0.00055,
    reflectionProbe: {
      width: 256,
      height: 64,
      refreshFrames: 4
    },
    aerialPerspective: {
      clearMistDensity: 0.001,
      poorVisibilityMistDensity: 0.018,
      mistVisibilityStart: 0.7,
      mistVisibilityFull: 0.15,
      mistHeightMeters: 12,
      nearFadeStartMeters: 12,
      nearFadeEndMeters: 32,
      boundaryFadeStart: 0.35,
      sunScatter: 0.55,
      sunScatterPower: 5,
      dawnMistDensity: 0.006,
      dawnMistMinutes: [270, 390, 560]
    },
    sky: {
      sunwardGlow: 1.3,
      sunwardGlowFalloff: 5.5,
      antiTwilightBand: 0.55,
      horizonBand: 0.1,
      aureole: 0.16,
      sunDiscIntensity: 5,
      sunDiscHorizonIntensity: 1.6,
      moonHalo: 0.12,
      cloudSilverLining: 0.9,
      cloudBaseShade: 0.45,
      cloudAfterglow: 0.8,
      cloudTwilightGlow: 0.55
    },
    lightningBolt: {
      distanceMeters: 900,
      widthRadians: 0.0022,
      jitterRadians: 0.018,
      intensity: 14
    },
    sunDiscRadiusRadians: 0.009,
    moonDiscRadiusRadians: 0.013,
    quality: {
      low: { resolutionScale: 0.5, maximumWidth: 640, primarySteps: 0, lightSteps: 0, layerSteps: 12, shadowResolution: 64 },
      medium: { resolutionScale: 0.5, maximumWidth: 960, primarySteps: 0, lightSteps: 0, layerSteps: 16, shadowResolution: 128 },
      high: { resolutionScale: 0.5, maximumWidth: 1280, primarySteps: 32, lightSteps: 3, layerSteps: 16, shadowResolution: 192 }
    }
  },
  shadows: {
    type: {
      low: THREE.BasicShadowMap,
      medium: THREE.PCFSoftShadowMap,
      high: THREE.PCFSoftShadowMap
    },
    // Fully opaque shadows crushed dark palette families - coastal rock and dark
    // wood read as flat black silhouettes with no facet separation. Letting a
    // little ambient into the shadow recovers that range without raising the
    // hemisphere fill, which would flatten the lit surfaces instead.
    intensity: 0.86,
    // Moonlight is a far weaker, far softer key than the sun; reusing the day
    // recipe gave 01:00 a razor-hard opaque cast.
    nightIntensity: 0.55,
    nightRadius: 4.2,
    // Bias is tuned for the wider shadow cameras below: an 84 m ortho at 2048
    // is ~0.082 m per texel, and at a 35 degree sun the depth slope across one
    // texel on open terrain is what produced the diagonal acne streaks.
    bias: -0.0011,
    normalBias: 0.14,
    radius: 2.35,
    // The key light sits 120 m from the shadow focus; a tighter slab than the
    // old 0.5-260 range keeps depth precision where the casters actually are.
    near: 30,
    far: 235,
    followSnap: true,
    castCharacters: true,
    castSmallProps: true,
    castRocks: true,
    castAmbientFlyers: false,
    atlas: {
      enabled: true,
      // Wind-deformed casters live in the static atlas, so it is re-rendered on
      // a short bounded age to keep canopy shadows moving with the mesh. The
      // committed light frame is unchanged by these refreshes.
      staticRefreshFrames: 8,
      // 84 m half-extent; 24 m gives the player room before the shadow region
      // needs to follow, so walking re-centers rarely.
      recenterMeters: 24,
      directionEpsilonRadians: 0.006
    }
  },
  quality: {
    low: {
      shadowMapSize: 1024,
      shadowCameraSize: 46,
      pixelRatioCap: 0.85,
      dynamicContactShadows: false,
      ambientOcclusion: "off",
      postProcessPixelRatioCap: 1,
      practicalLightBudget: 1,
      lodDistanceScale: 0.55,
      landscapeDetailDrawDistanceMeters: 72,
      groundCoverInstanceCap: 800,
      groundCoverDrawDistanceMeters: 55,
      shortGrassDrawDistanceMeters: 28,
      shortGrassFarInstanceCap: 80,
      groundCoverFarDistanceMeters: 330,
      groundCoverDensityScale: 0.4,
      rainDropCount: 140,
      rainSplashCount: 20,
      fireflyCount: 28,
      waterSurface: {
        reflection: "skyGradient",
        detailNormal: false
      },
      meadowField: {
        nearRadiusMeters: 9,
        radiusMeters: 24,
        nearBladesPerSquareMeter: 36,
        farBladesPerSquareMeter: 12,
        receiveShadows: false
      }
    },
    medium: {
      shadowMapSize: 1536,
      shadowCameraSize: 64,
      pixelRatioCap: 1.15,
      dynamicContactShadows: true,
      ambientOcclusion: "contact",
      postProcessPixelRatioCap: 1.25,
      practicalLightBudget: 3,
      lodDistanceScale: 0.8,
      landscapeDetailDrawDistanceMeters: 112,
      groundCoverInstanceCap: 1600,
      groundCoverDrawDistanceMeters: 78,
      shortGrassDrawDistanceMeters: 36,
      shortGrassFarInstanceCap: 140,
      groundCoverFarDistanceMeters: 380,
      groundCoverDensityScale: 0.68,
      rainDropCount: 240,
      rainSplashCount: 32,
      fireflyCount: 48,
      waterSurface: {
        reflection: "skyGradient+sun",
        detailNormal: true
      },
      meadowField: {
        nearRadiusMeters: 11,
        radiusMeters: 32,
        nearBladesPerSquareMeter: 56,
        farBladesPerSquareMeter: 18,
        receiveShadows: true
      }
    },
    high: {
      shadowMapSize: 2048,
      shadowCameraSize: 84,
      // Keep the full material path within a bounded drawing-buffer budget;
      // UI remains at native CSS resolution on every tier.
      pixelRatioCap: 1.5,
      dynamicContactShadows: false,
      ambientOcclusion: "gtao",
      postProcessPixelRatioCap: 1.2,
      practicalLightBudget: 4,
      lodDistanceScale: 1.15,
      landscapeDetailDrawDistanceMeters: 168,
      groundCoverInstanceCap: 2800,
      groundCoverDrawDistanceMeters: 96,
      shortGrassDrawDistanceMeters: 44,
      shortGrassFarInstanceCap: 220,
      groundCoverFarDistanceMeters: 430,
      groundCoverDensityScale: 1,
      rainDropCount: 360,
      rainSplashCount: 48,
      fireflyCount: 72,
      waterSurface: {
        reflection: "skyGradient+sun",
        detailNormal: true
      },
      meadowField: {
        nearRadiusMeters: 12,
        radiusMeters: 40,
        nearBladesPerSquareMeter: 80,
        farBladesPerSquareMeter: 24,
        receiveShadows: true
      }
    }
  },
  contact: {
    enabled: true,
    opacity: 0.23,
    playerRadius: 0.64
  },
  farmGround: {
    cultivationMarginMeters: 0.8,
    gridSegments: 10,
    furrowCount: 6,
    furrowSegments: 14,
    clodCount: 24
  },
  groundSurface: {
    shortCoverRootShade: 0.7,
    foliageNormalUp: 0.62,
    polygonCellScaleMeters: 1.2,
    edgeCellScaleMeters: 1.2,
    wetness: SHARED_GROUND_WETNESS,
    cultivatedEdgeMix: 0.1,
    cultivatedWetnessMix: 0.08,
    roadWetnessMix: 0.08
  },
  rainSurfaces: {
    wood: [0.2, 0.1, 0.66],
    stone: [0.15, 0.18, 0.56],
    foliage: [0.035, 0.12, 0.58]
  },
  terrainSurface: {
    textureSize: 128,
    largeSampleScaleMeters: 46,
    smallSampleScaleMeters: 13,
    externalTextures: {
      leafySampleScaleMeters: 7.5,
      sparseSampleScaleMeters: 10.5,
      leafyRotationRadians: 0.61,
      sparseRotationRadians: -0.83,
      colorStrength: 0.68,
      roughnessStrength: 1,
      beach: {
        fineSampleScaleMeters: 6,
        mesoSampleScaleMeters: 14,
        rotationRadians: -0.31,
        lodBias: 0.2,
        fineMix: 0.38,
        colorStrength: 1,
        roughnessStrength: 1
      }
    },
    polygonCellScaleMeters: 1.2,
    smallLayerRotationRadians: 0.61,
    colorVariationStrength: 0.06,
    paletteVariationStrength: 0.34,
    meadowColorMix: 0.34,
    dryClimateColorMix: 0.9,
    dryRidgeExposureStrength: 0.72,
    mountainRockExposureStrength: 0.88,
    mountainDryClimateStrength: 0.72,
    polygonVariationStrength: 0.24,
    polygonJaggedStrength: 0.14,
    polygonFacetLightingStrength: 0.04,
    pathTransition: {
      shoulderStart: 0.32,
      shoulderFull: 0.52,
      coreStart: 0.68,
      coreFull: 0.86,
      underlayStrength: 0.22
    },
    roughnessVariation: 0.025,
    normals: {
      continuityStartNormalY: 0.88,
      // Widened from 0.66: a river bank crosses the old window inside a single
      // 1.56 m terrain vertex, so faceting snapped from off to full along one
      // grid line and drew a hard chevron seam down the bank.
      fullyFacetedNormalY: 0.54,
      cliffWeightStart: 0.08,
      cliffWeightFull: 0.5,
      facetedColorBlend: 0.7,
      // Slope alone must not turn soft ground into a cliff face. The river
      // banks by the farmhouse road measured cliff weight 0 with slope faceting
      // 1, so sand was being shaded with the full rock treatment: flat face
      // normals and flat face colour on a regular grid, which reads as sawtooth
      // rather than as stone. Real cliffs are unaffected - they reach full
      // faceting through the semantic cliff weight instead.
      softSurfaceFacetingScale: 0.3
    },
    wetness: SHARED_GROUND_WETNESS,
    roughness: {
      dry: 0.92,
      wet: 0.8,
      min: 0.775,
      max: 0.945
    },
    shoreline: {
      exposedHeadlandStrength: 0.94,
      beachColorMix: 0.54,
      wetColorMix: 0.62,
      cliffColorMix: 0.5,
      rainDarkening: 0.12,
      beachRoughness: 0.93,
      wetRoughness: 0.72,
      cliffRoughness: 0.88,
      facetStrength: 0.62
    }
  },
  roadSurface: {
    externalTexture: {
      sampleScaleMeters: 2.6,
      mesoSampleScaleMeters: 8.5,
      rotationRadians: 0.37,
      lodBias: 0.2,
      colorStrength: 0.72,
      roughnessStrength: 1,
      fineDetailStrength: 0.3
    },
    polygonCellScaleMeters: 0.75,
    polygonEdgeCellScaleMeters: 1.2,
    wearColorMix: 0.62,
    crownGrassMix: 0.28,
    reliefNormalStrength: 0.065,
    wearRoughnessReduction: 0.075,
    shoulderColorMix: 0.4,
    edgeGrassMix: 0.68,
    polygonVariationStrength: 0.08,
    polygonJaggedStrength: 0.22,
    polygonFacetLightingStrength: 0.016,
    edgeFadeStart: 0.16,
    edgeFadeFull: 0.72,
    roughness: 0.94,
    roughnessVariation: 0.02
  },
  waterSurface: {
    lod: {
      finestCellMeters: 1,
      patchCells: 16,
      levels: 8,
      rangeScale: 3,
      morphStartRatio: 0.78,
      maxNodes: 768,
      finestLevel: { low: 1, medium: 0, high: 0 }
    },
    optics: {
      absorptionPerMeter: [0.34, 0.12, 0.085],
      freshwaterAbsorptionScale: [0.78, 1.14, 1.3],
      roughTurbidity: 3,
      lakeRippleScale: 0.48,
      lakeCurrentScale: 0.06,
      refractionPixels: 2.4,
      causticStrength: 0.4,
      causticDepthFadeMeters: [1.2, 3.6],
      foamStrength: 0.62,
      // WaterThreeJS adaptations, kept restrained for the cozy baseline:
      // SSR stays a blend onto the sky (never a mirror), SSS a faint crest
      // glow, and hull rings dissolve through FBM instead of stamping white.
      ssrStrength: 0.55,
      sssStrength: 0.22,
      boatFoamStrength: 0.75
    },
    detailNormals: {
      tileMeters: [9, 3.4, 2.6],
      strength: [0.5, 0.34],
      driftMetersPerSecond: [0.6, 0.95],
      reducedTierStrength: 0.7
    },
    microSlopeVariance: [0.0012, 0.004],
    fresnelStrength: 0.84,
    sunGlintStrength: 0.34,
    whitecap: {
      foldRange: [0.07, 0.2],
      scatter: 0.35,
      strength: 0.82
    },
    crestShading: {
      strength: 0.3
    },
    surf: {
      energyGain: 0.8,
      dissolveScale: 0.95,
      driftMetersPerSecond: 0.35,
      foamStrength: 0.8
    },
    edgeFoam: {
      bandMeters: 0.9,
      strength: 0.7
    },
    shallowEndMeters: 1.8,
    depthRampStartMeters: 1.4,
    depthRampEndMeters: 8,
    depthColorStrength: 0.82,
    headwaters: {
      maxRowSpacingMeters: 0.75,
      surfaceColumnSpacingMeters: 0.75,
      // Finer than the sheet rows: the landing's smoothstep curvature still
      // exceeds a 0.03 m chord budget at 0.06 m spacing on the 27.5 m drop.
      fallRowSpacingMeters: 0.03,
      rapidsFoamStrength: 0.4,
      rapidsGradeStart: 0.15,
      rapidsGradeFull: 0.65,
      rapidsCellScaleMeters: 1.3,
      rapidsFlowMetersPerSecond: 1.8,
      riverFlowMetersPerSecond: 1.15,
      riverFlowDepthStart: 0.22,
      riverFlowDepthFullMeters: 1.5,
      riverFlowLaneStrength: 0.075,
      riverDepthShadeStrength: 0.5,
      riverEdgeDepthFadeMeters: 1.45,
      riverEdgeOpacity: 0.18,
      riverEdgeFoamStrength: 0.11,
      riverEdgeFoamScaleMeters: 1.7,
      plungeRingSpeedMetersPerSecond: 1.7,
      plungeRingWavelengthMeters: 2,
      plungeRingStrength: 0.22,
      plungeRingSpanMeters: 5.2,
      fall: {
        rows: { low: 12, medium: 20, high: 30 },
        acrossSegments: 14,
        /**
         * Animated sheet displacement; also widens the render bounds. The
         * fragment normal does not follow this displacement, so the amplitude
         * stays in the micro-texture range: larger values shaded as transverse
         * corrugation when the fall was seen from above.
         */
        rippleMeters: 0.025,
        ribMeters: 0.12,
        detail: { tileMeters: [1.6, 4.2], strength: 0.45 },
        nappeDetach: 0.68,
        crossBulgeMeters: 0.38,
        widthSpread: 0.18,
        widthWaistMeters: 0.32,
        // Scaled for the 27.5 m drop: the continued parabola past the landing
        // buries the sheet foot 0.2–2.5 m under the pool, not through the basin.
        sinkRunMeters: 0.05,
        sinkRows: 2,
        streakStrength: 0.72,
        streakSpeed: 1.35,
        /**
         * Cycles of the thread phase along the fall. This is a *band* count
         * when it is large: from the lip or from above, the near-horizontal
         * jet face showed the phase as transverse corrugation (13 read as
         * regular wavy ribs). Long filaments need only a couple of cycles;
         * across-thread count carries the texture.
         */
        streakScale: 2.6,
        streakThreadCount: 17,
        streakAcceleration: 0.9,
        threadConvergence: 0.18,
        breakupStrength: 0.85,
        crestSpan: 0.09,
        crestStrength: 0.26,
        aerationStart: 0.22,
        bodyOpacity: 1,
        impactFoamStrength: 0.72,
        impactFoamSpan: 0.2,
        impactPlumeStrength: 0.55,
        apronFoamStrength: 0.42,
        apronMeters: 1.6,
        mist: {
          count: { low: 6, medium: 12, high: 20 },
          sizeMeters: 1.0,
          spreadMeters: 1.9,
          riseMeters: 2.6,
          driftMeters: 1.3,
          cycleSeconds: 5.2,
          opacity: 0.34,
          erosion: 0.85
        }
      }
    },
    brooks: {
      spacingMeters: 1.5,
      edgeOverlapMeters: 0.1,
      sourceFadeMeters: 4,
      mouthFadeMeters: 5,
      confluenceFadeMeters: 2.5,
      flowMetersPerSecond: 0.9,
      gradeFlowGain: 3.2,
      rippleScaleMeters: 0.9,
      rippleStrength: 0.34,
      rapidsGradeStart: 0.12,
      rapidsGradeFull: 0.45,
      rapidsFoamStrength: 0.55,
      edgeFoamStrength: 0.22,
      opacity: 0.78,
      roughness: 0.14
    },
    quality: {
      low: {
        reflection: "skyGradient",
        detailNormal: false
      },
      medium: {
        reflection: "skyGradient+sun",
        detailNormal: true
      },
      high: {
        reflection: "skyGradient+sun",
        detailNormal: true
      }
    }
  },
  practicalLights: {
    colorHex: PALETTE_HEX.emissive_lantern_01,
    localIntensity: 18,
    localDistance: 13,
    decay: 2
  },
  stars: {
    gridResolution: 96,
    density: 0.065,
    radiusRadians: 0.0007,
    intensity: 1.8
  },
  fireflies: {
    maxDistanceMeters: 160,
    fadeStartMeters: 84,
    sizeMeters: 0.34,
    baseOpacity: 0.78,
    motionRadiusMeters: 0.56,
    verticalMotionMeters: 0.34,
    motionSpeed: 0.22,
    pulseSpeed: 1.25,
    nightStartAmbient: 0.58,
    nightFullAmbient: 0.12
  },
  gtao: {
    blendIntensity: 0.44,
    radius: 0.56,
    thickness: 0.55,
    distanceFallOff: 0.92,
    samples: 6,
    denoiseSamples: 4,
    resolutionScale: 0.6,
    movingRefreshFrames: 2,
    settledRefreshFrames: 4,
    maxDistance: 55,
    fadeDistance: 32
  },
  weather: {
    stormFogNear: 28,
    stormFogFar: 145,
    stormSunMultiplier: 0.42,
    lightningColorHex: PALETTE_HEX.sky_pale_01,
    lightningIntensity: 6.4,
    lightningCycleSeconds: 11,
    lightningDurationSeconds: 0.48,
    rain: {
      gravity: -26,
      terminalSpeed: 18,
      windCoupling: 0.28,
      windResponse: 6,
      volumeRadius: 22,
      spawnHeight: 11,
      recycleClearance: 1.4,
      visiblePrecipitationFloor: 0.12,
      dropLengthMin: 0.38,
      dropLengthMax: 0.78,
      dropWidth: 0.014,
      splashDuration: 0.28,
      splashSizeTerrain: 0.18,
      splashSizeWater: 0.24,
      streakOpacity: 0.26,
      splashOpacity: 0.36
    }
  },
  fog: {
    colorHex: PALETTE_HEX.sky_pale_01,
    near: 62,
    far: 330,
    // The terrain plane is 600 m across, so a clear-day far plane beyond it
    // left the world's cut edge visible against the sky and removed every
    // depth cue between the foreground and the horizon.
    clearDayNear: 115,
    clearDayFar: 430,
    distanceDesaturation: 0.2
  },
  bloom: {
    enabled: true,
    // Restrained on purpose. A halo that reads as a distinct circle rather than
    // as light in the air is the "heavy bloom" section 16 prohibits; at this
    // strength and size it sits just inside the lantern's own pool of light.
    strength: 0.3,
    glowSizeMeters: 1.35
  },
  grade: {
    saturation: 1,
    contrast: 1,
    warmth: 0.04
  },
  foliageObstruction: {
    nearCameraInnerMeters: 0.6,
    nearCameraOuterMeters: 2.6,
    corridorRadiusCameraMeters: 1.6,
    corridorRadiusPlayerMeters: 0.85,
    focusHeightMeters: 1.25
  },
  vegetationWind: {
    amplitudeMeters: 0.14,
    coastalAmplitudeMeters: 0.32,
    trunkHoldMeters: 1.6,
    canopySpanMeters: 5.5,
    gustWavelengthMeters: 45,
    gustTravelMetersPerSecond: 3.8
  },
  meadow: {
    // Olive/sage shadows under yellow-green highlights (Art Bible §9), with the
    // fresher coastal greens carrying the lush cool regions of the meadow study.
    palette: {
      rootHex: PALETTE_HEX.foliage_shadow_01,
      rootCoolHex: PALETTE_HEX.foliage_coastal_shade_01,
      bodyHex: PALETTE_HEX.foliage_olive_01,
      bodyCoolHex: PALETTE_HEX.foliage_coastal_01,
      bodyWarmHex: PALETTE_HEX.foliage_leaf_01,
      tipHex: PALETTE_HEX.foliage_coastal_sun_01,
      tipWarmHex: PALETTE_HEX.foliage_highlight_01,
      strawHex: PALETTE_HEX.grass_yellow_01
    },
    macroScaleMeters: 46,
    mesoScaleMeters: 5.5,
    terrainCarpetMix: 0.82,
    carpetTipShare: 0.45,
    carpetValue: 0.86,
    underCarpetShade: 0.6,
    field: {
      tileSizeMeters: 4,
      maxBladesPerSquareMeter: 80,
      nearFadeMeters: 3,
      outerFadeMeters: 7,
      nearSegments: 3,
      farSegments: 2,
      shortHeightMeters: [0.15, 0.28],
      meadowHeightMeters: [0.3, 0.5],
      widthMeters: [0.04, 0.06],
      farWidthScale: 2,
      leanRange: [0.16, 0.5],
      dryHeightScale: 0.62,
      patchResponse: [0.72, 0.58, 0.84, 1.16],
      rootShade: 0.66,
      normalUp: 0.62,
      normalRoundness: 0.45,
      valueJitter: 0.045,
      roughnessRoot: 0.92,
      roughnessTip: 0.84,
      translucency: 0.5,
      translucencyPower: 3,
      windAmplitudeMeters: 0.15,
      presencePushMeters: 0.2,
      rootSinkMeters: 0.03,
      exclusionTexelMeters: 0.5
    }
  },
  fishSchools: {
    memberCount: 5,
    modelScale: 0.55,
    roamingRadiusMeters: 5.5,
    hullClearanceMeters: 1.1,
    feedingResponse: 0.8,
    rippleLifetimeSeconds: 2.4,
    rippleOpacity: 0.45
  },
  motion: {
    locomotionBlendSeconds: 0.16,
    actionBlendSeconds: 0.1,
    recoveryBlendSeconds: 0.18,
    groundingMaxFootOffsetMeters: 0.16,
    groundingMaxTiltRadians: THREE.MathUtils.degToRad(14),
    groundingBodyTiltScale: 0.25,
    groundingWalkFootIkScale: 0.65,
    groundingRunFootIkScale: 0.2,
    groundingResponse: 18,
    groundingContactBlendSeconds: 0.08,
    groundingFootLockDistanceMeters: 0.05,
    groundingFootUnlockDistanceMeters: 0.18,
    groundingFootReachSofteningMeters: 0.035,
    cameraLookAheadSeconds: 0.18,
    cameraLookAheadMaxMeters: 0.82,
    cameraLookAheadResponse: 8,
    cameraLandingImpulseMeters: 0.22,
    cameraLandingResponse: 12,
    cameraBoatAccelerationMeters: 0.08,
    cameraBoatYawMeters: 0.12,
    cameraBoatForwardLeadMeters: 1.25,
    ambientScale: 1,
    reducedMotionScale: 0.35,
    reducedMotionSecondaryScale: 0,
    footIkEnabled: true,
    footIkMaxBendRadians: 0.45,
    secondarySpringStiffness: 18,
    secondarySpringDamping: 9
  },
  boats: {
    crestRideBlend: 0.65,
    roughWaterLiftMeters: 0.22,
    buoyancyResponsePerSecond: 9,
    contactFoamBase: 0.12,
    contactFoamSpeedGain: 0.5,
    contactFoamRoughnessGain: 0.38,
    contactFoamRadiusScale: 1.3,
    stormHeelMaxRadians: 0.22,
    wreckListRadians: 0.12
  }
};

export function qualityTierLevel(tier: QualityTier): number {
  return QUALITY_TIERS.indexOf(tier);
}

export function qualityTierAtLevel(level: number): QualityTier {
  return QUALITY_TIERS[Math.round(THREE.MathUtils.clamp(level, 0, QUALITY_TIERS.length - 1))]!;
}

export function qualityValueAtLevel(
  level: number,
  select: (quality: VisualRenderConfig["quality"][QualityTier]) => number
): number {
  const clamped = THREE.MathUtils.clamp(level, 0, QUALITY_TIERS.length - 1);
  const lowerIndex = Math.floor(clamped);
  const upperIndex = Math.min(QUALITY_TIERS.length - 1, lowerIndex + 1);
  const lower = CANONICAL_RENDER_CONFIG.quality[QUALITY_TIERS[lowerIndex]!];
  const upper = CANONICAL_RENDER_CONFIG.quality[QUALITY_TIERS[upperIndex]!];
  return THREE.MathUtils.lerp(select(lower), select(upper), clamped - lowerIndex);
}

export function advanceQualityLevel(
  current: number,
  target: number,
  deltaSeconds: number,
  secondsPerTier: number = CANONICAL_RENDER_CONFIG.transitions.qualitySecondsPerTier
): number {
  const distance = target - current;
  if (Math.abs(distance) <= 0.0001) return target;
  const step = Math.max(0, deltaSeconds) / Math.max(0.001, secondsPerTier);
  return current + Math.sign(distance) * Math.min(Math.abs(distance), step);
}

export function highTierEffectStrength(level: number): number {
  return THREE.MathUtils.smoothstep(level, 1.5, 2);
}

export function contactTierEffectStrength(level: number): number {
  return THREE.MathUtils.clamp(1 - Math.abs(level - 1) * 2, 0, 1);
}

export function groundCoverActiveCount(highCount: number, tier: QualityTier): number {
  return groundCoverActiveCountAtLevel(highCount, qualityTierLevel(tier));
}

export function groundCoverActiveCountAtLevel(highCount: number, level: number): number {
  return Math.max(
    0,
    Math.min(
      highCount,
      Math.floor(highCount * qualityValueAtLevel(level, (quality) => quality.groundCoverDensityScale))
    )
  );
}
