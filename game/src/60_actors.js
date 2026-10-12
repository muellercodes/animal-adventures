/* ---------- actors: movement, the player's animal, wildlife, people, food ---------- */
const G = { scene: null, world: null, camera: null, t: 0, night: 0, ui: null };
const V3 = THREE.Vector3;
const tmpV = new V3();
const LIM = World.HALF - 4;
const canEat = (sp, type) => SPECIES[sp].eats.includes(type);
const UPRIGHT = { duck: 1, swan: 1, chicken: 1, owl: 1, parrot: 1 };
const FEAR = { chicken: 3, duck: 4.5, swan: 3, frog: 2.5, lizard: 3, snake: 2, bunny: 5, squirrel: 4.5, turtle: 1.5, fox: 6, owl: 5, deer: 10, parrot: 4, moose: 0 };
const NOCTURNAL = { owl: 1, frog: 1, fox: 1 };

function newBody(sp) {
  const rig = Animals.build(sp);
  rig.root.rotation.order = 'YXZ';
  return { sp, rig, pos: new V3(), yaw: 0, speed: 0, vy: 0, mode: 'ground', hopCd: 0, hopping: false, eat: 0, idle: 0, turn: 0, pitch: 0, bob: Math.random() * 9, blocked: false,
    st: { t: 0, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0 } };
}
function jumpV(b) { const h = b.sp === 'frog' ? 0.45 : clamp(b.rig.height * 0.9, 0.3, 1.3); return Math.sqrt(2 * GRAV * h); }

// Shared movement for the player and wildlife.
// c = { dx, dz: wanted direction (any length, 0 = none), want: wanted speed m/s, face: optional yaw to turn to, jump, up, down, takeoff }
function moveBody(b, dt, c) {
  const w = G.world, H = w.H, sp = SPECIES[b.sp], rig = b.rig, p = b.pos, fly = !!sp.fly, swim = !!sp.swim;
  let want = c.want || 0, yawRate = 0;
  const tgt = c.face !== undefined ? c.face : (c.dx || c.dz) ? Math.atan2(c.dx, c.dz) : null;
  if (tgt !== null) {
    const diff = angDiff(b.yaw, tgt);
    const tr = b.mode === 'fly' ? 2.6 : rig.length < 0.7 ? 10 : rig.length < 1.5 ? 7 : 4;
    const step = clamp(diff, -tr * dt, tr * dt);
    b.yaw += step; yawRate = dt > 0 ? step / dt : 0;
    if (b.mode !== 'fly' && b.mode !== 'air') want *= Math.pow(clamp(Math.cos(diff) * 1.3, 0, 1), 1.5);
  }
  b.turn = damp(b.turn, yawRate, 8, dt);
  const acc = b.mode === 'fly' ? 1.8 : b.mode === 'swim' ? 2.6 : b.mode === 'air' ? 0.5 : want > b.speed ? 5 : 8;
  b.speed = damp(b.speed, want, acc, dt);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  let nx = clamp(p.x + fx * b.speed * dt, -LIM, LIM), nz = clamp(p.z + fz * b.speed * dt, -LIM, LIM);
  b.blocked = false;
  if (!swim && !(fly && (b.mode === 'fly' || b.mode === 'air'))) {
    const lim = w.def.water ? WATER - Math.max(0.05, rig.height * 0.45) : -100;
    if (H(nx, nz) < lim) {
      b.blocked = true;
      if (H(nx, p.z) >= lim) nz = p.z; else if (H(p.x, nz) >= lim) nx = p.x; else { nx = p.x; nz = p.z; b.speed *= 0.5; }
    }
  }
  if (b.mode !== 'fly' || p.y - H(nx, nz) < 6) {
    tmpV.set(nx, 0, nz);
    if (w.collide(tmpV, rig.radius * 0.8)) b.blocked = true;
    nx = tmpV.x; nz = tmpV.z;
  }
  p.x = nx; p.z = nz;

  const h = H(p.x, p.z), sY = WATER - rig.floatDepth, hasGround = h > -100;
  const deep = swim && hasGround && h < sY - 0.02, overWater = hasGround && h < WATER && !!w.def.water;
  if (c.jump && b.eat <= 0) {
    if ((b.mode === 'ground' || b.mode === 'swim') && !sp.noJump) { b.vy = jumpV(b); b.mode = 'air'; b.hopping = false; }
    else if (b.mode === 'air' && fly) { b.mode = 'fly'; b.vy = 3; }
  }
  if (c.takeoff && fly && b.mode !== 'fly') { b.mode = 'fly'; b.vy = 3.5; }
  switch (b.mode) {
    case 'ground':
      if (deep) b.mode = 'swim';
      else if (!hasGround) { b.mode = fly ? 'fly' : 'air'; b.vy = 0; }
      else {
        p.y = h;
        if (sp.hop && b.speed > 0.3 && b.eat <= 0) {
          b.hopCd -= dt;
          if (b.hopCd <= 0) { b.vy = sp.hopV * (0.62 + 0.38 * clamp(b.speed / (rig.runSpeed * 0.9), 0, 1)); b.mode = 'air'; b.hopping = true; }
        }
      }
      break;
    case 'swim':
      if (!deep) { b.mode = 'ground'; p.y = Math.max(h, WATER - 0.6); }
      else { b.bob += dt; p.y = sY + Math.sin(b.bob * 2.1) * 0.008 * (1 + rig.height); }
      break;
    case 'air': {
      b.vy -= GRAV * dt; p.y += b.vy * dt;
      if (fly && !swim && overWater && p.y < WATER + 0.3 && b.vy < 0) { b.mode = 'fly'; b.vy = 0.5; break; }
      const floor = !hasGround ? -1e9 : deep ? sY : h;
      if (p.y <= floor && b.vy <= 0) {
        p.y = floor; b.vy = 0; b.mode = deep ? 'swim' : 'ground';
        if (b.hopping) b.hopCd = b.speed > rig.walkSpeed * 1.3 ? 0.03 : 0.2;
        b.hopping = false;
      }
      break;
    }
    case 'fly': {
      const tv = c.up ? 3.4 : c.down ? -4.5 : want > 0.5 ? -0.45 : -1.3;
      b.vy = damp(b.vy, tv, 3, dt); p.y += b.vy * dt;
      const ceil = hasGround ? Math.max(h, WATER) + 40 : 34;
      if (p.y > ceil) { p.y = ceil; if (b.vy > 0) b.vy = 0; }
      if (hasGround) {
        if (!swim && overWater) { if (p.y < WATER + 0.25) { p.y = WATER + 0.25; if (b.vy < 0) b.vy = 0; } }
        else { const floor = deep ? sY : h; if (p.y <= floor) { p.y = floor; b.vy = 0; b.mode = deep ? 'swim' : 'ground'; } }
      }
      break;
    }
  }
  b.idle = b.speed < 0.06 && (b.mode === 'ground' || b.mode === 'swim') ? b.idle + dt : 0;
}

