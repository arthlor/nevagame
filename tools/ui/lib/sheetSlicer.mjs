/**
 * Sheet slicer for the Neva 2D UI atlas.
 *
 * Generated icon sheets arrive as opaque images with every icon isolated on a flat
 * chroma background. This module recovers per-icon transparent sprites:
 *
 *   1. Chroma key  - score each pixel on how much it looks like the key colour and
 *                    turn that into alpha.
 *   2. Unmultiply  - recover true edge colour so keying leaves no coloured fringe.
 *   3. Segment     - label connected islands of opaque pixels.
 *   4. Extract     - crop one square sprite per island, masking away every pixel that
 *                    belongs to a neighbouring island.
 *
 * The key colour is magenta. Sepia engraving, foliage green and cool blues all score
 * far from magenta, so keying can be global — which matters because a border-only
 * flood cannot reach enclosed background holes such as the gap inside a watering can
 * handle or a compass ring.
 */

import sharp from "sharp";

/** Pixels below this alpha are treated as background when segmenting. */
const OPACITY_FLOOR = 40;

export const KEY_COLORS = {
  magenta: { r: 255, g: 0, b: 255 },
  green: { r: 0, g: 177, b: 64 }
};

/**
 * How strongly a pixel resembles the key colour, on roughly the same 0-255 scale as
 * the channels themselves. Positive means key-like, negative means content-like.
 *
 * Magenta is "both outer channels high, middle channel low", so `min(r, b) - g`
 * peaks at 255 on pure magenta while brown (r>g>b), foliage (g highest) and neutral
 * white (all channels equal) all land at or below zero.
 */
function keyness(r, g, b, key) {
  if (key === "green") return g - Math.max(r, b);
  return Math.min(r, b) - g;
}

/**
 * Reading order: cluster by row first (icons on a shared baseline count as one row),
 * then left-to-right within each row.
 */
function sortReadingOrder(boxes) {
  if (boxes.length === 0) return boxes;
  const heights = boxes.map((box) => box.maxY - box.minY + 1).sort((a, b) => a - b);
  const medianHeight = heights[Math.floor(heights.length / 2)];
  const rowTolerance = Math.max(8, medianHeight * 0.6);

  const withCenters = boxes.map((box) => ({ ...box, cy: (box.minY + box.maxY) / 2 }));
  withCenters.sort((a, b) => a.cy - b.cy);

  const rows = [];
  for (const box of withCenters) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(box.cy - row.anchor) <= rowTolerance) {
      row.items.push(box);
    } else {
      rows.push({ anchor: box.cy, items: [box] });
    }
  }

  return rows.flatMap((row) => row.items.sort((a, b) => a.minX - b.minX));
}

/**
 * Label connected islands on a coarse occupancy grid.
 *
 * Segmenting at full resolution would split an icon wherever the artwork has a thin
 * gap (a separated fin, dots over a hatched shadow). Working on `cellSize` blocks and
 * dilating by `dilate` cells first merges those neighbours back into one sprite while
 * staying cheap on a 1536x1024 sheet.
 *
 * Returns the coarse label grid alongside the boxes so extraction can tell which
 * pixels belong to which icon.
 */
