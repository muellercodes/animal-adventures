/* ============================================================
   Snow kit: props for the Snowy Mountains world (round 10)
     snowpine   a pine with snow lying on its tiers (the tops of the needle masses go white, the undersides stay dark)
     snowrock   a rock with snow on its top
     icefloe    a flat slab of sea ice floating on the water (3 sizes)
   ============================================================ */
(() => {
  const K = Env._k;
  const { TAU, V3, clamp, lerp, smooth, rng, fbm, L, mixc, mat, PROPS, VARIANTS, soup } = K;

  const SNOW = L(0xd2dae4), SNOW_SH = L(0x9fb0c4);
  // a copy of a prop whose vertex colors go white where snow would settle: on top (ny) and on the lighter (sunlit,
  // upper) faces, with a little noise so it lies in patches
  function snowy(base, o) {
    return (v) => {
      const p = PROPS[base](v);
      const parts = p.parts.map((pt, i) => {
        const g0 = pt.geometry, col = g0.attributes.color;
        if (!col || (o.parts && !o.parts.includes(i))) return pt;
        const g = g0.clone(), C = g.attributes.color.array, N = g.attributes.normal.array, P = g.attributes.position.array;
        for (let k = 0; k < C.length; k += 3) {
          const lum = 0.3 * C[k] + 0.6 * C[k + 1] + 0.1 * C[k + 2];
          const up = smooth(o.ny0, o.ny1, N[k + 1]);
          const lit = o.lum ? smooth(o.lum[0], o.lum[1], lum) : 1;
          const n = fbm(P[k] * o.f + v * 7, P[k + 1] * o.f, P[k + 2] * o.f, 2);
          const s = clamp(up * lit * o.amt * (0.75 + n * 1.2), 0, 1);
          const w = mixc(SNOW_SH, SNOW, clamp(0.5 + N[k + 1] * 0.5, 0, 1));
          C[k] = lerp(C[k], w[0], s); C[k + 1] = lerp(C[k + 1], w[1], s); C[k + 2] = lerp(C[k + 2], w[2], s);
        }
        g.attributes.color.needsUpdate = true;
        return Object.assign({}, pt, { geometry: g });
      });
      return Object.assign({}, p, { parts });
    };
  }
  // the pine's needles (part 1): its tier tops are the lighter green, its undersides darker
  PROPS.snowpine = snowy('pine', { parts: [1], ny0: 0.35, ny1: 0.9, lum: [0.015, 0.05], amt: 0.7, f: 0.9 });
  VARIANTS.snowpine = VARIANTS.pine;
  PROPS.snowrock = snowy('rock', { ny0: 0.25, ny1: 0.7, amt: 1.15, f: 2.2 });
  VARIANTS.snowrock = VARIANTS.rock;
  PROPS.snowbush = snowy('bush', { ny0: 0.3, ny1: 0.85, amt: 0.75, f: 1.6 });
  VARIANTS.snowbush = VARIANTS.bush;

  // sea ice: an irregular flat slab, white on top with a blue-green edge where it meets the water
  function makeIcefloe(v) {
    const r = rng(9100 + v * 31), S = soup();
    const R = [1.4, 2.4, 3.6][v], n = 16, th = 0.22 + v * 0.06, off = r() * 50;
    const rad = (a) => R * (1 + 0.28 * fbm(Math.cos(a) * 1.3 + off, Math.sin(a) * 1.3, 1, 3) + 0.1 * Math.sin(a * 3 + off));
    const ring = (k, y) => { const pts = []; for (let i = 0; i < n; i++) { const a = (i / n) * TAU, rr = rad(a) * k; pts.push(new V3(Math.cos(a) * rr, y, Math.sin(a) * rr)); } return pts; };
    const top = ring(1, th * 0.45), lip = ring(0.94, th * 0.6), mid = ring(0.6, th * 0.62), bot = ring(1.02, -th * 0.55);
    const ctr = new V3(0, th * 0.64, 0);
    const cTop = (p) => mixc(L(0xeef4fa), L(0xdfeaf4), clamp(0.5 + fbm(p.x * 0.6 + off, p.z * 0.6, 2, 2), 0, 1));
    const cEdge = L(0x9fc8d4), cUnder = L(0x5f9aa8);
    const U = [0.5, 0.5];
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      S.tri(ctr, mid[j], mid[i], cTop(ctr), cTop(mid[j]), cTop(mid[i]), U, U, U);
      S.quad(mid[i], mid[j], lip[j], lip[i], cTop(mid[i]), cTop(mid[j]), cTop(lip[j]), cTop(lip[i]), U, U, U, U);
      S.quad(lip[i], lip[j], top[j], top[i], cTop(lip[i]), cTop(lip[j]), mixc(cTop(top[j]), cEdge, 0.25), mixc(cTop(top[i]), cEdge, 0.25), U, U, U, U);
      S.quad(top[i], top[j], bot[j], bot[i], cEdge, cEdge, cUnder, cUnder, U, U, U, U);
    }
    return { parts: [{ geometry: S.geo(true), material: mat('seaIce', { std: true, roughness: 0.35 }), castShadow: false }], radius: 0, sink: 0 };
  }
  PROPS.icefloe = makeIcefloe;
  VARIANTS.icefloe = 3;
})();
