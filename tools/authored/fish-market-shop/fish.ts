import * as THREE from "three";

/** Sculpted fish geometry kept from the approved reconstruction. */
export type FishSpecies = "mackerel" | "snapper" | "flatfish";

export function buildSculptedFishBody(
  species: FishSpecies,
  length: number,
  width: number,
  height: number
): THREE.BufferGeometry {
  const slices = 32;
  const ringSegments = 24;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i <= slices; i++) {
    const t = i / slices;
    const z = -length * 0.5 + t * length;

    let s = 1.0;
    let yOff = 0;
    let rxScale = 1.0;
    let ryScale = 1.0;

    if (species === 'mackerel') {
      if (t < 0.15) {
        s = 0.18 + (t / 0.15) * 0.45;
      } else if (t < 0.65) {
        const u = (t - 0.15) / 0.5;
        s = 0.63 + Math.sin(u * Math.PI * 0.5) * 0.37;
      } else {
        const u = (t - 0.65) / 0.35;
        s = 1.0 - Math.pow(u, 1.25) * 0.96;
      }
      rxScale = 0.95;
      ryScale = 1.05;
    } else if (species === 'snapper') {
      if (t < 0.12) {
        s = 0.20 + (t / 0.12) * 0.45;
      } else if (t < 0.55) {
        const u = (t - 0.12) / 0.43;
        s = 0.65 + Math.sin(u * Math.PI * 0.5) * 0.35;
      } else {
        const u = (t - 0.55) / 0.45;
        s = 1.0 - Math.pow(u, 1.15) * 0.95;
      }
      rxScale = 0.82;
      ryScale = 1.22;
      yOff = height * 0.18 * Math.sin(t * Math.PI * 0.85);
    } else {
      if (t < 0.10) {
        s = 0.22 + (t / 0.10) * 0.42;
      } else if (t < 0.52) {
        const u = (t - 0.10) / 0.42;
        s = 0.64 + Math.sin(u * Math.PI * 0.5) * 0.36;
      } else {
        const u = (t - 0.52) / 0.48;
        s = 1.0 - Math.pow(u, 1.2) * 0.93;
      }
      rxScale = 1.35;
      ryScale = 0.55;
    }

    const rx = Math.max(0.002, (width * 0.5) * s * rxScale);
    const ry = Math.max(0.002, (height * 0.5) * s * ryScale);

    for (let j = 0; j <= ringSegments; j++) {
      const phi = j / ringSegments;
      const theta = -Math.PI * 0.5 + phi * Math.PI * 2.0;

      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);

      let ryk = ry;
      if (sinT < 0 && species !== 'flatfish') {
        ryk *= (1.0 - 0.08 * (1.0 - Math.abs(cosT)));
      }

      const x = rx * cosT;
      const y = yOff + ryk * sinT;

      positions.push(x, y, z);
      uvs.push(phi, t);
    }
  }

  const stride = ringSegments + 1;
  for (let i = 0; i < slices; i++) {
    for (let j = 0; j < ringSegments; j++) {
      const a = i * stride + j;
      const b = (i + 1) * stride + j;
      const c = (i + 1) * stride + (j + 1);
      const d = i * stride + (j + 1);

      indices.push(a, b, d);
      indices.push(b, c, d);
    }
  }

  const tailCenterIndex = positions.length / 3;
  positions.push(0, 0, -length * 0.5);
  uvs.push(0.5, 0);
  for (let j = 0; j < ringSegments; j++) {
    indices.push(tailCenterIndex, j + 1, j);
  }

  const snoutCenterIndex = positions.length / 3;
  const snoutY = species === 'snapper' ? height * 0.18 * Math.sin(Math.PI * 0.85) : 0;
  positions.push(0, snoutY, length * 0.5);
  uvs.push(0.5, 1);
  const lastSliceStart = slices * stride;
  for (let j = 0; j < ringSegments; j++) {
    indices.push(snoutCenterIndex, lastSliceStart + j, lastSliceStart + j + 1);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function buildSculptedTailFin(species: FishSpecies): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  if (species === 'mackerel') {
    shape.moveTo(0.03, 0.0);
    shape.bezierCurveTo(0.01, 0.04, -0.04, 0.08, -0.12, 0.12);
    shape.bezierCurveTo(-0.11, 0.13, -0.08, 0.09, -0.05, 0.02);
    shape.lineTo(-0.05, -0.02);
    shape.bezierCurveTo(-0.08, -0.09, -0.11, -0.13, -0.12, -0.12);
    shape.bezierCurveTo(-0.04, -0.08, 0.01, -0.04, 0.03, 0.0);
  } else if (species === 'snapper') {
    shape.moveTo(0.03, 0.0);
    shape.bezierCurveTo(0.01, 0.05, -0.03, 0.09, -0.13, 0.11);
    shape.bezierCurveTo(-0.11, 0.12, -0.07, 0.08, -0.045, 0.02);
    shape.lineTo(-0.045, -0.02);
    shape.bezierCurveTo(-0.07, -0.08, -0.11, -0.12, -0.13, -0.11);
    shape.bezierCurveTo(-0.03, -0.09, 0.01, -0.05, 0.03, 0.0);
  } else {
    shape.moveTo(0.02, 0.0);
    shape.bezierCurveTo(0.01, 0.04, -0.03, 0.07, -0.08, 0.08);
    shape.bezierCurveTo(-0.09, 0.07, -0.10, 0.04, -0.10, 0.0);
    shape.bezierCurveTo(-0.10, -0.04, -0.09, -0.07, -0.08, -0.08);
    shape.bezierCurveTo(-0.03, -0.07, 0.01, -0.04, 0.02, 0.0);
  }
  const depth = species === 'snapper' ? 0.012 : (species === 'mackerel' ? 0.010 : 0.008);
  const geo = new THREE.ExtrudeGeometry(shape, {
    depth,
    bevelEnabled: true,
    bevelSegments: 2,
    steps: 1,
    bevelSize: 0.002,
    bevelThickness: 0.002,
  });
  geo.translate(0, 0, -depth * 0.5);
  if (species !== 'flatfish') {
    geo.rotateX(-Math.PI / 2);
  }
  geo.computeVertexNormals();
  return geo;
}

