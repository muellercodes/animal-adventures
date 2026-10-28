/* ---------- actors: movement, the player's animal, wildlife, people, food ---------- */
const G = { scene: null, world: null, camera: null, t: 0, night: 0, ui: null, sound: null };
const V3 = THREE.Vector3;
const tmpV = new V3();
const canEat = (sp, type) => type === 'candy' || SPECIES[sp].eats.includes(type);
const UPRIGHT = { duck: 1, swan: 1, chicken: 1, owl: 1, parrot: 1 };
const FEAR = { chicken: 3, duck: 4.5, swan: 3, frog: 2.5, lizard: 3, snake: 2, bunny: 5, squirrel: 4.5, turtle: 1.5, fox: 6, owl: 5, deer: 10, parrot: 4, moose: 0,
  horse: 6, pig: 3, goat: 4, otter: 4, hedgehog: 2, raccoon: 4, weasel: 4, dog: 1.5, cat: 4 };
const NOCTURNAL = { owl: 1, frog: 1, fox: 1, raccoon: 1, hedgehog: 1 };
const nightNo = () => Math.floor(S.time / CYCLE);

function newBody(sp, age = 1) {
  const rig = Animals.build(sp);
  rig.root.rotation.order = 'YXZ';
  const b = { sp, rig, pos: new V3(), yaw: 0, speed: 0, vy: 0, mode: 'ground', hopCd: 0, hopping: false, eat: 0, idle: 0, turn: 0, pitch: 0, bob: Math.random() * 9, blocked: false,
    age: 1, k: 1, m: null, room: null, tree: null, ca: 0, sick: 0, happy: 0, stuck: 0,
    st: { t: 0, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0, sick: 0, happy: 0, swimSleep: false } };
  setBodyAge(b, age);
  return b;
}
// babies are drawn smaller and move a little slower; m holds the size-adjusted numbers
function setBodyAge(b, age) {
  age = clamp(age, 0, 1);
  b.age = age;
  if (b.rig.setAge) b.rig.setAge(age);
  b.k = lerp(0.42, 1, age);
  b.rig.root.scale.setScalar(b.k);
  const r = b.rig, k = b.k;
  b.m = { length: r.length * k, height: r.height * k, radius: r.radius * k, eye: r.eyeHeight * k, float: r.floatDepth * k,
    walk: r.walkSpeed * (0.6 + 0.4 * k), run: r.runSpeed * (0.55 + 0.45 * k) };
}
const canFlyNow = (b) => !!SPECIES[b.sp].fly && b.age >= FLY_AGE;
function jumpV(b) { const h = b.sp === 'frog' ? 0.45 * b.k : clamp(b.m.height * 0.9, 0.25, 1.3); return Math.sqrt(2 * GRAV * h); }

// Shared movement for the player and wildlife.
// c = { dx, dz: wanted direction (any length, 0 = none), want: wanted speed m/s, face: optional yaw to turn to, jump, up, down, takeoff,
//       climb: a tree to start climbing, climbV: -1..1 up/down while climbing, around: -1..1 around the trunk, letGo }
function moveBody(b, dt, c) {
  const w = G.world, H = w.H, sp = SPECIES[b.sp], m = b.m, p = b.pos, fly = canFlyNow(b), swim = !!sp.swim;
  if (c.climb && b.mode !== 'climb' && b.mode !== 'perch') startClimb(b, c.climb);
  if (b.mode === 'climb' || b.mode === 'perch') { climbStep(b, dt, c); return; }
  if (b.mode === 'sleep') { b.speed = 0; b.idle += dt; return; }
  let want = c.want || 0, yawRate = 0;
  const tgt = c.face !== undefined ? c.face : (c.dx || c.dz) ? Math.atan2(c.dx, c.dz) : null;
  if (tgt !== null) {
    const diff = angDiff(b.yaw, tgt);
    const tr = b.mode === 'fly' ? 2.6 : m.length < 0.7 ? 10 : m.length < 1.5 ? 7 : 4;
    const step = clamp(diff, -tr * dt, tr * dt);
    b.yaw += step; yawRate = dt > 0 ? step / dt : 0;
    if (b.mode !== 'fly' && b.mode !== 'air') want *= Math.pow(clamp(Math.cos(diff) * 1.3, 0, 1), 1.5);
  }
  b.turn = damp(b.turn, yawRate, 8, dt);
  const acc = b.mode === 'fly' ? 1.8 : b.mode === 'swim' ? 2.6 : b.mode === 'air' ? 0.5 : want > b.speed ? 5 : 8;
  b.speed = damp(b.speed, want, acc, dt);
  const fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
  tmpV.set(p.x + fx * b.speed * dt, 0, p.z + fz * b.speed * dt);
  w.clampXZ(tmpV, m.radius, b.room);
  let nx = tmpV.x, nz = tmpV.z;
  b.blocked = false;
  if (!b.room && !swim && !(fly && (b.mode === 'fly' || b.mode === 'air'))) {
    const lim = w.def.water ? WATER - Math.max(0.05, m.height * 0.45) : -100;
    if (H(nx, nz) < lim) {
      b.blocked = true;
      if (H(nx, p.z) >= lim) nz = p.z; else if (H(p.x, nz) >= lim) nx = p.x; else { nx = p.x; nz = p.z; b.speed *= 0.5; }
    }
  }
  {
    // high in the air only buildings are in the way (their roofs are solid), not trees and fences
    tmpV.set(nx, 0, nz);
    if (w.collide(tmpV, m.radius * 0.8, p.y, !b.player, b.mode === 'fly' && p.y - H(nx, nz) >= 6)) b.blocked = true;
    nx = tmpV.x; nz = tmpV.z;
  }
  p.x = nx; p.z = nz;

  const h = w.groundAt && !b.room ? w.groundAt(p.x, p.z, p.y) : H(p.x, p.z), sY = WATER - m.float, hasGround = h > -100;
  const deep = !b.room && swim && hasGround && h < sY - 0.02, overWater = !b.room && hasGround && h < WATER && !!w.def.water;
  if (c.jump && b.eat <= 0) {
    if ((b.mode === 'ground' || b.mode === 'swim') && !sp.noJump) { b.vy = jumpV(b); b.mode = 'air'; b.hopping = false; }
    else if (b.mode === 'air' && fly && !b.room) { b.mode = 'fly'; b.vy = 3; }
  }
  if (c.takeoff && fly && b.mode !== 'fly' && !b.room) { b.mode = 'fly'; b.vy = 3.5; }
  if (b.mode === 'fly' && (!fly || b.room)) b.mode = 'air';
  switch (b.mode) {
    case 'ground':
      if (deep) b.mode = 'swim';
      else if (!hasGround) { b.mode = fly ? 'fly' : 'air'; b.vy = 0; }
      else if (p.y - h > 0.5) { b.mode = 'air'; b.vy = 0; }   // walked off a roof (or a ledge): fall
      else {
        p.y = h;
        if (sp.hop && b.speed > 0.3 * b.k && b.eat <= 0) {
          b.hopCd -= dt;
          if (b.hopCd <= 0) { b.vy = sp.hopV * Math.sqrt(b.k) * (0.62 + 0.38 * clamp(b.speed / (m.run * 0.9), 0, 1)); b.mode = 'air'; b.hopping = true; }
        }
      }
      break;
    case 'swim':
      if (!deep) { b.mode = 'ground'; p.y = Math.max(h, WATER - 0.6); }
      else { b.bob += dt; p.y = sY + Math.sin(b.bob * 2.1) * 0.008 * (1 + m.height); }
      break;
    case 'air': {
      b.vy -= GRAV * dt; p.y += b.vy * dt;
      if (fly && !swim && overWater && p.y < WATER + 0.3 && b.vy < 0) { b.mode = 'fly'; b.vy = 0.5; break; }
      const floor = !hasGround ? -1e9 : deep ? sY : h;
      if (p.y <= floor && b.vy <= 0) {
        p.y = floor; b.vy = 0; b.mode = deep ? 'swim' : 'ground';
        if (b.hopping) b.hopCd = b.speed > m.walk * 1.3 ? 0.03 : 0.2;
        b.hopping = false;
        if (b.onLand) b.onLand(b);
      }
      break;
    }
    case 'fly': {
      const tv = c.up ? 3.4 : c.down ? -4.5 : want > 0.5 ? -0.45 : -1.3;
      b.vy = damp(b.vy, tv, 3, dt); p.y += b.vy * dt;
      const ceil = hasGround ? Math.max(h, WATER) + 40 : 40;
      if (p.y > ceil) { p.y = ceil; if (b.vy > 0) b.vy = 0; }
      if (hasGround) {
        if (!swim && overWater) { if (p.y < WATER + 0.25) { p.y = WATER + 0.25; if (b.vy < 0) b.vy = 0; } }
        else { const floor = deep ? sY : h; if (p.y <= floor) { p.y = floor; b.vy = 0; b.mode = deep ? 'swim' : 'ground'; if (b.onLand) b.onLand(b); } }
      }
      break;
    }
  }
  b.idle = b.speed < 0.06 && (b.mode === 'ground' || b.mode === 'swim') ? b.idle + dt : 0;
}

