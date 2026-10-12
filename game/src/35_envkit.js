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
  const KEEP = { position: 1, normal: 1, uv: 1, color: 1, tint: 1, card: 1 };
  const OPT = { tint: 1, card: 2 };
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
      for (const name of ['position', 'normal', 'uv', 'color', 'card'].filter((k) => g.attributes[k])) {
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

  /* ---------- material factory ---------- */
  const matCache = {};
  /* o: { map, color, side, sway (meters of crown sway per meter of height), flutter, tinted (instanceColor only where tint = 1),
          emissive, std (MeshStandardMaterial), roughness, metalness } */
  function mat(key, o = {}) {
    if (matCache[key]) return matCache[key];
    const p = { vertexColors: true, fog: true };
    if (o.map) p.map = o.map;
    if (o.side) p.side = o.side;
    if (o.color) p.color = lcol(o.color);
    if (o.emissive) p.emissive = lcol(o.emissive);
    let m;
    if (o.std) m = new THREE.MeshStandardMaterial(Object.assign(p, { roughness: o.roughness == null ? 0.8 : o.roughness, metalness: o.metalness || 0 }));
    else m = new THREE.MeshLambertMaterial(p);
    if (o.alphaTest) m.alphaTest = o.alphaTest;
    const vtx = o.sway || o.tinted || o.cards, two = o.side === THREE.DoubleSide;
    if (vtx || two) {
      m.onBeforeCompile = (sh) => { if (vtx) patchVertex(sh, o); if (two) noFlip(sh); };
      m.customProgramCacheKey = () => 'envmat-' + key;
    }
    matCache[key] = m;
    return m;
  }
  /* depth material for shadows of card foliage (mesh.customDepthMaterial) */
  function depthMat(key, o) {
    const k = 'depth:' + key;
    if (matCache[k]) return matCache[k];
    const m = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: o.map, alphaTest: o.alphaTest || 0.5 });
    m.onBeforeCompile = (sh) => patchVertex(sh, o);
    m.customProgramCacheKey = () => 'envdepth-' + key;
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
  function patchVertex(sh, o) {
    const sway = o.sway || 0, flutter = o.flutter || 0;
    {
      {
        sh.uniforms.envTime = windU.time;
        sh.uniforms.envWind = windU.wind;
        let pre = 'uniform float envTime;\nuniform float envWind;\n' + GLSL_BASE + '\n';
        if (o.tinted) pre += 'attribute float tint;\n';
        if (o.cards) pre += 'attribute vec2 card;\n';
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
        if (sway) {
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
      }
    }
  }

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

  function leafPart(geo, key = 'leafCards', map = TX.cluster(), sway = 0.012, flutter = 0.02) {
    const o = { map, sway, flutter, cards: true, alphaTest: 0.5 };
    return { geometry: geo, material: mat(key, o), castShadow: true, depthMaterial: depthMat(key, o) };
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
        leafPart(leaves),
      ],
      radius: 0.45,
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
        leafPart(leaves),
        { geometry: merge(apples), material: mat('appleFruit', { sway: 0.012, flutter: 0.01 }), castShadow: false },
      ],
      radius: 0.22,
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
    return { parts: [{ geometry: merge(parts), material: mat('snag', { map: TX.bark() }), castShadow: true }], radius: 0.3 };
  }

  function makeBush(v) {
    const r = rng(6000 + v * 13);
    const clumps = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + r() * 0.5, d = 0.22 + r() * 0.05;
      clumps.push({ x: Math.cos(a) * d, y: 0.28 + r() * 0.08, z: Math.sin(a) * d, r: 0.26 + r() * 0.05, sx: 1.1, sy: 0.95, sz: 1.1, amp: 0.3, fq: 2.6, off: r() * 50, detail: 1 });
    }
    clumps.push({ x: 0, y: 0.46, z: 0, r: 0.34, sx: 1.1, sy: 0.9, sz: 1.1, amp: 0.25, fq: 2.2, off: r() * 50, detail: 1 });
    const dark = v ? L(0x26431a) : L(0x1f3f1a), mid = v ? L(0x4a7a2c) : L(0x3d6e2a), light = v ? L(0x8ab04a) : L(0x76a444);
    const g = crown(clumps, { center: new V3(0, 0.45, 0), radii: { x: 0.6, y: 0.45, z: 0.6 }, dark, mid, light, seed: 40 + v, cards: { count: 170, size: 0.3 } });
    eachVertex(g, (p) => { if (p.y < 0.02) p.y = 0.02 + p.y * 0.1; });
    return { parts: [leafPart(g)], radius: 0 };
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

  const PROPS = { oak: makeOak, apple: makeApple, pine: makePine, palm: makePalm, dead: makeDead, bush: makeBush, rock: makeRock, fern: makeFern, bigleaf: makeBigleaf, mushroom: makeMushroom, cattail: makeCattail, lily: makeLily, hay: makeHay, puff: makePuff, stump: makeStump, log: makeLog, flower: makeFlower };
  const VARIANTS = { oak: 3, apple: 2, pine: 3, palm: 2, dead: 2, bush: 2, rock: 3, puff: 4, lily: 2 };
  const propCache = {};
  function prop(type, variant = 0) {
    const make = PROPS[type];
    if (!make) throw new Error('Env.prop: unknown type ' + type);
    const nv = VARIANTS[type] || 1;
    const v = ((Math.floor(variant) % nv) + nv) % nv;
    const key = type + ':' + v;
    if (!propCache[key]) {
      const p = make(v);
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
    dark.push(boxG(0.04, 0.6, 0.04, 0, H + 1.6, 0, L(0x2a2a2a)));
    dark.push(boxG(0.5, 0.03, 0.03, 0, H + 1.75, 0, L(0x2a2a2a)));
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

  const FOODS = { apple: foodApple, worm: foodWorm, smallfish: () => foodFish(true), fish: () => foodFish(false), grass: foodGrass, berries: foodBerries, carrot: foodCarrot, pinecone: foodPinecone, acorn: foodAcorn };
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
     Public API
     ============================================================ */
  return {
    prop, barn, fence, garden, grass, water, waterUniforms, sky, clouds, cloudSea, rainbow, fireflies,
    glowTexture, leafTexture, food, foodUpdate,
    wind: windU,
    propTypes: Object.keys(PROPS),
    propVariants: (type) => VARIANTS[type] || 1,
  };
})();
