/* ---------- game: renderer, camera, input, time of day, UI, saves ---------- */
const ASSETS = window.AA_ASSETS || { icons: {}, worlds: {} };
const cv = $('world');
const LEAF_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 20C4 10 10 4 20 4C20 14 14 20 4 20Z" fill="#5DBB4E" stroke="#1D3124" stroke-width="2" stroke-linejoin="round"/><path d="M4 20L16 8M9 15V11M12 12V8.5M9 15H13M12 12H15.5" stroke="#1D3124" stroke-width="1.5" stroke-linecap="round" fill="none"/></svg>';
const HEART_SVG = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21C5 15.5 2 12.3 2 8.4 2 5.4 4.3 3 7.2 3c1.9 0 3.6 1 4.8 2.6C13.2 4 14.9 3 16.8 3 19.7 3 22 5.4 22 8.4c0 3.9-3 7.1-10 12.6Z" fill="#E85C9C" stroke="#1D3124" stroke-width="2" stroke-linejoin="round"/></svg>';

let renderer = null;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cv, antialias: true, powerPreference: 'high-performance' });
} catch (e) {
  $('titleBody').innerHTML = '<h2>This device can\'t show 3D</h2><p>Animal Adventures needs WebGL. Try a newer browser, or turn on hardware acceleration in the browser settings.</p>';
  throw e;
}
renderer.outputEncoding = THREE.sRGBEncoding;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, 1, 0.05, 1500);
G.scene = scene; G.camera = camera; G.sound = Sound;
scene.fog = new THREE.Fog(0xbfdcef, 40, 200);
const sun = new THREE.DirectionalLight(0xfff4e0, 2);
sun.castShadow = true;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a6a3a, 0.8);
scene.add(hemi);
// a warm lamp for whichever room you are in (always in the scene so shaders never recompile)
const lamp = new THREE.PointLight(0xffc98a, 0, 12, 1.6);
scene.add(lamp);
const sky = Env.sky(); scene.add(sky.mesh);
const clouds = Env.clouds(14, 460, 150); scene.add(clouds.group);
const flies = Env.fireflies(80); scene.add(flies.points);
const leaves = Env.fallingLeaves(140); scene.add(leaves.points);
Env.autumn(AUTUMN ? 0.9 : 0);
let skyExtras = null;

const Q = { pr: Math.min(window.devicePixelRatio || 1, 1.6), shadow: 2048, level: 0 };
if (Math.min(screen.width, screen.height) < 500) Q.pr = Math.min(Q.pr, 1.4);
function applyQuality() {
  renderer.setPixelRatio(Q.pr);
  if (sun.shadow.mapSize.x !== Q.shadow) { sun.shadow.mapSize.set(Q.shadow, Q.shadow); if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; } }
  resize();
}
function resize() {
  const w = cv.clientWidth || innerWidth, h = cv.clientHeight || innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

/* ---------- worlds ---------- */
const R = { mode: 'title', paused: false, sheet: null, shopTab: 'animals', pack: null, gc: [7, 8], saveT: 5, wasNight: null, loading: false, hatch: null, sleeping: 0, naming: null, action: null, doorSeq: null };
function loadWorld(id) {
  if (G.world) { scene.remove(G.world.group); Wild.clear(); Folk.clear(); Foods.clear(); G.world.dispose(); }
  const w = World.build(id); G.world = w; scene.add(w.group);
  scene.fog.near = w.def.fog[0]; scene.fog.far = w.def.fog[1];
  if (skyExtras) { scene.remove(skyExtras.group); skyExtras = null; }
  if (w.def.islands) {
    const g = new THREE.Group();
    const sea = Env.cloudSea(2600, -34); g.add(sea.mesh);
    const low = Env.clouds(12, 200, 16); g.add(low.group);
    const rb = Env.rainbow(170); rb.position.set(40, -45, -260); g.add(rb);
    scene.add(g);
    skyExtras = { group: g, sea, low };
  }
  Wild.spawn(w); Folk.spawn(w); Town.spawn(w);
  S.world = id;
}

/* ---------- camera ---------- */
const Cam = { yaw: Math.PI, pitch: 0.36, zoom: 1, target: new V3(), userT: 0, snap: true };
const camTmp = new V3(), camDir = new V3(), camRay = new THREE.Raycaster(), camNear = [];
// pull the camera in front of walls and fences that would hide the animal
function camBlock(x, y, z, dist) {
  const bl = G.world.blockers, t = Cam.target; if (!bl || !bl.length) return 1;
  camNear.length = 0;
  for (const o of bl) if (Math.abs(o.x - t.x) < o.r + dist + 0.5 && Math.abs(o.z - t.z) < o.r + dist + 0.5) camNear.push(o.o);
  if (!camNear.length) return 1;
  camDir.set(x - t.x, y - t.y, z - t.z); const L = camDir.length(); if (L < 0.01) return 1;
  camDir.divideScalar(L); camRay.set(t, camDir); camRay.far = L;
  const hit = camRay.intersectObjects(camNear, true)[0];
  return hit ? Math.max(0.12, (hit.distance - Math.max(0.08, L * 0.06)) / L) : 1;
}
function followCamera(dt) {
  const b = Player.b, m = b.m, H = G.world.H, room = b.room;
  const base = clamp(m.length * 1.35 + m.height * 1.5 + 0.75, 1.15, 8.5);
  let dist = base * Cam.zoom;
  const ty = b.pos.y + (b.mode === 'climb' ? m.length * 0.4 : m.eye * 0.8) + 0.05;
  if (Cam.snap) { Cam.target.set(b.pos.x, ty, b.pos.z); Cam.yaw = b.yaw; Cam.snap = false; }
  // when a person is talking to us, pull back so both fit on screen
  let fx0 = b.pos.x, fz0 = b.pos.z, fy0 = ty, minD = 0;
  const talker = Folk.list.find((p) => (p.state === 'kneel' || p.state === 'greet' || p.state === 'offer' || p.state === 'pet') && p.room === room && p.pos.distanceTo(b.pos) < 4);
  if (talker) {
    fx0 = lerp(b.pos.x, talker.pos.x, 0.45); fz0 = lerp(b.pos.z, talker.pos.z, 0.45); fy0 = lerp(ty, talker.pos.y + talker.rig.height * 0.5, 0.5); minD = talker.rig.height * 1.7;
    if (Cam.userT <= 0) Cam.yaw += angDiff(Cam.yaw, Math.atan2(talker.pos.x - b.pos.x, talker.pos.z - b.pos.z) + 0.35) * (1 - Math.exp(-2.5 * dt));
  }
  if (R.hatch) { minD = Math.max(minD, 1.1); }
  Cam.frame = damp(Cam.frame || 0, minD, 3, dt);
  Cam.target.x = damp(Cam.target.x, fx0, 14, dt); Cam.target.z = damp(Cam.target.z, fz0, 14, dt); Cam.target.y = damp(Cam.target.y, fy0, 8, dt);
  Cam.userT -= dt;
  const moving = b.mode === 'climb' ? Math.abs(b.speed) > 0.05 : b.speed > 0.25;
  if (!talker && Cam.userT <= 0 && moving && b.eat <= 0) Cam.yaw += angDiff(Cam.yaw, b.yaw) * (1 - Math.exp(-(b.mode === 'fly' ? 1.6 : 1.1) * dt));
  dist = Math.max(dist, Cam.frame || 0);
  if (room) dist = Math.min(dist, room.barn ? 6 : room.school ? 4.5 : 3.2);
  let pitch = Cam.pitch;
  if (b.mode === 'fly') pitch = clamp(pitch + b.vy * 0.03, 0.05, 1.2);
  if (b.mode === 'climb') pitch = clamp(pitch - 0.25, -0.1, 1.0);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw);
  let x = Cam.target.x - fx * cp * dist, z = Cam.target.z - fz * cp * dist, y = Cam.target.y + sp * dist;
  if (room) {
    x = clamp(x, room.ox - room.w / 2 + 0.3, room.ox + room.w / 2 - 0.3); z = clamp(z, room.oz - room.d / 2 + 0.3, room.oz + room.d / 2 - 0.3);
    y = clamp(y, 0.3, room.wallH - 0.25);
  } else {
    const gh = H(x, z), floor = Math.max(gh > -100 ? gh : -1e9, G.world.def.water ? WATER : -1e9) + Math.max(0.12, m.height * 0.45);
    if (y < floor) y = floor;
    const k = camBlock(x, y, z, dist);
    Cam.block = k < (Cam.block || 1) ? k : damp(Cam.block || 1, k, 2.5, dt);
    if (Cam.block < 0.999) { x = Cam.target.x + (x - Cam.target.x) * Cam.block; y = Cam.target.y + (y - Cam.target.y) * Cam.block; z = Cam.target.z + (z - Cam.target.z) * Cam.block; }
  }
  camera.position.set(x, y, z);
  camera.lookAt(Cam.target);
  G.camYaw = Cam.yaw;
  const near = clamp(dist * 0.03, 0.025, 0.25);
  if (Math.abs(camera.near - near) > 0.005) { camera.near = near; camera.updateProjectionMatrix(); }
}
function titleCamera() {
  const w = G.world, s = w.def.spawn, a = G.t * 0.04;
  const tx = s[0], tz = s[1], ty = Math.max(w.H(tx, tz), WATER) + 1.6;
  let x = tx + Math.sin(a) * 18, z = tz + Math.cos(a) * 18;
  let y = Math.max(w.H(x, z) > -100 ? w.H(x, z) : ty, WATER) + 6;
  camera.position.set(x, y, z); camTmp.set(tx, ty, tz); camera.lookAt(camTmp);
  G.camYaw = Math.atan2(tx - x, tz - z);
  if (camera.near !== 0.1) { camera.near = 0.1; camera.updateProjectionMatrix(); }
}