/* climbing: the animal hugs the trunk, belly in, and goes up or down it */
function startClimb(b, t) {
  b.tree = t; b.mode = 'climb'; b.speed = 0; b.vy = 0;
  b.ca = Math.atan2(b.pos.z - t.z, b.pos.x - t.x);
  b.pos.y = Math.max(b.pos.y, t.base + 0.05);
}
function climbStep(b, dt, c) {
  const t = b.tree, m = b.m;
  if (!t) { b.mode = 'air'; return; }
  if (c.letGo) {
    b.mode = 'air'; b.vy = 0.5; b.speed = 1;
    b.yaw = Math.atan2(b.pos.x - t.x, b.pos.z - t.z);
    b.pos.x += Math.sin(b.yaw) * 0.2; b.pos.z += Math.cos(b.yaw) * 0.2; b.tree = null;
    return;
  }
  if (b.mode === 'perch') {
    b.speed = 0; b.idle += dt;
    const R = t.r + m.length * 0.32;
    b.pos.set(t.x + Math.cos(b.ca) * R, t.top, t.z + Math.sin(b.ca) * R);
    b.yaw = Math.atan2(b.pos.x - t.x, b.pos.z - t.z) + Math.PI * 0.5;
    if ((c.climbV || 0) < -0.3) { b.mode = 'climb'; b.pos.y = t.top - 0.05; }
    return;
  }
  const v = (c.climbV || 0) * m.walk * 0.75;
  b.speed = damp(b.speed, v, 6, dt);
  b.pos.y += b.speed * dt;
  b.ca += (c.around || 0) * dt * (m.walk * 0.6) / (t.r + 0.2);
  const R = t.r + 0.015;
  b.pos.x = t.x + Math.cos(b.ca) * R; b.pos.z = t.z + Math.sin(b.ca) * R;
  b.yaw = Math.atan2(t.x - b.pos.x, t.z - b.pos.z);
  b.idle = Math.abs(b.speed) < 0.03 ? b.idle + dt : 0;
  if (b.pos.y >= t.top) { b.pos.y = t.top; b.mode = 'perch'; b.speed = 0; if (b.onPerch) b.onPerch(b); }
  else if (b.pos.y <= t.base && b.speed < 0) {
    b.pos.y = t.base; b.mode = 'ground'; b.speed = 0; b.tree = null;
    b.yaw = Math.atan2(b.pos.x - t.x, b.pos.z - t.z);
    b.pos.x += Math.sin(b.yaw) * 0.15; b.pos.z += Math.cos(b.yaw) * 0.15;
  }
}

function poseBody(b, dt, animate) {
  const r = b.rig.root, rig = b.rig, H = G.world.H;
  r.position.copy(b.pos); r.rotation.y = b.yaw;
  let pt = 0;
  if (b.mode === 'climb') pt = -Math.PI / 2;
  else if (b.mode === 'fly' && b.sp !== 'owl') pt = -clamp(b.vy * 0.08, -0.3, 0.3);
  else if (b.mode === 'ground' && !UPRIGHT[b.sp]) {
    const d = Math.max(0.12, b.m.length * 0.35), fx = Math.sin(b.yaw) * d, fz = Math.cos(b.yaw) * d;
    pt = -clamp(Math.atan2(H(b.pos.x + fx, b.pos.z + fz) - H(b.pos.x - fx, b.pos.z - fz), 2 * d), -0.4, 0.4);
  }
  b.pitch = b.mode === 'climb' || b.wasClimb ? pt : damp(b.pitch, pt, 6, dt);
  b.wasClimb = b.mode === 'climb';
  r.rotation.x = b.pitch;
  if (!animate) return;
  const st = b.st; st.t = G.t; st.speed = b.speed / b.k; st.mode = b.mode === 'perch' ? 'ground' : b.mode; st.vy = b.vy; st.eat = b.eat; st.turn = b.turn; st.idle = b.idle;
  st.sick = b.sick; st.happy = b.happy; st.swimSleep = b.mode === 'sleep' && b.sp === 'otter';
  rig.update(dt, st);
}

/* ---------- the player's animal ---------- */
const Player = {
  b: null, eatFood: null, ate: false, eatDur: 1.1, eatQueue: 0, hungryT: 0, emptyT: 0, sayT: 0,
  get sp() { return this.b && this.b.sp; },
  get pos() { return this.b.pos; },
  get rig() { return this.b.rig; },
  get m() { return this.b.m; },
  set(sp) {
    let keep = null;
    if (this.b) { keep = { x: this.b.pos.x, z: this.b.pos.z, yaw: this.b.yaw, room: this.b.room }; G.scene.remove(this.b.rig.root); }
    this.b = newBody(sp, ageOf(sp));
    this.b.player = true;
    if (this.b.rig.setDetail) this.b.rig.setDetail(2);
    this.b.rig.onSneeze = () => { if (G.sound) G.sound.sneeze(this.b); G.ui.say('Achoo!', 1.1); };
    this.b.onLand = (bb) => { if (G.sound) G.sound.land(bb); };
    G.scene.add(this.b.rig.root);
    Town.collar(this.b);
    if (keep) { this.b.yaw = keep.yaw; this.b.room = keep.room; this.place(keep.x, keep.z); }
    this.eatFood = null;
  },
  grow() {
    const b = this.b, a = ageOf(b.sp);
    if (Math.abs(a - b.age) > 0.02 || (a >= 1 && b.age < 1)) setBodyAge(b, a);
  },
  place(x, z) {
    const w = G.world, b = this.b, sp = SPECIES[b.sp];
    b.room = w.roomAt(x, z);
    let h = w.H(x, z);
    const okSpot = (hh) => hh > -100 && (sp.swim || !w.def.water || b.room || hh > WATER - 0.02);
    if (!okSpot(h)) {
      let best = null;
      for (let r = 2; r < 80 && !best; r += 3) best = w.ringPoint(x, z, r, r + 3, false);
      if (!best) { x = w.def.spawn[0]; z = w.def.spawn[1]; } else { x = best.x; z = best.z; }
      b.room = null; h = w.H(x, z);
    }
    b.pos.set(x, h, z); b.vy = 0; b.speed = 0; b.tree = null;
    b.mode = !b.room && sp.swim && h < WATER - b.m.float ? 'swim' : 'ground';
    if (b.mode === 'swim') b.pos.y = WATER - b.m.float;
    poseBody(b, 0.016, true);
  },
  update(dt, inp) {
    const b = this.b, sp = SPECIES[b.sp], m = b.m;
    b.sick = damp(b.sick, S.sick > 0 ? 1 : 0, 2, dt);
    b.happy = damp(b.happy, Folk.list.some((p) => p.state === 'pet' && p.pos.distanceTo(b.pos) < 3) ? 1 : 0, 3, dt);
    const tired = S.hunger <= 0 || S.sick > 0;
    const mag = Math.min(1, Math.hypot(inp.mx, inp.mz));
    const walkS = m.walk, runS = tired ? walkS : Math.max(m.run * 0.9, walkS * 1.6);
    let want;
    if (b.mode === 'fly') want = sp.flySpeed * mag;
    else if (b.mode === 'swim') want = (sp.swimSpeed || 1.5) * (0.6 + 0.4 * b.k) * mag * (tired ? 0.6 : 1);
    else if (b.mode === 'air') want = b.speed;
    else { want = mag <= 0.6 ? walkS * (mag / 0.6) : lerp(walkS, runS, (mag - 0.6) / 0.4); if (inp.walk) want = Math.min(want, walkS); }
    const c = { dx: inp.mx, dz: inp.mz, want, jump: inp.jump && !(tired && b.mode === 'air'), up: inp.up && !tired, down: inp.down || (tired && b.mode === 'fly'), climbV: inp.iy, around: -inp.ix, letGo: inp.letGo, climb: inp.climb };
    if (b.mode === 'climb' || b.mode === 'perch') { if (inp.jump && b.mode === 'perch') c.letGo = true; }
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
    if (b.riding) { b.speed = 0; b.vy = 0; b.mode = 'ground'; } else moveBody(b, dt, c);
    if (b.pos.y < -30) { G.ui.toast('Whoosh! Back to an island.'); const I = G.world.ringPoint(b.pos.x, b.pos.z, 0, 120, false); if (I) this.place(I.x, I.z); else this.place(G.world.def.spawn[0], G.world.def.spawn[1]); }
    poseBody(b, dt, true);
    // tummy: it slowly empties; an empty tummy makes you tired, and staying empty gives you a cold
    S.hunger = Math.max(0, S.hunger - dt * (100 / 420));
    this.sayT -= dt;
    if (S.hunger <= 0) {
      this.emptyT += dt;
      if (this.sayT <= 0) { this.sayT = 22; G.ui.say("I'm hungry!", 2); if (G.sound) G.sound.tummy(); }
      if (this.emptyT > 90 && S.sick <= 0) { S.sick = 1; G.ui.toast(`Oh no, your ${sp.name.toLowerCase()} caught a cold! Eat lots of food, sleep in your bed, or visit the vet.`, 5000); }
    } else this.emptyT = 0;
    if (!b.room) { S.x = b.pos.x; S.z = b.pos.z; }
  },
  // nearest food this animal can eat that is within reach of its mouth
  reachable() {
    const b = this.b; if (!b || b.eat > 0 || b.mode === 'climb' || b.mode === 'sleep') return null;
    if (b.mode === 'fly' && b.pos.y - Math.max(G.world.H(b.pos.x, b.pos.z), WATER) > 0.6) return null;
    const m = b.m, fx = Math.sin(b.yaw), fz = Math.cos(b.yaw);
    const mx = b.pos.x + fx * m.length * 0.42, mz = b.pos.z + fz * m.length * 0.42;
    const reach = 0.28 + m.radius * 0.9 + m.length * 0.15;
    let best = null, bd = 1e9;
    for (const f of Foods.list) {
      if (!f.edible) continue;
      const d = Math.min(Math.hypot(f.x - mx, f.z - mz), Math.hypot(f.x - b.pos.x, f.z - b.pos.z) - m.length * 0.25);
      if (d > reach || Math.abs(f.y - b.pos.y) > m.height + 0.6) continue;
      if (d < bd) { bd = d; best = f; }
    }
    return best;
  },
  tryEat() {
    const b = this.b, f = this.reachable();
    if (b.mode === 'air' || b.mode === 'fly' || b.mode === 'climb' || b.mode === 'sleep') return;
    this.eatFood = f; this.ate = false; b.speed = 0;
    this.eatDur = f ? 1.1 : 0.7;
    b.eat = 0.001;
  },
};

