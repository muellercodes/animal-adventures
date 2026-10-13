/* ---------- worlds: terrain, water, props, colliders, houses, ground cover ---------- */
const World = (() => {
  const HALF = 170;          // the walkable area is -HALF..HALF on x and z
  const EDGE = 210;          // terrain mesh half size (hills past the edge fade into fog)
  const CH = 4;              // props are split into CH x CH chunks for culling
  const CHS = (EDGE * 2) / CH;
  const ROOM_X = 1000;       // house interiors live far off the map at x >= ROOM_X
  const SMALL = { rock: 1, fern: 1, mushroom: 1, stump: 1, log: 1, cattail: 1, lily: 1, pumpkin: 1, cornstalk: 1, hay: 1, bigleaf: 0 };
  const dummy = new THREE.Object3D();

  /* ---- shape helpers ---- */
  function edgeLift(x, z) { const m = Math.max(Math.abs(x), Math.abs(z)); const e = smooth((m - (HALF - 20)) / 40); return e * e * 22; }
  function segDist(px, pz, ax, az, bx, bz) {
    const vx = bx - ax, vz = bz - az, t = clamp(((px - ax) * vx + (pz - az) * vz) / (vx * vx + vz * vz), 0, 1);
    return Math.hypot(px - ax - vx * t, pz - az - vz * t);
  }
  function pathDist(px, pz, pts) { let d = 1e9; for (let i = 0; i < pts.length - 1; i++) d = Math.min(d, segDist(px, pz, pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1])); return d; }
  function mix(o, c, t) { if (t <= 0) return o; if (t > 1) t = 1; o.r += (c.r - o.r) * t; o.g += (c.g - o.g) * t; o.b += (c.b - o.b) * t; return o; }
  function shore(o, h, sand, mud) { if (h < 0.4) mix(o, sand, smooth((0.4 - h) / 0.45)); if (h < -0.2) mix(o, mud, smooth((-0.2 - h) / 1.3)); }
  const P = linear;
  const gauss = (u, w) => Math.exp(-(u / w) * (u / w));
  // a pond or lake with a wobbly shoreline: blends h toward depth inside radius r
  function water(n, h, x, z, L, depth) {
    const dx = x - L.x, dz = z - L.z, a = Math.atan2(dz, dx);
    const r = L.r * (1 + 0.17 * n(Math.cos(a) * 1.4 + L.x * 0.01, Math.sin(a) * 1.4 + L.z * 0.01));
    return lerp(h, depth, smooth((1 - Math.hypot(dx, dz) / r) / 0.5));
  }
  // flatten a rotated rectangle (village lots, farmyard) to height y with a soft edge
  function flatRect(h, x, z, R, y) {
    const d = Math.max(Math.abs(x - R.x) - R.hw, Math.abs(z - R.z) - R.hd, 0);
    return lerp(h, y, 1 - smooth(d / (R.soft || 12)));
  }
  const edgeZone = (x, z, d) => Math.max(Math.abs(x), Math.abs(z)) > HALF - d;

  /* ---- world definitions ---- */
  const DEFS = {
    land(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const BARN = { x: -52, z: -40, rot: 0.4 }, GARDEN = { x: -24, z: -62, w: 10, d: 8, rot: 0.4 };
      const POND = { x: 55, z: 55, r: 19 }, LAKE = { x: -105, z: 100, r: 42 }, PATCH = { x: -36, z: -88, r: 8 };
      const VILLAGE = { x: 100, z: -55, hw: 52, hd: 28, soft: 14 };
      const STREET = [[48, -55], [134, -55]];
      const PATH = [[-48, -25], [-30, -12], [-8, -4], [18, 16], [42, 40]];
      const ROAD = [[-8, -4], [20, -28], [48, -55], [134, -55]];
      const LAKEPATH = [[-30, -12], [-60, 30], [-78, 62]];
      const c = { g1: P(0x557f2e), g2: P(0x77a442), dry: P(0x9aa553), dirt: P(0x7d6345), gravel: P(0x8d8169), sand: P(0xae986a), mud: P(0x3b3524) };
      const gc = Math.cos(GARDEN.rot), gs = Math.sin(GARDEN.rot);
      const inGarden = (x, z, pad) => { const dx = x - GARDEN.x, dz = z - GARDEN.z, lx = dx * gc - dz * gs, lz = dx * gs + dz * gc; return Math.abs(lx) < GARDEN.w / 2 + pad && Math.abs(lz) < GARDEN.d / 2 + pad; };
      const inVillage = (x, z, pad) => Math.abs(x - VILLAGE.x) < VILLAGE.hw + pad && Math.abs(z - VILLAGE.z) < VILLAGE.hd + pad;
      const roadD = (x, z) => Math.min(pathDist(x, z, ROAD), pathDist(x, z, STREET));
      function H(x, z) {
        let h = 1.3 + 3.2 * (fbm(n1, x * 0.009, z * 0.009, 3) * 0.5 + 0.5) + 0.3 * n2(x * 0.06, z * 0.06);
        h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - BARN.x, z - BARN.z) - 24) / 18));
        h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - GARDEN.x, z - GARDEN.z) - 9) / 10));
        h = flatRect(h, x, z, VILLAGE, 2.4);
        h = water(n3, h, x, z, POND, -2.0);
        h = water(n4, h, x, z, LAKE, -3.2);
        return h + edgeLift(x, z);
      }
      return {
        name: 'Land', blurb: 'A farm, a village with houses to visit, a pond, a lake, and friendly people.', spawn: [10, -2],
        H, fog: [60, 260], water: {}, people: 5, village: true,
        grassH: [0.09, 0.22], grassTint: [0.2, 0.3, 0.55, 0.85], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xffffff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n4, x * 0.03, z * 0.03, 2) * 0.8 + 0.5); mix(o, c.dry, (n2(x * 0.012 + 9, z * 0.012) * 0.5 + 0.2) * 0.6);
          mix(o, c.dirt, (1 - smooth((Math.min(pathDist(x, z, PATH), pathDist(x, z, LAKEPATH)) - 0.35) / 0.9)) * 0.7);
          mix(o, c.gravel, (1 - smooth((roadD(x, z) - 1.6) / 1.1)) * 0.85);
          mix(o, c.dirt, smooth(1 - Math.hypot(x - BARN.x, z - BARN.z) / 13) * (0.55 + 0.3 * n4(x * 0.2, z * 0.2)));
          if (inGarden(x, z, 0.6)) mix(o, c.dirt, 0.8);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) {
          if (h < 0.3 || inGarden(x, z, 0.8)) return 0;
          let g = smooth((Math.min(pathDist(x, z, PATH), pathDist(x, z, LAKEPATH)) - 0.5) / 0.8) * smooth((roadD(x, z) - 1.8) / 0.8);
          g *= 0.25 + 0.75 * smooth((Math.hypot(x - BARN.x, z - BARN.z) - 9) / 10);
          return g * (0.75 + 0.25 * n3(x * 0.05, z * 0.05));
        },
        flowersAt(x, z, h) { return h < 0.5 || roadD(x, z) < 3 ? 0 : smooth((n3(x * 0.035 + 4, z * 0.035) - 0.15) / 0.3) * 0.55; },
        build(w) {
          w.addBarn(BARN);
          w.addGarden(GARDEN);
          w.fenceLine([[-76, -16], [-58, -10], [-40, -6], [-26, -2]]);
          w.fenceLine([[-78, -20], [-80, -44], [-76, -64], [-60, -72]]);
          // the village: three houses on each side of the street and the animal pound at the end
          const xs = [66, 90, 114];
          xs.forEach((x, i) => w.addHouse({ kind: 'house', variant: i % 5, x, z: -69, rot: 0 }));
          xs.forEach((x, i) => w.addHouse({ kind: 'house', variant: (i + 3) % 5, x: x + 4, z: -41, rot: Math.PI }));
          w.addHouse({ kind: 'pound', x: 142, z: -55, rot: -Math.PI / 2 });
          w.addSign('Maple Street', 50, -60, Math.PI / 2);
          const away = (x, z, d = 3) => Math.hypot(x - BARN.x, z - BARN.z) > 28 && !inGarden(x, z, 4) && pathDist(x, z, PATH) > d && roadD(x, z) > d + 1 && !inVillage(x, z, 3) && pathDist(x, z, LAKEPATH) > d;
          w.scatter({ type: 'hay', n: 6, sample: (r) => { const a = r() * TAU, d = 11 + r() * 8; return [BARN.x + Math.cos(a) * d, BARN.z + Math.sin(a) * d]; }, test: (x, z) => pathDist(x, z, PATH) > 2.5 && !inGarden(x, z, 2), gap: 3 });
          const orchard = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) orchard.push([22 + (i - 1) * 10, -92 + j * 10]);
          w.scatter({ type: 'apple', variants: [0, 1], n: orchard.length, sample: (r, k) => [orchard[k][0] + (r() - 0.5) * 2, orchard[k][1] + (r() - 0.5) * 2], gap: 3, spot: 'apple', spotR: 2.6, scale: [1.05, 1.3] });
          // street trees: maples along the village street
          const street = []; for (let x = 56; x <= 128; x += 12) street.push([x, -61.5], [x + 6, -48.5]);
          w.scatter({ type: 'maple', variants: [0, 1, 2], n: street.length, sample: (r, k) => [street[k][0] + (r() - 0.5), street[k][1] + (r() - 0.5) * 0.6], gap: 4, minH: 0, spot: 'acorn', spotR: 3, scale: [0.9, 1.05] });
          w.scatter({ type: 'giant', n: 1, sample: () => [-18, 34], gap: 16, spot: 'acorn', spotR: 9 });
          w.scatter({ type: 'oak', variants: [0, 1, 2], n: 46, test: away, gap: 11, spot: 'acorn', spotR: 4, minH: 0.7, scale: [1.1, 1.5] });
          w.scatter({ type: 'maple', variants: [0, 1, 2], n: 28, test: away, gap: 10, minH: 0.7, scale: [1.0, 1.3] });
          w.scatter({ type: 'birch', variants: [0, 1], n: 22, test: away, gap: 7, minH: 0.7, scale: [0.95, 1.2] });
          w.scatter({ type: 'willow', variants: [0, 1], n: 12, near: LAKE, nearR: 56, minH: 0.3, maxH: 1.6, gap: 12 });
          w.scatter({ type: 'willow', variants: [0, 1], n: 4, near: POND, nearR: 28, minH: 0.3, maxH: 1.6, gap: 12 });
          w.scatter({ type: 'pine', variants: [0, 1], n: 90, test: (x, z) => edgeZone(x, z, 34), gap: 6, spot: 'pinecone', spotR: 2.4, scale: [1.0, 1.4] });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 76, test: away, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 40, test: away, gap: 3, scale: [0.9, 1.5] });
          w.scatter({ type: 'stump', n: 8, test: away, gap: 4 });
          w.scatter({ type: 'log', n: 8, test: away, gap: 5 });
          w.scatter({ type: 'fern', n: 24, test: (x, z) => edgeZone(x, z, 46), gap: 2 });
          w.scatter({ type: 'cattail', n: 26, near: POND, nearR: 26, minH: -0.35, maxH: 0.22, gap: 1.5, scale: [0.8, 1.2] });
          w.scatter({ type: 'cattail', n: 44, near: LAKE, nearR: 54, minH: -0.35, maxH: 0.22, gap: 1.6, scale: [0.8, 1.25] });
          w.scatter({ type: 'lily', variants: [0, 0, 1], n: 18, near: POND, nearR: 22, minH: -9, maxH: -0.7, water: true, gap: 1.2, scale: [0.9, 1.5] });
          w.scatter({ type: 'lily', variants: [0, 0, 1], n: 40, near: LAKE, nearR: 46, minH: -9, maxH: -0.7, water: true, gap: 1.3, scale: [0.9, 1.6] });
          if (AUTUMN) {
            w.scatter({ type: 'pumpkin', variants: [0, 1, 2], n: 26, near: PATCH, nearR: PATCH.r, gap: 1.2, spot: 'pumpkin', spotR: 0.5, scale: [0.85, 1.15], sink: 0.02 });
            w.scatter({ type: 'cornstalk', n: 6, near: PATCH, nearR: PATCH.r + 3, gap: 2.2 });
            w.addScarecrow(PATCH.x + 2, PATCH.z - 2, 0.6);
            w.addScarecrow(GARDEN.x + 3, GARDEN.z + 1, 2.4);
          }
        },
        wildlife: [
          { sp: 'chicken', n: 4, kids: 2, home: [BARN.x + 12, BARN.z + 10], range: 11 },
          { sp: 'duck', n: 3, kids: 3, home: [POND.x, POND.z], range: 12, water: true },
          { sp: 'swan', n: 2, kids: 2, home: [LAKE.x, LAKE.z], range: 24, water: true },
          { sp: 'bunny', n: 4, kids: 1, home: [10, 50], range: 40 },
          { sp: 'deer', n: 3, kids: 1, home: [-100, -100], range: 40 },
          { sp: 'squirrel', n: 3, home: [22, -76], range: 18 },
          { sp: 'horse', n: 2, kids: 1, home: [-66, -30], range: 12 },
          { sp: 'pig', n: 2, kids: 2, home: [-62, -56], range: 8 },
          { sp: 'goat', n: 2, kids: 1, home: [-40, -22], range: 10 },
          { sp: 'otter', n: 2, home: [LAKE.x, LAKE.z], range: 30, water: true },
          { sp: 'raccoon', n: 1, home: [80, 20], range: 30 },
          { sp: 'hedgehog', n: 2, home: [30, -40], range: 30 },
        ],
        foods: { grass: 4, worm: 3, apple: 3, carrot: 3, berries: 3, acorn: 2, pinecone: 1, smallfish: 3, fish: 2, pumpkin: AUTUMN ? 2 : 0 },
        walk: [[10, -2], [-30, -12], [18, 16], [25, -70], [-50, -12], [70, -55], [100, -55], [126, -55], [40, 10], [-20, 30], [60, -30], [-60, 40]],
        villageWalk: [[60, -55], [80, -55], [100, -55], [120, -55], [130, -55]],
      };
    },

    forest(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const c = { moss: P(0x4a6a2c), deep: P(0x34501f), needle: P(0x66543a), rock: P(0x6f6c62), sand: P(0x8a7a58), mud: P(0x332d20) };
      const zc = (x) => 26 * Math.sin(x * 0.012 + 1) + 10 * Math.sin(x * 0.033) - 35;
      const ford = (x) => Math.max(gauss(x + 70, 8), gauss(x - 60, 8));
      const LAKE = { x: 70, z: 95, r: 32 };
      function H(x, z) {
        let h = 2 + 10 * (fbm(n1, x * 0.007, z * 0.007, 4) * 0.5 + 0.5) + 1.2 * n2(x * 0.05, z * 0.05);
        const d = Math.abs(z - zc(x)), deep = lerp(-1.4, 0.3, ford(x));
        h = lerp(h, deep, 1 - smooth((d - 4) / 9));
        h = water(n4, h, x, z, LAKE, -3);
        return h + edgeLift(x, z);
      }
      return {
        name: 'Forest', blurb: 'Tall pines, birches, mushrooms, a stream and a quiet lake.', spawn: [0, 16],
        H, fog: [34, 170], water: { color: 0x4f8fb0, deep: 0x1d3a4a }, people: 0,
        grassH: [0.07, 0.16], grassTint: [0.22, 0.3, 0.4, 0.7], flowerColors: [0xffffff, 0xd8c8ff],
        paint(o, x, z, h) {
          o.copy(c.moss); mix(o, c.needle, n2(x * 0.04, z * 0.04) * 0.6 + 0.45); mix(o, c.deep, n3(x * 0.1, z * 0.1) * 0.5 + 0.2);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.35 * smooth(n3(x * 0.03, z * 0.03) + 0.3); },
        flowersAt() { return 0.03; },
        build(w) {
          const clear = (x, z) => Math.hypot(x, z - 16) > 10;
          w.scatter({ type: 'pine', variants: [0, 1, 2], n: 520, test: clear, gap: 4.8, spot: 'pinecone', spotR: 2.4, minH: 0.6, scale: [1.0, 1.4] });
          w.scatter({ type: 'birch', variants: [0, 1], n: 46, test: clear, gap: 6, minH: 0.6 });
          w.scatter({ type: 'maple', variants: [0, 1, 2], n: 24, test: clear, gap: 9, minH: 0.6, scale: [1.0, 1.3] });
          w.scatter({ type: 'oak', variants: [0, 2], n: 30, test: clear, gap: 9, spot: 'acorn', spotR: 4, minH: 0.6, scale: [1.1, 1.5] });
          w.scatter({ type: 'willow', variants: [0, 1], n: 7, near: LAKE, nearR: 44, minH: 0.3, maxH: 1.6, gap: 12 });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 60, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'fern', n: 420, gap: 1.4, scale: [0.8, 1.4] });
          w.scatter({ type: 'mushroom', n: 110, gap: 1.5 });
          w.scatter({ type: 'stump', n: 40, test: clear, gap: 4 });
          w.scatter({ type: 'log', n: 36, test: clear, gap: 5 });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 90, test: clear, gap: 3, scale: [0.8, 1.8] });
          w.scatter({ type: 'rock', variants: [0, 1], n: 40, minH: -0.6, maxH: 0.3, gap: 2, scale: [0.6, 1.0], sample: (r) => { const x = (r() - 0.5) * 2 * HALF; return [x, zc(x) + (r() - 0.5) * 14]; } });
          w.scatter({ type: 'cattail', n: 30, near: LAKE, nearR: 42, minH: -0.35, maxH: 0.22, gap: 1.6 });
          w.scatter({ type: 'lily', variants: [0, 1], n: 24, near: LAKE, nearR: 36, minH: -9, maxH: -0.7, water: true, gap: 1.3, scale: [0.9, 1.5] });
        },
        wildlife: [
          { sp: 'squirrel', n: 6, home: [10, 30], range: 50 },
          { sp: 'deer', n: 4, kids: 1, home: [-60, 60], range: 50 },
          { sp: 'fox', n: 2, kids: 2, home: [60, 50], range: 50 },
          { sp: 'owl', n: 3, home: [-30, 30], range: 50 },
          { sp: 'frog', n: 3, home: [-70, zc(-70)], range: 10 },
          { sp: 'bunny', n: 3, kids: 1, home: [-50, 90], range: 30 },
          { sp: 'raccoon', n: 2, home: [30, -10], range: 40 },
          { sp: 'hedgehog', n: 2, home: [-20, 50], range: 30 },
          { sp: 'otter', n: 2, home: [LAKE.x, LAKE.z], range: 24, water: true },
          { sp: 'moose', n: 1, home: [LAKE.x - 30, LAKE.z - 20], range: 30 },
        ],
        foods: { pinecone: 4, acorn: 2, berries: 3, worm: 3, grass: 1, smallfish: 2, fish: 2 },
        walk: [],
      };
    },

    swamp(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2);
      const c = { mud: P(0x5a5130), moss: P(0x4c5b2a), sedge: P(0x75803c), wet: P(0x37331f), sand: P(0x5c5236), deep: P(0x221f14) };
      function H(x, z) {
        let h = 0.6 + 0.45 * fbm(n1, x * 0.016, z * 0.016, 3) + 0.25 * n2(x * 0.08, z * 0.08);
        const p = fbm(n3, x * 0.012 + 3, z * 0.012 - 2, 3);
        h = lerp(h, -1.1 - 0.6 * p, smooth((p - 0.04) / 0.16));
        const k = smooth(1 - (Math.hypot(x, z) - 9) / 10);
        h = lerp(h, Math.max(h, 0.6), k);
        return h + edgeLift(x, z) * 0.7;
      }
      return {
        name: 'Swamp', blurb: 'Muddy pools, willows, lily pads, turtles, and lots of fish.', spawn: [0, 0],
        H, fog: [26, 140], water: { swampy: true }, people: 0,
        grassH: [0.16, 0.38], grassTint: [0.13, 0.2, 0.35, 0.7], flowerColors: [0xffffff, 0xfff2a0],
        paint(o, x, z, h) {
          o.copy(c.mud); mix(o, c.moss, n2(x * 0.05, z * 0.05) * 0.6 + 0.5); mix(o, c.sedge, n1(x * 0.11, z * 0.11) * 0.5 + 0.1);
          if (h < 0.5) mix(o, c.wet, smooth((0.5 - h) / 0.4));
          shore(o, h, c.sand, c.deep);
        },
        grassAt(x, z, h) { return h < 0.2 ? 0 : 0.75; },
        flowersAt() { return 0.02; },
        build(w) {
          const clear = (x, z) => Math.hypot(x, z) > 9;
          w.scatter({ type: 'dead', variants: [0, 1], n: 100, test: clear, gap: 6, minH: -0.6 });
          w.scatter({ type: 'willow', variants: [0, 1], n: 34, test: clear, gap: 10, minH: 0.3 });
          w.scatter({ type: 'oak', variants: [1, 2], n: 16, test: clear, gap: 12, spot: 'acorn', spotR: 4, minH: 0.5, scale: [1.1, 1.4] });
          w.scatter({ type: 'cattail', n: 440, minH: -0.45, maxH: 0.25, gap: 1.4, scale: [0.8, 1.3] });
          w.scatter({ type: 'lily', variants: [0, 0, 0, 1], n: 260, minH: -9, maxH: -0.6, water: true, gap: 1.1, scale: [0.8, 1.6] });
          w.scatter({ type: 'log', n: 54, test: clear, gap: 4, minH: -0.5 });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 40, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'mushroom', n: 60, gap: 1.5 });
          w.scatter({ type: 'fern', n: 70, gap: 2 });
          w.scatter({ type: 'stump', n: 22, test: clear, gap: 4 });
        },
        wildlife: [
          { sp: 'frog', n: 9, home: [0, 0], range: 60 },
          { sp: 'turtle', n: 6, home: [30, -30], range: 60, water: true },
          { sp: 'snake', n: 4, home: [-30, 30], range: 50 },
          { sp: 'duck', n: 4, kids: 3, home: [40, 40], range: 50, water: true },
          { sp: 'otter', n: 2, home: [-40, -40], range: 50, water: true },
          { sp: 'raccoon', n: 2, home: [20, 50], range: 40 },
        ],
        foods: { worm: 4, grass: 2, berries: 1, acorn: 1, smallfish: 4, fish: 3 },
        walk: [],
      };
    },

    jungle(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const c = { g1: P(0x2f6a2c), g2: P(0x3f8a37), soil: P(0x6b4a2c), sand: P(0xc0a66a), mud: P(0x3a2e1e) };
      const xc = (z) => 30 * Math.sin(z * 0.013) + 12 * Math.sin(z * 0.035 + 2) + 48;
      const ford = (z) => Math.max(gauss(z + 50, 8), gauss(z - 70, 8));
      const LAG = { x: -50, z: 45, r: 17 };
      function H(x, z) {
        let h = 2 + 9 * (fbm(n1, x * 0.008, z * 0.008, 4) * 0.5 + 0.5) + 1.5 * n2(x * 0.04, z * 0.04);
        const d = Math.abs(x - xc(z)), deep = lerp(-1.8, 0.3, ford(z));
        h = lerp(h, deep, 1 - smooth((d - 6) / 10));
        h = water(n4, h, x, z, LAG, -2.2);
        return h + edgeLift(x, z);
      }
      return {
        name: 'Jungle', blurb: 'Giant leaves, palm trees, parrots, a river and a lagoon.', spawn: [-8, -8],
        H, fog: [24, 140], water: { color: 0x3fa3b8, deep: 0x124a52 }, people: 0,
        grassH: [0.12, 0.28], grassTint: [0.25, 0.33, 0.5, 0.8], flowerColors: [0xff3b6b, 0xffb020, 0xb44cf0, 0xff6a3d, 0xffffff],
        paint(o, x, z, h) { o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5); mix(o, c.soil, n3(x * 0.07, z * 0.07) * 0.5 - 0.05); shore(o, h, c.sand, c.mud); },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.55; },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : 0.2 * smooth(n3(x * 0.05, z * 0.05) + 0.2); },
        build(w) {
          const clear = (x, z) => Math.hypot(x + 8, z + 8) > 10;
          w.scatter({ type: 'giant', n: 2, sample: (r, k) => [[24, -30], [-70, -60]][k], gap: 16 });
          w.scatter({ type: 'palm', variants: [0, 1], n: 260, test: clear, gap: 5, spot: 'apple', spotR: 3, minH: 0.5, scale: [1.0, 1.35] });
          w.scatter({ type: 'bigleaf', n: 480, test: clear, gap: 2.2, scale: [0.9, 1.6] });
          w.scatter({ type: 'fern', n: 280, gap: 1.8, scale: [0.9, 1.5] });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 70, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 50, test: clear, gap: 3 });
          w.scatter({ type: 'log', n: 22, test: clear, gap: 5 });
          w.scatter({ type: 'mushroom', n: 30, gap: 2 });
          w.scatter({ type: 'lily', variants: [0, 1], n: 26, near: LAG, nearR: 18, minH: -9, maxH: -0.6, water: true, gap: 1.2, scale: [1, 1.6] });
        },
        wildlife: [
          { sp: 'parrot', n: 7, home: [-10, 10], range: 60 },
          { sp: 'lizard', n: 6, home: [0, -30], range: 50 },
          { sp: 'frog', n: 5, home: [LAG.x, LAG.z], range: 16 },
          { sp: 'turtle', n: 3, home: [LAG.x, LAG.z], range: 14, water: true },
          { sp: 'snake', n: 3, home: [20, 40], range: 40 },
          { sp: 'otter', n: 2, home: [xc(0), 0], range: 40, water: true },
        ],
        foods: { berries: 4, apple: 3, worm: 3, grass: 1, smallfish: 2, fish: 2 },
        walk: [],
      };
    },

    meadow(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const LAKE = { x: -70, z: -65, r: 34 }, POND = { x: 88, z: 72, r: 13 }, GIANT = [32, 34];
      const c = { g1: P(0x6c9e3a), g2: P(0x8fbd52), dry: P(0xa9c25e), sand: P(0xb3a070), mud: P(0x3d3826), dirt: P(0x7d6a48) };
      const PATH = [[-170, 30], [-80, 18], [-20, 6], [40, 12], [100, -8], [170, -20]];
      function H(x, z) {
        let h = 1.5 + 6 * (fbm(n1, x * 0.0065, z * 0.0065, 3) * 0.5 + 0.5) + 0.8 * n2(x * 0.03, z * 0.03);
        h = water(n3, h, x, z, LAKE, -2.6);
        h = water(n4, h, x, z, POND, -1.8);
        return h + edgeLift(x, z);
      }
      return {
        name: 'Meadow', blurb: 'Flowers everywhere, a giant tree, a lake, and people out for walks.', spawn: [8, 14],
        H, fog: [60, 260], water: {}, people: 3,
        grassH: [0.12, 0.3], grassTint: [0.2, 0.28, 0.5, 0.9], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xff7b5a, 0x8fb8ff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n2, x * 0.02, z * 0.02, 2) * 0.8 + 0.5); mix(o, c.dry, n3(x * 0.01, z * 0.01) * 0.5 + 0.15);
          mix(o, c.dirt, 1 - smooth((pathDist(x, z, PATH) - 0.6) / 1.0));
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.3 ? 0 : smooth((pathDist(x, z, PATH) - 0.7) / 0.8); },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : (0.35 + 0.65 * smooth((n3(x * 0.03, z * 0.03) + 0.1) / 0.4)) * smooth((pathDist(x, z, PATH) - 0.7) / 0.8); },
        build(w) {
          const off = (x, z) => pathDist(x, z, PATH) > 3 && Math.hypot(x - 8, z - 14) > 10 && Math.hypot(x - GIANT[0], z - GIANT[1]) > 16;
          w.scatter({ type: 'giant', n: 1, sample: () => GIANT, gap: 20, spot: 'acorn', spotR: 9 });
          w.scatter({ type: 'oak', variants: [0, 1, 2], n: 36, test: off, gap: 14, spot: 'acorn', spotR: 4, minH: 0.7, scale: [1.1, 1.5] });
          w.scatter({ type: 'maple', variants: [0, 1, 2], n: 20, test: off, gap: 12, minH: 0.7, scale: [1.0, 1.3] });
          w.scatter({ type: 'birch', variants: [0, 1], n: 26, test: off, gap: 8, minH: 0.7 });
          w.scatter({ type: 'apple', variants: [0, 1], n: 12, test: off, gap: 10, spot: 'apple', spotR: 2.6, minH: 0.7, scale: [1.05, 1.3] });
          w.scatter({ type: 'willow', variants: [0, 1], n: 9, near: LAKE, nearR: 46, minH: 0.3, maxH: 1.6, gap: 12 });
          w.scatter({ type: 'pine', variants: [0, 1], n: 70, test: (x, z) => edgeZone(x, z, 32), gap: 6, spot: 'pinecone', spotR: 2.4, scale: [1.0, 1.4] });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 80, test: off, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'rock', variants: [0, 1, 2], n: 30, test: off, gap: 4 });
          w.scatter({ type: 'hay', n: 8, test: off, gap: 6 });
          w.scatter({ type: 'cattail', n: 44, near: LAKE, nearR: 44, minH: -0.35, maxH: 0.22, gap: 1.5 });
          w.scatter({ type: 'cattail', n: 14, near: POND, nearR: 18, minH: -0.35, maxH: 0.22, gap: 1.5 });
          w.scatter({ type: 'lily', variants: [0, 0, 1], n: 30, near: LAKE, nearR: 36, minH: -9, maxH: -0.7, water: true, gap: 1.2, scale: [0.9, 1.5] });
          if (AUTUMN) w.scatter({ type: 'pumpkin', variants: [0, 1, 2], n: 10, test: off, gap: 6, spot: 'pumpkin', spotR: 0.5, sink: 0.02 });
        },
        wildlife: [
          { sp: 'bunny', n: 6, kids: 2, home: [20, 40], range: 50 },
          { sp: 'deer', n: 4, kids: 1, home: [60, -60], range: 50 },
          { sp: 'fox', n: 2, home: [-40, 70], range: 50 },
          { sp: 'swan', n: 2, kids: 2, home: [LAKE.x, LAKE.z], range: 18, water: true },
          { sp: 'duck', n: 3, kids: 3, home: [POND.x, POND.z], range: 8, water: true },
          { sp: 'squirrel', n: 3, home: [GIANT[0], GIANT[1]], range: 30 },
          { sp: 'goat', n: 3, kids: 1, home: [-30, 60], range: 30 },
          { sp: 'hedgehog', n: 2, home: [50, 10], range: 30 },
        ],
        foods: { grass: 4, berries: 3, apple: 2, acorn: 2, worm: 2, smallfish: 2, pumpkin: AUTUMN ? 1 : 0 },
        walk: [[8, 14], [-40, 14], [0, 4], [40, 12], [80, -4], [-30, 50], [30, -40], [-90, -10], [GIANT[0] + 12, GIANT[1]]],
      };
    },

    sky(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1);
      const ISL = [
        { x: 0, z: 0, r: 30, top: 0 }, { x: 64, z: -30, r: 17, top: 6 }, { x: -62, z: 32, r: 20, top: -3 },
        { x: 22, z: 74, r: 15, top: 10 }, { x: -36, z: -72, r: 16, top: 4 }, { x: 100, z: 40, r: 14, top: 15 },
        { x: -106, z: -18, r: 13, top: 9 }, { x: -8, z: -120, r: 14, top: 18 }, { x: 110, z: -96, r: 12, top: 22 }, { x: -96, z: 104, r: 15, top: 12 },
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
        name: 'Sky Lands', blurb: 'Islands in the clouds. Only grown-up animals that fly can go.', spawn: [0, 4], needsFly: true,
        H, islands: ISL, fog: [90, 420], water: null, people: 0,
        grassH: [0.1, 0.22], grassTint: [0.22, 0.32, 0.5, 0.95], flowerColors: [0xffffff, 0xffb6d9, 0xc9b6f7, 0xa8ebd8, 0xffe3a3],
        paint(o, x, z, h, under) {
          if (under) { o.copy(c.rock); mix(o, c.dark, under); return; }
          o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5);
        },
        grassAt(x, z, h) { return h < -100 ? 0 : 0.85; },
        flowersAt(x, z, h) { return h < -100 ? 0 : 0.45; },
        build(w) {
          const onIsland = (x, z) => ISL.some((I) => Math.hypot(x - I.x, z - I.z) < I.r - 3);
          w.scatter({ type: 'puff', variants: [0, 1, 2, 3], n: 56, test: (x, z) => onIsland(x, z) && Math.hypot(x, z - 4) > 8, gap: 6, minH: -100, spot: 'apple', spotR: 2.8, scale: [1.0, 1.4] });
          w.scatter({ type: 'bush', variants: [0, 1, 2], n: 30, test: onIsland, gap: 3.5, minH: -100, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] });
          w.scatter({ type: 'rock', variants: [0, 1], n: 16, test: onIsland, gap: 3, minH: -100 });
        },
        wildlife: [
          { sp: 'parrot', n: 6, home: [0, 0], range: 24 },
          { sp: 'swan', n: 2, home: [64, -30], range: 9 },
          { sp: 'owl', n: 2, home: [-62, 32], range: 12 },
        ],
        foods: { berries: 5, apple: 3, acorn: 1, worm: 1, grass: 2 },
        walk: [],
      };
    },
  };
  const SEEDS = { land: 11, forest: 23, swamp: 37, jungle: 41, meadow: 53, sky: 67 };
  const META = {}; for (const id of WORLD_ORDER) { const d = DEFS[id](SEEDS[id]); META[id] = { name: d.name, blurb: d.blurb, needsFly: !!d.needsFly }; }
  const HOUSE_COLORS = ['white', 'yellow', 'blue', 'brick', 'gray'];

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
      id, def, group, HALF, colliders: [], grid: new Map(), spots: { apple: [], acorn: [], pinecone: [], berries: [], carrot: [], pumpkin: [] },
      inst: new Map(), placed: new Map(), disposables: [], chunks: [], cover: [], trees: [], treeGrid: new Map(), houses: [], rooms: [], lanterns: [], blockers: [],
    };
    const r = rng(SEEDS[id] * 7 + 1);

    /* rooms (house interiors) sit off the map; everything else asks the terrain */
    w.roomAt = (x, z) => {
      if (x < ROOM_X - 20) return null;
      for (const rm of w.rooms) if (Math.abs(x - rm.ox) < rm.w / 2 + 0.6 && Math.abs(z - rm.oz) < rm.d / 2 + 0.6) return rm;
      return null;
    };
    w.H = (x, z) => (x > ROOM_X - 20 ? (w.roomAt(x, z) ? 0 : -1000) : H(x, z));
    w.ground = w.H;
    // keep a body of radius rad inside the map, or inside the room it is in
    w.clampXZ = (v, rad, room) => {
      if (room) { v.x = clamp(v.x, room.ox - room.w / 2 + rad + 0.15, room.ox + room.w / 2 - rad - 0.15); v.z = clamp(v.z, room.oz - room.d / 2 + rad + 0.15, room.oz + room.d / 2 - rad - 0.15); }
      else { const L = HALF - 4; v.x = clamp(v.x, -L, L); v.z = clamp(v.z, -L, L); }
      return v;
    };
    // is this height dry land you can stand on?
    w.dry = (h, margin = 0.2) => (def.water ? h > WATER + margin : h > -100);
    w.isWater = (x, z) => !def.islands && x < ROOM_X - 20 && H(x, z) < WATER;
    w.normal = (x, z, out) => { const e = 0.6; out.set(w.H(x - e, z) - w.H(x + e, z), 2 * e, w.H(x, z - e) - w.H(x, z + e)).normalize(); return out; };

    /* colliders */
    const gkey = (cx, cz) => cx * 4096 + cz;
    function addCollider(c) {
      w.colliders.push(c);
      const R = c.box ? Math.hypot(c.hw, c.hd) : c.r;
      for (let cx = Math.floor((c.x - R) / 8); cx <= Math.floor((c.x + R) / 8); cx++) for (let cz = Math.floor((c.z - R) / 8); cz <= Math.floor((c.z + R) / 8); cz++) {
        const k = gkey(cx, cz); let a = w.grid.get(k); if (!a) w.grid.set(k, (a = [])); a.push(c);
      }
    }
    w.addCollider = addCollider;
    // a box collider's co/si are cos/sin of its rotation.y (local to world: x' = x*co + z*si, z' = -x*si + z*co)
    w.collide = (pos, rad) => {
      const a = w.grid.get(gkey(Math.floor(pos.x / 8), Math.floor(pos.z / 8)));
      let hit = false;
      if (a) for (const c of a) {
        if (c.off) continue;
        if (c.box) {
          const dx = pos.x - c.x, dz = pos.z - c.z, lx = dx * c.co - dz * c.si, lz = dx * c.si + dz * c.co;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d < rad) {
            let nx, nz, push;
            if (d > 1e-4) { nx = ex / d; nz = ez / d; push = rad - d; }
            else { const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz); if (px < pz) { nx = Math.sign(lx) || 1; nz = 0; push = px + rad; } else { nx = 0; nz = Math.sign(lz) || 1; push = pz + rad; } }
            pos.x += (nx * c.co + nz * c.si) * push; pos.z += (-nx * c.si + nz * c.co) * push; hit = true;
          }
        } else {
          const dx = pos.x - c.x, dz = pos.z - c.z, d = Math.hypot(dx, dz), m = c.r + rad;
          if (d < m) { if (d < 1e-4) { pos.x += m; } else { pos.x += (dx / d) * (m - d); pos.z += (dz / d) * (m - d); } hit = true; }
        }
      }
      return hit;
    };
    // nearest climbable tree whose trunk surface is within maxD of (x, z)
    w.treeNear = (x, z, maxD) => {
      let best = null, bd = maxD;
      const cx = Math.floor(x / 8), cz = Math.floor(z / 8);
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) {
        const a = w.treeGrid.get(gkey(cx + i, cz + j)); if (!a) continue;
        for (const t of a) { const d = Math.hypot(x - t.x, z - t.z) - t.r; if (d < bd) { bd = d; best = t; } }
      }
      return best;
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
        else { x = (r() * 2 - 1) * (HALF + 26); z = (r() * 2 - 1) * (HALF + 26); }
        if (o.sample) k++;
        const h = H(x, z);
        if (h < minH || h > maxH) { if (o.sample && k >= o.n) break; continue; }
        if (!o.water && !o.near && !o.sample && Math.hypot(x - spawn[0], z - spawn[1]) < 7) continue;
        if (o.test && !o.test(x, z, h)) { if (o.sample && k >= o.n) break; continue; }
        if (!gapOK(x, z, gap)) { if (o.sample && k >= o.n) break; continue; }
        const variant = variants[(r() * variants.length) | 0];
        const s = s0 + r() * (s1 - s0), rot = r() * TAU;
        const y = o.water ? WATER + 0.005 : h - (o.sink || 0.05) * s;
        pushInst(o.type, variant, x, y, z, rot, s);
        markPlaced(x, z, gap);
        const pr = Env.prop(o.type, variant);
        if (pr.radius > 0) addCollider({ x, z, r: pr.radius * s });
        if (pr.climbH > 0) {
          const ox = (pr.climbX || 0) * s, oz = (pr.climbZ || 0) * s, co = Math.cos(rot), si = Math.sin(rot);
          const t = { x: x + ox * co + oz * si, z: z - ox * si + oz * co, r: Math.max(0.06, (pr.trunkR || 0.2) * s), top: y + pr.climbH * s, base: h, type: o.type };
          w.trees.push(t);
          const kk = gkey(Math.floor(t.x / 8), Math.floor(t.z / 8)); let a = w.treeGrid.get(kk); if (!a) w.treeGrid.set(kk, (a = [])); a.push(t);
        }
        if (o.spot) w.spots[o.spot].push({ x, z, r: o.spotR * s, y: h });
        placed++;
        if (o.sample && k >= o.n) break;
      }
    };
    const shade = (g) => { g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g; };
    w.addObj = (g, x, z, rot, y) => { g.position.set(x, y !== undefined ? y : H(x, z), z); g.rotation.y = rot || 0; group.add(shade(g)); return g; };
    w.addBarn = (B) => {
      const g = Env.barn(); const y = H(B.x, B.z);
      g.position.set(B.x, y - 0.05, B.z); g.rotation.y = B.rot; group.add(shade(g));
      const sz = g.userData.size || { w: 10, d: 14 };
      w.blockers.push({ o: g, x: B.x, z: B.z, r: Math.hypot(sz.w, sz.d) / 2 + 1 });
      addCollider({ box: true, x: B.x, z: B.z, hw: sz.w / 2 + 0.1, hd: sz.d / 2 + 0.1, co: Math.cos(B.rot), si: Math.sin(B.rot) });
      markPlaced(B.x, B.z, 18);
      w.barn = { x: B.x, z: B.z, rot: B.rot, door: [B.x + Math.sin(B.rot) * (sz.d / 2 + 1.5), B.z + Math.cos(B.rot) * (sz.d / 2 + 1.5)] };
    };
    w.addGarden = (Gd) => {
      const g = Env.garden(Gd.w, Gd.d); const y = H(Gd.x, Gd.z);
      g.position.set(Gd.x, y, Gd.z); g.rotation.y = Gd.rot; group.add(shade(g));
      const co = Math.cos(Gd.rot), si = Math.sin(Gd.rot), rh = g.userData.rowHeight || 0.18;
      for (const row of g.userData.rows || []) for (let zz = row.z0 + 0.3; zz <= row.z1 - 0.3; zz += 0.55) {
        const wx = Gd.x + row.x * co + zz * si, wz = Gd.z - row.x * si + zz * co;
        w.spots.carrot.push({ x: wx, z: wz, y: y + rh * 0.85, r: 0 });
      }
      markPlaced(Gd.x, Gd.z, Math.max(Gd.w, Gd.d) + 2);
      const hw = Gd.w / 2 + 0.8, hd = Gd.d / 2 + 0.8;
      const corner = (lx, lz) => [Gd.x + lx * co + lz * si, Gd.z - lx * si + lz * co];
      w.fenceLine([corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(1.2, hd)]);
      w.fenceLine([corner(-1.2, hd), corner(-hw, hd), corner(-hw, -hd)]);
    };
    w.fenceLine = (pts, picket) => {
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        const segs = Math.max(1, Math.round(len / 3.2)), sl = len / segs, ang = Math.atan2(bz - az, bx - ax);
        for (let s = 0; s < segs; s++) {
          const x = ax + (bx - ax) * (s / segs), z = az + (bz - az) * (s / segs);
          const f = picket ? Env.picket(sl) : Env.fence(sl); f.position.set(x, H(x, z) - 0.04, z); f.rotation.y = -ang;
          group.add(shade(f));
          w.blockers.push({ o: f, x: x + (bx - ax) / segs / 2, z: z + (bz - az) / segs / 2, r: sl / 2 + 0.3 });
        }
      }
    };
    w.addSign = (text, x, z, rot) => w.addObj(Env.sign(text), x, z, rot);
    w.addScarecrow = (x, z, rot) => { w.addObj(Env.scarecrow(), x, z, rot); addCollider({ x, z, r: 0.25 }); };
    // local (house space) to world
    const toWorld = (hx, hz, rot, lx, lz) => [hx + lx * Math.cos(rot) + lz * Math.sin(rot), hz - lx * Math.sin(rot) + lz * Math.cos(rot)];
    w.addHouse = (spec) => {
      const pound = spec.kind === 'pound';
      const g = pound ? Env.pound() : Env.house(spec.variant);
      const ud = g.userData, y = H(spec.x, spec.z);
      g.position.set(spec.x, y - 0.03, spec.z); g.rotation.y = spec.rot; group.add(shade(g));
      addCollider({ box: true, x: spec.x, z: spec.z, hw: ud.hw, hd: ud.hd, co: Math.cos(spec.rot), si: Math.sin(spec.rot) });
      w.blockers.push({ o: g, x: spec.x, z: spec.z, r: Math.hypot(ud.w, ud.d) / 2 + 1 });
      markPlaced(spec.x, spec.z, Math.max(ud.w, ud.d) + 4);
      const [dx, dz] = toWorld(spec.x, spec.z, spec.rot, ud.outside.x, ud.outside.z);
      // its inside, far off the map
      const ig = pound ? Env.poundInterior() : Env.interior(spec.variant);
      const iu = ig.userData, ox = ROOM_X + w.rooms.length * 40, oz = 0;
      ig.position.set(ox, 0, oz); ig.visible = false; group.add(shade(ig));
      const room = { ox, oz, w: iu.w, d: iu.d, wallH: iu.wallH, group: ig, ud: iu, pound };
      const L = (p) => p && { x: ox + p.x, z: oz + p.z, y: p.y };
      room.spawn = { x: ox + iu.spawn.x * 0.8, z: oz + iu.spawn.z * 0.6, yaw: iu.spawn.yaw };
      room.exit = { x: ox + iu.exit.x, z: oz + iu.exit.z, r: iu.exit.r };
      room.petBed = L(iu.petBed); room.bowl = L(iu.bowl); room.water = L(iu.water); room.vet = L(iu.vet); room.desk = L(iu.desk);
      room.cages = (iu.cages || []).map((c) => ({ x: ox + c.x, z: oz + c.z, yaw: c.yaw, y: c.y || 0 }));
      room.pens = (iu.pens || []).map((p) => ({ x: ox + p.x, z: oz + p.z, w: p.w, d: p.d }));
      room.light = iu.light ? { x: ox + iu.light.x, y: iu.light.y, z: oz + iu.light.z } : { x: ox, y: 2.2, z: oz };
      room.ball = iu.ball || null;
      for (const c of iu.colliders || []) {
        if (c.box) addCollider({ box: true, x: ox + c.x, z: oz + c.z, hw: c.hw, hd: c.hd, co: Math.cos(c.rot || 0), si: Math.sin(c.rot || 0) });
        else addCollider({ x: ox + c.x, z: oz + c.z, r: c.r });
      }
      const rec = {
        id: w.houses.length, kind: spec.kind, pound, variant: spec.variant, x: spec.x, z: spec.z, rot: spec.rot, group: g,
        name: pound ? 'the animal pound' : `the ${HOUSE_COLORS[spec.variant]} house`,
        door: { x: dx, z: dz, yaw: spec.rot }, doorMesh: ud.door || null, room,
      };
      room.house = rec;
      w.rooms.push(room);
      w.houses.push(rec);
      if (!pound) {
        // front yard: picket fence with a gap at the walk; back yard: a pen for outdoor pets
        const fz = ud.d / 2 + 4.2, fw = ud.w / 2 + 2;
        const pts = (lx, lz) => toWorld(spec.x, spec.z, spec.rot, lx, lz);
        w.fenceLine([pts(-fw, fz), pts(-1.4, fz)], true);
        w.fenceLine([pts(1.4, fz), pts(fw, fz)], true);
        const pen = Env.pen(5, 4), [px, pz] = pts(-ud.w / 2 + 2.2, -ud.d / 2 - 4.5);
        w.addObj(pen, px, pz, spec.rot); w.blockers.push({ o: pen, x: px, z: pz, r: 3.6 });
        const [kx, kz] = pts(-ud.w / 2 + 3.6, -ud.d / 2 - 5.4);
        w.addObj(Env.kennel(), kx, kz, spec.rot);
        rec.pen = { x: px, z: pz, w: 5, d: 4, rot: spec.rot, kennel: { x: kx, z: kz } };
        for (const c of (pen.userData.colliders || [])) { const [cx2, cz2] = toWorld(px, pz, spec.rot, c.x, c.z); addCollider(c.box ? { box: true, x: cx2, z: cz2, hw: c.hw, hd: c.hd, co: Math.cos(spec.rot + (c.rot || 0)), si: Math.sin(spec.rot + (c.rot || 0)) } : { x: cx2, z: cz2, r: c.r }); }
        if (HOLIDAY === 'halloween') {
          const [jx, jz] = pts(1.1, ud.d / 2 + 1.6), [jx2, jz2] = pts(-1.1, ud.d / 2 + 1.6);
          w.lanterns.push(w.addObj(Env.jackolantern(0.42), jx, jz, spec.rot + 0.2));
          w.lanterns.push(w.addObj(Env.jackolantern(0.34), jx2, jz2, spec.rot - 0.25));
          const [ckx, ckz] = pts(ud.w / 2 - 0.6, ud.d / 2 + 0.8);
          pushInst('cornstalk', 0, ckx, H(ckx, ckz) - 0.05, ckz, spec.rot, 0.9);
          const [pkx, pkz] = pts(-ud.w / 2 + 1.2, ud.d / 2 + 2.6);
          pushInst('pumpkin', 2, pkx, H(pkx, pkz) - 0.02, pkz, spec.rot + 1, 1);
          rec.treat = true;
        }
      } else {
        const [sx, sz] = toWorld(spec.x, spec.z, spec.rot, ud.w / 2 + 1.5, ud.d / 2 + 2.5);
        w.addSign('Animal Pound and Vet', sx, sz, spec.rot);
      }
      return rec;
    };

    /* terrain */
    const tex = getDetail();
    const col = new THREE.Color();
    if (def.islands) buildIslands(); else buildTerrain();
    function buildTerrain() {
      const SEG = 230, size = EDGE * 2;
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
        const wm = Env.water(size + 240, def.water); wm.position.y = WATER; group.add(wm);
        w.disposables.push(wm.geometry);
        w.waterMesh = wm;
      }
    }
    function buildIslands() {
      for (const I of def.islands) {
        const RINGS = 12, SEGS = 56, DEPTH = I.r * 1.1;
        const pos = [], cols = [], uvs = [], idx = [];
        const nU = makeNoise(I.x * 13 + I.z);
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
        const strip = (rows) => {
          for (let j = 0; j < rows.length - 1; j++) for (let s = 0; s < SEGS; s++) {
            const a = rows[j][s], b = rows[j][(s + 1) % SEGS], c2 = rows[j + 1][s], d = rows[j + 1][(s + 1) % SEGS];
            idx.push(a, b, c2, b, d, c2);
          }
        };
        strip(top); strip(under);
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
      const small = !!SMALL[e.type];
      const byChunk = new Map();
      for (const it of e.items) {
        const cx = clamp(Math.floor((it[0] + EDGE) / CHS), 0, CH - 1), cz = clamp(Math.floor((it[2] + EDGE) / CHS), 0, CH - 1);
        const k = cx * CH + cz; let a = byChunk.get(k); if (!a) byChunk.set(k, (a = [])); a.push(it);
      }
      for (const [k, items] of byChunk) {
        const cx = Math.floor(k / CH), cz = k % CH;
        const center = new THREE.Vector3(-EDGE + (cx + 0.5) * CHS, 4, -EDGE + (cz + 0.5) * CHS);
        const sphere = new THREE.Sphere(center, CHS * 0.72 + 16);
        for (const part of pr.parts) {
          const src = part.geometry, g = new THREE.BufferGeometry();
          for (const name in src.attributes) g.setAttribute(name, src.attributes[name]);
          if (src.index) g.setIndex(src.index);
          for (const gr of src.groups) g.addGroup(gr.start, gr.count, gr.materialIndex);
          g.boundingSphere = sphere;
          g.boundingBox = new THREE.Box3().setFromCenterAndSize(center, new THREE.Vector3(CHS + 48, 80, CHS + 48));
          const im = new THREE.InstancedMesh(g, part.material, items.length);
          items.forEach((it, i) => {
            dummy.position.set(it[0], it[1], it[2]); dummy.rotation.set(0, it[3], 0); dummy.scale.set(it[4], it[5], it[4]); dummy.updateMatrix();
            im.setMatrixAt(i, dummy.matrix);
          });
          im.name = e.type; im.castShadow = !!part.castShadow; im.receiveShadow = true;
          if (part.depthMaterial) im.customDepthMaterial = part.depthMaterial;
          group.add(im);
          w.chunks.push({ mesh: im, center, small });
          w.disposables.push(g);
        }
      }
    }

    /* ground cover: grass blades and flowers generated around the viewer */
    const Gr = Env.grass();
    patchGrass(Gr.material);
    w.cover.push(makeCover({
      geo: Gr.geometry, mat: Gr.material, cap: 9000, cell: 2, radius: 22,
      gen(cx, cz, out) {
        if (cx * 2 > ROOM_X - 40) return;
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
          if (cx * 4 > ROOM_X - 40) return;
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

    w.room = null;
    w.setRoom = (room) => { w.room = room; for (const rm of w.rooms) rm.group.visible = rm === room; };
    w.updateView = (camPos, px, pz, far, size) => {
      const k = clamp(size || 1, 0.2, 3);
      const inside = !!w.room;
      for (const c of w.cover) c.mesh.visible = !inside;
      if (!inside) {
        w.cover[0].update(px, pz, clamp(8 + k * 7, 9, 22));
        for (let i = 1; i < w.cover.length; i++) w.cover[i].update(px, pz, clamp(13 + k * 7, 14, 28));
      }
      const lim = far + CHS * 0.72 + 8, limS = 70 + CHS * 0.72;
      for (const ch of w.chunks) ch.mesh.visible = !inside && Math.hypot(ch.center.x - camPos.x, ch.center.z - camPos.z) < (ch.small ? limS : lim);
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
        if (wantWater ? (!!def.water && h < WATER - 0.55) : w.dry(h)) {
          if (!wantWater) { tmpRing.set(x, 0, z); if (w.collide(tmpRing, 0.3)) continue; }
          return { x, z, h };
        }
      }
      return null;
    };
    const tmpRing = new THREE.Vector3();
    w.foodPoint = (type, cx, cz, r0, r1) => {
      const spotType = { apple: 'apple', acorn: 'acorn', pinecone: 'pinecone', berries: 'berries', carrot: 'carrot', pumpkin: 'pumpkin' }[type];
      if (FOODS[type].water) { const p = w.ringPoint(cx, cz, r0, r1, true); return p ? { x: p.x, z: p.z, y: WATER - 0.22 - Math.random() * 0.15 } : null; }
      if (spotType) {
        const list = w.spots[spotType].filter((s) => { const d = Math.hypot(s.x - cx, s.z - cz); return d > r0 - s.r && d < r1 + s.r; });
        if (list.length) {
          for (let k = 0; k < 8; k++) {
            const s = list[(Math.random() * list.length) | 0];
            if (spotType === 'carrot') return { x: s.x, z: s.z, y: s.y };
            const a = Math.random() * TAU, d = (spotType === 'berries' ? 0.75 + Math.random() * 0.35 : 0.5 + Math.sqrt(Math.random()) * 0.9) * (s.r || 1);
            const x = s.x + Math.cos(a) * d, z = s.z + Math.sin(a) * d, h = H(x, z);
            tmpRing.set(x, 0, z);
            if (w.dry(h, 0.15) && !w.collide(tmpRing, 0.15)) return { x, z, y: h };
          }
        }
        if (spotType === 'carrot' || spotType === 'pumpkin') return null;
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

  return { build, META, HALF, PUSH, ROOM_X };
})();