/* ---------- input ---------- */
const keys = {};
const inp = { mx: 0, mz: 0, ix: 0, iy: 0, walk: false, jump: false, up: false, down: false, eat: false, climb: null, letGo: false };
const press = { jump: false, eat: false, jumpHeld: false, landHeld: false, act: false, call: false };
const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const looks = new Map();
let pinch = null;
const touchEl = $('touch');
const STICK_R = 54;
// sound can only start after the first tap or key press
const wake = () => { Sound.resume(); Sound.setOn(S.sound !== false); Sound.setMusic(S.music !== false); };
window.addEventListener('pointerdown', wake, { passive: true }); window.addEventListener('keydown', wake);
touchEl.addEventListener('pointerdown', (e) => {
  if (R.mode !== 'play' || R.paused) return;
  e.preventDefault();
  try { touchEl.setPointerCapture(e.pointerId); } catch (err) {}
  if (e.pointerType !== 'mouse' && e.clientX < innerWidth * 0.45 && stick.id === null) {
    stick.id = e.pointerId; stick.ox = e.clientX; stick.oy = e.clientY; stick.dx = 0; stick.dy = 0;
    const s = $('stick'); s.hidden = false; s.style.transform = `translate(${e.clientX}px,${e.clientY}px)`; $('knob').style.transform = '';
    $('stickHint').hidden = true;
  } else {
    looks.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (looks.size === 2) { const [a, b] = [...looks.values()]; pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), z: Cam.zoom }; }
  }
});
touchEl.addEventListener('pointermove', (e) => {
  if (e.pointerId === stick.id) {
    let dx = e.clientX - stick.ox, dy = e.clientY - stick.oy; const d = Math.hypot(dx, dy);
    if (d > STICK_R) { dx *= STICK_R / d; dy *= STICK_R / d; }
    stick.dx = dx; stick.dy = dy; $('knob').style.transform = `translate(${dx}px,${dy}px)`;
    return;
  }
  const l = looks.get(e.pointerId); if (!l) return;
  const dx = e.clientX - l.x, dy = e.clientY - l.y; l.x = e.clientX; l.y = e.clientY;
  if (looks.size >= 2 && pinch) {
    const [a, b] = [...looks.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
    Cam.zoom = clamp(pinch.z * pinch.d / Math.max(20, d), 0.55, 2.4); return;
  }
  const k = e.pointerType === 'mouse' ? 0.006 : 0.008;
  Cam.yaw -= dx * k; Cam.pitch = clamp(Cam.pitch + dy * k * 0.7, -0.15, 1.25); Cam.userT = 2.5;
});
const endPointer = (e) => {
  if (e.pointerId === stick.id) { stick.id = null; stick.dx = stick.dy = 0; $('stick').hidden = true; }
  looks.delete(e.pointerId); if (looks.size < 2) pinch = null;
};
touchEl.addEventListener('pointerup', endPointer); touchEl.addEventListener('pointercancel', endPointer);
touchEl.addEventListener('wheel', (e) => { if (R.mode !== 'play') return; e.preventDefault(); Cam.zoom = clamp(Cam.zoom * Math.exp(e.deltaY * 0.0012), 0.55, 2.4); }, { passive: false });
touchEl.addEventListener('contextmenu', (e) => e.preventDefault());
function holdButton(id, on, off) {
  const el = $(id);
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.classList.add('held'); try { el.setPointerCapture(e.pointerId); } catch (err) {} on(); });
  const up = () => { el.classList.remove('held'); if (off) off(); };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); on(); setTimeout(up, 150); } });
}
holdButton('btnJump', () => { press.jump = true; press.jumpHeld = true; }, () => { press.jumpHeld = false; });
holdButton('btnEat', () => { press.eat = true; });
holdButton('btnLand', () => { press.landHeld = true; }, () => { press.landHeld = false; });
holdButton('btnAct', () => { press.act = true; });
holdButton('btnCall', () => { press.call = true; });
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'walk', ShiftRight: 'walk', Space: 'jump', KeyE: 'eat', KeyC: 'land', KeyQ: 'land', KeyF: 'act', Enter: 'act', KeyV: 'call' };
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && R.sheet) { closeSheet(); return; }
  if (R.mode !== 'play' || R.paused || e.target.tagName === 'INPUT') return;
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault();
  if (!e.repeat) { if (k === 'jump') press.jump = true; if (k === 'eat') press.eat = true; if (k === 'act') press.act = true; if (k === 'call') press.call = true; }
  keys[k] = true;
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; press.jumpHeld = press.landHeld = false; });
function readInput() {
  let ix = 0, iy = 0;
  if (stick.id !== null) { ix = stick.dx / STICK_R; iy = -stick.dy / STICK_R; const m = Math.hypot(ix, iy); if (m < 0.12) { ix = 0; iy = 0; } }
  const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ky = (keys.f ? 1 : 0) - (keys.b ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); ix = kx / m; iy = ky / m; }
  const held = Town.busy();
  if (R.hatch || R.sleeping > 0 || R.doorSeq || held) { ix = 0; iy = 0; }
  const fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw), rx = -Math.cos(Cam.yaw), rz = Math.sin(Cam.yaw);
  inp.mx = fx * iy + rx * ix; inp.mz = fz * iy + rz * ix; inp.ix = ix; inp.iy = iy;
  inp.walk = !!keys.walk;
  inp.jump = press.jump && !R.hatch && !held; press.jump = false;
  inp.up = press.jumpHeld || !!keys.jump;
  inp.down = press.landHeld || !!keys.land;
  inp.eat = press.eat && !R.hatch && !held; press.eat = false;
  inp.climb = null; inp.letGo = false;
}

/* ---------- things you can do right here (the context button) ---------- */
function findAction() {
  const b = Player.b, w = G.world; if (!b) return null;
  if (R.hatch) return R.hatch.done ? null : { id: 'hatch', label: 'Tap to hatch!' };
  if (R.sleeping > 0 || R.doorSeq || Town.busy()) return null;
  if (b.mode === 'climb' || b.mode === 'perch') return { id: 'letgo', label: 'Let go' };
  const sp = SPECIES[b.sp], home = Homes.homeOf(b.sp), reach = 0.9 + b.m.radius;
  if (b.room) {
    const rm = b.room;
    if (Math.hypot(b.pos.x - rm.exit.x, b.pos.z - rm.exit.z) < rm.exit.r + 0.45 + b.m.radius) return { id: 'out', label: 'Go out' };
    if (home && home.room === rm) {
      if (rm.cage) { if (Homes.inCage(rm, b.pos)) return { id: 'sleep', label: 'Sleep' }; }
      else if (rm.petBed && Math.hypot(b.pos.x - rm.petBed.x, b.pos.z - rm.petBed.z) < reach + 0.2) return { id: 'sleep', label: 'Sleep' };
    }
    if (rm.barn && rm.petBed && Math.hypot(b.pos.x - rm.petBed.x, b.pos.z - rm.petBed.z) < reach + 0.4) return { id: 'sleep', label: 'Sleep' };
    if (rm.pound) { const pen = Homes.penAt(rm, b.pos); if (pen && pen.open === false) return { id: 'letout', label: 'Let me out' }; }
    if (rm.pound && rm.vet && S.sick > 0 && Math.hypot(b.pos.x - rm.vet.x, b.pos.z - rm.vet.z) < 2) return { id: 'vet', label: 'See the vet' };
    return null;
  }
  if (b.mode !== 'ground' && b.mode !== 'swim') return null;
  const fairPen = Town.playerPen();
  if (fairPen && !fairPen.open) return { id: 'letoutFair', label: 'Let me out' };
  for (const h of w.houses) {
    const barn = h.kind === 'barn';
    if (Math.hypot(b.pos.x - h.door.x, b.pos.z - h.door.z) > (barn ? 2.6 : 1.7) + b.m.radius) continue;
    if (!barn && b.m.height > 1.15) return { id: 'big', label: 'Too big!' };
    if (barn && !h.room && !h.lazy) continue;
    if (home === h && !sp.outdoor) return { id: 'in', label: 'Go home', house: h };
    if (h.pound || barn) return { id: 'in', label: 'Go in', house: h };
    if (G.night >= 0.5) {
      if (HOLIDAY === 'halloween' && h.treat && S.treats[h.id] !== nightNo()) return { id: 'treat', label: 'Trick or treat!', house: h };
      return null;
    }
    return { id: 'in', label: 'Go in', house: h };
  }
  if (home && sp.outdoor && home.pen && Math.hypot(b.pos.x - home.pen.x, b.pos.z - home.pen.z) < 3.2) return { id: 'sleep', label: 'Sleep' };
  if (sp.climb && b.mode === 'ground') {
    const t = w.treeNear(b.pos.x, b.pos.z, 0.4 + b.m.radius);
    if (t && t.top - t.base > 0.8) return { id: 'climb', label: 'Climb', tree: t };
  }
  return null;
}
function doAction(a) {
  if (!a) return;
  Sound.click();
  switch (a.id) {
    case 'in': startDoor(a.house, 1); break;
    case 'out': startDoor(Player.b.room.house, -1); break;
    case 'letout': Homes.letOut(); break;
    case 'letoutFair': Town.letOutFair(); break;
    case 'sleep': startSleep(); break;
    case 'vet': Homes.vet(); break;
    case 'treat': Homes.trickOrTreat(a.house); break;
    case 'climb': inp.climb = a.tree; break;
    case 'letgo': inp.letGo = true; break;
    case 'hatch': tapHatch(); break;
    case 'big': UI.toast(`A ${SPECIES[Player.b.sp].name.toLowerCase()} is too big to fit through the door!`); break;
  }
}

