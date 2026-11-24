/* ============================================================
   Arctic kit (round 14): the Arctic Ocean's sea ice and icebergs, the life on its sea floor, and the look under the
   water in every world.
     Env.arctic.iceField(o)   pack ice and fast ice as a field you can ask about anywhere: column(x, z) is the ice
                              there ({ top, bot } or null) and mesh(x0, z0, size, tex) draws the floes of one tile
     Env.arctic.berg(spec)    an iceberg: column(x, z) and its mesh (most of it is under the water)
     props   kelp (3)       sugar kelp: long ruffled olive brown blades rising from a holdfast, swaying
             seaweed (2)    red dulse fronds, and a tuft of green and brown weed
             anemones (2)   white plumose anemones, and red and green ones
             sponge (2)     a yellow lumpy sponge with holes, and a pale finger sponge
             urchins        a few green sea urchins
             icerubble (3)  a jumble of broken ice blocks with snow on them (on floes and the fast ice)
             brash          small bits of ice floating in a lead
     Env.underwater           the look under the water: fog and light, the surface from below, light shafts,
                              drifting specks and caustics on the sea floor (70_game calls it every frame)
   ============================================================ */
(() => {
  const K = Env._k;
  const { V3, L, lcol, mixc, mulc, prep, paint, merge, smoothNormals, eachVertex, soup, mat, PROPS, VARIANTS, displayColor, waterUniforms, ico } = K;
  const ks = K.smooth, kf = K.fbm, krng = K.rng;   // (the kit's smoothstep(a, b, x) and 3D noise; 00_core has the 2D ones)

  /* ============================================================
     Sea ice
     The floes are cells of a jittered grid (34 m): each cell is open water, part of the fast ice (one sheet frozen to
     the shore: no leads between its cells), one big floe, or broken into small floes (cells of an 8.5 m grid inside
     it). A floe is its cell pulled in from each neighbor by half a lead, with a ragged edge (noise). Asking where the
     ice is and drawing it use the same numbers, so what you see is what you can stand on and swim under.
     ============================================================ */
  const CA = 34, CB = 8.5, JIT = 0.8;
  const ICE_THICK = 2.05;          // at least this thick, so a diver just under a floe is never put on top of it
  const SIDE = { s1: -0.45, s2in: 0.35, s2up: 0.35, bin: 0.8 };   // the underwater edge: straight down, then curving in
  function iceField(o) {
    const seed = o.seed | 0, nE1 = makeNoise(seed + 501), nE2 = makeNoise(seed + 502), nE3 = makeNoise(seed + 504), nT = makeNoise(seed + 503);
    const cells = new Map();
    const conc = o.conc, kind = o.kind, blocked = o.blocked || (() => false);
    function cellA(i, j) {
      const k = (i + 32768) * 65536 + (j + 32768);
      let c = cells.get(k);
      if (c) return c;
      if (cells.size > 60000) cells.clear();
      const x = (i + 0.5 + JIT * (hash2(i, j, seed) - 0.5)) * CA, z = (j + 0.5 + JIT * (hash2(i, j, seed + 1) - 0.5)) * CA;
      const kd = kind(x, z), h2 = hash2(i, j, seed + 2), h3 = hash2(i, j, seed + 3), h4 = hash2(i, j, seed + 4);
      let type = 0, cc = 0;
      if (kd === 'fast') type = 1;
      else if (kd === 'pack') { cc = conc(x, z); type = h2 > cc ? 0 : h2 < cc * 0.42 ? 2 : 3; }
      // (the fast ice freezes round an iceberg; drifting floes keep clear of one)
      if (type > 1 && blocked(x, z)) type = 0;
      c = { i, j, x, z, type, m: type === 1 ? 0.9 + 1.6 * h3 : 0.65 + 2.1 * h3 * h3, top: type === 1 ? 0.36 : 0.24 + 0.2 * h4,
        thick: ICE_THICK + (type === 1 ? 0.15 : 0.45 * h3), keep: 0.5 + 0.42 * cc, amp: 0 };
      c.amp = Math.min(0.5, c.m - 0.15);
      cells.set(k, c);
      return c;
    }
    const cellsB = new Map();
    function cellB(i, j) {
      const k = (i + 131072) * 262144 + (j + 131072);
      let c = cellsB.get(k);
      if (c) return c;
      if (cellsB.size > 120000) cellsB.clear();
      const x = (i + 0.5 + JIT * (hash2(i, j, seed + 11) - 0.5)) * CB, z = (j + 0.5 + JIT * (hash2(i, j, seed + 12) - 0.5)) * CB;
      const h3 = hash2(i, j, seed + 13);
      c = { i, j, x, z, m: 0.36 + 0.5 * h3, top: 0.2 + 0.2 * hash2(i, j, seed + 14), thick: ICE_THICK + 0.3 * hash2(i, j, seed + 15), kh: hash2(i, j, seed + 16), bl: blocked(x, z) };
      cellsB.set(k, c);
      return c;
    }
    // ragged edges: fine (-1..1, a few meters long) everywhere, and coarse (tens of meters) where a big floe or the fast
    // ice faces open water, where there is room for it
    const fineN = (x, z) => nE1(x * 0.33, z * 0.33) * 0.75 + nE2(x * 1.3, z * 1.3) * 0.25;
    const coarseN = (x, z) => clamp(nE3(x * 0.06, z * 0.06) * 1.1 + nE1(x * 0.17 + 5.5, z * 0.17) * 0.3, -1, 1);
    const COARSE = 2.6;
    // how a floe's edge against its neighbor q sits: [pulled in from the halfway line, fine ragged, coarse ragged,
    // a real edge (fast ice against fast ice is one sheet: no edge)]
    function edgeA(s, q, E) {
      if (s.type === 1 && q.type === 1) { E[0] = 0; E[1] = 0; E[2] = 0; E[3] = 0; return E; }
      const open = q.type === 0;
      E[0] = s.m + (open ? COARSE : 0); E[1] = s.amp; E[2] = open ? COARSE : 0; E[3] = 1;
      return E;
    }
    const ampB = (sb, s) => Math.min(0.35, Math.min(sb.m, s.m) - 0.1);
    // the top of the snow: soft drifts
    const drift = (x, z) => 0.045 * nT(x * 0.08, z * 0.08) + 0.02 * nT(x * 0.31 + 7.7, z * 0.31);

    const NA = new Array(25), NB = new Array(25), EP = [0, 0, 0, 0];
    function nearest(px, pz, C, cellF, out) {
      const ci = Math.floor(px / C), cj = Math.floor(pz / C);
      let best = 0, bd = 1e18, n = 0;
      for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++, n++) {
        const c = cellF(ci + a, cj + b); out[n] = c;
        const d = (c.x - px) * (c.x - px) + (c.z - pz) * (c.z - pz);
        if (d < bd) { bd = d; best = n; }
      }
      return best;
    }
    // how far p is outside the floe of site s (the largest edge excess; <= 0 inside): the big cells' edges, or the
    // small ones' (bAmp >= 0)
    function excess(px, pz, s, list, bi, fine, coarse, bAmp) {
      let e = -1e9;
      const ds = (s.x - px) * (s.x - px) + (s.z - pz) * (s.z - pz);
      for (let n = 0; n < 25; n++) {
        if (n === bi) continue;
        const q = list[n];
        if (bAmp >= 0) { EP[0] = s.m; EP[1] = bAmp; EP[2] = 0; } else { edgeA(s, q, EP); if (!EP[3]) continue; }
        const dx = q.x - s.x, dz = q.z - s.z, Ln = Math.sqrt(dx * dx + dz * dz);
        if (Ln < 1e-6) continue;
        const b = ((q.x - px) * (q.x - px) + (q.z - pz) * (q.z - pz) - ds) / (2 * Ln);
        const v = EP[0] - b - EP[1] * fine - EP[2] * coarse;
        if (v > e) e = v;
      }
      return e;
    }
    const col = { top: 0, bot: 0, kind: 0 };
    // the ice column at (x, z): its top (where you stand) and its underside, or null over open water
    function column(px, pz) {
      const ai = nearest(px, pz, CA, cellA, NA), s = NA[ai];
      if (!s.type) return null;
      const fine = fineN(px, pz), coarse = coarseN(px, pz);
      let e = excess(px, pz, s, NA, ai, fine, coarse, -1), top = s.top, thick = s.thick;
      if (e > 0) return null;
      if (s.type === 3) {
        const bi = nearest(px, pz, CB, cellB, NB), sb = NB[bi];
        if (sb.kh >= s.keep || sb.bl) return null;
        e = Math.max(e, excess(px, pz, sb, NB, bi, fine, 0, ampB(sb, s)));
        top = sb.top; thick = sb.thick;
      }
      if (e > 0) return null;
      const d = -e, t = top + drift(px, pz), bot = top - thick;
      col.top = t; col.kind = s.type;
      col.bot = d >= SIDE.bin ? bot : d >= SIDE.s2in ? lerp(bot + SIDE.s2up, bot, (d - SIDE.s2in) / (SIDE.bin - SIDE.s2in)) : lerp(SIDE.s1, bot + SIDE.s2up, d / SIDE.s2in);
      return col;
    }

    /* ---- drawing ---- */
    // clip a convex polygon (flat x, z, edge tag) to the half plane p.u <= c; edges on the clip line take tag
    function clip(P, ux, uz, c, tag) {
      const n = P.length / 3, out = [];
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, ax = P[i * 3], az = P[i * 3 + 1], at = P[i * 3 + 2], bx = P[j * 3], bz = P[j * 3 + 1];
        const da = ax * ux + az * uz - c, db = bx * ux + bz * uz - c;
        if (da <= 0) {
          out.push(ax, az, at);
          if (db > 0) { const t = da / (da - db); out.push(ax + (bx - ax) * t, az + (bz - az) * t, tag); }
        } else if (db <= 0) { const t = da / (da - db); out.push(ax + (bx - ax) * t, az + (bz - az) * t, at); }
      }
      return out;
    }
    // the cell of site s (in grid C) as a polygon, each edge pulled in as edgeOf says; U gets each edge's
    // [ux, uz, fine, coarse, real edge]
    function cellPoly(s, C, cellF, edgeOf, U, P) {
      if (!P) { const R = C * 1.6; P = [s.x - R, s.z - R, -1, s.x + R, s.z - R, -1, s.x + R, s.z + R, -1, s.x - R, s.z + R, -1]; }
      const ci = Math.floor(s.x / C), cj = Math.floor(s.z / C), E = [0, 0, 0, 0];
      for (let a = -3; a <= 3 && P.length; a++) for (let b = -3; b <= 3 && P.length; b++) {
        const q = cellF(ci + a, cj + b);
        if (q === s) continue;
        const dx = q.x - s.x, dz = q.z - s.z, Ln = Math.hypot(dx, dz), ux = dx / Ln, uz = dz / Ln;
        edgeOf(s, q, E);
        const c = ((s.x + q.x) * 0.5) * ux + ((s.z + q.z) * 0.5) * uz - E[0];
        const tag = U.length / 5; U.push(ux, uz, E[1], E[2], E[3]);
        P = clip(P, ux, uz, c, tag);
      }
      return P;
    }
    function emitFloe(B, P, U, top, thick, fh, big) {
      const n = P.length / 3;
      if (n < 3) return;
      const ox = [], oz = [], onx = [], onz = [];
      const step = big ? 1.7 : 2.3;
      const disp = (t, x, z) => U[t * 5 + 2] * fineN(x, z) + U[t * 5 + 3] * coarseN(x, z);
      for (let i = 0; i < n; i++) {
        const j = (i + 1) % n, x = P[i * 3], z = P[i * 3 + 1], tp = P[((i + n - 1) % n) * 3 + 2], ti = P[i * 3 + 2];
        // the corner, moved by the raggedness of both its edges
        const a = tp >= 0 ? tp : ti, b = ti >= 0 ? ti : tp;
        const u1x = U[a * 5], u1z = U[a * 5 + 1], k1 = U[a * 5 + 4], u2x = U[b * 5], u2z = U[b * 5 + 1], k2 = U[b * 5 + 4];
        const d1 = disp(a, x, z), d2 = disp(b, x, z), det = u1x * u2z - u1z * u2x;
        let cx2 = 0, cz2 = 0;
        if (Math.abs(det) > 0.08) { cx2 = (d1 * u2z - d2 * u1z) / det; cz2 = (u1x * d2 - u2x * d1) / det; }
        else { cx2 = (u1x + u2x) * 0.25 * (d1 + d2); cz2 = (u1z + u2z) * 0.25 * (d1 + d2); }
        let nx = (k1 ? u1x : 0) + (k2 ? u2x : 0), nz = (k1 ? u1z : 0) + (k2 ? u2z : 0);
        const nl = Math.hypot(nx, nz) || 1;
        ox.push(x + cx2); oz.push(z + cz2); onx.push(nx / nl); onz.push(nz / nl);
        // points along the edge to the next corner
        const ex = P[j * 3] - x, ez = P[j * 3 + 1] - z, len = Math.hypot(ex, ez), kk = Math.max(1, Math.ceil(len / step)), uk = U[ti * 5 + 4];
        for (let q = 1; q < kk; q++) {
          const t = q / kk, px = x + ex * t, pz = z + ez * t, dn = disp(ti, px, pz);
          ox.push(px + U[ti * 5] * dn); oz.push(pz + U[ti * 5 + 1] * dn); onx.push(uk ? U[ti * 5] : 0); onz.push(uk ? U[ti * 5 + 1] : 0);
        }
      }
      const m = ox.length;
      let cx = 0, cz = 0;
      for (let i = 0; i < m; i++) { cx += ox[i]; cz += oz[i]; }
      cx /= m; cz /= m;
      // how far in the edge can be pulled before the outline folds over (small floes)
      let inr = 1e9;
      for (let i = 0; i < m; i++) { const nxv = onx[i], nzv = onz[i]; if (nxv || nzv) inr = Math.min(inr, (ox[i] - cx) * nxv + (oz[i] - cz) * nzv); }
      const ink = Math.min(1, Math.max(0.1, inr * 0.45) / SIDE.bin);
      const bot = top - thick;
      const v0 = B.n;
      const vtx = (x, y, z) => { B.pos.push(x, y, z); B.fh.push(fh); return B.n++; };
      const ring = (f, yFn, inset) => {
        const s = B.n;
        for (let i = 0; i < m; i++) {
          let x = cx + (ox[i] - cx) * f, z = cz + (oz[i] - cz) * f;
          if (inset) { x -= onx[i] * inset; z -= onz[i] * inset; }
          vtx(x, yFn(x, z), z);
        }
        return s;
      };
      const yTop = (x, z) => top + drift(x, z);
      const fs = big ? [1, 0.72, 0.42] : [1];
      const t0 = B.n;
      const rings = fs.map((f) => ring(f, yTop, 0));
      const cTop = vtx(cx, yTop(cx, cz), cz);
      B.tops.push(t0, B.n - t0);
      const r0 = ring(1, (x, z) => yTop(x, z) - 0.06, -0.03);
      const r1 = ring(1, () => SIDE.s1, 0);
      const r2 = ring(1, () => bot + SIDE.s2up * ink, SIDE.s2in * ink);
      const r3 = ring(1, () => bot, SIDE.bin * ink);
      // the underside: rafted and thinner patches (it only goes up from bot, so it stays inside the ice's column)
      const relief = (x, z) => bot + 0.55 * Math.max(0, nT(x * 0.11 + 31, z * 0.11)) + 0.2 * Math.max(0, nT(x * 0.4, z * 0.4 + 17));
      const bRings = big ? [0.72, 0.42].map((f) => ring(f, relief, SIDE.bin * ink * f)) : [];
      const cBot = vtx(cx, big ? relief(cx, cz) : bot, cz);
      const I = B.idx;
      const strip = (A, Bq, down) => { for (let i = 0; i < m; i++) { const j = (i + 1) % m; if (!down) I.push(Bq + i, A + j, A + i, Bq + i, Bq + j, A + j); else I.push(Bq + i, A + i, A + j, Bq + i, A + j, Bq + j); } };
      const side = (A, Bq) => { for (let i = 0; i < m; i++) { const j = (i + 1) % m; I.push(A + i, A + j, Bq + i, A + j, Bq + j, Bq + i); } };
      for (let k = 0; k + 1 < rings.length; k++) strip(rings[k], rings[k + 1], false);
      const last = rings[rings.length - 1];
      for (let i = 0; i < m; i++) I.push(cTop, last + (i + 1) % m, last + i);
      side(r0, r1); side(r1, r2); side(r2, r3);
      let lb = r3;
      for (const rb of bRings) { strip(lb, rb, true); lb = rb; }
      for (let i = 0; i < m; i++) I.push(cBot, lb + i, lb + (i + 1) % m);
      B.floes++;
      return v0;
    }
    // every floe whose cell site is inside the tile [x0, x0 + size) x [z0, z0 + size)
    function floes(x0, z0, size, B) {
      const i0 = Math.floor(x0 / CA) - 1, i1 = Math.floor((x0 + size) / CA) + 1, j0 = Math.floor(z0 / CA) - 1, j1 = Math.floor((z0 + size) / CA) + 1;
      for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
        const s = cellA(i, j);
        if (!s.type || s.x < x0 || s.x >= x0 + size || s.z < z0 || s.z >= z0 + size) continue;
        const U = [];
        const PA = cellPoly(s, CA, cellA, edgeA, U, null);
        if (PA.length < 9) continue;
        if (s.type !== 3) { emitFloe(B, PA, U, s.top, s.thick, s.type === 1 ? 0.35 : hash2(s.i, s.j, seed + 9), true); continue; }
        // broken: the small cells that reach into this one, each cut to it
        let mnx = 1e9, mxx = -1e9, mnz = 1e9, mxz = -1e9;
        for (let k = 0; k < PA.length; k += 3) { mnx = Math.min(mnx, PA[k]); mxx = Math.max(mxx, PA[k]); mnz = Math.min(mnz, PA[k + 1]); mxz = Math.max(mxz, PA[k + 1]); }
        for (let bi = Math.floor(mnx / CB) - 1; bi <= Math.floor(mxx / CB) + 1; bi++) for (let bj = Math.floor(mnz / CB) - 1; bj <= Math.floor(mxz / CB) + 1; bj++) {
          const sb = cellB(bi, bj);
          if (sb.kh >= s.keep || sb.bl) continue;
          const U2 = U.slice(), ab = ampB(sb, s);
          const P = cellPoly(sb, CB, cellB, (q0, q1, E) => { E[0] = sb.m; E[1] = ab; E[2] = 0; E[3] = 1; return E; }, U2, PA.slice());
          if (P.length < 9) continue;
          emitFloe(B, P, U2, sb.top, sb.thick, hash2(bi, bj, seed + 19), false);
        }
      }
    }
    function mesh(x0, z0, size, mtl) {
      const B = { pos: [], fh: [], idx: [], n: 0, floes: 0, tops: [] };
      floes(x0, z0, size, B);
      if (!B.n) return null;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(B.pos, 3));
      g.setAttribute('fh', new THREE.Float32BufferAttribute(B.fh, 1));
      g.setIndex(B.n > 65535 ? new THREE.Uint32BufferAttribute(B.idx, 1) : new THREE.Uint16BufferAttribute(B.idx, 1));
      g.computeVertexNormals();
      const N = g.attributes.normal.array;
      for (let k = 0; k < B.tops.length; k += 2) for (let v = B.tops[k]; v < B.tops[k] + B.tops[k + 1]; v++) { N[v * 3] = 0; N[v * 3 + 1] = 1; N[v * 3 + 2] = 0; }
      g.computeBoundingSphere();
      freeAfterUpload(g);
      const me = new THREE.Mesh(g, mtl);
      me.receiveShadow = true; me.castShadow = false; me.name = 'seaice';
      me.matrixAutoUpdate = false; me.updateMatrix();
      return me;
    }
    return { column, mesh, cellA, drift };
  }
  // the arrays in a tile's mesh are not needed again once the GPU has them (they are made fresh when the tile comes back)
  function freeAfterUpload(g) {
    const free = function () { this.array = null; };
    for (const k in g.attributes) g.attributes[k].onUpload(free);
    if (g.index) g.index.onUpload(free);
  }

  const iceGlow = { value: new THREE.Color(0, 0, 0) };
  // the floes' look: snow on top (the ground's snow picture), wet blue ice at the edges, turquoise and darker blue
  // under the water, the underside stained by ice algae. Some floes are bare and blue gray, some have melt ponds.
  let iceMat = null;
  function iceMaterial(tex) {
    if (iceMat) return iceMat;
    const m = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const U = {
      tSnow: { value: tex.snow }, tMacro: { value: tex.macro },
      uSnow: { value: lcol(0xdde5ec) }, uBare: { value: lcol(0x9fb8c8) }, uPond: { value: lcol(0x6aa8b8) },
      uWet: { value: lcol(0xc6dce6) }, uSub: { value: lcol(0x58b2c4) }, uDeep: { value: lcol(0x1f6e86) }, uAlgae: { value: lcol(0x55684e) },
      uGlow: iceGlow,
    };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, U);
      sh.vertexShader = 'attribute float fh;\nvarying vec3 vIW;\nvarying vec3 vIN;\nvarying float vFH;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vIW = (modelMatrix * vec4(transformed, 1.0)).xyz; vIN = normalize(mat3(modelMatrix) * objectNormal); vFH = fh;`);
      sh.fragmentShader = 'varying vec3 vIW;\nvarying vec3 vIN;\nvarying float vFH;\nuniform sampler2D tSnow, tMacro;\nuniform vec3 uSnow, uBare, uPond, uWet, uSub, uDeep, uAlgae, uGlow;\n' + sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        // daylight coming through the ice, seen from under it: brighter where it is thin (near the edges), mottled
        // by the snow on top and the ice algae under it
        {
          float thin = 0.35 + 0.65 * smoothstep(-2.4, -0.4, vIW.y);
          float mott = 0.55 + 1.3 * (texture2D(tMacro, p / 9.0 + vFH).r - 0.5) + 0.9 * (texture2D(tSnow, p / 1.9).g - 0.5) + 0.5 * mc.x;
          float algae = smoothstep(0.05, 0.25, texture2D(tMacro, p / 17.0 + 3.7).g - 0.5);
          vec3 gl = uGlow * max(0.12, mott) * thin * mix(vec3(1.0), vec3(0.75, 0.8, 0.45), algae * 0.6);
          totalEmissiveRadiance += gl * (dnK + (1.0 - upK) * (1.0 - dnK) * 0.4 * smoothstep(-0.2, -1.5, vIW.y));
        }`).replace('#include <color_fragment>', `
        vec3 gn = normalize(vIN);
        float upK = smoothstep(0.5, 0.82, gn.y), dnK = smoothstep(-0.35, -0.7, gn.y);
        vec2 p = vIW.xz;
        vec3 dN = texture2D(tSnow, p / 5.0).rgb;
        vec2 mc = texture2D(tMacro, p / 70.0 + vFH * 3.1).rg - 0.5;
        vec3 snow = uSnow * (1.0 + mc.x * 0.22) * ((dN - 0.5) * 2.0 + 1.0);
        float bare = smoothstep(0.7, 0.92, vFH) * smoothstep(-0.08, 0.1, mc.y);
        snow = mix(snow, uBare * (1.0 + mc.x * 0.2) * ((dN - 0.5) * 0.8 + 1.0), bare * 0.75);
        float pondy = max(step(0.88, fract(vFH * 7.31)), smoothstep(0.1, 0.18, texture2D(tMacro, p / 610.0 + 0.3).r - 0.5));
        float pond = smoothstep(0.15, 0.22, texture2D(tMacro, p / 43.0 + vFH * 7.0).g - 0.5 + 0.05 * (dN.r - 0.5)) * pondy;
        snow = mix(snow, uPond * (1.0 + mc.x * 0.15), pond * 0.8);
        float y = vIW.y;
        vec3 sideC = uWet * ((dN.r - 0.5) * 0.5 + 1.0) * (0.9 + 0.2 * smoothstep(-0.3, 0.3, sin(p.x * 3.1 + p.y * 2.3 + y * 9.0)));
        sideC = mix(sideC, uWet * 0.62, smoothstep(0.12, -0.02, y));
        sideC = mix(sideC, uSub, smoothstep(-0.02, -0.5, y));
        sideC = mix(sideC, uDeep, smoothstep(-0.5, -2.0, y));
        vec3 under = uAlgae * (0.8 + 0.5 * mc.x + 0.3 * (dN.r - 0.5));
        vec3 icc = mix(sideC, snow, upK);
        icc = mix(icc, under, dnK);
        diffuseColor.rgb *= icc;`);
    };
    m.customProgramCacheKey = () => 'arctic-ice';
    m.userData.U = U;
    iceMat = m;
    return m;
  }

  /* ============================================================
     Icebergs: rings stacked from the keel up to the rim, then the top. Most of the berg is under the water and wider
     there; the part above is cliffs with grooves and cracks. kind 'tab' (flat topped), 'dome' (peaked) or 'wedge'
     (tilted: one side comes down low to the water, so you can walk up it from the ice beside it).
     ============================================================ */
  function berg(spec) {
    const { x: bx, z: bz, r, h } = spec, kindB = spec.kind || 'tab', rot = spec.rot || 0, seedB = spec.seed || 1;
    const nA = makeNoise(seedB * 7 + 1), nB = makeNoise(seedB * 7 + 2), nC = makeNoise(seedB * 7 + 3);
    const lowA = spec.low != null ? spec.low : 0;   // (wedge) the direction its low side faces, local angle
    const shape = (a) => 1 + 0.15 * nA(Math.cos(a) * 1.1, Math.sin(a) * 1.1) + 0.07 * nA(Math.cos(a) * 2.6 + 5, Math.sin(a) * 2.6) + 0.035 * Math.sin(a * 5 + seedB);
    // rim height above the water at local angle a
    const lowK = (a) => (kindB === 'wedge' ? Math.pow(0.5 + 0.5 * Math.cos(a - lowA), 1.6) : 0);
    const rimH = (a) => (kindB === 'wedge' ? lerp(h, 0.75, lowK(a)) : kindB === 'dome' ? h * 0.32 : h);
    // under the water it bulges out (not on a wedge's low side, so the ice beside it reaches it)
    const UW = kindB === 'dome'
      ? [[-0.45, 1.03], [-2.5, 1.22], [-7, 1.38], [-13, 1.36], [-19, 1.16], [-24, 0.78], [-28, 0.36]]
      : [[-0.45, 1.03], [-2.5, 1.16], [-6, 1.32], [-12, 1.34], [-18, 1.14], [-23, 0.8], [-27, 0.36]];
    const keelY = kindB === 'dome' ? -31 : -30;
    // above the water: fractions of the rim height and of the waterline radius
    const UP = kindB === 'dome' ? [[0, 1], [0.5, 0.97], [1, 0.9]] : [[0, 1], [0.12, 0.985], [0.55, 0.98], [0.9, 0.955], [1, 0.92]];
    // the top: rings toward the middle (fraction of the rim radius, height above the rim)
    const capH = kindB === 'dome' ? h * 0.68 : kindB === 'wedge' ? 0 : 0.7;
    const CAP = [0.72, 0.42, 0.14];
    const capY = (a, f) => {
      if (kindB === 'wedge') { const mid = (h + 0.75) * 0.5 + 0.6; return lerp(mid, rimH(a), f) + 0.25 * Math.sin(f * Math.PI); }
      if (kindB === 'dome') return rimH(a) + capH * Math.pow(1 - f * f, 0.8) * (1 + 0.18 * nB(Math.cos(a) * 1.5, Math.sin(a) * 1.5) * f);
      return rimH(a) + capH * (1 - f * f) * (0.7 + 0.3 * nB(Math.cos(a) * 2, Math.sin(a) * 2));
    };
    const bulge = (a, k) => lerp(k, 1, kindB === 'wedge' ? Math.pow(lowK(a), 0.6) : 0);
    // the levels at local angle a: [y, radius] from the keel up to the rim
    function levels(a, out) {
      const R0 = r * shape(a);
      out.length = 0;
      out.push(keelY, 0.04 * R0);
      for (let k = UW.length - 1; k >= 0; k--) out.push(UW[k][0], R0 * bulge(a, UW[k][1]));
      const rh = rimH(a);
      for (const [f, kk] of UP) out.push(rh * f, R0 * kk);
      return R0;
    }
    const LV = [];
    const bound = r * 1.25 * 1.45;
    const colB = { top: 0, bot: 0, kind: 9 };
    function column(px, pz) {
      const dx0 = px - bx, dz0 = pz - bz;
      if (Math.abs(dx0) > bound || Math.abs(dz0) > bound) return null;
      const c = Math.cos(rot), s = Math.sin(rot), lx = dx0 * c - dz0 * s, lz = dx0 * s + dz0 * c;
      const d = Math.hypot(lx, lz), a = Math.atan2(lz, lx);
      levels(a, LV);
      const nL = LV.length / 2, rimR = LV[nL * 2 - 1];
      // the bottom: going up from the keel, where the berg first gets wider than d
      let bot = null, top = null;
      for (let k = 1; k < nL; k++) {
        const y0 = LV[(k - 1) * 2], r0 = LV[(k - 1) * 2 + 1], y1 = LV[k * 2], r1 = LV[k * 2 + 1];
        if (bot === null && r1 > d) { bot = r0 >= d ? y0 : lerp(y0, y1, (d - r0) / (r1 - r0)); }
        if (bot !== null && r1 <= d && r0 > d) { top = lerp(y0, y1, (r0 - d) / (r0 - r1)); break; }
      }
      if (bot === null) return null;
      if (top === null) {
        // inside the rim: on the top
        const f = d / Math.max(rimR, 1e-3);
        let y = capY(a, 1);
        const fs = [1, ...CAP, 0];
        for (let k = 0; k + 1 < fs.length; k++) if (f <= fs[k] && f >= fs[k + 1]) { const t = (fs[k] - f) / (fs[k] - fs[k + 1]); y = lerp(capY(a, fs[k]), capY(a, fs[k + 1]), t); break; }
        top = y;
      }
      colB.top = top; colB.bot = bot;
      return colB;
    }
    let geo = null;
    function makeMesh() {
      if (geo) return geo;
      const N = r > 15 ? 96 : 64, pos = [], cols = [], idx = [];
      const cSnow = L(0xeef3f7), cWall = L(0xd6e6ef), cBlue = L(0x8fc0da), cCrack = L(0x4f93bb), cNotch = L(0x6fb0cc), cSub = L(0x4aa3bf), cDeep = L(0x1d5f7f);
      const c = Math.cos(rot), s = Math.sin(rot);
      const put = (lx, y, lz, cc) => { pos.push(bx + lx * c + lz * s, y, bz - lx * s + lz * c); cols.push(cc[0], cc[1], cc[2]); return pos.length / 3 - 1; };
      const rows = [];
      // grooves and cracks: thin dark lines down the cliffs, a little inward
      const groove = (a, y) => {
        const g1 = Math.abs(nC(a * 9.0, y * 0.05)), g2 = Math.abs(nC(a * 23.0 + 9, y * 0.12 + 3));
        return { k: Math.min(1, g1 / 0.08), k2: Math.min(1, g2 / 0.05) };
      };
      const ringAt = (yFn, rFn, colFn) => {
        const row = [];
        for (let i = 0; i < N; i++) {
          const a = (i / N) * TAU, R0 = rFn(a), y = yFn(a);
          row.push(put(Math.cos(a) * R0, y, Math.sin(a) * R0, colFn(a, y, R0)));
        }
        rows.push(row);
        return row;
      };
      const wallCol = (a, y, gk) => {
        let cc = mixc(cWall, cBlue, ks(0.4, -0.2, kf(Math.cos(a) * 3, y * 0.15, Math.sin(a) * 3, 2)) * 0.6);
        cc = mixc(cc, cCrack, (1 - gk.k) * 0.75);
        cc = mixc(cc, cBlue, (1 - gk.k2) * 0.45);
        return mulc(cc, 0.92 + 0.12 * kf(Math.cos(a) * 9, y * 0.6, Math.sin(a) * 9, 2));
      };
      const subCol = (y) => mixc(cSub, cDeep, ks(-1, -20, y));
      // keel point
      const keel = put(0, keelY - 0.8, 0, cDeep);
      // underwater rings, from the keel up
      // (between the levels too, every 2 m or so; lumps, ledges and grooves only ever go inward, inside its column)
      const lumpK = (a, yy) => 1 - 0.07 * Math.abs(kf(Math.cos(a) * 4.5, yy * 0.18, Math.sin(a) * 4.5, 3)) * 2 - 0.05 * Math.pow(Math.abs(Math.sin(a * 13 + nB(Math.cos(a) * 2, yy * 0.1) * 4)), 8) - 0.035 * (0.5 + 0.5 * Math.sin(yy * 1.7 + a * 3));
      for (let k = UW.length - 1; k >= 0; k--) {
        const [yy, kk] = UW[k], nx = k > 0 ? UW[k - 1] : null;
        const subs = nx ? Math.max(1, Math.round((nx[0] - yy) / 2.2)) : 1;
        for (let q = 0; q < subs; q++) {
          const t = q / subs, y2 = nx ? lerp(yy, nx[0], t) : yy, k2 = nx ? lerp(kk, nx[1], t) : kk;
          ringAt((a) => y2 + 0.4 * nB(Math.cos(a) * 3 + k, Math.sin(a) * 3 + q), (a) => r * shape(a) * bulge(a, k2) * lumpK(a, y2), (a) => mulc(mixc(subCol(y2), cDeep, 0.35 * (1 - lumpK(a, y2)) / 0.15), 0.85 + 0.3 * Math.abs(kf(Math.cos(a) * 9, y2 * 0.35, Math.sin(a) * 9, 2))));
        }
      }
      // the waterline notch, then the cliffs up to the rim (grooves cut a little inward)
      for (let q = 0; q < UP.length; q++) {
        const [f, kk] = UP[q];
        ringAt((a) => rimH(a) * f + (q === 0 ? 0.05 : 0), (a) => {
          const g = groove(a, rimH(a) * f);
          return r * shape(a) * kk * (q === 0 ? 0.985 : 1) * (1 - 0.035 * (1 - g.k) - 0.012 * (1 - g.k2));
        }, (a, y) => (q === 0 ? cNotch : wallCol(a, y, groove(a, y))));
        if (q === 0) ringAt((a) => Math.min(0.5, rimH(a) * 0.08), (a) => r * shape(a) * 0.975, () => cNotch);
      }
      // the top: snow, a little blue showing near the rim
      for (const f of CAP) ringAt((a) => capY(a, f), (a) => r * shape(a) * UP[UP.length - 1][1] * f, (a, y) => mixc(cSnow, cWall, 0.15 + 0.15 * kf(Math.cos(a) * 4 * f, y * 0.3, Math.sin(a) * 4 * f, 2)));
      const capTop = put(0, capY(0, 0), 0, cSnow);
      // rows go up from the keel, then in over the top: each band faces out (and up on the top)
      for (let k = 0; k + 1 < rows.length; k++) {
        const A = rows[k], Bq = rows[k + 1];
        for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(Bq[i], Bq[j], A[i], Bq[j], A[j], A[i]); }
      }
      const first = rows[0], last = rows[rows.length - 1];
      for (let i = 0; i < N; i++) { const j = (i + 1) % N; idx.push(keel, first[i], first[j]); idx.push(capTop, last[j], last[i]); }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
      g.setAttribute('color', new THREE.Float32BufferAttribute(cols, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      g.computeBoundingSphere();
      geo = g;
      return g;
    }
    function mesh(tex) {
      const me = new THREE.Mesh(makeMesh(), bergMaterial(tex));
      me.castShadow = true; me.receiveShadow = true; me.name = 'iceberg';
      me.matrixAutoUpdate = false; me.updateMatrix();
      me.userData.cull = 1;
      return me;
    }
    function dispose() { if (geo) { geo.dispose(); geo = null; } }
    return { x: bx, z: bz, r, h, kind: kindB, bound, column, mesh, dispose, rimH, waterR: (a) => r * shape(a - rot) };
  }
  let bergMat = null;
  function bergMaterial(tex) {
    if (bergMat) return bergMat;
    const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.42, metalness: 0 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.tSnow = { value: tex.snow };
      sh.vertexShader = 'varying vec3 vBW;\nvarying vec3 vBN;\n' + sh.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
        vBW = (modelMatrix * vec4(transformed, 1.0)).xyz; vBN = normalize(mat3(modelMatrix) * objectNormal);`);
      sh.fragmentShader = 'varying vec3 vBW;\nvarying vec3 vBN;\nuniform sampler2D tSnow;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
        vec3 bn = abs(normalize(vBN)); bn = bn * bn; bn /= (bn.x + bn.y + bn.z);
        vec3 det = texture2D(tSnow, vBW.zy / 4.0).rgb * bn.x + texture2D(tSnow, vBW.xz / 4.0).rgb * bn.y + texture2D(tSnow, vBW.xy / 4.0).rgb * bn.z;
        // (under the water: melt scallops and broad streaks in the old glacier ice)
        vec3 det2 = texture2D(tSnow, vBW.zy / 1.3).rgb * bn.x + texture2D(tSnow, vBW.xz / 1.3).rgb * bn.y + texture2D(tSnow, vBW.xy / 1.3).rgb * bn.z;
        float uw = smoothstep(0.0, -1.0, vBW.y);
        diffuseColor.rgb *= ((det - 0.5) * mix(1.6, 3.2, uw) + 1.0) * mix(1.0, (det2.r - 0.5) * 2.6 + 1.0, uw);`);
    };
    m.customProgramCacheKey = () => 'arctic-berg';
    bergMat = m;
    return m;
  }

  const arctic = { iceField, berg, iceMaterial, bergMaterial, ICE_THICK };
  Env.arctic = arctic;

  /* ============================================================
     The sea floor: kelp, seaweed, anemones, sponges, urchins (all things that live in the Arctic)
     ============================================================ */
  const DS = THREE.DoubleSide;
  // a ribbon blade rising from base along dir: width w(t), ruffled edges (they wave out of the blade's plane)
  function blade(S, base, dir, len, w, o) {
    const seg = o.seg || 10, side = new V3(-dir.z, 0, dir.x).normalize(), up = new V3(0, 1, 0);
    const P = (t) => base.clone().addScaledVector(up, len * t * (1 - 0.18 * t * t)).addScaledVector(dir, len * (o.lean || 0.25) * t * t);
    for (let i = 0; i < seg; i++) {
      const t0 = i / seg, t1 = (i + 1) / seg, p0 = P(t0), p1 = P(t1);
      const n0 = new V3().subVectors(p1, p0).normalize().cross(side).normalize();
      const w0 = w(t0), w1 = w(t1);
      const r0 = (o.ruffle || 0) * Math.sin(t0 * (o.rf || 30) + (o.ph || 0)), r1 = (o.ruffle || 0) * Math.sin(t1 * (o.rf || 30) + (o.ph || 0));
      const L0 = p0.clone().addScaledVector(side, -w0).addScaledVector(n0, r0 * w0 * 4), R0 = p0.clone().addScaledVector(side, w0).addScaledVector(n0, -r0 * w0 * 4);
      const L1 = p1.clone().addScaledVector(side, -w1).addScaledVector(n0, r1 * w1 * 4), R1 = p1.clone().addScaledVector(side, w1).addScaledVector(n0, -r1 * w1 * 4);
      const cm0 = o.color(t0, 0), cm1 = o.color(t1, 0), ce0 = o.color(t0, 1), ce1 = o.color(t1, 1);
      S.quad(p0, p1, L1, L0, cm0, cm1, ce1, ce0);
      S.quad(p0, R0, R1, p1, cm0, ce0, ce1, cm1);
    }
  }
  // sugar kelp: a clump of long blades on short stipes, olive brown, golden at the ruffled edges
  PROPS.kelp = (v) => {
    const r = krng(14100 + v * 17), S = soup(), gs = [];
    const n = 4 + v + ((r() * 2) | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * 0.35, bx = Math.cos(a) * d, bz = Math.sin(a) * d;
      const st = 0.25 + r() * 0.35, len = 1.3 + r() * 1.5 + v * 0.3, W = 0.07 + r() * 0.05, dir = new V3(Math.cos(a + 0.4), 0, Math.sin(a + 0.4));
      const dark = L(0x3e3418), olive = L(0x6b5a26), gold = L(0x9a8234);
      gs.push(K.tube([new V3(bx, 0, bz), new V3(bx + dir.x * 0.03, st * 0.5, bz + dir.z * 0.03), new V3(bx + dir.x * 0.06, st, bz + dir.z * 0.06)], 0.012, { radial: 4, color: () => dark }));
      gs.push(ico(0.05, 0, bx, 0.02, bz, 1.2, 0.5, 1.2, dark));
      blade(S, new V3(bx + dir.x * 0.06, st, bz + dir.z * 0.06), dir, len, (t) => W * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.08 + 0.04)), 0.55) * (1 - 0.35 * t) + 0.004,
        { seg: 11, lean: 0.3 + r() * 0.3, ruffle: 0.06, rf: 26 + r() * 10, ph: r() * 6, color: (t, e) => mixc(mixc(dark, olive, ks(0, 0.2, t)), gold, e * 0.55 + t * 0.15) });
    }
    const g = merge([S.geo(false), ...gs.map(prep)]);
    return { parts: [{ geometry: K.upNormals(g, 0.3), material: mat('kelp', { side: DS, sway: 0.55, flutter: 0.01 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.kelp = 3;
  // red dulse fronds, or a tuft of green and brown weed
  PROPS.seaweed = (v) => {
    const r = krng(14200 + v * 13), S = soup();
    const n = v === 0 ? 8 : 14;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.5, dir = new V3(Math.cos(a), 0, Math.sin(a));
      if (v === 0) {
        const c0 = L(0x5a1a24), c1 = L(0x9a3a44);
        blade(S, new V3(0, 0, 0), dir, 0.22 + r() * 0.18, (t) => 0.035 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.05 + 0.05)), 0.7) + 0.004, { seg: 5, lean: 1.4, ruffle: 0.08, rf: 14, ph: r() * 6, color: (t, e) => mixc(c0, c1, t * 0.6 + e * 0.3) });
      } else {
        const green = r() < 0.5, c0 = green ? L(0x2c4a1c) : L(0x3e3418), c1 = green ? L(0x5e8a2e) : L(0x7a6630);
        blade(S, new V3((r() - 0.5) * 0.08, 0, (r() - 0.5) * 0.08), dir, 0.25 + r() * 0.25, (t) => 0.008 * (1 - t) + 0.002, { seg: 5, lean: 0.6, color: (t) => mixc(c0, c1, t) });
      }
    }
    return { parts: [{ geometry: K.upNormals(S.geo(false), 0.3), material: mat('seaweed', { side: DS, sway: 1.2, flutter: 0.006 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.seaweed = 2;
  // plumose anemones (white and orange, frilly crowns on tall columns), or red and green ones with thick tentacles
  PROPS.anemones = (v) => {
    const r = krng(14300 + v * 7), gs = [];
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = i ? 0.08 + r() * 0.14 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d;
      if (v === 0) {
        const ht = 0.12 + r() * 0.16, rad = 0.025 + r() * 0.015, orange = r() < 0.3;
        const body = orange ? L(0xd9864a) : L(0xe8e2d6), crownC = orange ? L(0xf0a060) : L(0xf6f2ea);
        gs.push(paint(K.place(new THREE.CylinderGeometry(rad * 1.1, rad * 1.4, ht, 8, 1, true), x, ht / 2, z), body));
        for (let k = 0; k < 9; k++) { const b = r() * TAU, e = r() * rad * 2.2; gs.push(ico(rad * (0.55 + r() * 0.4), 0, x + Math.cos(b) * e, ht + rad * 0.6 + r() * rad, z + Math.sin(b) * e, 1, 0.7, 1, mixc(crownC, body, r() * 0.4))); }
      } else {
        const rad = 0.04 + r() * 0.03, ht = 0.05 + r() * 0.03, red = L(0xa82a2a), green = L(0x5a8a3a), band = r() < 0.5 ? red : L(0xc84a3a);
        gs.push(paint(K.place(new THREE.CylinderGeometry(rad, rad * 1.2, ht, 10), x, ht / 2, z), mixc(red, green, 0.25 + r() * 0.3)));
        gs.push(paint(K.place(new THREE.CylinderGeometry(rad * 0.85, rad * 0.95, 0.01, 10), x, ht + 0.005, z), L(0xd8a090)));
        for (let k = 0; k < 14; k++) {
          const b = (k / 14) * TAU, tl = rad * (0.9 + r() * 0.5);
          const cone = new THREE.ConeGeometry(rad * 0.16, tl, 5);
          cone.rotateZ(-0.9); cone.rotateY(-b); cone.translate(x + Math.cos(b) * (rad * 0.75 + tl * 0.3), ht + tl * 0.3, z + Math.sin(b) * (rad * 0.75 + tl * 0.3));
          gs.push(paint(cone, k % 2 ? band : mixc(band, L(0xf0e0c0), 0.4)));
        }
      }
    }
    return { parts: [{ geometry: merge(gs), material: mat('anemone', { std: true, roughness: 0.6 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.anemones = 2;
  // a yellow lumpy sponge with dark holes, or a clump of pale orange fingers
  PROPS.sponge = (v) => {
    const r = krng(14400 + v * 5), gs = [];
    if (v === 0) {
      const n = 4 + ((r() * 3) | 0), base = L(0xc8a838), dk = L(0x6a5418);
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = r() * 0.12, s = 0.07 + r() * 0.08, x = Math.cos(a) * d, z = Math.sin(a) * d, off = r() * 9;
        const g = prep(new THREE.IcosahedronGeometry(s, 1));
        eachVertex(g, (p) => { const k = 1 + 0.3 * kf(p.x * 18 + off, p.y * 18, p.z * 18, 2); p.multiplyScalar(k); p.y = Math.max(p.y, -s * 0.3) * 0.8; p.x += x; p.z += z; p.y += s * 0.25; });
        smoothNormals(g);
        gs.push(paint(g, (px, py, pz, nx, ny) => mixc(base, dk, ks(0.75, 0.95, ny) * ks(0.1, 0.3, kf(px * 30 + off, py * 30, pz * 30, 1)) * 0.9)));
      }
    } else {
      const c0 = L(0xd88a5a), c1 = L(0xf0c8a0);
      for (let i = 0; i < 6; i++) {
        const a = r() * TAU, lean = 0.1 + r() * 0.25, ht = 0.15 + r() * 0.18, x = Math.cos(a) * 0.04, z = Math.sin(a) * 0.04;
        gs.push(K.tube([new V3(x, 0, z), new V3(x + Math.cos(a) * lean * ht * 0.4, ht * 0.5, z + Math.sin(a) * lean * ht * 0.4), new V3(x + Math.cos(a) * lean * ht, ht, z + Math.sin(a) * lean * ht)],
          (k, t) => 0.022 * (1 - t * 0.3), { radial: 6, cap: 'end', color: (t) => mixc(c0, c1, t) }));
      }
    }
    return { parts: [{ geometry: merge(gs), material: mat('sponge', { std: true, roughness: 0.85 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.sponge = 2;
  // green sea urchins: spiny balls a few centimeters across
  PROPS.urchins = () => {
    const r = krng(14500), gs = [];
    for (let i = 0; i < 6; i++) {
      const a = r() * TAU, d = r() * 0.35, s = 0.025 + r() * 0.02, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const g = prep(new THREE.IcosahedronGeometry(s, 2));
      eachVertex(g, (p) => { const hh = Math.abs(Math.sin(p.x * 913.1 + p.y * 471.7 + p.z * 253.3)); p.multiplyScalar(hh > 0.55 ? 1.7 : 0.92); p.y *= 0.8; p.x += x; p.z += z; p.y += s * 0.6; });
      gs.push(paint(g, (px, py, pz) => mixc(L(0x4a5a20), L(0x7a4a6a), ks(s * 0.9, s * 1.5, Math.hypot(px - x, (py - s * 0.6) / 0.8, pz - z)))));
    }
    return { parts: [{ geometry: merge(gs), material: mat('urchin', { std: true, roughness: 0.7 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.urchins = 1;

  /* ---- ice on the ice: rubble where floes pushed together, and brash floating in the leads ---- */
  function iceBlock(r, sx, sy, sz, x, y, z, rx, ry, rz) {
    const g = prep(new THREE.BoxGeometry(sx, sy, sz, 1, 1, 1));
    eachVertex(g, (p) => { p.x += (r() - 0.5) * sx * 0.25; p.z += (r() - 0.5) * sz * 0.25; p.y += (r() - 0.5) * sy * 0.15; });
    K.place(g, x, y, z, rx, ry, rz);
    g.computeVertexNormals();
    return paint(g, (px, py, pz, nx, ny) => mixc(mixc(L(0x8fb8cc), L(0xc6dce8), ks(-0.2, 0.6, ny)), L(0xe8eef2), ks(0.55, 0.85, ny)));
  }
  PROPS.icerubble = (v) => {
    const r = krng(14600 + v * 11), gs = [], n = 6 + v * 2;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * 1.1, s = 0.35 + r() * 0.6, up = i < 3 ? 0 : r() * 0.5;
      gs.push(iceBlock(r, s * (1 + r()), s * (0.35 + r() * 0.4), s * (0.6 + r() * 0.6), Math.cos(a) * d, s * 0.2 + up, Math.sin(a) * d, (r() - 0.5) * 1.2, r() * TAU, (r() - 0.5) * 1.2));
    }
    return { parts: [{ geometry: merge(gs), material: mat('iceRubble', {}), castShadow: true }], radius: 1.0 };
  };
  VARIANTS.icerubble = 3;
  PROPS.brash = (v) => {
    const r = krng(14700 + v * 3), gs = [];
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = r() * 1.2, s = 0.12 + r() * 0.3, x = Math.cos(a) * d, z = Math.sin(a) * d, off = r() * 9;
      const g = prep(new THREE.IcosahedronGeometry(s, 1));
      eachVertex(g, (p) => { p.x *= 1 + 0.4 * kf(p.x * 9 + off, 1, p.z * 9, 1); p.y = clamp(p.y, -s * 0.5, s * 0.25) * 0.6; p.x += x; p.z += z; });
      g.computeVertexNormals();
      gs.push(paint(g, (px, py) => mixc(L(0x6fb4c8), L(0xe2ecf2), ks(-0.02, 0.06, py))));
    }
    return { parts: [{ geometry: merge(gs), material: mat('brash', { std: true, roughness: 0.3 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.brash = 3;
  // driftwood: a log washed up on the beach, bleached silver gray, its root end flared
  PROPS.driftwood = (v) => {
    const r = krng(14800 + v * 7), pts = [], len = 2.2 + v * 0.9;
    for (let i = 0; i <= 7; i++) { const t = i / 7; pts.push(new V3(-len / 2 + t * len, 0.15 + Math.sin(t * 2.4 + v) * 0.03, Math.sin(t * 2.2 + v) * 0.14)); }
    const wood = (t, a, p) => { const n = kf(p.x * 2, p.y * 6, p.z * 6, 2), grain = 0.86 + 0.14 * Math.sin(a * 11 + p.x * 9); return mulc(mixc(L(0x6a665e), L(0xb6b0a4), clamp(n * 0.8 + 0.55, 0, 1)), grain); };
    const gs = [K.tube(pts, (i, t, a) => (0.14 - t * 0.05 + (t < 0.14 ? (0.14 - t) * 1.2 : 0)) * (1 + 0.06 * Math.sin(a * 5 + t * 14)), { radial: 9, cap: 'both', capColor: L(0x8e8676), color: wood })];
    for (let k = 0; k < 3; k++) {
      const a = r() * TAU, b = new V3(-len / 2 + 0.05, 0.15, 0), e = b.clone().add(new V3(-0.25 - r() * 0.2, Math.sin(a) * 0.3, Math.cos(a) * 0.3));
      gs.push(K.tube([b, b.clone().lerp(e, 0.5).add(new V3(0, 0.03, 0)), e], (i, t) => 0.05 * (1 - t * 0.7), { radial: 5, cap: 'end', color: wood }));
    }
    const g = merge(gs);
    eachVertex(g, (p) => { if (p.y < 0.02) p.y = 0.02 + (p.y - 0.02) * 0.2; });
    return { parts: [{ geometry: g, material: mat('driftwood', {}), castShadow: true }], radius: 0.25 };
  };
  VARIANTS.driftwood = 2;

  /* ============================================================
     Under the water (any world with water): when the camera goes below the surface the frame changes over at once.
     Blue green fog that closes in with depth and darker under ice, lights filtered to the color of the water, the
     surface seen from below (the sky in a bright round window overhead, the floes dark against it, a mirror of the
     dark water outside it), light shafts slanting down near the surface, drifting specks, and caustics on the sea
     floor (the ground shader in 50_world reads Env.underwater.caust). No extra render passes; above the water nothing
     here draws or changes anything.
     ============================================================ */
  const UWS = { under: false, ice: 0, w: null, mesh: null, o: null };
  const caust = { value: 0 };
  const cTmp = new THREE.Color(), fogLin = new THREE.Color(), cDeep = new THREE.Color(), cShal = new THREE.Color(), skyLin = new THREE.Color(), tint = new THREE.Color();
  const WAVE_GLSL = `