export function attachFishAnatomy(
  bodyMesh: THREE.Mesh,
  species: FishSpecies,
  length: number,
  width: number,
  height: number,
  finMaterial: THREE.Material
): void {
  const eyeMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(0x0a0f16),
    roughness: 0.04,
    clearcoat: 1.0,
    clearcoatRoughness: 0.02,
    metalness: 0.1,
  });

  const irisRimMat = new THREE.MeshStandardMaterial({
    color: species === 'snapper' ? 0xd4a06a : (species === 'mackerel' ? 0x9fb5c2 : 0x8a7a60),
    roughness: 0.4,
    metalness: 0.2,
  });

  if (species === 'flatfish') {
    const eyeR = 0.013;
    const eyeGeo = new THREE.SphereGeometry(eyeR, 12, 10);
    const irisGeo = new THREE.RingGeometry(eyeR * 0.9, eyeR * 1.3, 12);
    irisGeo.rotateX(-Math.PI / 2);

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-width * 0.10, height * 0.32, length * 0.24);
    bodyMesh.add(leftEye);

    const leftRim = new THREE.Mesh(irisGeo, irisRimMat);
    leftRim.position.set(-width * 0.10, height * 0.32 - 0.002, length * 0.24);
    bodyMesh.add(leftRim);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(width * 0.06, height * 0.34, length * 0.28);
    bodyMesh.add(rightEye);

    const rightRim = new THREE.Mesh(irisGeo, irisRimMat);
    rightRim.position.set(width * 0.06, height * 0.34 - 0.002, length * 0.28);
    bodyMesh.add(rightRim);

    const leftSkirtShape = new THREE.Shape();
    leftSkirtShape.moveTo(-width * 0.48, -length * 0.35);
    leftSkirtShape.bezierCurveTo(-width * 0.65, -length * 0.10, -width * 0.65, length * 0.15, -width * 0.45, length * 0.32);
    leftSkirtShape.bezierCurveTo(-width * 0.35, length * 0.28, -width * 0.45, -length * 0.10, -width * 0.48, -length * 0.35);
    const leftSkirtGeo = new THREE.ExtrudeGeometry(leftSkirtShape, { depth: 0.004, bevelEnabled: false });
    leftSkirtGeo.rotateX(-Math.PI / 2);
    leftSkirtGeo.computeVertexNormals();
    const leftSkirt = new THREE.Mesh(leftSkirtGeo, finMaterial);
    leftSkirt.position.y = -0.002;
    bodyMesh.add(leftSkirt);

    const rightSkirtShape = new THREE.Shape();
    rightSkirtShape.moveTo(width * 0.48, -length * 0.35);
    rightSkirtShape.bezierCurveTo(width * 0.65, -length * 0.10, width * 0.65, length * 0.15, width * 0.45, length * 0.32);
    rightSkirtShape.bezierCurveTo(width * 0.35, length * 0.28, width * 0.45, -length * 0.10, width * 0.48, -length * 0.35);
    const rightSkirtGeo = new THREE.ExtrudeGeometry(rightSkirtShape, { depth: 0.004, bevelEnabled: false });
    rightSkirtGeo.rotateX(-Math.PI / 2);
    rightSkirtGeo.computeVertexNormals();
    const rightSkirt = new THREE.Mesh(rightSkirtGeo, finMaterial);
    rightSkirt.position.y = -0.002;
    bodyMesh.add(rightSkirt);
  } else {
    const eyeR = species === 'snapper' ? 0.016 : 0.013;
    const eyeGeo = new THREE.SphereGeometry(eyeR, 14, 10);
    const irisGeo = new THREE.CylinderGeometry(eyeR * 1.15, eyeR * 1.15, 0.004, 12);
    irisGeo.rotateZ(Math.PI / 2);

    const eyeZ = species === 'snapper' ? length * 0.30 : length * 0.34;
    const eyeY = species === 'snapper' ? height * 0.25 : height * 0.08;
    const eyeX = species === 'snapper' ? width * 0.38 : width * 0.42;

    const leftEye = new THREE.Mesh(eyeGeo, eyeMat);
    leftEye.position.set(-eyeX, eyeY, eyeZ);
    bodyMesh.add(leftEye);

    const leftIris = new THREE.Mesh(irisGeo, irisRimMat);
    leftIris.position.set(-eyeX * 0.96, eyeY, eyeZ);
    bodyMesh.add(leftIris);

    const rightEye = new THREE.Mesh(eyeGeo, eyeMat);
    rightEye.position.set(eyeX, eyeY, eyeZ);
    bodyMesh.add(rightEye);

    const rightIris = new THREE.Mesh(irisGeo, irisRimMat);
    rightIris.position.set(eyeX * 0.96, eyeY, eyeZ);
    bodyMesh.add(rightIris);

    const dorsalShape = new THREE.Shape();
    if (species === 'snapper') {
      dorsalShape.moveTo(0, -length * 0.22);
      dorsalShape.bezierCurveTo(height * 0.35, -length * 0.15, height * 0.55, 0.0, height * 0.50, length * 0.10);
      dorsalShape.bezierCurveTo(height * 0.35, length * 0.18, height * 0.15, length * 0.22, 0, length * 0.25);
    } else {
      dorsalShape.moveTo(0, -length * 0.18);
      dorsalShape.bezierCurveTo(height * 0.10, -length * 0.12, height * 0.40, -length * 0.02, height * 0.45, 0.02);
      dorsalShape.bezierCurveTo(height * 0.30, length * 0.08, height * 0.10, length * 0.12, 0, length * 0.15);
    }
    const dorsalGeo = new THREE.ExtrudeGeometry(dorsalShape, {
      depth: 0.005,
      bevelEnabled: true,
      bevelSize: 0.002,
      bevelThickness: 0.002,
      bevelSegments: 1,
    });
    dorsalGeo.translate(0, 0, -0.0025);
    const m = new THREE.Matrix4().set(
      0, 0, 1, 0,
      1, 0, 0, 0,
      0, 1, 0, 0,
      0, 0, 0, 1
    );
    dorsalGeo.applyMatrix4(m);
    dorsalGeo.computeVertexNormals();

    const dorsalFin = new THREE.Mesh(dorsalGeo, finMaterial);
    dorsalFin.position.y = species === 'snapper' ? height * 0.40 : height * 0.36;
    bodyMesh.add(dorsalFin);

    const pectZ = species === 'snapper' ? length * 0.14 : length * 0.16;
    const pectY = -height * 0.05;
    const pectX = species === 'snapper' ? width * 0.42 : width * 0.44;

    const leftPectShape = new THREE.Shape();
    leftPectShape.moveTo(0, 0);
    leftPectShape.bezierCurveTo(-0.015, -0.02, -0.03, -0.06, -0.025, -0.10);
    leftPectShape.bezierCurveTo(-0.015, -0.09, -0.005, -0.05, 0, 0);
    const leftPectGeo = new THREE.ExtrudeGeometry(leftPectShape, { depth: 0.003, bevelEnabled: false });
    leftPectGeo.computeVertexNormals();
    const leftPect = new THREE.Mesh(leftPectGeo, finMaterial);
    leftPect.position.set(-pectX, pectY, pectZ);
    leftPect.rotation.set(0.15, 0.35, 0.45);
    bodyMesh.add(leftPect);

    const rightPectShape = new THREE.Shape();
    rightPectShape.moveTo(0, 0);
    rightPectShape.bezierCurveTo(0.015, -0.02, 0.03, -0.06, 0.025, -0.10);
    rightPectShape.bezierCurveTo(0.015, -0.09, 0.005, -0.05, 0, 0);
    const rightPectGeo = new THREE.ExtrudeGeometry(rightPectShape, { depth: 0.003, bevelEnabled: false });
    rightPectGeo.computeVertexNormals();
    const rightPect = new THREE.Mesh(rightPectGeo, finMaterial);
    rightPect.position.set(pectX, pectY, pectZ);
    rightPect.rotation.set(0.15, -0.35, -0.45);
    bodyMesh.add(rightPect);
  }
}