/* ---------- doors: the door swings open, you step through, a quick fade, and you're on the other side ---------- */
function startDoor(house, dir) {
  if (R.doorSeq || !house) return;
  const w = G.world;
  if (dir > 0 && !w.ensureRoom(house)) { UI.toast('This door is locked.'); return; }
  if (dir > 0) w.openDoor(house.group, 1.7); else w.openDoor(Player.b.room.group, 1.4);
  if (G.sound) Sound.door();
  R.doorSeq = { t: 0, house, dir, faded: false, done: false };
}
function updateDoorSeq(dt) {
  const q = R.doorSeq; if (!q) return;
  q.t += dt;
  const b = Player.b, h = q.house;
  if (!q.done && q.t > 0.25) {
    // step toward the doorway
    const tx = q.dir > 0 ? h.x : b.room ? b.room.exit.x : b.pos.x, tz = q.dir > 0 ? h.z : b.room ? b.room.exit.z + 1 : b.pos.z;
    const dx = tx - b.pos.x, dz = tz - b.pos.z, d = Math.hypot(dx, dz) || 1, v = Math.min(b.m.walk, 1.6) * dt;
    b.yaw += angDiff(b.yaw, Math.atan2(dx, dz)) * Math.min(1, dt * 8);
    b.pos.x += (dx / d) * v; b.pos.z += (dz / d) * v; b.speed = Math.min(b.m.walk, 1.6);
  }
  if (!q.faded && q.t > 0.5) { q.faded = true; $('fade').classList.add('quick', 'on'); }
  if (!q.done && q.t > 0.75) {
    q.done = true; b.speed = 0;
    if (q.dir > 0) Homes.enter(h); else Homes.exit();
    Cam.snap = true;
  }
  if (q.t > 0.85) $('fade').classList.remove('on');
  if (q.t > 1.15) { $('fade').classList.remove('quick'); R.doorSeq = null; }
}

/* ---------- sleeping ---------- */
function startSleep() {
  const b = Player.b, rm = b.room;
  if (rm && rm.cage && Homes.inCage(rm, b.pos)) Homes.cageDoor(rm, false);
  else if (rm && rm.petBed) { b.pos.set(rm.petBed.x, 0.06, rm.petBed.z); }
  b.mode = 'sleep'; b.speed = 0; R.sleeping = 2.8;
  $('fade').classList.add('on');
  UI.say('Zzz...', 2.4);
}
function wakeUp() {
  const night = dayInfo().night || G.night > 0.4;
  if (night) S.time = (Math.floor(S.time / CYCLE) + 1) * CYCLE + 40; else S.time += 150;
  R.wasNight = dayInfo().night;
  S.sick = 0; S.hunger = Math.max(S.hunger, 45); Player.emptyT = 0;
  const b = Player.b; b.mode = 'ground'; b.idle = 0;
  if (b.room) b.pos.y = 0;
  $('fade').classList.remove('on');
  UI.toast(night ? 'Good morning! You slept all night.' : 'What a nice nap!');
  if (b.room && b.room.bowl && Homes.homeOf(b.sp) && Homes.homeOf(b.sp).room === b.room) Homes.fillBowl(b.room);
  UI.saved(); save();
}

/* ---------- hatching and being born ---------- */
function beginLife(sp) {
  const b = Player.b;
  if (SPECIES[sp].egg) {
    b.rig.setVisible(false);
    const s = clamp(b.rig.height * 0.42 * 0.9, 0.06, 0.5);
    const nest = Env.nest(), egg = Env.egg(SPECIES[sp].egg, true);
    let x = b.pos.x, z = b.pos.z, y = b.pos.y;
    if (b.mode === 'swim') { const pt = G.world.ringPoint(x, z, 1, 20, false); if (pt) { x = pt.x; z = pt.z; y = pt.h; b.pos.set(x, y, z); b.mode = 'ground'; } }
    nest.scale.setScalar((s * 1.7) / 0.59); nest.position.set(x, y, z); scene.add(nest);
    egg.scale.setScalar(s); egg.position.set(x, y + s * 0.12, z); scene.add(egg);
    nest.traverse((o) => { if (o.isMesh) o.castShadow = true; }); egg.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    R.hatch = { sp, taps: 0, nest, egg, wob: 0, done: 0, s };
    Cam.snap = true; Cam.zoom = 1;
    UI.toast(`An egg! Tap the button to help your ${SPECIES[sp].baby.toLowerCase()} hatch.`, 4500);
  } else {
    UI.toast(`You were born! Hello, little ${SPECIES[sp].baby.toLowerCase()}! Eat to grow up.`, 4500);
    UI.hearts(b.pos, 5); Sound.chime();
    if (!S.hatched.includes(sp)) S.hatched.push(sp);
  }
}
function tapHatch() {
  const h = R.hatch; if (!h || h.done) return;
  h.taps++; h.wob = 1; Sound.crack();
  if (h.egg.userData.setCrack) h.egg.userData.setCrack(Math.min(1, h.taps / 6));
  if (h.taps >= 6) {
    h.done = 1.2; Sound.hatch();
    const b = Player.b; b.rig.setVisible(true);
    UI.hearts(b.pos, 6);
    UI.toast(`Hello, little ${SPECIES[h.sp].baby.toLowerCase()}! Eat to grow up.`, 4000);
    if (!S.hatched.includes(h.sp)) S.hatched.push(h.sp);
    save();
  }
}
function updateHatch(dt) {
  const h = R.hatch; if (!h) return;
  h.wob = damp(h.wob, 0, 4, dt);
  const idle = Math.sin(G.t * 2.2) > 0.94 ? 0.3 : 0;
  h.egg.rotation.z = Math.sin(G.t * 34) * 0.2 * Math.max(h.wob, idle);
  if (h.done) {
    h.done -= dt;
    const top = h.egg.userData.top; if (top) { top.position.y += dt * 0.9; top.rotation.z += dt * 3; }
    const bot = h.egg.userData.bottom; if (bot && h.done < 0.6) bot.visible = false;
    if (h.done <= 0) { scene.remove(h.egg); scene.remove(h.nest); R.hatch = null; }
  }
}

/* ---------- the toy ball in each house ---------- */
function updateBall(dt) {
  const b = Player.b, rm = b && b.room; if (!rm || !rm.ball) return;
  const ball = rm.ball;
  if (!ball.userData.v) { ball.userData.v = new V3(); ball.geometry.computeBoundingSphere(); ball.userData.r = ball.geometry.boundingSphere.radius * ball.scale.x; }
  const v = ball.userData.v, r = ball.userData.r || 0.1;
  const bx = rm.ox + ball.position.x, bz = rm.oz + ball.position.z;
  const dx = bx - b.pos.x, dz = bz - b.pos.z, d = Math.hypot(dx, dz);
  if (d < b.m.radius + r + 0.06 && d > 1e-3) { const push = Math.max(1.2, b.speed * 1.6); v.x = (dx / d) * push; v.z = (dz / d) * push; if (Math.random() < 0.3) Sound.click(); }
  ball.position.x += v.x * dt; ball.position.z += v.z * dt;
  const hw = rm.w / 2 - r - 0.1, hd = rm.d / 2 - r - 0.1;
  if (Math.abs(ball.position.x) > hw) { ball.position.x = Math.sign(ball.position.x) * hw; v.x *= -0.7; }
  if (Math.abs(ball.position.z) > hd) { ball.position.z = Math.sign(ball.position.z) * hd; v.z *= -0.7; }
  ball.rotation.x += (v.z * dt) / r; ball.rotation.z -= (v.x * dt) / r;
  v.multiplyScalar(Math.exp(-1.6 * dt));
}

