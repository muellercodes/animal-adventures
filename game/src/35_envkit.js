/* ============================================================
   Env: procedural 3D scenery kit for Animal Adventures.
   Props, materials, grass, water, sky, clouds, effects and food.
   Units are meters, Y is up, every prop has its base at y = 0.
   Everything is procedural: geometry, canvas textures and shaders.
   ============================================================ */
const Env = (() => {
  const TAU = Math.PI * 2;
  const V3 = THREE.Vector3;
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

  /* ---------- random numbers and value noise ---------- */
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return () => {
      a = (a + 0x6D2B79F5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function strSeed(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  const PERM = new Uint8Array(512);
  const VAL = new Float32Array(256);
  (() => {
    const r = rng(1337), p = [];
    for (let i = 0; i < 256; i++) { p.push(i); VAL[i] = r() * 2 - 1; }
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = p[i]; p[i] = p[j]; p[j] = t; }
    for (let i = 0; i < 512; i++) PERM[i] = p[i & 255];
  })();
  const lat = (x, y, z) => VAL[PERM[PERM[PERM[x & 255] + (y & 255)] + (z & 255)]];
  function noise3(x, y, z) {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const xf = x - xi, yf = y - yi, zf = z - zi;
    const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
    const x0 = lerp(lat(xi, yi, zi), lat(xi + 1, yi, zi), u);
    const x1 = lerp(lat(xi, yi + 1, zi), lat(xi + 1, yi + 1, zi), u);
    const x2 = lerp(lat(xi, yi, zi + 1), lat(xi + 1, yi, zi + 1), u);
    const x3 = lerp(lat(xi, yi + 1, zi + 1), lat(xi + 1, yi + 1, zi + 1), u);
    return lerp(lerp(x0, x1, v), lerp(x2, x3, v), w);
  }
  function fbm(x, y, z, oct = 3) {
    let s = 0, a = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += noise3(x, y, z) * a; n += a; a *= 0.5; x = x * 2.03 + 17.1; y = y * 2.03 - 7.3; z = z * 2.03 + 3.9; }
    return s / n;
  }

  /* ---------- colors (vertex colors and uniforms are linear) ---------- */
  const s2l = (c) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const L = (hex) => [s2l(((hex >> 16) & 255) / 255), s2l(((hex >> 8) & 255) / 255), s2l((hex & 255) / 255)];
  function lcol(hex) { const c = new THREE.Color(), l = L(hex); c.r = l[0]; c.g = l[1]; c.b = l[2]; return c; }
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const mulc = (a, s) => [a[0] * s, a[1] * s, a[2] * s];

  /* ---------- geometry helpers (everything is merged non-indexed) ---------- */
  const KEEP = { position: 1, normal: 1, uv: 1, color: 1, tint: 1, card: 1, hang: 1, glow: 1 };
  const OPT = { tint: 1, card: 2, hang: 1, glow: 1 };
  function prep(geo) {
    const g = geo.index ? geo.toNonIndexed() : geo;
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) g.setAttribute('color', new THREE.Float32BufferAttribute(new Float32Array(n * 3).fill(1), 3));
    for (const k of Object.keys(g.attributes)) if (!KEEP[k]) g.deleteAttribute(k);
    g.clearGroups();
    return g;
  }
  // fn(x, y, z, nx, ny, nz, i) -> [r, g, b] linear
  function paint(geo, fn) {
    const g = prep(geo), p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array;
    const cnt = g.attributes.position.count;
    for (let i = 0; i < cnt; i++) {
      const k = i * 3, col = typeof fn === 'function' ? fn(p[k], p[k + 1], p[k + 2], n[k], n[k + 1], n[k + 2], i) : fn;
      c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2];
    }
    g.attributes.color.needsUpdate = true;
    return g;
  }
  function setAttr1(geo, name, v) {
    const g = prep(geo), n = g.attributes.position.count;
    g.setAttribute(name, new THREE.Float32BufferAttribute(new Float32Array(n).fill(v), 1));
    return g;
  }
  const setGlow = (geo, v = 1) => setAttr1(geo, 'glow', v);
  function setTint(geo, v) {
    const g = prep(geo), n = g.attributes.position.count;
    g.setAttribute('tint', new THREE.Float32BufferAttribute(new Float32Array(n).fill(v), 1));
    return g;
  }
  function merge(list) {
    const gs = list.filter(Boolean).map(prep);
    let n = 0;
    const opt = {};
    for (const g of gs) { n += g.attributes.position.count; for (const k in OPT) if (g.attributes[k]) opt[k] = OPT[k]; }
    const base = { position: 3, normal: 3, uv: 2, color: 3 };
    const all = Object.assign({}, base, opt), arr = {};
    for (const k in all) arr[k] = new Float32Array(n * all[k]);
    if (opt.tint) arr.tint.fill(0);
    let o = 0;
    for (const g of gs) {
      const c = g.attributes.position.count;
      for (const k in all) if (g.attributes[k]) arr[k].set(g.attributes[k].array.subarray(0, c * all[k]), o * all[k]);
      o += c;
    }
    const out = new THREE.BufferGeometry();
    for (const k in all) out.setAttribute(k, new THREE.BufferAttribute(arr[k], all[k]));
    out.computeBoundingBox();
    out.computeBoundingSphere();
    return out;
  }
  // smooth normals by welding equal positions (works across seams of non-indexed meshes)
  function smoothNormals(geo) {
    const g = prep(geo), p = g.attributes.position.array, cnt = g.attributes.position.count;
    const map = new Map(), ids = new Int32Array(cnt), acc = [];
    for (let i = 0; i < cnt; i++) {
      const k = Math.round(p[i * 3] * 2000) + ',' + Math.round(p[i * 3 + 1] * 2000) + ',' + Math.round(p[i * 3 + 2] * 2000);
      let id = map.get(k);
      if (id === undefined) { id = acc.length / 3; map.set(k, id); acc.push(0, 0, 0); }
      ids[i] = id;
    }
    for (let t = 0; t + 2 < cnt; t += 3) {
      const a = t * 3, b = a + 3, c = a + 6;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      for (let j = 0; j < 3; j++) { const q = ids[t + j] * 3; acc[q] += nx; acc[q + 1] += ny; acc[q + 2] += nz; }
    }
    const n = g.attributes.normal.array;
    for (let i = 0; i < cnt; i++) {
      const q = ids[i] * 3, l = Math.hypot(acc[q], acc[q + 1], acc[q + 2]) || 1;
      n[i * 3] = acc[q] / l; n[i * 3 + 1] = acc[q + 1] / l; n[i * 3 + 2] = acc[q + 2] / l;
    }
    g.attributes.normal.needsUpdate = true;
    return g;
  }
  // per-triangle box projection uvs (good for noisy detail textures)
  function boxUV(geo, s) {
    const g = prep(geo), p = g.attributes.position.array, uv = g.attributes.uv.array, cnt = g.attributes.position.count;
    for (let t = 0; t + 2 < cnt; t += 3) {
      const a = t * 3, b = a + 3, c = a + 6;
      const ux = p[b] - p[a], uy = p[b + 1] - p[a + 1], uz = p[b + 2] - p[a + 2];
      const vx = p[c] - p[a], vy = p[c + 1] - p[a + 1], vz = p[c + 2] - p[a + 2];
      const nx = Math.abs(uy * vz - uz * vy), ny = Math.abs(uz * vx - ux * vz), nz = Math.abs(ux * vy - uy * vx);
      for (let j = 0; j < 3; j++) {
        const k = (t + j) * 3, w = (t + j) * 2;
        if (nx >= ny && nx >= nz) { uv[w] = p[k + 2] * s; uv[w + 1] = p[k + 1] * s; }
        else if (ny >= nz) { uv[w] = p[k] * s; uv[w + 1] = p[k + 2] * s; }
        else { uv[w] = p[k] * s; uv[w + 1] = p[k + 1] * s; }
      }
    }
    g.attributes.uv.needsUpdate = true;
    return g;
  }
  function eachVertex(geo, fn) {
    const g = prep(geo), p = g.attributes.position.array, cnt = g.attributes.position.count, v = new V3();
    for (let i = 0; i < cnt; i++) { v.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); fn(v, i); p[i * 3] = v.x; p[i * 3 + 1] = v.y; p[i * 3 + 2] = v.z; }
    g.attributes.position.needsUpdate = true;
    return g;
  }
  const mat4 = () => new THREE.Matrix4();
  function place(geo, x, y, z, rx = 0, ry = 0, rz = 0, s = 1) {
    const m = mat4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)), typeof s === 'number' ? new V3(s, s, s) : s);
    geo.applyMatrix4(m);
    return geo;
  }
  // triangle soup builder
  function soup() {
    const P = [], U = [], C = [];
    return {
      tri(a, b, c, ca, cb, cc, ua, ub, uc) {
        P.push(a.x, a.y, a.z, b.x, b.y, b.z, c.x, c.y, c.z);
        ca = ca || [1, 1, 1]; cb = cb || ca; cc = cc || ca;
        C.push(ca[0], ca[1], ca[2], cb[0], cb[1], cb[2], cc[0], cc[1], cc[2]);
        U.push(ua ? ua[0] : 0, ua ? ua[1] : 0, ub ? ub[0] : 0, ub ? ub[1] : 0, uc ? uc[0] : 0, uc ? uc[1] : 0);
      },
      quad(a, b, c, d, ca, cb, cc, cd, ua, ub, uc, ud) { this.tri(a, b, c, ca, cb, cc, ua, ub, uc); this.tri(a, c, d, ca, cc, cd || ca, ua, uc, ud); },
      geo(smoothN = true) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(new Float32Array(P.length), 3));
        if (smoothN) smoothNormals(g); else g.computeVertexNormals();
        return g;
      },
    };
  }
  // smooth path through control points
  function path(pts, n) {
    if (pts.length < 3) { const out = []; for (let i = 0; i <= n; i++) out.push(new V3().lerpVectors(pts[0], pts[1], i / n)); return out; }
    return new THREE.CatmullRomCurve3(pts, false, 'centripetal').getPoints(n);
  }
  /* tube along a polyline.
     rad: number | array | fn(i, t, angle) ; o.radial, o.cap ('end'|'both'), o.uRep, o.vLen, o.color fn(t, angle, pos) */
  function tube(pts, rad, o = {}) {
    const n = pts.length, R = o.radial || 6, S = soup();
    const T = [], Nn = [], B = [];
    for (let i = 0; i < n; i++) T.push(new V3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize());
    const nrm = new V3().crossVectors(T[0], Math.abs(T[0].y) < 0.9 ? new V3(0, 1, 0) : new V3(1, 0, 0)).normalize();
    for (let i = 0; i < n; i++) {
      if (i > 0) {
        const ax = new V3().crossVectors(T[i - 1], T[i]), l = ax.length();
        if (l > 1e-6) nrm.applyAxisAngle(ax.divideScalar(l), Math.acos(clamp(T[i - 1].dot(T[i]), -1, 1)));
      }
      Nn.push(nrm.clone());
      B.push(new V3().crossVectors(T[i], nrm).normalize());
    }
    const len = [0];
    for (let i = 1; i < n; i++) len.push(len[i - 1] + pts[i].distanceTo(pts[i - 1]));
    const total = len[n - 1] || 1, uRep = o.uRep || 1, vLen = o.vLen || 1;
    const ring = [];
    for (let i = 0; i < n; i++) {
      const row = [], t = len[i] / total;
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * TAU + (o.twist || 0) * t;
        const r = typeof rad === 'function' ? rad(i, t, a) : Array.isArray(rad) ? rad[i] : rad;
        const d = new V3().copy(Nn[i]).multiplyScalar(Math.cos(a)).addScaledVector(B[i], Math.sin(a));
        const p = new V3().copy(pts[i]).addScaledVector(d, r);
        row.push({ p, uv: [(j / R) * uRep, len[i] / vLen], c: o.color ? o.color(t, a, p) : [1, 1, 1] });
      }
      ring.push(row);
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < R; j++) {
      const a = ring[i][j], b = ring[i + 1][j], c = ring[i + 1][j + 1], d = ring[i][j + 1];
      S.tri(a.p, d.p, b.p, a.c, d.c, b.c, a.uv, d.uv, b.uv);
      S.tri(d.p, c.p, b.p, d.c, c.c, b.c, d.uv, c.uv, b.uv);
    }
    const capCol = o.capColor;
    if (o.cap === 'end' || o.cap === 'both') {
      const last = ring[n - 1], cp = pts[n - 1], cc = capCol || last[0].c;
      for (let j = 0; j < R; j++) S.tri(cp, last[j].p, last[j + 1].p, cc, cc, cc, [0.5, 0.5], [0.5 + 0.5 * Math.cos(j / R * TAU), 0.5 + 0.5 * Math.sin(j / R * TAU)], [0.5 + 0.5 * Math.cos((j + 1) / R * TAU), 0.5 + 0.5 * Math.sin((j + 1) / R * TAU)]);
    }
    if (o.cap === 'both') {
      const first = ring[0], cp = pts[0], cc = capCol || first[0].c;
      for (let j = 0; j < R; j++) S.tri(cp, first[j + 1].p, first[j].p, cc, cc, cc);
    }
    const g = S.geo(o.smooth !== false);
    return g;
  }
  /* displaced icosphere blob (non-indexed, smooth normals) */
  function blobRadius(c, dx, dy, dz) {
    return c.r * (1 + c.amp * fbm(dx * c.fq + c.off, dy * c.fq - c.off * 0.7, dz * c.fq + c.off * 1.3, c.oct));
  }
  function blob(c) {
    // c: {x,y,z,r,sx,sy,sz,detail,amp,fq,off,oct}
    c.sx = c.sx || 1; c.sy = c.sy || 1; c.sz = c.sz || 1; c.amp = c.amp == null ? 0.2 : c.amp; c.fq = c.fq || 1.5; c.off = c.off || 0; c.oct = c.oct || 2;
    const g = prep(new THREE.IcosahedronGeometry(1, c.detail == null ? 1 : c.detail));
    eachVertex(g, (v) => {
      v.normalize();
      const k = blobRadius(c, v.x, v.y, v.z);
      v.set(c.x + v.x * k * c.sx, c.y + v.y * k * c.sy, c.z + v.z * k * c.sz);
    });
    return smoothNormals(g);
  }
  function insideBlob(c, x, y, z, shrink) {
    const lx = (x - c.x) / c.sx, ly = (y - c.y) / c.sy, lz = (z - c.z) / c.sz, d = Math.hypot(lx, ly, lz);
    if (d < 1e-6) return true;
    return d < blobRadius(c, lx / d, ly / d, lz / d) * shrink;
  }
  // drop triangles fully hidden inside other blobs
  function cullHidden(geos, clumps, shrink = 0.95) {
    return geos.map((g, gi) => {
      const p = g.attributes.position.array, cnt = g.attributes.position.count, keep = [];
      for (let t = 0; t + 2 < cnt; t += 3) {
        let hidden = false;
        for (let ci = 0; ci < clumps.length && !hidden; ci++) {
          if (ci === gi) continue;
          const c = clumps[ci];
          if (insideBlob(c, p[t * 3], p[t * 3 + 1], p[t * 3 + 2], shrink) && insideBlob(c, p[t * 3 + 3], p[t * 3 + 4], p[t * 3 + 5], shrink) && insideBlob(c, p[t * 3 + 6], p[t * 3 + 7], p[t * 3 + 8], shrink)) hidden = true;
        }
        if (!hidden) keep.push(t);
      }
      if (keep.length * 3 === cnt) return g;
      const out = new THREE.BufferGeometry();
      for (const name of ['position', 'normal', 'uv', 'color', 'card', 'hang', 'glow'].filter((k) => g.attributes[k])) {
        const a = g.attributes[name], s = a.itemSize, arr = new Float32Array(keep.length * 3 * s);
        keep.forEach((t, k) => arr.set(a.array.subarray(t * s, (t + 3) * s), k * 3 * s));
        out.setAttribute(name, new THREE.BufferAttribute(arr, s));
      }
      return out;
    });
  }
  /* foliage crown from clumps: culls hidden faces, bends normals outward from the crown center
     (soft volumetric lighting) and paints a dark-inside, light-on-top gradient. */
  function crown(clumps, o) {
    const ctr = o.center, rad = o.radii, bend = o.bend == null ? 0.55 : o.bend, r = rng(o.seed || 1);
    const geos = cullHidden(clumps.map(blob), clumps, 0.97);
    const tints = clumps.map(() => (r() - 0.5) * 2);
    const out = geos.map((g, gi) => {
      g = prep(g);
      const p = g.attributes.position.array, n = g.attributes.normal.array, c = g.attributes.color.array, cnt = g.attributes.position.count;
      for (let i = 0; i < cnt; i++) {
        const k = i * 3;
        let dx = (p[k] - ctr.x) / rad.x, dy = (p[k + 1] - ctr.y) / rad.y, dz = (p[k + 2] - ctr.z) / rad.z;
        const rel = Math.hypot(dx, dy, dz) || 1;
        dx /= rel; dy /= rel; dz /= rel;
        let nx = n[k] * (1 - bend) + dx * bend, ny = n[k + 1] * (1 - bend) + dy * bend, nz = n[k + 2] * (1 - bend) + dz * bend;
        const nl = Math.hypot(nx, ny, nz) || 1;
        nx /= nl; ny /= nl; nz /= nl;
        n[k] = nx; n[k + 1] = ny; n[k + 2] = nz;
        const up = ny * 0.5 + 0.5;
        const occl = smooth(0.35, 1.0, rel);
        const nz2 = fbm(p[k] * 0.9 + 3.1, p[k + 1] * 0.9, p[k + 2] * 0.9 - 1.7, 2);
        let t = clamp(up * 0.55 + occl * 0.45 + nz2 * 0.18 + tints[gi] * 0.06, 0, 1);
        let col = t < 0.5 ? mixc(o.dark, o.mid, t * 2) : mixc(o.mid, o.light, (t - 0.5) * 2);
        col = mulc(col, 0.55 + 0.45 * occl);
        if (o.extra) col = o.extra(col, p[k], p[k + 1], p[k + 2], nx, ny, nz, gi);
        c[k] = col[0]; c[k + 1] = col[1]; c[k + 2] = col[2];
      }
      g.attributes.normal.needsUpdate = true;
      if (o.cards) {
        g.attributes.uv.array.fill(0.5);
        const cc = g.attributes.color.array;
        for (let i = 0; i < cc.length; i++) cc[i] *= 0.62;
        return g;
      }
      return boxUV(g, o.uvScale || 0.7);
    });
    if (o.cards) out.push(cards(out, o.cards, r));
    return merge(out);
  }
  /* billboard leaf cards scattered over the crown surface. Every corner of a card sits at the card center;
     the vertex shader spreads the corners in view space using the 'card' attribute (so the card always faces
     the camera, or the light in the shadow pass). */
  function cards(geos, o, r) {
    // area-weighted random points on the core surface
    const tris = [];
    let total = 0;
    for (const g of geos) {
      const p = g.attributes.position.array;
      for (let t = 0; t + 2 < g.attributes.position.count; t += 3) {
        const k = t * 3;
        const ux = p[k + 3] - p[k], uy = p[k + 4] - p[k + 1], uz = p[k + 5] - p[k + 2];
        const vx = p[k + 6] - p[k], vy = p[k + 7] - p[k + 1], vz = p[k + 8] - p[k + 2];
        const area = 0.5 * Math.hypot(uy * vz - uz * vy, uz * vx - ux * vz, ux * vy - uy * vx);
        total += area;
        tris.push([g, t, total]);
      }
    }
    const sites = [];
    for (let s = 0; s < o.count && tris.length; s++) {
      const x = r() * total;
      let lo = 0, hi = tris.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (tris[mid][2] < x) lo = mid + 1; else hi = mid; }
      const [g, t] = tris[lo];
      let b1 = r(), b2 = r();
      if (b1 + b2 > 1) { b1 = 1 - b1; b2 = 1 - b2; }
      const b0 = 1 - b1 - b2, q = [];
      for (const name of ['position', 'normal', 'color']) {
        const a = g.attributes[name].array, k = t * 3;
        for (let c = 0; c < 3; c++) q.push(a[k + c] * b0 + a[k + 3 + c] * b1 + a[k + 6 + c] * b2);
      }
      const nl = Math.hypot(q[3], q[4], q[5]) || 1;
      q[3] /= nl; q[4] /= nl; q[5] /= nl;
      sites.push(q);
    }
    const cnt = Math.min(o.count, sites.length), V = cnt * 6;
    const P = new Float32Array(V * 3), N = new Float32Array(V * 3), Cc = new Float32Array(V * 3), U = new Float32Array(V * 2), K = new Float32Array(V * 2);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    for (let s = 0; s < cnt; s++) {
      const q = sites[s], size = o.size * (0.75 + r() * 0.5), ang = r() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      const push = (o.push == null ? 0.18 : o.push) * size;
      const br = (0.9 + r() * 0.3 + Math.max(0, q[4]) * 0.15) / 0.62;
      for (let k = 0; k < 6; k++) {
        const v = s * 6 + k, cx = corners[k][0], cy = corners[k][1];
        P[v * 3] = q[0] + q[3] * push; P[v * 3 + 1] = q[1] + q[4] * push; P[v * 3 + 2] = q[2] + q[5] * push;
        N[v * 3] = q[3]; N[v * 3 + 1] = q[4]; N[v * 3 + 2] = q[5];
        Cc[v * 3] = q[6] * br; Cc[v * 3 + 1] = q[7] * br; Cc[v * 3 + 2] = q[8] * br;
        U[v * 2] = cx * 0.5 + 0.5; U[v * 2 + 1] = cy * 0.5 + 0.5;
        K[v * 2] = (cx * ca - cy * sa) * size * 0.5; K[v * 2 + 1] = (cx * sa + cy * ca) * size * 0.5;
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('card', new THREE.BufferAttribute(K, 2));
    return g;
  }
  /* cards from explicit sites: [{ p: Vector3, n: Vector3, c: [r,g,b], s: size }] */
  function cardGeo(list, r) {
    const V = list.length * 6;
    const P = new Float32Array(V * 3), N = new Float32Array(V * 3), Cc = new Float32Array(V * 3), U = new Float32Array(V * 2), K = new Float32Array(V * 2);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    list.forEach((q, s) => {
      const ang = r() * TAU, ca = Math.cos(ang), sa = Math.sin(ang);
      for (let k = 0; k < 6; k++) {
        const v = s * 6 + k, cx = corners[k][0], cy = corners[k][1];
        P[v * 3] = q.p.x; P[v * 3 + 1] = q.p.y; P[v * 3 + 2] = q.p.z;
        N[v * 3] = q.n.x; N[v * 3 + 1] = q.n.y; N[v * 3 + 2] = q.n.z;
        Cc[v * 3] = q.c[0]; Cc[v * 3 + 1] = q.c[1]; Cc[v * 3 + 2] = q.c[2];
        U[v * 2] = cx * 0.5 + 0.5; U[v * 2 + 1] = cy * 0.5 + 0.5;
        K[v * 2] = (cx * ca - cy * sa) * q.s * 0.5; K[v * 2 + 1] = (cx * sa + cy * ca) * q.s * 0.5;
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('card', new THREE.BufferAttribute(K, 2));
    return g;
  }

  /* ---------- small cached canvas textures ---------- */
  const texCache = {};
  function canvasTex(key, w, h, draw, o = {}) {
    if (texCache[key]) return texCache[key];
    const cv = document.createElement('canvas');
    cv.width = w; cv.height = h;
    const c = cv.getContext('2d');
    draw(c, w, h, rng(strSeed(key)));
    const t = new THREE.CanvasTexture(cv);
    t.wrapS = t.wrapT = o.clamp ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
    t.encoding = o.srgb ? THREE.sRGBEncoding : THREE.LinearEncoding;
    t.anisotropy = 4;
    texCache[key] = t;
    return t;
  }
  // draw fn at x,y and at its wrapped copies so the tile repeats seamlessly
  function wrapDraw(w, h, x, y, m, fn) {
    for (const ox of [-w, 0, w]) for (const oy of [-h, 0, h]) {
      const X = x + ox, Y = y + oy;
      if (X > -m && X < w + m && Y > -m && Y < h + m) fn(X, Y);
    }
  }
  const gray = (v, a = 1) => { const g = Math.round(clamp(v, 0, 1) * 255); return `rgba(${g},${g},${g},${a})`; };

  // grayscale detail maps (linear, multiply vertex colors; values stay near 1)
  const TX = {
    // leaf cluster with alpha for billboard cards (center always opaque for the core blobs)
    cluster: () => canvasTex('cluster', 128, 128, (c, w, h, r) => {
      c.clearRect(0, 0, w, h);
      const leaf = (x, y, len, wid, a, v) => {
        c.save(); c.translate(x, y); c.rotate(a);
        c.beginPath(); c.moveTo(0, 0);
        c.quadraticCurveTo(len * 0.45, -wid, len, 0);
        c.quadraticCurveTo(len * 0.45, wid, 0, 0);
        const g = c.createLinearGradient(0, -wid, 0, wid);
        g.addColorStop(0, gray(v * 0.82)); g.addColorStop(0.5, gray(v)); g.addColorStop(1, gray(v * 0.7));
        c.fillStyle = g; c.fill();
        c.strokeStyle = gray(v * 0.6, 0.6); c.lineWidth = 1;
        c.beginPath(); c.moveTo(len * 0.05, 0); c.lineTo(len * 0.9, 0); c.stroke();
        c.restore();
      };
      // scattered small pointed leaves, denser in the middle, random directions
      for (let i = 0; i < 70; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 44;
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        const ang = r() * TAU, len = 16 + r() * 9;
        const depth = 1 - d / 50;
        leaf(x - Math.cos(ang) * len * 0.5, y - Math.sin(ang) * len * 0.5, len, 5 + r() * 2.5, ang, 0.6 + depth * 0.25 + r() * 0.15);
      }
      c.beginPath(); c.arc(w / 2, h / 2, 10, 0, TAU); c.fillStyle = gray(0.62); c.fill();
    }, { clamp: true }),
    // conifer spray card: twigs radiating from the center with short needles, alpha cut
    spray: () => canvasTex('spray', 128, 128, (c, w, h, r) => {
      c.clearRect(0, 0, w, h);
      c.lineCap = 'round';
      const twigs = 11;
      for (let i = 0; i < twigs; i++) {
        const a = (i / twigs) * TAU + r() * 0.5, len = 38 + r() * 20;
        const bend = (r() - 0.5) * 0.5;
        let x = w / 2, y = h / 2;
        const steps = 12;
        for (let k = 0; k < steps; k++) {
          const t = k / steps, aa = a + bend * t;
          const nx = x + Math.cos(aa) * len / steps, ny = y + Math.sin(aa) * len / steps;
          const nl = 11 * (1 - t * 0.5);
          for (const sd of [-1, 1]) {
            const na = aa + sd * (0.9 + r() * 0.3);
            c.strokeStyle = gray(0.62 + r() * 0.38);
            c.lineWidth = 2;
            c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(na) * nl, y + Math.sin(na) * nl); c.stroke();
          }
          c.strokeStyle = gray(0.5); c.lineWidth = 2;
          c.beginPath(); c.moveTo(x, y); c.lineTo(nx, ny); c.stroke();
          x = nx; y = ny;
        }
      }
      c.beginPath(); c.arc(w / 2, h / 2, 9, 0, TAU); c.fillStyle = gray(0.5); c.fill();
    }, { clamp: true }),
    // fluffy blossom card for the pastel sky trees: overlapping soft round puffs, alpha cut
    fluff: () => canvasTex('fluff', 128, 128, (c, w, h, r) => {
      c.clearRect(0, 0, w, h);
      for (let i = 0; i < 46; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 40, rr = 7 + r() * 9 * (1 - d / 60);
        const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d;
        const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.3, rr * 0.1, x, y, rr);
        const v = 0.78 + r() * 0.22;
        g.addColorStop(0, gray(Math.min(1, v + 0.15))); g.addColorStop(0.7, gray(v)); g.addColorStop(1, gray(v * 0.75));
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
      // the crown core samples the card center: keep it opaque
      c.beginPath(); c.arc(w / 2, h / 2, 12, 0, TAU); c.fillStyle = gray(0.85); c.fill();
    }, { clamp: true }),
    bark: () => canvasTex('bark', 64, 128, (c, w, h, r) => {
      c.fillStyle = gray(0.9); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        const x = r() * w, y = r() * h, l = 10 + r() * 40, ww = 1 + r() * 2.5;
        c.fillStyle = gray(0.55 + r() * 0.2, 0.8);
        wrapDraw(w, h, x, y, 50, (X, Y) => { c.beginPath(); c.ellipse(X, Y, ww, l * 0.5, (r() - 0.5) * 0.1, 0, TAU); c.fill(); });
      }
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = r() * h;
        c.fillStyle = gray(1, 0.35);
        wrapDraw(w, h, x, y, 20, (X, Y) => c.fillRect(X, Y, 2 + r() * 3, 4 + r() * 10));
      }
    }),
    palm: () => canvasTex('palmbark', 32, 64, (c, w, h, r) => {
      c.fillStyle = gray(0.92); c.fillRect(0, 0, w, h);
      // one ring band per 32 px: dark groove at the bottom, lighter overlapping scale above
      for (let k = 0; k < 2; k++) {
        const y0 = k * 32;
        const g = c.createLinearGradient(0, y0, 0, y0 + 32);
        g.addColorStop(0, gray(0.6)); g.addColorStop(0.18, gray(0.98)); g.addColorStop(0.75, gray(0.86)); g.addColorStop(1, gray(0.68));
        c.fillStyle = g; c.fillRect(0, y0, w, 32);
      }
      for (let i = 0; i < 50; i++) { c.fillStyle = gray(0.7 + r() * 0.3, 0.5); c.fillRect(r() * w, r() * h, 1, 3 + r() * 6); }
    }),
    rock: () => canvasTex('rock', 128, 128, (c, w, h, r) => {
      c.fillStyle = gray(0.88); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 1600; i++) { c.fillStyle = gray(0.65 + r() * 0.37, 0.55); const s = 1 + r() * 2.5; wrapDraw(w, h, r() * w, r() * h, 4, (X, Y) => c.fillRect(X, Y, s, s)); }
      c.lineWidth = 1;
      for (let i = 0; i < 10; i++) {
        let x = r() * w, y = r() * h; c.strokeStyle = gray(0.55, 0.5); c.beginPath(); c.moveTo(x, y);
        for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 22; y += (r() - 0.5) * 22; c.lineTo(x, y); }
        c.stroke();
      }
    }),
    wood: () => canvasTex('wood', 64, 64, (c, w, h, r) => {
      c.fillStyle = gray(0.9); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 40; i++) {
        const y = r() * h; c.strokeStyle = gray(0.62 + r() * 0.25, 0.6); c.lineWidth = 0.6 + r();
        c.beginPath(); c.moveTo(0, y);
        for (let x = 0; x <= w; x += 8) c.lineTo(x, y + Math.sin(x * 0.1 + i) * 1.2);
        c.stroke();
      }
    }),
    straw: () => canvasTex('straw', 128, 128, (c, w, h, r) => {
      c.fillStyle = gray(0.85); c.fillRect(0, 0, w, h);
      c.lineCap = 'round';
      for (let i = 0; i < 700; i++) {
        const x = r() * w, y = r() * h, l = 8 + r() * 20, a = (r() - 0.5) * 0.5;
        c.strokeStyle = r() < 0.5 ? gray(0.58 + r() * 0.15, 0.7) : gray(1, 0.7); c.lineWidth = 0.8 + r() * 0.8;
        wrapDraw(w, h, x, y, 30, (X, Y) => { c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); c.stroke(); });
      }
    }),
    soil: () => canvasTex('soil', 128, 128, (c, w, h, r) => {
      c.fillStyle = gray(0.85); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 2200; i++) { c.fillStyle = r() < 0.5 ? gray(0.55 + r() * 0.2, 0.7) : gray(0.95 + r() * 0.05, 0.6); const s = 1 + r() * 3; wrapDraw(w, h, r() * w, r() * h, 4, (X, Y) => c.fillRect(X, Y, s, s * 0.8)); }
    }),
    boards: () => canvasTex('boards', 128, 128, (c, w, h, r) => {
      // vertical barn boards, 8 per tile, with battens, knots and grain
      c.fillStyle = gray(0.92); c.fillRect(0, 0, w, h);
      const bw = w / 8;
      for (let b = 0; b < 8; b++) {
        c.fillStyle = gray(0.84 + r() * 0.14); c.fillRect(b * bw, 0, bw, h);
        for (let i = 0; i < 6; i++) { c.fillStyle = gray(0.7 + r() * 0.2, 0.35); c.fillRect(b * bw + r() * bw, 0, 1, h); }
        c.fillStyle = gray(0.45); c.fillRect(b * bw, 0, 1.5, h);
        c.fillStyle = gray(1, 0.5); c.fillRect(b * bw + 1.5, 0, 1, h);
        if (r() < 0.4) { c.fillStyle = gray(0.55, 0.7); c.beginPath(); c.ellipse(b * bw + bw * 0.5, r() * h, 1.6, 2.6, 0, 0, TAU); c.fill(); }
      }
      for (let i = 0; i < 300; i++) { c.fillStyle = gray(0.6 + r() * 0.3, 0.25); c.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 3); }
    }),
    shingle: () => canvasTex('shingle', 128, 128, (c, w, h, r) => {
      c.fillStyle = gray(0.85); c.fillRect(0, 0, w, h);
      const rows = 8, rh = h / rows;
      for (let y = 0; y < rows; y++) {
        let x = (y % 2) * 7 - 8;
        while (x < w) {
          const sw = 10 + r() * 10;
          c.fillStyle = gray(0.74 + r() * 0.24); c.fillRect(x, y * rh, sw - 1.2, rh);
          c.fillStyle = gray(0.5, 0.8); c.fillRect(x + sw - 1.2, y * rh, 1.2, rh);
          x += sw;
        }
        const g = c.createLinearGradient(0, y * rh, 0, (y + 1) * rh);
        g.addColorStop(0, 'rgba(0,0,0,0.0)'); g.addColorStop(0.8, 'rgba(0,0,0,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.42)');
        c.fillStyle = g; c.fillRect(0, y * rh, w, rh);
      }
    }),
    stone: () => canvasTex('stone', 128, 64, (c, w, h, r) => {
      // fieldstone foundation: rounded stones with dark mortar
      c.fillStyle = gray(0.42); c.fillRect(0, 0, w, h);
      for (let row = 0; row < 4; row++) {
        let x = -r() * 20;
        while (x < w + 10) {
          const sw = 16 + r() * 18, sh = 12 + r() * 4, cx = x + sw / 2, cy = row * 16 + 8 + (r() - 0.5) * 3;
          wrapDraw(w, h, cx, cy, 30, (X, Y) => {
            c.beginPath(); c.ellipse(X, Y, sw / 2 - 1.2, sh / 2 - 1, (r() - 0.5) * 0.2, 0, TAU);
            c.fillStyle = gray(0.7 + r() * 0.3); c.fill();
            c.beginPath(); c.ellipse(X - 1.5, Y - 2, sw / 2 - 5, sh / 2 - 4.5, 0, 0, TAU); c.fillStyle = gray(1, 0.18); c.fill();
          });
          x += sw;
        }
      }
    }),
  };

  /* ---------- shared wind (props foliage + grass) ---------- */
  const windU = { time: { value: 0 }, wind: { value: 1 } };
  const GLSL_BASE = `
vec3 envBase() {
  vec4 b = vec4(0.0, 0.0, 0.0, 1.0);
  #ifdef USE_INSTANCING
  b = instanceMatrix * b;
  #endif
  return (modelMatrix * b).xyz;
}`;

  /* ---------- shared season and night state ---------- */
  const autumnU = { value: 0 };   // 0 summer .. 1 full autumn colors
  const nightU = { value: 0 };    // 0 day .. 1 night: warm window, lantern and fire glow

  /* ---------- material factory ----------
     o: { map, color, side, std (MeshStandardMaterial), basic (MeshBasicMaterial), roughness, metalness, emissive,
          sway (meters of crown sway per meter of height), flutter, tinted (instanceColor only where tint = 1),
          cards (camera facing leaf cards), hang (hanging strands: 'hang' attribute 0 at the top .. 1 at the tip),
          fall: { a, b, c, k, br } (autumn palette: three linear colors, strength, brightness),
          glow: 'night' | 'day' | 'fire' | 'flicker' (emissive scaled by the 'glow' attribute and the night state),
          transparent, blending, depthWrite, alphaTest }
     Materials whose shader code is the same share one GL program (the cache key is the code signature);
     per-material values such as the autumn palette live in their own uniforms. */
  const matCache = {};
  const sigOf = (o, two) => ['s', o.std ? 1 : 0, o.basic ? 1 : 0, o.sway || 0, o.flutter || 0, o.tinted ? 1 : 0, o.cards ? 1 : 0, o.hang ? 1 : 0, o.fall ? 1 : 0, o.glow || '', two ? 1 : 0].join('|');
  function mat(key, o = {}) {
    if (matCache[key]) return matCache[key];
    const p = { vertexColors: true, fog: o.fog !== false };
    if (o.map) p.map = o.map;
    if (o.side) p.side = o.side;
    if (o.color) p.color = lcol(o.color);
    let m;
    if (o.basic) m = new THREE.MeshBasicMaterial(p);
    else {
      if (o.emissive) p.emissive = lcol(o.emissive);
      if (o.std) m = new THREE.MeshStandardMaterial(Object.assign(p, { roughness: o.roughness == null ? 0.8 : o.roughness, metalness: o.metalness || 0 }));
      else m = new THREE.MeshLambertMaterial(p);
    }
    if (o.alphaTest) m.alphaTest = o.alphaTest;
    if (o.transparent) m.transparent = true;
    if (o.blending) m.blending = o.blending;
    if (o.depthWrite === false) m.depthWrite = false;
    const vtx = o.sway || o.tinted || o.cards || o.hang || o.fall || o.glow, two = o.side === THREE.DoubleSide && !o.basic;
    if (vtx || two) {
      const sig = sigOf(o, two);
      m.onBeforeCompile = (sh) => { if (vtx) patchVertex(sh, o); if (o.glow) patchGlow(sh, o); if (two) noFlip(sh); };
      m.customProgramCacheKey = () => 'envmat-' + sig;
    }
    matCache[key] = m;
    return m;
  }
  /* depth material for shadows of alpha cut foliage (mesh.customDepthMaterial) */
  function depthMat(key, o) {
    const k = 'depth:' + key;
    if (matCache[k]) return matCache[k];
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.map, alphaTest: o.alphaTest || 0.5 });
    const od = Object.assign({}, o, { fall: null, tinted: false, glow: null });
    const sig = sigOf(od, false);
    m.onBeforeCompile = (sh) => patchVertex(sh, od);
    m.customProgramCacheKey = () => 'envdepth-' + sig;
    matCache[k] = m;
    return m;
  }
  /* double sided foliage: keep the (upward bent) normal on back faces instead of flipping it,
     so thin leaves and blades never turn black when seen from behind */
  function noFlip(sh) {
    sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', `#include <normal_fragment_begin>
  #if defined( DOUBLE_SIDED ) && ! defined( FLAT_SHADED )
    normal = normalize( vNormal );
    geometryNormal = normal;
  #endif`);
  }
  const GLSL_HASH = `
float envHash(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }`;
  function patchVertex(sh, o) {
    const sway = o.sway || 0, flutter = o.flutter || 0;
    sh.uniforms.envTime = windU.time;
    sh.uniforms.envWind = windU.wind;
    let pre = 'uniform float envTime;\nuniform float envWind;\n' + GLSL_BASE + GLSL_HASH + '\n';
    if (o.tinted) pre += 'attribute float tint;\n';
    if (o.cards) pre += 'attribute vec2 card;\n';
    if (o.hang) pre += 'attribute float hang;\n';
    if (o.fall) {
      sh.uniforms.envAutumn = autumnU;
      sh.uniforms.envFallA = { value: lcolArr(o.fall.a) };
      sh.uniforms.envFallB = { value: lcolArr(o.fall.b) };
      sh.uniforms.envFallC = { value: lcolArr(o.fall.c) };
      sh.uniforms.envFallK = { value: new THREE.Vector2(o.fall.k == null ? 1 : o.fall.k, o.fall.br == null ? 1 : o.fall.br) };
      pre += 'uniform float envAutumn;\nuniform vec3 envFallA, envFallB, envFallC;\nuniform vec2 envFallK;\n';
    }
    if (o.glow) {
      sh.uniforms.envNight = nightU;
      pre += 'uniform float envNight;\nattribute float glow;\nvarying float vEnvGlow;\n';
    }
    sh.vertexShader = sh.vertexShader.replace('void main() {', pre + 'void main() {');
    if (o.tinted) {
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `
  vColor = vec3(1.0);
  #ifdef USE_COLOR
  vColor *= color;
  #endif
  #ifdef USE_INSTANCING_COLOR
  vColor *= mix(vec3(1.0), instanceColor, tint);
  #endif`);
    }
    if (o.fall) {
      // autumn: each tree (hashed by its world position) turns at its own pace and picks its own hue;
      // leaf cards turn one by one (patches of green and color, never a muddy average); green shading is kept as brightness
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  {
    vec3 fb = envBase();
    float h1 = envHash(floor(fb.xz * 0.73) + 0.5);
    float h2 = envHash(floor(fb.xz * 0.73) + 17.3);
    float pv = fract(sin(dot(position.xyz, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
    float pv2 = sin(position.x * 1.3 + position.y * 0.9) * sin(position.z * 1.1 - position.y * 0.7) * 0.5 + 0.5;
    float stage = envAutumn * 1.3 - h2 * 0.3;
    float amt = smoothstep(pv * 0.8 - 0.05, pv * 0.8 + 0.15, stage) * envFallK.x;
    float sel = clamp(h1 + (pv2 - 0.5) * 0.35, 0.0, 1.0);
    vec3 fall = sel < 0.5 ? mix(envFallA, envFallB, sel * 2.0) : mix(envFallB, envFallC, sel * 2.0 - 1.0);
    float lum = dot(vColor.rgb, vec3(0.2126, 0.7152, 0.0722));
    vColor.rgb = mix(vColor.rgb, fall * clamp(lum * 4.2 * envFallK.y, 0.04, 1.5), amt);
  }`);
    }
    if (sway || o.hang || o.glow === 'fire') {
      sh.vertexShader = sh.vertexShader.replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position);
  {
    vec3 wb = envBase();
    float h = max(position.y, 0.0);
    float ph = dot(wb.xz, vec2(0.071, 0.053));
    float g = 0.6 + 0.4 * sin(envTime * 0.35 + wb.x * 0.04 + wb.z * 0.03);
    float s = (sin(envTime * 0.9 + ph) * 0.7 + sin(envTime * 1.7 + ph * 1.7) * 0.3) * g;
    vec2 sw = vec2(s, s * 0.6) * h * h * ${(sway * 0.1).toFixed(5)} * envWind;
    float fl = sin(envTime * 5.0 + position.x * 3.1 + position.z * 2.7 + ph * 9.0) * ${flutter.toFixed(4)} * envWind * min(h, 1.0);
    transformed.xz += sw + vec2(fl, -fl * 0.7);
    transformed.y += fl * 0.6;
    ${o.hang ? `// hanging strands swing from where they hang
    float hg = hang * hang;
    transformed.xz += vec2(sin(envTime * 1.25 + ph * 5.0 + position.x * 0.6), cos(envTime * 1.05 + ph * 4.0 + position.z * 0.6)) * vec2(0.42, 0.3) * hg * envWind * (0.55 + 0.45 * g);` : ''}
    ${o.glow === 'fire' ? `// flames lick upward and sway
    float fy = max(position.y - ${(o.fireBase || 0).toFixed(3)}, 0.0);
    transformed.x += sin(envTime * 9.0 + position.y * 18.0 + position.z * 7.0) * 0.035 * fy * 3.0;
    transformed.z += cos(envTime * 8.0 + position.y * 15.0 + position.x * 9.0) * 0.03 * fy * 3.0;
    transformed.y = ${(o.fireBase || 0).toFixed(3)} + fy * (0.85 + 0.25 * sin(envTime * 12.0 + position.x * 20.0));` : ''}
  }`);
    }
    if (o.cards) {
      // spread the card corners in view space so each leaf card faces the camera (or the sun in the shadow pass)
      sh.vertexShader = sh.vertexShader.replace('#include <project_vertex>', `
  vec4 mvPosition = vec4(transformed, 1.0);
  float cardScale = length(modelMatrix[0].xyz);
  #ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
  cardScale *= length(instanceMatrix[0].xyz);
  #endif
  mvPosition = modelViewMatrix * mvPosition;
  mvPosition.xy += card * cardScale;
  gl_Position = projectionMatrix * mvPosition;`);
    }
    if (o.glow) {
      const flick = `(0.8 + 0.2 * sin(envTime * 11.0 + gph * 13.0) * sin(envTime * 6.7 + gph * 7.0 + 1.3) + 0.06 * sin(envTime * 23.0 + gph))`;
      const k = o.glow === 'day' ? 'mix(1.0, 0.07, envNight)'
        : o.glow === 'fire' ? `mix(0.8, 1.15, envNight) * ${flick}`
        : o.glow === 'flicker' ? `envNight * ${flick}` : 'envNight';
      sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  {
    vec3 gb = envBase();
    float gph = gb.x * 1.7 + gb.z * 2.3;
    vEnvGlow = glow * ${k};
  }`);
    }
  }
  function patchGlow(sh, o) {
    sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vEnvGlow;\nvoid main() {');
    if (o.basic) sh.fragmentShader = sh.fragmentShader.replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * vEnvGlow, opacity );');
    else sh.fragmentShader = sh.fragmentShader.replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vEnvGlow;');
  }
  function lcolArr(hex) { return lcol(hex); }

  /* ---------- more detail textures (houses, interiors, yard) ---------- */
  // woven fabric: fine crosshatch, near white so vertex colors carry the hue
  TX.fabric = () => canvasTex('fabric', 64, 64, (c, w, h, r) => {
    c.fillStyle = gray(0.9); c.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 2) { c.fillStyle = gray(0.78 + r() * 0.1, 0.5); c.fillRect(i, 0, 1, h); }
    for (let j = 0; j < h; j += 2) { c.fillStyle = gray(0.8 + r() * 0.1, 0.4); c.fillRect(0, j, w, 1); }
    for (let i = 0; i < 120; i++) { c.fillStyle = gray(1, 0.25); c.fillRect(r() * w, r() * h, 1, 1); }
  });
  // lap siding (clapboard): 8 boards per tile with a shadow line under each lap
  TX.clapboard = () => canvasTex('clapboard', 64, 128, (c, w, h, r) => {
    const bh = h / 8;
    for (let b = 0; b < 8; b++) {
      const y = b * bh;
      const g = c.createLinearGradient(0, y, 0, y + bh);
      g.addColorStop(0, gray(0.66)); g.addColorStop(0.12, gray(0.9)); g.addColorStop(0.85, gray(0.97)); g.addColorStop(1, gray(0.92));
      c.fillStyle = g; c.fillRect(0, y, w, bh);
      for (let i = 0; i < 4; i++) { c.fillStyle = gray(0.85 + r() * 0.1, 0.4); c.fillRect(0, y + 3 + r() * (bh - 5), w, 1); }
    }
  });
  // red brick with light mortar (colored)
  TX.brick = () => canvasTex('brick', 128, 128, (c, w, h, r) => {
    c.fillStyle = '#c9c2b4'; c.fillRect(0, 0, w, h);
    const rows = 16, bh = h / rows, bw = w / 4;
    for (let y = 0; y < rows; y++) {
      const off = (y % 2) * bw / 2;
      for (let x = -1; x < 5; x++) {
        const v = r();
        const R = Math.round(150 + v * 45), G = Math.round(58 + v * 22), B = Math.round(40 + v * 14);
        c.fillStyle = `rgb(${R},${G},${B})`;
        c.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 2);
        c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x * bw + off + 1, y * bh + bh - 2.5, bw - 2, 1.5);
      }
    }
    for (let i = 0; i < 500; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,230,210'},${r() * 0.12})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }
  }, { srgb: true });
  // wood floor planks running along u, staggered joints
  TX.planks = () => canvasTex('planks', 128, 128, (c, w, h, r) => {
    const rows = 8, ph = h / rows;
    for (let y = 0; y < rows; y++) {
      let x = -r() * 60;
      while (x < w) {
        const len = 50 + r() * 50, v = 0.78 + r() * 0.2;
        c.fillStyle = gray(v); c.fillRect(x, y * ph, len, ph);
        for (let k = 0; k < 4; k++) { c.fillStyle = gray(v * (0.8 + r() * 0.15), 0.5); c.fillRect(x, y * ph + 2 + r() * (ph - 4), len, 1); }
        c.fillStyle = gray(0.45); c.fillRect(x, y * ph, 1.2, ph);
        x += len;
      }
      c.fillStyle = gray(0.42); c.fillRect(0, y * ph, w, 1.2);
    }
  });
  // checker tile (kitchen style)
  TX.tile = () => canvasTex('tile', 64, 64, (c, w, h, r) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      c.fillStyle = (x + y) % 2 ? gray(0.95 - r() * 0.04) : gray(0.55 - r() * 0.04);
      c.fillRect(x * s, y * s, s, s);
      c.fillStyle = gray(0.7, 0.8); c.fillRect(x * s, y * s, s, 1); c.fillRect(x * s, y * s, 1, s);
    }
  });
  // painted plaster: very soft mottling
  TX.plaster = () => canvasTex('plaster', 64, 64, (c, w, h, r) => {
    c.fillStyle = gray(0.94); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 260; i++) { c.fillStyle = gray(0.86 + r() * 0.14, 0.25); const s = 2 + r() * 6; wrapDraw(w, h, r() * w, r() * h, 8, (X, Y) => c.fillRect(X, Y, s, s)); }
  });
  // wallpaper: soft vertical stripes with a small sprig motif
  TX.wallpaper = () => canvasTex('wallpaper', 64, 64, (c, w, h, r) => {
    c.fillStyle = gray(0.95); c.fillRect(0, 0, w, h);
    for (let x = 0; x < w; x += 16) { c.fillStyle = gray(0.86); c.fillRect(x, 0, 6, h); }
    c.fillStyle = gray(0.74);
    for (let y = 8; y < h; y += 32) for (let x = 11; x < w; x += 32) {
      const yy = y + ((x / 32) % 2) * 16;
      c.beginPath(); c.ellipse(x, yy, 2.2, 3.5, 0.5, 0, TAU); c.fill();
      c.beginPath(); c.ellipse(x + 2.5, yy + 2, 2, 3, -0.6, 0, TAU); c.fill();
    }
  });
  // wire mesh (alpha cut): square grid of thin wires
  TX.wire = () => canvasTex('wire', 64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = gray(0.85);
    for (let i = 0; i < w; i += 8) { c.fillRect(i, 0, 2, h); c.fillRect(0, i, w, 2); }
  });
  // flame sprite (colored, used additively)
  TX.flame = () => canvasTex('flame', 64, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    const tongue = (x, bw, top, col) => {
      c.beginPath();
      c.moveTo(x - bw, h);
      c.bezierCurveTo(x - bw, h * 0.6, x - bw * 0.2, h * 0.5, x, top);
      c.bezierCurveTo(x + bw * 0.3, h * 0.5, x + bw, h * 0.6, x + bw, h);
      c.closePath(); c.fillStyle = col; c.fill();
    };
    tongue(w * 0.5, w * 0.42, h * 0.05, 'rgba(200,60,10,0.85)');
    tongue(w * 0.32, w * 0.2, h * 0.3, 'rgba(230,110,20,0.9)');
    tongue(w * 0.66, w * 0.2, h * 0.25, 'rgba(230,110,20,0.9)');
    tongue(w * 0.5, w * 0.28, h * 0.28, 'rgba(255,170,40,1)');
    tongue(w * 0.5, w * 0.15, h * 0.55, 'rgba(255,235,150,1)');
  }, { srgb: true, clamp: true });
  // four small paintings in one atlas (2 x 2): meadow, sailboat, flowers, a cat
  TX.pictures = () => canvasTex('pictures', 256, 256, (c, w, h) => {
    const q = w / 2;
    // meadow with a red barn
    let g = c.createLinearGradient(0, 0, 0, q); g.addColorStop(0, '#9cc8ec'); g.addColorStop(0.6, '#e8f0f4'); g.addColorStop(0.61, '#8cc060'); g.addColorStop(1, '#5a9a3a');
    c.fillStyle = g; c.fillRect(0, 0, q, q);
    c.fillStyle = '#b8322a'; c.fillRect(70, 52, 30, 22); c.beginPath(); c.moveTo(66, 54); c.lineTo(85, 40); c.lineTo(104, 54); c.fill();
    c.fillStyle = '#3a6a2a'; c.beginPath(); c.arc(30, 58, 14, 0, TAU); c.fill(); c.fillStyle = '#5a3a20'; c.fillRect(28, 66, 4, 14);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(40, 20, 8, 0, TAU); c.arc(50, 18, 10, 0, TAU); c.arc(60, 22, 7, 0, TAU); c.fill();
    // sailboat at sea
    g = c.createLinearGradient(0, 0, 0, q); g.addColorStop(0, '#f4c890'); g.addColorStop(0.55, '#f8e8c8'); g.addColorStop(0.56, '#3a7ab0'); g.addColorStop(1, '#1e4a7a');
    c.fillStyle = g; c.fillRect(q, 0, q, q);
    c.fillStyle = '#f6f2e8'; c.beginPath(); c.moveTo(q + 64, 22); c.lineTo(q + 64, 66); c.lineTo(q + 34, 66); c.fill();
    c.fillStyle = '#e04a3a'; c.beginPath(); c.moveTo(q + 68, 30); c.lineTo(q + 68, 66); c.lineTo(q + 90, 66); c.fill();
    c.fillStyle = '#5a3a20'; c.fillRect(q + 30, 68, 64, 7);
    c.fillStyle = '#ffd070'; c.beginPath(); c.arc(q + 100, 40, 10, 0, TAU); c.fill();
    // vase of flowers
    c.fillStyle = '#f0e6d0'; c.fillRect(0, q, q, q);
    c.fillStyle = '#4a7aa0'; c.beginPath(); c.moveTo(48, q + 120); c.lineTo(80, q + 120); c.lineTo(86, q + 84); c.lineTo(42, q + 84); c.fill();
    c.strokeStyle = '#3a7a2a'; c.lineWidth = 2;
    const fl = [[40, 40, '#e05a7a'], [64, 30, '#f0c030'], [88, 42, '#e86a2a'], [52, 52, '#a05ac8'], [76, 50, '#f4f0f0']];
    for (const [x, y, col] of fl) { c.beginPath(); c.moveTo(64, q + 86); c.lineTo(x, q + y); c.stroke(); c.fillStyle = col; c.beginPath(); c.arc(x, q + y, 9, 0, TAU); c.fill(); c.fillStyle = '#ffe080'; c.beginPath(); c.arc(x, q + y, 3, 0, TAU); c.fill(); }
    // a sleepy orange cat
    c.fillStyle = '#cfe0d8'; c.fillRect(q, q, q, q);
    c.fillStyle = '#7a5a8a'; c.fillRect(q, q + 90, q, 38);
    c.fillStyle = '#e8902a';
    c.beginPath(); c.ellipse(q + 64, q + 86, 34, 18, 0, 0, TAU); c.fill();
    c.beginPath(); c.arc(q + 36, q + 72, 15, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(q + 24, q + 64); c.lineTo(q + 26, q + 50); c.lineTo(q + 34, q + 60); c.fill();
    c.beginPath(); c.moveTo(q + 40, q + 58); c.lineTo(q + 47, q + 48); c.lineTo(q + 50, q + 62); c.fill();
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 1.5;
    c.beginPath(); c.arc(q + 31, q + 72, 3, 0.2, Math.PI - 0.2); c.stroke(); c.beginPath(); c.arc(q + 42, q + 72, 3, 0.2, Math.PI - 0.2); c.stroke();
    c.strokeStyle = '#e8902a'; c.lineWidth = 7; c.lineCap = 'round';
    c.beginPath(); c.moveTo(q + 96, q + 90); c.quadraticCurveTo(q + 112, q + 100, q + 100, q + 110); c.stroke();
  }, { srgb: true, clamp: true });

  /* ============================================================
     Props
     ============================================================ */
  const C = {
    bark: L(0x6b5440), barkDark: L(0x3e3024), barkLight: L(0x8a735b),
    oakDark: L(0x1f3d17), oakMid: L(0x3e6b26), oakLight: L(0x7da53e),
    appleDark: L(0x24461a), appleMid: L(0x467a2c), appleLight: L(0x8ab54a),
    pineDark: L(0x0f2a20), pineMid: L(0x22483a), pineLight: L(0x3f6a50),
    palmDark: L(0x24481a), palmMid: L(0x3a6e24), palmLight: L(0x6e9a3a),
    snag: L(0x8d8a82), snagDark: L(0x55524c),
  };
  function barkColor(base, dark, light, seed) {
    return (t, a, p) => {
      const n = fbm(p.x * 2.1 + seed, p.y * 0.9, p.z * 2.1 - seed, 2);
      const moss = smooth(0.2, 0.6, n) * (1 - smooth(0.0, 0.5, t)) * 0.35;
      let c = mixc(dark, base, smooth(-0.6, 0.4, n) * 0.8 + 0.2);
      c = mixc(c, light, smooth(0.3, 0.8, Math.cos(a - 0.6)) * 0.25);
      return mixc(c, L(0x5a6a2a), moss);
    };
  }
  /* trunk: path from ground with flared base */
  function trunkPts(r, h, lean, bend, n = 7) {
    const ax = r() * TAU, pts = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const off = Math.sin(t * Math.PI * (0.8 + bend)) * lean;
      pts.push(new V3(Math.cos(ax) * off + (r() - 0.5) * 0.04 * t, t * h, Math.sin(ax) * off + (r() - 0.5) * 0.04 * t));
    }
    return pts;
  }
  function flareRad(r0, r1, flare) {
    return (i, t, a) => {
      const base = lerp(r0, r1, Math.pow(t, 0.8));
      const f = flare * Math.pow(1 - smooth(0, 0.18, t), 2) * (0.75 + 0.25 * Math.cos(a * 5));
      return base * (1 + f);
    };
  }
  function branch(from, dir, len, r0, r1, r, seg = 4, radial = 5, droop = 0) {
    const pts = [from.clone()];
    const d = dir.clone().normalize();
    for (let i = 1; i <= seg; i++) {
      const t = i / seg;
      d.x += (r() - 0.5) * 0.35; d.z += (r() - 0.5) * 0.35; d.y += (r() - 0.5) * 0.25 - droop * t;
      d.normalize();
      pts.push(pts[i - 1].clone().addScaledVector(d, len / seg));
    }
    return { pts, geo: tube(pts, (i, t) => lerp(r0, r1, t), { radial, cap: 'end', vLen: 1.2, uRep: 1, color: barkColor(C.bark, C.barkDark, C.barkLight, from.x) }) };
  }

  /* autumn palettes (gold / orange / red mixes), strength and brightness per species */
  const FALL = {
    oak: { a: 0x9a4214, b: 0xc0701c, c: 0xc8a032, k: 0.95, br: 1.15 },
    apple: { a: 0xa86a1e, b: 0xc49a30, c: 0x8a7a2a, k: 0.8, br: 1.0 },
    maple: { a: 0xb81a12, b: 0xe2581a, c: 0xeeaa22, k: 1.0, br: 1.2 },
    birch: { a: 0xd8a818, b: 0xecc63a, c: 0xc89028, k: 1.0, br: 1.15 },
    willow: { a: 0xb8b040, b: 0xd2b83a, c: 0x9aa838, k: 0.6, br: 1.0 },
    bush: { a: 0x8a1a1c, b: 0xb04a1a, c: 0x9a6a22, k: 0.5, br: 1.0 },
  };
  /* foliage part with leaf cards: o { map, sway, flutter, fall, hang } */
  function leafPart(geo, key = 'leafCards', map = TX.cluster(), sway = 0.012, flutter = 0.02, extra = {}) {
    const o = Object.assign({ map, sway, flutter, cards: true, alphaTest: 0.5, side: extra.hang ? THREE.DoubleSide : undefined }, extra);
    return { geometry: geo, material: mat(key, o), castShadow: true, depthMaterial: depthMat(key, o) };
  }
  /* where a small animal can perch: height, trunk radius there and the trunk axis offset at that height */
  function climbInfo(pts, y, radAt) {
    let i = 1;
    while (i < pts.length - 1 && pts[i].y < y) i++;
    const a = pts[i - 1], b = pts[i], t = clamp((y - a.y) / ((b.y - a.y) || 1), 0, 1);
    return { climbH: y, trunkR: radAt, climbX: lerp(a.x, b.x, t), climbZ: lerp(a.z, b.z, t) };
  }
  function makeOak(v) {
    const r = rng(1000 + v * 77), h = 7.0 + v * 0.45;
    const trunkH = 2.7 + r() * 0.4;
    const tp = trunkPts(r, trunkH + 0.6, 0.18, 0.3);
    const wood = [tube(tp, flareRad(0.4, 0.26, 0.55), { radial: 8, vLen: 1.4, uRep: 2, color: barkColor(C.bark, C.barkDark, C.barkLight, 0) })];
    const top = tp[tp.length - 1];
    const clumps = [];
    const crownC = new V3(top.x, trunkH + (h - trunkH) * 0.52, top.z);
    const cr = { x: 3.3 + r() * 0.4, y: (h - trunkH) * 0.5, z: 3.3 + r() * 0.4 };
    // main limbs fanning out, each ending in a foliage mass
    const nb = 4 + (v % 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.6;
      const from = tp[Math.min(tp.length - 1, 4 + (i % 3))].clone();
      const dir = new V3(Math.cos(a), 0.9 + r() * 0.5, Math.sin(a));
      const b = branch(from, dir, 2.2 + r() * 0.8, 0.17, 0.07, r, 3, 5);
      wood.push(b.geo);
      const e = b.pts[b.pts.length - 1];
      clumps.push({ x: e.x, y: e.y + 0.5, z: e.z, r: 1.55 + r() * 0.45, sx: 1.15, sy: 0.85, sz: 1.15, amp: 0.3, fq: 1.3, off: r() * 50, detail: 1 });
    }
    // a couple of visible lower side branches
    for (let i = 0; i < 2; i++) {
      const a = r() * TAU, from = tp[3].clone();
      const b = branch(from, new V3(Math.cos(a), 0.45, Math.sin(a)), 1.6, 0.1, 0.04, r, 3, 5);
      wood.push(b.geo);
      const e = b.pts[b.pts.length - 1];
      clumps.push({ x: e.x, y: e.y + 0.25, z: e.z, r: 0.95, sx: 1.2, sy: 0.75, sz: 1.2, amp: 0.3, fq: 1.6, off: r() * 50, detail: 1 });
    }
    // crown fill and top
    clumps.push({ x: crownC.x, y: crownC.y + 0.3, z: crownC.z, r: 2.3, sx: 1.25, sy: 0.9, sz: 1.25, amp: 0.25, fq: 1.1, off: r() * 50, detail: 1 });
    clumps.push({ x: crownC.x + (r() - 0.5), y: h - 1.4, z: crownC.z + (r() - 0.5), r: 1.6, sx: 1.1, sy: 0.85, sz: 1.1, amp: 0.3, fq: 1.4, off: r() * 50, detail: 1 });
    for (let i = 0; i < 3; i++) {
      const a = r() * TAU, d = 1.6 + r();
      clumps.push({ x: crownC.x + Math.cos(a) * d, y: crownC.y + 0.9 + r() * 1.2, z: crownC.z + Math.sin(a) * d, r: 1.2 + r() * 0.4, sx: 1.1, sy: 0.85, sz: 1.1, amp: 0.32, fq: 1.5, off: r() * 50, detail: 1 });
    }
    const leaves = crown(clumps, { center: crownC, radii: cr, dark: C.oakDark, mid: C.oakMid, light: C.oakLight, seed: v + 3, cards: { count: 285, size: 1.22 } });
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafOak', TX.cluster(), 0.012, 0.02, { fall: FALL.oak }),
      ],
      radius: 0.45,
      ...climbInfo(tp, tp[5].y, lerp(0.4, 0.26, Math.pow(5 / 7, 0.8))),
    };
  }

  function makeApple(v) {
    const r = rng(2000 + v * 31), h = 3.8 + v * 0.3;
    const trunkH = 1.5 + r() * 0.2;
    const tp = trunkPts(r, trunkH + 0.4, 0.12, 0.6, 5);
    const wood = [tube(tp, flareRad(0.2, 0.14, 0.45), { radial: 8, vLen: 1, uRep: 2, color: barkColor(L(0x5f4a3a), L(0x3a2c22), L(0x7d6a58), 5) })];
    const top = tp[tp.length - 1];
    const clumps = [];
    const crownC = new V3(top.x, trunkH + (h - trunkH) * 0.5, top.z);
    const cr = { x: 2.2, y: (h - trunkH) * 0.5, z: 2.2 };
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + r() * 0.8;
      const b = branch(top.clone(), new V3(Math.cos(a), 1.0 + r() * 0.4, Math.sin(a)), 1.3 + r() * 0.3, 0.09, 0.04, r, 3, 5);
      wood.push(b.geo);
      const e = b.pts[b.pts.length - 1];
      clumps.push({ x: e.x, y: e.y + 0.3, z: e.z, r: 1.05 + r() * 0.25, sx: 1.1, sy: 0.9, sz: 1.1, amp: 0.26, fq: 1.7, off: r() * 50, detail: 1 });
    }
    clumps.push({ x: crownC.x, y: crownC.y + 0.2, z: crownC.z, r: 1.7, sx: 1.25, sy: 1.0, sz: 1.25, amp: 0.2, fq: 1.3, off: r() * 50, detail: 1 });
    clumps.push({ x: crownC.x, y: h - 0.95, z: crownC.z, r: 1.15, sx: 1.15, sy: 0.85, sz: 1.15, amp: 0.25, fq: 1.6, off: r() * 50, detail: 1 });
    const leaves = crown(clumps, { center: crownC, radii: cr, dark: C.appleDark, mid: C.appleMid, light: C.appleLight, seed: v + 9, cards: { count: 260, size: 0.8 } });
    // apples hanging on the outside of the canopy
    const apples = [], P = leaves.attributes.position.array, N = leaves.attributes.normal.array, KC = leaves.attributes.card.array, cnt = leaves.attributes.position.count;
    const used = [];
    let tries = 0;
    while (apples.length < 16 && tries++ < 600) {
      const i = Math.floor(r() * cnt), k = i * 3;
      if (KC[i * 2] === 0 && KC[i * 2 + 1] === 0) continue; // only card centers (they sit on the crown surface)
      if (N[k + 1] > 0.55 || P[k + 1] < trunkH + 0.4) continue;
      const pos = new V3(P[k] + N[k] * 0.02, P[k + 1] - 0.03, P[k + 2] + N[k + 2] * 0.02);
      if (used.some((u) => u.distanceTo(pos) < 0.55)) continue;
      used.push(pos);
      const s = 0.065 + r() * 0.015, red = r();
      const col = red < 0.2 ? L(0xc8a02a) : mixc(L(0x9a0e10), L(0xc8281c), red);
      const g = paint(new THREE.IcosahedronGeometry(s, 0), (x, y) => mulc(col, 1.0 + y / s * 0.15));
      g.scale(1, 0.9, 1);
      smoothNormals(g);
      apples.push(place(g, pos.x, pos.y, pos.z));
    }
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafApple', TX.cluster(), 0.012, 0.02, { fall: FALL.apple }),
        { geometry: merge(apples), material: mat('appleFruit', { sway: 0.012, flutter: 0.01 }), castShadow: false },
      ],
      radius: 0.22,
      ...climbInfo(tp, top.y - 0.05, 0.14),
    };
  }

  /* conifer: drooping tiers (dark solid core) fringed with needle spray cards */
  function makePine(v) {
    const r = rng(3000 + v * 53), h = 9.5 + v * 2.2;
    const tp = trunkPts(r, h * 0.92, 0.05, 0.2, 6);
    const wood = [tube(tp, flareRad(0.3, 0.05, 0.6), { radial: 7, vLen: 1.3, uRep: 2, color: barkColor(L(0x6a4a34), L(0x3a281c), L(0x8c6a4e), 9) })];
    const S = soup();
    const tiers = 7 + v;
    const base = h * 0.2; // bare trunk below
    const rims = [];
    for (let k = 0; k < tiers; k++) {
      const u = k / (tiers - 1);
      const yb = lerp(base, h * 0.84, Math.pow(u, 0.92));
      const R = lerp(h * 0.25, h * 0.055, Math.pow(u, 0.9)) * (0.9 + r() * 0.2);
      const tierH = lerp(h * 0.2, h * 0.12, u);
      const top = new V3(0, yb + tierH, 0), n = 9, rot = r() * TAU;
      const inner = [], tip = [], under = [];
      for (let j = 0; j <= n; j++) {
        const jj = j % n, a = rot + (jj / n) * TAU;
        const rr = R * (0.85 + 0.3 * fbm(Math.cos(a) * 2 + k * 3.1, Math.sin(a) * 2, v * 7, 1) + 0.12);
        const droop = R * 0.28;
        inner.push(new V3(Math.cos(a) * rr * 0.5, yb + tierH * 0.42, Math.sin(a) * rr * 0.5));
        tip.push(new V3(Math.cos(a) * rr, yb - droop, Math.sin(a) * rr));
        under.push(new V3(Math.cos(a) * rr * 0.2, yb + tierH * 0.15, Math.sin(a) * rr * 0.2));
      }
      for (let j = 0; j < n; j++) {
        S.tri(top, inner[j + 1], inner[j], C.pineMid, C.pineDark, C.pineDark);
        S.quad(inner[j], inner[j + 1], tip[j + 1], tip[j], C.pineDark, C.pineDark, C.pineMid, C.pineMid);
        S.quad(tip[j], tip[j + 1], under[j + 1], under[j], mulc(C.pineDark, 0.7), mulc(C.pineDark, 0.7), mulc(C.pineDark, 0.4), mulc(C.pineDark, 0.4));
        rims.push([inner[j], inner[j + 1], tip[j + 1], tip[j], top, u]);
      }
    }
    const core = S.geo(false);
    // soften: bend normals up/out so the tiers read as soft masses, darken the core (cards carry the detail)
    const P = core.attributes.position.array, Nn = core.attributes.normal.array, Cc = core.attributes.color.array;
    for (let i = 0; i < core.attributes.position.count; i++) {
      const k = i * 3, x = P[k], y = P[k + 1], z = P[k + 2], d = Math.hypot(x, z) || 1;
      let nx = Nn[k] * 0.5 + (x / d) * 0.5, ny = Nn[k + 1] * 0.5 + 0.35, nz = Nn[k + 2] * 0.5 + (z / d) * 0.5;
      const l = Math.hypot(nx, ny, nz); Nn[k] = nx / l; Nn[k + 1] = ny / l; Nn[k + 2] = nz / l;
      const ao = 0.75 + 0.25 * smooth(0, h * 0.7, y);
      Cc[k] *= ao; Cc[k + 1] *= ao; Cc[k + 2] *= ao;
    }
    core.attributes.uv.array.fill(0.5);
    // needle cards along the tier slopes, denser toward the drooping rims
    const K = [];
    const nCards = 230 + v * 45;
    for (let i = 0; i < nCards; i++) {
      const q = rims[Math.floor(r() * rims.length)];
      const s1 = r(), t1 = 0.5 + 0.55 * Math.sqrt(r());
      const a = new V3().lerpVectors(q[0], q[1], s1), b = new V3().lerpVectors(q[3], q[2], s1);
      const p = new V3().lerpVectors(a, b, t1);
      const out = new V3(p.x, 0, p.z).normalize();
      const nrm = new V3(out.x * 0.6, 0.8, out.z * 0.6).normalize();
      const col = mixc(C.pineDark, C.pineMid, clamp(0.3 + r() * 0.7 + q[5] * 0.2, 0, 1));
      p.y -= 0.12 * (h / 11);
      K.push({ p: p.addScaledVector(nrm, 0.05), n: nrm, c: col, s: lerp(1.45, 0.85, q[5]) * (0.8 + r() * 0.4) * (h / 11) });
    }
    const needles = merge([core, cardGeo(K, r)]);
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(needles, 'needleCards', TX.spray(), 0.006, 0.0),
      ],
      radius: 0.32,
      ...climbInfo(tp, base, lerp(0.3, 0.05, Math.pow(base / (h * 0.92), 0.8))),
    };
  }

  /* palm frond: strip of leaflets along a drooping curve (double sided) */
  function frond(S, base, dir, len, r, colA, colB) {
    const pts = [], seg = 12;
    const d = dir.clone().normalize();
    const side = new V3(-d.z, 0, d.x).normalize();
    let p = base.clone();
    let up = 0.55 + r() * 0.3;
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push(p.clone());
      const step = len / seg;
      p = p.clone().add(new V3(d.x * step, (up - t * 1.9) * step, d.z * step));
    }
    for (let i = 0; i < seg; i++) {
      const t = i / seg, t1 = (i + 1) / seg;
      const a = pts[i], b = pts[i + 1];
      const w = Math.sin(Math.min(1, t * 1.15) * Math.PI) * len * 0.21 + 0.03;
      const w1 = Math.sin(Math.min(1, t1 * 1.15) * Math.PI) * len * 0.21 + 0.03;
      const col = mixc(colA, colB, t);
      for (const sd of [-1, 1]) {
        // leaflet: base on the rib, tip swept back and drooping
        const tipP = b.clone().addScaledVector(side, sd * w1).add(new V3(0, -w1 * 0.55, 0)).addScaledVector(d, len / seg * 0.6);
        const mid = a.clone().lerp(b, 0.5).addScaledVector(side, sd * w * 0.45).add(new V3(0, -w * 0.12, 0));
        const tip2 = a.clone().addScaledVector(side, sd * w * 0.98).add(new V3(0, -w * 0.5, 0)).addScaledVector(d, len / seg * 0.3);
        const cDark = mulc(col, 0.72);
        if (sd > 0) { S.tri(a, b, tipP, col, col, cDark); S.tri(a, mid, tip2, col, col, cDark); }
        else { S.tri(b, a, tipP, col, col, cDark); S.tri(mid, a, tip2, col, col, cDark); }
      }
    }
    return pts;
  }
  function makePalm(v) {
    const r = rng(4000 + v * 19), h = 7.0 + v * 0.9;
    const ax = r() * TAU, pts = [];
    const lean = 1.3 + r() * 0.6;
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      const off = lean * t * t;
      pts.push(new V3(Math.cos(ax) * off, t * h, Math.sin(ax) * off));
    }
    const trunk = tube(pts, (i, t) => lerp(0.24, 0.16, t) * (1 + 0.35 * Math.pow(1 - smooth(0, 0.12, t), 2)), {
      radial: 8, vLen: 0.3, uRep: 1,
      color: (t, a, p) => mixc(L(0x7a6650), L(0x9c876a), fbm(p.x * 3, p.y * 0.6, p.z * 3, 2) * 0.5 + 0.5),
    });
    const top = pts[pts.length - 1];
    const extra = [];
    // coconuts under the crown
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU;
      const g = paint(new THREE.IcosahedronGeometry(0.11, 1), (x, y) => mixc(L(0x4a3a1c), L(0x6b5a2a), y * 3 + 0.5));
      g.scale(1, 1.1, 1);
      extra.push(place(g, top.x + Math.cos(a) * 0.2, top.y - 0.25 - r() * 0.1, top.z + Math.sin(a) * 0.2));
    }
    // crown bulb
    extra.push(paint(place(new THREE.IcosahedronGeometry(0.24, 1), top.x, top.y - 0.05, top.z, 0, 0, 0, new V3(1, 0.8, 1)), L(0x6e6a3a)));
    const S = soup();
    const n = 9 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.3;
      const tilt = i % 3 === 0 ? 0.35 : 0;
      frond(S, top.clone().add(new V3(0, 0.05, 0)), new V3(Math.cos(a), tilt, Math.sin(a)), 3.2 + r() * 0.8, r, C.palmMid, C.palmLight);
    }
    const leaves = S.geo(false);
    // bend frond normals upward so both faces light like foliage
    const N = leaves.attributes.normal.array;
    for (let i = 0; i < N.length; i += 3) { const ny = Math.abs(N[i + 1]) * 0.4 + 0.6; const l = Math.hypot(N[i] * 0.4, ny, N[i + 2] * 0.4); N[i] = N[i] * 0.4 / l; N[i + 1] = ny / l; N[i + 2] = N[i + 2] * 0.4 / l; }
    return {
      parts: [
        { geometry: merge([trunk, ...extra]), material: mat('palmBark', { map: TX.palm() }), castShadow: true },
        { geometry: leaves, material: mat('frond', { side: THREE.DoubleSide, sway: 0.01, flutter: 0.03 }), castShadow: true },
      ],
      radius: 0.25,
      ...climbInfo(pts, top.y - 0.45, 0.17),
    };
  }

  /* bare swamp snag */
  function makeDead(v) {
    const r = rng(5000 + v * 41), h = 4.6 + v * 1.1;
    const col = (t, a, p) => {
      const n = fbm(p.x * 3, p.y * 1.4, p.z * 3, 2);
      return mixc(mixc(C.snagDark, C.snag, 0.55 + n * 0.5), L(0x4a4f2c), (1 - smooth(0, 0.25, t)) * 0.4 * (n + 0.5));
    };
    const pts = [];
    let p = new V3(0, 0, 0), d = new V3(0, 1, 0);
    for (let i = 0; i <= 7; i++) {
      pts.push(p.clone());
      d.x += (r() - 0.5) * 0.45; d.z += (r() - 0.5) * 0.45; d.normalize();
      p = p.clone().addScaledVector(d, h / 7);
    }
    const parts = [tube(pts, flareRad(0.28, 0.06, 0.8), { radial: 7, vLen: 1.2, uRep: 2, cap: 'end', color: col })];
    function grow(from, dir, len, r0, depth) {
      const pp = [from.clone()];
      const dd = dir.clone().normalize();
      const seg = 3;
      for (let i = 1; i <= seg; i++) {
        dd.x += (r() - 0.5) * 0.9; dd.z += (r() - 0.5) * 0.9; dd.y += (r() - 0.5) * 0.6; dd.normalize();
        pp.push(pp[i - 1].clone().addScaledVector(dd, len / seg));
      }
      parts.push(tube(pp, (i, t) => lerp(r0, r0 * 0.25, t), { radial: 4, vLen: 1.2, uRep: 1, cap: 'end', color: col }));
      if (depth > 0) for (let k = 0; k < 2; k++) {
        const at = pp[1 + k];
        const a = r() * TAU;
        grow(at, new V3(Math.cos(a), 0.4 + r() * 0.6, Math.sin(a)), len * 0.5, r0 * 0.45, depth - 1);
      }
    }
    const nb = 4 + v;
    for (let i = 0; i < nb; i++) {
      const at = pts[3 + Math.floor(r() * 4)];
      const a = r() * TAU;
      grow(at, new V3(Math.cos(a), 0.35 + r() * 0.8, Math.sin(a)), 1.2 + r() * 1.0, 0.09, 1);
    }
    return { parts: [{ geometry: merge(parts), material: mat('snag', { map: TX.bark() }), castShadow: true }], radius: 0.3, ...climbInfo(pts, pts[3].y, lerp(0.28, 0.06, Math.pow(3 / 7, 0.8))) };
  }

  function makeBush(v) {
    const r = rng(6000 + v * 13);
    const big = v === 2, k = big ? 1.75 : 1;
    const clumps = [];
    const ring = big ? 8 : 6;
    for (let i = 0; i < ring; i++) {
      const a = (i / ring) * TAU + r() * 0.5, d = (0.22 + r() * 0.05) * k * (big ? 1.25 : 1);
      clumps.push({ x: Math.cos(a) * d, y: (0.28 + r() * 0.08) * k, z: Math.sin(a) * d, r: (0.26 + r() * 0.05) * k, sx: 1.1, sy: 0.95, sz: 1.1, amp: 0.3, fq: 2.6 / k, off: r() * 50, detail: 1 });
    }
    clumps.push({ x: 0, y: 0.46 * k, z: 0, r: 0.34 * k, sx: 1.1, sy: 0.9, sz: 1.1, amp: 0.25, fq: 2.2 / k, off: r() * 50, detail: 1 });
    if (big) for (let i = 0; i < 3; i++) { const a = r() * TAU; clumps.push({ x: Math.cos(a) * 0.35, y: 1.05 + r() * 0.12, z: Math.sin(a) * 0.35, r: 0.42, sx: 1.1, sy: 0.9, sz: 1.1, amp: 0.3, fq: 1.6, off: r() * 50, detail: 1 }); }
    const dark = v === 1 ? L(0x26431a) : L(0x1f3f1a), mid = v === 1 ? L(0x4a7a2c) : L(0x3d6e2a), light = v === 1 ? L(0x8ab04a) : L(0x76a444);
    const g = crown(clumps, { center: new V3(0, 0.45 * k, 0), radii: { x: 0.6 * k * (big ? 1.2 : 1), y: 0.45 * k, z: 0.6 * k * (big ? 1.2 : 1) }, dark, mid, light, seed: 40 + v, cards: big ? { count: 230, size: 0.52 } : { count: 170, size: 0.3 } });
    eachVertex(g, (p) => { if (p.y < 0.02) p.y = 0.02 + p.y * 0.1; });
    return { parts: [leafPart(g, 'leafBush', TX.cluster(), 0.012, 0.02, { fall: FALL.bush })], radius: big ? 0.7 : 0 };
  }


  /* ============================================================
     More trees: birch, maple, weeping willow, giant oak
     ============================================================ */
  // leaf drawing used by the card textures: pointed oval leaf from (0,0) along +x
  function leafShape(c, x, y, len, wid, a, v) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath(); c.moveTo(0, 0);
    c.quadraticCurveTo(len * 0.45, -wid, len, 0);
    c.quadraticCurveTo(len * 0.45, wid, 0, 0);
    const g = c.createLinearGradient(0, -wid, 0, wid);
    g.addColorStop(0, gray(v * 0.82)); g.addColorStop(0.5, gray(v)); g.addColorStop(1, gray(v * 0.7));
    c.fillStyle = g; c.fill();
    c.restore();
  }
  // white birch bark: chalky white with dark horizontal lenticels and black knot marks
  TX.birch = () => canvasTex('birch', 64, 256, (c, w, h, r) => {
    c.fillStyle = gray(0.93); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { c.fillStyle = gray(0.8 + r() * 0.15, 0.5); wrapDraw(w, h, r() * w, r() * h, 30, (X, Y) => c.fillRect(X, Y, 8 + r() * 20, 2 + r() * 5)); }
    for (let i = 0; i < 70; i++) {
      const x = r() * w, y = r() * h, lw = 4 + r() * 16;
      c.fillStyle = gray(0.12 + r() * 0.2, 0.85);
      wrapDraw(w, h, x, y, 24, (X, Y) => c.fillRect(X, Y, lw, 1 + r() * 1.5));
    }
    for (let i = 0; i < 9; i++) {
      // chevron shaped black marks below old branches
      const x = r() * w, y = r() * h, s = 5 + r() * 8;
      wrapDraw(w, h, x, y, 20, (X, Y) => {
        c.fillStyle = gray(0.06, 0.92);
        c.beginPath(); c.moveTo(X - s * 1.4, Y - s * 0.2); c.quadraticCurveTo(X, Y + s * 0.9, X + s * 1.4, Y - s * 0.2);
        c.quadraticCurveTo(X, Y + s * 0.3, X - s * 1.4, Y - s * 0.2); c.fill();
      });
    }
  });
  // maple leaf cluster: palmate five lobed leaves
  TX.maple = () => canvasTex('mapleLeaves', 128, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    const maple = (x, y, s, a, v) => {
      c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
      c.beginPath();
      const lobes = [[-1.57, 1.0], [-0.75, 0.82], [0.0, 0.5], [0.75, 0.82], [1.57, 1.0]];
      c.moveTo(0, 0.35);
      for (const [la, ll] of lobes) {
        const ang = la - Math.PI / 2;
        c.lineTo(Math.cos(ang - 0.28) * ll * 0.55, Math.sin(ang - 0.28) * ll * 0.55);
        c.lineTo(Math.cos(ang) * ll, Math.sin(ang) * ll);
        c.lineTo(Math.cos(ang + 0.28) * ll * 0.55, Math.sin(ang + 0.28) * ll * 0.55);
      }
      c.closePath();
      c.fillStyle = gray(v); c.fill();
      c.strokeStyle = gray(v * 0.65, 0.7); c.lineWidth = 0.06;
      c.beginPath(); c.moveTo(0, 0.3); c.lineTo(0, -0.9); c.moveTo(0, 0.1); c.lineTo(-0.7, -0.5); c.moveTo(0, 0.1); c.lineTo(0.7, -0.5); c.stroke();
      c.restore();
    };
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 40;
      maple(w / 2 + Math.cos(a) * d, h / 2 + Math.sin(a) * d, 11 + r() * 5, r() * TAU, 0.6 + (1 - d / 46) * 0.25 + r() * 0.15);
    }
    c.beginPath(); c.arc(w / 2, h / 2, 12, 0, TAU); c.fillStyle = gray(0.66); c.fill();
  }, { clamp: true });
  // airy birch leaves: small leaves scattered with gaps
  TX.airy = () => canvasTex('airyLeaves', 128, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 46;
      const x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d, ang = r() * TAU, len = 10 + r() * 6;
      leafShape(c, x - Math.cos(ang) * len * 0.5, y - Math.sin(ang) * len * 0.5, len, 4 + r() * 2, ang, 0.62 + (1 - d / 50) * 0.22 + r() * 0.16);
    }
    c.beginPath(); c.arc(w / 2, h / 2, 9, 0, TAU); c.fillStyle = gray(0.66); c.fill();
  }, { clamp: true });
  // willow strand: a thin hanging twig with narrow leaves, u across, v from tip (0) to top (1)
  TX.strand = () => canvasTex('willowStrand', 32, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    c.strokeStyle = gray(0.5); c.lineWidth = 1.2;
    c.beginPath(); c.moveTo(w / 2, 0); c.lineTo(w / 2, h); c.stroke();
    for (let k = 0; k < 3; k++) {
      const sx = w * (0.22 + k * 0.28) + (r() - 0.5) * 3;
      c.strokeStyle = gray(0.5); c.lineWidth = 1;
      c.beginPath(); c.moveTo(sx, 0); c.lineTo(sx + (r() - 0.5) * 4, h); c.stroke();
      for (let y = 1 + k; y < h - 1; y += 2.6) {
        for (const sd of [-1, 1]) {
          const len = (7 + r() * 5) * (0.75 + 0.25 * (y / h));
          const ang = Math.PI / 2 + sd * (0.25 + r() * 0.4);
          leafShape(c, sx, y, len, 1.4 + r() * 0.6, ang - Math.PI, 0.6 + r() * 0.4);
        }
      }
    }
  });

  /* ---------------- birch ---------------- */
  function makeBirch(v) {
    const r = rng(9100 + v * 37), h = 10 + v * 1.2;
    const wood = [], clumps = [];
    const stems = v === 1 ? 3 : 1;
    const barkC = (t, a, p) => {
      const n = fbm(p.x * 3, p.y * 0.7, p.z * 3, 2);
      let c = mixc(L(0xd8d4cc), L(0xf2f0ea), 0.5 + n * 0.6);
      return mixc(c, L(0x3a352e), (1 - smooth(0.0, 0.07, t)) * 0.75);
    };
    let main = null;
    const crownC = new V3(0, h * 0.62, 0);
    for (let s = 0; s < stems; s++) {
      const sa = s * 2.3 + r(), lean = stems > 1 ? 0.12 + r() * 0.08 : 0.03;
      const sh = h * (s === 0 ? 1 : 0.86 + r() * 0.1);
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        pts.push(new V3(Math.cos(sa) * (0.18 * (stems > 1) + lean * t * sh * 0.3) + Math.sin(t * 5 + s) * 0.08, t * sh * 0.97, Math.sin(sa) * (0.18 * (stems > 1) + lean * t * sh * 0.3) + Math.cos(t * 4 + s) * 0.08));
      }
      if (!main) main = pts;
      const r0 = stems > 1 ? 0.13 : 0.17;
      wood.push(tube(pts, flareRad(r0, 0.035, 0.35), { radial: stems > 1 ? 5 : 7, vLen: 2, uRep: 1, color: barkC }));
      // thin branches angled upward along the upper trunk, each carrying a small leaf mass
      const nb = stems > 1 ? 3 : 7;
      for (let i = 0; i < nb; i++) {
        const t = 0.38 + (i / nb) * 0.55, k = Math.min(7, Math.floor(t * 8));
        const from = pts[k].clone().lerp(pts[k + 1], t * 8 - k);
        const a = sa + i * 2.39 + r() * 0.5;
        const b = branch(from, new V3(Math.cos(a), 0.9 + r() * 0.6, Math.sin(a)), (1.4 + r() * 0.8) * (1.2 - t * 0.5), 0.045, 0.015, r, 3, 4);
        b.geo.attributes.color.array.forEach((_, j, arr) => { arr[j] = j % 3 === 0 ? 0.62 : j % 3 === 1 ? 0.6 : 0.56; });
        wood.push(b.geo);
        const e = b.pts[b.pts.length - 1];
        clumps.push({ x: e.x * 0.8 + from.x * 0.2, y: e.y + 0.1, z: e.z * 0.8 + from.z * 0.2, r: 1.0 + r() * 0.3, sx: 1.0, sy: 1.2, sz: 1.0, amp: 0.35, fq: 1.6, off: r() * 50, detail: 1 });
      }
      const top = pts[pts.length - 1];
      clumps.push({ x: top.x, y: top.y - 0.8, z: top.z, r: 1.0, sx: 1, sy: 1.4, sz: 1, amp: 0.3, fq: 1.6, off: r() * 50, detail: 1 });
      for (let k = 0; k < 2; k++) { const p = pts[5 + k]; clumps.push({ x: p.x, y: p.y, z: p.z, r: 1.1, sx: 1.1, sy: 1.3, sz: 1.1, amp: 0.3, fq: 1.5, off: r() * 50, detail: 1 }); }
    }
    const leaves = crown(clumps, { center: crownC, radii: { x: 2.4, y: h * 0.32, z: 2.4 }, dark: L(0x35521c), mid: L(0x5e8c30), light: L(0xa6c45a), seed: 91 + v, cards: { count: stems > 1 ? 260 : 270, size: 1.45, push: 0.2 } });
    return {
      parts: [
        { geometry: merge(wood), material: mat('birchBark', { map: TX.birch() }), castShadow: true },
        leafPart(leaves, 'leafBirch', TX.airy(), 0.01, 0.03, { fall: FALL.birch }),
      ],
      radius: stems > 1 ? 0.45 : 0.22,
      ...climbInfo(main, h * 0.42, 0.12),
    };
  }

  /* ---------------- maple ---------------- */
  function makeMaple(v) {
    const r = rng(9200 + v * 53), h = 8.2 + v * 0.8;
    const trunkH = 2.3 + r() * 0.4;
    const tp = trunkPts(r, trunkH + 0.5, 0.12, 0.4, 6);
    const barkC = barkColor(L(0x5c544a), L(0x36302a), L(0x7a7266), 3);
    const wood = [tube(tp, flareRad(0.36, 0.24, 0.5), { radial: 8, vLen: 1.3, uRep: 2, color: barkC })];
    const top = tp[tp.length - 1];
    const crownC = new V3(top.x, trunkH + (h - trunkH) * 0.5, top.z);
    const cr = { x: 3.4 + r() * 0.3, y: (h - trunkH) * 0.52, z: 3.4 + r() * 0.3 };
    const clumps = [];
    const nb = 5;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.5;
      const b = branch(tp[4 + (i % 2)].clone(), new V3(Math.cos(a), 1.1 + r() * 0.4, Math.sin(a)), 2.3 + r() * 0.6, 0.15, 0.06, r, 3, 5);
      wood.push(b.geo);
      const e = b.pts[b.pts.length - 1];
      clumps.push({ x: e.x, y: e.y + 0.3, z: e.z, r: 1.6 + r() * 0.3, sx: 1.1, sy: 0.95, sz: 1.1, amp: 0.22, fq: 1.2, off: r() * 50, detail: 1 });
    }
    // round, full dome
    clumps.push({ x: crownC.x, y: crownC.y + 0.2, z: crownC.z, r: 2.5, sx: 1.2, sy: 1.0, sz: 1.2, amp: 0.18, fq: 1.0, off: r() * 50, detail: 1 });
    clumps.push({ x: crownC.x, y: h - 1.5, z: crownC.z, r: 1.8, sx: 1.15, sy: 0.9, sz: 1.15, amp: 0.2, fq: 1.2, off: r() * 50, detail: 1 });
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * TAU + 0.6 + r() * 0.4;
      clumps.push({ x: crownC.x + Math.cos(a) * 1.7, y: crownC.y + 1.3 + r() * 0.5, z: crownC.z + Math.sin(a) * 1.7, r: 1.3 + r() * 0.3, sx: 1.1, sy: 0.9, sz: 1.1, amp: 0.25, fq: 1.4, off: r() * 50, detail: 1 });
    }
    const leaves = crown(clumps, { center: crownC, radii: cr, dark: L(0x1c3a14), mid: L(0x3b6c22), light: L(0x7aa83c), seed: 33 + v, cards: { count: 290, size: 1.15 } });
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafMaple', TX.maple(), 0.012, 0.02, { fall: FALL.maple }),
      ],
      radius: 0.4,
      ...climbInfo(tp, tp[4].y, lerp(0.36, 0.24, Math.pow(4 / 6, 0.8))),
    };
  }

  /* ---------------- weeping willow ---------------- */
  function makeWillow(v) {
    const r = rng(9300 + v * 71), h = 8.6 + v * 0.9;
    const trunkH = 2.4 + r() * 0.3;
    const tp = trunkPts(r, trunkH + 0.4, 0.25, 0.5, 5);
    const barkC = barkColor(L(0x5a4a3a), L(0x332820), L(0x786652), 7);
    const wood = [tube(tp, flareRad(0.5, 0.38, 0.6), { radial: 9, vLen: 1.0, uRep: 3, color: barkC })];
    const top = tp[tp.length - 1];
    const nb = 5;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.5;
      // big limbs arch up and out under the dome
      const b = branch(top.clone(), new V3(Math.cos(a) * 0.75, 1.2, Math.sin(a) * 0.75), 4.0 + r() * 0.8, 0.22, 0.07, r, 4, 6, 0.2);
      wood.push(b.geo);
    }
    // umbrella dome: one wide flattened mass plus a few lumps, edged with leaf cards
    const R = 4.4, cy = h - 2.4;
    const clumps = [{ x: top.x, y: cy, z: top.z, r: R * 0.8, sx: 1.15, sy: 0.6, sz: 1.15, amp: 0.2, fq: 0.9, off: r() * 50, detail: 2 }];
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + r(); clumps.push({ x: top.x + Math.cos(a) * 1.6, y: cy + 1.3, z: top.z + Math.sin(a) * 1.6, r: 1.6, sx: 1.2, sy: 0.8, sz: 1.2, amp: 0.2, fq: 1.2, off: r() * 50, detail: 1 }); }
    const lightG = L(0x9cbc4c), midG = L(0x6a8e30), darkG = L(0x34521a);
    const domeC = new V3(top.x, cy, top.z);
    const leaves = crown(clumps, { center: domeC, radii: { x: R, y: 2.0, z: R }, dark: darkG, mid: midG, light: lightG, seed: 77 + v, cards: { count: 230, size: 1.55 } });
    // hanging curtains: strips from the dome surface down toward the ground, facing outward;
    // attribute hang 0 (top) .. 1 (tip) drives the swing
    const P = [], N = [], Cc = [], U = [], Hh = [];
    const nStr = 124;
    for (let i = 0; i < nStr; i++) {
      const u = i / nStr, ring = Math.sqrt(0.25 + 0.75 * ((i * 0.618) % 1));
      const a = u * TAU * 7 + r() * 0.5;
      const rad = R * 1.12 * ring;
      const domeY = cy + Math.sqrt(Math.max(0, 1 - (rad / (R * 1.2)) * (rad / (R * 1.2)))) * 2.2 - 0.3;
      const y0 = domeY - 0.2, y1 = 0.4 + r() * 1.6 + (1 - ring) * 2.4;
      const cx = top.x + Math.cos(a) * rad, cz = top.z + Math.sin(a) * rad;
      const out = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-out.z, 0, out.x);
      const w0 = 0.95 + r() * 0.25, w1 = 0.5;
      const seg = 3, rows = [];
      for (let k = 0; k <= seg; k++) {
        const t = k / seg, y = lerp(y0, y1, t), bow = Math.sin(t * Math.PI * 0.5) * 0.45 * ring;
        const w = lerp(w0, w1, t) * 0.5;
        const c = mixc(mixc(midG, lightG, 0.3 + r() * 0.4 + ring * 0.2), darkG, (1 - ring) * 0.45 + t * 0.1);
        const pc = new V3(cx + out.x * bow, y, cz + out.z * bow);
        rows.push({ a: pc.clone().addScaledVector(side, -w), b: pc.clone().addScaledVector(side, w), t, c });
      }
      const nrm = new V3(out.x * 0.7, 0.6, out.z * 0.7).normalize();
      for (let k = 0; k < seg; k++) {
        const A = rows[k], B = rows[k + 1];
        const quad = [[A.a, A, 0], [A.b, A, 1], [B.b, B, 1], [A.a, A, 0], [B.b, B, 1], [B.a, B, 0]];
        for (const [p, row, uu] of quad) {
          P.push(p.x, p.y, p.z); N.push(nrm.x, nrm.y, nrm.z); Cc.push(row.c[0], row.c[1], row.c[2]);
          U.push(uu, 1 - row.t); Hh.push(row.t);
        }
      }
    }
    const strands = new THREE.BufferGeometry();
    strands.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    strands.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    strands.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    strands.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    strands.setAttribute('hang', new THREE.Float32BufferAttribute(Hh, 1));
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafWillow', TX.airy(), 0.008, 0.02, { fall: FALL.willow }),
        leafPart(strands, 'willowStrands', TX.strand(), 0.008, 0.0, { fall: FALL.willow, hang: true }),
      ],
      radius: 0.55,
      ...climbInfo(tp, trunkH, 0.42),
    };
  }

  /* ---------------- giant landmark oak ---------------- */
  function makeGiant() {
    const r = rng(9400), h = 20;
    const forkH = 5.2;
    const barkC = barkColor(L(0x5e4a38), L(0x34281e), L(0x806a54), 11);
    const tp = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; tp.push(new V3(Math.sin(t * 2.2) * 0.25, t * (forkH + 1.2), Math.cos(t * 1.7) * 0.2 - 0.2)); }
    const trunkRad = (i, t, a) => lerp(1.45, 0.95, Math.pow(t, 0.7)) * (1 + 0.08 * Math.sin(a * 3 + t * 6) + 0.45 * Math.pow(1 - smooth(0, 0.25, t), 2) * (0.6 + 0.4 * Math.cos(a * 6)));
    const wood = [tube(tp, trunkRad, { radial: 14, vLen: 2.0, uRep: 4, color: barkC })];
    // flared roots spreading over the ground
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + r() * 0.4, len = 2.6 + r() * 1.4;
      const d = new V3(Math.cos(a), 0, Math.sin(a));
      const pts = [new V3(d.x * 0.8, 1.3, d.z * 0.8), new V3(d.x * 1.7, 0.55, d.z * 1.7), new V3(d.x * (1.7 + len * 0.6), 0.12, d.z * (1.7 + len * 0.6)), new V3(d.x * (1.8 + len), -0.25, d.z * (1.8 + len))];
      wood.push(tube(path(pts, 5), (k, t) => lerp(0.62, 0.08, Math.pow(t, 0.8)), { radial: 6, vLen: 1.4, uRep: 1, color: barkC }));
    }
    const clumps = [];
    const top = tp[tp.length - 1];
    const crownC = new V3(0, 12.5, 0);
    const nb = 6;
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.4;
      const start = tp[6 + (i % 3) > 8 ? 8 : 6 + (i % 3)].clone();
      const b = branch(start, new V3(Math.cos(a), 0.75 + r() * 0.35, Math.sin(a)), 7.0 + r() * 1.5, 0.62, 0.2, r, 4, 7);
      wood.push(b.geo);
      // two sub branches per limb
      for (let k = 0; k < 2; k++) {
        const at = b.pts[2 + k], sa = a + (k ? 0.7 : -0.7);
        const sb = branch(at, new V3(Math.cos(sa), 0.9 + r() * 0.4, Math.sin(sa)), 3.2 + r(), 0.24, 0.08, r, 3, 5);
        wood.push(sb.geo);
        const e = sb.pts[sb.pts.length - 1];
        clumps.push({ x: e.x, y: e.y + 0.6, z: e.z, r: 2.4 + r() * 0.4, sx: 1.2, sy: 0.8, sz: 1.2, amp: 0.3, fq: 0.8, off: r() * 50, detail: 1 });
      }
      const e = b.pts[b.pts.length - 1];
      clumps.push({ x: e.x, y: e.y + 0.8, z: e.z, r: 3.0 + r() * 0.5, sx: 1.2, sy: 0.8, sz: 1.2, amp: 0.3, fq: 0.7, off: r() * 50, detail: 1 });
    }
    clumps.push({ x: 0, y: 14.5, z: 0, r: 4.6, sx: 1.3, sy: 0.75, sz: 1.3, amp: 0.22, fq: 0.6, off: r() * 50, detail: 1 });
    clumps.push({ x: 0.5, y: h - 2.8, z: -0.4, r: 3.0, sx: 1.2, sy: 0.8, sz: 1.2, amp: 0.25, fq: 0.7, off: r() * 50, detail: 1 });
    const leaves = crown(clumps, { center: crownC, radii: { x: 9.5, y: 6.5, z: 9.5 }, dark: C.oakDark, mid: C.oakMid, light: C.oakLight, seed: 404, cards: { count: 620, size: 2.5 } });
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafOak', TX.cluster(), 0.012, 0.02, { fall: FALL.oak }),
      ],
      radius: 1.6,
      ...climbInfo(tp, forkH, 1.0),
    };
  }

  function makeRock(v) {
    const r = rng(7000 + v * 29);
    const size = [0.55, 0.9, 1.25][v % 3];
    const off = r() * 40;
    const g = prep(new THREE.IcosahedronGeometry(1, 2));
    const sx = 1.1 + r() * 0.25, sz = 0.9 + r() * 0.2, sy = 0.85 + r() * 0.15;
    eachVertex(g, (p) => {
      p.normalize();
      let k = 1 + 0.22 * fbm(p.x * 1.4 + off, p.y * 1.4, p.z * 1.4 - off, 3);
      // flattened facets for a weathered, slightly blocky look
      const f = Math.max(Math.abs(p.x), Math.abs(p.y) * 1.1, Math.abs(p.z));
      k *= lerp(1, 0.86 / f, 0.35);
      p.set(p.x * k * sx, p.y * k * sy, p.z * k * sz);
      if (p.y < -0.05) p.y = -0.05 + (p.y + 0.05) * 0.2; // flat buried base
    });
    eachVertex(g, (p) => { p.y += 0.12; p.multiplyScalar(size * 0.5); });
    smoothNormals(g);
    const base = L(0x9a948a), dark = L(0x58544e), lichen = L(0xa8a466), moss = L(0x4f6a2c);
    paint(g, (x, y, z, nx, ny) => {
      const n = fbm(x * 3 / size + off, y * 3 / size, z * 3 / size, 3);
      let c = mixc(dark, base, clamp(0.55 + n * 0.9 + ny * 0.15, 0, 1));
      c = mixc(c, lichen, smooth(0.12, 0.35, fbm(x * 7 / size, y * 7 / size, z * 7 / size + off, 2)) * 0.7);
      c = mixc(c, L(0xd8d4c8), smooth(0.3, 0.45, fbm(x * 13 / size + 9, y * 13 / size, z * 13 / size, 1)) * 0.5);
      c = mixc(c, moss, smooth(0.45, 0.95, ny) * smooth(-0.1, 0.3, n) * 0.6);
      c = mulc(c, 0.75 + 0.25 * smooth(0, size * 0.25, y));
      return c;
    });
    boxUV(g, 1.4 / size);
    return { parts: [{ geometry: g, material: mat('rock', { map: TX.rock() }), castShadow: true }], radius: size * 0.42 };
  }

  /* curved leaf blade along a path, leaf shape given by width fn */
  function leafStrip(S, base, dir, len, widthFn, r, o) {
    const seg = o.seg || 6, d = dir.clone().normalize();
    const side = new V3(-d.z, 0, d.x).normalize();
    if (side.lengthSq() < 0.01) side.set(1, 0, 0);
    const lift = o.lift == null ? 0.7 : o.lift, droop = o.droop == null ? 1.4 : o.droop;
    const pts = [];
    let p = base.clone();
    for (let i = 0; i <= seg; i++) {
      const t = i / seg;
      pts.push(p.clone());
      const st = len / seg;
      p = p.clone().add(new V3(d.x * st, (lift - t * droop) * st, d.z * st));
    }
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg;
      const w0 = widthFn(t0) * len, w1 = widthFn(t1) * len;
      const fold = o.fold || 0.15;
      const a0 = pts[i].clone().addScaledVector(side, -w0).add(new V3(0, -w0 * fold, 0));
      const b0 = pts[i].clone().addScaledVector(side, w0).add(new V3(0, -w0 * fold, 0));
      const a1 = pts[i + 1].clone().addScaledVector(side, -w1).add(new V3(0, -w1 * fold, 0));
      const b1 = pts[i + 1].clone().addScaledVector(side, w1).add(new V3(0, -w1 * fold, 0));
      const c0 = o.color(t0, 0), c1 = o.color(t1, 0), e0 = o.color(t0, 1), e1 = o.color(t1, 1);
      if (o.vein) {
        // thin midrib strip plus the blade on each side
        const vw = o.vein, m0 = o.color(t0, 0.2), m1 = o.color(t1, 0.2);
        const va0 = new V3().lerpVectors(pts[i], a0, vw), vb0 = new V3().lerpVectors(pts[i], b0, vw);
        const va1 = new V3().lerpVectors(pts[i + 1], a1, vw), vb1 = new V3().lerpVectors(pts[i + 1], b1, vw);
        S.quad(pts[i], pts[i + 1], va1, va0, c0, c1, m1, m0);
        S.quad(va0, va1, a1, a0, m0, m1, e1, e0);
        S.quad(pts[i], vb0, vb1, pts[i + 1], c0, m0, m1, c1);
        S.quad(vb0, b0, b1, vb1, m0, e0, e1, m1);
      } else {
        S.quad(pts[i], pts[i + 1], a1, a0, c0, c1, e1, e0);
        S.quad(pts[i], b0, b1, pts[i + 1], c0, e0, e1, c1);
      }
    }
    return pts;
  }
  function upNormals(g, k = 0.6) {
    const N = g.attributes.normal.array;
    for (let i = 0; i < N.length; i += 3) {
      const nx = N[i] * (1 - k), ny = Math.abs(N[i + 1]) * (1 - k) + k, nz = N[i + 2] * (1 - k);
      const l = Math.hypot(nx, ny, nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    g.attributes.normal.needsUpdate = true;
    return g;
  }
  const plantMat = () => mat('plant', { side: THREE.DoubleSide, sway: 0.3, flutter: 0.02 });

  function makeFern(v) {
    const r = rng(8000 + v), S = soup();
    const n = 10;
    const dark = L(0x183a16), mid = L(0x2f6424), light = L(0x5e9438);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.4, len = 0.7 + r() * 0.3;
      const d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x);
      // arching rachis
      const seg = 12, pts = [];
      const lift = 1.5 + r() * 0.5, droop = 2.7;
      let p = new V3(d.x * 0.03, 0.02, d.z * 0.03);
      for (let k = 0; k <= seg; k++) {
        const t = k / seg;
        pts.push(p.clone());
        p = p.clone().add(new V3(d.x, lift - t * droop, d.z).multiplyScalar(len / seg));
      }
      // pinnae: pairs of narrow leaflets, longest in the middle, swept forward
      for (let k = 1; k < seg; k++) {
        const t = k / seg, base = pts[k], fwd = new V3().subVectors(pts[k + 1], pts[k - 1]).normalize();
        const pl = len * 0.2 * Math.sin(Math.min(1, t * 1.1) * Math.PI) + 0.02;
        const pw = pl * 0.22;
        const col = mixc(mid, light, t * 0.7), tipc = mixc(dark, mid, 0.6 + t * 0.4);
        for (const sd of [-1, 1]) {
          const out = side.clone().multiplyScalar(sd).addScaledVector(fwd, 0.45).normalize();
          const tip = base.clone().addScaledVector(out, pl); tip.y -= pl * 0.25;
          const m1 = base.clone().addScaledVector(out, pl * 0.45).addScaledVector(fwd, pw);
          const m2 = base.clone().addScaledVector(out, pl * 0.45).addScaledVector(fwd, -pw);
          S.tri(base, m1, tip, col, col, tipc);
          S.tri(base, tip, m2, col, tipc, col);
        }
      }
    }
    return { parts: [{ geometry: upNormals(S.geo(false), 0.45), material: plantMat(), castShadow: true }], radius: 0 };
  }

  function makeBigleaf(v) {
    const r = rng(8100 + v), S = soup();
    const dark = L(0x0c2c14), mid = L(0x1d5424), light = L(0x3f7c30), vein = L(0x9ac46a);
    const parts = [];
    const n = 6;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5;
      const d = new V3(Math.cos(a), 0, Math.sin(a));
      // petiole
      const h = 0.75 + r() * 0.55;
      const top = new V3(d.x * 0.25, h, d.z * 0.25);
      parts.push(tube([new V3(0, 0, 0), new V3(d.x * 0.08, h * 0.5, d.z * 0.08), top], (k, t) => lerp(0.025, 0.014, t), { radial: 4, color: () => L(0x4a7a2a) }));
      // huge heart-ish leaf drooping outward
      leafStrip(S, top, d, 0.9 + r() * 0.3, (t) => Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.7) * 0.32 * (1 - t * 0.35), r, {
        seg: 7, lift: 0.5, droop: 1.6, fold: 0.3, vein: 0.07,
        color: (t, e) => (e === 0 ? mixc(vein, light, t * 0.4) : e < 1 ? mixc(mid, light, 0.35 - t * 0.2) : mixc(dark, mid, 0.5 + t * 0.3)),
      });
    }
    const leaves = upNormals(S.geo(false), 0.3);
    return { parts: [{ geometry: merge([leaves, ...parts]), material: plantMat(), castShadow: true }], radius: 0 };
  }

  function makeMushroom(v) {
    const r = rng(8200 + v), gs = [];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = i ? 0.06 + r() * 0.07 : 0;
      const x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = (i ? 0.08 + r() * 0.07 : 0.17), cr = (i ? 0.05 + r() * 0.035 : 0.09);
      const stem = new THREE.CylinderGeometry(cr * 0.28, cr * 0.36, h, 7, 1, true);
      place(stem, x, h / 2, z);
      gs.push(paint(stem, L(0xece2cc)));
      const cap = new THREE.SphereGeometry(cr, 8, 4, 0, TAU, 0, Math.PI * 0.55);
      place(cap, x, h - cr * 0.15, z, (r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3, new V3(1, 0.75, 1));
      gs.push(paint(cap, (px, py, pz, nx, ny) => {
        const base = mixc(L(0x9a4a28), L(0xc87a3a), ny);
        const spot = fbm(px * 90, py * 90, pz * 90, 1) > 0.35 ? 1 : 0;
        return mixc(base, L(0xf2eadc), spot * 0.85 * ny);
      }));
      const under = new THREE.CircleGeometry(cr * 0.95, 8);
      place(under, x, h - cr * 0.12, z, Math.PI / 2, 0, 0);
      gs.push(paint(under, L(0xd8c8a8)));
    }
    return { parts: [{ geometry: merge(gs), material: mat('plainStd', { std: true, roughness: 0.7 }), castShadow: true }], radius: 0 };
  }

  function makeCattail(v) {
    const r = rng(8300 + v), S = soup(), gs = [];
    const dark = L(0x3d5a26), light = L(0x8aa856);
    for (let i = 0; i < 14; i++) {
      const a = r() * TAU, d = r() * 0.15;
      const base = new V3(Math.cos(a) * d, 0, Math.sin(a) * d);
      const dir = new V3(Math.cos(a) * 0.15 + (r() - 0.5) * 0.2, 0, Math.sin(a) * 0.15 + (r() - 0.5) * 0.2);
      const len = 1.0 + r() * 0.5;
      // reed blade: tall thin, grows mostly up
      const seg = 5, pts = [];
      let p = base.clone();
      const side = new V3(-dir.z, 0, dir.x).normalize();
      for (let k = 0; k <= seg; k++) {
        const t = k / seg;
        pts.push(p.clone());
        p = p.clone().add(new V3(dir.x * (0.3 + t * 2), 1, dir.z * (0.3 + t * 2)).multiplyScalar(len / seg));
      }
      for (let k = 0; k < seg; k++) {
        const w0 = 0.016 * (1 - k / seg) + 0.002, w1 = 0.016 * (1 - (k + 1) / seg) + 0.002;
        const c0 = mixc(dark, light, k / seg), c1 = mixc(dark, light, (k + 1) / seg);
        S.quad(pts[k].clone().addScaledVector(side, -w0), pts[k].clone().addScaledVector(side, w0), pts[k + 1].clone().addScaledVector(side, w1), pts[k + 1].clone().addScaledVector(side, -w1), c0, c0, c1, c1);
      }
    }
    // stalks with brown heads
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = r() * 0.1;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, h = 1.1 + r() * 0.25;
      const tx = x + (r() - 0.5) * 0.1, tz = z + (r() - 0.5) * 0.1;
      gs.push(tube([new V3(x, 0, z), new V3((x + tx) / 2, h * 0.5, (z + tz) / 2), new V3(tx, h + 0.18, tz)], 0.007, { radial: 4, color: () => L(0x6a7a3a) }));
      const head = new THREE.CylinderGeometry(0.024, 0.024, 0.16, 7, 3);
      eachVertex(head, (p) => { const k = 1 - Math.pow(Math.abs(p.y) / 0.08, 4) * 0.35; p.x *= k; p.z *= k; });
      place(head, tx, h, tz);
      gs.push(paint(head, (px, py, pz) => mixc(L(0x4a2c18), L(0x6e4426), fbm(px * 200, py * 60, pz * 200, 1) * 0.5 + 0.5)));
    }
    const reeds = upNormals(S.geo(false), 0.5);
    return { parts: [{ geometry: merge([reeds, ...gs]), material: mat('reed', { side: THREE.DoubleSide, sway: 0.25, flutter: 0.01 }), castShadow: true }], radius: 0 };
  }

  function makeLily(v) {
    const r = rng(8400 + v), gs = [];
    const R = 0.175, n = 20, S = soup();
    const notch = 0.35;
    const ctr = new V3(0, 0.012, 0);
    for (let i = 0; i < n; i++) {
      const a0 = notch / 2 + (i / n) * (TAU - notch), a1 = notch / 2 + ((i + 1) / n) * (TAU - notch);
      const r0 = R * (1 + 0.04 * Math.sin(a0 * 5)), r1 = R * (1 + 0.04 * Math.sin(a1 * 5));
      const p0 = new V3(Math.cos(a0) * r0, 0.012 + 0.006 * Math.sin(a0 * 3), Math.sin(a0) * r0);
      const p1 = new V3(Math.cos(a1) * r1, 0.012 + 0.006 * Math.sin(a1 * 3), Math.sin(a1) * r1);
      const cE = mixc(L(0x245a1e), L(0x4a8030), 0.4 + 0.3 * Math.sin(a0 * 7)), cC = L(0x3a7426);
      S.tri(ctr, p1, p0, cC, cE, cE);
    }
    const pad = S.geo(false);
    gs.push(pad);
    if (v === 1) {
      // water lily: two rings of pointed pink petals and a yellow center
      for (let ring = 0; ring < 2; ring++) {
        const np = 8, len = ring ? 0.08 : 0.105, up = ring ? 1.1 : 0.6;
        for (let i = 0; i < np; i++) {
          const a = (i / np) * TAU + ring * 0.4;
          const petal = soup();
          const b = new V3(0.02, 0.02, 0), d = new V3(Math.cos(a), 0, Math.sin(a));
          const s = new V3(-d.z, 0, d.x);
          const tip = new V3(Math.cos(a) * len, 0.02 + up * len * 0.6, Math.sin(a) * len);
          const m = new V3(Math.cos(a) * len * 0.5, 0.02 + up * len * 0.25, Math.sin(a) * len * 0.5);
          const cb = L(0xf6d8e6), ct = L(0xe86aa0);
          petal.tri(new V3(0, 0.02 + ring * 0.01, 0), m.clone().addScaledVector(s, len * 0.22), tip, cb, mixc(cb, ct, 0.5), ct);
          petal.tri(new V3(0, 0.02 + ring * 0.01, 0), tip, m.clone().addScaledVector(s, -len * 0.22), cb, ct, mixc(cb, ct, 0.5));
          gs.push(upNormals(petal.geo(false), 0.5));
        }
      }
      gs.push(paint(place(new THREE.IcosahedronGeometry(0.022, 1), 0, 0.035, 0), L(0xf2c43a)));
    }
    return { parts: [{ geometry: merge(gs), material: mat('lily', { side: THREE.DoubleSide, std: true, roughness: 0.45 }), castShadow: false }], radius: 0 };
  }

  function makeHay(v) {
    const R = 0.6, W = 1.2, gs = [];
    const cyl = new THREE.CylinderGeometry(R, R, W, 18, 1, true);
    gs.push(paint(cyl, (x, y, z) => mixc(L(0xb8963e), L(0xdcc272), fbm(x * 6, y * 2, z * 6, 2) * 0.6 + 0.5)));
    for (const s of [-1, 1]) {
      // end faces: spiral shading, slightly domed
      const S = soup(), n = 18, rings = 4;
      for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) {
        const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, r0 = (k / rings) * R, r1 = ((k + 1) / rings) * R;
        const dome = (rr) => (1 - (rr / R) * (rr / R)) * 0.04;
        const P = (rr, a) => new V3(Math.cos(a) * rr, s * (W / 2 + dome(rr)), Math.sin(a) * rr);
        const col = (rr, a) => mulc(mixc(L(0xc8a650), L(0xe6d08a), 0.5 + 0.5 * Math.sin(rr * 40 + a * 1.0)), 0.85 + 0.15 * (rr / R));
        const A = P(r0, a0), B = P(r1, a0), Cq = P(r1, a1), D = P(r0, a1);
        if (s > 0) S.quad(A, D, Cq, B, col(r0, a0), col(r0, a1), col(r1, a1), col(r1, a0));
        else S.quad(A, B, Cq, D, col(r0, a0), col(r1, a0), col(r1, a1), col(r0, a1));
      }
      gs.push(S.geo(false));
    }
    const g = merge(gs);
    g.rotateZ(Math.PI / 2);
    g.translate(0, R, 0);
    boxUV(g, 1.2);
    return { parts: [{ geometry: g, material: mat('straw', { map: TX.straw() }), castShadow: true }], radius: 0.55 };
  }

  const PUFF = [[0xf6b8d2, 0xd884ae], [0xd6c2f4, 0xa98ad8], [0xbdeed6, 0x7ccaa6], [0xfbe9a8, 0xe6c46a]];
  function makePuff(v) {
    const r = rng(8500 + v * 7), h = 4;
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(Math.sin(t * 3 + v) * 0.25 * t, t * 2.4, Math.cos(t * 2 + v) * 0.15 * t)); }
    const trunk = tube(pts, flareRad(0.16, 0.08, 0.5), { radial: 7, vLen: 1, color: (t) => mixc(L(0xb69a86), L(0xe2d2c4), t) });
    const top = pts[pts.length - 1];
    const clumps = [];
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + r() * 0.5;
      clumps.push({ x: top.x + Math.cos(a) * 0.75, y: 2.75 + r() * 0.3, z: top.z + Math.sin(a) * 0.75, r: 0.62 + r() * 0.12, amp: 0.12, fq: 1.6, off: r() * 30, detail: 2 });
    }
    clumps.push({ x: top.x, y: 3.25, z: top.z, r: 0.8, amp: 0.1, fq: 1.4, off: r() * 30, detail: 2 });
    const pal = PUFF[v % 4];
    const light = L(pal[0]), dark = L(pal[1]);
    const leaves = crown(clumps, { center: new V3(top.x, 2.95, top.z), radii: { x: 1.4, y: 0.95, z: 1.4 }, dark, mid: mixc(dark, light, 0.6), light: mixc(light, [1, 1, 1], 0.35), seed: v + 70, bend: 0.65, cards: { count: 170, size: 0.75, push: 0.05 } });
    return {
      parts: [
        { geometry: trunk, material: mat('puffTrunk', { std: true, roughness: 0.8 }), castShadow: true },
        leafPart(leaves, 'puffCards', TX.fluff(), 0.01, 0.01),
      ],
      radius: 0.2,
      ...climbInfo(pts, top.y - 0.15, 0.085),
    };
  }

  function makeStump(v) {
    const r = rng(8600 + v), gs = [];
    const R = 0.38, H = 0.45;
    const cyl = new THREE.CylinderGeometry(R, R * 1.15, H, 12, 3, true);
    eachVertex(cyl, (p) => {
      const a = Math.atan2(p.z, p.x), t = (p.y + H / 2) / H;
      const k = 1 + 0.06 * Math.sin(a * 7) + 0.4 * Math.pow(1 - t, 3) * (0.6 + 0.4 * Math.cos(a * 4));
      p.x *= k; p.z *= k;
      if (t > 0.9) p.y += 0.04 * Math.sin(a * 3);
    });
    place(cyl, 0, H / 2, 0);
    gs.push(paint(cyl, (x, y, z) => mixc(mixc(C.barkDark, C.bark, fbm(x * 8, y * 3, z * 8, 2) + 0.5), L(0x4f6a2c), (1 - smooth(0, 0.25, y)) * 0.5)));
    const S = soup(), n = 12, rings = 3;
    for (let k = 0; k < rings; k++) for (let i = 0; i < n; i++) {
      const a0 = (i / n) * TAU, a1 = ((i + 1) / n) * TAU, r0 = (k / rings) * R * 1.04, r1 = ((k + 1) / rings) * R * 1.04;
      const y = (rr, a) => H + (rr / R) * 0.04 * Math.sin(a * 3) - (1 - rr / R) * 0.015;
      const col = (rr) => mixc(L(0xc8a676), L(0x9c7a4c), 0.5 + 0.5 * Math.sin(rr * 90));
      const P = (rr, a) => new V3(Math.cos(a) * rr * (1 + 0.06 * Math.sin(a * 7)), y(rr, a), Math.sin(a) * rr * (1 + 0.06 * Math.sin(a * 7)));
      S.quad(P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0), col(r0), col(r0), col(r1), col(r1));
    }
    gs.push(S.geo(false));
    const g = merge(gs);
    boxUV(g, 2);
    return { parts: [{ geometry: g, material: mat('bark', { map: TX.bark() }), castShadow: true }], radius: 0.42 };
  }

  function makeLog(v) {
    const r = rng(8700 + v), gs = [];
    const pts = [];
    for (let i = 0; i <= 6; i++) { const t = i / 6; pts.push(new V3(-1.5 + t * 3, 0.24 + Math.sin(t * Math.PI) * 0.02, Math.sin(t * 2.5) * 0.08)); }
    gs.push(tube(pts, (i, t, a) => (0.24 - t * 0.04) * (1 + 0.05 * Math.sin(a * 6 + t * 10)), {
      radial: 10, vLen: 1, uRep: 2, cap: 'both', capColor: L(0x9a7a50),
      color: (t, a, p) => {
        const top = smooth(-0.2, 0.9, Math.sin(a) * Math.sign(Math.sin(a)) * (Math.sin(a) > 0 ? 1 : 0));
        const n = fbm(p.x * 3, p.y * 3, p.z * 3, 2);
        const mossy = smooth(0.35, 0.75, (p.y - 0.24) / 0.24 + n * 0.9) * smooth(-0.2, 0.3, fbm(p.x * 1.3 + 4, 0, p.z, 2));
        const grain = 0.85 + 0.15 * Math.sin(a * 9 + p.x * 3);
        return mixc(mulc(mixc(C.barkDark, C.bark, n + 0.6), grain), mixc(L(0x3f6a22), L(0x6a9a3a), n + 0.5), mossy * 0.9);
      },
    }));
    // a broken branch stub and a couple of moss tufts
    const a = r() * TAU;
    gs.push(tube([new V3(0.4, 0.3, 0.1), new V3(0.55, 0.55, 0.25)], (i, t) => lerp(0.06, 0.04, t), { radial: 5, cap: 'end', color: () => C.bark }));
    const g = merge(gs);
    eachVertex(g, (p) => { if (p.y < 0.02) p.y = 0.02 + (p.y - 0.02) * 0.2; });
    return { parts: [{ geometry: g, material: mat('bark', { map: TX.bark() }), castShadow: true }], radius: 0.3 };
  }

  function makeFlower(v) {
    const r = rng(8800 + v), stemGs = [];
    const h = 0.22;
    const top = new V3(0.01, h, 0.005);
    stemGs.push(tube([new V3(0, 0, 0), new V3(0.008, h * 0.5, 0), top], 0.004, { radial: 4, color: () => L(0x3f7a2a) }));
    const S = soup();
    for (let i = 0; i < 2; i++) {
      const a = i * Math.PI + r();
      leafStrip(S, new V3(0, 0.03 + i * 0.03, 0), new V3(Math.cos(a), 0, Math.sin(a)), 0.09, (t) => Math.sin(t * Math.PI) * 0.18, r, { seg: 4, lift: 0.9, droop: 1.6, color: (t) => mixc(L(0x2f6a22), L(0x6a9a3a), t) });
    }
    stemGs.push(upNormals(S.geo(false), 0.5));
    const stem = setTint(merge(stemGs), 0);
    // petals: white in vertex color, tinted by instanceColor through the tint attribute
    const P = soup(), np = 8, pl = 0.05;
    for (let i = 0; i < np; i++) {
      const a = (i / np) * TAU;
      const d = new V3(Math.cos(a), 0, Math.sin(a)), s = new V3(-d.z, 0, d.x);
      const b = top.clone().add(new V3(0, 0.004, 0));
      const tip = top.clone().addScaledVector(d, pl).add(new V3(0, 0.012, 0));
      const m1 = top.clone().addScaledVector(d, pl * 0.6).addScaledVector(s, pl * 0.26).add(new V3(0, 0.014, 0));
      const m2 = top.clone().addScaledVector(d, pl * 0.6).addScaledVector(s, -pl * 0.26).add(new V3(0, 0.014, 0));
      const cw = [0.52, 0.52, 0.52], cb = [0.4, 0.4, 0.4];
      P.tri(b, m1, tip, cb, cw, cw);
      P.tri(b, tip, m2, cb, cw, cw);
    }
    const petals = setTint(upNormals(P.geo(false), 0.7), 1);
    const eye = setTint(paint(place(new THREE.IcosahedronGeometry(0.014, 1), top.x, top.y + 0.012, top.z, 0, 0, 0, new V3(1, 0.6, 1)), L(0xf0b830)), 0);
    return { parts: [{ geometry: merge([stem, petals, eye]), material: mat('flower', { side: THREE.DoubleSide, tinted: true, sway: 3.0, flutter: 0.004 }), castShadow: false }], radius: 0 };
  }

  const PROPS = { birch: makeBirch, maple: makeMaple, willow: makeWillow, giant: makeGiant, pumpkin: makePumpkin, cornstalk: makeCornstalk, oak: makeOak, apple: makeApple, pine: makePine, palm: makePalm, dead: makeDead, bush: makeBush, rock: makeRock, fern: makeFern, bigleaf: makeBigleaf, mushroom: makeMushroom, cattail: makeCattail, lily: makeLily, hay: makeHay, puff: makePuff, stump: makeStump, log: makeLog, flower: makeFlower };
  const VARIANTS = { oak: 3, apple: 2, pine: 3, palm: 2, dead: 2, bush: 3, rock: 3, puff: 4, lily: 2, birch: 2, maple: 3, willow: 2, giant: 1, pumpkin: 3 };
  const propCache = {};
  function prop(type, variant = 0) {
    const make = PROPS[type];
    if (!make) throw new Error('Env.prop: unknown type ' + type);
    const nv = VARIANTS[type] || 1;
    const v = ((Math.floor(variant) % nv) + nv) % nv;
    const key = type + ':' + v;
    if (!propCache[key]) {
      const p = make(v);
      if (p.climbH == null) { p.climbH = 0; p.trunkR = 0; p.climbX = 0; p.climbZ = 0; }
      for (const part of p.parts) {
        const g = part.geometry;
        g.computeBoundingBox();
        g.computeBoundingSphere();
        // leaf cards grow in the vertex shader: pad the bounds by the largest card half size
        if (g.attributes.card) {
          let m = 0;
          const k = g.attributes.card.array;
          for (let i = 0; i < k.length; i++) m = Math.max(m, Math.abs(k[i]));
          g.boundingSphere.radius += m * 1.42;
          g.boundingBox.expandByScalar(m * 1.42);
        }
      }
      propCache[key] = p;
    }
    return propCache[key];
  }

  /* ============================================================
     Buildings: barn, fence, garden
     ============================================================ */
  function boxG(w, h, d, x, y, z, col, uvs = 1, ry = 0) {
    const g = prep(new THREE.BoxGeometry(w, h, d));
    place(g, x, y, z, 0, ry, 0);
    paint(g, col);
    return boxUV(g, uvs);
  }
  // world-space box uv after placement (so textures keep scale)
  function meshOf(geo, material, cast = true, recv = true) {
    const m = new THREE.Mesh(geo, material);
    m.castShadow = cast; m.receiveShadow = recv;
    return m;
  }

  let barnGroup = null;
  function barn() {
    if (!barnGroup) barnGroup = buildBarn();
    const g = barnGroup.clone();
    g.userData = Object.assign({}, barnGroup.userData);
    return g;
  }
  function buildBarn() {
    const W = 10, D = 14, wallH = 4.2, H = 8.2;
    const found = 0.6;
    const red = L(0x9a2a22), white = L(0xf2efe6), roofC = L(0x4f4f52);
    const walls = [], trim = [], stone = [], roof = [], dark = [];
    // gambrel profile (x, y) from left eave to right eave
    const prof = [[-W / 2, wallH], [-W / 2 + 1.5, wallH + 2.5], [0, H], [W / 2 - 1.5, wallH + 2.5], [W / 2, wallH]];
    // stone foundation
    stone.push(boxUV(paint(prep(new THREE.BoxGeometry(W + 0.24, found, D + 0.24)).translate(0, found / 2, 0), (x, y, z) => mixc(L(0x8a8580), L(0xa8a49c), fbm(x * 2, y * 2, z * 2, 2) + 0.5)), 1.1));
    // long side walls (box), end walls with gable as soup
    const wallT = 0.2;
    walls.push(boxG(wallT, wallH - found, D, -W / 2 + wallT / 2, found + (wallH - found) / 2, 0, red, 0.5));
    walls.push(boxG(wallT, wallH - found, D, W / 2 - wallT / 2, found + (wallH - found) / 2, 0, red, 0.5));
    for (const s of [-1, 1]) {
      const S = soup(), z = s * D / 2;
      const pts = [[-W / 2, found], [W / 2, found], ...prof.slice().reverse()];
      // fan triangulate the convex end wall polygon from its center
      const cx = 0, cy = (found + H) / 2;
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const A = new V3(a[0], a[1], z), B = new V3(b[0], b[1], z), Cc = new V3(cx, cy, z);
        if (s > 0) S.tri(Cc, A, B, red, red, red); else S.tri(Cc, B, A, red, red, red);
      }
      const g = S.geo(false);
      walls.push(g);
    }
    // white corner trim and eave/rake trim
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) trim.push(boxG(0.22, wallH - found, 0.22, sx * (W / 2 + 0.01), found + (wallH - found) / 2, sz * (D / 2 + 0.01), white));
    for (const s of [-1, 1]) {
      const z = s * (D / 2 + 0.04);
      for (let i = 0; i < prof.length - 1; i++) {
        const a = prof[i], b = prof[i + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]) + 0.2, ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
        const g = prep(new THREE.BoxGeometry(len, 0.24, 0.1));
        g.rotateZ(ang);
        g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.05, z);
        trim.push(paint(g, white));
      }
      // big sliding doors (two leaves), white X bracing, white frame
      const dw = 3.6, dh = 3.4, dz = s * (D / 2 + 0.06);
      walls.push(boxG(dw, dh, 0.08, 0, found + dh / 2, dz, mulc(red, 0.92), 0.5));
      trim.push(boxG(dw + 0.3, 0.2, 0.12, 0, found + dh + 0.1, dz + s * 0.01, white));
      for (const side of [-1, 1]) trim.push(boxG(0.18, dh, 0.12, side * (dw / 2 + 0.05), found + dh / 2, dz + s * 0.01, white));
      trim.push(boxG(0.1, dh, 0.12, 0, found + dh / 2, dz + s * 0.02, white));
      for (const half of [-1, 1]) {
        const cx = half * dw / 4, diag = Math.hypot(dw / 2, dh) - 0.1, ang = Math.atan2(dh, dw / 2);
        for (const k of [-1, 1]) {
          const g = prep(new THREE.BoxGeometry(diag, 0.14, 0.1));
          g.rotateZ(ang * k);
          g.translate(cx, found + dh / 2, dz + s * 0.03);
          trim.push(paint(g, white));
        }
        trim.push(boxG(dw / 2 - 0.1, 0.14, 0.1, cx, found + dh / 2, dz + s * 0.04, white));
      }
      // track rail above the door
      dark.push(boxG(dw * 2, 0.1, 0.12, 0, found + dh + 0.32, dz + s * 0.04, L(0x2a2a2a)));
      // hayloft door with frame, and the hay hood beam
      const hy = wallH + 1.45, hw = 1.5, hh = 1.6;
      walls.push(boxG(hw, hh, 0.08, 0, hy, dz, mulc(red, 0.9), 0.5));
      trim.push(boxG(hw + 0.3, 0.16, 0.12, 0, hy + hh / 2 + 0.08, dz + s * 0.01, white));
      trim.push(boxG(hw + 0.3, 0.16, 0.12, 0, hy - hh / 2 - 0.08, dz + s * 0.01, white));
      for (const side of [-1, 1]) trim.push(boxG(0.16, hh + 0.3, 0.12, side * (hw / 2 + 0.07), hy, dz + s * 0.01, white));
      for (const k of [-1, 1]) {
        const g = prep(new THREE.BoxGeometry(Math.hypot(hw, hh) - 0.1, 0.12, 0.1));
        g.rotateZ(Math.atan2(hh, hw) * k);
        g.translate(0, hy, dz + s * 0.03);
        trim.push(paint(g, white));
      }
      // hay hood: a small peaked hood over the hayloft door
      const hood = prep(new THREE.ConeGeometry(0.75, 0.5, 4, 1)); hood.rotateY(Math.PI / 4); hood.scale(1.4, 1, 0.7); hood.translate(0, hy + hh / 2 + 0.55, dz + s * 0.35);
      roof.push(paint(hood, mulc(roofC, 0.9)));
    }
    // windows on the long sides
    for (const sx of [-1, 1]) for (const z of [-4, 0, 4]) {
      const x = sx * (W / 2 + 0.05);
      dark.push(boxG(0.06, 0.9, 0.9, x, 2.7, z, L(0x1e2a30)));
      trim.push(boxG(0.1, 1.1, 0.14, x + sx * 0.01, 2.7, z - 0.5, white));
      trim.push(boxG(0.1, 1.1, 0.14, x + sx * 0.01, 2.7, z + 0.5, white));
      trim.push(boxG(0.1, 0.14, 1.14, x + sx * 0.01, 3.27, z, white));
      trim.push(boxG(0.1, 0.14, 1.14, x + sx * 0.01, 2.13, z, white));
      trim.push(boxG(0.08, 0.06, 0.9, x + sx * 0.02, 2.7, z, white));
      trim.push(boxG(0.08, 0.9, 0.06, x + sx * 0.02, 2.7, z, white));
    }
    // gambrel roof: 4 slopes with overhang, shingle texture, thickness edge
    const over = 0.45, S = soup();
    const roofPts = [[-W / 2 - 0.35, wallH - 0.25], ...prof.slice(1, 4), [W / 2 + 0.35, wallH - 0.25]];
    for (let i = 0; i < roofPts.length - 1; i++) {
      const a = roofPts[i], b = roofPts[i + 1];
      const lift = 0.12;
      const A = new V3(a[0], a[1] + lift, -D / 2 - over), B = new V3(b[0], b[1] + lift, -D / 2 - over);
      const Cc = new V3(b[0], b[1] + lift, D / 2 + over), Dd = new V3(a[0], a[1] + lift, D / 2 + over);
      const sl = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ua = [0, 0], ub = [0, sl / 2.2], uc = [(D + 2 * over) / 2.2, sl / 2.2], ud = [(D + 2 * over) / 2.2, 0];
      const shade = 0.9 + 0.1 * i / 3;
      const cA = mulc(roofC, shade), cB = mulc(roofC, shade);
      if (a[0] < b[0] || (a[0] === b[0])) S.quad(A, Dd, Cc, B, cA, cA, cB, cB, ua, ud, uc, ub);
    }
    const roofG = S.geo(false);
    // underside of roof (dark), so it is not see-through from below
    const U = soup();
    for (let i = 0; i < roofPts.length - 1; i++) {
      const a = roofPts[i], b = roofPts[i + 1];
      const A = new V3(a[0], a[1] + 0.04, -D / 2 - over), B = new V3(b[0], b[1] + 0.04, -D / 2 - over);
      const Cc = new V3(b[0], b[1] + 0.04, D / 2 + over), Dd = new V3(a[0], a[1] + 0.04, D / 2 + over);
      U.quad(A, B, Cc, Dd, L(0x3a2a20), L(0x3a2a20), L(0x3a2a20), L(0x3a2a20));
    }
    dark.push(U.geo(false));
    // roof edge fascia (white) along both gable ends
    for (const s of [-1, 1]) for (let i = 0; i < roofPts.length - 1; i++) {
      const a = roofPts[i], b = roofPts[i + 1];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ang = Math.atan2(b[1] - a[1], b[0] - a[0]);
      const g = prep(new THREE.BoxGeometry(len + 0.06, 0.16, 0.08));
      g.rotateZ(ang); g.translate((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 + 0.08, s * (D / 2 + over));
      trim.push(paint(g, white));
    }
    // ridge cap and a little cupola with a weathervane post
    roof.push(boxG(0.35, 0.12, D + 2 * over, 0, H + 0.14, 0, mulc(roofC, 0.8), 1));
    const cup = [];
    cup.push(boxG(1.0, 0.8, 1.0, 0, H + 0.45, 0, white));
    for (const s of [-1, 1]) {
      cup.push(boxG(0.04, 0.45, 0.65, s * 0.51, H + 0.5, 0, L(0x55524c)));
      cup.push(boxG(0.65, 0.45, 0.04, 0, H + 0.5, s * 0.51, L(0x55524c)));
    }
    const capRoof = prep(new THREE.ConeGeometry(0.85, 0.55, 4, 1));
    capRoof.rotateY(Math.PI / 4); capRoof.translate(0, H + 1.12, 0);
    roof.push(paint(capRoof, mulc(roofC, 0.9)));
    dark.push(...weathervane(0, H + 1.38, 0));
    const grp = new THREE.Group();
    grp.name = 'barn';
    const barnRed = mat('barnBoards', { map: TX.boards() });
    grp.add(meshOf(boxUV(merge(walls), 0.5), barnRed));
    grp.add(meshOf(merge([...trim, ...cup]), mat('paint', { map: TX.wood() })));
    grp.add(meshOf(merge(stone), mat('stoneWall', { map: TX.stone() })));
    grp.add(meshOf(merge([roofG, ...roof]), mat('shingle', { map: TX.shingle() })));
    grp.add(meshOf(merge(dark), mat('plain', {})));
    grp.userData.radius = Math.hypot(W, D) / 2;
    grp.userData.size = { w: W, d: D, h: H };
    return grp;
  }

  /* split-rail fence along +X starting at x = 0 (geometry cached per length) */
  const fenceCache = {}, gardenCache = {};
  function fence(len) {
    len = Math.max(0.5, Math.round(len * 100) / 100);
    const key = len.toFixed(2);
    if (!fenceCache[key]) fenceCache[key] = buildFence(len);
    return fenceCache[key].clone();
  }
  function buildFence(len) {
    const r = rng(strSeed('fence' + len.toFixed(2)));
    const posts = Math.max(2, Math.round(len / 2.4) + 1), step = len / (posts - 1);
    const gs = [];
    const wcol = () => mixc(L(0x6e5c48), L(0x9a8a74), r());
    for (let i = 0; i < posts; i++) {
      const x = i * step, h = 1.25 + r() * 0.08, c = wcol();
      const g = prep(new THREE.CylinderGeometry(0.075, 0.09, h, 6, 1));
      eachVertex(g, (p) => { if (p.y > h / 2 - 0.01) p.y += (p.x > 0 ? 0.03 : -0.03); });
      place(g, x, h / 2, (r() - 0.5) * 0.03, 0, r() * 3, (r() - 0.5) * 0.04);
      gs.push(paint(g, (px, py, pz) => mulc(c, 0.75 + 0.25 * smooth(0, 0.4, py) + fbm(px * 4, py * 4, pz * 4, 1) * 0.15)));
    }
    for (let i = 0; i < posts - 1; i++) for (const y of [0.45, 0.95]) {
      const x0 = i * step, x1 = (i + 1) * step;
      const c = wcol();
      const pts = [new V3(x0 - 0.12, y + (r() - 0.5) * 0.04, 0.0), new V3((x0 + x1) / 2, y - 0.02 + (r() - 0.5) * 0.03, 0.02), new V3(x1 + 0.12, y + (r() - 0.5) * 0.04, 0)];
      gs.push(tube(pts, (k, t, a) => 0.05 * (1 + 0.25 * Math.cos(a * 3)), { radial: 5, cap: 'both', vLen: 1.5, color: (t, a, p) => mulc(c, 0.8 + 0.2 * Math.sin(a) + fbm(p.x * 3, p.y * 3, 0, 1) * 0.15) }));
    }
    const g = merge(gs);
    const grp = new THREE.Group();
    grp.name = 'fence';
    grp.add(meshOf(g, mat('fenceWood', { map: TX.wood() })));
    return grp;
  }

  /* tilled vegetable garden w x d, rows run along z (geometry cached per size) */
  function garden(w, d) {
    w = Math.max(1.5, Math.round(w * 100) / 100); d = Math.max(1.5, Math.round(d * 100) / 100);
    const key = w.toFixed(2) + 'x' + d.toFixed(2);
    if (!gardenCache[key]) gardenCache[key] = buildGarden(w, d);
    const g = gardenCache[key].clone();
    g.userData = { rows: gardenCache[key].userData.rows.map((q) => Object.assign({}, q)), rowHeight: gardenCache[key].userData.rowHeight };
    return g;
  }
  function buildGarden(w, d) {
    const border = 0.12, inW = w - border * 2, inD = d - border * 2;
    const nRows = Math.max(1, Math.floor(inW / 0.8));
    const pitch = inW / nRows;
    const rows = [];
    const soil = [], wood = [];
    const S = soup();
    const segX = nRows * 6, segZ = Math.max(4, Math.round(inD / 0.4));
    const hAt = (x, z) => {
      const u = (x + inW / 2) / pitch, f = u - Math.floor(u);
      const ridge = Math.pow(Math.sin(f * Math.PI), 1.4);
      const edge = smooth(0, 0.25, z + inD / 2) * smooth(0, 0.25, inD / 2 - z);
      return 0.04 + ridge * 0.14 * edge + fbm(x * 4, 0, z * 4, 2) * 0.012;
    };
    const cAt = (x, z, y) => {
      const n = fbm(x * 3, 1.3, z * 3, 2);
      return mixc(L(0x2e2018), L(0x5a4232), clamp(0.3 + y * 3.2 + n * 0.5, 0, 1));
    };
    for (let i = 0; i < segX; i++) for (let j = 0; j < segZ; j++) {
      const x0 = -inW / 2 + (i / segX) * inW, x1 = -inW / 2 + ((i + 1) / segX) * inW;
      const z0 = -inD / 2 + (j / segZ) * inD, z1 = -inD / 2 + ((j + 1) / segZ) * inD;
      const P = (x, z) => new V3(x, hAt(x, z), z);
      const a = P(x0, z0), b = P(x1, z0), c = P(x1, z1), e = P(x0, z1);
      S.quad(a, e, c, b, cAt(x0, z0, a.y), cAt(x0, z1, e.y), cAt(x1, z1, c.y), cAt(x1, z0, b.y));
    }
    soil.push(boxUV(S.geo(true), 1.2));
    for (let i = 0; i < nRows; i++) rows.push({ x: -inW / 2 + (i + 0.5) * pitch, z0: -inD / 2 + 0.25, z1: inD / 2 - 0.25 });
    // wooden border boards
    const bc = L(0x7a6248);
    wood.push(boxG(w, 0.22, border, 0, 0.11, -d / 2 + border / 2, bc, 1));
    wood.push(boxG(w, 0.22, border, 0, 0.11, d / 2 - border / 2, bc, 1));
    wood.push(boxG(border, 0.22, d - border * 2, -w / 2 + border / 2, 0.11, 0, bc, 1));
    wood.push(boxG(border, 0.22, d - border * 2, w / 2 - border / 2, 0.11, 0, bc, 1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(boxG(0.14, 0.32, 0.14, sx * (w / 2 - 0.07), 0.16, sz * (d / 2 - 0.07), mulc(bc, 0.85), 1));
    const grp = new THREE.Group();
    grp.name = 'garden';
    grp.add(meshOf(merge(soil), mat('soil', { map: TX.soil() }), false, true));
    grp.add(meshOf(merge(wood), mat('fenceWood', { map: TX.wood() })));
    grp.userData.rows = rows;
    grp.userData.rowHeight = 0.18;
    return grp;
  }

  /* ============================================================
     Houses: five New England homes, front door facing +Z
     ============================================================ */
  // vertical wall quads (single sided, facing out) and polygons
  function wallQuadZ(x0, x1, y0, y1, z, out, col) { // wall in the XY plane at z, facing +z (out = 1) or -z (out = -1)
    const S = soup();
    const a = new V3(x0, y0, z), b = new V3(x1, y0, z), c = new V3(x1, y1, z), d = new V3(x0, y1, z);
    if (out > 0) S.quad(a, b, c, d, col); else S.quad(b, a, d, c, col);
    return S.geo(false);
  }
  function wallQuadX(z0, z1, y0, y1, x, out, col) { // wall in the ZY plane at x, facing +x or -x
    const S = soup();
    const a = new V3(x, y0, z1), b = new V3(x, y0, z0), c = new V3(x, y1, z0), d = new V3(x, y1, z1);
    if (out > 0) S.quad(a, b, c, d, col); else S.quad(b, a, d, c, col);
    return S.geo(false);
  }
  // convex polygon walls (fan from the centroid), oriented to face the given direction
  function polyFan(P3, dir, col) {
    const S = soup(), C0 = P3.reduce((acc, p) => acc.add(p), new V3()).multiplyScalar(1 / P3.length);
    const n = new V3().crossVectors(new V3().subVectors(P3[0], C0), new V3().subVectors(P3[1], C0));
    const flip = n.dot(dir) < 0;
    for (let i = 0; i < P3.length; i++) {
      const A = P3[i], B = P3[(i + 1) % P3.length];
      if (flip) S.tri(C0, B, A, col); else S.tri(C0, A, B, col);
    }
    return S.geo(false);
  }
  const polyX = (pts, x, out, col) => polyFan(pts.map(([z, y]) => new V3(x, y, z)), new V3(out, 0, 0), col);
  const polyZ = (pts, z, out, col) => polyFan(pts.map(([x, y]) => new V3(x, y, z)), new V3(0, 0, out), col);
  // a rotated box: from point a to point b (in a vertical plane), thickness t, depth d
  function beam(ax, ay, bx, by, z, t, d, col, axis = 'x') {
    const len = Math.hypot(bx - ax, by - ay), ang = Math.atan2(by - ay, bx - ax);
    const g = prep(new THREE.BoxGeometry(len, t, d));
    g.rotateZ(ang);
    g.translate((ax + bx) / 2, (ay + by) / 2, z);
    if (axis === 'z') g.rotateY(-Math.PI / 2);
    return paint(g, col);
  }
  /* roof with the ridge along x: front eave (z = +D/2) at yf, back eave (z = -D/2) at yb, ridge at z = zr, height yr.
     ox / oz overhangs. Returns shingle top, dark underside and the gable fascia boards. */
  function roofX(W, D, yf, yb, zr, yr, ox, oz, roofC, trimC) {
    const top = soup(), under = soup(), fascia = [];
    const sF = (yr - yf) / (D / 2 - zr), sB = (yr - yb) / (D / 2 + zr);
    const fz = D / 2 + oz, bz = -D / 2 - oz, fy = yf - oz * sF, by = yb - oz * sB;
    const x0 = -W / 2 - ox, x1 = W / 2 + ox, t = 0.1;
    const lenF = Math.hypot(fz - zr, yr - fy), lenB = Math.hypot(zr - bz, yr - by), us = 0.83;
    const cf = mulc(roofC, 1.0), cb = mulc(roofC, 0.92);
    // front slope (faces +z) and back slope (faces -z), uv: u along the ridge, v up the slope
    top.quad(new V3(x0, fy + t, fz), new V3(x1, fy + t, fz), new V3(x1, yr + t, zr), new V3(x0, yr + t, zr), cf, cf, cf, cf, [0, 0], [(x1 - x0) * us, 0], [(x1 - x0) * us, lenF * us], [0, lenF * us]);
    top.quad(new V3(x1, by + t, bz), new V3(x0, by + t, bz), new V3(x0, yr + t, zr), new V3(x1, yr + t, zr), cb, cb, cb, cb, [0, 0], [(x1 - x0) * us, 0], [(x1 - x0) * us, lenB * us], [0, lenB * us]);
    // thickness edges along the eaves
    top.quad(new V3(x0, fy, fz), new V3(x1, fy, fz), new V3(x1, fy + t, fz), new V3(x0, fy + t, fz), trimC);
    top.quad(new V3(x1, by, bz), new V3(x0, by, bz), new V3(x0, by + t, bz), new V3(x1, by + t, bz), trimC);
    const dk = L(0x3a3430);
    under.quad(new V3(x1, fy, fz), new V3(x0, fy, fz), new V3(x0, yr, zr), new V3(x1, yr, zr), dk);
    under.quad(new V3(x0, by, bz), new V3(x1, by, bz), new V3(x1, yr, zr), new V3(x0, yr, zr), dk);
    // gable ends: rake fascia boards and the triangular roof edge
    for (const s of [-1, 1]) {
      const x = s * (W / 2 + ox);
      fascia.push(beam(fz, fy + t * 0.5, zr, yr + t * 0.5, 0, 0.2, 0.06, trimC, 'z').translate(x, 0, 0));
      fascia.push(beam(zr, yr + t * 0.5, bz, by + t * 0.5, 0, 0.2, 0.06, trimC, 'z').translate(x, 0, 0));
    }
    return { top: top.geo(false), under: under.geo(false), fascia, fy, by };
  }
  // hip roof: ridge along x of length W - D at height yr above eave height ye
  function roofHip(W, D, ye, yr, o, roofC, trimC) {
    const top = soup(), under = soup();
    const x0 = -W / 2 - o, x1 = W / 2 + o, z0 = -D / 2 - o, z1 = D / 2 + o;
    const slope = (yr - ye) / (D / 2), yo = ye - o * slope, t = 0.1, us = 0.83;
    const rx = Math.max(0.2, (W - D) / 2);
    const R0 = new V3(-rx, yr + t, 0), R1 = new V3(rx, yr + t, 0);
    const A = new V3(x0, yo + t, z1), B = new V3(x1, yo + t, z1), Cc = new V3(x1, yo + t, z0), Dd = new V3(x0, yo + t, z0);
    const sl = Math.hypot(D / 2 + o, yr - yo) * us, c1 = roofC, c2 = mulc(roofC, 0.93);
    top.quad(A, B, R1, R0, c1, c1, c1, c1, [0, 0], [(x1 - x0) * us, 0], [(rx + x1) * us, sl], [(x1 - rx) * us, sl]);
    top.quad(Cc, Dd, R0, R1, c2, c2, c2, c2, [0, 0], [(x1 - x0) * us, 0], [(rx + x1) * us, sl], [(x1 - rx) * us, sl]);
    top.tri(B, Cc, R1, c2, c2, c2, [0, 0], [(z1 - z0) * us, 0], [(z1 - z0) * 0.5 * us, sl]);
    top.tri(Dd, A, R0, c1, c1, c1, [0, 0], [(z1 - z0) * us, 0], [(z1 - z0) * 0.5 * us, sl]);
    const dk = L(0x3a3430), a2 = A.clone().setY(yo), b2 = B.clone().setY(yo), c3 = Cc.clone().setY(yo), d2 = Dd.clone().setY(yo);
    for (const [p, q] of [[A, B], [B, Cc], [Cc, Dd], [Dd, A]]) top.quad(p.clone().setY(yo), q.clone().setY(yo), q, p, trimC);
    under.quad(b2, a2, d2, c3, dk);
    return { top: top.geo(false), under: under.geo(false), fascia: [] };
  }
  // a window centered at (0, 0) on a wall at z = 0 facing +z; placed with place()
  function windowParts(w, h, o, out) {
    const tc = o.trim, g = [], fr = 0.09;
    const glass = prep(new THREE.BoxGeometry(w, h, 0.04)).translate(0, 0, 0.02);
    paint(glass, (x, y) => mixc(L(0x1c2a36), L(0x4a6a80), smooth(-h / 2, h / 2, y) * 0.6));
    out.glass.push(setGlow(glass, o.glow == null ? 1 : o.glow));
    g.push(boxG(w + fr * 2 + 0.06, fr + 0.03, 0.08, 0, h / 2 + fr / 2 + 0.01, 0.04, tc));
    g.push(boxG(w + fr * 2 + 0.14, 0.06, 0.16, 0, -h / 2 - 0.03, 0.07, tc));
    for (const s of [-1, 1]) g.push(boxG(fr, h, 0.08, s * (w / 2 + fr / 2), 0, 0.04, tc));
    if (o.muntins !== false) {
      g.push(boxG(w, 0.045, 0.05, 0, 0, 0.05, tc));
      for (const s of [-1, 1]) g.push(boxG(0.03, h, 0.045, s * w / 6, 0, 0.05, tc));
    }
    if (o.shutters) for (const s of [-1, 1]) {
      g.push(boxG(w * 0.48, h + 0.06, 0.04, s * (w / 2 + fr + 0.03 + w * 0.24), 0, 0.03, o.shutters));
      for (let k = -2; k <= 2; k++) g.push(boxG(w * 0.38, 0.025, 0.015, s * (w / 2 + fr + 0.03 + w * 0.24), k * h * 0.17, 0.055, mulc(o.shutters, 0.7)));
    }
    if (o.box) {
      g.push(boxG(w + 0.2, 0.2, 0.22, 0, -h / 2 - 0.2, 0.14, o.box));
      const fr2 = rng(Math.round(w * 100 + h * 10));
      for (let k = 0; k < 9; k++) {
        const fx = (k / 8 - 0.5) * w, col = o.flowers[k % o.flowers.length];
        g.push(paint(place(new THREE.IcosahedronGeometry(0.07 + fr2() * 0.03, 0), fx, -h / 2 - 0.05 + fr2() * 0.05, 0.16 + fr2() * 0.06), col));
        g.push(paint(place(new THREE.IcosahedronGeometry(0.08, 0), fx + 0.05, -h / 2 - 0.1, 0.12), L(0x3a6a2a)));
      }
    }
    return g;
  }
  function addWindow(out, x, y, z, w, h, face, o) {
    const ry = face === 'z+' ? 0 : face === 'x+' ? Math.PI / 2 : face === 'x-' ? -Math.PI / 2 : Math.PI;
    const before = out.glass.length;
    const parts = windowParts(w, h, o, out);
    const m = mat4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(1, 1, 1));
    for (const g of parts) { g.applyMatrix4(m); out.trim.push(g); }
    for (let i = before; i < out.glass.length; i++) out.glass[i].applyMatrix4(m);
  }
  // front door panel with its hinge at x = 0 (opens inward with positive rotation.y)
  function doorGeo(w, h, col, o = {}) {
    const g = [];
    g.push(boxG(w, h, 0.06, w / 2, h / 2, 0.0, col, 1));
    const pc = mulc(col, 0.82);
    const pw = w * 0.36, ph = h * 0.3;
    for (const sx of [-1, 1]) for (const yy of [0.25, 0.62]) g.push(boxG(pw, ph, 0.02, w / 2 + sx * w * 0.22, h * yy, 0.035, pc));
    if (o.lite) { const gl = prep(new THREE.BoxGeometry(w * 0.6, h * 0.16, 0.02)).translate(w / 2, h * 0.86, 0.035); g.push(paint(gl, L(0x2a3a48))); }
    g.push(paint(place(new THREE.IcosahedronGeometry(0.035, 1), w - 0.1, h * 0.47, 0.07), L(0xc8a040)));
    g.push(boxG(0.03, 0.12, 0.02, w - 0.1, h * 0.47, 0.04, L(0xc8a040)));
    return merge(g);
  }
  function chimneyGeo(x, z, w, d, y0, y1) {
    const g = [boxG(w, y1 - y0, d, x, (y0 + y1) / 2, z, [1, 1, 1], 0.83)];
    return g;
  }

  const HOUSES = [
    { name: 'cape', W: 8.6, D: 7.2, wallH: 2.75, rise: 3.3, siding: 'clap', wall: 0xf1eee6, trim: 0xfbfaf6, door: 0x9a2a22, shutters: 0x262a2c, roof: 0x4a4b50 },
    { name: 'farmhouse', W: 8.4, D: 7.0, wallH: 4.3, rise: 2.5, siding: 'clap', wall: 0xf0cf6a, trim: 0xfbfaf4, door: 0x2f5a3a, roof: 0x5a4c44 },
    { name: 'cottage', W: 7.0, D: 6.6, wallH: 2.7, rise: 2.7, siding: 'clap', wall: 0x8eb6d6, trim: 0xfbfaf6, door: 0xf0c450, roof: 0x45474c },
    { name: 'brick', W: 8.8, D: 7.2, wallH: 3.1, rise: 2.5, siding: 'brick', wall: 0xffffff, trim: 0xf6f2ea, door: 0x1e2224, shutters: 0x1f2a24, roof: 0x3e4044 },
    { name: 'shingle', W: 8.0, D: 6.8, wallH: 2.7, rise: 2.9, siding: 'shake', wall: 0x9a968e, trim: 0xf8f6f0, door: 0x2c4a7a, roof: 0x4c4a48 },
  ];
  const houseCache = {};
  function buildHouse(v) {
    const S = HOUSES[v], F = 0.45, W = S.W, D = S.D, eave = F + S.wallH;
    const wallC = S.siding === 'brick' ? [1, 1, 1] : L(S.wall), trimC = L(S.trim), roofC = L(S.roof);
    const out = { siding: [], trim: [], roof: [], glass: [], stone: [], brick: [], dark: [] };
    const dw = 1.0, dh = 2.15, doorX = v === 4 ? -1.5 : 0;
    const frontGable = v === 2;
    // stone foundation
    out.stone.push(boxUV(paint(prep(new THREE.BoxGeometry(W + 0.16, F + 0.1, D + 0.16)).translate(0, (F + 0.1) / 2 - 0.1, 0), (x, y, z) => mixc(L(0x8a8580), L(0xaaa59c), fbm(x * 2, y * 2, z * 2, 2) + 0.5)), 1.1));
    // walls: sides, back, front with the door opening
    let yr, roofParts, ybk = eave;
    if (frontGable) {
      yr = eave + S.rise;
      out.siding.push(wallQuadX(-D / 2, D / 2, F, eave, W / 2, 1, wallC), wallQuadX(-D / 2, D / 2, F, eave, -W / 2, -1, wallC));
      out.siding.push(polyZ([[W / 2, F], [-W / 2, F], [-W / 2, eave], [0, yr], [W / 2, eave]], -D / 2, -1, wallC));
      out.siding.push(polyZ([[-W / 2, eave], [W / 2, eave], [0, yr]], D / 2, 1, wallC));
      const rp = roofX(D, W, eave, eave, 0, yr, 0.35, 0.4, roofC, trimC);
      for (const k of ['top', 'under']) rp[k].rotateY(Math.PI / 2);
      for (const f of rp.fascia) f.rotateY(Math.PI / 2);
      roofParts = rp;
    } else {
      let yf = eave, yb = eave, zr = 0;
      yr = eave + S.rise;
      if (v === 4) { zr = 0.9; yb = F + 1.9; ybk = yb; }
      if (v === 3) {
        roofParts = roofHip(W, D, eave, yr, 0.45, roofC, trimC);
      } else {
        roofParts = roofX(W, D, yf, yb, zr, yr, 0.3, 0.38, roofC, trimC);
      }
      const gable = v === 3 ? null : [[D / 2, F], [-D / 2, F], [-D / 2, yb], [zr, yr], [D / 2, yf]];
      for (const s of [-1, 1]) {
        if (gable) out.siding.push(polyX(s > 0 ? gable : gable.map(([z, y]) => [z, y]).reverse(), s * W / 2, s, wallC));
        else out.siding.push(wallQuadX(-D / 2, D / 2, F, eave, s * W / 2, s, wallC));
      }
      out.siding.push(wallQuadZ(-W / 2, W / 2, F, Math.min(yb, eave), -D / 2, -1, wallC));
    }
    const yFront = eave;
    const dl = doorX - dw / 2 - 0.02, dr = doorX + dw / 2 + 0.02, dt = F + dh + 0.02;
    out.siding.push(wallQuadZ(-W / 2, dl, F, yFront, D / 2, 1, wallC), wallQuadZ(dr, W / 2, F, yFront, D / 2, 1, wallC), wallQuadZ(dl, dr, dt, yFront, D / 2, 1, wallC));
    // doorway recess: dark by day, warm light at night when the door is opened
    const rec = prep(new THREE.BoxGeometry(dw + 0.04, dh + 0.02, 0.5)).translate(doorX, F + dh / 2, D / 2 - 0.26);
    rec.scale(1, 1, 1);
    const rn = rec.attributes.normal.array, rp2 = rec.attributes.position.array;
    for (let i = 0; i < rn.length; i++) rn[i] = -rn[i]; // seen from inside the box
    for (let t = 0; t < rp2.length; t += 9) { for (let k = 0; k < 3; k++) { const a = rp2[t + 3 + k]; rp2[t + 3 + k] = rp2[t + 6 + k]; rp2[t + 6 + k] = a; } }
    out.glass.push(setGlow(paint(rec, L(0x2a2018)), 0.8));
    // door casing and cap
    out.trim.push(boxG(0.14, dh + 0.1, 0.1, dl - 0.07, F + dh / 2, D / 2 + 0.05, trimC), boxG(0.14, dh + 0.1, 0.1, dr + 0.07, F + dh / 2, D / 2 + 0.05, trimC));
    out.trim.push(boxG(dw + 0.5, 0.16, 0.14, doorX, dt + 0.08, D / 2 + 0.06, trimC));
    // corner boards, water table, eave frieze
    if (S.siding !== 'brick') {
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) { const ct = sz > 0 ? eave : ybk; out.trim.push(boxG(0.16, ct - F, 0.16, sx * (W / 2 + 0.02), (F + ct) / 2, sz * (D / 2 + 0.02), trimC)); }
    }
    out.trim.push(boxG(W + 0.1, 0.12, 0.06, 0, F + 0.06, D / 2 + 0.03, trimC));
    out.trim.push(boxG(W + 0.1, 0.18, 0.06, 0, yFront - 0.09, D / 2 + 0.03, trimC));
    // steps up to the door
    const steps = 3, sr = F / steps;
    let porchD = 0;
    if (v === 1) {
      // farmhouse: full width porch with posts, rail and a shed roof
      porchD = 2.1;
      const pz = D / 2 + porchD / 2;
      out.trim.push(boxUV(paint(prep(new THREE.BoxGeometry(W + 0.2, 0.12, porchD)).translate(0, F - 0.06, pz), (x, y, z) => mixc(L(0x8a7a66), L(0xa08e78), 0.5 + 0.5 * Math.sin(x * 9))), 1));
      out.stone.push(boxUV(paint(prep(new THREE.BoxGeometry(W + 0.1, F - 0.1, porchD - 0.1)).translate(0, (F - 0.1) / 2, pz), L(0x8a8580)), 1.1));
      const pyTop = F + 2.7, pyFront = F + 2.4;
      for (const px of [-W / 2 + 0.15, -1.1, 1.1, W / 2 - 0.15]) {
        out.trim.push(boxG(0.16, pyFront - F, 0.16, px, (F + pyFront) / 2, D / 2 + porchD - 0.15, trimC));
      }
      for (const [a, b] of [[-W / 2 + 0.15, -1.1], [1.1, W / 2 - 0.15]]) {
        out.trim.push(boxG(b - a, 0.08, 0.08, (a + b) / 2, F + 0.85, D / 2 + porchD - 0.15, trimC), boxG(b - a, 0.06, 0.06, (a + b) / 2, F + 0.12, D / 2 + porchD - 0.15, trimC));
        for (let x = a + 0.16; x < b - 0.08; x += 0.16) out.trim.push(boxG(0.035, 0.7, 0.035, x, F + 0.48, D / 2 + porchD - 0.15, trimC));
      }
      out.trim.push(boxG(W + 0.3, 0.2, 0.14, 0, pyFront + 0.1, D / 2 + porchD - 0.12, trimC));
      const pr = soup(), z0 = D / 2, z1 = D / 2 + porchD + 0.25, x0 = -W / 2 - 0.2, x1 = W / 2 + 0.2, ln = Math.hypot(z1 - z0, pyTop - pyFront) * 0.83;
      pr.quad(new V3(x0, pyFront + 0.2, z1), new V3(x1, pyFront + 0.2, z1), new V3(x1, pyTop + 0.2, z0), new V3(x0, pyTop + 0.2, z0), roofC, roofC, roofC, roofC, [0, 0], [(x1 - x0) * 0.83, 0], [(x1 - x0) * 0.83, ln], [0, ln]);
      pr.quad(new V3(x1, pyFront + 0.2, z1), new V3(x0, pyFront + 0.2, z1), new V3(x0, pyTop + 0.2, z0), new V3(x1, pyTop + 0.2, z0), L(0xe8e2d6));
      out.roof.push(pr.geo(false));
      out.trim.push(boxG(W + 0.4, 0.14, 0.06, 0, pyFront + 0.17, z1, trimC));
      for (let k = 0; k < steps; k++) out.stone.push(boxG(2.0, sr * (k + 1), 0.32, 0, sr * (k + 1) / 2, D / 2 + porchD + 0.16 + (steps - 1 - k) * 0.32, L(0x9a958c), 1.1));
      porchD += steps * 0.32;
    } else {
      for (let k = 0; k < steps; k++) out.stone.push(boxG(dw + 0.8 - k * 0.1, sr * (k + 1), 0.34, doorX, sr * (k + 1) / 2, D / 2 + 0.17 + (steps - 1 - k) * 0.34, L(0x9a958c), 1.1));
      porchD = steps * 0.34;
    }
    // windows
    const wy = F + 1.5, ww = 0.9, wh = 1.4;
    const wo = { trim: trimC, shutters: S.shutters ? L(S.shutters) : null };
    if (v === 2) { wo.box = L(0xf6f4ee); wo.flowers = [L(0xe0405a), L(0xf6d040), L(0xf2f0f0), L(0xd05aa0)]; }
    if (v === 4) { wo.box = L(0xf6f4ee); wo.flowers = [L(0xd8282a), L(0xe84a3a), L(0xf6f0f0)]; }
    const front = v === 4 ? [0.6, 2.6] : v === 2 ? [-1.9, 1.9] : [-3.0, -1.55, 1.55, 3.0];
    for (const x of front) addWindow(out, x, wy, D / 2, v === 4 && x === 0.6 ? 1.3 : ww, wh, 'z+', wo);
    for (const s of [-1, 1]) {
      for (const z of [-1.5, 1.5]) addWindow(out, s * W / 2, wy, z, ww, wh, s > 0 ? 'x+' : 'x-', Object.assign({}, wo, { box: null }));
      if (v !== 3 && v !== 2) addWindow(out, s * W / 2, Math.min(eave, F + 2.7) + (v === 1 ? 0.6 : 1.0), v === 4 ? 0.3 : 0, 0.75, 0.95, s > 0 ? 'x+' : 'x-', { trim: trimC });
    }
    for (const x of [-2.2, 2.2]) addWindow(out, x, v === 4 ? F + 0.95 : wy, -D / 2, ww, v === 4 ? 0.9 : wh, 'z-', { trim: trimC });
    if (v === 1) for (const x of [-2.6, 0, 2.6]) addWindow(out, x, F + 3.35, D / 2, 0.8, 0.95, 'z+', { trim: trimC });
    if (v === 2) addWindow(out, 0, eave + 0.9, D / 2, 0.7, 0.7, 'z+', { trim: trimC, muntins: false });
    if (v === 3) {
      // transom light over the front door, pilasters and a small pediment (kept under the eave)
      const tr = prep(new THREE.BoxGeometry(dw, 0.28, 0.04)).translate(doorX, dt + 0.17, D / 2 + 0.0);
      out.glass.push(setGlow(paint(tr, L(0x2a3a48)), 1));
      out.trim.push(boxG(dw + 0.1, 0.05, 0.08, doorX, dt + 0.17, D / 2 + 0.03, trimC));
      out.trim.push(boxG(1.6, 0.12, 0.2, doorX, dt + 0.4, D / 2 + 0.1, trimC));
      out.trim.push(beam(doorX - 0.85, dt + 0.45, doorX, dt + 0.75, D / 2 + 0.1, 0.1, 0.2, trimC), beam(doorX, dt + 0.75, doorX + 0.85, dt + 0.45, D / 2 + 0.1, 0.1, 0.2, trimC));
      out.siding.push(polyZ([[doorX - 0.75, dt + 0.46], [doorX + 0.75, dt + 0.46], [doorX, dt + 0.7]], D / 2 + 0.15, 1, trimC));
      for (const s of [-1, 1]) out.trim.push(boxG(0.18, dh + 0.4, 0.12, doorX + s * 0.72, F + (dh + 0.4) / 2, D / 2 + 0.06, trimC));
    }
    // dormers on the cape
    if (v === 0) {
      const sF = S.rise / (D / 2);
      for (const x of [-2.0, 2.0]) {
        const zf = D / 2 - 0.9, yb0 = eave + (D / 2 - zf) * sF - 0.05, dW = 1.4, dH = 1.45;
        out.siding.push(boxUV(paint(prep(new THREE.BoxGeometry(dW, dH, 2.4)).translate(x, yb0 + dH / 2, zf - 1.2), wallC), 0.96));
        addWindow(out, x, yb0 + 0.72, zf, 0.7, 0.95, 'z+', { trim: trimC });
        const dr = roofX(2.6, dW, yb0 + dH, yb0 + dH, 0, yb0 + dH + 0.6, 0.12, 0.15, roofC, trimC);
        for (const k of ['top', 'under']) { dr[k].rotateY(Math.PI / 2); dr[k].translate(x, 0, zf - 1.3 + 0.12); }
        out.roof.push(dr.top); out.dark.push(dr.under);
        for (const f of dr.fascia) { f.rotateY(Math.PI / 2); f.translate(x, 0, zf - 1.3 + 0.12); out.trim.push(f); }
        out.siding.push(polyZ([[x - dW / 2, yb0 + dH], [x + dW / 2, yb0 + dH], [x, yb0 + dH + 0.6]], zf + 0.001, 1, wallC));
      }
    }
    // hoods over the cottage and shingle doors, and a lantern
    if (v === 2 || v === 4) {
      const hz = D / 2, hy = dt + 0.25;
      const hr = roofX(0.9, 1.6, hy, hy, 0, hy + 0.55, 0.05, 0.05, roofC, trimC);
      for (const k of ['top', 'under']) { hr[k].rotateY(Math.PI / 2); hr[k].translate(doorX, 0, hz + 0.45); }
      out.roof.push(hr.top); out.dark.push(hr.under);
      for (const f of hr.fascia) { f.rotateY(Math.PI / 2); f.translate(doorX, 0, hz + 0.45); out.trim.push(f); }
      out.siding.push(polyZ([[doorX - 0.8, hy], [doorX + 0.8, hy], [doorX, hy + 0.55]], hz + 0.9, 1, trimC));
      for (const s of [-1, 1]) out.trim.push(beam(hz + 0.04, hy - 0.5, hz + 0.62, hy - 0.03, 0, 0.08, 0.08, trimC, 'z').translate(doorX + s * 0.7, 0, 0));
      const lx = doorX + dw / 2 + 0.38;
      const lan = prep(new THREE.BoxGeometry(0.16, 0.24, 0.16)).translate(lx, F + 1.75, D / 2 + 0.12);
      out.glass.push(setGlow(paint(lan, L(0xd8c890)), 1.4));
      out.dark.push(boxG(0.2, 0.06, 0.2, lx, F + 1.9, D / 2 + 0.12, L(0x1e1e1e)), boxG(0.04, 0.1, 0.12, lx, F + 1.75, D / 2 + 0.03, L(0x1e1e1e)));
    }
    // chimneys
    const chim = [];
    if (v === 0 || v === 4) chim.push([0.3, v === 4 ? 0.9 : -0.2, yr + 0.9]);
    if (v === 1) chim.push([2.8, 0, yr + 0.9]);
    if (v === 3) chim.push([-(W / 2 - 0.7), 0, yr + 0.5], [W / 2 - 0.7, 0, yr + 0.5]);
    for (const [x, z, top] of chim) {
      out.brick.push(...chimneyGeo(x, z, 0.75, 0.7, eave, top));
      out.stone.push(boxG(0.9, 0.12, 0.85, x, top + 0.06, z, L(0x8a8680), 1));
    }
    if (v === 2) {
      // exterior chimney up the side wall
      out.brick.push(...chimneyGeo(W / 2 + 0.38, -0.8, 0.7, 0.75, 0, yr - 0.3));
      out.brick.push(...chimneyGeo(W / 2 + 0.38, -0.8, 0.55, 0.55, yr - 0.3, yr + 0.5));
    }
    const grp = new THREE.Group();
    grp.name = 'house-' + S.name;
    const sidingMat = S.siding === 'brick' ? mat('brickWall', { map: TX.brick() }) : S.siding === 'shake' ? mat('shakeWall', { map: TX.shingle() }) : mat('clapboard', { map: TX.clapboard() });
    const us = S.siding === 'brick' ? 0.83 : S.siding === 'shake' ? 0.75 : 0.96;
    const sidingG = boxUV(merge([...out.siding, ...(S.siding === 'brick' ? out.brick : [])]), us);
    grp.add(meshOf(sidingG, sidingMat));
    grp.add(meshOf(merge([...out.trim, ...roofParts.fascia, ...out.dark, roofParts.under]), mat('paint', { map: TX.wood() })));
    grp.add(meshOf(merge([roofParts.top, ...out.roof]), mat('shingle', { map: TX.shingle() })));
    grp.add(meshOf(merge(out.glass), mat('windowGlow', { emissive: 0xffbb66, glow: 'night' }), false, false));
    grp.add(meshOf(merge(out.stone), mat('stoneWall', { map: TX.stone() })));
    if (S.siding !== 'brick' && out.brick.length) grp.add(meshOf(boxUV(merge(out.brick), 0.83), mat('brickWall', { map: TX.brick() })));
    const door = new THREE.Mesh(doorGeo(dw, dh, L(S.door), { lite: v !== 3 }), mat('paint', { map: TX.wood() }));
    door.name = 'door';
    door.position.set(doorX - dw / 2, F, D / 2 + 0.01);
    door.castShadow = true; door.receiveShadow = true;
    grp.add(door);
    grp.userData = { w: W, d: D, h: yr + 0.9, hw: W / 2 + 0.1, hd: D / 2 + 0.1, outside: { x: doorX, z: D / 2 + porchD + 1.2 }, floorY: F, variant: v, name: S.name, porchD };
    return grp;
  }
  function house(variant = 0) {
    const v = ((Math.floor(variant) % 5) + 5) % 5;
    if (!houseCache[v]) houseCache[v] = buildHouse(v);
    const src = houseCache[v], g = src.clone();
    g.userData = JSON.parse(JSON.stringify(src.userData));
    g.userData.door = g.getObjectByName('door');
    return g;
  }

  /* ============================================================
     Interiors: one cozy open room per house style (no ceiling)
     ============================================================ */
  // box with rounded (beveled) edges and smooth shading, for cushions and soft furniture
  function roundBox(w, h, d, rad, col) {
    const g = prep(new THREE.BoxGeometry(w, h, d, 2, 2, 2));
    const hx = w / 2 - rad, hy = h / 2 - rad, hz = d / 2 - rad;
    eachVertex(g, (p) => {
      const q = new V3(clamp(p.x, -hx, hx), clamp(p.y, -hy, hy), clamp(p.z, -hz, hz));
      const n = new V3().subVectors(p, q);
      if (n.lengthSq() > 1e-9) p.copy(q.add(n.normalize().multiplyScalar(rad)));
    });
    smoothNormals(g);
    return col ? paint(g, col) : g;
  }
  // paint per triangle (crisp patches) from the triangle centroid
  function paintTris(geo, fn) {
    const g = prep(geo), p = g.attributes.position.array, c = g.attributes.color.array;
    for (let t = 0; t < p.length; t += 9) {
      const col = fn((p[t] + p[t + 3] + p[t + 6]) / 3, (p[t + 1] + p[t + 4] + p[t + 7]) / 3, (p[t + 2] + p[t + 5] + p[t + 8]) / 3);
      for (let k = 0; k < 3; k++) { c[t + k * 3] = col[0]; c[t + k * 3 + 1] = col[1]; c[t + k * 3 + 2] = col[2]; }
    }
    return g;
  }
  function lathe(pts, seg, col) {
    const g = prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
    smoothNormals(g);
    return col ? paint(g, col) : g;
  }
  const at = (g, x, y, z, ry = 0) => place(g, x, y, z, 0, ry, 0);
  const IP = [
    { floor: 'planks', floorC: 0xc08a50, wallTex: 'plaster', wallC: 0xf1e6cf, wains: null, trim: 0xf8f6f0, wood: 0x8a4a2a, sofa: 0xa83a32, chair: 0x2e4a72, pillow: 0xe8d8a8, quilt: [0xa83a32, 0x2e4a72, 0xf0e6cc, 0xc8963a], rug: [0xa83a32, 0x2e4a72, 0xe8dcc0, 0xc8963a], masonry: 'stone', masonryC: 0xd0c8bc, petBed: 0x7a4a8a },
    { floor: 'planks', floorC: 0xd4a464, wallTex: 'plaster', wallC: 0xb4c49c, wains: 0xf6f2e6, trim: 0xf6f2e6, wood: 0xa8743c, sofa: 0xc89a3a, chair: 0x5a7a4a, pillow: 0xf2ecd8, quilt: [0xe8c050, 0x6a8a4a, 0xf6f0e0, 0xc06a3a], rug: [0x6a8a4a, 0xd8b050, 0xf0e8d0, 0x9a5a3a], masonry: 'brick', masonryC: 0xffffff, petBed: 0xb84a3a },
    { floor: 'tile', floorC: 0xf0f2f4, wallTex: 'wallpaper', wallC: 0xbcd6ea, wains: 0xf6f6f2, trim: 0xf8f8f4, wood: 0xeeeae2, sofa: 0xe8a2aa, chair: 0x4a9a98, pillow: 0xf8f0d8, quilt: [0xe8a2aa, 0x8ac6c4, 0xf8f4ec, 0xf2d070], rug: [0xe8a2aa, 0x8ac6c4, 0xf8f4ec, 0xb8a0d0], masonry: 'stone', masonryC: 0xf4f2ee, petBed: 0x4a7ac0 },
    { floor: 'planks', floorC: 0x7a4e30, wallTex: 'wallpaper', wallC: 0xf0e2c2, wains: 0x6a3e26, trim: 0xf4eee0, wood: 0x5e3a24, sofa: 0x2e5a3e, chair: 0x7a2a2e, pillow: 0xd8b860, quilt: [0x7a2a2e, 0xd8b860, 0x2e5a3e, 0xf2e6cc], rug: [0x7a2a2e, 0x2e4a5a, 0xd8b860, 0xe8dcc0], masonry: 'brick', masonryC: 0xffffff, petBed: 0x3a6a4a },
    { floor: 'planks', floorC: 0xbab2a6, wallTex: 'plaster', wallC: 0xf6f4f0, wains: 0x9cb2c2, trim: 0xfbfaf8, wood: 0x9a8e7e, sofa: 0x2a3e62, chair: 0xd8c8a0, pillow: 0xe8743a, quilt: [0x2a3e62, 0xf6f4f0, 0x8ab0c8, 0xe8743a], rug: [0x2a3e62, 0xf0ece4, 0x8ab0c8, 0xc8b890], masonry: 'stone', masonryC: 0xc8c2b8, petBed: 0xe8743a },
  ];
  const ROOM = { W: 8, D: 6, H: 2.7, T: 0.16 };
  /* shared furniture pieces; B is the bucket set { wood, fabric, masonry, ceramic, plant, glass, lamp, fire, pic, floor, wall } */
  function sofaGeo(B, w, col, pillowC, wood) {
    B.fabric.push(roundBox(w, 0.34, 0.86, 0.05, col).translate(0, 0.27, 0));
    const n = w > 1.4 ? 3 : 1, cw = (w - 0.36) / n;
    for (let i = 0; i < n; i++) {
      B.fabric.push(roundBox(cw - 0.02, 0.14, 0.62, 0.05, mulc(col, 1.06)).translate(-w / 2 + 0.18 + cw * (i + 0.5), 0.5, -0.06));
      B.fabric.push(roundBox(cw - 0.02, 0.46, 0.18, 0.07, mulc(col, 1.03)).translate(-w / 2 + 0.18 + cw * (i + 0.5), 0.74, 0.3).rotateX(0));
    }
    for (const s of [-1, 1]) B.fabric.push(roundBox(0.2, 0.64, 0.86, 0.08, mulc(col, 0.95)).translate(s * (w / 2 - 0.1), 0.42, 0));
    B.fabric.push(roundBox(w - 0.1, 0.5, 0.16, 0.06, mulc(col, 0.92)).translate(0, 0.72, 0.36));
    if (pillowC) for (const s of [-1, 1]) B.fabric.push(roundBox(0.38, 0.38, 0.12, 0.05, pillowC).rotateX(0.25).rotateZ(s * 0.15).translate(s * (w / 2 - 0.42), 0.78, 0.2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.wood.push(boxG(0.06, 0.1, 0.06, sx * (w / 2 - 0.08), 0.05, sz * 0.36, wood));
  }
  function tableGeo(B, w, d, h, wood) {
    B.wood.push(boxG(w, 0.05, d, 0, h - 0.025, 0, wood, 2));
    B.wood.push(boxG(w - 0.12, 0.08, d - 0.12, 0, h - 0.09, 0, mulc(wood, 0.9), 2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.wood.push(boxG(0.06, h - 0.05, 0.06, sx * (w / 2 - 0.07), (h - 0.05) / 2, sz * (d / 2 - 0.07), wood, 2));
  }
  function chairGeo(B, wood, cushion) {
    tableGeo(B, 0.44, 0.44, 0.46, wood);
    for (const s of [-1, 1]) B.wood.push(boxG(0.05, 0.5, 0.05, s * 0.19, 0.7, 0.19, wood));
    B.wood.push(boxG(0.44, 0.08, 0.04, 0, 0.92, 0.19, wood));
    for (const s of [-1, 0, 1]) B.wood.push(boxG(0.04, 0.4, 0.025, s * 0.09, 0.68, 0.19, wood));
    if (cushion) B.fabric.push(roundBox(0.4, 0.05, 0.4, 0.02, cushion).translate(0, 0.485, 0));
  }
  function bookshelfGeo(B, w, h, d, wood, r) {
    for (const s of [-1, 1]) B.wood.push(boxG(0.04, h, d, s * (w / 2 - 0.02), h / 2, 0, wood, 2));
    B.wood.push(boxG(w, 0.04, d, 0, h - 0.02, 0, wood, 2), boxG(w, 0.02, 0.02, 0, h / 2, -d / 2 + 0.01, wood));
    B.wood.push(boxG(w - 0.06, h - 0.04, 0.02, 0, h / 2, -d / 2 + 0.01, mulc(wood, 0.8), 2));
    const shelves = 5, sh = (h - 0.12) / shelves;
    const bc = [0xa83232, 0x2e5a8a, 0x3a7a4a, 0xd8a83a, 0x6a3a7a, 0xe8dcc0, 0x2a2a2a, 0xc8642a, 0x4a8aa0];
    for (let i = 0; i <= shelves; i++) B.wood.push(boxG(w - 0.08, 0.025, d - 0.02, 0, 0.08 + i * sh, 0.01, wood, 2));
    for (let i = 0; i < shelves; i++) {
      const y0 = 0.09 + i * sh + 0.01;
      if (i === 2) {
        B.ceramic.push(lathe([[0, 0], [0.06, 0], [0.07, 0.08], [0.05, 0.16], [0.03, 0.2], [0, 0.2]], 8, L(0x4a7aa0)).translate(-w / 4, y0, 0));
        B.wood.push(boxG(0.18, 0.12, 0.14, w / 5, y0 + 0.06, 0.02, L(0x8a6a4a)));
        continue;
      }
      let x = -w / 2 + 0.07;
      while (x < w / 2 - 0.12) {
        const bw = 0.025 + r() * 0.035, bh = Math.min(sh - 0.04, 0.17 + r() * 0.1);
        const col = L(bc[Math.floor(r() * bc.length)]);
        const lean = x > w / 2 - 0.25 && r() < 0.5;
        const g = boxG(bw, bh, d * 0.7, 0, bh / 2, 0, col);
        if (lean) { g.translate(0, -bh / 2, 0); g.rotateZ(-0.25); g.translate(0, bh / 2, 0); }
        g.translate(x + bw / 2, y0, 0.02);
        B.wood.push(g);
        B.wood.push(boxG(bw * 0.9, 0.012, d * 0.71, x + bw / 2, y0 + bh * 0.82, 0.02, mulc(L(0xd8b860), 0.9)));
        x += bw + 0.004 + (r() < 0.08 ? 0.08 : 0);
      }
    }
  }
  function fireplaceGeo(B, pal, nightLight) {
    // chimney breast with a firebox opening, built at the origin facing +z (front face at z = 0.45)
    const mc = L(pal.masonryC), w = 1.7, dpt = 0.45, ow = 0.84, oh = 0.72, H = ROOM.H;
    B.masonry.push(boxG((w - ow) / 2, H, dpt, -(w + ow) / 4, H / 2, dpt / 2, mc, 1.2), boxG((w - ow) / 2, H, dpt, (w + ow) / 4, H / 2, dpt / 2, mc, 1.2));
    B.masonry.push(boxG(ow, H - oh, dpt, 0, oh + (H - oh) / 2, dpt / 2, mc, 1.2));
    B.wood.push(boxG(ow + 0.02, oh, 0.04, 0, oh / 2, 0.02, L(0x1a1410)));
    B.wood.push(boxG(ow, 0.04, dpt - 0.04, 0, 0.02, dpt / 2, L(0x2a2420)));
    for (const s of [-1, 1]) B.wood.push(boxG(0.04, oh, dpt - 0.04, s * (ow / 2 - 0.02), oh / 2, dpt / 2, L(0x2a2018)));
    B.wood.push(boxG(ow, 0.04, dpt - 0.04, 0, oh - 0.02, dpt / 2, L(0x2a2018)));
    // hearth and mantel
    B.masonry.push(boxG(w + 0.3, 0.08, 0.6, 0, 0.04, dpt + 0.3, mulc(mc, 0.92), 1.2));
    B.wood.push(boxG(w + 0.2, 0.08, 0.3, 0, 1.32, dpt + 0.1, L(pal.wood), 2));
    B.wood.push(boxG(w + 0.1, 0.14, 0.05, 0, 1.24, dpt + 0.02, mulc(L(pal.wood), 0.9), 2));
    // logs and andirons
    const lc = L(0x5a3e28);
    for (const [x, z, a] of [[-0.12, 0.22, 0.25], [0.12, 0.26, -0.3], [0, 0.18, 0]]) {
      const g = prep(new THREE.CylinderGeometry(0.06, 0.06, 0.55, 6)).rotateZ(Math.PI / 2).rotateY(a);
      B.wood.push(paint(g.translate(x * 0.3, x === 0 ? 0.17 : 0.09, z), (px, py) => mixc(lc, L(0x2a1a10), smooth(0.05, 0.2, py))));
    }
    // flames: three crossed planes drawn additively, plus glowing embers
    for (let k = 0; k < 3; k++) {
      const pl = prep(new THREE.PlaneGeometry(0.62, 0.55, 1, 3)).translate(0, 0.33, 0).rotateY(k * Math.PI / 3);
      pl.translate(0, 0.02, 0.22);
      B.fire.push(setGlow(paint(pl, [1, 1, 1]), 1));
    }
    const em = prep(new THREE.PlaneGeometry(0.6, 0.25)).rotateX(-Math.PI / 2).translate(0, 0.045, 0.22);
    B.fire.push(setGlow(paint(em, L(0xff7a2a)), 0.8));
    // things on the mantel
    B.ceramic.push(lathe([[0, 0], [0.05, 0], [0.06, 0.05], [0.04, 0.18], [0.05, 0.22], [0, 0.22]], 8, L(0xe8e2d4)).translate(-0.6, 1.36, dpt + 0.1));
    B.ceramic.push(lathe([[0, 0], [0.035, 0], [0.025, 0.02], [0.015, 0.2], [0.025, 0.22], [0, 0.22]], 6, L(0xc8a040)).translate(0.55, 1.36, dpt + 0.1));
    B.ceramic.push(lathe([[0, 0], [0.035, 0], [0.025, 0.02], [0.015, 0.2], [0.025, 0.22], [0, 0.22]], 6, L(0xc8a040)).translate(0.72, 1.36, dpt + 0.1));
    B.wood.push(boxG(0.24, 0.3, 0.1, 0, 1.51, dpt + 0.08, L(pal.wood)));
    B.ceramic.push(prep(new THREE.CircleGeometry(0.08, 12)).translate(0, 1.54, dpt + 0.131));
    paint(B.ceramic[B.ceramic.length - 1], L(0xf6f0e0));
  }
  function plantGeo(B, size, r, leafC) {
    const pot = lathe([[0, 0], [0.14, 0], [0.18, 0.26], [0.2, 0.3], [0.19, 0.32], [0, 0.3]], 10, L(0xb8603a));
    B.ceramic.push(pot.scale(size, size, size));
    const S = soup(), n = 9;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5, h = (0.3 + r() * 0.5) * size;
      const base = new V3(0, 0.3 * size, 0), top = new V3(Math.cos(a) * 0.15 * size, 0.3 * size + h, Math.sin(a) * 0.15 * size);
      B.plant.push(tube([base, top], 0.008 * size, { radial: 3, color: () => L(0x3a6a2a) }));
      leafStrip(S, top, new V3(Math.cos(a), 0, Math.sin(a)), (0.32 + r() * 0.15) * size, (t) => Math.pow(Math.sin(Math.min(1, t * 1.05) * Math.PI), 0.7) * 0.3, r, {
        seg: 4, lift: 0.6, droop: 1.6, fold: 0.3, vein: 0.08,
        color: (t, e) => (e === 0 ? mixc(L(0x8ab85a), leafC, 0.4) : mixc(leafC, mulc(leafC, 0.6), e === 1 ? 0.6 : 0.2)),
      });
    }
    B.plant.push(upNormals(S.geo(false), 0.35));
  }
  function lampShade(B, x, y, z, r0, r1, h) {
    const g = lathe([[r1, 0], [r0, h], [r0 - 0.005, h], [r1 - 0.005, 0]], 12, L(0xf2e6c8));
    B.lamp.push(setGlow(g.translate(x, y, z), 1));
  }
  function pictureGeo(B, x, y, z, ry, w, h, cell, wood) {
    const g = [];
    const fw = 0.05;
    g.push(boxG(w + fw * 2, fw, 0.04, 0, h / 2 + fw / 2, 0.02, wood), boxG(w + fw * 2, fw, 0.04, 0, -h / 2 - fw / 2, 0.02, wood));
    g.push(boxG(fw, h, 0.04, -w / 2 - fw / 2, 0, 0.02, wood), boxG(fw, h, 0.04, w / 2 + fw / 2, 0, 0.02, wood));
    const pl = prep(new THREE.PlaneGeometry(w, h)).translate(0, 0, 0.012);
    const uv = pl.attributes.uv.array, cx = (cell % 2) * 0.5, cy = cell < 2 ? 0.5 : 0;
    for (let i = 0; i < uv.length; i += 2) { uv[i] = cx + 0.02 + uv[i] * 0.46; uv[i + 1] = cy + 0.02 + uv[i + 1] * 0.46; }
    paint(pl, [1, 1, 1]);
    const m = mat4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(1, 1, 1));
    for (const q of g) { q.applyMatrix4(m); B.wood.push(q); }
    pl.applyMatrix4(m); B.pic.push(pl);
  }
  // window seen from inside: bright sky glass by day, dark blue at night
  function inWindow(B, x, y, z, ry, w, h, trimC, curtainC) {
    const parts = [], m = mat4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)), new V3(1, 1, 1));
    const gl = prep(new THREE.PlaneGeometry(w, h)).translate(0, 0, 0.005);
    paint(gl, (px, py) => mixc(L(0x2a3a5a), L(0x5a6a8a), smooth(-h / 2, h / 2, py)));
    gl.applyMatrix4(m); B.glass.push(setGlow(gl, 1));
    const fr = 0.08;
    parts.push(boxG(w + fr * 2, fr, 0.06, 0, h / 2 + fr / 2, 0.03, trimC), boxG(w + fr * 2 + 0.1, 0.05, 0.16, 0, -h / 2 - 0.025, 0.08, trimC));
    for (const s of [-1, 1]) parts.push(boxG(fr, h, 0.06, s * (w / 2 + fr / 2), 0, 0.03, trimC));
    parts.push(boxG(w, 0.04, 0.03, 0, 0, 0.02, trimC), boxG(0.03, h, 0.03, 0, 0, 0.02, trimC));
    if (curtainC) {
      parts.push(boxG(w + 0.7, 0.03, 0.03, 0, h / 2 + 0.22, 0.12, L(0x8a6a3a)));
      for (const s of [-1, 1]) {
        const c = prep(new THREE.BoxGeometry(0.34, h + 0.45, 0.05, 4, 1, 1));
        eachVertex(c, (p) => { p.z += Math.sin(p.x * 28 + s) * 0.025; });
        c.translate(s * (w / 2 + 0.16), -0.02, 0.1);
        smoothNormals(c);
        paint(c, curtainC);
        c.applyMatrix4(m); B.fabric.push(c);
      }
    }
    for (const q of parts) { q.applyMatrix4(m); B.wood.push(q); }
  }
  function rugGeo(B, rx, rz, cols) {
    // braided oval rug: concentric rings
    const rings = 9, seg = 28, S = soup();
    for (let k = 0; k < rings; k++) {
      const r0 = k / rings, r1 = (k + 1) / rings, col = L(cols[k % cols.length]);
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU;
        const P = (rr, a) => new V3(Math.cos(a) * rx * rr, 0.012, Math.sin(a) * rz * rr);
        const c0 = mulc(col, 0.92 + 0.08 * Math.sin(i * 2.0 + k)), c1 = mulc(col, 0.92 + 0.08 * Math.sin(i * 2.0 + 1 + k));
        S.quad(P(r0, a0), P(r0, a1), P(r1, a1), P(r1, a0), c0, c1, c1, c0);
      }
    }
    const g = S.geo(false);
    const n = g.attributes.normal.array;
    for (let i = 0; i < n.length; i += 3) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
    B.fabric.push(boxUV(g, 6));
  }
  function petCorner(B, x, z, bedC) {
    const ring = prep(new THREE.TorusGeometry(0.36, 0.12, 6, 16));
    ring.rotateX(Math.PI / 2); ring.scale(1, 0.85, 1); ring.translate(x, 0.1, z);
    B.fabric.push(paint(ring, L(bedC)));
    const cush = roundBox(0.62, 0.09, 0.62, 0.04, L(0xf0e6d0));
    eachVertex(cush, (p) => { const d = Math.hypot(p.x, p.z); if (d > 0.3) { p.x *= 0.3 / d; p.z *= 0.3 / d; } });
    smoothNormals(cush);
    B.fabric.push(cush.translate(x, 0.07, z));
    // little bone print on the cushion edge
    B.fabric.push(boxG(0.12, 0.012, 0.03, x, 0.12, z + 0.12, L(0xd8c8a8)));
  }
  function bowlsGeo(B, bx, bz, wx, wz) {
    const prof = [[0, 0], [0.11, 0], [0.13, 0.015], [0.13, 0.07], [0.115, 0.075], [0.1, 0.03], [0, 0.03]];
    B.ceramic.push(lathe(prof, 14, L(0xd8483a)).translate(bx, 0, bz));
    B.ceramic.push(lathe(prof, 14, L(0x3a7ac0)).translate(wx, 0, wz));
    const r = rng(4242);
    for (let i = 0; i < 14; i++) { const a = r() * TAU, d = r() * 0.08; B.ceramic.push(paint(place(new THREE.IcosahedronGeometry(0.018, 0), bx + Math.cos(a) * d, 0.05 + r() * 0.015, bz + Math.sin(a) * d), L(0x8a5a2a))); }
    const water = prep(new THREE.CircleGeometry(0.105, 14)).rotateX(-Math.PI / 2).translate(wx, 0.058, wz);
    B.ceramic.push(paint(water, L(0x6aa8d8)));
    B.fabric.push(roundBox(0.75, 0.012, 0.38, 0.005, L(0x5a8a5a)).translate((bx + wx) / 2, 0.006, (bz + wz) / 2));
  }
  function ballGeo() {
    const g = prep(new THREE.IcosahedronGeometry(0.09, 2));
    smoothNormals(g);
    return paint(g, (x, y) => (Math.abs(y) < 0.022 ? L(0xf2d040) : L(0xd8362a)));
  }

  // mirror a non-indexed geometry across x = 0 (keeps triangles front facing)
  function mirrorX(g) {
    const p = g.attributes.position.array, n = g.attributes.normal.array;
    for (let i = 0; i < p.length; i += 3) { p[i] = -p[i]; n[i] = -n[i]; }
    for (const name in g.attributes) {
      const a = g.attributes[name], s = a.itemSize, arr = a.array;
      for (let t = 0; t + 3 * s <= arr.length; t += 3 * s) for (let k = 0; k < s; k++) { const tmp = arr[t + s + k]; arr[t + s + k] = arr[t + 2 * s + k]; arr[t + 2 * s + k] = tmp; }
      a.needsUpdate = true;
    }
    return g;
  }
  // build into a temporary bucket set, then rotate / move everything into B
  function sub(B, fn, x, z, ry = 0) {
    const t = {};
    for (const k in B) if (Array.isArray(B[k])) t[k] = [];
    fn(t);
    for (const k in t) for (const g of t[k]) { if (ry) g.rotateY(ry); B[k].push(g.translate(x, 0, z)); }
  }
  const interiorCache = {};
  function buildInterior(v) {
    const pal = IP[v], r = rng(4600 + v);
    const B = { wood: [], fabric: [], masonry: [], ceramic: [], plant: [], glass: [], lamp: [], fire: [], pic: [], floor: [], wall: [] };
    const { W, D, H, T } = ROOM, hw = W / 2, hd = D / 2;
    const trimC = L(pal.trim), wood = L(pal.wood), wallC = L(pal.wallC);
    const doorX = 1.4, dw = 1.0, dh = 2.1, mir = v % 2 === 1 ? -1 : 1;
    // floor
    const fl = prep(new THREE.BoxGeometry(W + T * 2, 0.1, D + T * 2)).translate(0, -0.05, 0);
    B.floor.push(boxUV(paint(fl, L(pal.floorC)), pal.floor === 'tile' ? 1.6 : 0.75));
    // walls (boxes outside the room so the inner faces sit on the room edges)
    B.wall.push(boxG(W + T * 2, H, T, 0, H / 2, -hd - T / 2, wallC, 1.3), boxG(T, H, D, -hw - T / 2, H / 2, 0, wallC, 1.3), boxG(T, H, D, hw + T / 2, H / 2, 0, wallC, 1.3));
    B.wall.push(boxG(doorX - dw / 2 + hw + T, H, T, (-hw - T + doorX - dw / 2) / 2, H / 2, hd + T / 2, wallC, 1.3));
    B.wall.push(boxG(hw + T - (doorX + dw / 2), H, T, (doorX + dw / 2 + hw + T) / 2, H / 2, hd + T / 2, wallC, 1.3));
    B.wall.push(boxG(dw, H - dh, T, doorX, dh + (H - dh) / 2, hd + T / 2, wallC, 1.3));
    // daylight beyond the door
    const out = prep(new THREE.PlaneGeometry(dw, dh)).rotateY(Math.PI).translate(doorX, dh / 2, hd + T + 0.02);
    B.glass.push(setGlow(paint(out, L(0x6a7a6a)), 1));
    // wall caps, baseboards, wainscot
    const capC = mulc(trimC, 0.95);
    B.wood.push(boxG(W + T * 2 + 0.04, 0.04, T + 0.04, 0, H + 0.02, -hd - T / 2, capC), boxG(T + 0.04, 0.04, D + T * 2, -hw - T / 2, H + 0.02, 0, capC), boxG(T + 0.04, 0.04, D + T * 2, hw + T / 2, H + 0.02, 0, capC));
    B.wood.push(boxG(doorX - dw / 2 + hw + T, 0.04, T + 0.04, (-hw - T + doorX - dw / 2) / 2, H + 0.02, hd + T / 2, capC), boxG(hw + T - (doorX - dw / 2), 0.04, T + 0.04, (doorX - dw / 2 + hw + T) / 2, H + 0.02, hd + T / 2, capC));
    const base = (x0, x1, z0, z1, h, dpt, col) => {
      if (Math.abs(z1 - z0) < 1e-3) B.wood.push(boxG(x1 - x0, h, dpt, (x0 + x1) / 2, h / 2, z0, col));
      else B.wood.push(boxG(dpt, h, z1 - z0, x0, h / 2, (z0 + z1) / 2, col));
    };
    const wh = pal.wains ? 0.9 : 0.12, wc = pal.wains ? L(pal.wains) : trimC;
    base(-hw, hw, -hd + 0.015, -hd + 0.015, wh, 0.03, wc);
    base(-hw + 0.015, 0, -hd, hd, wh, 0.03, wc);
    base(hw - 0.015, 0, -hd, hd, wh, 0.03, wc);
    base(-hw, doorX - dw / 2 - 0.08, hd - 0.015, hd - 0.015, wh, 0.03, wc);
    base(doorX + dw / 2 + 0.08, hw, hd - 0.015, hd - 0.015, wh, 0.03, wc);
    if (pal.wains) {
      B.wood.push(boxG(W, 0.05, 0.05, 0, wh, -hd + 0.03, trimC), boxG(0.05, 0.05, D, -hw + 0.03, wh, 0, trimC), boxG(0.05, 0.05, D, hw - 0.03, wh, 0, trimC));
      B.wood.push(boxG(doorX - dw / 2 - 0.08 + hw, 0.05, 0.05, (-hw + doorX - dw / 2 - 0.08) / 2, wh, hd - 0.03, trimC), boxG(hw - doorX - dw / 2 - 0.08, 0.05, 0.05, (hw + doorX + dw / 2 + 0.08) / 2, wh, hd - 0.03, trimC));
    }
    // door casing
    B.wood.push(boxG(0.1, dh + 0.1, 0.05, doorX - dw / 2 - 0.05, (dh + 0.1) / 2, hd - 0.02, trimC), boxG(0.1, dh + 0.1, 0.05, doorX + dw / 2 + 0.05, (dh + 0.1) / 2, hd - 0.02, trimC), boxG(dw + 0.3, 0.12, 0.06, doorX, dh + 0.06, hd - 0.02, trimC));
    // fireplace on the back wall
    const fp = { wood: [], fabric: [], masonry: [], ceramic: [], plant: [], glass: [], lamp: [], fire: [], pic: [] };
    fireplaceGeo(fp, pal);
    for (const k in fp) for (const g of fp[k]) B[k].push(g.translate(-1.8, 0, -hd));
    pictureGeo(B, -1.8, 1.95, -hd + 0.45, 0, 0.8, 0.55, 1, wood);
    // living area
    rugGeo(B, 1.55, 1.05, pal.rug);
    const rugShift = B.fabric.pop(); B.fabric.push(rugShift.translate(-1.8, 0, -0.85));
    const sofa = { wood: [], fabric: [] };
    sofaGeo(sofa, 2.1, L(pal.sofa), L(pal.pillow), wood);
    for (const k in sofa) for (const g of sofa[k]) B[k].push(g.translate(-1.8, 0, 0.75));
    const coffee = { wood: [] };
    tableGeo(coffee, 1.0, 0.55, 0.42, wood);
    for (const g of coffee.wood) B.wood.push(g.translate(-1.8, 0, -0.8));
    B.ceramic.push(lathe([[0, 0], [0.04, 0], [0.045, 0.09], [0.04, 0.09], [0.035, 0.01], [0, 0.01]], 8, L(0xf4f0e6)).translate(-1.55, 0.42, -0.75));
    B.wood.push(boxG(0.22, 0.04, 0.16, -2.0, 0.44, -0.85, L(0x2e5a8a)), boxG(0.2, 0.03, 0.15, -2.0, 0.475, -0.84, L(0xa83232)));
    const arm = { wood: [], fabric: [] };
    sofaGeo(arm, 0.95, L(pal.chair), null, wood);
    for (const k in arm) for (const g of arm[k]) B[k].push(g.rotateY(-Math.PI / 2 + 0.35).translate(-3.25, 0, -1.05));
    // floor lamp beside the armchair
    B.wood.push(paint(prep(new THREE.CylinderGeometry(0.16, 0.18, 0.04, 10)).translate(-3.45, 0.02, 0.15), L(0x3a3430)));
    B.wood.push(paint(prep(new THREE.CylinderGeometry(0.018, 0.018, 1.45, 6)).translate(-3.45, 0.74, 0.15), L(0xa88a4a)));
    lampShade(B, -3.45, 1.38, 0.15, 0.13, 0.24, 0.3);
    // bookshelf on the left wall
    const bs = { wood: [], ceramic: [] };
    bookshelfGeo(bs, 1.1, 2.0, 0.34, wood, r);
    for (const k in bs) for (const g of bs[k]) B[k].push(g.rotateY(Math.PI / 2).translate(-hw + 0.18, 0, 1.75));
    // bed in the back right corner
    const bx = 2.65, bl = 2.05, bw2 = 1.45, bz = -hd + bl / 2 + 0.05;
    B.wood.push(boxG(bw2 + 0.1, 0.3, bl, bx, 0.2, bz, wood, 2));
    B.wood.push(boxG(bw2 + 0.16, 1.15, 0.08, bx, 0.58, -hd + 0.06, wood, 2), boxG(bw2 + 0.16, 0.12, 0.1, bx, 1.2, -hd + 0.06, mulc(wood, 0.9)));
    B.wood.push(boxG(bw2 + 0.16, 0.6, 0.07, bx, 0.3, bz + bl / 2 + 0.03, wood, 2));
    for (const s of [-1, 1]) B.wood.push(boxG(0.08, 1.25, 0.08, bx + s * (bw2 / 2 + 0.08), 0.62, -hd + 0.06, mulc(wood, 0.95)), boxG(0.08, 0.7, 0.08, bx + s * (bw2 / 2 + 0.08), 0.35, bz + bl / 2 + 0.03, mulc(wood, 0.95)));
    B.fabric.push(roundBox(bw2 - 0.04, 0.2, bl - 0.08, 0.05, L(0xf4f0e8)).translate(bx, 0.45, bz));
    for (const s of [-1, 1]) B.fabric.push(roundBox(0.58, 0.13, 0.36, 0.06, L(0xfbf8f2)).translate(bx + s * 0.33, 0.6, -hd + 0.36));
    const quilt = prep(new THREE.BoxGeometry(bw2 + 0.04, 0.05, 1.5, 6, 1, 6)).translate(bx, 0.58, bz + 0.27);
    const side1 = prep(new THREE.BoxGeometry(0.03, 0.3, 1.5, 1, 1, 6)).translate(bx - bw2 / 2 - 0.035, 0.44, bz + 0.27);
    const side2 = prep(new THREE.BoxGeometry(0.03, 0.3, 1.5, 1, 1, 6)).translate(bx + bw2 / 2 + 0.035, 0.44, bz + 0.27);
    const qc = pal.quilt.map(L);
    for (const q of [quilt, side1, side2]) B.fabric.push(paintTris(q, (x, y, z) => qc[(Math.floor((x - bx) / 0.245 + 10) + Math.floor((z + 10) / 0.25) * 3 + Math.floor((y + 10) / 0.15)) % qc.length]));
    // nightstand with a table lamp
    tableGeo(B, 0.45, 0.4, 0.55, wood);
    const ns = B.wood.splice(B.wood.length - 6, 6);
    for (const g of ns) B.wood.push(g.translate(bx - bw2 / 2 - 0.42, 0, -hd + 0.3));
    B.ceramic.push(lathe([[0, 0], [0.07, 0], [0.09, 0.08], [0.06, 0.2], [0.02, 0.26], [0.02, 0.32], [0, 0.32]], 10, L(0x5a8aa8)).translate(bx - bw2 / 2 - 0.42, 0.55, -hd + 0.3));
    lampShade(B, bx - bw2 / 2 - 0.42, 0.83, -hd + 0.3, 0.08, 0.15, 0.2);
    // dining table and chairs by the right wall
    const dt = { wood: [], fabric: [] };
    tableGeo(dt, 0.85, 1.3, 0.76, wood);
    for (const k in dt) for (const g of dt[k]) B[k].push(g.translate(3.15, 0, 1.15));
    const chairs = [[2.48, 0.85, -Math.PI / 2], [2.48, 1.45, -Math.PI / 2], [3.15, 2.05, 0], [3.15, 0.25, Math.PI]];
    for (const [x, z, a] of chairs) {
      const ch = { wood: [], fabric: [] };
      chairGeo(ch, wood, L(pal.chair));
      for (const k in ch) for (const g of ch[k]) B[k].push(g.rotateY(a).translate(x, 0, z));
    }
    B.ceramic.push(lathe([[0, 0], [0.06, 0], [0.08, 0.1], [0.04, 0.2], [0.05, 0.24], [0, 0.24]], 10, L(0xf0ece2)).translate(3.15, 0.76, 1.15));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU, fc = L([0xe85a6a, 0xf2c83a, 0xf4f0f0, 0xa06ac8, 0xe8803a, 0xe85a6a][i]);
      const tip = new V3(3.15 + Math.cos(a) * 0.1, 1.15 + (i % 2) * 0.06, 1.15 + Math.sin(a) * 0.1);
      B.plant.push(tube([new V3(3.15, 0.95, 1.15), tip], 0.006, { radial: 3, color: () => L(0x3a7a2a) }));
      B.plant.push(paint(place(new THREE.IcosahedronGeometry(0.045, 0), tip.x, tip.y, tip.z), fc));
    }
    for (const [x, z] of [[2.95, 0.75], [3.35, 1.55]]) B.ceramic.push(lathe([[0, 0], [0.12, 0], [0.13, 0.015], [0, 0.015]], 12, L(0xf6f2ea)).translate(x, 0.765, z));
    // house plants
    sub(B, (t) => plantGeo(t, 1.5, r, L(0x3a7a32)), -0.5, -hd + 0.35);
    sub(B, (t) => plantGeo(t, 1.2, r, L(0x4a8a3a)), hw - 0.35, hd - 0.35);
    sub(B, (t) => plantGeo(t, 1.0, r, L(0x5a9a42)), -hw + 0.35, -hd + 0.35);
    // windows
    const cur = L(pal.sofa);
    inWindow(B, 0.55, 1.5, -hd, 0, 1.0, 1.25, trimC, mulc(cur, 1.1));
    inWindow(B, -hw, 1.5, -2.05, Math.PI / 2, 1.0, 1.25, trimC, mulc(cur, 1.1));
    inWindow(B, hw, 1.5, -0.35, -Math.PI / 2, 1.0, 1.25, trimC, mulc(cur, 1.1));
    inWindow(B, -1.8, 1.5, hd, Math.PI, 1.2, 1.25, trimC, mulc(cur, 1.1));
    // pictures on the walls
    pictureGeo(B, bx, 1.75, -hd + 0.11, 0, 0.75, 0.5, 0, wood);
    pictureGeo(B, -hw + 0.01, 1.7, -0.75, Math.PI / 2, 0.5, 0.62, 2, wood);
    pictureGeo(B, hw - 0.01, 1.65, 1.15, -Math.PI / 2, 0.6, 0.45, 3, wood);
    // pet corner: bed, bowls on a mat
    const pet = { x: -3.05, z: 2.2 }, bowl = { x: -2.05, z: 2.6 }, water = { x: -1.6, z: 2.6 };
    petCorner(B, pet.x, pet.z, pal.petBed);
    bowlsGeo(B, bowl.x, bowl.z, water.x, water.z);
    // assemble, one mesh per material
    const grp = new THREE.Group();
    grp.name = 'interior-' + HOUSES[v].name;
    const wallMat = pal.wallTex === 'wallpaper' ? mat('wallPaper', { map: TX.wallpaper() }) : mat('wallPlaster', { map: TX.plaster() });
    const floorMat = pal.floor === 'tile' ? mat('floorTile', { map: TX.tile() }) : mat('floorPlanks', { map: TX.planks() });
    const masonMat = pal.masonry === 'brick' ? mat('brickWall', { map: TX.brick() }) : mat('stoneWall', { map: TX.stone() });
    const add = (list, m, cast = true) => { if (list.length) grp.add(meshOf(merge(list), m, cast, true)); };
    // every other house gets the mirror image layout
    if (mir < 0) for (const k in B) for (const g of B[k]) mirrorX(g);
    // keep leaves inside the walls
    for (const g of B.plant) eachVertex(g, (p) => { p.x = clamp(p.x, -hw + 0.04, hw - 0.04); p.z = clamp(p.z, -hd + 0.04, hd - 0.04); });
    add(B.floor, floorMat, false);
    add(B.wall, wallMat);
    add(B.wood, mat('paint', { map: TX.wood() }));
    add(B.fabric, mat('fabric', { map: TX.fabric() }));
    add([boxUV(merge(B.masonry), 1.4)], masonMat);
    add(B.ceramic, mat('ceramic', { std: true, roughness: 0.35 }));
    add(B.plant, mat('plantIn', { side: THREE.DoubleSide }));
    add(B.glass, mat('windowDay', { emissive: 0xcfe6ff, glow: 'day' }), false);
    add(B.lamp, mat('lampGlow', { emissive: 0xffc070, glow: 'night' }), false);
    add(B.pic, mat('pictures', { map: TX.pictures() }), false);
    const fire = new THREE.Mesh(merge(B.fire), mat('fire', { basic: true, map: TX.flame(), glow: 'fire', transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fireBase: 0.05 }));
    fire.name = 'fire'; fire.renderOrder = 3;
    grp.add(fire);
    // panel faces into the room, hinge at its left edge (seen from outside), opens inward with positive rotation.y
    const door = new THREE.Mesh(mirrorX(doorGeo(dw, dh, mulc(trimC, 0.97), { lite: false })).rotateY(Math.PI), mat('paint', { map: TX.wood() }));
    door.name = 'door';
    door.position.set(doorX * mir - dw / 2, 0, hd - 0.04);
    door.castShadow = true;
    grp.add(door);
    const ball = new THREE.Mesh(ballGeo(), mat('toyBall', { std: true, roughness: 0.45 }));
    ball.name = 'ball'; ball.position.set(-0.75 * mir, 0.09, 1.7); ball.castShadow = true;
    grp.add(ball);
    const colliders = [
      { box: true, x: 0, z: -hd - T / 2, hw: hw + T, hd: T / 2 + 0.05 }, { box: true, x: -hw - T / 2, z: 0, hw: T / 2 + 0.05, hd: hd + T },
      { box: true, x: hw + T / 2, z: 0, hw: T / 2 + 0.05, hd: hd + T },
      { box: true, x: (-hw - T + doorX - dw / 2) / 2, z: hd + T / 2, hw: (doorX - dw / 2 + hw + T) / 2, hd: T / 2 + 0.05 },
      { box: true, x: (doorX + dw / 2 + hw + T) / 2, z: hd + T / 2, hw: (hw + T - doorX - dw / 2) / 2, hd: T / 2 + 0.05 },
      { box: true, x: -1.8, z: -hd + 0.4, hw: 1.0, hd: 0.45 },
      { box: true, x: -1.8, z: 0.75, hw: 1.08, hd: 0.45 },
      { x: -1.8, z: -0.8, r: 0.5 },
      { x: -3.25, z: -1.05, r: 0.55 },
      { x: -3.45, z: 0.15, r: 0.2 },
      { box: true, x: -hw + 0.18, z: 1.75, hw: 0.2, hd: 0.58 },
      { box: true, x: bx, z: bz, hw: bw2 / 2 + 0.12, hd: bl / 2 + 0.05 },
      { x: bx - bw2 / 2 - 0.42, z: -hd + 0.3, r: 0.3 },
      { box: true, x: 3.0, z: 1.15, hw: 0.75, hd: 1.0 },
      { x: -0.5, z: -hd + 0.35, r: 0.32 }, { x: hw - 0.35, z: hd - 0.35, r: 0.3 }, { x: -hw + 0.35, z: -hd + 0.35, r: 0.28 },
    ];
    for (const c of colliders) { if (c.box && c.rot === undefined) c.rot = 0; c.x *= mir; if (c.rot) c.rot = -c.rot; }
    const mp = (p) => Object.assign({}, p, { x: p.x * mir });
    grp.userData = {
      w: W, d: D, wallH: H, variant: v, name: HOUSES[v].name, mirrored: mir < 0,
      spawn: { x: doorX * mir, z: hd - 1.1, yaw: Math.PI },
      exit: { x: doorX * mir, z: hd - 0.3, r: 0.6 },
      petBed: mp(pet), bowl: mp(bowl), water: mp(water),
      light: { x: -0.4 * mir, y: 2.3, z: -0.4 },
      fire: { x: -1.8 * mir, y: 0.4, z: -hd + 0.25 },
      colliders,
    };
    return grp;
  }
  function interior(variant = 0) {
    const v = ((Math.floor(variant) % 5) + 5) % 5;
    if (!interiorCache[v]) interiorCache[v] = buildInterior(v);
    const src = interiorCache[v], g = src.clone();
    g.userData = JSON.parse(JSON.stringify(src.userData));
    g.userData.door = g.getObjectByName('door');
    g.userData.ball = g.getObjectByName('ball');
    return g;
  }

  /* ============================================================
     Animal pound: a friendly shelter building and its interior
     ============================================================ */
  function pawPath(c, x, y, s) {
    c.beginPath(); c.ellipse(x, y + s * 0.25, s * 0.42, s * 0.36, 0, 0, TAU); c.fill();
    for (const [dx, dy, rr] of [[-0.42, -0.2, 0.15], [-0.15, -0.45, 0.16], [0.15, -0.45, 0.16], [0.42, -0.2, 0.15]]) {
      c.beginPath(); c.ellipse(x + dx * s, y + dy * s, rr * s, rr * s * 1.25, dx * 0.6, 0, TAU); c.fill();
    }
  }
  // painted sign board texture: centered text with paw prints at both ends
  function boardTex(key, text, o = {}) {
    return canvasTex(key, o.w || 1024, o.h || 256, (c, w, h) => {
      c.fillStyle = o.bg || '#f6ecd2'; c.fillRect(0, 0, w, h);
      c.strokeStyle = o.border || '#2f6a6a'; c.lineWidth = h * 0.07; c.strokeRect(h * 0.06, h * 0.06, w - h * 0.12, h * 0.12 > 0 ? h - h * 0.12 : h);
      c.fillStyle = o.ink || '#2f5a5a';
      const room = w - (o.paws !== false ? h * 2.3 : h * 0.5);
      let fs = Math.round(h * (o.size || 0.48));
      const fnt = (n) => `bold ${n}px Grandstander, 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif`;
      c.font = fnt(fs);
      while (fs > 10 && c.measureText(text).width > room) { fs -= 2; c.font = fnt(fs); }
      c.textAlign = 'center'; c.textBaseline = 'middle';
      c.fillText(text, w / 2, h * 0.54);
      if (o.paws !== false) {
        c.fillStyle = o.paw || '#c8643a';
        pawPath(c, h * 0.55, h * 0.52, h * 0.32);
        pawPath(c, w - h * 0.55, h * 0.52, h * 0.32);
      }
    }, { srgb: true, clamp: true });
  }
  const pawTex = () => canvasTex('pawDecal', 128, 128, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.fillStyle = '#f6ecd2'; c.beginPath(); c.arc(w / 2, h / 2, w * 0.47, 0, TAU); c.fill();
    c.lineWidth = 6; c.strokeStyle = '#2f6a6a'; c.stroke();
    c.fillStyle = '#c8643a'; pawPath(c, w / 2, h * 0.53, w * 0.42);
  }, { srgb: true, clamp: true });
  // a flat textured plane facing +z, placed with a matrix, in its own (cached) material
  function decal(tex, key, w, h, x, y, z, ry = 0, alpha = false) {
    const m = mat(key, { map: tex, alphaTest: alpha ? 0.5 : 0, std: false });
    const g = paint(prep(new THREE.PlaneGeometry(w, h)), [1, 1, 1]);
    const mesh = new THREE.Mesh(g, m);
    mesh.position.set(x, y, z); mesh.rotation.y = ry;
    mesh.receiveShadow = true;
    return mesh;
  }

  /* weathervane: post, arrow with a tail fin and a little ball, base at (x, y, z) */
  function weathervane(x, y, z) {
    const k = L(0x2a2a2a), g = [];
    g.push(boxG(0.04, 0.75, 0.04, x, y + 0.37, z, k));
    g.push(paint(place(new THREE.IcosahedronGeometry(0.06, 1), x, y + 0.45, z), L(0xc8a040)));
    g.push(boxG(0.7, 0.025, 0.025, x, y + 0.68, z, k));
    const head = prep(new THREE.ConeGeometry(0.07, 0.18, 4)).rotateZ(-Math.PI / 2).scale(1, 1, 0.25).translate(x + 0.42, y + 0.68, z);
    g.push(paint(head, k));
    g.push(boxG(0.2, 0.16, 0.012, x - 0.3, y + 0.71, z, k));
    g.push(boxG(0.03, 0.02, 0.3, x, y + 0.55, z, k), boxG(0.3, 0.02, 0.03, x, y + 0.55, z, k));
    return g;
  }
  let poundGrp = null;
  function buildPound() {
    const W = 14, D = 10, F = 0.35, wallH = 3.3, rise = 2.6, eave = F + wallH, yr = eave + rise;
    const wallC = L(0x86c0b4), trimC = L(0xfbfaf4), roofC = L(0x4c4a48);
    const out = { siding: [], trim: [], roof: [], glass: [], stone: [], brick: [], dark: [] };
    const dw = 1.3, dh = 2.25, doorX = 0;
    out.stone.push(boxUV(paint(prep(new THREE.BoxGeometry(W + 0.16, F + 0.1, D + 0.16)).translate(0, (F + 0.1) / 2 - 0.1, 0), (x, y, z) => mixc(L(0x8a8580), L(0xaaa59c), fbm(x * 2, y * 2, z * 2, 2) + 0.5)), 1.1));
    const gable = [[D / 2, F], [-D / 2, F], [-D / 2, eave], [0, yr], [D / 2, eave]];
    for (const s of [-1, 1]) out.siding.push(polyX(gable, s * W / 2, s, wallC));
    out.siding.push(wallQuadZ(-W / 2, W / 2, F, eave, -D / 2, -1, wallC));
    const dl = doorX - dw / 2 - 0.02, dr = doorX + dw / 2 + 0.02, dt = F + dh + 0.02;
    out.siding.push(wallQuadZ(-W / 2, dl, F, eave, D / 2, 1, wallC), wallQuadZ(dr, W / 2, F, eave, D / 2, 1, wallC), wallQuadZ(dl, dr, dt, eave, D / 2, 1, wallC));
    const rec = prep(new THREE.BoxGeometry(dw + 0.04, dh + 0.02, 0.5)).translate(doorX, F + dh / 2, D / 2 - 0.26);
    const rn = rec.attributes.normal.array, rp2 = rec.attributes.position.array;
    for (let i = 0; i < rn.length; i++) rn[i] = -rn[i];
    for (let t = 0; t < rp2.length; t += 9) for (let k = 0; k < 3; k++) { const a = rp2[t + 3 + k]; rp2[t + 3 + k] = rp2[t + 6 + k]; rp2[t + 6 + k] = a; }
    out.glass.push(setGlow(paint(rec, L(0x2a2018)), 0.8));
    out.trim.push(boxG(0.16, dh + 0.1, 0.1, dl - 0.08, F + dh / 2, D / 2 + 0.05, trimC), boxG(0.16, dh + 0.1, 0.1, dr + 0.08, F + dh / 2, D / 2 + 0.05, trimC));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) out.trim.push(boxG(0.18, eave - F, 0.18, sx * (W / 2 + 0.02), (F + eave) / 2, sz * (D / 2 + 0.02), trimC));
    out.trim.push(boxG(W + 0.1, 0.14, 0.06, 0, F + 0.07, D / 2 + 0.03, trimC), boxG(W + 0.1, 0.2, 0.06, 0, eave - 0.1, D / 2 + 0.03, trimC));
    const rp = roofX(W, D, eave, eave, 0, yr, 0.4, 0.5, roofC, trimC);
    // porch canopy over the door on two posts
    const cz = D / 2, cy = dt + 0.75;
    const cr = roofX(1.9, 3.6, cy, cy, 0, cy + 0.75, 0.05, 0.05, roofC, trimC);
    for (const k of ['top', 'under']) { cr[k].rotateY(Math.PI / 2); cr[k].translate(doorX, 0, cz + 0.95); }
    out.roof.push(cr.top); out.dark.push(cr.under);
    for (const f of cr.fascia) { f.rotateY(Math.PI / 2); f.translate(doorX, 0, cz + 0.95); out.trim.push(f); }
    out.siding.push(polyZ([[doorX - 1.8, cy], [doorX + 1.8, cy], [doorX, cy + 0.75]], cz + 1.9, 1, trimC));
    for (const s of [-1, 1]) out.trim.push(boxG(0.16, cy - F, 0.16, doorX + s * 1.65, (cy + F) / 2, cz + 1.8, trimC));
    out.trim.push(boxG(3.5, 0.14, 0.14, doorX, cy - 0.07, cz + 1.8, trimC));
    out.stone.push(boxUV(paint(prep(new THREE.BoxGeometry(3.8, F, 2.2)).translate(doorX, F / 2, cz + 1.1), L(0x9a958c)), 1.1));
    out.stone.push(boxG(2.2, F * 0.5, 0.4, doorX, F * 0.25, cz + 2.4, L(0x9a958c), 1.1));
    // windows with flower boxes
    const wo = { trim: trimC, shutters: L(0xd8643a), box: L(0xf6f4ee), flowers: [L(0xe0405a), L(0xf6d040), L(0xf2f0f0), L(0xd05aa0)] };
    for (const x of [-5.0, -3.4, 3.4, 5.0]) addWindow(out, x, F + 1.45, D / 2, 0.95, 1.3, 'z+', wo);
    for (const s of [-1, 1]) for (const z of [-2.5, 0, 2.5]) addWindow(out, s * W / 2, F + 1.55, z, 1.0, 1.35, s > 0 ? 'x+' : 'x-', { trim: trimC });
    for (const x of [-4, 0, 4]) addWindow(out, x, F + 1.55, -D / 2, 1.0, 1.35, 'z-', { trim: trimC });
    // cupola with a weathervane, for a friendly landmark silhouette
    out.siding.push(boxUV(paint(prep(new THREE.BoxGeometry(1.0, 0.9, 1.0)).translate(0, yr + 0.3, 0), wallC), 0.96));
    const cp = roofX(1.0, 1.0, yr + 0.75, yr + 0.75, 0, yr + 1.25, 0.12, 0.12, roofC, trimC);
    out.roof.push(cp.top); out.dark.push(cp.under); out.trim.push(...cp.fascia);
    out.siding.push(polyX([[0.5, yr + 0.75], [-0.5, yr + 0.75], [0, yr + 1.25]], 0.5, 1, wallC), polyX([[0.5, yr + 0.75], [-0.5, yr + 0.75], [0, yr + 1.25]], -0.5, -1, wallC));
    out.dark.push(...weathervane(0, yr + 1.3, 0));
    const grp = new THREE.Group();
    grp.name = 'pound';
    grp.add(meshOf(boxUV(merge(out.siding), 0.96), mat('clapboard', { map: TX.clapboard() })));
    grp.add(meshOf(merge([...out.trim, ...rp.fascia, ...out.dark, rp.under]), mat('paint', { map: TX.wood() })));
    grp.add(meshOf(merge([rp.top, ...out.roof]), mat('shingle', { map: TX.shingle() })));
    grp.add(meshOf(merge(out.glass), mat('windowGlow', { emissive: 0xffbb66, glow: 'night' }), false, false));
    grp.add(meshOf(merge(out.stone), mat('stoneWall', { map: TX.stone() })));
    // the sign over the door and a paw medallion on the gable
    // the sign hangs on the front of the porch canopy; a paw medallion on the gable above
    const signTexP = boardTex('poundSign', 'ANIMAL POUND', { w: 1024, h: 200, size: 0.56 });
    const bm = meshOf(boxG(3.3, 0.72, 0.1, 0, 0, 0, L(0x2f6a6a)), mat('paint', { map: TX.wood() }));
    bm.position.set(doorX, cy - 0.5, cz + 1.86);
    grp.add(bm);
    grp.add(decal(signTexP, 'poundSignMat', 3.16, 0.62, doorX, cy - 0.5, cz + 1.915));
    grp.add(decal(pawTex(), 'pawDecalMat', 0.6, 0.6, doorX, cy + 0.27, cz + 1.915, 0, true));
    for (const s of [-1, 1]) grp.add(decal(pawTex(), 'pawDecalMat', 1.6, 1.6, 0, eave + 1.0, s * (D / 2 + 0.02), s > 0 ? 0 : Math.PI, true));
    const door = new THREE.Mesh(doorGeo(dw, dh, L(0xd8443a), { lite: true }), mat('paint', { map: TX.wood() }));
    door.name = 'door';
    door.position.set(doorX - dw / 2, F, D / 2 + 0.01);
    door.castShadow = true; door.receiveShadow = true;
    grp.add(door);
    grp.userData = { w: W, d: D, h: yr + 1.9, hw: W / 2 + 0.1, hd: D / 2 + 0.1, outside: { x: doorX, z: D / 2 + 2.6 + 1.2 }, floorY: F, name: 'pound' };
    return grp;
  }
  function pound() {
    if (!poundGrp) poundGrp = buildPound();
    const g = poundGrp.clone();
    g.userData = JSON.parse(JSON.stringify(poundGrp.userData));
    g.userData.door = g.getObjectByName('door');
    return g;
  }

  /* ---------- pound interior ---------- */
  let poundInGrp = null;
  function buildPoundInterior() {
    const W = 12, D = 8, H = 3.0, T = 0.16, hw = W / 2, hd = D / 2;
    const r = rng(8484);
    const B = { wood: [], fabric: [], masonry: [], ceramic: [], plant: [], glass: [], lamp: [], fire: [], pic: [], floor: [], wall: [], metal: [], wire: [], bags: [] };
    const trimC = L(0xfbfaf4), wood = L(0xb07a44), wallC = L(0xd6e8d0), wains = L(0xf6f2e6);
    const doorX = 0, dw = 1.3, dh = 2.25;
    B.floor.push(boxUV(paint(prep(new THREE.BoxGeometry(W + T * 2, 0.1, D + T * 2)).translate(0, -0.05, 0), L(0xd0a066)), 0.75));
    B.wall.push(boxG(W + T * 2, H, T, 0, H / 2, -hd - T / 2, wallC, 1.3), boxG(T, H, D, -hw - T / 2, H / 2, 0, wallC, 1.3), boxG(T, H, D, hw + T / 2, H / 2, 0, wallC, 1.3));
    B.wall.push(boxG(doorX - dw / 2 + hw + T, H, T, (-hw - T + doorX - dw / 2) / 2, H / 2, hd + T / 2, wallC, 1.3));
    B.wall.push(boxG(hw + T - (doorX + dw / 2), H, T, (doorX + dw / 2 + hw + T) / 2, H / 2, hd + T / 2, wallC, 1.3));
    B.wall.push(boxG(dw, H - dh, T, doorX, dh + (H - dh) / 2, hd + T / 2, wallC, 1.3));
    const out = prep(new THREE.PlaneGeometry(dw, dh)).rotateY(Math.PI).translate(doorX, dh / 2, hd + T + 0.02);
    B.glass.push(setGlow(paint(out, L(0x6a7a6a)), 1));
    const capC = mulc(trimC, 0.95);
    B.wood.push(boxG(W + T * 2 + 0.04, 0.04, T + 0.04, 0, H + 0.02, -hd - T / 2, capC), boxG(T + 0.04, 0.04, D + T * 2, -hw - T / 2, H + 0.02, 0, capC), boxG(T + 0.04, 0.04, D + T * 2, hw + T / 2, H + 0.02, 0, capC));
    B.wood.push(boxG(doorX - dw / 2 + hw + T, 0.04, T + 0.04, (-hw - T + doorX - dw / 2) / 2, H + 0.02, hd + T / 2, capC), boxG(hw + T - (doorX - dw / 2), 0.04, T + 0.04, (doorX - dw / 2 + hw + T) / 2, H + 0.02, hd + T / 2, capC));
    // wainscot all around
    B.wood.push(boxG(W, 1.0, 0.03, 0, 0.5, -hd + 0.015, wains), boxG(0.03, 1.0, D, -hw + 0.015, 0.5, 0, wains), boxG(0.03, 1.0, D, hw - 0.015, 0.5, 0, wains));
    B.wood.push(boxG(hw - dw / 2 - 0.1, 1.0, 0.03, (-hw + doorX - dw / 2 - 0.1) / 2, 0.5, hd - 0.015, wains), boxG(hw - dw / 2 - 0.1, 1.0, 0.03, (hw + doorX + dw / 2 + 0.1) / 2, 0.5, hd - 0.015, wains));
    B.wood.push(boxG(W, 0.05, 0.05, 0, 1.0, -hd + 0.03, trimC), boxG(0.05, 0.05, D, -hw + 0.03, 1.0, 0, trimC), boxG(0.05, 0.05, D, hw - 0.03, 1.0, 0, trimC));
    B.wood.push(boxG(0.12, dh + 0.1, 0.05, doorX - dw / 2 - 0.06, (dh + 0.1) / 2, hd - 0.02, trimC), boxG(0.12, dh + 0.1, 0.05, doorX + dw / 2 + 0.06, (dh + 0.1) / 2, hd - 0.02, trimC), boxG(dw + 0.34, 0.12, 0.06, doorX, dh + 0.06, hd - 0.02, trimC));
    // windows
    for (const x of [-5.0, -3.4, 3.4, 5.0]) inWindow(B, x, 1.65, hd, Math.PI, 0.95, 1.3, trimC, L(0xd8643a));
    for (const z of [-0.2, 2.5]) { inWindow(B, -hw, 1.75, z, Math.PI / 2, 1.0, 1.3, trimC, null); inWindow(B, hw, 1.75, z, -Math.PI / 2, 1.0, 1.3, trimC, null); }
    // ----- cages along the back wall -----
    const cw = 1.2, ch = 1.0, cd = 1.0, nC = 6, cx0 = -hw + 0.35;
    const cages = [];
    const steel = L(0xb8bec4), steelDark = L(0x7a8288);
    B.wood.push(boxG(nC * cw + 0.1, 0.12, cd + 0.1, cx0 + nC * cw / 2, 0.06, -hd + cd / 2 + 0.02, L(0x7a8a8e)));
    for (let i = 0; i < nC; i++) {
      const x0 = cx0 + i * cw, x1 = x0 + cw, xc = (x0 + x1) / 2, z0 = -hd + 0.02, z1 = z0 + cd, y0 = 0.12, y1 = y0 + ch;
      // wire panels: sides (shared ones only once), top
      const panel = (w, h, x, y, z, ry, rx = 0) => {
        const g = prep(new THREE.PlaneGeometry(w, h)); if (rx) g.rotateX(rx); g.rotateY(ry); g.translate(x, y, z); return paint(g, [1, 1, 1]);
      };
      if (i === 0) B.wire.push(panel(cd, ch, x0, (y0 + y1) / 2, (z0 + z1) / 2, Math.PI / 2));
      B.wire.push(panel(cd, ch, x1, (y0 + y1) / 2, (z0 + z1) / 2, Math.PI / 2));
      B.wire.push(panel(cw, cd, xc, y1, (z0 + z1) / 2, 0, -Math.PI / 2));
      // frame bars
      for (const x of [x0, x1]) for (const z of [z1]) B.metal.push(boxG(0.035, ch, 0.035, x, (y0 + y1) / 2, z, steel));
      B.metal.push(boxG(cw, 0.035, 0.035, xc, y1, z1, steel), boxG(cw, 0.035, 0.035, xc, y0 + 0.02, z1, steel));
      B.metal.push(boxG(0.035, 0.035, cd, x1, y1, (z0 + z1) / 2, steel));
      // open door: a wire panel hinged at the left front edge, swung out
      const open = 1.9 + r() * 0.3;
      const dpan = prep(new THREE.PlaneGeometry(cw - 0.06, ch - 0.06)).translate((cw - 0.06) / 2, 0, 0).rotateY(open).translate(x0 + 0.03, (y0 + y1) / 2, z1 + 0.02);
      B.wire.push(paint(dpan, [1, 1, 1]));
      const edges = [boxG(cw - 0.06, 0.03, 0.03, (cw - 0.06) / 2, (ch - 0.06) / 2, 0, steelDark), boxG(cw - 0.06, 0.03, 0.03, (cw - 0.06) / 2, -(ch - 0.06) / 2, 0, steelDark), boxG(0.03, ch - 0.06, 0.03, cw - 0.06, 0, 0, steelDark), boxG(0.03, ch - 0.06, 0.03, 0, 0, 0, steelDark)];
      for (const e of edges) B.metal.push(e.rotateY(open).translate(x0 + 0.03, (y0 + y1) / 2, z1 + 0.02));
      // cushion and a name plate
      const cush = roundBox(0.8, 0.1, 0.7, 0.04, L([0xe8a2aa, 0x8ac6c4, 0xf2d070, 0xb8a0d0, 0xa8d08a, 0xf0b080][i]));
      B.fabric.push(cush.translate(xc, y0 + 0.05, z0 + cd * 0.5));
      B.wood.push(boxG(0.5, 0.16, 0.02, xc, y1 + 0.14, z1 - 0.02, L(0xf6ecd2)));
      B.wood.push(boxG(0.06, 0.06, 0.012, xc - 0.18, y1 + 0.14, z1 - 0.005, L(0xc8643a)));
      cages.push({ x: xc, z: z0 + cd * 0.45, yaw: 0, y: y0 + 0.08 });
    }
    // ----- two low open pens on the floor -----
    const pens = [{ x: -3.4, z: -0.6, w: 2.8, d: 2.0 }, { x: 0.3, z: -0.6, w: 2.8, d: 2.0 }];
    const penCol = [L(0xa8d08a), L(0xf2d070)];
    pens.forEach((p, k) => {
      const ph = 0.55, gap = 1.0, x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
      const rail = (ax, az, bx, bz) => {
        const len = Math.hypot(bx - ax, bz - az), ang = Math.atan2(bz - az, bx - ax);
        for (const y of [0.18, ph]) { const g = prep(new THREE.BoxGeometry(len, 0.06, 0.05)); g.rotateY(-ang); g.translate((ax + bx) / 2, y, (az + bz) / 2); B.wood.push(paint(g, trimC)); }
        const n = Math.max(1, Math.round(len / 0.16));
        for (let i = 0; i <= n; i++) { const t = i / n; B.wood.push(boxG(0.04, ph, 0.04, lerp(ax, bx, t), ph / 2, lerp(az, bz, t), trimC)); }
      };
      rail(x0, z0, x1, z0); rail(x0, z0, x0, z1); rail(x1, z0, x1, z1);
      rail(x0, z1, p.x - gap / 2, z1); rail(p.x + gap / 2, z1, x1, z1);
      // soft mat and a toy inside
      B.fabric.push(roundBox(p.w - 0.2, 0.03, p.d - 0.2, 0.012, penCol[k]).translate(p.x, 0.015, p.z));
      const bone = merge([boxG(0.18, 0.04, 0.04, 0, 0, 0, L(0xf6ecd2)), paint(place(new THREE.IcosahedronGeometry(0.035, 0), -0.1, 0, 0.02), L(0xf6ecd2)), paint(place(new THREE.IcosahedronGeometry(0.035, 0), -0.1, 0, -0.02), L(0xf6ecd2)), paint(place(new THREE.IcosahedronGeometry(0.035, 0), 0.1, 0, 0.02), L(0xf6ecd2)), paint(place(new THREE.IcosahedronGeometry(0.035, 0), 0.1, 0, -0.02), L(0xf6ecd2))]);
      B.ceramic.push(bone.rotateY(0.6 + k).translate(p.x + 0.5, 0.06, p.z + 0.3));
    });
    // ----- front desk (left of the door), the receptionist stands behind it facing into the room -----
    const dx = -2.7, dz = 2.6, desk = { x: dx + 0.3, z: dz + 0.8 };
    B.wood.push(boxG(2.2, 1.0, 0.6, dx, 0.5, dz, wood, 1.5), boxG(2.35, 0.06, 0.75, dx, 1.03, dz, mulc(wood, 0.85), 1.5));
    B.wood.push(boxG(2.0, 0.6, 0.02, dx, 0.5, dz - 0.31, L(0x2f6a6a)));
    for (const s of [-1, 1]) B.wood.push(boxG(0.1, 0.1, 0.012, dx + s * 0.55, 0.62, dz - 0.32, L(0xf6ecd2)));
    B.wood.push(boxG(0.5, 0.35, 0.03, dx + 0.3, 1.24, dz + 0.05, L(0x2a2a2a)), boxG(0.08, 0.15, 0.06, dx + 0.3, 1.1, dz + 0.03, L(0x2a2a2a)));
    B.glass.push(setGlow(paint(prep(new THREE.PlaneGeometry(0.44, 0.29)).rotateY(Math.PI).translate(dx + 0.3, 1.24, dz + 0.068), L(0x6a9ab8)), 0.6));
    B.ceramic.push(lathe([[0, 0], [0.09, 0], [0.12, 0.02], [0.12, 0.08], [0, 0.08]], 10, L(0x3a7ac0)).translate(dx - 0.6, 1.06, dz - 0.15));
    for (let i = 0; i < 8; i++) B.ceramic.push(paint(place(new THREE.IcosahedronGeometry(0.025, 0), dx - 0.6 + (r() - 0.5) * 0.12, 1.15, dz - 0.15 + (r() - 0.5) * 0.12), L([0xe0405a, 0xf2c83a, 0x4a9ad0][i % 3])));
    B.wood.push(boxG(0.3, 0.02, 0.22, dx - 0.15, 1.07, dz + 0.1, L(0xf6f2ea)));
    const chairT = { wood: [], fabric: [] };
    chairGeo(chairT, wood, L(0x2f6a6a));
    for (const k in chairT) for (const g of chairT[k]) B[k].push(g.translate(desk.x, 0, desk.z + 0.25));
    // ----- shelves of food bags on the left wall -----
    for (let u = 0; u < 2; u++) {
      const zc = -1.0 + u * 1.5 + 0.9, x = -hw + 0.25;
      for (const s of [-1, 1]) B.wood.push(boxG(0.4, 2.0, 0.04, x, 1.0, zc + s * 0.6, wood));
      for (const y of [0.1, 0.75, 1.4, 1.98]) B.wood.push(boxG(0.4, 0.04, 1.24, x, y, zc, wood));
      for (const y of [0.12, 0.77, 1.42]) {
        let z = zc - 0.55;
        while (z < zc + 0.45) {
          const bw = 0.22 + r() * 0.08, bh = 0.32 + r() * 0.18, bc = L([0xb8401e, 0x245a9a, 0x2e7a3e, 0xc8901a, 0x6a3a8a][Math.floor(r() * 5)]);
          const bag = roundBox(0.28, bh, bw, 0.05, null);
          eachVertex(bag, (p) => { if (p.y > bh * 0.3) { const k = 1 - (p.y - bh * 0.3) / bh * 0.5; p.z *= k; } });
          paint(bag, (px, py) => mulc(bc, py > bh * 0.3 ? 0.8 : 1));
          B.bags.push(bag.translate(x + 0.02, y + bh / 2 + 0.02, z + bw / 2));
          // paper label with a paw dot on the front of the bag
          B.bags.push(boxG(0.01, bh * 0.28, bw * 0.7, x + 0.165, y + bh * 0.42, z + bw / 2, L(0xf6ecd2)));
          B.bags.push(boxG(0.01, bh * 0.1, bw * 0.2, x + 0.172, y + bh * 0.42, z + bw / 2, mulc(bc, 0.9)));
          z += bw + 0.03;
        }
      }
    }
    // ----- vet corner (back right) -----
    const vet = { x: 4.2, z: -1.9, y: 0.86 };
    B.metal.push(boxG(1.3, 0.05, 0.7, vet.x, 0.84, vet.z, L(0xd8dde2)), boxG(1.2, 0.04, 0.6, vet.x, 0.25, vet.z, steelDark));
    for (const sx of [-1, 1]) B.metal.push(boxG(0.06, 0.82, 0.5, vet.x + sx * 0.55, 0.41, vet.z, steel));
    B.fabric.push(roundBox(1.1, 0.04, 0.55, 0.015, L(0x8ac6c4)).translate(vet.x, 0.88, vet.z));
    // tall supply cabinet against the right wall
    B.wood.push(boxG(0.45, 1.9, 1.0, hw - 0.25, 0.95, -hd + 1.0, L(0xf4f2ec), 1));
    B.wood.push(boxG(0.02, 1.8, 0.02, hw - 0.475, 0.95, -hd + 1.0, L(0xb8b0a0)));
    for (const z of [-0.08, 0.08]) B.metal.push(boxG(0.02, 0.18, 0.02, hw - 0.49, 1.0, -hd + 1.0 + z, steel));
    // wall cabinet with jars, a scale and the VET sign
    B.wood.push(boxG(1.4, 0.04, 0.3, vet.x + 0.2, 1.55, -hd + 0.17, wood), boxG(1.4, 0.04, 0.3, vet.x + 0.2, 1.95, -hd + 0.17, wood));
    for (let i = 0; i < 7; i++) {
      const jc = L([0xe8e2d4, 0x9ad0e8, 0xf2c83a, 0xe8a2aa][i % 4]);
      B.ceramic.push(lathe([[0, 0], [0.05, 0], [0.05, 0.14], [0.03, 0.16], [0.03, 0.19], [0, 0.19]], 8, jc).translate(vet.x - 0.4 + i * 0.18, i < 4 ? 1.57 : 1.97, -hd + 0.17));
    }
    B.metal.push(boxG(0.5, 0.05, 0.4, vet.x + 1.0, 0.03, vet.z + 1.2, steel), boxG(0.06, 0.6, 0.06, vet.x + 1.0, 0.33, vet.z + 1.0, steel));
    B.ceramic.push(prep(new THREE.CylinderGeometry(0.12, 0.12, 0.03, 14)).rotateX(Math.PI / 2).translate(vet.x + 1.0, 0.7, vet.z + 1.03));
    paint(B.ceramic[B.ceramic.length - 1], L(0xf6f4ee));
    // pet play corner with bed, bowls and ball (right front)
    const pet = { x: 4.6, z: 2.6 }, bowl = { x: 3.2, z: 3.3 }, water = { x: 3.65, z: 3.3 };
    petCorner(B, pet.x, pet.z, 0x2f6a6a);
    bowlsGeo(B, bowl.x, bowl.z, water.x, water.z);
    rugGeo(B, 1.3, 0.9, [0xc8643a, 0xf2d070, 0x2f6a6a, 0xf6ecd2]);
    B.fabric.push(B.fabric.pop().translate(4.2, 0, 2.3));
    // plants and pictures
    sub(B, (t) => plantGeo(t, 1.4, r, L(0x3a7a32)), 1.6, hd - 0.45);
    sub(B, (t) => plantGeo(t, 1.1, r, L(0x4a8a3a)), -hw + 0.45, hd - 0.45);
    pictureGeo(B, -4.5, 2.0, -hd + 0.01, 0, 0.6, 0.45, 3, wood);
    pictureGeo(B, -hw + 0.01, 2.1, -2.6, Math.PI / 2, 0.55, 0.42, 0, wood);
    pictureGeo(B, hw - 0.01, 2.1, 1.2, -Math.PI / 2, 0.55, 0.42, 2, wood);
    // hanging lamps (glow at night)
    for (const x of [-1.6, 1.6]) {
      B.metal.push(boxG(0.06, 0.12, 0.2, x, 2.2, -hd + 0.1, L(0x3a3430)));
      lampShade(B, x, 2.25, -hd + 0.2, 0.08, 0.13, 0.2);
    }
    for (const z of [-2.2, 1.6]) {
      B.metal.push(boxG(0.2, 0.12, 0.06, hw - 0.1, 2.2, z, L(0x3a3430)));
      lampShade(B, hw - 0.2, 2.25, z, 0.08, 0.13, 0.2);
    }
    for (const g of B.plant) eachVertex(g, (p) => { p.x = clamp(p.x, -hw + 0.04, hw - 0.04); p.z = clamp(p.z, -hd + 0.04, hd - 0.04); });
    // assemble
    const grp = new THREE.Group();
    grp.name = 'pound-interior';
    const add = (list, m, cast = true) => { if (list.length) grp.add(meshOf(merge(list), m, cast, true)); };
    add(B.floor, mat('floorPlanks', { map: TX.planks() }), false);
    add(B.wall, mat('wallPlaster', { map: TX.plaster() }));
    add(B.wood, mat('paint', { map: TX.wood() }));
    add(B.fabric, mat('fabric', { map: TX.fabric() }));
    add(B.bags, mat('fabric', { map: TX.fabric() }));
    add(B.ceramic, mat('ceramic', { std: true, roughness: 0.35 }));
    add(B.metal, mat('metal', { std: true, roughness: 0.35, metalness: 0.6 }));
    add([boxUV(merge(B.wire), 1 / 0.6)], mat('wire', { map: TX.wire(), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xc8ccd0, std: true, metalness: 0.5, roughness: 0.4 }));
    add(B.plant, mat('plantIn', { side: THREE.DoubleSide }));
    add(B.glass, mat('windowDay', { emissive: 0xcfe6ff, glow: 'day' }), false);
    add(B.lamp, mat('lampGlow', { emissive: 0xffc070, glow: 'night' }), false);
    add(B.pic, mat('pictures', { map: TX.pictures() }), false);
    // VET sign and a "Welcome" board behind the desk
    grp.add(decal(boardTex('vetSign', 'VET', { w: 256, h: 128, size: 0.62, bg: '#f6f4ee', border: '#c8463a', ink: '#c8463a', paws: false }), 'vetSignMat', 0.9, 0.45, vet.x + 0.2, 2.45, -hd + 0.02));
    grp.add(decal(boardTex('welcomeSign', 'Welcome, friend!', { w: 1024, h: 160, size: 0.5 }), 'welcomeMat', 2.6, 0.4, -hw + 0.02, 2.45, 1.0, Math.PI / 2));
    // door and ball
    const door = new THREE.Mesh(mirrorX(doorGeo(dw, dh, mulc(trimC, 0.97), { lite: false })).rotateY(Math.PI), mat('paint', { map: TX.wood() }));
    door.name = 'door';
    door.position.set(doorX - dw / 2, 0, hd - 0.04);
    door.castShadow = true;
    grp.add(door);
    const ball = new THREE.Mesh(ballGeo(), mat('toyBall', { std: true, roughness: 0.45 }));
    ball.name = 'ball'; ball.position.set(3.4, 0.09, 1.6); ball.castShadow = true;
    grp.add(ball);
    const colliders = [
      { box: true, x: 0, z: -hd - T / 2, hw: hw + T, hd: T / 2 + 0.05 }, { box: true, x: -hw - T / 2, z: 0, hw: T / 2 + 0.05, hd: hd + T },
      { box: true, x: hw + T / 2, z: 0, hw: T / 2 + 0.05, hd: hd + T },
      { box: true, x: (-hw - T + doorX - dw / 2) / 2, z: hd + T / 2, hw: (doorX - dw / 2 + hw + T) / 2, hd: T / 2 + 0.05 },
      { box: true, x: (doorX + dw / 2 + hw + T) / 2, z: hd + T / 2, hw: (hw + T - doorX - dw / 2) / 2, hd: T / 2 + 0.05 },
      { box: true, x: dx, z: dz, hw: 1.18, hd: 0.38 },
      { box: true, x: -hw + 0.25, z: 0.65, hw: 0.25, hd: 1.4 },
      { box: true, x: vet.x, z: vet.z, hw: 0.68, hd: 0.38 }, { box: true, x: hw - 0.25, z: -hd + 1.0, hw: 0.25, hd: 0.52 },
      { x: 1.6, z: hd - 0.45, r: 0.35 }, { x: -hw + 0.45, z: hd - 0.45, r: 0.3 },
    ];
    // cage side walls (thin) so animals enter from the front only
    for (let i = 0; i <= nC; i++) colliders.push({ box: true, x: cx0 + i * cw, z: -hd + 0.52, hw: 0.04, hd: 0.5 });
    for (const p of pens) {
      const x0 = p.x - p.w / 2, x1 = p.x + p.w / 2, z0 = p.z - p.d / 2, z1 = p.z + p.d / 2;
      colliders.push({ box: true, x: p.x, z: z0, hw: p.w / 2, hd: 0.05 }, { box: true, x: x0, z: p.z, hw: 0.05, hd: p.d / 2 }, { box: true, x: x1, z: p.z, hw: 0.05, hd: p.d / 2 });
      colliders.push({ box: true, x: (x0 + p.x - 0.5) / 2, z: z1, hw: (p.x - 0.5 - x0) / 2, hd: 0.05 }, { box: true, x: (x1 + p.x + 0.5) / 2, z: z1, hw: (x1 - p.x - 0.5) / 2, hd: 0.05 });
    }
    for (const c of colliders) if (c.box && c.rot === undefined) c.rot = 0;
    grp.userData = {
      w: W, d: D, wallH: H, name: 'pound',
      spawn: { x: doorX, z: hd - 1.1, yaw: Math.PI },
      exit: { x: doorX, z: hd - 0.3, r: 0.7 },
      petBed: pet, bowl, water,
      light: { x: 0, y: 2.5, z: 0.2 },
      colliders, cages, pens: pens.map((p) => Object.assign({}, p)),
      vet: { x: vet.x, z: vet.z, y: vet.y },
      desk: { x: desk.x, z: desk.z },
    };
    return grp;
  }
  function poundInterior() {
    if (!poundInGrp) poundInGrp = buildPoundInterior();
    const g = poundInGrp.clone();
    g.userData = JSON.parse(JSON.stringify(poundInGrp.userData));
    g.userData.door = g.getObjectByName('door');
    g.userData.ball = g.getObjectByName('ball');
    return g;
  }

  /* ============================================================
     Grass: one clump of 3 curved tapered blades, 1 unit tall.
     Sways in the shared wind; instanceColor tints the clump.
     ============================================================ */
  let grassObj = null;
  function grass(opts = {}) {
    if (grassObj) return grassObj;
    const S = soup();
    const blades = opts.blades || 3;
    const r = rng(99);
    const baseC = L(0x1f4414), tipC = L(0x9cc45a);
    for (let b = 0; b < blades; b++) {
      const a = (b / blades) * TAU + r() * 0.8;
      const off = b === 0 ? 0 : 0.06;
      const ox = Math.cos(a + 1.3) * off, oz = Math.sin(a + 1.3) * off;
      const h = b === 0 ? 1 : 0.7 + r() * 0.25;
      const lean = 0.18 + r() * 0.22, w = 0.045 + r() * 0.015;
      const d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x);
      const seg = 4;
      const P = (t) => new V3(ox + d.x * lean * t * t * h, h * t * (1 - 0.12 * t * t), oz + d.z * lean * t * t * h);
      for (let i = 0; i < seg; i++) {
        const t0 = i / seg, t1 = (i + 1) / seg;
        const w0 = w * (1 - t0 * 0.85), w1 = i === seg - 1 ? 0 : w * (1 - t1 * 0.85);
        const p0 = P(t0), p1 = P(t1);
        const c0 = mixc(baseC, tipC, Math.pow(t0, 0.8)), c1 = mixc(baseC, tipC, Math.pow(t1, 0.8));
        const a0 = p0.clone().addScaledVector(side, -w0), b0 = p0.clone().addScaledVector(side, w0);
        const a1 = p1.clone().addScaledVector(side, -w1), b1 = p1.clone().addScaledVector(side, w1);
        if (i === seg - 1) S.tri(a0, b0, p1, c0, c0, c1, [0, t0], [1, t0], [0.5, t1]);
        else S.quad(a0, b0, b1, a1, c0, c0, c1, c1, [0, t0], [1, t0], [1, t1], [0, t1]);
      }
    }
    const geometry = S.geo(false);
    // normals point mostly up (soft, no black backsides); a little sideways for shape
    const N = geometry.attributes.normal.array, Pp = geometry.attributes.position.array;
    for (let i = 0; i < N.length; i += 3) {
      const nx = N[i] * 0.25 + Pp[i] * 0.4, nz = N[i + 2] * 0.25 + Pp[i + 2] * 0.4, ny = 1;
      const l = Math.hypot(nx, ny, nz);
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    geometry.computeBoundingSphere();
    geometry.boundingSphere.radius = 1.2;
    const uniforms = { time: windU.time, wind: windU.wind };
    const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, fog: true });
    material.onBeforeCompile = (sh) => {
      sh.uniforms.envTime = windU.time;
      sh.uniforms.envWind = windU.wind;
      sh.vertexShader = sh.vertexShader
        .replace('void main() {', 'uniform float envTime;\nuniform float envWind;\n' + GLSL_BASE + '\nvoid main() {')
        .replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position);
  {
    vec3 wb = envBase();
    float h = max(position.y, 0.0);
    float hh = h * h;
    // gust: a soft band traveling across the field
    float gp = dot(wb.xz, vec2(0.12, 0.07)) - envTime * 1.6;
    float gust = pow(0.5 + 0.5 * sin(gp), 3.0);
    float ph = wb.x * 0.37 + wb.z * 0.29;
    float s1 = sin(envTime * 2.1 + ph) * 0.12 + sin(envTime * 3.7 + ph * 1.9) * 0.05;
    vec2 dir = normalize(vec2(0.85, 0.5));
    vec2 bend = (dir * (0.10 + gust * 0.35) + vec2(s1, s1 * 0.6)) * envWind;
    transformed.xz += bend * hh;
    transformed.y -= dot(bend, bend) * hh * 0.35;
  }`)
        .replace('#include <color_vertex>', `#include <color_vertex>
  {
    vec3 wb2 = envBase();
    float gp2 = dot(wb2.xz, vec2(0.12, 0.07)) - envTime * 1.6;
    vColor.rgb *= 1.0 + pow(0.5 + 0.5 * sin(gp2), 3.0) * 0.18 * envWind * position.y;
  }`);
    };
    const prevGrass = material.onBeforeCompile;
    material.onBeforeCompile = (sh) => { prevGrass(sh); noFlip(sh); };
    material.customProgramCacheKey = () => 'env-grass';
    grassObj = { geometry, material, uniforms };
    return grassObj;
  }

  /* ============================================================
     Water
     ============================================================ */
  const waterUniforms = { time: { value: 0 } };
  function water(size = 40, opts = {}) {
    const swampy = !!opts.swampy;
    const shallow = lcol(opts.color != null ? opts.color : swampy ? 0x6a6e3e : 0x4aa6cf);
    const deep = lcol(opts.deep != null ? opts.deep : swampy ? 0x3a3a20 : 0x154d75);
    const opacity = opts.opacity != null ? opts.opacity : swampy ? 0.93 : 0.8;
    const seg = Math.max(8, Math.min(64, Math.round(size / 2)));
    const geo = new THREE.PlaneGeometry(size, size, seg, seg);
    geo.rotateX(-Math.PI / 2);
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
    Object.assign(u, {
      uTime: waterUniforms.time,
      uShallow: { value: shallow }, uDeep: { value: deep },
      uOpacity: { value: opacity }, uSwamp: { value: swampy ? 1 : 0 },
      uSize: { value: size },
    });
    const m = new THREE.ShaderMaterial({
      uniforms: u, fog: true, lights: true, transparent: true, depthWrite: false,
      vertexShader: `
uniform float uTime;
varying vec3 vWorld;
varying vec2 vLocal;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  float t = uTime;
  p.y += (sin(w.x * 0.35 + t * 1.1) * 0.5 + sin(w.z * 0.42 - t * 0.9) * 0.5) * 0.035;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vLocal = position.xz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uTime, uOpacity, uSwamp, uSize;
uniform vec3 uShallow, uDeep;
varying vec3 vWorld;
varying vec2 vLocal;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
float wh(vec2 p) { return sin(p.x) * sin(p.y); }
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.2, -0.98), d4 = vec2(-0.93, -0.37);
  g += d1 * cos(dot(p, d1) * 1.3 + t * 1.6) * 0.30;
  g += d2 * cos(dot(p, d2) * 2.1 - t * 1.9) * 0.22;
  g += d3 * cos(dot(p, d3) * 3.7 + t * 2.6) * 0.12;
  g += d4 * cos(dot(p, d4) * 6.3 - t * 3.1) * 0.07;
  g += vec2(0.6, -0.8) * cos(dot(p, vec2(0.6, -0.8)) * 11.0 + t * 4.0) * 0.035;
  g += vec2(0.95, 0.3) * cos(dot(p, vec2(0.95, 0.3)) * 19.0 - t * 5.0) * 0.03;
  g += vec2(-0.3, 0.95) * cos(dot(p, vec2(-0.3, 0.95)) * 27.0 + t * 6.0) * 0.022;
  return g;
}
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
void main() {
  float t = uTime;
  vec2 g = waveGrad(vWorld.xz, t) * mix(0.16, 0.08, uSwamp);
  vec3 n = normalize(vec3(-g.x, 1.0, -g.y));
  vec3 V = normalize(cameraPosition - vWorld);
  float ndv = clamp(dot(n, V), 0.0, 1.0);
  float fres = 0.02 + 0.98 * pow(1.0 - ndv, 5.0);
  vec3 sunDir = vec3(0.0, 1.0, 0.0);
  vec3 sunCol = vec3(1.0);
  vec3 skyCol = vec3(0.35, 0.55, 0.8);
  vec3 amb = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    skyCol = hemisphereLights[0].skyColor;
    amb += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.7);
  #endif
  #if NUM_DIR_LIGHTS > 0
    sunDir = directionalLights[0].direction; // view space
    sunCol = directionalLights[0].color;
  #endif
  vec3 ld = normalize((vec4(sunDir, 0.0) * viewMatrix).xyz); // view to world
  // reflected sky: deeper blue overhead, toward the fog/horizon color at grazing angles
  vec3 R = reflect(-V, n);
  vec3 horizon = skyCol;
  #ifdef USE_FOG
    horizon = fogColor;
  #endif
  vec3 refl = mix(horizon, skyCol * vec3(0.55, 0.75, 1.0), smoothstep(0.0, 0.5, R.y));
  refl = mix(refl, refl * normalize(uShallow + 0.05) * 1.6, 0.35);
  // body color: looking down we see into the water (shallow tint, more transparent),
  // at low angles the deep color dominates; slow patches break up uniformity
  float patchN = sin(vWorld.x * 0.21 + sin(vWorld.z * 0.17) * 1.5) * sin(vWorld.z * 0.19 + t * 0.05) * 0.5 + 0.5;
  vec3 body = mix(uShallow, uDeep, clamp(0.95 - ndv * 0.45 + patchN * 0.15, 0.0, 1.0));
  vec3 lit = body * (amb * mix(0.55, 0.85, uSwamp) + sunCol * max(ld.y, 0.0) * mix(0.22, 0.4, uSwamp));
  // soft ripple shading so the surface reads as moving water
  float rip = (g.x * 0.7 + g.y * 0.5) / mix(0.16, 0.08, uSwamp);
  lit *= 1.0 + rip * 0.12;
  vec3 col = mix(lit, refl, min(fres, 0.5) * mix(0.75, 0.4, uSwamp));
  // sun glint
  vec3 h = normalize(ld + V);
  float nh = max(dot(n, h), 0.0);
  float spec = pow(nh, 400.0) * 4.0 + pow(nh, 60.0) * 0.15;
  col += sunCol * spec * mix(1.0, 0.3, uSwamp) * smoothstep(-0.05, 0.1, ld.y);
  float alpha = mix(uOpacity, 1.0, clamp(fres * 1.5 + (1.0 - ndv) * 0.3, 0.0, 1.0));
  // swamp: floating specks and duckweed patches
  if (uSwamp > 0.5) {
    vec2 c = floor(vWorld.xz * 3.0);
    vec2 f = fract(vWorld.xz * 3.0) - 0.5;
    float hsh = hash(c);
    vec2 o = vec2(hash(c + 7.0), hash(c + 13.0)) - 0.5;
    float d = length(f - o * 0.6);
    float speck = step(0.82, hsh) * smoothstep(0.12, 0.05, d);
    // small duckweed rafts drifting slowly
    vec2 q = vWorld.xz * 1.2 + vec2(t * 0.03, t * 0.01);
    float pch = smoothstep(0.62, 0.7, sin(q.x * 1.3 + sin(q.y * 0.9) * 2.0) * sin(q.y * 1.1 + sin(q.x * 0.7) * 2.0) * 0.5 + 0.5);
    pch *= step(0.5, hash(floor(vWorld.xz * 0.15)));
    vec3 weed = vec3(0.09, 0.16, 0.025) * (amb + sunCol * max(ld.y, 0.0) * 0.8);
    col = mix(col, weed, max(speck, pch * 0.85));
    alpha = max(alpha, max(speck, pch));
  }
  gl_FragColor = vec4(col, alpha);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'water';
    mesh.receiveShadow = false;
    mesh.renderOrder = 1;
    return mesh;
  }

  /* ============================================================
     Yard: picket fence, animal pen, kennel, signpost
     ============================================================ */
  const yardCache = {};
  function cachedGroup(key, build) {
    if (!yardCache[key]) yardCache[key] = build();
    const src = yardCache[key], g = src.clone();
    g.userData = JSON.parse(JSON.stringify(src.userData));
    return g;
  }
  /* white picket fence along +X from x = 0 */
  function picket(len = 4) {
    len = Math.max(0.6, Math.round(len * 100) / 100);
    return cachedGroup('picket' + len.toFixed(2), () => {
      const white = L(0xf4f2ec), gs = [];
      const posts = Math.max(2, Math.round(len / 2.4) + 1), step = len / (posts - 1);
      for (let i = 0; i < posts; i++) {
        gs.push(boxG(0.1, 1.1, 0.1, i * step, 0.55, 0, white));
        gs.push(paint(place(new THREE.ConeGeometry(0.085, 0.12, 4), i * step, 1.16, 0, 0, Math.PI / 4, 0), white));
      }
      for (const y of [0.3, 0.75]) gs.push(boxG(len, 0.07, 0.04, len / 2, y, -0.06, white));
      // pointed pickets: a pentagon prism
      const S = soup();
      for (let x = 0.12; x < len - 0.06; x += 0.15) {
        if (posts > 1 && Math.abs(x / step - Math.round(x / step)) * step < 0.08) continue;
        const w = 0.042, h = 0.9, tip = 0.08, z0 = -0.02, z1 = 0.0;
        const pts = [[x - w, 0.04], [x + w, 0.04], [x + w, h], [x, h + tip], [x - w, h]];
        const c = mulc(white, 0.95 + 0.05 * Math.sin(x * 37));
        for (let k = 0; k < 5; k++) {
          const p = pts[k], q = pts[(k + 1) % 5];
          S.quad(new V3(p[0], p[1], z1), new V3(p[0], p[1], z0), new V3(q[0], q[1], z0), new V3(q[0], q[1], z1), c);
        }
        S.tri(new V3(pts[0][0], pts[0][1], z1), new V3(pts[1][0], pts[1][1], z1), new V3(pts[2][0], pts[2][1], z1), c);
        S.tri(new V3(pts[0][0], pts[0][1], z1), new V3(pts[2][0], pts[2][1], z1), new V3(pts[4][0], pts[4][1], z1), c);
        S.tri(new V3(pts[4][0], pts[4][1], z1), new V3(pts[2][0], pts[2][1], z1), new V3(pts[3][0], pts[3][1], z1), c);
        S.tri(new V3(pts[0][0], pts[0][1], z0), new V3(pts[2][0], pts[2][1], z0), new V3(pts[1][0], pts[1][1], z0), c);
        S.tri(new V3(pts[0][0], pts[0][1], z0), new V3(pts[4][0], pts[4][1], z0), new V3(pts[2][0], pts[2][1], z0), c);
        S.tri(new V3(pts[4][0], pts[4][1], z0), new V3(pts[3][0], pts[3][1], z0), new V3(pts[2][0], pts[2][1], z0), c);
      }
      gs.push(boxUV(S.geo(false), 1));
      const grp = new THREE.Group();
      grp.name = 'picket';
      grp.add(meshOf(merge(gs), mat('paint', { map: TX.wood() })));
      grp.userData = { len };
      return grp;
    });
  }
  /* small wooden animal pen w x d centered at the origin, gate gap on the +Z side */
  function pen(w = 4, d = 3) {
    w = Math.max(1.5, Math.round(w * 100) / 100); d = Math.max(1.5, Math.round(d * 100) / 100);
    return cachedGroup('pen' + w + 'x' + d, () => {
      const r = rng(strSeed('pen' + w + d)), gs = [], wc = () => mixc(L(0x7a6046), L(0x9a8064), r());
      const gate = 1.2, hw = w / 2, hd = d / 2;
      const sides = [
        [[-hw, -hd], [hw, -hd]], [[hw, -hd], [hw, hd]], [[-hw, hd], [-hw, -hd]],
        [[hw, hd], [gate / 2, hd]], [[-gate / 2, hd], [-hw, hd]],
      ];
      const colliders = [];
      for (const [[ax, az], [bx, bz]] of sides) {
        const len = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.round(len / 1.5));
        for (let i = 0; i <= n; i++) {
          const x = ax + (bx - ax) * (i / n), z = az + (bz - az) * (i / n), c = wc();
          gs.push(paint(place(new THREE.BoxGeometry(0.12, 1.05, 0.12), x, 0.52, z, 0, r() * 0.2, 0), c));
        }
        const ang = Math.atan2(bz - az, bx - ax);
        for (const y of [0.35, 0.8]) {
          const g = prep(new THREE.BoxGeometry(len + 0.1, 0.12, 0.04));
          g.rotateY(-ang); g.translate((ax + bx) / 2, y, (az + bz) / 2);
          gs.push(paint(g, wc()));
        }
        colliders.push({ box: true, x: (ax + bx) / 2, z: (az + bz) / 2, hw: Math.abs(bx - ax) / 2 + 0.08, hd: Math.abs(bz - az) / 2 + 0.08, rot: 0 });
      }
      // a little straw on the ground and a water trough inside
      const straw = prep(new THREE.CircleGeometry(0.8, 10)); straw.rotateX(-Math.PI / 2); straw.translate(-hw * 0.35, 0.02, -hd * 0.3);
      gs.push(paint(straw, L(0xd8bc70)));
      gs.push(boxG(0.9, 0.3, 0.35, hw * 0.45, 0.15, -hd + 0.4, L(0x6a5a48)));
      gs.push(boxG(0.8, 0.02, 0.27, hw * 0.45, 0.29, -hd + 0.4, L(0x4a78a0)));
      const grp = new THREE.Group();
      grp.name = 'pen';
      grp.add(meshOf(boxUV(merge(gs), 1.2), mat('fenceWood', { map: TX.wood() })));
      grp.userData = { w, d, gate: { x: 0, z: hd }, colliders };
      return grp;
    });
  }
  /* small wooden pet house (about 1.2 m) with a round topped door on +Z */
  function kennel() {
    return cachedGroup('kennel', () => {
      const W = 1.0, D = 1.2, H = 0.72, R = 0.42, wall = L(0xb0442e), trim = L(0xf2eee4), roofC = L(0x4a4a4e);
      const walls = [], trims = [], roofs = [];
      walls.push(wallQuadX(-D / 2, D / 2, 0.08, H, W / 2, 1, wall), wallQuadX(-D / 2, D / 2, 0.08, H, -W / 2, -1, wall));
      walls.push(polyZ([[-W / 2, 0.08], [W / 2, 0.08], [W / 2, H], [0, H + R], [-W / 2, H]], -D / 2, -1, wall));
      // front wall around an arched opening
      const S = soup(), op = 0.26, ot = 0.45;
      const front = [];
      for (let k = 0; k <= 8; k++) { const a = Math.PI * (k / 8); front.push([Math.cos(a) * op, ot + Math.sin(a) * op]); }
      // fill the front as strips between the outline of the opening and the wall edge
      const outline = (x) => { const yTop = x <= 0 ? H + R * (1 + x / (W / 2)) : H + R * (1 - x / (W / 2)); return Math.min(yTop, H + R); };
      const N = 16;
      for (let i = 0; i < N; i++) {
        const x0 = -W / 2 + (i / N) * W, x1 = -W / 2 + ((i + 1) / N) * W;
        const hole = (x) => (Math.abs(x) < op ? ot + Math.sqrt(op * op - x * x) : 0.08);
        const b0 = hole(x0), b1 = hole(x1), t0 = outline(x0), t1 = outline(x1);
        S.quad(new V3(x0, b0, D / 2), new V3(x1, b1, D / 2), new V3(x1, t1, D / 2), new V3(x0, t0, D / 2), wall);
      }
      walls.push(S.geo(false));
      walls.push(boxG(W + 0.06, 0.08, D + 0.06, 0, 0.04, 0, mulc(wall, 0.7)));
      // dark inside
      const inner = prep(new THREE.BoxGeometry(op * 2, ot + op, 0.02)).translate(0, (ot + op) / 2 + 0.04, D / 2 - 0.3);
      trims.push(paint(inner, L(0x1a1410)));
      for (const s of [-1, 1]) trims.push(boxG(0.06, H, 0.06, s * (W / 2), H / 2, D / 2 + 0.01, trim));
      trims.push(boxG(0.4, 0.12, 0.02, 0, H + 0.18, D / 2 + 0.01, L(0xf6e6b0)));
      const rp = roofX(D, W, H, H, 0, H + R, 0.1, 0.12, roofC, trim);
      for (const k of ['top', 'under']) rp[k].rotateY(Math.PI / 2);
      for (const f of rp.fascia) { f.rotateY(Math.PI / 2); trims.push(f); }
      roofs.push(rp.top); trims.push(rp.under);
      const grp = new THREE.Group();
      grp.name = 'kennel';
      grp.add(meshOf(boxUV(merge(walls), 3), mat('barnBoards', { map: TX.boards() })));
      grp.add(meshOf(merge(trims), mat('paint', { map: TX.wood() })));
      grp.add(meshOf(merge(roofs), mat('shingle', { map: TX.shingle() })));
      grp.userData = { w: W, d: D, h: H + R + 0.1, door: { x: 0, z: D / 2 + 0.3 }, inside: { x: 0, z: 0 }, hw: W / 2 + 0.05, hd: D / 2 + 0.05 };
      return grp;
    });
  }
  /* wooden signpost about 1.8 m tall with painted text */
  const signTexCache = {};
  function signTexture(text) {
    if (signTexCache[text]) return signTexCache[text];
    const cv = document.createElement('canvas');
    const c = cv.getContext('2d');
    const font = "bold 84px Grandstander, 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif";
    c.font = font;
    const tw = Math.ceil(c.measureText(text).width);
    cv.width = Math.min(2048, Math.max(256, tw + 90)); cv.height = 140;
    const r = rng(strSeed(text));
    c.fillStyle = '#8a6440'; c.fillRect(0, 0, cv.width, cv.height);
    for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '60,40,20' : '200,160,110'},${0.08 + r() * 0.1})`; c.fillRect(0, r() * cv.height, cv.width, 1 + r() * 2); }
    c.strokeStyle = 'rgba(50,30,15,0.6)'; c.lineWidth = 6; c.strokeRect(6, 6, cv.width - 12, cv.height - 12);
    c.font = font; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(40,25,10,0.5)'; c.fillText(text, cv.width / 2 + 3, cv.height / 2 + 5);
    c.fillStyle = '#fbf2d8'; c.fillText(text, cv.width / 2, cv.height / 2 + 2);
    const t = new THREE.CanvasTexture(cv);
    t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    signTexCache[text] = { tex: t, aspect: cv.width / cv.height };
    return signTexCache[text];
  }
  const signMats = {};
  function sign(text = 'Hello') {
    text = String(text).slice(0, 40);
    const st = signTexture(text);
    const bh = 0.42, bw = Math.min(3.2, Math.max(0.9, bh * st.aspect)), by = 1.45;
    const grp = new THREE.Group();
    grp.name = 'sign';
    const wc = L(0x7a5a3c), gs = [];
    const posts = bw > 1.5 ? [-bw / 2 + 0.12, bw / 2 - 0.12] : [0];
    for (const x of posts) {
      gs.push(boxG(0.1, by + bh / 2 + 0.08, 0.1, x, (by + bh / 2 + 0.08) / 2, -0.06, wc, 2));
      gs.push(paint(place(new THREE.ConeGeometry(0.08, 0.1, 4), x, by + bh / 2 + 0.13, -0.06, 0, Math.PI / 4, 0), mulc(wc, 0.8)));
    }
    gs.push(boxG(bw + 0.08, bh + 0.08, 0.06, 0, by, 0, mulc(wc, 0.85), 2));
    grp.add(meshOf(merge(gs), mat('fenceWood', { map: TX.wood() })));
    if (!signMats[text]) {
      signMats[text] = new THREE.MeshLambertMaterial({ map: st.tex, fog: true });
    }
    const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), signMats[text]);
    face.position.set(0, by, 0.031);
    face.receiveShadow = true;
    grp.add(face);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), signMats[text]);
    back.position.set(0, by, -0.031); back.rotation.y = Math.PI;
    grp.add(back);
    grp.userData = { text, w: bw, h: by + bh / 2 + 0.15 };
    return grp;
  }

  /* Fog and clear colors are used as display colors by three r149 when ColorManagement.legacyMode is on
     (the default): convert to sRGB then. With legacyMode off, three converts from linear itself. */
  const l2s = (c) => (c <= 0.0031308 ? c * 12.92 : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  function displayColor(lin, out) {
    const legacy = !THREE.ColorManagement || THREE.ColorManagement.legacyMode !== false;
    if (legacy) { out.r = l2s(lin.r); out.g = l2s(lin.g); out.b = l2s(lin.b); } else out.copy(lin);
    return out;
  }

  /* ============================================================
     Sky dome
     ============================================================ */
  function sky() {
    const geo = new THREE.SphereGeometry(900, 48, 24);
    const u = {
      uSun: { value: new V3(0.3, 0.6, 0.2).normalize() },
      uDay: { value: 1 }, uDusk: { value: 0 }, uTime: { value: 0 },
      uZenith: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() }, uGlow: { value: new THREE.Color() },
    };
    const m = new THREE.ShaderMaterial({
      uniforms: u, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: `
varying vec3 vDir;
void main() {
  vDir = normalize(position);
  vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  gl_Position = p.xyww;
}`,
      fragmentShader: `
uniform vec3 uSun, uZenith, uHorizon, uGlow;
uniform float uDay, uDusk, uTime;
varying vec3 vDir;
float hash3(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
void main() {
  vec3 d = normalize(vDir);
  float y = d.y;
  float hz = pow(1.0 - clamp(y, 0.0, 1.0), 3.0);
  vec3 col = mix(uZenith, uHorizon, hz);
  // below the horizon: fade to a slightly darker horizon color (hidden by terrain mostly)
  col = mix(col, uHorizon * 0.92, smoothstep(0.0, -0.15, y));
  float sd = dot(d, uSun);
  // dusk glow hugging the horizon around the sun
  float az = clamp(0.5 + 0.5 * dot(normalize(vec2(d.x, d.z) + 1e-5), normalize(vec2(uSun.x, uSun.z) + 1e-5)), 0.0, 1.0);
  float band = exp(-max(y, 0.0) * 5.0) * (1.0 - smoothstep(0.0, -0.2, y));
  float near = pow(az, 4.0);
  col = mix(col, uGlow, clamp(band * near * uDusk * 1.1, 0.0, 0.85));
  col += uGlow * band * 0.12 * uDusk;
  col += vec3(1.0, 0.85, 0.5) * exp(-max(y, 0.0) * 14.0) * pow(az, 12.0) * uDusk * 0.5;
  // sun disc + halo
  float sunUp = smoothstep(-0.12, 0.02, uSun.y);
  vec3 sunCol = mix(vec3(1.0, 0.5, 0.2), vec3(1.0, 0.96, 0.88), smoothstep(0.05, 0.4, uSun.y));
  col += sunCol * (pow(max(sd, 0.0), 900.0) * 3.0 + smoothstep(0.9993, 0.9997, sd) * 4.0) * sunUp;
  col += sunCol * pow(max(sd, 0.0), 12.0) * 0.22 * sunUp * (0.4 + 0.6 * uDay);
  // night: stars and moon
  float night = 1.0 - uDay;
  if (night > 0.01) {
    vec3 sp = d * 220.0;
    vec3 cell = floor(sp);
    float h = hash3(cell);
    vec3 f = fract(sp) - 0.5;
    float star = step(0.985, h) * smoothstep(0.32, 0.0, length(f - (vec3(hash3(cell + 3.1), hash3(cell + 7.7), hash3(cell + 1.3)) - 0.5) * 0.4));
    float tw = 0.6 + 0.4 * sin(uTime * (2.0 + h * 5.0) + h * 40.0);
    float bright = fract(h * 97.0);
    col += vec3(0.9, 0.93, 1.0) * star * tw * (0.6 + bright * 1.4) * night * smoothstep(0.0, 0.25, y);
    // moon opposite the sun
    vec3 md = normalize(-uSun + vec3(0.0, 0.25, 0.0));
    float m = dot(d, md);
    float disc = smoothstep(0.99935, 0.9996, m);
    // simple shading: a crescent-ish terminator and maria
    vec3 mp = d - md;
    float maria = 0.85 + 0.15 * sin(mp.x * 900.0) * sin(mp.y * 700.0 + 1.0);
    col += vec3(0.95, 0.94, 0.86) * disc * maria * night * 1.4;
    col += vec3(0.45, 0.5, 0.7) * pow(max(m, 0.0), 300.0) * 0.35 * night;
  }
  gl_FragColor = vec4(col, 1.0);
  #include <encodings_fragment>
}`,
    });
    // the sky is authored in display colors: not tone mapped, so fog (which three mixes in after tone mapping
    // and encoding) can match the horizon exactly
    m.toneMapped = false;
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'sky';
    mesh.frustumCulled = false;
    mesh.renderOrder = -10;
    const horizonColor = new THREE.Color(), horizonLinear = new THREE.Color();
    // palette (linear)
    const P = {
      dayZ: lcol(0x3f86d6), dayH: lcol(0xbfdcef),
      duskZ: lcol(0x3a4f8a), duskH: lcol(0xe8a890), glow: lcol(0xff8a3a),
      nightZ: lcol(0x050a1c), nightH: lcol(0x1a2846),
    };
    const tz = new THREE.Color(), th = new THREE.Color();
    function update(sunDir, day = 1, dusk = 0) {
      if (sunDir) u.uSun.value.copy(sunDir).normalize();
      day = clamp(day, 0, 1); dusk = clamp(dusk, 0, 1);
      u.uDay.value = day; u.uDusk.value = dusk;
      u.uTime.value = performance.now() / 1000;
      tz.copy(P.nightZ).lerp(P.dayZ, day);
      th.copy(P.nightH).lerp(P.dayH, day);
      tz.lerp(P.duskZ, dusk * 0.6);
      th.lerp(P.duskH, dusk * 0.75 * Math.max(0.35, day));
      u.uZenith.value.copy(tz);
      u.uHorizon.value.copy(th);
      u.uGlow.value.copy(P.glow).multiplyScalar(0.6 + 0.4 * day);
      // the horizon color the game copies to fog and clear color, warmed a little toward the dusk glow
      horizonLinear.copy(th).lerp(P.glow, dusk * 0.12 * day);
      displayColor(horizonLinear, horizonColor);
    }
    update(u.uSun.value, 1, 0);
    return { mesh, update, horizonColor, horizonLinear, uniforms: u };
  }

  /* ============================================================
     Clouds: billboarded soft sprites, several puffs per cloud
     ============================================================ */
  function puffTexture() {
    return canvasTex('puff', 256, 256, (c, w, h, r) => {
      // cumulus heap: round lobes piled on a flat base; drawn as soft discs, then shaded top-lit
      const lobes = [];
      const base = h * 0.7;
      for (let i = 0; i < 7; i++) { const x = w * (0.2 + 0.6 * (i / 6)), rr = w * (0.09 + r() * 0.05); lobes.push([x, base - rr * 0.55, rr]); }
      for (let i = 0; i < 5; i++) { const x = w * (0.3 + 0.4 * (i / 4)) + (r() - 0.5) * w * 0.05, rr = w * (0.11 + r() * 0.05); lobes.push([x, base - rr * 1.25 - (0.5 - Math.abs(i / 4 - 0.5)) * w * 0.12, rr]); }
      lobes.push([w * (0.45 + r() * 0.1), base - w * 0.33, w * (0.13 + r() * 0.03)]);
      for (const [x, y, rr] of lobes) {
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.62, 'rgba(255,255,255,0.9)'); g.addColorStop(0.85, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.fill();
      }
      // flat soft base
      c.globalCompositeOperation = 'destination-in';
      const cut = c.createLinearGradient(0, base - h * 0.02, 0, base + h * 0.05);
      cut.addColorStop(0, 'rgba(0,0,0,1)'); cut.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = cut; c.fillRect(0, 0, w, h);
      // shading: lit tops, cool shaded underside, and a lit rim on each lobe
      c.globalCompositeOperation = 'source-atop';
      const sh = c.createLinearGradient(0, base - h * 0.45, 0, base);
      sh.addColorStop(0, 'rgb(255,255,255)'); sh.addColorStop(0.65, 'rgb(250,251,253)'); sh.addColorStop(1, 'rgb(192,200,216)');
      c.fillStyle = sh; c.fillRect(0, 0, w, h);
      // soft highlight on the upper-left of the heap and a few wispy darker billows lower down
      for (const [x, y, rr] of lobes) {
        if (y > base - rr * 0.9) continue;
        const g = c.createRadialGradient(x - rr * 0.3, y - rr * 0.4, 0, x - rr * 0.3, y - rr * 0.4, rr * 0.9);
        g.addColorStop(0, 'rgba(255,255,255,0.35)'); g.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = g; c.fillRect(0, 0, w, h);
      }
      for (let i = 0; i < 160; i++) {
        const x = w * (0.15 + r() * 0.7), y = base - r() * h * 0.25, rr = 4 + r() * 10;
        const g = c.createRadialGradient(x, y, 0, x, y, rr);
        g.addColorStop(0, `rgba(170,182,204,${0.05 + r() * 0.07})`); g.addColorStop(1, 'rgba(170,182,204,0)');
        c.fillStyle = g; c.fillRect(x - rr, y - rr, rr * 2, rr * 2);
      }
      c.globalCompositeOperation = 'source-over';
    }, { clamp: true, srgb: true });
  }
  function clouds(count = 14, radius = 400, height = 160) {
    const group = new THREE.Group();
    group.name = 'clouds';
    const r = rng(4242);
    const mats = [];
    const items = [];
    for (let i = 0; i < count; i++) {
      const a = r() * TAU, d = radius * (0.25 + 0.75 * Math.sqrt(r()));
      const cloud = new THREE.Group();
      cloud.position.set(Math.cos(a) * d, height + (r() - 0.5) * height * 0.25, Math.sin(a) * d);
      const size = 45 + r() * 55;
      const m = new THREE.SpriteMaterial({ map: puffTexture(), transparent: true, depthWrite: false, fog: false, color: 0xffffff, opacity: 0.95 });
      mats.push(m);
      // two to four heaps side by side make one cloud
      const nb = 2 + Math.floor(r() * 3);
      for (let k = 0; k < nb; k++) {
        const sp = new THREE.Sprite(m);
        const sc = size * (0.8 + r() * 0.45) * (k === 0 ? 1.15 : 1);
        sp.scale.set(sc, sc, 1);
        sp.position.set((k === 0 ? 0 : (k % 2 ? 1 : -1) * (0.35 + 0.15 * k) * size) + (r() - 0.5) * size * 0.1, sc * 0.2 - size * 0.2, (r() - 0.5) * size * 0.4 + (k === 0 ? 2 : 0));
        cloud.add(sp);
      }
      group.add(cloud);
      items.push({ obj: cloud, speed: 0.6 + r() * 0.8 });
    }
    const dayCol = new THREE.Color(1, 1, 1), nightCol = new THREE.Color(0.08, 0.1, 0.17), duskCol = new THREE.Color(1.0, 0.62, 0.5);
    const tmp = new THREE.Color();
    function update(dt = 0, day = 1, dusk = 0) {
      for (const it of items) {
        it.obj.position.x += it.speed * dt;
        it.obj.position.z += it.speed * dt * 0.35;
        const p = it.obj.position, l = Math.hypot(p.x, p.z);
        if (l > radius * 1.05) { p.x = -p.x * 0.98; p.z = -p.z * 0.98; }
      }
      tmp.copy(nightCol).lerp(dayCol, clamp(day, 0, 1)).lerp(duskCol, clamp(dusk, 0, 1) * 0.8 * clamp(day * 1.3, 0, 1));
      for (const m of mats) { m.color.copy(tmp); m.opacity = 0.8 + 0.2 * day; }
    }
    update(0, 1, 0);
    return { group, update };
  }

  /* endless soft cloud layer far below the sky islands */
  function cloudSea(size = 1600, y = -40) {
    const geo = new THREE.PlaneGeometry(size, size, 1, 1);
    geo.rotateX(-Math.PI / 2);
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
    u.uTime = { value: 0 };
    const m = new THREE.ShaderMaterial({
      uniforms: u, fog: true, lights: true, transparent: false,
      vertexShader: `
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uTime;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
float h2(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float vn(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(h2(i), h2(i + vec2(1, 0)), f.x), mix(h2(i + vec2(0, 1)), h2(i + vec2(1, 1)), f.x), f.y); }
float fbm2(vec2 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += vn(p) * a; p = p * 2.03 + 11.7; a *= 0.5; } return s; }
float field(vec2 p, float t) {
  // billowy cumulus: sharpened cells of noise
  float n = fbm2(p + vec2(t * 0.004, t * 0.002));
  float c = fbm2(p * 2.3 - vec2(t * 0.006, 0.0));
  return pow(clamp(n * 1.25 - 0.1, 0.0, 1.0), 1.4) * 0.8 + c * 0.25;
}
void main() {
  vec2 p = vWorld.xz * 0.01;
  float e = 0.02;
  float h = field(p, uTime);
  float hx = field(p + vec2(e, 0.0), uTime), hz = field(p + vec2(0.0, e), uTime);
  vec3 n = normalize(vec3(-(hx - h) / e * 0.35, 1.0, -(hz - h) / e * 0.35));
  vec3 sunCol = vec3(1.0); vec3 sky = vec3(0.6, 0.7, 0.85); vec3 ld = vec3(0.3, 0.8, 0.2);
  #if NUM_DIR_LIGHTS > 0
    sunCol = directionalLights[0].color;
    ld = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
  #endif
  #if NUM_HEMI_LIGHTS > 0
    sky = hemisphereLights[0].skyColor;
  #endif
  // overall light level from the scene lights, then a fixed-contrast billow shading on top
  vec3 level = sky * 0.42 + sunCol * 0.22 * max(ld.y, 0.0) + ambientLightColor;
  float slope = dot(normalize(n.xz + 1e-4), normalize(ld.xz + 1e-4)) * length(n.xz);
  float shade = clamp(0.25 + 0.75 * smoothstep(0.12, 0.7, h) + slope * 1.6, 0.0, 1.0);
  vec3 col = level * mix(vec3(0.55, 0.62, 0.8), vec3(1.0, 0.99, 0.97), shade);
  gl_FragColor = vec4(col, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #ifdef USE_FOG
    // the sea sits far below: thin the fog so the billows still read, fade fully only near the horizon
    float fogFactor = smoothstep(fogNear, fogFar * 3.0, vFogDepth);
    gl_FragColor.rgb = mix(gl_FragColor.rgb, fogColor, fogFactor);
  #endif
}`,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.position.y = y;
    mesh.name = 'cloudSea';
    mesh.frustumCulled = false;
    // pass the camera position as center to keep the layer endless (the pattern is in world space)
    return { mesh, update(dt = 0, center) { u.uTime.value += dt; if (center) { mesh.position.x = center.x; mesh.position.z = center.z; } }, uniforms: u };
  }

  function rainbow(radius = 120) {
    const geo = new THREE.RingGeometry(radius * 0.88, radius, 96, 1, 0, Math.PI);
    const m = new THREE.ShaderMaterial({
      uniforms: { uIn: { value: radius * 0.88 }, uOut: { value: radius }, uOpacity: { value: 0.45 } },
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: false,
      vertexShader: `varying vec2 vP; void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `
uniform float uIn, uOut, uOpacity;
varying vec2 vP;
vec3 hue(float h) { return clamp(abs(mod(h * 6.0 + vec3(0.0, 4.0, 2.0), 6.0) - 3.0) - 1.0, 0.0, 1.0); }
void main() {
  float t = (length(vP) - uIn) / (uOut - uIn);
  vec3 c = hue((1.0 - t) * 0.78);
  float a = smoothstep(0.0, 0.15, t) * smoothstep(1.0, 0.85, t);
  a *= smoothstep(0.0, 0.25 * uOut, vP.y);
  gl_FragColor = vec4(c * a * uOpacity, 1.0);
}`,
    });
    const mesh = new THREE.Mesh(geo, m);
    mesh.name = 'rainbow';
    mesh.renderOrder = 2;
    mesh.frustumCulled = false;
    return mesh;
  }

  /* ============================================================
     Glow, leaf icon, fireflies
     ============================================================ */
  const glowTexture = canvasTex('glow', 64, 64, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.2, 'rgba(255,255,255,0.75)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.22)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { clamp: true, srgb: true });

  const leafTexture = canvasTex('leafIcon', 64, 64, (c, w, h) => {
    c.save();
    c.translate(w / 2, h / 2); c.rotate(-Math.PI / 4); c.translate(-w / 2, -h / 2);
    const leaf = new Path2D();
    leaf.moveTo(w * 0.5, h * 0.08);
    leaf.bezierCurveTo(w * 0.86, h * 0.3, w * 0.84, h * 0.7, w * 0.5, h * 0.88);
    leaf.bezierCurveTo(w * 0.16, h * 0.7, w * 0.14, h * 0.3, w * 0.5, h * 0.08);
    const g = c.createLinearGradient(w * 0.3, 0, w * 0.7, h);
    g.addColorStop(0, '#8fd45f'); g.addColorStop(1, '#3f9a3a');
    c.fillStyle = g; c.fill(leaf);
    c.lineWidth = 3; c.strokeStyle = '#21522a'; c.stroke(leaf);
    c.lineCap = 'round'; c.lineWidth = 2.2;
    c.beginPath(); c.moveTo(w * 0.5, h * 0.96); c.lineTo(w * 0.5, h * 0.18); c.stroke();
    c.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const y = h * (0.62 - i * 0.14);
      c.beginPath(); c.moveTo(w * 0.5, y + 6); c.lineTo(w * 0.32, y - 2); c.moveTo(w * 0.5, y + 6); c.lineTo(w * 0.68, y - 2); c.stroke();
    }
    c.restore();
  }, { clamp: true, srgb: true });

  function fireflies(count = 60) {
    const r = rng(777);
    const pos = new Float32Array(count * 3), seed = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) { seed[i * 4] = r() * 100; seed[i * 4 + 1] = r() * 100; seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r(); }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    const u = { uTime: { value: 0 }, uCenter: { value: new V3() }, uNight: { value: 0 }, uMap: { value: glowTexture }, uScale: { value: 300 } };
    const m = new THREE.ShaderMaterial({
      uniforms: u, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: `
attribute vec4 seed;
uniform float uTime, uNight, uScale;
uniform vec3 uCenter;
varying float vA;
void main() {
  float t = uTime;
  vec3 p;
  // each firefly wanders in a cell near the center; positions wrap within 50 m
  vec2 base = vec2(seed.x, seed.y) * 0.5;
  vec2 o = vec2(sin(t * 0.21 + seed.x) + 0.5 * sin(t * 0.53 + seed.y), cos(t * 0.17 + seed.y) + 0.5 * cos(t * 0.47 + seed.x)) * 2.5;
  vec2 xz = mod(base + o - uCenter.xz + 25.0, 50.0) - 25.0 + uCenter.xz;
  p = vec3(xz.x, uCenter.y + 0.4 + seed.z * 2.2 + sin(t * 0.9 + seed.x) * 0.35, xz.y);
  vec4 mv = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float blink = 0.25 + 0.75 * smoothstep(0.3, 0.9, sin(t * (1.2 + seed.w * 1.5) + seed.y * 7.0) * 0.5 + 0.5);
  float distF = 1.0 - smoothstep(18.0, 25.0, length(xz - uCenter.xz));
  vA = blink * uNight * distF;
  gl_PointSize = max(2.5, uScale * (0.3 + 0.1 * seed.z) / -mv.z);
}`,
      fragmentShader: `
uniform sampler2D uMap;
varying float vA;
void main() {
  if (vA < 0.01) discard;
  vec4 tx = texture2D(uMap, gl_PointCoord);
  float d = length(gl_PointCoord - 0.5);
  float core = smoothstep(0.16, 0.0, d);
  vec3 c = vec3(0.7, 1.0, 0.25) * tx.a * 1.4 + vec3(1.0, 1.0, 0.75) * core * 1.5;
  gl_FragColor = vec4(c * vA, 1.0);
}`,
    });
    const points = new THREE.Points(geo, m);
    points.frustumCulled = false;
    points.name = 'fireflies';
    const sz = new THREE.Vector2();
    // world-size points: pixels per meter at distance 1 from the camera projection
    points.onBeforeRender = (renderer, scene, camera) => {
      renderer.getDrawingBufferSize(sz);
      u.uScale.value = sz.y * 0.5 * camera.projectionMatrix.elements[5];
    };
    function update(t, center, night = 1) {
      u.uTime.value = t;
      if (center) u.uCenter.value.copy(center);
      u.uNight.value = clamp(night, 0, 1);
      points.visible = night > 0.01;
    }
    return { points, update, uniforms: u };
  }

  /* ============================================================
     Halloween: pumpkins, corn stalks, jack-o'-lanterns, scarecrow, falling leaves
     ============================================================ */
  const pumpkinMat = () => mat('pumpkin', { std: true, roughness: 0.55 });
  /* ribbed pumpkin body of diameter d with its base at y = 0 */
  function pumpkinBody(d, ribs, o = {}) {
    const R = d / 2, seg = ribs * 2;
    const g = prep(new THREE.SphereGeometry(1, seg, o.rows || 12));
    const sq = o.squash || 0.76;
    eachVertex(g, (p) => {
      const ph = Math.atan2(p.z, p.x), ay = Math.abs(p.y);
      const groove = 1 - Math.abs(Math.sin(ph * ribs / 2));
      const k = 1 - 0.085 * Math.pow(groove, 1.5) * (1 - Math.pow(ay, 4));
      const dimple = 0.2 * Math.exp(-(1 - ay) * 7);
      p.set(p.x * k * R, (p.y * sq - Math.sign(p.y) * dimple) * R, p.z * k * R);
    });
    const minY = -(sq - 0.2 * Math.exp(0)) * R;
    smoothNormals(g);
    const base = L(o.color || 0xe0701c), dark = L(o.dark || 0xa8420e), pale = L(o.pale || 0xf0a040);
    paint(g, (x, y, z) => {
      const ph = Math.atan2(z, x);
      const groove = 1 - Math.abs(Math.sin(ph * ribs / 2));
      const n = fbm(x * 9 / d, y * 9 / d, z * 9 / d, 2);
      let c = mixc(base, dark, Math.pow(groove, 2) * 0.8);
      c = mixc(c, pale, smooth(0.1, 0.6, n) * 0.35 * (1 - groove));
      c = mixc(c, L(0x8a7a2a), smooth(-0.55 * R, -0.75 * R, y) * 0.35);
      return c;
    });
    g.translate(0, -minY - 0.02 * R, 0);
    return { g, top: (sq - 0.2) * R * 2 - 0.02 * R };
  }
  function pumpkinStem(d, topY, r, curly) {
    const R = d / 2, gs = [];
    const lean = (r() - 0.5) * 0.6;
    const pts = [new V3(0, topY - 0.02 * R, 0), new V3(lean * 0.05 * R, topY + 0.12 * R, 0.02 * R), new V3(lean * 0.25 * R + 0.06 * R, topY + 0.24 * R, 0.04 * R)];
    gs.push(tube(path(pts, 4), (i, t) => lerp(0.075, 0.05, t) * R * (1 + 0.15 * Math.cos(i * 0)), { radial: 6, cap: 'end', capColor: L(0x9a8a5a), color: (t, a) => mixc(L(0x5a5a2a), L(0x7a6a3a), 0.5 + 0.5 * Math.cos(a * 6)) }));
    if (curly) {
      // a thin curly tendril
      const cp = [];
      for (let i = 0; i <= 14; i++) {
        const t = i / 14, a = t * TAU * 1.6;
        cp.push(new V3(0.05 * R + t * 0.35 * R + Math.cos(a) * 0.07 * R, topY + 0.04 * R + Math.sin(a) * 0.07 * R + t * 0.05 * R, -0.05 * R + Math.sin(a * 0.5) * 0.04 * R));
      }
      gs.push(tube(cp, Math.max(0.004, 0.012 * R), { radial: 3, color: () => L(0x5a7a2a) }));
    }
    return merge(gs);
  }
  function makePumpkin(v) {
    const d = [0.32, 0.45, 0.6][v % 3], r = rng(9500 + v);
    const ribs = v === 0 ? 8 : 10;
    const { g, top } = pumpkinBody(d, ribs, { color: [0xe8781e, 0xdc6a18, 0xd4621a][v % 3], rows: v === 0 ? 9 : 11, squash: [0.8, 0.74, 0.7][v % 3] });
    const geo = merge([g, pumpkinStem(d, top, r, true)]);
    return { parts: [{ geometry: geo, material: pumpkinMat(), castShadow: true }], radius: v === 2 ? 0.28 : 0 };
  }

  function makeCornstalk() {
    const r = rng(9600), S = soup(), gs = [];
    const tieY = 0.75, n = 9;
    const dry = L(0xc4a464), dryDark = L(0x86683e), pale = L(0xdcc088);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.4;
      const dir = new V3(Math.cos(a), 0, Math.sin(a));
      const hgt = 1.55 + r() * 0.35;
      const p0 = new V3(dir.x * 0.16, 0, dir.z * 0.16);
      const p1 = new V3(dir.x * 0.05, tieY, dir.z * 0.05);
      const p2 = new V3(dir.x * (0.2 + r() * 0.12), hgt, dir.z * (0.2 + r() * 0.12));
      const pts = [p0, p1, p2];
      gs.push(tube(path(pts, 3), (k, t) => lerp(0.024, 0.012, t), { radial: 4, cap: 'end', color: (t) => mixc(dryDark, dry, 0.4 + t * 0.6) }));
      // two or three dry curling leaves along the upper stalk
      const nl = 3 + (r() < 0.5 ? 1 : 0);
      for (let k = 0; k < nl; k++) {
        const t = 0.45 + k * 0.17 + r() * 0.06;
        const at = new V3().lerpVectors(p1, p2, (t - 0.42) / 0.58);
        const la = a + (r() - 0.5) * 2.2;
        leafStrip(S, at, new V3(Math.cos(la), 0, Math.sin(la)), 0.5 + r() * 0.25, (u) => 0.085 * Math.sin(Math.min(1, u * 1.2) * Math.PI) + 0.006, r, {
          seg: 3, lift: 0.9 + r() * 0.6, droop: 3.0, fold: 0.5,
          color: (u, e) => mixc(mixc(dry, pale, u * 0.6), dryDark, e * 0.4),
        });
      }
      // tassel
      if (i % 2 === 0) for (let k = 0; k < 3; k++) {
        const ta = r() * TAU;
        gs.push(tube([p2.clone(), p2.clone().add(new V3(Math.cos(ta) * 0.08, 0.12, Math.sin(ta) * 0.08)), p2.clone().add(new V3(Math.cos(ta) * 0.16, 0.1, Math.sin(ta) * 0.16))], 0.004, { radial: 3, color: () => pale }));
      }
    }
    // twine tie
    const tie = prep(new THREE.TorusGeometry(0.11, 0.018, 4, 10));
    tie.rotateX(Math.PI / 2); tie.translate(0, tieY, 0);
    gs.push(paint(tie, L(0x7a5a34)));
    const geo = merge([upNormals(S.geo(false), 0.45), ...gs]);
    return { parts: [{ geometry: geo, material: mat('cornstalk', { side: THREE.DoubleSide, sway: 0.12, flutter: 0.012 }), castShadow: true }], radius: 0.15 };
  }

  /* ---------- jack-o'-lantern: unit diameter, scaled by size ---------- */
  let jackGeo = null;
  function buildJack() {
    const r = rng(9700);
    const { g, top } = pumpkinBody(1, 10, { color: 0xe2721c, rows: 12, squash: 0.74 });
    const stem = pumpkinStem(1, top, r, false);
    const cy = top * 0.53;
    // face shapes in the front view (x right, y up), projected onto the shell
    const shapes = [];
    const tri = (pts) => { const s = new THREE.Shape(); s.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) s.lineTo(pts[i][0], pts[i][1]); s.closePath(); return s; };
    shapes.push(tri([[-0.24, 0.07], [-0.06, 0.06], [-0.14, 0.2]]));
    shapes.push(tri([[0.24, 0.07], [0.06, 0.06], [0.14, 0.2]]));
    shapes.push(tri([[-0.045, -0.02], [0.045, -0.02], [0, 0.05]]));
    const mouth = new THREE.Shape();
    mouth.moveTo(-0.27, -0.06);
    mouth.quadraticCurveTo(0, -0.34, 0.27, -0.06);
    mouth.lineTo(0.17, -0.11); mouth.lineTo(0.13, -0.07); mouth.lineTo(0.08, -0.14);
    mouth.lineTo(0.03, -0.1); mouth.lineTo(-0.03, -0.14); mouth.lineTo(-0.08, -0.1);
    mouth.lineTo(-0.13, -0.15); mouth.lineTo(-0.17, -0.1); mouth.closePath();
    shapes.push(mouth);
    // the shell surface z for a front point (approximate ellipsoid of the body)
    const sq = 0.74, Rr = 0.5;
    const project = (geo, lift, scl) => {
      return eachVertex(geo, (p) => {
        const x = p.x * scl * 0.9, y = (p.y * scl - 0.02) * 0.9;
        const ey = y / (sq * Rr);
        const zz = Math.sqrt(Math.max(0.0001, 1 - (x / Rr) * (x / Rr) - ey * ey)) * Rr * 0.985;
        p.set(x, y + cy, zz + lift);
      });
    };
    const holes = [], rims = [];
    for (const s of shapes) {
      const hg = new THREE.ShapeGeometry(s, 6);
      holes.push(setGlow(paint(project(hg, 0.012, 1), L(0x2a1406)), 1));
      const rg = new THREE.ShapeGeometry(s, 6);
      rims.push(paint(project(rg, 0.006, 1.14), L(0xf2c060)));
    }
    const face = merge(holes);
    // face normals point out of the front
    const fn = face.attributes.normal.array;
    for (let i = 0; i < fn.length; i += 3) { fn[i] = 0; fn[i + 1] = 0.2; fn[i + 2] = 0.98; }
    const rimG = merge(rims);
    const rn = rimG.attributes.normal.array;
    for (let i = 0; i < rn.length; i += 3) { rn[i] = 0; rn[i + 1] = 0.2; rn[i + 2] = 0.98; }
    return { shell: merge([g, stem, rimG]), face, lightY: cy };
  }
  function jackolantern(size = 0.5) {
    if (!jackGeo) jackGeo = buildJack();
    const grp = new THREE.Group();
    grp.name = 'jackolantern';
    const shell = new THREE.Mesh(jackGeo.shell, pumpkinMat());
    const face = new THREE.Mesh(jackGeo.face, mat('jackFace', { emissive: 0xffa22e, glow: 'flicker' }));
    shell.castShadow = true; shell.receiveShadow = true; face.castShadow = false;
    grp.add(shell, face);
    grp.scale.setScalar(size);
    grp.userData.light = { x: 0, y: jackGeo.lightY * size, z: 0.25 * size };
    grp.userData.size = size;
    return grp;
  }

  /* ---------- scarecrow ---------- */
  TX.plaid = () => canvasTex('plaid', 64, 64, (c, w, h) => {
    c.fillStyle = '#b8322a'; c.fillRect(0, 0, w, h);
    c.fillStyle = 'rgba(40,20,30,0.55)';
    c.fillRect(0, 8, w, 14); c.fillRect(8, 0, 14, h);
    c.fillStyle = 'rgba(40,20,30,0.35)';
    c.fillRect(0, 40, w, 6); c.fillRect(40, 0, 6, h);
    c.fillStyle = 'rgba(255,214,120,0.6)';
    c.fillRect(0, 31, w, 2); c.fillRect(31, 0, 2, h);
    for (let i = 0; i < 300; i++) { c.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`; c.fillRect(Math.random() * w, Math.random() * h, 1, 1); }
  }, { srgb: true });
  TX.scareFace = () => canvasTex('scareFace', 256, 128, (c, w, h, r) => {
    // burlap with a friendly stitched face centered at u = 0.25 (the +Z side of a sphere)
    c.fillStyle = '#d9c08c'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < w; i += 3) { c.fillStyle = `rgba(120,90,50,${0.12 + r() * 0.1})`; c.fillRect(i, 0, 1, h); }
    for (let j = 0; j < h; j += 3) { c.fillStyle = `rgba(120,90,50,${0.1 + r() * 0.1})`; c.fillRect(0, j, w, 1); }
    const fx = w * 0.25, fy = h * 0.52;
    c.fillStyle = '#2a2018';
    c.beginPath(); c.arc(fx - 12, fy - 8, 5, 0, TAU); c.fill();
    c.beginPath(); c.arc(fx + 12, fy - 8, 5, 0, TAU); c.fill();
    c.fillStyle = '#fff6e0'; c.beginPath(); c.arc(fx - 10.5, fy - 9.5, 1.6, 0, TAU); c.fill(); c.beginPath(); c.arc(fx + 13.5, fy - 9.5, 1.6, 0, TAU); c.fill();
    c.fillStyle = 'rgba(230,110,110,0.55)';
    c.beginPath(); c.arc(fx - 20, fy + 4, 5, 0, TAU); c.fill(); c.beginPath(); c.arc(fx + 20, fy + 4, 5, 0, TAU); c.fill();
    c.fillStyle = '#e07a2a'; c.beginPath(); c.moveTo(fx - 4, fy - 1); c.lineTo(fx + 4, fy - 1); c.lineTo(fx, fy + 6); c.closePath(); c.fill();
    c.strokeStyle = '#3a2a1a'; c.lineWidth = 2; c.lineCap = 'round';
    c.beginPath(); c.arc(fx, fy + 4, 13, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke();
    for (let k = -3; k <= 3; k++) { const a = Math.PI / 2 + k * 0.11 * Math.PI / 1.4; c.beginPath(); c.moveTo(fx + Math.cos(a) * 10, fy + 4 + Math.sin(a) * 10); c.lineTo(fx + Math.cos(a) * 16, fy + 4 + Math.sin(a) * 16); c.stroke(); }
  }, { srgb: true, clamp: true });
  let scarecrowGrp = null;
  function buildScarecrow() {
    const wood = [], shirt = [], cloth = [], straw = [];
    const wc = L(0x7a6248);
    wood.push(boxUV(paint(prep(new THREE.CylinderGeometry(0.05, 0.06, 2.0, 6)).translate(0, 1.0, 0), wc), 2));
    wood.push(boxUV(paint(prep(new THREE.CylinderGeometry(0.035, 0.035, 1.5, 6)).rotateZ(Math.PI / 2).translate(0, 1.45, 0), wc), 2));
    // shirt: torso and sleeves along the crossbar (plaid texture via uv)
    const torso = prep(new THREE.CylinderGeometry(0.2, 0.17, 0.62, 10, 2));
    eachVertex(torso, (p) => { p.z *= 0.62; });
    torso.translate(0, 1.2, 0);
    shirt.push(boxUV(paint(torso, [1, 1, 1]), 3.5));
    for (const s of [-1, 1]) {
      const sl = prep(new THREE.CylinderGeometry(0.075, 0.095, 0.58, 8));
      sl.rotateZ(Math.PI / 2); sl.translate(s * 0.47, 1.43, 0);
      shirt.push(boxUV(paint(sl, [1, 1, 1]), 3.5));
      // straw tufts at the cuffs
      for (let k = 0; k < 5; k++) {
        const t = prep(new THREE.ConeGeometry(0.025, 0.16, 4));
        t.rotateZ(-s * (Math.PI / 2 + (k - 2) * 0.25)); t.translate(s * (0.8 + 0.02 * k), 1.43 + (k - 2) * 0.025, (k % 2 - 0.5) * 0.04);
        straw.push(paint(t, L(0xe0c070)));
      }
    }
    // pants: two legs hanging below the shirt, a patch, straw at the ankles
    for (const s of [-1, 1]) {
      const leg = prep(new THREE.CylinderGeometry(0.075, 0.085, 0.58, 8));
      leg.rotateZ(s * 0.06); leg.translate(s * 0.1, 0.63, 0.02);
      cloth.push(boxUV(paint(leg, L(0x3a5a8a)), 3));
      for (let k = 0; k < 4; k++) {
        const t = prep(new THREE.ConeGeometry(0.022, 0.13, 4));
        t.rotateX(Math.PI); t.rotateZ((k - 1.5) * 0.3); t.translate(s * 0.12 + (k - 1.5) * 0.025, 0.31, 0.02);
        straw.push(paint(t, L(0xe0c070)));
      }
    }
    cloth.push(paint(prep(new THREE.BoxGeometry(0.09, 0.09, 0.01)).translate(0.11, 0.62, 0.105), L(0xc89a3a)));
    // rope belt
    const belt = prep(new THREE.TorusGeometry(0.175, 0.015, 4, 12));
    belt.rotateX(Math.PI / 2); belt.scale(1, 1, 0.66); belt.translate(0, 0.92, 0);
    cloth.push(paint(belt, L(0x9a7a4a)));
    // head
    const head = prep(new THREE.SphereGeometry(0.17, 14, 10));
    head.scale(1, 1.05, 0.95); head.translate(0, 1.72, 0);
    paint(head, [1, 1, 1]);
    // straw hat with a red band
    const brim = prep(new THREE.CylinderGeometry(0.3, 0.3, 0.02, 14));
    brim.translate(0, 1.85, 0);
    const crownH = prep(new THREE.CylinderGeometry(0.13, 0.155, 0.15, 12));
    crownH.translate(0, 1.93, 0);
    const band = prep(new THREE.CylinderGeometry(0.157, 0.157, 0.035, 12, 1, true));
    band.translate(0, 1.875, 0);
    const hat = merge([paint(brim, L(0xd8b464)), paint(crownH, L(0xd0ac5c)), paint(band, L(0xb02a24))]);
    hat.rotateZ(0.08); hat.rotateX(-0.06);
    straw.push(hat);
    for (let k = 0; k < 9; k++) {
      const a = Math.PI * (0.15 + 0.7 * (k / 8)) + Math.PI;
      const t = prep(new THREE.ConeGeometry(0.02, 0.12, 4));
      t.rotateZ(Math.PI); t.rotateY(-a); t.translate(Math.cos(a) * 0.16, 1.79, -Math.sin(a) * 0.15);
      straw.push(paint(t, L(0xe4c878)));
    }
    const grp = new THREE.Group();
    grp.name = 'scarecrow';
    grp.add(meshOf(merge(wood), mat('fenceWood', { map: TX.wood() })));
    grp.add(meshOf(merge(shirt), mat('plaidShirt', { map: TX.plaid() })));
    grp.add(meshOf(merge(cloth), mat('fabric', { map: TX.fabric() })));
    grp.add(meshOf(merge(straw), mat('straw', { map: TX.straw() })));
    grp.add(meshOf(head, mat('scareHead', { map: TX.scareFace() })));
    grp.userData.radius = 0.3;
    return grp;
  }
  function scarecrow() {
    if (!scarecrowGrp) scarecrowGrp = buildScarecrow();
    const g = scarecrowGrp.clone();
    g.userData = Object.assign({}, scarecrowGrp.userData);
    return g;
  }

  /* ---------- falling autumn leaves ---------- */
  const leafSprite = () => canvasTex('fallLeaf', 64, 64, (c, w, h) => {
    c.clearRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h / 2); c.rotate(-0.6);
    c.beginPath();
    c.moveTo(0, -26); c.bezierCurveTo(16, -18, 20, 6, 0, 24); c.bezierCurveTo(-20, 6, -16, -18, 0, -26);
    c.fillStyle = gray(0.92); c.fill();
    c.strokeStyle = gray(0.6); c.lineWidth = 2;
    c.beginPath(); c.moveTo(0, -22); c.lineTo(0, 28); c.stroke();
    c.lineWidth = 1.2;
    for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(0, i * 8); c.lineTo(10, i * 8 - 7); c.moveTo(0, i * 8); c.lineTo(-10, i * 8 - 7); c.stroke(); }
    c.restore();
  }, { clamp: true });
  function fallingLeaves(count = 160) {
    const r = rng(5150);
    const seed = new Float32Array(count * 4), col = new Float32Array(count * 3), pos = new Float32Array(count * 3);
    const pal = [0xd8a020, 0xe07a1a, 0xc0401a, 0x9a3a14, 0xc8a040, 0x8a5a24];
    for (let i = 0; i < count; i++) {
      seed[i * 4] = r() * 40; seed[i * 4 + 1] = r() * 40; seed[i * 4 + 2] = r(); seed[i * 4 + 3] = r();
      const c = L(pal[Math.floor(r() * pal.length)]);
      col[i * 3] = c[0]; col[i * 3 + 1] = c[1]; col[i * 3 + 2] = c[2];
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('seed', new THREE.BufferAttribute(seed, 4));
    geo.setAttribute('leafColor', new THREE.BufferAttribute(col, 3));
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
    Object.assign(u, { uTime: { value: 0 }, uCenter: { value: new V3() }, uAmount: { value: 0 }, uMap: { value: leafSprite() }, uScale: { value: 300 } });
    const m = new THREE.ShaderMaterial({
      uniforms: u, fog: true, lights: true,
      vertexShader: `
attribute vec4 seed;
attribute vec3 leafColor;
uniform float uTime, uAmount, uScale;
uniform vec3 uCenter;
varying vec3 vCol;
varying float vA, vRot, vSquash;
#include <common>
#include <fog_pars_vertex>
void main() {
  float t = uTime;
  float H = 12.0;
  float fall = 0.55 + seed.z * 0.45;
  float y = mod(seed.w * H - t * fall, H);
  vec2 drift = vec2(sin(t * 0.8 + seed.x) * 1.1 + t * 0.3, cos(t * 0.6 + seed.y) * 0.8 + t * 0.12);
  vec2 xz = mod(seed.xy + drift - uCenter.xz + 20.0, 40.0) - 20.0 + uCenter.xz;
  vec3 p = vec3(xz.x, uCenter.y - 0.5 + y, xz.y);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  float on = step(fract(seed.x * 7.31 + seed.y * 3.17), uAmount);
  vA = on * smoothstep(0.0, 0.6, y) * smoothstep(H, H - 2.0, y) * (1.0 - smoothstep(16.0, 20.0, length(xz - uCenter.xz)));
  vRot = t * (1.2 + seed.w * 2.5) + seed.x;
  vSquash = 0.35 + 0.65 * abs(cos(t * (1.5 + seed.z * 2.0) + seed.y));
  vCol = leafColor;
  gl_PointSize = max(3.0, uScale * (0.24 + seed.z * 0.08) / -mvPosition.z);
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform sampler2D uMap;
varying vec3 vCol;
varying float vA, vRot, vSquash;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
void main() {
  if (vA < 0.01) discard;
  vec2 q = gl_PointCoord - 0.5;
  float c = cos(vRot), s = sin(vRot);
  q = vec2(c * q.x - s * q.y, s * q.x + c * q.y);
  q.x /= vSquash;
  vec2 uv = q + 0.5;
  if (uv.x < 0.0 || uv.x > 1.0) discard;
  vec4 tx = texture2D(uMap, uv);
  if (tx.a < 0.5) discard;
  vec3 light = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    light += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.7);
  #endif
  #if NUM_DIR_LIGHTS > 0
    light += directionalLights[0].color * 0.45;
  #endif
  gl_FragColor = vec4(vCol * tx.r * light * 0.95, 1.0);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    });
    const points = new THREE.Points(geo, m);
    points.frustumCulled = false;
    points.name = 'fallingLeaves';
    const sz = new THREE.Vector2();
    points.onBeforeRender = (renderer, scene, camera) => {
      renderer.getDrawingBufferSize(sz);
      u.uScale.value = sz.y * 0.5 * camera.projectionMatrix.elements[5];
    };
    points.visible = false;
    function update(t, center, amount = 1) {
      u.uTime.value = t;
      if (center) u.uCenter.value.copy(center);
      u.uAmount.value = clamp(amount, 0, 1);
      points.visible = amount > 0.001;
    }
    return { points, update, uniforms: u };
  }

  /* ============================================================
     Food items
     ============================================================ */
  const foodCache = {};
  const foodMat = () => mat('food', { std: true, roughness: 0.55 });
  const foodMatDS = () => mat('foodDS', { std: true, roughness: 0.6, side: THREE.DoubleSide });
  const fishMat = () => mat('fish', { std: true, roughness: 0.32, metalness: 0.15 });

  function ico(r, d, x, y, z, sx, sy, sz, col) {
    const g = prep(new THREE.IcosahedronGeometry(r, d));
    g.scale(sx, sy, sz);
    g.translate(x, y, z);
    return paint(smoothNormals(g), col);
  }
  function smallLeaf(len, wid, col) {
    const S = soup();
    leafStrip(S, new V3(0, 0, 0), new V3(1, 0, 0), len, (t) => Math.sin(t * Math.PI) * wid, null, { seg: 4, lift: 0.4, droop: 0.9, fold: 0.3, color: (t, e) => mixc(col, mulc(col, 0.7), e) });
    return upNormals(S.geo(false), 0.4);
  }

  function foodApple() {
    const R = 0.09;
    const g = prep(new THREE.SphereGeometry(R, 16, 12));
    eachVertex(g, (p) => {
      const y = p.y / R, rr = Math.hypot(p.x, p.z) / R;
      // apple shape: dimple at top and bottom, slightly wider shoulders
      const k = 1 + 0.08 * y - 0.05 * y * y;
      p.x *= k; p.z *= k;
      p.y = p.y * 0.92 - 0.035 * R * Math.exp(-rr * rr * 18) * Math.sign(p.y) * 5;
    });
    g.translate(0, R * 0.92, 0);
    smoothNormals(g);
    paint(g, (x, y, z) => {
      const a = Math.atan2(z, x);
      const blush = smooth(-0.6, 0.8, Math.cos(a - 0.8) + fbm(x * 30, y * 30, z * 30, 2) * 0.8);
      let c = mixc(L(0xe8c040), L(0xc0201c), blush);
      c = mixc(c, L(0x8a1410), smooth(0.4, 1.0, blush) * 0.3);
      const streak = 0.9 + 0.1 * Math.sin(a * 24 + y * 40);
      return mulc(c, streak);
    });
    const stem = tube([new V3(0, R * 1.7, 0), new V3(0.006, R * 2.05, 0.003), new V3(0.016, R * 2.25, 0.004)], 0.0045, { radial: 5, cap: 'end', color: () => L(0x4a3420) });
    const leaf = smallLeaf(0.07, 0.22, L(0x4a8a2a));
    leaf.rotateZ(0.3); leaf.translate(0.008, R * 2.05, 0.004);
    return [{ geo: merge([g, stem, leaf]), mat: foodMat() }];
  }

  function foodWorm() {
    // dirt mound (static) + worm body (animated by Env.foodUpdate)
    const mound = prep(new THREE.SphereGeometry(0.07, 12, 6, 0, TAU, 0, Math.PI / 2));
    eachVertex(mound, (p) => { p.x *= 1 + fbm(p.x * 40, p.y * 40, p.z * 40, 1) * 0.3; p.z *= 1.2; p.y *= 0.45; });
    smoothNormals(mound);
    paint(mound, (x, y, z) => mixc(L(0x3a2818), L(0x6a4a30), fbm(x * 60, y * 60, z * 60, 2) + 0.5));
    // crumbs
    const crumbs = [];
    const r = rng(31);
    for (let i = 0; i < 6; i++) { const a = r() * TAU, d = 0.07 + r() * 0.03; crumbs.push(ico(0.009 + r() * 0.006, 0, Math.cos(a) * d, 0.004, Math.sin(a) * d * 1.2, 1, 0.7, 1, L(0x4a3424))); }
    // worm: segmented tube built along +Y, bent in the shader-free way: we rebuild nothing, sway via object rotation
    const pts = [];
    // emerges from the mound, arches over and curls toward the ground
    for (let i = 0; i <= 14; i++) { const t = i / 14, a = t * 2.4; pts.push(new V3(Math.sin(a) * 0.075, -0.01 + Math.sin(Math.min(a, 2.0)) * 0.085 - Math.max(0, a - 2.0) * 0.02, Math.sin(t * 5) * 0.008)); }
    const body = tube(pts, (i, t) => 0.0115 * (1 - Math.pow(t, 5) * 0.45) * (1 + 0.1 * Math.cos(t * 90)), {
      radial: 8, cap: 'end',
      color: (t) => {
        const band = t > 0.28 && t < 0.4 ? 1 : 0;
        return mixc(mixc(L(0xa0605a), L(0xd08c84), 0.5 + 0.5 * Math.cos(t * 90)), L(0xc87a70), band * 0.8);
      },
    });
    return [{ geo: merge([mound, ...crumbs]), mat: foodMat() }, { geo: body, mat: foodMat(), name: 'worm' }];
  }

  function fishGeo(len, o) {
    // body of revolution along +Z, flattened sideways, with tail, dorsal and side fins
    const S = soup();
    const n = 14, R = 10;
    const prof = (t) => Math.pow(Math.sin(Math.PI * Math.pow(t, 0.75)), 0.85) * 0.11 * (1 - t * 0.15);
    const rings = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, z = (0.5 - t) * len; // t=0 nose (+Z), t=1 tail
      const rad = Math.max(0.003, prof(t) * len);
      const row = [];
      for (let j = 0; j <= R; j++) {
        const a = (j / R) * TAU;
        const x = Math.cos(a) * rad * o.flat, y = Math.sin(a) * rad;
        const top = Math.sin(a);
        row.push({ p: new V3(x, y, z), c: o.color(t, top, x, y, z) });
      }
      rings.push(row);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < R; j++) {
      const a = rings[i][j], b = rings[i + 1][j], c = rings[i + 1][j + 1], d = rings[i][j + 1];
      S.quad(a.p, b.p, c.p, d.p, a.c, b.c, c.c, d.c);
    }
    const body = S.geo(true);
    // put the nose at +Z
    let minZ = Infinity, maxZ = -Infinity;
    eachVertex(body, (p) => { minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); });
    const fins = soup(), tailS = soup();
    const tailZ = minZ + len * 0.06, finC = o.fin;
    // tail fin (forked), built around its own pivot at the tail base (z = 0) so it can wag
    const th = len * 0.2, tz = minZ - tailZ;
    tailS.tri(new V3(0, 0, len * 0.02), new V3(0, th, tz - len * 0.16), new V3(0, len * 0.02, tz - len * 0.1), finC, mulc(finC, 0.8), finC);
    tailS.tri(new V3(0, 0, len * 0.02), new V3(0, -len * 0.02, tz - len * 0.1), new V3(0, -th, tz - len * 0.16), finC, finC, mulc(finC, 0.8));
    tailS.tri(new V3(0, 0, len * 0.02), new V3(0, len * 0.02, tz - len * 0.1), new V3(0, -len * 0.02, tz - len * 0.1), finC, finC, finC);
    // narrow peduncle so the wagging tail stays attached to the body
    tailS.tri(new V3(0, len * 0.025, len * 0.04), new V3(0, len * 0.02, tz - len * 0.1), new V3(0, -len * 0.02, tz - len * 0.1), finC, finC, finC);
    tailS.tri(new V3(0, len * 0.025, len * 0.04), new V3(0, -len * 0.02, tz - len * 0.1), new V3(0, -len * 0.025, len * 0.04), finC, finC, finC);
    // dorsal fin
    const topY = prof(0.4) * len;
    fins.tri(new V3(0, topY * 0.9, len * 0.08), new V3(0, topY * 0.9, -len * 0.1), new V3(0, topY + len * 0.08, -len * 0.06), finC, finC, mulc(finC, 0.85));
    // pectoral fins
    for (const s of [-1, 1]) {
      const bx = s * prof(0.3) * len * o.flat * 0.9;
      fins.tri(new V3(bx, -len * 0.02, len * 0.18), new V3(bx, -len * 0.03, len * 0.1), new V3(bx + s * len * 0.06, -len * 0.06, len * 0.08), finC, finC, finC);
    }
    const finG = fins.geo(false);
    // eyes
    const eyes = [];
    for (const s of [-1, 1]) {
      eyes.push(ico(len * 0.03, 1, s * prof(0.12) * len * o.flat * 0.85, len * 0.015, maxZ - len * 0.13, 0.6, 1, 1, L(0x111111)));
      eyes.push(ico(len * 0.012, 0, s * (prof(0.12) * len * o.flat * 0.85 + len * 0.014), len * 0.024, maxZ - len * 0.125, 0.5, 1, 1, [0.9, 0.9, 0.9]));
    }
    return { body: merge([body, ...eyes]), fins: finG, tail: tailS.geo(false), tailZ };
  }
  function foodFish(small) {
    const len = small ? 0.14 : 0.3;
    const g = fishGeo(len, small ? {
      flat: 0.68, fin: L(0x9aa6a8),
      color: (t, top, x, y) => mixc(mixc(L(0xdfe6ea), L(0x5a6e78), smooth(-0.2, 0.7, top)), L(0x8aa0a8), Math.abs(top) < 0.2 ? 0.4 : 0),
    } : {
      flat: 0.5, fin: L(0x8a8a5a),
      color: (t, top, x, y, z) => {
        let c = mixc(L(0xece2c8), L(0x5a6a3a), smooth(-0.3, 0.6, top));
        // pink lateral band and dark speckles like a trout
        c = mixc(c, L(0xd88a7a), Math.exp(-Math.pow((top + 0.05) / 0.2, 2)) * 0.6 * smooth(0.1, 0.3, t));
        const sp = fbm(x * 200 + 3, y * 200, z * 200, 1);
        if (sp > 0.35 && top > -0.3) c = mulc(c, 0.35);
        return c;
      },
    });
    // body and tail are separate meshes so Env.foodUpdate can wag the tail around its base
    const fm = mat('fishDS', { std: true, roughness: 0.32, metalness: 0.15, side: THREE.DoubleSide });
    return [{ geo: merge([g.body, g.fins]), mat: fm, name: 'fish' }, { geo: g.tail, mat: fm, name: 'tail', z: g.tailZ }];
  }

  function foodGrass() {
    const S = soup(), r = rng(57);
    const baseC = L(0x1e5a12), tipC = L(0x6ccc2a);
    for (let b = 0; b < 22; b++) {
      const a = r() * TAU, off = r() * 0.04;
      const ox = Math.cos(a) * off, oz = Math.sin(a) * off;
      const h = 0.22 + r() * 0.15, lean = 0.08 + r() * 0.15, w = 0.011 + r() * 0.005;
      const d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x);
      const seg = 4, P = (t) => new V3(ox + d.x * lean * t * t * 1.4, h * t, oz + d.z * lean * t * t * 1.4);
      for (let i = 0; i < seg; i++) {
        const t0 = i / seg, t1 = (i + 1) / seg, w0 = w * (1 - t0 * 0.8), w1 = i === seg - 1 ? 0 : w * (1 - t1 * 0.8);
        const p0 = P(t0), p1 = P(t1), c0 = mixc(baseC, tipC, t0), c1 = mixc(baseC, tipC, t1);
        if (i === seg - 1) S.tri(p0.clone().addScaledVector(side, -w0), p0.clone().addScaledVector(side, w0), p1, c0, c0, c1);
        else S.quad(p0.clone().addScaledVector(side, -w0), p0.clone().addScaledVector(side, w0), p1.clone().addScaledVector(side, w1), p1.clone().addScaledVector(side, -w1), c0, c0, c1, c1);
      }
    }
    // a little clover underneath to make it read as tasty
    const clover = [];
    for (let i = 0; i < 3; i++) {
      const a = (i / 3) * TAU + 0.4;
      clover.push(ico(0.022, 1, Math.cos(a) * 0.05, 0.03, Math.sin(a) * 0.05, 1, 0.25, 1, L(0x5aa83a)));
    }
    return [{ geo: merge([upNormals(S.geo(false), 0.55), ...clover]), mat: mat('juicy', { std: true, roughness: 0.55, side: THREE.DoubleSide, sway: 2.0, flutter: 0.003 }) }];
  }

  function foodBerries() {
    const gs = [], r = rng(71);
    // blueberries with a crown dimple, raspberries as clustered drupelets
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = 0.02 + r() * 0.025;
      const x = Math.cos(a) * d, z = Math.sin(a) * d, y = 0.018 + r() * 0.02;
      gs.push(ico(0.017, 1, x, y, z, 1, 0.9, 1, (px, py) => mixc(L(0x2a3a7a), L(0x5a6aa8), smooth(-0.2, 1.2, (py - y) / 0.017) * 0.6)));
      gs.push(ico(0.005, 0, x, y + 0.015, z, 1, 0.5, 1, L(0x1a1a3a)));
    }
    for (let k = 0; k < 2; k++) {
      const cx = (k ? -0.03 : 0.035), cz = (k ? 0.03 : -0.02), cy = 0.024;
      const rb = prep(new THREE.IcosahedronGeometry(0.02, 2));
      eachVertex(rb, (p) => { const n = p.clone().normalize(); const bump = Math.abs(Math.sin(n.x * 14) * Math.sin(n.y * 14) * Math.sin(n.z * 14)); p.multiplyScalar(1 + bump * 0.12); p.y *= 1.15; });
      smoothNormals(rb);
      rb.translate(cx, cy, cz);
      gs.push(paint(rb, (px, py, pz) => { const n = Math.abs(Math.sin((px - cx) * 700) * Math.sin((py - cy) * 600) * Math.sin((pz - cz) * 700)); return mixc(L(0x8a1028), L(0xe0405a), n); }));
    }
    const leaves = [];
    for (let i = 0; i < 2; i++) {
      const lf = smallLeaf(0.07, 0.2, L(0x3a7a2a));
      lf.rotateY(i * 2.6 + 0.4);
      lf.translate(0, 0.01, 0);
      leaves.push(lf);
    }
    return [{ geo: merge([...gs, ...leaves]), mat: foodMatDS() }];
  }

  function foodCarrot() {
    const gs = [];
    // orange shoulder showing above the soil, with a little soil ring
    const sh = prep(new THREE.CylinderGeometry(0.028, 0.034, 0.05, 10, 2, false));
    eachVertex(sh, (p) => { if (p.y > 0.02) { p.x *= 0.85; p.z *= 0.85; } });
    sh.translate(0, 0.015, 0);
    gs.push(paint(smoothNormals(sh), (x, y) => mulc(L(0xe8761c), 0.85 + 0.15 * Math.sin(y * 300))));
    const ring = prep(new THREE.TorusGeometry(0.04, 0.012, 5, 12));
    ring.rotateX(Math.PI / 2); ring.scale(1, 0.6, 1); ring.translate(0, 0.004, 0);
    gs.push(paint(ring, L(0x4a3424)));
    // feathery green top: several compound stalks
    const S = soup(), r = rng(91);
    const tops = [];
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + r() * 0.4;
      const d = new V3(Math.cos(a) * 0.4, 1, Math.sin(a) * 0.4).normalize();
      const len = 0.24 + r() * 0.08;
      const base = new V3(0, 0.04, 0), end = base.clone().addScaledVector(d, len);
      end.y -= len * 0.1;
      tops.push(tube([base, base.clone().lerp(end, 0.5).add(new V3(0, 0.02, 0)), end], 0.0028, { radial: 3, color: () => L(0x4a8a2a) }));
      // ferny leaflets along the stalk
      for (let k = 2; k < 6; k++) {
        const t = k / 6;
        const p = base.clone().lerp(end, t);
        for (const s of [-1, 1]) {
          const sd = new V3(-d.z, 0, d.x).multiplyScalar(s);
          leafStrip(S, p, sd.clone().add(new V3(0, 0.5, 0)).addScaledVector(d, 0.5), 0.085 * (1.1 - t * 0.4), (u) => (Math.floor(u * 6) % 2 ? 0.12 : 0.28) * Math.sin(u * Math.PI), r, { seg: 6, lift: 0.4, droop: 1.0, color: (u, e) => mixc(L(0x3f8a28), L(0x7ac04a), u * 0.6 + e * 0.1) });
        }
      }
    }
    return [{ geo: merge([...gs, ...tops, upNormals(S.geo(false), 0.5)]), mat: mat('carrot', { std: true, roughness: 0.6, side: THREE.DoubleSide, sway: 1.5 }) }];
  }

  function foodPinecone() {
    // egg-shaped cone with spiral diamond scales: each scale tip pushed out, grooves dark
    const H = 0.1, R = 0.034, rings = 18, rad = 20, S = soup();
    const P = (i, j) => {
      const t = i / rings, a = (j / rad) * TAU;
      const prof = Math.pow(Math.sin(Math.PI * Math.min(1, 0.06 + t * 0.94)), 0.8) * (1 - t * 0.35);
      const u = (a / TAU) * 8 + t * 5, v = (a / TAU) * 8 - t * 7;
      const du = Math.abs(u - Math.floor(u) - 0.5), dv = Math.abs(v - Math.floor(v) - 0.5);
      const d = Math.max(du, dv); // 0 at scale center, 0.5 at the groove
      const lift = (0.5 - d) * 2;
      const rr = R * prof * (0.78 + 0.32 * lift);
      return { p: new V3(Math.cos(a) * rr, t * H - lift * 0.004, Math.sin(a) * rr), c: mixc(L(0x3a2212), mixc(L(0x8a5a2e), L(0xb07a44), t), Math.pow(lift, 0.7)) };
    };
    const grid = [];
    for (let i = 0; i <= rings; i++) { const row = []; for (let j = 0; j <= rad; j++) row.push(P(i, j % rad)); grid.push(row); }
    for (let i = 0; i < rings; i++) for (let j = 0; j < rad; j++) {
      const A = grid[i][j], B = grid[i + 1][j], Cq = grid[i + 1][j + 1], D = grid[i][j + 1];
      S.quad(A.p, B.p, Cq.p, D.p, A.c, B.c, Cq.c, D.c);
    }
    const cone = S.geo(true);
    const stem = paint(place(new THREE.CylinderGeometry(0.004, 0.005, 0.014, 5), 0, -0.006, 0), L(0x4a3018));
    const g = merge([cone, stem]);
    g.rotateZ(Math.PI / 2 - 0.12);
    g.translate(H / 2, 0.03, 0);
    return [{ geo: g, mat: foodMat() }];
  }

  function foodAcorn() {
    const gs = [];
    const nut = prep(new THREE.SphereGeometry(0.018, 10, 8));
    eachVertex(nut, (p) => { p.y *= p.y < 0 ? 1.45 : 1.0; if (p.y < -0.022) { p.x *= 0.8; p.z *= 0.8; } });
    nut.translate(0, 0.028, 0);
    gs.push(paint(smoothNormals(nut), (x, y) => mixc(L(0x8a5a22), L(0xc08a3a), smooth(0, 0.04, y))));
    gs.push(ico(0.003, 0, 0, 0.0, 0, 1, 1.5, 1, L(0x5a3a1a)));
    const cap = prep(new THREE.SphereGeometry(0.021, 10, 5, 0, TAU, 0, Math.PI * 0.5));
    eachVertex(cap, (p) => { p.y *= 0.65; });
    cap.translate(0, 0.031, 0);
    gs.push(paint(smoothNormals(cap), (x, y, z) => mulc(L(0x6a4a2a), 0.75 + 0.25 * (fbm(x * 600, y * 600, z * 600, 1) > 0 ? 1 : 0.6))));
    gs.push(tube([new V3(0, 0.044, 0), new V3(0.002, 0.052, 0.001)], 0.002, { radial: 4, cap: 'end', color: () => L(0x5a3a1a) }));
    // enlarge a bit so it reads from the game camera (5 cm requested)
    const g = merge(gs);
    g.scale(1.1, 1.1, 1.1);
    return [{ geo: g, mat: foodMat() }];
  }

  function foodPumpkin() {
    const r = rng(9900);
    const { g, top } = pumpkinBody(0.25, 8, { color: 0xe8781e, rows: 9, squash: 0.8 });
    const stem = pumpkinStem(0.25, top, r, true);
    const leaf = smallLeaf(0.09, 0.3, L(0x4a7a2a));
    leaf.rotateZ(0.2); leaf.rotateY(2.2); leaf.translate(0.01, top - 0.005, 0.0);
    return [{ geo: merge([g, stem, leaf]), mat: mat('pumpkinFood', { std: true, roughness: 0.55, side: THREE.DoubleSide }) }];
  }
  function foodCandy() {
    // a round wrapped candy with twisted wrapper ends, lying on the ground (about 8 cm long)
    const gs = [];
    const body = prep(new THREE.SphereGeometry(0.022, 12, 8));
    body.scale(1.35, 1, 1); body.translate(0, 0.022, 0);
    gs.push(paint(smoothNormals(body), (x, y, z) => (Math.sin((x * 1.0 + y * 0.6) * 260) > 0.2 ? L(0xf2f0ea) : L(0xe8304a))));
    for (const s of [-1, 1]) {
      const fan = prep(new THREE.ConeGeometry(0.018, 0.022, 8, 1, true));
      fan.rotateZ(s * Math.PI / 2); fan.translate(s * 0.036, 0.022, 0);
      const tip = prep(new THREE.CylinderGeometry(0.004, 0.007, 0.01, 6)).rotateZ(Math.PI / 2).translate(s * 0.028, 0.022, 0);
      gs.push(paint(fan, (x, y, z) => mixc(L(0xf04060), L(0xffd040), 0.5 + 0.5 * Math.sin(Math.atan2(z, y - 0.022) * 4))), paint(tip, L(0xe8304a)));
    }
    const g = merge(gs);
    g.scale(1.5, 1.5, 1.5);
    return [{ geo: g, mat: mat('candy', { std: true, roughness: 0.25, side: THREE.DoubleSide }) }];
  }

  const FOODS = { pumpkin: foodPumpkin, candy: foodCandy, apple: foodApple, worm: foodWorm, smallfish: () => foodFish(true), fish: () => foodFish(false), grass: foodGrass, berries: foodBerries, carrot: foodCarrot, pinecone: foodPinecone, acorn: foodAcorn };
  function food(type) {
    const make = FOODS[type];
    if (!make) throw new Error('Env.food: unknown type ' + type);
    if (!foodCache[type]) foodCache[type] = make();
    const root = new THREE.Group();
    root.name = 'food-' + type;
    root.userData.foodType = type;
    for (const p of foodCache[type]) {
      const m = new THREE.Mesh(p.geo, p.mat);
      m.castShadow = true; m.receiveShadow = true;
      if (p.name) m.name = p.name;
      if (p.name === 'tail') { m.position.z = p.z; root.userData.fish.add(m); root.userData.tail = m; continue; }
      root.add(m);
      if (p.name === 'worm') root.userData.worm = m;
      if (p.name === 'fish') root.userData.fish = m;
    }
    root.userData.phase = Math.random() * TAU;
    return root;
  }
  function foodUpdate(obj, t) {
    const u = obj.userData, ph = u.phase || 0;
    if (u.worm) {
      const w = u.worm;
      w.rotation.z = Math.sin(t * 3.1 + ph) * 0.18;
      w.rotation.x = Math.sin(t * 2.3 + ph * 1.7) * 0.15;
      w.rotation.y = Math.sin(t * 0.7 + ph) * 1.2;
      w.scale.set(1 + Math.sin(t * 4.3 + ph) * 0.06, 1 - Math.sin(t * 4.3 + ph) * 0.06, 1);
    }
    if (u.fish) {
      const f = u.fish, w = Math.sin(t * 8.0 + ph);
      f.rotation.y = w * 0.07;
      f.position.y = Math.sin(t * 1.3 + ph) * 0.01;
      if (u.tail) u.tail.rotation.y = -Math.sin(t * 8.0 + ph - 0.9) * 0.5;
    }
  }


  /* ============================================================
     Eggs and nests
     ============================================================ */
  let nestGrp = null;
  function nest() {
    if (!nestGrp) {
      const r = rng(7272), gs = [];
      const twig = () => mixc(L(0x5a4430), L(0x8a7454), r());
      // woven rim: a flattened torus plus twigs wound around it
      const rim = prep(new THREE.TorusGeometry(0.17, 0.075, 6, 18));
      rim.rotateX(Math.PI / 2); rim.scale(1, 0.75, 1); rim.translate(0, 0.07, 0);
      eachVertex(rim, (p) => { p.x *= 1 + fbm(p.x * 20, p.y * 20, p.z * 20, 1) * 0.08; p.z *= 1 + fbm(p.z * 20, p.x * 20, 3, 1) * 0.08; });
      gs.push(paint(smoothNormals(rim), (x, y, z) => mixc(L(0x6a5238), L(0x9a8258), fbm(x * 40, y * 40, z * 40, 2) + 0.5)));
      // soft lining in the cup
      const cup = prep(new THREE.SphereGeometry(0.16, 14, 6, 0, TAU, Math.PI * 0.55, Math.PI * 0.45));
      cup.scale(1, 0.5, 1); cup.translate(0, 0.1, 0);
      gs.push(paint(cup, (x, y, z) => mixc(L(0xb89a6a), L(0xd8c49a), fbm(x * 50, 1, z * 50, 2) + 0.5)));
      for (let i = 0; i < 26; i++) {
        const a0 = r() * TAU, span = 0.9 + r() * 1.4, rr = 0.15 + r() * 0.07, y0 = 0.03 + r() * 0.1;
        const pts = [];
        for (let k = 0; k <= 4; k++) { const a = a0 + span * (k / 4); pts.push(new V3(Math.cos(a) * rr, y0 + Math.sin(k * 1.3 + i) * 0.02, Math.sin(a) * rr)); }
        const c = twig();
        gs.push(tube(pts, 0.006 + r() * 0.004, { radial: 3, color: () => c }));
      }
      for (let i = 0; i < 8; i++) {
        const a = r() * TAU, c = twig();
        const p0 = new V3(Math.cos(a) * 0.18, 0.06 + r() * 0.06, Math.sin(a) * 0.18);
        gs.push(tube([p0, p0.clone().add(new V3(Math.cos(a + 0.4) * 0.12, 0.02 + r() * 0.05, Math.sin(a + 0.4) * 0.12))], 0.005, { radial: 3, cap: 'end', color: () => c }));
      }
      const g = merge(gs);
      boxUV(g, 8);
      nestGrp = new THREE.Group();
      nestGrp.name = 'nest';
      nestGrp.add(meshOf(g, mat('nest', { map: TX.straw() })));
      nestGrp.userData = { r: 0.25, eggSpots: [{ x: -0.045, y: 0.07, z: 0.02 }, { x: 0.05, y: 0.07, z: 0.035 }, { x: 0.005, y: 0.07, z: -0.05 }] };
    }
    const g = nestGrp.clone();
    g.userData = JSON.parse(JSON.stringify(nestGrp.userData));
    return g;
  }

  /* egg: about 1 unit tall, two halves split along a zigzag crack line, shared shader draws cracks */
  const EGG_Y = 0.56, EGG_A = 0.045, EGG_TEETH = 9, EGG_COLS = 36;
  const eggR = (y) => { const s = clamp(2 * y - 1, -1, 1); return 0.37 * Math.sqrt(Math.max(0, 1 - s * s)) * (1 - 0.12 * s); };
  const eggCrackY = (phi) => { const u = phi / TAU * EGG_TEETH; return EGG_Y + EGG_A * (4 * Math.abs(u - Math.floor(u) - 0.5) - 1); };
  let eggGeo = null;
  function buildEggGeo() {
    const half = (lo) => {
      const rows = lo ? 12 : 9, S = soup();
      const grid = [];
      for (let i = 0; i <= rows; i++) {
        const row = [];
        for (let j = 0; j <= EGG_COLS; j++) {
          const phi = (j / EGG_COLS) * TAU, yc = eggCrackY(phi);
          const t = i / rows;
          // denser rows toward the poles for a smooth outline
          const y = lo ? yc * (1 - Math.cos(t * Math.PI / 2)) : yc + (1 - yc) * Math.sin(t * Math.PI / 2);
          const rr = eggR(y);
          row.push(new V3(Math.cos(phi) * rr, y, Math.sin(phi) * rr));
        }
        grid.push(row);
      }
      for (let i = 0; i < rows; i++) for (let j = 0; j < EGG_COLS; j++) {
        const a = grid[i][j], b = grid[i][j + 1], c = grid[i + 1][j + 1], d = grid[i + 1][j];
        S.quad(a, d, c, b);
      }
      const g = S.geo(true);
      // analytic normals of the egg surface (keeps the seam invisible)
      const P = g.attributes.position.array, N = g.attributes.normal.array;
      for (let k = 0; k < P.length; k += 3) {
        const y = P[k + 1], e = 0.002, dr = (eggR(Math.min(1, y + e)) - eggR(Math.max(0, y - e))) / (2 * e);
        const rr = Math.hypot(P[k], P[k + 2]) || 1e-6;
        const nx = P[k] / rr, nz = P[k + 2] / rr;
        const n = new V3(nx, -dr, nz).normalize();
        if (y < 0.003) n.set(0, -1, 0); if (y > 0.997) n.set(0, 1, 0);
        N[k] = n.x; N[k + 1] = n.y; N[k + 2] = n.z;
      }
      return g;
    };
    return { bottom: half(true), top: half(false) };
  }
  function eggMaterial(colorHex, speckled) {
    const m = new THREE.MeshStandardMaterial({ color: lcol(colorHex), roughness: 0.42, metalness: 0, side: THREE.DoubleSide, fog: true });
    const u = { uCrack: { value: 0 }, uSpeck: { value: speckled ? 1 : 0 }, uSeed: { value: Math.random() * 100 } };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, u);
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vEgg;\nvoid main() {\n  vEgg = position;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `uniform float uCrack, uSpeck, uSeed;
varying vec3 vEgg;
float eh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 45.164))) * 43758.5453); }
float en(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(eh(i), eh(i + vec3(1,0,0)), f.x), mix(eh(i + vec3(0,1,0)), eh(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(eh(i + vec3(0,0,1)), eh(i + vec3(1,0,1)), f.x), mix(eh(i + vec3(0,1,1)), eh(i + vec3(1,1,1)), f.x), f.y), f.z); }
float eggCrack(vec3 p) {
  if (uCrack <= 0.001) return 0.0;
  float phi = atan(p.z, p.x);
  float u = phi / 6.2831853 * ${EGG_TEETH.toFixed(1)};
  float yc = ${EGG_Y.toFixed(3)} + ${EGG_A.toFixed(3)} * (4.0 * abs(fract(u) - 0.5) - 1.0);
  float da = abs(mod(phi - 1.5708 + 3.14159, 6.28318) - 3.14159);
  float m = smoothstep(0.011, 0.004, abs(p.y - yc)) * step(da, uCrack * 3.3);
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float thr = 0.12 + fk * 0.13;
    float len = clamp((uCrack - thr) * 0.5, 0.0, 0.2);
    if (len <= 0.0) continue;
    float pk = 1.5708 + (fk - 2.5) * 0.62 + sin(fk * 3.7 + uSeed) * 0.15;
    float uk = pk / 6.2831853 * ${EGG_TEETH.toFixed(1)};
    float y0 = ${EGG_Y.toFixed(3)} + ${EGG_A.toFixed(3)} * (4.0 * abs(fract(uk) - 0.5) - 1.0);
    float dir = mod(fk, 2.0) < 0.5 ? 1.0 : -1.0;
    float dy = (p.y - y0) * dir;
    if (dy < 0.0 || dy > len) continue;
    float wig = sin(dy * 55.0 + fk * 2.0) * 0.06 + dy * 0.8 * (mod(fk, 3.0) - 1.0);
    float dphi = abs(mod(phi - (pk + wig) + 3.14159, 6.28318) - 3.14159);
    m = max(m, smoothstep(0.03, 0.012, dphi) * (1.0 - smoothstep(len * 0.7, len, dy)));
  }
  return m;
}
void main() {`);
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  {
    if (!gl_FrontFacing) diffuseColor.rgb = vec3(0.86, 0.84, 0.78);
    else {
      float sp = en(vEgg * 46.0 + uSeed) * 0.7 + en(vEgg * 110.0 - uSeed) * 0.3;
      diffuseColor.rgb *= 1.0 - uSpeck * smoothstep(0.62, 0.7, sp) * 0.62;
      diffuseColor.rgb *= 0.94 + 0.06 * en(vEgg * 9.0 + uSeed);
    }
    float ck = eggCrack(vEgg);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.08, 0.06, 0.05), ck * 0.9);
  }`);
    };
    m.customProgramCacheKey = () => 'env-egg';
    return { m, u };
  }
  function egg(colorHex = 0xf4efe2, speckled = false) {
    if (!eggGeo) eggGeo = buildEggGeo();
    const { m, u } = eggMaterial(colorHex, speckled);
    const grp = new THREE.Group();
    grp.name = 'egg';
    const bottom = new THREE.Mesh(eggGeo.bottom, m);
    const topPivot = new THREE.Group();
    topPivot.position.set(0, EGG_Y, 0);
    const topMesh = new THREE.Mesh(eggGeo.top, m);
    topMesh.position.set(0, -EGG_Y, 0);
    topPivot.add(topMesh);
    for (const mm of [bottom, topMesh]) { mm.castShadow = true; mm.receiveShadow = true; }
    grp.add(bottom, topPivot);
    grp.userData = {
      top: topPivot, bottom, topMesh, material: m, crack: 0,
      setCrack(v) { u.uCrack.value = clamp(+v || 0, 0, 1); grp.userData.crack = u.uCrack.value; },
    };
    return grp;
  }

  /* ============================================================
     Public API
     ============================================================ */
  return {
    prop, barn, fence, garden, grass, water, waterUniforms, sky, clouds, cloudSea, rainbow, fireflies,
    glowTexture, leafTexture, food, foodUpdate,
    wind: windU,
    propTypes: Object.keys(PROPS),
    propVariants: (type) => VARIANTS[type] || 1,
    autumn: (a) => { if (a !== undefined) autumnU.value = clamp(+a || 0, 0, 1); return autumnU.value; },
    setNight: (n) => { if (n !== undefined) nightU.value = clamp(+n || 0, 0, 1); return nightU.value; },
    autumnUniform: autumnU, nightUniform: nightU,
    house, interior, pound, poundInterior,
    picket, pen, kennel, sign,
    jackolantern, scarecrow, fallingLeaves,
    nest, egg,
  };
})();
