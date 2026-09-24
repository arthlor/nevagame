import * as THREE from "three";

/**
 * Flat baked colors for the fish-market shop (linear-space base colors). These
 * are the exact values the approved reconstruction's adapted output carries in
 * COLOR_0: each source material's de-lit albedo tint, with the flat faceted
 * textures dropped by the palette re-skin. The export pipeline re-skins every
 * mesh onto shared palette tokens, so this table plus the geometry in ./parts is
 * the whole authored asset.
 */
const BASE: Record<string, readonly [number, number, number]> = {
  "timber-oak": [0.21223075687885284, 0.09530746936798096, 0.03688944876194], // weathered oak brown
  "timber-plank": [0.21952620148658752, 0.09758734703063965, 0.03688944876194], // pale sawn plank
  "timber-door": [0.0666259378194809, 0.03071344457566738, 0.013702083379030228], // dark door oak
  "timber-barrel": [0.2158605009317398, 0.09758734703063965, 0.039546236395835876], // barrel stave oak
  "terracotta-tile": [0.366252601146698, 0.10702310502529144, 0.040915198624134064], // roof tiles
  "terracotta-deck": [0.20787638425827026, 0.10110917687416077, 0.04218553751707077], // roof underlay
  "plaster-lime": [0.17144110798835754, 0.11443537473678589, 0.07818742096424103], // lime plaster infill
  "stone-ashlar": [0.15292614698410034, 0.1384316086769104, 0.12743768095970154], // dressed stone
  "stone-dark": [0.177888423204422, 0.15896083414554596, 0.1384316086769104], // chimney cap stone
  "glass-dark": [0.00007823306077625602, 0.00020258506992831826, 0.00038903148379176855], // dark glass
  "ice-crushed": [0.6793285012245178, 0.8137325644493103, 0.8959711194038391], // crushed ice
  "fish-blue": [0.2008015513420105, 0.35871320962905884, 0.3946208953857422], // mackerel blue
  "fish-red": [0.8107010722160339, 0.3420308828353882, 0.2706136107444763], // snapper red
  "fish-brown": [0.3493610620498657, 0.28312578797340393, 0.21760742366313934], // flatfish brown
  "emblem-teal": [0.0423114113509655, 0.11697066575288773, 0.12743768095970154], // carved emblem teal
  "iron-wrought": [0.03433980792760849, 0.03560131415724754, 0.03560131415724754], // wrought iron
  "canvas-cream": [0.7529422044754028, 0.6038273572921753, 0.4507857859134674], // awning canvas cream
  "canvas-teal": [0.16202937066555023, 0.27049779891967773, 0.27049779891967773], // awning canvas teal
  "rope-hemp": [0.31398871541023254, 0.19120168685913086, 0.09758734703063965], // hemp rope
  "buoy-paint": [0.6514056324958801, 0.5271151065826416, 0.3967552185058594], // buoy paint cream
  "buoy-teal": [0.09084171056747437, 0.16826939582824707, 0.17464740574359894], // buoy teal band
  "burlap": [0.28744083642959595, 0.18116424977779388, 0.10224173218011856], // burlap sack
};

const cache = new Map<string, THREE.MeshStandardMaterial>();

/** Flat double-sided material in the baked authored color. */
export function fishMarketMaterial(key: string): THREE.MeshStandardMaterial {
  const hit = cache.get(key);
  if (hit) return hit;
  const base = BASE[key] ?? [0.5, 0.5, 0.5];
  const material = new THREE.MeshStandardMaterial({
    color: new THREE.Color(base[0], base[1], base[2]),
    roughness: 0.9,
    metalness: 0,
    side: THREE.DoubleSide
  });
  cache.set(key, material);
  return material;
}