/* ---------- time of day ---------- */
const sunDir = new V3(), moonDir = new V3(), lightDir = new V3(), center = new V3();
const C_DAY = new THREE.Color(0xfff2dc), C_DUSK = new THREE.Color(0xffa060), C_MOON = new THREE.Color(0x8aa0ff);
const H_DAY = new THREE.Color(0xbfdcff), H_NIGHT = new THREE.Color(0x3a4a8a), H_DUSK = new THREE.Color(0xd8b0c0), GR_DAY = new THREE.Color(0x5a6a3a), GR_NIGHT = new THREE.Color(0x151a14);
function dayInfo() {
  const tc = ((S.time % CYCLE) + CYCLE) % CYCLE, night = tc >= DAY_LEN;
  return { night, left: night ? CYCLE - tc : DAY_LEN - tc, tc };
}
function timeOfDay(dt, focus) {
  const { tc } = dayInfo();
  let e, az;
  if (tc < DAY_LEN) { const f = tc / DAY_LEN; e = Math.sin(Math.PI * f) * 1.0; az = -1.35 + 2.7 * f; }
  else { const f = (tc - DAY_LEN) / NIGHT_LEN; e = -Math.sin(Math.PI * f) * 0.8; az = 1.35 + (TAU - 2.7) * f; }
  const se = Math.sin(e);
  sunDir.set(Math.cos(e) * Math.sin(az), se, Math.cos(e) * Math.cos(az)).normalize();
  const day = smooth((se + 0.1) / 0.32);
  const dusk = (1 - smooth(Math.abs(se) / 0.3)) * (se > -0.2 ? 1 : 0);
  G.night = 1 - day;
  Env.setNight(clamp((G.night - 0.2) / 0.6, 0, 1));
  sky.update(sunDir, day, dusk);
  scene.fog.color.copy(sky.horizonColor); renderer.setClearColor(sky.horizonColor);
  const owl = Player.b && SPECIES[Player.sp].nightEyes && R.mode === 'play';
  if (se > 0) { lightDir.copy(sunDir); sun.intensity = 2.1 * smooth(se / 0.22); sun.color.copy(C_DAY).lerp(C_DUSK, dusk * 0.7); }
  else { moonDir.copy(sunDir).multiplyScalar(-1); lightDir.copy(moonDir); sun.intensity = (owl ? 0.7 : 0.42) * smooth(-se / 0.15); sun.color.copy(C_MOON); }
  hemi.color.copy(H_NIGHT).lerp(H_DAY, day).lerp(H_DUSK, dusk * 0.35);
  hemi.groundColor.copy(GR_NIGHT).lerp(GR_DAY, day);
  hemi.intensity = lerp(owl ? 1.0 : 0.5, 0.8, day);
  renderer.toneMappingExposure = lerp(owl ? 1.55 : 1.25, 1.0, day);
  // indoors: a warm lamp, brighter at night
  const room = Player.b && Player.b.room;
  if (room) { lamp.position.set(room.light.x, room.light.y, room.light.z); lamp.intensity = lerp(0.6, 2.2, G.night); } else lamp.intensity = 0;
  clouds.update(dt, day, dusk);
  if (skyExtras) { skyExtras.low.update(dt, day, dusk); skyExtras.sea.update(dt, camera.position); }
  flies.update(G.t, focus, G.world && !G.world.def.islands && !room ? G.night : 0);
  leaves.update(G.t, focus, AUTUMN && G.world && !room && ['land', 'meadow', 'forest'].includes(G.world.id) ? 1 : 0);
  // shadow box follows the focus point
  const m = Player.b ? Player.m : null;
  const Rr = room ? 9 : m ? clamp(m.length * 9 + 9, 10, 30) : 30;
  const cam = sun.shadow.camera;
  if (cam.right !== Rr) { cam.left = -Rr; cam.right = Rr; cam.top = Rr; cam.bottom = -Rr; cam.updateProjectionMatrix(); }
  const step = (2 * Rr) / Q.shadow;
  center.set(Math.round(focus.x / step) * step, focus.y, Math.round(focus.z / step) * step);
  sun.target.position.copy(center); sun.position.copy(center).addScaledVector(lightDir, 90);
  sky.mesh.position.copy(camera.position);
}

/* ---------- UI: floating labels ---------- */
const labelsEl = $('labels');
const floaters = [];
const proj = new V3();
function screenPos(v) { proj.copy(v).project(camera); if (proj.z > 1 || proj.z < -1) return null; return [(proj.x * 0.5 + 0.5) * cv.clientWidth, (-proj.y * 0.5 + 0.5) * cv.clientHeight]; }
function addFloat(html, cls, pos, life, rise) {
  const el = document.createElement('div'); el.className = cls; el.innerHTML = html; labelsEl.appendChild(el);
  floaters.push({ el, pos: pos.clone(), life, t: 0, rise });
}
const UI = {
  toastTimer: 0, savedTimer: 0,
  toast(msg, ms = 2800) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  },
  saved() { const s = $('savedPill'); s.hidden = false; clearTimeout(this.savedTimer); this.savedTimer = setTimeout(() => { s.hidden = true; }, 1800); },
  leafPop(pos, n) { addFloat(`${LEAF_SVG}+${n}`, 'pop', tmpPos(pos, 0.25), 1.3, 0.9); },
  hearts(pos, n) {
    const k = clamp((Player.b ? Player.b.m.height : 0.5) / 0.5, 0.35, 2.5);
    for (let i = 0; i < n; i++) { const p = tmpPos(pos, (0.3 + Math.random() * 0.3) * k); p.x += (Math.random() - 0.5) * 0.6 * k; p.z += (Math.random() - 0.5) * 0.6 * k; addFloat(HEART_SVG, 'heart', p, 1.2 + Math.random() * 0.6, 0.7 * k); }
  },
  bubble(p, text, secs) { this.dropBubble(p); const el = document.createElement('div'); el.className = 'bub'; el.textContent = text; labelsEl.appendChild(el); p.bub = { el, until: G.t + secs }; },
  dropBubble(p) { if (p.bub) { p.bub.el.remove(); p.bub = null; } },
  say(text, secs) { this.bubble(Player, text, secs); },
  hideAsk() {},
  enteredRoom(rm) { hudState.where = null; },
};
G.ui = UI;
const tmpPosV = new V3();
function tmpPos(pos, up) { return tmpPosV.set(pos.x, pos.y + up + (Player.b ? Player.m.height : 0.3), pos.z); }
const tagEls = new Map();
function updateLabels(dt) {
  const W = cv.clientWidth, Pb = Player.b;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt;
    if (f.t >= f.life) { f.el.remove(); floaters.splice(i, 1); continue; }
    f.pos.y += f.rise * dt * (Pb ? clamp(Pb.m.height * 1.5, 0.4, 2) : 1);
    const s = screenPos(f.pos);
    if (!s) { f.el.style.display = 'none'; continue; }
    f.el.style.display = ''; f.el.style.opacity = String(clamp((f.life - f.t) * 2.5, 0, 1));
    f.el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-50%)`;
  }
  const place = (el, pos) => { const s = screenPos(pos); if (!s || s[0] < -200 || s[0] > W + 200) { el.style.display = 'none'; return; } el.style.display = ''; el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-100%)`; };
  for (const p of Folk.list) {
    if (p.bub && p.bub.until < G.t) UI.dropBubble(p);
    const dCam = p.pos.distanceTo(camera.position), seen = !p.away && (!Pb || p.room === Pb.room);
    let tag = tagEls.get(p);
    if (!tag) { tag = document.createElement('div'); tag.className = 'tag'; labelsEl.appendChild(tag); tagEls.set(p, tag); }
    const top = proj.set(p.pos.x, p.pos.y + p.rig.height * (1 - 0.22 * p.crouch) + 0.25, p.pos.z);
    if (!seen) { if (p.bub) p.bub.el.style.display = 'none'; tag.style.display = 'none'; }
    else if (p.bub && dCam > 30) { p.bub.el.style.display = 'none'; tag.style.display = 'none'; }
    else if (p.bub) { place(p.bub.el, top); tag.style.display = 'none'; }
    else if (dCam < 16) { tag.textContent = p.friend || (Pb && p.owns === Pb.sp) ? `${p.name} ♥` : p.name; place(tag, proj.set(p.pos.x, p.pos.y + p.rig.height * (1 - 0.22 * p.crouch) + 0.12, p.pos.z)); }
    else tag.style.display = 'none';
  }
  for (const [p, el] of tagEls) if (!Folk.list.includes(p)) { el.remove(); tagEls.delete(p); }
  // other players: just their animal kind
  for (const o of Net.others.values()) {
    if (!o.tag) { o.tag = document.createElement('div'); o.tag.className = 'tag net'; labelsEl.appendChild(o.tag); o.tagText = ''; }
    const b = o.b, d = b.pos.distanceTo(camera.position);
    if (!b.rig.root.visible || d > 35) { o.tag.style.display = 'none'; continue; }
    const t = b.age < 1 ? stageName(o.sp) : SPECIES[o.sp].name;
    if (o.tagText !== t) { o.tagText = t; o.tag.textContent = t; }
    place(o.tag, proj.set(b.pos.x, b.pos.y + b.m.height + 0.18, b.pos.z));
  }
  if (Player.bub) {
    if (Player.bub.until < G.t) UI.dropBubble(Player);
    else place(Player.bub.el, proj.set(Player.pos.x, Player.pos.y + Player.m.height + 0.15, Player.pos.z));
  }
}

