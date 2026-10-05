// A small deterministic pseudo-random generator for the §11.3 merge property
// suite (cifra_js.conformance refinement §Decisions). The Python reference
// drives its generator with stdlib `random.Random(seed)` — a seeded
// enumeration, not randomised fuzzing, and no `hypothesis`. This mirrors that
// with a hand-written `mulberry32`-seeded source and a `Random` shaped like the
// subset of Python's `random.Random` the generator uses (`random`, `randint`,
// `randrange`, `choice`, `sample`). It brings no dependency.
//
// The generated documents need not match the reference's byte for byte: the
// §11.3 properties are invariants the merge must satisfy on any input, so the
// suite is self-checking and never compares JavaScript's merge to Python's
// (§Decisions). All that is required is determinism within JavaScript, so a
// failure is reproducible from its seed.

// mulberry32: a 32-bit seeded source producing a float in [0, 1).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The subset of Python's random.Random the generator leans on. `randint` is
// inclusive of both ends and `randrange(n)` yields 0..n-1, as Python's do;
// `sample` draws k distinct elements (partial Fisher–Yates), like
// random.sample.
export class Random {
  constructor(seed) {
    this._next = mulberry32(seed);
  }

  random() {
    return this._next();
  }

  randint(a, b) {
    return a + Math.floor(this.random() * (b - a + 1));
  }

  randrange(n) {
    return Math.floor(this.random() * n);
  }

  choice(seq) {
    return seq[this.randrange(seq.length)];
  }

  sample(seq, k) {
    const pool = [...seq];
    const out = [];
    for (let i = 0; i < k; i += 1) {
      const j = this.randrange(pool.length);
      out.push(pool[j]);
      pool.splice(j, 1);
    }
    return out;
  }
}
