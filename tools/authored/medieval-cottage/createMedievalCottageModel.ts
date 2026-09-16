import * as THREE from 'three';

// =============================================================================
// PROCEDURAL MEDIEVAL TIMBER COTTAGE (High-Fidelity Code-Only Model)
// Reconstructed from 4-view orthographic reference:
// Front (0°), 3/4 Front-Right (45°), Rear (180°), 3/4 Rear-Right (135°)
// =============================================================================

export interface MedievalCottageOptions {
  castShadow?: boolean;
  receiveShadow?: boolean;
  /**
   * Shadow-casting lantern point lights (default false). Each one re-renders the scene into a
   * six-face cube shadow map every frame, which is costly in a game for a barely visible effect.
   */
  lanternShadows?: boolean;
}

export function createMedievalCottageModel(options: MedievalCottageOptions = {}): THREE.Group {
  const root = new THREE.Group();
  root.name = 'building_medieval_timber_cottage_a_root';

  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;
  const lanternShadows = options.lanternShadows ?? false;

  function applyShadow<T extends THREE.Object3D>(obj: T): T {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = castShadow;
        child.receiveShadow = receiveShadow;
      }
    });
    return obj;
  }

  // ---------------------------------------------------------------------------
  // Color Palette & PBR Materials
  // Grounded in reference: warm aged lime plaster, dark weathered oak beams,
  // hand-moulded terracotta tiles, chiseled fieldstone masonry, wrought iron.
  // ---------------------------------------------------------------------------
  const C = {
    timberDark: 0x422d1b,      // Primary weathered structural oak
    timberMid: 0x563c26,       // Secondary framing / posts
    timberHighlight: 0x6e4e34, // Sills, lintels & chamfers
    timberPeg: 0x2b1c11,       // Dark wooden joint peg dowels
    woodLadder: 0x6d4c32,      // Weathered rustic garden ladder wood
    plasterWall: 0xded5c4,     // Warm aged lime-wash plaster infill
    plasterShade: 0xd0c5b2,    // Recessed bay plaster tone
    plasterWeathered: 0xc4b7a2,// Plaster distressing & spall
    tileRidge: 0x9a4427,       // Terracotta ridge cap
    tileShade0: 0x984227,      // Clay shingle palette variations
    tileShade1: 0xab4e2e,
    tileShade2: 0x883820,
    tileShade3: 0xb75a36,
    tileShade4: 0x762f1a,
    stonePlinth: 0x756e66,     // Primary fieldstone masonry
    stoneLight: 0x948b80,      // Dressed ashlar blocks
    stoneDark: 0x544e47,       // Weathered basalt / shadow stones
    stoneMortar: 0x48423b,     // Recessed mortar joints
    stoneCoping: 0x867e74,     // Continuous stone water-table ledge
    stoneStep: 0x8a8378,       // Chiseled entrance stone slabs
    doorWood: 0x5c3d25,        // Arched plank entrance door
    windowFrame: 0x3d2817,     // Leaded window surrounds
    windowGlass: 0x212a32,     // Deep reflective window glass
    shutterWood: 0x714e30,     // Exterior wooden shutters
    ironHardware: 0x232325,    // Wrought iron hinges, straps, knocker
    soilGround: 0x483a2c,      // Dirt pathway & garden bed
    grassMound: 0x5c8032,      // Meadow green hillock
    grassDry: 0x7a8e3d,        // Faded edge grass
    foliageDark: 0x375422,     // Ivy & deep shrub leaves
    foliageMid: 0x4c752c,      // Vibrant rose bush leaves
    foliageLight: 0x68923a,    // New leaf flakes & climbing tendrils
    flowerWhite: 0xf6f6f2,     // Wild rose petals
    flowerPink: 0xdd6f83,      // Planter blossoms
    flowerYellow: 0xe8b838,    // Rose stamen centers
    flowerRed: 0xb9322c,       // Harvest red apples & berries
    appleGreen: 0x7ca836,      // Harvest green apples
    linenCloth: 0xe9e5dc,      // Billowing clothesline linen
    ropeHemp: 0x8f7c62,        // Sagging twisted hemp rope
    logHeartwood: 0xbaa485,    // Firewood heartwood
    logRing: 0x8c785b,         // Firewood annular growth ring
    logBark: 0x483626,         // Outer rough tree bark
    lanternLight: 0xffa033,    // Warm amber lantern flame
  };

  const matTimber = new THREE.MeshStandardMaterial({ color: C.timberDark, roughness: 0.88, metalness: 0.02 });
  const matTimberPeg = new THREE.MeshStandardMaterial({ color: C.timberPeg, roughness: 0.95, metalness: 0.0 });
  const matPlaster = new THREE.MeshStandardMaterial({ color: C.plasterWall, roughness: 0.92, metalness: 0.0 });
  const matPlasterShade = new THREE.MeshStandardMaterial({ color: C.plasterShade, roughness: 0.94, metalness: 0.0 });

  const matTile0 = new THREE.MeshStandardMaterial({ color: C.tileShade0, roughness: 0.82, metalness: 0.02 });
  const matTile1 = new THREE.MeshStandardMaterial({ color: C.tileShade1, roughness: 0.82, metalness: 0.02 });
  const matTile2 = new THREE.MeshStandardMaterial({ color: C.tileShade2, roughness: 0.82, metalness: 0.02 });
  const matTile3 = new THREE.MeshStandardMaterial({ color: C.tileShade3, roughness: 0.82, metalness: 0.02 });
  const matTile4 = new THREE.MeshStandardMaterial({ color: C.tileShade4, roughness: 0.82, metalness: 0.02 });
  const tileMats = [matTile0, matTile1, matTile2, matTile3, matTile4];
  const matTileRidge = new THREE.MeshStandardMaterial({ color: C.tileRidge, roughness: 0.78, metalness: 0.02 });

  const matStonePlinth = new THREE.MeshStandardMaterial({ color: C.stonePlinth, roughness: 0.95, metalness: 0.02 });
  const matStoneLight = new THREE.MeshStandardMaterial({ color: C.stoneLight, roughness: 0.92, metalness: 0.02 });
  const matStoneDark = new THREE.MeshStandardMaterial({ color: C.stoneDark, roughness: 0.95, metalness: 0.02 });
  const matStoneMid = new THREE.MeshStandardMaterial({ color: 0x645e56, roughness: 0.94, metalness: 0.02 });
  const matStoneCoping = new THREE.MeshStandardMaterial({ color: C.stoneCoping, roughness: 0.90, metalness: 0.02 });
  const matStoneStep = new THREE.MeshStandardMaterial({ color: C.stoneStep, roughness: 0.92, metalness: 0.02 });

  const matDoor = new THREE.MeshStandardMaterial({ color: C.doorWood, roughness: 0.84, metalness: 0.02 });
  const matShutter = new THREE.MeshStandardMaterial({ color: C.shutterWood, roughness: 0.86, metalness: 0.02 });
  // Glass is a dark, low-metal pane: a mirror-like pane (high metalness, low roughness) sparkles
  // and crawls as the camera moves.
  const matGlass = new THREE.MeshStandardMaterial({ color: 0x1b2530, roughness: 0.2, metalness: 0.25, envMapIntensity: 0.9 });
  const matIron = new THREE.MeshStandardMaterial({ color: C.ironHardware, roughness: 0.72, metalness: 0.78 });

  const matFoliageDark = new THREE.MeshStandardMaterial({ color: C.foliageDark, roughness: 0.75, metalness: 0.0, flatShading: true });
  const matFoliageMid = new THREE.MeshStandardMaterial({ color: C.foliageMid, roughness: 0.72, metalness: 0.0, flatShading: true });
  const matFoliageLight = new THREE.MeshStandardMaterial({ color: C.foliageLight, roughness: 0.70, metalness: 0.0, flatShading: true });
  const leafMats = [matFoliageDark, matFoliageMid, matFoliageLight];

  const matRoseWhite = new THREE.MeshStandardMaterial({ color: C.flowerWhite, roughness: 0.65, metalness: 0.0 });
  const matRoseCenter = new THREE.MeshStandardMaterial({ color: C.flowerYellow, roughness: 0.60, metalness: 0.0 });
  const matFlowerPink = new THREE.MeshStandardMaterial({ color: C.flowerPink, roughness: 0.65, metalness: 0.0 });
  const flowerMats = [matRoseWhite, matFlowerPink, matRoseCenter];

  const matAppleRed = new THREE.MeshStandardMaterial({ color: C.flowerRed, roughness: 0.55, metalness: 0.05 });
  const matAppleGreen = new THREE.MeshStandardMaterial({ color: C.appleGreen, roughness: 0.55, metalness: 0.05 });

  const matLinen = new THREE.MeshStandardMaterial({ color: C.linenCloth, roughness: 0.92, metalness: 0.0, side: THREE.DoubleSide });
  const matRope = new THREE.MeshStandardMaterial({ color: C.ropeHemp, roughness: 0.96, metalness: 0.0 });

  const matLogHeart = new THREE.MeshStandardMaterial({ color: C.logHeartwood, roughness: 0.88, metalness: 0.02 });
  const matLogRing = new THREE.MeshStandardMaterial({ color: C.logRing, roughness: 0.90, metalness: 0.02 });
  const matLogBark = new THREE.MeshStandardMaterial({ color: C.logBark, roughness: 0.96, metalness: 0.02 });

  // ---------------------------------------------------------------------------
  // Procedural surface shading for the building body. World-space value noise is injected into
  // MeshStandardMaterial: albedo mottling, broad tinted patches, grime rising from a height, a
  // roughness wobble and a low relief. Nothing is textured, so there are no UV seams or stretch on
  // the long wall boxes. Every term fades out once its noise cell shrinks toward a pixel, which is
  // what keeps the surfaces from shimmering as the camera moves.
  // ---------------------------------------------------------------------------
  interface SurfaceParams {
    scale: number;        // mottling frequency (cells per metre)
    variation: number;    // albedo mottling amplitude
    patch: number;        // strength of broad tinted patches
    patchTint: number;
    grime: number;        // strength of grime below grimeHigh
    grimeLow: number;     // world height where grime is at full strength
    grimeHigh: number;    // world height where grime has faded out
    grimeTint: number;
    bump: number;         // relief amplitude in metres
    bumpScale: number;    // relief frequency (cells per metre)
    roughnessVar: number;
  }

  const SURFACE_FRAG_PARS = /* glsl */ `
    varying vec3 vPsWorld;
    uniform float uPsScale, uPsVar, uPsPatch, uPsGrime, uPsGrimeLo, uPsGrimeHi, uPsBump, uPsBumpScale, uPsRoughVar;
    uniform vec3 uPsPatchTint, uPsGrimeTint;
    float psHash( vec3 p ) {
      p = fract( p * 0.3183099 + 0.1 );
      p *= 17.0;
      return fract( p.x * p.y * p.z * ( p.x + p.y + p.z ) );
    }
    float psNoise( vec3 x ) {
      vec3 i = floor( x );
      vec3 f = fract( x );
      f = f * f * ( 3.0 - 2.0 * f );
      return mix(
        mix( mix( psHash( i ), psHash( i + vec3( 1.0, 0.0, 0.0 ) ), f.x ),
             mix( psHash( i + vec3( 0.0, 1.0, 0.0 ) ), psHash( i + vec3( 1.0, 1.0, 0.0 ) ), f.x ), f.y ),
        mix( mix( psHash( i + vec3( 0.0, 0.0, 1.0 ) ), psHash( i + vec3( 1.0, 0.0, 1.0 ) ), f.x ),
             mix( psHash( i + vec3( 0.0, 1.0, 1.0 ) ), psHash( i + vec3( 1.0, 1.0, 1.0 ) ), f.x ), f.y ), f.z );
    }
    // Four octaves; each fades as its cells approach pixel size (footprint = pixel / cell).
    float psFbm( vec3 p, float footprint ) {
      float sum = 0.0;
      float norm = 0.0;
      float amp = 0.5;
      for ( int i = 0; i < 4; i ++ ) {
        float w = amp * ( 1.0 - smoothstep( 0.25, 0.75, footprint ) );
        sum += w * psNoise( p );
        norm += w;
        p = p * 2.03 + vec3( 17.1, 3.7, 9.2 );
        footprint *= 2.03;
        amp *= 0.5;
      }
      return norm > 0.0 ? sum / norm : 0.5;
    }`;

  const SURFACE_COLOR = /* glsl */ `
    #include <color_fragment>
    float psFoot = length( fwidth( vPsWorld ) ) * uPsScale;
    float psN = psFbm( vPsWorld * uPsScale, psFoot );
    float psLarge = psNoise( vPsWorld * uPsScale * 0.23 + vec3( 5.3, 1.7, 8.1 ) );
    vec3 psCol = diffuseColor.rgb * ( 1.0 + uPsVar * ( psN - 0.5 ) * 2.0 );
    psCol = mix( psCol, psCol * uPsPatchTint, smoothstep( 0.55, 0.85, psLarge ) * uPsPatch );
    float psG = ( 1.0 - smoothstep( uPsGrimeLo, uPsGrimeHi, vPsWorld.y ) ) * uPsGrime;
    psCol = mix( psCol, psCol * uPsGrimeTint, clamp( psG * ( 0.55 + 0.9 * ( psN - 0.5 ) ), 0.0, 1.0 ) );
    diffuseColor.rgb = psCol;`;

  const SURFACE_ROUGHNESS = /* glsl */ `
    #include <roughnessmap_fragment>
    roughnessFactor = clamp( roughnessFactor + uPsRoughVar * ( psN - 0.5 ), 0.04, 1.0 );`;

  // Derivative bump in world units (unnormalised screen-space tangents), so the relief reads the
  // same at any distance; computed unconditionally so the derivatives stay defined in the quad.
  const SURFACE_NORMAL = /* glsl */ `
    #include <normal_fragment_maps>
    {
      float psBF = length( fwidth( vPsWorld ) ) * uPsBumpScale;
      float psFade = 1.0 - smoothstep( 0.15, 0.5, psBF );
      float psH = psFbm( vPsWorld * uPsBumpScale, psBF );
      vec3 psDpx = dFdx( - vViewPosition );
      vec3 psDpy = dFdy( - vViewPosition );
      vec3 psR1 = cross( psDpy, normal );
      vec3 psR2 = cross( normal, psDpx );
      float psDet = dot( psDpx, psR1 ) * faceDirection;
      vec3 psGrad = sign( psDet ) * ( dFdx( psH ) * psR1 + dFdy( psH ) * psR2 );
      normal = normalize( abs( psDet ) * normal - uPsBump * psFade * psGrad );
    }`;

  function applySurface(material: THREE.MeshStandardMaterial, p: SurfaceParams): void {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uPsScale = { value: p.scale };
      shader.uniforms.uPsVar = { value: p.variation };
      shader.uniforms.uPsPatch = { value: p.patch };
      shader.uniforms.uPsPatchTint = { value: new THREE.Color(p.patchTint) };
      shader.uniforms.uPsGrime = { value: p.grime };
      shader.uniforms.uPsGrimeLo = { value: p.grimeLow };
      shader.uniforms.uPsGrimeHi = { value: p.grimeHigh };
      shader.uniforms.uPsGrimeTint = { value: new THREE.Color(p.grimeTint) };
      shader.uniforms.uPsBump = { value: p.bump };
      shader.uniforms.uPsBumpScale = { value: p.bumpScale };
      shader.uniforms.uPsRoughVar = { value: p.roughnessVar };
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vPsWorld;')
        .replace(
          '#include <project_vertex>',
          `#include <project_vertex>
          vec4 psWorld = vec4( transformed, 1.0 );
          #ifdef USE_INSTANCING
            psWorld = instanceMatrix * psWorld;
          #endif
          vPsWorld = ( modelMatrix * psWorld ).xyz;`,
        );
      shader.fragmentShader = shader.fragmentShader
        .replace('#include <common>', `#include <common>\n${SURFACE_FRAG_PARS}`)
        .replace('#include <color_fragment>', SURFACE_COLOR)
        .replace('#include <roughnessmap_fragment>', SURFACE_ROUGHNESS)
        .replace('#include <normal_fragment_maps>', SURFACE_NORMAL);
    };
    // One shared program for every surfaced material; their parameters live in uniforms.
    material.customProgramCacheKey = () => 'cottage-surface-v1';
  }

  const plasterSurface: SurfaceParams = {
    scale: 1.3, variation: 0.06, patch: 0.35, patchTint: 0xece2cf,
    grime: 0.55, grimeLow: 0.9, grimeHigh: 1.75, grimeTint: 0xb3a58f,
    bump: 0.012, bumpScale: 7, roughnessVar: 0.1,
  };
  const timberSurface: SurfaceParams = {
    scale: 4.5, variation: 0.18, patch: 0.3, patchTint: 0xc8bfb4,
    grime: 0.0, grimeLow: 0, grimeHigh: 1, grimeTint: 0xffffff,
    bump: 0.006, bumpScale: 14, roughnessVar: 0.12,
  };
  const stoneSurface: SurfaceParams = {
    scale: 3.2, variation: 0.12, patch: 0.4, patchTint: 0xd8e0cc,
    grime: 0.35, grimeLow: 0.0, grimeHigh: 0.45, grimeTint: 0xb3ad99,
    bump: 0.02, bumpScale: 9, roughnessVar: 0.1,
  };
  const tileSurface: SurfaceParams = {
    scale: 3.5, variation: 0.12, patch: 0.45, patchTint: 0xc7cc9e,
    grime: 0.0, grimeLow: 0, grimeHigh: 1, grimeTint: 0xffffff,
    bump: 0.004, bumpScale: 12, roughnessVar: 0.1,
  };
  for (const m of [matPlaster, matPlasterShade]) applySurface(m, plasterSurface);
  for (const m of [matTimber, matDoor, matShutter]) applySurface(m, timberSurface);
  for (const m of [matStonePlinth, matStoneLight, matStoneDark, matStoneMid, matStoneCoping, matStoneStep]) {
    applySurface(m, stoneSurface);
  }
  for (const m of [...tileMats, matTileRidge]) applySurface(m, tileSurface);

  // ---------------------------------------------------------------------------
  // Runtime Node Registries & Physics Proxies
  // ---------------------------------------------------------------------------
  const runtimeNodes: Record<string, THREE.Object3D> = {};
  const colliders: Array<{ name: string; box: THREE.Box3 }> = [];

  // Curved clay shingle tile. One geometry is shared by every tile on every roof.
  const clayTileGeo = (() => {
    const tileW = 0.28;
    const tileL = 0.38;
    const tileT = 0.038;
    const shape = new THREE.Shape();
    const halfW = tileW / 2;
    const curveH = 0.032;

    shape.moveTo(-halfW, 0);
    shape.quadraticCurveTo(0, curveH, halfW, 0);
    shape.lineTo(halfW, -tileT);
    shape.quadraticCurveTo(0, curveH - tileT, -halfW, -tileT);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: tileL,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.012,
      bevelThickness: 0.012,
    });
    geom.center();
    return geom;
  })();

  function createClayTileMesh(matIndex: number): THREE.Mesh {
    return applyShadow(new THREE.Mesh(clayTileGeo, tileMats[matIndex % tileMats.length]));
  }

  // Casement window assembly. Local +Z points out of the wall and z = 0 is the wall face. The frame
  // is a ring around a recessed pane, and every layer (pane, muntins, frame face, sill, shutters)
  // sits at its own depth. A solid frame slab behind a pane coplanar with its face is what made the
  // old windows z-fight.
  const flowerLeafGeo = new THREE.DodecahedronGeometry(0.07, 0);
  const blossomGeo = new THREE.DodecahedronGeometry(0.038, 0);
  function createWindow(w: number, h: number, opts: { shutters?: boolean; flowerBox?: boolean } = {}): THREE.Group {
    const g = new THREE.Group();
    const fw = 0.07; // frame face width
    const fd = 0.08; // frame depth proud of the wall

    const sideGeo = new THREE.BoxGeometry(fw, h + 2 * fw, fd);
    const railGeo = new THREE.BoxGeometry(w, fw, fd);
    for (const sx of [-1, 1]) {
      const side = applyShadow(new THREE.Mesh(sideGeo, matTimber));
      side.position.set(sx * (w / 2 + fw / 2), 0, fd / 2);
      const rail = applyShadow(new THREE.Mesh(railGeo, matTimber));
      rail.position.set(0, sx * (h / 2 + fw / 2), fd / 2);
      g.add(side, rail);
    }

    const pane = new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, h - 0.004, 0.012), matGlass);
    pane.position.z = 0.03;
    const muntinV = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.035, h - 0.004, 0.02), matTimber));
    muntinV.position.z = 0.048;
    const muntinH = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w - 0.004, 0.035, 0.022), matTimber));
    muntinH.position.z = 0.051;
    g.add(pane, muntinV, muntinH);

    const sillY = -h / 2 - fw - 0.025;
    const sill = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w + 2 * fw + 0.08, 0.05, fd + 0.06), matTimber));
    sill.position.set(0, sillY, (fd + 0.06) / 2);
    g.add(sill);

    if (opts.shutters !== false) {
      // Board-and-batten leaves hinged on the frame's outer edge and swung back towards the wall
      const sw = w * 0.5;
      const sh = h + 2 * fw - 0.02;
      const leafGeo = new THREE.BoxGeometry(sw, sh, 0.035);
      const battenGeo = new THREE.BoxGeometry(sw - 0.05, 0.05, 0.015);
      const braceLen = Math.hypot(sw - 0.08, sh - 0.26);
      const braceGeo = new THREE.BoxGeometry(0.045, braceLen, 0.015);
      for (const sx of [-1, 1]) {
        const hinge = new THREE.Group();
        hinge.position.set(sx * (w / 2 + fw), 0, 0.02);
        hinge.rotation.y = -sx * 0.22;
        const leaf = applyShadow(new THREE.Mesh(leafGeo, matShutter));
        leaf.position.set(sx * (sw / 2 + 0.005), 0, 0.0175);
        hinge.add(leaf);
        for (const by of [sh / 2 - 0.09, -sh / 2 + 0.09]) {
          const batten = applyShadow(new THREE.Mesh(battenGeo, matTimber));
          batten.position.set(sx * (sw / 2 + 0.005), by, 0.0425);
          hinge.add(batten);
        }
        const brace = applyShadow(new THREE.Mesh(braceGeo, matTimber));
        brace.position.set(sx * (sw / 2 + 0.005), 0, 0.044);
        brace.rotation.z = -sx * Math.atan2(sw - 0.08, sh - 0.26); // rises away from the hinge
        hinge.add(brace);
        g.add(hinge);
      }
    }

    if (opts.flowerBox) {
      const bw = w + 2 * fw + 0.04;
      const boxY = sillY - 0.025 - 0.01 - 0.08;
      const box = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bw, 0.16, 0.2), matDoor));
      box.position.set(0, boxY, 0.12);
      g.add(box);
      const count = Math.max(3, Math.round(bw / 0.12));
      for (let i = 0; i < count; i++) {
        const x = -bw / 2 + 0.06 + (i * (bw - 0.12)) / (count - 1);
        const leaf = applyShadow(new THREE.Mesh(flowerLeafGeo, leafMats[i % leafMats.length]));
        leaf.position.set(x, boxY + 0.1 + (i % 2) * 0.02, 0.1 + (i % 3) * 0.03);
        leaf.scale.set(1, 0.75, 0.9);
        leaf.rotation.set(i * 0.7, i * 1.3, 0);
        g.add(leaf);
        const bloom = applyShadow(new THREE.Mesh(blossomGeo, flowerMats[i % flowerMats.length]));
        bloom.position.set(x + 0.025, boxY + 0.16 + (i % 2) * 0.025, 0.15);
        g.add(bloom);
      }
    }
    return g;
  }

  // Main-body frontage (spec: componentTree 'body'.dimensions.groundWidth). The plinth ledge and the
  // jettied upper storey are fixed offsets from it; the gable rise, chimney, dormer and corner-mounted
  // props below are derived from it rather than written as absolute coordinates.
  const bodyWidth = 6.76;

  // Entrance axis and porch frame width (spec: componentTree 'porch'). Hoisted because the plinth
  // coursing is laid out around the porch landing.
  const porchBaseX = 0.62;
  const porchWidth = 2.93;
  const porchLandingHalfW = porchWidth / 2 + 0.135;

  // The asset carries no terrain of its own: everything stands on y = 0 so it drops onto any ground.

  // ---------------------------------------------------------------------------
  // 2. STONE FOUNDATION GROUP (Multi-Course Fieldstone & Cellar Window)
  // ---------------------------------------------------------------------------
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'foundation-group';
  root.add(foundationGroup);
  runtimeNodes['foundation'] = foundationGroup;

  const fWidth = bodyWidth + 0.13;
  const fDepth = 3.55;
  const fHeight = 0.85;

  // Base stone plinth core
  const basePlinth = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(fWidth, fHeight, fDepth), matStonePlinth));
  basePlinth.position.set(0, fHeight / 2, 0);
  foundationGroup.add(basePlinth);

  // Continuous stone water-table coping ledge running along top edge
  const copingGeoH = new THREE.BoxGeometry(fWidth + 0.12, 0.09, 0.14);
  const copingGeoV = new THREE.BoxGeometry(0.14, 0.09, fDepth + 0.12);
  const copeFront = applyShadow(new THREE.Mesh(copingGeoH, matStoneCoping));
  copeFront.position.set(0, fHeight + 0.02, fDepth / 2 + 0.04);
  const copeRear = applyShadow(new THREE.Mesh(copingGeoH, matStoneCoping));
  copeRear.position.set(0, fHeight + 0.02, -fDepth / 2 - 0.04);
  const copeLeft = applyShadow(new THREE.Mesh(copingGeoV, matStoneCoping));
  copeLeft.position.set(-fWidth / 2 - 0.04, fHeight + 0.02, 0);
  const copeRight = applyShadow(new THREE.Mesh(copingGeoV, matStoneCoping));
  copeRight.position.set(fWidth / 2 + 0.04, fHeight + 0.02, 0);
  foundationGroup.add(copeFront, copeRear, copeLeft, copeRight);

  // 2 Full Courses of Rounded Fieldstone & Ashlar Blocks wrapping perimeter. Blocks are narrower
  // than their pitch so neighbours never overlap (coplanar overlaps flicker); the plinth core shows
  // through the joints as mortar, and a few millimetres of depth jitter reads as hand-laid.
  const stoneMatGrid = [matStoneLight, matStoneDark, matStoneMid, matStonePlinth];
  const stonePitch = 0.46;
  const stoneCols = Math.round((fWidth - 0.56) / stonePitch) + 1;
  const stoneH = 0.28;
  const landingMinX = porchBaseX - porchLandingHalfW - 0.05;
  const landingMaxX = porchBaseX + porchLandingHalfW + 0.05;
  // Front Face Blocks
  for (let row = 0; row < 2; row++) {
    const yPos = 0.22 + row * 0.38;
    for (let col = 0; col < stoneCols; col++) {
      const xPos = -fWidth / 2 + 0.28 + col * stonePitch;
      const stoneW = 0.38 + ((col + row) % 3) * 0.025;
      if (xPos + stoneW / 2 > landingMinX && xPos - stoneW / 2 < landingMaxX) continue; // behind the porch landing
      const stoneMesh = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stoneW, stoneH, 0.12), stoneMatGrid[(col * 2 + row) % 4]));
      stoneMesh.position.set(xPos, yPos, fDepth / 2 + 0.05 + ((col * 7 + row * 3) % 5) * 0.003);
      foundationGroup.add(stoneMesh);
    }
  }

  // Right Face Blocks
  for (let row = 0; row < 2; row++) {
    const yPos = 0.22 + row * 0.38;
    for (let col = 0; col < 8; col++) {
      const stoneW = 0.36 + ((col * 3 + row) % 3) * 0.025;
      const stoneMesh = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, stoneH, stoneW), stoneMatGrid[(col + row * 2) % 4]));
      const zPos = -fDepth / 2 + 0.26 + col * 0.44;
      stoneMesh.position.set(fWidth / 2 + 0.05 + ((col * 5 + row) % 5) * 0.003, yPos, zPos);
      foundationGroup.add(stoneMesh);
    }
  }

  // Rear Face Blocks with Recessed Cellar Window
  for (let row = 0; row < 2; row++) {
    const yPos = 0.22 + row * 0.38;
    for (let col = 0; col < stoneCols; col++) {
      const xPos = -fWidth / 2 + 0.28 + col * stonePitch;
      // Cellar window is centred on x = 0
      if (row === 0 && Math.abs(xPos) < 0.2) continue;
      const stoneW = 0.38 + ((col + row * 3) % 3) * 0.025;
      const stoneMesh = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stoneW, stoneH, 0.12), stoneMatGrid[(col * 3 + row) % 4]));
      stoneMesh.position.set(xPos, yPos, -fDepth / 2 - 0.05 - ((col * 3 + row * 2) % 5) * 0.003);
      foundationGroup.add(stoneMesh);
    }
  }

  // Authentic Recessed Cellar Window in Rear Foundation (as seen in rear.png)
  const cellarGroup = new THREE.Group();
  cellarGroup.position.set(0, 0.28, -fDepth / 2 - 0.02);
  const cellarFrame = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.56, 0.42, 0.14), matStoneDark));
  const cellarLintel = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.66, 0.12, 0.18), matStoneLight));
  cellarLintel.position.y = 0.24;
  const cellarVoid = new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.26, 0.06), matIron);
  cellarVoid.position.z = -0.04;
  cellarGroup.add(cellarFrame, cellarLintel, cellarVoid);
  // Cross muntin / iron bars
  for (let b = -1; b <= 1; b++) {
    const bar = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), matIron));
    bar.position.set(b * 0.11, 0, 0.01);
    cellarGroup.add(bar);
  }
  const horizBar = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.36, 6), matIron));
  horizBar.rotation.z = Math.PI / 2;
  horizBar.position.set(0, 0, 0.01);
  cellarGroup.add(horizBar);
  foundationGroup.add(cellarGroup);

  // ---------------------------------------------------------------------------
  // 3. MAIN COTTAGE BODY (Warm Lime Plaster Infill & Jettied Storey)
  // ---------------------------------------------------------------------------
  const bodyGroup = new THREE.Group();
  bodyGroup.name = 'cottage-body';
  root.add(bodyGroup);
  runtimeNodes['body'] = bodyGroup;

  const gWidth = bodyWidth;
  const gDepth = 3.42;
  const gHeight = 2.15;
  const gY = fHeight + gHeight / 2;

  // Ground Floor Plaster Core (recessed inside timber frames)
  const groundBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(gWidth, gHeight, gDepth), matPlaster));
  groundBody.position.set(0, gY, 0);
  bodyGroup.add(groundBody);

  // Upper Storey (Jettied overhang extending forward and rearward by 0.18m)
  const uWidth = bodyWidth + 0.30;
  const uDepth = 3.78;
  const uHeight = 1.38;
  const uY = fHeight + gHeight + uHeight / 2;

  const upperBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(uWidth, uHeight, uDepth), matPlasterShade));
  upperBody.position.set(0, uY, 0);
  bodyGroup.add(upperBody);

  // Facade timber layout, shared by the studs, corbels and window placement. Front studs frame the
  // porch door bay symmetrically; rear studs split the wall into three bays with a window centred in
  // each outer one.
  const frontGroundStuds = [porchBaseX - 0.87, porchBaseX + 0.87];
  const frontUpperStuds = [-1.815, ...frontGroundStuds];
  const rearStuds = [-2.65, -0.75, 0.75, 2.65];

  // Carved Timber Corbel Brackets supporting the jettied floor overhang, one under each upper stud
  const corbelGeo = new THREE.BoxGeometry(0.14, 0.28, 0.24);
  for (const cx of [-uWidth / 2 + 0.35, ...frontUpperStuds, uWidth / 2 - 0.35]) {
    const cbFront = applyShadow(new THREE.Mesh(corbelGeo, matTimber));
    cbFront.position.set(cx, fHeight + gHeight - 0.14, gDepth / 2 + 0.08);
    bodyGroup.add(cbFront);
  }
  for (const cx of [-uWidth / 2 + 0.35, ...rearStuds, uWidth / 2 - 0.35]) {
    const cbRear = applyShadow(new THREE.Mesh(corbelGeo, matTimber));
    cbRear.position.set(cx, fHeight + gHeight - 0.14, -gDepth / 2 - 0.08);
    bodyGroup.add(cbRear);
  }

  // Front & Rear Gables (steep ~43° pitch). The rise follows the span so the pitch survives a width change.
  const gableRise = (uWidth / 2) * (1.65 / 1.76);
  const gablePitch = Math.atan2(gableRise, uWidth / 2);
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-uWidth / 2, 0);
  gableShape.lineTo(uWidth / 2, 0);
  gableShape.lineTo(0, gableRise);
  gableShape.closePath();

  // The gable plaster sits 4cm behind the timber face. Flush with the eave plate, the two faces
  // were coplanar along the gable base and z-fought as a crawling line.
  const gableFaceZ = uDepth / 2 + 0.04;
  const gableExtrudeSettings = { depth: 0.16, bevelEnabled: false };
  const frontGable = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(gableShape, gableExtrudeSettings), matPlaster));
  frontGable.position.set(0, uY + uHeight / 2, gableFaceZ - 0.16);
  bodyGroup.add(frontGable);

  const rearGable = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(gableShape, gableExtrudeSettings), matPlaster));
  rearGable.position.set(0, uY + uHeight / 2, -gableFaceZ);
  bodyGroup.add(rearGable);

  // ---------------------------------------------------------------------------
  // ---------------------------------------------------------------------------
  // 4. TIMBER FRAMING (Fachwerk System, Eave Knee Braces & Gable King Posts)
  // Perfectly aligned with ground foundation, jettied storey, and roof plate.
  // ---------------------------------------------------------------------------
  const timberGroup = new THREE.Group();
  timberGroup.name = 'timber-framing';
  root.add(timberGroup);
  runtimeNodes['timbers'] = timberGroup;

  const beamW = 0.16;
  const beamD = 0.16;

  function addPeg(x: number, y: number, z: number, axis: 'x' | 'z' = 'z') {
    const peg = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.06, 6), matTimberPeg));
    if (axis === 'z') peg.rotation.x = Math.PI / 2;
    if (axis === 'x') peg.rotation.z = Math.PI / 2;
    peg.position.set(x, y, z);
    timberGroup.add(peg);
  }

  // Ground Floor Horizontal Sills (resting directly on stone plinth water table)
  const sillY = fHeight + beamW / 2;
  const sillFront = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(gWidth + beamW, beamW, beamD), matTimber));
  sillFront.position.set(0, sillY, gDepth / 2);
  const sillRear = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(gWidth + beamW, beamW, beamD), matTimber));
  sillRear.position.set(0, sillY, -gDepth / 2);
  const sillLeft = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, beamW, gDepth - beamW), matTimber));
  sillLeft.position.set(-gWidth / 2, sillY, 0);
  const sillRight = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, beamW, gDepth - beamW), matTimber));
  sillRight.position.set(gWidth / 2, sillY, 0);
  timberGroup.add(sillFront, sillRear, sillLeft, sillRight);

  // Mid-Girt / Bressummer Beams below jettied storey (Y = fHeight + gHeight = 3.0m)
  const bressY = fHeight + gHeight;
  const bressH = beamW * 1.25;
  const bressFront = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(uWidth + beamW, bressH, beamD), matTimber));
  bressFront.position.set(0, bressY, uDepth / 2);
  const bressRear = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(uWidth + beamW, bressH, beamD), matTimber));
  bressRear.position.set(0, bressY, -uDepth / 2);
  const bressRight = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, bressH, uDepth - beamW), matTimber));
  bressRight.position.set(uWidth / 2, bressY, 0);
  const bressLeft = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, bressH, uDepth - beamW), matTimber));
  bressLeft.position.set(-uWidth / 2, bressY, 0);
  timberGroup.add(bressFront, bressRear, bressRight, bressLeft);

  // Ground Floor Vertical Posts (flush coplanar with sills and bressummers)
  const gPostGeo = new THREE.BoxGeometry(beamW, gHeight, beamD);
  const gPostPositions = [
    { x: -gWidth / 2, z: gDepth / 2 },
    { x: gWidth / 2, z: gDepth / 2 },
    { x: -gWidth / 2, z: -gDepth / 2 },
    { x: gWidth / 2, z: -gDepth / 2 },
    // Intermediate posts dividing each side wall into two window bays
    { x: gWidth / 2, z: 0.0 },
    { x: -gWidth / 2, z: 0.0 },
    // Door-bay studs either side of the entrance, and the rear bay studs
    ...frontGroundStuds.map((x) => ({ x, z: gDepth / 2 })),
    ...rearStuds.map((x) => ({ x, z: -gDepth / 2 })),
  ];
  for (const gp of gPostPositions) {
    const post = applyShadow(new THREE.Mesh(gPostGeo, matTimber));
    post.position.set(gp.x, gY, gp.z);
    timberGroup.add(post);
    addPeg(gp.x, gY - gHeight / 2 + 0.18, gp.z + (gp.z >= 0 ? 0.08 : -0.08), 'z');
    addPeg(gp.x, gY + gHeight / 2 - 0.18, gp.z + (gp.z >= 0 ? 0.08 : -0.08), 'z');
  }

  // Upper Floor Wall Plate / Eave Tie Beams (horizontal beams at top of upper storey)
  const topPlateY = fHeight + gHeight + uHeight;
  const plateFront = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(uWidth + beamW, beamW, beamD), matTimber));
  plateFront.position.set(0, topPlateY, uDepth / 2);
  const plateRear = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(uWidth + beamW, beamW, beamD), matTimber));
  plateRear.position.set(0, topPlateY, -uDepth / 2);
  const plateLeft = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, beamW, uDepth - beamW), matTimber));
  plateLeft.position.set(-uWidth / 2, topPlateY, 0);
  const plateRight = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, beamW, uDepth - beamW), matTimber));
  plateRight.position.set(uWidth / 2, topPlateY, 0);
  timberGroup.add(plateFront, plateRear, plateLeft, plateRight);

  // Upper Floor Vertical Posts (aligned with bressummer and top plate)
  const uPostGeo = new THREE.BoxGeometry(beamW, uHeight, beamD);
  const uPostPositions = [
    { x: -uWidth / 2, z: uDepth / 2 },
    { x: uWidth / 2, z: uDepth / 2 },
    { x: -uWidth / 2, z: -uDepth / 2 },
    { x: uWidth / 2, z: -uDepth / 2 },
    // Intermediate posts on both side walls (aligned with the ground intermediates)
    { x: uWidth / 2, z: 0.0 },
    { x: -uWidth / 2, z: 0.0 },
    // Front and rear studs continue the ground-storey lines up through the jetty
    ...frontUpperStuds.map((x) => ({ x, z: uDepth / 2 })),
    ...rearStuds.map((x) => ({ x, z: -uDepth / 2 })),
  ];
  for (const up of uPostPositions) {
    const post = applyShadow(new THREE.Mesh(uPostGeo, matTimber));
    post.position.set(up.x, uY, up.z);
    timberGroup.add(post);
    addPeg(up.x, uY - uHeight / 2 + 0.16, up.z + (up.z >= 0 ? 0.08 : -0.08), 'z');
    addPeg(up.x, uY + uHeight / 2 - 0.16, up.z + (up.z >= 0 ? 0.08 : -0.08), 'z');
  }

  // Diagonal braces in the outer panels of the jettied storey, running from the corner post's foot
  // to the neighbouring stud's head (flush with the post faces).
  function addWallBrace(x0: number, y0: number, x1: number, y1: number, z: number) {
    const len = Math.hypot(x1 - x0, y1 - y0);
    const brace = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(len, 0.12, 0.12), matTimber));
    brace.position.set((x0 + x1) / 2, (y0 + y1) / 2, z);
    brace.rotation.z = Math.atan2(y1 - y0, x1 - x0);
    timberGroup.add(brace);
  }
  const braceFootY = fHeight + gHeight + bressH / 2;
  const braceHeadY = fHeight + gHeight + uHeight - beamW / 2;
  const cornerInner = uWidth / 2 - beamW / 2;
  addWallBrace(-cornerInner, braceFootY, frontUpperStuds[0] - beamW / 2, braceHeadY, uDepth / 2 + 0.02);
  addWallBrace(cornerInner, braceFootY, frontUpperStuds[frontUpperStuds.length - 1] + beamW / 2, braceHeadY, uDepth / 2 + 0.02);
  addWallBrace(-cornerInner, braceFootY, rearStuds[0] - beamW / 2, braceHeadY, -uDepth / 2 - 0.02);
  addWallBrace(cornerInner, braceFootY, rearStuds[rearStuds.length - 1] + beamW / 2, braceHeadY, -uDepth / 2 - 0.02);

  // Underside of the main roof deck at a given distance from the ridge line, shared by everything
  // tucked under the eaves (rafter tails, purlin) so nothing pokes up through the tiles.
  // The roof deck overhangs 0.5m past the rafter line at the eave (a real overhang for the rafter
  // tails and the right-hand knee braces) but only 5cm at the ridge, so it cannot poke through the
  // ridge cap; the bargeboards likewise cross just above the apex.
  const rafterRun = Math.hypot(gableRise, uWidth / 2);
  const eaveOverhang = 0.5;
  const deckLen = rafterRun + eaveOverhang + 0.05;
  const deckShift = (eaveOverhang - 0.05) / 2;
  const bargeLen = rafterRun + eaveOverhang + 0.21;
  const bargeShift = (eaveOverhang - 0.21) / 2;
  const roofDeckCentreX = uWidth / 4 + 0.05;
  const roofDeckEaveX = roofDeckCentreX + (deckShift + deckLen / 2) * Math.cos(gablePitch);
  const roofDeckUndersideY = (xAbs: number) =>
    topPlateY + gableRise / 2 - 0.005 - (xAbs - roofDeckCentreX) * (gableRise / (uWidth / 2)) - 0.04 / Math.cos(gablePitch);
  const rafterTailLen = 0.6;
  const rafterTailSize = 0.1;
  const rafterTailCentreX = roofDeckEaveX - 0.02 - (rafterTailLen / 2) * Math.cos(gablePitch);
  const rafterTailDrop = rafterTailSize / Math.cos(gablePitch) + 0.004;

  // Right Eave Purlin & Diagonal Knee Braces carrying the rafter tails of the right overhang
  const eavePurlinX = roofDeckEaveX - 0.02 - beamD / 2;
  const eavePurlinY = roofDeckUndersideY(eavePurlinX) - rafterTailDrop - beamW / 2;
  const eavePurlin = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamD, beamW, uDepth + 0.52), matTimber));
  eavePurlin.position.set(eavePurlinX, eavePurlinY, 0);
  timberGroup.add(eavePurlin);

  // Each raking strut is seated in the right bressummer (its outer face flush with the beam's) and
  // housed 3cm into the purlin's underside on its centre line. Stopping short at mid-panel left the
  // feet resting on bare plaster.
  const eaveBraceT = 0.11;
  const braceTopX = eavePurlinX;
  const braceTopY = eavePurlinY - beamW / 2 + 0.03;
  const braceFootX = uWidth / 2 + beamD / 2 - eaveBraceT / 2;
  const braceFoot2Y = bressY + bressH / 2 - 0.02;
  const eaveBraceL = Math.hypot(braceTopX - braceFootX, braceTopY - braceFoot2Y);
  const eaveBraceGeo = new THREE.BoxGeometry(eaveBraceT, eaveBraceL, eaveBraceT);
  const eaveBraceZ = [1.35, 0.45, -0.45, -1.35];
  for (const bz of eaveBraceZ) {
    const brace = applyShadow(new THREE.Mesh(eaveBraceGeo, matTimber));
    brace.position.set((braceTopX + braceFootX) / 2, (braceTopY + braceFoot2Y) / 2, bz);
    brace.rotation.z = -Math.atan2(braceTopX - braceFootX, braceTopY - braceFoot2Y);
    timberGroup.add(brace);
  }

  // Gable Bargeboards, King Posts & Crossed Finials
  const bargeboardGeo = new THREE.BoxGeometry(bargeLen, beamW * 1.25, beamD * 1.15);
  const bargeCx = uWidth / 4 + bargeShift * Math.cos(gablePitch);
  const bargeCy = topPlateY + gableRise / 2 - bargeShift * Math.sin(gablePitch);

  function addGableFraming(zPos: number, postX: number) {
    // Left & Right Bargeboards meeting cleanly at apex
    const rLeft = applyShadow(new THREE.Mesh(bargeboardGeo, matTimber));
    rLeft.position.set(-bargeCx, bargeCy, zPos);
    rLeft.rotation.z = gablePitch;
    const rRight = applyShadow(new THREE.Mesh(bargeboardGeo, matTimber));
    rRight.position.set(bargeCx, bargeCy, zPos);
    rRight.rotation.z = -gablePitch;
    timberGroup.add(rLeft, rRight);

    // Crossed Folk Finials at Gable Apex
    const finialProngGeo = new THREE.BoxGeometry(beamW, 0.46, beamD);
    const finL = applyShadow(new THREE.Mesh(finialProngGeo, matTimber));
    finL.position.set(-0.05, topPlateY + gableRise + 0.07, zPos);
    finL.rotation.z = gablePitch * 0.85;
    const finR = applyShadow(new THREE.Mesh(finialProngGeo, matTimber));
    finR.position.set(0.05, topPlateY + gableRise + 0.07, zPos);
    finR.rotation.z = -gablePitch * 0.85;
    timberGroup.add(finL, finR);

    // Horizontal Collar Tie Beam
    const collarRise = gableRise * (0.78 / 1.65);
    const collarY = topPlateY + collarRise;
    const collarW = uWidth * (1 - collarRise / gableRise);
    const collar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(collarW, beamW, beamD), matTimber));
    collar.position.set(0, collarY, zPos);
    timberGroup.add(collar);

    // King Post connecting collar tie to apex
    const kingPostH = gableRise - collarRise;
    const kingPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamW, kingPostH, beamD), matTimber));
    kingPost.position.set(0, collarY + kingPostH / 2, zPos);
    timberGroup.add(kingPost);

    // Gable posts framing the gable window, from the eave plate up to the collar
    const gablePostH = collarY - beamW / 2 - (topPlateY + beamW / 2);
    for (const gx of [-postX, postX]) {
      const gp = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(beamW, gablePostH, beamD), matTimber));
      gp.position.set(gx, topPlateY + beamW / 2 + gablePostH / 2, zPos);
      timberGroup.add(gp);
    }
  }
  addGableFraming(uDepth / 2 + 0.08, 1.1);   // Front Gable
  addGableFraming(-uDepth / 2 - 0.08, 0.75); // Rear Gable (lines up with the rear bay studs)

  // ---------------------------------------------------------------------------
  // 5. MAIN GABLE ROOF & HAND-LAID CLAY SHINGLES
  // ---------------------------------------------------------------------------
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-structure';
  root.add(roofGroup);
  runtimeNodes['roof'] = roofGroup;

  const roofLength = uDepth + 0.8;
  const roofBaseY = uY + uHeight / 2;
  const ridgeY = roofBaseY + gableRise;
  const roofSlabY = roofBaseY + gableRise / 2 - 0.005;

  // Roof penetrations, anchored to the wall they belong to: the chimney stands just inside the left
  // wall line (hidden by the front gable until it clears the left slope, as in the reference front
  // view) and the dormer sits a fixed run in from the right eave.
  const chimneyBaseX = -uWidth / 2 + 0.75;
  const chimneyBaseZ = -0.35;
  const dormerBaseX = uWidth / 2 - 0.51;

  // Sub-roof underlayment boards
  const deckCx = roofDeckCentreX + deckShift * Math.cos(gablePitch);
  const deckCy = roofSlabY - deckShift * Math.sin(gablePitch);
  const leftSubRoof = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.08, roofLength), matTile4));
  leftSubRoof.position.set(-deckCx, deckCy, 0);
  leftSubRoof.rotation.z = gablePitch;
  const rightSubRoof = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(deckLen, 0.08, roofLength), matTile4));
  rightSubRoof.position.set(deckCx, deckCy, 0);
  rightSubRoof.rotation.z = -gablePitch;
  roofGroup.add(leftSubRoof, rightSubRoof);

  // Carved Rafter Tails projecting from the wall head, tucked just under the roof deck
  const rafterTailGeo = new THREE.BoxGeometry(rafterTailLen, rafterTailSize, rafterTailSize);
  const rafterTailY = roofDeckUndersideY(rafterTailCentreX) - rafterTailDrop / 2 - 0.002;
  const numRafterTails = 7;
  for (let i = 0; i < numRafterTails; i++) {
    const tz = -uDepth / 2 + 0.3 + i * ((uDepth - 0.6) / (numRafterTails - 1));
    const rtl = applyShadow(new THREE.Mesh(rafterTailGeo, matTimber));
    rtl.position.set(-rafterTailCentreX, rafterTailY, tz);
    rtl.rotation.z = gablePitch;
    const rtr = applyShadow(new THREE.Mesh(rafterTailGeo, matTimber));
    rtr.position.set(rafterTailCentreX, rafterTailY, tz);
    rtr.rotation.z = -gablePitch;
    roofGroup.add(rtl, rtr);
  }

  // Hand-Laid Clay Tile Grid (Left and Right Slopes); row count keeps the ~0.315m course pitch.
  // Staggered courses are clamped to the deck so every course stops in a straight line at the verge.
  const mainTileRows = Math.round(deckLen / 0.315);
  const mainTilesPerRow = 15;
  const tileSpacingZ = roofLength / mainTilesPerRow;
  const tileHalfLen = 0.2;
  const clampToDeck = (z: number) => Math.max(-roofLength / 2 + tileHalfLen, Math.min(roofLength / 2 - tileHalfLen, z));

  // Left Slope Tiles
  for (let r = 0; r < mainTileRows; r++) {
    const progress = (r + 0.5) / mainTileRows;
    const slopeOffset = (progress - 0.5) * deckLen * 1.02;
    for (let c = 0; c < mainTilesPerRow; c++) {
      const zOffset = (c - (mainTilesPerRow - 1) / 2) * tileSpacingZ;
      const stagger = (r % 2) * (tileSpacingZ * 0.45);
      const tile = createClayTileMesh((r * 2 + c * 3) % 5);

      const localX = -slopeOffset;
      const localY = 0.06 + (r % 2) * 0.015;
      const localZ = clampToDeck(zOffset + stagger);

      const cosP = Math.cos(gablePitch);
      const sinP = Math.sin(gablePitch);
      const wx = -deckCx + localX * cosP - localY * sinP;
      const wy = deckCy + localX * sinP + localY * cosP;

      // Skip tile footprint where chimney penetrates
      if (Math.abs(wx - chimneyBaseX) < 0.46 && Math.abs(localZ - chimneyBaseZ) < 0.45) {
        continue;
      }

      tile.position.set(wx, wy, localZ);
      tile.rotation.z = gablePitch + ((c % 3) - 1) * 0.02;
      tile.rotation.y = ((r % 3) - 1) * 0.03;
      roofGroup.add(tile);
    }
  }

  // Right Slope Tiles (skipping exact dormer footprint)
  for (let r = 0; r < mainTileRows; r++) {
    const progress = (r + 0.5) / mainTileRows;
    const slopeOffset = (progress - 0.5) * deckLen * 1.02;
    for (let c = 0; c < mainTilesPerRow; c++) {
      const zOffset = (c - (mainTilesPerRow - 1) / 2) * tileSpacingZ;

      const stagger = (r % 2) * (tileSpacingZ * 0.45);
      const tile = createClayTileMesh((r * 3 + c * 2) % 5);

      const localX = slopeOffset;
      const localY = 0.06 + (r % 2) * 0.015;
      const localZ = clampToDeck(zOffset + stagger);

      const cosP = Math.cos(-gablePitch);
      const sinP = Math.sin(-gablePitch);
      const wx = deckCx + localX * cosP - localY * sinP;
      const wy = deckCy + localX * sinP + localY * cosP;

      // Skip tile footprint strictly where dormer penetrates the slope
      if (Math.abs(wx - dormerBaseX) < 0.47 && localZ >= -0.62 && localZ <= 0.42) {
        continue;
      }

      tile.position.set(wx, wy, localZ);
      tile.rotation.z = -gablePitch + ((c % 3) - 1) * 0.02;
      tile.rotation.y = ((r % 3) - 1) * 0.03;
      roofGroup.add(tile);
    }
  }

  // Ridge Cap Tiles
  const ridgeTileGeo = new THREE.CylinderGeometry(0.14, 0.14, 0.32, 10, 1, false, 0, Math.PI);
  ridgeTileGeo.rotateX(Math.PI / 2);
  const numRidge = Math.floor(roofLength / 0.26);
  for (let i = 0; i < numRidge; i++) {
    const z = -roofLength / 2 + 0.14 + i * 0.26;
    const rTile = applyShadow(new THREE.Mesh(ridgeTileGeo, matTileRidge));
    rTile.position.set(0, ridgeY + 0.05, z);
    roofGroup.add(rTile);
  }

  // ---------------------------------------------------------------------------
  // 6. GABLED ROOF DORMER (Window, Tile Pitched Roof, Corbel Brackets & Planter)
  // Oriented parallel to main ridge (Z-axis), with front & rear gables as seen in turnaround.
  // ---------------------------------------------------------------------------
  const dormerGroup = new THREE.Group();
  dormerGroup.name = 'roof-dormer';
  const dormerBaseY = roofBaseY + 0.45;
  dormerGroup.position.set(dormerBaseX, dormerBaseY, -0.10);
  root.add(dormerGroup);
  runtimeNodes['dormer'] = dormerGroup;

  const dW = 0.82; // projection along X
  const dD = 0.94; // length along Z
  const dH = 0.78; // wall height along Y
  const dRoofPitch = Math.atan2(0.38, dW / 2);

  // Dormer Stucco Cheek / Core Walls, carried down into the roof so no underside shows at the eave side
  const dSink = 0.38;
  const dormerBodyMesh = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(dW, dH + dSink, dD), matPlasterShade));
  dormerBodyMesh.position.set(0, (dH - dSink) / 2, 0);
  dormerGroup.add(dormerBodyMesh);

  // Outer Timber Corner Posts
  const dCornerPostGeo = new THREE.BoxGeometry(0.08, dH + dSink, 0.08);
  const dcp1 = applyShadow(new THREE.Mesh(dCornerPostGeo, matTimber));
  dcp1.position.set(dW / 2, (dH - dSink) / 2, dD / 2);
  const dcp2 = applyShadow(new THREE.Mesh(dCornerPostGeo, matTimber));
  dcp2.position.set(dW / 2, (dH - dSink) / 2, -dD / 2);
  dormerGroup.add(dcp1, dcp2);

  // Dormer Front & Rear Gables (facing +Z and -Z)
  const dGableH = 0.40;
  const dGableShape = new THREE.Shape();
  dGableShape.moveTo(-dW / 2, 0);
  dGableShape.lineTo(dW / 2, 0);
  dGableShape.lineTo(0, dGableH);
  dGableShape.closePath();

  // Front Gable Face (+Z)
  const dGableFront = applyShadow(
    new THREE.Mesh(new THREE.ExtrudeGeometry(dGableShape, { depth: 0.06, bevelEnabled: false }), matPlaster)
  );
  dGableFront.position.set(0, dH, dD / 2 - 0.06);
  dormerGroup.add(dGableFront);

  // Rear Gable Face (-Z)
  const dGableRear = applyShadow(
    new THREE.Mesh(new THREE.ExtrudeGeometry(dGableShape, { depth: 0.06, bevelEnabled: false }), matPlaster)
  );
  dGableRear.position.set(0, dH, -dD / 2);
  dormerGroup.add(dGableRear);

  // Timber Bargeboards on Front and Rear Gables
  const dBargeLength = Math.hypot(dGableH, dW / 2) + 0.12;
  const dBargeGeo = new THREE.BoxGeometry(dBargeLength, 0.08, 0.08);

  function addDormerBargeboards(zPos: number) {
    const bLeft = applyShadow(new THREE.Mesh(dBargeGeo, matTimber));
    bLeft.position.set(-dW / 4, dH + dGableH / 2 + 0.02, zPos);
    bLeft.rotation.z = dRoofPitch;
    const bRight = applyShadow(new THREE.Mesh(dBargeGeo, matTimber));
    bRight.position.set(dW / 4, dH + dGableH / 2 + 0.02, zPos);
    bRight.rotation.z = -dRoofPitch;
    dormerGroup.add(bLeft, bRight);
  }
  addDormerBargeboards(dD / 2 + 0.02);
  addDormerBargeboards(-dD / 2 - 0.02);

  // Dormer Subroof Underlayment (solid dark terracotta/timber plates)
  const dRoofL = dD + 0.16;
  const dRafterL = Math.hypot(dGableH, dW / 2) + 0.10;
  const dSubRoofGeo = new THREE.BoxGeometry(dRafterL, 0.04, dRoofL);
  const dSubL = applyShadow(new THREE.Mesh(dSubRoofGeo, matTile4));
  dSubL.position.set(-dW / 4, dH + dGableH / 2, 0);
  dSubL.rotation.z = dRoofPitch;
  const dSubR = applyShadow(new THREE.Mesh(dSubRoofGeo, matTile4));
  dSubR.position.set(dW / 4, dH + dGableH / 2, 0);
  dSubR.rotation.z = -dRoofPitch;
  dormerGroup.add(dSubL, dSubR);

  // Dormer Clay Shingles (right slope over window, left slope into valley)
  const dTileRows = 3;
  const dTileCols = 4;
  for (let r = 0; r < dTileRows; r++) {
    const s = 0.08 + (dTileRows - 1 - r) * 0.16;
    const wy = dH + dGableH - s * Math.sin(dRoofPitch) + 0.035;
    const wxR = s * Math.cos(dRoofPitch);
    const wxL = -s * Math.cos(dRoofPitch);

    for (let c = 0; c < dTileCols; c++) {
      const wz = -dD / 2 + 0.12 + c * 0.24;

      // Outer right slope tiles (facing yard, directly visible)
      const tileR = createClayTileMesh((r * 2 + c) % 5);
      tileR.scale.set(0.65, 0.38, 0.65);
      tileR.position.set(wxR, wy, wz);
      tileR.rotation.z = -dRoofPitch + ((c % 3) - 1) * 0.02;
      tileR.rotation.y = ((r % 2) - 0.5) * 0.03;

      // Inner left slope tiles
      const tileL = createClayTileMesh((r * 2 + c + 1) % 5);
      tileL.scale.set(0.65, 0.38, 0.65);
      tileL.position.set(wxL, wy, wz);
      tileL.rotation.z = dRoofPitch - ((c % 3) - 1) * 0.02;
      tileL.rotation.y = ((r % 2) - 0.5) * 0.03;

      dormerGroup.add(tileR, tileL);
    }
  }

  // Terracotta Ridge Cap Tiles along dormer ridge (Z-axis)
  const numDRidge = Math.floor(dRoofL / 0.22);
  for (let i = 0; i < numDRidge; i++) {
    const z = -dRoofL / 2 + 0.11 + i * 0.22;
    const rTile = applyShadow(new THREE.Mesh(ridgeTileGeo, matTileRidge));
    rTile.scale.set(0.6, 0.6, 0.7);
    rTile.position.set(0, dH + dGableH + 0.03, z);
    dormerGroup.add(rTile);
  }

  // Dormer 4-Pane Casement Window (facing +X) with its flower box
  const dormerWindow = createWindow(0.34, 0.36, { shutters: false, flowerBox: true });
  dormerWindow.position.set(dW / 2, dH / 2 + 0.11, 0);
  dormerWindow.rotation.y = Math.PI / 2;
  dormerGroup.add(dormerWindow);

  // ---------------------------------------------------------------------------
  // 7. STONE CHIMNEY STACK (Continuous Ashlar Masonry & Dark Square Pot)
  // ---------------------------------------------------------------------------
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'chimney-stack';
  chimneyGroup.position.set(chimneyBaseX, 0, chimneyBaseZ);
  root.add(chimneyGroup);
  runtimeNodes['chimney'] = chimneyGroup;

  const chW = 0.86;
  const chD = 0.84;
  const chH = ridgeY + 0.57; // Pierces above roof ridge with headroom inside camera frame

  // Base core stone shaft
  const chCore = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chW, chH, chD), matStonePlinth));
  chCore.position.set(0, chH / 2, 0);
  chimneyGroup.add(chCore);

  // Ashlar Block Courses on the part of the stack that clears the roof (below it the stack is inside
  // the house), stopping short of the crown so no block pokes through the capping.
  const chBlockMatGrid = [matStoneLight, matStoneMid, matStoneDark];
  const chCourseStart = Math.ceil((roofBaseY + 0.3 - 0.85) / 0.36);
  const chCourseEnd = Math.floor((chH - 0.31 - 0.14 - 0.85) / 0.36);
  for (let c = chCourseStart; c <= chCourseEnd; c++) {
    const cy = 0.85 + c * 0.36;
    // Outer side face (-X)
    const b1 = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.28, 0.36), chBlockMatGrid[c % 3]));
    b1.position.set(-chW / 2 - 0.04, cy, ((c % 2) - 0.5) * 0.28);
    chimneyGroup.add(b1);

    // Front face (+Z)
    const b2 = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.11), chBlockMatGrid[(c + 1) % 3]));
    b2.position.set(((c % 2) - 0.5) * 0.28, cy, chD / 2 + 0.04);
    chimneyGroup.add(b2);

    // Rear face (-Z)
    const b3 = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.28, 0.11), chBlockMatGrid[(c + 2) % 3]));
    b3.position.set(((c % 2) - 0.5) * -0.28, cy, -chD / 2 - 0.04);
    chimneyGroup.add(b3);
  }

  // Stepped Stone Shoulder at Roof Penetration
  const chShoulder = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chW + 0.12, 0.38, chD + 0.12), matStoneLight));
  chShoulder.position.set(0, roofBaseY + 0.85, 0);
  chimneyGroup.add(chShoulder);

  // Corbelled Stone Crown Molding at Top
  const chCrownLower = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chW + 0.16, 0.18, chD + 0.16), matStoneDark));
  chCrownLower.position.set(0, chH - 0.22, 0);
  const chCrownUpper = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chW + 0.26, 0.20, chD + 0.26), matStoneLight));
  chCrownUpper.position.set(0, chH - 0.06, 0);
  chimneyGroup.add(chCrownLower, chCrownUpper);

  // Authentic Dark Square Chimney Pot with Lip (as seen in front.png & front_right.png)
  const potGroup = new THREE.Group();
  potGroup.position.set(0, chH + 0.04, 0);

  // Square base collar
  const potCollar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.44), matStoneDark));
  potCollar.position.y = 0.05;
  potGroup.add(potCollar);

  // Tapered dark square flue body
  const potBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.38, 0.42, 0.38), matIron));
  potBody.position.y = 0.31;
  potGroup.add(potBody);

  // Flared top rim lip
  const potLip = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.08, 0.44), matStoneDark));
  potLip.position.y = 0.56;
  potGroup.add(potLip);

  // Deep inner cavity
  const potVoid = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.35, 0.26), new THREE.MeshBasicMaterial({ color: 0x0a0a0a }));
  potVoid.position.y = 0.44;
  potGroup.add(potVoid);
  chimneyGroup.add(potGroup);

  // Smoke Socket
  const smokeSocket = new THREE.Object3D();
  smokeSocket.name = 'socket-chimney-smoke';
  smokeSocket.position.set(0, chH + 0.65, 0);
  chimneyGroup.add(smokeSocket);


  // ---------------------------------------------------------------------------
  // 8. FRONT PORCH & ARCHED TIMBER ENTRANCE DOORWAY
  // ---------------------------------------------------------------------------
  const porchGroup = new THREE.Group();
  porchGroup.name = 'front-porch';
  const porchBaseZ = fDepth / 2;
  porchGroup.position.set(porchBaseX, 0, porchBaseZ);
  root.add(porchGroup);
  runtimeNodes['porch'] = porchGroup;

  // Porch frame width (spec: componentTree 'porch'.dimensions.width). Posts, beams, landing and the
  // gable roof derive from it; the roof rise follows the span so the ~38° pitch is kept.
  const pPostX = porchWidth / 2 - 0.10;
  const pHalf = porchWidth / 2 + 0.04;
  const pRise = pHalf * (0.68 / 0.88);
  const wallZ = gDepth / 2 - porchBaseZ;   // ground-storey wall face, in porch space
  const landingTop = fHeight + 0.07;       // door threshold, just clear of the plinth coping
  const landingFront = 1.2;
  const pPostZ = 0.96;
  const porchBeamY = 2.91;                 // porch beam / eave line
  const pedH = 0.26;
  const porchPostH = porchBeamY - landingTop - pedH;
  const capT = 0.06;                       // stone cap thickness on the landing and each tread

  // Stone landing under the porch roof: flush with the wall, level with the door threshold, with a
  // capping slab that oversails the body on the open sides.
  const landingD = landingFront - wallZ;
  const landingBody = applyShadow(new THREE.Mesh(
    new THREE.BoxGeometry(porchLandingHalfW * 2, landingTop - capT, landingD), matStoneMid));
  landingBody.position.set(0, (landingTop - capT) / 2, wallZ + landingD / 2);
  const landingCap = applyShadow(new THREE.Mesh(
    new THREE.BoxGeometry(porchLandingHalfW * 2 + 0.06, capT, landingD + 0.03), matStoneStep));
  landingCap.position.set(0, landingTop - capT / 2, wallZ + (landingD + 0.03) / 2);
  porchGroup.add(landingBody, landingCap);

  // Three steps down from the landing between the post bases, each a solid block with a nosed tread
  const stepCount = 3;
  const stepRise = landingTop / (stepCount + 1);
  const stepRun = 0.3;
  const stepHalfW = pPostX - 0.28;
  for (let k = 0; k < stepCount; k++) {
    const top = landingTop - (k + 1) * stepRise;
    const z0 = landingFront + k * stepRun;
    const block = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stepHalfW * 2, top - capT, stepRun), matStoneMid));
    block.position.set(0, (top - capT) / 2, z0 + stepRun / 2);
    const tread = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stepHalfW * 2 + 0.04, capT, stepRun + 0.03), matStoneStep));
    tread.position.set(0, top - capT / 2, z0 + (stepRun + 0.03) / 2);
    porchGroup.add(block, tread);
  }

  // Stone post bases standing on the landing
  const pedGeo = new THREE.BoxGeometry(0.34, pedH, 0.34);
  const pedL = applyShadow(new THREE.Mesh(pedGeo, matStoneDark));
  pedL.position.set(-pPostX, landingTop + pedH / 2, pPostZ);
  const pedR = applyShadow(new THREE.Mesh(pedGeo, matStoneMid));
  pedR.position.set(pPostX, landingTop + pedH / 2, pPostZ);
  porchGroup.add(pedL, pedR);

  // Porch Timber Pillars
  const pPostGeo = new THREE.BoxGeometry(0.16, porchPostH, 0.16);
  const pPostL = applyShadow(new THREE.Mesh(pPostGeo, matTimber));
  pPostL.position.set(-pPostX, landingTop + pedH + porchPostH / 2, pPostZ);
  const pPostR = applyShadow(new THREE.Mesh(pPostGeo, matTimber));
  pPostR.position.set(pPostX, landingTop + pedH + porchPostH / 2, pPostZ);
  porchGroup.add(pPostL, pPostR);

  // Porch Beams (front tie and side beams back to the wall) & Diagonal Brackets
  const sideBeamLen = pPostZ + 0.08 - wallZ;
  const pBeamFront = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(porchWidth, 0.16, 0.16), matTimber));
  pBeamFront.position.set(0, porchBeamY, pPostZ);
  const pBeamL = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, sideBeamLen), matTimber));
  pBeamL.position.set(-pPostX, porchBeamY, wallZ + sideBeamLen / 2);
  const pBeamR = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, sideBeamLen), matTimber));
  pBeamR.position.set(pPostX, porchBeamY, wallZ + sideBeamLen / 2);
  porchGroup.add(pBeamFront, pBeamL, pBeamR);

  const pBraceGeo = new THREE.BoxGeometry(0.12, 0.44, 0.12);
  const pb1 = applyShadow(new THREE.Mesh(pBraceGeo, matTimber));
  pb1.position.set(-(pPostX - 0.22), porchBeamY - 0.24, pPostZ);
  pb1.rotation.z = Math.PI / 4;
  const pb2 = applyShadow(new THREE.Mesh(pBraceGeo, matTimber));
  pb2.position.set(pPostX - 0.22, porchBeamY - 0.24, pPostZ);
  pb2.rotation.z = -Math.PI / 4;
  porchGroup.add(pb1, pb2);

  // Porch Gable: plaster tympanum with a king post, bargeboards and crossed finials
  const pPitch = Math.atan2(pRise, pHalf - 0.03);
  const pGableShape = new THREE.Shape();
  pGableShape.moveTo(-pHalf, 0);
  pGableShape.lineTo(pHalf, 0);
  pGableShape.lineTo(0, pRise);
  pGableShape.closePath();

  const pGableBaseY = porchBeamY + 0.08;
  const pTympanum = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(pGableShape, { depth: 0.12, bevelEnabled: false }), matPlaster));
  pTympanum.position.set(0, pGableBaseY, 0.88);
  porchGroup.add(pTympanum);
  const pKingH = pRise - 0.12;
  const pKingPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, pKingH, 0.05), matTimber));
  pKingPost.position.set(0, pGableBaseY + pKingH / 2, 1.025);
  porchGroup.add(pKingPost);

  const pRafterL = Math.hypot(pRise, pHalf) + 0.18;
  const pBargeX = pHalf / 2 + 0.02;
  const pSlopeMidY = pGableBaseY + pRise / 2;
  const pBargeGeo = new THREE.BoxGeometry(pRafterL, 0.14, 0.12);
  const pbL = applyShadow(new THREE.Mesh(pBargeGeo, matTimber));
  pbL.position.set(-pBargeX, pSlopeMidY, 0.98);
  pbL.rotation.z = pPitch;
  const pbR = applyShadow(new THREE.Mesh(pBargeGeo, matTimber));
  pbR.position.set(pBargeX, pSlopeMidY, 0.98);
  pbR.rotation.z = -pPitch;
  porchGroup.add(pbL, pbR);

  const pFinialL = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), matTimber));
  pFinialL.position.set(-0.04, pGableBaseY + pRise + 0.06, 0.98);
  pFinialL.rotation.z = pPitch * 0.8;
  const pFinialR = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.28, 0.12), matTimber));
  pFinialR.position.set(0.04, pGableBaseY + pRise + 0.06, 0.98);
  pFinialR.rotation.z = -pPitch * 0.8;
  porchGroup.add(pFinialL, pFinialR);

  // Porch roof: a deck on each slope from the jetty face to just past the bargeboards, fully tiled
  // in courses (alternate courses lifted a few mm so overlapping tiles never lie coplanar).
  const pRoofZ0 = uDepth / 2 - porchBaseZ + 0.005;
  const pRoofZ1 = 1.1;
  const pRoofD = pRoofZ1 - pRoofZ0;
  const pRoofZc = (pRoofZ0 + pRoofZ1) / 2;
  const pDeckGeo = new THREE.BoxGeometry(pRafterL, 0.05, pRoofD);
  const pCourses = Math.max(2, Math.round((pRafterL - 0.12) / 0.17));
  const pColumns = Math.max(2, Math.round((pRoofD - 0.1) / 0.23));
  for (const side of [-1, 1]) {
    const rot = -side * pPitch;                           // left slope rises to the right
    const along = new THREE.Vector2(Math.cos(rot), Math.sin(rot));
    const up = new THREE.Vector2(-Math.sin(rot), Math.cos(rot));
    const deckX = side * pBargeX + up.x * 0.06;
    const deckY = pSlopeMidY + up.y * 0.06;
    const deck = applyShadow(new THREE.Mesh(pDeckGeo, matTile4));
    deck.position.set(deckX, deckY, pRoofZc);
    deck.rotation.z = rot;
    porchGroup.add(deck);
    for (let r = 0; r < pCourses; r++) {
      const s = -pRafterL / 2 + 0.12 + (r * (pRafterL - 0.24)) / (pCourses - 1);
      for (let c = 0; c < pColumns; c++) {
        const lift = 0.043 + (r % 2) * 0.006 + (c % 2) * 0.003;
        const tile = createClayTileMesh((r * 2 + c + (side > 0 ? 1 : 0)) % 5);
        tile.scale.set(0.72, 0.38, 0.72);
        tile.position.set(
          deckX + along.x * s + up.x * lift,
          deckY + along.y * s + up.y * lift,
          pRoofZ0 + 0.14 + (c * (pRoofD - 0.28)) / (pColumns - 1),
        );
        tile.rotation.z = rot + ((c % 3) - 1) * 0.02;
        porchGroup.add(tile);
      }
    }
  }

  const pRidge = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, pRoofD + 0.04, 8, 1, false, 0, Math.PI), matTileRidge));
  pRidge.rotation.x = Math.PI / 2;
  pRidge.position.set(0, pGableBaseY + pRise + 0.03, pRoofZc);
  porchGroup.add(pRidge);

  // Potted herbs on the landing, either side of the door
  const potGeo = new THREE.CylinderGeometry(0.14, 0.105, 0.21, 10);
  const potPlantGeo = new THREE.DodecahedronGeometry(0.13, 0);
  for (const px of [-1.0, 1.0]) {
    const pot = applyShadow(new THREE.Mesh(potGeo, matTileRidge));
    pot.position.set(px, landingTop + 0.105, 0.42);
    const plant = applyShadow(new THREE.Mesh(potPlantGeo, matFoliageMid));
    plant.position.set(px, landingTop + 0.25, 0.42);
    plant.scale.set(1, 0.85, 1);
    porchGroup.add(pot, plant);
  }

  // Arched Entrance Doorway & Hardware
  const doorWidth = 1.05;
  const doorHeight = 2.05;
  const archRadius = doorWidth / 2;
  const straightH = doorHeight - archRadius;

  const archShape = new THREE.Shape();
  archShape.moveTo(-archRadius, 0);
  archShape.lineTo(-archRadius, straightH);
  archShape.absarc(0, straightH, archRadius, Math.PI, 0, true);
  archShape.lineTo(archRadius, 0);
  archShape.closePath();

  const doorGroup = new THREE.Group();
  doorGroup.name = 'arched-entrance-door';
  doorGroup.position.set(0, landingTop, wallZ + 0.002);

  // Arched Timber Surround Frame
  const frameShape = new THREE.Shape();
  const fRad = archRadius + 0.12;
  frameShape.moveTo(-fRad, 0);
  frameShape.lineTo(-fRad, straightH);
  frameShape.absarc(0, straightH, fRad, Math.PI, 0, true);
  frameShape.lineTo(fRad, 0);
  frameShape.closePath();

  const frameHole = new THREE.Path();
  frameHole.moveTo(-archRadius, 0);
  frameHole.lineTo(-archRadius, straightH);
  frameHole.absarc(0, straightH, archRadius, Math.PI, 0, true);
  frameHole.lineTo(archRadius, 0);
  frameHole.closePath();
  frameShape.holes.push(frameHole);

  const doorFrameMesh = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(frameShape, { depth: 0.12, bevelEnabled: false }), matTimber));
  doorGroup.add(doorFrameMesh);

  // Solid Wood Door Leaf
  const doorLeafMesh = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(archShape, { depth: 0.06, bevelEnabled: true, bevelSize: 0.01, bevelThickness: 0.01 }), matDoor));
  doorLeafMesh.position.z = 0.02;
  doorGroup.add(doorLeafMesh);

  // Vertical Plank Seams
  const numDoorPlanks = 5;
  const plankW = doorWidth / numDoorPlanks;
  for (let i = 1; i < numDoorPlanks; i++) {
    const px = -doorWidth / 2 + i * plankW;
    const seam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.012, straightH + archRadius * 0.85, 0.02), matTimberPeg));
    seam.position.set(px, (straightH + archRadius * 0.85) / 2, 0.085); // 5mm proud of the leaf face
    doorGroup.add(seam);
  }

  // Wrought Iron Strap Hinges with Fishtail Ends
  for (const hy of [straightH * 0.3, straightH * 0.82]) {
    const hinge = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(doorWidth * 0.65, 0.055, 0.02), matIron));
    hinge.position.set(-doorWidth * 0.12, hy, 0.09);
    const fishtail = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(0.045, 0.08, 4), matIron));
    fishtail.rotation.z = Math.PI / 2;
    fishtail.position.set(doorWidth * 0.22, hy, 0.09);
    doorGroup.add(hinge, fishtail);
  }

  // Heavy Iron Ring Knocker
  const knockerBase = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.025, 8), matIron));
  knockerBase.rotation.x = Math.PI / 2;
  knockerBase.position.set(0.18, straightH * 0.55, 0.09);
  const knockerRing = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.016, 6, 16), matIron));
  knockerRing.position.set(0.18, straightH * 0.55 - 0.05, 0.10);
  doorGroup.add(knockerBase, knockerRing);
  porchGroup.add(doorGroup);

  // ---------------------------------------------------------------------------
  // 9. ATTACHED GROUNDED WOODSHED & WOODCUTTER RACK
  // ---------------------------------------------------------------------------
  const shedGroup = new THREE.Group();
  shedGroup.name = 'attached-woodshed';
  const shedBaseX = -fWidth / 2;
  shedGroup.position.set(shedBaseX, 0, 0);
  root.add(shedGroup);
  runtimeNodes['shed'] = shedGroup;

  const shedW = 1.62;
  const shedD = 2.95;
  const shedPostH = 2.57; // outer eave ~0.58 of the main eave height, as in the reference front view

  // Grounded timber plank floor pad
  const shedFloor = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(shedW + 0.1, 0.12, shedD + 0.1), matTimber));
  shedFloor.position.set(-shedW / 2, 0.06, 0);
  shedGroup.add(shedFloor);

  // Outer Timber Pillars
  const sPostGeo = new THREE.BoxGeometry(0.15, shedPostH, 0.15);
  const spFront = applyShadow(new THREE.Mesh(sPostGeo, matTimber));
  spFront.position.set(-shedW, shedPostH / 2, shedD / 2 - 0.1);
  const spRear = applyShadow(new THREE.Mesh(sPostGeo, matTimber));
  spRear.position.set(-shedW, shedPostH / 2, -shedD / 2 + 0.1);
  shedGroup.add(spFront, spRear);

  // Top header beams
  const sHeader = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.15, shedD), matTimber));
  sHeader.position.set(-shedW, shedPostH, 0);
  shedGroup.add(sHeader);

  // Sloping Shed Roof
  const shedPitch = Math.atan2(0.95, shedW);
  const shedRafterL = Math.hypot(0.95, shedW) + 0.28;
  const shedRoofSub = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(shedRafterL, 0.08, shedD + 0.3), matTile4));
  shedRoofSub.position.set(-shedW / 2 - 0.05, shedPostH + 0.48, 0);
  shedRoofSub.rotation.z = shedPitch;
  shedGroup.add(shedRoofSub);

  // Shed Roof Shingles
  for (let r = 0; r < 5; r++) {
    for (let c = 0; c < 10; c++) {
      const tilePosX = -shedW + 0.12 + r * 0.32 * Math.cos(shedPitch);
      const tilePosZ = -shedD / 2 + 0.15 + c * 0.31;
      const worldX = shedBaseX + tilePosX;
      const worldZ = tilePosZ;
      if (Math.abs(worldX - chimneyBaseX) < chW / 2 + 0.05 && Math.abs(worldZ - chimneyBaseZ) < chD / 2 + 0.05) {
        continue;
      }
      const tile = createClayTileMesh((r * 2 + c) % 5);
      tile.scale.set(0.85, 0.42, 0.85);
      tile.position.set(
        tilePosX,
        shedPostH + 0.18 + r * 0.32 * Math.sin(shedPitch),
        tilePosZ
      );
      tile.rotation.z = shedPitch;
      shedGroup.add(tile);
    }
  }

  // Firewood Storage Shelf / Rack (as depicted in rear.png & rear_right.png)
  const rackFrameH = 1.35;
  const rackFrameGeo = new THREE.BoxGeometry(0.08, rackFrameH, 0.08);
  const rf1 = applyShadow(new THREE.Mesh(rackFrameGeo, matTimber));
  rf1.position.set(-0.25, rackFrameH / 2 + 0.1, -shedD / 2 + 0.3);
  const rf2 = applyShadow(new THREE.Mesh(rackFrameGeo, matTimber));
  rf2.position.set(-0.85, rackFrameH / 2 + 0.1, -shedD / 2 + 0.3);
  const rShelf = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.08, 0.75), matTimber));
  rShelf.position.set(-0.55, 0.75, -shedD / 2 + 0.65);
  shedGroup.add(rf1, rf2, rShelf);

  // Firewood Factory: Concentric Rings & End-Grain Detailing
  function createLogMesh(radius: number, length: number): THREE.Group {
    const lg = new THREE.Group();
    const bark = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, length, 12, 1, true), matLogBark));
    bark.rotation.x = Math.PI / 2;
    lg.add(bark);

    const endGeoHeart = new THREE.CircleGeometry(radius * 0.55, 10);
    const endGeoRing = new THREE.RingGeometry(radius * 0.55, radius * 0.94, 10);

    for (const zDir of [-length / 2, length / 2]) {
      const heart = applyShadow(new THREE.Mesh(endGeoHeart, matLogHeart));
      heart.position.z = zDir;
      if (zDir > 0) heart.rotation.y = Math.PI;
      const ring = applyShadow(new THREE.Mesh(endGeoRing, matLogRing));
      ring.position.z = zDir;
      if (zDir > 0) ring.rotation.y = Math.PI;
      lg.add(heart, ring);
    }
    return lg;
  }

  // Hexagonal Gravitational Stacking of Cut Firewood (Front Stack & Rear Rack Stack)
  // Front Stack:
  for (let ly = 0; ly < 4; ly++) {
    const count = 4 - ly;
    for (let lx = 0; lx < count; lx++) {
      const log = createLogMesh(0.105, 0.72);
      log.position.set(-0.35 - lx * 0.22 - ly * 0.11, 0.18 + ly * 0.18, 0.62);
      shedGroup.add(log);
    }
  }

  // Rear Rack Stack (under shelf):
  for (let ly = 0; ly < 4; ly++) {
    const count = 4 - ly;
    for (let lx = 0; lx < count; lx++) {
      const log = createLogMesh(0.10, 0.70);
      log.position.set(-0.35 - lx * 0.21 - ly * 0.10, 0.18 + ly * 0.17, -shedD / 2 + 0.65);
      shedGroup.add(log);
    }
  }

  // Woodcutter's splitting axe: butt on the shed floor, handle leaning on the end grain of the front
  // stack, head fitted at the top of the handle with the blade turned sideways. The head and handle
  // share one group so they cannot drift apart (they had been placed separately, 22cm apart).
  const axe = new THREE.Group();
  axe.name = 'splitting-axe';
  const axeHandleL = 0.65;
  const axeHandle = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.024, axeHandleL, 6), matTimber));
  axeHandle.position.y = axeHandleL / 2;
  const axeHead = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.085, 0.035), matIron));
  axeHead.position.set(0.06, axeHandleL - 0.05, 0);
  const axeBit = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.12, 0.02), matIron));
  axeBit.position.set(0.135, axeHandleL - 0.05, 0);
  axe.add(axeHandle, axeHead, axeBit);
  const logEndZ = 0.62 + 0.72 / 2;
  const axeFootZ = 1.2;
  axe.rotation.x = -Math.asin((axeFootZ - logEndZ - 0.02) / axeHandleL);
  axe.position.set(-0.75, 0.12, axeFootZ);
  shedGroup.add(axe);

  // Bulging Wooden Barrels Factory (Curved Lathe Profile & Iron Hoops)
  function createBulgingBarrel(hasApples = false): THREE.Group {
    const bGroup = new THREE.Group();
    const points: THREE.Vector2[] = [
      new THREE.Vector2(0.28, -0.42),
      new THREE.Vector2(0.33, -0.22),
      new THREE.Vector2(0.355, 0),
      new THREE.Vector2(0.33, 0.22),
      new THREE.Vector2(0.28, 0.42),
    ];
    const barrelGeo = new THREE.LatheGeometry(points, 16);
    const bBody = applyShadow(new THREE.Mesh(barrelGeo, matShutter));
    bGroup.add(bBody);

    const lid = applyShadow(new THREE.Mesh(new THREE.CircleGeometry(0.27, 14), matShutter));
    lid.rotation.x = -Math.PI / 2;
    lid.position.y = 0.415;
    bGroup.add(lid);

    const hoopHeights = [-0.34, -0.16, 0.16, 0.34];
    const hoopRadii = [0.295, 0.342, 0.342, 0.295];
    for (let h = 0; h < 4; h++) {
      const hoop = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(hoopRadii[h], 0.014, 6, 18), matIron));
      hoop.rotation.x = Math.PI / 2;
      hoop.position.y = hoopHeights[h];
      bGroup.add(hoop);
    }

    if (hasApples) {
      const appleGeo = new THREE.DodecahedronGeometry(0.044, 0);
      const appleCoords = [
        { x: 0, z: 0, mat: matAppleRed },
        { x: 0.08, z: 0.05, mat: matAppleGreen },
        { x: -0.07, z: 0.06, mat: matAppleRed },
        { x: 0.06, z: -0.07, mat: matAppleRed },
        { x: -0.06, z: -0.06, mat: matAppleGreen },
        { x: 0.12, z: -0.02, mat: matAppleGreen },
        { x: -0.12, z: 0.01, mat: matAppleRed },
        { x: 0.02, z: 0.11, mat: matAppleRed },
        { x: 0.01, z: 0.02, y: 0.06, mat: matAppleGreen },
        { x: -0.04, z: -0.02, y: 0.06, mat: matAppleRed },
      ];
      for (const ac of appleCoords) {
        const apple = applyShadow(new THREE.Mesh(appleGeo, ac.mat));
        apple.position.set(ac.x, 0.43 + (ac.y ?? 0), ac.z);
        bGroup.add(apple);
      }
    }
    return bGroup;
  }

  // Front Barrel (with apples!)
  const barrel1 = createBulgingBarrel(true);
  // Barrels stand on the ground clear of the plank floor pad (their foot radius is ~0.31 at pad height)
  barrel1.position.set(-shedW - 0.38, 0.425, 0.85);
  shedGroup.add(barrel1);

  // Rear Woodshed Barrel
  const barrel2 = createBulgingBarrel(false);
  barrel2.position.set(-shedW - 0.38, 0.425, -0.85);
  shedGroup.add(barrel2);

  // Rear Yard Ivy Barrel (as seen in rear.png)
  const barrel3 = createBulgingBarrel(false);
  barrel3.position.set(-0.4, 0.425, -fDepth / 2 - 0.25); // clear of the plinth's rear-left corner
  shedGroup.add(barrel3);

  // ---------------------------------------------------------------------------
  // 10. WINDOWS, SHUTTERS & FLOWER BOXES
  // ---------------------------------------------------------------------------
  const windowsGroup = new THREE.Group();
  windowsGroup.name = 'windows-group';
  root.add(windowsGroup);
  runtimeNodes['windows'] = windowsGroup;

  // Every opening is centred in its timber bay and mounted on the face it belongs to (ground wall,
  // or the recessed gable plaster), so no window crosses a post and none floats off its wall.
  const winY = gY - 0.05;
  const windowPlacements: Array<{ x: number; y: number; z: number; rotY: number; w: number; h: number; box: boolean }> = [
    // Front gable window, frame head just under the collar tie
    { x: 0, y: topPlateY + 0.9, z: gableFaceZ, rotY: 0, w: 0.92, h: 1.02, box: true },
    // Front ground window, centred between the left corner post and the left door-bay stud
    { x: (-gWidth / 2 + frontGroundStuds[0]) / 2, y: winY, z: gDepth / 2, rotY: 0, w: 0.72, h: 0.82, box: true },
    // Right wall, one window centred in each bay either side of the intermediate post
    { x: gWidth / 2, y: winY, z: gDepth / 4, rotY: Math.PI / 2, w: 0.65, h: 0.75, box: true },
    { x: gWidth / 2, y: winY, z: -gDepth / 4, rotY: Math.PI / 2, w: 0.65, h: 0.75, box: true },
    // Rear wall, a matching pair centred in the two outer bays: same size, so heads and sills share
    // one line across the facade
    { x: (rearStuds[2] + rearStuds[3]) / 2, y: winY, z: -gDepth / 2, rotY: Math.PI, w: 0.72, h: 0.82, box: true },
    { x: (rearStuds[0] + rearStuds[1]) / 2, y: winY, z: -gDepth / 2, rotY: Math.PI, w: 0.72, h: 0.82, box: true },
    // Rear gable window, centred under the collar between the rear gable posts
    { x: 0, y: topPlateY + 0.85, z: -gableFaceZ, rotY: Math.PI, w: 0.55, h: 0.65, box: false },
  ];
  for (const wp of windowPlacements) {
    const win = createWindow(wp.w, wp.h, { flowerBox: wp.box });
    win.position.set(wp.x, wp.y, wp.z);
    win.rotation.y = wp.rotY;
    windowsGroup.add(win);
  }

  // ---------------------------------------------------------------------------
  // 11. YARD PROPS, RUSTIC LADDERS, FENCE & CLOTHESLINE
  // ---------------------------------------------------------------------------
  const propsGroup = new THREE.Group();
  propsGroup.name = 'props-group';
  root.add(propsGroup);
  runtimeNodes['props'] = propsGroup;

  // Lantern Factory (Forged Iron Hexagonal Frame & Amber Glow)
  function createLantern(): { group: THREE.Group; light: THREE.PointLight } {
    const lg = new THREE.Group();
    const cap = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.12, 6), matIron));
    cap.position.y = 0.22;
    const body = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.07, 0.22, 6), matIron));
    body.position.y = 0.09;
    const base = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.04, 6), matIron));
    base.position.y = -0.04;
    const chain = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.14, 6), matIron));
    chain.position.y = 0.32;
    lg.add(cap, body, base, chain);

    const bulb = new THREE.Mesh(
      new THREE.SphereGeometry(0.045, 6, 6),
      new THREE.MeshStandardMaterial({ color: C.lanternLight, emissive: C.lanternLight, emissiveIntensity: 2.2 })
    );
    bulb.position.y = 0.09;
    lg.add(bulb);

    const light = new THREE.PointLight(C.lanternLight, 1.8, 6, 2.0);
    light.position.y = 0.09;
    light.castShadow = lanternShadows;
    lg.add(light);

    return { group: lg, light };
  }

  // Porch Wall Lantern, centred in the bay right of the porch and hung from an iron wall bracket
  const lanternX = (frontGroundStuds[1] + gWidth / 2) / 2;
  const lanternZ = gDepth / 2 + 0.24;
  const porchLantern = createLantern();
  porchLantern.group.position.set(lanternX, gY + 0.15, lanternZ);
  propsGroup.add(porchLantern.group);
  const bracketY = gY + 0.15 + 0.39;
  const bracketPlate = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.16, 0.02), matIron));
  bracketPlate.position.set(lanternX, bracketY - 0.03, gDepth / 2 + 0.01);
  const bracketArm = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.025, lanternZ - gDepth / 2 + 0.02), matIron));
  bracketArm.position.set(lanternX, bracketY, (gDepth / 2 + lanternZ) / 2 + 0.01);
  const bracketStay = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.018, 0.2), matIron));
  bracketStay.position.set(lanternX, bracketY - 0.07, gDepth / 2 + 0.09);
  bracketStay.rotation.x = -0.62;
  propsGroup.add(bracketPlate, bracketArm, bracketStay);

  // Woodshed Hanging Lantern
  const shedLantern = createLantern();
  shedLantern.group.position.set(-fWidth / 2 - shedW + 0.2, shedPostH - 0.15, shedD / 2 - 0.05);
  propsGroup.add(shedLantern.group);

  // RUSTIC SHORT WOODEN LADDERS (as seen in front_right.png & rear_right.png)
  // Ladder Factory for realistic hand-hewn wooden garden ladders
  function createRusticLadder(height: number, rungs: number): THREE.Group {
    const lad = new THREE.Group();
    const railGeo = new THREE.BoxGeometry(0.06, height, 0.06);
    const railL = applyShadow(new THREE.Mesh(railGeo, matTimber));
    railL.position.set(-0.18, height / 2, 0);
    const railR = applyShadow(new THREE.Mesh(railGeo, matTimber));
    railR.position.set(0.18, height / 2, 0);
    lad.add(railL, railR);

    const rungGeo = new THREE.BoxGeometry(0.36, 0.035, 0.05);
    const stepH = (height - 0.3) / (rungs + 1);
    for (let r = 1; r <= rungs; r++) {
      const rung = applyShadow(new THREE.Mesh(rungGeo, matTimber));
      rung.position.set(0, 0.15 + r * stepH, 0);
      lad.add(rung);
    }
    return lad;
  }

  // Everything leaning on the right wall rests on the outer top edge of the plinth coping: it
  // projects past the timber face, so a straight ladder or handle meets it before the wall. The foot
  // is set out so the inner face of the rail just touches that edge at the chosen lean.
  const copingOuterX = fWidth / 2 + 0.11;
  const copingTopY = fHeight + 0.065;
  const leanFootX = (lean: number, halfThickness: number) =>
    copingOuterX + 0.003 + halfThickness / Math.cos(lean) + copingTopY * Math.tan(lean);

  // Garden ladders, rungs parallel to the wall. 'ZYX' applies the quarter-turn yaw first and then
  // the lean about world Z, so the feet stay planted at y = 0 while the tops tip toward the house.
  function leanLadder(ladder: THREE.Group, lean: number, z: number) {
    ladder.rotation.order = 'ZYX';
    ladder.rotation.set(0, Math.PI / 2, lean);
    ladder.position.set(leanFootX(lean, 0.03), 0, z);
    propsGroup.add(ladder);
  }
  const ladder1 = createRusticLadder(1.25, 4);
  ladder1.name = 'wooden-ladder-1';
  leanLadder(ladder1, 0.26, 0.15);
  const ladder2 = createRusticLadder(1.05, 3);
  ladder2.name = 'wooden-ladder-2';
  leanLadder(ladder2, 0.24, -0.75);

  // Yard broom between the ladders: bristle head on the ground, handle socketed into it and leaning
  // on the same coping edge
  const broom = new THREE.Group();
  broom.name = 'yard-broom';
  const broomHead = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.22, 6), matRope));
  broomHead.position.y = 0.11;
  const broomShaft = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 1.15, 6), matTimber));
  broomShaft.position.y = 0.16 + 1.15 / 2;
  broom.add(broomHead, broomShaft);
  const broomLean = 0.2;
  broom.rotation.z = broomLean;
  broom.position.set(leanFootX(broomLean, 0.017), 0, -0.3);
  propsGroup.add(broom);

  // Low Split-Rail Fence in Front-Right Yard
  const fenceGroup = new THREE.Group();
  fenceGroup.name = 'split-rail-fence';
  fenceGroup.position.set(fWidth / 2 - 0.225, 0, fDepth / 2 + 0.42);

  const fPostGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
  const fp1 = applyShadow(new THREE.Mesh(fPostGeo, matTimber));
  fp1.position.set(0, 0.425, 0);
  const fp2 = applyShadow(new THREE.Mesh(fPostGeo, matTimber));
  fp2.position.set(0.95, 0.425, 0);
  const fp3 = applyShadow(new THREE.Mesh(fPostGeo, matTimber));
  fp3.position.set(1.85, 0.425, -0.25);
  fenceGroup.add(fp1, fp2, fp3);

  const fRailGeo = new THREE.BoxGeometry(1.0, 0.08, 0.06);
  const fr1U = applyShadow(new THREE.Mesh(fRailGeo, matTimber));
  fr1U.position.set(0.48, 0.65, 0);
  const fr1L = applyShadow(new THREE.Mesh(fRailGeo, matTimber));
  fr1L.position.set(0.48, 0.35, 0);
  // The second run angles back to the third post: rails centred between fp2 and fp3 and turned onto
  // that line (the old -0.24 turn ran them the other way, missing both posts)
  const fRun2Yaw = Math.atan2(0.25, 1.85 - 0.95);
  const fr2U = applyShadow(new THREE.Mesh(fRailGeo, matTimber));
  fr2U.position.set(1.40, 0.62, -0.125);
  fr2U.rotation.y = fRun2Yaw;
  const fr2L = applyShadow(new THREE.Mesh(fRailGeo, matTimber));
  fr2L.position.set(1.40, 0.32, -0.125);
  fr2L.rotation.y = fRun2Yaw;
  fenceGroup.add(fr1U, fr1L, fr2U, fr2L);
  propsGroup.add(fenceGroup);

  // Wooden Milking Stool with a Terracotta Herb Pot, on the ground beside the porch landing
  const stoolX = porchBaseX + porchLandingHalfW + 0.35;
  const stoolZ = porchBaseZ + 0.45;
  const stoolTop = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 0.04, 12), matTimber));
  stoolTop.position.set(stoolX, 0.30, stoolZ);
  propsGroup.add(stoolTop);
  for (let s = 0; s < 3; s++) {
    const leg = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.016, 0.018, 0.30, 6), matTimber));
    const ang = s * (Math.PI * 2 / 3);
    leg.position.set(stoolX + Math.cos(ang) * 0.09, 0.15, stoolZ + Math.sin(ang) * 0.09);
    leg.rotation.z = Math.cos(ang) * 0.18;
    leg.rotation.x = Math.sin(ang) * 0.18;
    propsGroup.add(leg);
  }
  const stoolPot = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.09, 0.18, 10), matTileRidge));
  stoolPot.position.set(stoolX, 0.32 + 0.09, stoolZ);
  const stoolPlant = applyShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.11, 0), matFoliageMid));
  stoolPlant.position.set(stoolX, 0.32 + 0.21, stoolZ);
  propsGroup.add(stoolPot, stoolPlant);

  // CLOTHESLINE IN REAR-RIGHT YARD (Relocated per rear.png & rear_right.png)
  const lineGroup = new THREE.Group();
  lineGroup.name = 'clothesline';
  lineGroup.position.set(fWidth / 2 + 0.475, 0, -fDepth / 2 - 0.25);
  lineGroup.rotation.y = -0.32;
  propsGroup.add(lineGroup);

  const postH = 1.95;
  const cPostGeo = new THREE.CylinderGeometry(0.07, 0.08, postH, 8);
  const cp1 = applyShadow(new THREE.Mesh(cPostGeo, matTimber));
  cp1.position.set(-0.95, postH / 2, 0);
  const cp2 = applyShadow(new THREE.Mesh(cPostGeo, matTimber));
  cp2.position.set(0.95, postH / 2, 0);
  lineGroup.add(cp1, cp2);

  const tCrossGeo = new THREE.BoxGeometry(0.36, 0.08, 0.08);
  const tc1 = applyShadow(new THREE.Mesh(tCrossGeo, matTimber));
  tc1.position.set(-0.95, postH - 0.04, 0);
  const tc2 = applyShadow(new THREE.Mesh(tCrossGeo, matTimber));
  tc2.position.set(0.95, postH - 0.04, 0);
  lineGroup.add(tc1, tc2);

  // Sagging Catenary Hemp Clothesline Rope
  const ropeCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.95, postH - 0.05, 0),
    new THREE.Vector3(-0.45, postH - 0.09, 0.01),
    new THREE.Vector3(0, postH - 0.12, 0.02),
    new THREE.Vector3(0.45, postH - 0.09, 0.01),
    new THREE.Vector3(0.95, postH - 0.05, 0),
  ]);
  const ropeMesh = applyShadow(new THREE.Mesh(new THREE.TubeGeometry(ropeCurve, 20, 0.012, 6, false), matRope));
  lineGroup.add(ropeMesh);

  // PHYSICS-CORRECT LINEN SHEETS: Top edge is at y = 0 so rotation pivots naturally from rope!
  const sheetW = 0.65;
  const sheetH = 0.85;
  const linenGeo = new THREE.PlaneGeometry(sheetW, sheetH, 6, 6);
  linenGeo.translate(0, -sheetH / 2, 0); // Pivot at top edge

  const linen1 = applyShadow(new THREE.Mesh(linenGeo, matLinen));
  linen1.position.set(-0.42, postH - 0.09, 0.01);
  const linen2 = applyShadow(new THREE.Mesh(linenGeo, matLinen));
  linen2.position.set(0.42, postH - 0.09, 0.01);
  lineGroup.add(linen1, linen2);

  // Wooden Clothespins clipping top edge to rope
  const pinGeo = new THREE.BoxGeometry(0.022, 0.06, 0.028);
  for (const lx of [-0.68, -0.16, 0.16, 0.68]) {
    const pin = applyShadow(new THREE.Mesh(pinGeo, matTimber));
    pin.position.set(lx, postH - 0.07, 0.015);
    lineGroup.add(pin);
  }

  // ---------------------------------------------------------------------------
  // 12. COMPOUND FOLIAGE & CLIMBING FLORA
  // ---------------------------------------------------------------------------
  const foliageGroup = new THREE.Group();
  foliageGroup.name = 'foliage-group';
  root.add(foliageGroup);
  runtimeNodes['foliage'] = foliageGroup;

  // Compound Shrub Factory
  function createCompoundBush(scale: number, flowerCount = 4): THREE.Group {
    const bg = new THREE.Group();
    const clusterCoords = [
      { x: 0, y: 0.32, z: 0, r: 0.35, mat: matFoliageDark },
      { x: 0.18, y: 0.28, z: 0.12, r: 0.28, mat: matFoliageMid },
      { x: -0.16, y: 0.26, z: -0.10, r: 0.26, mat: matFoliageMid },
      { x: 0.08, y: 0.44, z: -0.08, r: 0.24, mat: matFoliageLight },
      { x: -0.12, y: 0.38, z: 0.14, r: 0.22, mat: matFoliageLight },
    ];
    for (const c of clusterCoords) {
      const lobe = applyShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(c.r, 1), c.mat));
      lobe.position.set(c.x, c.y, c.z);
      bg.add(lobe);
    }

    for (let f = 0; f < flowerCount; f++) {
      const fl = applyShadow(new THREE.Mesh(new THREE.DodecahedronGeometry(0.05, 0), matRoseWhite));
      const ang = f * (Math.PI * 2 / flowerCount);
      fl.position.set(Math.cos(ang) * 0.28, 0.36 + (f % 2) * 0.08, Math.sin(ang) * 0.28);
      const center = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(0.02, 4, 4), matRoseCenter));
      center.position.set(Math.cos(ang) * 0.30, 0.36 + (f % 2) * 0.08, Math.sin(ang) * 0.30);
      bg.add(fl, center);
    }

    bg.scale.set(scale, scale, scale);
    return bg;
  }

  // Front-Right Shrub beside fence
  const bush1 = createCompoundBush(1.15, 6);
  bush1.position.set(fWidth / 2 - 0.175, 0, fDepth / 2 + 0.6);
  foliageGroup.add(bush1);

  // Shrub beside the porch landing (clear of the landing and the ground-floor window)
  const bush2 = createCompoundBush(0.85, 4);
  bush2.position.set(porchBaseX - porchLandingHalfW - 0.5, 0, fDepth / 2 + 0.5);
  foliageGroup.add(bush2);

  // Rear-Right Corner Bush
  const bush3 = createCompoundBush(1.0, 5);
  bush3.position.set(fWidth / 2 + 0.3, 0, -fDepth / 2 + 0.25); // leaves room for the rear ladder
  foliageGroup.add(bush3);

  // Rear Bush near clothesline
  const bush4 = createCompoundBush(1.1, 5);
  bush4.position.set(fWidth / 2 - 0.375, 0, -fDepth / 2 - 0.2);
  foliageGroup.add(bush4);

  // Climbing ivy on the front-left corner: a wandering stem from the plinth to the jetty with leaf
  // clusters scattered along it. A seeded generator keeps the layout identical on every build.
  let ivySeed = 0x2f6b3a1;
  const ivyRand = () => {
    ivySeed = (ivySeed * 1664525 + 1013904223) >>> 0;
    return ivySeed / 4294967296;
  };
  const ivyBaseX = -gWidth / 2 + 0.14;
  const ivyZ = gDepth / 2 + 0.12;
  const ivyPoints: THREE.Vector3[] = [];
  for (let i = 0; i <= 9; i++) {
    const t = i / 9;
    ivyPoints.push(new THREE.Vector3(ivyBaseX + Math.sin(t * 6.5) * 0.08, fHeight + 0.12 + t * 1.9, ivyZ));
  }
  const ivyCurve = new THREE.CatmullRomCurve3(ivyPoints);
  const ivyStem = applyShadow(new THREE.Mesh(new THREE.TubeGeometry(ivyCurve, 48, 0.016, 5, false), matLogBark));
  foliageGroup.add(ivyStem);
  const ivyLeafGeo = new THREE.IcosahedronGeometry(0.08, 0);
  for (let i = 0; i < 54; i++) {
    const p = ivyCurve.getPoint(i / 53);
    const spread = 0.06 + 0.2 * ivyRand() * (0.6 + 0.4 * Math.sin(i * 0.9));
    const leaf = applyShadow(new THREE.Mesh(ivyLeafGeo, leafMats[i % leafMats.length]));
    leaf.position.set(
      p.x + THREE.MathUtils.clamp((ivyRand() - 0.35) * 2 * spread, -0.12, 0.15), // no leaf strays off the stem
      p.y + (ivyRand() - 0.5) * 0.14,
      ivyZ + 0.01 + ivyRand() * 0.06,
    );
    const s = 0.65 + ivyRand() * 0.75;
    leaf.scale.set(s, s * 0.85, s * 0.45);
    leaf.rotation.set(ivyRand() * Math.PI, ivyRand() * Math.PI, ivyRand() * Math.PI);
    foliageGroup.add(leaf);
  }

  // ---------------------------------------------------------------------------
  // 13. PHYSICS COLLIDERS & RUNTIME ARCHITECTURE
  // ---------------------------------------------------------------------------
  // Simplified bounding box proxies for runtime collision queries
  colliders.push(
    { name: 'foundation', box: new THREE.Box3(new THREE.Vector3(-fWidth / 2, 0, -fDepth / 2), new THREE.Vector3(fWidth / 2, fHeight, fDepth / 2)) },
    { name: 'body', box: new THREE.Box3(new THREE.Vector3(-uWidth / 2, fHeight, -uDepth / 2), new THREE.Vector3(uWidth / 2, fHeight + gHeight + uHeight, uDepth / 2)) },
    { name: 'roof', box: new THREE.Box3(new THREE.Vector3(-uWidth / 2 - 0.3, roofBaseY, -roofLength / 2), new THREE.Vector3(uWidth / 2 + 0.3, ridgeY + 0.2, roofLength / 2)) },
    { name: 'chimney', box: new THREE.Box3(new THREE.Vector3(chimneyBaseX - chW / 2, 0, chimneyBaseZ - chD / 2), new THREE.Vector3(chimneyBaseX + chW / 2, chH + 0.7, chimneyBaseZ + chD / 2)) },
    { name: 'porch', box: new THREE.Box3(new THREE.Vector3(porchBaseX - porchLandingHalfW - 0.03, 0, porchBaseZ + wallZ), new THREE.Vector3(porchBaseX + porchLandingHalfW + 0.03, pGableBaseY + pRise + 0.3, porchBaseZ + landingFront + stepCount * stepRun + 0.03)) },
    { name: 'shed', box: new THREE.Box3(new THREE.Vector3(shedBaseX - shedW - 0.2, 0, -shedD / 2), new THREE.Vector3(shedBaseX, shedPostH + 0.6, shedD / 2)) }
  );

  root.userData.sculptRuntime = {
    nodes: runtimeNodes,
    colliders,
    lights: {
      porchLight: porchLantern.light,
      shedLight: shedLantern.light,
    },
  };

  // Real-time animation loop (lantern flickering & physics-pinned linen sway)
  root.userData.tick = (_delta: number, elapsed: number) => {
    const time = Number.isFinite(elapsed) ? elapsed : 0;

    // 1. Dual lantern flickering with subtle asynchronous phase pulse
    const flicker1 = Math.sin(time * 9.0) * 0.2 + Math.cos(time * 17.5) * 0.15;
    porchLantern.light.intensity = Math.max(1.2, 1.8 + flicker1);

    const flicker2 = Math.cos(time * 8.2 + 1.2) * 0.22 + Math.sin(time * 16.0) * 0.14;
    shedLantern.light.intensity = Math.max(1.2, 1.8 + flicker2);

    // 2. Physics-pinned wind breeze sway on clothesline linens
    // (Rotates smoothly from top edge clamped to rope)
    const wind = Math.sin(time * 2.4) * 0.10 + Math.cos(time * 4.1) * 0.04;
    linen1.rotation.x = wind;
    linen2.rotation.x = wind * 1.18 + 0.03;
  };

  // Radial Explode Parts Visualizer (Kinematically clean radial trajectory)
  root.userData.setExplode = (amount: number) => {
    const amt = Math.max(0, Math.min(1, amount));

    // Foundation drops slightly
    foundationGroup.position.y = -amt * 0.45;

    // Body & Timbers lift upward
    bodyGroup.position.y = amt * 0.35;
    timberGroup.position.y = amt * 0.55;

    // Roof lifts high
    roofGroup.position.y = amt * 1.45;

    // Dormer translates up and out to the right (+X)
    dormerGroup.position.x = dormerBaseX + amt * 1.6;
    dormerGroup.position.y = dormerBaseY + amt * 1.2;

    // Chimney translates out to the left and back (-X, -Z)
    chimneyGroup.position.x = chimneyBaseX - amt * 1.35;
    chimneyGroup.position.z = chimneyBaseZ - amt * 0.45;

    // Front Porch translates forward (+Z)
    porchGroup.position.z = porchBaseZ + amt * 1.35;

    // Woodshed translates to the left (-X)
    shedGroup.position.x = shedBaseX - amt * 1.45;

    // Yard props & foliage expand radially
    propsGroup.position.x = amt * 0.85;
    propsGroup.position.z = -amt * 0.85;
    foliageGroup.position.x = amt * 0.65;
    foliageGroup.position.z = amt * 0.65;
  };

  return root;
}