function poseBody(b, dt, animate) {
  const r = b.rig.root, rig = b.rig;
  r.position.copy(b.pos); r.rotation.y = b.yaw;
  let pt = 0;
  if (b.mode === 'fly' && b.sp !== 'owl') pt = -clamp(b.vy * 0.08, -0.3, 0.3);
  else if (b.mode === 'ground' && !UPRIGHT[b.sp]) {
    const d = Math.max(0.12, rig.length * 0.35), fx = Math.sin(b.yaw) * d, fz = Math.cos(b.yaw) * d, H = G.world.H;
    pt = -clamp(Math.atan2(H(b.pos.x + fx, b.pos.z + fz) - H(b.pos.x - fx, b.pos.z - fz), 2 * d), -0.4, 0.4);
  }
  b.pitch = damp(b.pitch, pt, 6, dt); r.rotation.x = b.pitch;
  if (!animate) return;
  const st = b.st; st.t = G.t; st.speed = b.speed; st.mode = b.mode; st.vy = b.vy; st.eat = b.eat; st.turn = b.turn; st.idle = b.idle;
  rig.update(dt, st);
}

/* ---------- the player's animal ---------- */
const Player = {
  b: null, eatFood: null, ate: false, eatDur: 1.1, cool: 0, eatQueue: 0,
  get sp() { return this.b && this.b.sp; },
  get pos() { return this.b.pos; },
  get rig() { return this.b.rig; },
  set(sp) {
    let keep = null;
    if (this.b) { keep = { x: this.b.pos.x, z: this.b.pos.z, yaw: this.b.yaw }; G.scene.remove(this.b.rig.root); }
    this.b = newBody(sp);
    G.scene.add(this.b.rig.root);
    if (keep) { this.b.yaw = keep.yaw; this.place(keep.x, keep.z); }
    this.eatFood = null;
  },
  place(x, z) {
    const w = G.world, b = this.b, sp = SPECIES[b.sp];
    let h = w.H(x, z);
    const okSpot = (hh) => hh > -100 && (sp.swim || !w.def.water || hh > WATER - 0.02);
    if (!okSpot(h)) {
      let best = null;
      for (let r = 2; r < 80 && !best; r += 3) best = w.ringPoint(x, z, r, r + 3, false);
      if (!best) { x = w.def.spawn[0]; z = w.def.spawn[1]; } else { x = best.x; z = best.z; }
      h = w.H(x, z);
    }
    b.pos.set(x, h, z); b.vy = 0; b.speed = 0;
    b.mode = sp.swim && h < WATER - b.rig.floatDepth ? 'swim' : 'ground';
    if (b.mode === 'swim') b.pos.y = WATER - b.rig.floatDepth;
    poseBody(b, 0.016, true);
  },
  update(dt, inp) {
    const b = this.b, sp = SPECIES[b.sp];
    const mag = Math.min(1, Math.hypot(inp.mx, inp.mz));
    const rig = b.rig, walkS = rig.walkSpeed, runS = Math.max(rig.runSpeed * 0.9, walkS * 1.6);
    let want;
    if (b.mode === 'fly') want = sp.flySpeed * mag;
    else if (b.mode === 'swim') want = (sp.swimSpeed || 1.5) * mag;
    else if (b.mode === 'air') want = b.speed;
    else { want = mag <= 0.6 ? walkS * (mag / 0.6) : lerp(walkS, runS, (mag - 0.6) / 0.4); if (inp.walk) want = Math.min(want, walkS); }
    const c = { dx: inp.mx, dz: inp.mz, want, jump: inp.jump, up: inp.up, down: inp.down };
    // eating: stop, turn to the food, lower the head
    if (b.eat > 0) {
      c.want = 0; c.dx = 0; c.dz = 0;
      if (this.eatFood && !this.eatFood.gone) c.face = Math.atan2(this.eatFood.x - b.pos.x, this.eatFood.z - b.pos.z);
      b.eat += dt / this.eatDur;
      if (this.eatFood && !this.ate && b.eat >= 0.52) { this.ate = true; Foods.consume(this.eatFood); }
      if (b.eat >= 1) { b.eat = 0; this.eatFood = null; }
    } else {
      if (inp.eat) this.eatQueue = 0.7;
      if (this.eatQueue > 0) {
        this.eatQueue -= dt;
        if (b.mode === 'ground' || b.mode === 'swim') { this.eatQueue = 0; this.tryEat(); }
        else if (b.mode === 'air') { c.want = 0; }
      }
    }
    moveBody(b, dt, c);
    if (b.pos.y < -30) { G.ui.toast('Whoosh! Back to the island.'); this.place(G.world.def.spawn[0], G.world.def.spawn[1]); }
    poseBody(b, dt, true);
    S.hunger = Math.max(0, S.hunger - dt * (100 / 420));
    S.x = b.pos.x; S.z = b.pos.z;
  },
  // nearest food this animal can eat that is within reach of its mouth
  reachable() {
    const b = this.b; if (!b || b.eat > 0) return null;
    if (b.mode === 'fly' && b.pos.y - Math.max(G.world.H(b.pos.x, b.pos.z), WATER) > 0.6) return null;
    const rig = b.rig, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const mx = b.pos.x + fx * rig.length * 0.42, mz = b.pos.z + fz * rig.length * 0.42;
    const reach = 0.28 + rig.radius * 0.9 + rig.length * 0.15;
    let best = null, bd = 1e9;
    for (const f of Foods.list) {
      if (!f.edible) continue;
      const d = Math.min(Math.hypot(f.x - mx, f.z - mz), Math.hypot(f.x - b.pos.x, f.z - b.pos.z) - rig.length * 0.25);
      if (d > reach || Math.abs(f.y - b.pos.y) > rig.height + 0.6) continue;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  },
  tryEat() {
    const b = this.b, f = this.reachable();
    if (b.mode === 'air' || b.mode === 'fly') return;
    this.eatFood = f; this.ate = false; b.speed = 0;
    this.eatDur = f ? 1.1 : 0.7;
    b.eat = 0.001;
  },
};

/* ---------- wildlife ---------- */
const Wild = {
  list: [],
  clear() { for (const c of this.list) G.scene.remove(c.rig.root); this.list = []; },
  spawn(w) {
    this.clear();
    for (const spec of w.def.wildlife || []) for (let i = 0; i < spec.n; i++) {
      const b = newBody(spec.sp);
      Object.assign(b, { home: { x: spec.home[0], z: spec.home[1] }, range: spec.range, water: !!spec.water, state: 'idle', timer: Math.random() * 4, target: null, think: Math.random() * 0.3, stuck: 0, eatPause: 0, flyH: 0 });
      const pt = (b.water && SPECIES[spec.sp].swim ? w.ringPoint(b.home.x, b.home.z, 0, b.range, true) : null) || w.ringPoint(b.home.x, b.home.z, 0, b.range, false) || w.ringPoint(0, 0, 0, 60, false);
      if (!pt) continue;
      b.yaw = Math.random() * TAU;
      b.pos.set(pt.x, pt.h, pt.z);
      const sp = SPECIES[spec.sp];
      if (sp.swim && pt.h < WATER - b.rig.floatDepth) { b.mode = 'swim'; b.pos.y = WATER - b.rig.floatDepth; }
      G.scene.add(b.rig.root);
      poseBody(b, 0.016, true);
      this.list.push(b);
    }
  },
  pickTarget(b) {
    const w = G.world, sp = SPECIES[b.sp];
    const water = b.water && sp.swim && Math.random() < 0.75;
    return w.ringPoint(b.home.x, b.home.z, 0, b.range, water) || w.ringPoint(b.pos.x, b.pos.z, 1, 8, water);
  },
  update(dt, camPos) {
    const P = Player.b; let followers = 0;
    for (const b of this.list) {
      const dCam = Math.hypot(b.pos.x - camPos.x, b.pos.z - camPos.z);
      const near = dCam < 85;
      b.rig.root.visible = dCam < 160;
      if (!near) continue;
      const sp = SPECIES[b.sp], rig = b.rig;
      const c = { dx: 0, dz: 0, want: 0 };
      // think a few times a second
      b.think -= dt;
      if (P && b.think <= 0) {
        b.think = 0.3;
        const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
        const psp = SPECIES[P.sp], pAir = P.mode === 'fly' && P.pos.y - G.world.H(P.pos.x, P.pos.z) > 3;
        const predator = (psp.hunter && SMALL_PREY.includes(b.sp)) || (P.sp === 'snake' && b.sp === 'frog');
        const bigger = P.rig.height > rig.height * 1.6;
        const fast = P.speed > P.rig.walkSpeed * 1.25;
        let fr = 0;
        if (P.sp !== b.sp && !pAir) fr = predator ? 7 : bigger ? (fast ? FEAR[b.sp] : FEAR[b.sp] * 0.45) : 0;
        if (d < fr && b.state !== 'flee' && b.state !== 'flyaway') {
          if (sp.fly && b.sp !== 'chicken' && Math.random() < 0.65) {
            b.state = 'flyaway'; b.flyH = 4 + Math.random() * 5;
            const a = Math.atan2(b.pos.x - P.pos.x, b.pos.z - P.pos.z) + (Math.random() - 0.5);
            b.target = G.world.ringPoint(b.pos.x + Math.sin(a) * 30, b.pos.z + Math.cos(a) * 30, 0, 12, b.water) || G.world.ringPoint(b.home.x, b.home.z, 0, b.range, false);
          } else { b.state = 'flee'; b.timer = 2 + Math.random() * 2; b.fleeA = Math.atan2(b.pos.x - P.pos.x, b.pos.z - P.pos.z); }
          b.eat = 0;
        } else if (P.sp === b.sp && b.state !== 'flee' && b.state !== 'flyaway' && d < 14 && d > 1.2) {
          if (b.state !== 'follow' && Math.random() < 0.5) { b.state = 'follow'; b.slot = Math.random() * TAU; }
        }
        if (b.state === 'follow') {
          if (d > 22 || P.sp !== b.sp) b.state = 'idle';
          else followers++;
          if (followers > 3) b.state = 'idle';
        }
      }
      const night = G.night > 0.6, sleepy = night ? !NOCTURNAL[b.sp] : b.sp === 'owl';
      switch (b.state) {
        case 'idle':
          b.timer -= dt;
          if (b.timer <= 0) {
            const r = Math.random();
            if (sleepy) { b.timer = 6 + Math.random() * 10; }
            else if (r < 0.45) { b.target = this.pickTarget(b); b.state = b.target ? 'wander' : 'idle'; b.timer = 2; b.pace = 0.55 + Math.random() * 0.45; b.stuck = 0; }
            else if (r < 0.8 && b.mode !== 'fly') { b.state = 'graze'; b.timer = 3 + Math.random() * 5; }
            else b.timer = 2 + Math.random() * 4;
          }
          if (b.mode === 'fly') { c.want = 0; c.down = true; }
          break;
        case 'wander': {
          const t = b.target, dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz);
          c.dx = dx; c.dz = dz; c.want = rig.walkSpeed * b.pace;
          if (b.mode === 'fly') { c.want = sp.flySpeed * 0.6; c.down = d < 6; c.up = d > 6 && b.pos.y - G.world.H(b.pos.x, b.pos.z) < b.flyH; }
          if (b.blocked || b.speed < 0.05) b.stuck += dt; else b.stuck = Math.max(0, b.stuck - dt);
          if (d < 0.5 + rig.radius || b.stuck > 2.5) { b.state = 'idle'; b.timer = 1 + Math.random() * 4; }
          break;
        }
        case 'graze':
          b.timer -= dt;
          if (b.eatPause > 0) b.eatPause -= dt;
          else { b.eat += dt / 1.3; if (b.eat >= 1) { b.eat = 0; b.eatPause = 0.4 + Math.random() * 1.4; if (Math.random() < 0.3) b.yaw += (Math.random() - 0.5) * 1.2; } }
          if (b.timer <= 0 && b.eat === 0) { b.state = 'idle'; b.timer = 1 + Math.random() * 3; }
          break;
        case 'flee': {
          b.timer -= dt;
          const a = b.fleeA + Math.sin(G.t * 1.7 + b.bob) * 0.4;
          c.dx = Math.sin(a); c.dz = Math.cos(a);
          c.want = b.sp === 'turtle' ? 0 : rig.runSpeed * 0.85;
          if (b.blocked) b.fleeA += 1.2 * dt * 4;
          if (b.timer <= 0) { b.state = 'idle'; b.timer = 1 + Math.random() * 2; }
          break;
        }
        case 'flyaway': {
          const t = b.target;
          if (!t) { b.state = 'idle'; break; }
          const dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz);
          if (b.mode !== 'fly') c.takeoff = true;
          c.dx = dx; c.dz = dz; c.want = sp.flySpeed * 0.75;
          const alt = b.pos.y - Math.max(G.world.H(b.pos.x, b.pos.z), WATER);
          if (d > 8) c.up = alt < b.flyH; else { c.down = true; c.want = sp.flySpeed * 0.3; }
          if (b.mode !== 'fly' && d < 9) { b.state = 'idle'; b.timer = 2 + Math.random() * 3; }
          break;
        }
        case 'follow': {
          const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw);
          const back = 1.4 + rig.length * 1.6;
          const tx = P.pos.x - fx * back + Math.sin(b.slot) * back * 0.8, tz = P.pos.z - fz * back + Math.cos(b.slot) * back * 0.8;
          const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz);
          if (d > 0.4) { c.dx = dx; c.dz = dz; c.want = d > 4 ? rig.runSpeed * 0.8 : Math.min(rig.walkSpeed * 1.2, Math.max(P.speed, rig.walkSpeed * 0.6)); }
          if (P.mode === 'fly' && sp.fly) { c.takeoff = b.mode !== 'fly'; c.want = sp.flySpeed * clamp(d / 6, 0.3, 1); c.up = b.pos.y < P.pos.y - 0.5; c.down = b.pos.y > P.pos.y + 1; }
          else if (b.mode === 'fly') { c.down = true; }
          if (P.mode === 'swim' && !sp.swim) { c.want = 0; }
          break;
        }
      }
      moveBody(b, dt, c);
      poseBody(b, dt, near);
    }
  },
};

