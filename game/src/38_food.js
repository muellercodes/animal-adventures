/* ---------- food kit: more foods, and the plants and things they come from ----------
   Adds to Env. Uses the scenery kit from 35_envkit through Env._k. Units are meters, Y up, base at y = 0.
   Foods for Env.food(type), registered with Env.addFood. Each is a group named 'food-<type>' sitting on the ground at its
   origin, about life size. They share one material and one 256 px canvas atlas (the hay has its own 128 px loose hay
   texture). The hook in 35_envkit is Env.addFood(type, make, { setup, update }):
     seeds       a broken piece of a sunflower head, loose striped seeds and a few hulled ones
     corn        an ear of corn, half husked (husk leaves peeled back, silk at the tip)
     lettuce     a head of green leaf lettuce
     mushroom    three brown cremini mushrooms (one tipped over, showing its gills)
     bugs        two crickets and a beetle: they shuffle about in spurts, twitch their legs and wave their antennae, and
                 the crickets hop now and then (animated through Env.foodUpdate)
     twigs       a leafy twig to browse
     watermelon  a half moon slice
     banana      three ripe bananas on their crown
     bread       a slice of white bread with a corner torn off, the torn piece and crumbs
     hotdog      a hot dog in a bun with mustard
     petfood     a red plastic pet bowl of kibble, a few pieces spilled
     hay         a small loose pile of hay
   Props for Env.prop(type, variant), instanced like the kit's plants, base at y = 0. Each has spot: { type, r }: the food
   that appears around it and how far out (meters at scale 1), radius or colliders [{ x, z, r }], and sink: how deep to
   set it in the ground (the ones with seed, leaves or vines lying on the ground want little or none):
     sunflower (2)  a patch of tall nodding sunflowers                 spot seeds
     birdfeeder     a wooden hopper feeder on a post, seed spilled      spot seeds
     cornrow        a short hilled row of ripe corn plants with ears   spot corn
     lettucebed     a raised garden bed of lettuce heads in rows        spot lettuce, slots [{ x, y, z }]: each head
     mushrooms      a mossy forest floor cluster of brown mushrooms     spot mushroom
     melonpatch     watermelon vines, leaves and three melons           spot watermelon
     bananaplant    a banana plant with a hanging bunch                 spot banana
   Foliage sways like the kit's plants. Sunflower, corn and melon leaves take autumn colors (the corn dries to tan). */
