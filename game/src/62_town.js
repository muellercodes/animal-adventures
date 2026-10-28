/* ---------- town life: jobs, school and kids, traps and pests, the pound, the adoption fair ----------
   Rosemary's rules: grown-ups go to work and leave for the day, a teacher teaches the kids at school,
   the farmer traps the weasels that eat his carrots so he can feed his own animals, animal control
   catches loose animals in town and takes them to the pound (the pound calls the number on your collar),
   and scouts look in the woods for animals without homes and bring them to the adoption fair. */
const KID_NAMES = ['Lily', 'Max', 'Zoe', 'Jack', 'Mia', 'Noah', 'Ella', 'Luke'];
const PESTS = { weasel: 1, bunny: 1, raccoon: 1 };
const BIG = { horse: 1, moose: 1, deer: 1, swan: 1 };
// the school day, in seconds after sunrise (a day lasts 720 seconds)
const T_LEAVE = 20, T_BELL = 70, T_RECESS = 280, T_CLASS2 = 340, T_OUT = 450, T_HOME = 560;
const NO_POSE = { crouch: 0, reach: 0 };
const FAIR_ANIMALS = ['otter', 'snake', 'weasel', 'hedgehog', 'bunny', 'turtle', 'raccoon', 'squirrel', 'fox', 'lizard', 'dog', 'cat', 'dog', 'cat'].filter((s) => SPECIES[s]);
const hexNum = (h) => (typeof h === 'string' ? parseInt(h.replace('#', ''), 16) : h) || 0x3e8e6e;
const rnd = (a) => a[(Math.random() * a.length) | 0];

/* ---- where people can walk: a 1 m grid over the middle of Land, and A* paths on it ---- */
const Nav = {
  X0: -100, Z0: -132, W: 366, D: 214, g: null, row: 0, ready: false,
  build() {
    const N = this.W * this.D;
    this.g = new Uint8Array(N); this.fs = new Float32Array(N); this.gs = new Float32Array(N); this.from = new Int32Array(N); this.mark = new Uint32Array(N); this.stamp = 0;
    this.row = 0; this.ready = false;
  },
  // fill in the grid a few rows at a time, so loading the world doesn't stall
  work(ms) {
    if (this.ready || !this.g) return;
    const W = this.W, g = this.g, t0 = performance.now();
    while (this.row < this.D && performance.now() - t0 < ms) {
      const j = this.row++;
      for (let i = 0; i < W; i++) g[j * W + i] = Town.freeAt(this.X0 + i + 0.5, this.Z0 + j + 0.5, 0.34) ? 0 : 1;
    }
    if (this.row >= this.D) this.ready = true;
  },
  ok(i, j) { return i >= 0 && j >= 0 && i < this.W && j < this.D && this.g[j * this.W + i] === 0; },
  okXZ(x, z) { if (!this.ready) return true; const i = Math.floor(x - this.X0), j = Math.floor(z - this.Z0); return i < 0 || j < 0 || i >= this.W || j >= this.D || this.g[j * this.W + i] === 0; },
  inside(x, z) { return x > this.X0 + 1 && z > this.Z0 + 1 && x < this.X0 + this.W - 1 && z < this.Z0 + this.D - 1; },
  clampIn(x, z) { return { x: clamp(x, this.X0 + 1.5, this.X0 + this.W - 1.5), z: clamp(z, this.Z0 + 1.5, this.Z0 + this.D - 1.5) }; },
  nearest(x, z) {
    const i0 = Math.floor(x - this.X0), j0 = Math.floor(z - this.Z0);
    for (let r = 0; r < 10; r++) {
      let best = -1, bd = 1e9;
      for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== r || !this.ok(i0 + di, j0 + dj)) continue;
        const d = di * di + dj * dj; if (d < bd) { bd = d; best = (j0 + dj) * this.W + i0 + di; }
      }
      if (best >= 0) return best;
    }
    return -1;
  },
  los(x0, z0, x1, z1) { const n = Math.ceil(Math.hypot(x1 - x0, z1 - z0) / 0.35); for (let k = 1; k < n; k++) if (!this.okXZ(x0 + (x1 - x0) * k / n, z0 + (z1 - z0) * k / n)) return false; return true; },
  // points to walk through from (ax, az) to (bx, bz), or null
  find(ax, az, bx, bz) {
    if (!this.ready) return null;
    const W = this.W, s = this.nearest(ax, az), e = this.nearest(bx, bz);
    if (s < 0 || e < 0) return null;
    const fs = this.fs, gs = this.gs, from = this.from, mark = this.mark;
    this.stamp++; const OPEN = this.stamp * 2, CLOSED = OPEN + 1;
    const ei = e % W, ej = (e / W) | 0;
    const hfn = (n) => { const dx = Math.abs(n % W - ei), dz = Math.abs(((n / W) | 0) - ej); return dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz); };
    const heap = [];
    const push = (n) => { heap.push(n); let k = heap.length - 1; while (k > 0) { const q = (k - 1) >> 1; if (fs[heap[q]] <= fs[n]) break; heap[k] = heap[q]; k = q; } heap[k] = n; };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let k = 0; const L = heap.length; for (;;) { let c = 2 * k + 1; if (c >= L) break; if (c + 1 < L && fs[heap[c + 1]] < fs[heap[c]]) c++; if (fs[heap[c]] >= fs[last]) break; heap[k] = heap[c]; k = c; } heap[k] = last; } return top; };
    gs[s] = 0; fs[s] = hfn(s); mark[s] = OPEN; from[s] = -1; push(s);
    let found = false, iter = 0;
    while (heap.length && iter++ < 45000) {
      const n = pop();
      if (mark[n] === CLOSED) continue;
      mark[n] = CLOSED;
      if (n === e) { found = true; break; }
      const i = n % W, j = (n / W) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (!di && !dj) continue;
        const ni = i + di, nj = j + dj;
        if (!this.ok(ni, nj) || (di && dj && (!this.ok(i + di, j) || !this.ok(i, j + dj)))) continue;
        const m = nj * W + ni; if (mark[m] === CLOSED) continue;
        const g2 = gs[n] + (di && dj ? Math.SQRT2 : 1);
        if (mark[m] === OPEN && g2 >= gs[m]) continue;
        gs[m] = g2; fs[m] = g2 + hfn(m) * 1.001; from[m] = n; mark[m] = OPEN; push(m);
      }
    }
    if (!found) return null;
    const cells = []; for (let n = e; n >= 0; n = from[n]) cells.push(n);
    cells.reverse();
    const pts = cells.map((n) => ({ x: this.X0 + (n % W) + 0.5, z: this.Z0 + ((n / W) | 0) + 0.5 }));
    // pull the path straight wherever nothing is in the way
    const out = []; let a = { x: ax, z: az }, k = -1;
    while (k < pts.length - 1) {
      let j = k + 1;
      while (j + 1 < pts.length && this.los(a.x, a.z, pts[j + 1].x, pts[j + 1].z)) j++;
      out.push(pts[j]); a = pts[j]; k = j;
    }
    return out;
  },
};

