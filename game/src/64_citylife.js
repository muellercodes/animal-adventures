/* ---------- city life: people walking on the sidewalks, crossing at the crosswalks, going in and out of the stores,
   waiting for the bus and riding it, sitting on park benches; a few people out walking in each small town; and a
   clerk behind the counter when you go into a store ---------- */
const CityLife = (() => {
  const C = { on: false, g: null, list: [], pool: [], spawnT: 0, room: null, inside: [], stats: { spawned: 0, crossed: 0, shopped: 0, rode: 0 } };
  const SOCIAL = { notice: 1, kneel: 1, greet: 1, lead: 1, friend: 1, offer: 1, pet: 1 };
  const NO_POSE = { crouch: 0, reach: 0 };
  const pick = (a) => a[(Math.random() * a.length) | 0];

  /* ---- where people walk: sidewalk corners at every crossing, the sidewalks between them, crosswalks, park paths ---- */
  function build() {
    const CT = Plan.CITY, R = CT.road / 2, M = R + 1.8, nodes = [], at = new Map();
    const add = (x, z, o) => { const k = Math.round(x * 2) + ',' + Math.round(z * 2); let n = at.get(k); if (!n) { n = Object.assign({ id: nodes.length, x, z, adj: [] }, o || {}); nodes.push(n); at.set(k, n); } return n; };
    const join = (a, b, cross) => { if (!a || !b || a === b || a.adj.some((q) => q.to === b)) return; a.adj.push({ to: b, cross: cross || null }); b.adj.push({ to: a, cross: cross || null }); };
    const corner = new Map();
    for (const n of CT.nodes) {
      const X = CT.x + n.x, Z = CT.z + n.z, c = {};
      for (const [k, sx, sz] of [['ne', 1, -1], ['nw', -1, -1], ['se', 1, 1], ['sw', -1, 1]]) c[k] = add(X + sx * M, Z + sz * M);
      corner.set(n, c);
      // across each street that leaves this crossing, or straight along where none does
      const X2 = { x: X, z: Z };
      const across = (a, b, d) => join(c[a], c[b], n.open[d] ? { x: X2.x, z: X2.z, axis: d === 'e' || d === 'w' ? 'x' : 'z', d } : null);
      across('ne', 'se', 'e'); across('nw', 'sw', 'w'); across('nw', 'ne', 'n'); across('sw', 'se', 's');
    }
    const nodeAt = (lx, lz) => CT.nodes.find((q) => q.x === lx && q.z === lz);
    for (const s of CT.segs) {
      const A = corner.get(nodeAt(s.ax, s.az)), B = corner.get(nodeAt(s.bx, s.bz));
      if (!A || !B) continue;
      if (s.dir === 'x') { join(A.ne, B.nw); join(A.se, B.sw); } else { join(A.sw, B.nw); join(A.se, B.ne); }
    }
    // the park: gates on all four sides, the ring path corners, the plaza
    const P0 = CT.park, cx = CT.x + (P0.x0 + P0.x1) / 2, cz = CT.z + (P0.z0 + P0.z1) / 2, hw = (P0.x1 - P0.x0) / 2, hd = (P0.z1 - P0.z0) / 2, ri = 9;
    const plaza = [add(cx - 11, cz, { park: true }), add(cx + 11, cz, { park: true }), add(cx, cz - 11, { park: true }), add(cx, cz + 11, { park: true })];
    join(plaza[0], plaza[2]); join(plaza[2], plaza[1]); join(plaza[1], plaza[3]); join(plaza[3], plaza[0]);
    const ring = [add(cx - hw + ri, cz - hd + ri, { park: true }), add(cx + hw - ri, cz - hd + ri, { park: true }), add(cx + hw - ri, cz + hd - ri, { park: true }), add(cx - hw + ri, cz + hd - ri, { park: true })];
    const mid = [add(cx - hw + ri, cz, { park: true }), add(cx, cz - hd + ri, { park: true }), add(cx + hw - ri, cz, { park: true }), add(cx, cz + hd - ri, { park: true })];
    join(ring[0], mid[1]); join(mid[1], ring[1]); join(ring[1], mid[2]); join(mid[2], ring[2]); join(ring[2], mid[3]); join(mid[3], ring[3]); join(ring[3], mid[0]); join(mid[0], ring[0]);
    join(mid[0], plaza[0]); join(mid[1], plaza[2]); join(mid[2], plaza[1]); join(mid[3], plaza[3]);
    const gate = (gx, gz, lx, lz, ks, m2) => { const g = add(gx, gz, { park: true }); const c = corner.get(nodeAt(lx, lz)); if (c) for (const k of ks) join(g, c[k]); join(g, m2); };
    gate(cx - hw - 0.5, cz, 0, 0, ['ne', 'se'], mid[0]);
    gate(cx + hw + 0.5, cz, 100, 0, ['nw', 'sw'], mid[2]);
    gate(cx, cz - hd - 0.5, 50, -50, ['sw', 'se'], mid[1]);
    gate(cx, cz + hd + 0.5, 50, 50, ['nw', 'ne'], mid[3]);
    // a node beside the nearest sidewalk for a spot (a store door, a bus stop)
    const hook = (x, z, o) => {
      let best = null, bd = 1e9;
      for (const a of nodes) for (const e of a.adj) {
        if (e.cross || a.park || e.to.park || e.to.id < a.id) continue;
        const b = e.to, vx = b.x - a.x, vz = b.z - a.z, L2 = vx * vx + vz * vz, t = Math.max(0, Math.min(1, ((x - a.x) * vx + (z - a.z) * vz) / L2));
        const d = Math.hypot(a.x + vx * t - x, a.z + vz * t - z);
        if (d < bd) { bd = d; best = [a, b]; }
      }
      const n = add(x, z, o);
      if (best && bd < 6) { join(n, best[0]); join(n, best[1]); }
      return n;
    };
    const G0 = { nodes, hook, stores: new Map(), stops: [] };
    for (const st of Plan.BUS.stops) if (!st.town) { const n = hook(st.wx, st.wz, { stop: st }); G0.stops.push(n); }
    return G0;
  }
  // shortest way between two nodes
  function route(a, b) {
    const N = C.g.nodes, dist = new Float32Array(N.length).fill(1e9), from = new Int32Array(N.length).fill(-1), done = new Uint8Array(N.length);
    dist[a.id] = 0;
    for (;;) {
      let u = -1, best = 1e9;
      for (let i = 0; i < N.length; i++) if (!done[i] && dist[i] < best) { best = dist[i]; u = i; }
      if (u < 0 || u === b.id) break;
      done[u] = 1;
      for (const e of N[u].adj) { const d = best + Math.hypot(e.to.x - N[u].x, e.to.z - N[u].z) + (e.cross ? 6 : 0); if (d < dist[e.to.id]) { dist[e.to.id] = d; from[e.to.id] = u; } }
    }
    if (from[b.id] < 0 && a !== b) return null;
    const path = []; for (let v = b.id; v >= 0; v = from[v]) { path.push(N[v]); if (v === a.id) break; }
    return path.reverse();
  }
  // the store doors in the parts of the city that are built right now
  function storeNode(h) {
    let n = C.g.stores.get(h);
    if (!n) { n = C.g.hook(h.door.x, h.door.z, { store: h }); C.g.stores.set(h, n); }
    return n;
  }

  /* ---- one walker ---- */
  function newGoal(p) {
    const w = G.world, r = Math.random(), here = nearestNode(p.pos.x, p.pos.z);
    const stores = w.houses.filter((h) => h.city && h.own && w.feats.has(h.own.key));
    let goal = null, kind = 'walk';
    if (r < 0.38 && stores.length && G.night < 0.6) { const h = pick(stores); goal = storeNode(h); kind = 'store'; p.storeH = h; }
    else if (r < 0.58) { const free = w.benches.filter((q) => !q.busy); if (free.length) { const bn = pick(free); goal = nearestNode(bn.x, bn.z, true); kind = 'bench'; p.bench = bn; } }
    else if (r < 0.7 && C.g.stops.length) { goal = pick(C.g.stops); kind = 'bus'; }
    if (!goal) { goal = pick(C.g.nodes); kind = 'walk'; }
    const path = route(here, goal);
    if (!path || path.length < 1) { p.path = [goal]; } else p.path = path;
    p.pi = 0; p.goalKind = kind; p.cs = 'walk'; p.waitT = 0;
    // the last steps off the path: up to the bench
    if (kind === 'bench' && p.bench) { p.bench.busy = p; p.path.push({ x: p.bench.x + Math.sin(p.bench.rot) * 0.9, z: p.bench.z + Math.cos(p.bench.rot) * 0.9 }); }
  }
  function nearestNode(x, z, park) {
    let best = null, bd = 1e9;
    for (const n of C.g.nodes) { if (park && !n.park) continue; const d = Math.hypot(n.x - x, n.z - z); if (d < bd) { bd = d; best = n; } }
    return best;
  }
  // may we walk across now? (the walk light, or no car coming close)
  function mayCross(cr) {
    const L = Traffic.light(cr.x, cr.z, cr.axis);
    if (L) return L === 'r';
    for (const c of Traffic.cars) { const d = Math.hypot(c.x - cr.x, c.z - cr.z); if (d < 26 && c.v > 1 && ((c.x - cr.x) * c.fx + (c.z - cr.z) * c.fz) < 0) return false; }
    return true;
  }
  function spawnWalker(n) {
    let p = C.pool.pop();
    if (p) { p.name = Town.freeName(); p.pos.set(n.x, G.world.H(n.x, n.z), n.z); G.scene.add(p.rig.root); Folk.list.push(p); Object.assign(p, { state: 'look', away: false, friend: false, owns: null, cool: 6, room: null, speed: 0 }); p.rig.setVisible(true); }
    else p = Folk.make(Town.freeName(), Folk.randomLook(Math.random() < 0.15), n.x, n.z, { city: true, cool: 6 });
    p.city = true; p.cs = 'walk'; p.storeH = null; p.bench = null; p.sitT = 0; p.pace = 1.05 + Math.random() * 0.35;
    C.list.push(p); C.stats.spawned++;
    newGoal(p);
    return p;
  }
  function dropWalker(p) {
    if (p.bench && p.bench.busy === p) p.bench.busy = null;
    const i = C.list.indexOf(p); if (i >= 0) C.list.splice(i, 1);
    if (Folk.list.includes(p)) Folk.remove(p);
    if (C.pool.length < 12 && !p.friend && !p.owns) C.pool.push(p);
  }
  // Folk.update calls this for city people; null means the usual person logic runs this frame (noticing your animal)
  C.step = (p, dt, P, dP, greet, reach) => {
    if (p.friend || p.owns) { p.city = false; const i = C.list.indexOf(p); if (i >= 0) C.list.splice(i, 1); if (p.bench && p.bench.busy === p) p.bench.busy = null; return null; }
    if (SOCIAL[p.state]) return null;
    const w = G.world;
    // noticing your animal works like everywhere else
    if (P && G.night < 0.5 && p.cs !== 'store' && p.cs !== 'gone' && !p.friend && p.cool <= 0 && !S.homes[P.sp] && dP < 7 && reach && !Folk.list.some((q) => SOCIAL[q.state] || q.friend)) {
      p.state = 'notice'; p.timer = 1.3; p.sitT = 0;
      const nm = stageName(P.sp).toLowerCase();
      G.ui.bubble(p, Math.random() < 0.5 ? `Aww, ${/^[aeiou]/.test(nm) ? 'an' : 'a'} ${nm}!` : 'Oh, hello there!', 2.2);
      return null;
    }
    p.cool = Math.max(0, p.cool - dt);
    switch (p.cs) {
      case 'walk': {
        const n = p.path[p.pi];
        if (!n) { arrive(p); break; }
        const prev = p.path[p.pi - 1], link = prev && prev.adj ? prev.adj.find((q) => q.to === n) : null;
        // at the curb: wait for the light or a gap in the traffic
        if (link && link.cross && !p.crossing) {
          if (!mayCross(link.cross)) { p.speed = damp(p.speed, 0, 6, dt); Folk.face(p, dt, n.x, n.z); p.waitT += dt; if (p.waitT < 40) break; }
          p.crossing = true; p.waitT = 0; C.stats.crossed++;
        }
        const d = Folk.walkTo(p, dt, n.x, n.z, p.crossing ? p.pace * 1.15 : p.pace);
        if (p.blocked) p.stuck = (p.stuck || 0) + dt; else p.stuck = 0;
        if (d < 0.7 || p.stuck > 4) { p.pi++; p.crossing = false; p.stuck = 0; }
        break;
      }
      case 'store':
        p.timer -= dt; p.speed = 0;
        if (p.timer <= 0) { const h = p.storeH; p.away = false; p.rig.setVisible(true); if (h) { Folk.teleport(p, h.door.x, h.door.z); p.yaw = h.door.yaw; } newGoal(p); }
        return NO_POSE;
      case 'sit': {
        const b = p.bench;
        p.speed = 0; p.sitT -= dt;
        if (b) { p.pos.x = b.x; p.pos.z = b.z; p.yaw = b.rot; }
        if (p.sitT <= 0 || !b || !w.benches.includes(b)) { if (b && b.busy === p) b.busy = null; p.bench = null; const fx = b ? Math.sin(b.rot) : 0, fz = b ? Math.cos(b.rot) : 0; if (b) Folk.teleport(p, b.x + fx * 0.8, b.z + fz * 0.8); newGoal(p); break; }
        return { crouch: 0, reach: 0, sit: 1, seatY: 0.46 };
      }
      case 'still':
        p.speed = 0;
        if (P && dP < 6) Folk.face(p, dt, P.pos.x, P.pos.z);
        return NO_POSE;
      case 'bus': {
        p.speed = damp(p.speed, 0, 6, dt);
        const st = p.stopNode && p.stopNode.stop, bus = st && Traffic.buses.find((b) => b.stopAt && b.stopAt.st === st && b.doors > 0.6);
        if (st) Folk.face(p, dt, st.x, st.z);
        if (bus) { p.cs = 'board'; p.bus = bus; }
        p.waitT += dt; if (p.waitT > 120) newGoal(p);
        break;
      }
      case 'board': {
        // the front door, on the right hand side
        const b = p.bus, f = b.len / 2 - 1.6, sd = b.wid / 2 + 0.5, dx = b.x + b.fx * f - b.fz * sd, dz = b.z + b.fz * f + b.fx * sd;
        const d = Folk.walkTo(p, dt, dx, dz, p.pace * 1.2);
        if (d < 0.9 || !(b.doors > 0.2)) { if (d < 2.5) { b.riders = (b.riders || 0) + 1; C.stats.rode++; dropWalker(p); return NO_POSE; } p.cs = 'walk'; newGoal(p); }
        break;
      }
    }
    return NO_POSE;
  };
  function arrive(p) {
    if (p.goalKind === 'store' && p.storeH) { p.cs = 'store'; p.timer = 14 + Math.random() * 30; p.away = true; p.rig.setVisible(false); G.ui.dropBubble(p); C.stats.shopped++; if (p.storeH.group) G.world.openDoor(p.storeH.group, 1); return; }
    if (p.goalKind === 'bench' && p.bench && G.world.benches.includes(p.bench)) { p.cs = 'sit'; p.sitT = 18 + Math.random() * 30; return; }
    if (p.goalKind === 'bus') { p.cs = 'bus'; p.stopNode = p.path[p.path.length - 1]; p.waitT = 0; return; }
    newGoal(p);
  }

  /* ---- small towns: a few people out for a walk along the main street, popping into the shops ---- */
  function townWalkers(P) {
    for (const t of Plan.TOWNS) {
      const near = Math.hypot(P.pos.x - t.x, P.pos.z - t.z) < 130 && G.world.feats.has(t.key);
      if (!near) { if (t.folk) { for (const p of t.folk) if (Folk.list.includes(p)) Folk.remove(p); t.folk = null; } continue; }
      if (t.folk) continue;
      t.folk = [];
      const ax = t.axis === 'x';
      for (let i = 0; i < 3; i++) {
        const u = (Math.random() - 0.5) * t.len * 0.8, c = (Math.random() < 0.5 ? -1 : 1) * 4.3;
        const x = ax ? t.x + u : t.x + c, z = ax ? t.z + c : t.z + u;
        const homes = G.world.houses.filter((h) => h.town === t.name && h.kind === 'house');
        const p = Folk.make(Town.freeName(), Folk.randomLook(Math.random() < 0.25), x, z, { house: homes.length ? pick(homes) : null });
        // these use the usual person logic; their walk points are along their own street
        p.walkPts = []; for (let k = -3; k <= 3; k++) for (const sd of [-1, 1]) p.walkPts.push(ax ? [t.x + k * 20 + 10, t.z + sd * 4.3] : [t.x + sd * 4.3, t.z + k * 20 + 10]);
        t.folk.push(p);
      }
    }
  }

  /* ---- inside a store: the clerk behind the counter and a shopper or two ---- */
  function storePeople(P) {
    const rm = P && P.room && P.room.store ? P.room : null;
    if (rm === C.room) return;
    for (const p of C.inside) if (Folk.list.includes(p)) Folk.remove(p);
    C.inside = []; C.room = rm;
    if (!rm) return;
    const mk = (spot, extra) => { if (!spot) return null; const p = Folk.make(Town.freeName(), Folk.randomLook(false), spot.x, spot.z, Object.assign({ room: rm, city: true, cs: 'still', cool: 4 }, extra)); p.yaw = spot.yaw || 0; C.inside.push(p); return p; };
    const clerk = mk(rm.clerk, { clerk: true });
    if (clerk) G.ui.bubble(clerk, pick(['Hello! Welcome in!', 'Well hi there, little one!', 'Look who came to shop!', 'Come on in!']), 2.6);
    const sh = (rm.shoppers || []).slice().sort(() => Math.random() - 0.5).slice(0, 1 + ((Math.random() * 2) | 0));
    for (const s of sh) mk(s, { shopper: true });
  }

  /* ---- each frame ---- */
  C.init = (w) => { C.on = !!(w.def.places && w.id === 'land'); C.list = []; C.pool = []; C.room = null; C.inside = []; for (const t of Plan.TOWNS) t.folk = null; if (C.on && !C.g) C.g = build(); if (C.g) C.g.stores = new Map(); };
  C.update = (dt, P) => {
    if (!C.on || !P) return;
    storePeople(P);
    townWalkers(P);
    if (P.room) return;   // inside: everyone outside carries on where they were
    const inCity = Plan.inCity(P.pos.x, P.pos.z, 70);
    // too far away: go
    for (const p of C.list.slice()) if (!inCity || Math.hypot(p.pos.x - P.pos.x, p.pos.z - P.pos.z) > 120) dropWalker(p);
    // people getting off the bus
    for (const b of Traffic.buses) {
      if (!inCity || !b.stopAt || b.doors < 0.7 || b.dropped === b.stopAt || !(b.riders > 0)) continue;
      b.dropped = b.stopAt;
      const n = C.g.stops.find((q) => q.stop === b.stopAt.st);
      if (n && Math.hypot(n.x - P.pos.x, n.z - P.pos.z) < 100) for (let k = 0; k < Math.min(2, b.riders); k++) { spawnWalker(n); b.riders--; }
    }
    C.spawnT -= dt;
    if (inCity && C.spawnT <= 0) {
      C.spawnT = 0.8;
      const want = G.night > 0.6 ? 4 : 12;
      if (C.list.length < want) {
        for (let k = 0; k < 8; k++) {
          const n = pick(C.g.nodes), d = Math.hypot(n.x - P.pos.x, n.z - P.pos.z);
          if (d > 28 && d < 85 && !n.stop) { spawnWalker(n); break; }
        }
      }
    }
  };
  return C;
})();
