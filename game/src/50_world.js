/* ---------- worlds: endless terrain in tiles, water, plants, farms, colliders, houses, ground cover ---------- */
const World = (() => {
  const TILE = 64, TSEG = 32;   // terrain and plants are made in 64 m tiles around the player
  const RS = 256;               // landmark regions: away from the middle each one may hold a lake, a pond, a farm...
  const CORE = 200;             // the hand-made middle of each world (its own lakes, farm and village)
  const ROOM_X = 50000;         // the insides of houses and barns live far away at x >= ROOM_X
  const DYN_X = ROOM_X + 4000;  // the inside of a building out in the wilds (one at a time)
  const SHADOW_R = 48;          // plants closer than this cast shadows
  const SMALL = { rock: 1, fern: 1, mushroom: 1, stump: 1, log: 1, cattail: 1, lily: 1, pumpkin: 1, cornstalk: 1, hay: 1,
    // street things you only notice up close
    hydrant: 1, trashcan: 1, newsbox: 1, bikerack: 1, bollard: 1, mailbox: 1, parkingmeter: 1, cone: 1, barrier: 1, sandwichboard: 1, cafetable: 1, trashbags: 1,
    recycling: 1, pallet: 1, crates: 1, acunit: 1, gaspipe: 1, wheelstop: 1, treegrate: 1, bicycle: 1, drinking: 1, flowerbed: 1, planter: 1, noparking: 1, parkingsign: 1 };
  // drawn out to a middle distance (parked cars, signs and the like)
  const MID = { parked: 1, stopsign: 1, streetsign2: 1, oneway: 1, speedlimit: 1, busstopsign: 1, crosswalksign: 1, dumpster: 1, fence8: 1, foodcart: 1, phonebooth: 1,
    streetclock: 1, planterbox: 1, parkbooth: 1, bench: 1, parkbench: 1, picnic: 1, busstop: 1, statue: 1, trafficpole: 1 };
  const LOD_D = 120;            // towers farther than this are drawn with their simple version
  const BIG = { apartment: 1, office: 1, midrise: 1, storefront: 1 };   // city buildings: one draw each, always with shadows
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
      // the school and its playground behind the north side of Maple Street, and the adoption fair near the meadow path
      const SCHOOLYARD = { x: 98, z: -103, hw: 24, hd: 11, soft: 10 }, SCHOOL = { x: 86, z: -105, rot: 0 }, PLAY = { x: 110, z: -103, rot: 0 };
      const FAIR = { x: 38, z: 4, hw: 12, hd: 9, rot: 0 };
      const SCHOOLPATH = [[78, -57], [78, -93]];
      const STREET = [[48, -55], [134, -55]];
      const PATH = [[-48, -25], [-30, -12], [-8, -4], [18, 16], [42, 40]];
      const ROAD = [[-8, -4], [20, -28], [48, -55], [134, -55]];
      const LAKEPATH = [[-30, -12], [-60, 30], [-78, 62]];
      const c = { g1: P(0x557f2e), g2: P(0x77a442), dry: P(0x9aa553), dirt: P(0x7d6345), gravel: P(0x8d8169), sand: P(0xae986a), mud: P(0x3b3524), pave: P(0x8f8b84) };
      const gc = Math.cos(GARDEN.rot), gs = Math.sin(GARDEN.rot);
      const inGarden = (x, z, pad) => { const dx = x - GARDEN.x, dz = z - GARDEN.z, lx = dx * gc - dz * gs, lz = dx * gs + dz * gc; return Math.abs(lx) < GARDEN.w / 2 + pad && Math.abs(lz) < GARDEN.d / 2 + pad; };
      const inVillage = (x, z, pad) => Math.abs(x - VILLAGE.x) < VILLAGE.hw + pad && Math.abs(z - VILLAGE.z) < VILLAGE.hd + pad;
      const inPen = (x, z, pad) => PENS.some((R) => inRect(R, x, z, pad));
      const roadD = (x, z) => Math.min(pathDist(x, z, ROAD), pathDist(x, z, STREET), pathDist(x, z, SCHOOLPATH));
      const woods = (x, z) => outer(x, z, 110, 200) * smooth((fbm(n5, x * 0.006, z * 0.006, 3) + 0.05) / 0.3);
      const baseH = (x, z) => 1.3 + 3.2 * (fbm(n1, x * 0.009, z * 0.009, 3) * 0.5 + 0.5) + 0.3 * n2(x * 0.06, z * 0.06);
      const FAIR_Y = Math.max(1.4, baseH(FAIR.x, FAIR.z));
      // Maple Town, the city, the small towns and the roads between them (49_plan)
      Plan.init(baseH);
      const TOWN = Plan.TOWN;
      function H(x, z) {
        let h = Plan.H(baseH(x, z), x, z);
        if (ring(x, z) < CORE + 20) {
          h = flatRect(h, x, z, SCHOOLYARD, 2.4);
          h = flatRect(h, x, z, { x: FAIR.x, z: FAIR.z, hw: FAIR.hw, hd: FAIR.hd, soft: 10 }, FAIR_Y);
          h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - BARN.x, z - BARN.z) - 24) / 18));
          h = lerp(h, 2.3, smooth(1 - (Math.hypot(x - GARDEN.x, z - GARDEN.z) - 9) / 10));
          for (const R of PENS) h = flatRect(h, x, z, { x: R.x, z: R.z, hw: R.hw, hd: R.hd, rot: R.rot, soft: 8 }, 2.3);
          h = flatRect(h, x, z, VILLAGE, 2.4);
          h = water(n3, h, x, z, POND, -2.0);
          h = water(n4, h, x, z, LAKE, -3.2);
        }
        return h;
      }
      // town lots are kept clear of wild plants (the town plants its own street trees)
      const inLots = (x, z, pad) => x > 40 && x < 270 && z > -90 && z < 90 && TOWN.flats.some((R) => inRect(R, x, z, pad - 8));
      const away = (x, z, d = 3) => Math.hypot(x - BARN.x, z - BARN.z) > 28 && !inGarden(x, z, 4) && !inPen(x, z, 3) && pathDist(x, z, PATH) > d && roadD(x, z) > d + 1 && !inVillage(x, z, 3) && pathDist(x, z, LAKEPATH) > d
        && !inRect(SCHOOLYARD, x, z, 3) && !inRect(FAIR, x, z, 4) && !inLots(x, z, 0) && !Plan.busy(x, z, 2);
      return {
        name: 'Land', blurb: 'A farm, Maple Town, a big city with a park, cars and buses, small towns, ponds and lakes, and it goes on and on.', spawn: [10, -2],
        H, fog: [60, 260], water: {}, people: 8, village: true,
        places: Plan.PLACES, reserved: Plan.reserved, busy: Plan.busy,
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
          Plan.paint(o, x, z, c);
          shore(o, h, c.sand, c.mud);
        },
        grassAt(x, z, h) {
          if (h < 0.3) return 0;
          const pg = Plan.grass(x, z); if (pg <= 0) return 0;
          if (ring(x, z) > CORE + 20) return pg * (0.75 + 0.25 * n3(x * 0.05, z * 0.05));
          if (inGarden(x, z, 0.8) || inRect(PIGPEN, x, z, 0) || inRect(COOP, x, z, 0)) return 0;
          let g = smooth((Math.min(pathDist(x, z, PATH), pathDist(x, z, LAKEPATH)) - 0.5) / 0.8) * smooth((roadD(x, z) - 1.8) / 0.8);
          g *= 0.25 + 0.75 * smooth((Math.hypot(x - BARN.x, z - BARN.z) - 9) / 10);
          return pg * g * (0.75 + 0.25 * n3(x * 0.05, z * 0.05));
        },
        flowersAt(x, z, h) { return h < 0.5 || (ring(x, z) < CORE + 20 && roadD(x, z) < 3) || Plan.busy(x, z, 1) || inLots(x, z, -2) ? 0 : smooth((n3(x * 0.035 + 4, z * 0.035) - 0.15) / 0.3) * 0.55; },
        build(w) {
          w.addBarn(BARN);
          w.addGarden(GARDEN);
          w.addEnclosure(Object.assign({ style: 'rail', gate: 'e', trough: true, shelter: true }, PADDOCK));
          w.addEnclosure(Object.assign({ style: 'split', gate: 'n', mud: true, shelter: true, trough: true }, PIGPEN));
          w.addEnclosure(Object.assign({ style: 'split', gate: 'w', platform: true, hay: true }, GOATPEN));
          w.addEnclosure(Object.assign({ style: 'wire', gate: 'n', coop: true }, COOP));
          // Maple Town: houses, shops on Maple Street, the town green, the pound on Birch Street (49_plan)
          for (const L of TOWN.lots) w.addHouse(L);
          w.addTown(TOWN);
          if (Env.school) w.addHouse({ kind: 'school', x: SCHOOL.x, z: SCHOOL.z, rot: SCHOOL.rot });
          if (Env.playground) w.addPlayground(PLAY);
          w.addFair(FAIR);
          // box traps around the garden keep weasels and other pests off the farmer's carrots
          for (const [lx, lz] of [[-7.3, -1.5], [7.3, 1.8], [1.5, -6.4]]) { const [x, z] = toWorld(GARDEN.x, GARDEN.z, GARDEN.rot, lx, lz); w.addBoxTrap(x, z, Math.atan2(x - GARDEN.x, z - GARDEN.z)); }
          // fish traps in the pond and the lake
          for (const [L, a, d] of [[POND, 0.6, 0.45], [POND, 3.4, 0.5], [LAKE, 1.2, 0.5], [LAKE, 4.3, 0.55]]) w.addFishTrap(L.x + Math.cos(a) * L.r * d, L.z + Math.sin(a) * L.r * d);
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
          // the city park: ducks on the pond, squirrels and bunnies in the trees and lawns
          { sp: 'duck', n: 3, kids: 3, home: [Plan.CITY.x + Plan.CITY.pond.x, Plan.CITY.z + Plan.CITY.pond.z], range: 10, water: true },
          { sp: 'squirrel', n: 3, home: [Plan.CITY.x + 45, Plan.CITY.z - 15], range: 28 },
          { sp: 'bunny', n: 2, kids: 1, home: [Plan.CITY.x + 75, Plan.CITY.z - 25], range: 18 },
          // pests that sneak into the farmer's garden for carrots
          { sp: 'weasel', n: 2, home: [-8, -84], range: 22 },
          { sp: 'bunny', n: 2, home: [-2, -66], range: 18 },
        ],
        ambient: [{ sp: 'bunny', w: 3, kids: 1 }, { sp: 'deer', w: 2, kids: 1 }, { sp: 'squirrel', w: 2 }, { sp: 'fox', w: 1 }, { sp: 'raccoon', w: 1 }, { sp: 'hedgehog', w: 1 }, { sp: 'weasel', w: 1 }, { sp: 'duck', w: 2, water: true, kids: 3 }, { sp: 'swan', w: 1, water: true }, { sp: 'otter', w: 1, water: true }],
        foods: { grass: 4, worm: 3, apple: 3, carrot: 3, berries: 3, acorn: 2, pinecone: 1, smallfish: 3, fish: 2, pumpkin: AUTUMN ? 2 : 0 },
        walk: [[10, -2], [-30, -12], [18, 16], [25, -70], [-50, -12], [70, -55], [100, -55], [126, -55], [40, 10], [-20, 30], [60, -30], [-60, 40]],
        villageWalk: [[60, -55], [80, -55], [100, -55], [120, -55], [130, -55], [160, -55], [200, -55], [240, -55], [100, 2], [150, 2], [210, 2], [150, 54], [210, 54], [135, -20], [195, 30], [226, -26]],
        // places for town life (jobs, school, the fair)
        town: {
          schoolRoute: [[78, -57], [78, -92]], schoolyard: SCHOOLYARD, commute: [-48, -25], commuteFar: [-150, -12], barn: [BARN.x, BARN.z], garden: GARDEN,
          pens: { horse: [PADDOCK, 'e'], pig: [PIGPEN, 'n'], goat: [GOATPEN, 'w'], chicken: [COOP, 'n'] }, pond: POND, lake: LAKE, fair: FAIR, village: TOWN.area,
          fairFrom: [[20, -28], [-8, -4], [18, 16], [42, 40], [48, -55]],
          scoutSpots: [[-110, -110], [-140, 20], [120, 90], [10, 120], [150, 20], [10, 50], [22, -76], [80, 20], [30, -40], [-8, -84]],
        },
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
  const SHOP_NAMES = { general: 'general store', bakery: 'bakery', cafe: 'cafe', post: 'post office', library: 'library', icecream: 'ice cream shop', diner: 'diner', hardware: 'hardware store', flower: 'flower shop', toy: 'toy store', pet: 'pet store', books: 'bookstore', vet: 'vet', grocery: 'grocery store', clothes: 'clothes store' };
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
      traps: [], fishTraps: [], fair: null, playground: null, school: null,
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
        // the towns, the city and the roads between them keep landmarks away
        if (f && def.reserved && def.reserved(f.x, f.z, f.reach)) f = null;
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
      if (def.busy && def.busy(x, z, 1.5)) return true;
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
    /* roofs you can stand on: a collider with a roof shape (see roofY) is solid below its roof and walkable on top */
    const lerpProf = (pr, d) => { if (d <= pr[0][0]) return pr[0][1]; for (let i = 1; i < pr.length; i++) if (d <= pr[i][0]) { const t = (d - pr[i - 1][0]) / ((pr[i][0] - pr[i - 1][0]) || 1); return pr[i - 1][1] + (pr[i][1] - pr[i - 1][1]) * t; } return pr[pr.length - 1][1]; };
    // roof height above the building's base at a local point: a flat deck (with boxes standing on it), or a pitched roof
    // given as a profile of heights by distance from the ridge (across x or z), optionally hipped
    function roofY(r, lx, lz) {
      if (r.flat !== undefined) {
        let y = r.flat;
        for (const q of r.parts || []) if (Math.abs(lx - q.x) <= q.hw && Math.abs(lz - q.z) <= q.hd) y = Math.max(y, q.y);
        return y;
      }
      const a = r.across === 'z' ? lz - (r.c || 0) : lx - (r.c || 0), o = r.across === 'z' ? lx : lz;
      let y = lerpProf(a >= 0 ? r.pos : (r.neg || r.pos), Math.abs(a));
      if (r.hip != null) y = Math.min(y, lerpProf(r.pos, Math.max(0, Math.abs(o) - r.hip)));
      return y;
    }
    w.roofY = roofY;
    const STEP_UP = 0.45;
    // the ground under (x, z) for something at height y: the terrain, or a roof it is on (or just above)
    w.groundAt = (x, z, y) => {
      let h = H(x, z);
      if (y === undefined || x > ROOM_X - 20) return h;
      const a = w.grid.get(gkey(Math.floor(x / 8), Math.floor(z / 8)));
      if (a) for (const c of a) {
        if (!c.roof || c.off) continue;
        const dx = x - c.x, dz = z - c.z, lx = dx * c.co - dz * c.si, lz = dx * c.si + dz * c.co;
        if (Math.abs(lx) > c.hw || Math.abs(lz) > c.hd) continue;
        const t = c.y0 + roofY(c.roof, lx, lz);
        if (t > h && t <= y + STEP_UP) h = t;
      }
      return h;
    };
    w.collide = (pos, rad, y, wild, high) => {
      const a = w.grid.get(gkey(Math.floor(pos.x / 8), Math.floor(pos.z / 8)));
      let hit = false;
      if (a) for (const c of a) {
        if (c.off || (c.wild && !wild) || (high && !c.roof)) continue;
        if (c.h && y !== undefined && y > c.y0 + c.h) continue;
        if (c.box) {
          const dx = pos.x - c.x, dz = pos.z - c.z, lx = dx * c.co - dz * c.si, lz = dx * c.si + dz * c.co;
          const qx = clamp(lx, -c.hw, c.hw), qz = clamp(lz, -c.hd, c.hd), ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          // up on the roof: no wall here
          if (c.roof && y !== undefined && y > c.y0 + roofY(c.roof, qx, qz) - STEP_UP) continue;
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
    // color: an optional [r, g, b] for the parts that take a tint (parked cars)
    function pushInst(owner, type, variant, x, y, z, rot, s, sy, color) {
      const key = type + ':' + variant;
      let e = owner.items.get(key);
      if (!e) owner.items.set(key, (e = { type, variant, small: !!SMALL[type], mid: !!MID[type], xs: [], zs: [], ms: [], cs: null }));
      dummy.position.set(x, y, z); dummy.rotation.set(0, rot, 0); dummy.scale.set(s, sy || s, s); dummy.updateMatrix();
      if (color && !e.cs) { e.cs = []; for (let i = 0; i < e.xs.length; i++) e.cs.push(1, 1, 1); }
      if (e.cs) { if (color) e.cs.push(color[0], color[1], color[2]); else e.cs.push(1, 1, 1); }
      e.xs.push(x); e.zs.push(z);
      const m = dummy.matrix.elements; for (let i = 0; i < 16; i++) e.ms.push(m[i]);
    }
    function finishOwner(o) { for (const e of o.items.values()) { if (!(e.ms instanceof Float32Array)) e.ms = new Float32Array(e.ms); if (e.cs && !(e.cs instanceof Float32Array)) e.cs = new Float32Array(e.cs); } poolDirty = true; }
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
    // a building's walkable roof from its userData: a pitched roof shape, a flat deck ({ y, ... } and roofParts), or
    // a flat top at most of its height when nothing is known
    const roofOf = (ud) => {
      if (!ud) return null;
      const r = ud.roof;
      if (r && (r.pos || r.flat !== undefined)) return r;
      if (r && r.y !== undefined) return { flat: r.y, parts: (ud.roofParts || []).map((q) => ({ x: q.x, z: q.z, hw: q.hw, hd: q.hd, y: q.y })) };
      return ud.h ? { flat: ud.h * 0.9 } : null;
    };
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
      room.store = rec.store || null;
      room.clerk = L(iu.clerk); room.shoppers = (iu.shoppers || []).map(L);
      room.treats = (iu.treats || []).map((t) => ({ x: ox + t.x, y: t.y, z: t.z, type: t.type }));
      room.school = rec.kind === 'school';
      room.seats = (iu.seats || []).map((p) => ({ x: ox + p.x, z: p.z, yaw: p.yaw }));
      room.teacher = iu.teacher ? { x: ox + iu.teacher.x, z: iu.teacher.z, yaw: iu.teacher.yaw } : null;
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
      const ig = rec.lazy === 'barn' ? (Env.barnInterior ? Env.barnInterior() : null) : rec.lazy === 'store' ? (Env.storeInterior ? Env.storeInterior(rec.store) : null) : Env.interior(rec.variant || 0);
      if (!ig) return null;
      if (w.dynRoom && w.dynRoom !== w.room) { dropRoom(w.dynRoom); w.dynRoom = null; }
      const room = makeRoom(rec, ig, DYN_X);
      w.dynRoom = room;
      return room;
    };
    w.addBarn = (B) => {
      const g = Env.barn(), y = H(B.x, B.z);
      g.userData.bake = 1;
      g.position.set(B.x, y - 0.05, B.z); g.rotation.y = B.rot; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      const sz = g.userData.size || { w: 10, d: 14 };
      addBlocker(g, B.x, B.z, Math.hypot(sz.w, sz.d) / 2 + 1);
      addCollider({ box: true, x: B.x, z: B.z, hw: sz.w / 2 + 0.1, hd: sz.d / 2 + 0.1, co: Math.cos(B.rot), si: Math.sin(B.rot), y0: y - 0.05, roof: g.userData.roof || null });
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
          f.userData.bake = 1; out.add(shade(f)); if (w.own) w.own.objs.push(f);
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
      const put = (obj, lx, lz, r2, colR) => { if (!obj) return; obj.userData.bake = 1; const [x, z] = Pt(lx, lz); w.addObj(obj, x, z, rot + (r2 || 0)); if (colR) addCollider({ x, z, r: colR }); return obj; };
      const mk = (fn, ...a) => (Env[fn] ? Env[fn](...a) : null);
      if (E.mud) { const m = mk('mudPatch', Math.min(hw, hd) * 0.7); if (m) { const [x, z] = Pt(hw * 0.25, hd * 0.1); m.position.set(x, H(x, z) + 0.01, z); m.rotation.y = rot; m.userData.bake = 1; out.add(m); if (w.own) w.own.objs.push(m); } }
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
    w.addSign = (text, x, z, rot) => { const g = w.addObj(Env.sign(text), x, z, rot); g.userData.bake = 1; return g; };
    w.addScarecrow = (x, z, rot) => { w.addObj(Env.scarecrow(), x, z, rot).userData.bake = 1; addCollider({ x, z, r: 0.25 }); };
    w.addHouse = (spec) => {
      const pound = spec.kind === 'pound', school = spec.kind === 'school', shop = spec.kind === 'shop';
      if (shop && !Env.shop) return null;
      const g = pound ? Env.pound() : school ? Env.school() : shop ? Env.shop(spec.shop) : Env.house(spec.variant);
      const ud = g.userData, y = H(spec.x, spec.z);
      ud.bake = 1;
      g.position.set(spec.x, y - 0.03, spec.z); g.rotation.y = spec.rot; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      addCollider({ box: true, x: spec.x, z: spec.z, hw: ud.hw, hd: ud.hd, co: Math.cos(spec.rot), si: Math.sin(spec.rot), y0: y - 0.03, roof: roofOf(ud) });
      addBlocker(g, spec.x, spec.z, Math.hypot(ud.w, ud.d) / 2 + 1);
      if (!w.own) markPlaced(spec.x, spec.z, Math.max(ud.w, ud.d) + 4);
      const [dx, dz] = toWorld(spec.x, spec.z, spec.rot, ud.outside.x, ud.outside.z);
      const rec = {
        id: w.houses.length, kind: spec.kind, pound, variant: spec.variant, village: !!spec.village, x: spec.x, z: spec.z, rot: spec.rot, group: g,
        name: pound ? 'the animal pound' : school ? 'the school' : shop ? 'the ' + (SHOP_NAMES[spec.shop] || spec.shop) : `the ${HOUSE_COLORS[spec.variant]} house`,
        door: { x: dx, z: dz, yaw: spec.rot }, doorMesh: ud.door || null, room: null, own: w.own, street: spec.street || null, town: spec.town || null,
      };
      if (shop) rec.store = spec.shop;
      if (w.own) rec.lazy = shop ? 'store' : 'house';
      else makeRoom(rec, pound ? Env.poundInterior() : school ? Env.schoolInterior() : shop ? Env.storeInterior(spec.shop) : Env.interior(spec.variant), ROOM_X + (slot++) * 40);
      w.houses.push(rec);
      if (school) { w.school = rec; return rec; }
      if (shop) return rec;
      if (!pound) {
        // front yard: picket fence with a gap at the walk; back yard: a pen with a gate for outdoor pets
        const fz = ud.d / 2 + 4.2, fw = ud.w / 2 + 2;
        const pts = (lx, lz) => toWorld(spec.x, spec.z, spec.rot, lx, lz);
        w.fenceLine([pts(-fw, fz), pts(-1.4, fz)], 'picket');
        w.fenceLine([pts(1.4, fz), pts(fw, fz)], 'picket');
        if (spec.pen !== false) {
        const [px, pz] = pts(-ud.w / 2 + 2.6, -ud.d / 2 - 4.8);
        const enc = w.addEnclosure({ x: px, z: pz, hw: 2.6, hd: 2.1, rot: spec.rot, style: 'split', gate: 'n', gateLen: 1.4, trough: true });
        const [kx, kz] = pts(-ud.w / 2 + 3.9, -ud.d / 2 - 5.9);
        w.addObj(Env.kennel(), kx, kz, spec.rot).userData.bake = 1;
        addCollider({ box: true, x: kx, z: kz, hw: 0.55, hd: 0.65, rot: spec.rot });
        rec.pen = { x: px, z: pz, w: 5.2, d: 4.2, rot: spec.rot, kennel: { x: kx, z: kz }, enc };
        }
        // people come in through the gap in the picket fence
        const [wx, wz] = pts(0, fz + 1.3); rec.walk = { x: wx, z: wz }; rec.yard = { x: spec.x, z: spec.z, rot: spec.rot, d0: ud.d / 2, d1: fz, hw: fw };
        if (HOLIDAY === 'halloween') {
          const [jx, jz] = pts(1.1, ud.d / 2 + 1.6), [jx2, jz2] = pts(-1.1, ud.d / 2 + 1.6);
          w.lanterns.push(w.addObj(Env.jackolantern(0.42), jx, jz, spec.rot + 0.2));
          w.lanterns.push(w.addObj(Env.jackolantern(0.34), jx2, jz2, spec.rot - 0.25));
          for (const l of w.lanterns.slice(-2)) l.userData.bake = 1;
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

    /* town things: playground, adoption fair, traps */
    // things built with their doors open (traps, fair pens) start out held open, so they can swing shut later
    const startOpen = (g) => { w.anims.push({ group: g, which: undefined, t: 1, hold: 1e9, speed: 2.2 }); Env.setDoors(g, 1); };
    const colTo = (x0, z0, rot, c) => { const [x, z] = toWorld(x0, z0, rot, c.x, c.z); return c.box ? { box: true, x, z, hw: c.hw, hd: c.hd, rot: rot + (c.rot || 0) } : { x, z, r: c.r }; };
    w.addPlayground = (P0) => {
      const g = Env.playground(), ud = g.userData;
      w.addObj(g, P0.x, P0.z, P0.rot || 0);
      for (const c of ud.colliders || []) addCollider(colTo(P0.x, P0.z, P0.rot || 0, c));
      if (!w.own) markPlaced(P0.x, P0.z, Math.max(ud.w || 14, ud.d || 10) + 2);
      const spots = (ud.spots || []).map((q) => { const [x, z] = toWorld(P0.x, P0.z, P0.rot || 0, q.x, q.z); return { x, z, yaw: (q.yaw || 0) + (P0.rot || 0), kind: q.kind, busy: null }; });
      const pg = { x: P0.x, z: P0.z, rot: P0.rot || 0, obj: g, spots, swings: ud.swings || [], seesaw: ud.seesaw || null };
      if (!P0.extra) w.playground = pg;   // the school's playground is the one the kids use at recess
      return pg;
    };
    // the adoption fair: a banner, tents, a table, balloons and pens for animals who need a home
    w.addFair = (F) => {
      const rot = F.rot || 0, Pt = (lx, lz) => toWorld(F.x, F.z, rot, lx, lz), y0 = H(F.x, F.z);
      const put = (obj, lx, lz, r2, keepCols = true) => { if (!obj) return null; obj.userData.bake = 1; const [x, z] = Pt(lx, lz); w.addObj(obj, x, z, rot + (r2 || 0)); if (keepCols) for (const c of obj.userData.colliders || []) addCollider(colTo(x, z, rot + (r2 || 0), c)); return obj; };
      const fair = { x: F.x, z: F.z, rot, pens: [], table: null, y: y0 };
      if (Env.fairBanner) put(Env.fairBanner('ADOPTION FAIR'), -F.hw + 0.5, 0, -Math.PI / 2);
      if (Env.fairTent) { put(Env.fairTent(0xd94c5c), 4, -4); put(Env.fairTent(0x3f7fd0), 4, 4); put(Env.fairTent(0xe9a93b), -3.5, -6); }
      if (Env.fairTable) { put(Env.fairTable(), -3.5, -6, Math.PI / 2); const [tx, tz] = Pt(-2.6, -6); fair.table = { x: tx, z: tz }; const [hx, hz] = Pt(-4.6, -6); fair.helper = { x: hx, z: hz, yaw: rot + Math.PI / 2 }; }
      if (Env.balloons) { put(Env.balloons(), -F.hw + 0.4, -2.6, 0, false); put(Env.balloons(), -F.hw + 0.4, 2.6, 0.7, false); put(Env.balloons(), -1.6, -7.4, 1.4, false); }
      if (Env.playPen) {
        const pr = rot - Math.PI / 2;   // the pen gates face the visitors (toward -x of the fair)
        for (const lz of [-5.2, -2.4, 2.4, 5.2]) {
          const g = Env.playPen(2.2, 1.8), ud = g.userData, [x, z] = Pt(4, lz);
          w.addObj(g, x, z, pr);
          for (const c of ud.colliders || []) addCollider(colTo(x, z, pr, c));
          const dc = ud.doorCollider ? addCollider(colTo(x, z, pr, ud.doorCollider)) : null;
          if (dc) dc.off = true;
          startOpen(g);
          const [ex, ez] = toWorld(x, z, pr, ud.entry ? ud.entry.x : 0, ud.entry ? ud.entry.z : 1.4);
          const ins = ud.inside || { x: 0, z: 0, hw: 0.9, hd: 0.7 };
          fair.pens.push({ x, z, rot: pr, obj: g, doorCol: dc, entry: { x: ex, z: ez }, hw: ins.hw, hd: ins.hd, open: true, animal: null, player: false });
        }
      }
      if (!w.own) markPlaced(F.x, F.z, Math.hypot(F.hw, F.hd) * 2);
      w.fair = fair;
      return fair;
    };
    // a humane box trap; set means the door is up and the bait is waiting
    w.addBoxTrap = (x, z, yaw) => {
      if (!Env.boxTrap) return null;
      const g = Env.boxTrap(), ud = g.userData;
      w.addObj(g, x, z, yaw, H(x, z) - 0.01);
      const cols = (ud.colliders || []).map((c) => addCollider(Object.assign(colTo(x, z, yaw, c), { h: (ud.h || 0.38) + 0.05, y0: H(x, z) })));
      const doorCol = ud.doorCollider ? addCollider(Object.assign(colTo(x, z, yaw, ud.doorCollider), { h: (ud.h || 0.38) + 0.05, y0: H(x, z) })) : null;
      if (doorCol) doorCol.off = true;
      startOpen(g);
      const ins = ud.inside || { x: 0, z: 0, hw: 0.14, hd: 0.42 };
      const [cx, cz] = toWorld(x, z, yaw, ins.x, ins.z), [ex, ez] = toWorld(x, z, yaw, ud.entry ? ud.entry.x : 0, ud.entry ? ud.entry.z : 0.7);
      const t = { kind: 'box', obj: g, x, z, yaw, cx, cz, hw: ins.hw, hd: ins.hd, entry: { x: ex, z: ez }, set: true, caught: null, cols, doorCol, own: w.own, h: ud.h || 0.38 };
      w.traps.push(t);
      return t;
    };
    // a wire fish trap on the bottom, with a float on the surface
    w.addFishTrap = (x, z) => {
      if (!Env.fishTrap || !def.water) return null;
      const g = Env.fishTrap(), ud = g.userData, hb = H(x, z);
      if (hb > -0.7) return null;
      const y = hb + (ud.r || 0.18) + 0.02;
      g.position.set(x, y, z); g.rotation.y = hash2(Math.round(x), Math.round(z), 3) * TAU; out.add(shade(g)); if (w.own) w.own.objs.push(g);
      const buoy = ud.buoy || g.getObjectByName('buoy'), rope = ud.rope || g.getObjectByName('rope');
      if (buoy) { buoy.position.set(0, WATER - y + 0.02, 0); buoy.castShadow = false; }
      const ry = ud.ropeTop ? ud.ropeTop.y : (ud.r || 0.18);
      if (rope) { rope.position.y = ry; rope.scale.y = Math.max(0.1, WATER - y + 0.02 - ry); }
      const ft = { obj: g, x, z, y, slots: ud.slots || [], fish: 1, fishObjs: [], own: w.own };
      w.fishTraps.push(ft);
      return ft;
    };

    /* ---- towns, the city and the roads between them (laid out in 49_plan) ---- */
    // street surfaces from 37_street, nudged toward the camera so they never flicker against the ground under them
    let SM = null;
    const streetMats = () => {
      if (SM) return SM;
      SM = Env.streetMaterials ? Env.streetMaterials() : {};
      const off = { road: 2, country: 2, junction: 3, sidewalk: 2, curb: 2, paving: 2, zebra: 5, alley: 2, parking: 3, plaza: 3, puddle: 6 };
      for (const k in SM) { const m = SM[k]; if (!m || m.userData.aaOffset) continue; m.polygonOffset = true; m.polygonOffsetFactor = -(off[k] || 2); m.polygonOffsetUnits = -(off[k] || 2) * 2; m.userData.aaOffset = 1; }
      return SM;
    };
    // flat surfaces are collected per owner and material, then merged (finishSurfaces)
    const _qa = new THREE.Vector3(), _qb = new THREE.Vector3(), _qn = new THREE.Vector3();
    function quad(mat, P, U, want) {
      if (!mat) return;
      const o = w.own || w.stat, S = o.surf || (o.surf = new Map());
      let q = S.get(mat); if (!q) S.set(mat, (q = { pos: [], uv: [], nrm: [] }));
      _qa.set(P[1][0] - P[0][0], P[1][1] - P[0][1], P[1][2] - P[0][2]); _qb.set(P[2][0] - P[0][0], P[2][1] - P[0][1], P[2][2] - P[0][2]);
      _qn.crossVectors(_qa, _qb).normalize();
      const wx = want ? want[0] : 0, wy = want ? want[1] : 1, wz = want ? want[2] : 0;
      const order = _qn.x * wx + _qn.y * wy + _qn.z * wz < 0 ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3];
      if (order[1] === 2) _qn.negate();
      for (const i of order) { q.pos.push(P[i][0], P[i][1], P[i][2]); q.uv.push(U[i][0], U[i][1]); q.nrm.push(_qn.x, _qn.y, _qn.z); }
    }
    function finishSurfaces(own) {
      const o = own || w.stat; if (!o.surf) return;
      for (const [mat, q] of o.surf) {
        if (!q.pos.length) continue;
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(q.pos, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(q.nrm, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(q.uv, 2));
        g.computeBoundingSphere();
        const m = new THREE.Mesh(g, mat); m.receiveShadow = true; m.castShadow = false; m.matrixAutoUpdate = false; m.updateMatrix();
        out.add(m);
        if (own) own.meshes.push(m); else w.disposables.push(g);
      }
      o.surf = null;
    }
    // an axis aligned flat rectangle; uvf(x, z) gives its uv (world meters by default, s = meters per texture repeat)
    const paveRect = (mat, x0, z0, x1, z1, y, uvf) => {
      const f = uvf || ((x, z) => [x / 1.5, z / 1.5]);
      quad(mat, [[x0, y, z0], [x0, y, z1], [x1, y, z1], [x1, y, z0]], [f(x0, z0), f(x0, z1), f(x1, z1), f(x1, z0)]);
    };
    // a curb: a low edge between a sidewalk and the road, from (ax, az) to (bx, bz), its face toward (ox, oz)
    function curb(ax, az, bx, bz, ox, oz, y0, y1) {
      const M = streetMats(); if (!M.curb) return;
      const t = 0.22, L = Math.hypot(bx - ax, bz - az);
      quad(M.curb, [[ax, y0, az], [bx, y0, bz], [bx, y1, bz], [ax, y1, az]], [[0, 0], [L, 0], [L, y1 - y0], [0, y1 - y0]], [ox, 0, oz]);
      quad(M.curb, [[ax, y1, az], [bx, y1, bz], [bx - ox * t, y1, bz - oz * t], [ax - ox * t, y1, az - oz * t]], [[0, 0], [L, 0], [L, t], [0, t]]);
    }
    // a road ribbon along a polyline piece: u across (0 on the left), v = meters / 12 along
    function ribbon(mat, samples, width) {
      for (let i = 0; i < samples.length - 1; i++) {
        const a = samples[i], b = samples[i + 1];
        const fx = b.x - a.x, fz = b.z - a.z, L = Math.hypot(fx, fz) || 1, lx = fz / L, lz = -fx / L, hw = width / 2;
        const la = a.lx !== undefined ? [a.lx, a.lz] : [lx, lz], lb = b.lx !== undefined ? [b.lx, b.lz] : [lx, lz];
        quad(mat, [[a.x - la[0] * hw, a.y, a.z - la[1] * hw], [b.x - lb[0] * hw, b.y, b.z - lb[1] * hw], [b.x + lb[0] * hw, b.y, b.z + lb[1] * hw], [a.x + la[0] * hw, a.y, a.z + la[1] * hw]],
          [[1, a.s / 12], [1, b.s / 12], [0, b.s / 12], [0, a.s / 12]]);
      }
    }
    // samples along a straight street from a to b at height y (left normal shared)
    const straight = (ax, az, bx, bz, y, step = 6) => {
      const L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step)), out2 = [];
      for (let i = 0; i <= n; i++) out2.push({ x: ax + (bx - ax) * i / n, z: az + (bz - az) * i / n, y, s: L * i / n });
      return out2;
    };
    // camera wall test for instanced buildings: a box that is never drawn
    const _box = new THREE.BoxGeometry(1, 1, 1), _boxMat = new THREE.MeshBasicMaterial();
    function blockBox(x, y, z, bw, bh, bd, rot) {
      const m = new THREE.Mesh(_box, _boxMat); m.position.set(x, y + bh / 2, z); m.rotation.y = rot; m.scale.set(bw, bh, bd); m.updateMatrixWorld(true);
      addBlocker(m, x, z, Math.hypot(bw, bd) / 2 + 1);
    }
    // a prop from the instanced kit if it exists (the street kit may be missing pieces)
    const hasProp = (t) => !!(Env._k && Env._k.PROPS[t]);
    function putProp(type, variant, x, z, y, rot, s = 1, col = true) {
      if (!hasProp(type)) return;
      const own = w.own || w.stat, pr = Env.prop(type, variant);
      pushInst(own, type, variant, x, y, z, rot, s);
      if (col && pr.radius > 0) addCollider({ x, z, r: pr.radius * s }, own);
      for (const c of pr.colliders || []) { const [cx, cz] = toWorld(x, z, rot, c.x * s, c.z * s); addCollider({ x: cx, z: cz, r: c.r * s }, own); }
    }
    const putTree = (type, variant, x, z, s, rot) => { const h = H(x, z); placeProp(w.own || w.stat, { spot: type === 'oak' ? 'acorn' : null, spotR: 3, sink: 0.05 }, type, variant, x, z, h, s, rot); };
    const addGroup = (g, x, z, rot, y) => { if (!g) return null; w.addObj(g, x, z, rot, y); g.userData.bake = 1; for (const c of g.userData.colliders || []) addCollider(colTo(x, z, rot, c)); return g; };
    const STORE_NAME = (k) => SHOP_NAMES[k] || k;
    w.signals = []; w.benches = []; w.vendors = [];

    /* the city */
    const CT = Plan.CITY, R7 = CT.road / 2, WK = CT.walk, HB = CT.blk / 2;
    const YR = Plan.CY + 0.03, YS = Plan.CY + 0.07;             // the tops of the roads and the sidewalks
    // texture size of a street kit ground surface (meters per repeat), from the material when it says
    const uvSize = (k, d) => { const m = streetMats()[k]; return (m && m.userData && m.userData.uvSize) || d; };
    const mUV = (S) => (x, z) => [x / S, z / S];
    const cityRng = (a, b, c) => rng(hash2(a, b, c) * 4294967296);
    const FOOD_STORES = { cafe: 1, bakery: 1, pizza: 1, deli: 1, icecream: 1 };
    const DOWNTOWN = { 'Main Street': 1, 'Park Avenue': 1, 'Park Street': 1, 'Garden Street': 1, 'Fifth Avenue': 1, 'Third Avenue': 1 };
    // a flat decal (a puddle) on a surface at height y
    function puddle(M, x, z, y, s, rot) {
      if (!M.puddle) return;
      const c = Math.cos(rot), si = Math.sin(rot), hx = s * 0.5, hz = s * 0.36, P = (u, v) => [x + u * c + v * si, y, z - u * si + v * c];
      quad(M.puddle, [P(-hx, -hz), P(-hx, hz), P(hx, hz), P(hx, -hz)], [[0, 0], [0, 1], [1, 1], [1, 0]]);
    }
    // a cafe table; its chairs become seats people can come and sit on
    function cafeTable(v, x, z, y, rot) {
      if (!hasProp('cafetable')) return;
      putProp('cafetable', v, x, z, y, rot);
      for (const st of Env.prop('cafetable', v).seats || []) { const [sx, sz] = toWorld(x, z, rot, st.x, st.z); w.benches.push({ x: sx, z: sz, rot: rot + (st.ry || 0), own: w.own, busy: null, chair: true }); }
    }
    // a food cart, with a spot for its seller (city life puts someone there)
    function foodCart(v, x, z, y, rot) {
      if (!hasProp('foodcart')) return;
      putProp('foodcart', v, x, z, y, rot);
      const vd = Env.prop('foodcart', v).vendor;
      if (vd) { const [vx, vz] = toWorld(x, z, rot, vd.x, vd.z); w.vendors.push({ x: vx, z: vz, yaw: rot + (vd.ry || 0), own: w.own, p: null }); }
    }
    // a parked car from the street kit (an instanced prop, painted per car): solid, and you can stand on its roof
    function parkCar(x, z, rot, r, y = YR) {
      if (!hasProp('parked')) return;
      const n = Env._k.VARIANTS.parked || 1, v = Math.min(n - 1, (r() * n) | 0), pr = Env.prop('parked', v);
      pushInst(w.own, 'parked', v, x, y, z, rot, 1, 1, pr.paint ? pr.paint(r()) : null);
      addCollider({ box: true, x, z, hw: (pr.wid || 1.85) / 2 + 0.05, hd: (pr.len || 4.6) / 2 + 0.05, rot, y0: y, roof: { flat: (pr.h || 1.45) - 0.04 } });
    }
    function buildCityPart(f) {
      const part = f.part, M = streetMats();
      for (const s of CT.segs) if (s.part === part.key) citySeg(s, M);
      for (const n of CT.nodes) if (n.part === part.key) cityNode(n, M);
      if (part.blocks) for (const b of CT.blocks) if (part.blocks(b)) cityBlock(b, M);
      cityStops(part.key);
    }
    function cityStops(key) { for (const st of Plan.BUS.stops) if (st.part === key) putProp('busstop', 0, st.sx, st.sz, YS, st.rot); }

    /* a street between two crossings: the road with its parking lanes, crosswalks, sidewalks, curbs, and everything on them */
    function citySeg(s, M) {
      const ex = s.dir === 'x', a = ex ? s.ax : s.az, b = ex ? s.bx : s.bz, c = ex ? s.az : s.ax;
      const R = R7, Wk = WK, len = b - a - 2 * R, a0 = a + R;
      // P(along, across, y): along runs from a to b, across is +z on east-west streets and +x on north-south ones
      const P = (al, cr, yy) => (ex ? [CT.x + al, yy, CT.z + cr] : [CT.x + cr, yy, CT.z + al]);
      quad(M.road, [P(a + R, c - R, YR), P(b - R, c - R, YR), P(b - R, c + R, YR), P(a + R, c + R, YR)], [[ex ? 0 : 1, 0], [ex ? 0 : 1, len / 12], [ex ? 1 : 0, len / 12], [ex ? 1 : 0, 0]]);
      for (const [p0, p1] of [[a + R, a + R + 3], [b - R - 3, b - R]]) quad(M.zebra, [P(p0, c - R, YR + 0.004), P(p1, c - R, YR + 0.004), P(p1, c + R, YR + 0.004), P(p0, c + R, YR + 0.004)], [[0, 0], [0, 1], [1, 1], [1, 0]]);
      // sidewalks: the east-west ones run over the corners, the north-south ones stop at them
      const s0 = ex ? a + R : a + R + Wk, s1 = ex ? b - R : b - R - Wk;
      for (const sd of [-1, 1]) {
        const c0 = c + sd * R, c1 = c + sd * (R + Wk);
        const pts = [P(s0, Math.min(c0, c1), YS), P(s1, Math.min(c0, c1), YS), P(s1, Math.max(c0, c1), YS), P(s0, Math.max(c0, c1), YS)];
        quad(M.sidewalk, pts, pts.map((q) => [q[0] / 1.5, q[2] / 1.5]));
        const A = P(a + R, c0, 0), B = P(b - R, c0, 0);
        curb(A[0], A[2], B[0], B[2], ex ? 0 : -sd, ex ? -sd : 0, YR, YS);
      }
      // things along the sidewalks; al is meters from the end of the first crossing (the crosswalk is 0 to 3)
      const at = (al, sd, off) => { const q = P(a0 + al, c + sd * (R + off), 0); return [q[0], q[2]]; };
      const face = (sd) => (ex ? (sd > 0 ? Math.PI : 0) : (sd > 0 ? -Math.PI / 2 : Math.PI / 2));   // toward the road
      const drive = (sd) => (ex ? (sd > 0 ? Math.PI / 2 : -Math.PI / 2) : (sd > 0 ? Math.PI : 0));  // the way traffic goes on that side
      const mid = len / 2, down = !!DOWNTOWN[s.name], main = s.name === 'Main Street' && b <= 0;
      const parkSide = (sd) => { const [x, z] = at(mid, sd, Wk + 3); return Plan.inPark(x, z, 0); };
      const stopNear = (al, sd) => { const [x, z] = at(al, sd, Wk - 0.9); return Plan.BUS.stops.some((st) => !st.town && Math.hypot(st.sx - x, st.sz - z) < 9.5); };
      for (const sd of [-1, 1]) {
        const r = cityRng(s.ax * 7 + s.az * 3 + sd, s.bx * 5 + s.bz * 11, 41), pk = parkSide(sd);
        const put = (type, v, al, off, rot, col = true) => { const [x, z] = at(al, sd, off); putProp(type, v, x, z, YS, rot === undefined ? face(sd) : rot, 1, col); };
        // lamps and street trees in iron grates, alternating
        const lamps = sd < 0 ? [8, len - 8] : [mid];
        for (const al of lamps) put('streetlamp', 0, al, 0.7);
        const trees = sd < 0 ? [mid - 6.5] : [len - 12.5];
        for (const al of trees) {
          if (stopNear(al, sd)) continue;
          const [x, z] = at(al, sd, 1.15);
          putProp('treegrate', 0, x, z, YS + 0.002, ex ? 0 : Math.PI / 2, 1, false);
          const mp = r() < 0.65, tv = r();
          putTree(mp ? 'maple' : 'birch', (tv * (mp ? 3 : 2)) | 0, x, z, 0.72 + r() * 0.12, r() * 6);
        }
        // a hydrant near the start, a trash can near the end, a parking sign in the middle
        if (sd > 0) { put('hydrant', 0, 4.6, 0.55); put('noparking', 0, 6.4, 0.35, face(sd) + Math.PI / 2); }
        else put('trashcan', 0, len - 4.2, 0.6);
        if (!pk && r() < 0.6) put('parkingsign', 0, mid + (sd > 0 ? 3.2 : -3.2), 0.35, face(sd) + Math.PI / 2);
        // parked cars along the curb (none by the corners, the hydrant or a bus stop), with meters downtown
        const fill = down ? 0.78 : 0.6;
        let cone = !down && sd > 0 && r() < 0.08;
        for (const al of [9, 15, 21, 27, 33]) {
          if (al + 3 > len - 6 || stopNear(al, sd)) continue;
          if (down) put('parkingmeter', 0, al - 2.9, 0.42, face(sd) + Math.PI);
          if (cone) { cone = false; for (const k of [-1.8, 0, 1.8]) { const [x, z] = at(al + k, sd, -1.8); putProp('cone', 0, x, z, YR, r() * 3, 1, false); } const [bx, bz] = at(al, sd, -0.9); putProp('barrier', 0, bx, bz, YR, drive(sd) + Math.PI / 2); continue; }
          if (r() > fill) continue;
          const [x, z] = at(al + (r() - 0.5) * 0.5, sd, -1.2 + (r() - 0.5) * 0.12);
          parkCar(x, z, drive(sd) + (r() - 0.5) * 0.04, r);
        }
        // benches with their backs to the park, and on Main Street
        if (pk || main) for (const al of [15, len - 15]) { const [x, z] = at(al, sd, Wk - 0.7); putProp('bench', 0, x, z, YS, face(sd)); w.benches.push({ x, z, rot: face(sd), own: w.own, busy: null }); }
        if (main) {
          put('newsbox', (r() * 3) | 0, mid + 4, Wk - 0.5);
          if (sd > 0) { put('bikerack', 0, mid - 9.5, 0.9, face(sd) + Math.PI / 2); for (const k of [-0.8, 0.8]) if (r() < 0.75) put('bicycle', (r() * 2) | 0, mid - 9.5 + k, 1.05, face(sd) + Math.PI / 2 + 0.05, false); }
          else put('mailbox', 0, 3.6, 0.6);
        }
        // a puddle in the gutter now and then, and one on the sidewalk
        if (r() < 0.35) { const [x, z] = at(5 + r() * (len - 10), sd, -0.9); puddle(M, x, z, YR + 0.006, 1.8 + r() * 1.6, ex ? Math.PI / 2 : 0); }
        if (r() < 0.12) { const [x, z] = at(5 + r() * (len - 10), sd, 1.6); puddle(M, x, z, YS + 0.006, 1.4 + r(), r() * 3); }
      }
      // one phone booth and a street clock on Main Street, food carts by the park
      if (main && a === -110) { const [x, z] = at(mid + 2, -1, WK - 0.9); putProp('streetclock', 0, x, z, YS, 0); }
      if (main && a === -165) { const [x, z] = at(mid - 4, 1, WK - 0.8); putProp('phonebooth', 0, x, z, YS, face(1) + Math.PI); }
      for (const sd of [-1, 1]) if (parkSide(sd) && hash2(s.ax, s.az, sd) < 0.5) { const [x, z] = at(mid + 8, sd, WK - 1.3); foodCart((hash2(s.bx, s.bz, 3) * 2) | 0, x, z, YS, face(sd)); }
      // speed limit signs where the country roads come in
      for (const [nx, nz, end] of [[s.ax, s.az, 0], [s.bx, s.bz, 1]]) {
        const n = CT.nodes.find((q) => q.x === nx && q.z === nz && q.exit);
        if (!n) continue;
        const sd = end ? -1 : 1, al = end ? len - 14 : 14, [x, z] = at(al, sd, 0.4);
        putProp('speedlimit', 0, x, z, YS, drive(sd) + Math.PI);
      }
    }

    /* a crossing: the junction square, corner sidewalks, lights or stop signs, a street sign, and where a country road
       leaves the city, the street running out to the edge and narrowing down to the road */
    function cityNode(n, M) {
      const R = R7, Wk = WK, X = CT.x + n.x, Z = CT.z + n.z;
      quad(M.junction, [[X - R, YR, Z - R], [X - R, YR, Z + R], [X + R, YR, Z + R], [X + R, YR, Z - R]], [[(X - R) / 10, (Z - R) / 10], [(X - R) / 10, (Z + R) / 10], [(X + R) / 10, (Z + R) / 10], [(X + R) / 10, (Z - R) / 10]]);
      const dirs = { n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0] };
      for (const [d, [dx, dz]] of Object.entries(dirs)) {
        if (n.open[d] || n.exit === d) continue;
        const x0 = dx ? X + dx * R : X - R, x1 = dx ? X + dx * (R + Wk) : X + R, z0 = dz ? Z + dz * R : Z - R, z1 = dz ? Z + dz * (R + Wk) : Z + R;
        paveRect(M.sidewalk, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), YS);
        if (dx) curb(X + dx * R, Z - R, X + dx * R, Z + R, -dx, 0, YR, YS); else curb(X - R, Z + dz * R, X + R, Z + dz * R, 0, -dz, YR, YS);
      }
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
        if (n.open[sx > 0 ? 'e' : 'w']) continue;   // the east-west sidewalk covers this corner
        const x0 = X + sx * R, x1 = X + sx * (R + Wk), z0 = Z + sz * R, z1 = Z + sz * (R + Wk);
        paveRect(M.sidewalk, Math.min(x0, x1), Math.min(z0, z1), Math.max(x0, x1), Math.max(z0, z1), YS);
      }
      // the ways cars come in: from each open side, and from a country road
      const ins = Object.entries(dirs).filter(([d]) => n.open[d] || n.exit === d);
      if (n.signal && Env.signalHead) {
        const sig = { x: X, z: Z, heads: [], part: n.part };
        for (const [d, [dx, dz]] of ins) {
          if (!n.open[d]) continue;
          const Fx = -dx, Fz = -dz, Rx = -Fz, Rz = Fx;                       // cars coming in from side d drive along F
          const px = X + Fx * (R + 1.2) + Rx * (R + 1.2), pz = Z + Fz * (R + 1.2) + Rz * (R + 1.2);
          putProp('trafficpole', 0, px, pz, YS, Math.atan2(Rz, -Rx));
          const mt = (hasProp('trafficpole') && Env.prop('trafficpole', 0).mounts) || { arm: [{ x: 4.2, y: 5.3 }] }, am = mt.arm[mt.arm.length - 1];
          const hd = Env.signalHead(); hd.position.set(px - Rx * am.x, YS + am.y, pz - Rz * am.x); hd.rotation.y = Math.atan2(-Fx, -Fz);
          out.add(hd); w.own.objs.push(hd);
          sig.heads.push({ obj: hd, axis: dx ? 'x' : 'z' });
        }
        sig.own = w.own;
        w.signals.push(sig);
      } else if (n.deg + (n.exit ? 1 : 0) >= 3) {
        // an all way stop: a sign on the right before each crosswalk
        for (const [, [dx, dz]] of ins) putProp('stopsign', 0, X + dx * (R + 3.6) + dz * (R + 0.6), Z + dz * (R + 3.6) - dx * (R + 0.6), YS, Math.atan2(dx, dz));
      }
      // the street sign on one corner: with names on Main Street, around the park and where you come in; plain elsewhere
      {
        const ave = CT.lineName('x', n.x), st = CT.lineName('z', n.z), sx = n.open.e || n.exit === 'e' ? 1 : -1, sz = n.open.n || n.exit === 'n' ? -1 : 1;
        const x = X + sx * (R + 0.9), z = Z + sz * (R + 0.9);
        const named = n.z === 0 || n.exit || Math.abs(n.x - (CT.gates.n[0])) <= 55.5 && Math.abs(n.z) <= 55;
        if (named && Env.streetSign) addGroup(Env.streetSign(st, ave), x, z, Math.atan2(sx, sz) + Math.PI);
        else putProp('streetsign2', (Math.abs(n.x + n.z) / 55) % 4, x, z, YS, Math.atan2(sx, sz) + Math.PI);
      }
      // out to the city edge: the street with a crosswalk, then narrowing over 8 m to the two lane country road
      if (n.exit) {
        const [dx, dz] = dirs[n.exit], tx = -dz, tz = dx;
        const Q = (al, cr, y) => [X + dx * al + tx * cr, y, Z + dz * al + tz * cr];
        const e0 = R + Wk, e1 = e0 + 8, yE = H(X + dx * e1, Z + dz * e1) + 0.04;
        quad(M.road, [Q(R, -R, YR), Q(e0, -R, YR), Q(e0, R, YR), Q(R, R, YR)], [[0, 0], [0, Wk / 12], [1, Wk / 12], [1, 0]]);
        quad(M.zebra, [Q(R, -R, YR + 0.004), Q(R + 3, -R, YR + 0.004), Q(R + 3, R, YR + 0.004), Q(R, R, YR + 0.004)], [[0, 0], [0, 1], [1, 1], [1, 0]]);
        const rw = Plan.RW / 2;
        quad(M.country || M.road, [Q(e0, -R, YR), Q(e1, -rw, yE), Q(e1, rw, yE), Q(e0, R, YR)], [[1, 0], [1, 8 / 12], [0, 8 / 12], [0, 0]]);
        for (const sd of [-1, 1]) curb(Q(R, sd * R, 0)[0], Q(R, sd * R, 0)[2], Q(e0, sd * R, 0)[0], Q(e0, sd * R, 0)[2], -tx * sd, -tz * sd, YR, YS);
      }
    }

    /* a block: old concrete between and behind the buildings, then each lot, then the alleys */
    function cityBlock(b, M) {
      const X0 = CT.x + b.x, Z0 = CT.z + b.z, r = cityRng(b.c, b.r, 77), A = M.alley || M.sidewalk;
      // the alleys through the block (the drain line runs down the middle), the corners under and around the buildings plain
      paveRect(A, X0 - 2, Z0 - HB, X0 + 2, Z0 + HB, YS, (x, z) => [(x - X0) / 4 + 0.5, z / 6]);
      for (const sx of [-1, 1]) {
        const xa = sx < 0 ? X0 - HB : X0 + 2, xb = sx < 0 ? X0 - 2 : X0 + HB;
        paveRect(A, xa, Z0 - 2, xb, Z0 + 2, YS, (x, z) => [(z - Z0) / 4 + 0.5, x / 6]);
        for (const sz of [-1, 1]) paveRect(M.sidewalk, xa, sz < 0 ? Z0 - HB : Z0 + 2, xb, sz < 0 ? Z0 - 2 : Z0 + HB, YS);
      }
      for (const lot of b.lots) {
        if (lot.building) cityBuilding(lot, r);
        else if (lot.type === 'parking') parkingLot(lot, M, r);
        else plazaLot(lot, M, r, b);
      }
      cityAlleys(b, M, r);
    }
    function cityBuilding(lot, r) {
      if (!hasProp(lot.type)) return;
      const y0 = Plan.CY, pr = Env.prop(lot.type, lot.variant), x = CT.x + lot.x, z = CT.z + lot.z;
      pushInst(w.own, lot.type, lot.variant, x, y0, z, lot.rot, 1);
      addCollider({ box: true, x, z, hw: (pr.w || 15) / 2 + 0.05, hd: (pr.d || 15) / 2 + 0.05, rot: lot.rot, y0, roof: roofOf({ roof: pr.roof, roofParts: pr.roofParts, h: (pr.h || 20) - 1.5 }) });
      blockBox(x, y0, z, pr.w || 15, pr.h || 20, pr.d || 15, lot.rot);
      if (!lot.store || !hasProp('storefront')) return;
      const sv = (Env.STORE_KINDS || []).indexOf(lot.store);
      if (sv < 0) return;
      const sf = Env.prop('storefront', sv), pc = Env.cityPieces && Env.cityPieces[lot.type] && Env.cityPieces[lot.type][lot.variant];
      const dd = pc && pc.bay ? pc.bay.z : (pr.d || 15) / 2 - 0.6, sx = x + lot.fx * dd, sz = z + lot.fz * dd;
      // each store front is one of a kind, so it is merged with the others nearby instead of drawn instanced
      const sg = new THREE.Group();
      for (const part of sf.parts) { const m = new THREE.Mesh(part.geometry, part.material); m.castShadow = part.castShadow !== false; m.receiveShadow = true; if (part.depthMaterial) m.customDepthMaterial = part.depthMaterial; sg.add(m); }
      sg.userData.bake = 1; w.addObj(sg, sx, sz, lot.rot, y0);
      const [dx, dz] = toWorld(sx, sz, lot.rot, sf.door ? sf.door.x : 0, sf.door ? sf.door.z : 1.8);
      w.houses.push({ id: w.houses.length, kind: 'store', store: lot.store, x: sx, z: sz, rot: lot.rot, group: null, name: 'the ' + STORE_NAME(lot.store), door: { x: dx, z: dz, yaw: lot.rot }, doorMesh: null, room: null, own: w.own, lazy: 'store', city: true, street: lot.street, town: 'the city' });
      // a sign board on the sidewalk, and little tables against the window where they sell food
      const fr = (pr.d || 15) / 2, side = r() < 0.5 ? -1 : 1;
      { const [bx, bz] = toWorld(x, z, lot.rot, side * 3.0, fr + 0.75); putProp('sandwichboard', 0, bx, bz, YS, lot.rot + (r() - 0.5) * 0.6); }
      if (FOOD_STORES[lot.store]) for (const u of [-4.7, 4.7]) { if (Math.sign(u) === side && r() < 0.5) continue; const [tx, tz] = toWorld(x, z, lot.rot, u, fr + 0.95); cafeTable(u > 0 ? 1 : 0, tx, tz, YS, lot.rot + (r() < 0.5 ? 0 : Math.PI / 2)); }
    }

    // a point in a lot: u along its front (to the right looking out), v from its middle toward the street
    const lotP = (lot, u, v) => toWorld(CT.x + lot.x, CT.z + lot.z, lot.rot, u, v);
    const lotHU = (lot) => (lot.fz ? lot.hw : lot.hd), lotHV = (lot) => (lot.fz ? lot.hd : lot.hw);
    /* a parking lot: two rows of stalls with an aisle between, cars, wheel stops, tall lights; a booth on a big one */
    function parkingLot(lot, M, r) {
      const x = CT.x + lot.x, z = CT.z + lot.z, hu = lotHU(lot), hv = lotHV(lot), co = Math.cos(lot.rot), si = Math.sin(lot.rot);
      // the street kit paints stalls 2.6 m wide in modules of four (10.4 m) and 18 m deep (a row, a 7.2 m aisle, a row);
      // the lot is 15 m deep, so the back half and the front half each take their own end of the module
      const SW = 2.6, n = Math.floor((hu * 2 - 0.4) / SW), u0 = -(n - 1) / 2 * SW, uS = u0 - SW / 2;
      const lp = (lu, lv) => [x + lu * co + lv * si, z - lu * si + lv * co];
      const half = (v0, v1, t0, t1) => {
        const P = [[-hu, v0], [hu, v0], [hu, v1], [-hu, v1]].map(([lu, lv]) => { const [px, pz] = lp(lu, lv); return [px, YS + 0.003, pz]; });
        quad(M.parking || M.alley || M.sidewalk, P, [[(-hu - uS) / 10.4, t0], [(hu - uS) / 10.4, t0], [(hu - uS) / 10.4, t1], [(-hu - uS) / 10.4, t1]]);
      };
      half(-hv, 0, 0, hv / 18); half(0, hv, 1 - hv / 18, 1);
      for (const row of [1, -1]) {
        const vc = row * (hv - 2.95);
        for (let i = 0; i < n; i++) {
          const u = u0 + i * SW;
          if (row > 0 && i === 0) continue;                     // the way in from the street
          if (row > 0 && i === 1 && n > 6) { const [bx, bz] = lotP(lot, u, vc + 0.6); putProp('parkbooth', 0, bx, bz, YS, lot.rot + Math.PI / 2); continue; }
          { const [wx, wz] = lotP(lot, u, row * (hv - 0.75)); putProp('wheelstop', (r() * 2) | 0, wx, wz, YS, lot.rot, 1, false); }
          if (r() > 0.68) continue;
          const back = r() < 0.2, [cx, cz] = lotP(lot, u + (r() - 0.5) * 0.2, vc + (r() - 0.5) * 0.2);
          parkCar(cx, cz, lot.rot + (row > 0 ? 0 : Math.PI) + (back ? Math.PI : 0) + (r() - 0.5) * 0.05, r, YS + 0.003);
        }
      }
      for (const u of n > 6 ? [-hu + 0.45, hu - 0.45] : [hu - 0.45]) { const [lx, lz] = lotP(lot, u, 0); putProp('lotlight', n > 6 ? 0 : 1, lx, lz, YS, lot.rot); }
      { const [sx, sz] = lotP(lot, u0 - 1.0, hv - 0.35); putProp('parkingsign', 0, sx, sz, YS, lot.rot); }
      if (r() < 0.5) { const [px, pz] = lotP(lot, (r() - 0.5) * hu, (r() - 0.5) * 2); puddle(M, px, pz, YS + 0.009, 2 + r() * 1.5, r() * 3); }
    }
    /* a small plaza: stone paving, trees in grates, benches, a food cart, cafe tables, a statue or planters */
    function plazaLot(lot, M, r, b) {
      const x = CT.x + lot.x, z = CT.z + lot.z, hu = lotHU(lot), hv = lotHV(lot), y = YS + 0.003;
      paveRect(M.plaza || M.paving || M.sidewalk, x - lot.hw, z - lot.hd, x + lot.hw, z + lot.hd, y, mUV(3.6));
      const put = (type, v, u, vv, rot, col = true) => { const [px, pz] = lotP(lot, u, vv); putProp(type, v, px, pz, y, lot.rot + rot, 1, col); };
      for (const su of [-1, 1]) {
        const [tx, tz] = lotP(lot, su * (hu - 2.6), -(hv - 2.6));
        putProp('treegrate', 0, tx, tz, y + 0.002, lot.rot, 1, false);
        putTree(r() < 0.5 ? 'maple' : 'birch', (r() * 2) | 0, tx, tz, 0.8 + r() * 0.15, r() * 6);
        { const [bx, bz] = lotP(lot, su * (hu - 1.0), 0.6), br = lot.rot + (su > 0 ? -Math.PI / 2 : Math.PI / 2); putProp('bench', 0, bx, bz, y, br); w.benches.push({ x: bx, z: bz, rot: br, own: w.own, busy: null }); }
        put('parklamp', 0, su * (hu - 0.7), hv - 0.9, 0);
      }
      put('bench', 0, 0, -(hv - 1.0), 0);
      if ((b.c + b.r) % 2) put('statue', b.c % 2, 0, -0.6, Math.PI);
      else { put('planterbox', 0, -2.2, -0.8, 0); put('planterbox', 0, 2.2, -0.8, 0); }
      for (const [v, u, vv] of [[0, -3.2, 3.0], [1, 3.0, 3.4]]) { const [tx, tz] = lotP(lot, u, vv); cafeTable(v, tx, tz, y, lot.rot + r() * 3); }
      { const [fx, fz] = lotP(lot, hu - 3.0, hv - 2.4); foodCart((r() * 2) | 0, fx, fz, y, lot.rot + Math.PI / 2); }
      put('trashcan', 0, -(hu - 0.8), hv - 0.9, 0);
      put('drinking', 0, -(hu - 3.6), -(hv - 0.8), 0);
      // where Main Street meets the park: a clock to meet by
      if (lot.street === 'Park Avenue' && b.r === 2) put('streetclock', 0, -(hu - 2.2), hv - 2.0, 0);
    }
    /* the alleys between the quarter lots: dumpsters, bags, bins, pallets and crates against the walls, a puddle or two */
    function cityAlleys(b, M, r) {
      const X0 = CT.x + b.x, Z0 = CT.z + b.z, lotAt = (at) => b.lots.find((q) => q.at === at);
      const arms = { n: [0, -1, 'nw', 'ne'], s: [0, 1, 'sw', 'se'], w: [-1, 0, 'nw', 'sw'], e: [1, 0, 'ne', 'se'] };
      // type, variant, how far its middle stands off the wall, solid (gas meters and the wall unit hang on the wall itself)
      const STUFF = [['dumpster', 0, 1.0, 1], ['dumpster', 1, 1.0, 1], ['trashbags', 0, 0.6, 0], ['trashbags', 1, 0.6, 0], ['recycling', 0, 0.55, 1], ['pallet', 0, 0.3, 0],
        ['crates', 0, 0.6, 1], ['crates', 1, 0.5, 1], ['acunit', 0, 0.55, 1], ['acunit', 1, 0.0, 0], ['gaspipe', 0, 0.0, 0], ['gaspipe', 1, 0.0, 0]];
      let any = false;
      for (const k in arms) {
        if (!b.open[k]) continue;
        any = true;
        const [dx, dz, la, lb] = arms[k], A = lotAt(la), B = lotAt(lb), tx = -dz, tz = dx;
        // along the arm from the middle of the block (t = 2) out to the street (t = 17)
        const pos = (t, side, off) => [X0 + dx * t + tx * side * (2 - off), Z0 + dz * t + tz * side * (2 - off)];
        for (const side of [-1, 1]) {
          const L = [A, B].find((q) => q && Math.sign((q.x - b.x) * tx + (q.z - b.z) * tz) === side);
          if (!L || !L.building) continue;
          let t = 3.2 + r() * 2;
          const yaw = Math.atan2(-tx * side, -tz * side);   // facing out of the wall
          while (t < 15.5) {
            const [type, v, depth, solid] = STUFF[(r() * STUFF.length) | 0];
            const [px, pz] = pos(t, side, depth);
            if (hasProp(type)) putProp(type, v, px, pz, YS, yaw + (type === 'trashbags' ? r() * 2 : type === 'crates' ? (r() - 0.5) * 0.6 : 0), 1, !!solid);
            t += type === 'dumpster' ? 3.4 : 1.6 + r() * 2.4;
          }
        }
        if (r() < 0.45) { const t = 4 + r() * 10; puddle(M, X0 + dx * t, Z0 + dz * t, YS + 0.006, 1.6 + r() * 1.4, dx ? 0 : Math.PI / 2); }
        // now and then a fence across part of the alley mouth
        if (r() < 0.22) { const t = HB - 0.3, [px, pz] = pos(t, r() < 0.5 ? -1 : 1, 1.55); putProp('fence8', (r() * 2) | 0, px, pz, YS, Math.atan2(-dx, -dz)); }
      }
      if (any && r() < 0.5) puddle(M, X0 + (r() - 0.5), Z0 + (r() - 0.5), YS + 0.006, 2.2 + r(), r() * 3);
      // a cat that lives in the alleys of some blocks
      if (typeof SPECIES !== 'undefined' && SPECIES.cat && b.open.n && b.open.s && b.open.w && b.open.e && hash2(b.c, b.r, 31) < 0.6) w.events.push({ kind: 'home', own: w.own.key, sp: 'cat', n: 1, home: [X0, Z0], range: 9 });
    }

    /* the city park: paths, the fountain, the pond, a bandstand, a playground, trees, benches and lamps */
    function buildPark(f) {
      const M = streetMats(), P0 = CT.park, cx = CT.x + (P0.x0 + P0.x1) / 2, cz = CT.z + (P0.z0 + P0.z1) / 2;
      const hw = (P0.x1 - P0.x0) / 2, hd = (P0.z1 - P0.z0) / 2, y0 = Plan.CY + 0.03, yp = Plan.CY + 0.04;
      const pond = { x: CT.x + CT.pond.x, z: CT.z + CT.pond.z, r: CT.pond.r };
      const paths = [];
      const path = (ax, az, bx, bz, wd) => { paths.push([ax, az, bx, bz, wd]); const L = Math.hypot(bx - ax, bz - az), lx = (bz - az) / L * wd / 2, lz = -(bx - ax) / L * wd / 2;
        const pts = [[ax - lx, yp, az - lz], [bx - lx, yp, bz - lz], [bx + lx, yp, bz + lz], [ax + lx, yp, az + lz]]; quad(M.paving, pts, pts.map((q) => [q[0] / 2, q[2] / 2])); };
      // a ring path, and paths in from the four sides to the fountain plaza
      const ri = 9;
      path(cx - hw + ri, cz - hd + ri, cx + hw - ri, cz - hd + ri, 3); path(cx - hw + ri, cz + hd - ri, cx + hw - ri, cz + hd - ri, 3);
      path(cx - hw + ri, cz - hd + ri, cx - hw + ri, cz + hd - ri, 3); path(cx + hw - ri, cz - hd + ri, cx + hw - ri, cz + hd - ri, 3);
      path(cx - hw - 0.5, cz, cx - 9, cz, 4); path(cx + 9, cz, cx + hw + 0.5, cz, 3.5); path(cx, cz - hd - 0.5, cx, cz - 9, 3.5); path(cx, cz + 9, cx, cz + hd + 0.5, 3.5);
      // the plaza: a round paved circle
      { const n = 28, r = 10; for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 1) / n * TAU; const pts = [[cx, yp + 0.002, cz], [cx + Math.cos(a1) * r, yp + 0.002, cz + Math.sin(a1) * r], [cx + Math.cos(a0) * r, yp + 0.002, cz + Math.sin(a0) * r], [cx, yp + 0.002, cz]]; quad(M.paving, pts, pts.map((q) => [q[0] / 2, q[2] / 2])); } }
      if (Env.fountain) { const fg = addGroup(Env.fountain(), cx, cz, 0, y0); for (const c of (fg && fg.userData.rim) || []) addCollider({ x: cx + c.x, z: cz + c.z, r: c.r }); }
      const onPath = (x, z, pad) => paths.some(([ax, az, bx, bz, wd]) => segDist(x, z, ax, az, bx, bz) < wd / 2 + pad) || Math.hypot(x - cx, z - cz) < 10 + pad;
      // the bandstand by the pond, the playground in the north west corner, a statue at the Main Street gate
      const gz = { x: CT.x + CT.gazebo.x, z: CT.z + CT.gazebo.z }; putProp('gazebo', 0, gz.x, gz.z, y0, Math.PI / 8);
      if (Env.playground) w.addPlayground({ x: cx - 22, z: cz - 22, rot: 0, extra: true });
      putProp('statue', 0, cx - hw + 4, cz - 6, y0, -Math.PI / 2);
      putProp('statue', 1, cx - hw + 4, cz + 6, y0, -Math.PI / 2);
      for (const [dx, dz] of [[-6, -6], [6, -6], [-6, 6], [6, 6]]) putProp('flowerbed', (dx + dz === 0 ? 1 : 0), cx + dx * 1.9, cz + dz * 1.9, y0, 0);
      // benches along the paths, facing them; lamps; picnic tables by the pond
      const benchAt = (x, z, rot) => { putProp('parkbench', 0, x, z, y0, rot); w.benches.push({ x, z, rot, own: w.own, busy: null }); };
      for (const t of [-0.6, -0.2, 0.2, 0.6]) { benchAt(cx + t * hw * 1.6 / 2 * 2 * 0.5, cz - hd + ri - 2.6, 0); benchAt(cx + t * hw * 0.8, cz + hd - ri + 2.6, Math.PI); }
      for (const t of [-0.5, 0.5]) { benchAt(cx - hw + ri - 2.6, cz + t * hd, Math.PI / 2); benchAt(cx + hw - ri + 2.6, cz + t * hd, -Math.PI / 2); }
      for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; benchAt(cx + Math.cos(a) * 12, cz + Math.sin(a) * 12, Math.atan2(-Math.cos(a), -Math.sin(a))); }
      for (const [x, z] of [[cx - hw + ri, cz - hd + ri], [cx + hw - ri, cz - hd + ri], [cx - hw + ri, cz + hd - ri], [cx + hw - ri, cz + hd - ri], [cx - 25, cz + 1.8], [cx + 25, cz + 1.8], [cx + 1.8, cz - 25], [cx + 1.8, cz + 25]]) putProp('parklamp', 0, x, z, y0, 0);
      for (const t of [-1, 1]) putProp('picnic', 0, pond.x + t * 6, pond.z - pond.r - 6, y0, 0.3 * t);
      putProp('drinking', 0, cx - 22 + 9, cz - 22 + 7, y0, 0);
      putProp('trashcan', 0, cx + 2.2, cz - 11, y0, 0); putProp('trashcan', 0, cx - 11, cz + 2.2, y0, 0);
      // trees on the lawns, not on paths, the pond, the plaza, the bandstand or the playground
      const rr = rng(4242);
      let n = 0;
      for (let k = 0; k < 500 && n < 60; k++) {
        const x = cx + (rr() * 2 - 1) * (hw - 2), z = cz + (rr() * 2 - 1) * (hd - 2);
        if (onPath(x, z, 3.2) || Math.hypot(x - pond.x, z - pond.z) < pond.r + 4.5 || Math.hypot(x - gz.x, z - gz.z) < 8 || (Math.abs(x - (cx - 22)) < 10 && Math.abs(z - (cz - 22)) < 8)) continue;
        if (!gapOK(x, z, 6)) continue;
        const kind = rr(), sc = 0.9 + rr() * 0.35;
        putTree(kind < 0.4 ? 'oak' : kind < 0.75 ? 'maple' : 'birch', (rr() * (kind < 0.75 ? 3 : 2)) | 0, x, z, sc, rr() * TAU);
        markPlaced(x, z, 6); n++;
      }
      // a willow leaning over the pond
      putTree('willow', 0, pond.x + pond.r + 2.5, pond.z + 3, 1.1, 1.2);
      cityStops('city-park');
    }

    /* Maple Town: paved streets, a downtown sidewalk on Maple Street, lamps, street trees, the town green */
    w.addTown = (T) => {
      const M = streetMats(), y = T.y + 0.035, R = Plan.ST_W / 2;
      for (const s of T.streets) ribbon(M.country, straight(s.a[0], s.a[1], s.b[0], s.b[1], y), Plan.ST_W);
      // crossings: where two streets meet, a plain square on top
      const cross = [];
      for (const s of T.streets) for (const q of T.streets) {
        if (s === q || s.a[1] !== s.b[1] || q.a[0] !== q.b[0]) continue;   // s runs east-west, q north-south
        const x = q.a[0], z = s.a[1];
        if (x >= Math.min(s.a[0], s.b[0]) - 0.1 && x <= Math.max(s.a[0], s.b[0]) + 0.1 && z >= Math.min(q.a[1], q.b[1]) - 0.1 && z <= Math.max(q.a[1], q.b[1]) + 0.1) cross.push([x, z, s.name, q.name]);
      }
      for (const [x, z, a, b] of cross) {
        paveRect(M.junction, x - R, z - R, x + R, z + R, y + 0.003, (u, v) => [u / 10, v / 10]);
        if (Env.streetSign) addGroup(Env.streetSign(a, b), x - R - 1.2, z - R - 1.2, Math.PI / 4);
      }
      // downtown: sidewalks in front of the Maple Street shops
      for (const sd of [-1, 1]) {
        const z0 = -55 + sd * R, z1 = -55 + sd * (R + 4.6);   // up to the shop fronts
        for (const [x0, x1] of [[139, 191.5], [198.5, 252.5]]) {
          if (sd > 0 && x0 > 195) continue;   // the green is there
          paveRect(M.sidewalk, x0, Math.min(z0, z1), x1, Math.max(z0, z1), y + 0.03);
          curb(x0, z0, x1, z0, 0, -sd, y, y + 0.03 + 0.02);
        }
      }
      // lamps along every street, alternating sides; maples along Elm and Birch Streets
      for (const s of T.streets) {
        const ex = s.a[1] === s.b[1], L = Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]);
        for (let d = 12, k = 0; d < L - 6; d += 24, k++) {
          const sd = k % 2 ? 1 : -1, t = d / L, x = s.a[0] + (s.b[0] - s.a[0]) * t, z = s.a[1] + (s.b[1] - s.a[1]) * t;
          const px = ex ? x : x + sd * (R + 0.9), pz = ex ? z + sd * (R + 0.9) : z;
          if (cross.some(([cx2, cz2]) => Math.hypot(px - cx2, pz - cz2) < 7)) continue;
          putProp('parklamp', 0, px, pz, T.y + 0.02, 0);
        }
      }
      // street trees on the verge between the houses
      for (const z of [2, 54]) for (const sd of [-1, 1]) {
        const xs = T.lots.filter((q) => q.kind === 'house' && Math.abs(q.z - (z + sd * 13.5)) < 3).map((q) => q.x).sort((p2, q2) => p2 - q2);
        for (let i = 0; i < xs.length - 1; i++) {
          if (xs[i + 1] - xs[i] > 30) continue;
          const px = (xs[i] + xs[i + 1]) / 2, pz = z + sd * (R + 1.3);
          if (Math.abs(px - 135) < 8 || Math.abs(px - 195) < 8) continue;
          putTree('maple', (i + sd + 2) % 3, px, pz, 0.85, px);
        }
      }
      // the town green: paths, a bandstand, benches, flower beds, trees and lamps
      const G0 = T.green, gy = T.y + 0.04;
      for (const [ax, az, bx, bz] of [[G0.x - G0.hw, G0.z, G0.x + G0.hw, G0.z], [G0.x, G0.z - G0.hd, G0.x, G0.z + G0.hd]]) {
        const L = Math.hypot(bx - ax, bz - az), lx = (bz - az) / L * 1.5, lz = -(bx - ax) / L * 1.5;
        const pts = [[ax - lx, gy, az - lz], [bx - lx, gy, bz - lz], [bx + lx, gy, bz + lz], [ax + lx, gy, az + lz]];
        quad(M.paving, pts, pts.map((q) => [q[0] / 2, q[2] / 2]));
      }
      putProp('gazebo', 0, G0.x, G0.z, T.y, 0);
      for (const [dx, dz] of [[-12, -10], [12, -10], [-12, 10], [12, 10]]) putProp('flowerbed', dx > 0 ? 1 : 0, G0.x + dx, G0.z + dz, T.y, 0);
      for (const [dx, dz, r] of [[-8, -3, 0], [8, -3, 0], [-8, 3, Math.PI], [8, 3, Math.PI], [-3, -14, Math.PI / 2], [3, 14, -Math.PI / 2]]) putProp('parkbench', 0, G0.x + dx, G0.z + dz, T.y, r);
      for (const [dx, dz] of [[-19, -17], [19, -17], [-19, 17], [19, 17], [-20, 0], [20, 6]]) putTree(dx < 0 ? 'oak' : 'maple', (dx + dz) & 1, G0.x + dx, G0.z + dz, 1.05, dx);
      for (const [dx, dz] of [[-3, -8], [3, 8], [-16, 2.5], [16, -2.5]]) putProp('parklamp', 0, G0.x + dx, G0.z + dz, T.y + 0.03, 0);
      // welcome signs at the edges of town, and the way to the city
      if (Env.townSign) { addGroup(Env.townSign('Maple Town'), 40, -61, -Math.PI / 2); addGroup(Env.townSign('Maple Town'), 262, -61, Math.PI / 2); }
      if (Env.roadSign) addGroup(Env.roadSign('City', 'up'), 250, -48.8, -Math.PI / 2);
      for (const st of Plan.BUS.stops) if (st.town) putProp('busstop', 0, st.sx, st.sz, T.y + 0.02, st.rot);
      finishSurfaces(null);
    };

    /* small towns around the city */
    function buildSmallTown(t) {
      const M = streetMats(), y = t.y + 0.035, R = Plan.ST_W / 2, ax = t.axis === 'x', hl = t.len / 2;
      ribbon(M.country, straight(t.street.a[0], t.street.a[1], t.street.b[0], t.street.b[1], y), Plan.ST_W);
      // a square where the road comes in
      const jx = ax ? t.x : t.x + t.roadSide * 0, jz = ax ? t.z : t.z;
      paveRect(M.junction, jx - R, jz - R, jx + R, jz + R, y + 0.003, (u, v) => [u / 10, v / 10]);
      for (const L of t.lots) w.addHouse(L);
      const P = (u, c) => (ax ? [t.x + u, t.z + c] : [t.x + c, t.z + u]);
      // lamps, trees between the lots, signs at both ends, a bench and a mailbox by the shops
      for (let u = -hl + 6, k = 0; u <= hl - 6; u += 20, k++) { const sd = k % 2 ? 1 : -1; if (Math.abs(u) < 6 && sd === t.roadSide) continue; const [x, z] = P(u, sd * (R + 0.9)); putProp('parklamp', 0, x, z, t.y + 0.02, 0); }
      for (let u = -50; u <= 50; u += 20) for (const sd of [-1, 1]) { if (Math.abs(u) < 12 && sd === t.roadSide) continue; const [x, z] = P(u, sd * (R + 4)); putTree(u % 40 ? 'maple' : 'oak', (u / 20 + sd + 8) % 2 | 0, x, z, 0.95, u); }
      // the welcome sign stands beside the road coming in, facing the people arriving
      if (Env.townSign) { const [x, z] = P(-7, t.roadSide * (R + 7)); addGroup(Env.townSign(t.name), x, z, ax ? (t.roadSide > 0 ? 0 : Math.PI) : (t.roadSide > 0 ? Math.PI / 2 : -Math.PI / 2)); }
      const shop = t.lots.find((q) => q.kind === 'shop');
      if (shop) { const sd = -t.roadSide; const [x, z] = P(6.5, sd * (R + 1.5)); putProp('bench', 0, x, z, t.y, ax ? (sd > 0 ? Math.PI : 0) : (sd > 0 ? -Math.PI / 2 : Math.PI / 2)); const [mx, mz] = P(-6.5, sd * (R + 1.2)); putProp('mailbox', 0, mx, mz, t.y, ax ? (sd > 0 ? Math.PI : 0) : (sd > 0 ? -Math.PI / 2 : Math.PI / 2)); }
    }

    /* country roads: a ribbon that follows the smoothed ground, in 100 m pieces */
    function buildRoad(f) {
      const r = f.road, M = streetMats(), n = Math.max(2, Math.ceil((f.s1 - f.s0) / 4) + 1), S = [];
      for (let i = 0; i < n; i++) {
        const s = f.s0 + (f.s1 - f.s0) * i / (n - 1), [x, z] = Plan.roadAt(r, s);
        // the left direction from the road's direction around this point (smooth at bends)
        const [xa, za] = Plan.roadAt(r, Math.max(0, s - 3)), [xb, zb] = Plan.roadAt(r, Math.min(r.len, s + 3)), L = Math.hypot(xb - xa, zb - za) || 1;
        S.push({ x, z, y: Plan.roadY(r, s) + 0.04, s, lx: (zb - za) / L, lz: -(xb - xa) / L });
      }
      ribbon(M.country, S, Plan.RW);
    }

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
      else if (f.kind === 'city') buildCityPart(f);
      else if (f.kind === 'park') buildPark(f);
      else if (f.kind === 'stown') buildSmallTown(f.town);
      else if (f.kind === 'road') buildRoad(f);
      w.own = null;
      finishSurfaces(own);
      if (w.bakeStatic) w.bakeStatic(own.objs.slice(), own);
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
      // the farmer's carrot garden, with traps to keep the pests out
      const [gx, gz] = Pt(1, 6); w.addGarden({ x: gx, z: gz, w: 6, d: 4.5, rot: f.rot });
      for (const lx of [-4.6, 4.6]) { const [x, z] = Pt(1 + lx, 6.5); w.addBoxTrap(x, z, Math.atan2(x - gx, z - gz)); }
      w.events.push({ kind: 'pen', own: w.own.key, pen, sp: pigs ? 'pig' : goats ? 'goat' : 'horse', n: pigs ? 2 : goats ? 3 : 2, kids: pigs ? 2 : 1 });
      w.events.push({ kind: 'pen', own: w.own.key, pen: coop, sp: 'chicken', n: 3, kids: 1 });
    }
    function unbuildFeature(own) {
      dropOwner(own);
      w.blockers = w.blockers.filter((b) => b.own !== own);
      w.gates = w.gates.filter((g) => g.own !== own);
      w.enclosures = w.enclosures.filter((e) => e.own !== own);
      const gone = new Set(w.traps.filter((t) => t.own === own).map((t) => t.obj));
      if (gone.size) w.anims = w.anims.filter((a) => !gone.has(a.group));
      w.traps = w.traps.filter((t) => t.own !== own);
      w.fishTraps = w.fishTraps.filter((t) => t.own !== own);
      w.signals = w.signals.filter((q) => q.own !== own);
      w.benches = w.benches.filter((q) => q.own !== own);
      w.vendors = w.vendors.filter((q) => q.own !== own);
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
      if (part.tint) im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(cap * 3).fill(1), 3);
      out.add(im);
      return im;
    }
    const lists = new Map();
    // plants within reach and not behind the camera (a wide cone, so turning around doesn't show gaps before the next rebuild)
    function rebuildPools(px, pz, far, fx, fz) {
      poolX = px; poolZ = pz; poolFX = fx; poolFZ = fz; poolDirty = false; poolT = 0;
      const lim = far + 15, limS = 75, limM = Math.min(lim, 150);
      for (const L of lists.values()) { L.near.length = 0; L.far.length = 0; L.lod.length = 0; }
      const add = (o) => {
        for (const [key, e] of o.items) {
          let L = lists.get(key);
          if (!L) { const pr = Env.prop(e.type, e.variant); lists.set(key, (L = { e, near: [], far: [], lod: [], hasLod: !!(pr.lod && pr.lod.parts && (BIG[e.type] || pr.lodD)), lodD: pr.lodD || LOD_D })); }
          const lm = e.small ? limS : e.mid ? limM : lim;
          for (let i = 0; i < e.xs.length; i++) {
            const dx = e.xs[i] - px, dz = e.zs[i] - pz;
            if (Math.abs(dx) > lm || Math.abs(dz) > lm) continue;
            const d = Math.hypot(dx, dz); if (d > lm) continue;
            if (d > 40 && (dx * fx + dz * fz) < -0.3 * d) continue;
            (L.hasLod && d > L.lodD ? L.lod : BIG[e.type] || d < SHADOW_R ? L.near : L.far).push(e, i);
          }
        }
      };
      add(w.stat);
      for (const t of w.tiles.values()) add(t);
      for (const o of w.feats.values()) add(o);
      const fill = (im, arr, tint) => {
        const a = im.instanceMatrix.array, ca = tint && im.instanceColor ? im.instanceColor.array : null;
        for (let i = 0, n = 0; i < arr.length; i += 2, n++) {
          const e = arr[i], j = arr[i + 1];
          a.set(e.ms.subarray(j * 16, j * 16 + 16), n * 16);
          if (ca) { if (e.cs) ca.set(e.cs.subarray(j * 3, j * 3 + 3), n * 3); else ca.fill(1, n * 3, n * 3 + 3); }
        }
        im.count = arr.length / 2; im.instanceMatrix.needsUpdate = true; if (ca) im.instanceColor.needsUpdate = true;
        im.visible = im.count > 0;   // an empty one would still cost a draw
      };
      for (const [key, L] of lists) {
        const nN = L.near.length / 2, nF = L.far.length / 2, nL = L.lod.length / 2;
        let p = pools.get(key);
        if (!p) {
          if (!nN && !nF && !nL) continue;
          const pr = Env.prop(L.e.type, L.e.variant);
          p = { cap: 0, parts: pr.parts.map((part) => ({ part, near: null, far: null })), lod: L.hasLod ? pr.lod.parts.map((part) => ({ part, im: null })) : [] };
          pools.set(key, p);
        }
        const need = Math.max(nN, nF, nL);
        if (need > p.cap) {
          p.cap = Math.ceil(need * 1.4) + 8;
          for (const q of p.parts) { if (q.near) { out.remove(q.near); q.near.dispose(); out.remove(q.far); q.far.dispose(); } q.near = makeIM(q.part, p.cap, true); q.far = makeIM(q.part, p.cap, false); q.near.name = q.far.name = key; }
          for (const q of p.lod) { if (q.im) { out.remove(q.im); q.im.dispose(); } q.im = makeIM(q.part, p.cap, true); q.im.name = key + ':lod'; }
        }
        for (const q of p.parts) { fill(q.near, L.near, q.part.tint); fill(q.far, L.far, q.part.tint); }
        for (const q of p.lod) fill(q.im, L.lod, q.part.tint);
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
        // fixed places (the city, the small towns, the roads)
        for (const f of def.places || []) if (!w.feats.has(f.key) && Math.hypot(f.x - px, f.z - pz) < R + 30 + f.reach * 0.5) buildFeature(f);
        for (const own of [...w.feats.values()]) {
          const f = own.f;
          if (Math.hypot(f.x - px, f.z - pz) > R + 140 + (f.reach || 0) * 0.5 && !(w.room && w.room.house && w.room.house.own === own)) unbuildFeature(own);
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
    w.doorTo = (group, which, open, speed) => {
      if (!group) return;
      let a = w.anims.find((q) => q.group === group && q.which === which);
      if (!a) { if (!open) return; w.anims.push((a = { group, which, t: 0, hold: 0, speed: 2.2 })); }
      a.hold = open ? 1e9 : 0;
      if (speed) a.speed = speed;
      return a;
    };
    // open a building's door for a while (which = door index, or all of them)
    w.openDoor = (group, hold = 1.2, which, speed = 2.6) => {
      if (!group) return;
      let a = w.anims.find((q) => q.group === group && q.which === which);
      if (!a) w.anims.push((a = { group, which, t: 0, hold, speed }));
      a.hold = Math.max(a.hold, hold);
    };
    /* static batching: houses, fences, kennels, signs and the like are merged into a few big meshes per 128 m cell and
       material, instead of one draw per piece (a street of houses was hundreds of draws). The original groups stay out of
       the scene for the camera's wall test; doors that swing keep their own mesh in a holder at the old spot. */
    const _bm = new THREE.Matrix4(), _bn = new THREE.Matrix3(), _bv = new THREE.Vector3(), _bs = new THREE.Sphere();
    const BAKE_ATTR = { position: 3, normal: 3, uv: 2, color: 3, glow: 1, tint: 1 };
    // materials whose vertex shader moves things relative to the object (sway, flutter, cards, hanging, falling) stay unbaked
    const moves = (mt) => { if (!mt || Array.isArray(mt) || !mt.customProgramCacheKey) return false; const k = String(mt.customProgramCacheKey()).split('|'); return k[0] === 'envmat-s' && (k[3] !== '0' || k[4] !== '0' || k[6] === '1' || k[7] === '1' || k[8] === '1'); };
    w.bakeStatic = (objs, own) => {
      const cells = new Map(), skip = new Set();
      let nIn = 0;
      for (const g of objs) {
        if (!g || !g.userData || !g.userData.bake || g.parent !== out) continue;
        g.updateMatrixWorld(true);
        // swinging doors: keep them as they are, under a holder with their parent's world matrix
        for (const d of (g.userData.doors || [])) {
          const o = d && d.obj; if (!o || !o.parent) continue;
          const hold = new THREE.Group(); hold.matrixAutoUpdate = false; hold.matrix.copy(o.parent.matrixWorld);
          hold.matrixWorld.copy(hold.matrix);
          o.parent.remove(o); hold.add(o); out.add(hold); if (own) own.objs.push(hold);
          o.traverse((m) => skip.add(m));
        }
        let ok = true;
        g.traverse((m) => { if (m.isMesh && !skip.has(m) && (m.isInstancedMesh || m.isSkinnedMesh || m.geometry.attributes.card || m.geometry.attributes.hang || moves(m.material) || m.onBeforeRender !== THREE.Object3D.prototype.onBeforeRender)) ok = false; });
        if (!ok) { for (const d of (g.userData.doors || [])) if (d && d.obj) skip.delete(d.obj); continue; }
        g.traverse((m) => {
          if (!m.isMesh || skip.has(m) || !m.visible) return;
          const geo = m.geometry, A = geo.attributes;
          const names = Object.keys(A).filter((k) => BAKE_ATTR[k] === A[k].itemSize).sort();
          if (!A.position || names.length !== Object.keys(A).length) return;
          if (!geo.boundingSphere) geo.computeBoundingSphere();
          _bs.copy(geo.boundingSphere).applyMatrix4(m.matrixWorld);
          const ck = Math.floor(_bs.center.x / 128) + ',' + Math.floor(_bs.center.z / 128);
          const key = ck + '|' + m.material.uuid + '|' + names.join(',') + '|' + (m.castShadow ? 1 : 0) + (m.receiveShadow ? 1 : 0);
          let c = cells.get(key);
          if (!c) cells.set(key, (c = { mat: m.material, depth: m.customDepthMaterial || null, cast: m.castShadow, recv: m.receiveShadow, names, parts: [] }));
          c.parts.push({ geo, mw: m.matrixWorld.clone() });
          nIn++;
        });
        out.remove(g);
      }
      let nOut = 0;
      for (const c of cells.values()) {
        let n = 0;
        for (const q of c.parts) n += q.geo.index ? q.geo.index.count : q.geo.attributes.position.count;
        const arr = {}; for (const k of c.names) arr[k] = new Float32Array(n * BAKE_ATTR[k]);
        let o = 0;
        for (const q of c.parts) {
          const geo = q.geo, idx = geo.index ? geo.index.array : null, cnt = idx ? idx.length : geo.attributes.position.count;
          _bm.copy(q.mw); _bn.getNormalMatrix(_bm);
          const flip = _bm.determinant() < 0;
          for (const k of c.names) {
            const src = geo.attributes[k], sz = BAKE_ATTR[k], dst = arr[k];
            for (let i = 0; i < cnt; i++) {
              // keep the winding when a mirror transform flips it
              const t = flip ? i - (i % 3) + [0, 2, 1][i % 3] : i;
              const v = idx ? idx[t] : t, j = (o + i) * sz;
              if (k === 'position') { _bv.fromBufferAttribute(src, v).applyMatrix4(_bm); dst[j] = _bv.x; dst[j + 1] = _bv.y; dst[j + 2] = _bv.z; }
              else if (k === 'normal') { _bv.fromBufferAttribute(src, v).applyMatrix3(_bn).normalize(); dst[j] = _bv.x; dst[j + 1] = _bv.y; dst[j + 2] = _bv.z; }
              else for (let e = 0; e < sz; e++) dst[j + e] = src.array[v * sz + e];
            }
          }
          o += cnt;
        }
        const bg = new THREE.BufferGeometry();
        for (const k of c.names) bg.setAttribute(k, new THREE.BufferAttribute(arr[k], BAKE_ATTR[k]));
        bg.computeBoundingSphere(); bg.computeBoundingBox();
        const mesh = new THREE.Mesh(bg, c.mat);
        mesh.castShadow = c.cast; mesh.receiveShadow = c.recv; if (c.depth) mesh.customDepthMaterial = c.depth;
        mesh.matrixAutoUpdate = false; mesh.updateMatrixWorld(true);
        out.add(mesh);
        if (own) own.meshes.push(mesh); else w.disposables.push(bg);
        nOut++;
      }
      const st = { meshesIn: nIn, meshesOut: nOut };
      if (!own) w.bakeStats = st;
      return st;
    };
    w.dispose = () => {
      for (const t of w.tiles.values()) for (const m of t.meshes) m.geometry.dispose();
      for (const d of w.disposables) d.dispose();
      for (const c of w.cover) c.mesh.dispose();
      for (const p of pools.values()) { for (const q of p.parts) { if (q.near) { q.near.dispose(); q.far.dispose(); } } for (const q of p.lod || []) if (q.im) q.im.dispose(); }
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
    w.bakeStatic(out.children.slice());
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
