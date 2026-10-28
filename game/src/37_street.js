/* ---------- street kit: street furniture, traffic lights, road and sidewalk materials, park pieces, cars and buses ----------
   Adds to Env. Uses the scenery kit from 35_envkit through Env._k.
   Units are meters, Y up, base at y = 0, fronts face +z. Everything is procedural (geometry, canvas textures, shaders).
   What it adds:
     instanced props (Env.prop): streetlamp, parklamp, trafficpole, bench, parkbench, trashcan, hydrant, mailbox, busstop, planter,
       newsbox (3 colors), bikerack, bollard, picnic, flowerbed (2), statue (2: bear, stag), gazebo, drinking.
       Extra fields on some: colliders [{ x, z, r }] (radius 0 then), light { x, y, z }, mounts (trafficpole), seat, floorY.
       Parts flagged pool: true are additive light pools on the ground that only show at night (skip them if unwanted).
     Env.fountain(), Env.streetTick(dt), Env.signalHead(), Env.setSignal(head, 'r' | 'y' | 'g' | 'off' | 'fr' | 'fy'),
     Env.walkHead(), Env.setWalk(head, true | false | 'flash'), Env.streetMaterials(), Env.townSign(name),
     Env.streetSign(nameA, nameB), Env.roadSign(text, arrow), Env.vehicle(kind, variant), Env.bus(), Env.VEHICLES. */
