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
G.scene = scene; G.camera = camera;
scene.fog = new THREE.Fog(0xbfdcef, 40, 200);
const sun = new THREE.DirectionalLight(0xfff4e0, 2);
sun.castShadow = true;
sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.03;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 220;
scene.add(sun, sun.target);
const hemi = new THREE.HemisphereLight(0xbfdcff, 0x5a6a3a, 0.8);
scene.add(hemi);
const sky = Env.sky(); scene.add(sky.mesh);
const clouds = Env.clouds(14, 460, 150); scene.add(clouds.group);
const flies = Env.fireflies(80); scene.add(flies.points);
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
const R = { mode: 'title', paused: false, sheet: null, shopTab: 'animals', pack: null, gc: [7, 8], saveT: 5, wasNight: null, loading: false };
function loadWorld(id) {
  if (G.world) { scene.remove(G.world.group); Wild.clear(); Folk.clear(); Foods.clear(); G.world.dispose(); }
  const w = World.build(id); G.world = w; scene.add(w.group);
  scene.fog.near = w.def.fog[0]; scene.fog.far = w.def.fog[1];
  if (skyExtras) { scene.remove(skyExtras.group); skyExtras = null; }
  if (w.def.islands) {
    const g = new THREE.Group();
    const sea = Env.cloudSea(2600, -34); g.add(sea.mesh);
    const low = Env.clouds(12, 170, 16); g.add(low.group);
    const rb = Env.rainbow(150); rb.position.set(40, -45, -230); g.add(rb);
    scene.add(g);
    skyExtras = { group: g, sea, low };
  }
  Wild.spawn(w); Folk.spawn(w);
  S.world = id;
}

/* ---------- camera ---------- */
const Cam = { yaw: Math.PI, pitch: 0.36, zoom: 1, target: new V3(), userT: 0, snap: true };
const camTmp = new V3();
function followCamera(dt) {
  const b = Player.b, rig = b.rig, H = G.world.H;
  const base = clamp(rig.length * 1.35 + rig.height * 1.5 + 0.75, 1.25, 8.5);
  let dist = base * Cam.zoom;
  const ty = b.pos.y + rig.eyeHeight * 0.8 + 0.05;
  if (Cam.snap) { Cam.target.set(b.pos.x, ty, b.pos.z); Cam.yaw = b.yaw; Cam.snap = false; }
  // when a person is talking to us, pull back so both fit on screen
  let fx0 = b.pos.x, fz0 = b.pos.z, fy0 = ty, minD = 0;
  const talker = Folk.list.find((p) => (p === Folk.asking || p.state === 'offer' || p.state === 'pet') && p.pos.distanceTo(b.pos) < 4);
  if (talker) {
    fx0 = lerp(b.pos.x, talker.pos.x, 0.45); fz0 = lerp(b.pos.z, talker.pos.z, 0.45); fy0 = lerp(ty, talker.pos.y + talker.rig.height * 0.5, 0.5); minD = talker.rig.height * 1.7;
    // look past our animal at the person, so both are in the shot
    if (Cam.userT <= 0) Cam.yaw += angDiff(Cam.yaw, Math.atan2(talker.pos.x - b.pos.x, talker.pos.z - b.pos.z) + 0.35) * (1 - Math.exp(-2.5 * dt));
  }
  Cam.frame = damp(Cam.frame || 0, minD, 3, dt);
  Cam.target.x = damp(Cam.target.x, fx0, 14, dt); Cam.target.z = damp(Cam.target.z, fz0, 14, dt); Cam.target.y = damp(Cam.target.y, fy0, 8, dt);
  Cam.userT -= dt;
  if (!talker && Cam.userT <= 0 && b.speed > 0.25 && b.eat <= 0) Cam.yaw += angDiff(Cam.yaw, b.yaw) * (1 - Math.exp(-(b.mode === 'fly' ? 1.6 : 1.1) * dt));
  dist = Math.max(dist, Cam.frame || 0);
  let pitch = Cam.pitch;
  if (b.mode === 'fly') pitch = clamp(pitch + b.vy * 0.03, 0.05, 1.2);
  const cp = Math.cos(pitch), sp = Math.sin(pitch), fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw);
  let x = Cam.target.x - fx * cp * dist, z = Cam.target.z - fz * cp * dist, y = Cam.target.y + sp * dist;
  const gh = H(x, z), floor = Math.max(gh > -100 ? gh : -1e9, G.world.def.water ? WATER : -1e9) + Math.max(0.12, rig.height * 0.45);
  if (y < floor) y = floor;
  camera.position.set(x, y, z);
  camera.lookAt(Cam.target);
  const near = clamp(dist * 0.03, 0.025, 0.25);
  if (Math.abs(camera.near - near) > 0.005) { camera.near = near; camera.updateProjectionMatrix(); }
}
function titleCamera() {
  const w = G.world, s = w.def.spawn, a = G.t * 0.04;
  const tx = s[0], tz = s[1], ty = Math.max(w.H(tx, tz), WATER) + 1.6;
  let x = tx + Math.sin(a) * 18, z = tz + Math.cos(a) * 18;
  let y = Math.max(w.H(x, z) > -100 ? w.H(x, z) : ty, WATER) + 6;
  camera.position.set(x, y, z); camTmp.set(tx, ty, tz); camera.lookAt(camTmp);
  if (camera.near !== 0.1) { camera.near = 0.1; camera.updateProjectionMatrix(); }
}

