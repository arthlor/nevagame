/**
 * Medieval Market Stall - authored (code -> GLB) source.
 *
 * Ported from the img2threejs showcase factory of the same name; the reconstruction notes live with
 * that project. Two deliberate differences for Neva:
 *   - no lighting: `VisualRenderConfig` owns the renderer baseline, so the showcase's light rig and
 *     the two warm accent point lights are not part of the asset;
 *   - the model is otherwise untouched, so the showcase remains the editable upstream.
 *
 * Content: half-timbered stall building on a stone plinth, terracotta plain-tile roof in lapped
 * half-bond courses under a timber ridge beam, bullnose striped awning with a hanging valance,
 * produce crates on the counter, an arched stone entrance with solid ashlar steps, a trade sign
 * showing the stall's produce, and ground props (barrels, sacks, apple crate).
 *
 * Deterministic: every texture and jitter draws from one seeded generator, so repeated exports
 * produce the same asset.
 */

import * as THREE from 'three';

export function createMedievalMarketStallModel(): THREE.Group {
  const root = new THREE.Group();
  root.name = 'medieval-market-stall';

  // Proportions calibrated to market.png 3/4 perspective
  root.scale.set(1.19, 0.95, 1.19);

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
  // Deterministic Procedural Bump Textures
  // ---------------------------------------------------------------------------
  // Every texture and jitter draws from one seeded generator, so the model is identical on every
  // load. The bump maps are smooth value noise: the old per-texel white noise shimmered on the
  // timbers whenever the camera moved.
  let seedState = 0x2f6e2b1;
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

  function createNoiseTexture(size = 128, type: 'plaster' | 'wood' | 'stone' | 'weave' = 'plaster'): THREE.CanvasTexture | null {
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
        if (type === 'plaster') {
          val = 128 + (coarse(u, v) - 0.5) * 50 + (fine(u, v) - 0.5) * 22;
        } else if (type === 'wood') {
          // Grain lines run along U, gently wavering; no per-texel noise.
          const grain = Math.sin((v * 12 + coarse(u, v) * 1.6) * Math.PI * 2);
          val = 128 + grain * 20 + (fine(u, v) - 0.5) * 18;
        } else if (type === 'stone') {
          const joint = x % 32 < 2 || y % 16 < 2 ? -40 : 0;
          val = 128 + joint + (coarse(u, v) - 0.5) * 36 + (fine(u, v) - 0.5) * 20;
        } else {
          // Burlap: over-under weave with an 8-texel period (coarse enough not to alias).
          const weave = Math.sin(u * size * 0.25 * Math.PI) * Math.sin(v * size * 0.25 * Math.PI);
          val = 128 + weave * 30 + (fine(u, v) - 0.5) * 20;
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

  const texPlaster = createNoiseTexture(128, 'plaster');
  const texWood = createNoiseTexture(128, 'wood');
  const texStone = createNoiseTexture(128, 'stone');
  const texWeave = createNoiseTexture(128, 'weave');

  // ---------------------------------------------------------------------------
  // Materials Palette
  // ---------------------------------------------------------------------------
  const C = {
    plaster: 0xceb28d, // warm lime-wash cream (0xd8d0bd rendered near-white, dE76 27.7)
    timber: 0x543a24,
    timberDark: 0x382110,
    timberWarm: 0x694424,
    stoneLight: 0x9ba0a5,
    stoneMid: 0x7b8086,
    stoneDark: 0x5f6469,
    stonePlinth: 0x72777d,
    stoneStep: 0x82878d,
    // Muted fired-clay terracotta (the old orange palette rendered dE76 26.7 from the reference).
    tileBase: 0x814827,
    tile1: 0x754022,
    tile2: 0x8c5330,
    tile3: 0x7b4423,
    awningCream: 0xe6ddca,
    awningGreen: 0x445037, // albedo that renders as olive #75795c under the stall lights
    doorWood: 0x624022,
    ironHinge: 0x222426,
    appleRed: 0xc42e22,
    appleStem: 0x3d2417,
    carrotOrange: 0xe66417,
    carrotGreens: 0x468324,
    cabbageOuter: 0x559030,
    cabbageInner: 0x78af48,
    burlap: 0xa8875c,
    burlapDark: 0x7d6440,
    grainGold: 0xd6b05b,
    glassLead: 0x202224,
    glassPane: 0x2b3842,
    signBoard: 0x5e3d22,
  };

  const matPlaster = new THREE.MeshStandardMaterial({
    color: C.plaster,
    roughness: 0.90,
    metalness: 0.02,
    bumpMap: texPlaster || undefined,
    bumpScale: 0.008,
  });

  const matTimber = new THREE.MeshStandardMaterial({
    color: C.timber,
    roughness: 0.74,
    metalness: 0.05,
    bumpMap: texWood || undefined,
    bumpScale: 0.008,
  });

  const matTimberDark = new THREE.MeshStandardMaterial({
    color: C.timberDark,
    roughness: 0.82,
    metalness: 0.04,
  });

  const matTimberWarm = new THREE.MeshStandardMaterial({
    color: C.timberWarm,
    roughness: 0.70,
    metalness: 0.05,
  });

  // Warm oak staves; flat shading turns the 16 lathe facets into readable staves.
  const matBarrel = new THREE.MeshStandardMaterial({
    color: 0x7a4a28,
    roughness: 0.72,
    metalness: 0.04,
    flatShading: true,
    bumpMap: texWood || undefined,
    bumpScale: 0.006,
  });

  const matBarrelLid = new THREE.MeshStandardMaterial({
    color: 0x5a361c,
    roughness: 0.8,
    metalness: 0.04,
    bumpMap: texWood || undefined,
    bumpScale: 0.006,
  });

  const matStonePlinth = new THREE.MeshStandardMaterial({
    color: C.stonePlinth,
    roughness: 0.92,
    metalness: 0.03,
    bumpMap: texStone || undefined,
    bumpScale: 0.012,
  });

  const matStoneStep = new THREE.MeshStandardMaterial({
    color: C.stoneStep,
    roughness: 0.88,
    metalness: 0.04,
    bumpMap: texStone || undefined,
    bumpScale: 0.01,
  });

  const stoneMats = [
    new THREE.MeshStandardMaterial({ color: C.stoneLight, roughness: 0.86, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: C.stoneMid, roughness: 0.88, metalness: 0.03 }),
    new THREE.MeshStandardMaterial({ color: C.stoneDark, roughness: 0.92, metalness: 0.04 }),
  ];

  const tileMats = [
    new THREE.MeshStandardMaterial({ color: C.tileBase, roughness: 0.65, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: C.tile1, roughness: 0.68, metalness: 0.04 }),
    new THREE.MeshStandardMaterial({ color: C.tile2, roughness: 0.62, metalness: 0.05 }),
    new THREE.MeshStandardMaterial({ color: C.tile3, roughness: 0.70, metalness: 0.04 }),
  ];

  const matAwningCream = new THREE.MeshStandardMaterial({
    color: C.awningCream,
    roughness: 0.80,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const matAwningGreen = new THREE.MeshStandardMaterial({
    color: C.awningGreen,
    roughness: 0.78,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  const matDoor = new THREE.MeshStandardMaterial({
    color: C.doorWood,
    roughness: 0.70,
    metalness: 0.05,
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

  const matGrain = new THREE.MeshStandardMaterial({
    color: C.grainGold,
    roughness: 0.75,
    metalness: 0.05,
  });

  const matApple = new THREE.MeshStandardMaterial({
    color: C.appleRed,
    roughness: 0.28,
    metalness: 0.04,
  });

  const matAppleStem = new THREE.MeshStandardMaterial({
    color: C.appleStem,
    roughness: 0.90,
    metalness: 0.0,
  });

  const matCarrot = new THREE.MeshStandardMaterial({
    color: C.carrotOrange,
    roughness: 0.45,
    metalness: 0.02,
  });

  const matFoliage = new THREE.MeshStandardMaterial({
    color: C.carrotGreens,
    roughness: 0.60,
    metalness: 0.0,
    flatShading: true,
  });

  const matCabbage = new THREE.MeshStandardMaterial({
    color: C.cabbageOuter,
    roughness: 0.55,
    metalness: 0.02,
    flatShading: true,
  });

  const matCabbageInner = new THREE.MeshStandardMaterial({
    color: C.cabbageInner,
    roughness: 0.50,
    metalness: 0.02,
    flatShading: true,
  });

  // Leaded glass: a diamond lattice of lead cames over slightly blue glass that darkens to one
  // corner (the old pane carried a single X of two box muntins).
  function createLatticeTexture(): THREE.CanvasTexture | null {
    if (typeof document === 'undefined') return null;
    const size = 128;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    const grad = ctx.createLinearGradient(0, 0, size, size);
    grad.addColorStop(0, '#4a5d6e');
    grad.addColorStop(1, '#1d2830');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    ctx.strokeStyle = '#8a8e92';
    ctx.lineWidth = 5;
    const step = size / 3;
    for (let k = -size; k <= size * 2; k += step) {
      ctx.beginPath();
      ctx.moveTo(k, 0);
      ctx.lineTo(k + size, size);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(k, size);
      ctx.lineTo(k + size, 0);
      ctx.stroke();
    }
    ctx.lineWidth = 8;
    ctx.strokeRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  const matGlass = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    map: createLatticeTexture() || undefined,
    roughness: 0.22,
    metalness: 0.25,
  });

  const matSign = new THREE.MeshStandardMaterial({
    color: C.signBoard,
    roughness: 0.75,
    metalness: 0.05,
    bumpMap: texWood || undefined,
    bumpScale: 0.008,
  });

  // ---------------------------------------------------------------------------
  // Geometry Helper Functions
  // ---------------------------------------------------------------------------

  function createClayTile(tileW = 0.22, tileL = 0.28, matIdx = 0): THREE.Mesh {
    const shape = new THREE.Shape();
    const halfW = tileW / 2;
    const curveH = 0.032;
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

  // Coopered barrel: 16 flat-shaded staves (lathe facets) and four iron hoops that sit ON the
  // bulge - the old hoops (radius 1.08R inside a 1.16R bulge) were buried in the staves.
  function createBarrel(radius = 0.32, height = 0.78): THREE.Group {
    const group = new THREE.Group();
    const bulge = (v: number) => radius * (1.0 + 0.16 * Math.sin(v * Math.PI));
    const points: THREE.Vector2[] = [];
    const segments = 12;
    for (let i = 0; i <= segments; i++) {
      const v = i / segments;
      points.push(new THREE.Vector2(bulge(v), (v - 0.5) * height));
    }
    group.add(applyShadow(new THREE.Mesh(new THREE.LatheGeometry(points, 16), matBarrel)));

    const hoopH = 0.045;
    const dv = hoopH / 2 / height;
    for (const v of [0.1, 0.27, 0.73, 0.9]) {
      const hoop = applyShadow(new THREE.Mesh(
        new THREE.CylinderGeometry(bulge(v + dv) + 0.012, bulge(v - dv) + 0.012, hoopH, 16, 1, true),
        matIron,
      ));
      hoop.position.y = (v - 0.5) * height;
      group.add(hoop);
    }

    const lid = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(radius * 0.97, radius * 0.97, 0.03, 16), matBarrelLid));
    lid.position.y = height * 0.5 - 0.03;
    group.add(lid);
    return group;
  }

  // Tied burlap sack: a lathe profile with a sagging, bulged body, a pinched neck under a cord
  // tie and a gathered, flared tuft (the old one was a stretched sphere under a cone).
  function createTiedSack(scaleX = 0.22, scaleY = 0.38, scaleZ = 0.22): THREE.Group {
    const group = new THREE.Group();
    const profile: Array<[number, number]> = [
      [0.0, 0.0], [0.9, 0.0], [1.0, 0.05], [1.02, 0.16], [1.0, 0.32], [0.95, 0.47], [0.85, 0.6],
      [0.68, 0.71], [0.45, 0.81], [0.26, 0.89], [0.3, 0.95], [0.34, 1.04], [0.22, 1.1], [0.0, 1.12],
    ];
    const points = profile.map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r * scaleX), y * scaleY));
    const sackGeo = new THREE.LatheGeometry(points, 20);
    // Lumpy fill: smooth angular bulges that grow toward the belly, so no two sacks match.
    const phaseA = rand() * Math.PI * 2;
    const phaseB = rand() * Math.PI * 2;
    const sp = sackGeo.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      const x = sp.getX(i);
      const y = sp.getY(i);
      const z = sp.getZ(i);
      const a = Math.atan2(x, z);
      const belly = Math.sin(Math.min(1, y / (scaleY * 0.85)) * Math.PI);
      const f = 1 + belly * (0.06 * Math.sin(3 * a + phaseA) + 0.035 * Math.sin(5 * a + phaseB));
      sp.setXYZ(i, x * f, y, z * f);
    }
    sackGeo.computeVertexNormals();
    const body = applyShadow(new THREE.Mesh(sackGeo, matBurlap));
    body.scale.z = scaleZ / scaleX;
    group.add(body);

    const tie = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(scaleX * 0.27, 0.018, 8, 16), matBurlapDark));
    tie.rotation.x = Math.PI / 2;
    tie.position.y = scaleY * 0.92;
    group.add(tie);

    // Gathered cloth above the cord: slim folds standing up and leaning slightly outward, so the
    // top reads as tied-off burlap rather than a lid.
    const folds = 5;
    for (let i = 0; i < folds; i++) {
      const a = (i / folds) * Math.PI * 2 + rand() * 0.25;
      const lean = 0.18 + rand() * 0.14;
      const fold = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(scaleX * 0.14, scaleY * 0.24, 5), matBurlap));
      fold.position.set(
        Math.sin(a) * scaleX * 0.13,
        scaleY * (1.05 + rand() * 0.05),
        Math.cos(a) * scaleZ * 0.13,
      );
      // Tilt the cone's +Y axis outward by `lean` about the horizontal axis perpendicular to it.
      fold.rotation.set(lean * Math.cos(a), 0, -lean * Math.sin(a));
      group.add(fold);
    }
    return group;
  }

  function createWindow(w = 0.48, h = 0.54, depth = 0.12): THREE.Group {
    const group = new THREE.Group();
    const frameT = 0.07;
    const innerW = w - frameT * 2;
    const innerH = h - frameT * 2;

    const topBar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, frameT, depth), matTimber));
    topBar.position.y = h / 2;
    const btmBar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w + 0.08, frameT * 1.25, depth + 0.03), matTimber));
    btmBar.position.y = -h / 2;
    const leftBar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(frameT, h, depth), matTimber));
    leftBar.position.x = -w / 2 + frameT / 2;
    const rightBar = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(frameT, h, depth), matTimber));
    rightBar.position.x = w / 2 - frameT / 2;
    group.add(topBar, btmBar, leftBar, rightBar);

    const glassPane = new THREE.Mesh(new THREE.PlaneGeometry(innerW, innerH), matGlass);
    group.add(glassPane);


    return group;
  }

  function createProduceCrate(w = 0.48, h = 0.15, d = 0.38): THREE.Group {
    const crate = new THREE.Group();
    const wallT = 0.020;
    const slatH = 0.056;

    const floor = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, wallT, d), matTimberWarm));
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
      const post = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(cornerW, h, cornerW), matTimberDark));
      post.position.set(cx, cy, cz);
      crate.add(post);
    }

    for (let tier = 0; tier < 2; tier++) {
      const slatY = wallT + slatH / 2 + tier * (slatH + 0.010);

      const fSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, slatH, wallT), matTimberWarm));
      fSlat.position.set(0, slatY, d / 2 - wallT / 2);
      const bSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(w, slatH, wallT), matTimberWarm));
      bSlat.position.set(0, slatY, -d / 2 + wallT / 2);

      const lSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(wallT, slatH, d - wallT * 2), matTimberWarm));
      lSlat.position.set(-w / 2 + wallT / 2, slatY, 0);
      const rSlat = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(wallT, slatH, d - wallT * 2), matTimberWarm));
      rSlat.position.set(w / 2 - wallT / 2, slatY, 0);

      crate.add(fSlat, bSlat, lSlat, rSlat);
    }

    return crate;
  }

  // ---------------------------------------------------------------------------
  // 1. FOUNDATION PLINTH (Stone Masonry Base)
  // ---------------------------------------------------------------------------
  const foundationGroup = new THREE.Group();
  foundationGroup.name = 'foundation-group';
  root.add(foundationGroup);

  const bW = 2.75;
  const bD = 2.65;
  const bH = 1.85;
  const fH = 0.48;
  const bY = fH + bH / 2;

  const fPlinth = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW + 0.18, fH, bD + 0.18), matStonePlinth));
  fPlinth.position.set(0, fH / 2, 0);
  foundationGroup.add(fPlinth);

  const quoinW = 0.28;
  const quoinH = 0.20;
  const quoinD = 0.28;
  const quoinCorners = [
    [-bW / 2 - 0.06, 0, bD / 2 + 0.06],
    [bW / 2 + 0.06, 0, bD / 2 + 0.06],
    [-bW / 2 - 0.06, 0, -bD / 2 - 0.06],
    [bW / 2 + 0.06, 0, -bD / 2 - 0.06],
  ];
  // Ashlar facing around the plinth: two courses in running bond, proud of the core box, so the
  // base reads as laid stone rather than a smooth grey band.
  const plinthCourseH = fH / 2;
  const plinthMats = [stoneMats[0], stoneMats[1], matStonePlinth, stoneMats[2]];
  for (let k = 0; k < 2; k++) {
    for (const axis of ['x', 'z'] as const) {
      const span = axis === 'x' ? bW + 0.18 : bD + 0.18;
      const other = (axis === 'x' ? bD + 0.18 : bW + 0.18) / 2;
      for (const face of [1, -1]) {
        let t = -span / 2 + 0.14;
        let nominal = k % 2 === 1 ? 0.22 : 0.3 + rand() * 0.12;
        while (t < span / 2 - 0.16) {
          const len = Math.min(nominal, span / 2 - 0.14 - t);
          if (len < 0.08) break;
          const block = applyShadow(new THREE.Mesh(
            axis === 'x'
              ? new THREE.BoxGeometry(len - 0.014, plinthCourseH - 0.014, 0.06)
              : new THREE.BoxGeometry(0.06, plinthCourseH - 0.014, len - 0.014),
            plinthMats[Math.floor(rand() * plinthMats.length)],
          ));
          const along = t + len / 2;
          block.position.set(
            axis === 'x' ? along : face * (other + 0.01),
            k * plinthCourseH + plinthCourseH / 2,
            axis === 'x' ? face * (other + 0.01) : along,
          );
          foundationGroup.add(block);
          t += len;
          nominal = 0.3 + rand() * 0.12;
        }
      }
    }
  }

  for (const [qx, , qz] of quoinCorners) {
    for (let q = 0; q < 2; q++) {
      const quoin = applyShadow(new THREE.Mesh(
        new THREE.BoxGeometry(quoinW + (q % 2) * 0.04, quoinH, quoinD - (q % 2) * 0.04),
        stoneMats[q % 3]
      ));
      quoin.position.set(qx + (qx > 0 ? -0.04 : 0.04), 0.10 + q * 0.20, qz + (qz > 0 ? -0.04 : 0.04));
      foundationGroup.add(quoin);
    }
  }

  // ---------------------------------------------------------------------------
  // 2. MAIN COTTAGE WALLS & HALF-TIMBER FRAMING
  // ---------------------------------------------------------------------------
  const houseGroup = new THREE.Group();
  houseGroup.name = 'house-group';
  root.add(houseGroup);

  const plasterBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW, bH, bD), matPlaster));
  plasterBody.position.set(0, bY, 0);
  houseGroup.add(plasterBody);

  // Roof geometry. The pitch comes from a 1.75 rise over the half-span out to the eave overhang;
  // the ridge height is then chosen so the deck's underside BEARS on the eave plates (the roof
  // used to float 0.28 m above the side walls), and the gable walls stop just under the deck.
  const gableRise = 1.75;
  const halfSpan = bW / 2 + 0.40;
  const slopeLen = Math.hypot(halfSpan, gableRise);
  const rAngle = Math.atan2(gableRise, halfSpan);
  const deckT = 0.08;
  const deckDrop = deckT / Math.cos(rAngle); // vertical thickness of the sloped deck
  const ridgeY = fH + bH + (bW / 2 + 0.04) * Math.tan(rAngle) + deckDrop;
  const gableWallRise = ridgeY - deckDrop - (fH + bH) - 0.01;
  /** Height of the gable wall's sloped top edge at x. */
  const gableTopAt = (x: number) => fH + bH + gableWallRise * (1 - Math.abs(x) / (bW / 2));
  const gableShape = new THREE.Shape();
  gableShape.moveTo(-bW / 2, 0);
  gableShape.lineTo(bW / 2, 0);
  gableShape.lineTo(0, gableWallRise);
  gableShape.closePath();

  const gableGeo = new THREE.ExtrudeGeometry(gableShape, { depth: 0.10, bevelEnabled: false });
  const frontGable = applyShadow(new THREE.Mesh(gableGeo, matPlaster));
  frontGable.position.set(0, fH + bH, bD / 2 - 0.10);
  const rearGable = applyShadow(new THREE.Mesh(gableGeo, matPlaster));
  rearGable.position.set(0, fH + bH, -bD / 2);
  houseGroup.add(frontGable, rearGable);

  const timberGroup = new THREE.Group();
  timberGroup.name = 'timber-group';
  houseGroup.add(timberGroup);

  const postW = 0.16;
  // Timbers stand proud of the plaster. Posts whose faces were coplanar with the plaster box
  // z-fought, flickering between timber and plaster as the camera moved.
  const postProud = 0.02;
  const cornerPosts = [
    [-bW / 2 + postW / 2 - postProud, bY, bD / 2 - postW / 2 + postProud],
    [bW / 2 - postW / 2 + postProud, bY, bD / 2 - postW / 2 + postProud],
    [-bW / 2 + postW / 2 - postProud, bY, -bD / 2 + postW / 2 - postProud],
    [bW / 2 - postW / 2 + postProud, bY, -bD / 2 + postW / 2 - postProud],
  ];
  for (const [cx, cy, cz] of cornerPosts) {
    const post = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(postW, bH, postW), matTimber));
    post.position.set(cx, cy, cz);
    timberGroup.add(post);
  }

  // Eave plates on BOTH long walls (the -X side had none); the roof deck and rafters bear on them.
  for (const side of [1, -1]) {
    const eavePlate = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(postW + 0.04, postW, bD + 0.35), matTimber));
    eavePlate.position.set(side * (bW / 2 - postW / 2 + 0.02), fH + bH - postW / 2, 0);
    timberGroup.add(eavePlate);
  }

  // Knee braces: each runs at 45 deg from a corner post's inner face up to the plate or tie beam it
  // stiffens. (The old pair stopped ~0.1 m short of both post and plate, and the front one ran
  // into the door-arch stones.)
  const wallBraceRun = 0.40;
  const plateUnder = fH + bH - postW; // underside of eave plates and tie beams
  const postInner = (half: number) => half - postW + postProud; // inner face of a corner post
  const braceGeo = new THREE.BoxGeometry(0.11, Math.SQRT2 * wallBraceRun, 0.11);
  const braceY = plateUnder - wallBraceRun / 2;
  for (const side of [1, -1]) {
    // Long walls (+X door side, -X side): braces lie in the YZ plane.
    for (const end of [1, -1]) {
      const brace = applyShadow(new THREE.Mesh(braceGeo, matTimber));
      brace.rotation.x = (-end * Math.PI) / 4;
      brace.position.set(side * (bW / 2 - 0.03), braceY, end * (postInner(bD / 2) - wallBraceRun / 2));
      timberGroup.add(brace);
    }
    // Rear wall: braces lie in the XY plane under the rear tie beam.
    const rearBrace = applyShadow(new THREE.Mesh(braceGeo, matTimber));
    rearBrace.rotation.z = (side * Math.PI) / 4;
    rearBrace.position.set(side * (postInner(bW / 2) - wallBraceRun / 2), braceY, -(bD / 2 - 0.03));
    timberGroup.add(rearBrace);
  }

  const tieGeo = new THREE.BoxGeometry(bW + 0.15, postW, postW + 0.03);
  const frontTie = applyShadow(new THREE.Mesh(tieGeo, matTimber));
  frontTie.position.set(0, fH + bH - postW / 2, bD / 2 - postW / 2 + 0.015);
  // The rear gable needs the same tie beam under it that the front one has.
  const rearTie = applyShadow(new THREE.Mesh(tieGeo, matTimber));
  rearTie.position.set(0, fH + bH - postW / 2, -(bD / 2 - postW / 2 + 0.015));
  timberGroup.add(frontTie, rearTie);

  // Mid-height rails (girts) on the plain rear and -X walls, post to post.
  const railY = fH + bH * 0.45;
  const rearRail = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(bW - 2 * (postW - postProud), 0.12, 0.10), matTimber));
  rearRail.position.set(0, railY, -(bD / 2 - 0.03));
  const sideRail = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.10, 0.12, bD - 2 * (postW - postProud)), matTimber));
  sideRail.position.set(-(bW / 2 - 0.03), railY, 0);
  timberGroup.add(rearRail, sideRail);

  // ---------------------------------------------------------------------------
  // 3. ARCHED ENTRANCE DOORWAY (on +X Eave Wall)
  // ---------------------------------------------------------------------------
  const doorwayGroup = new THREE.Group();
  doorwayGroup.name = 'doorway-group';
  const doorZ = 0.28;
  doorwayGroup.position.set(bW / 2 + 0.01, fH, doorZ);
  doorwayGroup.rotation.y = Math.PI / 2;
  houseGroup.add(doorwayGroup);

  const doorW = 0.74;
  const doorH = 1.45;
  const doorArchR = doorW / 2;
  const doorRectH = doorH - doorArchR;

  const numVoussoirs = 11;
  const vThickness = 0.16;
  const vDepth = 0.18;
  for (let i = 0; i < numVoussoirs; i++) {
    const angle = (Math.PI / (numVoussoirs - 1)) * i;
    const vMesh = applyShadow(new THREE.Mesh(
      new THREE.BoxGeometry(0.14, vThickness, vDepth),
      stoneMats[i % 3]
    ));
    const radius = doorArchR + vThickness / 2;
    vMesh.position.set(Math.cos(angle) * radius, doorRectH + Math.sin(angle) * radius, 0.06);
    vMesh.rotation.z = angle - Math.PI / 2;
    doorwayGroup.add(vMesh);
  }

  for (let j = 0; j < 4; j++) {
    const lJamb = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.27, vDepth), stoneMats[j % 3]));
    lJamb.position.set(-doorArchR - 0.08, 0.14 + j * 0.28, 0.06);
    const rJamb = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.27, vDepth), stoneMats[(j + 1) % 3]));
    rJamb.position.set(doorArchR + 0.08, 0.14 + j * 0.28, 0.06);
    doorwayGroup.add(lJamb, rJamb);
  }

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

  // Vertical plank joints on the door face, each stopping just under the arch.
  for (const gx of [-0.185, 0, 0.185]) {
    const top = doorRectH + Math.sqrt(doorArchR * doorArchR - gx * gx) - 0.04;
    const joint = new THREE.Mesh(new THREE.BoxGeometry(0.012, top - 0.03, 0.006), matTimberDark);
    joint.position.set(gx, 0.03 + (top - 0.03) / 2, 0.05);
    doorwayGroup.add(joint);
  }

  const strapGeo = new THREE.BoxGeometry(doorW * 0.74, 0.040, 0.018);
  const topStrap = applyShadow(new THREE.Mesh(strapGeo, matIron));
  topStrap.position.set(0.03, doorH * 0.68, 0.055);
  const btmStrap = applyShadow(new THREE.Mesh(strapGeo, matIron));
  btmStrap.position.set(0.03, doorH * 0.22, 0.055);
  doorwayGroup.add(topStrap, btmStrap);

  const ringMount = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.018, 12), matIron));
  ringMount.rotation.x = Math.PI / 2;
  ringMount.position.set(0.17, doorH * 0.44, 0.055);
  const pullRing = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(0.038, 0.011, 8, 16), matIron));
  pullRing.position.set(0.17, doorH * 0.39, 0.065);
  doorwayGroup.add(ringMount, pullRing);

  // Entrance steps: three SOLID stone treads descending from the plinth to the ground, each laid
  // as ashlar blocks in running bond. (The old treads were thin slabs floating 0.15-0.30 m above
  // the ground with nothing under them.)
  const stepW = 1.00;
  const stepD = 0.28;
  const stepH = 0.15;
  const plinthFaceX = bW / 2 + 0.09;
  for (let s = 0; s < 3; s++) {
    const top = (3 - s) * stepH;
    const width = stepW + s * 0.10;
    const lengths = s % 2 === 0 ? [0.34, 0.32, 0.34] : [0.5, 0.5];
    let z0 = doorZ - width / 2;
    lengths.forEach((frac, i) => {
      const len = frac * width;
      const block = applyShadow(new THREE.Mesh(
        new THREE.BoxGeometry(stepD, top, len - 0.012),
        i % 2 === 0 ? matStoneStep : stoneMats[0],
      ));
      block.position.set(plinthFaceX - 0.02 + s * stepD + stepD / 2, top / 2, z0 + len / 2);
      foundationGroup.add(block);
      z0 += len;
    });
  }

  // Ashlar base wall on the door side, as in the reference: three courses of proud stone blocks in
  // running bond from the plinth to just under the side-window sill, between each corner post and
  // the door jamb.
  const ashlarCourseH = 0.165;
  const ashlarMats = [stoneMats[0], stoneMats[1], matStoneStep, stoneMats[0]];
  const jambOuter = doorArchR + 0.165;
  const ashlarRuns: Array<[number, number]> = [
    [-bD / 2 + postW - postProud + 0.01, doorZ - jambOuter - 0.01],
    [doorZ + jambOuter + 0.01, bD / 2 - postW + postProud - 0.01],
  ];
  for (const [za, zb] of ashlarRuns) {
    for (let k = 0; k < 3; k++) {
      let z = za;
      let nominal = k % 2 === 1 ? 0.15 : 0.26 + rand() * 0.12;
      while (z < zb - 0.02) {
        const len = zb - z - nominal < 0.08 ? zb - z : nominal;
        const block = applyShadow(new THREE.Mesh(
          new THREE.BoxGeometry(0.08, ashlarCourseH - 0.014, len - 0.014),
          ashlarMats[Math.floor(rand() * ashlarMats.length)],
        ));
        block.position.set(bW / 2, fH + k * ashlarCourseH + ashlarCourseH / 2, z + len / 2);
        houseGroup.add(block);
        z += len;
        nominal = 0.26 + rand() * 0.12;
      }
    }
  }

  const rightSideWindow = createWindow(0.46, 0.52, 0.12);
  rightSideWindow.rotation.y = Math.PI / 2;
  rightSideWindow.position.set(bW / 2 + 0.01, bY - 0.10, -0.68);
  houseGroup.add(rightSideWindow);

  // ---------------------------------------------------------------------------
  // 4. FRONT GABLE TRUSS, ATTIC WINDOW & HANGING TRADE SIGN (+Z Wall)
  // ---------------------------------------------------------------------------
  const gableRoofY = fH + bH;
  const gableGroup = new THREE.Group();
  gableGroup.name = 'front-gable-truss';
  root.add(gableGroup);

  // Attic window and its flanking studs sit inside the (now lower) gable triangle; each stud stops
  // at the gable's sloped top edge instead of running up through the roof.
  const atticWindow = createWindow(0.48, 0.48, 0.12);
  atticWindow.position.set(-0.10, gableRoofY + 0.66, bD / 2 + 0.03);
  gableGroup.add(atticWindow);

  // Front studs flank the attic window; the rear gable gets a matching pair on its tie beam.
  for (const [sx, face] of [[-0.47, 1], [0.27, 1], [-0.35, -1], [0.35, -1]]) {
    const studTop = gableTopAt(sx) - 0.03;
    const stud = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, studTop - gableRoofY, 0.12), matTimber));
    stud.position.set(sx, (gableRoofY + studTop) / 2, face * (bD / 2 + 0.01));
    gableGroup.add(stud);
  }

  const roofDepth = bD + 0.75;

  // Verge (barge) boards sit ON the front and rear roof edges, lifted along the slope normal so
  // they cap the lapped tile ends; they used to hang 0.2 m inside the overhang and show through
  // under every lifted tile tail.
  const bargeLen = slopeLen + 0.06;
  const bargeLift = 0.05;
  // 0.20 deep and 0.03 proud of the roof edge, so the end tiles (bevel + hand-laid yaw) finish
  // inside the board instead of meeting its face.
  const bargeGeo = new THREE.BoxGeometry(bargeLen, 0.20, 0.20);
  const bargeAlong = bargeLen / 2 - 0.03;
  for (const zEdge of [roofDepth / 2 - 0.07, -(roofDepth / 2 - 0.07)]) {
    for (const side of [1, -1]) {
      const barge = applyShadow(new THREE.Mesh(bargeGeo, matTimber));
      barge.position.set(
        side * (bargeAlong * Math.cos(rAngle) + bargeLift * Math.sin(rAngle)),
        ridgeY - bargeAlong * Math.sin(rAngle) + bargeLift * Math.cos(rAngle),
        zEdge,
      );
      barge.rotation.z = -side * rAngle;
      gableGroup.add(barge);
    }
    // Projecting ridge-beam end block where the two barges meet.
    const apexBoss = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.30, 0.24), matTimberDark));
    apexBoss.position.set(0, ridgeY + 0.10, zEdge + Math.sign(zEdge) * 0.10);
    gableGroup.add(apexBoss);
  }

  // Hanging Wooden Shop Trade Sign
  // A short post is bolted to the FRONT face of the left barge board; the boom runs out from it
  // past the eave on a knee brace, and the octagonal plank board hangs from two iron chains. (The
  // old boom sat behind the moved barges and ran through the roof; its board hung 7.7 mm below
  // its rings with nothing joining them.)
  const signPostX = -1.20;
  const boomY = ridgeY - Math.abs(signPostX) * Math.tan(rAngle) + bargeLift / Math.cos(rAngle) + 0.05;
  const signGroup = new THREE.Group();
  signGroup.name = 'trade-sign-group';
  signGroup.position.set(signPostX, boomY, roofDepth / 2 + 0.03 + 0.065);

  const signPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.55, 0.13), matTimber));
  signPost.position.set(0, -0.125, 0);
  const boomLen = 1.08;
  const boom = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(boomLen, 0.13, 0.13), matTimber));
  boom.position.set(0.03 - boomLen / 2, 0, 0);
  // Knee brace from the post's outer face up to the boom's underside.
  const braceDX = 0.335;
  const braceDY = 0.295;
  const boomBrace = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.09, Math.hypot(braceDX, braceDY), 0.09), matTimber));
  boomBrace.rotation.z = Math.atan2(braceDX, braceDY);
  boomBrace.position.set(-0.065 - braceDX / 2, -0.065 - braceDY / 2, 0);
  signGroup.add(signPost, boom, boomBrace);

  // Two chains: an iron strap round the boom, then two interlocked oval links.
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

  // Octagonal (clipped-corner) plank board; its top plank takes the chain ends.
  const sW = 0.70;
  const sH = 0.50;
  const sCut = 0.10;
  const boardShape = new THREE.Shape();
  boardShape.moveTo(-sW / 2 + sCut, -sH / 2);
  boardShape.lineTo(sW / 2 - sCut, -sH / 2);
  boardShape.lineTo(sW / 2, -sH / 2 + sCut);
  boardShape.lineTo(sW / 2, sH / 2 - sCut);
  boardShape.lineTo(sW / 2 - sCut, sH / 2);
  boardShape.lineTo(-sW / 2 + sCut, sH / 2);
  boardShape.lineTo(-sW / 2, sH / 2 - sCut);
  boardShape.lineTo(-sW / 2, -sH / 2 + sCut);
  boardShape.closePath();
  const signBoardGeo = new THREE.ExtrudeGeometry(boardShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelSize: 0.008,
    bevelThickness: 0.008,
  });
  const boardX = (chainXs[0] + chainXs[1]) / 2;
  const boardY = -0.065 - 0.14 - sH / 2 + 0.01;
  const signBoard = applyShadow(new THREE.Mesh(signBoardGeo, matSign));
  signBoard.position.set(boardX, boardY, -0.025);
  signGroup.add(signBoard);
  // Plank joints on both faces, plus two iron bolts through the top plank.
  for (const face of [1, -1]) {
    for (const g of [-0.125, 0, 0.125]) {
      const groove = new THREE.Mesh(new THREE.BoxGeometry(sW - 0.02, 0.012, 0.004), matTimberDark);
      groove.position.set(boardX, boardY + g, face * 0.036);
      signGroup.add(groove);
    }
  }
  for (const cx of chainXs) {
    const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.08, 8), matIron);
    bolt.rotation.x = Math.PI / 2;
    bolt.position.set(cx, boardY + sH / 2 - 0.05, 0);
    signGroup.add(bolt);
  }
  // The sign showcases what the stall sells: an apple / carrots / cabbage emblem mounted on the
  // board face, plus a tied bunch hung from the boom beside it.
  const signFaceZ = 0.033; // front face of the board (extrude depth + bevel)
  const emblemApple = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(0.055, 12, 10), matApple));
  emblemApple.position.set(boardX - 0.19, boardY + 0.05, signFaceZ + 0.03);
  const emblemStem = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.03, 6), matAppleStem));
  emblemStem.position.set(boardX - 0.19, boardY + 0.11, signFaceZ + 0.03);
  signGroup.add(emblemApple, emblemStem);

  const emblemCabbage = new THREE.Group();
  emblemCabbage.add(applyShadow(new THREE.Mesh(new THREE.SphereGeometry(0.05, 12, 10), matCabbageInner)));
  for (let l = 0; l < 3; l++) {
    const leaf = applyShadow(new THREE.Mesh(
      new THREE.SphereGeometry(0.058, 10, 8, 0, Math.PI * 1.5, 0, Math.PI * 0.7),
      matCabbage,
    ));
    leaf.rotation.set(0.2, (l * Math.PI * 2) / 3, 0);
    emblemCabbage.add(leaf);
  }
  emblemCabbage.position.set(boardX + 0.19, boardY + 0.05, signFaceZ + 0.03);
  signGroup.add(emblemCabbage);

  /** One carrot: tapered root pointing down under a leaf tuft. */
  function createSignCarrot(rootR: number, rootLen: number, tuftR: number, tuftLen: number): THREE.Group {
    const carrot = new THREE.Group();
    const root = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(rootR, rootLen, 7), matCarrot));
    root.rotation.z = Math.PI; // tip down
    carrot.add(root);
    const tuft = applyShadow(new THREE.Mesh(new THREE.ConeGeometry(tuftR, tuftLen, 5), matFoliage));
    tuft.position.y = rootLen / 2 + tuftLen / 2 - 0.015;
    carrot.add(tuft);
    return carrot;
  }

  for (let i = 0; i < 3; i++) {
    const carrot = createSignCarrot(0.022, 0.15, 0.03, 0.07);
    carrot.position.set(boardX + (i - 1) * 0.055, boardY - 0.10, signFaceZ + 0.022);
    carrot.rotation.z = (i - 1) * 0.28;
    signGroup.add(carrot);
  }

  // Tied bunch hanging from the boom's outer end, in front of the board's clipped corner and clear
  // of the knee brace.
  const bunchX = -1.03;
  const bunchZ = 0.05;
  const bunchCord = applyShadow(new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.09, 6), matBurlapDark));
  bunchCord.position.set(bunchX, -0.105, bunchZ);
  signGroup.add(bunchCord);
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.4;
    const carrot = createSignCarrot(0.02, 0.16, 0.028, 0.06);
    carrot.position.set(bunchX + Math.sin(a) * 0.022, -0.225, bunchZ + Math.cos(a) * 0.022);
    carrot.rotation.set(Math.cos(a) * 0.12, 0, -Math.sin(a) * 0.12);
    signGroup.add(carrot);
  }

  gableGroup.add(signGroup);

  // ---------------------------------------------------------------------------
  // 5. THE MARKET STALL & 7-STRIPE CANVAS AWNING
  // ---------------------------------------------------------------------------
  const stallGroup = new THREE.Group();
  stallGroup.name = 'stall-group';
  root.add(stallGroup);

  const stallCenterX = -0.42;
  const stallW = 1.76;
  const stallD = 0.78;
  const stallTableH = 0.76;
  const stallZ = bD / 2;

  // The canopy springs from directly under the front tie beam and falls to the front beam at a
  // WORLD pitch of 30 deg. The root scale (x/z 1.19, y 0.95) flattens slopes, so the local pitch
  // is atan(tan(30 deg) * 1.19 / 0.95) = 35.9 deg.
  const awningWorldPitch = Math.PI / 6;
  const frontAwningZ = stallZ + stallD + 0.22;
  const rearAwningY = fH + bH - postW - 0.04; // rear beam top touches the tie beam underside
  const rearAwningZ = stallZ + 0.04;
  const awningLocalPitch = Math.atan((Math.tan(awningWorldPitch) * root.scale.z) / root.scale.y);
  const frontAwningY = rearAwningY - (frontAwningZ - rearAwningZ) * Math.tan(awningLocalPitch);

  // Front Stall Support Posts enclosing the counter
  const postLeftX = stallCenterX - stallW / 2 + 0.08;
  const postRightX = stallCenterX + stallW / 2 - 0.08;

  const leftStallPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, frontAwningY, 0.14), matTimber));
  leftStallPost.position.set(postLeftX, frontAwningY / 2, frontAwningZ - 0.07);

  const rightStallPost = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.14, frontAwningY, 0.14), matTimber));
  rightStallPost.position.set(postRightX, frontAwningY / 2, frontAwningZ - 0.07);
  stallGroup.add(leftStallPost, rightStallPost);

  // Countertop Planks cleanly spanning between posts
  const counterPlank = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stallW, 0.08, stallD), matTimberWarm));
  counterPlank.position.set(stallCenterX, stallTableH, stallZ + stallD / 2);
  stallGroup.add(counterPlank);

  // Lower Table Structure
  const tableLegGeo = new THREE.BoxGeometry(0.12, stallTableH, 0.12);
  const legL = applyShadow(new THREE.Mesh(tableLegGeo, matTimberDark));
  legL.position.set(postLeftX, stallTableH / 2, stallZ + stallD - 0.06);
  const legR = applyShadow(new THREE.Mesh(tableLegGeo, matTimberDark));
  legR.position.set(postRightX, stallTableH / 2, stallZ + stallD - 0.06);
  const legM = applyShadow(new THREE.Mesh(tableLegGeo, matTimberDark));
  legM.position.set(stallCenterX, stallTableH / 2, stallZ + stallD - 0.06);
  stallGroup.add(legL, legR, legM);

  const stretcher = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(stallW - 0.10, 0.08, 0.08), matTimberDark));
  stretcher.position.set(stallCenterX, 0.20, stallZ + stallD - 0.06);
  stallGroup.add(stretcher);

  // Knee braces in the front plane, from each post's inner face up to the front beam's underside.
  // (They used to lean backwards under the canopy and end in mid-air.)
  const braceRun = 0.30;
  const awningBraceGeo = new THREE.BoxGeometry(0.08, Math.SQRT2 * braceRun, 0.08);
  for (const [px, dir] of [[postLeftX, 1], [postRightX, -1]]) {
    const brace = applyShadow(new THREE.Mesh(awningBraceGeo, matTimber));
    brace.rotation.z = (-dir * Math.PI) / 4;
    brace.position.set(px + dir * (0.07 + braceRun / 2), frontAwningY - 0.045 - braceRun / 2, frontAwningZ - 0.03);
    stallGroup.add(brace);
  }

  // Awning Beams
  const awningW = stallW + 0.18;
  const awningFrontBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(awningW + 0.04, 0.09, 0.09), matTimber));
  awningFrontBeam.position.set(stallCenterX, frontAwningY, frontAwningZ);
  stallGroup.add(awningFrontBeam);

  const awningRearBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(awningW + 0.04, 0.08, 0.08), matTimber));
  awningRearBeam.position.set(stallCenterX, rearAwningY, rearAwningZ);
  stallGroup.add(awningRearBeam);

  // ---------------------------------------------------------------------------
  // 7-STRIPE CANVAS AWNING WITH MATCHING SCALLOPED VALANCE TABS
  // ---------------------------------------------------------------------------
  const awningGroup = new THREE.Group();
  awningGroup.name = 'awning-group';
  stallGroup.add(awningGroup);

  const numStripes = 7;
  const stripeW = awningW / numStripes;

  // Canopy profile: a quadratic Bezier from the rear-beam top to the front-beam top that leaves the
  // wall almost level and rolls down steeply into the valance - the reference's bullnose awning.
  // The chord still falls at the 30 deg world pitch set above.
  const canopyP0 = new THREE.Vector2(rearAwningZ, rearAwningY + 0.04);
  const canopyP2 = new THREE.Vector2(frontAwningZ, frontAwningY + 0.045);
  const canopyP1 = new THREE.Vector2(
    rearAwningZ + 0.62 * (frontAwningZ - rearAwningZ),
    canopyP0.y - 0.12 * (canopyP0.y - canopyP2.y),
  );
  const canopyCurve = new THREE.QuadraticBezierCurve(canopyP0, canopyP1, canopyP2);
  function createCanopyStrip(width: number, mat: THREE.Material): THREE.Mesh {
    const geo = new THREE.PlaneGeometry(width, 1, 1, 16);
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const p = canopyCurve.getPoint(0.5 - pos.getY(i)); // plane y +0.5 (rear) .. -0.5 (front)
      pos.setXYZ(i, pos.getX(i), p.y, p.x);
    }
    geo.computeVertexNormals();
    return applyShadow(new THREE.Mesh(geo, mat));
  }

  for (let s = 0; s < numStripes; s++) {
    const isGreen = s % 2 === 1;
    const stripeMat = isGreen ? matAwningGreen : matAwningCream;
    const stripeX = stallCenterX - awningW / 2 + stripeW / 2 + s * stripeW;

    const canopyMesh = createCanopyStrip(stripeW - 0.004, stripeMat);
    canopyMesh.position.x = stripeX;
    awningGroup.add(canopyMesh);

    // Valance flap hanging below the front edge, one per stripe: straight sides, then a shallow
    // V-point, with a small gap to its neighbours. Its top is flush with the front beam's top.
    const flapW = stripeW - 0.014;
    const flapSide = 0.17;
    const flapPoint = 0.07;
    const scallopShape = new THREE.Shape();
    scallopShape.moveTo(-flapW / 2, 0);
    scallopShape.lineTo(flapW / 2, 0);
    scallopShape.lineTo(flapW / 2, -flapSide);
    scallopShape.lineTo(0, -flapSide - flapPoint);
    scallopShape.lineTo(-flapW / 2, -flapSide);
    scallopShape.closePath();

    const scallopGeo = new THREE.ExtrudeGeometry(scallopShape, { depth: 0.014, bevelEnabled: false });
    const scallopMesh = applyShadow(new THREE.Mesh(scallopGeo, stripeMat));
    scallopMesh.position.set(stripeX, frontAwningY + 0.045, frontAwningZ + 0.04);
    awningGroup.add(scallopMesh);
  }

  // ---------------------------------------------------------------------------
  // 6. PRODUCE CRATES ON COUNTER (Apples, Carrots, Cabbages)
  // ---------------------------------------------------------------------------
  const cratesGroup = new THREE.Group();
  cratesGroup.name = 'crates-group';
  stallGroup.add(cratesGroup);

  const crateW = 0.48;
  const crateH = 0.15;
  const crateD = 0.38;
  const tiltAngle = 0.38;
  // Each crate's front edge rests ON the counter and its raised back edge sits on a display
  // rail (the crates used to sink 5 cm into the counter at the front and float at the back).
  const counterTop = stallTableH + 0.04;
  const crateLift = (crateD / 2) * Math.sin(tiltAngle);
  const crateZ = stallZ + stallD / 2 + 0.02;

  // --- CRATE 1 (LEFT): RED APPLES ---
  const appleCrateGroup = new THREE.Group();
  appleCrateGroup.position.set(stallCenterX - 0.52, counterTop + crateLift, crateZ);
  appleCrateGroup.rotation.x = tiltAngle;
  appleCrateGroup.add(createProduceCrate(crateW, crateH, crateD));

  // Reference crates hold a few large pieces of produce, not a fine grid: 9 apples (3 x 3) that
  // nearly fill the crate's 0.44 x 0.34 interior, 5 carrots laid across it, 5 cabbages.
  const appleSphereGeo = new THREE.SphereGeometry(0.062, 12, 10);
  const stemCylGeo = new THREE.CylinderGeometry(0.005, 0.005, 0.026, 6);
  for (let ax = -1; ax <= 1; ax++) {
    for (let az = -1; az <= 1; az++) {
      const apple = applyShadow(new THREE.Mesh(appleSphereGeo, matApple));
      const jx = (rand() - 0.5) * 0.012;
      const jz = (rand() - 0.5) * 0.012;
      apple.position.set(ax * 0.14 + jx, 0.084 + (az === 0 ? 0.012 : 0), az * 0.105 + jz);
      const stem = applyShadow(new THREE.Mesh(stemCylGeo, matAppleStem));
      stem.position.y = 0.066;
      apple.add(stem);
      appleCrateGroup.add(apple);
    }
  }
  cratesGroup.add(appleCrateGroup);

  // --- CRATE 2 (CENTER): ORANGE CARROTS ---
  const carrotCrateGroup = new THREE.Group();
  carrotCrateGroup.position.set(stallCenterX, counterTop + crateLift, crateZ);
  carrotCrateGroup.rotation.x = tiltAngle;
  carrotCrateGroup.add(createProduceCrate(crateW, crateH, crateD));

  const carrotLen = 0.22;
  const carrotRootGeo = new THREE.ConeGeometry(0.036, carrotLen, 8);
  const carrotLeafGeo = new THREE.ConeGeometry(0.045, 0.14, 5);
  const carrotZ = [0.06, -0.02, 0.07, -0.03, 0.05];
  for (let k = 0; k < 5; k++) {
    const carrot = new THREE.Group();
    const rootMesh = applyShadow(new THREE.Mesh(carrotRootGeo, matCarrot));
    rootMesh.rotation.x = Math.PI;
    carrot.add(rootMesh);

    // Two leaf cones fanned toward world-up so the tops read as a bushy tuft, not a spike.
    for (const [lx, lz] of [[0.30, 0.35], [0.45, 0.85]]) {
      const leafMesh = applyShadow(new THREE.Mesh(carrotLeafGeo, matFoliage));
      leafMesh.rotation.set(lx, 0, lz);
      leafMesh.position.set(-Math.sin(lz) * 0.06, carrotLen / 2 + 0.03 + Math.cos(lz) * 0.04, Math.sin(lx) * 0.05);
      carrot.add(leafMesh);
    }

    // Laid across the crate at ~31 deg, green tops rising toward the back-right like the reference.
    carrot.rotation.set(-0.5, 0, -0.95 + (rand() - 0.5) * 0.12);
    carrot.position.set(-0.10 + k * 0.05, 0.07, carrotZ[k]);
    carrotCrateGroup.add(carrot);
  }
  cratesGroup.add(carrotCrateGroup);

  // --- CRATE 3 (RIGHT): FRESH GREEN CABBAGES ---
  const cabbageCrateGroup = new THREE.Group();
  cabbageCrateGroup.position.set(stallCenterX + 0.52, counterTop + crateLift, crateZ);
  cabbageCrateGroup.rotation.x = tiltAngle;
  cabbageCrateGroup.add(createProduceCrate(crateW, crateH, crateD));

  const cabbageCoreGeo = new THREE.SphereGeometry(0.055, 10, 8);
  const cabbageLeafGeo = new THREE.SphereGeometry(0.065, 8, 6, 0, Math.PI * 1.5, 0, Math.PI * 0.7);
  // 3 cabbages in front, 2 heaped behind them.
  const cabbageSpots: Array<[number, number, number]> = [
    [-0.14, 0.095, 0.07], [0, 0.095, 0.07], [0.14, 0.095, 0.07], [-0.07, 0.125, -0.08], [0.07, 0.125, -0.08],
  ];
  for (const [cbX, cbY, cbZ] of cabbageSpots) {
    const cabbage = new THREE.Group();
    const core = applyShadow(new THREE.Mesh(cabbageCoreGeo, matCabbageInner));
    cabbage.add(core);

    for (let l = 0; l < 3; l++) {
      const leaf = applyShadow(new THREE.Mesh(cabbageLeafGeo, matCabbage));
      leaf.rotation.y = (l * Math.PI * 2) / 3;
      leaf.rotation.x = 0.2;
      cabbage.add(leaf);
    }
    cabbage.scale.setScalar(1.3);
    cabbage.position.set(cbX, cbY, cbZ);
    cabbageCrateGroup.add(cabbage);
  }
  cratesGroup.add(cabbageCrateGroup);

  const crateBackZ = crateZ - (crateD / 2) * Math.cos(tiltAngle);
  const railH = crateD * Math.sin(tiltAngle);
  const displayRail = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(3 * 0.52 + 0.02, railH, 0.05), matTimberDark));
  displayRail.position.set(stallCenterX, counterTop + railH / 2, crateBackZ - 0.015);
  cratesGroup.add(displayRail);

  // ---------------------------------------------------------------------------
  // 7. GROUND PROPS (Barrels, Apple Crate, Realistic Grain Sacks)
  // ---------------------------------------------------------------------------
  const propsGroup = new THREE.Group();
  propsGroup.name = 'props-group';
  root.add(propsGroup);

  // Far-Left Ground Barrel - clear of the counter's left leg (it used to stand inside it).
  const leftBarrel = createBarrel(0.33, 0.82);
  leftBarrel.position.set(stallCenterX - stallW / 2 - 0.45, 0.41, stallZ + 0.50);
  propsGroup.add(leftBarrel);

  // Ground Apple Crate in front of left barrel, clear of both the barrel and the stall post.
  const groundAppleCrate = createProduceCrate(0.44, 0.18, 0.36);
  groundAppleCrate.position.set(stallCenterX - stallW / 2 - 0.22, 0, stallZ + 1.10);
  const groundAppleGeo = new THREE.SphereGeometry(0.044, 10, 8);
  for (let ax = -1; ax <= 1; ax++) {
    for (let az = -1; az <= 1; az++) {
      const gApple = applyShadow(new THREE.Mesh(groundAppleGeo, matApple));
      gApple.position.set(ax * 0.09, 0.09, az * 0.09);
      groundAppleCrate.add(gApple);
    }
  }
  propsGroup.add(groundAppleCrate);

  // Open Burlap Grain Sack in front of stall center
  const openSackGroup = new THREE.Group();
  openSackGroup.position.set(stallCenterX - 0.08, 0, stallZ + stallD + 0.25);
  
  // Organic rounded sack body (lathe: slumped belly rising to the rolled lip)
  const openSackProfile = [[0.0, 0.0], [0.2, 0.0], [0.245, 0.05], [0.258, 0.15], [0.24, 0.26], [0.215, 0.315]]
    .map(([r, y]) => new THREE.Vector2(Math.max(0.0001, r), y));
  const sackBase = applyShadow(new THREE.Mesh(new THREE.LatheGeometry(openSackProfile, 18), matBurlap));
  openSackGroup.add(sackBase);

  // Rolled burlap lip
  const sackRim = applyShadow(new THREE.Mesh(new THREE.TorusGeometry(0.21, 0.035, 8, 14), matBurlapDark));
  sackRim.rotation.x = Math.PI / 2;
  sackRim.position.y = 0.32;
  openSackGroup.add(sackRim);

  // Golden grain mound inside
  const grainMound = applyShadow(new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 8, 0, Math.PI * 2, 0, Math.PI * 0.5), matGrain));
  grainMound.position.y = 0.29;
  openSackGroup.add(grainMound);
  propsGroup.add(openSackGroup);

  // Two Tied Burlap Sacks at the front corner, beside (no longer inside) the door steps
  const sack1 = createTiedSack(0.22, 0.62, 0.20);
  sack1.position.set(bW / 2 + 0.46, 0.015, 1.32);
  sack1.rotation.z = -0.06;
  sack1.rotation.y = 0.3;

  const sack2 = createTiedSack(0.19, 0.52, 0.175);
  sack2.position.set(bW / 2 + 0.92, 0.015, 1.50);
  sack2.rotation.z = 0.07;
  sack2.rotation.y = -0.4;
  propsGroup.add(sack1, sack2);

  // Ground Barrel beyond the door steps, clear of the steps and the plinth (+X wall)
  const rightBarrel = createBarrel(0.32, 0.80);
  rightBarrel.position.set(plinthFaceX + 0.46, 0.40, -0.95);
  propsGroup.add(rightBarrel);

  // ---------------------------------------------------------------------------
  // 8. TERRACOTTA CURVED TILE GABLE ROOF & ASHLAR STONE CHIMNEY
  // ---------------------------------------------------------------------------
  const roofGroup = new THREE.Group();
  roofGroup.name = 'roof-group';
  root.add(roofGroup);

  // --- A. RIGHT ROOF SLOPE (Facing +X over door) ---
  const rightSlopeGroup = new THREE.Group();
  rightSlopeGroup.position.set(0, ridgeY, 0);
  rightSlopeGroup.rotation.z = -rAngle;

  const roofDeckGeo = new THREE.BoxGeometry(slopeLen, deckT, roofDepth);
  const rightDeck = applyShadow(new THREE.Mesh(roofDeckGeo, matTimber));
  rightDeck.position.set(slopeLen / 2, -deckT / 2, 0);
  rightSlopeGroup.add(rightDeck);

  // Rafters under the deck, from just inside the wall line out to the eave: their exposed ends show
  // under the overhang and each one bears on the eave plate (the old horizontal "tails" were
  // stubs that supported nothing).
  const wallAlong = bW / 2 / Math.cos(rAngle); // slope distance from the ridge to the wall line
  function addRafters(slopeGroup: THREE.Group, side: 1 | -1): void {
    const x0 = wallAlong - 0.22;
    const x1 = slopeLen - 0.02;
    for (const rz of [-1.2, -0.6, 0, 0.6, 1.2]) {
      const rafter = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.12, 0.09), matTimberDark));
      rafter.position.set((side * (x0 + x1)) / 2, -deckT - 0.06, rz);
      slopeGroup.add(rafter);
    }
  }
  addRafters(rightSlopeGroup, 1);

  // Plain-tile courses laid eave -> ridge in half bond. Each tile runs down the slope and is longer
  // than the course pitch, so every course's tail laps over the head of the course below; the tail
  // is lifted one tile thickness (tilt asin(t / pitch)), which is the step-down shadow line the
  // reference shows between courses. side +1: slope-local +X runs down-slope; side -1: -X does.
  const tileCourses = 8;
  const tilesPerCourse = 9;
  const tileLap = 0.4; // lap as a fraction of the course pitch
  const tileThick = 0.04; // createClayTile body + bevels, measured at the camber
  const tileHalfH = 0.025; // half the centred tile's bounding height
  const eaveOverhang = 0.03;
  const ridgeClear = 0.02; // top course tucks under the ridge beam
  const coursePitch = (slopeLen + eaveOverhang - ridgeClear) / (tileCourses + tileLap);
  const tileLen = coursePitch * (1 + tileLap);
  const courseTilt = Math.asin(tileThick / coursePitch);
  const colStepZ = roofDepth / tilesPerCourse;
  const tileGap = 0.012;

  // Tiles pick their fired-clay shade and a small hand-laid yaw at random (seeded) - a fixed
  // (c, r) formula produced a visible checkerboard.
  function addTileCourses(slopeGroup: THREE.Group, side: 1 | -1): void {
    const centreY = tileHalfH + 0.002 + (tileLen / 2) * Math.sin(courseTilt);
    for (let r = 0; r < tileCourses; r++) {
      const tailX = slopeLen + eaveOverhang - r * coursePitch;
      // Odd courses are offset half a tile; half-width tiles close both gable ends.
      const slots: Array<[number, number]> = [];
      if (r % 2 === 0) {
        for (let c = 0; c < tilesPerCourse; c++) slots.push([-roofDepth / 2 + (c + 0.5) * colStepZ, colStepZ]);
      } else {
        slots.push([-roofDepth / 2 + colStepZ / 4, colStepZ / 2]);
        for (let c = 0; c < tilesPerCourse - 1; c++) slots.push([-roofDepth / 2 + (c + 1) * colStepZ, colStepZ]);
        slots.push([roofDepth / 2 - colStepZ / 4, colStepZ / 2]);
      }
      for (const [z, w] of slots) {
        const tile = createClayTile(w - tileGap, tileLen, Math.floor(rand() * tileMats.length));
        tile.geometry.rotateY(Math.PI / 2); // tile length runs down the slope
        tile.position.set(side * (tailX - tileLen / 2), centreY, z);
        tile.rotation.set(0, (rand() - 0.5) * 0.06, courseTilt * side);
        slopeGroup.add(tile);
      }
    }
  }

  addTileCourses(rightSlopeGroup, 1);
  roofGroup.add(rightSlopeGroup);

  // --- B. LEFT ROOF SLOPE (Facing -X over stall sign) ---
  const leftSlopeGroup = new THREE.Group();
  leftSlopeGroup.position.set(0, ridgeY, 0);
  leftSlopeGroup.rotation.z = rAngle;

  const leftDeck = applyShadow(new THREE.Mesh(roofDeckGeo, matTimber));
  leftDeck.position.set(-slopeLen / 2, -deckT / 2, 0);
  leftSlopeGroup.add(leftDeck);
  addRafters(leftSlopeGroup, -1);

  addTileCourses(leftSlopeGroup, -1);
  roofGroup.add(leftSlopeGroup);

  // --- C. TIMBER RIDGE BEAM ---
  // The reference caps the ridge with a square timber, not clay caps: the top courses tuck under
  // it and its ends project past both gables into the apex blocks. (The old clay ridge tiles were
  // stood on end and read as a comb of fins.)
  const ridgeBeamLen = roofDepth + 0.30;
  const ridgeBeam = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.20, ridgeBeamLen), matTimber));
  ridgeBeam.position.set(0, ridgeY + 0.07, 0);
  roofGroup.add(ridgeBeam);

  // --- D. ASHLAR STONE MASONRY CHIMNEY (Slender stack on +X slope) ---
  const chimneyGroup = new THREE.Group();
  chimneyGroup.name = 'chimney-group';
  chimneyGroup.position.set(0.68, ridgeY - 1.17, -0.40);

  const chimW = 0.52;
  const chimH = 1.42;
  const chimD = 0.52;

  const chimBody = applyShadow(new THREE.Mesh(new THREE.BoxGeometry(chimW, chimH, chimD), matStonePlinth));
  chimBody.position.y = chimH / 2;
  chimneyGroup.add(chimBody);

  const numChimCourses = 6;
  const courseH = chimH / numChimCourses;
  for (let c = 0; c < numChimCourses; c++) {
    // Running bond on all four faces: odd courses start and end with half stones, so no joint
    // runs straight up the stack (the old 2-stone grid stacked every joint).
    const fracs = c % 2 === 0 ? [0.5, 0.5] : [0.25, 0.5, 0.25];
    let offset = 0;
    fracs.forEach((f, si) => {
      const len = f * chimW;
      const along = -chimW / 2 + offset + len / 2;
      const y = c * courseH + courseH / 2;
      for (const face of [1, -1]) {
        const zStone = applyShadow(new THREE.Mesh(
          new THREE.BoxGeometry(len - 0.014, courseH * 0.9, 0.05),
          stoneMats[(c + si + (face > 0 ? 0 : 2)) % 3],
        ));
        zStone.position.set(face * along, y, face * (chimD / 2 + 0.015));
        const xStone = applyShadow(new THREE.Mesh(
          new THREE.BoxGeometry(0.05, courseH * 0.9, len - 0.014),
          stoneMats[(c + si + 1) % 3],
        ));
        xStone.position.set(face * (chimW / 2 + 0.015), y, -face * along);
        chimneyGroup.add(zStone, xStone);
      }
      offset += len;
    });
  }

  const crownGeo = new THREE.BoxGeometry(chimW + 0.14, 0.14, chimD + 0.14);
  const chimneyCrown = applyShadow(new THREE.Mesh(crownGeo, matStoneStep));
  chimneyCrown.position.y = chimH + 0.07;
  chimneyGroup.add(chimneyCrown);

  const flueMesh = new THREE.Mesh(new THREE.BoxGeometry(chimW * 0.50, 0.04, chimD * 0.50), matIron);
  flueMesh.position.y = chimH + 0.15;
  chimneyGroup.add(flueMesh);

  roofGroup.add(chimneyGroup);

  // ---------------------------------------------------------------------------
  // Metadata & Runtime Contract
  // ---------------------------------------------------------------------------
  root.userData.sculptRuntime = {
    partCoverage: {
      totalParts: 42,
      labeledParts: 42,
      coverageRatio: 1.0,
    },
    actionReady: true,
    emissionTarget: 'standalone-threejs',
  };

  return root;
}
