/* ============================================================
   Coral reef kit (round 18): the Coral Reef world's island plants, its corals and the reef's fish and sea turtles.
     props   reefpalm (3)      coconut palms leaning out over the water (the lean is along the prop's +x)
             beachgrass (2)    tufts of beach grass on the island
             crestcoral (2)    the reef crest: elkhorn coral thickets with brain and boulder corals
             slopecoral (3)    the fore reef: table corals, staghorn, brain, boulder and pillar corals, purple sea fans
                               and soft corals swaying
             wallcoral (2)     the reef wall: plate corals, sea fans, barrel and tube sponges, soft corals
             bommie (2)        a lagoon coral head: a big brain or boulder coral with staghorn, sponges and a fan
             staghorn (2)      a staghorn coral thicket
             barrelsponge      a big barrel sponge on the deep slope
             giantclam         a giant clam, its blue green mantle between the wavy shells
             starfish (2)      a cushion star and a blue star on the sand
             diadema           long-spined black sea urchins
     Env.reef.life(w, zone)    the reef's fish (clownfish in their anemones, blue and yellow tangs, parrotfish, a school
                               of sergeant majors, queen angelfish, butterflyfish, Moorish idols) and green sea
                               turtles, made in cells around you; one instanced mesh for all the fish (a small colour
                               atlas, the swimming done in the vertex shader), one for the turtles, one for the
                               anemones. 50_world's w.tick runs it.
   The corals share two materials and one small atlas (brain coral grooves, coral cups, the sea fans' lattice and a fine
   grain), and each coral prop has a cheap stand-in further away (lod).
   ============================================================ */
