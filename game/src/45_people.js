// ---------- People: procedural 3D people (three.js r149, skinned lofts) ----------
const People = (() => {
  const TAU = Math.PI * 2, PI = Math.PI;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
  const fract = (x) => x - Math.floor(x);

  function hash2(x, y) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }
  function vnoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return lerp(lerp(hash2(ix, iy), hash2(ix + 1, iy), fx), lerp(hash2(ix, iy + 1), hash2(ix + 1, iy + 1), fx), fy);
  }
  // CSS color to a working-space (linear) THREE.Color, whatever the ColorManagement mode is
  function cssColor(css, fallback) {
    const c = new THREE.Color();
    try { c.setStyle(css || fallback); } catch (e) { c.setStyle(fallback); }
    if (!THREE.ColorManagement || THREE.ColorManagement.legacyMode !== false) c.convertSRGBToLinear();
    return c;
  }

  // ---------- loft geometry (path keys [x, y, z, halfWidth, top, bottom, exponent]) ----------
  const SF = ['x', 'y', 'z', 'w', 't', 'b', 'e'];
  const station = (a) => ({ x: a[0], y: a[1], z: a[2], w: a[3], t: a[4], b: a[5] === undefined ? a[4] : a[5], e: a[6] || 2 });
  function crStation(k0, k1, k2, k3, t) {
    const o = {}, t2 = t * t, t3 = t2 * t;
    for (let i = 0; i < 7; i++) {
      const f = SF[i], p0 = k0[f], p1 = k1[f], p2 = k2[f], p3 = k3[f];
      let v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      if (i >= 3) v = clamp(v, Math.min(p1, p2) * 0.9, Math.max(p1, p2) * 1.08);
      o[f] = v;
    }
    return o;
  }
  function sectionPoint(w, t, b, e, th, out) {
    const s = Math.sin(th), c = Math.cos(th), h = c >= 0 ? t : b;
    if (e === 2) { out[0] = w * s; out[1] = h * c; } else {
      const k = 2 / e;
      out[0] = w * Math.sign(s) * Math.pow(Math.abs(s), k);
      out[1] = h * Math.sign(c) * Math.pow(Math.abs(c), k);
    }
    return out;
  }
  function computeNormals(pos, idx) {
    const n = new Float32Array(pos.length);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      n[a] += nx; n[a + 1] += ny; n[a + 2] += nz; n[b] += nx; n[b + 1] += ny; n[b + 2] += nz; n[c] += nx; n[c + 1] += ny; n[c + 2] += nz;
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    return Array.from(n);
  }
  function buildLoft(def) {
    const keys = def.keys.map(station), segs = def.segs || 10, sub = def.sub || 3, n = keys.length, st = [];
    const refl = (a, b) => Object.assign({}, a, { x: 2 * a.x - b.x, y: 2 * a.y - b.y, z: 2 * a.z - b.z });
    for (let i = 0; i < n - 1; i++) {
      const k0 = i > 0 ? keys[i - 1] : refl(keys[0], keys[1]), k3 = i + 2 < n ? keys[i + 2] : refl(keys[n - 1], keys[n - 2]);
      for (let s = 0; s < sub; s++) st.push(crStation(k0, keys[i], keys[i + 1], k3, s / sub));
    }
    st.push(Object.assign({}, keys[n - 1]));
    const V = (s) => new THREE.Vector3(s.x, s.y, s.z);
    const addCap = (atEnd, nr, lenScale) => {
      const B = atEnd ? st[st.length - 1] : st[0], C2 = atEnd ? st[st.length - 2] : st[1];
      const T = V(B).sub(V(C2)).normalize(), r = (B.w + (B.t + B.b) * 0.5) * 0.5, L = r * (lenScale || 0.9), caps = [];
      for (let k = 1; k <= nr; k++) {
        const ph = (k / nr) * PI * 0.5, c = Math.cos(ph), p = V(B).addScaledVector(T, L * Math.sin(ph));
        caps.push({ x: p.x, y: p.y, z: p.z, w: B.w * c, t: B.t * c, b: B.b * c, e: B.e });
      }
      if (atEnd) st.push(...caps); else st.unshift(...caps.reverse());
    };
    if (def.cap0) addCap(false, def.cap0 === true ? 3 : def.cap0, def.capLen0);
    if (def.cap1) addCap(true, def.cap1 === true ? 3 : def.cap1, def.capLen1);
    const R = st.length, side0 = new THREE.Vector3().fromArray(def.side || [1, 0, 0]), rings = [];
    let arc = 0;
    for (let i = 0; i < R; i++) {
      const s = st[i], C = V(s), a = st[Math.max(0, i - 1)], b = st[Math.min(R - 1, i + 1)];
      const T = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      if (T.lengthSq() < 1e-12) T.set(0, 0, 1);
      T.normalize();
      const N = new THREE.Vector3().crossVectors(T, side0);
      if (N.lengthSq() < 1e-8) N.set(0, 1, 0);
      N.normalize();
      const S = new THREE.Vector3().crossVectors(N, T).normalize();
      if (i > 0) arc += C.distanceTo(rings[i - 1].C);
      rings.push({ C, T, N, S, w: s.w, t: s.t, b: s.b, e: s.e, arc });
    }
    const pos = [], idx = [], uv = [], ringOf = [], tmp = [0, 0], circ = [];
    for (let i = 0; i < R; i++) {
      const r = rings[i];
      circ.push(PI * (r.w + (r.t + r.b) * 0.5));
      for (let j = 0; j <= segs; j++) {
        sectionPoint(r.w, r.t, r.b, r.e, (j / segs) * TAU, tmp);
        pos.push(r.C.x + r.S.x * tmp[0] + r.N.x * tmp[1], r.C.y + r.S.y * tmp[0] + r.N.y * tmp[1], r.C.z + r.S.z * tmp[0] + r.N.z * tmp[1]);
        uv.push(j / segs, r.arc);
        ringOf.push(i);
      }
    }
    const rw = segs + 1;
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < segs; j++) { const a = i * rw + j, b = a + rw; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const nrm = computeNormals(pos, idx);
    for (let i = 0; i < R; i++) {
      const a = i * rw, b = a + segs;
      for (let k = 0; k < 3; k++) { const m = (nrm[a * 3 + k] + nrm[b * 3 + k]) * 0.5; nrm[a * 3 + k] = nrm[b * 3 + k] = m; }
      const r = rings[i];
      if (Math.max(r.w, r.t, r.b) < 1e-4) { const sg = i === 0 ? -1 : 1; for (let j = 0; j <= segs; j++) { const k = (a + j) * 3; nrm[k] = r.T.x * sg; nrm[k + 1] = r.T.y * sg; nrm[k + 2] = r.T.z * sg; } }
    }
    // fabric uv: around in meters-ish (circumference), along arc
    const avgC = circ.reduce((s, c) => s + c, 0) / R;
    for (let v = 0; v < uv.length / 2; v++) uv[v * 2] *= avgC;
    return { rings, pos, nrm, idx, uv, ringOf, len: arc };
  }
  // bone weights along a loft: each bone after the first takes over at its pivot's projection onto the path
  function skinLoft(L, names, rest, blend) {
    const R = L.rings.length, starts = [];
    for (let k = 0; k < names.length; k++) {
      if (k === 0) { starts.push(-1e9); continue; }
      let best = 1e9, bi = 0;
      for (let i = 0; i < R; i++) { const d = L.rings[i].C.distanceToSquared(rest[names[k]]); if (d < best) { best = d; bi = i; } }
      starts.push(L.rings[bi].arc);
    }
    const out = [];
    for (let i = 0; i < R; i++) {
      const s = L.rings[i].arc;
      let k = 0;
      while (k < names.length - 1 && s >= starts[k + 1]) k++;
      const w = new Map([[k, 1]]);
      if (k + 1 < names.length) { const g = sstep(starts[k + 1] - blend, starts[k + 1] + blend, s); if (g > 0.001) { w.set(k + 1, g); w.set(k, 1 - g); } }
      if (k > 0) { const g = 1 - sstep(starts[k] - blend, starts[k] + blend, s); if (g > 0.001) { const cur = w.get(k); w.set(k - 1, g * cur); w.set(k, cur * (1 - g)); } }
      out.push(Array.from(w.entries()).map(([kk, ww]) => [names[kk], ww]));
    }
    return out;
  }
  function ellipsoid(c, r, segW, segH) {
    const g = new THREE.SphereGeometry(1, segW || 10, segH || 8), p = g.attributes.position.array, nn = g.attributes.normal.array, pos = [], nrm = [], uv = [];
    for (let i = 0; i < p.length; i += 3) {
      pos.push(c[0] + p[i] * r[0], c[1] + p[i + 1] * r[1], c[2] + p[i + 2] * r[2]);
      const nx = nn[i] / r[0], ny = nn[i + 1] / r[1], nz = nn[i + 2] / r[2], l = Math.hypot(nx, ny, nz);
      nrm.push(nx / l, ny / l, nz / l);
    }
    const ua = g.attributes.uv.array;
    for (let i = 0; i < ua.length; i++) uv.push(ua[i]);
    const idx = Array.from(g.index.array);
    g.dispose();
    return { pos, nrm, idx, uv };
  }
  // mirror a left-side bone name to the right side
  const mirrorName = (nm) => (nm.endsWith('L') ? nm.slice(0, -1) + 'R' : nm);
  function newBatch() { return { pos: [], nrm: [], uv: [], col: [], si: [], sw: [], idx: [] }; }
  // part: { pos, nrm, idx, uv?, weights(v) -> [[bone, w]...], col?(x, y, z) -> [r, g, b] linear }
  function push(bt, part, boneIndex, mirror) {
    const base = bt.pos.length / 3, nv = part.pos.length / 3;
    for (let v = 0; v < nv; v++) {
      const x = part.pos[v * 3], y = part.pos[v * 3 + 1], z = part.pos[v * 3 + 2];
      bt.pos.push(mirror ? -x : x, y, z);
      bt.nrm.push(mirror ? -part.nrm[v * 3] : part.nrm[v * 3], part.nrm[v * 3 + 1], part.nrm[v * 3 + 2]);
      bt.uv.push(part.uv ? part.uv[v * 2] : 0, part.uv ? part.uv[v * 2 + 1] : 0);
      const c = part.col ? part.col(x, y, z) : null;
      bt.col.push(c ? c[0] : 1, c ? c[1] : 1, c ? c[2] : 1);
      const ws = part.weights(v), four = [];
      let tot = 0;
      for (let k = 0; k < 4; k++) {
        if (k < ws.length) { const nm = mirror ? mirrorName(ws[k][0]) : ws[k][0]; four.push([boneIndex[nm], ws[k][1]]); tot += ws[k][1]; } else four.push([0, 0]);
      }
      for (let k = 0; k < 4; k++) { bt.si.push(four[k][0]); bt.sw.push(tot > 0 ? four[k][1] / tot : k === 0 ? 1 : 0); }
    }
    for (let i = 0; i < part.idx.length; i += 3) {
      if (mirror) bt.idx.push(base + part.idx[i], base + part.idx[i + 2], base + part.idx[i + 1]);
      else bt.idx.push(base + part.idx[i], base + part.idx[i + 1], base + part.idx[i + 2]);
    }
  }
  function toGeometry(bt, skinned) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bt.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bt.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bt.uv, 2));
    g.setAttribute('color', new THREE.Float32BufferAttribute(bt.col, 3));
    if (skinned) {
      g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bt.si, 4));
      g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bt.sw, 4));
    }
    g.setIndex(bt.idx);
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.4;
    return g;
  }
  function loftPart(def, rest) {
    const L = buildLoft(def);
    const W = def.bones.length > 1 ? skinLoft(L, def.bones, rest, def.blend || 0.02) : null;
    return { pos: L.pos, nrm: L.nrm, idx: L.idx, uv: L.uv, col: def.col, weights: (v) => (W ? W[L.ringOf[v]] : [[def.bones[0], 1]]) };
  }
  const rigid = (part, bone, col) => Object.assign(part, { weights: () => [[bone, 1]], col: col || part.col });

  // ---------- shared textures ----------
  let fabricTex = null, hairTex = null;
  function canvasTex(W, H, fn, repeat) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const v = clamp(fn(x, y), 0, 1) * 255, o = (y * W + x) * 4;
      d[o] = d[o + 1] = d[o + 2] = v; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    return t;
  }
  function getFabric() {
    // fine woven cloth: soft weave, subtle mottling (tiles every 0.06 m)
    if (!fabricTex) fabricTex = canvasTex(64, 64, (x, y) => {
      const w = 0.5 + 0.5 * Math.sin((x / 64) * TAU * 16) * Math.sin((y / 64) * TAU * 16);
      return 0.9 + 0.06 * w + 0.06 * (vnoise(x / 8, y / 8) - 0.5);
    }, [16, 16]);
    return fabricTex;
  }
  function getHair() {
    // strands running along v
    if (!hairTex) hairTex = canvasTex(128, 64, (x, y) => {
      const s = vnoise(x * 0.9, y * 0.05) * 0.6 + vnoise(x * 0.33 + 50, y * 0.03) * 0.4;
      return 0.72 + 0.4 * s;
    });
    return hairTex;
  }

  // ---------- proportions ----------
  // k: 0 = young child (head about 1/5.5 of height), 1 = adult (about 1/7.5). All values are fractions of height.
  function props(k) {
    const m = (a, b) => a + (b - a) * k, P = { k };
    P.hh = m(0.18, 0.13);
    P.chin = 1 - P.hh;
    P.ry = P.hh * 0.5; P.rx = P.hh * m(0.37, 0.34); P.rzf = P.hh * m(0.39, 0.38); P.rzb = P.hh * 0.45;
    P.hc = [0, P.chin + P.ry, m(0.006, 0.012)];
    P.eyeV = m(0.14, 0.04); // eye level below head center, fraction of ry
    P.sh = m(0.772, 0.815);
    P.shX = m(0.094, 0.104);
    P.neckR = m(0.034, 0.034);
    P.hipJ = m(0.465, 0.525);
    P.hipX = m(0.045, 0.05);
    P.knee = m(0.25, 0.283);
    P.ankle = 0.05;
    P.elbow = P.sh - m(0.152, 0.178);
    P.wrist = P.elbow - m(0.128, 0.15);
    P.handLen = m(0.085, 0.1);
    P.chestW = m(0.088, 0.096); P.waistW = m(0.084, 0.082); P.hipW = m(0.088, 0.092);
    P.belly = m(0.066, 0.058);
    P.limb = m(1.06, 1);
    return P;
  }
  // head surface: deformed sphere. th: around (0 = front, +Z), ph: 0 at the crown, PI at the chin
  function headPoint(P, th, ph, s, out) {
    const y = Math.cos(ph), r = Math.sin(ph), sx = r * Math.sin(th), sz = r * Math.cos(th);
    const j = sstep(0.05, -0.95, y);
    const X = sx * P.rx * (1 - 0.2 * j);
    let Z = sz >= 0 ? sz * P.rzf * (1 - 0.1 * j) : sz * P.rzb * (1 - 0.5 * j);
    Z += Math.max(0, sz) * j * P.hh * 0.015;
    const Y = y * P.ry * (y > 0 ? 1.02 : 1);
    return out.set(P.hc[0] + X * s, P.hc[1] + Y * s, P.hc[2] + Z * s);
  }
  function headGrid(P, nTh, nPh, phMax, scaleFn, uvScale) {
    const pos = [], uv = [], idx = [], v = new THREE.Vector3();
    for (let i = 0; i <= nPh; i++) {
      for (let j = 0; j <= nTh; j++) {
        const th = (j / nTh) * TAU - PI, pm = phMax ? phMax(th) : PI, ph = (i / nPh) * pm;
        headPoint(P, th, ph, scaleFn ? scaleFn(th, ph, i / nPh) : 1, v);
        pos.push(v.x, v.y, v.z);
        uv.push((j / nTh) * (uvScale || 1), i / nPh);
      }
    }
    const rw = nTh + 1;
    for (let i = 0; i < nPh; i++) for (let j = 0; j < nTh; j++) { const a = i * rw + j, b = a + rw; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const nrm = computeNormals(pos, idx);
    for (let i = 0; i <= nPh; i++) { const a = i * rw, b = a + nTh; for (let k = 0; k < 3; k++) { const mm = (nrm[a * 3 + k] + nrm[b * 3 + k]) * 0.5; nrm[a * 3 + k] = nrm[b * 3 + k] = mm; } }
    return { pos, nrm, idx, uv };
  }
  // a feature placed on the head surface at (th, ph), pushed out along the surface normal by 'out' (fraction of hh)
  function onHead(P, th, ph, out) {
    const p = headPoint(P, th, ph, 1, new THREE.Vector3()), q = headPoint(P, th, ph, 1.1, new THREE.Vector3());
    const n = q.sub(p).normalize();
    return { p: p.addScaledVector(n, out * P.hh), n };
  }

  // ---------- template (geometry per age bucket and hair style) ----------
  const cache = {};
  function getTemplate(bucket, style) {
    const key = bucket + '|' + style;
    if (cache[key]) return cache[key];
    const P = props(bucket / 2), hh = P.hh, l = P.limb;
    const bones = [
      ['hips', null, 0, P.hipJ + 0.01, 0],
      ['spine', 'hips', 0, P.hipJ + 0.3 * (P.sh - P.hipJ), 0],
      ['chest', 'spine', 0, P.hipJ + 0.62 * (P.sh - P.hipJ), 0],
      ['neck', 'chest', 0, P.sh + 0.012, -0.006],
      ['head', 'neck', 0, P.chin + 0.022, 0.0],
      ['hairT', 'head', 0, P.hc[1] + 0.12 * hh, P.hc[2] - P.rzb * 0.98],
      ['clavL', 'chest', 0.02, P.sh - 0.012, 0, 1],
      ['armL', 'clavL', P.shX, P.sh, 0, 1],
      ['foreL', 'armL', P.shX + 0.016, P.elbow, -0.008, 1],
      ['handL', 'foreL', P.shX + 0.02, P.wrist, 0.004, 1],
      ['fingL', 'handL', P.shX + 0.021, P.wrist - 0.58 * P.handLen, 0.006, 1],
      ['thighL', 'hips', P.hipX, P.hipJ, 0, 1],
      ['shinL', 'thighL', P.hipX + 0.003, P.knee, 0.008, 1],
      ['footL', 'shinL', P.hipX + 0.005, P.ankle, -0.008, 1],
      ['toeL', 'footL', P.hipX + 0.008, 0.016, 0.075, 1],
    ];
    const defs = [];
    for (const b of bones) {
      defs.push({ name: b[0], parent: b[1], p: new THREE.Vector3(b[2], b[3], b[4]) });
      if (b[5]) defs.push({ name: mirrorName(b[0]), parent: b[1] && b[1].endsWith('L') ? mirrorName(b[1]) : b[1], p: new THREE.Vector3(-b[2], b[3], b[4]) });
    }
    const boneIndex = {}, rest = {};
    defs.forEach((d, i) => { boneIndex[d.name] = i; rest[d.name] = d.p; });

    // --- skin ---
    const skin = newBatch();
    const blush = (x, y, z) => {
      const dx = Math.abs(x) - P.rx * 0.6, dy = y - (P.hc[1] - 0.22 * hh), dz = z - (P.hc[2] + P.rzf * 0.7);
      const b = Math.exp(-(dx * dx + dy * dy + dz * dz) / (hh * hh * 0.012)) * 0.12;
      return [1, 1 - b, 1 - b * 1.1];
    };
    const head = headGrid(P, 20, 14, null, null, 1);
    push(skin, rigid(head, 'head', blush), boneIndex, false);
    const nose = onHead(P, 0, PI / 2 + 0.2 + P.eyeV * 0.4, -0.012);
    const noseQ = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), nose.n);
    const nosePart = ellipsoid([0, 0, 0], [0.048 * hh, 0.1 * hh, 0.052 * hh], 8, 6);
    for (let i = 0; i < nosePart.pos.length; i += 3) {
      const v = new THREE.Vector3(nosePart.pos[i], nosePart.pos[i + 1], nosePart.pos[i + 2]);
      if (v.z < 0) v.z *= 0.3;
      v.y -= v.z * 0.35;
      v.applyQuaternion(noseQ).add(nose.p);
      nosePart.pos[i] = v.x; nosePart.pos[i + 1] = v.y; nosePart.pos[i + 2] = v.z;
      const nn = new THREE.Vector3(nosePart.nrm[i], nosePart.nrm[i + 1], nosePart.nrm[i + 2]).applyQuaternion(noseQ);
      nosePart.nrm[i] = nn.x; nosePart.nrm[i + 1] = nn.y; nosePart.nrm[i + 2] = nn.z;
    }
    push(skin, rigid(nosePart, 'head'), boneIndex, false);
    const ear = onHead(P, PI / 2 + 0.12, PI / 2 + 0.08 + P.eyeV * 0.5, -0.02);
    push(skin, rigid(ellipsoid([ear.p.x, ear.p.y, ear.p.z], [0.035 * hh, 0.14 * hh, 0.085 * hh], 8, 6), 'head'), boneIndex, false);
    push(skin, rigid(ellipsoid([ear.p.x, ear.p.y, ear.p.z], [0.035 * hh, 0.14 * hh, 0.085 * hh], 8, 6), 'head'), boneIndex, true);
    push(skin, loftPart({ bones: ['chest', 'neck', 'head'], blend: 0.015, segs: 12, keys: [
      [0, P.sh - 0.02, -0.006, P.neckR * 1.25, P.neckR * 1.1, P.neckR * 1.0],
      [0, P.sh + 0.02, -0.006, P.neckR, P.neckR * 1.02, P.neckR * 0.95],
      [0, P.chin + 0.01, 0.002, P.neckR * 0.95, P.neckR * 1.05, P.neckR * 0.95],
      [0, P.chin + 0.06 * hh + 0.03, P.hc[2] - 0.004, P.neckR * 1.1, P.neckR * 1.3, P.neckR],
    ] }, rest), boneIndex, false);
    const ax = P.shX, arm = [
      [ax + 0.012, P.sh - 0.07, -0.004, 0.028 * l, 0.03 * l],
      [ax + 0.016, P.elbow + 0.02, -0.007, 0.025 * l, 0.026 * l],
      [ax + 0.016, P.elbow, -0.008, 0.024 * l, 0.024 * l],
      [ax + 0.018, P.elbow - 0.05, -0.002, 0.025 * l, 0.026 * l],
      [ax + 0.02, P.wrist + 0.012, 0.004, 0.018 * l, 0.02 * l],
      [ax + 0.02, P.wrist - 0.004, 0.004, 0.017 * l, 0.019 * l],
    ];
    const armDef = { bones: ['armL', 'foreL', 'handL'], blend: 0.02, segs: 10, side: [0, 0, 1], keys: arm };
    push(skin, loftPart(armDef, rest), boneIndex, false);
    push(skin, loftPart(armDef, rest), boneIndex, true);
    const hx = ax + 0.021, hl = P.handLen;
    const palm = (x, y, z) => [1.04, 1.0, 0.98];
    const handDef = { bones: ['handL', 'fingL'], blend: 0.01, segs: 10, cap1: 3, capLen1: 0.7, col: palm, keys: [
      [hx, P.wrist + 0.005, 0.004, 0.012 * l, 0.019 * l, 0.019 * l],
      [hx, P.wrist - 0.3 * hl, 0.005, 0.0125 * l, 0.025 * l, 0.024 * l],
      [hx - 0.001, P.wrist - 0.55 * hl, 0.006, 0.011 * l, 0.024 * l, 0.023 * l],
      [hx - 0.002, P.wrist - 0.78 * hl, 0.006, 0.0085 * l, 0.021 * l, 0.02 * l],
      [hx - 0.002, P.wrist - 0.92 * hl, 0.006, 0.007 * l, 0.017 * l, 0.016 * l],
    ] };
    push(skin, loftPart(handDef, rest), boneIndex, false);
    push(skin, loftPart(handDef, rest), boneIndex, true);
    const thumbDef = { bones: ['handL'], segs: 6, cap1: 2, keys: [
      [hx - 0.004, P.wrist - 0.12 * hl, 0.018 * l, 0.008 * l, 0.009 * l],
      [hx - 0.008, P.wrist - 0.35 * hl, 0.027 * l, 0.0075 * l, 0.008 * l],
      [hx - 0.01, P.wrist - 0.55 * hl, 0.031 * l, 0.0065 * l, 0.007 * l],
    ] };
    push(skin, loftPart(thumbDef, rest), boneIndex, false);
    push(skin, loftPart(thumbDef, rest), boneIndex, true);

    // --- shirt ---
    const shirt = newBatch(), H0 = P.hipJ, SH = P.sh;
    push(shirt, loftPart({ bones: ['hips', 'spine', 'chest', 'neck'], blend: 0.03, segs: 16, cap1: 1, keys: [
      [0, H0 + 0.005, 0, P.hipW * 1.26, 0.07, P.belly * 1.2, 2.6],
      [0, H0 + 0.05, 0, P.hipW * 1.18, 0.07, P.belly * 1.14, 2.4],
      [0, H0 + 0.11, 0, P.waistW * 1.02, 0.06, P.belly * 1.04, 2.3],
      [0, H0 + 0.45 * (SH - H0), 0, P.waistW * 1.04, 0.06, P.belly, 2.3],
      [0, H0 + 0.75 * (SH - H0), 0.002, P.chestW, 0.064, 0.066, 2.4],
      [0, SH - 0.03, 0, P.chestW * 1.02, 0.06, 0.056, 2.5],
      [0, SH - 0.004, -0.002, P.chestW * 0.86, 0.05, 0.042, 2.4],
      [0, SH + 0.018, -0.004, P.chestW * 0.55, 0.042, 0.034, 2.2],
      [0, SH + 0.032, -0.005, P.neckR * 1.22, P.neckR * 1.12, P.neckR * 1.12, 2],
    ] }, rest), boneIndex, false);
    const sleeveDef = { bones: ['chest', 'clavL', 'armL'], blend: 0.02, segs: 12, side: [0, 0, 1], cap0: 2, capLen0: 0.6, keys: [
      [ax * 0.55, SH - 0.016, 0, 0.032, 0.034],
      [ax - 0.004, SH - 0.012, 0, 0.037, 0.039],
      [ax + 0.008, SH - 0.045, -0.002, 0.036 * l, 0.038 * l],
      [ax + 0.012, SH - 0.084, -0.004, 0.032 * l, 0.034 * l],
      [ax + 0.0125, SH - 0.09, -0.004, 0.033 * l, 0.035 * l],
    ] };
    push(shirt, loftPart(sleeveDef, rest), boneIndex, false);
    push(shirt, loftPart(sleeveDef, rest), boneIndex, true);

    // --- pants ---
    const pants = newBatch();
    push(pants, loftPart({ bones: ['hips'], segs: 14, cap0: 2, capLen0: 0.25, keys: [
      [0, H0 - 0.035, 0, P.hipW * 0.8, 0.05, 0.055, 2.2],
      [0, H0 + 0.0, 0, P.hipW * 0.99, 0.064, 0.068, 2.3],
      [0, H0 + 0.035, 0, P.hipW, 0.062, P.belly * 0.98, 2.3],
      [0, H0 + 0.06, 0, P.hipW * 0.96, P.belly * 0.98, P.belly * 0.92, 2.3],
    ] }, rest), boneIndex, false);
    const lx = P.hipX, K = P.knee;
    const legDef = { bones: ['hips', 'thighL', 'shinL'], blend: 0.03, segs: 12, keys: [
      [lx - 0.008, H0 + 0.02, 0, 0.056 * l, 0.064 * l, 0.068 * l],
      [lx, H0 - 0.05, 0.002, 0.058 * l, 0.06 * l, 0.063 * l],
      [lx + 0.002, K + 0.07, 0.006, 0.045 * l, 0.046 * l, 0.046 * l],
      [lx + 0.003, K, 0.008, 0.042 * l, 0.044 * l, 0.042 * l],
      [lx + 0.004, K - 0.08, 0.002, 0.042 * l, 0.04 * l, 0.048 * l],
      [lx + 0.005, P.ankle + 0.065, -0.004, 0.035 * l, 0.034 * l, 0.037 * l],
      [lx + 0.005, P.ankle + 0.01, -0.006, 0.039 * l, 0.042 * l, 0.043 * l],
    ] };
    push(pants, loftPart(legDef, rest), boneIndex, false);
    push(pants, loftPart(legDef, rest), boneIndex, true);

    // --- shoes ---
    const shoes = newBatch(), fx = lx + 0.005;
    const sole = (x, y) => (y < 0.011 ? [0.42, 0.42, 0.42] : [1, 1, 1]);
    const shoeDef = { bones: ['footL', 'toeL'], blend: 0.012, segs: 12, cap0: 2, cap1: 3, capLen0: 0.5, capLen1: 0.6, col: sole, keys: [
      [fx, 0.034, -0.045, 0.029, 0.026, 0.032],
      [fx, 0.042, -0.025, 0.033, 0.036, 0.04],
      [fx, 0.046, 0.005, 0.036, 0.042, 0.044],
      [fx + 0.003, 0.034, 0.055, 0.04, 0.026, 0.032],
      [fx + 0.004, 0.028, 0.092, 0.036, 0.019, 0.027],
      [fx + 0.004, 0.026, 0.115, 0.027, 0.014, 0.025],
    ] };
    push(shoes, loftPart(shoeDef, rest), boneIndex, false);
    push(shoes, loftPart(shoeDef, rest), boneIndex, true);

    // --- hair ---
    const hair = newBatch();
    const backLen = style === 0 ? 2.0 : 2.1, sideLen = style === 0 ? 1.42 : 1.5, frontLen = style === 0 ? 0.88 : 0.8;
    const phMax = (th) => {
      const c = Math.cos(th), f = Math.max(0, c), b = Math.max(0, -c);
      return sideLen - (sideLen - frontLen) * Math.pow(f, 1.6) + (backLen - sideLen) * Math.pow(b, 1.1);
    };
    const shell = headGrid(P, 22, 9, phMax, (th, ph, v) => {
      const thick = style === 0 ? 0.085 : 0.055, edge = 1 - Math.pow(v, 3) * 0.75;
      const tuft = style === 0 ? 0.03 * (vnoise(th * 3 + 7, ph * 4) - 0.5) : 0.0;
      return 1 + (thick * edge + tuft) * (1 - 0.3 * v) * 2.0;
    }, 3);
    push(hair, rigid(shell, 'head'), boneIndex, false);
    if (style === 1) {
      const t0 = rest.hairT;
      push(hair, loftPart({ bones: ['hairT'], segs: 10, cap0: 2, cap1: 3, capLen1: 1.2, keys: [
        [0, t0.y + 0.01 * hh, t0.z + 0.04 * hh, 0.1 * hh, 0.1 * hh],
        [0, t0.y - 0.08 * hh, t0.z - 0.1 * hh, 0.12 * hh, 0.12 * hh],
        [0, t0.y - 0.35 * hh, t0.z - 0.16 * hh, 0.1 * hh, 0.1 * hh],
        [0, t0.y - 0.65 * hh, t0.z - 0.12 * hh, 0.07 * hh, 0.07 * hh],
        [0, t0.y - 0.85 * hh, t0.z - 0.06 * hh, 0.03 * hh, 0.03 * hh],
      ] }, rest), boneIndex, false);
    } else if (style === 2) {
      const bp = onHead(P, PI, 0.95, 0.06);
      const bun = ellipsoid([bp.p.x, bp.p.y, bp.p.z], [0.19 * hh, 0.17 * hh, 0.17 * hh], 12, 9);
      for (let i = 0; i < bun.uv.length; i++) bun.uv[i] *= 3;
      push(hair, rigid(bun, 'head'), boneIndex, false);
    }
    // eyebrows
    for (const sg of [1, -1]) {
      const br = onHead(P, sg * 0.42, PI / 2 - 0.3 + P.eyeV * 0.5, 0.012);
      const bp = ellipsoid([0, 0, 0], [0.085 * hh, 0.018 * hh, 0.02 * hh], 8, 4);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, sg * 0.42, -sg * 0.1));
      for (let i = 0; i < bp.pos.length; i += 3) {
        const v = new THREE.Vector3(bp.pos[i], bp.pos[i + 1], bp.pos[i + 2]).applyQuaternion(q).add(br.p);
        bp.pos[i] = v.x; bp.pos[i + 1] = v.y; bp.pos[i + 2] = v.z;
        const nn = new THREE.Vector3(bp.nrm[i], bp.nrm[i + 1], bp.nrm[i + 2]).applyQuaternion(q);
        bp.nrm[i] = nn.x; bp.nrm[i + 1] = nn.y; bp.nrm[i + 2] = nn.z;
      }
      push(hair, rigid(bp, 'head'), boneIndex, false);
    }

    // --- eyes and mouth (rigid meshes on the head bone) ---
    const eyes = newBatch(), eyeCenters = [];
    for (const sg of [1, -1]) {
      const e = onHead(P, sg * 0.38, PI / 2 + P.eyeV, -0.022);
      eyeCenters.push(e.p.clone());
      const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), e.n);
      const add = (part, col) => {
        for (let i = 0; i < part.pos.length; i += 3) {
          const v = new THREE.Vector3(part.pos[i], part.pos[i + 1], part.pos[i + 2]).applyQuaternion(q).add(e.p);
          part.pos[i] = v.x; part.pos[i + 1] = v.y; part.pos[i + 2] = v.z;
          const nn = new THREE.Vector3(part.nrm[i], part.nrm[i + 1], part.nrm[i + 2]).applyQuaternion(q);
          part.nrm[i] = nn.x; part.nrm[i + 1] = nn.y; part.nrm[i + 2] = nn.z;
        }
        part.weights = () => [['head', 1]];
        part.col = () => col;
        push(eyes, part, boneIndex, false);
      };
      add(ellipsoid([0, 0, 0], [0.07 * hh, 0.043 * hh, 0.035 * hh], 10, 6), [0.8, 0.76, 0.7]);
      add(ellipsoid([0, 0, 0.026 * hh], [0.036 * hh, 0.038 * hh, 0.016 * hh], 8, 6), [0.045, 0.03, 0.02]);
    }
    const eyeGeo = toGeometry(eyes, false);
    const mo = onHead(P, 0, PI / 2 + 0.5 + P.eyeV * 0.35, -0.005);
    const mouthGeo = toGeometry((() => { const b = newBatch(); const m = ellipsoid([mo.p.x, mo.p.y, mo.p.z], [0.11 * hh, 0.022 * hh, 0.03 * hh], 10, 5); m.weights = () => [['head', 1]]; push(b, m, boneIndex, false); return b; })(), false);

    const T = {
      P, defs, rest, boneIndex,
      skin: toGeometry(skin, true), shirt: toGeometry(shirt, true), pants: toGeometry(pants, true), shoes: toGeometry(shoes, true), hair: toGeometry(hair, true),
      eyes: eyeGeo, mouth: mouthGeo, eyeCenter: eyeCenters[0].y,
    };
    cache[key] = T;
    return T;
  }

  // ---------- materials (cached by color) ----------
  const mats = {};
  function mat(kind, css) {
    const key = kind + '|' + css;
    if (mats[key]) return mats[key];
    let m;
    switch (kind) {
      case 'skin': m = new THREE.MeshStandardMaterial({ color: cssColor(css, '#E7B48F'), roughness: 0.62, metalness: 0, vertexColors: true }); break;
      case 'lip': { const c = cssColor(css, '#E7B48F'); c.r *= 0.72; c.g *= 0.45; c.b *= 0.42; m = new THREE.MeshStandardMaterial({ color: c, roughness: 0.45 }); break; }
      case 'shirt': m = new THREE.MeshStandardMaterial({ color: cssColor(css, '#3F7FD8'), map: getFabric(), roughness: 0.9, metalness: 0 }); break;
      case 'pants': m = new THREE.MeshStandardMaterial({ color: cssColor(css, '#2F3E66'), map: getFabric(), roughness: 0.88, metalness: 0 }); break;
      case 'shoes': m = new THREE.MeshStandardMaterial({ color: cssColor(css, '#3A3A3A'), roughness: 0.55, metalness: 0, vertexColors: true }); break;
      case 'hair': m = new THREE.MeshStandardMaterial({ color: cssColor(css, '#5A3A22'), map: getHair(), roughness: 0.55, metalness: 0, side: THREE.DoubleSide }); break;
      default: m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.12, metalness: 0 });
    }
    mats[key] = m;
    return m;
  }

  // ---------- IK helpers ----------
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
  const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion(), _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), DOWN = new THREE.Vector3(0, -1, 0);
  function rootPos(bone, top, out) { out.set(0, 0, 0); let o = bone; while (o && o !== top) { out.applyQuaternion(o.quaternion).add(o.position); o = o.parent; } return out; }
  function rootQuat(bone, top, out) { out.identity(); let o = bone; while (o && o !== top) { out.premultiply(o.quaternion); o = o.parent; } return out; }
  function ik2(P0, T, L1, L2, pole, out) {
    _v5.subVectors(T, P0);
    let d = _v5.length();
    if (d < 1e-6) { _v5.set(0, -1, 0); d = 1e-6; }
    _v5.divideScalar(d);
    d = clamp(d, Math.abs(L1 - L2) + 1e-4, L1 + L2 - 1e-4);
    const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
    _v6.copy(pole).addScaledVector(_v5, -pole.dot(_v5));
    if (_v6.lengthSq() < 1e-8) _v6.set(0, 0, 1);
    _v6.normalize();
    return out.copy(P0).addScaledVector(_v5, a).addScaledVector(_v6, h);
  }
  function aimBone(bone, parentQ, a, b, restDir, outQ) {
    _v4.subVectors(b, a);
    if (_v4.lengthSq() < 1e-12) return outQ.multiplyQuaternions(parentQ, bone.quaternion);
    _v4.normalize();
    _q5.copy(parentQ).invert();
    _v4.applyQuaternion(_q5);
    bone.quaternion.setFromUnitVectors(restDir, _v4);
    return outQ.multiplyQuaternions(parentQ, bone.quaternion);
  }
  function orientX(bone, parentQ, ang) { _q4.setFromAxisAngle(AX, ang); _q5.copy(parentQ).invert(); bone.quaternion.multiplyQuaternions(_q5, _q4); }

  // ---------- build ----------
  let count = 0;
  function build(look) {
    look = look || {};
    const height = clamp(+look.height || 1.7, 1.0, 2.1);
    const style = [0, 1, 2].indexOf(look.hairStyle | 0) >= 0 ? look.hairStyle | 0 : 0;
    const bucket = Math.round(clamp((height - 1.15) / (1.62 - 1.15), 0, 1) * 2);
    const T = getTemplate(bucket, style), P = T.P;
    const root = new THREE.Group(), body = new THREE.Group();
    root.name = 'person';
    body.scale.setScalar(height);
    root.add(body);
    const B = {}, list = [];
    for (const d of T.defs) {
      const b = new THREE.Bone();
      b.name = d.name;
      b.position.copy(d.p);
      if (d.parent) { b.position.sub(T.rest[d.parent]); B[d.parent].add(b); } else body.add(b);
      B[d.name] = b; list.push(b);
    }
    body.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(list);
    const addSkinned = (geo, m) => { const s = new THREE.SkinnedMesh(geo, m); s.castShadow = true; s.receiveShadow = false; body.add(s); s.bind(skel); return s; };
    addSkinned(T.skin, mat('skin', look.skin));
    addSkinned(T.shirt, mat('shirt', look.shirt));
    addSkinned(T.pants, mat('pants', look.pants));
    addSkinned(T.shoes, mat('shoes', look.shoes));
    addSkinned(T.hair, mat('hair', look.hair));
    // eyes pivot at eye level so blinking squashes them in place
    const eyePiv = new THREE.Group();
    eyePiv.position.set(0, T.eyeCenter, 0).sub(T.rest.head);
    B.head.add(eyePiv);
    const eyes = new THREE.Mesh(T.eyes, mat('eyes', ''));
    eyes.position.set(0, -T.eyeCenter, 0);
    eyePiv.add(eyes);
    const mouth = new THREE.Mesh(T.mouth, mat('lip', look.skin));
    mouth.position.copy(T.rest.head).negate();
    B.head.add(mouth);
    for (const m of [eyes, mouth]) { m.castShadow = true; m.receiveShadow = false; }
    for (const nm in B) B[nm].userData.p0 = B[nm].position.clone();
    for (const nm of ['head', 'neck', 'chest', 'spine', 'hips', 'hairT']) B[nm].rotation.order = 'YXZ';
    count++;
    const rnd = fract(count * 0.7548776662 + 0.31);

    // leg / arm constants (template units)
    const legs = ['L', 'R'].map((s, i) => ({
      i, sg: i === 0 ? 1 : -1, thigh: B['thigh' + s], shin: B['shin' + s], foot: B['foot' + s], toe: B['toe' + s],
      L1: T.rest['thigh' + s].distanceTo(T.rest['shin' + s]), L2: T.rest['shin' + s].distanceTo(T.rest['foot' + s]),
      d0: T.rest['shin' + s].clone().sub(T.rest['thigh' + s]).normalize(), d1: T.rest['foot' + s].clone().sub(T.rest['shin' + s]).normalize(),
      ank: T.rest['foot' + s].clone(), pole: new THREE.Vector3(),
    }));
    const arms = ['L', 'R'].map((s, i) => ({
      i, sg: i === 0 ? 1 : -1, arm: B['arm' + s], fore: B['fore' + s], hand: B['hand' + s], fing: B['fing' + s],
      L1: T.rest['arm' + s].distanceTo(T.rest['fore' + s]), L2: T.rest['fore' + s].distanceTo(T.rest['hand' + s]),
      d0: T.rest['fore' + s].clone().sub(T.rest['arm' + s]).normalize(), d1: T.rest['hand' + s].clone().sub(T.rest['fore' + s]).normalize(),
    }));
    const hip0 = B.hips.userData.p0.clone(), tail = B.hairT;
    const S = { ph: rnd, spd: 0, move: 0, run: 0, crouch: 0, reach: 0, sit: 0, look: 0, lookP: 0, idle: 0 };
    const qFK1 = new THREE.Quaternion(), qFK2 = new THREE.Quaternion(), qFK3 = new THREE.Quaternion();
    const shP = new THREE.Vector3(), tgt = new THREE.Vector3(), elb = new THREE.Vector3(), pole = new THREE.Vector3(), qP = new THREE.Quaternion(), qA = new THREE.Quaternion(), qB = new THREE.Quaternion();
    const hipP = new THREE.Vector3(), knee = new THREE.Vector3(), ankT = new THREE.Vector3();
    const walkV = 0.8 * height;

    function update(dt, st) {
      st = st || {};
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0, spdIn = Math.max(0, st.speed || 0);
      S.spd = damp(S.spd, spdIn, 6, dt);
      S.move = damp(S.move, spdIn > 0.05 ? 1 : 0, 5, dt);
      S.run = damp(S.run, sstep(walkV * 1.5, walkV * 2.6, spdIn), 4, dt);
      S.crouch = damp(S.crouch, sat(st.crouch || 0), 4, dt);
      S.reach = damp(S.reach, sat(st.reach || 0), 4, dt);
      // sitting on a chair, a swing or a bench: seatY is how high the seat is, in meters
      S.sit = damp(S.sit, sat(st.sit || 0), 5, dt);
      S.idle = spdIn > 0.05 ? 0 : S.idle + dt;
      const spd = S.spd, run = S.run, cr = S.crouch, rc = S.reach, sit = S.sit;
      const seatH = (st.seatY !== undefined ? st.seatY : 0.42) / height + 0.035;
      const mv = S.move * (1 - cr * 0.85) * (1 - sit);
      // stride: cycle length in meters grows with speed
      const L = 0.8 * height * clamp(Math.pow(Math.max(spd, 0.15) / walkV, 0.55), 0.55, 2.4) * (1 + run * 0.15);
      S.ph += (spd / L) * dt;
      const Lt = L / height, duty = lerp(0.6, 0.36, run), w2 = TAU * S.ph;

      // ----- pelvis and spine -----
      const bobW = 0.011 * Math.cos(2 * TAU * (S.ph - duty * 0.5)), bobR = -0.025 * Math.cos(2 * TAU * (S.ph - duty * 0.5));
      const bob = lerp(bobW, bobR, run) * mv;
      const sway = Math.sin(t * 0.55 + rnd * 10) * 0.004 * (1 - S.move);
      const lean = run * 0.14 * mv + cr * 0.5 + rc * 0.16 * (1 - cr * 0.5);
      const crDrop = cr * (P.hipJ - P.knee) * 0.92, crBack = cr * 0.07;
      B.hips.position.set(hip0.x + sway, lerp(hip0.y + bob - 0.012 * mv - crDrop, seatH, sit), hip0.z - crBack * (1 - sit));
      B.hips.rotation.set(lean * 0.45 + 0.02 * mv, 0.09 * Math.sin(w2) * mv * (1 - run * 0.4), 0.035 * Math.sin(w2) * mv * (1 - run));
      const breathe = Math.sin(t * 1.5 + rnd * 7) * 0.012;
      B.spine.rotation.set(lean * 0.3 + breathe * 0.4, -0.06 * Math.sin(w2) * mv, -0.02 * Math.sin(w2) * mv);
      B.chest.rotation.set(lean * 0.25 + breathe, -0.1 * Math.sin(w2) * mv, 0);

      // ----- legs -----
      for (const lg of legs) {
        const p = fract(S.ph + lg.i * 0.5);
        let dz, dy, fp, toe;
        if (p < duty) {
          const s = p / duty;
          dz = (0.5 - s) * duty * Lt; dy = 0;
          fp = -0.22 * (1 - sstep(0, 0.18, s)) + 0.55 * sstep(0.65, 1, s) * (1 - run * 0.3);
          toe = -0.6 * sstep(0.65, 1, s);
        } else {
          const s = (p - duty) / (1 - duty), e = sstep(0, 1, s);
          dz = (e - 0.5) * duty * Lt;
          dy = Math.sin(PI * s) * lerp(0.035, 0.11, run);
          fp = lerp(0.5, -0.22, sstep(0, 0.85, s));
          toe = -0.3 * (1 - sstep(0, 0.4, s));
        }
        lg.dz = dz / Math.max(1e-3, duty * Lt * 0.5);
        // heel lifted when the foot pitches toe-down (pivot about the ball), toe raised at heel strike
        const ay = dy + Math.max(0, fp) * 0.065 + Math.max(0, -fp) * 0.02;
        fp *= mv; toe *= mv;
        const cx = lg.ank.x + lg.sg * cr * 0.02, cy = lg.ank.y + ay * mv + cr * 0.016, cz = lg.ank.z + dz * mv;
        ankT.set(lerp(cx, lg.ank.x + lg.sg * 0.015, sit), lerp(cy, lg.ank.y, sit), lerp(cz, lg.ank.z + lg.L1 * 0.9, sit));
        rootPos(lg.thigh, body, hipP);
        rootQuat(lg.thigh.parent, body, qP);
        lg.pole.set(lg.sg * cr * 0.45, 0, 1).normalize();
        ik2(hipP, ankT, lg.L1, lg.L2, lg.pole, knee);
        aimBone(lg.thigh, qP, hipP, knee, lg.d0, qA);
        _v1.subVectors(ankT, knee).normalize().multiplyScalar(lg.L2).add(knee);
        aimBone(lg.shin, qA, knee, _v1, lg.d1, qB);
        orientX(lg.foot, qB, fp + cr * 0.28);
        lg.toe.rotation.set(toe - cr * 0.28, 0, 0);
      }

      // ----- arms -----
      for (const a of arms) {
        const other = legs[1 - a.i];
        const swing = lerp(0.28, 0.75, run) * mv * other.dz;
        const elbowF = 0.18 + run * 1.25 * mv + Math.max(0, swing) * 0.4;
        // the torso pitch is cancelled so arms hang vertically; crouching rests the forearms forward over the knees
        a.arm.rotation.set(-swing - lean * 0.95 - cr * 0.35 - sit * 0.35, 0, a.sg * (0.07 + run * 0.08 * mv + cr * 0.12));
        a.fore.rotation.set(-elbowF - cr * 0.55 - sit * 0.8, 0, 0);
        a.hand.rotation.set(-0.05, 0, a.sg * 0.05);
        a.fing.rotation.set(0, 0, -a.sg * (0.35 + run * 0.4));
      }
      // reach: right arm IK toward a point forward and down, blended over the swing pose
      if (rc > 0.001) {
        const a = arms[1];
        qFK1.copy(a.arm.quaternion); qFK2.copy(a.fore.quaternion); qFK3.copy(a.hand.quaternion);
        rootPos(a.arm, body, shP);
        rootQuat(a.arm.parent, body, qP);
        _v2.set(0.1, -lerp(0.95, 0.75, cr), 0.85).normalize();
        tgt.copy(shP).addScaledVector(_v2, (a.L1 + a.L2) * 0.96);
        pole.set(-0.6, -0.6, -0.5).normalize();
        ik2(shP, tgt, a.L1, a.L2, pole, elb);
        aimBone(a.arm, qP, shP, elb, a.d0, qA);
        _v1.subVectors(tgt, elb).normalize().multiplyScalar(a.L2).add(elb);
        aimBone(a.fore, qA, elb, _v1, a.d1, qB);
        // palm turned down, wrist slightly extended, fingers open
        _q1.setFromAxisAngle(AY, 1.45);
        _q2.setFromAxisAngle(AX, 0.0);
        a.hand.quaternion.copy(_q1).multiply(_q2);
        a.arm.quaternion.copy(qFK1.slerp(a.arm.quaternion, rc));
        a.fore.quaternion.copy(qFK2.slerp(a.fore.quaternion, rc));
        a.hand.quaternion.copy(qFK3.slerp(a.hand.quaternion, rc));
        a.fing.rotation.z *= 1 - rc;
      }

      // ----- head -----
      const lookOn = sstep(1.5, 3, S.idle) * (1 - rc);
      S.look = damp(S.look, (Math.sin(t * 0.37 + rnd * 20) * 0.5 + Math.sin(t * 0.13 + rnd * 7) * 0.3) * lookOn, 2, dt);
      const down = cr * 0.25 + rc * 0.35 + sit * 0.08;
      const comp = -(lean * 0.45 + lean * 0.3 + lean * 0.25) * 0.85;
      B.neck.rotation.set((comp + down) * 0.4 - breathe * 0.5, S.look * 0.4, 0);
      B.head.rotation.set((comp + down) * 0.6 + 0.04 * Math.sin(2 * w2) * mv, S.look * 0.6 + 0.08 * Math.sin(w2) * mv, 0);
      // ponytail swing
      tail.rotation.set(0.15 * mv * Math.sin(2 * w2 + 1) - lean * 0.6, 0, 0.18 * Math.sin(w2) * mv);
      // blink
      const bp = fract(t / (3.1 + rnd * 2) + rnd), bk = bp * (3.1 + rnd * 2);
      eyePiv.scale.y = bk < 0.14 ? Math.max(0.1, Math.abs(1 - bk / 0.07)) : 1;
    }

    update(0, { t: 0, speed: 0, crouch: 0, reach: 0 });
    return {
      root, height,
      radius: 0.15 * height,
      headHeight: (P.chin + P.ry) * height,
      stride: 0.8 * height,
      update,
      setVisible(v) { root.visible = !!v; },
      // hold something in the left hand (a pet carrier, a net, a basket, a book); null puts it away
      hold(obj) {
        if (this.held) B.handL.remove(this.held);
        this.held = obj || null;
        if (obj) { obj.scale.setScalar(1 / height); obj.position.set(0, -P.handLen * 0.55, 0); obj.rotation.z = (obj.userData && obj.userData.roll) || 0; obj.traverse((m) => { if (m.isMesh) m.castShadow = true; }); B.handL.add(obj); }
      },
      held: null,
    };
  }

  return { build };
})();