/* ---------- wildlife ---------- */
const Wild = {
  list: [],
  clear() { for (const c of this.list) G.scene.remove(c.rig.root); this.list = []; },
  make(sp, age, x, z, extra) {
    const b = newBody(sp, age);
    Object.assign(b, { home: { x, z }, range: 10, water: false, state: 'idle', timer: Math.random() * 4, target: null, think: Math.random() * 0.3, stuck: 0, eatPause: 0, flyH: 0 }, extra || {});
    b.yaw = Math.random() * TAU;
    const h = G.world.H(x, z);
    b.pos.set(x, h, z);
    if (SPECIES[sp].swim && !b.room && h < WATER - b.m.float) { b.mode = 'swim'; b.pos.y = WATER - b.m.float; }
    G.scene.add(b.rig.root);
    poseBody(b, 0.016, true);
    this.list.push(b);
    return b;
  },
  spawn(w) {
    this.clear(); this.ambT = 0;
    for (const spec of w.def.wildlife || []) this.group(w, spec, null);
  },
  // a group of one species: around a home spot, or inside a pen; the first one may have little ones
  group(w, spec, own) {
    const sp = SPECIES[spec.sp];
    for (let i = 0; i < spec.n; i++) {
      let pt, extra;
      if (spec.pen) { pt = w.penPoint(spec.pen, 1); extra = { pen: spec.pen, home: { x: spec.pen.x, z: spec.pen.z }, range: Math.min(spec.pen.hw, spec.pen.hd) }; }
      else {
        pt = (spec.water && sp.swim ? w.ringPoint(spec.home[0], spec.home[1], 0, spec.range, true) : null) || w.ringPoint(spec.home[0], spec.home[1], 0, spec.range, false);
        extra = { home: { x: spec.home[0], z: spec.home[1] }, range: spec.range, water: !!spec.water };
      }
      if (!pt) continue;
      extra.own = own; extra.amb = !!spec.amb;
      const a = this.make(spec.sp, 1, pt.x, pt.z, extra);
      // families: little ones stay close to a parent
      if (spec.kids && i === 0) for (let k = 0; k < spec.kids; k++) {
        const kx = spec.pen ? w.penPoint(spec.pen, 1) : { x: pt.x + (Math.random() - 0.5) * 1.5, z: pt.z + (Math.random() - 0.5) * 1.5 };
        const kid = this.make(spec.sp, 0.12 + Math.random() * 0.25, kx.x, kx.z, { parent: a, state: 'kid', slot: (k + 1) * 1.7, own, amb: a.amb, pen: a.pen });
        a.hasKids = true; kid.home = a.home; kid.range = a.range;
      }
    }
  },
  remove(b) { G.scene.remove(b.rig.root); const i = this.list.indexOf(b); if (i >= 0) this.list.splice(i, 1); },
  // out in the wilds, animals turn up around you and wander off again
  ambient(dt, P) {
    const w = G.world, def = w.def;
    for (const ev of w.events.splice(0)) {
      if (ev.kind === 'pen') this.group(w, { sp: ev.sp, n: ev.n, kids: ev.kids, pen: ev.pen }, ev.own);
      else if (ev.kind === 'home') this.group(w, { sp: ev.sp, n: ev.n, kids: ev.kids, home: ev.home, range: ev.range }, ev.own);
      else if (ev.kind === 'gone') for (const b of this.list.filter((q) => q.own === ev.own && q.state !== 'follow')) this.remove(b);
    }
    if (!P || P.room || !def.ambient) return;
    this.ambT = (this.ambT || 0) - dt;
    if (this.ambT > 0) return;
    this.ambT = 1.5;
    let n = 0;
    for (const b of this.list.slice()) {
      if (!b.amb) continue;
      const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
      if (d > 160 && b.state !== 'follow') this.remove(b); else if (!b.parent) n++;
    }
    if (n >= 7) return;
    const a = Math.random() * TAU, d = 60 + Math.random() * 35, x = P.pos.x + Math.sin(a) * d, z = P.pos.z + Math.cos(a) * d;
    if (Math.max(Math.abs(x), Math.abs(z)) < World.CORE + 20) return;
    if (def.reserved && def.reserved(x, z, 0)) return;   // no deer wandering in from the woods into towns or onto roads
    let sum = 0; for (const q of def.ambient) sum += q.w;
    let pick = Math.random() * sum, spec = def.ambient[0];
    for (const q of def.ambient) { pick -= q.w; if (pick <= 0) { spec = q; break; } }
    const water = !!spec.water && SPECIES[spec.sp].swim;
    const pt = w.ringPoint(x, z, 0, 25, water) || (water ? null : w.ringPoint(x, z, 0, 25, false));
    if (!pt) return;
    this.group(w, { sp: spec.sp, n: water ? 1 + (Math.random() < 0.4 ? 1 : 0) : 1, kids: spec.kids && Math.random() < 0.5 ? Math.ceil(Math.random() * spec.kids) : 0, home: [pt.x, pt.z], range: 30, water, amb: true }, null);
  },
  // animals waiting in the pound's cages (made when you go inside)
  spawnPound(room) {
    for (const b of this.list.filter((q) => q.caged)) { G.scene.remove(b.rig.root); }
    this.list = this.list.filter((q) => !q.caged);
    const pool = Object.keys(SPECIES).filter((s) => !['moose', 'horse', 'deer', 'swan'].includes(s));
    room.cages.forEach((cg, i) => {
      if (i % 3 === 2) return;
      const caught = Town.poundList[(i - Math.floor(i / 3)) | 0];
      const sp = caught && SPECIES[caught] ? caught : pool[(hash2(i, nightNo(), 7) * pool.length) | 0];
      const b = this.make(sp, Math.random() < 0.4 ? 0.3 : 0.8, cg.x, cg.z, { caged: true, room, state: 'caged', timer: 3 + Math.random() * 5 });
      b.pos.y = cg.y || 0; b.yaw = cg.yaw;
      const sz = Math.max(b.m.length, b.m.height);
      if (sz > 0.75) setBodyAge(b, clamp((0.75 / Math.max(b.rig.length, b.rig.height) - 0.42) / 0.58, 0, 1));
    });
  },
  // horses, goats and pigs standing in their stalls when you walk into a barn
  spawnBarn(room) {
    for (const b of this.list.filter((q) => q.caged && q.room === room)) this.remove(b);
    (room.stalls || []).forEach((st, i) => {
      if (i % 3 === 2) return;
      const sp = ['horse', 'horse', 'goat', 'pig'][(hash2(i, nightNo(), 5) * 4) | 0];
      const b = this.make(sp, Math.random() < 0.3 ? 0.45 : 1, st.x, st.z, { caged: true, room, state: 'caged', timer: 3 + Math.random() * 5 });
      b.pos.y = 0; b.yaw = Math.atan2(room.ox - st.x, 0) + (Math.random() - 0.5) * 0.6;
    });
  },
  pickTarget(b) {
    const w = G.world, sp = SPECIES[b.sp];
    if (b.pen) return w.penPoint(b.pen, 0.7 + b.m.radius);
    const water = b.water && sp.swim && Math.random() < 0.75;
    return w.ringPoint(b.home.x, b.home.z, 0, b.range, water) || w.ringPoint(b.pos.x, b.pos.z, 1, 8, water);
  },
  update(dt, camPos) {
    const P = Player.b; let followers = 0;
    const night = G.night > 0.6;
    this.ambient(dt, P);
    for (const b of this.list) {
      const dCam = Math.hypot(b.pos.x - camPos.x, b.pos.z - camPos.z);
      const near = dCam < 85;
      b.rig.root.visible = dCam < 170 && (!b.caged || (P && P.room === b.room));
      if (b.rig.setDetail) { const lv = dCam < 22 ? 1 : 0; if (b.lod !== lv) { b.lod = lv; b.rig.setDetail(lv); } }
      // a dog on a walk far from you just keeps up with its person
      if (!near && b.state === 'leash' && b.walker) { const pe = b.walker, sd = b.slot || 1; b.pos.set(pe.pos.x + Math.cos(pe.yaw) * 0.8 * sd, pe.pos.y, pe.pos.z - Math.sin(pe.yaw) * 0.8 * sd); b.yaw = pe.yaw; poseBody(b, dt, false); continue; }
      if (!near || (b.caged && !b.rig.root.visible)) continue;
      const sp = SPECIES[b.sp], m = b.m;
      b.callT = (b.callT === undefined ? 5 + Math.random() * 40 : b.callT) - dt;
      if (b.callT <= 0) { b.callT = 18 + Math.random() * 40; if (b.mode !== 'sleep' && G.sound && (!P || P.room === b.room)) G.sound.wildCall(b, camPos, G.camYaw || 0); }
      const c = { dx: 0, dz: 0, want: 0 };
      const sleepy = night ? !NOCTURNAL[b.sp] : (b.sp === 'owl' || b.sp === 'raccoon');
      // think a few times a second
      b.think -= dt;
      if (P && b.think <= 0 && !b.caged && b.state !== 'kid' && b.state !== 'trapped' && b.state !== 'leash') {
        b.think = 0.3;
        const d = Math.hypot(b.pos.x - P.pos.x, b.pos.z - P.pos.z);
        const psp = SPECIES[P.sp], pAir = P.mode === 'fly' && P.pos.y - G.world.H(P.pos.x, P.pos.z) > 3;
        const predator = (psp.hunter && SMALL_PREY.includes(b.sp)) || (P.sp === 'snake' && b.sp === 'frog');
        const bigger = P.m.height > m.height * 1.6;
        const fast = P.speed > P.m.walk * 1.25;
        let fr = 0;
        if (P.sp !== b.sp && !pAir && !P.room) fr = predator ? 7 : bigger ? (fast ? FEAR[b.sp] : FEAR[b.sp] * 0.45) : 0;
        if (b.mode === 'sleep' && d < fr * 0.6) b.mode = 'ground';
        if (d < fr && b.state !== 'flee' && b.state !== 'flyaway' && b.state !== 'tree' && b.mode !== 'sleep') {
          const t = sp.climb && !b.pen ? G.world.treeNear(b.pos.x, b.pos.z, 7) : null;
          if (t) { b.state = 'tree'; b.target = t; b.timer = 10; b.perchT = 6 + Math.random() * 8; }
          else if (canFlyNow(b) && b.sp !== 'chicken' && !b.pen && !b.hasKids && Math.random() < 0.65) {
            b.state = 'flyaway'; b.flyH = 4 + Math.random() * 5;
            const a = Math.atan2(b.pos.x - P.pos.x, b.pos.z - P.pos.z) + (Math.random() - 0.5);
            b.target = G.world.ringPoint(b.pos.x + Math.sin(a) * 30, b.pos.z + Math.cos(a) * 30, 0, 12, b.water) || G.world.ringPoint(b.home.x, b.home.z, 0, b.range, false);
          } else { b.state = 'flee'; b.timer = 2 + Math.random() * 2; b.fleeA = Math.atan2(b.pos.x - P.pos.x, b.pos.z - P.pos.z); }
          b.eat = 0;
        } else if (P.sp === b.sp && !b.pen && b.age >= 0.6 && b.state !== 'flee' && b.state !== 'flyaway' && b.state !== 'tree' && d < 14 && d > 1.2 && !b.hasKids) {
          if (b.state !== 'follow' && Math.random() < 0.5) { b.state = 'follow'; b.slot = Math.random() * TAU; if (b.mode === 'sleep') b.mode = 'ground'; }
        }
        if (b.state === 'follow') {
          if (d > 22 || P.sp !== b.sp || P.room) b.state = 'idle';
          else followers++;
          if (followers > 3) b.state = 'idle';
        }
      }
      switch (b.state) {
        case 'caged':
          b.timer -= dt;
          if (b.timer <= 0) { b.timer = 4 + Math.random() * 8; if (b.mode === 'sleep') b.mode = 'ground'; else if (Math.random() < 0.4) b.mode = 'sleep'; }
          break;
        case 'kid': {
          const pa = b.parent;
          if (!pa || !this.list.includes(pa)) { b.state = 'idle'; break; }
          const fx = Math.sin(pa.yaw), fz = Math.cos(pa.yaw), back = pa.m.length * 0.9 + 0.3 + b.slot * 0.25;
          const tx = pa.pos.x - fx * back + Math.sin(b.slot * 2.3 + pa.yaw) * 0.5, tz = pa.pos.z - fz * back + Math.cos(b.slot * 2.3 + pa.yaw) * 0.5;
          const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz);
          if (pa.mode === 'sleep') { if (d < 1) { b.mode = 'sleep'; } else { c.dx = dx; c.dz = dz; c.want = m.walk; } }
          else {
            if (b.mode === 'sleep') b.mode = 'ground';
            if (d > 0.25) { c.dx = dx; c.dz = dz; c.want = clamp(d * 1.5, 0, d > 3 ? m.run : Math.max(pa.speed * 1.1, m.walk * 0.6)); }
            if (pa.state === 'graze' && d < 0.8 && Math.random() < dt * 0.4) b.eat = 0.001;
          }
          if (b.eat > 0) { b.eat += dt / 1.2; if (b.eat >= 1) b.eat = 0; }
          if (d > 25) { b.pos.set(tx, G.world.H(tx, tz), tz); }
          break;
        }
        case 'leash': {
          // a dog out for a walk: beside its person, a little ahead; it sniffs when they stop and lies down when they sit
          const pe = b.walker;
          if (!pe || pe.dog !== b || !Folk.list.includes(pe)) { b.state = 'idle'; b.walker = null; break; }
          const fx = Math.sin(pe.yaw), fz = Math.cos(pe.yaw), sd = b.slot || 1;
          const tx = pe.pos.x + fx * 0.45 + fz * 0.8 * sd, tz = pe.pos.z + fz * 0.45 - fx * 0.8 * sd;
          const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz), ps = pe.speed || 0;
          if (pe.cs === 'sit' && d < 0.8) { if (b.mode === 'ground' && Math.random() < dt * 0.5) b.mode = 'sleep'; }
          else {
            if (b.mode === 'sleep') b.mode = 'ground';
            if (d > 0.3) { c.dx = dx; c.dz = dz; c.want = clamp(d * 1.8, 0, d > 2.5 ? m.run : Math.max(ps * 1.05, m.walk * 0.5)); }
            else if (ps > 0.2) { c.dx = fx; c.dz = fz; c.want = ps; }
          }
          // caught on something (a lamp post, a bench) and falling behind: catch up in a hop
          b.leashFar = d > 3 ? (b.leashFar || 0) + dt : 0;
          if (d > 12 || b.leashFar > 1.2) { b.pos.set(tx, G.world.H(tx, tz), tz); b.leashFar = 0; }
          if (ps < 0.1 && d < 0.7 && !(b.eat > 0) && Math.random() < dt * 0.25) b.eat = 0.001;
          if (b.eat > 0) { b.eat += dt / 1.6; if (b.eat >= 1) b.eat = 0; }
          break;
        }
        case 'idle':
          b.timer -= dt;
          if (b.timer <= 0) {
            const r = Math.random();
            if (sleepy && b.mode !== 'fly') { b.timer = 8 + Math.random() * 12; if (b.mode === 'ground' || b.mode === 'swim') b.mode = b.mode === 'swim' && b.sp !== 'otter' ? 'swim' : 'sleep'; }
            else {
              if (b.mode === 'sleep') b.mode = 'ground';
              const raid = r < 0.3 && PESTS[b.sp] ? Town.raidTarget(b) : null;
              if (raid) { b.target = raid; b.state = 'raid'; b.timer = 30; b.stuck = 0; }
              else if (r < 0.45) { b.target = this.pickTarget(b); b.state = b.target ? 'wander' : 'idle'; b.timer = 2; b.pace = 0.55 + Math.random() * 0.45; b.stuck = 0; }
              else if (r < 0.8 && b.mode !== 'fly') { b.state = 'graze'; b.timer = 3 + Math.random() * 5; }
              else b.timer = 2 + Math.random() * 4;
            }
          }
          if (b.mode === 'fly') { c.want = 0; c.down = true; }
          break;
        case 'wander': {
          const t = b.target, dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz);
          c.dx = dx; c.dz = dz; c.want = m.walk * b.pace;
          if (b.mode === 'fly') { c.want = sp.flySpeed * 0.6; c.down = d < 6; c.up = d > 6 && b.pos.y - G.world.H(b.pos.x, b.pos.z) < b.flyH; }
          if (b.blocked || b.speed < 0.05) b.stuck += dt; else b.stuck = Math.max(0, b.stuck - dt);
          if (d < 0.5 + m.radius || b.stuck > 2.5) { b.state = 'idle'; b.timer = 1 + Math.random() * 4; }
          break;
        }
        case 'raid': {
          // sneaking up to the garden for a carrot (or the bait in a trap)
          const t = b.target; if (!t) { b.state = 'idle'; break; }
          const dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz);
          c.dx = dx; c.dz = dz; c.want = m.walk * (t.trap && t.stage ? 0.6 : 0.95);
          if (b.blocked) b.stuck += dt; else b.stuck = Math.max(0, b.stuck - dt);
          b.timer -= dt;
          if (t.trap && t.stage === 0 && d < 0.3 + m.radius) { t.stage = 1; t.x = t.trap.cx; t.z = t.trap.cz; }
          else if (!t.trap && d < 0.3 + m.radius) { b.state = 'graze'; b.timer = 4 + Math.random() * 5; Town.nibble(b); }
          if (b.state === 'raid' && (b.stuck > 3 || b.timer <= 0 || (t.trap && !t.trap.set))) { b.state = 'idle'; b.timer = 2 + Math.random() * 3; }
          break;
        }
        case 'trapped':
          c.want = 0; b.eat = 0;
          if (b.trap) { b.pos.x = b.trap.cx; b.pos.z = b.trap.cz; }
          break;
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
          c.want = b.sp === 'turtle' || b.sp === 'hedgehog' ? 0 : m.run * 0.85;
          if (b.blocked) b.fleeA += 1.2 * dt * 4;
          if (b.timer <= 0) { b.state = 'idle'; b.timer = 1 + Math.random() * 2; }
          break;
        }
        case 'tree': {
          // run to a tree, scamper up, wait on a branch, come back down
          const t = b.target;
          if (b.mode === 'climb' || b.mode === 'perch') {
            if (b.mode === 'perch') { b.perchT -= dt; c.climbV = b.perchT <= 0 ? -1 : 0; }
            else c.climbV = b.perchT > 0 ? 1 : -1;
          } else if (b.tree === null && b.perchT <= 0) { b.state = 'idle'; b.timer = 1 + Math.random() * 2; }
          else {
            const dx = t.x - b.pos.x, dz = t.z - b.pos.z, d = Math.hypot(dx, dz) - t.r;
            c.dx = dx; c.dz = dz; c.want = m.run * 0.85;
            if (d < m.radius + 0.25) c.climb = t;
            b.timer -= dt; if (b.timer <= 0) { b.state = 'idle'; b.timer = 1; }
          }
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
          const back = 1.4 + m.length * 1.6;
          const tx = P.pos.x - fx * back + Math.sin(b.slot) * back * 0.8, tz = P.pos.z - fz * back + Math.cos(b.slot) * back * 0.8;
          const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz);
          if (d > 0.4) { c.dx = dx; c.dz = dz; c.want = d > 4 ? m.run * 0.8 : Math.min(m.walk * 1.2, Math.max(P.speed, m.walk * 0.6)); }
          if (P.mode === 'fly' && canFlyNow(b)) { c.takeoff = b.mode !== 'fly'; c.want = sp.flySpeed * clamp(d / 6, 0.3, 1); c.up = b.pos.y < P.pos.y - 0.5; c.down = b.pos.y > P.pos.y + 1; }
          else if (b.mode === 'fly') { c.down = true; }
          if (P.mode === 'swim' && !sp.swim) { c.want = 0; }
          break;
        }
      }
      if (b.state === 'tree' && b.mode !== 'climb' && b.mode !== 'perch' && b.tree === null && b.perchT !== undefined && b.perchT <= 0 && b.target) { b.state = 'idle'; b.timer = 2; }
      moveBody(b, dt, c);
      poseBody(b, dt, true);
    }
  },
};