function segmentIslands(alpha, width, height, { cellSize, dilate, minAreaRatio }) {
  const gw = Math.ceil(width / cellSize);
  const gh = Math.ceil(height / cellSize);

  const occupied = new Uint8Array(gw * gh);
  for (let y = 0; y < height; y += 1) {
    const gy = (y / cellSize) | 0;
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] > OPACITY_FLOOR) occupied[gy * gw + ((x / cellSize) | 0)] = 1;
    }
  }

  const grown = new Uint8Array(gw * gh);
  for (let gy = 0; gy < gh; gy += 1) {
    for (let gx = 0; gx < gw; gx += 1) {
      if (!occupied[gy * gw + gx]) continue;
      const y0 = Math.max(0, gy - dilate);
      const y1 = Math.min(gh - 1, gy + dilate);
      const x0 = Math.max(0, gx - dilate);
      const x1 = Math.min(gw - 1, gx + dilate);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) grown[y * gw + x] = 1;
      }
    }
  }

  const labels = new Int32Array(gw * gh).fill(-1);
  const stack = [];
  let islandCount = 0;

  for (let start = 0; start < grown.length; start += 1) {
    if (!grown[start] || labels[start] !== -1) continue;
    const id = islandCount;
    islandCount += 1;
    labels[start] = id;
    stack.length = 0;
    stack.push(start);

    while (stack.length > 0) {
      const index = stack.pop();
      const gx = index % gw;
      const gy = (index / gw) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = gx + dx;
        const ny = gy + dy;
        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
        const next = ny * gw + nx;
        if (grown[next] && labels[next] === -1) {
          labels[next] = id;
          stack.push(next);
        }
      }
    }
  }

  // The dilation inflated every island, so re-measure each against the true alpha
  // mask to get a tight crop.
  const tight = Array.from({ length: islandCount }, (_, id) => ({
    id,
    minX: width,
    minY: height,
    maxX: -1,
    maxY: -1,
    area: 0
  }));

  for (let y = 0; y < height; y += 1) {
    const gy = (y / cellSize) | 0;
    for (let x = 0; x < width; x += 1) {
      if (alpha[y * width + x] <= OPACITY_FLOOR) continue;
      const id = labels[gy * gw + ((x / cellSize) | 0)];
      if (id < 0) continue;
      const box = tight[id];
      if (x < box.minX) box.minX = x;
      if (y < box.minY) box.minY = y;
      if (x > box.maxX) box.maxX = x;
      if (y > box.maxY) box.maxY = y;
      box.area += 1;
    }
  }

  const minArea = width * height * minAreaRatio;
  const boxes = sortReadingOrder(tight.filter((box) => box.maxX >= 0 && box.area >= minArea));
  return { boxes, labels, gw, cellSize };
}

/**
 * Deterministic alternative for sheets where icons sit close enough that island
 * detection could merge them: divide the sheet into `cols` x `rows` equal cells and
 * take the content bounds inside each. Requires the sheet to honour the grid, so it
 * is opt-in per sheet rather than the default.
 */
function segmentGrid(alpha, width, height, { cols, rows }) {
  const labels = new Int32Array(width * height).fill(-1);
  const boxes = [];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const x0 = Math.floor((col * width) / cols);
      const x1 = Math.floor(((col + 1) * width) / cols) - 1;
      const y0 = Math.floor((row * height) / rows);
      const y1 = Math.floor(((row + 1) * height) / rows) - 1;
      const id = row * cols + col;

      const box = { id, minX: width, minY: height, maxX: -1, maxY: -1, area: 0 };
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          labels[y * width + x] = id;
          if (alpha[y * width + x] <= OPACITY_FLOOR) continue;
          if (x < box.minX) box.minX = x;
          if (y < box.minY) box.minY = y;
          if (x > box.maxX) box.maxX = x;
          if (y > box.maxY) box.maxY = y;
          box.area += 1;
        }
      }
      if (box.maxX >= 0) boxes.push(box);
    }
  }

  return { boxes, labels, gw: width, cellSize: 1 };
}

/**
 * Key a sheet and return its RGBA buffer plus the bounding box of every icon found.
 */
