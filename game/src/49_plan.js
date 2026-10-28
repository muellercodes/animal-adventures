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

  /* ---------- the city: a 6 x 6 grid of blocks around a big park, east of Maple Town along Maple Street ----------
     Streets are 14 m curb to curb (two travel lanes and a parking lane on each side) with 3.5 m sidewalks, so a block is
     34 x 34 m. A block holds lots: quarter lots (15 x 15) at the corners with 4 m alleys between them, wide lots
     (31 x 15) along one side, deep lots (15 x 31) and full lots (31 x 31). A lot is a building, a parking lot or a plaza. */
  const CY = 1.4;                                     // flat city ground (low, so the park pond sits near the water level)
  const CX = 475, CZ = -55;                          // city middle; Main Street (local z 0) lines up with Maple Street
  const PITCH = 55, ROAD = 14, WALK = 3.5, HALF = ROAD / 2 + WALK;   // block pitch, street width, sidewalks
  const NB = 6, EDGE = PITCH * NB / 2, BLK = PITCH - 2 * HALF, QO = 9.5;   // blocks a side, outer street line, block size, quarter lot offset
  const LINES = []; for (let i = 0; i <= NB; i++) LINES.push(-EDGE + PITCH * i);   // street center lines, local x and z
  const PARK = { c0: 3, c1: 4, r0: 2, r1: 3 };       // the park takes these blocks
  const PX0 = LINES[PARK.c0], PX1 = LINES[PARK.c1 + 1], PZ0 = LINES[PARK.r0], PZ1 = LINES[PARK.r1 + 1];
  // street names: avenues run north-south (x lines), streets east-west (z lines)
  const AVES = ['First Avenue', 'Second Avenue', 'Third Avenue', 'Park Avenue', 'Fourth Avenue', 'Fifth Avenue', 'Sixth Avenue'];
  const STS = ['North Street', 'Hill Street', 'Park Street', 'Main Street', 'Garden Street', 'Lake Street', 'South Street'];
  const CITY = {
    x: CX, z: CZ, y: CY, pitch: PITCH, road: ROAD, walk: WALK, half: HALF, lines: LINES, edge: EDGE, blk: BLK,
    rect: { x: CX, z: CZ, hw: EDGE + HALF, hd: EDGE + HALF },
    flat: { x: CX, z: CZ, hw: EDGE + HALF + 6, hd: EDGE + HALF + 6, soft: 30 },
    park: { x0: PX0 + HALF, x1: PX1 - HALF, z0: PZ0 + HALF, z1: PZ1 - HALF },
    pond: { x: 73, z: 18, r: 9.5 },                    // local, in the park's south east quarter
    gazebo: { x: 33, z: 24 },                          // local, the bandstand in the south west quarter
    // the park gates: the crossing each one opens to
    gates: { w: [PX0, 0], e: [PX1, 0], n: [(PX0 + PX1) / 2, PZ0], s: [(PX0 + PX1) / 2, PZ1] },
    // crossings with traffic lights (the rest have stop signs)
    major: { x: [-55, 0, 110], z: [-55, 0, 55] },
    aves: AVES, sts: STS,
    blocks: [],
    stores: [],
  };
  CITY.parkRect = { x: CX + (PX0 + PX1) / 2, z: CZ + (PZ0 + PZ1) / 2, hw: (PX1 - PX0) / 2 - HALF, hd: (PZ1 - PZ0) / 2 - HALF };
  const toW = (lx, lz) => [CX + lx, CZ + lz];
  CITY.toW = toW;
  const lineName = (axis, v) => { const i = LINES.indexOf(v); return i < 0 ? null : axis === 'x' ? AVES[i] : STS[i]; };
  CITY.lineName = lineName;
  // is this street segment open? (no streets through the park)
  CITY.segOpen = (ax, az, bx, bz) => {
    const mx = (ax + bx) / 2, mz = (az + bz) / 2;
    return !(mx > PX0 + 0.5 && mx < PX1 - 0.5 && mz > PZ0 + 0.5 && mz < PZ1 - 0.5);
  };
  {
    /* the blocks, row by row from the north. Each lot: 'where type facing [store]'.
       where: nw ne sw se (quarter lots), n s w e (half the block), c (the whole block).
       type: A apartment, O office, T a tall office, M a shop building with a store on the ground floor, P parking, Z plaza;
       a number after the letter picks that building variant (when it fits the lot).
       facing: the street the front faces. A store kind names the store; other shop buildings get a store from the list. */
    const SPEC = [
      ['n A n', 'sw A w', 'se P s'], ['nw A n', 'ne A n', 'sw M s', 'se M s'], ['w O n', 'ne A n', 'se A e'], ['n P n', 'sw A s', 'se A s'], ['nw A n', 'ne M e', 's A s'], ['nw M n', 'ne A e', 'sw P w', 'se A e'],
      ['nw M w', 'ne M n', 'sw A w', 'se Z s'], ['n O n', 'sw M s barber', 'se M s shoes'], ['c T5 s'], ['nw O n', 'ne O n', 's A s'], ['w O w', 'ne T0 n', 'se Z s'], ['nw A n', 'ne A e', 'sw M s', 'se P e'],
      ['nw A w', 'ne P n', 'sw M s pet', 'se M s vet'], ['nw O n', 'ne A n', 'sw M s flower', 'se M s bakery'], ['n T4 n', 'sw M s toy', 'se Z e'], null, null, ['w A w', 'ne M e', 'se M e'],
      ['nw M n grocery', 'ne M n icecream', 'sw A w', 'se A s'], ['nw M n cafe', 'ne M n books', 'sw P s', 'se A s'], ['nw M n clothes', 'ne M n pizza', 's O s'], null, null, ['w A w', 'ne P e', 'se A e'],
      ['nw A w', 'ne M n deli', 'sw A w', 'se M s'], ['nw O n', 'ne O n', 's P s'], ['nw A6 n', 'ne Z e', 'sw O w', 'se A s'], ['n T1 n', 'sw A s', 'se M s music'], ['nw O n', 'ne O e', 'sw P s', 'se A s'], ['nw A w', 'ne M e', 'sw A s', 'se M s'],
      ['nw A w', 'ne A n', 's A s'], ['w A s', 'ne M n pharmacy', 'se P s'], ['nw M n', 'ne A n', 'sw A s', 'se A s'], ['nw A n', 'ne P n', 'sw M s', 'se M s'], ['n A n', 'sw A s', 'se Z s'], ['nw A n', 'ne A e', 'sw M s', 'se A e'],
    ];
    // stores for the shop buildings that do not name one, in turn
    const MORE = ['cafe', 'pizza', 'deli', 'barber', 'grocery', 'flower', 'pharmacy', 'bakery', 'shoes', 'books', 'icecream', 'clothes', 'music', 'pet', 'toy'];
    const AT = { nw: [-QO, -QO, 'quarter'], ne: [QO, -QO, 'quarter'], sw: [-QO, QO, 'quarter'], se: [QO, QO, 'quarter'], n: [0, -QO, 'ns'], s: [0, QO, 'ns'], w: [-QO, 0, 'we'], e: [QO, 0, 'we'], c: [0, 0, 'full'] };
    const F = { n: [0, -1], s: [0, 1], w: [-1, 0], e: [1, 0] };
    const TYPE = { A: 'apartment', O: 'office', T: 'office', M: 'midrise', P: 'parking', Z: 'plaza' };
    // building variants by lot size, from the city kit (36_city) when it is there
    const PIECES = (typeof Env !== 'undefined' && Env.cityPieces) || {};
    const turn = {};
    const pickVariant = (type, cls, tall, c, r) => {
      const all = (PIECES[type] || []).filter((p) => p.lot === cls);
      let L = tall ? all.filter((p) => p.h >= 60) : all.filter((p) => type !== 'apartment' || p.h < 70 || (c + r) % 3 === 0);
      if (!L.length) L = all;
      if (!L.length) return 0;
      const k = type + ':' + cls + (tall ? 'T' : ''), n = (turn[k] = (turn[k] || 0) + 1);
      return L[(n * 5 + c * 3 + r) % L.length].variant;
    };
    let more = 0;
    for (let r = 0; r < NB; r++) for (let c = 0; c < NB; c++) {
      const spec = SPEC[r * NB + c];
      if (!spec) continue;
      const bx = (LINES[c] + LINES[c + 1]) / 2, bz = (LINES[r] + LINES[r + 1]) / 2;
      const blk = { c, r, x: bx, z: bz, lots: [], open: { n: true, s: true, w: true, e: true } };
      for (const item of spec) {
        const [at, tv, f, store0] = item.split(' '), t = tv[0], want = tv.length > 1 ? +tv.slice(1) : null;
        const [ox, oz, shape] = AT[at], [fx, fz] = F[f], type = TYPE[t];
        // the building's size class: its front is along the street it faces
        const cls = shape === 'quarter' ? 'quarter' : shape === 'full' ? 'full' : shape === 'ns' ? (fz ? 'wide' : 'deep') : (fx ? 'wide' : 'deep');
        const hw = shape === 'quarter' ? 7.5 : shape === 'ns' ? 15.5 : shape === 'we' ? 7.5 : 15.5, hd = shape === 'quarter' ? 7.5 : shape === 'ns' ? 7.5 : 15.5;
        let store = store0 || null;
        if (t === 'M' && !store) { store = MORE[more % MORE.length]; more++; }
        const fits = want !== null && (PIECES[type] || []).some((q) => q.variant === want && q.lot === cls);
        const variant = fits ? want : type === 'apartment' || type === 'office' || type === 'midrise' ? pickVariant(type, cls, t === 'T', c, r) : 0;
        const street = f === 'n' || f === 's' ? STS[r + (f === 's' ? 1 : 0)] : AVES[c + (f === 'e' ? 1 : 0)];
        blk.lots.push({ type, variant, cls, at, x: bx + ox, z: bz + oz, hw, hd, rot: Math.atan2(fx, fz), fx, fz, f, store, street, building: type !== 'parking' && type !== 'plaza' });
        // the cross shaped alley through the block is open where quarter lots (or lots without buildings) meet
        if (shape !== 'quarter') { if (at === 'n' || at === 'c') blk.open.n = false; if (at === 's' || at === 'c') blk.open.s = false; if (at === 'w' || at === 'c') blk.open.w = false; if (at === 'e' || at === 'c') blk.open.e = false; }
      }
      CITY.blocks.push(blk);
    }
    for (const b of CITY.blocks) for (const l of b.lots) if (l.store) CITY.stores.push(l);
  }
  // city streets: the open segments between neighboring crossings, and the crossings with their open sides
  const partOf = (x, z) => (x <= 0 ? (z <= 0 ? 'city-nw' : 'city-sw') : z <= PZ0 ? 'city-ne' : z >= PZ1 ? 'city-se' : x >= PX1 ? (z <= 0 ? 'city-ne' : 'city-se') : 'city-park');
  CITY.segs = []; CITY.nodes = [];
  for (const z of LINES) for (let i = 0; i < NB; i++) { const ax = LINES[i], bx = LINES[i + 1]; if (CITY.segOpen(ax, z, bx, z)) CITY.segs.push({ ax, az: z, bx, bz: z, dir: 'x', part: partOf((ax + bx) / 2, z), name: lineName('z', z) }); }
  for (const x of LINES) for (let j = 0; j < NB; j++) { const az = LINES[j], bz = LINES[j + 1]; if (CITY.segOpen(x, az, x, bz)) CITY.segs.push({ ax: x, az, bx: x, bz, dir: 'z', part: partOf(x, (az + bz) / 2), name: lineName('x', x) }); }
  // where the country roads leave the city (crossing, side)
  const EXITS = {}; EXITS[-EDGE + ',0'] = 'w'; EXITS['0,' + -EDGE] = 'n'; EXITS['0,' + EDGE] = 's'; EXITS[EDGE + ',0'] = 'e'; EXITS[EDGE + ',' + -EDGE] = 'e'; EXITS[EDGE + ',' + EDGE] = 'e';
  for (const x of LINES) for (const z of LINES) {
    const has = (d) => CITY.segs.some((q) => (d === 'e' && q.dir === 'x' && q.ax === x && q.az === z) || (d === 'w' && q.dir === 'x' && q.bx === x && q.bz === z) || (d === 's' && q.dir === 'z' && q.ax === x && q.az === z) || (d === 'n' && q.dir === 'z' && q.bx === x && q.bz === z));
    const open = { n: has('n'), s: has('s'), e: has('e'), w: has('w') }, deg = open.n + open.s + open.e + open.w;
    if (!deg) continue;
    const outer = Math.abs(x) === EDGE || Math.abs(z) === EDGE;
    const signal = !outer && deg >= 3 && ((CITY.major.x.includes(x) && CITY.major.z.includes(z)) || z === 0);
    CITY.nodes.push({ x, z, open, deg, exit: EXITS[x + ',' + z] || null, outer, signal, part: partOf(x, z) });
  }
  CITY.partOf = partOf;
  function partOfW(x, z) { return partOf(x - CX, z - CZ); }
  // the name of the city street at a spot (local), or null
  CITY.streetAt = (lx, lz) => {
    let bx = null, bdx = 1e9, bz = null, bdz = 1e9;
    for (const v of LINES) { const dx = Math.abs(lx - v), dz = Math.abs(lz - v); if (dx < bdx) { bdx = dx; bx = v; } if (dz < bdz) { bdz = dz; bz = v; } }
    if (bdx <= ROAD / 2 + WALK + 0.5 && bdx <= bdz && CITY.segs.some((q) => q.dir === 'z' && q.ax === bx && lz >= q.az - HALF && lz <= q.bz + HALF)) return AVES[LINES.indexOf(bx)];
    if (bdz <= ROAD / 2 + WALK + 0.5 && CITY.segs.some((q) => q.dir === 'x' && q.az === bz && lx >= q.ax - HALF && lx <= q.bx + HALF)) return STS[LINES.indexOf(bz)];
    return null;
  };

  // the city in four quarters plus the park, each made when you come near
  const inPk = (b) => b.c >= PARK.c0 && b.c <= PARK.c1 + 1 && b.r >= PARK.r0 && b.r <= PARK.r1;
  CITY.parts = [
    { key: 'city-nw', x: CX - EDGE / 2, z: CZ - EDGE / 2, blocks: (b) => b.c < PARK.c0 && b.r < PARK.r1 },
    { key: 'city-sw', x: CX - EDGE / 2, z: CZ + EDGE / 2, blocks: (b) => b.c < PARK.c0 && b.r >= PARK.r1 },
    { key: 'city-ne', x: CX + EDGE / 2, z: CZ - EDGE / 2 - 10, blocks: (b) => b.c >= PARK.c0 && (b.r < PARK.r0 || (inPk(b) && b.r === PARK.r0)) },
    { key: 'city-se', x: CX + EDGE / 2, z: CZ + EDGE / 2 + 10, blocks: (b) => b.c >= PARK.c0 && (b.r > PARK.r1 || (inPk(b) && b.r === PARK.r1)) },
    { key: 'city-park', x: CX + (PX0 + PX1) / 2, z: CZ + (PZ0 + PZ1) / 2, park: true },
  ];

  /* ---------- the bus: a loop from the Maple Town green along Main Street and around the park ---------- */
  const BUS = {
    route: [[256, -55], [256, 2], [195, 2], [195, -55], [256, -55], toW(-165, 0), toW(-110, 0), toW(-55, 0), toW(0, 0), toW(0, -55), toW(55, -55), toW(110, -55), toW(110, 0), toW(110, 55), toW(55, 55), toW(0, 55), toW(0, 0), toW(-55, 0), toW(-110, 0), toW(-165, 0)],
    // stops: on the street from a to b, t of the way along, on the right hand side
    stops: [
      { name: 'Maple Town', a: [195, -55], b: [256, -55], t: 31 / 61, town: true },
      { name: 'Main Street', a: toW(-110, 0), b: toW(-55, 0), t: 0.5 },
      { name: 'Park West', a: toW(0, 0), b: toW(0, -55), t: 0.5 },
      { name: 'Park North', a: toW(55, -55), b: toW(110, -55), t: 0.5 },
      { name: 'Park East', a: toW(110, -55), b: toW(110, 0), t: 0.5 },
      { name: 'Park South', a: toW(110, 55), b: toW(55, 55), t: 0.5 },
      { name: 'Main Street', a: toW(-55, 0), b: toW(-110, 0), t: 0.5 },
    ],
  };
  for (const st of BUS.stops) {
    const [ax, az] = st.a, [bx, bz] = st.b, L = Math.hypot(bx - ax, bz - az), fx = (bx - ax) / L, fz = (bz - az) / L, rx = -fz, rz = fx;
    const off = st.town ? ST_W / 2 + 2.2 : HALF - 0.9;
    st.x = ax + (bx - ax) * st.t; st.z = az + (bz - az) * st.t;
    st.sx = st.x + rx * off; st.sz = st.z + rz * off; st.rot = Math.atan2(-rx, -rz);   // the shelter, facing the street
    st.wx = st.x + rx * (off - 1.6); st.wz = st.z + rz * (off - 1.6);                 // where people wait
    st.part = st.town ? null : partOfW(st.sx, st.sz);
  }

  /* ---------- small towns all around the city ---------- */
  const TOWNS = [
    { name: 'Pinecrest', x: 475, z: -392, axis: 'x', len: 140, shops: ['general', 'bakery'] },
    { name: 'Willow Creek', x: 475, z: 282, axis: 'x', len: 140, shops: ['general', 'diner'] },
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
  // each road starts where the city street narrows down to it (18.5 m out from the edge crossing)
  const ROADS = [
    { key: 'r-city', pts: [[256, -55], [291.5, -55]] },
    { key: 'r-north', pts: [[475, -238.5], [475, -300], [475, -388.5]] },
    { key: 'r-south', pts: [[475, 128.5], [475, 200], [475, 278.5]] },
    { key: 'r-east', pts: [[658.5, -55], [720, -55], [798.5, -55]] },
    { key: 'r-ne', pts: [[658.5, -220], [690, -232], [716, -262], [724, -296], [724, -332.5]] },
    { key: 'r-se', pts: [[658.5, 110], [690, 122], [716, 152], [724, 196], [724, 232.5]] },
  ];
  for (const r of ROADS) {
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (const [x, z] of r.pts) { x0 = Math.min(x0, x); z0 = Math.min(z0, z); x1 = Math.max(x1, x); z1 = Math.max(z1, z); }
    r.bb = [x0, z0, x1, z1];
    r.len = 0; r.cum = [0];
    for (let i = 1; i < r.pts.length; i++) { r.len += Math.hypot(r.pts[i][0] - r.pts[i - 1][0], r.pts[i][1] - r.pts[i - 1][1]); r.cum.push(r.len); }
  }

  // the bandstands on the town green and in the park
  const GAZEBOS = [{ x: TOWN.green.x, z: TOWN.green.z }, { x: CX + CITY.gazebo.x, z: CZ + CITY.gazebo.z }];

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
    // bandstands: the ground inside rises to the deck (0.36 m), so animals walk on it
    for (const g of GAZEBOS) { const d = Math.hypot(x - g.x, z - g.z); if (d < 3.9) h += 0.33 * (1 - sm((d - 3.0) / 0.8)); }
    // the park pond: a gentle bank down to the water, then a bowl below it
    const P = CITY.pond, px = CX + P.x, pz = CZ + P.z;
    if (Math.abs(x - px) < P.r * 1.2 + 6 && Math.abs(z - pz) < P.r * 1.2 + 6) {
      const a = Math.atan2(z - pz, x - px), rr = P.r * (1 + 0.12 * Math.sin(a * 3 + 1) + 0.06 * Math.sin(a * 5 + 2));
      const d = Math.hypot(x - px, z - pz);
      if (d < rr) h = -1.6 + (0.3 + 1.6) * sm((d - rr * 0.55) / (rr * 0.45));
      else if (d < rr + 4.5) h = 0.3 + (h - 0.3) * sm((d - rr) / 4.5);
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

  /* ---------- places you can go to from the map ---------- */
  const SPOTS = [
    { name: 'The farm', d: 'Where you started', x: 10, z: -2 },
    { name: 'Maple Town', d: 'Shops, houses and the town green', x: 150, z: -59.6 },
    { name: 'The city', d: 'Main Street stores and tall buildings', x: CX - 140, z: CZ - HALF + 1.7 },
    { name: 'City park', d: 'The fountain, the pond and the bandstand', x: CITY.parkRect.x - 14, z: CZ },
  ];
  for (const t of TOWNS) SPOTS.push({ name: t.name, d: 'A small town', x: t.axis === 'x' ? t.x + 8 : t.x - t.roadSide * 4.6, z: t.axis === 'x' ? t.z - t.roadSide * 4.6 : t.z + 8 });

  /* ---------- places made when you come near (50_world streams them like landmarks) ---------- */
  const PLACES = [];
  for (const p of CITY.parts) PLACES.push({ kind: p.park ? 'park' : 'city', key: p.key, part: p, x: p.x, z: p.z, reach: p.park ? 70 : 120 });
  for (const t of TOWNS) PLACES.push({ kind: 'stown', key: t.key, town: t, x: t.x, z: t.z, reach: Math.max(t.rect.hw, t.rect.hd) + 10 });
  // roads in pieces of about 100 m
  for (const r of ROADS) {
    const n = Math.max(1, Math.round(r.len / 100));
    for (let i = 0; i < n; i++) { const s0 = (i / n) * r.len, s1 = ((i + 1) / n) * r.len, [x, z] = roadAt(r, (s0 + s1) / 2); PLACES.push({ kind: 'road', key: r.key + '-' + i, road: r, s0, s1, x, z, reach: (s1 - s0) / 2 + 10 }); }
  }

  // the name of the place you are in, for the top bar
  function placeName(x, z) {
    if (inPark(x, z, 2)) return 'City park';
    if (inCity(x, z, 6)) return CITY.streetAt(x - CX, z - CZ) || 'The city';
    if (inR(TOWN.area, x, z, 4)) return 'Maple Town';
    for (const t of TOWNS) if (inR(t.rect, x, z, 6)) return t.name;
    return null;
  }

  return { placeName, PI, TOWN, CITY, TOWNS, ROADS, PLACES, BUS, SPOTS, RW, ST_W, TY, CY, init, H, busy, reserved, paint, grass, streetD, inCity, inPark, roadAt, roadY, roadNear, rectD, inR };
})();
