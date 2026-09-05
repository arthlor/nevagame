import * as THREE from "three";

export function createSpatialSurfaceBatch(
  source: THREE.BufferGeometry,
  material: THREE.Material,
  cellSize: number
): THREE.BatchedMesh {
  const position = source.getAttribute("position");
  const attributes = Object.entries(source.attributes);
  if (!Number.isFinite(cellSize) || cellSize <= 0) {
    throw new Error("Surface batch cell size must be positive and finite");
  }
  if (!position || attributes.some(([, attribute]) => !(attribute instanceof THREE.BufferAttribute))) {
    throw new Error("Surface batching requires non-interleaved vertex attributes");
  }
  if (source.groups.length || Object.keys(source.morphAttributes).length) {
    throw new Error("Surface batching requires a single static material surface");
  }
  const indexCount = source.index?.count ?? position.count;
  const start = source.drawRange.start;
  const end = Math.min(indexCount, start + source.drawRange.count);
  if (start % 3 || (end - start) % 3 || end <= start) {
    throw new Error("Surface batching requires a nonempty triangle draw range");
  }
  const cells = new Map<string, { vertices: number[]; indices: number[]; remap: Map<number, number> }>();
  for (let offset = start; offset < end; offset += 3) {
    const first = source.index?.getX(offset) ?? offset;
    const second = source.index?.getX(offset + 1) ?? offset + 1;
    const third = source.index?.getX(offset + 2) ?? offset + 2;
    const centerX = (position.getX(first) + position.getX(second) + position.getX(third)) / 3;
    const centerZ = (position.getZ(first) + position.getZ(second) + position.getZ(third)) / 3;
    const key = `${Math.floor(centerX / cellSize)}:${Math.floor(centerZ / cellSize)}`;
    let cell = cells.get(key);
    if (!cell) {
      cell = { vertices: [], indices: [], remap: new Map() };
      cells.set(key, cell);
    }
    for (const sourceIndex of [first, second, third]) {
      let localIndex = cell.remap.get(sourceIndex);
      if (localIndex === undefined) {
        localIndex = cell.vertices.length;
        cell.vertices.push(sourceIndex);
        cell.remap.set(sourceIndex, localIndex);
      }
      cell.indices.push(localIndex);
    }
  }
  const vertexCount = [...cells.values()].reduce((sum, cell) => sum + cell.vertices.length, 0);
  const batch = new THREE.BatchedMesh(cells.size, vertexCount, end - start, material);
  batch.sortObjects = false;
  for (const cell of cells.values()) {
    const geometry = new THREE.BufferGeometry();
    for (const [name, sourceAttribute] of attributes) {
      const attribute = sourceAttribute as THREE.BufferAttribute;
      const values = attribute.array.slice(0, cell.vertices.length * attribute.itemSize);
      for (let localIndex = 0; localIndex < cell.vertices.length; localIndex += 1) {
        const sourceOffset = cell.vertices[localIndex] * attribute.itemSize;
        for (let component = 0; component < attribute.itemSize; component += 1) {
          values[localIndex * attribute.itemSize + component] = attribute.array[sourceOffset + component];
        }
      }
      const copied = new THREE.BufferAttribute(values, attribute.itemSize, attribute.normalized);
      copied.gpuType = attribute.gpuType;
      geometry.setAttribute(name, copied);
    }
    geometry.setIndex(cell.indices);
    batch.addInstance(batch.addGeometry(geometry));
    geometry.dispose();
  }
  batch.computeBoundingBox();
  batch.computeBoundingSphere();
  return batch;
}