(() => {
  const K = Env._k;
  const { TAU, V3, clamp, lerp, smooth, rng, strSeed, fbm, L, mixc, mulc, prep, paint, setGlow, setTint, merge, smoothNormals, boxUV,
    eachVertex, place, tube, canvasTex, wrapDraw, gray, mat, TX, PROPS, VARIANTS, boxG, meshOf, roundBox, doorRec, resolveDoors,
    glassMat, rrect, nightU, windU } = K;
  const PI = Math.PI;

  /* ============================================================
     Small geometry helpers
     ============================================================ */
  const C3 = (hex) => L(hex);
  // cylinder (or cone) standing on y = 0 at the origin, radii bottom r0 and top r1
  const cyl = (r0, r1, h, seg, col, open = false) => paint(prep(new THREE.CylinderGeometry(r1, r0, h, seg, 1, open)).translate(0, h / 2, 0), col);
  // cylinder between two points
  function rod(ax, ay, az, bx, by, bz, r, col, seg = 6) { return K.pipeGeo(ax, ay, az, bx, by, bz, r, col, seg); }
  /* lathe around Y from a [r, y] profile (bottom to top). Normals are smooth around the axis; along the profile each
     segment keeps its own normal (crisp edges) unless o.smooth. col: [r,g,b] or fn(y, angle, r, k) -> [r,g,b] */
  function lathe(pts, seg, col, o = {}) {
    const n = pts.length, sn = [];
    for (let k = 0; k < n - 1; k++) {
      const dr = pts[k + 1][0] - pts[k][0], dy = pts[k + 1][1] - pts[k][1], l = Math.hypot(dr, dy) || 1;
      sn.push([dy / l, -dr / l]);
    }
    const P = [], N = [], Cc = [], U = [];
    const a0 = o.phi0 || 0, aL = o.phiLen || TAU;
    let vlen = [0];
    for (let k = 1; k < n; k++) vlen.push(vlen[k - 1] + Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]));
    const nrm = (k, side) => {
      if (!o.smooth) return sn[side ? k - 1 : k];
      const a = sn[k - 1], b = sn[k];
      if (!a) return b; if (!b) return a;
      const x = a[0] + b[0], y = a[1] + b[1], l = Math.hypot(x, y) || 1;
      return [x / l, y / l];
    };
    const push = (k, j, side, jf) => {
      const a = a0 + (j / seg) * aL, r = pts[k][0], y = pts[k][1], nn = nrm(k, side), an = o.facet ? a0 + ((jf + 0.5) / seg) * aL : a;
      P.push(Math.sin(a) * r, y, Math.cos(a) * r);
      N.push(Math.sin(an) * nn[0], nn[1], Math.cos(an) * nn[0]);
      const c = typeof col === 'function' ? col(y, a, r, k) : col || [1, 1, 1];
      Cc.push(c[0], c[1], c[2]);
      U.push((j / seg) * (o.uRep || 1), vlen[k] * (o.vRep || 1));
    };
    for (let k = 0; k < n - 1; k++) for (let j = 0; j < seg; j++) {
      push(k, j, 0, j); push(k, j + 1, 0, j); push(k + 1, j + 1, 1, j);
      push(k, j, 0, j); push(k + 1, j + 1, 1, j); push(k + 1, j, 1, j);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    return g;
  }
  // ellipsoid blob (smooth), optional noise for a sculpted look
  function ell(cx, cy, cz, rx, ry, rz, col, detail = 1, amp = 0, seed = 0) {
    const g = prep(new THREE.IcosahedronGeometry(1, detail));
    eachVertex(g, (v) => {
      v.normalize();
      const k = 1 + amp * fbm(v.x * 1.7 + seed, v.y * 1.7, v.z * 1.7 - seed, 2);
      v.set(cx + v.x * rx * k, cy + v.y * ry * k, cz + v.z * rz * k);
    });
    smoothNormals(g);
    return col ? paint(g, col) : g;
  }
  const tubeC = (pts, r, col, radial = 6, cap) => tube(pts, r, { radial, cap, color: () => col });
  // flat quad facing +z, w x h centered at the origin, with an atlas rect [u0, v0, u1, v1]
  function quadUV(w, h, uv, col = [1, 1, 1]) {
    const g = prep(new THREE.PlaneGeometry(w, h));
    const a = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 2) { a[i] = lerp(uv[0], uv[2], a[i]); a[i + 1] = lerp(uv[1], uv[3], a[i + 1]); }
    return paint(g, col);
  }
  const tris = (g) => (g ? g.attributes.position.count / 3 : 0);
  // a rotated box between two floor-plan points (for rails and slats): from (ax, az) to (bx, bz) at height y
  function railBox(ax, az, bx, bz, y, t, h, col) {
    const len = Math.hypot(bx - ax, bz - az), g = prep(new THREE.BoxGeometry(len, h, t));
    g.rotateY(-Math.atan2(bz - az, bx - ax)); g.translate((ax + bx) / 2, y, (az + bz) / 2);
    return paint(g, col);
  }
  // camera facing cards (same layout as the kit's leaf cards): list of { p, n, c, s, uv: [u0, v0, u1, v1] }
  function cardList(list, r) {
    const V = list.length * 6;
    const P = new Float32Array(V * 3), N = new Float32Array(V * 3), Cc = new Float32Array(V * 3), U = new Float32Array(V * 2), Kc = new Float32Array(V * 2);
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    list.forEach((q, s) => {
      const ang = q.rot != null ? q.rot : (r() - 0.5) * 0.5, ca = Math.cos(ang), sa = Math.sin(ang), uv = q.uv || [0, 0, 1, 1];
      for (let k = 0; k < 6; k++) {
        const v = s * 6 + k, cx = corners[k][0], cy = corners[k][1];
        P[v * 3] = q.p.x; P[v * 3 + 1] = q.p.y; P[v * 3 + 2] = q.p.z;
        N[v * 3] = q.n.x; N[v * 3 + 1] = q.n.y; N[v * 3 + 2] = q.n.z;
        Cc[v * 3] = q.c[0]; Cc[v * 3 + 1] = q.c[1]; Cc[v * 3 + 2] = q.c[2];
        U[v * 2] = lerp(uv[0], uv[2], cx * 0.5 + 0.5); U[v * 2 + 1] = lerp(uv[1], uv[3], cy * 0.5 + 0.5);
        Kc[v * 2] = (cx * ca - cy * sa) * q.s * 0.5; Kc[v * 2 + 1] = (cx * sa + cy * ca) * q.s * 0.5 + (q.lift ? q.s * 0.5 : 0);
      }
    });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('normal', new THREE.BufferAttribute(N, 3));
    g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    g.setAttribute('card', new THREE.BufferAttribute(Kc, 2));
    return g;
  }
  // a kit prop's foliage geometry scaled and moved (leaf card offsets scale too)
  function propFoliage(type, variant, s, x, y, z, keep = 1) {
    const src = Env.prop(type, variant);
    return src.parts.map((pt) => {
      let g = pt.geometry.clone();
      // thin out the leaf cards (every card is 6 vertices with a non zero 'card' offset)
      if (keep < 1 && g.attributes.card) {
        const n = g.attributes.position.count, kc = g.attributes.card.array, keepIdx = [];
        let ci = 0;
        for (let v = 0; v < n; v += 3) {
          const isCard = Math.abs(kc[v * 2]) + Math.abs(kc[v * 2 + 1]) > 1e-6;
          if (!isCard) { keepIdx.push(v); continue; }
          const card = Math.floor(ci++ / 2);
          if ((card * 0.618034) % 1 < keep) keepIdx.push(v);
        }
        const out = new THREE.BufferGeometry();
        for (const name of Object.keys(g.attributes)) {
          const a = g.attributes[name], sz = a.itemSize, arr = new Float32Array(keepIdx.length * 3 * sz);
          keepIdx.forEach((v, i) => arr.set(a.array.subarray(v * sz, (v + 3) * sz), i * 3 * sz));
          out.setAttribute(name, new THREE.BufferAttribute(arr, sz));
        }
        g = out;
      }
      g.scale(s, s, s); g.translate(x, y, z);
      if (g.attributes.card) { const a = g.attributes.card.array; for (let i = 0; i < a.length; i++) a[i] *= s; }
      return { geometry: g, material: pt.material, castShadow: pt.castShadow, depthMaterial: pt.depthMaterial };
    });
  }

  /* ============================================================
     Materials
     ============================================================ */
  const FONT = (n, w = 'bold') => `${w} ${n}px 'Helvetica Neue', Arial, 'Liberation Sans', 'DejaVu Sans', sans-serif`;
  const FONTC = (n) => `bold ${n}px 'Arial Narrow', 'Roboto Condensed', 'Liberation Sans Narrow', 'DejaVu Sans Condensed', Arial, sans-serif`;
  const FONTS = (n) => `bold ${n}px Georgia, 'DejaVu Serif', 'Times New Roman', serif`;
  /* extra shader patches on top of the kit's mat(): o.gloss (sky reflection, strength), o.vcGlow ('night': emissive = vertex
     color * glow attribute * night, 'always': emissive = vertex color * glow attribute, for lit signs and LEDs) */
  const SM = {};
  const GLSL_SKY = `
vec3 stSky(vec3 nV, vec3 vV, float base) {
  vec3 wn = normalize(inverseTransformDirection(nV, viewMatrix));
  vec3 wv = normalize(inverseTransformDirection(vV, viewMatrix));
  vec3 R = reflect(-wv, wn);
  vec3 sky = vec3(0.55, 0.7, 0.9), gnd = vec3(0.12, 0.12, 0.1);
  #if NUM_HEMI_LIGHTS > 0
    sky = hemisphereLights[0].skyColor; gnd = hemisphereLights[0].groundColor * 0.5;
  #endif
  vec3 refl = mix(gnd, sky, smoothstep(-0.15, 0.35, R.y));
  float fres = pow(1.0 - clamp(dot(nV, vV), 0.0, 1.0), 4.0);
  return refl * (base + (1.0 - base) * fres);
}`;
  function smat(key, o = {}, x = {}) {
    if (SM[key]) return SM[key];
    const m = mat('st:' + key, o);
    if (x.gloss || x.vcGlow || x.emissiveMap) {
      const prev = m.onBeforeCompile, prevKey = m.customProgramCacheKey;
      if (x.emissiveMap) m.emissiveMap = x.emissiveMap;
      m.onBeforeCompile = (sh, r) => {
        if (prev) prev.call(m, sh, r);
        if (x.vcGlow) {
          sh.uniforms.stNight = nightU;
          if (!/attribute float glow;/.test(sh.vertexShader)) sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float glow;\nvoid main() {');
          sh.vertexShader = sh.vertexShader.replace('void main() {', 'uniform float stNight;\nvarying float vStGlow;\nvoid main() {');
          sh.vertexShader = sh.vertexShader.replace('#include <color_vertex>', `#include <color_vertex>
  vStGlow = glow * ${x.vcGlow === 'always' ? 'mix(1.0, 1.35, stNight)' : x.vcGlow === 'dim' ? 'mix(0.18, 1.0, stNight)' : 'stNight'};`);
          sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'varying float vStGlow;\nvoid main() {');
          sh.fragmentShader = sh.fragmentShader.replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  totalEmissiveRadiance += diffuseColor.rgb * vStGlow;`);
        }
        if (x.gloss) {
          sh.fragmentShader = sh.fragmentShader.replace('void main() {', GLSL_SKY + '\nvoid main() {');
          sh.fragmentShader = sh.fragmentShader.replace('#include <output_fragment>', `outgoingLight += stSky(normal, normalize(vViewPosition), ${(x.glossBase == null ? 0.25 : x.glossBase).toFixed(3)}) * ${x.gloss.toFixed(3)};
#include <output_fragment>`);
        }
      };
      const sig = 'st|' + (x.gloss ? 'g' + x.gloss + ':' + x.glossBase : '') + (x.vcGlow || '');
      m.customProgramCacheKey = () => (prevKey ? prevKey.call(m) : '') + sig;
    }
    SM[key] = m;
    return m;
  }
  const M = {
    metal: () => smat('metal', { std: true, roughness: 0.5, metalness: 0.25 }),
    steel: () => smat('steel', { map: TX.galv(), std: true, roughness: 0.36, metalness: 0.5 }),
    wood: () => smat('wood', { map: TX.wood() }),
    concrete: () => smat('concrete', { map: TXS.concrete() }),
    stone: () => smat('stone', { map: TX.rock() }),
    soil: () => smat('soil', { map: TX.soil() }),
    lamp: () => smat('lampGlass', { emissive: 0xffd8a0, glow: 'night' }),
    atlas: () => smat('atlas', { map: TXS.atlas() }),
    atlasLit: () => smat('atlasLit', { map: TXS.atlas(), emissive: 0xffffff, glow: 'night' }, { emissiveMap: TXS.atlas() }),
    flowers: () => smat('flowerCards', { map: TXS.flowers(), cards: true, alphaTest: 0.5, sway: 0.5, flutter: 0.01 }),
    shingle: () => smat('shingle', { map: TX.shingle() }),
    paintWood: () => smat('paintWood', { map: TX.wood() }),
    planks: () => smat('planks', { map: TX.planks() }),
    brick: () => smat('brick', { map: TX.brick() }),
  };
  const flowerDepth = () => K.depthMat('st:flowerCards', { map: TXS.flowers(), cards: true, alphaTest: 0.5, sway: 0.5, flutter: 0.01 });

  /* additive pool of lamp light on the ground at night (fades with the fog distance instead of turning fog colored) */
  let poolM = null;
  function poolMat() {
    if (poolM) return poolM;
    poolM = new THREE.MeshBasicMaterial({ map: TXS.pool(), color: K.lcol(0xffc884), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    poolM.onBeforeCompile = (sh) => {
      sh.uniforms.stNight = nightU;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float stNight;\nvoid main() {')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', 'vec4 diffuseColor = vec4( diffuse * stNight * 0.28, opacity );')
        .replace('#include <fog_fragment>', `#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
#endif`);
    };
    poolM.customProgramCacheKey = () => 'st-pool';
    return poolM;
  }
  // flat disc under a lamp: radius rad centered at (x, z), a hair above the ground
  function poolGeo(rad, x, z, y = 0.025, sx = 1) {
    const g = prep(new THREE.CircleGeometry(rad, 28));
    g.rotateX(-PI / 2); g.scale(sx, 1, 1); g.translate(x, y, z);
    return paint(g, [1, 1, 1]);
  }
  const poolPart = (g) => ({ geometry: g, material: poolMat(), castShadow: false, pool: true });

  /* ============================================================
     Textures
     ============================================================ */
  const TXS = {};
  TXS.concrete = () => canvasTex('st_concrete', 256, 256, (c, w, h, r) => {
    c.fillStyle = gray(0.9); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const s = 6 + r() * 30; c.fillStyle = gray(0.84 + r() * 0.16, 0.25); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.arc(X, Y, s, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 2600; i++) { c.fillStyle = r() < 0.5 ? gray(0.62 + r() * 0.2, 0.5) : gray(1, 0.35); const s = 0.6 + r() * 1.4; c.fillRect(r() * w, r() * h, s, s); }
  });
  TXS.pool = () => canvasTex('st_pool', 128, 128, (c, w, h) => {
    const g = c.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, gray(1)); g.addColorStop(0.2, gray(0.8)); g.addColorStop(0.5, gray(0.36)); g.addColorStop(0.75, gray(0.1)); g.addColorStop(1, gray(0));
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }, { clamp: true });
  // flower clump cards: 4 cells (2 x 2), each a dome of small blossoms over leaves, alpha cut; colors are white so
  // the vertex color tints them (cell 0 round blossoms, 1 star blossoms, 2 tall spikes, 3 leafy green)
  TXS.flowers = () => canvasTex('st_flowers', 256, 256, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    const q = 128;
    for (let cell = 0; cell < 4; cell++) {
      const ox = (cell % 2) * q, oy = Math.floor(cell / 2) * q;
      // leaves
      for (let i = 0; i < 46; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 50, x = ox + q / 2 + Math.cos(a) * d, y = oy + q * 0.62 + Math.sin(a) * d * 0.62;
        c.save(); c.translate(x, y); c.rotate(r() * TAU);
        c.fillStyle = `rgba(${40 + r() * 30 | 0},${90 + r() * 50 | 0},${30 + r() * 20 | 0},1)`;
        c.beginPath(); c.ellipse(0, 0, 9 + r() * 6, 3.5 + r() * 2, 0, 0, TAU); c.fill(); c.restore();
      }
      if (cell === 3) continue;
      const n = cell === 2 ? 9 : 34;
      for (let i = 0; i < n; i++) {
        const a = r() * TAU, d = Math.sqrt(r()) * 46, x = ox + q / 2 + Math.cos(a) * d, y = oy + q * 0.55 + Math.sin(a) * d * 0.55;
        const v = 0.78 + r() * 0.22;
        if (cell === 0) {
          c.fillStyle = gray(v * 0.8); c.beginPath(); c.arc(x, y, 6.5, 0, TAU); c.fill();
          c.fillStyle = gray(v); c.beginPath(); c.arc(x - 1, y - 1, 5, 0, TAU); c.fill();
          c.fillStyle = 'rgba(120,90,20,0.8)'; c.beginPath(); c.arc(x, y, 1.6, 0, TAU); c.fill();
        } else if (cell === 1) {
          for (let k = 0; k < 5; k++) { const pa = k / 5 * TAU + i; c.fillStyle = gray(v); c.beginPath(); c.ellipse(x + Math.cos(pa) * 3.5, y + Math.sin(pa) * 3.5, 3.6, 2, pa, 0, TAU); c.fill(); }
          c.fillStyle = 'rgba(240,210,60,1)'; c.beginPath(); c.arc(x, y, 1.8, 0, TAU); c.fill();
        } else {
          const sx = ox + 14 + (i / (n - 1)) * (q - 28), top = oy + 12 + r() * 30, bot = oy + q * 0.78;
          c.strokeStyle = 'rgba(50,100,40,1)'; c.lineWidth = 2; c.beginPath(); c.moveTo(sx, bot); c.lineTo(sx, top); c.stroke();
          for (let y2 = top; y2 < bot - 18; y2 += 4.5) { c.fillStyle = gray(0.75 + r() * 0.25); c.beginPath(); c.ellipse(sx + (r() - 0.5) * 3, y2, 4, 2.6, 0, 0, TAU); c.fill(); }
        }
      }
    }
  }, { clamp: true, srgb: true });

  /* shared atlas for the street furniture (sRGB, 1024 x 1024). R(x, y, w, h) -> uv rect */
  const AW = 1024;
  const R = (x, y, w, h) => [x / AW, 1 - (y + h) / AW, (x + w) / AW, 1 - y / AW];
  const AT = {
    mail: R(0, 0, 512, 150), mailSide: R(0, 150, 512, 110), busFlag: R(512, 0, 512, 300),
    poster0: R(0, 262, 230, 360), poster1: R(232, 262, 230, 360),
    paper0: R(464, 302, 180, 230), paper1: R(646, 302, 180, 230), paper2: R(828, 302, 180, 230),
    mast0: R(464, 540, 180, 46), mast1: R(646, 540, 180, 46), mast2: R(828, 540, 180, 46),
    route: R(0, 626, 300, 120), button: R(304, 626, 120, 160), plaque0: R(428, 626, 220, 120), plaque1: R(652, 626, 220, 120),
    trash: R(0, 790, 256, 90), rules: R(260, 790, 300, 200), fountainSign: R(564, 790, 220, 90),
  };
  TXS.atlas = () => canvasTex('st_atlas', AW, AW, (c, w, h, r) => {
    c.fillStyle = '#808080'; c.fillRect(0, 0, w, h);
    const box = (x, y, bw, bh, col) => { c.fillStyle = col; c.fillRect(x, y, bw, bh); };
    const text = (s, x, y, size, col, font = FONT, align = 'center', maxW = 0) => {
      c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle';
      let fs = size; c.font = font(fs);
      while (maxW && fs > 8 && c.measureText(s).width > maxW) { fs -= 2; c.font = font(fs); }
      c.fillText(s, x, y);
    };
    // mailbox front: blue panel with MAIL in white and a thin white rule
    box(0, 0, 512, 150, '#1d4f91');
    text('MAIL', 256, 70, 104, '#f4f6f8', FONT);
    box(60, 128, 392, 5, '#e8ecf0');
    // mailbox side: pickup times plate and a small mail line
    box(0, 150, 512, 110, '#1d4f91');
    box(150, 162, 212, 86, '#f2f2ee'); for (let i = 0; i < 6; i++) box(166, 174 + i * 12, 100 + r() * 70, 4, '#4a5560');
    text('MAIL', 75, 205, 34, '#f4f6f8'); text('MAIL', 437, 205, 34, '#f4f6f8');
    // bus stop flag: white sign with a bus pictogram, BUS STOP and route numbers
    box(512, 0, 512, 300, '#f6f6f2'); c.lineWidth = 12; c.strokeStyle = '#1f5f9a'; c.strokeRect(518, 6, 500, 288);
    box(530, 18, 476, 82, '#1f5f9a'); text('BUS STOP', 768, 60, 64, '#ffffff', FONT);
    c.fillStyle = '#1e2226'; rrect(c, 640, 120, 250, 110, 16); c.fill();
    box(654, 132, 222, 46, '#e8eef2'); for (let i = 0; i < 4; i++) box(660 + i * 54, 136, 46, 38, '#3a5a72');
    c.fillStyle = '#1e2226'; c.beginPath(); c.arc(690, 236, 18, 0, TAU); c.arc(842, 236, 18, 0, TAU); c.fill();
    c.fillStyle = '#9aa2a8'; c.beginPath(); c.arc(690, 236, 7, 0, TAU); c.arc(842, 236, 7, 0, TAU); c.fill();
    text('12   34   7', 768, 274, 30, '#1f5f9a', FONT);
    // posters for the bus shelter (lit at night): ADOPT A PET with a dog and a cat, and a city park poster
    let g = c.createLinearGradient(0, 262, 0, 622); g.addColorStop(0, '#f6d86a'); g.addColorStop(1, '#f09a3a');
    box(0, 262, 230, 360, g);
    text('ADOPT', 115, 300, 46, '#5a2a10'); text('A PET', 115, 344, 46, '#5a2a10');
    c.fillStyle = '#5a3a24'; c.beginPath(); c.ellipse(80, 480, 42, 30, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(52, 440, 24, 0, TAU); c.fill();
    c.beginPath(); c.ellipse(34, 440, 9, 20, 0.4, 0, TAU); c.fill();
    c.fillStyle = '#2a2a2a'; c.beginPath(); c.ellipse(160, 486, 30, 34, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(160, 438, 22, 0, TAU); c.fill();
    c.beginPath(); c.moveTo(142, 428); c.lineTo(146, 404); c.lineTo(156, 420); c.fill(); c.beginPath(); c.moveTo(178, 428); c.lineTo(174, 404); c.lineTo(164, 420); c.fill();
    c.fillStyle = '#c8302a'; K.rrect(c, 20, 560, 190, 44, 10); c.fill(); text('VISIT THE POUND', 115, 582, 22, '#fff8e8', FONT, 'center', 180);
    g = c.createLinearGradient(0, 262, 0, 622); g.addColorStop(0, '#8ec8ee'); g.addColorStop(0.55, '#d8eef8'); g.addColorStop(0.56, '#5aa040'); g.addColorStop(1, '#2f6a28');
    box(232, 262, 230, 360, g);
    c.fillStyle = '#2f5a24'; for (const [x, y, s] of [[270, 470, 40], [420, 460, 50], [350, 480, 30]]) { c.beginPath(); c.arc(x, y, s, 0, TAU); c.fill(); }
    c.fillStyle = '#e8e2d0'; c.beginPath(); c.ellipse(347, 540, 60, 12, 0, 0, TAU); c.fill();
    c.fillStyle = '#5ab0e0'; c.beginPath(); c.ellipse(347, 536, 46, 7, 0, 0, TAU); c.fill();
    text('CITY PARK', 347, 304, 40, '#1d3f6a'); text('Summer Concerts', 347, 344, 22, '#1d3f6a');
    text('Sundays at 2', 347, 590, 24, '#fff8e0');
    // three newspaper fronts with mastheads
    const papers = ['The Daily', 'Herald', 'Courier'];
    for (let k = 0; k < 3; k++) {
      const x0 = 464 + k * 182;
      box(x0, 302, 180, 230, '#ece8de');
      text(papers[k], x0 + 90, 326, 30, '#1a1a1a', FONTS);
      box(x0 + 8, 344, 164, 2, '#2a2a2a');
      text(['PARK OPENS', 'BIG STORM', 'NEW BUS LINE'][k], x0 + 90, 366, 20, '#1a1a1a', FONT, 'center', 160);
      box(x0 + 10, 382, 90, 64, ['#7a8a96', '#8a7a6a', '#6a8a6a'][k]);
      for (let i = 0; i < 6; i++) box(x0 + 108, 384 + i * 11, 62, 4, '#6a6a66');
      for (let i = 0; i < 7; i++) box(x0 + 10, 456 + i * 11, 160 - r() * 30, 4, '#6a6a66');
      // masthead strip for the box front
      box(x0, 540, 180, 46, ['#b8262a', '#1f4f8a', '#2a6a3a'][k]);
      text(papers[k].toUpperCase(), x0 + 90, 563, 28, '#ffffff', FONT, 'center', 168);
    }
    // route information panel
    box(0, 626, 300, 120, '#f2f2ee'); box(0, 626, 300, 26, '#1f5f9a'); text('ROUTES  12  34  7', 150, 640, 20, '#ffffff');
    for (let i = 0; i < 7; i++) { box(12, 662 + i * 11, 60, 5, '#2a3a4a'); box(84, 662 + i * 11, 200 - r() * 60, 5, '#7a848c'); }
    // push button placard: black with a white arrow and a walking figure
    box(304, 626, 120, 160, '#202224');
    c.fillStyle = '#f2f2f0'; c.beginPath(); c.arc(364, 676, 26, 0, TAU); c.fill();
    c.fillStyle = '#c8a028'; c.beginPath(); c.arc(364, 676, 18, 0, TAU); c.fill();
    c.strokeStyle = '#f2f2f0'; c.lineWidth = 8; c.beginPath(); c.moveTo(326, 746); c.lineTo(396, 746); c.stroke();
    c.fillStyle = '#f2f2f0'; c.beginPath(); c.moveTo(402, 746); c.lineTo(384, 732); c.lineTo(384, 760); c.fill();
    text('PUSH', 364, 716, 18, '#f2f2f0');
    // bronze plaques
    for (let k = 0; k < 2; k++) {
      const x0 = 428 + k * 224;
      g = c.createLinearGradient(x0, 626, x0 + 220, 746); g.addColorStop(0, '#8a6a34'); g.addColorStop(0.5, '#b08a4a'); g.addColorStop(1, '#6a4a24');
      box(x0, 626, 220, 120, g); c.strokeStyle = '#4a3418'; c.lineWidth = 5; c.strokeRect(x0 + 6, 632, 208, 108);
      text(k ? 'THE STAG' : 'THE BEAR', x0 + 110, 662, 30, '#3a2810', FONTS);
      for (let i = 0; i < 3; i++) box(x0 + 30, 690 + i * 13, 160 - i * 30, 4, '#4a3418');
    }
    // trash can band: THANK YOU / LITTER
    box(0, 790, 256, 90, '#24302a'); text('LITTER', 128, 835, 44, '#d8d4c4');
    // park rules sign
    box(260, 790, 300, 200, '#f2efe4'); box(260, 790, 300, 44, '#2f5a3a'); text('CITY PARK', 410, 812, 30, '#f2efe4');
    for (let i = 0; i < 7; i++) { c.fillStyle = '#2f5a3a'; c.beginPath(); c.arc(282, 852 + i * 19, 4, 0, TAU); c.fill(); box(294, 849 + i * 19, 200 - r() * 80, 6, '#4a4a44'); }
    // drinking fountain label
    box(564, 790, 220, 90, '#2a3a4a'); text('DRINKING WATER', 674, 822, 22, '#e8eef2', FONT, 'center', 200); text('people and pets', 674, 854, 18, '#a8c8e0', FONT);
  }, { srgb: true });
  // mipmapped atlas edges bleed; keep it clamped
  const atlasRect = (k) => AT[k];

  /* ============================================================
     Street furniture props (instanced: { parts, radius, ... })
     ============================================================ */
  const DARK = C3(0x22262a), BLACKGREEN = C3(0x1f2a24), GALV = C3(0xa4a8aa), WHITE = C3(0xf2f2ee);

  // city lamp post: galvanized tapered pole with a curved arm and a cobra head luminaire over +z (about 6.2 m)
  function makeStreetlamp() {
    const steel = [], dark = [], lens = [];
    steel.push(lathe([[0.2, 0], [0.2, 0.06], [0.15, 0.1], [0.13, 0.5], [0.105, 0.56], [0.1, 0.6], [0.07, 6.0], [0.06, 6.06], [0, 6.1]], 10, GALV));
    // arm: rises out of the pole top and reaches 1.9 m over +z
    const arm = [new V3(0, 5.55, 0.02), new V3(0, 5.95, 0.2), new V3(0, 6.12, 0.7), new V3(0, 6.16, 1.4), new V3(0, 6.14, 1.75)];
    steel.push(tubeC(K.path(arm, 8), 0.045, GALV, 6));
    // cobra head: smooth shell with a flat lens underneath
    const head = ell(0, 6.1, 2.0, 0.19, 0.1, 0.42, C3(0x8a8e92), 1);
    eachVertex(head, (p) => { if (p.y < 6.07) p.y = 6.07 - (6.07 - p.y) * 0.25; });
    smoothNormals(head);
    steel.push(head);
    dark.push(boxG(0.06, 0.05, 0.14, 0, 6.15, 1.68, C3(0x55595c)));
    const ln = prep(new THREE.CircleGeometry(1, 14)); ln.rotateX(PI / 2); ln.scale(0.15, 1, 0.34); ln.translate(0, 6.058, 2.02);
    lens.push(setGlow(paint(ln, C3(0xdcdad0)), 1.6));
    // footing ring and a small access door on the base
    dark.push(boxG(0.09, 0.2, 0.02, 0, 0.32, 0.135, C3(0x7a7e80)));
    return {
      parts: [
        { geometry: boxUV(merge(steel), 2), material: M.steel(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        poolPart(poolGeo(6.5, 0, 2.0, 0.025, 1)),
      ],
      radius: 0.18, light: { x: 0, y: 6.05, z: 2.0 },
    };
  }
  // park lamp: black fluted cast iron post with a six sided lantern (about 3.6 m)
  function makeParklamp() {
    const iron = [], lens = [];
    const blk = C3(0x1c1f1d);
    iron.push(lathe([[0.2, 0], [0.2, 0.05], [0.17, 0.08], [0.17, 0.16], [0.13, 0.2], [0.12, 0.46], [0.09, 0.52], [0.09, 0.62], [0.07, 0.66]], 12, blk));
    // fluted shaft: 12 sides with alternating shade for the flutes
    iron.push(lathe([[0.062, 0.66], [0.05, 2.9]], 12, (y, a, rr, k) => mulc(blk, Math.floor(a / TAU * 12 + 0.5) % 2 ? 0.75 : 1.25)));
    iron.push(lathe([[0.075, 1.9], [0.075, 1.96]], 12, blk), lathe([[0.06, 2.88], [0.1, 2.94], [0.1, 3.0], [0.07, 3.04]], 12, blk));
    // cross arm (ladder rest) under the lantern
    iron.push(rod(-0.32, 2.72, 0, 0.32, 2.72, 0, 0.018, blk, 5));
    for (const s of [-1, 1]) iron.push(ell(s * 0.33, 2.72, 0, 0.035, 0.035, 0.035, blk, 0));
    // lantern: 6 sided, tapering glass, roof and finial
    const yb = 3.05, yt = 3.5, rb = 0.13, rt = 0.2;
    iron.push(lathe([[0.04, yb - 0.08], [0.15, yb - 0.02], [0.15, yb + 0.02]], 6, blk));
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * TAU + PI / 6;
      iron.push(rod(Math.sin(a) * rb, yb, Math.cos(a) * rb, Math.sin(a) * rt, yt, Math.cos(a) * rt, 0.012, blk, 4));
    }
    lens.push(setGlow(lathe([[rb - 0.008, yb], [rt - 0.008, yt]], 6, C3(0xe6e0cc), { phi0: PI / 6 }), 1.5));
    iron.push(lathe([[rt + 0.03, yt], [rt + 0.05, yt + 0.03], [0.05, yt + 0.2], [0.03, yt + 0.24], [0.04, yt + 0.27], [0, yt + 0.34]], 6, blk, { phi0: PI / 6 }));
    return {
      parts: [
        { geometry: boxUV(merge(iron), 3), material: M.metal(), castShadow: true },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        poolPart(poolGeo(4.5, 0, 0, 0.025, 1)),
      ],
      radius: 0.16, light: { x: 0, y: 3.3, z: 0 },
    };
  }
  // traffic signal pole with a mast arm along +x at 5.5 m (signal heads are separate: Env.signalHead) and a push button box
  function makeTrafficpole() {
    const steel = [], dark = [], atlas = [];
    steel.push(lathe([[0.3, 0], [0.3, 0.05], [0.24, 0.1], [0.2, 0.35], [0.16, 0.42], [0.15, 0.5], [0.12, 6.3], [0.13, 6.32], [0.13, 6.4], [0, 6.46]], 12, GALV));
    // mast arm: tapered, a little upward bow toward the tip, with a clamp plate at the pole
    const arm = [];
    for (let i = 0; i <= 8; i++) { const t = i / 8; arm.push(new V3(0.08 + t * 4.45, 5.5 + Math.sin(t * PI * 0.55) * 0.18, 0)); }
    steel.push(tube(arm, (i, t) => lerp(0.1, 0.055, t), { radial: 8, cap: 'end', color: () => GALV }));
    steel.push(boxG(0.06, 0.5, 0.36, 0.13, 5.5, 0, GALV));
    dark.push(boxG(0.02, 0.42, 0.28, 0.165, 5.5, 0, C3(0x6a6e70)));
    // anchor bolt nuts around the base
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + PI / 4; dark.push(boxG(0.05, 0.05, 0.05, Math.sin(a) * 0.24, 0.075, Math.cos(a) * 0.24, C3(0x4a4c4e))); }
    // push button box facing +z at 1.05 m
    dark.push(boxG(0.13, 0.2, 0.07, 0, 1.08, 0.15, C3(0x2a2c2e)));
    const pb = quadUV(0.11, 0.15, atlasRect('button')); pb.translate(0, 1.08, 0.1855); atlas.push(pb);
    return {
      parts: [
        { geometry: boxUV(merge(steel), 2), material: M.steel(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
      ],
      radius: 0.22,
      // where heads go: arm heads hang under the arm (head origin = its top mount), the pole head and walk heads clamp to the pole
      mounts: { arm: [{ x: 2.4, y: 5.47, z: 0 }, { x: 4.15, y: 5.58, z: 0 }], pole: { x: 0, y: 3.9, z: 0.14 }, walkY: 2.9, poleR: 0.135 },
    };
  }
  // city bench: black steel frame, three part arms, hardwood slats (1.8 m)
  function makeBench() {
    const wood = [], steel = [];
    const W = 1.8, frameC = C3(0x26292b), woodC = C3(0x9a6a44);
    for (let i = 0; i < 4; i++) wood.push(boxG(W, 0.035, 0.085, 0, 0.44, -0.2 + i * 0.105, mulc(woodC, 0.92 + (i % 2) * 0.12)));
    for (let i = 0; i < 3; i++) {
      const y = 0.58 + i * 0.12, z = -0.26 - i * 0.035, g = prep(new THREE.BoxGeometry(W, 0.085, 0.035));
      g.rotateX(-0.22); g.translate(0, y, z); wood.push(paint(g, mulc(woodC, 0.95 + (i % 2) * 0.1)));
    }
    for (const x of [-0.82, 0, 0.82]) {
      const arms = x !== 0;
      steel.push(boxG(0.05, 0.42, 0.05, x, 0.21, 0.16, frameC), boxG(0.05, 0.42, 0.05, x, 0.21, -0.22, frameC));
      steel.push(boxG(0.05, 0.04, 0.48, x, 0.4, -0.03, frameC));
      const bk = prep(new THREE.BoxGeometry(0.05, 0.5, 0.04)); bk.rotateX(-0.22); bk.translate(x, 0.66, -0.29); steel.push(paint(bk, frameC));
      if (arms) { steel.push(boxG(0.06, 0.04, 0.5, x * 1.03, 0.66, -0.04, frameC), boxG(0.04, 0.22, 0.04, x * 1.03, 0.55, 0.18, frameC)); }
    }
    steel.push(boxG(W - 0.1, 0.04, 0.03, 0, 0.12, -0.03, frameC));
    return {
      parts: [
        { geometry: boxUV(merge(wood), 2.5), material: M.wood(), castShadow: true },
        { geometry: merge(steel), material: M.metal(), castShadow: true },
      ],
      radius: 0.55, seat: { y: 0.46, z: 0.0 }, colliders: [{ x: -0.6, z: -0.03, r: 0.33 }, { x: 0, z: -0.03, r: 0.33 }, { x: 0.6, z: -0.03, r: 0.33 }],
    };
  }
  // park bench: cast iron scroll ends in dark green, painted wood slats with a curved back (1.6 m)
  function makeParkbench() {
    const wood = [], iron = [];
    const W = 1.6, ironC = C3(0x1e2b22), woodC = C3(0x7a5432);
    for (let i = 0; i < 5; i++) wood.push(boxG(W, 0.03, 0.07, 0, 0.43 + Math.sin(i / 4 * PI) * 0.008, -0.2 + i * 0.085, mulc(woodC, 0.9 + (i % 2) * 0.12)));
    for (let i = 0; i < 4; i++) {
      const a = -0.18 - i * 0.05, y = 0.55 + i * 0.11, z = -0.27 - i * 0.03 - i * i * 0.006, g = prep(new THREE.BoxGeometry(W, 0.075, 0.03));
      g.rotateX(a); g.translate(0, y, z); wood.push(paint(g, mulc(woodC, 0.92 + (i % 2) * 0.1)));
    }
    for (const x of [-0.74, 0.74]) {
      // scroll end frame: front leg, rear leg sweeping up into the back, curled arm
      const fr = [new V3(x, 0, 0.2), new V3(x, 0.25, 0.17), new V3(x, 0.42, 0.12), new V3(x, 0.6, 0.16), new V3(x, 0.66, 0.06), new V3(x, 0.64, -0.12), new V3(x, 0.66, -0.26)];
      iron.push(tubeC(K.path(fr, 10), 0.025, ironC, 5));
      const bk = [new V3(x, 0, -0.26), new V3(x, 0.2, -0.24), new V3(x, 0.42, -0.24), new V3(x, 0.7, -0.33), new V3(x, 0.92, -0.42)];
      iron.push(tubeC(K.path(bk, 8), 0.028, ironC, 5));
      iron.push(rod(x, 0.4, -0.25, x, 0.4, 0.17, 0.022, ironC, 5));
      iron.push(ell(x, 0.62, 0.17, 0.035, 0.035, 0.035, ironC, 0));
      iron.push(boxG(0.09, 0.03, 0.09, x, 0.015, 0.2, ironC), boxG(0.09, 0.03, 0.09, x, 0.015, -0.26, ironC));
    }
    return {
      parts: [
        { geometry: boxUV(merge(wood), 2.5), material: M.wood(), castShadow: true },
        { geometry: merge(iron), material: M.metal(), castShadow: true },
      ],
      radius: 0.5, seat: { y: 0.45, z: 0.0 }, colliders: [{ x: -0.5, z: -0.03, r: 0.33 }, { x: 0, z: -0.03, r: 0.33 }, { x: 0.5, z: -0.03, r: 0.33 }],
    };
  }
  // city trash can: slatted steel drum with a dome lid and side opening, dark green
  function makeTrashcan() {
    const can = [], inner = [], atlas = [];
    const body = C3(0x24302a), seg = 16;
    // body slats: alternating shade per facet; a gap ring at top and bottom
    can.push(lathe([[0.26, 0.04], [0.29, 0.06], [0.29, 0.12], [0.29, 0.86], [0.3, 0.88]], seg, (y, a) => (y > 0.1 && y < 0.86 ? mulc(body, (Math.floor(a / TAU * seg + 0.5) % 2) ? 0.8 : 1.1) : mulc(body, 0.9))));
    can.push(lathe([[0.3, 0.88], [0.31, 0.92], [0.27, 1.0], [0.2, 1.05], [0.08, 1.08], [0, 1.09]], seg, body, { smooth: true }));
    inner.push(lathe([[0.27, 0.05], [0.27, 0.86]], 10, C3(0x151716)));
    inner.push(boxG(0.28, 0.11, 0.05, 0, 0.94, 0.262, C3(0x0c0d0c)));
    can.push(lathe([[0, 0], [0.24, 0], [0.26, 0.04]], seg, C3(0x2a2c2a)));
    const band = quadUV(0.3, 0.1, atlasRect('trash')); band.translate(0, 0.62, 0.291); atlas.push(band);
    return {
      parts: [
        { geometry: boxUV(merge(can), 3), material: M.metal(), castShadow: true },
        { geometry: merge(inner), material: M.metal(), castShadow: false },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
      ],
      radius: 0.32,
    };
  }
  // fire hydrant: red barrel, bonnet, three outlets with chained caps, operating nut (about 0.8 m)
  function makeHydrant() {
    const red = C3(0xb2211a), cap = C3(0xd8d8d0), g = [];
    g.push(lathe([[0.17, 0], [0.17, 0.04], [0.13, 0.06], [0.12, 0.09]], 10, red));
    g.push(lathe([[0.115, 0.09], [0.11, 0.56], [0.13, 0.58], [0.13, 0.61], [0.12, 0.62]], 10, red));
    g.push(lathe([[0.125, 0.62], [0.12, 0.68], [0.08, 0.74], [0.04, 0.76]], 10, cap, { smooth: true }));
    g.push(lathe([[0.03, 0.76], [0.03, 0.8], [0, 0.81]], 5, cap));
    // pumper outlet to +z, hose outlets to the sides
    const out = (dx, dz, r, len) => {
      const a = Math.atan2(dx, dz), m = cyl(r, r, len, 8, red);
      m.rotateX(PI / 2); m.rotateY(a); m.translate(0, 0.42, 0);
      const c = cyl(r * 1.15, r * 1.15, 0.05, 8, cap); c.rotateX(PI / 2); c.translate(0, 0, len); c.rotateY(a); c.translate(0, 0.42, 0);
      const nut = cyl(r * 0.5, r * 0.5, 0.03, 5, cap); nut.rotateX(PI / 2); nut.translate(0, 0, len + 0.05); nut.rotateY(a); nut.translate(0, 0.42, 0);
      return [m, c, nut];
    };
    g.push(...out(0, 1, 0.07, 0.17), ...out(1, 0, 0.045, 0.16), ...out(-1, 0, 0.045, 0.16));
    return { parts: [{ geometry: merge(g), material: M.metal(), castShadow: true }], radius: 0.18 };
  }
  // blue street mailbox: rounded top, pull down chute, four legs, MAIL on the front and sides
  function makeMailbox() {
    const blue = C3(0x1d4f91), g = [], atlas = [];
    const W = 0.54, D = 0.5, H0 = 0.16, H1 = 1.02;
    g.push(boxG(W, H1 - H0, D, 0, (H0 + H1) / 2, 0, blue));
    // rounded top: half cylinder along z
    // rounded top: a half cylinder along z (the upper half after turning the y axis onto z)
    const top = prep(new THREE.CylinderGeometry(W / 2, W / 2, D, 14, 1, false, -PI / 2, PI));
    top.rotateX(-PI / 2); top.translate(0, H1, 0);
    g.push(paint(top, blue));
    // chute handle on the front top
    g.push(boxG(0.36, 0.1, 0.04, 0, H1 + 0.05, D / 2 + 0.03, mulc(blue, 0.85)), boxG(0.3, 0.025, 0.05, 0, H1 + 0.1, D / 2 + 0.05, C3(0x9aa4ae)));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.push(boxG(0.05, H0 + 0.02, 0.05, sx * (W / 2 - 0.04), (H0 + 0.02) / 2, sz * (D / 2 - 0.04), mulc(blue, 0.8)));
    g.push(boxG(W + 0.02, 0.03, D + 0.02, 0, H0, 0, mulc(blue, 0.85)));
    const f = quadUV(0.46, 0.135, atlasRect('mail')); f.translate(0, 0.78, D / 2 + 0.002); atlas.push(f);
    for (const s of [-1, 1]) { const q = quadUV(0.44, 0.095, atlasRect('mailSide')); q.rotateY(s * PI / 2); q.translate(s * (W / 2 + 0.002), 0.74, 0); atlas.push(q); }
    return {
      parts: [
        { geometry: merge(g), material: M.metal(), castShadow: true },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
      ],
      radius: 0.36,
    };
  }
  // bus shelter: 3.5 x 1.5 m, glass back and sides, roof with a lit fascia, bench, lit poster panel, BUS STOP flag pole
  function makeBusstop() {
    const steel = [], dark = [], glass = [], atlas = [], lit = [], lens = [];
    const W = 3.5, D = 1.5, H = 2.45, fr = C3(0x3a4044), hw = W / 2, hd = D / 2;
    // posts (back corners, back middle, front corners) and roof frame
    for (const [x, z] of [[-hw, -hd], [hw, -hd], [0, -hd], [-hw, hd], [hw, hd]]) steel.push(boxG(0.08, H, 0.08, x, H / 2, z, fr));
    for (const z of [-hd, hd]) steel.push(boxG(W, 0.08, 0.08, 0, H - 0.04, z, fr));
    steel.push(boxG(W, 0.05, 0.05, 0, 0.12, -hd, fr));
    for (const x of [-hw, hw]) steel.push(boxG(0.08, 0.08, D, x, H - 0.04, 0, fr), boxG(0.05, 0.05, D, x, 0.12, 0, fr));
    // roof: thin slab sloping to the back, with a deep front fascia
    const roof = prep(new THREE.BoxGeometry(W + 0.3, 0.06, D + 0.4)); roof.rotateX(-0.05); roof.translate(0, H + 0.06, 0.05); dark.push(paint(roof, C3(0x5a6066)));
    dark.push(boxG(W + 0.3, 0.26, 0.06, 0, H + 0.02, hd + 0.25, C3(0x2c3236)));
    // glass: back in two panes, two side panes (open 0.1 m at the bottom, frame at the top)
    for (const [x0, x1] of [[-hw, 0], [0, hw]]) glass.push(K.vPanel(x0 + 0.04, -hd, x1 - 0.04, -hd, 0.15, H - 0.08));
    for (const x of [-hw, hw]) glass.push(K.vPanel(x, -hd + 0.04, x, hd - 0.04, 0.15, H - 0.08));
    // bench along the back: perforated steel seat on two brackets
    dark.push(boxG(2.0, 0.04, 0.38, 0.35, 0.47, -hd + 0.24, C3(0x8a9096)));
    for (const x of [-0.5, 1.2]) dark.push(boxG(0.05, 0.45, 0.3, x, 0.23, -hd + 0.2, fr));
    // poster panel on the -x end (both faces lit at night) in a frame
    steel.push(boxG(0.12, 1.75, 1.2, -hw - 0.08, 1.2, -0.05, fr));
    for (const s of [-1, 1]) { const q = quadUV(1.05, 1.62, atlasRect(s > 0 ? 'poster1' : 'poster0')); q.rotateY(s * PI / 2); q.translate(-hw - 0.08 + s * 0.062, 1.2, -0.05); lit.push(setGlow(q, 0.9)); }
    // route map on the back pane, inside
    const rt = quadUV(0.75, 0.3, atlasRect('route')); rt.translate(-1.1, 1.55, -hd + 0.02); atlas.push(rt);
    // light strip under the roof
    lens.push(setGlow(boxG(2.6, 0.03, 0.12, 0, H - 0.03, 0, C3(0xe8e6de)), 1.3));
    // BUS STOP flag on its own pole at the front right corner
    steel.push(lathe([[0.04, 0], [0.04, 2.9], [0, 2.92]], 8, GALV));
    const fx = hw + 0.35, fz = hd + 0.2;
    steel[steel.length - 1].translate(fx, 0, fz);
    const flag = boxG(0.72, 0.43, 0.02, fx, 2.55, fz + 0.06, WHITE); dark.push(flag);
    for (const s of [-1, 1]) { const q = quadUV(0.7, 0.41, atlasRect('busFlag')); if (s < 0) q.rotateY(PI); q.translate(fx, 2.55, fz + 0.06 + s * 0.0115); atlas.push(q); }
    const glassPart = { geometry: merge(glass), material: glassMat(), castShadow: false, depthMaterial: null };
    const colliders = [];
    for (let x = -hw; x <= hw + 0.01; x += 0.5) colliders.push({ x, z: -hd, r: 0.22 });
    for (const x of [-hw - 0.08, hw]) for (let z = -hd + 0.5; z < hd; z += 0.5) colliders.push({ x, z, r: 0.22 });
    colliders.push({ x: fx, z: fz, r: 0.12 });
    return {
      parts: [
        { geometry: merge(steel), material: M.metal(), castShadow: true },
        { geometry: boxUV(merge(dark), 2), material: M.metal(), castShadow: true },
        glassPart,
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
        { geometry: merge(lit), material: M.atlasLit(), castShadow: false },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        poolPart(poolGeo(3.2, 0, 0.3, 0.025, 1.3)),
      ],
      radius: 0, colliders, seat: { x: 0.35, y: 0.49, z: -hd + 0.24 }, wait: { x: 0, z: hd + 0.6 }, flag: { x: fx, z: fz },
    };
  }
  // concrete planter (1 m square) with a chamfered lip and a small shrub
  function makePlanter() {
    const con = [], soil = [];
    const S = 1.0, H = 0.55, cc = C3(0xb4aea2);
    const box = lathe([[0.5 * Math.SQRT2 * 0.95, 0], [0.5 * Math.SQRT2 * 0.95, 0.05], [0.5 * Math.SQRT2, 0.08], [0.5 * Math.SQRT2, H - 0.05], [0.53 * Math.SQRT2, H - 0.02], [0.53 * Math.SQRT2, H], [0.44 * Math.SQRT2, H], [0.42 * Math.SQRT2, H - 0.08]], 4, (y) => mulc(cc, 0.85 + 0.15 * smooth(0, 0.4, y)), { phi0: PI / 4, facet: true });
    con.push(box);
    const sl = prep(new THREE.CircleGeometry(0.42 * Math.SQRT2, 4, PI / 4)); sl.rotateX(-PI / 2); sl.translate(0, H - 0.08, 0); soil.push(paint(sl, C3(0x4a3a2a)));
    const parts = [
      { geometry: boxUV(merge(con), 1.5), material: M.concrete(), castShadow: true },
      { geometry: boxUV(merge(soil), 1.2), material: M.soil(), castShadow: false },
      ...propFoliage('bush', 1, 0.62, 0, H - 0.1, 0, 0.55),
    ];
    return { parts, radius: 0.62 };
  }
  // newspaper box: steel cabinet with a window showing the front page, coin box, on a pedestal (3 colors)
  function makeNewsbox(v) {
    const g = [], atlas = [], dark = [];
    const col = [C3(0xb8262a), C3(0x1f4f8a), C3(0x2a6a3a)][v];
    const W = 0.5, D = 0.45, y0 = 0.36, y1 = 1.05;
    g.push(boxG(W, y1 - y0, D, 0, (y0 + y1) / 2, 0, col));
    g.push(boxG(W + 0.03, 0.04, D + 0.03, 0, y1 + 0.02, 0, mulc(col, 0.8)));
    dark.push(boxG(0.3, 0.32, 0.05, 0, 0.18, -0.02, C3(0x3a3c3e)), boxG(0.42, 0.03, 0.36, 0, 0.015, -0.02, C3(0x3a3c3e)));
    // window frame and paper
    dark.push(boxG(0.4, 0.34, 0.012, 0, 0.8, D / 2 + 0.004, C3(0x2a2c2e)));
    const p = quadUV(0.36, 0.3, atlasRect('paper' + v)); p.translate(0, 0.8, D / 2 + 0.012); atlas.push(p);
    const m = quadUV(0.46, 0.11, atlasRect('mast' + v)); m.translate(0, 0.53, D / 2 + 0.002); atlas.push(m);
    dark.push(boxG(0.12, 0.04, 0.03, 0, 0.63, D / 2 + 0.015, C3(0x9aa0a6)), boxG(0.1, 0.16, 0.06, 0.17, 1.0, 0.06, C3(0x8a9096)));
    return {
      parts: [
        { geometry: merge(g), material: M.metal(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
      ],
      radius: 0.3,
    };
  }
  // bike rack: three galvanized inverted U hoops on a flat bar (2.4 m)
  function makeBikerack() {
    const g = [];
    for (const x of [-0.9, 0, 0.9]) {
      const pts = [];
      for (let i = 0; i <= 10; i++) {
        const t = i / 10;
        if (t < 0.3) pts.push(new V3(x, t / 0.3 * 0.62, -0.32));
        else if (t > 0.7) pts.push(new V3(x, (1 - t) / 0.3 * 0.62, 0.32));
        else { const a = (t - 0.3) / 0.4 * PI; pts.push(new V3(x, 0.62 + Math.sin(a) * 0.22, -Math.cos(a) * 0.32)); }
      }
      g.push(tubeC(pts, 0.026, GALV, 6));
    }
    g.push(boxG(2.1, 0.02, 0.08, 0, 0.01, -0.32, GALV), boxG(2.1, 0.02, 0.08, 0, 0.01, 0.32, GALV));
    return { parts: [{ geometry: boxUV(merge(g), 3), material: M.steel(), castShadow: true }], radius: 0, colliders: [{ x: -0.9, z: 0, r: 0.3 }, { x: 0, z: 0, r: 0.3 }, { x: 0.9, z: 0, r: 0.3 }] };
  }
  // steel bollard with a domed top and a reflective band
  function makeBollard() {
    const c = C3(0x2c2f31);
    const g = lathe([[0.11, 0], [0.11, 0.02], [0.1, 0.04], [0.1, 0.74], [0.1, 0.8], [0.1, 0.84], [0.09, 0.88], [0.05, 0.92], [0, 0.93]], 12, (y) => (y > 0.75 && y < 0.83 ? C3(0xd8d2a0) : c), { smooth: false });
    return { parts: [{ geometry: g, material: M.metal(), castShadow: true }], radius: 0.13 };
  }
  // wooden picnic table with attached benches (1.8 m)
  function makePicnic() {
    const w = [], r = rng(77), wc = () => mulc(C3(0x8a6a4a), 0.85 + r() * 0.25);
    const L2 = 1.8;
    for (let i = 0; i < 5; i++) w.push(boxG(L2, 0.045, 0.14, 0, 0.76, -0.3 + i * 0.15, wc()));
    for (const s of [-1, 1]) {
      for (let i = 0; i < 2; i++) w.push(boxG(L2, 0.045, 0.13, 0, 0.45, s * (0.6 + i * 0.14), wc()));
      w.push(boxG(0.07, 0.1, 1.55, s * 0.6, 0.4, 0, wc()));
      for (const t of [-1, 1]) {
        const lg = prep(new THREE.BoxGeometry(0.07, 0.86, 0.12)); lg.rotateX(t * 0.5); lg.translate(s * 0.6, 0.38, t * 0.2); w.push(paint(lg, wc()));
      }
      w.push(boxG(0.07, 0.06, 0.75, s * 0.6, 0.71, 0, wc()));
    }
    w.push(boxG(1.25, 0.06, 0.07, 0, 0.3, 0, wc()));
    return { parts: [{ geometry: boxUV(merge(w), 2.5), material: M.wood(), castShadow: true }], radius: 0.95 };
  }
  // round raised flower bed about 3 m across: stone curb wall, soil, rings of flowers around a little shrub (2 color schemes)
  function makeFlowerbed(v) {
    const r = rng(500 + v), stone = [], soil = [], cards = [];
    const R0 = 1.5, wallH = 0.32, seg = 28;
    stone.push(lathe([[R0 - 0.02, 0], [R0, 0.02], [R0, wallH - 0.04], [R0 - 0.03, wallH], [R0 - 0.2, wallH], [R0 - 0.22, wallH - 0.06]], seg, (y, a) => mulc(C3(0xa8a090), 0.8 + 0.25 * (0.5 + 0.5 * Math.sin(a * 9 + Math.sin(a * 3) * 2)))));
    // soil mound
    const sm = lathe([[R0 - 0.2, wallH - 0.06], [R0 * 0.6, wallH + 0.05], [R0 * 0.25, wallH + 0.14], [0, wallH + 0.16]], seg, C3(0x4a3826), { smooth: true });
    soil.push(sm);
    const schemes = [
      [[0xf6f4f0, 1], [0xe8433a, 0], [0xf4a020, 0], [0x9a4ac8, 2]],
      [[0xf0a0c8, 1], [0xf6e050, 0], [0x6a5ae8, 1], [0xe8f0f8, 2]],
    ][v];
    const cellUV = (k) => [(k % 2) * 0.5, k < 2 ? 0.5 : 0, (k % 2) * 0.5 + 0.5, k < 2 ? 1 : 0.5];
    const ring = (rad, n, size, scheme, hy) => {
      for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + r() * 0.2, d = rad + (r() - 0.5) * 0.12;
        const y = wallH + 0.16 * (1 - Math.pow(d / (R0 - 0.2), 2)) + hy;
        const c = mulc(C3(scheme[0]), 0.85 + r() * 0.3);
        cards.push({ p: new V3(Math.cos(a) * d, y + size * 0.3, Math.sin(a) * d), n: new V3(Math.cos(a) * 0.4, 0.9, Math.sin(a) * 0.4).normalize(), c, s: size, uv: cellUV(scheme[1]) });
        if (r() < 0.5) cards.push({ p: new V3(Math.cos(a) * d, y + size * 0.15, Math.sin(a) * d), n: new V3(0, 1, 0), c: mulc(C3(0x3a6a2a), 0.9 + r() * 0.3), s: size * 1.1, uv: cellUV(3) });
      }
    };
    ring(1.15, 26, 0.38, schemes[0], 0);
    ring(0.85, 20, 0.44, schemes[1], 0.02);
    ring(0.55, 14, 0.5, schemes[2], 0.05);
    ring(0.22, 6, 0.62, schemes[3], 0.12);
    const parts = [
      { geometry: boxUV(merge(stone), 2), material: M.stone(), castShadow: true },
      { geometry: boxUV(merge(soil), 1.2), material: M.soil(), castShadow: false },
      { geometry: cardList(cards, r), material: M.flowers(), castShadow: true, depthMaterial: flowerDepth() },
    ];
    return { parts, radius: 1.55 };
  }
  /* stone statue on a plinth: v0 a bear standing on all fours, v1 a stag. Granite plinth with a bronze plaque. */
  function animalGeo(v) {
    const g = [];
    if (v === 0) {
      // bear: heavy body with a shoulder hump, low head, short thick legs
      g.push(ell(0, 0.78, -0.05, 0.36, 0.34, 0.62, null, 2, 0.05, 1));
      g.push(ell(0, 0.92, 0.22, 0.34, 0.33, 0.36, null, 2, 0.05, 2));
      g.push(ell(0, 0.8, 0.62, 0.2, 0.2, 0.22, null, 2, 0.04, 3));
      g.push(ell(0, 0.72, 0.8, 0.1, 0.09, 0.13, null, 1, 0.02, 4));
      for (const s of [-1, 1]) g.push(ell(s * 0.13, 0.98, 0.58, 0.055, 0.06, 0.03, null, 1, 0, 5));
      for (const [x, z, fr] of [[-0.2, 0.32, 1], [0.2, 0.32, 1], [-0.2, -0.42, 0], [0.2, -0.42, 0]]) {
        g.push(tube([new V3(x, 0.78, z), new V3(x * 1.05, 0.45, z + (fr ? 0.02 : -0.02)), new V3(x * 1.05, 0.06, z + 0.04)], (i, t) => lerp(0.14, 0.1, t), { radial: 8, cap: 'both' }));
        g.push(ell(x * 1.05, 0.05, z + 0.09, 0.1, 0.05, 0.14, null, 1, 0, 6));
      }
      g.push(ell(0, 0.86, -0.64, 0.08, 0.07, 0.06, null, 1, 0, 7));
    } else {
      // stag: slim body, long legs, raised neck and head, branching antlers
      g.push(ell(0, 1.02, 0, 0.2, 0.25, 0.52, null, 2, 0.03, 1));
      g.push(ell(0, 1.08, 0.36, 0.2, 0.24, 0.2, null, 1, 0.02, 2));
      g.push(tube([new V3(0, 1.15, 0.42), new V3(0, 1.38, 0.55), new V3(0, 1.58, 0.62)], (i, t) => lerp(0.13, 0.085, t), { radial: 8 }));
      g.push(ell(0, 1.64, 0.68, 0.085, 0.09, 0.13, null, 1, 0, 3));
      g.push(ell(0, 1.6, 0.84, 0.05, 0.05, 0.1, null, 1, 0, 4));
      for (const s of [-1, 1]) {
        g.push(ell(s * 0.1, 1.74, 0.62, 0.03, 0.075, 0.02, null, 1, 0, 5));
        const base = new V3(s * 0.05, 1.72, 0.66);
        const main = [base, new V3(s * 0.16, 1.9, 0.6), new V3(s * 0.26, 2.08, 0.5), new V3(s * 0.3, 2.24, 0.42)];
        g.push(tube(K.path(main, 6), (i, t) => lerp(0.022, 0.01, t), { radial: 5, cap: 'end' }));
        for (const [k, dx, dy, dz] of [[1, 0.02, 0.14, 0.12], [2, -0.06, 0.16, 0.06], [2, 0.08, 0.12, -0.04]]) {
          const p = main[k].clone();
          g.push(tube([p, p.clone().add(new V3(s * dx, dy, dz))], (i, t) => lerp(0.014, 0.007, t), { radial: 4, cap: 'end' }));
        }
      }
      for (const [x, z] of [[-0.11, 0.32], [0.11, 0.3], [-0.11, -0.38], [0.11, -0.36]]) {
        const back = z < 0;
        g.push(tube([new V3(x, 0.95, z), new V3(x, 0.62, z + (back ? -0.08 : 0.02)), new V3(x, 0.35, z + (back ? 0.02 : 0)), new V3(x, 0.04, z + 0.02)], (i, t) => lerp(back ? 0.085 : 0.06, 0.03, t), { radial: 6 }));
        g.push(ell(x, 0.035, z + 0.04, 0.035, 0.035, 0.045, null, 0, 0, 8));
      }
      g.push(ell(0, 1.12, -0.52, 0.05, 0.07, 0.04, null, 1, 0, 9));
    }
    // weathered stone: darker in hollows and on the lower side, streaks
    const m = merge(g.map((x) => prep(x)));
    return paint(m, (x, y, z, nx, ny) => mulc(C3(0xc8c2b4), clamp(0.72 + 0.18 * ny + 0.12 * fbm(x * 6, y * 6, z * 6, 2) - 0.08 * smooth(0.6, -0.2, y - 0.6), 0.45, 1.05)));
  }
  function makeStatue(v) {
    const st = [], atlas = [];
    const gran = (y) => mulc(C3(0x8e8a84), 0.9 + 0.1 * Math.sin(y * 7));
    st.push(boxG(1.7, 0.2, 1.7, 0, 0.1, 0, gran(0)), boxG(1.45, 0.18, 1.45, 0, 0.29, 0, gran(0.3)));
    st.push(boxG(1.15, 1.0, 1.15, 0, 0.88, 0, C3(0x9a958c)));
    st.push(boxG(1.3, 0.12, 1.3, 0, 1.44, 0, gran(1.4)));
    const animal = animalGeo(v);
    animal.translate(0, 1.5, v === 0 ? 0.05 : -0.05);
    st.push(animal);
    const pl = quadUV(0.62, 0.34, atlasRect('plaque' + v)); pl.translate(0, 0.95, 0.577); atlas.push(pl);
    return {
      parts: [
        { geometry: boxUV(merge(st), 1.4), material: M.stone(), castShadow: true },
        { geometry: merge(atlas), material: smat('bronzeAtlas', { map: TXS.atlas(), std: true, roughness: 0.4, metalness: 0.5 }), castShadow: false },
      ],
      radius: 0.95,
    };
  }
  /* park bandstand: octagonal, about 7 m across, raised deck (floorY 0.36) with two steps on +z, white posts and railings,
     shingled roof with a cupola. Walk in through the open +z side. Colliders for the posts and the railings. */
  function makeGazebo() {
    const white = [], stone = [], deck = [], roof = [], dark = [];
    const RO = 3.5, RP = 3.2, FY = 0.36, PH = 2.75, RE = 3.75, wc = C3(0xf2f0ea);
    const ang = (i) => (i / 8) * TAU + PI / 8;   // vertices: a face is centered on +z (between vertices 7 and 0)
    const P = (r, i) => [Math.sin(ang(i)) * r, Math.cos(ang(i)) * r];
    // base: stone skirt and wood deck
    stone.push(lathe([[RO + 0.02, 0], [RO, FY - 0.04], [RO + 0.06, FY - 0.02]], 8, C3(0xa09a90), { phi0: PI / 8, facet: true }));
    const dk = prep(new THREE.CircleGeometry(RO + 0.06, 8, PI / 2 - PI / 8)); dk.rotateX(-PI / 2); dk.translate(0, FY, 0);
    deck.push(paint(dk, C3(0x9a7a5a)));
    // steps on the +z face (the face between vertex 7 and 0 has its center on +z)
    const fz = RO * Math.cos(PI / 8);
    for (let k = 0; k < 2; k++) stone.push(boxG(1.9, FY / 2 * (k + 1) + 0.0, 0.34, 0, FY / 4 * (k + 1), fz + 0.17 + (1 - k) * 0.34, C3(0xaaa49a)));
    // posts at the 8 vertices, brackets, top beam ring
    const colliders = [];
    for (let i = 0; i < 8; i++) {
      const [x, z] = P(RP, i);
      white.push(boxG(0.16, PH, 0.16, x, FY + PH / 2, z, wc));
      white.push(boxG(0.24, 0.12, 0.24, x, FY + 0.06, z, wc));
      colliders.push({ x, z, r: 0.2 });
      const [x2, z2] = P(RP, i + 1);
      white.push(railBox(x, z, x2, z2, FY + PH - 0.05, 0.12, 0.22, wc));
      // diagonal braces from the posts up to the beam, both ends of each face
      for (const t of [0.14, 0.86]) {
        const e = t < 0.5 ? 0.0 : 1.0;
        white.push(rod(lerp(x, x2, e), FY + PH - 0.5, lerp(z, z2, e), lerp(x, x2, t), FY + PH - 0.12, lerp(z, z2, t), 0.028, wc, 4));
      }
      // railing with balusters on every face but the entrance (+z face: between vertex 7 and 0)
      if (i === 7) continue;
      white.push(railBox(x, z, x2, z2, FY + 0.92, 0.09, 0.06, wc), railBox(x, z, x2, z2, FY + 0.12, 0.08, 0.06, wc));
      const len = Math.hypot(x2 - x, z2 - z), nb = Math.floor(len / 0.16);
      for (let b = 1; b < nb; b++) { const t = b / nb; white.push(boxG(0.035, 0.76, 0.035, lerp(x, x2, t), FY + 0.52, lerp(z, z2, t), wc)); }
      for (let b = 1; b < 4; b++) { const t = b / 4; colliders.push({ x: lerp(x, x2, t), z: lerp(z, z2, t), r: 0.32 }); }
    }
    // roof: octagonal pyramid with shingles, a dark ceiling under it, fascia, cupola and finial
    const ye = FY + PH + 0.05, yr = ye + 1.65;
    const top = [], under = [];
    const roofC = C3(0x55595e);
    for (let i = 0; i < 8; i++) {
      const [x0, z0] = P(RE, i), [x1, z1] = P(RE, i + 1);
      const a = new V3(x0, ye, z0), b = new V3(x1, ye, z1), c = new V3(0, yr, 0);
      const s = K.soup(); const sl = Math.hypot(RE, yr - ye) * 0.83, w2 = Math.hypot(x1 - x0, z1 - z0) * 0.83;
      s.tri(a, c, b, roofC, roofC, roofC, [0, 0], [w2 / 2, sl], [w2, 0]);
      top.push(s.geo(false));
      const u = K.soup(); u.tri(a, b, c, C3(0xe8e4da)); under.push(u.geo(false));
      dark.push(railBox(x0, z0, x1, z1, ye - 0.04, 0.06, 0.16, wc));
    }
    // fix the winding of the top: faces must point outward
    const tg = merge(top); tg.computeVertexNormals();
    let flip = false; { const n = tg.attributes.normal.array; if (n[1] < 0) flip = true; }
    if (flip) { const p = tg.attributes.position.array, u = tg.attributes.uv.array; for (let t = 0; t < p.length; t += 9) for (let k = 0; k < 3; k++) { const a = p[t + 3 + k]; p[t + 3 + k] = p[t + 6 + k]; p[t + 6 + k] = a; } for (let t = 0; t < u.length; t += 6) for (let k = 0; k < 2; k++) { const a = u[t + 2 + k]; u[t + 2 + k] = u[t + 4 + k]; u[t + 4 + k] = a; } tg.computeVertexNormals(); }
    roof.push(tg);
    white.push(lathe([[0.42, yr - 0.35], [0.42, yr + 0.25]], 8, wc, { phi0: PI / 8, facet: true }));
    for (let i = 0; i < 8; i++) { const [x, z] = P(0.43, i); dark.push(boxG(0.06, 0.3, 0.06, x, yr - 0.05, z, C3(0x2a2c2e))); }
    roof.push(lathe([[0.56, yr + 0.25], [0.0, yr + 0.75]], 8, roofC, { phi0: PI / 8, facet: true, uRep: 3, vRep: 1.5 }));
    white.push(lathe([[0.05, yr + 0.72], [0.07, yr + 0.85], [0.0, yr + 1.0]], 6, C3(0xd8c070)));
    const ceil = merge(under);
    // lamp in the middle of the ceiling
    const lens = [setGlow(ell(0, ye + 0.45, 0, 0.16, 0.16, 0.16, C3(0xeee6d0), 1), 1.4)];
    dark.push(rod(0, ye + 0.6, 0, 0, yr - 0.3, 0, 0.012, C3(0x2a2a2a), 4));
    return {
      parts: [
        { geometry: boxUV(merge(white), 2), material: M.paintWood(), castShadow: true },
        { geometry: boxUV(merge(stone), 1.2), material: M.stone(), castShadow: true },
        { geometry: boxUV(merge(deck), 0.9), material: M.planks(), castShadow: false },
        { geometry: merge(roof), material: M.shingle(), castShadow: true },
        { geometry: merge([ceil, ...dark]), material: M.metal(), castShadow: false },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        poolPart(poolGeo(3.2, 0, 0, FY + 0.02, 1)),
      ],
      radius: 0, colliders, floorY: FY, entrance: { x: 0, z: fz + 0.9, w: 1.9 }, inner: RP - 0.2,
    };
  }
  // drinking fountain: concrete pedestal with a stainless bowl and a low pet bowl at the foot
  function makeDrinking() {
    const con = [], steel = [], atlas = [], water = [];
    con.push(lathe([[0.3, 0], [0.3, 0.04], [0.2, 0.08], [0.16, 0.12], [0.15, 0.78], [0.2, 0.82]], 10, C3(0xb0aaa0)));
    steel.push(lathe([[0.2, 0.82], [0.26, 0.86], [0.27, 0.92], [0.24, 0.93], [0.17, 0.88], [0.04, 0.86], [0, 0.86]], 14, C3(0xc8ccd0)));
    steel.push(rod(0, 0.9, 0.0, 0, 0.98, 0.04, 0.015, C3(0xd0d4d8), 6), boxG(0.05, 0.05, 0.05, 0.22, 0.9, 0.0, C3(0xb8bcc0)));
    // pet bowl at the foot, toward +z
    steel.push(lathe([[0.0, 0.0], [0.17, 0.0], [0.19, 0.09], [0.16, 0.09], [0.14, 0.03], [0.0, 0.03]], 12, C3(0xc0c4c8)));
    steel[steel.length - 1].translate(0, 0, 0.42);
    steel.push(rod(0, 0.22, 0.15, 0, 0.26, 0.38, 0.012, C3(0xc8ccd0), 5));
    const wt = prep(new THREE.CircleGeometry(0.15, 12)); wt.rotateX(-PI / 2); wt.translate(0, 0.07, 0.42); water.push(paint(wt, C3(0x6a9ab0)));
    const wt2 = prep(new THREE.CircleGeometry(0.06, 10)); wt2.rotateX(-PI / 2); wt2.translate(0, 0.865, 0); water.push(paint(wt2, C3(0x6a9ab0)));
    const lb = quadUV(0.22, 0.09, atlasRect('fountainSign')); lb.translate(0, 0.6, 0.152); atlas.push(lb);
    return {
      parts: [
        { geometry: boxUV(merge(con), 2), material: M.concrete(), castShadow: true },
        { geometry: boxUV(merge(steel), 4), material: M.steel(), castShadow: true },
        { geometry: merge(water), material: smat('stillWater', { std: true, roughness: 0.06, metalness: 0.1 }), castShadow: false },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
      ],
      radius: 0.3, petBowl: { x: 0, z: 0.42 },
    };
  }

  const STREET_PROPS = {
    streetlamp: makeStreetlamp, parklamp: makeParklamp, trafficpole: makeTrafficpole, bench: makeBench, parkbench: makeParkbench,
    trashcan: makeTrashcan, hydrant: makeHydrant, mailbox: makeMailbox, busstop: makeBusstop, planter: makePlanter, newsbox: makeNewsbox,
    bikerack: makeBikerack, bollard: makeBollard, picnic: makePicnic, flowerbed: makeFlowerbed, statue: makeStatue, gazebo: makeGazebo,
    drinking: makeDrinking,
  };
  Object.assign(PROPS, STREET_PROPS);
  Object.assign(VARIANTS, { newsbox: 3, flowerbed: 2, statue: 2 });

  /* ============================================================
     Traffic signal heads and pedestrian signals
     One mesh per head; its material says which lamp is lit (lamp ids live in the 'glow' attribute:
     0 housing, 1 red, 2 yellow, 3 green; walk heads: 1 walking person, 2 hand). Lit lamps are emissive by day and night.
     ============================================================ */
  TXS.walk = () => canvasTex('st_walk', 256, 160, (c, w, h) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 128, w, 32);
    c.fillStyle = '#0a0a0a'; c.fillRect(0, 0, w, 128);
    // LED dot grid look: draw the symbol, then darken between dots
    const hand = (x0) => {
      c.fillStyle = '#ff8c1a';
      c.beginPath(); K.rrect(c, x0 + 34, 52, 58, 56, 14); c.fill();
      for (let k = 0; k < 4; k++) { c.beginPath(); K.rrect(c, x0 + 36 + k * 14, 20 + Math.abs(k - 1.5) * 5, 11, 46, 5); c.fill(); }
      c.save(); c.translate(x0 + 34, 70); c.rotate(-0.7); c.beginPath(); K.rrect(c, -8, -26, 14, 36, 6); c.fill(); c.restore();
    };
    const man = (x0) => {
      c.strokeStyle = '#f2f6ff'; c.fillStyle = '#f2f6ff'; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.arc(x0 + 68, 22, 11, 0, TAU); c.fill();
      c.lineWidth = 15; c.beginPath(); c.moveTo(x0 + 66, 40); c.lineTo(x0 + 62, 72); c.stroke();
      c.lineWidth = 10;
      c.beginPath(); c.moveTo(x0 + 64, 44); c.lineTo(x0 + 48, 62); c.lineTo(x0 + 40, 78); c.stroke();
      c.beginPath(); c.moveTo(x0 + 66, 44); c.lineTo(x0 + 82, 60); c.lineTo(x0 + 96, 64); c.stroke();
      c.beginPath(); c.moveTo(x0 + 62, 72); c.lineTo(x0 + 48, 94); c.lineTo(x0 + 38, 118); c.stroke();
      c.beginPath(); c.moveTo(x0 + 62, 72); c.lineTo(x0 + 78, 96); c.lineTo(x0 + 82, 120); c.stroke();
    };
    hand(0); man(128);
    c.fillStyle = 'rgba(10,10,10,0.55)';
    for (let y = 0; y < 128; y += 4) c.fillRect(0, y, w, 1.4);
    for (let x = 0; x < w; x += 4) c.fillRect(x, 0, 1.4, 128);
  }, { srgb: true, clamp: true });
  const sigMats = {};
  // kind 'sig' (round lenses, no map) or 'walk' (symbol texture); lit: lamp id; flash: blink it
  function sigMat(kind, lit, flash) {
    const key = kind + lit + (flash ? 'f' : '');
    if (sigMats[key]) return sigMats[key];
    const o = { vertexColors: true, fog: true };
    if (kind === 'walk') o.map = TXS.walk();
    const m = new THREE.MeshLambertMaterial(o);
    m.onBeforeCompile = (sh) => {
      sh.uniforms.stOn = { value: lit }; sh.uniforms.stFlash = { value: flash ? 1 : 0 }; sh.uniforms.stTime = windU.time;
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'attribute float glow;\nvarying float vLamp;\nvarying vec2 vStUv;\nvoid main() {\n  vLamp = glow; vStUv = uv;');
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float stOn, stFlash, stTime;\nvarying float vLamp;\nvarying vec2 vStUv;\nvoid main() {')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  {
    float isLens = step(0.5, vLamp);
    float on = isLens * (1.0 - step(0.5, abs(vLamp - stOn)));
    if (stFlash > 0.5) on *= step(0.5, fract(stTime * 0.9));
    ${kind === 'walk' ? 'float rim = 1.0;' : 'float rim = 1.25 - 0.6 * length(vStUv - 0.5) * 2.0;'}
    vec3 lc = diffuseColor.rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, lc * ${kind === 'walk' ? '0.1' : '0.16'}, isLens * (1.0 - on));
    diffuseColor.rgb *= 1.0 - on * 0.6;
    totalEmissiveRadiance += lc * on * ${kind === 'walk' ? '1.5' : '1.15'} * rim;
  }`);
    };
    m.customProgramCacheKey = () => 'st-sig-' + kind;
    sigMats[key] = m;
    return m;
  }
  // visor: a hood over a lens, open at the bottom; inside and outside surfaces
  function visorGeo(r, len, z0, y, col) {
    const seg = 10, a0 = -PI * 0.2, a1 = PI * 1.2, S = K.soup();
    for (let i = 0; i < seg; i++) {
      const t0 = a0 + (a1 - a0) * i / seg, t1 = a0 + (a1 - a0) * (i + 1) / seg;
      const p = (t, z) => new V3(Math.cos(t) * r, y + Math.sin(t) * r, z);
      const A = p(t0, z0), B = p(t1, z0), Cc = p(t1, z0 + len), D = p(t0, z0 + len);
      S.quad(A, D, Cc, B, col); S.quad(A, B, Cc, D, mulc(col, 0.7));
    }
    const g = S.geo(false);
    return g;
  }
  const SIG = { housing: C3(0x1b1d1e), plate: C3(0x141516), border: C3(0xe0b81c), red: C3(0xff2410), amber: C3(0xffa000), green: C3(0x00a060) };
  let sigProto = null, walkProto = null;
  function buildSignalHead() {
    const g = [];
    // mount: a short pipe down from the origin and a clamp
    g.push(cyl(0.035, 0.035, 0.22, 6, SIG.housing).translate(0, -0.22, 0));
    g.push(boxG(0.12, 0.06, 0.12, 0, -0.03, 0, SIG.housing));
    // housing and back plate with a yellow reflective border
    g.push(roundBox(0.38, 1.04, 0.26, 0.03, SIG.housing).translate(0, -0.78, 0));
    g.push(boxG(0.62, 1.26, 0.02, 0, -0.78, -0.14, SIG.plate));
    for (const [w, h, x, y] of [[0.62, 0.05, 0, -0.17], [0.62, 0.05, 0, -1.39], [0.05, 1.26, -0.285, -0.78], [0.05, 1.26, 0.285, -0.78]]) g.push(boxG(w, h, 0.006, x, y, -0.127, SIG.border));
    // lenses and visors
    [[SIG.red, 1], [SIG.amber, 2], [SIG.green, 3]].forEach(([c, id], i) => {
      const y = -0.44 - i * 0.335;
      const ln = prep(new THREE.CircleGeometry(0.135, 14)); ln.translate(0, y, 0.132);
      g.push(setGlow(paint(ln, c), id));
      g.push(visorGeo(0.155, 0.24, 0.12, y, SIG.housing));
    });
    const geo = merge(g.map((x) => (x.attributes.glow ? x : setGlow(x, 0))));
    const mesh = new THREE.Mesh(geo, sigMat('sig', 1, false));
    mesh.name = 'signalLens'; mesh.castShadow = true; mesh.receiveShadow = true;
    const grp = new THREE.Group(); grp.name = 'signalHead'; grp.add(mesh);
    grp.userData = { state: 'r', h: 1.42 };
    return grp;
  }
  function buildWalkHead() {
    const g = [], wuv = [0.5, 0.06, 0.5, 0.06];
    // clamp bracket at the origin (the pole side), housing in front of it facing +z
    g.push(boxG(0.1, 0.24, 0.08, 0, 0, 0.04, SIG.housing));
    g.push(roundBox(0.44, 0.5, 0.22, 0.025, SIG.housing).translate(0, 0, 0.19));
    // hood over the face: top and sides
    g.push(boxG(0.46, 0.02, 0.16, 0, 0.255, 0.36, SIG.housing));
    for (const s of [-1, 1]) g.push(boxG(0.02, 0.5, 0.16, s * 0.22, 0, 0.36, SIG.housing));
    // the symbol lens: hand on top (id 2), walking person below (id 1)
    const hand = quadUV(0.3, 0.22, [0, 0.2, 0.5, 1.0]); hand.translate(0, 0.12, 0.302); g.push(setGlow(hand, 2));
    const man = quadUV(0.3, 0.22, [0.5, 0.2, 1.0, 1.0]); man.translate(0, -0.12, 0.302); g.push(setGlow(man, 1));
    const geo = merge(g.map((x) => {
      if (!x.attributes.glow) { setGlow(x, 0); const u = x.attributes.uv.array; for (let i = 0; i < u.length; i += 2) { u[i] = wuv[0]; u[i + 1] = wuv[1]; } }
      return x;
    }));
    const mesh = new THREE.Mesh(geo, sigMat('walk', 2, false));
    mesh.name = 'walkLens'; mesh.castShadow = true; mesh.receiveShadow = true;
    const grp = new THREE.Group(); grp.name = 'walkHead'; grp.add(mesh);
    grp.userData = { walk: false };
    return grp;
  }
  // one three light head (red, yellow, green), origin at its top mount, hanging below it, facing +z
  function signalHead() {
    if (!sigProto) sigProto = buildSignalHead();
    const g = sigProto.clone(); g.userData = { state: 'r', h: 1.42, mesh: g.getObjectByName('signalLens') };
    return g;
  }
  /* state: 'r' | 'y' | 'g' | 'off', or 'fr' / 'fy' for flashing red or yellow */
  function setSignal(head, state) {
    const m = head && (head.userData.mesh || head.getObjectByName('signalLens'));
    if (!m) return;
    const st = String(state || 'off'), flash = st[0] === 'f', c = flash ? st[1] : st[0];
    m.material = sigMat('sig', c === 'r' ? 1 : c === 'y' ? 2 : c === 'g' ? 3 : 0, flash);
    head.userData.state = st;
  }
  // pedestrian signal: origin at the back of its clamp (on the pole), face toward +z
  function walkHead() {
    if (!walkProto) walkProto = buildWalkHead();
    const g = walkProto.clone(); g.userData = { walk: false, mesh: g.getObjectByName('walkLens') };
    return g;
  }
  /* on: true = walking person (white), false = hand (orange), 'flash' = flashing hand (clearance) */
  function setWalk(head, on) {
    const m = head && (head.userData.mesh || head.getObjectByName('walkLens'));
    if (!m) return;
    m.material = on === 'flash' ? sigMat('walk', 2, true) : sigMat('walk', on ? 1 : 2, false);
    head.userData.walk = on;
  }

  /* ============================================================
     Park fountain: round stone basin, three tiers, falling water sheets, a jet with spray, ripples
     ============================================================ */
  const fountU = { time: windU.time };
  const GLSL_NOISE = `
float stH(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float stN(vec2 p) { vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(stH(i), stH(i + vec2(1.0, 0.0)), f.x), mix(stH(i + vec2(0.0, 1.0)), stH(i + vec2(1.0, 1.0)), f.x), f.y); }`;
  // simple lit water look for shader materials: ambient (hemisphere) plus a share of the sun
  const GLSL_LIGHT = `
vec3 stLight(vec3 n) {
  vec3 amb = ambientLightColor;
  #if NUM_HEMI_LIGHTS > 0
    amb += mix(hemisphereLights[0].groundColor, hemisphereLights[0].skyColor, 0.5 + 0.5 * n.y);
  #endif
  vec3 sun = vec3(0.0);
  #if NUM_DIR_LIGHTS > 0
    vec3 ld = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
    sun = directionalLights[0].color * (0.35 + 0.65 * max(dot(n, ld), 0.0));
  #endif
  return amb + sun * 0.6;
}`;
  function waterShader(kind) {
    // kind: 'pool' (basin and bowls: ripples, rings), 'sheet' (falling sheets: streaks moving down), 'jet' (streaks moving up), 'foam'
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
    u.uTime = windU.time; u.uNight = nightU;
    return new THREE.ShaderMaterial({
      uniforms: u, fog: true, lights: true, transparent: true, depthWrite: false, side: kind === 'pool' ? THREE.FrontSide : THREE.DoubleSide,
      vertexShader: `
attribute vec3 color;
varying vec3 vW; varying vec2 vUv2; varying vec3 vN; varying vec3 vC;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz; vUv2 = uv; vC = color;
  vN = normalize(mat3(modelMatrix) * normal);
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uTime, uNight;
varying vec3 vW; varying vec2 vUv2; varying vec3 vN; varying vec3 vC;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
${GLSL_NOISE}
${GLSL_LIGHT}
void main() {
  float t = uTime;
  vec3 V = normalize(cameraPosition - vW);
  vec3 col; float a;
  ${kind === 'pool' ? `
  // vUv2: x = radius (m) from the center of this pool, y = angle; vC.r = ring radius where water falls in (0 none)
  float r = vUv2.x;
  vec2 p = vW.xz;
  float w1 = sin(r * 9.0 - t * 4.0) * 0.5 + 0.5;
  float ring = vC.r > 0.0 ? exp(-abs(r - vC.r) * 5.0) : 0.0;
  vec2 g = vec2(stN(p * 3.0 + t * 0.6) - stN(p * 3.0 - t * 0.5 + 7.0), stN(p * 3.3 - t * 0.7 + 3.0) - stN(p * 2.7 + t * 0.4 + 11.0));
  g += vec2(sin(vUv2.y * 6.2832), cos(vUv2.y * 6.2832)) * (w1 - 0.5) * ring * 0.6;
  vec3 n = normalize(vec3(-g.x * 0.35, 1.0, -g.y * 0.35));
  float fres = 0.04 + 0.96 * pow(1.0 - clamp(dot(n, V), 0.0, 1.0), 5.0);
  vec3 sky = vec3(0.5, 0.65, 0.85);
  #if NUM_HEMI_LIGHTS > 0
    sky = hemisphereLights[0].skyColor;
  #endif
  vec3 body = mix(vec3(0.012, 0.05, 0.06), vec3(0.035, 0.1, 0.11), vC.g);
  col = body * stLight(n) + sky * fres * 0.7;
  float foam = ring * smoothstep(0.55, 0.9, stN(p * 9.0 + vec2(t * 1.3, -t)) * 0.6 + w1 * 0.5);
  col = mix(col, vec3(0.8) * stLight(vec3(0.0, 1.0, 0.0)), foam * 0.65);
  #if NUM_DIR_LIGHTS > 0
    vec3 ld = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
    col += directionalLights[0].color * pow(max(dot(n, normalize(ld + V)), 0.0), 220.0) * 2.5;
  #endif
  col += vec3(0.2, 0.4, 0.55) * uNight * vC.b * 0.35;
  a = clamp(0.8 + fres * 0.4 + foam * 0.3, 0.0, 1.0);` : kind === 'foam' ? `
  // splash ring: vUv2.x = 0..1 across the ring, y = angle
  float x = vUv2.x, ang = vUv2.y;
  float n1 = stN(vec2(ang * 18.0, x * 4.0 - t * 2.5)), n2 = stN(vec2(ang * 31.0 + 5.0, x * 7.0 - t * 3.7));
  float m = smoothstep(0.0, 0.35, x) * smoothstep(1.0, 0.45, x);
  a = m * smoothstep(0.35, 0.8, n1 * 0.6 + n2 * 0.5) * 0.85;
  col = vec3(0.95, 0.97, 1.0) * stLight(vec3(0.0, 1.0, 0.0)) + vec3(0.3, 0.5, 0.7) * uNight * 0.6;` : `
  // sheets and jets: vUv2.x around, vUv2.y = 0 top .. 1 bottom (sheets) or 0 bottom .. 1 top (jets)
  float ang = vUv2.x, y = vUv2.y;
  float dir = 1.0;
  float s1 = stN(vec2(ang * 60.0, y * 3.0 - t * 3.2 * dir));
  float s2 = stN(vec2(ang * 140.0 + 3.0, y * 6.0 - t * 4.5 * dir));
  float streak = smoothstep(0.25, 0.85, s1 * 0.65 + s2 * 0.45);
  vec3 n = normalize(vN);
  float fres = pow(1.0 - abs(dot(n, V)), 2.0);
  ${kind === 'sheet' ? `
  float top = smoothstep(0.0, 0.08, y), bot = smoothstep(1.0, 0.82, y);
  a = (0.22 + streak * 0.55 + fres * 0.3) * top * bot;
  // breaking up into drops toward the bottom
  a *= mix(1.0, step(0.45, s2), smoothstep(0.55, 1.0, y));` : `
  float top = smoothstep(1.0, 0.7, y);
  a = (0.35 + streak * 0.55) * top;`}
  col = mix(vec3(0.62, 0.78, 0.85), vec3(1.0), streak * 0.6) * stLight(n) + vec3(0.35, 0.6, 0.8) * uNight * 0.55;`}
  gl_FragColor = vec4(col, a);
  #include <tonemapping_fragment>
  #include <encodings_fragment>
  #include <fog_fragment>
}`,
    });
  }
  const fountMats = {};
  const fountMat = (k) => fountMats[k] || (fountMats[k] = waterShader(k));
  // spray droplets: points thrown up from a jet and falling back, animated entirely in the shader
  let sprayM = null;
  function sprayMat() {
    if (sprayM) return sprayM;
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog]);
    u.uTime = windU.time; u.uScale = { value: 300 }; u.uNight = nightU;
    sprayM = new THREE.ShaderMaterial({
      uniforms: u, fog: true, transparent: true, depthWrite: false,
      vertexShader: `
uniform float uTime, uScale;
attribute vec4 seed;
attribute float drop;
varying float vA;
#include <common>
#include <fog_pars_vertex>
void main() {
  // seed: x angle, y up speed, z out speed, w phase; position = launch point
  float life = (seed.y + sqrt(seed.y * seed.y + 2.0 * 9.8 * drop)) / 9.8;
  float t = fract(uTime / life * 0.7 + seed.w) * life;
  vec3 p = position + vec3(cos(seed.x) * seed.z * t, seed.y * t - 4.9 * t * t, sin(seed.x) * seed.z * t);
  vA = smoothstep(0.0, 0.08, t) * smoothstep(life, life * 0.8, t);
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  gl_PointSize = clamp(uScale * 0.018 / -mvPosition.z, 1.0, 6.0);
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uNight;
varying float vA;
#include <common>
#include <fog_pars_fragment>
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = length(c);
  if (d > 0.5) discard;
  gl_FragColor = vec4(mix(vec3(0.85, 0.92, 1.0), vec3(0.5, 0.7, 0.95), uNight), vA * smoothstep(0.5, 0.15, d) * 0.85);
  #include <fog_fragment>
}`,
    });
    return sprayM;
  }
  // o: { y, ring (launch circle radius, 0 = the center), up, out (m/s), drop (meters below the launch where drops vanish), seed }
  function sprayPoints(n, o) {
    const r = rng(o.seed), P = new Float32Array(n * 3), S = new Float32Array(n * 4), D = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, rr = (o.ring || 0) + (r() - 0.5) * (o.ring ? 0.12 : 0.03);
      P[i * 3] = Math.sin(a) * rr; P[i * 3 + 1] = o.y; P[i * 3 + 2] = Math.cos(a) * rr;
      S[i * 4] = o.ring ? r() * TAU : a; S[i * 4 + 1] = o.up * (0.6 + r() * 0.6); S[i * 4 + 2] = o.out * (0.4 + r() * 0.8); S[i * 4 + 3] = r();
      D[i] = o.drop * (0.9 + r() * 0.2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(P, 3));
    g.setAttribute('seed', new THREE.BufferAttribute(S, 4));
    g.setAttribute('drop', new THREE.BufferAttribute(D, 1));
    g.boundingSphere = new THREE.Sphere(new V3(0, o.y, 0), (o.ring || 0) + 2.5);
    const pts = new THREE.Points(g, sprayMat());
    pts.frustumCulled = false; pts.renderOrder = 3;
    return pts;
  }
  // flat ring or disc in the XZ plane at height y; uv.x = radius in meters (or 0..1 across a ring), uv.y = angle
  function flatRing(r0, r1, y, seg, col, ringUV) {
    const S = K.soup();
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU;
      const P = (r, a) => new V3(Math.sin(a) * r, y, Math.cos(a) * r);
      const u = (r) => (ringUV ? (r - r0) / (r1 - r0) : r);
      S.quad(P(r0, a0), P(r1, a0), P(r1, a1), P(r0, a1), col, col, col, col, [u(r0), a0 / TAU], [u(r1), a0 / TAU], [u(r1), a1 / TAU], [u(r0), a1 / TAU]);
    }
    const g = S.geo(false);
    const n = g.attributes.normal.array; for (let i = 0; i < n.length; i += 3) { n[i] = 0; n[i + 1] = 1; n[i + 2] = 0; }
    // the soup winding may face down: make sure it faces up
    const p = g.attributes.position.array;
    const ax = p[3] - p[0], az = p[5] - p[2], bx = p[6] - p[0], bz = p[8] - p[2];
    if (az * bx - ax * bz < 0) {
      const uv = g.attributes.uv.array, c = g.attributes.color.array;
      for (let t = 0; t < p.length / 9; t++) for (let k = 0; k < 3; k++) {
        const i1 = t * 9 + 3 + k, i2 = t * 9 + 6 + k; let q = p[i1]; p[i1] = p[i2]; p[i2] = q; q = c[i1]; c[i1] = c[i2]; c[i2] = q;
      }
      for (let t = 0; t < uv.length / 6; t++) for (let k = 0; k < 2; k++) { const i1 = t * 6 + 2 + k, i2 = t * 6 + 4 + k; const q = uv[i1]; uv[i1] = uv[i2]; uv[i2] = q; }
    }
    return g;
  }
  // a falling water sheet from a bowl rim: a lathe along a throw curve; uv.x = around, uv.y = 0 top .. 1 bottom
  function sheetGeo(rRim, yRim, yLand, v0, seg) {
    const pts = [], n = 6, tEnd = Math.sqrt(2 * (yRim - yLand) / 9.8);
    for (let i = 0; i <= n; i++) { const t = (i / n) * tEnd; pts.push([rRim + v0 * t, yRim - 4.9 * t * t]); }
    const g = lathe(pts.slice().reverse(), seg, [1, 1, 1], { smooth: true });
    const uv = g.attributes.uv.array, p = g.attributes.position.array;
    for (let i = 0; i < uv.length / 2; i++) { uv[i * 2] = Math.atan2(p[i * 3], p[i * 3 + 2]) / TAU + 0.5; uv[i * 2 + 1] = clamp((yRim - p[i * 3 + 1]) / (yRim - yLand), 0, 1); }
    return { geo: g, rLand: rRim + v0 * tEnd };
  }
  let fountProto = null;
  function buildFountain() {
    const grp = new THREE.Group(); grp.name = 'fountain';
    const stone = [], floor = [], lights = [];
    const RO = 3.55, RI = 3.2, rimY = 0.62, waterY = 0.48, floorY = 0.1;
    const lime = C3(0xbab3a3), limeD = C3(0x958d7d);
    const weather = (y, a) => mulc(mixc(limeD, lime, clamp(0.6 + 0.4 * Math.sin(a * 7 + Math.sin(a * 2.3) * 3) * 0.5 + y * 0.3, 0, 1)), 1);
    // basin wall with a plinth and a rounded coping
    stone.push(lathe([[RO + 0.05, 0], [RO + 0.05, 0.08], [RO - 0.06, 0.12], [RO - 0.06, 0.46], [RO + 0.02, 0.5], [RO + 0.03, 0.57], [RO - 0.02, rimY], [RI + 0.04, rimY], [RI - 0.01, 0.58], [RI, 0.5], [RI, floorY], [RI - 0.05, floorY]], 48, weather, { smooth: false }));
    // floor with a darker mosaic ring
    const fl = flatRing(0, RI - 0.04, floorY, 32, C3(0x3a5258));
    paint(fl, (x, y, z) => { const r = Math.hypot(x, z); return r > 2.4 && r < 2.6 ? C3(0x1f3a46) : mulc(C3(0x46605f), 0.85 + 0.15 * Math.sin(x * 3) * Math.sin(z * 3)); });
    floor.push(fl);
    // center piece: fluted column, lower bowl, stem, upper bowl, urn and jet
    const tiers = [{ r: 1.35, y: 1.25, th: 0.22 }, { r: 0.72, y: 2.05, th: 0.16 }];
    stone.push(lathe([[0.62, floorY], [0.62, 0.3], [0.5, 0.36], [0.42, 0.4], [0.3, 0.5], [0.24, 0.9], [0.28, 0.98], [0.42, 1.05]], 16, lime, { smooth: true }));
    for (const [k, T] of tiers.entries()) {
      // bowl: underside curving out to the rim, a rounded lip, inside dish down to the water
      const ri = T.r - 0.08, yb = T.y - T.th;
      stone.push(lathe([[0.2, yb - 0.08], [T.r * 0.55, yb + 0.02], [T.r * 0.9, T.y - 0.06], [T.r, T.y - 0.02], [T.r, T.y + 0.03], [ri, T.y + 0.05], [ri - 0.02, T.y - 0.03], [ri - 0.1, T.y - 0.12]], 28, (y, a) => weather(y, a), { smooth: true }));
      floor.push(flatRing(0, ri - 0.09, T.y - 0.12, 20, C3(0x5a7a80)));
      if (k === 0) stone.push(lathe([[0.22, T.y - 0.05], [0.18, T.y + 0.3], [0.14, 1.75], [0.2, 1.82], [0.26, 1.88]], 14, lime, { smooth: true }));
    }
    stone.push(lathe([[0.1, 2.0], [0.16, 2.1], [0.2, 2.28], [0.12, 2.42], [0.09, 2.5], [0.12, 2.56], [0.05, 2.6]], 12, lime, { smooth: true }));
    // basin floor lights (glow at night)
    for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; const l = flatRing(0, 0.12, floorY + 0.01, 8, C3(0xe8f0ff)); l.translate(Math.sin(a) * 1.9, 0, Math.cos(a) * 1.9); lights.push(setGlow(l, 1.6)); }
    grp.add(meshOf(boxUV(merge(stone), 1.4), M.stone()));
    grp.add(meshOf(boxUV(merge(floor), 1), M.stone(), false, true));
    grp.add(meshOf(merge(lights), M.lamp(), false, false));
    // water: basin pool, bowl pools; color r = ring radius where water falls in, g = brightness, b = lit at night
    const sheets = [], foams = [];
    const s0 = sheetGeo(tiers[0].r + 0.01, tiers[0].y + 0.02, waterY, 0.55, 40), s1 = sheetGeo(tiers[1].r + 0.01, tiers[1].y + 0.02, tiers[0].y - 0.05, 0.45, 28);
    sheets.push(s0.geo, s1.geo);
    const pool = flatRing(0, RI, waterY, 40, [s0.rLand, 0.4, 1]);
    const pools = [pool];
    pools.push(flatRing(0, tiers[0].r - 0.1, tiers[0].y - 0.05, 24, [s1.rLand, 0.7, 0.6]));
    pools.push(flatRing(0, tiers[1].r - 0.1, tiers[1].y - 0.04, 18, [0.25, 0.7, 0.6]));
    for (const [rl, y] of [[s0.rLand, waterY], [s1.rLand, tiers[0].y - 0.05]]) foams.push(flatRing(rl - 0.28, rl + 0.32, y + 0.012, 40, [1, 1, 1], true));
    const poolMesh = new THREE.Mesh(merge(pools), fountMat('pool')); poolMesh.renderOrder = 1; poolMesh.name = 'fountainWater';
    const foamMesh = new THREE.Mesh(merge(foams), fountMat('foam')); foamMesh.renderOrder = 2;
    const sheetMesh = new THREE.Mesh(merge(sheets), fountMat('sheet')); sheetMesh.renderOrder = 3;
    // the jet: a thin column of water out of the urn
    const jet = lathe([[0.035, 2.58], [0.03, 2.8], [0.02, 3.05], [0.0, 3.12]], 10, [1, 1, 1], { smooth: true });
    { const uv = jet.attributes.uv.array, p = jet.attributes.position.array; for (let i = 0; i < uv.length / 2; i++) { uv[i * 2] = Math.atan2(p[i * 3], p[i * 3 + 2]) / TAU + 0.5; uv[i * 2 + 1] = (p[i * 3 + 1] - 2.58) / 0.54; } }
    const jetMesh = new THREE.Mesh(jet, fountMat('jet')); jetMesh.renderOrder = 3;
    for (const m of [poolMesh, foamMesh, sheetMesh, jetMesh]) { m.castShadow = false; m.receiveShadow = false; grp.add(m); }
    grp.add(sprayPoints(260, { y: 3.02, up: 1.5, out: 0.75, drop: 0.98, seed: 31 }));
    grp.add(sprayPoints(140, { y: tiers[0].y - 0.04, ring: s1.rLand, up: 0.8, out: 0.35, drop: 0.04, seed: 37 }));
    grp.add(sprayPoints(260, { y: waterY + 0.01, ring: s0.rLand, up: 1.0, out: 0.4, drop: 0.02, seed: 41 }));
    const rim = [];
    for (let i = 0; i < 28; i++) { const a = i / 28 * TAU; rim.push({ x: Math.sin(a) * (RO - 0.15), z: Math.cos(a) * (RO - 0.15), r: 0.42 }); }
    grp.userData = { colliders: [{ x: 0, z: 0, r: 0.65 }], rim, waterY, rimY, basinR: RI, outerR: RO + 0.05, floorY, tiers: tiers.map((t) => ({ r: t.r, y: t.y })) };
    return grp;
  }
  // splashes in the lower bowl water land around the upper sheet: move that spray to the right ring
  function fountain() {
    if (!fountProto) fountProto = buildFountain();
    const g = fountProto.clone();
    g.userData = JSON.parse(JSON.stringify(fountProto.userData));
    return g;
  }
  // per frame hook (the fountain, signals and spray read the shared wind clock; nothing else needs a tick yet)
  let streetT = 0;
  function streetTick(dt) { streetT += dt || 0; return streetT; }

  /* ============================================================
     Road, sidewalk and path surfaces (shared materials, no vertex colors needed)
     ============================================================ */
  // asphalt base: aggregate speckle, soft tone blobs, tar crack seals and patches. W x H px for wm x hm meters.
  function asphalt(c, w, h, r, wm, hm, o = {}) {
    const ppm = w / wm;
    c.fillStyle = o.base || '#5a5b5d'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) { const s = (0.6 + r() * 2.2) * ppm, v = r() < 0.5 ? '40,40,42' : '130,130,126'; c.fillStyle = `rgba(${v},${0.03 + r() * 0.05})`; wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (0.5 + r() * 0.6), r() * PI, 0, TAU); c.fill(); }); }
    const n = Math.round(w * h / 22);
    for (let i = 0; i < n; i++) { const v = r(); c.fillStyle = v < 0.45 ? `rgba(34,34,36,${0.3 + r() * 0.4})` : v < 0.9 ? `rgba(140,138,132,${0.2 + r() * 0.35})` : `rgba(176,172,164,${0.3 + r() * 0.4})`; const s = 0.7 + r() * 1.8; c.fillRect(r() * w, r() * h, s, s); }
    // patches: saw cut rectangles of newer, slightly darker asphalt with tar sealed seams
    for (let i = 0; i < (o.patches || 0); i++) {
      const pw = (0.8 + r() * 1.8) * ppm, ph = (0.9 + r() * 2.0) * ppm, x = (o.patchX ? o.patchX(r) : r()) * w, y = r() * h, rot = (r() - 0.5) * 0.06;
      const alpha = 0.1 + r() * 0.08;
      wrapDraw(w, h, x, y, Math.max(pw, ph), (X, Y) => {
        c.save(); c.translate(X, Y); c.rotate(rot);
        c.fillStyle = `rgba(36,36,38,${alpha})`; c.fillRect(-pw / 2, -ph / 2, pw, ph);
        for (let k = 0; k < pw * ph / 60; k++) { c.fillStyle = `rgba(30,30,32,${0.2 + r() * 0.3})`; c.fillRect(-pw / 2 + r() * pw, -ph / 2 + r() * ph, 1.5, 1.5); }
        c.strokeStyle = 'rgba(20,20,22,0.5)'; c.lineWidth = 0.02 * ppm; c.strokeRect(-pw / 2, -ph / 2, pw, ph);
        c.restore();
      });
    }
    // cracks with tar seal: wandering dark lines
    for (let i = 0; i < (o.cracks || 0); i++) {
      let x = (o.crackX ? o.crackX(r) : r()) * w, y = r() * h; const len = (1 + r() * 4) * ppm, dirX = (r() - 0.5) * 0.6, dirY = r() < 0.5 ? 1 : -1;
      c.strokeStyle = `rgba(18,18,19,${0.4 + r() * 0.3})`; c.lineWidth = (0.018 + r() * 0.03) * ppm; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(x, y);
      for (let k = 0; k < 14; k++) { x += (dirX + (r() - 0.5) * 0.8) * len / 14; y += dirY * len / 14 * (0.6 + r() * 0.4); c.lineTo(x, y); }
      c.stroke();
    }
  }
  // painted line: worn edges and faded spots (px rect)
  function paintLine(c, r, x, y, w, h, col) {
    c.fillStyle = col; c.fillRect(x, y, w, h);
    for (let i = 0; i < w * h / 30; i++) { c.fillStyle = `rgba(70,70,72,${0.15 + r() * 0.5})`; const s = 1 + r() * 2.5; c.fillRect(x + r() * w - 1, y + r() * h - 1, s, s); }
    c.fillStyle = 'rgba(80,80,82,0.25)';
    for (let k = 0; k < h / 80; k++) { const yy = y + r() * h; c.fillRect(x, yy, w, 6 + r() * 30); }
  }
  TXS.road = () => canvasTex('st_road2', 1024, 1024, (c, w, h, r) => {
    const ppm = w / 10, pv = h / 12;
    asphalt(c, w, h, r, 10, 12, { patches: 2, cracks: 9, crackX: (rr) => (rr() < 0.5 ? 0.03 + rr() * 0.12 : 0.85 + rr() * 0.12) });
    // darker oil band in the middle of each lane, lighter polished wheel paths
    for (const lc of [0.28, 0.72]) {
      let g = c.createLinearGradient((lc - 0.08) * w, 0, (lc + 0.08) * w, 0);
      g.addColorStop(0, 'rgba(20,20,22,0)'); g.addColorStop(0.5, 'rgba(20,20,22,0.16)'); g.addColorStop(1, 'rgba(20,20,22,0)');
      c.fillStyle = g; c.fillRect((lc - 0.08) * w, 0, 0.16 * w, h);
      for (const off of [-0.11, 0.11]) {
        g = c.createLinearGradient((lc + off - 0.04) * w, 0, (lc + off + 0.04) * w, 0);
        g.addColorStop(0, 'rgba(160,160,156,0)'); g.addColorStop(0.5, 'rgba(160,160,156,0.07)'); g.addColorStop(1, 'rgba(160,160,156,0)');
        c.fillStyle = g; c.fillRect((lc + off - 0.04) * w, 0, 0.08 * w, h);
      }
    }
    // grime and grit at the curbs
    for (const [x0, x1] of [[0, 0.05], [0.95, 1]]) {
      const g = c.createLinearGradient(x0 * w, 0, x1 * w, 0);
      g.addColorStop(x0 ? 0 : 1, 'rgba(60,56,48,0)'); g.addColorStop(x0 ? 1 : 0, 'rgba(60,56,48,0.45)');
      c.fillStyle = g; c.fillRect(x0 * w, 0, (x1 - x0) * w, h);
      for (let i = 0; i < 260; i++) { c.fillStyle = `rgba(${150 + r() * 40 | 0},${140 + r() * 30 | 0},${110 + r() * 30 | 0},${0.3 + r() * 0.4})`; c.fillRect((x0 + r() * (x1 - x0)) * w, r() * h, 1 + r() * 2, 1 + r() * 2); }
    }
    // white edge lines 0.6 m in, double yellow center
    for (const x of [0.6, 9.4]) paintLine(c, r, x * ppm - 0.075 * ppm, 0, 0.15 * ppm, h, '#e8e6de');
    for (const x of [4.88, 5.12]) paintLine(c, r, x * ppm - 0.055 * ppm, 0, 0.11 * ppm, h, '#e2b62c');
  }, { srgb: true });
  TXS.country = () => canvasTex('st_country2', 1024, 1024, (c, w, h, r) => {
    const ppm = w / 7, pv = h / 12;
    asphalt(c, w, h, r, 7, 12, { base: '#646466', patches: 3, cracks: 16 });
    // weathered, a bit lighter in the wheel paths, crumbly dark edges
    for (const lc of [0.25, 0.75]) {
      const g = c.createLinearGradient((lc - 0.12) * w, 0, (lc + 0.12) * w, 0);
      g.addColorStop(0, 'rgba(170,168,160,0)'); g.addColorStop(0.5, 'rgba(170,168,160,0.1)'); g.addColorStop(1, 'rgba(170,168,160,0)');
      c.fillStyle = g; c.fillRect((lc - 0.12) * w, 0, 0.24 * w, h);
    }
    for (const x0 of [0, 1]) for (let i = 0; i < 90; i++) {
      const y = r() * h, d = (0.03 + r() * 0.15) * ppm, x = x0 ? w - d : 0;
      c.fillStyle = `rgba(40,38,30,${0.3 + r() * 0.4})`; c.beginPath(); c.ellipse(x0 ? w : 0, y, d, d * (1 + r() * 2), 0, 0, TAU); c.fill();
    }
    // edge lines 0.3 m in, worn
    for (const x of [0.3, 6.7]) paintLine(c, r, x * ppm - 0.06 * ppm, 0, 0.12 * ppm, h, 'rgba(226,224,214,0.9)');
    // dashed yellow center: 3 m dash, 9 m gap (one dash per 12 m tile)
    paintLine(c, r, 3.5 * ppm - 0.055 * ppm, h - 3 * pv, 0.11 * ppm, 3 * pv, 'rgba(222,178,46,0.92)');
  }, { srgb: true });
  TXS.junction = () => canvasTex('st_junction2', 1024, 1024, (c, w, h, r) => { asphalt(c, w, h, r, 10, 10, { base: '#56575a', patches: 1, cracks: 4 }); }, { srgb: true });
  TXS.zebra = () => canvasTex('st_zebra', 1024, 256, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    const ppm = w / 10, bw = 0.5 * ppm;
    for (let i = 0; i < 10; i++) {
      const x = (i + 0.25) * ppm;
      c.fillStyle = '#ecebe4'; c.fillRect(x, h * 0.04, bw, h * 0.92);
      // worn: holes in the paint, mostly in the wheel paths
      const wear = Math.abs(((i + 0.5) / 10) - 0.28) < 0.12 || Math.abs(((i + 0.5) / 10) - 0.72) < 0.12 ? 1.8 : 1;
      c.globalCompositeOperation = 'destination-out';
      for (let k = 0; k < 40 * wear; k++) { const rr = (0.8 + r() * 2.0) * wear; c.beginPath(); c.arc(x + r() * bw, r() * h, rr, 0, TAU); c.fill(); }
      c.globalCompositeOperation = 'source-over';
    }
  }, { srgb: true });
  TXS.sidewalk = () => canvasTex('st_sidewalk', 512, 512, (c, w, h, r) => {
    c.fillStyle = gray(0.86); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const s = 10 + r() * 60; c.fillStyle = gray(0.78 + r() * 0.2, 0.18); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.arc(X, Y, s, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 9000; i++) { c.fillStyle = r() < 0.5 ? gray(0.6 + r() * 0.2, 0.45) : gray(1, 0.3); const s = 0.6 + r() * 1.4; c.fillRect(r() * w, r() * h, s, s); }
    // faint stains and old gum spots
    for (let i = 0; i < 6; i++) { const s = 10 + r() * 30; c.fillStyle = gray(0.55, 0.12); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * 0.7, r() * 3, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 14; i++) { c.fillStyle = gray(0.3 + r() * 0.2, 0.5); c.beginPath(); c.arc(r() * w, r() * h, 1.5 + r() * 2, 0, TAU); c.fill(); }
  });
  TXS.paving = () => canvasTex('st_paving', 1024, 1024, (c, w, h, r) => {
    // running bond pavers 0.2 x 0.1 m (2 m tile), sand joints, mixed warm tones
    const ppm = w / 2, bw = 0.2 * ppm, bh = 0.1 * ppm;
    c.fillStyle = '#a89a84'; c.fillRect(0, 0, w, h);
    const tones = ['#9a5a44', '#a8664c', '#8a4e3c', '#b0846a', '#7a6a5e', '#9c7058'];
    for (let row = 0; row < 20; row++) {
      const off = (row % 2) * bw / 2;
      for (let k = -1; k < 11; k++) {
        const x = k * bw + off, y = row * bh;
        c.fillStyle = tones[(r() * tones.length) | 0];
        c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        const g = c.createLinearGradient(0, y, 0, y + bh); g.addColorStop(0, 'rgba(255,240,220,0.12)'); g.addColorStop(1, 'rgba(0,0,0,0.12)');
        c.fillStyle = g; c.fillRect(x + 2, y + 2, bw - 4, bh - 4);
        for (let i = 0; i < 40; i++) { c.fillStyle = `rgba(${r() < 0.5 ? '0,0,0' : '255,235,210'},${r() * 0.12})`; c.fillRect(x + 2 + r() * (bw - 6), y + 2 + r() * (bh - 6), 2, 2); }
      }
    }
    for (let i = 0; i < 30; i++) { c.fillStyle = 'rgba(70,90,40,0.35)'; c.fillRect(r() * w, ((r() * 20) | 0) * bh, 6 + r() * 20, 3); }
  }, { srgb: true });
  TXS.curb = () => canvasTex('st_curb', 256, 256, (c, w, h, r) => {
    c.fillStyle = gray(0.88); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 4000; i++) { c.fillStyle = r() < 0.5 ? gray(0.62 + r() * 0.2, 0.5) : gray(1, 0.3); const s = 0.6 + r() * 1.4; c.fillRect(r() * w, r() * h, s, s); }
    for (let i = 0; i < 30; i++) { const s = 8 + r() * 30; c.fillStyle = gray(0.7 + r() * 0.3, 0.15); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.arc(X, Y, s, 0, TAU); c.fill(); }); }
  });
  /* shader extras for the surfaces: world space tone variation (breaks up repeats), and per kind:
     road: a manhole cover in some 12 m tiles; junction: covers on some 10 m cells; sidewalk: per slab offsets, tones and seams;
     curb: a joint every 3 m along u */
  function surfMat(kind, o) {
    const m = new THREE.MeshLambertMaterial(Object.assign({ fog: true }, o));
    m.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader.replace('void main() {', 'varying vec3 vStW;\nvarying vec2 vStUv;\nvoid main() {\n  vStUv = uv;')
        .replace('#include <worldpos_vertex>', `#include <worldpos_vertex>
  {
    vec4 stw = vec4(transformed, 1.0);
    #ifdef USE_INSTANCING
      stw = instanceMatrix * stw;
    #endif
    vStW = (modelMatrix * stw).xyz;
  }`);
      let mapCode = '#include <map_fragment>';
      if (kind === 'sidewalk') mapCode = `
  vec2 slab = floor(vStUv);
  vec2 off = vec2(stH(slab), stH(slab + 17.0));
  vec4 sampledDiffuseColor = texture2D(map, vStUv * 1.0 + off);
  diffuseColor *= sampledDiffuseColor;
  vec2 f = fract(vStUv); float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
  diffuseColor.rgb *= (0.9 + 0.14 * stH(slab + 5.0)) * mix(0.55, 1.0, smoothstep(0.003, 0.012, e));`;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vStW;\nvarying vec2 vStUv;\n${GLSL_NOISE}\nvoid main() {`)
        .replace('#include <map_fragment>', mapCode + `
  {
    float big = stN(vStW.xz * 0.045) * 0.6 + stN(vStW.xz * 0.21 + 3.0) * 0.4;
    diffuseColor.rgb *= ${kind === 'zebra' ? '1.0' : '0.88 + 0.22 * big'};
    ${kind === 'road' || kind === 'junction' ? `
    // manhole covers: cast iron disc with a raised grid, in some tiles only
    vec2 cell = ${kind === 'road' ? 'vec2(0.0, floor(vStUv.y))' : 'floor(vStUv)'};
    float hh = stH(cell + 0.71);
    if (hh > ${kind === 'road' ? '0.6' : '0.7'}) {
      vec2 mpos = ${kind === 'road' ? 'vec2(vStUv.x * 10.0, fract(vStUv.y) * 12.0)' : 'fract(vStUv) * 10.0'};
      vec2 ctr = ${kind === 'road' ? 'vec2(stH(cell + 3.1) > 0.5 ? 2.8 : 7.2, 3.0 + stH(cell + 9.2) * 6.0)' : 'vec2(3.0 + stH(cell + 2.0) * 4.0, 3.0 + stH(cell + 5.0) * 4.0)'};
      vec2 d = mpos - ctr; float r = length(d);
      float disc = 1.0 - smoothstep(0.31, 0.325, r);
      float rimL = smoothstep(0.29, 0.30, r) * (1.0 - smoothstep(0.31, 0.325, r));
      vec2 gq = abs(fract(d * 9.0) - 0.5);
      float grid = step(0.36, max(gq.x, gq.y)) * step(r, 0.25);
      float ringL = smoothstep(0.255, 0.26, r) * (1.0 - smoothstep(0.27, 0.275, r));
      vec3 iron = vec3(0.13, 0.12, 0.115) * (0.8 + 0.4 * stN(mpos * 30.0));
      iron = mix(iron, vec3(0.26, 0.25, 0.23), max(grid, max(rimL, ringL)) * 0.8);
      diffuseColor.rgb = mix(diffuseColor.rgb, iron, disc);
      float halo = smoothstep(0.42, 0.33, r) * (1.0 - disc);
      diffuseColor.rgb *= 1.0 - halo * 0.25;
    }` : ''}
    ${kind === 'curb' ? 'float jf = fract(vStUv.x / 3.0); diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.004, 0.012, min(jf, 1.0 - jf) * 3.0));' : ''}
  }`);
    };
    m.customProgramCacheKey = () => 'st-surf-' + kind;
    return m;
  }
  let surfCache = null;
  function streetMaterials() {
    if (surfCache) return surfCache;
    const zebra = surfMat('zebra', { map: TXS.zebra(), alphaTest: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
    surfCache = {
      road: surfMat('road', { map: TXS.road() }),
      country: surfMat('country', { map: TXS.country() }),
      junction: surfMat('junction', { map: TXS.junction() }),
      zebra,
      sidewalk: surfMat('sidewalk', { map: TXS.sidewalk(), color: K.lcol(0xc6c2ba) }),
      curb: surfMat('curb', { map: TXS.curb(), color: K.lcol(0xcfcac0) }),
      paving: surfMat('paving', { map: TXS.paving() }),
    };
    return surfCache;
  }

  /* ============================================================
     Signs: town welcome sign, street name post, green direction sign
     ============================================================ */
  const signMatCache = {};
  function textMat(key, draw, w, h, o = {}) {
    if (signMatCache[key]) return signMatCache[key];
    const tex = canvasTex('st_sign:' + key, w, h, draw, { srgb: true, clamp: true });
    const m = new THREE.MeshLambertMaterial({ map: tex, fog: true, alphaTest: o.alphaTest || 0 });
    signMatCache[key] = m;
    return m;
  }
  function fitFont(c, s, font, size, maxW) { let fs = size; c.font = font(fs); while (fs > 10 && c.measureText(s).width > maxW) { fs -= 2; c.font = font(fs); } return fs; }
  // a textured plane facing +z at (x, y, z)
  function facePlane(m, w, h, x, y, z, ry = 0) { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, h), m); p.position.set(x, y, z); p.rotation.y = ry; p.receiveShadow = true; return p; }
  function townSign(name = 'Maple Grove') {
    name = String(name).slice(0, 28);
    const grp = new THREE.Group(); grp.name = 'townSign';
    const wood = [], soil = [], stone = [];
    const W = 2.3, H = 1.05, by = 1.25, post = C3(0x5a4030);
    for (const s of [-1, 1]) {
      wood.push(boxG(0.16, by + H / 2 + 0.25, 0.16, s * (W / 2 + 0.06), (by + H / 2 + 0.25) / 2, 0, post, 2));
      wood.push(K.paint(prep(new THREE.ConeGeometry(0.13, 0.12, 4)).rotateY(PI / 4).translate(s * (W / 2 + 0.06), by + H / 2 + 0.31, 0), mulc(post, 0.9)));
    }
    wood.push(boxG(W, H, 0.09, 0, by, 0, C3(0x23472f), 2));
    wood.push(boxG(W + 0.1, 0.08, 0.13, 0, by + H / 2 + 0.03, 0, post, 2), boxG(W + 0.1, 0.08, 0.13, 0, by - H / 2 - 0.03, 0, post, 2));
    grp.add(meshOf(merge(wood), M.wood()));
    const m = textMat('town:' + name, (c, w, h) => {
      c.fillStyle = '#23472f'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#e8dcb0'; c.lineWidth = 10; K.rrect(c, 22, 22, w - 44, h - 44, 26); c.stroke();
      c.lineWidth = 3; K.rrect(c, 36, 36, w - 72, h - 72, 18); c.stroke();
      c.fillStyle = '#efe4bc'; c.textAlign = 'center'; c.textBaseline = 'middle';
      c.font = `italic ${FONTS(58).replace('bold ', '')}`; c.fillText('Welcome to', w / 2, h * 0.27);
      fitFont(c, name, FONTS, 150, w - 140); c.fillText(name, w / 2, h * 0.56);
      c.font = FONTS(40); c.fillText('EST. 1802', w / 2, h * 0.82);
      // little leaves either side of the date
      c.fillStyle = '#c86a2a'; for (const s of [-1, 1]) { c.beginPath(); c.ellipse(w / 2 + s * 150, h * 0.82, 22, 9, s * 0.4, 0, TAU); c.fill(); }
    }, 1024, 468);
    grp.add(facePlane(m, W - 0.04, H - 0.04, 0, by, 0.047), facePlane(m, W - 0.04, H - 0.04, 0, by, -0.047, PI));
    // flower bed along the foot of the sign: low stone edge, soil, flower cards
    const r = rng(strSeed(name));
    stone.push(lathe([[1.0, 0], [1.0, 0.22], [0.92, 0.24], [0.9, 0.2]], 20, C3(0x9a948a)));
    stone[0].scale(1.45, 1, 0.6);
    soil.push(lathe([[0.92, 0.2], [0.5, 0.28], [0, 0.3]], 20, C3(0x4a3826), { smooth: true }).scale(1.45, 1, 0.6));
    const cards = [], cellUV = (k) => [(k % 2) * 0.5, k < 2 ? 0.5 : 0, (k % 2) * 0.5 + 0.5, k < 2 ? 1 : 0.5];
    const cols = [0xe8433a, 0xf6d040, 0xf6f4f0, 0xd05aa0, 0xf09a30];
    for (let i = 0; i < 26; i++) {
      const a = r() * TAU, d = Math.sqrt(r()) * 0.82, x = Math.cos(a) * d * 1.45, z = Math.sin(a) * d * 0.6;
      if (Math.abs(x) > 1.1 && Math.abs(z) < 0.15) continue;
      cards.push({ p: new V3(x, 0.42, z), n: new V3(0, 1, 0), c: mulc(C3(cols[i % cols.length]), 0.9 + r() * 0.2), s: 0.42, uv: cellUV(i % 2) });
      if (i % 2) cards.push({ p: new V3(x, 0.36, z), n: new V3(0, 1, 0), c: C3(0x3a6a2a), s: 0.46, uv: cellUV(3) });
    }
    grp.add(meshOf(boxUV(merge(stone), 2), M.stone()));
    grp.add(meshOf(merge(soil), M.soil(), false, true));
    const fm = meshOf(cardList(cards, r), M.flowers()); fm.customDepthMaterial = flowerDepth(); grp.add(fm);
    grp.userData = { name, colliders: [{ x: -(W / 2 + 0.06), z: 0, r: 0.2 }, { x: W / 2 + 0.06, z: 0, r: 0.2 }], w: W + 0.3, h: by + H / 2 + 0.4 };
    return grp;
  }
  // corner street name post: blade A along x (read from +z and -z) at 2.75 m, blade B along z (read from +x and -x) above it
  function bladeMat(name) {
    return textMat('blade:' + name, (c, w, h) => {
      c.fillStyle = '#1f6b3e'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f2f4f0'; c.lineWidth = 5; K.rrect(c, 7, 7, w - 14, h - 14, 10); c.stroke();
      c.fillStyle = '#f6f8f4'; c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, name, FONTC, 74, w - 50); c.fillText(name, w / 2, h / 2 + 3);
    }, 512, 104);
  }
  function streetSign(nameA = 'Maple St', nameB = 'Main St') {
    const grp = new THREE.Group(); grp.name = 'streetSign';
    const g = [lathe([[0.045, 0], [0.045, 3.05], [0.05, 3.08], [0, 3.12]], 8, GALV)];
    g.push(boxG(0.1, 0.08, 0.1, 0, 2.86, 0, C3(0x6a6e70)));
    const BL = 0.95, BH = 0.19;
    const blades = [[nameA, 2.75, 0], [nameB, 2.97, PI / 2]];
    for (const [nm, y, ry] of blades) {
      const b = boxG(BL, BH, 0.012, 0, 0, 0, C3(0x1f6b3e)); b.rotateY(ry); b.translate(0, y, 0); g.push(b);
      const m = bladeMat(nm);
      const f1 = facePlane(m, BL - 0.01, BH - 0.01, 0, y, 0, ry), f2 = facePlane(m, BL - 0.01, BH - 0.01, 0, y, 0, ry + PI);
      f1.translateZ(0.0065); f2.translateZ(0.0065);
      grp.add(f1, f2);
    }
    grp.add(meshOf(merge(g), M.steel()));
    grp.userData = { names: [nameA, nameB], colliders: [{ x: 0, z: 0, r: 0.1 }], h: 3.1 };
    return grp;
  }
  // green guide sign on one or two posts, white border, white text and an arrow ('left' | 'right' | 'up')
  function roadSign(text = 'City Center', arrow = 'up') {
    text = String(text).slice(0, 34);
    const arrowStr = arrow === 'left' || arrow === 'right' || arrow === 'up' ? arrow : 'up';
    // measure: width grows with the text, about 0.26 m per character, plus the arrow
    const cv = document.createElement('canvas').getContext('2d'); cv.font = FONTC(100);
    const tw = cv.measureText(text).width;
    const H = 0.85, W = clamp((tw / 100) * 0.5 + 1.2, 1.6, 4.2), pxW = Math.round(clamp(W / H * 220, 256, 1024)), pxH = 220;
    const grp = new THREE.Group(); grp.name = 'roadSign';
    const m = textMat('road:' + text + ':' + arrowStr + ':' + pxW, (c, w, h) => {
      c.fillStyle = '#1d6a40'; c.fillRect(0, 0, w, h);
      c.strokeStyle = '#f4f6f2'; c.lineWidth = 9; K.rrect(c, 11, 11, w - 22, h - 22, 22); c.stroke();
      c.fillStyle = '#f6f8f4'; c.strokeStyle = '#f6f8f4';
      const aw = h * 0.62, ax = arrowStr === 'left' ? 30 + aw / 2 : w - 30 - aw / 2, ay = h / 2;
      c.save(); c.translate(ax, ay); c.rotate(arrowStr === 'left' ? PI : arrowStr === 'up' ? -PI / 2 : 0);
      c.beginPath(); c.moveTo(-aw * 0.45, -aw * 0.09); c.lineTo(aw * 0.1, -aw * 0.09); c.lineTo(aw * 0.1, -aw * 0.3); c.lineTo(aw * 0.48, 0); c.lineTo(aw * 0.1, aw * 0.3); c.lineTo(aw * 0.1, aw * 0.09); c.lineTo(-aw * 0.45, aw * 0.09); c.closePath(); c.fill();
      c.restore();
      const tx0 = arrowStr === 'left' ? 30 + aw + 10 : 30, tx1 = arrowStr === 'left' ? w - 30 : w - 30 - aw - 10;
      c.textAlign = 'center'; c.textBaseline = 'middle';
      fitFont(c, text, FONTC, 108, tx1 - tx0 - 10); c.fillText(text, (tx0 + tx1) / 2, h / 2 + 4);
    }, pxW, pxH);
    const y0 = 2.1, posts = W > 2.4 ? [-W / 2 + 0.35, W / 2 - 0.35] : [0];
    const g = [];
    for (const x of posts) { g.push(lathe([[0.04, 0], [0.04, y0 + H + 0.02], [0, y0 + H + 0.05]], 8, GALV)); g[g.length - 1].translate(x, 0, -0.06); }
    g.push(boxG(W, H, 0.03, 0, y0 + H / 2, -0.02, C3(0xa8aaa8)));
    for (const dy of [0.2, H - 0.2]) g.push(boxG(W * 0.9, 0.05, 0.03, 0, y0 + dy, -0.05, GALV));
    grp.add(meshOf(merge(g), M.steel()));
    grp.add(facePlane(m, W, H, 0, y0 + H / 2, 0.0));
    grp.userData = { text, arrow: arrowStr, w: W, h: y0 + H, colliders: posts.map((x) => ({ x, z: -0.06, r: 0.1 })) };
    return grp;
  }

  /* ============================================================
     Vehicles
     A car body is a loft: cross section rings at stations along z (rear -z to front +z), 10 points per side from the
     bottom center (p0) round the side (p1..p4), the belt line (p5) and over the top (p6..p9, the hood, roof or bed).
     Key stations give the profile; between keys the rings are linear. Wheel arches cut the bottom, quads are sorted into
     paint, glass and trim by region, and lights, grille, plates and seams are laid on the surface as thin patches.
     ============================================================ */
  // vehicle detail atlas (sRGB): white, plates, grille, light lenses, taxi sign, van lettering, bus sign
  const VA = 1024;
  const VR = (x, y, w, h) => [x / VA, 1 - (y + h) / VA, (x + w) / VA, 1 - y / VA];
  const VAT = {
    white: VR(2, 2, 12, 12), plate: VR(16, 0, 240, 120), grille: VR(260, 0, 200, 100), grille2: VR(464, 0, 200, 100),
    head: VR(668, 0, 200, 100), tail: VR(0, 124, 240, 90), taxi: VR(244, 124, 300, 90), led: VR(548, 124, 470, 90),
    van: VR(0, 220, 1024, 280), box: VR(0, 504, 1024, 220), bumper: VR(0, 728, 200, 60), vent: VR(204, 728, 200, 60),
    seat: VR(408, 728, 120, 120), dash: VR(532, 728, 200, 80),
  };
  const vuv = (k) => VAT[k];
  TXS.vehicle = () => canvasTex('st_vehicle', VA, VA, (c, w, h, r) => {
    c.fillStyle = '#ffffff'; c.fillRect(0, 0, w, h);
    const box = (x, y, bw, bh, col) => { c.fillStyle = col; c.fillRect(x, y, bw, bh); };
    const text = (s, x, y, size, col, font = FONT, maxW = 0) => {
      c.fillStyle = col; c.textAlign = 'center'; c.textBaseline = 'middle';
      let fs = size; c.font = font(fs); while (maxW && fs > 8 && c.measureText(s).width > maxW) { fs -= 2; c.font = font(fs); }
      c.fillText(s, x, y);
    };
    // license plate: white with a blue band, dark characters, a small state line
    box(16, 0, 240, 120, '#f4f2ea'); c.strokeStyle = '#2a2e38'; c.lineWidth = 4; K.rrect(c, 18, 2, 236, 116, 10); c.stroke();
    box(24, 10, 224, 16, '#2a4a8a'); text('MAINE', 136, 18, 13, '#f4f2ea');
    text('4BK 7Q2', 136, 70, 58, '#1c2a5a', FONTC); text('VACATIONLAND', 136, 106, 13, '#8a2a2a');
    // grille: dark honeycomb mesh in a chrome frame, and a slatted grille
    box(260, 0, 200, 100, '#202224');
    c.fillStyle = '#0c0d0e';
    for (let y = 8; y < 100; y += 10) for (let x = 262 + ((y / 10) % 2) * 6; x < 458; x += 12) { c.beginPath(); c.ellipse(x, y, 4.2, 3.2, 0, 0, TAU); c.fill(); }
    c.strokeStyle = '#b8bcc0'; c.lineWidth = 5; K.rrect(c, 263, 3, 194, 94, 14); c.stroke();
    box(464, 0, 200, 100, '#141516');
    for (let y = 10; y < 96; y += 14) { box(470, y, 188, 6, '#3a3d40'); box(470, y + 6, 188, 2, '#6a6e72'); }
    c.strokeStyle = '#c8ccd0'; c.lineWidth = 4; c.strokeRect(466, 2, 196, 96);
    // headlight: chrome reflector, two projector lenses and an LED strip
    let g = c.createLinearGradient(668, 0, 668, 100); g.addColorStop(0, '#e8eef2'); g.addColorStop(1, '#9aa4ac');
    box(668, 0, 200, 100, g);
    for (const [x, rr] of [[720, 30], [800, 24]]) {
      const rg = c.createRadialGradient(x, 52, 2, x, 52, rr); rg.addColorStop(0, '#ffffff'); rg.addColorStop(0.5, '#c8d4dc'); rg.addColorStop(0.8, '#5a646c'); rg.addColorStop(1, '#2a3036');
      c.fillStyle = rg; c.beginPath(); c.arc(x, 52, rr, 0, TAU); c.fill();
    }
    box(676, 84, 184, 8, '#ffffff'); box(844, 30, 18, 40, '#f0a020');
    // tail light: red segments, darker separators, a white reverse lamp
    box(0, 124, 240, 90, '#a8100c');
    for (let x = 6; x < 170; x += 28) { g = c.createLinearGradient(0, 130, 0, 208); g.addColorStop(0, '#ff3a2a'); g.addColorStop(1, '#c81a12'); c.fillStyle = g; c.fillRect(x, 132, 22, 74); }
    box(176, 132, 58, 74, '#e8e4e0'); box(176, 132, 58, 6, '#c8c4c0');
    // taxi roof sign: TAXI on warm white with a yellow band
    box(244, 124, 300, 90, '#fff6d8'); box(244, 190, 300, 24, '#f2b818'); text('TAXI', 394, 160, 64, '#1a1a1a', FONT);
    // LED destination sign (bus): amber dots on black
    box(548, 124, 470, 90, '#0a0a0a');
    c.font = FONTC(64); c.fillStyle = '#ffb020'; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText('12', 566, 170);
    c.textAlign = 'center'; c.fillText('CITY PARK', 820, 170);
    c.fillStyle = 'rgba(10,10,10,0.6)'; for (let y = 124; y < 214; y += 5) c.fillRect(548, y, 470, 2); for (let x = 548; x < 1018; x += 5) c.fillRect(x, 124, 2, 90);
    // ANIMAL CONTROL van side: white with blue and green bands, lettering and a paw badge
    box(0, 220, 1024, 280, '#f6f6f2');
    box(0, 430, 1024, 26, '#1f5f9a'); box(0, 458, 1024, 12, '#3a9a5a');
    c.fillStyle = '#1f5f9a'; c.beginPath(); c.arc(140, 320, 92, 0, TAU); c.fill();
    c.fillStyle = '#f6f6f2'; c.beginPath(); c.arc(140, 320, 80, 0, TAU); c.fill();
    c.fillStyle = '#1f5f9a';
    c.beginPath(); c.ellipse(140, 345, 34, 29, 0, 0, TAU); c.fill();
    for (const [dx, dy, rr] of [[-36, -14, 13], [-13, -38, 14], [13, -38, 14], [36, -14, 13]]) { c.beginPath(); c.ellipse(140 + dx, 320 + dy, rr, rr * 1.25, dx * 0.012, 0, TAU); c.fill(); }
    text('ANIMAL', 610, 288, 120, '#1f5f9a', FONT, 740); text('CONTROL', 610, 388, 104, '#2f7a4a', FONT, 740);
    // box truck side: a clean panel with a stripe and simple lettering (no brand)
    box(0, 504, 1024, 220, '#f4f4f0'); box(0, 650, 1024, 30, '#c83a2a'); box(0, 684, 1024, 10, '#2a2a2a');
    text('FRESH DELIVERY', 512, 590, 96, '#2a2a2a', FONT, 900);
    // textured black plastic bumper, a vent grille, seat fabric, dashboard
    box(0, 728, 200, 60, '#1c1d1e'); for (let i = 0; i < 400; i++) box(r() * 200, 728 + r() * 60, 1.5, 1.5, 'rgba(255,255,255,0.08)');
    box(204, 728, 200, 60, '#18191a'); for (let x = 210; x < 400; x += 12) box(x, 734, 7, 48, '#050505');
    box(408, 728, 120, 120, '#3a3c40'); for (let y = 728; y < 848; y += 4) box(408, y, 120, 1.5, 'rgba(0,0,0,0.25)'); for (let x = 408; x < 528; x += 20) box(x, 728, 2, 120, 'rgba(0,0,0,0.35)');
    box(532, 728, 200, 80, '#232426'); box(560, 744, 60, 30, '#0a0a0a'); box(640, 744, 70, 30, '#101820'); box(652, 752, 46, 14, '#3a7aa0');
  }, { srgb: true });
  // wheel texture: top half the tire (tread band in the middle, sidewalls either side), bottom left an alloy rim face,
  // bottom right a steel wheel with a hubcap
  TXS.wheel = () => canvasTex('st_wheel', 256, 256, (c, w, h, r) => {
    c.fillStyle = '#1a1a1a'; c.fillRect(0, 0, w, 128);
    // tread: blocks with grooves, middle band of the top half (v 0.62 .. 0.88)
    c.fillStyle = '#242424'; c.fillRect(0, 30, w, 68);
    for (let x = 0; x < w; x += 16) { c.fillStyle = '#0c0c0c'; c.fillRect(x, 30, 3, 68); c.fillRect(x + 8, 40, 2, 48); }
    for (const y of [46, 64, 82]) { c.fillStyle = '#0e0e0e'; c.fillRect(0, y, w, 3); }
    // sidewall lettering marks
    for (let x = 4; x < w; x += 64) { c.fillStyle = '#3a3a3a'; for (let k = 0; k < 6; k++) c.fillRect(x + k * 6, 8, 4, 10); c.fillRect(x, 110, 30, 6); }
    // alloy rim: five spokes, dark between them, a center cap and lug nuts
    const rim = (cx, cy, R0) => {
      c.fillStyle = '#16181a'; c.beginPath(); c.arc(cx, cy, R0, 0, TAU); c.fill();
      let g = c.createRadialGradient(cx - 10, cy - 12, 4, cx, cy, R0); g.addColorStop(0, '#f0f2f4'); g.addColorStop(0.7, '#b8bcc0'); g.addColorStop(1, '#7a7e82');
      c.fillStyle = g;
      c.beginPath(); c.arc(cx, cy, R0, 0, TAU); c.arc(cx, cy, R0 - 8, 0, TAU, true); c.fill();
      for (let k = 0; k < 5; k++) {
        const a = k / 5 * TAU - PI / 2;
        c.save(); c.translate(cx, cy); c.rotate(a);
        c.beginPath(); c.moveTo(12, -9); c.lineTo(R0 - 6, -15); c.lineTo(R0 - 6, 15); c.lineTo(12, 9); c.closePath(); c.fill();
        c.restore();
      }
      c.beginPath(); c.arc(cx, cy, 18, 0, TAU); c.fill();
      c.fillStyle = '#3a3e42'; for (let k = 0; k < 5; k++) { const a = k / 5 * TAU + PI / 5 - PI / 2; c.beginPath(); c.arc(cx + Math.cos(a) * 12, cy + Math.sin(a) * 12, 2.6, 0, TAU); c.fill(); }
      c.fillStyle = '#5a5e62'; c.beginPath(); c.arc(cx, cy, 6, 0, TAU); c.fill();
    };
    rim(64, 192, 62);
    // steel wheel with a domed hubcap
    c.fillStyle = '#4a4e52'; c.beginPath(); c.arc(192, 192, 62, 0, TAU); c.fill();
    c.fillStyle = '#2a2c2e'; for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.beginPath(); c.ellipse(192 + Math.cos(a) * 40, 192 + Math.sin(a) * 40, 8, 6, a, 0, TAU); c.fill(); }
    const g2 = c.createRadialGradient(184, 184, 2, 192, 192, 26); g2.addColorStop(0, '#f0f2f4'); g2.addColorStop(1, '#8a8e92');
    c.fillStyle = g2; c.beginPath(); c.arc(192, 192, 26, 0, TAU); c.fill();
  });
  const VM = {
    paint: () => smat('carPaint', { map: TXS.vehicle(), std: true, roughness: 0.34, metalness: 0.1, tinted: true }, { gloss: 0.45, glossBase: 0.04 }),
    glass: () => {
      const m = smat('carGlass', { std: true, roughness: 0.1, metalness: 0.0, transparent: true }, { gloss: 0.75, glossBase: 0.07 });
      m.opacity = 0.84; m.depthWrite = false;
      return m;
    },
    trim: () => { const m = smat('carTrim', { map: TXS.vehicle(), std: true, roughness: 0.55 }, { gloss: 0.2 }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; return m; },
    lights: () => { const m = smat('carLights', { map: TXS.vehicle(), std: true, roughness: 0.15 }, { gloss: 0.5, vcGlow: 'night' }); m.polygonOffset = true; m.polygonOffsetFactor = -1; m.polygonOffsetUnits = -2; return m; },
    busGlass: () => {
      const m = smat('busGlass', { std: true, roughness: 0.1, metalness: 0.0, transparent: true }, { gloss: 0.7, glossBase: 0.06 });
      m.opacity = 0.6; m.depthWrite = false;
      return m;
    },
    wheel: () => smat('carWheel', { map: TXS.wheel(), std: true, roughness: 0.5, metalness: 0.2 }, { gloss: 0.15 }),
  };

  /* ---------- the loft ---------- */
  // profile keys: { z, mode: 'hood' | 'roof' | 'bed', top, belt, yb, hw, hb, hr, bedY }; ring: 10 points per side, 11 with winTop
  function topPts(K0, spec) {
    const crown = K0.top - K0.belt, rr = spec.roofR || 0.075;
    let t;
    if (K0.mode === 'roof') t = [[K0.hr + 0.035, K0.top - rr], [K0.hr - rr * 0.55, K0.top - rr * 0.16], [K0.hr * 0.5, K0.top - 0.002], [0, K0.top]];
    else if (K0.mode === 'bed') t = [[K0.hb - 0.05, K0.belt], [K0.hb - 0.06, K0.bedY], [K0.hb * 0.5, K0.bedY], [0, K0.bedY]];
    else t = [[K0.hb - 0.05, K0.belt + crown * 0.45], [K0.hb - 0.14, K0.belt + crown * 0.75], [K0.hb * 0.45, K0.top - crown * 0.03], [0, K0.top]];
    if (spec.winTop) {
      // window top line: on the roof part of the body it sits at winTop, elsewhere half way to the first top point
      const a = [K0.hb, K0.belt], b = t[0];
      const f = K0.mode === 'roof' ? clamp((spec.winTop - a[1]) / ((b[1] - a[1]) || 1), 0.05, 0.95) : 0.5;
      t.unshift([lerp(a[0], b[0], f), lerp(a[1], b[1], f)]);
    }
    return t;
  }
  // rounded end (plan and profile): from z0 (full size) to the tip at z1, keys at quarter ellipse steps
  function endKeys(base, z0, z1, tip) {
    const out = [];
    for (const u of [0.4, 0.68, 0.88, 1.0]) {
      // plan and bottom round off late (a quarter ellipse), the top slopes down earlier so the face leans back
      const e = 1 - Math.sqrt(1 - u * u), eT = Math.pow(u, tip.topPow || 1.5), k = Object.assign({}, base);
      k.z = lerp(z0, z1, u);
      for (const f of ['top', 'belt', 'yb', 'hw', 'hb', 'hr']) if (tip[f] != null) k[f] = lerp(base[f], tip[f], f === 'top' || f === 'belt' ? eT : e);
      out.push(k);
    }
    return out;
  }
  function buildLoft(spec) {
    const keys = spec.keys.slice().sort((a, b) => a.z - b.z);
    const zMin = keys[0].z, zMax = keys[keys.length - 1].z;
    const keySeg = (z) => {
      let i = 0;
      while (i < keys.length - 2 && keys[i + 1].z < z) i++;
      const a = keys[i], b = keys[i + 1], t = clamp((z - a.z) / ((b.z - a.z) || 1), 0, 1);
      return [a, b, t];
    };
    const rA = spec.wr + 0.045;
    const archY = (z) => {
      let y = -1;
      for (const za of spec.axles) { const d = Math.abs(z - za); if (d <= rA + 1e-6) y = Math.max(y, spec.wr + Math.sqrt(Math.max(0, rA * rA - d * d))); }
      return y;
    };
    function ring(z) {
      const [a, b, t] = keySeg(z);
      const P = {};
      for (const f of ['top', 'belt', 'yb', 'hw', 'hb', 'hr']) P[f] = lerp(a[f], b[f], t);
      let yb = P.yb;
      const ay = spec.noArch ? -1 : archY(z);
      if (ay > yb) yb = ay;
      const belt = P.belt, hw = P.hw, hb = P.hb;
      const pts = [[0, yb], [hw - 0.1, yb], [hw - 0.02, yb + Math.min(0.06, (belt - yb) * 0.22)], [hw, yb + (belt - yb) * 0.45], [hw - 0.014, belt - Math.min(0.06, (belt - yb) * 0.2)], [hb, belt]];
      const ta = topPts(a, spec), tb = topPts(b, spec);
      for (let k = 0; k < ta.length; k++) pts.push([lerp(ta[k][0], tb[k][0], t), lerp(ta[k][1], tb[k][1], t)]);
      return { z, pts, a, b, t, P, arch: ay > P.yb };
    }
    // stations: keys, arch steps, window and seam lines, and splits of long same mode spans
    let zs = keys.map((k) => k.z);
    if (!spec.noArch) for (const za of spec.axles) {
      zs.push(za - rA - 0.006, za + rA + 0.006);
      for (let k = 0; k <= 6; k++) zs.push(za + rA * Math.cos(k / 6 * PI));
    }
    for (const w of spec.windows || []) zs.push(w[0], w[1]);
    for (const w of spec.pillars || []) zs.push(w[0], w[1]);
    for (const z of spec.extraZ || []) zs.push(z);
    zs = zs.filter((z) => z >= zMin - 1e-6 && z <= zMax + 1e-6).sort((x, y) => x - y);
    const st = [];
    for (const z of zs) if (!st.length || z - st[st.length - 1] > 0.006) st.push(z);
    // split long spans inside a mode (keeps hood and roof curves smooth)
    const st2 = [];
    for (let i = 0; i < st.length; i++) {
      st2.push(st[i]);
      if (i < st.length - 1) {
        const [a, b] = keySeg((st[i] + st[i + 1]) / 2), len = st[i + 1] - st[i];
        if (a.mode === b.mode && len > 0.5) { const n = Math.ceil(len / 0.45); for (let k = 1; k < n; k++) st2.push(st[i] + len * k / n); }
      }
    }
    const rings = st2.map(ring);
    return { rings, keys, keySeg, spec, zMin, zMax, nr: rings[0].pts.length };
  }
  // per quad face normals and smoothed corner normals (corners only blend with neighbors within 55 degrees)
  function loftNormals(L) {
    const R = L.rings, nI = R.length - 1, nK = L.nr - 1, F = [];
    const P = (i, k) => new V3(R[i].pts[k][0], R[i].pts[k][1], R[i].z);
    for (let i = 0; i < nI; i++) {
      F.push([]);
      for (let k = 0; k < nK; k++) {
        const a = P(i, k), b = P(i, k + 1), c = P(i + 1, k + 1), d = P(i + 1, k);
        const n = new V3().subVectors(c, a).cross(new V3().subVectors(d, b));
        if (n.lengthSq() < 1e-12) n.set(1, 0, 0);
        F[i].push(n.normalize());
      }
    }
    const corner = (i, k, fi, fk) => {
      const f0 = F[fi][fk], s = new V3();
      for (const di of [-1, 0]) for (const dk of [-1, 0]) {
        const qi = i + di, qk = k + dk;
        if (qi < 0 || qk < 0 || qi >= nI || qk >= nK) continue;
        const f = F[qi][qk];
        if (f.dot(f0) > 0.57) s.add(f);
      }
      return s.lengthSq() > 0 ? s.normalize() : f0.clone();
    };
    return { F, corner };
  }
  /* sample the loft surface at (z, s) on one side (side 1: +x, -1: -x); s runs over the ring points 0..9 */
  function sampler(L, N) {
    const R = L.rings, NR = L.nr;
    // exact point on the drawn triangles (each quad is split along its (i,k)-(i+1,k+1) diagonal), with that triangle's normal
    return (z, s, side = 1) => {
      let i = 0; while (i < R.length - 2 && R[i + 1].z < z) i++;
      const tz = clamp((z - R[i].z) / ((R[i + 1].z - R[i].z) || 1), 0, 1);
      const k = clamp(Math.floor(s), 0, NR - 2), ts = clamp(s - k, 0, 1);
      const P = (ii, kk) => new V3(R[ii].pts[kk][0], R[ii].pts[kk][1], R[ii].z);
      const a = P(i, k), b = P(i, k + 1), c = P(i + 1, k + 1), d = P(i + 1, k);
      let p, n;
      if (ts >= tz) { p = a.clone().addScaledVector(new V3().subVectors(b, a), ts).addScaledVector(new V3().subVectors(c, b), tz); n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a)); }
      else { p = a.clone().addScaledVector(new V3().subVectors(d, a), tz).addScaledVector(new V3().subVectors(c, d), ts); n = new V3().subVectors(c, a).cross(new V3().subVectors(d, a)); }
      if (n.lengthSq() < 1e-12) n.copy(N.F[i][k]);
      n.normalize();
      return { p: new V3(p.x * side, p.y, p.z), n: new V3(n.x * side, n.y, n.z) };
    };
  }
  /* a thin patch laid on the surface: z0..z1 by s0..s1, lifted eps along the normal; uv over a rect (u along z unless
     uAlongS). The grid follows the body's own stations and ring points inside the patch (nz, ns are minimum splits),
     so the patch never dips under the body. */
  function surfPatch(S, z0, z1, s0, s1, nz, ns, side, eps, col, uvr, o = {}) {
    const so = K.soup(), grid = [];
    const zl = [], sl = [];
    for (let a = 0; a <= nz; a++) zl.push(lerp(z0, z1, a / nz));
    for (const z of S.zs || []) if (z > z0 + 0.002 && z < z1 - 0.002) zl.push(z);
    for (let b = 0; b <= ns; b++) sl.push(lerp(s0, s1, b / ns));
    for (let q = Math.ceil(s0); q < s1; q++) if (q > s0 + 0.01 && q < s1 - 0.01) sl.push(q);
    zl.sort((x, y) => x - y); sl.sort((x, y) => x - y);
    const Z = zl.filter((z, i) => !i || z - zl[i - 1] > 0.002), Sl = sl.filter((v, i) => !i || v - sl[i - 1] > 0.004);
    nz = Z.length - 1; ns = Sl.length - 1;
    for (let a = 0; a <= nz; a++) {
      grid.push([]);
      for (let b = 0; b <= ns; b++) {
        const z = Z[a], s = Sl[b], fa = (z - z0) / ((z1 - z0) || 1), fb = (s - s0) / ((s1 - s0) || 1), q = S(z, s, side);
        grid[a].push({ p: q.p.addScaledVector(q.n, eps), n: q.n, u: o.uAlongS ? [lerp(uvr[0], uvr[2], fb), lerp(uvr[1], uvr[3], fa)] : [lerp(uvr[0], uvr[2], side > 0 ? 1 - fa : fa), lerp(uvr[1], uvr[3], fb)] });
      }
    }
    for (let a = 0; a < nz; a++) for (let b = 0; b < ns; b++) {
      const A = grid[a][b], B = grid[a][b + 1], C = grid[a + 1][b + 1], D = grid[a + 1][b];
      const f = new V3().subVectors(B.p, A.p).cross(new V3().subVectors(D.p, A.p));
      if (f.dot(A.n) >= 0) so.quad(A.p, B.p, C.p, D.p, col, col, col, col, A.u, B.u, C.u, D.u);
      else so.quad(A.p, D.p, C.p, B.p, col, col, col, col, A.u, D.u, C.u, B.u);
    }
    const g = so.geo(false);
    if (o.glow) setGlow(g, o.glow);
    return g;
  }
  // the ring parameter s where the side of the body (s in 1..smax) passes height y at station z
  function sAtY(S, z, y, smax) {
    let prev = S(z, 1, 1).p.y;
    for (let k = 1; k < smax; k++) {
      for (let f = 1; f <= 4; f++) {
        const s = k + f / 4, py = S(z, s, 1).p.y;
        if ((prev - y) * (py - y) <= 0 && py !== prev) return s - 0.25 + 0.25 * (y - prev) / (py - prev);
        prev = py;
      }
    }
    return y < S(z, 1, 1).p.y ? 1 : smax;
  }
  // a decal on the side of the body between heights y0 and y1 (even in height, so lettering keeps its shape)
  function sidePatch(S, z0, z1, y0, y1, nz, ny, side, eps, uvr, smax) {
    const so = K.soup(), grid = [], Z = [];
    for (let a = 0; a <= nz; a++) Z.push(lerp(z0, z1, a / nz));
    for (const z of S.zs || []) if (z > z0 + 0.002 && z < z1 - 0.002) Z.push(z);
    Z.sort((x, y) => x - y);
    for (const z of Z) {
      const row = [], fa = (z - z0) / (z1 - z0);
      for (let b = 0; b <= ny; b++) {
        const y = lerp(y0, y1, b / ny), q = S(z, sAtY(S, z, y, smax), side);
        row.push({ p: q.p.addScaledVector(q.n, eps), n: q.n, u: [lerp(uvr[0], uvr[2], side > 0 ? 1 - fa : fa), lerp(uvr[1], uvr[3], b / ny)] });
      }
      grid.push(row);
    }
    for (let a = 0; a < grid.length - 1; a++) for (let b = 0; b < ny; b++) {
      const A = grid[a][b], B = grid[a][b + 1], C = grid[a + 1][b + 1], D = grid[a + 1][b];
      const f = new V3().subVectors(B.p, A.p).cross(new V3().subVectors(D.p, A.p));
      if (f.dot(A.n) >= 0) so.quad(A.p, B.p, C.p, D.p, [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], A.u, B.u, C.u, D.u);
      else so.quad(A.p, D.p, C.p, B.p, [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], A.u, D.u, C.u, B.u);
    }
    return so.geo(false);
  }
  // flat quad on an end face (z = zf, facing dir +1 front / -1 back): x0..x1, y0..y1
  function endQuad(zf, dir, x0, x1, y0, y1, col, uvr = vuv('white'), glow) {
    const g = prep(new THREE.PlaneGeometry(x1 - x0, y1 - y0));
    const a = g.attributes.uv.array;
    for (let i = 0; i < a.length; i += 2) { a[i] = lerp(uvr[0], uvr[2], a[i]); a[i + 1] = lerp(uvr[1], uvr[3], a[i + 1]); }
    if (dir < 0) g.rotateY(PI);
    g.translate((x0 + x1) / 2, (y0 + y1) / 2, zf);
    paint(g, col);
    if (glow) setGlow(g, glow);
    return g;
  }
  const NRs = (L) => L.nr;
  const whiteUV = (g) => { const u = g.attributes.uv.array, w = vuv('white'); for (let i = 0; i < u.length; i += 2) { u[i] = (w[0] + w[2]) / 2; u[i + 1] = (w[1] + w[3]) / 2; } return g; };

  /* build all parts of a car from a spec. Returns { body, glass, trim, lights } geometry lists, the sampler and the loft */
  function carShell(spec) {
    const L = buildLoft(spec), N = loftNormals(L), S = sampler(L, N), R = L.rings;
    S.zs = R.map((r) => r.z);
    const body = K.soup(), glass = K.soup(), trim = K.soup();
    const out = { body: [], glass: [], trim: [], lights: [] };
    const inRange = (z, list) => (list || []).some(([a, b]) => z > Math.min(a, b) && z < Math.max(a, b));
    const DK = C3(0x1a1b1c), UNDER = C3(0x26272a), BED = C3(0x2c2d30);
    const shade = (k, y) => (k <= 1 ? 0.62 : k === 2 ? 0.86 : 1.0);
    // classify quad (interval i, segment k): 'paint' | 'dark' | 'glass' | 'black' | 'skip'
    const NR = L.nr, kRail = spec.winTop ? 7 : 6;
    const cls = (i, k, side) => {
      const zm = (R[i].z + R[i + 1].z) / 2;
      const [a, b] = L.keySeg(zm);
      const ma = a.mode, mb = b.mode;
      if (k === 0) return 'dark';
      if (spec.doors && k >= 1 && k <= 5 && spec.doors.some((dd) => dd.side === side && zm > dd.z0 && zm < dd.z1)) return 'skip';
      if (k <= 4) return 'paint';
      if (ma === 'bed' && mb === 'bed') return k === 5 ? 'paint' : 'bed';
      if ((ma === 'bed') !== (mb === 'bed')) return k === 5 ? 'paint' : 'bed';
      const cab = ma === 'roof' || mb === 'roof';
      if (k === 5) {
        if (!cab) return 'paint';
        if (inRange(zm, spec.pillars)) return 'black';
        if (inRange(zm, side > 0 ? spec.windowsL || spec.windows : spec.windows)) return 'glass';
        return 'paint';
      }
      if (k <= kRail) return 'paint';
      // top: windshield and back light are glass, roof and hood are paint
      if (ma !== mb && cab) return (spec.noBacklight && ma === 'hood' && mb === 'roof' && zm < 0) ? 'paint' : 'glass';
      if (cab && inRange(zm, spec.sunroof)) return 'glass';
      return 'paint';
    };
    for (let i = 0; i < R.length - 1; i++) for (let k = 0; k < NR - 1; k++) {
      for (const side of [1, -1]) {
        const c = cls(i, k, side);
        if (c === 'skip') continue;
        const v = [[i, k], [i, k + 1], [i + 1, k + 1], [i + 1, k]].map(([ii, kk]) => ({
          p: new V3(R[ii].pts[kk][0] * side, R[ii].pts[kk][1], R[ii].z), n: N.corner(ii, kk, i, k),
        }));
        for (const q of v) q.n.x *= side;
        const target = c === 'glass' ? glass : c === 'paint' ? body : c === 'black' ? trim : body;
        const col = c === 'paint' ? mulc([1, 1, 1], shade(k)) : c === 'dark' ? UNDER : c === 'bed' ? BED : c === 'black' ? DK : (spec.glassCol || C3(0x18222a));
        const tintV = c === 'paint' ? 1 : 0;
        const order = side > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        const arr = target === body ? out.body : target === glass ? out.glass : out.trim;
        arr.push({ v, order, col, tint: tintV });
      }
    }
    // end caps (rungs across the first and last rings)
    const cap = (ri, dir) => {
      const rg = R[ri];
      for (let k = 0; k < NR - 1; k++) {
        const [x0, y0] = rg.pts[k], [x1, y1] = rg.pts[k + 1];
        const A = new V3(-x0, y0, rg.z), B = new V3(x0, y0, rg.z), C = new V3(x1, y1, rg.z), D = new V3(-x1, y1, rg.z);
        const n = new V3(0, 0, dir), v = [A, B, C, D].map((p) => ({ p, n }));
        const low = (y0 + y1) / 2 < rg.pts[0][1] + (spec.capDark || 0.06);
        const f = new V3().subVectors(B, A).cross(new V3().subVectors(C, A));
        const order = f.z * dir >= 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2];
        if (Math.abs(x0) < 1e-4 && Math.abs(x1) < 1e-4) continue;
        out.body.push({ v, order, col: low ? UNDER : [1, 1, 1], tint: low ? 0 : 1 });
      }
    };
    cap(0, -1); cap(R.length - 1, 1);
    // turn the quad lists into geometry
    const toGeo = (list) => {
      if (!list.length) return null;
      const n = list.length * 6, P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3), U = new Float32Array(n * 2), T = new Float32Array(n);
      const wu = vuv('white'), cu = (wu[0] + wu[2]) / 2, cv = (wu[1] + wu[3]) / 2;
      let o = 0;
      for (const q of list) for (const j of q.order) {
        const vv = q.v[j];
        P[o * 3] = vv.p.x; P[o * 3 + 1] = vv.p.y; P[o * 3 + 2] = vv.p.z;
        Nn[o * 3] = vv.n.x; Nn[o * 3 + 1] = vv.n.y; Nn[o * 3 + 2] = vv.n.z;
        Cc[o * 3] = q.col[0]; Cc[o * 3 + 1] = q.col[1]; Cc[o * 3 + 2] = q.col[2];
        U[o * 2] = q.uv ? q.uv[j][0] : (vv.p.z * 0.3); U[o * 2 + 1] = q.uv ? q.uv[j][1] : (vv.p.y * 0.3);
        T[o] = q.tint; o++;
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(P, 3));
      g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3));
      g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
      g.setAttribute('uv', new THREE.BufferAttribute(U, 2));
      g.setAttribute('tint', new THREE.BufferAttribute(T, 1));
      for (let i = 0; i < U.length; i += 2) { U[i] = cu; U[i + 1] = cv; }
      return g;
    };
    return { L, S, R, out, toGeo, N };
  }
  /* add the standard details to a car: seams, belt molding, mirrors, handles, lights, grille, plates, interior.
     d: { head, tail, grille, plate, mirrorZ, handles: [z], seams: [z], hoodSeam, trunkSeam, seats: [{ z, bench }], dashZ,
          wheelWells, driverX } */
  function carDetails(sh, spec, d) {
    const { S, R, L } = sh, trim = [], lights = [], paintG = [];
    const zN = L.zMax, zT = L.zMin, tipF = R[R.length - 1], tipR = R[0];
    const BLK = C3(0x161718), CHROME = C3(0xc8ccd0), RUB = C3(0x1e1f20);
    const white = vuv('white');
    // door seams (vertical, from the rocker to the belt) and the belt molding under the side glass
    for (const z of d.seams || []) for (const side of [1, -1]) trim.push(surfPatch(S, z - 0.006, z + 0.006, 1.6, 5.0, 1, 4, side, 0.003, C3(0x101010), white));
    if (d.beltMold) for (const side of [1, -1]) trim.push(surfPatch(S, d.beltMold[0], d.beltMold[1], 4.92, 5.08, 6, 1, side, 0.003, BLK, white));
    // hood and trunk lid seams: across at z, and along the sides to the end
    const lid = (z, z2) => {
      for (const side of [1, -1]) {
        trim.push(surfPatch(S, z - 0.005, z + 0.005, 5.2, 9.0, 1, 4, side, 0.003, C3(0x101010), white));
        trim.push(surfPatch(S, Math.min(z, z2), Math.max(z, z2), 5.35, 5.45, 4, 1, side, 0.003, C3(0x101010), white));
      }
    };
    if (d.hoodSeam) lid(d.hoodSeam, zN - 0.02);
    if (d.trunkSeam) lid(d.trunkSeam, zT + 0.02);
    // door handles: small body colored grips with a dark recess
    for (const z of d.handles || []) for (const side of [1, -1]) {
      const q = S(z, 3.75, side);
      const h = boxG(0.035, 0.03, 0.16, q.p.x + side * 0.012, q.p.y, q.p.z, [1, 1, 1]);
      paintG.push(setTint(whiteUV(h), 1));
      trim.push(surfPatch(S, z - 0.085, z + 0.085, 3.71, 3.79, 1, 1, side, 0.002, C3(0x3a3a3a), white));
    }
    // mirrors: a body colored shell on a black arm at the front of the side glass
    if (d.mirrorZ != null) for (const side of [1, -1]) {
      const q = S(d.mirrorZ, 5.05, side);
      const sh2 = roundBox(0.1, 0.13, 0.22, 0.04, [1, 1, 1]); sh2.translate(q.p.x + side * 0.16, q.p.y + 0.08, q.p.z - 0.02);
      paintG.push(setTint(whiteUV(sh2), 1));
      trim.push(whiteUV(boxG(0.14, 0.05, 0.08, q.p.x + side * 0.07, q.p.y + 0.03, q.p.z, BLK)));
      trim.push(whiteUV(endQuad(q.p.z - 0.131, -1, -0.045, 0.045, -0.05, 0.05, C3(0x8a9aa4)).translate(q.p.x + side * 0.16, q.p.y + 0.08, 0)));
    }
    // front: headlights wrapping the corners, grille, plate, lower intake; rear: tail lights, plate, bumper strip
    const fy0 = tipF.pts[0][1], fhw = tipF.pts[5][0];
    const ry0 = tipR.pts[0][1], rhw = tipR.pts[5][0];
    if (d.head) {
      const h = d.head;
      for (const side of [1, -1]) lights.push(surfPatch(S, zN - h.len, zN - 0.002, h.s0, h.s1, 3, 3, side, 0.004, C3(0xe8eef2), vuv('head'), { glow: 1.6 }));
      if (h.face) for (const side of [1, -1]) lights.push(endQuad(zN + 0.004, 1, side > 0 ? fhw * h.face[0] : -fhw, side > 0 ? fhw : -fhw * h.face[0], h.face[1], h.face[2], C3(0xe8eef2), vuv('head'), 1.6));
    }
    if (d.grille) { const gq = d.grille; trim.push(endQuad(zN + 0.005, 1, -gq[0], gq[0], gq[1], gq[2], [1, 1, 1], vuv(gq[3] || 'grille'))); }
    if (d.intake) { const iq = d.intake; trim.push(endQuad(zN + 0.005, 1, -iq[0], iq[0], iq[1], iq[2], [1, 1, 1], vuv('vent'))); }
    if (d.plateF) trim.push(endQuad(zN + 0.009, 1, -0.16, 0.16, d.plateF, d.plateF + 0.16, [1, 1, 1], vuv('plate')));
    if (d.tail) {
      const t = d.tail;
      for (const side of [1, -1]) lights.push(surfPatch(S, zT + 0.002, zT + t.len, t.s0, t.s1, 3, 3, side, 0.004, C3(0xffffff), vuv('tail'), { glow: 0.85 }));
      if (t.face) for (const side of [1, -1]) lights.push(endQuad(zT - 0.004, -1, side > 0 ? rhw * t.face[0] : -rhw, side > 0 ? rhw : -rhw * t.face[0], t.face[1], t.face[2], C3(0xffffff), vuv('tail'), 0.85));
    }
    if (d.plateR) trim.push(endQuad(zT - 0.009, -1, -0.16, 0.16, d.plateR, d.plateR + 0.16, [1, 1, 1], vuv('plate')));
    if (d.bumperR) trim.push(endQuad(zT - 0.006, -1, -rhw * 0.98, rhw * 0.98, ry0 + 0.01, d.bumperR, [1, 1, 1], vuv('bumper')));
    if (d.bumperF) trim.push(endQuad(zN + 0.006, 1, -fhw * 0.98, fhw * 0.98, fy0 + 0.01, d.bumperF, [1, 1, 1], vuv('bumper')));
    // windshield wipers resting at the foot of the windshield
    if (d.wipers !== false) {
      const roofK = L.keys.filter((q) => q.mode === 'roof'), front = roofK.length ? Math.max(...roofK.map((q) => q.z)) : 0;
      const cowl = L.keys.filter((q) => q.mode === 'hood' && q.z > front).reduce((m, q) => Math.min(m, q.z), Infinity);
      if (isFinite(cowl)) {
        const q = S(cowl - 0.05, NRs(L) - 1.4, 1), y = q.p.y + 0.025, z = q.p.z - 0.01;
        trim.push(whiteUV(rod(-0.62, y, z, 0.02, y + 0.02, z - 0.04, 0.012, BLK, 4)), whiteUV(rod(0.06, y, z, 0.68, y + 0.02, z - 0.04, 0.012, BLK, 4)));
      }
    }
    // exhaust tip
    trim.push(whiteUV(rod(-0.45, 0.24, zT + 0.12, -0.45, 0.25, zT - 0.03, 0.035, C3(0x6a6c6e), 6)));
    // wheel wells: dark liners behind each wheel
    for (const za of spec.axles) for (const side of [1, -1]) {
      const so = K.soup(), rA = spec.wr + 0.04, x = side * (spec.track / 2 - 0.16);
      for (let k = 0; k < 8; k++) {
        const a0 = k / 8 * PI, a1 = (k + 1) / 8 * PI;
        const A = new V3(x, spec.wr, za), B = new V3(x, spec.wr + Math.sin(a0) * rA, za + Math.cos(a0) * rA), C = new V3(x, spec.wr + Math.sin(a1) * rA, za + Math.cos(a1) * rA);
        if (side > 0) so.tri(A, C, B, C3(0x0e0e0e)); else so.tri(A, B, C, C3(0x0e0e0e));
      }
      trim.push(whiteUV(so.geo(false)));
    }
    // interior: floor, door panels, dash, seats, steering wheel, headliner
    if (d.seats) {
      const cz0 = d.cabin[0], cz1 = d.cabin[1], fl = d.floorY, ih = d.innerHW;
      const IN = C3(0x2e3034), SEAT = C3(d.seatCol || 0x3a3c40);
      trim.push(whiteUV(paint(prep(new THREE.PlaneGeometry(ih * 2, cz1 - cz0)).rotateX(-PI / 2).translate(0, fl, (cz0 + cz1) / 2), IN)));
      for (const s of [1, -1]) trim.push(whiteUV(paint(prep(new THREE.PlaneGeometry(cz1 - cz0, d.belt - fl)).rotateY(-s * PI / 2).translate(s * ih, (fl + d.belt) / 2, (cz0 + cz1) / 2), C3(0x45474a))));
      const rk = L.keys.filter((q) => q.mode === 'roof'), rz0 = Math.min(...rk.map((q) => q.z)), rz1 = Math.max(...rk.map((q) => q.z));
      trim.push(whiteUV(paint(prep(new THREE.PlaneGeometry(ih * 1.7, rz1 - rz0 - 0.1)).rotateX(PI / 2).translate(0, d.roofY - 0.06, (rz0 + rz1) / 2), C3(0x8a8884))));
      // dashboard and steering wheel
      trim.push(whiteUV(boxG(ih * 2, 0.2, 0.42, 0, d.belt - 0.04, cz1 - 0.12, C3(0x26282a))));
      const wheelG = prep(new THREE.TorusGeometry(0.17, 0.02, 4, 12)); wheelG.rotateX(-0.45); wheelG.translate(d.driverX, d.belt + 0.06, cz1 - 0.48); trim.push(whiteUV(paint(wheelG, BLK)));
      trim.push(whiteUV(rod(d.driverX, d.belt + 0.04, cz1 - 0.45, d.driverX, d.belt - 0.08, cz1 - 0.22, 0.025, BLK, 5)));
      for (const st of d.seats) {
        const xs = st.bench ? [0] : [-0.36, 0.36], sw = st.bench ? ih * 1.8 : 0.5;
        for (const x of xs) {
          trim.push(whiteUV(boxG(sw, 0.12, 0.5, x, fl + 0.24, st.z, SEAT)));
          trim.push(whiteUV(boxG(sw, 0.6, 0.13, 0, 0, 0, mulc(SEAT, 0.92)).rotateX(-0.2).translate(x, fl + 0.58, st.z - 0.27)));
          if (!st.bench || st.heads) for (const hx of st.bench ? [-ih * 0.55, 0, ih * 0.55] : [0]) trim.push(whiteUV(boxG(0.24, 0.16, 0.09, x + hx, fl + 0.96, st.z - 0.36, SEAT)));
        }
      }
    }
    return { trim, lights, paint: paintG };
  }
  // car wheel: tire (lathe) with an alloy or steel face on both sides, axle along x, centered at the origin
  const wheelCache = {};
  function wheelGeo(R0, W, style) {
    const key = R0.toFixed(3) + ':' + W.toFixed(3) + ':' + style;
    if (wheelCache[key]) return wheelCache[key];
    const rimR = R0 * 0.66, hw = W / 2;
    const prof = [[rimR, -hw + 0.012], [R0 * 0.8, -hw - 0.004], [R0 * 0.95, -hw + 0.012], [R0, -hw + 0.04], [R0, hw - 0.04], [R0 * 0.95, hw - 0.012], [R0 * 0.8, hw + 0.004], [rimR, hw - 0.012]];
    const tire = lathe(prof, 16, [1, 1, 1], { smooth: true, uRep: 3 });
    // tire uv: u around (repeats), v: across the profile into the top half of the texture
    { const uv = tire.attributes.uv.array, p = tire.attributes.position.array; for (let i = 0; i < uv.length / 2; i++) { const y = p[i * 3 + 1], rr = Math.hypot(p[i * 3], p[i * 3 + 2]); uv[i * 2 + 1] = rr > R0 * 0.985 ? 0.62 + 0.26 * clamp(0.5 + y / (W - 0.08), 0, 1) : rr > R0 * 0.9 ? 0.6 : 0.985; } }
    const faces = [];
    for (const s of [1, -1]) {
      const so = K.soup(), seg = 16, cu = style === 'steel' ? 0.75 : 0.25;
      for (let k = 0; k < seg; k++) {
        const a0 = k / seg * TAU, a1 = (k + 1) / seg * TAU;
        for (const [r0, r1, y0, y1] of [[0, rimR * 0.4, hw - 0.05, hw - 0.04], [rimR * 0.4, rimR, hw - 0.04, hw - 0.012]]) {
          const P = (r, a, y) => new V3(Math.sin(a) * r, y * s, Math.cos(a) * r);
          const U = (r, a) => [cu + Math.sin(a) * r / rimR * 0.24, 0.25 + Math.cos(a) * r / rimR * 0.24];
          const A = P(r0, a0, y0), B = P(r1, a0, y1), C = P(r1, a1, y1), D = P(r0, a1, y0);
          if (s > 0) so.quad(A, B, C, D, [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], U(r0, a0), U(r1, a0), U(r1, a1), U(r0, a1));
          else so.quad(A, D, C, B, [1, 1, 1], [1, 1, 1], [1, 1, 1], [1, 1, 1], U(r0, a0), U(r0, a1), U(r1, a1), U(r1, a0));
        }
      }
      const fg = so.geo(false);
      const n = fg.attributes.normal.array; for (let i = 0; i < n.length; i += 3) { n[i] = 0; n[i + 1] = s; n[i + 2] = 0; }
      faces.push(fg);
    }
    const g = merge([tire, ...faces]);
    g.rotateZ(-PI / 2);
    wheelCache[key] = g;
    return g;
  }

  /* ---------- the vehicle specs ---------- */
  // shorthand for profile keys: k(z, mode, top, belt, yb, hw, hb, hr, extra)
  const k = (z, mode, top, belt, yb, hw, hb, hr, x) => Object.assign({ z, mode, top, belt, yb, hw, hb, hr, bedY: 0 }, x || {});
  function carSpec(kind, v) {
    if (kind === 'sedan' && v === 0 || kind === 'taxi') {
      const hw = 0.92, hb = 0.87, zN = 2.425, zT = -2.425;
      const hood = k(2.17, 'hood', 0.82, 0.79, 0.21, hw, hb, 0.6);
      const deck = k(-2.2, 'hood', 1.03, 1.0, 0.22, hw - 0.005, hb, 0.6);
      return {
        L: 4.85, W: 1.84, H: 1.45, wr: 0.335, tireW: 0.225, track: 1.58, axles: [1.445, -1.375],
        keys: [
          ...endKeys(deck, -2.2, zT, { top: 0.88, belt: 0.86, yb: 0.36, hw: 0.76, hb: 0.72 }).reverse(), deck,
          k(-1.62, 'hood', 1.05, 1.0, 0.2, hw, hb, 0.6), k(-0.86, 'roof', 1.41, 0.99, 0.19, hw, hb, 0.6), k(-0.2, 'roof', 1.45, 0.975, 0.18, hw, hb, 0.63),
          k(0.5, 'roof', 1.44, 0.965, 0.18, hw, hb, 0.64), k(1.3, 'hood', 0.99, 0.94, 0.19, hw, hb, 0.6), k(1.8, 'hood', 0.91, 0.87, 0.2, hw, hb, 0.6), hood,
          ...endKeys(hood, 2.17, zN, { top: 0.66, belt: 0.64, yb: 0.3, hw: 0.74, hb: 0.69 }),
        ],
        windows: [[-0.8, -0.17], [-0.07, 1.22]], pillars: [[-0.17, -0.07]],
        details: {
          seams: [1.03, -0.12, -0.97], handles: [0.42, -0.42], mirrorZ: 1.12, beltMold: [-0.8, 1.22], hoodSeam: 1.27, trunkSeam: -1.56,
          head: { len: 0.27, s0: 3.75, s1: 6.6, face: [0.6, 0.53, 0.64] }, grille: [0.38, 0.52, 0.63], intake: [0.55, 0.36, 0.45], plateF: 0.355,
          tail: { len: 0.2, s0: 3.85, s1: 5.6, face: [0.58, 0.72, 0.84] }, plateR: 0.5, bumperR: 0.42, bumperF: 0.36,
          cabin: [-1.2, 1.3], floorY: 0.32, innerHW: 0.8, belt: 0.96, roofY: 1.43, driverX: 0.37, seats: [{ z: 0.15 }, { z: -0.6, bench: true, heads: true }],
        },
      };
    }
    if (kind === 'sedan') {
      const hw = 0.9, hb = 0.85, zN = 2.3, zT = -2.3;
      const hood = k(2.05, 'hood', 0.8, 0.77, 0.2, hw, hb, 0.6);
      const deck = k(-2.08, 'hood', 1.0, 0.98, 0.22, hw - 0.005, hb, 0.58);
      return {
        L: 4.6, W: 1.8, H: 1.42, wr: 0.32, tireW: 0.215, track: 1.55, axles: [1.38, -1.32],
        keys: [
          ...endKeys(deck, -2.08, zT, { top: 0.86, belt: 0.84, yb: 0.35, hw: 0.74, hb: 0.7 }).reverse(), deck,
          k(-1.72, 'hood', 1.02, 0.98, 0.2, hw, hb, 0.58), k(-1.0, 'roof', 1.36, 0.98, 0.19, hw, hb, 0.57), k(-0.3, 'roof', 1.42, 0.965, 0.18, hw, hb, 0.62),
          k(0.42, 'roof', 1.41, 0.955, 0.18, hw, hb, 0.63), k(1.22, 'hood', 0.97, 0.93, 0.19, hw, hb, 0.6), k(1.7, 'hood', 0.89, 0.85, 0.2, hw, hb, 0.6), hood,
          ...endKeys(hood, 2.05, zN, { top: 0.64, belt: 0.62, yb: 0.3, hw: 0.72, hb: 0.67 }),
        ],
        windows: [[-0.95, -0.22], [-0.12, 1.14]], pillars: [[-0.22, -0.12]],
        details: {
          seams: [0.98, -0.17, -0.94], handles: [0.36, -0.46], mirrorZ: 1.04, beltMold: [-0.95, 1.14], hoodSeam: 1.19, trunkSeam: -1.68,
          head: { len: 0.25, s0: 3.8, s1: 6.6, face: [0.62, 0.53, 0.62] }, grille: [0.36, 0.43, 0.56, 'grille2'], intake: [0.5, 0.32, 0.39], plateF: 0.39,
          tail: { len: 0.24, s0: 3.9, s1: 5.7, face: [0.55, 0.7, 0.83] }, plateR: 0.48, bumperR: 0.41, bumperF: 0.35,
          cabin: [-1.25, 1.22], floorY: 0.31, innerHW: 0.78, belt: 0.95, roofY: 1.4, driverX: 0.36, seats: [{ z: 0.06 }, { z: -0.72, bench: true, heads: true }], seatCol: 0x4a3a30,
        },
      };
    }
    if (kind === 'hatch') {
      const hw = 0.895, hb = 0.85, zN = 2.125, zT = -2.125;
      const hood = k(1.9, 'hood', 0.82, 0.79, 0.21, hw, hb, 0.6);
      const deck = k(-2.02, 'hood', 1.04, 1.0, 0.24, hw - 0.01, hb, 0.6);
      return {
        L: 4.25, W: 1.79, H: 1.48, wr: 0.32, tireW: 0.205, track: 1.54, axles: [1.24, -1.38],
        keys: [
          ...endKeys(deck, -2.02, zT, { top: 0.98, belt: 0.95, yb: 0.36, hw: 0.8, hb: 0.76 }).reverse(), deck,
          k(-1.68, 'roof', 1.44, 1.0, 0.2, hw, hb, 0.6), k(-0.6, 'roof', 1.48, 0.985, 0.18, hw, hb, 0.62),
          k(0.4, 'roof', 1.47, 0.97, 0.18, hw, hb, 0.63), k(1.18, 'hood', 1.0, 0.95, 0.19, hw, hb, 0.6), k(1.55, 'hood', 0.92, 0.88, 0.2, hw, hb, 0.6), hood,
          ...endKeys(hood, 1.9, zN, { top: 0.67, belt: 0.65, yb: 0.3, hw: 0.73, hb: 0.68 }),
        ],
        windows: [[-1.6, -1.3], [-1.18, -0.2], [-0.1, 1.08]], pillars: [[-0.2, -0.1], [-1.3, -1.18]],
        details: {
          seams: [0.95, -0.15, -1.0], handles: [0.34, -0.5], mirrorZ: 0.99, beltMold: [-1.6, 1.08], hoodSeam: 1.14, trunkSeam: null,
          head: { len: 0.24, s0: 3.8, s1: 6.6, face: [0.6, 0.56, 0.65] }, grille: [0.34, 0.47, 0.6, 'grille2'], intake: [0.5, 0.33, 0.42], plateF: 0.43,
          tail: { len: 0.2, s0: 3.9, s1: 5.95, face: [0.6, 0.78, 0.95] }, plateR: 0.55, bumperR: 0.44, bumperF: 0.37,
          cabin: [-1.75, 1.16], floorY: 0.31, innerHW: 0.78, belt: 0.97, roofY: 1.46, driverX: 0.36, seats: [{ z: -0.02 }, { z: -0.92, bench: true, heads: true }], seatCol: 0x30363e,
        },
      };
    }
    if (kind === 'suv') {
      const hw = 0.95, hb = 0.9, zN = 2.375, zT = -2.375;
      const hood = k(2.12, 'hood', 1.06, 1.02, 0.28, hw, hb, 0.66);
      const deck = k(-2.25, 'hood', 1.16, 1.12, 0.3, hw - 0.01, hb, 0.66);
      return {
        L: 4.75, W: 1.9, H: 1.76, wr: 0.37, tireW: 0.245, track: 1.64, axles: [1.43, -1.37],
        keys: [
          ...endKeys(deck, -2.25, zT, { top: 1.1, belt: 1.07, yb: 0.42, hw: 0.84, hb: 0.8 }).reverse(), deck,
          k(-2.08, 'roof', 1.72, 1.13, 0.28, hw, hb, 0.68), k(-0.8, 'roof', 1.76, 1.12, 0.26, hw, hb, 0.7),
          k(0.38, 'roof', 1.75, 1.1, 0.26, hw, hb, 0.71), k(1.2, 'hood', 1.16, 1.1, 0.27, hw, hb, 0.66), k(1.7, 'hood', 1.11, 1.06, 0.28, hw, hb, 0.66), hood,
          ...endKeys(hood, 2.12, zN, { top: 0.94, belt: 0.92, yb: 0.4, hw: 0.82, hb: 0.77 }),
        ],
        windows: [[-1.98, -1.12], [-1.0, -0.2], [-0.1, 1.1]], pillars: [[-0.2, -0.1], [-1.12, -1.0]],
        details: {
          seams: [0.98, -0.15, -1.0], handles: [0.32, -0.55], mirrorZ: 1.0, beltMold: [-1.98, 1.1], hoodSeam: 1.16, trunkSeam: null,
          head: { len: 0.26, s0: 3.85, s1: 6.6, face: [0.58, 0.8, 0.92] }, grille: [0.5, 0.66, 0.9], intake: [0.62, 0.45, 0.56], plateF: 0.48,
          tail: { len: 0.2, s0: 4.0, s1: 5.6, face: [0.6, 0.94, 1.08] }, plateR: 0.66, bumperR: 0.56, bumperF: 0.5,
          cabin: [-2.1, 1.18], floorY: 0.42, innerHW: 0.82, belt: 1.1, roofY: 1.72, driverX: 0.4, seats: [{ z: -0.05 }, { z: -1.0, bench: true, heads: true }], seatCol: 0x2c2c2e,
          roofRails: [-1.9, 0.3],
        },
      };
    }
    if (kind === 'van') {
      const hw = 0.99, hb = 0.94, zN = 2.55, zT = -2.55;
      const hood = k(2.3, 'hood', 0.99, 0.95, 0.24, hw, hb, 0.72);
      const deck = k(-2.47, 'hood', 1.12, 1.08, 0.26, hw - 0.01, hb, 0.72);
      return {
        L: 5.1, W: 1.98, H: 1.78, wr: 0.35, tireW: 0.235, track: 1.72, axles: [1.55, -1.48],
        keys: [
          ...endKeys(deck, -2.47, zT, { top: 1.08, belt: 1.05, yb: 0.36, hw: 0.88, hb: 0.84 }).reverse(), deck,
          k(-2.38, 'roof', 1.72, 1.1, 0.24, hw, hb, 0.74), k(-0.9, 'roof', 1.78, 1.09, 0.22, hw, hb, 0.76),
          k(0.72, 'roof', 1.77, 1.08, 0.22, hw, hb, 0.77), k(1.78, 'hood', 1.13, 1.06, 0.23, hw, hb, 0.72), hood,
          ...endKeys(hood, 2.3, zN, { top: 0.8, belt: 0.78, yb: 0.32, hw: 0.86, hb: 0.81 }),
        ],
        windows: [[-2.2, -1.25], [-1.12, -0.16], [-0.06, 1.62]], pillars: [[-0.16, -0.06], [-1.25, -1.12]],
        details: {
          seams: [1.25, -0.1, -1.18], handles: [0.5, -0.32], mirrorZ: 1.5, beltMold: [-2.2, 1.62], hoodSeam: 1.75, trunkSeam: null,
          head: { len: 0.26, s0: 3.9, s1: 6.6, face: [0.6, 0.66, 0.78] }, grille: [0.46, 0.5, 0.66], intake: [0.6, 0.36, 0.46], plateF: 0.47,
          tail: { len: 0.14, s0: 4.2, s1: 5.2, face: [0.7, 0.9, 1.06] }, plateR: 0.6, bumperR: 0.5, bumperF: 0.42,
          cabin: [-2.4, 1.7], floorY: 0.38, innerHW: 0.86, belt: 1.08, roofY: 1.74, driverX: 0.42, seats: [{ z: 0.35 }, { z: -0.6 }, { z: -1.6, bench: true, heads: true }], seatCol: 0x4a4440,
          slideTrack: [-1.3, -0.12],
        },
      };
    }
    if (kind === 'pickup') {
      const hw = 1.0, hb = 0.95, zN = 2.8, zT = -2.8;
      const hood = k(2.62, 'hood', 1.24, 1.2, 0.36, hw, hb, 0.7);
      const tail = k(-2.75, 'bed', 1.32, 1.3, 0.42, hw, hb, 0.7, { bedY: 0.9 });
      return {
        L: 5.6, W: 2.0, H: 1.88, wr: 0.4, tireW: 0.27, track: 1.72, axles: [1.75, -1.85],
        keys: [
          k(-2.8, 'bed', 1.3, 1.28, 0.5, hw - 0.01, hb - 0.01, 0.7, { bedY: 0.9 }), tail,
          k(-0.86, 'bed', 1.32, 1.3, 0.38, hw, hb, 0.7, { bedY: 0.9 }), k(-0.8, 'hood', 1.33, 1.29, 0.36, hw, hb, 0.7),
          k(-0.74, 'roof', 1.86, 1.28, 0.36, hw, hb, 0.74), k(0.65, 'roof', 1.88, 1.27, 0.36, hw, hb, 0.76),
          k(1.4, 'hood', 1.32, 1.25, 0.36, hw, hb, 0.7), k(2.1, 'hood', 1.28, 1.22, 0.36, hw, hb, 0.7), hood,
          ...endKeys(hood, 2.62, zN, { top: 1.1, belt: 1.08, yb: 0.44, hw: 0.9, hb: 0.85 }),
        ],
        windows: [[-0.66, -0.12], [-0.02, 1.3]], pillars: [[-0.12, -0.02]], noBacklight: false,
        details: {
          seams: [1.1, -0.07, -0.72], handles: [0.42, -0.4], mirrorZ: 1.2, beltMold: [-0.66, 1.3], hoodSeam: 1.37, trunkSeam: null,
          head: { len: 0.2, s0: 4.2, s1: 6.2, face: [0.58, 0.95, 1.08] }, grille: [0.56, 0.72, 1.04], intake: [0.66, 0.5, 0.62], plateF: 0.53,
          tail: { len: 0.1, s0: 4.3, s1: 5.4, face: [0.8, 0.92, 1.2] }, plateR: 0.6, bumperR: 0.6, bumperF: 0.56,
          cabin: [-0.74, 1.4], floorY: 0.52, innerHW: 0.86, belt: 1.27, roofY: 1.84, driverX: 0.42, seats: [{ z: 0.3 }, { z: -0.45, bench: true, heads: true }], seatCol: 0x5a4a3c,
          tailgate: true,
        },
      };
    }
    if (kind === 'animalvan') {
      // high roof cargo van: side glass only in the cab doors, cargo walls behind
      const hw = 1.01, hb = 0.97, zN = 2.75, zT = -2.75;
      const hood = k(2.52, 'hood', 1.18, 1.14, 0.3, hw, hb, 0.82);
      const deck = k(-2.7, 'roof', 2.38, 1.08, 0.32, hw - 0.01, hb, 0.86);
      return {
        L: 5.5, W: 2.02, H: 2.48, wr: 0.36, tireW: 0.235, track: 1.74, axles: [1.85, -1.5],
        keys: [
          k(-2.75, 'roof', 2.34, 1.06, 0.4, hw - 0.04, hb - 0.04, 0.82), deck,
          k(-1.0, 'roof', 2.48, 1.1, 0.3, hw, hb, 0.88), k(0.85, 'roof', 2.48, 1.12, 0.3, hw, hb, 0.88), k(1.2, 'roof', 2.38, 1.13, 0.3, hw, hb, 0.85),
          k(1.42, 'roof', 1.98, 1.14, 0.3, hw, hb, 0.84), k(2.05, 'hood', 1.28, 1.16, 0.3, hw, hb, 0.82), hood,
          ...endKeys(hood, 2.52, zN, { top: 0.98, belt: 0.95, yb: 0.36, hw: 0.9, hb: 0.86 }),
        ],
        windows: [[0.98, 1.95]], pillars: [], winTop: 1.95,
        details: {
          seams: [1.98, 0.92, -0.25, -2.69], handles: [1.2, -0.45], mirrorZ: 1.92, beltMold: [0.98, 1.95], hoodSeam: 2.0, trunkSeam: null,
          head: { len: 0.22, s0: 3.9, s1: 6.6, face: [0.6, 0.78, 0.92] }, grille: [0.5, 0.56, 0.76, 'grille2'], intake: [0.62, 0.4, 0.5], plateF: 0.5,
          tail: { len: 0.06, s0: 3.6, s1: 4.8, face: [0.8, 0.9, 1.5] }, plateR: 0.6, bumperR: 0.52, bumperF: 0.44,
          cabin: [0.9, 2.0], floorY: 0.46, innerHW: 0.88, belt: 1.12, roofY: 2.0, driverX: 0.42, seats: [{ z: 1.15 }],
          vanDecal: true, lightbar: true, rearDoors: true,
        },
      };
    }
    if (kind === 'truck') {
      // box truck: van style cab in front, a tall box on the frame behind it, dual rear wheels
      const hw = 1.0, hb = 0.96, zN = 3.75, zT = 0.95;
      const hood = k(3.5, 'hood', 1.3, 1.24, 0.42, hw, hb, 0.8);
      return {
        L: 7.5, W: 2.3, H: 3.4, wr: 0.4, tireW: 0.24, track: 1.8, axles: [2.6, -1.85],
        keys: [
          k(zT, 'roof', 2.3, 1.22, 0.5, hw - 0.02, hb - 0.02, 0.84), k(zT + 0.05, 'roof', 2.34, 1.24, 0.42, hw, hb, 0.86),
          k(2.2, 'roof', 2.35, 1.24, 0.42, hw, hb, 0.86), k(2.6, 'roof', 2.32, 1.24, 0.42, hw, hb, 0.85),
          k(3.0, 'hood', 1.38, 1.26, 0.42, hw, hb, 0.8), hood,
          ...endKeys(hood, 3.5, zN, { top: 1.1, belt: 1.07, yb: 0.46, hw: 0.9, hb: 0.86 }),
        ],
        axlesLoft: [2.6], windows: [[1.5, 2.85]], pillars: [], winTop: 1.95,
        details: {
          seams: [2.88, 1.45], handles: [1.62], mirrorZ: 2.75, beltMold: [1.5, 2.85], hoodSeam: 3.02, trunkSeam: null,
          head: { len: 0.2, s0: 4.0, s1: 6.4, face: [0.55, 0.88, 1.0] }, grille: [0.5, 0.62, 0.86, 'grille2'], intake: [0.6, 0.5, 0.58], plateF: 0.52,
          bumperF: 0.52,
          cabin: [1.0, 3.0], floorY: 0.6, innerHW: 0.88, belt: 1.24, roofY: 2.3, driverX: 0.42, seats: [{ z: 1.6 }],
          box: { z0: -3.75, z1: 0.9, y0: 1.06, y1: 3.4, hw: 1.15 },
        },
      };
    }
    return null;
  }

  /* assemble one vehicle kind / variant into instanced parts */
  const vehCache = {};
  const VEHICLES = { sedan: 2, hatch: 1, suv: 1, van: 1, pickup: 1, taxi: 1, truck: 1, animalvan: 1 };
  function vehicle(kind = 'sedan', variant = 0) {
    if (!VEHICLES[kind]) kind = 'sedan';
    const v = ((Math.floor(variant) % VEHICLES[kind]) + VEHICLES[kind]) % VEHICLES[kind];
    const key = kind + ':' + v;
    if (vehCache[key]) return vehCache[key];
    const spec = carSpec(kind, v);
    const loftSpec = Object.assign({}, spec, { axles: spec.axlesLoft || spec.axles });
    const sh = carShell(loftSpec);
    const d = spec.details, det = carDetails(sh, loftSpec, d);
    const bodyG = [sh.toGeo(sh.out.body), ...det.paint], glassG = [sh.toGeo(sh.out.glass)], trimG = [sh.toGeo(sh.out.trim), ...det.trim], lightG = [...det.lights];
    const fixed = kind === 'taxi' ? C3(0xf2c118) : kind === 'animalvan' || kind === 'truck' ? C3(0xf4f4f0) : null;
    const extraLights = [], headPts = [], tailPts = [];
    const zN = sh.L.zMax, zT = sh.L.zMin;
    // roof rails, sliding door track, tail gate handle, roof sign, light bar, the truck box
    if (d.roofRails) for (const s of [1, -1]) { const x = s * 0.6; trimG.push(whiteUV(roundBox(0.05, 0.05, d.roofRails[1] - d.roofRails[0], 0.02, C3(0x2a2c2e)).translate(x, spec.H + 0.01, (d.roofRails[0] + d.roofRails[1]) / 2))); for (const z of d.roofRails) trimG.push(whiteUV(boxG(0.06, 0.06, 0.08, x, spec.H - 0.02, z, C3(0x2a2c2e)))); }
    if (d.slideTrack) for (const s of [1, -1]) trimG.push(surfPatch(sh.S, d.slideTrack[0] - 0.9, d.slideTrack[0] + 0.1, 4.55, 4.65, 3, 1, s, 0.003, C3(0x101010), vuv('white')));
    if (d.tailgate) trimG.push(endQuad(zT - 0.006, -1, -0.12, 0.12, 1.12, 1.18, C3(0x2a2a2a)));
    if (d.rearDoors) {
      // two rear doors: windows, the seam between them, handles
      for (const sx of [1, -1]) glassG.push(endQuad(zT - 0.005, -1, sx > 0 ? 0.08 : -0.78, sx > 0 ? 0.78 : -0.08, 1.3, 1.9, C3(0x18222a)));
      trimG.push(endQuad(zT - 0.007, -1, -0.006, 0.006, 0.45, 2.25, C3(0x101010)), endQuad(zT - 0.007, -1, -0.2, -0.06, 1.05, 1.09, C3(0x2a2a2a)));
    }
    if (kind === 'taxi') {
      const sg = roundBox(0.62, 0.2, 0.26, 0.05, [1, 1, 1]); sg.translate(0, 1.55, -0.25);
      { const u = sg.attributes.uv.array, p = sg.attributes.position.array, n = sg.attributes.normal.array, r0 = vuv('taxi'); for (let i = 0; i < u.length / 2; i++) { const ax = Math.abs(n[i * 3]) > 0.7; u[i * 2] = ax ? lerp(r0[0], r0[2], (p[i * 3 + 2] + 0.38) / 0.26) : lerp(r0[0], r0[2], n[i * 3 + 2] < -0.7 ? (0.31 - p[i * 3]) / 0.62 : (p[i * 3] + 0.31) / 0.62); u[i * 2 + 1] = lerp(r0[1], r0[3], (p[i * 3 + 1] - 1.45) / 0.2); } }
      extraLights.push(setGlow(sg, 1.0));
      trimG.push(whiteUV(boxG(0.5, 0.06, 0.16, 0, 1.44, -0.25, C3(0x1a1a1a))));
      // checker band along the doors
      for (const s of [1, -1]) trimG.push(surfPatch(sh.S, -1.0, 1.0, 3.2, 3.42, 8, 1, s, 0.003, C3(0x1a1a1a), vuv('white')));
    }
    if (d.lightbar) {
      const lb = roundBox(1.2, 0.1, 0.24, 0.04, C3(0xffa418)); lb.translate(0, spec.H + 0.06, 1.0); extraLights.push(setGlow(whiteUV(lb), 0.0));
      trimG.push(whiteUV(boxG(1.0, 0.04, 0.16, 0, spec.H + 0.01, 1.0, C3(0x222222))));
    }
    if (d.vanDecal) for (const s of [1, -1]) {
      // the lettering sits in the paint part (same material and sheen as the white body)
      bodyG.push(setTint(sidePatch(sh.S, -2.5, 0.8, 0.9, 1.85, 10, 4, s, 0.005, vuv('van'), 6), 0));
    }
    let boxGeo = null;
    if (d.box) {
      const b = d.box, bw = b.hw * 2, bh = b.y1 - b.y0, bl = b.z1 - b.z0, bz = (b.z0 + b.z1) / 2;
      const shell = roundBox(bw, bh, bl, 0.05, [1, 1, 1]); shell.translate(0, (b.y0 + b.y1) / 2, bz);
      bodyG.push(setTint(whiteUV(paint(shell, (x, y, z) => (y < b.y0 + 0.08 ? C3(0x2a2a2a) : C3(0xf4f4f0)))), 0));
      // side panels with lettering, a roll up door at the back, rub rails, marker lights, frame, mud flaps, bumper
      for (const s of [1, -1]) {
        const p = quadUV(bl - 0.5, bh - 0.4, vuv('box')); p.rotateY(s * PI / 2); p.translate(s * (b.hw + 0.004), (b.y0 + b.y1) / 2 + 0.05, bz); trimG.push(p);
        trimG.push(whiteUV(boxG(0.03, 0.06, bl, s * (b.hw + 0.015), b.y0 + 0.25, bz, C3(0x3a3a3a))));
        for (const z of [b.z0 + 0.15, bz, b.z1 - 0.15]) extraLights.push(setGlow(whiteUV(boxG(0.03, 0.05, 0.08, s * (b.hw + 0.02), b.y1 - 0.1, z, z < bz - 1 ? C3(0xd8241a) : C3(0xffa418))), 0.6));
      }
      const door = boxG(bw - 0.2, bh - 0.25, 0.03, 0, (b.y0 + b.y1) / 2 - 0.05, b.z0 - 0.01, C3(0xe0e0dc));
      { const p = door.attributes.position.array, c = door.attributes.color.array; for (let i = 0; i < p.length / 3; i++) { const f = Math.floor((p[i * 3 + 1] - b.y0) / 0.25) % 2 ? 0.92 : 1.0; c[i * 3] *= f; c[i * 3 + 1] *= f; c[i * 3 + 2] *= f; } }
      for (let y = b.y0 + 0.2; y < b.y1 - 0.2; y += 0.25) trimG.push(whiteUV(boxG(bw - 0.22, 0.012, 0.012, 0, y, b.z0 - 0.03, C3(0x9a9a96))));
      trimG.push(whiteUV(door), whiteUV(boxG(0.3, 0.05, 0.05, 0, b.y0 + 0.35, b.z0 - 0.04, C3(0x2a2a2a))));
      trimG.push(whiteUV(boxG(bw, 0.12, 0.2, 0, b.y0 - 0.38, b.z0 + 0.05, C3(0x2a2a2a))));
      for (const s of [1, -1]) {
        trimG.push(whiteUV(boxG(0.12, 0.22, b.z1 - b.z0 + 2.2, s * 0.45, b.y0 - 0.17, bz + 1.0, C3(0x1c1c1c))));
        trimG.push(whiteUV(boxG(0.4, 0.45, 0.02, s * 0.9, 0.42, -1.85 - 0.6, C3(0x141414))));
        extraLights.push(setGlow(whiteUV(boxG(0.18, 0.22, 0.03, s * (b.hw - 0.2), b.y0 + 0.2, b.z0 - 0.03, C3(0xd8241a))), 0.9));
        tailPts.push({ x: s * (b.hw - 0.2), y: b.y0 + 0.2, z: b.z0 - 0.03 });
      }
      // fuel tank on the side of the frame
      trimG.push(whiteUV(cyl(0.22, 0.22, 0.9, 10, C3(0x8a8e92)).rotateX(PI / 2).translate(-0.72, 0.62, -0.2)));
      // cab back wall and roof marker lights
      for (const x of [-0.3, 0, 0.3]) extraLights.push(setGlow(whiteUV(boxG(0.08, 0.04, 0.05, x, 2.37, 2.7, C3(0xffa418))), 0.6));
    }
    // light positions for the user
    const hq = sh.S(zN - 0.05, 5.0, 1).p, tq = sh.S(zT + 0.05, 4.6, 1).p;
    for (const s of [1, -1]) { headPts.push({ x: s * Math.abs(hq.x) * 0.92, y: hq.y, z: zN }); if (!d.box) tailPts.push({ x: s * Math.abs(tq.x) * 0.92, y: tq.y, z: zT }); }
    // color the paint for fixed color vehicles (tint off)
    const bodyGeo = merge(bodyG.filter(Boolean));
    if (fixed) {
      const c = bodyGeo.attributes.color.array, t = bodyGeo.attributes.tint.array;
      for (let i = 0; i < t.length; i++) if (t[i] > 0.5) { c[i * 3] *= fixed[0]; c[i * 3 + 1] *= fixed[1]; c[i * 3 + 2] *= fixed[2]; t[i] = 0; }
    }
    const wheels = [];
    for (const [ai, za] of spec.axles.entries()) {
      const dual = kind === 'truck' && ai === 1;
      for (const s of [1, -1]) {
        if (dual) { wheels.push({ x: s * (spec.track / 2 - 0.0), y: spec.wr, z: za, r: spec.wr }, { x: s * (spec.track / 2 - spec.tireW - 0.02), y: spec.wr, z: za, r: spec.wr }); }
        else wheels.push({ x: s * spec.track / 2, y: spec.wr, z: za, r: spec.wr });
      }
    }
    const parts = [
      { geometry: bodyGeo, material: VM.paint(), tint: !fixed, castShadow: true },
      { geometry: merge([...trimG.filter(Boolean)]), material: VM.trim(), tint: false, castShadow: true },
      { geometry: merge(glassG.filter(Boolean)), material: VM.glass(), tint: false, castShadow: false },
      { geometry: merge([...lightG, ...extraLights]), material: VM.lights(), tint: false, castShadow: false },
    ];
    for (const p of parts) { p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere(); }
    const wstyle = kind === 'truck' || kind === 'animalvan' ? 'steel' : 'alloy';
    const res = {
      kind, variant: v, parts,
      wheel: { geometry: wheelGeo(spec.wr, spec.tireW, wstyle), material: VM.wheel() },
      wheels, len: spec.L, wid: spec.W, h: spec.H,
      lights: { head: headPts, tail: tailPts },
    };
    res.tris = parts.reduce((n, p) => n + tris(p.geometry), 0);
    vehCache[key] = res;
    return res;
  }

  /* ---------- the city bus: 12.2 m low floor, doors on the right (-x) side, lit interior ---------- */
  const busIntMat = () => smat('busInterior', { std: false }, { vcGlow: 'night' });
  let busProto = null;
  function buildBus() {
    const L0 = 12.2, hw = 1.295, zN = 6.1, zT = -6.1, wr = 0.5, fA = 3.8, rA = -3.25;
    const winTop = 2.62, belt = 1.12, top = 3.06;
    const kk = (z, top2, yb, hw2, x) => k(z, 'roof', top2, belt, yb, hw2, hw2 - 0.012, hw2 - 0.055, x);
    const doors = [{ z0: 4.62, z1: 5.82, side: -1 }, { z0: 0.35, z1: 1.55, side: -1 }];
    // windows: right side (-x) around the doors, left side (+x) with a driver window
    const winR = [[5.84, 5.97], [3.2, 4.58], [1.6, 3.12], [-0.6, 0.3], [-2.2, -0.68], [-3.8, -2.28], [-5.4, -3.88]];
    const winL = [[4.35, 5.95], [2.75, 4.27], [1.15, 2.67], [-0.45, 1.07], [-2.05, -0.53], [-3.65, -2.13], [-5.4, -3.73]];
    const pillarsL = [];
    const spec = {
      wr, tireW: 0.3, track: 2.06, axles: [fA, rA], winTop, roofR: 0.16,
      keys: [
        kk(zT, top - 0.12, 0.42, hw - 0.04), kk(zT + 0.06, top - 0.05, 0.36, hw - 0.012), kk(zT + 0.18, top, 0.32, hw),
        kk(zN - 0.2, top, 0.3, hw), kk(zN - 0.07, top - 0.04, 0.32, hw - 0.012), kk(zN, top - 0.12, 0.36, hw - 0.045),
      ],
      windows: winR, windowsL: winL, pillars: pillarsL, doors,
      extraZ: [...doors.flatMap((d) => [d.z0, d.z1]), ...winL.flat()],
    };
    const sh = carShell(spec), S = sh.S;
    const body = sh.toGeo(sh.out.body), glassL = [sh.toGeo(sh.out.glass)], trim = [sh.toGeo(sh.out.trim)], lights = [], inner = [], paintX = [];
    // livery by height: dark skirt, a blue band under the windows, white above; the ends keep the same bands
    {
      const p = body.attributes.position.array, c = body.attributes.color.array, t = body.attributes.tint.array;
      for (let i = 0; i < p.length / 3; i++) {
        const y = p[i * 3 + 1];
        const col = y < 0.5 ? C3(0x2e3236) : y < 0.95 ? C3(0x1f5f9a) : y < 1.02 ? C3(0x3a9a5a) : C3(0xf2f2ee);
        const f = c[i * 3] < 0.5 && t[i] < 0.5 ? 0.4 : 1;
        c[i * 3] = col[0] * f; c[i * 3 + 1] = col[1] * f; c[i * 3 + 2] = col[2] * f; t[i] = 0;
      }
    }
    const BLK = C3(0x18191a), white = vuv('white');
    // front: big windshield, LED destination sign, headlights, turn signals, bumper, plate, wipers, mirrors on arms
    glassL.push(endQuad(zN + 0.004, 1, -1.13, 1.13, 1.0, 2.62, C3(0x22323c)));
    for (const [x0, x1, y0, y1] of [[-1.2, 1.2, 0.94, 1.0], [-1.2, 1.2, 2.62, 2.68], [-1.2, -1.13, 0.94, 2.68], [1.13, 1.2, 0.94, 2.68]]) trim.push(endQuad(zN + 0.005, 1, x0, x1, y0, y1, BLK));
    lights.push(endQuad(zN + 0.006, 1, -0.98, 0.98, 2.69, 2.9, [1, 1, 1], vuv('led'), 1.6));
    trim.push(endQuad(zN + 0.004, 1, -1.05, 1.05, 2.66, 2.93, BLK));
    for (const s of [1, -1]) {
      lights.push(endQuad(zN + 0.006, 1, s > 0 ? 0.72 : -1.12, s > 0 ? 1.12 : -0.72, 0.55, 0.72, C3(0xe8eef2), vuv('head'), 1.6));
      lights.push(endQuad(zN + 0.006, 1, s > 0 ? 0.5 : -0.68, s > 0 ? 0.68 : -0.5, 0.58, 0.68, C3(0xffa418), white, 0));
      trim.push(whiteUV(rod(s * 1.18, 2.35, zN - 0.05, s * 1.5, 2.45, zN + 0.32, 0.025, BLK, 5)), whiteUV(roundBox(0.12, 0.34, 0.08, 0.03, BLK).translate(s * 1.52, 2.25, zN + 0.34)));
      trim.push(whiteUV(rod(s * 0.05, 1.04, zN + 0.02, s * 0.85, 1.32, zN + 0.025, 0.012, BLK, 4)));
    }
    trim.push(endQuad(zN + 0.007, 1, -hw * 0.98, hw * 0.98, 0.34, 0.52, [1, 1, 1], vuv('bumper')));
    trim.push(endQuad(zN + 0.01, 1, -0.16, 0.16, 0.36, 0.52, [1, 1, 1], vuv('plate')));
    // folded bike rack in front of the lower windshield
    trim.push(whiteUV(boxG(1.4, 0.05, 0.05, 0, 0.62, zN + 0.12, BLK)), whiteUV(boxG(1.4, 0.05, 0.05, 0, 1.18, zN + 0.12, BLK)));
    for (const x of [-0.6, 0.6]) trim.push(whiteUV(boxG(0.05, 0.6, 0.05, x, 0.9, zN + 0.12, BLK)));
    // rear: engine grille, vertical tail lights, rear window, plate, bumper
    trim.push(endQuad(zT - 0.006, -1, -0.9, 0.9, 0.62, 1.6, [1, 1, 1], vuv('vent')));
    glassL.push(endQuad(zT - 0.004, -1, -0.95, 0.95, 2.05, 2.7, C3(0x22323c)));
    for (const s of [1, -1]) lights.push(endQuad(zT - 0.006, -1, s > 0 ? 0.98 : -1.2, s > 0 ? 1.2 : -0.98, 0.6, 1.5, [1, 1, 1], vuv('tail'), 0.9));
    trim.push(endQuad(zT - 0.008, -1, -0.16, 0.16, 0.4, 0.56, [1, 1, 1], vuv('plate')), endQuad(zT - 0.006, -1, -hw * 0.98, hw * 0.98, 0.36, 0.5, [1, 1, 1], vuv('bumper')));
    // roof: air conditioning pod and a front fairing, marker lights
    paintX.push(setTint(whiteUV(roundBox(2.1, 0.28, 2.6, 0.1, C3(0xe8e8e4)).translate(0, top + 0.12, -3.6)), 0), setTint(whiteUV(roundBox(2.0, 0.14, 1.4, 0.06, C3(0xe8e8e4)).translate(0, top + 0.05, 4.4)), 0));
    for (const s of [1, -1]) for (const z of [zN - 0.1, zT + 0.1]) lights.push(setGlow(whiteUV(boxG(0.05, 0.05, 0.06, s * (hw - 0.03), top - 0.06, z, z > 0 ? C3(0xffa418) : C3(0xd8241a))), 0.6));
    // seams around the doors and a belt molding
    for (const d of doors) for (const z of [d.z0 - 0.004, d.z1 + 0.004]) trim.push(surfPatch(S, z - 0.008, z + 0.008, 1.2, 5.95, 1, 5, -1, 0.004, BLK, white));
    // the doors: two glazed leaves per door, hinged at the outer edges, swinging out
    const grp = new THREE.Group(); grp.name = 'bus';
    const leafMeshes = [];
    for (const [di, d] of doors.entries()) {
      const w = (d.z1 - d.z0) / 2 - 0.01, h = winTop - 0.38, x = -hw - 0.02, nameA = di ? 'busDoorM' : 'busDoorF';
      for (const [li, hingeZ, dir] of [[0, d.z1, -1], [1, d.z0, 1]]) {
        const pv = new THREE.Group(); pv.name = li ? nameA + 'b' : nameA; pv.position.set(x, 0.36, hingeZ);
        const fr = [], gl = [];
        const zc = dir * w / 2;
        fr.push(boxG(0.05, 0.08, w, 0, h - 0.04, zc, BLK), boxG(0.05, 0.1, w, 0, 0.05, zc, BLK), boxG(0.05, h, 0.06, 0, h / 2, dir * 0.03, BLK), boxG(0.05, h, 0.06, 0, h / 2, dir * (w - 0.03), BLK));
        fr.push(boxG(0.05, 0.06, w, 0, 0.75, zc, BLK));
        gl.push(K.vPanel(0, 0.04, 0, dir * (w - 0.05), 0.1, h - 0.08, C3(0x2a3a44)));
        const fm = meshOf(merge(fr.map(whiteUV)), VM.trim()); const gm = meshOf(merge(gl), VM.busGlass(), false, false); gm.renderOrder = 2;
        pv.add(fm, gm);
        grp.add(pv); leafMeshes.push(pv);
      }
      // step well and door frame inside the opening
      inner.push(boxG(0.02, winTop - 0.3, 0.06, -hw + 0.03, (winTop + 0.3) / 2, d.z0, C3(0x2a2c2e)), boxG(0.02, winTop - 0.3, 0.06, -hw + 0.03, (winTop + 0.3) / 2, d.z1, C3(0x2a2c2e)));
      inner.push(boxG(0.3, 0.06, d.z1 - d.z0, -hw + 0.15, 0.36, (d.z0 + d.z1) / 2, C3(0x3a3c40)), boxG(0.3, 0.02, d.z1 - d.z0, -hw + 0.15, 0.395, (d.z0 + d.z1) / 2, C3(0xd8b020)));
    }
    // interior: floor, raised rear deck, walls, ceiling with light strips, seats, stanchions and the driver
    const IW = hw - 0.07, FL = 0.4, CE = 2.86;
    const plane = (w, h, rx, ry, x, y, z, col) => paint(prep(new THREE.PlaneGeometry(w, h)).rotateX(rx).rotateY(ry).translate(x, y, z), col);
    inner.push(plane(IW * 2, 11.8, -PI / 2, 0, 0, FL, 0, C3(0x4a4c50)));
    inner.push(boxG(IW * 2, 0.4, 3.6, 0, FL + 0.2, -4.2, C3(0x4a4c50)));
    for (const s of [1, -1]) {
      inner.push(plane(11.9, belt - FL, 0, -s * PI / 2, s * IW, (belt + FL) / 2, 0, C3(0x6a6e72)));
      inner.push(plane(11.9, CE - winTop, 0, -s * PI / 2, s * IW, (CE + winTop) / 2, 0, C3(0xd8d8d2)));
    }
    inner.push(plane(IW * 2, 11.9, PI / 2, 0, 0, CE, 0, C3(0xe8e8e2)));
    inner.push(plane(IW * 2, CE - FL, 0, PI, 0, (CE + FL) / 2, zN - 0.12, C3(0x4a4c50)), plane(IW * 2, CE - FL, 0, 0, 0, (CE + FL) / 2, zT + 0.12, C3(0x5a5e62)));
    for (const s of [1, -1]) lights.push(setGlow(whiteUV(boxG(0.16, 0.02, 10.6, s * 0.62, CE - 0.012, -0.2, C3(0xf4f2ea))), 1.5));
    const seat = (x, z, y0, face = 1) => {
      const c = C3(0x2a4a7a);
      inner.push(boxG(0.44, 0.1, 0.42, x, y0 + 0.44, z, c));
      inner.push(boxG(0.44, 0.52, 0.08, 0, 0, 0, mulc(c, 0.9)).rotateX(-0.12 * face).translate(x, y0 + 0.72, z - face * 0.22));
      inner.push(boxG(0.06, 0.4, 0.06, x, y0 + 0.2, z, C3(0x8a8e92)));
    };
    for (let z = -5.5; z < 3.6; z += 0.82) {
      const yb2 = z < -2.4 ? FL + 0.4 : FL;
      if (Math.abs(z - 3.8) < 0.7 || Math.abs(z + 3.25) < 0.7) continue;
      for (const x of [0.43, 0.9]) seat(x, z, yb2);
      if (!(z > 0.0 && z < 1.9)) for (const x of [-0.43, -0.9]) seat(x, z, yb2);
    }
    // yellow stanchions and ceiling rails
    for (const [x, z] of [[-0.25, 4.4], [0.25, 3.3], [-0.25, 2.0], [-0.25, 0.1], [0.25, -1.2], [-0.25, -2.6], [0.25, 1.0]]) inner.push(lathe([[0.02, FL], [0.02, CE]], 6, C3(0xe8b818)).translate(x, 0, z));
    for (const s of [1, -1]) inner.push(rod(s * 0.3, CE - 0.14, -5.6, s * 0.3, CE - 0.14, 5.0, 0.018, C3(0xc8ccd0), 5));
    // driver (left side, facing +z): seat, body, head, arms on a big flat steering wheel
    const dx = 0.62, dz = 5.1;
    inner.push(roundBox(0.5, 0.12, 0.5, 0.04, C3(0x2a2a2c)).translate(dx, FL + 0.45, dz), roundBox(0.5, 0.7, 0.12, 0.04, C3(0x2a2a2c)).translate(dx, FL + 0.85, dz - 0.27));
    inner.push(roundBox(0.4, 0.55, 0.26, 0.1, C3(0x2f4f7a)).translate(dx, FL + 0.82, dz - 0.08));
    inner.push(ell(dx, FL + 1.28, dz - 0.04, 0.11, 0.13, 0.12, C3(0xc89a78), 1));
    inner.push(ell(dx, FL + 1.34, dz - 0.07, 0.115, 0.08, 0.12, C3(0x3a2a1a), 1));
    for (const s of [1, -1]) inner.push(tubeC([new V3(dx + s * 0.21, FL + 1.0, dz - 0.05), new V3(dx + s * 0.22, FL + 0.8, dz + 0.15), new V3(dx + s * 0.14, FL + 0.9, dz + 0.4)], 0.045, C3(0x2f4f7a), 5));
    inner.push(roundBox(0.32, 0.14, 0.5, 0.06, C3(0x2a2c30)).translate(dx, FL + 0.5, dz + 0.3));
    const sw = prep(new THREE.TorusGeometry(0.24, 0.022, 4, 14)); sw.rotateX(-1.2); sw.translate(dx, FL + 0.92, dz + 0.45); inner.push(paint(sw, BLK));
    inner.push(roundBox(IW * 2, 0.5, 0.5, 0.1, C3(0x26282a)).translate(0, FL + 0.55, zN - 0.35));
    // put it together
    const bodyGeo = merge([body, ...paintX]);
    grp.add(meshOf(bodyGeo, VM.paint()));
    grp.add(meshOf(merge(trim.filter(Boolean)), VM.trim()));
    const gm = meshOf(merge(glassL.filter(Boolean)), VM.busGlass(), false, false); gm.renderOrder = 2; grp.add(gm);
    grp.add(meshOf(merge(lights), VM.lights(), false, false));
    grp.add(meshOf(setGlow(merge(inner.map((g) => whiteUV(g))), 0.6), busIntMat(), false, true));
    const wg = wheelGeo(wr, 0.3, 'steel'), wheelNames = [];
    for (const [ai, za] of [fA, rA].entries()) for (const s of [1, -1]) for (const dual of ai ? [0, 1] : [0]) {
      const m = meshOf(wg, VM.wheel()); m.name = 'busWheel' + (ai ? 'R' : 'F') + (s > 0 ? 'L' : 'R') + dual;
      m.position.set(s * (spec.track / 2 - dual * 0.32), wr, za); grp.add(m); wheelNames.push(m.name);
    }
    let tri = 0; grp.traverse((m) => { if (m.isMesh) tri += tris(m.geometry); });
    grp.userData = {
      len: L0, wid: hw * 2, h: top + 0.26, stopSide: 'right', wheels: wheelNames, tris: tri,
      doors: [doorRec('busDoorF', 'swing', 1.45), doorRec('busDoorM', 'swing', 1.45)],
      doorZ: doors.map((d) => ({ z0: d.z0, z1: d.z1, x: -hw })), floorY: FL,
      lights: { head: [{ x: 0.92, y: 0.64, z: zN }, { x: -0.92, y: 0.64, z: zN }], tail: [{ x: 1.09, y: 1.05, z: zT }, { x: -1.09, y: 1.05, z: zT }] },
    };
    return grp;
  }
  // the second leaf of each door follows the first (setDoors turns the named leaf; this mirrors it)
  function linkLeaves(g) {
    for (const nm of ['busDoorF', 'busDoorM']) {
      const A = g.getObjectByName(nm), B = g.getObjectByName(nm + 'b');
      if (!A || !B) continue;
      const base = A.rotation._onChangeCallback;
      A.rotation._onChange(() => { if (base) base(); B.rotation.y = -A.rotation.y; });
    }
    return g;
  }
  function bus() {
    if (!busProto) busProto = buildBus();
    const g = busProto.clone();
    g.userData = JSON.parse(JSON.stringify(busProto.userData));
    return linkLeaves(resolveDoors(g));
  }

  /* ============================================================
     Public API
     ============================================================ */
  Object.assign(Env, {
    fountain, streetTick, signalHead, setSignal, walkHead, setWalk, streetMaterials, townSign, streetSign, roadSign,
    vehicle, bus, VEHICLES,
  });
})();
