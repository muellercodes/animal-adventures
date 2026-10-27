/* ---------- city and town buildings: towers, shop buildings, store fronts and store insides ----------
   Adds to Env. Uses the scenery kit from 35_envkit through Env._k.
   Towers (apartment, office, midrise) and store fronts are instanced props (Env.prop(type, variant)): every part is
   drawn as one InstancedMesh, so a prop has at most three parts (wall, windows, trim) and no per-instance color.
   Windows come from one shared painted atlas; at night a random set of them lights up, different for every building
   (the window material hashes the instance position). Shop buildings for the towns (Env.shop) and the store insides
   (Env.storeInterior) are groups like the houses and their rooms. */
(() => {
  const K = Env._k;
  const { TAU, V3, clamp, lerp, smooth, rng, strSeed, fbm, L, mixc, mulc, prep, paint, setGlow, merge, smoothNormals, boxUV, eachVertex,
    soup, canvasTex, wrapDraw, gray, mat, TX, boxG, meshOf, roofX, doorGeo, wallQuadZ, wallQuadX, polyZ, roundBox, doorRec, resolveDoors, glassMat, glassMesh, pipeGeo, nightU } = K;
  const PI = Math.PI, HP = PI / 2;

  /* ============================================================
     Small helpers
     ============================================================ */
  function lathe(pts, seg, col) {
    const g = prep(new THREE.LatheGeometry(pts.map(([r, y]) => new THREE.Vector2(r, y)), seg));
    smoothNormals(g);
    return col ? paint(g, col) : g;
  }
  const ico = (r, d, x, y, z, col, sx = 1, sy = 1, sz = 1) => paint(prep(new THREE.IcosahedronGeometry(r, d)).scale(sx, sy, sz).translate(x, y, z), col);
  const cyl = (r0, r1, h, seg, x, y, z, col) => paint(prep(new THREE.CylinderGeometry(r0, r1, h, seg)).translate(x, y + h / 2, z), col);
  const FONT = (n) => `bold ${n}px Grandstander, 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif`;
  const SERIF = (n) => `bold ${n}px Georgia, 'Times New Roman', serif`;
  // css color from 0xRRGGBB scaled by k
  function css(c, k = 1, a = 1) { const r = clamp(((c >> 16) & 255) * k, 0, 255) | 0, g = clamp(((c >> 8) & 255) * k, 0, 255) | 0, b = clamp((c & 255) * k, 0, 255) | 0; return a < 1 ? `rgba(${r},${g},${b},${a})` : `rgb(${r},${g},${b})`; }
  function mixHex(a, b, t) {
    const ch = (s) => [(s >> 16) & 255, (s >> 8) & 255, s & 255];
    const A = ch(a), B = ch(b);
    return (Math.round(A[0] + (B[0] - A[0]) * t) << 16) | (Math.round(A[1] + (B[1] - A[1]) * t) << 8) | Math.round(A[2] + (B[2] - A[2]) * t);
  }
  const faceMatrix = (ry, x, z, y = 0) => new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
  const pick = (r, arr) => arr[Math.floor(r() * arr.length) % arr.length];

  /* Acc: a triangle accumulator with a current transform. Quads take corners a, b, c, d counterclockwise seen from the
     front, a color (array or fn(x, y, z) in object space), an optional uv rect [u0, v0, u1, v1] (a -> u0 v0, c -> u1 v1)
     and an optional glow value (the 'glow' attribute). */
  function Acc() {
    const P = [], N = [], U = [], C = [], G = [];
    let M = null;
    const nm = new THREE.Matrix3(), va = new V3(), vb = new V3(), vc = new V3(), vd = new V3(), n = new V3(), t1 = new V3(), t2 = new V3();
    let anyGlow = false;
    const A = {
      tris: 0,
      setM(m) { M = m || null; if (M) nm.getNormalMatrix(M); return A; },
      getM() { return M; },
      pushV(v, col, u, w, g) {
        P.push(v.x, v.y, v.z); N.push(n.x, n.y, n.z); U.push(u, w);
        const cc = typeof col === 'function' ? col(v.x, v.y, v.z) : col;
        C.push(cc[0], cc[1], cc[2]); G.push(g);
      },
      quad(a, b, c, d, col = [1, 1, 1], uv = null, g = 0) {
        va.set(a[0], a[1], a[2]); vb.set(b[0], b[1], b[2]); vc.set(c[0], c[1], c[2]); vd.set(d[0], d[1], d[2]);
        if (M) { va.applyMatrix4(M); vb.applyMatrix4(M); vc.applyMatrix4(M); vd.applyMatrix4(M); }
        n.crossVectors(t1.subVectors(vb, va), t2.subVectors(vd, va));
        if (n.lengthSq() < 1e-14) n.crossVectors(t1.subVectors(vc, va), t2.subVectors(vd, va));
        if (n.lengthSq() < 1e-14) n.crossVectors(t1.subVectors(vb, va), t2.subVectors(vc, va));
        if (n.lengthSq() < 1e-14) n.set(0, 1, 0);
        n.normalize();
        if (g) anyGlow = true;
        const u0 = uv ? uv[0] : 0, v0 = uv ? uv[1] : 0, u1 = uv ? uv[2] : 0, v1 = uv ? uv[3] : 0;
        A.pushV(va, col, u0, v0, g); A.pushV(vb, col, u1, v0, g); A.pushV(vc, col, u1, v1, g);
        A.pushV(va, col, u0, v0, g); A.pushV(vc, col, u1, v1, g); A.pushV(vd, col, u0, v1, g);
        A.tris += 2;
      },
      tri(a, b, c, col = [1, 1, 1], g = 0) {
        va.set(a[0], a[1], a[2]); vb.set(b[0], b[1], b[2]); vc.set(c[0], c[1], c[2]);
        if (M) { va.applyMatrix4(M); vb.applyMatrix4(M); vc.applyMatrix4(M); }
        n.crossVectors(t1.subVectors(vb, va), t2.subVectors(vc, va)).normalize();
        if (g) anyGlow = true;
        A.pushV(va, col, 0, 0, g); A.pushV(vb, col, 0, 0, g); A.pushV(vc, col, 0, 0, g);
        A.tris += 1;
      },
      // axis aligned box in the current frame; faces: t b f k (back) l r
      box(x0, x1, y0, y1, z0, z1, col, faces = 'tbfklr', g = 0) {
        if (faces.includes('f')) A.quad([x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1], col, null, g);
        if (faces.includes('k')) A.quad([x1, y0, z0], [x0, y0, z0], [x0, y1, z0], [x1, y1, z0], col, null, g);
        if (faces.includes('t')) A.quad([x0, y1, z1], [x1, y1, z1], [x1, y1, z0], [x0, y1, z0], col, null, g);
        if (faces.includes('b')) A.quad([x0, y0, z0], [x1, y0, z0], [x1, y0, z1], [x0, y0, z1], col, null, g);
        if (faces.includes('l')) A.quad([x0, y0, z0], [x0, y0, z1], [x0, y1, z1], [x0, y1, z0], col, null, g);
        if (faces.includes('r')) A.quad([x1, y0, z1], [x1, y0, z0], [x1, y1, z0], [x1, y1, z1], col, null, g);
      },
      // a prepared BufferGeometry (positions, normals, uvs, colors), through the current transform
      geo(gm, g = 0) {
        const q = prep(gm), p = q.attributes.position.array, nn = q.attributes.normal.array, uu = q.attributes.uv.array, cc = q.attributes.color.array;
        const gl = q.attributes.glow ? q.attributes.glow.array : null;
        for (let i = 0; i < q.attributes.position.count; i++) {
          va.set(p[i * 3], p[i * 3 + 1], p[i * 3 + 2]); n.set(nn[i * 3], nn[i * 3 + 1], nn[i * 3 + 2]);
          if (M) { va.applyMatrix4(M); n.applyMatrix3(nm).normalize(); }
          P.push(va.x, va.y, va.z); N.push(n.x, n.y, n.z); U.push(uu[i * 2], uu[i * 2 + 1]); C.push(cc[i * 3], cc[i * 3 + 1], cc[i * 3 + 2]);
          const gv = gl ? gl[i] : g; G.push(gv); if (gv) anyGlow = true;
        }
        A.tris += q.attributes.position.count / 3;
      },
      build(uvScale) {
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
        g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
        g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
        g.setAttribute('color', new THREE.Float32BufferAttribute(C, 3));
        if (anyGlow) g.setAttribute('glow', new THREE.Float32BufferAttribute(G, 1));
        if (uvScale) boxUV(g, uvScale);
        g.computeBoundingBox(); g.computeBoundingSphere();
        return g;
      },
      get empty() { return P.length === 0; },
    };
    return A;
  }

  /* ============================================================
     Wall textures (tiles of 1.8 m for brick, 2.4 m for the rest)
     ============================================================ */
  const BRICK_UV = 1 / 1.8, STONE_UV = 1 / 2.4;
  // colored brick: 24 courses of 8 bricks per tile, mortar, burnt headers, speckles and a little soot
  function brickTex(key, base, mortar, spread = 1) {
    return canvasTex('cityBrick:' + key, 256, 256, (c, w, h, r) => {
      c.fillStyle = css(mortar); c.fillRect(0, 0, w, h);
      const rows = 24, bh = h / rows, bw = w / 8;
      for (let y = 0; y < rows; y++) {
        const off = (y % 2) * bw / 2;
        for (let x = -1; x < 9; x++) {
          const v = 0.8 + r() * 0.32 * spread, burnt = r() < 0.07;
          c.fillStyle = css(burnt ? mixHex(base, 0x2a1a14, 0.45) : base, v);
          c.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 1.6);
          c.fillStyle = 'rgba(0,0,0,0.13)'; c.fillRect(x * bw + off + 1, y * bh + bh - 2.2, bw - 2, 1.2);
          c.fillStyle = 'rgba(255,240,220,0.08)'; c.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, 1);
        }
      }
      for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '20,10,5' : '255,235,210'},${r() * 0.1})`; c.fillRect(r() * w, r() * h, 1 + r() * 2, 1); }
    }, { srgb: true });
  }
  // grayscale textures (linear, multiply the vertex color)
  const CT = {
    paintedBrick: () => canvasTex('cityPaintBrick', 256, 256, (c, w, h, r) => {
      c.fillStyle = gray(0.74); c.fillRect(0, 0, w, h);
      const rows = 24, bh = h / rows, bw = w / 8;
      for (let y = 0; y < rows; y++) {
        const off = (y % 2) * bw / 2;
        for (let x = -1; x < 9; x++) {
          c.fillStyle = gray(0.93 + r() * 0.06); c.fillRect(x * bw + off + 1, y * bh + 1, bw - 2, bh - 1.6);
          c.fillStyle = gray(0.8, 0.5); c.fillRect(x * bw + off + 1, y * bh + bh - 2.2, bw - 2, 1);
        }
      }
      // peeling and weathered paint
      for (let i = 0; i < 26; i++) { const x = r() * w, y = r() * h; c.fillStyle = gray(0.84 + r() * 0.08, 0.5); wrapDraw(w, h, x, y, 20, (X, Y) => { c.beginPath(); c.ellipse(X, Y, 3 + r() * 9, 2 + r() * 4, r() * 3, 0, TAU); c.fill(); }); }
      for (let i = 0; i < 900; i++) { c.fillStyle = gray(0.7 + r() * 0.3, 0.25); c.fillRect(r() * w, r() * h, 1, 1); }
    }),
    stone: () => canvasTex('cityStone', 256, 256, (c, w, h, r) => {
      c.fillStyle = gray(0.66); c.fillRect(0, 0, w, h);
      const rows = 6, rh = h / rows;
      for (let y = 0; y < rows; y++) {
        let x = -r() * 60;
        while (x < w) {
          const bl = 80 + r() * 90, v = 0.86 + r() * 0.12;
          wrapDraw(w, h, x, y * rh, 260, (X, Y) => {
            c.fillStyle = gray(v); c.fillRect(X + 1, Y + 1, bl - 2, rh - 2);
            c.fillStyle = gray(1, 0.18); c.fillRect(X + 1, Y + 1, bl - 2, 2);
            c.fillStyle = gray(0.5, 0.25); c.fillRect(X + 1, Y + rh - 3, bl - 2, 2);
          });
          x += bl;
        }
      }
      for (let i = 0; i < 2600; i++) { c.fillStyle = gray(0.6 + r() * 0.4, 0.22); c.fillRect(r() * w, r() * h, 1 + r(), 1); }
      for (let i = 0; i < 7; i++) {
        let x = r() * w, y = r() * h; c.strokeStyle = gray(0.7, 0.25); c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += (r() - 0.3) * 14; y += (r() - 0.5) * 8; c.lineTo(x, y); }
        c.stroke();
      }
    }),
    stucco: () => canvasTex('cityStucco', 256, 256, (c, w, h, r) => {
      c.fillStyle = gray(0.94); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 500; i++) { c.fillStyle = gray(0.86 + r() * 0.14, 0.18); const s = 4 + r() * 18; wrapDraw(w, h, r() * w, r() * h, 22, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (0.4 + r() * 0.4), r() * 3, 0, TAU); c.fill(); }); }
      for (let i = 0; i < 3000; i++) { c.fillStyle = gray(0.75 + r() * 0.25, 0.3); c.fillRect(r() * w, r() * h, 1, 1); }
      for (let i = 0; i < 4; i++) {
        let x = r() * w, y = r() * h; c.strokeStyle = gray(0.62, 0.35); c.lineWidth = 0.7; c.beginPath(); c.moveTo(x, y);
        for (let k = 0; k < 6; k++) { x += (r() - 0.5) * 18; y += r() * 14; c.lineTo(x, y); }
        c.stroke();
      }
    }),
    panel: () => canvasTex('cityPanel', 256, 256, (c, w, h, r) => {
      // precast or granite cladding panels, 1.2 m, with sealant joints
      c.fillStyle = gray(0.5); c.fillRect(0, 0, w, h);
      for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
        const v = 0.88 + r() * 0.08;
        c.fillStyle = gray(v); c.fillRect(i * 128 + 1.5, j * 128 + 1.5, 125, 125);
        for (let k = 0; k < 900; k++) { c.fillStyle = gray(v * (0.8 + r() * 0.3), 0.35); c.fillRect(i * 128 + 2 + r() * 123, j * 128 + 2 + r() * 123, 1, 1); }
        c.fillStyle = gray(1, 0.12); c.fillRect(i * 128 + 1.5, j * 128 + 1.5, 125, 2);
      }
    }),
    concrete: () => canvasTex('cityConcrete', 256, 256, (c, w, h, r) => {
      c.fillStyle = gray(0.93); c.fillRect(0, 0, w, h);
      for (let i = 0; i < 260; i++) { c.fillStyle = gray(0.82 + r() * 0.18, 0.16); const s = 6 + r() * 26; wrapDraw(w, h, r() * w, r() * h, 32, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * 0.6, r() * 3, 0, TAU); c.fill(); }); }
      for (let i = 0; i < 2600; i++) { c.fillStyle = gray(0.7 + r() * 0.3, 0.25); c.fillRect(r() * w, r() * h, 1, 1); }
    }),
  };
  const WALLS = {
    brickRed: () => mat('cityWallBrickRed', { map: brickTex('red', 0x9a3c2a, 0xc2b8a8) }),
    brickBrown: () => mat('cityWallBrickBrown', { map: brickTex('brown', 0x6e4632, 0xa89c8c) }),
    brickBuff: () => mat('cityWallBrickBuff', { map: brickTex('buff', 0xc8a878, 0xd8d0c0, 0.7) }),
    brickDark: () => mat('cityWallBrickDark', { map: brickTex('dark', 0x6a3a32, 0x8a8278) }),
    painted: () => mat('cityWallPainted', { map: CT.paintedBrick() }),
    stone: () => mat('cityWallStone', { map: CT.stone() }),
    stucco: () => mat('cityWallStucco', { map: CT.stucco() }),
    panel: () => mat('cityWallPanel', { map: CT.panel() }),
  };
  const WALL_UV = { brickRed: BRICK_UV, brickBrown: BRICK_UV, brickBuff: BRICK_UV, brickDark: BRICK_UV, painted: BRICK_UV, stone: STONE_UV, stucco: STONE_UV, panel: STONE_UV };
  const trimMat = () => mat('cityTrim', { map: CT.concrete() });

  /* ============================================================
     Window atlas: 8 x 6 cells of 128 x 160 px (one window each, with a painted reveal around it), and two strips
     at the bottom (iron railing bars, glass balcony panels). A matching half size glow atlas holds what each window
     looks like lit at night (warm rooms, glowing curtains, blinds, silhouettes in black).
     ============================================================ */
  const WIN_W = 1024, WIN_CW = 128, WIN_CH = 160;
  const SH = 0xeeeae2, DK = 0x2e2c2a, BZ = 0x4a3c30, AL = 0x9aa2a8;   // frame colors: white sash, dark metal, bronze, aluminum
  const WIN = [
    // row 0: white double hung sashes (homes)
    { st: 'sash', fr: SH, room: 0xd8c8a8, cur: 0xa83a32, open: 1, lamp: 1 },
    { st: 'sash', fr: SH, room: 0xc8d4c0, blinds: 0.45, pic: 1 },
    { st: 'sash', fr: SH, room: 0xe0d0b0, cur: 0xe8dcc0, open: 0 },
    { st: 'sash', fr: SH, room: 0xbfcfd8, pic: 1, mun: 1 },
    { st: 'sash', fr: SH, room: 0xe0d4bc, sheer: 1, plant: 1 },
    { st: 'sash', fr: SH, room: 0xd8c8b0, person: 1, cur: 0x3a5a7a, open: 1 },
    { st: 'sash', fr: SH, room: 0xd0c8b8, blinds: 1 },
    { st: 'sash', fr: SH, room: 0xe4d8c0, cat: 1, cur: 0x4a6aa0, open: 1, mun: 1 },
    // row 1: dark metal casements (newer homes)
    { st: 'case', fr: DK, room: 0xd8d0c4, sheer: 1 },
    { st: 'case', fr: DK, room: 0xc4ccd0, blinds: 0.5 },
    { st: 'case', fr: DK, room: 0xd0c4b0, cur: 0x8a8a84, open: 1, lamp: 1 },
    { st: 'case', fr: DK, room: 0xe0d8c8, shelf: 1, lamp: 1 },
    { st: 'case', fr: DK, room: 0xd4c8b4, person: 1 },
    { st: 'case', fr: DK, room: 0xd8ccb8, plant: 1, pic: 1 },
    { st: 'case', fr: DK, room: 0xb8bcc4, tv: 1 },
    { st: 'case', fr: DK, room: 0xd0ccc4, blinds: 1 },
    // row 2: balcony doors (french doors), white then dark
    { st: 'french', fr: SH, room: 0xe0d4bc, sheer: 1, lamp: 1 },
    { st: 'french', fr: SH, room: 0xc8d4c0, pic: 1, plant: 1 },
    { st: 'french', fr: SH, room: 0xd8c8b0, person: 1, cur: 0xa86a3a, open: 1 },
    { st: 'french', fr: SH, room: 0xd0c8b8, blinds: 0.6 },
    { st: 'french', fr: DK, room: 0xd8d0c4, sheer: 1 },
    { st: 'french', fr: DK, room: 0xd0c4b0, cur: 0x5a6a5a, open: 1, lamp: 1 },
    { st: 'french', fr: DK, room: 0xd4c8b4, person: 1 },
    { st: 'french', fr: DK, room: 0xc4ccd0, tv: 1, shelf: 1 },
    // row 3: office curtain wall panels (spandrel below, vision glass above), blue green glass
    { st: 'cw', tint: 0, desks: 1 }, { st: 'cw', tint: 0, blinds: 0.3, desks: 1 }, { st: 'cw', tint: 0, blinds: 0.7 }, { st: 'cw', tint: 0, plant: 1, desks: 1 },
    { st: 'cw', tint: 0, meet: 1 }, { st: 'cw', tint: 0 }, { st: 'cw', tint: 0, person: 1, desks: 1 }, { st: 'cw', tint: 0, dark: 1 },
    // row 4: office windows in a stone grid (bronze frames, gray glass)
    { st: 'rib', fr: BZ, tint: 1, desks: 1 }, { st: 'rib', fr: BZ, tint: 1, blinds: 0.4, desks: 1 }, { st: 'rib', fr: BZ, tint: 1, blinds: 0.85 }, { st: 'rib', fr: BZ, tint: 1, plant: 1 },
    { st: 'rib', fr: BZ, tint: 1, meet: 1 }, { st: 'rib', fr: AL, tint: 1, desks: 1 }, { st: 'rib', fr: BZ, tint: 1, person: 1, desks: 1 }, { st: 'rib', fr: AL, tint: 1, dark: 1 },
    // row 5: ground floor pieces
    { st: 'lobby', fr: BZ, room: 0x8a6040 }, { st: 'side', fr: DK, room: 0xb0a698 }, { st: 'lobby', fr: AL, room: 0xc8c4bc, cool: 1 }, { st: 'service' },
    { st: 'louver' }, { st: 'light' }, { st: 'barred', fr: SH, room: 0xd8c8b0, cur: 0x7a3a3a, open: 0 }, { st: 'white' },
  ];
  // cell groups used by the buildings
  // (weighted: the cells with someone looking out turn up about once in fifteen windows)
  const W_SASH = [0, 1, 2, 3, 4, 6, 7, 0, 1, 2, 3, 4, 6, 7, 5], W_CASE = [8, 9, 10, 11, 13, 14, 15, 8, 9, 10, 11, 13, 14, 15, 12];
  const W_FR_W = [16, 17, 19, 16, 17, 19, 18], W_FR_D = [20, 21, 23, 20, 21, 23, 22];
  const W_CW = [24, 25, 26, 27, 28, 29, 31, 24, 25, 27, 29, 31, 24, 26, 25, 29, 28, 24, 25, 27, 31, 26, 29, 24, 30], W_RIB = [32, 33, 34, 35, 36, 37, 39, 32, 33, 35, 37, 34, 32, 36, 33, 38];
  const W_LOBBY = 40, W_SIDE = 41, W_OLOBBY = 42, W_SERVICE = 43, W_LOUVER = 44, W_RED = 45, W_BARRED = 46, W_WHITE = 47;
  const PERSON = new Set([5, 12, 18, 22]);   // homes where someone is looking out: lit at night in every building
  const RAIL_V = [960, 992], GLASSRAIL_V = [992, 1024];

  function winCellUV(i) {
    const cx = (i % 8) * WIN_CW, cy = Math.floor(i / 8) * WIN_CH, e = 0.6;
    return [(cx + e) / WIN_W, 1 - (cy + WIN_CH - e) / WIN_W, (cx + WIN_CW - e) / WIN_W, 1 - (cy + e) / WIN_W];
  }
  // uv rect on a strip for a piece len meters long (32 px per meter along the strip)
  function stripUV(rows, len, u0 = 0) {
    const a = u0 * 32 / WIN_W;
    return [a, 1 - rows[1] / WIN_W, a + len * 32 / WIN_W, 1 - rows[0] / WIN_W];
  }
  // one window cell, drawn at the origin (128 x 160); glow: the night version
  function drawWinCell(c, s, glow, r) {
    const cw = WIN_CW, ch = WIN_CH;
    const m = s.st === 'cw' || s.st === 'white' || s.st === 'light' ? 0 : s.st === 'rib' ? 8 : 10;
    c.fillStyle = glow ? '#000' : '#5f5852'; c.fillRect(0, 0, cw, ch);
    if (!glow && m) {
      let g = c.createLinearGradient(0, 0, 0, m * 1.6); g.addColorStop(0, '#24201c'); g.addColorStop(1, 'rgba(70,64,58,0)');
      c.fillStyle = g; c.fillRect(0, 0, cw, m * 1.6);
      g = c.createLinearGradient(0, 0, m, 0); g.addColorStop(0, '#3e3833'); g.addColorStop(1, 'rgba(90,84,78,0)');
      c.fillStyle = g; c.fillRect(0, 0, m, ch);
      c.fillStyle = '#b2a99c'; c.fillRect(0, ch - m, cw, m);
      c.fillStyle = '#d8d0c4'; c.fillRect(0, ch - m, cw, 2);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(0, ch - 2, cw, 2);
    }
    const X0 = m, Y0 = m, Wd = cw - 2 * m, Ht = ch - 2 * m;
    const frame = (x, y, w, h, col) => {
      c.fillStyle = glow ? '#000' : css(col); c.fillRect(x, y, w, h);
      if (!glow) { c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(x, y, w, Math.min(1.5, h)); c.fillStyle = 'rgba(0,0,0,0.22)'; c.fillRect(x, y + h - Math.min(1.5, h), w, Math.min(1.5, h)); }
    };
    if (s.st === 'white') { c.fillStyle = glow ? '#ffffff' : '#f4f2ee'; c.fillRect(0, 0, cw, ch); return; }
    if (s.st === 'light') {
      c.fillStyle = glow ? '#000' : '#3a3a3a'; c.fillRect(0, 0, cw, ch);
      const g = c.createRadialGradient(64, 80, 2, 64, 80, 44); g.addColorStop(0, glow ? '#ff6a50' : '#e04030'); g.addColorStop(0.5, glow ? '#ff2010' : '#a02018'); g.addColorStop(1, glow ? '#000' : '#3a3a3a');
      c.fillStyle = g; c.fillRect(0, 0, cw, ch); return;
    }
    if (s.st === 'service') {
      if (glow) return;
      c.fillStyle = '#4a5a52'; c.fillRect(X0, Y0, Wd, Ht);
      c.fillStyle = '#56685e'; c.fillRect(X0 + 10, Y0 + 6, Wd - 20, Ht - 6);
      c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(X0 + 10, Y0 + 6, 2, Ht - 6); c.fillRect(X0 + Wd - 12, Y0 + 6, 2, Ht - 6);
      c.fillStyle = '#26302e'; c.fillRect(X0 + 40, Y0 + 26, 28, 30);
      c.fillStyle = '#c0b080'; c.fillRect(X0 + Wd - 30, Y0 + Ht * 0.55, 12, 4);
      for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,255,255'},${r() * 0.08})`; c.fillRect(X0 + r() * Wd, Y0 + r() * Ht, 2, 2); }
      return;
    }
    if (s.st === 'louver') {
      if (glow) return;
      c.fillStyle = '#6a6e70'; c.fillRect(X0, Y0, Wd, Ht);
      for (let y = Y0 + 4; y < Y0 + Ht - 4; y += 9) { c.fillStyle = '#2a2c2e'; c.fillRect(X0 + 4, y, Wd - 8, 5); c.fillStyle = '#9a9ea0'; c.fillRect(X0 + 4, y + 5, Wd - 8, 2); }
      return;
    }
    // ----- glazed openings: the room behind the glass, then curtains or blinds, reflections, then the frame bars -----
    const office = s.st === 'cw' || s.st === 'rib';
    let gx = X0, gy = Y0, gw = Wd, gh = Ht;
    const room = () => {
      if (office) {
        if (glow) {
          if (s.dark) { c.fillStyle = 'rgb(26,32,42)'; c.fillRect(gx, gy, gw, gh); return; }
          const g = c.createLinearGradient(0, gy, 0, gy + gh); g.addColorStop(0, '#d8d6cc'); g.addColorStop(0.45, '#9c9a90'); g.addColorStop(1, '#3a3c3e');
          c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
          for (let k = 0; k < 3; k++) { c.fillStyle = '#fbfaf2'; c.fillRect(gx + 4 + k * gw / 3, gy + 6, gw / 3 - 12, 3); }
        } else {
          const g = c.createLinearGradient(0, gy, 0, gy + gh);
          if (s.tint === 0) { g.addColorStop(0, '#7e9fae'); g.addColorStop(0.5, '#4d6c7a'); g.addColorStop(1, '#2e4652'); } else { g.addColorStop(0, '#80888e'); g.addColorStop(0.5, '#555c62'); g.addColorStop(1, '#30363a'); }
          c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
          if (!s.dark) for (let k = 0; k < 3; k++) { c.fillStyle = 'rgba(225,235,242,0.32)'; c.fillRect(gx + 4 + k * gw / 3, gy + 6, gw / 3 - 12, 3); }
        }
        const dk = glow ? 'rgba(20,24,30,0.85)' : 'rgba(18,26,30,0.2)';
        if (s.desks) { c.fillStyle = dk; for (let k = 0; k < 3; k++) { c.fillRect(gx + 6 + k * 40, gy + gh - 34, 28, 10); c.fillRect(gx + 8 + k * 40, gy + gh - 52, 3, 18); } c.fillRect(gx, gy + gh - 22, gw, 22); }
        if (s.meet) { c.fillStyle = dk; c.fillRect(gx + 14, gy + gh - 40, gw - 28, 8); for (let k = 0; k < 4; k++) { c.beginPath(); c.arc(gx + 24 + k * 26, gy + gh - 48, 6, 0, TAU); c.fill(); } }
        if (s.plant) { c.fillStyle = glow ? '#06080a' : 'rgba(30,60,30,0.3)'; for (let k = 0; k < 7; k++) { c.beginPath(); c.ellipse(gx + 22 + r() * 18, gy + gh - 60 + r() * 20, 9, 14, r() * 3, 0, TAU); c.fill(); } }
        return;
      }
      const rc = s.room || 0xd8c8b0;
      if (glow) {
        const warm = s.cool ? 0xf0f4ff : 0xffd49a;
        const g = c.createLinearGradient(0, gy, 0, gy + gh);
        g.addColorStop(0, css(mixHex(rc, warm, 0.6), 0.85)); g.addColorStop(0.35, css(mixHex(rc, warm, 0.7), 1.0)); g.addColorStop(1, css(mixHex(rc, warm, 0.5), 0.6));
        c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
        if (s.tv) { c.fillStyle = 'rgba(90,140,255,0.55)'; c.fillRect(gx, gy, gw, gh); }
        const lg = c.createRadialGradient(gx + gw * 0.5, gy + 4, 1, gx + gw * 0.5, gy + 4, gw * 0.7); lg.addColorStop(0, 'rgba(255,250,235,0.9)'); lg.addColorStop(1, 'rgba(255,240,200,0)');
        c.fillStyle = lg; c.fillRect(gx, gy, gw, gh);
      } else {
        const g = c.createLinearGradient(0, gy, 0, gy + gh);
        g.addColorStop(0, css(rc, 0.26)); g.addColorStop(0.3, css(rc, 0.42)); g.addColorStop(1, css(rc, 0.3));
        c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
        c.fillStyle = 'rgba(240,235,220,0.35)'; c.beginPath(); c.ellipse(gx + gw * 0.5, gy + 5, 12, 3, 0, 0, TAU); c.fill();
      }
      const fur = glow ? 'rgba(30,20,12,0.8)' : 'rgba(25,18,12,0.45)';
      // furniture low in the room, a doorway, maybe a picture, shelves and a lamp
      c.fillStyle = fur; c.fillRect(gx + gw * 0.55, gy + gh * 0.2, gw * 0.18, gh * 0.55);
      c.fillRect(gx, gy + gh * 0.78, gw * 0.6, gh * 0.22);
      if (s.pic) { c.fillStyle = glow ? 'rgba(60,40,20,0.9)' : 'rgba(40,30,20,0.6)'; c.fillRect(gx + gw * 0.18, gy + gh * 0.28, gw * 0.24, gh * 0.14); c.fillStyle = glow ? 'rgba(180,140,90,0.9)' : 'rgba(110,130,140,0.6)'; c.fillRect(gx + gw * 0.2, gy + gh * 0.295, gw * 0.2, gh * 0.11); }
      if (s.shelf) { c.fillStyle = fur; c.fillRect(gx + gw * 0.08, gy + gh * 0.25, gw * 0.3, gh * 0.6); c.fillStyle = glow ? 'rgba(150,90,50,0.8)' : 'rgba(120,60,40,0.45)'; for (let k = 0; k < 4; k++) c.fillRect(gx + gw * 0.1, gy + gh * (0.3 + k * 0.13), gw * 0.26, gh * 0.06); }
      if (s.lamp) {
        const lx = gx + gw * 0.22, ly = gy + gh * 0.52;
        if (glow) { const lg = c.createRadialGradient(lx, ly, 1, lx, ly, gw * 0.5); lg.addColorStop(0, 'rgba(255,245,210,1)'); lg.addColorStop(1, 'rgba(255,220,160,0)'); c.fillStyle = lg; c.fillRect(gx, gy, gw, gh); }
        c.fillStyle = glow ? '#fff4d8' : 'rgba(230,214,180,0.75)'; c.beginPath(); c.moveTo(lx - 7, ly); c.lineTo(lx + 7, ly); c.lineTo(lx + 4, ly - 9); c.lineTo(lx - 4, ly - 9); c.closePath(); c.fill();
        c.fillStyle = fur; c.fillRect(lx - 1, ly, 2, gh * 0.25);
      }
    };
    const silhouette = (cx, top, sc) => {
      c.fillStyle = glow ? '#050403' : office ? 'rgba(22,26,30,0.45)' : 'rgba(22,19,20,0.88)';
      c.beginPath(); c.ellipse(cx, top + 9 * sc, 8 * sc, 10 * sc, 0, 0, TAU); c.fill();
      c.beginPath(); c.moveTo(cx - 6 * sc, top + 17 * sc); c.quadraticCurveTo(cx - 24 * sc, top + 22 * sc, cx - 26 * sc, top + 60 * sc); c.lineTo(cx + 26 * sc, top + 60 * sc); c.quadraticCurveTo(cx + 24 * sc, top + 22 * sc, cx + 6 * sc, top + 17 * sc); c.closePath(); c.fill();
      if (!glow) { c.fillStyle = 'rgba(200,170,140,0.18)'; c.beginPath(); c.ellipse(cx - 2 * sc, top + 9 * sc, 5 * sc, 7 * sc, 0, 0, TAU); c.fill(); }
    };
    const contents = () => {
      if (s.person) {
        if (office) silhouette(gx + gw * 0.55, gy + gh * 0.3, 0.9);
        else silhouette(gx + gw * 0.52, gy + gh * (s.st === 'french' ? 0.22 : 0.4), s.st === 'french' ? 1.15 : 0.95);
      }
      if (s.cat) {
        const cx = gx + gw * 0.3, by = gy + gh - 2;
        c.fillStyle = glow ? '#050403' : '#24201e';
        c.beginPath(); c.ellipse(cx, by - 10, 11, 10, 0, 0, TAU); c.fill();
        c.beginPath(); c.arc(cx + 1, by - 25, 7, 0, TAU); c.fill();
        c.beginPath(); c.moveTo(cx - 6, by - 28); c.lineTo(cx - 5, by - 37); c.lineTo(cx - 1, by - 31); c.fill();
        c.beginPath(); c.moveTo(cx + 3, by - 31); c.lineTo(cx + 7, by - 37); c.lineTo(cx + 8, by - 28); c.fill();
        c.strokeStyle = c.fillStyle; c.lineWidth = 3; c.lineCap = 'round'; c.beginPath(); c.moveTo(cx + 10, by - 4); c.quadraticCurveTo(cx + 22, by - 2, cx + 20, by - 14); c.stroke();
      }
      if (s.plant && !office) {
        const px = gx + gw * 0.7, by = gy + gh;
        c.fillStyle = glow ? '#060403' : '#9a5236'; c.beginPath(); c.moveTo(px - 8, by - 14); c.lineTo(px + 8, by - 14); c.lineTo(px + 6, by); c.lineTo(px - 6, by); c.fill();
        for (let k = 0; k < 9; k++) { c.fillStyle = glow ? '#060805' : (k % 2 ? '#3e6e2e' : '#5a8a3a'); c.beginPath(); c.ellipse(px + (r() - 0.5) * 22, by - 22 - r() * 18, 5, 9, (r() - 0.5) * 2, 0, TAU); c.fill(); }
      }
      if (s.sheer) { c.fillStyle = glow ? 'rgba(255,236,200,0.35)' : 'rgba(236,232,224,0.42)'; c.fillRect(gx, gy, gw, gh); for (let x = gx; x < gx + gw; x += 7) { c.fillStyle = glow ? 'rgba(255,240,210,0.2)' : 'rgba(255,255,255,0.18)'; c.fillRect(x, gy, 3, gh); } }
      if (s.cur) {
        const col = s.cur, pw = s.open ? gw * 0.24 : gw * 0.5;
        const panel = (x0, w, dir) => {
          for (let x = 0; x < w; x += 2) {
            const k = 0.72 + 0.28 * Math.sin((x / 6.5) * PI);
            c.fillStyle = glow ? css(mixHex(col, 0xffc070, 0.45), 0.55 + 0.4 * k) : css(col, 0.55 + 0.4 * k);
            c.fillRect(dir > 0 ? x0 + x : x0 - x - 2, gy, 2, gh);
          }
          if (s.open) { c.fillStyle = glow ? 'rgba(0,0,0,0.5)' : css(col, 0.4); c.fillRect(dir > 0 ? x0 : x0 - w, gy + gh * 0.6, w, 3); }
        };
        panel(gx, pw, 1); panel(gx + gw, pw, -1);
        c.fillStyle = glow ? '#000' : 'rgba(0,0,0,0.35)'; c.fillRect(gx, gy, gw, 3);
      }
      if (s.blinds) {
        const bh = gh * s.blinds;
        for (let y = gy; y < gy + bh; y += 4) {
          c.fillStyle = glow ? (office ? '#a8b4c0' : '#d8a868') : (office ? 'rgba(200,204,206,0.85)' : '#d6d2c6'); c.fillRect(gx, y, gw, 3);
          c.fillStyle = glow ? 'rgba(0,0,0,0.6)' : 'rgba(80,76,70,0.6)'; c.fillRect(gx, y + 3, gw, 1);
        }
      }
    };
    const reflect = () => {
      if (glow) return;
      c.save(); c.beginPath(); c.rect(gx, gy, gw, gh); c.clip();
      const g = c.createLinearGradient(0, gy, 0, gy + gh);
      g.addColorStop(0, office ? 'rgba(215,232,242,0.38)' : 'rgba(200,215,230,0.42)'); g.addColorStop(0.55, 'rgba(150,170,190,0.1)'); g.addColorStop(1, 'rgba(40,50,60,0.16)');
      c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
      c.translate(gx + gw / 2, gy + gh / 2); c.rotate(-0.65);
      const o = (r() - 0.5) * 60;
      for (const [x, wd, a] of [[o - 30, 26, 0.16], [o + 4, 8, 0.12], [o + 40, 40, 0.07]]) {
        const sg = c.createLinearGradient(x, 0, x + wd, 0);
        sg.addColorStop(0, 'rgba(255,255,255,0)'); sg.addColorStop(0.5, `rgba(255,255,255,${a})`); sg.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = sg; c.fillRect(x, -200, wd, 400);
      }
      c.restore();
    };
    const box4 = (ft, col) => { frame(X0, Y0, Wd, ft, col); frame(X0, Y0 + Ht - ft, Wd, ft, col); frame(X0, Y0, ft, Ht, col); frame(X0 + Wd - ft, Y0, ft, Ht, col); };
    if (s.st === 'sash' || s.st === 'barred') {
      const ft = 6;
      gx = X0 + ft; gy = Y0 + ft; gw = Wd - 2 * ft; gh = Ht - 2 * ft;
      room(); contents(); reflect();
      box4(ft, s.fr);
      frame(X0, Y0 + Ht / 2 - 3, Wd, 7, s.fr);
      frame(X0 + ft, Y0 + ft, 3, Ht - 2 * ft, s.fr); frame(X0 + Wd - ft - 3, Y0 + ft, 3, Ht - 2 * ft, s.fr);
      if (s.mun) { frame(X0 + Wd / 2 - 1, Y0 + ft, 2.5, Ht - 2 * ft, s.fr); frame(X0 + ft, Y0 + Ht / 4, Wd - 2 * ft, 2, s.fr); frame(X0 + ft, Y0 + Ht * 0.75, Wd - 2 * ft, 2, s.fr); }
      if (s.st === 'barred') {
        c.fillStyle = glow ? '#000' : '#1e1e1e';
        c.fillRect(X0, Y0 + Ht * 0.35, Wd, 3); c.fillRect(X0, Y0 + Ht - 8, Wd, 3);
        for (let x = X0 + 8; x < X0 + Wd - 4; x += 12) c.fillRect(x, Y0 + Ht * 0.35, 3, Ht * 0.65);
      }
    } else if (s.st === 'case') {
      const ft = 5;
      gx = X0 + ft; gy = Y0 + ft; gw = Wd - 2 * ft; gh = Ht - 2 * ft;
      room(); contents(); reflect();
      box4(ft, s.fr);
      frame(X0, Y0 + Ht * 0.24, Wd, 4, s.fr); frame(X0 + Wd / 2 - 2, Y0 + Ht * 0.24, 4, Ht * 0.76, s.fr);
      if (!glow) { c.fillStyle = '#a8a8a8'; c.fillRect(X0 + Wd / 2 - 8, Y0 + Ht * 0.6, 3, 8); c.fillRect(X0 + Wd / 2 + 5, Y0 + Ht * 0.6, 3, 8); }
    } else if (s.st === 'french') {
      const ft = 5;
      gx = X0 + ft; gy = Y0 + ft; gw = Wd - 2 * ft; gh = Ht - 2 * ft;
      room(); contents(); reflect();
      box4(ft, s.fr);
      frame(X0 + Wd / 2 - 3, Y0, 6, Ht, s.fr);
      frame(X0, Y0 + Ht * 0.8, Wd, Ht * 0.2, s.fr);
      if (!glow) { c.fillStyle = 'rgba(0,0,0,0.18)'; c.fillRect(X0 + 10, Y0 + Ht * 0.83, Wd / 2 - 18, Ht * 0.13); c.fillRect(X0 + Wd / 2 + 8, Y0 + Ht * 0.83, Wd / 2 - 18, Ht * 0.13); }
      for (const k of [1, 2]) frame(X0 + ft, Y0 + Ht * 0.8 * k / 3, Wd - 2 * ft, 2, s.fr);
      if (!glow) { c.fillStyle = '#c8b070'; c.fillRect(X0 + Wd / 2 - 9, Y0 + Ht * 0.5, 3, 10); c.fillRect(X0 + Wd / 2 + 6, Y0 + Ht * 0.5, 3, 10); }
    } else if (s.st === 'cw') {
      gx = 0; gy = 0; gw = cw; gh = ch * 0.76;
      room(); contents(); reflect();
      // spandrel: opaque glass over the slab edge
      if (glow) { c.fillStyle = '#000'; c.fillRect(0, gh, cw, ch - gh); } else {
        const g = c.createLinearGradient(0, gh, 0, ch); g.addColorStop(0, '#34444e'); g.addColorStop(1, '#222c33');
        c.fillStyle = g; c.fillRect(0, gh, cw, ch - gh);
        c.fillStyle = 'rgba(200,220,230,0.12)'; c.fillRect(0, gh + 4, cw, 6);
      }
      frame(0, 0, 3, ch, AL); frame(cw - 3, 0, 3, ch, AL); frame(cw / 2 - 1.5, 0, 3, gh, AL);
      frame(0, gh - 1.5, cw, 3.5, AL); frame(0, 0, cw, 2, AL); frame(0, ch - 2, cw, 2, AL);
    } else if (s.st === 'rib') {
      const ft = 4;
      gx = X0 + ft; gy = Y0 + ft; gw = Wd - 2 * ft; gh = Ht - 2 * ft;
      room(); contents(); reflect();
      box4(ft, s.fr);
      frame(X0 + Wd / 2 - 2, Y0, 4, Ht, s.fr); frame(X0, Y0 + Ht * 0.82, Wd, 3, s.fr);
    } else if (s.st === 'lobby' || s.st === 'side') {
      // lobby: wood or stone back wall, a pendant light, a plant, brass mailboxes
      const rc = s.room;
      if (glow) {
        const g = c.createLinearGradient(0, gy, 0, gy + gh); g.addColorStop(0, s.cool ? '#f0f4ff' : '#ffe6b8'); g.addColorStop(1, s.cool ? '#a8b0c0' : '#c89058');
        c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
      } else {
        const g = c.createLinearGradient(0, gy, 0, gy + gh); g.addColorStop(0, css(rc, 0.4)); g.addColorStop(0.85, css(rc, 0.6)); g.addColorStop(0.86, '#8a8478'); g.addColorStop(1, '#6a665e');
        c.fillStyle = g; c.fillRect(gx, gy, gw, gh);
      }
      c.fillStyle = glow ? 'rgba(255,250,230,1)' : 'rgba(240,226,190,0.8)'; c.beginPath(); c.ellipse(gx + gw * 0.5, gy + gh * 0.22, 9, 5, 0, 0, TAU); c.fill();
      c.fillStyle = glow ? 'rgba(20,14,8,0.9)' : 'rgba(20,14,8,0.5)'; c.fillRect(gx + gw * 0.5 - 0.5, gy, 1, gh * 0.18);
      c.fillStyle = glow ? 'rgba(120,90,40,0.9)' : 'rgba(170,140,70,0.75)'; c.fillRect(gx + gw * 0.62, gy + gh * 0.4, gw * 0.22, gh * 0.22);
      for (let k = 0; k < 8; k++) { c.fillStyle = glow ? '#060805' : (k % 2 ? '#3e6e2e' : '#5a8a3a'); c.beginPath(); c.ellipse(gx + gw * 0.2 + (r() - 0.5) * 16, gy + gh * 0.68 - r() * 22, 6, 11, (r() - 0.5) * 2, 0, TAU); c.fill(); }
      c.fillStyle = glow ? '#050403' : '#4a3a30'; c.fillRect(gx + gw * 0.2 - 6, gy + gh * 0.74, 12, gh * 0.12);
      reflect();
      const ft = 5, fc = s.fr;
      frame(X0, Y0, Wd, ft, fc); frame(X0, Y0, ft, Ht, fc); frame(X0 + Wd - ft, Y0, ft, Ht, fc); frame(X0, Y0 + Ht - 3, Wd, 3, fc);
      frame(X0, Y0 + Ht * 0.24, Wd, 4, fc);
      if (s.st === 'lobby') {
        const dw = Wd * 0.28, dx0 = X0 + Wd / 2 - dw;
        for (const x of [dx0, dx0 + dw]) { frame(x, Y0 + Ht * 0.24, 4, Ht * 0.76, fc); frame(x + dw - 4, Y0 + Ht * 0.24, 4, Ht * 0.76, fc); frame(x, Y0 + Ht - 9, dw, 9, fc); }
        if (!glow) { c.fillStyle = '#c8b480'; c.fillRect(dx0 + 6, Y0 + Ht * 0.62, dw - 12, 3); c.fillRect(dx0 + dw + 6, Y0 + Ht * 0.62, dw - 12, 3); }
      }
    }
  }
  function drawWinAtlas(c, glow) {
    WIN.forEach((s, i) => {
      const rr = rng(1000 + i * 17);
      c.save(); c.translate((i % 8) * WIN_CW, Math.floor(i / 8) * WIN_CH);
      c.beginPath(); c.rect(0, 0, WIN_CW, WIN_CH); c.clip();
      drawWinCell(c, s, glow, rr);
      c.restore();
    });
    // iron railing: top, middle and bottom rails, bars every 6 px (32 px per meter)
    const a0 = RAIL_V[0];
    if (!glow) {
      c.clearRect(0, a0, WIN_W, 32);
      c.fillStyle = '#1c1c1c'; c.fillRect(0, a0, WIN_W, 3); c.fillRect(0, a0 + 28, WIN_W, 3); c.fillRect(0, a0 + 21, WIN_W, 1.5);
      for (let x = 1; x < WIN_W; x += 6) { c.fillStyle = '#202020'; c.fillRect(x, a0, 2.4, 31); c.fillStyle = 'rgba(160,160,160,0.5)'; c.fillRect(x, a0, 0.8, 31); }
      c.fillStyle = 'rgba(140,140,140,0.6)'; c.fillRect(0, a0, WIN_W, 1);
    } else { c.fillStyle = '#000'; c.fillRect(0, a0, WIN_W, 32); }
    // glass balcony panels with an aluminum cap and posts
    const b0 = GLASSRAIL_V[0];
    if (!glow) {
      const g = c.createLinearGradient(0, b0, 0, b0 + 32); g.addColorStop(0, '#c4d2d8'); g.addColorStop(0.5, '#93a8b2'); g.addColorStop(1, '#6e848e');
      c.fillStyle = g; c.fillRect(0, b0, WIN_W, 32);
      for (let x = 0; x < WIN_W; x += 64) {
        c.fillStyle = '#2c3034'; c.fillRect(x, b0, 3, 32);
        const s2 = c.createLinearGradient(x + 10, 0, x + 40, 0); s2.addColorStop(0, 'rgba(255,255,255,0)'); s2.addColorStop(0.5, 'rgba(255,255,255,0.25)'); s2.addColorStop(1, 'rgba(255,255,255,0)');
        c.fillStyle = s2; c.fillRect(x + 10, b0 + 3, 30, 29);
      }
      c.fillStyle = '#c8ccd0'; c.fillRect(0, b0, WIN_W, 3); c.fillStyle = '#3a3e42'; c.fillRect(0, b0 + 30, WIN_W, 2);
    } else { c.fillStyle = '#000'; c.fillRect(0, b0, WIN_W, 32); }
  }
  const winAtlas = () => canvasTex('cityWinAtlas', WIN_W, WIN_W, (c) => drawWinAtlas(c, false), { srgb: true, clamp: true });
  const winGlowAtlas = () => canvasTex('cityWinGlow', 512, 512, (c) => { c.scale(0.5, 0.5); drawWinAtlas(c, true); }, { srgb: true, clamp: true });

  /* the window material: the 'glow' attribute holds a random number per window (0 = never lights); at night a window
     lights when a hash of that number and the building's position passes, so every building gets its own pattern.
     glow >= 1 means always lit at night (lobbies, the window with someone looking out). */
  let winMatObj = null;
  function winMat() {
    if (winMatObj) return winMatObj;
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: winAtlas(), emissive: new THREE.Color(1, 1, 1), emissiveMap: winGlowAtlas(), alphaTest: 0.5, side: THREE.DoubleSide });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.envNight = nightU;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float envNight;\nattribute float glow;\nvarying float vCityGlow;\nvoid main() {')
        .replace('#include <color_vertex>', `#include <color_vertex>
  {
    vec4 cb = vec4(0.0, 0.0, 0.0, 1.0);
    #ifdef USE_INSTANCING
    cb = instanceMatrix * cb;
    #endif
    cb = modelMatrix * cb;
    float sd = fract(glow);
    vec3 p3 = fract(vec3(cb.x * 0.0173 + sd * 3.71, cb.z * 0.0191 + sd * 7.13, sd * 11.3 + cb.x * 0.0071 - cb.z * 0.0053) * vec3(443.897, 441.423, 437.195));
    p3 += dot(p3, p3.yzx + 19.19);
    float h = fract((p3.x + p3.y) * p3.z);
    float on = glow >= 1.0 ? 1.0 : (glow > 0.0 ? step(0.52, h) : 0.0);
    vCityGlow = on * envNight * (0.62 + 0.55 * fract(h * 7.31));
  }`);
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vCityGlow;\nvoid main() {')
        .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vCityGlow;');
    };
    m.customProgramCacheKey = () => 'cityWindows';
    winMatObj = m;
    return m;
  }
  /* ============================================================
     Tower kit. A building is built into three buckets: wall (the wall texture), win (window atlas) and trim
     (concrete texture, vertex colors). Faces are built in face local coordinates (x across the face, centered, y up,
     the face plane at z = 0 facing +z) and placed with the face matrix.
     Window openings are real holes in the wall; the window sits 0.14 m back. Behind the walls a core box (reveal
     colored) at the window depth makes the openings read as deep from every angle.
     ============================================================ */
  const REVEAL = L(0x5a534c), DARK = L(0x161412), IRON = L(0x232220), STEEL = L(0x8a9096), TAR = L(0x4a4846);
  function newB(seed, wallKey) { return { wall: Acc(), win: Acc(), trim: Acc(), r: rng(seed), balconies: [], wallKey, deep: {} }; }
  function tierFaces(cx, cz, hw, hd) {
    return [
      { name: 'front', W: 2 * hw, ry: 0, M: faceMatrix(0, cx, cz + hd) },
      { name: 'right', W: 2 * hd, ry: HP, M: faceMatrix(HP, cx + hw, cz) },
      { name: 'back', W: 2 * hw, ry: PI, M: faceMatrix(PI, cx, cz - hd) },
      { name: 'left', W: 2 * hd, ry: -HP, M: faceMatrix(-HP, cx - hw, cz) },
    ];
  }
  // wall color with soot near the ground and slow streaky variation (object space)
  function grime(base, amt = 1, seed = 0) {
    return (x, y, z) => {
      const n = fbm(x * 0.11 + 7 + seed, y * 0.045, z * 0.11 - 3 + seed, 2);
      return mulc(base, 1 - amt * (0.13 * (1 - smooth(0, 3.5, y)) + 0.09 * n + 0.04));
    };
  }
  // wall quads with rectangular holes, merged into horizontal runs
  function holedWall(acc, W, y0, y1, holes, col) {
    const xs = [-W / 2, W / 2], ys = [y0, y1];
    for (const h of holes) { xs.push(h.x0, h.x1); ys.push(h.y0, h.y1); }
    const X = [...new Set(xs.map((v) => Math.round(v * 1e4) / 1e4))].filter((v) => v >= -W / 2 - 1e-6 && v <= W / 2 + 1e-6).sort((a, b) => a - b);
    const Y = [...new Set(ys.map((v) => Math.round(v * 1e4) / 1e4))].filter((v) => v >= y0 - 1e-6 && v <= y1 + 1e-6).sort((a, b) => a - b);
    for (let j = 0; j + 1 < Y.length; j++) {
      const ya = Y[j], yb = Y[j + 1], ym = (ya + yb) / 2;
      if (yb - ya < 1e-4) continue;
      const row = holes.filter((h) => ym > h.y0 && ym < h.y1);
      let run = null;
      const flush = () => { if (run) acc.quad([run[0], ya, 0], [run[1], ya, 0], [run[1], yb, 0], [run[0], yb, 0], col); run = null; };
      for (let i = 0; i + 1 < X.length; i++) {
        const xa = X[i], xb = X[i + 1], xm = (xa + xb) / 2;
        if (xb - xa < 1e-4) continue;
        if (row.some((h) => xm > h.x0 && xm < h.x1)) flush();
        else if (run) run[1] = xb; else run = [xa, xb];
      }
      flush();
    }
  }
  // window seed for the glow attribute: who is home at night
  const seedOf = (B, cell) => (PERSON.has(cell) ? 1.5 : cell === W_LOBBY || cell === W_SIDE || cell === W_OLOBBY ? 1.2 : cell === W_SERVICE || cell === W_LOUVER ? 0 : 0.02 + B.r() * 0.96);
  /* one face: wall with holes, the windows in them, optional sills and lintels (o.acc: build the wall into trim instead).
     A hole with rec deeper than the face's is a recess (an entrance or the storefront bay): it gets side walls, a
     ceiling and a floor in trim, and must be passed to core() so the core has an opening there too.
     Holes record their face name in B.deep. */
  function face(B, F, y0, y1, holes, o = {}) {
    const acc = o.acc || B.wall, rec = o.rec == null ? 0.14 : o.rec;
    acc.setM(F.M); holedWall(acc, F.W, y0, y1, holes, o.col || [1, 1, 1]);
    B.win.setM(F.M); B.trim.setM(F.M);
    for (const h of holes) {
      const hr = h.rec == null ? rec : h.rec;
      if (hr > rec + 0.01) {
        (B.deep[F.name] = B.deep[F.name] || []).push(h);
        const vc = h.vest || REVEAL, z = -hr;
        B.trim.quad([h.x0, h.y0, 0], [h.x0, h.y0, z], [h.x0, h.y1, z], [h.x0, h.y1, 0], mulc(vc, 0.85));
        B.trim.quad([h.x1, h.y0, z], [h.x1, h.y0, 0], [h.x1, h.y1, 0], [h.x1, h.y1, z], mulc(vc, 0.85));
        B.trim.quad([h.x0, h.y1, z], [h.x1, h.y1, z], [h.x1, h.y1, 0], [h.x0, h.y1, 0], mulc(vc, 0.6));
        B.trim.quad([h.x0, h.y0 + 0.012, 0], [h.x1, h.y0 + 0.012, 0], [h.x1, h.y0 + 0.012, z], [h.x0, h.y0 + 0.012, z], h.floor || L(0x8a857c));
        if (h.cell == null) B.trim.quad([h.x0, h.y0, z], [h.x1, h.y0, z], [h.x1, h.y1, z], [h.x0, h.y1, z], h.back || DARK);
      }
      if (h.cell != null) {
        const uv = winCellUV(h.cell), z = -hr + 0.004, mg = hr > rec + 0.01 ? 0 : 0.03;
        B.win.quad([h.x0 - mg, h.y0 - mg, z], [h.x1 + mg, h.y0 - mg, z], [h.x1 + mg, h.y1 + mg, z], [h.x0 - mg, h.y1 + mg, z], [1, 1, 1], uv, h.glow == null ? seedOf(B, h.cell) : h.glow);
      }
      if (o.sill && h.sill !== false) B.trim.box(h.x0 - 0.08, h.x1 + 0.08, h.y0 - 0.075, h.y0, -0.02, 0.07, o.sill, 'tf');
      if (o.lintel && h.lintel !== false) B.trim.box(h.x0 - 0.1, h.x1 + 0.1, h.y1, h.y1 + 0.26, -0.02, 0.025, o.lintel, 'f');
      if (o.box && h.box) flowerBox(B, (h.x0 + h.x1) / 2, h.x1 - h.x0, h.y0);
      if (o.ac && h.ac) acWindow(B, (h.x0 + h.x1) / 2 + 0.15 * (B.r() - 0.5), h.y0 + 0.05);
    }
    acc.setM(null); B.win.setM(null); B.trim.setM(null);
  }
  // window holes for rows of windows: xs centers, ys sill heights
  function grid(B, xs, ys, ww, wh, cells, o = {}) {
    const out = [];
    for (const y of ys) for (const x of xs) {
      const h = { x0: x - ww / 2, x1: x + ww / 2, y0: y, y1: y + wh, cell: typeof cells === 'number' ? cells : pick(B.r, cells) };
      if (o.box && B.r() < o.box) h.box = 1;
      if (o.ac && B.r() < o.ac) h.ac = 1;
      out.push(h);
    }
    return out;
  }
  const spread = (W, n, edge) => Array.from({ length: n }, (_, i) => -W / 2 + edge + (W - 2 * edge) * (i + 0.5) / n);
  const paired = (W, n, edge, gap) => spread(W, n, edge).flatMap((x) => [x - gap / 2, x + gap / 2]);
  const floorsAt = (y0, n, fh, sill) => Array.from({ length: n }, (_, i) => y0 + i * fh + sill);
  // the core box behind the walls (at the window depth), with openings for the recesses recorded in B.deep
  function core(B, cx, cz, hw, hd, y0, y1, rec = 0.14) {
    for (const F of tierFaces(cx, cz, hw - rec, hd - rec)) {
      const holes = (B.deep[F.name] || []).filter((h) => h.y1 > y0 && h.y0 < y1);
      B.trim.setM(F.M); holedWall(B.trim, F.W, y0, y1, holes, REVEAL);
    }
    B.trim.setM(null);
    B.deep = {};
  }
  // flat roof deck with a parapet: the parapet's outer face comes from the wall faces; this adds the inner faces and coping
  function roofParapet(B, cx, cz, hw, hd, y, ph, o = {}) {
    const t = 0.25, col = o.col || [1, 1, 1], cop = o.coping || L(0xb8b2a8);
    B.trim.setM(null).quad([cx - hw, y, cz + hd], [cx + hw, y, cz + hd], [cx + hw, y, cz - hd], [cx - hw, y, cz - hd], (x, yy, z) => mulc(TAR, 0.9 + 0.2 * fbm(x * 0.3, 1, z * 0.3, 2)));
    if (ph <= 0) return;
    for (const F of tierFaces(cx, cz, hw, hd)) {
      B.wall.setM(F.M).quad([F.W / 2 - t, y, -t], [-F.W / 2 + t, y, -t], [-F.W / 2 + t, y + ph, -t], [F.W / 2 - t, y + ph, -t], mulc(col, 0.85));
      B.trim.setM(F.M).box(-F.W / 2, F.W / 2, y + ph, y + ph + 0.1, -t - 0.04, 0.05, cop, 'tfk');
    }
    B.trim.setM(null); B.wall.setM(null);
  }
  // stacked cornice: a frieze, an overhanging corona with brackets under it, a cap
  function cornice(B, faces, y, o) {
    const col = o.col, out = o.out, fr = o.frieze || 0.5, ch = o.h || 0.3;
    for (const F of faces) {
      const W = F.W;
      B.trim.setM(F.M);
      B.trim.box(-W / 2 - 0.06, W / 2 + 0.06, y, y + fr, -0.02, 0.06, mulc(col, 0.97), 'fb');
      B.trim.box(-W / 2 - out, W / 2 + out, y + fr, y + fr + ch, -0.02, out, col, 'tfblr');
      B.trim.box(-W / 2 - out * 0.5, W / 2 + out * 0.5, y + fr - 0.1, y + fr, -0.02, out * 0.5, mulc(col, 0.92), 'fb');
      if (o.brackets) for (let x = -W / 2 + o.brackets * 0.5; x < W / 2 - 0.2; x += o.brackets) B.trim.box(x - 0.08, x + 0.08, y + fr - 0.42, y + fr, 0.06, out * 0.85, mulc(col, 0.9), 'fblr');
      if (o.dentils) for (let x = -W / 2 + 0.15; x < W / 2 - 0.1; x += 0.3) B.trim.box(x - 0.06, x + 0.06, y + fr * 0.55, y + fr * 0.8, 0.05, 0.13, mulc(col, 0.95), 'fb');
    }
    B.trim.setM(null);
  }
  // thin horizontal lines across a face (rustication grooves, panel joints) that stop at the openings
  function grooves(B, F, holes, ys, h, col, out = 0.006) {
    B.trim.setM(F.M);
    for (const y of ys) {
      let segs = [[-F.W / 2, F.W / 2]];
      for (const hl of holes) if (y + h > hl.y0 - 0.08 && y < hl.y1 + 0.03) segs = segs.flatMap(([a, b]) => (hl.x1 + 0.1 <= a || hl.x0 - 0.1 >= b) ? [[a, b]] : [[a, hl.x0 - 0.1], [hl.x1 + 0.1, b]].filter(([p, q]) => q - p > 0.02));
      for (const [a, b] of segs) B.trim.box(a, b, y, y + h, -0.005, out, col, 'f');
    }
    B.trim.setM(null);
  }
  // a horizontal band (string course) around a tier
  function band(B, faces, y, h, out, col) {
    for (const F of faces) B.trim.setM(F.M).box(-F.W / 2 - out, F.W / 2 + out, y, y + h, -0.02, out, col, 'tfblr');
    B.trim.setM(null);
  }
  // flower box under a window (face local)
  function flowerBox(B, x, w, y) {
    const r = B.r;
    B.trim.box(x - w / 2 - 0.05, x + w / 2 + 0.05, y - 0.32, y - 0.08, 0.02, 0.26, L(pick(r, [0x5a3a24, 0x2e4a3a, 0xe8e4dc, 0x7a2a22])), 'tfblr');
    const fl = [0xe0405a, 0xf2c83a, 0xf4f0f0, 0xd05aa0, 0xe8603a, 0x9a6ad8];
    for (let k = 0; k < 4; k++) {
      const fx = x - w / 2 + (k + 0.5) * w / 4;
      B.trim.geo(ico(0.17, 0, fx, y - 0.02 + r() * 0.05, 0.15 + r() * 0.06, L(0x3e6a2c), 1, 0.7, 0.9));
      for (let f = 0; f < 2; f++) B.trim.geo(paint(prep(new THREE.OctahedronGeometry(0.075, 0)), L(pick(r, fl))).translate(fx + (f - 0.5) * 0.12, y + 0.07 + r() * 0.05, 0.2 + r() * 0.05));
    }
  }
  // window air conditioner sticking out under a sash
  function acWindow(B, x, y) {
    B.trim.box(x - 0.33, x + 0.33, y, y + 0.42, -0.1, 0.38, L(0xd8d4cc), 'tfblr');
    B.trim.box(x - 0.28, x + 0.28, y + 0.06, y + 0.36, 0.38, 0.39, L(0x8a8a86), 'f');
  }
  // iron fire escape on a face: a landing at every floor, steep stairs between them, a drop ladder at the bottom
  function fireEscape(B, F, xc, w, ys, dep = 1.15, drop = 2.4) {
    drop = Math.min(drop, ys[0] - 2.3);   // the drop ladder stays above people's heads
    B.trim.setM(F.M); B.win.setM(F.M);
    const x0 = xc - w / 2, x1 = xc + w / 2, rh = 1.0;
    ys.forEach((y, i) => {
      const sp = new V3(x0 + 0.5, y, dep * 0.55).applyMatrix4(F.M);
      B.balconies.push({ x: +sp.x.toFixed(3), y: +sp.y.toFixed(3), z: +sp.z.toFixed(3), yaw: +F.ry.toFixed(4), fireEscape: true });
      // grating and rails (bar strip), handrails and brackets
      B.win.quad([x0, y, dep], [x1, y, dep], [x1, y, 0.04], [x0, y, 0.04], [1, 1, 1], stripUV(RAIL_V, w), 0);
      B.win.quad([x0, y, dep], [x1, y, dep], [x1, y + rh, dep], [x0, y + rh, dep], [1, 1, 1], stripUV(RAIL_V, w, 3), 0);
      B.win.quad([x0, y, 0.04], [x0, y, dep], [x0, y + rh, dep], [x0, y + rh, 0.04], [1, 1, 1], stripUV(RAIL_V, dep, 7), 0);
      B.win.quad([x1, y, dep], [x1, y, 0.04], [x1, y + rh, 0.04], [x1, y + rh, dep], [1, 1, 1], stripUV(RAIL_V, dep, 9), 0);
      B.trim.box(x0, x1, y - 0.1, y, dep - 0.05, dep, IRON, 'fb');
      B.trim.box(x0 - 0.02, x1 + 0.02, y + rh - 0.03, y + rh + 0.02, dep - 0.03, dep + 0.02, IRON, 'tfb');
      for (const s of [x0 + 0.3, x1 - 0.3]) B.trim.geo(K.beam(0.02, y - 0.9, dep - 0.1, y - 0.05, 0, 0.06, 0.06, IRON, 'z').translate(s, 0, 0));
      // stairs up to the next landing
      if (i + 1 < ys.length) {
        const yb = ys[i + 1], sx0 = x0 + 0.25, sx1 = x1 - 0.6, sz0 = 0.1, sz1 = 0.72;
        B.win.quad([sx0, y, sz1], [sx1, yb, sz1], [sx1, yb, sz0], [sx0, y, sz0], [1, 1, 1], stripUV(RAIL_V, Math.hypot(sx1 - sx0, yb - y) * 0.6, 11), 0);
        for (const z of [sz0, sz1]) B.trim.geo(K.beam(sx0, y, sx1, yb, z, 0.12, 0.03, IRON));
        B.trim.geo(K.beam(sx0, y + 0.9, sx1, yb + 0.9, sz1 + 0.02, 0.04, 0.04, IRON));
      }
    });
    // drop ladder under the lowest landing
    const y = ys[0], lx = x1 - 0.45, lz = dep - 0.35;
    for (const s of [-0.22, 0.22]) B.trim.box(lx + s - 0.025, lx + s + 0.025, y - drop, y, lz - 0.025, lz + 0.025, IRON, 'fklr');
    for (let k = 1; k * 0.3 < drop; k++) B.trim.box(lx - 0.22, lx + 0.22, y - k * 0.3 - 0.02, y - k * 0.3 + 0.02, lz - 0.02, lz + 0.02, IRON, 'tf');
    B.trim.setM(null); B.win.setM(null);
  }
  // projecting balcony with glass or iron rails, and a spot for a pet (face local x, floor y)
  function balcony(B, F, xc, w, y, dep, o = {}) {
    const x0 = xc - w / 2, x1 = xc + w / 2, rows = o.glass ? GLASSRAIL_V : RAIL_V, rh = 1.05, r = B.r;
    B.trim.setM(F.M); B.win.setM(F.M);
    B.trim.box(x0, x1, y - 0.2, y, -0.02, dep, o.slab || L(0xd8d4cc), 'tbflr');
    B.win.quad([x0 + 0.03, y, dep - 0.04], [x1 - 0.03, y, dep - 0.04], [x1 - 0.03, y + rh, dep - 0.04], [x0 + 0.03, y + rh, dep - 0.04], [1, 1, 1], stripUV(rows, w), 0);
    B.win.quad([x0 + 0.03, y, 0.02], [x0 + 0.03, y, dep - 0.04], [x0 + 0.03, y + rh, dep - 0.04], [x0 + 0.03, y + rh, 0.02], [1, 1, 1], stripUV(rows, dep, 5), 0);
    B.win.quad([x1 - 0.03, y, dep - 0.04], [x1 - 0.03, y, 0.02], [x1 - 0.03, y + rh, 0.02], [x1 - 0.03, y + rh, dep - 0.04], [1, 1, 1], stripUV(rows, dep, 9), 0);
    if (!o.glass) B.trim.box(x0, x1, y + rh, y + rh + 0.05, dep - 0.08, dep, IRON, 'tf');
    const p = new V3(xc + (o.spotX || 0), y, dep * 0.5).applyMatrix4(F.M);
    B.balconies.push({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), yaw: +F.ry.toFixed(4) });
    if (o.stuff) {
      const k = Math.floor(r() * 3);
      if (k !== 1) { bistroChair(B, x0 + 0.55, y, dep * 0.45, 0.4 + r() * 0.4); if (w > 3) bistroChair(B, x0 + 1.25, y, dep * 0.5, -0.3); }
      if (k !== 2) potPlant(B, x1 - 0.4, y, 0.32, 0.8 + r() * 0.5, r);
      if (k === 1) potPlant(B, x0 + 0.45, y, dep * 0.6, 0.6, r);
      if (k === 0 && w > 3) { B.trim.geo(cyl(0.25, 0.25, 0.03, 10, x0 + 0.9, y + 0.7, dep * 0.45, L(0x2a2a2a))); B.trim.geo(cyl(0.02, 0.02, 0.7, 4, x0 + 0.9, y, dep * 0.45, L(0x2a2a2a))); }
    }
    B.trim.setM(null); B.win.setM(null);
  }
  function bistroChair(B, x, y, z, ry) {
    const c = L(0x2c3a34), M0 = B.trim.getM(), M = new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z);
    B.trim.setM(M0 ? M0.clone().multiply(M) : M);
    B.trim.box(-0.21, 0.21, 0.43, 0.47, -0.2, 0.2, c, 'tbflrk'); B.trim.box(-0.21, 0.21, 0.47, 0.84, -0.2, -0.17, c, 'tfklr');
    B.trim.box(-0.2, 0.2, 0, 0.43, 0.15, 0.18, c, 'fk'); B.trim.box(-0.2, 0.2, 0, 0.43, -0.19, -0.16, c, 'fk');
    B.trim.setM(M0);
  }
  function potPlant(B, x, y, z, s, r) {
    B.trim.geo(lathe([[0, 0], [0.14, 0], [0.18, 0.3], [0, 0.31]], 6, L(pick(r, [0xb8603a, 0x8a8478, 0x3a3a3a]))).scale(s, s, s).translate(x, y, z));
    for (let k = 0; k < 2; k++) B.trim.geo(ico(0.22 * s, 0, x + (r() - 0.5) * 0.15 * s, y + (0.48 + k * 0.17) * s, z + (r() - 0.5) * 0.15 * s, mulc(L(0x3e6a2c), 0.8 + r() * 0.4), 1, 1.1, 1));
  }
  // curtain wall: a grid of glass panels flush with the face (no wall behind), optional fins at the joints
  function curtain(B, F, y0, n, fh, pw, cells, o = {}) {
    const k = Math.max(1, Math.round(F.W / pw)), w = F.W / k, r = B.r;
    B.win.setM(F.M);
    for (let f = 0; f < n; f++) for (let i = 0; i < k; i++) {
      const x0 = -F.W / 2 + i * w, y = y0 + f * fh, cell = typeof cells === 'number' ? cells : pick(r, cells);
      B.win.quad([x0, y, 0], [x0 + w, y, 0], [x0 + w, y + fh, 0], [x0, y + fh, 0], [1, 1, 1], winCellUV(cell), o.dark ? 0 : seedOf(B, cell));
    }
    if (o.fins) {
      B.trim.setM(F.M);
      for (let i = 0; i <= k; i += o.finEvery || 1) { const x = -F.W / 2 + i * w; B.trim.box(x - 0.07, x + 0.07, y0, y0 + n * fh, 0, o.fins, o.finCol || L(0xb8bec4), 'tfblr'); }
    }
    B.win.setM(null); B.trim.setM(null);
  }
  // fabric or concrete entrance canopy, cantilevered with tie rods (face local)
  function canopy(B, F, xc, w, y, dep, col, fabric = true) {
    B.trim.setM(F.M);
    const x0 = xc - w / 2, x1 = xc + w / 2;
    if (fabric) {
      B.trim.box(x0, x1, y, y + 0.3, 0, dep, col, 'tbflr');
      B.trim.box(x0, x1, y - 0.28, y, dep - 0.03, dep, mulc(col, 0.9), 'fblr');
      for (const s of [x0 + 0.1, x1 - 0.1]) B.trim.geo(K.beam(0, y + 1.3, dep - 0.05, y + 0.3, 0, 0.03, 0.03, IRON, 'z').translate(s, 0, 0));
    } else {
      B.trim.box(x0, x1, y, y + 0.22, 0, dep, col, 'tbflr');
      B.win.setM(F.M).quad([x0 + 0.3, y - 0.01, 0.3], [x1 - 0.3, y - 0.01, 0.3], [x1 - 0.3, y - 0.01, dep - 0.3], [x0 + 0.3, y - 0.01, dep - 0.3], [1, 1, 1], winCellUV(W_WHITE), 1.2);
    }
    B.trim.setM(null); B.win.setM(null);
  }
  // rooftop things (object space, standing on y)
  function waterTank(B, x, y, z, rad = 1.4, h = 2.6) {
    const t = B.trim.setM(null), legH = 2.2, wood = L(0x7a6650);
    for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) t.box(x + sx * rad * 0.7 - 0.06, x + sx * rad * 0.7 + 0.06, y, y + legH, z + sz * rad * 0.7 - 0.06, z + sz * rad * 0.7 + 0.06, IRON, 'fklr');
    t.geo(K.beam(x - rad * 0.7, y + 0.2, x + rad * 0.7, y + legH - 0.1, z + rad * 0.7, 0.05, 0.05, IRON));
    t.geo(K.beam(x - rad * 0.7, y + legH - 0.1, x + rad * 0.7, y + 0.2, z - rad * 0.7, 0.05, 0.05, IRON));
    t.box(x - rad, x + rad, y + legH - 0.12, y + legH, z - rad, z + rad, IRON, 'tbflr');
    const staves = paint(prep(new THREE.CylinderGeometry(rad, rad * 1.04, h, 12, 1, true)), (px, py, pz) => mulc(wood, 0.85 + 0.25 * fbm(Math.atan2(pz, px) * 3, py * 0.3, 0, 1)));
    t.geo(staves.translate(x, y + legH + h / 2, z));
    for (const yy of [0.25, 0.9, 1.6, 2.3]) t.geo(paint(prep(new THREE.CylinderGeometry(rad * 1.03, rad * 1.03, 0.06, 12, 1, true)).translate(x, y + legH + yy, z), IRON));
    t.geo(paint(prep(new THREE.ConeGeometry(rad * 1.08, 0.9, 12)).translate(x, y + legH + h + 0.45, z), mulc(wood, 0.7)));
    t.geo(ico(0.09, 0, x, y + legH + h + 0.95, z, IRON));
  }
  function acUnit(B, x, y, z, ry = 0) {
    const g = [boxG(1.3, 0.95, 0.9, 0, 0.6, 0, L(0xc8c8c4)), boxG(1.4, 0.12, 1.0, 0, 0.06, 0, IRON)];
    g.push(paint(prep(new THREE.CircleGeometry(0.33, 10)).rotateX(-HP).translate(0.2, 1.081, 0), L(0x2a2c2e)));
    g.push(boxG(0.5, 0.6, 0.02, -0.35, 0.6, 0.46, L(0x7a7c7e)));
    B.trim.setM(null).geo(merge(g).rotateY(ry).translate(x, y, z));
  }
  function bulkhead(B, x, y, z, w, d, h, doorRy = 0) {
    B.trim.setM(null).box(x - w / 2, x + w / 2, y, y + h, z - d / 2, z + d / 2, L(0xa8a49c), 'tflrk');
    B.trim.box(x - w / 2 - 0.1, x + w / 2 + 0.1, y + h, y + h + 0.15, z - d / 2 - 0.1, z + d / 2 + 0.1, L(0x8a8680), 'tfblrk');
    const M = new THREE.Matrix4().makeRotationY(doorRy).setPosition(x, y, z);
    const off = (doorRy === 0 || Math.abs(doorRy) === PI) ? d / 2 : w / 2;
    B.win.setM(M).quad([-0.5, 0, off + 0.01], [0.5, 0, off + 0.01], [0.5, 2.15, off + 0.01], [-0.5, 2.15, off + 0.01], [1, 1, 1], winCellUV(W_SERVICE), 0);
  }
  function antenna(B, x, y, z, h, light = true) {
    B.trim.setM(null).geo(cyl(0.05, 0.08, h, 5, x, y, z, STEEL));
    for (let k = 1; k < 4; k++) B.trim.box(x - 0.5 + k * 0.08, x + 0.5 - k * 0.08, y + h * (0.4 + k * 0.15), y + h * (0.4 + k * 0.15) + 0.04, z - 0.02, z + 0.02, STEEL, 'tfbk');
    if (light) for (const ry of [0, HP]) B.win.setM(new THREE.Matrix4().makeRotationY(ry).setPosition(x, y + h, z)).quad([-0.2, 0, 0], [0.2, 0, 0], [0.2, 0.4, 0], [-0.2, 0.4, 0], [1, 1, 1], winCellUV(W_RED), 1.3);
  }
  function vents(B, x, y, z, n, r) {
    for (let k = 0; k < n; k++) {
      const vx = x + (r() - 0.5) * 3, vz = z + (r() - 0.5) * 3;
      B.trim.setM(null).geo(cyl(0.12, 0.12, 0.7 + r() * 0.5, 6, vx, y, vz, L(0x9a9a96)));
    }
  }
  // finish: the prop record
  function finishB(B, w, d, h, extra = {}) {
    const wallG = B.wall.build(WALL_UV[B.wallKey]), winG = B.win.build(), trimG = B.trim.build(STONE_UV);
    const parts = [
      { geometry: wallG, material: WALLS[B.wallKey](), castShadow: true },
      { geometry: winG, material: winMat(), castShadow: true },
      { geometry: trimG, material: trimMat(), castShadow: true },
    ];
    const tris = B.wall.tris + B.win.tris + B.trim.tris;
    // h: the top of the highest thing (antennas, tanks), measured
    h = Math.ceil(Math.max(wallG.boundingBox.max.y, winG.boundingBox.max.y, trimG.boundingBox.max.y) * 10) / 10;
    return Object.assign({ parts, radius: 0, w, d, h, balconies: B.balconies, tris }, extra);
  }
  /* ============================================================
     Apartment towers (6 variants). Body exactly w x d centered on the origin, front (street) on +z.
     Cornices, balconies and canopies may reach up to 1.6 m past the lot line, always above 2.9 m.
     ============================================================ */
  function apt0() {
    // prewar red brick walk-up, 8 floors: limestone base, paired sashes, a fire escape on the right, bracketed cornice, water tank
    const B = newB(5101, 'brickRed'), hw = 7.5, hd = 7.5, G = 4.0, fh = 3.2, nU = 7, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), stone = L(0xd2c8b4), base = grime(stone, 0.8, 2), wc = grime([1, 1, 1], 1, 1);
    const lob = { x0: -1.5, x1: 1.5, y0: 0, y1: 3.0, cell: W_LOBBY, rec: 0.9, vest: stone };
    face(B, F[0], 0, G, [lob, ...grid(B, [-5.5, -3.6, 3.6, 5.5], [1.05], 1.15, 1.75, W_BARRED)], { acc: B.trim, col: base, sill: stone });
    face(B, F[1], 0, G, grid(B, spread(15, 4, 1.3), [1.05], 1.15, 1.75, W_BARRED), { acc: B.trim, col: base, sill: stone });
    face(B, F[2], 0, G, [{ x0: -0.55, x1: 0.55, y0: 0, y1: 2.2, cell: W_SERVICE }, ...grid(B, [-5.2, -2.8, 2.8, 5.2], [1.05], 1.15, 1.75, W_BARRED)], { acc: B.trim, col: base, sill: stone });
    face(B, F[3], 0, G, grid(B, spread(15, 4, 1.3), [1.05], 1.15, 1.75, W_BARRED), { acc: B.trim, col: base, sill: stone });
    band(B, F, G - 0.32, 0.32, 0.12, stone);
    const ys = floorsAt(G, nU, fh, 0.85), xs = paired(15, 2, 1.5, 2.1);
    for (const f of F) face(B, f, G, top + 0.9, grid(B, xs, ys, 1.1, 1.75, W_SASH, { ac: f.name === 'back' ? 0.15 : 0.05 }), { col: wc, sill: stone, lintel: stone, ac: 1 });
    band(B, F, G + fh + 0.6, 0.18, 0.08, stone);
    core(B, 0, 0, hw, hd, 0, top);
    cornice(B, F, top - 0.55, { col: L(0xcfc5b2), out: 0.62, frieze: 0.55, h: 0.3, brackets: 1.15 });
    roofParapet(B, 0, 0, hw, hd, top, 0.9);
    fireEscape(B, F[1], xs[2] + 1.05, 4.6, floorsAt(G, nU, fh, 0.12));
    canopy(B, F[0], 0, 3.8, 3.15, 1.6, L(0x24483a));
    waterTank(B, -3.6, top, -3.4);
    bulkhead(B, 3.2, top, -2.6, 2.6, 3.2, 2.7);
    acUnit(B, 3.4, top, 3.4, 0.2); acUnit(B, 0.6, top, 3.6, -0.1);
    vents(B, -2, top, 2, 3, r);
    return finishB(B, 15, 15, top + 5.6, { floors: nU + 1, lot: 'quarter' });
  }
  function apt1() {
    // limestone prewar, 11 floors and a setback penthouse with a terrace
    const B = newB(5202, 'stone'), hw = 7.5, hd = 7.5, G = 4.4, fh = 3.2, nU = 10, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), tint = L(0xe8dcc4), wc = grime(tint, 0.8, 3), trimC = L(0xdcd0b8);
    const lob = { x0: -1.7, x1: 1.7, y0: 0, y1: 3.3, cell: W_LOBBY, rec: 1.1, vest: trimC, floor: L(0x9a9488) };
    face(B, F[0], 0, G, [lob, ...grid(B, [-5.2, -3.3, 3.3, 5.2], [0.9], 1.4, 2.2, W_SASH)], { col: wc, sill: trimC });
    for (const f of F.slice(1)) face(B, f, 0, G, grid(B, spread(15, 5, 0.9), [0.9], 1.2, 2.2, f.name === 'back' ? W_BARRED : W_SASH), { col: wc, sill: trimC });
    band(B, F, G - 0.35, 0.35, 0.14, trimC);
    const ys = floorsAt(G, nU, fh, 0.9), xs = spread(15, 5, 0.9);
    for (const f of F) face(B, f, G, top + 0.7, grid(B, xs, ys, 1.1, 1.7, W_SASH, { ac: 0.06 }), { col: wc, sill: trimC, lintel: f.name === 'front' ? trimC : null, ac: 1 });
    band(B, F, G + 2 * fh - 0.2, 0.22, 0.1, trimC);
    band(B, F, G + 8 * fh - 0.2, 0.22, 0.1, trimC);
    core(B, 0, 0, hw, hd, 0, top);
    cornice(B, F, top - 0.6, { col: trimC, out: 0.7, frieze: 0.6, h: 0.32, dentils: 1 });
    roofParapet(B, 0, 0, hw, hd, top, 0.7);
    // penthouse, set back 2.5 m, with french doors onto the terrace
    const p = 5.0, pt = top + 3.4, PF = tierFaces(0, -0.5, p, p);
    face(B, PF[0], top, pt + 0.5, grid(B, [-3.2, 0, 3.2], [top + 0.05], 1.6, 2.4, W_FR_W).concat(), { col: wc, lintel: trimC });
    for (const f of PF.slice(1)) face(B, f, top, pt + 0.5, grid(B, spread(10, 3, 1.2), [top + 0.9], 1.1, 1.6, W_SASH), { col: wc, sill: trimC });
    core(B, 0, -0.5, p, p, top, pt);
    band(B, PF, pt - 0.2, 0.25, 0.25, trimC);
    roofParapet(B, 0, -0.5, p, p, pt, 0.5);
    for (const x of [-5.6, -2.2, 2.2, 5.6]) potPlant(B, x, top, 6.5, 1.1, r);
    for (const [x, z] of [[-6.5, 2.5], [6.5, 2.5], [-6.5, -3.5], [6.5, -3.5]]) potPlant(B, x, top, z, 1.0, r);
    bistroChair(B, -1.0, top, 6.2, 0.3); bistroChair(B, 0.6, top, 6.3, -0.4);
    B.balconies.push({ x: 1.5, y: top, z: 6.4, yaw: 0 }, { x: -4.0, y: top, z: 6.4, yaw: 0 });
    bulkhead(B, -2.4, pt, -2.5, 2.4, 2.8, 2.5);
    antenna(B, 2.6, pt, -3.2, 6);
    acUnit(B, 2.2, pt, 1.5, 0);
    return finishB(B, 15, 15, pt + 6.6, { floors: nU + 2, lot: 'quarter' });
  }
  function apt2() {
    // modern stucco, 10 floors, glass balconies on the front, a roof garden
    const B = newB(5303, 'stucco'), hw = 7.5, hd = 7.5, G = 4.0, fh = 3.1, nU = 9, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), tint = L(0xece6dc), wc = grime(tint, 0.6, 4), slab = L(0xf2f0ec), dark = L(0x4a4a4a);
    const g0 = [{ x0: -1.6, x1: 1.6, y0: 0, y1: 3.2, cell: W_LOBBY, rec: 0.9, vest: L(0x8a8478) }, { x0: -5.8, x1: -2.6, y0: 0.5, y1: 3.2, cell: W_SIDE }, { x0: 2.6, x1: 5.8, y0: 0.5, y1: 3.2, cell: W_SIDE }];
    face(B, F[0], 0, G, g0, { col: wc });
    for (const f of F.slice(1)) face(B, f, 0, G, grid(B, spread(15, 4, 1.4), [0.9], 1.4, 1.9, W_CASE), { col: wc });
    canopy(B, F[0], 0, 6.0, 3.35, 1.5, L(0xdedad2), false);
    const ys = floorsAt(G, nU, fh, 0);
    // front: per floor two balconies, each with a french door and a window
    const fr = [];
    for (const y of ys) for (const s of [-1, 1]) {
      fr.push({ x0: s * 3.6 - 0.8 - s * 0.6, x1: s * 3.6 + 0.8 - s * 0.6, y0: y + 0.05, y1: y + 2.45, cell: pick(r, W_FR_D) });
      fr.push({ x0: s * 3.6 - 0.6 + s * 1.3, x1: s * 3.6 + 0.6 + s * 1.3, y0: y + 0.85, y1: y + 2.45, cell: pick(r, W_CASE) });
    }
    face(B, F[0], G, top + 0.4, fr, { col: wc });
    for (const f of F.slice(1)) face(B, f, G, top + 0.4, grid(B, spread(15, 4, 1.4), floorsAt(G, nU, fh, 0.85), 1.4, 1.6, W_CASE), { col: wc });
    core(B, 0, 0, hw, hd, 0, top);
    for (const y of ys) for (const s of [-1, 1]) balcony(B, F[0], s * 3.6, 4.6, y, 1.5, { glass: true, slab, stuff: r() < 0.6, spotX: -s * 0.4 });
    for (const f of F.slice(1)) band(B, [f], G - 0.2, 0.2, 0.05, slab);
    // roof garden: deck, planters with shrubs and small trees, a table with an umbrella, glass rail at the edge
    roofParapet(B, 0, 0, hw, hd, top, 0.4, { coping: slab });
    const T = B.trim.setM(null), deck = L(0x8a6a4a);
    T.box(-6.6, 4.0, top, top + 0.12, -1.0, 6.6, (x) => mulc(deck, 0.9 + 0.15 * Math.sin(x * 9)), 'tfl');
    for (const F2 of F) { B.win.setM(F2.M).quad([-F2.W / 2 + 0.3, top + 0.5, -0.3], [F2.W / 2 - 0.3, top + 0.5, -0.3], [F2.W / 2 - 0.3, top + 1.5, -0.3], [-F2.W / 2 + 0.3, top + 1.5, -0.3], [1, 1, 1], stripUV(GLASSRAIL_V, F2.W - 0.6), 0); }
    for (const [x0, x1, z0, z1] of [[-6.9, -3.0, -6.9, -5.9], [-6.9, -5.9, -5.9, -1.4], [4.6, 6.9, -6.9, 6.9]]) {
      T.box(x0, x1, top, top + 0.65, z0, z1, L(0x7a7470), 'tfklr');
      T.box(x0 + 0.08, x1 - 0.08, top + 0.6, top + 0.66, z0 + 0.08, z1 - 0.08, L(0x4a3424), 't');
      const n = Math.max(1, Math.round(Math.max(x1 - x0, z1 - z0) / 0.9));
      for (let k = 0; k < n; k++) {
        const t = (k + 0.5) / n, x = lerp(x0 + 0.4, x1 - 0.4, x1 - x0 > z1 - z0 ? t : 0.5), z = lerp(z0 + 0.4, z1 - 0.4, x1 - x0 > z1 - z0 ? 0.5 : t);
        T.geo(ico(0.42 + r() * 0.2, 1, x, top + 0.95, z, mulc(L(0x3e6a2c), 0.8 + r() * 0.4), 1, 0.85, 1));
      }
    }
    for (const [x, z] of [[5.7, 4.5], [5.7, -4.2]]) { T.geo(cyl(0.07, 0.1, 1.6, 5, x, top + 0.65, z, L(0x5a4030))); T.geo(ico(0.9, 1, x, top + 2.6, z, L(0x4a7a30), 1, 1.1, 1)); }
    T.geo(cyl(0.035, 0.035, 2.3, 5, -1.2, top + 0.12, 3.0, L(0xe8e4dc)));
    T.geo(paint(prep(new THREE.ConeGeometry(1.4, 0.55, 10, 1, true)).translate(-1.2, top + 2.45, 3.0), L(0xd8483a)));
    T.geo(paint(prep(new THREE.ConeGeometry(1.4, 0.55, 10, 1, true)).rotateX(PI).translate(-1.2, top + 2.44, 3.0), L(0xa8382a)));
    T.geo(cyl(0.5, 0.5, 0.04, 10, -1.2, top + 0.84, 3.0, L(0xf0ece4))); T.geo(cyl(0.05, 0.05, 0.72, 5, -1.2, top + 0.12, 3.0, L(0x9a9a96)));
    bistroChair(B, -2.2, top + 0.12, 3.1, HP + 0.2); bistroChair(B, -0.2, top + 0.12, 2.9, -HP - 0.1); bistroChair(B, -1.3, top + 0.12, 4.0, PI);
    B.balconies.push({ x: -2.6, y: top + 0.12, z: 1.0, yaw: 0 }, { x: 1.5, y: top + 0.12, z: 5.0, yaw: 0 });
    bulkhead(B, 1.2, top, -4.4, 3.0, 3.0, 2.8);
    acUnit(B, 3.4, top, -3.0, 0);
    return finishB(B, 15, 15, top + 3.2, { floors: nU + 1, lot: 'quarter' });
  }
  function apt3() {
    // 16 floor buff brick slab on a wide lot, concrete floor bands, two stacks of balconies
    const B = newB(5404, 'brickBuff'), hw = 15.5, hd = 7.5, G = 4.2, fh = 3.0, nU = 15, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), wc = grime([1, 1, 1], 0.9, 5), conc = L(0xd8d4cc);
    const xs = spread(31, 8, 1.2), bx = [xs[1], xs[6]];
    face(B, F[0], 0, G, [{ x0: -1.8, x1: 1.8, y0: 0, y1: 3.2, cell: W_LOBBY, rec: 1.0, vest: conc }, ...grid(B, xs.filter((x) => Math.abs(x) > 3), [0.9], 1.6, 2.1, W_SASH)], { col: wc, sill: conc });
    face(B, F[2], 0, G, [{ x0: -0.6, x1: 0.6, y0: 0, y1: 2.2, cell: W_SERVICE }, ...grid(B, xs.filter((x) => Math.abs(x) > 2), [0.9], 1.4, 1.9, W_BARRED)], { col: wc });
    for (const f of [F[1], F[3]]) face(B, f, 0, G, grid(B, spread(15, 3, 1.5), [0.9], 1.4, 1.9, W_SASH), { col: wc });
    canopy(B, F[0], 0, 5.2, 3.4, 1.6, conc, false);
    const ys = floorsAt(G, nU, fh, 0);
    const front = [];
    for (const y of ys) for (const x of xs) {
      if (bx.includes(x)) front.push({ x0: x - 0.85, x1: x + 0.85, y0: y + 0.05, y1: y + 2.3, cell: pick(r, W_FR_W) });
      else front.push({ x0: x - 0.7, x1: x + 0.7, y0: y + 0.85, y1: y + 2.4, cell: pick(r, W_SASH), ac: r() < 0.06 ? 1 : 0 });
    }
    face(B, F[0], G, top + 0.8, front, { col: wc, ac: 1 });
    face(B, F[2], G, top + 0.8, grid(B, xs, floorsAt(G, nU, fh, 0.85), 1.4, 1.55, W_SASH, { ac: 0.08 }), { col: wc, ac: 1 });
    for (const f of [F[1], F[3]]) face(B, f, G, top + 0.8, grid(B, spread(15, 3, 1.5), floorsAt(G, nU, fh, 0.85), 1.4, 1.55, W_SASH), { col: wc });
    core(B, 0, 0, hw, hd, 0, top);
    for (let i = 1; i < nU; i++) band(B, F, G + i * fh - 0.18, 0.18, 0.04, conc);
    band(B, F, G - 0.25, 0.25, 0.1, conc);
    for (const y of ys) for (const x of bx) balcony(B, F[0], x, 3.0, y, 1.3, { slab: conc, stuff: r() < 0.35 });
    roofParapet(B, 0, 0, hw, hd, top, 0.8, { coping: conc });
    // mechanical penthouse, cooling units, antennas
    const T = B.trim.setM(null);
    T.box(-4, 4, top, top + 3.6, -4.5, 0.5, L(0xc8bfae), 'tfklr');
    B.win.setM(faceMatrix(0, 0, 0.5)).quad([-3, top + 0.6, 0.01], [-0.4, top + 0.6, 0.01], [-0.4, top + 3.0, 0.01], [-3, top + 3.0, 0.01], [1, 1, 1], winCellUV(W_LOUVER), 0);
    B.win.quad([0.6, top + 0.6, 0.01], [3.2, top + 0.6, 0.01], [3.2, top + 3.0, 0.01], [0.6, top + 3.0, 0.01], [1, 1, 1], winCellUV(W_LOUVER), 0);
    for (const x of [-11, -8.5, 8.5, 11]) acUnit(B, x, top, -3.5, 0);
    antenna(B, 10, top, 4, 7); antenna(B, -12, top, 4.5, 4, false);
    bulkhead(B, -12, top, -2, 2.4, 2.6, 2.6);
    vents(B, 6, top, 3, 4, r);
    return finishB(B, 31, 15, top + 7.4, { floors: nU + 1, lot: 'wide' });
  }
  function apt4() {
    // painted brick tenement on a deep lot, 6 floors, fire escape on the narrow front, flower boxes, bracketed cornice
    const B = newB(5505, 'painted'), hw = 7.5, hd = 15.5, G = 3.8, fh = 3.1, nU = 5, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), tint = L(0xd8d2b4), wc = grime(tint, 1.1, 6), white = L(0xf2f0ea), corn = L(0x3a4a3e);
    face(B, F[0], 0, G, [{ x0: -0.9, x1: 0.9, y0: 0, y1: 2.9, cell: W_LOBBY, rec: 0.7, vest: L(0x6a6258) }, ...grid(B, [-5.4, -3.2, 3.2, 5.4], [1.0], 1.15, 1.75, W_BARRED)], { col: wc, sill: white });
    face(B, F[2], 0, G, [{ x0: -0.55, x1: 0.55, y0: 0, y1: 2.2, cell: W_SERVICE }, ...grid(B, [-4.5, 4.5], [1.0], 1.1, 1.6, W_BARRED)], { col: wc });
    for (const f of [F[1], F[3]]) face(B, f, 0, G, grid(B, spread(31, 7, 2.5), [1.0], 1.1, 1.7, W_BARRED), { col: wc, sill: white });
    const ys = floorsAt(G, nU, fh, 0.85), xs = spread(15, 4, 1.2);
    face(B, F[0], G, top + 1.0, grid(B, xs, ys, 1.1, 1.7, W_SASH, { box: 0.35 }), { col: wc, sill: white, lintel: white, box: 1 });
    face(B, F[2], G, top + 1.0, grid(B, xs, ys, 1.0, 1.6, W_SASH, { ac: 0.15 }), { col: wc, sill: white, ac: 1 });
    for (const f of [F[1], F[3]]) face(B, f, G, top + 1.0, grid(B, spread(31, 9, 1.6), ys, 1.0, 1.6, W_SASH, { ac: 0.06 }), { col: wc, sill: white, ac: 1 });
    core(B, 0, 0, hw, hd, 0, top);
    fireEscape(B, F[0], 0, 5.6, floorsAt(G, nU, fh, 0.12), 1.2);
    cornice(B, F, top - 0.5, { col: corn, out: 0.55, frieze: 0.5, h: 0.28, brackets: 1.0 });
    roofParapet(B, 0, 0, hw, hd, top, 1.0, { coping: corn });
    band(B, F, G - 0.3, 0.3, 0.08, white);
    waterTank(B, 2.5, top, -9, 1.3, 2.4);
    bulkhead(B, -3, top, 4, 2.4, 3, 2.6);
    for (const z of [-14, -4, 8, 14]) { B.trim.setM(null).box(6.3, 7.3, top, top + 1.8, z - 0.5, z + 0.5, L(0x8a4a3a), 'tfklr'); B.trim.box(6.2, 7.4, top + 1.8, top + 1.95, z - 0.6, z + 0.6, L(0x6a6a66), 'tfblrk'); }
    acUnit(B, -4, top, -6, HP); vents(B, -2, top, -12, 3, r);
    return finishB(B, 15, 31, top + 6, { floors: nU + 1, lot: 'deep' });
  }
  function apt5() {
    // red brick on a two story stone base, wide lot, 10 floors: stone quoins, single sashes with window air conditioners
    const B = newB(5606, 'brickDark'), hw = 15.5, hd = 7.5, G = 4.2, fh = 3.1, nU = 9, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), stone = L(0xc8bca6), base = grime(stone, 0.9, 7), wc = grime([1, 1, 1], 0.9, 8);
    const xs = spread(31, 10, 1.1), xsS = spread(15, 4, 1.3), yb = G + fh;
    const baseHoles = [
      [{ x0: -1.8, x1: 1.8, y0: 0, y1: 3.3, cell: W_LOBBY, rec: 1.1, vest: stone }, ...grid(B, xs.filter((x) => Math.abs(x) > 3), [1.0], 1.3, 2.0, W_SASH), ...grid(B, xs, [G + 0.85], 1.1, 1.65, W_SASH)],
      grid(B, xsS, [1.0, G + 0.85], 1.1, 1.7, W_SASH),
      [{ x0: -0.6, x1: 0.6, y0: 0, y1: 2.2, cell: W_SERVICE }, ...grid(B, xs.filter((x) => Math.abs(x) > 2), [1.0], 1.1, 1.7, W_BARRED), ...grid(B, xs, [G + 0.85], 1.1, 1.65, W_SASH)],
      grid(B, xsS, [1.0, G + 0.85], 1.1, 1.7, W_SASH),
    ];
    F.forEach((f, i) => {
      face(B, f, 0, yb, baseHoles[i], { acc: B.trim, col: base, sill: stone });
      // rusticated base: shadow grooves every 0.6 m that stop at the openings
      grooves(B, f, baseHoles[i], Array.from({ length: Math.floor(yb / 0.6) }, (_, k) => 0.57 + k * 0.6), 0.035, mulc(stone, 0.72));
    });
    band(B, F, yb - 0.1, 0.35, 0.14, stone);
    const ys = floorsAt(yb, nU - 1, fh, 0.85);
    for (const f of F) face(B, f, yb, top + 1.1, grid(B, f.W > 20 ? xs : xsS, ys, 1.1, 1.65, W_SASH, { ac: 0.12 }), { col: wc, sill: stone, lintel: f.name === 'front' ? stone : null, ac: 1 });
    core(B, 0, 0, hw, hd, 0, top);
    // quoins: stone blocks on the corners, alternating long and short
    for (let y = yb + 0.3, k = 0; y < top - 0.6; y += 0.6, k++) for (const f of F) {
      B.trim.setM(f.M);
      const a = k % 2 ? 0.85 : 0.45, b = k % 2 ? 0.45 : 0.85;
      B.trim.box(f.W / 2 - a, f.W / 2 + 0.05, y + 0.02, y + 0.58, -0.02, 0.05, stone, 'ft');
      B.trim.box(-f.W / 2 - 0.05, -f.W / 2 + b, y + 0.02, y + 0.58, -0.02, 0.05, stone, 'f');
    }
    cornice(B, F, top - 0.45, { col: stone, out: 0.45, frieze: 0.45, h: 0.25 });
    roofParapet(B, 0, 0, hw, hd, top, 1.1, { coping: stone });
    // raised parapet panel over the entrance with a plaque
    B.wall.setM(F[0].M).quad([-3.5, top + 1.1, 0], [3.5, top + 1.1, 0], [3.5, top + 2.1, 0], [-3.5, top + 2.1, 0], wc);
    B.wall.quad([3.5, top + 1.1, -0.25], [-3.5, top + 1.1, -0.25], [-3.5, top + 2.1, -0.25], [3.5, top + 2.1, -0.25], mulc([1, 1, 1], 0.85));
    B.trim.setM(F[0].M).box(-3.6, 3.6, top + 2.1, top + 2.25, -0.3, 0.06, stone, 'tfk'); B.trim.box(-1.4, 1.4, top + 1.3, top + 1.9, -0.02, 0.05, stone, 'f');
    for (const s of [-1, 1]) B.trim.box(s * 3.5 - (s > 0 ? 0.25 : 0), s * 3.5 + (s < 0 ? 0.25 : 0), top + 1.1, top + 2.1, -0.25, 0, mulc(stone, 0.9), s > 0 ? 'r' : 'l');
    canopy(B, F[0], 0, 4.0, 3.45, 1.6, L(0x6a1e24));
    waterTank(B, -9, top, -3, 1.5, 2.7);
    bulkhead(B, 6, top, -3, 2.8, 3.2, 2.8); bulkhead(B, -2, top, -3.5, 2.4, 2.6, 2.6);
    for (const x of [-12, 3, 11]) acUnit(B, x, top, 3.5, r() * 0.4);
    vents(B, 9, top, 2, 3, r);
    return finishB(B, 31, 15, top + 6.2, { floors: nU + 1, lot: 'wide' });
  }
  /* ============================================================
     Office towers (4 variants), floors 3.6 m
     ============================================================ */
  function mechScreen(B, cx, cz, hw, hd, y, h, wallCol) {
    // a louvered mechanical floor on the roof: wall with louver panels all around, a cap
    const F = tierFaces(cx, cz, hw, hd);
    for (const f of F) {
      const n = Math.max(1, Math.round(f.W / 3.6)), xs = spread(f.W, n, 0.5), lw = (f.W - 1.0) / n - 0.5;
      face(B, f, y, y + h, xs.map((x) => ({ x0: x - lw / 2, x1: x + lw / 2, y0: y + 0.5, y1: y + h - 0.6, cell: W_LOUVER })), { col: wallCol, rec: 0.1 });
    }
    core(B, cx, cz, hw, hd, y, y + h - 0.2, 0.1);
    roofParapet(B, cx, cz, hw, hd, y + h, 0);
    band(B, F, y + h - 0.25, 0.25, 0.08, L(0x8a8e92));
  }
  function off0() {
    // stone and glass, 14 floors on a quarter lot: a deep stone grid, a tall glass lobby, a louvered top
    const B = newB(6101, 'panel'), hw = 7.5, hd = 7.5, G = 5.0, fh = 3.6, nU = 13, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), tint = L(0xddd8ce), wc = grime(tint, 0.5, 11), metal = L(0x5a5550);
    face(B, F[0], 0, G, [{ x0: -2.0, x1: 2.0, y0: 0, y1: 4.3, cell: W_OLOBBY, rec: 1.3, vest: tint, floor: L(0x8a8680) }, { x0: -6.6, x1: -2.6, y0: 0.4, y1: 4.3, cell: W_SIDE }, { x0: 2.6, x1: 6.6, y0: 0.4, y1: 4.3, cell: W_SIDE }], { col: wc });
    face(B, F[2], 0, G, [{ x0: -0.6, x1: 0.6, y0: 0, y1: 2.3, cell: W_SERVICE }, { x0: 2.0, x1: 5.5, y0: 1.8, y1: 4.0, cell: W_LOUVER }], { col: wc });
    for (const f of [F[1], F[3]]) face(B, f, 0, G, [{ x0: -6.4, x1: -0.4, y0: 0.4, y1: 4.3, cell: W_SIDE }, { x0: 0.4, x1: 6.4, y0: 0.4, y1: 4.3, cell: W_SIDE }], { col: wc });
    canopy(B, F[0], 0, 5.0, 4.5, 1.6, metal, false);
    const xs = spread(15, 4, 0.6), ys = floorsAt(G, nU, fh, 0.62);
    for (const f of F) face(B, f, G, top + 0.3, grid(B, xs, ys, 2.5, 2.5, W_RIB), { col: wc, rec: 0.3 });
    core(B, 0, 0, hw, hd, 0, G, 0.14);
    core(B, 0, 0, hw, hd, G, top, 0.3);
    band(B, F, G - 0.3, 0.3, 0.12, mulc(tint, 0.9));
    band(B, F, top - 0.1, 0.4, 0.15, mulc(tint, 0.92));
    roofParapet(B, 0, 0, hw, hd, top + 0.3, 0);
    mechScreen(B, 0, -0.5, 6.0, 6.0, top + 0.3, 4.2, wc);
    antenna(B, 3.5, top + 4.5, -4, 6);
    return finishB(B, 15, 15, top + 10.8, { floors: nU + 1, lot: 'quarter' });
  }
  function off1() {
    // blue green glass curtain wall slab on a wide lot, 18 floors, aluminum fins, a granite lobby floor
    const B = newB(6202, 'panel'), hw = 15.5, hd = 7.5, G = 5.4, fh = 3.6, nU = 17, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), gran = grime(L(0x7a726c), 0.4, 12);
    face(B, F[0], 0, G, [
      { x0: -1.3, x1: 1.3, y0: 0, y1: 4.4, cell: W_OLOBBY, rec: 1.4, vest: L(0x8a847e), floor: L(0x6a6660) },
      { x0: -4.6, x1: -1.6, y0: 0, y1: 4.4, cell: W_SIDE }, { x0: 1.6, x1: 4.6, y0: 0, y1: 4.4, cell: W_SIDE },
      ...[-12.4, -8.6, 8.6, 12.4].map((x) => ({ x0: x - 1.7, x1: x + 1.7, y0: 0.5, y1: 4.4, cell: W_SIDE })),
    ], { col: gran });
    face(B, F[2], 0, G, [{ x0: -0.6, x1: 0.6, y0: 0, y1: 2.3, cell: W_SERVICE }, { x0: 3, x1: 9, y0: 0, y1: 3.6, cell: W_LOUVER }, { x0: -11, x1: -5, y0: 0.6, y1: 4.2, cell: W_SIDE }], { col: gran });
    for (const f of [F[1], F[3]]) face(B, f, 0, G, [{ x0: -5.5, x1: -0.5, y0: 0.6, y1: 4.4, cell: W_SIDE }, { x0: 0.5, x1: 5.5, y0: 0.6, y1: 4.4, cell: W_SIDE }], { col: gran });
    core(B, 0, 0, hw, hd, 0, G);
    canopy(B, F[0], 0, 7.0, 4.7, 1.6, L(0xb8bec4), false);
    band(B, F, G - 0.2, 0.25, 0.1, L(0x9aa0a6));
    for (const f of F) curtain(B, f, G, nU, fh, 3.1, W_CW, { fins: f.W > 20 ? 0.35 : 0.25, finEvery: 1 });
    for (const f of F) curtain(B, f, top, 1, 1.2, 3.1, 31, { dark: true });
    roofParapet(B, 0, 0, hw, hd, top, 0);
    // mechanical penthouse with louvers
    const T = B.wall.setM(null);
    T.box(-7, 7, top, top + 4.6, -4.5, 2.5, L(0xc8c4bc), 'tfklr');
    for (const f of tierFaces(0, -1, 7, 3.5)) {
      const n = Math.round(f.W / 3.5);
      B.win.setM(f.M);
      for (const x of spread(f.W, n, 0.6)) B.win.quad([x - 1.2, top + 0.8, 0.01], [x + 1.2, top + 0.8, 0.01], [x + 1.2, top + 3.8, 0.01], [x - 1.2, top + 3.8, 0.01], [1, 1, 1], winCellUV(W_LOUVER), 0);
    }
    antenna(B, 12, top, 4, 8); antenna(B, -12, top, -4, 5, false);
    acUnit(B, 10, top, -4, 0); acUnit(B, 12.5, top, -4, 0);
    return finishB(B, 31, 15, top + 8.4, { floors: nU + 1, lot: 'wide' });
  }
  function off2() {
    // warm granite with ribbon windows on a deep lot, 11 floors
    const B = newB(6303, 'panel'), hw = 7.5, hd = 15.5, G = 4.8, fh = 3.6, nU = 10, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), tint = L(0xb4a698), wc = grime(tint, 0.5, 13), metal = L(0x4a4440);
    face(B, F[0], 0, G, [{ x0: -1.8, x1: 1.8, y0: 0, y1: 3.9, cell: W_OLOBBY, rec: 1.2, vest: tint }, { x0: -6.6, x1: -2.4, y0: 0.5, y1: 3.9, cell: W_SIDE }, { x0: 2.4, x1: 6.6, y0: 0.5, y1: 3.9, cell: W_SIDE }], { col: wc });
    for (const f of [F[1], F[3]]) face(B, f, 0, G, spread(31, 6, 1.2).map((x, i) => ({ x0: x - 1.9, x1: x + 1.9, y0: 0.5, y1: 3.9, cell: i === 2 ? W_SERVICE : W_SIDE })).map((h) => (h.cell === W_SERVICE ? Object.assign(h, { x0: h.x0 + 1.3, x1: h.x1 - 1.3, y0: 0, y1: 2.3 }) : h)), { col: wc });
    face(B, F[2], 0, G, [{ x0: -5, x1: -1, y0: 0, y1: 3.4, cell: W_LOUVER }, { x0: 1.5, x1: 2.7, y0: 0, y1: 2.3, cell: W_SERVICE }], { col: wc });
    canopy(B, F[0], 0, 4.4, 4.2, 1.6, metal, false);
    const ys = floorsAt(G, nU, fh, 0.8);
    face(B, F[0], G, top + 1.0, grid(B, spread(15, 5, 0.3), ys, 2.5, 2.1, W_RIB), { col: wc, rec: 0.22 });
    face(B, F[2], G, top + 1.0, grid(B, spread(15, 5, 0.3), ys, 2.5, 2.1, W_RIB), { col: wc, rec: 0.22 });
    for (const f of [F[1], F[3]]) face(B, f, G, top + 1.0, grid(B, spread(31, 11, 0.3), ys, 2.4, 2.1, W_RIB), { col: wc, rec: 0.22 });
    core(B, 0, 0, hw, hd, 0, G, 0.14);
    core(B, 0, 0, hw, hd, G, top, 0.22);
    for (let i = 0; i < nU; i++) band(B, F, G + i * fh + 0.62, 0.12, 0.06, metal);
    band(B, F, G - 0.25, 0.25, 0.12, metal);
    roofParapet(B, 0, 0, hw, hd, top, 1.0, { coping: metal });
    mechScreen(B, 0, -6, 4.5, 6.5, top, 3.8, wc);
    antenna(B, -4, top + 3.8, -10, 6);
    for (const z of [4, 8]) acUnit(B, 2.5, top, z, 0);
    return finishB(B, 15, 31, top + 10, { floors: nU + 1, lot: 'deep' });
  }
  function off3() {
    // full block landmark, 26 floors: limestone podium, two glass setbacks, a louvered crown and a spire
    const B = newB(6404, 'stone'), G = 6.0, fh = 3.6, r = B.r;
    const tint = L(0xe6decc), wc = grime(tint, 0.6, 14), metal = L(0x8a9096);
    // podium, 31 x 31, 6 floors
    let hw = 15.5;
    const p1 = G + 5 * fh, F1 = tierFaces(0, 0, hw, hw);
    face(B, F1[0], 0, G, [
      { x0: -1.6, x1: 1.6, y0: 0, y1: 4.8, cell: W_OLOBBY, rec: 1.6, vest: tint, floor: L(0x9a948a) },
      { x0: -5.0, x1: -2.0, y0: 0, y1: 4.8, cell: W_OLOBBY, rec: 1.6, vest: tint, floor: L(0x9a948a) }, { x0: 2.0, x1: 5.0, y0: 0, y1: 4.8, cell: W_OLOBBY, rec: 1.6, vest: tint, floor: L(0x9a948a) },
      ...[-12, -8.4, 8.4, 12].map((x) => ({ x0: x - 1.5, x1: x + 1.5, y0: 0.6, y1: 4.8, cell: W_SIDE })),
    ], { col: wc });
    for (const f of F1.slice(1)) face(B, f, 0, G, spread(31, 6, 1.0).map((x, i) => (f.name === 'back' && i === 2 ? { x0: x - 0.6, x1: x + 0.6, y0: 0, y1: 2.3, cell: W_SERVICE } : { x0: x - 1.8, x1: x + 1.8, y0: 0.6, y1: 4.8, cell: W_SIDE })), { col: wc });
    const xs1 = spread(31, 8, 0.8);
    for (const f of F1) face(B, f, G, p1 + 1.1, grid(B, xs1, floorsAt(G, 5, fh, 0.75), 2.3, 2.4, W_RIB), { col: wc, rec: 0.25, sill: mulc(tint, 0.9) });
    core(B, 0, 0, hw, hw, 0, G, 0.14);
    core(B, 0, 0, hw, hw, G, p1, 0.25);
    band(B, F1, G - 0.35, 0.35, 0.15, mulc(tint, 0.92));
    cornice(B, F1, p1 - 0.5, { col: mulc(tint, 0.95), out: 0.5, frieze: 0.5, h: 0.3 });
    roofParapet(B, 0, 0, hw, hw, p1, 1.1, { coping: mulc(tint, 0.9) });
    canopy(B, F1[0], 0, 11.0, 5.0, 1.6, metal, false);
    for (const [x, z] of [[-14, 14], [-9, 14], [9, 14], [14, 14], [-14, -14], [14, -14], [-14, 8], [14, 8]]) potPlant(B, x, p1, z, 1.3, r);
    // tower, 25 x 25, 14 floors of glass, fins on every other joint
    hw = 12.5;
    const p2 = p1 + 14 * fh, F2 = tierFaces(0, 0, hw, hw);
    for (const f of F2) curtain(B, f, p1, 14, fh, 3.125, W_CW, { fins: 0.3, finEvery: 2, finCol: L(0xc8ccd0) });
    for (const f of F2) curtain(B, f, p2, 1, 1.0, 3.125, 31, { dark: true });
    roofParapet(B, 0, 0, hw, hw, p2, 0);
    for (const [x, z] of [[-10, 10], [10, 10], [-10, -10], [10, -10]]) acUnit(B, x, p2, z, 0);
    // upper tower, 18 x 18, 6 floors
    hw = 9;
    const p3 = p2 + 6 * fh, F3 = tierFaces(0, 0, hw, hw);
    for (const f of F3) curtain(B, f, p2, 6, fh, 3.0, W_CW, { fins: 0.25, finCol: L(0xc8ccd0) });
    for (const f of F3) curtain(B, f, p3, 1, 1.0, 3.0, 31, { dark: true });
    roofParapet(B, 0, 0, hw, hw, p3, 0);
    // crown and spire
    mechScreen(B, 0, 0, 6, 6, p3, 4.5, grime(L(0xc8ccd0), 0.3, 15));
    const T = B.trim.setM(null), sb = p3 + 4.5;
    T.geo(cyl(1.0, 1.4, 1.2, 8, 0, sb, 0, metal));
    T.geo(cyl(0.12, 0.6, 12, 8, 0, sb + 1.2, 0, L(0xb8bec4)));
    for (const ry of [0, HP]) B.win.setM(new THREE.Matrix4().makeRotationY(ry).setPosition(0, sb + 13.2, 0)).quad([-0.3, 0, 0], [0.3, 0, 0], [0.3, 0.6, 0], [-0.3, 0.6, 0], [1, 1, 1], winCellUV(W_RED), 1.3);
    return finishB(B, 31, 31, sb + 13.8, { floors: 26, lot: 'full' });
  }

  /* ============================================================
     Midrise (4 variants): mixed use, 3 to 5 floors on a quarter lot. Upper floors are apartments; the ground floor
     front is an open storefront bay 13 m wide and 4.5 m tall, 0.6 m deep (its back at z = 6.9), dark inside, for a
     'storefront' prop placed at (0, 0, 6.9) with the same rotation.
     ============================================================ */
  const MID = [
    { wall: 'brickRed', n: 4, tint: [1, 1, 1], trim: L(0xd4cab6), corn: L(0x4a3e34), esc: 1, box: 0.25, seed: 7101 },
    { wall: 'painted', n: 3, tint: L(0xe6d8b8), trim: L(0xf4f2ec), corn: L(0xf0eee8), box: 0.75, seed: 7202, dentils: 1 },
    { wall: 'brickBuff', n: 5, tint: [1, 1, 1], trim: L(0xe0d8c8), corn: L(0x7a7a76), esc: 1, box: 0.15, seed: 7303, tank: 1 },
    { wall: 'stone', n: 4, tint: L(0xa07c62), trim: L(0xc0a284), corn: L(0x5e4636), box: 0.3, seed: 7404, keys: 1 },
  ];
  const MID_BAY = { x: 0, z: 6.9, w: 13, h: 4.5, d: 0.6 };
  function midrise(v) {
    const S = MID[v], B = newB(S.seed, S.wall), hw = 7.5, hd = 7.5, G = 4.8, fh = 3.2, nU = S.n - 1, top = G + nU * fh, r = B.r;
    const F = tierFaces(0, 0, hw, hd), wc = grime(S.tint, 1, v * 3), tc = S.trim;
    // ground floor: the open storefront bay on the front, a few windows on the sides near the front, a service door at the back
    face(B, F[0], 0, G, [{ x0: -6.5, x1: 6.5, y0: 0, y1: 4.5, rec: 0.6, vest: DARK, back: DARK, floor: L(0x2a2826) }], { col: wc });
    face(B, F[1], 0, G, grid(B, [-5.4, -3.2], [1.1], 1.1, 1.9, W_BARRED), { col: wc, sill: tc });
    face(B, F[3], 0, G, grid(B, [3.2, 5.4], [1.1], 1.1, 1.9, W_BARRED), { col: wc, sill: tc });
    face(B, F[2], 0, G, [{ x0: -0.55, x1: 0.55, y0: 0, y1: 2.2, cell: W_SERVICE }, ...grid(B, [-4.5, 4.5], [1.1], 1.1, 1.7, W_BARRED)], { col: wc });
    B.trim.setM(F[0].M).box(-7.5, 7.5, 4.5, 4.75, -0.02, 0.2, tc, 'tfblr');
    // upper floors
    const ys = floorsAt(G, nU, fh, 0.85), xs = spread(15, 4, 1.3);
    face(B, F[0], G, top + 0.8, grid(B, xs, ys, 1.15, 1.8, W_SASH, { box: S.box }), { col: wc, sill: tc, lintel: tc, box: 1 });
    face(B, F[2], G, top + 0.8, grid(B, xs, ys, 1.05, 1.65, W_SASH, { ac: 0.12 }), { col: wc, sill: tc, ac: 1 });
    for (const f of [F[1], F[3]]) face(B, f, G, top + 0.8, grid(B, spread(15, 3, 2.2), ys, 1.05, 1.65, W_SASH, { ac: 0.05 }), { col: wc, sill: tc, ac: 1 });
    if (S.keys) { B.trim.setM(F[0].M); for (const y of ys) for (const x of xs) B.trim.box(x - 0.12, x + 0.12, y + 1.8, y + 2.25, -0.02, 0.07, mulc(tc, 1.08), 'fblr'); }
    core(B, 0, 0, hw, hd, 0, top);
    if (S.esc) fireEscape(B, F[0], 0, 5.0, floorsAt(G, nU, fh, 0.12), 1.15, 0.9);
    cornice(B, F, top - 0.5, { col: S.corn, out: 0.55, frieze: 0.5, h: 0.28, brackets: S.dentils ? 0 : 1.05, dentils: S.dentils });
    roofParapet(B, 0, 0, hw, hd, top, 0.8, { coping: tc });
    bulkhead(B, 3.5, top, -4.0, 2.2, 2.6, 2.4);
    acUnit(B, -3.5, top, -3.5, 0.3);
    if (S.tank) waterTank(B, -3.2, top, 2.5, 1.2, 2.3);
    else acUnit(B, -2.0, top, 2.0, -0.2);
    B.trim.setM(null).box(-7.3, -6.3, top, top + 1.6, -6.0, -5.0, L(0x8a4a3a), 'tfklr');
    return finishB(B, 15, 15, top + (S.tank ? 5.4 : 3.0), { floors: S.n, lot: 'quarter', bay: Object.assign({}, MID_BAY) });
  }
  /* ============================================================
     Stores: kinds, sign boards and painted store insides (atlases), shared by the city store fronts and the
     town shop buildings
     ============================================================ */
  const STORE_KINDS = ['pet', 'vet', 'bakery', 'toy', 'grocery', 'icecream', 'cafe', 'flower', 'books', 'clothes'];
  const SHOP_KINDS = ['general', 'bakery', 'cafe', 'post', 'library', 'icecream', 'diner', 'hardware', 'flower', 'toy', 'pet', 'books'];
  // col: sign board, ink: letters, awn: awning stripes (two colors, the same twice for a plain awning), wall: inside wall
  const KINDS = {
    pet: { sign: 'PET STORE', town: 'PET SHOP', col: 0x2f8a86, ink: '#fdf6e4', icon: 'paw', awn: [0x2f8a86, 0xf4f0e6], wall: 0xe4efe6, floor: 0xc8b8a0 },
    vet: { sign: 'VET', col: 0x3a78b8, ink: '#ffffff', icon: 'heart', awn: [0x3a78b8, 0xf4f4f0], wall: 0xe2f0f2, floor: 0xd8dcd8 },
    bakery: { sign: 'BAKERY', col: 0x8a4a2a, ink: '#fbecc8', icon: 'bread', awn: [0xc8783a, 0xf6ead0], wall: 0xf4e4c8, floor: 0xb08458 },
    toy: { sign: 'TOY STORE', town: 'TOYS', col: 0xd8443a, ink: '#ffe060', icon: 'teddy', awn: [0xd8443a, 0xf8d040], wall: 0xf6eedc, floor: 0xc89a6a },
    grocery: { sign: 'GROCERY', col: 0x3a7a3a, ink: '#ffffff', icon: 'apple', awn: [0x3a7a3a, 0xf4f4ec], wall: 0xeef0e6, floor: 0xd8d4c8 },
    icecream: { sign: 'ICE CREAM', col: 0xe8789e, ink: '#ffffff', icon: 'cone', awn: [0xe8789e, 0xfcf4f4], wall: 0xfce4ee, floor: 0xf0e8ec },
    cafe: { sign: 'CAFE', col: 0x24382e, ink: '#f4e4c4', icon: 'cup', awn: [0x2a4a3a, 0x2a4a3a], wall: 0xe8d8c0, floor: 0x8a5a3a, serif: 1 },
    flower: { sign: 'FLOWERS', col: 0x6a8a5a, ink: '#ffffff', icon: 'flower', awn: [0x7a9a6a, 0xf8f4ec], wall: 0xeef2e6, floor: 0xb8b0a4 },
    books: { sign: 'BOOKS', col: 0x24345e, ink: '#ecca74', icon: 'book', awn: [0x24345e, 0x24345e], wall: 0xece0c8, floor: 0x8a5a3a, serif: 1 },
    clothes: { sign: 'CLOTHES', col: 0x2a2a2c, ink: '#ffffff', icon: 'shirt', awn: [0x2a2a2c, 0xf0f0ee], wall: 0xf4f2ee, floor: 0xd0c4b4 },
    general: { sign: 'GENERAL STORE', col: 0x6a2a22, ink: '#f4e4b8', icon: 'barrel', awn: [0x8a2a22, 0xf2e8d0], wall: 0xe0cca8, floor: 0x9a7048, serif: 1 },
    post: { sign: 'POST OFFICE', col: 0x22406a, ink: '#ffffff', icon: 'letter', awn: [0x22406a, 0xf0f0f0], wall: 0xe8e4d8, floor: 0xb8b4a8 },
    library: { sign: 'LIBRARY', col: 0x3a2a22, ink: '#ecca74', icon: 'book', awn: [0x2e4a3a, 0x2e4a3a], wall: 0xe8dcc0, floor: 0x8a5a3a, serif: 1 },
    diner: { sign: 'DINER', col: 0xc8383a, ink: '#ffffff', icon: 'burger', awn: [0xc8383a, 0xf4f4f4], wall: 0xf2f0ec, floor: 0xe8e8e4 },
    hardware: { sign: 'HARDWARE', col: 0xe08a1a, ink: '#2a2a2a', icon: 'hammer', awn: [0x3a5a3a, 0xe8e4dc], wall: 0xe8e4dc, floor: 0xb8b4ac },
  };
  function pawPath(c, x, y, s) {
    c.beginPath(); c.ellipse(x, y + s * 0.25, s * 0.42, s * 0.36, 0, 0, TAU); c.fill();
    for (const [dx, dy, rr] of [[-0.42, -0.2, 0.15], [-0.15, -0.45, 0.16], [0.15, -0.45, 0.16], [0.42, -0.2, 0.15]]) { c.beginPath(); c.ellipse(x + dx * s, y + dy * s, rr * s, rr * s * 1.25, dx * 0.6, 0, TAU); c.fill(); }
  }
  function heartPath(c, x, y, s) {
    c.beginPath(); c.moveTo(x, y + s * 0.42);
    c.bezierCurveTo(x - s * 0.75, y - s * 0.05, x - s * 0.38, y - s * 0.62, x, y - s * 0.22);
    c.bezierCurveTo(x + s * 0.38, y - s * 0.62, x + s * 0.75, y - s * 0.05, x, y + s * 0.42);
    c.closePath();
  }
  // a little picture for a sign, centered at (x, y), about s pixels across
  function drawIcon(c, name, x, y, s) {
    c.save(); c.lineCap = 'round'; c.lineJoin = 'round';
    const disc = (cx, cy, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.fill(); };
    if (name === 'paw') { c.fillStyle = '#f29a3a'; pawPath(c, x, y + s * 0.05, s * 0.85); }
    else if (name === 'heart') { c.fillStyle = '#e8443a'; heartPath(c, x, y + s * 0.05, s * 0.95); c.fill(); c.fillStyle = '#fff'; c.fillRect(x - s * 0.07, y - s * 0.25, s * 0.14, s * 0.42); c.fillRect(x - s * 0.21, y - s * 0.11, s * 0.42, s * 0.14); }
    else if (name === 'bread') {
      c.fillStyle = '#d89040'; c.beginPath(); c.ellipse(x, y + s * 0.05, s * 0.48, s * 0.3, 0, 0, TAU); c.fill();
      c.fillStyle = '#f0c070'; c.beginPath(); c.ellipse(x - s * 0.05, y - s * 0.02, s * 0.36, s * 0.18, 0, 0, TAU); c.fill();
      c.strokeStyle = '#a85a20'; c.lineWidth = s * 0.06; for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(x + k * s * 0.2 - s * 0.08, y + s * 0.12); c.lineTo(x + k * s * 0.2 + s * 0.08, y - s * 0.1); c.stroke(); }
    } else if (name === 'teddy') {
      for (const k of [-1, 1]) { disc(x + k * s * 0.3, y - s * 0.28, s * 0.16, '#a8642c'); disc(x + k * s * 0.3, y - s * 0.28, s * 0.08, '#e8b880'); }
      disc(x, y, s * 0.4, '#b8743a'); disc(x, y + s * 0.12, s * 0.17, '#f0c890');
      disc(x - s * 0.14, y - s * 0.08, s * 0.05, '#2a1a10'); disc(x + s * 0.14, y - s * 0.08, s * 0.05, '#2a1a10'); disc(x, y + s * 0.07, s * 0.06, '#2a1a10');
    } else if (name === 'apple') {
      c.fillStyle = '#d8302a'; c.beginPath(); c.ellipse(x - s * 0.15, y + s * 0.08, s * 0.3, s * 0.34, 0, 0, TAU); c.ellipse(x + s * 0.15, y + s * 0.08, s * 0.3, s * 0.34, 0, 0, TAU); c.fill();
      c.fillStyle = 'rgba(255,255,255,0.35)'; c.beginPath(); c.ellipse(x - s * 0.2, y - s * 0.05, s * 0.08, s * 0.14, -0.4, 0, TAU); c.fill();
      c.strokeStyle = '#5a3a1a'; c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(x, y - s * 0.22); c.lineTo(x + s * 0.04, y - s * 0.42); c.stroke();
      c.fillStyle = '#4aa040'; c.beginPath(); c.ellipse(x + s * 0.17, y - s * 0.36, s * 0.15, s * 0.07, -0.4, 0, TAU); c.fill();
    } else if (name === 'cone') {
      c.fillStyle = '#d8a058'; c.beginPath(); c.moveTo(x - s * 0.26, y - s * 0.02); c.lineTo(x + s * 0.26, y - s * 0.02); c.lineTo(x, y + s * 0.55); c.closePath(); c.fill();
      c.strokeStyle = '#a8703a'; c.lineWidth = s * 0.03; for (let k = -2; k <= 2; k++) { c.beginPath(); c.moveTo(x + k * s * 0.1, y); c.lineTo(x + k * s * 0.1 + s * 0.15, y + s * 0.25); c.stroke(); }
      disc(x, y - s * 0.1, s * 0.27, '#f6a8c0'); disc(x - s * 0.06, y - s * 0.38, s * 0.22, '#a8e0c8'); disc(x + s * 0.1, y - s * 0.55, s * 0.08, '#e8302a');
    } else if (name === 'cup') {
      c.fillStyle = '#fbfaf6'; c.beginPath(); c.moveTo(x - s * 0.3, y - s * 0.12); c.lineTo(x + s * 0.3, y - s * 0.12); c.lineTo(x + s * 0.22, y + s * 0.3); c.lineTo(x - s * 0.22, y + s * 0.3); c.closePath(); c.fill();
      c.strokeStyle = '#fbfaf6'; c.lineWidth = s * 0.08; c.beginPath(); c.arc(x + s * 0.32, y + s * 0.06, s * 0.12, -1.4, 1.4); c.stroke();
      c.fillStyle = '#fbfaf6'; c.beginPath(); c.ellipse(x, y + s * 0.34, s * 0.42, s * 0.07, 0, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(255,255,255,0.8)'; c.lineWidth = s * 0.05; for (const k of [-1, 0, 1]) { c.beginPath(); c.moveTo(x + k * s * 0.12, y - s * 0.2); c.quadraticCurveTo(x + k * s * 0.12 + s * 0.08, y - s * 0.32, x + k * s * 0.12, y - s * 0.45); c.stroke(); }
    } else if (name === 'flower') {
      c.strokeStyle = '#4aa040'; c.lineWidth = s * 0.07; c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + s * 0.5); c.stroke();
      c.fillStyle = '#4aa040'; c.beginPath(); c.ellipse(x + s * 0.12, y + s * 0.3, s * 0.13, s * 0.06, -0.5, 0, TAU); c.fill();
      for (let k = 0; k < 6; k++) { const a = k / 6 * TAU; disc(x + Math.cos(a) * s * 0.2, y - s * 0.12 + Math.sin(a) * s * 0.2, s * 0.14, '#f070a0'); }
      disc(x, y - s * 0.12, s * 0.12, '#f8d040');
    } else if (name === 'book') {
      c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(x - s * 0.5, y - s * 0.25); c.quadraticCurveTo(x - s * 0.25, y - s * 0.35, x, y - s * 0.22); c.quadraticCurveTo(x + s * 0.25, y - s * 0.35, x + s * 0.5, y - s * 0.25); c.lineTo(x + s * 0.5, y + s * 0.3); c.quadraticCurveTo(x + s * 0.25, y + s * 0.2, x, y + s * 0.33); c.quadraticCurveTo(x - s * 0.25, y + s * 0.2, x - s * 0.5, y + s * 0.3); c.closePath(); c.fill();
      c.fillStyle = '#fbf6e8'; c.beginPath(); c.moveTo(x - s * 0.44, y - s * 0.22); c.quadraticCurveTo(x - s * 0.22, y - s * 0.3, x - s * 0.02, y - s * 0.18); c.lineTo(x - s * 0.02, y + s * 0.26); c.quadraticCurveTo(x - s * 0.22, y + s * 0.16, x - s * 0.44, y + s * 0.24); c.closePath(); c.fill();
      c.beginPath(); c.moveTo(x + s * 0.44, y - s * 0.22); c.quadraticCurveTo(x + s * 0.22, y - s * 0.3, x + s * 0.02, y - s * 0.18); c.lineTo(x + s * 0.02, y + s * 0.26); c.quadraticCurveTo(x + s * 0.22, y + s * 0.16, x + s * 0.44, y + s * 0.24); c.closePath(); c.fill();
      c.strokeStyle = '#a8a090'; c.lineWidth = s * 0.025; for (let k = 0; k < 4; k++) for (const sd of [-1, 1]) { c.beginPath(); c.moveTo(x + sd * s * 0.08, y - s * 0.1 + k * s * 0.08); c.lineTo(x + sd * s * 0.38, y - s * 0.12 + k * s * 0.08); c.stroke(); }
    } else if (name === 'shirt') {
      c.fillStyle = '#5aa0d8'; c.beginPath(); c.moveTo(x - s * 0.15, y - s * 0.36); c.lineTo(x - s * 0.48, y - s * 0.2); c.lineTo(x - s * 0.36, y + s * 0.02); c.lineTo(x - s * 0.26, y - s * 0.04); c.lineTo(x - s * 0.26, y + s * 0.4); c.lineTo(x + s * 0.26, y + s * 0.4); c.lineTo(x + s * 0.26, y - s * 0.04); c.lineTo(x + s * 0.36, y + s * 0.02); c.lineTo(x + s * 0.48, y - s * 0.2); c.lineTo(x + s * 0.15, y - s * 0.36); c.quadraticCurveTo(x, y - s * 0.22, x - s * 0.15, y - s * 0.36); c.fill();
    } else if (name === 'barrel') {
      c.fillStyle = '#9a6030'; c.beginPath(); c.ellipse(x, y, s * 0.32, s * 0.42, 0, 0, TAU); c.fill(); c.fillRect(x - s * 0.3, y - s * 0.38, s * 0.6, s * 0.76);
      c.fillStyle = '#4a4040'; for (const k of [-0.25, 0.25]) c.fillRect(x - s * 0.33, y + k * s - s * 0.04, s * 0.66, s * 0.08);
      c.strokeStyle = '#7a4a20'; c.lineWidth = s * 0.03; for (const k of [-0.15, 0, 0.15]) { c.beginPath(); c.moveTo(x + k * s, y - s * 0.38); c.lineTo(x + k * s, y + s * 0.38); c.stroke(); }
    } else if (name === 'letter') {
      c.fillStyle = '#fbfaf6'; c.fillRect(x - s * 0.45, y - s * 0.28, s * 0.9, s * 0.56);
      c.strokeStyle = '#8a8a8a'; c.lineWidth = s * 0.04; c.beginPath(); c.moveTo(x - s * 0.45, y - s * 0.28); c.lineTo(x, y + s * 0.06); c.lineTo(x + s * 0.45, y - s * 0.28); c.stroke();
      c.fillStyle = '#d8302a'; c.fillRect(x + s * 0.22, y - s * 0.24, s * 0.16, s * 0.16);
    } else if (name === 'burger') {
      c.fillStyle = '#d89040'; c.beginPath(); c.ellipse(x, y - s * 0.1, s * 0.42, s * 0.26, 0, PI, TAU); c.fill();
      c.fillStyle = '#4aa040'; c.fillRect(x - s * 0.44, y - s * 0.08, s * 0.88, s * 0.08);
      c.fillStyle = '#6a3a1a'; c.fillRect(x - s * 0.42, y, s * 0.84, s * 0.13);
      c.fillStyle = '#f2c43a'; c.fillRect(x - s * 0.44, y - s * 0.02, s * 0.88, s * 0.04);
      c.fillStyle = '#d89040'; c.fillRect(x - s * 0.4, y + s * 0.13, s * 0.8, s * 0.12);
      c.fillStyle = '#fff'; for (const k of [-0.2, 0, 0.2]) { c.beginPath(); c.ellipse(x + k * s, y - s * 0.22, s * 0.025, s * 0.015, 0.3, 0, TAU); c.fill(); }
    } else if (name === 'hammer') {
      c.save(); c.translate(x, y); c.rotate(-0.6);
      c.fillStyle = '#a8703a'; c.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.6); c.fillStyle = '#5a5e62'; c.fillRect(-s * 0.25, -s * 0.32, s * 0.5, s * 0.16);
      c.restore(); c.save(); c.translate(x, y); c.rotate(0.6);
      c.fillStyle = '#9aa2a8'; c.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.56); c.beginPath(); c.arc(0, -s * 0.26, s * 0.13, 0, TAU); c.fill();
      c.fillStyle = '#4a4e52'; c.beginPath(); c.arc(0, -s * 0.28, s * 0.05, 0, TAU); c.fill();
      c.restore();
    }
    c.restore();
  }
  // a sign board: background, border, the name in big friendly letters and the picture at both ends
  function drawSign(c, K2, text, x, y, w, h, town) {
    c.save(); c.translate(x, y);
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, css(K2.col, 1.12)); g.addColorStop(1, css(K2.col, 0.82));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.strokeStyle = town ? 'rgba(236,202,116,0.9)' : 'rgba(255,255,255,0.55)'; c.lineWidth = h * 0.05; c.strokeRect(h * 0.08, h * 0.08, w - h * 0.16, h - h * 0.16);
    const iw = h * 0.95, room = w - iw * 2 - h * 0.4;
    let fs = Math.round(h * 0.66);
    const fnt = (n) => (K2.serif || town ? SERIF(n) : FONT(n));
    c.font = fnt(fs);
    while (fs > 10 && c.measureText(text).width > room) { fs -= 2; c.font = fnt(fs); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.3)'; c.fillText(text, w / 2 + h * 0.03, h * 0.55 + h * 0.03);
    c.fillStyle = K2.ink; c.fillText(text, w / 2, h * 0.55);
    if (town) { c.fillStyle = K2.ink; for (const s of [-1, 1]) { c.beginPath(); c.arc(w / 2 + s * (c.measureText(text).width / 2 + h * 0.22), h * 0.52, h * 0.05, 0, TAU); c.fill(); } }
    drawIcon(c, K2.icon, iw * 0.62, h * 0.52, h * 0.78); drawIcon(c, K2.icon, w - iw * 0.62, h * 0.52, h * 0.78);
    c.restore();
  }

  /* a painted store inside in one point perspective (what you see through the display windows), per kind */
  function drawBackdrop(c, kind, x, y, w, h, r) {
    const K2 = KINDS[kind] || KINDS.general;
    c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
    const bx0 = x + w * 0.26, bx1 = x + w * 0.74, by0 = y + h * 0.17, by1 = y + h * 0.68;
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.closePath(); c.fill(); };
    const wall = K2.wall, fl = K2.floor;
    poly([[x, y], [x + w, y], [bx1, by0], [bx0, by0]], css(wall, 0.9));
    poly([[x, y + h], [x + w, y + h], [bx1, by1], [bx0, by1]], css(fl));
    c.strokeStyle = 'rgba(0,0,0,0.12)'; c.lineWidth = 1;
    for (let k = 0; k <= 10; k++) { const t = k / 10; c.beginPath(); c.moveTo(lerp(x - w * 0.2, x + w * 1.2, t), y + h); c.lineTo(lerp(bx0, bx1, t), by1); c.stroke(); }
    for (let k = 1; k < 6; k++) { const t = 1 - Math.pow(1 - k / 6, 1.7); const yy = lerp(y + h, by1, t); c.beginPath(); c.moveTo(lerp(x, bx0, t), yy); c.lineTo(lerp(x + w, bx1, t), yy); c.stroke(); }
    poly([[x, y], [bx0, by0], [bx0, by1], [x, y + h]], css(wall, 0.82));
    poly([[x + w, y], [bx1, by0], [bx1, by1], [x + w, y + h]], css(wall, 0.76));
    c.fillStyle = css(wall); c.fillRect(bx0, by0, bx1 - bx0, by1 - by0);
    // base boards
    c.strokeStyle = 'rgba(60,40,30,0.35)'; c.lineWidth = 2;
    c.beginPath(); c.moveTo(x, y + h - 2); c.lineTo(bx0, by1 - 1); c.lineTo(bx1, by1 - 1); c.lineTo(x + w, y + h - 2); c.stroke();
    const P = (side, t, s) => { const fx = side < 0 ? x : x + w, bx = side < 0 ? bx0 : bx1; return [lerp(fx, bx, t), lerp(y + h - s * h, by1 - s * (by1 - by0), t)]; };
    const Bk = (u, s) => [lerp(bx0, bx1, u), by1 - s * (by1 - by0)];
    const rect = (px, py, pw, ph, col, hi = 0.15) => { c.fillStyle = col; c.fillRect(px, py, pw, ph); if (hi) { c.fillStyle = `rgba(255,255,255,${hi})`; c.fillRect(px, py, pw, Math.max(1, ph * 0.18)); } };
    const disc = (px, py, rr, col) => { c.fillStyle = col; c.beginPath(); c.arc(px, py, Math.max(0.6, rr), 0, TAU); c.fill(); };
    const sideWall = (side, levels, item, step = 0.07, t0 = 0.03, t1 = 0.97) => {
      for (const s of levels) {
        const a = P(side, t0, s), b = P(side, t1, s);
        c.strokeStyle = 'rgba(90,64,40,0.9)'; c.lineWidth = 2; c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        for (let t = t0 + step / 2; t < t1; t += step * (1 - t * 0.55)) { const p = P(side, t, s); item(p[0], p[1], 1 - t * 0.62, t); }
      }
    };
    const backShelves = (levels, item, n = 14, u0 = 0.04, u1 = 0.96) => {
      for (const s of levels) {
        const a = Bk(u0, s), b = Bk(u1, s);
        c.fillStyle = 'rgba(90,64,40,0.9)'; c.fillRect(a[0], a[1], b[0] - a[0], 1.6);
        for (let k = 0; k < n; k++) { const p = Bk(u0 + (u1 - u0) * (k + 0.5) / n, s); item(p[0], p[1], 0.38, k); }
      }
    };
    const pend = (px, py, len, col = '#f8e8c0') => { c.strokeStyle = 'rgba(30,24,20,0.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, y); c.lineTo(px, py); c.stroke(); c.fillStyle = '#3a3430'; c.beginPath(); c.moveTo(px - len, py + len * 0.7); c.lineTo(px + len, py + len * 0.7); c.lineTo(px + len * 0.4, py); c.lineTo(px - len * 0.4, py); c.fill(); c.fillStyle = col; c.fillRect(px - len * 0.8, py + len * 0.7, len * 1.6, 2); };
    const ceilingLights = () => { for (let k = 0; k < 3; k++) { const t = 0.15 + k * 0.32, yy = lerp(y, by0, t), xa = lerp(x, bx0, t), xb = lerp(x + w, bx1, t); c.fillStyle = 'rgba(255,252,240,0.95)'; c.fillRect(lerp(xa, xb, 0.32), yy, (xb - xa) * 0.36, Math.max(1.5, 4 * (1 - t))); } };
    const cols = [0xd8443a, 0x3a7ac8, 0x4aa860, 0xf2c43a, 0x9a5ac8, 0xf08a3a, 0x2ab0b0, 0xe86a9a];
    const pc = () => css(pick(r, cols), 0.75 + r() * 0.3);
    if (kind === 'pet') {
      ceilingLights();
      sideWall(-1, [0.08, 0.36, 0.64], (px, py, s) => { const bw = 9 * s, bh = 14 * s; rect(px - bw / 2, py - bh, bw, bh, css(pick(r, [0xb8401e, 0x245a9a, 0x2e7a3e, 0xc8901a]), 0.9)); rect(px - bw / 3, py - bh * 0.62, bw * 0.66, bh * 0.3, '#f6ecd2', 0); });
      // fish tanks on the right wall, glowing blue with fish
      for (const s of [0.18, 0.5]) for (let t = 0.06; t < 0.9; t += 0.2) {
        const a = P(1, t, s), b = P(1, t + 0.16, s + 0.24), sc = 1 - t * 0.6;
        c.fillStyle = '#2a2a2a'; c.fillRect(Math.min(a[0], b[0]) - 1, b[1] - 1, Math.abs(b[0] - a[0]) + 2, a[1] - b[1] + 2);
        const g = c.createLinearGradient(0, b[1], 0, a[1]); g.addColorStop(0, '#8ad0f0'); g.addColorStop(1, '#2a7ab0');
        c.fillStyle = g; c.fillRect(Math.min(a[0], b[0]), b[1], Math.abs(b[0] - a[0]), a[1] - b[1]);
        for (let k = 0; k < 4; k++) { c.fillStyle = pick(r, ['#f28a2a', '#f2d040', '#e84a6a', '#6ad0f0']); c.beginPath(); c.ellipse(lerp(a[0], b[0], 0.2 + r() * 0.6), lerp(a[1], b[1], 0.25 + r() * 0.5), 3 * sc, 1.6 * sc, 0, 0, TAU); c.fill(); }
        c.fillStyle = '#3a8a3a'; c.fillRect(lerp(a[0], b[0], 0.7), a[1] - 6 * sc, 2 * sc, 6 * sc);
      }
      backShelves([0.08, 0.36, 0.62], (px, py, s, k) => { if (k % 3 === 0) disc(px, py - 4, 3.5, pick(r, ['#e84a3a', '#3a8ad0', '#f2c43a'])); else rect(px - 3, py - 8, 6, 8, css(pick(r, [0xc8b8a0, 0x8a5a3a, 0x3a6aa0, 0xd8443a]))); }, 16);
      c.fillStyle = css(K2.col); const lp = Bk(0.5, 0.86); pawPath(c, lp[0], lp[1], 9);
      disc(x + w * 0.42, y + h * 0.9, 14, '#8a5a8a'); disc(x + w * 0.42, y + h * 0.89, 10, '#e8dcc8');
    } else if (kind === 'vet') {
      ceilingLights();
      // reception desk with the heart and cross over it, waiting chairs, a poster and a plant
      const d0 = Bk(0.18, 0), d1 = Bk(0.82, 0.3);
      rect(d0[0], d1[1], d1[0] - d0[0], d0[1] - d1[1], '#c8a070'); rect(d0[0] - 2, d1[1] - 2, d1[0] - d0[0] + 4, 3, '#f4f2ec', 0);
      const hp = Bk(0.5, 0.72); c.fillStyle = '#e8443a'; heartPath(c, hp[0], hp[1], 16); c.fill(); c.fillStyle = '#fff'; c.fillRect(hp[0] - 1.5, hp[1] - 6, 3, 9); c.fillRect(hp[0] - 4.5, hp[1] - 3, 9, 3);
      sideWall(-1, [0.22], (px, py, s) => { rect(px - 7 * s, py - 10 * s, 14 * s, 10 * s, '#3a78b8'); rect(px - 7 * s, py - 20 * s, 14 * s, 4 * s, '#3a78b8'); }, 0.16);
      const pa = P(1, 0.3, 0.45), pb = P(1, 0.5, 0.78); rect(pa[0] - (pa[0] - pb[0]), pb[1], pa[0] - pb[0], pa[1] - pb[1], '#fbf8f0'); c.fillStyle = '#f29a3a'; pawPath(c, (pa[0] + pb[0]) / 2, (pa[1] + pb[1]) / 2, 7);
      const da = P(1, 0.62, 0), db = P(1, 0.8, 0.75); rect(db[0], db[1], da[0] - db[0], da[1] - db[1], '#9ab8c8', 0);
      for (let k = 0; k < 8; k++) disc(x + w * 0.88 + (r() - 0.5) * 14, y + h * 0.78 - r() * 16, 6, k % 2 ? '#3e7a2e' : '#5a9a3a');
      rect(x + w * 0.86, y + h * 0.82, 10, 12, '#b8603a');
    } else if (kind === 'bakery') {
      for (const u of [0.25, 0.5, 0.75]) pend(lerp(x + w * 0.1, x + w * 0.9, u), y + h * 0.1, 6);
      backShelves([0.3, 0.52, 0.74], (px, py, s, k) => { c.fillStyle = pick(r, ['#c8803a', '#d89a4a', '#a86a2a', '#e8b060']); c.beginPath(); c.ellipse(px, py - 3.5, 6, 3.5, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,230,180,0.6)'; c.fillRect(px - 3, py - 5, 6, 1); }, 9);
      sideWall(-1, [0.3, 0.55], (px, py, s) => { c.fillStyle = pick(r, ['#c8803a', '#e0a050']); c.beginPath(); c.ellipse(px, py - 4 * s, 7 * s, 4 * s, 0, 0, TAU); c.fill(); }, 0.1);
      sideWall(1, [0.3, 0.55], (px, py, s) => { c.fillStyle = '#d8a050'; c.fillRect(px - 1.5 * s, py - 16 * s, 3 * s, 16 * s); }, 0.06);
      // the glass case across the front with cakes
      const cy0 = y + h * 0.66, cy1 = y + h * 0.98;
      rect(x + w * 0.08, cy0, w * 0.84, cy1 - cy0, '#7a4a2a');
      c.fillStyle = 'rgba(220,240,250,0.55)'; c.fillRect(x + w * 0.08, cy0 - h * 0.14, w * 0.84, h * 0.14);
      for (let k = 0; k < 7; k++) { const px = x + w * (0.14 + k * 0.12), py = cy0 - 2; rect(px - 9, py - 9, 18, 9, pick(r, ['#f4e8d8', '#6a3a24', '#f6b8c8', '#f8f0e0']), 0.3); rect(px - 9, py - 11, 18, 2, pick(r, ['#e8443a', '#f4f4f0', '#8a4a2a']), 0); }
      const mb = Bk(0.08, 0.8); rect(mb[0], mb[1] - 2, w * 0.14, h * 0.12, '#2a3a32', 0); c.fillStyle = '#f4f0e0'; for (let k = 0; k < 3; k++) c.fillRect(mb[0] + 4, mb[1] + 2 + k * 5, w * 0.1, 1.2);
    } else if (kind === 'toy') {
      ceilingLights();
      const toy = (px, py, s) => { const k = r(); if (k < 0.3) disc(px, py - 4 * s, 4 * s, pc()); else if (k < 0.55) { disc(px, py - 5 * s, 4.5 * s, '#b8743a'); disc(px - 3 * s, py - 9 * s, 1.8 * s, '#a8642c'); disc(px + 3 * s, py - 9 * s, 1.8 * s, '#a8642c'); } else rect(px - 4 * s, py - 10 * s, 8 * s, 10 * s, pc()); };
      sideWall(-1, [0.06, 0.32, 0.58], toy, 0.08); sideWall(1, [0.06, 0.32, 0.58], toy, 0.08);
      backShelves([0.08, 0.38, 0.66], (px, py, s) => toy(px, py, 0.55), 12);
      // a kite hanging from the ceiling and a toy train on the floor
      c.fillStyle = '#e8443a'; c.beginPath(); c.moveTo(x + w * 0.5, y + h * 0.04); c.lineTo(x + w * 0.56, y + h * 0.16); c.lineTo(x + w * 0.5, y + h * 0.3); c.lineTo(x + w * 0.44, y + h * 0.16); c.fill();
      c.fillStyle = '#f2c43a'; c.beginPath(); c.moveTo(x + w * 0.5, y + h * 0.04); c.lineTo(x + w * 0.56, y + h * 0.16); c.lineTo(x + w * 0.5, y + h * 0.16); c.fill();
      for (let k = 0; k < 4; k++) { const px = x + w * (0.3 + k * 0.1), py = y + h * 0.9; rect(px, py - 10, w * 0.085, 10, ['#d8443a', '#3a7ac8', '#4aa860', '#f2c43a'][k]); disc(px + 4, py, 2.5, '#222'); disc(px + w * 0.085 - 4, py, 2.5, '#222'); }
    } else if (kind === 'grocery') {
      ceilingLights();
      // aisles running back, shelves full of packages, produce bins in front
      for (const u of [0.18, 0.5, 0.82]) {
        const f0 = [lerp(x, x + w, u) - w * 0.07, y + h * 0.95], b0 = Bk(u, 0);
        const top = (pt) => [pt[0], pt[1] - (pt === f0 ? h * 0.42 : (by1 - by0) * 0.45)];
        const g0 = top(f0), g1 = top(b0);
        poly([[f0[0], f0[1]], [b0[0], b0[1]], [g1[0], g1[1]], [g0[0], g0[1]]], '#d8d4cc');
        for (let k = 0; k < 4; k++) { const s0 = k / 4 + 0.06; const a = [lerp(f0[0], g0[0], s0), lerp(f0[1], g0[1], s0)], b = [lerp(b0[0], g1[0], s0), lerp(b0[1], g1[1], s0)]; for (let t = 0; t < 1; t += 0.08) { const px = lerp(a[0], b[0], t), py = lerp(a[1], b[1], t), sc = 1 - t * 0.7; rect(px - 3 * sc, py - 8 * sc, 6 * sc, 8 * sc, pc(), 0.2); } }
      }
      backShelves([0.1, 0.4], (px, py) => rect(px - 3, py - 7, 6, 7, pc()), 18);
      for (let k = 0; k < 5; k++) { const px = x + w * (0.08 + k * 0.2); rect(px - 16, y + h * 0.9, 32, h * 0.1, '#8a6a4a'); for (let j = 0; j < 9; j++) disc(px - 12 + (j % 5) * 6, y + h * 0.9 - 2 - Math.floor(j / 5) * 4, 3, ['#d8302a', '#f08a2a', '#f2d040', '#5aa83a', '#8a2a5a'][k]); }
    } else if (kind === 'icecream') {
      // pink walls with stripes, a menu board, the freezer counter with tubs
      for (let k = 0; k < 12; k++) { c.fillStyle = 'rgba(255,255,255,0.35)'; const a = Bk(k / 12, 0.35), b = Bk(k / 12 + 0.04, 1); c.fillRect(a[0], b[1], b[0] - a[0], a[1] - b[1]); }
      const m0 = Bk(0.12, 0.92), m1 = Bk(0.88, 0.5); rect(m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1], '#4a2a3a', 0);
      for (let k = 0; k < 6; k++) { const px = lerp(m0[0], m1[0], (k + 0.5) / 6); disc(px, m0[1] + 8, 4, ['#f6a8c0', '#a8e0c8', '#f8e8b0', '#8a5a3a', '#c8a0e0', '#f8f4f0'][k]); c.fillStyle = '#d8a058'; c.beginPath(); c.moveTo(px - 3, m0[1] + 10); c.lineTo(px + 3, m0[1] + 10); c.lineTo(px, m0[1] + 18); c.fill(); }
      const cy0 = y + h * 0.62;
      rect(x + w * 0.06, cy0, w * 0.88, h * 0.38, '#f4f0f2');
      c.fillStyle = 'rgba(200,230,245,0.6)'; c.fillRect(x + w * 0.06, cy0 - h * 0.1, w * 0.88, h * 0.1);
      for (let k = 0; k < 10; k++) { const px = x + w * (0.1 + k * 0.085); rect(px, cy0 + 3, w * 0.07, 8, ['#f6a8c0', '#a8e0c8', '#f8e8b0', '#8a5a3a', '#c8a0e0', '#f8f4f0', '#f0c0a0', '#e8443a', '#7ac0e8', '#f2d040'][k], 0.35); }
      for (const u of [0.2, 0.8]) pend(x + w * u, y + h * 0.08, 5, '#fff0f8');
    } else if (kind === 'cafe') {
      for (const u of [0.25, 0.5, 0.75]) pend(lerp(x + w * 0.1, x + w * 0.9, u), y + h * 0.14, 5, '#ffe0a0');
      const m0 = Bk(0.1, 0.95), m1 = Bk(0.9, 0.55); rect(m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1], '#22302a', 0);
      c.fillStyle = 'rgba(245,240,225,0.9)'; c.font = SERIF(10); c.textAlign = 'center'; c.fillText('COFFEE  TEA  CAKE', (m0[0] + m1[0]) / 2, m0[1] + 13); for (let k = 0; k < 3; k++) c.fillRect(m0[0] + 8, m0[1] + 20 + k * 5, (m1[0] - m0[0]) - 16, 1);
      const k0 = Bk(0.05, 0), k1 = Bk(0.95, 0.32); rect(k0[0], k1[1], k1[0] - k0[0], k0[1] - k1[1], '#6a4028');
      rect(k0[0] + 8, k1[1] - 12, 22, 12, '#c8ccd0'); rect(k0[0] + 10, k1[1] - 15, 18, 3, '#8a8e92', 0);
      for (let k = 0; k < 5; k++) rect(k0[0] + 40 + k * 6, k1[1] - 5, 4, 5, '#f8f6f0', 0);
      c.fillStyle = 'rgba(220,240,250,0.5)'; c.fillRect(k1[0] - 44, k1[1] - 10, 40, 10); for (let k = 0; k < 4; k++) disc(k1[0] - 40 + k * 10, k1[1] - 3, 3, '#d89a4a');
      for (const u of [0.16, 0.84]) { const px = x + w * u, py = y + h * 0.86; rect(px - 14, py - 4, 28, 3, '#3a2a20', 0); rect(px - 1.5, py - 1, 3, 14, '#3a2a20', 0); disc(px - 5, py - 7, 3, '#f8f6f0'); }
      sideWall(-1, [0.6], (px, py, s) => rect(px - 6 * s, py - 9 * s, 12 * s, 9 * s, pick(r, ['#5a7a5a', '#8a6a4a', '#c8b090'])), 0.18);
    } else if (kind === 'flower') {
      // tiers of buckets with flowers, plants, hanging baskets
      for (let tier = 0; tier < 3; tier++) {
        const yy = y + h * (0.98 - tier * 0.16), x0 = x + w * (0.04 + tier * 0.08), x1 = x + w * (0.96 - tier * 0.08);
        rect(x0, yy - 3, x1 - x0, 3, '#8a6a4a', 0);
        for (let px = x0 + 8; px < x1 - 4; px += 13) { rect(px - 5, yy - 12, 10, 9, '#6a7a82', 0.25); const fc = pick(r, ['#e8405a', '#f2c83a', '#f4f0f0', '#d05aa0', '#e8603a', '#9a6ad8']); for (let k = 0; k < 6; k++) disc(px + (r() - 0.5) * 11, yy - 15 - r() * 9, 2.6, k < 2 ? '#3e7a2e' : fc); }
      }
      sideWall(-1, [0.55, 0.8], (px, py, s) => { for (let k = 0; k < 4; k++) disc(px + (r() - 0.5) * 8 * s, py - 5 * s - r() * 5 * s, 3.5 * s, k % 2 ? '#3e7a2e' : '#5a9a3a'); }, 0.12);
      sideWall(1, [0.55, 0.8], (px, py, s) => { for (let k = 0; k < 4; k++) disc(px + (r() - 0.5) * 8 * s, py - 5 * s - r() * 5 * s, 3.5 * s, k % 3 ? '#4a8a3a' : '#f070a0'); }, 0.12);
      for (const u of [0.3, 0.7]) { const px = x + w * u, py = y + h * 0.18; c.strokeStyle = '#3a3a3a'; c.lineWidth = 1; c.beginPath(); c.moveTo(px, y); c.lineTo(px, py); c.stroke(); for (let k = 0; k < 7; k++) disc(px + (r() - 0.5) * 16, py + r() * 8, 3.5, k % 2 ? '#3e7a2e' : '#e8608a'); }
    } else if (kind === 'books' || kind === 'library') {
      for (const u of [0.3, 0.7]) pend(x + w * u, y + h * 0.12, 5, '#ffe8b0');
      const spines = (px, py, s) => { let xx = px - 6 * s; while (xx < px + 6 * s) { const bw = (1.5 + r() * 2) * s; rect(xx, py - (9 + r() * 4) * s, bw, (9 + r() * 4) * s, css(pick(r, [0xa83232, 0x2e5a8a, 0x3a7a4a, 0xd8a83a, 0x6a3a7a, 0xe8dcc0, 0x2a2a2a, 0xc8642a]), 0.85), 0); xx += bw + 0.5; } };
      for (const side of [-1, 1]) {
        const a0 = P(side, 0.02, 0.02), a1 = P(side, 0.98, 0.02), b0 = P(side, 0.02, 0.9), b1 = P(side, 0.98, 0.9);
        poly([a0, a1, b1, b0], '#6a4028');
        sideWall(side, [0.04, 0.22, 0.4, 0.58, 0.76], spines, 0.1);
      }
      c.fillStyle = '#6a4028'; const q0 = Bk(0.02, 0.02), q1 = Bk(0.98, 0.9); c.fillRect(q0[0], q1[1], q1[0] - q0[0], q0[1] - q1[1]);
      backShelves([0.04, 0.24, 0.44, 0.64], (px, py) => spines(px, py, 0.5), 10);
      if (kind === 'library') { for (const u of [0.32, 0.68]) { const px = x + w * u, py = y + h * 0.84; rect(px - 22, py - 3, 44, 4, '#5a3a24', 0); rect(px - 2, py - 10, 4, 7, '#2e6a3a', 0); disc(px, py - 11, 4, '#ffe8a0'); } }
      else { rect(x + w * 0.36, y + h * 0.82, w * 0.28, 5, '#5a3a24', 0); for (let k = 0; k < 6; k++) rect(x + w * (0.38 + k * 0.04), y + h * 0.82 - 4 - (k % 3) * 2, w * 0.03, 4 + (k % 3) * 2, pc(), 0); }
    } else if (kind === 'clothes') {
      ceilingLights();
      const rack = (px, py, s) => { c.strokeStyle = '#8a8a8a'; c.lineWidth = 1; c.beginPath(); c.moveTo(px - 8 * s, py - 18 * s); c.lineTo(px + 8 * s, py - 18 * s); c.stroke(); for (let k = 0; k < 5; k++) rect(px - 7 * s + k * 3.2 * s, py - 17 * s, 2.6 * s, 13 * s, pc(), 0); };
      sideWall(-1, [0.1], rack, 0.16); sideWall(1, [0.1], rack, 0.16);
      backShelves([0.1, 0.35, 0.6], (px, py) => { for (let k = 0; k < 3; k++) rect(px - 4, py - 2 - k * 2, 8, 2, pc(), 0); }, 8);
      const mm = Bk(0.5, 0.0); rect(mm[0] - 8, mm[1] - (by1 - by0) * 0.85, 16, (by1 - by0) * 0.85, '#c8d8e0'); c.fillStyle = 'rgba(255,255,255,0.4)'; c.fillRect(mm[0] - 6, mm[1] - (by1 - by0) * 0.8, 4, (by1 - by0) * 0.7);
      for (const u of [0.22, 0.78]) { const px = x + w * u, py = y + h * 0.9; disc(px, py - 42, 4, '#e8dcd0'); c.fillStyle = pc(); c.beginPath(); c.moveTo(px - 6, py - 37); c.lineTo(px + 6, py - 37); c.lineTo(px + 10, py - 12); c.lineTo(px - 10, py - 12); c.fill(); rect(px - 1, py - 12, 2, 12, '#8a8a8a', 0); }
    } else if (kind === 'general') {
      for (const u of [0.3, 0.7]) pend(x + w * u, y + h * 0.12, 5, '#ffe0a0');
      const jar = (px, py, s) => { rect(px - 3 * s, py - 9 * s, 6 * s, 9 * s, 'rgba(200,220,210,0.85)'); rect(px - 2.5 * s, py - 6 * s, 5 * s, 6 * s, pick(r, ['#d8443a', '#f2a03a', '#8a3a5a', '#e8c040', '#6a3a1a']), 0); rect(px - 3 * s, py - 10.5 * s, 6 * s, 1.5 * s, '#c8a040', 0); };
      for (const side of [-1, 1]) { poly([P(side, 0.02, 0.02), P(side, 0.98, 0.02), P(side, 0.98, 0.85), P(side, 0.02, 0.85)], '#7a5030'); sideWall(side, [0.05, 0.3, 0.55], (px, py, s) => (r() < 0.5 ? jar(px, py, s) : rect(px - 4 * s, py - 9 * s, 8 * s, 9 * s, pc())), 0.07); }
      backShelves([0.08, 0.38, 0.66], (px, py) => jar(px, py, 0.6), 14);
      const k0 = Bk(0.1, 0), k1 = Bk(0.9, 0.3); rect(k0[0], k1[1], k1[0] - k0[0], k0[1] - k1[1], '#8a5a34'); rect(k0[0] + 10, k1[1] - 8, 14, 8, '#c8a040');
      for (const u of [0.1, 0.9]) { const px = x + w * u, py = y + h * 0.98; rect(px - 9, py - 22, 18, 22, '#9a6030'); rect(px - 10, py - 16, 20, 2, '#3a3030', 0); rect(px - 10, py - 7, 20, 2, '#3a3030', 0); }
    } else if (kind === 'post') {
      ceilingLights();
      // the wall of post office boxes, a counter with windows, packages
      const q0 = Bk(0.04, 0.3), q1 = Bk(0.96, 0.95);
      rect(q0[0], q1[1], q1[0] - q0[0], q0[1] - q1[1], '#8a6a3a');
      for (let j = 0; j < 6; j++) for (let i = 0; i < 16; i++) { const px = lerp(q0[0], q1[0], (i + 0.1) / 16), py = lerp(q1[1], q0[1], (j + 0.1) / 6); rect(px, py, (q1[0] - q0[0]) / 16 - 1.2, (q0[1] - q1[1]) / 6 - 1.2, '#c8a858', 0.25); }
      const k0 = Bk(0.0, 0), k1 = Bk(1, 0.3); rect(k0[0], k1[1], k1[0] - k0[0], k0[1] - k1[1], '#5a4a3a');
      sideWall(-1, [0.0], (px, py, s) => { rect(px - 6 * s, py - 8 * s, 12 * s, 8 * s, '#c8a070'); rect(px - 6 * s, py - 4.5 * s, 12 * s, 1.2 * s, '#e8dcc0', 0); }, 0.15);
      const pa = P(1, 0.25, 0.5), pb = P(1, 0.45, 0.8); rect(pb[0], pb[1], pa[0] - pb[0], pa[1] - pb[1], '#22406a'); c.fillStyle = '#fff'; c.fillRect(pb[0] + 3, pb[1] + 3, pa[0] - pb[0] - 6, 4);
    } else if (kind === 'diner') {
      // the long counter with stools, booths along the side, a pie case, the menu boards
      const m0 = Bk(0.05, 0.98), m1 = Bk(0.95, 0.66); rect(m0[0], m0[1], m1[0] - m0[0], m1[1] - m0[1], '#2a2a2a', 0);
      c.fillStyle = '#f4f0e0'; for (let k = 0; k < 4; k++) c.fillRect(m0[0] + 6 + k * (m1[0] - m0[0]) / 4, m0[1] + 4, (m1[0] - m0[0]) / 4 - 12, 1.5);
      const k0 = Bk(0, 0), k1 = Bk(1, 0.34); rect(k0[0], k1[1], k1[0] - k0[0], k0[1] - k1[1], '#c8ccd0'); rect(k0[0], k1[1], k1[0] - k0[0], 3, '#c83a3a', 0);
      c.fillStyle = 'rgba(220,240,250,0.6)'; c.fillRect(k1[0] - 40, k1[1] - 12, 34, 12); for (let k = 0; k < 3; k++) disc(k1[0] - 34 + k * 11, k1[1] - 4, 4, '#d8903a');
      for (let k = 0; k < 6; k++) { const px = lerp(x + w * 0.2, x + w * 0.8, k / 5), py = y + h * 0.92; rect(px - 1, py - 10, 2, 10, '#c8ccd0', 0); c.fillStyle = '#c83a3a'; c.beginPath(); c.ellipse(px, py - 11, 5, 2, 0, 0, TAU); c.fill(); }
      sideWall(1, [0.0], (px, py, s) => { rect(px - 8 * s, py - 16 * s, 16 * s, 16 * s, '#c83a3a'); rect(px - 6 * s, py - 9 * s, 12 * s, 2 * s, '#f4f4f4', 0); }, 0.22);
      c.fillStyle = 'rgba(255,255,255,0.12)'; for (let k = 0; k < 8; k++) c.fillRect(x + (k % 2) * w * 0.5, y + h * 0.96, w * 0.06, h * 0.04);
    } else if (kind === 'hardware') {
      ceilingLights();
      // pegboard with tools on the left, paint cans on the right, buckets and hoses at the back
      poly([P(-1, 0.02, 0.15), P(-1, 0.98, 0.15), P(-1, 0.98, 0.85), P(-1, 0.02, 0.85)], '#b89a6a');
      sideWall(-1, [0.3, 0.55, 0.78], (px, py, s) => { const k = r(); c.strokeStyle = k < 0.5 ? '#5a5e62' : '#c8402a'; c.lineWidth = 2 * s; c.beginPath(); c.moveTo(px, py - 10 * s); c.lineTo(px + (k - 0.5) * 4 * s, py); c.stroke(); }, 0.05);
      sideWall(1, [0.05, 0.3, 0.55], (px, py, s) => { rect(px - 3.5 * s, py - 7 * s, 7 * s, 7 * s, '#c8ccd0'); rect(px - 3.5 * s, py - 5 * s, 7 * s, 3 * s, pc(), 0); }, 0.07);
      backShelves([0.06, 0.36, 0.64], (px, py, s, k) => (k % 2 ? rect(px - 4, py - 8, 8, 8, '#e08a1a') : disc(px, py - 4, 4, '#3a8a3a')), 14);
    } else {
      // the generic aisle seen through a door
      ceilingLights();
      sideWall(-1, [0.1, 0.4, 0.7], (px, py, s) => rect(px - 4 * s, py - 9 * s, 8 * s, 9 * s, pc()), 0.07);
      sideWall(1, [0.1, 0.4, 0.7], (px, py, s) => rect(px - 4 * s, py - 9 * s, 8 * s, 9 * s, pc()), 0.07);
      backShelves([0.1, 0.4, 0.7], (px, py) => rect(px - 3, py - 7, 6, 7, pc()), 12);
    }
    // soft vignette and warm light
    const vg = c.createRadialGradient(x + w / 2, y + h * 0.4, h * 0.2, x + w / 2, y + h * 0.5, w * 0.7); vg.addColorStop(0, 'rgba(255,240,210,0.08)'); vg.addColorStop(1, 'rgba(30,20,10,0.35)');
    c.fillStyle = vg; c.fillRect(x, y, w, h);
    c.restore();
  }

  /* the store atlas (city) and the shop atlas (towns): sign boards in 512 x 64 cells, a row of small pieces
     (OPEN sign, a white glow patch), then 3 x 4 painted insides of 341 x 160 (city) or 341 x 144 (towns) */
  const ATLAS_SIGN_H = 64;
  function atlasLayout(town) {
    const kinds = town ? SHOP_KINDS : STORE_KINDS;
    const signRows = Math.ceil(kinds.length / 2), miscY = signRows * ATLAS_SIGN_H, bdY = miscY + 64, bdH = Math.floor((1024 - bdY) / 4);
    return { kinds, miscY, bdY, bdH, bdW: 341 };
  }
  const atlasRect = (px, py, pw, ph) => [px / 1024, 1 - (py + ph) / 1024, (px + pw) / 1024, 1 - py / 1024];
  function atlasUV(town, what, kind) {
    const A = atlasLayout(town), i = A.kinds.indexOf(kind);
    if (what === 'sign') return atlasRect((i % 2) * 512 + 1, Math.floor(i / 2) * ATLAS_SIGN_H + 1, 510, ATLAS_SIGN_H - 2);
    if (what === 'open') return atlasRect(2, A.miscY + 2, 124, 60);
    if (what === 'white') return atlasRect(140, A.miscY + 10, 40, 40);
    if (what === 'hours') return atlasRect(200, A.miscY + 4, 52, 56);
    // 'door': the middle of the store's own inside picture (seen through the glass door)
    if (what === 'door') return atlasRect((i % 3) * A.bdW + A.bdW * 0.36, A.bdY + Math.floor(i / 3) * A.bdH + 2, A.bdW * 0.28, A.bdH - 4);
    return atlasRect((i % 3) * A.bdW + 1, A.bdY + Math.floor(i / 3) * A.bdH + 1, A.bdW - 2, A.bdH - 2);
  }
  function drawStoreAtlas(c, town) {
    const A = atlasLayout(town);
    c.fillStyle = '#202020'; c.fillRect(0, 0, 1024, 1024);
    A.kinds.forEach((k, i) => drawSign(c, KINDS[k], town ? (KINDS[k].town || KINDS[k].sign) : KINDS[k].sign, (i % 2) * 512, Math.floor(i / 2) * ATLAS_SIGN_H, 512, ATLAS_SIGN_H, town));
    // OPEN sign: red letters on a dark board, a white glow patch, an hours card
    const y = A.miscY;
    c.fillStyle = '#1a1414'; c.fillRect(0, y, 128, 64);
    c.strokeStyle = '#e83a3a'; c.lineWidth = 4; c.strokeRect(6, y + 6, 116, 52);
    c.fillStyle = '#ff5a4a'; c.font = FONT(34); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('OPEN', 64, y + 34);
    c.fillStyle = '#ffffff'; c.fillRect(128, y, 64, 64);
    c.fillStyle = '#f8f4ea'; c.fillRect(196, y, 60, 64); c.fillStyle = '#3a3a3a'; for (let k = 0; k < 6; k++) c.fillRect(204, y + 10 + k * 8, 30 + (k % 2) * 12, 2);
    const rr = rng(town ? 909 : 808);
    A.kinds.forEach((k, i) => drawBackdrop(c, k, (i % 3) * A.bdW, A.bdY + Math.floor(i / 3) * A.bdH, A.bdW, A.bdH, rr));
  }
  const storeAtlas = (town) => canvasTex(town ? 'cityShopAtlas' : 'cityStoreAtlas', 1024, 1024, (c) => drawStoreAtlas(c, town), { srgb: true, clamp: true });
  /* glow material for the atlases: emissive is the texture itself times the 'glow' attribute.
     glow < 2: lit at night only (signs); glow >= 2: lit all the time, brighter at night (the shop insides). */
  const glowMats = {};
  function atlasMat(town) {
    const key = town ? 'town' : 'city';
    if (glowMats[key]) return glowMats[key];
    const tex = storeAtlas(town);
    const m = new THREE.MeshLambertMaterial({ vertexColors: true, map: tex, emissive: new THREE.Color(1, 1, 1), emissiveMap: tex });
    m.onBeforeCompile = (sh) => {
      sh.uniforms.envNight = nightU;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float envNight;\nattribute float glow;\nvarying float vCityGlow;\nvoid main() {')
        .replace('#include <color_vertex>', '#include <color_vertex>\n  vCityGlow = glow >= 2.0 ? (glow - 2.0) * mix(0.2, 1.0, envNight) : glow * envNight;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vCityGlow;\nvoid main() {')
        .replace('vec3 totalEmissiveRadiance = emissive;', 'vec3 totalEmissiveRadiance = emissive * vCityGlow;');
    };
    m.customProgramCacheKey = () => 'cityAtlasGlow';
    glowMats[key] = m;
    return m;
  }
  /* ---------- things in the display windows (built into an Acc at platform height y, between x a..b and z z0..z1) ---------- */
  const g3 = {
    ball: (x, y, z, rad, c1, c2) => paint(smoothNormals(prep(new THREE.IcosahedronGeometry(rad, 1))), (px, py) => (Math.abs(py) < rad * 0.22 ? L(c2) : L(c1))).translate(x, y + rad, z),
    can: (x, y, z, rad, h, col, band = 0xf4f0e6) => paint(prep(new THREE.CylinderGeometry(rad, rad, h, 8)), (px, py) => (Math.abs(py) < h * 0.22 ? L(band) : L(col))).translate(x, y + h / 2, z),
  };
  function teddy(A, x, y, z, s, col = 0xa8642c) {
    const c = L(col), lt = L(0xe8c090);
    A.geo(ico(0.16 * s, 1, x, y + 0.15 * s, z, c, 1, 1.05, 0.85));
    A.geo(ico(0.12 * s, 1, x, y + 0.38 * s, z + 0.01 * s, c));
    for (const sd of [-1, 1]) {
      A.geo(ico(0.045 * s, 1, x + sd * 0.09 * s, y + 0.48 * s, z, c));
      A.geo(ico(0.055 * s, 0, x + sd * 0.15 * s, y + 0.2 * s, z + 0.05 * s, c, 1, 1.4, 1));
      A.geo(ico(0.06 * s, 0, x + sd * 0.09 * s, y + 0.05 * s, z + 0.1 * s, c, 1, 0.8, 1.4));
    }
    A.geo(ico(0.055 * s, 0, x, y + 0.36 * s, z + 0.1 * s, lt, 1, 0.8, 1));
    A.geo(ico(0.02 * s, 0, x, y + 0.385 * s, z + 0.15 * s, L(0x1e1410)));
    for (const sd of [-1, 1]) A.geo(ico(0.016 * s, 0, x + sd * 0.045 * s, y + 0.42 * s, z + 0.105 * s, L(0x1e1410)));
  }
  function plushDog(A, x, y, z, s) {
    const c = L(0xe8d8c0), ear = L(0x8a5a3a);
    A.geo(ico(0.17 * s, 1, x, y + 0.17 * s, z, c, 1, 1.1, 0.9));
    A.geo(ico(0.13 * s, 1, x, y + 0.42 * s, z + 0.03 * s, c));
    A.geo(ico(0.07 * s, 0, x, y + 0.39 * s, z + 0.14 * s, c, 1, 0.8, 1.1));
    A.geo(ico(0.025 * s, 0, x, y + 0.41 * s, z + 0.21 * s, L(0x1e1410)));
    for (const sd of [-1, 1]) { A.geo(ico(0.06 * s, 0, x + sd * 0.12 * s, y + 0.4 * s, z, ear, 0.6, 1.5, 1)); A.geo(ico(0.06 * s, 0, x + sd * 0.09 * s, y + 0.05 * s, z + 0.12 * s, c, 1, 0.8, 1.4)); }
    A.box(x - 0.13 * s, x + 0.13 * s, y + 0.5 * s, y + 0.53 * s, z - 0.1 * s, z + 0.1 * s, L(0xffffff), 'tfklr');
    A.box(x - 0.025 * s, x + 0.025 * s, y + 0.5 * s, y + 0.531 * s, z + 0.1 * s, z + 0.101 * s, L(0xe8302a), 'f');
  }
  function potted(A, x, y, z, s, r, flowers) {
    A.geo(lathe([[0, 0], [0.11, 0], [0.14, 0.2], [0.155, 0.22], [0, 0.22]], 8, L(pick(r, [0xb8603a, 0xe8e4dc, 0x5a7a8a]))).scale(s, s, s).translate(x, y, z));
    for (let k = 0; k < 5; k++) A.geo(ico(0.09 * s, 0, x + (r() - 0.5) * 0.16 * s, y + (0.3 + r() * 0.2) * s, z + (r() - 0.5) * 0.12 * s, mulc(L(0x3e7a2e), 0.8 + r() * 0.4)));
    if (flowers) for (let k = 0; k < 6; k++) A.geo(ico(0.035 * s, 0, x + (r() - 0.5) * 0.2 * s, y + (0.38 + r() * 0.16) * s, z + (r() - 0.5) * 0.12 * s + 0.04 * s, L(flowers)));
  }
  function bookStack(A, x, y, z, n, r) {
    let yy = y;
    for (let k = 0; k < n; k++) {
      const h = 0.03 + r() * 0.025, w = 0.2 + r() * 0.05, d = 0.15 + r() * 0.03, a = (r() - 0.5) * 0.3;
      A.geo(boxG(w, h, d, 0, h / 2, 0, L(pick(r, [0xa83232, 0x2e5a8a, 0x3a7a4a, 0xd8a83a, 0x6a3a7a, 0x2a2a2a, 0xc8642a])), 1).rotateY(a).translate(x, yy, z));
      A.geo(boxG(w - 0.01, h * 0.8, d - 0.012, 0.004, h / 2, 0.004, L(0xf4eedc), 1).rotateY(a).translate(x, yy, z));
      yy += h;
    }
    return yy;
  }
  function mannequin(A, x, y, z, dress, r) {
    A.geo(cyl(0.16, 0.18, 0.03, 10, x, y, z, L(0x2a2a2a)));
    A.geo(cyl(0.015, 0.015, 0.7, 5, x, y + 0.03, z, L(0x8a8a8a)));
    const skin = L(0xe8dcd0);
    A.geo(lathe([[0.0, 0], [0.16, 0], [0.13, 0.3], [0.11, 0.46], [0.15, 0.62], [0.12, 0.72], [0.05, 0.76], [0, 0.76]], 10, L(dress)).translate(x, y + 0.7, z));
    A.geo(lathe([[0.0, 0], [0.18, 0.0], [0.26, -0.55], [0, -0.55]], 12, L(dress)).translate(x, y + 0.78, z));
    A.geo(cyl(0.035, 0.035, 0.1, 6, x, y + 1.46, z, skin));
    A.geo(ico(0.09, 1, x, y + 1.62, z, skin, 0.85, 1.1, 0.9));
    for (const sd of [-1, 1]) A.geo(pipeGeo(x + sd * 0.15, y + 1.38, z, x + sd * 0.2, y + 1.0, z + 0.04, 0.03, skin, 6));
    if (r() < 0.5) A.geo(cyl(0.16, 0.16, 0.02, 10, x, y + 1.69, z, L(pick(r, [0xd8c8a0, 0x2a2a2a, 0xa83232])))), A.geo(cyl(0.08, 0.09, 0.08, 10, x, y + 1.7, z, L(0x3a3a3a)));
  }
  function windowGoods(A, kind, a, b, y, z0, z1, r, side) {
    const W = b - a, zc = (z0 + z1) / 2, X = (t) => a + W * t;
    const cols = [0xd8443a, 0x3a7ac8, 0x4aa860, 0xf2c43a, 0x9a5ac8, 0xf08a3a, 0x2ab0b0, 0xe86a9a];
    if (kind === 'pet') {
      if (side < 0) {
        // fish tank on a stand: black frame, blue water, gravel, plants and bright fish against the front glass
        const tx0 = X(0.12), tx1 = X(0.55), ty0 = y + 0.35, ty1 = ty0 + 0.5;
        A.box(tx0 - 0.04, tx1 + 0.04, y, ty0, z0, z1, L(0x2a2a2a), 'tflr');
        A.box(tx0, tx1, ty0, ty1, z0 + 0.02, z1 - 0.02, (px, py) => mixc(L(0x2a7ab0), L(0x8ad0f0), (py - ty0) / 0.5), 'tflr');
        A.box(tx0, tx1, ty0, ty0 + 0.06, z0 + 0.02, z1 - 0.019, L(0xc8b08a), 'f');
        for (const [x0, x1, y0, y1] of [[tx0 - 0.02, tx1 + 0.02, ty1, ty1 + 0.04], [tx0 - 0.02, tx0, ty0, ty1], [tx1, tx1 + 0.02, ty0, ty1]]) A.box(x0, x1, y0, y1, z0, z1, L(0x1e1e1e), 'tflr');
        for (let k = 0; k < 4; k++) A.box(X(0.15 + k * 0.1), X(0.15 + k * 0.1) + 0.02, ty0 + 0.05, ty0 + 0.15 + r() * 0.2, z1 - 0.06, z1 - 0.04, L(0x3a8a3a), 'f');
        for (let k = 0; k < 7; k++) A.geo(ico(0.028, 0, lerp(tx0 + 0.06, tx1 - 0.06, r()), ty0 + 0.12 + r() * 0.3, z1 - 0.012, L(pick(r, [0xf28a2a, 0xf2d040, 0xe84a6a, 0x6ad0f0, 0xf4f4f0])), 1.6, 0.9, 0.4));
        // dog bed with a bone
        A.geo(paint(prep(new THREE.TorusGeometry(0.24, 0.07, 6, 14)).rotateX(HP).scale(1, 1, 0.55), L(0x8a4a8a)).translate(X(0.8), y + 0.07, zc));
        A.geo(paint(prep(new THREE.CylinderGeometry(0.22, 0.22, 0.05, 12)).scale(1, 1, 0.55), L(0xe8dcc8)).translate(X(0.8), y + 0.025, zc));
        A.box(X(0.8) - 0.08, X(0.8) + 0.08, y + 0.06, y + 0.09, zc - 0.02, zc + 0.02, L(0xf6ecd2));
      } else {
        // food bags, cans and a cat tree with toys
        for (let k = 0; k < 4; k++) {
          const bx = X(0.1 + k * 0.12), bh = 0.36 + r() * 0.12, bc = L(pick(r, [0xb8401e, 0x245a9a, 0x2e7a3e, 0xc8901a]));
          const bag = roundBox(0.26, bh, 0.14, 0.04, null);
          eachVertex(bag, (p) => { if (p.y > bh * 0.25) p.z *= 1 - (p.y - bh * 0.25) / bh * 0.6; });
          A.geo(paint(bag, (px, py) => mulc(bc, py > bh * 0.3 ? 0.85 : 1)).translate(bx, y + bh / 2, zc));
          A.box(bx - 0.08, bx + 0.08, y + bh * 0.3, y + bh * 0.55, zc + 0.071, zc + 0.072, L(0xf6ecd2), 'f');
        }
        for (let k = 0; k < 3; k++) A.geo(g3.can(X(0.58) + k * 0.11, y, z1 - 0.08, 0.045, 0.1, 0xc8b070, pick(r, [0xd84a3a, 0x3a7ac8, 0x4aa860])));
        const cx = X(0.84);
        A.geo(cyl(0.05, 0.05, 1.1, 8, cx, y, zc, L(0xc8b08a)));
        A.box(cx - 0.25, cx + 0.25, y, y + 0.05, z0 + 0.02, z1 - 0.02, L(0x8a7a6a));
        A.geo(paint(prep(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 10)).scale(1, 1, 0.8), L(0x8a7a6a)).translate(cx, y + 0.575, zc));
        A.geo(paint(prep(new THREE.CylinderGeometry(0.2, 0.2, 0.05, 10)).scale(1, 1, 0.8), L(0x8a7a6a)).translate(cx, y + 1.125, zc));
        A.geo(g3.ball(X(0.66), y, zc, 0.06, 0xe84a3a, 0xf4f0e6)); A.geo(g3.ball(X(0.72), y, zc + 0.05, 0.05, 0x3a8ad0, 0xf2d040));
      }
    } else if (kind === 'vet') {
      if (side < 0) { plushDog(A, X(0.45), y, zc - 0.02, 1.4); potted(A, X(0.12), y, zc, 1.5, r); }
      else {
        A.box(X(0.2) - 0.18, X(0.2) + 0.18, y, y + 0.26, zc - 0.12, zc + 0.12, L(0xf6f4f0));
        A.box(X(0.2) - 0.03, X(0.2) + 0.03, y + 0.05, y + 0.21, zc + 0.12, zc + 0.125, L(0xe8302a), 'f'); A.box(X(0.2) - 0.08, X(0.2) + 0.08, y + 0.1, y + 0.16, zc + 0.12, zc + 0.125, L(0xe8302a), 'f');
        teddy(A, X(0.55), y, zc, 1.0, 0xc89058);
        potted(A, X(0.86), y, zc, 1.6, r, 0xf070a0);
      }
    } else if (kind === 'bakery') {
      if (side < 0) {
        // a three tier cake on a stand, cupcakes on a tray
        const cx = X(0.3);
        A.geo(lathe([[0, 0], [0.12, 0], [0.04, 0.03], [0.03, 0.18], [0.2, 0.2], [0.2, 0.22], [0, 0.22]], 12, L(0xf4f2ec)).translate(cx, y, zc));
        let ty = y + 0.22;
        for (const [rad, h] of [[0.17, 0.13], [0.13, 0.11], [0.09, 0.1]]) { A.geo(paint(prep(new THREE.CylinderGeometry(rad, rad, h, 14)), (px, py) => (py > h * 0.3 ? L(0xfaf6f0) : L(0xf4c8d4))).translate(cx, ty + h / 2, zc)); for (let k = 0; k < 8; k++) { const an = k / 8 * TAU; A.geo(ico(0.014, 0, cx + Math.cos(an) * rad, ty + h, zc + Math.sin(an) * rad, L(0xe8304a))); } ty += h; }
        A.geo(ico(0.03, 1, cx, ty + 0.02, zc, L(0xd8203a)));
        A.box(X(0.55), X(0.95), y, y + 0.02, zc - 0.13, zc + 0.13, L(0xc8ccd0));
        for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { const px = X(0.6 + i * 0.1), pz = zc - 0.06 + j * 0.12; A.geo(cyl(0.035, 0.028, 0.05, 8, px, y + 0.02, pz, L(pick(r, [0xf2c43a, 0x3a8ad0, 0xe86a9a])))); A.geo(ico(0.04, 1, px, y + 0.09, pz, L(pick(r, [0xfaf0f4, 0xf6b8c8, 0x6a3a24, 0xa8e0c8])), 1, 0.8, 1)); }
      } else {
        // bread: a basket of loaves, baguettes standing in a crock, a pie
        A.geo(lathe([[0, 0], [0.2, 0], [0.26, 0.14], [0, 0.14]], 10, L(0xb08448)).scale(1, 1, 0.65).translate(X(0.25), y, zc));
        for (let k = 0; k < 4; k++) A.geo(ico(0.09, 1, X(0.18) + k * 0.05, y + 0.16, zc + (k % 2 - 0.5) * 0.08, L(pick(r, [0xc8803a, 0xd89a4a, 0xa86a2a])), 1.4, 0.7, 0.8));
        A.geo(lathe([[0, 0], [0.09, 0], [0.1, 0.25], [0, 0.25]], 10, L(0x8a6a50)).translate(X(0.55), y, zc));
        for (let k = 0; k < 4; k++) A.geo(pipeGeo(X(0.55) + (k - 1.5) * 0.03, y + 0.1, zc + (k % 2) * 0.03, X(0.55) + (k - 1.5) * 0.07, y + 0.62, zc + (k % 2) * 0.04, 0.025, L(0xd8a050), 6));
        A.geo(cyl(0.16, 0.13, 0.05, 12, X(0.82), y, zc, L(0xd8a058))); A.geo(cyl(0.15, 0.15, 0.012, 12, X(0.82), y + 0.05, zc, L(0x8a2a3a)));
      }
    } else if (kind === 'toy') {
      if (side < 0) {
        teddy(A, X(0.22), y, zc, 1.4);
        A.geo(g3.ball(X(0.5), y, zc, 0.12, 0xd8443a, 0xf2d040)); A.geo(g3.ball(X(0.64), y, zc + 0.04, 0.09, 0x3a7ac8, 0xf4f4f0)); A.geo(g3.ball(X(0.58), y + 0.18, zc - 0.02, 0.07, 0x4aa860, 0xf2c43a));
        for (let k = 0; k < 6; k++) { const bx = X(0.78) + (k % 3) * 0.13 - 0.13, by = y + Math.floor(k / 3) * 0.12; if (k < 5) A.box(bx - 0.06, bx + 0.06, by, by + 0.12, zc - 0.06, zc + 0.06, L(cols[k]), 'tfblr'); }
        // a kite hanging in the window
        const kx = X(0.5), ky = y + 1.55;
        A.geo(paint(prep(new THREE.CircleGeometry(0.3, 4)).scale(0.75, 1, 1), L(0xf2c43a)).translate(kx, ky, z1 - 0.05));
        A.geo(paint(prep(new THREE.CircleGeometry(0.3, 4)).scale(0.75, 1, 1).rotateY(PI), L(0xd8443a)).translate(kx, ky, z1 - 0.051));
        A.geo(pipeGeo(kx, ky - 0.3, z1 - 0.05, kx + 0.1, ky - 0.9, z1 - 0.05, 0.006, L(0xf4f4f0), 3));
      } else {
        // a toy train with two cars
        const tz = zc, ty = y;
        A.box(X(0.1), X(0.36), ty + 0.04, ty + 0.18, tz - 0.07, tz + 0.07, L(0xd8443a)); A.box(X(0.28), X(0.38), ty + 0.18, ty + 0.3, tz - 0.07, tz + 0.07, L(0x2a2a2a));
        A.geo(cyl(0.03, 0.04, 0.1, 8, X(0.15), ty + 0.18, tz, L(0x2a2a2a)));
        A.box(X(0.4), X(0.6), ty + 0.04, ty + 0.16, tz - 0.07, tz + 0.07, L(0x3a7ac8)); A.box(X(0.63), X(0.83), ty + 0.04, ty + 0.16, tz - 0.07, tz + 0.07, L(0x4aa860));
        for (const wx of [0.14, 0.3, 0.44, 0.56, 0.67, 0.79]) for (const sd of [-1, 1]) A.geo(paint(prep(new THREE.CylinderGeometry(0.035, 0.035, 0.02, 8)).rotateX(HP), L(0xf2c43a)).translate(X(wx), ty + 0.04, tz + sd * 0.08));
        A.box(X(0.05), X(0.95), ty, ty + 0.01, tz - 0.05, tz + 0.05, L(0x6a5a4a));
        teddy(A, X(0.78), y + 0.16, zc, 0.6, 0xf0f0e8);
        A.geo(g3.ball(X(0.9), y, zc, 0.08, 0xe86a9a, 0xf4f4f0));
      }
    } else if (kind === 'grocery') {
      // tilted crates of fruit and vegetables, a pyramid of cans
      const crates = side < 0 ? [[0.05, 0.35, 0xd8302a], [0.38, 0.68, 0xf08a2a], [0.71, 0.96, 0xf2d040]] : [[0.05, 0.35, 0x5aa83a], [0.38, 0.6, 0x8a2a5a]];
      for (const [t0, t1, fc] of crates) {
        const x0 = X(t0), x1 = X(t1), cy = y + 0.25;
        A.box(x0, x1, y, cy, z0, z1, L(0x8a6a4a), 'tflr');
        A.box(x0, x1, cy, cy + 0.06, z0, z1, L(0x9a7a56), 'flr');
        for (let i = 0; i < 6; i++) for (let j = 0; j < 3; j++) A.geo(ico(0.045, 0, lerp(x0 + 0.05, x1 - 0.05, (i + 0.5) / 6) + (r() - 0.5) * 0.02, cy + 0.05 + (2 - j) * 0.01, lerp(z0 + 0.06, z1 - 0.06, (j + 0.5) / 3), mulc(L(fc), 0.85 + r() * 0.3)));
      }
      if (side > 0) for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) A.geo(g3.can(X(0.72) + (k + row * 0.5) * 0.1, y + row * 0.12, zc, 0.045, 0.12, pick(r, [0xd84a3a, 0x3a7ac8, 0xf2c43a]), 0xf4f0e6));
    } else if (kind === 'icecream') {
      if (side < 0) {
        // a giant cone with three scoops
        const cx = X(0.35);
        A.geo(paint(prep(new THREE.ConeGeometry(0.16, 0.55, 10)).rotateX(PI), (px, py) => (Math.sin(px * 60 + py * 40) > 0 ? L(0xd8a058) : L(0xc08a48))).translate(cx, y + 0.28, zc));
        A.geo(ico(0.16, 1, cx, y + 0.6, zc, L(0xf6a8c0))); A.geo(ico(0.14, 1, cx - 0.03, y + 0.82, zc, L(0xa8e0c8))); A.geo(ico(0.12, 1, cx + 0.02, y + 1.0, zc, L(0xf8eccc))); A.geo(ico(0.04, 1, cx + 0.02, y + 1.14, zc, L(0xd8203a)));
        for (let k = 0; k < 3; k++) { const px = X(0.65 + k * 0.12); A.geo(lathe([[0, 0], [0.05, 0], [0.012, 0.03], [0.012, 0.1], [0.07, 0.2], [0, 0.2]], 8, L(0xe8f0f4)).translate(px, y, zc)); A.geo(ico(0.06, 0, px, y + 0.22, zc, L(pick(r, [0xf6a8c0, 0x8a5a3a, 0xa8e0c8, 0xf8eccc])))); }
      } else {
        for (let k = 0; k < 5; k++) A.geo(cyl(0.1, 0.09, 0.12, 10, X(0.12 + k * 0.17), y, zc, L(pick(r, [0xf6a8c0, 0xa8e0c8, 0xf8eccc, 0x8a5a3a, 0xc8a0e0]))));
        potted(A, X(0.9), y, zc, 1.2, r, 0xf6a8c0);
      }
    } else if (kind === 'cafe') {
      // a window bar with cups, a cake stand of pastries, a chalkboard easel
      A.box(a + 0.05, b - 0.05, y + 0.45, y + 0.5, z0, z1, L(0x6a4028), 'tfb');
      for (const t of [0.2, 0.8]) A.box(X(t) - 0.03, X(t) + 0.03, y, y + 0.45, zc - 0.03, zc + 0.03, L(0x2a2a2a), 'flr');
      for (let k = 0; k < 4; k++) { const px = X(0.15 + k * 0.22); A.geo(cyl(0.045, 0.035, 0.08, 8, px, y + 0.5, zc, L(0xfbfaf6))); A.geo(cyl(0.07, 0.07, 0.01, 10, px, y + 0.5, zc, L(0xfbfaf6))); }
      if (side < 0) {
        A.geo(lathe([[0, 0], [0.12, 0], [0.03, 0.02], [0.02, 0.25], [0.18, 0.26], [0.18, 0.27], [0, 0.27]], 10, L(0xf4f2ec)).translate(X(0.7), y + 0.5, zc));
        for (let k = 0; k < 5; k++) A.geo(ico(0.04, 0, X(0.7) + (r() - 0.5) * 0.2, y + 0.8, zc + (r() - 0.5) * 0.15, L(pick(r, [0xd89a4a, 0xc8803a, 0x6a3a24])), 1.4, 0.7, 1));
      } else {
        A.box(X(0.45) - 0.22, X(0.45) + 0.22, y + 0.12, y + 0.42, zc + 0.05, zc + 0.08, L(0x22302a));
        for (let k = 0; k < 3; k++) A.box(X(0.45) - 0.16, X(0.45) + 0.12 - k * 0.05, y + 0.32 - k * 0.07, y + 0.335 - k * 0.07, zc + 0.08, zc + 0.081, L(0xf4f0e0), 'f');
        potted(A, X(0.88), y + 0.5, zc, 1.0, r);
      }
    } else if (kind === 'flower') {
      // stepped stand with buckets of flowers, potted plants on the floor
      for (let step = 0; step < 2; step++) {
        const sy = y + step * 0.3, sz0 = z0 + (1 - step) * 0.0, sz1 = z1 - step * 0.16;
        A.box(a + 0.08, b - 0.08, sy, sy + 0.3, sz0, sz1, L(0x8a6a4a), 'tflr');
        for (let k = 0; k < 5; k++) {
          const px = lerp(a + 0.3, b - 0.3, (k + 0.5) / 5), pz = (sz0 + sz1) / 2 + 0.02, fc = pick(r, [0xe8405a, 0xf2c83a, 0xf4f0f0, 0xd05aa0, 0xe8603a, 0x9a6ad8]);
          A.geo(cyl(0.08, 0.065, 0.2, 8, px, sy + 0.3, pz, L(0x7a8a92)));
          A.geo(ico(0.12, 0, px, sy + 0.58, pz, L(0x3e7a2e), 1, 0.9, 0.8));
          for (let f = 0; f < 5; f++) A.geo(paint(prep(new THREE.OctahedronGeometry(0.05, 0)), L(fc)).translate(px + (r() - 0.5) * 0.18, sy + 0.62 + r() * 0.16, pz + (r() - 0.5) * 0.1 + 0.03));
        }
      }
    } else if (kind === 'books' || kind === 'library') {
      // stacks of books, a tilted display stand, a reading lamp
      for (const t of [0.1, 0.26, 0.42]) bookStack(A, X(t), y, zc, 4 + Math.floor(r() * 4), r);
      const sx = X(0.75);
      A.geo(boxG(0.7, 0.4, 0.03, 0, 0.2, 0, L(0x6a4028)).rotateX(-0.35).translate(sx, y + 0.1, zc));
      for (let k = 0; k < 3; k++) A.geo(boxG(0.18, 0.24, 0.02, 0, 0.12, 0.02, L(cols[(k * 3 + (side > 0 ? 1 : 0)) % 8])).rotateX(-0.35).translate(sx - 0.22 + k * 0.22, y + 0.18, zc));
      A.geo(cyl(0.07, 0.08, 0.02, 8, X(0.58), y, zc, L(0x2e5a3a))); A.geo(cyl(0.01, 0.01, 0.4, 4, X(0.58), y, zc, L(0xc8a040)));
      A.geo(paint(prep(new THREE.ConeGeometry(0.1, 0.1, 8, 1, true)), L(0x2e6a3a)).translate(X(0.58), y + 0.42, zc));
    } else if (kind === 'clothes') {
      mannequin(A, X(0.3), y, zc, side < 0 ? 0xd8443a : 0x3a6aa8, r);
      mannequin(A, X(0.7), y, zc, side < 0 ? 0xf2c43a : 0x4aa860, r);
      for (let k = 0; k < 4; k++) A.box(X(0.5) - 0.15, X(0.5) + 0.15, y + k * 0.05, y + k * 0.05 + 0.045, zc - 0.1, zc + 0.1, L(pick(r, cols)));
    } else if (kind === 'general') {
      // barrels, a sack, jars of candy on a shelf, a lantern
      for (const t of [0.15, 0.42]) { A.geo(lathe([[0, 0], [0.15, 0], [0.18, 0.2], [0.15, 0.42], [0, 0.42]], 10, L(0x8a5a30)).scale(1, 1, 0.9).translate(X(t), y, zc)); for (const hy of [0.08, 0.34]) A.geo(paint(prep(new THREE.CylinderGeometry(0.165, 0.165, 0.025, 10)).scale(1, 1, 0.9), L(0x3a3030)).translate(X(t), y + hy, zc)); A.geo(cyl(0.14, 0.14, 0.02, 10, X(t), y + 0.42, zc, L(0x6a4020))); }
      A.geo(paint(roundBox(0.3, 0.4, 0.22, 0.08, null), L(0xd8c8a0)).translate(X(0.62), y + 0.2, zc));
      A.box(X(0.75), X(0.98), y + 0.4, y + 0.43, z0, z1, L(0x6a4020), 'tfb');
      for (let k = 0; k < 3; k++) { const px = X(0.8) + k * 0.09; A.geo(cyl(0.035, 0.035, 0.12, 8, px, y + 0.43, zc, L(0xd8e8e0))); A.geo(cyl(0.03, 0.03, 0.08, 8, px, y + 0.43, zc, L(pick(r, [0xd8443a, 0xf2a03a, 0x4aa860])))); }
    } else if (kind === 'post') {
      // parcels with string, a scale, a mail bag
      for (let k = 0; k < 5; k++) { const w = 0.2 + r() * 0.15, h = 0.12 + r() * 0.15, px = X(0.12 + (k % 3) * 0.16), py = y + (k > 2 ? 0.25 : 0); A.box(px - w / 2, px + w / 2, py, py + h, zc - 0.1, zc + 0.1, L(0xc8a070)); A.box(px - 0.01, px + 0.01, py, py + h + 0.002, zc - 0.101, zc + 0.101, L(0xe8dcc0), 'tf'); }
      A.box(X(0.72) - 0.12, X(0.72) + 0.12, y, y + 0.18, zc - 0.1, zc + 0.1, L(0xc8ccd0)); A.box(X(0.72) - 0.14, X(0.72) + 0.14, y + 0.18, y + 0.2, zc - 0.12, zc + 0.12, L(0x8a8e92));
      A.geo(paint(roundBox(0.3, 0.45, 0.2, 0.08, null), L(0x6a7a8a)).translate(X(0.9), y + 0.22, zc));
    } else if (kind === 'diner') {
      // a pie case and milkshakes
      A.box(X(0.15), X(0.55), y, y + 0.03, z0, z1, L(0xc8ccd0));
      for (const t of [0.24, 0.45]) { A.geo(cyl(0.12, 0.1, 0.045, 12, X(t), y + 0.03, zc, L(0xd8a058))); A.geo(cyl(0.11, 0.11, 0.01, 12, X(t), y + 0.075, zc, L(pick(r, [0x8a2a3a, 0xf2d040, 0x6a3a24])))); }
      for (let k = 0; k < 3; k++) { const px = X(0.66 + k * 0.12); A.geo(lathe([[0, 0], [0.04, 0], [0.012, 0.02], [0.012, 0.06], [0.05, 0.2], [0, 0.2]], 8, L(pick(r, [0xf6b8c8, 0xf8eccc, 0x8a5a3a]))).translate(px, y, zc)); A.geo(ico(0.045, 0, px, y + 0.22, zc, L(0xfbfaf6))); A.geo(pipeGeo(px + 0.01, y + 0.2, zc, px + 0.03, y + 0.34, zc, 0.006, L(0xe8302a), 4)); }
    } else if (kind === 'hardware') {
      // paint cans, a watering can, buckets and a rake
      for (let row = 0; row < 3; row++) for (let k = 0; k < 3 - row; k++) A.geo(g3.can(X(0.12) + (k + row * 0.5) * 0.14, y + row * 0.16, zc, 0.06, 0.16, 0xc8ccd0, pick(r, cols)));
      A.geo(cyl(0.12, 0.1, 0.25, 10, X(0.6), y, zc, L(0x3a8a3a))); A.geo(pipeGeo(X(0.6) + 0.1, y + 0.08, zc, X(0.6) + 0.3, y + 0.3, zc, 0.015, L(0x3a8a3a), 5));
      A.geo(cyl(0.13, 0.11, 0.28, 10, X(0.82), y, zc, L(0xe08a1a)));
      A.geo(pipeGeo(X(0.95), y, zc - 0.1, X(0.93), y + 1.5, zc - 0.05, 0.015, L(0xb08448), 5));
      A.box(X(0.93) - 0.15, X(0.93) + 0.15, y + 1.5, y + 1.55, zc - 0.07, zc - 0.03, L(0x5a5e62));
    }
  }

  /* a shop front built into three buckets (st: frame, awning and goods; at: atlas pieces; gl: glass).
     Local: x across (centered, width W), y up from 0 to H, the front plane at z = zf, the back at z = 0.
     Returns the door point. */
  const SF_DOOR = { w: 1.0, h: 2.3, z: 0.15 };
  function shopfront(S, kind, W, H, zf, town, o = {}) {
    const K2 = KINDS[kind], r = rng(strSeed('front:' + kind + (town ? ':t' : ':c'))), st = S.st, at = S.at, gl = S.gl;
    const pil = 0.32, dOpen = 1.9, wTop = H - 1.5, base = 0.6, frame = L(mixHex(K2.col, 0x1a1a1a, 0.25)), lt = L(mixHex(K2.col, 0xffffff, 0.12));
    const bd = (s) => atlasUV(town, s, kind), dz = 0.15;
    // pilasters with a base and a capital, the cornice cap
    for (const s of [-1, 1]) {
      const x0 = s < 0 ? -W / 2 : W / 2 - pil, x1 = s < 0 ? -W / 2 + pil : W / 2;
      st.box(x0, x1, 0, H - 0.22, 0, zf, frame, 'flr');
      st.box(x0 - 0.03, x1 + 0.03, 0, 0.3, 0, zf + 0.03, mulc(frame, 0.85), 'tflr');
      st.box(x0 - 0.04, x1 + 0.04, wTop + 0.3, wTop + 0.42, 0, zf + 0.04, lt, 'tbflr');
    }
    st.box(-W / 2 - 0.06, W / 2 + 0.06, H - 0.22, H, 0, zf + 0.2, frame, 'tbflr');
    st.box(-W / 2 - 0.02, W / 2 + 0.02, H - 0.3, H - 0.22, 0, zf + 0.1, lt, 'bf');
    // display windows on both sides of the door
    const wins = [[-W / 2 + pil, -dOpen / 2, -1], [dOpen / 2, W / 2 - pil, 1]];
    for (const [a, b, side] of wins) {
      st.box(a, b, 0, base, zf - 0.3, zf - 0.03, frame, 'ft');
      for (const t of [0.25, 0.75]) { const px = lerp(a, b, t), pw = (b - a) * 0.21; st.box(px - pw, px + pw, 0.12, base - 0.12, zf - 0.03, zf - 0.01, lt, 'tbflr'); }
      st.box(a, b, base, base + 0.07, zf - 0.32, zf, frame, 'tf');
      st.box(a, b, wTop - 0.08, wTop + 0.3, zf - 0.2, zf, frame, 'fb');
      st.box(a, a + 0.08, base, wTop, zf - 0.2, zf, frame, 'flr'); st.box(b - 0.08, b, base, wTop, zf - 0.2, zf, frame, 'flr');
      const tr = wTop - 0.42;
      st.box(a, b, tr - 0.04, tr + 0.03, zf - 0.16, zf - 0.04, frame, 'tfb');
      for (const t of [1 / 3, 2 / 3]) { const px = lerp(a, b, t); st.box(px - 0.03, px + 0.03, base, wTop, zf - 0.14, zf - 0.06, frame, 'flr'); }
      gl.quad([a + 0.06, base + 0.06, zf - 0.1], [b - 0.06, base + 0.06, zf - 0.1], [b - 0.06, wTop - 0.06, zf - 0.1], [a + 0.06, wTop - 0.06, zf - 0.1], [1, 1, 1], side < 0 ? [0, 0, 1, 1] : [1, 0, 0, 1]);
      // the painted inside behind the goods (the right window shows it mirrored), and the display floor
      const uv = bd('bd');
      at.quad([a + 0.04, base - 0.02, 0.03], [b - 0.04, base - 0.02, 0.03], [b - 0.04, wTop + 0.25, 0.03], [a + 0.04, wTop + 0.25, 0.03], [1, 1, 1], side < 0 ? uv : [uv[2], uv[1], uv[0], uv[3]], 2.95);
      st.box(a + 0.04, b - 0.04, base - 0.06, base + 0.01, 0.03, zf - 0.12, L(K2.floor), 't');
      // the display, a little larger than life so it reads from the street (scaled about the middle of the window floor)
      const M0 = st.getM(), cx = (a + b) / 2, sc = W > 12 ? 1.3 : 1.15, gy = base + 0.01;
      const Sm = new THREE.Matrix4().makeTranslation(cx, gy, 0).multiply(new THREE.Matrix4().makeScale(sc, sc, 1)).multiply(new THREE.Matrix4().makeTranslation(-cx, -gy, 0));
      st.setM(M0 ? M0.clone().multiply(Sm) : Sm);
      windowGoods(st, kind, cx - (b - a - 0.16) / (2 * sc), cx + (b - a - 0.16) / (2 * sc), gy, 0.08, zf - 0.16, r, side);
      st.setM(M0);
    }
    // recessed entrance: tile floor, side walls, ceiling, the glass door with a push bar, sidelights and a transom
    for (let i = 0; i < 8; i++) for (let j = 0; j < 3; j++) st.box(-dOpen / 2 + i * dOpen / 8, -dOpen / 2 + (i + 1) * dOpen / 8, 0, 0.02, dz + j * (zf - dz) / 3, dz + (j + 1) * (zf - dz) / 3, (i + j) % 2 ? L(0xf0ece4) : L(0x2a2a2a), 't');
    st.quad([-dOpen / 2, 0, zf], [-dOpen / 2, 0, dz], [-dOpen / 2, wTop, dz], [-dOpen / 2, wTop, zf], mulc(frame, 0.9));
    st.quad([dOpen / 2, 0, dz], [dOpen / 2, 0, zf], [dOpen / 2, wTop, zf], [dOpen / 2, wTop, dz], mulc(frame, 0.9));
    st.quad([-dOpen / 2, wTop, dz], [dOpen / 2, wTop, dz], [dOpen / 2, wTop, zf], [-dOpen / 2, wTop, zf], mulc(frame, 0.6));
    st.box(-dOpen / 2, dOpen / 2, wTop, wTop + 0.3, zf - 0.2, zf, frame, 'fb');
    const dw = SF_DOOR.w, dh = SF_DOOR.h;
    st.box(-dw / 2 - 0.06, -dw / 2, 0, dh, dz - 0.04, dz + 0.04, frame, 'flr'); st.box(dw / 2, dw / 2 + 0.06, 0, dh, dz - 0.04, dz + 0.04, frame, 'flr');
    st.box(-dOpen / 2, dOpen / 2, dh, dh + 0.06, dz - 0.04, dz + 0.04, frame, 'tbf');
    for (const s of [-1, 1]) st.box(s < 0 ? -dOpen / 2 : dw / 2 + 0.06, s < 0 ? -dw / 2 - 0.06 : dOpen / 2, 0, 0.4, dz - 0.03, dz + 0.03, frame, 'tf');
    if (!o.liveDoor) {
      // a fixed glass door with a push bar; the store's inside shows through it
      at.quad([-dOpen / 2, 0, 0.03], [dOpen / 2, 0, 0.03], [dOpen / 2, wTop, 0.03], [-dOpen / 2, wTop, 0.03], [1, 1, 1], bd('door'), 2.95);
      st.box(-dw / 2, dw / 2, 0, 0.26, dz - 0.03, dz + 0.03, frame, 'tf'); st.box(-dw / 2, dw / 2, dh - 0.1, dh, dz - 0.03, dz + 0.03, frame, 'bf');
      st.geo(pipeGeo(-dw / 2 + 0.12, 1.0, dz + 0.08, dw / 2 - 0.12, 1.0, dz + 0.08, 0.02, L(0xc8ccd0), 6));
      for (const s of [-1, 1]) st.box(s * (dw / 2 - 0.14) - 0.015, s * (dw / 2 - 0.14) + 0.015, 0.98, 1.02, dz + 0.03, dz + 0.08, L(0xc8ccd0), 'tbflr');
      gl.quad([-dOpen / 2, 0.4, dz], [dOpen / 2, 0.4, dz], [dOpen / 2, wTop - 0.02, dz], [-dOpen / 2, wTop - 0.02, dz], [1, 1, 1], [0.2, 0.1, 0.8, 0.9]);
      at.quad([-0.25, 1.45, dz + 0.012], [0.25, 1.45, dz + 0.012], [0.25, 1.69, dz + 0.012], [-0.25, 1.69, dz + 0.012], [1, 1, 1], bd('open'), 1.3);
      at.quad([0.3, 1.2, dz + 0.012], [0.42, 1.2, dz + 0.012], [0.42, 1.34, dz + 0.012], [0.3, 1.34, dz + 0.012], [1, 1, 1], bd('hours'), 0);
    } else {
      // the door is a separate swinging leaf (built by the caller); glass only in the sidelights and the transom,
      // and the OPEN sign hangs in the window next to the door
      for (const s of [-1, 1]) gl.quad([s < 0 ? -dOpen / 2 : dw / 2 + 0.06, 0.4, dz], [s < 0 ? -dw / 2 - 0.06 : dOpen / 2, 0.4, dz], [s < 0 ? -dw / 2 - 0.06 : dOpen / 2, dh, dz], [s < 0 ? -dOpen / 2 : dw / 2 + 0.06, dh, dz], [1, 1, 1], [0.1, 0.1, 0.3, 0.9]);
      gl.quad([-dOpen / 2, dh + 0.06, dz], [dOpen / 2, dh + 0.06, dz], [dOpen / 2, wTop - 0.02, dz], [-dOpen / 2, wTop - 0.02, dz], [1, 1, 1], [0.2, 0.1, 0.8, 0.3]);
      at.quad([-dOpen / 2 - 0.85, 1.55, zf - 0.13], [-dOpen / 2 - 0.25, 1.55, zf - 0.13], [-dOpen / 2 - 0.25, 1.84, zf - 0.13], [-dOpen / 2 - 0.85, 1.84, zf - 0.13], [1, 1, 1], bd('open'), 1.3);
    }
    // the sign band: fascia, a framed sign board with the name, three gooseneck lamps
    const sy0 = wTop + 0.45, sy1 = H - 0.32, bh = Math.min(0.8, sy1 - sy0 - 0.06), bw = Math.min(W - 2.2, bh * 8), bcy = (sy0 + sy1) / 2;
    st.box(-W / 2 + pil, W / 2 - pil, wTop + 0.42, H - 0.3, zf - 0.22, zf - 0.04, L(K2.col), 'f');
    st.box(-bw / 2 - 0.07, bw / 2 + 0.07, bcy - bh / 2 - 0.07, bcy + bh / 2 + 0.07, zf - 0.04, zf + 0.02, lt, 'tbflr');
    at.quad([-bw / 2, bcy - bh / 2, zf + 0.022], [bw / 2, bcy - bh / 2, zf + 0.022], [bw / 2, bcy + bh / 2, zf + 0.022], [-bw / 2, bcy + bh / 2, zf + 0.022], [1, 1, 1], bd('sign'), 0.55);
    for (const t of [-0.36, 0, 0.36]) {
      const lx = t * bw, ly = H - 0.27;
      st.geo(pipeGeo(lx, ly, zf + 0.05, lx, ly + 0.08, zf + 0.35, 0.015, L(0x2a2a2a), 5));
      st.geo(pipeGeo(lx, ly + 0.08, zf + 0.35, lx, ly - 0.02, zf + 0.5, 0.015, L(0x2a2a2a), 5));
      st.geo(paint(prep(new THREE.ConeGeometry(0.11, 0.13, 8, 1, true)).rotateX(-0.5), L(0x2a2a2a)).translate(lx, ly - 0.08, zf + 0.52));
      at.quad([lx - 0.08, ly - 0.13, zf + 0.5], [lx + 0.08, ly - 0.13, zf + 0.5], [lx + 0.08, ly - 0.13, zf + 0.62], [lx - 0.08, ly - 0.13, zf + 0.62], [1, 1, 1], bd('white'), 1.3);
    }
    // the awning: striped fabric from the wall over the windows, a valance, two arms
    if (o.awning !== false) awning(st, K2, W, pil, wTop, zf);
    return { x: 0, z: +(zf + 1.2).toFixed(2) };
  }
  function awning(st, K2, W, pil, wTop, zf) {
    const ax0 = -W / 2 + pil + 0.05, ax1 = W / 2 - pil - 0.05, aw = ax1 - ax0, ay0 = wTop + 0.36, ay1 = wTop - 0.42, az1 = zf + 1.35, vh = 0.28;
    const n = Math.max(2, Math.round(aw / 0.42)), [c0, c1] = K2.awn.map(L);
    for (let i = 0; i < n; i++) {
      const x0 = ax0 + aw * i / n, x1 = ax0 + aw * (i + 1) / n, col = i % 2 ? c1 : c0;
      st.quad([x0, ay1, az1], [x1, ay1, az1], [x1, ay0, zf], [x0, ay0, zf], col);
      st.quad([x0, ay1 - vh, az1], [x1, ay1 - vh, az1], [x1, ay1, az1], [x0, ay1, az1], mulc(col, 0.94));
      st.tri([x0 + aw / n * 0.5, ay1 - vh - 0.07, az1], [x1, ay1 - vh, az1], [x0, ay1 - vh, az1], mulc(col, 0.94));
    }
    st.quad([ax1, ay1, az1 - 0.01], [ax0, ay1, az1 - 0.01], [ax0, ay0, zf], [ax1, ay0, zf], mulc(c0, 0.55));
    st.quad([ax1, ay1 - vh, az1 - 0.01], [ax0, ay1 - vh, az1 - 0.01], [ax0, ay1, az1 - 0.01], [ax1, ay1, az1 - 0.01], mulc(c0, 0.5));
    for (const s of [-1, 1]) {
      const x = s < 0 ? ax0 : ax1;
      // side triangle of the fabric, facing out
      if (s < 0) st.tri([x, ay1, zf], [x, ay1, az1], [x, ay0, zf], c0); else st.tri([x, ay1, az1], [x, ay1, zf], [x, ay0, zf], c0);
      st.geo(pipeGeo(s * (aw / 2 - 0.4), wTop - 0.35, zf, s * (aw / 2 - 0.4), ay1 + 0.02, az1 - 0.05, 0.018, L(0x2a2a2a), 5));
      st.geo(pipeGeo(s * (aw / 2 - 0.4), wTop - 0.35, zf, s * (aw / 2 - 0.2), wTop - 0.35, zf - 0.02, 0.03, L(0x2a2a2a), 5));
    }
  }

  /* ---------- the city store front prop: 13 m wide, 4.5 m tall, from z = 0 (its back, the origin) to z = 0.6;
     the awning reaches out to z = 1.95 and the lamps over the sign to z = 1.2 ---------- */
  function storefront(v) {
    const kind = STORE_KINDS[v], S = { st: Acc(), at: Acc(), gl: Acc() };
    const door = shopfront(S, kind, 13, 4.5, 0.6, false);
    const glass = S.gl.build();
    const parts = [
      { geometry: S.st.build(1), material: mat('paint', { map: TX.wood() }), castShadow: true },
      { geometry: S.at.build(), material: atlasMat(false), castShadow: false },
      { geometry: glass, material: glassMat(), castShadow: false },
    ];
    return { parts, radius: 0, w: 13, d: 0.6, h: 4.5, kind, door, tris: S.st.tris + S.at.tris + S.gl.tris };
  }

  /* ============================================================
     Town shop buildings (Env.shop): two stories on a main street, about 10 to 12 m wide and 10 m deep, front on +z.
     Built and cached like Env.house: a group with a swinging glass door named 'door'.
     ============================================================ */
  const SHOPS = {
    general: { W: 12, wall: 'clap', tint: 0xe8dcc0, trim: 0xf4f0e6, gable: 'false', porch: 1, wins: 3 },
    bakery: { W: 10.5, wall: 'brick', trim: 0xf2ece0, wins: 3 },
    cafe: { W: 10, wall: 'clap', tint: 0x9ab49a, trim: 0xf6f2e8, wins: 3, boxes: 1 },
    post: { W: 12, wall: 'buff', trim: 0xf4f0e6, wins: 4, flag: 1, awning: false },
    library: { W: 12, wall: 'brick', trim: 0xf4f0e6, gable: 'pediment', wins: 3, awning: false },
    icecream: { W: 10, wall: 'clap', tint: 0xf4c8d6, trim: 0xfbfaf6, wins: 3 },
    diner: { W: 11.5, wall: 'clap', tint: 0xf4f2ee, trim: 0xc8383a, wins: 4, chrome: 1 },
    hardware: { W: 12, wall: 'buff', trim: 0xe8e4dc, wins: 4 },
    flower: { W: 10, wall: 'clap', tint: 0xf4f2ec, trim: 0x6a8a5a, wins: 3, boxes: 1 },
    toy: { W: 10.5, wall: 'brick', trim: 0xf2c43a, wins: 3 },
    pet: { W: 10.5, wall: 'clap', tint: 0x8ab0bc, trim: 0xfbfaf6, wins: 3 },
    books: { W: 10, wall: 'brickDark', trim: 0xece0c8, wins: 3 },
  };
  const shopCache = {};
  function buildShop(kind) {
    const S = SHOPS[kind], K2 = KINDS[kind], W = S.W, D = 10, H1 = 4.2, H2 = 3.2, belt = 0.45, eave = H1 + belt + H2;
    const hw = W / 2, hd = D / 2, trimC = L(S.trim), brick = S.wall !== 'clap';
    const wallC = brick ? [1, 1, 1] : L(S.tint);
    const out = { wall: [], trim: [], roof: [], glass: [] };
    const top = S.gable ? eave : eave + 0.95;
    // ----- walls: the front with the storefront bay, sides, back -----
    const bx = hw - 0.42, bayH = 4.0, rec = 0.6;
    out.wall.push(wallQuadZ(-hw, -bx, 0, H1, hd, 1, wallC), wallQuadZ(bx, hw, 0, H1, hd, 1, wallC), wallQuadZ(-bx, bx, bayH, H1, hd, 1, wallC));
    out.wall.push(wallQuadZ(-hw, hw, H1, top, hd, 1, wallC));
    for (const s of [-1, 1]) out.wall.push(wallQuadX(-hd, hd, 0, S.gable ? eave : top, s * hw, s, wallC));
    out.wall.push(wallQuadZ(-hw, hw, 0, S.gable ? eave : top, -hd, -1, wallC));
    // inside of the bay (dark), behind the shop front layer, open where the hall behind the door is
    const T = Acc(), dk = L(0x1a1612), hx0 = 0.92, hy0 = 2.6;
    T.quad([-bx, 0, hd - rec], [-hx0, 0, hd - rec], [-hx0, bayH, hd - rec], [-bx, bayH, hd - rec], dk);
    T.quad([hx0, 0, hd - rec], [bx, 0, hd - rec], [bx, bayH, hd - rec], [hx0, bayH, hd - rec], dk);
    T.quad([-hx0, hy0, hd - rec], [hx0, hy0, hd - rec], [hx0, bayH, hd - rec], [-hx0, bayH, hd - rec], dk);
    T.quad([-bx, 0, hd], [-bx, 0, hd - rec], [-bx, bayH, hd - rec], [-bx, bayH, hd], mulc(wallC, 0.5));
    T.quad([bx, 0, hd - rec], [bx, 0, hd], [bx, bayH, hd], [bx, bayH, hd - rec], mulc(wallC, 0.5));
    T.quad([-bx, bayH, hd - rec], [bx, bayH, hd - rec], [bx, bayH, hd], [-bx, bayH, hd], dk);
    // granite base course, belt over the store front, corner boards on clapboard
    T.box(-hw - 0.04, hw + 0.04, 0, 0.3, -hd - 0.04, hd - 0.02, L(0x9a968e), 'tlrk');
    for (const s of [-1, 1]) T.box(s < 0 ? -hw - 0.04 : bx, s < 0 ? -bx : hw + 0.04, 0, 0.3, hd - 0.02, hd + 0.04, L(0x9a968e), 'tflr');
    T.box(-hw - 0.06, hw + 0.06, H1, H1 + belt, hd - 0.02, hd + 0.12, trimC, 'tbflr');
    if (!brick) for (const sx of [-1, 1]) for (const sz of [-1, 1]) T.box(sx * hw - 0.08, sx * hw + 0.08, 0.3, S.gable ? eave : top, sz * hd - 0.08, sz * hd + 0.08, trimC, 'fklr');
    // ----- upper floor windows (the same windows as the houses), side and back windows, a back door -----
    const wo = { trim: trimC, shutters: S.wall === 'clap' && kind !== 'diner' ? L(mixHex(K2.col, 0x202020, 0.3)) : null };
    if (S.boxes) { wo.box = L(0xf6f4ee); wo.flowers = [L(0xe0405a), L(0xf6d040), L(0xf2f0f0), L(0xd05aa0)]; }
    const wy = H1 + belt + 1.55;
    for (const x of spread(W, S.wins, 1.2)) K.addWindow(out, x, wy, hd, 1.0, 1.55, 'z+', wo);
    for (const s of [-1, 1]) for (const z of [-2.6, 1.4]) K.addWindow(out, s * hw, wy, z, 0.95, 1.5, s > 0 ? 'x+' : 'x-', { trim: trimC });
    for (const s of [-1, 1]) K.addWindow(out, s * hw, 1.7, -2.8, 0.95, 1.4, s > 0 ? 'x+' : 'x-', { trim: trimC });
    for (const x of [-2.5, 2.5]) K.addWindow(out, x, wy, -hd, 0.95, 1.5, 'z-', { trim: trimC });
    K.addWindow(out, 2.6, 1.7, -hd, 0.95, 1.4, 'z-', { trim: trimC });
    out.trim.push(doorGeo(0.95, 2.1, L(0x5a4a3a)).rotateY(PI).translate(-1.2 + 0.475, 0.02, -hd - 0.01));
    // ----- cornice and roof -----
    if (!S.gable) {
      const cy = eave + 0.1, cc = trimC;
      T.box(-hw - 0.05, hw + 0.05, cy, cy + 0.45, hd - 0.02, hd + 0.06, mulc(cc, 0.95), 'fb');
      T.box(-hw - 0.4, hw + 0.4, cy + 0.45, cy + 0.68, hd - 0.02, hd + 0.4, cc, 'tbflr');
      for (let x = -hw + 0.4; x <= hw - 0.3; x += 0.9) T.box(x - 0.08, x + 0.08, cy + 0.05, cy + 0.45, hd + 0.06, hd + 0.36, mulc(cc, 0.9), 'fblr');
      T.quad([-hw + 0.25, top - 0.6, hd - 0.25], [hw - 0.25, top - 0.6, hd - 0.25], [hw - 0.25, top - 0.6, -hd + 0.25], [-hw + 0.25, top - 0.6, -hd + 0.25], TAR);
      for (const F of tierFaces(0, 0, hw, hd)) { T.setM(F.M); T.quad([F.W / 2 - 0.25, top - 0.6, -0.25], [-F.W / 2 + 0.25, top - 0.6, -0.25], [-F.W / 2 + 0.25, top, -0.25], [F.W / 2 - 0.25, top, -0.25], mulc(wallC, 0.85)); T.box(-F.W / 2, F.W / 2, top, top + 0.1, -0.27, 0.04, L(0x8a8680), 'tf'); }
      T.setM(null);
      if (S.flag) {
        // a flag on a pole over the post office
        const fx = hw - 1.2, fz = hd - 0.6;
        T.geo(cyl(0.04, 0.05, 4.2, 6, fx, top, fz, L(0xd8dcd8)));
        T.geo(ico(0.08, 1, fx, top + 4.25, fz, L(0xd8b048)));
        for (let k = 0; k < 7; k++) T.box(fx + 0.03, fx + 1.53, top + 3.3 + k * 0.12, top + 3.42 + k * 0.12, fz - 0.01, fz + 0.01, k % 2 ? L(0xf4f4f0) : L(0xc8282a), 'fk');
        T.box(fx + 0.03, fx + 0.68, top + 3.78, top + 4.14, fz - 0.015, fz + 0.015, L(0x22406a), 'fk');
      }
    } else {
      const rise = 3.0, yr = eave + rise;
      const rp = roofX(D, W, eave, eave, 0, yr, S.gable === 'false' ? 0 : 0.35, 0.4, L(0x4a4b50), trimC);
      for (const k of ['top', 'under']) rp[k].rotateY(HP);
      for (const f of rp.fascia) { f.rotateY(HP); out.trim.push(f); }
      out.roof.push(rp.top); out.trim.push(rp.under);
      out.wall.push(polyZ([[hw, eave], [-hw, eave], [0, yr]], -hd, -1, wallC));
      if (S.gable === 'false') {
        // false front: a tall square facade with a bracketed cornice hiding the gable
        const ft = yr + 0.5;
        const fw = hw + 0.45;
        out.wall.push(wallQuadZ(-fw, fw, eave - 0.6, ft, hd + 0.01, 1, wallC), wallQuadZ(-fw, fw, eave - 0.6, ft, hd - 0.2, -1, mulc(wallC, 0.85)));
        T.box(-fw - 0.25, fw + 0.25, ft, ft + 0.3, hd - 0.25, hd + 0.3, trimC, 'tbflr');
        for (let x = -fw + 0.5; x <= fw - 0.4; x += 1.0) T.box(x - 0.07, x + 0.07, ft - 0.35, ft, hd + 0.02, hd + 0.25, mulc(trimC, 0.9), 'fblr');
        for (const s of [-1, 1]) T.box(s * fw - 0.22, s * fw + 0.22, eave - 0.6, ft, hd - 0.2, hd + 0.04, trimC, 'flrkb');
      } else {
        // pediment: the gable trimmed as a classical triangle with a round window, a little cupola on the ridge
        out.wall.push(polyZ([[-hw, eave], [hw, eave], [0, yr]], hd, 1, wallC));
        T.box(-hw - 0.2, hw + 0.2, eave - 0.05, eave + 0.25, hd, hd + 0.25, trimC, 'tbflr');
        out.trim.push(paint(prep(new THREE.TorusGeometry(0.4, 0.07, 6, 18)).translate(0, eave + 1.2, hd + 0.04), trimC));
        out.glass.push(setGlow(paint(prep(new THREE.CircleGeometry(0.38, 18)).translate(0, eave + 1.2, hd + 0.015), L(0x2a3a48)), 1));
        T.box(-0.6, 0.6, yr - 0.4, yr + 0.9, -0.6, 0.6, trimC, 'fklr');
        T.geo(paint(prep(new THREE.ConeGeometry(0.95, 0.9, 4)).rotateY(PI / 4).translate(0, yr + 1.35, 0), L(0x4a4b50)));
      }
    }
    // the general store's porch: a shed roof on posts over the store front instead of an awning
    if (S.porch) {
      const pz = hd + 2.2, py = H1 - 0.1;
      for (const x of [-hw + 0.3, -2.0, 2.0, hw - 0.3]) T.box(x - 0.09, x + 0.09, 0.18, py, pz - 0.09, pz + 0.09, trimC, 'fklr');
      T.box(-hw - 0.1, hw + 0.1, py, py + 0.2, pz - 0.12, pz + 0.12, trimC, 'tbfk');
      const pr = soup(), z0 = hd, z1 = pz + 0.35, y0 = H1 + 0.35, y1 = py + 0.2;
      pr.quad(new V3(-hw - 0.2, y1, z1), new V3(hw + 0.2, y1, z1), new V3(hw + 0.2, y0, z0), new V3(-hw - 0.2, y0, z0), L(0x4a4b50));
      out.roof.push(pr.geo(false));
      T.quad([hw + 0.2, y1 - 0.01, z1], [-hw - 0.2, y1 - 0.01, z1], [-hw - 0.2, y0 - 0.01, z0], [hw + 0.2, y0 - 0.01, z0], L(0xd8d0c0));
      T.box(-hw, hw, 0, 0.18, hd, pz + 0.2, (x) => mulc(L(0x8a7a66), 0.9 + 0.1 * Math.sin(x * 11)), 'tf');
      for (let k = 0; k < 2; k++) T.box(-1.3, 1.3, 0, 0.09 * (k + 1), pz + 0.2 + (1 - k) * 0.3, pz + 0.5 + (1 - k) * 0.3, L(0x8a7a66), 'tf');
    }
    if (S.chrome) for (const y of [H1 - 0.1, 0.32]) T.box(-hw - 0.02, hw + 0.02, y, y + 0.08, hd, hd + 0.03, L(0xd8dce0), 'tbf');
    // ----- the store front in the bay, a swinging glass door, a dim hall behind it -----
    const F = { st: Acc(), at: Acc(), gl: Acc() }, M = new THREE.Matrix4().makeTranslation(0, 0, hd - rec);
    F.st.setM(M); F.at.setM(M); F.gl.setM(M);
    shopfront(F, kind, 2 * bx, bayH, rec, true, { liveDoor: true, awning: S.awning !== false && !S.porch });
    const dz = hd - rec + SF_DOOR.z, hallD = 1.9, hx = 0.92;
    const Hs = soup(), P = (x, y, z) => new V3(x, y, z), hw2 = L(KINDS[kind].wall), hf = L(0x9a7a58), hb = mulc(hw2, 0.6);
    K.quadTo(Hs, P(-hx, 0.012, dz), P(hx, 0.012, dz), P(hx, 0.012, dz - hallD), P(-hx, 0.012, dz - hallD), new V3(0, 1, 0), hf, hf, mulc(hf, 0.5), mulc(hf, 0.5));
    K.quadTo(Hs, P(-hx, 2.6, dz), P(hx, 2.6, dz), P(hx, 2.6, dz - hallD), P(-hx, 2.6, dz - hallD), new V3(0, -1, 0), mulc(hw2, 0.8), mulc(hw2, 0.8), hb, hb);
    for (const s of [-1, 1]) K.quadTo(Hs, P(s * hx, 0, dz), P(s * hx, 2.6, dz), P(s * hx, 2.6, dz - hallD), P(s * hx, 0, dz - hallD), new V3(-s, 0, 0), hw2, hw2, hb, hb);
    K.quadTo(Hs, P(-hx, 0, dz - hallD), P(hx, 0, dz - hallD), P(hx, 2.6, dz - hallD), P(-hx, 2.6, dz - hallD), new V3(0, 0, 1), hb);
    for (let k = 0; k < 4; k++) K.quadTo(Hs, P(-hx + 0.05, 0.3 + k * 0.5, dz - hallD + 0.02), P(hx - 0.05, 0.3 + k * 0.5, dz - hallD + 0.02), P(hx - 0.05, 0.34 + k * 0.5, dz - hallD + 0.02), P(-hx + 0.05, 0.34 + k * 0.5, dz - hallD + 0.02), new V3(0, 0, 1), L(0x3a2a1a));
    const hall = Hs.geo(false), hp = hall.attributes.position.array, hg = new Float32Array(hp.length / 3);
    for (let i = 0; i < hg.length; i++) hg[i] = 0.85 * (1 - 0.6 * clamp((dz - hp[i * 3 + 2]) / hallD, 0, 1));
    hall.setAttribute('glow', new THREE.BufferAttribute(hg, 1));
    out.glass.push(hall);
    // ----- meshes, one per material -----
    const grp = new THREE.Group();
    grp.name = 'shop-' + kind;
    const wallMat = S.wall === 'clap' ? mat('clapboard', { map: TX.clapboard() }) : WALLS[S.wall === 'brick' ? 'brickRed' : S.wall === 'buff' ? 'brickBuff' : 'brickDark']();
    grp.add(meshOf(boxUV(merge(out.wall), S.wall === 'clap' ? 0.96 : BRICK_UV), wallMat));
    grp.add(meshOf(merge([...out.trim, T.build(1), F.st.build(1)]), mat('paint', { map: TX.wood() })));
    if (out.roof.length) grp.add(meshOf(merge(out.roof), mat('shingle', { map: TX.shingle() })));
    grp.add(meshOf(merge(out.glass), mat('windowGlow', { emissive: 0xffbb66, glow: 'night' }), false, false));
    grp.add(meshOf(F.at.build(), atlasMat(true), false, true));
    grp.add(glassMesh(F.gl.build()));
    // the glass door: a painted frame with a big pane, hinged on its left edge (seen from outside), opening inward
    const dw = SF_DOOR.w, dh = SF_DOOR.h, fc = L(mixHex(K2.col, 0x1a1a1a, 0.25)), dg = [];
    dg.push(boxG(0.1, dh, 0.05, 0.05, dh / 2, 0, fc), boxG(0.1, dh, 0.05, dw - 0.05, dh / 2, 0, fc), boxG(dw - 0.2, 0.32, 0.05, dw / 2, 0.16, 0, fc), boxG(dw - 0.2, 0.12, 0.05, dw / 2, dh - 0.06, 0, fc));
    dg.push(pipeGeo(dw - 0.14, 0.85, 0.05, dw - 0.14, 1.25, 0.05, 0.015, L(0xc8a040), 6), pipeGeo(dw - 0.14, 0.85, -0.05, dw - 0.14, 1.25, -0.05, 0.015, L(0xc8a040), 6));
    dg.push(boxG(0.03, 0.03, 0.11, dw - 0.14, 0.87, 0, L(0xc8a040)), boxG(0.03, 0.03, 0.11, dw - 0.14, 1.23, 0, L(0xc8a040)));
    const door = new THREE.Mesh(merge(dg), mat('paint', { map: TX.wood() }));
    door.name = 'door'; door.castShadow = true; door.receiveShadow = true;
    door.position.set(-dw / 2, 0.02, dz);
    door.add(glassMesh(paint(prep(new THREE.PlaneGeometry(dw - 0.2, dh - 0.44)).translate(dw / 2, 0.32 + (dh - 0.44) / 2, 0), [1, 1, 1])));
    grp.add(door);
    const h = S.gable ? (S.gable === 'false' ? eave + 3.8 : eave + 4.3) : top + (S.flag ? 4.3 : 0.1);
    grp.userData = { w: W, d: D, h: +h.toFixed(2), hw: hw + 0.1, hd: hd + 0.1, outside: { x: 0, z: hd + (S.porch ? 3.1 : 1.2) }, floorY: 0.02, name: kind, kind, porchD: S.porch ? 2.4 : 0, doors: [doorRec('door', 'swing', 1.45)] };
    return grp;
  }
  /* userData = { w, d, h, hw, hd, outside: { x, z }, floorY, name, kind, porchD, doors, door } */
  function shop(kind = 'general') {
    if (!SHOPS[kind]) kind = 'general';
    if (!shopCache[kind]) shopCache[kind] = buildShop(kind);
    const src = shopCache[kind], g = src.clone();
    g.userData = JSON.parse(JSON.stringify(src.userData));
    g.userData.door = g.getObjectByName('door');
    return resolveDoors(g);
  }
  /* ============================================================
     Store insides (Env.storeInterior): open-top rooms like Env.interior, door on the +z wall.
     The inside atlas: 8 shelf strips (1024 x 64, 4 m of shelf, 0.25 m tall: packages, cans, jars, pet food, toys,
     two kinds of books, paint and hardware), then 16 boards of 256 x 128 (menus, posters, signs).
     ============================================================ */
  const STRIP = { boxes: 0, cans: 1, jars: 2, petfood: 3, toys: 4, booksA: 5, booksB: 6, paint: 7 };
  const BOARD = { icecream: 0, cafe: 1, diner: 2, bakery: 3, vet: 4, pet: 5, post: 6, read: 7, quiet: 8, produce: 9, aisles: 10, tools: 11, paint: 12, sale: 13, story: 14, fresh: 15 };
  function drawInAtlas(c) {
    const r = rng(4242);
    c.fillStyle = '#d8d4cc'; c.fillRect(0, 0, 1024, 1024);
    const cols = ['#d8443a', '#3a7ac8', '#4aa860', '#f2c43a', '#9a5ac8', '#f08a3a', '#2ab0b0', '#e86a9a', '#f4f0e6', '#6a3a2a'];
    const strip = (k, fn) => { c.save(); c.translate(0, k * 64); c.beginPath(); c.rect(0, 0, 1024, 64); c.clip(); c.fillStyle = '#3a3028'; c.fillRect(0, 0, 1024, 64); fn(); c.restore(); };
    const shade = (x, y, w, h) => { const g = c.createLinearGradient(x, 0, x + w, 0); g.addColorStop(0, 'rgba(0,0,0,0.25)'); g.addColorStop(0.3, 'rgba(255,255,255,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.3)'); c.fillStyle = g; c.fillRect(x, y, w, h); };
    strip(STRIP.boxes, () => { let x = 2; while (x < 1024) { const w = 18 + r() * 10, h = 38 + r() * 22, col = pick(r, cols); c.fillStyle = col; c.fillRect(x, 64 - h, w - 2, h); c.fillStyle = 'rgba(255,255,255,0.85)'; c.beginPath(); c.ellipse(x + w / 2 - 1, 64 - h * 0.6, w * 0.32, h * 0.14, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(0,0,0,0.25)'; c.fillRect(x, 64 - h, w - 2, 3); c.fillStyle = pick(r, cols); c.fillRect(x + 3, 64 - h * 0.28, w - 8, 4); shade(x, 64 - h, w - 2, h); x += w; } });
    strip(STRIP.cans, () => { for (let row = 0; row < 2; row++) { let x = 1; while (x < 1024) { const w = 17, h = 27, col = pick(r, cols); c.fillStyle = '#b8bcc0'; c.fillRect(x, 64 - (row + 1) * 30, w, h); c.fillStyle = col; c.fillRect(x, 64 - (row + 1) * 30 + 4, w, h - 8); c.fillStyle = '#f4f0e6'; c.fillRect(x, 64 - (row + 1) * 30 + 11, w, 6); shade(x, 64 - (row + 1) * 30, w, h); x += w + 1.5; } } });
    strip(STRIP.jars, () => { let x = 2; while (x < 1024) { const w = 22, h = 34 + r() * 8, col = pick(r, ['#c8402a', '#4a8a3a', '#e0a020', '#8a3a5a', '#f0c060', '#6a3a1a']); c.fillStyle = 'rgba(210,225,220,0.9)'; c.fillRect(x, 64 - h, w - 3, h); c.fillStyle = col; c.fillRect(x + 1, 64 - h * 0.78, w - 5, h * 0.78); c.fillStyle = '#c8a040'; c.fillRect(x, 64 - h - 5, w - 3, 6); c.fillStyle = '#f4ecd8'; c.fillRect(x + 3, 64 - h * 0.55, w - 9, 9); c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x + 2, 64 - h + 2, 3, h - 4); x += w; } });
    strip(STRIP.petfood, () => { let x = 2; while (x < 1024) { if (r() < 0.75) { const w = 58 + r() * 12, h = 52 + r() * 8, col = pick(r, ['#b8401e', '#245a9a', '#2e7a3e', '#c8901a', '#6a3a8a']); c.fillStyle = col; c.beginPath(); c.moveTo(x + 3, 64); c.lineTo(x + w - 3, 64); c.lineTo(x + w - 6, 64 - h); c.lineTo(x + 6, 64 - h); c.fill(); c.fillStyle = '#f6ecd2'; c.fillRect(x + 12, 64 - h * 0.62, w - 24, h * 0.3); c.fillStyle = col; pawPath(c, x + w / 2, 64 - h * 0.48, 8); shade(x + 3, 64 - h, w - 6, h); x += w; } else { for (let k = 0; k < 3; k++) { c.fillStyle = '#c8ccd0'; c.fillRect(x + k * 15, 46, 13, 18); c.fillStyle = pick(r, cols); c.fillRect(x + k * 15, 50, 13, 9); } x += 48; } } });
    strip(STRIP.toys, () => { let x = 2; while (x < 1024) { const k = r(); if (k < 0.5) { const w = 40 + r() * 20, h = 44 + r() * 16, col = pick(r, cols); c.fillStyle = col; c.fillRect(x, 64 - h, w - 3, h); c.fillStyle = 'rgba(220,240,250,0.85)'; c.fillRect(x + 6, 64 - h + 8, w - 15, h * 0.55); c.fillStyle = pick(r, cols); c.beginPath(); c.arc(x + w / 2 - 2, 64 - h + 8 + h * 0.28, h * 0.16, 0, TAU); c.fill(); shade(x, 64 - h, w - 3, h); x += w; } else if (k < 0.75) { for (let j = 0; j < 4; j++) { c.fillStyle = pick(r, cols); c.fillRect(x, 64 - (j + 1) * 9, 54, 8); } x += 57; } else { const rr = 12 + r() * 6; c.fillStyle = pick(r, cols); c.beginPath(); c.arc(x + rr, 64 - rr, rr, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.5)'; c.fillRect(x, 64 - rr - 2, rr * 2, 4); x += rr * 2 + 3; } } });
    for (const [k, pal] of [[STRIP.booksA, [0xa83232, 0x2e5a8a, 0x3a7a4a, 0xd8a83a, 0x6a3a7a, 0xe8dcc0, 0x2a2a2a, 0xc8642a]], [STRIP.booksB, [0x7a2a2a, 0x24345e, 0x2e4a3a, 0xc8b070, 0x5a4a6a, 0xf4f0e0, 0x8a5a3a, 0x3a6a8a]]]) strip(k, () => {
      let x = 1;
      while (x < 1024) {
        const w = 6 + r() * 9, h = 44 + r() * 18, col = pick(r, pal);
        c.fillStyle = css(col); c.fillRect(x, 64 - h, w - 1, h);
        c.fillStyle = 'rgba(232,200,110,0.8)'; c.fillRect(x + 1, 64 - h * 0.8, w - 3, 2); c.fillRect(x + 1, 64 - h * 0.25, w - 3, 2);
        if (r() < 0.4) { c.fillStyle = 'rgba(255,255,255,0.6)'; c.fillRect(x + 1, 64 - h * 0.6, w - 3, h * 0.18); }
        shade(x, 64 - h, w - 1, h); x += w + (r() < 0.06 ? 10 : 0);
      }
    });
    strip(STRIP.paint, () => { let x = 2; while (x < 1024) { if (r() < 0.6) { const w = 34, h = 40; c.fillStyle = '#c8ccd0'; c.fillRect(x, 64 - h, w - 3, h); c.fillStyle = pick(r, cols); c.fillRect(x, 64 - h + 10, w - 3, 18); c.fillStyle = '#8a8e92'; c.fillRect(x, 64 - h, w - 3, 4); shade(x, 64 - h, w - 3, h); x += w; } else { for (let j = 0; j < 3; j++) { c.fillStyle = pick(r, ['#c8a070', '#8a8e92', '#d8443a']); c.fillRect(x, 64 - (j + 1) * 16, 30, 14); c.fillStyle = '#f4f0e6'; c.fillRect(x + 4, 64 - (j + 1) * 16 + 4, 16, 5); } x += 33; } } });
    // boards: 4 x 4 cells of 256 x 128 from y = 512
    const board = (i, bg, fn) => { const x = (i % 4) * 256, y = 512 + Math.floor(i / 4) * 128; c.save(); c.translate(x, y); c.beginPath(); c.rect(0, 0, 256, 128); c.clip(); c.fillStyle = bg; c.fillRect(0, 0, 256, 128); fn(); c.restore(); };
    const txt = (t, x, y, size, col, font = FONT) => { c.fillStyle = col; c.font = font(size); c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(t, x, y); };
    const frame = (col, lw = 6) => { c.strokeStyle = col; c.lineWidth = lw; c.strokeRect(lw / 2, lw / 2, 256 - lw, 128 - lw); };
    const chalkLines = (x, y, n, w) => { c.fillStyle = 'rgba(240,236,224,0.85)'; for (let k = 0; k < n; k++) { c.fillRect(x, y + k * 14, w * (0.6 + r() * 0.4), 3); c.fillRect(x + w + 14, y + k * 14, 18, 3); } };
    board(BOARD.icecream, '#4a2a3a', () => { frame('#f6a8c0'); txt('ICE CREAM', 128, 22, 24, '#ffffff'); const fl = ['#f6a8c0', '#a8e0c8', '#f8e8b0', '#8a5a3a', '#c8a0e0', '#f8f4f0', '#f0c0a0', '#e8443a']; fl.forEach((f, k) => { const x = 22 + (k % 4) * 62, y = 56 + Math.floor(k / 4) * 38; c.fillStyle = f; c.beginPath(); c.arc(x, y, 11, 0, TAU); c.fill(); c.fillStyle = '#d8a058'; c.beginPath(); c.moveTo(x - 8, y + 5); c.lineTo(x + 8, y + 5); c.lineTo(x, y + 20); c.fill(); c.fillStyle = 'rgba(255,255,255,0.8)'; c.fillRect(x + 15, y - 2, 28, 3); }); });
    board(BOARD.cafe, '#22302a', () => { frame('#8a6a4a', 8); txt('COFFEE', 128, 24, 24, '#f4ecd8', SERIF); chalkLines(30, 50, 5, 140); drawIcon(c, 'cup', 222, 96, 34); });
    board(BOARD.diner, '#2a2a2a', () => { frame('#c8383a'); txt('MENU', 128, 22, 24, '#ffffff'); c.fillStyle = 'rgba(255,255,255,0.85)'; for (let k = 0; k < 5; k++) { c.fillRect(20, 46 + k * 15, 120 + r() * 50, 3); c.fillRect(200, 46 + k * 15, 30, 3); } drawIcon(c, 'burger', 222, 100, 30); });
    board(BOARD.bakery, '#2a3a32', () => { frame('#a8703a', 8); txt('FRESH BREAD', 128, 24, 22, '#f4ecd8', SERIF); chalkLines(24, 50, 4, 130); drawIcon(c, 'bread', 220, 92, 40); });
    board(BOARD.vet, '#f4f8fa', () => { frame('#3a78b8'); c.fillStyle = '#e8443a'; heartPath(c, 60, 66, 70); c.fill(); c.fillStyle = '#fff'; c.fillRect(54, 40, 12, 40); c.fillRect(40, 54, 40, 12); txt('HEALTHY', 172, 46, 22, '#3a78b8'); txt('PETS', 172, 80, 30, '#3a78b8'); });
    board(BOARD.pet, '#2f8a86', () => { frame('#fdf6e4'); c.fillStyle = '#f29a3a'; pawPath(c, 52, 66, 52); txt('HAPPY', 166, 46, 26, '#fdf6e4'); txt('PETS', 166, 84, 32, '#fdf6e4'); });
    board(BOARD.post, '#22406a', () => { frame('#f4f0e6'); drawIcon(c, 'letter', 60, 64, 70); txt('MAIL', 170, 64, 38, '#ffffff'); });
    board(BOARD.read, '#f2e6c8', () => { frame('#c8402a'); drawIcon(c, 'book', 60, 66, 76); txt('READ!', 170, 66, 40, '#c8402a'); });
    board(BOARD.quiet, '#3a2a22', () => { frame('#ecca74', 5); txt('QUIET', 128, 46, 34, '#ecca74', SERIF); txt('PLEASE', 128, 88, 30, '#ecca74', SERIF); });
    board(BOARD.produce, '#3a7a3a', () => { frame('#f4f4ec'); drawIcon(c, 'apple', 46, 64, 60); txt('FRUIT &', 160, 46, 26, '#ffffff'); txt('VEGGIES', 160, 84, 26, '#ffffff'); });
    board(BOARD.aisles, '#2a5a8a', () => { frame('#ffffff', 4); txt('BREAD  MILK', 128, 46, 24, '#ffffff'); txt('SNACKS', 128, 86, 24, '#f2d040'); });
    board(BOARD.tools, '#e08a1a', () => { frame('#2a2a2a'); drawIcon(c, 'hammer', 50, 66, 70); txt('TOOLS', 166, 66, 38, '#2a2a2a'); });
    board(BOARD.paint, '#3a5a3a', () => { frame('#e8e4dc'); txt('PAINT', 128, 50, 36, '#ffffff'); ['#d8443a', '#3a7ac8', '#f2c43a', '#4aa860', '#e86a9a'].forEach((f, k) => { c.fillStyle = f; c.fillRect(48 + k * 34, 82, 26, 26); }); });
    board(BOARD.sale, '#f4f2ee', () => { frame('#2a2a2a'); txt('SALE', 128, 56, 54, '#d8302a'); txt('NEW STYLES', 128, 102, 18, '#2a2a2a'); });
    board(BOARD.story, '#3a6aa8', () => { frame('#f2d040'); txt('STORY TIME', 128, 44, 26, '#f2d040'); for (let k = 0; k < 5; k++) { c.fillStyle = pick(r, cols); c.beginPath(); c.arc(54 + k * 37, 90, 12, 0, TAU); c.fill(); } });
    board(BOARD.fresh, '#6a8a5a', () => { frame('#ffffff'); drawIcon(c, 'flower', 48, 72, 64); txt('FRESH', 166, 46, 28, '#ffffff'); txt('FLOWERS', 166, 86, 26, '#ffffff'); });
    // a plain white patch for vertex colored pieces (x 1000..1024 of the last strip area)
    c.fillStyle = '#ffffff'; c.fillRect(992, 480, 32, 32);
  }
  const inAtlas = () => canvasTex('cityInAtlas', 1024, 1024, drawInAtlas, { srgb: true, clamp: true });
  const IN_WHITE = [995 / 1024, 1 - 509 / 1024, 1021 / 1024, 1 - 483 / 1024];
  const stripUVin = (k, len, u0 = 0) => [0.002 + u0, 1 - (k * 64 + 63) / 1024, Math.min(0.96, u0 + len / 4), 1 - (k * 64 + 1) / 1024];
  const boardUV = (i) => { const x = (i % 4) * 256, y = 512 + Math.floor(i / 4) * 128; return [(x + 2) / 1024, 1 - (y + 126) / 1024, (x + 254) / 1024, 1 - (y + 2) / 1024]; };
  /* ---------- room kit: buckets are Accs (one per material); B.at(x, z, ry) builds the next pieces turned and moved ---------- */
  function roomB(kind, town) {
    const B = { kind, town, foods: new Map(), treats: [], cols: [], shoppers: [], clerk: null, r: rng(strSeed('room:' + kind)) };
    for (const k of ['floor', 'wall', 'wood', 'fabric', 'ceramic', 'metal', 'plant', 'window', 'lamp', 'clear', 'art', 'sign']) B[k] = Acc();
    let M = null;
    B.at = (x, z, ry = 0, y = 0) => { M = x == null ? null : new THREE.Matrix4().makeRotationY(ry).setPosition(x, y, z); for (const k of ['floor', 'wall', 'wood', 'fabric', 'ceramic', 'metal', 'plant', 'window', 'lamp', 'clear', 'art', 'sign']) B[k].setM(M); return B; };
    B.pt = (x, y, z) => { const v = new V3(x, y, z); if (M) v.applyMatrix4(M); return v; };
    B.ry = () => (M ? Math.atan2(M.elements[8], M.elements[0]) : 0);
    // a fresh kit group (Env.food, a basket, a book) merged into the room by material
    B.group = (g, x, y, z, ry = 0, s = 1) => {
      g.position.set(x, y, z); g.rotation.y = ry; g.scale.setScalar(s); g.updateMatrixWorld(true);
      g.traverse((m) => {
        if (!m.isMesh) return;
        const geo = prep(m.geometry.clone()).applyMatrix4(m.matrixWorld);
        let e = B.foods.get(m.material.uuid); if (!e) B.foods.set(m.material.uuid, (e = { mat: m.material, acc: Acc() }));
        e.acc.setM(M); e.acc.geo(geo);
      });
    };
    // a food from Env.food, and optionally a treat spot on it
    B.food = (type, x, y, z, ry = 0, s = 1, treat = false) => {
      B.group(Env.food(type), x, y, z, ry, s);
      if (treat) { const p = B.pt(x, y, z); B.treats.push({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), type }); }
    };
    B.col = (x, z, w, d) => { const p = B.pt(x, 0, z), ry = B.ry(), c = Math.abs(Math.cos(ry)) > 0.5; B.cols.push({ box: true, x: +p.x.toFixed(3), z: +p.z.toFixed(3), hw: +((c ? w : d) / 2).toFixed(3), hd: +((c ? d : w) / 2).toFixed(3), rot: 0 }); };
    B.colR = (x, z, rr) => { const p = B.pt(x, 0, z); B.cols.push({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), r: rr }); };
    // yaw kept in (-PI, PI]
    const wrapYaw = (a) => { a = ((a + Math.PI) % TAU + TAU) % TAU - Math.PI; return +(a <= -Math.PI + 1e-6 ? Math.PI : a).toFixed(3); };
    B.shopper = (x, z, yaw) => { const p = B.pt(x, 0, z); B.shoppers.push({ x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: wrapYaw(yaw + B.ry()) }); };
    B.setClerk = (x, z, yaw) => { const p = B.pt(x, 0, z); B.clerk = { x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: wrapYaw(yaw + B.ry()) }; };
    return B;
  }
  const flatUV = (g, uv) => { const a = g.attributes.uv.array; for (let i = 0; i < a.length; i += 2) { a[i] = lerp(uv[0], uv[2], a[i]); a[i + 1] = lerp(uv[1], uv[3], a[i + 1]); } return g; };
  // a textured board facing +z centered at (x, y, z)
  const boardG = (w, h, uv, x, y, z) => flatUV(paint(prep(new THREE.PlaneGeometry(w, h)), [1, 1, 1]), uv).translate(x, y, z);
  // a wall shelf unit (local: back on z = 0, front toward +z, from x -len/2 to len/2) with goods strips on every shelf
  function shelfUnit(B, len, h, d, n, strip, wood, items) {
    const r = B.r;
    B.wood.box(-len / 2, -len / 2 + 0.04, 0, h, 0, d, wood, 'tflr'); B.wood.box(len / 2 - 0.04, len / 2, 0, h, 0, d, wood, 'tflr');
    B.wood.box(-len / 2, len / 2, 0, h, 0, 0.02, mulc(wood, 0.78), 'f');
    B.wood.box(-len / 2, len / 2, h - 0.04, h, 0, d, wood, 'tfb');
    B.wood.box(-len / 2 + 0.04, len / 2 - 0.04, 0, 0.1, d - 0.03, d, mulc(wood, 0.85), 'tf');
    for (let i = 0; i < n; i++) {
      const y = 0.1 + i * (h - 0.16) / n;
      if (i) B.wood.box(-len / 2 + 0.04, len / 2 - 0.04, y - 0.025, y, 0.02, d, wood, 'tfb');
      const gh = Math.min(0.25, (h - 0.16) / n - 0.06), gl = len - 0.12;
      if (strip != null && (!items || !items(y, i, true))) {
        // goods: the strip on the front, a dull top
        const segs = Math.ceil(gl / 3.6);
        for (let s = 0; s < segs; s++) { const sl = gl / segs, x0 = -gl / 2 + s * sl; B.art.geo(boardG(sl, gh, stripUVin(strip, sl, (s * 0.13 + i * 0.29) % 0.08), x0 + sl / 2, y + gh / 2, d - 0.07)); }
        B.art.geo(flatUV(paint(prep(new THREE.PlaneGeometry(gl, d - 0.12)).rotateX(-HP), mulc(L(0x8a7a6a), 0.9 + r() * 0.2)), IN_WHITE).translate(0, y + gh, d / 2 - 0.01));
      } else if (items) items(y, i, false);
    }
  }
  // place a unit against a wall: side 'L' (x = -hw), 'R' (x = hw), 'B' (z = -hd), 'F' (z = hd); c: position along the wall
  function againstWall(B, side, c, hw, hd, fn, off = 0) {
    if (side === 'B') B.at(c, -hd + off, 0); else if (side === 'F') B.at(c, hd - off, PI); else if (side === 'L') B.at(-hw + off, c, HP); else B.at(hw - off, c, -HP);
    fn(); B.at();
  }
  function counterG(B, len, d, h, body, top) {
    B.wood.box(-len / 2, len / 2, 0, h - 0.05, -d / 2, d / 2, body, 'tflrk');
    B.wood.box(-len / 2 - 0.04, len / 2 + 0.04, h - 0.05, h, -d / 2 - 0.02, d / 2 + 0.05, top, 'tfblrk');
    B.wood.box(-len / 2 + 0.05, len / 2 - 0.05, 0, 0.1, d / 2, d / 2 + 0.01, mulc(body, 0.7), 'f');
    for (let x = -len / 2 + 0.6; x < len / 2 - 0.3; x += 0.6) B.wood.box(x - 0.005, x + 0.005, 0.15, h - 0.12, d / 2, d / 2 + 0.008, mulc(body, 0.8), 'f');
  }
  function registerG(B, x, y, z, ry = 0) {
    const g = [boxG(0.36, 0.12, 0.34, 0, 0.06, 0, L(0x3a3a3c)), boxG(0.3, 0.05, 0.16, 0, 0.15, 0.06, L(0x2a2a2a)), boxG(0.26, 0.16, 0.03, 0, 0.26, -0.12, L(0x2a2a2a)), boxG(0.22, 0.12, 0.005, 0, 0.27, -0.104, L(0x6a9ab8))];
    B.metal.geo(merge(g).rotateY(ry).translate(x, y, z));
  }
  function pendantG(B, x, z, y, H, col = 0x3a3430) {
    B.metal.geo(pipeGeo(x, y + 0.2, z, x, H, z, 0.006, L(0x2a2a2a), 4));
    B.metal.geo(lathe([[0.03, 0.2], [0.05, 0.18], [0.2, 0.02], [0.21, 0], [0.19, 0], [0.04, 0.17], [0.02, 0.2]], 12, L(col)).translate(x, y, z));
    B.lamp.geo(setGlow(ico(0.06, 1, x, y + 0.04, z, L(0xfff4d8)), 1.2));
  }
  function tableG(B, x, z, rad, h, wood, metal) {
    B.wood.geo(cyl(rad, rad, 0.04, 14, x, h - 0.04, z, wood));
    B.metal.geo(cyl(0.03, 0.03, h - 0.04, 6, x, 0, z, metal || L(0x2a2a2a)));
    B.metal.geo(cyl(rad * 0.55, rad * 0.6, 0.03, 10, x, 0, z, metal || L(0x2a2a2a)));
  }
  function chairG(B, x, z, ry, seat, frame) {
    const f = frame || L(0x2a2a2a), g = [];
    g.push(boxG(0.42, 0.05, 0.42, 0, 0.46, 0, seat), boxG(0.42, 0.42, 0.04, 0, 0.72, -0.19, seat));
    for (const [sx, sz] of [[-0.18, -0.18], [0.18, -0.18], [-0.18, 0.18], [0.18, 0.18]]) g.push(boxG(0.03, 0.46, 0.03, sx, 0.23, sz, f));
    B.wood.geo(merge(g).rotateY(ry).translate(x, 0, z));
  }
  function stoolG(B, x, z, h, seat) {
    B.metal.geo(cyl(0.02, 0.025, h - 0.06, 6, x, 0, z, L(0xb8bcc0)));
    B.metal.geo(cyl(0.18, 0.2, 0.03, 10, x, 0, z, L(0xb8bcc0)));
    B.fabric.geo(cyl(0.19, 0.19, 0.07, 12, x, h - 0.07, z, seat));
    B.metal.geo(paint(prep(new THREE.TorusGeometry(0.14, 0.012, 4, 10)).rotateX(HP), L(0xb8bcc0)).translate(x, 0.32, z));
  }
  function plantG(B, x, z, s, r, y = 0) {
    B.ceramic.geo(lathe([[0, 0], [0.14, 0], [0.18, 0.3], [0.2, 0.32], [0, 0.32]], 10, L(pick(r, [0xb8603a, 0xe8e4dc, 0x3a3a3a, 0x5a7a8a]))).scale(s, s, s).translate(x, y, z));
    for (let k = 0; k < 6; k++) B.plant.geo(ico(0.16 * s, 1, x + (r() - 0.5) * 0.3 * s, y + (0.45 + r() * 0.45) * s, z + (r() - 0.5) * 0.3 * s, mulc(L(0x3e7a2e), 0.75 + r() * 0.45), 1, 1.2, 1));
  }
  function rugG(B, x, z, rx, rz, cols, y = 0.006) {
    const S = soup(), rings = 7, seg = 24;
    for (let k = 0; k < rings; k++) {
      const r0 = k / rings, r1 = (k + 1) / rings, col = L(cols[k % cols.length]);
      for (let i = 0; i < seg; i++) {
        const a0 = (i / seg) * TAU, a1 = ((i + 1) / seg) * TAU, P = (rr, a) => new V3(x + Math.cos(a) * rx * rr, y, z + Math.sin(a) * rz * rr);
        S.quad(P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1), col);
      }
    }
    const g = S.geo(false), n = g.attributes.normal.array;
    for (let i = 0; i < n.length; i += 3) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
    B.fabric.geo(g);
  }
  // a glass display case on a cabinet (local: centered, front toward +z); items(y) fills it
  function glassCase(B, len, d, h, body, items) {
    const ch = h - 0.45;
    B.wood.box(-len / 2, len / 2, 0, ch, -d / 2, d / 2, body, 'tflrk');
    B.wood.box(-len / 2 - 0.02, len / 2 + 0.02, ch, ch + 0.03, -d / 2 - 0.02, d / 2 + 0.02, L(0xc8ccd0), 'tfblr');
    const y0 = ch + 0.03, y1 = h;
    for (const [a, b, c2, dd] of [[[-len / 2, y0, d / 2], [len / 2, y0, d / 2], [len / 2, y1, d / 2], [-len / 2, y1, d / 2]], [[len / 2, y0, -d / 2], [-len / 2, y0, -d / 2], [-len / 2, y1, -d / 2], [len / 2, y1, -d / 2]], [[-len / 2, y0, -d / 2], [-len / 2, y0, d / 2], [-len / 2, y1, d / 2], [-len / 2, y1, -d / 2]], [[len / 2, y0, d / 2], [len / 2, y0, -d / 2], [len / 2, y1, -d / 2], [len / 2, y1, d / 2]], [[-len / 2, y1, d / 2], [len / 2, y1, d / 2], [len / 2, y1, -d / 2], [-len / 2, y1, -d / 2]]]) B.clear.quad(a, b, c2, dd, [1, 1, 1], [0, 0, 1, 1]);
    for (const x of [-len / 2, len / 2]) for (const z of [-d / 2, d / 2]) B.metal.box(x - 0.012, x + 0.012, y0, y1, z - 0.012, z + 0.012, L(0xc8ccd0), 'fklr');
    B.metal.box(-len / 2, len / 2, y1 - 0.012, y1 + 0.005, d / 2 - 0.012, d / 2 + 0.012, L(0xc8ccd0), 'tf');
    B.lamp.box(-len / 2 + 0.05, len / 2 - 0.05, y1 - 0.02, y1 - 0.01, -d / 2 + 0.05, -d / 2 + 0.1, L(0xfff4e0), 'b', 1);
    if (items) items(y0);
  }
  /* ---------- the shell: floor, walls, the store front windows and the door on +z ---------- */
  const ROOMS = {
    pet: { floor: 'tile', floorC: 0xe8e4dc, wall: 0xe4efe6, wallTex: 'plaster', wains: 0x2f8a86 },
    vet: { floor: 'tile', floorC: 0xf2f4f4, wall: 0xe2f0f2, wallTex: 'plaster', wains: 0x3a78b8 },
    bakery: { floor: 'tile', floorC: 0xf4ece0, wall: 0xf4e4c8, wallTex: 'brick' },
    toy: { floor: 'planks', floorC: 0xd8a868, wall: 0xf6eedc, wallTex: 'paper', wains: 0xd8443a },
    grocery: { floor: 'tile', floorC: 0xf0f0ea, wall: 0xeef0e6, wallTex: 'plaster', wains: 0x3a7a3a },
    icecream: { floor: 'tile', floorC: 0xfce8f0, wall: 0xfce4ee, wallTex: 'paper', wains: 0xe8789e },
    cafe: { floor: 'planks', floorC: 0x9a6a44, wall: 0xe8d8c0, wallTex: 'brick' },
    flower: { floor: 'tile', floorC: 0xd8d0c4, wall: 0xeef2e6, wallTex: 'plaster', wains: 0x6a8a5a },
    books: { floor: 'planks', floorC: 0x9a6a44, wall: 0xece0c8, wallTex: 'paper', wains: 0x24345e },
    clothes: { floor: 'planks', floorC: 0xd8c0a0, wall: 0xf4f2ee, wallTex: 'plaster' },
    general: { floor: 'planks', floorC: 0xa87850, wall: 0xe0cca8, wallTex: 'paper', wains: 0x6a4a2a },
    post: { floor: 'tile', floorC: 0xd8d4c8, wall: 0xe8e4d8, wallTex: 'plaster', wains: 0x22406a },
    library: { floor: 'planks', floorC: 0x8a5a3a, wall: 0xe8dcc0, wallTex: 'paper', wains: 0x5a3a24 },
    diner: { floor: 'tile', floorC: 0xf0f0ee, wall: 0xf2f0ec, wallTex: 'plaster', wains: 0xc8383a },
    hardware: { floor: 'planks', floorC: 0xb89a74, wall: 0xe8e4dc, wallTex: 'plaster', wains: 0x3a5a3a },
  };
  function roomShell(B, W, D, H, o) {
    const hw = W / 2, hd = D / 2, T = 0.16, wallC = L(o.wall), trimC = L(0xf6f2ea), dw = SF_DOOR.w + 0.12, dh = SF_DOOR.h + 0.06;
    B.floor.box(-hw - T, hw + T, -0.1, 0, -hd - T, hd + T, L(o.floorC), 'tflrkb');
    B.wall.box(-hw - T, hw + T, 0, H, -hd - T, -hd, wallC, 'tfklr'); B.wall.box(-hw - T, -hw, 0, H, -hd, hd, wallC, 'tlr'); B.wall.box(hw, hw + T, 0, H, -hd, hd, wallC, 'tlr');
    // the front wall with the door and two big store windows (thin on the inside, its outside faces the street)
    const wx0 = dw / 2 + 0.55, wx1 = hw - 0.45, wy0 = 0.62, wy1 = 2.85;
    const holes = [{ x0: -dw / 2, x1: dw / 2, y0: 0, y1: dh }, { x0: -wx1, x1: -wx0, y0: wy0, y1: wy1 }, { x0: wx0, x1: wx1, y0: wy0, y1: wy1 }];
    B.wall.setM(faceMatrix(PI, 0, hd)); holedWall(B.wall, W, 0, H, holes.map((h) => ({ x0: -h.x1, x1: -h.x0, y0: h.y0, y1: h.y1 })), wallC);
    B.wall.setM(faceMatrix(0, 0, hd + T)); holedWall(B.wall, W + 2 * T, 0, H, holes, mulc(wallC, 0.8));
    B.wall.setM(null).box(-hw - T, hw + T, H - 0.001, H, hd, hd + T, wallC, 't');
    for (const h of holes) { B.wall.box(h.x0, h.x1, h.y1, h.y1 + 0.001, hd, hd + T, wallC, 'b'); if (h.y0 > 0) B.wall.box(h.x0, h.x1, h.y0 - 0.001, h.y0, hd, hd + T, wallC, 't'); B.wall.quad([h.x0, h.y0, hd + T], [h.x0, h.y0, hd], [h.x0, h.y1, hd], [h.x0, h.y1, hd + T], wallC); B.wall.quad([h.x1, h.y0, hd], [h.x1, h.y0, hd + T], [h.x1, h.y1, hd + T], [h.x1, h.y1, hd], wallC); }
    // daylight in the windows and the door, window frames with mullions, a display platform under each window
    for (const s of [-1, 1]) {
      const a = s < 0 ? -wx1 : wx0, b = s < 0 ? -wx0 : wx1;
      B.window.geo(setGlow(paint(prep(new THREE.PlaneGeometry(b - a, wy1 - wy0)).rotateY(PI), (x, y) => mixc(L(0x8a9aa8), L(0xc8dcf0), (y - wy0) / (wy1 - wy0))).translate((a + b) / 2, (wy0 + wy1) / 2, hd + T * 0.6), 1));
      const fc = L(mixHex((KINDS[B.kind] || KINDS.general).col, 0x1a1a1a, 0.25));
      for (const x of [a, b, (2 * a + b) / 3, (a + 2 * b) / 3]) B.wood.box(x - 0.05, x + 0.05, wy0, wy1, hd - 0.02, hd + T * 0.6, fc, 'flr');
      B.wood.box(a, b, wy1 - 0.05, wy1 + 0.04, hd - 0.03, hd + T * 0.6, fc, 'fb'); B.wood.box(a, b, wy1 - 0.45, wy1 - 0.4, hd - 0.03, hd + T * 0.6, fc, 'fbt');
      B.wood.box(a - 0.05, b + 0.05, 0, wy0, hd - 0.5, hd, L(0x8a6a4a), 'tfl' + 'r');
      windowGoods(B.wood, B.kind, a + 0.1, b - 0.1, wy0, hd - 0.46, hd - 0.08, B.r, -s);
      B.cols.push({ box: true, x: (a + b) / 2, z: hd - 0.25, hw: (b - a) / 2 + 0.05, hd: 0.27, rot: 0 });
    }
    B.window.geo(setGlow(paint(prep(new THREE.PlaneGeometry(dw, dh)).rotateY(PI), L(0x8a9a8a)).translate(0, dh / 2, hd + T + 0.04), 1));
    for (const s of [-1, 1]) B.wood.box(s * dw / 2 - 0.06, s * dw / 2 + 0.06, 0, dh + 0.06, hd - 0.03, hd + 0.02, trimC, 'flr');
    B.wood.box(-dw / 2 - 0.06, dw / 2 + 0.06, dh, dh + 0.12, hd - 0.03, hd + 0.02, trimC, 'fb');
    // baseboards, a wainscot or a chair rail, a cap on the walls
    const wc = o.wains ? L(o.wains) : trimC, wh = o.wains ? 1.0 : 0.14;
    B.wood.box(-hw, hw, 0, wh, -hd, -hd + 0.025, wc, 'ft'); B.wood.box(-hw, -hw + 0.025, 0, wh, -hd, hd, wc, 'rt'); B.wood.box(hw - 0.025, hw, 0, wh, -hd, hd, wc, 'lt');
    if (o.wains) { B.wood.box(-hw, hw, wh, wh + 0.05, -hd, -hd + 0.045, trimC, 'ftb'); B.wood.box(-hw, -hw + 0.045, wh, wh + 0.05, -hd, hd, trimC, 'rtb'); B.wood.box(hw - 0.045, hw, wh, wh + 0.05, -hd, hd, trimC, 'ltb'); }
    B.wood.box(-hw - T - 0.02, hw + T + 0.02, H, H + 0.05, -hd - T - 0.02, -hd + 0.02, trimC, 'tfk'); B.wood.box(-hw - T - 0.02, -hw + 0.02, H, H + 0.05, -hd, hd + T, trimC, 'tlr'); B.wood.box(hw - 0.02, hw + T + 0.02, H, H + 0.05, -hd, hd + T, trimC, 'tlr');
    B.wood.box(-hw - T, hw + T, H, H + 0.05, hd, hd + T + 0.02, trimC, 'tfk');
    // the name sign high on the back wall
    const bh = 0.42, bw = bh * 8;
    B.wood.box(-bw / 2 - 0.06, bw / 2 + 0.06, H - 0.45 - bh / 2 - 0.06, H - 0.45 + bh / 2 + 0.06, -hd, -hd + 0.05, L(0x3a3430), 'tfblr');
    B.sign.geo(setGlow(boardG(bw, bh, atlasUV(B.town, 'sign', B.kind), 0, H - 0.45, -hd + 0.052), 0.6));
    const T2 = 0.16;
    B.cols.push({ box: true, x: 0, z: -hd - T2 / 2, hw: hw + T2, hd: T2 / 2 + 0.05, rot: 0 }, { box: true, x: -hw - T2 / 2, z: 0, hw: T2 / 2 + 0.05, hd: hd + T2, rot: 0 }, { box: true, x: hw + T2 / 2, z: 0, hw: T2 / 2 + 0.05, hd: hd + T2, rot: 0 });
    B.cols.push({ box: true, x: (-hw - T2 - dw / 2) / 2, z: hd + T2 / 2, hw: (hw + T2 - dw / 2) / 2, hd: T2 / 2 + 0.05, rot: 0 }, { box: true, x: (hw + T2 + dw / 2) / 2, z: hd + T2 / 2, hw: (hw + T2 - dw / 2) / 2, hd: T2 / 2 + 0.05, rot: 0 });
  }
  function roomAssemble(B, W, D, H, o) {
    const grp = new THREE.Group(), hw = W / 2, hd = D / 2;
    grp.name = 'store-interior-' + B.kind;
    const add = (acc, m, cast = true, uv) => { if (!acc.empty) grp.add(meshOf(acc.build(uv), m, cast, true)); };
    add(B.floor, o.floor === 'tile' ? mat('floorTile', { map: TX.tile() }) : mat('floorPlanks', { map: TX.planks() }), false, o.floor === 'tile' ? 1.4 : 0.75);
    add(B.wall, o.wallTex === 'brick' ? WALLS.brickRed() : o.wallTex === 'paper' ? mat('wallPaper', { map: TX.wallpaper() }) : mat('wallPlaster', { map: TX.plaster() }), true, o.wallTex === 'brick' ? BRICK_UV : 1.3);
    add(B.wood, mat('paint', { map: TX.wood() }), true, 1);
    add(B.fabric, mat('fabric', { map: TX.fabric() }), true, 4);
    add(B.ceramic, mat('ceramic', { std: true, roughness: 0.35 }));
    add(B.metal, mat('metal', { std: true, roughness: 0.35, metalness: 0.6 }));
    add(B.plant, mat('plantIn', { side: THREE.DoubleSide }));
    add(B.window, mat('windowDay', { emissive: 0xcfe6ff, glow: 'day' }), false);
    add(B.lamp, mat('lampGlow', { emissive: 0xffc070, glow: 'night' }), false);
    add(B.art, mat('cityInAtlasMat', { map: inAtlas() }));
    add(B.sign, atlasMat(B.town), false);
    for (const e of B.foods.values()) add(e.acc, e.mat);
    if (!B.clear.empty) grp.add(glassMesh(B.clear.build()));
    // the door: the same glass door as the shops, hinged on its left (seen from outside), swinging into the room
    const dw = SF_DOOR.w, dh = SF_DOOR.h, fc = L(mixHex((KINDS[B.kind] || KINDS.general).col, 0x1a1a1a, 0.25)), dg = [];
    dg.push(boxG(0.1, dh, 0.05, 0.05, dh / 2, 0, fc), boxG(0.1, dh, 0.05, dw - 0.05, dh / 2, 0, fc), boxG(dw - 0.2, 0.32, 0.05, dw / 2, 0.16, 0, fc), boxG(dw - 0.2, 0.12, 0.05, dw / 2, dh - 0.06, 0, fc));
    dg.push(pipeGeo(dw - 0.14, 0.85, -0.05, dw - 0.14, 1.25, -0.05, 0.015, L(0xc8a040), 6), boxG(0.03, 0.03, 0.06, dw - 0.14, 0.87, -0.03, L(0xc8a040)), boxG(0.03, 0.03, 0.06, dw - 0.14, 1.23, -0.03, L(0xc8a040)));
    const door = new THREE.Mesh(merge(dg), mat('paint', { map: TX.wood() }));
    door.name = 'door'; door.castShadow = true;
    door.position.set(-dw / 2, 0.01, hd - 0.04);
    door.add(glassMesh(paint(prep(new THREE.PlaneGeometry(dw - 0.2, dh - 0.44)).translate(dw / 2, 0.32 + (dh - 0.44) / 2, 0), [1, 1, 1])));
    grp.add(door);
    for (const c of B.cols) if (c.box && c.rot === undefined) c.rot = 0;
    grp.userData = {
      w: W, d: D, wallH: H, name: B.kind, kind: B.kind,
      spawn: { x: 0, z: hd - 1.1, yaw: PI },
      exit: { x: 0, z: hd - 0.3, r: 0.7 },
      light: { x: 0, y: H - 0.4, z: -0.3 },
      colliders: B.cols, clerk: B.clerk, shoppers: B.shoppers.length > 5 ? [0, 1, 2, 3, 4].map((i) => B.shoppers[Math.floor(i * B.shoppers.length / 5)]) : B.shoppers, treats: B.treats,
      doors: [doorRec('door', 'swing', 1.45)],
    };
    return grp;
  }
  /* ---------- furnishing helpers (B.hw, B.hd are the room half sizes) ---------- */
  function wallShelf(B, side, c, len, o = {}) {
    const h = o.h || 2.0, d = o.d || 0.45;
    againstWall(B, side, c, B.hw, B.hd, () => {
      shelfUnit(B, len, h, d, o.n || 5, o.strip, o.wood || L(0x8a6a4a), o.items);
      B.col(0, d / 2, len, d + 0.06);
      if (o.shopper !== false) B.shopper(o.shopperX || 0, d + 0.6, PI);
    });
  }
  // a double sided aisle shelf centered at (x, z), running along z when ry = 0
  function gondola(B, x, z, len, h, strips, wood = L(0xe8e4dc)) {
    const d = 0.42;
    for (const s of [0, 1]) { B.at(x + (s ? -0.01 : 0.01), z, s ? -HP : HP); shelfUnit(B, len, h, d, 4, strips[s], wood); }
    B.at();
    // end caps: a little shelf of goods at both ends
    for (const s of [-1, 1]) { B.at(x, z + s * len / 2, s > 0 ? 0 : PI); shelfUnit(B, 2 * d, h * 0.75, 0.32, 3, STRIP.boxes, wood); B.at(); }
    B.cols.push({ box: true, x, z, hw: d + 0.05, hd: len / 2 + 0.38, rot: 0 });
  }
  function counterAt(B, x, z, ry, len, d = 0.7, h = 1.0, body = L(0x8a5a34), top = L(0xd8d0c0), o = {}) {
    B.at(x, z, ry);
    counterG(B, len, d, h, body, top);
    if (o.register !== false) registerG(B, (o.regX == null ? len / 2 - 0.35 : o.regX), h, 0, PI);
    B.col(0, 0, len + 0.1, d + 0.1);
    B.setClerk(o.clerkX || 0, -d / 2 - 0.45, 0);
    B.at();
  }
  function aquarium(B, x, y, w, h, d, r) {
    const wy0 = y + 0.06, wy1 = y + h - 0.06;
    B.ceramic.box(x - w / 2 + 0.03, x + w / 2 - 0.03, wy0, wy1, 0.03, d * 0.5, (px, py) => mixc(L(0x1e5a8a), L(0x6ac0e8), (py - wy0) / (wy1 - wy0)), 'tflr');
    B.ceramic.box(x - w / 2 + 0.03, x + w / 2 - 0.03, y + 0.02, y + 0.09, 0.03, d - 0.03, L(0xc8b08a), 'tf');
    for (let k = 0; k < 4; k++) B.plant.box(x - w / 2 + 0.12 + k * w / 4.5, x - w / 2 + 0.15 + k * w / 4.5, y + 0.09, y + 0.2 + r() * 0.25, d * 0.5, d * 0.5 + 0.02, L(0x3a8a3a), 'f');
    for (let k = 0; k < 6; k++) B.ceramic.geo(ico(0.025, 0, x + (r() - 0.5) * (w - 0.15), y + 0.15 + r() * (h - 0.3), d * 0.55 + r() * (d * 0.35), L(pick(r, [0xf28a2a, 0xf2d040, 0xe84a6a, 0x6ad0f0, 0xf4f4f0])), 1.7, 0.9, 0.5));
    B.clear.quad([x - w / 2, y, d], [x + w / 2, y, d], [x + w / 2, y + h, d], [x - w / 2, y + h, d], [1, 1, 1], [0, 0, 1, 1]);
    for (const xx of [x - w / 2, x + w / 2]) B.metal.box(xx - 0.015, xx + 0.015, y, y + h, 0, d, L(0x2a2a2a), 'flr');
    B.metal.box(x - w / 2, x + w / 2, y + h - 0.02, y + h + 0.05, 0, d, L(0x2a2a2a), 'tfb');
    B.lamp.box(x - w / 2 + 0.05, x + w / 2 - 0.05, y + h - 0.025, y + h - 0.02, 0.05, d - 0.05, L(0xe8f4ff), 'b', 0.6);
  }
  function hangingKite(B, x, z, y, H, c1, c2, ry = 0) {
    B.metal.geo(pipeGeo(x, y + 0.3, z, x, H, z, 0.004, L(0xf4f4f0), 3));
    const k = paint(prep(new THREE.CircleGeometry(0.35, 4)).scale(0.7, 1, 1), L(c1)).rotateY(ry).translate(x, y, z);
    const k2 = paint(prep(new THREE.CircleGeometry(0.35, 4)).scale(0.7, 1, 1).rotateY(PI), L(c2)).rotateY(ry).translate(x, y, z);
    B.fabric.geo(k); B.fabric.geo(k2);
    B.fabric.geo(pipeGeo(x, y - 0.35, z, x + 0.15, y - 1.0, z, 0.008, L(c2), 3));
  }
  function basketG(B, x, y, z, rad, h, col = 0xb08448) {
    B.wood.geo(lathe([[0, 0], [rad * 0.85, 0], [rad, h], [rad * 0.96, h], [0, h - 0.02]], 10, L(col)).translate(x, y, z));
  }
  /* ---------- the stores ---------- */
  const FURNISH = {
    pet(B, hw, hd, H, r) {
      // aquariums on the left wall, two tiers of glowing tanks with fish
      againstWall(B, 'L', -1.9, hw, hd, () => {
        const len = 3.6, d = 0.55;
        B.metal.box(-len / 2, len / 2, 0, 0.62, 0, d, L(0x2a2a2a), 'tflr');
        B.metal.box(-len / 2, len / 2, 1.3, 1.36, 0, d, L(0x2a2a2a), 'tfb');
        for (const xx of [-len / 2 + 0.03, len / 2 - 0.03]) B.metal.box(xx - 0.03, xx + 0.03, 0.62, 1.3, 0, 0.05, L(0x2a2a2a), 'flr');
        for (const y of [0.62, 1.36]) for (let k = 0; k < 3; k++) aquarium(B, -len / 2 + 0.6 + k * 1.2, y, 1.12, 0.6, d, r);
        B.col(0, d / 2, len, d + 0.05);
        B.shopper(-0.6, d + 0.65, PI); B.shopper(0.9, d + 0.65, PI);
      });
      // the fish case: a chest cooler with a glass lid, fish on ice
      againstWall(B, 'L', 1.6, hw, hd, () => {
        const len = 1.6, d = 0.75, h = 0.85;
        B.wood.box(-len / 2, len / 2, 0, h - 0.1, 0, d, L(0xf4f4f0), 'tflr');
        B.metal.box(-len / 2, len / 2, h - 0.1, h - 0.06, 0, d, L(0xc8ccd0), 'tf');
        B.ceramic.box(-len / 2 + 0.06, len / 2 - 0.06, h - 0.2, h - 0.12, 0.06, d - 0.06, L(0xeef4f8), 't');
        for (let k = 0; k < 4; k++) B.food('smallfish', -len / 2 + 0.3 + k * 0.33, h - 0.12, d * 0.5 + (k % 2 - 0.5) * 0.15, HP + (r() - 0.5) * 0.4, 1.2, k === 1 || k === 2);
        B.clear.quad([-len / 2, h, d], [len / 2, h, d], [len / 2, h, 0], [-len / 2, h, 0], [1, 1, 1], [0, 0, 1, 1]);
        B.metal.box(-len / 2, len / 2, h - 0.06, h + 0.01, d - 0.03, d, L(0xc8ccd0), 'tf');
        B.col(0, d / 2, len, d);
        B.shopper(0, d + 0.6, PI);
      });
      // pet food shelves on the right wall
      wallShelf(B, 'R', -2.0, 3.6, { strip: STRIP.petfood, wood: L(0xe8e4dc), h: 1.9, n: 5, shopperX: 0.6 });
      wallShelf(B, 'R', 1.25, 1.8, { strip: STRIP.cans, wood: L(0xe8e4dc), h: 1.9, n: 5, shopper: false });
      // collars and leashes on a pegboard (back wall left), the counter (back right)
      againstWall(B, 'B', -3.4, hw, hd, () => {
        B.wood.box(-1.3, 1.3, 0.6, 2.2, 0, 0.03, L(0xc8a878), 'f');
        const cc = [0xd8443a, 0x3a7ac8, 0x4aa860, 0xf2c43a, 0x9a5ac8, 0xe86a9a, 0x2ab0b0, 0xf08a3a];
        for (let i = 0; i < 8; i++) {
          const x = -1.1 + i * 0.31, c = L(cc[i]);
          B.metal.box(x - 0.01, x + 0.01, 1.98, 2.0, 0.03, 0.12, L(0xb8bcc0), 'tf');
          B.fabric.box(x - 0.02, x + 0.02, 1.25, 1.98, 0.1, 0.12, c, 'f');
          B.metal.geo(paint(prep(new THREE.TorusGeometry(0.07, 0.012, 4, 10)), L(0xc8ccd0)).translate(x, 1.2, 0.11));
          B.fabric.geo(paint(prep(new THREE.TorusGeometry(0.09, 0.015, 4, 12)), c).translate(x, 0.85, 0.08));
        }
        B.col(0, 0.1, 2.6, 0.2);
        B.shopper(0, 0.9, PI);
      });
      counterAt(B, 3.3, -3.25, 0, 2.6, 0.7, 1.0, L(0x2f8a86), L(0xe8e4dc));
      // dog beds stacked on a low stand, a bin of balls and chew toys, hamster wheels and a carrot basket, a cat tree
      B.wood.box(0.2, 1.6, 0, 0.3, -1.2, 0.0, L(0xc8a878), 'tflrk');
      for (let k = 0; k < 3; k++) { const c = L([0x8a4a8a, 0x2e6aa8, 0xc8643a][k]); B.fabric.geo(paint(prep(new THREE.TorusGeometry(0.38 - k * 0.04, 0.1, 6, 16)).rotateX(HP), c).translate(0.9, 0.4 + k * 0.17, -0.6)); B.fabric.geo(cyl(0.3 - k * 0.04, 0.3 - k * 0.04, 0.06, 14, 0.9, 0.32 + k * 0.17, -0.6, L(0xf0e6d0))); }
      B.cols.push({ box: true, x: 0.9, z: -0.6, hw: 0.75, hd: 0.65, rot: 0 }); B.shopper(0.9, 0.5, PI);
      basketG(B, -1.4, 0, -0.5, 0.45, 0.5, 0x9a7a5a);
      for (let k = 0; k < 9; k++) { const a = r() * TAU, d = r() * 0.3; B.ceramic.geo(g3.ball(-1.4 + Math.cos(a) * d, 0.42 + r() * 0.08, -0.5 + Math.sin(a) * d, 0.07 + r() * 0.03, pick(r, [0xd8443a, 0x3a8ad0, 0xf2c43a, 0x4aa860]), 0xf4f0e6)); }
      for (let k = 0; k < 3; k++) B.fabric.box(-1.5 + k * 0.1, -1.36 + k * 0.1, 0.55, 0.58, -0.6 + k * 0.1, -0.56 + k * 0.1, L(0xf6ecd2));
      B.colR(-1.4, -0.5, 0.5); B.shopper(-1.4, 0.35, PI);
      tableG(B, 2.6, 1.0, 0.5, 0.75, L(0xc8a878));
      for (const s of [-1, 1]) { const x = 2.6 + s * 0.22; B.metal.geo(paint(prep(new THREE.TorusGeometry(0.12, 0.012, 4, 14)), L(0xc8ccd0)).translate(x, 0.92, 1.0)); B.metal.box(x - 0.01, x + 0.01, 0.75, 0.92, 0.98, 1.02, L(0x8a8e92), 'flr'); }
      B.group(Env.carrotBasket(), 2.6, 1.0, 1.25, 0, 1.0);
      B.treats.push({ x: 2.6, y: 1.0, z: 1.25, type: 'carrot' });
      B.colR(2.6, 1.0, 0.55); B.shopper(2.6, 1.85, PI);
      B.wood.geo(cyl(0.07, 0.07, 1.6, 8, 4.9, 0, 2.6, L(0xc8b08a)));
      for (const [y, rr] of [[0, 0.4], [0.7, 0.3], [1.6, 0.35]]) B.fabric.geo(cyl(rr, rr, 0.06, 12, 4.9, y, 2.6, L(0x8a7a6a)));
      B.colR(4.9, 2.6, 0.42);
      for (const [x, z] of [[-2.6, -1.6], [2.6, -1.6]]) pendantG(B, x, z, H - 0.9, H, 0x2f8a86);
      plantG(B, -5.5, 3.2, 1.2, r);
      B.cols.push({ box: true, x: -5.5, z: 3.2, hw: 0.25, hd: 0.25, rot: 0 });
    },
    vet(B, hw, hd, H, r) {
      // reception desk (back left) with a computer and a bowl of apples
      counterAt(B, -2.2, -3.0, 0, 2.8, 0.7, 1.05, L(0xf4f2ee), L(0x3a78b8), { regX: -0.6 });
      B.ceramic.geo(lathe([[0, 0], [0.1, 0], [0.16, 0.08], [0, 0.08]], 12, L(0xf4f4f0)).translate(-1.3, 1.05, -2.95));
      for (let k = 0; k < 3; k++) B.food('apple', -1.3 + (k - 1) * 0.07, 1.08, -2.95 + (k % 2) * 0.06, k, 0.8, k === 1);
      B.shopper(-2.2, -2.0, PI);
      B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.vet), -2.2, 1.9, -hd + 0.03));
      // waiting chairs along the right wall, a little table with magazines
      for (let k = 0; k < 5; k++) chairG(B, hw - 0.45, -1.6 + k * 0.6, -HP, L(0x3a78b8));
      B.cols.push({ box: true, x: hw - 0.45, z: -0.4, hw: 0.3, hd: 1.55, rot: 0 });
      B.wood.box(hw - 0.75, hw - 0.25, 0, 0.45, 1.6, 2.1, L(0xd8c8a8), 'tflrk');
      for (let k = 0; k < 3; k++) B.fabric.box(hw - 0.7, hw - 0.4, 0.45 + k * 0.012, 0.46 + k * 0.012, 1.7 + k * 0.03, 1.95 + k * 0.03, L(pick(r, [0xd8443a, 0x3a7ac8, 0xf2c43a])));
      B.shopper(hw - 1.4, 0.4, HP);
      // exam corner (back right): steel exam table, a floor scale, a cabinet with jars, posters
      B.metal.box(2.4, 4.0, 0.85, 0.9, -3.9, -3.2, L(0xd8dde2), 'tfblrk'); B.metal.box(3.05, 3.35, 0, 0.85, -3.7, -3.4, L(0xb8bec4), 'flrk');
      B.fabric.box(2.5, 3.9, 0.9, 0.93, -3.85, -3.25, L(0x8ac6c4), 't');
      B.cols.push({ box: true, x: 3.2, z: -3.55, hw: 0.85, hd: 0.4, rot: 0 });
      B.metal.box(1.0, 1.8, 0, 0.06, -2.2, -1.6, L(0xc8ccd0), 'tflr'); B.metal.box(1.35, 1.45, 0.06, 0.95, -2.2, -2.1, L(0x8a8e92), 'flr'); B.ceramic.box(1.2, 1.6, 0.95, 1.2, -2.25, -2.05, L(0xf4f4f0), 'tflr');
      B.shopper(1.4, -1.0, PI);
      againstWall(B, 'R', -3.3, hw, hd, () => { B.wood.box(-0.6, 0.6, 0, 0.9, 0, 0.5, L(0xf4f2ee), 'tflr'); B.wood.box(-0.6, 0.6, 1.4, 2.2, 0, 0.35, L(0xf4f2ee), 'tfblr'); for (let k = 0; k < 5; k++) B.ceramic.geo(lathe([[0, 0], [0.05, 0], [0.05, 0.14], [0.03, 0.17], [0, 0.17]], 8, L([0xe8e2d4, 0x9ad0e8, 0xf2c83a, 0xe8a2aa, 0xf4f4f0][k])).translate(-0.4 + k * 0.2, 0.9, 0.25)); B.col(0, 0.25, 1.2, 0.5); });
      B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.pet), 2.0, 1.8, -hd + 0.03));
      againstWall(B, 'L', 0.6, hw, hd, () => { B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.vet), 0, 1.8, 0.02)); B.shopper(0, 0.9, PI); });
      wallShelf(B, 'L', -2.8, 1.8, { strip: STRIP.petfood, wood: L(0xf4f2ee), h: 1.6, n: 4 });
      plantG(B, -hw + 0.4, 2.9, 1.3, r); plantG(B, hw - 0.4, 2.9, 1.2, r);
      B.cols.push({ box: true, x: -hw + 0.4, z: 2.9, hw: 0.25, hd: 0.25, rot: 0 }, { box: true, x: hw - 0.4, z: 2.9, hw: 0.25, hd: 0.25, rot: 0 });
      for (const [x, z] of [[-2.2, -1.2], [2.2, -1.2]]) pendantG(B, x, z, H - 0.8, H, 0xf4f4f0);
    },
    bakery(B, hw, hd, H, r) {
      // the glass case across the shop with breads, cakes and cookies, berry tarts on top
      B.at(-0.6, -1.6, 0);
      glassCase(B, 5.2, 0.8, 1.15, L(0x7a4a2a), (y) => {
        for (let k = 0; k < 6; k++) { const x = -2.3 + k * 0.42; B.ceramic.geo(ico(0.09, 1, x, y + 0.07, -0.1, L(pick(r, [0xc8803a, 0xd89a4a, 0xa86a2a])), 1.5, 0.7, 0.85)); }
        for (let k = 0; k < 3; k++) { const x = 0.4 + k * 0.6; B.ceramic.geo(paint(prep(new THREE.CylinderGeometry(0.16, 0.16, 0.13, 14)), (px, py) => (py > 0.02 ? L(pick(r, [0xfaf6f0, 0xf6b8c8, 0x6a3a24])) : L(0xf4e4c8))).translate(x, y + 0.08, 0)); B.ceramic.geo(ico(0.025, 1, x, y + 0.17, 0, L(0xd8203a))); }
        for (let k = 0; k < 10; k++) B.ceramic.geo(cyl(0.045, 0.045, 0.02, 10, -2.3 + k * 0.5, y + 0.0, 0.25, L(pick(r, [0xd8a058, 0x8a5a3a, 0xe8c080]))));
      });
      B.col(0, 0, 5.3, 0.9);
      B.at();
      for (let k = 0; k < 3; k++) { const x = -2.4 + k * 0.35; B.ceramic.geo(cyl(0.11, 0.09, 0.04, 12, x, 1.17, -1.45, L(0xd8a058))); B.food('berries', x, 1.2, -1.45, k, 1.0, k === 1); }
      registerG(B, 1.6, 1.15, -1.6, PI);
      B.setClerk(-0.3, -2.45, 0);
      B.shopper(-1.8, -0.6, PI); B.shopper(0.8, -0.6, PI);
      // bread racks on the back wall with loaves and baguettes in baskets, the menu board
      wallShelf(B, 'B', -2.2, 3.2, { strip: null, wood: L(0x8a5a34), h: 2.2, n: 5, d: 0.5, shopper: false, items: (y, i) => {
        if (i === 0) { for (let k = 0; k < 4; k++) { basketG(B, -1.2 + k * 0.8, y, 0.25, 0.22, 0.3); for (let j = 0; j < 5; j++) B.ceramic.geo(pipeGeo(-1.2 + k * 0.8 + (j - 2) * 0.05, y + 0.1, 0.25 + (j % 2) * 0.05, -1.2 + k * 0.8 + (j - 2) * 0.08, y + 0.7, 0.22 + (j % 2) * 0.06, 0.028, L(0xd8a050), 6)); } return; }
        for (let x = -1.45; x < 1.45; x += 0.27) B.ceramic.geo(ico(0.1, 1, x, y + 0.08, 0.25 + (r() - 0.5) * 0.1, L(pick(r, [0xc8803a, 0xd89a4a, 0xa86a2a, 0xe8b060])), 1.25, 0.75, 0.9));
      } });
      B.art.geo(boardG(1.2, 0.6, boardUV(BOARD.bakery), 1.6, 1.95, -hd + 0.03));
      // ovens in the back right corner, a basket of apples for pies, a pumpkin
      for (let k = 0; k < 2; k++) {
        const y = 0.15 + k * 0.95;
        B.metal.box(3.4, 5.6, y, y + 0.9, -hd, -hd + 0.9, L(0xb8bec4), 'tflr');
        B.metal.box(3.6, 5.4, y + 0.15, y + 0.75, -hd + 0.9, -hd + 0.91, L(0x2a2a2a), 'f');
        B.lamp.box(3.75, 5.25, y + 0.25, y + 0.6, -hd + 0.91, -hd + 0.915, L(0xff9a4a), 'f', 0.9);
        B.metal.geo(pipeGeo(3.7, y + 0.8, -hd + 0.98, 5.3, y + 0.8, -hd + 0.98, 0.015, L(0x2a2a2a), 5));
      }
      B.cols.push({ box: true, x: 4.5, z: -hd + 0.45, hw: 1.15, hd: 0.5, rot: 0 });
      basketG(B, 2.6, 0, -3.6, 0.32, 0.35);
      for (let k = 0; k < 7; k++) B.food('apple', 2.6 + (r() - 0.5) * 0.36, 0.3, -3.6 + (r() - 0.5) * 0.36, r() * 6, 1.0, k === 3);
      B.colR(2.6, -3.6, 0.35);
      B.food('pumpkin', -hw + 0.6, 0, -0.4, 0.5, 1.3, true); B.colR(-hw + 0.6, -0.4, 0.3);
      // two little tables by the windows
      for (const s of [-1, 1]) { tableG(B, s * 3.6, 1.8, 0.4, 0.75, L(0xc8a878)); chairG(B, s * 3.6 - 0.6, 1.8, HP, L(0x8a4a2a)); chairG(B, s * 3.6 + 0.6, 1.8, -HP, L(0x8a4a2a)); B.cols.push({ box: true, x: s * 3.6, z: 1.8, hw: 0.9, hd: 0.4, rot: 0 }); B.ceramic.geo(cyl(0.045, 0.035, 0.08, 8, s * 3.6, 0.75, 1.8, L(0xfbfaf6))); }
      for (const x of [-2.5, 0, 2.5]) pendantG(B, x, -1.6, H - 1.0, H, 0x8a4a2a);
      wallShelf(B, 'L', 1.6, 1.6, { strip: STRIP.boxes, wood: L(0x8a5a34), h: 1.5, n: 3 });
    },
    toy(B, hw, hd, H, r) {
      wallShelf(B, 'L', -2.0, 3.4, { strip: STRIP.toys, wood: L(0xf4f0e6), h: 2.0, n: 5, shopperX: -0.5 });
      wallShelf(B, 'L', 1.6, 2.4, { strip: STRIP.toys, wood: L(0xf4f0e6), h: 2.0, n: 5 });
      wallShelf(B, 'R', -2.0, 3.4, { strip: STRIP.toys, wood: L(0xf4f0e6), h: 2.0, n: 5, shopperX: 0.6 });
      wallShelf(B, 'B', -2.6, 3.4, { strip: null, wood: L(0xf4f0e6), h: 2.0, n: 4, items: (y, i) => {
        if (i % 2) { for (let x = -1.4; x < 1.5; x += 0.45) teddy(B.fabric, x, y, 0.2, 0.75, pick(r, [0xa8642c, 0xf0f0e8, 0xc89058, 0x8a5a3a])); }
        else for (let x = -1.45; x < 1.5; x += 0.3) B.ceramic.geo(g3.ball(x, y, 0.22, 0.11, pick(r, [0xd8443a, 0x3a7ac8, 0xf2c43a, 0x4aa860, 0xe86a9a]), 0xf4f4f0));
      } });
      // the train table in the middle: an oval track and a little train
      B.wood.box(-1.6, 1.6, 0, 0.7, -1.6, 0.0, L(0x4aa860), 'tflrk');
      B.wood.box(-1.65, 1.65, 0.7, 0.74, -1.65, 0.05, L(0x8a6a4a), 'tfblrk');
      B.metal.geo(paint(prep(new THREE.TorusGeometry(1.0, 0.03, 4, 32)).rotateX(HP).scale(1.25, 1, 0.55), L(0x6a5a4a)).translate(0, 0.76, -0.8));
      const tz = -0.8 + 0.55;
      B.wood.box(-0.4, -0.1, 0.77, 0.9, tz - 0.06, tz + 0.06, L(0xd8443a)); B.wood.box(-0.2, -0.1, 0.9, 0.98, tz - 0.06, tz + 0.06, L(0x2a2a2a));
      B.wood.box(-0.05, 0.25, 0.77, 0.88, tz - 0.06, tz + 0.06, L(0x3a7ac8)); B.wood.box(0.3, 0.6, 0.77, 0.88, tz - 0.06, tz + 0.06, L(0xf2c43a));
      B.cols.push({ box: true, x: 0, z: -0.8, hw: 1.65, hd: 0.85, rot: 0 });
      B.shopper(0, 0.5, PI); B.shopper(-2.2, -0.8, HP);
      // a big bin of balls, a pile of teddies, kites hanging
      B.wood.geo(cyl(0.6, 0.6, 0.6, 14, 3.4, 0, 1.3, L(0x3a7ac8)));
      for (let k = 0; k < 14; k++) { const a = r() * TAU, d = r() * 0.45; B.ceramic.geo(g3.ball(3.4 + Math.cos(a) * d, 0.5 + r() * 0.12, 1.3 + Math.sin(a) * d, 0.1, pick(r, [0xd8443a, 0xf2c43a, 0x4aa860, 0xe86a9a, 0x9a5ac8]), 0xf4f4f0)); }
      B.colR(3.4, 1.3, 0.65); B.shopper(3.4, 2.35, PI);
      teddy(B.fabric, -3.2, 0, 1.4, 2.4); teddy(B.fabric, -2.6, 0, 1.7, 1.6, 0xf0f0e8); teddy(B.fabric, -3.6, 0, 2.0, 1.4, 0xc89058);
      B.colR(-3.1, 1.6, 0.6);
      hangingKite(B, -1.5, 1.2, 2.3, H, 0xf2c43a, 0xd8443a, 0.3); hangingKite(B, 1.6, 0.6, 2.4, H, 0x3a7ac8, 0xf4f4f0, -0.4); hangingKite(B, 0.2, -2.6, 2.5, H, 0x4aa860, 0xf2c43a, 0.1);
      counterAt(B, 3.4, -3.2, 0, 2.4, 0.7, 1.0, L(0xd8443a), L(0xf4f0e6));
      for (const [x, z] of [[-2, -1], [2, -1], [0, 2]]) pendantG(B, x, z, H - 0.7, H, 0xf2c43a);
    },
    grocery(B, hw, hd, H, r) {
      // produce stands near the front: apples, carrots, berries, pumpkins, greens
      const crate = (x, z, ry, fill, treat) => {
        B.at(x, z, ry);
        B.wood.box(-0.6, 0.6, 0, 0.55, -0.4, 0.4, L(0x8a6a4a), 'tflr');
        B.wood.geo(boxG(1.2, 0.18, 0.8, 0, 0, 0, L(0x9a7a56)).rotateX(-0.25).translate(0, 0.72, 0));
        fill();
        B.col(0, 0, 1.25, 0.85);
        if (treat) { const p = B.pt(0, 0.85, 0); B.treats.push({ x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3), type: treat }); }
        B.at();
      };
      crate(-4.4, 1.0, 0.3, () => { for (let i = 0; i < 5; i++) for (let j = 0; j < 3; j++) B.food('apple', -0.45 + i * 0.22, 0.78 - (j - 1) * 0.06, (j - 1) * 0.24, i + j, 0.95); }, 'apple');
      crate(-2.9, 1.0, 0, () => { for (let i = 0; i < 6; i++) for (let j = 0; j < 2; j++) B.wood.geo(paint(prep(new THREE.ConeGeometry(0.03, 0.2, 6)).rotateZ(HP), L(0xe8761c)).translate(-0.45 + i * 0.18, 0.8 - (j - 0.5) * 0.06, (j - 0.5) * 0.3)); B.plant.geo(ico(0.12, 0, -0.55, 0.82, 0, L(0x4a8a2a), 1, 0.6, 2)); }, 'carrot');
      crate(-4.4, -0.4, 0.3, () => { for (let i = 0; i < 4; i++) for (let j = 0; j < 2; j++) { B.wood.box(-0.5 + i * 0.27, -0.3 + i * 0.27, 0.72 - (j - 0.5) * 0.05, 0.8 - (j - 0.5) * 0.05, (j - 0.5) * 0.36 - 0.1, (j - 0.5) * 0.36 + 0.1, L(0xf4f0e6), 'tflr'); B.food('berries', -0.4 + i * 0.27, 0.8 - (j - 0.5) * 0.05, (j - 0.5) * 0.36, 0, 1.0); } }, 'berries');
      crate(-2.9, -0.4, 0, () => { for (let k = 0; k < 5; k++) B.plant.geo(ico(0.13, 1, -0.45 + k * 0.22, 0.85, (k % 2 - 0.5) * 0.3, L(0x6aa83a), 1, 0.75, 1)); }, null);
      B.wood.box(-hw + 0.2, -hw + 1.2, 0, 0.45, 2.3, 3.3, L(0x8a6a4a), 'tflr');
      for (let k = 0; k < 3; k++) B.food('pumpkin', -hw + 0.45 + (k % 2) * 0.45, 0.45, 2.55 + k * 0.28, k, 1.1, k === 1);
      B.cols.push({ box: true, x: -hw + 0.7, z: 2.8, hw: 0.55, hd: 0.55, rot: 0 });
      againstWall(B, 'L', 0.3, hw, hd, () => B.art.geo(boardG(1.2, 0.6, boardUV(BOARD.produce), 0, 2.2, 0.03)));
      B.shopper(-3.6, 2.1, PI); B.shopper(-3.7, 0.3, -HP + 0.3);
      // two aisles
      gondola(B, -0.6, -1.4, 3.6, 1.6, [STRIP.boxes, STRIP.cans]);
      gondola(B, 1.9, -1.4, 3.6, 1.6, [STRIP.jars, STRIP.boxes]);
      B.shopper(0.65, -1.0, -HP); B.shopper(-1.85, -2.0, HP);
      for (const x of [-0.6, 1.9]) { B.metal.geo(pipeGeo(x, 2.55, 0.3, x, H, 0.3, 0.006, L(0x2a2a2a), 3)); for (const ry of [0, PI]) B.art.geo(flatUV(paint(prep(new THREE.PlaneGeometry(1.0, 0.5)), [1, 1, 1]), boardUV(BOARD.aisles)).rotateY(ry).translate(x, 2.3, 0.3 + (ry ? -0.005 : 0.005))); }
      // fridge cases along the back wall: glass doors, lit shelves of drinks and dairy
      againstWall(B, 'B', -1.4, hw, hd, () => {
        const len = 6.4, d = 0.7, h = 2.1;
        B.metal.box(-len / 2, len / 2, 0, h, 0, d, L(0xe8ecee), 'tlr');
        B.metal.box(-len / 2, len / 2, 0, 0.1, d - 0.02, d, L(0xe8ecee), 'tf'); B.metal.box(-len / 2, len / 2, h - 0.15, h, d - 0.02, d, L(0xe8ecee), 'bf');
        B.metal.box(-len / 2 + 0.05, len / 2 - 0.05, 0.1, h - 0.15, 0.02, d - 0.04, L(0x3a4a52), 'f');
        for (let i = 0; i < 4; i++) { const y = 0.2 + i * 0.45; B.art.geo(boardG(len - 0.2, 0.25, stripUVin(i % 2 ? STRIP.cans : STRIP.jars, 3.6), 0, y + 0.13, d - 0.08)); B.lamp.box(-len / 2 + 0.1, len / 2 - 0.1, y + 0.4, y + 0.41, 0.05, d - 0.1, L(0xf0f6ff), 'b', 0.8); }
        for (let k = 0; k <= 8; k++) B.metal.box(-len / 2 + k * len / 8 - 0.02, -len / 2 + k * len / 8 + 0.02, 0.1, h - 0.15, d - 0.03, d + 0.02, L(0xc8ccd0), 'flr');
        B.clear.quad([-len / 2, 0.1, d], [len / 2, 0.1, d], [len / 2, h - 0.15, d], [-len / 2, h - 0.15, d], [1, 1, 1], [0, 0, 1, 1]);
        B.col(0, d / 2, len, d);
        B.shopper(-1.0, d + 0.6, PI); B.shopper(1.6, d + 0.6, PI);
      });
      // the fish counter on the right wall: fish on ice
      againstWall(B, 'R', -2.4, hw, hd, () => {
        const len = 2.2, d = 0.8;
        glassCase(B, len, d, 1.15, L(0xf4f4f0), (y) => {
          B.ceramic.box(-len / 2 + 0.05, len / 2 - 0.05, y, y + 0.06, -d / 2 + 0.05, d / 2 - 0.05, L(0xf4f8fa), 't');
          for (let k = 0; k < 4; k++) B.food('fish', -0.75 + k * 0.5, y + 0.07, (k % 2 - 0.5) * 0.15, HP, 1.0, k === 1 || k === 2);
        });
        B.col(0, 0, len, d);
        B.setClerk(0, -d / 2 - 0.4, 0);
        B.shopper(0, d / 2 + 0.6, PI);
      }, 1.2);
      // registers by the door
      counterAt(B, 3.5, 2.4, PI, 2.2, 0.7, 0.95, L(0x3a7a3a), L(0x2a2a2a));
      B.metal.box(2.6, 4.4, 0.95, 0.97, 2.15, 2.65, L(0x3a3a3a), 't');
      for (const [x, z] of [[-3, 1], [0.6, -1.4], [3, -1]]) pendantG(B, x, z, H - 0.6, H, 0xe8ecee);
    },
    icecream(B, hw, hd, H, r) {
      // the dipping cabinet with tubs under a glass top, the menu, cones and toppings on the back counter
      B.at(0, -2.2, 0);
      glassCase(B, 4.4, 0.9, 1.15, L(0xf4f0f2), (y) => {
        const fl = [0xf6a8c0, 0xa8e0c8, 0xf8e8b0, 0x8a5a3a, 0xc8a0e0, 0xf8f4f0, 0xf0c0a0, 0xe8443a, 0x7ac0e8, 0xf2d040];
        for (let k = 0; k < 10; k++) { const x = -1.9 + (k % 5) * 0.95, z = k < 5 ? -0.18 : 0.18; B.metal.box(x - 0.2, x + 0.2, y - 0.25, y + 0.02, z - 0.15, z + 0.15, L(0xc8ccd0), 't'); B.ceramic.geo(ico(0.17, 1, x, y + 0.0, z, L(fl[k]), 1.1, 0.35, 0.85)); }
      });
      B.col(0, 0, 4.5, 1.0);
      B.at();
      B.food('berries', 1.9, 1.2, -2.2, 0, 1.2, true); B.ceramic.geo(cyl(0.12, 0.1, 0.05, 12, 1.9, 1.15, -2.2, L(0xf4f4f0)));
      B.setClerk(0, -3.2, 0);
      againstWall(B, 'B', 0, hw, hd, () => {
        B.wood.box(-2.4, 2.4, 0, 0.95, 0, 0.6, L(0xe8789e), 'tflr'); B.wood.box(-2.45, 2.45, 0.95, 1.0, 0, 0.65, L(0xf4f4f0), 'tfblr');
        for (let k = 0; k < 4; k++) { B.ceramic.geo(paint(prep(new THREE.ConeGeometry(0.05, 0.4, 8)).rotateX(PI), L(0xd8a058)).translate(-1.8 + k * 0.15, 1.2, 0.3)); }
        for (let k = 0; k < 4; k++) { B.clear.geo(cyl(0.07, 0.07, 0.2, 10, 0.8 + k * 0.2, 1.0, 0.3, [1, 1, 1])); B.ceramic.geo(cyl(0.06, 0.06, 0.12, 8, 0.8 + k * 0.2, 1.0, 0.3, L(pick(r, [0xe8443a, 0xf2d040, 0x8a5a3a, 0xf6a8c0])))); }
        B.art.geo(boardG(2.4, 1.2, boardUV(BOARD.icecream), 0, 1.8, 0.03));
        B.col(0, 0.3, 4.8, 0.6);
      });
      B.shopper(-1.2, -1.2, PI); B.shopper(1.0, -1.2, PI);
      // little tables with chairs, a window bench
      for (const [x, z] of [[-3.8, 0.6], [3.8, 0.6], [-3.8, 2.4], [3.8, 2.4]]) { tableG(B, x, z, 0.38, 0.75, L(0xf4f4f0), L(0xc8ccd0)); chairG(B, x - 0.6, z, HP, L(0xe8789e), L(0xc8ccd0)); chairG(B, x + 0.6, z, -HP, L(0x7ac0b8), L(0xc8ccd0)); B.cols.push({ box: true, x, z, hw: 0.9, hd: 0.4, rot: 0 }); }
      B.shopper(3.8, 1.5, PI);
      for (const [x, z] of [[-2, -1.5], [2, -1.5], [0, 1.2]]) pendantG(B, x, z, H - 0.8, H, 0xe8789e);
      plantG(B, -hw + 0.4, -3.9, 1.2, r); B.cols.push({ box: true, x: -hw + 0.4, z: -3.9, hw: 0.25, hd: 0.25, rot: 0 });
    },
    cafe(B, hw, hd, H, r) {
      // the counter at the back: espresso machine, grinder, cups, register, a pastry case, the menu board
      againstWall(B, 'B', 0.9, hw, hd, () => {
        const len = 5.2, d = 0.65;
        B.wood.box(-len / 2, len / 2, 0, 0.9, 0, d, L(0x5a3a24), 'tflr'); B.wood.box(-len / 2, len / 2, 0.9, 0.95, 0, d + 0.03, L(0x2a2a2a), 'tfblr');
        B.metal.box(-1.9, -1.0, 0.95, 1.45, 0.08, 0.55, L(0xc8ccd0), 'tflr'); B.metal.box(-1.85, -1.05, 1.45, 1.5, 0.1, 0.5, L(0x8a8e92), 'tf');
        for (const x of [-1.7, -1.2]) B.metal.box(x - 0.04, x + 0.04, 1.1, 1.22, 0.55, 0.62, L(0x2a2a2a), 'flr');
        B.metal.box(-0.8, -0.55, 0.95, 1.35, 0.15, 0.4, L(0x2a2a2a), 'tflr'); B.clear.geo(cyl(0.1, 0.08, 0.2, 10, -0.675, 1.35, 0.28, [1, 1, 1]));
        for (let k = 0; k < 6; k++) B.ceramic.geo(cyl(0.045, 0.035, 0.08, 8, -0.2 + (k % 3) * 0.11, 0.95 + Math.floor(k / 3) * 0.08, 0.3, L(0xfbfaf6)));
        B.art.geo(boardG(2.0, 1.0, boardUV(BOARD.cafe), -0.4, 1.85, 0.03));
        B.col(0, d / 2, len, d);
      });
      counterAt(B, 0.9, -2.6, 0, 3.4, 0.7, 1.0, L(0x5a3a24), L(0x2a2a2a));
      B.at(-2.0, -2.6, 0);
      glassCase(B, 1.4, 0.65, 1.3, L(0x5a3a24), (y) => {
        for (let k = 0; k < 5; k++) B.ceramic.geo(ico(0.07, 1, -0.5 + k * 0.25, y + 0.05, 0.05, L(pick(r, [0xd89a4a, 0xc8803a, 0x6a3a24])), 1.4, 0.7, 1));
        B.ceramic.geo(cyl(0.14, 0.12, 0.03, 12, 0.4, y + 0.3, 0, L(0xf4f4f0)));
        B.food('berries', 0.4, y + 0.33, 0, 0, 1.1, true);
      });
      B.col(0, 0, 1.5, 0.7);
      B.at();
      B.food('apple', 0.0, 1.02, -2.5, 0, 1.0, true); B.food('apple', 0.12, 1.02, -2.42, 1, 1.0);
      B.shopper(0.9, -1.6, PI); B.shopper(-2.0, -1.7, PI);
      // tables and chairs, a sofa corner, plants, pendant lights
      for (const [x, z] of [[-3.8, -0.4], [-1.4, 0.2], [1.4, 0.2], [3.8, -0.4], [-3.8, 2.0], [3.8, 2.0]]) {
        tableG(B, x, z, 0.4, 0.76, L(0x8a5a3a)); chairG(B, x, z - 0.62, 0, L(0x2a4a3a)); chairG(B, x, z + 0.62, PI, L(0x2a4a3a));
        B.ceramic.geo(cyl(0.045, 0.035, 0.08, 8, x + 0.1, 0.76, z, L(0xfbfaf6))); B.cols.push({ box: true, x, z, hw: 0.42, hd: 0.9, rot: 0 });
      }
      B.shopper(1.4, 1.1, PI);
      for (const x of [-3, 0, 3]) pendantG(B, x, -0.5, H - 1.0, H, 0x24382e);
      plantG(B, hw - 0.4, -2.0, 1.4, r); plantG(B, -hw + 0.4, -2.2, 1.4, r);
      B.cols.push({ box: true, x: hw - 0.4, z: -2.0, hw: 0.28, hd: 0.28, rot: 0 }, { box: true, x: -hw + 0.4, z: -2.2, hw: 0.28, hd: 0.28, rot: 0 });
    },
    flower(B, hw, hd, H, r) {
      // tiered stands of flower buckets along both side walls
      const stand = (side, c, len) => againstWall(B, side, c, hw, hd, () => {
        for (let t = 0; t < 3; t++) {
          const y = t * 0.35, z0 = t * 0.3, z1 = z0 + 0.35;
          B.wood.box(-len / 2, len / 2, 0, y + 0.3, 0.9 - z1, 0.9 - z0, L(0x8a6a4a), 'tflr');
          for (let x = -len / 2 + 0.25; x < len / 2 - 0.1; x += 0.42) {
            const zc = 0.9 - (z0 + z1) / 2, fc = pick(r, [0xe8405a, 0xf2c83a, 0xf4f0f0, 0xd05aa0, 0xe8603a, 0x9a6ad8]);
            B.metal.geo(cyl(0.13, 0.11, 0.24, 8, x, y + 0.3, zc, L(0x7a8a92)));
            B.plant.geo(ico(0.16, 0, x, y + 0.66, zc, L(0x3e7a2e), 1, 0.9, 1));
            for (let f = 0; f < 5; f++) B.plant.geo(paint(prep(new THREE.OctahedronGeometry(0.055, 0)), L(fc)).translate(x + (r() - 0.5) * 0.24, y + 0.72 + r() * 0.16, zc + (r() - 0.5) * 0.2));
          }
        }
        B.col(0, 0.45, len, 0.9);
        B.shopper(0, 1.5, PI);
      });
      stand('L', -1.6, 3.6); stand('R', -1.6, 3.6);
      // a flower cooler at the back, the work counter with paper and bouquets, potted plants, hanging baskets
      againstWall(B, 'B', -2.4, hw, hd, () => {
        B.metal.box(-1.2, 1.2, 0, 2.1, 0, 0.7, L(0xe8ecee), 'tflr');
        B.metal.box(-1.15, 1.15, 0.1, 1.95, 0.02, 0.66, L(0x3a4a42), 'f');
        for (let y = 0.2; y < 1.8; y += 0.55) for (let x = -0.95; x < 1.0; x += 0.38) { B.metal.geo(cyl(0.1, 0.09, 0.2, 8, x, y, 0.4, L(0x7a8a92))); for (let f = 0; f < 4; f++) B.plant.geo(paint(prep(new THREE.OctahedronGeometry(0.05, 0)), L(pick(r, [0xe8405a, 0xf4f0f0, 0xf2c83a, 0xd05aa0]))).translate(x + (r() - 0.5) * 0.15, y + 0.3 + r() * 0.1, 0.4 + (r() - 0.5) * 0.1)); }
        B.clear.quad([-1.2, 0.1, 0.71], [1.2, 0.1, 0.71], [1.2, 1.95, 0.71], [-1.2, 1.95, 0.71], [1, 1, 1], [0, 0, 1, 1]);
        B.metal.box(-0.02, 0.02, 0.1, 1.95, 0.7, 0.74, L(0xc8ccd0), 'flr');
        B.col(0, 0.35, 2.4, 0.7);
        B.shopper(0.4, 1.3, PI);
      });
      counterAt(B, 2.6, -3.3, 0, 2.6, 0.75, 0.95, L(0x6a8a5a), L(0xd8c8a8));
      B.metal.geo(paint(prep(new THREE.CylinderGeometry(0.08, 0.08, 1.0, 10)).rotateZ(HP), L(0xf0e8d8)).translate(1.9, 1.05, -3.2));
      for (let k = 0; k < 3; k++) { const x = 2.6 + k * 0.3; for (let f = 0; f < 5; f++) B.plant.geo(paint(prep(new THREE.OctahedronGeometry(0.05, 0)), L(pick(r, [0xe8405a, 0xf4f0f0, 0xd05aa0]))).translate(x + (r() - 0.5) * 0.12, 1.15 + r() * 0.08, -3.2 + (r() - 0.5) * 0.1)); B.fabric.geo(paint(prep(new THREE.ConeGeometry(0.1, 0.25, 8, 1, true)).rotateX(PI), L(0xf4ece0)).translate(x, 1.02, -3.2)); }
      // pots of grass to nibble on a little table
      tableG(B, 1.6, 0.8, 0.45, 0.7, L(0xd8c8a8));
      for (let k = 0; k < 3; k++) { const x = 1.6 + (k - 1) * 0.25; B.ceramic.geo(lathe([[0, 0], [0.07, 0], [0.09, 0.12], [0, 0.12]], 8, L(0xb8603a)).translate(x, 0.7, 0.8)); B.food('grass', x, 0.82, 0.8, k, 0.9, k === 1); }
      B.colR(1.6, 0.8, 0.5); B.shopper(1.6, 1.7, PI);
      for (const [x, z, s] of [[-1.2, 0.6, 1.6], [-0.4, -0.6, 1.2], [3.6, 1.6, 1.8], [-3.4, 2.6, 1.5], [4.8, 2.8, 1.3]]) { plantG(B, x, z, s, r); B.colR(x, z, 0.3 * s); }
      for (const [x, z] of [[-2.5, 0.2], [0.8, -1.8], [3.0, 0.4]]) { B.metal.geo(pipeGeo(x, 2.1, z, x, H, z, 0.006, L(0x2a2a2a), 3)); basketG(B, x, 1.85, z, 0.22, 0.2, 0x8a6a4a); for (let k = 0; k < 6; k++) B.plant.geo(ico(0.1, 0, x + (r() - 0.5) * 0.3, 2.0 + r() * 0.1, z + (r() - 0.5) * 0.3, k % 2 ? L(0x4a8a3a) : L(0xe8608a))); }
      B.art.geo(boardG(1.2, 0.6, boardUV(BOARD.fresh), 2.6, 2.0, -hd + 0.03));
    },
    books(B, hw, hd, H, r) { furnishBooks(B, hw, hd, H, r, false); },
    library(B, hw, hd, H, r) { furnishBooks(B, hw, hd, H, r, true); },
    clothes(B, hw, hd, H, r) {
      const cc = [0xd8443a, 0x3a6aa8, 0xf2c43a, 0x4aa860, 0xe86a9a, 0x2a2a2a, 0xf4f0e6, 0x8a5a3a, 0x9a5ac8];
      // straight racks of hanging clothes
      const rack = (x, z, ry, len) => {
        B.at(x, z, ry);
        for (const s of [-1, 1]) { B.metal.geo(pipeGeo(s * len / 2, 0, 0, s * len / 2, 1.55, 0, 0.018, L(0xc8ccd0), 6)); B.metal.box(s * len / 2 - 0.02, s * len / 2 + 0.02, 0, 0.03, -0.25, 0.25, L(0xc8ccd0), 'tf'); }
        B.metal.geo(pipeGeo(-len / 2, 1.55, 0, len / 2, 1.55, 0, 0.015, L(0xc8ccd0), 6));
        for (let x2 = -len / 2 + 0.1; x2 < len / 2 - 0.05; x2 += 0.09) { const c = L(pick(r, cc)), h2 = 0.6 + r() * 0.35; B.fabric.box(x2 - 0.02, x2 + 0.02, 1.5 - h2, 1.5, -0.2, 0.2, c, 'tflrkb'); }
        B.col(0, 0, len + 0.1, 0.45);
        B.shopper(0, 0.75, PI);
        B.at();
      };
      rack(-3.3, -0.8, HP, 2.4); rack(3.3, -0.8, -HP, 2.4); rack(-1.2, -3.6, 0, 2.6);
      // a round rack in the middle
      B.metal.geo(cyl(0.025, 0.025, 1.35, 6, 0.6, 0, -0.6, L(0xc8ccd0))); B.metal.geo(paint(prep(new THREE.TorusGeometry(0.55, 0.015, 4, 20)).rotateX(HP), L(0xc8ccd0)).translate(0.6, 1.35, -0.6));
      for (let k = 0; k < 16; k++) { const a = k / 16 * TAU, x = 0.6 + Math.cos(a) * 0.55, z = -0.6 + Math.sin(a) * 0.55; B.fabric.geo(boxG(0.04, 0.7, 0.36, 0, 0, 0, L(pick(r, cc)), 1, -a).translate(x, 1.0, z)); }
      B.colR(0.6, -0.6, 0.8); B.shopper(0.6, 0.5, PI);
      // mannequins by the windows, a mirror, a fitting room, folded stacks on the right wall, the counter
      for (const [x, z, c] of [[-3.2, 2.4, 0x3a6aa8], [-2.2, 2.6, 0xe86a9a], [3.0, 2.4, 0x4aa860]]) { mannequin(B.fabric, x, 0, z, c, r); B.colR(x, z, 0.3); }
      againstWall(B, 'L', 2.0, hw, hd, () => { B.wood.box(-0.45, 0.45, 0, 2.0, 0, 0.05, L(0x8a6a4a), 'tflr'); B.window.geo(setGlow(paint(prep(new THREE.PlaneGeometry(0.75, 1.8)), (px, py) => mixc(L(0x8aa0b0), L(0xd8e4ec), (py + 0.9) / 1.8)).translate(0, 1.0, 0.052), 0.35)); B.shopper(0, 0.9, PI); });
      againstWall(B, 'B', -4.5, hw, hd, () => { B.metal.geo(pipeGeo(-0.8, 2.2, 1.2, 0.8, 2.2, 1.2, 0.015, L(0xc8ccd0), 5)); for (let k = 0; k < 8; k++) { const x = -0.75 + k * 0.21; B.fabric.box(x - 0.11, x + 0.11, 0.3, 2.18, 1.15 + (k % 2) * 0.05, 1.19 + (k % 2) * 0.05, L(0x8a3a4a)); } for (const s of [-1, 1]) B.wood.box(s * 0.8 - 0.03, s * 0.8 + 0.03, 0, 2.2, 0, 1.2, L(0xf4f2ee), 'flr'); B.col(0, 0.6, 1.7, 1.2); });
      wallShelf(B, 'R', 1.4, 2.0, { strip: null, wood: L(0xf4f2ee), h: 1.9, n: 4, items: (y) => { for (let x = -0.8; x < 0.9; x += 0.34) for (let k = 0; k < 4; k++) B.fabric.box(x - 0.14, x + 0.14, y + k * 0.05, y + k * 0.05 + 0.045, 0.1, 0.38, L(pick(r, cc)), 'tflrkb'); } });
      counterAt(B, 3.0, -3.3, 0, 2.4, 0.7, 1.0, L(0x2a2a2c), L(0xf4f2ee));
      B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.sale), 1.2, 2.0, -hd + 0.03));
      for (const [x, z] of [[-2, -1], [2, -1], [0, 1.6]]) pendantG(B, x, z, H - 0.7, H, 0x2a2a2c);
    },
    general(B, hw, hd, H, r) {
      // tall wood shelves of jars and cans on the left and back walls, a counter with candy jars, barrels of apples
      wallShelf(B, 'L', -1.0, 4.0, { strip: STRIP.jars, wood: L(0x6a4428), h: 2.3, n: 6, shopperX: -0.4 });
      wallShelf(B, 'B', -2.4, 3.6, { strip: STRIP.cans, wood: L(0x6a4428), h: 2.3, n: 6, shopper: false });
      counterAt(B, 2.4, -2.6, 0, 3.0, 0.75, 1.0, L(0x7a4a2a), L(0x9a6a40), { regX: -1.15 });
      for (let k = 0; k < 4; k++) { const x = 1.8 + k * 0.28; B.clear.geo(cyl(0.09, 0.09, 0.28, 10, x, 1.0, -2.45, [1, 1, 1])); B.ceramic.geo(cyl(0.08, 0.08, 0.18, 10, x, 1.0, -2.45, L(pick(r, [0xd8443a, 0xf2a03a, 0x4aa860, 0xe86a9a])))); B.metal.geo(cyl(0.095, 0.095, 0.03, 10, x, 1.28, -2.45, L(0xc8a040))); }
      B.metal.box(3.0, 3.4, 1.0, 1.08, -2.7, -2.4, L(0x8a8e92), 'tflr'); B.metal.geo(lathe([[0, 0], [0.18, 0.02], [0.2, 0.06], [0, 0.04]], 10, L(0xc8a040)).translate(3.2, 1.25, -2.55)); B.metal.box(3.18, 3.22, 1.08, 1.25, -2.57, -2.53, L(0x8a8e92), 'flr');
      const barrel = (x, z, fill, treat) => { B.wood.geo(lathe([[0, 0], [0.3, 0], [0.35, 0.35], [0.3, 0.75], [0, 0.75]], 12, L(0x8a5a30)).translate(x, 0, z)); for (const hy of [0.12, 0.62]) B.metal.geo(paint(prep(new THREE.CylinderGeometry(0.33, 0.33, 0.04, 12, 1, true)), L(0x3a3030)).translate(x, hy, z)); fill(x, z); B.colR(x, z, 0.38); if (treat) B.treats.push({ x, y: 0.82, z, type: treat }); };
      barrel(-2.6, 1.6, (x, z) => { for (let k = 0; k < 9; k++) B.food('apple', x + (r() - 0.5) * 0.36, 0.72, z + (r() - 0.5) * 0.36, r() * 6, 1.1); }, 'apple');
      barrel(-1.7, 2.3, (x, z) => B.plant.geo(cyl(0.28, 0.28, 0.04, 12, x, 0.7, z, L(0x5a7a3a))), null);
      // an open sack of acorns and nuts
      B.fabric.geo(paint(lathe([[0, 0], [0.28, 0], [0.32, 0.3], [0.26, 0.5], [0.3, 0.56], [0, 0.5]], 10), L(0xc8b48a)).translate(2.2, 0, 1.4));
      for (let k = 0; k < 8; k++) B.food('acorn', 2.2 + (r() - 0.5) * 0.3, 0.5, 1.4 + (r() - 0.5) * 0.3, r() * 6, 1.4, k === 0);
      B.colR(2.2, 1.4, 0.35);
      B.shopper(-2.6, 0.7, 0); B.shopper(-0.6, -1.2, PI);
      // the pot belly stove in the corner, a hanging lantern, a broom
      B.metal.geo(lathe([[0, 0], [0.3, 0], [0.32, 0.1], [0.36, 0.5], [0.3, 0.9], [0.18, 1.0], [0, 1.0]], 12, L(0x1e1e1e)).translate(hw - 0.6, 0, -hd + 0.7));
      B.lamp.box(hw - 0.72, hw - 0.48, 0.3, 0.45, -hd + 1.0, -hd + 1.02, L(0xff8a3a), 'f', 0.8);
      B.metal.geo(pipeGeo(hw - 0.6, 1.0, -hd + 0.7, hw - 0.6, H, -hd + 0.7, 0.07, L(0x1e1e1e), 8));
      B.colR(hw - 0.6, -hd + 0.7, 0.4);
      B.metal.geo(pipeGeo(0.6, 2.2, 0.2, 0.6, H, 0.2, 0.006, L(0x2a2a2a), 3)); B.metal.box(0.48, 0.72, 1.95, 2.2, 0.08, 0.32, L(0x2a2a2a), 'tflrk'); B.lamp.box(0.5, 0.7, 1.98, 2.15, 0.1, 0.3, L(0xffc070), 'flrk', 1.2);
      B.wood.geo(pipeGeo(hw - 0.3, 0, 1.6, hw - 0.15, 1.4, 1.5, 0.015, L(0x9a7a50), 5)); B.fabric.geo(paint(prep(new THREE.ConeGeometry(0.15, 0.35, 8)).rotateX(PI), L(0xd8b860)).translate(hw - 0.3, 0.17, 1.6));
      for (const [x, z] of [[-1.5, -0.5], [1.5, 0.5]]) pendantG(B, x, z, H - 0.9, H, 0x3a3430);
    },
    post(B, hw, hd, H, r) {
      // post office boxes on the left wall
      againstWall(B, 'L', -0.6, hw, hd, () => {
        B.wood.box(-1.8, 1.8, 0.3, 2.3, 0, 0.12, L(0x7a5a34), 'tflr');
        for (let i = 0; i < 12; i++) for (let j = 0; j < 7; j++) { const x = -1.65 + i * 0.3, y = 0.42 + j * 0.27; B.metal.box(x, x + 0.25, y, y + 0.22, 0.12, 0.135, L(0xc8a858), 'f'); B.metal.box(x + 0.05, x + 0.11, y + 0.13, y + 0.17, 0.135, 0.14, L(0x2a2a2a), 'f'); }
        B.col(0, 0.06, 3.6, 0.14);
        B.shopper(-0.6, 0.8, PI);
      });
      // the counter with two service windows, a scale and parcels behind
      againstWall(B, 'B', 0.8, hw, hd, () => {
        const len = 5.4, z = 1.5;
        B.wood.box(-len / 2, len / 2, 0, 1.05, z - 0.35, z + 0.35, L(0x5a4a3a), 'tflr'); B.wood.box(-len / 2 - 0.03, len / 2 + 0.03, 1.05, 1.1, z - 0.38, z + 0.38, L(0xd8d0c0), 'tfblr');
        B.wood.box(-len / 2, len / 2, 1.1, 2.4, z - 0.32, z - 0.26, L(0x5a4a3a), 'flr');
        for (const x of [-1.3, 1.3]) { B.clear.quad([x - 0.7, 1.25, z - 0.25], [x + 0.7, 1.25, z - 0.25], [x + 0.7, 2.2, z - 0.25], [x - 0.7, 2.2, z - 0.25], [1, 1, 1], [0, 0, 1, 1]); B.wood.box(x - 0.75, x + 0.75, 1.1, 1.25, z - 0.31, z - 0.24, L(0x3a2a1a), 'f'); B.wood.box(x - 0.75, x + 0.75, 2.2, 2.4, z - 0.31, z - 0.24, L(0x3a2a1a), 'f'); }
        B.wood.box(-len / 2, -2.05, 1.1, 2.4, z - 0.31, z - 0.24, L(0x5a4a3a), 'f'); B.wood.box(-0.6, 0.6, 1.1, 2.4, z - 0.31, z - 0.24, L(0x5a4a3a), 'f'); B.wood.box(2.05, len / 2, 1.1, 2.4, z - 0.31, z - 0.24, L(0x5a4a3a), 'f');
        B.metal.box(0.9, 1.2, 1.1, 1.18, z, z + 0.2, L(0xc8ccd0), 'tflr');
        for (let k = 0; k < 7; k++) { const w2 = 0.3 + r() * 0.3, h2 = 0.2 + r() * 0.25, x = -2.2 + k * 0.65, y0 = 0; B.wood.box(x - w2 / 2, x + w2 / 2, y0, y0 + h2, 0.15, 0.6, L(0xc8a070), 'tflr'); B.wood.box(x - 0.012, x + 0.012, y0, y0 + h2 + 0.002, 0.15, 0.6, L(0xe8dcc0), 'tf'); }
        B.col(0, z, len, 0.8);
        B.setClerk(-1.3, z - 0.75, 0);
        B.shopper(-1.3, z + 1.0, PI); B.shopper(1.3, z + 1.0, PI);
      });
      // a standing desk for forms, mail bags, a blue mailbox, posters
      B.wood.box(1.0, 2.6, 0.95, 1.0, 0.4, 1.2, L(0x8a6a4a), 'tfblr'); for (const x of [1.15, 2.45]) B.wood.box(x - 0.04, x + 0.04, 0, 0.95, 0.75, 0.85, L(0x5a4a3a), 'flr');
      for (let k = 0; k < 4; k++) B.fabric.box(1.2 + k * 0.32, 1.45 + k * 0.32, 1.0, 1.005, 0.6, 0.95, L(0xf4f0e6), 't');
      B.cols.push({ box: true, x: 1.8, z: 0.8, hw: 0.85, hd: 0.45, rot: 0 }); B.shopper(1.8, 1.6, PI);
      for (const [x, z] of [[hw - 0.5, 0.2], [hw - 0.6, 0.9]]) { B.fabric.geo(paint(roundBox(0.6, 0.75, 0.45, 0.15, null), L(0x6a7a8a)).translate(x, 0.37, z)); B.colR(x, z, 0.35); }
      B.metal.box(-3.7, -3.1, 0, 1.05, 2.1, 2.6, L(0x22406a), 'tflrk'); B.metal.geo(paint(prep(new THREE.CylinderGeometry(0.25, 0.25, 0.6, 10, 1, false, 0, PI)).rotateZ(HP).rotateY(HP), L(0x22406a)).translate(-3.4, 1.05, 2.35));
      B.metal.box(-3.6, -3.2, 0.85, 0.9, 2.6, 2.62, L(0xc8ccd0), 'f'); B.colR(-3.4, 2.35, 0.4);
      againstWall(B, 'R', -1.6, hw, hd, () => B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.post), 0, 1.8, 0.03)));
      plantG(B, hw - 0.4, 2.9, 1.2, r); B.colR(hw - 0.4, 2.9, 0.3);
      for (const [x, z] of [[-1.5, 0], [1.5, 0]]) pendantG(B, x, z, H - 0.7, H, 0x22406a);
    },
    diner(B, hw, hd, H, r) {
      // the long counter with stools, the back counter with a pie case and coffee, the kitchen window, the menu
      const cz = -2.0;
      B.wood.box(-3.2, 3.2, 0, 1.0, cz - 0.35, cz + 0.35, L(0xc8383a), 'tflr'); B.metal.box(-3.25, 3.25, 1.0, 1.05, cz - 0.4, cz + 0.42, L(0xd8dce0), 'tfblr');
      B.metal.box(-3.2, 3.2, 0.05, 0.12, cz + 0.35, cz + 0.36, L(0xd8dce0), 'f');
      B.cols.push({ box: true, x: 0, z: cz, hw: 3.3, hd: 0.45, rot: 0 });
      for (let k = 0; k < 7; k++) { const x = -2.7 + k * 0.9; stoolG(B, x, cz + 0.85, 0.78, L(0xc8383a)); B.colR(x, cz + 0.85, 0.2); }
      for (let k = 0; k < 4; k++) { const x = -2.5 + k * 1.6; B.ceramic.geo(cyl(0.11, 0.11, 0.015, 12, x, 1.05, cz + 0.1, L(0xfbfaf6))); B.ceramic.geo(cyl(0.045, 0.035, 0.08, 8, x + 0.25, 1.05, cz + 0.1, L(0xfbfaf6))); }
      B.setClerk(0, cz - 0.85, 0);
      B.shopper(-1.8, cz + 1.6, PI); B.shopper(1.0, cz + 1.6, PI);
      againstWall(B, 'B', 0, hw, hd, () => {
        B.metal.box(-3.6, 3.6, 0, 0.95, 0, 0.6, L(0xd8dce0), 'tflr'); B.wood.box(-3.65, 3.65, 0.95, 1.0, 0, 0.65, L(0x2a2a2a), 'tfblr');
        B.wood.box(-1.0, 1.0, 1.25, 2.1, 0.004, 0.012, L(0x2a2420), 'f'); B.lamp.box(-0.9, 0.9, 1.95, 2.05, 0.013, 0.014, L(0xfff0d0), 'f', 0.8); B.metal.box(-1.05, 1.05, 1.2, 1.25, 0, 0.3, L(0xd8dce0), 'tf'); B.metal.geo(ico(0.05, 1, 0.7, 1.29, 0.15, L(0xd8b048), 1, 0.6, 1));
        B.art.geo(boardG(2.0, 1.0, boardUV(BOARD.diner), -2.9, 2.15, 0.03)); B.art.geo(boardG(2.0, 1.0, boardUV(BOARD.diner), 2.9, 2.15, 0.03));
        for (const x of [-3.0, -2.6]) { B.metal.geo(cyl(0.09, 0.08, 0.2, 10, x, 1.0, 0.3, L(0x3a2a1a))); B.metal.geo(cyl(0.02, 0.02, 0.06, 6, x, 1.2, 0.3, L(0x2a2a2a))); }
        B.col(0, 0.3, 7.2, 0.6);
      });
      B.at(2.3, -hd + 0.3, 0, 1.0);
      glassCase(B, 1.2, 0.5, 0.48, L(0xd8dce0), (y) => {
        for (const x of [-0.3, 0.3]) { B.ceramic.geo(cyl(0.16, 0.13, 0.05, 12, x, y, 0, L(0xd8a058))); }
        B.food('berries', -0.3, y + 0.05, 0, 0, 1.3, true); B.food('apple', 0.3, y + 0.05, 0, 0, 1.0, true);
      });
      B.at();
      // red booths along the left wall
      for (let k = 0; k < 3; k++) {
        const z = -0.6 + k * 1.55, x = -hw + 0.6;
        B.wood.box(x - 0.35, x + 0.35, 0.7, 0.75, z - 0.35, z + 0.35, L(0xd8dce0), 'tfblr'); B.metal.box(x - 0.03, x + 0.03, 0, 0.7, z - 0.03, z + 0.03, L(0xb8bcc0), 'flrk');
        for (const s of [-1, 1]) { B.fabric.box(x - 0.45, x + 0.4, 0, 0.45, z + s * 0.62 - 0.22, z + s * 0.62 + 0.22, L(0xc8383a), 'tflrk'); B.fabric.box(x - 0.45, x + 0.4, 0.45, 1.15, z + s * 0.62 + s * 0.12 - 0.1, z + s * 0.62 + s * 0.12 + 0.1, L(0xc8383a), 'tflrkb'); }
        B.ceramic.geo(cyl(0.1, 0.1, 0.012, 12, x, 0.75, z, L(0xfbfaf6)));
        B.cols.push({ box: true, x: x - 0.02, z, hw: 0.45, hd: 0.85, rot: 0 });
      }
      B.shopper(-hw + 1.5, 0.95, -HP);
      for (const x of [-2.4, 0, 2.4]) pendantG(B, x, cz, H - 0.8, H, 0xc8383a);
      plantG(B, hw - 0.4, 1.0, 1.2, r); B.colR(hw - 0.4, 1.0, 0.3);
    },
    hardware(B, hw, hd, H, r) {
      // pegboard of tools on the left wall
      againstWall(B, 'L', -1.0, hw, hd, () => {
        B.wood.box(-1.8, 1.8, 0.4, 2.3, 0, 0.03, L(0xc8a878), 'f');
        for (let i = 0; i < 10; i++) for (let j = 0; j < 4; j++) {
          const x = -1.6 + i * 0.35, y = 0.7 + j * 0.42, k = (i + j * 3) % 4;
          if (k === 0) { B.wood.box(x - 0.015, x + 0.015, y - 0.15, y + 0.12, 0.05, 0.08, L(0xb08448)); B.metal.box(x - 0.08, x + 0.08, y + 0.1, y + 0.16, 0.04, 0.09, L(0x5a5e62)); }
          else if (k === 1) { B.metal.box(x - 0.015, x + 0.015, y - 0.15, y + 0.12, 0.05, 0.07, L(0x9aa2a8)); B.metal.geo(paint(prep(new THREE.TorusGeometry(0.04, 0.012, 4, 8)), L(0x9aa2a8)).translate(x, y + 0.15, 0.06)); }
          else if (k === 2) { B.metal.box(x - 0.12, x + 0.12, y - 0.05, y + 0.06, 0.05, 0.055, L(0xb8bcc0), 'f'); B.wood.box(x + 0.1, x + 0.16, y - 0.04, y + 0.05, 0.05, 0.08, L(0xc8402a)); }
          else { B.metal.box(x - 0.03, x + 0.03, y - 0.12, y + 0.08, 0.05, 0.09, L(0xe08a1a)); }
        }
        B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.tools), 0, 2.6, 0.03));
        B.col(0, 0.1, 3.6, 0.2);
        B.shopper(-0.5, 0.8, PI); B.shopper(0.8, 0.8, PI);
      });
      // paint on the right wall, an aisle of boxes, bins of nails
      wallShelf(B, 'R', -1.0, 3.6, { strip: STRIP.paint, wood: L(0x8a8e92), h: 2.1, n: 5, shopperX: 0.4 });
      againstWall(B, 'R', -1.0, hw, hd, () => B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.paint), 0, 2.45, 0.1)));
      gondola(B, 0.3, -1.6, 2.8, 1.5, [STRIP.paint, STRIP.boxes], L(0x8a8e92));
      B.shopper(1.25, -1.3, -HP);
      for (let k = 0; k < 6; k++) { const x = -2.2 + (k % 3) * 0.42, z = 1.0 + Math.floor(k / 3) * 0.42; B.wood.box(x - 0.18, x + 0.18, 0, 0.75, z - 0.18, z + 0.18, L(0x8a6a4a), 'tflr'); B.metal.box(x - 0.15, x + 0.15, 0.7, 0.74, z - 0.15, z + 0.15, L(0x9aa2a8), 't'); }
      B.cols.push({ box: true, x: -1.78, z: 1.2, hw: 0.65, hd: 0.45, rot: 0 }); B.shopper(-1.8, 2.0, PI);
      // the garden corner: watering cans, rakes, bags of soil
      for (let k = 0; k < 3; k++) { const x = 2.0 + k * 0.45; B.metal.geo(cyl(0.13, 0.11, 0.26, 10, x, 0, 1.6, L(pick(r, [0x3a8a3a, 0x3a7ac8, 0xe08a1a])))); B.metal.geo(pipeGeo(x + 0.1, 0.1, 1.6, x + 0.3, 0.3, 1.6, 0.015, L(0x3a8a3a), 5)); }
      for (let k = 0; k < 3; k++) { B.wood.geo(pipeGeo(hw - 0.2, 0, 2.2 + k * 0.3, hw - 0.1, 1.6, 2.1 + k * 0.3, 0.015, L(0xb08448), 5)); B.metal.box(hw - 0.25, hw - 0.05, 1.55, 1.62, 1.95 + k * 0.3, 2.25 + k * 0.3, L(0x5a5e62)); }
      for (let k = 0; k < 3; k++) B.fabric.geo(paint(roundBox(0.5, 0.18, 0.7, 0.06, null), L(0x5a4030)).translate(3.4, 0.09 + k * 0.17, 0.4));
      B.cols.push({ box: true, x: 2.9, z: 1.2, hw: 1.1, hd: 0.9, rot: 0 });
      // the counter, and a little bait cooler of worms for fishing
      counterAt(B, 2.6, -3.0, 0, 2.6, 0.7, 1.0, L(0x3a5a3a), L(0xd8d0c0));
      B.ceramic.box(-1.8, -1.2, 0, 0.6, -hd, -hd + 0.5, L(0xf4f4f0), 'tflr'); B.ceramic.box(-1.82, -1.18, 0.6, 0.66, -hd, -hd + 0.52, L(0x3a7ac8), 'tfblr');
      for (let k = 0; k < 2; k++) { const x = -1.65 + k * 0.3; B.ceramic.geo(cyl(0.08, 0.07, 0.08, 10, x, 0.66, -hd + 0.26, L(0xf4f0e6))); B.food('worm', x, 0.72, -hd + 0.26, k * 2, 0.9, true); }
      B.cols.push({ box: true, x: -1.5, z: -hd + 0.25, hw: 0.33, hd: 0.28, rot: 0 }); B.shopper(-1.5, -hd + 1.3, PI);
      for (const [x, z] of [[-1.5, -0.5], [1.5, -0.5]]) pendantG(B, x, z, H - 0.7, H, 0x3a5a3a);
    },
  };
  // bookstore and library: shelves on every wall, tables, a reading nook, a story corner
  function furnishBooks(B, hw, hd, H, r, lib) {
    const wood = lib ? L(0x5a3a24) : L(0x6a4428), sh = lib ? 2.4 : 2.2;
    wallShelf(B, 'L', -1.4, hd * 2 - 3.6, { strip: STRIP.booksA, wood, h: sh, n: 6, shopperX: -0.5 });
    wallShelf(B, 'B', -1.2, hw * 2 - 3.8, { strip: STRIP.booksB, wood, h: sh, n: 6, shopperX: 0.6 });
    wallShelf(B, 'R', -2.0, 2.6, { strip: STRIP.booksA, wood, h: sh, n: 6 });
    if (lib) {
      // freestanding shelves, two reading tables with green lamps, the librarian's desk
      for (const z of [-1.6, 0.2]) { B.at(-1.2, z, 0); for (const s of [0, 1]) { B.at(-1.2, z + (s ? -0.01 : 0.01), s ? PI : 0); shelfUnit(B, 2.6, 1.7, 0.36, 4, s ? STRIP.booksB : STRIP.booksA, wood); } B.at(); B.cols.push({ box: true, x: -1.2, z, hw: 1.35, hd: 0.42, rot: 0 }); B.shopper(-1.2, z + 0.95, PI); }
      for (const z of [-1.0, 1.0]) {
        const x = 2.6;
        B.wood.box(x - 0.9, x + 0.9, 0.72, 0.77, z - 0.45, z + 0.45, wood, 'tfblr'); for (const sx of [-1, 1]) for (const sz of [-1, 1]) B.wood.box(x + sx * 0.8 - 0.04, x + sx * 0.8 + 0.04, 0, 0.72, z + sz * 0.38 - 0.04, z + sz * 0.38 + 0.04, wood, 'flrk');
        for (const s of [-1, 1]) { chairG(B, x - 0.45, z + s * 0.75, s > 0 ? PI : 0, L(0x2e4a3a), wood); chairG(B, x + 0.45, z + s * 0.75, s > 0 ? PI : 0, L(0x2e4a3a), wood); }
        B.metal.geo(cyl(0.02, 0.02, 0.35, 5, x, 0.77, z, L(0xc8a040))); B.lamp.geo(setGlow(paint(prep(new THREE.CylinderGeometry(0.06, 0.16, 0.12, 10, 1, true)), L(0x2e6a3a)), 0).translate(x, 1.14, z)); B.lamp.geo(setGlow(ico(0.05, 0, x, 1.1, z, L(0xfff0c8)), 1.2));
        bookStack(B.fabric, x - 0.5, 0.77, z, 3, r);
        B.cols.push({ box: true, x, z, hw: 0.95, hd: 1.0, rot: 0 });
      }
      B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.quiet), 3.0, 2.0, -hd + 0.03));
      againstWall(B, 'R', 2.6, hw, hd, () => B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.read), 0, 1.9, 0.03)));
      counterAt(B, 3.0, -3.0, 0, 2.2, 0.7, 1.0, wood, L(0xd8c8a8), { register: false });
      bookStack(B.fabric, 2.4, 1.0, -3.0, 4, r); B.ceramic.geo(lathe([[0, 0], [0.04, 0], [0.045, 0.1], [0, 0.1]], 8, L(0x2e6a3a)).translate(3.5, 1.0, -3.0));
    } else {
      // two tables of books, a display stand, the counter
      for (const [x, z] of [[-0.6, -0.6], [2.2, 0.6]]) {
        B.wood.box(x - 0.8, x + 0.8, 0, 0.78, z - 0.5, z + 0.5, wood, 'tflrk');
        for (let k = 0; k < 5; k++) bookStack(B.fabric, x - 0.6 + (k % 3) * 0.6, 0.78, z - 0.25 + Math.floor(k / 3) * 0.5, 2 + Math.floor(r() * 4), r);
        B.cols.push({ box: true, x, z, hw: 0.85, hd: 0.55, rot: 0 }); B.shopper(x, z + 0.95, PI);
      }
      counterAt(B, 3.3, -3.2, 0, 2.2, 0.7, 1.0, L(0x24345e), L(0xd8c8a8));
      B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.read), 3.5, 2.0, -hd + 0.03));
    }
    // the reading nook: a braided rug, an armchair, a floor lamp; the story corner with beanbags and picture books
    rugG(B, -hw + 1.6, hd - 1.6, 1.2, 0.9, lib ? [0x2e4a3a, 0xd8b860, 0x7a2a2e] : [0x3a8ad0, 0xf0c040, 0xe0603a, 0x5ab06a]);
    for (const [x, z, c] of [[-hw + 1.0, hd - 1.2, 0xe86a9a], [-hw + 2.1, hd - 1.0, 0x5ab06a], [-hw + 1.4, hd - 2.1, 0xf0c040]]) { const bean = K.smoothNormals(prep(new THREE.IcosahedronGeometry(0.32, 2)).scale(1.1, 0.65, 1.0)); B.fabric.geo(paint(bean, L(c)).translate(x, 0.2, z)); B.colR(x, z, 0.32); }
    for (let k = 0; k < 3; k++) B.fabric.box(-hw + 1.5 + k * 0.25, -hw + 1.7 + k * 0.25, 0.01, 0.03, hd - 1.7 + k * 0.1, hd - 1.55 + k * 0.1, L(pick(r, [0xd8443a, 0x3a7ac8, 0xf2a03a])));
    againstWall(B, 'L', hd - 1.6, hw, hd, () => B.art.geo(boardG(1.0, 0.5, boardUV(BOARD.story), 0, 1.8, 0.03)));
    B.fabric.geo(roundBox(0.9, 0.4, 0.8, 0.08, L(lib ? 0x7a2a2e : 0x2e5a8a)).translate(hw - 0.8, 0.2, 1.4)); B.fabric.geo(roundBox(0.9, 0.6, 0.18, 0.08, L(lib ? 0x7a2a2e : 0x2e5a8a)).translate(hw - 0.8, 0.55, 1.75));
    for (const s of [-1, 1]) B.fabric.geo(roundBox(0.16, 0.55, 0.8, 0.06, L(lib ? 0x6a2228 : 0x264e7a)).translate(hw - 0.8 + s * 0.4, 0.42, 1.4));
    B.cols.push({ box: true, x: hw - 0.8, z: 1.5, hw: 0.5, hd: 0.5, rot: 0 });
    B.metal.geo(cyl(0.15, 0.16, 0.03, 10, hw - 0.3, 0, 2.3, L(0x3a3430))); B.metal.geo(cyl(0.015, 0.015, 1.45, 6, hw - 0.3, 0, 2.3, L(0xa88a4a)));
    B.lamp.geo(setGlow(lathe([[0.24, 0], [0.13, 0.28], [0.125, 0.28], [0.235, 0]], 12, L(0xf2e6c8)), 1).translate(hw - 0.3, 1.38, 2.3));
    B.colR(hw - 0.3, 2.3, 0.2);
    for (const [x, z] of [[-1.5, -0.8], [1.5, -0.8], [0, 1.4]]) pendantG(B, x, z, H - 0.8, H, lib ? 0x2e4a3a : 0x24345e);
    plantG(B, hw - 0.4, -0.2, 1.3, r); B.colR(hw - 0.4, -0.2, 0.3);
  }
  const roomCache = {};
  function buildStoreRoom(kind) {
    const town = !STORE_KINDS.includes(kind), W = town ? 10 : 12, D = town ? 8 : 9, H = 3.2, o = ROOMS[kind];
    const B = roomB(kind, town);
    B.hw = W / 2; B.hd = D / 2;
    roomShell(B, W, D, H, o);
    FURNISH[kind](B, W / 2, D / 2, H, B.r);
    return roomAssemble(B, W, D, H, o);
  }
  /* userData = { w, d, wallH, name, kind, spawn, exit, light, colliders, clerk, shoppers, treats, doors, door } */
  function storeInterior(kind = 'general') {
    if (!FURNISH[kind]) kind = 'general';
    if (!roomCache[kind]) roomCache[kind] = buildStoreRoom(kind);
    const src = roomCache[kind], g = src.clone();
    g.userData = JSON.parse(JSON.stringify(src.userData));
    g.userData.door = g.getObjectByName('door');
    return resolveDoors(g);
  }

  /* ============================================================
     Registration and exports
     ============================================================ */
  const APTS = [apt0, apt1, apt2, apt3, apt4, apt5], OFFICES = [off0, off1, off2, off3];
  Object.assign(K.PROPS, { apartment: (v) => APTS[v](), office: (v) => OFFICES[v](), midrise: (v) => midrise(v), storefront: (v) => storefront(v) });
  Object.assign(K.VARIANTS, { apartment: 6, office: 4, midrise: 4, storefront: STORE_KINDS.length });
  /* sizes for layout code: lot, footprint w x d (the body is exactly that, centered, front +z), h (the top of the
     highest thing on the roof), floors, and for the midrise the storefront bay (where a 'storefront' prop goes) */
  const LOTS = {
    apartment: [['quarter', 15, 15, 32.3, 8, 'red brick, fire escape, water tank'], ['quarter', 15, 15, 46.3, 12, 'limestone, penthouse terrace'], ['quarter', 15, 15, 35.5, 10, 'stucco, glass balconies, roof garden'],
      ['wide', 31, 15, 56.6, 16, 'buff brick slab, balconies'], ['deep', 15, 31, 25.0, 6, 'painted brick tenement, fire escape on the front'], ['wide', 31, 15, 38.1, 10, 'red brick on a stone base, quoins']],
    office: [['quarter', 15, 15, 62.8, 14, 'stone grid'], ['wide', 31, 15, 75.0, 18, 'glass curtain wall'], ['deep', 15, 31, 51.0, 11, 'granite ribbon windows'], ['full', 31, 31, 114.4, 26, 'podium, two glass setbacks, spire']],
    midrise: [['quarter', 15, 15, 17.0, 4, 'red brick, fire escape'], ['quarter', 15, 15, 13.8, 3, 'painted brick, flower boxes'], ['quarter', 15, 15, 23.2, 5, 'buff brick, fire escape, water tank'], ['quarter', 15, 15, 17.0, 4, 'brownstone']],
  };
  const cityPieces = {};
  for (const type in LOTS) cityPieces[type] = LOTS[type].map(([lot, w, d, h, floors, look], v) => Object.assign({ variant: v, lot, w, d, h, floors, look }, type === 'midrise' ? { bay: Object.assign({}, MID_BAY) } : {}));
  cityPieces.storefront = STORE_KINDS.map((kind, v) => ({ variant: v, kind, w: 13, d: 0.6, h: 4.5, door: { x: 0, z: 1.8 }, awning: 1.95 }));
  Object.assign(Env, { cityPieces, STORE_KINDS: STORE_KINDS.slice(), SHOP_KINDS: SHOP_KINDS.slice(), shop, storeInterior });
})();
