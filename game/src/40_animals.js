// ---------- Animals: procedural 3D animal rigs (three.js r149, skinned lofts) ----------
const Animals = (() => {
  const ids = ['duck', 'swan', 'chicken', 'frog', 'lizard', 'snake', 'bunny', 'squirrel', 'turtle', 'fox', 'owl', 'deer', 'parrot', 'moose'];
  const TAU = Math.PI * 2, PI = Math.PI, DEG = Math.PI / 180;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const sat = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const sstep = (a, b, v) => { const t = sat((v - a) / (b - a)); return t * t * (3 - 2 * t); };
  const damp = (c, t, r, dt) => c + (t - c) * (1 - Math.exp(-r * dt));
  const fract = (x) => x - Math.floor(x);

  // ---------- noise ----------
  function hash3(x, y, z) {
    let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1) ^ Math.imul(z | 0, 0x9e3779b1);
    h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
  }
  function noise(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let fx = x - ix, fy = y - iy, fz = z - iz;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy); fz = fz * fz * (3 - 2 * fz);
    const a = lerp(hash3(ix, iy, iz), hash3(ix + 1, iy, iz), fx);
    const b = lerp(hash3(ix, iy + 1, iz), hash3(ix + 1, iy + 1, iz), fx);
    const c = lerp(hash3(ix, iy, iz + 1), hash3(ix + 1, iy, iz + 1), fx);
    const d = lerp(hash3(ix, iy + 1, iz + 1), hash3(ix + 1, iy + 1, iz + 1), fx);
    return lerp(lerp(a, b, fy), lerp(c, d, fy), fz);
  }
  function fbm(x, y, z, oct) {
    let s = 0, a = 0.5, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += a * noise(x * f + i * 17.3, y * f, z * f); n += a; f *= 2.07; a *= 0.5; }
    return s / n;
  }
  // Worley F1 distance (cell units) for spots and mottling
  function cells(x, y, z) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    let best = 9;
    for (let k = -1; k <= 1; k++) for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
      const cx = ix + i, cy = iy + j, cz = iz + k;
      const dx = cx + hash3(cx, cy, cz) - x, dy = cy + hash3(cx + 31, cy, cz) - y, dz = cz + hash3(cx, cy + 57, cz) - z;
      const d = dx * dx + dy * dy + dz * dz;
      if (d < best) best = d;
    }
    return Math.sqrt(best);
  }

  // ---------- color ----------
  const hex = (h) => [((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255];
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  function linColor(h) { const a = hex(h), c = new THREE.Color(); c.r = s2l(a[0]); c.g = s2l(a[1]); c.b = s2l(a[2]); return c; }
  // paint output helpers (C holds sRGB 0..1 plus roughness/metalness)
  const cset = (C, c) => { C.r = c[0]; C.g = c[1]; C.b = c[2]; };
  const cmix = (C, c, t) => { if (t <= 0) return; if (t > 1) t = 1; C.r += (c[0] - C.r) * t; C.g += (c[1] - C.g) * t; C.b += (c[2] - C.b) * t; };
  const cmul = (C, f) => { C.r *= f; C.g *= f; C.b *= f; };

  // ---------- loft geometry ----------
  // key: [x, y, z, halfWidth, top, bottom, exponent]; cross sections are perpendicular to the path.
  const SF = ['x', 'y', 'z', 'w', 't', 'b', 'e'];
  function station(a) { return { x: a[0], y: a[1], z: a[2], w: a[3], t: a[4], b: a[5] === undefined ? a[4] : a[5], e: a[6] || 2 }; }
  function crStation(k0, k1, k2, k3, t) {
    const o = {}, t2 = t * t, t3 = t2 * t;
    for (let i = 0; i < 7; i++) {
      const f = SF[i], p0 = k0[f], p1 = k1[f], p2 = k2[f], p3 = k3[f];
      let v = 0.5 * (2 * p1 + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
      if (i >= 3) { const lo = Math.min(p1, p2), hi = Math.max(p1, p2); v = clamp(v, lo * 0.9, hi * 1.08); }
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
  function buildLoft(def) {
    const keys = def.keys.map(station), segs = def.segs || 10, sub = def.sub || 3;
    const n = keys.length, st = [];
    const refl = (a, b) => { const o = Object.assign({}, a); o.x = 2 * a.x - b.x; o.y = 2 * a.y - b.y; o.z = 2 * a.z - b.z; return o; };
    for (let i = 0; i < n - 1; i++) {
      const k0 = i > 0 ? keys[i - 1] : refl(keys[0], keys[1]);
      const k3 = i + 2 < n ? keys[i + 2] : refl(keys[n - 1], keys[n - 2]);
      for (let s = 0; s < sub; s++) st.push(crStation(k0, keys[i], keys[i + 1], k3, s / sub));
    }
    st.push(Object.assign({}, keys[n - 1]));
    const V = (s) => new THREE.Vector3(s.x, s.y, s.z);
    const addCap = (atEnd, nr, lenScale) => {
      const B = atEnd ? st[st.length - 1] : st[0], C2 = atEnd ? st[st.length - 2] : st[1];
      const T = V(B).sub(V(C2)).normalize();
      const r = (B.w + (B.t + B.b) * 0.5) * 0.5, L = r * (lenScale || 0.9);
      const caps = [];
      for (let k = 1; k <= nr; k++) {
        const ph = (k / nr) * PI * 0.5, c = Math.cos(ph);
        const p = V(B).addScaledVector(T, L * Math.sin(ph));
        caps.push({ x: p.x, y: p.y, z: p.z, w: B.w * c, t: B.t * c, b: B.b * c, e: B.e });
      }
      if (atEnd) st.push(...caps); else st.unshift(...caps.reverse());
    };
    if (def.cap0) addCap(false, def.cap0 === true ? 3 : def.cap0, def.capLen0);
    if (def.cap1) addCap(true, def.cap1 === true ? 3 : def.cap1, def.capLen1);
    const R = st.length, side0 = new THREE.Vector3().fromArray(def.side || [1, 0, 0]);
    const rings = [];
    let arc = 0;
    for (let i = 0; i < R; i++) {
      const s = st[i], C = V(s);
      const a = st[Math.max(0, i - 1)], b = st[Math.min(R - 1, i + 1)];
      const T = new THREE.Vector3(b.x - a.x, b.y - a.y, b.z - a.z);
      if (T.lengthSq() < 1e-12) T.set(0, 0, 1); T.normalize();
      const N = new THREE.Vector3().crossVectors(T, side0);
      if (N.lengthSq() < 1e-8) N.set(0, 1, 0); N.normalize();
      const S = new THREE.Vector3().crossVectors(N, T).normalize();
      if (i > 0) arc += C.distanceTo(rings[i - 1].C);
      rings.push({ C, T, N, S, w: s.w, t: s.t, b: s.b, e: s.e, arc });
    }
    const len = arc || 1e-6;
    const pos = [], idx = [], uvu = [], arcs = [], ringOf = [], tmp = [0, 0];
    const fz = def.fuzz || 0, fzf = def.fuzzFreq || 9;
    for (let i = 0; i < R; i++) {
      const r = rings[i];
      for (let j = 0; j <= segs; j++) {
        const th = (j / segs) * TAU;
        sectionPoint(r.w, r.t, r.b, r.e, th, tmp);
        if (fz) {
          const jj = j % segs, ends = sstep(0, 0.12, r.arc / Math.max(arc, 1e-6)) * sstep(1, 0.88, r.arc / Math.max(arc, 1e-6));
          const k = 1 + fz * ends * (noise(i * 0.9 + 0.5, (jj / segs) * fzf, 3.7) - 0.45) * 2;
          tmp[0] *= k; tmp[1] *= k;
        }
        pos.push(r.C.x + r.S.x * tmp[0] + r.N.x * tmp[1], r.C.y + r.S.y * tmp[0] + r.N.y * tmp[1], r.C.z + r.S.z * tmp[0] + r.N.z * tmp[1]);
        uvu.push(j / segs); arcs.push(r.arc); ringOf.push(i);
      }
    }
    const rw = segs + 1;
    for (let i = 0; i < R - 1; i++) for (let j = 0; j < segs; j++) {
      const a = i * rw + j, b = a + rw, c = a + 1, d = b + 1;
      idx.push(a, b, c, b, d, c);
    }
    const nrm = computeNormals(pos, idx);
    for (let i = 0; i < R; i++) {
      const a = i * rw, b = a + segs;
      let x = nrm[a * 3] + nrm[b * 3], y = nrm[a * 3 + 1] + nrm[b * 3 + 1], z = nrm[a * 3 + 2] + nrm[b * 3 + 2];
      const l = Math.hypot(x, y, z) || 1; x /= l; y /= l; z /= l;
      nrm[a * 3] = nrm[b * 3] = x; nrm[a * 3 + 1] = nrm[b * 3 + 1] = y; nrm[a * 3 + 2] = nrm[b * 3 + 2] = z;
      const r = rings[i];
      if (Math.max(r.w, r.t, r.b) < 1e-4) {
        const sg = i === 0 ? -1 : 1;
        for (let j = 0; j <= segs; j++) { const k = (a + j) * 3; nrm[k] = r.T.x * sg; nrm[k + 1] = r.T.y * sg; nrm[k + 2] = r.T.z * sg; }
      }
    }
    return { rings, segs, pos, idx, nrm, uvu, arcs, ringOf, len };
  }
  function computeNormals(pos, idx) {
    const n = new Float32Array(pos.length);
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i] * 3, b = idx[i + 1] * 3, c = idx[i + 2] * 3;
      const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
      const vx = pos[c] - pos[a], vy = pos[c + 1] - pos[a + 1], vz = pos[c + 2] - pos[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (const k of [a, b, c]) { n[k] += nx; n[k + 1] += ny; n[k + 2] += nz; }
    }
    for (let i = 0; i < n.length; i += 3) { const l = Math.hypot(n[i], n[i + 1], n[i + 2]) || 1; n[i] /= l; n[i + 1] /= l; n[i + 2] /= l; }
    return Array.from(n);
  }
  // interpolated ring at arc length s (for texture painting)
  function ringAt(L, s, o) {
    const rs = L.rings;
    let i = 0;
    while (i < rs.length - 2 && rs[i + 1].arc < s) i++;
    const a = rs[i], b = rs[i + 1] || a, span = b.arc - a.arc, f = span > 1e-9 ? clamp((s - a.arc) / span, 0, 1) : 0;
    o.C.lerpVectors(a.C, b.C, f); o.S.lerpVectors(a.S, b.S, f).normalize(); o.N.lerpVectors(a.N, b.N, f).normalize();
    o.w = lerp(a.w, b.w, f); o.t = lerp(a.t, b.t, f); o.b = lerp(a.b, b.b, f); o.e = lerp(a.e, b.e, f);
    return o;
  }

  // ---------- skin weights for a loft part ----------
  // bones: ordered names along the path. Each bone after the first takes over at the projection of its pivot onto the path.
  function skinStarts(L, names, rest) {
    const R = L.rings.length, starts = [];
    for (let k = 0; k < names.length; k++) {
      if (k === 0) { starts.push(-1e9); continue; }
      const p = rest[names[k]];
      let best = 1e9, bi = 0;
      for (let i = 0; i < R; i++) { const d = L.rings[i].C.distanceToSquared(p); if (d < best) { best = d; bi = i; } }
      starts.push(L.rings[bi].arc);
    }
    return starts;
  }
  // bone weights at arc length s along the path
  function skinAt(starts, names, s, blend) {
    let k = 0;
    while (k < names.length - 1 && s >= starts[k + 1]) k++;
    const w = new Map();
    w.set(k, 1);
    if (k + 1 < names.length) { const f = 1 - sstep(starts[k + 1] - blend, starts[k + 1] + blend, s); const g = 1 - f; if (g > 0.001) { w.set(k + 1, g); w.set(k, f); } }
    if (k > 0) { const g = 1 - sstep(starts[k] - blend, starts[k] + blend, s); if (g > 0.001) { const cur = w.get(k); w.set(k - 1, g * cur); w.set(k, cur * (1 - g)); } }
    return Array.from(w.entries()).map(([kk, ww]) => [names[kk], ww]);
  }
  function skinLoft(L, names, rest, blend) {
    const starts = skinStarts(L, names, rest);
    return L.rings.map((r) => skinAt(starts, names, r.arc, blend));
  }

  // ---------- geometry assembly ----------
  // A "part" is a loft or custom mesh with per-vertex bone weights. Parts are merged per material into one skinned geometry.
  function newBatch(age) { return { pos: [], nrm: [], uv: [], duv: [], col: [], si: [], sw: [], idx: [], age: age || null, mor: age ? [] : null, parts: [] }; }
  const _pv = new THREE.Vector3(), _pn = new THREE.Vector3(), _pd = new THREE.Vector3();
  function pushPart(bt, P, boneIndex, uvFn, colFn, mirror) {
    const base = bt.pos.length / 3, nv = P.pos.length / 3;
    // index range of this part (fur shells pick parts by name)
    bt.parts.push({ name: P.name || '', i0: bt.idx.length, i1: bt.idx.length + P.idx.length });
    for (let v = 0; v < nv; v++) {
      const x = P.pos[v * 3], y = P.pos[v * 3 + 1], z = P.pos[v * 3 + 2];
      bt.pos.push(mirror ? -x : x, y, z);
      bt.nrm.push(mirror ? -P.nrm[v * 3] : P.nrm[v * 3], P.nrm[v * 3 + 1], P.nrm[v * 3 + 2]);
      const uv = uvFn ? uvFn(v) : [0, 0];
      bt.uv.push(uv[0], uv[1]);
      if (P.duv) bt.duv.push(mirror ? -P.duv[v * 3] : P.duv[v * 3], P.duv[v * 3 + 1], P.duv[v * 3 + 2]); else bt.duv.push(0, 0, 0);
      const c = colFn ? colFn(v, x, y, z) : [1, 1, 1];
      bt.col.push(s2l(c[0]), s2l(c[1]), s2l(c[2]));
      const ws = P.weights(v);
      const four = [[0, 0], [0, 0], [0, 0], [0, 0]];
      let tot = 0;
      for (let k = 0; k < Math.min(4, ws.length); k++) { let nm = ws[k][0]; if (mirror) nm = mirrorName(nm, boneIndex); four[k] = [boneIndex[nm], ws[k][1]]; tot += ws[k][1]; }
      for (let k = 0; k < 4; k++) { four[k][0] = four[k][0] || 0; four[k][1] = tot > 0 ? four[k][1] / tot : (k === 0 ? 1 : 0); bt.si.push(four[k][0]); bt.sw.push(four[k][1]); }
      if (bt.mor) {
        _pv.set(mirror ? -x : x, y, z); _pn.set(mirror ? -P.nrm[v * 3] : P.nrm[v * 3], P.nrm[v * 3 + 1], P.nrm[v * 3 + 2]);
        babyDelta(bt.age, _pv, P.fluff === false ? null : _pn, four, _pd);
        // parts can bring an extra newborn offset (hair cards: a foal's short mane and tail)
        if (P.babyAdd) { const b = P.babyAdd(v); _pd.x += mirror ? -b[0] : b[0]; _pd.y += b[1]; _pd.z += b[2]; }
        // a part's own baby shape change (adult space), through the linear part of its bones' baby maps
        if (P.bdelta) {
          const dx = P.bdelta[v * 3] * (mirror ? -1 : 1), dy = P.bdelta[v * 3 + 1], dz = P.bdelta[v * 3 + 2];
          for (let k = 0; k < 4; k++) {
            const w = four[k][1];
            if (w <= 0) continue;
            const M = bt.age.maps[four[k][0]].M;
            _pd.x += w * (M[0] * dx + M[1] * dy + M[2] * dz); _pd.y += w * (M[3] * dx + M[4] * dy + M[5] * dz); _pd.z += w * (M[6] * dx + M[7] * dy + M[8] * dz);
          }
        }
        bt.mor.push(_pd.x, _pd.y, _pd.z);
      }
    }
    for (let i = 0; i < P.idx.length; i += 3) {
      if (mirror) bt.idx.push(base + P.idx[i], base + P.idx[i + 2], base + P.idx[i + 1]);
      else bt.idx.push(base + P.idx[i], base + P.idx[i + 1], base + P.idx[i + 2]);
    }
  }
  function mirrorName(nm, boneIndex) {
    if (nm.endsWith('L')) { const r = nm.slice(0, -1) + 'R'; if (boneIndex[r] !== undefined) return r; }
    return nm;
  }
  function batchGeometry(bt, withColor) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bt.pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(bt.nrm, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(bt.uv, 2));
    if (!withColor) g.setAttribute('duv', new THREE.Float32BufferAttribute(bt.duv, 3));
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(bt.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bt.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bt.sw, 4));
    g.setIndex(bt.idx);
    if (bt.mor) { g.morphAttributes.position = [new THREE.Float32BufferAttribute(bt.mor, 3)]; g.morphTargetsRelative = true; }
    g.computeBoundingSphere();
    g.boundingSphere.radius *= 1.35;
    return g;
  }

  // ---------- custom small meshes (in rest root space) ----------
  // flat fan / web: outline points (closed polygon, roughly convex) around a center, thickness via two layers
  function fanPart(center, outline, thick, normalDir) {
    const pos = [], idx = [];
    const n = outline.length;
    const up = new THREE.Vector3().fromArray(normalDir || [0, 1, 0]).normalize();
    for (let s = 0; s < 2; s++) {
      const off = (s ? -0.5 : 0.5) * thick;
      pos.push(center[0] + up.x * off, center[1] + up.y * off, center[2] + up.z * off);
      for (const p of outline) pos.push(p[0] + up.x * off, p[1] + up.y * off, p[2] + up.z * off);
    }
    const b = n + 1;
    for (let i = 0; i < n; i++) {
      const a = 1 + i, c = 1 + ((i + 1) % n);
      idx.push(0, a, c);
      idx.push(b, b + c, b + a);
      idx.push(a, b + a, c, c, b + a, b + c);
    }
    const nrm = computeNormals(pos, idx);
    // make the face normals crisp up/down
    for (let i = 0; i < pos.length / 3; i++) { const sg = i < b ? 1 : -1; nrm[i * 3] = up.x * sg; nrm[i * 3 + 1] = up.y * sg; nrm[i * 3 + 2] = up.z * sg; }
    return { pos, nrm, idx };
  }
  // tube along a 3D polyline with radii (for antlers, toes, claws, whiskers); uses parallel transport frames
  function tubePart(pts, radii, segs, capEnd) {
    const P = pts.map((p) => new THREE.Vector3().fromArray(p));
    const n = P.length, pos = [], idx = [];
    let prevN = null;
    const frames = [];
    for (let i = 0; i < n; i++) {
      const T = new THREE.Vector3().subVectors(P[Math.min(n - 1, i + 1)], P[Math.max(0, i - 1)]).normalize();
      let N;
      if (!prevN) { N = Math.abs(T.y) < 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0); N.sub(T.clone().multiplyScalar(N.dot(T))).normalize(); }
      else { N = prevN.clone().sub(T.clone().multiplyScalar(prevN.dot(T))).normalize(); }
      prevN = N;
      const B = new THREE.Vector3().crossVectors(T, N);
      frames.push([T, N, B]);
    }
    for (let i = 0; i < n; i++) {
      const [, N, B] = frames[i], r = radii[i];
      for (let j = 0; j <= segs; j++) {
        const a = (j / segs) * TAU, c = Math.cos(a) * r, s = Math.sin(a) * r;
        pos.push(P[i].x + N.x * c + B.x * s, P[i].y + N.y * c + B.y * s, P[i].z + N.z * c + B.z * s);
      }
    }
    const rw = segs + 1;
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < segs; j++) { const a = i * rw + j, b = a + rw; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    if (capEnd) {
      const tip = P[n - 1].clone().addScaledVector(frames[n - 1][0], radii[n - 1] * 0.8);
      const ti = pos.length / 3; pos.push(tip.x, tip.y, tip.z);
      for (let j = 0; j < segs; j++) { const a = (n - 1) * rw + j; idx.push(a, a + 1, ti); }
    }
    const nrm = computeNormals(pos, idx);
    for (let i = 0; i < n; i++) { const a = i * rw, b = a + segs; for (let k = 0; k < 3; k++) { const m = (nrm[a * 3 + k] + nrm[b * 3 + k]) * 0.5; nrm[a * 3 + k] = nrm[b * 3 + k] = m; } }
    return { pos, nrm, idx };
  }
  // thick plate from a closed 2D outline (star shaped around ctr); map(u, v, w, out) places points in 3D.
  // rings of scaled outlines give smooth bending; thickness tapers to the rim.
  function platePart(outline, ctr, nRing, thick, map) {
    const n = outline.length, pos = [], idx = [], o3 = new THREE.Vector3();
    const put = (u, v, w) => { map(u, v, w, o3); pos.push(o3.x, o3.y, o3.z); };
    const ringPt = (k, i) => { const s = k / nRing; return [ctr[0] + (outline[i][0] - ctr[0]) * s, ctr[1] + (outline[i][1] - ctr[1]) * s]; };
    for (let side = 0; side < 2; side++) {
      const sg = side ? -1 : 1;
      put(ctr[0], ctr[1], sg * thick * 0.5);
      for (let k = 1; k <= nRing; k++) {
        const th = thick * 0.5 * (1 - 0.65 * Math.pow(k / nRing, 2));
        for (let i = 0; i < n; i++) { const q = ringPt(k, i); put(q[0], q[1], sg * th); }
      }
    }
    const per = 1 + nRing * n, vi = (side, k, i) => side * per + (k === 0 ? 0 : 1 + (k - 1) * n + (i % n));
    for (let side = 0; side < 2; side++) {
      for (let i = 0; i < n; i++) {
        const a = [vi(side, 0, 0), vi(side, 1, i), vi(side, 1, i + 1)];
        if (side) idx.push(a[0], a[2], a[1]); else idx.push(a[0], a[1], a[2]);
        for (let k = 1; k < nRing; k++) {
          const p0 = vi(side, k, i), p1 = vi(side, k, i + 1), p2 = vi(side, k + 1, i), p3 = vi(side, k + 1, i + 1);
          if (side) idx.push(p0, p3, p2, p0, p1, p3); else idx.push(p0, p2, p3, p0, p3, p1);
        }
      }
    }
    for (let i = 0; i < n; i++) { const a = vi(0, nRing, i), b = vi(0, nRing, i + 1), c = vi(1, nRing, i), d = vi(1, nRing, i + 1); idx.push(a, c, b, b, c, d); }
    return { pos, nrm: computeNormals(pos, idx), idx };
  }
  function spherePart(c, r, ws, hs, sx, sy, sz) {
    const g = new THREE.SphereGeometry(1, ws || 10, hs || 8);
    const p = g.attributes.position.array, nn = g.attributes.normal.array, pos = [], nrm = [];
    for (let i = 0; i < p.length; i += 3) {
      pos.push(c[0] + p[i] * r * (sx || 1), c[1] + p[i + 1] * r * (sy || 1), c[2] + p[i + 2] * r * (sz || 1));
      const nx = nn[i] / (sx || 1), ny = nn[i + 1] / (sy || 1), nz = nn[i + 2] / (sz || 1), l = Math.hypot(nx, ny, nz);
      nrm.push(nx / l, ny / l, nz / l);
    }
    const idx = Array.from(g.index.array);
    g.dispose();
    return { pos, nrm, idx };
  }

  // ---------- atlas painting ----------
  const PAD = 3;
  function paintAtlas(W, H, bands, paint, wantOrm, defRough, baby) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    let cv2 = null, ctx2 = null, img2 = null, d2 = null;
    if (wantOrm) { cv2 = document.createElement('canvas'); cv2.width = W; cv2.height = H; ctx2 = cv2.getContext('2d'); img2 = ctx2.createImageData(W, H); d2 = img2.data; }
    const RG = { C: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3(), w: 0, t: 0, b: 0, e: 2 };
    const P = { part: '', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, u: 0, v: 0, up: 0, sd: 0, arc: 0, len: 0, cx: 0, cy: 0, baby: !!baby };
    const C = { r: 0, g: 0, b: 0, ro: defRough, me: 0, fl: 1 }, tmp = [0, 0];
    for (const bd of bands) {
      const L = bd.loft, inner = bd.y1 - bd.y0 - 2 * PAD;
      P.part = bd.name; P.len = L ? L.len : 1;
      for (let y = bd.y0; y < bd.y1; y++) {
        const v = clamp((y + 0.5 - bd.y0 - PAD) / Math.max(1, inner), 0, 1);
        if (L) ringAt(L, v * L.len, RG);
        for (let x = 0; x < W; x++) {
          const u = (x + 0.5) / W, th = u * TAU;
          P.u = u; P.v = v; P.arc = v * P.len;
          if (L) {
            sectionPoint(RG.w, RG.t, RG.b, RG.e, th, tmp);
            const s = Math.sin(th), c = Math.cos(th);
            P.sd = s; P.up = c;
            P.x = RG.C.x + RG.S.x * tmp[0] + RG.N.x * tmp[1];
            P.y = RG.C.y + RG.S.y * tmp[0] + RG.N.y * tmp[1];
            P.z = RG.C.z + RG.S.z * tmp[0] + RG.N.z * tmp[1];
            const a = s / Math.max(RG.w, 1e-4), bb = c / Math.max(c >= 0 ? RG.t : RG.b, 1e-4);
            let nx = RG.S.x * a + RG.N.x * bb, ny = RG.S.y * a + RG.N.y * bb, nz = RG.S.z * a + RG.N.z * bb;
            const l = Math.hypot(nx, ny, nz) || 1; P.nx = nx / l; P.ny = ny / l; P.nz = nz / l;
            const rr = (RG.w + RG.t) * 0.5 + 0.004;
            P.cx = c * rr; P.cy = s * rr;
          } else { P.sd = Math.sin(th); P.up = Math.cos(th); }
          C.r = C.g = C.b = 0.5; C.ro = defRough; C.me = 0; C.fl = bd.fl == null ? 1 : bd.fl;
          paint(P, C);
          const o = (y * W + x) * 4;
          d[o] = clamp(C.r * 255, 0, 255); d[o + 1] = clamp(C.g * 255, 0, 255); d[o + 2] = clamp(C.b * 255, 0, 255); d[o + 3] = 255;
          // second map: R fur length (for fur shells), G roughness, B metalness
          if (d2) { d2[o] = clamp(C.fl * 255, 0, 255); d2[o + 1] = clamp(C.ro * 255, 0, 255); d2[o + 2] = clamp(C.me * 255, 0, 255); d2[o + 3] = 255; }
        }
      }
    }
    ctx.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(cv);
    tex.encoding = THREE.sRGBEncoding; tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.ClampToEdgeWrapping; tex.anisotropy = 2;
    let orm = null;
    if (ctx2) { ctx2.putImageData(img2, 0, 0); orm = new THREE.CanvasTexture(cv2); orm.wrapS = THREE.RepeatWrapping; orm.wrapT = THREE.ClampToEdgeWrapping; }
    return { tex, orm };
  }
  // fur/feather grain helper: streaks along the part axis
  function grain(P, around, along, oct) { return fbm(P.cx * around + 3.1, P.cy * around + 7.7, P.arc * along, oct || 3); }

  // ---------- surface detail ----------
  // One shared tiling texture, made once: R fur strands (along +v), G overlapping feather tips (pointing +v),
  // B scales (cells with grooves), A fine skin grain. Each fur loft gets a 'duv' attribute in tile units
  // (around x along), so the pattern keeps a real-world size on every part.
  let detailTexC = null;
  function detailTex() {
    if (detailTexC) return detailTexC;
    const N = 128, fur = new Float32Array(N * N), d = new Uint8Array(N * N * 4);
    const wrap = (v) => ((v % N) + N) % N;
    let sd = 7;
    const rnd = () => { sd = (Math.imul(sd, 1664525) + 1013904223) >>> 0; return sd / 4294967296; };
    for (let k = 0; k < 700; k++) {
      const x0 = rnd() * N, y0 = rnd() * N, len = 6 + rnd() * 14, w = 0.6 + rnd() * 0.7, sl = (rnd() - 0.5) * 0.25, hg = 0.4 + 0.6 * rnd();
      for (let j = 0; j < len; j++) {
        const f = j / len, x = x0 + sl * j, a = hg * Math.sqrt(Math.sin(PI * f)), xi = Math.floor(x), yy = wrap(Math.floor(y0 + j)) * N;
        for (let dx = -1; dx <= 1; dx++) {
          const px = xi + dx, dd = Math.abs(px + 0.5 - x) / w;
          if (dd >= 1) continue;
          const o = yy + wrap(px), v = a * (1 - dd * dd);
          if (v > fur[o]) fur[o] = v;
        }
      }
    }
    // periodic value noise (period P cells)
    const pv = (x, y, P, s) => {
      const ix = Math.floor(x), iy = Math.floor(y);
      let fx = x - ix, fy = y - iy; fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
      const h = (i, j) => hash3(((i % P) + P) % P, ((j % P) + P) % P, s);
      return lerp(lerp(h(ix, iy), h(ix + 1, iy), fx), lerp(h(ix, iy + 1), h(ix + 1, iy + 1), fx), fy);
    };
    // feathers: 4 columns x 4 rows per tile, staggered; the front-most feather covering a pixel wins
    const FC = 4, FR = 4, cw = N / FC, rh = N / FR;
    // scales: periodic worley, 8 x 8 cells
    const SC = 8, sw = N / SC;
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const o = y * N + x;
      const clump = pv(x / N * 8, y / N * 3, 8, 3) * 0.6 + pv(x / N * 16, y / N * 6, 16, 4) * 0.4;
      const R = clamp(fur[o] * 0.8 + 0.25 * clump, 0, 1);
      let G = 0.35;
      const r0 = Math.floor(y / rh);
      for (let r = r0 - 1; r <= r0 + 2; r++) {
        let best = -1, bq = 9, bk = 1;
        const rw = ((r % FR) + FR) % FR, ro = (r & 1) * 0.5 + (hash3(rw, 0, 21) - 0.5) * 0.35;
        for (let c = -1; c <= FC; c++) {
          const cc = ((c % FC) + FC) % FC, hw = cw * (0.56 + 0.14 * hash3(rw, cc, 23));
          const cx = (c + 0.5 + ro) * cw, q = (wrap(x - cx + N / 2) - N / 2) / hw;
          if (Math.abs(q) >= 1) continue;
          const tip = (r + 1) * rh + (hash3(rw, cc, 22) - 0.5) * 0.3 * rh - rh * 0.5 * (1 - Math.sqrt(1 - q * q));
          if (y < tip && y > tip - rh * 2.2 && Math.abs(q) < bq) { bq = Math.abs(q); best = tip; bk = 0.88 + 0.24 * hash3(rw, cc, 24); }
        }
        if (best >= 0) {
          const e = (best - y) / rh;
          G = (0.42 + 0.5 * (1 - Math.min(1, e * 1.1)) - 0.1 * sstep(0.12, 0.0, bq)) * bk;
          break;
        }
      }
      let f1 = 9, f2 = 9;
      const gx = x / sw, gy = y / sw, ix = Math.floor(gx), iy = Math.floor(gy);
      for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
        const cx = ix + i, cy = iy + j, wx = ((cx % SC) + SC) % SC, wy = ((cy % SC) + SC) % SC;
        const dx = cx + 0.15 + 0.7 * hash3(wx, wy, 11) - gx, dy = cy + 0.15 + 0.7 * hash3(wx, wy, 12) - gy, dd = Math.sqrt(dx * dx + dy * dy);
        if (dd < f1) { f2 = f1; f1 = dd; } else if (dd < f2) f2 = dd;
      }
      const B = sstep(0.0, 0.22, f2 - f1) * (1 - 0.35 * f1);
      const A = 0.5 + 0.35 * (pv(x / N * 16, y / N * 16, 16, 5) - 0.5) + 0.3 * (pv(x / N * 32, y / N * 32, 32, 6) - 0.5);
      d[o * 4] = R * 255; d[o * 4 + 1] = G * 255; d[o * 4 + 2] = B * 255; d[o * 4 + 3] = clamp(A, 0, 1) * 255;
    }
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.anisotropy = 4; t.needsUpdate = true;
    detailTexC = t;
    return t;
  }
  const DETAIL_KIND = { fur: 0, feather: 1, scale: 2, skin: 3 };
  // detail settings per species: kind, tile (m), amt (color), bump, sheen (soft rim light of fur)
  const DETAIL_DEF = {
    fur: { amt: 0.2, bump: 0.35, sheen: 0.32 }, feather: { amt: 0.14, bump: 0.3, sheen: 0.1 },
    scale: { amt: 0.22, bump: 0.45, sheen: 0.04 }, skin: { amt: 0.12, bump: 0.25, sheen: 0.06 },
  };
  function detailOf(spec) {
    const d = spec.detail || {}, kind = d.kind || (spec.feathers ? 'feather' : 'fur');
    return Object.assign({ kind, tile: clamp(spec.size.length * 0.045, 0.01, 0.07) }, DETAIL_DEF[kind], d);
  }
  // fur / skin material patch. Uniforms live in material.userData.aa; one function so all species share programs.
  // aaK = (color amount, bump strength, rim sheen); shells: aaShell (offset along the normal), aaShellK (cut, layer 0..1, lean)
  function aaFurCompile(sh) {
    Object.assign(sh.uniforms, this.userData.aa);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec3 duv;\nvarying vec3 vDuv;\nuniform float aaShell;\n#ifdef AA_SHELL\nattribute float shl;\nvarying float vShl;\n#endif')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvDuv = duv;\n#ifdef AA_SHELL\nvShl = shl;\ntransformed += normal * aaShell * shl;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vDuv;\nuniform sampler2D aaDet;\nuniform vec3 aaK;\nuniform vec3 aaShellK;\nuniform float aaKO;\n#ifdef AA_SHELL\nvarying float vShl;\n#endif')
      .replace('#include <map_fragment>', `#include <map_fragment>
  float aaZ = floor(vDuv.z + 0.5), aaAm = floor(aaZ / 4.0 + 0.01) / 8.0;
  vec4 aaMask = vec4(equal(vec4(aaKO >= 0.0 ? aaKO : aaZ - 4.0 * floor(aaZ / 4.0 + 0.01)), vec4(0.0, 1.0, 2.0, 3.0)));
#ifdef AA_SHELL
  vec2 aaUv = vDuv.xy * 1.7 + vec2(0.0, aaShellK.z * vShl);
  float aaH = texture2D(aaDet, aaUv).r;
  float aaFl = texture2D(roughnessMap, vUv).r;
  if (aaH * (0.35 + 0.65 * aaFl) < mix(aaShellK.x, aaShellK.y, vShl) || aaFl < vShl * 0.9) discard;
  diffuseColor.rgb *= 0.82 + 0.3 * vShl;
#else
  vec2 aaUv = vDuv.xy;
  float aaH = dot(texture2D(aaDet, aaUv), aaMask);
  diffuseColor.rgb *= 1.0 + aaK.x * aaAm * (aaH - 0.5) * 2.0;
#endif`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
#ifndef AA_SHELL
{
  vec2 aaDx = dFdx(aaUv), aaDy = dFdy(aaUv);
  float aaHx = dot(texture2D(aaDet, aaUv + aaDx), aaMask) - aaH, aaHy = dot(texture2D(aaDet, aaUv + aaDy), aaMask) - aaH;
  vec3 aaSx = dFdx(-vViewPosition), aaSy = dFdy(-vViewPosition);
  vec3 aaR1 = cross(aaSy, normal), aaR2 = cross(normal, aaSx);
  float aaDet0 = dot(aaSx, aaR1) * faceDirection;
  vec3 aaG = sign(aaDet0) * aaK.y * aaAm * (aaHx * aaR1 + aaHy * aaR2);
  normal = normalize(abs(aaDet0) * normal - aaG);
}
#endif`)
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float aaRim = pow(1.0 - saturate(dot(normal, geometry.viewDir)), 2.5) * aaK.z;
  reflectedLight.directDiffuse *= 1.0 + aaRim; reflectedLight.indirectDiffuse *= 1.0 + aaRim;
}`);
  }
  function furMaterial(map, orm, rough, det, shell) {
    const m = new THREE.MeshStandardMaterial({ map, roughness: orm ? 1 : rough, metalness: orm ? 1 : 0 });
    if (orm) { m.roughnessMap = orm; m.metalnessMap = orm; }
    m.extensions = { derivatives: true };
    m.userData.aa = {
      aaDet: { value: detailTex() },
      aaK: { value: new THREE.Vector3(det.amt, det.bump * det.tile * 0.03, det.sheen) }, aaShell: { value: 0 }, aaShellK: { value: new THREE.Vector3(0, 0, 0) }, aaKO: { value: -1 },
    };
    if (shell) m.defines = { AA_SHELL: '' };
    m.onBeforeCompile = aaFurCompile;
    return m;
  }

  // ---------- feathers (wings and tails) ----------
  // Each feather is a rigid, slightly cambered blade bound to one bone. Blades are defined in their bone's rest frame.
  function featherBlade(len, wid, curl, tipRound, rootW) {
    // returns pos, nrm, idx, uv (u across 0..1, v along 0..1) in a frame where the feather points along +X, width along Z, up +Y
    const nL = 4, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nL; i++) {
      const t = i / nL;
      let wf = t < 0.15 ? lerp(rootW == null ? 0.55 : rootW, 1, t / 0.15) : 1;
      if (t > 1 - tipRound) wf *= Math.sqrt(Math.max(0, 1 - Math.pow((t - (1 - tipRound)) / tipRound, 2)));
      if (i === nL) wf = Math.max(wf, 0.08);
      const droop = curl * t * t * len;
      for (let j = 0; j <= 2; j++) {
        const s = j - 1;
        const zz = s * wid * 0.5 * wf;
        const yy = -droop - Math.abs(s) * wid * 0.08 * wf;
        pos.push(t * len, yy, zz);
        uv.push(j / 2, t);
      }
    }
    for (let i = 0; i < nL; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    const nrm = computeNormals(pos, idx);
    return { pos, nrm, idx, uv };
  }

  // blade for a feather atlas cell (sculpted birds): a rectangle along +X (width along Z, up +Y) that the atlas alpha
  // cuts to the feather's outline; the vane arches a little across (shaft on top), the blade bends down by curl
  function featherBladeCut(len, wid, curl, camber) {
    const nL = len > 0.09 ? 6 : 3, cb = camber == null ? 0.06 : camber, pos = [], uv = [], idx = [];
    for (let i = 0; i <= nL; i++) {
      const t = i / nL, droop = curl * t * t * len;
      for (let j = 0; j <= 2; j++) { const s = j - 1; pos.push(t * len, -droop - Math.abs(s) * wid * cb, s * wid * 0.5); uv.push(j / 2, t); }
    }
    for (let i = 0; i < nL; i++) for (let j = 0; j < 2; j++) { const a = i * 3 + j, b = a + 3; idx.push(a, b, a + 1, b, b + 1, a + 1); }
    return { pos, nrm: computeNormals(pos, idx), idx, uv };
  }
  // feather material from a model's atlas (alpha tested, so the shadows get the outlines too); hidden until the
  // maps are decoded, so the bare rectangles never show
  function featherModelMaterial(M, fs, baby) {
    const mm = M.maps, m = new THREE.MeshStandardMaterial({ roughness: fs.rough || 0.8, metalness: 0, side: THREE.DoubleSide, alphaTest: 0.5 });
    m.visible = false;
    const apply = () => { m.map = (baby ? mm.tex.babyFeather : mm.tex.feather) || null; m.normalMap = baby ? null : mm.tex.featherNormal || null; m.visible = !!m.map; m.needsUpdate = true; };
    if (mm.ready === mm.need) apply(); else mm.waiters.push(apply);
    return m;
  }

  // ---------- module temps ----------
  const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3(), _v4 = new THREE.Vector3(), _v5 = new THREE.Vector3(), _v6 = new THREE.Vector3();
  const _q4 = new THREE.Quaternion(), _q5 = new THREE.Quaternion();
  const AX = new THREE.Vector3(1, 0, 0), AY = new THREE.Vector3(0, 1, 0), AZ = new THREE.Vector3(0, 0, 1);

  // root-space position of a bone pivot and root-space orientation, walking up the hierarchy (no matrix updates needed)
  function rootPos(bone, root, out) {
    out.set(0, 0, 0);
    let o = bone;
    while (o && o !== root) { out.applyQuaternion(o.quaternion).add(o.position); o = o.parent; }
    return out;
  }
  function rootQuat(bone, root, out) {
    out.identity();
    let o = bone;
    while (o && o !== root) { out.premultiply(o.quaternion); o = o.parent; }
    return out;
  }
  // two-bone IK: returns middle joint position
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
  // point bone (whose rest direction is restDir in its own frame) from a to b; parentQ = root-space orientation of parent; writes root-space orientation of bone into outQ
  function aimBone(bone, parentQ, a, b, restDir, outQ) {
    _v4.subVectors(b, a);
    if (_v4.lengthSq() < 1e-12) { outQ.copy(parentQ).multiply(bone.quaternion); return outQ; }
    _v4.normalize();
    _q5.copy(parentQ).invert();
    _v4.applyQuaternion(_q5);
    bone.quaternion.setFromUnitVectors(restDir, _v4);
    return outQ.multiplyQuaternions(parentQ, bone.quaternion);
  }
  // set a bone's local quaternion so that its root-space orientation is rotation about X by ang
  function orientX(bone, parentQ, ang) {
    _q4.setFromAxisAngle(AX, ang);
    _q5.copy(parentQ).invert();
    bone.quaternion.multiplyQuaternions(_q5, _q4);
  }
  // rotate a vector about X axis by angle (in place)
  function rotX(v, a) { const c = Math.cos(a), s = Math.sin(a), y = v.y, z = v.z; v.y = y * c - z * s; v.z = y * s + z * c; return v; }

  // planar FK (about X axes) for solving head-reach poses at build time
  function chainReach(pivots, point, angles) {
    let y = point[1], z = point[2];
    for (let k = pivots.length - 1; k >= 0; k--) {
      const py = pivots[k][1], pz = pivots[k][2], a = angles[k], c = Math.cos(a), s = Math.sin(a);
      const dy = y - py, dz = z - pz;
      y = py + dy * c - dz * s; z = pz + dy * s + dz * c;
    }
    return [y, z];
  }
  // eat pose from target segment elevations (deg, + up): interpolates each neck segment from its rest elevation toward
  // the target until the mouth reaches targetY. pre = [hipPivot, bodyPitch, drop]. Returns local X rotations per neck bone.
  function solveElev(pivots, point, target, targetY, pre) {
    const n = pivots.length, pts = pivots.concat([point]);
    const L = [], e0 = [];
    for (let i = 0; i < n; i++) { const dy = pts[i + 1][1] - pts[i][1], dz = pts[i + 1][2] - pts[i][2]; L.push(Math.hypot(dy, dz)); e0.push(Math.atan2(dy, dz)); }
    // pre: [hipPivot, hipPitch, drop, chestPivot?, chestPitch?] applied to the neck base (rotations about X, root space)
    let p = 0, by = pivots[0][1], bz = pivots[0][2];
    const rot = (piv, a) => { const dy = by - piv[1], dz = bz - piv[2], c = Math.cos(a), s = Math.sin(a); by = piv[1] + dy * c - dz * s; bz = piv[2] + dy * s + dz * c; };
    if (pre) {
      if (pre[3] && pre[4]) rot(pre[3], pre[4]);
      rot(pre[0], pre[1]);
      by -= pre[2];
      p = pre[1] + (pre[4] || 0);
    }
    const elev = (a, i) => lerp(e0[i] - p, target[i] * DEG, a);
    const mouthY = (a) => { let y = by; for (let i = 0; i < n; i++) y += L[i] * Math.sin(elev(a, i)); return y; };
    let a = 1;
    if (mouthY(1.25) <= targetY) {
      let lo = 0, hi = 1.25;
      for (let k = 0; k < 30; k++) { const m = (lo + hi) / 2; if (mouthY(m) > targetY) lo = m; else hi = m; }
      a = (lo + hi) / 2;
    }
    const out = []; let prev = 0;
    for (let i = 0; i < n; i++) { const c = e0[i] - p - elev(a, i); out.push(c - prev); prev = c; }
    return out;
  }
  // find scale a so that angles = a * dist bring point down to height targetY (first crossing).
  // pre = [pivot, angle, drop] applied as a fixed parent rotation (body crouch) before the neck chain.
  function solveDown(pivots, point, dist, targetY, maxA, pre) {
    const f = (a) => {
      const ang = dist.map((d) => d * a);
      if (pre) { const r = chainReach([pre[0]].concat(pivots), point, [pre[1]].concat(ang)); return r[0] - pre[2]; }
      return chainReach(pivots, point, ang)[0];
    };
    const top = maxA || 2.4;
    let prev = 0;
    for (let a = 0.02; a <= top; a += 0.02) {
      if (f(a) <= targetY) { let lo = prev, hi = a; for (let i = 0; i < 20; i++) { const m = (lo + hi) / 2; if (f(m) > targetY) lo = m; else hi = m; } return (lo + hi) / 2; }
      prev = a;
    }
    // unreachable: pick the angle with the lowest mouth
    let best = 0, by = 1e9;
    for (let a = 0; a <= top; a += 0.02) { const yy = f(a); if (yy < by) { by = yy; best = a; } }
    return best;
  }

  // ---------- per-species specs ----------
  // Each spec: bones [name, parent, x, y, z, mirror?] in rest root space (pivot positions);
  // fur: lofts sharing one painted atlas; accent: vertex colored small parts; eyes; mouth; anim.
  const SPEC = {};
  const mixc = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  // generic fur finish: grain streaks, fine noise, roughness
  function furFinish(P, C, amt, around, along) {
    const g = grain(P, around || 90, along || 30);
    const fine = noise(P.x * 420, P.y * 420, P.z * 420);
    cmul(C, 1 - amt + amt * 2 * g + 0.06 * (fine - 0.5));
    C.ro = 0.84 + 0.12 * fine;
    return g;
  }

  // ===== FOX =====
  SPEC.fox = () => {
    const xL = 0.046, xF = 0.047;
    const K = {
      top: hex(0xA94A18), side: hex(0xCF6726), low: hex(0xDE8A45), belly: hex(0xEDE4D6), white: hex(0xF3EEE6),
      black: hex(0x241A15), dark: hex(0x4A2A1A), ear: hex(0x1E1714), earIn: hex(0xE9DCC8), tailDark: hex(0x6A3519),
    };
    return {
      size: { length: 1.0, height: 0.47, radius: 0.22, eyeHeight: 0.42 },
      tex: [256, 256], rough: 0.88,
      detail: { kind: 'fur', tile: 0.032, amt: 0.2, bump: 0.35, sheen: 0.32 },
      shell: { parts: ['body', 'head', 'tail'], d1: ['tail'], n1: 2, len: 0.016, n: 4 },
      bones: [
        ['hips', null, 0, 0.31, -0.14],
        ['chest', 'hips', 0, 0.31, 0.1],
        ['neck', 'chest', 0, 0.335, 0.175],
        ['neck2', 'neck', 0, 0.365, 0.225],
        ['head', 'neck2', 0, 0.398, 0.272],
        ['tail1', 'hips', 0, 0.305, -0.235],
        ['tail2', 'tail1', 0, 0.262, -0.33],
        ['tail3', 'tail2', 0, 0.205, -0.44],
        ['thighL', 'hips', xL, 0.285, -0.15, 1],
        ['shinL', 'thighL', xL, 0.19, -0.1, 1],
        ['hmetaL', 'shinL', xL, 0.098, -0.188, 1],
        ['hpawL', 'hmetaL', xL, 0.022, -0.162, 1],
        ['armL', 'chest', xF, 0.27, 0.118, 1],
        ['foreL', 'armL', xF, 0.178, 0.088, 1],
        ['fmetaL', 'foreL', xF, 0.058, 0.108, 1],
        ['fpawL', 'fmetaL', xF, 0.022, 0.118, 1],
        ['earL', 'head', 0.028, 0.432, 0.282, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.05, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.312, -0.245, 0.036, 0.03, 0.034],
          [0, 0.315, -0.205, 0.058, 0.05, 0.062],
          [0, 0.317, -0.135, 0.066, 0.054, 0.075],
          [0, 0.312, -0.045, 0.06, 0.054, 0.068],
          [0, 0.312, 0.045, 0.066, 0.058, 0.092],
          [0, 0.313, 0.115, 0.066, 0.06, 0.105],
          [0, 0.33, 0.172, 0.058, 0.053, 0.082],
          [0, 0.364, 0.222, 0.046, 0.045, 0.052],
          [0, 0.398, 0.268, 0.037, 0.037, 0.04],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.7, keys: [
          [0, 0.405, 0.242, 0.038, 0.034, 0.034],
          [0, 0.41, 0.27, 0.055, 0.047, 0.045],
          [0, 0.407, 0.303, 0.05, 0.04, 0.039],
          [0, 0.397, 0.335, 0.031, 0.029, 0.028],
          [0, 0.391, 0.365, 0.019, 0.019, 0.019],
          [0, 0.387, 0.39, 0.011, 0.012, 0.011],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3'], blend: 0.05, segs: 12, cap1: 3, capLen1: 1.1, fuzz: 0.12, keys: [
          [0, 0.31, -0.2, 0.02, 0.02, 0.02],
          [0, 0.306, -0.245, 0.026, 0.026, 0.026],
          [0, 0.272, -0.315, 0.043, 0.045, 0.043],
          [0, 0.222, -0.405, 0.055, 0.056, 0.052],
          [0, 0.19, -0.5, 0.054, 0.055, 0.05],
          [0, 0.178, -0.585, 0.04, 0.042, 0.038],
          [0, 0.18, -0.63, 0.02, 0.022, 0.02],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [xL - 0.004, 0.335, -0.15, 0.03, 0.05, 0.05],
          [xL, 0.285, -0.148, 0.036, 0.058, 0.052],
          [xL, 0.235, -0.125, 0.03, 0.045, 0.04],
          [xL, 0.19, -0.105, 0.021, 0.024, 0.03],
          [xL, 0.145, -0.145, 0.016, 0.015, 0.022],
          [xL, 0.1, -0.186, 0.012, 0.012, 0.016],
          [xL, 0.055, -0.175, 0.01, 0.01, 0.01],
          [xL, 0.024, -0.162, 0.014, 0.016, 0.014],
          [xL, 0.014, -0.133, 0.013, 0.01, 0.009],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [xF - 0.006, 0.31, 0.125, 0.028, 0.04, 0.035],
          [xF, 0.27, 0.12, 0.03, 0.04, 0.038],
          [xF, 0.22, 0.103, 0.024, 0.026, 0.03],
          [xF, 0.178, 0.09, 0.019, 0.017, 0.022],
          [xF, 0.12, 0.1, 0.015, 0.014, 0.015],
          [xF, 0.06, 0.108, 0.012, 0.011, 0.011],
          [xF, 0.025, 0.116, 0.014, 0.015, 0.013],
          [xF, 0.014, 0.145, 0.013, 0.01, 0.009],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.026, 0.425, 0.287, 0.021, 0.007, 0.005],
          [0.031, 0.45, 0.283, 0.019, 0.006, 0.004],
          [0.037, 0.475, 0.277, 0.011, 0.004, 0.003],
          [0.04, 0.492, 0.273, 0.001, 0.001, 0.001],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 0.39, 0.394], r: 0.0095, s: [1.1, 0.8, 0.9], col: 0x161210 },
      ],
      accentRough: 0.35,
      eyes: [{ bone: 'head', p: [0.032, 0.419, 0.324], r: 0.0084, dir: [0.55, 0.12, 0.83], iris: 0xC8892A, pupil: 'v', irisR: 0.75 }],
      mouth: [0, 0.378, 0.385],
      paint(P, C) {
        switch (P.part) {
          case 'body': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.3, 0.95, P.ny));
            cmix(C, K.low, sstep(-0.1, -0.5, P.ny));
            cmix(C, K.belly, sstep(-0.55, -0.85, P.ny) * 0.9);
            // white bib: throat and chest front
            const bib = sstep(0.06, 0.16, P.z) * sstep(0.1, -0.35, P.ny - P.nz * 0.6) * sstep(0.42, 0.3, P.y + P.ny * 0.03);
            cmix(C, K.white, bib);
            break;
          }
          case 'head': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.2, 0.9, P.ny) * 0.6);
            const cheek = sstep(0.1, -0.15, P.ny + (P.z - 0.31) * 1.6) * sstep(0.24, 0.27, P.z);
            cmix(C, K.white, cheek);
            cmix(C, K.dark, sstep(0.355, 0.39, P.z) * sstep(-0.2, 0.4, P.ny) * 0.75);
            break;
          }
          case 'tail': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.0, 0.9, P.ny) * 0.5);
            cmix(C, K.tailDark, sstep(0.45, 0.8, grain(P, 60, 20)) * 0.6);
            cmix(C, K.white, sstep(P.len - 0.085, P.len - 0.055, P.arc));
            break;
          }
          case 'hleg': {
            cset(C, K.side);
            cmix(C, K.belly, sstep(0.0, -0.7, P.nx) * sstep(0.26, 0.2, P.y) * 0.6);
            cmix(C, K.black, sstep(0.17, 0.11, P.y) + sstep(0.4, 0.9, P.nz) * sstep(0.22, 0.16, P.y));
            break;
          }
          case 'fleg': {
            cset(C, K.side);
            cmix(C, K.white, sstep(0.0, -0.5, P.nz) * sstep(0.22, 0.28, P.y) * 0.5);
            cmix(C, K.black, sstep(0.21, 0.15, P.y) + sstep(0.35, 0.9, P.nz) * sstep(0.29, 0.22, P.y));
            break;
          }
          case 'ear': {
            cset(C, K.ear);
            cmix(C, K.earIn, sstep(0.0, 0.5, P.nz) * sstep(0.04, 0.015, P.arc) * 0.9);
            cmix(C, K.side, sstep(0.014, 0.0, P.arc) * 0.7 * sstep(-0.2, 0.3, -P.nz));
            break;
          }
        }
        furFinish(P, C, 0.16);
        // fur length for the shells: long brush, medium coat, short face and legs
        C.fl = P.part === 'tail' ? 1 : P.part === 'body' ? 0.6 : P.part === 'head' ? 0.35 : 0.2;
      },
      anim: {
        type: 'legged', walk: 1.1, trot: 2.3, run: 4.2, stride: 0.56, strideMax: 2.0,
        duty: [0.64, 0.46, 0.36], lift: [0.05, 0.05], flexF: 1.5, flexH: 0.9,
        bob: [0.006, 0.014, 0.025], pitchRun: 0.12, flexRun: 0.12, roll: 0.04,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.3, eatDrop: 0.04, eatElev: [-62, -82, -100], eatSplay: [0.12, 0.15], chestEat: 0.1,
        tail: ['tail1', 'tail2', 'tail3'], tailRun: [0.2, 0.05, -0.05], tailIdle: [-0.15, -0.05, 0.05], tailSway: 0.12,
        ears: ['earL', 'earR'], floatDepth: 0.3, swimHead: -0.35,
        sleep: { style: 'curl', neck: [2.3, 0.45], tail: [2.2, 0.12], front: [0.2, 0.3, 0.6] }, wag: 0.5,
      },
      baby: { head: 1.45, muzzle: 0.62, eye: 1.12, ear: 1.0, leg: [0.72, 1.2], tail: 0.55 },
      // fox kits: fluffy dark gray-brown, only a little red, pale muzzle and tail tip
      babyPaint(P, C) {
        const kit = hex(0x5C4A40), kitHi = hex(0x7A5E4C);
        const keep = (P.part === 'body' ? sstep(0.06, 0.16, P.z) * sstep(0.1, -0.35, P.ny - P.nz * 0.6) : 0) + (P.part === 'tail' ? sstep(P.len - 0.085, P.len - 0.055, P.arc) : 0) + (P.part === 'head' ? sstep(0.1, -0.15, P.ny + (P.z - 0.31) * 1.6) * sstep(0.24, 0.27, P.z) : 0);
        const g = grain(P, 120, 40);
        cmix(C, mixc(kit, kitHi, g), 0.78 * (1 - Math.min(1, keep)) * (P.part === 'ear' ? 0.5 : 1));
      },
    };
  };

  // ===== DEER (white-tailed buck) =====
  SPEC.deer = () => {
    const xF = 0.1, xH = 0.096;
    const K = {
      top: hex(0x5E4430), side: hex(0x86623F), low: hex(0x9C7A58), white: hex(0xF0ECE4), cream: hex(0xD9C8AE),
      dark: hex(0x221A15), legs: hex(0x8A6646), legsDk: hex(0x5E4632), hoof: hex(0x26211D), ear: hex(0x7E5E42), earIn: hex(0xD7CCBD), face: hex(0x6A4C34),
    };
    const antler = (x, y, z) => mixc(hex(0x8C7A60), hex(0xE8DFCC), sstep(1.5, 1.72, y));
    const tubes = [
      [[[0.035, 1.43, 0.61], [0.085, 1.49, 0.585], [0.15, 1.535, 0.59], [0.195, 1.575, 0.645], [0.195, 1.6, 0.73], [0.15, 1.625, 0.8], [0.09, 1.64, 0.835]], [0.017, 0.016, 0.014, 0.013, 0.011, 0.008, 0.005]],
      [[[0.09, 1.495, 0.585], [0.088, 1.56, 0.6], [0.08, 1.61, 0.62]], [0.009, 0.007, 0.004]],
      [[[0.16, 1.54, 0.595], [0.165, 1.63, 0.6], [0.158, 1.71, 0.6]], [0.01, 0.0075, 0.004]],
      [[[0.198, 1.585, 0.675], [0.2, 1.66, 0.685], [0.192, 1.73, 0.69]], [0.0095, 0.007, 0.004]],
      [[[0.175, 1.613, 0.77], [0.172, 1.67, 0.778], [0.162, 1.71, 0.785]], [0.008, 0.006, 0.0035]],
    ];
    return {
      size: { length: 1.8, height: 1.75, radius: 0.36, eyeHeight: 1.45 },
      tex: [256, 256], rough: 0.85,
      detail: { kind: 'fur', tile: 0.04, amt: 0.12, bump: 0.2, sheen: 0.22 },
      bones: [
        ['hips', null, 0, 0.94, -0.42],
        ['chest', 'hips', 0, 0.95, 0.3],
        ['neck', 'chest', 0, 1.02, 0.44],
        ['neck2', 'neck', 0, 1.18, 0.54],
        ['head', 'neck2', 0, 1.35, 0.61],
        ['tail1', 'hips', 0, 0.96, -0.64],
        ['tail2', 'tail1', 0, 0.9, -0.7],
        ['thighL', 'hips', xH, 0.93, -0.42, 1],
        ['shinL', 'thighL', xH, 0.64, -0.31, 1],
        ['hmetaL', 'shinL', xH, 0.45, -0.5, 1],
        ['hpawL', 'hmetaL', xH, 0.1, -0.47, 1],
        ['armL', 'chest', xF, 0.88, 0.33, 1],
        ['foreL', 'armL', xF, 0.61, 0.27, 1],
        ['fmetaL', 'foreL', xF, 0.36, 0.31, 1],
        ['fpawL', 'fmetaL', xF, 0.1, 0.31, 1],
        ['earL', 'head', 0.045, 1.44, 0.6, 1],
        ['antler', 'head', 0, 1.45, 0.61],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.08, segs: 14, cap0: 3, capLen0: 0.7, keys: [
          [0, 0.96, -0.68, 0.06, 0.05, 0.07],
          [0, 0.97, -0.62, 0.13, 0.1, 0.17],
          [0, 0.96, -0.48, 0.16, 0.12, 0.25],
          [0, 0.93, -0.25, 0.165, 0.12, 0.27],
          [0, 0.93, 0.0, 0.17, 0.125, 0.29],
          [0, 0.95, 0.22, 0.155, 0.135, 0.31],
          [0, 0.995, 0.38, 0.125, 0.12, 0.27],
          [0, 1.08, 0.47, 0.1, 0.12, 0.17],
          [0, 1.2, 0.535, 0.08, 0.09, 0.11],
          [0, 1.31, 0.58, 0.064, 0.066, 0.076],
          [0, 1.37, 0.6, 0.05, 0.05, 0.05],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.6, keys: [
          [0, 1.39, 0.56, 0.04, 0.04, 0.04],
          [0, 1.4, 0.61, 0.06, 0.058, 0.062],
          [0, 1.385, 0.68, 0.058, 0.052, 0.058],
          [0, 1.35, 0.76, 0.044, 0.043, 0.048],
          [0, 1.31, 0.84, 0.034, 0.033, 0.039],
          [0, 1.28, 0.9, 0.028, 0.027, 0.032],
          [0, 1.27, 0.93, 0.021, 0.02, 0.023],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [0, 0.96, -0.6, 0.03, 0.03, 0.03],
          [0, 0.96, -0.645, 0.045, 0.022, 0.026],
          [0, 0.91, -0.7, 0.05, 0.018, 0.026],
          [0, 0.85, -0.73, 0.038, 0.016, 0.022],
          [0, 0.81, -0.74, 0.012, 0.01, 0.01],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.04, segs: 10, cap1: 2, keys: [
          [0.065, 1.0, -0.44, 0.085, 0.14, 0.14],
          [0.088, 0.83, -0.4, 0.08, 0.13, 0.13],
          [0.094, 0.68, -0.34, 0.052, 0.072, 0.068],
          [0.095, 0.57, -0.4, 0.034, 0.042, 0.05],
          [xH, 0.46, -0.49, 0.022, 0.026, 0.036],
          [xH, 0.3, -0.48, 0.016, 0.018, 0.017],
          [xH, 0.14, -0.472, 0.016, 0.018, 0.02],
          [xH, 0.07, -0.455, 0.0145, 0.016, 0.015],
          [xH, 0.025, -0.432, 0.018, 0.026, 0.017],
          [xH, 0.008, -0.418, 0.016, 0.024, 0.013],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.04, segs: 10, cap1: 2, keys: [
          [0.08, 0.92, 0.33, 0.065, 0.1, 0.1],
          [0.098, 0.77, 0.3, 0.058, 0.08, 0.075],
          [xF, 0.62, 0.27, 0.042, 0.05, 0.046],
          [xF, 0.49, 0.29, 0.028, 0.032, 0.028],
          [xF, 0.36, 0.31, 0.021, 0.024, 0.023],
          [xF, 0.23, 0.31, 0.016, 0.017, 0.017],
          [xF, 0.11, 0.31, 0.016, 0.018, 0.02],
          [xF, 0.06, 0.322, 0.015, 0.016, 0.016],
          [xF, 0.022, 0.342, 0.019, 0.026, 0.018],
          [xF, 0.008, 0.356, 0.017, 0.022, 0.014],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.045, 1.43, 0.605, 0.02, 0.013, 0.009],
          [0.085, 1.485, 0.59, 0.045, 0.013, 0.007],
          [0.135, 1.53, 0.575, 0.05, 0.011, 0.006],
          [0.18, 1.555, 0.565, 0.034, 0.009, 0.005],
          [0.21, 1.567, 0.56, 0.003, 0.002, 0.002],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 1.275, 0.93], r: 0.024, s: [1.05, 0.8, 0.75], col: 0x17120F },
        ...tubes.map((tb) => ({ kind: 'tube', bone: 'antler', pts: tb[0], radii: tb[1], segs: 6, mirror: true, colFn: antler })),
        { kind: 'sphere', bone: 'antler', c: [0.04, 1.435, 0.61], r: 0.02, mirror: true, colFn: antler },
      ],
      accentRough: 0.55,
      eyes: [{ bone: 'head', p: [0.05, 1.405, 0.68], r: 0.0155, dir: [0.85, 0.15, 0.4], iris: 0x24160C, irisR: 0.95, pupil: 'h', pupilR: 0.4, lidCol: 0x2E2018 }],
      mouth: [0, 1.255, 0.91],
      paint(P, C) {
        switch (P.part) {
          case 'body': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.35, 0.95, P.ny));
            cmix(C, K.low, sstep(-0.2, -0.55, P.ny));
            cmix(C, K.white, sstep(-0.6, -0.85, P.ny) * sstep(0.45, 0.3, P.z));
            // white throat patch
            cmix(C, K.white, sstep(0.3, 0.7, P.nz) * sstep(1.15, 1.22, P.y) * sstep(1.33, 1.28, P.y));
            cmix(C, K.cream, sstep(-0.3, -0.7, P.ny) * sstep(0.3, 0.42, P.z) * 0.6);
            break;
          }
          case 'head': {
            cset(C, K.side);
            cmix(C, K.face, sstep(0.3, 0.9, P.ny) * sstep(0.62, 0.82, P.z));
            // white eye ring
            const ex = Math.abs(P.x) - 0.05, ey = P.y - 1.405, ez = P.z - 0.68;
            const ed = Math.sqrt(ex * ex * 4 + ey * ey + ez * ez);
            cmix(C, K.white, sstep(0.03, 0.022, ed) * 0.85);
            // muzzle band, chin, dark nose surround
            cmix(C, K.white, sstep(0.82, 0.85, P.z) * sstep(0.9, 0.87, P.z) * sstep(-0.2, 0.2, P.ny) * 0.9);
            cmix(C, K.white, sstep(-0.3, -0.7, P.ny) * sstep(0.74, 0.8, P.z));
            cmix(C, K.dark, sstep(0.89, 0.915, P.z));
            cmix(C, K.cream, sstep(-0.4, -0.8, P.ny) * 0.5);
            break;
          }
          case 'tail': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.2, 0.9, -P.nz + P.ny) * 0.5);
            cmix(C, K.white, sstep(0.0, 0.5, P.nz - P.ny * 0.5) + sstep(0.006, 0.0, Math.abs(P.arc - P.len) - 0.03));
            break;
          }
          case 'hleg': case 'fleg': {
            // brown outside, white inside the upper legs, darker down the front of the cannons, black hooves
            cset(C, K.legs);
            cmix(C, K.side, sstep(0.55, 0.75, P.y));
            cmix(C, K.white, sstep(0.1, -0.6, P.nx) * sstep(0.4, 0.55, P.y) * 0.85);
            cmix(C, K.cream, sstep(0.1, -0.6, P.nx) * sstep(0.55, 0.35, P.y) * 0.55);
            if (P.part === 'hleg') cmix(C, K.white, sstep(0.0, -0.8, P.nx) * sstep(0.5, 0.75, P.y) * sstep(1.0, 0.85, P.y));
            cmix(C, K.legsDk, sstep(0.3, 0.9, P.nz) * sstep(0.45, 0.32, P.y) * 0.6);
            if (P.part === 'hleg') cmix(C, K.top, sstep(0.4, 0.8, P.nx) * sstep(0.025, 0.0, Math.abs(P.y - 0.3)) * 0.7);
            cmix(C, K.white, sstep(0.13, 0.1, P.y) * sstep(0.05, 0.075, P.y) * 0.45);
            cmix(C, K.hoof, sstep(0.048, 0.038, P.y));
            if (P.y < 0.045) { C.ro = 0.4; C.fl = 0; }
            break;
          }
          case 'ear': {
            cset(C, K.ear);
            cmix(C, K.earIn, sstep(0.0, 0.5, P.nz) * 0.85);
            cmix(C, K.dark, sstep(0.135, 0.15, P.arc) * 0.7);
            break;
          }
        }
        const ro = C.ro;
        furFinish(P, C, 0.12, 70, 20);
        if (P.y < 0.045 && (P.part === 'hleg' || P.part === 'fleg')) C.ro = ro;
      },
      anim: {
        type: 'legged', walk: 1.7, trot: 3.4, run: 6.5, stride: 1.35, strideMax: 2.6,
        duty: [0.66, 0.46, 0.34], lift: [0.12, 0.1], flexF: 1.7, flexH: 1.0,
        gaits: { g: [0.42, 0.5, 0.0, 0.06] },
        bob: [0.012, 0.025, 0.06], pitchRun: 0.14, flexRun: 0.1, roll: 0.025,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.5, 0.35, 0.15], nod: 0.05, runNeck: 0.35, trotNeck: 0.05,
        eatPitch: 0.2, eatDrop: 0.06, eatElev: [-70, -85, -100], eatSplay: [0.2, 0.12], chestEat: 0.08,
        tail: ['tail1', 'tail2'], tailRun: [1.7, 0.4], tailIdle: [0, 0], tailSway: 0.08, tailFlick: 0.4,
        ears: ['earL', 'earR'], floatDepth: 1.02, swimHead: -0.55,
        sleep: { style: 'fold', neck: [1.6, 0.25], tail: [0, -0.2] }, wag: 0.5, tailHappy: 0.8,
      },
      baby: { head: 1.4, muzzle: 0.7, eye: 1.12, ear: 0.9, neck: [0.75, 1.12], leg: [0.95, 1.08], tail: 0.6 },
      // fawn: warmer red-brown with rows of white spots along the back and flanks
      babyPaint(P, C) {
        if (P.part === 'body') {
          const side = sstep(-0.35, 0.0, P.ny) * sstep(0.95, 0.6, P.ny) * sstep(-0.66, -0.55, P.z) * sstep(0.4, 0.3, P.z);
          const sp = sstep(0.24, 0.16, cells(P.x * 26, P.y * 18, P.z * 18));
          cmix(C, hex(0xA4693E), side * 0.45);
          cmix(C, hex(0xF2ECE2), side * sp * 0.9);
        }
      },
    };
  };

  // ===== MOOSE (bull) =====
  SPEC.moose = () => {
    const xF = 0.17, xH = 0.165;
    const K = {
      top: hex(0x2B1F17), side: hex(0x3A2A1F), low: hex(0x463427), legs: hex(0x7E7062), legsDark: hex(0x4E4237),
      muzzle: hex(0x4C3A2E), nose: hex(0x2A211B), hoof: hex(0x1F1B18), ear: hex(0x4A3A2E), earIn: hex(0x7A6858), bell: hex(0x2A1F18),
    };
    // palmate antler plate: a cupped, tined plate rising outward from the burr (left side; mirrored)
    function palm() {
      const N = 60, outline = [];
      for (let k = 0; k < N; k++) {
        const a = -PI + (k / N) * TAU;
        // ellipse longer along the outward axis (u); v runs front (+) to back (-)
        let r = 1 / Math.sqrt(Math.pow(Math.cos(a) / 0.33, 2) + Math.pow(Math.sin(a) / 0.21, 2));
        // tines on the outer rim only, plus a brow palm toward the front
        const outer = sstep(1.9, 1.1, Math.abs(a)) + 0.7 * sstep(1.2, 1.7, a) * sstep(2.7, 2.1, a);
        const tn = fract((a + PI) / TAU * 17 + 0.5), spike = Math.pow(1 - Math.abs(2 * tn - 1), 2);
        r *= 1 + Math.min(1, outer) * (0.3 * spike - 0.04);
        // narrow beam toward the skull
        r *= 1 - 0.55 * sstep(2.3, 3.14, Math.abs(a));
        outline.push([Math.cos(a) * r, Math.sin(a) * r]);
      }
      const C = new THREE.Vector3(0.44, 2.03, 0.93), U = new THREE.Vector3(0.94, 0.3, -0.12).normalize();
      const Nn = new THREE.Vector3(-0.3, 0.75, 0.6).normalize();
      Nn.addScaledVector(U, -Nn.dot(U)).normalize();
      const Vd = new THREE.Vector3().crossVectors(Nn, U).normalize();
      return platePart(outline, [-0.05, 0], 4, 0.05, (u, v, w, o) => {
        const cup = 0.5 * (u + 0.33) * (u + 0.33) * 0.35 + 0.9 * v * v;
        o.copy(C).addScaledVector(U, u).addScaledVector(Vd, v).addScaledVector(Nn, w + cup);
      });
    }
    const aCol = (x, y) => mixc(hex(0x5E4D3B), hex(0xA89272), sstep(0.15, 0.75, Math.abs(x)) * 0.8 + 0.2 * sstep(2.1, 2.3, y));
    return {
      size: { length: 2.8, height: 2.45, radius: 0.55, eyeHeight: 1.85 },
      tex: [256, 256], rough: 0.9,
      detail: { kind: 'fur', tile: 0.06, amt: 0.16, bump: 0.25, sheen: 0.22 },
      bones: [
        ['hips', null, 0, 1.45, -0.6],
        ['chest', 'hips', 0, 1.5, 0.45],
        ['neck', 'chest', 0, 1.6, 0.76],
        ['neck2', 'neck', 0, 1.69, 0.91],
        ['head', 'neck2', 0, 1.78, 1.02],
        ['tail1', 'hips', 0, 1.63, -1.02],
        ['thighL', 'hips', xH, 1.45, -0.62, 1],
        ['shinL', 'thighL', xH, 1.0, -0.47, 1],
        ['hmetaL', 'shinL', xH, 0.68, -0.76, 1],
        ['hpawL', 'hmetaL', xH, 0.15, -0.72, 1],
        ['armL', 'chest', xF, 1.42, 0.52, 1],
        ['foreL', 'armL', xF, 1.02, 0.42, 1],
        ['fmetaL', 'foreL', xF, 0.58, 0.49, 1],
        ['fpawL', 'fmetaL', xF, 0.15, 0.49, 1],
        ['earL', 'head', 0.09, 1.9, 0.98, 1],
        ['antler', 'head', 0, 1.9, 0.99],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.12, fuzz: 0.06, fuzzFreq: 5, segs: 14, cap0: 3, capLen0: 0.6, keys: [
          [0, 1.58, -1.1, 0.07, 0.06, 0.08],
          [0, 1.585, -1.03, 0.17, 0.13, 0.21],
          [0, 1.565, -0.86, 0.25, 0.175, 0.3],
          [0, 1.52, -0.45, 0.29, 0.21, 0.36],
          [0, 1.51, -0.1, 0.3, 0.25, 0.39],
          [0, 1.54, 0.22, 0.3, 0.36, 0.41],
          [0, 1.57, 0.47, 0.27, 0.44, 0.42],
          [0, 1.6, 0.68, 0.21, 0.36, 0.34],
          [0, 1.65, 0.84, 0.16, 0.22, 0.25],
          [0, 1.71, 0.95, 0.125, 0.14, 0.17],
          [0, 1.78, 1.01, 0.1, 0.1, 0.12],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 3, capLen1: 0.5, keys: [
          [0, 1.85, 0.95, 0.08, 0.08, 0.08],
          [0, 1.85, 1.03, 0.11, 0.095, 0.12],
          [0, 1.8, 1.15, 0.098, 0.085, 0.12],
          [0, 1.72, 1.29, 0.084, 0.075, 0.11],
          [0, 1.64, 1.42, 0.085, 0.08, 0.115],
          [0, 1.585, 1.53, 0.097, 0.088, 0.125],
          [0, 1.55, 1.61, 0.085, 0.078, 0.105],
          [0, 1.53, 1.65, 0.055, 0.05, 0.06],
        ] },
        { name: 'bell', bones: ['neck2'], segs: 8, cap1: 2, fuzz: 0.3, keys: [
          [0, 1.66, 1.06, 0.045, 0.07, 0.07],
          [0, 1.55, 1.05, 0.032, 0.055, 0.05],
          [0, 1.43, 1.03, 0.022, 0.04, 0.035],
          [0, 1.36, 1.02, 0.012, 0.022, 0.018],
        ] },
        { name: 'tail', bones: ['tail1'], segs: 8, cap1: 2, keys: [
          [0, 1.62, -1.0, 0.04, 0.03, 0.03],
          [0, 1.58, -1.08, 0.04, 0.025, 0.03],
          [0, 1.52, -1.11, 0.02, 0.015, 0.02],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.06, segs: 10, cap1: 2, keys: [
          [0.1, 1.6, -0.63, 0.12, 0.2, 0.18],
          [0.135, 1.32, -0.58, 0.105, 0.17, 0.16],
          [0.155, 1.06, -0.5, 0.0975, 0.13, 0.13],
          [0.165, 0.86, -0.62, 0.065, 0.0845, 0.091],
          [xH, 0.69, -0.76, 0.062, 0.072, 0.088],
          [xH, 0.45, -0.745, 0.046, 0.05, 0.05],
          [xH, 0.18, -0.725, 0.045, 0.05, 0.053],
          [xH, 0.1, -0.7, 0.045, 0.049, 0.049],
          [xH, 0.04, -0.67, 0.05, 0.064, 0.047],
          [xH, 0.012, -0.645, 0.045, 0.058, 0.038],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.06, segs: 10, cap1: 2, keys: [
          [0.11, 1.55, 0.52, 0.1, 0.16, 0.15],
          [0.15, 1.3, 0.48, 0.085, 0.13, 0.12],
          [xF, 1.04, 0.42, 0.0845, 0.0975, 0.091],
          [xF, 0.8, 0.46, 0.07, 0.08, 0.072],
          [xF, 0.58, 0.49, 0.06, 0.064, 0.06],
          [xF, 0.38, 0.49, 0.047, 0.05, 0.05],
          [xF, 0.17, 0.49, 0.046, 0.051, 0.055],
          [xF, 0.1, 0.505, 0.046, 0.05, 0.05],
          [xF, 0.04, 0.535, 0.05, 0.064, 0.047],
          [xF, 0.012, 0.56, 0.045, 0.058, 0.038],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.08, 1.89, 0.985, 0.035, 0.02, 0.012],
          [0.14, 1.93, 0.965, 0.05, 0.018, 0.01],
          [0.21, 1.965, 0.945, 0.045, 0.014, 0.008],
          [0.26, 1.985, 0.93, 0.022, 0.01, 0.006],
          [0.28, 1.99, 0.925, 0.003, 0.003, 0.003],
        ] },
      ],
      accent: [
        { kind: 'tube', bone: 'antler', pts: [[0.06, 1.88, 1.0], [0.12, 1.92, 0.98], [0.17, 1.95, 0.965]], radii: [0.042, 0.036, 0.04], segs: 7, mirror: true, colFn: aCol },
        { kind: 'raw', bone: 'antler', make: palm, mirror: true, colFn: aCol },
        { kind: 'sphere', bone: 'head', c: [0.045, 1.57, 1.655], r: 0.016, s: [0.8, 1.2, 0.6], mirror: true, col: 0x120E0B },
      ],
      accentRough: 0.65,
      eyes: [{ bone: 'head', p: [0.088, 1.85, 1.12], r: 0.018, dir: [0.9, 0.15, 0.35], iris: 0x1E140C, irisR: 0.95, pupil: 'h', pupilR: 0.42 }],
      mouth: [0, 1.48, 1.62],
      paint(P, C) {
        switch (P.part) {
          case 'body': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.3, 0.9, P.ny));
            cmix(C, K.low, sstep(-0.3, -0.8, P.ny) * 0.6);
            // lighter saddle behind the hump
            cmix(C, hex(0x5A4636), sstep(0.5, 0.9, P.ny) * sstep(-0.6, -0.2, P.z) * sstep(0.2, -0.1, P.z) * 0.5);
            break;
          }
          case 'head': {
            cset(C, K.side);
            cmix(C, K.muzzle, sstep(1.3, 1.5, P.z) * 0.8);
            cmix(C, hex(0x5E4A3A), sstep(0.4, 0.9, P.ny) * sstep(1.0, 1.2, P.z) * sstep(1.45, 1.3, P.z) * 0.6);
            cmix(C, K.nose, sstep(1.58, 1.63, P.z) * sstep(0.2, -0.3, P.ny));
            break;
          }
          case 'bell': cset(C, K.bell); break;
          case 'tail': cset(C, K.side); break;
          case 'hleg': case 'fleg': {
            cset(C, K.legs);
            cmix(C, K.side, sstep(0.9, 1.2, P.y));
            cmix(C, K.legsDark, sstep(0.4, 0.9, P.nz) * sstep(1.0, 0.8, P.y) * 0.45);
            cmix(C, hex(0xB7AA9A), sstep(0.0, -0.8, P.nx) * sstep(1.1, 0.8, P.y) * 0.5);
            cmix(C, K.hoof, sstep(0.07, 0.055, P.y));
            break;
          }
          case 'ear': {
            cset(C, K.ear);
            cmix(C, K.earIn, sstep(0.0, 0.6, P.nz) * 0.6);
            break;
          }
        }
        furFinish(P, C, 0.18, 50, 14);
        if (P.y < 0.06) C.ro = 0.45;
      },
      anim: {
        type: 'legged', walk: 1.8, trot: 3.6, run: 6.0, stride: 1.9, strideMax: 2.2,
        duty: [0.66, 0.48, 0.38], lift: [0.16, 0.14], flexF: 1.6, flexH: 1.0,
        bob: [0.015, 0.035, 0.06], pitchRun: 0.08, flexRun: 0.05, roll: 0.03,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.55, 0.3, 0.15], nod: 0.05, runNeck: 0.2,
        eatPitch: 0.22, eatDrop: 0.22, chestEat: 0.1, eatElev: [-70, -85, -100], eatY: 0.06, eatSplay: [0.3, 0.15],
        tail: ['tail1'], tailRun: [0.3], tailSway: 0.1,
        ears: ['earL', 'earR'], floatDepth: 1.68, swimHead: -0.5, paddleR: 0.18,
        sleep: { style: 'fold', neck: [1.3, 0.3], tail: [0, -0.2] },
      },
      baby: { head: 1.35, muzzle: 0.75, eye: 1.12, ear: 0.9, neck: [0.8, 1.1], leg: [0.95, 1.08], tail: 0.7 },
      // calf: lighter reddish brown
      babyPaint(P, C) { if (P.part !== 'hleg' && P.part !== 'fleg') cmix(C, hex(0x7A4C30), 0.6); },
    };
  };

  // ===== BUNNY (eastern cottontail) =====
  SPEC.bunny = () => {
    const xH = 0.062, xF = 0.042;
    const K = {
      base: hex(0x87705A), dark: hex(0x3A2C20), tip: hex(0xC4AD8E), belly: hex(0xEDE6DC), white: hex(0xF6F3EE),
      nape: hex(0xB0703C), earIn: hex(0xD6A496), earEdge: hex(0x2E241C), feet: hex(0xC2A986), buff: hex(0xB89A74),
    };
    // grizzled agouti coat: dark guard hair tips over buff, fine flecks
    const agouti = (P, C) => {
      const n = fbm(P.x * 260, P.y * 260, P.z * 260, 3);
      const t = fbm(P.x * 900, P.y * 900 + 5, P.z * 900, 2);
      cmix(C, K.dark, sstep(0.45, 0.75, n) * 0.6);
      cmix(C, K.tip, sstep(0.55, 0.85, t) * 0.45);
      cmix(C, K.dark, sstep(0.68, 0.8, noise(P.x * 1400, P.y * 1400, P.z * 1400)) * 0.35);
    };
    return {
      size: { length: 0.42, height: 0.45, radius: 0.11, eyeHeight: 0.25 },
      tex: [256, 256], rough: 0.92,
      detail: { kind: 'fur', tile: 0.018, amt: 0.15, bump: 0.3, sheen: 0.38 },
      shell: { parts: ['body', 'head', 'haunch', 'tail'], len: 0.006, n: 4 },
      bones: [
        ['hips', null, 0, 0.13, -0.06],
        ['chest', 'hips', 0, 0.13, 0.06],
        ['neck', 'chest', 0, 0.17, 0.1],
        ['head', 'neck', 0, 0.225, 0.13],
        ['nose', 'head', 0, 0.225, 0.208],
        ['tail1', 'hips', 0, 0.15, -0.16],
        ['thighL', 'hips', xH, 0.13, -0.07, 1],
        ['shinL', 'thighL', xH + 0.006, 0.075, -0.0, 1],
        ['hmetaL', 'shinL', xH + 0.004, 0.022, -0.115, 1],
        ['hpawL', 'hmetaL', xH, 0.008, -0.01, 1],
        ['armL', 'chest', xF, 0.12, 0.075, 1],
        ['foreL', 'armL', xF, 0.075, 0.068, 1],
        ['fmetaL', 'foreL', xF, 0.028, 0.08, 1],
        ['fpawL', 'fmetaL', xF, 0.008, 0.088, 1],
        ['earL', 'head', 0.02, 0.265, 0.125, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.03, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.15, -0.18, 0.045, 0.045, 0.045],
          [0, 0.15, -0.155, 0.075, 0.068, 0.07],
          [0, 0.14, -0.09, 0.088, 0.085, 0.085],
          [0, 0.133, -0.015, 0.082, 0.08, 0.08],
          [0, 0.14, 0.05, 0.068, 0.068, 0.074],
          [0, 0.17, 0.095, 0.052, 0.052, 0.058],
          [0, 0.21, 0.12, 0.044, 0.044, 0.045],
        ] },
        { name: 'head', bones: ['head', 'nose'], blend: 0.01, segs: 14, cap0: 3, cap1: 3, capLen1: 0.8, keys: [
          [0, 0.235, 0.095, 0.04, 0.04, 0.04],
          [0, 0.237, 0.125, 0.052, 0.054, 0.05],
          [0, 0.232, 0.16, 0.046, 0.046, 0.042],
          [0, 0.224, 0.19, 0.032, 0.032, 0.03],
          [0, 0.219, 0.206, 0.02, 0.02, 0.019],
        ] },
        { name: 'tail', bones: ['tail1'], segs: 10, cap0: 3, cap1: 3, capLen0: 1, capLen1: 1, fuzz: 0.25, keys: [
          [0, 0.152, -0.16, 0.024, 0.024, 0.022],
          [0, 0.156, -0.18, 0.032, 0.032, 0.03],
          [0, 0.16, -0.196, 0.022, 0.022, 0.02],
        ] },
        { name: 'haunch', mirror: true, bones: ['thighL'], segs: 12, cap0: 3, cap1: 3, capLen0: 1, capLen1: 1, keys: [
          [xH - 0.008, 0.155, -0.11, 0.022, 0.035, 0.035],
          [xH - 0.004, 0.125, -0.075, 0.033, 0.06, 0.055],
          [xH, 0.085, -0.035, 0.028, 0.045, 0.04],
        ] },
        { name: 'hfoot', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.012, segs: 10, cap0: 2, cap1: 2, keys: [
          [xH + 0.004, 0.07, -0.02, 0.018, 0.02, 0.02],
          [xH + 0.004, 0.04, -0.075, 0.016, 0.016, 0.015],
          [xH + 0.004, 0.022, -0.11, 0.016, 0.017, 0.012],
          [xH + 0.002, 0.016, -0.06, 0.018, 0.012, 0.01],
          [xH, 0.012, -0.01, 0.017, 0.01, 0.008],
          [xH, 0.011, 0.012, 0.012, 0.008, 0.007],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.01, segs: 10, cap1: 2, keys: [
          [xF - 0.006, 0.13, 0.07, 0.025, 0.03, 0.03],
          [xF, 0.1, 0.072, 0.019, 0.022, 0.021],
          [xF, 0.07, 0.07, 0.013, 0.013, 0.013],
          [xF, 0.035, 0.078, 0.0115, 0.0115, 0.0115],
          [xF, 0.012, 0.088, 0.013, 0.012, 0.011],
          [xF, 0.008, 0.103, 0.011, 0.007, 0.006],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 10, sub: 3, keys: [
          [0.02, 0.262, 0.125, 0.016, 0.011, 0.008],
          [0.03, 0.3, 0.116, 0.024, 0.01, 0.007],
          [0.043, 0.335, 0.106, 0.026, 0.009, 0.006],
          [0.054, 0.372, 0.097, 0.02, 0.007, 0.005],
          [0.06, 0.392, 0.093, 0.007, 0.004, 0.003],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'nose', c: [0, 0.226, 0.214], r: 0.0065, s: [1.3, 0.7, 0.6], col: 0x7A5A55 },
      ],
      accentRough: 0.4,
      eyes: [{ bone: 'head', p: [0.039, 0.247, 0.153], r: 0.0125, dir: [0.92, 0.15, 0.3], col: 0x150E0A }],
      mouth: [0, 0.205, 0.205],
      mouthBone: 'nose',
      paint(P, C) {
        switch (P.part) {
          case 'body': case 'haunch': {
            cset(C, K.base);
            agouti(P, C);
            cmix(C, K.nape, sstep(0.14, 0.17, P.z) * sstep(0.2, 0.7, P.ny) * 0.8);
            // the haunch is pale only on its inner side (its underside turns outward when the leg swings)
            const inner = P.part === 'haunch' ? sstep(0.1, -0.5, P.nx) : 1;
            cmix(C, K.belly, sstep(-0.35, -0.75, P.ny) * inner);
            break;
          }
          case 'head': {
            cset(C, K.base);
            agouti(P, C);
            // buff cheeks, pale eye ring, whitish chin and lip, rosy brown nose leather area
            const ex = Math.abs(P.x) - 0.039, ey = P.y - 0.247, ez = P.z - 0.153, ed = Math.sqrt(ex * ex * 3 + ey * ey + ez * ez);
            cmix(C, K.buff, sstep(0.2, -0.4, P.ny) * sstep(0.13, 0.16, P.z) * 0.5);
            cmix(C, hex(0xE0D2BC), sstep(0.023, 0.0175, ed) * 0.7);
            cmix(C, K.dark, sstep(0.0165, 0.014, ed) * 0.6);
            cmix(C, K.belly, sstep(-0.3, -0.7, P.ny) * sstep(0.15, 0.18, P.z));
            cmix(C, hex(0xBFA588), sstep(0.19, 0.205, P.z) * 0.35);
            if (P.z > 0.2) C.fl = 0.2;
            break;
          }
          case 'tail': cset(C, K.white); cmix(C, K.base, sstep(0.3, 0.9, P.ny) * sstep(-0.3, 0.2, -P.nz) * 0.6); C.fl = 1.3; break;
          case 'fleg': cset(C, K.base); agouti(P, C); cmix(C, K.feet, sstep(0.1, -0.6, P.nx) * 0.7 + sstep(0.04, 0.015, P.y) * 0.6); C.fl = 0.6; break;
          case 'hfoot': cset(C, K.feet); agouti(P, C); cmix(C, K.base, sstep(0.05, 0.09, P.y) * 0.7 + sstep(0.3, 0.9, P.nx) * 0.4); cmix(C, hex(0xE2D6C4), sstep(0.3, 0.8, P.ny) * sstep(0.03, 0.015, P.y) * 0.6); C.fl = 0.6; break;
          case 'ear': {
            cset(C, K.base);
            agouti(P, C);
            cmix(C, K.earIn, sstep(0.1, 0.6, P.nz) * sstep(0.012, 0.03, P.arc) * 0.9);
            cmix(C, K.earEdge, sstep(0.13, 0.155, P.arc) * 0.8);
            break;
          }
        }
        furFinish(P, C, 0.1, 140, 50);
        C.fl = Math.min(C.fl, P.part === 'tail' ? 1 : P.part === 'head' ? 0.5 : P.part === 'ear' ? 0.2 : 0.8);
      },
      anim: {
        type: 'legged', walk: 0.9, trot: 1.8, run: 3.6, stride: 0.32, strideMax: 2.4,
        duty: [0.6, 0.45, 0.35], lift: [0.03, 0.03], flexF: 1.3, flexH: 0.6,
        gaits: { w: [0.5, 0.55, 0.0, 0.05], t: [0.5, 0.55, 0.0, 0.05], g: [0.45, 0.5, 0.0, 0.02] },
        bob: [0.012, 0.02, 0.03], pitchRun: 0.2, flexRun: 0.12, roll: 0.02,
        hop: {
          gather: { f: [0, 0.05, 0.3], h: [0, 0, 0] }, gatherPitch: 0.06, gatherDrop: 0.008,
          up: { f: [0.35, 0.2, 1.2], h: [-0.35, -0.75, -1.0], pitch: -0.35 },
          mid: { f: [0.15, 0.35, 0.4], h: [0.1, -0.35, -0.3] },
          down: { f: [-0.15, 0.55, -0.3], h: [0.25, 0.15, 0.3], pitch: 0.3 },
        },
        sitUp: 0.12, sitDrop: 0.0, sitNeck: 0.6,
        neck: ['neck', 'head'], neckDist: [0.6, 0.4], nod: 0.03, chew: 0.05, chewRate: 14, eatY: 0.02, eatElev: [-60, -85], eatPitch: 0.12,
        tail: ['tail1'], tailRun: [0.5], tailAir: [0.6], tailSway: 0.05,
        ears: ['earL', 'earR'], earBack: 1.0, earEat: 1.0, floatDepth: 0.12, swimHead: -0.4,
        sleep: { style: 'loaf', neck: [0, 0.25], tail: [0, 0] }, happyHop: 0.15, wiggle: 0.5,
      },
      baby: { head: 1.35, eye: 1.0, ear: 0.82, muzzle: 0.75 },
    };
  };

  // ===== SQUIRREL (red squirrel) =====
  SPEC.squirrel = () => {
    const xH = 0.042, xF = 0.032;
    const K = {
      red: hex(0xA44C22), top: hex(0x7A3E20), side: hex(0x9C5632), belly: hex(0xEFE9DD), dark: hex(0x5A2A14), line: hex(0x241A14),
      tail: hex(0x8E4624), tailTip: hex(0x2E1E16), fringe: hex(0xC9935E), ear: hex(0x8C4A2A), tuft: hex(0x3A2216), feet: hex(0xA8683E),
    };
    return {
      size: { length: 0.4, height: 0.32, radius: 0.09, eyeHeight: 0.16 },
      tex: [256, 256], rough: 0.9,
      detail: { kind: 'fur', tile: 0.016, amt: 0.16, bump: 0.3, sheen: 0.35 },
      shell: { parts: ['body', 'head', 'tail', 'haunch'], d1: ['tail'], n1: 2, len: 0.014, n: 4, lean: 0.5 },
      bones: [
        ['hips', null, 0, 0.1, -0.05],
        ['chest', 'hips', 0, 0.1, 0.045],
        ['neck', 'chest', 0, 0.12, 0.085],
        ['head', 'neck', 0, 0.152, 0.108],
        ['tail1', 'hips', 0, 0.103, -0.11],
        ['tail2', 'tail1', 0, 0.15, -0.165],
        ['tail3', 'tail2', 0, 0.225, -0.175],
        ['tail4', 'tail3', 0, 0.28, -0.135],
        ['thighL', 'hips', xH, 0.1, -0.055, 1],
        ['shinL', 'thighL', xH + 0.004, 0.062, -0.005, 1],
        ['hmetaL', 'shinL', xH + 0.003, 0.02, -0.075, 1],
        ['hpawL', 'hmetaL', xH, 0.006, 0.002, 1],
        ['armL', 'chest', xF, 0.092, 0.06, 1],
        ['foreL', 'armL', xF, 0.058, 0.052, 1],
        ['fmetaL', 'foreL', xF, 0.022, 0.064, 1],
        ['fpawL', 'fmetaL', xF, 0.006, 0.072, 1],
        ['earL', 'head', 0.019, 0.178, 0.1, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.02, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.108, -0.125, 0.025, 0.025, 0.025],
          [0, 0.106, -0.105, 0.045, 0.045, 0.045],
          [0, 0.1, -0.055, 0.054, 0.052, 0.05],
          [0, 0.097, 0.005, 0.047, 0.045, 0.045],
          [0, 0.102, 0.05, 0.039, 0.04, 0.042],
          [0, 0.12, 0.085, 0.03, 0.031, 0.033],
          [0, 0.148, 0.103, 0.026, 0.026, 0.026],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 3, capLen1: 0.9, keys: [
          [0, 0.157, 0.087, 0.025, 0.026, 0.024],
          [0, 0.161, 0.108, 0.032, 0.032, 0.029],
          [0, 0.157, 0.13, 0.028, 0.027, 0.025],
          [0, 0.15, 0.148, 0.019, 0.018, 0.017],
          [0, 0.146, 0.157, 0.012, 0.012, 0.011],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3', 'tail4'], blend: 0.02, segs: 12, cap1: 3, capLen1: 1, fuzz: 0.22, keys: [
          [0, 0.104, -0.095, 0.014, 0.014, 0.014],
          [0, 0.106, -0.122, 0.026, 0.026, 0.026],
          [0, 0.135, -0.17, 0.032, 0.042, 0.04],
          [0, 0.195, -0.19, 0.038, 0.05, 0.05],
          [0, 0.256, -0.163, 0.04, 0.05, 0.048],
          [0, 0.285, -0.11, 0.035, 0.044, 0.042],
          [0, 0.285, -0.065, 0.024, 0.03, 0.03],
        ] },
        { name: 'haunch', mirror: true, bones: ['thighL'], segs: 12, cap0: 3, cap1: 3, capLen0: 1, capLen1: 1, keys: [
          [xH - 0.006, 0.118, -0.085, 0.016, 0.025, 0.025],
          [xH - 0.003, 0.095, -0.055, 0.023, 0.04, 0.036],
          [xH, 0.07, -0.02, 0.018, 0.028, 0.025],
        ] },
        { name: 'hfoot', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.008, segs: 10, cap0: 2, cap1: 2, keys: [
          [xH + 0.004, 0.06, -0.01, 0.012, 0.013, 0.013],
          [xH + 0.003, 0.035, -0.05, 0.011, 0.011, 0.01],
          [xH + 0.003, 0.02, -0.072, 0.011, 0.011, 0.008],
          [xH + 0.001, 0.013, -0.035, 0.012, 0.008, 0.007],
          [xH, 0.009, 0.0, 0.011, 0.007, 0.006],
          [xH, 0.008, 0.014, 0.008, 0.005, 0.005],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.008, segs: 10, cap1: 2, keys: [
          [xF - 0.004, 0.1, 0.058, 0.016, 0.019, 0.019],
          [xF, 0.078, 0.057, 0.0125, 0.015, 0.014],
          [xF, 0.055, 0.054, 0.0095, 0.0095, 0.0095],
          [xF, 0.028, 0.062, 0.008, 0.008, 0.008],
          [xF, 0.009, 0.072, 0.008, 0.008, 0.007],
          [xF, 0.006, 0.083, 0.007, 0.005, 0.004],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.018, 0.175, 0.1, 0.009, 0.006, 0.005],
          [0.021, 0.19, 0.097, 0.011, 0.005, 0.004],
          [0.023, 0.204, 0.094, 0.008, 0.004, 0.003],
          [0.024, 0.214, 0.092, 0.004, 0.003, 0.003],
          [0.025, 0.226, 0.09, 0.001, 0.001, 0.001],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 0.147, 0.165], r: 0.0045, s: [1.2, 0.8, 0.7], col: 0x2A1A14 },
      ],
      accentRough: 0.4,
      eyes: [{ bone: 'head', p: [0.025, 0.167, 0.125], r: 0.0082, dir: [0.9, 0.2, 0.3], iris: 0x1C120C, irisR: 0.95, pupilR: 0.55, lid: [0.8, -0.8, 0.15] }],
      mouth: [0, 0.14, 0.16],
      paint(P, C) {
        switch (P.part) {
          case 'body': case 'haunch': case 'head': {
            // American red squirrel: rusty back, olive-orange flanks, white belly split off by a dark side line
            cset(C, K.side);
            cmix(C, K.top, sstep(0.3, 0.9, P.ny) * 0.8);
            cmix(C, hex(0x8A6A48), sstep(0.2, -0.1, P.ny) * sstep(-0.25, 0.0, P.ny) * 0.35);
            cmix(C, K.belly, sstep(-0.22, -0.45, P.ny) * (P.part === 'haunch' ? sstep(0.1, -0.5, P.nx) : 1));
            if (P.part === 'body') cmix(C, K.line, sstep(0.07, 0.02, Math.abs(P.ny + 0.2)) * sstep(-0.1, -0.06, P.z) * sstep(0.07, 0.03, P.z) * 0.85);
            if (P.part === 'head') {
              const ex = Math.abs(P.x) - 0.025, ey = P.y - 0.167, ez = P.z - 0.125, ed = Math.sqrt(ex * ex * 3 + ey * ey + ez * ez);
              cmix(C, hex(0xF0E8DA), sstep(0.0135, 0.0108, ed) * 0.9);
              cmix(C, K.belly, sstep(-0.1, -0.5, P.ny) * sstep(0.13, 0.145, P.z) * 0.7);
            }
            break;
          }
          case 'tail': {
            // rusty plume frosted with buff, a black band toward the edges
            cset(C, K.tail);
            const g = grain(P, 40, 12);
            cmix(C, K.tailTip, sstep(0.5, 0.85, g) * 0.55);
            cmix(C, K.fringe, sstep(0.6, 0.85, noise(P.x * 700, P.y * 700, P.z * 700)) * 0.35);
            break;
          }
          case 'hfoot': case 'fleg': cset(C, K.side); cmix(C, K.feet, sstep(0.06, 0.03, P.y) * 0.6); cmix(C, hex(0xC8B49A), sstep(0.1, -0.6, P.nx) * 0.5); cmix(C, K.belly, sstep(0.0, -0.8, P.nz) * sstep(0.05, 0.09, P.y) * 0.4); break;
          case 'ear': cset(C, K.ear); cmix(C, K.tuft, sstep(0.025, 0.04, P.arc)); break;
        }
        furFinish(P, C, P.part === 'tail' ? 0.25 : 0.12, P.part === 'tail' ? 60 : 160, P.part === 'tail' ? 8 : 50);
        C.fl = P.part === 'tail' ? 1 : P.part === 'head' ? 0.3 : 0.45;
      },
      anim: {
        type: 'legged', walk: 1.0, trot: 2.0, run: 3.8, stride: 0.3, strideMax: 2.6,
        duty: [0.55, 0.42, 0.32], lift: [0.025, 0.03], flexF: 1.3, flexH: 0.6,
        gaits: { w: [0.5, 0.55, 0.0, 0.05], t: [0.5, 0.55, 0.0, 0.05], g: [0.42, 0.47, 0.0, 0.03] },
        bob: [0.008, 0.015, 0.025], pitchRun: 0.25, flexRun: 0.15, roll: 0.02,
        hop: {
          gather: { f: [0, 0.04, 0.3], h: [0, 0, 0] }, gatherPitch: 0.05, gatherDrop: 0.006,
          up: { f: [0.35, 0.25, 1.2], h: [-0.3, -0.8, -1.0], pitch: -0.3 },
          mid: { f: [0.1, 0.45, 0.2], h: [0.1, -0.35, -0.3] },
          down: { f: [-0.1, 0.65, -0.3], h: [0.25, 0.2, 0.3], pitch: 0.3 },
        },
        sitUp: 0.55, sitDrop: 0.0, sitNeck: 0.55, sitPaws: [0.55, 0.35, 1.6],
        neck: ['neck', 'head'], neckDist: [0.6, 0.4], nod: 0.05, chew: 0.08, chewRate: 16, eatY: 0.02, eatElev: [-60, -85], eatPitch: 0.1,
        tail: ['tail1', 'tail2', 'tail3', 'tail4'], tailRun: [-0.25, -0.3, -0.3, -0.2], tailIdle: [0.18, 0.12, 0.08, 0.0], tailAir: [-0.4, -0.3, -0.2, -0.1], tailSway: 0.12, tailFlick: 0.25,
        ears: ['earL', 'earR'], earBack: 0.5, floatDepth: 0.1, swimHead: -0.4, tailSwim: -0.9,
        climb: { splay: 0.55, drop: 0.55, reach: 0.3, neck: -0.45, tail: [-0.35, -1.15, -0.85, -0.45], flex: 0.3, toe: 0.9 },
        sleep: { style: 'curl', neck: [2.0, 0.7], tail: [3.0, -0.35], bend: 1.2, roll: 0.25 }, happyHop: 0.12,
      },
      baby: { head: 1.35, eye: 1.0, ear: 0.8, muzzle: 0.75, tail: 0.65 },
    };
  };

  // ---------- birds ----------
  // Wing model: a planar linkage. In the rest (bind) pose the wing is spread flat (span along +X, chord along Z, up +Y).
  // Joints (wing = humerus, fore, hand) and feather bones rotate in that plane about local Y; the shoulder also rolls the plane.
  // Each feather bone has a spread angle and a folded angle (absolute, in plane; 0 = pointing out along the span, 90 = straight back).
  const FNC = 8; // feather atlas columns
  const fcell = (k) => [k / FNC + 0.004, 0, 1 / FNC - 0.008, 1];
  function birdWing(o) {
    // o: sh [x,y,z], arm [a,b,c], fold {hum, elb, wri} (deg), sec, pri, ter: feather sets, layers
    const bones = [], feathers = [], fb = [];
    const [a, b, c] = o.arm, sh = o.sh;
    const el = [sh[0] + a, sh[1], sh[2]], wr = [el[0] + b, el[1], el[2]], tp = [wr[0] + c, wr[1], wr[2]];
    bones.push(['wingL', o.parent || 'hips', sh[0], sh[1], sh[2], 1], ['wforeL', 'wingL', el[0], el[1], el[2], 1], ['whandL', 'wforeL', wr[0], wr[1], wr[2], 1]);
    const F = o.fold, absP = { wingL: F.hum, wforeL: F.hum + F.elb, whandL: F.hum + F.elb + F.wri };
    const startOf = { wingL: sh, wforeL: el, whandL: wr }, lenOf = { wingL: a, wforeL: b, whandL: c };
    let k = 0;
    for (const set of o.sets) {
      for (let i = 0; i < set.n; i++) {
        const u = set.n > 1 ? i / (set.n - 1) : 0;
        const par = set.parent, st = startOf[par];
        const along = lerp(set.at[0], set.at[1], u) * lenOf[par];
        const bx = st[0] + along, by = st[1] + (set.y || 0), bz = st[2] + (set.z || 0);
        const name = 'f' + k++ + 'L';
        bones.push([name, par, bx, by, bz, 1]);
        const spreadA = lerp(set.spread[0], set.spread[1], u), foldA = lerp(set.fold[0], set.fold[1], u);
        fb.push({ name, d: (foldA - absP[par] - spreadA) * DEG });
        // blades on this bone: the flight feather plus optional covert layers
        for (const bl of set.blades) {
          const len = lerp(bl.len[0], bl.len[1], u), wid = lerp(bl.wid[0], bl.wid[1], u);
          const back = bl.back || 0; // shift blade base back along its own direction (negative = toward root)
          const ya = spreadA * DEG;
          feathers.push({
            bone: name, mirror: true, len, wid, curl: bl.curl == null ? 0.06 : bl.curl, tip: bl.tip, rootW: bl.rootW, camber: bl.camber,
            base: [bx + Math.cos(ya) * back, by + (bl.layer || 0) + (set.layerStep || 0) * (set.layerDir === -1 ? -i : i), bz - Math.sin(ya) * back],
            // dyaw (deg): a second feather on the same bone, turned a little (sculpted birds' fuller wings)
            yaw: ya + (bl.dyaw || 0) * DEG, roll: (bl.twist || 0) * DEG, pitch: (bl.pitch || 0) * DEG, cell: fcell(bl.cell),
          });
        }
      }
    }
    return { bones, feathers, wing: { fold: F, spread: o.spread, folded: o.folded, foldedPos: o.foldedPos, fb, flap: o.flap } };
  }
  // standard wing layout scaled per species. o: s (scale), sh, prim (primary length mult), wid (width mult), tip (primary roundness),
  // cells { prim, sec, gcov, lcov, tert, pcov }, fold/spread/folded/foldedPos/flap overrides
  function stdWing(o) {
    const s = o.s, wm = (o.wid || 1) * s, pl = o.prim || 1, c = o.cells || {}, tp = o.tip;
    const ff = o.featherFold || {}, ps = o.primSpread || [72, 6];
    // atlas: blades for a sculpted bird's feather atlas (real outlines cut by its alpha): flatter layers so the folded
    // wing lies close to the body, a second primary on each hand bone (half a step out), tertial and marginal coverts
    const A = !!o.atlas, ls = A ? 0.55 : 1, aw = A ? 1.15 : 1;
    const tert = [{ len: [0.12 * s, 0.115 * s], wid: [0.04 * wm * aw, 0.04 * wm * aw], cell: c.tert == null ? 4 : c.tert, layer: 0.012 * s * ls, curl: 0.12 }];
    const sec = [
      { len: [0.115 * s, 0.105 * s], wid: [0.034 * wm * aw, 0.032 * wm * aw], cell: c.sec == null ? 1 : c.sec, layer: 0, curl: 0.1, tip: o.secTip },
      { len: [0.07 * s, 0.065 * s], wid: [0.032 * wm * aw, 0.03 * wm * aw], cell: c.gcov == null ? 2 : c.gcov, layer: 0.005 * s * ls, back: -0.006 * s, curl: 0.1 },
      { len: [0.045 * s, 0.042 * s], wid: [0.03 * wm * aw, 0.028 * wm * aw], cell: c.lcov == null ? 3 : c.lcov, layer: 0.009 * s * ls, back: -0.01 * s, curl: 0.1 },
    ];
    const prim = [
      { len: [0.16 * s * pl, 0.21 * s * pl], wid: [0.036 * wm * aw, 0.03 * wm * (o.primTipWid || 1) * aw], cell: c.prim == null ? 0 : c.prim, layer: -0.006 * s * ls, curl: 0.05, tip: tp },
      { len: [0.065 * s, 0.055 * s], wid: [0.03 * wm * aw, 0.024 * wm * aw], cell: c.pcov == null ? 3 : c.pcov, layer: 0.003 * s * ls, back: -0.012 * s, curl: 0.06 },
    ];
    if (A) {
      tert.push({ len: [0.06 * s, 0.055 * s], wid: [0.04 * wm * aw, 0.038 * wm * aw], cell: c.lcov == null ? 3 : c.lcov, layer: 0.016 * s * ls, back: -0.014 * s, curl: 0.08 });
      sec.push({ len: [0.03 * s, 0.028 * s], wid: [0.028 * wm * aw, 0.026 * wm * aw], cell: c.mcov != null ? c.mcov : c.lcov == null ? 3 : c.lcov, layer: 0.0115 * s * ls, back: -0.016 * s, curl: 0.06 });
      prim.push(Object.assign({}, prim[0], { len: [0.155 * s * pl, 0.205 * s * pl], layer: -0.0066 * s * ls, dyaw: (ps[1] - ps[0]) / 12 }));
    }
    return birdWing({
      sh: o.sh, arm: [0.08 * s, 0.1 * s, 0.075 * s], parent: o.parent,
      fold: o.fold || { hum: 86, elb: -170, wri: 172 },
      spread: o.spread || { roll: 4, yaw: 0, pitch: 0 },
      folded: o.folded, foldedPos: o.foldedPos, flap: o.flap,
      sets: [
        { parent: 'wingL', n: 3, at: [0.2, 0.9], spread: [100, 94], fold: ff.tert || [112, 104], y: 0.004 * s, blades: tert },
        { parent: 'wforeL', n: 6, at: [0.0, 0.97], spread: [92, 78], fold: ff.sec || [106, 89], layerStep: -0.0012 * s, blades: sec },
        { parent: 'whandL', n: 7, at: [0.0, 1.0], spread: ps, fold: ff.prim || [96, 86], layerStep: -0.0012 * s, blades: prim },
      ],
    });
  }
  // fan of tail feathers on one bone. n feathers spread over +-spreadDeg, pointing back (yaw 90) with pitch (deg, + raises tips)
  function tailFan(bone, base, n, len, wid, spreadDeg, pitch, cell, o) {
    o = o || {};
    const out = [];
    for (let i = 0; i < n; i++) {
      const u = n > 1 ? (i / (n - 1)) * 2 - 1 : 0, a = Math.abs(u);
      out.push({ bone, base: [base[0] + u * (o.dx || 0), base[1] - a * (o.dy || 0), base[2] - (1 - a) * (o.dz || 0)], yaw: (90 + u * spreadDeg) * DEG, pitch: (pitch - a * (o.droop || 0)) * DEG, roll: u * (o.roll || 0) * DEG,
        len: len * (1 - a * (o.taper || 0)), wid, curl: o.curl == null ? 0.04 : o.curl, tip: o.tip, cell: fcell(typeof cell === 'function' ? cell(i, u) : cell) });
    }
    return out;
  }

  // baby down: soft fuzzy feather painter (u across atlas cells, t along the blade)
  function downFeather(base, edge, bars) {
    return (u, t, C) => {
      const s = fract(u * FNC);
      cset(C, base);
      cmix(C, edge, sstep(0.45, 1, Math.abs(s - 0.5) * 2) * 0.55);
      if (bars) cmix(C, bars, sstep(0.55, 0.85, Math.sin(t * 30 + s) * 0.5 + 0.5) * 0.35);
      cmul(C, 0.92 + 0.14 * noise(s * 9, t * 14, 4.2));
    };
  }
  // tag accent parts with a baby color
  const babyC = (list, col) => list.map((a) => Object.assign(a, { babyCol: col }));
  // fluffy down on the fur atlas: base color with soft fuzz
  function downPaint(C, P, col, amt) { cset(C, col); cmul(C, 1 - amt + amt * 2 * grain(P, 160, 60)); }

  // toes: tubes from the foot pivot; angles in degrees from +Z (forward), positive toward +X (outside of left foot)
  function birdToes(foot, toes, col, bone) {
    const out = [];
    for (const t of toes) {
      const a = t.a * DEG, L = t.len, n = 4, pts = [], radii = [];
      for (let i = 0; i <= n; i++) {
        const f = i / n, d = L * f;
        pts.push([foot[0] + Math.sin(a) * d, foot[1] + (t.lift || 0) * f - 0.25 * (t.r || 0.004) * Math.sin(f * PI), foot[2] + Math.cos(a) * d]);
        radii.push(lerp(t.r || 0.004, (t.r || 0.004) * 0.45, f));
      }
      out.push({ kind: 'tube', bone, pts, radii, segs: 5, mirror: true, col, capEnd: true });
      if (t.claw) {
        const e = pts[n], d2 = [Math.sin(a), 0, Math.cos(a)];
        out.push({ kind: 'tube', bone, pts: [e, [e[0] + d2[0] * t.claw * 0.6, e[1] - t.claw * 0.25, e[2] + d2[2] * t.claw * 0.6], [e[0] + d2[0] * t.claw, e[1] - t.claw * 0.75, e[2] + d2[2] * t.claw]], radii: [radii[n] * 0.9, radii[n] * 0.55, radii[n] * 0.15], segs: 4, mirror: true, col: t.clawCol || 0x2A2522, capEnd: true });
      }
    }
    return out;
  }
  // webbing between the three front toes
  function birdWeb(foot, toes, col, bone) {
    const pts = [];
    const fr = toes.filter((t) => !t.back);
    const L = fr.map((t) => t.len * 0.92);
    const P = (t, d) => [foot[0] + Math.sin(t.a * DEG) * d, foot[1] + 0.002, foot[2] + Math.cos(t.a * DEG) * d];
    pts.push(P(fr[0], L[0]));
    pts.push(P({ a: (fr[0].a + fr[1].a) / 2 }, Math.min(L[0], L[1]) * 0.78));
    pts.push(P(fr[1], L[1]));
    pts.push(P({ a: (fr[1].a + fr[2].a) / 2 }, Math.min(L[1], L[2]) * 0.78));
    pts.push(P(fr[2], L[2]));
    pts.push(P(fr[2], L[2] * 0.15));
    pts.push(P(fr[0], L[0] * 0.15));
    const c = [foot[0] + Math.sin(fr[1].a * DEG) * L[1] * 0.35, foot[1] + 0.002, foot[2] + Math.cos(fr[1].a * DEG) * L[1] * 0.35];
    return { kind: 'fan', bone, c, outline: pts, thick: 0.0025, n: [0, 1, 0], mirror: true, col };
  }
  // feather atlas painters: s across (0..1, 0.5 = shaft), t along (0 base .. 1 tip)
  function vane(s, t, C, base, edge, shaftCol) {
    cset(C, base);
    const e = Math.abs(s - 0.5) * 2;
    cmix(C, edge, sstep(0.55, 1.0, e) * 0.5);
    if (shaftCol) cmix(C, shaftCol, sstep(0.06, 0.02, Math.abs(s - 0.5)) * 0.7 * (1 - t * 0.5));
    // barb streaks
    const bb = noise(s * 6 + t * 40, t * 4, 2.3);
    cmul(C, 0.9 + 0.2 * bb);
  }

  // ===== DUCK (male mallard) =====
  SPEC.duck = () => {
    const xL = 0.042;
    const K = {
      green: hex(0x1D5235), greenHi: hex(0x2C7A4E), ring: hex(0xF4F2EC), chest: hex(0x6A3324), chestHi: hex(0x84452F),
      flank: hex(0xC4C1BA), flankDk: hex(0x8A8781), back: hex(0x8A7F72), backDk: hex(0x5E554B), rump: hex(0x151515),
      belly: hex(0xD8D5CE), wing: hex(0x7E7468), wingDk: hex(0x564E46), blue: hex(0x2C3EAA), purple: hex(0x4A2E98),
      white: hex(0xF5F4F0), black: hex(0x141414), tailW: hex(0xE9E7E2), leg: hex(0xF0892A),
    };
    const wing = (bl, fo) => birdWing({
      sh: [0.05, 0.262, 0.06], arm: [0.08, 0.1, 0.075],
      fold: { hum: 86, elb: -170, wri: 172 },
      spread: { roll: 4, yaw: 0, pitch: 0 },
      folded: (fo || {}).folded || { roll: -24, yaw: 2, pitch: -6 },
      foldedPos: (fo || {}).pos || [0.016, 0.012, -0.03],
      flap: { amp: 60, rate: 6.0, upFold: 0.35, twist: 12, glide: 4 },
      sets: [
        { parent: 'wingL', n: 3, at: [0.2, 0.9], spread: [100, 94], fold: [109, 105], y: 0.004, blades: bl[0] },
        { parent: 'wforeL', n: 6, at: [0.0, 0.97], spread: [92, 78], fold: [104, 90], layerStep: -0.0012, blades: bl[1] },
        { parent: 'whandL', n: 7, at: [0.0, 1.0], spread: [72, 6], fold: [95, 87], layerStep: -0.0012, blades: bl[2] },
      ],
    });
    // wide, overlapping blades so the folded wing reads as one smooth surface on the back
    const W = wing([
      [{ len: [0.12, 0.115], wid: [0.05, 0.048], cell: 4, layer: 0.012, curl: 0.12 }],
      [
        { len: [0.115, 0.105], wid: [0.042, 0.04], cell: 1, layer: 0, curl: 0.1 },
        { len: [0.07, 0.065], wid: [0.04, 0.038], cell: 2, layer: 0.005, back: -0.006, curl: 0.1 },
        { len: [0.045, 0.042], wid: [0.038, 0.035], cell: 3, layer: 0.009, back: -0.01, curl: 0.1 },
      ],
      [
        { len: [0.16, 0.21], wid: [0.042, 0.036], cell: 0, layer: -0.006, curl: 0.05 },
        { len: [0.065, 0.055], wid: [0.036, 0.03], cell: 3, layer: 0.003, back: -0.012, curl: 0.06 },
      ],
    ]);
    // the sculpted duck's feather atlas: real feather outlines, so more of them (same bones): two primaries per hand
    // bone, marginal coverts over the leading edge, tertial coverts; thinner layers, so the folded wing lies flat
    const WA = wing([
      [{ len: [0.125, 0.118], wid: [0.054, 0.05], cell: 4, layer: 0.0066, curl: 0.1 }, { len: [0.06, 0.055], wid: [0.05, 0.046], cell: 3, layer: 0.0088, back: -0.014, curl: 0.08 }],
      [
        { len: [0.118, 0.108], wid: [0.046, 0.044], cell: 1, layer: 0, curl: 0.08 },
        { len: [0.072, 0.066], wid: [0.046, 0.044], cell: 2, layer: 0.0026, back: -0.006, curl: 0.08 },
        { len: [0.046, 0.043], wid: [0.044, 0.042], cell: 3, layer: 0.0046, back: -0.01, curl: 0.08 },
        { len: [0.03, 0.028], wid: [0.038, 0.036], cell: 3, layer: 0.0062, back: -0.016, curl: 0.06 },
      ],
      [
        { len: [0.165, 0.215], wid: [0.048, 0.042], cell: 0, layer: -0.003, curl: 0.04 },
        { len: [0.16, 0.21], wid: [0.048, 0.042], cell: 0, layer: -0.0036, curl: 0.04, dyaw: -5.5 },
        { len: [0.066, 0.056], wid: [0.042, 0.036], cell: 3, layer: 0.0016, back: -0.012, curl: 0.05 },
      ],
    ], { folded: { roll: -36, yaw: 2, pitch: 0 }, pos: [-0.004, 0.012, -0.03] });
    const toes = [{ a: -26, len: 0.046, r: 0.0038 }, { a: 0, len: 0.054, r: 0.004 }, { a: 26, len: 0.044, r: 0.0038 }, { a: 180, len: 0.012, r: 0.0028, back: true, lift: 0.006 }];
    const foot = [xL, 0.006, -0.008];
    return {
      size: { length: 0.58, height: 0.43, radius: 0.12, eyeHeight: 0.38 },
      tex: [256, 256], rough: 0.85, orm: true,
      detail: { kind: 'feather', tile: 0.024, amt: 0.07, bump: 0.18 },
      shell: { parts: ['body', 'head'], len: 0.005, n: 3, babyOnly: true, babyLen: 1, lean: 0.2 },
      bones: [
        ['hips', null, 0, 0.2, 0.0],
        ['tail', 'hips', 0, 0.225, -0.19],
        ['neck', 'hips', 0, 0.24, 0.135],
        ['neck2', 'neck', 0, 0.29, 0.162],
        ['head', 'neck2', 0, 0.365, 0.165],
        ['thighL', 'hips', xL - 0.01, 0.17, -0.03, 1],
        ['shinL', 'thighL', xL, 0.115, 0.0, 1],
        ['hmetaL', 'shinL', xL, 0.06, -0.03, 1],
        ['hpawL', 'hmetaL', xL, 0.006, -0.008, 1],
        ...W.bones,
      ],
      fur: [
        // boat shaped body: long flat back, full breast, tail drawn out to a point; thick neck base into a round head
        { name: 'body', bones: ['tail', 'hips', 'neck', 'neck2', 'head'], blend: 0.025, segs: 16, cap0: 3, capLen0: 0.9, keys: [
          [0, 0.246, -0.262, 0.016, 0.008, 0.01],
          [0, 0.238, -0.235, 0.042, 0.022, 0.03],
          [0, 0.224, -0.185, 0.07, 0.045, 0.06],
          [0, 0.211, -0.115, 0.088, 0.062, 0.08],
          [0, 0.207, -0.03, 0.094, 0.07, 0.088],
          [0, 0.214, 0.045, 0.09, 0.08, 0.09],
          [0, 0.232, 0.1, 0.074, 0.076, 0.082],
          [0, 0.262, 0.136, 0.052, 0.05, 0.06],
          [0, 0.297, 0.156, 0.035, 0.033, 0.036],
          [0, 0.335, 0.165, 0.027, 0.027, 0.028],
          [0, 0.365, 0.164, 0.024, 0.024, 0.024],
        ] },
        { name: 'head', bones: ['head'], segs: 16, cap0: 3, cap1: 2, capLen1: 0.5, dtile: 0.35, keys: [
          [0, 0.383, 0.134, 0.017, 0.018, 0.017],
          [0, 0.388, 0.151, 0.023, 0.027, 0.022],
          [0, 0.389, 0.17, 0.024, 0.028, 0.021],
          [0, 0.384, 0.188, 0.021, 0.022, 0.018],
          [0, 0.376, 0.203, 0.016, 0.014, 0.013],
          [0, 0.373, 0.21, 0.013, 0.01, 0.01],
        ] },
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap0: 2, cap1: 2, dkind: 'scale', dtile: 0.4, keys: [
          [xL, 0.13, -0.002, 0.016, 0.018, 0.018],
          [xL, 0.095, -0.013, 0.01, 0.011, 0.011],
          [xL, 0.06, -0.03, 0.0055, 0.0055, 0.0055],
          [xL, 0.032, -0.019, 0.0044, 0.0048, 0.0048],
          [xL, 0.01, -0.009, 0.005, 0.0055, 0.0055],
        ] },
        { name: 'wcov', mirror: true, bones: ['wingL', 'wforeL', 'whandL'], blend: 0.012, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.045, 0.262, 0.06, 0.012, 0.007, 0.007],
          [0.13, 0.262, 0.058, 0.014, 0.006, 0.006],
          [0.23, 0.262, 0.056, 0.011, 0.005, 0.005],
          [0.3, 0.262, 0.054, 0.006, 0.003, 0.003],
        ] },
      ],
      paint(P, C) {
        const fine = noise(P.x * 500, P.y * 500, P.z * 500);
        C.ro = 0.85; C.me = 0;
        switch (P.part) {
          case 'body': {
            const ver = Math.sin(P.y * 950 + Math.sin(P.z * 320) * 2.5 + noise(P.x * 200, P.y * 200, P.z * 200) * 4);
            cset(C, K.flank);
            cmix(C, K.flankDk, sstep(0.5, 0.95, ver) * 0.45);
            cmix(C, K.belly, sstep(-0.5, -0.85, P.ny));
            cmix(C, K.back, sstep(0.25, 0.6, P.ny));
            cmix(C, K.backDk, sstep(0.75, 0.97, P.ny) * 0.4);
            const br = sstep(0.06, 0.1, P.z) * sstep(0.283, 0.272, P.y) * sstep(-0.75, -0.45, P.ny + P.nz * 0.4);
            cmix(C, K.chest, br);
            cmix(C, K.chestHi, br * sstep(0.2, 0.7, P.nz) * 0.4);
            cmix(C, K.rump, sstep(-0.165, -0.2, P.z));
            cmix(C, K.white, sstep(-0.145, -0.165, P.z) * sstep(-0.18, -0.165, P.z) * sstep(0.3, -0.2, P.ny) * 0.6);
            const nk = sstep(0.11, 0.13, P.z);
            cmix(C, K.ring, nk * sstep(0.276, 0.281, P.y) * sstep(0.291, 0.286, P.y));
            const gr = nk * sstep(0.288, 0.293, P.y);
            cmix(C, K.green, gr);
            if (gr > 0.5) { C.ro = 0.38; C.me = 0.2; cmix(C, K.greenHi, sstep(0.3, 0.9, P.nx * P.nx) * 0.35); }
            break;
          }
          case 'head': {
            cset(C, K.green);
            cmix(C, K.greenHi, sstep(0.3, 0.95, Math.abs(P.nx)) * 0.45);
            cmix(C, hex(0x1B3F5A), sstep(0.5, 0.95, P.ny) * 0.25);
            C.ro = 0.3; C.me = 0.28;
            break;
          }
          case 'leg': cset(C, K.belly); cmix(C, K.leg, sstep(0.12, 0.105, P.y)); C.ro = 0.55; break;
          case 'wcov': cset(C, K.wing); break;
        }
        if (P.part !== 'leg') cmul(C, 0.93 + 0.12 * fine);
      },
      feathers: (rest, md) => ({
        tex: [256, 128], rough: 0.8,
        list: md ? [
          ...WA.feathers,
          // tail: a fan of whitish rectrices, black uppertail coverts over its base, the drake's two curled feathers
          ...[-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5].map((i) => ({ bone: 'tail', base: [i * 0.0055, 0.246 - Math.abs(i) * 0.0014, -0.236 + Math.abs(i) * 0.002], yaw: (90 + i * 7.5) * DEG, pitch: (7 - Math.abs(i) * 0.9) * DEG, len: 0.094 - Math.abs(i) * 0.0045, wid: 0.034, curl: 0.03, cell: fcell(5) })),
          ...[-2, -1, 0, 1, 2].map((i) => ({ bone: 'tail', base: [i * 0.008, 0.253 - Math.abs(i) * 0.002, -0.212], yaw: (90 + i * 11) * DEG, pitch: 7 * DEG, len: 0.056, wid: 0.04, curl: 0.04, cell: fcell(6) })),
          ...[-1, 1].map((i) => ({ bone: 'tail', base: [i * 0.004, 0.257, -0.226], yaw: (90 - i * 6) * DEG, roll: 90 * DEG, pitch: 35 * DEG, len: 0.042, wid: 0.016, curl: 0.9, camber: 0.02, cell: fcell(6) })),
        ] : [
          ...W.feathers,
          ...[-2, -1, 0, 1, 2].map((i) => ({ bone: 'tail', base: [i * 0.01, 0.245 - Math.abs(i) * 0.002, -0.24], yaw: (90 + i * 12) * DEG, pitch: 4 * DEG, len: 0.088 - Math.abs(i) * 0.007, wid: 0.028, curl: 0.03, tip: 0.6, cell: fcell(5) })),
          ...[-1, 1].map((i) => ({ bone: 'tail', base: [i * 0.004, 0.252, -0.222], yaw: (90 - i * 6) * DEG, roll: 90 * DEG, pitch: 35 * DEG, len: 0.04, wid: 0.01, curl: 0.9, tip: 0.5, cell: fcell(6) })),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          switch (k) {
            case 0: vane(s, t, C, K.wingDk, K.backDk, hex(0x3A332D)); cmix(C, hex(0x8B8379), sstep(0.3, 0.0, t) * 0.5); break;
            case 1: vane(s, t, C, K.wing, K.wingDk); cmix(C, mixc(K.blue, K.purple, s), sstep(0.32, 0.4, t)); cmix(C, K.black, sstep(0.8, 0.84, t)); cmix(C, K.white, sstep(0.9, 0.93, t)); break;
            case 2: vane(s, t, C, K.wing, K.wingDk); cmix(C, K.black, sstep(0.66, 0.7, t)); cmix(C, K.white, sstep(0.78, 0.82, t)); break;
            case 3: vane(s, t, C, K.wing, K.wingDk); cmul(C, 0.95 + 0.1 * t); break;
            case 4: vane(s, t, C, hex(0x968A7C), K.backDk, hex(0x5A5148)); cmix(C, hex(0x4E3B2C), sstep(0.32, 0.1, Math.abs(s - 0.5)) * 0.65); break;
            case 5: vane(s, t, C, hex(0x8F8C87), K.tailW); cmix(C, K.tailW, sstep(0.6, 0.9, Math.abs(s - 0.5) * 2) + sstep(0.85, 1, t)); break;
            case 6: cset(C, K.black); break;
            default: vane(s, t, C, K.back, K.backDk);
          }
        },
        babyPaint: downFeather(hex(0x5A4630), hex(0xD9C060)),
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap1: 2, capLen1: 0.5, col: 0xD6C12E, babyCol: 0x3E3833, keys: [
          [0, 0.377, 0.2, 0.013, 0.01, 0.009, 2.5],
          [0, 0.37, 0.222, 0.0135, 0.0075, 0.0058, 3],
          [0, 0.362, 0.245, 0.0145, 0.0055, 0.0045, 3],
          [0, 0.357, 0.258, 0.013, 0.0045, 0.0038, 3],
        ] },
        { kind: 'sphere', bone: 'head', c: [0, 0.359, 0.262], r: 0.0055, s: [1.1, 0.5, 0.8], col: 0x2A2420 },
        // nostrils
        { kind: 'sphere', bone: 'head', c: [0.0055, 0.3735, 0.217], r: 0.0016, s: [0.7, 0.6, 1.6], ws: 6, hs: 4, mirror: true, col: 0x3A3420, babyCol: 0x2A2420 },
        ...babyC(birdToes(foot, toes, 0xF08A2B, 'hpawL'), 0x6A5A44),
        ...babyC([birdWeb(foot, toes, 0xE87F25, 'hpawL')], 0x5E5040),
      ],
      accentRough: 0.45,
      modelSpec: { anim: { wing: WA.wing }, baby: { muzzle: 0.44, fluff: 0, wing: 0.2, eye: 1.0, neck: [0.5, 1.35] } },
      eyes: [{ bone: 'head', p: [0.02, 0.392, 0.183], r: 0.0045, dir: [0.92, 0.2, 0.2], col: 0x1A0F08 }],
      mouth: [0, 0.358, 0.258],
      anim: {
        type: 'bird', walk: 0.8, run: 2.2, stride: 0.26, strideMax: 1.6, duty: [0.6, 0.45], lift: 0.022, flex: 1.1,
        bob: 0.005, waddle: 0.09, yawSway: 0.06,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.3, eatMax: 2.4, peck: 0.12, peckRate: 3, eatElev: [-45, -80, -85], eatY: 0.015,
        flyElev: [8, 4, -8], flyPitch: 0.05, floatDepth: 0, swimDrop: 0.18, swimEatPitch: 0.15,
        tail: 'tail', tailWag: 0.25, wing: W.wing, canFly: true, flyLegs: [-0.25, -0.9, 2.8], flyFlex: 1.6, jumpFlap: 0.6,
        paddleY: 0.4, paddleZ: 0.35,
        sleepNeck: [[0.95, 2.9], [0.1, 0.25], [0.3, 0.2]],
      },
      baby: { head: 1.6, muzzle: 0.58, eye: 1.12, neck: [0.6, 1.25], body: [1.1, 1.15, 0.85], leg: [0.8, 1.3], tail: 0.35, wing: 0.42, fluff: 0.006 },
      // duckling: yellow down with a dark brown cap, eye line and back with yellow spots
      babyPaint(P, C) {
        const yel = hex(0xEFD45E), brn = hex(0x4E3C24);
        if (P.part === 'leg') { cset(C, hex(0x5E5040)); return; }
        downPaint(C, P, yel, 0.12);
        if (P.part === 'body' || P.part === 'wcov') {
          const back = sstep(0.25, 0.55, P.ny) * (P.part === 'body' ? sstep(0.17, 0.12, P.z) : 1);
          const spot = sstep(0.022, 0.012, Math.hypot(Math.abs(P.x) - 0.05, P.z + 0.06)) + sstep(0.02, 0.01, Math.hypot(Math.abs(P.x) - 0.045, P.z - 0.04));
          cmix(C, brn, back * (1 - Math.min(1, spot)));
        }
        if (P.part === 'head') {
          cmix(C, brn, sstep(0.45, 0.75, P.ny));
          cmix(C, brn, sstep(0.006, 0.002, Math.abs(P.y - 0.388 + (P.z - 0.18) * 0.25)) * sstep(0.3, 0.6, Math.abs(P.nx)));
        }
        C.ro = 0.95; C.me = 0;
      },
    };
  };

  // ===== SWAN (mute swan) =====
  SPEC.swan = () => {
    const xL = 0.085;
    const K = { white: hex(0xE6E5DF), shade: hex(0xC4C7C4), cream: hex(0xE2DACB), black: hex(0x1A1A1A) };
    const W = stdWing({
      s: 2.35, sh: [0.1, 0.5, 0.16], prim: 1.05, wid: 1.05, tip: 0.45,
      folded: { roll: -14, yaw: 2, pitch: 2 }, foldedPos: [0.0, 0.012, -0.05],
      featherFold: { tert: [118, 106], sec: [108, 91], prim: [97, 88] },
      flap: { amp: 55, rate: 2.6, upFold: 0.3, twist: 10, glide: 3 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 2, tert: 1, pcov: 2 },
    });
    // the sculpted swan's wing (feather atlas blades, same bones), folded close over the back
    const WA = stdWing({
      s: 2.35, sh: [0.1, 0.5, 0.16], prim: 1.05, wid: 1.05, tip: 0.45, atlas: true,
      folded: { roll: -26, yaw: 2, pitch: 0 }, foldedPos: [-0.01, 0.01, -0.05],
      featherFold: { tert: [118, 106], sec: [108, 91], prim: [97, 88] },
      flap: { amp: 55, rate: 2.6, upFold: 0.3, twist: 10, glide: 3 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 3, tert: 4, pcov: 3 },
    });
    const toes = [{ a: -28, len: 0.11, r: 0.007 }, { a: 0, len: 0.13, r: 0.0075 }, { a: 28, len: 0.105, r: 0.007 }, { a: 180, len: 0.025, r: 0.005, back: true, lift: 0.01 }];
    const foot = [xL, 0.01, -0.06];
    const bill = (x, y, z) => {
      if (z < 0.425) return hex(0x151414);
      const tip = sstep(0.555, 0.57, z);
      return mixc(mixc(hex(0xE0662A), hex(0xC9542A), sstep(0.47, 0.55, z)), hex(0x1E1A18), tip);
    };
    return {
      size: { length: 1.3, height: 1.12, radius: 0.24, eyeHeight: 1.0 },
      tex: [256, 256], rough: 0.85,
      detail: { kind: 'feather', tile: 0.05, amt: 0.1, bump: 0.3 },
      shell: { parts: ['body', 'head'], len: 0.01, n: 3, babyOnly: true, babyLen: 1, lean: 0.2 },
      bones: [
        ['hips', null, 0, 0.36, 0.0],
        ['tail', 'hips', 0, 0.41, -0.4],
        ['neck', 'hips', 0, 0.45, 0.3],
        ['neck2', 'neck', 0, 0.6, 0.42],
        ['neck3', 'neck2', 0, 0.8, 0.375],
        ['head', 'neck3', 0, 0.97, 0.39],
        ['thighL', 'hips', xL - 0.01, 0.28, -0.08, 1],
        ['shinL', 'thighL', xL, 0.19, -0.03, 1],
        ['hmetaL', 'shinL', xL, 0.1, -0.08, 1],
        ['hpawL', 'hmetaL', xL, 0.01, -0.06, 1],
        ...W.bones,
      ],
      fur: [
        { name: 'body', bones: ['tail', 'hips', 'neck', 'neck2', 'neck3', 'head'], blend: 0.05, segs: 16, cap0: 3, capLen0: 0.9, keys: [
          [0, 0.44, -0.52, 0.03, 0.02, 0.02],
          [0, 0.43, -0.46, 0.09, 0.05, 0.06],
          [0, 0.4, -0.36, 0.15, 0.1, 0.12],
          [0, 0.375, -0.2, 0.185, 0.14, 0.16],
          [0, 0.365, -0.02, 0.195, 0.155, 0.17],
          [0, 0.375, 0.14, 0.175, 0.15, 0.17],
          [0, 0.405, 0.25, 0.135, 0.135, 0.145],
          [0, 0.46, 0.33, 0.088, 0.088, 0.096],
          [0, 0.535, 0.395, 0.064, 0.064, 0.068],
          [0, 0.625, 0.43, 0.052, 0.052, 0.054],
          [0, 0.725, 0.418, 0.045, 0.045, 0.046],
          [0, 0.82, 0.38, 0.04, 0.04, 0.04],
          [0, 0.905, 0.357, 0.037, 0.037, 0.037],
          [0, 0.98, 0.375, 0.035, 0.035, 0.035],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.6, dtile: 0.35, keys: [
          [0, 1.0, 0.352, 0.031, 0.031, 0.031],
          [0, 1.018, 0.385, 0.037, 0.04, 0.035],
          [0, 1.016, 0.42, 0.034, 0.036, 0.031],
          [0, 0.998, 0.452, 0.025, 0.025, 0.023],
        ] },
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.01, segs: 8, cap0: 2, cap1: 2, dkind: 'scale', dtile: 0.35, keys: [
          [xL, 0.21, -0.03, 0.035, 0.04, 0.04],
          [xL, 0.15, -0.055, 0.02, 0.022, 0.022],
          [xL, 0.1, -0.08, 0.012, 0.013, 0.013],
          [xL, 0.05, -0.07, 0.01, 0.011, 0.011],
          [xL, 0.015, -0.062, 0.011, 0.012, 0.012],
        ] },
        { name: 'wcov', mirror: true, bones: ['wingL', 'wforeL', 'whandL'], blend: 0.03, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.09, 0.5, 0.16, 0.03, 0.016, 0.016],
          [0.3, 0.5, 0.155, 0.033, 0.014, 0.014],
          [0.53, 0.5, 0.15, 0.026, 0.011, 0.011],
          [0.7, 0.5, 0.145, 0.015, 0.007, 0.007],
        ] },
      ],
      paint(P, C) {
        const fine = noise(P.x * 300, P.y * 300, P.z * 300);
        switch (P.part) {
          case 'body': case 'wcov': cset(C, K.white); cmix(C, K.shade, sstep(-0.3, -0.9, P.ny) * 0.4); cmix(C, K.cream, sstep(0.85, 0.98, P.y) * 0.25); break;
          case 'head': {
            cset(C, K.white); cmix(C, K.cream, 0.3);
            // black lores between eye and bill
            // black lores: from the bill base back to the eye
            const ex = Math.abs(P.x) - 0.026, ey = P.y - 1.023, ez = P.z - 0.41;
            const lo = sstep(0.405, 0.43, P.z) * sstep(0.018, 0.008, Math.abs(ey + (P.z - 0.41) * 0.35)) + sstep(0.012, 0.007, Math.sqrt(ex * ex * 2 + ey * ey + ez * ez));
            cmix(C, K.black, lo);
            break;
          }
          case 'leg': cset(C, K.black); C.ro = 0.6; break;
        }
        if (P.part !== 'leg') { cmul(C, 0.95 + 0.08 * fine); C.ro = 0.86; }
      },
      feathers: (rest, md) => ({
        tex: [256, 128], rough: 0.85,
        list: md ? [
          ...WA.feathers,
          ...tailFan('tail', [0, 0.432, -0.43], 9, 0.145, 0.06, 32, 14, 5, { dx: 0.07, dz: 0.012, taper: 0.3, curl: 0.05 }),
          ...tailFan('tail', [0, 0.448, -0.405], 5, 0.095, 0.07, 26, 17, 6, { dx: 0.05, dz: 0.01, taper: 0.2, curl: 0.04 }),
        ] : [
          ...W.feathers,
          ...tailFan('tail', [0, 0.43, -0.44], 7, 0.15, 0.05, 30, 12, 3, { dx: 0.06, dz: 0.01, taper: 0.3, curl: 0.05 }),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          vane(s, t, C, K.white, K.shade, hex(0xE4E4E0));
          if (k === 0) cmix(C, hex(0xCFCFCB), sstep(0.5, 1, t) * 0.25);
        },
        babyPaint: downFeather(hex(0xA29B92), hex(0xBDB7AE)),
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap1: 2, capLen1: 0.5, colFn: bill, babyCol: 0x3A3634, keys: [
          [0, 1.01, 0.415, 0.022, 0.026, 0.018, 2.4],
          [0, 0.995, 0.45, 0.02, 0.019, 0.013, 2.6],
          [0, 0.975, 0.5, 0.019, 0.014, 0.01, 2.8],
          [0, 0.957, 0.545, 0.017, 0.01, 0.008, 2.8],
          [0, 0.95, 0.565, 0.013, 0.007, 0.006, 2.5],
        ] },
        { kind: 'sphere', bone: 'head', c: [0, 1.027, 0.434], r: 0.021, s: [0.6, 0.85, 1.3], col: 0x161515, babyCol: 0x3A3634 },
        { kind: 'sphere', bone: 'head', c: [0.008, 0.997, 0.47], r: 0.0028, s: [0.6, 0.6, 1.8], ws: 6, hs: 4, mirror: true, col: 0x2A1A14, babyCol: 0x2A2624 },
        ...babyC(birdToes(foot, toes, 0x232323, 'hpawL'), 0x3A3634),
        ...babyC([birdWeb(foot, toes, 0x1D1D1D, 'hpawL')], 0x34302E),
      ],
      accentRough: 0.45,
      modelSpec: { anim: { wing: WA.wing }, baby: { muzzle: 0.45, fluff: 0, wing: 0.2, eye: 1.0, neck: [0.52, 1.45] } },
      eyes: [{ bone: 'head', p: [0.026, 1.023, 0.41], r: 0.0065, dir: [0.9, 0.2, 0.25], col: 0x120A06 }],
      mouth: [0, 0.95, 0.565],
      anim: {
        type: 'bird', walk: 0.9, run: 2.0, stride: 0.42, strideMax: 1.5, duty: [0.62, 0.48], lift: 0.04, flex: 1.0,
        bob: 0.008, waddle: 0.08, yawSway: 0.05,
        neck: ['neck', 'neck2', 'neck3', 'head'], neckDist: [0.38, 0.32, 0.2, 0.1], eatPitch: 0.2, eatMax: 2.6, peck: 0.05, peckRate: 1.5,
        eatElev: [-20, -60, -80, -75], drinkElev: [10, -30, -70, -70],
        flyElev: [12, 6, 2, -12], flyPitch: 0.06, floatDepth: 0, swimDrop: 0.33, swimEatPitch: 0.1,
        tail: 'tail', tailWag: 0.15, wing: W.wing, canFly: true, flyLegs: [-0.2, -1.2, 2.8], flyFlex: 1.6, jumpFlap: 0.5,
        paddleY: 0.25, paddleZ: 0.3, lookAmp: 0.6, lookDist: [0.3, 0.3, 0.2, 0.2],
        sleepNeck: [[0.2, 1.1], [1.6, 0.5], [0.5, 0.3], [0.3, 0.1]],
      },
      baby: { head: 1.55, muzzle: 0.6, eye: 1.1, neck: [0.55, 1.3], body: [1.12, 1.15, 0.85], leg: [0.8, 1.3], tail: 0.35, wing: 0.4, fluff: 0.012 },
      // cygnet: soft gray-brown down
      babyPaint(P, C) {
        if (P.part === 'leg') { cset(C, hex(0x3A3634)); return; }
        downPaint(C, P, hex(0xA8A198), 0.1);
        cmix(C, hex(0xC9C4BC), sstep(-0.3, -0.8, P.ny) * 0.6);
        C.ro = 0.95;
      },
    };
  };

  // ===== CHICKEN (Rhode Island Red hen) =====
  SPEC.chicken = () => {
    const xL = 0.042;
    const K = {
      rust: hex(0x8E3A17), rustHi: hex(0xA9522A), dark: hex(0x5E2410), gold: hex(0xB4602A), black: hex(0x1A1714), tailG: hex(0x1F2A1E),
      red: hex(0xC4241C), redDk: hex(0x96160F), leg: hex(0xE7B83A), beak: hex(0xE2B95A),
    };
    const W = stdWing({
      s: 0.92, sh: [0.06, 0.29, 0.05], prim: 0.85, wid: 1.15, tip: 0.5,
      folded: { roll: -38, yaw: 3, pitch: 8 }, foldedPos: [0.012, 0.0, -0.02],
      featherFold: { tert: [110, 102], sec: [104, 90], prim: [96, 88] },
      flap: { amp: 50, rate: 7, upFold: 0.3, twist: 10, glide: 3 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 2, tert: 2, pcov: 2 },
    });
    // the sculpted hen's wing (feather atlas blades, same bones)
    const WA = stdWing({
      s: 0.92, sh: [0.06, 0.29, 0.05], prim: 0.85, wid: 1.15, tip: 0.5, atlas: true,
      folded: { roll: -78, yaw: 0, pitch: 10 }, foldedPos: [0.022, 0.0, -0.02],
      featherFold: { tert: [110, 102], sec: [104, 90], prim: [96, 88] },
      flap: { amp: 50, rate: 7, upFold: 0.3, twist: 10, glide: 3 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 3, tert: 2, pcov: 3 },
    });
    const toes = [{ a: -30, len: 0.045, r: 0.0045, claw: 0.008, clawCol: 0x8A6A3A }, { a: 0, len: 0.055, r: 0.005, claw: 0.009, clawCol: 0x8A6A3A }, { a: 30, len: 0.043, r: 0.0045, claw: 0.008, clawCol: 0x8A6A3A }, { a: 180, len: 0.025, r: 0.004, lift: 0.004, claw: 0.007, clawCol: 0x8A6A3A }];
    const foot = [xL, 0.007, 0.004];
    const comb = [[0.105, 0.43], [0.112, 0.452], [0.12, 0.442], [0.127, 0.466], [0.135, 0.448], [0.142, 0.472], [0.15, 0.452], [0.157, 0.466], [0.163, 0.446], [0.17, 0.452], [0.172, 0.432]].map((p) => [0, p[1], p[0]]);
    return {
      size: { length: 0.45, height: 0.48, radius: 0.1, eyeHeight: 0.4 },
      tex: [256, 256], rough: 0.88,
      detail: { kind: 'feather', tile: 0.032, amt: 0.12, bump: 0.28 },
      shell: { parts: ['body', 'head', 'drum'], len: 0.005, n: 3, babyOnly: true, babyLen: 1, lean: 0.2 },
      bones: [
        ['hips', null, 0, 0.24, 0.0],
        ['tail', 'hips', 0, 0.29, -0.12],
        ['neck', 'hips', 0, 0.29, 0.085],
        ['neck2', 'neck', 0, 0.35, 0.11],
        ['head', 'neck2', 0, 0.4, 0.125],
        ['comb', 'head', 0, 0.42, 0.15],
        ['thighL', 'hips', xL - 0.005, 0.215, -0.01, 1],
        ['shinL', 'thighL', xL, 0.165, 0.03, 1],
        ['hmetaL', 'shinL', xL, 0.1, -0.008, 1],
        ['hpawL', 'hmetaL', xL, 0.007, 0.004, 1],
        ...W.bones,
      ],
      fur: [
        { name: 'body', bones: ['tail', 'hips', 'neck', 'neck2', 'head'], blend: 0.025, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.305, -0.16, 0.025, 0.02, 0.02],
          [0, 0.29, -0.13, 0.058, 0.05, 0.058],
          [0, 0.262, -0.07, 0.085, 0.075, 0.088],
          [0, 0.248, -0.005, 0.09, 0.08, 0.098],
          [0, 0.255, 0.05, 0.083, 0.078, 0.094],
          [0, 0.28, 0.088, 0.063, 0.064, 0.075],
          [0, 0.32, 0.108, 0.046, 0.048, 0.05],
          [0, 0.36, 0.118, 0.035, 0.036, 0.036],
          [0, 0.395, 0.124, 0.028, 0.028, 0.028],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.5, dtile: 0.3, keys: [
          [0, 0.405, 0.1, 0.022, 0.022, 0.022],
          [0, 0.412, 0.125, 0.029, 0.03, 0.027],
          [0, 0.408, 0.148, 0.025, 0.025, 0.022],
          [0, 0.401, 0.165, 0.016, 0.016, 0.015],
        ] },
        { name: 'drum', mirror: true, bones: ['thighL', 'shinL'], blend: 0.01, segs: 10, cap1: 2, keys: [
          [xL - 0.004, 0.2, 0.01, 0.028, 0.03, 0.03],
          [xL, 0.16, 0.025, 0.026, 0.028, 0.028],
          [xL, 0.125, 0.012, 0.018, 0.018, 0.018],
        ] },
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap1: 2, dkind: 'scale', dtile: 0.35, keys: [
          [xL, 0.13, 0.01, 0.009, 0.01, 0.01],
          [xL, 0.1, -0.008, 0.0068, 0.0072, 0.0072],
          [xL, 0.05, -0.003, 0.0062, 0.0066, 0.0066],
          [xL, 0.012, 0.003, 0.0065, 0.007, 0.007],
        ] },
        { name: 'wcov', mirror: true, bones: ['wingL', 'wforeL', 'whandL'], blend: 0.012, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.055, 0.29, 0.05, 0.014, 0.008, 0.008],
          [0.13, 0.29, 0.048, 0.015, 0.007, 0.007],
          [0.22, 0.29, 0.046, 0.011, 0.005, 0.005],
          [0.29, 0.29, 0.044, 0.006, 0.003, 0.003],
        ] },
      ],
      paint(P, C) {
        const fine = noise(P.x * 450, P.y * 450, P.z * 450);
        switch (P.part) {
          case 'body': case 'drum': case 'wcov': {
            cset(C, K.rust);
            cmix(C, K.dark, sstep(0.4, 0.9, P.ny) * 0.55);
            cmix(C, K.rustHi, sstep(-0.1, -0.7, P.ny) * 0.35);
            // golden hackles on the neck with dark feather shafts
            const hk = sstep(0.3, 0.34, P.y);
            cmix(C, K.gold, hk * 0.7);
            cmix(C, K.dark, hk * sstep(0.55, 0.8, noise(P.cx * 120, P.cy * 120, P.y * 40)) * 0.5);
            // scalloped feather edges
            const sc = cells(P.x * 70, P.y * 70, P.z * 70);
            cmix(C, K.dark, sstep(0.55, 0.8, sc) * 0.35);
            cmix(C, K.black, sstep(-0.13, -0.16, P.z) * sstep(0.27, 0.3, P.y) * 0.6);
            break;
          }
          case 'head': {
            cset(C, K.rustHi);
            // bare red face around the eye and the earlobe
            const ex = Math.abs(P.x) - 0.024, ey = P.y - 0.413, ez = P.z - 0.137;
            cmix(C, K.red, sstep(0.017, 0.011, Math.sqrt(ex * ex * 1.5 + ey * ey + ez * ez)));
            const lx = ey + 0.012, lz = P.z - 0.122;
            cmix(C, K.red, sstep(0.009, 0.006, Math.sqrt(lx * lx + lz * lz)) * sstep(0.3, 0.7, Math.abs(P.nx)));
            cmix(C, K.red, sstep(0.152, 0.16, P.z) * 0.8);
            break;
          }
          case 'leg': cset(C, K.leg); C.ro = 0.55; break;
        }
        if (P.part !== 'leg') { cmul(C, 0.9 + 0.18 * fine); C.ro = 0.88; }
      },
      feathers: (rest, md) => ({
        tex: [256, 128], rough: 0.85,
        list: md ? [
          ...WA.feathers,
          // tail: a steep tent of black feathers, black-and-red coverts over it, pointed red saddle feathers at its base
          ...[0, 1, 2, 3, 4, 5].map((i) => ({ bone: 'tail', mirror: true, base: [0.006 + i * 0.0042, 0.305 - i * 0.006, -0.118 - i * 0.003], yaw: (84 + i * 4) * DEG, pitch: (56 - i * 6) * DEG, roll: (-38 - i * 6) * DEG, len: 0.145 - i * 0.008, wid: 0.044, curl: -0.12, cell: fcell(4) })),
          ...[0, 1, 2, 3].map((i) => ({ bone: 'tail', mirror: true, base: [0.01 + i * 0.006, 0.31 - i * 0.006, -0.1 - i * 0.008], yaw: (88 + i * 3) * DEG, pitch: (42 - i * 7) * DEG, roll: (-48 - i * 4) * DEG, len: 0.09, wid: 0.042, curl: -0.08, cell: fcell(5) })),
          ...[0, 1, 2, 3].map((i) => ({ bone: 'tail', mirror: true, base: [0.016 + i * 0.008, 0.318 - i * 0.008, -0.074 - i * 0.01], yaw: (92 + i * 4) * DEG, pitch: (16 - i * 4) * DEG, roll: (-34 - i * 5) * DEG, len: 0.072, wid: 0.032, curl: 0.06, cell: fcell(6) })),
        ] : [
          ...W.feathers,
          // tail: steep tent of dark feathers
          ...[0, 1, 2, 3].map((i) => ({ bone: 'tail', mirror: true, base: [0.012 + i * 0.004, 0.3 - i * 0.008, -0.12 - i * 0.004], yaw: (90 - 8 + i * 3) * DEG, pitch: (52 - i * 9) * DEG, roll: (-48 - i * 6) * DEG, len: 0.15 - i * 0.012, wid: 0.045, curl: -0.18, tip: 0.45, cell: fcell(i < 2 ? 4 : 5) })),
          ...[0, 1].map((i) => ({ bone: 'tail', mirror: true, base: [0.02, 0.29, -0.09 - i * 0.015], yaw: (88) * DEG, pitch: (35 - i * 8) * DEG, roll: -55 * DEG, len: 0.11, wid: 0.05, curl: -0.1, tip: 0.5, cell: fcell(6) })),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          switch (k) {
            case 0: vane(s, t, C, K.rust, K.dark, K.dark); cmix(C, K.black, sstep(0.5, 0.95, t) * sstep(0.2, 0.6, Math.abs(s - 0.5) * 2 + (s < 0.5 ? 0.4 : 0))); break;
            case 1: vane(s, t, C, K.rust, K.dark, K.dark); cmix(C, K.black, sstep(0.6, 0.95, t) * 0.6); break;
            case 2: vane(s, t, C, K.rust, K.dark, K.dark); cmix(C, K.rustHi, sstep(0.6, 0.95, t) * 0.25); break;
            case 4: vane(s, t, C, K.black, K.tailG, hex(0x2A2A22)); cmix(C, K.dark, sstep(0.35, 0.0, t) * 0.8); break;
            case 5: vane(s, t, C, K.tailG, K.black); cmix(C, K.rust, sstep(0.3, 0.0, t) * 0.6); break;
            case 6: vane(s, t, C, K.rust, K.dark, K.dark); cmix(C, K.black, sstep(0.75, 1, t) * 0.7); break;
            default: vane(s, t, C, K.rust, K.dark);
          }
        },
        babyPaint: downFeather(hex(0xEFD26A), hex(0xF8E7A0)),
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 8, cap1: 2, capLen1: 0.4, col: 0xE0B35A, babyCol: 0xE8B87A, keys: [
          [0, 0.403, 0.158, 0.009, 0.009, 0.007],
          [0, 0.401, 0.172, 0.0065, 0.007, 0.004],
          [0, 0.396, 0.184, 0.0035, 0.0042, 0.0025],
          [0, 0.39, 0.19, 0.0012, 0.0014, 0.001],
        ] },
        { kind: 'fan', bone: 'comb', c: [0, 0.445, 0.14], outline: comb, thick: 0.007, n: [1, 0, 0], col: 0xC8261C },
        { kind: 'sphere', bone: 'comb', c: [0.006, 0.381, 0.158], r: 0.011, s: [0.55, 1.35, 0.8], mirror: true, col: 0xBE2018 },
        ...babyC(birdToes(foot, toes, 0xE4B23A, 'hpawL'), 0xE8B87A),
      ],
      accentRough: 0.55,
      modelSpec: { anim: { wing: WA.wing }, baby: { muzzle: 0.42, fluff: 0, wing: 0.12, eye: 1.0 } },
      eyes: [{ bone: 'head', p: [0.024, 0.415, 0.138], r: 0.0058, dir: [0.92, 0.15, 0.3], iris: 0xD48A26, irisR: 0.8, pupilR: 0.45, babyIris: 0x1E140E }],
      mouth: [0, 0.392, 0.188],
      anim: {
        type: 'bird', walk: 0.9, run: 2.6, stride: 0.22, strideMax: 1.8, duty: [0.6, 0.42], lift: 0.03, flex: 1.3,
        bob: 0.006, waddle: 0.04, yawSway: 0.04, headBob: 1.0,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.45, eatMax: 2.4, peck: 0.25, peckRate: 2.5, eatElev: [-40, -75, -85], eatY: 0.025,
        tail: 'tail', tailWag: 0.2, wing: W.wing, canFly: false, jumpFlap: 0.75, runPitch: 0.15,
        lookPeriod: 1.6, lookRate: 9, lookAmp: 0.9,
        sleepNeck: [[0.95, 2.8], [0.1, 0.3], [0.35, 0.2]],
      },
      baby: { head: 1.6, muzzle: 0.6, eye: 1.12, neck: [0.6, 1.25], body: [1.12, 1.15, 0.92], leg: [0.8, 1.25], tail: 0.2, wing: 0.4, fluff: 0.008, roles: { comb: 'horn' } },
      // chick: pale yellow down all over
      babyPaint(P, C) {
        if (P.part === 'leg') { cset(C, hex(0xE8B87A)); C.ro = 0.6; return; }
        downPaint(C, P, hex(0xF3DA74), 0.1);
        cmix(C, hex(0xFAEBA8), sstep(-0.3, -0.8, P.ny) * 0.4);
        C.ro = 0.95;
      },
    };
  };

  // ===== OWL (great horned owl), built upright =====
  SPEC.owl = () => {
    const xL = 0.05;
    const K = {
      base: hex(0x7E6249), dark: hex(0x33261C), light: hex(0xC2AD8E), buff: hex(0xB89C78), white: hex(0xEDE6D8),
      disc: hex(0xA8784C), rim: hex(0x22190F), tuft: hex(0x3A2B1F), gray: hex(0x8C8378), toe: hex(0xCDB894),
    };
    const W = stdWing({
      s: 1.25, sh: [0.07, 0.35, -0.035], prim: 0.95, wid: 1.45, tip: 0.6, secTip: 0.5, primTipWid: 1.2,
      folded: { roll: -6, yaw: 7, pitch: -76 }, foldedPos: [-0.014, 0.0, -0.028],
      featherFold: { tert: [108, 100], sec: [102, 92], prim: [96, 90] },
      flap: { amp: 68, rate: 2.2, upFold: 0.25, twist: 8, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 2, tert: 2, pcov: 2 },
    });
    // the sculpted owl's wing (feather atlas blades, same bones), hanging close along the back
    const WA = stdWing({
      s: 1.25, sh: [0.07, 0.35, -0.035], prim: 0.95, wid: 1.45, tip: 0.6, secTip: 0.5, primTipWid: 1.2, atlas: true,
      folded: { roll: -6, yaw: -24, pitch: -76 }, foldedPos: [0.012, 0.0, -0.02],
      featherFold: { tert: [108, 100], sec: [102, 92], prim: [96, 90] },
      flap: { amp: 68, rate: 2.2, upFold: 0.25, twist: 8, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 3, tert: 4, pcov: 3 },
    });
    const toes = [{ a: -22, len: 0.03, r: 0.0085, claw: 0.022 }, { a: 18, len: 0.032, r: 0.0085, claw: 0.022 }, { a: 165, len: 0.022, r: 0.008, lift: 0.004, claw: 0.02 }, { a: -150, len: 0.02, r: 0.008, lift: 0.004, claw: 0.018 }];
    const foot = [xL, 0.009, 0.02];
    const mottle = (P, C) => {
      const m = cells(P.x * 38, P.y * 38, P.z * 38), n = fbm(P.x * 90, P.y * 90, P.z * 90, 3);
      cmix(C, K.dark, sstep(0.5, 0.25, m) * 0.6 * sstep(0.35, 0.6, n));
      cmix(C, K.light, sstep(0.55, 0.85, n) * 0.4);
    };
    return {
      size: { length: 0.45, height: 0.56, radius: 0.13, eyeHeight: 0.46 },
      tex: [256, 256], rough: 0.9,
      detail: { kind: 'feather', tile: 0.04, amt: 0.05, bump: 0.15 },
      shell: { parts: ['body', 'head'], len: 0.01, n: 3, babyOnly: true, babyLen: 1, lean: 0.2 },
      bones: [
        ['hips', null, 0, 0.18, 0.0],
        ['tail', 'hips', 0, 0.13, -0.075],
        ['neck', 'hips', 0, 0.37, 0.0],
        ['head', 'neck', 0, 0.42, 0.005],
        ['earL', 'head', 0.04, 0.505, 0.008, 1],
        ['thighL', 'hips', xL - 0.01, 0.14, 0.005, 1],
        ['shinL', 'thighL', xL, 0.095, 0.035, 1],
        ['hmetaL', 'shinL', xL, 0.065, 0.005, 1],
        ['hpawL', 'hmetaL', xL, 0.009, 0.02, 1],
        ...W.bones,
      ],
      fur: [
        { name: 'body', bones: ['tail', 'hips', 'neck'], blend: 0.04, segs: 14, cap0: 3, capLen0: 0.7, keys: [
          [0, 0.07, -0.035, 0.035, 0.03, 0.03],
          [0, 0.1, -0.025, 0.08, 0.065, 0.08],
          [0, 0.16, -0.012, 0.102, 0.08, 0.1],
          [0, 0.24, -0.004, 0.108, 0.082, 0.102],
          [0, 0.31, 0.0, 0.1, 0.078, 0.09],
          [0, 0.37, 0.002, 0.082, 0.07, 0.072],
          [0, 0.41, 0.002, 0.07, 0.064, 0.064],
        ] },
        { name: 'head', bones: ['head'], segs: 16, cap0: 3, cap1: 3, capLen1: 0.6, keys: [
          [0, 0.395, 0.0, 0.06, 0.055, 0.055, 2.2],
          [0, 0.425, 0.003, 0.08, 0.07, 0.066, 2.4],
          [0, 0.46, 0.005, 0.083, 0.07, 0.062, 2.5],
          [0, 0.495, 0.004, 0.07, 0.06, 0.05, 2.4],
          [0, 0.515, 0.0, 0.045, 0.04, 0.035, 2.2],
        ] },
        { name: 'tuft', mirror: true, bones: ['earL'], segs: 6, sub: 2, keys: [
          [0.035, 0.5, 0.01, 0.014, 0.008, 0.006],
          [0.045, 0.525, 0.006, 0.012, 0.006, 0.005],
          [0.056, 0.55, 0.0, 0.007, 0.004, 0.003],
          [0.062, 0.565, -0.004, 0.001, 0.001, 0.001],
        ] },
        { name: 'leg', mirror: true, bones: ['thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.01, segs: 8, cap1: 2, keys: [
          [xL - 0.01, 0.135, 0.005, 0.03, 0.03, 0.03],
          [xL, 0.1, 0.03, 0.026, 0.026, 0.026],
          [xL, 0.065, 0.008, 0.018, 0.018, 0.018],
          [xL, 0.035, 0.012, 0.015, 0.015, 0.015],
          [xL, 0.012, 0.02, 0.014, 0.012, 0.014],
        ] },
        { name: 'wcov', mirror: true, bones: ['wingL', 'wforeL', 'whandL'], blend: 0.015, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.065, 0.35, -0.035, 0.02, 0.012, 0.012],
          [0.17, 0.35, -0.037, 0.022, 0.011, 0.011],
          [0.3, 0.35, -0.04, 0.017, 0.008, 0.008],
          [0.38, 0.35, -0.042, 0.009, 0.005, 0.005],
        ] },
      ],
      paint(P, C) {
        switch (P.part) {
          case 'body': {
            cset(C, K.base);
            mottle(P, C);
            // buff breast with fine dark bars, a band of dark streaks under a small white bib
            const fr = sstep(-0.1, 0.5, P.nz);
            const bar = sstep(0.62, 0.9, Math.sin(P.y * 430 + noise(P.x * 70, P.y * 50, 1) * 3.5) * 0.5 + 0.5);
            const streak = sstep(0.6, 0.85, noise(P.x * 160, P.y * 30, 4.2)) * sstep(0.26, 0.31, P.y) * sstep(0.36, 0.33, P.y);
            cmix(C, K.buff, fr * 0.85);
            cmix(C, K.dark, fr * (bar * 0.5 + streak * 0.6));
            const bx = P.x / 0.042, by = (P.y - 0.378) / 0.02;
            cmix(C, K.white, fr * sstep(1.0, 0.6, bx * bx + by * by) * 0.75);
            break;
          }
          case 'head': {
            cset(C, K.base);
            mottle(P, C);
            // facial disc: rufous ovals around each eye, black rim, white brows and chin
            const fz = sstep(0.0, 0.55, P.nz);
            const dx = Math.abs(P.x) - 0.032, dy = P.y - 0.462, dd = Math.sqrt(dx * dx * 1.1 + dy * dy * 0.9);
            cmix(C, K.disc, fz * sstep(0.05, 0.04, dd));
            cmix(C, K.rim, fz * sstep(0.042, 0.048, dd) * sstep(0.058, 0.05, dd) * sstep(0.3, 0.6, Math.abs(P.nx) + 0.2));
            cmix(C, K.white, fz * sstep(0.008, 0.002, Math.abs(P.y - 0.49 + Math.abs(P.x) * 0.25)) * sstep(0.04, 0.015, Math.abs(P.x)) );
            cmix(C, K.white, fz * sstep(0.425, 0.415, P.y) * sstep(0.03, 0.01, Math.abs(P.x)));
            cmix(C, K.gray, sstep(0.3, 0.9, P.ny) * 0.25);
            break;
          }
          case 'tuft': cset(C, K.tuft); cmix(C, K.base, sstep(0.0, 0.6, P.nz) * 0.3); break;
          case 'leg': cset(C, K.toe); cmix(C, K.light, 0.3); break;
          case 'wcov': cset(C, K.base); mottle(P, C); break;
        }
        const fine = noise(P.x * 500, P.y * 500, P.z * 500);
        cmul(C, 0.92 + 0.14 * fine);
        C.ro = 0.9;
      },
      feathers: (rest, md) => ({
        tex: [256, 128], rough: 0.9,
        list: md ? [
          ...WA.feathers,
          ...tailFan('tail', [0, 0.14, -0.076], 9, 0.155, 0.052, 20, -58, 5, { dx: 0.04, dz: 0.005, taper: 0.12, curl: 0.04 }),
        ] : [
          ...W.feathers,
          ...tailFan('tail', [0, 0.14, -0.078], 7, 0.155, 0.05, 18, -58, 3, { dx: 0.035, dz: 0.005, taper: 0.12, curl: 0.04, tip: 0.5 }),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          const bar = sstep(0.4, 0.75, Math.sin(t * (k === 3 ? 34 : 40) + s * 1.2) * 0.5 + 0.5);
          switch (k) {
            case 0: vane(s, t, C, K.buff, K.base, K.dark); cmix(C, K.dark, bar * 0.75); cmix(C, K.base, sstep(0.0, 0.3, 1 - t) * 0.3); break;
            case 1: vane(s, t, C, K.base, K.buff, K.dark); cmix(C, K.dark, bar * 0.6); break;
            case 3: vane(s, t, C, K.buff, K.base, K.dark); cmix(C, K.dark, bar * 0.7); break;
            default: { vane(s, t, C, K.base, K.light, K.dark); const m = cells(s * 4, t * 6, k); cmix(C, K.dark, sstep(0.45, 0.2, m) * 0.6); cmix(C, K.light, sstep(0.75, 0.95, m) * 0.5); }
          }
        },
        babyPaint: downFeather(hex(0xE2DCD0), hex(0xF2EEE6), hex(0x8E867C)),
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 8, cap1: 2, capLen1: 0.5, col: 0x2E2B28, keys: [
          [0, 0.452, 0.06, 0.008, 0.007, 0.008],
          [0, 0.445, 0.07, 0.007, 0.006, 0.007],
          [0, 0.435, 0.075, 0.005, 0.004, 0.005],
          [0, 0.426, 0.073, 0.002, 0.002, 0.002],
        ] },
        ...birdToes(foot, toes, 0xCDB894, 'hpawL'),
      ],
      accentRough: 0.5,
      modelSpec: { anim: { wing: WA.wing }, baby: { fluff: 0, wing: 0.25, eye: 1.0 } },
      eyes: [{ bone: 'head', p: [0.032, 0.464, 0.054], r: 0.0145, dir: [0.28, 0.04, 1], iris: 0xF0A51C, irisR: 0.9, pupilR: 0.42, rim: 0x2A1A0A }],
      mouth: [0, 0.432, 0.074],
      anim: {
        type: 'bird', walk: 0.7, run: 1.8, stride: 0.2, strideMax: 1.6, duty: [0.62, 0.48], lift: 0.025, flex: 1.1,
        bob: 0.006, waddle: 0.11, yawSway: 0.07,
        neck: ['neck', 'head'], neckDist: [0.5, 0.5], eatPitch: 1.1, eatDrop: 0.07, eatMax: 2.2, peck: 0.12, peckRate: 1.5, eatElev: [-70, -90], eatY: 0.03,
        flyElev: [10, -6], flyPitch: 1.05, flyBob: 0.02,
        tail: 'tail', tailWag: 0.1, wing: W.wing, canFly: true, flyLegs: [-0.2, -0.9, 1.6], flyFlex: 1.0, jumpFlap: 0.6, flyTail: 0.1,
        lookPeriod: 4.2, lookRate: 4, lookAmp: 1.6, lookDist: [0.25, 0.75],
        sleepNeck: [[0.25, 0], [0.2, 0]], sitDrop: 0.25, sleepTail: 0.45,
      },
      baby: { head: 1.3, muzzle: 0.75, eye: 1.05, ear: 0.35, body: [1.15, 1.08, 1.05], leg: [0.8, 1.2], tail: 0.3, wing: 0.5, fluff: 0.012 },
      // owlet: white fluffy down with faint gray barring, pale facial disc
      babyPaint(P, C) {
        if (P.part === 'leg') { cset(C, hex(0xE8E2D6)); return; }
        const bar = sstep(0.55, 0.85, Math.sin(P.y * 220 + noise(P.x * 60, P.z * 60, 2) * 3) * 0.5 + 0.5);
        downPaint(C, P, hex(0xEAE4D8), 0.1);
        cmix(C, hex(0x9C948A), bar * 0.3);
        if (P.part === 'head') { const dx = Math.abs(P.x) - 0.032, dy = P.y - 0.462; cmix(C, hex(0xD8C8B0), sstep(0.0, 0.55, P.nz) * sstep(0.05, 0.035, Math.sqrt(dx * dx + dy * dy)) * 0.8); }
        C.ro = 0.95;
      },
    };
  };

  // ===== PARROT (scarlet macaw) =====
  SPEC.parrot = () => {
    const xL = 0.038;
    const K = {
      red: hex(0xB80E24), redDk: hex(0x8C0A1C), yellow: hex(0xF2C12E), green: hex(0x4C8F3A), blue: hex(0x1F5BBE), blueDk: hex(0x173D86),
      face: hex(0xF2ECE6), line: hex(0xB42232), foot: hex(0x4A4440),
    };
    const W = stdWing({
      s: 0.98, sh: [0.058, 0.245, 0.05], prim: 1.2, wid: 1.3, tip: 0.3,
      folded: { roll: -52, yaw: 3, pitch: -10 }, foldedPos: [0.014, 0.0, -0.016],
      featherFold: { tert: [112, 104], sec: [106, 92], prim: [97, 90] },
      flap: { amp: 58, rate: 6.5, upFold: 0.35, twist: 12, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 7, tert: 2, pcov: 1 },
    });
    // the sculpted macaw's wing (feather atlas blades, same bones): red lesser coverts along the leading edge
    const WA = stdWing({
      s: 0.98, sh: [0.058, 0.245, 0.05], prim: 1.2, wid: 1.3, tip: 0.3, atlas: true,
      folded: { roll: -58, yaw: 3, pitch: -10 }, foldedPos: [0.018, 0.0, -0.016],
      featherFold: { tert: [112, 104], sec: [106, 92], prim: [97, 90] },
      flap: { amp: 58, rate: 6.5, upFold: 0.35, twist: 12, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 7, tert: 2, pcov: 1, mcov: 3 },
    });
    const toes = [{ a: -18, len: 0.035, r: 0.0055, claw: 0.01 }, { a: 18, len: 0.037, r: 0.0055, claw: 0.01 }, { a: 160, len: 0.03, r: 0.0052, lift: 0.003, claw: 0.009 }, { a: -165, len: 0.028, r: 0.0052, lift: 0.003, claw: 0.009 }];
    const foot = [xL, 0.006, 0.012];
    const upperBeak = (x, y, z) => mixc(hex(0xEDE3D2), hex(0x2A2522), sstep(0.355, 0.335, y) * 0.9 + sstep(0.16, 0.14, z) * 0.0);
    return {
      size: { length: 0.85, height: 0.44, radius: 0.12, eyeHeight: 0.4 },
      tex: [256, 256], rough: 0.75,
      detail: { kind: 'feather', tile: 0.03, amt: 0.08, bump: 0.2 },
      shell: { parts: ['body', 'head'], len: 0.005, n: 3, babyOnly: true, babyLen: 1, lean: 0.2 },
      bones: [
        ['hips', null, 0, 0.17, 0.0],
        ['tail', 'hips', 0, 0.2, -0.12],
        ['neck', 'hips', 0, 0.26, 0.085],
        ['head', 'neck', 0, 0.355, 0.105],
        ['thighL', 'hips', xL - 0.005, 0.135, 0.0, 1],
        ['shinL', 'thighL', xL, 0.095, 0.03, 1],
        ['hmetaL', 'shinL', xL, 0.06, 0.0, 1],
        ['hpawL', 'hmetaL', xL, 0.006, 0.012, 1],
        ...W.bones,
      ],
      fur: [
        { name: 'body', bones: ['tail', 'hips', 'neck', 'head'], blend: 0.025, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.215, -0.165, 0.022, 0.016, 0.016],
          [0, 0.208, -0.125, 0.048, 0.04, 0.042],
          [0, 0.19, -0.06, 0.068, 0.062, 0.068],
          [0, 0.186, 0.005, 0.074, 0.068, 0.078],
          [0, 0.207, 0.06, 0.07, 0.066, 0.074],
          [0, 0.25, 0.09, 0.06, 0.058, 0.062],
          [0, 0.3, 0.1, 0.052, 0.052, 0.054],
          [0, 0.345, 0.105, 0.048, 0.048, 0.046],
          [0, 0.385, 0.1, 0.042, 0.042, 0.04],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.5, dtile: 0.35, keys: [
          [0, 0.375, 0.068, 0.036, 0.036, 0.036],
          [0, 0.393, 0.1, 0.05, 0.051, 0.044],
          [0, 0.393, 0.126, 0.047, 0.048, 0.041],
          [0, 0.386, 0.143, 0.034, 0.034, 0.03],
        ] },
        { name: 'leg', mirror: true, bones: ['thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.008, segs: 8, cap1: 2, keys: [
          [xL - 0.005, 0.13, 0.005, 0.02, 0.02, 0.02],
          [xL, 0.095, 0.028, 0.016, 0.016, 0.016],
          [xL, 0.06, 0.002, 0.009, 0.009, 0.009],
          [xL, 0.03, 0.006, 0.0075, 0.0075, 0.0075],
          [xL, 0.009, 0.012, 0.0085, 0.008, 0.0085],
        ] },
        { name: 'wcov', mirror: true, bones: ['wingL', 'wforeL', 'whandL'], blend: 0.012, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.048, 0.24, 0.05, 0.014, 0.008, 0.008],
          [0.13, 0.24, 0.048, 0.015, 0.007, 0.007],
          [0.22, 0.24, 0.046, 0.011, 0.005, 0.005],
          [0.28, 0.24, 0.044, 0.006, 0.003, 0.003],
        ] },
      ],
      paint(P, C) {
        switch (P.part) {
          case 'body': case 'wcov': cset(C, K.red); cmix(C, K.redDk, sstep(-0.2, -0.8, P.ny) * 0.3); cmix(C, K.blue, sstep(-0.13, -0.16, P.z) * 0.8); break;
          case 'head': {
            cset(C, K.red);
            // bare pale face patch from the beak back past the eye, with thin red feather lines
            const fx = Math.abs(P.x), face = sstep(0.095, 0.11, P.z) * sstep(0.008, 0.02, fx) * sstep(0.412, 0.4, P.y) * sstep(0.355, 0.366, P.y);
            cmix(C, K.face, face);
            cmix(C, K.line, face * sstep(0.75, 0.95, Math.sin(P.y * 900) * 0.5 + 0.5) * sstep(0.12, 0.13, P.z) * 0.8);
            break;
          }
          case 'leg': cset(C, K.foot); cmix(C, K.red, sstep(0.08, 0.11, P.y)); break;
        }
        const fine = noise(P.x * 500, P.y * 500, P.z * 500);
        cmul(C, 0.93 + 0.12 * fine);
        C.ro = 0.72;
      },
      feathers: (rest, md) => ({
        tex: [256, 128], rough: 0.65,
        list: md ? [
          ...WA.feathers,
          // long tail: red central feathers tipped blue, blue outer ones, light blue coverts over the base
          ...tailFan('tail', [0, 0.205, -0.124], 8, 0.47, 0.04, 11, -10, (i, u) => (Math.abs(u) < 0.45 ? 4 : 5), { dx: 0.014, dz: 0.004, taper: 0.45, curl: 0.03, droop: 3 }),
          ...tailFan('tail', [0, 0.215, -0.108], 5, 0.12, 0.046, 22, 6, 6, { dx: 0.022, taper: 0.2, curl: 0.04 }),
        ] : [
          ...W.feathers,
          ...tailFan('tail', [0, 0.205, -0.125], 6, 0.46, 0.034, 9, -10, (i, u) => (Math.abs(u) < 0.5 ? 4 : 5), { dx: 0.012, dz: 0.004, taper: 0.45, curl: 0.03, tip: 0.6, droop: 3 }),
          ...tailFan('tail', [0, 0.214, -0.11], 4, 0.12, 0.04, 20, 6, 6, { dx: 0.02, taper: 0.2, curl: 0.04 }),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          switch (k) {
            case 0: vane(s, t, C, K.blue, K.blueDk, K.blueDk); cmix(C, K.blueDk, sstep(0.6, 1, t) * 0.4); break;
            case 1: vane(s, t, C, K.blue, K.blueDk); break;
            case 2: vane(s, t, C, K.yellow, hex(0xD9A21E)); cmix(C, K.green, sstep(0.5, 0.85, t)); cmix(C, K.blue, sstep(0.9, 1, t) * 0.6); break;
            case 7: vane(s, t, C, K.red, K.redDk); cmix(C, K.yellow, sstep(0.45, 0.8, t)); break;
            case 3: vane(s, t, C, K.red, K.redDk); break;
            case 4: vane(s, t, C, K.red, K.redDk, K.redDk); cmix(C, K.blue, sstep(0.7, 0.9, t)); break;
            case 5: vane(s, t, C, K.blue, K.blueDk); cmix(C, K.red, sstep(0.35, 0.0, t) * 0.7); break;
            case 6: vane(s, t, C, K.red, K.redDk); break;
            default: vane(s, t, C, K.red, K.redDk);
          }
        },
        babyPaint(u, t, C) {
          const k = Math.floor(u * FNC);
          downFeather(hex(0xD6C4C0), hex(0xE8DCD8))(u, t, C);
          if (k === 0 || k === 1 || k === 5) cmix(C, hex(0x3A62B0), sstep(0.5, 0.9, t) * 0.6);
          else cmix(C, hex(0xC8303A), sstep(0.5, 0.9, t) * 0.5);
        },
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap0: 2, cap1: 2, capLen1: 0.4, colFn: upperBeak, babyCol: 0xE2D8CA, keys: [
          [0, 0.395, 0.135, 0.02, 0.022, 0.018],
          [0, 0.393, 0.155, 0.018, 0.021, 0.016],
          [0, 0.383, 0.175, 0.014, 0.016, 0.012],
          [0, 0.364, 0.188, 0.01, 0.011, 0.009],
          [0, 0.343, 0.186, 0.006, 0.006, 0.006],
          [0, 0.33, 0.176, 0.002, 0.002, 0.002],
        ] },
        { kind: 'loft', bone: 'head', segs: 8, cap0: 2, cap1: 2, capLen1: 0.5, col: 0x1E1B1A, babyCol: 0x8C8078, keys: [
          [0, 0.364, 0.13, 0.017, 0.014, 0.014],
          [0, 0.358, 0.15, 0.015, 0.012, 0.012],
          [0, 0.352, 0.165, 0.01, 0.008, 0.008],
          [0, 0.35, 0.172, 0.004, 0.004, 0.004],
        ] },
        ...birdToes(foot, toes, 0x4A4440, 'hpawL'),
      ],
      accentRough: 0.35,
      modelSpec: { anim: { wing: WA.wing }, baby: { muzzle: 0.55, fluff: 0, wing: 0.2, eye: 1.0 } },
      eyes: [{ bone: 'head', p: [0.043, 0.398, 0.118], r: 0.0065, dir: [0.92, 0.15, 0.3], iris: 0xE6D8A2, irisR: 0.85, pupilR: 0.35 }],
      mouth: [0, 0.345, 0.18],
      anim: {
        type: 'bird', walk: 0.6, run: 1.5, stride: 0.17, strideMax: 1.6, duty: [0.64, 0.5], lift: 0.02, flex: 1.2,
        bob: 0.005, waddle: 0.13, yawSway: 0.08,
        neck: ['neck', 'head'], neckDist: [0.6, 0.4], eatPitch: 1.0, eatDrop: 0.03, eatMax: 2.2, peck: 0.12, peckRate: 2, eatElev: [-60, -80], eatY: 0.03,
        flyElev: [20, -12], flyPitch: 0.05, standPitch: -0.42, standElev: [62, -8],
        tail: 'tail', tailWag: 0.2, wing: W.wing, canFly: true, flyLegs: [-0.15, -0.9, 1.6], flyFlex: 1.0, jumpFlap: 0.6, flyTail: -0.05, standTail: 0.08,
        lookPeriod: 2.6, lookRate: 5, lookAmp: 1.0,
        sleepNeck: [[0.9, 2.8], [0.5, 0.2]], sleepLevel: 0.5, sleepTail: 0.35, sitDrop: 0.8,
      },
      baby: { head: 1.5, muzzle: 0.72, eye: 1.1, neck: [0.7, 1.2], body: [1.12, 1.12, 0.88], leg: [0.8, 1.25], tail: 0.22, wing: 0.45, fluff: 0.006 },
      // macaw chick: pale pinkish-gray down with a few red pinfeathers on the head and back
      babyPaint(P, C) {
        if (P.part === 'leg') { cset(C, hex(0x8C8078)); return; }
        downPaint(C, P, hex(0xD9C7C2), 0.1);
        if (P.part === 'head') cmix(C, hex(0xE7B9B2), sstep(0.2, 0.8, P.ny) * 0.5);
        C.ro = 0.9;
      },
    };
  };

  // ---------- amphibian, reptiles ----------
  // toe tubes with round sticky pads at the tips
  function padToes(foot, toes, col, padCol, bone, padR) {
    const out = birdToes(foot, toes, col, bone);
    for (const t of toes) {
      const a = t.a * DEG;
      out.push({ kind: 'sphere', bone, c: [foot[0] + Math.sin(a) * t.len, foot[1] + (t.lift || 0) - 0.0005, foot[2] + Math.cos(a) * t.len], r: padR, s: [1, 0.6, 1], ws: 6, hs: 4, mirror: true, col: padCol });
    }
    return out;
  }

  // ===== FROG (green tree frog), modeled sitting =====
  SPEC.frog = () => {
    const K = { green: hex(0x3F9C2C), greenDk: hex(0x2E7A20), greenHi: hex(0x6DBA3C), cream: hex(0xF1EAD0), line: hex(0xF4F0DC), lineDk: hex(0x7A6A3A), toe: hex(0xD8D49A) };
    const hindToes = [{ a: -12, len: 0.022, r: 0.0022 }, { a: 8, len: 0.03, r: 0.0022 }, { a: 28, len: 0.036, r: 0.0022 }, { a: 50, len: 0.028, r: 0.0022 }, { a: 72, len: 0.018, r: 0.002 }];
    const frontToes = [{ a: -20, len: 0.012, r: 0.0018 }, { a: 5, len: 0.016, r: 0.0018 }, { a: 30, len: 0.018, r: 0.0018 }, { a: 58, len: 0.013, r: 0.0017 }];
    return {
      size: { length: 0.2, height: 0.1, radius: 0.07, eyeHeight: 0.09 },
      tex: [256, 256], rough: 0.5,
      detail: { kind: 'skin', tile: 0.012, amt: 0.1, bump: 0.6, sheen: 0.05 },
      bones: [
        ['hips', null, 0, 0.035, -0.035],
        ['chest', 'hips', 0, 0.052, 0.015],
        ['head', 'chest', 0, 0.066, 0.045],
        ['thighL', 'hips', 0.03, 0.033, -0.058, 1],
        ['shinL', 'thighL', 0.072, 0.028, -0.008, 1],
        ['hmetaL', 'shinL', 0.062, 0.017, -0.075, 1],
        ['hpawL', 'hmetaL', 0.078, 0.005, -0.02, 1],
        ['armL', 'chest', 0.032, 0.045, 0.032, 1],
        ['foreL', 'armL', 0.043, 0.026, 0.022, 1],
        ['fmetaL', 'foreL', 0.044, 0.006, 0.05, 1],
        ['fpawL', 'fmetaL', 0.046, 0.004, 0.062, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'head'], blend: 0.02, segs: 16, cap0: 3, cap1: 3, capLen0: 0.6, capLen1: 0.45, keys: [
          [0, 0.03, -0.085, 0.022, 0.016, 0.014, 2.2],
          [0, 0.034, -0.07, 0.04, 0.026, 0.022, 2.3],
          [0, 0.042, -0.04, 0.05, 0.032, 0.03, 2.4],
          [0, 0.052, -0.003, 0.051, 0.03, 0.03, 2.5],
          [0, 0.062, 0.03, 0.047, 0.026, 0.026, 2.5],
          [0, 0.068, 0.055, 0.04, 0.022, 0.02, 2.4],
          [0, 0.07, 0.075, 0.028, 0.016, 0.014, 2.2],
          [0, 0.069, 0.087, 0.016, 0.01, 0.009, 2.0],
        ] },
        { name: 'thigh', mirror: true, bones: ['hips', 'thighL', 'shinL'], blend: 0.008, segs: 10, cap1: 2, keys: [
          [0.022, 0.036, -0.062, 0.012, 0.014, 0.012],
          [0.04, 0.034, -0.043, 0.015, 0.016, 0.014],
          [0.06, 0.03, -0.02, 0.012, 0.012, 0.011],
          [0.072, 0.028, -0.008, 0.009, 0.009, 0.009],
        ] },
        { name: 'shin', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap0: 2, cap1: 2, keys: [
          [0.074, 0.029, -0.004, 0.008, 0.008, 0.008],
          [0.07, 0.024, -0.04, 0.0085, 0.008, 0.008],
          [0.063, 0.018, -0.072, 0.006, 0.006, 0.006],
          [0.068, 0.012, -0.05, 0.0065, 0.0045, 0.004],
          [0.076, 0.006, -0.022, 0.006, 0.0035, 0.003],
        ] },
        { name: 'arm', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.005, segs: 8, cap1: 2, keys: [
          [0.026, 0.046, 0.032, 0.009, 0.01, 0.009],
          [0.037, 0.034, 0.025, 0.0075, 0.0075, 0.0075],
          [0.043, 0.024, 0.024, 0.0065, 0.0065, 0.0065],
          [0.044, 0.014, 0.038, 0.0055, 0.0055, 0.0055],
          [0.045, 0.006, 0.054, 0.005, 0.004, 0.004],
        ] },
      ],
      paint(P, C) {
        cset(C, K.green);
        cmix(C, K.greenHi, sstep(0.2, 0.9, P.ny) * 0.35);
        const n = fbm(P.x * 160, P.y * 160, P.z * 160, 3);
        cmix(C, K.greenDk, sstep(0.55, 0.75, n) * 0.35);
        if (P.part === 'body') {
          // cream belly, white side stripe bordered dark from the lip back along the flank
          cmix(C, K.cream, sstep(-0.15, -0.5, P.ny));
          const sy = P.ny + 0.02 - (P.z - 0.02) * 1.2;
          const st = sstep(0.09, 0.04, Math.abs(sy)) * sstep(-0.075, -0.05, P.z) * sstep(0.3, 0.6, Math.abs(P.nx));
          cmix(C, K.lineDk, sstep(0.14, 0.09, Math.abs(sy)) * sstep(-0.075, -0.05, P.z) * sstep(0.3, 0.6, Math.abs(P.nx)) * 0.5);
          cmix(C, K.line, st);
        } else {
          cmix(C, K.cream, sstep(-0.1, -0.6, P.ny) * 0.8);
          cmix(C, hex(0xD9A23A), sstep(0.0, 0.5, -P.nz) * sstep(0.2, 0.6, -P.ny) * 0.3);
        }
        const fine = noise(P.x * 700, P.y * 700, P.z * 700);
        cmul(C, 0.95 + 0.1 * fine);
        C.ro = 0.42 + 0.1 * fine;
      },
      accent: [
        ...padToes([0.078, 0.005, -0.02], hindToes, 0x5DAA36, 0xA9B86A, 'hpawL', 0.0034),
        ...padToes([0.046, 0.004, 0.062], frontToes, 0x5DAA36, 0xA9B86A, 'fpawL', 0.003),
        { kind: 'sphere', bone: 'head', c: [0.027, 0.081, 0.056], r: 0.0118, mirror: true, col: 0x3F9C2C },
        // nostrils near the tip of the snout
        { kind: 'sphere', bone: 'head', c: [0.0065, 0.0745, 0.0875], r: 0.0012, s: [1, 0.7, 1], ws: 6, hs: 4, mirror: true, col: 0x1E3A12 },
      ],
      accentRough: 0.45,
      eyes: [{ bone: 'head', p: [0.03, 0.084, 0.057], r: 0.0115, dir: [0.75, 0.35, 0.55], iris: 0xD9A021, irisR: 0.95, pupil: 'h', pupilR: 0.36, rim: 0x6A4A14, sclera: 0x8A6A1E }],
      mouth: [0, 0.064, 0.088],
      anim: {
        type: 'legged', walk: 0.6, trot: 1.2, run: 2.4, stride: 0.12, strideMax: 3.0,
        duty: [0.6, 0.5, 0.4], lift: [0.012, 0.02], flexF: 1.0, flexH: 0.6, gaits: { w: [0.0, 0.5, 0.5, 0.0], t: [0.0, 0.5, 0.5, 0.0], g: [0.0, 0.5, 0.5, 0.0] },
        bob: [0.003, 0.005, 0.008], pitchRun: 0.0, flexRun: 0.0, roll: 0.03,
        legs: [
          { n: ['armL', 'foreL', 'fmetaL', 'fpawL'], front: true, pole: [0.4, 0, -1] },
          { n: ['thighL', 'shinL', 'hmetaL', 'hpawL'], front: false, pole: [0.5, 0.2, 0.85] },
        ],
        hop: {
          gather: { f: [0, 0, 0], h: [0, 0, 0] }, gatherPitch: 0.0, gatherDrop: 0.0,
          up: { f: [0.5, -0.9, 1.5], h: [-0.2, -6.0, 2.7], pitch: -0.45 },
          mid: { f: [0.2, 0.2, 0.6], h: [0.3, -4.5, 2.2] },
          down: { f: [-0.5, 1.3, -0.4], h: [0.4, -1.5, 1.2], pitch: 0.25 },
        },
        kick: { f: [0.25, -0.6, 1.4], rate: 0.9 },
        breathe: 0.003, throat: true,
        neck: ['head'], neckDist: [1], nod: 0.0, chew: 0.04, chewRate: 9, eatY: 0.005, eatPitch: 0.2, eatMax: 1.2,
        floatDepth: 0.045, swimPitch: -0.04, swimHead: -0.05, lookAmp: 0.25,
        climb: { splay: 0.25, drop: 0.55, reach: 0.25, neck: -0.25, flex: 0.3, toe: 0.2 },
        sleep: { style: 'rest', neck: [0, 0.1], ears: 0 }, happyHop: 0.1, wiggle: 0.4,
      },
      // froglet: just out of the water, a big head and big eyes on a short body, legs not grown yet
      baby: { head: 1.22, eye: 1.12, muzzle: 0.8, body: [1.04, 1.06, 0.88], leg: [0.8, 1.0] },
    };
  };

  // ===== LIZARD (black with yellow spots) =====
  SPEC.lizard = () => {
    const K = { black: hex(0x161616), belly: hex(0x2C2A26), yellow: hex(0xF3C21B), yellowDk: hex(0xC98F0E) };
    const fToes = [{ a: -40, len: 0.01, r: 0.0019, claw: 0.002 }, { a: -10, len: 0.013, r: 0.0019, claw: 0.002 }, { a: 15, len: 0.015, r: 0.0019, claw: 0.002 }, { a: 40, len: 0.014, r: 0.0019, claw: 0.002 }, { a: 75, len: 0.008, r: 0.0018, claw: 0.002 }];
    const hToes = [{ a: -20, len: 0.01, r: 0.002, claw: 0.002 }, { a: 5, len: 0.015, r: 0.002, claw: 0.002 }, { a: 25, len: 0.019, r: 0.002, claw: 0.002 }, { a: 45, len: 0.021, r: 0.002, claw: 0.002 }, { a: 95, len: 0.013, r: 0.0019, claw: 0.002 }];
    return {
      size: { length: 0.4, height: 0.06, radius: 0.06, eyeHeight: 0.05 },
      tex: [256, 512], rough: 0.78,
      detail: { kind: 'scale', tile: 0.01, amt: 0.25, bump: 0.6, sheen: 0.03 },
      bones: [
        ['hips', null, 0, 0.03, -0.035],
        ['chest', 'hips', 0, 0.031, 0.035],
        ['neck', 'chest', 0, 0.033, 0.075],
        ['head', 'neck', 0, 0.035, 0.092],
        ['tail1', 'hips', 0, 0.027, -0.075],
        ['tail2', 'tail1', 0, 0.022, -0.125],
        ['tail3', 'tail2', 0, 0.016, -0.18],
        ['tail4', 'tail3', 0, 0.011, -0.235],
        ['thighL', 'hips', 0.016, 0.026, -0.045, 1],
        ['shinL', 'thighL', 0.048, 0.034, -0.038, 1],
        ['hmetaL', 'shinL', 0.062, 0.006, -0.052, 1],
        ['hpawL', 'hmetaL', 0.066, 0.004, -0.04, 1],
        ['armL', 'chest', 0.017, 0.027, 0.048, 1],
        ['foreL', 'armL', 0.044, 0.034, 0.05, 1],
        ['fmetaL', 'foreL', 0.054, 0.005, 0.062, 1],
        ['fpawL', 'fmetaL', 0.057, 0.004, 0.072, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.02, segs: 14, cap1: 3, capLen1: 0.55, keys: [
          [0, 0.027, -0.068, 0.017, 0.012, 0.011, 2.2],
          [0, 0.029, -0.04, 0.025, 0.016, 0.014, 2.3],
          [0, 0.03, -0.005, 0.029, 0.017, 0.015, 2.4],
          [0, 0.03, 0.035, 0.025, 0.016, 0.014, 2.3],
          [0, 0.031, 0.062, 0.016, 0.0125, 0.012, 2.2],
          [0, 0.033, 0.077, 0.0145, 0.012, 0.011, 2.2],
          [0, 0.035, 0.092, 0.0175, 0.0125, 0.0105, 2.4],
          [0, 0.034, 0.108, 0.0145, 0.0105, 0.009, 2.4],
          [0, 0.0315, 0.122, 0.0098, 0.0075, 0.0068, 2.3],
          [0, 0.029, 0.133, 0.0058, 0.0048, 0.0042, 2.2],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3', 'tail4'], blend: 0.02, segs: 10, cap1: 2, keys: [
          [0, 0.029, -0.055, 0.017, 0.014, 0.012],
          [0, 0.027, -0.08, 0.013, 0.012, 0.01],
          [0, 0.022, -0.13, 0.009, 0.009, 0.008],
          [0, 0.016, -0.185, 0.006, 0.006, 0.006],
          [0, 0.011, -0.24, 0.0035, 0.0035, 0.0035],
          [0, 0.008, -0.285, 0.0012, 0.0012, 0.0012],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.005, segs: 8, cap1: 2, keys: [
          [0.012, 0.028, 0.048, 0.007, 0.008, 0.008],
          [0.03, 0.031, 0.049, 0.0055, 0.0055, 0.0055],
          [0.044, 0.034, 0.05, 0.005, 0.005, 0.005],
          [0.05, 0.018, 0.057, 0.004, 0.004, 0.004],
          [0.055, 0.005, 0.066, 0.0035, 0.003, 0.003],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.005, segs: 8, cap1: 2, keys: [
          [0.01, 0.027, -0.045, 0.008, 0.009, 0.009],
          [0.03, 0.03, -0.042, 0.0065, 0.0065, 0.0065],
          [0.048, 0.034, -0.038, 0.0055, 0.0055, 0.0055],
          [0.056, 0.019, -0.046, 0.0045, 0.0045, 0.0045],
          [0.063, 0.005, -0.048, 0.004, 0.003, 0.003],
        ] },
      ],
      paint(P, C) {
        cset(C, K.black);
        cmix(C, K.belly, sstep(-0.3, -0.8, P.ny) * 0.8);
        // bright round yellow spots, larger along the back
        const sc = P.part === 'tail' ? 130 : P.part === 'body' ? 95 : 170;
        const d = cells(P.x * sc + 3.3, P.y * sc * 0.9, P.z * sc);
        const rad = P.part === 'body' ? 0.36 : P.part === 'tail' ? 0.33 : 0.26;
        const sp = sstep(rad, rad - 0.06, d) * sstep(-0.75, -0.35, P.ny);
        cmix(C, K.yellow, sp);
        cmix(C, K.yellowDk, sp * sstep(rad - 0.12, rad - 0.04, d) * 0.4);
        const fine = noise(P.x * 900, P.y * 900, P.z * 900);
        cmul(C, 0.9 + 0.2 * fine);
        C.ro = 0.8 + 0.1 * fine;
      },
      accent: [
        ...birdToes([0.057, 0.004, 0.072], fToes, 0x1C1C1C, 'fpawL'),
        ...birdToes([0.066, 0.004, -0.04], hToes, 0x1C1C1C, 'hpawL'),
      ],
      accentRough: 0.7,
      eyes: [{ bone: 'head', p: [0.013, 0.04, 0.1], r: 0.0042, dir: [0.9, 0.3, 0.2], iris: 0x8A6A20, irisR: 0.7, pupilR: 0.6 }],
      mouth: [0, 0.03, 0.13],
      anim: {
        type: 'legged', walk: 0.9, trot: 1.8, run: 3.2, stride: 0.15, strideMax: 2.2,
        duty: [0.62, 0.5, 0.42], lift: [0.012, 0.012], flexF: 0.5, flexH: 0.5, splay: 1,
        gaits: { w: [0.0, 0.5, 0.5, 0.0], t: [0.0, 0.5, 0.5, 0.0], g: [0.0, 0.5, 0.5, 0.0] },
        bob: [0.0, 0.0, 0.002], pitchRun: 0.0, flexRun: 0.0, roll: 0.03,
        legs: [
          { n: ['armL', 'foreL', 'fmetaL', 'fpawL'], front: true, pole: [1, 0.9, -0.3] },
          { n: ['thighL', 'shinL', 'hmetaL', 'hpawL'], front: false, pole: [1, 0.9, 0.3] },
        ],
        spine: ['hips', 'chest', 'neck'], wave: 0.24, wavePh: 1.4,
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.0, chew: 0.06, chewRate: 10, eatY: 0.004, eatMax: 1.2,
        tail: ['tail1', 'tail2', 'tail3', 'tail4'], tailSway: 0.08, tailWalk: 0.0,
        floatDepth: 0.02, swimHead: -0.25, swimPitch: -0.05, paddleR: 0.6, lookAmp: 0.5, pushups: 0.012,
        climb: { splay: 0.25, drop: 0.7, reach: 0.2, neck: -0.3, tail: [0.06, 0.03, 0, 0], flex: 0.2, toe: 0.5 },
        sleep: { style: 'flat', neck: [0.4, 0.15], tail: [1.2, -0.02] }, wag: 0.25,
      },
      baby: { head: 1.3, eye: 1.1, muzzle: 0.75, body: [1.05, 1.08, 0.88], leg: [0.85, 1.1], tail: 0.8 },
    };
  };

  // ===== TURTLE (painted turtle) =====
  SPEC.turtle = () => {
    const K = {
      shell: hex(0x263020), shellHi: hex(0x3E4A2E), seam: hex(0xA9A060), skin: hex(0x23271E), yellow: hex(0xE8C844), red: hex(0xC2361F),
      plastron: hex(0xE2B24A), plastronDk: hex(0x7A5420), claw: 0x403A30,
    };
    const fToes = [{ a: -10, len: 0.008, r: 0.003, claw: 0.009, clawCol: 0x4A443A }, { a: 15, len: 0.009, r: 0.003, claw: 0.01, clawCol: 0x4A443A }, { a: 40, len: 0.008, r: 0.003, claw: 0.009, clawCol: 0x4A443A }];
    const hToes = [{ a: -5, len: 0.008, r: 0.003, claw: 0.007, clawCol: 0x4A443A }, { a: 25, len: 0.009, r: 0.003, claw: 0.007, clawCol: 0x4A443A }, { a: 55, len: 0.008, r: 0.003, claw: 0.006, clawCol: 0x4A443A }];
    // scute pattern on the shell: vertebral row, costal rows, narrow marginal band with red bars
    const shellCol = (x, y, z) => {
      const ax = Math.abs(x);
      if (y < 0.042) {
        const c = mixc(K.plastron, K.plastronDk, sstep(0.6, 0.9, noise(x * 60, z * 60, 3)) * 0.45);
        return mixc(c, K.red, sstep(0.075, 0.092, ax) * 0.5);
      }
      const rim = sstep(0.06, 0.054, y);
      const n = noise(x * 50, y * 50, z * 50);
      let c = mixc(K.shell, K.shellHi, n * 0.45);
      // seams
      const vz = fract((z + 0.135) / 0.054), cz = fract((z + 0.112) / 0.056);
      let seam;
      if (ax < 0.03) seam = sstep(0.045, 0.0, Math.min(vz, 1 - vz)) * sstep(0.115, 0.1, Math.abs(z));
      else seam = sstep(0.045, 0.0, Math.min(cz, 1 - cz)) * sstep(0.064, 0.068, y);
      seam = Math.max(seam, sstep(0.0025, 0.0, Math.abs(ax - 0.03)) * sstep(0.12, 0.09, Math.abs(z)), sstep(0.003, 0.0, Math.abs(y - 0.066)) * sstep(0.03, 0.04, ax));
      c = mixc(c, K.seam, seam * 0.6 * (1 - rim));
      if (rim > 0.01) {
        const ang = Math.atan2(z, x), m = fract(ang * 13 / TAU + 0.5);
        let mc = mixc(K.shell, K.red, sstep(0.3, 0.38, m) * sstep(0.7, 0.62, m) * 0.85);
        mc = mixc(mc, K.yellow, sstep(0.05, 0.0, Math.min(m, 1 - m)) * 0.7);
        c = mixc(c, mc, rim);
      }
      return c;
    };
    return {
      size: { length: 0.35, height: 0.13, radius: 0.13, eyeHeight: 0.08 },
      tex: [256, 256], rough: 0.65, orm: true,
      detail: { kind: 'scale', tile: 0.012, amt: 0.2, bump: 0.5, sheen: 0.03 },
      bones: [
        ['hips', null, 0, 0.045, 0.0],
        ['neck', 'hips', 0, 0.05, 0.1],
        ['head', 'neck', 0, 0.055, 0.155],
        ['tail1', 'hips', 0, 0.045, -0.11],
        ['thighL', 'hips', 0.06, 0.044, -0.08, 1],
        ['shinL', 'thighL', 0.098, 0.038, -0.09, 1],
        ['hmetaL', 'shinL', 0.108, 0.014, -0.096, 1],
        ['hpawL', 'hmetaL', 0.118, 0.005, -0.088, 1],
        ['armL', 'hips', 0.065, 0.046, 0.075, 1],
        ['foreL', 'armL', 0.1, 0.038, 0.094, 1],
        ['fmetaL', 'foreL', 0.11, 0.014, 0.1, 1],
        ['fpawL', 'fmetaL', 0.118, 0.005, 0.116, 1],
      ],
      fur: [
        { name: 'shell', bones: ['hips'], segs: 22, sub: 4, cap0: 3, cap1: 3, capLen0: 0.5, capLen1: 0.5, texScale: 1.6, dkind: 'skin', damt: 0.6, dtile: 2, keys: [
          [0, 0.045, -0.135, 0.055, 0.02, 0.006, 2.2],
          [0, 0.045, -0.105, 0.088, 0.048, 0.012, 2.4],
          [0, 0.045, -0.04, 0.102, 0.07, 0.014, 2.6],
          [0, 0.045, 0.03, 0.1, 0.07, 0.014, 2.6],
          [0, 0.045, 0.09, 0.085, 0.052, 0.012, 2.4],
          [0, 0.045, 0.125, 0.055, 0.025, 0.006, 2.2],
        ] },
        { name: 'neck', bones: ['hips', 'neck', 'head'], blend: 0.015, segs: 12, cap1: 3, capLen1: 0.6, keys: [
          [0, 0.05, 0.04, 0.026, 0.022, 0.02],
          [0, 0.05, 0.09, 0.022, 0.019, 0.018],
          [0, 0.054, 0.135, 0.017, 0.016, 0.015],
          [0, 0.058, 0.16, 0.019, 0.016, 0.014],
          [0, 0.056, 0.185, 0.014, 0.012, 0.01],
          [0, 0.052, 0.2, 0.007, 0.006, 0.005],
        ] },
        { name: 'tail', bones: ['tail1'], segs: 8, cap1: 2, keys: [
          [0, 0.046, -0.09, 0.012, 0.01, 0.01],
          [0, 0.042, -0.13, 0.007, 0.006, 0.006],
          [0, 0.036, -0.155, 0.002, 0.002, 0.002],
        ] },
        { name: 'fleg', mirror: true, bones: ['hips', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.006, segs: 8, cap1: 2, keys: [
          [0.05, 0.046, 0.07, 0.02, 0.018, 0.018],
          [0.08, 0.043, 0.085, 0.019, 0.017, 0.017],
          [0.1, 0.038, 0.094, 0.017, 0.016, 0.016],
          [0.108, 0.022, 0.099, 0.015, 0.014, 0.015],
          [0.114, 0.008, 0.108, 0.015, 0.008, 0.011],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap1: 2, keys: [
          [0.045, 0.044, -0.075, 0.021, 0.019, 0.019],
          [0.075, 0.041, -0.085, 0.02, 0.018, 0.018],
          [0.098, 0.038, -0.09, 0.018, 0.016, 0.016],
          [0.106, 0.022, -0.096, 0.016, 0.015, 0.015],
          [0.114, 0.008, -0.092, 0.016, 0.009, 0.012],
        ] },
      ],
      paint(P, C) {
        if (P.part === 'shell') {
          const c = shellCol(P.x, P.y, P.z);
          cset(C, c);
          const fine = noise(P.x * 600, P.y * 600, P.z * 600);
          cmul(C, 0.92 + 0.14 * fine);
          C.ro = P.y < 0.042 ? 0.6 : 0.38 + 0.12 * fine;
          return;
        }
        cset(C, K.skin);
        // yellow head and neck stripes, red stripes on the neck and legs
        const ln = Math.sin((P.part === 'neck' ? P.cx : P.cx * 1.5) * 520 + noise(P.x * 80, P.y * 80, P.z * 80) * 1.5);
        const yl = sstep(0.75, 0.92, ln);
        cmix(C, K.yellow, yl * (P.part === 'neck' ? 0.95 : 0.6));
        if (P.part !== 'neck' || P.z < 0.14) cmix(C, K.red, sstep(0.75, 0.92, -ln) * 0.6);
        if (P.part === 'neck') {
          // yellow spot behind the eye
          const ex = Math.abs(P.x) - 0.016, ey = P.y - 0.064, ez = P.z - 0.163;
          cmix(C, K.yellow, sstep(0.007, 0.004, Math.sqrt(ex * ex * 2 + ey * ey + ez * ez)));
          cmix(C, K.yellow, sstep(-0.3, -0.8, P.ny) * 0.5);
        }
        const fine = noise(P.x * 800, P.y * 800, P.z * 800);
        cmul(C, 0.9 + 0.2 * fine);
        C.ro = 0.62;
      },
      accent: [
        ...birdToes([0.118, 0.005, 0.116], fToes, 0x23271E, 'fpawL'),
        ...birdToes([0.118, 0.005, -0.088], hToes, 0x23271E, 'hpawL'),
      ],
      accentRough: 0.55,
      eyes: [{ bone: 'head', p: [0.0125, 0.064, 0.175], r: 0.0045, dir: [0.85, 0.25, 0.4], iris: 0x9A7A2A, irisR: 0.7, pupilR: 0.55 }],
      mouth: [0, 0.05, 0.2],
      anim: {
        type: 'legged', walk: 0.35, trot: 0.7, run: 1.2, stride: 0.13, strideMax: 1.6, maxRate: 7,
        duty: [0.72, 0.62, 0.55], lift: [0.015, 0.012], flexF: 0.6, flexH: 0.5, splay: 1,
        gaits: { w: [0.0, 0.5, 0.5, 0.0], t: [0.0, 0.5, 0.5, 0.0], g: [0.0, 0.5, 0.5, 0.0] },
        bob: [0.002, 0.003, 0.004], pitchRun: 0.0, flexRun: 0.0, roll: 0.04,
        legs: [
          { n: ['armL', 'foreL', 'fmetaL', 'fpawL'], front: true, pole: [1, 0.6, -0.2] },
          { n: ['thighL', 'shinL', 'hmetaL', 'hpawL'], front: false, pole: [1, 0.6, 0.2] },
        ],
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.06, chew: 0.07, chewRate: 6, eatY: 0.004, eatMax: 1.4,
        extend: [0.045, 0.006], tail: ['tail1'], tailSway: 0.08,
        floatDepth: 0.085, swimHead: -0.4, swimPitch: -0.06, paddle: 1.2, paddleR: 0.6, lookAmp: 0.5,
        sleep: { style: 'shell', tuck: 0.6, neck: [0, 0.25], tail: [0.4, 0] }, wag: 0.2,
      },
      baby: { head: 1.25, eye: 1.1, muzzle: 0.8, body: [1.08, 1.12, 0.9], leg: [0.85, 1.1], tail: 0.6 },
    };
  };

  // ===== SNAKE (garter snake) =====
  const SNAKE_N = 16, SNAKE_L = 1.0, SNAKE_R = 0.019;
  SPEC.snake = () => {
    const K = { body: hex(0x2E3324), dark: hex(0x121410), stripe: hex(0xE8CF5A), stripeDk: hex(0xB89A2E), belly: hex(0xB8BC86), head: hex(0x262A1E), lip: hex(0xD8D29A) };
    const z0 = 0.42, dz = (SNAKE_L - 0.07) / SNAKE_N;
    const bones = [['head', null, 0, SNAKE_R, z0 + 0.012]];
    const names = [];
    for (let i = 0; i < SNAKE_N; i++) { bones.push(['s' + i, null, 0, SNAKE_R, z0 - i * dz]); names.push('s' + i); }
    const rad = (u) => SNAKE_R * (u < 0.08 ? lerp(0.6, 0.9, sstep(0, 1, u / 0.08)) : u < 0.55 ? lerp(0.9, 1, sstep(0.08, 0.35, u)) : lerp(1, 0.08, Math.pow((u - 0.55) / 0.45, 1.3)));
    // body path runs from the head back to the tail tip so each bone owns the stretch behind its pivot
    const keys = [];
    const tailZ = z0 - SNAKE_L + 0.07;
    for (let k = 0; k <= 20; k++) {
      const u = k / 20, z = lerp(z0 + 0.005, tailZ, u), r = rad(u);
      keys.push([0, Math.max(r, 0.002) * 0.95, z, r, r * 0.92, r * 0.85, 2.15]);
    }
    const tongue = () => {
      const g = new THREE.BufferGeometry();
      const L = 0.03, w = 0.0012;
      // two prongs from a shared stem: stem quad + two thin triangles
      const v = [
        -w, 0, 0, w, 0, 0, w, 0, L * 0.6, -w, 0, 0, w, 0, L * 0.6, -w, 0, L * 0.6,
        -w, 0, L * 0.6, 0, 0, L * 0.6, -0.004, 0, L,
        0, 0, L * 0.6, w, 0, L * 0.6, 0.004, 0, L,
      ];
      g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
      g.computeVertexNormals();
      return g;
    };
    return {
      size: { length: 1.0, height: 0.04, radius: 0.08, eyeHeight: 0.05 },
      tex: [128, 256], rough: 0.55,
      detail: { kind: 'feather', tile: 0.012, amt: 0.22, bump: 0.5, sheen: 0.03 },
      bones,
      fur: [
        { name: 'body', bones: names, blend: 0.03, segs: 10, sub: 2, cap1: 2, side: [-1, 0, 0], flow: 1, keys },
        // head a little wider than the neck: broad jaws, flat crown, rounded snout
        { name: 'head', bones: ['head'], segs: 12, cap0: 2, cap1: 3, capLen1: 0.6, dkind: 'scale', dtile: 2.2, keys: [
          [0, SNAKE_R * 0.92, z0 - 0.012, SNAKE_R * 0.68, SNAKE_R * 0.6, SNAKE_R * 0.6, 2.2],
          [0, SNAKE_R * 0.96, z0 + 0.008, SNAKE_R * 0.98, SNAKE_R * 0.66, SNAKE_R * 0.64, 2.4],
          [0, SNAKE_R * 0.94, z0 + 0.03, SNAKE_R * 0.86, SNAKE_R * 0.6, SNAKE_R * 0.56, 2.5],
          [0, SNAKE_R * 0.87, z0 + 0.046, SNAKE_R * 0.56, SNAKE_R * 0.42, SNAKE_R * 0.4, 2.2],
        ] },
      ],
      paint(P, C) {
        cset(C, P.part === 'head' ? K.head : K.body);
        if (P.part === 'body') {
          // three yellow longitudinal stripes: one on the spine, one low on each side; checkered dark spots between
          const a = Math.atan2(P.nx, P.ny) / PI; // 0 top, +-1 bottom
          const aa = Math.abs(a);
          const dors = sstep(0.075, 0.045, aa), lat = sstep(0.06, 0.035, Math.abs(aa - 0.6));
          const chk = sstep(0.55, 0.7, Math.sin(P.arc * 140 + (a > 0 ? 0 : 1.6)) * 0.5 + 0.5) * sstep(0.15, 0.22, aa) * sstep(0.5, 0.42, aa);
          cmix(C, K.dark, chk * 0.7);
          cmix(C, K.belly, sstep(0.66, 0.8, aa));
          cmix(C, K.stripe, Math.max(dors, lat) * sstep(P.len - 0.02, P.len - 0.12, P.arc));
          cmix(C, K.stripeDk, lat * 0.2);
        } else {
          // pale lip scales with dark bars along the jaw, pale chin, darker crown
          const lip = sstep(-0.05, -0.35, P.ny);
          cmix(C, K.lip, lip);
          cmix(C, K.dark, lip * sstep(0.55, 0.85, Math.sin(P.z * 900)) * sstep(-0.75, -0.45, P.ny) * 0.7);
          cmix(C, K.dark, sstep(0.4, 0.9, P.ny) * 0.3);
          cmix(C, hex(0x6A6A3A), sstep(0.015, 0.006, Math.abs(P.x)) * sstep(0.6, 0.9, P.ny) * sstep(z0 - 0.012, z0 - 0.002, P.z) * 0.6);
        }
        // scales: fine cell pattern
        const sc = cells(P.x * 420, P.y * 420, P.z * 260);
        cmul(C, 0.85 + 0.2 * sstep(0.2, 0.6, sc));
        C.ro = 0.45 + 0.15 * sc;
      },
      accent: [],
      extras: () => [{ bone: 'head', name: 'tongue', geo: tongue(), mat: new THREE.MeshStandardMaterial({ color: linColor(0xC4202A), roughness: 0.5, side: THREE.DoubleSide }), at: [0, SNAKE_R * 0.75, z0 + 0.04] }],
      eyes: [{ bone: 'head', p: [SNAKE_R * 0.74, SNAKE_R * 1.2, z0 + 0.026], r: 0.0036, dir: [0.85, 0.3, 0.35], iris: 0x3A2A14, irisR: 0.92, pupilR: 0.5, lid: [0.95, -0.95, 0], noBlink: true }],
      mouth: [0, SNAKE_R * 0.8, z0 + 0.05],
      anim: {
        type: 'snake', walk: 0.8, run: 2.2, stride: 0.6, floatDepth: 0.012,
        names, z0, dz,
      },
    };
  };

  // ---------- round 2 species: horse, pig, goat, otter, hedgehog, raccoon ----------
  ids.push('horse', 'pig', 'goat', 'otter', 'hedgehog', 'raccoon');

  // ===== HORSE (bay) =====
  SPEC.horse = () => {
    const xF = 0.18, xH = 0.19;
    const K = {
      bay: hex(0x7E4020), bayHi: hex(0xA0582A), bayDk: hex(0x4A2412), black: hex(0x171311), blackHi: hex(0x2E2622), white: hex(0xEDE8E0),
      muzzle: hex(0x2E2420), hoof: hex(0x34302C), earIn: hex(0x3A2A24),
    };
    return {
      size: { length: 2.3, height: 2.05, radius: 0.5, eyeHeight: 1.85 },
      tex: [256, 512], rough: 0.7,
      detail: { kind: 'fur', tile: 0.05, amt: 0.07, bump: 0.12, sheen: 0.14 },
      shell: { parts: ['mane', 'forelock', 'tail'], d1: ['tail'], n1: 2, len: 0.025, n: 4, lean: 0.6 },
      bones: [
        ['hips', null, 0, 1.4, -0.6],
        ['chest', 'hips', 0, 1.38, 0.4],
        ['neck', 'chest', 0, 1.459, 0.66],
        ['neck2', 'neck', 0, 1.635, 0.911],
        ['head', 'neck2', 0, 1.844, 1.107],
        ['mane1', 'neck', 0, 1.7, 0.57],
        ['mane2', 'neck2', 0, 1.86, 0.84],
        ['tail1', 'hips', 0, 1.5, -0.98],
        ['tail2', 'tail1', 0, 1.28, -1.09],
        ['tail3', 'tail2', 0, 0.96, -1.13],
        ['thighL', 'hips', xH, 1.38, -0.62, 1],
        ['shinL', 'thighL', xH + 0.01, 0.97, -0.46, 1],
        ['hmetaL', 'shinL', xH, 0.62, -0.75, 1],
        ['hpawL', 'hmetaL', xH, 0.25, -0.73, 1],
        ['armL', 'chest', xF, 1.25, 0.4, 1],
        ['foreL', 'armL', xF, 0.97, 0.27, 1],
        ['fmetaL', 'foreL', xF, 0.5, 0.29, 1],
        ['fpawL', 'fmetaL', xF, 0.24, 0.3, 1],
        ['earL', 'head', 0.06, 1.975, 1.07, 1],
      ],
      fur: [
        // barrel, high withers, deep chest; the neck rises steeply with a deep base and an arched crest
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.12, segs: 14, cap0: 3, capLen0: 0.6, keys: [
          [0, 1.43, -1.02, 0.1, 0.07, 0.13],
          [0, 1.41, -0.97, 0.23, 0.13, 0.33],
          [0, 1.38, -0.8, 0.305, 0.215, 0.43],
          [0, 1.32, -0.42, 0.315, 0.23, 0.42],
          [0, 1.3, -0.06, 0.335, 0.25, 0.41],
          [0, 1.31, 0.24, 0.315, 0.28, 0.42],
          [0, 1.37, 0.46, 0.255, 0.305, 0.38],
          [0, 1.5, 0.66, 0.19, 0.3, 0.27],
          [0, 1.65, 0.85, 0.15, 0.225, 0.2],
          [0, 1.79, 1.0, 0.112, 0.155, 0.11],
          [0, 1.87, 1.08, 0.098, 0.11, 0.075],
        ] },
        // long head: broad flat forehead, deep cheeks, slim face, soft rounded muzzle
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 3, capLen1: 0.45, keys: [
          [0, 1.955, 1.05, 0.08, 0.07, 0.08],
          [0, 1.89, 1.12, 0.105, 0.075, 0.19],
          [0, 1.8, 1.19, 0.097, 0.07, 0.18],
          [0, 1.69, 1.265, 0.08, 0.064, 0.14],
          [0, 1.58, 1.33, 0.07, 0.06, 0.09],
          [0, 1.49, 1.385, 0.077, 0.068, 0.084],
          [0, 1.425, 1.425, 0.072, 0.064, 0.074],
        ] },
        // round cheek over the big jaw muscle
        { name: 'jowl', mirror: true, bones: ['head'], segs: 8, cap0: 3, cap1: 3, capLen0: 0.9, capLen1: 0.9, keys: [
          [0.048, 1.84, 1.065, 0.028, 0.05, 0.05],
          [0.06, 1.765, 1.11, 0.04, 0.1, 0.1],
          [0.054, 1.685, 1.16, 0.032, 0.07, 0.07],
          [0.044, 1.635, 1.19, 0.02, 0.035, 0.035],
        ] },
        { name: 'mane', bones: ['mane1', 'mane2'], blend: 0.08, segs: 10, cap0: 2, cap1: 2, fuzz: 0.25, fuzzFreq: 14, damt: 3, dtile: 0.5, fl: 1, keys: [
          [0, 1.68, 0.46, 0.04, 0.05, 0.03, 1.8],
          [0, 1.79, 0.64, 0.05, 0.08, 0.04, 1.8],
          [0, 1.87, 0.8, 0.052, 0.085, 0.04, 1.8],
          [0, 1.94, 0.94, 0.048, 0.07, 0.04, 1.8],
          [0, 1.985, 1.04, 0.04, 0.05, 0.035, 1.8],
        ] },
        { name: 'forelock', bones: ['head'], segs: 8, cap1: 2, fuzz: 0.3, damt: 3, dtile: 0.5, keys: [
          [0, 2.0, 1.07, 0.035, 0.02, 0.02],
          [0, 1.965, 1.12, 0.04, 0.02, 0.02],
          [0, 1.9, 1.175, 0.032, 0.015, 0.015],
          [0, 1.85, 1.205, 0.018, 0.01, 0.01],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3'], blend: 0.06, segs: 12, cap1: 3, capLen1: 1.2, fuzz: 0.35, fuzzFreq: 12, damt: 3, dtile: 0.5, keys: [
          [0, 1.49, -0.93, 0.045, 0.05, 0.05],
          [0, 1.47, -1.0, 0.055, 0.065, 0.07],
          [0, 1.34, -1.08, 0.066, 0.08, 0.085],
          [0, 1.13, -1.12, 0.08, 0.085, 0.09],
          [0, 0.9, -1.135, 0.09, 0.075, 0.085],
          [0, 0.7, -1.12, 0.066, 0.055, 0.06],
        ] },
        // hind leg: big haunch and gaskin, pointed hock, flat cannon, round fetlock, sloped pastern, hoof
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.05, segs: 10, sub: 2, cap1: 2, capLen1: 0.3, keys: [
          [0.11, 1.38, -0.64, 0.17, 0.22, 0.28],
          [0.16, 1.16, -0.58, 0.15, 0.24, 0.25],
          [0.18, 0.98, -0.52, 0.1, 0.15, 0.14],
          [0.186, 0.82, -0.6, 0.068, 0.09, 0.095],
          [xH, 0.65, -0.73, 0.048, 0.05, 0.075],
          [xH, 0.55, -0.75, 0.04, 0.04, 0.045],
          [xH, 0.4, -0.745, 0.036, 0.038, 0.034],
          [xH, 0.25, -0.73, 0.047, 0.052, 0.05],
          [xH, 0.17, -0.705, 0.036, 0.038, 0.034],
          [xH, 0.1, -0.68, 0.044, 0.045, 0.044],
          [xH, 0.04, -0.668, 0.056, 0.064, 0.054],
          [xH, 0.008, -0.665, 0.06, 0.07, 0.056],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.05, segs: 10, sub: 2, cap1: 2, capLen1: 0.3, keys: [
          [0.12, 1.26, 0.4, 0.11, 0.15, 0.16],
          [0.16, 1.08, 0.33, 0.095, 0.125, 0.125],
          [xF, 0.95, 0.28, 0.078, 0.092, 0.088],
          [xF, 0.75, 0.275, 0.056, 0.065, 0.055],
          [xF, 0.58, 0.285, 0.045, 0.05, 0.045],
          [xF, 0.5, 0.29, 0.05, 0.053, 0.048],
          [xF, 0.42, 0.29, 0.04, 0.042, 0.036],
          [xF, 0.3, 0.293, 0.036, 0.038, 0.034],
          [xF, 0.24, 0.3, 0.047, 0.052, 0.05],
          [xF, 0.17, 0.322, 0.036, 0.038, 0.034],
          [xF, 0.1, 0.345, 0.044, 0.045, 0.044],
          [xF, 0.04, 0.357, 0.056, 0.064, 0.054],
          [xF, 0.008, 0.36, 0.06, 0.07, 0.056],
        ] },
        // cupped, pointed ears
        { name: 'ear', mirror: true, bones: ['earL'], segs: 10, sub: 3, keys: [
          [0.06, 1.965, 1.075, 0.032, 0.024, 0.016],
          [0.068, 2.02, 1.08, 0.035, 0.022, 0.012],
          [0.076, 2.075, 1.088, 0.026, 0.016, 0.009],
          [0.08, 2.12, 1.098, 0.004, 0.004, 0.003],
        ] },
      ],
      accent: [
        // nostrils
        { kind: 'sphere', bone: 'head', c: [0.05, 1.432, 1.452], r: 0.02, s: [0.55, 1.25, 0.55], mirror: true, col: 0x0C0908 },
      ],
      accentRough: 0.5,
      eyes: [{ bone: 'head', p: [0.098, 1.81, 1.19], r: 0.024, dir: [0.88, 0.1, 0.45], iris: 0x2A160C, irisR: 0.92, pupil: 'h', pupilR: 0.42, rim: 0x0E0806, lidCol: 0x3A2014 }],
      mouth: [0, 1.36, 1.46],
      paint(P, C) {
        const fine = noise(P.x * 300, P.y * 300, P.z * 300);
        switch (P.part) {
          case 'body': case 'head': case 'jowl': {
            cset(C, K.bay);
            cmix(C, K.bayDk, sstep(0.5, 0.95, P.ny) * 0.45);
            cmix(C, K.bayHi, sstep(0.1, 0.6, Math.abs(P.nx)) * sstep(-0.3, 0.4, P.ny) * 0.35);
            // dapple sheen on the hindquarters and shoulder, darker along the belly and in the elbow and flank creases
            cmix(C, K.bayHi, sstep(0.7, 0.9, noise(P.x * 8, P.y * 8, P.z * 8)) * 0.12);
            cmix(C, K.bayDk, sstep(-0.6, -0.95, P.ny) * 0.4);
            if (P.part === 'body') {
              // black mane line along the crest
              cmix(C, K.black, sstep(0.55, 0.85, P.ny * 0.7 - P.nz * 0.7) * sstep(0.5, 0.62, P.z) * sstep(1.55, 1.65, P.y) * 0.8);
            }
            if (P.part === 'head') {
              const fr = P.ny * 0.66 + P.nz * 0.75;
              // dark soft muzzle, darker around the eyes, small white blaze down the face
              cmix(C, K.muzzle, sstep(1.36, 1.41, P.z) * 0.9);
              cmix(C, K.bayDk, sstep(1.62, 1.52, P.y) * 0.4);
              const bl = sstep(0.75, 0.9, fr) * sstep(0.03, 0.012, Math.abs(P.x)) * sstep(1.52, 1.6, P.y) * sstep(1.93, 1.85, P.y);
              cmix(C, K.white, bl);
              if (P.z > 1.38) { C.fl = 0.2; C.ro = 0.5; }
            }
            if (P.part === 'jowl') cmix(C, K.bayHi, sstep(0.2, 0.8, Math.abs(P.nx)) * 0.2);
            C.ro = P.part === 'head' && P.z > 1.38 ? 0.5 : 0.62;
            C.fl = 0.3;
            break;
          }
          case 'mane': case 'forelock': case 'tail': cset(C, K.black); cmix(C, K.blackHi, grain(P, 40, 80) * 0.6); C.ro = 0.55; C.fl = 1; break;
          case 'hleg': case 'fleg': {
            cset(C, K.bay);
            cmix(C, K.bayHi, sstep(0.0, 0.8, P.nx) * 0.2);
            cmix(C, K.bayDk, sstep(0.0, -0.8, P.nx) * sstep(1.1, 0.9, P.y) * 0.3);
            // black points below the knees and hocks
            cmix(C, K.black, sstep(P.part === 'fleg' ? 0.68 : 0.76, P.part === 'fleg' ? 0.58 : 0.66, P.y));
            const hf = sstep(0.105, 0.092, P.y);
            cmix(C, K.hoof, hf);
            cmix(C, mixc(K.hoof, hex(0x5A524A), 0.6), hf * sstep(0.55, 0.85, noise(P.x * 40, P.y * 300, P.z * 40)) * 0.5);
            C.ro = P.y < 0.1 ? 0.42 : 0.62;
            C.fl = P.y < 0.1 ? 0 : 0.25;
            break;
          }
          case 'ear': cset(C, K.bayDk); cmix(C, K.earIn, sstep(0.0, 0.6, P.nz)); cmix(C, K.black, sstep(0.09, 0.14, P.arc)); break;
        }
        if (P.part !== 'mane' && P.part !== 'tail' && P.part !== 'forelock') cmul(C, 0.94 + 0.1 * fine);
      },
      // foal: big head, short shallow body, legs nearly as long as a grown horse's
      baby: { head: 1.35, muzzle: 0.7, eye: 1.12, ear: 0.8, neck: [0.72, 1.1], body: [0.95, 0.9, 0.78], leg: [0.98, 1.05], tail: 0.45 },
      anim: {
        type: 'legged', walk: 1.8, trot: 3.6, canter: 5.6, run: 8.5, stride: 1.75, strideMax: 2.6,
        duty: [0.65, 0.47, 0.32], dutyC: 0.4, lift: [0.16, 0.13], flexF: 1.8, flexH: 1.1,
        gaits: { w: [0.25, 0.75, 0.0, 0.5], t: [0.5, 1.0, 0.0, 0.5], c: [0.32, 0.62, 0.0, 0.32], g: [0.45, 0.55, 0.0, 0.1] },
        bob: [0.014, 0.035, 0.055], pitchRun: 0.07, flexRun: 0.04, roll: 0.025,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.5, 0.32, 0.18], nod: 0.06, runNeck: 0.22, trotNeck: 0.06,
        eatPitch: 0.1, eatDrop: 0.06, chestEat: 0.06, eatElev: [-58, -82, -95], eatSplay: [0.12, 0.18],
        tail: ['tail1', 'tail2', 'tail3'], tailRun: [0.45, 0.25, 0.15], tailIdle: [0, 0, 0], tailSway: 0.08, tailFlick: 0.35, tailWalk: 0.06,
        mane: ['mane1', 'mane2'], ears: ['earL', 'earR'], floatDepth: 1.7, swimHead: -0.5, paddleR: 0.2,
        sleep: { style: 'fold', neck: [0.15, 0.55], tail: [0.5, 0.55] },
        wag: 0.3, happyHop: 0,
      },
    };
  };

  // ===== PIG (pink farm pig) =====
  SPEC.pig = () => {
    const xF = 0.12, xH = 0.12;
    const K = { pink: hex(0xE9AE9E), pinkLt: hex(0xF4CBBD), pinkDk: hex(0xC98476), patch: hex(0x8E6A5E), snout: hex(0xDD9488), nostril: hex(0x5A2A26), hoof: hex(0x7A6058), hair: hex(0xF3E6DC) };
    const curl = () => {
      const pts = [], radii = [];
      for (let i = 0; i <= 14; i++) {
        const u = i / 14, a = u * TAU * 1.6, r = 0.028 * (1 - u * 0.45);
        pts.push([Math.sin(a) * r, 0.53 + (1 - Math.cos(a)) * r * 0.6 + u * 0.03, -0.585 - u * 0.03 - Math.sin(a) * r * 0.2]);
        radii.push(lerp(0.011, 0.005, u));
      }
      return tubePart(pts, radii, 6, true);
    };
    return {
      size: { length: 1.2, height: 0.7, radius: 0.27, eyeHeight: 0.54 },
      tex: [256, 256], rough: 0.7,
      detail: { kind: 'skin', tile: 0.05, amt: 0.08, bump: 0.25, sheen: 0.18 },
      bones: [
        ['hips', null, 0, 0.44, -0.3],
        ['chest', 'hips', 0, 0.44, 0.2],
        ['neck', 'chest', 0, 0.46, 0.34],
        ['head', 'neck', 0, 0.48, 0.44],
        ['tail1', 'hips', 0, 0.52, -0.5],
        ['thighL', 'hips', xH, 0.38, -0.32, 1],
        ['shinL', 'thighL', xH, 0.2482, -0.25, 1],
        ['hmetaL', 'shinL', xH, 0.1561, -0.34, 1],
        ['hpawL', 'hmetaL', xH, 0.035, -0.32, 1],
        ['armL', 'chest', xF, 0.34, 0.26, 1],
        ['foreL', 'armL', xF, 0.23, 0.22, 1],
        ['fmetaL', 'foreL', xF, 0.1297, 0.25, 1],
        ['fpawL', 'fmetaL', xF, 0.035, 0.26, 1],
        ['earL', 'head', 0.08, 0.6, 0.48, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.06, segs: 16, cap0: 4, capLen0: 0.7, keys: [
          [0, 0.46, -0.52, 0.12, 0.12, 0.13],
          [0, 0.46, -0.45, 0.2, 0.2, 0.21],
          [0, 0.45, -0.3, 0.25, 0.24, 0.27],
          [0, 0.44, -0.05, 0.26, 0.245, 0.28],
          [0, 0.44, 0.18, 0.245, 0.235, 0.265],
          [0, 0.46, 0.33, 0.2, 0.2, 0.21],
          [0, 0.48, 0.44, 0.16, 0.16, 0.16],
        ] },
        // big wedge head with heavy jowls, ending in a straight snout cylinder
        { name: 'head', bones: ['head'], segs: 16, cap1: 1, keys: [
          [0, 0.49, 0.38, 0.15, 0.15, 0.16],
          [0, 0.5, 0.47, 0.135, 0.13, 0.175],
          [0, 0.485, 0.56, 0.105, 0.1, 0.13],
          [0, 0.46, 0.64, 0.076, 0.075, 0.085],
          [0, 0.445, 0.7, 0.062, 0.062, 0.064],
          [0, 0.44, 0.745, 0.06, 0.06, 0.06],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [0.08, 0.42, -0.33, 0.11, 0.15, 0.15],
          [0.105, 0.2883, -0.3, 0.09, 0.11, 0.11],
          [xH, 0.218, -0.31, 0.062, 0.068, 0.068],
          [xH, 0.1478, -0.33, 0.05, 0.052, 0.052],
          [xH, 0.07, -0.32, 0.043, 0.045, 0.045],
          [xH, 0.03, -0.3, 0.042, 0.04, 0.036],
          [xH, 0.01, -0.29, 0.04, 0.034, 0.024],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [0.08, 0.38, 0.25, 0.1, 0.14, 0.14],
          [0.105, 0.2673, 0.23, 0.08, 0.095, 0.095],
          [xF, 0.1993, 0.24, 0.058, 0.062, 0.062],
          [xF, 0.1297, 0.25, 0.048, 0.05, 0.05],
          [xF, 0.07, 0.26, 0.042, 0.044, 0.044],
          [xF, 0.03, 0.28, 0.042, 0.04, 0.036],
          [xF, 0.01, 0.29, 0.04, 0.034, 0.024],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.065, 0.6, 0.46, 0.052, 0.016, 0.012],
          [0.088, 0.652, 0.49, 0.066, 0.014, 0.01],
          [0.105, 0.698, 0.535, 0.055, 0.012, 0.009],
          [0.116, 0.728, 0.58, 0.028, 0.01, 0.007],
          [0.119, 0.736, 0.6, 0.004, 0.003, 0.003],
        ] },
      ],
      accent: [
        // snout disc with two nostrils
        { kind: 'loft', bone: 'head', segs: 16, col: 0xD98E84, cap1: 1, keys: [[0, 0.44, 0.742, 0.061, 0.061, 0.061], [0, 0.44, 0.762, 0.063, 0.062, 0.062]] },
        { kind: 'sphere', bone: 'head', c: [0.02, 0.437, 0.765], r: 0.011, s: [0.75, 1.15, 0.35], mirror: true, col: 0x4A2420 },
        { kind: 'raw', bone: 'tail1', make: curl, col: 0xE8A898 },
      ],
      accentRough: 0.55,
      eyes: [{ bone: 'head', p: [0.09, 0.53, 0.55], r: 0.0135, dir: [0.75, 0.25, 0.6], iris: 0x6A4A30, irisR: 0.8, pupilR: 0.42, lid: [0.55, -0.6, 0.25] }],
      mouth: [0, 0.385, 0.735],
      paint(P, C) {
        const fine = noise(P.x * 400, P.y * 400, P.z * 400);
        cset(C, K.pink);
        cmix(C, K.pinkLt, sstep(-0.2, -0.8, P.ny) * 0.5);
        cmix(C, K.pinkDk, sstep(0.6, 0.95, P.ny) * 0.2);
        if (P.part === 'body') {
          // a few soft darker patches on the back and flank
          const pt = fbm(P.x * 5 + 3, P.y * 5, P.z * 5, 3);
          cmix(C, K.patch, sstep(0.6, 0.72, pt) * sstep(-0.2, 0.3, P.ny) * 0.55);
        }
        if (P.part === 'head') {
          cmix(C, K.snout, sstep(0.64, 0.72, P.z) * 0.6);
          // pinker, rosier skin around the eyes and wrinkles over the snout
          const ex = Math.abs(P.x) - 0.091, ey = P.y - 0.53, ez = P.z - 0.55;
          cmix(C, K.pinkDk, sstep(0.03, 0.015, Math.sqrt(ex * ex + ey * ey + ez * ez)) * 0.35);
          cmix(C, K.pinkDk, sstep(0.6, 0.9, Math.sin(P.z * 380)) * sstep(0.62, 0.66, P.z) * sstep(0.72, 0.7, P.z) * sstep(0.2, 0.6, P.ny) * 0.4);
        }
        if (P.part === 'ear') { cmix(C, K.pinkDk, sstep(0.0, 0.6, -P.ny) * 0.4); cmix(C, hex(0xF0B8A8), sstep(0.0, 0.6, P.ny) * sstep(0.03, 0.08, P.arc) * 0.4); }
        if (P.part === 'hleg' || P.part === 'fleg') { cmix(C, K.hoof, sstep(0.05, 0.035, P.y)); cmix(C, K.pinkDk, sstep(0.12, 0.06, P.y) * sstep(0.05, 0.06, P.y) * 0.3); }
        // sparse pale bristles and a little mottling
        cmul(C, 0.95 + 0.07 * fine);
        cmix(C, K.hair, sstep(0.86, 0.95, noise(P.x * 900, P.y * 900, P.z * 900)) * 0.35);
        C.ro = P.part === 'head' && P.z > 0.7 ? 0.42 : 0.6;
      },
      baby: { head: 1.35, muzzle: 0.75, eye: 1.15, ear: 0.82, body: [1.05, 1.05, 0.85], leg: [0.85, 1.05], tail: 0.6 },
      // the sculpted piglet: a bigger head with a short snout and big ears on a short, round body
      modelSpec: { baby: { head: 1.52, muzzle: 0.58, eye: 1.12, ear: 1.0, body: [1.1, 1.12, 0.74], leg: [0.85, 0.95], tail: 0.6 } },
      anim: {
        type: 'legged', walk: 1.0, trot: 2.0, run: 4.0, stride: 0.55, strideMax: 2.2,
        duty: [0.64, 0.4, 0.38], lift: [0.05, 0.05], flexF: 1.2, flexH: 0.8,
        bob: [0.01, 0.022, 0.035], pitchRun: 0.06, flexRun: 0.05, roll: 0.05,
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.05, runNeck: 0.1, eatPitch: 0.12, eatElev: [-35, -70], eatY: 0.03,
        chew: 0.05, chewRate: 9,
        tail: ['tail1'], tailSway: 0.15, tailWalk: 0.1, wag: 0.6, ears: ['earL', 'earR'], earBack: 0.4, earSick: 0.3, earDroop: 0.1,
        floatDepth: 0.58, swimHead: -0.35,
        sleep: { style: 'fold', neck: [0.25, 0.4], tail: [0, 0], roll: 0.35, front: [0.35, 0.0, 0.2], hind: [0.2, -1.3, 0.25] },
      },
    };
  };

  // ===== GOAT (white and tan dairy goat) =====
  SPEC.goat = () => {
    const xF = 0.085, xH = 0.085;
    // Toggenburg colors: light brown coat, white face stripes, muzzle, ear rims, socks and rump
    const K = { white: hex(0xEFEBE2), cream: hex(0xD8CBB4), tan: hex(0x8A6440), tanDk: hex(0x5A3F28), hoof: hex(0x34302C), nose: hex(0x5A4A44), earIn: hex(0xD2B2A0), horn: 0x8C8070 };
    const horn = (x, y) => mixc(hex(0x5E554A), hex(0xB4A890), sstep(0.95, 1.04, y));
    return {
      size: { length: 1.1, height: 0.97, radius: 0.22, eyeHeight: 0.88 },
      tex: [256, 256], rough: 0.85,
      detail: { kind: 'fur', tile: 0.035, amt: 0.16, bump: 0.28, sheen: 0.28 },
      shell: { parts: ['body', 'head', 'beard', 'tail'], d1: ['beard'], n1: 2, len: 0.01, n: 3 },
      bones: [
        ['hips', null, 0, 0.6, -0.3],
        ['chest', 'hips', 0, 0.6, 0.2],
        ['neck', 'chest', 0, 0.66, 0.3],
        ['neck2', 'neck', 0, 0.75, 0.37],
        ['head', 'neck2', 0, 0.84, 0.41],
        ['horn', 'head', 0, 0.92, 0.42],
        ['tail1', 'hips', 0, 0.66, -0.46],
        ['thighL', 'hips', xH, 0.58, -0.31, 1],
        ['shinL', 'thighL', xH, 0.3983, -0.22, 1],
        ['hmetaL', 'shinL', xH, 0.3038, -0.36, 1],
        ['hpawL', 'hmetaL', xH, 0.06, -0.34, 1],
        ['armL', 'chest', xF, 0.54, 0.25, 1],
        ['foreL', 'armL', xF, 0.3911, 0.2, 1],
        ['fmetaL', 'foreL', xF, 0.24, 0.23, 1],
        ['fpawL', 'fmetaL', xF, 0.06, 0.23, 1],
        ['earL', 'head', 0.042, 0.912, 0.4, 1],
      ],
      fur: [
        // straight back, angular hips, deep barrel; slim neck
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.05, segs: 14, cap0: 3, capLen0: 0.7, keys: [
          [0, 0.625, -0.47, 0.05, 0.045, 0.05],
          [0, 0.625, -0.42, 0.12, 0.09, 0.14, 2.3],
          [0, 0.62, -0.3, 0.16, 0.12, 0.2, 2.3],
          [0, 0.6, -0.05, 0.17, 0.125, 0.235, 2.2],
          [0, 0.61, 0.15, 0.16, 0.135, 0.235, 2.2],
          [0, 0.645, 0.28, 0.12, 0.125, 0.16],
          [0, 0.72, 0.35, 0.074, 0.085, 0.095],
          [0, 0.8, 0.385, 0.058, 0.064, 0.066],
          [0, 0.87, 0.4, 0.05, 0.055, 0.052],
        ] },
        // wedge head, face sloping down, narrow muzzle
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.55, keys: [
          [0, 0.915, 0.385, 0.048, 0.045, 0.05],
          [0, 0.9, 0.43, 0.058, 0.045, 0.068],
          [0, 0.865, 0.48, 0.05, 0.038, 0.06],
          [0, 0.82, 0.525, 0.04, 0.032, 0.045],
          [0, 0.775, 0.565, 0.032, 0.028, 0.034],
          [0, 0.745, 0.59, 0.027, 0.025, 0.028],
        ] },
        { name: 'beard', bones: ['head'], segs: 8, cap1: 2, fuzz: 0.45, damt: 2.5, dtile: 0.5, keys: [
          [0, 0.762, 0.535, 0.016, 0.012, 0.012],
          [0, 0.715, 0.527, 0.014, 0.01, 0.011],
          [0, 0.67, 0.52, 0.006, 0.005, 0.005],
        ] },
        { name: 'tail', bones: ['tail1'], segs: 8, cap1: 2, keys: [
          [0, 0.65, -0.45, 0.02, 0.015, 0.015],
          [0, 0.69, -0.49, 0.024, 0.012, 0.016],
          [0, 0.745, -0.5, 0.012, 0.008, 0.01],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [0.055, 0.64, -0.32, 0.068, 0.115, 0.115],
          [0.075, 0.49, -0.28, 0.062, 0.088, 0.088],
          [xH, 0.3983, -0.24, 0.04, 0.046, 0.044],
          [xH, 0.3489, -0.3, 0.028, 0.033, 0.035],
          [xH, 0.3038, -0.36, 0.022, 0.025, 0.03],
          [xH, 0.18, -0.35, 0.018, 0.019, 0.019],
          [xH, 0.08, -0.34, 0.019, 0.021, 0.022],
          [xH, 0.03, -0.32, 0.018, 0.024, 0.017],
          [xH, 0.008, -0.305, 0.016, 0.02, 0.013],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.03, segs: 10, cap1: 2, keys: [
          [0.055, 0.58, 0.26, 0.05, 0.075, 0.075],
          [0.075, 0.4617, 0.22, 0.048, 0.06, 0.058],
          [xF, 0.384, 0.21, 0.034, 0.037, 0.035],
          [xF, 0.3195, 0.22, 0.025, 0.027, 0.025],
          [xF, 0.24, 0.23, 0.024, 0.026, 0.024],
          [xF, 0.14, 0.23, 0.018, 0.019, 0.019],
          [xF, 0.08, 0.232, 0.019, 0.021, 0.022],
          [xF, 0.03, 0.245, 0.018, 0.024, 0.017],
          [xF, 0.008, 0.258, 0.016, 0.02, 0.013],
        ] },
        // ears held out to the sides
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.04, 0.915, 0.4, 0.017, 0.012, 0.008],
          [0.075, 0.905, 0.402, 0.027, 0.011, 0.007],
          [0.11, 0.89, 0.398, 0.024, 0.009, 0.006],
          [0.135, 0.876, 0.392, 0.007, 0.005, 0.004],
        ] },
      ],
      accent: [
        { kind: 'tube', bone: 'horn', pts: [[0.024, 0.935, 0.43], [0.031, 0.98, 0.415], [0.038, 1.012, 0.385], [0.043, 1.027, 0.345], [0.043, 1.022, 0.31]], radii: [0.012, 0.0105, 0.0085, 0.006, 0.003], segs: 7, mirror: true, colFn: horn },
        // nostrils
        { kind: 'sphere', bone: 'head', c: [0.011, 0.752, 0.603], r: 0.0045, s: [0.6, 1.1, 0.4], mirror: true, col: 0x2A201C },
        // throat wattles
        { kind: 'tube', bone: 'neck2', mirror: true, pts: [[0.016, 0.7, 0.385], [0.019, 0.68, 0.392], [0.021, 0.66, 0.395]], radii: [0.006, 0.0075, 0.006], segs: 6, col: 0x96744E },
      ],
      accentRough: 0.5,
      eyes: [{ bone: 'head', p: [0.054, 0.9, 0.448], r: 0.0115, dir: [0.85, 0.15, 0.45], iris: 0xC79A3A, pupil: 'h', irisR: 0.9, pupilR: 0.44, lid: [0.6, -0.65, 0.2] }],
      mouth: [0, 0.73, 0.585],
      paint(P, C) {
        const fine = noise(P.x * 380, P.y * 380, P.z * 380);
        cset(C, K.tan);
        cmix(C, K.tanDk, sstep(0.5, 0.95, P.ny) * 0.35);
        cmix(C, K.cream, sstep(-0.3, -0.8, P.ny) * 0.35);
        switch (P.part) {
          case 'body': {
            // white rump around the tail, darker dorsal line
            cmix(C, K.white, sstep(-0.39, -0.45, P.z) * sstep(0.7, -0.1, P.ny) * 0.9);
            cmix(C, K.tanDk, sstep(0.9, 0.98, P.ny) * 0.4);
            break;
          }
          case 'head': {
            // two white stripes from above the eyes down the face, white muzzle, dark nose
            const fr = P.ny * 0.77 + P.nz * 0.64, sx = Math.abs(Math.abs(P.x) - 0.026);
            cmix(C, K.white, sstep(0.012, 0.006, sx) * sstep(-0.1, 0.35, fr) * sstep(0.42, 0.45, P.z) * sstep(0.56, 0.54, P.z));
            cmix(C, K.white, sstep(0.545, 0.565, P.z) * 0.9);
            cmix(C, K.nose, sstep(0.585, 0.6, P.z) * sstep(-0.3, 0.2, fr));
            if (P.z > 0.58) { C.ro = 0.45; C.fl = 0; }
            break;
          }
          case 'beard': cset(C, K.tanDk); cmix(C, K.tan, grain(P, 30, 60) * 0.4); C.fl = 1; break;
          case 'ear': cset(C, K.tan); cmix(C, K.earIn, sstep(0.0, 0.6, P.nz) * 0.6); cmix(C, K.white, sstep(0.07, 0.09, P.arc) * 0.8 + sstep(0.75, 0.95, Math.abs(P.sd)) * 0.7); C.fl = 0.2; break;
          case 'tail': cmix(C, K.white, sstep(0.0, -0.6, P.ny)); break;
          case 'hleg': case 'fleg': {
            cmix(C, K.white, sstep(P.part === 'fleg' ? 0.33 : 0.36, P.part === 'fleg' ? 0.27 : 0.3, P.y));
            cmix(C, K.white, sstep(0.1, -0.6, P.nx) * sstep(0.35, 0.45, P.y) * 0.6);
            cmix(C, K.hoof, sstep(0.045, 0.03, P.y));
            if (P.y < 0.04) { C.ro = 0.4; C.fl = 0; } else C.fl = 0.3;
            break;
          }
        }
        cmul(C, 0.92 + 0.12 * grain(P, 80, 30) + 0.04 * (fine - 0.5));
        if (C.ro > 0.5) C.ro = 0.86;
        if (P.part === 'body') C.fl = 0.6;
        if (P.part === 'head' && P.z <= 0.58) C.fl = 0.3;
      },
      baby: { head: 1.35, muzzle: 0.72, eye: 1.12, ear: 0.85, neck: [0.8, 1.1], body: [1.0, 1.05, 0.8], leg: [0.95, 1.05], tail: 0.7 },
      anim: {
        type: 'legged', walk: 1.2, trot: 2.4, run: 5.0, stride: 0.75, strideMax: 2.5,
        duty: [0.64, 0.413, 0.34], lift: [0.07, 0.06], flexF: 1.7, flexH: 1.0,
        gaits: { g: [0.06, 0.1, 0.0, 0.04] }, pronk: 0.09,
        bob: [0.008, 0.02, 0.03], pitchRun: 0.1, flexRun: 0.06, roll: 0.03,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.5, 0.3, 0.2], nod: 0.05, runNeck: 0.15,
        eatPitch: 0.12, eatDrop: 0.03, eatElev: [-60, -82, -95], eatSplay: [0.15, 0.1], chestEat: 0.05,
        chew: 0.06, chewRate: 7,
        tail: ['tail1'], tailIdle: [0.3], tailRun: [0.5], tailSway: 0.1, tailFlick: 0.6, wag: 0.8,
        ears: ['earL', 'earR'], earBack: 0.6, floatDepth: 0.7, swimHead: -0.45, happyHop: 0.12,
        sleep: { style: 'fold', neck: [1.2, 0.25], tail: [0, -0.2] },
      },
    };
  };

  // ===== OTTER (North American river otter) =====
  SPEC.otter = () => {
    const xF = 0.06, xH = 0.065;
    const K = { brown: hex(0x3E2B1E), brownHi: hex(0x60442F), dark: hex(0x221710), throat: hex(0xA8957C), belly: hex(0x52402F), nose: 0x1A1412 };
    return {
      size: { length: 1.1, height: 0.3, radius: 0.12, eyeHeight: 0.23 },
      tex: [256, 512], rough: 0.5, orm: true,
      detail: { kind: 'fur', tile: 0.02, amt: 0.12, bump: 0.22, sheen: 0.18 },
      bones: [
        ['hips', null, 0, 0.16, -0.12],
        ['chest', 'hips', 0, 0.13, 0.13],
        ['neck', 'chest', 0, 0.14, 0.25],
        ['head', 'neck', 0, 0.165, 0.32],
        ['tail1', 'hips', 0, 0.14, -0.27],
        ['tail2', 'tail1', 0, 0.11, -0.42],
        ['tail3', 'tail2', 0, 0.075, -0.56],
        ['thighL', 'hips', xH, 0.13, -0.13, 1],
        ['shinL', 'thighL', xH, 0.075, -0.09, 1],
        ['hmetaL', 'shinL', xH, 0.03, -0.14, 1],
        ['hpawL', 'hmetaL', xH, 0.01, -0.1, 1],
        ['armL', 'chest', xF, 0.105, 0.16, 1],
        ['foreL', 'armL', xF, 0.065, 0.145, 1],
        ['fmetaL', 'foreL', xF, 0.025, 0.16, 1],
        ['fpawL', 'fmetaL', xF, 0.01, 0.18, 1],
        ['earL', 'head', 0.052, 0.208, 0.3, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.04, segs: 14, keys: [
          [0, 0.145, -0.26, 0.066, 0.06, 0.06],
          [0, 0.158, -0.18, 0.084, 0.08, 0.078],
          [0, 0.162, -0.08, 0.09, 0.088, 0.084],
          [0, 0.148, 0.06, 0.086, 0.08, 0.078],
          [0, 0.138, 0.18, 0.076, 0.07, 0.068],
          [0, 0.152, 0.26, 0.068, 0.062, 0.064],
          [0, 0.166, 0.31, 0.064, 0.056, 0.056],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 2, cap1: 3, capLen1: 0.7, keys: [
          [0, 0.168, 0.275, 0.062, 0.056, 0.054, 2.2],
          [0, 0.176, 0.318, 0.07, 0.054, 0.05, 2.4],
          [0, 0.172, 0.365, 0.06, 0.042, 0.044, 2.4],
          [0, 0.163, 0.405, 0.047, 0.032, 0.036, 2.3],
          [0, 0.158, 0.432, 0.037, 0.026, 0.029, 2.2],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3'], blend: 0.03, segs: 12, cap1: 2, keys: [
          [0, 0.152, -0.17, 0.08, 0.075, 0.072],
          [0, 0.147, -0.24, 0.072, 0.066, 0.064],
          [0, 0.138, -0.3, 0.06, 0.052, 0.053],
          [0, 0.115, -0.42, 0.042, 0.034, 0.036],
          [0, 0.085, -0.55, 0.026, 0.021, 0.022],
          [0, 0.065, -0.66, 0.012, 0.011, 0.011],
          [0, 0.058, -0.71, 0.003, 0.003, 0.003],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.02, segs: 10, cap1: 2, keys: [
          [0.045, 0.14, -0.13, 0.04, 0.05, 0.05],
          [0.06, 0.1, -0.11, 0.032, 0.036, 0.036],
          [xH, 0.072, -0.095, 0.024, 0.026, 0.026],
          [xH, 0.045, -0.12, 0.019, 0.019, 0.019],
          [xH, 0.022, -0.135, 0.024, 0.012, 0.01],
          [xH, 0.012, -0.105, 0.028, 0.008, 0.007],
          [xH, 0.01, -0.07, 0.024, 0.007, 0.006],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.02, segs: 10, cap1: 2, keys: [
          [0.045, 0.125, 0.16, 0.034, 0.042, 0.042],
          [0.058, 0.09, 0.15, 0.026, 0.028, 0.028],
          [xF, 0.06, 0.148, 0.02, 0.021, 0.021],
          [xF, 0.035, 0.155, 0.017, 0.017, 0.017],
          [xF, 0.015, 0.17, 0.019, 0.01, 0.009],
          [xF, 0.01, 0.195, 0.016, 0.007, 0.006],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 2, cap1: 2, keys: [
          [0.05, 0.206, 0.3, 0.012, 0.009, 0.006],
          [0.06, 0.214, 0.296, 0.011, 0.008, 0.005],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 0.172, 0.444], r: 0.014, s: [1.35, 0.85, 0.7], col: 0x1A1412 },
        { kind: 'sphere', bone: 'head', c: [0.022, 0.156, 0.42], r: 0.016, s: [1.0, 0.75, 0.8], mirror: true, col: 0x8C7660 },
        ...[[0.012, 0.0], [0.016, -0.004], [0.02, -0.008]].map((w) => ({ kind: 'tube', bone: 'head', mirror: true, pts: [[0.03, 0.158 + w[1], 0.42], [0.055 + w[0], 0.156 + w[1], 0.415], [0.08 + w[0], 0.151 + w[1], 0.405]], radii: [0.0011, 0.0008, 0.0004], segs: 3, col: 0xD8D0C0 })),
      ],
      accentRough: 0.35,
      eyes: [{ bone: 'head', p: [0.049, 0.191, 0.36], r: 0.0088, dir: [0.7, 0.4, 0.6], iris: 0x1A120C, irisR: 0.95, pupilR: 0.55, lid: [0.75, -0.75, 0.15] }],
      mouth: [0, 0.148, 0.435],
      paint(P, C) {
        const fine = noise(P.x * 500, P.y * 500, P.z * 500);
        cset(C, K.brown);
        cmix(C, K.dark, sstep(0.5, 0.95, P.ny) * 0.35);
        cmix(C, K.brownHi, sstep(0.2, 0.7, Math.abs(P.nx)) * 0.25);
        cmix(C, K.belly, sstep(-0.3, -0.85, P.ny) * 0.6);
        if (P.part === 'head' || (P.part === 'body' && P.z > 0.16)) cmix(C, K.throat, sstep(-0.1, -0.6, P.ny) * sstep(0.16, 0.25, P.z));
        if (P.part === 'head') cmix(C, K.throat, sstep(0.38, 0.42, P.z) * sstep(0.1, -0.4, P.ny) * 0.8);
        if (P.part === 'hleg' || P.part === 'fleg') cmix(C, K.dark, sstep(0.05, 0.02, P.y) * 0.5);
        cmul(C, 0.93 + 0.1 * grain(P, 140, 40) + 0.04 * (fine - 0.5));
        // sleek wet-looking coat
        C.ro = 0.55 + 0.12 * fine; C.me = 0;
      },
      baby: { head: 1.4, muzzle: 0.75, eye: 1.12, ear: 1.0, body: [1.12, 1.12, 0.82], leg: [0.85, 1.15], tail: 0.6 },
      anim: {
        type: 'legged', walk: 0.8, trot: 1.6, run: 3.5, stride: 0.28, strideMax: 2.6,
        duty: [0.62, 0.45, 0.32], lift: [0.03, 0.03], flexF: 1.2, flexH: 0.7,
        gaits: { t: [0.5, 0.55, 0.0, 0.05], g: [0.42, 0.48, 0.0, 0.04] },
        bob: [0.004, 0.012, 0.02], pitchRun: 0.18, flexRun: 0.32, roll: 0.03,
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.04, runNeck: 0.15, eatY: 0.02, eatElev: [-35, -60], chew: 0.06, chewRate: 11,
        tail: ['tail1', 'tail2', 'tail3'], tailSway: 0.12, tailWalk: 0.1, tailRun: [0.05, 0.05, 0], tailIdle: [-0.18, -0.1, 0.05], ears: ['earL', 'earR'], earBack: 0.2,
        floatDepth: 0.15, swimHead: -0.3, swimPitch: -0.04, swimWave: 0.16, paddle: 1.5, tailSwim: 0.05,
        swimTuck: { f: [0.75, -0.25, 1.6, 0.7], h: [1.1, -0.95, -1.4, 0.9] },
        backFloat: { neck: 0.55 },
        sleep: { style: 'curl', neck: [2.4, 0.4], tail: [2.0, -0.05] },
        wag: 0.3,
      },
    };
  };

  // ===== HEDGEHOG =====
  SPEC.hedgehog = () => {
    const xF = 0.038, xH = 0.04;
    const K = { fur: hex(0x8C7258), furLt: hex(0xC2AE92), face: hex(0x7A604A), mask: hex(0x4A382A), skin: hex(0x5A4636), nose: 0x141010 };
    // spine coat: a dense brush of short three-sided spines on the upper dome, lying back toward the rump.
    // Dark at the root, cream at the tip (vertex colors).
    const spines = () => {
      const pos = [], idx = [], col = [], wts = [];
      const N = 1500, cBase = hex(0x2E2118), cTip = hex(0xEADCC0);
      for (let i = 0; i < N; i++) {
        // golden-spiral points on a sphere, kept to the upper dome
        const u = (i + 0.5) / N, th = Math.acos(1 - 2 * u), ph = i * 2.39996 + 0.3;
        const ny = Math.cos(th), sx = Math.sin(th) * Math.cos(ph), sz = Math.sin(th) * Math.sin(ph);
        const zc = -0.022 + sz * 0.1;
        if (zc > 0.074 || ny < -0.26 || (zc > 0.058 && ny < 0.25)) continue;
        const ry = 0.064, rx = 0.072;
        const base = new THREE.Vector3(sx * rx, 0.066 + ny * ry * (ny > 0 ? 1 : 0.8), zc);
        const n = new THREE.Vector3(sx, ny * 1.2, sz * 0.7).normalize();
        const j1 = hash3(i, 5, 9), j2 = hash3(i, 3, 1);
        const d = n.clone().multiplyScalar(0.38 + 0.2 * j2).add(new THREE.Vector3((j1 - 0.5) * 0.3, 0.05, -0.9)).normalize();
        const len = 0.014 + 0.007 * j1, r = 0.0017;
        const a1 = new THREE.Vector3().crossVectors(d, Math.abs(d.y) < 0.9 ? AY : AX).normalize(), a2 = new THREE.Vector3().crossVectors(d, a1);
        const b0 = pos.length / 3, tw = hash3(i, 2, 7) * TAU;
        for (let k = 0; k < 3; k++) {
          const a = tw + (k / 3) * TAU, q = base.clone().addScaledVector(a1, Math.cos(a) * r).addScaledVector(a2, Math.sin(a) * r);
          pos.push(q.x, q.y, q.z); col.push(cBase);
        }
        const tip = base.clone().addScaledVector(d, len);
        pos.push(tip.x, tip.y, tip.z); col.push(mixc(cTip, hex(0xB89C78), j2 * 0.5));
        for (let k = 0; k < 3; k++) idx.push(b0 + k, b0 + ((k + 1) % 3), b0 + 3);
        const z = base.z, w = z > 0.03 ? [['chest', 1 - sstep(0.03, 0.07, z)], ['neck', sstep(0.03, 0.07, z)]] : z > -0.06 ? [['hips', sstep(0.03, -0.01, z)], ['chest', sstep(-0.01, 0.03, z)]] : [['rump', sstep(-0.06, -0.1, z)], ['hips', 1 - sstep(-0.06, -0.1, z)]];
        for (let q = 0; q < 4; q++) wts.push(w);
      }
      const nrm = computeNormals(pos, idx);
      return { pos, nrm, idx, col, wts };
    };
    const sp = spines();
    return {
      size: { length: 0.25, height: 0.14, radius: 0.08, eyeHeight: 0.08 },
      tex: [256, 256], rough: 0.85,
      detail: { kind: 'fur', tile: 0.01, amt: 0.2, bump: 0.3, sheen: 0.25 },
      shell: { parts: ['body'], len: 0.008, n: 3, lean: 0.8 },
      bones: [
        ['hips', null, 0, 0.07, -0.025],
        ['rump', 'hips', 0, 0.07, -0.065],
        ['chest', 'hips', 0, 0.068, 0.025],
        ['neck', 'chest', 0, 0.062, 0.07],
        ['head', 'neck', 0, 0.06, 0.088],
        ['thighL', 'hips', xH, 0.045, -0.045, 1],
        ['shinL', 'thighL', xH + 0.002, 0.028, -0.035, 1],
        ['hmetaL', 'shinL', xH + 0.002, 0.012, -0.05, 1],
        ['hpawL', 'hmetaL', xH + 0.002, 0.004, -0.04, 1],
        ['armL', 'chest', xF, 0.045, 0.045, 1],
        ['foreL', 'armL', xF + 0.002, 0.028, 0.045, 1],
        ['fmetaL', 'foreL', xF + 0.002, 0.011, 0.05, 1],
        ['fpawL', 'fmetaL', xF + 0.002, 0.004, 0.056, 1],
        ['earL', 'head', 0.026, 0.084, 0.1, 1],
      ],
      fur: [
        { name: 'body', bones: ['rump', 'hips', 'chest', 'neck', 'head'], blend: 0.015, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.065, -0.115, 0.04, 0.035, 0.03],
          [0, 0.068, -0.09, 0.064, 0.058, 0.045],
          [0, 0.07, -0.03, 0.072, 0.064, 0.05],
          [0, 0.068, 0.03, 0.068, 0.06, 0.048],
          [0, 0.064, 0.07, 0.05, 0.045, 0.04],
          [0, 0.062, 0.09, 0.036, 0.034, 0.032],
        ] },
        { name: 'head', bones: ['head'], segs: 12, cap1: 3, capLen1: 0.6, keys: [
          [0, 0.064, 0.075, 0.034, 0.032, 0.03],
          [0, 0.062, 0.1, 0.033, 0.03, 0.028],
          [0, 0.056, 0.12, 0.022, 0.02, 0.019],
          [0, 0.051, 0.136, 0.013, 0.012, 0.012],
          [0, 0.049, 0.145, 0.008, 0.008, 0.008],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap1: 2, keys: [
          [xH - 0.008, 0.05, -0.045, 0.014, 0.016, 0.016],
          [xH, 0.03, -0.037, 0.01, 0.011, 0.011],
          [xH + 0.002, 0.013, -0.045, 0.008, 0.008, 0.008],
          [xH + 0.002, 0.005, -0.03, 0.009, 0.005, 0.004],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.006, segs: 8, cap1: 2, keys: [
          [xF - 0.008, 0.05, 0.045, 0.013, 0.015, 0.015],
          [xF, 0.03, 0.045, 0.009, 0.01, 0.01],
          [xF + 0.002, 0.012, 0.05, 0.0075, 0.0075, 0.0075],
          [xF + 0.002, 0.005, 0.062, 0.009, 0.005, 0.004],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 2, cap1: 2, keys: [
          [0.025, 0.082, 0.1, 0.008, 0.006, 0.004],
          [0.03, 0.09, 0.098, 0.008, 0.006, 0.004],
        ] },
      ],
      accent: [
        { kind: 'raw', make: () => sp, vcol: (v) => sp.col[v], weights: (v) => sp.wts[v], babyCol: 0xEFE6D6 },
        { kind: 'sphere', bone: 'head', c: [0, 0.05, 0.149], r: 0.0062, s: [1.2, 0.9, 0.8], col: 0x141010 },
      ],
      accentRough: 0.6,
      eyes: [{ bone: 'head', p: [0.021, 0.07, 0.11], r: 0.0056, dir: [0.8, 0.3, 0.5], iris: 0x140C08, irisR: 0.95, pupilR: 0.6, lid: [0.8, -0.8, 0.15] }],
      mouth: [0, 0.043, 0.142],
      paint(P, C) {
        const fine = noise(P.x * 900, P.y * 900, P.z * 900);
        cset(C, K.fur);
        cmix(C, K.furLt, sstep(-0.2, -0.7, P.ny) * 0.5);
        if (P.part === 'body') {
          // under the spines: dark, streaky so the coat reads dense
          const top = sstep(-0.45, -0.1, P.ny) * sstep(0.08, 0.062, P.z);
          const st = sstep(0.5, 0.8, noise(P.u * 220, P.arc * 45, 2.5));
          cmix(C, mixc(hex(0x34261C), hex(0xD8C8A8), st * 0.6), top);
          C.fl = top;
        } else C.fl = 0;
        if (P.part === 'head') {
          // brown face, darker mask around the eyes and down the snout
          cmix(C, K.face, 0.6);
          const ex = Math.abs(P.x) - 0.021, ey = P.y - 0.07, ez = P.z - 0.11;
          cmix(C, K.mask, sstep(0.016, 0.008, Math.sqrt(ex * ex + ey * ey + ez * ez)) * 0.7 + sstep(0.12, 0.14, P.z) * 0.5);
          cmix(C, hex(0x3A2A1E), sstep(0.3, 0.7, P.ny) * sstep(0.1, 0.085, P.z));
        }
        if (P.part === 'ear') cset(C, K.face);
        if (P.part === 'hleg' || P.part === 'fleg') cmix(C, K.skin, 0.85);
        cmul(C, 0.9 + 0.15 * grain(P, 300, 120) + 0.05 * (fine - 0.5));
        C.ro = 0.88;
      },
      baby: { head: 1.3, muzzle: 0.72, eye: 1.12, ear: 0.95, body: [1.04, 1.04, 0.92], leg: [0.85, 1.1] },
      babyAccent: true,
      anim: {
        type: 'legged', walk: 0.6, trot: 1.1, run: 2.0, stride: 0.075, strideMax: 2.2, maxRate: 12,
        duty: [0.6, 0.5, 0.42], lift: [0.008, 0.008], flexF: 0.9, flexH: 0.6,
        bob: [0.0015, 0.003, 0.005], pitchRun: 0.02, flexRun: 0.02, roll: 0.05,
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.05, eatY: 0.005, eatElev: [-35, -55], chew: 0.08, chewRate: 12,
        ears: ['earL', 'earR'], earBack: 0.2, floatDepth: 0.1, swimHead: -0.3, lookAmp: 0.6,
        sleep: { style: 'ball', spine: [0.05, 0.85, 0.7, 0.9, -1.35], tuck: 0.8, ballDrop: 0.0 },
      },
    };
  };

  // ===== RACCOON =====
  SPEC.raccoon = () => {
    const xF = 0.068, xH = 0.075;
    const K = { gray: hex(0x6E6862), grayLt: hex(0xA49C92), grayDk: hex(0x3A3632), black: hex(0x1A1817), white: hex(0xE6E2DA), buff: hex(0x9A8A74), leg: hex(0x34302C) };
    const fingers = (front) => {
      const out = [];
      const f0 = front ? [xF, 0.008, 0.155] : [xH, 0.008, -0.085];
      for (let i = 0; i < 5; i++) {
        const a = (-38 + i * 19) * DEG, L = front ? (i === 0 || i === 4 ? 0.022 : 0.03) : (i === 0 || i === 4 ? 0.016 : 0.022);
        out.push({ kind: 'tube', bone: front ? 'fpawL' : 'hpawL', mirror: true, pts: [[f0[0] + Math.sin(a) * 0.006, f0[1], f0[2] + 0.004], [f0[0] + Math.sin(a) * (L * 0.6), f0[1] - 0.002, f0[2] + Math.cos(a) * L * 0.6], [f0[0] + Math.sin(a) * L, f0[1] - 0.004, f0[2] + Math.cos(a) * L]], radii: [0.0045, 0.0038, 0.0028], segs: 4, col: 0x2A2624 });
      }
      return out;
    };
    return {
      size: { length: 0.8, height: 0.4, radius: 0.13, eyeHeight: 0.3 },
      tex: [256, 512], rough: 0.88,
      detail: { kind: 'fur', tile: 0.028, amt: 0.22, bump: 0.35, sheen: 0.3 },
      shell: { parts: ['body', 'head', 'tail'], d1: ['tail'], n1: 2, len: 0.014, n: 4 },
      bones: [
        ['hips', null, 0, 0.27, -0.12],
        ['chest', 'hips', 0, 0.23, 0.11],
        ['neck', 'chest', 0, 0.24, 0.19],
        ['head', 'neck', 0, 0.26, 0.25],
        ['tail1', 'hips', 0, 0.28, -0.26],
        ['tail2', 'tail1', 0, 0.24, -0.38],
        ['tail3', 'tail2', 0, 0.19, -0.49],
        ['thighL', 'hips', xH, 0.25, -0.13, 1],
        ['shinL', 'thighL', xH + 0.005, 0.14, -0.08, 1],
        ['hmetaL', 'shinL', xH + 0.005, 0.045, -0.16, 1],
        ['hpawL', 'hmetaL', xH, 0.008, -0.1, 1],
        ['armL', 'chest', xF, 0.19, 0.13, 1],
        ['foreL', 'armL', xF, 0.11, 0.11, 1],
        ['fmetaL', 'foreL', xF, 0.035, 0.135, 1],
        ['fpawL', 'fmetaL', xF, 0.008, 0.15, 1],
        ['earL', 'head', 0.045, 0.31, 0.24, 1],
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'head'], blend: 0.04, segs: 14, cap0: 3, capLen0: 0.7, fuzz: 0.1, fuzzFreq: 10, keys: [
          [0, 0.27, -0.27, 0.06, 0.06, 0.06],
          [0, 0.27, -0.22, 0.1, 0.1, 0.1],
          [0, 0.265, -0.12, 0.115, 0.115, 0.115],
          [0, 0.25, 0.0, 0.11, 0.105, 0.11],
          [0, 0.235, 0.1, 0.095, 0.09, 0.095],
          [0, 0.24, 0.18, 0.072, 0.07, 0.072],
          [0, 0.255, 0.24, 0.06, 0.058, 0.058],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 2, cap1: 3, capLen1: 0.6, keys: [
          [0, 0.27, 0.21, 0.058, 0.055, 0.052],
          [0, 0.275, 0.25, 0.068, 0.058, 0.052],
          [0, 0.265, 0.29, 0.052, 0.045, 0.042],
          [0, 0.25, 0.33, 0.03, 0.028, 0.028],
          [0, 0.243, 0.36, 0.016, 0.016, 0.016],
        ] },
        { name: 'tail', bones: ['hips', 'tail1', 'tail2', 'tail3'], blend: 0.03, segs: 12, cap1: 3, capLen1: 0.9, fuzz: 0.18, keys: [
          [0, 0.28, -0.22, 0.035, 0.035, 0.035],
          [0, 0.275, -0.28, 0.045, 0.045, 0.045],
          [0, 0.24, -0.38, 0.05, 0.05, 0.05],
          [0, 0.2, -0.48, 0.047, 0.047, 0.047],
          [0, 0.17, -0.57, 0.035, 0.035, 0.035],
        ] },
        { name: 'hleg', mirror: true, bones: ['hips', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.02, segs: 10, cap1: 2, keys: [
          [xH - 0.015, 0.28, -0.14, 0.045, 0.07, 0.07],
          [xH, 0.2, -0.11, 0.04, 0.05, 0.05],
          [xH + 0.005, 0.14, -0.085, 0.028, 0.03, 0.03],
          [xH + 0.005, 0.08, -0.13, 0.022, 0.022, 0.022],
          [xH + 0.005, 0.045, -0.165, 0.02, 0.016, 0.018],
          [xH, 0.018, -0.14, 0.024, 0.012, 0.012],
          [xH, 0.01, -0.09, 0.022, 0.009, 0.008],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.02, segs: 10, cap1: 2, keys: [
          [xF - 0.012, 0.22, 0.135, 0.04, 0.055, 0.055],
          [xF, 0.16, 0.125, 0.03, 0.035, 0.035],
          [xF, 0.11, 0.115, 0.022, 0.024, 0.024],
          [xF, 0.07, 0.125, 0.018, 0.018, 0.018],
          [xF, 0.035, 0.135, 0.017, 0.016, 0.016],
          [xF, 0.012, 0.148, 0.02, 0.009, 0.009],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.045, 0.305, 0.24, 0.02, 0.012, 0.008],
          [0.052, 0.33, 0.235, 0.019, 0.01, 0.007],
          [0.058, 0.35, 0.232, 0.01, 0.008, 0.005],
          [0.06, 0.356, 0.23, 0.002, 0.002, 0.002],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 0.244, 0.366], r: 0.009, s: [1.2, 0.8, 0.7], col: 0x101010 },
        ...fingers(true), ...fingers(false),
      ],
      accentRough: 0.45,
      eyes: [{ bone: 'head', p: [0.044, 0.283, 0.288], r: 0.0078, dir: [0.7, 0.25, 0.67], iris: 0x1A100A, irisR: 0.95, pupilR: 0.55, lidCol: 0x161412 }],
      mouth: [0, 0.232, 0.355],
      paint(P, C) {
        const fine = noise(P.x * 500, P.y * 500, P.z * 500);
        cset(C, K.gray);
        // grizzled guard hairs
        cmix(C, K.grayDk, sstep(0.45, 0.8, noise(P.x * 420, P.y * 420, P.z * 420)) * 0.35 + sstep(0.3, 0.9, P.ny) * 0.35);
        cmix(C, K.grayLt, sstep(0.6, 0.9, noise(P.x * 900 + 7, P.y * 900, P.z * 900)) * 0.4);
        cmix(C, K.buff, sstep(-0.3, -0.8, P.ny) * 0.4);
        switch (P.part) {
          case 'head': {
            // black bandit mask around the eyes sweeping back over the cheeks, white brows, white muzzle sides and chin,
            // dark stripe down the nose bridge, black nose
            const ex = Math.abs(P.x) - 0.045, ey = P.y - 0.283, ez = P.z - 0.288;
            const md = Math.sqrt(ex * ex * 1.2 + ey * ey * 2.9 + ez * ez * 0.55);
            const mask = sstep(0.037, 0.028, md) * sstep(0.004, 0.012, Math.abs(P.x));
            const brow = sstep(0.007, 0.002, Math.abs(ey - 0.019 + ez * 0.15)) * sstep(0.045, 0.025, Math.abs(ez + 0.005)) * sstep(0.008, 0.016, Math.abs(P.x));
            cmix(C, K.white, sstep(0.3, 0.32, P.z) * sstep(0.35, -0.1, P.ny) * sstep(0.008, 0.016, Math.abs(P.x)) * 0.85);
            cmix(C, K.white, sstep(-0.2, -0.6, P.ny) * sstep(0.26, 0.29, P.z) * 0.8);
            cmix(C, K.white, brow * 0.95);
            cmix(C, K.black, mask);
            cmix(C, K.grayDk, sstep(0.012, 0.004, Math.abs(P.x)) * sstep(0.26, 0.29, P.z) * sstep(0.0, 0.5, P.ny) * 0.9);
            cmix(C, K.black, sstep(0.348, 0.358, P.z) * sstep(-0.3, 0.2, P.ny));
            break;
          }
          case 'tail': {
            // five black rings, black tip
            const rg = fract(P.arc / 0.075 + 0.2);
            cset(C, K.buff); cmix(C, K.gray, 0.4);
            cmix(C, K.black, sstep(0.45, 0.55, rg) * sstep(1.0, 0.92, rg) + sstep(P.len - 0.05, P.len - 0.03, P.arc));
            break;
          }
          case 'hleg': case 'fleg': cmix(C, K.leg, sstep(0.17, 0.11, P.y)); break;
          case 'ear': cset(C, K.grayDk); cmix(C, K.white, sstep(0.026, 0.036, P.arc) * 0.9); cmix(C, K.white, sstep(0.0, 0.6, P.nz) * 0.4); break;
        }
        cmul(C, 0.92 + 0.12 * grain(P, 140, 40) + 0.04 * (fine - 0.5));
        C.ro = 0.88;
        C.fl = P.part === 'tail' ? 1 : P.part === 'body' ? 0.75 : P.part === 'head' ? 0.4 : 0.3;
      },
      baby: { head: 1.4, muzzle: 0.68, eye: 1.12, ear: 0.82, body: [1.1, 1.1, 0.82], leg: [0.75, 1.15], tail: 0.6 },
      anim: {
        type: 'legged', walk: 0.9, trot: 1.8, run: 3.4, stride: 0.34, strideMax: 2.4,
        duty: [0.66, 0.48, 0.36], lift: [0.03, 0.03], flexF: 1.2, flexH: 0.7,
        gaits: { g: [0.48, 0.55, 0.0, 0.08] },
        bob: [0.006, 0.014, 0.022], pitchRun: 0.12, flexRun: 0.12, roll: 0.06,
        neck: ['neck', 'head'], neckDist: [0.55, 0.45], nod: 0.04, runNeck: 0.1, eatY: 0.02, eatElev: [-45, -70], chew: 0.07, chewRate: 11,
        tail: ['tail1', 'tail2', 'tail3'], tailIdle: [-0.15, -0.05, 0], tailRun: [0.1, 0, 0], tailSway: 0.1, ears: ['earL', 'earR'], earBack: 0.5,
        floatDepth: 0.27, swimHead: -0.35, sitUp: 0.0,
        climb: { splay: 0.55, drop: 0.55, reach: 0.25, neck: -0.35, tail: [-0.3, -0.05, 0], flex: 0.2, toe: 0.8 },
        sleep: { style: 'curl', neck: [2.4, 0.5], tail: [2.1, 0.1] },
      },
    };
  };

  // ===== WEASEL (long-tailed weasel) =====
  ids.push('weasel');
  SPEC.weasel = () => {
    const xF = 0.0125, xH = 0.0135;
    const K = {
      back: hex(0x40240F), brown: hex(0x593216), warm: hex(0x70411D), cream: hex(0xEEDCA6), throat: hex(0xF3E7C2),
      tip: hex(0x15110F), foot: hex(0x46280F), ear: hex(0x52301A), earRim: hex(0xB89A72),
    };
    // whiskers: three a side from the muzzle
    const wh = [[0.0, 0.0, 0.024], [0.002, -0.0015, 0.022], [0.004, -0.003, 0.018]].map((w) => ({
      kind: 'tube', bone: 'head', mirror: true, segs: 3, col: 0x2A2019,
      pts: [[0.0057, 0.0825 + w[1], 0.157], [0.0057 + w[2] * 0.5, 0.0835 + w[1] + w[0], 0.155 - w[2] * 0.15], [0.0057 + w[2], 0.0825 + w[1] + w[0] * 2, 0.151 - w[2] * 0.35]],
      radii: [0.0004, 0.0003, 0.00015],
    }));
    return {
      size: { length: 0.38, height: 0.13, radius: 0.06, eyeHeight: 0.11 },
      tex: [256, 256], rough: 0.8,
      detail: { kind: 'fur', tile: 0.008, amt: 0.14, bump: 0.25, sheen: 0.3 },
      shell: { parts: ['body', 'head', 'tail'], len: 0.0042, n: 3, lean: 0.45, babyLen: 1.9 },
      bones: [
        ['hips', null, 0, 0.0485, -0.018],
        ['rump', 'hips', 0, 0.045, -0.062],
        ['chest', 'hips', 0, 0.046, 0.03],
        ['neck', 'chest', 0, 0.05, 0.064],
        ['neck2', 'neck', 0, 0.064, 0.085],
        ['head', 'neck2', 0, 0.084, 0.104],
        ['tail1', 'rump', 0, 0.043, -0.092],
        ['tail2', 'tail1', 0, 0.044, -0.13],
        ['tail3', 'tail2', 0, 0.047, -0.168],
        ['thighL', 'rump', xH, 0.038, -0.066, 1],
        ['shinL', 'thighL', xH + 0.0015, 0.0225, -0.054, 1],
        ['hmetaL', 'shinL', xH + 0.0015, 0.009, -0.0725, 1],
        ['hpawL', 'hmetaL', xH + 0.001, 0.0033, -0.06, 1],
        ['armL', 'chest', xF, 0.036, 0.04, 1],
        ['foreL', 'armL', xF + 0.001, 0.021, 0.033, 1],
        ['fmetaL', 'foreL', xF + 0.001, 0.007, 0.041, 1],
        ['fpawL', 'fmetaL', xF + 0.001, 0.0032, 0.049, 1],
        ['earL', 'head', 0.0118, 0.0958, 0.106, 1],
      ],
      fur: [
        // long slim tube: rounded rump, a hump over the loins, long neck rising to the head
        { name: 'body', bones: ['rump', 'hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.022, segs: 14, cap0: 3, capLen0: 0.8, keys: [
          [0, 0.042, -0.096, 0.0095, 0.009, 0.0095],
          [0, 0.0438, -0.085, 0.0155, 0.0155, 0.0155],
          [0, 0.047, -0.066, 0.0182, 0.0178, 0.0182],
          [0, 0.0515, -0.04, 0.0178, 0.0178, 0.0182],
          [0, 0.0525, -0.014, 0.0172, 0.0174, 0.0178],
          [0, 0.0505, 0.012, 0.0168, 0.0168, 0.0174],
          [0, 0.047, 0.036, 0.0166, 0.0164, 0.0178],
          [0, 0.0505, 0.057, 0.0154, 0.0152, 0.0164],
          [0, 0.0595, 0.074, 0.015, 0.0148, 0.0154],
          [0, 0.0715, 0.089, 0.0146, 0.0142, 0.0144],
          [0, 0.0835, 0.101, 0.0142, 0.0136, 0.0136],
        ] },
        // small flat head: broad cheeks, flat crown, short tapering muzzle held a little low
        { name: 'head', bones: ['head'], segs: 14, cap0: 2, cap1: 3, capLen1: 0.75, keys: [
          [0, 0.0875, 0.099, 0.0138, 0.0118, 0.012, 2.2],
          [0, 0.0898, 0.112, 0.0172, 0.013, 0.0122, 2.4],
          [0, 0.0893, 0.124, 0.0164, 0.0124, 0.0113, 2.5],
          [0, 0.0871, 0.137, 0.0132, 0.0101, 0.0095, 2.4],
          [0, 0.0846, 0.149, 0.009, 0.0077, 0.0073, 2.2],
          [0, 0.0824, 0.158, 0.0062, 0.0055, 0.0051, 2.1],
        ] },
        // tail about half the body length, carried low and straight, the black tip a little bushier
        { name: 'tail', bones: ['rump', 'tail1', 'tail2', 'tail3'], blend: 0.01, segs: 10, cap1: 3, capLen1: 1.1, fuzz: 0.06, keys: [
          [0, 0.0425, -0.084, 0.0085, 0.0085, 0.0085],
          [0, 0.043, -0.1, 0.0066, 0.0066, 0.0066],
          [0, 0.044, -0.128, 0.006, 0.006, 0.006],
          [0, 0.0455, -0.156, 0.0062, 0.0062, 0.0062],
          [0, 0.0475, -0.182, 0.0074, 0.0074, 0.0074],
          [0, 0.049, -0.203, 0.0068, 0.0068, 0.0068],
        ] },
        { name: 'hleg', mirror: true, bones: ['rump', 'thighL', 'shinL', 'hmetaL', 'hpawL'], blend: 0.004, segs: 10, cap1: 2, keys: [
          [xH - 0.004, 0.044, -0.069, 0.0105, 0.0125, 0.0125],
          [xH, 0.035, -0.064, 0.009, 0.0102, 0.0098],
          [xH + 0.0015, 0.0235, -0.0555, 0.0066, 0.007, 0.007],
          [xH + 0.0015, 0.0155, -0.064, 0.0053, 0.0053, 0.0053],
          [xH + 0.0015, 0.009, -0.072, 0.0047, 0.0045, 0.0045],
          [xH + 0.0015, 0.0042, -0.066, 0.0053, 0.0032, 0.003],
          [xH + 0.001, 0.0034, -0.055, 0.005, 0.003, 0.0028],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.004, segs: 10, cap1: 2, keys: [
          [xF - 0.003, 0.042, 0.042, 0.0088, 0.0105, 0.0105],
          [xF, 0.034, 0.039, 0.007, 0.0075, 0.0075],
          [xF + 0.001, 0.0215, 0.0335, 0.0055, 0.0057, 0.0057],
          [xF + 0.001, 0.0135, 0.0365, 0.0047, 0.0047, 0.0047],
          [xF + 0.001, 0.0068, 0.041, 0.0045, 0.0043, 0.0043],
          [xF + 0.001, 0.0035, 0.048, 0.0051, 0.0031, 0.0029],
          [xF + 0.001, 0.003, 0.0545, 0.0042, 0.0026, 0.0024],
        ] },
        // short broad rounded ears set low on the back corners of the head
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 2, cap1: 2, capLen1: 0.8, keys: [
          [0.0111, 0.0938, 0.1065, 0.0064, 0.0029, 0.0022],
          [0.0134, 0.0985, 0.1052, 0.0062, 0.0027, 0.002],
          [0.0152, 0.1021, 0.104, 0.0046, 0.0021, 0.0016],
        ] },
      ],
      accent: [
        // pink nose leather
        { kind: 'sphere', bone: 'head', c: [0, 0.0836, 0.1625], r: 0.0032, s: [1.3, 0.9, 0.75], col: 0xC98584 },
        ...wh,
      ],
      accentRough: 0.35,
      eyes: [{ bone: 'head', p: [0.0112, 0.0946, 0.1325], r: 0.0034, dir: [0.72, 0.36, 0.6], iris: 0x120B07, irisR: 0.95, pupilR: 0.55, lid: [0.78, -0.78, 0.15] }],
      mouth: [0, 0.0785, 0.157],
      paint(P, C) {
        const fine = noise(P.x * 900, P.y * 900, P.z * 900);
        // ragged but crisp edge between the brown back and the cream underside
        const wob = (noise(P.x * 260 + 3, P.y * 260, P.z * 260) - 0.5) * 0.12;
        cset(C, K.brown);
        cmix(C, K.back, sstep(0.35, 0.95, P.up) * 0.7);
        cmix(C, K.warm, sstep(0.55, 0.2, Math.abs(P.up - 0.05)) * 0.35);
        switch (P.part) {
          case 'body': {
            // the cream runs up the throat and the underside of the neck, then narrows to the belly
            const line = lerp(-0.5, -0.02, sstep(0.0, 0.07, P.z)) + wob;
            cmix(C, mixc(K.cream, K.throat, sstep(0.04, 0.09, P.z)), sstep(line + 0.035, line - 0.035, P.up));
            break;
          }
          case 'head': {
            // chin, lower jaw and upper lip cream; dark muzzle top and crown
            const line = lerp(-0.08, -0.32, sstep(0.119, 0.154, P.z)) + wob;
            cmix(C, K.throat, sstep(line + 0.04, line - 0.04, P.up));
            cmix(C, K.back, sstep(0.3, 0.8, P.up) * sstep(0.124, 0.149, P.z) * 0.5);
            break;
          }
          case 'tail':
            cmix(C, K.back, sstep(0.0, 0.8, P.up) * 0.4);
            cmix(C, K.tip, sstep(P.len - 0.05, P.len - 0.04, P.arc + wob * 0.05));
            break;
          case 'hleg': case 'fleg':
            cmix(C, K.foot, sstep(0.02, 0.008, P.y) * 0.7);
            if (P.part === 'fleg') cmix(C, K.cream, sstep(0.032, 0.042, P.y) * sstep(0.0, -0.6, P.nz) * 0.6);
            break;
          case 'ear':
            cset(C, K.ear);
            cmix(C, K.earRim, sstep(0.006, 0.01, P.arc) * 0.6);
            break;
        }
        cmul(C, 0.92 + 0.14 * grain(P, 300, 90) + 0.05 * (fine - 0.5));
        C.ro = 0.72 + 0.12 * fine;
        C.fl = P.part === 'tail' ? lerp(0.55, 1, sstep(P.len - 0.06, P.len - 0.03, P.arc)) : P.part === 'body' ? 0.7 : P.part === 'head' ? 0.35 : 0.25;
      },
      // kits: softer, grayer fuzz with a paler belly and a gray tail tip
      babyPaint(P, C) {
        const kit = hex(0x76604F), kitHi = hex(0x968070);
        const g = grain(P, 200, 60);
        const under = P.part === 'body' || P.part === 'head' ? sstep(-0.1, -0.5, P.up) : 0;
        cmix(C, mixc(kit, kitHi, g), 0.5 * (1 - under));
        cmix(C, hex(0xEDE3CC), under * 0.5);
        C.fl = Math.min(1, C.fl * 1.4 + 0.1);
      },
      baby: { head: 1.45, muzzle: 0.7, eye: 1.12, ear: 1.05, neck: [0.7, 1.15], body: [1.12, 1.12, 0.78], leg: [0.78, 1.18], tail: 0.6, fluff: 0.0012 },
      anim: {
        type: 'legged', walk: 1.1, trot: 2.0, run: 4.2, stride: 0.12, strideMax: 2.4, maxRate: 10,
        duty: [0.52, 0.42, 0.3], lift: [0.01, 0.012], flexF: 1.3, flexH: 0.8,
        // a low quick trot when walking; a bounding gallop with the front and hind feet in pairs
        gaits: { w: [0.5, 1.0, 0.0, 0.5], g: [0.5, 0.53, 0.0, 0.03] },
        bob: [0.0015, 0.0025, 0.013], pitchRun: 0.24, flexRun: 0.55, rumpFlex: 1.0, roll: 0.02, breathe: 0.0012,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], nod: 0.03, runNeck: 0.25, trotNeck: 0.12,
        eatY: 0.008, eatElev: [-35, -65, -80], chew: 0.06, chewRate: 14,
        tail: ['tail1', 'tail2', 'tail3'], tailRun: [0.05, 0.06, 0.06], tailFlex: 0.8, tailIdle: [-0.12, 0.06, 0.08], tailSway: 0.1, tailWalk: 0.1, tailFlick: 0.2,
        ears: ['earL', 'earR'], earBack: 0.4, lookAmp: 0.9,
        floatDepth: 0.06, swimHead: -0.5,
        // stands up on the hind legs now and then to look around
        sitUp: 1.15, sitDrop: 0.026, sitNeckD: [-0.8, 0.3, 0.42], sitPaws: [0.45, 0.3, 1.7], sitSome: 9, sitRump: 0.45,
        sleep: { style: 'curl', neck: [2.7, 0.45], tail: [2.6, -0.05], bend: 1.35, roll: 0.3, rumpBend: 0.55 }, wag: 0.2,
      },
    };
  };

  // ---------- age: baby proportions ----------
  // Every bone gets a baby map g(p) = c1 + M (p - c0): c0 is the adult pivot, c1 the baby pivot, M a 3x3 linear map
  // (row-major array). Child pivots ride on their parent's map so joints stay connected; the whole skeleton drops so the
  // shorter legs still reach the ground. The head map also shortens the muzzle (compresses along eye -> mouth).
  // Vertices get sum(w * g(p)) as a morph target, written relative to the bone offsets, so at runtime setAge only
  // lerps bone rest positions and sets one morph influence per mesh.
  const BABY_DEF = {
    head: 1.45, muzzle: 0.65, eye: 1.12, ear: 0.95, neck: [0.75, 1.12], body: [1.1, 1.1, 0.82], leg: [0.7, 1.18],
    tail: 0.55, wing: 0.45, fluff: 0, legAxis: true,
  };
  const ROLE_RX = [
    [/^(hips|chest|spine|rump|s\d+)$/, 'body'], [/^neck/, 'neck'], [/^head$/, 'head'], [/^ear[LR]$/, 'ear'],
    [/^(antler|horn)/, 'horn'], [/^tail/, 'tail'], [/^(thigh|shin|hmeta|hpaw|arm|fore|fmeta|fpaw)[LR]$/, 'leg'],
    [/^(wing|wfore|whand)[LR]$/, 'wing'], [/^f\d+[LR]$/, 'feather'],
  ];
  function boneRole(nm) { for (const r of ROLE_RX) if (r[0].test(nm)) return r[1]; return 'inherit'; }
  const m3 = {
    diag: (x, y, z) => [x, 0, 0, 0, y, 0, 0, 0, z],
    scale: (s) => [s, 0, 0, 0, s, 0, 0, 0, s],
    // scale by a along unit d and by b across it
    axis: (d, a, b) => [b + (a - b) * d.x * d.x, (a - b) * d.x * d.y, (a - b) * d.x * d.z, (a - b) * d.y * d.x, b + (a - b) * d.y * d.y, (a - b) * d.y * d.z, (a - b) * d.z * d.x, (a - b) * d.z * d.y, b + (a - b) * d.z * d.z],
    mul: (A, B) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j]; return o; },
  };
  // apply a bone map to p (Vector3), writing into out
  function babyApply(mp, p, out) {
    let x = p.x - mp.c0.x, y = p.y - mp.c0.y, z = p.z - mp.c0.z;
    if (mp.muz) {
      const u = mp.muz, k = (p.x - u.e.x) * u.d.x + (p.y - u.e.y) * u.d.y + (p.z - u.e.z) * u.d.z;
      if (k > 0) { const s = (1 - u.f) * k; x -= u.d.x * s; y -= u.d.y * s; z -= u.d.z * s; }
    }
    const M = mp.M;
    return out.set(mp.c1.x + M[0] * x + M[1] * y + M[2] * z, mp.c1.y + M[3] * x + M[4] * y + M[5] * z, mp.c1.z + M[6] * x + M[7] * y + M[8] * z);
  }
  function babyMaps(spec, defs, rest, boneIndex) {
    const B = Object.assign({}, BABY_DEF, spec.baby || {});
    const byName = {}, kids = {};
    for (const d of defs) { kids[d.name] = []; }
    for (const d of defs) if (d.parent) kids[d.parent].push(d.name);
    const eye = spec.eyes && spec.eyes[0] ? new THREE.Vector3(0, spec.eyes[0].p[1], spec.eyes[0].p[2]) : null;
    const mouth = new THREE.Vector3().fromArray(spec.mouth);
    const roleOf = (nm) => (B.roles && B.roles[nm]) || boneRole(nm);
    // segment direction of a chain bone: toward its first child of the same role (or away from its parent at a leaf)
    const segDir = (d) => {
      const r = roleOf(d.name), k = kids[d.name].find((c) => roleOf(c) === r) || (r === 'neck' ? kids[d.name].find((c) => roleOf(c) === 'head') : null);
      if (k) return rest[k].clone().sub(rest[d.name]).normalize();
      if (d.parent && roleOf(d.parent) === r) return rest[d.name].clone().sub(rest[d.parent]).normalize();
      return new THREE.Vector3(0, -1, 0);
    };
    const build = (drop) => {
      const maps = [];
      for (const d of defs) {
        const role = roleOf(d.name), par = d.parent ? byName[d.parent] : null, prole = d.parent ? roleOf(d.parent) : null;
        let L = null, inherit = false;
        switch (role) {
          case 'body': L = m3.diag(B.body[0], B.body[1], B.body[2]); break;
          case 'neck': L = m3.axis(segDir(d), B.neck[0], B.neck[1]); break;
          case 'head': L = m3.scale(B.head); break;
          case 'ear': L = m3.scale(B.ear); inherit = true; break;
          case 'horn': L = m3.scale(1 / B.head); inherit = true; break;
          case 'tail': if (prole === 'tail') inherit = true; else L = m3.scale(B.tail); break;
          case 'leg': L = B.legAxis ? m3.axis(segDir(d), B.leg[0], B.leg[1]) : m3.scale(B.leg[0]); break;
          case 'wing': if (prole === 'wing') inherit = true; else L = m3.scale(B.wing); break;
          default: inherit = true;
        }
        let M = L || m3.scale(1);
        if (inherit && par) M = L ? m3.mul(par.M, L) : par.M.slice();
        const c0 = rest[d.name].clone(), c1 = new THREE.Vector3();
        if (par) babyApply(par, c0, c1); else c1.copy(c0).add(_v1.set(0, -drop, 0));
        const mp = { name: d.name, role, c0, c1, M, muz: null };
        if (role === 'head' && eye && B.muzzle < 1) {
          const dir = mouth.clone().sub(eye); dir.x = 0;
          if (dir.lengthSq() > 1e-8) mp.muz = { e: eye.clone().addScaledVector(dir.clone().normalize(), -0.004), d: dir.normalize(), f: B.muzzle };
        }
        byName[d.name] = mp;
        maps.push(mp);
      }
      return maps;
    };
    let maps = build(0);
    // drop the skeleton so the (shorter) legs still reach the ground
    if (!B.noDrop) {
      let s = 0, n = 0;
      for (const mp of maps) if (mp.role === 'leg' && !kids[mp.name].some((c) => roleOf(c) === 'leg')) { s += mp.c1.y - mp.c0.y; n++; }
      const drop = n ? s / n : 0;
      if (Math.abs(drop) > 1e-5) { for (const k in byName) delete byName[k]; maps = build(drop); }
    }
    return { B, maps, byName };
  }
  // per-vertex baby offset for a skinned vertex: g(p) blended by weights, minus the bone offsets (morph is relative)
  const _bp = new THREE.Vector3(), _bs = new THREE.Vector3();
  function babyDelta(ag, p, n, four, out) {
    _bs.set(0, 0, 0); out.set(0, 0, 0);
    let wb = 0, role = '';
    for (let k = 0; k < 4; k++) {
      const w = four[k][1];
      if (w <= 0) continue;
      const mp = ag.maps[four[k][0]];
      babyApply(mp, p, _bp);
      out.addScaledVector(_bp, w);
      _bs.addScaledVector(mp.c1, w).addScaledVector(mp.c0, -w);
      if (w > wb) { wb = w; role = mp.role; }
    }
    out.sub(p).sub(_bs);
    // downy fluff for baby birds: puff the body out a little, unevenly
    if (ag.fluff && n && (role === 'body' || role === 'neck' || role === 'tail')) {
      const f = ag.fluff * (0.55 + 0.9 * noise(p.x * 90, p.y * 90, p.z * 90));
      out.x += n.x * f; out.y += n.y * f; out.z += n.z * f;
    }
    return out;
  }

  // ---------- shared behavior helpers ----------
  function blinkScale(t, rnd) {
    const period = 3.2 + rnd * 2.5, ph = fract(t / period + rnd * 7.1);
    const k = ph * period; // seconds into cycle
    if (k < 0.16) { const x = k / 0.16; return Math.max(0.12, Math.abs(1 - 2 * x)); }
    return 1;
  }
  // smooth pseudo-random look target that changes every few seconds
  function lookTarget(t, rnd, period, amp) {
    const k = Math.floor(t / period + rnd * 13), f = fract(t / period + rnd * 13);
    const a = (hash3(k, 7, (rnd * 1000) | 0) - 0.5) * 2, b = (hash3(k + 1, 7, (rnd * 1000) | 0) - 0.5) * 2;
    const s = sstep(0.0, 0.25, f);
    return lerp(a, b, s) * amp;
  }
  // critically damped spring toward target (exact solution, stable for any dt); S[k + 'V'] keeps the velocity.
  // r is comparable to the rate of damp(); the move starts and ends with zero velocity so blends never jerk.
  function spring(S, k, target, r, dt) {
    const w = r * 1.6, x = S[k], v = S[k + 'V'] || 0, c1 = x - target, c2 = v + w * c1, e = Math.exp(-w * dt);
    S[k] = target + (c1 + c2 * dt) * e;
    S[k + 'V'] = (c2 - w * (c1 + c2 * dt)) * e;
    return S[k];
  }
  function eatEnvelope(e) { return e > 0 ? sstep(0.0, 0.32, e) * (1 - sstep(0.8, 1.0, e)) : 0; }

  // ---------- shared leg IK ----------
  // names: [upper, lower, meta, paw?] bones, pole: knee direction hint in root space
  const _lk = new THREE.Vector3(), _la = new THREE.Vector3(), _lh = new THREE.Vector3(), _lm = new THREE.Vector3();
  const _lqp = new THREE.Quaternion(), _lqa = new THREE.Quaternion(), _lqb = new THREE.Quaternion(), _lqc = new THREE.Quaternion();
  // leg constants come from the rig's current rest skeleton (refreshed by setAge)
  function makeLeg(R, A, names, front, idx, pole) {
    const lg = {
      names, bs: names.map((n) => R.bones[n]), front, idx, hasPaw: names.length > 3,
      Pp: new THREE.Vector3(), m: new THREE.Vector3(), d0: new THREE.Vector3(), d1: new THREE.Vector3(), d2: new THREE.Vector3(),
      base: new THREE.Vector3(), L1: 0, L2: 0, hipH: 0,
      poleR: new THREE.Vector3().fromArray(pole).normalize(), pole: new THREE.Vector3().fromArray(pole).normalize(),
      side: names[0].endsWith('R') ? -1 : 1,
    };
    refreshLeg(lg, R.rest);
    return lg;
  }
  function refreshLeg(lg, rest) {
    const r = lg.names.map((n) => rest[n]), last = r.length - 1;
    lg.Pp.copy(r[last]); lg.L1 = r[0].distanceTo(r[1]); lg.L2 = r[1].distanceTo(r[2]);
    lg.m.copy(r[last]).sub(r[2]);
    lg.d0.copy(r[1]).sub(r[0]).normalize(); lg.d1.copy(r[2]).sub(r[1]).normalize(); lg.d2.copy(r[last]).sub(r[2]).normalize();
    lg.base.copy(r[0]); lg.hipH = r[0].y;
    lg.a0 = Math.atan2(lg.m.y, lg.m.z);
  }
  // ---------- moods: sick, happy, sneezes, sleep (shared by all animators) ----------
  function moodInit(S, rnd) {
    S.sick = 0; S.happy = 0; S.sleep = 0; S.snT = 9; S.snK = 0; S.snNext = 3 + rnd * 5; S.it = rnd * 40;
  }
  function moodUpdate(R, S, st, dt) {
    spring(S, 'sick', sat(+st.sick || 0), 1.6, dt);
    spring(S, 'happy', sat(+st.happy || 0), 4, dt);
    spring(S, 'sleep', st.mode === 'sleep' ? 1 : 0, 1.3, dt);
    if (R.sneezeReq) { R.sneezeReq = false; S.snT = 0; }
    else if (R.autoSneeze && (+st.sick || 0) > 0.5 && st.mode !== 'sleep') {
      S.snNext -= dt;
      if (S.snNext <= 0) { S.snT = 0; S.snK++; S.snNext = 5 + 6 * hash3(S.snK, 3, (R.rnd * 1000) | 0); if (R.onSneeze) R.onSneeze(R.rig); }
    }
    S.snT += dt;
    // idle clock: slower when sick, much slower asleep (breathing, looking around, ear and tail flicks)
    S.it += dt * (1 - 0.45 * S.sick) * (1 - 0.55 * S.sleep);
  }
  // head pitch offset over a sneeze: wind up (head lifts), a quick snap down, then recover
  function sneezeCurve(t) {
    if (t >= 0.95) return 0;
    if (t < 0.38) return -0.3 * sstep(0, 0.38, t);
    if (t < 0.46) return lerp(-0.3, 0.55, sstep(0.38, 0.46, t));
    return 0.55 * (1 - sstep(0.46, 0.95, t));
  }
  function eyeOpen(S, t, rnd) {
    const sn = S.snT < 0.6 ? 1 - 0.85 * sstep(0.3, 0.42, S.snT) * (1 - sstep(0.46, 0.6, S.snT)) : 1;
    return Math.max(0.07, blinkScale(t, rnd) * (1 - 0.42 * S.sick) * (1 - 0.94 * S.sleep) * sn);
  }
  // place the foot pivot at (tx, ty, tz) in root space; flx bends the metatarsus (about X), tq curls the paw/toes
  function solveLeg(lg, root, tx, ty, tz, flx, tq) {
    rootPos(lg.bs[0], root, _lh);
    rootQuat(lg.bs[0].parent, root, _lqp);
    _lm.copy(lg.m); rotX(_lm, flx);
    _la.set(tx - _lm.x, ty - _lm.y, tz - _lm.z);
    ik2(_lh, _la, lg.L1, lg.L2, lg.pole, _lk);
    aimBone(lg.bs[0], _lqp, _lh, _lk, lg.d0, _lqa);
    aimBone(lg.bs[1], _lqa, _lk, _la, lg.d1, _lqb);
    _v3.subVectors(_la, _lk).normalize().multiplyScalar(lg.L2).add(_lk);
    aimBone(lg.bs[2], _lqb, _v3, _v1.copy(_v3).add(_lm), lg.d2, _lqc);
    if (lg.hasPaw) orientX(lg.bs[3], _lqc, tq);
  }
  // mirror a left-side local quaternion to the right side (reflection across the YZ plane)
  function mirrorQ(src, dst) { dst.set(src.x, -src.y, -src.z, src.w); return dst; }

  // ---------- legged animator (quadrupeds, hoppers, sprawlers, turtle, otter, hedgehog) ----------
  // anim spec fields:
  //   walk, trot, run (m/s), canter (optional, m/s), stride (m per cycle at walk), strideMax, duty [walk, trot, run] (+ dutyC)
  //   gaits: { w, t, c, g: [LF, RF, LH, RH] phase offsets }
  //   lift [front, hind] swing height (m), flexF / flexH (swing flex rad), bob [walk, trot, run], pitchRun, flexRun, roll
  //   legs: optional custom [{ n: [upper, lower, meta, paw?], front, pole }] (L side; R mirrored automatically)
  //   hop: hopper poses in leg-height units; spine + wave: lateral body wave; neck, neckDist, tail..., ears
  //   climb: { splay, drop, reach, neck, tail: [x per tail bone], flex, toe } for climbers (mode 'climb')
  //   sleep: { style: curl | fold | loaf | ball | flat | shell | hunker, neck: [yaw, pitch], tail: [yaw, x], ... }
  //   swimWave (vertical body wave when swimming), backFloat (roll belly up when idle in water), mane (bones), pronk
  const SLEEP_DEF = {
    curl: { neck: [1.5, 0.35], tail: [1.9, 0.05], roll: 0.3, bend: 1.0, front: [0.45, 0.0, 0.3], hind: [0.3, 0, 0.3], ears: -0.5 },
    fold: { neck: [1.4, 0.35], tail: [0.15, 0.3], roll: 0.1, bend: 0.12, front: [0.02, 1.6, 1.5], hind: [0.32, 0, 0.28], ears: -0.4 },
    loaf: { neck: [0, 0.2], tail: [0, -0.1], roll: 0, bend: 0, front: [0.12, 1.3, 0.6], hind: [0.12, -1.3, 0.05], ears: -1.25 },
    ball: { neck: [0, 0], tail: [0, 0], roll: 0, bend: 0, front: [0, 0, 0], hind: [0, 0, 0], ears: -0.5 },
    flat: { neck: [0.35, 0.1], tail: [1.0, -0.05], roll: 0, bend: 0.15, front: [0, 0, 0], hind: [0, 0, 0], ears: 0 },
    shell: { neck: [0, 0.2], tail: [0.6, 0], roll: 0, bend: 0, front: [0, 0, 0], hind: [0, 0, 0], ears: 0 },
    hunker: { neck: [0, 0.15], tail: [0, 0], roll: 0, bend: 0, front: [0, 0, 0], hind: [0, 0, 0], ears: 0 },
    rest: { neck: [0, 0.1], tail: [0, 0], roll: 0, bend: 0, front: [0, 0, 0], hind: [0, 0, 0], ears: 0 },
  };
  function animLegged(R, A) {
    const P = A.spec.anim, B = R.bones, root = R.root;
    const S = { ph: R.rnd, sph: R.rnd * 3, spd: 0, move: 0, tw: 0, cw: 0, gw: 0, air: 0, swim: 0, eat: 0, lean: 0, up: 0, look: 0, lookP: 0, gt: 9, hopW: 0, wave: 0, ext: 0, climb: 0, back: 0, cph: R.rnd };
    moodInit(S, R.rnd);
    const legs = [];
    const LD = P.legs || [
      { n: ['armL', 'foreL', 'fmetaL', 'fpawL'], front: true, pole: [0, 0, -1] },
      { n: ['thighL', 'shinL', 'hmetaL', 'hpawL'], front: false, pole: [0, 0, 1] },
    ];
    for (const d of LD) {
      const base = d.front ? 0 : 2;
      legs.push(makeLeg(R, A, d.n, d.front, base, d.pole));
      legs.push(makeLeg(R, A, d.n.map((n) => mirrorBoneName(n, A.boneIndex)), d.front, base + 1, [-d.pole[0], d.pole[1], d.pole[2]]));
    }
    const G = P.gaits || {};
    const offW = G.w || [0.25, 0.75, 0.0, 0.5], offT = G.t || [0.5, 1.0, 0.0, 0.5], offC = G.c || [0.32, 0.62, 0.0, 0.32], offG = G.g || [0.52, 0.64, 0.0, 0.1];
    const neck = (P.neck || []).map((n) => B[n]), tail = (P.tail || []).map((n) => B[n]), ears = (P.ears || []).map((n) => B[n]);
    const spine = (P.spine || []).map((n) => B[n]), mane = (P.mane || []).map((n) => B[n]);
    for (const b of neck) b.rotation.order = 'YXZ';
    for (const b of tail) b.rotation.order = 'YXZ';
    const hips = B.hips, chest = B.chest, rump = B.rump, hip0 = hips.userData.p0;
    const neck0 = neck.length ? neck[0].userData.p0 : null;
    const nose = B.nose;
    const hop = P.hop, CL = P.climb || null, BF = P.backFloat || null;
    const SL = Object.assign({}, SLEEP_DEF[(P.sleep && P.sleep.style) || 'curl'], P.sleep || {});
    const sleepSide = R.rnd < 0.5 ? 1 : -1;
    const K = { legH: 0.3 };
    const refresh = () => { for (const lg of legs) refreshLeg(lg, R.rest); K.legH = legs[2] ? legs[2].hipH : 0.3; };
    refresh();
    R.hooks.push(refresh);
    const nN = neck.length, nT = tail.length;
    const Hp = new THREE.Vector3(), qSl = new THREE.Quaternion(), vSl = new THREE.Vector3();

    return function update(dt, st) {
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0;
      let mode = st.mode || 'ground';
      if (mode === 'climb' && !CL) mode = 'ground';
      const climbing = mode === 'climb', sleeping = mode === 'sleep', floatSleep = sleeping && BF && st.swimSleep;
      const spdSigned = climbing ? +st.speed || 0 : Math.max(0, +st.speed || 0), spdIn = Math.abs(spdSigned);
      const inAir = mode === 'air' || mode === 'fly';
      moodUpdate(R, S, st, dt);
      S.spd = damp(S.spd, sleeping ? 0 : spdIn, 5, dt);
      const spd = S.spd, it = S.it;
      spring(S, 'air', inAir ? 1 : 0, hop ? 14 : 9, dt);
      spring(S, 'swim', mode === 'swim' || floatSleep || (sleeping && st.swimSleep) ? 1 : 0, 4, dt);
      spring(S, 'climb', climbing ? 1 : 0, 5, dt);
      spring(S, 'move', spdIn > 0.04 && !sleeping ? 1 : 0, 4, dt);
      S.tw = damp(S.tw, sstep(P.walk * 1.1, P.trot, spd), 3, dt);
      S.cw = P.canter ? damp(S.cw, sstep(P.trot * 1.1, P.canter, spd), 3, dt) : 0;
      S.gw = damp(S.gw, sstep((P.canter || P.trot) * 1.15, P.run, spd), 3, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 8, dt);
      S.lean = damp(S.lean, clamp((st.turn || 0) * Math.max(spd, 0.5), -4, 4), 4, dt);
      spring(S, 'up', inAir ? clamp((st.vy || 0) / 1.2, -1, 1) : 0, 8, dt);
      S.gt = inAir ? 0 : S.gt + dt;
      // hoppers: right after landing (and before the next hop) keep the gathered crouch instead of running a gait
      spring(S, 'hopW', hop && S.gt < 0.6 && spdIn > 0.04 && !climbing ? 1 : 0, 10, dt);
      // otter: roll onto its back when resting in the water
      spring(S, 'back', BF && S.swim > 0.5 && ((st.idle || 0) > 1.5 || floatSleep) ? 1 : 0, 1.2, dt);
      const legH = K.legH, still = 1 - S.move, sl = S.sleep, sick = S.sick, hap = S.happy;
      const tw = S.tw, cw = S.cw, gw = S.gw, swim = S.swim, air = S.air * (1 - swim), clb = S.climb * (1 - sl);
      const back = S.back;
      const ground = (1 - S.air) * (1 - swim) * (1 - clb);
      const L = P.stride * clamp(Math.pow(Math.max(spd, 0.2) / P.walk, 0.5), 0.6, P.strideMax || 2);
      const dirn = climbing && spdSigned < 0 ? -1 : 1;
      S.ph += dirn * Math.min(spd / L, P.maxRate || 12) * dt;
      S.sph += (P.paddle || 1.4) * (0.6 + Math.min(spd, 2) * 0.4) * (1 - 0.7 * back) * dt;
      let duty = lerp(lerp(P.duty[0], P.duty[1], tw), P.duty[2], gw);
      if (P.canter) duty = lerp(lerp(lerp(P.duty[0], P.duty[1], tw), P.dutyC || 0.4, cw), P.duty[2], gw);
      duty = lerp(duty, 0.62, clb);
      const ph = S.ph, w2 = TAU * ph;
      const gaitOn = S.move * (ground + clb) * (1 - S.hopW) * (1 - sl);
      const sn = sneezeCurve(S.snT);

      // ----- body -----
      const walkW = (1 - tw) * (1 - gw), trotW = tw * (1 - gw) * (1 - cw);
      const runW = Math.max(gw, cw * 0.7);
      let bob = -P.bob[0] * walkW * Math.cos(2 * w2) - P.bob[1] * trotW * Math.cos(2 * TAU * (ph - duty * 0.5)) + P.bob[2] * runW * Math.sin(w2 + 0.6);
      if (P.pronk) bob += P.pronk * gw * Math.max(0, Math.sin(w2)) * (1 - clb);
      bob *= gaitOn * (1 - clb * 0.7);
      let pitch = runW * (P.pitchRun || 0) * Math.sin(w2 - 0.4) * gaitOn * (1 - clb);
      const flex = runW * (P.flexRun || 0) * Math.cos(w2 - 0.4) * gaitOn * (1 - clb);
      let roll = (P.roll || 0) * Math.sin(w2) * gaitOn * (1 - gw) + S.lean * -0.03 * (1 - swim) * (1 - clb);
      const br = Math.sin(it * (1.5 + R.rnd * 0.5) * (1 - 0.6 * sl) + R.rnd * 9);
      const breathe = br * (P.breathe || 0.004) * (1 - S.move * 0.7) * (1 + 1.5 * sl);
      // hop pitch, sit-up, eat pitch, swim pitch
      let hp = 0;
      if (hop) hp = (S.up > 0 ? lerp(0, hop.up.pitch, S.up) : lerp(0, hop.down.pitch, -S.up)) * air + S.hopW * (hop.gatherPitch || 0);
      let sitUp = (P.sitUp || 0) * still * ground * (1 - S.eat) * (1 - sl) * (1 - sick) * (0.7 + 0.3 * sstep(-0.3, 0.6, Math.sin(it * 0.21 + R.rnd * 40)));
      // sitSome (s): only stands up now and then while idle, once every s seconds or so
      if (P.sitSome) { const f = fract(it / P.sitSome + R.rnd * 5); sitUp *= sstep(1.0, 2.0, st.idle || 0) * sstep(0.0, 0.07, f) * (1 - sstep(0.38, 0.46, f)); }
      const eatP = S.eat * (P.eatPitch || 0) * ground;
      pitch += hp - sitUp + eatP + swim * (P.swimPitch == null ? -0.08 : P.swimPitch) * (1 - back);
      // swimming otter: vertical undulation travels down the body
      const sw = P.swimWave ? P.swimWave * swim * (1 - back) * (0.35 + 0.65 * S.move) : 0;
      // sleeping: belly on the ground
      const lieDrop = Math.max(0, R.belly.y - 0.006 - 0.04 * legH) * (1 + (SL.lift || 0));
      const hap2 = hap * (1 - sl);
      const happyBounce = (P.happyHop || 0) * hap2 * Math.abs(Math.sin(it * 6.5)) * legH;
      let drop = S.eat * (P.eatDrop || 0) * ground + S.hopW * (hop ? hop.gatherDrop || 0 : 0) - sitUp * (P.sitDrop || 0);
      drop += sick * 0.06 * legH * (1 - sl) - happyBounce;
      drop += clb * R.belly.y * (CL ? CL.drop : 0.6);
      if (P.pushups) drop -= P.pushups * ground * still * (1 - sl) * sstep(0.6, 0.9, Math.sin(it * 0.5 + R.rnd * 20)) * Math.max(0, Math.sin(it * 9));
      drop = lerp(drop, lieDrop, sl * (1 - swim));
      if (SL.style === 'ball') drop = lerp(drop, (SL.ballDrop || 0) * legH, sl);
      hips.position.set(hip0.x, hip0.y + bob + breathe * 0.5 - drop, hip0.z);
      // ball curl rolls the whole body forward
      const sp1 = SL.spine || null;
      const sleepRoll = (SL.roll || 0) * sleepSide * sl * (1 - swim);
      hips.rotation.set(
        lerp(pitch + sn * 0.12, sp1 ? sp1[0] : 0, sl) + sw * Math.sin(S.sph * TAU),
        S.lean * 0.04 * S.move - (SL.bend || 0) * sleepSide * sl * 0.35 + Math.sin(it * 15) * 0.05 * hap2 * (P.wiggle == null ? 1 : P.wiggle),
        roll * (1 - sl) + sleepRoll + PI * sstep(0, 1, back));
      if (chest) chest.rotation.set(
        lerp(flex + breathe * 0.6 + (P.chestEat || 0) * S.eat, sp1 ? sp1[1] : 0, sl) + sw * Math.sin(S.sph * TAU - 1.2) * 0.8 + breathe * 2 * sl,
        S.lean * 0.06 + (SL.bend || 0) * sleepSide * sl, -roll * 0.6 * (1 - sl));
      if (rump) rump.rotation.set(lerp(-flex * (P.rumpFlex == null ? 0.5 : P.rumpFlex) + sitUp * (P.sitRump || 0), sp1 ? sp1[4] || 0 : 0, sl), -(SL.rumpBend || 0) * sleepSide * sl * (1 - swim), 0);
      // lateral body wave (sprawlers): spine bones yaw with a traveling wave
      S.wave = damp(S.wave, (P.wave || 0) * (S.move * (1 - air) + swim * 0.8) * (1 - sl), 4, dt);
      for (let i = 0; i < spine.length; i++) {
        const ry = Math.sin(w2 - i * 0.9 + (P.wavePh || 0)) * S.wave * (i === 0 ? 1 : 1.2);
        if (spine[i] === hips) hips.rotation.y += ry; else spine[i].rotation.y = ry;
      }

      // ----- legs -----
      for (const lg of legs) {
        let off = lerp(lerp(offW[lg.idx], offT[lg.idx], tw), offG[lg.idx], gw);
        if (P.canter) off = lerp(lerp(lerp(offW[lg.idx], offT[lg.idx], tw), offC[lg.idx], cw), offG[lg.idx], gw);
        off = lerp(off, offT[lg.idx], clb);
        const p = fract(ph - off);
        let dz, dy, fl, toe;
        const lift = (lg.front ? P.lift[0] : P.lift[1]) * (1 + gw * 0.5);
        const flexA = lg.front ? P.flexF : P.flexH;
        if (p < duty) {
          const s = p / duty;
          dz = (0.5 - s) * duty * L; dy = 0;
          fl = lg.front ? lerp(-0.1, 0.2, s * s) : lerp(-0.15, 0.2, s);
          toe = sstep(0.65, 1, s) * (lg.front ? 0.5 : 0.6);
        } else {
          const s = (p - duty) / (1 - duty), e = sstep(0, 1, s);
          dz = (e - 0.5) * duty * L;
          dy = Math.sin(PI * Math.min(1, s * 1.15)) * lift;
          fl = Math.sin(PI * Math.min(1, s * 1.25)) * flexA + lerp(0.2, -0.1, e);
          toe = Math.sin(PI * Math.min(1, s * 1.2)) * (lg.front ? 1.1 : 0.8);
        }
        const side = lg.side;
        const sideOut = (P.splay || 0) * side;
        // grazers spread and push the front feet forward while eating
        const es = lg.front && P.eatSplay ? S.eat * ground : 0;
        let tx = lg.Pp.x + sideOut * dy * 0.5, ty = lg.Pp.y + dy * gaitOn, tz = lg.Pp.z + dz * gaitOn;
        if (es) { tx += side * P.eatSplay[0] * legH * es; tz += P.eatSplay[1] * legH * es; }
        let flx = fl * gaitOn, tq = toe * gaitOn;
        // hopper gathered crouch between hops
        if (hop && S.hopW > 0.001) {
          const gth = lg.front ? hop.gather.f : hop.gather.h;
          ty = lerp(ty, lg.Pp.y + gth[0] * legH, S.hopW); tz = lerp(tz, lg.Pp.z + gth[1] * legH, S.hopW); flx = lerp(flx, gth[2], S.hopW);
        }
        lg.pole.copy(lg.poleR);
        if (swim > 0.001) {
          let swx, swy, swz, swFl, swq;
          if (P.kick && !lg.front) {
            // frog: both hind legs kick together (fast extension back, slow recovery)
            const kp = fract(S.sph * P.kick.rate), ext = kp < 0.25 ? sstep(0, 0.25, kp) : 1 - sstep(0.25, 1, kp);
            const hp2 = hop.up.h, hm = hop.mid.h;
            swx = lg.Pp.x * lerp(1, 0.55, ext); swy = lg.Pp.y + lerp(0.25, hp2[0] * 0.3 + 0.2, ext) * legH; swz = lg.Pp.z + lerp(hm[1] * 0.2, hp2[1], ext) * legH;
            swFl = lerp(0.6, hp2[2], ext); swq = lerp(0.5, 1.4, ext);
          } else if (P.kick) {
            const kf = P.kick.f;
            swx = lg.Pp.x * 0.9; swy = lg.Pp.y + kf[0] * legH; swz = lg.Pp.z + kf[1] * legH; swFl = kf[2]; swq = 0.5;
          } else if (P.swimTuck) {
            // otter: front paws tucked to the chest, webbed hind feet trailing and sculling
            const tk = lg.front ? P.swimTuck.f : P.swimTuck.h, sc = lg.front ? 0 : Math.sin(S.sph * TAU + lg.idx * PI) * 0.25 * legH;
            swx = lg.Pp.x * tk[3]; swy = lg.Pp.y + tk[0] * legH + sc * 0.4; swz = lg.Pp.z + tk[1] * legH + sc; swFl = tk[2]; swq = lg.front ? 0.9 : 0.2;
          } else {
            // paddling: alternate diagonal pairs in a circle under the body
            const sp = fract(S.sph + (lg.idx === 0 || lg.idx === 3 ? 0 : 0.5));
            const sa = sp * TAU, rr = legH * (P.paddleR || 0.22);
            swz = lg.Pp.z + Math.cos(sa) * rr * (lg.front ? 1.1 : 0.9) + (lg.front ? 0.05 : -0.08) * legH;
            swy = lg.Pp.y + (Math.sin(sa) * 0.6 + 0.9) * rr;
            swx = lg.Pp.x + sideOut * legH * 0.3;
            swFl = (lg.front ? 0.6 : 0.4) + Math.sin(sa) * 0.45; swq = 0.7;
          }
          if (back > 0.001) {
            // floating on its back: front paws folded on the chest, hind feet up and out (root space, body rolled over)
            const by = hip0.y + (hip0.y - R.belly.y);
            const bx = lg.front ? -side * 0.022 : -side * legH * 0.45, bz = lg.front ? lg.base.z + legH * 0.55 : lg.base.z - legH * 0.15;
            const byy = lg.front ? by + legH * 0.12 : by - legH * 0.05;
            swx = lerp(swx, bx, back); swy = lerp(swy, byy, back); swz = lerp(swz, bz, back);
            swFl = lerp(swFl, lg.front ? 1.6 : -0.6, back); swq = lerp(swq, lg.front ? 1.2 : 0.1, back);
            _v2.set(-side * 0.6, -1, lg.front ? -0.4 : 0.4).normalize();
            lg.pole.lerp(_v2, back).normalize();
          }
          tx = lerp(tx, swx, swim); ty = lerp(ty, swy, swim); tz = lerp(tz, swz, swim); flx = lerp(flx, swFl, swim); tq = lerp(tq, swq, swim);
        }
        // air: hoppers take off / land poses, others tuck
        if (air > 0.001) {
          let ay, az, af, aq;
          if (hop) {
            const u = sat(S.up), d = sat(-S.up), m0 = 1 - u - d;
            const pu = lg.front ? hop.up.f : hop.up.h, pd = lg.front ? hop.down.f : hop.down.h, pm = lg.front ? hop.mid.f : hop.mid.h;
            ay = (pu[0] * u + pd[0] * d + pm[0] * m0) * legH; az = (pu[1] * u + pd[1] * d + pm[1] * m0) * legH;
            af = pu[2] * u + pd[2] * d + pm[2] * m0; aq = (lg.front ? 0.2 : 0.9) * u;
          } else {
            ay = legH * (lg.front ? 0.38 : 0.28); az = lg.front ? legH * 0.08 : -legH * 0.1; af = lg.front ? 1.7 : 0.8; aq = 1.0;
          }
          ty = lerp(ty, lg.Pp.y + ay, air); tz = lerp(tz, lg.Pp.z + az, air); flx = lerp(flx, af, air); tq = lerp(tq, aq, air);
        }
        // climbing: the trunk is the local ground plane; legs splay wide and reach, claws curled in
        if (clb > 0.001) {
          const reach = (CL.reach || 0.2) * legH * (lg.front ? 1 : -0.6);
          tx = lerp(tx, lg.Pp.x + side * CL.splay * legH, clb);
          tz = lerp(tz, lg.Pp.z + reach + dz * gaitOn * 1.15, clb);
          // paws wrap a little around the curve of the trunk (below the local ground plane)
          ty = lerp(ty, lg.Pp.y + dy * gaitOn * 0.8 - (CL.wrap == null ? 0.25 : CL.wrap) * legH, clb);
          flx = lerp(flx, (CL.flex || 0.3) + fl * gaitOn * 0.5, clb); tq = lerp(tq, CL.toe == null ? 0.7 : CL.toe, clb);
          _v2.set(side * 0.85, 0.55, lg.front ? -0.35 : 0.35).normalize();
          lg.pole.lerp(_v2, clb).normalize();
        }
        // sleeping: legs folded under the body
        if (sl > 0.001 && swim < 0.999) {
          let sx, sy, sz, sf, sq;
          if (SL.style === 'ball' || SL.style === 'shell' || SL.style === 'hunker') {
            const k = SL.tuck == null ? 0.45 : SL.tuck;
            sx = lerp(lg.Pp.x, lg.base.x, k); sy = lerp(lg.Pp.y, hip0.y - drop, k * 0.8); sz = lerp(lg.Pp.z, lg.base.z, k * 0.6) + (lg.front ? 1 : -1) * k * 0.05 * legH;
            sf = lerp(0.3, lg.front ? 1.4 : 0.9, k); sq = 0.8;
          } else if (SL.style === 'rest') {
            sx = lg.Pp.x; sy = lg.Pp.y; sz = lg.Pp.z; sf = 0; sq = 0;
          } else if (SL.style === 'flat') {
            sx = lg.Pp.x + side * 0.12 * legH; sy = lg.Pp.y; sz = lg.Pp.z + (lg.front ? 0.1 : -0.1) * legH; sf = 0; sq = 0.2;
          } else {
            // folded: hind metatarsus flat on the ground (hock behind, paw forward); front cannon tucked back or paws forward
            const fd = lg.front ? SL.front : SL.hind;
            sx = lg.Pp.x * (lg.front ? 0.92 : 1) + (lg.front ? 0 : side * fd[2] * legH);
            sy = lg.front && fd[1] > 1 ? lg.Pp.y * 0.45 : lg.Pp.y + 0.004;
            sz = lg.base.z + fd[0] * legH;
            sf = lg.front ? fd[1] : lg.a0 - 0.05;
            sq = lg.front ? fd[2] : 0.1;
          }
          // the sleeping targets ride on the (bent, rolled) body: offset from the leg root in its parent's frame
          rootPos(lg.bs[0], root, Hp); rootQuat(lg.bs[0].parent, root, qSl);
          vSl.set(sx - lg.base.x, sy - lg.base.y, sz - lg.base.z).applyQuaternion(qSl).add(Hp);
          if (sy < lg.base.y - legH * 0.5) vSl.y = Math.max(vSl.y, sy);
          if (lg.front && SL.style !== 'ball') { _v2.set(0, 0.75, -0.65); lg.pole.lerp(_v2, sl * (1 - swim)).normalize(); }
          const k = sl * (1 - swim);
          tx = lerp(tx, vSl.x, k); ty = lerp(ty, vSl.y, k); tz = lerp(tz, vSl.z, k); flx = lerp(flx, sf, k); tq = lerp(tq, sq, k);
        }
        // sitting up: front paws held up under the chin
        if (lg.front && P.sitPaws && sitUp > 0.001) {
          rootPos(lg.bs[0], root, Hp);
          const k = sitUp / P.sitUp, sp2 = P.sitPaws;
          tx = lerp(tx, lg.Pp.x * 0.8, k); ty = lerp(ty, Hp.y - legH * sp2[0], k); tz = lerp(tz, Hp.z + legH * sp2[1], k); flx = lerp(flx, sp2[2], k);
        }
        solveLeg(lg, root, tx, ty, tz, flx, tq);
      }

      // ----- neck and head -----
      const lookOn = sstep(1.0, 2.5, st.idle || 0) * (1 - S.eat) * (1 - air) * (1 - sl) * (1 - back * 0.5);
      S.look = damp(S.look, lookTarget(it, R.rnd, 3.7, P.lookAmp || 0.7) * lookOn * (1 - 0.5 * sick), 2.5, dt);
      S.lookP = damp(S.lookP, lookTarget(it + 11, R.rnd, 5.3, 0.16) * lookOn, 2, dt);
      const nod = (P.nod || 0.04) * Math.sin(2 * w2 + 0.5) * gaitOn * (1 - gw) + gw * 0.07 * Math.sin(w2 + 1.2) * gaitOn;
      const E = R.eat, eatA = lerp(E.eatA || 0, E.drinkA || 0, swim);
      const chew = Math.sin(t * (P.chewRate || 12)) * (P.chew || 0.06) * sstep(0.75, 0.95, S.eat);
      const runLow = gw * (P.runNeck || 0.25) * gaitOn + tw * (P.trotNeck || 0.06) * gaitOn;
      const hopNeck = hop ? (S.up * -0.25 * air) : 0;
      const tilt = Math.sin(it * 2.2) * 0.22 * hap2;
      for (let i = 0; i < nN; i++) {
        const d = P.neckDist[i], last = i === nN - 1;
        const eatRot = E.eatPose ? lerp(E.eatPose[i], E.drinkPose ? E.drinkPose[i] : d * eatA, swim) : d * eatA;
        let px = eatRot * S.eat + (runLow + nod + hopNeck) * d - (pitch + flex) * (i === 0 ? 1 : 0) * (1 - S.eat);
        px += swim * (P.swimHead == null ? -0.3 : P.swimHead) * d * (1 - S.eat) * (1 - back);
        px += S.lookP * d + sitUp * (P.sitNeckD ? P.sitNeckD[i] : (P.sitNeck || 0.5) * d);
        px += (sick * 0.38 + sn * (last ? 0.7 : 0.3) / Math.max(d, 0.2)) * d;
        px += clb * (CL && CL.neck != null ? CL.neck : -0.3) * d;
        px += back * (BF ? BF.neck : 0.5) * d;
        px -= sw * Math.sin(S.sph * TAU - 2.2) * (i === 0 ? 0.8 : 0);
        if (last) px += chew;
        let py = (S.look + S.lean * 0.05) * d;
        const sp = sl * (1 - swim * (BF ? 1 : 0));
        if (sp > 0.001) {
          const sx = (sp1 && sp1[2 + Math.min(i, 1)] != null && SL.style === 'ball') ? sp1[2 + Math.min(i, 1)] : SL.neck[1] * d;
          px = lerp(px, sx, sp); py = lerp(py, SL.neck[0] * sleepSide * d, sp);
        }
        neck[i].rotation.set(px, py, tilt * d);
      }
      // turtle style head extension (pulled in when asleep or sick)
      if (P.extend && neck0) {
        const tgtE = clamp(0.45 + S.move * 0.5 + S.eat + swim * 0.4 + lookOn * 0.4 * Math.sin(it * 0.3 + R.rnd * 9) - sick * 0.3, 0, 1) * (1 - sl);
        S.ext = damp(S.ext, tgtE, 2.5, dt);
        neck[0].position.set(neck0.x, neck0.y + P.extend[1] * S.ext, neck0.z + P.extend[0] * (S.ext - 1));
      }
      // ----- tail -----
      const wag = hap2 * (P.wag == null ? 0.45 : P.wag);
      for (let i = 0; i < nT; i++) {
        const k = i / Math.max(1, nT - 1);
        let sway = Math.sin(it * 1.3 + R.rnd * 20 + i * 0.6) * (P.tailSway || 0.1) * (0.4 + still * 0.6) + Math.sin(w2 + i * 0.7) * (P.tailWalk || 0.08) * gaitOn;
        if (P.wave) sway += Math.sin(w2 - (spine.length + i) * 0.9 + (P.wavePh || 0)) * S.wave * 1.3;
        if (P.tailFlick) sway += Math.sin(it * 9 + i) * P.tailFlick * sstep(0.93, 0.97, fract(it * 0.13 + R.rnd * 3)) * (1 - sstep(0.97, 1, fract(it * 0.13 + R.rnd * 3)));
        sway += Math.sin(t * 15 - i * 0.6) * wag * (0.6 + 0.6 * k);
        let lift = (P.tailRun ? P.tailRun[i] : 0) * (tw * 0.5 + gw) * gaitOn + (P.tailIdle ? P.tailIdle[i] : 0) * still + (P.tailAir ? P.tailAir[i] * air : 0);
        lift += swim * (P.tailSwim || 0.25) * (i === 0 ? 1 : 0) + sw * Math.sin(S.sph * TAU - 2 - i * 0.9) * 1.6;
        lift -= sick * (P.tailSick == null ? 0.25 : P.tailSick) * (i === 0 ? 1 : 0.3);
        lift += (P.tailHappy || 0) * hap2 * (i === 0 ? 1 : 0);
        // tailFlex: the tail base keeps level while the rump arches (bounding gait)
        if (P.tailFlex && i === 0) lift += P.tailFlex * flex;
        let tx2 = lift + bob * 2 * (1 + k), ty2 = sway - S.lean * 0.05;
        if (clb > 0.001) { tx2 = lerp(tx2, CL.tail ? CL.tail[i] || 0 : 0.1, clb); ty2 *= 1 - clb * 0.7; }
        if (sl > 0.001) { const ss = sl * (1 - swim); tx2 = lerp(tx2, SL.tail[1], ss); ty2 = lerp(ty2, -SL.tail[0] * sleepSide / nT + Math.sin(it * 0.7) * 0.02, ss); }
        tail[i].rotation.set(tx2, ty2, 0);
      }
      // ----- mane (horse): flops with the stride, streams back at speed -----
      for (let i = 0; i < mane.length; i++) {
        mane[i].rotation.set(-(gw * 0.12 + cw * 0.08 + tw * 0.04) * gaitOn + 0.04 * Math.sin(w2 * 2 - i) * gaitOn, 0, 0.12 * Math.sin(w2 + i * 0.8) * gaitOn + 0.05 * Math.sin(it * 0.9 + i));
      }
      // ----- ears -----
      for (let i = 0; i < ears.length; i++) {
        const sg = i === 0 ? 1 : -1, fp = fract(it * 0.23 + R.rnd * 5 + i * 0.37);
        const flick = fp < 0.04 ? Math.sin(fp * 25 * PI) : 0;
        let backE = (gw * 0.3 * gaitOn + air * (hop ? 0.5 : 0.2) + swim * 0.3) * (P.earBack || 1);
        backE += sick * (P.earSick == null ? 0.55 : P.earSick) - hap2 * 0.25 - S.eat * (P.earEat || 0);
        backE = lerp(backE, -SL.ears, sl);
        ears[i].rotation.set(-backE + flick * 0.4 + sn * 0.3, sg * S.look * 0.3, sg * (flick * 0.5 - backE * 0.4 + sick * (P.earDroop || 0.25)));
      }
      if (nose) nose.position.y = nose.userData.p0.y + Math.max(0, Math.sin(t * 14 + R.rnd * 5)) * 0.0025 * (sstep(0.3, 0.6, Math.sin(it * 0.8 + R.rnd * 3))) * (1 - sl);
      const eo = eyeOpen(S, it, R.rnd);
      setEyes(R, eo);
    };
  }

  // ---------- bird animator (duck, swan, chicken, owl, parrot) ----------
  function animBird(R, A) {
    const P = A.spec.anim, B = R.bones, root = R.root, W = P.wing;
    const S = { ph: R.rnd, fph: R.rnd * TAU, spd: 0, move: 0, rw: 0, air: 0, fly: 0, swim: 0, eat: 0, lean: 0, fold: 1, glide: 0, flap: 0, look: 0, lookP: 0, sph: R.rnd, climb: 0, hop: 0, gt: 9 };
    moodInit(S, R.rnd);
    const legs = [
      makeLeg(R, A, ['thighL', 'shinL', 'hmetaL', 'hpawL'], false, 0, [0, 0, 1]),
      makeLeg(R, A, ['thighR', 'shinR', 'hmetaR', 'hpawR'], false, 1, [0, 0, 1]),
    ];
    const neck = P.neck.map((n) => B[n]);
    for (const b of neck) b.rotation.order = 'YXZ';
    const hips = B.hips, hip0 = hips.userData.p0, tail = P.tail ? B[P.tail] : null;
    if (tail) tail.rotation.order = 'YXZ';
    const head = neck[neck.length - 1], head0 = head.userData.p0;
    const flyLegs = P.flyLegs || [-0.45, -0.6, 1.0];
    let legH = 0.1;
    const side = (s) => (W ? { sh: B['wing' + s], el: B['wfore' + s], wr: B['whand' + s], fs: W.fb.map((f) => B[f.name.slice(0, -1) + s]) } : null);
    const shP0 = W ? B.wingL.userData.p0 : null, fpo = W && W.foldedPos ? W.foldedPos : [0, 0, 0];
    const wl = side('L'), wr = side('R');
    // neck poses come from the rig's current rest skeleton (recomputed when the age changes):
    // eating on the ground (body pitched forward) and on the water (body dropped); flight, swim, stand from segment elevations
    const sp0 = P.standPitch || 0, nN = neck.length;
    let eatG = 0, eatW = 0, eatPG = null, eatPW = null, flyN = null, swimN = null, standN = null;
    const refresh = () => {
      for (const lg of legs) refreshLeg(lg, R.rest);
      legH = legs[0].hipH;
      const piv = P.neck.map((n) => R.rest[n].toArray()), mb = A.spec.mouthBone || 'head';
      const mouth = [R.rest[mb].x + R.mouth.position.x, R.rest[mb].y + R.mouth.position.y, R.rest[mb].z + R.mouth.position.z];
      const hp = R.rest.hips.toArray();
      eatG = solveDown(piv, mouth, P.neckDist, P.eatY == null ? 0.02 : P.eatY, P.eatMax || 2.2, [hp, (P.eatPitch || 0) + sp0, 0]);
      eatW = solveDown(piv, mouth, P.neckDist, 0.0, P.eatMax || 2.2, [hp, (P.swimEatPitch || 0.1) + sp0, (P.swimDrop || 0) - R.ageDrop]);
      eatPG = P.eatElev ? solveElev(piv, mouth, P.eatElev, P.eatY == null ? 0.02 : P.eatY, [hp, (P.eatPitch || 0) + sp0, P.eatDrop || 0]) : null;
      eatPW = P.drinkElev ? solveElev(piv, mouth, P.drinkElev, 0.0, [hp, (P.swimEatPitch || 0.1) + sp0, (P.swimDrop || 0) - R.ageDrop]) : null;
      const segs = piv.map((p0, i) => { const q = i + 1 < piv.length ? piv[i + 1] : mouth; return Math.atan2(q[1] - p0[1], q[2] - p0[2]); });
      const poseFromElev = (elev, bodyPitch) => {
        if (!elev) return piv.map(() => 0);
        const out = []; let prev = 0;
        for (let i = 0; i < segs.length; i++) { const c = segs[i] - bodyPitch - elev[i] * DEG; out.push(c - prev); prev = c; }
        return out;
      };
      flyN = poseFromElev(P.flyElev, P.flyPitch || 0); swimN = poseFromElev(P.swimElev, sp0 + (P.swimPitch || 0)); standN = poseFromElev(P.standElev, sp0);
    };
    refresh();
    R.hooks.push(refresh);
    // sleeping: head turned back and tucked onto the back ([pitch, yaw] per neck bone)
    const tuck = P.sleepNeck || neck.map((b, i) => (i === 0 ? [-0.5, 2.6] : [0.4, 0.15]));
    const sleepSide = R.rnd < 0.5 ? 1 : -1;
    const eS = new THREE.Euler(0, 0, 0, 'YZX'), eF = new THREE.Euler(0, 0, 0, 'YXZ');
    const qW = new THREE.Quaternion(), qF = new THREE.Quaternion(), qY = new THREE.Quaternion(), qC = new THREE.Quaternion();
    // spread orientation: twist about the span, then flap roll, then yaw. folded orientation: drape about the folded length, then pitch, then yaw.
    // the two are slerped by the fold amount. bodyPitch keeps the spread wing level in root space.
    function wingPose(w, mir, f, flapRoll, twist, g, bodyPitch) {
      const F = W.fold, sp = W.spread, fo = W.folded;
      eS.set(sp.pitch * DEG + twist, sp.yaw * DEG, sp.roll * DEG + flapRoll);
      eF.set(fo.pitch * DEG, fo.yaw * DEG, fo.roll * DEG + flapRoll * 0.3);
      qW.setFromEuler(eS); qF.setFromEuler(eF);
      qW.slerp(qF, f);
      qC.setFromAxisAngle(AX, -bodyPitch * (1 - f));
      qW.premultiply(qC);
      const k2 = Math.min(1, f + (1 - f) * g);
      qY.setFromAxisAngle(AY, F.hum * DEG * Math.min(1, f + (1 - f) * g * 0.3));
      w.sh.quaternion.multiplyQuaternions(qW, qY);
      w.el.quaternion.setFromAxisAngle(AY, F.elb * DEG * k2);
      w.wr.quaternion.setFromAxisAngle(AY, F.wri * DEG * k2);
      for (let i = 0; i < w.fs.length; i++) w.fs[i].quaternion.setFromAxisAngle(AY, W.fb[i].d * k2);
      w.sh.position.set(shP0.x + fpo[0] * f, shP0.y + fpo[1] * f, shP0.z + fpo[2] * f);
      if (mir) {
        mir.sh.position.set(-w.sh.position.x, w.sh.position.y, w.sh.position.z);
        mirrorQ(w.sh.quaternion, mir.sh.quaternion); mirrorQ(w.el.quaternion, mir.el.quaternion); mirrorQ(w.wr.quaternion, mir.wr.quaternion);
        for (let i = 0; i < w.fs.length; i++) mirrorQ(w.fs[i].quaternion, mir.fs[i].quaternion);
      }
    }

    return function update(dt, st) {
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0;
      let mode = st.mode || 'ground';
      if (mode === 'fly' && (!W || !P.canFly)) mode = 'air';
      if (mode === 'climb') mode = 'ground';
      const sleeping = mode === 'sleep', spdIn = sleeping ? 0 : Math.max(0, st.speed || 0);
      moodUpdate(R, S, st, dt);
      S.spd = damp(S.spd, spdIn, 5, dt);
      const spd = S.spd, it = S.it, sl = S.sleep, sick = S.sick, hap = S.happy * (1 - S.sleep);
      spring(S, 'fly', mode === 'fly' ? 1 : 0, 5, dt);
      spring(S, 'air', mode === 'air' ? 1 : 0, 9, dt);
      spring(S, 'swim', mode === 'swim' || (sleeping && st.swimSleep) ? 1 : 0, 4, dt);
      spring(S, 'move', spdIn > 0.04 ? 1 : 0, 5, dt);
      S.rw = damp(S.rw, sstep(P.walk, P.run, spd), 3, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 8, dt);
      S.lean = damp(S.lean, clamp((st.turn || 0) * Math.max(spd, 0.5), -4, 4), 4, dt);
      const vy = st.vy || 0;
      S.glide = damp(S.glide, mode === 'fly' && vy < -0.5 ? 1 : 0, 3, dt);
      S.climb = damp(S.climb, mode === 'fly' ? sat(vy / 2) : 0, 3, dt);
      // wings: spread when flying, half open and flapping during a jump for flightless use
      const flutter = hap * (P.canFly ? 0.22 : 0.3) * sstep(0.2, 0.8, Math.sin(it * 3.1)) * (1 - S.move);
      const wantFold = mode === 'fly' ? 0 : mode === 'air' ? 1 - (P.jumpFlap || 0) : 1 - flutter;
      spring(S, 'fold', wantFold, mode === 'fly' ? 6 : 4, dt);
      const fly = S.fly, swim = S.swim * (1 - fly), air = Math.max(S.air, fly), ground = (1 - air) * (1 - swim);
      const idle = st.idle || 0, still = 1 - S.move, sn = sneezeCurve(S.snT);

      // ----- gait phase -----
      const L = P.stride * clamp(Math.pow(Math.max(spd, 0.2) / P.walk, 0.5), 0.6, P.strideMax || 1.8);
      S.ph += Math.min(spd / L, P.maxRate || 12) * dt * (1 - air);
      S.sph += (1.3 + Math.min(spd, 2) * 0.6) * dt;
      const duty = lerp(P.duty[0], P.duty[1], S.rw), ph = S.ph, w2 = TAU * ph;
      const gaitOn = S.move * ground;

      // ----- flapping -----
      const rate = (P.wing && W.flap.rate) || 5, flapAmt = (1 - S.glide * 0.92) * (1 - S.fold);
      S.fph += TAU * rate * (1 + S.climb * 0.25 - S.glide * 0.3) * (1 + hap * (1 - fly) * 1.2) * dt;
      const fphase = S.fph;
      S.flap = damp(S.flap, flapAmt, 6, dt);
      const amp = W ? W.flap.amp * DEG * (1 + S.climb * 0.15) : 0;
      const droop = (sick * 0.16 + sl * 0.04) * (1 - fly);
      const flapRoll = W ? amp * Math.cos(fphase) * S.flap + S.glide * (1 - S.fold) * (W.flap.glide || 6) * DEG - droop : 0;
      const g = W ? Math.max(0, -Math.sin(fphase)) * W.flap.upFold * S.flap : 0;
      const twist = W ? Math.sin(fphase) * (W.flap.twist || 12) * DEG * S.flap : 0;

      // ----- body -----
      const sw = Math.sin(w2), cw = Math.cos(TAU * (ph - duty * 0.5));
      const bob = (-P.bob * Math.cos(2 * TAU * (ph - duty * 0.5)) * (1 + S.rw)) * gaitOn;
      const roll = -P.waddle * cw * gaitOn * (1 - S.rw * 0.4) - S.lean * 0.04 * (1 - swim) * (1 - fly) - S.lean * 0.12 * fly;
      const yaw = P.yawSway * sw * gaitOn;
      const br = Math.sin(it * (1.7 + R.rnd * 0.4) * (1 - 0.6 * sl) + R.rnd * 9) * 0.004 * still * (1 + 1.5 * sl);
      const flyBob = W ? -Math.sin(fphase) * (P.flyBob || 0.01) * S.flap * fly : 0;
      // happy: little bounces on the spot; sleeping: sit down on the belly (on land)
      const bounce = hap * still * ground * Math.abs(Math.sin(it * 7.5)) * legH * 0.22;
      let drop = swim * ((P.swimDrop || 0) - R.ageDrop) + S.eat * ground * (P.eatDrop || 0) + sick * legH * 0.08 * ground + bounce;
      drop = lerp(drop, Math.max(0, R.belly.y - 0.004) * (P.sitDrop == null ? 1 : P.sitDrop), sl * (1 - swim));
      const pitch = lerp(sp0, P.flyPitch == null ? 0 : P.flyPitch, fly) + S.eat * ((P.eatPitch || 0) * ground + (P.swimEatPitch || 0.1) * swim) + gaitOn * S.rw * (P.runPitch || 0.08) + swim * (P.swimPitch || 0) + sick * 0.12 * (1 - fly) - sl * sp0 * (P.sleepLevel || 0) + sn * 0.1;
      hips.position.set(hip0.x, hip0.y + bob + br + flyBob - drop, hip0.z);
      hips.rotation.set(pitch, yaw, roll);
      if (W) wingPose(wl, wr, S.fold, flapRoll, twist, g, pitch);

      // ----- legs -----
      for (const lg of legs) {
        const p = fract(ph - lg.idx * 0.5);
        let dz, dy, fl, tq;
        if (p < duty) { const s = p / duty; dz = (0.5 - s) * duty * L; dy = 0; fl = lerp(-0.05, 0.25, s); tq = sstep(0.75, 1, s) * 0.5; }
        else { const s = (p - duty) / (1 - duty), e = sstep(0, 1, s); dz = (e - 0.5) * duty * L; dy = Math.sin(PI * s) * P.lift * (1 + S.rw * 0.5); fl = Math.sin(PI * s) * P.flex; tq = Math.sin(PI * s) * 1.2; }
        const sd = lg.idx === 0 ? 1 : -1;
        let tx = lg.Pp.x, ty = lg.Pp.y + dy * gaitOn, tz = lg.Pp.z + dz * gaitOn;
        let flx = fl * gaitOn, tqq = tq * gaitOn;
        // swimming: feet paddle under the body (power stroke back with toes flat, recovery forward with toes folded)
        const sp = fract(S.sph + lg.idx * 0.5), sa = sp * TAU;
        const pw = sp < 0.5 ? 1 : 0;
        const swY = -drop + legH * (P.paddleY || 0.35) + Math.sin(sa) * legH * 0.08, swZ = lg.Pp.z + Math.cos(sa) * legH * (P.paddleZ || 0.3);
        tx = lerp(tx, lg.Pp.x + sd * legH * 0.08, swim); ty = lerp(ty, swY, swim); tz = lerp(tz, swZ, swim);
        flx = lerp(flx, 0.5 + Math.sin(sa) * 0.3, swim); tqq = lerp(tqq, pw ? 0.3 : 1.6, swim);
        // sitting asleep: tarsus folded flat under the body
        if (sl > 0.001 && swim < 0.999) {
          const k = sl * (1 - swim);
          ty = lerp(ty, lg.Pp.y, k); tz = lerp(tz, lg.Pp.z + legH * 0.22, k); tx = lerp(tx, lg.Pp.x * 1.05, k);
          flx = lerp(flx, -1.35, k); tqq = lerp(tqq, -0.05, k);
        }
        // air: legs tucked (jump) or trailing (flight)
        // flight: feet tucked relative to the hip joint [dy, dz in leg heights, toe curl]; jump: feet pulled up off the ground
        if (air > 0.001) {
          const fl2 = flyLegs, fk = fly / Math.max(air, 1e-3);
          rootPos(lg.bs[0], root, _v2);
          const jy = lg.Pp.y + legH * 0.3, jz = lg.Pp.z + legH * 0.05;
          const fy = _v2.y + legH * fl2[0], fz = _v2.z + legH * fl2[1];
          tx = lerp(tx, lg.Pp.x * 0.8, air); ty = lerp(ty, lerp(jy, fy, fk), air); tz = lerp(tz, lerp(jz, fz, fk), air);
          flx = lerp(flx, lerp(1.2, P.flyFlex || 1.5, fk), air); tqq = lerp(tqq, lerp(1.0, fl2[2], fk), air);
        }
        solveLeg(lg, root, tx, ty, tz, flx, tqq);
      }

      // ----- neck and head -----
      const lookOn = sstep(1.0, 2.5, idle) * (1 - S.eat) * (1 - fly) * (1 - sl);
      S.look = damp(S.look, lookTarget(it, R.rnd, P.lookPeriod || 3.1, P.lookAmp || 0.8) * lookOn * (1 - 0.6 * sick), P.lookRate || 3, dt);
      S.lookP = damp(S.lookP, lookTarget(it + 11, R.rnd, 4.3, 0.2) * lookOn, 2, dt);
      const peck = P.peck ? P.peck * Math.max(0, Math.sin(t * P.peckRate * TAU)) * sstep(0.7, 0.95, S.eat) : 0;
      const eatA = lerp(eatG, eatW, swim);
      let sum = 0;
      const gaitPitch = gaitOn * S.rw * (P.runPitch || 0.08);
      const poseW = 1 - S.eat * (1 - swim);
      for (let i = 0; i < neck.length; i++) {
        const d = P.neckDist[i], last = i === neck.length - 1;
        const dyn = d * S.lookP + d * (P.walkNeck || 0.04) * gaitOn * Math.sin(2 * w2) + (P.peck ? peck * (last ? 0.6 : 0.2) : 0);
        const eg = eatPG ? eatPG[i] : d * eatG, ew = eatPW ? eatPW[i] : d * eatW;
        let px = lerp(eg, ew, swim) * S.eat + (flyN[i] * fly + swimN[i] * swim) * poseW + standN[i] * (1 - fly) * (1 - swim) * (1 - S.eat) + dyn;
        if (!last) sum += dyn;
        else px -= (sum + gaitPitch) * (1 - S.eat) * (1 - fly);
        px += sick * 0.3 * d + sn * (last ? 0.7 : 0.3) + (last ? Math.sin(it * 9) * 0.06 * hap : 0);
        let py = (S.look + S.lean * 0.05) * (P.lookDist ? P.lookDist[i] : d);
        if (sl > 0.001) { px = lerp(px, tuck[i][0], sl); py = lerp(py, tuck[i][1] * sleepSide, sl); }
        neck[i].rotation.set(px, py, last ? Math.sin(it * 2.6) * 0.25 * hap : 0);
      }
      // chicken style head bob: head holds still in space then thrusts forward
      if (P.headBob) {
        const q = fract(2 * ph), A2 = 0.175 * L * P.headBob;
        const off = q < 0.7 ? A2 * (1 - (2 * q) / 0.7) : -A2 + 2 * A2 * sstep(0.7, 1, q);
        head.position.set(head0.x, head0.y, head0.z + off * gaitOn * (1 - S.eat) * (1 - sl));
      }
      // ----- tail -----
      if (tail) {
        const wag = Math.max(sstep(0.0, 0.05, fract(it * 0.11 + R.rnd * 3)) * (1 - sstep(0.05, 0.1, fract(it * 0.11 + R.rnd * 3))), hap);
        tail.rotation.set(fly * (P.flyTail || 0) + (1 - fly) * (1 - swim) * (P.standTail || 0) - S.eat * 0.2 + swim * (P.swimTail || 0.1) + bob * 3 - sick * 0.25 + sl * (P.sleepTail || 0),
          Math.sin(t * 22) * (P.tailWag || 0.15) * wag + yaw * -1.5 + S.lean * 0.1 * fly, 0);
      }
      const eo = eyeOpen(S, it, R.rnd);
      setEyes(R, eo);
    };
  }

  // ---------- snake animator ----------
  // Each body bone is a root-level bone placed on a curve x(s) = A * sin(k * s - phase) (s = distance back from the head).
  // When moving, the phase advances with the distance traveled so the wave stays fixed relative to the ground (no sliding):
  // every point of the body follows the same track. Amplitude grows with speed; idle keeps a gentle S-curve.
  function animSnake(R, A) {
    const P = A.spec.anim, B = R.bones, names = P.names, N = names.length;
    const segs = names.map((n) => B[n]), head = B.head, tongue = R.extras.tongue;
    const z0 = P.z0, dz = P.dz, y0 = SNAKE_R;
    const S = { ph: R.rnd * TAU, amp: 0.05, spd: 0, swim: 0, eat: 0, air: 0, lean: 0, look: 0, k: 0, lift: 0 };
    moodInit(S, R.rnd);
    const xs = new Float32Array(N + 1), zs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
    const NZ = new THREE.Vector3(0, 0, -1);
    // resting coil: a flat spiral from the tail at the center outward, with the head brought back on top of the coils
    const cx = new Float32Array(N + 1), cz = new Float32Array(N + 1), cy = new Float32Array(N + 1);
    {
      const Ls = N * dz, b = (2.15 * SNAKE_R) / TAU, r0 = 0.018, side = R.rnd < 0.5 ? 1 : -1;
      for (let i = 0; i <= N; i++) {
        const s = i * dz, u = Ls - s, th = (-r0 + Math.sqrt(r0 * r0 + 2 * b * u)) / b;
        let r = r0 + b * th;
        const hk = 1 - sstep(0.0, 0.24, s);
        r *= 1 - 0.5 * hk;
        cx[i] = side * r * Math.cos(th + 0.6 * hk); cz[i] = r * Math.sin(th + 0.6 * hk);
        cy[i] = SNAKE_R * 0.95 + SNAKE_R * 1.7 * hk;
      }
    }
    return function update(dt, st) {
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0, mode = st.mode || 'ground', sleeping = mode === 'sleep', spdIn = sleeping ? 0 : Math.abs(st.speed || 0);
      moodUpdate(R, S, st, dt);
      S.spd = damp(S.spd, spdIn, 4, dt);
      const spd = S.spd, it = S.it, sl = sstep(0, 1, S.sleep), sick = S.sick, hap = S.happy * (1 - S.sleep), sn = sneezeCurve(S.snT);
      spring(S, 'swim', mode === 'swim' ? 1 : 0, 3, dt);
      S.air = damp(S.air, mode === 'air' || mode === 'fly' ? 1 : 0, 8, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 7, dt);
      S.lean = damp(S.lean, clamp(st.turn || 0, -3, 3), 3, dt);
      const moving = sstep(0.02, 0.3, spd);
      // wavelength shrinks a little and amplitude grows with speed
      const lam = lerp(0.62, 0.5, sstep(0.3, 2.2, spd)) * (1 + S.swim * 0.2);
      const k = TAU / lam;
      const ampT = lerp(0.045, lerp(0.05, 0.068, sstep(0.3, 2.2, spd)), moving) * (1 + S.swim * 0.2) * (1 - 0.3 * sick);
      S.amp = damp(S.amp, ampT, 2, dt);
      // phase: travel speed along the track, plus a slow idle drift
      S.ph += (spd * k * 1.02 + (1 - moving) * 0.25 * (1 - 0.6 * sick) * (1 - sl)) * dt;
      // head lifts when idle and looking around, lowers to eat
      const idle = st.idle || 0;
      const lookOn = sstep(1.0, 2.5, idle) * (1 - S.eat) * (1 - sl);
      S.look = damp(S.look, lookTarget(it, R.rnd, 3.3, 0.5) * lookOn + Math.sin(it * 3) * 0.35 * hap, 2, dt);
      S.lift = damp(S.lift, (lookOn * 0.03 + (1 - moving) * 0.012 + hap * 0.03) * (1 - S.swim) * (1 - 0.8 * sick) - S.eat * 0.01, 2, dt);
      // build positions along the curve, measured by arc length (approximate with fixed dz spacing in s)
      let px = 0, pz = z0;
      for (let i = 0; i <= N; i++) {
        const s = i * dz;
        // envelope: neck region steadier, tail swings fully
        const env = sstep(-0.02, 0.18, s) * (1 + 0.25 * sstep(0.6, 0.95, s));
        let x = S.amp * env * Math.sin(k * s - S.ph);
        x += S.lean * 0.04 * s * s; // turning: body curves toward the turn
        if (i === 0) { px = x; pz = z0; }
        else {
          // keep segment length dz while following x
          const dx = x - xs[i - 1];
          const zz = Math.sqrt(Math.max(1e-6, dz * dz - dx * dx));
          px = x; pz = zs[i - 1] - zz;
        }
        xs[i] = px; zs[i] = pz;
        ys[i] = y0 * (i === 0 ? 1 : 0.95) + (i < 3 ? S.lift * (1 - i / 3) : 0) - (S.swim * 0.002);
        if (sl > 0.001) { xs[i] = lerp(xs[i], cx[i], sl); zs[i] = lerp(zs[i], cz[i], sl); ys[i] = lerp(ys[i], cy[i] + Math.sin(it * 1.2 - i * 0.3) * 0.0015, sl); }
      }
      // the body origin should stay near root origin: shift so the middle sits on z ~ 0 (rest layout is already centered)
      for (let i = 0; i < N; i++) {
        const b = segs[i];
        b.position.set(xs[i], ys[i], zs[i]);
        // orientation: rest direction is -Z (pointing to the tail); aim along the curve to the next point
        _v1.set(xs[i + 1] - xs[i], ys[i + 1] - ys[i], zs[i + 1] - zs[i]).normalize();
        b.quaternion.setFromUnitVectors(NZ, _v1);
      }
      // head follows the first segment, with look and eat pitch
      _v1.set(xs[0] - xs[1], 0, zs[0] - zs[1]).normalize();
      const yaw = Math.atan2(_v1.x, _v1.z) * lerp(0.6, 1, sl) + S.look;
      const pitch = -S.lift * 4 + S.eat * 0.35 + Math.sin(t * 13) * 0.03 * sstep(0.8, 0.95, S.eat) + sn + sick * 0.15 + sl * 0.12;
      head.position.set(xs[0], ys[0], zs[0] + 0.012);
      head.rotation.set(pitch, yaw, 0, 'YXZ');
      // tongue flicks every few seconds
      if (tongue) {
        const ft = fract(t / ((2.4 + R.rnd * 1.5) * (1 - 0.6 * hap)) + R.rnd);
        const flick = ft < 0.14 && sl < 0.5 ? Math.sin((ft / 0.14) * PI) : 0;
        const wig = Math.sin(t * 60) * 0.25 * flick, ts = tongue.userData.s || 1;
        tongue.visible = flick > 0.05;
        tongue.scale.set(ts, ts, ts * Math.max(0.01, flick));
        tongue.rotation.set(0.15 + wig, 0, 0);
      }
      const eo = eyeOpen(S, it, R.rnd);
      setEyes(R, eo);
    };
  }

  // ---------- asset builder (cached per species) ----------
  const cache = {};
  function featherTexture(fs, baby) {
    const [FW, FH] = fs.tex || [128, 256];
    const fcv = document.createElement('canvas'); fcv.width = FW; fcv.height = FH;
    const fctx = fcv.getContext('2d'), fimg = fctx.createImageData(FW, FH);
    const FC = { r: 0, g: 0, b: 0 };
    for (let yy = 0; yy < FH; yy++) for (let xx = 0; xx < FW; xx++) {
      FC.r = FC.g = FC.b = 0.5;
      (baby && fs.babyPaint ? fs.babyPaint : fs.paint)((xx + 0.5) / FW, (yy + 0.5) / FH, FC);
      const o = (yy * FW + xx) * 4;
      fimg.data[o] = clamp(FC.r * 255, 0, 255); fimg.data[o + 1] = clamp(FC.g * 255, 0, 255); fimg.data[o + 2] = clamp(FC.b * 255, 0, 255); fimg.data[o + 3] = 255;
    }
    fctx.putImageData(fimg, 0, 0);
    const ft = new THREE.CanvasTexture(fcv); ft.encoding = THREE.sRGBEncoding;
    return ft;
  }
  // detail uv for a loft: x around (whole number of tiles so the seam matches), y along the arc;
  // z = pattern kind + 4 * (8 * amount multiplier), so each part can have stronger or weaker detail
  function loftDuv(L, tile, flow, kind) {
    let cs = 0, n = 0;
    for (const r of L.rings) { if (Math.max(r.w, r.t, r.b) < 1e-4) continue; const h = (r.t + r.b) / 2; cs += TAU * Math.sqrt((r.w * r.w + h * h) / 2); n++; }
    const rep = Math.max(1, Math.round((n ? cs / n : tile) / tile)), out = new Array(L.uvu.length * 3);
    for (let v = 0; v < L.uvu.length; v++) { out[v * 3] = L.uvu[v] * rep; out[v * 3 + 1] = (L.arcs[v] / tile) * flow; out[v * 3 + 2] = kind; }
    return out;
  }
  // painted color at a point on the body (for eyelids): nearest loft vertex, same inputs as the atlas painter
  function paintAt(spec, lofts, p, baby) {
    let best = null, bd = 1e9;
    for (const o of lofts) {
      const L = o.L;
      for (let v = 0; v < L.pos.length / 3; v++) {
        const dx = L.pos[v * 3] - p.x, dy = L.pos[v * 3 + 1] - p.y, dz = L.pos[v * 3 + 2] - p.z, d = dx * dx + dy * dy + dz * dz;
        if (d < bd) { bd = d; best = [o, v]; }
      }
    }
    const C = { r: 0.5, g: 0.5, b: 0.5, ro: 0.8, me: 0, fl: 1 };
    if (!best) return new THREE.Color(0.3, 0.25, 0.2);
    const [o, v] = best, L = o.L, th = L.uvu[v] * TAU, r = L.rings[L.ringOf[v]];
    const P = { part: o.fp.name, x: L.pos[v * 3], y: L.pos[v * 3 + 1], z: L.pos[v * 3 + 2], nx: L.nrm[v * 3], ny: L.nrm[v * 3 + 1], nz: L.nrm[v * 3 + 2],
      u: L.uvu[v], v: L.arcs[v] / L.len, up: Math.cos(th), sd: Math.sin(th), arc: L.arcs[v], len: L.len, cx: Math.cos(th) * (r.w + r.t) * 0.5, cy: Math.sin(th) * (r.w + r.t) * 0.5, baby: !!baby };
    spec.paint(P, C);
    if (baby && spec.babyPaint) spec.babyPaint(P, C);
    const c = new THREE.Color(); c.r = s2l(clamp(C.r, 0, 1)); c.g = s2l(clamp(C.g, 0, 1)); c.b = s2l(clamp(C.b, 0, 1));
    return c;
  }
  // ---------- sculpted models ----------
  // A species can have a body sculpted in Blender (tools/blender) instead of its lofts: build.mjs embeds
  // game/models/<id>.json as window.AA_MODELS[id], with the mesh (quantized, skinned to the species' skeleton by
  // bone name) in base64 and color and normal maps as WebP data URIs. Everything else stays the same: the spec's
  // bones, animator, baby proportions (the per-vertex morph from the skin weights), eyes (placed by the model) and
  // the collar (a slice of the sculpted neck). Species without a model keep their procedural body.
  const MODELS = (typeof window !== 'undefined' && window.AA_MODELS) || {};
  const modelCache = {};
  // start decoding the maps right away; materials made before they arrive show a flat skin color and swap them in
  const modelMaps = {}, mapLoads = [];
  for (const id in MODELS) {
    const md = MODELS[id], mm = modelMaps[id] = { ready: 0, need: 0, waiters: [], tex: {} };
    for (const k in md.maps || {}) {
      mm.need++;
      const img = new Image();
      mapLoads.push(new Promise((res) => {
        img.onload = () => {
          const t = new THREE.Texture(img);
          if (k === 'color' || k === 'hair' || k === 'babyColor' || (md.srgb && md.srgb.indexOf(k) >= 0)) t.encoding = THREE.sRGBEncoding;
          t.anisotropy = 4; t.needsUpdate = true;
          mm.tex[k] = t;
          if (++mm.ready === mm.need) for (const f of mm.waiters.splice(0)) f();
          res();
        };
        img.onerror = res;
      }));
      img.src = md.maps[k];
    }
  }
  // resolves once every model's maps are decoded (tools that render pictures of the animals wait for it)
  const ready = Promise.all(mapLoads);
  // raw deflate (RFC 1951) decoder for format 2 model data, small and synchronous
  const INF = {
    lb: [3, 4, 5, 6, 7, 8, 9, 10, 11, 13, 15, 17, 19, 23, 27, 31, 35, 43, 51, 59, 67, 83, 99, 115, 131, 163, 195, 227, 258],
    le: [0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 5, 5, 5, 5, 0],
    db: [1, 2, 3, 4, 5, 7, 9, 13, 17, 25, 33, 49, 65, 97, 129, 193, 257, 385, 513, 769, 1025, 1537, 2049, 3073, 4097, 6145, 8193, 12289, 16385, 24577],
    de: [0, 0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 8, 8, 9, 9, 10, 10, 11, 11, 12, 12, 13, 13],
  };
  function inflateRaw(src, size) {
    const out = new Uint8Array(size);
    let ip = 0, bb = 0, bc = 0, op = 0, last = 0, fl = null, fd = null;
    const bits = (n) => { while (bc < n) { bb |= (src[ip++] | 0) << bc; bc += 8; } const v = bb & ((1 << n) - 1); bb >>>= n; bc -= n; return v; };
    const huff = (lens, n) => {
      const cnt = new Uint16Array(16), offs = new Uint16Array(16), sym = new Uint16Array(n);
      for (let i = 0; i < n; i++) cnt[lens[i]]++;
      cnt[0] = 0;
      for (let i = 1; i < 16; i++) offs[i] = offs[i - 1] + cnt[i - 1];
      for (let i = 0; i < n; i++) if (lens[i]) sym[offs[lens[i]]++] = i;
      return { cnt, sym };
    };
    const dec = (h) => {
      let code = 0, first = 0, index = 0;
      for (let len = 1; len < 16; len++) { code |= bits(1); const c = h.cnt[len]; if (code - c < first) return h.sym[index + code - first]; index += c; first = (first + c) << 1; code <<= 1; }
      return 0;
    };
    while (!last) {
      last = bits(1);
      const type = bits(2);
      if (type === 0) {
        bb = 0; bc = 0;
        const len = src[ip] | (src[ip + 1] << 8); ip += 4;
        out.set(src.subarray(ip, ip + len), op); ip += len; op += len;
        continue;
      }
      let lh, dh;
      if (type === 1) {
        if (!fl) { const l = new Uint8Array(288); l.fill(8, 0, 144); l.fill(9, 144, 256); l.fill(7, 256, 280); l.fill(8, 280, 288); fl = huff(l, 288); fd = huff(new Uint8Array(30).fill(5), 30); }
        lh = fl; dh = fd;
      } else {
        const nl = bits(5) + 257, nd = bits(5) + 1, nc = bits(4) + 4, ord = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15], cl = new Uint8Array(19);
        for (let i = 0; i < nc; i++) cl[ord[i]] = bits(3);
        const ch = huff(cl, 19), ll = new Uint8Array(nl + nd);
        for (let i = 0; i < nl + nd;) {
          const s = dec(ch);
          if (s < 16) ll[i++] = s;
          else { const v = s === 16 ? ll[i - 1] : 0; let r = s === 16 ? 3 + bits(2) : s === 17 ? 3 + bits(3) : 11 + bits(7); while (r--) ll[i++] = v; }
        }
        lh = huff(ll.subarray(0, nl), nl); dh = huff(ll.subarray(nl), nd);
      }
      for (;;) {
        let s = dec(lh);
        if (s < 256) out[op++] = s;
        else if (s === 256) break;
        else { s -= 257; const len = INF.lb[s] + bits(INF.le[s]), ds = dec(dh), dist = INF.db[ds] + bits(INF.de[ds]); for (let k = 0; k < len; k++, op++) out[op] = out[op - dist]; }
      }
    }
    return out;
  }
  const octDec = (x, y, out, o) => {
    x /= 127; y /= 127;
    const z = 1 - Math.abs(x) - Math.abs(y);
    if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
    const l = Math.hypot(x, y, z) || 1;
    out[o] = x / l; out[o + 1] = y / l; out[o + 2] = z / l;
  };
  // format 2 (see tools/blender/modelpack.py): the stored +x half gets its mirror twins here (x negated, left and
  // right bones swapped, mirrored triangles with reversed winding); optional fur (comb direction and length per
  // vertex) and hair cards (never mirrored, with a baby offset per vertex)
  function unpackModel2(md, u8) {
    const raw = inflateRaw(u8, md.raw);
    let o = 0;
    const plane = (n) => { const a = raw.subarray(o, o + n); o += n; return a; };
    const unz = (v) => (v & 1 ? -((v + 1) >> 1) : v >> 1);
    // delta sums wrap around: 16 bit values (unsigned), bytes (signed)
    const d16 = (n) => { const lo = plane(n), hi = plane(n), out = new Int32Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc = (acc + unz(lo[i] | (hi[i] << 8))) & 0xffff; out[i] = acc; } return out; };
    const d8 = (n) => { const a = plane(n), out = new Int32Array(n); let acc = 0; for (let i = 0; i < n; i++) { acc = (acc + unz(a[i])) & 0xff; out[i] = acc >= 128 ? acc - 256 : acc; } return out; };
    const tris = (n) => { const lo = plane(n), hi = plane(n), out = new Uint32Array(n); let hw = -1; for (let i = 0; i < n; i++) { const v = hw + 1 - unz(lo[i] | (hi[i] << 8)); out[i] = v; if (v > hw) hw = v; } return out; };
    const mb = md.bones.map((n, i) => { const m = n.endsWith('L') ? n.slice(0, -1) + 'R' : n.endsWith('R') ? n.slice(0, -1) + 'L' : n, k = md.bones.indexOf(m); return k >= 0 ? k : i; });
    const mesh = (n, nt, b, mirror) => {
      const qx = d16(n), qy = d16(n), qz = d16(n), qu = d16(n), qv = d16(n), ox = d8(n), oy = d8(n);
      const si = [plane(n), plane(n), plane(n), plane(n)], sw = [plane(n), plane(n), plane(n), plane(n)];
      return { n, nt, b, qx, qy, qz, qu, qv, ox, oy, si, sw, mirror };
    };
    const build = (m, twin, N) => {
      const pos = new Float64Array(N * 3), nrm = new Float64Array(N * 3), uv = new Float64Array(N * 2), si = new Uint8Array(N * 4), sw = new Uint8Array(N * 4), b = m.b;
      for (let i = 0; i < m.n; i++) {
        const x = ((m.qx[i] - 32768) / 32767) * b[3], y = b[1] + ((b[4] - b[1]) * m.qy[i]) / 65535, z = b[2] + ((b[5] - b[2]) * m.qz[i]) / 65535;
        pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
        uv[i * 2] = m.qu[i] / 65535; uv[i * 2 + 1] = m.qv[i] / 65535;
        octDec(m.ox[i], m.oy[i], nrm, i * 3);
        for (let k = 0; k < 4; k++) { si[i * 4 + k] = m.si[k][i]; sw[i * 4 + k] = m.sw[k][i]; }
        const j = twin ? twin[i] : i;
        if (j !== i) {
          pos[j * 3] = -x; pos[j * 3 + 1] = y; pos[j * 3 + 2] = z;
          uv[j * 2] = uv[i * 2]; uv[j * 2 + 1] = uv[i * 2 + 1];
          nrm[j * 3] = -nrm[i * 3]; nrm[j * 3 + 1] = nrm[i * 3 + 1]; nrm[j * 3 + 2] = nrm[i * 3 + 2];
          for (let k = 0; k < 4; k++) { si[j * 4 + k] = mb[m.si[k][i]]; sw[j * 4 + k] = m.sw[k][i]; }
        }
      }
      const weights = (v) => { const w = []; for (let k = 0; k < 4; k++) if (sw[v * 4 + k]) w.push([md.bones[si[v * 4 + k]], sw[v * 4 + k] / 255]); return w; };
      return { pos, nrm, uv, weights };
    };
    // body: mirror twins for the body vertices off the middle plane
    const m = mesh(md.nv, md.ntri, md.bbox, true), rg = plane(md.nv), t0 = tris(md.ntri * 3);
    const twin = new Int32Array(md.nv);
    let nt2 = 0;
    for (let i = 0; i < md.nv; i++) twin[i] = i < md.nbv && m.qx[i] !== 32768 ? md.nv + nt2++ : i;
    const N = md.nv + nt2, out = build(m, twin, N), nb = md.nbt * 3;
    const idx = new Uint32Array(md.ntri * 3 + nb);
    idx.set(t0.subarray(0, nb), 0);
    for (let i = 0; i < nb; i += 3) { idx[nb + i] = twin[t0[i]]; idx[nb + i + 1] = twin[t0[i + 2]]; idx[nb + i + 2] = twin[t0[i + 1]]; }
    idx.set(t0.subarray(nb), 2 * nb);
    const rgh = new Uint8Array(N);
    for (let i = 0; i < md.nv; i++) { rgh[i] = rg[i]; rgh[twin[i]] = rg[i]; }
    Object.assign(out, { idx, rgh });
    if (md.fur) {
      const fx = d8(md.nv), fy = d8(md.nv), fl = plane(md.nv), flow = new Float32Array(N * 3), flen = new Float32Array(N), tmp = [0, 0, 0];
      for (let i = 0; i < md.nv; i++) {
        octDec(fx[i], fy[i], tmp, 0);
        const j = twin[i];
        flow[i * 3] = tmp[0]; flow[i * 3 + 1] = tmp[1]; flow[i * 3 + 2] = tmp[2]; flen[i] = fl[i] / 255;
        flow[j * 3] = -tmp[0]; flow[j * 3 + 1] = tmp[1]; flow[j * 3 + 2] = tmp[2]; flen[j] = fl[i] / 255;
      }
      out.fur = { flow, flen };
    }
    if (md.cards) {
      const c = md.cards, cm = mesh(c.nv, c.ntri, c.bbox, false), by = [d16(c.nv), d16(c.nv), d16(c.nv)].map((a) => a.map((v) => (v >= 32768 ? v - 65536 : v)));
      const ct = tris(c.ntri * 3), co = build(cm, null, c.nv), bs = c.bscale;
      co.idx = ct;
      co.baby = (v) => [by[0][v] * bs, by[1][v] * bs, by[2][v] * bs];
      out.cards = co;
    }
    // optional: the baby's own shape change per vertex (as in format 1, square law), x negated on the mirror twins
    if (md.bdelta) {
      const q = [d8(md.nv), d8(md.nv), d8(md.nv)], bd = new Float64Array(N * 3), k = md.bdelta / 16129;
      for (let i = 0; i < md.nv; i++) {
        const j = twin[i], x = q[0][i] * Math.abs(q[0][i]) * k, y = q[1][i] * Math.abs(q[1][i]) * k, z = q[2][i] * Math.abs(q[2][i]) * k;
        bd[i * 3] = x; bd[i * 3 + 1] = y; bd[i * 3 + 2] = z;
        if (j !== i) { bd[j * 3] = -x; bd[j * 3 + 1] = y; bd[j * 3 + 2] = z; }
      }
      out.bdelta = bd;
    }
    return out;
  }
  function modelData(id) {
    if (modelCache[id] !== undefined) return modelCache[id];
    const md = MODELS[id];
    let out = null;
    if (md && md.v >= 2) {
      try {
        const bin = atob(md.data), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        out = Object.assign(unpackModel2(md, u8), { md, maps: modelMaps[id] });
      } catch (e) { out = null; }
    } else if (md) {
      try {
        const bin = atob(md.data), u8 = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
        const nv = md.nv, nt = md.ntri, b = md.bbox;
        let o = 0;
        const take = (T, n) => { const a = new T(u8.buffer, o, n); o += n * T.BYTES_PER_ELEMENT; return a; };
        const q = take(Uint16Array, nv * 3), quv = take(Uint16Array, nv * 2), idx = take(Uint16Array, nt * 3), oct = take(Int8Array, nv * 2);
        const si = take(Uint8Array, nv * 4), sw = take(Uint8Array, nv * 4), rgh = take(Uint8Array, nv);
        // optional: the baby's own shape change per vertex (adult space, i8 x3, square-law: d = s |s| md.bdelta meters with
        // s = q / 127, fine for the small offsets and still reaching the big ones), so a chick can be a round ball of
        // down rather than a shrunken hen; the bones' baby maps carry it like the rest of the morph
        const bdq = md.bdelta ? take(Int8Array, nv * 3) : null;
        const bdelta = bdq ? Array.from(bdq, (q) => (q * Math.abs(q) / 16129) * md.bdelta) : null;
        const pos = new Array(nv * 3), nrm = new Array(nv * 3), uv = new Array(nv * 2);
        for (let i = 0; i < nv; i++) {
          for (let k = 0; k < 3; k++) pos[i * 3 + k] = b[k] + ((b[k + 3] - b[k]) * q[i * 3 + k]) / 65535;
          uv[i * 2] = quv[i * 2] / 65535; uv[i * 2 + 1] = quv[i * 2 + 1] / 65535;
          // octahedral normal
          let x = oct[i * 2] / 127, y = oct[i * 2 + 1] / 127;
          const z = 1 - Math.abs(x) - Math.abs(y);
          if (z < 0) { const ox = x; x = (1 - Math.abs(y)) * (ox >= 0 ? 1 : -1); y = (1 - Math.abs(ox)) * (y >= 0 ? 1 : -1); }
          const l = Math.hypot(x, y, z) || 1;
          nrm[i * 3] = x / l; nrm[i * 3 + 1] = y / l; nrm[i * 3 + 2] = z / l;
        }
        const weights = (v) => { const w = []; for (let k = 0; k < 4; k++) if (sw[v * 4 + k]) w.push([md.bones[si[v * 4 + k]], sw[v * 4 + k] / 255]); return w; };
        out = { md, pos, nrm, uv, idx: Array.from(idx), weights, rgh, bdelta, maps: modelMaps[id] };
      } catch (e) { out = null; }
    }
    return (modelCache[id] = out);
  }
  // model skin: color and normal maps, roughness per vertex, a soft warm rim like light through skin
  function aaModelCompile(sh) {
    Object.assign(sh.uniforms, this.userData.aa);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float rgh;\nvarying float vRgh;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvRgh = rgh;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vRgh;\nuniform vec3 aaRimC;')
      .replace('#include <roughnessmap_fragment>', 'float roughnessFactor = roughness * vRgh;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float aaRim = pow(1.0 - saturate(dot(normal, geometry.viewDir)), 3.0);
  reflectedLight.directDiffuse *= vec3(1.0) + aaRimC * aaRim; reflectedLight.indirectDiffuse *= vec3(1.0) + aaRimC * aaRim;
}`);
  }
  function modelMaterial(M, baby) {
    const md = M.md, tint = (baby ? md.babyTint : md.tint) || [1, 1, 1], rim = md.rim || [0.25, 0.1, 0.08];
    const m = new THREE.MeshStandardMaterial({ roughness: 1, metalness: 0 });
    m.userData.aa = { aaRimC: { value: new THREE.Vector3().fromArray(rim) } };
    m.onBeforeCompile = aaModelCompile;
    const mm = M.maps, flat = linColor(md.flat || 0xe0b0a0);
    // babies can have their own maps (birds: down instead of feathers; a fox kit's gray-brown fuzz)
    const apply = () => { m.map = (baby && mm.tex.babyColor) || mm.tex.color || null; m.normalMap = (baby && mm.tex.babyNormal) || mm.tex.normal || null; m.color.setRGB(tint[0], tint[1], tint[2]); m.needsUpdate = true; };
    if (mm && mm.ready === mm.need) apply();
    else { m.color.copy(flat); if (mm) mm.waiters.push(apply); }
    return m;
  }
  // hair cards: the strand texture with alpha (tested, and turned into coverage where the canvas has MSAA), both sides
  function cardMaterial(M, baby) {
    const md = M.md, c = md.cards, tint = (baby ? md.babyTint : md.tint) || [1, 1, 1];
    const m = new THREE.MeshStandardMaterial({ roughness: c.rough || 0.55, metalness: 0, side: THREE.DoubleSide, alphaTest: c.alpha || 0.3 });
    m.alphaToCoverage = true;
    // babies can have their own strand texture (a hoglet's soft pale spines)
    const mm = M.maps, apply = () => { m.map = (baby && mm.tex.babyHair) || mm.tex.hair || null; m.color.setRGB(tint[0], tint[1], tint[2]); m.visible = !!m.map; m.needsUpdate = true; };
    if (mm && mm.ready === mm.need) apply();
    else { m.visible = false; if (mm) mm.waiters.push(apply); }
    return m;
  }
  // eyelashes along the upper lid, in the eye's frame (x side, y gaze, z up; meters). The lid line follows the eye
  // shader's lid (lid: [upper, lower, curve] on the unit eye ball); the lashes sit a little in front of the ball.
  function lashGeo(e) {
    const L = e.lash, r = e.r, n = L.n, pos = [], nrm = [], idx = [], col = [], lk = e.lid, c = hex(L.col || 0xf2ebe0);
    for (let i = 0; i < n; i++) {
      const xu = lerp(-0.62, 0.7, (i + 0.5) / n + (hash3(i, 3, 9) - 0.5) * 0.06), zu = lk[0] - lk[2] * xu * xu + 0.03;
      const R = r * 1.12, x = xu * r, z = zu * r, y = Math.sqrt(Math.max(0, R * R - x * x - z * z));
      const len = L.len * (0.55 + 0.45 * Math.cos(xu * 1.6)) * (0.85 + 0.3 * hash3(i, 5, 9));
      const b = pos.length / 3;
      // three segments: out along the gaze from the lid edge, then curling up, each a little different
      const tw = (hash3(i, 7, 9) - 0.5) * 0.5, up = 0.35 + 0.3 * hash3(i, 8, 9);
      for (let s = 0; s <= 3; s++) {
        const t = s / 3, w = 0.00032 * (1 - 0.8 * t);
        const px = x + (xu * 0.35 + tw) * len * t, py = y + len * (0.85 * t - 0.25 * t * t), pz = z + len * (0.1 * t + up * t * t);
        pos.push(px - w, py, pz, px + w, py, pz);
        nrm.push(0, 0.3, 0.95, 0, 0.3, 0.95);
        for (let k = 0; k < 2; k++) col.push(s2l(c[0]), s2l(c[1]), s2l(c[2]));
        if (s < 3) { const a = b + s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2, a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(nrm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
    g.setIndex(idx);
    return g;
  }
  let lashMat = null;

  function getAssets(id) {
    if (cache[id]) return cache[id];
    const spec = SPEC[id]();
    const M = modelData(id);
    if (M) {
      // the sculpt places the eyes and the mouth; no loft parts, accents or fur shells
      const e = M.md.eye;
      spec.eyes = [Object.assign({ bone: 'head' }, e)];
      if (M.md.mouth) spec.mouth = M.md.mouth;
      spec.accent = null; spec.shell = null;
      // a sculpted coat (FUR in the species' Blender file): fur shells over the model, set up by the model
      if (M.fur && M.md.fur) spec.shell = Object.assign({ model: true, n: 4, n1: 0, lean: 1, babyLen: 1.5 }, M.md.fur);
      // settings that differ for the sculpted body (a bird's folded wing resting on the sculpted back, baby proportions)
      if (spec.modelSpec) for (const k in spec.modelSpec) Object.assign(spec[k] || (spec[k] = {}), spec.modelSpec[k]);
    }
    // bones (expand mirrored)
    const defs = [];
    for (const b of spec.bones) {
      defs.push({ name: b[0], parent: b[1], p: new THREE.Vector3(b[2], b[3], b[4]) });
      if (b[5]) defs.push({ name: b[0].slice(0, -1) + 'R', parent: b[1] && b[1].endsWith('L') ? b[1].slice(0, -1) + 'R' : b[1], p: new THREE.Vector3(-b[2], b[3], b[4]) });
    }
    if (spec.extraBones) for (const b of spec.extraBones(defs)) defs.push(b);
    // collar tag bone (always there, so any rig can wear a collar later)
    const cplan = M ? collarPlanMesh(spec, id, defs, M) : collarPlan(spec, id, defs);
    if (cplan) defs.push({ name: 'ctag', parent: cplan.parent, p: cplan.hang.clone() });
    const boneIndex = {}, rest = {};
    defs.forEach((d, i) => { boneIndex[d.name] = i; rest[d.name] = d.p; });
    const ag = babyMaps(spec, defs, rest, boneIndex);
    ag.fluff = ag.B.fluff || 0;
    if (cplan && !cplan.mesh) collarBaby(ag, cplan);
    // fur parts
    const furBatch = newBatch(ag), lofts = [];
    for (const fp of M ? [] : spec.fur || []) {
      const L = buildLoft(fp);
      const ringW = fp.bones.length > 1 ? skinLoft(L, fp.bones, rest, fp.blend || 0.03) : null;
      L.weights = (v) => (ringW ? ringW[L.ringOf[v]] : [[fp.bones[0], 1]]);
      lofts.push({ fp, L });
    }
    // atlas bands
    const TW = spec.texW || (spec.tex || [256])[0], TH = (spec.tex || [256, 256])[1];
    const tot = lofts.reduce((s, o) => s + o.L.len * (o.fp.texScale || 1), 0);
    let y = 0;
    const bands = lofts.map((o, i) => {
      let h = Math.max(10, Math.floor(((o.L.len * (o.fp.texScale || 1)) / tot) * TH));
      if (i === lofts.length - 1) h = TH - y;
      const bd = { name: o.fp.name, loft: o.L, y0: y, y1: Math.min(TH, y + h), fl: o.fp.fl };
      y += h;
      return bd;
    });
    const det = detailOf(spec), orm = !!(spec.orm || spec.shell);
    lofts.forEach((o, i) => {
      const bd = bands[i], inner = bd.y1 - bd.y0 - 2 * PAD;
      const uvFn = (v) => [o.L.uvu[v], 1 - (bd.y0 + PAD + (o.L.arcs[v] / o.L.len) * inner) / TH];
      const kind = o.fp.dkind || det.kind;
      const duv = loftDuv(o.L, det.tile * (o.fp.dtile || 1), o.fp.flow || (kind === 'feather' ? -1 : 1), DETAIL_KIND[kind] + 4 * Math.round(8 * clamp(o.fp.damt == null ? 1 : o.fp.damt, 0, 3)));
      const part = { name: o.fp.name, pos: o.L.pos, nrm: o.L.nrm, idx: o.L.idx, duv, weights: o.L.weights, fluff: o.fp.fluff === false ? false : undefined };
      pushPart(furBatch, part, boneIndex, uvFn, null, false);
      if (o.fp.mirror) pushPart(furBatch, part, boneIndex, uvFn, null, true);
    });
    if (M) {
      pushPart(furBatch, { name: 'model', pos: M.pos, nrm: M.nrm, idx: M.idx, weights: M.weights, bdelta: M.bdelta }, boneIndex, (v) => [M.uv[v * 2], M.uv[v * 2 + 1]], null, false);
      if (cplan) collarBabyMesh(ag, cplan, furBatch);
    }
    const makeFurMat = (baby) => {
      const pf = baby && spec.babyPaint ? (P, C) => { spec.paint(P, C); spec.babyPaint(P, C); } : spec.paint;
      const atlas = paintAtlas(TW, TH, bands, pf, orm, spec.rough || 0.85, baby);
      const m = furMaterial(atlas.tex, atlas.orm, spec.rough || 0.85, det, false);
      // chicks and ducklings are covered in down, not feathers
      if (baby && spec.feathers) { m.userData.aa.aaKO.value = 0; m.userData.aa.aaK.value.set(0.22, det.tile * 0.012, 0.35); }
      return m;
    };
    let geos;
    if (M) {
      const g = batchGeometry(furBatch, false);
      g.deleteAttribute('duv');
      g.setAttribute('rgh', new THREE.BufferAttribute(new Uint8Array(M.rgh), 1, true));
      geos = [{ geo: g, mat: modelMaterial(M, false), babyMat: () => modelMaterial(M, true), fur: true, model: true }];
      // hair cards (manes, tails): their own mesh and strand texture, skinned like the body
      if (M.cards) {
        const cb = newBatch(ag), C = M.cards;
        pushPart(cb, { name: 'cards', pos: C.pos, nrm: C.nrm, idx: C.idx, weights: C.weights, fluff: false, babyAdd: C.baby }, boneIndex, (v) => [C.uv[v * 2], C.uv[v * 2 + 1]], null, false);
        const cg = batchGeometry(cb, false);
        cg.deleteAttribute('duv');
        geos.push({ geo: cg, mat: cardMaterial(M, false), babyMat: () => cardMaterial(M, true), cards: true });
      }
    } else geos = [{ geo: batchGeometry(furBatch, false), mat: makeFurMat(false), babyMat: spec.babyPaint ? () => makeFurMat(true) : null, fur: true }];
    // accent parts (vertex colored)
    if (spec.accent && spec.accent.length) {
      const ab = newBatch(ag), abBaby = spec.accent.some((a) => a.babyCol != null) ? [] : null;
      for (const a of spec.accent) {
        let part;
        if (a.kind === 'sphere') part = spherePart(a.c, a.r, a.ws || 10, a.hs || 8, ...(a.s || [1, 1, 1]));
        else if (a.kind === 'tube') part = tubePart(a.pts, a.radii, a.segs || 6, a.capEnd !== false);
        else if (a.kind === 'fan') part = fanPart(a.c, a.outline, a.thick || 0.003, a.n);
        else if (a.kind === 'loft') { const L = buildLoft(a); part = { pos: L.pos, nrm: L.nrm, idx: L.idx }; }
        else if (a.kind === 'raw') part = a.make();
        const col = a.colFn ? (v, x, yy, z) => a.colFn(x, yy, z) : a.vcol ? (v) => a.vcol(v) : () => hex(a.col);
        part.weights = a.weights || (() => [[a.bone, 1]]);
        part.fluff = false;
        const n0 = ab.col.length;
        pushPart(ab, part, boneIndex, null, col, false);
        if (a.mirror) pushPart(ab, part, boneIndex, null, col, true);
        if (abBaby) { const bc = a.babyCol != null ? hex(a.babyCol) : null; for (let i = n0; i < ab.col.length; i += 3) abBaby.push(bc ? s2l(bc[0]) : ab.col[i], bc ? s2l(bc[1]) : ab.col[i + 1], bc ? s2l(bc[2]) : ab.col[i + 2]); }
      }
      const geo = batchGeometry(ab, true);
      // baby accent colors (beaks, legs) live in a second color set swapped in with the baby material
      if (abBaby) geo.userData.babyColor = new THREE.Float32BufferAttribute(abBaby, 3);
      geos.push({ geo, mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: spec.accentRough || 0.5, metalness: 0 }), accent: true });
    }
    // feathers (birds)
    if (spec.feathers) {
      const fb = newBatch(ag);
      // a sculpted bird brings a feather atlas (real outlines in its alpha, vanes, shafts, a normal map): its blades
      // are plain rectangles cut to the feather by the atlas. The spec gets the model's json to pick its blade set.
      const fa = M && M.md.feathers ? M : null;
      const fs = spec.feathers(rest, fa ? M.md : null);
      for (const f of fs.list) {
        const bl = fa ? featherBladeCut(f.len, f.wid, f.curl || 0, f.camber) : featherBlade(f.len, f.wid, f.curl || 0, f.tip == null ? 0.35 : f.tip, f.rootW);
        // transform blade: rotate about Y by yaw, X by roll (twist), then translate to base (rest root space)
        const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(f.roll || 0, f.yaw, f.pitch || 0, 'YZX'));
        const pos = [], nrm = [];
        for (let i = 0; i < bl.pos.length; i += 3) {
          _v1.set(bl.pos[i], bl.pos[i + 1], bl.pos[i + 2]).applyQuaternion(q).add(_v2.fromArray(f.base));
          pos.push(_v1.x, _v1.y, _v1.z);
          _v1.set(bl.nrm[i], bl.nrm[i + 1], bl.nrm[i + 2]).applyQuaternion(q);
          nrm.push(_v1.x, _v1.y, _v1.z);
        }
        const uvFn = (v) => [f.cell[0] + bl.uv[v * 2] * f.cell[2], 1 - (f.cell[1] + bl.uv[v * 2 + 1] * f.cell[3])];
        const part = { pos, nrm, idx: bl.idx, weights: () => [[f.bone, 1]], fluff: false };
        pushPart(fb, part, boneIndex, uvFn, null, false);
        if (f.mirror) pushPart(fb, part, boneIndex, uvFn, null, true);
      }
      const fmat = fa ? (baby) => featherModelMaterial(fa, fs, baby) : (baby) => new THREE.MeshStandardMaterial({ map: featherTexture(fs, baby), roughness: fs.rough || 0.8, metalness: 0, side: THREE.DoubleSide });
      geos.push({ geo: batchGeometry(fb, false), mat: fmat(false), babyMat: fs.babyPaint || fa ? () => fmat(true) : null });
    }
    // eyes
    const eyeDefs = [];
    for (const e of spec.eyes || []) {
      eyeDefs.push(e);
      eyeDefs.push(Object.assign({}, e, { p: [-e.p[0], e.p[1], e.p[2]], dir: [-e.dir[0], e.dir[1], e.dir[2]], bone: mirrorBoneName(e.bone, boneIndex) }));
    }
    const A = { id, spec, defs, boneIndex, rest, geos, eyeDefs, det, furParts: furBatch.parts, extras: spec.extras ? spec.extras(rest) : [], cplan, ag, M };
    // eyelid colors (adult, baby): the painted coat right at the eye, unless the spec names one
    if (spec.eyes && spec.eyes[0]) {
      const e = spec.eyes[0], ep = new THREE.Vector3().fromArray(e.p).addScaledVector(new THREE.Vector3().fromArray(e.dir).normalize(), e.r * 1.2);
      A.lidCol = e.lidCol != null ? [linColor(e.lidCol), linColor(e.babyLidCol != null ? e.babyLidCol : e.lidCol)] : [paintAt(spec, lofts, ep, false), paintAt(spec, lofts, ep, true)];
    }
    // belly contact point under the hips (for lying down and climbing), from the body loft
    if (M && M.md.belly) A.belly = new THREE.Vector3().fromArray(M.md.belly);
    else if (lofts.length && rest.hips) {
      const L = lofts[0].L, hp = rest.hips;
      let best = null, bd = 1e9;
      for (const r of L.rings) { const d = Math.abs(r.C.z - hp.z); if (d < bd && r.b > 1e-4) { bd = d; best = r; } }
      A.belly = best ? best.C.clone().addScaledVector(best.N, -best.b) : new THREE.Vector3(0, 0, 0);
    } else A.belly = new THREE.Vector3(0, 0, 0);
    // age data: adult and baby local bone positions, eye and mouth placement
    const mp = ag.byName, B = ag.B;
    const local = (nm, which) => { const d = defs[boneIndex[nm]], m = mp[nm]; const p = which ? m.c1.clone() : m.c0.clone(); if (d.parent) p.sub(which ? mp[d.parent].c1 : mp[d.parent].c0); return p; };
    const mapPt = (bone, p) => babyApply(mp[bone], new THREE.Vector3().fromArray(p), new THREE.Vector3());
    A.age = {
      B,
      local0: defs.map((d) => local(d.name, 0)), local1: defs.map((d) => local(d.name, 1)),
      rest1: Object.fromEntries(defs.map((d) => [d.name, mp[d.name].c1.clone()])),
      eyes: eyeDefs.map((e) => ({ p0: new THREE.Vector3().fromArray(e.p).sub(rest[e.bone]), p1: mapPt(e.bone, e.p).sub(mp[e.bone].c1), s1: (mp[e.bone].role === 'head' ? B.head : 1) * B.eye })),
      mouth0: new THREE.Vector3().fromArray(spec.mouth).sub(rest[spec.mouthBone || 'head']),
      mouth1: mapPt(spec.mouthBone || 'head', spec.mouth).sub(mp[spec.mouthBone || 'head'].c1),
      extras: A.extras.map((x) => (x.at ? { p0: new THREE.Vector3().fromArray(x.at).sub(rest[x.bone]), p1: mapPt(x.bone, x.at).sub(mp[x.bone].c1), s1: mp[x.bone].role === 'head' ? B.head : 1 } : null)),
      horns: defs.filter((d) => mp[d.name].role === 'horn').map((d) => d.name),
      belly1: rest.hips ? babyApply(mp.hips, A.belly, new THREE.Vector3()) : A.belly.clone(),
      drop: rest.hips ? Math.max(0, rest.hips.y - mp.hips.c1.y) : 0,
      babyMats: null,
    };
    A.eat0 = computeEat(A, rest, 0);
    cache[id] = A;
    return A;
  }
  // eat / drink neck poses for a given rest skeleton (adult once per species, babies when their age is set)
  function computeEat(A, rest, ageDrop) {
    const spec = A.spec, an = spec.anim, o = {}, fd = (an.floatDepth || 0) - (an.floatDepth ? ageDrop : 0);
    if (!an || !an.neck) return o;
    const piv = an.neck.map((n) => rest[n].toArray());
    const m = A.age ? babyApplyAge(A, rest, spec.mouthBone || 'head', spec.mouth) : spec.mouth;
    const pre = an.eatPitch ? [rest[an.bodyBone || 'hips'].toArray(), an.eatPitch, an.eatDrop || 0] : null;
    o.eatA = solveDown(piv, m, an.neckDist, an.eatY == null ? 0.03 : an.eatY, an.eatMax || 2.4, pre);
    o.drinkA = solveDown(piv, m, an.neckDist, fd + 0.01, an.eatMax || 2.4, null);
    if (an.eatElev) o.eatPose = solveElev(piv, m, an.eatElev, an.eatY == null ? 0.03 : an.eatY, [rest.hips.toArray(), an.eatPitch || 0, an.eatDrop || 0, rest.chest ? rest.chest.toArray() : null, an.chestEat || 0]);
    if (an.drinkElev) o.drinkPose = solveElev(piv, m, an.drinkElev, fd + 0.01, null);
    return o;
  }
  // mouth position (root space) for a rig whose rest skeleton is 'rest' (lerped between adult and baby)
  function babyApplyAge(A, rest, bone, p) {
    const r0 = A.rest[bone], r1 = A.age.rest1[bone], d = r1.distanceTo(r0), t = d > 1e-9 ? clamp(rest[bone].distanceTo(r0) / d, 0, 1) : 0;
    const m0 = A.age.mouth0, m1 = A.age.mouth1;
    return [rest[bone].x + lerp(m0.x, m1.x, t), rest[bone].y + lerp(m0.y, m1.y, t), rest[bone].z + lerp(m0.z, m1.z, t)];
  }
  function mirrorBoneName(nm, boneIndex) { if (nm.endsWith('L')) { const r = nm.slice(0, -1) + 'R'; if (boneIndex[r] !== undefined) return r; } return nm; }

  // ---------- eyes ----------
  const eyeGeo = new THREE.SphereGeometry(1, 16, 12);
  const eyeTexs = {};
  // iris texture on the eye sphere (the iris is centered on the sphere's +Y pole, which eyeBasis turns to the gaze).
  // Every species gets an iris now: dark-eyed mammals get a deep brown one with a pupil, so the eye reads wet and alive.
  function eyeTexture(e) {
    const iris = e.iris || e.col || 0x2a1a10;
    const key = [iris, e.pupil || '', e.irisR || 0, e.pupilR || 0, e.sclera || 0, e.rim || 0].join(',') + (e.irisNet ? ',net' + e.irisNet : '');
    if (eyeTexs[key]) return eyeTexs[key];
    // irisNet (frogs): a fine dark network over the iris instead of radial fibers, on a finer texture
    const net = e.irisNet || 0, W = net ? 256 : 128, H = net ? 128 : 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    const ir = hex(iris), dark = hex(0x050403), rim = hex(e.rim || 0x140d08), scl = e.sclera ? hex(e.sclera) : mixc(rim, ir, 0.25);
    const irisA = (e.irisR || 0.8) * 0.5 * PI, pa = irisA * (e.pupilR || 0.45);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const th = ((y + 0.5) / H) * PI, ph = ((x + 0.5) / W) * TAU;
      const px = th * Math.cos(ph), py = th * Math.sin(ph);
      let inP;
      if (e.pupil === 'v') inP = Math.pow(px / (pa * 0.32), 2) + Math.pow(py / (pa * 1.15), 2);
      else if (e.pupil === 'h') inP = Math.pow(Math.abs(px) / (pa * 1.35), 4) + Math.pow(Math.abs(py) / (pa * 0.5), 4);
      else inP = (th / pa) * (th / pa);
      let c;
      if (th < irisA) {
        const f = th / irisA;
        // radial fibers, a darker collar near the pupil and a dark limbal ring
        const fib = noise(Math.cos(ph) * 9 + 3, Math.sin(ph) * 9, f * 2.5) * 0.6 + noise(Math.cos(ph) * 22, Math.sin(ph) * 22, f * 6) * 0.4;
        let k = (0.62 + 0.55 * fib) * (1 - 0.3 * sstep(0.55, 1, f)) * (1 + 0.25 * sstep(0.2, 0.0, Math.abs(f - 0.62)));
        if (net) {
          const n1 = noise(px * 11 + 3.1, py * 11 + 1.7, 5.5), n2 = noise(px * 26 + 8.3, py * 26 + 2.9, 7.5), n3 = noise(px * 4 + 1.3, py * 4 + 6.1, 2.5);
          const r1 = 1 - Math.abs(2 * n1 - 1), r2 = 1 - Math.abs(2 * n2 - 1);
          k = (0.8 + 0.35 * n3) * (1 - net * (0.5 * sstep(0.86, 0.975, r1) + 0.32 * sstep(0.87, 0.975, r2))) * (1 - 0.35 * sstep(0.6, 1, f)) * (1 + 0.2 * sstep(0.25, 0.0, Math.abs(f - 0.45)));
        }
        c = [ir[0] * k, ir[1] * k, ir[2] * k];
        c = mixc(c, rim, sstep(0.82, 1.0, f) * 0.85);
        c = mixc(c, dark, sstep(1.25, 1.0, Math.sqrt(inP)) * 0.35);
        if (inP < 1) c = dark;
      } else c = mixc(scl, rim, sstep(irisA + 0.25, irisA, th) * 0.6);
      const o = (y * W + x) * 4; d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
    eyeTexs[key] = t;
    return t;
  }
  // eye shader: a sky catchlight fixed in view space (wet look), and eyelids drawn on the eye ball itself:
  // above the upper lid edge and below the lower one the ball takes the lid (skin) color, with a dark lid margin.
  function aaEyeCompile(sh) {
    Object.assign(sh.uniforms, this.userData.aa);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEyeP = position;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vEyeP;\nuniform vec3 aaLid;\nuniform vec2 aaOpen;\nuniform vec3 aaLidK;')
      .replace('#include <map_fragment>', `#include <map_fragment>
  float aaSd = vEyeP.x, aaUp = vEyeP.z;
  float aaEU = mix(aaLidK.y + 0.04, aaLidK.x, aaOpen.x) - aaLidK.z * aaSd * aaSd;
  float aaEL = mix(aaLidK.x - 0.04, aaLidK.y, aaOpen.y) + aaLidK.z * 0.6 * aaSd * aaSd;
  float aaLidF = max(smoothstep(aaEU - 0.015, aaEU + 0.015, aaUp), smoothstep(aaEL + 0.015, aaEL - 0.015, aaUp));
  float aaM = max(1.0 - smoothstep(0.0, 0.06, abs(aaUp - aaEU)), 1.0 - smoothstep(0.0, 0.045, abs(aaUp - aaEL)));
  diffuseColor.rgb = mix(diffuseColor.rgb, aaLid, aaLidF) * (1.0 - 0.55 * aaM);`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.75, aaLidF);')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  float aaC = pow(saturate(dot(normal, normalize(vec3(-0.42, 0.55, 0.72)))), 160.0) + 0.5 * pow(saturate(dot(normal, normalize(vec3(0.38, 0.12, 0.92)))), 700.0);
  reflectedLight.indirectSpecular += aaC * (1.0 - aaLidF) * (irradiance * RECIPROCAL_PI * 2.4 + 0.04);
}`);
  }
  function eyeMaterial(A) {
    const e = A.spec.eyes[0];
    const m = new THREE.MeshStandardMaterial({ map: eyeTexture(e), roughness: 0.06, metalness: 0 });
    const lk = e.lid || (A.spec.feathers ? [0.62, -0.62, 0.15] : [0.7, -0.72, 0.2]);
    m.userData.aa = { aaLid: { value: A.lidCol[0].clone() }, aaOpen: { value: new THREE.Vector2(1, 1) }, aaLidK: { value: new THREE.Vector3().fromArray(lk) } };
    m.onBeforeCompile = aaEyeCompile;
    return m;
  }
  // open: 0 closed .. 1 open. Birds blink with the lower lid, mammals and reptiles with the upper.
  function setEyes(R, open) {
    if (!R.eyeMat) return;
    // snakes have no eyelids (a clear scale covers the eye)
    if (R.noBlink) open = 1;
    const o = R.eyeMat.userData.aa.aaOpen.value;
    if (R.lowerBlink) o.set(lerp(0.55, 1, open), open); else o.set(open, lerp(0.75, 1, open));
    // lashes ride on the upper lid edge: turn them down about the eye's side axis as far as the lid moved
    if (R.lashes.length) {
      const lk = R.eyeMat.userData.aa.aaLidK.value, z0 = clamp(lk.x, -1, 1), z1 = clamp(lerp(lk.y + 0.04, lk.x, o.x), -1, 1);
      const a = Math.asin(z1) - Math.asin(z0);
      for (const l of R.lashes) l.rotation.x = a;
    }
  }

  const _m4 = new THREE.Matrix4();
  function eyeBasis(dir, q) {
    const Y = _v1.fromArray(dir).normalize(), Z = _v2.set(0, 1, 0).addScaledVector(Y, -Y.y);
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1);
    Z.normalize();
    const X = _v3.crossVectors(Y, Z);
    _m4.makeBasis(X, Y, Z);
    return q.setFromRotationMatrix(_m4);
  }

  // ---------- rig instantiation ----------
  let rigCount = 0;
  function instantiate(A) {
    const root = new THREE.Group();
    root.name = 'animal-' + A.id;
    const bones = {}, list = [];
    for (const d of A.defs) {
      const b = new THREE.Bone();
      b.name = d.name;
      b.position.copy(d.p);
      if (d.parent) { b.position.sub(A.rest[d.parent]); bones[d.parent].add(b); } else root.add(b);
      bones[d.name] = b; list.push(b);
    }
    root.updateMatrixWorld(true);
    const skel = new THREE.Skeleton(list);
    const meshes = [];
    for (const g of A.geos) {
      const m = new THREE.SkinnedMesh(g.geo, g.mat);
      m.castShadow = true; m.receiveShadow = false;
      root.add(m);
      m.bind(skel);
      if (m.morphTargetInfluences) m.morphTargetInfluences[0] = 0;
      meshes.push(m);
    }
    // eyes
    const eyes = [], lashes = [], eyeMat = A.eyeDefs.length ? eyeMaterial(A) : null;
    for (const e of A.eyeDefs) {
      const piv = new THREE.Group();
      piv.position.fromArray(e.p).sub(A.rest[e.bone]);
      const m = new THREE.Mesh(eyeGeo, eyeMat);
      m.scale.setScalar(e.r);
      eyeBasis(e.dir, m.quaternion);
      m.castShadow = true; m.receiveShadow = false;
      piv.add(m);
      piv.userData.r = e.r;
      // eyelashes (sculpted models): a group in the eye's frame, its inner mesh turns down with the upper lid
      if (e.lash) {
        const lg = new THREE.Group(), lm = new THREE.Mesh(A.lashGeo || (A.lashGeo = lashGeo(e)), lashMat || (lashMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0 })));
        eyeBasis(e.dir, lg.quaternion);
        lg.add(lm);
        piv.add(lg);
        lashes.push(lm);
      }
      bones[e.bone].add(piv);
      eyes.push(piv);
    }
    // rigid extras: geometry in local space placed at 'at' (rest root space), or in rest root space when 'at' is missing
    const extras = {}, extraList = [];
    for (const x of A.extras) {
      const m = new THREE.Mesh(x.geo, x.mat);
      if (x.at) m.position.fromArray(x.at).sub(A.rest[x.bone]); else m.position.copy(A.rest[x.bone]).negate();
      m.castShadow = true; m.receiveShadow = false;
      bones[x.bone].add(m);
      if (x.name) extras[x.name] = m;
      extraList.push(m);
    }
    const mouth = new THREE.Object3D();
    mouth.position.fromArray(A.spec.mouth).sub(A.rest[A.spec.mouthBone || 'head']);
    bones[A.spec.mouthBone || 'head'].add(mouth);
    rigCount++;
    const rnd = fract(rigCount * 0.61803398875 + 0.137);
    // remember rest local transforms (animators read userData.p0 live, setAge rewrites it in place)
    for (const nm in bones) { const b = bones[nm]; b.userData.p0 = b.position.clone(); }
    const rest = {};
    for (const nm in A.rest) rest[nm] = A.rest[nm].clone();
    return { root, bones, list, skel, meshes, eyes, lashes, eyeMat, lowerBlink: !!A.spec.feathers, noBlink: !!(A.spec.eyes && A.spec.eyes[0] && A.spec.eyes[0].noBlink), mouth, rnd, extras, extraList, rest, belly: A.belly.clone(), eat: A.eat0, age: 1, ageDrop: 0, hooks: [], sneezeReq: false, autoSneeze: true, onSneeze: null, detail: 1, shellM: {} };
  }

  // set proportions for an age (0 newborn .. 1 adult). Not per frame: lerps rest bones, eyes and mouth, sets the
  // baby morph influence, swaps to baby colors below age 0.4 and asks the animator to refresh its leg and neck constants.
  function applyAge(R, A, a) {
    const t = 1 - a, AG = A.age, defs = A.defs;
    for (let i = 0; i < defs.length; i++) {
      const b = R.list[i], nm = defs[i].name;
      b.userData.p0.lerpVectors(AG.local0[i], AG.local1[i], t);
      b.position.copy(b.userData.p0);
      R.rest[nm].lerpVectors(A.rest[nm], AG.rest1[nm], t);
    }
    for (let i = 0; i < R.eyes.length; i++) {
      const e = R.eyes[i], ea = AG.eyes[i];
      e.position.lerpVectors(ea.p0, ea.p1, t);
      e.children[0].scale.setScalar(e.userData.r * lerp(1, ea.s1, t));
      if (e.children[1]) e.children[1].scale.setScalar(lerp(1, ea.s1, t));
    }
    R.mouth.position.lerpVectors(AG.mouth0, AG.mouth1, t);
    for (let i = 0; i < R.extraList.length; i++) {
      const x = AG.extras[i];
      if (x) { R.extraList[i].position.lerpVectors(x.p0, x.p1, t); R.extraList[i].userData.s = lerp(1, x.s1, t); R.extraList[i].scale.setScalar(R.extraList[i].userData.s); }
    }
    R.belly.lerpVectors(A.belly, AG.belly1, t);
    for (const m of R.meshes) if (m.morphTargetInfluences) m.morphTargetInfluences[0] = t;
    const hs = Math.max(0.001, sstep(0.6, 1.0, a));
    for (const nm of AG.horns) R.bones[nm].scale.setScalar(hs);
    // baby colors (cached per species, built the first time a baby of that species appears)
    const baby = a < 0.4;
    if (baby && !AG.babyMats) {
      AG.babyMats = A.geos.map((g) => {
        if (g.babyMat) return g.babyMat();
        if (g.accent && g.geo.userData.babyColor) return g.mat;
        return null;
      });
    }
    for (let i = 0; i < R.meshes.length; i++) {
      const g = A.geos[i], m = R.meshes[i];
      if (g.babyMat) m.material = baby ? AG.babyMats[i] : g.mat;
      if (g.accent && g.geo.userData.babyColor) {
        // accent colors are per vertex; babies of a species share a second geometry with the baby color set
        if (!g.babyGeo) { g.babyGeo = g.geo.clone(); g.babyGeo.setAttribute('color', g.geo.userData.babyColor); g.babyGeo.morphAttributes = g.geo.morphAttributes; g.babyGeo.boundingSphere = g.geo.boundingSphere; }
        m.geometry = baby ? g.babyGeo : g.geo;
      }
    }
    if (R.eyeMat && A.lidCol) R.eyeMat.userData.aa.aaLid.value.copy(A.lidCol[baby ? 1 : 0]);
    // some babies have different eye colors (chicks: dark eyes)
    const e0 = A.spec.eyes && A.spec.eyes[0];
    if (R.eyeMat && e0 && e0.babyIris != null) R.eyeMat.map = baby ? eyeTexture(Object.assign({}, e0, { iris: e0.babyIris })) : eyeTexture(e0);
    R.ageDrop = AG.drop * t;
    R.eat = a >= 1 ? A.eat0 : computeEat(A, R.rest, R.ageDrop);
    R.age = a;
    syncShells(R, A);
    // baby down only shows on babies: decide after the new age is set
    if (A.spec.shell && A.spec.shell.babyOnly) setDetail(R, A, R.detail);
    syncCollar(R, A);
    for (const f of R.hooks) f();
  }

  // ---------- fur shells ----------
  // Offset layers of the coat that keep only strand tips: a soft, fuzzy outline. All layers of a rig live in one
  // geometry (vertex attribute 'shl' = layer 0..1), so they are one draw call. Detail 2 shells spec.shell.parts with
  // spec.shell.n layers; detail 1 shells only spec.shell.d1 (bushy tails, manes) with n1 layers.
  function shellGeo(A, lv) {
    A.shellGeo = A.shellGeo || {};
    if (A.shellGeo[lv] !== undefined) return A.shellGeo[lv];
    if (A.spec.shell && A.spec.shell.model) return (A.shellGeo[lv] = modelShellGeo(A, lv === 2 ? A.spec.shell.n : A.spec.shell.n1));
    const sp = A.spec.shell, parts = sp && (lv === 2 ? sp.parts : sp.d1);
    if (!parts || !parts.length) return (A.shellGeo[lv] = null);
    const n = lv === 2 ? sp.n || 4 : sp.n1 || 2;
    const g0 = A.geos[0].geo, idx = g0.index.array, map = new Map(), verts = [], tri = [];
    for (const p of A.furParts) {
      if (!parts.includes(p.name)) continue;
      for (let i = p.i0; i < p.i1; i++) {
        const v = idx[i];
        let k = map.get(v);
        if (k === undefined) { k = verts.length; map.set(v, k); verts.push(v); }
        tri.push(k);
      }
    }
    const nv = verts.length, g = new THREE.BufferGeometry();
    const copy = (src) => {
      const sz = src.itemSize, a = new src.array.constructor(nv * n * sz);
      for (let l = 0; l < n; l++) for (let i = 0; i < nv; i++) for (let c = 0; c < sz; c++) a[(l * nv + i) * sz + c] = src.array[verts[i] * sz + c];
      return new THREE.BufferAttribute(a, sz, src.normalized);
    };
    for (const k in g0.attributes) g.setAttribute(k, copy(g0.attributes[k]));
    if (g0.morphAttributes.position) { g.morphAttributes.position = g0.morphAttributes.position.map(copy); g.morphTargetsRelative = true; }
    const shl = new Float32Array(nv * n);
    for (let l = 0; l < n; l++) shl.fill((l + 1) / n, l * nv, (l + 1) * nv);
    g.setAttribute('shl', new THREE.BufferAttribute(shl, 1));
    const ix = new (nv * n > 65535 ? Uint32Array : Uint16Array)(tri.length * n);
    for (let l = 0; l < n; l++) for (let i = 0; i < tri.length; i++) ix[l * tri.length + i] = tri[i] + l * nv;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.boundingSphere = g0.boundingSphere;
    return (A.shellGeo[lv] = g);
  }
  function shellMat(A, baby) {
    A.shellMat = A.shellMat || [null, null];
    const k = baby ? 1 : 0;
    if (A.shellMat[k]) return A.shellMat[k];
    if (A.spec.shell.model) return (A.shellMat[k] = modelShellMat(A, baby));
    const sp = A.spec.shell, base = baby && A.age.babyMats && A.age.babyMats[0] ? A.age.babyMats[0] : A.geos[0].mat;
    const m = furMaterial(base.map, base.roughnessMap, 1, A.det, true);
    m.userData.aa.aaShell.value = sp.len * (baby ? sp.babyLen || 1.5 : 1);
    m.userData.aa.aaShellK.value.set(0.06, 0.48, sp.lean == null ? 0.35 : sp.lean);
    return (A.shellMat[k] = m);
  }
  // ----- fur shells on sculpted models -----
  // The model's furry triangles copied n times (attribute shl = layer 0..1, ffl = comb direction and fur length per
  // vertex, both from Blender). Each layer is pushed out along the normal by its share of the fur length and combed
  // along the flow (more toward the tips), and keeps only the strands of a dot pattern that reach that high: strands
  // that lean from the nose to the tail and down the legs, on any UV layout.
  function modelShellGeo(A, n) {
    const F = A.M && A.M.fur;
    if (!n || !F) return null;
    const g0 = A.geos[0].geo, idx = g0.index.array, fl = F.flen, map = new Map(), verts = [], tri = [];
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      if (Math.max(fl[a], fl[b], fl[c]) < 0.02) continue;
      for (const v of [a, b, c]) {
        let k = map.get(v);
        if (k === undefined) { k = verts.length; map.set(v, k); verts.push(v); }
        tri.push(k);
      }
    }
    const nv = verts.length, g = new THREE.BufferGeometry();
    const copy = (src) => {
      const sz = src.itemSize, a = new src.array.constructor(nv * n * sz);
      for (let l = 0; l < n; l++) for (let i = 0; i < nv; i++) for (let c = 0; c < sz; c++) a[(l * nv + i) * sz + c] = src.array[verts[i] * sz + c];
      return new THREE.BufferAttribute(a, sz, src.normalized);
    };
    for (const k in g0.attributes) g.setAttribute(k, copy(g0.attributes[k]));
    if (g0.morphAttributes.position) { g.morphAttributes.position = g0.morphAttributes.position.map(copy); g.morphTargetsRelative = true; }
    const shl = new Float32Array(nv * n), ffl = new Float32Array(nv * n * 4);
    for (let l = 0; l < n; l++) {
      shl.fill((l + 1) / n, l * nv, (l + 1) * nv);
      for (let i = 0; i < nv; i++) { const v = verts[i], o = (l * nv + i) * 4; ffl[o] = F.flow[v * 3]; ffl[o + 1] = F.flow[v * 3 + 1]; ffl[o + 2] = F.flow[v * 3 + 2]; ffl[o + 3] = fl[v]; }
    }
    g.setAttribute('shl', new THREE.BufferAttribute(shl, 1));
    g.setAttribute('ffl', new THREE.BufferAttribute(ffl, 4));
    const ix = new (nv * n > 65535 ? Uint32Array : Uint16Array)(tri.length * n);
    for (let l = 0; l < n; l++) for (let i = 0; i < tri.length; i++) ix[l * tri.length + i] = tri[i] + l * nv;
    g.setIndex(new THREE.BufferAttribute(ix, 1));
    g.boundingSphere = g0.boundingSphere;
    return g;
  }
  // strand dots, made once: R strand height (tapering to the tip), G strand id (for density); 32 x 32 strands a tile
  let furDotsC = null;
  function furDots() {
    if (furDotsC) return furDotsC;
    const N = 128, C = 32, cs = N / C, d = new Uint8Array(N * N * 4);
    for (let cy = 0; cy < C; cy++) for (let cx = 0; cx < C; cx++) {
      const px = (cx + 0.2 + 0.6 * hash3(cx, cy, 31)) * cs, py = (cy + 0.2 + 0.6 * hash3(cx, cy, 32)) * cs;
      const h = 0.4 + 0.6 * hash3(cx, cy, 33), id = hash3(cx, cy, 34), r = cs * (0.42 + 0.16 * hash3(cx, cy, 35));
      for (let y = Math.floor(py - r - 1); y <= Math.ceil(py + r + 1); y++) for (let x = Math.floor(px - r - 1); x <= Math.ceil(px + r + 1); x++) {
        const dd = Math.hypot(x + 0.5 - px, y + 0.5 - py) / r;
        if (dd >= 1) continue;
        const o = ((((y % N) + N) % N) * N + (((x % N) + N) % N)) * 4, v = h * (1 - dd * dd) * 255;
        if (v > d[o]) { d[o] = v; d[o + 1] = id * 255; }
      }
    }
    for (let i = 0; i < N * N; i++) d[i * 4 + 3] = 255;
    const t = new THREE.DataTexture(d, N, N, THREE.RGBAFormat);
    t.wrapS = t.wrapT = THREE.RepeatWrapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter;
    t.generateMipmaps = true; t.needsUpdate = true;
    return (furDotsC = t);
  }
  function aaMShellCompile(sh) {
    aaModelCompile.call(this, sh);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float shl;\nattribute vec4 ffl;\nuniform vec3 aaFur;\nvarying float vShl;\nvarying float vFl;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvShl = shl; vFl = ffl.w;\ntransformed += (normal * shl + ffl.xyz * (aaFur.y * shl * shl)) * (ffl.w * aaFur.x);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vShl;\nvarying float vFl;\nuniform sampler2D aaDots;\nuniform sampler2D aaFurMap;\nuniform vec3 aaFurK;')
      .replace('#include <map_fragment>', `#include <map_fragment>
#ifdef USE_UV
  vec2 aaD = texture2D(aaDots, vUv * aaFurK.x).rg;
  vec2 aaFm = texture2D(aaFurMap, vUv).rg;
  if (aaD.x * min(aaFm.x / max(vFl, 0.002), 1.0) < vShl || aaD.y > aaFm.y) discard;
  diffuseColor.rgb *= mix(aaFurK.y, 1.05, vShl);
#else
  discard;
#endif`);
  }
  function modelShellMat(A, baby) {
    const sp = A.spec.shell, M = A.M, base = modelMaterial(M, baby);
    base.userData.aa.aaFur = { value: new THREE.Vector3(sp.len * (baby ? sp.babyLen : 1), baby && sp.babyLean != null ? sp.babyLean : sp.lean, 0) };
    base.userData.aa.aaDots = { value: furDots() };
    base.userData.aa.aaFurMap = { value: M.maps.tex.fur || furDots() };
    base.userData.aa.aaFurK = { value: new THREE.Vector3((sp.uvm || 1) / ((sp.tile || 0.002) * 32), sp.shade == null ? 0.7 : sp.shade, 0) };
    base.onBeforeCompile = aaMShellCompile;
    base.customProgramCacheKey = () => 'aaMShell';
    // the fur map arrives with the other maps
    if (!M.maps.tex.fur && M.maps.ready !== M.maps.need) M.maps.waiters.push(() => { base.userData.aa.aaFurMap.value = M.maps.tex.fur || furDots(); });
    return base;
  }
  function syncShells(R, A) {
    for (const lv of [1, 2]) {
      const m = R.shellM[lv];
      if (!m) continue;
      m.material = shellMat(A, R.age < 0.4);
      if (m.morphTargetInfluences) m.morphTargetInfluences[0] = 1 - R.age;
    }
  }
  function setDetail(R, A, l) {
    R.detail = l;
    // far away the eyes are a pixel or two: skip their draw calls; eyelashes only show up close
    for (const e of R.eyes) e.visible = l > 0;
    for (const m of R.lashes) m.visible = l === 2;
    const sp = A.spec.shell;
    for (const lv of [1, 2]) {
      const want = l === lv && !!shellGeo(A, lv) && !(sp && sp.babyOnly && R.age >= 0.4);
      if (want && !R.shellM[lv]) {
        const m = new THREE.SkinnedMesh(shellGeo(A, lv), shellMat(A, R.age < 0.4));
        m.castShadow = false; m.receiveShadow = false;
        R.root.add(m);
        m.bind(R.skel, R.meshes[0].bindMatrix);
        if (m.morphTargetInfluences) m.morphTargetInfluences[0] = 1 - R.age;
        R.shellM[lv] = m;
      }
      if (R.shellM[lv]) R.shellM[lv].visible = want;
    }
    syncCollar(R, A);
  }

  // ---------- collars for pets ----------
  // A smooth band around the neck plus a round metal ID tag on a little split ring. The band is a slice of the neck
  // loft pushed out to its surface and skinned with the same bone weights as the coat under it, so it follows every
  // pose and the baby proportions (morph 0). Morph 1 lifts it onto the fur shells at detail 2. The tag rides on its own
  // bone ('ctag', added to every skeleton) that hangs it under gravity with a little swing.
  // Per species: part (loft), at [boneA, boneB, f] (a point near the loft path), tag (angle around the neck seen from
  // behind: 0 top, PI throat, PI / 2 side), w (band width), r (tag size), fit (extra gap) relative to the neck radius.
  const COLLAR = {
    fox: { at: ['neck2', 'head', 0.0] }, deer: { at: ['neck2', 'head', 0.5] }, moose: { at: ['neck2', 'head', -0.15], r: 0.8 },
    bunny: { at: ['neck', 'head', 0.5] }, squirrel: { at: ['neck', 'head', 0.45] },
    horse: { at: ['neck2', 'head', 0.4], r: 0.8 }, pig: { at: ['neck', 'head', 0.5], r: 0.7 }, goat: { at: ['neck2', 'head', 0.4] },
    otter: { at: ['neck', 'head', 0.3] }, hedgehog: { part: 'head', at: ['neck', 'head', 1.0], r: 0.8, w: 0.75 }, raccoon: { at: ['neck', 'head', 0.3] },
    weasel: { at: ['neck2', 'head', 0.55] },
    duck: { at: ['neck', 'neck2', 0.6] }, swan: { at: ['neck', 'neck2', 0.5] }, chicken: { at: ['neck', 'neck2', 0.5] },
    owl: { at: ['hips', 'neck', 0.97], w: 0.6, r: 0.55 }, parrot: { at: ['neck', 'head', 0.4] },
    frog: { at: ['chest', 'head', 0.7], tag: PI * 0.62, w: 0.6, r: 0.75 }, lizard: { at: ['neck', 'head', 0.3], tag: PI * 0.6 },
    turtle: { part: 'neck', at: ['neck', 'head', 0.95] }, snake: { at: ['s0', 's1', 0.5], tag: PI * 0.55 },
  };
  // segments around the neck; how far up the fur shells the band rides (fraction of the visible fur length)
  const COLLAR_N = 20, COLLAR_LIFT = 0.8;
  // fuzz factor of a loft surface at arc s, angle th (same noise as buildLoft)
  function loftFuzz(fp, L, s, th) {
    const fz = fp.fuzz || 0;
    if (!fz) return 1;
    const rs = L.rings, segs = L.segs, fzf = fp.fuzzFreq || 9, len = Math.max(L.len, 1e-6);
    let i = 0;
    while (i < rs.length - 2 && rs[i + 1].arc < s) i++;
    const f = clamp((s - rs[i].arc) / Math.max(1e-9, rs[i + 1].arc - rs[i].arc), 0, 1);
    const jf = (fract(th / TAU) * segs), j0 = Math.floor(jf), jt = jf - j0;
    const k = (ii, jj) => { const r = rs[ii], ends = sstep(0, 0.12, r.arc / len) * sstep(1, 0.88, r.arc / len); return 1 + fz * ends * (noise(ii * 0.9 + 0.5, ((jj % segs) / segs) * fzf, 3.7) - 0.45) * 2; };
    return lerp(lerp(k(i, j0), k(i, j0 + 1), jt), lerp(k(i + 1, j0), k(i + 1, j0 + 1), jt), f);
  }
  // surface point and outward normal of a loft at arc s, angle th (rest root space)
  const _cr = { C: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3(), w: 0, t: 0, b: 0, e: 2 }, _cs = [0, 0], _cs2 = [0, 0];
  function loftSurf(fp, L, s, th, P, Nrm) {
    ringAt(L, s, _cr);
    const k = loftFuzz(fp, L, s, th);
    sectionPoint(_cr.w, _cr.t, _cr.b, _cr.e, th, _cs);
    P.copy(_cr.C).addScaledVector(_cr.S, _cs[0] * k).addScaledVector(_cr.N, _cs[1] * k);
    sectionPoint(_cr.w, _cr.t, _cr.b, _cr.e, th + 0.01, _cs);
    sectionPoint(_cr.w, _cr.t, _cr.b, _cr.e, th - 0.01, _cs2);
    const tx = _cs[0] - _cs2[0], ty = _cs[1] - _cs2[1];
    Nrm.copy(_cr.S).multiplyScalar(-ty).addScaledVector(_cr.N, tx).normalize();
    return P;
  }
  function loftArcNear(L, p) {
    let best = 1e9, s = 0;
    const rs = L.rings;
    for (let i = 0; i < rs.length - 1; i++) {
      const a = rs[i].C, b = rs[i + 1].C;
      _v1.subVectors(b, a);
      const l2 = _v1.lengthSq(), t = l2 > 1e-12 ? clamp(_v2.subVectors(p, a).dot(_v1) / l2, 0, 1) : 0;
      const d = _v3.copy(a).addScaledVector(_v1, t).distanceToSquared(p);
      if (d < best) { best = d; s = lerp(rs[i].arc, rs[i + 1].arc, t); }
    }
    return s;
  }
  // How far other parts (the back of the head, jowls) bulge past the band surface in the plane at arc s, for each
  // angle in ths. With ag it measures the baby shape: every point goes through its bones' baby maps, and the band
  // surface is the adult one (pushed out by adultClear) carried along by the neck.
  const COLLAR_CLEAR = ['head', 'jowl', 'body', 'neck'];
  const _cb = new THREE.Vector3();
  function collarClear(pl, others, s, ths, ag, adultClear) {
    const out = ths.map(() => 0);
    if (!others.length) return out;
    const map = (p, w, mir, o) => {
      if (!ag) return o.copy(p);
      o.set(0, 0, 0);
      for (const [nm, ww] of w) {
        const n2 = mir && nm.endsWith('L') && ag.byName[nm.slice(0, -1) + 'R'] ? nm.slice(0, -1) + 'R' : nm;
        babyApply(ag.byName[n2], p, _cb);
        o.addScaledVector(_cb, ww);
      }
      return o;
    };
    const RG = { C: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3(), w: 0, t: 0, b: 0, e: 2 };
    ringAt(pl.L, s, RG);
    const w0 = pl.wAt(s), C = map(RG.C, w0, false, new THREE.Vector3());
    const S = map(_v1.copy(RG.C).addScaledVector(RG.S, 0.01), w0, false, new THREE.Vector3()).sub(C).normalize();
    let Nv = map(_v1.copy(RG.C).addScaledVector(RG.N, 0.01), w0, false, new THREE.Vector3()).sub(C);
    const T = new THREE.Vector3().crossVectors(S, Nv).normalize();
    Nv = new THREE.Vector3().crossVectors(T, S);
    const P = new THREE.Vector3(), Nn = new THREE.Vector3(), q = new THREE.Vector3(), Q = new THREE.Vector3(), Qm = new THREE.Vector3(), tmp = [0, 0];
    const base = [], ang = [];
    for (let j = 0; j < ths.length; j++) {
      loftSurf(pl.fp, pl.L, s, ths[j], P, Nn);
      if (adultClear) P.addScaledVector(Nn, adultClear[j]);
      q.subVectors(map(P, w0, false, Qm), C);
      base.push(Math.hypot(q.dot(S), q.dot(Nv))); ang.push(Math.atan2(q.dot(S), q.dot(Nv)));
    }
    const bin = (TAU / COLLAR_N) * 0.75;
    for (const o of others) {
      const rs = o.L.rings, wo = (a) => (o.starts ? skinAt(o.starts, o.fp.bones, a, o.fp.blend || 0.03) : [[o.fp.bones[0], 1]]);
      for (let m = 0; m < (o.fp.mirror ? 2 : 1); m++) {
        const side = (v) => { if (m) v.x = -v.x; return v; };
        for (let i = 0; i < rs.length - 1; i++) {
          const d0 = map(side(Q.copy(rs[i].C)), wo(rs[i].arc), m, Qm).sub(C).dot(T);
          const d1 = map(side(Q.copy(rs[i + 1].C)), wo(rs[i + 1].arc), m, Qm).sub(C).dot(T);
          if ((d0 > 0) === (d1 > 0)) continue;
          const sa = lerp(rs[i].arc, rs[i + 1].arc, d0 / (d0 - d1)), wa = wo(sa);
          ringAt(o.L, sa, RG);
          for (let k = 0; k < 48; k++) {
            const ph = (k / 48) * TAU, fz = loftFuzz(o.fp, o.L, sa, ph);
            sectionPoint(RG.w, RG.t, RG.b, RG.e, ph, tmp);
            side(Q.copy(RG.C).addScaledVector(RG.S, tmp[0] * fz).addScaledVector(RG.N, tmp[1] * fz));
            q.subVectors(map(Q, wa, m, Qm), C);
            const x = q.dot(S), y = q.dot(Nv), rho = Math.hypot(x, y), a = Math.atan2(x, y);
            for (let j = 0; j < ths.length; j++) {
              let da = Math.abs(a - ang[j]) % TAU; if (da > PI) da = TAU - da;
              if (da < bin && rho < base[j] * 1.8) out[j] = Math.max(out[j], rho - base[j]);
            }
          }
        }
      }
    }
    return out;
  }
  // collar layout for a species (before the skeleton is final: it decides where the tag bone goes)
  function collarPlan(spec, id, defs) {
    const cfg = Object.assign({ part: 'body', tag: PI, w: 1, r: 1, fit: 0 }, COLLAR[id] || spec.collar || {});
    const fp = (spec.fur || []).find((f) => f.name === cfg.part);
    if (!fp || !cfg.at) return null;
    const rest = {};
    for (const d of defs) rest[d.name] = d.p;
    const L = buildLoft(fp);
    const at = rest[cfg.at[0]].clone().lerp(rest[cfg.at[1]], cfg.at[2]);
    const s = loftArcNear(L, at);
    ringAt(L, s, _cr);
    const rN = (_cr.w + (_cr.t + _cr.b) * 0.5) * 0.5;
    const starts = fp.bones.length > 1 ? skinStarts(L, fp.bones, rest) : null;
    const wAt = (ss) => (starts ? skinAt(starts, fp.bones, ss, fp.blend || 0.03) : [[fp.bones[0], 1]]);
    const pl = {
      cfg, fp, L, s, rN, wAt,
      hw: Math.min(0.2 * rN * cfg.w, L.len * 0.1), thick: Math.max(0.055 * rN, 0.0005), gap: (0.025 + cfg.fit) * rN,
      tagR: 0.3 * rN * cfg.r, hang: new THREE.Vector3(), nOut: new THREE.Vector3(),
    };
    // pivot to the bottom of the tag (split ring plus the disc)
    pl.tagLen = pl.tagR * 0.34 * 1.45 + pl.tagR * 2;
    // clear other parts that bulge past the neck there (the back of the head, jowls)
    const others = (spec.fur || []).filter((f) => f !== fp && COLLAR_CLEAR.includes(f.name)).map((f) => {
      const Lo = buildLoft(f);
      return { fp: f, L: Lo, starts: f.bones.length > 1 ? skinStarts(Lo, f.bones, rest) : null };
    });
    const ths = [];
    for (let j = 0; j <= COLLAR_N; j++) ths.push((j / COLLAR_N) * TAU);
    pl.others = others; pl.ths = ths;
    pl.clear = [collarClear(pl, others, s - pl.hw, ths), collarClear(pl, others, s + pl.hw, ths)];
    pl.tagClear = [collarClear(pl, others, s - pl.hw, [cfg.tag]), collarClear(pl, others, s + pl.hw, [cfg.tag])];
    const ct = (pl.tagClear[0][0] + pl.tagClear[1][0]) * 0.5;
    loftSurf(fp, L, s, cfg.tag, pl.hang, pl.nOut);
    pl.hang.addScaledVector(pl.nOut, pl.gap + pl.thick + ct);
    // the tag bone hangs from the bone that carries most of the neck there
    const w = wAt(s);
    let bi = 0;
    for (let k = 1; k < w.length; k++) if (w[k][1] > w[bi][1]) bi = k;
    pl.parent = w[bi][0];
    return pl;
  }
  // baby pivot of the tag: where the neck surface under it goes; the tag itself stays round (a little larger)
  function collarBaby(ag, pl) {
    const mp = ag.byName.ctag, out = new THREE.Vector3(), tmp = new THREE.Vector3();
    for (const [nm, w] of pl.wAt(pl.s)) { babyApply(ag.byName[nm], pl.hang, tmp); out.addScaledVector(tmp, w); }
    if (ag.fluff) out.addScaledVector(pl.nOut, ag.fluff * 1.3);
    // a baby's bigger head can reach back over the neck: push the band (and the tag) out of it
    const e0 = pl.s - pl.hw, e1 = pl.s + pl.hw;
    pl.clearB = [collarClear(pl, pl.others, e0, pl.ths, ag, pl.clear[0]), collarClear(pl, pl.others, e1, pl.ths, ag, pl.clear[1])];
    const tb = (collarClear(pl, pl.others, e0, [pl.cfg.tag], ag, pl.tagClear[0])[0] + collarClear(pl, pl.others, e1, [pl.cfg.tag], ag, pl.tagClear[1])[0]) * 0.5;
    out.addScaledVector(pl.nOut, tb);
    mp.M = m3.scale(1.25);
    mp.c1.copy(out);
  }
  // fur length (paint C.fl) at a loft point, for sitting the band on the shells
  function collarFl(spec, pl, th) {
    const L = pl.L, P = { part: pl.fp.name, baby: false, len: L.len, arc: pl.s, v: pl.s / L.len, u: fract(th / TAU), up: Math.cos(th), sd: Math.sin(th) };
    const p = new THREE.Vector3(), n = new THREE.Vector3();
    loftSurf(pl.fp, L, pl.s, th, p, n);
    P.x = p.x; P.y = p.y; P.z = p.z; P.nx = n.x; P.ny = n.y; P.nz = n.z;
    const rr = (_cr.w + _cr.t) * 0.5 + 0.004;
    P.cx = Math.cos(th) * rr; P.cy = Math.sin(th) * rr;
    const C = { r: 0.5, g: 0.5, b: 0.5, ro: 0.8, me: 0, fl: pl.fp.fl == null ? 1 : pl.fp.fl };
    spec.paint(P, C);
    return clamp(C.fl, 0, 1.5);
  }
  // small parts in the tag's frame (pivot at the origin, hanging along -Y, face toward +Z)
  function discPart(c, r, th, n) {
    const pos = [], nrm = [], idx = [];
    for (const sg of [1, -1]) {
      const b = pos.length / 3;
      pos.push(c[0], c[1], c[2] + sg * th * 0.5); nrm.push(0, 0, sg);
      // faces shaded a little domed, like a stamped coin, so the metal catches the light
      for (let i = 0; i < n; i++) { const a = (i / n) * TAU; pos.push(c[0] + Math.cos(a) * r, c[1] + Math.sin(a) * r, c[2] + sg * th * 0.5); nrm.push(Math.cos(a) * 0.45, Math.sin(a) * 0.45, sg * 0.89); }
      for (let i = 0; i < n; i++) { const a = b + 1 + i, d = b + 1 + ((i + 1) % n); if (sg > 0) idx.push(b, a, d); else idx.push(b, d, a); }
    }
    const b = pos.length / 3;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, x = Math.cos(a), y = Math.sin(a);
      pos.push(c[0] + x * r, c[1] + y * r, c[2] + th * 0.5, c[0] + x * r, c[1] + y * r, c[2] - th * 0.5); nrm.push(x, y, 0, x, y, 0);
    }
    for (let i = 0; i < n; i++) { const a = b + i * 2, d = b + ((i + 1) % n) * 2; idx.push(a, a + 1, d, d, a + 1, d + 1); }
    return { pos, nrm, idx };
  }
  // ring in the Y-Z plane (axis X)
  function torusPart(c, R0, r0, n1, n2) {
    const pos = [], nrm = [], idx = [];
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
      const u = (i / n1) * TAU, v = (j / n2) * TAU, dy = Math.cos(u), dz = Math.sin(u), cv = Math.cos(v), sv = Math.sin(v);
      pos.push(c[0] + r0 * sv, c[1] + dy * (R0 + r0 * cv), c[2] + dz * (R0 + r0 * cv)); nrm.push(sv, dy * cv, dz * cv);
    }
    for (let i = 0; i < n1; i++) for (let j = 0; j < n2; j++) {
      const a = i * n2 + j, b = ((i + 1) % n1) * n2 + j, c2 = i * n2 + ((j + 1) % n2), d = ((i + 1) % n1) * n2 + ((j + 1) % n2);
      idx.push(a, b, c2, b, d, c2);
    }
    return { pos, nrm, idx };
  }
  // ----- collars on sculpted models: the band is a slice of the model's neck -----
  // Slice the mesh (flat positions, triangle list) with the plane through C normal to T and cast rays in it from C
  // (angle th from the top N toward the side S, like the lofts). Per angle: the farthest surface crossing (the outer
  // skin, jowls included) and, with wf, the skin weights there. sf (optional) is a per-vertex value read at the crossing
  // (fur length); maxR (optional) ignores crossings farther out (limbs).
  function meshSlice(pos, idx, wf, C, T, S, Nv, ths, sf, maxR = Infinity) {
    const out = ths.map(() => ({ r: 0, w: null, s: 0 })), d = [0, 0, 0], segs = [];
    const P2 = (v) => { const x = pos[v * 3] - C.x, y = pos[v * 3 + 1] - C.y, z = pos[v * 3 + 2] - C.z; return [x * S.x + y * S.y + z * S.z, x * Nv.x + y * Nv.y + z * Nv.z]; };
    for (let i = 0; i < idx.length; i += 3) {
      const t = [idx[i], idx[i + 1], idx[i + 2]];
      for (let k = 0; k < 3; k++) { const v = t[k]; d[k] = (pos[v * 3] - C.x) * T.x + (pos[v * 3 + 1] - C.y) * T.y + (pos[v * 3 + 2] - C.z) * T.z; }
      if ((d[0] > 0 && d[1] > 0 && d[2] > 0) || (d[0] <= 0 && d[1] <= 0 && d[2] <= 0)) continue;
      const pts = [];
      for (let k = 0; k < 3; k++) {
        const a = k, b = (k + 1) % 3;
        if ((d[a] > 0) === (d[b] > 0)) continue;
        const f = d[a] / (d[a] - d[b]), pa = P2(t[a]), pb = P2(t[b]);
        pts.push({ p: [lerp(pa[0], pb[0], f), lerp(pa[1], pb[1], f)], va: t[a], vb: t[b], f });
      }
      if (pts.length === 2) segs.push(pts);
    }
    for (let j = 0; j < ths.length; j++) {
      const dx = Math.sin(ths[j]), dy = Math.cos(ths[j]);
      let best = -1, bs = null, bu = 0;
      for (const sg of segs) {
        const a = sg[0].p, b = sg[1].p, ex = b[0] - a[0], ey = b[1] - a[1], den = dx * ey - dy * ex;
        if (Math.abs(den) < 1e-12) continue;
        const tt = (a[0] * ey - a[1] * ex) / den, u = (a[0] * dy - a[1] * dx) / den;
        if (u < -1e-6 || u > 1 + 1e-6 || tt <= 0 || tt > maxR) continue;
        if (tt > best) { best = tt; bs = sg; bu = clamp(u, 0, 1); }
      }
      out[j].r = Math.max(best, 0);
      // a per-vertex value at the crossing (fur length under the band)
      if (sf && bs) out[j].s = (sf[bs[0].va] * (1 - bs[0].f) + sf[bs[0].vb] * bs[0].f) * (1 - bu) + (sf[bs[1].va] * (1 - bs[1].f) + sf[bs[1].vb] * bs[1].f) * bu;
      if (wf && bs) {
        const m = new Map(), add = (v, k) => { for (const [n, w] of wf(v)) m.set(n, (m.get(n) || 0) + w * k); };
        add(bs[0].va, (1 - bs[0].f) * (1 - bu)); add(bs[0].vb, bs[0].f * (1 - bu)); add(bs[1].va, (1 - bs[1].f) * bu); add(bs[1].vb, bs[1].f * bu);
        out[j].w = Array.from(m.entries()).sort((p, q) => q[1] - p[1]).slice(0, 4);
      }
    }
    return out;
  }
  function collarPlanMesh(spec, id, defs, M) {
    const cfg = Object.assign({ tag: PI, w: 1, r: 1, fit: 0 }, COLLAR[id] || spec.collar || {}, M.md.collar || {});
    if (!cfg.at) return null;
    const rest = {};
    for (const d of defs) rest[d.name] = d.p;
    const a = rest[cfg.at[0]], b = rest[cfg.at[1]];
    // tilt (rad, optional): pitch the band's plane about the side axis (a frog's band slants to pass behind its arms)
    const T = b.clone().sub(a).normalize(), S = new THREE.Vector3(1, 0, 0).addScaledVector(T, -T.x).normalize();
    if (cfg.tilt) T.applyAxisAngle(S, cfg.tilt);
    const Nv = new THREE.Vector3().crossVectors(T, S);
    const ths = [];
    for (let j = 0; j <= COLLAR_N; j++) ths.push((j / COLLAR_N) * TAU);
    // center the slice on the neck outline
    const C = a.clone().lerp(b, cfg.at[2]);
    for (let it = 0; it < 2; it++) {
      const sl = meshSlice(M.pos, M.idx, null, C, T, S, Nv, ths, null, cfg.maxR);
      const c = new THREE.Vector3();
      for (let j = 0; j < COLLAR_N; j++) c.addScaledVector(S, Math.sin(ths[j]) * sl[j].r / COLLAR_N).addScaledVector(Nv, Math.cos(ths[j]) * sl[j].r / COLLAR_N);
      C.add(c);
    }
    const s0 = meshSlice(M.pos, M.idx, null, C, T, S, Nv, ths, null, cfg.maxR);
    let rN = 0;
    for (let j = 0; j < COLLAR_N; j++) rN += s0[j].r / COLLAR_N;
    const hw = 0.2 * rN * cfg.w;
    // both band edges, the widest skin across the band at each angle so nothing pokes through
    const fl = M.fur ? M.fur.flen : null;
    const ed = [-hw, hw].map((s) => meshSlice(M.pos, M.idx, M.weights, C.clone().addScaledVector(T, s), T, S, Nv, ths, fl, cfg.maxR));
    const r = ths.map((_, j) => Math.max(ed[0][j].r, ed[1][j].r, s0[j].r));
    // taper (optional): each edge rests on the skin under it (and the middle), so a band on a neck that widens into
    // the shoulders does not stand off at its narrow edge; without it the band is as wide as the widest skin
    const re = cfg.taper ? ed.map((q) => ths.map((_, j) => Math.max(q[j].r, s0[j].r))) : [r, r];
    // wb (optional): the band follows only these bones (share wbk, default 1, of its weights), so a band that sits
    // where the neck blends into the head does not lift off with the head when it goes down to eat
    const bw = (w0) => {
      if (!cfg.wb) return w0;
      const w = w0.filter((p) => cfg.wb.includes(p[0])), t = w.reduce((a, p) => a + p[1], 0), k = cfg.wbk == null ? 1 : cfg.wbk, m = new Map();
      if (!(t > 0)) return w0;
      for (const p of w0) m.set(p[0], (1 - k) * p[1]);
      for (const p of w) m.set(p[0], m.get(p[0]) + (k * p[1]) / t);
      return Array.from(m.entries()).filter((p) => p[1] > 0).sort((p, q) => q[1] - p[1]).slice(0, 4);
    };
    const pl = {
      mesh: true, cfg, C, T, S, N: Nv, ths, rN, hw, r, re, w: ed.map((e) => e.map((q) => bw(q.w || [['head', 1]]))),
      thick: Math.max(0.055 * rN, 0.0005), gap: (0.025 + cfg.fit) * rN, tagR: 0.3 * rN * cfg.r, hang: new THREE.Vector3(), nOut: new THREE.Vector3(),
    };
    pl.tagLen = pl.tagR * 0.34 * 1.45 + pl.tagR * 2;
    const dir = (th, o) => o.copy(S).multiplyScalar(Math.sin(th)).addScaledVector(Nv, Math.cos(th));
    const st = meshSlice(M.pos, M.idx, M.weights, C, T, S, Nv, [cfg.tag], fl, cfg.maxR)[0];
    // fur under the band (sculpted coats): the band rides on top of the fur shells
    pl.fl = ed[0].map((q, j) => Math.max(q.s, ed[1][j].s));
    pl.flTag = st.s;
    dir(cfg.tag, pl.nOut);
    pl.hang.copy(C).addScaledVector(pl.nOut, st.r + pl.gap + pl.thick);
    pl.dir = dir;
    pl.parent = (st.w && st.w[0] && st.w[0][0]) || cfg.at[0];
    return pl;
  }
  // baby fit: slice the baby-shaped mesh (morph applied, bones at their baby rest) and push the band out where the
  // bigger baby head would come through it; the tag pivot goes to the baby band
  function collarBabyMesh(ag, pl, bt) {
    const nv = bt.pos.length / 3, P = new Array(nv * 3);
    for (let v = 0; v < nv; v++) {
      let ox = 0, oy = 0, oz = 0;
      for (let k = 0; k < 4; k++) {
        const w = bt.sw[v * 4 + k]; if (!w) continue;
        const mp = ag.maps[bt.si[v * 4 + k]];
        ox += w * (mp.c1.x - mp.c0.x); oy += w * (mp.c1.y - mp.c0.y); oz += w * (mp.c1.z - mp.c0.z);
      }
      P[v * 3] = bt.pos[v * 3] + bt.mor[v * 3] + ox; P[v * 3 + 1] = bt.pos[v * 3 + 1] + bt.mor[v * 3 + 1] + oy; P[v * 3 + 2] = bt.pos[v * 3 + 2] + bt.mor[v * 3 + 2] + oz;
    }
    const a1 = ag.byName[pl.cfg.at[0]].c1, b1 = ag.byName[pl.cfg.at[1]].c1;
    const T = b1.clone().sub(a1).normalize(), S = new THREE.Vector3(1, 0, 0).addScaledVector(T, -T.x).normalize();
    if (pl.cfg.tilt) T.applyAxisAngle(S, pl.cfg.tilt);
    const Nv = new THREE.Vector3().crossVectors(T, S);
    // where the skin under the band goes in the baby (each outline point through its own bone maps)
    const map = (p, w, o) => { o.set(0, 0, 0); for (const [n, ww] of w) o.addScaledVector(babyApply(ag.byName[n], p, _v1), ww); return o; };
    const q = new THREE.Vector3(), Pb = [[], []], C = new THREE.Vector3();
    for (let e = 0; e < 2; e++) for (let j = 0; j <= COLLAR_N; j++) {
      q.copy(pl.C).addScaledVector(pl.T, e ? pl.hw : -pl.hw).add(pl.dir(pl.ths[j], _v2).multiplyScalar(pl.re[e][j]));
      Pb[e].push(map(q, pl.w[e][j], new THREE.Vector3()));
      if (j < COLLAR_N) C.addScaledVector(Pb[e][j], 0.5 / COLLAR_N);
    }
    const k = a1.distanceTo(b1) / Math.max(1e-6, ag.byName[pl.cfg.at[0]].c0.distanceTo(ag.byName[pl.cfg.at[1]].c0));
    // optional (sculpted birds, whose baby has its own shape): babyAt moves the baby's band along the neck (same
    // 0..1 between the two bones as at[2]) and hug lets it come in as well as go out, so it sits on the baby's neck
    if (pl.cfg.babyAt != null) {
      pl.shiftB = T.clone().multiplyScalar((pl.cfg.babyAt - pl.cfg.at[2]) * a1.distanceTo(b1));
      C.add(pl.shiftB);
    }
    const mr = pl.cfg.babyMaxR != null ? pl.cfg.babyMaxR : pl.cfg.maxR;
    const sl = [-1, 0, 1].map((s) => meshSlice(P, bt.idx, null, C.clone().addScaledVector(T, s * pl.hw * k), T, S, Nv, pl.ths, null, mr));
    pl.push = [[], []];
    const rsl = pl.ths.map((_, j) => Math.max(sl[0][j].r, sl[1][j].r, sl[2][j].r));
    // a hugging band follows the neck's outline smoothed around the ring (no zigzag over small bumps)
    const sm = (a) => (pl.cfg.hug ? a.map((_, j) => { let t = 0; for (let d = -2; d <= 2; d++) t += a[(((j + d) % COLLAR_N) + COLLAR_N) % COLLAR_N]; return t / 5; }) : a);
    const rsm = sm(rsl);
    // a tapered band: each edge on its own slice (and the middle one)
    const rse = pl.cfg.taper ? [0, 2].map((s) => sm(pl.ths.map((_, j) => Math.max(sl[s][j].r, sl[1][j].r)))) : null;
    for (let e = 0; e < 2; e++) for (let j = 0; j <= COLLAR_N; j++) {
      const rs = rse ? rse[e][j] : rsm[j];
      _v3.subVectors(Pb[e][j], C);
      if (pl.shiftB) _v3.add(pl.shiftB);
      _v3.addScaledVector(T, -_v3.dot(T));
      pl.push[e].push(pl.cfg.hug ? rs - _v3.length() : Math.max(0, rs - _v3.length()));
    }
    const tj = Math.round(fract(pl.cfg.tag / TAU) * COLLAR_N), mp = ag.byName.ctag;
    mp.c1.copy(C).add(_v4.copy(S).multiplyScalar(Math.sin(pl.cfg.tag)).addScaledVector(Nv, Math.cos(pl.cfg.tag)).multiplyScalar(Math.max(sl[0][tj].r, sl[1][tj].r, sl[2][tj].r) + (pl.gap + pl.thick) * Math.max(1.25, pl.cfg.babyK || 0)));
    mp.M = m3.scale(Math.max(1.25, pl.cfg.babyK || 0));
  }
  function collarGeoMesh(A) {
    const pl = A.cplan, N = COLLAR_N, bt = newBatch(A.ag), dep = pl.thick * 0.8, sp = A.spec.shell;
    const pos = [], nrm = [], col = [], wts = [], idx = [], outN = [], push = [], lift = [], ex = [];
    const furOn = !!(sp && sp.model && pl.fl && Math.max(...pl.fl) > 0.02);
    const P = new THREE.Vector3(), D = new THREE.Vector3();
    // babyK (optional): the baby's band is this much thicker and wider than the adult's, before the body scale
    const bk = pl.cfg.babyK ? pl.cfg.babyK - 1 : 0;
    const exAdd = (D, ro, e) => ex.push(bk * (D.x * ro + pl.T.x * (e ? pl.hw : -pl.hw)), bk * (D.y * ro + pl.T.y * (e ? pl.hw : -pl.hw)), bk * (D.z * ro + pl.T.z * (e ? pl.hw : -pl.hw)));
    for (let j = 0; j <= N; j++) {
      pl.dir(pl.ths[j], D);
      for (let e = 0; e < 2; e++) {
        P.copy(pl.C).addScaledVector(pl.T, e ? pl.hw : -pl.hw).addScaledVector(D, pl.re[e][j]);
        const w = pl.w[e][j], inner = P.clone().addScaledVector(D, pl.gap - dep), outer = P.clone().addScaledVector(D, pl.gap + pl.thick);
        const tn = pl.T.clone().multiplyScalar(e ? 1 : -1);
        // lift (optional): how far up the fur the band rides, instead of COLLAR_LIFT (a chick's long down: the band sinks in)
        const v = e ? [[outer, tn, 0.72, 1], [inner, tn, 0.72, 0.4]] : [[inner, tn, 0.72, 0.4], [outer, tn, 0.72, 1]], up = furOn ? sp.len * pl.fl[j] * (pl.cfg.lift == null ? COLLAR_LIFT : pl.cfg.lift) : 0;
        for (const qq of v) { pos.push(qq[0].x, qq[0].y, qq[0].z); nrm.push(qq[1].x, qq[1].y, qq[1].z); col.push(qq[2]); wts.push(w); outN.push(D.x, D.y, D.z); push.push(pl.push ? pl.push[e][j] : 0); lift.push(D.x * up * qq[3], D.y * up * qq[3], D.z * up * qq[3]); exAdd(D, qq[0] === outer ? pl.gap + pl.thick : pl.gap - dep, e); }
        pos.push(outer.x, outer.y, outer.z); nrm.push(D.x, D.y, D.z); col.push(1); wts.push(w); outN.push(D.x, D.y, D.z); push.push(pl.push ? pl.push[e][j] : 0); lift.push(D.x * up, D.y * up, D.z * up); exAdd(D, pl.gap + pl.thick, e);
      }
    }
    for (let j = 0; j < N; j++) {
      const a = j * 6, b = a + 6;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
      idx.push(a + 2, a + 5, b + 2, a + 5, b + 5, b + 2);
      idx.push(a + 3, a + 4, b + 3, a + 4, b + 4, b + 3);
    }
    const nb = pos.length / 3;
    pushPart(bt, { pos, nrm, idx, weights: (v) => wts[v], fluff: false }, A.boneIndex, () => [0, 0], (v) => [col[v], col[v], col[v]], false);
    const r = pl.tagR, rr = r * 0.34, H = pl.hang;
    for (const qq of [torusPart([H.x, H.y - rr * 0.6, H.z], rr, rr * 0.24, 7, 3), discPart([H.x, H.y - rr * 1.45 - r, H.z], r, r * 0.16, 14)]) {
      qq.weights = () => [['ctag', 1]]; qq.fluff = false; pushPart(bt, qq, A.boneIndex, () => [1, 0], () => [1, 1, 1], false);
    }
    const g = batchGeometry(bt, true), m = g.morphAttributes.position[0];
    const sb = pl.shiftB || new THREE.Vector3();
    for (let v = 0; v < nb; v++) m.setXYZ(v, m.getX(v) + outN[v * 3] * push[v] + sb.x + ex[v * 3], m.getY(v) + outN[v * 3 + 1] * push[v] + sb.y + ex[v * 3 + 1], m.getZ(v) + outN[v * 3 + 2] * push[v] + sb.z + ex[v * 3 + 2]);
    const lf = new Float32Array(g.attributes.position.count * 3);
    lf.set(lift);
    g.morphAttributes.position.push(new THREE.Float32BufferAttribute(lf, 3));
    g.boundingSphere = A.geos[0].geo.boundingSphere;
    A.collarShellOn = furOn;
    return (A.collarGeo = g);
  }
  // shared per species: band slice + tag, uv.x = 1 on metal; morph 0 baby, morph 1 lift onto the fur shells
  function collarGeo(A) {
    if (A.collarGeo) return A.collarGeo;
    if (A.cplan.mesh) return collarGeoMesh(A);
    const pl = A.cplan, spec = A.spec, sp = spec.shell, N = COLLAR_N, bt = newBatch(A.ag);
    const shellOn = !!(sp && sp.parts && sp.parts.includes(pl.fp.name));
    const P = new THREE.Vector3(), Nn = new THREE.Vector3(), lift = [], outN = [];
    const pos = [], nrm = [], col = [], wts = [], idx = [];
    const edges = [pl.s - pl.hw, pl.s + pl.hw], dep = pl.thick * 0.8;
    const T = [];
    for (const s of edges) { ringAt(pl.L, s, _cr); _v4.subVectors(ringAt(pl.L, Math.min(pl.L.len, s + 0.002), { C: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3() }).C, _cr.C); T.push(_v4.lengthSq() > 1e-14 ? _v4.clone().normalize() : new THREE.Vector3(0, 0, 1)); }
    for (let j = 0; j <= N; j++) {
      const th = (j / N) * TAU, fl = shellOn ? collarFl(spec, pl, th) : 0;
      const up = shellOn ? sp.len * fl * COLLAR_LIFT : 0;
      for (let e = 0; e < 2; e++) {
        loftSurf(pl.fp, pl.L, edges[e], th, P, Nn);
        P.addScaledVector(Nn, pl.clear[e][j]);
        const w = pl.wAt(edges[e]), inner = P.clone().addScaledVector(Nn, pl.gap - dep), outer = P.clone().addScaledVector(Nn, pl.gap + pl.thick);
        const tn = T[e].clone().multiplyScalar(e ? 1 : -1);
        // side face (inner, outer) then the top edge
        const v = e ? [[outer, tn, 0.72, 1], [inner, tn, 0.72, 0.4]] : [[inner, tn, 0.72, 0.4], [outer, tn, 0.72, 1]];
        for (const q of v) { pos.push(q[0].x, q[0].y, q[0].z); nrm.push(q[1].x, q[1].y, q[1].z); col.push(q[2]); wts.push(w); lift.push(Nn.x * up * q[3], Nn.y * up * q[3], Nn.z * up * q[3]); outN.push(Nn.x, Nn.y, Nn.z); }
        pos.push(outer.x, outer.y, outer.z); nrm.push(Nn.x, Nn.y, Nn.z); col.push(1); wts.push(w); lift.push(Nn.x * up, Nn.y * up, Nn.z * up); outN.push(Nn.x, Nn.y, Nn.z);
      }
    }
    // per column: 0 back inner, 1 back outer, 2 back top, 3 front side outer, 4 front side inner, 5 front top
    for (let j = 0; j < N; j++) {
      const a = j * 6, b = a + 6;
      idx.push(a, a + 1, b, a + 1, b + 1, b);
      idx.push(a + 2, a + 5, b + 2, a + 5, b + 5, b + 2);
      idx.push(a + 3, a + 4, b + 3, a + 4, b + 4, b + 3);
    }
    const band = { pos, nrm, idx, weights: (v) => wts[v], fluff: false };
    const nb = pos.length / 3;
    pushPart(bt, band, A.boneIndex, (v) => [0, 0], (v) => [col[v], col[v], col[v]], false);
    // tag on a split ring, in rest root space at the hang point
    const r = pl.tagR, rr = r * 0.34, H = pl.hang;
    const parts = [torusPart([H.x, H.y - rr * 0.6, H.z], rr, rr * 0.24, 7, 3), discPart([H.x, H.y - rr * 1.45 - r, H.z], r, r * 0.16, 14)];
    for (const q of parts) { q.weights = () => [['ctag', 1]]; q.fluff = false; pushPart(bt, q, A.boneIndex, () => [1, 0], () => [1, 1, 1], false); }
    const g = batchGeometry(bt, true);
    // babies: the band rides on top of the down (birds, kits) and clears a bigger head
    {
      const m = g.morphAttributes.position[0], f = A.ag.fluff * 1.3;
      for (let v = 0; v < nb; v++) {
        const j = Math.floor(v / 6), e = Math.floor((v % 6) / 3), k = f + pl.clearB[e][j];
        m.setXYZ(v, m.getX(v) + outN[v * 3] * k, m.getY(v) + outN[v * 3 + 1] * k, m.getZ(v) + outN[v * 3 + 2] * k);
      }
    }
    const lf = new Float32Array(g.attributes.position.count * 3);
    lf.set(lift);
    g.morphAttributes.position.push(new THREE.Float32BufferAttribute(lf, 3));
    g.boundingSphere = A.geos[0].geo.boundingSphere;
    A.collarShellOn = shellOn;
    return (A.collarGeo = g);
  }
  // band color from the caller; the tag is gold, or silver on yellow and orange bands
  function collarCompile(sh) {
    Object.assign(sh.uniforms, this.userData.aa);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying float vAaMet;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvAaMet = uv.x;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying float vAaMet;\nuniform vec3 aaBand;\nuniform vec3 aaTag;')
      .replace('#include <color_fragment>', '#include <color_fragment>\n  diffuseColor.rgb *= mix(aaBand, aaTag, vAaMet);')
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n  roughnessFactor = mix(roughnessFactor, 0.3, vAaMet);')
      .replace('#include <metalnessmap_fragment>', '#include <metalnessmap_fragment>\n  metalnessFactor = 0.55 * vAaMet;')
      .replace('#include <lights_fragment_end>', `#include <lights_fragment_end>
{
  // no environment map in the game: a soft fake sky reflection keeps the metal bright
  float aaF = pow(1.0 - saturate(dot(normal, geometry.viewDir)), 2.0);
  reflectedLight.indirectSpecular += vAaMet * diffuseColor.rgb * (0.35 + 0.65 * aaF) * (irradiance * RECIPROCAL_PI + 0.15);
}`);
  }
  const collarMats = {};
  function collarMat(c) {
    if (collarMats[c]) return collarMats[c];
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6, metalness: 0, vertexColors: true });
    const band = linColor(c), hsl = {};
    new THREE.Color(c).getHSL(hsl);
    const silver = hsl.h > 0.07 && hsl.h < 0.19 && hsl.s > 0.35 && hsl.l > 0.3;
    m.userData.aa = { aaBand: { value: band }, aaTag: { value: linColor(silver ? 0xD4D8DE : 0xE9B740) } };
    m.onBeforeCompile = collarCompile;
    return (collarMats[c] = m);
  }
  // visibility and morphs (age, fur shells) for the rig's current state
  function syncCollar(R, A) {
    const m = R.collarM;
    if (!m) return;
    const on = R.collarC != null && R.detail > 0;
    // coming back into view: the tag starts hanging still instead of swinging from stale motion
    if (on && !m.visible) R.ct.init = false;
    m.visible = on;
    const sp = A.spec.shell, baby = R.age < 0.4;
    const shells = R.detail === 2 && A.collarShellOn && !!shellGeo(A, 2) && !(sp.babyOnly && !baby);
    m.morphTargetInfluences[0] = 1 - R.age;
    m.morphTargetInfluences[1] = shells ? (baby ? sp.babyLen || 1.5 : 1) : 0;
    R.collarLift = m.morphTargetInfluences[1] * (A.collarLiftAt || 0);
  }
  function setCollar(R, A, c) {
    if (typeof c === 'string') c = new THREE.Color(c).getHex();
    const on = typeof c === 'number' && isFinite(c) && !!A.cplan;
    R.collarC = on ? (c & 0xffffff) : null;
    if (on && !R.collarM) {
      const m = new THREE.SkinnedMesh(collarGeo(A), collarMat(R.collarC));
      m.castShadow = false; m.receiveShadow = false;
      R.root.add(m);
      m.bind(R.skel, R.meshes[0].bindMatrix);
      R.collarM = m;
      R.ct = { dir: new THREE.Vector3(0, -1, 0), vel: new THREE.Vector3(), pp: new THREE.Vector3(), pv: new THREE.Vector3(), spd: 0, init: false };
      // fur lift of the tag pivot: the band's lift at the tag angle
      const pl = A.cplan, sp = A.spec.shell;
      A.collarLiftAt = A.collarShellOn ? sp.len * (pl.mesh ? pl.flTag : collarFl(A.spec, pl, pl.cfg.tag)) * (pl.cfg.lift == null ? COLLAR_LIFT : pl.cfg.lift) : 0;
    }
    if (R.collarM) { if (on) R.collarM.material = collarMat(R.collarC); syncCollar(R, A); }
    if (on) { R.ct.init = false; collarUpdate(R, A, 0, null); }
  }
  // hang the tag: gravity (root space), kept on the outside of the neck, springing behind the pivot's motion
  const _cq = new THREE.Quaternion(), _cq2 = new THREE.Quaternion(), _cg = new THREE.Vector3(), _cn = new THREE.Vector3(), _cp = new THREE.Vector3();
  const _cx = new THREE.Vector3(), _cy = new THREE.Vector3(), _cz = new THREE.Vector3(), _ct = new THREE.Vector3(), _cm = new THREE.Matrix4();
  function collarUpdate(R, A, dt, st) {
    const C = R.ct, tag = R.bones.ctag, pl = A.cplan;
    tag.position.copy(tag.userData.p0).addScaledVector(pl.nOut, R.collarLift || 0);
    rootQuat(tag.parent, R.root, _cq);
    _cn.copy(pl.nOut).applyQuaternion(_cq);
    _cg.set(0, -1, 0).applyQuaternion(_cq2.copy(R.root.quaternion).invert());
    rootPos(tag, R.root, _cp);
    _ct.copy(_cg);
    if (!C.init || !(dt > 0)) {
      C.pp.copy(_cp); C.pv.set(0, 0, 0); C.vel.set(0, 0, 0); C.spd = st ? +st.speed || 0 : 0; C.init = true;
      C.dir.copy(_cg);
    } else {
      // pivot acceleration in root space (animation) plus the body speeding up or slowing down
      _cx.subVectors(_cp, C.pp).divideScalar(dt);
      _cy.subVectors(_cx, C.pv).divideScalar(dt);
      C.pp.copy(_cp); C.pv.copy(_cx);
      const spd = st ? +st.speed || 0 : 0;
      _cy.z += (spd - C.spd) / dt; C.spd = spd;
      if (_cy.lengthSq() > 400) _cy.setLength(20);
      _ct.multiplyScalar(9.8).addScaledVector(_cy, -0.3).normalize();
    }
    // never into the neck: clamp the direction to a cone around the outward normal (it lies along the fur instead)
    const keep = (v) => {
      const k = v.dot(_cn);
      if (k >= 0.3) return;
      v.addScaledVector(_cn, -k);
      if (v.lengthSq() < 1e-8) v.set(0, -1, 0).addScaledVector(_cn, _cn.y);
      if (v.lengthSq() < 1e-8) v.set(0, 0, -1).addScaledVector(_cn, _cn.z);
      v.normalize().multiplyScalar(0.954).addScaledVector(_cn, 0.3);
    };
    keep(_ct);
    if (dt > 0 && C.init) {
      const n = Math.min(8, Math.ceil(dt / 0.016)), h = dt / n;
      for (let i = 0; i < n; i++) {
        _cz.subVectors(_ct, C.dir).multiplyScalar(110 * h);
        C.vel.add(_cz).multiplyScalar(1 - Math.min(0.9, 5 * h));
        C.dir.addScaledVector(C.vel, h).normalize();
      }
    } else C.dir.copy(_ct);
    keep(C.dir);
    // low animals (and babies, whose tags are a bit bigger): the tag swings forward instead of into the ground
    if (_cg.y < -0.8) {
      const len = pl.tagLen * lerp(1.25, 1, R.age), lim = clamp((_cp.y - 0.003) / len, -1, 1);
      if (C.dir.y < -lim) {
        _cz.set(C.dir.x, 0, C.dir.z);
        if (_cz.lengthSq() < 1e-6) _cz.set(_cn.x, 0, _cn.z);
        if (_cz.lengthSq() < 1e-6) _cz.set(0, 0, 1);
        _cz.normalize().multiplyScalar(Math.sqrt(Math.max(0, 1 - lim * lim)));
        C.dir.set(_cz.x, -lim, _cz.z);
        C.vel.y = Math.max(0, C.vel.y);
      }
    }
    // basis: hang along -Y, face (+Z) out from the neck
    _cy.copy(C.dir).negate();
    _cz.copy(_cn).addScaledVector(_cy, -_cn.dot(_cy));
    if (_cz.lengthSq() < 1e-6) _cz.set(0, 0, 1).addScaledVector(_cy, -_cy.z);
    _cz.normalize();
    _cx.crossVectors(_cy, _cz);
    _cm.makeBasis(_cx, _cy, _cz);
    tag.quaternion.setFromRotationMatrix(_cm).premultiply(_cq.invert());
  }

  const ANIM = { legged: animLegged, bird: animBird, snake: animSnake };

  function build(id) {
    if (!SPEC[id]) id = 'fox';
    const A = getAssets(id);
    const R = instantiate(A);
    const sz = A.spec.size, an = A.spec.anim;
    const upd = ANIM[an.type](R, A);
    const rig = {
      id,
      root: R.root,
      length: sz.length, height: sz.height, radius: sz.radius, eyeHeight: sz.eyeHeight,
      stride: an.stride, floatDepth: an.floatDepth || 0,
      walkSpeed: an.walk, runSpeed: an.run,
      climbs: !!an.climb, flies: !!an.canFly,
      age: 1,
      autoSneeze: true, onSneeze: null,
      mouthWorld(out) { R.mouth.updateWorldMatrix(true, false); return out.setFromMatrixPosition(R.mouth.matrixWorld); },
      update(dt, st) {
        R.autoSneeze = rig.autoSneeze; R.onSneeze = rig.onSneeze; upd(dt, st || {});
        if (R.collarC != null && R.detail > 0) collarUpdate(R, A, clamp(dt || 0, 0, 0.1), st);
      },
      setVisible(v) { R.root.visible = !!v; },
      setAge(a) {
        a = clamp(+a, 0, 1);
        if (!(a >= 0)) a = 1;
        if (Math.abs(a - R.age) < 1e-4) return;
        applyAge(R, A, a);
        rig.age = a;
        // sizes stay in the rig's own (unscaled) units; the baby skeleton sits lower on its shorter legs
        rig.height = sz.height - R.ageDrop; rig.eyeHeight = sz.eyeHeight - R.ageDrop;
        rig.floatDepth = an.floatDepth ? Math.max(0, an.floatDepth - R.ageDrop) : 0;
      },
      // the game calls this when it plays a sneeze sound; from then on this rig only sneezes on request
      sneeze() { R.sneezeReq = true; rig.autoSneeze = false; },
      // 0 far away, 1 normal, 2 close-up (the player's own animal): fur shells
      setDetail(l) { l = clamp(Math.round(+l || 0), 0, 2); if (l !== R.detail) setDetail(R, A, l); },
      // pets with a home wear a collar with an ID tag: a hex color shows it in that color, null or false hides it
      setCollar(c) { setCollar(R, A, c); },
    };
    R.rig = rig;
    setDetail(R, A, 1);
    upd(0, { t: 0, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0 });
    return rig;
  }

  return { ids, build, ready };
})();
