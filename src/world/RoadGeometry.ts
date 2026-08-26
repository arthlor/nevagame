import * as THREE from "three";
import { PALETTE_HEX } from "../render/materials/PaletteTokens";
import type {
  CompiledWorldRoute,
  WorldPoint,
  WorldRouteJunction,
  WorldRouteKind,
  WorldRouteProfile
} from "./WorldLayout";

export interface OrganicRoadGeometryOptions {
  routes: readonly CompiledWorldRoute[];
  junctions: readonly WorldRouteJunction[];
  profiles: Readonly<Record<WorldRouteKind, Readonly<WorldRouteProfile>>>;
  bridge: {
    center: WorldPoint;
    halfSpan: number;
    deckWidth: number;
    entrySurfaceY: number;
    westDeckEdge: WorldPoint;
    eastDeckEdge: WorldPoint;
    gatewayDepthMeters: number;
    gatewayInsetMeters: number;
    gatewaySlabCount: number;
    gatewaySlabGapMeters: number;
  };
  heightAt: (x: number, z: number) => number;
  isBridgeDeck: (x: number, z: number) => boolean;
}

const TRANSVERSE_OFFSETS = [
  -1, -0.96, -0.84, -0.66, -0.44, -0.22, 0,
  0.22, 0.44, 0.66, 0.84, 0.96, 1
] as const;

function paletteColor(token: keyof typeof PALETTE_HEX): THREE.Color {
  return new THREE.Color(PALETTE_HEX[token]);
}

