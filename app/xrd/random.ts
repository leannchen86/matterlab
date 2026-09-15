// Seeded pseudo-random numbers, so every simulated measurement can be replayed from the seed stored with its record.
// Generator: sfc32 (C. Doty-Humphrey, PractRand), seeded via splitmix32.
// Poisson draws: Knuth multiplication below mean 10, PTRS transformed rejection (W. Hörmann, 1993) above.

export type Random = {
  readonly seed: number;
  /** Uniform in [0, 1). */
  next(): number;
  /** Standard normal deviate. */
  normal(): number;
  poisson(mean: number): number;
  /** Independent stream derived from this generator's seed and a label, without consuming this stream. */
  fork(label: string): Random;
};

/** Stable 32-bit seed from strings and numbers (FNV-1a followed by a murmur3 finalizer). */
export function hashSeed(...parts: readonly (string | number)[]): number {
  let hash = 0x811c9dc5;
  const text = parts.join('␟');
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  hash ^= hash >>> 16;
  hash = Math.imul(hash, 0x85ebca6b);
  hash ^= hash >>> 13;
  hash = Math.imul(hash, 0xc2b2ae35);
  hash ^= hash >>> 16;
  return hash >>> 0;
}

function splitmix32(state: number) {
  let value = state;
  return () => {
    value = (value + 0x9e3779b9) | 0;
    let mixed = value;
    mixed = Math.imul(mixed ^ (mixed >>> 16), 0x21f0aaad);
    mixed = Math.imul(mixed ^ (mixed >>> 15), 0x735a2d97);
    return (mixed ^ (mixed >>> 15)) >>> 0;
  };
}

const LOG_FACTORIALS = [0, 0, 0.6931471805599453, 1.791759469228055, 3.1780538303479458, 4.787491742782046, 6.579251212010101, 8.525161361065415, 10.60460290274525, 12.801827480081469];

function logFactorial(k: number) {
  if (k < LOG_FACTORIALS.length) return LOG_FACTORIALS[k];
  // Stirling series; relative error below 1e-10 for k >= 10.
  const n = k + 1;
  return (n - 0.5) * Math.log(n) - n + 0.5 * Math.log(2 * Math.PI) + 1 / (12 * n) - 1 / (360 * n ** 3) + 1 / (1260 * n ** 5);
}

export function createRandom(seed: number): Random {
  const init = splitmix32(seed >>> 0);
  let a = init();
  let b = init();
  let c = init();
  let d = init();
  let spareNormal: number | undefined;

  const next = () => {
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
  for (let index = 0; index < 12; index += 1) next();

  const normal = () => {
    if (spareNormal !== undefined) {
      const value = spareNormal;
      spareNormal = undefined;
      return value;
    }
    let u = 0;
    while (u <= Number.EPSILON) u = next();
    const v = next();
    const radius = Math.sqrt(-2 * Math.log(u));
    spareNormal = radius * Math.sin(2 * Math.PI * v);
    return radius * Math.cos(2 * Math.PI * v);
  };

  const poisson = (mean: number) => {
    if (!(mean > 0)) return 0;
    if (mean < 10) {
      const limit = Math.exp(-mean);
      let count = 0;
      let product = next();
      while (product > limit) {
        count += 1;
        product *= next();
      }
      return count;
    }
    const slam = Math.sqrt(mean);
    const logMean = Math.log(mean);
    const bb = 0.931 + 2.53 * slam;
    const aa = -0.059 + 0.02483 * bb;
    const invAlpha = 1.1239 + 1.1328 / (bb - 3.4);
    const vr = 0.9277 - 3.6224 / (bb - 2);
    for (;;) {
      const u = next() - 0.5;
      const v = next();
      const us = 0.5 - Math.abs(u);
      const k = Math.floor(((2 * aa) / us + bb) * u + mean + 0.43);
      if (us >= 0.07 && v <= vr) return k;
      if (k < 0 || (us < 0.013 && v > us)) continue;
      if (Math.log(v) + Math.log(invAlpha) - Math.log(aa / (us * us) + bb) <= -mean + k * logMean - logFactorial(k)) return k;
    }
  };

  return {
    seed: seed >>> 0,
    next,
    normal,
    poisson,
    fork: (label: string) => createRandom(hashSeed(seed >>> 0, label)),
  };
}
