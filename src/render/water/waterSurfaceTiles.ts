import * as THREE from "three";

/** Partition the existing plane grid without changing any vertex or triangle. */
export function tileWaterGeometry(source: THREE.PlaneGeometry, tileMeters: number): THREE.PlaneGeometry[] {
  const columns = source.parameters.widthSegments;
  const rows = source.parameters.heightSegments;
  const positions = source.getAttribute("position");
  const stride = columns + 1;
  const result: THREE.PlaneGeometry[] = [];
  const columnStep = Math.max(1, Math.floor(tileMeters / (source.parameters.width / columns)));
  if (!source.boundingBox) source.computeBoundingBox();
  // Height bounds include vertex-shader displacement supplied by FacetedWater.
  const minimumY = source.boundingBox!.min.y;
  const maximumY = source.boundingBox!.max.y;

  for (let firstRow = 0; firstRow < rows;) {
    let lastRow = firstRow + 1;
    while (lastRow < rows
      && Math.abs(positions.getZ((lastRow + 1) * stride) - positions.getZ(firstRow * stride)) <= tileMeters) {
      lastRow += 1;
    }
    for (let firstColumn = 0; firstColumn < columns; firstColumn += columnStep) {
      const lastColumn = Math.min(columns, firstColumn + columnStep);
      const tileColumns = lastColumn - firstColumn;
      const tileRows = lastRow - firstRow;
      const tile = new THREE.PlaneGeometry(
        Math.abs(positions.getX(lastColumn) - positions.getX(firstColumn)),
        Math.abs(positions.getZ(lastRow * stride) - positions.getZ(firstRow * stride)),
        tileColumns, tileRows
      );
      for (const [name, attribute] of Object.entries(source.attributes)) {
        const copied = new THREE.BufferAttribute(new Float32Array((tileColumns + 1) * (tileRows + 1) * attribute.itemSize), attribute.itemSize);
        for (let row = 0; row <= tileRows; row += 1) {
          for (let column = 0; column <= tileColumns; column += 1) {
            const sourceVertex = (firstRow + row) * stride + firstColumn + column;
            const targetVertex = row * (tileColumns + 1) + column;
            for (let component = 0; component < attribute.itemSize; component += 1) {
              copied.array[targetVertex * attribute.itemSize + component] = attribute.array[sourceVertex * attribute.itemSize + component];
            }
          }
        }
        tile.setAttribute(name, copied);
      }
      tile.computeBoundingBox();
      tile.boundingBox!.min.y = minimumY;
      tile.boundingBox!.max.y = maximumY;
      tile.boundingSphere = tile.boundingBox!.getBoundingSphere(new THREE.Sphere());
      result.push(tile);
    }
    firstRow = lastRow;
  }
  return result;
}