/* ---------- HUD ---------- */
const hudState = {};
function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`; }
function updateHud() {
  const h = hudState, di = dayInfo(), b = Player.b, sp = SPECIES[b.sp];
  if (h.leaves !== S.leaves) { h.leaves = S.leaves; $('leafCount').textContent = S.leaves; }
  const hv = Math.round(S.hunger);
  if (h.hunger !== hv) { h.hunger = hv; const f = $('hungerFill'); f.style.width = hv + '%'; f.style.backgroundColor = hv > 50 ? '#3E9A49' : hv > 20 ? '#F2B124' : '#E07A3A'; }
  const nm = nameOf(S.animal) + (S.names[S.animal] ? '' : ''), stage = ageOf(S.animal) < 1 ? stageName(S.animal) : '';
  const nameKey = S.animal + nm + stage;
  if (h.name !== nameKey) { h.name = nameKey; $('meImg').src = meIcon(S.animal); $('meName').textContent = S.names[S.animal] ? S.names[S.animal] : (stage || sp.name); }
  const status = S.sick > 0 ? 'Has a cold' : S.hunger <= 0 ? 'Hungry!' : (S.names[S.animal] && stage) ? stage : '';
  if (h.status !== status) { h.status = status; $('meStatus').textContent = status; $('meStatus').hidden = !status; }
  const where = b.room ? (b.room.pound ? 'Animal pound' : b.room.barn ? 'Barn' : b.room.school ? 'School' : (Homes.homeOf(b.sp) && Homes.homeOf(b.sp).room === b.room ? 'Home' : 'A house')) : World.META[S.world].name;
  if (h.where !== where) { h.where = where; $('wherePill').textContent = where; }
  const ct = fmt(di.left);
  if (h.clock !== ct || h.night !== di.night) {
    h.clock = ct; h.night = di.night; $('clockText').textContent = ct; $('clockWord').textContent = di.night ? 'Night' : 'Day';
    $('sunIco').hidden = di.night; $('moonIco').hidden = !di.night;
    $('clockPill').setAttribute('aria-label', (di.night ? 'Night, ' : 'Day, ') + ct + (di.night ? ' until morning' : ' until night'));
  }
  const online = Net.open ? Net.count() : -1;
  if (h.online !== online) { h.online = online; const np = $('netPill'); np.hidden = online < 0; $('netCount').textContent = online; np.setAttribute('aria-label', online === 1 ? '1 other player here' : `${online} other players here`); }
  const hasHome = !!S.homes[S.animal];
  if (h.hasHome !== hasHome) { h.hasHome = hasHome; $('homeBtn').hidden = !hasHome; }
  // action buttons
  let jl = 'Jump';
  if (canFlyNow(b) && b.mode === 'air' && !b.room) jl = 'Fly';
  else if (b.mode === 'fly') jl = 'Flap';
  if (h.jl !== jl) { h.jl = jl; $('jumpLabel').textContent = jl; }
  const showJump = !(sp.noJump && !sp.fly) && b.mode !== 'climb' && b.mode !== 'sleep';
  if (h.showJump !== showJump) { h.showJump = showJump; $('btnJump').hidden = !showJump; }
  const land = b.mode === 'fly';
  if (h.land !== land) { h.land = land; $('btnLand').hidden = !land; }
  const ready = !!Player.reachable();
  if (h.ready !== ready) { h.ready = ready; $('btnEat').classList.toggle('ready', ready); }
  const a = R.action, al = a ? a.label : '';
  if (h.act !== al) { h.act = al; $('btnAct').hidden = !a; $('actLabel').textContent = al; $('btnAct').classList.toggle('ready', !!a); }
}

/* ---------- icons (pre-rendered in the published build, drawn on demand otherwise) ---------- */
const ICON = {};
let iconR = null;
function animalIcon(id, age) {
  const key = id + (age !== undefined && age < 0.4 ? '-baby' : '');
  if (ASSETS.icons[key]) return ASSETS.icons[key];
  if (ASSETS.icons[id] && key === id) return ASSETS.icons[id];
  if (ICON[key] !== undefined) return ICON[key];
  try {
    if (!iconR) {
      const r = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      r.setPixelRatio(1); r.setSize(192, 192); r.outputEncoding = THREE.sRGBEncoding; r.toneMapping = THREE.ACESFilmicToneMapping; r.setClearColor(0x000000, 0);
      const sc = new THREE.Scene();
      sc.add(new THREE.HemisphereLight(0xe8f2ff, 0x6a5a40, 1.1));
      const d = new THREE.DirectionalLight(0xfff4e0, 2.2); d.position.set(2, 4, 3); sc.add(d);
      iconR = { r, sc, cam: new THREE.PerspectiveCamera(28, 1, 0.01, 100) };
    }
    const rig = Animals.build(id);
    if (key !== id && rig.setAge) rig.setAge(0.1);
    iconR.sc.add(rig.root);
    rig.update(0.016, { t: 1, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0 });
    const size = Math.max(rig.length, rig.height * 1.1), dist = size / (2 * Math.tan((14 * Math.PI) / 180)) * 1.05;
    const c = iconR.cam; c.position.set(0.72, 0.42, 0.75).normalize().multiplyScalar(dist); c.position.y += rig.height * 0.45;
    c.lookAt(0, rig.height * 0.45, 0); c.near = dist * 0.05; c.far = dist * 4; c.updateProjectionMatrix();
    iconR.r.render(iconR.sc, c);
    ICON[key] = iconR.r.domElement.toDataURL('image/png');
    iconR.sc.remove(rig.root);
  } catch (e) { ICON[key] = ''; }
  return ICON[key];
}
const meIcon = (sp) => animalIcon(sp, ageOf(sp));
const WORLD_BG = {
  land: 'linear-gradient(160deg,#bfe1f5 0 34%,#8cc35c 34% 70%,#c9483a 70% 76%,#79a447 76%)',
  sky: 'linear-gradient(160deg,#a9d8f5,#e8f5fd 55%,#ffd6ec)',
  forest: 'linear-gradient(160deg,#9fc4d6 0 25%,#2f6b3a 25% 65%,#4f8fb0 65% 72%,#4a6a2c 72%)',
  swamp: 'linear-gradient(160deg,#b8c4a8 0 30%,#5b6b3a 30% 60%,#4f6a52 60%)',
  jungle: 'linear-gradient(160deg,#a8d8c8 0 25%,#2f7a3c 25% 70%,#3fa3b8 70%)',
  meadow: 'linear-gradient(160deg,#c6e6f7 0 35%,#8fbd52 35%)',
};
const worldBg = (id) => ASSETS.worlds[id] ? `url(${ASSETS.worlds[id]})` : WORLD_BG[id];

/* ---------- sheets (map, animals, shop, settings) ---------- */
function tags(id) {
  const A = SPECIES[id], out = [];
  if (A.fly) out.push('<span class="tg">Flies</span>');
  if (A.swim) out.push('<span class="tg">Swims</span>');
  if (A.hop) out.push('<span class="tg">Hops</span>');
  if (A.climb) out.push('<span class="tg">Climbs trees</span>');
  if (A.nightEyes) out.push('<span class="tg">Sees at night</span>');
  if (A.egg) out.push('<span class="tg">Hatches from an egg</span>');
  return out.join('');
}
function foodChips(id) { const A = SPECIES[id]; return `<span class="eats">${A.eats.map((f) => `<span class="food${f === A.fav ? ' fav' : ''}">${FOODS[f].name}</span>`).join('')}</span>`; }
function openSheet(kind) { R.sheet = kind; UI.hideAsk(); for (const k in keys) keys[k] = false; renderSheet(); $('sheetWrap').hidden = false; R.paused = true; }
function closeSheet() { R.sheet = null; R.naming = null; $('sheetWrap').hidden = true; if (R.mode === 'play') R.paused = false; save(); }
function renderSheet() {
  const t = $('sheetTitle'), b = $('sheetBody');
  if (R.sheet === 'map') { t.textContent = 'Where do you want to go?'; b.innerHTML = sheetMap(); }
  else if (R.sheet === 'animals') { t.textContent = 'My animals'; b.innerHTML = sheetAnimals(); if (R.naming) setTimeout(() => { const i = $('nameInput'); if (i) i.focus(); }, 60); }
  else if (R.sheet === 'settings') { t.textContent = 'Settings'; b.innerHTML = sheetSettings(); }
  else if (R.sheet === 'shop') {
    t.textContent = R.shopTab === 'grownup' ? 'Leaf store' : 'Shop'; b.innerHTML = sheetShop();
    if (R.shopTab === 'grownup') setTimeout(() => { const i = $('gcInput'); if (i) i.focus(); }, 60);
  }
}
function sheetMap() {
  const b = Player.b, flyOK = b ? canFlyNow(b) : SPECIES[S.animal].fly && ageOf(S.animal) >= FLY_AGE;
  const A = SPECIES[S.animal];
  return `<div class="grid">${WORLD_ORDER.map((id) => {
    const w = World.META[id], here = id === S.world, locked = w.needsFly && !flyOK, isNew = !S.visited.includes(id);
    const bg = worldBg(id), style = bg.startsWith('url') ? `background-image:${bg}` : `background:${bg}`;
    return `<button class="card${here ? ' here' : ''}" type="button" data-action="go" data-v="${id}"${locked ? ' disabled' : ''}>
      <span class="pv" style="${style}"></span>
      <span class="t">${w.name}</span><span class="d">${w.blurb}</span>
      <span class="tags">${here ? `<span class="tg">You are here</span>${b && !b.room && Math.hypot(b.pos.x - G.world.def.spawn[0], b.pos.z - G.world.def.spawn[1]) > 150 ? '<span class="tg new">Tap to go back to the start</span>' : ''}` : ''}${locked ? `<span class="tg lock">${A.fly ? 'Grow up to fly here' : A.many + " can't fly"}</span>` : ''}${!here && !locked && isNew ? '<span class="tg new">New! +10 leaves</span>' : ''}</span>
    </button>`;
  }).join('')}</div>`;
}
function homeLine(id) {
  const hm = S.homes[id]; if (!hm) return '';
  const color = ['white', 'yellow', 'blue', 'brick', 'gray', 'white'][hm.house] || 'white';
  const cage = CAGED[id];
  const dot = `<span style="display:inline-block;width:.8em;height:.8em;border-radius:50%;vertical-align:-1px;margin-right:5px;border:2px solid #d9a93a;background:#${hexNum(hm.look && hm.look.shirt).toString(16).padStart(6, '0')}"></span>`;
  return `<span class="need">${dot}Wears ${hm.name}'s collar. ${SPECIES[id].outdoor ? `Lives in ${hm.name}'s yard behind the ${color} house` : cage ? `Lives in ${CAGE_WORDS[cage]} at ${hm.name}'s ${color} house` : `${hm.name}'s indoor pet in the ${color} house`}</span>`;
}
function sheetAnimals() {
  const ids = STARTERS.concat(SHOP).filter((i) => S.owned.includes(i));
  return `<p class="note">Tap Play to switch animals. Yellow foods are favorites and give 2 leaves each. Babies grow up by eating.</p><div class="list">${ids.map((id) => {
    const A = SPECIES[id], on = id === S.animal, a = ageOf(id), nick = S.names[id];
    const title = nick ? `${esc(nick)} <span class="kind">the ${(a < 1 ? stageName(id) : A.name).toLowerCase()}</span>` : (a < 1 ? stageName(id) : A.name);
    const naming = R.naming === id ? `<form class="nameform" id="nameForm" data-sp="${id}" autocomplete="off"><label for="nameInput">Nickname</label><input id="nameInput" maxlength="16" value="${esc(nick || '')}" placeholder="Like Sprinkles"><button class="btn small green" type="submit">Save</button><button class="btn small ghost" type="button" data-action="name-cancel">Cancel</button></form>` : '';
    return `<div class="arow${on ? ' on' : ''}"><img src="${meIcon(id)}" alt=""><div><div class="aname">${title} ${tags(id)}</div>${foodChips(id)}${a < 1 ? `<span class="growl">Growing up <span class="grow"><i style="width:${Math.max(4, Math.round(a * 100))}%"></i></span></span>` : ''}${homeLine(id)}${naming}</div>
      <div class="acts">${on ? '<span class="playing">Playing</span>' : `<button class="btn small" type="button" data-action="switch" data-v="${id}">Play</button>`}<button class="btn small ghost" type="button" data-action="name" data-v="${id}">Name</button></div></div>`;
  }).join('')}</div>`;
}
function sheetShop() {
  if (R.shopTab === 'grownup') return gcView();
  const tabsHtml = `<div class="tabs" role="tablist"><button class="tab" role="tab" type="button" aria-selected="${R.shopTab === 'animals'}" data-action="tab" data-v="animals">Animals</button><button class="tab" role="tab" type="button" aria-selected="${R.shopTab === 'leaves'}" data-action="tab" data-v="leaves">Leaves</button></div>`;
  if (R.shopTab === 'leaves') return tabsHtml + `<p class="note">Playing earns leaves for free. A leaf pack gets you a lot more at once. This is a pretend store, so no real money gets spent.</p><div class="packs">${PACKS.map((p) => `<button class="pack" type="button" data-action="pack" data-v="${p.id}"><span class="pack-leaves">${LEAF_SVG}${p.leaves}</span><span class="pack-price">${p.price}</span></button>`).join('')}</div>`;
  const items = SHOP.filter((id) => !S.owned.includes(id));
  if (!items.length) return tabsHtml + '<p class="note">You have every animal in the shop!</p>';
  return tabsHtml + `<p class="note">You have <b>${S.leaves}</b> leaves. Eat food to earn more. New animals start as babies.</p><div class="list">${items.map((id) => {
    const A = SPECIES[id], need = A.price - S.leaves;
    return `<div class="arow"><img src="${animalIcon(id)}" alt=""><div><div class="aname">${A.name} ${tags(id)}</div>${foodChips(id)}${need > 0 ? `<span class="need">${need} more leaves to go</span>` : ''}</div><button class="btn small" type="button" data-action="buy" data-v="${id}"${need > 0 ? ' disabled' : ''}><span class="price">${LEAF_SVG}${A.price}</span></button></div>`;
  }).join('')}</div>`;
}
function gcView() {
  const p = PACKS.find((x) => x.id === R.pack) || PACKS[0];
  return `<div class="gc"><h3>Grown-up check</h3><p>Ask a grown-up to answer this to get ${p.leaves} leaves for ${p.price} (pretend).</p>
    <form id="gcForm" class="gcform" autocomplete="off"><label class="gcq" for="gcInput">What is ${R.gc[0]} × ${R.gc[1]}?</label>
    <input id="gcInput" inputmode="numeric" pattern="[0-9]*" maxlength="4" aria-describedby="gcMsg">
    <div class="row"><button class="btn green" type="submit">Check</button><button class="btn ghost" type="button" data-action="tab" data-v="leaves">Back</button></div>
    <p class="gcmsg" id="gcMsg" role="status"></p></form></div>`;
}
function sheetSettings() {
  const sw = (id, label, val) => `<button class="switch" type="button" role="switch" aria-checked="${val}" data-action="${id}"><span class="knob"></span>${label}</button>`;
  return `<div class="settings">${sw('toggle-sound', 'Sound', S.sound !== false)}${sw('toggle-music', 'Music', S.music !== false)}
    <div class="setline">${API ? (cloud.user ? `Saving online as <b>${esc(cloud.user)}</b>. Your animals and leaves are saved on every device you sign in on. <button class="linkish" type="button" data-action="signout">Sign out</button>` : 'Your game saves on this device. <button class="linkish" type="button" data-action="cloud-here">Sign in to save online and play with other people</button>') : 'Your game saves on this device by itself.'}</div>
    ${API && cloud.user ? `<div class="setline">${Net.open ? `You're playing online. Other players show up as their animal (${Net.count() === 1 ? '1 other player' : Net.count() + ' other players'} in this world right now).` : 'Connecting to other players...'}</div>` : ''}
    ${R.cloudForm ? cloudFormHtml() : ''}
    <div class="setline"><button class="linkish" type="button" data-action="quit">Back to the title screen</button></div></div>`;
}
function travel(id, after) {
  if (!World.META[id]) return;
  if (World.META[id].needsFly && !canFlyNow(Player.b)) return;
  if (id === S.world) {
    closeSheet();
    // far out in the wilds, tapping the world you're in takes you back to its start
    const sp0 = G.world.def.spawn, b = Player.b;
    if (b && !b.room && Math.hypot(b.pos.x - sp0[0], b.pos.z - sp0[1]) > 150) { b.yaw = 0; Player.place(sp0[0], sp0[1]); Cam.snap = true; Foods.fill(60); UI.toast(`Back to the start of the ${World.META[id].name}`); }
    if (after) after();
    return;
  }
  closeSheet(); R.paused = true;
  showLoading(`Going to the ${World.META[id].name}...`, () => {
    loadWorld(id);
    Player.set(S.animal);
    Player.b.room = null; Player.b.yaw = 0; Player.place(G.world.def.spawn[0], G.world.def.spawn[1]);
    Cam.snap = true; Foods.fill(60);
    if (!S.visited.includes(id)) { S.visited.push(id); S.leaves += 10; UI.toast(`You found the ${World.META[id].name}! +10 leaves`); }
    else UI.toast(`Welcome to the ${World.META[id].name}`);
    R.paused = false; UI.saved(); save();
    if (after) after();
  });
}
function goHome() {
  const sp = S.animal; if (!S.homes[sp]) return;
  closeSheet();
  const doIt = () => {
    const house = Homes.homeOf(sp); if (!house) return;
    if (Player.b.room) Homes.exit();
    if (SPECIES[sp].outdoor) { Player.place(house.pen.x, house.pen.z); Cam.snap = true; UI.toast('Home sweet home! This is your pen.'); }
    else { Homes.enter(house); Cam.snap = true; UI.toast('Home sweet home!'); }
  };
  if (S.world !== 'land') travel('land', doIt); else doIt();
}
function switchAnimal(id) {
  if (!S.owned.includes(id)) return;
  S.animal = id; hudState.name = null;
  closeSheet();
  for (const p of Folk.list) Folk.cancel(p);
  const born = S.ages[id] === 0 && !S.hatched.includes(id);
  if (World.META[S.world].needsFly && !(SPECIES[id].fly && ageOf(id) >= FLY_AGE)) {
    R.paused = true;
    showLoading('Going back to Land...', () => {
      loadWorld('land'); Player.set(id); Player.place(G.world.def.spawn[0], G.world.def.spawn[1]); Cam.snap = true; Foods.fill(60);
      UI.toast(`You can't fly yet, so you went back to Land.`); R.paused = false; save();
      if (born) beginLife(id);
    });
    return;
  }
  Player.set(id); Cam.snap = true; Cam.zoom = 1; Foods.refresh(); Foods.fill(20);
  for (const p of Folk.list) if (p.friend && p.owns !== id) { p.friend = false; p.state = 'look'; p.cool = 5; }
  if (born) beginLife(id);
}
function buyAnimal(id) {
  const A = SPECIES[id]; if (!A || S.owned.includes(id) || S.leaves < A.price) return;
  S.leaves -= A.price; S.owned.push(id); S.ages[id] = 0;
  Sound.chime();
  switchAnimal(id);
  UI.saved();
}
function newGc() { return [6 + ((Math.random() * 7) | 0), 6 + ((Math.random() * 7) | 0)]; }
function checkGc() {
  const i = $('gcInput'), p = PACKS.find((x) => x.id === R.pack); if (!i || !p) return;
  if (parseInt(i.value, 10) === R.gc[0] * R.gc[1]) { S.leaves += p.leaves; R.shopTab = 'leaves'; renderSheet(); UI.toast(`+${p.leaves} leaves! Pretend purchase, no real money.`); save(); }
  else { $('gcMsg').textContent = 'Not quite. Ask a grown-up to try again.'; i.value = ''; i.focus(); }
}
function showLoading(text, fn) {
  $('loadingText').textContent = text; $('loading').hidden = false;
  requestAnimationFrame(() => requestAnimationFrame(() => {
    try { fn(); } finally { $('loading').hidden = true; }
  }));
}

