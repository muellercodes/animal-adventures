/* ============================================================
   Savanna kit (round 11): props for the Savanna world, and bamboo for the pandas
     acacia (3)    an umbrella thorn tree: a short trunk that splits into a few slanting limbs and a wide, flat crown
                   of fine olive leaves (it keeps its leaves in the fall); leopards climb it
     termite (2)   a termite mound of red earth, a lumpy tower with a spire or two
     bamboo (2)    a clump of tall bamboo canes with narrow leaves in sprays at the top           spot bamboo
     datepalm (2)  a date palm with long feathery fronds and strands of orange dates under them   spot dates
   ============================================================ */
(() => {
  const K = Env._k;
  const { TAU, V3, clamp, lerp, smooth, rng, fbm, L, mixc, mulc, prep, paint, merge, tube, path, mat, canvasTex, gray, PROPS, VARIANTS,
    crown, leafPart, trunkPts, branch, barkColor, flareRad, climbInfo, TX } = K;

  // fine acacia foliage: many tiny leaflets in feathery sprays (a leaf card texture, gray, colored by the crown)
  const acaciaTex = () => canvasTex('acaciaLeaf', 128, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    c.lineCap = 'round';
    for (let i = 0; i < 16; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 36, x0 = w / 2 + Math.cos(a) * d, y0 = h / 2 + Math.sin(a) * d, ang = r() * TAU, len = 18 + r() * 14;
      const v = 0.6 + r() * 0.35;
      for (let k = 0; k <= 10; k++) {
        const t = k / 10, x = x0 + Math.cos(ang) * len * t, y = y0 + Math.sin(ang) * len * t;
        for (const sd of [-1, 1]) {
          c.fillStyle = gray(v * (0.85 + r() * 0.2));
          c.beginPath(); c.ellipse(x + Math.cos(ang + sd * 1.4) * 3.2, y + Math.sin(ang + sd * 1.4) * 3.2, 2.6, 1.1, ang + sd * 1.4, 0, TAU); c.fill();
        }
      }
      c.strokeStyle = gray(v * 0.55); c.lineWidth = 0.8; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x0 + Math.cos(ang) * len, y0 + Math.sin(ang) * len); c.stroke();
    }
    c.beginPath(); c.arc(w / 2, h / 2, 9, 0, TAU); c.fillStyle = gray(0.6); c.fill();
  }, { clamp: true });
  // bamboo foliage: long narrow pointed leaves fanning out from short twigs
  const bambooTex = () => canvasTex('bambooLeaf', 128, 128, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 26, x = w / 2 + Math.cos(a) * d, y = h / 2 + Math.sin(a) * d, ang = r() * TAU, len = 26 + r() * 18, wid = 3 + r() * 1.5;
      const v = 0.62 + r() * 0.33;
      c.save(); c.translate(x, y); c.rotate(ang);
      c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.35, -wid, len, 0); c.quadraticCurveTo(len * 0.35, wid, 0, 0);
      const g = c.createLinearGradient(0, -wid, 0, wid); g.addColorStop(0, gray(v * 0.8)); g.addColorStop(0.5, gray(v)); g.addColorStop(1, gray(v * 0.7));
      c.fillStyle = g; c.fill();
      c.strokeStyle = gray(v * 0.6, 0.7); c.lineWidth = 0.7; c.beginPath(); c.moveTo(1, 0); c.lineTo(len * 0.92, 0); c.stroke();
      c.restore();
    }
    c.beginPath(); c.arc(w / 2, h / 2, 8, 0, TAU); c.fillStyle = gray(0.6); c.fill();
  }, { clamp: true });

  function makeAcacia(v) {
    const r = rng(11000 + v * 61), h = 5.6 + v * 0.7;
    const trunkH = 1.5 + r() * 0.6;
    const tp = trunkPts(r, trunkH, 0.15, 0.3, 5);
    const barkC = barkColor(L(0x5e5448), L(0x3a332c), L(0x857a6c), 7);
    const wood = [tube(tp, flareRad(0.26, 0.2, 0.45), { radial: 8, vLen: 1.2, uRep: 2, color: barkC })];
    const top = tp[tp.length - 1], clumps = [];
    const crownY = h - 0.7, spread = 3.6 + v * 0.5;
    // the limbs slant out and up to the flat crown, each splitting once near the top
    const nb = 3 + (v % 2);
    for (let i = 0; i < nb; i++) {
      const a = (i / nb) * TAU + r() * 0.7, out = spread * (0.55 + r() * 0.3);
      const end = new V3(top.x + Math.cos(a) * out, crownY - 0.5 - r() * 0.4, top.z + Math.sin(a) * out);
      const dir = end.clone().sub(top);
      const b = branch(top.clone(), dir, dir.length(), 0.17, 0.08, r, 4, 6, 0);
      wood.push(b.geo);
      const e = b.pts[b.pts.length - 1];
      for (const da of [-0.5, 0.5]) {
        const f = branch(e.clone(), new V3(Math.cos(a + da), 0.55, Math.sin(a + da)), 1.4 + r() * 0.6, 0.07, 0.03, r, 3, 5);
        wood.push(f.geo);
        const fe = f.pts[f.pts.length - 1];
        clumps.push({ x: fe.x, y: crownY + (r() - 0.5) * 0.3, z: fe.z, r: 1.5 + r() * 0.4, sx: 1.5, sy: 0.38, sz: 1.5, amp: 0.25, fq: 1.4, off: r() * 50, detail: 1 });
      }
    }
    // the flat top: a layer of wide, thin clumps over the middle
    for (let i = 0; i < 5; i++) {
      const a = r() * TAU, d = r() * spread * 0.5;
      clumps.push({ x: top.x + Math.cos(a) * d, y: crownY + 0.15, z: top.z + Math.sin(a) * d, r: 1.8 + r() * 0.4, sx: 1.6, sy: 0.32, sz: 1.6, amp: 0.2, fq: 1.2, off: r() * 50, detail: 1 });
    }
    const leaves = crown(clumps, { center: new V3(top.x, crownY, top.z), radii: { x: spread + 1, y: 0.8, z: spread + 1 }, dark: L(0x26341a), mid: L(0x4d5e2a), light: L(0x8c9748),
      seed: 70 + v, bend: 0.75, cards: { count: 330, size: 0.95 } });
    return {
      parts: [
        { geometry: merge(wood), material: mat('bark', { map: TX.bark() }), castShadow: true },
        leafPart(leaves, 'leafAcacia', acaciaTex(), 0.01, 0.02),
      ],
      radius: 0.3,
      ...climbInfo(tp, top.y - 0.1, 0.2),
    };
  }

  function makeTermite(v) {
    const r = rng(11100 + v * 7), H = 1.8 + v * 0.9, R = 0.75 + v * 0.15;
    const parts = [];
    // a lumpy tower: a lathe profile, pushed in and out by noise, with vertical runnels
    const prof = [];
    for (let i = 0; i <= 14; i++) { const t = i / 14; prof.push(new THREE.Vector2(Math.max(0.02, R * (1 - Math.pow(t, 0.75)) * (1 + 0.25 * Math.pow(1 - t, 3))), t * H)); }
    const body = prep(new THREE.LatheGeometry(prof, 20));
    const p = body.attributes.position.array;
    for (let i = 0; i < p.length; i += 3) {
      const x = p[i], y = p[i + 1], z = p[i + 2], a = Math.atan2(z, x), rr = Math.hypot(x, z);
      const k = 1 + 0.22 * fbm(Math.cos(a) * 1.6 + v * 5, y * 1.2, Math.sin(a) * 1.6, 3) + 0.06 * Math.sin(a * 9 + y * 2);
      p[i] = Math.cos(a) * rr * k; p[i + 2] = Math.sin(a) * rr * k;
    }
    body.computeVertexNormals();
    parts.push(body);
    // spires: thinner lumpy columns leaning off the main tower
    for (let s = 0; s < 1 + v; s++) {
      const a = r() * TAU, h2 = H * (0.5 + r() * 0.3), b0 = new V3(Math.cos(a) * R * 0.35, 0, Math.sin(a) * R * 0.35);
      const pts = [b0, b0.clone().add(new V3(Math.cos(a) * 0.15, h2 * 0.5, Math.sin(a) * 0.15)), b0.clone().add(new V3(Math.cos(a) * 0.3, h2, Math.sin(a) * 0.3))];
      parts.push(tube(path(pts, 6), (i, t) => R * 0.35 * (1 - t * 0.85) * (1 + 0.15 * Math.sin(t * 17 + s)), { radial: 9, cap: 'end' }));
    }
    const g = merge(parts.map((q) => prep(q)));
    paint(g, (x, y, z) => {
      const n = fbm(x * 3, y * 4, z * 3, 3);
      let c = mixc(L(0x8a4a2a), L(0xb46e44), 0.5 + 0.5 * n);
      c = mixc(c, L(0x6a3a22), smooth(0.2, 0.6, Math.abs(Math.sin(Math.atan2(z, x) * 7 + n * 3))) * 0.3);
      return mixc(c, L(0x5a3a26), smooth(0.25, 0.0, y) * 0.5);
    });
    return { parts: [{ geometry: g, material: mat('termiteMound', { std: true, roughness: 0.95 }), castShadow: true }], radius: R * 0.9, sink: 0.08 };
  }

  function makeBamboo(v) {
    const r = rng(11200 + v * 13), parts = [], clumps = [];
    const n = 14 + v * 5;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.9, x = Math.cos(a) * d, z = Math.sin(a) * d;
      const h = 4.5 + r() * 2.5, lean = 0.4 + r() * 0.8, la = a + (r() - 0.5) * 0.6, rad = 0.035 + r() * 0.02;
      const pts = [];
      for (let k = 0; k <= 8; k++) { const t = k / 8; pts.push(new V3(x + Math.cos(la) * lean * t * t, h * t, z + Math.sin(la) * lean * t * t)); }
      const nodes = Math.round(h / 0.32);
      parts.push(tube(pts, (k, t) => rad * (1 - t * 0.35), {
        radial: 6, cap: 'end',
        color: (t) => { const u = (t * nodes) % 1; return mixc(mixc(L(0x4f7a24), L(0x7a9a36), t * 0.7), L(0xb8b26a), smooth(0.9, 1.0, u) * 0.75); },
      }));
      // leaf sprays along the top third
      for (let k = 0; k < 3; k++) {
        const t = 0.62 + k * 0.14, p = pts[Math.round(t * 8)];
        clumps.push({ x: p.x + Math.cos(la) * 0.3, y: p.y, z: p.z + Math.sin(la) * 0.3, r: 0.7 + r() * 0.3, sx: 1.0, sy: 1.25, sz: 1.0, amp: 0.3, fq: 1.6, off: r() * 50, detail: 0 });
      }
    }
    const leaves = crown(clumps, { center: new V3(0, 5, 0), radii: { x: 2.2, y: 2.2, z: 2.2 }, dark: L(0x24401a), mid: L(0x47702a), light: L(0x86aa48), seed: 90 + v, cards: { count: 260 + v * 80, size: 0.85 } });
    return {
      parts: [
        { geometry: merge(parts.map((q) => prep(q))), material: mat('bambooCane', { std: true, roughness: 0.5 }), castShadow: true },
        leafPart(leaves, 'leafBamboo', bambooTex(), 0.02, 0.03),
      ],
      radius: 0.8, spot: { type: 'bamboo', r: 1.8 },
    };
  }

  function makeDatepalm(v) {
    const base = PROPS.palm(v), r = rng(11300 + v);
    // strands of dates hang in bunches below the fronds, on orange stalks
    const top = new V3(0, 0, 0);
    { const pa = base.parts[0].geometry.attributes.position.array; let my = -1; for (let i = 0; i < pa.length; i += 3) if (pa[i + 1] > my) { my = pa[i + 1]; top.set(pa[i], pa[i + 1], pa[i + 2]); } }
    const extra = [];
    for (let b = 0; b < 4; b++) {
      const a = (b / 4) * TAU + r() * 0.5, s0 = new V3(top.x + Math.cos(a) * 0.25, top.y - 0.35, top.z + Math.sin(a) * 0.25);
      for (let k = 0; k < 9; k++) {
        const aa = a + (r() - 0.5) * 0.9, len = 0.6 + r() * 0.4;
        const pts = [s0, s0.clone().add(new V3(Math.cos(aa) * 0.25, -len * 0.4, Math.sin(aa) * 0.25)), s0.clone().add(new V3(Math.cos(aa) * 0.35, -len, Math.sin(aa) * 0.35))];
        extra.push(tube(path(pts, 4), 0.012, { radial: 4, color: () => L(0xd08a2a) }));
        for (let q = 0; q < 4; q++) {
          const p = pts[2].clone().lerp(pts[1], q * 0.22), g = prep(new THREE.IcosahedronGeometry(0.03, 0));
          g.scale(0.8, 1.4, 0.8); g.translate(p.x + (r() - 0.5) * 0.05, p.y - 0.03, p.z + (r() - 0.5) * 0.05);
          extra.push(paint(g, mixc(L(0xc0601a), L(0x6a2a10), r())));
        }
      }
    }
    return Object.assign({}, base, {
      parts: [{ ...base.parts[0], geometry: merge([base.parts[0].geometry, ...extra.map((q) => prep(q))]) }, ...base.parts.slice(1)],
      spot: { type: 'dates', r: 2.2 },
    });
  }

  Object.assign(PROPS, { acacia: makeAcacia, termite: makeTermite, bamboo: makeBamboo, datepalm: makeDatepalm });
  Object.assign(VARIANTS, { acacia: 3, termite: 2, bamboo: 2, datepalm: 2 });
})();