/* ---------- input ---------- */
const keys = {};
const inp = { mx: 0, mz: 0, walk: false, jump: false, up: false, down: false, eat: false };
const press = { jump: false, eat: false, jumpHeld: false, landHeld: false };
const stick = { id: null, ox: 0, oy: 0, dx: 0, dy: 0 };
const looks = new Map();
let pinch = null;
const touchEl = $('touch');
const STICK_R = 54;
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
const KEYMAP = { KeyW: 'f', ArrowUp: 'f', KeyS: 'b', ArrowDown: 'b', KeyA: 'l', ArrowLeft: 'l', KeyD: 'r', ArrowRight: 'r', ShiftLeft: 'walk', ShiftRight: 'walk', Space: 'jump', KeyE: 'eat', KeyC: 'land', KeyQ: 'land' };
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && R.sheet) { closeSheet(); return; }
  if (R.mode !== 'play' || R.paused || e.target.tagName === 'INPUT') return;
  const k = KEYMAP[e.code]; if (!k) return;
  e.preventDefault();
  if (!e.repeat) { if (k === 'jump') press.jump = true; if (k === 'eat') press.eat = true; }
  keys[k] = true;
});
window.addEventListener('keyup', (e) => { const k = KEYMAP[e.code]; if (k) keys[k] = false; });
window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; press.jumpHeld = press.landHeld = false; });
function readInput() {
  let ix = 0, iy = 0;
  if (stick.id !== null) { ix = stick.dx / STICK_R; iy = -stick.dy / STICK_R; const m = Math.hypot(ix, iy); if (m < 0.12) { ix = 0; iy = 0; } }
  const kx = (keys.r ? 1 : 0) - (keys.l ? 1 : 0), ky = (keys.f ? 1 : 0) - (keys.b ? 1 : 0);
  if (kx || ky) { const m = Math.hypot(kx, ky); ix = kx / m; iy = ky / m; }
  const fx = Math.sin(Cam.yaw), fz = Math.cos(Cam.yaw), rx = -Math.cos(Cam.yaw), rz = Math.sin(Cam.yaw);
  inp.mx = fx * iy + rx * ix; inp.mz = fz * iy + rz * ix;
  inp.walk = !!keys.walk;
  inp.jump = press.jump; press.jump = false;
  inp.up = press.jumpHeld || !!keys.jump;
  inp.down = press.landHeld || !!keys.land;
  inp.eat = press.eat; press.eat = false;
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
  sky.update(sunDir, day, dusk);
  scene.fog.color.copy(sky.horizonColor); renderer.setClearColor(sky.horizonColor);
  const owl = Player.b && SPECIES[Player.sp].nightEyes && R.mode === 'play';
  if (se > 0) { lightDir.copy(sunDir); sun.intensity = 2.1 * smooth(se / 0.22); sun.color.copy(C_DAY).lerp(C_DUSK, dusk * 0.7); }
  else { moonDir.copy(sunDir).multiplyScalar(-1); lightDir.copy(moonDir); sun.intensity = (owl ? 0.7 : 0.42) * smooth(-se / 0.15); sun.color.copy(C_MOON); }
  hemi.color.copy(H_NIGHT).lerp(H_DAY, day).lerp(H_DUSK, dusk * 0.35);
  hemi.groundColor.copy(GR_NIGHT).lerp(GR_DAY, day);
  hemi.intensity = lerp(owl ? 1.0 : 0.5, 0.8, day);
  renderer.toneMappingExposure = lerp(owl ? 1.55 : 1.25, 1.0, day);
  clouds.update(dt, day, dusk);
  if (skyExtras) { skyExtras.low.update(dt, day, dusk); skyExtras.sea.update(dt, camera.position); }
  flies.update(G.t, focus, G.world && !G.world.def.islands ? G.night : 0);
  // shadow box follows the focus point
  const rig = Player.b ? Player.rig : null;
  const Rr = rig ? clamp(rig.length * 9 + 9, 10, 30) : 30;
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
  toastTimer: 0,
  toast(msg, ms = 2800) {
    const t = $('toast'); t.textContent = msg; t.hidden = false; t.style.animation = 'none'; void t.offsetWidth; t.style.animation = '';
    clearTimeout(this.toastTimer); this.toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  },
  leafPop(pos, n) { addFloat(`${LEAF_SVG}+${n}`, 'pop', tmpPos(pos, 0.25), 1.3, 0.9); },
  hearts(pos, n) { for (let i = 0; i < n; i++) { const p = tmpPos(pos, 0.3 + Math.random() * 0.3); p.x += (Math.random() - 0.5) * 0.6; p.z += (Math.random() - 0.5) * 0.6; addFloat(HEART_SVG, 'heart', p, 1.2 + Math.random() * 0.6, 0.7); } },
  bubble(p, text, secs) { this.dropBubble(p); const el = document.createElement('div'); el.className = 'bub'; el.textContent = text; labelsEl.appendChild(el); p.bub = { el, until: G.t + secs }; },
  dropBubble(p) { if (p.bub) { p.bub.el.remove(); p.bub = null; } },
  say(text, secs) { this.bubble(Player, text, secs); },
  ask(p, animal) {
    const nm = animal.toLowerCase(), art = /^[aeiou]/.test(nm) ? 'an' : 'a';
    $('promptText').textContent = `${p.name}: "Aww, ${art} ${nm}! Will you be my pet?"`;
    $('prompt').hidden = false;
  },
  hideAsk() { $('prompt').hidden = true; },
};
G.ui = UI;
const tmpPosV = new V3();
function tmpPos(pos, up) { return tmpPosV.set(pos.x, pos.y + up + (Player.b ? Player.rig.height : 0.3), pos.z); }
const tagEls = new Map();
function updateLabels(dt) {
  const W = cv.clientWidth;
  for (let i = floaters.length - 1; i >= 0; i--) {
    const f = floaters[i]; f.t += dt;
    if (f.t >= f.life) { f.el.remove(); floaters.splice(i, 1); continue; }
    f.pos.y += f.rise * dt * (Player.b ? clamp(Player.rig.height * 1.5, 0.4, 2) : 1);
    const s = screenPos(f.pos);
    if (!s) { f.el.style.display = 'none'; continue; }
    f.el.style.display = ''; f.el.style.opacity = String(clamp((f.life - f.t) * 2.5, 0, 1));
    f.el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-50%)`;
  }
  const place = (el, pos) => { const s = screenPos(pos); if (!s || s[0] < -200 || s[0] > W + 200) { el.style.display = 'none'; return; } el.style.display = ''; el.style.transform = `translate(${s[0]}px,${s[1]}px) translate(-50%,-100%)`; };
  // speech bubbles and name tags for people
  for (const p of Folk.list) {
    if (p.bub && p.bub.until < G.t) UI.dropBubble(p);
    const dCam = p.pos.distanceTo(camera.position);
    let tag = tagEls.get(p);
    if (!tag) { tag = document.createElement('div'); tag.className = 'tag'; labelsEl.appendChild(tag); tagEls.set(p, tag); }
    const top = proj.set(p.pos.x, p.pos.y + p.rig.height * (1 - 0.22 * p.crouch) + 0.25, p.pos.z);
    if (p.bub && dCam > 30) { p.bub.el.style.display = 'none'; tag.style.display = 'none'; }
    else if (p.bub) { place(p.bub.el, top); tag.style.display = 'none'; }
    else if (!p.away && dCam < 16) { tag.textContent = p.friend ? `${p.name} ♥` : p.name; place(tag, proj.set(p.pos.x, p.pos.y + p.rig.height * (1 - 0.22 * p.crouch) + 0.12, p.pos.z)); }
    else tag.style.display = 'none';
  }
  for (const [p, el] of tagEls) if (!Folk.list.includes(p)) { el.remove(); tagEls.delete(p); }
  if (Player.bub) {
    if (Player.bub.until < G.t) UI.dropBubble(Player);
    else place(Player.bub.el, proj.set(Player.pos.x, Player.pos.y + Player.rig.height + 0.15, Player.pos.z));
  }
}

/* ---------- HUD ---------- */
const hudState = {};
function fmt(sec) { sec = Math.max(0, Math.ceil(sec)); return `${(sec / 60) | 0}:${String(sec % 60).padStart(2, '0')}`; }
function updateHud() {
  const h = hudState, di = dayInfo();
  if (h.leaves !== S.leaves) { h.leaves = S.leaves; $('leafCount').textContent = S.leaves; }
  const hv = Math.round(S.hunger);
  if (h.hunger !== hv) { h.hunger = hv; const f = $('hungerFill'); f.style.width = hv + '%'; f.style.backgroundColor = hv > 50 ? '#3E9A49' : hv > 20 ? '#F2B124' : '#E07A3A'; }
  if (h.animal !== S.animal) { h.animal = S.animal; $('meImg').src = animalIcon(S.animal); $('meName').textContent = SPECIES[S.animal].name; }
  if (h.world !== S.world) { h.world = S.world; $('wherePill').textContent = World.META[S.world].name; }
  const ct = fmt(di.left);
  if (h.clock !== ct || h.night !== di.night) {
    h.clock = ct; h.night = di.night; $('clockText').textContent = ct; $('clockWord').textContent = di.night ? 'Night' : 'Day';
    $('sunIco').hidden = di.night; $('moonIco').hidden = !di.night;
    $('clockPill').setAttribute('aria-label', (di.night ? 'Night, ' : 'Day, ') + ct + (di.night ? ' until morning' : ' until night'));
  }
  // action buttons
  const b = Player.b, sp = SPECIES[b.sp];
  let jl = 'Jump';
  if (sp.fly && (b.mode === 'air')) jl = 'Fly';
  else if (b.mode === 'fly') jl = 'Flap';
  if (h.jl !== jl) { h.jl = jl; $('jumpLabel').textContent = jl; }
  const showJump = !(sp.noJump && !sp.fly);
  if (h.showJump !== showJump) { h.showJump = showJump; $('btnJump').hidden = !showJump; }
  const land = b.mode === 'fly';
  if (h.land !== land) { h.land = land; $('btnLand').hidden = !land; }
  const ready = !!Player.reachable();
  if (h.ready !== ready) { h.ready = ready; $('btnEat').classList.toggle('ready', ready); }
}

/* ---------- icons (pre-rendered in the published build, drawn on demand otherwise) ---------- */
const ICON = {};
let iconR = null;
function animalIcon(id) {
  if (ASSETS.icons[id]) return ASSETS.icons[id];
  if (ICON[id] !== undefined) return ICON[id];
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
    iconR.sc.add(rig.root);
    rig.update(0.016, { t: 1, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0 });
    const size = Math.max(rig.length, rig.height * 1.1), dist = size / (2 * Math.tan((14 * Math.PI) / 180)) * 1.05;
    const c = iconR.cam; c.position.set(0.72, 0.42, 0.75).normalize().multiplyScalar(dist); c.position.y += rig.height * 0.45;
    c.lookAt(0, rig.height * 0.45, 0); c.near = dist * 0.05; c.far = dist * 4; c.updateProjectionMatrix();
    iconR.r.render(iconR.sc, c);
    ICON[id] = iconR.r.domElement.toDataURL('image/png');
    iconR.sc.remove(rig.root);
  } catch (e) { ICON[id] = ''; }
  return ICON[id];
}
const WORLD_BG = {
  land: 'linear-gradient(160deg,#bfe1f5 0 34%,#8cc35c 34% 70%,#c9483a 70% 76%,#79a447 76%)',
  sky: 'linear-gradient(160deg,#a9d8f5,#e8f5fd 55%,#ffd6ec)',
  forest: 'linear-gradient(160deg,#9fc4d6 0 25%,#2f6b3a 25% 65%,#4f8fb0 65% 72%,#4a6a2c 72%)',
  swamp: 'linear-gradient(160deg,#b8c4a8 0 30%,#5b6b3a 30% 60%,#4f6a52 60%)',
  jungle: 'linear-gradient(160deg,#a8d8c8 0 25%,#2f7a3c 25% 70%,#3fa3b8 70%)',
  meadow: 'linear-gradient(160deg,#c6e6f7 0 35%,#8fbd52 35%)',
};
const worldBg = (id) => ASSETS.worlds[id] ? `url(${ASSETS.worlds[id]})` : WORLD_BG[id];

/* ---------- sheets (map, animals, shop) ---------- */
function tags(id) {
  const A = SPECIES[id], out = [];
  if (A.fly) out.push('<span class="tg">Flies</span>');
  if (A.swim) out.push('<span class="tg">Swims</span>');
  if (A.hop) out.push('<span class="tg">Hops</span>');
  if (A.nightEyes) out.push('<span class="tg">Sees at night</span>');
  return out.join('');
}
function foodChips(id) { const A = SPECIES[id]; return `<span class="eats">${A.eats.map((f) => `<span class="food${f === A.fav ? ' fav' : ''}">${FOODS[f].name}</span>`).join('')}</span>`; }
function openSheet(kind) { R.sheet = kind; UI.hideAsk(); for (const k in keys) keys[k] = false; renderSheet(); $('sheetWrap').hidden = false; R.paused = true; }
function closeSheet() { R.sheet = null; $('sheetWrap').hidden = true; if (R.mode === 'play') R.paused = false; if (Folk.asking) UI.ask(Folk.asking, SPECIES[Player.sp].name); save(); }
function renderSheet() {
  const t = $('sheetTitle'), b = $('sheetBody');
  if (R.sheet === 'map') { t.textContent = 'Where do you want to go?'; b.innerHTML = sheetMap(); }
  else if (R.sheet === 'animals') { t.textContent = 'My animals'; b.innerHTML = sheetAnimals(); }
  else if (R.sheet === 'shop') {
    t.textContent = R.shopTab === 'grownup' ? 'Leaf store' : 'Shop'; b.innerHTML = sheetShop();
    if (R.shopTab === 'grownup') setTimeout(() => { const i = $('gcInput'); if (i) i.focus(); }, 60);
  }
}
function sheetMap() {
  const A = SPECIES[S.animal];
  return `<div class="grid">${WORLD_ORDER.map((id) => {
    const w = World.META[id], here = id === S.world, locked = w.needsFly && !A.fly, isNew = !S.visited.includes(id);
    return `<button class="card${here ? ' here' : ''}" type="button" data-action="go" data-v="${id}"${locked ? ' disabled' : ''}>
      <span class="pv" style="background-image:${worldBg(id).startsWith('url') ? worldBg(id) : 'none'};${worldBg(id).startsWith('url') ? '' : 'background:' + worldBg(id)}"></span>
      <span class="t">${w.name}</span><span class="d">${w.blurb}</span>
      <span class="tags">${here ? '<span class="tg">You are here</span>' : ''}${locked ? `<span class="tg lock">${A.many} can't fly</span>` : ''}${!here && !locked && isNew ? '<span class="tg new">New! +10 leaves</span>' : ''}</span>
    </button>`;
  }).join('')}</div>`;
}
function sheetAnimals() {
  const ids = STARTERS.concat(SHOP).filter((i) => S.owned.includes(i));
  return `<p class="note">Tap Play to switch animals. Yellow foods are favorites and give 2 leaves each.</p><div class="list">${ids.map((id) => {
    const A = SPECIES[id], on = id === S.animal;
    return `<div class="arow${on ? ' on' : ''}"><img src="${animalIcon(id)}" alt=""><div><div class="aname">${A.name} ${tags(id)}</div>${foodChips(id)}</div>${on ? '<span class="playing">Playing</span>' : `<button class="btn small" type="button" data-action="switch" data-v="${id}">Play</button>`}</div>`;
  }).join('')}</div>`;
}
function sheetShop() {
  if (R.shopTab === 'grownup') return gcView();
  const tabsHtml = `<div class="tabs" role="tablist"><button class="tab" role="tab" type="button" aria-selected="${R.shopTab === 'animals'}" data-action="tab" data-v="animals">Animals</button><button class="tab" role="tab" type="button" aria-selected="${R.shopTab === 'leaves'}" data-action="tab" data-v="leaves">Leaves</button></div>`;
  if (R.shopTab === 'leaves') return tabsHtml + `<p class="note">Playing earns leaves for free. A leaf pack gets you a lot more at once. This is a pretend store, so no real money gets spent.</p><div class="packs">${PACKS.map((p) => `<button class="pack" type="button" data-action="pack" data-v="${p.id}"><span class="pack-leaves">${LEAF_SVG}${p.leaves}</span><span class="pack-price">${p.price}</span></button>`).join('')}</div>`;
  const items = SHOP.filter((id) => !S.owned.includes(id));
  if (!items.length) return tabsHtml + '<p class="note">You have every animal in the shop!</p>';
  return tabsHtml + `<p class="note">You have <b>${S.leaves}</b> leaves. Eat food to earn more.</p><div class="list">${items.map((id) => {
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
function travel(id) {
  if (!World.META[id]) return;
  const A = SPECIES[S.animal];
  if (World.META[id].needsFly && !A.fly) return;
  if (id === S.world) { closeSheet(); return; }
  closeSheet(); R.paused = true;
  showLoading(`Going to the ${World.META[id].name}...`, () => {
    loadWorld(id);
    Player.set(S.animal);
    Player.b.yaw = 0; Player.place(G.world.def.spawn[0], G.world.def.spawn[1]);
    Cam.snap = true; Foods.fill(60);
    if (!S.visited.includes(id)) { S.visited.push(id); S.leaves += 10; UI.toast(`You found the ${World.META[id].name}! +10 leaves`); }
    else UI.toast(`Welcome to the ${World.META[id].name}`);
    R.paused = false; save();
  });
}
function switchAnimal(id) {
  if (!S.owned.includes(id)) return;
  S.animal = id; hudState.animal = null;
  const A = SPECIES[id];
  closeSheet();
  if (World.META[S.world].needsFly && !A.fly) {
    R.paused = true;
    showLoading('Going back to Land...', () => {
      loadWorld('land'); Player.set(id); Player.place(G.world.def.spawn[0], G.world.def.spawn[1]); Cam.snap = true; Foods.fill(60);
      UI.toast(`${A.many} can't fly, so you went back to Land.`); R.paused = false; save();
    });
    return;
  }
  if (Folk.asking) Folk.cancel(Folk.asking);
  Player.set(id); Cam.snap = true; Cam.zoom = 1; Foods.refresh(); Foods.fill(20);
  for (const p of Folk.list) if (p.friend) { p.friend = false; p.state = 'look'; p.cool = 5; }
}
function buyAnimal(id) {
  const A = SPECIES[id]; if (!A || S.owned.includes(id) || S.leaves < A.price) return;
  S.leaves -= A.price; S.owned.push(id);
  switchAnimal(id);
  UI.toast(`You got a ${A.name.toLowerCase()}!`);
  UI.hearts(Player.pos, 5);
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
  S.x = d.d3 && Number.isFinite(d.x) ? clamp(d.x, -LIM, LIM) : null;
  S.z = d.d3 && Number.isFinite(d.z) ? clamp(d.z, -LIM, LIM) : null;
  S.started = !!d.started && S.owned.length > 0;
  S.saved = Number.isFinite(d.saved) ? d.saved : 0;
  if (World.META[S.world].needsFly && !SPECIES[S.animal].fly) S.world = 'land';
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
// Newest save wins. Returns true when the cloud copy replaced this device's game.
async function pullCloud() {
  const r = await api('GET', '/api/save'), c = r.save;
  if (c && c.v === 1 && c.started && (!S.started || (c.saved || 0) > (S.saved || 0))) {
    applySave(c); hudState.animal = null;
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) {}
    if (R.mode === 'title' && G.world && G.world.id !== S.world) loadWorld(S.world);
    return true;
  }
  if (S.started) await pushCloud();
  return false;
}
async function pushCloud() {
  if (!API || !cloud.token || !S.started) return;
  try { await api('PUT', '/api/save', { save: S }); }
  catch (e) { if (e.status === 401) setSession(null, null); else cloud.dirty = true; }
}
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
    renderTitle();
    UI.toast(applied ? `Welcome back, ${r.user.name}! Your game is loaded.` : `Saving online as ${r.user.name}.`);
  } catch (e) {
    msg.textContent = e.message;
    for (const b of document.querySelectorAll('#cloudForm button')) b.disabled = false;
  }
}
async function signOut() { try { await api('POST', '/api/logout'); } catch (e) {} setSession(null, null); renderTitle(); }
function esc(t) { return String(t).replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]); }
function cloudBlock() {
  if (!API) return '';
  if (cloud.user) return `<p class="cloud-line">Saving online as <b>${esc(cloud.user)}</b>. <button class="linkish" type="button" data-action="signout">Sign out</button></p>`;
  return '<button class="linkish" type="button" data-action="cloud">Save online to play on other devices</button>';
}