/* ---------- saves ---------- */
function save(localOnly) {
  if (!S.started) return;
  S.saved = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
  if (!localOnly) cloud.dirty = true;
}
G.save = save;
function load() { try { const t = localStorage.getItem(SAVE_KEY); if (t) return JSON.parse(t); } catch (e) {} return null; }
const obj = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});
function applySave(d) {
  if (!d || d.v !== 1) return;
  const f = fresh();
  S.leaves = Number.isFinite(d.leaves) ? Math.max(0, Math.floor(d.leaves)) : 0;
  S.owned = Array.isArray(d.owned) ? d.owned.filter((id) => SPECIES[id]) : [];
  S.animal = SPECIES[d.animal] && S.owned.includes(d.animal) ? d.animal : (S.owned[0] || f.animal);
  S.world = World.META[d.world] ? d.world : 'land';
  S.visited = Array.isArray(d.visited) ? d.visited.filter((id) => World.META[id]) : [];
  S.time = Number.isFinite(d.time) ? d.time : f.time;
  S.hunger = Number.isFinite(d.hunger) ? clamp(d.hunger, 0, 100) : 100;
  // older 2D saves used a different map, so only keep 3D positions
  S.x = d.d3 && Number.isFinite(d.x) ? d.x : null;
  S.z = d.d3 && Number.isFinite(d.z) ? d.z : null;
  S.started = !!d.started && S.owned.length > 0;
  S.saved = Number.isFinite(d.saved) ? d.saved : 0;
  S.ages = {}; for (const [k, v] of Object.entries(obj(d.ages))) if (SPECIES[k] && Number.isFinite(v)) S.ages[k] = clamp(v, 0, 1);
  S.names = {}; for (const [k, v] of Object.entries(obj(d.names))) if (SPECIES[k] && typeof v === 'string') S.names[k] = v.slice(0, 16);
  S.homes = {}; for (const [k, v] of Object.entries(obj(d.homes))) if (SPECIES[k] && v && typeof v.name === 'string' && v.look) S.homes[k] = { name: v.name.slice(0, 20), look: v.look, house: clamp(v.house | 0, 0, 5) };
  S.sick = Number.isFinite(d.sick) ? clamp(d.sick, 0, 1) : 0;
  S.hatched = Array.isArray(d.hatched) ? d.hatched.filter((id) => SPECIES[id]) : [];
  S.treats = obj(d.treats);
  S.sound = d.sound !== false; S.music = d.music !== false;
  if (World.META[S.world].needsFly && !(SPECIES[S.animal].fly && ageOf(S.animal) >= FLY_AGE)) S.world = 'land';
}

