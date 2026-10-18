/* ---------- worlds: endless terrain in tiles, water, plants, farms, colliders, houses, ground cover ---------- */
const World = (() => {
  const TILE = 64, TSEG = 32;   // terrain and plants are made in 64 m tiles around the player
  const RS = 256;               // landmark regions: away from the middle each one may hold a lake, a pond, a farm...
  const CORE = 200;             // the hand-made middle of each world (its own lakes, farm and village)
  const ROOM_X = 50000;         // the insides of houses and barns live far away at x >= ROOM_X
  const DYN_X = ROOM_X + 4000;  // the inside of a building out in the wilds (one at a time)
  const SHADOW_R = 48;          // plants closer than this cast shadows
  const SMALL = { rock: 1, fern: 1, mushroom: 1, stump: 1, log: 1, cattail: 1, lily: 1, pumpkin: 1, cornstalk: 1, hay: 1 };
  const dummy = new THREE.Object3D();

  /* ---- shape helpers ---- */
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
  // local coordinates inside a rotated rectangle (same rotation sense as object.rotation.y)
  const toLocal = (R, x, z) => { const dx = x - R.x, dz = z - R.z, c = Math.cos(R.rot || 0), s = Math.sin(R.rot || 0); return [dx * c - dz * s, dx * s + dz * c]; };
  const toWorld = (hx, hz, rot, lx, lz) => [hx + lx * Math.cos(rot) + lz * Math.sin(rot), hz - lx * Math.sin(rot) + lz * Math.cos(rot)];
  // flatten a (rotated) rectangle to height y with a soft edge
  function flatRect(h, x, z, R, y) {
    const [lx, lz] = R.rot ? toLocal(R, x, z) : [x - R.x, z - R.z];
    const d = Math.max(Math.abs(lx) - R.hw, Math.abs(lz) - R.hd, 0);
    return lerp(h, y, 1 - smooth(d / (R.soft || 12)));
  }
  const inRect = (R, x, z, pad = 0) => { const [lx, lz] = toLocal(R, x, z); return Math.abs(lx) < R.hw + pad && Math.abs(lz) < R.hd + pad; };
  const ring = (x, z) => Math.max(Math.abs(x), Math.abs(z));          // square distance from the middle
  const outer = (x, z, a, b) => smooth((ring(x, z) - a) / (b - a));     // 0 in the middle, 1 far out
  // is there water a few meters away? (for willows and reeds)
  const nearWater = (x, z, h, H) => H(x + 7, z) < 0 || H(x - 7, z) < 0 || H(x, z + 7) < 0 || H(x, z - 7) < 0;

  /* ---- world definitions ----
     H: the ground height (landmarks out in the wilds are added on top by build())
     build(w): the hand-made middle (structures and placed plants)
     rules: plants scattered everywhere, tile by tile ("per" = how many per 64 m tile at full strength)
     landmarks: what each 256 m region away from the middle may hold
     ambient: wild animals that show up around you out in the wilds */
  const DEFS = {
    land(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3), n5 = makeNoise(seed + 4);
      const BARN = { x: -52, z: -40, rot: 0.4 }, GARDEN = { x: -24, z: -62, w: 10, d: 8, rot: 0.4 };
      const POND = { x: 55, z: 55, r: 19 }, LAKE = { x: -105, z: 100, r: 42 }, PATCH = { x: -36, z: -88, r: 8 };
      const VILLAGE = { x: 100, z: -55, hw: 52, hd: 28, soft: 14 };
      // the farmyard: animals live in fenced pens around the barn
      const PADDOCK = { x: -75, z: -33, hw: 8, hd: 11, rot: 0 }, PIGPEN = { x: -64, z: -61, hw: 5, hd: 4, rot: 0.15 };
      const GOATPEN = { x: -30, z: -41, hw: 6, hd: 5, rot: 0.4 }, COOP = { x: -46, z: -64, hw: 4.5, hd: 3.5, rot: 0.4 };
      const PENS = [PADDOCK, PIGPEN, GOATPEN, COOP];
      const STREET = [[48, -55], [134, -55]];
      const PATH = [[-48, -25], [-30, -12], [-8, -4], [18, 16], [42, 40]];
      const ROAD = [[-8, -4], [20, -28], [48, -55], [134, -55]];
      const LAKEPATH = [[-30, -12], [-60, 30], [-78, 62]];
      const c = { g1: P(0x557f2e), g2: P(0x77a442), dry: P(0x9aa553), dirt: P(0x7d6345), gravel: P(0x8d8169), sand: P(0xae986a), mud: P(0x3b3524) };
      const gc = Math.cos(GARDEN.rot), gs = Math.sin(GARDEN.rot);
      const inGarden = (x, z, pad) => { const dx = x - GARDEN.x, dz = z - GARDEN.z, lx = dx * gc - dz * gs, lz = dx * gs + dz * gc; return Math.abs(lx) < GARDEN.w / 2 + pad && Math.abs(lz) < GARDEN.d / 2 + pad; };
      const inVillage = (x, z, pad) => Math.abs(x - VILLAGE.x) < VILLAGE.hw + pad && Math.abs(z - VILLAGE.z) < VILLAGE.hd + pad;
      const inPen = (x, z, pad) => PENS.some((R) => inRect(R, x, z, pad));
      const roadD = (x, z) => Math.min(pathDist(x, z, ROAD), pathDist(x, z, STREET));
      const woods = (x, z) => outer(x, z, 110, 200) * smooth((fbm(n5, x * 0.006, z * 0.006, 3) + 0.05) / 0.3);
      function H(x, z) {
        let h = 1.3 + 3.2 * (fbm(n1, x * 0.009, z * 0.009, 3) * 0.5 + 0.5) + 0.3 * n2(x * 0.06, z * 0.06);
        if (ring(x, z) < CORE + 20) {
          h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - BARN.x, z - BARN.z) - 24) / 18));
          h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - GARDEN.x, z - GARDEN.z) - 9) / 10));
          for (const R of PENS) h = flatRect(h, x, z, { x: R.x, z: R.z, hw: R.hw, hd: R.hd, rot: R.rot, soft: 8 }, 2.3);
          h = flatRect(h, x, z, VILLAGE, 2.4);
          h = water(n3, h, x, z, POND, -2.0);
          h = water(n4, h, x, z, LAKE, -3.2);
        }
        return h;
      }
      const away = (x, z, d = 3) => Math.hypot(x - BARN.x, z - BARN.z) > 28 && !inGarden(x, z, 4) && !inPen(x, z, 3) && pathDist(x, z, PATH) > d && roadD(x, z) > d + 1 && !inVillage(x, z, 3) && pathDist(x, z, LAKEPATH) > d;
      return {
        name: 'Land', blurb: 'A farm, a village with houses to visit, ponds and lakes, and it goes on and on.', spawn: [10, -2],
        H, fog: [60, 260], water: {}, people: 5, village: true,
        grassH: [0.09, 0.22], grassTint: [0.2, 0.3, 0.55, 0.85], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xffffff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n4, x * 0.03, z * 0.03, 2) * 0.8 + 0.5); mix(o, c.dry, (n2(x * 0.012 + 9, z * 0.012) * 0.5 + 0.2) * 0.6);
          if (ring(x, z) < CORE + 20) {
            mix(o, c.dirt, (1 - smooth((Math.min(pathDist(x, z, PATH), pathDist(x, z, LAKEPATH)) - 0.35) / 0.9)) * 0.7);
            mix(o, c.gravel, (1 - smooth((roadD(x, z) - 1.6) / 1.1)) * 0.85);
            mix(o, c.dirt, smooth(1 - Math.hypot(x - BARN.x, z - BARN.z) / 13) * (0.55 + 0.3 * n4(x * 0.2, z * 0.2)));
            if (inGarden(x, z, 0.6)) mix(o, c.dirt, 0.8);
            if (inRect(PIGPEN, x, z, -0.5)) mix(o, c.mud, 0.55);
            if (inRect(COOP, x, z, -0.3)) mix(o, c.dirt, 0.6);
          }
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) {
          if (h < 0.3) return 0;
          if (ring(x, z) > CORE + 20) return 0.75 + 0.25 * n3(x * 0.05, z * 0.05);
          if (inGarden(x, z, 0.8) || inRect(PIGPEN, x, z, 0) || inRect(COOP, x, z, 0)) return 0;
          let g = smooth((Math.min(pathDist(x, z, PATH), pathDist(x, z, LAKEPATH)) - 0.5) / 0.8) * smooth((roadD(x, z) - 1.8) / 0.8);
          g *= 0.25 + 0.75 * smooth((Math.hypot(x - BARN.x, z - BARN.z) - 9) / 10);
          return g * (0.75 + 0.25 * n3(x * 0.05, z * 0.05));
        },
        flowersAt(x, z, h) { return h < 0.5 || (ring(x, z) < CORE + 20 && roadD(x, z) < 3) ? 0 : smooth((n3(x * 0.035 + 4, z * 0.035) - 0.15) / 0.3) * 0.55; },
        build(w) {
          w.addBarn(BARN);
          w.addGarden(GARDEN);
          w.addEnclosure(Object.assign({ style: 'rail', gate: 'e', trough: true, shelter: true }, PADDOCK));
          w.addEnclosure(Object.assign({ style: 'split', gate: 'n', mud: true, shelter: true, trough: true }, PIGPEN));
          w.addEnclosure(Object.assign({ style: 'split', gate: 'w', platform: true, hay: true }, GOATPEN));
          w.addEnclosure(Object.assign({ style: 'wire', gate: 'n', coop: true }, COOP));
          // the village: three houses on each side of the street and the animal pound at the end
          const xs = [66, 90, 114];
          xs.forEach((x, i) => w.addHouse({ kind: 'house', variant: i % 5, x, z: -69, rot: 0, village: true }));
          xs.forEach((x, i) => w.addHouse({ kind: 'house', variant: (i + 3) % 5, x: x + 4, z: -41, rot: Math.PI, village: true }));
          w.addHouse({ kind: 'pound', x: 142, z: -55, rot: -Math.PI / 2 });
          w.addSign('Maple Street', 50, -60, Math.PI / 2);
          w.scatter({ type: 'hay', n: 6, sample: (r) => { const a = r() * TAU, d = 11 + r() * 8; return [BARN.x + Math.cos(a) * d, BARN.z + Math.sin(a) * d]; }, test: (x, z) => pathDist(x, z, PATH) > 2.5 && !inGarden(x, z, 2) && !inPen(x, z, 1.5), gap: 3 });
          const orchard = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) orchard.push([22 + (i - 1) * 10, -92 + j * 10]);
          w.scatter({ type: 'apple', variants: [0, 1], n: orchard.length, sample: (r, k) => [orchard[k][0] + (r() - 0.5) * 2, orchard[k][1] + (r() - 0.5) * 2], gap: 3, spot: 'apple', spotR: 2.6, scale: [1.05, 1.3] });
          const street = []; for (let x = 56; x <= 128; x += 12) street.push([x, -61.5], [x + 6, -48.5]);
          w.scatter({ type: 'maple', variants: [0, 1, 2], n: street.length, sample: (r, k) => [street[k][0] + (r() - 0.5), street[k][1] + (r() - 0.5) * 0.6], gap: 4, minH: 0, spot: 'acorn', spotR: 3, scale: [0.9, 1.05] });
          w.scatter({ type: 'giant', n: 1, sample: () => [-18, 34], gap: 16, spot: 'acorn', spotR: 9 });
          if (AUTUMN) {
            w.scatter({ type: 'pumpkin', variants: [0, 1, 2], n: 26, near: PATCH, nearR: PATCH.r, gap: 1.2, spot: 'pumpkin', spotR: 0.5, scale: [0.85, 1.15], sink: 0.02 });
            w.scatter({ type: 'cornstalk', n: 6, near: PATCH, nearR: PATCH.r + 3, gap: 2.2 });
            w.addScarecrow(PATCH.x + 2, PATCH.z - 2, 0.6);
            w.addScarecrow(GARDEN.x + 3, GARDEN.z + 1, 2.4);
          }
        },
        rules: [
          { type: 'oak', variants: [0, 1, 2], per: 1.2, test: away, gap: 11, spot: 'acorn', spotR: 4, minH: 0.7, scale: [1.1, 1.5], mask: (x, z) => 0.6 + 0.4 * woods(x, z) },
          { type: 'maple', variants: [0, 1, 2], per: 0.8, test: away, gap: 10, minH: 0.7, scale: [1.0, 1.3], mask: (x, z) => 0.6 + 0.4 * woods(x, z) },
          { type: 'birch', variants: [0, 1], per: 0.7, test: away, gap: 7, minH: 0.7, scale: [0.95, 1.2] },
          { type: 'pine', variants: [0, 1], per: 10, test: away, gap: 6, spot: 'pinecone', spotR: 2.4, minH: 0.6, scale: [1.0, 1.4], mask: woods },
          { type: 'apple', variants: [0, 1], per: 0.12, test: away, gap: 10, spot: 'apple', spotR: 2.6, minH: 0.7, scale: [1.05, 1.3] },
          { type: 'bush', variants: [0, 1, 2], per: 2.1, test: away, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] },
          { type: 'rock', variants: [0, 1, 2], per: 1.1, test: away, gap: 3, scale: [0.9, 1.5] },
          { type: 'stump', per: 0.25, test: away, gap: 4 },
          { type: 'log', per: 0.25, test: away, gap: 5 },
          { type: 'fern', per: 7, test: away, gap: 2, mask: woods },
          { type: 'willow', variants: [0, 1], per: 0.6, minH: 0.3, maxH: 1.6, gap: 12, test: nearWater, tries: 6 },
          { type: 'cattail', per: 26, minH: -0.35, maxH: 0.22, gap: 1.5, scale: [0.8, 1.25], tries: 4 },
          { type: 'lily', variants: [0, 0, 1], per: 10, minH: -9, maxH: -0.7, water: true, gap: 1.3, scale: [0.9, 1.6], tries: 2 },
        ],
        landmarks: { lake: 3, pond: 3, farm: 4, orchard: 1, giant: 1, none: 3 },
        wildlife: [
          { sp: 'chicken', n: 4, kids: 2, pen: COOP },
          { sp: 'duck', n: 3, kids: 3, home: [POND.x, POND.z], range: 12, water: true },
          { sp: 'swan', n: 2, kids: 2, home: [LAKE.x, LAKE.z], range: 24, water: true },
          { sp: 'bunny', n: 4, kids: 1, home: [10, 50], range: 40 },
          { sp: 'deer', n: 3, kids: 1, home: [-100, -100], range: 40 },
          { sp: 'squirrel', n: 3, home: [22, -76], range: 18 },
          { sp: 'horse', n: 2, kids: 1, pen: PADDOCK },
          { sp: 'pig', n: 2, kids: 2, pen: PIGPEN },
          { sp: 'goat', n: 2, kids: 1, pen: GOATPEN },
          { sp: 'otter', n: 2, home: [LAKE.x, LAKE.z], range: 30, water: true },
          { sp: 'raccoon', n: 1, home: [80, 20], range: 30 },
          { sp: 'hedgehog', n: 2, home: [30, -40], range: 30 },
        ],
        ambient: [{ sp: 'bunny', w: 3, kids: 1 }, { sp: 'deer', w: 2, kids: 1 }, { sp: 'squirrel', w: 2 }, { sp: 'fox', w: 1 }, { sp: 'raccoon', w: 1 }, { sp: 'hedgehog', w: 1 }, { sp: 'duck', w: 2, water: true, kids: 3 }, { sp: 'swan', w: 1, water: true }, { sp: 'otter', w: 1, water: true }],
        foods: { grass: 4, worm: 3, apple: 3, carrot: 3, berries: 3, acorn: 2, pinecone: 1, smallfish: 3, fish: 2, pumpkin: AUTUMN ? 2 : 0 },
        walk: [[10, -2], [-30, -12], [18, 16], [25, -70], [-50, -12], [70, -55], [100, -55], [126, -55], [40, 10], [-20, 30], [60, -30], [-60, 40]],
        villageWalk: [[60, -55], [80, -55], [100, -55], [120, -55], [130, -55]],
      };
    },

    forest(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const c = { moss: P(0x4a6a2c), deep: P(0x34501f), needle: P(0x66543a), rock: P(0x6f6c62), sand: P(0x8a7a58), mud: P(0x332d20) };
      const zc = (x) => 26 * Math.sin(x * 0.012 + 1) + 10 * Math.sin(x * 0.033) - 35;
      // shallow fords every 130 m along the stream
      const ford = (x) => { const u = ((x - 60) % 130 + 130) % 130; return gauss(Math.min(u, 130 - u), 8); };
      const LAKE = { x: 70, z: 95, r: 32 };
      function H(x, z) {
        let h = 2 + 10 * (fbm(n1, x * 0.007, z * 0.007, 4) * 0.5 + 0.5) + 1.2 * n2(x * 0.05, z * 0.05);
        const d = Math.abs(z - zc(x)), deep = lerp(-1.4, 0.3, ford(x));
        h = lerp(h, deep, 1 - smooth((d - 4) / 9));
        if (ring(x, z) < CORE + 20) h = water(n4, h, x, z, LAKE, -3);
        return h;
      }
      const clear = (x, z) => Math.hypot(x, z - 16) > 10;
      const stream = (x, z) => Math.abs(z - zc(x)) < 9;
      return {
        name: 'Forest', blurb: 'Tall pines, birches, mushrooms, a long stream and quiet lakes.', spawn: [0, 16],
        H, fog: [34, 170], water: { color: 0x4f8fb0, deep: 0x1d3a4a }, people: 0,
        grassH: [0.07, 0.16], grassTint: [0.22, 0.3, 0.4, 0.7], flowerColors: [0xffffff, 0xd8c8ff],
        paint(o, x, z, h) {
          o.copy(c.moss); mix(o, c.needle, n2(x * 0.04, z * 0.04) * 0.6 + 0.45); mix(o, c.deep, n3(x * 0.1, z * 0.1) * 0.5 + 0.2);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.35 * smooth(n3(x * 0.03, z * 0.03) + 0.3); },
        flowersAt() { return 0.03; },
        build() {},
        rules: [
          { type: 'pine', variants: [0, 1, 2], per: 14, test: clear, gap: 4.8, spot: 'pinecone', spotR: 2.4, minH: 0.6, scale: [1.0, 1.4] },
          { type: 'birch', variants: [0, 1], per: 1.2, test: clear, gap: 6, minH: 0.6 },
          { type: 'maple', variants: [0, 1, 2], per: 0.65, test: clear, gap: 9, minH: 0.6, scale: [1.0, 1.3] },
          { type: 'oak', variants: [0, 2], per: 0.8, test: clear, gap: 9, spot: 'acorn', spotR: 4, minH: 0.6, scale: [1.1, 1.5] },
          { type: 'willow', variants: [0, 1], per: 0.4, minH: 0.3, maxH: 1.6, gap: 12, test: (x, z, h, H2) => !stream(x, z) && nearWater(x, z, h, H2), tries: 6 },
          { type: 'bush', variants: [0, 1, 2], per: 1.6, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] },
          { type: 'fern', per: 11, gap: 1.4, scale: [0.8, 1.4] },
          { type: 'mushroom', per: 3, gap: 1.5 },
          { type: 'stump', per: 1.1, test: clear, gap: 4 },
          { type: 'log', per: 1, test: clear, gap: 5 },
          { type: 'rock', variants: [0, 1, 2], per: 2.4, test: clear, gap: 3, scale: [0.8, 1.8] },
          { type: 'rock', variants: [0, 1], per: 5, minH: -0.6, maxH: 0.3, gap: 2, scale: [0.6, 1.0], test: stream, tries: 3 },
          { type: 'cattail', per: 18, minH: -0.35, maxH: 0.22, gap: 1.6, test: (x, z) => !stream(x, z), tries: 4 },
          { type: 'lily', variants: [0, 1], per: 8, minH: -9, maxH: -0.7, water: true, gap: 1.3, scale: [0.9, 1.5], test: (x, z) => !stream(x, z), tries: 2 },
        ],
        landmarks: { lake: 3, pond: 3, giant: 1, none: 4 },
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
        ambient: [{ sp: 'squirrel', w: 3 }, { sp: 'deer', w: 2, kids: 1 }, { sp: 'fox', w: 2 }, { sp: 'owl', w: 2 }, { sp: 'bunny', w: 2 }, { sp: 'raccoon', w: 1 }, { sp: 'hedgehog', w: 1 }, { sp: 'moose', w: 1 }, { sp: 'otter', w: 1, water: true }],
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
        return h;
      }
      const clear = (x, z) => Math.hypot(x, z) > 9;
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
        build() {},
        rules: [
          { type: 'dead', variants: [0, 1], per: 2.7, test: clear, gap: 6, minH: -0.6 },
          { type: 'willow', variants: [0, 1], per: 0.9, test: clear, gap: 10, minH: 0.3 },
          { type: 'oak', variants: [1, 2], per: 0.45, test: clear, gap: 12, spot: 'acorn', spotR: 4, minH: 0.5, scale: [1.1, 1.4] },
          { type: 'cattail', per: 12, minH: -0.45, maxH: 0.25, gap: 1.4, scale: [0.8, 1.3], tries: 3 },
          { type: 'lily', variants: [0, 0, 0, 1], per: 7, minH: -9, maxH: -0.6, water: true, gap: 1.1, scale: [0.8, 1.6], tries: 2 },
          { type: 'log', per: 1.45, test: clear, gap: 4, minH: -0.5 },
          { type: 'bush', variants: [0, 1, 2], per: 1.1, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] },
          { type: 'mushroom', per: 1.6, gap: 1.5 },
          { type: 'fern', per: 1.9, gap: 2 },
          { type: 'stump', per: 0.6, test: clear, gap: 4 },
        ],
        landmarks: { none: 1 },
        wildlife: [
          { sp: 'frog', n: 9, home: [0, 0], range: 60 },
          { sp: 'turtle', n: 6, home: [30, -30], range: 60, water: true },
          { sp: 'snake', n: 4, home: [-30, 30], range: 50 },
          { sp: 'duck', n: 4, kids: 3, home: [40, 40], range: 50, water: true },
          { sp: 'otter', n: 2, home: [-40, -40], range: 50, water: true },
          { sp: 'raccoon', n: 2, home: [20, 50], range: 40 },
        ],
        ambient: [{ sp: 'frog', w: 4 }, { sp: 'turtle', w: 3, water: true }, { sp: 'snake', w: 2 }, { sp: 'duck', w: 2, water: true, kids: 3 }, { sp: 'otter', w: 1, water: true }, { sp: 'raccoon', w: 1 }],
        foods: { worm: 4, grass: 2, berries: 1, acorn: 1, smallfish: 4, fish: 3 },
        walk: [],
      };
    },

    jungle(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3);
      const c = { g1: P(0x2f6a2c), g2: P(0x3f8a37), soil: P(0x6b4a2c), sand: P(0xc0a66a), mud: P(0x3a2e1e) };
      const xc = (z) => 30 * Math.sin(z * 0.013) + 12 * Math.sin(z * 0.035 + 2) + 48;
      const ford = (z) => { const u = ((z + 50) % 120 + 120) % 120; return gauss(Math.min(u, 120 - u), 8); };
      const LAG = { x: -50, z: 45, r: 17 };
      function H(x, z) {
        let h = 2 + 9 * (fbm(n1, x * 0.008, z * 0.008, 4) * 0.5 + 0.5) + 1.5 * n2(x * 0.04, z * 0.04);
        const d = Math.abs(x - xc(z)), deep = lerp(-1.8, 0.3, ford(z));
        h = lerp(h, deep, 1 - smooth((d - 6) / 10));
        if (ring(x, z) < CORE + 20) h = water(n4, h, x, z, LAG, -2.2);
        return h;
      }
      const clear = (x, z) => Math.hypot(x + 8, z + 8) > 10;
      return {
        name: 'Jungle', blurb: 'Giant leaves, palm trees, parrots, a long river and lagoons.', spawn: [-8, -8],
        H, fog: [24, 140], water: { color: 0x3fa3b8, deep: 0x124a52 }, people: 0,
        grassH: [0.12, 0.28], grassTint: [0.25, 0.33, 0.5, 0.8], flowerColors: [0xff3b6b, 0xffb020, 0xb44cf0, 0xff6a3d, 0xffffff],
        paint(o, x, z, h) { o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5); mix(o, c.soil, n3(x * 0.07, z * 0.07) * 0.5 - 0.05); shore(o, h, c.sand, c.mud); },
        grassAt(x, z, h) { return h < 0.35 ? 0 : 0.55; },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : 0.2 * smooth(n3(x * 0.05, z * 0.05) + 0.2); },
        build(w) {
          w.scatter({ type: 'giant', n: 2, sample: (r, k) => [[24, -30], [-70, -60]][k], gap: 16 });
        },
        rules: [
          { type: 'palm', variants: [0, 1], per: 7, test: clear, gap: 5, spot: 'apple', spotR: 3, minH: 0.5, scale: [1.0, 1.35] },
          { type: 'bigleaf', per: 12.8, test: clear, gap: 2.2, scale: [0.9, 1.6] },
          { type: 'fern', per: 7.5, gap: 1.8, scale: [0.9, 1.5] },
          { type: 'bush', variants: [0, 1, 2], per: 1.9, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] },
          { type: 'rock', variants: [0, 1, 2], per: 1.3, test: clear, gap: 3 },
          { type: 'log', per: 0.6, test: clear, gap: 5 },
          { type: 'mushroom', per: 0.8, gap: 2 },
          { type: 'lily', variants: [0, 1], per: 5, minH: -9, maxH: -0.6, water: true, gap: 1.2, scale: [1, 1.6], tries: 2 },
        ],
        landmarks: { lake: 2, giant: 2, none: 4 },
        wildlife: [
          { sp: 'parrot', n: 7, home: [-10, 10], range: 60 },
          { sp: 'lizard', n: 6, home: [0, -30], range: 50 },
          { sp: 'frog', n: 5, home: [LAG.x, LAG.z], range: 16 },
          { sp: 'turtle', n: 3, home: [LAG.x, LAG.z], range: 14, water: true },
          { sp: 'snake', n: 3, home: [20, 40], range: 40 },
          { sp: 'otter', n: 2, home: [xc(0), 0], range: 40, water: true },
        ],
        ambient: [{ sp: 'parrot', w: 4 }, { sp: 'lizard', w: 3 }, { sp: 'frog', w: 2 }, { sp: 'snake', w: 2 }, { sp: 'turtle', w: 1, water: true }, { sp: 'otter', w: 1, water: true }],
        foods: { berries: 4, apple: 3, worm: 3, grass: 1, smallfish: 2, fish: 2 },
        walk: [],
      };
    },

    meadow(seed) {
      const n1 = makeNoise(seed), n2 = makeNoise(seed + 1), n3 = makeNoise(seed + 2), n4 = makeNoise(seed + 3), n5 = makeNoise(seed + 4);
      const LAKE = { x: -70, z: -65, r: 34 }, POND = { x: 88, z: 72, r: 13 }, GIANT = [32, 34];
      const c = { g1: P(0x6c9e3a), g2: P(0x8fbd52), dry: P(0xa9c25e), sand: P(0xb3a070), mud: P(0x3d3826), dirt: P(0x7d6a48) };
      const PATH = [[-170, 30], [-80, 18], [-20, 6], [40, 12], [100, -8], [170, -20]];
      const woods = (x, z) => outer(x, z, 120, 210) * smooth((fbm(n5, x * 0.005, z * 0.005, 3) + 0.1) / 0.3);
      function H(x, z) {
        let h = 1.5 + 6 * (fbm(n1, x * 0.0065, z * 0.0065, 3) * 0.5 + 0.5) + 0.8 * n2(x * 0.03, z * 0.03);
        if (ring(x, z) < CORE + 20) { h = water(n3, h, x, z, LAKE, -2.6); h = water(n4, h, x, z, POND, -1.8); }
        return h;
      }
      const pathD = (x, z) => (Math.abs(x) < 175 ? pathDist(x, z, PATH) : 99);
      const off = (x, z) => pathD(x, z) > 3 && Math.hypot(x - 8, z - 14) > 10 && Math.hypot(x - GIANT[0], z - GIANT[1]) > 16;
      return {
        name: 'Meadow', blurb: 'Flowers everywhere, giant trees, lakes, farms, and people out for walks.', spawn: [8, 14],
        H, fog: [60, 260], water: {}, people: 3,
        grassH: [0.12, 0.3], grassTint: [0.2, 0.28, 0.5, 0.9], flowerColors: [0xffffff, 0xffe066, 0xc9a0ff, 0xff9ec4, 0xff7b5a, 0x8fb8ff],
        paint(o, x, z, h) {
          o.copy(c.g1); mix(o, c.g2, fbm(n2, x * 0.02, z * 0.02, 2) * 0.8 + 0.5); mix(o, c.dry, n3(x * 0.01, z * 0.01) * 0.5 + 0.15);
          mix(o, c.dirt, 1 - smooth((pathD(x, z) - 0.6) / 1.0));
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) { return h < 0.3 ? 0 : smooth((pathD(x, z) - 0.7) / 0.8); },
        flowersAt(x, z, h) { return h < 0.5 ? 0 : (0.35 + 0.65 * smooth((n3(x * 0.03, z * 0.03) + 0.1) / 0.4)) * smooth((pathD(x, z) - 0.7) / 0.8); },
        build(w) {
          w.scatter({ type: 'giant', n: 1, sample: () => GIANT, gap: 20, spot: 'acorn', spotR: 9 });
        },
        rules: [
          { type: 'oak', variants: [0, 1, 2], per: 1.0, test: off, gap: 14, spot: 'acorn', spotR: 4, minH: 0.7, scale: [1.1, 1.5] },
          { type: 'maple', variants: [0, 1, 2], per: 0.55, test: off, gap: 12, minH: 0.7, scale: [1.0, 1.3] },
          { type: 'birch', variants: [0, 1], per: 0.7, test: off, gap: 8, minH: 0.7 },
          { type: 'apple', variants: [0, 1], per: 0.32, test: off, gap: 10, spot: 'apple', spotR: 2.6, minH: 0.7, scale: [1.05, 1.3] },
          { type: 'pine', variants: [0, 1], per: 8, test: off, gap: 6, spot: 'pinecone', spotR: 2.4, scale: [1.0, 1.4], mask: woods },
          { type: 'bush', variants: [0, 1, 2], per: 2.1, test: off, gap: 3.5, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6] },
          { type: 'rock', variants: [0, 1, 2], per: 0.8, test: off, gap: 4 },
          { type: 'hay', per: 0.21, test: off, gap: 6 },
          { type: 'willow', variants: [0, 1], per: 0.5, minH: 0.3, maxH: 1.6, gap: 12, test: nearWater, tries: 6 },
          { type: 'cattail', per: 22, minH: -0.35, maxH: 0.22, gap: 1.5, tries: 4 },
          { type: 'lily', variants: [0, 0, 1], per: 9, minH: -9, maxH: -0.7, water: true, gap: 1.2, scale: [0.9, 1.5], tries: 2 },
          { type: 'pumpkin', variants: [0, 1, 2], per: AUTUMN ? 0.27 : 0, test: off, gap: 6, spot: 'pumpkin', spotR: 0.5, sink: 0.02 },
        ],
        landmarks: { lake: 2, pond: 3, farm: 3, giant: 2, none: 3 },
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
        ambient: [{ sp: 'bunny', w: 3, kids: 2 }, { sp: 'deer', w: 2, kids: 1 }, { sp: 'fox', w: 1 }, { sp: 'goat', w: 1 }, { sp: 'hedgehog', w: 1 }, { sp: 'squirrel', w: 1 }, { sp: 'swan', w: 1, water: true }, { sp: 'duck', w: 1, water: true, kids: 3 }],
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
      // height on one island at distance d from its middle
      const islandH = (I, x, z, d) => I.top + 1.4 * smooth(1 - d / I.r) + 0.5 * n1(x * 0.07, z * 0.07) - smooth((d - (I.r - 3)) / 3) * 1.2;
      function H(x, z) {
        for (const I of ISL) { const d = Math.hypot(x - I.x, z - I.z); if (d < I.r) return islandH(I, x, z, d); }
        return -1000;
      }
      return {
        name: 'Sky Lands', blurb: 'Islands in the clouds that go on forever. Only grown-up animals that fly can go.', spawn: [0, 4], needsFly: true,
        H, islands: ISL, islandH, fog: [90, 420], water: null, people: 0,
        grassH: [0.1, 0.22], grassTint: [0.22, 0.32, 0.5, 0.95], flowerColors: [0xffffff, 0xffb6d9, 0xc9b6f7, 0xa8ebd8, 0xffe3a3],
        paint(o, x, z, h, under) {
          if (under) { o.copy(c.rock); mix(o, c.dark, under); return; }
          o.copy(c.g1); mix(o, c.g2, n2(x * 0.05, z * 0.05) * 0.6 + 0.5);
        },
        grassAt(x, z, h) { return h < -100 ? 0 : 0.85; },
        flowersAt(x, z, h) { return h < -100 ? 0 : 0.45; },
        build() {},
        rules: [
          { type: 'puff', variants: [0, 1, 2, 3], per: 24, test: (x, z, h, H2, w) => w.onIsland(x, z, 3) && Math.hypot(x, z - 4) > 8, gap: 6, minH: -100, spot: 'apple', spotR: 2.8, scale: [1.0, 1.4], tries: 2 },
          { type: 'bush', variants: [0, 1, 2], per: 13, test: (x, z, h, H2, w) => w.onIsland(x, z, 3), gap: 3.5, minH: -100, spot: 'berries', spotR: 1.1, scale: [1.2, 1.6], tries: 2 },
          { type: 'rock', variants: [0, 1], per: 7, test: (x, z, h, H2, w) => w.onIsland(x, z, 3), gap: 3, minH: -100, tries: 1 },
        ],
        landmarks: { none: 1 },
        wildlife: [
          { sp: 'parrot', n: 6, home: [0, 0], range: 24 },
          { sp: 'swan', n: 2, home: [64, -30], range: 9 },
          { sp: 'owl', n: 2, home: [-62, 32], range: 12 },
        ],
        ambient: [{ sp: 'parrot', w: 3 }, { sp: 'owl', w: 1 }, { sp: 'swan', w: 1 }],
        foods: { berries: 5, apple: 3, acorn: 1, worm: 1, grass: 2 },
        walk: [],
      };
    },
  };
  const SEEDS = { land: 11, forest: 23, swamp: 37, jungle: 41, meadow: 53, sky: 67 };
  const META = {}; for (const id of WORLD_ORDER) { const d = DEFS[id](SEEDS[id]); META[id] = { name: d.name, blurb: d.blurb, needsFly: !!d.needsFly }; }
  const HOUSE_COLORS = ['white', 'yellow', 'blue', 'brick', 'gray'];
  const BUILT = { farm: 1, giant: 1, orchard: 1 };   // landmarks that place things (lakes and ponds only shape the ground)

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
    const def = DEFS[id](SEEDS[id]), seed = SEEDS[id];
    const group = new THREE.Group(), out = new THREE.Group();   // out holds everything outdoors; rooms sit beside it
    group.add(out);
    const isl = !!def.islands, H0 = def.H, nW = makeNoise(seed + 77);
    const newOwner = (key) => ({ key, items: new Map(), cols: [], trees: [], spots: [], objs: [], meshes: [] });
    const w = {
      id, def, group, out, grid: new Map(), spots: { apple: [], acorn: [], pinecone: [], berries: [], carrot: [], pumpkin: [] },
      placed: new Map(), disposables: [], cover: [], treeGrid: new Map(), houses: [], rooms: [], lanterns: [], blockers: [],
      gates: [], enclosures: [], anims: [], events: [], tiles: new Map(), feats: new Map(), own: null, stat: newOwner('static'), room: null,
    };
    const r = rng(seed * 7 + 1);
    const spawn = def.spawn;

    /* landmarks out in the wilds: one per 256 m region at most, decided by the region's own random seed */
    const LM = Object.entries(def.landmarks || { none: 1 }), lmSum = LM.reduce((s, [, v]) => s + v, 0);
    const regions = new Map();
    function region(i, j) {
      const k = (i + 4096) * 8192 + (j + 4096);
      let f = regions.get(k); if (f !== undefined) return f;
      f = null;
      const cx = (i + 0.5) * RS, cz = (j + 0.5) * RS;
      if (!isl && ring(cx, cz) - RS / 2 >= CORE + 30) {
        const rr = rng(hash2(i, j, seed * 31 + 7) * 4294967296);
        let pick = rr() * lmSum, kind = 'none';
        for (const [kk, v] of LM) { pick -= v; if (pick <= 0) { kind = kk; break; } }
        const x = cx + (rr() - 0.5) * RS * 0.45, z = cz + (rr() - 0.5) * RS * 0.45, y = H0(x, z);
        if (kind === 'lake') f = { kind, x, z, r: 26 + rr() * 22, depth: -3 };
        else if (kind === 'pond') f = { kind, x, z, r: 11 + rr() * 8, depth: -1.8 };
        else if (kind === 'farm' && y > 0.9 && y < 9) f = { kind, x, z, rot: Math.floor(rr() * 4) * Math.PI / 2 + (rr() - 0.5) * 0.5, y: Math.max(y, 1.2), hw: 32, hd: 26, variant: (rr() * 5) | 0, animal: rr() };
        else if ((kind === 'giant' || kind === 'orchard') && y > 0.8) f = { kind, x, z, rot: rr() * TAU, hw: 14, hd: 17 };
        if (f) { f.key = 'f' + k; f.reach = f.kind === 'lake' || f.kind === 'pond' ? f.r * 1.25 + 2 : f.kind === 'farm' ? Math.hypot(f.hw, f.hd) + 16 : 22; }
      }
      regions.set(k, f);
      return f;
    }
    const around = [];
    let aroundKey = null;
    function featsAround(x, z) {
      const i = Math.floor(x / RS), j = Math.floor(z / RS), k = i * 100003 + j;
      if (k === aroundKey) return around;
      aroundKey = k; around.length = 0;
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) { const f = region(i + a, j + b); if (f) around.push(f); }
      return around;
    }
    function Hland(x, z) {
      let h = H0(x, z);
      if (ring(x, z) < CORE + 10) return h;
      for (const f of featsAround(x, z)) {
        if (Math.abs(x - f.x) > f.reach || Math.abs(z - f.z) > f.reach) continue;
        if (f.kind === 'lake' || f.kind === 'pond') h = water(nW, h, x, z, f, f.depth);
        else if (f.kind === 'farm') h = flatRect(h, x, z, { x: f.x, z: f.z, hw: f.hw, hd: f.hd, rot: f.rot, soft: 14 }, f.y);
      }
      return h;
    }
    // is (x, z) taken by a building landmark? (plants stay out)
    function blockedAt(x, z) {
      if (isl || ring(x, z) < CORE + 10) return false;
      for (const f of featsAround(x, z)) {
        if (!BUILT[f.kind] || Math.abs(x - f.x) > f.reach || Math.abs(z - f.z) > f.reach) continue;
        if (f.kind === 'giant' ? Math.hypot(x - f.x, z - f.z) < 12 : inRect(f, x, z, 4)) return true;
      }
      return false;
    }

    /* sky islands: the hand-made ones in the middle plus one more in about a third of the tiles further out */
    const tileIsl = new Map();
    function islandsOf(tx, tz) {
      const k = (tx + 4096) * 8192 + (tz + 4096);
      let L = tileIsl.get(k); if (L) return L;
      L = def.islands.filter((I) => Math.floor(I.x / TILE) === tx && Math.floor(I.z / TILE) === tz);
      if (ring((tx + 0.5) * TILE, (tz + 0.5) * TILE) > CORE + 40) {
        const rr = rng(hash2(tx, tz, seed * 17 + 3) * 4294967296);
        if (rr() < 0.34) L.push({ x: (tx + 0.25 + rr() * 0.5) * TILE, z: (tz + 0.25 + rr() * 0.5) * TILE, r: 10 + rr() * 13, top: -8 + rr() * 30 });
      }
      tileIsl.set(k, L);
      return L;
    }
    function islandAt(x, z) {
      const tx = Math.floor(x / TILE), tz = Math.floor(z / TILE);
      for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const I of islandsOf(tx + a, tz + b)) if (Math.hypot(x - I.x, z - I.z) < I.r) return I;
      return null;
    }
    function Hsky(x, z) { const I = islandAt(x, z); return I ? def.islandH(I, x, z, Math.hypot(x - I.x, z - I.z)) : -1000; }
    w.onIsland = (x, z, pad = 0) => { const I = islandAt(x, z); return !!I && Math.hypot(x - I.x, z - I.z) < I.r - pad; };
    const H = isl ? Hsky : Hland;

    /* rooms (house and barn insides) sit far off the map; everything else asks the terrain */
    w.roomAt = (x, z) => {
      if (x < ROOM_X - 20) return null;
      for (const rm of w.rooms) if (Math.abs(x - rm.ox) < rm.w / 2 + 0.6 && Math.abs(z - rm.oz) < rm.d / 2 + 0.6) return rm;
      return null;
    };
    w.H = (x, z) => (x > ROOM_X - 20 ? (w.roomAt(x, z) ? 0 : -1000) : H(x, z));
    w.ground = w.H;
    // keep a body of radius rad inside the room it is in (the outdoors goes on forever)
    w.clampXZ = (v, rad, room) => {
      if (room) { v.x = clamp(v.x, room.ox - room.w / 2 + rad + 0.15, room.ox + room.w / 2 - rad - 0.15); v.z = clamp(v.z, room.oz - room.d / 2 + rad + 0.15, room.oz + room.d / 2 - rad - 0.15); }
      return v;
    };
    // is this height dry land you can stand on?
    w.dry = (h, margin = 0.2) => (def.water ? h > WATER + margin : h > -100);
    w.isWater = (x, z) => !isl && x < ROOM_X - 20 && H(x, z) < WATER;
    w.normal = (x, z, out2) => { const e = 0.6; out2.set(w.H(x - e, z) - w.H(x + e, z), 2 * e, w.H(x, z - e) - w.H(x, z + e)).normalize(); return out2; };

    /* colliders, kept in an 8 m grid. Optional fields: h (height above c.y0, bodies higher up pass over), wild (only stops wild animals), off */
    const gkey = (cx, cz) => (cx + 1048576) * 2097152 + (cz + 1048576);
    function gridCells(c, fn) {
      const R = c.box ? Math.hypot(c.hw, c.hd) : c.r;
      for (let cx = Math.floor((c.x - R) / 8); cx <= Math.floor((c.x + R) / 8); cx++) for (let cz = Math.floor((c.z - R) / 8); cz <= Math.floor((c.z + R) / 8); cz++) fn(gkey(cx, cz));
    }
    function addCollider(c, owner) {
      if (c.box && c.co === undefined) { c.co = Math.cos(c.rot || 0); c.si = Math.sin(c.rot || 0); }
      gridCells(c, (k) => { let a = w.grid.get(k); if (!a) w.grid.set(k, (a = [])); a.push(c); });
      const o = owner || w.own; if (o) o.cols.push(c);
      return c;
    }
    function removeCollider(c) { gridCells(c, (k) => { const a = w.grid.get(k); if (a) { const i = a.indexOf(c); if (i >= 0) a.splice(i, 1); if (!a.length) w.grid.delete(k); } }); }
    w.addCollider = addCollider; w.removeCollider = removeCollider;
    // a box collider's co/si are cos/sin of its rotation.y (local to world: x' = x*co + z*si, z' = -x*si + z*co)
    w.collide = (pos, rad, y, wild) => {
      const a = w.grid.get(gkey(Math.floor(pos.x / 8), Math.floor(pos.z / 8)));
      let hit = false;
      if (a) for (const c of a) {
        if (c.off || (c.wild && !wild)) continue;
        if (c.h && y !== undefined && y > c.y0 + c.h) continue;
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
    /* climbable trees */
    function addTree(t, owner) {
      const k = gkey(Math.floor(t.x / 8), Math.floor(t.z / 8)); let a = w.treeGrid.get(k); if (!a) w.treeGrid.set(k, (a = [])); a.push(t);
      const o = owner || w.own; if (o) o.trees.push(t);
    }
    function removeTree(t) { const k = gkey(Math.floor(t.x / 8), Math.floor(t.z / 8)), a = w.treeGrid.get(k); if (a) { const i = a.indexOf(t); if (i >= 0) a.splice(i, 1); } }
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
    function addSpot(type, s, owner) { const o = owner || w.own; s.own = o ? o.key : null; w.spots[type].push(s); if (o) o.spots.push(type); }

    /* placement bookkeeping for hand-placed things (keeps big props apart) */
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

    /* plants and props are stored per owner (the middle, a tile, a landmark) as instance matrices */
    function pushInst(owner, type, variant, x, y, z, rot, s, sy) {
      const key = type + ':' + variant;
      let e = owner.items.get(key);
      if (!e) owner.items.set(key, (e = { type, variant, small: !!SMALL[type], xs: [], zs: [], ms: [] }));
      dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(s, sy || s, s); dummy.updateMatrix();
      e.xs.push(x); e.zs.push(z);
      const m = dummy.matrix.elements; for (let i = 0; i < 16; i++) e.ms.push(m[i]);
    }
    function finishOwner(o) { for (const e of o.items.values()) if (!(e.ms instanceof Float32Array)) e.ms = new Float32Array(e.ms); poolDirty = true; }
    function placeProp(owner, o, type, variant, x, z, h, s, rot) {
      const y = o.water ? WATER + 0.005 : h - (o.sink || 0.05) * s;
      pushInst(owner, type, variant, x, y, z, rot, s);
      const pr = Env.prop(type, variant);
      if (pr.radius > 0) addCollider({ x, z, r: pr.radius * s }, owner);
      if (pr.climbH > 0) {
        const ox = (pr.climbX || 0) * s, oz = (pr.climbZ || 0) * s, co = Math.cos(rot), si = Math.sin(rot);
        addTree({ x: x + ox * co + oz * si, z: z - ox * si + oz * co, r: Math.max(0.06, (pr.trunkR || 0.2) * s), top: y + pr.climbH * s, base: h, type }, owner);
      }
      if (o.spot) addSpot(o.spot, { x, z, r: o.spotR * s, y: h }, owner);
    }
    // hand-placed scatter for the middle of a world (near a point, or at listed spots)
    w.scatter = (o) => {
      const owner = w.own || w.stat;
      const variants = o.variants || [0];
      const [s0, s1] = o.scale || [0.85, 1.15];
      const minH = o.minH !== undefined ? o.minH : 0.35, maxH = o.maxH !== undefined ? o.maxH : 999;
      const gap = o.gap || 2;
      let placed = 0;
      for (let k = 0, tries = 0; placed < o.n && tries < o.n * 40; tries++) {
        let x, z;
        if (o.sample) { [x, z] = o.sample(r, k); k++; }
        else { const a = r() * TAU, d = Math.sqrt(r()) * o.nearR; x = o.near.x + Math.cos(a) * d; z = o.near.z + Math.sin(a) * d; }
        const h = H(x, z);
        const ok = h >= minH && h <= maxH && (!o.test || o.test(x, z, h, H, w)) && gapOK(x, z, gap);
        if (ok) {
          const variant = variants[(r() * variants.length) | 0], s = s0 + r() * (s1 - s0), rot = r() * TAU;
          placeProp(owner, o, o.type, variant, x, z, h, s, rot);
          markPlaced(x, z, gap);
          placed++;
        }
        if (o.sample && k >= o.n) break;
      }
    };

    /* buildings and fences */
    const shade = (g) => { g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } }); return g; };
    const addBlocker = (o, x, z, rad) => w.blockers.push({ o, x, z, r: rad, own: w.own });
    w.addObj = (g, x, z, rot, y) => { g.position.set(x, y !== undefined ? y : H(x, z), z); g.rotation.y = rot || 0; out.add(shade(g)); if (w.own) w.own.objs.push(g); return g; };
    let slot = 0;
    // build an inside for a house, barn or pound record, at room position ox
    function makeRoom(rec, ig, ox) {
      const iu = ig.userData;
      ig.position.set(ox, 0, 0); ig.visible = false; group.add(shade(ig));
      const room = { ox, oz: 0, w: iu.w, d: iu.d, wallH: iu.wallH, group: ig, ud: iu, pound: rec.kind === 'pound', barn: rec.kind === 'barn', house: rec, cols: [] };
      const L = (p) => p && { x: ox + p.x, z: p.z, y: p.y, yaw: p.yaw };
      const k = rec.kind === 'house' ? 0.6 : 1;   // a bit further into small rooms so the camera has space
      room.spawn = { x: ox + iu.spawn.x * (k === 1 ? 1 : 0.8), z: iu.spawn.z * k, yaw: iu.spawn.yaw };
      room.exit = { x: ox + iu.exit.x, z: iu.exit.z, r: iu.exit.r };
      room.petBed = L(iu.petBed); room.bowl = L(iu.bowl); room.water = L(iu.water); room.vet = L(iu.vet); room.desk = L(iu.desk); room.cageSpot = L(iu.cageSpot);
      room.cages = (iu.cages || []).map((c) => ({ x: ox + c.x, z: c.z, yaw: c.yaw, y: c.y || 0 }));
      room.pens = (iu.pens || []).map((p) => ({ x: ox + p.x, z: p.z, w: p.w, d: p.d, door: p.door, entry: p.entry ? { x: ox + p.entry.x, z: p.entry.z } : null, doorCol: null, rawCol: p.doorCollider || null }));
      room.stalls = (iu.stalls || []).map((p) => ({ x: ox + p.x, z: p.z, w: p.w, d: p.d, yaw: p.yaw, door: p.door, entry: p.entry ? { x: ox + p.entry.x, z: p.entry.z } : null }));
      room.light = iu.light ? { x: ox + iu.light.x, y: iu.light.y, z: iu.light.z } : { x: ox, y: 2.2, z: 0 };
      room.ball = iu.ball || null;
      const colOf = (c) => (c.box ? { box: true, x: ox + c.x, z: c.z, hw: c.hw, hd: c.hd, rot: c.rot || 0 } : { x: ox + c.x, z: c.z, r: c.r });
      for (const c of iu.colliders || []) room.cols.push(addCollider(colOf(c), null));
      for (const p of room.pens) if (p.rawCol) { p.doorCol = addCollider(colOf(p.rawCol), null); p.doorCol.off = true; room.cols.push(p.doorCol); }
      w.rooms.push(room); rec.room = room;
      return room;
    }
    function dropRoom(room) {
      for (const c of room.cols) removeCollider(c);
      group.remove(room.group);
      w.rooms.splice(w.rooms.indexOf(room), 1);
      if (room.house) room.house.room = null;
      if (room.extra) for (const o of room.extra) o.dispose && o.dispose();
    }
    // insides of buildings out in the wilds are made when you go in
    w.ensureRoom = (rec) => {
      if (rec.room) return rec.room;
      if (!rec.lazy) return null;
      const ig = rec.lazy === 'barn' ? (Env.barnInterior ? Env.barnInterior() : null) : Env.interior(rec.variant || 0);
      if (!ig) return null;
      if (w.dynRoom && w.dynRoom !== w.room) { dropRoom(w.dynRoom); w.dynRoom = null; }
      const room = makeRoom(rec, ig, DYN_X);
      w.dynRoom = room;
      return room;
    };
    w.addBarn = (B) => {
      const g = Env.barn(), y = H(B.x, B.z);
      g.position.set(B.x, y - 0.05, B.z); g.rotation.y = B.rot; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      const sz = g.userData.size || { w: 10, d: 14 };
      addBlocker(g, B.x, B.z, Math.hypot(sz.w, sz.d) / 2 + 1);
      addCollider({ box: true, x: B.x, z: B.z, hw: sz.w / 2 + 0.1, hd: sz.d / 2 + 0.1, co: Math.cos(B.rot), si: Math.sin(B.rot) });
      if (!w.own) markPlaced(B.x, B.z, 18);
      const outP = g.userData.outside || { x: 0, z: sz.d / 2 + 1.5 };
      const [dx, dz] = toWorld(B.x, B.z, B.rot, outP.x, outP.z);
      const rec = { id: w.houses.length, kind: 'barn', x: B.x, z: B.z, rot: B.rot, group: g, name: 'the barn', door: { x: dx, z: dz, yaw: B.rot }, room: null, own: w.own };
      if (!w.own) { w.barn = { x: B.x, z: B.z, rot: B.rot, door: [dx, dz] }; if (Env.barnInterior) makeRoom(rec, Env.barnInterior(), ROOM_X + (slot++) * 40); }
      else rec.lazy = 'barn';
      w.houses.push(rec);
      return rec;
    };
    w.addGarden = (Gd) => {
      const g = Env.garden(Gd.w, Gd.d); const y = H(Gd.x, Gd.z);
      g.position.set(Gd.x, y, Gd.z); g.rotation.y = Gd.rot; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      const co = Math.cos(Gd.rot), si = Math.sin(Gd.rot), rh = g.userData.rowHeight || 0.18;
      for (const row of g.userData.rows || []) for (let zz = row.z0 + 0.3; zz <= row.z1 - 0.3; zz += 0.55) {
        const wx = Gd.x + row.x * co + zz * si, wz = Gd.z - row.x * si + zz * co;
        addSpot('carrot', { x: wx, z: wz, y: y + rh * 0.85, r: 0 });
      }
      if (!w.own) markPlaced(Gd.x, Gd.z, Math.max(Gd.w, Gd.d) + 2);
      const hw = Gd.w / 2 + 0.8, hd = Gd.d / 2 + 0.8;
      const corner = (lx, lz) => toWorld(Gd.x, Gd.z, Gd.rot, lx, lz);
      w.fenceLine([corner(-hw, -hd), corner(hw, -hd), corner(hw, hd), corner(1.2, hd)]);
      w.fenceLine([corner(-1.2, hd), corner(-hw, hd), corner(-hw, -hd)]);
    };
    // a fence along a list of points. style: 'split' (default), 'rail', 'wire', 'stone', 'picket' (true also means picket)
    const FENCE_H = { split: 1.25, rail: 1.3, wire: 1.2, stone: 0.8, picket: 0.95 };
    w.fenceLine = (pts, style) => {
      if (style === true) style = 'picket';
      style = style || 'split';
      for (let i = 0; i < pts.length - 1; i++) {
        const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az);
        if (len < 0.3) continue;
        const segs = Math.max(1, Math.round(len / 3.2)), sl = len / segs, ang = Math.atan2(bz - az, bx - ax);
        for (let s = 0; s < segs; s++) {
          const x = ax + (bx - ax) * (s / segs), z = az + (bz - az) * (s / segs);
          const f = style === 'picket' ? Env.picket(sl) : (style === 'split' ? Env.fence(sl) : Env.fence(sl, style));
          f.position.set(x, H(x, z) - 0.04, z); f.rotation.y = -ang;
          out.add(shade(f)); if (w.own) w.own.objs.push(f);
          const mx = x + (bx - ax) / segs / 2, mz = z + (bz - az) / segs / 2;
          addBlocker(f, mx, mz, sl / 2 + 0.3);
          const fh = (f.userData && f.userData.h) || FENCE_H[style] || 1.2, th = (f.userData && f.userData.thick) || (style === 'stone' ? 0.6 : 0.16);
          addCollider({ box: true, x: mx, z: mz, hw: sl / 2 + 0.05, hd: th / 2 + 0.05, co: Math.cos(ang), si: -Math.sin(ang), h: fh, y0: H(mx, mz) });
        }
      }
    };
    // a swinging gate from (ax, az) along angle ang; opens for the player, never lets penned animals out
    w.addGate = (ax, az, ang, len, style) => {
      const mx = ax + Math.cos(ang) * len / 2, mz = az + Math.sin(ang) * len / 2, y = H(mx, mz);
      let g = null;
      if (Env.gate) { g = Env.gate(len, style === 'stone' ? 'split' : style); g.position.set(ax, H(ax, az) - 0.04, az); g.rotation.y = -ang; out.add(shade(g)); if (w.own) w.own.objs.push(g); addBlocker(g, mx, mz, len / 2 + 0.4); }
      const col = addCollider({ box: true, x: mx, z: mz, hw: len / 2, hd: 0.12, co: Math.cos(ang), si: -Math.sin(ang), h: 1.3, y0: y });
      if (!g) col.off = true;
      addCollider({ box: true, x: mx, z: mz, hw: len / 2, hd: 0.2, co: Math.cos(ang), si: -Math.sin(ang), wild: true });
      const gate = { obj: g, x: mx, z: mz, ang, len, t: 0, target: 0, col, own: w.own };
      w.gates.push(gate);
      return gate;
    };
    // a fenced pen: E = { x, z, hw, hd, rot, style, gate: 'n'|'s'|'e'|'w', and extras: mud, shelter, trough, platform, coop, hay, kennel }
    w.addEnclosure = (E) => {
      const rot = E.rot || 0, Pt = (lx, lz) => toWorld(E.x, E.z, rot, lx, lz);
      const hw = E.hw, hd = E.hd, gl = E.gateLen || Math.min(2, Math.min(hw, hd) * 0.8);
      const sides = { s: [[-hw, -hd], [hw, -hd]], e: [[hw, -hd], [hw, hd]], n: [[hw, hd], [-hw, hd]], w: [[-hw, hd], [-hw, -hd]] };
      let gate = null;
      for (const k of ['s', 'e', 'n', 'w']) {
        const [[ax, az], [bx, bz]] = sides[k];
        if (k !== E.gate) { w.fenceLine([Pt(ax, az), Pt(bx, bz)], E.style); continue; }
        const L = Math.hypot(bx - ax, bz - az), ux = (bx - ax) / L, uz = (bz - az) / L, g0 = L / 2 - gl / 2, g1 = L / 2 + gl / 2;
        w.fenceLine([Pt(ax, az), Pt(ax + ux * g0, az + uz * g0)], E.style);
        w.fenceLine([Pt(ax + ux * g1, az + uz * g1), Pt(bx, bz)], E.style);
        const [gx, gz] = Pt(ax + ux * g0, az + uz * g0), [hx, hz] = Pt(ax + ux * g1, az + uz * g1);
        gate = w.addGate(gx, gz, Math.atan2(hz - gz, hx - gx), gl, E.style);
      }
      const put = (obj, lx, lz, r2, colR) => { if (!obj) return; const [x, z] = Pt(lx, lz); w.addObj(obj, x, z, rot + (r2 || 0)); if (colR) addCollider({ x, z, r: colR }); return obj; };
      const mk = (fn, ...a) => (Env[fn] ? Env[fn](...a) : null);
      if (E.mud) { const m = mk('mudPatch', Math.min(hw, hd) * 0.7); if (m) { const [x, z] = Pt(hw * 0.25, hd * 0.1); m.position.set(x, H(x, z) + 0.01, z); m.rotation.y = rot; out.add(m); if (w.own) w.own.objs.push(m); } }
      if (E.shelter) { const s = mk('shelter'); if (s) { put(s, 0, -hd + (s.userData.d || 3) / 2 + 0.3); for (const c of s.userData.colliders || []) { const [x, z] = Pt(c.x, -hd + (s.userData.d || 3) / 2 + 0.3 + c.z); addCollider(c.box ? { box: true, x, z, hw: c.hw, hd: c.hd, rot: rot + (c.rot || 0) } : { x, z, r: c.r }); } } }
      if (E.trough) put(mk('trough', 1.8), hw - 1.2, hd * 0.3, Math.PI / 2, 0.45);
      if (E.platform) put(mk('goatPlatform'), -hw * 0.4, -hd * 0.35, 0, 0.7);
      if (E.hay) put(mk('hayRack'), hw - 1, -hd + 1, 0, 0.5);
      if (E.coop) { const c = mk('coop'); if (c) { put(c, -hw + (c.userData.w || 2.4) / 2 + 0.3, -hd + (c.userData.d || 1.8) / 2 + 0.3); const [x, z] = Pt(-hw + (c.userData.w || 2.4) / 2 + 0.3, -hd + (c.userData.d || 1.8) / 2 + 0.3); addCollider({ box: true, x, z, hw: (c.userData.w || 2.4) / 2, hd: (c.userData.d || 1.8) / 2, rot }); } }
      if (!w.own) markPlaced(E.x, E.z, Math.hypot(hw, hd) * 2 + 2);
      const rec = { x: E.x, z: E.z, hw, hd, rot, gate, own: w.own };
      w.enclosures.push(rec);
      return rec;
    };
    w.addSign = (text, x, z, rot) => w.addObj(Env.sign(text), x, z, rot);
    w.addScarecrow = (x, z, rot) => { w.addObj(Env.scarecrow(), x, z, rot); addCollider({ x, z, r: 0.25 }); };
    w.addHouse = (spec) => {
      const pound = spec.kind === 'pound';
      const g = pound ? Env.pound() : Env.house(spec.variant);
      const ud = g.userData, y = H(spec.x, spec.z);
      g.position.set(spec.x, y - 0.03, spec.z); g.rotation.y = spec.rot; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      addCollider({ box: true, x: spec.x, z: spec.z, hw: ud.hw, hd: ud.hd, co: Math.cos(spec.rot), si: Math.sin(spec.rot) });
      addBlocker(g, spec.x, spec.z, Math.hypot(ud.w, ud.d) / 2 + 1);
      if (!w.own) markPlaced(spec.x, spec.z, Math.max(ud.w, ud.d) + 4);
      const [dx, dz] = toWorld(spec.x, spec.z, spec.rot, ud.outside.x, ud.outside.z);
      const rec = {
        id: w.houses.length, kind: spec.kind, pound, variant: spec.variant, village: !!spec.village, x: spec.x, z: spec.z, rot: spec.rot, group: g,
        name: pound ? 'the animal pound' : `the ${HOUSE_COLORS[spec.variant]} house`,
        door: { x: dx, z: dz, yaw: spec.rot }, doorMesh: ud.door || null, room: null, own: w.own,
      };
      if (w.own) rec.lazy = 'house';
      else makeRoom(rec, pound ? Env.poundInterior() : Env.interior(spec.variant), ROOM_X + (slot++) * 40);
      w.houses.push(rec);
      if (!pound) {
        // front yard: picket fence with a gap at the walk; back yard: a pen with a gate for outdoor pets
        const fz = ud.d / 2 + 4.2, fw = ud.w / 2 + 2;
        const pts = (lx, lz) => toWorld(spec.x, spec.z, spec.rot, lx, lz);
        w.fenceLine([pts(-fw, fz), pts(-1.4, fz)], 'picket');
        w.fenceLine([pts(1.4, fz), pts(fw, fz)], 'picket');
        const [px, pz] = pts(-ud.w / 2 + 2.6, -ud.d / 2 - 4.8);
        const enc = w.addEnclosure({ x: px, z: pz, hw: 2.6, hd: 2.1, rot: spec.rot, style: 'split', gate: 'n', gateLen: 1.4, trough: true });
        const [kx, kz] = pts(-ud.w / 2 + 3.9, -ud.d / 2 - 5.9);
        w.addObj(Env.kennel(), kx, kz, spec.rot);
        addCollider({ box: true, x: kx, z: kz, hw: 0.55, hd: 0.65, rot: spec.rot });
        rec.pen = { x: px, z: pz, w: 5.2, d: 4.2, rot: spec.rot, kennel: { x: kx, z: kz }, enc };
        // people come in through the gap in the picket fence
        const [wx, wz] = pts(0, fz + 1.3); rec.walk = { x: wx, z: wz }; rec.yard = { x: spec.x, z: spec.z, rot: spec.rot, d0: ud.d / 2, d1: fz, hw: fw };
        if (HOLIDAY === 'halloween') {
          const [jx, jz] = pts(1.1, ud.d / 2 + 1.6), [jx2, jz2] = pts(-1.1, ud.d / 2 + 1.6);
          w.lanterns.push(w.addObj(Env.jackolantern(0.42), jx, jz, spec.rot + 0.2));
          w.lanterns.push(w.addObj(Env.jackolantern(0.34), jx2, jz2, spec.rot - 0.25));
          const [ckx, ckz] = pts(ud.w / 2 - 0.6, ud.d / 2 + 0.8);
          pushInst(w.own || w.stat, 'cornstalk', 0, ckx, H(ckx, ckz) - 0.05, ckz, spec.rot, 0.9);
          const [pkx, pkz] = pts(-ud.w / 2 + 1.2, ud.d / 2 + 2.6);
          pushInst(w.own || w.stat, 'pumpkin', 2, pkx, H(pkx, pkz) - 0.02, pkz, spec.rot + 1, 1);
          rec.treat = true;
        }
      } else {
        const [sx, sz] = toWorld(spec.x, spec.z, spec.rot, ud.w / 2 + 1.5, ud.d / 2 + 2.5);
        w.addSign('Animal Pound and Vet', sx, sz, spec.rot);
      }
      return rec;
    };

    /* the hand-made middle */
    const tex = getDetail();
    const col = new THREE.Color();
    const terrMat = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex });
    w.disposables.push(terrMat);
    let poolDirty = true;
    def.build(w);
    finishOwner(w.stat);
    if (def.water) {
      const wm = Env.water(900, def.water); wm.position.y = WATER; out.add(wm);
      w.disposables.push(wm.geometry);
      w.waterMesh = wm;
    }

    /* ---- tiles ---- */
    const tkey = (tx, tz) => (tx + 1048576) * 2097152 + (tz + 1048576);
    function terrainMesh(t) {
      const N = TSEG, S = TILE / N, W = N + 3, x0 = t.x0, z0 = t.z0;
      const hs = new Float32Array(W * W);
      for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) hs[j * W + i] = H(x0 + (i - 1) * S, z0 + (j - 1) * S);
      const V = (N + 1) * (N + 1), pos = new Float32Array(V * 3), nor = new Float32Array(V * 3), cols = new Float32Array(V * 3), uvs = new Float32Array(V * 2);
      let v = 0;
      for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++, v++) {
        const x = x0 + i * S, z = z0 + j * S, h = hs[(j + 1) * W + i + 1];
        pos[v * 3] = x; pos[v * 3 + 1] = h; pos[v * 3 + 2] = z;
        const nx = hs[(j + 1) * W + i] - hs[(j + 1) * W + i + 2], nz = hs[j * W + i + 1] - hs[(j + 2) * W + i + 1], ny = 2 * S, L = Math.hypot(nx, ny, nz);
        nor[v * 3] = nx / L; nor[v * 3 + 1] = ny / L; nor[v * 3 + 2] = nz / L;
        def.paint(col, x, z, h);
        cols[v * 3] = col.r; cols[v * 3 + 1] = col.g; cols[v * 3 + 2] = col.b;
        uvs[v * 2] = x / 3.5; uvs[v * 2 + 1] = z / 3.5;
      }
      const idx = new Uint16Array(N * N * 6); let q = 0;
      for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
        const a = j * (N + 1) + i, b = a + 1, c2 = a + N + 1, d = c2 + 1;
        idx[q++] = a; idx[q++] = c2; idx[q++] = b; idx[q++] = b; idx[q++] = c2; idx[q++] = d;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      g.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
      g.setIndex(new THREE.BufferAttribute(idx, 1));
      g.computeBoundingSphere();
      const mesh = new THREE.Mesh(g, terrMat); mesh.receiveShadow = true;
      return mesh;
    }
    function islandMesh(I) {
      const RINGS = 12, SEGS = 56, DEPTH = I.r * 1.1;
      const pos = [], cols = [], uvs = [], idx = [];
      const nU = makeNoise(Math.round(I.x * 13 + I.z));
      const vtx = (x, y, z, under) => { def.paint(col, x, z, y, under); pos.push(x, y, z); cols.push(col.r, col.g, col.b); uvs.push(x / 3.5, z / 3.5); return pos.length / 3 - 1; };
      const top = [];
      for (let j = 0; j <= RINGS; j++) {
        const row = [];
        for (let s = 0; s < SEGS; s++) {
          const a = (s / SEGS) * TAU, rr = (j / RINGS) * (I.r - 0.05);
          const x = I.x + Math.cos(a) * rr, z = I.z + Math.sin(a) * rr;
          row.push(vtx(x, def.islandH(I, x, z, rr), z, 0));
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
      const mesh = new THREE.Mesh(g, terrMat); mesh.receiveShadow = true; mesh.castShadow = true;
      return mesh;
    }
    // plants for one tile, the same every time the tile is made
    function genPlants(t) {
      const rr = rng(hash2(t.tx, t.tz, seed * 13 + 5) * 4294967296);
      const local = [];
      const okGap = (x, z, gap) => { for (const p of local) { const m = (p.gap + gap) * 0.5; if (Math.abs(p.x - x) < m && Math.abs(p.z - z) < m && Math.hypot(p.x - x, p.z - z) < m) return false; } return gapOK(x, z, gap); };
      for (const o of def.rules) {
        const want = o.per || 0, n = Math.floor(want) + (rr() < want - Math.floor(want) ? 1 : 0);
        if (!n) continue;
        const tries = Math.ceil(n * (o.tries || 2.5));
        const variants = o.variants || [0], s0 = o.scale ? o.scale[0] : 0.85, s1 = o.scale ? o.scale[1] : 1.15;
        const minH = o.minH !== undefined ? o.minH : 0.35, maxH = o.maxH !== undefined ? o.maxH : 999, gap = o.gap || 2;
        let placed = 0;
        for (let k = 0; k < tries && placed < n; k++) {
          // draw every random number first so one failed test never changes the rest of the tile
          const x = t.x0 + rr() * TILE, z = t.z0 + rr() * TILE, vi = rr(), sr = rr(), rot = rr() * TAU, m = rr();
          const h = H(x, z);
          if (h < minH || h > maxH) continue;
          if (o.mask && m > o.mask(x, z, h)) continue;
          if (!o.water && Math.hypot(x - spawn[0], z - spawn[1]) < 7) continue;
          if (blockedAt(x, z)) continue;
          if (o.test && !o.test(x, z, h, H, w)) continue;
          if (!okGap(x, z, gap)) continue;
          placeProp(t, o, o.type, variants[(vi * variants.length) | 0], x, z, h, s0 + sr * (s1 - s0), rot);
          local.push({ x, z, gap }); placed++;
        }
      }
    }
    function loadTile(tx, tz, k) {
      const t = newOwner('t' + k); t.tx = tx; t.tz = tz; t.x0 = tx * TILE; t.z0 = tz * TILE;
      if (isl) { for (const I of islandsOf(tx, tz)) { const m = islandMesh(I); out.add(m); t.meshes.push(m); } }
      else { const m = terrainMesh(t); out.add(m); t.meshes.push(m); }
      genPlants(t);
      finishOwner(t);
      w.tiles.set(k, t);
    }
    function dropOwner(o) {
      for (const c of o.cols) removeCollider(c);
      for (const t of o.trees) removeTree(t);
      if (o.spots.length) for (const type of new Set(o.spots)) w.spots[type] = w.spots[type].filter((s) => s.own !== o.key);
      for (const m of o.meshes) { out.remove(m); m.geometry.dispose(); }
      for (const g of o.objs) out.remove(g);
      poolDirty = true;
    }
    function unloadTile(t, k) { dropOwner(t); w.tiles.delete(k); }

    /* ---- landmarks with things in them ---- */
    function buildFeature(f) {
      const own = newOwner(f.key); own.f = f; w.feats.set(f.key, own);
      w.own = own;
      if (f.kind === 'giant') placeProp(own, { spot: 'acorn', spotR: 9 }, 'giant', 0, f.x, f.z, H(f.x, f.z), 1, f.rot);
      else if (f.kind === 'orchard') {
        for (let i = 0; i < 3; i++) for (let j = 0; j < 4; j++) {
          const [x, z] = toWorld(f.x, f.z, f.rot, (i - 1) * 10, (j - 1.5) * 10), h = H(x, z);
          if (w.dry(h, 0.5)) placeProp(own, { spot: 'apple', spotR: 2.6 }, 'apple', (i + j) % 2, x, z, h, 1.05 + ((i * 7 + j * 3) % 5) * 0.06, i * 1.7 + j);
        }
      } else if (f.kind === 'farm') buildFarm(f, own);
      w.own = null;
      finishOwner(own);
    }
    // a farm out in the wilds: barn, farmhouse, a paddock with animals and a chicken coop
    function buildFarm(f) {
      const Pt = (lx, lz) => toWorld(f.x, f.z, f.rot, lx, lz);
      const [bx, bz] = Pt(-13, -8); w.addBarn({ x: bx, z: bz, rot: f.rot });
      const [hx, hz] = Pt(17, 13); w.addHouse({ kind: 'house', variant: f.variant, x: hx, z: hz, rot: f.rot + Math.PI });
      const pigs = f.animal > 0.75, goats = !pigs && f.animal > 0.45;
      const [px, pz] = Pt(13, -11);
      const pen = w.addEnclosure({ x: px, z: pz, hw: pigs ? 6 : 10, hd: pigs ? 5 : 8, rot: f.rot, style: pigs ? 'split' : 'rail', gate: 'w', trough: true, shelter: true, mud: pigs, platform: goats, hay: goats });
      const [cx, cz] = Pt(-12, 15);
      const coop = w.addEnclosure({ x: cx, z: cz, hw: 4, hd: 3.2, rot: f.rot, style: 'wire', gate: 'e', coop: true });
      for (let i = 0; i < 4; i++) { const [x, z] = Pt(-2 + i * 2.2, -16 - (i % 2)); placeProp(w.own, { sink: 0.05 }, 'hay', 0, x, z, H(x, z), 1, i); addCollider({ x, z, r: 0.7 }); }
      w.events.push({ kind: 'pen', own: w.own.key, pen, sp: pigs ? 'pig' : goats ? 'goat' : 'horse', n: pigs ? 2 : goats ? 3 : 2, kids: pigs ? 2 : 1 });
      w.events.push({ kind: 'pen', own: w.own.key, pen: coop, sp: 'chicken', n: 3, kids: 1 });
    }
    function unbuildFeature(own) {
      dropOwner(own);
      w.blockers = w.blockers.filter((b) => b.own !== own);
      w.gates = w.gates.filter((g) => g.own !== own);
      w.enclosures = w.enclosures.filter((e) => e.own !== own);
      for (const h of w.houses.filter((q) => q.own === own)) { if (h.room && h.room === w.dynRoom) { dropRoom(h.room); w.dynRoom = null; } }
      w.houses = w.houses.filter((h) => h.own !== own);
      w.lanterns = w.lanterns.filter((l) => !own.objs.includes(l));
      w.feats.delete(own.key);
      w.events.push({ kind: 'gone', own: own.key });
    }

    /* ---- what's drawn: one instanced mesh per plant kind and part, near ones cast shadows ---- */
    const pools = new Map();
    let poolX = 1e9, poolZ = 1e9, poolT = 0, poolFX = 0, poolFZ = 1;
    function makeIM(part, cap, shadow) {
      const im = new THREE.InstancedMesh(part.geometry, part.material, cap);
      im.frustumCulled = false; im.count = 0; im.castShadow = shadow && !!part.castShadow; im.receiveShadow = true;
      if (part.depthMaterial) im.customDepthMaterial = part.depthMaterial;
      out.add(im);
      return im;
    }
    const lists = new Map();
    // plants within reach and not behind the camera (a wide cone, so turning around doesn't show gaps before the next rebuild)
    function rebuildPools(px, pz, far, fx, fz) {
      poolX = px; poolZ = pz; poolFX = fx; poolFZ = fz; poolDirty = false; poolT = 0;
      const lim = far + 15, limS = 75;
      for (const L of lists.values()) { L.near.length = 0; L.far.length = 0; }
      const add = (o) => {
        for (const [key, e] of o.items) {
          let L = lists.get(key); if (!L) lists.set(key, (L = { e, near: [], far: [] }));
          const lm = e.small ? limS : lim;
          for (let i = 0; i < e.xs.length; i++) {
            const dx = e.xs[i] - px, dz = e.zs[i] - pz;
            if (Math.abs(dx) > lm || Math.abs(dz) > lm) continue;
            const d = Math.hypot(dx, dz); if (d > lm) continue;
            if (d > 40 && (dx * fx + dz * fz) < -0.3 * d) continue;
            (d < SHADOW_R ? L.near : L.far).push(e.ms, i * 16);
          }
        }
      };
      add(w.stat);
      for (const t of w.tiles.values()) add(t);
      for (const o of w.feats.values()) add(o);
      for (const [key, L] of lists) {
        const nN = L.near.length / 2, nF = L.far.length / 2;
        let p = pools.get(key);
        if (!p) { if (!nN && !nF) continue; const pr = Env.prop(L.e.type, L.e.variant); p = { cap: 0, parts: pr.parts.map((part) => ({ part, near: null, far: null })) }; pools.set(key, p); }
        const need = Math.max(nN, nF);
        if (need > p.cap) {
          p.cap = Math.ceil(need * 1.4) + 8;
          for (const q of p.parts) { if (q.near) { out.remove(q.near); q.near.dispose(); out.remove(q.far); q.far.dispose(); } q.near = makeIM(q.part, p.cap, true); q.far = makeIM(q.part, p.cap, false); }
        }
        for (const q of p.parts) {
          for (const [im, arr] of [[q.near, L.near], [q.far, L.far]]) {
            const a = im.instanceMatrix.array;
            for (let i = 0, n = 0; i < arr.length; i += 2, n++) a.set(arr[i].subarray(arr[i + 1], arr[i + 1] + 16), n * 16);
            im.count = arr.length / 2; im.instanceMatrix.needsUpdate = true;
          }
        }
      }
    }

    /* ---- ground cover: grass blades and flowers generated around the viewer ---- */
    const Gr = Env.grass();
    patchGrass(Gr.material);
    w.cover.push(makeCover({
      geo: Gr.geometry, mat: Gr.material, cap: 9000, cell: 2, radius: 22,
      gen(cx, cz, outA) {
        if (cx * 2 > ROOM_X - 40) return;
        const rr = rng(hash2(cx, cz, seed) * 4294967296);
        const [h0, h1] = def.grassH, [t0, t1, l0, l1] = def.grassTint;
        for (let i = 0; i < 64; i++) {
          const x = (cx + rr()) * 2, z = (cz + rr()) * 2, y = H(x, z);
          const d = def.grassAt(x, z, y);
          if (rr() > d) continue;
          const s = h0 + rr() * (h1 - h0);
          col.setHSL(t0 + rr() * (t1 - t0), 0.3 + rr() * 0.25, l0 + rr() * (l1 - l0));
          outA.push(x, y - 0.02, z, rr() * TAU, s * (0.55 + rr() * 0.35), s, col.r, col.g, col.b);
        }
      },
    }));
    const F = Env.prop('flower', 0);
    for (const part of F.parts) {
      w.cover.push(makeCover({
        geo: part.geometry, mat: part.material, cap: 1100, cell: 4, radius: 28, shadow: false,
        gen(cx, cz, outA) {
          if (cx * 4 > ROOM_X - 40) return;
          const rr = rng(hash2(cx, cz, seed + 99) * 4294967296);
          const fc = def.flowerColors;
          for (let i = 0; i < 18; i++) {
            const x = (cx + rr()) * 4, z = (cz + rr()) * 4, y = H(x, z);
            const d = def.flowersAt(x, z, y);
            if (rr() > d) continue;
            col.setHex(fc[(rr() * fc.length) | 0]).convertSRGBToLinear();
            const s = 1.0 + rr() * 0.7;
            outA.push(x, y - 0.02, z, rr() * TAU, s, s * (0.85 + rr() * 0.4), col.r, col.g, col.b);
          }
        },
      }));
    }
    for (const c of w.cover) out.add(c.mesh);

    /* ---- per frame ---- */
    w.setRoom = (room) => { w.room = room; out.visible = !room; for (const rm of w.rooms) rm.group.visible = rm === room; };
    let sx = 1e9, sz = 1e9;
    const loadR = (far) => Math.min(far + 50, 330);
    // make and drop tiles and landmarks around (px, pz); everything at once after a jump
    function stream(px, pz, R, sync) {
      const t0 = performance.now();
      const need = [];
      const a0 = Math.floor((px - R) / TILE), a1 = Math.floor((px + R) / TILE), b0 = Math.floor((pz - R) / TILE), b1 = Math.floor((pz + R) / TILE);
      for (let tx = a0; tx <= a1; tx++) for (let tz = b0; tz <= b1; tz++) {
        const dx = Math.max(tx * TILE - px, 0, px - (tx + 1) * TILE), dz = Math.max(tz * TILE - pz, 0, pz - (tz + 1) * TILE), d = Math.hypot(dx, dz);
        if (d > R) continue;
        const k = tkey(tx, tz);
        if (!w.tiles.has(k)) need.push([d, tx, tz, k]);
      }
      need.sort((p, q) => p[0] - q[0]);
      for (const [, tx, tz, k] of need) { loadTile(tx, tz, k); if (!sync && performance.now() - t0 > 7) break; }
      for (const [k, t] of w.tiles) {
        const dx = Math.max(t.x0 - px, 0, px - (t.x0 + TILE)), dz = Math.max(t.z0 - pz, 0, pz - (t.z0 + TILE));
        if (Math.hypot(dx, dz) > R + TILE * 0.75) unloadTile(t, k);
      }
      if (!isl) {
        const n = Math.ceil((R + 60) / RS), i0 = Math.floor(px / RS), j0 = Math.floor(pz / RS);
        for (let i = i0 - n; i <= i0 + n; i++) for (let j = j0 - n; j <= j0 + n; j++) {
          const f = region(i, j);
          if (f && BUILT[f.kind] && !w.feats.has(f.key) && Math.hypot(f.x - px, f.z - pz) < R + 30) buildFeature(f);
        }
        for (const own of [...w.feats.values()]) {
          const f = own.f;
          if (Math.hypot(f.x - px, f.z - pz) > R + 140 && !(w.room && w.room.house && w.room.house.own === own)) unbuildFeature(own);
        }
      }
    }
    w.updateView = (camPos, px, pz, far, size) => {
      const inside = !!w.room;
      w.coverK = clamp(size || 1, 0.2, 3);
      if (!inside) {
        const R = loadR(far);
        const jump = Math.hypot(px - sx, pz - sz) > R * 0.5;
        if (jump) { sx = px; sz = pz; }
        else if (Math.hypot(px - sx, pz - sz) > 6) { sx = px; sz = pz; }
        stream(px, pz, R, jump || !w.tiles.size);
        poolT++;
        let fx = px - camPos.x, fz = pz - camPos.z; const fl = Math.hypot(fx, fz);
        if (fl > 0.01) { fx /= fl; fz /= fl; } else { fx = poolFX; fz = poolFZ; }
        if (jump || (poolDirty && poolT > 8) || Math.hypot(px - poolX, pz - poolZ) > 8 || (poolT > 5 && fx * poolFX + fz * poolFZ < 0.9)) rebuildPools(px, pz, far, fx, fz);
        w.cover[0].update(px, pz, clamp(8 + w.coverK * 7, 9, 22));
        for (let i = 1; i < w.cover.length; i++) w.cover[i].update(px, pz, clamp(13 + w.coverK * 7, 14, 28));
        if (w.waterMesh) { w.waterMesh.position.x = Math.round(px / 32) * 32; w.waterMesh.position.z = Math.round(pz / 32) * 32; }
      }
    };
    w.coverK = 1;
    // gates swing open when you walk up; door animations ease toward their target
    w.tick = (dt, P) => {
      for (const g of w.gates) {
        if (P && !P.room) {
          const d = Math.hypot(P.pos.x - g.x, P.pos.z - g.z);
          if (d < 2.3 + P.m.radius && P.mode !== 'fly') g.target = 1;
          else if (d > 4 + P.m.radius) g.target = 0;
        } else g.target = 0;
        if (g.t !== g.target) {
          const was = g.t;
          g.t = g.target > g.t ? Math.min(g.target, g.t + dt * 1.6) : Math.max(g.target, g.t - dt * 1.2);
          if (g.obj && Env.setDoors) Env.setDoors(g.obj, smooth(g.t));
          if (g.obj) g.col.off = g.t > 0.3;
          if (G.sound && G.sound.creak && ((was === 0 && g.t > 0) || (was === 1 && g.t < 1))) G.sound.creak(g);
        }
      }
      for (let i = w.anims.length - 1; i >= 0; i--) {
        const a = w.anims[i];
        a.hold -= dt;
        const target = a.hold > 0 ? 1 : 0;
        a.t = target > a.t ? Math.min(1, a.t + dt * a.speed) : Math.max(0, a.t - dt * a.speed * 0.7);
        if (Env.setDoors) Env.setDoors(a.group, smooth(a.t), a.which);
        else if (a.group.userData.door) a.group.userData.door.rotation.y = smooth(a.t) * 1.3;
        if (a.hold <= 0 && a.t <= 0) w.anims.splice(i, 1);
      }
    };
    // hold a door open (open = true) or let it close
    w.doorTo = (group, which, open) => {
      if (!group) return;
      let a = w.anims.find((q) => q.group === group && q.which === which);
      if (!a) { if (!open) return; w.anims.push((a = { group, which, t: 0, hold: 0, speed: 2.2 })); }
      a.hold = open ? 1e9 : 0;
    };
    // open a building's door for a while (which = door index, or all of them)
    w.openDoor = (group, hold = 1.2, which, speed = 2.6) => {
      if (!group) return;
      let a = w.anims.find((q) => q.group === group && q.which === which);
      if (!a) w.anims.push((a = { group, which, t: 0, hold, speed }));
      a.hold = Math.max(a.hold, hold);
    };
    w.dispose = () => {
      for (const t of w.tiles.values()) for (const m of t.meshes) m.geometry.dispose();
      for (const d of w.disposables) d.dispose();
      for (const c of w.cover) c.mesh.dispose();
      for (const p of pools.values()) for (const q of p.parts) { if (q.near) { q.near.dispose(); q.far.dispose(); } }
    };

    /* random ground spots for food and wandering */
    // a point on land (or water when water=true) inside a ring around (cx, cz)
    w.ringPoint = (cx, cz, r0, r1, wantWater, rnd = Math.random) => {
      for (let k = 0; k < 24; k++) {
        const a = rnd() * TAU, d = r0 + (r1 - r0) * Math.sqrt(rnd());
        const x = cx + Math.cos(a) * d, z = cz + Math.sin(a) * d;
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
        if (spotType === 'carrot' || spotType === 'pumpkin' || type === 'apple') return null;
      }
      const p = w.ringPoint(cx, cz, r0, r1, false);
      if (!p) return null;
      if (type === 'grass' && def.grassAt(p.x, p.z, p.h) < 0.2) return null;
      return { x: p.x, z: p.z, y: p.h };
    };
    // a random point inside a pen, away from its fences
    w.penPoint = (E, pad = 0.8) => { const lx = (Math.random() * 2 - 1) * Math.max(0.2, E.hw - pad), lz = (Math.random() * 2 - 1) * Math.max(0.2, E.hd - pad); const [x, z] = toWorld(E.x, E.z, E.rot || 0, lx, lz); return { x, z, h: H(x, z) }; };
    w.inPen = (E, x, z, pad = 0) => inRect(E, x, z, pad);
    w.toWorld = toWorld;
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
      const k = cx * 65536 + cz; let d = cache.get(k);
      if (!d) { const outA = []; o.gen(cx, cz, outA); d = new Float32Array(outA); cache.set(k, d); if (cache.size > 6000) cache.clear(); }
      return d;
    }
    return {
      mesh,
      update(px, pz, radius) {
        const cx = Math.floor(px / o.cell), cz = Math.floor(pz / o.cell), key = cx * 65536 + cz;
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

  return { build, META, PUSH, ROOM_X, TILE, CORE };
})();