(() => {
  const K = Env._k;
  const { TAU, V3, clamp, lerp, smooth, rng, fbm, L, mixc, mulc, prep, paint, merge, smoothNormals, boxUV, soup, path, tube,
    canvasTex, gray, mat, TX, PROPS, VARIANTS, boxG, rrect } = K;
  const PI = Math.PI, DS = THREE.DoubleSide;

  /* ============================================================
     The atlas: one 256 px canvas (sRGB colors) in 64 px cells
       seed face (2 x 2 cells) | white      | seed mix
                               | gills      | (spare)
       kernels (1 x 2) | crumb | leaf veins | crust
                       | kibble| melon rind | leaf litter
     Plain parts use the white cell, so one material covers a whole food.
     ============================================================ */
  const AT = 256, CS = 64;
  const cellUV = (cx, cy, cw = 1, ch = 1, ins = 1.5) => [(cx * CS + ins) / AT, 1 - ((cy + ch) * CS - ins) / AT, ((cx + cw) * CS - ins) / AT, 1 - (cy * CS + ins) / AT];
  const UV = {
    seed: cellUV(0, 0, 2, 2), white: cellUV(2, 0), mix: cellUV(3, 0), gills: cellUV(2, 1),
    kernel: cellUV(0, 2, 1, 2), crumb: cellUV(1, 2), vein: cellUV(2, 2), crust: cellUV(3, 2), kibble: cellUV(1, 3), rind: cellUV(2, 3), litter: cellUV(3, 3),
  };
  const WU = [(UV.white[0] + UV.white[2]) / 2, (UV.white[1] + UV.white[3]) / 2];
  // a point (u, v in 0..1) inside a cell
  const cu = (cell, u, v) => [lerp(cell[0], cell[2], clamp(u, 0, 1)), lerp(cell[1], cell[3], clamp(v, 0, 1))];
  const rgb = (hex, k = 1, a = 1) => `rgba(${Math.round(clamp(((hex >> 16) & 255) * k, 0, 255))},${Math.round(clamp(((hex >> 8) & 255) * k, 0, 255))},${Math.round(clamp((hex & 255) * k, 0, 255))},${a})`;
  function leafPath(c, x, y, len, wid, a) {
    c.save(); c.translate(x, y); c.rotate(a);
    c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(len * 0.45, -wid, len, 0); c.quadraticCurveTo(len * 0.45, wid, 0, 0);
    c.restore();
  }
  function drawAtlas(c, w, h, r) {
    const cell = (cx, cy, cw, ch, fn) => { c.save(); c.beginPath(); c.rect(cx * CS, cy * CS, cw * CS, ch * CS); c.clip(); c.translate(cx * CS, cy * CS); fn(cw * CS, ch * CS); c.restore(); };
    // white: parts colored by their vertex colors only
    cell(2, 0, 1, 1, (W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); });
    // sunflower seed face: florets in the golden angle spiral; green buds in the middle, ripe seeds (seen end on, some
    // striped), pollen yellow florets in bloom at the rim
    cell(0, 0, 2, 2, (W, H) => {
      c.fillStyle = '#2c1e12'; c.fillRect(0, 0, W, H);
      const cx = W / 2, cy = H / 2, R = W / 2 - 1, N = 820, GA = PI * (3 - Math.sqrt(5));
      for (let i = N; i >= 1; i--) {
        const t = Math.sqrt(i / N), rr = R * t, a = i * GA, x = cx + Math.cos(a) * rr, y = cy + Math.sin(a) * rr, s = 1.5 + t * 1.3;
        c.save(); c.translate(x, y); c.rotate(a);
        if (t < 0.2) {
          c.fillStyle = rgb(0x5a5428, 0.8 + r() * 0.4); c.beginPath(); c.arc(0, 0, s * 0.95, 0, TAU); c.fill();
          c.fillStyle = rgb(0x8a8a3c, 1, 0.55); c.beginPath(); c.arc(-0.4, -0.4, s * 0.4, 0, TAU); c.fill();
        } else if (t < 0.86) {
          const k = r();
          c.fillStyle = k < 0.28 ? rgb(0x6a645a, 0.85 + r() * 0.3) : rgb(0x1e1a16, 0.8 + r() * 0.6);
          c.beginPath(); c.ellipse(0, 0, s * 1.05, s * 0.75, 0, 0, TAU); c.fill();
          c.strokeStyle = 'rgba(205,195,175,0.5)'; c.lineWidth = 0.6; c.stroke();
          if (k < 0.28) { c.fillStyle = '#16130f'; c.fillRect(-s, -0.35, s * 2, 0.7); }
        } else {
          c.fillStyle = rgb(0xc08a1c, 0.75 + r() * 0.4); c.beginPath(); c.ellipse(0, 0, s * 1.1, s * 0.7, 0, 0, TAU); c.fill();
          c.fillStyle = 'rgba(255,214,110,0.6)'; c.beginPath(); c.arc(s * 0.3, 0, s * 0.35, 0, TAU); c.fill();
        }
        c.restore();
      }
      const g = c.createRadialGradient(cx, cy, 0, cx, cy, R);
      g.addColorStop(0, 'rgba(0,0,0,0.22)'); g.addColorStop(0.45, 'rgba(0,0,0,0)'); g.addColorStop(0.93, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.3)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
    // bird seed mix: black oil sunflower, striped sunflower, millet, red milo, cracked corn
    cell(3, 0, 1, 1, (W, H) => {
      c.fillStyle = '#3a2c1c'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 300; i++) {
        const k = r();
        c.save(); c.translate(r() * W, r() * H); c.rotate(r() * TAU);
        if (k < 0.34) { c.fillStyle = rgb(0x1c1a16, 0.8 + r() * 0.6); c.beginPath(); c.ellipse(0, 0, 3.2, 1.8, 0, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,255,255,0.18)'; c.fillRect(-1.5, -0.8, 2.5, 0.6); }
        else if (k < 0.48) { c.fillStyle = rgb(0x8a857c, 0.9 + r() * 0.2); c.beginPath(); c.ellipse(0, 0, 3.6, 2, 0, 0, TAU); c.fill(); c.fillStyle = '#24211d'; c.fillRect(-3.2, -0.9, 6.4, 0.6); c.fillRect(-3.2, 0.4, 6.4, 0.6); }
        else if (k < 0.74) { c.fillStyle = rgb(0xe6d49c, 0.85 + r() * 0.2); c.beginPath(); c.arc(0, 0, 1.3, 0, TAU); c.fill(); }
        else if (k < 0.87) { c.fillStyle = rgb(0x9a4a2a, 0.85 + r() * 0.3); c.beginPath(); c.arc(0, 0, 1.5, 0, TAU); c.fill(); }
        else { c.fillStyle = rgb(0xe8b030, 0.85 + r() * 0.2); c.beginPath(); c.moveTo(-2, -1.2); c.lineTo(2, -1.6); c.lineTo(1.4, 1.6); c.lineTo(-1.8, 1); c.fill(); }
        c.restore();
      }
    });
    // mushroom gills seen from below: fine radial blades around the stem
    cell(2, 1, 1, 1, (W, H) => {
      const cx = W / 2, cy = H / 2;
      c.fillStyle = '#b89a7a'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 128; i++) {
        const a = (i / 128) * TAU, r0 = i % 4 === 0 ? 6 : i % 2 === 0 ? 12 : 20;
        c.strokeStyle = i % 2 ? 'rgba(120,88,62,0.85)' : 'rgba(226,206,180,0.85)'; c.lineWidth = 0.9;
        c.beginPath(); c.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); c.lineTo(cx + Math.cos(a) * 33, cy + Math.sin(a) * 33); c.stroke();
      }
      const g = c.createRadialGradient(cx, cy, 4, cx, cy, 32);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(0.75, 'rgba(0,0,0,0.05)'); g.addColorStop(1, 'rgba(40,20,10,0.35)');
      c.fillStyle = g; c.fillRect(0, 0, W, H);
    });
    // (spare cell, plain white for now)
    cell(3, 1, 1, 1, (W, H) => { c.fillStyle = '#ffffff'; c.fillRect(0, 0, W, H); });
    // corn kernels: straight rows along the ear (v), 8 rows across the cell (the ear wraps it twice)
    cell(0, 2, 1, 2, (W, H) => {
      c.fillStyle = '#8a6418'; c.fillRect(0, 0, W, H);
      const cols = 8, rows = 18, kw = W / cols, kh = H / rows;
      for (let i = 0; i < cols; i++) for (let j = -1; j <= rows; j++) {
        const x = i * kw + kw / 2, y = j * kh + kh / 2 + (i % 2) * kh * 0.3, v = 0.9 + r() * 0.15;
        const g = c.createRadialGradient(x - kw * 0.15, y - kh * 0.2, 0.4, x, y, kw * 0.62);
        g.addColorStop(0, rgb(0xfff2a8, v)); g.addColorStop(0.45, rgb(0xf6ca4c, v)); g.addColorStop(1, rgb(0xd4942a, v));
        c.fillStyle = g; rrect(c, x - kw * 0.45, y - kh * 0.44, kw * 0.9, kh * 0.88, 2.2); c.fill();
      }
    });
    // bread crumb: cream with small air holes
    cell(1, 2, 1, 1, (W, H) => {
      c.fillStyle = '#f4e8cc'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 900; i++) { c.fillStyle = r() < 0.5 ? 'rgba(196,172,132,0.35)' : 'rgba(255,252,240,0.5)'; c.fillRect(r() * W, r() * H, 1, 1); }
      for (let i = 0; i < 80; i++) {
        const x = r() * W, y = r() * H, rx = 0.7 + r() * 2.0, ry = rx * (0.5 + r() * 0.5), a = r() * PI;
        c.fillStyle = 'rgba(176,146,104,0.55)'; c.beginPath(); c.ellipse(x, y, rx, ry, a, 0, TAU); c.fill();
        c.fillStyle = 'rgba(255,255,248,0.55)'; c.beginPath(); c.ellipse(x, y + ry * 0.6, rx * 0.8, ry * 0.4, a, 0, TAU); c.fill();
      }
    });
    // leaf veins (a near white detail map for vertex colored leaves): midrib up the middle, side veins toward the tip
    cell(2, 2, 1, 1, (W, H) => {
      c.fillStyle = gray(0.9); c.fillRect(0, 0, W, H);
      for (let i = 0; i < 500; i++) { c.fillStyle = gray(0.82 + r() * 0.12, 0.6); c.fillRect(r() * W, r() * H, 1, 1); }
      c.lineWidth = 1;
      for (let k = 0; k < 8; k++) {
        const y0 = H - (k + 0.6) * H / 8;
        for (const s of [-1, 1]) { c.strokeStyle = gray(0.98, 0.9); c.beginPath(); c.moveTo(W / 2, y0); c.quadraticCurveTo(W / 2 + s * W * 0.24, y0 - 5, W / 2 + s * W * 0.5, y0 - 13); c.stroke(); }
      }
      c.fillStyle = gray(0.96); c.fillRect(W / 2 - 2, 0, 4, H);
      c.fillStyle = gray(1); c.fillRect(W / 2 - 1, 0, 2, H);
    });
    // bread crust detail: speckles, hairline cracks, a little flour
    cell(3, 2, 1, 1, (W, H) => {
      c.fillStyle = gray(0.92); c.fillRect(0, 0, W, H);
      for (let i = 0; i < 700; i++) { c.fillStyle = gray(0.72 + r() * 0.3, 0.5); c.fillRect(r() * W, r() * H, 1 + r(), 1); }
      c.lineWidth = 0.6;
      for (let i = 0; i < 22; i++) { let x = r() * W, y = r() * H; c.strokeStyle = gray(0.6, 0.6); c.beginPath(); c.moveTo(x, y); for (let k = 0; k < 3; k++) { x += (r() - 0.5) * 9; y += (r() - 0.5) * 9; c.lineTo(x, y); } c.stroke(); }
      for (let i = 0; i < 40; i++) { c.fillStyle = gray(1, 0.7); c.fillRect(r() * W, r() * H, 1, 1); }
    });
    // kibble: packed brown pieces, round and triangular
    cell(1, 3, 1, 1, (W, H) => {
      c.fillStyle = '#2a1a0e'; c.fillRect(0, 0, W, H);
      const pal = [0x8a5a2c, 0xa0682e, 0x6e4422, 0xb07a3a, 0x7a3a22];
      for (let i = 0; i < 90; i++) {
        const x = r() * W, y = r() * H, s = 3 + r() * 2.5, base = pal[Math.floor(r() * pal.length)];
        const g = c.createRadialGradient(x - s * 0.3, y - s * 0.3, 0.3, x, y, s);
        g.addColorStop(0, rgb(base, 1.35)); g.addColorStop(0.6, rgb(base, 1)); g.addColorStop(1, rgb(base, 0.55));
        c.fillStyle = g; c.beginPath();
        if (r() < 0.6) c.arc(x, y, s, 0, TAU);
        else { const a = r() * TAU; for (let k = 0; k < 3; k++) c.lineTo(x + Math.cos(a + k * TAU / 3) * s * 1.2, y + Math.sin(a + k * TAU / 3) * s * 1.2); c.closePath(); }
        c.fill();
      }
    });
    // watermelon rind: light green with wavy dark green stripes running pole to pole (v)
    cell(2, 3, 1, 1, (W, H) => {
      c.fillStyle = '#9cc064'; c.fillRect(0, 0, W, H);
      for (let i = 0; i < 400; i++) { c.fillStyle = r() < 0.5 ? 'rgba(70,110,40,0.25)' : 'rgba(200,226,150,0.3)'; c.fillRect(r() * W, r() * H, 1 + r() * 2, 1 + r() * 3); }
      const n = 10;
      for (let k = 0; k < n; k++) {
        const x0 = (k + 0.5) * W / n;
        for (let y = -2; y < H + 2; y += 1.5) {
          const hw = 1.5 + 0.8 * Math.sin(y * 0.35 + k * 1.7) + r() * 0.5, x = x0 + 1.1 * Math.sin(y * 0.16 + k * 2.3);
          c.fillStyle = '#2c5420'; c.fillRect(x - hw, y, hw * 2, 1.8);
          if (r() < 0.12) c.fillRect(x + (r() < 0.5 ? -hw - 1.5 : hw), y, 1.5, 1);
        }
      }
    });
    // forest leaf litter
    cell(3, 3, 1, 1, (W, H) => {
      c.fillStyle = '#3a2a1a'; c.fillRect(0, 0, W, H);
      const pal = [0x7a5030, 0x9a6a3a, 0x5a3a20, 0xa8823a, 0x6a4a28, 0x8a5a2a];
      for (let i = 0; i < 46; i++) {
        const x = r() * W, y = r() * H, len = 7 + r() * 9, a = r() * TAU;
        leafPath(c, x, y, len, 2.5 + r() * 2.5, a); c.fillStyle = rgb(pal[Math.floor(r() * pal.length)], 0.8 + r() * 0.4); c.fill();
        c.strokeStyle = 'rgba(40,24,12,0.5)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * len * 0.9, y + Math.sin(a) * len * 0.9); c.stroke();
      }
      c.strokeStyle = 'rgba(50,34,20,0.9)'; c.lineWidth = 1.2;
      for (let i = 0; i < 4; i++) { const x = r() * W, y = r() * H, a = r() * TAU; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * 20, y + Math.sin(a) * 20); c.stroke(); }
    });
  }
  const ATL = () => canvasTex('f38atlas', AT, AT, drawAtlas, { srgb: true, clamp: true });

  // loose hay: a tangle of stalks in every direction over dark gaps (tiles, sRGB colors)
  const HAYTX = () => canvasTex('f38hay', 128, 128, (c, w, h, r) => {
    c.fillStyle = '#4e4628'; c.fillRect(0, 0, w, h);
    const pal = [0xcab468, 0xb09a52, 0xd8c47a, 0x9a9450, 0xbca45a, 0x8c8446, 0xe2d08c];
    c.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const x = r() * w, y = r() * h, a = r() * TAU, l = 8 + r() * 26, col = pal[Math.floor(r() * pal.length)], lw = 0.8 + r() * 1.3;
      K.wrapDraw(w, h, x, y, 36, (X, Y) => {
        c.strokeStyle = 'rgba(40,32,16,0.5)'; c.lineWidth = lw + 0.8; c.beginPath(); c.moveTo(X, Y + 0.6); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l + 0.6); c.stroke();
        c.strokeStyle = rgb(col, 0.8 + r() * 0.35); c.lineWidth = lw; c.beginPath(); c.moveTo(X, Y); c.lineTo(X + Math.cos(a) * l, Y + Math.sin(a) * l); c.stroke();
      });
    }
    // one pale stalk in the bottom left corner: the single loose stalks sample it (uv 0.02, 0.016)
    c.fillStyle = '#f0e6c0'; c.fillRect(0, 124, 7, 4);
  }, { srgb: true });

  // forest moss: dense tiny shoots, darker hollows and yellow green tips (tiles, sRGB colors)
  const MOSSTX = () => canvasTex('f38moss', 128, 128, (c, w, h, r) => {
    c.fillStyle = '#3e5a20'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) {
      const x = r() * w, y = r() * h, rad = 6 + r() * 14, dark = r() < 0.5;
      K.wrapDraw(w, h, x, y, rad, (X, Y) => {
        const g = c.createRadialGradient(X, Y, 0, X, Y, rad);
        g.addColorStop(0, dark ? 'rgba(20,34,10,0.35)' : 'rgba(120,150,50,0.3)'); g.addColorStop(1, 'rgba(0,0,0,0)');
        c.fillStyle = g; c.fillRect(X - rad, Y - rad, rad * 2, rad * 2);
      });
    }
    c.lineWidth = 0.8;
    for (let i = 0; i < 1300; i++) {
      const x = r() * w, y = r() * h, k = r(), s = 1.2 + r() * 1.6;
      const col = k < 0.35 ? rgb(0x2a4214, 1, 0.8) : k < 0.85 ? rgb(0x5e8a2c, 0.8 + r() * 0.4, 0.85) : rgb(0xa4c04c, 1, 0.8);
      K.wrapDraw(w, h, x, y, 4, (X, Y) => {
        c.strokeStyle = col;
        for (let q = 0; q < 3; q++) { const a = q * PI / 3 + r() * 0.5; c.beginPath(); c.moveTo(X - Math.cos(a) * s, Y - Math.sin(a) * s); c.lineTo(X + Math.cos(a) * s, Y + Math.sin(a) * s); c.stroke(); }
      });
    }
  }, { srgb: true });

  /* ---------- materials ---------- */
  const FM = () => mat('f38food', { std: true, roughness: 0.6, side: DS, map: ATL() });
  const HAYM = () => mat('f38hay', { map: HAYTX() });
  const MOSSM = () => mat('f38moss', { map: MOSSTX() });
  const PM = () => mat('f38prop', { map: ATL(), side: DS });
  // swaying plants: parts of one plant share sway and flutter so they move together
  const plantM = (key, sway, flutter, fall) => mat('f38plant:' + key, { map: ATL(), side: DS, sway, flutter, fall });
  const FALL38 = {
    sun: { a: 0x6a5420, b: 0x8a6a2a, c: 0xa08a38, k: 0.85, br: 1.0 },
    corn: { a: 0xa48a50, b: 0xc4a866, c: 0x907a44, k: 1.0, br: 1.05 },
    melon: { a: 0xa09a3a, b: 0x8a6a2c, c: 0xb4a444, k: 0.45, br: 1.0 },
  };

  /* ---------- geometry helpers ---------- */
  // every uv of g in the plain white cell
  function plain(g) {
    g = prep(g);
    const a = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 2) { a[i] = WU[0]; a[i + 1] = WU[1]; }
    g.attributes.uv.needsUpdate = true;
    return g;
  }
  function ico(rad, d, x, y, z, sx, sy, sz, col) {
    const g = prep(new THREE.IcosahedronGeometry(rad, d));
    g.scale(sx, sy, sz); g.translate(x, y, z);
    return plain(paint(smoothNormals(g), col));
  }
  function upN(g, k) {
    const N = g.attributes.normal.array;
    for (let i = 0; i < N.length; i += 3) {
      const nx = N[i] * (1 - k), ny = Math.abs(N[i + 1]) * (1 - k) + k, nz = N[i + 2] * (1 - k), l = Math.hypot(nx, ny, nz) || 1;
      N[i] = nx / l; N[i + 1] = ny / l; N[i + 2] = nz / l;
    }
    g.attributes.normal.needsUpdate = true;
    return g;
  }
  // piecewise linear table
  const tab = (xs, ys) => (t) => {
    if (t <= xs[0]) return ys[0];
    for (let i = 1; i < xs.length; i++) if (t <= xs[i]) return lerp(ys[i - 1], ys[i], (t - xs[i - 1]) / (xs[i] - xs[i - 1]));
    return ys[ys.length - 1];
  };
  const posAt = (pts, t) => { const f = clamp(t, 0, 1) * (pts.length - 1), i = Math.min(pts.length - 2, Math.floor(f)); return new V3().lerpVectors(pts[i], pts[i + 1], f - i); };
  const nrm3 = (a, b, c) => new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
  // a triangle turned to face up (+y)
  function triUp(S, a, b, c, ca, cb, cc, ua = WU, ub = WU, uc = WU) {
    if (nrm3(a, b, c).y >= 0) S.tri(a, b, c, ca, cb, cc, ua, ub, uc); else S.tri(a, c, b, ca, cc, cb, ua, uc, ub);
  }
  // a quad turned to face away from the point ref
  function quadAway(S, a, b, c, d, ref, ca, cb, cc, cd, ua = WU, ub = WU, uc = WU, ud = WU) {
    const m = new V3().add(a).add(b).add(c).add(d).multiplyScalar(0.25).sub(ref);
    if (nrm3(a, b, c).dot(m) >= 0) S.quad(a, b, c, d, ca, cb, cc, cd, ua, ub, uc, ud);
    else S.quad(a, d, c, b, ca, cd, cc, cb, ua, ud, uc, ub);
  }
  /* lathe around y: pts [[r, y], ...] (going up faces out, going in at the top faces up); col(y, a, r, k) or [r, g, b];
     uvf(y, a, r, k) -> [u, v] in cell (else plain) */
  function lathe(pts, seg, col, uvf, cell) {
    const S = soup(), n = pts.length;
    const P = (k, j) => { const a = (j / seg) * TAU; return new V3(Math.cos(a) * pts[k][0], pts[k][1], Math.sin(a) * pts[k][0]); };
    const C = (k, j) => (typeof col === 'function' ? col(pts[k][1], (j / seg) * TAU, pts[k][0], k) : col);
    const U = (k, j) => (uvf ? cu(cell, ...uvf(pts[k][1], (j / seg) * TAU, pts[k][0], k)) : WU);
    for (let k = 0; k < n - 1; k++) for (let j = 0; j < seg; j++) {
      S.quad(P(k, j), P(k + 1, j), P(k + 1, j + 1), P(k, j + 1), C(k, j), C(k + 1, j), C(k + 1, j + 1), C(k, j + 1), U(k, j), U(k + 1, j), U(k + 1, j + 1), U(k, j + 1));
    }
    return S.geo(true);
  }
  // body of revolution along +z: stations [z, rx, ry above, ry below], y center cy; col(i, angle)
  function spindleZ(st, seg, cy, col) {
    const S = soup();
    const P = (i, j) => { const a = (j / seg) * TAU, s = st[i], sn = Math.sin(a); return new V3(Math.cos(a) * s[1], cy + sn * (sn > 0 ? s[2] : s[3]), s[0]); };
    for (let i = 0; i < st.length - 1; i++) for (let j = 0; j < seg; j++) {
      const a0 = (j / seg) * TAU, a1 = ((j + 1) / seg) * TAU;
      S.quad(P(i, j), P(i, j + 1), P(i + 1, j + 1), P(i + 1, j), col(i, a0), col(i, a1), col(i + 1, a1), col(i + 1, a0), WU, WU, WU, WU);
    }
    return S.geo(true);
  }
  // spine from base along the level direction d: starts at angle a0 above level and bends by bend radians to the tip
  function spine(base, d, len, a0, bend, n) {
    const dh = new V3(d.x, 0, d.z).normalize(), pts = [base.clone()];
    let p = base.clone();
    for (let i = 0; i < n; i++) {
      const a = a0 + bend * (i + 0.5) / n;
      p = p.clone().addScaledVector(dh, Math.cos(a) * len / n); p.y += Math.sin(a) * len / n;
      pts.push(p);
    }
    return pts;
  }
  /* a leaf blade on a spine. o: pts (base to tip), side (across the leaf, roughly level), w(t) half width, nu (segments
     across, even), cup (edge lift, a fraction of the half width; negative droops), ruf (edge wave, meters), rf (waves
     along), col(t, e) (e 0 at the midrib .. 1 at the edge), cell (u across, v along) */
  function leafGrid(S, o) {
    const pts = o.pts, n = pts.length, nu = o.nu || 2, cell = o.cell || UV.vein, side0 = o.side.clone().normalize(), rows = [];
    for (let i = 0; i < n; i++) {
      const T = new V3().subVectors(pts[Math.min(n - 1, i + 1)], pts[Math.max(0, i - 1)]).normalize();
      const sd = side0.clone().addScaledVector(T, -side0.dot(T)).normalize(), up = new V3().crossVectors(sd, T).normalize();
      const t = i / (n - 1), w = o.w(t), row = [];
      for (let k = 0; k <= nu; k++) {
        const e = (k / nu) * 2 - 1, ae = Math.abs(e);
        const p = pts[i].clone().addScaledVector(sd, e * w).addScaledVector(up, (o.cup || 0) * e * e * w);
        if (o.ruf) p.addScaledVector(up, o.ruf * Math.pow(ae, 1.5) * Math.sin(t * (o.rf || 3) * TAU + e * 2.1 + (o.ph || 0)) * smooth(0.1, 0.4, t));
        if (o.floor != null) p.y = Math.max(o.floor, p.y);
        row.push({ p, c: o.col(t, ae, e), uv: cu(cell, (e + 1) / 2, t) });
      }
      rows.push(row);
    }
    for (let i = 0; i < n - 1; i++) for (let k = 0; k < nu; k++) {
      const a = rows[i][k], b = rows[i + 1][k], c = rows[i + 1][k + 1], d = rows[i][k + 1];
      S.quad(a.p, d.p, c.p, b.p, a.c, d.c, c.c, b.c, a.uv, d.uv, c.uv, b.uv);
    }
  }
  // a thin flat strip along a polyline, facing roughly up; wid(t) or a number; col(t)
  function ribbon(S, pts, wid, col, up = new V3(0, 1, 0)) {
    const n = pts.length, W = (t) => (typeof wid === 'function' ? wid(t) : wid);
    for (let i = 0; i < n - 1; i++) {
      const d = new V3().subVectors(pts[i + 1], pts[i]).normalize(), s = new V3().crossVectors(d, up);
      if (s.lengthSq() < 1e-8) s.set(1, 0, 0);
      s.normalize();
      const t0 = i / (n - 1), t1 = (i + 1) / (n - 1), w0 = W(t0), w1 = W(t1);
      S.quad(pts[i].clone().addScaledVector(s, -w0), pts[i].clone().addScaledVector(s, w0), pts[i + 1].clone().addScaledVector(s, w1), pts[i + 1].clone().addScaledVector(s, -w1), col(t0), col(t0), col(t1), col(t1), WU, WU, WU, WU);
    }
  }
  const pipe = (pts, rad, col, radial = 3, cap) => plain(tube(pts, rad, { radial, cap, color: typeof col === 'function' ? col : () => col }));
  // move a merged geometry so it rests on y = 0
  function toGround(g) { g.computeBoundingBox(); g.translate(0, -g.boundingBox.min.y, 0); return g; }

  /* ============================================================
     Foods
     ============================================================ */
  /* ---------- seeds ---------- */
  // one sunflower seed lying flat along x: striped shell (pale edges, black sides, a grey stripe down each face) or a hulled kernel
  function seedGeo(len, wid, thick, hull) {
    const R = hull ? 6 : 8, S = soup(), st = [[0, 0], [0.14, 0.82], [0.5, 1], [1, 0]];
    const ring = (i) => {
      const out = [];
      for (let j = 0; j <= R; j++) { const a = (j / R) * TAU, k = st[i][1]; out.push(new V3(st[i][0] * len - len / 2, (Math.sin(a) * 0.5 * k + 0.5) * thick, Math.cos(a) * wid * 0.5 * k)); }
      return out;
    };
    const col = (j) => {
      const a = (j / R) * TAU, ca = Math.abs(Math.cos(a)), sa = Math.abs(Math.sin(a));
      if (hull) return mixc(L(0xdcd0b2), L(0xb4a282), sa * 0.4);
      return ca > 0.85 ? L(0xc4beb0) : sa > 0.9 ? L(0x8a857c) : L(0x1e1c1a);
    };
    for (let i = 0; i < st.length - 1; i++) {
      const A = ring(i), B = ring(i + 1);
      for (let j = 0; j < R; j++) {
        if (st[i][1] === 0) S.tri(A[j], B[j], B[j + 1], col(j), col(j), col(j + 1), WU, WU, WU);
        else if (st[i + 1][1] === 0) S.tri(A[j], B[j], A[j + 1], col(j), col(j), col(j + 1), WU, WU, WU);
        else S.quad(A[j], B[j], B[j + 1], A[j + 1], col(j), col(j), col(j + 1), col(j + 1), WU, WU, WU, WU);
      }
    }
    return S.geo(true);
  }
  // a broken wedge of a dried sunflower head lying face up: seed face, green back, pale pith at the breaks, bracts and
  // a few withered petals on the rim
  function sunPiece(r) {
    const S = soup(), R = 0.1, T = 0.017, A0 = -0.98, A1 = 0.98, n = 8, rings = [0, 0.42, 0.78, 1];
    const cutA = [0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.25, (r() - 0.5) * 0.2], cutB = [0, (r() - 0.5) * 0.2, (r() - 0.5) * 0.25, (r() - 0.5) * 0.2];
    const ang = (j, k) => lerp(A0, A1, j / n) + (j === 0 ? cutA[k] : j === n ? cutB[k] : 0);
    const top = (j, k) => { const a = ang(j, k), q = rings[k] * R; return new V3(Math.cos(a) * q, T + 0.005 * (1 - rings[k] * rings[k]), Math.sin(a) * q); };
    const bot = (j, k) => { const a = ang(j, k), q = rings[k] * R * (k === 3 ? 0.94 : 1); return new V3(Math.cos(a) * q, 0.002, Math.sin(a) * q); };
    const fuv = (j, k) => { const a = ang(j, k), q = rings[k] * 0.49; return cu(UV.seed, 0.5 + Math.cos(a) * q, 0.5 + Math.sin(a) * q); };
    const Wc = [1, 1, 1], back = L(0x5a5a2c), rim = L(0x4e5426), seedC = L(0x2e2418), pith = L(0xb4a684);
    for (let j = 0; j < n; j++) {
      S.tri(top(j, 0), top(j + 1, 1), top(j, 1), Wc, Wc, Wc, fuv(j, 0), fuv(j + 1, 1), fuv(j, 1));
      for (let k = 1; k < 3; k++) S.quad(top(j, k), top(j + 1, k), top(j + 1, k + 1), top(j, k + 1), Wc, Wc, Wc, Wc, fuv(j, k), fuv(j + 1, k), fuv(j + 1, k + 1), fuv(j, k + 1));
      S.quad(top(j, 3), top(j + 1, 3), bot(j + 1, 3), bot(j, 3), rim, rim, back, back, WU, WU, WU, WU);
      S.tri(bot(j, 0), bot(j, 3), bot(j + 1, 3), back, back, back, WU, WU, WU);
    }
    for (let k = 0; k < 3; k++) {
      S.quad(top(0, k), top(0, k + 1), bot(0, k + 1), bot(0, k), seedC, seedC, pith, pith, WU, WU, WU, WU);
      S.quad(top(n, k), bot(n, k), bot(n, k + 1), top(n, k + 1), seedC, pith, pith, seedC, WU, WU, WU, WU);
    }
    for (let j = 0; j < 9; j++) {
      const a = lerp(A0 + 0.1, A1 - 0.1, j / 8), rd = new V3(Math.cos(a), 0, Math.sin(a)), td = new V3(-Math.sin(a), 0, Math.cos(a));
      const b = rd.clone().multiplyScalar(R * 0.97); b.y = T * 0.45;
      const petal = j % 2 === 1, len = petal ? 0.03 + r() * 0.012 : 0.016 + r() * 0.006, w = petal ? 0.011 : 0.006;
      const tip = b.clone().addScaledVector(rd, len); tip.y = 0.004;
      const c0 = petal ? L(0xd8a224) : L(0x5a6a2a), c1 = petal ? L(0xa86a18) : L(0x3e4a1c);
      triUp(S, b.clone().addScaledVector(td, -w), b.clone().addScaledVector(td, w), tip, c0, c0, c1);
    }
    const g = S.geo(true);
    // centered, and propped up a little on its back edge so the seed face shows
    g.translate(-0.05, 0, 0); g.rotateZ(0.18); toGround(g);
    return g;
  }
  function foodSeeds() {
    const r = rng(3801), gs = [sunPiece(r)];
    const shell = seedGeo(0.016, 0.0085, 0.0045, false), hull = seedGeo(0.011, 0.0055, 0.0036, true);
    for (let i = 0; i < 14; i++) {
      let x = 0, z = 0;
      for (let k = 0; k < 20; k++) { const a = r() * TAU, d = 0.05 + r() * 0.08; x = Math.cos(a) * d + 0.02; z = Math.sin(a) * d; if (!(x > -0.06 && x < 0.06 && Math.abs(z) < 0.088)) break; }
      const g = (i >= 11 ? hull : shell).clone();
      g.rotateX((r() - 0.5) * 0.25); g.rotateY(r() * TAU); g.translate(x, 0, z);
      gs.push(g);
    }
    return [{ geo: merge(gs), mat: FM() }];
  }

  /* ---------- corn ---------- */
  function foodCorn() {
    const r = rng(3802), cob = soup(), husk = soup(), gs = [];
    const LEN = 0.19, R = 0.023, seg = 12, ts = [0, 0.06, 0.18, 0.34, 0.5, 0.66, 0.8, 0.9, 0.96, 1];
    const rad = (t) => R * (t < 0.12 ? 0.86 + (t / 0.12) * 0.14 : 1 - 0.45 * Math.pow((t - 0.12) / 0.88, 2.2)) * (t > 0.88 ? Math.sqrt(Math.max(0, 1 - Math.pow((t - 0.88) / 0.12, 2))) : 1);
    const P = (i, j) => { const t = ts[i], a = (j / seg) * TAU, rr = rad(t) * (1 + 0.025 * Math.sin(a * 6 + t * 9)); return new V3(t * LEN, R + Math.sin(a) * rr, Math.cos(a) * rr); };
    // kernels: the cell wraps twice around the cob, per quad so there is no seam
    const kuv = (j, i, du) => cu(UV.kernel, ((j % 6) + du) / 6, ts[i]);
    const tipC = (i) => (ts[i] > 0.9 ? L(0xf0e6c0) : [1, 1, 1]);
    for (let i = 0; i < ts.length - 1; i++) for (let j = 0; j < seg; j++) {
      cob.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), tipC(i), tipC(i + 1), tipC(i + 1), tipC(i), kuv(j, i, 0), kuv(j, i + 1, 0), kuv(j, i + 1, 1), kuv(j, i, 1));
    }
    // the cut end of the cob
    const ctr = new V3(0, R, 0), pithC = L(0xd8cc9a);
    for (let j = 0; j < seg; j++) cob.tri(ctr, P(0, j), P(0, j + 1), pithC, L(0xc4b478), L(0xc4b478), WU, WU, WU);
    gs.push(cob.geo(true));
    // husk leaves peeled back from the base onto the ground
    for (let k = 0; k < 5; k++) {
      const a = (k / 5) * TAU + 0.4 + r() * 0.3, out = new V3(0, Math.sin(a), Math.cos(a)), len = 0.12 + r() * 0.05;
      const base = new V3(0.012, R + out.y * R * 0.95, out.z * R * 0.95), pts = [];
      for (let i = 0; i <= 4; i++) {
        const t = i / 4, p = base.clone().addScaledVector(out, t * 0.03).add(new V3(-t * len, 0, out.z * t * 0.04));
        p.y = Math.max(0.004 + 0.008 * Math.sin(t * PI), lerp(base.y + out.y * 0.012, 0.006, smooth(0, 0.8, t)));
        pts.push(p);
      }
      leafGrid(husk, {
        pts, side: new V3().crossVectors(new V3(-1, 0, 0), out), w: (t) => (0.02 - t * 0.014) * (t < 0.15 ? 0.75 + t * 1.6 : 1), nu: 2, cup: 0.55,
        col: (t, e) => mixc(mixc(L(0x5e8a34), L(0xa8b062), smooth(0.1, 0.9, t)), L(0x8aa04a), e * 0.4), cell: UV.vein, floor: 0.002,
      });
    }
    // one husk leaf still hugging the cob
    const w0 = -0.5 + r() * 0.3, wa = 1.5;
    const HP = (i, j) => { const t = (i / 3) * 0.38 - (j === 1 ? 0.03 : 0), a = w0 + (j / 3) * wa, rr = rad(Math.max(0.02, t)) * 1.07 + 0.001; return new V3(t * LEN, R + Math.sin(a) * rr, Math.cos(a) * rr); };
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
      const c0 = L(0x6a9440), c1 = L(0x9cac5c);
      husk.quad(HP(i, j), HP(i + 1, j), HP(i + 1, j + 1), HP(i, j + 1), c0, c1, c1, c0, WU, WU, WU, WU);
    }
    gs.push(husk.geo(true));
    // silk clinging to the tip
    const silk = soup();
    for (let k = 0; k < 7; k++) {
      const a = r() * TAU, sy = Math.sin(a) * (0.008 + r() * 0.008), sz = Math.cos(a) * (0.01 + r() * 0.012), len = 0.03 + r() * 0.03, pts = [];
      for (let i = 0; i <= 3; i++) { const t = i / 3; pts.push(new V3(LEN * 0.95 + t * len, Math.max(0.002, R * (1 - t * 1.1) + sy * t), sz * t * 1.5)); }
      ribbon(silk, pts, 0.0016, (t) => mixc(L(0xd8b868), L(0x8a5a2a), t * 0.9));
    }
    gs.push(silk.geo(false));
    // the shank stub
    gs.push(pipe([new V3(0.004, R, 0), new V3(-0.02, R * 0.95, 0.002), new V3(-0.034, R * 0.9, 0.005)], 0.0085, (t) => mixc(L(0xb0b072), L(0x8a9a52), t), 6, 'end'));
    const g = merge(gs);
    g.translate(-LEN / 2 + 0.02, 0, 0);
    return [{ geo: g, mat: FM() }];
  }

  /* ---------- lettuce ---------- */
  // a head of leaf lettuce: rings of cupped, ruffled leaves, dark and open outside, pale and closed in the middle.
  // hi: the food (more leaves and detail); red: red leaf lettuce (bronze red edges)
  function lettuceGeo(hi, seed, red) {
    const r = rng(seed), S = soup();
    const rings = hi ? [
      { n: 5, len: 0.135, wid: 0.07, a0: 0.75, bend: -1.25, nu: 4, nv: 5, ruf: 0.016, dark: 0x1e4c12, light: 0x3c7a22 },
      { n: 5, len: 0.11, wid: 0.06, a0: 1.15, bend: -0.75, nu: 4, nv: 4, ruf: 0.012, dark: 0x2a6018, light: 0x56922c },
      { n: 4, len: 0.075, wid: 0.045, a0: 1.4, bend: 0.9, nu: 2, nv: 3, ruf: 0.006, dark: 0x5a9a30, light: 0x9cc858 },
    ] : [
      { n: 5, len: 0.14, wid: 0.072, a0: 0.8, bend: -1.15, nu: 2, nv: 3, ruf: 0.014, dark: 0x1e4c12, light: 0x3c7a22 },
      { n: 3, len: 0.09, wid: 0.055, a0: 1.3, bend: 0.5, nu: 2, nv: 2, ruf: 0.007, dark: 0x4a8a28, light: 0x8cbc4c },
    ];
    const wf = tab([0, 0.25, 0.6, 0.85, 1], [0.16, 0.5, 0.95, 0.9, 0.45]);
    rings.forEach((g, gi) => {
      const off = r() * TAU;
      for (let i = 0; i < g.n; i++) {
        const a = off + (i / g.n) * TAU + (r() - 0.5) * 0.4, d = new V3(Math.cos(a), 0, Math.sin(a)), len = g.len * (0.85 + r() * 0.3);
        const base = new V3(d.x * 0.012 * (2 - gi), 0.006 + gi * 0.006, d.z * 0.012 * (2 - gi));
        const pts = spine(base, d, len, g.a0 + (r() - 0.5) * 0.2, g.bend, g.nv);
        const rd = red && gi < 2;
        leafGrid(S, {
          pts, side: new V3(-d.z, 0, d.x), w: (t) => wf(t) * g.wid, nu: g.nu, cup: 0.35, ruf: g.ruf, rf: 2.6, ph: r() * TAU, cell: UV.vein, floor: 0.002,
          col: (t, e) => {
            let c = mixc(L(g.light), L(g.dark), clamp(e * 0.7 + t * 0.3, 0, 1));
            c = mixc(L(0xc4dc94), c, smooth(0.0, 0.35, t) * (1 - (1 - e) * 0.15));
            if (rd) c = mixc(c, L(0x5a1c26), smooth(0.35, 1, e) * smooth(0.3, 0.85, t) * 0.85);
            return mulc(c, 1.08 + (r() - 0.5) * 0.16);
          },
        });
      }
    });
    const g = upN(S.geo(true), 0.18);
    return hi ? merge([g, ico(0.022, 0, 0, 0.03, 0, 1, 1.2, 1, L(0x9cc464))]) : g;
  }
  function foodLettuce() { return [{ geo: lettuceGeo(true, 3803, false), mat: FM() }]; }

  /* ---------- mushrooms ---------- */
  /* a brown mushroom standing at the origin: cap radius cr, stem height h (to the gills).
     o: { seg, top (cap middle), edge (cap rim), gill (tint), stem, foot, flat (0 domed .. 1 opened up), stemK } */
  function mushGeo(cr, h, o) {
    const seg = o.seg || 12, sr = cr * (o.stemK || 0.3), f = o.flat || 0;
    const stem = lathe([[sr * 1.18, 0], [sr * 1.04, h * 0.35], [sr * 0.95, h * 0.8], [sr * 0.92, h + cr * 0.05]], Math.max(6, seg - 4), (y) => mixc(L(o.foot), L(o.stem), smooth(0, h * 0.6, y)));
    const cap = lathe([[cr * 0.86, h - cr * 0.08], [cr, h + cr * 0.06], [cr * 0.93, h + cr * (0.3 - f * 0.12)], [cr * 0.66, h + cr * (0.53 - f * 0.22)], [cr * 0.3, h + cr * (0.64 - f * 0.27)], [0.0005, h + cr * (0.66 - f * 0.28)]], seg,
      (y, a, rr) => { const t = rr / cr; return mulc(mixc(L(o.top), L(o.edge), smooth(0.3, 1.0, t)), 0.9 + 0.14 * fbm(Math.cos(a) * 2.5 + t * 3, y * 40 + o.top % 7, Math.sin(a) * 2.5, 2)); });
    const gills = lathe([[sr * 0.95, h + cr * 0.05], [cr * 0.86, h - cr * 0.08]], seg, L(o.gill || 0xffffff), (y, a, rr) => [0.5 + Math.cos(a) * rr / cr * 0.49, 0.5 + Math.sin(a) * rr / cr * 0.49], UV.gills);
    return merge([stem, cap, gills]);
  }
  function foodMushroom() {
    const o = { top: 0x5e4230, edge: 0x947254, gill: 0x8a6a58, stem: 0xeee6d8, foot: 0xc4b498 };
    const big = mushGeo(0.037, 0.046, Object.assign({ seg: 11 }, o));
    const mid = mushGeo(0.03, 0.036, Object.assign({ seg: 10, flat: 0.2 }, o));
    mid.rotateZ(0.2); mid.translate(0.058, 0, 0.022);
    const tip = mushGeo(0.031, 0.036, Object.assign({ seg: 10 }, o));
    tip.rotateX(-1.4); tip.rotateY(-0.6);
    toGround(tip); tip.translate(-0.05, -0.004, 0.035);
    const crumbs = [];
    const r = rng(3804);
    for (let i = 0; i < 4; i++) { const a = r() * TAU, d = 0.04 + r() * 0.035; crumbs.push(ico(0.004 + r() * 0.003, 0, Math.cos(a) * d, 0.002, Math.sin(a) * d, 1, 0.6, 1, L(0x4a3424))); }
    return [{ geo: merge([big, mid, tip, ...crumbs]), mat: FM() }];
  }

  /* ---------- bugs ---------- */
  // two crickets and a beetle, each a body, a legs mesh (twitches around the body) and an antennae mesh (waves from the head)
  const CRICKET = { cy: 0.0075, ant: [0, 0.0105, 0.0165] }, BEETLE = { cy: 0.0042, ant: [0, 0.0058, 0.012] };
  const BUGS = [
    { kind: 'c', x: -0.03, z: -0.035, yaw: 0.7, r: 0.03, ph: 0 },
    { kind: 'c', x: 0.07, z: -0.02, yaw: 2.6, r: 0.025, ph: 2.1 },
    { kind: 'b', x: 0.0, z: 0.07, yaw: -1.1, r: 0.02, ph: 4.3 },
  ];
  function cricketGeo() {
    const cy = CRICKET.cy, body = [], legs = [], ant = [];
    const top = L(0x2e2216), side = L(0x463220), under = L(0x1a140e), thorax = L(0x15110d);
    body.push(spindleZ([[-0.02, 0, 0, 0], [-0.016, 0.0042, 0.0042, 0.0034], [-0.006, 0.0058, 0.0056, 0.0044], [0.003, 0.0054, 0.005, 0.0044], [0.0095, 0.0052, 0.0055, 0.0044], [0.011, 0, 0, 0]], 5, cy,
      (i, a) => { const s = Math.sin(a); if (i >= 3) return thorax; return s > 0.6 ? mixc(top, side, Math.abs(Math.cos(a)) * 1.5) : s > -0.3 ? side : under; }));
    body.push(ico(0.0056, 0, 0, cy + 0.0006, 0.0138, 1, 0.95, 0.9, L(0x120e0b)));
    for (const s of [-1, 1]) body.push(pipe([new V3(s * 0.0015, cy + 0.001, -0.019), new V3(s * 0.0055, cy + 0.003, -0.029)], 0.0005, L(0x3a2a1a)));
    const legC = L(0x241a12), femC = L(0x5a4028);
    for (const s of [-1, 1]) {
      legs.push(pipe([new V3(s * 0.003, cy - 0.003, 0.006), new V3(s * 0.0085, cy + 0.0005, 0.0095), new V3(s * 0.011, 0.0004, 0.0145)], 0.0006, legC));
      legs.push(pipe([new V3(s * 0.004, cy - 0.003, 0.0), new V3(s * 0.011, cy + 0.0005, 0.0005), new V3(s * 0.016, 0.0004, -0.002)], 0.0006, legC));
      // hind leg: thick femur up and back, thin tibia down to the ground
      legs.push(plain(tube([new V3(s * 0.0045, cy - 0.002, -0.004), new V3(s * 0.008, cy + 0.0055, -0.013), new V3(s * 0.009, cy + 0.0085, -0.019)], (i, t) => lerp(0.0019, 0.0009, t), { radial: 3, color: (t) => mixc(femC, legC, t) })));
      legs.push(pipe([new V3(s * 0.009, cy + 0.0085, -0.019), new V3(s * 0.0105, cy + 0.003, -0.025), new V3(s * 0.012, 0.0004, -0.031)], 0.0006, legC));
      // long antennae sweeping forward and out
      ant.push(pipe([new V3(s * 0.0015, 0, 0), new V3(s * 0.008, 0.006, 0.019), new V3(s * 0.026, -0.001, 0.04)], 0.0005, L(0x2a2016)));
    }
    const L1 = merge(legs); L1.translate(0, -cy, 0);
    return { body: merge(body), legs: L1, ant: merge(ant) };
  }
  function beetleGeo() {
    const cy = BEETLE.cy, body = [], legs = [], ant = [];
    const ely = L(0x5e2e14), hi = L(0x84481e), seam = L(0x2e1408), pron = L(0x42200e), under = L(0x2a1408);
    body.push(spindleZ([[-0.0125, 0, 0, 0], [-0.0095, 0.0068, 0.006, 0.0022], [-0.002, 0.0083, 0.0073, 0.0027], [0.004, 0.0068, 0.006, 0.0025], [0.0085, 0.0055, 0.0045, 0.0022], [0.0095, 0, 0, 0]], 6, cy,
      (i, a) => { const s = Math.sin(a); if (s < -0.2) return under; if (i >= 3) return pron; return Math.abs(Math.cos(a)) < 0.25 ? seam : mixc(ely, hi, s * 0.6); }));
    body.push(ico(0.003, 0, 0, cy + 0.001, 0.0115, 1.15, 0.8, 0.9, L(0x2e160a)));
    const legC = L(0x3a1e0e);
    for (const s of [-1, 1]) {
      legs.push(pipe([new V3(s * 0.004, cy - 0.001, 0.006), new V3(s * 0.009, cy + 0.0015, 0.009), new V3(s * 0.0115, 0.0003, 0.0135)], 0.0006, legC));
      legs.push(pipe([new V3(s * 0.005, cy - 0.001, 0.0), new V3(s * 0.011, cy + 0.0015, 0.0), new V3(s * 0.0145, 0.0003, -0.002)], 0.0006, legC));
      legs.push(pipe([new V3(s * 0.005, cy - 0.001, -0.004), new V3(s * 0.0105, cy + 0.0015, -0.008), new V3(s * 0.0135, 0.0003, -0.0135)], 0.0006, legC));
      ant.push(pipe([new V3(s * 0.0015, 0, 0), new V3(s * 0.004, 0.0015, 0.004), new V3(s * 0.0065, 0.0015, 0.0065)], 0.0005, legC));
    }
    const L1 = merge(legs); L1.translate(0, -cy, 0);
    return { body: merge(body), legs: L1, ant: merge(ant) };
  }
  function foodBugs() {
    const c = cricketGeo(), b = beetleGeo(), out = [];
    BUGS.forEach((q, i) => {
      const g = q.kind === 'c' ? c : b;
      out.push({ geo: g.body, mat: FM(), name: 'bug' + i }, { geo: g.legs, mat: FM(), name: 'bug' + i + 'legs' }, { geo: g.ant, mat: FM(), name: 'bug' + i + 'ant' });
    });
    return out;
  }
  // put each bug's meshes on a pivot (Env.food runs this on every new bugs group)
  function setupBugs(root) {
    const bugs = [];
    BUGS.forEach((q, i) => {
      const body = root.getObjectByName('bug' + i), legs = root.getObjectByName('bug' + i + 'legs'), ant = root.getObjectByName('bug' + i + 'ant');
      if (!body || !legs || !ant) return;
      const meta = q.kind === 'c' ? CRICKET : BEETLE, piv = new THREE.Group();
      piv.name = 'bugpivot' + i;
      piv.add(body, legs, ant);
      legs.position.set(0, meta.cy, 0);
      ant.position.set(meta.ant[0], meta.ant[1], meta.ant[2]);
      piv.position.set(q.x, 0, q.z); piv.rotation.y = q.yaw;
      root.add(piv);
      bugs.push({ q, piv, body, legs, ant });
    });
    root.userData.bugs = bugs;
  }
  // stop and go shuffling in a small loop, legs twitching while they walk, antennae waving; crickets hop now and then
  function updateBugs(root, t) {
    const bugs = root.userData.bugs;
    if (!bugs) return;
    const ph0 = root.userData.phase || 0;
    for (const b of bugs) {
      const q = b.q, p = ph0 + q.ph, cr = q.kind === 'c';
      const w = t * (cr ? 0.8 : 0.5) + p;
      const th = 0.6 * (w - Math.sin(w * 2.2) / 2.2), go = (1 - Math.cos(w * 2.2)) * 0.5;
      const lx = (Math.cos(th) - 1) * q.r, lz = Math.sin(th) * q.r * 0.8, dx = -Math.sin(th), dz = Math.cos(th) * 0.8;
      const co = Math.cos(q.yaw), si = Math.sin(q.yaw);
      let hop = 0;
      if (cr) { const hp = (((t * 0.19 + p * 0.31) % 1) + 1) % 1; if (hp < 0.07) hop = Math.sin((hp / 0.07) * PI); }
      b.piv.position.set(q.x + lx * co + lz * si, hop * 0.03, q.z - lx * si + lz * co);
      b.piv.rotation.y = q.yaw + Math.atan2(dx, dz);
      b.body.position.y = Math.abs(Math.sin(t * 18 + p)) * 0.0005 * go;
      b.legs.rotation.y = Math.sin(t * 18 + p) * 0.13 * go + Math.sin(t * 31 + p * 2) * 0.025;
      b.legs.rotation.x = -hop * 0.35 + Math.sin(t * 18 + p + 1.5) * 0.06 * go;
      b.ant.rotation.y = Math.sin(t * 2.3 + p) * 0.22 + Math.sin(t * 9.1 + p * 3) * 0.06;
      b.ant.rotation.x = Math.sin(t * 1.7 + p * 1.3) * 0.15 - 0.04;
    }
  }

  /* ---------- twigs ---------- */
  function twigLeaf(S, base, d, len, wid, r, col) {
    const pts = spine(base, d, len, 0.2 + r() * 0.5, -0.8 - r() * 0.9, 3);
    leafGrid(S, {
      pts, side: new V3(-d.z, 0, d.x).applyAxisAngle(new V3(d.x, 0, d.z).normalize(), (r() - 0.5) * 0.9),
      w: (t) => wid * Math.pow(Math.sin(Math.min(1, t * 0.94 + 0.06) * PI), 0.85) * (t < 0.05 ? 0.3 : 1), nu: 2, cup: 0.2, cell: UV.vein, floor: 0.003, col,
    });
  }
  function foodTwigs() {
    const r = rng(3806), S = soup(), wood = [];
    const bark = (t) => mixc(L(0x5a4834), L(0x6a7a3c), smooth(0.35, 1, t));
    const main = path([new V3(-0.2, 0.006, 0.01), new V3(-0.06, 0.017, -0.012), new V3(0.08, 0.014, 0.012), new V3(0.21, 0.008, 0.0)], 6);
    wood.push(plain(tube(main, (i, t) => lerp(0.0065, 0.0028, t), { radial: 5, cap: 'both', color: bark })));
    const shoots = [];
    for (const [t, s] of [[0.35, 1], [0.62, -1]]) {
      const b = posAt(main, t), pts = [b, b.clone().add(new V3(0.05, 0.004, s * 0.04)), b.clone().add(new V3(0.11, -0.002, s * 0.075))];
      wood.push(pipe(pts, 0.0026, (u) => bark(0.5 + u * 0.5), 4));
      shoots.push(pts);
    }
    const leafCol = (k) => (t, e) => mixc(mixc(L(0x3a6a22), L(0x1e4214), e * 0.6), L(0x7a8a30), k === 3 ? 0.55 : 0);
    let k = 0;
    for (let i = 0; i < 7; i++) {
      const t = 0.3 + i * 0.11, b = posAt(main, t), s = i % 2 ? 1 : -1, a = s * (0.9 + r() * 0.5);
      twigLeaf(S, b, new V3(Math.cos(a), 0, Math.sin(a)), 0.075 + r() * 0.025, 0.019 + r() * 0.004, r, leafCol(k++));
    }
    for (const pts of shoots) for (let i = 0; i < 3; i++) {
      const b = posAt(path(pts, 4), 0.35 + i * 0.3), a = (i % 2 ? 1 : -1) * (0.7 + r() * 0.6) + Math.atan2(pts[2].z - pts[0].z, pts[2].x - pts[0].x);
      twigLeaf(S, b, new V3(Math.cos(a), 0, Math.sin(a)), 0.07 + r() * 0.02, 0.018 + r() * 0.004, r, leafCol(k++));
    }
    return [{ geo: merge([upN(S.geo(true), 0.3), ...wood]), mat: FM() }];
  }

  /* ---------- watermelon ---------- */
  // a half moon slice lying on a cut face: red flesh with black seeds, white and green rind, striped skin
  function foodWatermelon() {
    const r = rng(3807), S = soup(), seeds = soup(), R = 0.125, T = 0.032, n = 16;
    const rr = [0, 0.38, 0.68, 0.84, 0.9, 0.955, 1];
    const ringC = [L(0xc41c2c), L(0xcc2432), L(0xd83440), L(0xea6a70), L(0xe6ecca), L(0x9cc070), L(0x2a5a22)];
    const P = (j, k) => {
      const a = (j / n) * PI, q = rr[k] * R;
      const bump = k < 4 ? 0.0022 * fbm(Math.cos(a) * q * 40 + 3, 1, Math.sin(a) * q * 40, 2) : 0;
      return new V3(Math.cos(a) * q, T + bump - (k === 6 ? 0.002 : 0), Math.sin(a) * q);
    };
    const C = (j, k) => (k < 4 ? mulc(ringC[k], 0.94 + 0.12 * fbm(j * 0.7, k * 1.3, 5, 1)) : ringC[k]);
    for (let j = 0; j < n; j++) {
      S.tri(P(j, 0), P(j + 1, 1), P(j, 1), C(j, 0), C(j + 1, 1), C(j, 1), WU, WU, WU);
      for (let k = 1; k < rr.length - 1; k++) S.quad(P(j, k), P(j + 1, k), P(j + 1, k + 1), P(j, k + 1), C(j, k), C(j + 1, k), C(j + 1, k + 1), C(j, k + 1), WU, WU, WU, WU);
      // the striped skin around the curve
      const st = (jj) => mixc(L(0x1c461a), L(0x5e8c3a), smooth(-0.2, 0.5, Math.sin((jj / n) * PI * 9 + 0.7 * Math.sin(jj * 1.9))));
      const a0 = (j / n) * PI, a1 = ((j + 1) / n) * PI, b0 = new V3(Math.cos(a0) * R * 0.99, 0.001, Math.sin(a0) * R * 0.99), b1 = new V3(Math.cos(a1) * R * 0.99, 0.001, Math.sin(a1) * R * 0.99);
      S.quad(P(j, 6), P(j + 1, 6), b1, b0, st(j), st(j + 1), st(j + 1), st(j), WU, WU, WU, WU);
    }
    // the straight cut along x: rind at both ends, flesh in the middle
    const xs = [];
    for (let k = rr.length - 1; k >= 1; k--) xs.push([-rr[k], k, n]);
    xs.push([0, 0, 0]);
    for (let k = 1; k < rr.length; k++) xs.push([rr[k], k, 0]);
    for (let i = 0; i < xs.length - 1; i++) {
      const [x0, k0, j0] = xs[i], [x1, k1, j1] = xs[i + 1];
      const t0 = P(j0, k0), t1 = P(j1, k1), b0 = new V3(x0 * R, 0.001, 0), b1 = new V3(x1 * R, 0.001, 0);
      S.quad(t0, t1, b1, b0, C(j0, k0), C(j1, k1), C(j1, k1), C(j0, k0), WU, WU, WU, WU);
    }
    // seeds: black teardrops (and a few pale ones) pointing to the middle
    for (let i = 0; i < 17; i++) {
      const a = 0.15 * PI + r() * 0.7 * PI, q = (i < 4 ? 0.3 + r() * 0.12 : 0.5 + r() * 0.22) * R;
      const c = new V3(Math.cos(a) * q, T + 0.0012, Math.sin(a) * q), f = new V3(-Math.cos(a), 0, -Math.sin(a)), s = new V3(-f.z, 0, f.x);
      const col = i >= 14 ? L(0xe8e0c8) : L(0x1a120e), sz = i >= 14 ? 0.7 : 1;
      const tip = c.clone().addScaledVector(f, 0.005 * sz), back = c.clone().addScaledVector(f, -0.0035 * sz);
      const lft = c.clone().addScaledVector(s, 0.0028 * sz), rgt = c.clone().addScaledVector(s, -0.0028 * sz), ap = c.clone(); ap.y += 0.0016;
      for (const [a1, b1] of [[tip, lft], [lft, back], [back, rgt], [rgt, tip]]) triUp(seeds, a1, b1, ap, col, col, mulc(col, 1.6));
    }
    const g = merge([S.geo(true), seeds.geo(false)]);
    g.translate(0, 0, -R * 0.42);
    return [{ geo: g, mat: FM() }];
  }

  /* ---------- bananas ---------- */
  // one finger lying on its side, from the stem end at the origin along +x, curving toward +z
  function bananaGeo(len, rad, bend, r, seed) {
    const n = 12, seg = 5, S = soup(), Rc = len / bend, pts = [];
    for (let i = 0; i <= n; i++) { const t = i / n, ph = (t - 0.5) * bend; pts.push(new V3(Math.sin(ph) * Rc, rad, Rc - Math.cos(ph) * Rc)); }
    const o = pts[0].clone();
    for (const p of pts) p.sub(o).add(new V3(0, rad, 0));
    const rf = tab([0, 0.1, 0.3, 0.55, 0.78, 0.95, 1], [0.3, 0.38, 0.92, 1, 0.9, 0.42, 0.22]);
    const ring = [];
    for (let i = 0; i <= n; i++) {
      const t = i / n, T = new V3().subVectors(pts[Math.min(n, i + 1)], pts[Math.max(0, i - 1)]).normalize(), B = new V3().crossVectors(T, new V3(0, 1, 0)).normalize(), row = [];
      for (let j = 0; j <= seg; j++) {
        const a = (j / seg) * TAU + 0.3, k = rad * rf(t) * (1 + 0.06 * Math.cos(a * 5 - 1.5)), p = pts[i].clone().addScaledVector(new V3(0, 1, 0), Math.cos(a) * k).addScaledVector(B, Math.sin(a) * k);
        let c = t < 0.1 ? L(0x6e6a30) : t < 0.3 ? mixc(L(0x9aa032), L(0xf0c21c), (t - 0.1) / 0.2) : t > 0.95 ? L(0x2c2218) : L(0xf0c21c);
        if (t > 0.86 && t <= 0.95) c = mixc(c, L(0xa89a30), (t - 0.86) / 0.09);
        if (t > 0.25 && t < 0.92 && fbm(p.x * 160 + seed, p.y * 160, p.z * 160, 1) > 0.36) c = mixc(c, L(0x7a5222), 0.6);
        row.push({ p, c: mulc(c, 0.92 + 0.08 * Math.cos(a * 5 - 1.5)) });
      }
      ring.push(row);
    }
    for (let i = 0; i < n; i++) for (let j = 0; j < seg; j++) {
      const A = ring[i][j], B = ring[i][j + 1], C2 = ring[i + 1][j + 1], D = ring[i + 1][j];
      S.quad(A.p, B.p, C2.p, D.p, A.c, B.c, C2.c, D.c, WU, WU, WU, WU);
    }
    const tipC = L(0x241c14), stemC = L(0x4e4024);
    for (let j = 0; j < seg; j++) {
      S.tri(pts[n], ring[n][j].p, ring[n][j + 1].p, tipC, tipC, tipC, WU, WU, WU);
      S.tri(pts[0], ring[0][j + 1].p, ring[0][j].p, stemC, stemC, stemC, WU, WU, WU);
    }
    return S.geo(true);
  }
  function foodBanana() {
    const r = rng(3808), gs = [];
    const fingers = [[0.19, 0.0175, 0.95, 0.22, -0.026, 0], [0.195, 0.018, 0.9, 0.0, 0.0, 0.006], [0.185, 0.017, 1.0, -0.2, 0.028, 0]];
    fingers.forEach(([len, rad, bend, yaw, z, y], i) => {
      const g = bananaGeo(len, rad, bend, r, i * 17);
      g.rotateY(yaw); g.translate(-0.1, y, z);
      gs.push(g);
    });
    // the crown the three stems grow from, and the cut stalk
    gs.push(pipe([new V3(-0.104, 0.017, -0.02), new V3(-0.107, 0.02, 0.0), new V3(-0.104, 0.017, 0.02)], 0.012, L(0x6a6630), 6, 'both'));
    gs.push(pipe([new V3(-0.11, 0.02, 0.0), new V3(-0.124, 0.022, 0.002), new V3(-0.136, 0.023, 0.004)], 0.0085, (t) => mixc(L(0x5a5428), L(0x3a3018), t), 6, 'end'));
    const g = merge(gs);
    g.translate(0.02, 0, -0.03);
    return [{ geo: g, mat: FM() }];
  }

  /* ---------- bread ---------- */
  // a flat piece of bread with a crust edge: outline [[x, z, crust 1 | torn 0]], thickness T; crumb on top
  function breadPiece(out, T, r, crustTop, crustSide) {
    const S = soup(), n = out.length, ctr = new V3();
    for (const p of out) { ctr.x += p[0] / n; ctr.z += p[1] / n; }
    const crustAt = (i) => out[i][2] && out[(i + n - 1) % n][2] ? 1 : out[i][2] && out[(i + 1) % n][2] ? 1 : 0;
    const topY = (x, z) => T + 0.0014 * fbm(x * 60, 2, z * 60, 2);
    const O = (i) => new V3(out[i][0], T - 0.0009, out[i][1]);
    const I = (i) => { const p = new V3(out[i][0], 0, out[i][1]), d = p.clone().sub(ctr); d.y = 0; const l = d.length() || 1; p.addScaledVector(d, -(crustAt(i) ? 0.0045 : 0.0012) / l); p.y = topY(p.x, p.z); return p; };
    const B = (i) => new V3(out[i][0] + (out[i][2] ? 0 : (r() - 0.5) * 0.002), 0.0005, out[i][1]);
    const cuv = (p) => cu(UV.crumb, 0.5 + p.x / 0.13, 0.5 - p.z / 0.13);
    const Wc = L(0xf4e4c4), inner = L(0xe4ceaa), c0 = ctr.clone(); c0.y = topY(ctr.x, ctr.z);
    const Is = out.map((_, i) => I(i)), Os = out.map((_, i) => O(i)), Bs = out.map((_, i) => B(i));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n, edge = out[i][2] && out[j][2];
      triUp(S, c0, Is[i], Is[j], Wc, inner, inner, cuv(c0), cuv(Is[i]), cuv(Is[j]));
      // the rim band: crust colored, or crumb where it is torn
      const tc = edge ? crustTop : inner;
      const ua = edge ? cu(UV.crust, 0, 1) : cuv(Is[i]), ub = edge ? cu(UV.crust, 1, 1) : cuv(Is[j]), uc = edge ? cu(UV.crust, 1, 0.6) : cuv(Os[j]), ud = edge ? cu(UV.crust, 0, 0.6) : cuv(Os[i]);
      const ci = edge ? crustTop : out[i][2] ? crustTop : inner, cj = edge ? crustTop : out[j][2] ? crustTop : inner;
      quadAway(S, Is[i], Is[j], Os[j], Os[i], new V3(ctr.x, -1, ctr.z), edge ? tc : inner, edge ? tc : inner, cj, ci, ua, ub, uc, ud);
      // the side wall
      const sc = edge ? crustSide : inner, ref = ctr.clone(); ref.y = T * 0.5;
      const wu = (u, v) => (edge ? cu(UV.crust, u, v) : cu(UV.crumb, u * 0.4, v * 0.3));
      quadAway(S, Os[i], Os[j], Bs[j], Bs[i], ref, sc, sc, mulc(sc, 0.85), mulc(sc, 0.85), wu(0, 1), wu(1, 1), wu(1, 0), wu(0, 0));
    }
    return S.geo(false);
  }
  function foodBread() {
    const r = rng(3809), gs = [];
    // a slice of sandwich bread (lying flat): domed top crust, straight sides, the near corner torn off
    const out = [];
    for (let i = 0; i <= 8; i++) { const a = (i / 8) * PI; out.push([Math.cos(a) * 0.057, -0.022 - Math.sin(a) * 0.04, 1]); }
    out.push([-0.052, 0.0, 1], [-0.051, 0.034, 1], [-0.046, 0.053, 1], [-0.02, 0.056, 1], [0.006, 0.056, 1]);
    for (const [x, z] of [[0.014, 0.05], [0.021, 0.053], [0.029, 0.044], [0.036, 0.046], [0.041, 0.034], [0.048, 0.031], [0.05, 0.017]]) out.push([x + (r() - 0.5) * 0.002, z + (r() - 0.5) * 0.002, 0]);
    out.push([0.052, 0.0, 1]);
    gs.push(breadPiece(out, 0.012, r, L(0xb07636), L(0x9a6230)));
    // the torn off piece
    const bit = [];
    for (let i = 0; i < 7; i++) { const a = (i / 7) * TAU, q = (i === 1 || i === 2 ? 0.022 : 0.014 + r() * 0.008); bit.push([Math.cos(a) * q, Math.sin(a) * q, i >= 1 && i <= 3 ? 1 : 0]); }
    const b = breadPiece(bit, 0.009, r, L(0xb07636), L(0x9a6230));
    b.rotateY(0.8); b.translate(0.085, 0, 0.06);
    gs.push(b);
    for (let i = 0; i < 7; i++) {
      const a = r() * TAU, d = 0.075 + r() * 0.05, g = prep(new THREE.OctahedronGeometry(0.0035 + r() * 0.003, 0));
      g.scale(1, 0.6, 1.2); g.rotateY(r() * TAU); g.translate(Math.cos(a) * d, 0.002, Math.sin(a) * d);
      gs.push(plain(paint(g, i < 5 ? L(0xe6d2ac) : L(0xa86c34))));
    }
    return [{ geo: merge(gs), mat: FM() }];
  }

  /* ---------- hot dog ---------- */
  function foodHotdog() {
    const gs = [], LB = 0.15, W = 0.062, H = 0.044, HY = 0.012, OPEN = 0.42, nt = 8, nf = 6;
    const wE = (t) => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(t * 2 - 1), 3)));
    // the uncut bun's cross section, one half (s = 1: z >= 0): f 0 is the bottom middle, 1 the top middle
    const sec = (t, f, s) => {
      const ph = -PI / 2 + f * PI, e = wE(t);
      return new V3((t - 0.5) * LB, (H / 2) * (1 + Math.sin(ph)) * (0.55 + 0.45 * e), (W / 2) * Math.pow(Math.max(0, Math.cos(ph)), 0.7) * e * s);
    };
    const crust = (f, t) => mixc(mixc(L(0xe4c890), L(0xc89050), smooth(0.15, 0.5, f)), L(0xa8642c), smooth(0.45, 0.85, f) * 0.85 * (0.8 + 0.2 * wE(t)));
    for (const s of [-1, 1]) {
      const S = soup();
      for (let i = 0; i < nt; i++) for (let j = 0; j < nf; j++) {
        const a = sec(i / nt, j / nf, s), b = sec((i + 1) / nt, j / nf, s), c = sec((i + 1) / nt, (j + 1) / nf, s), d = sec(i / nt, (j + 1) / nf, s);
        quadAway(S, a, b, c, d, new V3((a.x + c.x) / 2, H * 0.45, 0), crust(j / nf, i / nt), crust(j / nf, (i + 1) / nt), crust((j + 1) / nf, (i + 1) / nt), crust((j + 1) / nf, i / nt));
      }
      // the soft inside of the cut, from the hinge up to the top edge
      const cuv = (p) => cu(UV.crumb, 0.5 + p.x / 0.17, 0.15 + p.y / 0.06);
      for (let i = 0; i < nt; i++) {
        const p0 = sec(i / nt, 1, s), p1 = sec((i + 1) / nt, 1, s);
        p0.z = 0; p1.z = 0;
        const h0 = new V3(p0.x, Math.min(HY, p0.y), 0), h1 = new V3(p1.x, Math.min(HY, p1.y), 0), W1 = [1, 1, 1];
        quadAway(S, h0, h1, p1, p0, new V3((p0.x + p1.x) / 2, H * 0.4, s), W1, W1, W1, W1, cuv(h0), cuv(h1), cuv(p1), cuv(p0));
      }
      const g = S.geo(true);
      g.translate(0, -HY, 0); g.rotateX(s * OPEN); g.translate(0, HY, 0);
      gs.push(g);
    }
    // the sausage with grill marks, and a zigzag of mustard on top
    const SY = HY + 0.025, SR = 0.0118;
    const sp = path([new V3(-0.082, SY - 0.002, 0), new V3(-0.03, SY, 0.002), new V3(0.03, SY, 0.002), new V3(0.082, SY - 0.002, 0)], 8);
    gs.push(plain(tube(sp, (i, t) => SR * Math.max(0.2, Math.pow(1 - Math.pow(Math.abs(t * 2 - 1), 8), 0.5)), {
      radial: 7, cap: 'both',
      color: (t, a, p) => { let c = mixc(L(0x983e24), L(0xb4522e), 0.5 + 0.5 * Math.sin(a)); if (Math.sin(p.x * 190 + a * 0.8) > 0.8 && Math.sin(a) > -0.2) c = mixc(c, L(0x4a1a0e), 0.7); return c; },
    })));
    const zz = [];
    for (let i = 0; i <= 10; i++) { const x = -0.062 + i * 0.0124, z = (i % 2 ? 1 : -1) * 0.0072; zz.push(new V3(x, SY + Math.sqrt(Math.max(0, SR * SR - z * z)) + 0.0006, z)); }
    gs.push(pipe(path(zz, 18), 0.0028, L(0xe0b018), 3));
    return [{ geo: toGround(merge(gs)), mat: FM() }];
  }

  /* ---------- pet food ---------- */
  function foodPetfood() {
    const r = rng(3811), gs = [];
    const red = L(0xb8362a), redIn = L(0xc8463a);
    gs.push(plain(lathe([[0.098, 0.0], [0.1, 0.006], [0.083, 0.051], [0.078, 0.057], [0.071, 0.051], [0.062, 0.018], [0.0005, 0.014]], 16,
      (y, a, rr, k) => (k === 0 ? L(0x2a2a2a) : k <= 3 ? mixc(red, redIn, k === 3 ? 0.6 : 0.2) : mulc(redIn, k === 6 ? 0.7 : 0.9)))));
    // kibble heaped in the bowl
    const mound = (q) => 0.02 + 0.026 * Math.pow(Math.max(0, 1 - q * q), 0.8);
    gs.push(lathe([[0.064, 0.02], [0.056, mound(0.875)], [0.036, mound(0.5625)], [0.0005, mound(0)]], 12, [1, 1, 1], (y, a, rr) => [0.5 + Math.cos(a) * rr / 0.13, 0.5 + Math.sin(a) * rr / 0.13], UV.kibble));
    const pal = [0x8a5a2c, 0xa0682e, 0x6e4422, 0xb07a3a, 0x7a3a22];
    for (let i = 0; i < 16; i++) {
      const spill = i >= 12, a = r() * TAU, d = spill ? 0.11 + r() * 0.05 : Math.sqrt(r()) * 0.05;
      const g = prep(new THREE.OctahedronGeometry(0.0062 + r() * 0.0015, 0));
      g.scale(1.1 + r() * 0.3, 0.62, 0.9 + r() * 0.2); g.rotateY(r() * TAU);
      g.translate(Math.cos(a) * d, spill ? 0.0035 : mound(d / 0.064) + 0.0025, Math.sin(a) * d);
      gs.push(plain(paint(smoothNormals(g), L(pal[i % pal.length]))));
    }
    return [{ geo: merge(gs), mat: FM() }];
  }

  /* ---------- hay ---------- */
  function foodHay() {
    const r = rng(3812), S = soup(), straws = [];
    const R = 0.17, n = 12, rings = [0, 0.32, 0.62, 0.86, 1];
    // a lumpy heap: a few tufts on a low mound
    const hgt = (q, a) => 0.085 * Math.pow(Math.max(0, 1 - q * q), 0.8) * (1 + 0.25 * Math.sin(a * 3 + 1) + 0.3 * fbm(Math.cos(a) * q * 2.5, Math.sin(a) * q * 2.5, 4.2, 2));
    const P = (j, k) => {
      const a = (j / n) * TAU, q = rings[k], rr = R * q * (1 + 0.14 * Math.sin(a * 2 + 0.5) + 0.1 * Math.sin(a * 5));
      return new V3(Math.cos(a) * rr, Math.max(0.003, hgt(q, a)), Math.sin(a) * rr);
    };
    const C = (j, k) => mulc(mixc([1, 1, 1], L(0xd8d4a8), clamp(fbm(j * 0.6, k * 0.9, 3, 2) * 1.4 + 0.5, 0, 1)), k === 4 ? 0.7 : k === 3 ? 0.9 : 1);
    for (let j = 0; j < n; j++) {
      S.tri(P(j, 0), P(j + 1, 1), P(j, 1), C(j, 0), C(j + 1, 1), C(j, 1));
      for (let k = 1; k < rings.length - 1; k++) S.quad(P(j, k), P(j + 1, k), P(j + 1, k + 1), P(j, k + 1), C(j, k), C(j + 1, k), C(j + 1, k + 1), C(j, k + 1));
    }
    const mound = boxUV(S.geo(true), 4);
    // loose stalks lying over the heap (mostly around it, following the surface) and a few on the ground
    const cols = [0xc8b064, 0xa8a058, 0xbc9a4c, 0x98944e, 0xd4bc6c, 0x8a8a46];
    const surf = (x, z) => { const q = Math.hypot(x, z) / R; return q < 1 ? hgt(q, Math.atan2(z, x)) : 0; };
    for (let i = 0; i < 36; i++) {
      const a = r() * TAU, q = r() < 0.8 ? 0.15 + r() * 0.8 : 1.0 + r() * 0.3, len = 0.05 + r() * 0.07;
      const d = a + PI / 2 * (r() < 0.5 ? 1 : -1) + (r() - 0.5) * 0.9;
      const p0 = new V3(Math.cos(a) * q * R, 0, Math.sin(a) * q * R), mid = p0.clone().add(new V3(Math.cos(d) * len * 0.5, 0, Math.sin(d) * len * 0.5));
      const p1 = p0.clone().add(new V3(Math.cos(d) * len, 0, Math.sin(d) * len));
      for (const p of [p0, mid, p1]) p.y = surf(p.x, p.z) + 0.0025 + r() * 0.003;
      // uvs on a light stalk in the hay texture's first row
      const g = tube([p0, mid, p1], 0.0014, { radial: 3, color: () => L(cols[i % cols.length]) }), uv = g.attributes.uv.array;
      for (let k = 0; k < uv.length; k += 2) { uv[k] = 0.025; uv[k + 1] = 0.016; }
      straws.push(g);
    }
    return [{ geo: merge([mound, ...straws]), mat: HAYM() }];
  }

  /* ============================================================
     Props: where the foods come from
     ============================================================ */
  /* ---------- sunflowers ---------- */
  // a flower head facing along n, centered at c: seed face, green back with bracts, golden ray petals
  function sunHead(Rd, c, n, r) {
    const S = soup(), seg = 12, fr = [0, 0.55, 1], W1 = [1, 1, 1];
    const F = (j, k) => { const a = (j / seg) * TAU, q = fr[k]; return new V3(Math.cos(a) * q * Rd, 0.012 * (1 - q * q), Math.sin(a) * q * Rd); };
    const fuv = (j, k) => { const a = (j / seg) * TAU, q = fr[k] * 0.49; return cu(UV.seed, 0.5 + Math.cos(a) * q, 0.5 + Math.sin(a) * q); };
    for (let j = 0; j < seg; j++) {
      S.tri(F(j, 0), F(j + 1, 1), F(j, 1), W1, W1, W1, fuv(j, 0), fuv(j + 1, 1), fuv(j, 1));
      S.quad(F(j, 1), F(j + 1, 1), F(j + 1, 2), F(j, 2), W1, W1, W1, W1, fuv(j, 1), fuv(j + 1, 1), fuv(j + 1, 2), fuv(j, 2));
    }
    const back = lathe([[0.022, -0.05], [Rd * 0.5, -0.042], [Rd * 0.92, -0.014], [Rd * 1.0, 0.0]], seg, (y) => mixc(L(0x3a5420), L(0x56742c), smooth(-0.05, 0, y)));
    const P = soup();
    for (let i = 0; i < 12; i++) {
      // green bracts curling back around the rim
      const a = ((i + 0.5) / 12) * TAU, d = new V3(Math.cos(a), 0, Math.sin(a)), s = new V3(-d.z, 0, d.x);
      const b = d.clone().multiplyScalar(Rd * 0.96); b.y = -0.008;
      const tip = d.clone().multiplyScalar(Rd * 1.12); tip.y = -0.03;
      triUp(P, b.clone().addScaledVector(s, -0.014), b.clone().addScaledVector(s, 0.014), tip, L(0x4a6a26), L(0x4a6a26), L(0x36521c));
    }
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * TAU + (i % 2) * 0.09, d = new V3(Math.cos(a), 0, Math.sin(a)), s = new V3(-d.z, 0, d.x);
      const len = (0.06 + r() * 0.02) * (Rd / 0.12), wid = 0.013 * (Rd / 0.12), droop = 0.15 + r() * 0.4, b0 = Rd * 0.93;
      const b = d.clone().multiplyScalar(b0); b.y = 0.002;
      const mid = d.clone().multiplyScalar(b0 + len * 0.45); mid.y = -len * 0.45 * Math.sin(droop * 0.6);
      const tip = d.clone().multiplyScalar(b0 + len * Math.cos(droop)); tip.y = -len * Math.sin(droop);
      const cb = L(0xd88a10), cm = L(0xf0b41c), ct = L(0xf4c428);
      triUp(P, b, mid.clone().addScaledVector(s, wid), tip, cb, cm, ct);
      triUp(P, b, tip, mid.clone().addScaledVector(s, -wid), cb, ct, cm);
    }
    const g = merge([S.geo(true), back, upN(P.geo(false), 0.4)]);
    g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), n.clone().normalize()));
    g.translate(c.x, c.y, c.z);
    return g;
  }
  function makeSunflower(v) {
    const r = rng(3900 + v * 31), leafS = soup(), stalks = [], cols = [];
    const plan = v ? [[0.0, 0.05, 2.3], [0.42, -0.18, 1.95], [-0.38, -0.22, 1.7], [0.1, 0.45, 1.5]] : [[0.0, 0.0, 2.1], [0.4, 0.22, 1.8], [-0.33, 0.28, 1.55]];
    const heart = tab([0, 0.08, 0.3, 0.6, 0.85, 1], [0.2, 0.42, 0.48, 0.36, 0.16, 0.0]);
    for (const [x, z, H] of plan) {
      // the heads all look about the same way (grown sunflowers face east), nodding down
      const face = 0.3 + (r() - 0.5) * 0.9, fd = new V3(Math.sin(face), 0, Math.cos(face));
      const lx = (r() - 0.5) * 0.12, lz = (r() - 0.5) * 0.12, nod = 0.45 + r() * 0.4;
      const pts = path([new V3(x, 0, z), new V3(x + lx * 0.3, H * 0.45, z + lz * 0.3), new V3(x + lx, H * 0.86, z + lz), new V3(x + lx + fd.x * 0.07, H * 0.97, z + lz + fd.z * 0.07), new V3(x + lx + fd.x * 0.14, H * 0.96, z + lz + fd.z * 0.14)], 7);
      stalks.push(pipe(pts, (i, t) => lerp(0.02, 0.011, t) * (0.8 + H * 0.12), (t) => mixc(L(0x4a6a28), L(0x6a8a36), t), 5));
      cols.push({ x, z, r: 0.07 });
      const n = new V3(fd.x * Math.cos(nod), -Math.sin(nod), fd.z * Math.cos(nod)), top = pts[pts.length - 1];
      stalks.push(sunHead(0.105 + H * 0.016, top.clone().addScaledVector(n, 0.04), n, r));
      // big heart shaped leaves on long stalks, alternate up the stem, smaller toward the top
      for (let k = 0; k < 6; k++) {
        const t = 0.16 + k * 0.12 + r() * 0.03, at = posAt(pts, t), a = k * 2.4 + r() * 0.5, d = new V3(Math.cos(a), 0, Math.sin(a));
        const len = lerp(0.52, 0.3, k / 6) * (0.9 + r() * 0.2);
        const sp = spine(at.clone().addScaledVector(d, 0.012), d, len, 0.55 + r() * 0.3, -2.0, 5);
        leafGrid(leafS, {
          pts: sp, side: new V3(-d.z, 0, d.x), w: (tt) => (tt < 0.22 ? 0.006 : len * 0.8 * heart((tt - 0.22) / 0.78)), nu: 2, cup: 0.15, cell: UV.vein,
          col: (tt, e) => (tt < 0.22 ? L(0x5a7a30) : mulc(mixc(L(0x4a7a2a), L(0x2e521a), e * 0.7), 1.1)),
        });
      }
    }
    return {
      parts: [
        { geometry: merge(stalks), material: plantM('sun', 0.12, 0.01), castShadow: true },
        { geometry: upN(leafS.geo(true), 0.35), material: plantM('sunLeaf', 0.12, 0.01, FALL38.sun), castShadow: true },
      ],
      radius: 0, colliders: cols, spot: { type: 'seeds', r: 1.0 }, sink: 0.05,
    };
  }

  /* ---------- bird feeder ---------- */
  function makeBirdfeeder() {
    const r = rng(3920), wood = [], seeds = [], metal = [];
    const PH = 1.42, wc = L(0x8a6a48), wd = L(0x6a5038), ty = PH + 0.012;
    wood.push(boxG(0.085, PH + 0.1, 0.085, 0, (PH - 0.1) / 2, 0, wd, 2));
    // squirrel baffle: a galvanized cone around the post
    metal.push(lathe([[0.245, 0.84], [0.24, 0.85], [0.05, 0.98], [0.047, 0.99]], 14, (y) => mixc(L(0x4a5054), L(0x666c70), smooth(0.84, 0.98, y))));
    // tray with lips and two perches
    wood.push(boxG(0.36, 0.024, 0.27, 0, ty, 0, wc, 2));
    for (const s of [-1, 1]) {
      wood.push(boxG(0.36, 0.035, 0.014, 0, ty + 0.028, s * 0.128, wc, 2), boxG(0.014, 0.035, 0.24, s * 0.173, ty + 0.028, 0, wc, 2));
      wood.push(paint(prep(K.pipeGeo(-0.19, ty + 0.04, s * 0.152, 0.19, ty + 0.04, s * 0.152, 0.006, L(0x7a5a3a), 5)), L(0x7a5a3a)));
      for (const x of [-0.17, 0.17]) wood.push(boxG(0.01, 0.03, 0.03, x, ty + 0.025, s * 0.14, wc, 2));
    }
    // hopper: gable ends, seed showing through the windows, a peaked roof
    const gy0 = ty + 0.012, gw = 0.075, gh = 0.16, peak = 0.235;
    for (const s of [-1, 1]) {
      const S = soup(), x0 = s * 0.104, x1 = s * 0.12, out = [[-gw, 0], [gw, 0], [gw, gh], [0, peak], [-gw, gh]];
      const pt = (q, x) => new V3(x, gy0 + q[1], q[0]);
      for (let i = 1; i < out.length - 1; i++) {
        quadAway(S, pt(out[0], x1), pt(out[i], x1), pt(out[i + 1], x1), pt(out[i + 1], x1), new V3(0, gy0 + 0.1, 0), wc, wc, wc, wc);
        quadAway(S, pt(out[0], x0), pt(out[i], x0), pt(out[i + 1], x0), pt(out[i + 1], x0), new V3(s, gy0 + 0.1, 0), wc, wc, wc, wc);
      }
      for (let i = 0; i < out.length; i++) { const a = out[i], b = out[(i + 1) % out.length]; quadAway(S, pt(a, x0), pt(b, x0), pt(b, x1), pt(a, x1), new V3(s * 0.112, gy0 + 0.1, 0), wc, wc, wc, wc); }
      wood.push(boxUV(S.geo(false), 2));
      // the sloped window between the ends, full of seed
      const W1 = [1, 1, 1], a = new V3(-0.104, gy0 + 0.03, s * 0.04), b = new V3(0.104, gy0 + 0.03, s * 0.04), c2 = new V3(0.104, gy0 + gh, s * gw), d = new V3(-0.104, gy0 + gh, s * gw);
      const Sw = soup();
      quadAway(Sw, a, b, c2, d, new V3(0, gy0 + 0.1, 0), W1, W1, W1, W1, cu(UV.mix, 0, 0), cu(UV.mix, 1, 0), cu(UV.mix, 1, 0.8), cu(UV.mix, 0, 0.8));
      seeds.push(Sw.geo(false));
      // window frame strips and the roof board
      wood.push(boxG(0.21, 0.012, 0.012, 0, gy0 + 0.03, s * 0.04, wc, 2), boxG(0.21, 0.012, 0.012, 0, gy0 + gh, s * gw, wc, 2));
      const roof = prep(new THREE.BoxGeometry(0.31, 0.014, 0.135));
      roof.rotateX(s * 0.72); roof.translate(0, gy0 + peak - 0.04, s * 0.052);
      wood.push(boxUV(paint(roof, L(0x5a4a3a)), 2));
      // seed piled in the tray along the hopper gap
      const Sp = soup(), pc = new V3(0, ty + 0.013, s * 0.075), ring = [];
      for (let i = 0; i < 8; i++) { const ang = (i / 8) * TAU; ring.push(new V3(Math.cos(ang) * 0.13, ty + 0.013, s * 0.075 + Math.sin(ang) * 0.035)); }
      pc.y += 0.012;
      const muv = (p) => cu(UV.mix, 0.5 + p.x / 0.3, 0.5 + p.z / 0.3);
      for (let i = 0; i < 8; i++) triUp(Sp, pc, ring[i], ring[(i + 1) % 8], W1, W1, W1, muv(pc), muv(ring[i]), muv(ring[(i + 1) % 8]));
      seeds.push(Sp.geo(true));
    }
    wood.push(boxG(0.32, 0.02, 0.03, 0, gy0 + peak - 0.002, 0, L(0x4e4032), 2));
    // seed spilled on the ground under the feeder: a few thin patches and single seeds
    const G = soup(), W1 = [1, 1, 1];
    for (let k = 0; k < 6; k++) {
      const a = r() * TAU, d = 0.12 + r() * 0.28, cx = Math.cos(a) * d, cz = Math.sin(a) * d, rad = 0.04 + r() * 0.06, c0 = new V3(cx, 0.008, cz), ring = [];
      for (let i = 0; i < 7; i++) { const b = (i / 7) * TAU, q = rad * (0.6 + r() * 0.5); ring.push(new V3(cx + Math.cos(b) * q, 0.005, cz + Math.sin(b) * q)); }
      const muv = (p) => cu(UV.mix, 0.5 + (p.x - cx) / 0.25, 0.5 + (p.z - cz) / 0.25);
      for (let i = 0; i < 7; i++) triUp(G, c0, ring[i], ring[(i + 1) % 7], W1, W1, W1, muv(c0), muv(ring[i]), muv(ring[(i + 1) % 7]));
    }
    for (let k = 0; k < 16; k++) {
      const a = r() * TAU, d = 0.1 + r() * 0.45, c0 = new V3(Math.cos(a) * d, 0.006, Math.sin(a) * d), b = r() * TAU, f = new V3(Math.cos(b), 0, Math.sin(b)), s = new V3(-f.z, 0, f.x);
      const col = r() < 0.6 ? L(0x1c1a16) : L(0xd8c890);
      triUp(G, c0.clone().addScaledVector(f, 0.006), c0.clone().addScaledVector(s, 0.003), c0.clone().addScaledVector(f, -0.005), col, col, col);
      triUp(G, c0.clone().addScaledVector(f, 0.006), c0.clone().addScaledVector(f, -0.005), c0.clone().addScaledVector(s, -0.003), col, col, col);
    }
    seeds.push(G.geo(false));
    return {
      parts: [
        { geometry: boxUV(merge(wood), 2), material: mat('fenceWood', { map: TX.wood() }), castShadow: true },
        { geometry: merge([...seeds, ...metal]), material: PM(), castShadow: true },
      ],
      radius: 0.1, spot: { type: 'seeds', r: 0.9 }, sink: 0,
    };
  }

  /* ---------- corn row ---------- */
  function makeCornrow() {
    const r = rng(3940), S = soup(), parts = [], cols = [];
    const leafW = tab([0, 0.1, 0.5, 0.85, 1], [0.35, 0.85, 1, 0.6, 0.0]);
    for (const x0 of [-1.1, -0.55, 0, 0.55, 1.1]) {
      const x = x0 + (r() - 0.5) * 0.1, z = (r() - 0.5) * 0.1, H = 2.0 + r() * 0.4, lx = (r() - 0.5) * 0.08, lz = (r() - 0.5) * 0.08;
      cols.push({ x: +x.toFixed(3), z: +z.toFixed(3), r: 0.08 });
      const sp = path([new V3(x, -0.02, z), new V3(x + lx * 0.4, H * 0.5, z + lz * 0.4), new V3(x + lx, H, z + lz)], 4);
      parts.push(pipe(sp, (i, t) => lerp(0.022, 0.011, t), (t) => mixc(L(0x56762e), L(0x7a9a42), t), 5));
      // brace roots
      for (let k = 0; k < 2; k++) { const a = k * PI + r(); parts.push(pipe([new V3(x + Math.cos(a) * 0.015, 0.1, z + Math.sin(a) * 0.015), new V3(x + Math.cos(a) * 0.065, -0.01, z + Math.sin(a) * 0.065)], 0.005, L(0x8a8a4a))); }
      // long arching leaves, alternate sides
      const a0 = r() * TAU;
      for (let k = 0; k < 9; k++) {
        const t = 0.13 + k * 0.09, at = posAt(sp, t), a = a0 + (k % 2) * PI + (r() - 0.5) * 0.5, d = new V3(Math.cos(a), 0, Math.sin(a));
        const len = (0.5 + Math.sin(Math.min(1, t * 1.3) * PI) * 0.35) * (0.9 + r() * 0.15);
        const pts = spine(at.clone().addScaledVector(d, 0.012), d, len, 1.05 + r() * 0.25, -2.6 - r() * 0.6, 3);
        leafGrid(S, { pts, side: new V3(-d.z, 0, d.x), w: (u) => 0.04 * leafW(u), nu: 2, cup: 0.3, ruf: 0.006, rf: 3, cell: UV.vein, col: (u, e) => mulc(mixc(L(0x5a8a32), L(0x3a6a22), e * 0.6 + u * 0.2), 1.08) });
      }
      // tassel
      const top = sp[sp.length - 1];
      for (let k = 0; k < 5; k++) {
        const a = k * 1.3 + r(), up = k === 0, d = new V3(Math.cos(a), 0, Math.sin(a));
        const p1 = top.clone().add(up ? new V3(0, 0.14, 0) : new V3(d.x * 0.08, 0.07, d.z * 0.08)), p2 = top.clone().add(up ? new V3(0.01, 0.28, 0.01) : new V3(d.x * 0.17, 0.04, d.z * 0.17));
        ribbon(S, [top.clone(), p1, p2], 0.004, (t) => mixc(L(0xb8a868), L(0xd8c890), t), up ? new V3(d.x, 0, d.z) : new V3(0, 1, 0));
      }
      // one or two ears, husk wrapped, angled out from the stalk, silk at the tip
      const ne = r() < 0.4 ? 2 : 1;
      for (let k = 0; k < ne; k++) {
        const at = posAt(sp, 0.45 + k * 0.1), a = a0 + PI * 0.5 + k * PI + (r() - 0.5) * 0.4, d = new V3(Math.cos(a), 0, Math.sin(a));
        const ax = d.clone().multiplyScalar(0.42).add(new V3(0, 0.9, 0)).normalize(), b = at.clone().addScaledVector(d, 0.03);
        parts.push(pipe([at.clone(), b], 0.008, L(0x6a8a3a)));
        const ep = [0, 0.33, 0.66, 1].map((t) => b.clone().addScaledVector(ax, t * 0.2));
        const er = tab([0, 0.15, 0.6, 0.9, 1], [0.012, 0.022, 0.021, 0.012, 0.003]);
        parts.push(plain(tube(ep, (i, t) => er(t), { radial: 5, color: (t) => mixc(L(0x6e9440), L(0xa8b46a), t) })));
        const tip = ep[3];
        for (let j = 0; j < 2; j++) { const f = new V3(Math.cos(a + j * 2.5), 0, Math.sin(a + j * 2.5)); ribbon(S, [tip.clone(), tip.clone().add(new V3(f.x * 0.03, 0.05, f.z * 0.03)), tip.clone().add(new V3(f.x * 0.07, 0.06, f.z * 0.07))], 0.006, () => L(0x8aa452)); }
        for (let j = 0; j < 3; j++) { const f = new V3(Math.cos(a + j * 2.1), 0, Math.sin(a + j * 2.1)); ribbon(S, [tip.clone(), tip.clone().add(new V3(f.x * 0.02, 0.02, f.z * 0.02)), tip.clone().add(new V3(f.x * 0.045, -0.03, f.z * 0.045))], 0.003, (t) => mixc(L(0x9a6a32), L(0x5a3a1a), t)); }
      }
    }
    // the hilled row of soil
    const soil = soup(), NX = 9, NZ = 4, XW = 1.5, ZW = 0.44;
    const SP = (i, k) => { const x = -XW + (i / NX) * XW * 2, z = -ZW + (k / NZ) * ZW * 2, e = smooth(0, 0.3, 1 - Math.abs(x) / XW); return new V3(x, -0.035 + (0.11 * Math.pow(Math.cos((z / ZW) * PI / 2), 2) + 0.012 * fbm(x * 3, 1, z * 3, 2)) * e, z); };
    const SC = (i, k) => { const p = SP(i, k); return mixc(mixc(L(0x4a3826), L(0x6a5238), clamp(p.y * 8 + 0.3, 0, 1)), L(0x5a6030), k === 0 || k === NZ || i === 0 || i === NX ? 0.6 : 0); };
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) soil.quad(SP(i, k), SP(i, k + 1), SP(i + 1, k + 1), SP(i + 1, k), SC(i, k), SC(i, k + 1), SC(i + 1, k + 1), SC(i + 1, k));
    return {
      parts: [
        { geometry: merge([...parts, S.geo(true)]), material: plantM('corn', 0.12, 0.01, FALL38.corn), castShadow: true },
        { geometry: boxUV(soil.geo(true), 1.2), material: mat('soil', { map: TX.soil() }), castShadow: false },
      ],
      radius: 0, colliders: cols, spot: { type: 'corn', r: 1.4 }, sink: 0.02,
    };
  }

  /* ---------- lettuce bed ---------- */
  function makeLettucebed() {
    const r = rng(3960), W = 2.2, D = 1.3, B = 0.1, BH = 0.22, wood = [], heads = [], slots = [];
    const bc = L(0x7a6248);
    wood.push(boxG(W, BH, B, 0, BH / 2, -D / 2 + B / 2, bc, 1), boxG(W, BH, B, 0, BH / 2, D / 2 - B / 2, bc, 1));
    wood.push(boxG(B, BH, D - B * 2, -W / 2 + B / 2, BH / 2, 0, bc, 1), boxG(B, BH, D - B * 2, W / 2 - B / 2, BH / 2, 0, bc, 1));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(boxG(0.13, BH + 0.08, 0.13, sx * (W / 2 - 0.065), (BH + 0.08) / 2, sz * (D / 2 - 0.065), mulc(bc, 0.85), 1));
    // soil heaped in three rows
    const soil = soup(), iw = W / 2 - B, id = D / 2 - B, NX = 6, NZ = 6;
    const sy = (x, z) => 0.14 + 0.035 * Math.pow(Math.cos(((z + id) / (id * 2)) * PI * 3), 2) + 0.008 * fbm(x * 4, 2, z * 4, 2);
    const SP = (i, k) => { const x = -iw + (i / NX) * iw * 2, z = -id + (k / NZ) * id * 2; return new V3(x, sy(x, z), z); };
    const SC = (i, k) => { const p = SP(i, k); return mixc(L(0x2e2018), L(0x5a4232), clamp((p.y - 0.13) * 18, 0, 1)); };
    for (let i = 0; i < NX; i++) for (let k = 0; k < NZ; k++) soil.quad(SP(i, k), SP(i, k + 1), SP(i + 1, k + 1), SP(i + 1, k), SC(i, k), SC(i, k + 1), SC(i + 1, k + 1), SC(i + 1, k));
    for (let row = 0; row < 3; row++) for (let c = 0; c < 4; c++) {
      const x = -0.75 + c * 0.5 + (r() - 0.5) * 0.06, z = -id + (row + 0.5) * (id * 2 / 3) + (r() - 0.5) * 0.05, y = sy(x, z) - 0.01, s = 0.9 + r() * 0.25;
      const g = lettuceGeo(false, 3970 + row * 7 + c, (row * 4 + c) % 5 === 2);
      g.scale(s, s, s); g.rotateY(r() * TAU); g.translate(x, y, z);
      heads.push(g);
      slots.push({ x: +x.toFixed(3), y: +y.toFixed(3), z: +z.toFixed(3) });
    }
    return {
      parts: [
        { geometry: boxUV(soil.geo(true), 1.2), material: mat('soil', { map: TX.soil() }), castShadow: false },
        { geometry: boxUV(merge(wood), 1), material: mat('fenceWood', { map: TX.wood() }), castShadow: true },
        { geometry: merge(heads), material: plantM('lettuce', 0, 0.004), castShadow: true },
      ],
      radius: 0, slots, spot: { type: 'lettuce', r: 1.2 }, sink: 0.02,
    };
  }

  /* ---------- mushrooms on the forest floor ---------- */
  function makeMushrooms() {
    const r = rng(3980), gs = [], S = soup(), W1 = [1, 1, 1];
    // a mossy hump; its rim dips into the ground so it sits right however deep it is set
    const n = 14, rings = [0, 0.45, 0.8, 1, 1.12];
    const RR = (a) => 0.38 * (1 + 0.15 * Math.sin(a * 3 + 1) + 0.08 * Math.sin(a * 5));
    const hy = (q, a) => (q > 1 ? -0.04 : 0.075 * Math.pow(Math.max(0, 1 - q * q), 1.1) + (q < 1 ? 0.01 * fbm(Math.cos(a) * q * 3, Math.sin(a) * q * 3, 2, 2) : 0) + 0.006);
    const P = (j, k) => { const a = (j / n) * TAU, q = rings[k], rr = RR(a) * q; return new V3(Math.cos(a) * rr, hy(q, a), Math.sin(a) * rr); };
    const C = (j, k) => mulc(k >= 3 ? L(0x7a7656) : k === 2 ? L(0xd0ccb4) : L(0xe6e2c8), 0.85 + 0.3 * fbm(j * 0.9, k * 1.3, 7, 2));
    const muv = (p) => [p.x / 0.3, -p.z / 0.3];
    for (let j = 0; j < n; j++) {
      S.tri(P(j, 0), P(j + 1, 1), P(j, 1), C(j, 0), C(j + 1, 1), C(j, 1), muv(P(j, 0)), muv(P(j + 1, 1)), muv(P(j, 1)));
      for (let k = 1; k < rings.length - 1; k++) S.quad(P(j, k), P(j + 1, k), P(j + 1, k + 1), P(j, k + 1), C(j, k), C(j + 1, k), C(j + 1, k + 1), C(j, k + 1), muv(P(j, k)), muv(P(j + 1, k)), muv(P(j + 1, k + 1)), muv(P(j, k + 1)));
    }
    const moss = S.geo(true);
    const surf = (x, z) => { const a = Math.atan2(z, x), q = Math.hypot(x, z) / RR(a); return q < 1 ? hy(q, a) : 0.006; };
    // fallen leaves on the moss and a rotten stick
    const Lf = soup();
    for (let i = 0; i < 12; i++) {
      const a = r() * TAU, d = (0.55 + r() * 0.35) * RR(a), c0 = new V3(Math.cos(a) * d, 0, Math.sin(a) * d), b = r() * TAU, f = new V3(Math.cos(b), 0, Math.sin(b)), s = new V3(-f.z, 0, f.x), len = 0.045 + r() * 0.035;
      c0.y = surf(c0.x, c0.z) + 0.004;
      const u0 = (i % 4) * 0.25, v0 = Math.floor(i / 4) * 0.33;
      const p = [c0.clone().addScaledVector(f, -len), c0.clone().addScaledVector(s, len * 0.45), c0.clone().addScaledVector(f, len), c0.clone().addScaledVector(s, -len * 0.45)];
      for (const q of p) q.y = Math.max(q.y, surf(q.x, q.z) + 0.003);
      const uv = [cu(UV.litter, u0, v0 + 0.15), cu(UV.litter, u0 + 0.12, v0 + 0.3), cu(UV.litter, u0 + 0.24, v0 + 0.15), cu(UV.litter, u0 + 0.12, v0)];
      triUp(Lf, p[0], p[1], p[2], W1, W1, W1, uv[0], uv[1], uv[2]);
      triUp(Lf, p[0], p[2], p[3], W1, W1, W1, uv[0], uv[2], uv[3]);
    }
    gs.push(Lf.geo(false));
    gs.push(pipe([new V3(-0.46, 0.012, 0.16), new V3(-0.26, 0.05, 0.24), new V3(-0.06, 0.03, 0.4)], 0.016, (t) => mixc(L(0x4a3a28), L(0x5a5030), t), 5, 'both'));
    // the mushrooms: a tight cluster, the big ones in the middle, leaning out
    const M = [[0, 0, 0.065, 0.12, 0.1], [0.1, 0.05, 0.05, 0.1, 0.3], [-0.09, 0.07, 0.046, 0.085, 0.1], [0.03, -0.1, 0.042, 0.075, 0.4], [-0.06, -0.07, 0.032, 0.06, 0.2], [0.15, -0.05, 0.026, 0.05, 0], [-0.16, -0.01, 0.022, 0.042, 0.2], [0.07, 0.14, 0.02, 0.036, 0.1]];
    M.forEach(([x0, z0, cr0, h0, f], i) => {
      const x = x0 * 1.25, z = z0 * 1.25, cr = cr0 * 1.25, h = h0 * 1.25;
      const g = mushGeo(cr, h, { seg: cr > 0.055 ? 12 : cr > 0.035 ? 10 : 8, top: 0x5a3a22, edge: 0x9e7a48, gill: 0xf0e6d4, stem: 0xe4dac4, foot: 0x8a7050, flat: f });
      const lean = i ? 0.12 + r() * 0.2 : 0.04, a = Math.atan2(z, x) || r() * TAU;
      g.rotateY(r() * TAU);
      g.applyMatrix4(new THREE.Matrix4().makeRotationAxis(new V3(-Math.sin(a), 0, Math.cos(a)), -lean));
      g.translate(x, surf(x, z) - 0.012, z);
      gs.push(g);
    });
    return {
      parts: [{ geometry: moss, material: MOSSM(), castShadow: false }, { geometry: merge(gs), material: PM(), castShadow: true }],
      radius: 0, spot: { type: 'mushroom', r: 0.6 }, sink: 0.01,
    };
  }

  /* ---------- watermelon patch ---------- */
  // a whole melon lying along x: rind stripes from the atlas, a creamy spot where it sits on the ground
  function melonGeo(len, dia, seg, rings) {
    const S = soup(), R = dia / 2;
    const P = (i, j) => { const t = i / rings, a = (j / seg) * TAU, k = Math.sqrt(Math.max(0, 1 - Math.pow(t * 2 - 1, 2))) * (1 + 0.03 * Math.sin(a * 3)); return new V3((t - 0.5) * len, R * 0.96 + Math.sin(a) * R * k, Math.cos(a) * R * k); };
    const C = (i, j) => { const a = (j / seg) * TAU; return Math.sin(a) < -0.75 ? L(0xfff0a8) : [1, 1, 1]; };
    const U = (i, j, dj) => cu(UV.rind, (j + dj) / seg, i / rings);
    for (let i = 0; i < rings; i++) for (let j = 0; j < seg; j++) {
      S.quad(P(i, j), P(i + 1, j), P(i + 1, j + 1), P(i, j + 1), C(i, j), C(i + 1, j), C(i + 1, j + 1), C(i, j + 1), U(i, j, 0), U(i + 1, j, 0), U(i + 1, j, 1), U(i, j, 1));
    }
    return S.geo(true);
  }
  function makeMelonpatch() {
    const r = rng(4000), gs = [], leafS = soup(), cols = [], vines = [];
    // runners winding out from the middle along the ground
    for (let k = 0; k < 5; k++) {
      let h = (k / 5) * TAU + r() * 0.5, p = new V3(Math.cos(h) * 0.1, 0.012, Math.sin(h) * 0.1);
      const pts = [p.clone()];
      for (let i = 0; i < 8; i++) { h += (r() - 0.5) * 0.9; p = p.clone().add(new V3(Math.cos(h) * 0.15, 0, Math.sin(h) * 0.15)); pts.push(p); }
      vines.push(pts);
      gs.push(pipe(pts, 0.0065, L(0x4a7a2a), 3));
    }
    // lobed leaves held up on their stalks along the runners
    const lobes = [[0, 1], [0.45, 0.45], [0.9, 0.85], [1.3, 0.42], [1.8, 0.7], [2.25, 0.4], [-2.25, 0.4], [-1.8, 0.7], [-1.3, 0.42], [-0.9, 0.85], [-0.45, 0.45]];
    for (const pts of vines) for (let i = 1; i < pts.length; i++) {
      const base = pts[i], size = 0.12 + r() * 0.06, yaw = r() * TAU, tilt = 0.15 + r() * 0.35, hgt = 0.06 + r() * 0.12;
      const f = new V3(Math.cos(yaw), 0, Math.sin(yaw)), s = new V3(-f.z, 0, f.x), c = base.clone().add(new V3(f.x * size * 0.6, hgt, f.z * size * 0.6));
      ribbon(leafS, [base.clone(), base.clone().add(new V3(f.x * size * 0.2, hgt * 0.7, f.z * size * 0.2)), c.clone().addScaledVector(f, -size * 0.35)], 0.003, () => L(0x5a8a32));
      const pt = (ang, q) => { const p = c.clone().addScaledVector(f, Math.cos(ang) * q * size).addScaledVector(s, Math.sin(ang) * q * size); p.y += Math.cos(ang) * q * size * Math.sin(tilt) + q * q * 0.012; return p; };
      const luv = (ang, q) => cu(UV.vein, 0.5 + Math.sin(ang) * q * 0.5, 0.5 + Math.cos(ang) * q * 0.5);
      const cc = L(0x2c4c1c);
      for (let j = 0; j < lobes.length; j++) {
        const [a0, q0] = lobes[j], [a1, q1] = lobes[(j + 1) % lobes.length];
        const col = (q) => mulc(mixc(cc, mixc(L(0x4a6e2a), L(0x6a7e4a), r() * 0.6), q), 1.1);
        triUp(leafS, c, pt(a0, q0), pt(a1, q1), mulc(cc, 1.1), col(q0), col(q1), luv(0, 0), luv(a0, q0), luv(a1, q1));
      }
    }
    // curly tendrils
    for (let k = 0; k < 4; k++) {
      const b = posAt(vines[k], 0.3 + r() * 0.5), pts = [];
      for (let i = 0; i <= 10; i++) { const t = i / 10, a = t * TAU * 2; pts.push(b.clone().add(new V3(t * 0.06 + Math.cos(a) * 0.012, 0.01 + Math.sin(a) * 0.012, t * 0.02))); }
      ribbon(leafS, pts, 0.0015, () => L(0x6a9a3a));
    }
    // the melons: a big one, a middle one and a young one, each on a short curly stem from a runner
    const MEL = [[0.25, 0.1, 0.42, 0.25, 0.4, 12, 8], [-0.45, -0.3, 0.32, 0.21, 1.9, 10, 7], [0.15, -0.62, 0.17, 0.11, -0.6, 8, 6]];
    for (const [x, z, len, dia, yaw, seg, rings] of MEL) {
      const g = melonGeo(len, dia, seg, rings);
      g.rotateY(yaw); g.translate(x, -0.01, z);
      gs.push(g);
      const e = new V3(Math.cos(yaw) * len * 0.5, dia * 0.6, -Math.sin(yaw) * len * 0.5).add(new V3(x, -0.01, z));
      gs.push(pipe([e, e.clone().add(new V3(Math.cos(yaw) * 0.03, 0.01, -Math.sin(yaw) * 0.03)), e.clone().add(new V3(Math.cos(yaw) * 0.05, -0.02, -Math.sin(yaw) * 0.05 + 0.01))], 0.005, L(0x6a7a3a), 4));
      cols.push({ x, z, r: +Math.max(0.1, len * 0.45).toFixed(3) });
    }
    return {
      parts: [
        { geometry: merge(gs), material: PM(), castShadow: true },
        { geometry: upN(leafS.geo(true), 0.3), material: plantM('melonLeaf', 0, 0.04, FALL38.melon), castShadow: true },
      ],
      radius: 0, colliders: cols, spot: { type: 'watermelon', r: 1.3 }, sink: 0,
    };
  }

  /* ---------- banana plant ---------- */
  function makeBananaplant() {
    const r = rng(4020), stem = [], leafS = soup(), H = 2.35;
    const sp = path([new V3(0, 0, 0), new V3(0.02, H * 0.5, 0.01), new V3(0.04, H, 0.02)], 6);
    stem.push(plain(tube(sp, (i, t) => lerp(0.13, 0.08, t) * (1 + 0.3 * Math.pow(1 - smooth(0, 0.1, t), 2)), {
      radial: 8,
      color: (t, a, p) => {
        const n = fbm(p.x * 6, p.y * 2.5, p.z * 6, 2);
        let c = mixc(L(0x56762e), L(0x6e8a3a), 0.5 + 0.5 * Math.sin(a * 3 + p.y));
        if (n > 0.22) c = mixc(c, L(0x2e3218), 0.7);
        if (t < 0.4 && fbm(p.x * 3 + 5, p.y * 1.2, p.z * 3, 2) > -0.05) c = mixc(c, L(0x7a6040), 0.75 * (1 - t / 0.4));
        return c;
      },
    })));
    const top = sp[sp.length - 1];
    // the paddle leaves: newest up top, oldest lowest and droopiest (with dry brown edges)
    const wf = tab([0, 0.08, 0.5, 0.9, 1], [0.35, 0.9, 1, 0.85, 0.3]);
    for (let k = 0; k < 7; k++) {
      const a = k * 2.4 + r() * 0.3, d = new V3(Math.cos(a), 0, Math.sin(a)), len = 1.5 + r() * 0.4, old = k >= 5;
      const pts = spine(top.clone().addScaledVector(d, 0.05).add(new V3(0, -0.06 * k, 0)), d, len, 1.25 - k * 0.07, -2.0 - k * 0.12 - r() * 0.4, 6);
      leafGrid(leafS, {
        pts, side: new V3(-d.z, 0, d.x), w: (t) => (t < 0.14 ? 0.025 : 0.22 * wf((t - 0.14) / 0.86)), nu: 4, cup: -0.1, ruf: 0.02, rf: 2.5, ph: r() * TAU, cell: UV.vein,
        col: (t, e) => {
          let c = t < 0.14 ? L(0x6a8a3a) : mulc(mixc(L(0x4a8a2c), L(0x346a20), e * 0.5), 1.12);
          if (old) c = mixc(c, L(0x8a7a3a), smooth(0.6, 1, e) * 0.8);
          return c;
        },
      });
    }
    // a dead leaf hanging down the stem
    const dd = new V3(Math.cos(1.1), 0, Math.sin(1.1));
    leafGrid(leafS, { pts: spine(top.clone().addScaledVector(dd, 0.07).add(new V3(0, -0.4, 0)), dd, 0.9, -1.25, -0.25, 4), side: new V3(-dd.z, 0, dd.x), w: (t) => 0.1 * Math.sin(Math.min(1, t + 0.1) * PI), nu: 2, cup: 0.5, cell: UV.vein, col: (t) => mixc(L(0x7a5a32), L(0x5a4026), t) });
    // the rolled up new leaf
    stem.push(pipe([top.clone(), top.clone().add(new V3(0.01, 0.25, 0.02)), top.clone().add(new V3(0.03, 0.48, 0.04))], (i, t) => lerp(0.028, 0.008, t), L(0x8ab84a), 5));
    // the fruit stalk arcs out and hangs down: four hands of bananas curving up, the purple bud at the end
    const pd = path([top.clone().add(new V3(0, -0.05, 0)), top.clone().add(new V3(0.18, 0.12, 0.05)), top.clone().add(new V3(0.36, 0.05, 0.1)), top.clone().add(new V3(0.42, -0.25, 0.12)), top.clone().add(new V3(0.42, -0.7, 0.12))], 9);
    stem.push(pipe(pd, (i, t) => lerp(0.024, 0.016, t), L(0x5a6a2a), 5));
    const fr = tab([0, 0.2, 0.7, 1], [0.008, 0.015, 0.014, 0.005]);
    for (let h = 0; h < 4; h++) {
      const c = posAt(pd, 0.6 + h * 0.1), out0 = Math.atan2(c.z - top.z, c.x - top.x);
      for (let f = 0; f < 5; f++) {
        const a = out0 + (f - 2) * 0.55 + h * 0.3, o = new V3(Math.cos(a), 0, Math.sin(a)), b = c.clone().addScaledVector(o, 0.022);
        const pts = [b, b.clone().addScaledVector(o, 0.05).add(new V3(0, -0.01, 0)), b.clone().addScaledVector(o, 0.1).add(new V3(0, 0.035, 0)), b.clone().addScaledVector(o, 0.115).add(new V3(0, 0.1, 0))];
        stem.push(plain(tube(pts, (i, t) => fr(t), { radial: 4, color: (t) => (t > 0.94 ? L(0x2c2218) : mixc(L(0x8a9a2a), L(0xe8c22a), smooth(0.05, 0.4, t) * (0.75 + 0.25 * (1 - h / 3)))) })));
      }
    }
    const bud = lathe([[0.0005, -0.2], [0.04, -0.13], [0.055, -0.06], [0.04, -0.012], [0.012, 0.0]], 8, (y) => mixc(L(0x4a1424), L(0x7a2a3a), smooth(-0.2, -0.05, y)));
    const end = pd[pd.length - 1];
    bud.translate(end.x, end.y, end.z);
    stem.push(plain(bud));
    return {
      parts: [
        { geometry: merge(stem), material: plantM('banana', 0.06, 0), castShadow: true },
        { geometry: upN(leafS.geo(true), 0.3), material: plantM('bananaLeaf', 0.06, 0.015), castShadow: true },
      ],
      radius: 0.16, spot: { type: 'banana', r: 1.5 }, sink: 0.05,
    };
  }

  Object.assign(PROPS, { sunflower: makeSunflower, birdfeeder: makeBirdfeeder, cornrow: makeCornrow, lettucebed: makeLettucebed, mushrooms: makeMushrooms, melonpatch: makeMelonpatch, bananaplant: makeBananaplant });
  Object.assign(VARIANTS, { sunflower: 2 });

  const FOODS38 = { seeds: foodSeeds, corn: foodCorn, lettuce: foodLettuce, mushroom: foodMushroom, bugs: foodBugs, twigs: foodTwigs, watermelon: foodWatermelon, banana: foodBanana, bread: foodBread, hotdog: foodHotdog, petfood: foodPetfood, hay: foodHay };
  for (const type of Object.keys(FOODS38)) Env.addFood(type, FOODS38[type], type === 'bugs' ? { setup: setupBugs, update: updateBugs } : {});
})();