vec2 waveGrad(vec2 p, float t) {
  vec2 g = vec2(0.0);
  vec2 d1 = vec2(0.8, 0.6), d2 = vec2(-0.5, 0.86), d3 = vec2(0.2, -0.98), d4 = vec2(-0.93, -0.37);
  g += d1 * cos(dot(p, d1) * 1.3 + t * 1.6) * 0.30;
  g += d2 * cos(dot(p, d2) * 2.1 - t * 1.9) * 0.22;
  g += d3 * cos(dot(p, d3) * 3.7 + t * 2.6) * 0.12;
  g += d4 * cos(dot(p, d4) * 6.3 - t * 3.1) * 0.07;
  g += vec2(0.6, -0.8) * cos(dot(p, vec2(0.6, -0.8)) * 11.0 + t * 4.0) * 0.035;
  g += vec2(0.95, 0.3) * cos(dot(p, vec2(0.95, 0.3)) * 19.0 - t * 5.0) * 0.03;
  return g;
}`;
  let underMat = null;
  const underU = { uSky: { value: new THREE.Color() }, uTir: { value: new THREE.Color() }, uSunC: { value: new THREE.Color() }, uSunD: { value: new V3(0, 1, 0) } };
  function underMaterial() {
    if (underMat) return underMat;
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    Object.assign(u, underU, { uTime: waterUniforms.time });
    underMat = new THREE.ShaderMaterial({
      uniforms: u, fog: true, side: THREE.BackSide,
      vertexShader: `