export async function analyzeSheet(source, options = {}) {
  const {
    key = "magenta",
    keyLow = 24,
    keyHigh = 90,
    // 8px is the widest merge radius that still separates neighbouring icons on a
    // generated sheet, while being enough to rejoin detached fins, stems and dots.
    cellSize = 4,
    dilate = 2,
    minAreaRatio = 0.00035,
    grid = null,
    // Restrict keying to background reachable from the sheet border. Protects content
    // that shares the key hue, at the cost of leaving enclosed holes opaque.
    gate = false
  } = options;

  const { data, info } = await sharp(source)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const { width, height } = info;
  const pixels = new Uint8ClampedArray(data);
  const score = new Int16Array(width * height);

  for (let i = 0, p = 0; i < score.length; i += 1, p += 4) {
    score[i] = keyness(pixels[p], pixels[p + 1], pixels[p + 2], key);
  }

  let keyable = null;
  if (gate) {
    keyable = new Uint8Array(width * height);
    const queue = [];
    const enqueue = (x, y) => {
      const i = y * width + x;
      if (!keyable[i] && score[i] > keyLow) {
        keyable[i] = 1;
        queue.push(i);
      }
    };
    for (let x = 0; x < width; x += 1) {
      enqueue(x, 0);
      enqueue(x, height - 1);
    }
    for (let y = 0; y < height; y += 1) {
      enqueue(0, y);
      enqueue(width - 1, y);
    }
    while (queue.length > 0) {
      const index = queue.pop();
      const x = index % width;
      const y = (index / width) | 0;
      if (x > 0) enqueue(x - 1, y);
      if (x < width - 1) enqueue(x + 1, y);
      if (y > 0) enqueue(x, y - 1);
      if (y < height - 1) enqueue(x, y + 1);
    }
  }

  const keyColor = KEY_COLORS[key] ?? KEY_COLORS.magenta;
  const alpha = new Uint8ClampedArray(width * height);

  for (let i = 0, p = 0; i < alpha.length; i += 1, p += 4) {
    if (keyable && !keyable[i]) {
      alpha[i] = 255;
      pixels[p + 3] = 255;
      continue;
    }

    const a = Math.max(0, Math.min(1, (keyHigh - score[i]) / (keyHigh - keyLow)));
    const a8 = Math.round(a * 255);
    alpha[i] = a8;
    pixels[p + 3] = a8;

    // Unmultiply the key colour back out of partially covered edge pixels. Without
    // this, antialiased edges keep a coloured fringe that reads as a halo.
    if (a > 0 && a < 1) {
      pixels[p] = Math.max(0, Math.min(255, (pixels[p] - (1 - a) * keyColor.r) / a));
      pixels[p + 1] = Math.max(0, Math.min(255, (pixels[p + 1] - (1 - a) * keyColor.g) / a));
      pixels[p + 2] = Math.max(0, Math.min(255, (pixels[p + 2] - (1 - a) * keyColor.b) / a));
    }
  }

  const segmentation = grid
    ? segmentGrid(alpha, width, height, grid)
    : segmentIslands(alpha, width, height, { cellSize, dilate, minAreaRatio });

  return {
    pixels: Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length),
    width,
    height,
    ...segmentation
  };
}

/**
 * Crop one icon to a square sprite, sized so content covers `coverage` of the frame.
 * A shared coverage ratio is what makes a tall watering can and a wide fish read as
 * the same visual weight once they sit next to each other in a slot grid.
 */
export async function extractSprite(sheet, box, { size = 256, coverage = 0.86 } = {}) {
  const span = Math.max(box.maxX - box.minX + 1, box.maxY - box.minY + 1);
  const frame = Math.round(span / coverage);
  const left = Math.round((box.minX + box.maxX) / 2 - frame / 2);
  const top = Math.round((box.minY + box.maxY) / 2 - frame / 2);

  // The square frame is wider than the icon and will overlap its neighbours, so
  // build the crop by hand and drop every pixel owned by a different island.
  const crop = new Uint8ClampedArray(frame * frame * 4);
  const { labels, gw, cellSize, pixels, width, height } = sheet;

  for (let y = 0; y < frame; y += 1) {
    const sy = top + y;
    if (sy < 0 || sy >= height) continue;
    const labelRow = ((sy / cellSize) | 0) * gw;
    for (let x = 0; x < frame; x += 1) {
      const sx = left + x;
      if (sx < 0 || sx >= width) continue;
      if (labels[labelRow + ((sx / cellSize) | 0)] !== box.id) continue;
      const from = (sy * width + sx) * 4;
      const to = (y * frame + x) * 4;
      crop[to] = pixels[from];
      crop[to + 1] = pixels[from + 1];
      crop[to + 2] = pixels[from + 2];
      crop[to + 3] = pixels[from + 3];
    }
  }

  return sharp(Buffer.from(crop.buffer, crop.byteOffset, crop.length), {
    raw: { width: frame, height: frame, channels: 4 }
  })
    .resize(size, size, { fit: "fill", kernel: "lanczos3" })
    .png({ compressionLevel: 9, palette: false })
    .toBuffer();
}
