/* ---------- worlds: terrain, water, props, colliders, ground cover ---------- */
const World = (() => {
  const HALF = 110;          // the walkable area is -HALF..HALF on x and z
  const EDGE = 150;          // terrain mesh half size (hills past the edge fade into fog)
  const CH = 3;              // props are split into CH x CH chunks for culling
  const CHS = (EDGE * 2) / CH;
  const dummy = new THREE.Object3D();

  /* ---- shape helpers ---- */
  function edgeLift(x, z) { const m = Math.max(Math.abs(x), Math.abs(z)); const e = smooth((m - (HALF - 18)) / 34); return e * e * 18; }
  function segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
    return Math.hypot(px - ax - vx * t, pz - az - vz * t);
  }
  function pathDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
  function mix(o, c, t) { if (t <= 0) return o; if (t > 1) t = 1; o.r += (c.r - o.r) * t; o.g += (c.g - o.g) * t; o.b += (c.b - o.b) * t; return o; }
  function shore(o, h, sand, mud) { if (h < 0.4) mix(o, sand, smooth((0.4 - h) / 0.45)); if (h < -0.2) mix(o, mud, smooth((-0.2 - h) / 1.3)); }
  const P = linear;
  const gauss = (u, w) => Math.exp(-(u / w) * (u / w));

  /* ---- world definitions ---- */
  const DEFS = {
    land(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const BARN = { x: -34, z: -26, rot: 0.4 }, POND = { x: 38, z: 32, r: 19 }, GARDEN = { x: -12, z: -40, w: 10, d: 8, rot: 0.4 };
      const PATH = [[-30, -16], [-17, -7], [-4, 0], [12, 11], [25, 22]];
      const c = { g1: P(0x557f2e), g2: P(0x77a442), dry: P(0x9aa553), dirt: P(0x7d6345), sand: P(0xae986a), mud: P(0x3b3524) };
      const gc = Math.cos(GARDEN.rot), gs = Math.sin(GARDEN.rot);
      const inGarden = (x, z, pad) => { const dx = x - GARDEN.x, dz = z - GARDEN.z, lx = dx * gc - dz * gs, lz = dx * gs + dz * gc; return Math.abs(lx) < GARDEN.w / 2 + pad && Math.abs(lz) < GARDEN.d / 2 + pad; };
      function H(x, z) {
        let h = 1.3 + 2.8 * (fbm(n1, x * 0.011, z * 0.011, 3) * 0.5 + 0.5) + 0.3 * n2(x * 0.06, z * 0.06);
        h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - BARN.x, z - BARN.z) - 24) / 18));
        h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - GARDEN.x, z - GARDEN.z) - 9) / 10));
        const dx = x - POND.x, dz = z - POND.z, a = Math.atan2(dz, dx);
        const pr = POND.r * (1 + 0.16 * n3(Math.cos(a) * 1.4 + 7, Math.sin(a) * 1.4 + 3));
        h = lerp(h, -2.0, smooth((1 - Math.hypot(dx, dz) / pr) / 0.55));
        return h + edgeLift(x, z);
      }
      return {
        name: 'Land', blurb: 'Farm fields, a pond, a red barn, and friendly people.', spawn: [-9, -13],
        H, fog: [55, 240], water: {}, people: 4,
        grassH: [0.09, 0.22], grassTint: [0.2, 0.3, 0.55, 0.85], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xffffff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n4, x * 0.03, z * 0.03, 2) * 0.8 + 0.5); mix(o, c.dry, (n2(x * 0.012 + 9, z * 0.012) * 0.5 + 0.2) * 0.6);
          mix(o, c.dirt, (1 - smooth((pathDist(x, z, PATH) - 0.35) / 0.9)) * 0.7);
          mix(o, c.dirt, smooth(1 - Math.hypot(x - BARN.x, z - BARN.z) / 13) * (0.55 + 0.3 * n4(x * 0.2, z * 0.2)));
          if (inGarden(x, z, 0.6)) mix(o, c.dirt, 0.8);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) {
          if (h < 0.3 || inGarden(x, z, 0.8)) return 0;
          let g = smooth((pathDist(x, z, PATH) - 0.5) / 0.8);
          g *= 0.25 + 0.75 * smooth((Math.hypot(x - BARN.x, z - BARN.z) - 9) / 10);
          return g * (0.75 + 0.25 * n3(x * 0.05, z * 0.05));
        },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : smooth((n3(x * 0.035 + 4, z * 0.035) - 0.15) / 0.3) * 0.55; },
        build(w) {
          w.addBarn(BARN);
          w.addGarden(GARDEN);
          w.fenceLine([[-58, -4], [-40, 2], [-22, 6], [-8, 10]]);
          w.fenceLine([[-60, -8], [-62, -30], [-58, -50], [-42, -58]]);
          const avoidFarm = (x, z) => Math.hypot(x - BARN.x, z - BARN.z) > 28 && !inGarden(x, z, 4) && pathDist(x, z, PATH) > 3;
          w.scatter({ type: 'hay', n: 6, sample: (r) => { const a = r() * TAU, d = 11 + r() * 8; return [BARN.x + Math.cos(a) * d, BARN.z + Math.sin(a) * d]; }, test: (x, z) => pathDist(x, z, PATH) > 2.5 && !inGarden(x, z, 2), gap: 3 });
          const orchard = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) orchard.push([22 + (i - 1) * 9, -46 + j * 9]);
          w.scatter({ type: 'apple', variants: [0, 1], n: orchard.length, sample: (r, k) => [orchard[k][0] + (r() - 0.5) * 2, orchard[k][1] + (r() - 0.5) * 2], gap: 3, spot: 'apple', spotR: 2.4 });
          w.scatter({ type: 'oak', variants: [0, 1, 2], n: 26, test: avoidFarm, gap: 10, spot: 'acorn', spotR: 3.6, minH: 0.7 });
          w.scatter({ type: 'pine', variants: [0, 1], n: 40, test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > HALF - 28, gap: 6, spot: 'pinecone', spotR: 2.2 });
          w.scatter({ type: 'bush', variants: [0, 1], n: 34, test: avoidFarm, gap: 3, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 18, test: avoidFarm, gap: 3, scale: [0.8, 1.3] });
          w.scatter({ type: 'stump', n: 4, test: avoidFarm, gap: 4 });
          w.scatter({ type: 'log', n: 4, test: avoidFarm, gap: 5 });
          w.scatter({ type: 'fern', n: 10, test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > HALF - 40, gap: 2 });
          w.scatter({ type: 'cattail', n: 26, near: POND, nearR: 26, minH: -0.35, maxH: 0.22, gap: 1.5, scale: [0.8, 1.2] });
          w.scatter({ type: 'lily', variants: [0, 0, 1], n: 18, near: POND, nearR: 22, minH: -9, maxH: -0.7, water: true, gap: 1.2, scale: [0.9, 1.5] });
        },
        wildlife: [
          { sp: 'chicken', n: 6, home: [BARN.x + 12, BARN.z + 10], range: 11 },
          { sp: 'duck', n: 4, home: [POND.x, POND.z], range: 12, water: true },
          { sp: 'bunny', n: 3, home: [10, 40], range: 30 },
          { sp: 'deer', n: 2, home: [-60, 60], range: 30 },
          { sp: 'squirrel', n: 2, home: [22, -40], range: 14 },
        ],
        foods: { grass: 4, worm: 3, apple: 3, carrot: 3, berries: 3, acorn: 1, pinecone: 1, smallfish: 3, fish: 1 },
        walk: [[-9, -13], [-22, -10], [10, 8], [20, -30], [-40, -40], [-10, 30], [30, 0], [-50, 20], [0, -20]],
      };
    },

    forest(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
      const c = { moss: P(0x4a6a2c), deep: P(0x34501f), needle: P(0x66543a), rock: P(0x6f6c62), sand: P(0x8a7a58), mud: P(0x332d20) };
      const zc = (x) => 20 * Math.sin(x * 0.017 + 1) + 8 * Math.sin(x * 0.045) - 25;
      const ford = (x) => Math.max(gauss(x + 45, 7), gauss(x - 40, 7));
      function H(x, z) {
        let h = 2 + 8 * (fbm(n1, x * 0.009, z * 0.009, 4) * 0.5 + 0.5) + 1.2 * n2(x * 0.05, z * 0.05);
        const d = Math.abs(z - zc(x)), deep = lerp(-1.4, 0.3, ford(x));
        h = lerp(h, deep, 1 - smooth((d - 3.5) / 8));
        return h + edgeLift(x, z);
      }
      return {
        name: 'Forest', blurb: 'Tall pines, mushrooms, pine cones, and a stream.', spawn: [0, 14],
        H, fog: [30, 150], water: { color: 0x4f8fb0, deep: 0x1d3a4a }, people: 0,
        grassH: [0.07, 0.16], grassTint: [0.22, 0.3, 0.4, 0.7], flowerColors: [0xffffff, 0xd8c8ff],
        paint(o, x, z, h) {
          o.copy(c.moss); mix(o, c.needle, n2(x * 0.04, z * 0.04) * 0.6 + 0.45); mix(o, c.deep, n3(x * 0.1, z * 0.1) * 0.5 + 0.2);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.35 * smooth(n3(x * 0.03, z * 0.03) + 0.3); },
        flowersAt() { return 0.03; },
        build(w) {
          const clear = (x, z) => Math.hypot(x, z - 14) > 9;
          w.scatter({ type: 'pine', variants: [0, 1, 2], n: 240, test: clear, gap: 4.8, spot: 'pinecone', spotR: 2.3, minH: 0.6 });
          w.scatter({ type: 'oak', variants: [0, 2], n: 20, test: clear, gap: 9, spot: 'acorn', spotR: 3.6, minH: 0.6 });
          w.scatter({ type: 'bush', variants: [0, 1], n: 26, gap: 3, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'fern', n: 200, gap: 1.4, scale: [0.8, 1.3] });
          w.scatter({ type: 'mushroom', n: 50, gap: 1.5 });
          w.scatter({ type: 'stump', n: 18, test: clear, gap: 4 });
          w.scatter({ type: 'log', n: 16, test: clear, gap: 5 });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 40, test: clear, gap: 3, scale: [0.8, 1.6] });
          w.scatter({ type: 'rock', variants: [0, 1], n: 20, minH: -0.6, maxH: 0.3, gap: 2, scale: [0.6, 1.0], sample: (r) => { const x = (r() - 0.5) * 2 * HALF; return [x, zc(x) + (r() - 0.5) * 12]; } });
        },
        wildlife: [
          { sp: 'squirrel', n: 4, home: [10, 30], range: 30 },
          { sp: 'deer', n: 3, home: [-40, 40], range: 40 },
          { sp: 'fox', n: 2, home: [40, 40], range: 40 },
          { sp: 'owl', n: 2, home: [-20, 20], range: 30 },
          { sp: 'frog', n: 2, home: [-45, zc(-45)], range: 8 },
          { sp: 'bunny', n: 2, home: [-30, 60], range: 25 },
        ],
        foods: { pinecone: 4, acorn: 2, berries: 3, worm: 3, grass: 1, smallfish: 2, fish: 2 },
        walk: [],
      };
    },

    swamp(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
      const c = { mud: P(0x5a5130), moss: P(0x4c5b2a), sedge: P(0x75803c), wet: P(0x37331f), sand: P(0x5c5236), deep: P(0x221f14) };
      function H(x, z) {
        let h = 0.6 + 0.45 * fbm(n1, x * 0.02, z * 0.02, 3) + 0.25 * n2(x * 0.08, z * 0.08);
        const p = fbm(n3, x * 0.016 + 3, z * 0.016 - 2, 3);
        h = lerp(h, -1.1 - 0.5 * p, smooth((p - 0.04) / 0.16));
        const k = smooth(1 - (Math.hypot(x, z) - 8) / 9);
        h = lerp(h, Math.max(h, 0.6), k);
        return h + edgeLift(x, z) * 0.7;
      }
      return {
        name: 'Swamp', blurb: 'Muddy pools, lily pads, turtles, and lots of fish.', spawn: [0, 0],
        H, fog: [25, 130], water: { swampy: true }, people: 0,
        grassH: [0.16, 0.38], grassTint: [0.13, 0.2, 0.35, 0.7], flowerColors: [0xffffff, 0xfff2a0],
        paint(o, x, z, h) {
          o.copy(c.mud); mix(o, c.moss, n2(x * 0.05, z * 0.05) * 0.6 + 0.5); mix(o, c.sedge, n1(x * 0.11, z * 0.11) * 0.5 + 0.1);
          if (h < 0.5) mix(o, c.wet, smooth((0.5 - h) / 0.4));
          shore(o, h, c.sand, c.deep);
        },
        grassAt(x, z, h) { return h < 0.2 ? 0 : 0.75; },
        flowersAt() { return 0.02; },
        build(w) {
          const clear = (x, z) => Math.hypot(x, z) > 8;
          w.scatter({ type: 'dead', variants: [0, 1], n: 50, test: clear, gap: 6, minH: -0.6 });
          w.scatter({ type: 'oak', variants: [1, 2], n: 8, test: clear, gap: 12, spot: 'acorn', spotR: 3.6, minH: 0.5 });
          w.scatter({ type: 'cattail', n: 200, minH: -0.45, maxH: 0.25, gap: 1.4, scale: [0.8, 1.25] });
          w.scatter({ type: 'lily', variants: [0, 0, 0, 1], n: 120, minH: -9, maxH: -0.6, water: true, gap: 1.1, scale: [0.8, 1.6] });
          w.scatter({ type: 'log', n: 24, test: clear, gap: 4, minH: -0.5 });
          w.scatter({ type: 'bush', variants: [0, 1], n: 18, gap: 3, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'mushroom', n: 26, gap: 1.5 });
          w.scatter({ type: 'fern', n: 30, gap: 2 });
          w.scatter({ type: 'stump', n: 10, test: clear, gap: 4 });
        },
        wildlife: [
          { sp: 'frog', n: 6, home: [0, 0], range: 40 },
          { sp: 'turtle', n: 4, home: [20, -20], range: 40, water: true },
          { sp: 'snake', n: 3, home: [-20, 20], range: 35 },
          { sp: 'duck', n: 4, home: [30, 30], range: 35, water: true },
        ],
        foods: { worm: 4, grass: 2, berries: 1, acorn: 1, smallfish: 4, fish: 3 },
        walk: [],
      };
    },

    jungle(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
      const c = { g1: P(0x2f6a2c), g2: P(0x3f8a37), soil: P(0x6b4a2c), sand: P(0xc0a66a), mud: P(0x3a2e1e) };
      const xc = (z) => 22 * Math.sin(z * 0.018) + 9 * Math.sin(z * 0.05 + 2) + 32;
      const ford = (z) => Math.max(gauss(z + 35, 7), gauss(z - 45, 7));
      const LAG = { x: -34, z: 30, r: 12 };
      function H(x, z) {
        let h = 2 + 7 * (fbm(n1, x * 0.01, z * 0.01, 4) * 0.5 + 0.5) + 1.5 * n2(x * 0.04, z * 0.04);
        const d = Math.abs(x - xc(z)), deep = lerp(-1.8, 0.3, ford(z));
        h = lerp(h, deep, 1 - smooth((d - 5) / 9));
        h = lerp(h, -1.6, smooth((1 - Math.hypot(x - LAG.x, z - LAG.z) / LAG.r) / 0.6));
        return h + edgeLift(x, z);
      }
      return {
        name: 'Jungle', blurb: 'Giant leaves, palm trees, parrots, and a river.', spawn: [-6, -6],
        H, fog: [22, 125], water: { color: 0x3fa3b8, deep: 0x124a52 }, people: 0,
        grassH: [0.12, 0.28], grassTint: [0.25, 0.33, 0.5, 0.8], flowerColors: [0xff3b6b, 0xffb020, 0xb44cf0, 0xff6a3d, 0xffffff],
        paint(o, x, z, h) { o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5); mix(o, c.soil, n3(x * 0.07, z * 0.07) * 0.5 - 0.05); shore(o, h, c.sand, c.mud); },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.55; },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : 0.2 * smooth(n3(x * 0.05, z * 0.05) + 0.2); },
        build(w) {
          const clear = (x, z) => Math.hypot(x + 6, z + 6) > 9;
          w.scatter({ type: 'palm', variants: [0, 1], n: 120, test: clear, gap: 5, spot: 'apple', spotR: 3, minH: 0.5 });
          w.scatter({ type: 'bigleaf', n: 220, test: clear, gap: 2.2, scale: [0.8, 1.4] });
          w.scatter({ type: 'fern', n: 130, gap: 1.8, scale: [0.9, 1.4] });
          w.scatter({ type: 'bush', variants: [0, 1], n: 30, gap: 3, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 22, test: clear, gap: 3 });
          w.scatter({ type: 'log', n: 10, test: clear, gap: 5 });
          w.scatter({ type: 'mushroom', n: 14, gap: 2 });
          w.scatter({ type: 'lily', variants: [0, 1], n: 16, near: LAG, nearR: 14, minH: -9, maxH: -0.6, water: true, gap: 1.2, scale: [1, 1.6] });
        },
        wildlife: [
          { sp: 'parrot', n: 4, home: [-10, 10], range: 35 },
          { sp: 'lizard', n: 4, home: [0, -20], range: 30 },
          { sp: 'frog', n: 3, home: [LAG.x, LAG.z], range: 12 },
          { sp: 'turtle', n: 2, home: [LAG.x, LAG.z], range: 10, water: true },
          { sp: 'snake', n: 2, home: [10, 30], range: 25 },
        ],
        foods: { berries: 4, apple: 3, worm: 3, grass: 1, smallfish: 2, fish: 2 },
        walk: [],
      };
    },

    meadow(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
      const POND = { x: -42, z: -38, r: 15 };
      const c = { g1: P(0x6c9e3a), g2: P(0x8fbd52), dry: P(0xa9c25e), sand: P(0xb3a070), mud: P(0x3d3826), dirt: P(0x7d6a48) };
      const PATH = [[-80, 20], [-40, 12], [0, 4], [30, 10], [70, -6]];
      function H(x, z) {
        let h = 1.5 + 5.5 * (fbm(n1, x * 0.008, z * 0.008, 3) * 0.5 + 0.5) + 0.8 * n2(x * 0.03, z * 0.03);
        const dx = x - POND.x, dz = z - POND.z;
        h = lerp(h, -1.8, smooth((1 - Math.hypot(dx, dz) / POND.r) / 0.55));
        return h + edgeLift(x, z);
      }
      return {
        name: 'Meadow', blurb: 'Flowers everywhere, and people out for walks.', spawn: [4, 8],
        H, fog: [60, 250], water: {}, people: 3,
        grassH: [0.12, 0.3], grassTint: [0.2, 0.28, 0.5, 0.9], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xff7b5a, 0x8fb8ff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n2, x * 0.02, z * 0.02, 2) * 0.8 + 0.5); mix(o, c.dry, n3(x * 0.01, z * 0.01) * 0.5 + 0.15);
          mix(o, c.dirt, 1 - smooth((pathDist(x, z, PATH) - 0.6) / 1.0));
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.3 ? 0 : smooth((pathDist(x, z, PATH) - 0.7) / 0.8); },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : (0.35 + 0.65 * smooth((n3(x * 0.03, z * 0.03) + 0.1) / 0.4)) * smooth((pathDist(x, z, PATH) - 0.7) / 0.8); },
        build(w) {
          const off = (x, z) => pathDist(x, z, PATH) > 3 && Math.hypot(x - 4, z - 8) > 10;
          w.scatter({ type: 'oak', variants: [0, 1, 2], n: 22, test: off, gap: 14, spot: 'acorn', spotR: 3.6, minH: 0.7 });
          w.scatter({ type: 'apple', variants: [0, 1], n: 6, test: off, gap: 10, spot: 'apple', spotR: 2.4, minH: 0.7 });
          w.scatter({ type: 'pine', variants: [0, 1], n: 30, test: (x, z) => Math.max(Math.abs(x), Math.abs(z)) > HALF - 26, gap: 6, spot: 'pinecone', spotR: 2.2 });
          w.scatter({ type: 'bush', variants: [0, 1], n: 40, test: off, gap: 3, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 18, test: off, gap: 4 });
          w.scatter({ type: 'hay', n: 4, test: off, gap: 6 });
          w.scatter({ type: 'cattail', n: 18, near: POND, nearR: 20, minH: -0.35, maxH: 0.22, gap: 1.5 });
          w.scatter({ type: 'lily', variants: [0, 0, 1], n: 12, near: POND, nearR: 16, minH: -9, maxH: -0.7, water: true, gap: 1.2, scale: [0.9, 1.5] });
        },
        wildlife: [
          { sp: 'bunny', n: 5, home: [20, 30], range: 35 },
          { sp: 'deer', n: 3, home: [40, -40], range: 40 },
          { sp: 'fox', n: 1, home: [-30, 50], range: 40 },
          { sp: 'swan', n: 2, home: [POND.x, POND.z], range: 9, water: true },
          { sp: 'duck', n: 2, home: [POND.x, POND.z], range: 9, water: true },
          { sp: 'squirrel', n: 2, home: [-10, -30], range: 25 },
        ],
        foods: { grass: 4, berries: 3, apple: 2, acorn: 1, worm: 2, smallfish: 2, carrot: 0 },
        walk: [[4, 8], [-40, 12], [0, 4], [30, 10], [60, -6], [-20, 40], [20, -30], [-60, -10]],
      };
    },

    sky(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1);
      const ISL = [
        { x: 0, z: 0, r: 26, top: 0 }, { x: 52, z: -24, r: 15, top: 6 }, { x: -50, z: 26, r: 17, top: -3 },
        { x: 18, z: 60, r: 13, top: 10 }, { x: -30, z: -58, r: 14, top: 4 }, { x: 82, z: 32, r: 12, top: 15 },
        { x: -86, z: -14, r: 11, top: 9 }, { x: -6, z: -96, r: 12, top: 18 },
      ];
      const c = { g1: P(0x79b84f), g2: P(0x9bd06a), rock: P(0x8a7d6b), dark: P(0x5e5446) };
      function H(x, z) {
        for (const I of ISL) {
          const d = Math.hypot(x - I.x, z - I.z);
          if (d < I.r) {
            let h = I.top + 1.4 * smooth(1 - d / I.r) + 0.5 * n1(x * 0.07, z * 0.07);
            h -= smooth((d - (I.r - 3)) / 3) * 1.2;
            return h;
          }
        }
        return -1000;
      }
      return {
        name: 'Sky Lands', blurb: 'Islands in the clouds. Only animals that fly can go.', spawn: [0, 4], needsFly: true,
        H, islands: ISL, fog: [80, 380], water: null, people: 0,
        grassH: [0.1, 0.22], grassTint: [0.22, 0.32, 0.5, 0.95], flowerColors: [0xffffff, 0xffb6d9, 0xc9b6f7, 0xa8ebd8, 0xffe3a3],
        paint(o, x, z, h, under) {
          if (under) { o.copy(c.rock); mix(o, c.dark, under); return; }
          o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5);
        },
        grassAt(x, z, h) { return h < -100 ? 0 : 0.85; },
        flowersAt(x, z, h) { return h < -100 ? 0 : 0.45; },
        build(w) {
          const onIsland = (x, z) => ISL.some((I) => Math.hypot(x - I.x, z - I.z) < I.r - 3);
          w.scatter({ type: 'puff', variants: [0, 1, 2, 3], n: 30, test: (x, z) => onIsland(x, z) && Math.hypot(x, z - 4) > 7, gap: 6, minH: -100, spot: 'apple', spotR: 2.6 });
          w.scatter({ type: 'bush', variants: [0, 1], n: 16, test: onIsland, gap: 3, minH: -100, spot: 'berries', spotR: 0.9 });
          w.scatter({ type: 'rock', variants: [0, 1], n: 10, test: onIsland, gap: 3, minH: -100 });
        },
        wildlife: [
          { sp: 'parrot', n: 4, home: [0, 0], range: 18 },
          { sp: 'swan', n: 2, home: [52, -24], range: 8 },
        ],
        foods: { berries: 5, apple: 3, acorn: 1, worm: 1, grass: 2 },
        walk: [],
      };
    },
  };
  const SEEDS = { land: 11, forest: 23, swamp: 37, jungle: 41, meadow: 53, sky: 67 };
  const META = {}; for (const id of WORLD_ORDER) { const d = DEFS[id](SEEDS[id]); META[id] = { name: d.name, blurb: d.blurb, needsFly: !!d.needsFly }; }

  /* ---- shared textures ---- */
  let detailTex = null;
  function getDetail() {
    if (detailTex) return detailTex;
    const N = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const x = cv.getContext('2d'), img = x.createImageData(N, N), r = rng(5), n = makeNoise(9);
    for (let i = 0; i < N * N; i++) {
      const px = i % N, py = (i / N) | 0;
      let v = 0.9 + 0.09 * fbm(n, px / 40, py / 40, 3) + 0.07 * n(px / 7, py / 7) + (r() - 0.5) * 0.16;
      if (r() < 0.04) v -= 0.12; else if (r() < 0.03) v += 0.08;
      const k = (v * 255) | 0; img.data[i * 4] = k; img.data[i * 4 + 1] = k; img.data[i * 4 + 2] = Math.min(255, k + 2); img.data[i * 4 + 3] = 255;
    }
    // tileable edges: blend a mirrored copy
    x.putImageData(img, 0, 0);
    detailTex = new THREE.CanvasTexture(cv);
    detailTex.wrapS = detailTex.wrapT = THREE.MirroredRepeatWrapping;
    detailTex.anisotropy = 4;
    return detailTex;
  }

  /* ---- build ---- */
  function build(id) {
    const def = DEFS[id](SEEDS[id]);
    const group = new THREE.Group();
    const H = def.H;
    const w = {
      id, def, group, H, HALF, colliders: [], grid: new Map(), spots: { apple: [], acorn: [], pinecone: [], berries: [], carrot: [] },
      inst: new Map(), placed: new Map(), disposables: [], chunks: [], cover: [],
    };
    const r = rng(SEEDS[id] * 7 + 1);

    w.ground = (x, z) => H(x, z);
    // is this height dry land you can stand on?
    w.dry = (h, margin = 0.2) => (def.water ? h > WATER + margin : h > -100);
    w.isWater = (x, z) => !def.islands && H(x, z) < WATER;
    w.normal = (x, z, out) => { const e = 0.6; out.set(H(x - e, z) - H(x + e, z), 2 * e, H(x, z - e) - H(x, z + e)).normalize(); return out; };

    /* colliders */
    const gkey = (cx, cz) => cx * 4096 + cz;
    function addCollider(c) {
      w.colliders.push(c);
      const R = c.box ? Math.hypot(c.hw, c.hd) : c.r;
      for (let cx = Math.floor((c.x - R) / 8); cx <= Math.floor((c.x + R) / 8); cx++) for (let cz = Math.floor((c.z - R) / 8); cz <= Math.floor((c.z + R) / 8); cz++) {
        const k = gkey(cx, cz); let a = w.grid.get(k); if (!a) w.grid.set(k, (a = [])); a.push(c);
      }
    }
    // push a circle (pos.x, pos.z, rad) out of colliders. Returns true if it hit something.
    w.collide = (pos, rad) => {
      const a = w.grid.get(gkey(Math.floor(pos.x / 8), Math.floor(pos.z / 8)));
      let hit = false;
      if (a) for (const c of a) {
        if (c.box) {
          const dx = pos.x - c.x, dz = pos.z - c.z, lx = dx * c.co + dz * c.si, lz = -dx * c.si + dz * c.co;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d < rad) {
            let nx, nz, push;
            if (d > 1e-4) { nx = ex / d; nz = ez / d; push = rad - d; }
            else { const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + rad; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + rad; } }
            pos.x += (nx * c.co - nz * c.si) * push; pos.z += (nx * c.si + nz * c.co) * push; hit = true;
          }
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
          if (d < m) { if (d < 1e-4) { pos.x += m; } else { pos.x += (dx / d) * (m - d); pos.z += (dz / d) * (m - d); } hit = true; }
        }
      }
      return hit;
    };

    /* placement bookkeeping (keeps big props apart) */
    function gapOK(x, z, gap) {
      const R = Math.ceil(gap / 6);
      const cx = Math.floor(x / 6), cz = Math.floor(z / 6);
      for (let i = -R; i <= R; i++) for (let j = -R; j <= R; j++) {
        const a = w.placed.get(gkey(cx + i, cz + j)); if (!a) continue;
        for (const p of a) if (Math.hypot(p.x - x, p.z - z) < (p.gap + gap) * 0.5) return false;
      }
      return true;
    }
    function markPlaced(x, z, gap) { const k = gkey(Math.floor(x / 6), Math.floor(z / 6)); let a = w.placed.get(k); if (!a) w.placed.set(k, (a = [])); a.push({ x, z, gap }); }
    function pushInst(type, variant, x, y, z, rot, s, sy) {
      const key = type + ':' + variant; let e = w.inst.get(key); if (!e) w.inst.set(key, (e = { type, variant, items: [] }));
      e.items.push([x, y, z, rot, s, sy || s]);
    }

    const spawn = def.spawn;
    w.scatter = (o) => {
      const variants = o.variants || [0];
      const [s0, s1] = o.scale || [0.85, 1.15];
      const minH = o.minH !== undefined ? o.minH : 0.35, maxH = o.maxH !== undefined ? o.maxH : 999;
      const gap = o.gap || 2;
      let placed = 0;
      for (let k = 0, tries = 0; placed < o.n && tries < o.n * 40; tries++) {
        let x, z;
        if (o.sample) { [x, z] = o.sample(r, k); }
        else if (o.near) { const a = r() * TAU, d = Math.sqrt(r()) * o.nearR; x = o.near.x + Math.cos(a) * d; z = o.near.z + Math.sin(a) * d; }
        else { x = (r() * 2 - 1) * (HALF + 22); z = (r() * 2 - 1) * (HALF + 22); }
        if (o.sample) k++;
        const h = H(x, z);
        if (h < minH || h > maxH) { if (o.sample && k >= o.n) break; continue; }
        if (!o.water && !o.near && !o.sample && Math.hypot(x - spawn[0], z - spawn[1]) < 6) continue;
        if (o.test && !o.test(x, z, h)) { if (o.sample && k >= o.n) break; continue; }
        if (!gapOK(x, z, gap)) { if (o.sample && k >= o.n) break; continue; }
        const variant = variants[(r() * variants.length) | 0];
        const s = s0 + r() * (s1 - s0), rot = r() * TAU;
        const y = o.water ? WATER + 0.005 : h - (o.sink || 0.05) * s;
        pushInst(o.type, variant, x, y, z, rot, s);
        markPlaced(x, z, gap);
        const pr = Env.prop(o.type, variant).radius;
        if (pr > 0) addCollider({ x, z, r: pr * s });
        if (o.spot) w.spots[o.spot].push({ x, z, r: o.spotR * s, y: h });
        placed++;
        if (o.sample && k >= o.n) break;
      }
    };

    w.addBarn = (B) => {
      const g = Env.barn(); const y = H(B.x, B.z);
      g.position.set(B.x, y - 0.05, B.z); g.rotation.y = B.rot; group.add(g);
      g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const sz = g.userData.size || { w: 10, d: 14 };
      addCollider({ box: true, x: B.x, z: B.z, hw: sz.w / 2 + 0.1, hd: sz.d / 2 + 0.1, co: Math.cos(B.rot), si: Math.sin(B.rot) });
      markPlaced(B.x, B.z, 18);
      w.barn = { x: B.x, z: B.z, rot: B.rot, door: [B.x + Math.sin(B.rot) * (sz.d / 2 + 1.5), B.z + Math.cos(B.rot) * (sz.d / 2 + 1.5)] };
    };
    w.addGarden = (G) => {
      const g = Env.garden(G.w, G.d); const y = H(G.x, G.z);
      g.position.set(G.x, y, G.z); g.rotation.y = G.rot; group.add(g);
      g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      const co = Math.cos(G.rot), si = Math.sin(G.rot), rh = g.userData.rowHeight || 0.18;
      for (const row of g.userData.rows || []) for (let zz = row.z0 + 0.3; zz <= row.z1 - 0.3; zz += 0.55) {
        const wx = G.x + row.x * co + zz * si, wz = G.z - row.x * si + zz * co;
        w.spots.carrot.push({ x: wx, z: wz, y: y + rh * 0.85, r: 0 });
      }
      markPlaced(G.x, G.z, Math.max(G.w, G.d) + 2);
      // fence around the garden with a gate gap on one side
      const hw = G.w / 2 + 0.8, hd = G.d / 2 + 0.8;
      const corner = (lx, lz) => [G.x + lx * co + lz * si, G.z - lx * si + lz * co];
      w.fenceLine([corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(1.2, hd)]);
      w.fenceLine([corner(-1.2, hd), corner(-hw, hd), corner(-hw, -hd)]);
    };
    w.fenceLine = (pts) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        const segs = Math.max(1, Math.round(len / 3.2)), sl = len / segs, ang = Math.atan2(bz - az, bx - ax);
        for (let s = 0; s < segs; s++) {
          const x = ax + (bx - ax) * (s / segs), z = az + (bz - az) * (s / segs);
          const f = Env.fence(sl); f.position.set(x, H(x, z) - 0.04, z); f.rotation.y = -ang;
          f.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
          group.add(f);
        }
      }
    };

    /* terrain */
    const tex = getDetail();
    const col = new THREE.Color();
    if (def.islands) buildIslands(); else buildTerrain();
    function buildTerrain() {
      const SEG = 170, size = EDGE * 2;
      const g = new THREE.PlaneGeometry(size, size, SEG, SEG); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, uv = g.attributes.uv, cols = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) {
        const x = p.getX(i), z = p.getZ(i), h = H(x, z);
        p.setY(i, h);
        def.paint(col, x, z, h);
        cols[i * 3] = col.r; cols[i * 3 + 1] = col.g; cols[i * 3 + 2] = col.b;
        uv.setXY(i, x / 3.5, z / 3.5);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.computeVertexNormals();
      const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
      const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true;
      group.add(mesh); w.disposables.push(g, m);
      if (def.water) {
        const wm = Env.water(size + 200, def.water); wm.position.y = WATER; group.add(wm);
        w.disposables.push(wm.geometry);
        w.waterMesh = wm;
      }
    }
    function buildIslands() {
      for (const I of def.islands) {
        const RINGS = 12, SEGS = 56, DEPTH = I.r * 1.1;
        const pos = [], cols = [], uvs = [], idx = [];
        const nU = makeNoise(I.x * 13 + I.z);
        // top surface: rings from center out to the rim
        const vtx = (x, y, z, under) => { def.paint(col, x, z, y, under); pos.push(x, y, z); cols.push(col.r, col.g, col.b); uvs.push(x / 3.5, z / 3.5); return pos.length / 3 - 1; };
        const top = [];
        for (let j = 0; j <= RINGS; j++) {
          const row = [];
          for (let s = 0; s < SEGS; s++) {
            const a = (s / SEGS) * TAU, rr = (j / RINGS) * (I.r - 0.05);
            const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
            row.push(vtx(x, H(x, z), z, 0));
          }
          top.push(row);
        }
        // underside: from the rim down to a rocky point
        const under = [top[RINGS]];
        const UR = 9;
        for (let j = 1; j <= UR; j++) {
          const row = [], t = j / UR;
          for (let s = 0; s < SEGS; s++) {
            const a = (s / SEGS) * TAU, jag = 1 + 0.28 * nU(Math.cos(a) * 2 + j * 0.7, Math.sin(a) * 2);
            const rr = I.r * Math.pow(1 - t, 0.75) * jag * (j === UR ? 0.02 : 1);
            const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
            row.push(vtx(x, I.top - 0.6 - t * DEPTH * (0.8 + 0.3 * nU(Math.cos(a) * 3, Math.sin(a) * 3 + j)), z, 0.2 + t * 0.6));
          }
          under.push(row);
        }
        const strip = (rows, flip) => {
          for (let j = 0; j < rows.length - 1; j++) for (let s = 0; s < SEGS; s++) {
            const a = rows[j][s], b = rows[j][(s + 1) % SEGS], c2 = rows[j + 1][s], d = rows[j + 1][(s + 1) % SEGS];
            if (!flip) idx.push(a, c2, b, b, c2, d); else idx.push(a, b, c2, b, d, c2);
          }
        };
        strip(top, true); strip(under, true);
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        g.setIndex(idx); g.computeVertexNormals();
        const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
        const mesh = new THREE.Mesh(g, m); mesh.receiveShadow = true; mesh.castShadow = true;
        group.add(mesh); w.disposables.push(g, m);
      }
    }

    def.build(w);

    /* props -> chunked instanced meshes */
    for (const e of w.inst.values()) {
      const pr = Env.prop(e.type, e.variant);
      const byChunk = new Map();
      for (const it of e.items) {
        const cx = clamp(Math.floor((it[0] + EDGE) / CHS), 0, CH - 1), cz = clamp(Math.floor((it[2] + EDGE) / CHS), 0, CH - 1);
        const k = cx * CH + cz; let a = byChunk.get(k); if (!a) byChunk.set(k, (a = [])); a.push(it);
      }
      for (const [k, items] of byChunk) {
        const cx = Math.floor(k / CH), cz = k % CH;
        const center = new THREE.Vector3(-EDGE + (cx + 0.5) * CHS, 4, -EDGE + (cz + 0.5) * CHS);
        const sphere = new THREE.Sphere(center, CHS * 0.75 + 16);
        for (const part of pr.parts) {
          const src = part.geometry, g = new THREE.BufferGeometry();
          for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
          if (src.index) g.setIndex(src.index);
          for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
          g.boundingSphere = sphere;
          g.boundingBox = new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(CHS + 32, 60, CHS + 32));
          const im = new THREE.InstancedMesh(g, part.material, items.length);
          items.forEach((it, i) => {
            dummy.position.set(it[0], it[1], it[2]); dummy.rotation.set(0, it[3], 0); dummy.scale.set(it[4], it[5], it[4]); dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
          });
          im.castShadow = !!part.castShadow; im.receiveShadow = true;
          if (part.depthMaterial) im.customDepthMaterial = part.depthMaterial;
          group.add(im);
          w.chunks.push({ mesh: im, center });
          w.disposables.push(g);
        }
      }
    }

    /* ground cover: grass blades and flowers generated around the viewer */
    const G = Env.grass();
    patchGrass(G.material);
    w.cover.push(makeCover({
      geo: G.geometry, mat: G.material, cap: 9000, cell: 2, radius: 22,
      gen(cx, cz, out) {
        const rr = rng(hash2(cx, cz, SEEDS[id]) * 4294967296);
        const [h0, h1] = def.grassH, [t0, t1, l0, l1] = def.grassTint;
        for (let i = 0; i < 64; i++) {
          const x = (cx + rr()) * 2, z = (cz + rr()) * 2, y = H(x, z);
          const d = def.grassAt(x, z, y);
          if (rr() > d) continue;
          const s = h0 + rr() * (h1 - h0);
          col.setHSL(t0 + rr() * (t1 - t0), 0.3 + rr() * 0.25, l0 + rr() * (l1 - l0));
          out.push(x, y - 0.02, z, rr() * TAU, s * (0.55 + rr() * 0.35), s, col.r, col.g, col.b);
        }
      },
    }));
    const F = Env.prop('flower', 0);
    for (const part of F.parts) {
      w.cover.push(makeCover({
        geo: part.geometry, mat: part.material, cap: 1100, cell: 4, radius: 28, shadow: false,
        gen(cx, cz, out) {
          const rr = rng(hash2(cx, cz, SEEDS[id] + 99) * 4294967296);
          const fc = def.flowerColors;
          for (let i = 0; i < 18; i++) {
            const x = (cx + rr()) * 4, z = (cz + rr()) * 4, y = H(x, z);
            const d = def.flowersAt(x, z, y);
            if (rr() > d) continue;
            col.setHex(fc[(rr() * fc.length) | 0]).convertSRGBToLinear();
            const s = 1.0 + rr() * 0.7;
            out.push(x, y - 0.02, z, rr() * TAU, s, s * (0.85 + rr() * 0.4), col.r, col.g, col.b);
          }
        },
      }));
    }
    for (const c of w.cover) group.add(c.mesh);

    w.updateView = (camPos, px, pz, far, size) => {
      const k = clamp(size || 1, 0.2, 3);
      w.cover[0].update(px, pz, clamp(8 + k * 7, 9, 22));
      for (let i = 1; i < w.cover.length; i++) w.cover[i].update(px, pz, clamp(13 + k * 7, 14, 28));
      const lim = far + CHS * 0.75 + 20;
      for (const ch of w.chunks) ch.mesh.visible = Math.hypot(ch.center.x - camPos.x, ch.center.z - camPos.z) < lim;
    };
    w.dispose = () => {
      for (const d of w.disposables) d.dispose();
      for (const c of w.cover) c.mesh.dispose();
      for (const ch of w.chunks) ch.mesh.dispose();
    };

    /* random ground spots for food and wandering */
    // a point on land (or water when water=true) inside a ring around (cx, cz)
    w.ringPoint = (cx, cz, r0, r1, wantWater, rr = Math.random) => {
      for (let k = 0; k < 24; k++) {
        const a = rr() * TAU, d = r0 + (r1 - r0) * Math.sqrt(rr());
        const x = clamp(cx + Math.cos(a) * d, -HALF + 3, HALF - 3), z = clamp(cz + Math.sin(a) * d, -HALF + 3, HALF - 3);
        const h = H(x, z);
        if (h < -100) continue;
        if (wantWater ? (!!def.water && h < WATER - 0.55) : w.dry(h)) return { x, z, h };
      }
      return null;
    };
    w.foodPoint = (type, cx, cz, r0, r1) => {
      const spotType = { apple: 'apple', acorn: 'acorn', pinecone: 'pinecone', berries: 'berries', carrot: 'carrot' }[type];
      if (FOODS[type].water) { const p = w.ringPoint(cx, cz, r0, r1, true); return p ? { x: p.x, z: p.z, y: WATER - 0.22 - Math.random() * 0.15 } : null; }
      if (spotType) {
        const list = w.spots[spotType].filter((s) => { const d = Math.hypot(s.x - cx, s.z - cz); return d > r0 - s.r && d < r1 + s.r; });
        if (list.length) {
          for (let k = 0; k < 8; k++) {
            const s = list[(Math.random() * list.length) | 0];
            if (spotType === 'carrot') return { x: s.x, z: s.z, y: s.y };
            const a = Math.random() * TAU, d = (spotType === 'berries' ? 0.75 + Math.random() * 0.35 : 0.5 + Math.sqrt(Math.random()) * 0.9) * (s.r || 1);
            const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, h = H(x, z);
            if (w.dry(h, 0.15)) return { x, z, y: h };
          }
        }
        if (spotType === 'carrot') return null;
        if (type === 'apple' && !w.spots.apple.length) return null;
      }
      const p = w.ringPoint(cx, cz, r0, r1, false);
      if (!p) return null;
      if (type === 'grass' && def.grassAt(p.x, p.z, p.h) < 0.2) return null;
      return { x: p.x, z: p.z, y: p.h };
    };
    return w;
  }

  /* trample: grass near the player flattens so small animals stay visible */
  const PUSH = { value: new THREE.Vector4(0, 0, 0.6, 1) };
  let patched = false;
  function patchGrass(mat) {
    if (patched) return; patched = true;
    const prev = mat.onBeforeCompile;
    mat.onBeforeCompile = (sh, rr) => {
      prev(sh, rr);
      sh.uniforms.uPush = PUSH;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform vec4 uPush;\nvoid main() {')
        .replace('transformed.y -= dot(bend, bend) * hh * 0.35;', `transformed.y -= dot(bend, bend) * hh * 0.35;
    { float pd = length(wb.xz - uPush.xy); float pk = (1.0 - smoothstep(uPush.z * 0.45, uPush.z, pd)) * uPush.w; transformed.y *= 1.0 - pk * 0.78; transformed.xz *= 1.0 + pk * 0.9; }`);
    };
    mat.customProgramCacheKey = () => 'env-grass-push';
    mat.needsUpdate = true;
  }

  function makeCover(o) {
    const mesh = new THREE.InstancedMesh(o.geo, o.mat, o.cap);
    mesh.frustumCulled = false; mesh.count = 0; mesh.receiveShadow = true; mesh.castShadow = false;
    mesh.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(o.cap * 3).fill(1), 3);
    const cache = new Map(); let last = null, lastR = 0;
    // cells sorted by distance, so the cap trims the far edge evenly
    const RM = Math.ceil(o.radius / o.cell), offs = [];
    for (let dz = -RM; dz <= RM; dz++) for (let dx = -RM; dx <= RM; dx++) { const d = Math.hypot(dx, dz); if (d <= RM + 0.3) offs.push([dx, dz, d]); }
    offs.sort((a, b) => a[2] - b[2]);
    function cell(cx, cz) {
      const k = cx * 4096 + cz; let d = cache.get(k);
      if (!d) { const out = []; o.gen(cx, cz, out); d = new Float32Array(out); cache.set(k, d); if (cache.size > 6000) cache.clear(); }
      return d;
    }
    return {
      mesh,
      update(px, pz, radius) {
        const cx = Math.floor(px / o.cell), cz = Math.floor(pz / o.cell), key = cx * 4096 + cz;
        const R = Math.min(RM, (radius || o.radius) / o.cell);
        if (key === last && R === lastR) return; last = key; lastR = R;
        const a = mesh.instanceMatrix.array, ca = mesh.instanceColor.array;
        let n = 0;
        for (const [dx, dz, dd] of offs) {
          if (dd > R + 0.3 || n >= o.cap) break;
          const d = cell(cx + dx, cz + dz);
          for (let i = 0; i < d.length && n < o.cap; i += 9) {
            const x = d[i], y = d[i + 1], z = d[i + 2], rot = d[i + 3], s = d[i + 4], sy = d[i + 5], c = Math.cos(rot), sn = Math.sin(rot), q = n * 16;
            a[q] = c * s; a[q + 1] = 0; a[q + 2] = -sn * s; a[q + 3] = 0;
            a[q + 4] = 0; a[q + 5] = sy; a[q + 6] = 0; a[q + 7] = 0;
            a[q + 8] = sn * s; a[q + 9] = 0; a[q + 10] = c * s; a[q + 11] = 0;
            a[q + 12] = x; a[q + 13] = y; a[q + 14] = z; a[q + 15] = 1;
            ca[n * 3] = d[i + 6]; ca[n * 3 + 1] = d[i + 7]; ca[n * 3 + 2] = d[i + 8];
            n++;
          }
        }
        mesh.count = n;
        mesh.instanceMatrix.needsUpdate = true; mesh.instanceColor.needsUpdate = true;
      },
    };
  }

  return { build, META, HALF, PUSH };
})();
