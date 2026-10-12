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
  function skinLoft(L, names, rest, blend) {
    const R = L.rings.length, starts = [];
    for (let k = 0; k < names.length; k++) {
      if (k === 0) { starts.push(-1e9); continue; }
      const p = rest[names[k]];
      let best = 1e9, bi = 0;
      for (let i = 0; i < R; i++) { const d = L.rings[i].C.distanceToSquared(p); if (d < best) { best = d; bi = i; } }
      starts.push(L.rings[bi].arc);
    }
    const ringW = [];
    for (let i = 0; i < R; i++) {
      const s = L.rings[i].arc;
      let k = 0;
      while (k < names.length - 1 && s >= starts[k + 1]) k++;
      const w = new Map();
      w.set(k, 1);
      if (k + 1 < names.length) { const f = 1 - sstep(starts[k + 1] - blend, starts[k + 1] + blend, s); const g = 1 - f; if (g > 0.001) { w.set(k + 1, g); w.set(k, f); } }
      if (k > 0) { const g = 1 - sstep(starts[k] - blend, starts[k] + blend, s); if (g > 0.001) { const cur = w.get(k); w.set(k - 1, g * cur); w.set(k, cur * (1 - g)); } }
      ringW.push(Array.from(w.entries()).map(([kk, ww]) => [names[kk], ww]));
    }
    return ringW;
  }

  // ---------- geometry assembly ----------
  // A "part" is a loft or custom mesh with per-vertex bone weights. Parts are merged per material into one skinned geometry.
  function newBatch() { return { pos: [], nrm: [], uv: [], col: [], si: [], sw: [], idx: [] }; }
  function pushPart(bt, P, boneIndex, uvFn, colFn, mirror) {
    const base = bt.pos.length / 3, nv = P.pos.length / 3;
    for (let v = 0; v < nv; v++) {
      const x = P.pos[v * 3], y = P.pos[v * 3 + 1], z = P.pos[v * 3 + 2];
      bt.pos.push(mirror ? -x : x, y, z);
      bt.nrm.push(mirror ? -P.nrm[v * 3] : P.nrm[v * 3], P.nrm[v * 3 + 1], P.nrm[v * 3 + 2]);
      const uv = uvFn ? uvFn(v) : [0, 0];
      bt.uv.push(uv[0], uv[1]);
      const c = colFn ? colFn(v, x, y, z) : [1, 1, 1];
      bt.col.push(s2l(c[0]), s2l(c[1]), s2l(c[2]));
      const ws = P.weights(v);
      const four = [[0, 0], [0, 0], [0, 0], [0, 0]];
      let tot = 0;
      for (let k = 0; k < Math.min(4, ws.length); k++) { let nm = ws[k][0]; if (mirror) nm = mirrorName(nm, boneIndex); four[k] = [boneIndex[nm], ws[k][1]]; tot += ws[k][1]; }
      for (let k = 0; k < 4; k++) { bt.si.push(four[k][0] || 0); bt.sw.push(tot > 0 ? four[k][1] / tot : (k === 0 ? 1 : 0)); }
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
    if (withColor) g.setAttribute('color', new THREE.Float32BufferAttribute(bt.col, 3));
    g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(bt.si, 4));
    g.setAttribute('skinWeight', new THREE.Float32BufferAttribute(bt.sw, 4));
    g.setIndex(bt.idx);
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
  function paintAtlas(W, H, bands, paint, wantOrm, defRough) {
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H;
    const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
    let cv2 = null, ctx2 = null, img2 = null, d2 = null;
    if (wantOrm) { cv2 = document.createElement('canvas'); cv2.width = W; cv2.height = H; ctx2 = cv2.getContext('2d'); img2 = ctx2.createImageData(W, H); d2 = img2.data; }
    const RG = { C: new THREE.Vector3(), S: new THREE.Vector3(), N: new THREE.Vector3(), w: 0, t: 0, b: 0, e: 2 };
    const P = { part: '', x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, u: 0, v: 0, up: 0, sd: 0, arc: 0, len: 0, cx: 0, cy: 0 };
    const C = { r: 0, g: 0, b: 0, ro: defRough, me: 0 }, tmp = [0, 0];
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
          C.r = C.g = C.b = 0.5; C.ro = defRough; C.me = 0;
          paint(P, C);
          const o = (y * W + x) * 4;
          d[o] = clamp(C.r * 255, 0, 255); d[o + 1] = clamp(C.g * 255, 0, 255); d[o + 2] = clamp(C.b * 255, 0, 255); d[o + 3] = 255;
          if (d2) { d2[o] = 255; d2[o + 1] = clamp(C.ro * 255, 0, 255); d2[o + 2] = clamp(C.me * 255, 0, 255); d2[o + 3] = 255; }
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
          [0, 0.33, 0.172, 0.054, 0.05, 0.08],
          [0, 0.364, 0.222, 0.04, 0.04, 0.046],
          [0, 0.398, 0.268, 0.034, 0.034, 0.036],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.7, keys: [
          [0, 0.405, 0.245, 0.034, 0.03, 0.03],
          [0, 0.41, 0.272, 0.049, 0.043, 0.04],
          [0, 0.407, 0.305, 0.046, 0.038, 0.036],
          [0, 0.397, 0.335, 0.03, 0.028, 0.027],
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
      eyes: [{ bone: 'head', p: [0.03, 0.418, 0.326], r: 0.0082, dir: [0.55, 0.12, 0.83], iris: 0xC8892A, pupil: 'v', irisR: 0.75 }],
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
      },
      anim: {
        type: 'legged', walk: 1.1, trot: 2.3, run: 4.2, stride: 0.56, strideMax: 2.0,
        duty: [0.64, 0.46, 0.36], lift: [0.05, 0.05], flexF: 1.5, flexH: 0.9,
        bob: [0.006, 0.014, 0.025], pitchRun: 0.12, flexRun: 0.12, roll: 0.04,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.3, eatDrop: 0.04, eatElev: [-62, -82, -100], eatSplay: [0.12, 0.15], chestEat: 0.1,
        tail: ['tail1', 'tail2', 'tail3'], tailRun: [0.2, 0.05, -0.05], tailIdle: [-0.15, -0.05, 0.05], tailSway: 0.12,
        ears: ['earL', 'earR'], floatDepth: 0.3, swimHead: -0.35,
      },
    };
  };

  // ===== DEER (white-tailed buck) =====
  SPEC.deer = () => {
    const xF = 0.1, xH = 0.096;
    const K = {
      top: hex(0x6E5038), side: hex(0x94704C), low: hex(0xAD8B66), white: hex(0xF0ECE4), cream: hex(0xD9C8AE),
      dark: hex(0x2B221C), legs: hex(0x9D7C58), hoof: hex(0x26211D), ear: hex(0x8A6A4D), earIn: hex(0xD7CCBD), face: hex(0x7D5E42),
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
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.08, segs: 14, cap0: 3, capLen0: 0.7, keys: [
          [0, 0.95, -0.66, 0.06, 0.05, 0.06],
          [0, 0.96, -0.6, 0.125, 0.1, 0.14],
          [0, 0.96, -0.47, 0.155, 0.115, 0.185],
          [0, 0.94, -0.25, 0.16, 0.11, 0.19],
          [0, 0.94, 0.0, 0.165, 0.115, 0.2],
          [0, 0.955, 0.22, 0.15, 0.125, 0.24],
          [0, 0.995, 0.38, 0.12, 0.11, 0.21],
          [0, 1.08, 0.47, 0.08, 0.085, 0.12],
          [0, 1.2, 0.535, 0.062, 0.062, 0.08],
          [0, 1.31, 0.58, 0.053, 0.053, 0.062],
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
          [0.07, 0.99, -0.43, 0.075, 0.13, 0.12],
          [0.088, 0.83, -0.4, 0.075, 0.12, 0.12],
          [0.094, 0.68, -0.34, 0.05, 0.07, 0.065],
          [0.095, 0.57, -0.4, 0.034, 0.045, 0.048],
          [xH, 0.46, -0.49, 0.024, 0.028, 0.032],
          [xH, 0.3, -0.48, 0.016, 0.018, 0.018],
          [xH, 0.14, -0.472, 0.016, 0.018, 0.02],
          [xH, 0.07, -0.455, 0.015, 0.016, 0.016],
          [xH, 0.025, -0.432, 0.019, 0.026, 0.018],
          [xH, 0.008, -0.418, 0.017, 0.022, 0.014],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.04, segs: 10, cap1: 2, keys: [
          [0.08, 0.96, 0.33, 0.06, 0.1, 0.09],
          [0.098, 0.79, 0.3, 0.058, 0.085, 0.075],
          [xF, 0.62, 0.27, 0.04, 0.048, 0.044],
          [xF, 0.49, 0.29, 0.028, 0.032, 0.028],
          [xF, 0.36, 0.31, 0.021, 0.024, 0.023],
          [xF, 0.23, 0.31, 0.016, 0.017, 0.017],
          [xF, 0.11, 0.31, 0.016, 0.018, 0.02],
          [xF, 0.06, 0.322, 0.015, 0.016, 0.016],
          [xF, 0.022, 0.342, 0.019, 0.026, 0.018],
          [xF, 0.008, 0.356, 0.017, 0.022, 0.014],
        ] },
        { name: 'ear', mirror: true, bones: ['earL'], segs: 8, sub: 3, keys: [
          [0.045, 1.43, 0.605, 0.018, 0.012, 0.008],
          [0.085, 1.48, 0.59, 0.038, 0.012, 0.006],
          [0.13, 1.52, 0.575, 0.042, 0.01, 0.005],
          [0.17, 1.545, 0.565, 0.028, 0.008, 0.004],
          [0.195, 1.555, 0.56, 0.002, 0.002, 0.002],
        ] },
      ],
      accent: [
        { kind: 'sphere', bone: 'head', c: [0, 1.275, 0.93], r: 0.024, s: [1.05, 0.8, 0.75], col: 0x17120F },
        ...tubes.map((tb) => ({ kind: 'tube', bone: 'head', pts: tb[0], radii: tb[1], segs: 6, mirror: true, colFn: antler })),
        { kind: 'sphere', bone: 'head', c: [0.04, 1.435, 0.61], r: 0.02, mirror: true, colFn: antler },
      ],
      accentRough: 0.55,
      eyes: [{ bone: 'head', p: [0.05, 1.405, 0.68], r: 0.0155, dir: [0.85, 0.15, 0.4], col: 0x140D09 }],
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
            cset(C, K.legs);
            cmix(C, K.side, sstep(0.55, 0.75, P.y));
            cmix(C, K.cream, sstep(0.1, -0.7, P.nx) * 0.75);
            if (P.part === 'hleg') cmix(C, K.white, sstep(0.0, -0.8, P.nx) * sstep(0.5, 0.75, P.y) * sstep(1.0, 0.85, P.y));
            cmix(C, K.cream, sstep(0.16, 0.1, P.y) * 0.5);
            cmix(C, K.hoof, sstep(0.048, 0.038, P.y));
            if (P.y < 0.045) C.ro = 0.4;
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
      ],
      fur: [
        { name: 'body', bones: ['hips', 'chest', 'neck', 'neck2', 'head'], blend: 0.12, fuzz: 0.06, fuzzFreq: 5, segs: 14, cap0: 3, capLen0: 0.6, keys: [
          [0, 1.6, -1.07, 0.09, 0.08, 0.09],
          [0, 1.6, -0.99, 0.21, 0.15, 0.22],
          [0, 1.57, -0.8, 0.27, 0.18, 0.3],
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
          [xH, 0.69, -0.76, 0.0494, 0.0585, 0.065],
          [xH, 0.45, -0.745, 0.0351, 0.039, 0.039],
          [xH, 0.18, -0.725, 0.0351, 0.039, 0.0416],
          [xH, 0.1, -0.7, 0.0364, 0.039, 0.039],
          [xH, 0.04, -0.67, 0.0381, 0.0504, 0.0358],
          [xH, 0.012, -0.645, 0.0336, 0.0426, 0.028],
        ] },
        { name: 'fleg', mirror: true, bones: ['chest', 'armL', 'foreL', 'fmetaL', 'fpawL'], blend: 0.06, segs: 10, cap1: 2, keys: [
          [0.11, 1.55, 0.52, 0.1, 0.16, 0.15],
          [0.15, 1.3, 0.48, 0.085, 0.13, 0.12],
          [xF, 1.04, 0.42, 0.0845, 0.0975, 0.091],
          [xF, 0.8, 0.46, 0.0585, 0.0676, 0.0598],
          [xF, 0.58, 0.49, 0.0468, 0.052, 0.0494],
          [xF, 0.38, 0.49, 0.0364, 0.039, 0.039],
          [xF, 0.17, 0.49, 0.0364, 0.0403, 0.0442],
          [xF, 0.1, 0.505, 0.0364, 0.039, 0.039],
          [xF, 0.04, 0.535, 0.0381, 0.0504, 0.0358],
          [xF, 0.012, 0.56, 0.0336, 0.0426, 0.028],
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
        { kind: 'tube', bone: 'head', pts: [[0.06, 1.88, 1.0], [0.12, 1.92, 0.98], [0.17, 1.95, 0.965]], radii: [0.042, 0.036, 0.04], segs: 7, mirror: true, colFn: aCol },
        { kind: 'raw', bone: 'head', make: palm, mirror: true, colFn: aCol },
        { kind: 'sphere', bone: 'head', c: [0.045, 1.57, 1.655], r: 0.016, s: [0.8, 1.2, 0.6], mirror: true, col: 0x120E0B },
      ],
      accentRough: 0.65,
      eyes: [{ bone: 'head', p: [0.088, 1.85, 1.12], r: 0.017, dir: [0.9, 0.15, 0.35], col: 0x120C09 }],
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
      },
    };
  };

  // ===== BUNNY (eastern cottontail) =====
  SPEC.bunny = () => {
    const xH = 0.062, xF = 0.042;
    const K = {
      base: hex(0x8A7660), dark: hex(0x4E4032), tip: hex(0xB5A189), belly: hex(0xEDE6DC), white: hex(0xF6F3EE),
      nape: hex(0xA76A3E), earIn: hex(0xD9A79A), earEdge: hex(0x3B312A), feet: hex(0xC8B7A2),
    };
    const agouti = (P, C) => {
      const n = fbm(P.x * 260, P.y * 260, P.z * 260, 3);
      const t = fbm(P.x * 900, P.y * 900 + 5, P.z * 900, 2);
      cmix(C, K.dark, sstep(0.45, 0.75, n) * 0.7);
      cmix(C, K.tip, sstep(0.55, 0.85, t) * 0.5);
    };
    return {
      size: { length: 0.42, height: 0.45, radius: 0.11, eyeHeight: 0.25 },
      tex: [256, 256], rough: 0.92,
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
          [xF - 0.005, 0.13, 0.07, 0.02, 0.025, 0.025],
          [xF, 0.1, 0.072, 0.016, 0.019, 0.018],
          [xF, 0.07, 0.07, 0.011, 0.011, 0.011],
          [xF, 0.035, 0.078, 0.01, 0.01, 0.01],
          [xF, 0.012, 0.088, 0.012, 0.012, 0.01],
          [xF, 0.008, 0.103, 0.01, 0.007, 0.006],
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
            cmix(C, K.belly, sstep(-0.35, -0.75, P.ny));
            if (P.part === 'haunch') cmix(C, K.belly, sstep(-0.2, -0.8, P.ny) * 0.8);
            break;
          }
          case 'head': {
            cset(C, K.base);
            agouti(P, C);
            // pale eye ring and muzzle, white chin
            const ex = Math.abs(P.x) - 0.039, ey = P.y - 0.247, ez = P.z - 0.153;
            cmix(C, K.tip, sstep(0.026, 0.017, Math.sqrt(ex * ex * 3 + ey * ey + ez * ez)) * 0.9);
            cmix(C, K.belly, sstep(-0.3, -0.7, P.ny) * sstep(0.15, 0.18, P.z));
            cmix(C, hex(0xC8B39B), sstep(0.18, 0.2, P.z) * 0.5);
            break;
          }
          case 'tail': cset(C, K.white); cmix(C, K.base, sstep(0.3, 0.9, P.ny) * sstep(-0.3, 0.2, -P.nz) * 0.6); break;
          case 'hfoot': case 'fleg': cset(C, K.feet); agouti(P, C); cmix(C, K.base, sstep(0.05, 0.09, P.y) * 0.7); break;
          case 'ear': {
            cset(C, K.base);
            agouti(P, C);
            cmix(C, K.earIn, sstep(0.1, 0.6, P.nz) * sstep(0.012, 0.03, P.arc) * 0.9);
            cmix(C, K.earEdge, sstep(0.13, 0.155, P.arc) * 0.8);
            break;
          }
        }
        furFinish(P, C, 0.1, 140, 50);
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
      },
    };
  };

  // ===== SQUIRREL (red squirrel) =====
  SPEC.squirrel = () => {
    const xH = 0.042, xF = 0.032;
    const K = {
      red: hex(0xA44C22), top: hex(0x8A3E1C), side: hex(0xB85E2E), belly: hex(0xF1ECE2), dark: hex(0x5A2A14),
      tail: hex(0xA64B20), tailTip: hex(0x6E3018), ear: hex(0x9A4A26), tuft: hex(0x4A2414), feet: hex(0x9C5530),
    };
    return {
      size: { length: 0.4, height: 0.32, radius: 0.09, eyeHeight: 0.16 },
      tex: [256, 256], rough: 0.9,
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
          [xF - 0.004, 0.1, 0.058, 0.014, 0.017, 0.017],
          [xF, 0.078, 0.057, 0.011, 0.013, 0.012],
          [xF, 0.055, 0.054, 0.008, 0.008, 0.008],
          [xF, 0.028, 0.062, 0.007, 0.007, 0.007],
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
      eyes: [{ bone: 'head', p: [0.025, 0.167, 0.125], r: 0.0082, dir: [0.9, 0.2, 0.3], col: 0x0E0907 }],
      mouth: [0, 0.14, 0.16],
      paint(P, C) {
        switch (P.part) {
          case 'body': case 'haunch': case 'head': {
            cset(C, K.side);
            cmix(C, K.top, sstep(0.3, 0.9, P.ny) * 0.8);
            cmix(C, K.belly, sstep(-0.2, -0.6, P.ny));
            if (P.part === 'head') {
              const ex = Math.abs(P.x) - 0.025, ey = P.y - 0.167, ez = P.z - 0.125;
              cmix(C, hex(0xD9B48F), sstep(0.014, 0.0105, Math.sqrt(ex * ex * 3 + ey * ey + ez * ez)) * 0.7);
            }
            break;
          }
          case 'tail': {
            cset(C, K.tail);
            cmix(C, K.tailTip, sstep(0.4, 0.8, grain(P, 40, 12)) * 0.6);
            cmix(C, hex(0xC97A45), sstep(0.035, 0.0, Math.abs(Math.abs(P.sd) - 1) * 0.1) * 0.3);
            break;
          }
          case 'hfoot': case 'fleg': cset(C, K.feet); cmix(C, K.belly, sstep(0.0, -0.8, P.nz) * sstep(0.05, 0.09, P.y) * 0.4); break;
          case 'ear': cset(C, K.ear); cmix(C, K.tuft, sstep(0.025, 0.04, P.arc)); break;
        }
        furFinish(P, C, P.part === 'tail' ? 0.25 : 0.12, P.part === 'tail' ? 60 : 160, P.part === 'tail' ? 8 : 50);
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
      },
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
            bone: name, mirror: true, len, wid, curl: bl.curl == null ? 0.06 : bl.curl, tip: bl.tip, rootW: bl.rootW,
            base: [bx + Math.cos(ya) * back, by + (bl.layer || 0) + (set.layerStep || 0) * (set.layerDir === -1 ? -i : i), bz - Math.sin(ya) * back],
            yaw: ya, roll: (bl.twist || 0) * DEG, pitch: (bl.pitch || 0) * DEG, cell: fcell(bl.cell),
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
    const ff = o.featherFold || {};
    return birdWing({
      sh: o.sh, arm: [0.08 * s, 0.1 * s, 0.075 * s], parent: o.parent,
      fold: o.fold || { hum: 86, elb: -170, wri: 172 },
      spread: o.spread || { roll: 4, yaw: 0, pitch: 0 },
      folded: o.folded, foldedPos: o.foldedPos, flap: o.flap,
      sets: [
        { parent: 'wingL', n: 3, at: [0.2, 0.9], spread: [100, 94], fold: ff.tert || [112, 104], y: 0.004 * s,
          blades: [{ len: [0.12 * s, 0.115 * s], wid: [0.04 * wm, 0.04 * wm], cell: c.tert == null ? 4 : c.tert, layer: 0.012 * s, curl: 0.12 }] },
        { parent: 'wforeL', n: 6, at: [0.0, 0.97], spread: [92, 78], fold: ff.sec || [106, 89], layerStep: -0.0012 * s,
          blades: [
            { len: [0.115 * s, 0.105 * s], wid: [0.034 * wm, 0.032 * wm], cell: c.sec == null ? 1 : c.sec, layer: 0, curl: 0.1, tip: o.secTip },
            { len: [0.07 * s, 0.065 * s], wid: [0.032 * wm, 0.03 * wm], cell: c.gcov == null ? 2 : c.gcov, layer: 0.005 * s, back: -0.006 * s, curl: 0.1 },
            { len: [0.045 * s, 0.042 * s], wid: [0.03 * wm, 0.028 * wm], cell: c.lcov == null ? 3 : c.lcov, layer: 0.009 * s, back: -0.01 * s, curl: 0.1 },
          ] },
        { parent: 'whandL', n: 7, at: [0.0, 1.0], spread: o.primSpread || [72, 6], fold: ff.prim || [96, 86], layerStep: -0.0012 * s,
          blades: [
            { len: [0.16 * s * pl, 0.21 * s * pl], wid: [0.036 * wm, 0.03 * wm * (o.primTipWid || 1)], cell: c.prim == null ? 0 : c.prim, layer: -0.006 * s, curl: 0.05, tip: tp },
            { len: [0.065 * s, 0.055 * s], wid: [0.03 * wm, 0.024 * wm], cell: c.pcov == null ? 3 : c.pcov, layer: 0.003 * s, back: -0.012 * s, curl: 0.06 },
          ] },
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
      belly: hex(0xD8D5CE), wing: hex(0x8C8479), wingDk: hex(0x5C554D), blue: hex(0x2C3EAA), purple: hex(0x4A2E98),
      white: hex(0xF5F4F0), black: hex(0x141414), tailW: hex(0xE9E7E2), leg: hex(0xF0892A),
    };
    const W = birdWing({
      sh: [0.05, 0.262, 0.06], arm: [0.08, 0.1, 0.075],
      fold: { hum: 86, elb: -170, wri: 172 },
      spread: { roll: 4, yaw: 0, pitch: 0 },
      folded: { roll: -24, yaw: 2, pitch: -6 },
      foldedPos: [0.016, 0.012, -0.03],
      flap: { amp: 60, rate: 6.0, upFold: 0.35, twist: 12, glide: 4 },
      sets: [
        { parent: 'wingL', n: 3, at: [0.2, 0.9], spread: [100, 94], fold: [112, 104], y: 0.004,
          blades: [{ len: [0.12, 0.115], wid: [0.04, 0.04], cell: 4, layer: 0.012, curl: 0.12 }] },
        { parent: 'wforeL', n: 6, at: [0.0, 0.97], spread: [92, 78], fold: [106, 89], layerStep: -0.0012,
          blades: [
            { len: [0.115, 0.105], wid: [0.034, 0.032], cell: 1, layer: 0, curl: 0.1 },
            { len: [0.07, 0.065], wid: [0.032, 0.03], cell: 2, layer: 0.005, back: -0.006, curl: 0.1 },
            { len: [0.045, 0.042], wid: [0.03, 0.028], cell: 3, layer: 0.009, back: -0.01, curl: 0.1 },
          ] },
        { parent: 'whandL', n: 7, at: [0.0, 1.0], spread: [72, 6], fold: [96, 86], layerStep: -0.0012,
          blades: [
            { len: [0.16, 0.21], wid: [0.036, 0.03], cell: 0, layer: -0.006, curl: 0.05 },
            { len: [0.065, 0.055], wid: [0.03, 0.024], cell: 3, layer: 0.003, back: -0.012, curl: 0.06 },
          ] },
      ],
    });
    const toes = [{ a: -26, len: 0.046, r: 0.0038 }, { a: 0, len: 0.054, r: 0.004 }, { a: 26, len: 0.044, r: 0.0038 }, { a: 180, len: 0.012, r: 0.0028, back: true, lift: 0.006 }];
    const foot = [xL, 0.006, -0.008];
    return {
      size: { length: 0.58, height: 0.43, radius: 0.12, eyeHeight: 0.38 },
      tex: [256, 256], rough: 0.85, orm: true,
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
        { name: 'body', bones: ['tail', 'hips', 'neck', 'neck2', 'head'], blend: 0.025, segs: 14, cap0: 3, capLen0: 0.9, keys: [
          [0, 0.232, -0.225, 0.02, 0.012, 0.014],
          [0, 0.228, -0.2, 0.048, 0.034, 0.04],
          [0, 0.216, -0.15, 0.076, 0.055, 0.064],
          [0, 0.206, -0.07, 0.09, 0.068, 0.084],
          [0, 0.206, 0.01, 0.09, 0.07, 0.088],
          [0, 0.214, 0.075, 0.08, 0.068, 0.086],
          [0, 0.228, 0.12, 0.06, 0.058, 0.068],
          [0, 0.252, 0.148, 0.04, 0.04, 0.046],
          [0, 0.29, 0.165, 0.025, 0.025, 0.027],
          [0, 0.34, 0.168, 0.022, 0.022, 0.022],
          [0, 0.37, 0.165, 0.02, 0.02, 0.02],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.5, keys: [
          [0, 0.385, 0.14, 0.017, 0.018, 0.016],
          [0, 0.388, 0.16, 0.022, 0.026, 0.021],
          [0, 0.387, 0.18, 0.022, 0.025, 0.02],
          [0, 0.381, 0.198, 0.018, 0.018, 0.016],
          [0, 0.376, 0.21, 0.014, 0.011, 0.012],
        ] },
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap0: 2, cap1: 2, keys: [
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
            const br = sstep(0.06, 0.1, P.z) * sstep(0.265, 0.25, P.y);
            cmix(C, K.chest, br);
            cmix(C, K.chestHi, br * sstep(0.2, 0.7, P.nz) * 0.4);
            cmix(C, K.rump, sstep(-0.15, -0.19, P.z));
            cmix(C, K.white, sstep(-0.13, -0.15, P.z) * sstep(-0.165, -0.15, P.z) * sstep(0.3, -0.2, P.ny) * 0.6);
            const nk = sstep(0.11, 0.13, P.z);
            cmix(C, K.ring, nk * sstep(0.255, 0.261, P.y) * sstep(0.273, 0.267, P.y));
            const gr = nk * sstep(0.269, 0.275, P.y);
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
      feathers: () => ({
        tex: [256, 128], rough: 0.8,
        list: [
          ...W.feathers,
          ...[-2, -1, 0, 1, 2].map((i) => ({ bone: 'tail', base: [i * 0.011, 0.23 - Math.abs(i) * 0.002, -0.205], yaw: (90 + i * 13) * DEG, pitch: -4 * DEG, len: 0.085 - Math.abs(i) * 0.006, wid: 0.03, curl: 0.03, cell: fcell(5) })),
          ...[-1, 1].map((i) => ({ bone: 'tail', base: [i * 0.004, 0.238, -0.19], yaw: (90 - i * 6) * DEG, roll: 90 * DEG, pitch: 35 * DEG, len: 0.04, wid: 0.01, curl: 0.9, tip: 0.5, cell: fcell(6) })),
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
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap1: 2, capLen1: 0.5, col: 0xD6C12E, keys: [
          [0, 0.377, 0.2, 0.013, 0.01, 0.009, 2.5],
          [0, 0.37, 0.222, 0.0135, 0.0075, 0.0058, 3],
          [0, 0.362, 0.245, 0.0145, 0.0055, 0.0045, 3],
          [0, 0.357, 0.258, 0.013, 0.0045, 0.0038, 3],
        ] },
        { kind: 'sphere', bone: 'head', c: [0, 0.359, 0.262], r: 0.0055, s: [1.1, 0.5, 0.8], col: 0x2A2420 },
        ...birdToes(foot, toes, 0xF08A2B, 'hpawL'),
        birdWeb(foot, toes, 0xE87F25, 'hpawL'),
      ],
      accentRough: 0.45,
      eyes: [{ bone: 'head', p: [0.02, 0.392, 0.183], r: 0.0045, dir: [0.92, 0.2, 0.2], col: 0x1A0F08 }],
      mouth: [0, 0.358, 0.258],
      anim: {
        type: 'bird', walk: 0.8, run: 2.2, stride: 0.26, strideMax: 1.6, duty: [0.6, 0.45], lift: 0.022, flex: 1.1,
        bob: 0.005, waddle: 0.09, yawSway: 0.06,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.3, eatMax: 2.4, peck: 0.12, peckRate: 3, eatElev: [-45, -80, -85], eatY: 0.015,
        flyElev: [8, 4, -8], flyPitch: 0.05, floatDepth: 0, swimDrop: 0.18, swimEatPitch: 0.15,
        tail: 'tail', tailWag: 0.25, wing: W.wing, canFly: true, flyLegs: [-0.25, -0.9, 2.8], flyFlex: 1.6, jumpFlap: 0.6,
        paddleY: 0.4, paddleZ: 0.35,
      },
    };
  };

  // ===== SWAN (mute swan) =====
  SPEC.swan = () => {
    const xL = 0.085;
    const K = { white: hex(0xF2F1EC), shade: hex(0xD9DBD8), cream: hex(0xEFE8D8), black: hex(0x1A1A1A) };
    const W = stdWing({
      s: 2.35, sh: [0.1, 0.5, 0.16], prim: 1.05, wid: 1.05, tip: 0.45,
      folded: { roll: -14, yaw: 2, pitch: 2 }, foldedPos: [0.0, 0.012, -0.05],
      featherFold: { tert: [118, 106], sec: [108, 91], prim: [97, 88] },
      flap: { amp: 55, rate: 2.6, upFold: 0.3, twist: 10, glide: 3 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 2, tert: 1, pcov: 2 },
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
          [0, 0.4, 0.25, 0.13, 0.13, 0.14],
          [0, 0.45, 0.33, 0.08, 0.08, 0.09],
          [0, 0.53, 0.4, 0.056, 0.056, 0.06],
          [0, 0.63, 0.425, 0.046, 0.046, 0.048],
          [0, 0.73, 0.405, 0.04, 0.04, 0.041],
          [0, 0.83, 0.37, 0.036, 0.036, 0.036],
          [0, 0.92, 0.36, 0.034, 0.034, 0.034],
          [0, 0.99, 0.385, 0.033, 0.033, 0.033],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.6, keys: [
          [0, 1.005, 0.36, 0.03, 0.03, 0.03],
          [0, 1.02, 0.39, 0.036, 0.04, 0.034],
          [0, 1.015, 0.425, 0.032, 0.036, 0.03],
          [0, 0.995, 0.455, 0.024, 0.024, 0.022],
        ] },
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.01, segs: 8, cap0: 2, cap1: 2, keys: [
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
      feathers: () => ({
        tex: [256, 128], rough: 0.85,
        list: [
          ...W.feathers,
          ...tailFan('tail', [0, 0.43, -0.44], 7, 0.15, 0.05, 30, 12, 3, { dx: 0.06, dz: 0.01, taper: 0.3, curl: 0.05 }),
        ],
        paint(u, t, C) {
          const k = Math.floor(u * FNC), s = fract(u * FNC);
          vane(s, t, C, K.white, K.shade, hex(0xE4E4E0));
          if (k === 0) cmix(C, hex(0xCFCFCB), sstep(0.5, 1, t) * 0.25);
        },
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap1: 2, capLen1: 0.5, colFn: bill, keys: [
          [0, 1.01, 0.415, 0.022, 0.026, 0.018, 2.4],
          [0, 0.995, 0.45, 0.02, 0.019, 0.013, 2.6],
          [0, 0.975, 0.5, 0.019, 0.014, 0.01, 2.8],
          [0, 0.957, 0.545, 0.017, 0.01, 0.008, 2.8],
          [0, 0.95, 0.565, 0.013, 0.007, 0.006, 2.5],
        ] },
        { kind: 'sphere', bone: 'head', c: [0, 1.035, 0.43], r: 0.02, s: [0.7, 0.85, 1.05], col: 0x161515 },
        ...birdToes(foot, toes, 0x232323, 'hpawL'),
        birdWeb(foot, toes, 0x1D1D1D, 'hpawL'),
      ],
      accentRough: 0.45,
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
    const toes = [{ a: -30, len: 0.045, r: 0.0045, claw: 0.008, clawCol: 0x8A6A3A }, { a: 0, len: 0.055, r: 0.005, claw: 0.009, clawCol: 0x8A6A3A }, { a: 30, len: 0.043, r: 0.0045, claw: 0.008, clawCol: 0x8A6A3A }, { a: 180, len: 0.025, r: 0.004, lift: 0.004, claw: 0.007, clawCol: 0x8A6A3A }];
    const foot = [xL, 0.007, 0.004];
    const comb = [[0.105, 0.43], [0.112, 0.452], [0.12, 0.442], [0.127, 0.466], [0.135, 0.448], [0.142, 0.472], [0.15, 0.452], [0.157, 0.466], [0.163, 0.446], [0.17, 0.452], [0.172, 0.432]].map((p) => [0, p[1], p[0]]);
    return {
      size: { length: 0.45, height: 0.48, radius: 0.1, eyeHeight: 0.4 },
      tex: [256, 256], rough: 0.88,
      bones: [
        ['hips', null, 0, 0.24, 0.0],
        ['tail', 'hips', 0, 0.29, -0.12],
        ['neck', 'hips', 0, 0.29, 0.085],
        ['neck2', 'neck', 0, 0.35, 0.11],
        ['head', 'neck2', 0, 0.4, 0.125],
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
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.5, keys: [
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
        { name: 'leg', mirror: true, bones: ['shinL', 'hmetaL', 'hpawL'], blend: 0.006, segs: 8, cap1: 2, keys: [
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
      feathers: () => ({
        tex: [256, 128], rough: 0.85,
        list: [
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
            case 2: vane(s, t, C, K.rustHi, K.rust, K.dark); break;
            case 4: vane(s, t, C, K.black, K.tailG, hex(0x2A2A22)); cmix(C, K.dark, sstep(0.35, 0.0, t) * 0.8); break;
            case 5: vane(s, t, C, K.tailG, K.black); cmix(C, K.rust, sstep(0.3, 0.0, t) * 0.6); break;
            case 6: vane(s, t, C, K.rust, K.dark, K.dark); cmix(C, K.black, sstep(0.75, 1, t) * 0.7); break;
            default: vane(s, t, C, K.rust, K.dark);
          }
        },
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 8, cap1: 2, capLen1: 0.4, col: 0xE0B35A, keys: [
          [0, 0.403, 0.158, 0.009, 0.009, 0.007],
          [0, 0.401, 0.172, 0.0065, 0.007, 0.004],
          [0, 0.396, 0.184, 0.0035, 0.0042, 0.0025],
          [0, 0.39, 0.19, 0.0012, 0.0014, 0.001],
        ] },
        { kind: 'fan', bone: 'head', c: [0, 0.445, 0.14], outline: comb, thick: 0.007, n: [1, 0, 0], col: 0xC8261C },
        { kind: 'sphere', bone: 'head', c: [0.006, 0.381, 0.158], r: 0.011, s: [0.55, 1.35, 0.8], mirror: true, col: 0xBE2018 },
        ...birdToes(foot, toes, 0xE4B23A, 'hpawL'),
      ],
      accentRough: 0.55,
      eyes: [{ bone: 'head', p: [0.024, 0.415, 0.138], r: 0.0058, dir: [0.92, 0.15, 0.3], iris: 0xD48A26, irisR: 0.8, pupilR: 0.45 }],
      mouth: [0, 0.392, 0.188],
      anim: {
        type: 'bird', walk: 0.9, run: 2.6, stride: 0.22, strideMax: 1.8, duty: [0.6, 0.42], lift: 0.03, flex: 1.3,
        bob: 0.006, waddle: 0.04, yawSway: 0.04, headBob: 1.0,
        neck: ['neck', 'neck2', 'head'], neckDist: [0.45, 0.35, 0.2], eatPitch: 0.45, eatMax: 2.4, peck: 0.25, peckRate: 2.5, eatElev: [-40, -75, -85], eatY: 0.025,
        tail: 'tail', tailWag: 0.2, wing: W.wing, canFly: false, jumpFlap: 0.75, runPitch: 0.15,
        lookPeriod: 1.6, lookRate: 9, lookAmp: 0.9,
      },
    };
  };

  // ===== OWL (great horned owl), built upright =====
  SPEC.owl = () => {
    const xL = 0.05;
    const K = {
      base: hex(0x7E6249), dark: hex(0x33261C), light: hex(0xC2AD8E), buff: hex(0xB89C78), white: hex(0xEDE6D8),
      disc: hex(0xB77B45), rim: hex(0x22190F), tuft: hex(0x3A2B1F), gray: hex(0x8C8378), toe: hex(0xCDB894),
    };
    const W = stdWing({
      s: 1.25, sh: [0.07, 0.35, -0.035], prim: 0.95, wid: 1.45, tip: 0.6, secTip: 0.5, primTipWid: 1.2,
      folded: { roll: -28, yaw: 4, pitch: -72 }, foldedPos: [0.0, 0.0, -0.02],
      featherFold: { tert: [108, 100], sec: [102, 92], prim: [96, 90] },
      flap: { amp: 68, rate: 2.2, upFold: 0.25, twist: 8, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 2, tert: 2, pcov: 2 },
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
      bones: [
        ['hips', null, 0, 0.18, 0.0],
        ['tail', 'hips', 0, 0.13, -0.075],
        ['neck', 'hips', 0, 0.37, 0.0],
        ['head', 'neck', 0, 0.42, 0.005],
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
        { name: 'tuft', mirror: true, bones: ['head'], segs: 6, sub: 2, keys: [
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
            // pale barred breast and belly
            const fr = sstep(-0.1, 0.5, P.nz);
            const bar = sstep(0.55, 0.85, Math.sin(P.y * 260 + noise(P.x * 60, P.y * 60, 1) * 3) * 0.5 + 0.5);
            cmix(C, K.buff, fr * 0.85);
            cmix(C, K.dark, fr * bar * 0.55);
            cmix(C, K.white, fr * sstep(0.34, 0.37, P.y) * 0.9);
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
      feathers: () => ({
        tex: [256, 128], rough: 0.9,
        list: [
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
      eyes: [{ bone: 'head', p: [0.032, 0.464, 0.054], r: 0.0145, dir: [0.28, 0.04, 1], iris: 0xF0A51C, irisR: 0.9, pupilR: 0.42, rim: 0x2A1A0A }],
      mouth: [0, 0.432, 0.074],
      anim: {
        type: 'bird', walk: 0.7, run: 1.8, stride: 0.2, strideMax: 1.6, duty: [0.62, 0.48], lift: 0.025, flex: 1.1,
        bob: 0.006, waddle: 0.11, yawSway: 0.07,
        neck: ['neck', 'head'], neckDist: [0.5, 0.5], eatPitch: 1.1, eatDrop: 0.07, eatMax: 2.2, peck: 0.12, peckRate: 1.5, eatElev: [-70, -90], eatY: 0.03,
        flyElev: [10, -6], flyPitch: 1.05, flyBob: 0.02,
        tail: 'tail', tailWag: 0.1, wing: W.wing, canFly: true, flyLegs: [-0.2, -0.9, 1.6], flyFlex: 1.0, jumpFlap: 0.6, flyTail: 0.1,
        lookPeriod: 4.2, lookRate: 4, lookAmp: 1.6, lookDist: [0.25, 0.75],
      },
    };
  };

  // ===== PARROT (scarlet macaw) =====
  SPEC.parrot = () => {
    const xL = 0.038;
    const K = {
      red: hex(0xC8122C), redDk: hex(0x9A0C20), yellow: hex(0xF2C12E), green: hex(0x4C8F3A), blue: hex(0x1F5BBE), blueDk: hex(0x173D86),
      face: hex(0xF2ECE6), line: hex(0xB42232), foot: hex(0x4A4440),
    };
    const W = stdWing({
      s: 0.92, sh: [0.052, 0.24, 0.05], prim: 1.2, wid: 1.0, tip: 0.3,
      folded: { roll: -26, yaw: 2, pitch: -8 }, foldedPos: [0.006, 0.006, -0.02],
      featherFold: { tert: [112, 104], sec: [106, 92], prim: [97, 90] },
      flap: { amp: 58, rate: 6.5, upFold: 0.35, twist: 12, glide: 4 },
      cells: { prim: 0, sec: 1, gcov: 2, lcov: 7, tert: 2, pcov: 1 },
    });
    const toes = [{ a: -18, len: 0.035, r: 0.0055, claw: 0.01 }, { a: 18, len: 0.037, r: 0.0055, claw: 0.01 }, { a: 160, len: 0.03, r: 0.0052, lift: 0.003, claw: 0.009 }, { a: -165, len: 0.028, r: 0.0052, lift: 0.003, claw: 0.009 }];
    const foot = [xL, 0.006, 0.012];
    const upperBeak = (x, y, z) => mixc(hex(0xEDE3D2), hex(0x2A2522), sstep(0.355, 0.335, y) * 0.9 + sstep(0.16, 0.14, z) * 0.0);
    return {
      size: { length: 0.85, height: 0.44, radius: 0.12, eyeHeight: 0.4 },
      tex: [256, 256], rough: 0.75,
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
          [0, 0.19, -0.06, 0.062, 0.058, 0.064],
          [0, 0.185, 0.005, 0.066, 0.062, 0.072],
          [0, 0.205, 0.06, 0.06, 0.058, 0.066],
          [0, 0.25, 0.09, 0.05, 0.05, 0.054],
          [0, 0.3, 0.1, 0.042, 0.042, 0.044],
          [0, 0.345, 0.105, 0.038, 0.038, 0.038],
          [0, 0.385, 0.1, 0.034, 0.034, 0.034],
        ] },
        { name: 'head', bones: ['head'], segs: 14, cap0: 3, cap1: 2, capLen1: 0.5, keys: [
          [0, 0.375, 0.07, 0.03, 0.03, 0.03],
          [0, 0.39, 0.1, 0.043, 0.045, 0.038],
          [0, 0.39, 0.125, 0.041, 0.042, 0.036],
          [0, 0.384, 0.142, 0.03, 0.03, 0.027],
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
      feathers: () => ({
        tex: [256, 128], rough: 0.65,
        list: [
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
      }),
      accent: [
        { kind: 'loft', bone: 'head', segs: 10, cap0: 2, cap1: 2, capLen1: 0.4, colFn: upperBeak, keys: [
          [0, 0.395, 0.135, 0.02, 0.022, 0.018],
          [0, 0.393, 0.155, 0.018, 0.021, 0.016],
          [0, 0.383, 0.175, 0.014, 0.016, 0.012],
          [0, 0.364, 0.188, 0.01, 0.011, 0.009],
          [0, 0.343, 0.186, 0.006, 0.006, 0.006],
          [0, 0.33, 0.176, 0.002, 0.002, 0.002],
        ] },
        { kind: 'loft', bone: 'head', segs: 8, cap0: 2, cap1: 2, capLen1: 0.5, col: 0x1E1B1A, keys: [
          [0, 0.364, 0.13, 0.017, 0.014, 0.014],
          [0, 0.358, 0.15, 0.015, 0.012, 0.012],
          [0, 0.352, 0.165, 0.01, 0.008, 0.008],
          [0, 0.35, 0.172, 0.004, 0.004, 0.004],
        ] },
        ...birdToes(foot, toes, 0x4A4440, 'hpawL'),
      ],
      accentRough: 0.35,
      eyes: [{ bone: 'head', p: [0.036, 0.393, 0.118], r: 0.0065, dir: [0.92, 0.15, 0.3], iris: 0xE6D8A2, irisR: 0.85, pupilR: 0.35 }],
      mouth: [0, 0.345, 0.18],
      anim: {
        type: 'bird', walk: 0.6, run: 1.5, stride: 0.17, strideMax: 1.6, duty: [0.64, 0.5], lift: 0.02, flex: 1.2,
        bob: 0.005, waddle: 0.13, yawSway: 0.08,
        neck: ['neck', 'head'], neckDist: [0.6, 0.4], eatPitch: 1.0, eatDrop: 0.03, eatMax: 2.2, peck: 0.12, peckRate: 2, eatElev: [-60, -80], eatY: 0.03,
        flyElev: [20, -12], flyPitch: 0.05, standPitch: -0.42, standElev: [62, -8],
        tail: 'tail', tailWag: 0.2, wing: W.wing, canFly: true, flyLegs: [-0.15, -0.9, 1.6], flyFlex: 1.0, jumpFlap: 0.6, flyTail: -0.05, standTail: 0.08,
        lookPeriod: 2.6, lookRate: 5, lookAmp: 1.0,
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
      ],
      accentRough: 0.45,
      eyes: [{ bone: 'head', p: [0.03, 0.084, 0.057], r: 0.0115, dir: [0.75, 0.35, 0.55], iris: 0xD9A021, irisR: 0.95, pupil: 'h', pupilR: 0.5, rim: 0x6A4A14, sclera: 0x8A6A1E }],
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
      },
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
          [0, 0.028, -0.065, 0.017, 0.014, 0.012],
          [0, 0.03, -0.035, 0.022, 0.018, 0.016],
          [0, 0.031, 0.0, 0.025, 0.019, 0.017],
          [0, 0.031, 0.04, 0.021, 0.017, 0.015],
          [0, 0.032, 0.068, 0.013, 0.012, 0.012],
          [0, 0.034, 0.08, 0.0145, 0.0125, 0.012],
          [0, 0.036, 0.095, 0.0175, 0.013, 0.0115],
          [0, 0.034, 0.112, 0.013, 0.0095, 0.009],
          [0, 0.03, 0.128, 0.0075, 0.0055, 0.005],
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
      },
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
        { name: 'shell', bones: ['hips'], segs: 22, sub: 4, cap0: 3, cap1: 3, capLen0: 0.5, capLen1: 0.5, texScale: 1.6, keys: [
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
      },
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
    const rad = (u) => SNAKE_R * (u < 0.08 ? lerp(0.72, 0.9, u / 0.08) : u < 0.55 ? lerp(0.9, 1, sstep(0.08, 0.35, u)) : lerp(1, 0.08, Math.pow((u - 0.55) / 0.45, 1.3)));
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
      bones,
      fur: [
        { name: 'body', bones: names, blend: 0.03, segs: 10, sub: 2, cap1: 2, side: [-1, 0, 0], keys },
        { name: 'head', bones: ['head'], segs: 12, cap0: 2, cap1: 3, capLen1: 0.6, keys: [
          [0, SNAKE_R * 0.95, z0 - 0.01, SNAKE_R * 0.75, SNAKE_R * 0.7, SNAKE_R * 0.66, 2.2],
          [0, SNAKE_R * 0.98, z0 + 0.012, SNAKE_R * 0.95, SNAKE_R * 0.72, SNAKE_R * 0.68, 2.3],
          [0, SNAKE_R * 0.95, z0 + 0.03, SNAKE_R * 0.9, SNAKE_R * 0.62, SNAKE_R * 0.6, 2.4],
          [0, SNAKE_R * 0.88, z0 + 0.045, SNAKE_R * 0.6, SNAKE_R * 0.42, SNAKE_R * 0.42, 2.2],
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
          cmix(C, K.lip, sstep(-0.2, -0.6, P.ny));
          cmix(C, K.dark, sstep(0.4, 0.9, P.ny) * 0.3);
        }
        // scales: fine cell pattern
        const sc = cells(P.x * 420, P.y * 420, P.z * 260);
        cmul(C, 0.85 + 0.2 * sstep(0.2, 0.6, sc));
        C.ro = 0.45 + 0.15 * sc;
      },
      accent: [],
      extras: () => [{ bone: 'head', name: 'tongue', geo: tongue(), mat: new THREE.MeshStandardMaterial({ color: linColor(0xC4202A), roughness: 0.5, side: THREE.DoubleSide }), at: [0, SNAKE_R * 0.75, z0 + 0.04] }],
      eyes: [{ bone: 'head', p: [SNAKE_R * 0.68, SNAKE_R * 1.22, z0 + 0.024], r: 0.0036, dir: [0.85, 0.3, 0.35], col: 0x0E0A07 }],
      mouth: [0, SNAKE_R * 0.8, z0 + 0.05],
      anim: {
        type: 'snake', walk: 0.8, run: 2.2, stride: 0.6, floatDepth: 0.012,
        names, z0, dz,
      },
    };
  };

  // ---------- asset builder (cached per species) ----------
  const cache = {};
  function getAssets(id) {
    if (cache[id]) return cache[id];
    const spec = SPEC[id]();
    // bones (expand mirrored)
    const defs = [];
    for (const b of spec.bones) {
      defs.push({ name: b[0], parent: b[1], p: new THREE.Vector3(b[2], b[3], b[4]) });
      if (b[5]) defs.push({ name: b[0].slice(0, -1) + 'R', parent: b[1] && b[1].endsWith('L') ? b[1].slice(0, -1) + 'R' : b[1], p: new THREE.Vector3(-b[2], b[3], b[4]) });
    }
    if (spec.extraBones) for (const b of spec.extraBones(defs)) defs.push(b);
    const boneIndex = {}, rest = {};
    defs.forEach((d, i) => { boneIndex[d.name] = i; rest[d.name] = d.p; });
    // fur parts
    const furBatch = newBatch(), lofts = [];
    for (const fp of spec.fur || []) {
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
      const bd = { name: o.fp.name, loft: o.L, y0: y, y1: Math.min(TH, y + h) };
      y += h;
      return bd;
    });
    lofts.forEach((o, i) => {
      const bd = bands[i], inner = bd.y1 - bd.y0 - 2 * PAD;
      const uvFn = (v) => [o.L.uvu[v], 1 - (bd.y0 + PAD + (o.L.arcs[v] / o.L.len) * inner) / TH];
      pushPart(furBatch, { pos: o.L.pos, nrm: o.L.nrm, idx: o.L.idx, weights: o.L.weights }, boneIndex, uvFn, null, false);
      if (o.fp.mirror) pushPart(furBatch, { pos: o.L.pos, nrm: o.L.nrm, idx: o.L.idx, weights: o.L.weights }, boneIndex, uvFn, null, true);
    });
    const atlas = paintAtlas(TW, TH, bands, spec.paint, !!spec.orm, spec.rough || 0.85);
    const furMat = new THREE.MeshStandardMaterial({ map: atlas.tex, roughness: spec.orm ? 1 : spec.rough || 0.85, metalness: spec.orm ? 1 : 0 });
    if (atlas.orm) { furMat.roughnessMap = atlas.orm; furMat.metalnessMap = atlas.orm; }
    const geos = [{ geo: batchGeometry(furBatch, false), mat: furMat }];
    // accent parts (vertex colored)
    if (spec.accent && spec.accent.length) {
      const ab = newBatch();
      for (const a of spec.accent) {
        let part;
        if (a.kind === 'sphere') part = spherePart(a.c, a.r, a.ws || 10, a.hs || 8, ...(a.s || [1, 1, 1]));
        else if (a.kind === 'tube') part = tubePart(a.pts, a.radii, a.segs || 6, a.capEnd !== false);
        else if (a.kind === 'fan') part = fanPart(a.c, a.outline, a.thick || 0.003, a.n);
        else if (a.kind === 'loft') { const L = buildLoft(a); part = { pos: L.pos, nrm: L.nrm, idx: L.idx }; }
        else if (a.kind === 'raw') part = a.make();
        const col = a.colFn ? (v, x, yy, z) => a.colFn(x, yy, z) : () => hex(a.col);
        part.weights = () => [[a.bone, 1]];
        pushPart(ab, part, boneIndex, null, col, false);
        if (a.mirror) pushPart(ab, part, boneIndex, null, col, true);
      }
      geos.push({ geo: batchGeometry(ab, true), mat: new THREE.MeshStandardMaterial({ vertexColors: true, roughness: spec.accentRough || 0.5, metalness: 0 }) });
    }
    // feathers (birds)
    if (spec.feathers) {
      const fb = newBatch();
      const fs = spec.feathers(rest);
      const [FW, FH] = fs.tex || [128, 256];
      for (const f of fs.list) {
        const bl = featherBlade(f.len, f.wid, f.curl || 0, f.tip == null ? 0.35 : f.tip, f.rootW);
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
        const part = { pos, nrm, idx: bl.idx, weights: () => [[f.bone, 1]] };
        pushPart(fb, part, boneIndex, uvFn, null, false);
        if (f.mirror) pushPart(fb, part, boneIndex, uvFn, null, true);
      }
      const fcv = document.createElement('canvas'); fcv.width = FW; fcv.height = FH;
      const fctx = fcv.getContext('2d'), fimg = fctx.createImageData(FW, FH);
      const FC = { r: 0, g: 0, b: 0 };
      for (let yy = 0; yy < FH; yy++) for (let xx = 0; xx < FW; xx++) {
        FC.r = FC.g = FC.b = 0.5;
        fs.paint((xx + 0.5) / FW, (yy + 0.5) / FH, FC);
        const o = (yy * FW + xx) * 4;
        fimg.data[o] = clamp(FC.r * 255, 0, 255); fimg.data[o + 1] = clamp(FC.g * 255, 0, 255); fimg.data[o + 2] = clamp(FC.b * 255, 0, 255); fimg.data[o + 3] = 255;
      }
      fctx.putImageData(fimg, 0, 0);
      const ft = new THREE.CanvasTexture(fcv); ft.encoding = THREE.sRGBEncoding;
      geos.push({ geo: batchGeometry(fb, false), mat: new THREE.MeshStandardMaterial({ map: ft, roughness: fs.rough || 0.8, metalness: 0, side: THREE.DoubleSide }) });
    }
    // eyes
    const eyeDefs = [];
    for (const e of spec.eyes || []) {
      eyeDefs.push(e);
      eyeDefs.push(Object.assign({}, e, { p: [-e.p[0], e.p[1], e.p[2]], dir: [-e.dir[0], e.dir[1], e.dir[2]], bone: mirrorBoneName(e.bone, boneIndex) }));
    }
    const eyeMat = makeEyeMaterial(spec.eyes && spec.eyes[0]);
    const A = { id, spec, defs, boneIndex, rest, geos, eyeDefs, eyeMat, extras: spec.extras ? spec.extras(rest) : [] };
    // eat pose solve (neck chain)
    if (spec.anim && spec.anim.neck) {
      const an = spec.anim, nk = an.neck, piv = nk.map((n) => rest[n].toArray()), m = spec.mouth;
      const pre = an.eatPitch ? [rest[an.bodyBone || 'hips'].toArray(), an.eatPitch, an.eatDrop || 0] : null;
      A.eatA = solveDown(piv, m, an.neckDist, an.eatY == null ? 0.03 : an.eatY, an.eatMax || 2.4, pre);
      A.drinkA = solveDown(piv, m, an.neckDist, (an.floatDepth || 0) + 0.01, an.eatMax || 2.4, null);
      if (an.eatElev) A.eatPose = solveElev(piv, m, an.eatElev, an.eatY == null ? 0.03 : an.eatY, [rest.hips.toArray(), an.eatPitch || 0, an.eatDrop || 0, rest.chest ? rest.chest.toArray() : null, an.chestEat || 0]);
      if (an.drinkElev) A.drinkPose = solveElev(piv, m, an.drinkElev, (an.floatDepth || 0) + 0.01, null);
    }
    cache[id] = A;
    return A;
  }
  function mirrorBoneName(nm, boneIndex) { if (nm.endsWith('L')) { const r = nm.slice(0, -1) + 'R'; if (boneIndex[r] !== undefined) return r; } return nm; }

  // ---------- eyes ----------
  const eyeGeo = new THREE.SphereGeometry(1, 12, 10);
  const eyeMats = {};
  function makeEyeMaterial(e) {
    const key = e ? [e.iris || 0, e.pupil || '', e.irisR || 0, e.sclera || 0].join(',') : 'none';
    if (eyeMats[key]) return eyeMats[key];
    let mat;
    if (!e || !e.iris) {
      mat = new THREE.MeshStandardMaterial({ color: linColor(e && e.col ? e.col : 0x120d0a), roughness: 0.12, metalness: 0 });
    } else {
      const W = 64, H = 64, cv = document.createElement('canvas'); cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d'), img = ctx.createImageData(W, H), d = img.data;
      const ir = hex(e.iris), dark = hex(0x0b0806), rim = hex(e.rim || 0x1a120c);
      const irisA = (e.irisR || 0.7) * 0.5 * PI; // polar angle radius of iris
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const th = ((y + 0.5) / H) * PI, ph = ((x + 0.5) / W) * TAU;
        // planar coords around the pole: horizontal axis ~ cos(ph), vertical ~ sin(ph)
        const px = th * Math.cos(ph), py = th * Math.sin(ph);
        let c;
        const pa = irisA * (e.pupilR || 0.45);
        let inP;
        if (e.pupil === 'v') inP = (px * px) / Math.pow(pa * 0.35, 2) + (py * py) / Math.pow(pa * 1.1, 2) < 1;
        else if (e.pupil === 'h') inP = (px * px) / Math.pow(pa * 1.25, 2) + (py * py) / Math.pow(pa * 0.55, 2) < 1;
        else inP = th < pa;
        if (inP) c = dark;
        else if (th < irisA) {
          const f = th / irisA, n = noise(px * 30, py * 30, 1.5);
          c = [ir[0] * (0.75 + 0.35 * n) * (1 - 0.35 * f * f), ir[1] * (0.75 + 0.35 * n) * (1 - 0.35 * f * f), ir[2] * (0.75 + 0.35 * n) * (1 - 0.35 * f * f)];
          if (f > 0.9) c = [lerp(c[0], rim[0], (f - 0.9) * 10), lerp(c[1], rim[1], (f - 0.9) * 10), lerp(c[2], rim[2], (f - 0.9) * 10)];
        } else c = e.sclera ? hex(e.sclera) : rim;
        const o = (y * W + x) * 4; d[o] = c[0] * 255; d[o + 1] = c[1] * 255; d[o + 2] = c[2] * 255; d[o + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
      const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding;
      mat = new THREE.MeshStandardMaterial({ map: t, roughness: 0.08, metalness: 0 });
    }
    eyeMats[key] = mat;
    return mat;
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
      meshes.push(m);
    }
    // eyes
    const eyes = [];
    for (const e of A.eyeDefs) {
      const piv = new THREE.Group();
      piv.position.fromArray(e.p).sub(A.rest[e.bone]);
      const m = new THREE.Mesh(eyeGeo, A.eyeMat);
      m.scale.setScalar(e.r);
      eyeBasis(e.dir, m.quaternion);
      m.castShadow = true; m.receiveShadow = false;
      piv.add(m);
      bones[e.bone].add(piv);
      eyes.push(piv);
    }
    // rigid extras: geometry in local space placed at 'at' (rest root space), or in rest root space when 'at' is missing
    const extras = {};
    for (const x of A.extras) {
      const m = new THREE.Mesh(x.geo, x.mat);
      if (x.at) m.position.fromArray(x.at).sub(A.rest[x.bone]); else m.position.copy(A.rest[x.bone]).negate();
      m.castShadow = true; m.receiveShadow = false;
      bones[x.bone].add(m);
      if (x.name) extras[x.name] = m;
    }
    const mouth = new THREE.Object3D();
    mouth.position.fromArray(A.spec.mouth).sub(A.rest[A.spec.mouthBone || 'head']);
    bones[A.spec.mouthBone || 'head'].add(mouth);
    rigCount++;
    const rnd = fract(rigCount * 0.61803398875 + 0.137);
    // remember rest local transforms
    for (const nm in bones) { const b = bones[nm]; b.userData.p0 = b.position.clone(); }
    return { root, bones, skel, meshes, eyes, mouth, rnd, extras };
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
  function makeLeg(R, A, names, front, idx, pole) {
    const r = names.map((n) => A.rest[n]), last = names.length - 1;
    return {
      bs: names.map((n) => R.bones[n]), front, idx,
      Pp: r[last].clone(), L1: r[0].distanceTo(r[1]), L2: r[1].distanceTo(r[2]),
      m: r[last].clone().sub(r[2]), hasPaw: names.length > 3,
      d0: r[1].clone().sub(r[0]).normalize(), d1: r[2].clone().sub(r[1]).normalize(), d2: r[last].clone().sub(r[2]).normalize(),
      pole: new THREE.Vector3().fromArray(pole).normalize(), hipH: r[0].y,
    };
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

  // ---------- legged animator (quadrupeds, hoppers, sprawlers, turtle) ----------
  // anim spec fields:
  //   walk, trot, run (m/s), stride (m per cycle at walk), strideMax (multiplier cap), duty [walk, trot, run]
  //   gaits: { w: [LF, RF, LH, RH] phase offsets, t: [...], g: [...] }
  //   lift [front, hind] swing height (m), flexF / flexH (swing flex rad)
  //   bob [walk, trot, run], pitchRun, flexRun, roll
  //   legs: optional custom [{ n: [upper, lower, meta, paw?], front, pole: [x, y, z] }] (L side; R mirrored automatically)
  //   hop: { up: { f: [dy, dz, flex], h: [...], pitch }, down: {...} } in units of leg height
  //   spine: bones yawed by a lateral body wave (lizard), wave amplitude rad
  //   neck, neckDist, tail, tailRun, tailIdle, tailSway, ears, floatDepth, swimHead
  function animLegged(R, A) {
    const P = A.spec.anim, B = R.bones, root = R.root;
    const S = { ph: R.rnd, sph: R.rnd * 3, spd: 0, move: 0, tw: 0, gw: 0, air: 0, swim: 0, eat: 0, lean: 0, vy: 0, up: 0, look: 0, lookP: 0, gt: 9, hopW: 0, wave: 0, ext: 0 };
    const V = (n) => A.rest[n];
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
    const offW = G.w || [0.25, 0.75, 0.0, 0.5], offT = G.t || [0.5, 1.0, 0.0, 0.5], offG = G.g || [0.52, 0.64, 0.0, 0.1];
    const neck = (P.neck || []).map((n) => B[n]), tail = (P.tail || []).map((n) => B[n]), ears = (P.ears || []).map((n) => B[n]);
    const spine = (P.spine || []).map((n) => B[n]);
    for (const b of neck) b.rotation.order = 'YXZ';
    for (const b of tail) b.rotation.order = 'YXZ';
    const hips = B.hips, chest = B.chest;
    const hip0 = hips.userData.p0.clone();
    const legH = legs[2] ? legs[2].hipH : 0.3;
    const neck0 = neck.length ? neck[0].userData.p0.clone() : null;
    const nose = B.nose;
    const Hp = new THREE.Vector3();
    const hop = P.hop;
    const eatPitch = P.eatPitch || 0, eatDrop = P.eatDrop || 0;

    return function update(dt, st) {
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0, mode = st.mode || 'ground', spdIn = Math.max(0, st.speed || 0);
      const inAir = mode === 'air' || mode === 'fly';
      S.spd = damp(S.spd, spdIn, 5, dt);
      const spd = S.spd;
      spring(S, 'air', inAir ? 1 : 0, hop ? 14 : 9, dt);
      spring(S, 'swim', mode === 'swim' ? 1 : 0, 4, dt);
      spring(S, 'move', spdIn > 0.04 ? 1 : 0, 4, dt);
      S.tw = damp(S.tw, sstep(P.walk * 1.1, P.trot, spd), 3, dt);
      S.gw = damp(S.gw, sstep(P.trot * 1.15, P.run, spd), 3, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 8, dt);
      S.lean = damp(S.lean, clamp((st.turn || 0) * Math.max(spd, 0.5), -4, 4), 4, dt);
      S.vy = damp(S.vy, inAir ? st.vy || 0 : 0, 10, dt);
      spring(S, 'up', inAir ? clamp((st.vy || 0) / 1.2, -1, 1) : 0, 8, dt);
      S.gt = inAir ? 0 : S.gt + dt;
      // hoppers: right after landing (and before the next hop) keep the gathered crouch instead of running a gait
      spring(S, 'hopW', hop && S.gt < 0.6 && spdIn > 0.04 ? 1 : 0, 10, dt);
      const idle = st.idle || 0, still = 1 - S.move;
      const tw = S.tw, gw = S.gw, swim = S.swim, air = S.air * (1 - swim);
      const ground = (1 - S.air) * (1 - swim);
      const L = P.stride * clamp(Math.pow(Math.max(spd, 0.2) / P.walk, 0.5), 0.6, P.strideMax || 2);
      S.ph += Math.min(spd / L, P.maxRate || 12) * dt;
      S.sph += (P.paddle || 1.4) * (0.6 + Math.min(spd, 2) * 0.4) * dt;
      const duty = lerp(lerp(P.duty[0], P.duty[1], tw), P.duty[2], gw);
      const ph = S.ph, w2 = TAU * ph;
      const gaitOn = S.move * ground * (1 - S.hopW);

      // ----- body -----
      const walkW = (1 - tw) * (1 - gw), trotW = tw * (1 - gw);
      let bob = -P.bob[0] * walkW * Math.cos(2 * w2) - P.bob[1] * trotW * Math.cos(2 * TAU * (ph - duty * 0.5)) + P.bob[2] * gw * Math.sin(w2 + 0.6);
      bob *= gaitOn;
      let pitch = gw * (P.pitchRun || 0) * Math.sin(w2 - 0.4) * gaitOn;
      const flex = gw * (P.flexRun || 0) * Math.cos(w2 - 0.4) * gaitOn;
      const roll = (P.roll || 0) * Math.sin(w2) * gaitOn * (1 - gw) + S.lean * -0.03 * (1 - swim);
      const br = Math.sin(t * (1.5 + R.rnd * 0.5) + R.rnd * 9);
      const breathe = br * (P.breathe || 0.004) * (1 - S.move * 0.7);
      // hop pitch, sit-up, eat pitch, swim pitch
      let hp = 0;
      if (hop) hp = (S.up > 0 ? lerp(0, hop.up.pitch, S.up) : lerp(0, hop.down.pitch, -S.up)) * air + S.hopW * (hop.gatherPitch || 0);
      const sitUp = (P.sitUp || 0) * still * ground * (1 - S.eat) * (0.7 + 0.3 * sstep(-0.3, 0.6, Math.sin(t * 0.21 + R.rnd * 40)));
      const eatP = S.eat * eatPitch * ground;
      pitch += hp - sitUp + eatP + swim * (P.swimPitch == null ? -0.08 : P.swimPitch);
      // lizard push-ups when idle
      const push = P.pushups ? P.pushups * ground * still * sstep(0.6, 0.9, Math.sin(t * 0.5 + R.rnd * 20)) * Math.max(0, Math.sin(t * 9)) : 0;
      const drop = -push + S.eat * eatDrop * ground + S.hopW * (hop ? hop.gatherDrop || 0 : 0) + air * (hop ? 0 : 0.01) - sitUp * (P.sitDrop || 0);
      hips.position.set(hip0.x, hip0.y + bob + breathe * 0.5 - drop, hip0.z);
      hips.rotation.set(pitch, S.lean * 0.04 * S.move, roll);
      if (chest) chest.rotation.set(flex + breathe * 0.6 + (P.chestEat || 0) * S.eat, S.lean * 0.06, -roll * 0.6);
      // lateral body wave (sprawlers): spine bones yaw with a traveling wave
      S.wave = damp(S.wave, (P.wave || 0) * (S.move * (1 - air) + swim * 0.8), 4, dt);
      for (let i = 0; i < spine.length; i++) {
        const ry = Math.sin(w2 - i * 0.9 + (P.wavePh || 0)) * S.wave * (i === 0 ? 1 : 1.2);
        if (spine[i] === hips) hips.rotation.y += ry; else spine[i].rotation.y = ry;
      }

      // ----- legs -----
      for (const lg of legs) {
        const off = lerp(lerp(offW[lg.idx], offT[lg.idx], tw), offG[lg.idx], gw);
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
        const sideOut = (P.splay || 0) * (lg.idx % 2 === 0 ? 1 : -1);
        // grazers spread and push the front feet forward while eating
        const es = lg.front && P.eatSplay ? S.eat * ground : 0;
        let tx = lg.Pp.x + sideOut * dy * 0.5, ty = lg.Pp.y + dy * gaitOn, tz = lg.Pp.z + dz * gaitOn;
        if (es) { tx += (lg.idx % 2 === 0 ? 1 : -1) * P.eatSplay[0] * legH * es; tz += P.eatSplay[1] * legH * es; }
        let flx = fl * gaitOn, tq = toe * gaitOn;
        // hopper gathered crouch between hops
        if (hop && S.hopW > 0.001) {
          const gth = lg.front ? hop.gather.f : hop.gather.h;
          ty = lerp(ty, lg.Pp.y + gth[0] * legH, S.hopW); tz = lerp(tz, lg.Pp.z + gth[1] * legH, S.hopW); flx = lerp(flx, gth[2], S.hopW);
        }
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
          } else {
            // paddling: alternate diagonal pairs in a circle under the body
            const sp = fract(S.sph + (lg.idx === 0 || lg.idx === 3 ? 0 : 0.5));
            const sa = sp * TAU, rr = legH * (P.paddleR || 0.22);
            swz = lg.Pp.z + Math.cos(sa) * rr * (lg.front ? 1.1 : 0.9) + (lg.front ? 0.05 : -0.08) * legH;
            swy = lg.Pp.y + (Math.sin(sa) * 0.6 + 0.9) * rr;
            swx = lg.Pp.x + sideOut * legH * 0.3;
            swFl = (lg.front ? 0.6 : 0.4) + Math.sin(sa) * 0.45; swq = 0.7;
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
        // sitting up: front paws held up under the chin
        if (lg.front && P.sitPaws && sitUp > 0.001) {
          rootPos(lg.bs[0], root, Hp);
          const k = sitUp / P.sitUp, sp2 = P.sitPaws;
          tx = lerp(tx, lg.Pp.x * 0.8, k); ty = lerp(ty, Hp.y - legH * sp2[0], k); tz = lerp(tz, Hp.z + legH * sp2[1], k); flx = lerp(flx, sp2[2], k);
        }
        solveLeg(lg, root, tx, ty, tz, flx, tq);
      }

      // ----- neck and head -----
      const lookOn = sstep(1.0, 2.5, idle) * (1 - S.eat) * (1 - air);
      S.look = damp(S.look, lookTarget(t, R.rnd, 3.7, P.lookAmp || 0.7) * lookOn, 2.5, dt);
      S.lookP = damp(S.lookP, lookTarget(t + 11, R.rnd, 5.3, 0.16) * lookOn, 2, dt);
      const nod = (P.nod || 0.04) * Math.sin(2 * w2 + 0.5) * gaitOn * (1 - gw) + gw * 0.07 * Math.sin(w2 + 1.2) * gaitOn;
      const eatA = lerp(A.eatA || 0, A.drinkA || 0, swim);
      const chew = Math.sin(t * (P.chewRate || 12)) * (P.chew || 0.06) * sstep(0.75, 0.95, S.eat);
      const runLow = gw * (P.runNeck || 0.25) * gaitOn + tw * (P.trotNeck || 0.06) * gaitOn;
      const hopNeck = hop ? (S.up * -0.25 * air) : 0;
      for (let i = 0; i < neck.length; i++) {
        const d = P.neckDist[i];
        const eatRot = A.eatPose ? lerp(A.eatPose[i], A.drinkPose ? A.drinkPose[i] : d * eatA, swim) : d * eatA;
        let px = eatRot * S.eat + (runLow + nod + hopNeck) * d - (pitch + flex) * (i === 0 ? 1 : 0) * (1 - S.eat);
        px += swim * (P.swimHead == null ? -0.3 : P.swimHead) * d * (1 - S.eat);
        px += S.lookP * d + sitUp * (P.sitNeck || 0.5) * d;
        if (i === neck.length - 1) px += chew;
        neck[i].rotation.set(px, (S.look + S.lean * 0.05) * d, 0);
      }
      // turtle style head extension
      if (P.extend && neck0) {
        const tgtE = clamp(0.45 + S.move * 0.5 + S.eat + swim * 0.4 + lookOn * 0.4 * Math.sin(t * 0.3 + R.rnd * 9), 0, 1);
        S.ext = damp(S.ext, tgtE, 2.5, dt);
        neck[0].position.set(neck0.x, neck0.y + P.extend[1] * S.ext, neck0.z + P.extend[0] * (S.ext - 1));
      }
      // ----- tail -----
      for (let i = 0; i < tail.length; i++) {
        const k = i / Math.max(1, tail.length - 1);
        let sway = Math.sin(t * 1.3 + R.rnd * 20 + i * 0.6) * (P.tailSway || 0.1) * (0.4 + still * 0.6) + Math.sin(w2 + i * 0.7) * (P.tailWalk || 0.08) * gaitOn;
        if (P.wave) sway += Math.sin(w2 - (spine.length + i) * 0.9 + (P.wavePh || 0)) * S.wave * 1.3;
        if (P.tailFlick) sway += Math.sin(t * 9 + i) * P.tailFlick * sstep(0.93, 0.97, fract(t * 0.13 + R.rnd * 3)) * (1 - sstep(0.97, 1, fract(t * 0.13 + R.rnd * 3)));
        const lift = (P.tailRun ? P.tailRun[i] : 0) * (tw * 0.5 + gw) * gaitOn + (P.tailIdle ? P.tailIdle[i] : 0) * still + (P.tailAir ? P.tailAir[i] * air : 0);
        tail[i].rotation.set(lift + bob * 2 * (1 + k) + swim * (P.tailSwim || 0.25) * (i === 0 ? 1 : 0), sway - S.lean * 0.05, 0);
      }
      // ----- ears -----
      for (let i = 0; i < ears.length; i++) {
        const sg = i === 0 ? 1 : -1, fp = fract(t * 0.23 + R.rnd * 5 + i * 0.37);
        const flick = fp < 0.04 ? Math.sin(fp * 25 * PI) : 0;
        const back = (gw * 0.3 * gaitOn + air * (hop ? 0.5 : 0.2) + swim * 0.3) * (P.earBack || 1);
        ears[i].rotation.set(-back + flick * 0.4 - S.eat * (P.earEat || 0), sg * S.look * 0.3, sg * (flick * 0.5 - back * 0.4));
      }
      if (nose) nose.position.y = nose.userData.p0.y + Math.max(0, Math.sin(t * 14 + R.rnd * 5)) * 0.0025 * (sstep(0.3, 0.6, Math.sin(t * 0.8 + R.rnd * 3)));
      const bl = blinkScale(t, R.rnd);
      for (const e of R.eyes) e.scale.y = bl;
    };
  }

  // ---------- bird animator (duck, swan, chicken, owl, parrot) ----------
  function animBird(R, A) {
    const P = A.spec.anim, B = R.bones, root = R.root, W = P.wing;
    const S = { ph: R.rnd, fph: R.rnd * TAU, spd: 0, move: 0, rw: 0, air: 0, fly: 0, swim: 0, eat: 0, lean: 0, fold: 1, glide: 0, flap: 0, look: 0, lookP: 0, sph: R.rnd, climb: 0, hop: 0, gt: 9 };
    const legs = [
      makeLeg(R, A, ['thighL', 'shinL', 'hmetaL', 'hpawL'], false, 0, [0, 0, 1]),
      makeLeg(R, A, ['thighR', 'shinR', 'hmetaR', 'hpawR'], false, 1, [0, 0, 1]),
    ];
    const neck = P.neck.map((n) => B[n]);
    for (const b of neck) b.rotation.order = 'YXZ';
    const hips = B.hips, hip0 = hips.userData.p0.clone(), tail = P.tail ? B[P.tail] : null;
    if (tail) tail.rotation.order = 'YXZ';
    const head = neck[neck.length - 1], head0 = head.userData.p0.clone();
    const legH = legs[0].hipH, flyLegs = P.flyLegs || [-0.45, -0.6, 1.0];
    const side = (s) => (W ? { sh: B['wing' + s], el: B['wfore' + s], wr: B['whand' + s], fs: W.fb.map((f) => B[f.name.slice(0, -1) + s]) } : null);
    const shP0 = W ? B.wingL.userData.p0.clone() : null, fpo = W && W.foldedPos ? W.foldedPos : [0, 0, 0];
    const wl = side('L'), wr = side('R');
    // eating poses: ground (body pitched forward) and on the water (body dropped)
    const piv = P.neck.map((n) => A.rest[n].toArray()), mouth = A.spec.mouth, hp = A.rest.hips.toArray();
    const sp0 = P.standPitch || 0;
    const eatG = solveDown(piv, mouth, P.neckDist, P.eatY == null ? 0.02 : P.eatY, P.eatMax || 2.2, [hp, (P.eatPitch || 0) + sp0, 0]);
    const eatW = solveDown(piv, mouth, P.neckDist, 0.0, P.eatMax || 2.2, [hp, (P.swimEatPitch || 0.1) + sp0, P.swimDrop || 0]);
    const eatPG = P.eatElev ? solveElev(piv, mouth, P.eatElev, P.eatY == null ? 0.02 : P.eatY, [hp, (P.eatPitch || 0) + sp0, P.eatDrop || 0]) : null;
    const eatPW = P.drinkElev ? solveElev(piv, mouth, P.drinkElev, 0.0, [hp, (P.swimEatPitch || 0.1) + sp0, P.swimDrop || 0]) : null;
    // flight / swim neck poses from absolute segment elevations (deg); last segment runs head pivot to mouth
    const segs = piv.map((p0, i) => { const q = i + 1 < piv.length ? piv[i + 1] : mouth; return Math.atan2(q[1] - p0[1], q[2] - p0[2]); });
    const poseFromElev = (elev, bodyPitch) => {
      if (!elev) return piv.map(() => 0);
      const out = []; let prev = 0;
      for (let i = 0; i < segs.length; i++) { const c = segs[i] - bodyPitch - elev[i] * DEG; out.push(c - prev); prev = c; }
      return out;
    };
    const flyN = poseFromElev(P.flyElev, P.flyPitch || 0), swimN = poseFromElev(P.swimElev, sp0 + (P.swimPitch || 0)), standN = poseFromElev(P.standElev, sp0);
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
      const t = st.t || 0, spdIn = Math.max(0, st.speed || 0);
      let mode = st.mode || 'ground';
      if (mode === 'fly' && (!W || !P.canFly)) mode = 'air';
      S.spd = damp(S.spd, spdIn, 5, dt);
      const spd = S.spd;
      spring(S, 'fly', mode === 'fly' ? 1 : 0, 5, dt);
      spring(S, 'air', mode === 'air' ? 1 : 0, 9, dt);
      spring(S, 'swim', mode === 'swim' ? 1 : 0, 4, dt);
      spring(S, 'move', spdIn > 0.04 ? 1 : 0, 5, dt);
      S.rw = damp(S.rw, sstep(P.walk, P.run, spd), 3, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 8, dt);
      S.lean = damp(S.lean, clamp((st.turn || 0) * Math.max(spd, 0.5), -4, 4), 4, dt);
      const vy = st.vy || 0;
      S.glide = damp(S.glide, mode === 'fly' && vy < -0.5 ? 1 : 0, 3, dt);
      S.climb = damp(S.climb, mode === 'fly' ? sat(vy / 2) : 0, 3, dt);
      // wings: spread when flying, half open and flapping during a jump for flightless use
      const wantFold = mode === 'fly' ? 0 : mode === 'air' ? 1 - (P.jumpFlap || 0) : 1;
      spring(S, 'fold', wantFold, mode === 'fly' ? 6 : 4, dt);
      const fly = S.fly, swim = S.swim * (1 - fly), air = Math.max(S.air, fly), ground = (1 - air) * (1 - swim);
      const idle = st.idle || 0, still = 1 - S.move;

      // ----- gait phase -----
      const L = P.stride * clamp(Math.pow(Math.max(spd, 0.2) / P.walk, 0.5), 0.6, P.strideMax || 1.8);
      S.ph += Math.min(spd / L, P.maxRate || 12) * dt * (1 - air);
      S.sph += (1.3 + Math.min(spd, 2) * 0.6) * dt;
      const duty = lerp(P.duty[0], P.duty[1], S.rw), ph = S.ph, w2 = TAU * ph;
      const gaitOn = S.move * ground;

      // ----- flapping -----
      const rate = (P.wing && W.flap.rate) || 5, flapAmt = (1 - S.glide * 0.92) * (1 - S.fold);
      S.fph += TAU * rate * (1 + S.climb * 0.25 - S.glide * 0.3) * dt;
      const fphase = S.fph;
      S.flap = damp(S.flap, flapAmt, 6, dt);
      const amp = W ? W.flap.amp * DEG * (1 + S.climb * 0.15) : 0;
      const flapRoll = W ? amp * Math.cos(fphase) * S.flap + S.glide * (1 - S.fold) * (W.flap.glide || 6) * DEG : 0;
      const g = W ? Math.max(0, -Math.sin(fphase)) * W.flap.upFold * S.flap : 0;
      const twist = W ? Math.sin(fphase) * (W.flap.twist || 12) * DEG * S.flap : 0;

      // ----- body -----
      const sw = Math.sin(w2), cw = Math.cos(TAU * (ph - duty * 0.5));
      const bob = (-P.bob * Math.cos(2 * TAU * (ph - duty * 0.5)) * (1 + S.rw)) * gaitOn;
      const roll = -P.waddle * cw * gaitOn * (1 - S.rw * 0.4) - S.lean * 0.04 * (1 - swim) * (1 - fly) - S.lean * 0.12 * fly;
      const yaw = P.yawSway * sw * gaitOn;
      const br = Math.sin(t * (1.7 + R.rnd * 0.4) + R.rnd * 9) * 0.004 * still;
      const flyBob = W ? -Math.sin(fphase) * (P.flyBob || 0.01) * S.flap * fly : 0;
      const drop = swim * (P.swimDrop || 0) + S.eat * ground * (P.eatDrop || 0);
      const pitch = lerp(sp0, P.flyPitch == null ? 0 : P.flyPitch, fly) + S.eat * ((P.eatPitch || 0) * ground + (P.swimEatPitch || 0.1) * swim) + gaitOn * S.rw * (P.runPitch || 0.08) + swim * (P.swimPitch || 0);
      hips.position.set(hip0.x, hip0.y + bob + br + flyBob - drop + air * (1 - fly) * 0.0, hip0.z);
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
      const lookOn = sstep(1.0, 2.5, idle) * (1 - S.eat) * (1 - fly);
      S.look = damp(S.look, lookTarget(t, R.rnd, P.lookPeriod || 3.1, P.lookAmp || 0.8) * lookOn, P.lookRate || 3, dt);
      S.lookP = damp(S.lookP, lookTarget(t + 11, R.rnd, 4.3, 0.2) * lookOn, 2, dt);
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
        neck[i].rotation.set(px, (S.look + S.lean * 0.05) * (P.lookDist ? P.lookDist[i] : d), 0);
      }
      // chicken style head bob: head holds still in space then thrusts forward
      if (P.headBob) {
        const q = fract(2 * ph), A2 = 0.175 * L * P.headBob;
        const off = q < 0.7 ? A2 * (1 - (2 * q) / 0.7) : -A2 + 2 * A2 * sstep(0.7, 1, q);
        head.position.set(head0.x, head0.y, head0.z + off * gaitOn * (1 - S.eat));
      }
      // ----- tail -----
      if (tail) {
        const wag = sstep(0.0, 0.05, fract(t * 0.11 + R.rnd * 3)) * (1 - sstep(0.05, 0.1, fract(t * 0.11 + R.rnd * 3)));
        tail.rotation.set(fly * (P.flyTail || 0) + (1 - fly) * (1 - swim) * (P.standTail || 0) - S.eat * 0.2 + swim * (P.swimTail || 0.1) + bob * 3, Math.sin(t * 22) * (P.tailWag || 0) * wag + yaw * -1.5 + S.lean * 0.1 * fly, 0);
      }
      const bl = blinkScale(t, R.rnd);
      for (const e of R.eyes) e.scale.y = bl;
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
    const xs = new Float32Array(N + 1), zs = new Float32Array(N + 1), ys = new Float32Array(N + 1);
    const tongue0 = tongue ? tongue.position.clone() : null, NZ = new THREE.Vector3(0, 0, -1);
    return function update(dt, st) {
      dt = clamp(dt || 0, 0, 0.1);
      const t = st.t || 0, mode = st.mode || 'ground', spdIn = Math.max(0, st.speed || 0);
      S.spd = damp(S.spd, spdIn, 4, dt);
      const spd = S.spd;
      spring(S, 'swim', mode === 'swim' ? 1 : 0, 3, dt);
      S.air = damp(S.air, mode === 'air' || mode === 'fly' ? 1 : 0, 8, dt);
      spring(S, 'eat', eatEnvelope(st.eat || 0), 7, dt);
      S.lean = damp(S.lean, clamp(st.turn || 0, -3, 3), 3, dt);
      const moving = sstep(0.02, 0.3, spd);
      // wavelength shrinks a little and amplitude grows with speed
      const lam = lerp(0.62, 0.5, sstep(0.3, 2.2, spd)) * (1 + S.swim * 0.2);
      const k = TAU / lam;
      const ampT = lerp(0.045, lerp(0.05, 0.068, sstep(0.3, 2.2, spd)), moving) * (1 + S.swim * 0.2);
      S.amp = damp(S.amp, ampT, 2, dt);
      // phase: travel speed along the track, plus a slow idle drift
      S.ph += (spd * k * 1.02 + (1 - moving) * 0.25) * dt;
      // head lifts when idle and looking around, lowers to eat
      const idle = st.idle || 0;
      const lookOn = sstep(1.0, 2.5, idle) * (1 - S.eat);
      S.look = damp(S.look, lookTarget(t, R.rnd, 3.3, 0.5) * lookOn, 2, dt);
      S.lift = damp(S.lift, (lookOn * 0.03 + (1 - moving) * 0.012) * (1 - S.swim) - S.eat * 0.01, 2, dt);
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
      const yaw = Math.atan2(_v1.x, _v1.z) * 0.6 + S.look;
      const pitch = -S.lift * 4 + S.eat * 0.35 + Math.sin(t * 13) * 0.03 * sstep(0.8, 0.95, S.eat);
      head.position.set(xs[0], ys[0], zs[0] + 0.012);
      head.rotation.set(pitch, yaw, 0, 'YXZ');
      // tongue flicks every few seconds
      if (tongue) {
        const ft = fract(t / (2.4 + R.rnd * 1.5) + R.rnd);
        const flick = ft < 0.14 ? Math.sin((ft / 0.14) * PI) : 0;
        const wig = Math.sin(t * 60) * 0.25 * flick;
        tongue.visible = flick > 0.05;
        tongue.scale.set(1, 1, Math.max(0.01, flick));
        tongue.rotation.set(0.15 + wig, 0, 0);
        tongue.position.copy(tongue0);
      }
      const bl = blinkScale(t, R.rnd);
      for (const e of R.eyes) e.scale.y = bl;
    };
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
      mouthWorld(out) { R.mouth.updateWorldMatrix(true, false); return out.setFromMatrixPosition(R.mouth.matrixWorld); },
      update(dt, st) { upd(dt, st || {}); },
      setVisible(v) { R.root.visible = !!v; },
    };
    upd(0, { t: 0, speed: 0, mode: 'ground', vy: 0, eat: 0, turn: 0, idle: 0 });
    return rig;
  }

  return { ids, build };
})();