/* ---------- round 10: nectar, for the butterflies ----------
   Env.food('nectar'): a low clump of purple coneflowers in bloom (the kind of wildflower monarchs drink from): three
   flower heads on short stems, each a domed orange brown cone ringed by drooping pink purple petals, with a few
   lance leaves at the base. About 10 cm tall, so a butterfly standing by it reaches the blooms. */
(() => {
  const K = Env._k;
  const { TAU, V3, rng, L, mixc, prep, paint, merge, soup, path, tube, mat } = K;
  const strip = (S, P, w, c0, c1, side) => {
    for (let k = 0; k < 3; k++) {
      const t0 = k / 3, t1 = (k + 1) / 3, w0 = w(t0), w1 = w(t1), p0 = P(t0), p1 = P(t1), a = mixc(c0, c1, t0), b = mixc(c0, c1, t1);
      S.quad(p0.clone().addScaledVector(side, -w0), p1.clone().addScaledVector(side, -w1), p1.clone().addScaledVector(side, w1), p0.clone().addScaledVector(side, w0), a, b, b, a);
    }
  };
  function foodNectar() {
    const parts = [], r = rng(1031);
    const green = L(0x3e6e2a), greenDk = L(0x2a4e1c);
    for (const [x, z, h, s] of [[0.0, 0.0, 0.1, 1.0], [0.035, -0.025, 0.075, 0.85], [-0.03, 0.03, 0.06, 0.75]]) {
      const top = new V3(x + (r() - 0.5) * 0.012, h, z + (r() - 0.5) * 0.012);
      parts.push(tube(path([new V3(x, 0, z), new V3(x + (top.x - x) * 0.4, h * 0.5, z + (top.z - z) * 0.4), top], 6), 0.0028 * s, { radial: 5, color: () => green }));
      // the cone: a dome of tiny florets, orange brown with darker tips
      const cr = 0.013 * s;
      const cone = prep(new THREE.SphereGeometry(cr, 12, 6, 0, TAU, 0, Math.PI / 2));
      cone.scale(1, 0.85, 1); cone.translate(top.x, top.y, top.z);
      parts.push(paint(cone, (px, py, pz) => mixc(L(0xB0501A), L(0x5A2A10), 0.5 + 0.5 * Math.sin(px * 2200) * Math.sin(pz * 2200))));
      // petals: drooping strips round the cone, magenta at the base to pink at the tip
      const S = soup(), n = 13;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.2, d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x);
        const len = 0.03 * s * (0.9 + r() * 0.2), w = 0.0055 * s;
        const P = (t) => new V3(top.x + d.x * (cr * 0.9 + len * t), top.y - 0.002 - len * (0.15 * t + 0.55 * t * t), top.z + d.z * (cr * 0.9 + len * t));
        strip(S, P, (t) => w * (t >= 1 ? 0.35 : 0.6 + 0.4 * Math.sin(Math.PI * (0.25 + 0.7 * t))), L(0x9A2A6A), L(0xD86AA8), side);
      }
      parts.push(S.geo(true));
    }
    // lance leaves at the foot of the stems
    const S = soup();
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * TAU + 0.5, d = new V3(Math.cos(a), 0, Math.sin(a)), side = new V3(-d.z, 0, d.x), len = 0.07 + r() * 0.02;
      strip(S, (t) => new V3(d.x * len * t, 0.004 + 0.03 * t - 0.03 * t * t, d.z * len * t), (t) => 0.012 * Math.sin(Math.PI * Math.max(0.12, Math.min(t, 0.94))), greenDk, green, side);
    }
    parts.push(S.geo(true));
    return [{ geo: merge(parts.map((g) => prep(g))), mat: mat('f10nectar', { std: true, roughness: 0.6, side: THREE.DoubleSide, sway: 2.0, flutter: 0.003 }) }];
  }
  Env.addFood('nectar', foodNectar);
})();