function clamp01(value: number): number {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function smoothstep(edge0: number, edge1: number, value: number): number {
  const amount = clamp01((value - edge0) / Math.max(0.0001, edge1 - edge0));
  return amount * amount * (3 - 2 * amount);
}

function normalize2D(x: number, z: number): WorldPoint {
  const length = Math.max(0.0001, Math.hypot(x, z));
  return { x: x / length, z: z / length };
}

function dot2D(a: WorldPoint, b: WorldPoint): number {
  return a.x * b.x + a.z * b.z;
}

function distance2D(a: WorldPoint, b: WorldPoint): number {
  return Math.hypot(a.x - b.x, a.z - b.z);
}

function blendColors(
  base: THREE.Color,
  warm: THREE.Color,
  dry: THREE.Color,
  grass: THREE.Color,
  shoulderAmount: number,
  grassAmount: number
): THREE.Color {
  return base.clone()
    .lerp(warm, shoulderAmount * 0.72)
    .lerp(dry, shoulderAmount * 0.2)
    .lerp(grass, grassAmount);
}

function outwardDirections(
  route: CompiledWorldRoute,
  center: WorldPoint
): WorldPoint[] {
  let closestIndex = 0;
  let closestDistance = Number.POSITIVE_INFINITY;
  for (const [index, sample] of route.samples.entries()) {
    const distance = distance2D(sample.point, center);
    if (distance < closestDistance) {
      closestDistance = distance;
      closestIndex = index;
    }
  }

  const directions: WorldPoint[] = [];
  for (const neighborIndex of [closestIndex - 1, closestIndex + 1]) {
    if (neighborIndex < 0 || neighborIndex >= route.samples.length) continue;
    const neighbor = route.samples[neighborIndex].point;
    const direction = normalize2D(neighbor.x - center.x, neighbor.z - center.z);
    if (distance2D(neighbor, center) > 0.35) directions.push(direction);
  }
  if (directions.length > 0) return directions;

  const tangent = route.samples[closestIndex]?.tangent ?? { x: 1, z: 0 };
  return [tangent, { x: -tangent.x, z: -tangent.z }];
}

function junctionReach(
  angle: number,
  directions: readonly WorldPoint[],
  radius: number,
  blendLength: number
): number {
  const radial = { x: Math.cos(angle), z: Math.sin(angle) };
  const alignment = directions.reduce(
    (strongest, direction) => Math.max(strongest, Math.max(0, dot2D(direction, radial))),
    0
  );
  const branchTaper = alignment > 0.12
    ? 0.22 + Math.pow(alignment, 1.65) * 0.78
    : 0.12;
  return radius + blendLength * branchTaper;
}

function routeJoin(
  route: CompiledWorldRoute,
  sampleIndex: number
): { normal: WorldPoint; miterScale: number } {
  const sample = route.samples[sampleIndex];
  const previous = route.samples[Math.max(0, sampleIndex - 1)]?.tangent ?? sample.tangent;
  const next = route.samples[Math.min(route.samples.length - 1, sampleIndex + 1)]?.tangent ?? sample.tangent;
  const previousNormal = { x: -previous.z, z: previous.x };
  const nextNormal = { x: -next.z, z: next.x };
  const miter = normalize2D(previousNormal.x + nextNormal.x, previousNormal.z + nextNormal.z);
  const denominator = Math.abs(dot2D(miter, nextNormal));
  return {
    normal: miter,
    // Bounded miter prevents acute authored corners from producing spikes or
    // self-intersecting shoulder strips.
    miterScale: THREE.MathUtils.clamp(1 / Math.max(0.72, denominator), 0.86, 1.28)
  };
}

function colorWithVariation(color: THREE.Color, signal: number, amount: number = 0.06): THREE.Color {
  const variation = 1 - amount * 0.5 + (Math.sin(signal) * 0.5 + 0.5) * amount;
  return color.clone().multiplyScalar(variation);
}

function renderedCoordinate(value: number): number {
  // BufferGeometry stores positions as float32. Sampling the owner with the
  // same quantized coordinate prevents a one-ULP height seam at the bridge
  // deck boundary and at coarse terrain cells.
  return Math.fround(value);
}

export function buildOrganicRoadGeometry(options: OrganicRoadGeometryOptions): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const road = paletteColor("path_dust_01");
  const rut = paletteColor("soil_damp_01").lerp(road, 0.46);
  const warmShoulder = paletteColor("soil_warm_01");
  const dryShoulder = paletteColor("soil_dry_01");
  const meadow = paletteColor("foliage_sage_01");
  const warmStone = paletteColor("stone_warm_01");
  const goldenStone = paletteColor("stone_golden_01");
  const heightAt = (x: number, z: number): number => options.heightAt(renderedCoordinate(x), renderedCoordinate(z));
  const isBridgeDeck = (x: number, z: number): boolean => options.isBridgeDeck(renderedCoordinate(x), renderedCoordinate(z));

  const appendVertex = (point: WorldPoint & { y: number }, color: THREE.Color): number => {
    const vertexIndex = positions.length / 3;
    positions.push(point.x, point.y, point.z);
    colors.push(color.r, color.g, color.b);
    return vertexIndex;
  };

  const appendTriangle = (a: number, b: number, c: number): void => {
    indices.push(a, b, c);
  };

  const appendQuad = (
    corners: readonly [
      WorldPoint & { y: number },
      WorldPoint & { y: number },
      WorldPoint & { y: number },
      WorldPoint & { y: number }
    ],
    color: THREE.Color
  ): void => {
    const base = corners.map((corner) => appendVertex(corner, color));
    appendTriangle(base[0], base[1], base[2]);
    appendTriangle(base[0], base[2], base[3]);
  };

  const junctionForRoute = (routeId: string, point: WorldPoint): WorldRouteJunction | undefined => {
    return options.junctions.find((junction) =>
      junction.routeIds.includes(routeId)
      && distance2D(point, junction.center) <= junction.radiusMeters + junction.blendLengthMeters * 0.72
    );
  };

  let roadTriangleCount = 0;
  let junctionTriangleCount = 0;
  let gatewayTriangleCount = 0;
  let boundedJoinMaximum = 0;
  let roundedCapCount = 0;

  for (const [routeIndex, compiledRoute] of options.routes.entries()) {
    const route = compiledRoute.route;
    const profile = options.profiles[route.kind];
    const ringVertices: number[][] = [];
    const outerHalfWidth = compiledRoute.halfWidth + compiledRoute.shoulderWidthMeters;

    for (const [sampleIndex, sample] of compiledRoute.samples.entries()) {
      const join = routeJoin(compiledRoute, sampleIndex);
      boundedJoinMaximum = Math.max(boundedJoinMaximum, join.miterScale);
      const ring: number[] = [];
      const absoluteDistanceSignal = sample.distanceAlongRoute * 0.22 + routeIndex * 1.7;

      for (const offset of TRANSVERSE_OFFSETS) {
        const lateralDistance = Math.abs(offset) * outerHalfWidth;
        const hardOffset = clamp01(lateralDistance / Math.max(0.0001, compiledRoute.halfWidth));
        const shoulderAmount = smoothstep(
          compiledRoute.halfWidth * 0.78,
          outerHalfWidth,
          lateralDistance
        );
        const edgeGrass = smoothstep(
          compiledRoute.halfWidth + compiledRoute.shoulderWidthMeters * 0.45,
          outerHalfWidth,
          lateralDistance
        ) * 0.56;
        const crown = Math.pow(1 - hardOffset, 1.42) * profile.crownMeters;
        const wheelWear = route.kind === "trail"
          ? Math.exp(-Math.pow(hardOffset / 0.32, 2)) * profile.rutDepthMeters * 0.34
          : Math.exp(-Math.pow((hardOffset - 0.34) / 0.095, 2)) * profile.rutDepthMeters;
        const shoulderDrop = smoothstep(
          compiledRoute.halfWidth * 0.8,
          outerHalfWidth,
          lateralDistance
        ) * profile.shoulderDropMeters;
        const x = sample.point.x + join.normal.x * outerHalfWidth * offset * join.miterScale;
        const z = sample.point.z + join.normal.z * outerHalfWidth * offset * join.miterScale;
        const rawHeight = isBridgeDeck(x, z)
          ? options.bridge.entrySurfaceY
          : heightAt(x, z);
        // Keep the worn bands visually recessed without letting the terrain
        // poke through them. The shared terrain remains the collision truth;
        // this small lift is only the render separation for the overlay.
        const y = rawHeight + 0.046 + crown - wheelWear - shoulderDrop;
        const baseColor = blendColors(road, warmShoulder, dryShoulder, meadow, shoulderAmount, edgeGrass);
        const wearColor = colorWithVariation(
          rut,
          absoluteDistanceSignal + hardOffset * 4.6,
          0.045
        );
        const wheelBand = route.kind === "trail" ? 0.16 : Math.exp(-Math.pow((hardOffset - 0.34) / 0.11, 2)) * 0.68;
        const lowFrequencyFacet = Math.sin(sample.distanceAlongRoute * 0.31 + offset * 2.8 + routeIndex * 2.4) * 0.5 + 0.5;
        const vertexColor = baseColor
          .lerp(wearColor, wheelBand)
          .multiplyScalar(0.965 + lowFrequencyFacet * 0.07);
        ring.push(appendVertex({ x, y, z }, vertexColor));
      }
      ringVertices.push(ring);
    }

    for (let sampleIndex = 0; sampleIndex < compiledRoute.samples.length - 1; sampleIndex++) {
      const start = compiledRoute.samples[sampleIndex].point;
      const end = compiledRoute.samples[sampleIndex + 1].point;
      // The authored bridge route contains exact west/east deck-boundary
      // samples. Skipping only the fully enclosed intervals gives exact deck
      // clipping while retaining a clean, capped approach at each boundary.
      if (isBridgeDeck(start.x, start.z) && isBridgeDeck(end.x, end.z)) continue;
      const startJunction = junctionForRoute(route.id, start);
      const endJunction = junctionForRoute(route.id, end);
      if (startJunction && endJunction && startJunction.id === endJunction.id) continue;

      const currentRing = ringVertices[sampleIndex];
      const nextRing = ringVertices[sampleIndex + 1];
      for (let column = 0; column < TRANSVERSE_OFFSETS.length - 1; column++) {
        if ((sampleIndex + column + routeIndex) % 2 === 0) {
          appendTriangle(currentRing[column], currentRing[column + 1], nextRing[column]);
          appendTriangle(nextRing[column], currentRing[column + 1], nextRing[column + 1]);
        } else {
          appendTriangle(currentRing[column], currentRing[column + 1], nextRing[column + 1]);
          appendTriangle(currentRing[column], nextRing[column + 1], nextRing[column]);
        }
        roadTriangleCount += 2;
      }
    }

    const appendRoundedCap = (sampleIndex: number, outwardSign: number): void => {
      const sample = compiledRoute.samples[sampleIndex];
      const touchingJunction = options.junctions.some((junction) =>
        junction.routeIds.includes(route.id)
        && distance2D(sample.point, junction.center) <= junction.radiusMeters + junction.blendLengthMeters * 0.72
      );
      if (touchingJunction || isBridgeDeck(sample.point.x, sample.point.z)) return;
      roundedCapCount++;
      const tangent = {
        x: sample.tangent.x * outwardSign,
        z: sample.tangent.z * outwardSign
      };
      const normal = sample.normal;
      const capRadius = outerHalfWidth;
      const center = {
        x: sample.point.x + tangent.x * capRadius * 0.48,
        z: sample.point.z + tangent.z * capRadius * 0.48,
        y: heightAt(sample.point.x + tangent.x * capRadius * 0.48, sample.point.z + tangent.z * capRadius * 0.48) + 0.029
      };
      const centerIndex = appendVertex(center, road);
      const arc: number[] = [];
      const arcSegments = 8;
      for (let step = 0; step <= arcSegments; step++) {
        const angle = -Math.PI * 0.5 + (step / arcSegments) * Math.PI;
        const x = sample.point.x + tangent.x * Math.cos(angle) * capRadius + normal.x * Math.sin(angle) * capRadius;
        const z = sample.point.z + tangent.z * Math.cos(angle) * capRadius + normal.z * Math.sin(angle) * capRadius;
        arc.push(appendVertex({ x, y: heightAt(x, z) + 0.029, z }, road));
      }
      for (let step = 0; step < arcSegments; step++) {
        appendTriangle(centerIndex, arc[step], arc[step + 1]);
        roadTriangleCount++;
      }
    };

    appendRoundedCap(0, -1);
    appendRoundedCap(compiledRoute.samples.length - 1, 1);
  }

  for (const junction of options.junctions) {
    const branchDirections = options.routes
      .filter((route) => junction.routeIds.includes(route.route.id))
      .flatMap((route) => outwardDirections(route, junction.center));
    const ringSegments = 32;
    const centerHeight = heightAt(junction.center.x, junction.center.z) + 0.034;
    const centerColor = junction.surface === "village-market"
      ? road.clone().lerp(warmShoulder, 0.4)
      : road.clone().lerp(warmShoulder, junction.surface === "farm-yard" ? 0.3 : 0.22);
    const centerIndex = appendVertex({ ...junction.center, y: centerHeight }, centerColor);
    const innerRing: number[] = [];
    const outerRing: number[] = [];

    for (let segment = 0; segment < ringSegments; segment++) {
      const angle = (segment / ringSegments) * Math.PI * 2;
      const radial = { x: Math.cos(angle), z: Math.sin(angle) };
      const innerVariation = 0.96 + Math.sin(angle * 2.0 + junction.radiusMeters) * 0.025;
      const outerRadius = junctionReach(
        angle,
        branchDirections,
        junction.radiusMeters,
        junction.blendLengthMeters
      );
      const innerRadius = Math.max(0.65, junction.radiusMeters * innerVariation * 0.48);
      const inner = {
        x: junction.center.x + radial.x * innerRadius,
        z: junction.center.z + radial.z * innerRadius
      };
      const outer = {
        x: junction.center.x + radial.x * outerRadius,
        z: junction.center.z + radial.z * outerRadius
      };
      const innerColor = colorWithVariation(centerColor, segment * 0.43 + junction.radiusMeters, 0.045);
      const outerColor = colorWithVariation(
        centerColor.clone().lerp(meadow, 0.04),
        segment * 0.29 + junction.blendLengthMeters,
        0.08
      );
      innerRing.push(appendVertex({ ...inner, y: heightAt(inner.x, inner.z) + 0.034 }, innerColor));
      outerRing.push(appendVertex({ ...outer, y: heightAt(outer.x, outer.z) + 0.032 }, outerColor));
    }

    for (let segment = 0; segment < ringSegments; segment++) {
      const next = (segment + 1) % ringSegments;
      appendTriangle(centerIndex, innerRing[next], innerRing[segment]);
      appendTriangle(innerRing[segment], innerRing[next], outerRing[segment]);
      appendTriangle(innerRing[next], outerRing[next], outerRing[segment]);
      junctionTriangleCount += 3;
    }
  }

  const halfDeckWidth = options.bridge.deckWidth * 0.5;
  const slabCount = Math.max(2, Math.floor(options.bridge.gatewaySlabCount));
  const totalGap = options.bridge.gatewaySlabGapMeters * (slabCount - 1);
  const slabWidth = (options.bridge.deckWidth - totalGap) / slabCount;
  const gatewayHeight = options.bridge.entrySurfaceY + 0.034;
  const gatewayVertexStart = positions.length / 3;

  for (const [sideIndex, side] of [-1, 1].entries()) {
    const edge = side < 0 ? options.bridge.westDeckEdge : options.bridge.eastDeckEdge;
    for (let slabIndex = 0; slabIndex < slabCount; slabIndex++) {
      const zStart = -halfDeckWidth + slabIndex * (slabWidth + options.bridge.gatewaySlabGapMeters);
      const zEnd = zStart + slabWidth;
      const boundaryInset = options.bridge.gatewayInsetMeters;
      const irregular = Math.sin((slabIndex + 1) * 2.7 + sideIndex * 1.9);
      const nearX = edge.x + side * boundaryInset;
      const farX = edge.x + side * options.bridge.gatewayDepthMeters;
      const nearZStart = options.bridge.center.z + zStart + 0.035 + irregular * 0.025;
      const nearZEnd = options.bridge.center.z + zEnd - 0.035 + irregular * 0.018;
      const farZStart = nearZStart + Math.sin(slabIndex * 1.4 + sideIndex) * 0.035;
      const farZEnd = nearZEnd + Math.cos(slabIndex * 1.1 + sideIndex) * 0.028;
      const slabColor = (slabIndex + sideIndex) % 2 === 0 ? warmStone : goldenStone;
      appendQuad([
        { x: nearX, y: heightAt(nearX, nearZStart) + 0.034, z: nearZStart },
        { x: nearX, y: heightAt(nearX, nearZEnd) + 0.034, z: nearZEnd },
        { x: farX, y: heightAt(farX, farZEnd) + 0.034, z: farZEnd },
        { x: farX, y: heightAt(farX, farZStart) + 0.034, z: farZStart }
      ], colorWithVariation(slabColor, slabIndex * 1.17 + sideIndex, 0.06));
      gatewayTriangleCount += 2;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingBox();
  geometry.computeBoundingSphere();
  geometry.userData.routeProfiles = options.routes.map((compiledRoute) => ({
    id: compiledRoute.route.id,
    scope: compiledRoute.route.scope,
    kind: compiledRoute.route.kind,
    widthMeters: compiledRoute.route.widthMeters,
    totalLength: compiledRoute.totalLength,
    ...options.profiles[compiledRoute.route.kind]
  }));
  geometry.userData.compiledRouteCount = options.routes.length;
  geometry.userData.roadTriangleCount = roadTriangleCount;
  geometry.userData.junctionTriangleCount = junctionTriangleCount;
  geometry.userData.bridgeGatewayTriangleCount = gatewayTriangleCount;
  geometry.userData.bridgeGatewayBandCount = slabCount * 2;
  geometry.userData.bridgeGatewayVertexStart = gatewayVertexStart;
  geometry.userData.bridgeGatewayVertexCount = positions.length / 3 - gatewayVertexStart;
  geometry.userData.bridgeGatewayHeight = gatewayHeight;
  geometry.userData.maximumMiterScale = boundedJoinMaximum;
  geometry.userData.roundedCapCount = roundedCapCount;
  geometry.userData.junctionSurfaceKinds = options.junctions.map((junction) => junction.surface);
  return geometry;
}