/* ---------- title ---------- */
function renderTitle(mode) {
  const b = $('titleBody');
  if (mode === 'pick') {
    b.innerHTML = `<h2>Pick an animal to start</h2><p>You can switch any time. More animals are in the shop.</p><div class="pick">${STARTERS.map((id) => `<button class="pcard" type="button" data-action="pick" data-v="${id}"><img src="${animalIcon(id)}" alt="">${SPECIES[id].name}</button>`).join('')}</div>`;
  } else if (mode === 'reset') {
    b.innerHTML = '<h2>Start over?</h2><p>Your leaves and animals will go away.</p><div class="row"><button class="btn" type="button" data-action="reset-yes">Yes, start over</button><button class="btn ghost" type="button" data-action="reset-no">No, keep playing</button></div>';
  } else if (mode === 'cloud') {
    b.innerHTML = `<h2>Save online</h2><p>Make an account to keep your animals and leaves on any phone, tablet or computer. A grown-up can help.</p>
      <form id="cloudForm" class="gcform cloudform">
        <label for="cName">Name</label><input id="cName" autocomplete="username" autocapitalize="off" spellcheck="false" maxlength="20">
        <label for="cPass">Password</label><input id="cPass" type="password" autocomplete="current-password" maxlength="128">
        <div class="row"><button class="btn green" type="submit" data-mode="login">Sign in</button><button class="btn" type="submit" data-mode="register">Make account</button></div>
        <p class="gcmsg" id="cloudMsg" role="status"></p>
      </form><button class="linkish" type="button" data-action="reset-no">Back</button>`;
  } else if (S.started) {
    b.innerHTML = `<p>Eat food, earn leaves, and explore six worlds.</p><div class="row"><button class="btn green" type="button" data-action="play">Keep playing</button></div>${cloudBlock()}<button class="linkish" type="button" data-action="reset">Start over</button>`;
  } else {
    b.innerHTML = `<p>Eat food, earn leaves, and explore six worlds.</p><div class="row"><button class="btn green" type="button" data-action="new">Play</button></div>${cloudBlock()}`;
  }
}
function play() {
  $('titleWrap').hidden = true;
  showLoading('Loading...', () => {
    if (!G.world || G.world.id !== S.world) loadWorld(S.world);
    Player.set(S.animal);
    const s = G.world.def.spawn;
    if (S.x !== null && S.z !== null) Player.place(S.x, S.z); else Player.place(s[0], s[1]);
    Cam.snap = true; Foods.fill(60);
    R.mode = 'play'; R.paused = false; R.wasNight = dayInfo().night;
    for (const k in hudState) delete hudState[k];
    $('hud').hidden = false; $('side').hidden = false; $('actions').hidden = false; $('keys').hidden = false;
    if (matchMedia('(pointer:coarse)').matches) $('stickHint').hidden = false;
    save(true);
  });
}
function pickStarter(id) {
  S.started = true; S.owned = Array.from(new Set(STARTERS.concat(S.owned))); S.animal = id;
  S.visited = ['land']; S.time = 120; S.hunger = 100; S.world = 'land'; S.x = null; S.z = null;
  play();
  setTimeout(() => UI.toast('Walk to food that glows, then tap Eat to earn leaves!', 5000), 400);
}
function resetGame() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
  Object.assign(S, fresh()); renderTitle('pick');
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
    case 'shop': R.shopTab = v || 'animals'; openSheet('shop'); break;
    case 'tab': R.shopTab = v; renderSheet(); break;
    case 'pack': R.pack = v; R.gc = newGc(); R.shopTab = 'grownup'; renderSheet(); break;
    case 'go': travel(v); break;
    case 'switch': switchAnimal(v); break;
    case 'buy': buyAnimal(v); break;
    case 'close': closeSheet(); break;
    case 'yes': UI.hideAsk(); Folk.answer(true); break;
    case 'no': UI.hideAsk(); Folk.answer(false); break;
    case 'cloud': renderTitle('cloud'); setTimeout(() => { const i = $('cName'); if (i) i.focus(); }, 50); break;
    case 'signout': signOut(); break;
  }
});
document.addEventListener('submit', (e) => {
  if (e.target.id === 'gcForm') { e.preventDefault(); checkGc(); }
  if (e.target.id === 'cloudForm') { e.preventDefault(); cloudSubmit((e.submitter && e.submitter.dataset.mode) || 'login'); }
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
      Player.update(dt, inp);
      const di = dayInfo();
      if (R.wasNight !== null && di.night !== R.wasNight) UI.toast(di.night ? 'Night time! The fireflies are out.' : 'Good morning! A new day.');
      R.wasNight = di.night;
      R.saveT -= dt; if (R.saveT <= 0) { R.saveT = 5; save(); }
      cloud.pushT -= dt; if (cloud.pushT <= 0 && cloud.dirty) { cloud.pushT = 20; cloud.dirty = false; pushCloud(); }
    } else poseBody(Player.b, dt, true);
    followCamera(dt);
    focus.copy(Player.pos);
    World.PUSH.value.set(Player.pos.x, Player.pos.z, clamp(Player.rig.length * 0.9 + 0.3, 0.45, 2.4), Player.b.mode === 'fly' ? 0 : 1);
  } else if (G.world) {
    titleCamera();
    focus.set(G.world.def.spawn[0], G.world.H(G.world.def.spawn[0], G.world.def.spawn[1]), G.world.def.spawn[1]);
    World.PUSH.value.w = 0;
  }
  if (G.world) {
    Wild.update(dt, camera.position);
    Folk.update(dt, camera.position);
    Foods.update(dt);
    G.world.updateView(camera.position, focus.x, focus.z, scene.fog.far, Player.b && R.mode === 'play' ? Player.rig.length : 1.2);
    Env.wind.time.value = G.t; Env.waterUniforms.time.value = G.t;
    timeOfDay(dt, focus);
    if (draw) renderer.render(scene, camera);
  }
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
  if (/test|assets/.test(location.hash)) window.__aa = { SPECIES, manual(on) { manual = on; if (!on) requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); }); }, step(n, dt = 1 / 30, draw = true) { for (let i = 0; i < n; i++) tick(dt, 1, draw && i === n - 1); }, S, G, R, Player, Wild, Folk, Foods, World, Cam, inp, keys, press, travel, switchAnimal, loadWorld, play, pickStarter, animalIcon, renderer, camera, scene, dayInfo, timeOfDay };
  requestAnimationFrame((t) => { last = t; requestAnimationFrame(frame); });
}
window.claude?.hot?.ready ? window.claude.hot.ready(start) : start(window.claude?.hot?.data ?? {});