(() => {
  const K = Env._k;
  const { V3, L, lcol, mixc, mulc, prep, paint, merge, eachVertex, smoothNormals, soup, mat, PROPS, VARIANTS, ico, C } = K;
  const ks = K.smooth, kf = K.fbm, krng = K.rng;
  const DS = THREE.DoubleSide;

  /* ---- the coral atlas: 512 x 512, four squares (u, v from the bottom left): brain grooves (0, .5), coral cups (.5, .5),
     the sea fan lattice with alpha (0, 0) and a fine grain (.5, 0) ---- */
  let ATLAS = null;
  function atlas() {
    if (ATLAS) return ATLAS;
    const N = 512, Hf = 256, cv = document.createElement('canvas'); cv.width = cv.height = N;
    const c = cv.getContext('2d'), img = c.createImageData(N, N), d = img.data, nz = makeNoise(1818), nz2 = makeNoise(1819);
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const k = (y * N + x) * 4; let v = 255, a = 255;
      if (y < Hf && x < Hf) {
        // brain coral: meandering ridges along the contour lines of a noise field, dark grooves between them
        const th = fbm(nz, x / 55, y / 55, 3) * 7, wx = x + 6 * fbm(nz2, x / 30, y / 30, 2), wy = y + 6 * fbm(nz2, y / 30 + 9, x / 30, 2);
        const t = 0.5 + 0.5 * Math.sin((wx * Math.cos(th) + wy * Math.sin(th)) * 0.62);
        v = 255 * (0.4 + 0.6 * ks(0.25, 0.7, t) - 0.12 * ks(0.9, 1, t));
      } else if (y < Hf) {
        // coral cups: round corallites, a dark ring and a pale middle, packed close
        const X = x - Hf, gx = X / 13, gy = y / 13, ix = Math.floor(gx), iy = Math.floor(gy);
        let best = 9;
        for (let oy = -1; oy <= 1; oy++) for (let ox = -1; ox <= 1; ox++) {
          const cx = ix + ox + 0.5 + (hash2(ix + ox, iy + oy, 7) - 0.5) * 0.6, cy = iy + oy + 0.5 + (hash2(ix + ox, iy + oy, 9) - 0.5) * 0.6;
          best = Math.min(best, Math.hypot(gx - cx, gy - cy));
        }
        v = 255 * (0.88 - 0.38 * ks(0.18, 0.28, best) * (1 - ks(0.3, 0.42, best)) + 0.08 * (hash2(x, y, 3) - 0.5));
      } else if (x >= Hf) {
        // a fine grain (polyps, sponge pores)
        v = 255 * (0.86 + 0.14 * hash2(x, y, 5) - 0.12 * ks(0.6, 0.9, hash2(x >> 1, y >> 1, 6)));
      } else a = 0;
      d[k] = d[k + 1] = d[k + 2] = clamp(v, 0, 255); d[k + 3] = a;
    }
    c.putImageData(img, 0, 0);
    // the sea fan: a lattice of fine branches fanning up from a short stalk at the bottom middle of its square
    const r = krng(1820);
    c.strokeStyle = '#fff'; c.lineCap = 'round';
    const ox = 128, oy = 500, rad = 236, spokes = 26, pts = [];
    for (let i = 0; i <= spokes; i++) {
      const a0 = Math.PI * (0.08 + 0.84 * i / spokes), row = [];
      for (let k = 0; k <= 10; k++) { const t = k / 10, a = a0 + (r() - 0.5) * 0.05 * t, rr = rad * (0.06 + 0.94 * t) * (0.92 + r() * 0.08); row.push([ox - Math.cos(a) * rr, oy - Math.sin(a) * rr * 0.98]); }
      pts.push(row);
    }
    c.lineWidth = 3.2;
    for (const row of pts) { c.beginPath(); row.forEach(([x, y], k) => (k ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
    c.lineWidth = 2.4;
    for (let i = 0; i < spokes; i++) for (let k = 1; k <= 10; k++) if (r() < 0.8) {
      const a = pts[i][k], b = pts[i + 1][Math.max(1, Math.min(10, k + (r() < 0.5 ? 0 : r() < 0.5 ? -1 : 1)))];
      c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2 + (r() - 0.5) * 6, (a[1] + b[1]) / 2 + (r() - 0.5) * 6, b[0], b[1]); c.stroke();
    }
    c.lineWidth = 7; c.beginPath(); c.moveTo(ox, 511); c.lineTo(ox, oy - 14); c.stroke();
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter;
    ATLAS = t;
    return t;
  }
  // seen from above the water, things under the clear water lose their reds first, as the sea floor does (50_world's
  // ground); nothing changes once the camera is under the water (Env.underwater does that)
  function absorb(m) {
    if (m.userData.absorb) return m;
    m.userData.absorb = true;
    const prev = m.onBeforeCompile, key = m.customProgramCacheKey;
    m.onBeforeCompile = (sh, rr) => {
      prev.call(m, sh, rr);
      sh.vertexShader = 'varying vec3 vAbsW;\n' + sh.vertexShader.replace('#include <project_vertex>', `#include <project_vertex>
  { vec4 aw = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
  aw = instanceMatrix * aw;
  #endif
  vAbsW = (modelMatrix * aw).xyz; }`);
      sh.fragmentShader = 'varying vec3 vAbsW;\n' + sh.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
  vec3 camW = -vec3(dot(viewMatrix[0].xyz, viewMatrix[3].xyz), dot(viewMatrix[1].xyz, viewMatrix[3].xyz), dot(viewMatrix[2].xyz, viewMatrix[3].xyz));
  if (vAbsW.y < 0.0 && camW.y > 0.02) { vec3 vd = normalize(camW - vAbsW); diffuseColor.rgb *= exp(vAbsW.y * (1.0 + 1.0 / max(0.25, vd.y)) * vec3(0.7, 0.14, 0.08)); }`);
    };
    const k0 = key === THREE.Material.prototype.customProgramCacheKey ? 'plain' : key.call(m);
    m.customProgramCacheKey = () => 'reefabs-' + k0;
    return m;
  }
  const hardMat = () => absorb(mat('reefHard', { map: atlas() }));
  const softMat = () => absorb(mat('reefSoft', { map: atlas(), side: DS, alphaTest: 0.4, sway: 1.1, flutter: 0.012 }));
  // uv into one square of the atlas: q 0 brain, 1 cups, 2 fan, 3 grain; fn(x, y, z) -> [0..1, 0..1]
  const QO = [[0, 0.5], [0.5, 0.5], [0, 0], [0.5, 0]];
  function uvq(g, q, fn) {
    g = prep(g);
    const p = g.attributes.position.array, uv = g.attributes.uv.array, n = g.attributes.position.count, [u0, v0] = QO[q];
    for (let i = 0; i < n; i++) {
      const [a, b] = fn ? fn(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]) : [0.3 + 0.4 * hash2(i, 1, 2), 0.3 + 0.4 * hash2(i, 3, 4)];
      uv[i * 2] = u0 + 0.02 + clamp(a, 0, 1) * 0.46; uv[i * 2 + 1] = v0 + 0.02 + clamp(b, 0, 1) * 0.46;
    }
    g.attributes.uv.needsUpdate = true;
    return g;
  }
  const grain = (g) => uvq(g, 3, (x, y, z) => [((x * 3.1 + z * 1.7) % 1 + 1) % 1, ((y * 3.3 + z * 2.3) % 1 + 1) % 1]);

  /* ---- coral pieces (each returns geometries; lod collects cheap stand-ins: [x, y, z, sx, sy, sz, color]) ---- */
  // a brain coral dome
  function brain(r, x, z, rad, col, lod, y0 = 0) {
    const g = prep(new THREE.IcosahedronGeometry(1, 2)), off = r() * 50, flat = 0.55 + r() * 0.2;
    eachVertex(g, (p) => { const k = 1 + 0.08 * kf(p.x * 2 + off, p.y * 2, p.z * 2, 2); p.multiplyScalar(k); p.y = Math.max(p.y, -0.15) * flat; p.x *= rad; p.y *= rad; p.z *= rad; });
    smoothNormals(g);
    const dk = mulc(col, 0.72);
    paint(g, (px, py, pz) => mixc(col, dk, ks(0.3, 1, kf(px * 3 + off, py * 3, pz * 3, 2) + 0.5) * 0.5));
    uvq(g, 0, (px, py, pz) => [0.5 + px / (rad * 2.3), 0.5 + pz / (rad * 2.3)]);
    K.place(g, x, y0 + rad * 0.12, z, 0, r() * TAU, 0);
    lod.push([x, y0 + rad * 0.3, z, rad, rad * flat * 0.8, rad, col]);
    return g;
  }
  // a boulder coral: a lumpy mound covered in coral cups
  function boulder(r, x, z, rad, col, lod, y0 = 0) {
    const g = prep(new THREE.IcosahedronGeometry(1, 2)), off = r() * 50, sy = 0.6 + r() * 0.35;
    eachVertex(g, (p) => { const k = 1 + 0.28 * kf(p.x * 1.6 + off, p.y * 1.6, p.z * 1.6, 2); p.multiplyScalar(k); p.y = Math.max(p.y, -0.2) * sy; p.x *= rad; p.y *= rad; p.z *= rad; });
    smoothNormals(g);
    paint(g, (px, py, pz, nx, ny) => mixc(mulc(col, 0.75), col, ks(-0.3, 0.8, ny) * (0.8 + 0.2 * kf(px * 6 + off, py * 6, pz * 6, 1))));
    uvq(g, 1, (px, py, pz) => [0.5 + (px + py * 0.4) / (rad * 2.6), 0.5 + (pz - py * 0.3) / (rad * 2.6)]);
    K.place(g, x, y0 + rad * 0.15, z);
    lod.push([x, y0 + rad * 0.35, z, rad * 1.05, rad * sy, rad * 1.05, col]);
    return g;
  }
  // staghorn coral: round branches forking again and again, golden brown with pale growing tips
  function stag(r, x, z, size, col, lod, y0 = 0) {
    const gs = [], tip = mixc(col, L(0xeee2c8), 0.65);
    function br(p, d, len, rad, depth) {
      const q = p.clone().addScaledVector(d, len), m = p.clone().lerp(q, 0.5).add(new V3((r() - 0.5) * len * 0.15, 0, (r() - 0.5) * len * 0.15));
      gs.push(K.tube([p, m, q], (i, t) => rad * (1 - t * 0.25), { radial: 4, cap: depth ? null : 'end', color: (t) => (depth ? col : mixc(col, tip, ks(0.4, 1, t))) }));
      if (depth > 0) for (let k = 0; k < 2 + (r() < 0.35 ? 1 : 0); k++) {
        const nd = d.clone().add(new V3((r() - 0.5) * 1.1, (r() - 0.25) * 0.5, (r() - 0.5) * 1.1)).normalize();
        if (nd.y < 0.15) nd.y = 0.15 + r() * 0.2;
        br(q, nd.normalize(), len * (0.75 + r() * 0.2), rad * 0.85, depth - 1);
      }
    }
    const n = 3 + ((r() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, dd = r() * size * 0.3;
      br(new V3(x + Math.cos(a) * dd, y0, z + Math.sin(a) * dd), new V3(Math.cos(a) * 0.5, 1, Math.sin(a) * 0.5).normalize(), size * 0.22, 0.022 * size + 0.008, 2);
    }
    lod.push([x, y0 + size * 0.35, z, size * 0.55, size * 0.38, size * 0.55, mixc(col, tip, 0.3)]);
    return gs.map(grain);
  }
  // a flattened round tube (an elkhorn branch, a plate coral): along pts, half width w(t) to each side (side vectors sv)
  // and thickness th(t), its top colored colTop(t) and its underside colBot, the edges rounded
  function slab(pts, sv, w, th, colTop, colBot) {
    const S = soup(), n = pts.length, RR = 6, rings = [];
    for (let i = 0; i < n; i++) {
      const t = i / (n - 1), d = pts[Math.min(n - 1, i + 1)].clone().sub(pts[Math.max(0, i - 1)]).normalize(), sd = sv[i].clone().normalize();
      const up = new V3().crossVectors(sd, d).normalize(), ring = [];
      for (let k = 0; k < RR; k++) {
        const a = (k / RR) * TAU, ca = Math.cos(a), sa = Math.sin(a);
        ring.push([pts[i].clone().addScaledVector(sd, ca * w(t)).addScaledVector(up, sa * th(t) * 0.5), sa > -0.2 ? mixc(colBot, colTop(t), ks(-0.2, 0.5, sa) * (0.75 + 0.25 * Math.abs(ca))) : colBot]);
      }
      rings.push(ring);
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < RR; k++) {
      const j = (k + 1) % RR, a = rings[i][k], b = rings[i][j], c2 = rings[i + 1][j], d2 = rings[i + 1][k];
      S.quad(a[0], d2[0], c2[0], b[0], a[1], d2[1], c2[1], b[1]);
    }
    // a rounded cap on the end
    const last = rings[n - 1], tip = pts[n - 1].clone().addScaledVector(pts[n - 1].clone().sub(pts[n - 2]).normalize(), th(1) * 0.4), tc = colTop(1);
    for (let k = 0; k < RR; k++) { const j = (k + 1) % RR; S.tri(last[k][0], tip, last[j][0], last[k][1], tc, last[j][1]); }
    return S.geo(true);
  }
  // elkhorn coral: thick flattened branches spreading out and up like moose antlers, mustard brown with pale edges
  function elkhorn(r, x, z, size, col, lod, y0 = 0) {
    const gs = [], edge = mixc(col, L(0xe8d8a8), 0.55), bot = mulc(col, 0.62);
    function br(p, dir, len, wid, depth) {
      const pts = [], sv = [], side = new V3(-dir.z, 0, dir.x).normalize(), seg = 4;
      for (let i = 0; i <= seg; i++) { const t = i / seg; pts.push(p.clone().addScaledVector(dir, len * t).add(new V3(0, len * 0.12 * t * t, 0))); sv.push(side); }
      gs.push(slab(pts, sv, (t) => wid * (1 + (depth ? 0.3 : 0.7) * t), (t) => 0.075 * size * (1 - t * 0.35), (t) => mixc(col, edge, ks(0.55, 1, t) * (depth ? 0.25 : 1)), bot));
      if (depth > 0) for (const s of [-1, 1]) if (r() < 0.85) {
        const nd = dir.clone().addScaledVector(side, s * (0.5 + r() * 0.4)).add(new V3(0, 0.15 + r() * 0.25, 0)).normalize();
        br(pts[seg].clone().addScaledVector(side, s * wid * 0.6), nd, len * (0.65 + r() * 0.2), wid * 0.75, depth - 1);
      }
    }
    const n = 3 + ((r() * 2) | 0), base = new V3(x, y0 + 0.05, z);
    gs.push(K.tube([base.clone().add(new V3(0, -0.05, 0)), base.clone().add(new V3(0, 0.18 * size, 0))], 0.07 * size, { radial: 6, color: () => bot }));
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.8, dir = new V3(Math.cos(a), 0.35 + r() * 0.3, Math.sin(a)).normalize();
      br(base.clone().add(new V3(0, 0.16 * size, 0)), dir, size * (0.32 + r() * 0.12), size * 0.07, 2);
    }
    lod.push([x, y0 + size * 0.35, z, size * 0.85, size * 0.3, size * 0.85, col]);
    return gs.map(grain);
  }
  // a table coral: a short stalk under a wide flat plate, pale on top, darker underneath
  function table(r, x, z, rad, col, lod, y0 = 0) {
    const S = soup(), hgt = 0.18 + r() * 0.14, R0 = 14, top = mixc(col, L(0xe6dcc0), 0.25), edge = mixc(col, L(0xf2ead2), 0.6), bot = mulc(col, 0.55);
    const ring = (k, rr, y) => { const o = []; for (let i = 0; i < R0; i++) { const a = (i / R0) * TAU, wob = 1 + 0.07 * Math.sin(a * 3 + k) + 0.05 * Math.sin(a * 7); o.push(new V3(Math.cos(a) * rr * wob, y, Math.sin(a) * rr * wob)); } return o; };
    const rs = [ring(0, 0.0001, hgt + 0.03), ring(0, rad * 0.35, hgt + 0.045), ring(0, rad * 0.75, hgt + 0.06), ring(0, rad, hgt + 0.1)];
    const ub = [ring(0, 0.0001, hgt - 0.02), ring(0, rad * 0.4, hgt - 0.01), ring(0, rad * 0.98, hgt + 0.06)];
    const cs = [top, top, mixc(top, edge, 0.4), edge];
    for (let k = 0; k < rs.length - 1; k++) for (let i = 0; i < R0; i++) { const j = (i + 1) % R0; S.quad(rs[k][i], rs[k + 1][i], rs[k + 1][j], rs[k][j], cs[k], cs[k + 1], cs[k + 1], cs[k]); }
    for (let k = 0; k < ub.length - 1; k++) for (let i = 0; i < R0; i++) { const j = (i + 1) % R0; S.quad(ub[k][i], ub[k][j], ub[k + 1][j], ub[k + 1][i], bot, bot, bot, bot); }
    for (let i = 0; i < R0; i++) { const j = (i + 1) % R0; S.quad(rs[3][i], ub[2][i], ub[2][j], rs[3][j], edge, bot, bot, edge); }
    const g = uvq(S.geo(false), 1, (px, py, pz) => [0.5 + px / (rad * 2.2), 0.5 + pz / (rad * 2.2)]);
    const stalk = grain(K.tube([new V3(0, 0, 0), new V3(0.02, hgt * 0.6, 0), new V3(0, hgt, 0)], (i, t) => 0.07 + 0.03 * (1 - t), { radial: 6, color: () => bot }));
    const out = merge([g, stalk]);
    K.place(out, x, y0, z, (r() - 0.5) * 0.25, r() * TAU, (r() - 0.5) * 0.25);
    lod.push([x, y0 + hgt + 0.04, z, rad, 0.06, rad, top]);
    return out;
  }
  // plate corals: thin curved plates in a whorl, stacked like lettuce leaves on the wall
  function plates(r, x, z, rad, col, lod, y0 = 0) {
    const gs = [], n = 3 + ((r() * 3) | 0), edge = mixc(col, L(0xf0e4c4), 0.5), bot = mulc(col, 0.55);
    for (let i = 0; i < n; i++) {
      const a0 = r() * TAU, span = 1.4 + r() * 1.2, rr = rad * (0.6 + r() * 0.5), y = y0 + 0.08 + i * rad * 0.18, tilt = 0.15 + r() * 0.35;
      const pts = [], sv = [];
      for (let k = 0; k <= 5; k++) { const a = a0 + span * (k / 5 - 0.5); pts.push(new V3(x + Math.cos(a) * rr * 0.55, y + Math.sin(k * 1.3) * 0.02, z + Math.sin(a) * rr * 0.55)); sv.push(new V3(Math.cos(a), tilt, Math.sin(a))); }
      gs.push(slab(pts, sv, () => rr * 0.36, () => 0.04, (t) => mixc(col, edge, 0.25 + 0.3 * Math.sin(t * Math.PI)), bot));
    }
    lod.push([x, y0 + rad * 0.4, z, rad * 0.8, rad * 0.4, rad * 0.8, col]);
    return gs.map((g) => uvq(g, 1, (px, py, pz) => [((px * 2.2) % 1 + 1) % 1, ((pz * 2.2 + py) % 1 + 1) % 1]));
  }
  // pillar coral: a few fat round columns standing up, fuzzy with polyps by day
  function pillars(r, x, z, size, col, lod, y0 = 0) {
    const gs = [], n = 3 + ((r() * 4) | 0), tipC = mixc(col, L(0xeadcb8), 0.4);
    let hmax = 0;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * size * 0.22, px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, h = size * (0.45 + r() * 0.75), rad = size * (0.06 + r() * 0.03);
      hmax = Math.max(hmax, h);
      gs.push(K.tube([new V3(px, y0 - 0.05, pz), new V3(px + (r() - 0.5) * 0.04, y0 + h * 0.5, pz + (r() - 0.5) * 0.04), new V3(px, y0 + h, pz)], (k, t) => rad * (1 + 0.15 * Math.sin(t * 9 + i)), { radial: 7, cap: 'end', capColor: tipC, color: (t) => mixc(col, tipC, ks(0.6, 1, t)) }));
    }
    lod.push([x, y0 + hmax * 0.45, z, size * 0.25, hmax * 0.5, size * 0.25, col]);
    return gs.map(grain);
  }
  // a barrel sponge: a big rough vase, ribbed, dark inside
  function barrel(r, x, z, size, col, lod, y0 = 0) {
    const R0 = 18, rows = 7, S = soup(), h = size * (0.7 + r() * 0.3), inside = mulc(col, 0.3), rim = mixc(col, L(0xe8c8b0), 0.35);
    const at = (i, k) => { const t = k / rows, a = (i / R0) * TAU, rad = size * (0.32 + 0.22 * t + 0.05 * Math.sin(t * 3)) * (1 + 0.07 * Math.sin(a * 7 + t * 4)) * (1 + 0.04 * Math.sin(t * 19)); return new V3(Math.cos(a) * rad, t * h, Math.sin(a) * rad); };
    for (let k = 0; k < rows; k++) for (let i = 0; i < R0; i++) {
      const j = (i + 1) % R0, c0 = mixc(mulc(col, 0.8), col, k / rows), c1 = mixc(mulc(col, 0.8), col, (k + 1) / rows);
      S.quad(at(i, k), at(i, k + 1), at(j, k + 1), at(j, k), c0, c1, c1, c0);
      const s = 0.82, ia = at(i, k).multiply(new V3(s, 1, s)), ib = at(i, k + 1).multiply(new V3(s, 1, s)), ja = at(j, k).multiply(new V3(s, 1, s)), jb = at(j, k + 1).multiply(new V3(s, 1, s));
      ia.y = Math.max(ia.y, h * 0.3); ja.y = Math.max(ja.y, h * 0.3);
      S.quad(ia, ja, jb, ib, inside, inside, inside, inside);
    }
    for (let i = 0; i < R0; i++) { const j = (i + 1) % R0, a = at(i, rows), b = at(j, rows), a2 = a.clone().multiply(new V3(0.82, 1, 0.82)), b2 = b.clone().multiply(new V3(0.82, 1, 0.82)); S.quad(a, a2, b2, b, rim, rim, rim, rim); }
    const g = grain(S.geo(false));
    K.place(g, x, y0 - 0.04, z, (r() - 0.5) * 0.2, r() * TAU, (r() - 0.5) * 0.2);
    lod.push([x, y0 + h * 0.5, z, size * 0.5, h * 0.5, size * 0.5, col]);
    return g;
  }
  // tube sponges: a cluster of open tubes, purple or yellow
  function tubes(r, x, z, size, col, lod, y0 = 0) {
    const gs = [], n = 3 + ((r() * 3) | 0), inside = mulc(col, 0.2);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = r() * size * 0.12, h = size * (0.3 + r() * 0.5), rad = size * (0.035 + r() * 0.02), px = x + Math.cos(a) * d, pz = z + Math.sin(a) * d, lean = (r() - 0.5) * 0.2;
      const R0 = 7, S = soup();
      const at = (k, t, s) => { const b = (k / R0) * TAU; return new V3(px + Math.cos(b) * rad * s + lean * t * h, y0 + t * h, pz + Math.sin(b) * rad * s); };
      for (let k = 0; k < R0; k++) {
        const j = (k + 1) % R0;
        for (let q = 0; q < 2; q++) { const t0 = q / 2, t1 = (q + 1) / 2; S.quad(at(k, t0, 1), at(k, t1, 1.12), at(j, t1, 1.12), at(j, t0, 1), mulc(col, 0.8), col, col, mulc(col, 0.8)); }
        S.quad(at(k, 1, 1.12), at(k, 0.75, 0.85), at(j, 0.75, 0.85), at(j, 1, 1.12), col, inside, inside, col);
      }
      gs.push(grain(S.geo(false)));
    }
    lod.push([x, y0 + size * 0.3, z, size * 0.18, size * 0.32, size * 0.18, col]);
    return gs;
  }
  // a sea fan: a flat purple fan of lattice, standing across the current (soft)
  function fan(r, x, z, size, col, y0 = 0) {
    const S = soup(), w = size, h = size * 0.95, a = r() * Math.PI, cs = Math.cos(a), sn = Math.sin(a), bow = (r() - 0.5) * 0.25 * size;
    const P = (u, v) => { const lx = (u - 0.5) * w, ly = v * h; return new V3(x + lx * cs, y0 + ly, z + lx * sn).add(new V3(-sn * bow * Math.sin(u * Math.PI), 0, cs * bow * Math.sin(u * Math.PI))); };
    const UV = (u, v) => [0.02 + u * 0.46, 0.02 + v * 0.46];
    for (let i = 0; i < 4; i++) for (let k = 0; k < 3; k++) {
      const u0 = i / 4, u1 = (i + 1) / 4, v0 = k / 3, v1 = (k + 1) / 3;
      S.quad(P(u0, v0), P(u1, v0), P(u1, v1), P(u0, v1), col, col, col, col, UV(u0, v0), UV(u1, v0), UV(u1, v1), UV(u0, v1));
    }
    return K.upNormals(S.geo(false), 0.4);
  }
  // sea rods and sea plumes: soft branching rods swaying, purple brown or golden
  function rods(r, x, z, size, col, y0 = 0) {
    const gs = [], n = 4 + ((r() * 4) | 0), tip = mixc(col, L(0xe8d0c0), 0.3);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, lean = 0.15 + r() * 0.3, h = size * (0.5 + r() * 0.5), p0 = new V3(x + Math.cos(a) * 0.05, y0, z + Math.sin(a) * 0.05);
      const p1 = p0.clone().add(new V3(Math.cos(a) * lean * h * 0.4, h * 0.5, Math.sin(a) * lean * h * 0.4)), p2 = p0.clone().add(new V3(Math.cos(a) * lean * h, h, Math.sin(a) * lean * h));
      gs.push(grain(K.tube([p0, p1, p2], (k, t) => 0.012 * size + 0.006 - t * 0.004, { radial: 4, cap: 'end', color: (t) => mixc(col, tip, t) })));
      if (r() < 0.6) { const q = p1.clone().add(new V3(-Math.sin(a) * 0.1 * h, h * 0.35, Math.cos(a) * 0.1 * h)); gs.push(grain(K.tube([p1, p1.clone().lerp(q, 0.5).add(new V3(0, 0.02, 0)), q], 0.008 * size + 0.004, { radial: 3, cap: 'end', color: (t) => mixc(col, tip, t) }))); }
    }
    return gs;
  }
  // the small things filling the reef between the big corals: little brain and boulder colonies, finger corals,
  // encrusting patches, turf algae and bits of broken coral rubble, spread over about size m
  function bits(r, x0, z0, size, lod, n = 7) {
    const gs = [];
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * size * 0.5, x = x0 + Math.cos(a) * d, z = z0 + Math.sin(a) * d, k = r();
      if (k < 0.25) { const g = prep(new THREE.IcosahedronGeometry(1, 1)), rad = 0.1 + r() * 0.16, col = jit(r, pick(r, [COL.khaki, COL.olive, COL.lilac, COL.tan, COL.green]));
        eachVertex(g, (p) => { p.multiplyScalar(1 + 0.25 * kf(p.x * 2 + i, p.y * 2, p.z * 2, 1)); p.y = Math.max(p.y, -0.2) * 0.7; p.multiplyScalar(rad); p.x += x; p.z += z; p.y += rad * 0.1; });
        smoothNormals(g); paint(g, (px, py, pz, nx, ny) => mixc(mulc(col, 0.7), col, ks(-0.3, 0.8, ny)));
        gs.push(uvq(g, k < 0.12 ? 0 : 1, (px, py, pz) => [0.5 + (px - x) / (rad * 2.4), 0.5 + (pz - z) / (rad * 2.4)])); }
      else if (k < 0.45) { const col = jit(r, pick(r, [COL.tan, COL.cream, COL.ochre, COL.pink])), tip = mixc(col, L(0xf0e8d8), 0.5);
        for (let q = 0; q < 6; q++) { const b = r() * TAU, e = r() * 0.08, px = x + Math.cos(b) * e, pz = z + Math.sin(b) * e, h = 0.07 + r() * 0.12;
          gs.push(grain(K.tube([new V3(px, -0.02, pz), new V3(px + (r() - 0.5) * 0.04, h, pz + (r() - 0.5) * 0.04)], 0.022, { radial: 5, cap: 'end', capColor: tip, color: (t) => mixc(col, tip, t) }))); } }
      else if (k < 0.62) { const col = jit(r, pick(r, [COL.orange, COL.red, COL.purple, COL.yellow, COL.blue])), rad = 0.1 + r() * 0.15;
        gs.push(grain(ico(1, 1, x, 0.01, z, rad, 0.025, rad * (0.6 + r() * 0.4), col))); }
      else if (k < 0.82) { const col = jit(r, pick(r, [L(0x6a6a34), L(0x7a6a3a), L(0x5a6a3a)]));
        for (let q = 0; q < 7; q++) { const b = r() * TAU, len = 0.05 + r() * 0.07, p0 = new V3(x + Math.cos(b) * 0.03, 0, z + Math.sin(b) * 0.03), p1 = p0.clone().add(new V3(Math.cos(b) * len * 0.4, len, Math.sin(b) * len * 0.4));
          gs.push(grain(K.tube([p0, p1], 0.008, { radial: 3, cap: 'end', color: (t) => mixc(col, mulc(col, 1.4), t) }))); } }
      else { const col = mixc(jit(r, COL.cream), L(0x9a9080), r() * 0.4);
        for (let q = 0; q < 4; q++) { const b = r() * TAU, len = 0.12 + r() * 0.15, e = r() * 0.15, p0 = new V3(x + Math.cos(b) * e, 0.015, z + Math.sin(b) * e), dir = new V3(Math.cos(b + 1.3), 0.08, Math.sin(b + 1.3));
          gs.push(grain(K.tube([p0, p0.clone().addScaledVector(dir, len)], 0.014, { radial: 4, cap: 'both', color: () => col }))); } }
    }
    lod.push([x0, 0.05, z0, size * 0.4, 0.06, size * 0.4, COL.khaki]);
    return gs;
  }
  // cheap stand-ins for far away: a few lumps in each part's color
  function lodGeo(lod) {
    return grain(merge(lod.map(([x, y, z, sx, sy, sz, col]) => ico(1, sx > 0.5 ? 1 : 0, x, y, z, sx, sy, sz, col))));
  }
  // a coral prop: hard parts (and soft ones that sway), a stand-in further away than lodD
  function coralProp(hard, soft, lod, radius = 0) {
    const parts = [{ geometry: merge(hard), material: hardMat(), castShadow: false }];
    if (soft && soft.length) parts.push({ geometry: merge(soft), material: softMat(), castShadow: false });
    return { parts, radius, lod: { parts: [{ geometry: lodGeo(lod), material: hardMat(), castShadow: false }] }, lodD: 17 };
  }
  // natural reef colors (linear): tans, ochres, olive, soft purples and pinks, a few bright ones
  const COL = {
    tan: L(0xb89a6c), ochre: L(0xc09048), olive: L(0x8a8a52), khaki: L(0xa89a6a), brown: L(0x8a6a48), mustard: L(0xb8923c),
    lilac: L(0xa48cb4), pink: L(0xd098a4), cream: L(0xe0d4b0), green: L(0x7a9a5a), purple: L(0x9a5ab0), fanY: L(0xd0a848),
    red: L(0xb85a40), sponge: L(0xb8705a), yellow: L(0xe0c040), blue: L(0x7a96b8), rose: L(0xc87e90), orange: L(0xd8783a),
  };
  const pick = (r, list) => list[(r() * list.length) | 0];
  const jit = (r, col) => mulc(col, 0.88 + r() * 0.24);

  // the reef crest: elkhorn thickets, with brain and boulder corals among them
  PROPS.crestcoral = (v) => {
    const r = krng(18100 + v * 31), hard = [], lod = [];
    hard.push(...elkhorn(r, 0, 0, 1.4 + r() * 0.5, jit(r, COL.mustard), lod));
    hard.push(...elkhorn(r, 0.9, 0.5, 0.9 + r() * 0.4, jit(r, COL.ochre), lod));
    hard.push(...bits(r, 0, 0, 2.6, lod, 5));
    if (v === 0) { hard.push(brain(r, -0.8, 0.6, 0.38, jit(r, COL.khaki), lod)); hard.push(boulder(r, 0.2, -0.9, 0.42, jit(r, COL.olive), lod)); }
    else { hard.push(boulder(r, -0.7, -0.4, 0.5, jit(r, COL.khaki), lod)); hard.push(...stag(r, -0.3, 0.9, 0.7, jit(r, COL.tan), lod)); hard.push(brain(r, 0.8, -0.8, 0.3, jit(r, COL.green), lod)); }
    return coralProp(hard, null, lod, 0);
  };
  VARIANTS.crestcoral = 2;
  // the fore reef: a different mix in each variant
  PROPS.slopecoral = (v) => {
    const r = krng(18200 + v * 37), hard = [], soft = [], lod = [];
    hard.push(...bits(r, 0, 0, 2.6, lod, 5));
    if (v === 0) {
      hard.push(table(r, 0, 0, 0.75 + r() * 0.3, jit(r, COL.khaki), lod));
      hard.push(...stag(r, -1.0, 0.5, 0.8, jit(r, COL.tan), lod));
      hard.push(brain(r, 0.9, 0.6, 0.35, jit(r, COL.ochre), lod));
      soft.push(fan(r, -0.4, -1.0, 0.8, jit(r, COL.purple)));
      soft.push(...rods(r, 1.0, -0.6, 0.6, jit(r, COL.brown)));
    } else if (v === 1) {
      hard.push(boulder(r, 0, 0, 0.7, jit(r, COL.khaki), lod));
      hard.push(...pillars(r, 0.9, -0.5, 1.1, jit(r, COL.tan), lod));
      hard.push(brain(r, -0.9, 0.5, 0.42, jit(r, COL.olive), lod));
      hard.push(...tubes(r, -0.6, -0.8, 0.9, jit(r, COL.purple), lod));
      soft.push(fan(r, 0.4, 0.9, 0.7, jit(r, COL.purple)));
      soft.push(...rods(r, -1.1, -0.1, 0.7, jit(r, COL.lilac)));
    } else {
      hard.push(table(r, -0.3, 0.2, 0.9 + r() * 0.3, jit(r, COL.cream), lod));
      hard.push(boulder(r, 0.9, 0.2, 0.45, jit(r, COL.lilac), lod));
      hard.push(...stag(r, 0.4, -0.9, 0.7, jit(r, COL.ochre), lod));
      hard.push(brain(r, -1.0, -0.7, 0.3, jit(r, COL.pink), lod));
      soft.push(...rods(r, 0.9, 0.9, 0.65, jit(r, COL.fanY)));
    }
    return coralProp(hard, soft, lod, 0);
  };
  VARIANTS.slopecoral = 3;
  // the reef wall: plate corals, sea fans, sponges and soft corals
  PROPS.wallcoral = (v) => {
    const r = krng(18300 + v * 41), hard = [], soft = [], lod = [];
    hard.push(...plates(r, 0, 0, 0.65, jit(r, v ? COL.brown : COL.khaki), lod));
    hard.push(...bits(r, 0, 0, 1.6, lod, 4));
    if (v === 0) {
      hard.push(barrel(r, 0.9, 0.7, 0.7, jit(r, COL.sponge), lod));
      hard.push(...tubes(r, -0.8, 0.6, 0.8, jit(r, COL.yellow), lod));
      soft.push(fan(r, -0.5, -0.8, 1.0, jit(r, COL.purple)));
      soft.push(fan(r, 0.7, -0.6, 0.7, jit(r, COL.fanY)));
    } else {
      hard.push(boulder(r, -0.8, 0.5, 0.5, jit(r, COL.blue), lod));
      hard.push(...tubes(r, 0.8, 0.6, 0.9, jit(r, COL.purple), lod));
      soft.push(fan(r, 0.1, -0.9, 1.1, jit(r, COL.purple)));
      soft.push(...rods(r, -0.9, -0.5, 0.8, jit(r, COL.rose)));
    }
    return coralProp(hard, soft, lod, 0);
  };
  VARIANTS.wallcoral = 2;
  // a lagoon coral head: a big dome with smaller corals and a sponge on it, a fan on its side
  PROPS.bommie = (v) => {
    const r = krng(18400 + v * 43), hard = [], soft = [], lod = [];
    if (v === 0) { hard.push(brain(r, 0, 0, 1.0, jit(r, COL.ochre), lod)); hard.push(...stag(r, 1.1, 0.4, 0.8, jit(r, COL.tan), lod)); hard.push(boulder(r, -1.0, -0.5, 0.55, jit(r, COL.olive), lod)); }
    else { hard.push(boulder(r, 0, 0, 1.1, jit(r, COL.khaki), lod)); hard.push(brain(r, 0.2, 0.1, 0.4, jit(r, COL.green), lod, 0.75)); hard.push(...tubes(r, -0.9, 0.7, 0.7, jit(r, COL.purple), lod)); }
    soft.push(fan(r, 0.3, -1.1, 0.75, jit(r, COL.purple)));
    soft.push(...rods(r, -0.7, 0.9, 0.55, jit(r, COL.brown)));
    return coralProp(hard, soft, lod, 0.9);
  };
  VARIANTS.bommie = 2;
  PROPS.staghorn = (v) => { const r = krng(18500 + v * 47), lod = []; return coralProp(stag(r, 0, 0, 1.2 + v * 0.3, jit(r, v ? COL.ochre : COL.tan), lod).concat(stag(r, 0.7, 0.4, 0.9, jit(r, COL.tan), lod)), null, lod, 0); };
  VARIANTS.staghorn = 2;
  PROPS.reefbits = (v) => { const r = krng(18550 + v * 29), lod = []; return Object.assign(coralProp(bits(r, 0, 0, 1.8, lod, 8 + v * 2), null, lod, 0), { lodD: 11 }); };
  VARIANTS.reefbits = 3;
  PROPS.barrelsponge = () => { const r = krng(18600), lod = []; return coralProp([barrel(r, 0, 0, 1.0, L(0xc89078), lod), ...bits(r, 0, 0, 2, lod, 4)], null, lod, 0.4); };
  // a giant clam: two heavy ribbed shells with wavy edges, sitting hinge down in the sand, the bright blue green mantle
  // spread between them
  PROPS.giantclam = () => {
    const S = soup(), R0 = 12, len = 0.3, wid = 0.15, shell = L(0xe2d6bc), shellDk = L(0x8e8270);
    const mantle = (u, k) => mixc(mixc(L(0x1e6a8c), L(0x48b8a0), 0.5 + 0.5 * Math.sin(u * 23)), L(0x9ae0e8), k * 0.4 * (0.5 + 0.5 * Math.sin(u * 61)));
    // each valve: a bowl from the hinge line at the bottom to a wavy lip at the top
    for (const sd of [-1, 1]) for (let i = 0; i < R0; i++) {
      const u0 = i / R0, u1 = (i + 1) / R0;
      const V = (u, k) => { const x = (u - 0.5) * 2 * len, e = Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1))), wav = 0.025 * Math.sin(u * TAU * 3.5) * e; return new V3(x * (0.75 + 0.25 * k), 0.02 + k * (0.13 * e + wav), sd * (0.012 + wid * e * Math.sin(k * Math.PI * 0.62) + 0.01 * k)); };
      for (let q = 0; q < 3; q++) {
        const k0 = q / 3, k1 = (q + 1) / 3, c0 = mixc(shellDk, shell, k0 * 0.6 + 0.4 * Math.abs(Math.sin(u0 * 40))), c1 = mixc(shellDk, shell, k1 * 0.6 + 0.4 * Math.abs(Math.sin(u0 * 40)));
        if (sd > 0) S.quad(V(u0, k0), V(u1, k0), V(u1, k1), V(u0, k1), c0, c0, c1, c1); else S.quad(V(u0, k0), V(u0, k1), V(u1, k1), V(u1, k0), c0, c1, c1, c0);
      }
    }
    // the mantle, a little lower than the lips, filling the gap
    for (let i = 0; i < R0; i++) {
      const u0 = i / R0, u1 = (i + 1) / R0, M = (u, sd) => { const e = Math.sqrt(Math.max(0, 1 - (2 * u - 1) * (2 * u - 1))); return new V3((u - 0.5) * 2 * len * 0.96, 0.02 + 0.12 * e, sd * (0.012 + wid * e * 0.8)); };
      const C0 = new V3((u0 - 0.5) * 2 * len * 0.96, 0.02 + 0.11 * Math.sqrt(Math.max(0, 1 - (2 * u0 - 1) ** 2)), 0), C1 = new V3((u1 - 0.5) * 2 * len * 0.96, 0.02 + 0.11 * Math.sqrt(Math.max(0, 1 - (2 * u1 - 1) ** 2)), 0);
      S.quad(M(u0, -1), C0, C1, M(u1, -1), mantle(u0, 0), mantle(u0, 1), mantle(u1, 1), mantle(u1, 0));
      S.quad(C0, M(u0, 1), M(u1, 1), C1, mantle(u0, 1), mantle(u0, 0), mantle(u1, 0), mantle(u1, 1));
    }
    const g = grain(S.geo(false));
    return { parts: [{ geometry: g, material: absorb(mat('reefClam', { map: atlas(), side: DS, std: true, roughness: 0.45 })), castShadow: false }], radius: 0, sink: 0.02 };
  };
  // starfish: a red orange cushion star with knobs, or a slim bright blue star
  PROPS.starfish = (v) => {
    const g = prep(new THREE.IcosahedronGeometry(1, 2)), blue = v === 1;
    const arm = blue ? 0.16 : 0.12, core = blue ? 0.025 : 0.05, th = blue ? 0.022 : 0.045;
    eachVertex(g, (p) => {
      const a = Math.atan2(p.z, p.x), k = Math.pow(0.5 + 0.5 * Math.cos(5 * a), blue ? 3 : 1.6), rr = core + (arm - core) * k;
      const h = Math.hypot(p.x, p.z);
      p.set(p.x / (h || 1) * rr * Math.min(1, h * 1.3), Math.max(p.y, -0.3) * th * (1 - 0.5 * k) + th * 0.3, p.z / (h || 1) * rr * Math.min(1, h * 1.3));
    });
    smoothNormals(g);
    const c0 = blue ? L(0x2a66c8) : L(0xd2582c), c1 = blue ? L(0x4a8ae0) : L(0xe8a060);
    paint(g, (px, py, pz) => mixc(c0, c1, blue ? 0.3 + 0.3 * Math.sin(px * 90) : ks(0.6, 0.9, Math.abs(Math.sin(px * 60) * Math.sin(pz * 60)))));
    return { parts: [{ geometry: grain(g), material: hardMat(), castShadow: false }], radius: 0, sink: 0 };
  };
  VARIANTS.starfish = 2;
  // long-spined black sea urchins, a few together
  PROPS.diadema = () => {
    const r = krng(18700), gs = [];
    for (let i = 0; i < 4; i++) {
      const a = r() * TAU, d = i ? 0.15 + r() * 0.25 : 0, x = Math.cos(a) * d, z = Math.sin(a) * d, s = 0.04 + r() * 0.02;
      gs.push(ico(s, 1, x, s * 0.7, z, 1, 0.75, 1, L(0x1a1620)));
      for (let k = 0; k < 26; k++) {
        const u = r() * TAU, w = 0.15 + r() * 0.85, dir = new V3(Math.cos(u) * Math.sqrt(1 - w * w), w, Math.sin(u) * Math.sqrt(1 - w * w)), len = 0.12 + r() * 0.14;
        const cone = new THREE.ConeGeometry(0.004, len, 3, 1, true);
        cone.translate(0, len / 2, 0);
        cone.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir));
        cone.translate(x, s * 0.7, z);
        gs.push(paint(prep(cone), L(0x24202a)));
      }
    }
    return { parts: [{ geometry: grain(merge(gs)), material: hardMat(), castShadow: false }], radius: 0, sink: 0 };
  };
  // beach grass: a tuft of long thin blades, yellow green with dry tips
  PROPS.beachgrass = (v) => {
    const r = krng(18800 + v * 5), S = soup(), n = 12 + v * 6;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, len = 0.35 + r() * 0.4, lean = 0.25 + r() * 0.5, base = new V3((r() - 0.5) * 0.12, 0, (r() - 0.5) * 0.12), dir = new V3(Math.cos(a), 0, Math.sin(a));
      const side = new V3(-dir.z, 0, dir.x), c0 = L(0x6a7a3a), c1 = r() < 0.3 ? L(0xc8b878) : L(0x9aa85a);
      let p = base.clone();
      for (let k = 0; k < 3; k++) {
        const t0 = k / 3, t1 = (k + 1) / 3, w0 = 0.008 * (1 - t0) + 0.001, w1 = 0.008 * (1 - t1) + 0.001;
        const q = base.clone().addScaledVector(dir, lean * len * t1 * t1).add(new V3(0, len * t1, 0));
        S.quad(p.clone().addScaledVector(side, -w0), p.clone().addScaledVector(side, w0), q.clone().addScaledVector(side, w1), q.clone().addScaledVector(side, -w1), mixc(c0, c1, t0), mixc(c0, c1, t0), mixc(c0, c1, t1), mixc(c0, c1, t1));
        p = q;
      }
    }
    return { parts: [{ geometry: K.upNormals(S.geo(false), 0.6), material: mat('beachgrass', { side: DS, sway: 1.6, flutter: 0.01 }), castShadow: false }], radius: 0 };
  };
  VARIANTS.beachgrass = 2;
  // a coconut palm leaning out over the water: a ringed gray trunk curving along +x, a crown of drooping fronds and a
  // bunch of green and brown coconuts under it
  PROPS.reefpalm = (v) => {
    const r = krng(18900 + v * 19), h = 7.6 + v * 1.1, lean = 2.6 + v * 0.9 + r() * 0.6, pts = [];
    for (let i = 0; i <= 12; i++) { const t = i / 12; pts.push(new V3(lean * Math.pow(t, 1.6), h * t - 0.6 * h * t * t * t * (lean / 12), Math.sin(t * 2.2) * 0.25 * v)); }
    const trunk = K.tube(pts, (i, t) => lerp(0.21, 0.13, t) * (1 + 0.45 * Math.pow(1 - ks(0, 0.1, t), 2)), {
      radial: 8, vLen: 0.25, uRep: 1,
      color: (t, a, p) => mixc(L(0x8a7c68), L(0xa89a82), kf(p.x * 3, p.y * 0.8, p.z * 3, 2) * 0.5 + 0.5),
    });
    const top = pts[pts.length - 1], extra = [];
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, green = r() < 0.6, c0 = green ? L(0x6a8a2a) : L(0x6a4a24), c1 = green ? L(0x9aa83a) : L(0x8a6a38);
      const g = paint(new THREE.IcosahedronGeometry(0.13, 1), (x, y) => mixc(c0, c1, y * 3 + 0.5)); g.scale(1, 1.12, 1);
      extra.push(K.place(g, top.x + Math.cos(a) * 0.2, top.y - 0.28 - r() * 0.12, top.z + Math.sin(a) * 0.2));
    }
    extra.push(paint(K.place(new THREE.IcosahedronGeometry(0.25, 1), top.x, top.y - 0.06, top.z, 0, 0, 0, new V3(1, 0.8, 1)), L(0x6e6a3a)));
    const S = soup(), n = 11 + v;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU + r() * 0.3, tilt = i % 3 === 0 ? 0.25 : -0.05;
      K.frond(S, top.clone().add(new V3(0, 0.05, 0)), new V3(Math.cos(a), tilt, Math.sin(a)), 3.4 + r() * 0.9, r, C.palmMid, C.palmLight);
    }
    const leaves = K.upNormals(S.geo(false), 0.6);
    return {
      parts: [
        { geometry: merge([trunk, ...extra]), material: mat('palmBark', { map: K.TX.palm() }), castShadow: true },
        { geometry: leaves, material: mat('frond', { side: DS, sway: 0.01, flutter: 0.03 }), castShadow: true },
      ],
      radius: 0.25,
      ...K.climbInfo(pts, top.y - 0.45, 0.16),
    };
  };
  VARIANTS.reefpalm = 3;

  /* ============================================================
     The reef's living things
     ============================================================ */
  // the fish, by atlas cell: [name, body center x, y, half length, half height (fish units: the fish is 1 long, its
  // card 0.5 high), thickness, length m, cruise m/s, depth band above the bottom m]
  const FISH = [
    ['clownfish', 0.027, 0, 0.305, 0.13, 0.13, 0.11, 0.25, [0.12, 0.45]],
    ['bluetang', 0.03, 0.0, 0.33, 0.16, 0.08, 0.26, 0.45, [0.4, 2.8]],
    ['yellowtang', 0.05, 0.0, 0.26, 0.16, 0.07, 0.19, 0.4, [0.3, 2.2]],
    ['parrotfish', 0.0, -0.008, 0.375, 0.135, 0.12, 0.5, 0.45, [0.2, 1.8]],
    ['sergeant', 0.027, 0, 0.32, 0.145, 0.08, 0.17, 0.35, [1.0, 4.5]],
    ['angelfish', 0.008, 0, 0.275, 0.165, 0.07, 0.38, 0.35, [0.4, 2.5]],
    ['butterfly', 0.04, 0.0, 0.265, 0.165, 0.06, 0.19, 0.3, [0.3, 1.8]],
    ['idol', 0.05, -0.02, 0.22, 0.165, 0.06, 0.22, 0.35, [0.4, 2.6]],
  ];
  const SP = {}; FISH.forEach((f, i) => { SP[f[0]] = i; });
  // the fish atlas: 512 x 512, two cells across and four down, each 256 x 128 with the fish's head to the right
  let FATLAS = null;
  function fishAtlas() {
    if (FATLAS) return FATLAS;
    const cv = document.createElement('canvas'); cv.width = cv.height = 512;
    const c = cv.getContext('2d');
    const body = (cx, cy, rx, ry, snout, tw, back = 1) => { c.beginPath(); c.moveTo(cx - rx, cy - tw); c.bezierCurveTo(cx - rx * 0.35, cy - ry * 1.08 * back, cx + rx * 0.55, cy - ry * 1.02 * back, cx + rx + snout, cy + ry * 0.08); c.bezierCurveTo(cx + rx * 0.55, cy + ry * 1.02, cx - rx * 0.35, cy + ry * 1.08, cx - rx, cy + tw); c.closePath(); };
    const shape = (pts, fill, stroke, lw = 2) => { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) { const p = pts[i]; if (p.length === 4) c.quadraticCurveTo(p[0], p[1], p[2], p[3]); else c.lineTo(p[0], p[1]); } c.closePath(); c.fillStyle = fill; c.fill(); if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw; c.stroke(); } };
    const grad = (y0, y1, a, b, m) => { const g = c.createLinearGradient(0, y0, 0, y1); g.addColorStop(0, a); if (m) g.addColorStop(0.5, m); g.addColorStop(1, b); return g; };
    const eye = (x, y, r, ring = '#f0d890') => { c.fillStyle = ring; c.beginPath(); c.arc(x, y, r + 1.6, 0, TAU); c.fill(); c.fillStyle = '#0c0c10'; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.8)'; c.beginPath(); c.arc(x + r * 0.35, y - r * 0.35, r * 0.3, 0, TAU); c.fill(); };
    const clipBody = (f) => { c.save(); c.clip(); f(); c.restore(); };
    const cell = (i, f) => { c.save(); c.translate((i % 2) * 256, (i >> 1) * 128); f(); c.restore(); };
    // 0 clownfish: orange with three white bands edged in black, rounded black-edged fins
    cell(0, () => {
      shape([[95, 34], [118, 14, 140, 22], [160, 12, 182, 30], [150, 40]], '#f07020', '#1a1010', 3);
      shape([[96, 92], [112, 116, 136, 96], [120, 92]], '#f07020', '#1a1010', 3);
      shape([[62, 58], [30, 22, 18, 64], [30, 106, 62, 70]], '#f27a24', '#1a1010', 3);
      body(140, 64, 80, 33, 10, 13); c.fillStyle = grad(30, 98, '#e85e14', '#f8a040', '#f27420'); c.fill();
      clipBody(() => { for (const [x, w, cv2] of [[184, 15, 10], [130, 17, 14], [70, 10, 4]]) { c.fillStyle = '#121010'; c.beginPath(); c.ellipse(x, 64, w / 2 + 3, 50, 0, 0, TAU); c.fill(); c.fillStyle = '#fbfbf6'; c.beginPath(); c.moveTo(x - w / 2, 10); c.quadraticCurveTo(x - w / 2 + cv2, 64, x - w / 2, 118); c.lineTo(x + w / 2, 118); c.quadraticCurveTo(x + w / 2 + cv2, 64, x + w / 2, 10); c.fill(); } });
      eye(200, 58, 5.5, '#f0a040');
    });
    // 1 blue tang: royal blue with the black palette mark, a yellow tail
    cell(1, () => {
      shape([[80, 30], [130, 14, 190, 28], [150, 40]], '#2040b8', '#101020', 3);
      shape([[85, 98], [125, 116, 160, 96], [130, 92]], '#2040b8', '#101020', 3);
      shape([[56, 58], [20, 26], [34, 64], [20, 102], [56, 72]], '#f2cc22', '#151515', 3);
      body(135, 64, 84, 40, 8, 11); c.fillStyle = grad(24, 104, '#1a38b8', '#3a6ae0', '#2a50d0'); c.fill();
      clipBody(() => {
        c.fillStyle = '#0c0c18'; c.beginPath(); c.moveTo(200, 40); c.bezierCurveTo(160, 20, 100, 30, 60, 58); c.lineTo(60, 70); c.bezierCurveTo(100, 50, 150, 52, 186, 62); c.bezierCurveTo(150, 80, 110, 74, 92, 66); c.bezierCurveTo(120, 96, 175, 86, 206, 58); c.closePath(); c.fill();
        c.fillStyle = '#2a58d8'; c.beginPath(); c.ellipse(130, 64, 22, 7, -0.1, 0, TAU); c.fill();
      });
      shape([[170, 70], [150, 90], [160, 72]], '#f2cc22');
      eye(200, 56, 5);
    });
    // 2 yellow tang: a bright yellow disc with a pointed snout, a white spine by the tail
    cell(2, () => {
      shape([[78, 44], [100, 0, 165, 10], [190, 30], [150, 40]], '#f6d018', '#d8a810', 2);
      shape([[78, 84], [100, 128, 160, 114], [182, 92], [150, 90]], '#f6d018', '#d8a810', 2);
      shape([[66, 56], [36, 34], [42, 64], [36, 94], [66, 72]], '#f4cc14', '#d8a810', 2);
      body(140, 64, 68, 42, 20, 10); c.fillStyle = grad(20, 108, '#f2c810', '#fbe050', '#f4d020'); c.fill();
      c.fillStyle = '#ffffff'; c.beginPath(); c.ellipse(78, 66, 6, 2.5, 0, 0, TAU); c.fill();
      eye(196, 52, 5, '#f8e070');
    });
    // 3 parrotfish: blue green with pink scale edges and a lunate tail, a white beak
    cell(3, () => {
      shape([[64, 32], [120, 22, 196, 34], [150, 40]], '#40b0a0', '#e07a8a', 3);
      shape([[72, 96], [110, 108, 150, 96], [120, 92]], '#40b0a0', '#e07a8a', 3);
      shape([[40, 54], [6, 18], [24, 64], [6, 110], [40, 74]], '#3aa890', '#e88a9a', 4);
      body(128, 64, 96, 34, 6, 12, 1.1); c.fillStyle = grad(28, 100, '#1e8c80', '#6ad0b0', '#3ab09a'); c.fill();
      clipBody(() => {
        c.strokeStyle = 'rgba(232,130,140,0.75)'; c.lineWidth = 1.6;
        for (let x = 40; x < 220; x += 11) for (let y = 26; y < 104; y += 9) { c.beginPath(); c.arc(x + ((y / 9) % 2) * 5, y, 5, -1.2, 1.2); c.stroke(); }
        c.fillStyle = '#f2a0a8'; c.beginPath(); c.ellipse(212, 72, 14, 4, 0.3, 0, TAU); c.fill(); c.beginPath(); c.ellipse(205, 50, 12, 3, -0.4, 0, TAU); c.fill();
      });
      c.fillStyle = '#e8f6f0'; c.beginPath(); c.ellipse(228, 70, 7, 6, 0, 0, TAU); c.fill();
      eye(205, 58, 5, '#f0c060');
    });
    // 4 sergeant major: silvery with a yellow back and five black bars, a forked tail
    cell(4, () => {
      shape([[85, 30], [130, 12, 186, 30], [150, 40]], '#c8c8a0', '#606060', 2);
      shape([[88, 98], [120, 114, 150, 96], [130, 92]], '#c8ccc8', '#606060', 2);
      shape([[56, 60], [16, 24], [38, 64], [16, 104], [56, 70]], '#d0d4d0', '#606060', 2);
      body(140, 64, 82, 37, 8, 11); c.fillStyle = grad(26, 102, '#e8d860', '#e8eef0', '#d0dce4'); c.fill();
      clipBody(() => { c.fillStyle = 'rgba(20,24,28,0.92)'; for (const x of [178, 154, 128, 102, 76]) { c.beginPath(); c.moveTo(x - 5, 20); c.lineTo(x + 5, 20); c.lineTo(x + 3, 108); c.lineTo(x - 3, 108); c.fill(); } });
      eye(200, 58, 5.2, '#d8d0a0');
    });
    // 5 queen angelfish: blue green with gold scale edges, long trailing fins edged bright blue, a yellow tail, the crown
    cell(5, () => {
      shape([[96, 34], [130, 2, 180, 24], [140, 36], [100, 30, 30, 6]], '#2a78b8', '#3aa0ff', 3);
      shape([[96, 94], [130, 126, 170, 102], [130, 92], [100, 98, 30, 122]], '#2a78b8', '#3aa0ff', 3);
      shape([[64, 56], [34, 30], [28, 64], [34, 98], [64, 72]], '#f8d020', null);
      body(132, 64, 70, 44, 10, 12); c.fillStyle = grad(20, 108, '#2a80a8', '#2a90b8', '#d8c050'); c.fill();
      clipBody(() => {
        c.fillStyle = 'rgba(240,200,60,0.55)';
        for (let x = 70; x < 200; x += 9) for (let y = 22; y < 108; y += 8) { c.beginPath(); c.arc(x + ((y / 8) % 2) * 4, y, 2.4, 0, TAU); c.fill(); }
        c.fillStyle = '#1a3a90'; c.beginPath(); c.arc(176, 34, 8, 0, TAU); c.fill(); c.strokeStyle = '#4ab0ff'; c.lineWidth = 2.5; c.stroke();
      });
      shape([[176, 70], [150, 88], [166, 66]], '#f8d020');
      eye(192, 58, 5, '#3aa0ff');
    });
    // 6 butterflyfish (threadfin): white with dark chevron lines, yellow at the back, a black band through the eye
    cell(6, () => {
      shape([[84, 40], [110, 8, 170, 16], [188, 34], [150, 40]], '#f2cc30', '#202020', 1.5);
      shape([[84, 86], [110, 122, 160, 112], [180, 94], [150, 90]], '#f2cc30', '#202020', 1.5);
      c.strokeStyle = '#f2e8d0'; c.lineWidth = 2; c.beginPath(); c.moveTo(92, 26); c.quadraticCurveTo(70, 10, 46, 22); c.stroke();
      shape([[70, 58], [42, 38], [46, 64], [42, 92], [70, 72]], '#f2cc30', null);
      body(138, 64, 68, 42, 18, 10); c.fillStyle = grad(20, 108, '#fafaf2', '#f0f0e8', '#ffffff'); c.fill();
      clipBody(() => {
        c.fillStyle = 'rgba(242,200,40,0.95)'; c.fillRect(60, 0, 44, 128);
        c.strokeStyle = 'rgba(60,60,64,0.85)'; c.lineWidth = 1.6;
        for (let k = -6; k < 10; k++) { c.beginPath(); c.moveTo(110 + k * 10, 20); c.lineTo(150 + k * 10, 64); c.lineTo(110 + k * 10, 108); c.stroke(); }
        c.fillStyle = '#141414'; c.fillRect(186, 0, 11, 128);
      });
      c.fillStyle = '#141414'; c.beginPath(); c.arc(92, 30, 4.5, 0, TAU); c.fill();
      eye(192, 52, 4.5, '#141414');
    });
    // 7 Moorish idol: bold black and white bands with yellow, a tall dorsal fin ending in a long white streamer, a long
    // snout with an orange saddle
    cell(7, () => {
      shape([[118, 40], [130, 14, 120, 6], [80, 2], [30, 4], [60, 6, 108, 14], [160, 26], [150, 40]], '#141414', null);
      c.strokeStyle = '#f4f0e8'; c.lineWidth = 3; c.beginPath(); c.moveTo(126, 12); c.quadraticCurveTo(80, 0, 22, 6); c.stroke();
      shape([[100, 92], [118, 124, 150, 104], [130, 90]], '#141414', null);
      shape([[84, 58], [56, 42], [50, 64], [56, 86], [84, 70]], '#141414', null);
      body(140, 66, 56, 42, 28, 10); c.fillStyle = grad(24, 108, '#f2f0e0', '#f6f2e8', '#f0e8c0'); c.fill();
      clipBody(() => {
        c.fillStyle = '#121212'; c.fillRect(156, 0, 20, 128); c.fillRect(100, 0, 26, 128);
        c.fillStyle = 'rgba(246,212,70,0.95)'; c.fillRect(84, 0, 16, 128); c.fillRect(126, 70, 30, 60);
        c.fillStyle = '#e88a30'; c.beginPath(); c.ellipse(204, 60, 10, 7, 0, 0, TAU); c.fill();
      });
      eye(170, 52, 4.5, '#f0f0f0');
    });
    const t = new THREE.CanvasTexture(cv);
    t.anisotropy = 4; t.minFilter = THREE.LinearMipmapLinearFilter;
    FATLAS = t;
    return t;
  }
  // the fish's shape: a card 1 long and 0.5 high (x forward, y up), a side at z = +1 and one at z = -1; the vertex
  // shader puffs the body out (an ellipse of thickness), flattens the fins and swings the tail
  function fishGeo() {
    const NX = 11, NY = 6, pos = [], idx = [];
    for (const side of [1, -1]) {
      const o = pos.length / 3;
      for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) pos.push(-0.5 + i / (NX - 1), -0.25 + 0.5 * j / (NY - 1), side);
      for (let j = 0; j < NY - 1; j++) for (let i = 0; i < NX - 1; i++) {
        const a = o + j * NX + i, b = a + 1, c2 = a + NX, d = c2 + 1;
        if (side > 0) idx.push(a, b, d, a, d, c2); else idx.push(a, d, b, a, c2, d);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(pos.map((v, i) => (i % 3 === 2 ? v : 0)), 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array((pos.length / 3) * 2), 2));
    g.setIndex(idx);
    return g;
  }
  function fishMaterial() {
    const m = new THREE.MeshLambertMaterial({ map: fishAtlas(), alphaTest: 0.5 });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.uBody = { value: FISH.map((f) => new THREE.Vector4(f[1], f[2], f[3], f[4])) };
      sh.uniforms.uThick = { value: FISH.map((f) => f[5]) };
      sh.vertexShader = `attribute vec4 aFish;\nuniform vec4 uBody[${FISH.length}];\nuniform float uThick[${FISH.length}];\n` + sh.vertexShader
        .replace('#include <uv_vertex>', `#include <uv_vertex>
  {
    float cf = aFish.x;
    vec2 org = vec2(mod(cf, 2.0) * 0.5, 0.75 - floor(cf / 2.0 + 0.01) * 0.25);
    vUv = org + vec2(position.x + 0.5, position.y * 2.0 + 0.5) * vec2(0.5, 0.25);
  }`)
        .replace('#include <beginnormal_vertex>', `
  int ci = int(aFish.x + 0.5);
  vec4 bd = uBody[ci];
  float th = uThick[ci], sd = position.z;
  vec2 fe = (position.xy - bd.xy) / bd.zw;
  float sq = sqrt(max(0.0, 1.0 - dot(fe, fe)));
  float sqc = max(sq, 0.18);
  // the swimming wave: little at the head, most at the tail; and the body curving round a turn
  float fx = position.x, wk = smoothstep(0.3, -0.5, fx);
  float wv = sin(fx * 7.0 - aFish.y) * aFish.z * wk * wk + aFish.w * (fx - 0.1) * (fx - 0.1);
  float dwv = cos(fx * 7.0 - aFish.y) * 7.0 * aFish.z * wk * wk + aFish.w * 2.0 * (fx - 0.1);
  vec3 objectNormal = sq > 0.0 ? normalize(vec3(th * fe.x / (bd.z * sqc) * sd, th * fe.y / (bd.w * sqc) * sd * 0.8 + 0.15, sd)) : normalize(vec3(0.0, 0.25, sd));
  objectNormal.x -= objectNormal.z * dwv * 0.5;
  objectNormal = normalize(objectNormal);`)
        .replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position.x, position.y, sd * (th * sq + 0.002) + wv);`);
    };
    m.customProgramCacheKey = () => 'reef-fish';
    return absorb(m);
  }
  // a green sea turtle (about a meter long): domed olive brown shell with a pattern of plates, a pale belly, a blunt
  // head, long front flippers and short back ones (fl: which flipper, front 1 / back 2, times the side; and how far out)
  function turtleGeo() {
    const gs = [];
    const shell = prep(new THREE.IcosahedronGeometry(1, 2));
    eachVertex(shell, (p) => { const taper = p.x < 0 ? 1 + p.x * 0.28 : 1; p.set(p.x * 0.52, Math.max(p.y, -0.12) * 0.2 + 0.02, p.z * 0.42 * taper); });
    smoothNormals(shell);
    paint(shell, (x, y, z) => { const a = Math.atan2(z, x), r = Math.hypot(x / 0.52, z / 0.42), plate = Math.abs(Math.sin(a * 4.5)) * ks(0.3, 0.4, r) + ks(0.82, 0.9, r) * Math.abs(Math.sin(a * 12)); return mixc(mixc(L(0x6a5634), L(0x9a7a44), 0.5 + 0.5 * kf(x * 9, y * 9, z * 9, 2)), L(0x3e3220), clamp(ks(0.85, 1, plate), 0, 1) * 0.7); });
    gs.push(shell);
    const belly = ico(1, 1, 0, -0.005, 0, 0.47, 0.06, 0.37, L(0xd8cc98)); gs.push(belly);
    const head = ico(1, 1, 0.58, 0.03, 0, 0.13, 0.085, 0.095, L(0x7a7048)); gs.push(head);
    gs.push(ico(0.018, 0, 0.64, 0.06, 0.07, 1, 1, 1, L(0x101010)), ico(0.018, 0, 0.64, 0.06, -0.07, 1, 1, 1, L(0x101010)));
    gs.push(ico(1, 0, 0.46, 0.02, 0, 0.1, 0.07, 0.08, L(0x6a6040)));
    const flips = [];
    for (const s of [1, -1]) {
      for (const [fx, len, wid, back, id] of [[0.28, 0.5, 0.11, 0.35, 1], [-0.36, 0.2, 0.08, 0.6, 2]]) {
        const g = prep(new THREE.IcosahedronGeometry(1, 1));
        eachVertex(g, (p) => { const t = (p.z + 1) / 2; p.set(p.x * wid * (1 - t * 0.55) - t * len * back, p.y * 0.025, t * len); });
        smoothNormals(g);
        paint(g, (x, y, z) => mixc(L(0x6a6440), L(0xb8a870), 0.5 + 0.5 * Math.sin(x * 60 + z * 50)));
        eachVertex(g, (p) => { p.z = s * (p.z + 0.16 + (id === 1 ? 0.12 : 0.08)); p.x += fx; });
        if (s < 0) { const ix = g.attributes.position.array; for (let i = 0; i < ix.length; i += 9) for (let k = 0; k < 3; k++) { const t = ix[i + 3 + k]; ix[i + 3 + k] = ix[i + 6 + k]; ix[i + 6 + k] = t; } g.computeVertexNormals(); }
        const n = g.attributes.position.count, fl = new Float32Array(n * 2), P = g.attributes.position.array;
        for (let i = 0; i < n; i++) { fl[i * 2] = id * s; fl[i * 2 + 1] = clamp((Math.abs(P[i * 3 + 2]) - (id === 1 ? 0.26 : 0.2)) / len, 0, 1); }
        g.setAttribute('fl', new THREE.BufferAttribute(fl, 2));
        flips.push(g);
      }
    }
    for (const g of gs) g.setAttribute('fl', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    const all = gs.concat(flips), n = all.reduce((a, g) => a + g.attributes.position.count, 0), out = new THREE.BufferGeometry();
    for (const [k, sz] of [['position', 3], ['normal', 3], ['color', 3], ['fl', 2]]) {
      const arr = new Float32Array(n * sz); let o = 0;
      for (const g of all) { arr.set(g.attributes[k].array.subarray(0, g.attributes.position.count * sz), o); o += g.attributes.position.count * sz; }
      out.setAttribute(k, new THREE.BufferAttribute(arr, sz));
    }
    return out;
  }
  function turtleMaterial() {
    const m = new THREE.MeshLambertMaterial({ vertexColors: true });
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = 'attribute vec2 fl;\nattribute vec2 aTurt;\n' + sh.vertexShader.replace('#include <begin_vertex>', `
  vec3 transformed = vec3(position);
  {
    float id = abs(fl.x), sd = sign(fl.x), w = fl.y;
    // front flippers sweep down and back like wings; the back ones paddle a little
    float ang = id > 1.5 ? sin(aTurt.x * 0.5 + 1.0) * 0.25 * aTurt.y : id > 0.5 ? sin(aTurt.x) * 0.7 * aTurt.y : 0.0;
    float z0 = sd * (id > 1.5 ? 0.24 : 0.26), dz = transformed.z - z0;
    if (id > 0.5) { transformed.y += sd * dz * sin(ang) * 1.0; transformed.z = z0 + dz * cos(ang); transformed.x -= w * w * 0.06 * (1.0 - cos(aTurt.x)) * aTurt.y; }
  }`);
    };
    m.customProgramCacheKey = () => 'reef-turtle';
    return absorb(m);
  }
  // a magnificent sea anemone: a red column, a pale oral disc and a carpet of fat cream tentacles with pale tips
  function anemoneGeo() {
    const r = krng(18950), gs = [];
    gs.push(paint(prep(new THREE.CylinderGeometry(0.24, 0.27, 0.09, 12, 1, true).translate(0, 0.045, 0)), L(0x9a2a40)));
    gs.push(paint(prep(new THREE.CylinderGeometry(0.24, 0.24, 0.01, 12).translate(0, 0.09, 0)), L(0xb8a080)));
    const base = L(0xb89a6a), tipC = L(0xe8dcc0), pinky = L(0xd89aa0);
    for (let i = 0; i < 150; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.26, x = Math.cos(a) * d, z = Math.sin(a) * d, len = 0.07 + r() * 0.05, out = 0.5 + d * 4;
      const dir = new V3(Math.cos(a) * out + (r() - 0.5) * 0.5, 1, Math.sin(a) * out + (r() - 0.5) * 0.5).normalize(), p0 = new V3(x, 0.085, z);
      const p1 = p0.clone().addScaledVector(dir, len * 0.5), p2 = p1.clone().addScaledVector(dir, len * 0.3).add(new V3(Math.cos(a) * len * 0.3, -len * 0.12, Math.sin(a) * len * 0.3));
      const tc = r() < 0.4 ? pinky : tipC;
      gs.push(K.tube([p0, p1, p2], (k, t) => 0.009 * (1 - t * 0.2), { radial: 4, cap: 'end', capColor: tc, color: (t) => mixc(base, tc, ks(0.4, 1, t)) }));
    }
    const g = merge(gs);
    return g;
  }

  // what lives where (zones from the world's zone(x, z): 1 lagoon sand, 2 seagrass, 3 back reef and crest, 4 the fore
  // reef's spurs, 5 the wall, 6 deep sand, 7 a patch reef): how many groups a 20 m cell may hold, and who they are
  const RICH = [0, 0.45, 0.25, 0.9, 1, 0.8, 0.12, 0.95];
  const WHO = {
    1: [['sergeant', 3], ['yellowtang', 2], ['bluetang', 1], ['butterfly', 1], ['parrotfish', 1]],
    2: [['parrotfish', 2], ['sergeant', 1], ['yellowtang', 1]],
    3: [['sergeant', 3], ['parrotfish', 2], ['bluetang', 2], ['yellowtang', 2], ['butterfly', 1]],
    4: [['bluetang', 2], ['yellowtang', 2], ['parrotfish', 2], ['angelfish', 1], ['butterfly', 2], ['idol', 2], ['sergeant', 2]],
    5: [['angelfish', 2], ['butterfly', 2], ['idol', 2], ['bluetang', 2], ['parrotfish', 1]],
    6: [['parrotfish', 1], ['angelfish', 1]],
    7: [['bluetang', 2], ['yellowtang', 2], ['angelfish', 1], ['butterfly', 2], ['idol', 1], ['sergeant', 2], ['parrotfish', 1]],
  };
  // a group's size, and how close the followers keep to the leader
  const GROUP = { sergeant: [7, 14, 1.3], bluetang: [2, 5, 1.6], yellowtang: [3, 6, 1.4], parrotfish: [1, 3, 2.5], angelfish: [1, 2, 0.9], butterfly: [2, 2, 0.6], idol: [1, 3, 1.2], clownfish: [2, 3, 0.2] };
  const CELL = 20, NEAR = 52, CAP = 420, TCAP = 12, ACAP = 40;

  Env.reef = {
    FISH, cells: CELL,
    // the reef's life in world w: zone(x, z) says where on the reef a spot is. Returns the per-frame update (w.life).
    life(w, zone) {
      const H = w.H;
      const geo = fishGeo(), fim = new THREE.InstancedMesh(geo, fishMaterial(), CAP);
      const aFish = new THREE.InstancedBufferAttribute(new Float32Array(CAP * 4), 4); aFish.setUsage(THREE.DynamicDrawUsage);
      geo.setAttribute('aFish', aFish);
      fim.instanceMatrix.setUsage(THREE.DynamicDrawUsage); fim.frustumCulled = false; fim.count = 0; fim.name = 'reefFish';
      const tg = turtleGeo(), tim = new THREE.InstancedMesh(tg, turtleMaterial(), TCAP);
      const aTurt = new THREE.InstancedBufferAttribute(new Float32Array(TCAP * 2), 2); aTurt.setUsage(THREE.DynamicDrawUsage);
      tg.setAttribute('aTurt', aTurt);
      tim.frustumCulled = false; tim.count = 0; tim.name = 'reefTurtles'; tim.castShadow = true;
      const ag = anemoneGeo(), aim = new THREE.InstancedMesh(ag, absorb(mat('reefAnemone', { std: true, roughness: 0.55, sway: 4, flutter: 0.06 })), ACAP);
      aim.frustumCulled = false; aim.count = 0; aim.name = 'reefAnemones';
      w.out.add(fim, tim, aim);
      w.disposables.push(geo, tg, ag, fim, tim, aim, fim.material, tim.material);   // (the atlases and the anemones' material are shared)
      const cells = new Map();
      const floorAt = (x, z) => H(x, z);
      // a spot for a fish of kind s near (x, z) at (y): within its band over the bottom, never at the surface
      const bandY = (s, x, z, r) => { const f = floorAt(x, z), [b0, b1] = FISH[s][8]; return Math.min(WATER - 0.35, f + b0 + (b1 - b0) * r); };
      function newFish(s, x, z, r, home, lead, off) {
        const y = bandY(s, x, z, r());
        return { s, x, y, z, vx: 0, vy: 0, vz: 0, yaw: r() * TAU, pitch: 0, sp: 0, ph: r() * TAU, home, lead, off, tx: x, ty: y, tz: z, t: r() * 3, flee: 0, nib: 0, bend: 0, L: FISH[s][6] * (0.85 + r() * 0.3) * 1.15, anem: null };
      }
      function populate(ci, cj) {
        const r = rng(hash2(ci, cj, 1801) * 4294967296), cell = { fish: [], turt: [], anem: [] };
        const x0 = ci * CELL, z0 = cj * CELL;
        for (let k = 0; k < 3; k++) {
          const x = x0 + r() * CELL, z = z0 + r() * CELL, zn = zone(x, z), go = r();
          if (!zn || go > RICH[zn]) continue;
          const list = WHO[zn]; let sum = 0; for (const q of list) sum += q[1];
          let pk = r() * sum, name = list[0][0]; for (const q of list) { pk -= q[1]; if (pk <= 0) { name = q[0]; break; } }
          const s = SP[name], [g0, g1, sp] = GROUP[name], n = g0 + Math.floor(r() * (g1 - g0 + 1));
          const home = { x, z, r: name === 'sergeant' ? 5 : name === 'parrotfish' ? 9 : 6 };
          let lead = null;
          for (let i = 0; i < n; i++) {
            const off = [(r() - 0.5) * sp * 2, (r() - 0.5) * sp * 0.8, (r() - 0.5) * sp * 2];
            const f = newFish(s, x + off[0], z + off[2], r, home, lead, off);
            if (!lead) lead = f;
            cell.fish.push(f);
          }
        }
        // a sea anemone with its clownfish on the reef (and now and then in the lagoon)
        {
          const x = x0 + 3 + r() * (CELL - 6), z = z0 + 3 + r() * (CELL - 6), zn = zone(x, z), h = floorAt(x, z), q = r();
          if ((zn === 3 || zn === 4 || zn === 7 ? q < 0.7 : zn === 1 || zn === 5 ? q < 0.2 : false) && h < -1.2 && h > -12) {
            const a = { x, y: h - 0.02, z, s: 0.8 + r() * 0.6, rot: r() * TAU };
            cell.anem.push(a);
            const home = { x, z, r: 0.3 }, n = 2 + (r() < 0.5 ? 1 : 0);
            let lead = null;
            for (let i = 0; i < n; i++) { const f = newFish(SP.clownfish, x + (r() - 0.5) * 0.3, z + (r() - 0.5) * 0.3, r, home, null, null); f.anem = a; f.L *= i ? 0.75 : 1; cell.fish.push(f); lead = f; }
          }
        }
        // a green sea turtle grazing the seagrass or gliding over the reef
        {
          const x = x0 + r() * CELL, z = z0 + r() * CELL, zn = zone(x, z), q = r();
          if (zn === 2 ? q < 0.22 : zn >= 3 && zn !== 6 ? q < 0.06 : false) {
            const h = floorAt(x, z);
            cell.turt.push({ x, y: Math.min(WATER - 0.6, h + 1), z, home: { x, z }, yaw: r() * TAU, pitch: 0, sp: 0.3, ph: r() * TAU, tx: x, ty: h + 1, tz: z, t: 0, breath: 20 + r() * 50, st: 'cruise', s: 0.85 + r() * 0.3, flee: 0 });
          }
        }
        return cell;
      }
      // what fish run from: you (when you are in or by the water) and big animals swimming
      const threats = [];
      function gatherThreats(P) {
        threats.length = 0;
        if (P && !P.room && P.pos.y < WATER + 0.6) threats.push(P);
        if (typeof Wild !== 'undefined') for (const b of Wild.list) if ((b.mode === 'swim' || b.mode === 'dive') && b.m.length > 0.6 && P && Math.abs(b.pos.x - P.pos.x) < 60 && Math.abs(b.pos.z - P.pos.z) < 60) threats.push(b);
      }
      function scared(f, dt) {
        for (const b of threats) {
          const bh = b.m.height * 0.5, dx = f.x - b.pos.x, dy = f.y - (b.pos.y + bh), dz = f.z - b.pos.z, d = Math.hypot(dx, dy, dz), size = b.m.length;
          if (d > 2.5 + size * 1.5) continue;
          const sp = b.speed || 0, vx = Math.sin(b.yaw) * sp, vz = Math.cos(b.yaw) * sp, toward = (vx * dx + vz * dz) / Math.max(0.01, d);
          if (d < 0.6 + size * 0.6 || toward > 0.9) return [dx / d, dy / d, dz / d];
        }
        return null;
      }
      function pickTarget(f, r) {
        const S = FISH[f.s];
        if (f.anem) { const a = f.anem; f.tx = a.x + (r() - 0.5) * 0.4 * a.s; f.tz = a.z + (r() - 0.5) * 0.4 * a.s; f.ty = a.y + 0.14 * a.s + r() * 0.25; f.t = 1 + r() * 2; return; }
        const a = r() * TAU, d = Math.sqrt(r()) * f.home.r;
        f.tx = f.home.x + Math.cos(a) * d; f.tz = f.home.z + Math.sin(a) * d;
        f.ty = bandY(f.s, f.tx, f.tz, r());
        if (S[0] === 'parrotfish' && r() < 0.4) { f.ty = floorAt(f.tx, f.tz) + 0.18; f.nib = -1; }
        f.t = 3 + r() * 5;
      }
      const R = Math.random;
      function stepFish(f, dt) {
        const S = FISH[f.s];
        let want = S[7];
        // frightened: dart away (a clownfish dives into its anemone), then come back
        const away = threats.length ? scared(f, dt) : null;
        if (away && f.flee <= 0.3) {
          f.flee = 1.6 + R() * 1.4;
          if (f.anem) { f.tx = f.anem.x; f.tz = f.anem.z; f.ty = f.anem.y + 0.08 * f.anem.s; }
          else { const k = 5 + R() * 3; f.tx = f.x + away[0] * k; f.tz = f.z + away[2] * k; f.ty = Math.min(WATER - 0.35, Math.max(floorAt(f.tx, f.tz) + 0.3, f.y + away[1] * 2)); }
          if (!f.lead) for (const q of f.cellFish || []) if (q.lead === f) q.flee = Math.max(q.flee, f.flee * 0.8);
        }
        if (f.flee > 0) { f.flee -= dt; want = f.anem ? 0.8 : Math.max(2.2, want * 6); if (f.anem && Math.hypot(f.x - f.tx, f.z - f.tz) < 0.12) want = 0.05; }
        else if (f.lead && !f.anem) {
          const l = f.lead; f.tx = l.x + f.off[0]; f.ty = Math.min(WATER - 0.35, l.y + f.off[1]); f.tz = l.z + f.off[2];
          want = Math.min(l.sp * 1.1 + 0.15, Math.max(l.sp, Math.hypot(f.tx - f.x, f.tz - f.z) * 0.8)) || S[7];
          if (l.flee > 0) want = Math.max(want, 2);
        } else {
          f.t -= dt;
          if (f.nib > 0) { f.nib -= dt; want = 0.02; if (f.nib <= 0) pickTarget(f, R); }
          else if (Math.hypot(f.tx - f.x, f.ty - f.y, f.tz - f.z) < 0.25 || f.t <= 0) { if (f.nib < 0) { f.nib = 1.5 + R() * 2; } else pickTarget(f, R); }
        }
        // steer toward the target, turning at a fish's pace
        let dx = f.tx - f.x, dy = f.ty - f.y, dz = f.tz - f.z; const d = Math.hypot(dx, dy, dz) || 1;
        dx /= d; dy /= d; dz /= d;
        const sp = Math.min(want, d * 2 + 0.05);
        const k = 1 - Math.exp(-(f.flee > 0 ? 7 : 2.2) * dt);
        f.vx += (dx * sp - f.vx) * k; f.vy += (dy * sp * 0.6 - f.vy) * k; f.vz += (dz * sp - f.vz) * k;
        f.x += f.vx * dt; f.y += f.vy * dt; f.z += f.vz * dt;
        const fl = floorAt(f.x, f.z) + 0.08 + f.L * 0.2;
        if (f.y < fl) { f.y = fl; f.vy = Math.max(0, f.vy); }
        if (f.y > WATER - 0.25) { f.y = WATER - 0.25; f.vy = Math.min(0, f.vy); }
        const hs = Math.hypot(f.vx, f.vz);
        f.sp = Math.hypot(hs, f.vy);
        if (hs > 0.02) {
          const yaw = Math.atan2(-f.vz, f.vx), dyaw = angDiff(f.yaw, yaw);
          f.yaw += dyaw * Math.min(1, dt * 8); f.bend = clamp(dyaw * 0.35, -0.25, 0.25);
        } else f.bend *= 0.9;
        const pt = f.nib > 0 ? -0.55 : clamp(Math.atan2(f.vy, Math.max(0.05, hs)), -0.7, 0.7);
        f.pitch += (pt - f.pitch) * Math.min(1, dt * 4);
        f.ph += dt * (5 + 3 * f.sp / f.L);
      }
      function stepTurtle(t, dt) {
        const fl = floorAt(t.x, t.z);
        t.breath -= dt; t.t -= dt;
        // now and then up to the surface for a breath, a few seconds there, then down again
        if (t.st !== 'up' && t.st !== 'air' && t.breath <= 0) { t.st = 'up'; t.tx = t.x + Math.sin(t.yaw) * 4; t.tz = t.z + Math.cos(t.yaw) * 4; t.ty = WATER - 0.12; }
        if (t.st === 'up' && t.y > WATER - 0.3) { t.st = 'air'; t.t = 3 + R() * 2; }
        if (t.st === 'air' && t.t <= 0) { t.st = 'cruise'; t.breath = 40 + R() * 50; t.t = 0; }
        if (t.st === 'cruise' && (t.t <= 0 || Math.hypot(t.tx - t.x, t.tz - t.z) < 1)) {
          const a = R() * TAU, d = Math.sqrt(R()) * 18; t.tx = t.home.x + Math.cos(a) * d; t.tz = t.home.z + Math.sin(a) * d;
          const f2 = floorAt(t.tx, t.tz), graze = zone(t.tx, t.tz) === 2 && R() < 0.5;
          t.ty = graze ? f2 + 0.22 : Math.min(WATER - 1.2, f2 + 1 + R() * 3); t.t = graze ? 14 : 9 + R() * 6; t.graze = graze;
        }
        let dx = t.tx - t.x, dy = t.ty - t.y, dz = t.tz - t.z; const d = Math.hypot(dx, dy, dz) || 1;
        // a turtle glides away from you if you come right at it
        for (const b of threats) { const bx = t.x - b.pos.x, bz = t.z - b.pos.z, bd = Math.hypot(bx, t.y - b.pos.y, bz); if (bd < 1.6 + b.m.length) { dx += (bx / bd) * 2; dz += (bz / bd) * 2; t.flee = 1.5; } }
        t.flee = Math.max(0, t.flee - dt);
        const want = t.st === 'air' ? 0.08 : t.graze && d < 0.6 ? 0.02 : t.flee > 0 ? 1.1 : 0.45, dl = Math.hypot(dx, dy, dz) || 1;
        const k = 1 - Math.exp(-0.8 * dt);
        t.vx = (t.vx || 0) + ((dx / dl) * want - (t.vx || 0)) * k; t.vz = (t.vz || 0) + ((dz / dl) * want - (t.vz || 0)) * k; t.vy = (t.vy || 0) + ((dy / dl) * want * 0.7 - (t.vy || 0)) * k;
        t.x += t.vx * dt; t.y += t.vy * dt; t.z += t.vz * dt;
        t.y = clamp(t.y, fl + 0.14 * t.s, WATER - 0.1);
        const hs = Math.hypot(t.vx, t.vz);
        if (hs > 0.03) t.yaw += angDiff(t.yaw, Math.atan2(-t.vz, t.vx)) * Math.min(1, dt * 1.2);
        t.pitch += (clamp(Math.atan2(t.vy, Math.max(0.1, hs)), -0.5, 0.6) - t.pitch) * Math.min(1, dt * 2);
        t.sp = Math.hypot(hs, t.vy);
        t.ph += dt * (0.9 + 2.2 * t.sp);
      }
      // instance matrix: the model's +x along yaw, nose up by pitch, scale s
      function setM(arr, o, x, y, z, yaw, pitch, s) {
        const c = Math.cos(yaw), sn = Math.sin(yaw), cp = Math.cos(pitch), spp = Math.sin(pitch);
        arr[o] = c * cp * s; arr[o + 1] = spp * s; arr[o + 2] = -sn * cp * s; arr[o + 3] = 0;
        arr[o + 4] = -c * spp * s; arr[o + 5] = cp * s; arr[o + 6] = sn * spp * s; arr[o + 7] = 0;
        arr[o + 8] = sn * s; arr[o + 9] = 0; arr[o + 10] = c * s; arr[o + 11] = 0;
        arr[o + 12] = x; arr[o + 13] = y; arr[o + 14] = z; arr[o + 15] = 1;
      }
      let anemDirty = true;
      const update = function (dt, P) {
        dt = Math.min(dt, 0.1);
        const fx = P ? P.pos.x : w.def.spawn[0], fz = P ? P.pos.z : w.def.spawn[1];
        const inside = P && P.room;
        fim.visible = tim.visible = aim.visible = !inside;
        if (inside) return;
        // cells around you come and go
        const ci0 = Math.floor(fx / CELL), cj0 = Math.floor(fz / CELL), n = Math.ceil(NEAR / CELL);
        for (let i = -n; i <= n; i++) for (let j = -n; j <= n; j++) {
          const ci = ci0 + i, cj = cj0 + j, key = ci * 65536 + cj;
          if (cells.has(key) || Math.hypot((ci + 0.5) * CELL - fx, (cj + 0.5) * CELL - fz) > NEAR) continue;
          const cell = populate(ci, cj); cell.ci = ci; cell.cj = cj;
          for (const f of cell.fish) f.cellFish = cell.fish;
          cells.set(key, cell); if (cell.anem.length) anemDirty = true;
        }
        for (const [key, cell] of cells) if (Math.hypot((cell.ci + 0.5) * CELL - fx, (cell.cj + 0.5) * CELL - fz) > NEAR + 26) { cells.delete(key); if (cell.anem.length) anemDirty = true; }
        gatherThreats(P);
        const fa = fim.instanceMatrix.array, aa = aFish.array, ta = tim.instanceMatrix.array, tt = aTurt.array;
        let nf = 0, nt = 0;
        for (const cell of cells.values()) {
          for (const f of cell.fish) {
            stepFish(f, dt);
            if (nf >= CAP) continue;
            setM(fa, nf * 16, f.x, f.y, f.z, f.yaw, f.pitch, f.L);
            aa[nf * 4] = f.s; aa[nf * 4 + 1] = f.ph; aa[nf * 4 + 2] = 0.05 + Math.min(0.06, f.sp / f.L * 0.025); aa[nf * 4 + 3] = f.bend;
            nf++;
          }
          for (const t of cell.turt) {
            stepTurtle(t, dt);
            if (nt >= TCAP) continue;
            setM(ta, nt * 16, t.x, t.y, t.z, t.yaw, t.pitch, t.s);
            tt[nt * 2] = t.ph; tt[nt * 2 + 1] = t.st === 'air' ? 0.3 : 0.6 + Math.min(0.4, t.sp);
            nt++;
          }
        }
        fim.count = nf; fim.instanceMatrix.needsUpdate = true; aFish.needsUpdate = true;
        tim.count = nt; tim.instanceMatrix.needsUpdate = true; aTurt.needsUpdate = true;
        if (anemDirty) {
          anemDirty = false;
          let na = 0; const am = aim.instanceMatrix.array;
          for (const cell of cells.values()) for (const a of cell.anem) { if (na >= ACAP) break; setM(am, na * 16, a.x, a.y, a.z, a.rot, 0, a.s); na++; }
          aim.count = na; aim.instanceMatrix.needsUpdate = true;
        }
      };
      update.cells = cells;   // (for tests)
      return update;
    },
  };
})();
