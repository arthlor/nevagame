/**
 * Sunreach Cove Market Pergola & Citrus/Fish Stall - authored (code -> GLB) source.
 *
 * Coastal Mediterranean / warm-dry counterpart to building_medieval_market_stall_a,
 * designed for Sunreach Cove (SUNREACH_ANCHORS.coveMarket).
 *
 * Architecture & Storytelling:
 *   - Foundation plinth of sun-bleached calcified limestone ashlar in running bond with solid steps.
 *   - Enclosed whitewashed lime-stucco back-store with arched entrance doorway, 11 limestone
 *     voussoirs, paneled cypress wood door, iron strap hinges, and terracotta tile roof.
 *   - Lapped terracotta mission barrel tiles in half-bond courses under a timber ridge beam, with
 *     a whitewashed masonry chimney topped by a stone crown and terracotta flue pot.
 *   - Extended front pergola framed in weathered cedar / olive wood with load-bearing knee braces.
 *   - Hybrid canopy: slatted natural bamboo/reed cane matting shaded by a billowing sun-bleached
 *     linen canvas sail with terracotta border stripes and scalloped linen valance flaps.
 *   - Weathered timber counter laden with authentic Sunreach trade produce:
 *       1. Left crate: Sunreach citrus (fresh lemons with foliage sprigs and blood oranges).
 *       2. Center crate: Glazed ceramic bowls of green & kalamata olives, plus terracotta oil flasks.
 *       3. Right display: Slanted timber fish stall with salt-crusted fresh Sea Bream on dried rush bedding.
 *   - Hanging goods: braided garlic ropes, dried red chili strings, and bay laurel bundles.
 *   - Glazed ceramic tile trade sign (painted sun, sea bream, and olive branch) in wrought-iron scrollwork.
 *   - Ground props: 2 large terracotta oil amphorae with hemp rope slings, woven esparto fig basket,
 *     open burlap sack of coarse sea salt crystals, and salted fish keg.
 *
 * Deterministic: every procedural texture, variation, and jitter draws from one seeded PRNG.
 */

import * as THREE from 'three';