/* ---------- people ---------- */
const Folk = {
  list: [], asking: null,
  clear() { for (const p of this.list) { G.scene.remove(p.rig.root); G.ui.dropBubble(p); } this.list = []; this.asking = null; },
  pick: (a) => a[(Math.random() * a.length) | 0],
  randomLook(kid) {
    const pk = this.pick;
    return { skin: pk(SKIN), hair: pk(HAIR), hairStyle: (Math.random() * 3) | 0, shirt: pk(SHIRT), pants: pk(PANTS), shoes: pk(SHOES), height: kid ? 1.2 + Math.random() * 0.25 : 1.55 + Math.random() * 0.3 };
  },
  make(name, look, x, z, extra) {
    const rig = People.build(look);
    const p = Object.assign({ rig, name, look, pos: new V3(x, G.world.H(x, z), z), yaw: Math.random() * TAU, speed: 0, state: 'look', timer: Math.random() * 3, target: null, friend: false, cool: 0, crouch: 0, reach: 0, offerT: 18, petT: 0, away: false, room: G.world.roomAt(x, z), st: { t: 0, speed: 0, crouch: 0, reach: 0 } }, extra || {});
    G.scene.add(rig.root);
    this.list.push(p);
    return p;
  },
  remove(p) { G.scene.remove(p.rig.root); G.ui.dropBubble(p); if (this.asking === p) { this.asking = null; G.ui.hideAsk(); } this.list.splice(this.list.indexOf(p), 1); },
  spawn(w) {
    this.clear();
    const n = w.def.people || 0;
    const taken = new Set(Object.values(S.homes).filter((h) => h && h.name).map((h) => h.name));
    const names = PEOPLE_NAMES.filter((x) => !taken.has(x)).sort(() => Math.random() - 0.5);
    const homes = (w.houses || []).filter((h) => !h.pound && h.kind !== 'school'), village = homes.filter((h) => h.village);
    // the people who adopted your animals live in the village
    if (w.def.village) {
      for (const [sp, hm] of Object.entries(S.homes)) {
        if (!hm || !hm.name || this.list.some((q) => q.name === hm.name)) continue;
        const house = village[hm.house] || village[0];
        const pt = w.ringPoint(house.door.x, house.door.z, 1, 6, false) || { x: house.door.x, z: house.door.z };
        this.make(hm.name, hm.look, pt.x, pt.z, { house, owns: sp });
      }
    }
    for (let i = 0; i < n; i++) {
      const wp = w.def.walk[(Math.random() * w.def.walk.length) | 0] || [0, 0];
      const pt = w.ringPoint(wp[0], wp[1], 0, 10, false) || { x: wp[0], z: wp[1] };
      this.make(names[i], this.randomLook(Math.random() < 0.4), pt.x, pt.z, { house: homes.length ? homes[i % homes.length] : null });
    }
  },
  ownerOf(sp) { const hm = S.homes[sp]; return hm ? this.list.find((p) => p.name === hm.name) : null; },
  walkTo(p, dt, tx, tz, speed) {
    const w = G.world, dx = tx - p.pos.x, dz = tz - p.pos.z, d = Math.hypot(dx, dz);
    if (d < 0.3) { p.speed = damp(p.speed, 0, 6, dt); return d; }
    const want = Math.atan2(dx, dz); p.yaw += clamp(angDiff(p.yaw, want), -4 * dt, 4 * dt);
    p.speed = damp(p.speed, speed * Math.pow(clamp(Math.cos(angDiff(p.yaw, want)) * 1.3, 0, 1), 1.5), 4, dt);
    tmpV.set(p.pos.x + Math.sin(p.yaw) * p.speed * dt, 0, p.pos.z + Math.cos(p.yaw) * p.speed * dt);
    w.clampXZ(tmpV, p.rig.radius, p.room);
    let nx = tmpV.x, nz = tmpV.z;
    const lim = w.def.water && !p.room ? WATER + 0.05 : -100;
    p.blocked = false;
    if (w.H(nx, nz) < lim) { p.blocked = true; if (w.H(nx, p.pos.z) >= lim) nz = p.pos.z; else if (w.H(p.pos.x, nz) >= lim) nx = p.pos.x; else { nx = p.pos.x; nz = p.pos.z; } }
    tmpV.set(nx, 0, nz); if (w.collide(tmpV, p.rig.radius)) p.blocked = true;
    p.pos.x = tmpV.x; p.pos.z = tmpV.z;
    return d;
  },
  // where to walk to reach a house door: through the gap in the front fence first
  doorPath(p, house) {
    const d = house.door, y = house.yard;
    if (!y || !house.walk || Math.hypot(p.pos.x - d.x, p.pos.z - d.z) < 2.5) return d;
    const dx = p.pos.x - y.x, dz = p.pos.z - y.z, c = Math.cos(y.rot), s2 = Math.sin(y.rot), lx = dx * c - dz * s2, lz = dx * s2 + dz * c;
    const inYard = Math.abs(lx) < y.hw && lz > y.d0 - 0.5 && lz < y.d1;
    return inYard ? d : house.walk;
  },
  face(p, dt, x, z) { p.yaw += clamp(angDiff(p.yaw, Math.atan2(x - p.pos.x, z - p.pos.z)), -4 * dt, 4 * dt); },
  // move a person into or out of a room
  teleport(p, x, z, room) { p.room = room || null; p.pos.set(x, G.world.H(x, z), z); },
  update(dt, camPos) {
    const w = G.world, P = Player.b, ui = G.ui;
    const dayTime = G.night < 0.5;
    let busy = this.list.some((q) => q.state === 'notice' || q.state === 'kneel' || q.state === 'greet' || q.state === 'lead');
    for (const p of this.list.slice()) {
      p.cool = Math.max(0, p.cool - dt);
      let crouch = 0, reach = 0;
      const sameRoom = P && P.room === p.room;
      const dP = P && sameRoom ? Math.hypot(P.pos.x - p.pos.x, P.pos.z - p.pos.z) : 99;
      const greet = P ? 0.9 + P.m.length * 0.55 : 1;
      const playerReachable = P && sameRoom && !P.riding && P.mode !== 'fly' && P.mode !== 'swim' && P.mode !== 'climb' && P.mode !== 'perch';
      if (p.visitor) { this.visitorStep(p, dt, P, dP, greet); continue; }
      if (p.staff) { this.staffStep(p, dt, P, dP); continue; }
      if (p.fairgoer) { Town.fairgoerStep(p, dt, P, dP, greet, playerReachable); continue; }
      if (p.city) { const r = CityLife.step(p, dt, P, dP, greet, playerReachable); if (r) { p.sit = r.sit || 0; p.seatY = r.seatY; this.pose(p, dt, r.crouch, r.reach, camPos); continue; } }
      if (p.role) { const r = Town.step(p, dt, P, dP, greet, playerReachable) || NO_POSE; p.sit = r.sit || 0; p.seatY = r.seatY; this.pose(p, dt, r.crouch, r.reach, camPos); continue; }
      // evenings: people walk home and go inside (your person stays with you if you are at home together)
      if (!dayTime && !p.away && p.state !== 'home' && !(p.friend && P && P.room && P.room === p.room)) { p.state = 'home'; p.timer = 12; ui.bubble(p, 'Good night!', 2.5); }
      if (dayTime && p.away) {
        p.away = false; p.rig.setVisible(true); p.state = 'look'; p.timer = 1;
        if (p.house) { this.teleport(p, p.house.door.x, p.house.door.z); }
        else { const wp = w.def.walk[(Math.random() * w.def.walk.length) | 0]; const pt = w.ringPoint(wp[0], wp[1], 0, 8, false); if (pt) this.teleport(p, pt.x, pt.z); }
      }
      // popping into a shop for a while
      if (p.inShop > 0) {
        p.inShop -= dt;
        if (p.inShop <= 0) { const h = p.shopTo; p.shopTo = null; p.away = false; p.rig.setVisible(true); if (h) { this.teleport(p, h.door.x, h.door.z); p.yaw = h.door.yaw; if (h.group) w.openDoor(h.group, 1); } p.state = 'look'; p.timer = 1; }
        continue;
      }
      if (p.away) continue;
      switch (p.state) {
        case 'look':
          p.speed = damp(p.speed, 0, 6, dt); p.timer -= dt;
          if (p.timer <= 0) {
            if (p.room) { const rm = p.room; p.target = { x: rm.ox + (Math.random() - 0.5) * (rm.w - 2), z: rm.oz + (Math.random() - 0.5) * (rm.d - 2) }; }
            else if (dayTime && Math.random() < 0.3 && (p.shopTo = this.shopNear(p))) p.target = { x: p.shopTo.door.x, z: p.shopTo.door.z };
            else if (p.walkPts) { const wp = p.walkPts[(Math.random() * p.walkPts.length) | 0]; p.target = { x: wp[0] + (Math.random() - 0.5) * 3, z: wp[1] }; }
            else { const pts = w.def.villageWalk && Math.random() < 0.4 ? w.def.villageWalk : w.def.walk; const wp = pts[(Math.random() * pts.length) | 0]; p.target = wp ? w.ringPoint(wp[0], wp[1], 0, 9, false) : null; }
            p.state = p.target ? 'stroll' : 'look'; p.timer = 3; p.pace = 1.0 + Math.random() * 0.4; p.stuck = 0;
          }
          break;
        case 'stroll': {
          const d = this.walkTo(p, dt, p.target.x, p.target.z, p.room ? 0.8 : p.pace);
          if (p.blocked) p.stuck += dt;
          if (p.shopTo && d < 1.0) { p.inShop = 15 + Math.random() * 30; p.away = true; p.rig.setVisible(false); ui.dropBubble(p); if (p.shopTo.group) w.openDoor(p.shopTo.group, 1); break; }
          if (d < 0.8 || p.stuck > 3) { p.state = 'look'; p.timer = 2 + Math.random() * 4; p.shopTo = null; }
          break;
        }
        // someone who likes your animal stops, kneels and holds out a hand. Animals can't talk:
        // walking up to the hand means yes, walking away means no.
        case 'notice':
          p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z); p.timer -= dt;
          if (p.timer <= 0) { p.state = 'kneel'; p.timer = 16; }
          if (!playerReachable || dP > 14) this.giveUp(p, false);
          break;
        case 'kneel':
          p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 1; p.timer -= dt;
          if (playerReachable && dP < greet + 0.35) { p.state = 'greet'; p.timer = 2.8; ui.hearts(P.pos, 3); if (G.sound) G.sound.call(P); }
          else if (p.timer <= 0 || dP > 13 || !playerReachable) this.giveUp(p, true);
          break;
        case 'greet':
          p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 0.8; p.timer -= dt;
          if (p.timer > 1.3 && p.timer - dt <= 1.3) ui.hearts(P.pos, 3);
          if (dP > greet + 2.5) this.giveUp(p, true);
          else if (p.timer <= 0) { p.state = 'lead'; p.leadT = 0; p.lost = 0; p.target = null; ui.bubble(p, 'Come on, this way!', 2.6); }
          break;
        case 'lead': {
          // walks home and looks back; if you follow, you get a home
          p.leadT += dt;
          p.lost = dP > 11 || !sameRoom ? p.lost + dt : Math.max(0, p.lost - dt * 2);
          if (p.lost > 5) { this.giveUp(p, true); break; }
          const door = p.house && !p.house.pound ? p.house.door : null;
          if (dP > 6.5) { p.speed = damp(p.speed, 0, 6, dt); this.face(p, dt, P.pos.x, P.pos.z); reach = 0.5; }
          else if (door) {
            const via = this.doorPath(p, p.house);
            this.walkTo(p, dt, via.x, via.z, 1.25);
            const d = Math.hypot(door.x - p.pos.x, door.z - p.pos.z);
            if (d < 1.7 && dP < 8) { if (p.house.group) w.openDoor(p.house.group, 1.6); Homes.adopt(p); break; }
          } else {
            if (!p.target || Math.hypot(p.target.x - p.pos.x, p.target.z - p.pos.z) < 1.2) { const a = p.yaw + (Math.random() - 0.5); p.target = w.ringPoint(p.pos.x + Math.sin(a) * 14, p.pos.z + Math.cos(a) * 14, 0, 5, false) || { x: p.pos.x + Math.sin(a) * 8, z: p.pos.z + Math.cos(a) * 8 }; }
            this.walkTo(p, dt, p.target.x, p.target.z, 1.2);
          }
          // a long way from home: following for a while is enough
          if (p.leadT > 22 && dP < 8) Homes.adopt(p);
          break;
        }
        case 'friend': {
          p.offerT -= dt;
          if (!sameRoom) { p.speed = damp(p.speed, 0, 6, dt); break; }
          const fx = Math.sin(P.yaw), fz = Math.cos(P.yaw), back = greet + 1.6;
          const tx = P.pos.x - fx * back, tz = P.pos.z - fz * back;
          if (dP > 40 && P.mode !== 'fly') { const pt = w.ringPoint(P.pos.x, P.pos.z, 4, 8, false); if (pt) this.teleport(p, pt.x, pt.z); }
          if (dP > back + 1.2) this.walkTo(p, dt, tx, tz, dP > 9 ? 3.2 : 1.5);
          else { p.speed = damp(p.speed, 0, 6, dt); this.face(p, dt, P.pos.x, P.pos.z); }
          if (p.offerT <= 0 && dP < 7 && playerReachable && !p.room) { p.state = 'offer'; p.timer = 1.6; p.gave = false; }
          else if (P.idle > 2.5 && dP < greet + 0.8 && p.petT <= 0 && playerReachable) { p.state = 'pet'; p.timer = 2.2; }
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
            ui.bubble(p, 'Snack time!', 2.2);
          }
          if (p.timer <= 0) p.state = 'friend';
          break;
        }
        case 'pet':
          p.timer -= dt; crouch = 1; reach = 0.8; p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z);
          if (p.timer > 1.9 && p.timer - dt <= 1.9) { ui.hearts(P.pos, 3); if (G.sound) G.sound.call(P); }
          if (p.timer <= 0 || P.idle === 0) { p.state = 'friend'; p.petT = 12; }
          break;
        case 'home': {
          p.timer -= dt;
          const door = p.house ? p.house.door : (w.barn ? { x: w.barn.door[0], z: w.barn.door[1] } : { x: p.pos.x * 1.2, z: p.pos.z * 1.2 });
          const via = p.house ? this.doorPath(p, p.house) : door;
          this.walkTo(p, dt, via.x, via.z, 1.6);
          const d = Math.hypot(door.x - p.pos.x, door.z - p.pos.z);
          if (p.timer <= 0 || d < 0.8) { p.away = true; p.friend = false; p.rig.setVisible(false); ui.dropBubble(p); if (d < 1.5 && p.house && p.house.group) w.openDoor(p.house.group, 1); }
          break;
        }
      }
      if (p.friend && p.state !== 'friend' && p.state !== 'offer' && p.state !== 'pet' && p.state !== 'home') p.state = 'friend';
      // notice the player's animal (only if it doesn't have a home yet)
      if (P && dayTime && !busy && !p.friend && !p.owns && p.cool <= 0 && !S.homes[P.sp] && (p.state === 'look' || p.state === 'stroll') && dP < 8 && playerReachable && !this.list.some((q) => q.friend)) {
        p.state = 'notice'; p.timer = 1.3; busy = true;
        const nm = stageName(P.sp).toLowerCase();
        ui.bubble(p, Math.random() < 0.5 ? `Aww, ${/^[aeiou]/.test(nm) ? 'an' : 'a'} ${nm}!` : 'Oh, hello there!', 2.2);
      }
      // your own person comes to say hi
      if (P && dayTime && p.owns === P.sp && !p.friend && dP < 8 && playerReachable) { p.friend = true; p.state = 'friend'; ui.bubble(p, `There you are, ${nameOf(P.sp)}!`, 2.6); }
      this.pose(p, dt, crouch, reach, camPos);
    }
  },
  // a shop in your own town, not too far to walk to
  shopNear(p) {
    const town = p.house && p.house.town ? p.house.town : 'Maple Town';
    const list = G.world.houses.filter((h) => h.kind === 'shop' && h.town === town && Math.hypot(h.door.x - p.pos.x, h.door.z - p.pos.z) < 90);
    return list.length ? list[(Math.random() * list.length) | 0] : null;
  },
  giveUp(p, wave) { p.state = 'look'; p.timer = 1.5; p.cool = 45; if (wave) G.ui.bubble(p, 'Bye bye!', 1.8); },
  pose(p, dt, crouch, reach, camPos) {
    p.pos.y = G.world.H(p.pos.x, p.pos.z) + (p.yOff || 0);
    p.crouch = damp(p.crouch, crouch, 5, dt); p.reach = damp(p.reach, reach, 5, dt);
    const r = p.rig.root; r.position.copy(p.pos); r.rotation.y = p.yaw;
    const dist = Math.hypot(p.pos.x - camPos.x, p.pos.z - camPos.z);
    r.visible = !p.away && dist < 140;
    if (p.rig.lod) p.rig.lod(dist);
    if (dist < 80) { const st = p.st; st.t = G.t; st.speed = p.speed; st.crouch = p.crouch; st.reach = p.reach; st.sit = p.sit || 0; st.seatY = p.seatY; p.rig.update(dt, st); }
  },
  // a visitor at the pound comes to your kennel, kneels and holds out a hand; walk out to them to go home with them
  visitorStep(p, dt, P, dP, greet) {
    let crouch = 0, reach = 0;
    const pen = p.pen, front = pen && pen.entry;
    if (p.state === 'approach') {
      const d = this.walkTo(p, dt, front ? front.x : P.pos.x, front ? front.z : P.pos.z, 1.1);
      if (d < (front ? 0.5 : greet + 0.4)) { p.state = 'kneel'; p.timer = 16; G.ui.bubble(p, 'Aww, look at you!', 2.4); if (pen) Homes.kennelDoor(pen, true); }
    } else if (p.state === 'kneel') {
      p.speed = damp(p.speed, 0, 8, dt); this.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 1; p.timer -= dt;
      if (dP < greet + 0.35) { p.state = 'greet'; p.timer = 2.8; G.ui.hearts(P.pos, 3); if (G.sound) G.sound.call(P); }
      else if (p.timer <= 0 && p.ownerCome) { p.timer = 10; G.ui.bubble(p, 'Come here! Let\'s go home.', 2.2); }
      else if (p.timer <= 0) { p.state = 'leave'; G.ui.bubble(p, 'Maybe next time.', 2); }
    } else if (p.state === 'greet') {
      p.speed = 0; this.face(p, dt, P.pos.x, P.pos.z); crouch = 1; reach = 0.8; p.timer -= dt;
      if (p.timer > 1.3 && p.timer - dt <= 1.3) G.ui.hearts(P.pos, 3);
      if (dP > greet + 3) { if (p.ownerCome) { p.state = 'kneel'; p.timer = 10; } else p.state = 'leave'; }
      else if (p.timer <= 0) { if (p.ownerCome) { p.state = 'done'; Town.goHomeWith(p); } else Homes.adopt(p); }
    } else if (p.state === 'leave') { const ex = p.room.exit; const d = this.walkTo(p, dt, ex.x, ex.z, 1.2); if (d < 0.7) { this.remove(p); return; } }
    this.pose(p, dt, crouch, reach, G.camera.position);
  },
  // the pound helper at the desk and the vet stay put and turn to watch you
  staffStep(p, dt, P, dP) {
    p.speed = 0;
    if (P && dP < 6) this.face(p, dt, P.pos.x, P.pos.z);
    this.pose(p, dt, 0, 0, G.camera.position);
  },
  cancel(p) { if (p.visitor) p.state = 'leave'; else if (p.state === 'notice' || p.state === 'kneel' || p.state === 'greet' || p.state === 'lead') this.giveUp(p, false); },
};