uniform float uTime;
varying vec3 vWorld;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec3 p = position;
  vec4 w = modelMatrix * vec4(p, 1.0);
  p.y += (sin(w.x * 0.35 + uTime * 1.1) * 0.5 + sin(w.z * 0.42 - uTime * 0.9) * 0.5) * 0.035;
  vec4 wp = modelMatrix * vec4(p, 1.0);
  vWorld = wp.xyz;
  vec4 mvPosition = viewMatrix * wp;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uTime;
uniform vec3 uSky, uTir, uSunC, uSunD;
varying vec3 vWorld;
#include <common>
#include <fog_pars_fragment>
${WAVE_GLSL}
void main() {
  vec2 g = waveGrad(vWorld.xz, uTime) * 0.16;
  vec3 Vd = normalize(vWorld - cameraPosition);
  float rip = (g.x * 0.7 + g.y * 0.5) / 0.16;
  // Snell's window: the whole sky squeezed into a circle about 49 degrees from straight up, its edge moved by ripples;
  // outside it the surface mirrors the dark water below
  float up = Vd.y + dot(g, Vd.xz) * 2.2;
  float win = smoothstep(0.62, 0.74, up);
  vec3 c = mix(uTir * (1.0 + rip * 0.25), uSky * (1.0 + rip * 0.3 + (1.0 - win) * 0.6), win);
  vec3 sr = normalize(vec3(uSunD.x * 0.72, max(uSunD.y, 0.05), uSunD.z * 0.72));
  float sd = max(dot(Vd, sr) + dot(g, Vd.xz) * 0.6, 0.0);
  c += uSunC * (pow(sd, 160.0) * 1.6 + pow(sd, 12.0) * 0.2) * win;
  gl_FragColor = vec4(c, 1.0);
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    });
    underMat.toneMapped = false;
    return underMat;
  }
  // light shafts: soft slanted quads near the surface, fixed in the water around the camera
  const shaftU = { uCam: { value: new V3() }, uRight: { value: new V3(1, 0, 0) }, uDir: { value: new V3(0, -1, 0) }, uTime: waterUniforms.time, uColor: { value: new THREE.Color() }, uBox: { value: 34 }, uLen: { value: 16 } };
  function makeShafts() {
    const N = 18, r = krng(4242), corner = [], seed = [], idx = [];
    for (let i = 0; i < N; i++) {
      const s = [r(), r(), r(), r()];
      for (const [u, v] of [[-1, 0], [1, 0], [1, 1], [-1, 1]]) { corner.push(u, v); seed.push(...s); }
      const b = i * 4; idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 12), 3));
    g.setAttribute('corner', new THREE.Float32BufferAttribute(corner, 2));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 4));
    g.setIndex(idx);
    const m = new THREE.ShaderMaterial({
      uniforms: shaftU, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: DS, fog: false,
      vertexShader: `
attribute vec2 corner;
attribute vec4 seed;
uniform vec3 uCam, uRight, uDir;
uniform float uTime, uBox, uLen;
varying float vA, vU;
void main() {
  vec2 rel = mod(seed.xy * uBox - uCam.xz + uBox * 0.5, uBox) - uBox * 0.5;
  vec2 base = uCam.xz + rel;
  float w = 0.35 + seed.z * 1.2, len = uLen * (0.55 + 0.45 * seed.w), v = corner.y;
  vec3 p = vec3(base.x, -0.05, base.y) + uDir * (v * len) + uRight * corner.x * w * (1.0 + v * 0.8);
  vU = corner.x;
  float d = length(p - uCam);
  vA = (1.0 - v) * smoothstep(0.0, 0.12, v) * smoothstep(uBox * 0.5, uBox * 0.28, length(rel)) * smoothstep(0.6, 3.0, d);
  vA *= 0.5 + 0.5 * sin(uTime * (0.35 + seed.z * 0.5) + seed.w * 20.0);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`,
      fragmentShader: `
uniform vec3 uColor;
varying float vA, vU;
void main() {
  float e = 1.0 - vU * vU;
  gl_FragColor = vec4(uColor * e * e * vA, 1.0);
}`,
    });
    m.toneMapped = false;
    const me = new THREE.Mesh(g, m);
    me.frustumCulled = false; me.visible = false; me.renderOrder = 6; me.name = 'uwShafts';
    return me;
  }
  // drifting specks (marine snow): small pale dots in a box around the camera
  const speckU = { uCam: { value: new V3() }, uTime: waterUniforms.time, uColor: { value: new THREE.Color() }, uScale: { value: 300 }, uBox: { value: 22 } };
  function makeSpecks() {
    const N = 420, r = krng(4343), seed = [];
    for (let i = 0; i < N; i++) seed.push(r(), r(), r());
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(N * 3), 3));
    g.setAttribute('seed', new THREE.Float32BufferAttribute(seed, 3));
    const m = new THREE.ShaderMaterial({
      uniforms: speckU, transparent: true, depthWrite: false, fog: false,
      vertexShader: `
attribute vec3 seed;
uniform vec3 uCam;
uniform float uTime, uScale, uBox;
varying float vA;
void main() {
  vec3 drift = vec3(sin(uTime * 0.13 + seed.y * 6.0) * 0.6 + uTime * 0.05, -uTime * 0.04 * (0.5 + seed.z), cos(uTime * 0.11 + seed.x * 6.0) * 0.6);
  vec3 p = uCam + mod(seed * uBox + drift - uCam + uBox * 0.5, uBox) - uBox * 0.5;
  p.y = min(p.y, -0.1);
  vec4 mv = viewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mv;
  float d = length(p - uCam);
  vA = smoothstep(uBox * 0.5, uBox * 0.2, d) * (0.4 + 0.6 * seed.z);
  gl_PointSize = max(1.0, uScale * (0.018 + seed.x * 0.02) / -mv.z);
}`,
      fragmentShader: `
uniform vec3 uColor;
varying float vA;
void main() {
  vec2 q = gl_PointCoord - 0.5;
  float a = smoothstep(0.5, 0.15, length(q)) * vA;
  if (a < 0.02) discard;
  gl_FragColor = vec4(uColor, a);
}`,
    });
    m.toneMapped = false;
    const pts = new THREE.Points(g, m);
    pts.frustumCulled = false; pts.visible = false; pts.renderOrder = 6; pts.name = 'uwSpecks';
    const sz = new THREE.Vector2();
    pts.onBeforeRender = (renderer, scene, camera) => { renderer.getDrawingBufferSize(sz); speckU.uScale.value = sz.y * 0.5 * camera.projectionMatrix.elements[5]; };
    return pts;
  }
  function leave(w) {
    const o = UWS.o;
    UWS.under = false;
    if (w && w.def.fog) { o.scene.fog.near = w.def.fog[0]; o.scene.fog.far = w.def.fog[1]; }
    o.sky.mesh.visible = true;
    if (o.clouds) o.clouds.group.visible = true;
    o.shafts.visible = false; o.specks.visible = false;
    if (UWS.mesh) UWS.mesh.visible = false;
    caust.value = 0;
  }
  const dirTmp = new V3(), rightTmp = new V3();
  Env.underwater = {
    caust,
    get under() { return UWS.under; },
    get ice() { return UWS.ice; },
    // o: { scene, sky, clouds, sun, hemi, renderer, hide: [points that only belong above the water] }
    init(o) {
      UWS.o = o;
      o.shafts = makeShafts(); o.specks = makeSpecks();
      o.scene.add(o.shafts, o.specks);
    },
    update(dt, camera, w, room, night) {
      const o = UWS.o; if (!o) return;
      const cp = camera.position;
      const under = !!(w && !room && w.def.water && !w.def.islands && cp.y < WATER - 0.03 && cp.x < World.ROOM_X - 20 && w.H(cp.x, cp.z) < cp.y);
      if (!under) { if (UWS.under) leave(w); return; }
      if (!UWS.under) UWS.ice = w.ceilAt && w.ceilAt(cp.x, cp.z, cp.y) < Infinity ? 1 : 0;
      UWS.under = true;
      // the surface from below, on the world's own water plane
      if (UWS.w !== w || !UWS.mesh || UWS.mesh.parent !== w.waterMesh) {
        UWS.w = w;
        UWS.mesh = w.waterMesh ? new THREE.Mesh(w.waterMesh.geometry, underMaterial()) : null;
        if (UWS.mesh) { UWS.mesh.name = 'waterUnder'; w.waterMesh.add(UWS.mesh); }
      }
      if (UWS.mesh) UWS.mesh.visible = true;
      const depth = WATER - cp.y;
      const iceNow = w.ceilAt && w.ceilAt(cp.x, cp.z, cp.y) < Infinity ? 1 : 0;
      UWS.ice = damp(UWS.ice, iceNow, 2.5, dt);
      const ice = UWS.ice, nt = night || 0, day = 1 - nt;
      const wd = w.def.water, murky = wd.swampy ? 1 : 0, clear = wd.clarity != null ? wd.clarity : murky ? 0.15 : 0.62;
      // the water's color: its own (lakes greener, the swamp brown), deeper and darker the further down
      // (round 15: manatee: a world can give the water its own color under the surface, under and underDeep: the
      // Jungle river's brown green, which from above looks the same as before)
      cShal.copy(lcol(wd.under != null ? wd.under : wd.color != null ? wd.color : murky ? 0x6a6e3e : 0x3c7484));
      cDeep.copy(lcol(wd.underDeep != null ? wd.underDeep : wd.deep != null ? wd.deep : murky ? 0x3a3a20 : 0x0f3446));
      const light = (0.08 + 0.92 * day) * (0.4 + 0.6 * Math.exp(-depth / 22)) * (1 - 0.6 * ice);
      fogLin.copy(cShal).lerp(cDeep, ks(0, 28, depth) * 0.5).multiplyScalar(0.35 + 1.1 * light);
      displayColor(fogLin, cTmp);
      o.scene.fog.color.copy(cTmp); o.renderer.setClearColor(cTmp);
      o.scene.fog.near = 0.3;
      o.scene.fog.far = (8 + 46 * clear) * (1 + 0.4 * ks(4, 30, depth)) * lerp(1, 0.62, ice) * lerp(1, 0.55, nt);
      o.sky.mesh.visible = false;
      if (o.clouds) o.clouds.group.visible = false;
      for (const p of o.hide || []) p.visible = false;
      // light filtered by the water: bluer and dimmer the deeper you go, dim under the ice
      tint.copy(cShal).multiplyScalar(1 / Math.max(0.05, Math.max(cShal.r, cShal.g, cShal.b)));
      o.sun.color.multiply(tint);
      o.sun.intensity *= 0.7 * (0.12 + 0.88 * Math.exp(-depth / 14)) * (1 - 0.75 * ice);
      // the light through the ice overhead, for the floes' undersides
      iceGlow.value.copy(o.sky.uniforms.uHorizon.value).lerp(tint, 0.45).multiplyScalar(0.5 * (0.06 + 0.94 * day));
      const hk = (0.55 + 0.45 * light / Math.max(0.05, 0.08 + 0.92 * day)) * (0.3 + 0.7 * day);
      o.hemi.color.multiply(tint).lerp(cTmp.copy(fogLin).multiplyScalar(2.2 / Math.max(0.02, fogLin.g)), 0.45).multiplyScalar(hk);
      o.hemi.groundColor.copy(fogLin).multiplyScalar(0.45);
      // the surface overhead: the sky in its window, the mirror of the water outside it
      skyLin.copy(o.sky.uniforms.uZenith.value).lerp(o.sky.uniforms.uHorizon.value, 0.45).multiplyScalar(1.15);
      underU.uSky.value.copy(skyLin).lerp(fogLin, 0.25 + 0.5 * ice);
      underU.uTir.value.copy(fogLin).multiplyScalar(0.7);
      underU.uSunC.value.copy(o.sun.color).multiplyScalar(o.sun.intensity > 0 ? Math.min(1.5, o.sun.intensity * 1.2) : 0);
      underU.uSunD.value.copy(o.sun.position).sub(o.sun.target.position).normalize();
      // light shafts near the surface, pointing along the bent sunlight
      const sd = underU.uSunD.value;
      dirTmp.set(-sd.x * 0.72, -Math.max(sd.y, 0.05), -sd.z * 0.72).normalize();
      camera.getWorldDirection(rightTmp); rightTmp.set(-rightTmp.z, 0, rightTmp.x).normalize();
      const shaftK = 0.13 * day * Math.sqrt(Math.max(0, sd.y)) * (1 - ice) * (1 - ks(6, 22, depth)) * (1 - murky * 0.7);
      o.shafts.visible = shaftK > 0.002;
      shaftU.uCam.value.copy(cp); shaftU.uRight.value.copy(rightTmp); shaftU.uDir.value.copy(dirTmp);
      shaftU.uColor.value.copy(o.sun.color).multiplyScalar(shaftK);
      // specks, lit like the water around them
      o.specks.visible = true;
      speckU.uCam.value.copy(cp);
      speckU.uColor.value.copy(fogLin).multiplyScalar(2.2).addScalar(0.04 + 0.1 * light);
      // caustics on the sea floor: strongest in the shallows in daylight, none under the ice
      caust.value = 0.9 * day * Math.max(0, sd.y) * (1 - ice) * (1 - murky * 0.8);
    },
  };
})();