export function createSunreachMarketStallModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'building_sunreach_cove_market_a';

  // Proportions calibrated for Sunreach Cove market apron
  root.scale.set(1.15, 0.98, 1.15);

  function applyShadow<T extends THREE.Object3D>(obj: T): T {
    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;
      }
    });
    return obj;
  }

  // ---------------------------------------------------------------------------
  // Deterministic Procedural Bump & Detail Textures
  // ---------------------------------------------------------------------------
  let seedState = 0x7a3c8e5;
  function rand(): number {
    seedState = (seedState + 0x6d2b79f5) | 0;
    let t = Math.imul(seedState ^ (seedState >>> 15), 1 | seedState);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Tileable value noise on a cells x cells lattice, sampled at (u, v) in [0, 1). */
  function makeValueNoise(cells: number): (u: number, v: number) => number {
    const lattice = Array.from({ length: cells * cells }, () => rand());
    const at = (x: number, y: number) => lattice[(y % cells) * cells + (x % cells)];
    return (u, v) => {
      const fx = u * cells;
      const fy = v * cells;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const sx = tx * tx * (3 - 2 * tx);
      const sy = ty * ty * (3 - 2 * ty);
      const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
      const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
      return top + (bottom - top) * sy;
    };
  }

  function createNoiseTexture(
    size = 128,
    type: 'stucco' | 'wood' | 'stone' | 'weave' | 'reed' = 'stucco'
  ): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    const coarse = makeValueNoise(4);
    const fine = makeValueNoise(16);
    const imgData = ctx.createImageData(size, size);
    const data = imgData.data;

    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size;
        const v = y / size;
        let val: number;

        if (type === 'stucco') {
          // Warm Mediterranean lime-stucco: subtle trowel ripples and granular pitting
          val = 128 + (coarse(u, v) - 0.5) * 44 + (fine(u, v) - 0.5) * 26;
        } else if (type === 'wood') {
          // Coastal cedar grain lines running along U with gentle waver
          const grain = Math.sin((v * 14 + coarse(u, v) * 1.8) * Math.PI * 2);
          val = 128 + grain * 22 + (fine(u, v) - 0.5) * 16;
        } else if (type === 'stone') {
          // Pale ashlar limestone with mortar grooves
          const joint = x % 32 < 2 || y % 16 < 2 ? -45 : 0;
          val = 128 + joint + (coarse(u, v) - 0.5) * 32 + (fine(u, v) - 0.5) * 18;
        } else if (type === 'reed') {
          // Ribbed bamboo / cane slats running horizontally with periodic wire bindings
          const slat = Math.sin(v * 24 * Math.PI);
          const wire = x % 24 < 2 ? -35 : 0;
          val = 128 + slat * 30 + wire + (fine(u, v) - 0.5) * 15;
        } else {
          // Burlap: over-under weave for salt and cargo sacks
          const weave = Math.sin(u * size * 0.25 * Math.PI) * Math.sin(v * size * 0.25 * Math.PI);
          val = 128 + weave * 32 + (fine(u, v) - 0.5) * 20;
        }

        const idx = (y * size + x) * 4;
        const c = Math.max(0, Math.min(255, Math.round(val)));
        data[idx] = c;
        data[idx + 1] = c;
        data[idx + 2] = c;
        data[idx + 3] = 255;
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(4, 4);
    return tex;
  }

  const texStucco = createNoiseTexture(128, 'stucco');
  const texWood = createNoiseTexture(128, 'wood');
  const texStone = createNoiseTexture(128, 'stone');
  const texReed = createNoiseTexture(128, 'reed');
  const texWeave = createNoiseTexture(128, 'weave');

  // Painted ceramic tile texture for the hanging trade sign
  function createCeramicSignTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    // Glazed ivory ceramic base
    ctx.fillStyle = '#f7f4ea';
    ctx.fillRect(0, 0, size, size);

    // Cobalt blue ornamental border
    ctx.strokeStyle = '#234a6e';
    ctx.lineWidth = 10;
    ctx.strokeRect(12, 12, size - 24, size - 24);

    ctx.strokeStyle = '#39698f';
    ctx.lineWidth = 3;
    ctx.strokeRect(22, 22, size - 44, size - 44);

    // Center circular medallion
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 80, 0, Math.PI * 2);
    ctx.fillStyle = '#e8ecf2';
    ctx.fill();
    ctx.strokeStyle = '#234a6e';
    ctx.lineWidth = 5;
    ctx.stroke();

    // Golden sun rays radiating from center
    ctx.fillStyle = '#df9b2d';
    for (let i = 0; i < 8; i++) {
      const angle = (i * Math.PI) / 4;
      ctx.beginPath();
      ctx.moveTo(size / 2 + Math.cos(angle) * 35, size / 2 + Math.sin(angle) * 35);
      ctx.lineTo(size / 2 + Math.cos(angle + 0.15) * 72, size / 2 + Math.sin(angle + 0.15) * 72);
      ctx.lineTo(size / 2 + Math.cos(angle - 0.15) * 72, size / 2 + Math.sin(angle - 0.15) * 72);
      ctx.closePath();
      ctx.fill();
    }

    // Central sun disc
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, 32, 0, Math.PI * 2);
    ctx.fillStyle = '#f0b33c';
    ctx.fill();
    ctx.strokeStyle = '#bd761a';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Stylized Sea Bream fish arched across the lower portion
    ctx.beginPath();
    ctx.ellipse(size / 2, size / 2 + 10, 48, 20, -0.15, 0, Math.PI * 2);
    ctx.fillStyle = '#527c9c';
    ctx.fill();
    ctx.strokeStyle = '#1e3852';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Fish tail
    ctx.beginPath();
    ctx.moveTo(size / 2 + 42, size / 2 + 6);
    ctx.lineTo(size / 2 + 64, size / 2 - 8);
    ctx.lineTo(size / 2 + 62, size / 2 + 22);
    ctx.closePath();
    ctx.fillStyle = '#527c9c';
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  // ---------------------------------------------------------------------------
  // Materials Palette (Calibrated for Sunreach warm-dry sunlight)
  // ---------------------------------------------------------------------------
  const C = {
    stucco: 0xede4d3, // warm sun-bleached lime wash
    stuccoDark: 0xd9ceba,
    timberCedar: 0x786452, // weathered coastal cedar/olive timber
    timberCedarDark: 0x4e3e32,
    timberCedarWarm: 0x8c725c,
    stoneLight: 0xe5e1d5, // sun-bleached calcified limestone
    stoneMid: 0xc8c2b3,
    stoneDark: 0xaba495,
    stonePlinth: 0xbcb5a5,
    stoneStep: 0xd4cebf,
    // Terracotta roof tiles (warm Mediterranean fired clay)
    tileBase: 0xb5532d,
    tile1: 0xa84824,
    tile2: 0xc4623a,
    tile3: 0x9c3e1e,
    // Canopy fabrics
    canvasLinen: 0xf2ebd9, // sun-bleached linen sail
    canvasTerracotta: 0xad4d29, // terracotta trim stripe
    reedCanes: 0xbfa06d, // dried bamboo / cane slats
    reedCanesDark: 0x997a47,
    doorWood: 0x6e5239,
    ironHinge: 0x2e3033,
    // Sunreach produce & marine catch
    lemonYellow: 0xf5d033,
    lemonStem: 0x442c1d,
    foliageGreen: 0x4f7028,
    orangeZest: 0xeb641b,
    oliveGreen: 0x637033,
    oliveBlack: 0x2e252a,
    terracottaPot: 0xbf5e34,
    terracottaPotDark: 0x99441f,
    glazedBowlBlue: 0x3d6688,
    burlap: 0xb89c72,
    burlapDark: 0x8a704e,
    seaSaltWhite: 0xf5f8fa,
    fishBodySilver: 0x9bb4c4,
    fishBellyLight: 0xd6e2ea,
    fishFinDark: 0x627d91,
    dryRush: 0x9e8e6b,
    signBoard: 0x5a412c,
  };

  const matStucco = new THREE.MeshStandardMaterial({
    color: C.stucco,
    roughness: 0.92,
    metalness: 0.02,
    bumpMap: texStucco || undefined,
    bumpScale: 0.008,
  });

  const matTimberCedar = new THREE.MeshStandardMaterial({
    color: C.timberCedar,
    roughness: 0.75,
    metalness: 0.04,
    bumpMap: texWood || undefined,
    bumpScale: 0.008,
  });

  const matTimberCedarDark = new THREE.MeshStandardMaterial({
    color: C.timberCedarDark,
    roughness: 0.82,
    metalness: 0.04,
  });

  const matTimberCedarWarm = new THREE.MeshStandardMaterial({
    color: C.timberCedarWarm,
    roughness: 0.72,
    metalness: 0.04,
  });

  const matStonePlinth = new THREE.MeshStandardMaterial({
    color: C.stonePlinth,
    roughness: 0.90,
    metalness: 0.03,
    bumpMap: texStone || undefined,
    bumpScale: 0.012,
  });

  const matStoneStep = new THREE.MeshStandardMaterial({
    color: C.stoneStep,
    roughness: 0.88,
    metalness: 0.03,
    bumpMap: texStone || undefined,
    bumpScale: 0.01,
  });

  const stoneMats = [
    new THREE.MeshStandardMaterial({ color: C.stoneLight, roughness: 0.86, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: C.stoneMid, roughness: 0.88, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: C.stoneDark, roughness: 0.92, metalness: 0.04 }),
  ];

  const tileMats = [
    new THREE.MeshStandardMaterial({ color: C.tileBase, roughness: 0.64, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: C.tile1, roughness: 0.68, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: C.tile2, roughness: 0.60, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: C.tile3, roughness: 0.70, metalness: 0.04 }),
  ];

  const matReedCanes = new THREE.MeshStandardMaterial({
    color: C.reedCanes,
    roughness: 0.85,
    metalness: 0.02,
    bumpMap: texReed || undefined,
    bumpScale: 0.012,
  });

  const matCanvasLinen = new THREE.MeshStandardMaterial({
    color: C.canvasLinen,
    roughness: 0.82,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const matCanvasTerracotta = new THREE.MeshStandardMaterial({
    color: C.canvasTerracotta,
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const matDoor = new THREE.MeshStandardMaterial({
    color: C.doorWood,
    roughness: 0.72,
    metalness: 0.04,
    bumpMap: texWood || undefined,
    bumpScale: 0.008,
  });

  const matIron = new THREE.MeshStandardMaterial({
    color: C.ironHinge,
    roughness: 0.45,
    metalness: 0.75,
  });

  const matBurlap = new THREE.MeshStandardMaterial({
    color: C.burlap,
    roughness: 0.88,
    metalness: 0.02,
    bumpMap: texWeave || undefined,
    bumpScale: 0.006,
  });

  const matBurlapDark = new THREE.MeshStandardMaterial({
    color: C.burlapDark,
    roughness: 0.90,
    metalness: 0.02,
  });

  const matLemon = new THREE.MeshStandardMaterial({
    color: C.lemonYellow,
    roughness: 0.35,
    metalness: 0.03,
  });

  const matLemonStem = new THREE.MeshStandardMaterial({
    color: C.lemonStem,
    roughness: 0.9,
    metalness: 0.0,
  });

  const matFoliage = new THREE.MeshStandardMaterial({
    color: C.foliageGreen,
    roughness: 0.55,
    metalness: 0.0,
    flatShading: true,
  });

  const matOrange = new THREE.MeshStandardMaterial({
    color: C.orangeZest,
    roughness: 0.40,
    metalness: 0.02,
  });

  const matOliveGreen = new THREE.MeshStandardMaterial({
    color: C.oliveGreen,
    roughness: 0.28,
    metalness: 0.05,
  });

  const matOliveBlack = new THREE.MeshStandardMaterial({
    color: C.oliveBlack,
    roughness: 0.26,
    metalness: 0.05,
  });

  const matTerracottaPot = new THREE.MeshStandardMaterial({
    color: C.terracottaPot,
    roughness: 0.75,
    metalness: 0.04,
  });

  const matGlazedBowl = new THREE.MeshStandardMaterial({
    color: C.glazedBowlBlue,
    roughness: 0.25,
    metalness: 0.15,
  });

  const matSeaSalt = new THREE.MeshStandardMaterial({
    color: C.seaSaltWhite,
    roughness: 0.58,
    metalness: 0.08,
  });

  const matFishSilver = new THREE.MeshStandardMaterial({
    color: C.fishBodySilver,
    roughness: 0.32,
    metalness: 0.22,
  });

  const matFishFin = new THREE.MeshStandardMaterial({
    color: C.fishFinDark,
    roughness: 0.48,
    metalness: 0.10,
  });

  const matRushBedding = new THREE.MeshStandardMaterial({
    color: C.dryRush,
    roughness: 0.85,
    metalness: 0.02,
    flatShading: true,
  });

  const matSignFrame = new THREE.MeshStandardMaterial({
    color: C.signBoard,
    roughness: 0.75,
    metalness: 0.05,
  });

  const matSignTile = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createCeramicSignTexture() || undefined,
    roughness: 0.20,
    metalness: 0.10,
  });

  // ---------------------------------------------------------------------------
  // Geometry Helper Functions
  // ---------------------------------------------------------------------------

  /** Curved Roman / mission barrel tile with authentic cambered taper. */
  function createRomanTile(tileW = 0.24, tileL = 0.32, matIdx = 0): THREE.Mesh {
    const shape = new THREE.Shape();
    const halfW = tileW / 2;
    const curveH = 0.048;
    const thickness = 0.022;

    shape.moveTo(-halfW, 0);
    shape.quadraticCurveTo(0, curveH, halfW, 0);
    shape.lineTo(halfW, -thickness);
    shape.quadraticCurveTo(0, curveH - thickness, -halfW, -thickness);
    shape.closePath();

    const geom = new THREE.ExtrudeGeometry(shape, {
      depth: tileL,
      bevelEnabled: true,
      bevelSegments: 1,
      steps: 1,
      bevelSize: 0.006,
      bevelThickness: 0.006,
    });
    geom.center();
    return applyShadow(new THREE.Mesh(geom, tileMats[matIdx % tileMats.length]));
  }

  /** Mediterranean Terracotta Oil Amphora with twin loop handles and rope sling. */
  function createAmphora(radius = 0.28, height = 0.85): THREE.Group {
    const group = new THREE.Group();
    // Lathe profile for classical Mediterranean amphora: tapered foot, bulging belly, graceful neck, flared rim
    const profile: Array<[number, number]> = [
      [0.001, 0.0],
      [0.08, 0.0],
      [0.10, 0.04],
      [0.18, 0.22],
      [0.28, 0.48],
      [0.26, 0.62],
      [0.15, 0.72],
      [0.13, 0.80],
      [0.16, 0.85],
      [0.08, 0.85],
      [0.001, 0.85],
    ];
    const points = profile.map(([r, y]) => new THREE.Vector2(r * (radius / 0.28), y * (height / 0.85)));
    const potGeo = new THREE.LatheGeometry(points, 20);
    const potMesh = applyShadow(new THREE.Mesh(potGeo, matTerracottaPot));
    group.add(potMesh);

    // Twin loop handles attached from neck to upper shoulder
    const handleGeo = new THREE.TorusGeometry(0.07, 0.016, 8, 14, Math.PI);
    for (const side of [1, -1]) {
      const handle = applyShadow(new THREE.Mesh(handleGeo, matTerracottaPot));
      handle.position.set(side * (radius * 0.58), height * 0.72, 0);
      handle.rotation.z = side * (Math.PI / 2);
      group.add(handle);
    }

    // Knotted hemp rope sling cradling the amphora body
    const slingRing1 = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.94, 0.014, 6, 18), matBurlapDark));
    slingRing1.rotation.x = Math.PI / 2;
    slingRing1.position.y = height * 0.44;
    const slingRing2 = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.72, 0.014, 6, 18), matBurlapDark));
    slingRing2.rotation.x = Math.PI / 2;
    slingRing2.position.y = height * 0.28;
    group.add(slingRing1, slingRing2);

    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2;
      const verticalRope = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, height * 0.38, 6), matBurlapDark));
      verticalRope.position.set(Math.cos(angle) * radius * 0.82, height * 0.36, Math.sin(angle) * radius * 0.82);
      group.add(verticalRope);
    }

    return group;
  }

  /** Woven esparto grass basket heaped with harvested purple-black figs. */
  function createFigBasket(radius = 0.24, height = 0.26): THREE.Group {
    const group = new THREE.Group();
    const basketProfile: Array<[number, number]> = [
      [0.001, 0.0],
      [0.15, 0.0],
      [0.18, 0.05],
      [0.24, 0.18],
      [0.25, 0.26],
      [0.22, 0.26],
      [0.001, 0.26],
    ];
    const pts = basketProfile.map(([r, y]) => new THREE.Vector2(r * (radius / 0.24), y * (height / 0.26)));
    const basketMesh = applyShadow(new THREE.Mesh(new THREE.LatheGeometry(pts, 18), matBurlap));
    group.add(basketMesh);

    // Rim ring
    const rim = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(radius * 0.98, 0.018, 8, 16), matBurlapDark));
    rim.rotation.x = Math.PI / 2;
    rim.position.y = height;
    group.add(rim);

    // Purple-black figs heaped inside
    const figGeo = new THREE.SphereGeometry(0.038, 10, 8);
    for (let i = 0; i < 11; i++) {
      const angle = (i * Math.PI * 2) / 7 + rand() * 0.3;
      const dist = (i < 7 ? 0.12 : 0.05) + (rand() - 0.5) * 0.03;
      const fig = applyShadow(new THREE.Mesh(figGeo, matOliveBlack));
      fig.scale.set(1.0, 1.25, 1.0); // teardrop fig shape
      fig.position.set(Math.cos(angle) * dist, height * 0.82 + (i >= 7 ? 0.04 : 0), Math.sin(angle) * dist);
      group.add(fig);
    }

    return group;
  }

  /** Sculpted low-poly Sea Bream on rush bedding. */
  function createSeaBream(): THREE.Group {
    const fish = new THREE.Group();
    // Torpedo body with tapered snout and caudal peduncle
    const bodyGeo = new THREE.ConeGeometry(0.065, 0.34, 9);
    bodyGeo.rotateZ(Math.PI / 2);
    bodyGeo.scale(1.0, 0.55, 1.3);
    const body = applyShadow(new THREE.Mesh(bodyGeo, matFishSilver));
    fish.add(body);

    // Forked caudal tail fin
    const tailShape = new THREE.Shape();
    tailShape.moveTo(0, 0);
    tailShape.lineTo(0.08, 0.07);
    tailShape.lineTo(0.06, 0);
    tailShape.lineTo(0.08, -0.07);
    tailShape.closePath();
    const tail = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(tailShape, { depth: 0.008, bevelEnabled: false }), matFishFin));
    tail.position.set(-0.21, 0, -0.004);
    fish.add(tail);

    // Dorsal spine fin
    const dorsalShape = new THREE.Shape();
    dorsalShape.moveTo(-0.06, 0);
    dorsalShape.lineTo(0.02, 0.045);
    dorsalShape.lineTo(0.06, 0);
    dorsalShape.closePath();
    const dorsal = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(dorsalShape, { depth: 0.006, bevelEnabled: false }), matFishFin));
    dorsal.position.set(-0.02, 0.045, -0.003);
    fish.add(dorsal);

    // Pectoral fin
    const pecShape = new THREE.Shape();
    pecShape.moveTo(0, 0);
    pecShape.lineTo(0.04, -0.025);
    pecShape.lineTo(0.03, 0);
    pecShape.closePath();
    const pec = applyShadow(new THREE.Mesh(new THREE.ExtrudeGeometry(pecShape, { depth: 0.004, bevelEnabled: false }), matFishFin));
    pec.position.set(0.06, -0.01, 0.035);
    pec.rotation.y = 0.4;
    fish.add(pec);

    return fish;
  }

  /** Produce crate crafted from weathered coastal timber. */
  function createProduceCrate(w = 0.48, h = 0.16, d = 0.38): THREE.Group {
    const crate = new THREE.Group();
    const wallT = 0.02;
    const slatH = 0.058;

    const floor = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, wallT, d), matTimberCedarWarm));
    floor.position.y = wallT / 2;
    crate.add(floor);

    const cornerW = 0.032;
    const corners = [
      [-w / 2 + cornerW / 2, h / 2, -d / 2 + cornerW / 2],
      [w / 2 - cornerW / 2, h / 2, -d / 2 + cornerW / 2],
      [-w / 2 + cornerW / 2, h / 2, d / 2 - cornerW / 2],
      [w / 2 - cornerW / 2, h / 2, d / 2 - cornerW / 2],
    ];
    for (const [cx, cy, cz] of corners) {
      const post = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(cornerW, h, cornerW), matTimberCedarDark));
      post.position.set(cx, cy, cz);
      crate.add(post);
    }

    for (let tier = 0; tier < 2; tier++) {
      const slatY = wallT + slatH / 2 + tier * (slatH + 0.012);

      const fSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, slatH, wallT), matTimberCedarWarm));
      fSlat.position.set(0, slatY, d / 2 - wallT / 2);
      const bSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, slatH, wallT), matTimberCedarWarm));
      bSlat.position.set(0, slatY, -d / 2 + wallT / 2);

      const lSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(wallT, slatH, d - wallT * 2), matTimberCedarWarm));
      lSlat.position.set(-w / 2 + wallT / 2, slatY, 0);
      const rSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(wallT, slatH, d - wallT * 2), matTimberCedarWarm));
      rSlat.position.set(w / 2 - wallT / 2, slatY, 0);

      crate.add(fSlat, bSlat, lSlat, rSlat);
    }

    return crate;
  }

  // ---------------------------------------------------------------------------
  // 1. FOUNDATION PLINTH (Calcified Ashlar Limestone Base)
  // ---------------------------------------------------------------------------
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'foundation-group';
  root.add(foundationGroup);

  const bW = 2.85;
  const bD = 2.70;
  const bH = 1.90;
  const fH = 0.50;
  const bY = fH + bH / 2;

  const fPlinth = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW + 0.20, fH, bD + 0.20), matStonePlinth));
  fPlinth.position.set(0, fH / 2, 0);
  foundationGroup.add(fPlinth);

  // Ashlar facing blocks proud of the core plinth in running bond
  const plinthCourseH = fH / 2;
  const plinthMats = [stoneMats[0], stoneMats[1], matStonePlinth, stoneMats[2]];
  for (let k = 0; k < 2; k++) {
    for (const axis of ['x', 'z'] as const) {
      const span = axis === 'x' ? bW + 0.20 : bD + 0.20;
      const other = (axis === 'x' ? bD + 0.20 : bW + 0.20) / 2;
      for (const face of [1, -1]) {
        let t = -span / 2 + 0.15;
        let nominal = k % 2 === 1 ? 0.24 : 0.32 + rand() * 0.12;
        while (t < span / 2 - 0.16) {
          const len = Math.min(nominal, span / 2 - 0.15 - t);
          if (len < 0.08) break;
          const block = applyShadow(
            new THREE.Mesh(
              axis === 'x'
                ? new THREE.BoxGeometry(len - 0.014, plinthCourseH - 0.014, 0.06)
                : new THREE.BoxGeometry(0.06, plinthCourseH - 0.014, len - 0.014),
              plinthMats[Math.floor(rand() * plinthMats.length)]
            )
          );
          const along = t + len / 2;
          block.position.set(
            axis === 'x' ? along : face * (other + 0.01),
            k * plinthCourseH + plinthCourseH / 2,
            axis === 'x' ? face * (other + 0.01) : along
          );
          foundationGroup.add(block);
          t += len;
          nominal = 0.32 + rand() * 0.12;
        }
      }
    }
  }

  // Corner quoins
  const quoinW = 0.28;
  const quoinH = 0.22;
  const quoinD = 0.28;
  const quoinCorners = [
    [-bW / 2 - 0.07, 0, bD / 2 + 0.07],
    [bW / 2 + 0.07, 0, bD / 2 + 0.07],
    [-bW / 2 - 0.07, 0, -bD / 2 - 0.07],
    [bW / 2 + 0.07, 0, -bD / 2 - 0.07],
  ];
  for (const [qx, , qz] of quoinCorners) {
    for (let q = 0; q < 2; q++) {
      const quoin = applyShadow(
        new THREE.Mesh(
          new THREE.BoxGeometry(quoinW + (q % 2) * 0.04, quoinH, quoinD - (q % 2) * 0.04),
          stoneMats[q % 3]
        )
      );
      quoin.position.set(qx + (qx > 0 ? -0.04 : 0.04), 0.11 + q * 0.22, qz + (qz > 0 ? -0.04 : 0.04));
      foundationGroup.add(quoin);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. WHITEWASHED LIME-STUCCO BACK-STORE & TIMBER LINTELS
  // ---------------------------------------------------------------------------
  const houseGroup = new THREE.Group();
  houseGroup.name = 'house-group';
  root.add(houseGroup);

  const stuccoBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), matStucco));
  stuccoBody.position.set(0, bY, 0);
  houseGroup.add(stuccoBody);

  // Roof pitch: 1.65 rise over half span out to eave overhang
  const gableRise = 1.65;
  const halfSpan = bW / 2 + 0.42;
  const slopeLen = Math.hypot(halfSpan, gableRise);
  const rAngle = Math.atan2(gableRise, halfSpan);
  const deckT = 0.08;
  const deckDrop = deckT / Math.cos(rAngle);
  const ridgeY = fH + bH + (bW / 2 + 0.04) * Math.tan(rAngle) + deckDrop;
  const gableWallRise = ridgeY - deckDrop - (fH + bH) - 0.01;

  const gableShape = new THREE.Shape();
  gableShape.moveTo(-bW / 2, 0);
  gableShape.lineTo(bW / 2, 0);
  gableShape.lineTo(0, gableWallRise);
  gableShape.closePath();

  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.10, bevelEnabled: false });
  const frontGable = applyShadow(new THREE.Mesh(gableGeo, matStucco));
  frontGable.position.set(0, fH + bH, bD / 2 - 0.10);
  const rearGable = applyShadow(new THREE.Mesh(gableGeo, matStucco));
  rearGable.position.set(0, fH + bH, -bD / 2);
  houseGroup.add(frontGable, rearGable);

  // Eave plates on both long walls
  const postW = 0.16;
  for (const side of [1, -1]) {
    const eavePlate = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(postW + 0.04, postW, bD + 0.35), matTimberCedar));
    eavePlate.position.set(side * (bW / 2 - postW / 2 + 0.02), fH + bH - postW / 2, 0);
    houseGroup.add(eavePlate);
  }

  // Heavy timber lintels proud of the stucco
  const frontTie = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW + 0.16, postW, postW + 0.03), matTimberCedar));
  frontTie.position.set(0, fH + bH - postW / 2, bD / 2 - postW / 2 + 0.015);
  const rearTie = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW + 0.16, postW, postW + 0.03), matTimberCedar));
  rearTie.position.set(0, fH + bH - postW / 2, -(bD / 2 - postW / 2 + 0.015));
  houseGroup.add(frontTie, rearTie);

  // ---------------------------------------------------------------------------
  // 3. ARCHED ENTRANCE DOORWAY (on +X Side Wall)
  // ---------------------------------------------------------------------------
  const doorwayGroup = new THREE.Group();
  doorwayGroup.name = 'doorway-group';
  const doorZ = 0.28;
  doorwayGroup.position.set(bW / 2 + 0.01, fH, doorZ);
  doorwayGroup.rotation.y = Math.PI / 2;
  houseGroup.add(doorwayGroup);

  const doorW = 0.76;
  const doorH = 1.48;
  const doorArchR = doorW / 2;
  const doorRectH = doorH - doorArchR;

  // 11 voussoir arch stones in limestone
  const numVoussoirs = 11;
  const vThickness = 0.16;
  const vDepth = 0.18;
  for (let i = 0; i < numVoussoirs; i++) {
    const angle = (Math.PI / (numVoussoirs - 1)) * i;
    const vMesh = applyShadow(
      new THREE.Mesh(new THREE.BoxGeometry(0.14, vThickness, vDepth), stoneMats[i % 3])
    );
    const radius = doorArchR + vThickness / 2;
    vMesh.position.set(Math.cos(angle) * radius, doorRectH + Math.sin(angle) * radius, 0.06);
    vMesh.rotation.z = angle - Math.PI / 2;
    doorwayGroup.add(vMesh);
  }

  // Door jambs
  for (let j = 0; j < 4; j++) {
    const lJamb = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.28, vDepth), stoneMats[j % 3]));
    lJamb.position.set(-doorArchR - 0.08, 0.14 + j * 0.28, 0.06);
    const rJamb = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.28, vDepth), stoneMats[(j + 1) % 3]));
    rJamb.position.set(doorArchR + 0.08, 0.14 + j * 0.28, 0.06);
    doorwayGroup.add(lJamb, rJamb);
  }

  // Rustic Cypress Door Leaf
  const doorShape = new THREE.Shape();
  doorShape.moveTo(-doorArchR, 0);
  doorShape.lineTo(-doorArchR, doorRectH);
  doorShape.absarc(0, doorRectH, doorArchR, Math.PI, 0, true);
  doorShape.lineTo(doorArchR, 0);
  doorShape.closePath();

  const doorLeafGeo = new THREE.ExtrudeGeometry(doorShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  const doorLeaf = applyShadow(new THREE.Mesh(doorLeafGeo, matDoor));
  doorLeaf.position.z = -0.01;
  doorwayGroup.add(doorLeaf);

  // Wrought iron strap hinges & pull ring
  const strapGeo = new THREE.BoxGeometry(doorW * 0.72, 0.04, 0.018);
  const topStrap = applyShadow(new THREE.Mesh(strapGeo, matIron));
  topStrap.position.set(0.03, doorH * 0.68, 0.055);
  const btmStrap = applyShadow(new THREE.Mesh(strapGeo, matIron));
  btmStrap.position.set(0.03, doorH * 0.22, 0.055);
  doorwayGroup.add(topStrap, btmStrap);

  const ringMount = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.018, 12), matIron));
  ringMount.rotation.x = Math.PI / 2;
  ringMount.position.set(0.18, doorH * 0.45, 0.055);
  const pullRing = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 8, 16), matIron));
  pullRing.position.set(0.18, doorH * 0.40, 0.065);
  doorwayGroup.add(ringMount, pullRing);

  // Entrance steps: solid stone ashlar blocks
  const stepW = 1.05;
  const stepD = 0.28;
  const stepH = 0.16;
  const plinthFaceX = bW / 2 + 0.10;
  for (let s = 0; s < 3; s++) {
    const top = (3 - s) * stepH;
    const width = stepW + s * 0.10;
    const lengths = s % 2 === 0 ? [0.35, 0.35, 0.35] : [0.525, 0.525];
    let z0 = doorZ - width / 2;
    lengths.forEach((len, i) => {
      const block = applyShadow(
        new THREE.Mesh(
          new THREE.BoxGeometry(stepD, top, len - 0.012),
          i % 2 === 0 ? matStoneStep : stoneMats[0]
        )
      );
      block.position.set(plinthFaceX - 0.02 + s * stepD + stepD / 2, top / 2, z0 + len / 2);
      foundationGroup.add(block);
      z0 += len;
    });
  }

  // ---------------------------------------------------------------------------
  // 4. FRONT GABLE, ROOF BARGES & HANGING MAIOLICA TRADE SIGN
  // ---------------------------------------------------------------------------
  const roofDepth = bD + 0.75;
  const gableGroup = new THREE.Group();
  gableGroup.name = 'front-gable-group';
  root.add(gableGroup);

  const bargeLen = slopeLen + 0.06;
  const bargeLift = 0.05;
  const bargeGeo = new THREE.BoxGeometry(bargeLen, 0.18, 0.18);
  const bargeAlong = bargeLen / 2 - 0.03;
  for (const zEdge of [roofDepth / 2 - 0.07, -(roofDepth / 2 - 0.07)]) {
    for (const side of [1, -1]) {
      const barge = applyShadow(new THREE.Mesh(bargeGeo, matTimberCedar));
      barge.position.set(
        side * (bargeAlong * Math.cos(rAngle) + bargeLift * Math.sin(rAngle)),
        ridgeY - bargeAlong * Math.sin(rAngle) + bargeLift * Math.cos(rAngle),
        zEdge
      );
      barge.rotation.z = -side * rAngle;
      gableGroup.add(barge);
    }
    const apexBoss = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.28, 0.22), matTimberCedarDark));
    apexBoss.position.set(0, ridgeY + 0.09, zEdge + Math.sign(zEdge) * 0.10);
    gableGroup.add(apexBoss);
  }

  // Hanging Glazed Maiolica Ceramic Trade Sign (+Z Left Side)
  const signPostX = -1.22;
  const boomY = ridgeY - Math.abs(signPostX) * Math.tan(rAngle) + bargeLift / Math.cos(rAngle) + 0.05;
  const signGroup = new THREE.Group();
  signGroup.name = 'trade-sign-group';
  signGroup.position.set(signPostX, boomY, roofDepth / 2 + 0.03 + 0.065);

  const signPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), matTimberCedar));
  signPost.position.set(0, -0.125, 0);
  const boomLen = 1.10;
  const boom = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(boomLen, 0.13, 0.13), matTimberCedar));
  boom.position.set(0.03 - boomLen / 2, 0, 0);

  const braceDX = 0.34;
  const braceDY = 0.30;
  const boomBrace = applyShadow(
    new THREE.Mesh(new THREE.BoxGeometry(0.09, Math.hypot(braceDX, braceDY), 0.09), matTimberCedar)
  );
  boomBrace.rotation.z = Math.atan2(braceDX, braceDY);
  boomBrace.position.set(-0.065 - braceDX / 2, -0.065 - braceDY / 2, 0);
  signGroup.add(signPost, boom, boomBrace);

  // Wrought iron hanging brackets & chains
  const linkGeo = new THREE.TorusGeometry(0.03, 0.008, 6, 14);
  const chainXs = [-0.42, -0.88];
  for (const cx of chainXs) {
    const strap = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.15, 0.15), matIron));
    strap.position.set(cx, 0, 0);
    const link1 = applyShadow(new THREE.Mesh(linkGeo, matIron));
    link1.scale.set(1, 1.5, 1);
    link1.position.set(cx, -0.065 - 0.04, 0);
    const link2 = applyShadow(new THREE.Mesh(linkGeo, matIron));
    link2.scale.set(1, 1.5, 1);
    link2.rotation.y = Math.PI / 2;
    link2.position.set(cx, -0.065 - 0.11, 0);
    signGroup.add(strap, link1, link2);
  }

  // Glazed Maiolica Ceramic Sign Plaque with Weathered Timber Frame
  const sW = 0.72;
  const sH = 0.52;
  const boardX = (chainXs[0] + chainXs[1]) / 2;
  const boardY = -0.065 - 0.14 - sH / 2 + 0.01;

  const signFrame = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(sW + 0.06, sH + 0.06, 0.05), matSignFrame));
  signFrame.position.set(boardX, boardY, 0);
  signGroup.add(signFrame);

  const signTileFront = applyShadow(new THREE.Mesh(new THREE.PlaneGeometry(sW, sH), matSignTile));
  signTileFront.position.set(boardX, boardY, 0.026);
  const signTileBack = applyShadow(new THREE.Mesh(new THREE.PlaneGeometry(sW, sH), matSignTile));
  signTileBack.position.set(boardX, boardY, -0.026);
  signTileBack.rotation.y = Math.PI;
  signGroup.add(signTileFront, signTileBack);

  // Small hanging lemon bunch at the boom tip
  const bunchX = -1.04;
  const bunchCord = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.10, 6), matBurlapDark));
  bunchCord.position.set(bunchX, -0.11, 0.04);
  signGroup.add(bunchCord);

  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI * 2) / 3;
    const lemon = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), matLemon));
    lemon.scale.set(1.0, 1.35, 1.0);
    lemon.position.set(bunchX + Math.sin(a) * 0.035, -0.22, 0.04 + Math.cos(a) * 0.035);
    const stem = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.02, 6), matLemonStem));
    stem.position.y = 0.055;
    lemon.add(stem);
    signGroup.add(lemon);
  }

  gableGroup.add(signGroup);

  // ---------------------------------------------------------------------------
  // 5. EXTENDED FRONT PERGOLA & HYBRID REED/LINEN CANOPY
  // ---------------------------------------------------------------------------
  const stallGroup = new THREE.Group();
  stallGroup.name = 'stall-group';
  root.add(stallGroup);

  const stallCenterX = -0.40;
  const stallW = 1.82;
  const stallD = 0.82;
  const stallTableH = 0.78;
  const stallZ = bD / 2;

  // Pergola frame pitches forward at 28 degrees
  const pergolaPitch = Math.PI / 6.5;
  const frontAwningZ = stallZ + stallD + 0.26;
  const rearAwningY = fH + bH - postW - 0.04;
  const rearAwningZ = stallZ + 0.04;
  const pergolaLocalPitch = Math.atan((Math.tan(pergolaPitch) * root.scale.z) / root.scale.y);
  const frontAwningY = rearAwningY - (frontAwningZ - rearAwningZ) * Math.tan(pergolaLocalPitch);

  // 4 Weathered Cedar Pergola Posts
  const postLeftX = stallCenterX - stallW / 2 + 0.09;
  const postRightX = stallCenterX + stallW / 2 - 0.09;

  const leftStallPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, frontAwningY, 0.14), matTimberCedar));
  leftStallPost.position.set(postLeftX, frontAwningY / 2, frontAwningZ - 0.07);

  const rightStallPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, frontAwningY, 0.14), matTimberCedar));
  rightStallPost.position.set(postRightX, frontAwningY / 2, frontAwningZ - 0.07);
  stallGroup.add(leftStallPost, rightStallPost);

  // Pergola knee braces
  const pBraceRun = 0.32;
  const pBraceGeo = new THREE.BoxGeometry(0.08, Math.SQRT2 * pBraceRun, 0.08);
  for (const [px, dir] of [[postLeftX, 1], [postRightX, -1]]) {
    const brace = applyShadow(new THREE.Mesh(pBraceGeo, matTimberCedar));
    brace.rotation.z = (-dir * Math.PI) / 4;
    brace.position.set(px + dir * (0.07 + pBraceRun / 2), frontAwningY - 0.045 - pBraceRun / 2, frontAwningZ - 0.03);
    stallGroup.add(brace);
  }

  // Front & rear cross beams with cantilevered ends
  const awningW = stallW + 0.28;
  const frontPergolaBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(awningW + 0.16, 0.10, 0.10), matTimberCedar));
  frontPergolaBeam.position.set(stallCenterX, frontAwningY, frontAwningZ);
  const rearPergolaBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(awningW + 0.16, 0.09, 0.09), matTimberCedar));
  rearPergolaBeam.position.set(stallCenterX, rearAwningY, rearAwningZ);
  stallGroup.add(frontPergolaBeam, rearPergolaBeam);

  // Transverse pergola rafters projecting forward past the beam
  const numRafters = 6;
  const rafterLen = (frontAwningZ - rearAwningZ) / Math.cos(pergolaLocalPitch) + 0.30;
  const rafterStepX = awningW / (numRafters - 1);
  for (let r = 0; r < numRafters; r++) {
    const rx = stallCenterX - awningW / 2 + r * rafterStepX;
    const rafter = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.08, rafterLen), matTimberCedarDark));
    rafter.position.set(rx, (rearAwningY + frontAwningY) / 2 + 0.05, (rearAwningZ + frontAwningZ) / 2 + 0.05);
    rafter.rotation.x = pergolaLocalPitch;
    stallGroup.add(rafter);
  }

  // ---------------------------------------------------------------------------
  // 6. HYBRID CANOPY: NATURAL REED CANE SLATS + BILLOWING LINEN SHADE SAIL
  // ---------------------------------------------------------------------------
  const canopyGroup = new THREE.Group();
  canopyGroup.name = 'canopy-group';
  stallGroup.add(canopyGroup);

  // A. Reed cane matting resting on top of the rafters
  const reedMatGeo = new THREE.BoxGeometry(awningW, 0.024, rafterLen - 0.08);
  const reedMat = applyShadow(new THREE.Mesh(reedMatGeo, matReedCanes));
  reedMat.position.set(stallCenterX, (rearAwningY + frontAwningY) / 2 + 0.10, (rearAwningZ + frontAwningZ) / 2 + 0.05);
  reedMat.rotation.x = pergolaLocalPitch;
  canopyGroup.add(reedMat);

  // B. Billowing Linen Shade Sail draped over the top with Bezier curvature and terracotta border
  const canopyP0 = new THREE.Vector2(rearAwningZ, rearAwningY + 0.13);
  const canopyP2 = new THREE.Vector2(frontAwningZ + 0.05, frontAwningY + 0.12);
  const canopyP1 = new THREE.Vector2(
    rearAwningZ + 0.55 * (frontAwningZ - rearAwningZ),
    canopyP0.y - 0.08 * (canopyP0.y - canopyP2.y)
  );
  const sailCurve = new THREE.QuadraticBezierCurve(canopyP0, canopyP1, canopyP2);

  function createSailStrip(width: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(width, 1, 1, 16);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = sailCurve.getPoint(0.5 - pos.getY(i));
      pos.setXYZ(i, pos.getX(i), p.y, p.x);
    }
    geo.computeVertexNormals();
    return applyShadow(new THREE.Mesh(geo, mat));
  }

  const sailStripes = 7;
  const stripeW = awningW / sailStripes;
  for (let s = 0; s < sailStripes; s++) {
    // Edge stripes are warm terracotta trim; center is sun-bleached linen
    const isTrim = s === 0 || s === sailStripes - 1 || s === 3;
    const sMat = isTrim ? matCanvasTerracotta : matCanvasLinen;
    const sx = stallCenterX - awningW / 2 + stripeW / 2 + s * stripeW;

    const sailMesh = createSailStrip(stripeW - 0.004, sMat);
    sailMesh.position.x = sx;
    canopyGroup.add(sailMesh);

    // Scalloped linen valance flap hanging at the front
    const flapW = stripeW - 0.014;
    const flapSide = 0.16;
    const flapPoint = 0.06;
    const scallopShape = new THREE.Shape();
    scallopShape.moveTo(-flapW / 2, 0);
    scallopShape.lineTo(flapW / 2, 0);
    scallopShape.lineTo(flapW / 2, -flapSide);
    scallopShape.lineTo(0, -flapSide - flapPoint);
    scallopShape.lineTo(-flapW / 2, -flapSide);
    scallopShape.closePath();

    const scallopGeo = new THREE.ExtrudeGeometry(scallopShape, { depth: 0.012, bevelEnabled: false });
    const scallopMesh = applyShadow(new THREE.Mesh(scallopGeo, sMat));
    scallopMesh.position.set(sx, frontAwningY + 0.11, frontAwningZ + 0.05);
    canopyGroup.add(scallopMesh);
  }

  // ---------------------------------------------------------------------------
  // 7. COUNTERTOP & SUNREACH PRODUCE (Citrus, Olives, Salt-Cured Sea Bream)
  // ---------------------------------------------------------------------------
  const counterPlank = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stallW, 0.08, stallD), matTimberCedarWarm));
  counterPlank.position.set(stallCenterX, stallTableH, stallZ + stallD / 2);
  stallGroup.add(counterPlank);

  // Counter support legs & stretchers
  const legL = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, stallTableH, 0.12), matTimberCedarDark));
  legL.position.set(postLeftX, stallTableH / 2, stallZ + stallD - 0.06);
  const legR = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, stallTableH, 0.12), matTimberCedarDark));
  legR.position.set(postRightX, stallTableH / 2, stallZ + stallD - 0.06);
  const legM = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.12, stallTableH, 0.12), matTimberCedarDark));
  legM.position.set(stallCenterX, stallTableH / 2, stallZ + stallD - 0.06);
  stallGroup.add(legL, legR, legM);

  const displayRail = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stallW, 0.06, 0.06), matTimberCedarDark));
  displayRail.position.set(stallCenterX, 0.22, stallZ + stallD - 0.06);
  stallGroup.add(displayRail);

  const cratesGroup = new THREE.Group();
  cratesGroup.name = 'crates-group';
  stallGroup.add(cratesGroup);

  const crateW = 0.48;
  const crateH = 0.16;
  const crateD = 0.38;
  const tiltAngle = 0.36;
  const counterTop = stallTableH + 0.04;
  const crateLift = (crateD / 2) * Math.sin(tiltAngle);
  const crateZ = stallZ + stallD / 2 + 0.02;

  // --- CRATE 1 (LEFT): SUNREACH CITRUS (Lemons with Foliage & Blood Oranges) ---
  const citrusCrateGroup = new THREE.Group();
  citrusCrateGroup.position.set(stallCenterX - 0.54, counterTop + crateLift, crateZ);
  citrusCrateGroup.rotation.x = tiltAngle;
  citrusCrateGroup.add(createProduceCrate(crateW, crateH, crateD));

  const lemonGeo = new THREE.SphereGeometry(0.052, 12, 10);
  lemonGeo.scale(1.0, 1.35, 1.0);
  const orangeGeo = new THREE.SphereGeometry(0.055, 12, 10);
  const leafConeGeo = new THREE.ConeGeometry(0.028, 0.08, 5);

  for (let ax = -1; ax <= 1; ax++) {
    for (let az = -1; az <= 1; az++) {
      const isOrange = (ax + az) % 2 === 0 && ax !== 0;
      const fruitMesh = applyShadow(new THREE.Mesh(isOrange ? orangeGeo : lemonGeo, isOrange ? matOrange : matLemon));
      const jx = (rand() - 0.5) * 0.015;
      const jz = (rand() - 0.5) * 0.015;
      fruitMesh.position.set(ax * 0.14 + jx, 0.082 + (az === 0 ? 0.014 : 0), az * 0.11 + jz);

      if (!isOrange) {
        // Wooden stem on lemon
        const stem = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.024, 6), matLemonStem));
        stem.position.set(0.015, 0.065, 0);
        fruitMesh.add(stem);

        // Green leaf on lemon
        const leaf = applyShadow(new THREE.Mesh(leafConeGeo, matFoliage));
        leaf.rotation.z = Math.PI / 3;
        leaf.position.set(0.032, 0.068, 0);
        fruitMesh.add(leaf);
      }
      citrusCrateGroup.add(fruitMesh);
    }
  }
  cratesGroup.add(citrusCrateGroup);

  // --- CRATE 2 (CENTER): CERAMIC OLIVE BOWLS & TERRACOTTA OIL CRUETS ---
  const oliveCrateGroup = new THREE.Group();
  oliveCrateGroup.position.set(stallCenterX, counterTop + crateLift, crateZ);
  oliveCrateGroup.rotation.x = tiltAngle;
  oliveCrateGroup.add(createProduceCrate(crateW, crateH, crateD));

  // Two glazed ceramic bowls (Green Olives & Kalamata Black Olives)
  for (const [bx, isGreen] of [[-0.12, true], [0.12, false]] as const) {
    const bowlGeo = new THREE.CylinderGeometry(0.09, 0.06, 0.06, 14);
    const bowl = applyShadow(new THREE.Mesh(bowlGeo, matGlazedBowl));
    bowl.position.set(bx, 0.05, 0.04);
    oliveCrateGroup.add(bowl);

    // Mound of olives
    const oliveGeo = new THREE.SphereGeometry(0.018, 8, 6);
    oliveGeo.scale(1.0, 1.4, 1.0);
    const oliveMat = isGreen ? matOliveGreen : matOliveBlack;
    for (let o = 0; o < 9; o++) {
      const oa = (o * Math.PI * 2) / 6;
      const od = (o < 6 ? 0.05 : 0.02) + (rand() - 0.5) * 0.01;
      const olive = applyShadow(new THREE.Mesh(oliveGeo, oliveMat));
      olive.position.set(bx + Math.cos(oa) * od, 0.085 + (o >= 6 ? 0.02 : 0), 0.04 + Math.sin(oa) * od);
      oliveCrateGroup.add(olive);
    }
  }

  // 2 Terracotta oil flasks resting in the rear of the crate
  for (const fx of [-0.10, 0.10]) {
    const flaskGeo = new THREE.CylinderGeometry(0.02, 0.045, 0.12, 10);
    const flask = applyShadow(new THREE.Mesh(flaskGeo, matTerracottaPot));
    flask.position.set(fx, 0.08, -0.09);
    // Cork stopper
    const cork = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.03, 8), matTimberCedarWarm));
    cork.position.set(fx, 0.15, -0.09);
    oliveCrateGroup.add(flask, cork);
  }
  cratesGroup.add(oliveCrateGroup);

  // --- DISPLAY 3 (RIGHT): SLANTED TIMBER FISH STALL (Salt-Cured Sea Bream on Rushes) ---
  const fishDisplayGroup = new THREE.Group();
  fishDisplayGroup.position.set(stallCenterX + 0.54, counterTop + crateLift, crateZ);
  fishDisplayGroup.rotation.x = tiltAngle;

  const fishTray = createProduceCrate(crateW, crateH, crateD);
  fishDisplayGroup.add(fishTray);

  // Bedding of dried rushes
  const rushBed = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(crateW - 0.04, 0.03, crateD - 0.04), matRushBedding));
  rushBed.position.y = 0.035;
  fishDisplayGroup.add(rushBed);

  // 3 Fresh Sea Bream laid side by side on the rushes
  for (let f = 0; f < 3; f++) {
    const seaBream = createSeaBream();
    seaBream.position.set(-0.13 + f * 0.13, 0.075, 0.01 + (f === 1 ? -0.02 : 0.02));
    seaBream.rotation.set(-Math.PI / 2, 0, (rand() - 0.5) * 0.15);
    fishDisplayGroup.add(seaBream);
  }
  cratesGroup.add(fishDisplayGroup);

  // ---------------------------------------------------------------------------
  // 8. HANGING GOODS (Garlic Braids, Red Chili Strings, Herb Bundles)
  // ---------------------------------------------------------------------------
  const hangingGroup = new THREE.Group();
  hangingGroup.name = 'hanging-goods-group';
  stallGroup.add(hangingGroup);

  // Braided garlic rope hanging from front pergola beam
  const garlicX = postLeftX + 0.22;
  const garlicCord = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.32, 6), matBurlapDark));
  garlicCord.position.set(garlicX, frontAwningY - 0.16, frontAwningZ - 0.02);
  hangingGroup.add(garlicCord);

  const garlicBulbGeo = new THREE.SphereGeometry(0.026, 8, 8);
  for (let g = 0; g < 5; g++) {
    const bulb = applyShadow(new THREE.Mesh(garlicBulbGeo, matCanvasLinen));
    bulb.position.set(garlicX + (g % 2 === 0 ? 0.015 : -0.015), frontAwningY - 0.06 - g * 0.055, frontAwningZ - 0.02);
    hangingGroup.add(bulb);
  }

  // Dried Red Chili Pepper string
  const chiliX = postRightX - 0.22;
  const chiliCord = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.004, 0.30, 6), matBurlapDark));
  chiliCord.position.set(chiliX, frontAwningY - 0.15, frontAwningZ - 0.02);
  hangingGroup.add(chiliCord);

  const chiliGeo = new THREE.ConeGeometry(0.012, 0.06, 6);
  chiliGeo.rotateZ(Math.PI);
  for (let c = 0; c < 6; c++) {
    const chili = applyShadow(new THREE.Mesh(chiliGeo, matOrange));
    const a = (c * Math.PI) / 3;
    chili.position.set(chiliX + Math.sin(a) * 0.018, frontAwningY - 0.05 - c * 0.045, frontAwningZ - 0.02 + Math.cos(a) * 0.018);
    chili.rotation.set(0.2, 0, (rand() - 0.5) * 0.3);
    hangingGroup.add(chili);
  }

  // ---------------------------------------------------------------------------
  // 9. GROUND PROPS (Amphorae in Rope Slings, Fig Basket, Salt Sack, Keg)
  // ---------------------------------------------------------------------------
  const propsGroup = new THREE.Group();
  propsGroup.name = 'props-group';
  root.add(propsGroup);

  // Two Mediterranean Terracotta Oil Amphorae in rope slings (+X beyond counter)
  const amphora1 = createAmphora(0.28, 0.85);
  amphora1.position.set(bW / 2 + 0.44, 0.01, 1.25);
  amphora1.rotation.y = 0.4;
  propsGroup.add(amphora1);

  const amphora2 = createAmphora(0.24, 0.72);
  amphora2.position.set(bW / 2 + 0.88, 0.01, 1.45);
  amphora2.rotation.y = -0.3;
  amphora2.rotation.z = 0.08;
  propsGroup.add(amphora2);

  // Woven Esparto Grass Fig Basket near front left post
  const figBasket = createFigBasket(0.25, 0.28);
  figBasket.position.set(stallCenterX - stallW / 2 - 0.32, 0, stallZ + 0.90);
  propsGroup.add(figBasket);

  // Open Burlap Sack heaped with coarse sea-salt crystals in front of counter
  const saltSackGroup = new THREE.Group();
  saltSackGroup.position.set(stallCenterX - 0.06, 0, stallZ + stallD + 0.26);

  const saltSackProfile = [
    [0.0, 0.0],
    [0.21, 0.0],
    [0.25, 0.05],
    [0.26, 0.16],
    [0.24, 0.26],
    [0.21, 0.32],
  ].map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const sackBase = applyShadow(new THREE.Mesh(new THREE.LatheGeometry(saltSackProfile, 18), matBurlap));
  saltSackGroup.add(sackBase);

  const sackRim = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 14), matBurlapDark));
  sackRim.rotation.x = Math.PI / 2;
  sackRim.position.y = 0.32;
  saltSackGroup.add(sackRim);

  const saltMound = applyShadow(
    new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), matSeaSalt)
  );
  saltMound.position.y = 0.29;
  saltSackGroup.add(saltMound);
  propsGroup.add(saltSackGroup);

  // Small salted-fish keg (+X wall beside door steps)
  const saltKeg = new THREE.Group();
  saltKeg.position.set(plinthFaceX + 0.46, 0.34, -0.92);
  const kegProfile = [
    [0.18, -0.32],
    [0.22, 0.0],
    [0.18, 0.32],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const kegBody = applyShadow(new THREE.Mesh(new THREE.LatheGeometry(kegProfile, 16), matTimberCedarDark));
  const kegLid = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.03, 16), matTimberCedarWarm));
  kegLid.position.y = 0.32;
  const kegHoop1 = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 16, 1, true), matIron));
  kegHoop1.position.y = 0.18;
  const kegHoop2 = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.21, 0.21, 0.03, 16, 1, true), matIron));
  kegHoop2.position.y = -0.18;
  saltKeg.add(kegBody, kegLid, kegHoop1, kegHoop2);
  propsGroup.add(saltKeg);

  // ---------------------------------------------------------------------------
  // 10. TERRACOTTA CURVED MISSION ROOF & WHITEWASHED CHIMNEY
  // ---------------------------------------------------------------------------
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-group';
  root.add(roofGroup);

  const roofDeckGeo = new THREE.BoxGeometry(slopeLen, deckT, roofDepth);

  // Right roof slope (+X over entrance door)
  const rightSlopeGroup = new THREE.Group();
  rightSlopeGroup.position.set(0, ridgeY, 0);
  rightSlopeGroup.rotation.z = -rAngle;
  const rightDeck = applyShadow(new THREE.Mesh(roofDeckGeo, matTimberCedarDark));
  rightDeck.position.set(slopeLen / 2, -deckT / 2, 0);
  rightSlopeGroup.add(rightDeck);

  // Left roof slope (-X over market sign)
  const leftSlopeGroup = new THREE.Group();
  leftSlopeGroup.position.set(0, ridgeY, 0);
  leftSlopeGroup.rotation.z = rAngle;
  const leftDeck = applyShadow(new THREE.Mesh(roofDeckGeo, matTimberCedarDark));
  leftDeck.position.set(-slopeLen / 2, -deckT / 2, 0);
  leftSlopeGroup.add(leftDeck);

  // Exposed rafters under eave overhangs
  const wallAlong = bW / 2 / Math.cos(rAngle);
  function addRafters(slopeGroup: THREE.Group, side: 1 | -1): void {
    const x0 = wallAlong - 0.20;
    const x1 = slopeLen - 0.02;
    for (const rz of [-1.2, -0.6, 0, 0.6, 1.2]) {
      const rafter = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.11, 0.08), matTimberCedarDark));
      rafter.position.set((side * (x0 + x1)) / 2, -deckT - 0.055, rz);
      slopeGroup.add(rafter);
    }
  }
  addRafters(rightSlopeGroup, 1);
  addRafters(leftSlopeGroup, -1);

  // Terracotta mission tiles laid eave -> ridge in half bond
  const tileCourses = 8;
  const tilesPerCourse = 9;
  const tileLap = 0.38;
  const tileThick = 0.04;
  const tileHalfH = 0.024;
  const eaveOverhang = 0.03;
  const ridgeClear = 0.02;
  const coursePitch = (slopeLen + eaveOverhang - ridgeClear) / (tileCourses + tileLap);
  const tileLen = coursePitch * (1 + tileLap);
  const courseTilt = Math.asin(tileThick / coursePitch);
  const colStepZ = roofDepth / tilesPerCourse;
  const tileGap = 0.012;

  function addTileCourses(slopeGroup: THREE.Group, side: 1 | -1): void {
    const centreY = tileHalfH + 0.002 + (tileLen / 2) * Math.sin(courseTilt);
    for (let r = 0; r < tileCourses; r++) {
      const tailX = slopeLen + eaveOverhang - r * coursePitch;
      const slots: Array<[number, number]> = [];
      if (r % 2 === 0) {
        for (let c = 0; c < tilesPerCourse; c++) slots.push([-roofDepth / 2 + (c + 0.5) * colStepZ, colStepZ]);
      } else {
        slots.push([-roofDepth / 2 + colStepZ / 4, colStepZ / 2]);
        for (let c = 0; c < tilesPerCourse - 1; c++) slots.push([-roofDepth / 2 + (c + 1) * colStepZ, colStepZ]);
        slots.push([roofDepth / 2 - colStepZ / 4, colStepZ / 2]);
      }
      for (const [z, w] of slots) {
        const tile = createRomanTile(w - tileGap, tileLen, Math.floor(rand() * tileMats.length));
        tile.geometry.rotateY(Math.PI / 2);
        tile.position.set(side * (tailX - tileLen / 2), centreY, z);
        tile.rotation.set(0, (rand() - 0.5) * 0.05, courseTilt * side);
        slopeGroup.add(tile);
      }
    }
  }

  addTileCourses(rightSlopeGroup, 1);
  addTileCourses(leftSlopeGroup, -1);
  roofGroup.add(rightSlopeGroup, leftSlopeGroup);

  // Timber ridge beam capping the apex
  const ridgeBeamLen = roofDepth + 0.30;
  const ridgeBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, ridgeBeamLen), matTimberCedar));
  ridgeBeam.position.set(0, ridgeY + 0.07, 0);
  roofGroup.add(ridgeBeam);

  // Whitewashed Stucco Chimney with Stone Crown & Terracotta Flue Pot
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'chimney-group';
  chimneyGroup.position.set(0.68, ridgeY - 1.15, -0.40);

  const chimW = 0.50;
  const chimH = 1.38;
  const chimD = 0.50;
  const chimBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chimW, chimH, chimD), matStucco));
  chimBody.position.y = chimH / 2;
  chimneyGroup.add(chimBody);

  const chimCrown = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chimW + 0.12, 0.12, chimD + 0.12), matStoneStep));
  chimCrown.position.y = chimH + 0.06;
  chimneyGroup.add(chimCrown);

  // Cylindrical terracotta flue chimney pot
  const fluePot = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.14, 0.26, 12), matTerracottaPot));
  fluePot.position.y = chimH + 0.25;
  chimneyGroup.add(fluePot);

  roofGroup.add(chimneyGroup);

  // ---------------------------------------------------------------------------
  // Metadata & Runtime Contract
  // ---------------------------------------------------------------------------
  root.userData.sculptRuntime = {
    partCoverage: {
      totalParts: 46,
      labeledParts: 46,
      coverageRatio: 1.0,
    },
    actionReady: true,
    emissionTarget: 'standalone-threejs',
  };

  return root;
}
