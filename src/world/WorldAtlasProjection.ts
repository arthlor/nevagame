import manifest from "../../public/assets/world-map/manifest.json";
import type { WorldPoint } from "./WorldLayout";
import type { MapSvgPoint } from "./WorldMapProjection";

/** One transform for the offline raster and all live chart overlays. */
const projection = manifest.projection;
const logicalScale = 1000 / projection.width;
export const WORLD_ATLAS = Object.freeze({
  width: 1000,
  height: 1000 * (projection.height / projection.width),
  aspect: projection.height / projection.width,
  padding: projection.paddingPixels * logicalScale,
  scale: projection.pixelsPerWorldUnit * logicalScale,
  bounds: projection.bounds,
  textureUrl: `${import.meta.env.BASE_URL}assets/world-map/${manifest.texture.file}?v=${manifest.texture.sha256}`
});
export interface AtlasViewBox { x: number; y: number; width: number; height: number }
export interface AtlasViewport { left: number; top: number; width: number; height: number }
export const fullAtlasView = (): AtlasViewBox => ({ x: 0, y: 0, width: WORLD_ATLAS.width, height: WORLD_ATLAS.height });
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

export function worldPointToAtlas(point: WorldPoint): MapSvgPoint {
  return {
    x: WORLD_ATLAS.padding + (point.x - projection.bounds.minX) * WORLD_ATLAS.scale,
    y: WORLD_ATLAS.padding + (point.z - projection.bounds.minZ) * WORLD_ATLAS.scale
  };
}

/** Inverse for coordinate validation; the decorative margin is outside the world. */
export function atlasPointToWorld(point: MapSvgPoint): WorldPoint | null {
  const x = (point.x - WORLD_ATLAS.padding) / WORLD_ATLAS.scale + projection.bounds.minX;
  const z = (point.y - WORLD_ATLAS.padding) / WORLD_ATLAS.scale + projection.bounds.minZ;
  if (x < projection.bounds.minX || x > projection.bounds.maxX || z < projection.bounds.minZ || z > projection.bounds.maxZ) return null;
  return { x, z };
}

export function clampAtlasView(view: AtlasViewBox): AtlasViewBox {
  const width = clamp(view.width, 160, WORLD_ATLAS.width);
  const height = width * WORLD_ATLAS.aspect;
  return { x: clamp(view.x, 0, WORLD_ATLAS.width - width), y: clamp(view.y, 0, WORLD_ATLAS.height - height), width, height };
}

/** SVG xMidYMid meet, including letterboxing at any modal size and zoom. */
export function atlasClientPoint(client: MapSvgPoint, rect: AtlasViewport, view: AtlasViewBox): MapSvgPoint | null {
  if (rect.width <= 0 || rect.height <= 0) return null;
  const scale = Math.min(rect.width / view.width, rect.height / view.height);
  const x = (client.x - rect.left - (rect.width - view.width * scale) / 2) / scale;
  const y = (client.y - rect.top - (rect.height - view.height * scale) / 2) / scale;
  if (x < 0 || y < 0 || x > view.width || y > view.height) return null;
  return { x: view.x + x, y: view.y + y };
}

export function zoomAtlasView(view: AtlasViewBox, factor: number, anchor: MapSvgPoint = { x: view.x + view.width / 2, y: view.y + view.height / 2 }): AtlasViewBox {
  const width = clamp(view.width * factor, 160, WORLD_ATLAS.width);
  const ratio = width / view.width;
  return clampAtlasView({ x: anchor.x - (anchor.x - view.x) * ratio, y: anchor.y - (anchor.y - view.y) * ratio, width, height: width * WORLD_ATLAS.aspect });
}

export function worldRouteToAtlasPath(points: readonly WorldPoint[]): string {
  return points.map((point, index) => {
    const at = worldPointToAtlas(point);
    return `${index ? "L" : "M"} ${at.x.toFixed(2)},${at.y.toFixed(2)}`;
  }).join(" ");
}
