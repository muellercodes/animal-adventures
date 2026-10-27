/* ---------- the Land's towns and city: Maple Town, the city with its park, the small towns and the roads between ----------
   Rosemary's plan: Maple Street grows into a big town, a city sits close by (tall buildings, stores, cars and buses,
   a big park), and smaller towns sit all around the city. This file only says where things go and how the ground is
   shaped; 50_world builds them. x runs east, z runs south (the map shows -z at the top). */
const Plan = (() => {
  const PI = Math.PI;
  const sm = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
  const segT = (px, pz, ax, az, bx, bz) => { const vx = bx - ax, vz = bz - az, L2 = vx * vx + vz * vz; return L2 > 0 ? Math.max(0, Math.min(1, ((px - ax) * vx + (pz - az) * vz) / L2)) : 0; };
  const rectD = (R, x, z) => { const c = Math.cos(R.rot || 0), s = Math.sin(R.rot || 0), dx = x - R.x, dz = z - R.z, lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.max(Math.abs(lx) - R.hw, Math.abs(lz) - R.hd, 0); };
  const inR = (R, x, z, pad = 0) => rectD(R, x, z) <= pad;

  /* ---------- Maple Town: the village on Maple Street, grown into a big town ---------- */
  const TY = 2.4;                       // the town is flat at this height (the old village was too)
  const ST_W = 7;                       // town streets: two lanes
  const TOWN = {
    y: TY,
    flats: [{ x: 152, z: -55, hw: 108, hd: 28, soft: 14 }, { x: 160, z: 24, hw: 100, hd: 54, soft: 14 }],
    // the whole town, for "you are in town" rules (animal control) and the walk grid
    area: { x: 154, z: 0, hw: 108, hd: 80 },
    streets: [
      { name: 'Maple Street', a: [46, -55], b: [256, -55] },
      { name: 'Elm Street', a: [60, 2], b: [256, 2] },
      { name: 'Birch Street', a: [96, 54], b: [256, 54] },
      { name: 'Oak Street', a: [135, -55], b: [135, 54] },
      { name: 'Pine Street', a: [195, -55], b: [195, 54] },
      { name: 'Cedar Street', a: [256, -55], b: [256, 54] },
    ],
    green: { x: 226, z: -26.5, hw: 23.5, hd: 21.5 },
    lots: [],
  };
  {
    const streetOf = (z) => (z < -20 ? 'Maple Street' : z < 30 ? 'Elm Street' : 'Birch Street');
    const L = TOWN.lots, H = (x, z, rot, variant, o) => L.push(Object.assign({ kind: 'house', x, z, rot, variant, village: true, pen: true, street: streetOf(z), town: 'Maple Town' }, o));
    const S = (x, z, rot, shop) => L.push({ kind: 'shop', shop, x, z, rot, street: 'Maple Street', town: 'Maple Town' });
    // the six houses that were already on Maple Street come first, in the same order (saved homes point at them by number)
    [66, 90, 114].forEach((x, i) => H(x, -69, 0, i % 5));
    [66, 90, 114].forEach((x, i) => H(x + 4, -41, PI, (i + 3) % 5));
    // shops on Maple Street
    [[148, 'general'], [164, 'bakery'], [180, 'cafe'], [206, 'post'], [222, 'library'], [238, 'hardware']].forEach(([x, k]) => S(x, -68, 0, k));
    [[148, 'icecream'], [164, 'diner'], [180, 'flower']].forEach(([x, k]) => S(x, -42, PI, k));
    // Elm Street and Birch Street houses (every other one has a back yard pen)
    let n = 0;
    const row = (xs, z, rot) => xs.forEach((x) => { H(x, z, rot, (n * 3 + 1) % 5, { pen: n % 2 === 0 }); n++; });
    row([70, 94, 118, 151, 175], -11.5, 0);
    row([70, 94, 118, 151, 175, 211, 235], 15.5, PI);
    row([110, 151, 175, 211, 235], 40.5, 0);
    row([110, 151, 175, 211], 67.5, PI);
    L.push({ kind: 'pound', x: 236, z: 67, rot: PI, street: 'Birch Street', town: 'Maple Town' });
  }

  /* ---------- the city: a grid of blocks around a big park, east of Maple Town along Maple Street ---------- */
  const CY = 1.4;                                     // flat city ground (low, so the park pond sits near the water level)
  const CX = 440, CZ = -55;                          // city middle; Main Street (local z 0) lines up with Maple Street
  const PITCH = 50, ROAD = 10, WALK = 3.5, HALF = ROAD / 2 + WALK;   // block pitch, street width, sidewalks
  const LINES = [-100, -50, 0, 50, 100];             // street center lines, local x and z
  const CITY = {
    x: CX, z: CZ, y: CY, pitch: PITCH, road: ROAD, walk: WALK, half: HALF, lines: LINES,
    rect: { x: CX, z: CZ, hw: 100 + HALF, hd: 100 + HALF },
    flat: { x: CX, z: CZ, hw: 100 + HALF + 4, hd: 100 + HALF + 4, soft: 34 },
    // the park fills the four blocks east of Main Street's end
    park: { x0: 0 + HALF, x1: 100 - HALF, z0: -50 + HALF, z1: 50 - HALF },
    pond: { x: 72, z: 16, r: 13 },                     // local
    blocks: [],
    stores: [],
  };
  CITY.parkRect = { x: CX + 50, z: CZ, hw: 50 - HALF, hd: 50 - HALF };
  const toW = (lx, lz) => [CX + lx, CZ + lz];
  CITY.toW = toW;
  // is this street segment open? (no streets through the park)
  CITY.segOpen = (ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    return !(mx > 0.5 && mx < 99.5 && mz > -49.5 && mz < 49.5);
  };
  {
    // lot spots in a block: quarter lots at the corners, half lots, or the whole block; f = the street the front faces
    const Q = { nw: [-9, -9], ne: [9, -9], sw: [-9, 9], se: [9, 9], n: [0, -9], s: [0, 9], w: [-9, 0], e: [9, 0], c: [0, 0] };
    const F = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
    const B = (c, r, list) => {
      const bx = -75 + PITCH * c, bz = -75 + PITCH * r;
      const blk = { c, r, x: bx, z: bz, lots: [] };
      for (const [at, f, type, variant, store] of list) {
        const [ox, oz] = Q[at], [fx, fz] = F[f];
        blk.lots.push({ type, variant, x: bx + ox, z: bz + oz, rot: Math.atan2(fx, fz), fx, fz, store: store || null });
      }
      CITY.blocks.push(blk);
    };
    B(0, 0, [['n', 'n', 'apartment', 3], ['sw', 'w', 'apartment', 0], ['se', 's', 'apartment', 2]]);
    B(1, 0, [['w', 'w', 'apartment', 4], ['e', 'e', 'office', 2]]);
    B(2, 0, [['c', 's', 'office', 3]]);
    B(3, 0, [['n', 'n', 'office', 1], ['s', 's', 'apartment', 5]]);
    B(0, 1, [['nw', 'n', 'apartment', 1], ['ne', 'n', 'apartment', 0], ['sw', 's', 'midrise', 0, 'pet'], ['se', 's', 'midrise', 1, 'vet']]);
    B(1, 1, [['nw', 'n', 'apartment', 2], ['ne', 'e', 'midrise', 3, 'flower'], ['sw', 's', 'midrise', 2, 'bakery'], ['se', 's', 'midrise', 0, 'toy']]);
    B(0, 2, [['nw', 'n', 'midrise', 1, 'grocery'], ['ne', 'n', 'midrise', 2, 'icecream'], ['sw', 's', 'apartment', 0], ['se', 's', 'apartment', 1]]);
    B(1, 2, [['nw', 'n', 'midrise', 3, 'cafe'], ['ne', 'n', 'midrise', 1, 'books'], ['se', 'e', 'midrise', 0, 'clothes'], ['sw', 's', 'apartment', 2]]);
    B(0, 3, [['w', 'w', 'apartment', 4], ['ne', 'n', 'apartment', 0], ['se', 's', 'office', 0]]);
    B(1, 3, [['n', 'n', 'apartment', 5], ['s', 's', 'apartment', 3]]);
    B(2, 3, [['n', 'n', 'office', 1], ['s', 's', 'office', 1]]);
    B(3, 3, [['c', 'n', 'office', 3]]);
    for (const b of CITY.blocks) for (const l of b.lots) if (l.store) CITY.stores.push(l);
  }
  // city streets: the open segments between neighboring crossings, and the crossings with their open sides
  const partOf = (x, z) => (x <= 0 ? (z <= 0 ? 'city-nw' : 'city-sw') : z <= -50 ? 'city-ne' : z >= 50 ? 'city-se' : 'city-park');
  CITY.segs = []; CITY.nodes = [];
  for (const z of LINES) for (let i = 0; i < 4; i++) { const ax = LINES[i], bx = LINES[i + 1]; if (CITY.segOpen(ax, z, bx, z)) CITY.segs.push({ ax, az: z, bx, bz: z, dir: 'x', part: partOf((ax + bx) / 2, z) }); }
  for (const x of LINES) for (let j = 0; j < 4; j++) { const az = LINES[j], bz = LINES[j + 1]; if (CITY.segOpen(x, az, x, bz)) CITY.segs.push({ ax: x, az, bx: x, bz, dir: 'z', part: partOf(x, (az + bz) / 2) }); }
  // where the country roads leave the city (crossing, side)
  const EXITS = { '-100,0': 'w', '0,-100': 'n', '0,100': 's', '100,0': 'e', '100,-100': 'e', '100,100': 'e' };
  for (const x of LINES) for (const z of LINES) {
    const has = (d) => CITY.segs.some((q) => (d === 'e' && q.dir === 'x' && q.ax === x && q.az === z) || (d === 'w' && q.dir === 'x' && q.bx === x && q.bz === z) || (d === 's' && q.dir === 'z' && q.ax === x && q.az === z) || (d === 'n' && q.dir === 'z' && q.bx === x && q.bz === z));
    const open = { n: has('n'), s: has('s'), e: has('e'), w: has('w') }, deg = open.n + open.s + open.e + open.w;
    if (!deg) continue;
    CITY.nodes.push({ x, z, open, deg, exit: EXITS[x + ',' + z] || null, outer: Math.abs(x) === 100 || Math.abs(z) === 100, part: partOf(x, z) });
  }
  CITY.partOf = partOf;

  // the city in four quarters plus the park, each made when you come near
  CITY.parts = [
    { key: 'city-nw', x: CX - 50, z: CZ - 50, blocks: (b) => b.c <= 1 && b.r <= 1 },
    { key: 'city-ne', x: CX + 50, z: CZ - 75, blocks: (b) => b.c >= 2 && b.r <= 0 },
    { key: 'city-sw', x: CX - 50, z: CZ + 50, blocks: (b) => b.c <= 1 && b.r >= 2 },
    { key: 'city-se', x: CX + 50, z: CZ + 75, blocks: (b) => b.c >= 2 && b.r >= 3 },
    { key: 'city-park', x: CX + 50, z: CZ, park: true },
  ];

  /* ---------- small towns all around the city ---------- */
  const TOWNS = [
    { name: 'Pinecrest', x: 440, z: -392, axis: 'x', len: 140, shops: ['general', 'bakery'] },
    { name: 'Willow Creek', x: 440, z: 282, axis: 'x', len: 140, shops: ['general', 'diner'] },
    { name: 'Fox Hollow', x: 802, z: -55, axis: 'z', len: 140, shops: ['general', 'icecream'] },
    { name: 'Bramble', x: 724, z: -336, axis: 'x', len: 140, shops: ['general', 'cafe'] },
    { name: 'Clover', x: 724, z: 236, axis: 'x', len: 140, shops: ['general', 'post'] },
  ];
  for (const t of TOWNS) {
    const ax = t.axis === 'x', hl = t.len / 2;
    t.street = ax ? { a: [t.x - hl, t.z], b: [t.x + hl, t.z] } : { a: [t.x, t.z - hl], b: [t.x, t.z + hl] };
    t.rect = ax ? { x: t.x, z: t.z, hw: hl + 6, hd: 32 } : { x: t.x, z: t.z, hw: 32, hd: hl + 6 };
    t.key = 'town-' + t.name.toLowerCase().replace(/[^a-z]/g, '');
    t.lots = [];
    // seven lots a side; the road comes in at the middle of one side, the shops face it from the other side
    const roadSide = ax ? (t.z < CZ ? 1 : -1) : -1;
    t.roadSide = roadSide;
    for (let i = 0; i < 7; i++) {
      const u = (i - 3) * 20;
      for (const side of [-1, 1]) {
        if (u === 0 && side === roadSide) continue;
        const shop = side !== roadSide && (u === 0 || u === 20);
        const off = shop ? 12.5 : 13.5;
        const [x, z] = ax ? [t.x + u, t.z + side * off] : [t.x + side * off, t.z + u];
        const rot = ax ? (side < 0 ? 0 : PI) : (side < 0 ? PI / 2 : -PI / 2);
        if (shop) t.lots.push({ kind: 'shop', shop: t.shops[u === 0 ? 0 : 1], x, z, rot, street: 'Main Street', town: t.name });
        else t.lots.push({ kind: 'house', x, z, rot, variant: (i * 2 + (side > 0 ? 1 : 0) + t.name.length) % 5, pen: (i + (side > 0 ? 1 : 0)) % 3 === 0, street: 'Main Street', town: t.name });
      }
    }
  }

  /* ---------- country roads between the towns and the city ---------- */
  const RW = 7;
  const ROADS = [
    { key: 'r-city', pts: [[256, -55], [335, -55]] },
    { key: 'r-north', pts: [[440, -160], [440, -268], [440, -388.5]] },
    { key: 'r-south', pts: [[440, 50], [440, 160], [440, 278.5]] },
    { key: 'r-east', pts: [[545, -55], [660, -55], [798.5, -55]] },
    { key: 'r-ne', pts: [[545, -155], [598, -184], [664, -262], [724, -332.5]] },
    { key: 'r-se', pts: [[545, 45], [598, 76], [664, 158], [724, 232.5]] },
  ];
  for (const r of ROADS) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of r.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    r.bb = [x0, z0, x1, z1];
    r.len = 0; r.cum = [0];
    for (let i = 1; i < r.pts.length; i++) { r.len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); r.cum.push(r.len); }
  }

  /* ---------- ground shape ---------- */
  let flatH = null;          // the ground with the town and city flats but no roads (for the road profiles)
  // ground height along each road, sampled every 4 m and smoothed, so roads run smooth over the bumps
  function profile(r) {
    const n = Math.max(2, Math.ceil(r.len / 4) + 1), raw = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [x, z] = roadAt(r, (i / (n - 1)) * r.len); raw[i] = flatH(x, z); }
    let p = raw;
    for (let pass = 0; pass < 6; pass++) {
      const q = new Float32Array(n);
      for (let i = 0; i < n; i++) { let s = 0, w = 0; for (let k = -3; k <= 3; k++) { const j = Math.max(0, Math.min(n - 1, i + k)); const ww = 4 - Math.abs(k); s += p[j] * ww; w += ww; } q[i] = s / w; }
      q[0] = raw[0]; q[n - 1] = raw[n - 1];   // the ends meet the flat ground they lead to
      p = q;
    }
    r.prof = p; r.step = r.len / (n - 1);
  }
  function roadAt(r, s) {
    for (let i = 1; i < r.pts.length; i++) {
      if (s <= r.cum[i] || i === r.pts.length - 1) {
        const t = Math.max(0, Math.min(1, (s - r.cum[i - 1]) / Math.max(1e-6, r.cum[i] - r.cum[i - 1])));
        const a = r.pts[i - 1], b = r.pts[i];
        return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, b[0] - a[0], b[1] - a[1]];
      }
    }
    return [r.pts[0][0], r.pts[0][1], 1, 0];
  }
  // nearest point on a road: distance, arc length
  function roadNear(r, x, z) {
    let bd = 1e9, bs = 0;
    for (let i = 1; i < r.pts.length; i++) {
      const a = r.pts[i - 1], b = r.pts[i], t = segT(x, z, a[0], a[1], b[0], b[1]);
      const px = a[0] + (b[0] - a[0]) * t, pz = a[1] + (b[1] - a[1]) * t, d = Math.hypot(x - px, z - pz);
      if (d < bd) { bd = d; bs = r.cum[i - 1] + t * (r.cum[i] - r.cum[i - 1]); }
    }
    return [bd, bs];
  }
  const roadY = (r, s) => { const f = s / r.step, i = Math.max(0, Math.min(r.prof.length - 2, Math.floor(f))), t = Math.max(0, Math.min(1, f - i)); return r.prof[i] + (r.prof[i + 1] - r.prof[i]) * t; };
  const SHOULDER = 6;
  function flats(h, x, z) {
    // Maple Town
    if (x > 30 && x < 290 && z > -100 && z < 100) for (const R of TOWN.flats) { const d = rectD(R, x, z); if (d < R.soft) h += (TY - h) * (1 - sm(d / R.soft)); }
    // the city
    const C = CITY.flat;
    if (Math.abs(x - C.x) < C.hw + C.soft && Math.abs(z - C.z) < C.hd + C.soft) { const d = rectD(C, x, z); h += (CY - h) * (1 - sm(d / C.soft)); }
    // small towns
    for (const t of TOWNS) {
      const R = t.rect;
      if (Math.abs(x - R.x) > R.hw + 24 || Math.abs(z - R.z) > R.hd + 24) continue;
      const d = rectD(R, x, z); h += (t.y - h) * (1 - sm(d / 22));
    }
    return h;
  }
  function H(h, x, z) {
    h = flats(h, x, z);
    for (const r of ROADS) {
      const b = r.bb, m = RW / 2 + SHOULDER;
      if (x < b[0] - m || x > b[2] + m || z < b[1] - m || z > b[3] + m) continue;
      const [d, s] = roadNear(r, x, z);
      if (d < RW / 2 + SHOULDER) h += (roadY(r, s) - h) * (1 - sm((d - RW / 2 - 0.6) / SHOULDER));
    }
    // the park pond: a gentle bank down to the water, then a bowl below it
    const P = CITY.pond, px = CX + P.x, pz = CZ + P.z;
    if (Math.abs(x - px) < P.r * 1.2 + 9 && Math.abs(z - pz) < P.r * 1.2 + 9) {
      const a = Math.atan2(z - pz, x - px), rr = P.r * (1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2));
      const d = Math.hypot(x - px, z - pz);
      if (d < rr) h = -1.6 + (0.3 + 1.6) * sm((d - rr * 0.55) / (rr * 0.45));
      else if (d < rr + 8) h = 0.3 + (h - 0.3) * sm((d - rr) / 8);
    }
    return h;
  }
  function init(baseH) {
    flatH = (x, z) => flats(baseH(x, z), x, z);
    for (const t of TOWNS) t.y = Math.max(1.6, Math.min(5.2, baseH(t.x, t.z)));
    for (const r of ROADS) profile(r);
  }

  /* ---------- what is where (for plants, grass, paint, landmarks) ---------- */
  // distance to the nearest town or city street center line (Maple Town, the small towns, country roads)
  function streetD(x, z) {
    let d = 1e9;
    if (x > 30 && x < 270 && z > -70 && z < 70) for (const s of TOWN.streets) { const t = segT(x, z, s.a[0], s.a[1], s.b[0], s.b[1]); d = Math.min(d, Math.hypot(x - s.a[0] - (s.b[0] - s.a[0]) * t, z - s.a[1] - (s.b[1] - s.a[1]) * t)); }
    for (const tw of TOWNS) { const s = tw.street; if (Math.abs(x - tw.x) > tw.rect.hw + 10 || Math.abs(z - tw.z) > tw.rect.hd + 10) continue; const t = segT(x, z, s.a[0], s.a[1], s.b[0], s.b[1]); d = Math.min(d, Math.hypot(x - s.a[0] - (s.b[0] - s.a[0]) * t, z - s.a[1] - (s.b[1] - s.a[1]) * t)); }
    for (const r of ROADS) { const b = r.bb; if (x < b[0] - 30 || x > b[2] + 30 || z < b[1] - 30 || z > b[3] + 30) continue; d = Math.min(d, roadNear(r, x, z)[0]); }
    return d;
  }
  const inCity = (x, z, pad = 0) => inR(CITY.rect, x, z, pad);
  const inPark = (x, z, pad = 0) => inR(CITY.parkRect, x, z, pad);
  // no plants here: city (but the park), the town lots and streets, roads
  function busy(x, z, pad = 0) {
    if (inCity(x, z, pad) && !inPark(x, z, -2)) return true;
    if (streetD(x, z) < RW / 2 + 1.5 + pad) return true;
    for (const t of TOWNS) if (inR(t.rect, x, z, pad)) return true;
    if (inR(TOWN.green, x, z, pad)) return true;
    return false;
  }
  // landmarks (lakes, farms, groves) keep this far away
  function reserved(x, z, r) {
    if (inR(CITY.rect, x, z, r + 40)) return true;
    for (const t of TOWNS) if (inR(t.rect, x, z, r + 30)) return true;
    if (inR(TOWN.area, x, z, r + 20)) return true;
    for (const rd of ROADS) { const b = rd.bb, m = r + 24; if (x < b[0] - m || x > b[2] + m || z < b[1] - m || z > b[3] + m) continue; if (roadNear(rd, x, z)[0] < m) return true; }
    return false;
  }
  // terrain colors: road shoulders and city ground (the streets themselves are meshes on top)
  function paint(o, x, z, c) {
    if (inCity(x, z, 3) && !inPark(x, z, -1)) { o.r += (c.pave.r - o.r) * 0.9; o.g += (c.pave.g - o.g) * 0.9; o.b += (c.pave.b - o.b) * 0.9; return; }
    const d = streetD(x, z);
    if (d < RW / 2 + 2.2) { const t = 0.85 * (1 - sm((d - RW / 2) / 2.2)); o.r += (c.gravel.r - o.r) * t; o.g += (c.gravel.g - o.g) * t; o.b += (c.gravel.b - o.b) * t; }
  }
  // grass: none on streets, roads and city ground (the park keeps its lawn)
  function grass(x, z) {
    if (inCity(x, z, 1) && !inPark(x, z, -1)) return 0;
    return sm((streetD(x, z) - RW / 2 - 0.4) / 1.2);
  }

  /* ---------- places made when you come near (50_world streams them like landmarks) ---------- */
  const PLACES = [];
  for (const p of CITY.parts) PLACES.push({ kind: p.park ? 'park' : 'city', key: p.key, part: p, x: p.x, z: p.z, reach: p.park ? 60 : 80 });
  for (const t of TOWNS) PLACES.push({ kind: 'stown', key: t.key, town: t, x: t.x, z: t.z, reach: Math.max(t.rect.hw, t.rect.hd) + 10 });
  // roads in pieces of about 100 m
  for (const r of ROADS) {
    const n = Math.max(1, Math.round(r.len / 100));
    for (let i = 0; i < n; i++) { const s0 = (i / n) * r.len, s1 = ((i + 1) / n) * r.len, [x, z] = roadAt(r, (s0 + s1) / 2); PLACES.push({ kind: 'road', key: r.key + '-' + i, road: r, s0, s1, x, z, reach: (s1 - s0) / 2 + 10 }); }
  }

  return { PI, TOWN, CITY, TOWNS, ROADS, PLACES, RW, ST_W, TY, CY, init, H, busy, reserved, paint, grass, streetD, inCity, inPark, roadAt, roadY, roadNear, rectD, inR };
})();