/* ---------- people ---------- */
const Folk = {
  list: [], asking: null,
  clear() { for (const p of this.list) { G.scene.remove(p.rig.root); G.ui.dropBubble(p); } this.list = []; this.asking = null; },
  spawn(w) {
    this.clear();
    const n = w.def.people || 0; if (!n) return;
    const names = PEOPLE_NAMES.slice().sort(() => Math.random() - 0.5);
    const pick = (a) => a[(Math.random() * a.length) | 0];
    for (let i = 0; i < n; i++) {
      const kid = Math.random() < 0.4;
      const look = { skin: pick(SKIN), hair: pick(HAIR), hairStyle: (Math.random() * 3) | 0, shirt: pick(SHIRT), pants: pick(PANTS), shoes: pick(SHOES), height: kid ? 1.2 + Math.random() * 0.25 : 1.55 + Math.random() * 0.3 };
      const rig = People.build(look);
      const wp = w.def.walk[(Math.random() * w.def.walk.length) | 0] || [0, 0];
      const pt = w.ringPoint(wp[0], wp[1], 0, 10, false) || { x: wp[0], z: wp[1], h: w.H(wp[0], wp[1]) };
      const p = { rig, name: names[i], pos: new V3(pt.x, pt.h, pt.z), yaw: Math.random() * TAU, speed: 0, state: 'look', timer: Math.random() * 3, target: null, friend: false, cool: 0, crouch: 0, reach: 0, offerT: 18, petT: 0, away: false, st: { t: 0, speed: 0, crouch: 0, reach: 0 } };
      G.scene.add(rig.root);
      this.list.push(p);
    }
  },
  walkTo(p, dt, tx, tz, speed) {
    const w = G.world, dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { p.speed = damp(p.speed, 0, 6, dt); return d; }
    const want = Math.atan2(dx, dz); p.yaw += clamp(angDiff(p.yaw, want), -4 * dt, 4 * dt);
    p.speed = damp(p.speed, speed * Math.pow(clamp(Math.cos(angDiff(p.yaw, want)) * 1.3, 0, 1), 1.5), 4, dt);
    let nx = clamp(p.pos.x + Math.sin(p.yaw) * p.speed * dt, -LIM, LIM), nz = clamp(p.pos.z + Math.cos(p.yaw) * p.speed * dt, -LIM, LIM);
    const lim = w.def.water ? WATER + 0.05 : -100;
    p.blocked = false;
    if (w.H(nx, nz) < lim) { p.blocked = true; if (w.H(nx, p.pos.z) >= lim) nz = p.pos.z; else if (w.H(p.pos.x, nz) >= lim) nx = p.pos.x; else { nx = p.pos.x; nz = p.pos.z; } }
    tmpV.set(nx, 0, nz); if (w.collide(tmpV, p.rig.radius)) p.blocked = true;
    p.pos.x = tmpV.x; p.pos.z = tmpV.z;
    return d;
  },
  face(p, dt, x, z) { p.yaw += clamp(angDiff(p.yaw, Math.atan2(x - p.pos.x, z - p.pos.z)), -4 * dt, 4 * dt); },
  update(dt, camPos) {
    const w = G.world, P = Player.b, ui = G.ui;
    const dayTime = G.night < 0.5;
    for (const p of this.list) {
      p.cool = Math.max(0, p.cool - dt);
      let crouch = 0, reach = 0;
      const dP = P ? Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) : 99;
      const pRig = P ? P.rig : null;
      const greet = pRig ? 0.9 + pRig.length * 0.55 : 1;
      const playerReachable = P && P.mode !== 'fly' && P.mode !== 'swim';
      if (!dayTime && !p.away && p.state !== 'home') { if (this.asking === p) this.cancel(p); p.state = 'home'; p.timer = 9; ui.bubble(p, 'Good night!', 2.5); }
      if (dayTime && p.away) { p.away = false; p.rig.setVisible(true); p.state = 'look'; p.timer = 1; const wp = w.def.walk[(Math.random() * w.def.walk.length) | 0]; const pt = w.ringPoint(wp[0], wp[1], 0, 8, false); if (pt) p.pos.set(pt.x, pt.h, pt.z); }
      if (p.away) continue;
      switch (p.state) {
        case 'look':
          p.speed = damp(p.speed, 0, 6, dt); p.timer -= dt;
          if (p.timer <= 0) { const wp = w.def.walk[(Math.random() * w.def.walk.length) | 0]; p.target = w.ringPoint(wp[0], wp[1], 0, 9, false); p.state = p.target ? 'stroll' : 'look'; p.timer = 3; p.pace = 1.0 + Math.random() * 0.4; p.stuck = 0; }
          break;
        case 'stroll': {
          const d = this.walkTo(p, dt, p.target.x, p.target.z, p.pace);
          if (p.blocked) p.stuck += dt;
          if (d < 0.8 || p.stuck > 3) { p.state = 'look'; p.timer = 2 + Math.random() * 4; }
          break;
        }
        case 'approach': {
          const d = this.walkTo(p, dt, P.pos.x, P.pos.z, 1.3);
          if (d < greet + 0.4) { p.state = 'ask'; this.asking = p; ui.ask(p, SPECIES[P.sp].name); }
          if (dP > 9 || !playerReachable) { p.state = 'look'; p.timer = 1; p.cool = 12; }
          break;
        }
        case 'ask':
          p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 1;
          if (dP > greet + 4) this.cancel(p);
          break;
        case 'friend': {
          p.offerT -= dt;
          const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), back = greet + 1.6;
          const tx = P.pos.x - fx * back, tz = P.pos.z - fz * back;
          if (dP > 40 && P.mode !== 'fly') { const pt = w.ringPoint(P.pos.x, P.pos.z, 4, 8, false); if (pt) p.pos.set(pt.x, pt.h, pt.z); }
          if (dP > back + 1.2) this.walkTo(p, dt, tx, tz, dP > 9 ? 3.2 : 1.5);
          else { p.speed = damp(p.speed, 0, 6, dt); this.face(p, dt, P.pos.x, P.pos.z); }
          if (p.offerT <= 0 && dP < 7 && playerReachable) { p.state = 'offer'; p.timer = 1.6; p.gave = false; }
          else if (P.idle > 2.5 && dP < greet + 0.8 && p.petT <= 0) { p.state = 'pet'; p.timer = 2.2; }
          p.petT = Math.max(0, p.petT - dt);
          break;
        }
        case 'offer': {
          p.timer -= dt; crouch = 1; reach = 1; p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z);
          if (!p.gave && p.timer < 1.0) {
            p.gave = true; p.offerT = 25;
            const sp = SPECIES[P.sp], land = sp.eats.filter((f) => !FOODS[f].water);
            const type = land.includes(sp.fav) ? sp.fav : land[(Math.random() * land.length) | 0];
            const fx = Math.sin(p.yaw), fz = Math.cos(p.yaw), x = p.pos.x + fx * 0.6, z = p.pos.z + fz * 0.6;
            Foods.add(type, x, z, w.H(x, z), true);
            ui.bubble(p, "Here's a snack!", 2.4);
          }
          if (p.timer <= 0) p.state = 'friend';
          break;
        }
        case 'pet':
          p.timer -= dt; crouch = 1; reach = 0.8; p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z);
          if (p.timer > 1.9 && p.timer - dt <= 1.9) ui.hearts(P.pos, 3);
          if (p.timer <= 0 || P.idle === 0) { p.state = 'friend'; p.petT = 12; }
          break;
        case 'home':
          p.timer -= dt;
          if (w.barn) this.walkTo(p, dt, w.barn.door[0], w.barn.door[1], 1.6); else this.walkTo(p, dt, p.pos.x * 1.5, p.pos.z * 1.5, 1.6);
          if (p.timer <= 0) { p.away = true; p.friend = false; p.rig.setVisible(false); ui.dropBubble(p); }
          break;
      }
      // notice the player's animal
      if (P && dayTime && !p.friend && p.cool <= 0 && !this.asking && (p.state === 'look' || p.state === 'stroll') && dP < 7 && playerReachable && !this.list.some((q) => q.friend)) {
        p.state = 'approach';
      }
      p.pos.y = w.H(p.pos.x, p.pos.z);
      p.crouch = damp(p.crouch, crouch, 5, dt); p.reach = damp(p.reach, reach, 5, dt);
      const r = p.rig.root; r.position.copy(p.pos); r.rotation.y = p.yaw;
      const near = Math.hypot(p.pos.x - camPos.x, p.pos.z - camPos.z) < 80;
      r.visible = near || Math.hypot(p.pos.x - camPos.x, p.pos.z - camPos.z) < 150;
      if (near) { const st = p.st; st.t = G.t; st.speed = p.speed; st.crouch = p.crouch; st.reach = p.reach; p.rig.update(dt, st); }
    }
  },
  answer(yes) {
    const p = this.asking; if (!p) return;
    this.asking = null;
    if (yes) {
      p.friend = true; p.state = 'friend'; p.offerT = 10; p.petT = 6;
      S.leaves += 5;
      G.ui.bubble(p, "Yay! You're my pet now!", 2.8);
      G.ui.hearts(Player.pos, 6); G.ui.leafPop(Player.pos, 5);
      G.ui.toast(`${p.name} is your person now. Stay close for snacks!`);
      G.save();
    } else { p.state = 'look'; p.timer = 2; p.cool = 45; G.ui.bubble(p, 'Okay, maybe later!', 2.2); }
  },
  cancel(p) { if (this.asking === p) { this.asking = null; G.ui.hideAsk(); } p.state = 'look'; p.timer = 1; p.cool = 15; },
};

