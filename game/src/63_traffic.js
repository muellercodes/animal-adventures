/* ---------- traffic: cars and buses on the streets of the city, Maple Town, the small towns and the roads between ----------
   Rosemary's rules: cars and buses drive on the right, wait at red lights, take turns at the other crossings and always
   stop for animals and people in front of them (and honk if you just sit there). Only the cars near you are made; the
   buses always run their loop from the Maple Town green to the city and around the park. */
const Traffic = (() => {
  const CAP = 26;                         // cars of one kind drawn at once
  // kind, variant, how common, only in the city
  const KINDS = [['sedan', 0, 0.2], ['sedan', 1, 0.14], ['hatch', 0, 0.13], ['suv', 0, 0.14], ['van', 0, 0.07], ['pickup', 0, 0.1], ['taxi', 0, 0.1, true], ['truck', 0, 0.07], ['animalvan', 0, 0.03]];
  const PAINT = [0xe9e9e6, 0x1b1c1f, 0xaaaeb3, 0x5b5f65, 0x1e3451, 0x8f1d1d, 0x5b1f27, 0x2f4b37, 0xcab99b, 0x3b608b, 0xd9d3c1, 0x6d7f8c];
  const ckey = (x, z) => Math.round(x) + ',' + Math.round(z);
  const T = { on: false, net: null, cars: [], buses: [], ims: null, sigT: 0, spawnT: 0, id: 1, stats: { spawned: 0, honks: 0 } };

  /* ---- the road network: crossings (nodes) and one way lanes between them (edges) ---- */
  function build() {
    const nodes = new Map(), edges = [];
    const node = (x, z, trim, signal) => {
      const k = ckey(x, z);
      let n = nodes.get(k);
      if (!n) nodes.set(k, (n = { id: nodes.size, x, z, trim: trim || 0, out: [], inn: [], signal: !!signal, lock: 0, lockT: 0, t0: Math.random() * 30 }));
      else { n.trim = Math.max(n.trim, trim || 0); if (signal) n.signal = true; }
      return n;
    };
    const near = (x, z, r) => { let best = null, bd = r; for (const n of nodes.values()) { const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } } return best; };
    const link = (A, B, pts, lane, speed, kind) => {
      for (const [a, b, P] of [[A, B, pts], [B, A, pts.slice().reverse()]]) {
        const L = [];
        for (let i = 0; i < P.length; i++) {
          const p0 = P[Math.max(0, i - 1)], p1 = P[Math.min(P.length - 1, i + 1)], fx = p1[0] - p0[0], fz = p1[1] - p0[1], l = Math.hypot(fx, fz) || 1;
          L.push([P[i][0] - (fz / l) * lane, P[i][1] + (fx / l) * lane]);   // right of the way you drive
        }
        const e = { id: edges.length, a, b, kind, speed, lane, pts: L, cum: [0], len: 0, cars: [] };
        for (let i = 1; i < L.length; i++) { e.len += Math.hypot(L[i][0] - L[i - 1][0], L[i][1] - L[i - 1][1]); e.cum.push(e.len); }
        e.s0 = Math.min(a.trim, e.len * 0.3); e.s1 = Math.max(e.s0 + 1, e.len - Math.min(b.trim, e.len * 0.3));
        e.stop = e.s1 - (kind === 'city' ? 3.4 : 0.4);
        const f = L.length - 1;
        e.axis = Math.abs(L[f][0] - L[f - 1][0]) > Math.abs(L[f][1] - L[f - 1][1]) ? 'x' : 'z';
        edges.push(e); a.out.push(e); b.inn.push(e);
      }
    };
    // the city grid
    const C = Plan.CITY;
    for (const n of C.nodes) node(C.x + n.x, C.z + n.z, C.road / 2, n.signal);
    // city lanes are 3.5 m wide beside the center line (the parking lanes are outside them)
    for (const s of C.segs) { const ax = C.x + s.ax, az = C.z + s.az, bx = C.x + s.bx, bz = C.z + s.bz; link(node(ax, az), node(bx, bz), [[ax, az], [bx, bz]], 1.85, 9, 'city'); }
    // Maple Town: each street cut at its crossings
    const TW = Plan.TOWN, tr = Plan.ST_W / 2;
    for (const s of TW.streets) {
      const ex = s.a[1] === s.b[1], cuts = [s.a, s.b];
      for (const q of TW.streets) {
        if (q === s) continue;
        const qx = q.a[1] === q.b[1];
        if (ex === qx) continue;
        const x = ex ? q.a[0] : s.a[0], z = ex ? s.a[1] : q.a[1];
        const inS = ex ? x > Math.min(s.a[0], s.b[0]) + 0.1 && x < Math.max(s.a[0], s.b[0]) - 0.1 : z > Math.min(s.a[1], s.b[1]) + 0.1 && z < Math.max(s.a[1], s.b[1]) - 0.1;
        const inQ = qx ? x >= Math.min(q.a[0], q.b[0]) - 0.1 && x <= Math.max(q.a[0], q.b[0]) + 0.1 : z >= Math.min(q.a[1], q.b[1]) - 0.1 && z <= Math.max(q.a[1], q.b[1]) + 0.1;
        if (inS && inQ) cuts.push([x, z]);
      }
      cuts.sort((p, q) => (ex ? p[0] - q[0] : p[1] - q[1]));
      for (let i = 0; i < cuts.length - 1; i++) if (Math.hypot(cuts[i + 1][0] - cuts[i][0], cuts[i + 1][1] - cuts[i][1]) > 1) link(node(cuts[i][0], cuts[i][1], tr), node(cuts[i + 1][0], cuts[i + 1][1], tr), [cuts[i], cuts[i + 1]], 1.75, 7, 'town');
    }
    // the small towns: a main street with the road coming in at the middle
    for (const t of Plan.TOWNS) {
      const m = node(t.x, t.z, tr);
      link(node(t.street.a[0], t.street.a[1], tr), m, [t.street.a, [t.x, t.z]], 1.75, 7, 'town');
      link(m, node(t.street.b[0], t.street.b[1], tr), [[t.x, t.z], t.street.b], 1.75, 7, 'town');
    }
    // country roads, joined to the crossings at both ends
    for (const r of Plan.ROADS) {
      const pts = r.pts.slice();
      const A = near(pts[0][0], pts[0][1], 20), B = near(pts[pts.length - 1][0], pts[pts.length - 1][1], 20);
      if (!A || !B) continue;
      if (Math.hypot(A.x - pts[0][0], A.z - pts[0][1]) > 0.5) pts.unshift([A.x, A.z]);
      if (Math.hypot(B.x - pts[pts.length - 1][0], B.z - pts[pts.length - 1][1]) > 0.5) pts.push([B.x, B.z]);
      link(A, B, pts, 1.75, 13, 'road');
    }
    return { nodes: [...nodes.values()], edges, find: (x, z) => nodes.get(ckey(x, z)) || near(x, z, 3) };
  }
  // a point along a lane: x, z, and the direction
  function at(e, s, o) {
    const P = e.pts, c = e.cum;
    let i = 1; while (i < P.length - 1 && c[i] < s) i++;
    const L = c[i] - c[i - 1] || 1, t = Math.max(0, Math.min(1, (s - c[i - 1]) / L));
    o.x = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t; o.z = P[i - 1][1] + (P[i][1] - P[i - 1][1]) * t;
    o.fx = (P[i][0] - P[i - 1][0]) / L; o.fz = (P[i][1] - P[i - 1][1]) / L;
    return o;
  }
  // lights: east-west green, yellow, all red, then north-south
  const CYCLE = [['x', 13], ['xy', 3], ['r', 1.5], ['z', 13], ['zy', 3], ['r2', 1.5]];
  const CYCLE_LEN = CYCLE.reduce((s, c) => s + c[1], 0);
  function lightOf(n, axis) {
    let t = ((T.sigT + n.t0) % CYCLE_LEN), ph = 'r';
    for (const [k, d] of CYCLE) { if (t < d) { ph = k; break; } t -= d; }
    if (ph === axis) return 'g';
    if (ph === axis + 'y') return 'y';
    return 'r';
  }
  T.light = (x, z, axis) => { const n = T.net && T.net.find(x, z); return n && n.signal ? lightOf(n, axis) : null; };

  /* ---- drawing: one InstancedMesh per vehicle part and kind ---- */
  function makeIMs(parent) {
    const out = {};
    for (const [kind, variant] of KINDS) {
      const k = kind + ':' + variant;
      if (out[k] || !Env.vehicle) continue;
      const V = Env.vehicle(kind, variant);
      const parts = V.parts.map((p) => {
        const im = new THREE.InstancedMesh(p.geometry, p.material, CAP);
        im.count = 0; im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true;
        if (p.tint) { im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 3).fill(1), 3); }
        parent.add(im);
        return { im, tint: !!p.tint };
      });
      const wh = new THREE.InstancedMesh(V.wheel.geometry, V.wheel.material, CAP * (V.wheels.length || 4));
      wh.count = 0; wh.frustumCulled = false; wh.castShadow = true; wh.receiveShadow = true; parent.add(wh);
      out[k] = { V, parts, wh, n: 0, nw: 0 };
    }
    return out;
  }
  const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _e = new THREE.Euler(0, 0, 0, 'YXZ'), _p = new THREE.Vector3(), _s = new THREE.Vector3(1, 1, 1), _c = new THREE.Color(), _w = new THREE.Matrix4(), _wl = new THREE.Matrix4();

  /* ---- cars ---- */
  function pickKind(city) {
    let r = Math.random() * KINDS.reduce((s, k) => s + (k[3] && !city ? 0 : k[2]), 0);
    for (const k of KINDS) { if (k[3] && !city) continue; r -= k[2]; if (r <= 0) return k; }
    return KINDS[0];
  }
  function chooseNext(e, bus) {
    if (bus) return null;
    const outs = e.b.out.filter((q) => q.b !== e.a);
    if (!outs.length) return e.b.out.find((q) => q.b === e.a) || null;   // a dead end: turn around
    // mostly straight on
    let best = null, bd = -2;
    const f = e.pts.length - 1, fx = e.pts[f][0] - e.pts[f - 1][0], fz = e.pts[f][1] - e.pts[f - 1][1], fl = Math.hypot(fx, fz) || 1;
    for (const q of outs) { const gx = q.pts[1][0] - q.pts[0][0], gz = q.pts[1][1] - q.pts[0][1], gl = Math.hypot(gx, gz) || 1, d = (fx * gx + fz * gz) / fl / gl; if (d > bd) { bd = d; best = q; } }
    return Math.random() < 0.55 && best ? best : outs[(Math.random() * outs.length) | 0];
  }
  function addCar(e, s, k, bus) {
    const [kind, variant] = k || pickKind(e.kind === 'city');
    const V = bus ? bus.userData : (T.ims[kind + ':' + variant] || {}).V;
    if (!V) return null;
    const car = { id: T.id++, kind: bus ? 'bus' : kind, variant, key: kind + ':' + variant, color: PAINT[(Math.random() * PAINT.length) | 0], len: V.len || 4.6, wid: V.wid || 1.8,
      e, s, v: e.speed * 0.6, turn: null, next: null, x: 0, z: 0, y: 0, yaw: 0, pitch: 0, wheel: 0, wait: 0, honkT: 0, why: '', bus: bus || null };
    car.next = chooseNext(e, bus);
    e.cars.push(car); T.cars.push(car); T.stats.spawned++;
    place(car);
    return car;
  }
  function removeCar(c) {
    if (c.e) { const i = c.e.cars.indexOf(c); if (i >= 0) c.e.cars.splice(i, 1); }
    if (c.lockN && c.lockN.lock === c.id) c.lockN.lock = 0;
    const i = T.cars.indexOf(c); if (i >= 0) T.cars.splice(i, 1);
  }
  const _a = { x: 0, z: 0, fx: 0, fz: 1 }, _b = { x: 0, z: 0, fx: 0, fz: 1 };
  // the car's pose from where it is on its lane or its turn
  function place(c) {
    let x, z, fx, fz;
    if (c.turn) {
      const t = c.turn.t, u = 1 - t, P0 = c.turn.p0, P1 = c.turn.c, P2 = c.turn.p1;
      x = u * u * P0[0] + 2 * u * t * P1[0] + t * t * P2[0]; z = u * u * P0[1] + 2 * u * t * P1[1] + t * t * P2[1];
      fx = 2 * u * (P1[0] - P0[0]) + 2 * t * (P2[0] - P1[0]); fz = 2 * u * (P1[1] - P0[1]) + 2 * t * (P2[1] - P1[1]);
      const l = Math.hypot(fx, fz) || 1; fx /= l; fz /= l;
    } else { at(c.e, c.s, _a); x = _a.x; z = _a.z; fx = _a.fx; fz = _a.fz; }
    const H = G.world.H, hf = H(x + fx * c.len * 0.4, z + fz * c.len * 0.4), hb = H(x - fx * c.len * 0.4, z - fz * c.len * 0.4);
    c.x = x; c.z = z; c.fx = fx; c.fz = fz; c.y = (hf + hb) / 2 + 0.04; c.yaw = Math.atan2(fx, fz); c.pitch = Math.atan2(hb - hf, c.len * 0.8);
  }
  // start a turn through the crossing at the end of the lane
  function startTurn(c) {
    const e = c.e, n = c.next;
    at(e, e.s1, _a); at(n, n.s0, _b);
    // the control point: where the two lane lines meet (straight on: the middle)
    const den = _a.fx * _b.fz - _a.fz * _b.fx;
    let cx = (_a.x + _b.x) / 2, cz = (_a.z + _b.z) / 2;
    if (Math.abs(den) > 0.2) { const t = ((_b.x - _a.x) * _b.fz - (_b.z - _a.z) * _b.fx) / den; if (t > 0 && t < 30) { cx = _a.x + _a.fx * t; cz = _a.z + _a.fz * t; } }
    else if (_a.fx * _b.fx + _a.fz * _b.fz < -0.5) { const d = Math.hypot(_b.x - _a.x, _b.z - _a.z); cx = (_a.x + _b.x) / 2 + _a.fx * Math.max(4, d); cz = (_a.z + _b.z) / 2 + _a.fz * Math.max(4, d); }   // turning around
    const len = Math.hypot(cx - _a.x, cz - _a.z) + Math.hypot(_b.x - cx, _b.z - cz);
    c.turn = { p0: [_a.x, _a.z], c: [cx, cz], p1: [_b.x, _b.z], len: Math.max(1, len * 0.92), t: 0, from: e, to: n, node: e.b };
    const i = e.cars.indexOf(c); if (i >= 0) e.cars.splice(i, 1);
  }
  function endTurn(c) {
    const n = c.turn.to, node = c.turn.node;
    c.turn = null; c.e = n; c.s = n.s0; n.cars.push(c);
    if (node.lock === c.id) node.lock = 0;
    c.next = c.bus ? null : chooseNext(n);
    if (c.bus) c.busNext();
  }

  /* ---- what is in front: other cars, the light, and anyone in the road ---- */
  function obstacles(P) {
    const list = [];
    if (P && !P.room && !P.riding && P.mode !== 'fly' && P.mode !== 'perch') list.push({ x: P.pos.x, z: P.pos.z, r: Math.max(0.3, P.m.length * 0.5), player: true });
    for (const b of Wild.list) if (!b.room && b.mode !== 'fly' && b.mode !== 'perch' && b.mode !== 'climb' && (!P || Math.abs(b.pos.x - P.pos.x) < 200 && Math.abs(b.pos.z - P.pos.z) < 200)) list.push({ x: b.pos.x, z: b.pos.z, r: Math.max(0.25, (b.m ? b.m.length : 0.5) * 0.5) });
    for (const p of Folk.list) if (!p.room && !p.away && (!P || Math.abs(p.pos.x - P.pos.x) < 200 && Math.abs(p.pos.z - P.pos.z) < 200)) list.push({ x: p.pos.x, z: p.pos.z, r: 0.35, person: true });
    if (typeof Net !== 'undefined' && Net.others) for (const o of Net.others.values()) if (o.b && o.b.pos) list.push({ x: o.b.pos.x, z: o.b.pos.z, r: 0.5 });
    return list;
  }
  function gapAhead(c, obs) {
    let gap = 80, why = '', who = null;
    const look = 6 + c.v * 2.2 + c.len / 2;
    // anyone in the road
    for (const o of obs) {
      const dx = o.x - c.x, dz = o.z - c.z, a = dx * c.fx + dz * c.fz;
      if (a < 0 || a > look + o.r) continue;
      const l = Math.abs(-dx * c.fz + dz * c.fx);
      if (l > c.wid / 2 + o.r + 0.5) continue;
      const g = a - c.len / 2 - o.r - 1.2;
      if (g < gap) { gap = g; why = o.player ? 'player' : o.person ? 'person' : 'animal'; who = o; }
    }
    // the car in front on the same lane (and on the next lane past the crossing)
    if (!c.turn) {
      for (const q of c.e.cars) if (q !== c && q.s > c.s) { const g = q.s - c.s - (q.len + c.len) / 2 - 1.5; if (g < gap) { gap = g; why = 'car'; } }
      const left = c.e.stop - c.s;
      if (c.next) for (const q of c.next.cars) { const g = left + (c.e.s1 - c.e.stop) + (q.s - c.next.s0) - (q.len + c.len) / 2 - 2; if (g < gap) { gap = g; why = 'car'; } }
      // others turning through the crossing right in front
      for (const q of T.cars) if (q.turn && q.turn.node === c.e.b && q !== c) { const dx = q.x - c.x, dz = q.z - c.z, a = dx * c.fx + dz * c.fz; if (a > 0 && a < look && Math.abs(-dx * c.fz + dz * c.fx) < 2.5) { const g = a - (q.len + c.len) / 2 - 1; if (g < gap) { gap = g; why = 'car'; } } }
    } else {
      const n = c.turn.to;
      for (const q of n.cars) { const dx = q.x - c.x, dz = q.z - c.z, a = dx * c.fx + dz * c.fz; if (a > 0) { const g = Math.hypot(dx, dz) - (q.len + c.len) / 2 - 1.5; if (g < gap) { gap = g; why = 'car'; } } }
    }
    return { gap, why, who };
  }
  // may this car go through the crossing at the end of its lane?
  function mayGo(c) {
    const n = c.e.b;
    if (!c.next) return false;
    if (n.signal) { const L = lightOf(n, c.e.axis); return L === 'g' || (L === 'y' && c.s > c.e.stop - 1.5 && c.v > 3); }
    if (n.lock && n.lock !== c.id) { if (T.time - n.lockT > 12) n.lock = 0; else return false; }
    // room on the lane we go into
    for (const q of c.next.cars) if (q.s - c.next.s0 < c.len + 2.5) return false;
    n.lock = c.id; n.lockT = T.time; c.lockN = n;
    return true;
  }

  /* ---- the buses ---- */
  function makeBuses(w) {
    if (!Env.bus) return;
    const R = Plan.BUS.route, net = T.net, legs = [];
    for (let i = 0; i < R.length; i++) {
      const A = net.find(R[i][0], R[i][1]), B = net.find(R[(i + 1) % R.length][0], R[(i + 1) % R.length][1]);
      const e = A && B ? A.out.find((q) => q.b === B) : null;
      if (!e) { console.warn('bus route: no street from', R[i], 'to', R[(i + 1) % R.length]); return; }
      legs.push(e);
    }
    // where each stop is on its leg
    const stops = Plan.BUS.stops.map((st) => { const A = net.find(st.a[0], st.a[1]), B = net.find(st.b[0], st.b[1]); const e = A && B ? A.out.find((q) => q.b === B) : null; return e ? { st, e, s: e.s0 + (e.s1 - e.s0) * st.t } : null; }).filter(Boolean);
    T.busLegs = legs; T.busStops = stops;
    for (let k = 0; k < 3; k++) {
      const g = Env.bus(); g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
      w.out.add(g);
      const li = [0, 7, 13][k] % legs.length, e = legs[li];
      const c = addCar(e, e.s0 + 2, ['bus', 0], g);
      if (!c) continue;
      c.leg = li; c.next = legs[(li + 1) % legs.length]; c.v = 0; c.dwell = 0; c.doors = 0; c.stopAt = null; c.riders = 0; c.name = 'bus ' + (k + 1);
      c.busNext = () => { c.leg = (c.leg + 1) % legs.length; c.next = legs[(c.leg + 1) % legs.length]; };
      T.buses.push(c);
    }
  }

  /* ---- each frame ---- */
  T.init = (w) => {
    T.on = !!(w.def.places && Plan && Env.vehicle);
    T.cars = []; T.buses = []; T.ims = null; T.time = 0;
    if (Player.b) Player.b.riding = null;
    if (!T.on) return;
    T.net = T.net || build();
    for (const e of T.net.edges) e.cars = [];
    for (const n of T.net.nodes) n.lock = 0;
    const grp = new THREE.Group(); grp.name = 'traffic'; w.out.add(grp); T.group = grp;
    T.ims = makeIMs(grp);
    makeBuses(w);
  };
  function want(P) {
    if (!P || P.room) return 0;
    const x = P.pos.x, z = P.pos.z;
    if (Plan.inCity(x, z, 90)) return G.night > 0.6 ? 9 : 18;
    if (Plan.inR(Plan.TOWN.area, x, z, 40)) return G.night > 0.6 ? 2 : 5;
    if (Plan.streetD(x, z) < 80) return G.night > 0.6 ? 2 : 4;
    return 0;
  }
  function spawnSome(P) {
    const n = want(P), cars = T.cars.filter((c) => !c.bus).length;
    if (cars >= n) return;
    const x = P.pos.x, z = P.pos.z, E = T.net.edges;
    for (let tries = 0; tries < 12; tries++) {
      const e = E[(Math.random() * E.length) | 0];
      if (e.s1 - e.s0 < 10) continue;
      const s = e.s0 + 3 + Math.random() * (e.s1 - e.s0 - 6);
      at(e, s, _a);
      const d = Math.hypot(_a.x - x, _a.z - z);
      if (d < 55 || d > 165) continue;
      if (e.cars.some((q) => Math.abs(q.s - s) < 16)) continue;
      addCar(e, s);
      return;
    }
  }
  T.update = (dt, P) => {
    if (!T.on || !T.ims) return;
    T.time += dt; T.sigT += dt;
    dt = Math.min(dt, 0.1);
    T.spawnT -= dt;
    if (T.spawnT <= 0 && P) { T.spawnT = 0.35; spawnSome(P); }
    const obs = obstacles(P);
    for (const c of T.cars.slice()) {
      // gone far away
      if (!c.bus && P && Math.hypot(c.x - P.pos.x, c.z - P.pos.z) > 210) { removeCar(c); continue; }
      let vmax = c.turn ? 5.5 : c.e.speed;
      if (c.bus) vmax *= 0.85;
      const g = gapAhead(c, obs);
      let gap = g.gap;
      // the stop line: a red light, someone else in the crossing, no room past it
      if (!c.turn && c.s < c.e.s1) {
        const toStop = c.e.stop - c.s;
        if (toStop < 6 + c.v * c.v / 6) { if (!c.go) c.go = mayGo(c); if (!c.go) { if (toStop < gap) { gap = toStop; g.why = 'light'; } } }
      }
      // bus stops: pull in, open the doors, wait, close them
      if (c.bus && !c.turn) {
        const ds0 = doorZ(c);   // stop with the front door at the stop
        const st = T.busStops.find((q) => q.e === c.e && q.s - ds0 > c.s - 0.5);
        if (st && c.dwell <= 0 && c.stopDone !== st) {
          const toS = st.s - ds0 - c.s; if (toS < gap) gap = toS;
          if (toS < 0.4 && c.v < 0.3) {
            c.dwell = 7.5; c.stopAt = st;
            if (P && P.riding === c) { c.dwell = 12; G.ui.toast(`${st.st.name} stop! Tap Get off to get off here.`, 3500); }
          }
        }
        if (c.dwell > 0) { gap = 0; c.dwell -= dt; c.doors = Math.min(1, c.doors + dt * 1.2); if (c.dwell <= 1.5) c.doors = Math.max(0, c.doors - dt * 1.6); if (c.dwell <= 0) { c.stopDone = c.stopAt; c.stopAt = null; c.doors = 0; } }
        if (c.bus.userData.doors && Env.setDoors) Env.setDoors(c.bus, c.doors);
      }
      // speed: brake hard for what is in front, speed up gently
      const safe = gap <= 0 ? 0 : Math.sqrt(2 * 5.5 * Math.max(0, gap - 0.3));
      const tv = Math.min(vmax, safe);
      c.v = tv > c.v ? Math.min(tv, c.v + 2.6 * dt) : Math.max(tv, c.v - 9 * dt);
      if (gap < 0.05) c.v = 0;
      // honk at an animal that sits in the road
      if (c.v < 0.2 && g.why === 'player') { c.wait += dt; c.honkT -= dt; if (c.wait > 2.5 && c.honkT <= 0) { c.honkT = 5 + Math.random() * 3; T.stats.honks++; if (G.sound && G.sound.honk) G.sound.honk(Math.hypot(c.x - P.pos.x, c.z - P.pos.z), c.bus); } }
      else c.wait = 0;
      c.why = g.why;
      // move
      const ds = c.v * dt;
      if (c.turn) { c.turn.t += ds / c.turn.len; if (c.turn.t >= 1) endTurn(c); }
      else {
        c.s += ds;
        if (c.s >= c.e.s1) { if (c.next && c.go) { c.go = false; startTurn(c); } else c.s = c.e.s1; }
      }
      c.wheel += ds / 0.34;
      place(c);
    }
    draw(P);
  };
  function draw(P) {
    for (const k in T.ims) { T.ims[k].n = 0; T.ims[k].nw = 0; }
    for (const c of T.cars) {
      _e.set(c.pitch, c.yaw, 0); _q.setFromEuler(_e); _p.set(c.x, c.y, c.z); _m.compose(_p, _q, _s);
      if (c.bus) { c.bus.position.set(c.x, c.y, c.z); c.bus.rotation.set(c.pitch, c.yaw, 0, 'YXZ'); c.bus.visible = !P || Math.hypot(c.x - P.pos.x, c.z - P.pos.z) < 300; for (const nm of c.bus.userData.wheels || []) { const wm = c.bus.getObjectByName(nm); if (wm) wm.rotation.x = c.wheel; } continue; }
      const D = T.ims[c.key]; if (!D || D.n >= CAP) continue;
      for (const part of D.parts) { part.im.setMatrixAt(D.n, _m); if (part.tint) part.im.setColorAt(D.n, _c.setHex(c.color)); }
      for (const wv of D.V.wheels) {
        _wl.makeRotationX(c.wheel); _wl.setPosition(wv.x, wv.y, wv.z);
        _w.multiplyMatrices(_m, _wl);
        if (D.nw < D.wh.instanceMatrix.count) D.wh.setMatrixAt(D.nw++, _w);
      }
      D.n++;
    }
    for (const k in T.ims) {
      const D = T.ims[k];
      for (const part of D.parts) { part.im.count = D.n; part.im.visible = D.n > 0; part.im.instanceMatrix.needsUpdate = true; if (part.im.instanceColor) part.im.instanceColor.needsUpdate = true; }
      D.wh.count = D.nw; D.wh.visible = D.nw > 0; D.wh.instanceMatrix.needsUpdate = true;
    }
    // the traffic light heads the world put up
    const w = G.world;
    for (const sg of w.signals || []) {
      const n = T.net.find(sg.x, sg.z); if (!n || !n.signal) continue;
      for (const h of sg.heads) { const st = lightOf(n, h.axis); if (h.st !== st) { h.st = st; if (Env.setSignal) Env.setSignal(h.obj, st); } }
    }
  }
  T.clear = () => { T.cars = []; T.buses = []; T.on = false; };

  /* ---- riding the bus ---- */
  // the spot just outside the front door (on the right)
  const doorZ = (c) => { const d = c.bus && c.bus.userData.doorZ && c.bus.userData.doorZ[0]; return d ? (d.z0 + d.z1) / 2 : c.len / 2 - 1.6; };
  T.doorPoint = (c) => { const f = doorZ(c), sd = c.wid / 2 + 1.5; return { x: c.x + c.fx * f - c.fz * sd, z: c.z + c.fz * f + c.fx * sd }; };
  // a bus at a stop with its doors open, close enough to get on
  T.boardable = (b) => {
    for (const c of T.buses) {
      if (!(c.dwell > 0.8 && c.doors > 0.6)) continue;
      const d = T.doorPoint(c);
      if (Math.hypot(b.pos.x - d.x, b.pos.z - d.z) < 3.4 + b.m.radius) return c;
    }
    return null;
  };
  T.stopName = (c) => (c.stopAt ? c.stopAt.st.name : '');
  // sit on a seat by the window, near the front
  T.seat = (b) => {
    const c = b.riding; if (!c) return;
    // on a seat by a right hand window, just behind the front door (high enough to look out)
    const lx = -(c.wid / 2 - 0.62), lz = doorZ(c) - 1.35, co = Math.cos(c.yaw), si = Math.sin(c.yaw), fy = ((c.bus && c.bus.userData.floorY) || 0.4) + 0.46;
    b.pos.set(c.x + lx * co + lz * si, c.y + fy, c.z - lx * si + lz * co);
    b.yaw = c.yaw - Math.PI / 2;   // looking out of the window
  };
  /* ---- parked cars: the street kit's cars as an instanced prop for the world, one variant per kind, painted per car ---- */
  if (Env._k && Env.vehicle) {
    const PARKED = [['sedan', 0], ['sedan', 1], ['hatch', 0], ['suv', 0], ['pickup', 0], ['van', 0], ['wagon', 0], ['coupe', 0]].filter(([k]) => !Env.VEHICLES || Env.VEHICLES[k]);
    const pc = new THREE.Color();
    // a simple car of boxes in the car's size: body, cabin with dark windows, wheels, lights (tint 1 = takes the paint)
    const CAB = { sedan: [-0.3, 0.2, -0.2, 0.06, 0.6], coupe: [-0.26, 0.17, -0.13, 0.03, 0.62], hatch: [-0.43, 0.18, -0.39, 0.04, 0.6], wagon: [-0.46, 0.18, -0.45, 0.04, 0.6],
      suv: [-0.45, 0.22, -0.44, 0.09, 0.56], van: [-0.49, 0.33, -0.48, 0.22, 0.5], pickup: [-0.06, 0.22, -0.04, 0.12, 0.6] };
    function lowCar(kind, V) {
      const P = [], N = [], C = [], T = [], L = V.len, W = V.wid, H = V.h, c = CAB[kind] || CAB.sedan;
      const v3 = new THREE.Vector3(), a = new THREE.Vector3(), b = new THREE.Vector3();
      const tri = (p0, p1, p2, col, t) => { a.subVectors(p1, p0); b.subVectors(p2, p0); v3.crossVectors(a, b).normalize(); for (const q of [p0, p1, p2]) { P.push(q.x, q.y, q.z); N.push(v3.x, v3.y, v3.z); C.push(col[0], col[1], col[2]); T.push(t); } };
      const quad = (p0, p1, p2, p3, col, t) => { tri(p0, p1, p2, col, t); tri(p0, p2, p3, col, t); };
      const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
      // a six sided solid from its bottom (x half width, z0, z1, y) and top rings, with per face colors
      const solid = (wb, zb0, zb1, yb, wt, zt0, zt1, yt, col, t, glass) => {
        const b0 = V3(-wb, yb, zb0), b1 = V3(wb, yb, zb0), b2 = V3(wb, yb, zb1), b3 = V3(-wb, yb, zb1);
        const t0 = V3(-wt, yt, zt0), t1 = V3(wt, yt, zt0), t2 = V3(wt, yt, zt1), t3 = V3(-wt, yt, zt1);
        const side = glass || col, ts = glass ? 0 : t;
        quad(t0, t3, t2, t1, col, t);                 // top
        quad(b3, b2, t2, t3, side, ts);               // front (+z)
        quad(b1, b0, t0, t1, side, ts);               // back
        quad(b2, b1, t1, t2, side, ts);               // right (+x)
        quad(b0, b3, t3, t0, side, ts);               // left
      };
      const white = [1, 1, 1], glassC = [0.05, 0.07, 0.09], tire = [0.03, 0.03, 0.03];
      const wr = (V.wheels[0] && V.wheels[0].r) || 0.34, sill = wr * 0.85, belt = H * c[4];
      // the body: the lower part, a little narrower at the top edge
      solid(W / 2, -L / 2, L / 2, sill, W / 2 - 0.04, -L / 2 + 0.12, L / 2 - 0.1, belt, white, 1, null);
      // under the body, dark
      quad(V3(-W / 2 + 0.1, sill, -L / 2 + 0.3), V3(W / 2 - 0.1, sill, -L / 2 + 0.3), V3(W / 2 - 0.1, sill, L / 2 - 0.3), V3(-W / 2 + 0.1, sill, L / 2 - 0.3), tire, 0);
      // the cabin: painted roof, dark glass all round
      solid(W / 2 - 0.08, c[0] * L, c[1] * L, belt, W / 2 - 0.2, c[2] * L, c[3] * L, H, white, 1, glassC);
      // wheels: eight sided, the axle across x
      for (const q of V.wheels) {
        const n = 8, hw = 0.12, x0 = q.x - hw * Math.sign(q.x || 1) * 0.0;
        const ring = (x) => { const r = []; for (let i = 0; i < n; i++) { const t = (i + 0.5) / n * Math.PI * 2; r.push(V3(x, q.y + Math.cos(t) * q.r, q.z + Math.sin(t) * q.r)); } return r; };
        const A = ring(x0 - hw), B = ring(x0 + hw);
        for (let i = 0; i < n; i++) { const j = (i + 1) % n; quad(A[i], A[j], B[j], B[i], tire, 0); }
        const outer = q.x >= 0 ? B : A;
        for (let i = 1; i < n - 1; i++) (q.x >= 0 ? tri(outer[0], outer[i], outer[i + 1], [0.25, 0.25, 0.26], 0) : tri(outer[0], outer[i + 1], outer[i], [0.25, 0.25, 0.26], 0));
      }
      // lights
      const yl = belt - 0.14;
      for (const sx of [-1, 1]) {
        quad(V3(sx * (W / 2 - 0.12) - 0.16, yl - 0.07, L / 2 + 0.005), V3(sx * (W / 2 - 0.12) + 0.16, yl - 0.07, L / 2 + 0.005), V3(sx * (W / 2 - 0.12) + 0.16, yl + 0.07, L / 2 + 0.005), V3(sx * (W / 2 - 0.12) - 0.16, yl + 0.07, L / 2 + 0.005), [0.9, 0.9, 0.85], 0);
        quad(V3(sx * (W / 2 - 0.12) + 0.16, yl - 0.07, -L / 2 - 0.005), V3(sx * (W / 2 - 0.12) - 0.16, yl - 0.07, -L / 2 - 0.005), V3(sx * (W / 2 - 0.12) - 0.16, yl + 0.07, -L / 2 - 0.005), V3(sx * (W / 2 - 0.12) + 0.16, yl + 0.07, -L / 2 - 0.005), [0.55, 0.04, 0.03], 0);
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
      g.setAttribute('tint', new THREE.Float32BufferAttribute(T, 1));
      g.computeBoundingSphere();
      return g;
    }
    Env._k.PROPS.parked = (v) => {
      const [kind, variant] = PARKED[v % PARKED.length], V = Env.vehicle(kind, variant);
      const wheels = Env._k.merge(V.wheels.map((q) => V.wheel.geometry.clone().translate(q.x, q.y, q.z)));
      const parts = V.parts.slice(0, 3).map((q) => ({ geometry: q.geometry, material: q.material, tint: !!q.tint, castShadow: q.castShadow !== false }));
      parts.push({ geometry: wheels, material: V.wheel.material, castShadow: true });
      // paint: a color from the same list the moving cars use, as linear rgb for the instance
      const paint = (u) => { pc.setHex(PAINT[Math.min(PAINT.length - 1, (u * PAINT.length) | 0)]); return [pc.r, pc.g, pc.b]; };
      // farther than lodD the simple version is drawn: one part, a few hundred triangles
      return { parts, radius: 0, len: V.len, wid: V.wid, h: V.h, kind, paint, lodD: 26, lod: { parts: [{ geometry: lowCar(kind, V), material: Env._k.mat('carLow', { std: true, roughness: 0.42, metalness: 0.1, tinted: true }), tint: true, castShadow: true }] } };
    };
    Env._k.VARIANTS.parked = PARKED.length;
  }

  return T;
})();