const Town = {
  on: false, list: [], poundList: [], stats: { hop: 0, skip: 0, paths: 0, pathMs: 0 }, respawn: [], fishT: 0, fairT: 0, bells: {}, trapped: null, trapT: 0, call: null, fade: null, navN: 0, toldCatch: false,
  // a name nobody around here has yet
  freeName() {
    const used = new Set(Folk.list.map((p) => p.name).concat(Object.values(S.homes).filter(Boolean).map((h) => h.name)));
    const free = PEOPLE_NAMES.filter((n) => !used.has(n));
    return rnd(free.length ? free : PEOPLE_NAMES);
  },
  freeAt(x, z, r) { const w = G.world; if (w.def.water && w.H(x, z) < WATER + 0.06) return false; tmpV.set(x, 0, z); return !w.collide(tmpV, r); },
  // the people of Maple Street, with their jobs (Land only)
  spawn(w) {
    this.list = []; this.trapped = null; this.call = null; this.fade = null; this.respawn = []; this.fairT = 8; this.fishT = 20;
    this.on = !!(w.def.town && w.def.village);
    if (!this.on) return;
    Nav.build();
    const homes = Homes.village(), tc = this.dayTime();
    const used = new Set(Object.values(S.homes).filter(Boolean).map((h) => h.name));
    const mk = (name, role, look, hi, item) => {
      if (used.has(name)) name = name + ' B.';
      const house = homes[hi % homes.length];
      const p = Folk.make(name, look, house.door.x, house.door.z, { role, house, away: true, state: 'job', lag: Math.random() * 22 });
      p.at = role === 'commuter' && tc >= T_LEAVE + 25 && tc < T_HOME ? 'work' : 'home';
      p.rig.setVisible(false);
      if (item && Env[item] && p.rig.hold) p.rig.hold(Env[item]());
      this.list.push(p);
      return p;
    };
    const look = (kid, extra) => Object.assign(Folk.randomLook(kid), extra || {});
    if (w.school) mk('Ms. Clara', 'teacher', look(false, { shirt: '#B04A5A', height: 1.66 }), 2, 'book');
    mk('Farmer Joe', 'farmer', look(false, { shirt: '#4E7A3A', pants: '#4A5A6E', height: 1.8 }), 4, 'carrotBasket');
    mk('Officer Kim', 'officer', look(false, { shirt: '#2F4E7A', pants: '#2A2F3A', height: 1.78 }), 1, 'catchNet');
    mk('Walt', 'fisher', look(false, { shirt: '#C9A23A' }), 5, null);
    mk('Wren', 'scout', look(false, { shirt: '#3E8E6E' }), 3, 'petCarrier');
    if (w.fair) mk('Lucy', 'helper', look(false, { shirt: '#D96A3A' }), 0, null);
    mk('Mateo', 'commuter', look(false), 1, null);
    mk('Priya', 'commuter', look(false), 4, null);
    KID_NAMES.slice().sort(() => Math.random() - 0.5).slice(0, 5).forEach((n, i) => { const k = mk(n, 'kid', look(true), i, null); k.roamer = i % 2 === 1; });
    // the fair starts with a couple of animals who need homes
    if (w.fair) for (const pen of w.fair.pens.slice(0, 2)) this.penAnimal(pen, rnd(FAIR_ANIMALS));
    this.stockDay = nightNo();
  },
  dayTime() { const tc = ((S.time % CYCLE) + CYCLE) % CYCLE; return tc < DAY_LEN ? tc : -1; },
  // where someone should be right now
  plan(p, tc) {
    if (tc < 0 || tc < T_LEAVE + p.lag) return 'night';
    if (tc >= T_HOME + p.lag) return 'home';
    switch (p.role) {
      case 'kid': return tc < T_BELL ? 'play' : tc < T_RECESS ? 'class' : tc < T_CLASS2 ? 'play' : tc < T_OUT ? 'class' : p.roamer ? 'roam' : 'play';
      case 'teacher': return tc < T_RECESS ? 'class' : tc < T_CLASS2 ? 'watch' : tc < T_OUT ? 'class' : 'watch';
      case 'commuter': return 'away';
      default: return 'work';
    }
  },
  /* ---- one person with a job, called from Folk.update; returns how to pose ---- */
  step(p, dt, P, dP, greet, reachable) {
    const tc = this.dayTime(), want = this.plan(p, tc);
    p.yOff = 0;
    if (p.away) {
      const stay = want === 'night' || (want === 'away' && p.at === 'work') || (want === 'home' && p.at !== 'work');
      if (stay) return NO_POSE;
      this.comeOut(p);
    }
    if (p.room && !(want === 'class' && p.room.school)) {
      // walk out of the classroom if you're watching, then out the door
      const rm = p.room, ex = rm.exit;
      p.exitT = (p.exitT || 0) + dt;
      if (Player.b && Player.b.room === rm && p.exitT < 8 && Math.hypot(p.pos.x - ex.x, p.pos.z - ex.z) > 0.7) { Folk.walkTo(p, dt, ex.x, ex.z, p.role === 'kid' ? 1.8 : 1.2); return NO_POSE; }
      p.exitT = 0; this.outOfRoom(p);
    }
    if (want === 'home' || want === 'night') return this.goIn(p, dt);
    if (want === 'away') return this.leaveTown(p, dt);
    switch (want) {
      case 'class': return this.inClass(p, dt, P);
      case 'play': return this.kidPets(p, dt, P, dP, greet, reachable) || this.play(p, dt);
      case 'roam': return this.kidPets(p, dt, P, dP, greet, reachable) || this.roam(p, dt);
      case 'watch': return this.watch(p, dt);
      case 'work': return this.work(p, dt, P, dP, greet, reachable);
    }
    return NO_POSE;
  },
  comeOut(p) {
    const w = G.world, h = p.house, t = w.def.town, cam = G.camera.position;
    p.away = false; p.rig.setVisible(true); p.goal = null; p.task = null; p.leg2 = false;
    if (p.at === 'work') { const c = Math.hypot(t.commute[0] - cam.x, t.commute[1] - cam.z) < 50 ? t.commuteFar : t.commute; Folk.teleport(p, c[0], c[1]); }
    else { Folk.teleport(p, h.door.x, h.door.z); p.yaw = h.door.yaw; if (h.group) w.openDoor(h.group, 1); }
  },
  outOfRoom(p) {
    const h = p.room.house, d = h.door;
    Folk.teleport(p, d.x + Math.sin(d.yaw) * 0.5, d.z + Math.cos(d.yaw) * 0.5); p.yaw = d.yaw; p.goal = null; p.seat = null;
    if (h.group) G.world.openDoor(h.group, 1);
  },
  goIn(p, dt) {
    const h = p.house, d = h.door;
    p.homeT = (p.homeT || 0) + dt;
    if (this.go(p, dt, d.x, d.z, 1.4) || p.homeT > 150) {
      p.away = true; p.at = 'home'; p.homeT = 0; p.rig.setVisible(false); G.ui.dropBubble(p); this.dropSpot(p);
      if (h.group && Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 2) G.world.openDoor(h.group, 1);
    }
    return NO_POSE;
  },
  // grown-ups who work out of town walk away down the path in the morning and come back in the evening
  leaveTown(p, dt) {
    const t = G.world.def.town, cam = G.camera.position, far = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z) > 50;
    const to = p.leg2 ? t.commuteFar : t.commute;
    const there = this.go(p, dt, to[0], to[1], 1.5);
    if (there && !p.leg2 && !far) p.leg2 = true;
    else if ((there || p.leg2) && (far || there)) { p.leg2 = false; p.away = true; p.at = 'work'; p.rig.setVisible(false); G.ui.dropBubble(p); }
    return NO_POSE;
  },
  /* ---- walking: A* paths around fences and buildings, stepping aside when something is in the way ---- */
  go(p, dt, x, z, speed) {
    const g = p.goal;
    if (!g || Math.abs(g.x - x) > 0.4 || Math.abs(g.z - z) > 0.4 || (p.rough && Nav.ready)) {
      const direct = p.room || (Math.hypot(x - p.pos.x, z - p.pos.z) < 14 && Nav.los(p.pos.x, p.pos.z, x, z));
      if (!direct && this.navN >= 2) { p.speed = damp(p.speed, 0, 6, dt); return false; }
      p.goal = { x, z }; p.side = null; p.stuckT = 0; p.stuckN = 0; p.pi = 0; p.rough = !Nav.ready;
      if (direct) p.path = [{ x, z }];
      else {
        this.navN++;
        const a = Nav.inside(p.pos.x, p.pos.z) ? null : Nav.clampIn(p.pos.x, p.pos.z), b = Nav.inside(x, z) ? null : Nav.clampIn(x, z);
        const s = a || p.pos, e = b || { x, z };
        const t0 = performance.now();
        p.path = (a ? [a] : []).concat(Nav.find(s.x, s.z, e.x, e.z) || [], [{ x, z }]);
        this.stats.paths++; this.stats.pathMs += performance.now() - t0;
      }
    }
    return this.follow(p, dt, speed);
  },
  follow(p, dt, speed) {
    const path = p.path;
    while (p.pi < path.length) {
      const q = path[p.pi], last = p.pi === path.length - 1;
      if (Math.hypot(q.x - p.pos.x, q.z - p.pos.z) < (last ? 0.45 : 0.8)) { p.pi++; p.stuckN = 0; continue; }
      if (p.side) {
        p.side.t -= dt;
        Folk.walkTo(p, dt, p.side.x, p.side.z, speed);
        if (p.side.t <= 0 || Math.hypot(p.side.x - p.pos.x, p.side.z - p.pos.z) < 0.35) p.side = null;
        return false;
      }
      Folk.walkTo(p, dt, q.x, q.z, speed);
      p.stuckT = p.blocked ? p.stuckT + dt : Math.max(0, p.stuckT - dt * 0.5);
      if (p.stuckT > 0.6) {
        p.stuckT = 0; p.stuckN++;
        const cam = G.camera.position, far = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z) > 45;
        if (p.stuckN > 4 && far) { Folk.teleport(p, q.x, q.z, p.room); this.stats.hop++; }
        else if (p.stuckN > 8) { p.pi++; p.stuckN = 0; this.stats.skip++; }
        else this.sidestep(p, q);
      }
      return false;
    }
    p.speed = damp(p.speed, 0, 6, dt);
    return true;
  },
  sidestep(p, q) {
    const a = Math.atan2(q.x - p.pos.x, q.z - p.pos.z), pref = p.sideSign || (Math.random() < 0.5 ? 1 : -1);
    for (const k of [1, 2, 3, 4]) for (const s of [pref, -pref]) {
      const b = a + s * k * 0.55, x = p.pos.x + Math.sin(b) * 1.4, z = p.pos.z + Math.cos(b) * 1.4;
      if (p.room || this.freeAt(x, z, 0.3)) { p.side = { x, z, t: 1.1 }; p.sideSign = s; return; }
    }
  },
  wanderIn(p, dt, cx, cz, r, speed) {
    if (!p.wt || p.wtT <= 0) {
      p.wt = null;
      for (let k = 0; k < 6 && !p.wt; k++) { const a = Math.random() * TAU, d = Math.sqrt(Math.random()) * r, x = cx + Math.sin(a) * d, z = cz + Math.cos(a) * d; if (this.freeAt(x, z, 0.35)) p.wt = { x, z }; }
      p.wtT = 5 + Math.random() * 5; p.pause = Math.random() < 0.4 ? 1 + Math.random() * 2.5 : 0;
      if (!p.wt) return NO_POSE;
    }
    p.wtT -= dt;
    if (p.pause > 0) { p.pause -= dt; p.speed = damp(p.speed, 0, 6, dt); return NO_POSE; }
    if (this.go(p, dt, p.wt.x, p.wt.z, speed)) p.wtT = Math.min(p.wtT, 0.6 + Math.random());
    return NO_POSE;
  },
  dropSpot(p) { if (p.spot) { p.spot.busy = null; p.spot = null; } p.atSpot = false; },
  /* ---- school ---- */
  inClass(p, dt, P) {
    const s = G.world.school, rm = s && s.room; if (!rm) return NO_POSE;
    if (p.room !== rm) {
      const d = s.door;
      if (!this.go(p, dt, d.x, d.z, p.role === 'kid' ? 1.7 : 1.3)) return NO_POSE;
      // through the door and to my desk
      const kids = this.list.filter((q) => q.role === 'kid');
      const seat = p.role === 'teacher' ? rm.teacher : rm.seats.length ? rm.seats[Math.max(0, kids.indexOf(p)) % rm.seats.length] : null;
      if (!seat) return NO_POSE;
      if (s.group) G.world.openDoor(s.group, 1);
      p.seat = seat; p.goal = null; this.dropSpot(p);
      // walk in from the door if you're watching; otherwise just be at your desk
      if (P && P.room === rm) { Folk.teleport(p, rm.exit.x, rm.exit.z, rm); p.seatT = 0; } else { Folk.teleport(p, seat.x, seat.z, rm); p.yaw = seat.yaw || 0; p.seatT = -1; }
    }
    if (p.seatT >= 0) {
      p.seatT += dt;
      if (p.seatT < 8 && Math.hypot(p.seat.x - p.pos.x, p.seat.z - p.pos.z) > 0.3) { Folk.walkTo(p, dt, p.seat.x, p.seat.z, p.role === 'kid' ? 1.4 : 1.1); return NO_POSE; }
      p.pos.x = p.seat.x; p.pos.z = p.seat.z; p.seatT = -1;
    }
    const sy = p.seat.yaw || 0, here = P && P.room === rm;
    if (p.role === 'teacher') {
      // walk a little along the board, then turn back to the class
      p.paceT = (p.paceT || 0) - dt;
      if (p.paceT <= 0) {
        p.paceT = 3 + Math.random() * 4; const o = (Math.random() - 0.5) * 2.4;
        p.paceTo = { x: p.seat.x + Math.cos(sy) * o, z: p.seat.z - Math.sin(sy) * o };
        if (here && !p.bub && Math.random() < 0.45) G.ui.bubble(p, rnd(['A is for apple!', 'B is for bunny!', 'Who can count to ten?', 'Great job, everyone!', 'Let\'s read a story.', 'What sound does a cow make?']), 2.4);
      }
      if (Math.hypot(p.paceTo.x - p.pos.x, p.paceTo.z - p.pos.z) > 0.2) Folk.walkTo(p, dt, p.paceTo.x, p.paceTo.z, 0.6);
      else { p.speed = damp(p.speed, 0, 6, dt); Folk.face(p, dt, p.pos.x + Math.sin(sy) * 3, p.pos.z + Math.cos(sy) * 3); }
      if (here && !p.sawVisitor) { p.sawVisitor = true; G.ui.bubble(p, 'Look, class, we have a visitor!', 2.6); }
      if (!here) p.sawVisitor = false;
      return { crouch: 0, reach: 0.2 + 0.2 * Math.sin(G.t * 0.8) };
    }
    p.speed = 0;
    // kids look at the board, and turn to look at an animal that comes into class
    let look = sy + Math.sin(G.t * 0.4 + p.lag) * 0.15;
    if (here && Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < 5) look = sy + clamp(angDiff(sy, Math.atan2(P.pos.x - p.pos.x, P.pos.z - p.pos.z)), -0.9, 0.9);
    Folk.face(p, dt, p.pos.x + Math.sin(look) * 3, p.pos.z + Math.cos(look) * 3);
    if (here && !p.sawVisitor && Math.random() < 0.004) { p.sawVisitor = true; G.ui.bubble(p, rnd(['A ' + stageName(P.sp).toLowerCase() + '!', 'Can it stay?', 'So cute!']), 1.8); }
    if (!here) p.sawVisitor = false;
    const hand = Math.sin(G.t * 0.35 + p.lag * 3) > 0.93 ? 1 : 0;
    return { crouch: 0, reach: hand, sit: 1, seatY: rm.ud.seatY || 0.37 };
  },
  // recess and after school: swings, the slide, the sandbox, or running around
  play(p, dt) {
    const pg = G.world.playground;
    if (!pg) return this.wanderIn(p, dt, G.world.def.town.schoolyard.x, G.world.def.town.schoolyard.z, 10, 2);
    if (!p.spot || p.spotT <= 0) {
      this.dropSpot(p);
      const free = pg.spots.filter((q) => !q.busy);
      if (free.length && Math.random() < 0.7) { p.spot = rnd(free); p.spot.busy = p; }
      p.spotT = 12 + Math.random() * 14;
    }
    p.spotT -= dt;
    if (!p.spot) return this.wanderIn(p, dt, pg.x, pg.z, 9, 2.3);
    if (!p.atSpot) { if (!this.go(p, dt, p.spot.x, p.spot.z, 2)) return NO_POSE; p.atSpot = true; }
    const k = p.spot.kind, y = p.spot.yaw || 0;
    p.speed = 0; Folk.face(p, dt, p.pos.x + Math.sin(y) * 3, p.pos.z + Math.cos(y) * 3);
    // ride along on the swing or the seesaw
    if (k === 'swing' && p.spot.swing) { const a = p.spot.swing.ang || 0, L = 1.86, o = -Math.sin(a) * L; p.pos.x = p.spot.x + Math.sin(pg.rot) * o; p.pos.z = p.spot.z + Math.cos(pg.rot) * o; p.yOff = (1 - Math.cos(a)) * L; }
    if (k === 'seesaw' && pg.seesaw && pg.seesaw.obj) { const dx = p.spot.x - pg.x, dz = p.spot.z - pg.z, lx = dx * Math.cos(pg.rot) - dz * Math.sin(pg.rot); p.yOff = (lx - pg.seesaw.pivot.x) * Math.sin(pg.seesaw.obj.rotation.z); }
    const seat = { swing: 0.44, seesaw: 0.6, bench: 0.45 }[k];
    return { crouch: k === 'sand' ? 1 : 0, reach: k === 'sand' ? 0.6 + 0.3 * Math.sin(G.t * 3 + p.lag) : k === 'swing' || k === 'seesaw' ? 0.5 : 0, sit: seat ? 1 : 0, seatY: seat };
  },
  // after school some kids walk around town and go see the animals at the fair
  roam(p, dt) {
    const w = G.world;
    if (!p.roamTo || p.roamT <= 0) { const pts = (w.def.villageWalk || []).concat(w.fair ? [[w.fair.x - 7, w.fair.z]] : []); const q = rnd(pts); p.roamTo = { x: q[0] + (Math.random() - 0.5) * 4, z: q[1] + (Math.random() - 0.5) * 4 }; p.roamT = 25 + Math.random() * 20; }
    p.roamT -= dt;
    if (this.go(p, dt, p.roamTo.x, p.roamTo.z, 1.5)) { p.speed = 0; p.roamT = Math.min(p.roamT, 4); }
    return NO_POSE;
  },
  watch(p, dt) {
    const pg = G.world.playground, s = G.world.def.town.schoolyard;
    return this.wanderIn(p, dt, pg ? pg.x - 7 : s.x, pg ? pg.z + 3 : s.z, 2.5, 0.9);
  },
  // kids run over to pet animals they see
  kidPets(p, dt, P, dP, greet, reachable) {
    p.kidCool = Math.max(0, (p.kidCool || 0) - dt);
    if (!P || !reachable || P.room) { p.petting = 0; return null; }
    if (!p.petting && p.kidCool <= 0 && dP < 9 && !this.list.some((q) => q !== p && q.petting)) {
      p.petting = 1; p.petT = 10; this.dropSpot(p);
      G.ui.bubble(p, rnd(['Look, a ' + stageName(P.sp).toLowerCase() + '!', 'So cute!', 'Hi, little friend!', 'Can I pet you?']), 2);
    }
    if (!p.petting) return null;
    p.petT -= dt;
    if (p.petT <= 0 || dP > 14) { p.petting = 0; p.kidCool = 45; return null; }
    if (dP > greet + 0.3) { Folk.walkTo(p, dt, P.pos.x, P.pos.z, 2.3); p.goal = null; return NO_POSE; }
    p.speed = damp(p.speed, 0, 8, dt); Folk.face(p, dt, P.pos.x, P.pos.z);
    if (p.petting === 1) { p.petting = 2; G.ui.hearts(P.pos, 3); if (G.sound) G.sound.call(P); P.happy = 1; }
    return { crouch: 1, reach: 0.9 };
  },
  /* ---- grown-up jobs ---- */
  work(p, dt, P, dP, greet, reachable) {
    const w = G.world;
    switch (p.role) {
      case 'farmer': return this.farmer(p, dt);
      case 'fisher': return this.fisher(p, dt);
      case 'officer': return this.officer(p, dt, P, dP, greet, reachable);
      case 'scout': return this.scout(p, dt, P, dP, greet, reachable);
      case 'helper': {
        const h = w.fair && w.fair.helper; if (!h) return NO_POSE;
        if (this.go(p, dt, h.x, h.z, 1.3)) {
          p.speed = 0;
          if (P && !P.room && Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) < 7) Folk.face(p, dt, P.pos.x, P.pos.z);
          else Folk.face(p, dt, h.x + Math.sin(h.yaw) * 3, h.z + Math.cos(h.yaw) * 3);
          p.talkT = (p.talkT === undefined ? 20 : p.talkT) - dt;
          if (p.talkT <= 0) { p.talkT = 25 + Math.random() * 20; if (P && !P.room && dP < 14) G.ui.bubble(p, rnd(['Every animal here needs a home!', 'Come meet the animals!', 'Adoption fair today!']), 2.4); }
        }
        return NO_POSE;
      }
    }
    return NO_POSE;
  },
  // a spot just outside a pen's gate, and one just inside it
  penSpots(E, side) {
    const o = { e: [1, 0], w: [-1, 0], n: [0, 1], s: [0, -1] }[side] || [0, 1];
    const ext = o[0] ? E.hw : E.hd;
    const [ox, oz] = G.world.toWorld(E.x, E.z, E.rot || 0, o[0] * (ext + 1.3), o[1] * (ext + 1.3));
    const [ix, iz] = G.world.toWorld(E.x, E.z, E.rot || 0, o[0] * Math.max(0.3, ext - 1.2), o[1] * Math.max(0.3, ext - 1.2));
    return { out: { x: ox, z: oz }, in: { x: ix, z: iz } };
  },
  // the farmer picks carrots, feeds his animals, and empties his traps
  farmer(p, dt) {
    const w = G.world, t = w.def.town, Gd = t.garden;
    if (!p.task || p.task.t <= 0) {
      const caught = w.traps.find((q) => !q.own && !q.set && q.caught !== Player.b);
      if (caught) { const away = Math.atan2(caught.x - Gd.x, caught.z - Gd.z); p.task = { kind: 'trap', trap: caught, x: caught.x + Math.sin(away) * 1.1, z: caught.z + Math.cos(away) * 1.1 }; }
      else if (Math.random() < 0.45) { const [x, z] = w.toWorld(Gd.x, Gd.z, Gd.rot, (Math.random() - 0.5) * Gd.w * 0.7, (Math.random() - 0.5) * Gd.d * 0.7); p.task = { kind: 'pick', x, z }; }
      else { const k = rnd(Object.keys(t.pens)), [E, side] = t.pens[k], sp = this.penSpots(E, side); p.task = { kind: 'feed', pen: E, x: sp.out.x, z: sp.out.z, inside: sp.in }; }
      p.task.t = 150; p.task.work = 0;
    }
    const k = p.task; k.t -= dt;
    if (!this.go(p, dt, k.x, k.z, 1.3)) return NO_POSE;
    p.speed = 0; k.work += dt;
    if (k.kind === 'trap') {
      Folk.face(p, dt, k.trap.cx, k.trap.cz);
      if (k.work > 2.5) { this.emptyTrap(k.trap, p); p.task = null; }
      return { crouch: 1, reach: 0.9 };
    }
    if (k.kind === 'feed') {
      Folk.face(p, dt, k.pen.x, k.pen.z);
      if (!k.called) {
        k.called = true;
        for (const b of Wild.list) if (b.pen === k.pen && b.state !== 'kid') { b.state = 'wander'; b.target = { x: k.inside.x + (Math.random() - 0.5) * 1.2, z: k.inside.z + (Math.random() - 0.5) * 1.2 }; b.pace = 1; b.stuck = 0; b.timer = 2; }
        if (Math.random() < 0.4 && Player.b && !Player.b.room && Math.hypot(Player.pos.x - p.pos.x, Player.pos.z - p.pos.z) < 18) G.ui.bubble(p, rnd(['Breakfast time!', 'Carrots for everyone!', 'Here you go!']), 2);
      }
      if (k.work > 6) p.task = null;
      return { crouch: 0.4, reach: 1 };
    }
    if (k.work > 6) p.task = null;
    return { crouch: 1, reach: 0.5 + 0.4 * Math.sin(G.t * 2.5) };
  },
  // the fisher checks the fish traps in the pond and the lake
  fisher(p, dt) {
    const w = G.world, ft = w.fishTraps.filter((q) => !q.own);
    if (!ft.length) return this.wanderIn(p, dt, w.def.town.pond.x, w.def.town.pond.z, 25, 1);
    if (!p.task || p.task.t <= 0) {
      const tr = ft.slice().sort((a, b) => b.fish - a.fish + (Math.random() - 0.5) * 2)[0];
      let best = null;
      for (let a = 0; a < 20; a++) {
        const ca = Math.cos(a / 20 * TAU), sa = Math.sin(a / 20 * TAU);
        for (let r = 1; r < 40; r += 0.7) { const x = tr.x + ca * r, z = tr.z + sa * r; if (w.H(x, z) > WATER + 0.25) { if (this.freeAt(x, z, 0.35) && (!best || r < best.r)) best = { x, z, r }; break; } }
      }
      if (!best) return NO_POSE;
      p.task = { x: best.x, z: best.z, trap: tr, t: 90, work: 0 };
    }
    const k = p.task; k.t -= dt;
    if (!this.go(p, dt, k.x, k.z, 1.2)) return NO_POSE;
    p.speed = 0; Folk.face(p, dt, k.trap.x, k.trap.z); k.work += dt;
    if (k.work > 4 && k.trap.fish > 0) {
      const n = k.trap.fish; this.setFish(k.trap, 0);
      if (Player.b && !Player.b.room && Math.hypot(Player.pos.x - p.pos.x, Player.pos.z - p.pos.z) < 20) G.ui.bubble(p, n > 1 ? `${n} fish in my trap today!` : 'One fish! Nice.', 2.2);
    }
    if (k.work > 12) p.task = null;
    return { crouch: 0.9, reach: 0.5 + 0.4 * Math.sin(G.t * 1.4) };
  },
  setFish(tr, n) {
    tr.fish = n;
    const want = Math.min(n, tr.slots.length);
    while (tr.fishObjs.length > want) tr.obj.remove(tr.fishObjs.pop());
    while (tr.fishObjs.length < want) { const s = tr.slots[tr.fishObjs.length], f = Env.food('fish'); f.scale.multiplyScalar(0.7); f.position.set(s.x, s.y, s.z); f.rotation.y = s.yaw || 0; tr.obj.add(f); tr.fishObjs.push(f); }
  },
  /* ---- animal control: catches loose animals in town and takes them to the pound ---- */
  inTown(x, z) { const t = G.world.def.town, V = t.village, F = t.fair; return (Math.abs(x - V.x) < V.hw - 2 && Math.abs(z - V.z) < V.hd) || (!!F && Math.abs(x - F.x) < F.hw + 3 && Math.abs(z - F.z) < F.hd + 3); },
  catchable(P) {
    if (!P || P.room || BIG[P.sp] || P.m.height > 1.15 || P.mode === 'fly' || P.mode === 'climb' || P.mode === 'perch' || P.mode === 'swim') return false;
    if (this.fade || this.trapped || R.doorSeq || !this.inTown(P.pos.x, P.pos.z)) return false;
    if (this.inFairPen(P.pos)) return false;
    // safe with your person, or in your own yard
    if (Folk.list.some((q) => q.friend && q.owns === P.sp && !q.away && Math.hypot(q.pos.x - P.pos.x, q.pos.z - P.pos.z) < 9)) return false;
    const home = Homes.homeOf(P.sp);
    if (home && (Math.hypot(home.door.x - P.pos.x, home.door.z - P.pos.z) < 11 || (home.pen && Math.hypot(home.pen.x - P.pos.x, home.pen.z - P.pos.z) < 6))) return false;
    return true;
  },
  officer(p, dt, P, dP, greet, reachable) {
    const w = G.world;
    p.catchCool = Math.max(0, (p.catchCool || 0) - dt);
    // a loose wild animal in town
    if (!p.chase && !p.wildT && p.catchCool <= 0) {
      const wb = Wild.list.find((b) => !b.pen && !b.caged && !b.parent && b.state !== 'trapped' && !BIG[b.sp] && b.mode === 'ground' && this.inTown(b.pos.x, b.pos.z) && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 16);
      if (wb) { p.wildT = wb; p.chaseT = 14; p.goal = null; }
    }
    if (p.wildT) {
      const b = p.wildT;
      if (!Wild.list.includes(b) || p.chaseT <= 0 || !this.inTown(b.pos.x, b.pos.z)) { p.wildT = null; p.catchCool = 20; return NO_POSE; }
      p.chaseT -= dt;
      if (Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) > 0.9 + b.m.radius) { Folk.walkTo(p, dt, b.pos.x, b.pos.z, 2.3); p.goal = null; return { crouch: 0, reach: 0.4 }; }
      this.takeWild(b, `Gotcha, ${SPECIES[b.sp].name.toLowerCase()}! Off to the pound.`, p);
      p.wildT = null; p.catchCool = 25;
      return { crouch: 1, reach: 1 };
    }
    // the player's animal, loose in town without its person
    const can = reachable && this.catchable(P);
    if (p.chase) {
      p.chaseT -= dt;
      if (!can || dP > 18 || p.chaseT <= 0) { p.chase = false; p.catchCool = 120; if (dP < 25) G.ui.bubble(p, 'Too fast for me!', 1.8); return NO_POSE; }
      if (dP > greet + 0.2) { Folk.walkTo(p, dt, P.pos.x, P.pos.z, 2.6); p.goal = null; return { crouch: 0.2, reach: 0.5 }; }
      p.chase = false; p.catchCool = 150;
      G.ui.bubble(p, 'Gotcha! Off to the pound.', 2.2);
      this.toPound('caught');
      return { crouch: 1, reach: 1 };
    }
    if (can && p.catchCool <= 0 && dP < 11 && G.night < 0.5) {
      p.seeT = (p.seeT || 0) + dt;
      if (p.seeT > 1.2) {
        p.seeT = 0;
        if (Math.random() < 0.6) {
          p.chase = true; p.chaseT = 15; p.goal = null; G.ui.bubble(p, 'Hey, a loose ' + stageName(P.sp).toLowerCase() + '!', 2);
          if (!this.toldCatch) { this.toldCatch = true; G.ui.toast('Animal control! Run away, or you go to the animal pound.', 4000); }
          return NO_POSE;
        }
        p.catchCool = 60;
      }
    }
    // walking the beat: Maple Street, the fair, the school path
    if (!p.beat || p.beat.t <= 0) {
      const t = w.def.town, pts = (w.def.villageWalk || []).concat([[t.fair.x - t.fair.hw - 3, t.fair.z], t.schoolRoute[0]]);
      const q = rnd(pts); p.beat = { x: q[0] + (Math.random() - 0.5) * 3, z: q[1] + (Math.random() - 0.5) * 3, t: 40, wait: 3 + Math.random() * 5 };
    }
    p.beat.t -= dt;
    if (this.go(p, dt, p.beat.x, p.beat.z, 1.25)) { p.beat.wait -= dt; if (p.beat.wait <= 0) p.beat.t = 0; }
    return NO_POSE;
  },
  // a wild animal is taken away; it goes to the pound, and another one turns up in the woods later
  takeWild(b, say, by) {
    this.poundList.unshift(b.sp); this.poundList.length = Math.min(this.poundList.length, 4);
    if (!b.amb && !b.pen && b.home) this.respawn.push({ sp: b.sp, home: b.home, range: b.range, water: b.water, t: 150 + Math.random() * 90 });
    Wild.remove(b);
    if (by && say) G.ui.bubble(by, say, 2.4);
  },
  /* ---- scouts look for animals without homes and bring them to the adoption fair ---- */
  scout(p, dt, P, dP, greet, reachable) {
    const w = G.world, t = w.def.town;
    p.scoutCool = Math.max(0, (p.scoutCool || 0) - dt);
    // the player's animal, if it has no home: kneel and hold out a hand
    if (P && reachable && !S.homes[P.sp] && !BIG[P.sp] && w.fair && !this.fade && !this.trapped && !this.inFairPen(P.pos)) {
      p.meetCool = Math.max(0, (p.meetCool || 0) - dt);
      if (p.state !== 'kneel' && dP < 8 && p.meetCool <= 0) { p.state = 'kneel'; p.kneelT = 16; p.goal = null; G.ui.bubble(p, 'Hi there! Do you need a home?', 2.4); }
    }
    if (p.state === 'kneel') {
      p.kneelT -= dt;
      if (!P || !reachable || dP > 14 || p.kneelT <= 0 || S.homes[P.sp]) { p.state = 'job'; p.meetCool = 60; G.ui.bubble(p, 'Bye bye!', 1.6); return NO_POSE; }
      p.speed = damp(p.speed, 0, 8, dt); Folk.face(p, dt, P.pos.x, P.pos.z);
      if (dP < greet + 0.35) { p.state = 'job'; p.meetCool = 90; G.ui.hearts(P.pos, 4); if (G.sound) G.sound.call(P); this.toFair(p); }
      return { crouch: 1, reach: 1 };
    }
    // carrying an animal: off to the fair
    if (p.carry && w.fair) {
      const pen = w.fair.pens.find((q) => !q.animal && !q.player);
      if (!pen) { p.carry = null; return NO_POSE; }
      if (!this.go(p, dt, pen.entry.x, pen.entry.z, 1.4)) return NO_POSE;
      this.penAnimal(pen, p.carry); p.carry = null; p.search = null;
      if (Player.b && !Player.b.room && Math.hypot(Player.pos.x - p.pos.x, Player.pos.z - p.pos.z) < 20) G.ui.bubble(p, 'Someone will give you a home here!', 2.4);
      return { crouch: 1, reach: 1 };
    }
    // a homeless animal nearby
    const near = (b) => !b.pen && !b.caged && !b.parent && !b.hasKids && b.state !== 'trapped' && b.state !== 'follow' && !BIG[b.sp] && b.mode === 'ground' && Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) < 12;
    if (p.target && (!Wild.list.includes(p.target) || !near(p.target))) p.target = null;
    if (!p.target && p.scoutCool <= 0) p.target = Wild.list.find(near) || null;
    if (p.target) {
      const b = p.target;
      if (Math.hypot(b.pos.x - p.pos.x, b.pos.z - p.pos.z) > 1.1 + b.m.radius) { Folk.walkTo(p, dt, b.pos.x, b.pos.z, 1.5); p.goal = null; return NO_POSE; }
      p.carry = b.sp; p.target = null; p.scoutCool = 120;
      this.takeWild(b, null, null);
      this.poundList.shift();
      if (Player.b && !Player.b.room && Math.hypot(Player.pos.x - p.pos.x, Player.pos.z - p.pos.z) < 20) G.ui.bubble(p, 'You need a home. Let\'s go to the adoption fair!', 2.6);
      return { crouch: 1, reach: 1 };
    }
    // look around in the woods and fields
    if (!p.search || p.search.t <= 0) { const q = rnd(t.scoutSpots); p.search = { x: q[0], z: q[1], t: 140, there: 0 }; p.goal = null; }
    p.search.t -= dt;
    if (p.search.there > 0) { p.search.there -= dt; if (p.search.there <= 0) p.search.t = 0; return this.wanderIn(p, dt, p.search.x, p.search.z, 9, 1); }
    if (this.go(p, dt, p.search.x, p.search.z, 1.3)) p.search.there = 20;
    return NO_POSE;
  },
  /* ---- the adoption fair ---- */
  penAnimal(pen, sp) {
    if (!SPECIES[sp]) return;
    const E = { x: pen.x, z: pen.z, hw: pen.hw, hd: pen.hd, rot: pen.rot };
    const b = Wild.make(sp, Math.random() < 0.4 ? 0.3 : 0.9, pen.x, pen.z, { pen: E, home: { x: pen.x, z: pen.z }, range: 0.5, fairPen: pen, state: 'idle', timer: 2 });
    if (Math.max(b.m.length, b.m.height) > 1.2) setBodyAge(b, 0.25);
    pen.animal = b;
    this.penGate(pen, false);
  },
  inPen(pen, pos) { const dx = pos.x - pen.x, dz = pos.z - pen.z, c = Math.cos(pen.rot), s = Math.sin(pen.rot), lx = dx * c - dz * s, lz = dx * s + dz * c; return Math.abs(lx) < pen.hw + 0.1 && Math.abs(lz) < pen.hd + 0.1; },
  inFairPen(pos) { const f = G.world && G.world.fair; return !!f && f.pens.some((q) => this.inPen(q, pos)); },
  playerPen() { const f = G.world && G.world.fair, P = Player.b; return f && P && !P.room ? f.pens.find((q) => this.inPen(q, P.pos)) || null : null; },
  penGate(pen, open) { if (pen.open === open) return; pen.open = open; if (pen.doorCol) pen.doorCol.off = open; G.world.doorTo(pen.obj, undefined, open); },
  letOutFair() { const pen = this.playerPen(); if (!pen) return; pen.player = false; pen.visit = null; pen.cool = 40; this.penGate(pen, true); const h = this.list.find((p) => p.role === 'helper' && !p.away); if (h) G.ui.bubble(h, 'There you go!', 1.8); },
  fairUpdate(dt) {
    const w = G.world, f = w.fair; if (!f) return;
    const tc = this.dayTime(), open = tc >= T_LEAVE + 20 && tc < T_HOME, P = Player.b;
    for (const pen of f.pens) { if (pen.animal && !Wild.list.includes(pen.animal)) pen.animal = null; pen.cool = Math.max(0, (pen.cool || 0) - dt); }
    // new animals arrive at the fair overnight
    if (tc >= 0 && tc < T_LEAVE && this.stockDay !== nightNo()) {
      this.stockDay = nightNo();
      for (const pen of f.pens) if (!pen.animal && !pen.player && f.pens.filter((q) => q.animal).length < 2) this.penAnimal(pen, rnd(FAIR_ANIMALS));
    }
    // a homeless animal that walks into an empty pen waits there to be adopted
    if (P && !P.room && open && !S.homes[P.sp] && !BIG[P.sp]) {
      const pen = f.pens.find((q) => !q.animal && !q.player && q.cool <= 0 && this.inPen(q, P.pos));
      if (pen) { pen.inT = (pen.inT || 0) + dt; if (pen.inT > 1.5) { pen.inT = 0; this.joinFair(pen); } }
    }
    for (const pen of f.pens) {
      if (pen.player && (!P || P.room || S.homes[P.sp] || !this.inPen(pen, P.pos))) { pen.player = false; pen.visit = null; }
      // closing time: nobody else is coming today
      if (pen.player && !open && !pen.visit) { pen.player = false; pen.cool = 60; G.ui.toast('The adoption fair is over for today. Come back tomorrow!', 3600); }
      // pens with someone waiting inside have the gate shut, unless a visitor is there; empty pens stand open
      const shut = !!pen.animal || (pen.player && !pen.visit);
      if (pen.open === shut) this.penGate(pen, !shut);
    }
    // people from the village come to look at the animals
    this.fairT -= dt;
    const goers = Folk.list.filter((p) => p.fairgoer), playerPen = f.pens.find((q) => q.player), animals = f.pens.filter((q) => q.animal);
    const forYou = playerPen && !goers.some((q) => q.pen === playerPen);
    if (open && this.fairT <= 0 && (goers.length < 2 || (forYou && goers.length < 3)) && (playerPen || animals.length)) {
      const pen = forYou ? playerPen : animals.length ? rnd(animals) : null;
      this.fairT = playerPen ? 10 + Math.random() * 6 : 25 + Math.random() * 15;
      if (pen) {
        const cam = G.camera.position;
        let from = w.def.town.fairFrom.map((q) => ({ x: q[0], z: q[1], d: Math.hypot(q[0] - cam.x, q[1] - cam.z) })).sort((a, b) => b.d - a.d)[(Math.random() * 2) | 0];
        if (pen.player) {
          // someone is on the way to meet you: they come from just out of sight
          let best = null;
          for (let k = 0; k < 8; k++) { const q = w.ringPoint(f.x, f.z, 18, 24, false); if (q) { q.d = Math.hypot(q.x - cam.x, q.z - cam.z); if (!best || q.d > best.d) best = q; } }
          if (best) from = best;
        }
        Folk.make(this.freeName(), Folk.randomLook(Math.random() < 0.3), from.x, from.z, { fairgoer: true, state: 'go', pen, from, goal: null });
      }
    }
  },
  joinFair(pen) {
    pen.player = true; pen.visit = null;
    G.ui.toast('You are at the adoption fair! People who want a pet will come and meet you.', 4200);
    this.fairT = Math.min(this.fairT, 4);
  },
  // someone at the fair: walk to a pen, look, maybe take the animal home
  fairgoerStep(p, dt, P, dP, greet, reachable) {
    const pen = p.pen; let crouch = 0, reach = 0;
    if (p.state !== 'leave' && (!pen || (!pen.animal && !pen.player))) { p.state = 'leave'; if (pen && pen.visit === p) pen.visit = null; }
    if (p.state === 'go') {
      if (pen.player && Math.hypot(pen.entry.x - p.pos.x, pen.entry.z - p.pos.z) < 4) pen.visit = p;
      if (this.go(p, dt, pen.entry.x, pen.entry.z, pen.player ? 1.6 : 1.3)) {
        if (pen.player) { p.state = 'kneel'; p.timer = 18; pen.visit = p; G.ui.bubble(p, 'Aww, look at you!', 2.2); }
        else { p.state = 'look'; p.timer = 5 + Math.random() * 4; if (Math.random() < 0.6) G.ui.bubble(p, rnd(['So cute!', 'Hello there!', 'Look at this one!']), 2); }
      }
    } else if (p.state === 'look') {
      p.speed = damp(p.speed, 0, 6, dt); Folk.face(p, dt, pen.x, pen.z); crouch = 1; reach = 0.6; p.timer -= dt;
      if (p.timer <= 0) {
        if (pen.animal && Math.random() < 0.35) { G.ui.bubble(p, 'You\'re coming home with me!', 2.4); G.ui.hearts(pen.animal.pos, 3); Wild.remove(pen.animal); pen.animal = null; }
        else G.ui.bubble(p, 'Maybe next time.', 1.8);
        p.state = 'leave';
      }
    } else if (p.state === 'kneel') {
      p.speed = damp(p.speed, 0, 8, dt); Folk.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 1; p.timer -= dt;
      if (P && reachable && dP < greet + 0.35) { p.state = 'greet'; p.timer = 2.8; G.ui.hearts(P.pos, 3); if (G.sound) G.sound.call(P); }
      else if (p.timer <= 0) { p.state = 'leave'; pen.visit = null; G.ui.bubble(p, 'Maybe next time.', 1.8); }
    } else if (p.state === 'greet') {
      p.speed = 0; Folk.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 0.8; p.timer -= dt;
      if (p.timer > 1.3 && p.timer - dt <= 1.3) G.ui.hearts(P.pos, 3);
      if (dP > greet + 3) { p.state = 'leave'; pen.visit = null; }
      else if (p.timer <= 0) {
        pen.player = false; pen.visit = null; pen.cool = 30; p.fairgoer = false;
        Homes.adopt(p);
        const hm = S.homes[P.sp]; p.house = hm ? Homes.village()[hm.house] || null : null;
      }
    } else if (p.state === 'leave') {
      const cam = G.camera.position, far = Math.hypot(p.pos.x - cam.x, p.pos.z - cam.z) > 55;
      if (this.go(p, dt, p.from.x, p.from.z, 1.3) || (far && (!pen || Math.hypot(p.pos.x - pen.x, p.pos.z - pen.z) > 20))) { Folk.remove(p); return; }
    }
    Folk.pose(p, dt, crouch, reach, G.camera.position);
  },
  /* ---- traps ---- */
  // inside the open end of a box trap
  trapZone(t, pos, r) {
    const dx = pos.x - t.cx, dz = pos.z - t.cz, c = Math.cos(t.yaw), s = Math.sin(t.yaw), lx = dx * c - dz * s, lz = dx * s + dz * c;
    if (t.ez === undefined) { const ex = t.entry.x - t.cx, ez = t.entry.z - t.cz; t.ez = Math.sign(ex * s + ez * c) || 1; }
    const along = lz * t.ez;
    return Math.abs(lx) < t.hw + 0.12 && along > -t.hd && along < t.hd + r * 0.9;
  },
  trapsUpdate(dt) {
    const w = G.world, P = Player.b;
    for (const t of w.traps) {
      if (!t.set) continue;
      if (P && !this.trapped && !P.room && P.mode === 'ground' && P.m.length < 1.05 && P.m.height < 0.5 && !R.doorSeq && !this.fade && Math.abs(P.pos.x - t.cx) < 2 && Math.abs(P.pos.z - t.cz) < 2 && this.trapZone(t, P.pos, P.m.radius)) { this.spring(t, P); continue; }
      for (const b of Wild.list) if (b.mode === 'ground' && !b.pen && !b.caged && !b.parent && b.state !== 'trapped' && b.m.length < 1.05 && Math.abs(b.pos.x - t.cx) < 1.6 && Math.abs(b.pos.z - t.cz) < 1.6 && this.trapZone(t, b.pos, b.m.radius)) { this.spring(t, b); break; }
    }
    // stuck in a trap: the farmer comes and takes you to the pound
    const t = this.trapped;
    if (t) {
      if (!P || P !== t.caught || P.room || Math.hypot(P.pos.x - t.cx, P.pos.z - t.cz) > 2.5) { this.trapped = null; this.emptyTrap(t, null); }
      else {
        P.pos.x = t.cx; P.pos.z = t.cz; P.speed = 0;
        this.trapT -= dt;
        if (this.trapT <= 0 && !this.fade) { this.trapped = null; this.emptyTrap(t, null); this.toPound('trap'); }
      }
    }
    // fish slowly swim into the fish traps
    this.fishT -= dt;
    if (this.fishT <= 0) { this.fishT = 30; for (const ft of w.fishTraps) if (ft.fish < ft.slots.length && Math.random() < 0.5) this.setFish(ft, ft.fish + 1); }
  },
  spring(t, b) {
    const w = G.world;
    t.set = false; t.caught = b;
    w.doorTo(t.obj, undefined, false, 9);
    for (const c of t.cols) c.off = true;
    if (t.doorCol) t.doorCol.off = true;
    const cam = G.camera.position;
    if (G.sound && G.sound.snap && Math.hypot(t.x - cam.x, t.z - cam.z) < 30) G.sound.snap();
    if (b === Player.b) {
      this.trapped = t; this.trapT = 5;
      b.speed = 0; b.eat = 0;
      G.ui.toast('Snap! You walked into a trap. The farmer will find you!', 4200);
    } else {
      b.state = 'trapped'; b.trap = t; b.speed = 0; b.eat = 0;
      b.pos.set(t.cx, w.H(t.cx, t.cz), t.cz); b.yaw = t.yaw + (t.ez > 0 ? Math.PI : 0);
    }
  },
  emptyTrap(trap, by) {
    const b = trap.caught;
    if (b && b !== Player.b && Wild.list.includes(b)) this.takeWild(b, by ? `Gotcha, ${SPECIES[b.sp].name.toLowerCase()}! No more carrots for you.` : null, by);
    trap.caught = null; trap.set = true;
    G.world.doorTo(trap.obj, undefined, true, 2.2);
    for (const c of trap.cols) c.off = false;
    if (trap.doorCol) trap.doorCol.off = true;
  },
  // pests sneak up to the garden for carrots, and sometimes go for the bait in a trap
  raidTarget(b) {
    const w = G.world;
    if (!this.on || !PESTS[b.sp] || b.pen || b.caged || b.parent || b.fairPen) return null;
    const traps = w.traps.filter((t) => t.set && Math.hypot(t.x - b.pos.x, t.z - b.pos.z) < 40);
    if (traps.length && Math.random() < 0.4) {
      const t = rnd(traps); this.trapZone(t, t.entry, 0);
      // walk up to the open end, then in after the bait
      const ox = t.entry.x - t.cx, oz = t.entry.z - t.cz, L = Math.hypot(ox, oz) || 1;
      return { x: t.cx + ox / L * (t.hd + 0.9), z: t.cz + oz / L * (t.hd + 0.9), trap: t, stage: 0 };
    }
    const spots = w.spots.carrot.filter((s) => !s.own && Math.hypot(s.x - b.pos.x, s.z - b.pos.z) < 40);
    if (!spots.length) return null;
    const s = rnd(spots);
    return { x: s.x, z: s.z };
  },
  // a pest is nibbling carrots: the farmer shoos it away if he's close
  nibble(b) {
    const f = this.list.find((p) => p.role === 'farmer' && !p.away && !p.room && Math.hypot(p.pos.x - b.pos.x, p.pos.z - b.pos.z) < 18);
    if (f && !f.bub) { G.ui.bubble(f, 'Hey! Those are my carrots!', 2.2); b.state = 'flee'; b.timer = 2.5; b.fleeA = Math.atan2(b.pos.x - f.pos.x, b.pos.z - f.pos.z); }
  },
  /* ---- the pound ---- */
  // a quick fade to black and back, with something happening in the dark
  fadeTo(fn) {
    if (this.fade) return;
    this.fade = { t: 0, fn, done: false };
    $('fade').classList.add('quick', 'on');
  },
  fadeUpdate(dt) {
    const f = this.fade; if (!f) return;
    f.t += dt;
    if (!f.done && f.t > 0.4) { f.done = true; f.fn(); Cam.snap = true; }
    if (f.t > 0.6) $('fade').classList.remove('on');
    if (f.t > 0.95) { $('fade').classList.remove('quick'); this.fade = null; }
  },
  toPound(why) {
    const w = G.world, pound = w.houses.find((h) => h.pound);
    if (!pound || !Player.b) return;
    for (const p of Folk.list) Folk.cancel(p);
    this.fadeTo(() => {
      const P = Player.b;
      if (P.room) Homes.exit();
      P.mode = 'ground'; P.tree = null; P.eat = 0;
      Homes.enter(pound);
      const rm = P.room, pen = rm && rm.pens && rm.pens[0];
      if (pen) { P.pos.set(pen.x, 0, pen.z); P.yaw = Math.PI; Homes.kennelDoor(pen, false); Homes.kennel = pen; Homes.shutT = 0; }
      const collar = !!S.homes[P.sp];
      G.ui.toast(why === 'trap' ? 'The farmer took you out of his trap and brought you to the animal pound.' : 'Animal control caught you and brought you to the animal pound!', 4200);
      this.call = collar ? { t: 4.5, stage: 0, pen } : null;
      if (!collar) setTimeout(() => { if (Player.b && Player.b.room && Player.b.room.pound) G.ui.toast('No collar, so there is no one to call. Wait here and someone may adopt you!', 4200); }, 4600);
      G.save();
    });
  },
  // the pound reads your collar, phones your person, and they come to get you
  callUpdate(dt) {
    const c = this.call, P = Player.b; if (!c) return;
    if (!P || !P.room || !P.room.pound || !S.homes[P.sp]) { this.call = null; return; }
    c.t -= dt;
    if (c.stage === 0 && c.t <= 0) {
      const pat = Folk.list.find((p) => p.staff && !p.vetDoc);
      if (pat) G.ui.bubble(pat, 'This one has a collar! I\'ll call the number on it.', 3.2);
      if (G.sound && G.sound.ring) G.sound.ring();
      c.stage = 1; c.t = 7;
    } else if (c.stage === 1 && c.t <= 0) {
      const hm = S.homes[P.sp], rm = P.room;
      const pat = Folk.list.find((p) => p.staff && !p.vetDoc);
      if (pat) G.ui.bubble(pat, `${hm.name} is here for you!`, 2.4);
      const v = Folk.make(hm.name, hm.look, rm.exit.x, rm.exit.z, { visitor: true, room: rm, state: 'approach', pen: c.pen, ownerCome: true, owns: P.sp });
      setTimeout(() => { if (Folk.list.includes(v) && v.state !== 'greet') G.ui.bubble(v, `${nameOf(P.sp)}! There you are!`, 2.6); }, 2600);
      c.stage = 2;
    }
  },
  // your person takes you home from the pound
  goHomeWith(p) {
    const P = Player.b, sp = P.sp, name = p.name;
    this.call = null;
    this.fadeTo(() => {
      if (P.room) Homes.exit();
      const house = Homes.homeOf(sp);
      if (!house) return;
      if (SPECIES[sp].outdoor) Player.place(house.pen.x, house.pen.z); else Homes.enter(house);
      G.ui.toast(`${name} came to the pound and took you home!`, 3800);
      G.ui.hearts(P.pos, 4);
      const real = Folk.ownerOf(sp);
      if (real) {
        real.friend = true; real.state = 'friend'; real.away = false; real.rig.setVisible(true);
        if (P.room) Folk.teleport(real, P.room.spawn.x + 0.9, P.room.spawn.z - 0.6, P.room); else Folk.teleport(real, P.pos.x + 1.5, P.pos.z + 1);
      }
    });
  },
  // a scout takes you to the adoption fair
  toFair(scout) {
    const f = G.world.fair; if (!f) return;
    const pen = f.pens.find((q) => !q.animal && !q.player) || f.pens[0];
    for (const p of Folk.list) Folk.cancel(p);
    this.fadeTo(() => {
      const P = Player.b;
      if (pen.animal) { Wild.remove(pen.animal); pen.animal = null; }
      if (P.room) Homes.exit();
      Player.place(pen.x, pen.z); P.yaw = pen.rot + Math.PI / 2;
      Folk.teleport(scout, pen.entry.x + 1.4, pen.entry.z + 1); scout.target = null; scout.goal = null;
      this.joinFair(pen);
      this.penGate(pen, false);
      G.ui.bubble(scout, 'Here you go. Someone will love you!', 2.6);
    });
  },
  // collars for pets that have a home, in their person's favorite color
  collar(b) { if (!b || !b.rig.setCollar) return; const hm = S.homes[b.sp]; b.rig.setCollar(hm ? hexNum(hm.look && hm.look.shirt) : null); },
  // input is held while you're stuck in a trap or something is happening in the dark
  busy() { return !!(this.trapped || this.fade); },
  update(dt) {
    this.navN = 0;
    if (!this.on || !G.world || !Player.b) return;
    Nav.work(3);
    const tc = this.dayTime();
    // the school bell: in the morning, after recess and at the end of the day
    if (G.world.school) for (const [k, at] of [['in', T_BELL], ['recess', T_RECESS], ['back', T_CLASS2], ['out', T_OUT]]) {
      if (tc >= at && tc < at + 3 && this.bells[k] !== nightNo()) {
        this.bells[k] = nightNo();
        const P = Player.b, s = G.world.school, d = P.room ? (P.room.school ? 5 : 999) : Math.hypot(P.pos.x - s.x, P.pos.z - s.z);
        if (d < 140 && G.sound && G.sound.bell) G.sound.bell(d);
      }
    }
    this.trapsUpdate(dt);
    this.fairUpdate(dt);
    this.callUpdate(dt);
    this.fadeUpdate(dt);
    // animals that were taken away come back to the woods after a while
    for (let i = this.respawn.length - 1; i >= 0; i--) {
      const r = this.respawn[i]; r.t -= dt;
      if (r.t > 0) continue;
      const P = Player.b, pt = G.world.ringPoint(r.home.x, r.home.z, 0, r.range || 20, false);
      if (pt && (!P || Math.hypot(pt.x - P.pos.x, pt.z - P.pos.z) > 35)) { Wild.make(r.sp, 1, pt.x, pt.z, { home: r.home, range: r.range, water: r.water }); this.respawn.splice(i, 1); }
      else r.t = 20;
    }
    // swings and the seesaw move when kids are on them
    const pg = G.world.playground;
    if (pg) {
      if (!pg.linked) {
        // which swing each swing spot belongs to
        pg.linked = true;
        for (const q of pg.spots) if (q.kind === 'swing') {
          let best = null, bd = 1e9;
          for (const s of pg.swings) { if (!s.pivot) continue; const [x, z] = G.world.toWorld(pg.x, pg.z, pg.rot, s.pivot.x, s.pivot.z), d = Math.hypot(x - q.x, z - q.z); if (d < bd) { bd = d; best = s; } }
          q.swing = best; if (best) best.phase = Math.random() * TAU;
        }
      }
      for (const s of pg.swings) if (s.obj) { const on = pg.spots.some((q) => q.kind === 'swing' && q.busy && q.swing === s && Math.hypot(q.busy.pos.x - q.x, q.busy.pos.z - q.z) < 1.2); s.ang = on ? Math.sin(G.t * 2.2 + (s.phase || 0)) * 0.5 : damp(s.ang || 0, 0, 2, dt); s.obj.rotation.x = s.ang; }
      if (pg.seesaw && pg.seesaw.obj) { const on = pg.spots.some((q) => q.kind === 'seesaw' && q.busy); pg.seesaw.obj.rotation.z = on ? Math.sin(G.t * 1.6) * 0.18 : damp(pg.seesaw.obj.rotation.z, 0, 2, dt); }
    }
  },
};