/* ---------- cloud saves (only in the GitHub Pages build, where AA_API is set) ---------- */
const API = String(window.AA_API || '').replace(/\/$/, '');
const TOKEN_KEY = 'animal-adventures-token', USER_KEY = 'animal-adventures-user';
const cloud = { token: null, user: null, pushT: 20, dirty: false };
try { cloud.token = localStorage.getItem(TOKEN_KEY); cloud.user = localStorage.getItem(USER_KEY); } catch (e) {}
async function api(method, path, data) {
  const headers = { 'Content-Type': 'application/json' };
  if (cloud.token) headers.Authorization = 'Bearer ' + cloud.token;
  let res;
  try { res = await fetch(API + path, { method, headers, body: data ? JSON.stringify(data) : undefined, keepalive: method === 'PUT' }); }
  catch (e) { const err = new Error("Couldn't reach the internet. Try again in a minute."); err.status = 0; throw err; }
  let j = {}; try { j = await res.json(); } catch (e) {}
  if (!res.ok) { const err = new Error(j.error || 'Something went wrong. Try again.'); err.status = res.status; throw err; }
  return j;
}
function setSession(token, name) {
  cloud.token = token; cloud.user = name;
  try { if (token) { localStorage.setItem(TOKEN_KEY, token); localStorage.setItem(USER_KEY, name); } else { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(USER_KEY); } } catch (e) {}
}
async function pullCloud() {
  const r = await api('GET', '/api/save'), c = r.save;
  if (c && c.v === 1 && c.started && (!S.started || (c.saved || 0) > (S.saved || 0))) {
    applySave(c); hudState.name = null;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
    if (R.mode === 'title' && G.world && G.world.id !== S.world) loadWorld(S.world);
    return true;
  }
  if (S.started) await pushCloud();
  return false;
}
async function pushCloud() {
  if (!API || !cloud.token || !S.started) return;
  try { await api('PUT', '/api/save', { save: S }); if (R.mode === 'play') UI.saved(); }
  catch (e) { if (e.status === 401) setSession(null, null); else cloud.dirty = true; }
}
function refreshCloudUI() { if (R.mode === 'title') renderTitle(); else if (R.sheet === 'settings') renderSheet(); }
async function cloudSubmit(mode) {
  const msg = $('cloudMsg'), name = $('cName').value.trim(), pass = $('cPass').value;
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(name)) { msg.textContent = 'Names are 3 to 20 letters or numbers.'; return; }
  if (pass.length < 6) { msg.textContent = 'Passwords need at least 6 characters.'; return; }
  msg.textContent = mode === 'register' ? 'Making your account...' : 'Signing in...';
  for (const b of document.querySelectorAll('#cloudForm button')) b.disabled = true;
  try {
    const r = await api('POST', mode === 'register' ? '/api/register' : '/api/login', { username: name, password: pass });
    setSession(r.token, r.user.name);
    const applied = await pullCloud();
    R.cloudForm = false;
    refreshCloudUI();
    UI.toast(applied ? `Welcome back, ${r.user.name}! Your game is loaded.` : `Saving online as ${r.user.name}.`);
  } catch (e) {
    msg.textContent = e.message;
    for (const b of document.querySelectorAll('#cloudForm button')) b.disabled = false;
  }
}
async function signOut() { try { await api('POST', '/api/logout'); } catch (e) {} setSession(null, null); refreshCloudUI(); }
function esc(t) { return String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function cloudBlock() {
  if (!API) return '';
  if (cloud.user) return `<p class="cloud-line">Saving online as <b>${esc(cloud.user)}</b>. <button class="linkish" type="button" data-action="signout">Sign out</button></p>`;
  return '<button class="linkish" type="button" data-action="cloud">Sign in to save online and play with other people</button>';
}
function cloudFormHtml() {
  return `<form id="cloudForm" class="gcform cloudform">
        <label for="cName">Name</label><input id="cName" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20">
        <label for="cPass">Password</label><input id="cPass" type="password" autocomplete="current-password" maxlength="128">
        <div class="row"><button class="btn green" type="submit" data-mode="login">Sign in</button><button class="btn" type="submit" data-mode="register">Make account</button></div>
        <p class="gcmsg" id="cloudMsg" role="status"></p>
      </form>`;
}

/* ---------- title ---------- */
function renderTitle(mode) {
  const b = $('titleBody');
  if (mode === 'pick') {
    b.innerHTML = `<h2>Pick an animal to start</h2><p>You start as a baby and grow up by eating. More animals are in the shop.</p><div class="pick">${STARTERS.map((id) => `<button class="pcard" type="button" data-action="pick" data-v="${id}"><img src="${animalIcon(id)}" alt="">${SPECIES[id].name}</button>`).join('')}</div>`;
  } else if (mode === 'reset') {
    b.innerHTML = '<h2>Start over?</h2><p>Your leaves and animals will go away.</p><div class="row"><button class="btn" type="button" data-action="reset-yes">Yes, start over</button><button class="btn ghost" type="button" data-action="reset-no">No, keep playing</button></div>';
  } else if (mode === 'cloud') {
    b.innerHTML = `<h2>Save online</h2><p>Make an account to keep your animals and leaves on any phone, tablet or computer. A grown-up can help.</p>${cloudFormHtml()}<button class="linkish" type="button" data-action="reset-no">Back</button>`;
  } else if (S.started) {
    b.innerHTML = `<p>Eat food, grow up, earn leaves, and explore six worlds that never end.${HOLIDAY === 'halloween' ? ' Happy Halloween!' : ''}</p><div class="row"><button class="btn green" type="button" data-action="play">Keep playing</button></div>${cloudBlock()}<button class="linkish" type="button" data-action="reset">Start over</button>`;
  } else {
    b.innerHTML = `<p>Eat food, grow up, earn leaves, and explore six worlds that never end.${HOLIDAY === 'halloween' ? ' Happy Halloween!' : ''}</p><div class="row"><button class="btn green" type="button" data-action="new">Play</button></div>${cloudBlock()}`;
  }
}
function play(after) {
  $('titleWrap').hidden = true;
  showLoading('Loading...', () => {
    if (!G.world || G.world.id !== S.world) loadWorld(S.world);
    Player.set(S.animal);
    const s = G.world.def.spawn;
    if (S.x !== null && S.z !== null && Math.abs(S.x) < World.ROOM_X / 2 && Math.abs(S.z) < World.ROOM_X / 2) Player.place(S.x, S.z); else Player.place(s[0], s[1]);
    Cam.snap = true; Foods.fill(60);
    R.mode = 'play'; R.paused = false; R.wasNight = dayInfo().night;
    for (const k in hudState) delete hudState[k];
    $('hud').hidden = false; $('side').hidden = false; $('actions').hidden = false; $('keys').hidden = false;
    if (matchMedia('(pointer:coarse)').matches) $('stickHint').hidden = false;
    save(true);
    if (after) after();
  });
}
function pickStarter(id) {
  S.started = true; S.owned = Array.from(new Set(STARTERS.concat(S.owned))); S.animal = id;
  S.visited = ['land']; S.time = 120; S.hunger = 100; S.world = 'land'; S.x = null; S.z = null;
  S.ages = {}; for (const sp of STARTERS) S.ages[sp] = 0; S.hatched = [];
  play(() => { beginLife(id); });
}
function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  Object.assign(S, fresh()); renderTitle('pick');
}
function quitToTitle() {
  closeSheet(); save();
  R.mode = 'title'; R.paused = false;
  if (Player.b) { scene.remove(Player.b.rig.root); Player.b = null; }
  for (const id of ['hud', 'side', 'actions', 'keys', 'stickHint', 'prompt']) $(id).hidden = true;
  if (G.world && G.world.room) G.world.setRoom(null);
  labelsEl.innerHTML = ''; floaters.length = 0; tagEls.clear();
  renderTitle(); $('titleWrap').hidden = false;
}