export function buildCarvedSignEmblem(): THREE.BufferGeometry {
  const shape = new THREE.Shape();
  shape.moveTo(0.42, 0.0);
  shape.bezierCurveTo(0.38, 0.07, 0.30, 0.12, 0.22, 0.15);
  shape.bezierCurveTo(0.14, 0.18, 0.04, 0.22, -0.06, 0.20);
  shape.bezierCurveTo(-0.12, 0.18, -0.20, 0.14, -0.28, 0.08);
  shape.bezierCurveTo(-0.33, 0.05, -0.38, 0.03, -0.42, 0.04);
  shape.bezierCurveTo(-0.46, 0.10, -0.50, 0.16, -0.54, 0.18);
  shape.bezierCurveTo(-0.52, 0.12, -0.48, 0.06, -0.46, 0.0);
  shape.bezierCurveTo(-0.48, -0.06, -0.52, -0.12, -0.54, -0.18);
  shape.bezierCurveTo(-0.50, -0.16, -0.46, -0.10, -0.42, -0.04);
  shape.bezierCurveTo(-0.38, -0.03, -0.33, -0.05, -0.28, -0.08);
  shape.bezierCurveTo(-0.20, -0.13, -0.10, -0.17, 0.02, -0.18);
  shape.bezierCurveTo(0.14, -0.18, 0.26, -0.14, 0.35, -0.07);
  shape.bezierCurveTo(0.39, -0.04, 0.41, -0.02, 0.42, 0.0);

  const eyeHole = new THREE.Path();
  eyeHole.absarc(0.28, 0.04, 0.025, 0, Math.PI * 2, true);
  shape.holes.push(eyeHole);

  const geo = new THREE.ExtrudeGeometry(shape, {
    depth: 0.035,
    bevelEnabled: true,
    bevelSegments: 3,
    steps: 1,
    bevelSize: 0.006,
    bevelThickness: 0.006,
  });
  geo.computeVertexNormals();
  return geo;
}
