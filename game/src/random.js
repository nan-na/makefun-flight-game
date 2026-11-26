// Seeded randomness (mulberry32) and a small deterministic 2D value hash, so the
// same seed always builds the same world, the same rings and the same flights.

/** A fast seeded PRNG: next() returns a float in [0, 1). */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Deterministic hash of two integer cell coordinates -> [0, 1). */
export function hash2(x, z, seed) {
  let h = (seed >>> 0) ^ Math.imul(x | 0, 374761393) ^ Math.imul(z | 0, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Pick one of `items` by a seeded hash of a cell. */
export function pickCell(x, z, seed, items) {
  return items[Math.floor(hash2(x, z, seed) * items.length) % items.length];
}