/* ---------- events ---------- */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-action]'); if (!b || b.disabled) return;
  const v = b.dataset.v;
  switch (b.dataset.action) {
    case 'new': renderTitle('pick'); break;
    case 'play': play(); break;
    case 'pick': pickStarter(v); break;
    case 'reset': renderTitle('reset'); break;
    case 'reset-yes': resetGame(); break;
    case 'reset-no': renderTitle(); break;
    case 'map': openSheet('map'); break;
    case 'animals': openSheet('animals'); break;
    case 'settings': R.cloudForm = false; openSheet('settings'); break;
    case 'home': goHome(); break;
    case 'shop': R.shopTab = v || 'animals'; openSheet('shop'); break;
    case 'tab': R.shopTab = v; renderSheet(); break;
    case 'pack': R.pack = v; R.gc = newGc(); R.shopTab = 'grownup'; renderSheet(); break;
    case 'go': travel(v); break;
    case 'switch': switchAnimal(v); break;
    case 'buy': buyAnimal(v); break;
    case 'name': R.naming = v; renderSheet(); break;
    case 'name-cancel': R.naming = null; renderSheet(); break;
    case 'close': closeSheet(); break;
    case 'cloud': renderTitle('cloud'); setTimeout(() => { const i = $('cName'); if (i) i.focus(); }, 50); break;
    case 'cloud-here': R.cloudForm = true; renderSheet(); setTimeout(() => { const i = $('cName'); if (i) i.focus(); }, 50); break;
    case 'signout': signOut(); break;
    case 'toggle-sound': S.sound = !(S.sound !== false); Sound.setOn(S.sound); renderSheet(); save(true); break;
    case 'toggle-music': S.music = !(S.music !== false); Sound.setMusic(S.music); renderSheet(); save(true); break;
    case 'quit': quitToTitle(); break;
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'gcForm') { e.preventDefault(); checkGc(); }
  if (e.target.id === 'cloudForm') { e.preventDefault(); cloudSubmit((e.submitter && e.submitter.dataset.mode) || 'login'); }
  if (e.target.id === 'nameForm') {
    e.preventDefault();
    const sp = e.target.dataset.sp, v = $('nameInput').value.replace(/\s+/g, ' ').trim().slice(0, 16);
    if (v) S.names[sp] = v; else delete S.names[sp];
    R.naming = null; hudState.name = null; renderSheet(); save();
    if (v) UI.toast(`Hello, ${v}!`);
  }
});
$('sheetWrap').addEventListener('click', (e) => { if (e.target === $('sheetWrap')) closeSheet(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && S.started) { save(); pushCloud(); } });
cv.addEventListener('webglcontextlost', (e) => { e.preventDefault(); UI.toast('The 3D view stopped. Reload the page to keep playing.', 8000); });

/* ---------- main loop ---------- */
const perf = { acc: 0, n: 0, wait: 3 };
const focus = new V3();
let last = 0, manual = false;
function frame(now) {
  if (manual) return;
  const raw = (now - last) / 1000; last = now;
  tick(Math.min(0.05, Math.max(0, raw)), raw, true);
  requestAnimationFrame(frame);
}
function tick(dt, raw, draw) {
  G.t += dt;
  const playing = R.mode === 'play' && Player.b && G.world;
  if (playing) {
    if (!R.paused) {
      S.time += dt;
      readInput();
      R.action = findAction();
      if (press.act) { press.act = false; doAction(R.action); }
      if (press.call) { press.call = false; Net.sendCall(); Sound.call(Player.b); Player.b.happy = 1; for (const w of Wild.list) if (w.sp === Player.sp && !w.caged && w.pos.distanceTo(Player.pos) < 25) setTimeout(() => Sound.wildCall(w, camera.position, Cam.yaw), 500 + Math.random() * 900); }
      Player.update(dt, inp);
      Homes.update(dt);
      updateDoorSeq(dt);
      updateHatch(dt);
      updateBall(dt);
      if (R.sleeping > 0) { R.sleeping -= dt; if (R.sleeping <= 0) wakeUp(); }
      const di = dayInfo();
      if (R.wasNight !== null && di.night !== R.wasNight && R.sleeping <= 0) UI.toast(di.night ? (HOLIDAY === 'halloween' ? 'Night time! Look for glowing jack-o\'-lanterns and go trick or treating.' : 'Night time! The fireflies are out.') : 'Good morning! A new day.', 3600);
      R.wasNight = di.night;
      R.saveT -= dt; if (R.saveT <= 0) { R.saveT = 5; save(); }
      cloud.pushT -= dt; if (cloud.pushT <= 0 && cloud.dirty) { cloud.pushT = 20; cloud.dirty = false; pushCloud(); }
    } else poseBody(Player.b, dt, true);
    followCamera(dt);
    focus.copy(Player.pos);
    World.PUSH.value.set(Player.pos.x, Player.pos.z, clamp(Player.m.length * 0.9 + 0.3, 0.45, 2.4), Player.b.mode === 'fly' ? 0 : 1);
  } else if (G.world) {
    titleCamera();
    focus.set(G.world.def.spawn[0], G.world.H(G.world.def.spawn[0], G.world.def.spawn[1]), G.world.def.spawn[1]);
    World.PUSH.value.w = 0;
  }
  if (G.world) {
    Wild.update(dt, camera.position);
    Folk.update(dt, camera.position);
    if (playing && !R.paused) Town.update(dt); else Town.navN = 0;
    Net.update(dt);
    Foods.update(dt);
    G.world.tick(dt, playing ? Player.b : null);
    G.world.updateView(camera.position, focus.x, focus.z, scene.fog.far, playing ? Player.m.length : 1.2);
    Env.wind.time.value = G.t; Env.waterUniforms.time.value = G.t;
    timeOfDay(dt, focus);
    if (draw) renderer.render(scene, camera);
  }
  Sound.update(dt, { night: G.night, world: G.world ? G.world.id : '', inside: !!(playing && Player.b.room), pos: playing ? Player.pos : focus, body: playing && !R.paused ? Player.b : null });
  if (playing) { updateHud(); updateLabels(dt); }
  // drop the resolution a little if this device is struggling
  if (playing && !R.paused && raw < 0.5) {
    perf.acc += raw; perf.n++;
    if (perf.acc > 4) {
      const avg = perf.acc / perf.n;
      if (perf.wait > 0) perf.wait--;
      else if (avg > 1 / 36 && Q.level < 3) {
        Q.level++;
        if (Q.level === 1) Q.pr = Math.min(Q.pr, 1.15);
        else if (Q.level === 2) { Q.pr = Math.min(Q.pr, 0.95); Q.shadow = 1024; }
        else Q.pr = 0.8;
        applyQuality();
      }
      perf.acc = 0; perf.n = 0;
    }
  }
}

function start(data) {
  const snap = data && data.S;
  applySave(snap || load());
  applyQuality();
  loadWorld(S.started ? S.world : 'meadow');
  renderTitle();
  if (snap && data.playing && S.started) play();
  if (API && cloud.token && !(snap && data.playing)) pullCloud().then(() => { if (R.mode === 'title') renderTitle(); }).catch((err) => { if (err.status === 401) { setSession(null, null); if (R.mode === 'title') renderTitle(); } });
  window.claude?.hot?.snapshot?.(() => ({ S: JSON.parse(JSON.stringify(S)), playing: R.mode === 'play' }));
  if (/test|assets/.test(location.hash)) window.__aa = { SPECIES, manual(on) { manual = on; if (!on) requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); }); }, step(n, dt = 1 / 30, draw = true) { for (let i = 0; i < n; i++) tick(dt, 1, draw && i === n - 1); }, S, G, R, Player, Wild, Folk, Foods, Homes, World, Cam, inp, keys, press, travel, switchAnimal, loadWorld, play, pickStarter, animalIcon, renderer, camera, scene, dayInfo, timeOfDay, findAction, doAction, Sound, setBodyAge, goHome, buyAnimal, Env, Animals, People, THREE, Net, Town, Nav };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