/* ---------- homes: adoption, going in and out, cages, the pound and the vet ---------- */
// pets that live in a cage or tank at home, like real ones do
const CAGED = { lizard: 'terrarium', snake: 'terrarium', frog: 'terrarium', turtle: 'terrarium', parrot: 'birdCage', bunny: 'hutch', hedgehog: 'hutch' };
const CAGE_WORDS = { terrarium: 'a glass tank', birdCage: 'a big bird cage', hutch: 'a cozy pen' };
const Homes = {
  penT: 0, kennel: null,
  village() { return G.world.houses.filter((h) => h.village); },
  // what color a village house is painted
  color(h, i) { return (h && HOUSE_COLOR_NAMES[h.variant]) || HOUSE_COLOR_NAMES[i] || 'white'; },
  homeOf(sp) {
    const hm = S.homes[sp]; if (!hm || G.world.id !== 'land') return null;
    return this.village()[hm.house] || null;
  },
  adopt(p) {
    const P = Player.b, sp = P.sp, w = G.world;
    // pick a house in the village for this person
    let houseIdx = 0;
    const homes = w.id === 'land' ? this.village() : [];
    const used = new Set(Object.values(S.homes).map((h) => h.house));
    if (p.house && homes.includes(p.house)) houseIdx = homes.indexOf(p.house);
    else { for (let i = 0; i < homes.length; i++) if (!used.has(i)) { houseIdx = i; break; } }
    // an outdoor animal needs a house with a pen out back (not every house in town has one)
    if (SPECIES[sp].outdoor && homes.length && !(homes[houseIdx] && homes[houseIdx].pen)) {
      const h0 = homes[houseIdx] || homes[0];
      let best = -1, bd = 1e9;
      homes.forEach((h, i) => { if (!h.pen) return; const d = Math.hypot(h.x - h0.x, h.z - h0.z) + (used.has(i) ? 500 : 0); if (d < bd) { bd = d; best = i; } });
      if (best >= 0) houseIdx = best;
    }
    S.homes[sp] = { name: p.name, look: p.look, house: Math.max(0, houseIdx) };
    S.leaves += 5;
    const hh = homes[Math.max(0, houseIdx)], street = (hh && hh.street) || 'Maple Street';
    const outdoor = SPECIES[sp].outdoor, color = Homes.color(hh, houseIdx), cage = CAGED[sp];
    G.ui.bubble(p, `Welcome to the family, ${nameOf(sp)}! Here's your collar.`, 3);
    G.ui.hearts(P.pos, 6); G.ui.leafPop(P.pos, 5);
    // a tamed animal always wears a collar with its person's number on it
    const got = `${p.name} took you home and put a collar on you!`;
    G.ui.toast(outdoor ? `${got} Your home is the pen behind the ${color} house on ${street}.`
      : cage ? `${got} You live in ${CAGE_WORDS[cage]} in the ${color} house on ${street}.`
        : `${got} You're an indoor pet in the ${color} house on ${street}.`, 6000);
    if (G.sound) G.sound.chime();
    Town.collar(P);
    if (p.visitor) { p.visitor = false; p.house = homes[S.homes[sp].house] || null; if (p.pen) this.kennelDoor(p.pen, true); }
    p.owns = sp; p.friend = true; p.state = 'friend'; p.offerT = 10; p.petT = 6;
    G.save();
  },
  // walk through a door
  enter(house) {
    const P = Player.b, w = G.world, rm = w.ensureRoom(house);
    if (!rm) return false;
    P.room = rm; P.mode = 'ground'; P.tree = null;
    P.pos.set(rm.spawn.x, 0, rm.spawn.z); P.yaw = rm.spawn.yaw; P.speed = 0;
    w.setRoom(rm);
    G.ui.enteredRoom(rm);
    w.openDoor(rm.group, 0.5);
    // your person comes inside with you
    for (const p of Folk.list) if (p.friend && Math.hypot(p.pos.x - house.door.x, p.pos.z - house.door.z) < 25) {
      Folk.teleport(p, rm.spawn.x + 0.9, rm.spawn.z - 0.6, rm); p.state = 'friend';
    }
    if (rm.pound) {
      Wild.spawnPound(rm);
      if (rm.desk) Folk.make('Pat', { skin: SKIN[2], hair: HAIR[4], hairStyle: 1, shirt: '#3E8E6E', pants: PANTS[0], shoes: SHOES[0], height: 1.68 }, rm.desk.x, rm.desk.z, { staff: true, room: rm });
      if (rm.vet) Folk.make('Dr. Rosa', { skin: SKIN[1], hair: HAIR[0], hairStyle: 2, shirt: '#E8E2D4', pants: '#55606B', shoes: SHOES[2], height: 1.64 }, rm.vet.x + 0.9, rm.vet.z + 0.4, { staff: true, room: rm, vetDoc: true });
      for (const pn of rm.pens) this.kennelDoor(pn, true);
    }
    if (rm.barn) Wild.spawnBarn(rm);
    const home = this.homeOf(P.sp) === house;
    if (home && rm.bowl) this.fillBowl(rm);
    if (home) this.setupCage(rm, P.sp); else if (rm.cage) this.removeCage(rm);
    if (G.sound) G.sound.door();
    G.save();
    return true;
  },
  exit() {
    const P = Player.b, w = G.world, rm = P.room; if (!rm) return;
    const house = rm.house, d = house.door;
    P.room = null; w.setRoom(null);
    P.pos.set(d.x, w.H(d.x, d.z), d.z); P.yaw = d.yaw; P.speed = 0; P.mode = 'ground';
    G.ui.enteredRoom(null);
    for (const p of Folk.list.slice()) {
      if (p.room === rm) {
        if (p.staff || p.visitor) Folk.remove(p);
        else if (p.friend) Folk.teleport(p, d.x + Math.sin(d.yaw) * 1.5 + 0.8, d.z + Math.cos(d.yaw) * 1.5);
      }
    }
    for (const b of Wild.list.filter((q) => q.caged && q.room === rm)) Wild.remove(b);
    if (house.group) w.openDoor(house.group, 0.7);
    this.kennel = null;
    if (G.sound) G.sound.door();
    G.save();
  },
  fillBowl(rm) {
    const day = nightNo();
    if (rm.bowlDay === day || Foods.list.some((f) => f.bowl === rm)) return;
    rm.bowlDay = day;
    const sp = SPECIES[Player.sp], land = sp.eats.filter((f) => !FOODS[f].water);
    const type = land.includes(sp.fav) ? sp.fav : (land[0] || sp.eats[0]);
    const f = Foods.add(type, rm.bowl.x, rm.bowl.z, 0.06, true);
    f.bowl = rm;
  },
  /* cages and tanks at home for pets that live in one */
  setupCage(rm, sp) {
    const kind = CAGED[sp];
    if (rm.cage && rm.cage.kind === kind) return rm.cage;
    if (rm.cage) this.removeCage(rm);
    if (!kind || !Env[kind]) return null;
    const w = G.world, obj = Env[kind](), ud = obj.userData;
    const spot = rm.cageSpot || (rm.petBed ? { x: rm.petBed.x, z: rm.petBed.z + 1.2, yaw: 0 } : { x: rm.ox, z: 0, yaw: 0 });
    const yaw = spot.yaw || 0, co = Math.cos(yaw), si = Math.sin(yaw);
    const W = (lx, lz) => ({ x: spot.x + lx * co + lz * si, z: spot.z - lx * si + lz * co });
    obj.position.set(spot.x - rm.ox, 0, spot.z - rm.oz); obj.rotation.y = yaw;
    obj.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    rm.group.add(obj);
    const colW = (c) => { const p = W(c.x, c.z); return c.box ? { box: true, x: p.x, z: p.z, hw: c.hw, hd: c.hd, rot: yaw + (c.rot || 0) } : { x: p.x, z: p.z, r: c.r }; };
    const cols = (ud.colliders || []).map((c) => w.addCollider(colW(c), null));
    const doorCol = ud.doorCollider ? w.addCollider(colW(ud.doorCollider), null) : null;
    if (doorCol) doorCol.off = true;
    const ins = ud.inside || { x: 0, z: 0, hw: 0.4, hd: 0.3 };
    rm.cage = { kind, obj, cols, doorCol, yaw, center: W(ins.x, ins.z), hw: ins.hw, hd: ins.hd, entry: ud.entry ? W(ud.entry.x, ud.entry.z) : W(0, (ud.d || 1) / 2 + 0.5), open: true, floor: kind === 'birdCage' ? 0.05 : 0 };
    w.doorTo(obj, undefined, true);
    return rm.cage;
  },
  removeCage(rm) {
    const c = rm.cage; if (!c) return;
    for (const q of c.cols) G.world.removeCollider(q);
    if (c.doorCol) G.world.removeCollider(c.doorCol);
    rm.group.remove(c.obj);
    rm.cage = null;
  },
  inCage(rm, pos) {
    const c = rm && rm.cage; if (!c) return false;
    const dx = pos.x - c.center.x, dz = pos.z - c.center.z, co = Math.cos(c.yaw), si = Math.sin(c.yaw);
    const lx = dx * co - dz * si, lz = dx * si + dz * co;
    return Math.abs(lx) < c.hw + 0.05 && Math.abs(lz) < c.hd + 0.05;
  },
  cageDoor(rm, open) {
    const c = rm && rm.cage; if (!c || c.open === open) return;
    c.open = open; if (c.doorCol) c.doorCol.off = open;
    G.world.doorTo(c.obj, undefined, open);
  },
  /* kennels at the pound */
  kennelDoor(pen, open) {
    if (!pen || pen.door === undefined || pen.door === null) return;
    const rm = Player.b && Player.b.room; if (!rm || !rm.pound) return;
    pen.open = open; if (pen.doorCol) pen.doorCol.off = open;
    G.world.doorTo(rm.group, pen.door, open);
  },
  penAt(rm, pos) { return rm && rm.pens ? rm.pens.find((pn) => Math.abs(pos.x - pn.x) < pn.w / 2 && Math.abs(pos.z - pn.z) < pn.d / 2) || null : null; },
  // wait in a kennel at the pound and visitors come to meet you
  update(dt) {
    const P = Player.b; if (!P || !P.room) { this.penT = 0; return; }
    const rm = P.room;
    if (rm.cage) {
      // the cage door stands open while you're awake; it closes while you sleep in it
      if (P.mode !== 'sleep') this.cageDoor(rm, true);
    }
    if (!rm.pound) { this.penT = 0; return; }
    const pen = this.penAt(rm, P.pos);
    if (pen && pen !== this.kennel) { this.kennel = pen; this.shutT = 2.2; }
    if (!pen) this.kennel = null;
    if (pen && pen.open !== false && this.shutT > 0) { this.shutT -= dt; if (this.shutT <= 0 && !Folk.list.some((p) => p.visitor)) { this.kennelDoor(pen, false); if (!this.toldKennel) { this.toldKennel = true; G.ui.toast('You are in a kennel. Visitors come here to meet animals who need a home.', 4200); } } }
    if (pen && G.night < 0.5 && !S.homes[P.sp] && !Folk.list.some((p) => p.visitor)) {
      this.penT += dt;
      if (this.penT > 8) {
        this.penT = 0;
        const v = Folk.make(Town.freeName(), Folk.randomLook(Math.random() < 0.4), rm.exit.x, rm.exit.z, { visitor: true, room: rm, state: 'approach', pen });
        G.ui.bubble(v, 'Hello!', 1.8);
      }
    } else this.penT = Math.max(0, this.penT - dt);
  },
  letOut() { const P = Player.b, pen = P && this.penAt(P.room, P.pos); if (pen) { this.kennelDoor(pen, true); this.shutT = 0; const pat = Folk.list.find((p) => p.staff && !p.vetDoc); if (pat) G.ui.bubble(pat, 'There you go!', 1.8); } },
  vet() {
    S.sick = 0; Player.emptyT = 0;
    const doc = Folk.list.find((p) => p.vetDoc);
    if (doc) G.ui.bubble(doc, 'All better! Remember to eat your food.', 3);
    G.ui.hearts(Player.pos, 4); G.ui.toast('The vet made you all better!');
    if (G.sound) G.sound.chime();
    G.save();
  },
  trickOrTreat(house) {
    S.treats[house.id] = nightNo();
    const d = house.door, w = G.world;
    if (house.group) w.openDoor(house.group, 2.6);
    const p = Folk.make(PEOPLE_NAMES[(hash2(house.id, 3, 9) * PEOPLE_NAMES.length) | 0], Folk.randomLook(false), d.x - Math.sin(d.yaw) * 0.6, d.z - Math.cos(d.yaw) * 0.6, { staff: true, yaw: d.yaw });
    p.yaw = d.yaw;
    G.ui.bubble(p, 'Happy Halloween! Here is a treat!', 2.8);
    if (G.sound) G.sound.knock();
    setTimeout(() => { if (Folk.list.includes(p)) Folk.remove(p); }, 3200);
    for (let i = 0; i < 2; i++) { const x = d.x + Math.sin(d.yaw) * 0.6 + (i - 0.5) * 0.3, z = d.z + Math.cos(d.yaw) * 0.6; Foods.add('candy', x, z, w.H(x, z), true); }
    S.leaves += 3; G.ui.leafPop(Player.pos, 3);
    G.save();
  },
};
const HOUSE_COLOR_NAMES = ['white', 'yellow', 'blue', 'brick', 'gray', 'white'];

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
    if (FOODS[type] && FOODS[type].water) {
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
    const s = Player.b ? clamp(Player.m.length * 0.55, 0.32, 0.9) : 0.5;
    f.glowS = (f.gift ? 1.5 : 1) * s;
  },
  refresh() { for (const f of this.list) this.refreshOne(f); },
  consume(f) {
    if (f.gone) return;
    this.removeObj(f);
    this.list.splice(this.list.indexOf(f), 1);
    const sp = SPECIES[Player.sp], fav = f.type === sp.fav, n = f.type === 'candy' ? 3 : fav ? 2 : 1;
    S.leaves += n; S.hunger = Math.min(100, S.hunger + (fav ? 22 : 13));
    if (S.sick > 0) { S.sick = Math.max(0, S.sick - 0.18); if (S.sick === 0) G.ui.toast('You feel all better!'); }
    // growing up
    const before = ageOf(Player.sp);
    if (before < 1) {
      const after = Math.min(1, before + (fav ? 2 : 1) / 45);
      S.ages[Player.sp] = after;
      Player.grow();
      if (before < 0.4 && after >= 0.4) G.ui.toast(`You're getting bigger! You're a young ${sp.name.toLowerCase()} now.`);
      if (sp.fly && before < FLY_AGE && after >= FLY_AGE) G.ui.toast('Your wings are strong now. You can fly! Jump, then jump again in the air.', 5000);
      if (after >= 1 && before < 1) { G.ui.toast(`You're all grown up!`); G.ui.hearts(Player.pos, 5); }
      Foods.refresh();
    }
    G.ui.leafPop(tmpV.set(f.x, f.y, f.z), n);
    if (G.sound) { G.sound.eat(); G.sound.leaf(n); }
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
    // keep a ring of food around the player (not indoors)
    this.tick -= dt;
    if (this.tick <= 0 && !P.room) { this.tick = 0.5; this.fill(3); }
  },
  fill(maxAdd) {
    const P = Player.b, w = G.world; if (!P || P.room) return;
    const m = P.m, r0 = Math.max(2.2, m.length * 3.5), r1 = clamp(m.length * 26 + 10, 15, 42);
    for (let i = this.list.length - 1; i >= 0; i--) {
      const f = this.list[i];
      if (f.gift) continue;
      if (Math.hypot(f.x - P.pos.x, f.z - P.pos.z) > r1 * 1.7) { this.removeObj(f); this.list.splice(i, 1); }
    }
    const weights = Object.entries(w.def.foods).filter(([, n]) => n > 0);
    const outdoors = this.list.filter((f) => !f.bowl && f.x < World.ROOM_X - 20);
    const land = outdoors.filter((f) => !f.fish).length, fish = outdoors.length - land;
    const sp = SPECIES[P.sp];
    let added = 0;
    for (let k = 0; k < 12 && added < maxAdd; k++) {
      const wantFish = !!w.def.water && fish + added < 6 && Math.random() < 0.35;
      if (!wantFish && land + added >= 34) break;
      let pool = weights.filter(([t]) => !!FOODS[t].water === wantFish);
      if (!pool.length) continue;
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