/* ---------- food ---------- */
const Foods = {
  list: [], tick: 0,
  glowMat: null,
  clear() { for (const f of this.list) this.removeObj(f); this.list = []; },
  removeObj(f) { G.scene.remove(f.obj); if (f.glow) G.scene.remove(f.glow); f.gone = true; },
  glowFor() {
    if (!this.glowMat) this.glowMat = new THREE.SpriteMaterial({ map: Env.glowTexture, color: 0xffe9a0, transparent: true, opacity: 0.55, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
    if (!this.giftMat) this.giftMat = new THREE.SpriteMaterial({ map: Env.glowTexture, color: 0xffc23a, transparent: true, opacity: 0.8, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  },
  add(type, x, z, y, gift) {
    this.glowFor();
    const obj = Env.food(type);
    const f = { type, x, y, z, obj, gift: !!gift, edible: false, glow: null, phase: Math.random() * TAU };
    obj.position.set(x, y, z); obj.rotation.y = Math.random() * TAU;
    if (FOODS[type].water) {
      const a = Math.random() * TAU;
      f.fish = { cx: x, cz: z, r: 0.8 + Math.random() * 1.6, a, w: (Math.random() < 0.5 ? -1 : 1) * (0.25 + Math.random() * 0.3) };
    }
    const glow = new THREE.Sprite(gift ? this.giftMat : this.glowMat);
    glow.renderOrder = 5;
    f.glow = glow;
    G.scene.add(obj); G.scene.add(glow);
    this.list.push(f);
    this.refreshOne(f);
    return f;
  },
  refreshOne(f) {
    const sp = Player.sp;
    f.edible = !!sp && canEat(sp, f.type);
    f.glow.visible = f.edible;
    const s = Player.b ? clamp(Player.rig.length * 0.55, 0.32, 0.9) : 0.5;
    f.glowS = (f.gift ? 1.5 : 1) * s;
  },
  refresh() { for (const f of this.list) this.refreshOne(f); },
  consume(f) {
    if (f.gone) return;
    this.removeObj(f);
    this.list.splice(this.list.indexOf(f), 1);
    const sp = SPECIES[Player.sp], fav = f.type === sp.fav, n = fav ? 2 : 1;
    S.leaves += n; S.hunger = Math.min(100, S.hunger + (fav ? 22 : 13));
    G.ui.leafPop(tmpV.set(f.x, f.y, f.z), n);
    if (fav && Math.random() < 0.4) G.ui.say('Yum! My favorite!', 1.6);
    G.save(true);
  },
  update(dt) {
    const P = Player.b, w = G.world; if (!P) return;
    const t = G.t, pulse = 0.75 + 0.25 * Math.sin(t * 3.2);
    const H = w.H;
    for (const f of this.list) {
      if (f.fish) {
        const fi = f.fish; fi.a += fi.w * dt;
        let nx = fi.cx + Math.cos(fi.a) * fi.r, nz = fi.cz + Math.sin(fi.a) * fi.r;
        if (H(nx, nz) > WATER - 0.45) { fi.w = -fi.w; fi.a += fi.w * dt * 2; nx = fi.cx + Math.cos(fi.a) * fi.r; nz = fi.cz + Math.sin(fi.a) * fi.r; }
        // dart away from a fast animal splashing nearby
        const pd = Math.hypot(nx - P.pos.x, nz - P.pos.z);
        if (pd < 1.2 && P.speed > 1.6 && P.mode === 'swim') fi.a += fi.w * dt * 4;
        f.obj.rotation.y = Math.atan2(-Math.sin(fi.a) * fi.w, Math.cos(fi.a) * fi.w);
        f.x = nx; f.z = nz; f.obj.position.set(nx, f.y + Math.sin(t * 1.3 + f.phase) * 0.03, nz);
      }
      Env.foodUpdate(f.obj, t + f.phase);
      if (f.glow.visible) {
        const s = f.glowS * (0.85 + 0.15 * pulse);
        f.glow.scale.set(s, s, s);
        f.glow.position.set(f.x, (f.fish ? WATER + 0.02 : f.y + 0.12), f.z);
      }
    }
    if (this.glowMat) this.glowMat.opacity = 0.32 + 0.22 * pulse;
    // keep a ring of food around the player
    this.tick -= dt;
    if (this.tick <= 0) { this.tick = 0.5; this.fill(3); }
  },
  fill(maxAdd) {
    const P = Player.b, w = G.world; if (!P) return;
    const rig = P.rig, r0 = Math.max(2.2, rig.length * 3.5), r1 = clamp(rig.length * 26 + 10, 15, 42);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.gift) continue;
      if (Math.hypot(f.x - P.pos.x, f.z - P.pos.z) > r1 * 1.7) { this.removeObj(f); this.list.splice(i, 1); }
    }
    const weights = Object.entries(w.def.foods).filter(([, n]) => n > 0);
    const land = this.list.filter((f) => !f.fish).length, fish = this.list.length - land;
    const sp = SPECIES[P.sp];
    let added = 0;
    for (let k = 0; k < 12 && added < maxAdd; k++) {
      const wantFish = fish + added < 6 && w.def.water && Math.random() < 0.35;
      if (!wantFish && land + added >= 34) break;
      let pool = weights.filter(([t]) => !!FOODS[t].water === wantFish);
      if (!pool.length) continue;
      // lean toward food this animal can eat, so there's always something to find
      if (Math.random() < 0.6) { const ed = pool.filter(([t]) => sp.eats.includes(t)); if (ed.length) pool = ed; }
      let sum = 0; for (const [, n] of pool) sum += n;
      let pick = Math.random() * sum, type = pool[0][0];
      for (const [t, n] of pool) { pick -= n; if (pick <= 0) { type = t; break; } }
      const pt = w.foodPoint(type, P.pos.x, P.pos.z, r0, r1);
      if (!pt) continue;
      this.add(type, pt.x, pt.z, pt.y, false);
      added++;
    }
  },
};
