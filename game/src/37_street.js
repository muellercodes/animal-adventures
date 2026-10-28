/* ---------- street kit: street furniture, traffic lights, road and sidewalk materials, park pieces, cars and buses ----------
   Adds to Env. Uses the scenery kit from 35_envkit through Env._k.
   Units are meters, Y up, base at y = 0, fronts face +z. Everything is procedural (geometry, canvas textures, shaders).
   What it adds:
     instanced props (Env.prop): streetlamp, parklamp, trafficpole, bench, parkbench, trashcan, hydrant, mailbox, busstop, planter,
       newsbox (3 colors), bikerack, bollard, picnic, flowerbed (2), statue (2: bear, stag), gazebo, drinking.
       Extra fields on some: colliders [{ x, z, r }] (radius 0 then), light { x, y, z }, mounts (trafficpole), seat, floorY.
       Parts flagged pool: true are additive light pools on the ground that only show at night (skip them if unwanted).
     more instanced props (round two):
       signs on posts: stopsign, streetsign2 (4: blank blades with block numbers), oneway (2: arrow left, right), noparking,
         parkingsign, speedlimit, busstopsign (wait), crosswalksign;
       alley: dumpster (2), trashbags (2), recycling, pallet, crates (2: wood, milk crates), acunit (2: ground, wall), gaspipe
         (2: gas meters, electric meters; both stand against a wall at z = 0), fence8 (2: wood, chain link; 3 m long);
       street life: cafetable (2, seats), foodcart (2, vendor), sandwichboard, bicycle (2), treegrate (trunk), parkingmeter,
         kiosk (2), phonebooth, streetclock, planterbox (2), cone, barrier;
       parking lots: parkbooth (light, window), wheelstop (2), lotlight (2, light and lights).
     Env.fountain(), Env.streetTick(dt), Env.signalHead(), Env.setSignal(head, 'r' | 'y' | 'g' | 'off' | 'fr' | 'fy'),
     Env.walkHead(), Env.setWalk(head, true | false | 'flash'), Env.streetMaterials() (road is the 14 m city street; see the uv
     notes at the surfaces), Env.townSign(name), Env.streetSign(nameA, nameB), Env.roadSign(text, arrow),
     Env.vehicle(kind, variant) (wagon, coupe and motorcycle added; the motorcycle also has rider and lean), Env.bus(),
     Env.VEHICLES. */
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
  const poolMs = {};
  function poolMat(k = 0.28) {
    if (poolMs[k]) return poolMs[k];
    const poolM = poolMs[k] = new THREE.MeshBasicMaterial({ map: TXS.pool(), color: K.lcol(0xffc884), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: true, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    poolM.onBeforeCompile = (sh) => {
      sh.uniforms.stNight = nightU;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', 'uniform float stNight;\nvoid main() {')
        .replace('vec4 diffuseColor = vec4( diffuse, opacity );', `vec4 diffuseColor = vec4( diffuse * stNight * ${k.toFixed(3)}, opacity );`)
        .replace('#include <fog_fragment>', `#ifdef USE_FOG
  gl_FragColor.rgb *= 1.0 - smoothstep( fogNear, fogFar, vFogDepth );
#endif`);
    };
    poolM.customProgramCacheKey = () => 'st-pool' + k;
    return poolM;
  }
  // flat disc under a lamp: radius rad centered at (x, z), a hair above the ground
  function poolGeo(rad, x, z, y = 0.025, sx = 1) {
    const g = prep(new THREE.CircleGeometry(rad, 28));
    g.rotateX(-PI / 2); g.scale(sx, 1, 1); g.translate(x, y, z);
    return paint(g, [1, 1, 1]);
  }
  const poolPart = (g, k) => ({ geometry: g, material: poolMat(k), castShadow: false, pool: true });

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
     Second street atlas (sRGB, 1024 x 1024): sign faces and the decals of the alley, street life and parking lot props.
     Regions marked (alpha) have see through parts and are drawn with the alpha tested material.
     ============================================================ */
  const AT2 = {
    stop: R(0, 0, 256, 256), xwalk: R(256, 0, 256, 256), speed: R(512, 0, 192, 240), noPark: R(704, 0, 160, 240), park: R(864, 0, 160, 240),
    oneL: R(0, 256, 480, 160), oneR: R(480, 256, 480, 160), gasDial: R(962, 258, 60, 60), eMeter: R(962, 322, 60, 60),
    blade0: R(0, 418, 256, 52), blade1: R(256, 418, 256, 52), blade2: R(512, 418, 256, 52), blade3: R(768, 418, 256, 52),
    xplaque: R(0, 474, 128, 64), dumpLabel: R(130, 474, 252, 64), phoneSign: R(384, 474, 254, 48), parkSign: R(640, 474, 254, 62),
    meterFace: R(896, 474, 62, 94), phoneKeys: R(960, 474, 62, 94),
    clock: R(0, 540, 256, 256), recycle: R(258, 540, 124, 124), rates: R(384, 540, 126, 160), schedule: R(512, 540, 94, 188),
    grate: R(610, 542, 188, 188), fan: R(802, 572, 124, 124), spokes: R(930, 572, 92, 92), fins: R(258, 668, 124, 60),
    crate: R(802, 700, 124, 92), stripes: R(610, 734, 188, 58), white: R(932, 700, 12, 12),
    map: R(0, 798, 140, 226), ad0: R(142, 798, 140, 226), ad1: R(284, 798, 140, 226), chalk: R(426, 798, 148, 226),
    hotdog: R(576, 798, 448, 110), icecream: R(576, 912, 448, 110),
  };
  TXS.atlas2 = () => canvasTex('st_atlas2', AW, AW, (c, w, h, r) => {
    c.clearRect(0, 0, w, h);
    const box = (x, y, bw, bh, col) => { c.fillStyle = col; c.fillRect(x, y, bw, bh); };
    const text = (s, x, y, size, col, font = FONT, align = 'center', maxW = 0) => {
      c.fillStyle = col; c.textAlign = align; c.textBaseline = 'middle';
      let fs = size; c.font = font(fs);
      while (maxW && fs > 8 && c.measureText(s).width > maxW) { fs -= 1; c.font = font(fs); }
      c.fillText(s, x, y);
    };
    const poly = (pts, col) => { c.fillStyle = col; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); };
    const oct = (cx, cy, R0) => { const p = []; for (let k = 0; k < 8; k++) { const a = PI / 8 + k * PI / 4; p.push([cx + Math.cos(a) * R0, cy + Math.sin(a) * R0]); } return p; };
    // sun faded sign sheeting: faint grain over a region
    const weather = (x, y, bw, bh, a = 0.06) => { for (let i = 0; i < bw * bh / 30; i++) { c.fillStyle = r() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; c.fillRect(x + r() * bw, y + r() * bh, 1.5, 1.5); } };
    // a walking person pictogram (sign style), center x, ground y, height hh
    const walker = (x, y, hh, col) => {
      const s = hh / 100; c.fillStyle = col; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.arc(x + 4 * s, y - 88 * s, 10 * s, 0, TAU); c.fill();
      c.lineWidth = 14 * s; c.beginPath(); c.moveTo(x + 2 * s, y - 72 * s); c.lineTo(x - 2 * s, y - 40 * s); c.stroke();
      c.lineWidth = 9 * s;
      c.beginPath(); c.moveTo(x + 1 * s, y - 68 * s); c.lineTo(x - 14 * s, y - 52 * s); c.lineTo(x - 22 * s, y - 38 * s); c.stroke();
      c.beginPath(); c.moveTo(x + 3 * s, y - 68 * s); c.lineTo(x + 17 * s, y - 54 * s); c.lineTo(x + 28 * s, y - 50 * s); c.stroke();
      c.beginPath(); c.moveTo(x - 2 * s, y - 40 * s); c.lineTo(x - 16 * s, y - 20 * s); c.lineTo(x - 26 * s, y - 2 * s); c.stroke();
      c.beginPath(); c.moveTo(x - 2 * s, y - 40 * s); c.lineTo(x + 14 * s, y - 22 * s); c.lineTo(x + 18 * s, y - 2 * s); c.stroke();
    };
    // STOP: white border on red, white letters
    poly(oct(128, 128, 128), '#f2f0ea'); poly(oct(128, 128, 118), '#b8141e');
    { const g = c.createLinearGradient(0, 0, 256, 256); g.addColorStop(0, 'rgba(255,255,255,0.08)'); g.addColorStop(1, 'rgba(0,0,0,0.08)'); c.fillStyle = g; c.fill(); }
    text('STOP', 128, 132, 84, '#f4f2ec', FONTC);
    weather(0, 0, 256, 256);
    // pedestrian crossing: fluorescent yellow green diamond, black border and walker
    poly([[384, 2], [510, 128], [384, 254], [258, 128]], '#b8d22a');
    c.strokeStyle = '#141414'; c.lineWidth = 7; c.beginPath(); c.moveTo(384, 14); c.lineTo(498, 128); c.lineTo(384, 242); c.lineTo(270, 128); c.closePath(); c.stroke();
    walker(384, 196, 128, '#141414'); weather(258, 0, 252, 256);
    // SPEED LIMIT 25
    box(512, 0, 192, 240, '#f2f2ec'); c.strokeStyle = '#141414'; c.lineWidth = 6; K.rrect(c, 520, 8, 176, 224, 14); c.stroke();
    text('SPEED', 608, 48, 40, '#141414', FONTC); text('LIMIT', 608, 90, 40, '#141414', FONTC); text('25', 608, 170, 112, '#141414', FONTC);
    weather(512, 0, 192, 240);
    // NO PARKING ANY TIME
    box(704, 0, 160, 240, '#f2f2ec'); c.strokeStyle = '#b8141e'; c.lineWidth = 5; K.rrect(c, 710, 6, 148, 228, 10); c.stroke();
    text('P', 784, 66, 78, '#141414', FONT);
    c.strokeStyle = '#c8141e'; c.lineWidth = 9; c.beginPath(); c.arc(784, 64, 44, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(753, 33); c.lineTo(815, 95); c.stroke();
    text('NO', 784, 132, 32, '#c8141e', FONTC); text('PARKING', 784, 164, 32, '#c8141e', FONTC, 'center', 140); text('ANY TIME', 784, 200, 24, '#141414', FONTC);
    weather(704, 0, 160, 240);
    // 2 HOUR PARKING with a green P
    box(864, 0, 160, 240, '#f2f2ec'); c.strokeStyle = '#1a6a3a'; c.lineWidth = 5; K.rrect(c, 870, 6, 148, 228, 10); c.stroke();
    c.strokeStyle = '#1a6a3a'; c.lineWidth = 6; c.beginPath(); c.arc(944, 58, 38, 0, TAU); c.stroke(); text('P', 944, 60, 56, '#1a6a3a', FONT);
    text('2 HOUR', 944, 120, 34, '#1a6a3a', FONTC); text('PARKING', 944, 152, 28, '#1a6a3a', FONTC); text('8AM - 6PM', 944, 186, 24, '#1a6a3a', FONTC); text('MON - SAT', 944, 214, 22, '#1a6a3a', FONTC);
    weather(864, 0, 160, 240);
    // ONE WAY: black panel, white arrow with black letters
    for (const [x0, dir] of [[0, -1], [480, 1]]) {
      box(x0, 256, 480, 160, '#141414'); c.strokeStyle = '#f2f2ec'; c.lineWidth = 5; K.rrect(c, x0 + 7, 263, 466, 146, 10); c.stroke();
      const cx = x0 + 240, cy = 336, L2 = 200, hh = 34, head = 76;
      const pts = [[-L2, -hh], [L2 - head, -hh], [L2 - head, -hh - 26], [L2, 0], [L2 - head, hh + 26], [L2 - head, hh], [-L2, hh]].map(([x, y]) => [cx + x * dir, cy + y]);
      poly(pts, '#f2f2ec');
      text('ONE WAY', cx - dir * 30, cy + 2, 50, '#141414', FONTC);
      weather(x0, 256, 480, 160);
    }
    // gas meter dials and an electric meter face
    box(962, 258, 60, 60, '#e8e4d8'); for (let k = 0; k < 4; k++) { const x = 970 + k * 14, y = 280; c.strokeStyle = '#2a2a2a'; c.lineWidth = 1.5; c.beginPath(); c.arc(x + 4, y, 5.5, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(x + 4, y); c.lineTo(x + 4 + Math.cos(k * 1.7) * 4, y + Math.sin(k * 1.7) * 4); c.stroke(); }
    box(970, 296, 44, 12, '#2a2a2a'); for (let k = 0; k < 5; k++) text(String((k * 7 + 3) % 10), 975 + k * 8.5, 302, 10, '#f2f2f2', FONTC);
    { const g = c.createRadialGradient(990, 350, 2, 992, 352, 30); g.addColorStop(0, '#f6f6f2'); g.addColorStop(0.75, '#e2e2dc'); g.addColorStop(1, '#8a8e90'); c.fillStyle = g; c.beginPath(); c.arc(992, 352, 29, 0, TAU); c.fill(); }
    box(976, 338, 32, 10, '#1a1a1a'); text('04172', 992, 343, 9, '#9adf6a', FONTC); box(980, 356, 24, 3, '#2a2a2a'); text('kWh', 992, 368, 8, '#2a2a2a');
    // street name blades with no name: green, white border, a block number at the end
    for (let k = 0; k < 4; k++) {
      const x0 = k * 256;
      box(x0, 418, 256, 52, '#1f6b3e'); c.strokeStyle = '#f2f4f0'; c.lineWidth = 3; K.rrect(c, x0 + 4, 422, 248, 44, 6); c.stroke();
      text(String((k + 1) * 100), x0 + 228, 445, 14, '#f2f4f0', FONTC);
      weather(x0, 418, 256, 52, 0.05);
    }
    // crossing plaque: a diagonal arrow down to the left
    box(0, 474, 128, 64, '#b8d22a'); c.strokeStyle = '#141414'; c.lineWidth = 4; K.rrect(c, 4, 478, 120, 56, 6); c.stroke();
    c.save(); c.translate(64, 506); c.rotate(PI * 0.75); poly([[-26, -5], [8, -5], [8, -14], [26, 0], [8, 14], [8, 5], [-26, 5]], '#141414'); c.restore();
    // dumpster sticker
    box(130, 474, 252, 64, '#f0eee6'); box(130, 474, 252, 18, '#2a5a3a'); text('CITY WASTE SERVICES', 256, 483, 13, '#f0eee6');
    text('KEEP LIDS CLOSED', 256, 506, 20, '#1a1a1a', FONTC); text('NO HAZARDOUS WASTE', 256, 527, 13, '#b8141e', FONTC);
    // PHONE band (lit), PARKING band (lit)
    box(384, 474, 254, 48, '#1d4f91'); text('PHONE', 511, 499, 34, '#f4f6f8'); box(394, 480, 234, 3, '#e8ecf0'); box(394, 515, 234, 3, '#e8ecf0');
    box(640, 474, 254, 62, '#123a6a'); c.fillStyle = '#f4f6f8'; K.rrect(c, 650, 482, 46, 46, 8); c.fill(); text('P', 673, 507, 38, '#123a6a'); text('PARKING', 796, 506, 40, '#f4f6f8', FONTC);
    // parking meter window: a time dial with a red pointer, the coin plate
    box(896, 474, 62, 94, '#2a2c2e'); c.fillStyle = '#f2f0e8'; K.rrect(c, 902, 480, 50, 44, 8); c.fill();
    for (let k = 0; k < 9; k++) { const a = PI + k / 8 * PI; c.strokeStyle = '#1a1a1a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(927 + Math.cos(a) * 18, 514 + Math.sin(a) * 18); c.lineTo(927 + Math.cos(a) * 14, 514 + Math.sin(a) * 14); c.stroke(); }
    c.strokeStyle = '#c8141e'; c.lineWidth = 2.5; c.beginPath(); c.moveTo(927, 514); c.lineTo(939, 500); c.stroke();
    box(904, 530, 46, 32, '#a8acb0'); box(915, 536, 24, 4, '#1a1a1a'); text('25c', 927, 552, 12, '#1a1a1a', FONTC);
    // pay phone keypad
    box(960, 474, 62, 94, '#b8bcc0'); box(966, 480, 50, 14, '#203024'); text('INSERT COIN', 991, 487, 7, '#9adf6a', FONTC);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { c.fillStyle = '#e8eaec'; K.rrect(c, 970 + j * 15, 500 + i * 14, 12, 11, 2); c.fill(); c.fillStyle = '#2a2a2a'; c.fillRect(974 + j * 15, 504 + i * 14, 4, 3); }
    box(1002, 560, 14, 4, '#1a1a1a');
    // street clock face: cream dial, black numerals, hands at ten past ten
    { c.fillStyle = '#1c1f1d'; c.beginPath(); c.arc(128, 668, 128, 0, TAU); c.fill();
      const g = c.createRadialGradient(118, 656, 10, 128, 668, 118); g.addColorStop(0, '#fbf6e8'); g.addColorStop(1, '#e8dcc0'); c.fillStyle = g; c.beginPath(); c.arc(128, 668, 116, 0, TAU); c.fill();
      c.strokeStyle = '#2a2420'; c.lineWidth = 2; c.beginPath(); c.arc(128, 668, 104, 0, TAU); c.stroke();
      for (let k = 0; k < 60; k++) { const a = k / 60 * TAU; const r0 = k % 5 ? 98 : 92; c.lineWidth = k % 5 ? 1.5 : 3.5; c.beginPath(); c.moveTo(128 + Math.sin(a) * r0, 668 - Math.cos(a) * r0); c.lineTo(128 + Math.sin(a) * 104, 668 - Math.cos(a) * 104); c.stroke(); }
      const RN = ['XII', 'I', 'II', 'III', 'IIII', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI'];
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; text(RN[k], 128 + Math.sin(a) * 76, 668 - Math.cos(a) * 76, 17, '#2a2420', FONTS); }
      text('CITY HALL', 128, 712, 11, '#5a4a3a', FONTS);
      const hand = (a, len, wd) => { c.save(); c.translate(128, 668); c.rotate(a); c.fillStyle = '#1a1612'; c.beginPath(); c.moveTo(-wd, 12); c.lineTo(-wd * 0.6, -len); c.lineTo(0, -len - 8); c.lineTo(wd * 0.6, -len); c.lineTo(wd, 12); c.fill(); c.restore(); };
      hand((10 + 10 / 60) / 12 * TAU, 52, 5); hand(10 / 60 * TAU, 82, 3.5);
      c.fillStyle = '#1a1612'; c.beginPath(); c.arc(128, 668, 6, 0, TAU); c.fill(); }
    // recycling cart label: white chasing arrows on the cart blue
    box(258, 540, 124, 124, '#1f5aa8');
    for (let k = 0; k < 3; k++) { c.save(); c.translate(320, 594); c.rotate(k * TAU / 3); c.strokeStyle = '#f4f6f8'; c.lineWidth = 9; c.beginPath(); c.moveTo(-24, 20); c.lineTo(14, 20); c.stroke(); poly([[12, 8], [28, 20], [12, 32]], '#f4f6f8'); c.restore(); }
    text('RECYCLE', 320, 650, 18, '#f4f6f8', FONTC);
    // parking rates board
    box(384, 540, 126, 160, '#f2f2ec'); box(384, 540, 126, 34, '#123a6a'); text('PUBLIC', 447, 551, 14, '#f4f6f8'); text('PARKING', 447, 566, 14, '#f4f6f8');
    text('$2', 447, 604, 40, '#123a6a', FONTC); text('PER HOUR', 447, 632, 14, '#1a1a1a', FONTC); text('$12 DAY MAX', 447, 654, 14, '#1a1a1a', FONTC); text('PAY HERE', 447, 682, 16, '#b8141e', FONTC);
    // bus schedule
    box(512, 540, 94, 188, '#f4f4f0'); box(512, 540, 94, 26, '#1f5f9a'); text('ROUTE 12', 559, 553, 14, '#ffffff');
    for (let i = 0; i < 12; i++) { box(518, 574 + i * 12, 26, 5, '#2a3a4a'); box(552, 574 + i * 12, 46 - r() * 14, 5, '#7a848c'); }
    // tree grate (alpha): cast iron with radial slots around the trunk hole
    { const cx = 704, cy = 636, Rh = 94; c.fillStyle = '#3a3634'; c.fillRect(cx - Rh, cy - Rh, Rh * 2, Rh * 2);
      for (let i = 0; i < 700; i++) { const x = cx - Rh + r() * Rh * 2, y = cy - Rh + r() * Rh * 2; c.fillStyle = r() < 0.5 ? 'rgba(120,70,40,0.35)' : 'rgba(20,20,20,0.3)'; c.fillRect(x, y, 2, 2); }
      c.strokeStyle = '#4a4440'; c.lineWidth = 3; c.strokeRect(cx - Rh + 2, cy - Rh + 2, Rh * 2 - 4, Rh * 2 - 4);
      c.globalCompositeOperation = 'destination-out';
      c.beginPath(); c.arc(cx, cy, 30, 0, TAU); c.fill();
      for (const [r0, r1, n] of [[36, 54, 18], [60, 78, 26]]) for (let k = 0; k < n; k++) {
        const a0 = k / n * TAU + 0.04, a1 = (k + 1) / n * TAU - 0.04;
        c.beginPath(); c.arc(cx, cy, r1, a0, a1); c.arc(cx, cy, r0, a1, a0, true); c.closePath(); c.fill();
      }
      for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) { c.beginPath(); c.arc(cx + sx * 84, cy + sy * 84, 4, 0, TAU); c.fill(); }
      c.globalCompositeOperation = 'source-over'; }
    // condenser fan grille (alpha): rings and spokes
    { const cx = 864, cy = 634; c.strokeStyle = '#2a2c2e'; c.lineWidth = 2;
      for (let rr = 10; rr <= 60; rr += 6) { c.beginPath(); c.arc(cx, cy, rr, 0, TAU); c.stroke(); }
      for (let k = 0; k < 12; k++) { const a = k / 12 * TAU; c.beginPath(); c.moveTo(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8); c.lineTo(cx + Math.cos(a) * 61, cy + Math.sin(a) * 61); c.stroke(); }
      c.fillStyle = '#2a2c2e'; c.beginPath(); c.arc(cx, cy, 9, 0, TAU); c.fill(); }
    // bicycle wheel spokes (alpha): rim, 32 spokes, hub
    { const cx = 976, cy = 618; c.strokeStyle = '#c8ccd0'; c.lineWidth = 1;
      for (let k = 0; k < 32; k++) { const a = k / 32 * TAU, b = a + (k % 2 ? 0.5 : -0.5); c.beginPath(); c.moveTo(cx + Math.cos(b) * 5, cy + Math.sin(b) * 5); c.lineTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42); c.stroke(); }
      c.lineWidth = 4; c.strokeStyle = '#b8bcc0'; c.beginPath(); c.arc(cx, cy, 42, 0, TAU); c.stroke();
      c.fillStyle = '#9a9ea2'; c.beginPath(); c.arc(cx, cy, 6, 0, TAU); c.fill(); }
    // condenser coil fins behind a wire guard
    box(258, 668, 124, 60, '#6a6e70'); for (let x = 258; x < 382; x += 2) box(x, 668, 1, 60, '#3a3e40');
    c.strokeStyle = '#2a2c2e'; c.lineWidth = 1.5; for (let x = 262; x < 382; x += 10) { c.beginPath(); c.moveTo(x, 668); c.lineTo(x, 728); c.stroke(); } for (let y = 672; y < 728; y += 10) { c.beginPath(); c.moveTo(258, y); c.lineTo(382, y); c.stroke(); }
    // milk crate side (alpha): white plastic grid, vertex colors tint it
    { c.fillStyle = '#ecece8'; K.rrect(c, 802, 700, 124, 92, 6); c.fill(); c.globalCompositeOperation = 'destination-out';
      for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) { K.rrect(c, 810 + i * 19.5, 716 + j * 18, 14, 13, 3); c.fill(); }
      K.rrect(c, 846, 704, 32, 9, 4); c.fill(); c.globalCompositeOperation = 'source-over'; }
    // barricade stripes: orange and white, diagonal
    { c.save(); c.beginPath(); c.rect(610, 734, 188, 58); c.clip(); box(610, 734, 188, 58, '#f4f2ea');
      for (let k = -4; k < 12; k++) poly([[610 + k * 30, 792], [610 + k * 30 + 15, 792], [610 + k * 30 + 73, 734], [610 + k * 30 + 58, 734]], '#e8641c');
      weather(610, 734, 188, 58, 0.08); c.restore(); }
    box(932, 700, 12, 12, '#ffffff');
    // kiosk city map
    { const x0 = 0, y0 = 798; box(x0, y0, 140, 226, '#ece6d6'); box(x0, y0, 140, 26, '#1f2a36'); text('CITY MAP', x0 + 76, y0 + 13, 15, '#f2f2ec');
      c.fillStyle = '#f2f2ec'; c.beginPath(); c.arc(x0 + 16, y0 + 13, 8, 0, TAU); c.fill(); text('i', x0 + 16, y0 + 14, 13, '#1f2a36', FONTS);
      box(x0 + 84, y0 + 40, 46, 56, '#9cc888'); c.fillStyle = '#7ab0d8'; c.beginPath(); c.ellipse(x0 + 108, y0 + 70, 12, 8, 0, 0, TAU); c.fill();
      c.strokeStyle = '#ffffff'; c.lineWidth = 5; for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(x0 + 8, y0 + 46 + k * 34); c.lineTo(x0 + 132, y0 + 46 + k * 34); c.stroke(); c.beginPath(); c.moveTo(x0 + 18 + k * 36, y0 + 32); c.lineTo(x0 + 18 + k * 36, y0 + 168); c.stroke(); }
      c.strokeStyle = '#c8b898'; c.lineWidth = 1; for (let i = 0; i < 30; i++) { const x = x0 + 10 + r() * 120, y = y0 + 36 + r() * 128; c.strokeRect(x, y, 6 + r() * 8, 5 + r() * 8); }
      c.fillStyle = '#d82a1e'; c.beginPath(); c.arc(x0 + 54, y0 + 114, 6, 0, TAU); c.fill(); box(x0 + 8, y0 + 176, 124, 1, '#8a8a84');
      text('YOU ARE HERE', x0 + 70, y0 + 188, 11, '#d82a1e', FONTC); for (let i = 0; i < 3; i++) box(x0 + 12, y0 + 200 + i * 7, 100 - r() * 40, 3, '#6a6a64'); }
    // ad: the city zoo
    { const x0 = 142, y0 = 798; let g = c.createLinearGradient(0, y0, 0, y0 + 226); g.addColorStop(0, '#f6c64a'); g.addColorStop(1, '#e8862a'); box(x0, y0, 140, 226, g);
      text('CITY ZOO', x0 + 70, y0 + 28, 26, '#3a1e0a'); text('NEW BABY GIRAFFE', x0 + 70, y0 + 52, 11, '#3a1e0a', FONTC);
      c.fillStyle = '#c87a2a'; c.beginPath(); c.ellipse(x0 + 64, y0 + 160, 30, 20, 0, 0, TAU); c.fill(); box(x0 + 82, y0 + 90, 10, 66, '#c87a2a'); c.beginPath(); c.ellipse(x0 + 92, y0 + 90, 12, 7, -0.3, 0, TAU); c.fill();
      for (const lx of [42, 54, 74, 86]) box(x0 + lx, y0 + 172, 6, 34, '#c87a2a');
      c.fillStyle = '#7a3a12'; for (let i = 0; i < 14; i++) { c.beginPath(); c.arc(x0 + 44 + r() * 46, y0 + 146 + r() * 24, 3 + r() * 3, 0, TAU); c.fill(); }
      box(x0, y0 + 208, 140, 18, '#3a1e0a'); text('OPEN DAILY 9 - 5', x0 + 70, y0 + 217, 11, '#f6c64a', FONTC); }
    // ad: fall festival
    { const x0 = 284, y0 = 798; let g = c.createLinearGradient(0, y0, 0, y0 + 226); g.addColorStop(0, '#2a3a5a'); g.addColorStop(1, '#5a3a5a'); box(x0, y0, 140, 226, g);
      text('FALL', x0 + 70, y0 + 30, 30, '#f6b24a'); text('FESTIVAL', x0 + 70, y0 + 60, 24, '#f6b24a'); text('CITY PARK  SAT + SUN', x0 + 70, y0 + 84, 10, '#f2e8d8', FONTC);
      for (const [px2, py2, s] of [[40, 160, 26], [92, 168, 20], [66, 186, 16]]) { c.fillStyle = '#e8762a'; c.beginPath(); c.ellipse(x0 + px2, y0 + py2, s * 1.15, s, 0, 0, TAU); c.fill(); c.fillStyle = '#c85a1a'; c.fillRect(x0 + px2 - 1, y0 + py2 - s, 2, s * 2); box(x0 + px2 - 2, y0 + py2 - s - 7, 4, 8, '#4a6a2a'); }
      for (let i = 0; i < 9; i++) { c.fillStyle = ['#d8482a', '#f0a02a', '#c8302a'][i % 3]; c.beginPath(); c.ellipse(x0 + 10 + r() * 120, y0 + 100 + r() * 40, 6, 3, r() * 3, 0, TAU); c.fill(); }
      box(x0, y0 + 208, 140, 18, '#f6b24a'); text('MUSIC  PIES  HAYRIDES', x0 + 70, y0 + 217, 10, '#2a1a2a', FONTC); }
    // sandwich board chalkboard
    { const x0 = 426, y0 = 798; box(x0, y0, 148, 226, '#22302a'); for (let i = 0; i < 400; i++) { c.fillStyle = `rgba(255,255,255,${r() * 0.05})`; c.fillRect(x0 + r() * 148, y0 + r() * 226, 3, 2); }
      c.globalAlpha = 0.88; const ch = (s, y, sz, col = '#f2f2ea') => text(s, x0 + 74, y0 + y, sz, col, (n) => `italic bold ${n}px Georgia, 'DejaVu Serif', serif`);
      ch('Today', 30, 28, '#f6e6a0'); ch('Tomato Soup', 72, 17); ch('Grilled Cheese', 96, 16); ch('Hot Cocoa', 120, 17, '#f0b8c8'); ch('Coffee $2', 150, 20, '#a8e0f0');
      c.strokeStyle = '#f2f2ea'; c.lineWidth = 2; c.beginPath(); c.moveTo(x0 + 56, y0 + 178); c.lineTo(x0 + 60, y0 + 206); c.lineTo(x0 + 86, y0 + 206); c.lineTo(x0 + 90, y0 + 178); c.closePath(); c.stroke();
      c.beginPath(); c.arc(x0 + 94, y0 + 190, 7, -PI / 2, PI / 2); c.stroke(); for (const sx of [66, 74, 82]) { c.beginPath(); c.moveTo(x0 + sx, y0 + 172); c.quadraticCurveTo(x0 + sx + 4, y0 + 166, x0 + sx, y0 + 160); c.stroke(); }
      c.globalAlpha = 1; }
    // hot dog cart panel
    { const x0 = 576, y0 = 798; box(x0, y0, 448, 110, '#f6efe0'); box(x0, y0, 448, 10, '#c8241e'); box(x0, y0 + 100, 448, 10, '#c8241e');
      text('HOT DOGS', x0 + 250, y0 + 42, 52, '#c8241e', FONT); text('PRETZELS  -  SODA  -  CHIPS', x0 + 250, y0 + 80, 20, '#1d4f91', FONTC);
      c.fillStyle = '#d8a050'; K.rrect(c, x0 + 22, y0 + 40, 96, 34, 16); c.fill(); c.fillStyle = '#b84a2a'; K.rrect(c, x0 + 14, y0 + 46, 112, 18, 9); c.fill();
      c.strokeStyle = '#f0c820'; c.lineWidth = 4; c.beginPath(); for (let k = 0; k <= 8; k++) c.lineTo(x0 + 24 + k * 11, y0 + 55 + (k % 2 ? -4 : 4)); c.stroke();
      c.fillStyle = '#1d4f91'; c.beginPath(); c.arc(x0 + 412, y0 + 55, 26, 0, TAU); c.fill(); text('$3', x0 + 412, y0 + 56, 24, '#ffffff'); }
    // ice cream cart panel
    { const x0 = 576, y0 = 912; box(x0, y0, 448, 110, '#fbe8ee'); box(x0, y0, 448, 10, '#7ac0e0'); box(x0, y0 + 100, 448, 10, '#7ac0e0');
      text('ICE CREAM', x0 + 260, y0 + 44, 50, '#d84a7a', FONT); text('COLD TREATS  -  CONES  -  BARS', x0 + 260, y0 + 82, 18, '#3a7aa8', FONTC);
      for (const [cx, col] of [[40, '#f6f0d8'], [80, '#f0a0b8'], [120, '#8a5a3a']]) { poly([[x0 + cx - 14, y0 + 50], [x0 + cx + 14, y0 + 50], [x0 + cx, y0 + 92]], '#d8a050'); c.fillStyle = col; c.beginPath(); c.arc(x0 + cx, y0 + 44, 16, 0, TAU); c.fill(); } }
  }, { srgb: true });
  M.atlas2 = () => smat('atlas2', { map: TXS.atlas2() });
  M.atlas2Lit = () => smat('atlas2Lit', { map: TXS.atlas2(), emissive: 0xffffff, glow: 'night' }, { emissiveMap: TXS.atlas2() });
  M.atlas2Cut = () => smat('atlas2Cut', { map: TXS.atlas2(), alphaTest: 0.5, side: THREE.DoubleSide });
  // grime for painted steel and plastic: dirt streaks running down, scuffs, a few rust spots (near white, multiplies vertex colors)
  TXS.grime = () => canvasTex('st_grime', 256, 256, (c, w, h, r) => {
    c.fillStyle = gray(0.92); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) { const s = 6 + r() * 30; c.fillStyle = gray(0.8 + r() * 0.2, 0.2); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.arc(X, Y, s, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 70; i++) { const x = r() * w, y = r() * h, len = 20 + r() * 90; const g = c.createLinearGradient(0, y, 0, y + len); g.addColorStop(0, gray(0.55, 0.25)); g.addColorStop(1, gray(0.55, 0)); c.fillStyle = g; c.fillRect(x, y, 1 + r() * 3, len); c.fillRect(x, y - h, 1 + r() * 3, len); }
    for (let i = 0; i < 40; i++) { c.strokeStyle = gray(r() < 0.5 ? 1 : 0.6, 0.3); c.lineWidth = 0.8; c.beginPath(); const x = r() * w, y = r() * h; c.moveTo(x, y); c.lineTo(x + (r() - 0.5) * 30, y + (r() - 0.5) * 8); c.stroke(); }
    for (let i = 0; i < 18; i++) { const s = 2 + r() * 6; c.fillStyle = `rgba(${130 + r() * 40 | 0},${70 + r() * 20 | 0},${40},0.35)`; c.beginPath(); c.arc(r() * w, r() * h, s, 0, TAU); c.fill(); }
    for (let i = 0; i < 3000; i++) { c.fillStyle = gray(r() < 0.5 ? 0.7 : 1, 0.2); c.fillRect(r() * w, r() * h, 1, 1); }
  });
  M.grimy = () => smat('grimy', { map: TXS.grime(), std: true, roughness: 0.62, metalness: 0.15 });
  M.plastic = () => smat('plasticGloss', { std: true, roughness: 0.3, metalness: 0.0 }, { gloss: 0.3, glossBase: 0.04 });
  M.canvas = () => smat('canvasCloth', { map: TX.fabric(), side: THREE.DoubleSide });
  M.chain = () => smat('chainLink', { map: TX.chain(), alphaTest: 0.5, side: THREE.DoubleSide, color: 0xc8ccd0, std: true, metalness: 0.45, roughness: 0.42 });

  /* ============================================================
     More street props (instanced, { parts, radius | colliders, ... }), all facing +z, base at y = 0:
     signs on posts, alley and back of house pieces, street life, parking lot pieces
     ============================================================ */
  // a cylinder centered on the origin (cyl stands on y = 0), for wheels, discs and drums that get turned
  const cylC = (r0, r1, h, seg, col, open) => cyl(r0, r1, h, seg, col, open).translate(0, -h / 2, 0);
  // a box placed and turned (radians about x, y, z), painted one color
  const bx = (w, h, d, x, y, z, col, rx = 0, ry = 0, rz = 0) => paint(place(prep(new THREE.BoxGeometry(w, h, d)), x, y, z, rx, ry, rz), col);
  // triangle builder that turns every face toward a wanted direction (a vector, or a function of the face center)
  function solid() {
    const s = K.soup();
    const tri = (a, b, c, col, want, ua, ub, uc) => {
      const n = new V3().subVectors(b, a).cross(new V3().subVectors(c, a));
      const wv = typeof want === 'function' ? want(new V3().add(a).add(b).add(c).multiplyScalar(1 / 3)) : want;
      if (wv && n.dot(wv) < 0) s.tri(a, c, b, col, col, col, ua, uc, ub); else s.tri(a, b, c, col, col, col, ua, ub, uc);
    };
    return {
      tri,
      quad(a, b, c, d, col, want, uv) { tri(a, b, c, col, want, uv && uv[0], uv && uv[1], uv && uv[2]); tri(a, c, d, col, want, uv && uv[0], uv && uv[2], uv && uv[3]); },
      geo() { return s.geo(false); },
    };
  }
  // a convex profile in the (z, y) plane pushed along x from x0 to x1 (closed solid)
  function prism(prof, x0, x1, col) {
    const S = solid(), n = prof.length;
    let cz = 0, cy = 0; for (const q of prof) { cz += q[0] / n; cy += q[1] / n; }
    const P = (x, q) => new V3(x, q[1], q[0]);
    for (let i = 1; i < n - 1; i++) { S.tri(P(x1, prof[0]), P(x1, prof[i]), P(x1, prof[i + 1]), col, new V3(1, 0, 0)); S.tri(P(x0, prof[0]), P(x0, prof[i]), P(x0, prof[i + 1]), col, new V3(-1, 0, 0)); }
    for (let i = 0; i < n; i++) { const a = prof[i], b = prof[(i + 1) % n]; S.quad(P(x0, a), P(x1, a), P(x1, b), P(x0, b), col, new V3(0, (a[1] + b[1]) / 2 - cy, (a[0] + b[0]) / 2 - cz)); }
    return S.geo();
  }
  /* sign blank: a convex outline pts (x, y around the center, counter clockwise) th thick at height cy, front face at cz + th / 2
     with its atlas face (rect spans w x h around the center); the back and edges are bare aluminum */
  const SIGN_BACK = C3(0xa4a8aa);
  function polyPlate(pts, cy, cz, rect, w, h, th = 0.012, back = SIGN_BACK) {
    const F = solid(), B = solid(), n = pts.length, zf = cz + th / 2, zb = cz - th / 2;
    const U = (p) => [lerp(rect[0], rect[2], p[0] / w + 0.5), lerp(rect[1], rect[3], p[1] / h + 0.5)];
    const P = (p, z) => new V3(p[0], cy + p[1], z);
    for (let i = 1; i < n - 1; i++) {
      F.tri(P(pts[0], zf + 0.0008), P(pts[i], zf + 0.0008), P(pts[i + 1], zf + 0.0008), [1, 1, 1], new V3(0, 0, 1), U(pts[0]), U(pts[i]), U(pts[i + 1]));
      B.tri(P(pts[0], zb), P(pts[i], zb), P(pts[i + 1], zb), back, new V3(0, 0, -1));
    }
    for (let i = 0; i < n; i++) { const a = pts[i], b = pts[(i + 1) % n]; B.quad(P(a, zb), P(b, zb), P(b, zf), P(a, zf), back, new V3((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, 0)); }
    return { face: F.geo(), body: B.geo() };
  }
  const rectPts = (w, h) => [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
  const octPts = (R0) => { const p = []; for (let k = 0; k < 8; k++) { const a = PI / 8 + k * PI / 4; p.push([Math.cos(a) * R0, Math.sin(a) * R0]); } return p; };
  const diaPts = (d) => [[0, -d], [d, 0], [0, d], [-d, 0]];
  /* a sign on a square galvanized post H tall; plates [{ pts, w, h, y, rect, bolts }] face +z in front of the post */
  function signOnPost(H, plates) {
    const steel = [bx(0.05, H, 0.05, 0, H / 2, 0, GALV), bx(0.062, 0.02, 0.062, 0, H + 0.01, 0, C3(0x8a8e90))], face = [];
    for (const p of plates) {
      const z = 0.042, pp = polyPlate(p.pts, p.y, z, p.rect, p.w, p.h);
      steel.push(pp.body); face.push(pp.face);
      for (const dy of p.bolts || [p.h * 0.36, -p.h * 0.36]) steel.push(bx(0.022, 0.022, 0.006, 0, p.y + dy, z + 0.0095, C3(0xb8bcc0)));
    }
    return {
      parts: [
        { geometry: boxUV(merge(steel), 3), material: M.steel(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
      ],
      radius: 0.07,
    };
  }
  // stop sign: 0.75 m octagon (30 in), bottom 2.1 m up
  const makeStopsign = () => signOnPost(2.8, [{ pts: octPts(0.375 / Math.cos(PI / 8)), w: 0.75 / Math.cos(PI / 8), h: 0.75 / Math.cos(PI / 8), y: 2.475, rect: AT2.stop, bolts: [0.3, -0.3] }]);
  // one way: 0.9 x 0.3 m, v0 arrow left, v1 arrow right
  const makeOneway = (v) => signOnPost(2.48, [{ pts: rectPts(0.9, 0.3), w: 0.9, h: 0.3, y: 2.3, rect: v ? AT2.oneR : AT2.oneL, bolts: [0.09, -0.09] }]);
  const makeNoparking = () => signOnPost(2.55, [{ pts: rectPts(0.3, 0.45), w: 0.3, h: 0.45, y: 2.32, rect: AT2.noPark }]);
  const makeParkingsign = () => signOnPost(2.55, [{ pts: rectPts(0.3, 0.45), w: 0.3, h: 0.45, y: 2.32, rect: AT2.park }]);
  const makeSpeedlimit = () => signOnPost(2.85, [{ pts: rectPts(0.6, 0.75), w: 0.6, h: 0.75, y: 2.475, rect: AT2.speed }]);
  // pedestrian crossing: a 0.75 m diamond over a diagonal arrow plaque
  const makeCrosswalksign = () => signOnPost(3.45, [
    { pts: diaPts(0.53), w: 1.06, h: 1.06, y: 2.98, rect: AT2.xwalk, bolts: [0.36, -0.36] },
    { pts: rectPts(0.6, 0.3), w: 0.6, h: 0.3, y: 2.25, rect: AT2.xplaque, bolts: [0.08, -0.08] },
  ]);
  // corner street name post with blank blades (4 variants: block numbers 100 to 400); named signs are Env.streetSign
  function makeStreetsign2(v) {
    const steel = [lathe([[0.045, 0], [0.045, 3.05], [0.05, 3.08], [0, 3.12]], 8, GALV), bx(0.1, 0.08, 0.1, 0, 2.86, 0, C3(0x6a6e70))], face = [];
    const BL = 0.95, BH = 0.19, rect = AT2['blade' + v];
    for (const [y, ry] of [[2.75, 0], [2.97, PI / 2]]) {
      steel.push(bx(BL, BH, 0.012, 0, y, 0, C3(0x1f6b3e), 0, ry));
      for (const s of [1, -1]) { const q = quadUV(BL - 0.01, BH - 0.01, rect); if (s < 0) q.rotateY(PI); q.translate(0, 0, s * 0.0068); q.rotateY(ry); q.translate(0, y, 0); face.push(q); }
    }
    return {
      parts: [
        { geometry: boxUV(merge(steel), 3), material: M.steel(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
      ],
      radius: 0.08,
    };
  }
  // bus stop sign for stops without a shelter: a tall pole, the BUS STOP flag reaching over the curb (+x), a schedule case
  function makeBusstopsign() {
    const steel = [lathe([[0.045, 0], [0.045, 3.2], [0.05, 3.22], [0, 3.25]], 8, GALV)], dark = [], atlas = [], atlas2 = [];
    const fx = 0.38, fy = 2.92;
    dark.push(bx(0.64, 0.38, 0.016, fx, fy, 0, WHITE));
    for (const dy of [0.12, -0.12]) dark.push(bx(0.12, 0.03, 0.03, 0.06, fy + dy, 0, C3(0x6a6e70)));
    for (const s of [1, -1]) { const q = quadUV(0.62, 0.36, atlasRect('busFlag')); if (s < 0) q.rotateY(PI); q.translate(fx, fy, s * 0.0085); atlas.push(q); }
    dark.push(bx(0.24, 0.44, 0.05, 0, 1.55, 0.07, C3(0x2a3036)), bx(0.06, 0.06, 0.05, 0, 1.25, 0.04, C3(0x2a3036)), bx(0.06, 0.06, 0.05, 0, 1.85, 0.04, C3(0x2a3036)));
    const sq = quadUV(0.2, 0.4, AT2.schedule); sq.translate(0, 1.55, 0.0955); atlas2.push(sq);
    return {
      parts: [
        { geometry: boxUV(merge(steel), 3), material: M.steel(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(atlas), material: M.atlas(), castShadow: false },
        { geometry: merge(atlas2), material: M.atlas2(), castShadow: false },
      ],
      radius: 0.08, wait: { x: 0, z: 0.7 },
    };
  }

  /* ---------- alley and back of house ---------- */
  // front load dumpster (1.9 x 1.2 m, about 1.3 m tall): sloped front, two black plastic lids, fork pockets, casters (v0 green, v1 blue)
  function makeDumpster(v) {
    const col = [C3(0x35553a), C3(0x2c4a72)][v], body = [], lids = [], dark = [], label = [];
    const HW = 0.95, prof = [[-0.6, 0.16], [0.34, 0.16], [0.6, 0.44], [0.6, 1.12], [-0.6, 1.26]];
    body.push(prism(prof, -HW, HW, col));
    for (const x of [-0.62, 0.62]) body.push(bx(0.06, 0.66, 0.035, x, 0.78, 0.615, col));
    body.push(bx(2 * HW + 0.05, 0.07, 0.07, 0, 1.12, 0.6, col), bx(2 * HW + 0.05, 0.07, 0.07, 0, 1.26, -0.6, col));
    for (const s of [-1, 1]) {
      body.push(bx(0.07, 0.07, 1.24, s * HW, 1.19, 0, col, 0.116));
      body.push(bx(0.12, 0.17, 1.02, s * (HW + 0.06), 0.84, -0.04, mulc(col, 0.92)));
      dark.push(bx(0.08, 0.12, 0.01, s * (HW + 0.06), 0.84, 0.475, C3(0x0c0c0c)));
      dark.push(bx(0.08, 0.06, 1.0, s * 0.72, 0.13, -0.08, C3(0x2a2a2a)));
      // lids: hinged at the back, resting on the rim
      lids.push(bx(0.935, 0.045, 1.28, s * 0.475, 1.255, 0.0, C3(0x1d1e20), 0.116));
      for (const x of [-0.25, 0, 0.25]) lids.push(bx(0.04, 0.02, 1.2, s * 0.475 + x, 1.285, 0.0, C3(0x232426), 0.116));
      lids.push(bx(0.3, 0.035, 0.05, s * 0.475, 1.2, 0.66, C3(0x1d1e20)));
    }
    // casters
    for (const [x, z] of [[-0.72, 0.42], [0.72, 0.42], [-0.72, -0.48], [0.72, -0.48]]) {
      dark.push(cylC(0.065, 0.065, 0.05, 10, C3(0x1c1c1c)).rotateZ(PI / 2).translate(x, 0.065, z), bx(0.07, 0.06, 0.05, x, 0.13, z, C3(0x3a3a3a)));
    }
    const lb = quadUV(0.5, 0.127, AT2.dumpLabel); lb.translate(0, 0.9, 0.6015); label.push(lb);
    // grime: darker low down
    const bodyG = paint(merge(body), (x, y, z, nx, ny, nz, i) => mulc(col, 0.7 + 0.32 * smooth(0.15, 1.1, y) * (ny > 0.5 ? 0.9 : 1)));
    return {
      parts: [
        { geometry: boxUV(bodyG, 1.1), material: M.grimy(), castShadow: true },
        { geometry: merge(lids), material: M.plastic(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(label), material: M.atlas2(), castShadow: false },
      ],
      radius: 0, colliders: [{ x: -0.62, z: 0, r: 0.62 }, { x: 0, z: 0, r: 0.62 }, { x: 0.62, z: 0, r: 0.62 }],
    };
  }
  // a pile of full trash bags (v0 black, v1 black and white kitchen bags with a blue recycling bag)
  function makeTrashbags(v) {
    const r = rng(310 + v * 17), bags = [];
    const BL = C3(0x1a1b1d), WH = C3(0xd8d8d0), BU = C3(0x3a62a0);
    const list = v === 0
      ? [[-0.42, 0, 0.02, 0.36, BL], [0.2, 0, 0.12, 0.4, BL], [0.66, 0, -0.12, 0.31, BL], [-0.08, 0, -0.42, 0.34, BL], [-0.05, 0.42, -0.08, 0.3, BL], [-0.62, 0, 0.5, 0.27, BL]]
      : [[-0.36, 0, 0.0, 0.34, BL], [0.24, 0, 0.1, 0.3, WH], [0.62, 0, -0.18, 0.28, WH], [-0.02, 0, -0.42, 0.35, BU], [0.1, 0.38, -0.12, 0.26, BL], [-0.7, 0, 0.36, 0.24, WH], [0.5, 0, 0.42, 0.22, BL]];
    for (const [x, y0, z, s, col] of list) {
      const sh = mulc(col, 0.92 + r() * 0.16), cy = y0 + s * 0.8;
      const g = ell(x, cy, z, s * (1 + r() * 0.15), s * 0.82, s * (0.92 + r() * 0.2), sh, 1, 0.13, r() * 50);
      eachVertex(g, (p) => { if (p.y < y0 + 0.02) p.y = y0 + 0.02 + (p.y - y0) * 0.08; const t = (p.y - cy) / (s * 0.82); if (t > 0.55) { const k = 1 - (t - 0.55) * 0.9; p.x = x + (p.x - x) * k; p.z = z + (p.z - z) * k; } });
      smoothNormals(g); bags.push(g);
      // the tied neck and two ears
      const top = cy + s * 0.78;
      bags.push(cyl(0.05, 0.022, 0.1, 5, sh, true).translate(x, top - 0.03, z), ell(x + 0.03, top + 0.075, z + 0.01, 0.055, 0.022, 0.02, sh, 0));
    }
    return {
      parts: [{ geometry: merge(bags), material: M.plastic(), castShadow: true }],
      radius: 0, colliders: v === 0 ? [{ x: -0.35, z: 0.1, r: 0.45 }, { x: 0.35, z: 0.0, r: 0.45 }, { x: -0.1, z: -0.42, r: 0.36 }] : [{ x: -0.35, z: 0.05, r: 0.42 }, { x: 0.35, z: 0.05, r: 0.42 }, { x: 0, z: -0.42, r: 0.36 }],
    };
  }
  // two blue wheeled recycling carts (96 gal) side by side, lids closed, wheels at the back
  function makeRecycling() {
    const body = [], dark = [], label = [];
    const BLU = C3(0x2060ae), LID = C3(0x1d4f92);
    const cart = (cx, cz, ry) => {
      const S = solid(), y0 = 0.07, y1 = 1.0, b = [0.25, 0.29], t = [0.3, 0.35];
      const c = (sx, sz, top) => new V3(sx * (top ? t[0] : b[0]), top ? y1 : y0, sz * (top ? t[1] : b[1]));
      const ctr = new V3(0, (y0 + y1) / 2, 0), out = (p) => new V3().subVectors(p, ctr);
      for (const [a, bb] of [[[-1, 1], [1, 1]], [[1, 1], [1, -1]], [[1, -1], [-1, -1]], [[-1, -1], [-1, 1]]]) S.quad(c(a[0], a[1], 0), c(bb[0], bb[1], 0), c(bb[0], bb[1], 1), c(a[0], a[1], 1), BLU, out);
      S.quad(c(-1, -1, 0), c(1, -1, 0), c(1, 1, 0), c(-1, 1, 0), mulc(BLU, 0.7), new V3(0, -1, 0));
      const parts = [S.geo(), bx(0.64, 0.045, 0.77, 0, y1 + 0.022, 0.015, LID), bx(0.62, 0.05, 0.05, 0, y1 - 0.01, 0.38, LID),
        bx(0.5, 0.04, 0.04, 0, y1 - 0.06, -0.39, mulc(LID, 0.8)), bx(0.06, 0.12, 0.08, -0.22, y1 - 0.06, -0.36, mulc(LID, 0.8)), bx(0.06, 0.12, 0.08, 0.22, y1 - 0.06, -0.36, mulc(LID, 0.8))];
      const dk = [cylC(0.12, 0.12, 0.07, 10, C3(0x1a1a1a)).rotateZ(PI / 2).translate(-0.29, 0.12, -0.3), cylC(0.12, 0.12, 0.07, 10, C3(0x1a1a1a)).rotateZ(PI / 2).translate(0.29, 0.12, -0.3), rod(-0.3, 0.12, -0.3, 0.3, 0.12, -0.3, 0.015, C3(0x6a6a6a), 5)];
      const th = Math.atan2(t[1] - b[1], y1 - y0), ly = 0.62, lz = b[1] + (ly - y0) / (y1 - y0) * (t[1] - b[1]) + 0.003;
      const lb = quadUV(0.3, 0.3, AT2.recycle); lb.rotateX(th); lb.translate(0, ly, lz);
      for (const [list, src] of [[body, parts], [dark, dk], [label, [lb]]]) for (const g of src) { g.rotateY(ry); g.translate(cx, 0, cz); list.push(g); }
    };
    cart(-0.36, 0.02, 0.06); cart(0.37, -0.03, -0.08);
    return {
      parts: [
        { geometry: boxUV(merge(body), 1.3), material: M.grimy(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(label), material: M.atlas2(), castShadow: false },
      ],
      radius: 0, colliders: [{ x: -0.36, z: 0, r: 0.4 }, { x: 0.37, z: 0, r: 0.4 }],
    };
  }
  // wooden shipping pallet 1.2 x 1.0 m: 3 stringers, 7 deck boards, 3 bottom boards
  function palletGeo(r, tone) {
    const g = [], wc = () => mulc(tone, 0.82 + r() * 0.3);
    for (const z of [-0.455, 0, 0.455]) g.push(bx(1.2, 0.09, 0.045, 0, 0.0615, z, mulc(wc(), 0.9)));
    for (let i = 0; i < 7; i++) g.push(bx(0.14, 0.017, 1.0, -0.53 + i * 0.1767, 0.115, 0, wc()));
    for (const x of [-0.53, 0, 0.53]) g.push(bx(0.14, 0.017, 1.0, x, 0.0085, 0, wc()));
    return merge(g);
  }
  // a stack of three pallets and one leaning on the wall behind (the prop's back, -z, goes against a wall)
  function makePallet() {
    const r = rng(4411), g = [];
    for (let i = 0; i < 3; i++) g.push(place(palletGeo(r, i === 1 ? C3(0x9a8a70) : C3(0xb09a76)), (r() - 0.5) * 0.08, i * 0.1235, 0.12 + (r() - 0.5) * 0.06, 0, (r() - 0.5) * 0.1, 0));
    g.push(place(palletGeo(r, C3(0x8a7a62)), 0.05, 0.53, -0.62, 1.35, 0.04, 0));
    return {
      parts: [{ geometry: boxUV(merge(g), 1.6), material: M.wood(), castShadow: true }],
      radius: 0, colliders: [{ x: -0.32, z: 0.1, r: 0.55 }, { x: 0.32, z: 0.1, r: 0.55 }, { x: 0, z: -0.62, r: 0.35 }],
    };
  }
  // v0 slatted wooden produce crates stacked (one full of apples), v1 plastic milk crates in four colors
  function makeCrates(v) {
    const r = rng(5150 + v);
    if (v === 0) {
      const w = [], fruit = [];
      const crate = (x, y, z, ry) => {
        const W = 0.5, D = 0.32, H = 0.28, T = 0.012, g = [], tone = () => mulc(C3(0xb8a07a), 0.85 + r() * 0.25);
        for (const s of [-1, 1]) { for (const yy of [0.065, 0.2]) g.push(bx(W, 0.09, T, 0, yy, s * (D / 2 - T / 2), tone())); g.push(bx(T, H, D, s * (W / 2 - T / 2), H / 2, 0, mulc(tone(), 0.92))); }
        for (const zz of [-0.1, 0, 0.1]) g.push(bx(W - 2 * T, T, 0.08, 0, T / 2, zz, tone()));
        for (const q of g) { q.rotateY(ry); q.translate(x, y, z); w.push(q); }
      };
      crate(-0.27, 0, 0.02, 0.04); crate(0.27, 0, 0.0, -0.05); crate(-0.24, 0, 0.38, 0.12); crate(0.02, 0.28, 0.03, 0.18); crate(0.3, 0.28, -0.02, -0.1);
      for (let i = 0; i < 11; i++) fruit.push(ell(-0.24 + (i % 4 - 1.5) * 0.1 + (r() - 0.5) * 0.02, 0.24 + (i > 7 ? 0.05 : 0), 0.38 + (Math.floor(i / 4) - 1) * 0.09 + (r() - 0.5) * 0.02, 0.042, 0.04, 0.042, mixc(C3(0xa8201a), C3(0xc8a020), r() * 0.35), 0));
      return {
        parts: [{ geometry: boxUV(merge(w), 2), material: M.wood(), castShadow: true }, { geometry: merge(fruit), material: M.plastic(), castShadow: false }],
        radius: 0, colliders: [{ x: -0.25, z: 0.1, r: 0.36 }, { x: 0.28, z: 0, r: 0.3 }],
      };
    }
    const grid = [], rim = [];
    const COLS = [C3(0xb8261e), C3(0x1f5aa8), C3(0x2a7a3a), C3(0xe0b020)];
    const crate = (x, y, z, ry, col) => {
      const S = 0.33, H = 0.28, g = [];
      for (let k = 0; k < 4; k++) { const q = quadUV(S, H, AT2.crate, col); q.translate(0, H / 2, S / 2); q.rotateY(k * PI / 2); g.push(q); }
      const b = quadUV(S, S, AT2.crate, mulc(col, 0.8)); b.rotateX(-PI / 2); b.translate(0, 0.01, 0); g.push(b);
      for (const q of g) { q.rotateY(ry); q.translate(x, y, z); grid.push(q); }
      for (let k = 0; k < 4; k++) { const q = bx(S + 0.01, 0.025, 0.02, 0, H - 0.012, S / 2, col); q.rotateY(k * PI / 2); q.rotateY(ry); q.translate(x, y, z); rim.push(q); }
    };
    crate(-0.18, 0, 0.0, 0.05, COLS[0]); crate(0.17, 0, 0.02, -0.04, COLS[1]); crate(-0.17, 0, 0.36, 0.1, COLS[2]); crate(-0.16, 0.285, 0.02, 0.15, COLS[3]); crate(0.18, 0.285, 0.0, -0.1, COLS[0]); crate(-0.02, 0.57, 0.02, 0.3, COLS[1]);
    return {
      parts: [{ geometry: merge(grid), material: M.atlas2Cut(), castShadow: false }, { geometry: merge(rim), material: M.plastic(), castShadow: true }],
      radius: 0, colliders: [{ x: 0, z: 0.05, r: 0.36 }, { x: -0.17, z: 0.38, r: 0.2 }],
    };
  }
  // air conditioner: v0 a ground condenser on a pad (fan on top, coils around, copper lines to the wall behind),
  // v1 a wall mounted unit on brackets 1.9 m up (its back at z = 0 on the wall)
  function makeAcunit(v) {
    const cab = [], fins = [], grille = [], dark = [], pad = [], pipes = [];
    const CAB = C3(0xcac6ba), COP = C3(0xb87a48), FOAM = C3(0x18181a);
    const fanTop = (x, y, z, rad, up) => {
      const d = cyl(rad, rad, 0.02, 16, C3(0x1a1a1c)); if (!up) d.rotateX(PI / 2); d.translate(x, y, z); dark.push(d);
      for (let k = 0; k < 3; k++) { const b = prep(new THREE.BoxGeometry(rad * 0.85, 0.008, rad * 0.32)); b.rotateX(0.25); b.translate(rad * 0.45, 0, 0); b.rotateY(k * TAU / 3); if (!up) b.rotateX(PI / 2); b.translate(x, y + (up ? 0.02 : 0), z + (up ? 0 : 0.02)); dark.push(paint(b, C3(0x2a2c2e))); }
      const q = quadUV(rad * 2.1, rad * 2.1, AT2.fan); if (up) q.rotateX(-PI / 2); q.translate(x, y + (up ? 0.05 : 0), z + (up ? 0 : 0.05)); grille.push(q);
    };
    if (v === 0) {
      pad.push(bx(1.0, 0.08, 1.0, 0, 0.04, 0, C3(0xb2aea4)));
      const y0 = 0.08, y1 = 0.8, hs = 0.4;
      for (const sx of [-1, 1]) for (const sz of [-1, 1]) cab.push(bx(0.06, y1 - y0, 0.06, sx * (hs - 0.03), (y0 + y1) / 2, sz * (hs - 0.03), CAB));
      cab.push(bx(0.82, 0.07, 0.82, 0, y0 + 0.035, 0, mulc(CAB, 0.9)), bx(0.84, 0.05, 0.84, 0, y1 + 0.02, 0, CAB));
      cab.push(bx(0.2, 0.3, 0.02, 0.2, 0.55, hs + 0.012, mulc(CAB, 0.96)));
      dark.push(bx(0.72, 0.62, 0.72, 0, 0.45, 0, C3(0x24262a)));
      for (let k = 0; k < 4; k++) { const q = quadUV(0.72, 0.62, AT2.fins); q.translate(0, 0.45, hs - 0.008); q.rotateY(k * PI / 2); fins.push(q); }
      fanTop(0, y1 + 0.05, 0, 0.3, true);
      pipes.push(rod(-0.2, 0.3, -0.4, -0.2, 0.3, -0.64, 0.012, COP, 6), rod(-0.2, 0.3, -0.64, -0.2, 1.3, -0.64, 0.012, COP, 6));
      pipes.push(rod(-0.08, 0.26, -0.4, -0.08, 0.26, -0.67, 0.026, FOAM, 6), rod(-0.08, 0.26, -0.67, -0.08, 1.3, -0.67, 0.026, FOAM, 6));
      cab.push(bx(0.22, 0.3, 0.1, 0.3, 1.15, -0.66, C3(0x8a8e90)));
      pipes.push(rod(0.3, 1.0, -0.66, 0.3, 0.6, -0.66, 0.014, C3(0x6a6e70), 6), rod(0.3, 0.6, -0.66, 0.3, 0.6, -0.4, 0.014, C3(0x6a6e70), 6));
    } else {
      const yc = 2.2, zc = 0.2;
      cab.push(bx(0.86, 0.6, 0.3, 0, yc, zc, CAB));
      fanTop(-0.12, yc, zc + 0.15, 0.22, false);
      const f = quadUV(0.22, 0.5, AT2.fins); f.translate(0.3, yc, zc + 0.152); fins.push(f);
      const f2 = quadUV(0.26, 0.5, AT2.fins); f2.rotateY(-PI / 2); f2.translate(-0.432, yc, zc); fins.push(f2);
      for (const x of [-0.3, 0.3]) { cab.push(bx(0.04, 0.04, 0.4, x, yc - 0.32, 0.2, C3(0x6a6e70))); pipes.push(rod(x, yc - 0.7, 0.02, x, yc - 0.33, 0.38, 0.015, C3(0x6a6e70), 5)); cab.push(bx(0.08, 0.1, 0.02, x, yc - 0.7, 0.01, C3(0x6a6e70))); }
      pipes.push(rod(0.44, yc - 0.15, 0.15, 0.52, yc - 0.15, 0.15, 0.012, COP, 6), rod(0.52, yc - 0.15, 0.15, 0.52, yc - 0.15, 0.0, 0.012, COP, 6));
      pipes.push(rod(0.44, yc - 0.22, 0.15, 0.56, yc - 0.22, 0.15, 0.024, FOAM, 6), rod(0.56, yc - 0.22, 0.15, 0.56, yc - 0.22, 0.0, 0.024, FOAM, 6));
    }
    const parts = [
      { geometry: boxUV(merge(cab), 1.4), material: M.grimy(), castShadow: true },
      { geometry: merge(dark), material: M.metal(), castShadow: true },
      { geometry: merge(fins), material: M.atlas2(), castShadow: false },
      { geometry: merge(grille), material: M.atlas2Cut(), castShadow: false },
      { geometry: merge(pipes), material: M.metal(), castShadow: true },
    ];
    if (pad.length) parts.push({ geometry: boxUV(merge(pad), 1.2), material: M.concrete(), castShadow: false });
    return { parts, radius: v === 0 ? 0.55 : 0 };
  }
  // on a wall (the prop's back, z = 0, against it): v0 three gas meters on a yellow manifold with the riser from the ground,
  // v1 an electric meter board (four meters) with its disconnect box and conduits
  function makeGaspipe(v) {
    const pipe = [], meter = [], face = [];
    const YEL = C3(0xd0aa2c), GRY = C3(0x9aa0a4), DK = C3(0x3a3c3e), CON = C3(0x8a8e90);
    if (v === 0) {
      const zP = 0.1;
      pipe.push(rod(-0.75, 0, zP, -0.75, 1.0, zP, 0.03, YEL, 8), ell(-0.75, 1.0, zP, 0.036, 0.036, 0.036, YEL, 0), rod(-0.75, 1.0, zP, 0.62, 1.0, zP, 0.026, YEL, 8));
      for (const x of [-0.42, 0.02, 0.46]) {
        pipe.push(rod(x, 1.0, zP, x, 0.86, zP, 0.022, YEL, 8), rod(x + 0.1, 0.78, zP + 0.08, x + 0.1, 1.15, zP + 0.08, 0.02, YEL, 8), rod(x + 0.1, 1.15, zP + 0.08, x + 0.1, 1.15, -0.02, 0.02, YEL, 8));
        meter.push(ell(x, 0.84, zP + 0.03, 0.065, 0.05, 0.065, GRY, 1), bx(0.3, 0.34, 0.2, x, 0.6, zP + 0.08, GRY), bx(0.25, 0.05, 0.16, x, 0.79, zP + 0.08, mulc(GRY, 0.88)));
        meter.push(bx(0.1, 0.016, 0.02, x, 0.95, zP + 0.035, C3(0xc8241e)));
        const q = quadUV(0.12, 0.12, AT2.gasDial); q.translate(x, 0.6, zP + 0.1815); face.push(q);
      }
      for (const x of [-0.2, 0.3]) meter.push(bx(0.05, 0.05, 0.1, x, 1.0, 0.05, DK));
      meter.push(bx(0.2, 0.06, 0.2, -0.75, 0.03, zP, C3(0x8a8680)));
    } else {
      meter.push(bx(1.0, 0.8, 0.08, 0, 1.6, 0.04, GRY));
      for (let i = 0; i < 4; i++) {
        const x = -0.36 + i * 0.24;
        meter.push(cylC(0.1, 0.1, 0.05, 12, C3(0x8a8e90)).rotateX(PI / 2).translate(x, 1.62, 0.105), cylC(0.085, 0.078, 0.08, 12, C3(0xd8dcdc)).rotateX(PI / 2).translate(x, 1.62, 0.17));
        const q = quadUV(0.15, 0.15, AT2.eMeter); q.translate(x, 1.62, 0.2105); face.push(q);
      }
      meter.push(bx(0.42, 0.5, 0.16, 0.22, 0.78, 0.08, GRY), bx(0.04, 0.14, 0.05, 0.45, 0.8, 0.12, DK));
      pipe.push(rod(0.22, 0.53, 0.06, 0.22, 0.0, 0.06, 0.03, CON, 8), rod(0.1, 1.03, 0.06, 0.1, 1.2, 0.06, 0.025, CON, 8), rod(-0.3, 2.0, 0.05, -0.3, 2.4, 0.05, 0.03, CON, 8));
    }
    return {
      parts: [
        { geometry: merge(pipe), material: M.metal(), castShadow: true },
        { geometry: boxUV(merge(meter), 2), material: M.grimy(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
      ],
      radius: 0,
    };
  }
  /* alley fence piece: 3 m along x, 2.4 m tall, centered on the origin. Posts sit at x = -1.35 and 0.15 so pieces laid end to end
     every 3 m keep a post every 1.5 m with no doubles. v0 weathered board fence (boards face +z), v1 galvanized chain link. */
  function makeFence8(v) {
    const H = 2.4, colliders = [];
    for (let i = 0; i <= 6; i++) colliders.push({ x: -1.5 + i * 0.5, z: 0, r: 0.26 });
    if (v === 0) {
      const r = rng(808), boards = [];
      const n = 20, bw = 3 / n;
      for (let i = 0; i < n; i++) { const x = -1.5 + (i + 0.5) * bw, hh = H - 0.02 - r() * 0.05; boards.push(bx(bw - 0.014, hh, 0.02, x, hh / 2 + 0.03, 0.0, mixc(C3(0x7a6650), C3(0x8a8478), r()), 0, 0, (r() - 0.5) * 0.01)); }
      for (const y of [0.35, 1.25, 2.15]) boards.push(bx(3, 0.09, 0.04, 0, y, -0.031, C3(0x7a6a58)));
      for (const x of [-1.35, 0.15]) boards.push(bx(0.09, H + 0.05, 0.09, x, (H + 0.05) / 2, -0.096, C3(0x6a5a4a)));
      boards.push(bx(3, 0.03, 0.12, 0, H + 0.04, -0.03, C3(0x7a6a58)));
      return { parts: [{ geometry: boxUV(merge(boards), 1.2), material: M.wood(), castShadow: true }], radius: 0, colliders };
    }
    const steel = [];
    for (const x of [-1.35, 0.15]) steel.push(lathe([[0.032, 0], [0.032, H], [0.036, H + 0.02], [0, H + 0.05]], 8, GALV).translate(x, 0, 0));
    steel.push(rod(-1.5, H - 0.03, 0, 1.5, H - 0.03, 0, 0.021, GALV, 6), rod(-1.5, 0.06, 0, 1.5, 0.06, 0, 0.006, GALV, 4));
    const mesh = K.vPanel(-1.5, 0, 1.5, 0, 0.04, H - 0.04);
    { const u = mesh.attributes.uv.array; for (let i = 0; i < u.length; i += 2) { u[i] *= 3 / 0.16; u[i + 1] *= (H - 0.08) / 0.16; } }
    return {
      parts: [
        { geometry: boxUV(merge(steel), 3), material: M.steel(), castShadow: true },
        { geometry: mesh, material: M.chain(), castShadow: false },
      ],
      radius: 0, colliders,
    };
  }

  /* ---------- street life ---------- */
  // canvas umbrella: 8 panels from the top (y1) to the rim (radius R at y0), a valance, both sides drawn (single sided material)
  function umbrellaGeo(R0, y0, y1, colA, colB, val, valC) {
    const S = solid(), n = 8;
    const P = (a, rr, y) => new V3(Math.sin(a) * rr, y, Math.cos(a) * rr);
    for (let i = 0; i < n; i++) {
      const a0 = i / n * TAU, a1 = (i + 1) / n * TAU, col = i % 2 ? colB : colA, top = new V3(0, y1, 0);
      const A = P(a0, R0, y0), B = P(a1, R0, y0), Mid = P((a0 + a1) / 2, R0 * 0.55, lerp(y1, y0, 0.5) + 0.04);
      S.tri(top, A, Mid, col, (c) => new V3(c.x, 1.5, c.z)); S.tri(top, Mid, B, col, (c) => new V3(c.x, 1.5, c.z));
      S.tri(A, B, Mid, col, (c) => new V3(c.x, 1.5, c.z));
      const dk = mulc(col, 0.7), o = 0.006;
      S.tri(top.clone().setY(y1 - o), A.clone().setY(y0 - o), Mid.clone().setY(Mid.y - o), dk, new V3(0, -1, 0)); S.tri(top.clone().setY(y1 - o), Mid.clone().setY(Mid.y - o), B.clone().setY(y0 - o), dk, new V3(0, -1, 0));
      S.tri(A.clone().setY(y0 - o), B.clone().setY(y0 - o), Mid.clone().setY(Mid.y - o), dk, new V3(0, -1, 0));
      if (val) {
        const vc = valC || col, Ab = A.clone().setY(y0 - val), Bb = B.clone().setY(y0 - val), out = new V3(Math.sin((a0 + a1) / 2), 0, Math.cos((a0 + a1) / 2));
        S.quad(A, B, Bb, Ab, vc, out); S.quad(A.clone().addScaledVector(out, -0.004), B.clone().addScaledVector(out, -0.004), Bb.clone().addScaledVector(out, -0.004), Ab.clone().addScaledVector(out, -0.004), mulc(vc, 0.7), out.clone().negate());
      }
    }
    return S.geo();
  }
  // bistro table for two under a market umbrella (v0 black steel chairs and a green umbrella, v1 aluminum chairs, cream and red)
  function makeCafetable(v) {
    const metal = [], top = [], cloth = [];
    const FR = v ? C3(0xa8acb0) : C3(0x1e2220), TOPC = v ? C3(0x8a6040) : C3(0xe8e4dc);
    top.push(cyl(0.33, 0.33, 0.03, 18, TOPC).translate(0, 0.73, 0), cyl(0.31, 0.31, 0.012, 18, mulc(TOPC, 0.8)).translate(0, 0.718, 0));
    metal.push(lathe([[0.03, 0.06], [0.025, 0.7], [0.06, 0.718]], 8, FR), bx(0.6, 0.03, 0.05, 0, 0.03, 0, FR), bx(0.05, 0.03, 0.6, 0, 0.03, 0, FR));
    metal.push(lathe([[0.02, 0.74], [0.018, 2.55], [0.0, 2.6]], 6, C3(0xd8d4c8)));
    cloth.push(umbrellaGeo(1.3, 2.18, 2.58, v ? C3(0xf0e8d4) : C3(0x2f5a3c), v ? C3(0xb8302a) : C3(0x2b5236), 0.16, v ? C3(0xb8302a) : null));
    metal.push(ell(0, 2.6, 0, 0.035, 0.05, 0.035, C3(0xd8d4c8), 0));
    // two chairs facing the table
    const seats = [];
    for (const s of [-1, 1]) {
      const cx = s * 0.62, g = [];
      g.push(cyl(0.2, 0.2, 0.025, 12, mulc(FR, 1.05)).translate(0, 0.45, 0));
      for (const [lx, lz] of [[0.14, 0.14], [-0.14, 0.14], [0.14, -0.14], [-0.14, -0.14]]) g.push(rod(lx * 0.8, 0.44, lz * 0.8, lx * 1.15, 0, lz * 1.15, 0.012, FR, 4));
      const hoop = []; for (let k = 0; k <= 6; k++) { const a = -PI / 2 + k / 6 * PI; hoop.push(new V3(Math.sin(a) * 0.17, 0.46 + Math.cos(a) * 0.4 * (k === 0 || k === 6 ? 0 : 1) + (k === 0 || k === 6 ? 0 : 0.02), -0.16 - Math.cos(a) * 0.04)); }
      g.push(tubeC(hoop, 0.012, FR, 4), rod(-0.15, 0.7, -0.19, 0.15, 0.7, -0.19, 0.01, FR, 4));
      for (const q of g) { q.rotateY(s < 0 ? PI / 2 : -PI / 2); q.translate(cx, 0, 0); metal.push(q); }
      seats.push({ x: cx, z: 0, y: 0.47, ry: s < 0 ? PI / 2 : -PI / 2 });
    }
    return {
      parts: [
        { geometry: merge(metal), material: M.metal(), castShadow: true },
        { geometry: merge(top), material: M.stone(), castShadow: true },
        { geometry: merge(cloth), material: M.canvas(), castShadow: true },
      ],
      radius: 0, colliders: [{ x: 0, z: 0, r: 0.38 }, { x: -0.64, z: 0, r: 0.24 }, { x: 0.64, z: 0, r: 0.24 }], seats,
    };
  }
  // street food cart: v0 stainless hot dog cart, v1 an ice cream cart; striped umbrella, two wheels, a push handle.
  // The menu side faces +z (customers); the vendor stands at `vendor` behind it.
  function makeFoodcart(v) {
    const steel = [], paintP = [], dark = [], atlas = [], cloth = [], bits = [];
    const BODY = v ? C3(0xf2eee6) : C3(0xc8ccd0);
    const W = 1.5, D = 0.74, y0 = 0.3, y1 = 1.0;
    (v ? paintP : steel).push(bx(W, y1 - y0, D, 0, (y0 + y1) / 2, 0, BODY));
    steel.push(bx(W + 0.04, 0.03, D + 0.04, 0, y1 + 0.015, 0, C3(0xd0d4d8)), bx(W - 0.06, 0.03, D - 0.06, 0, y0 - 0.015, 0, C3(0x9a9ea2)));
    const ps = quadUV(1.3, 0.32, v ? AT2.icecream : AT2.hotdog); ps.translate(0.0, 0.66, D / 2 + 0.002); atlas.push(ps);
    // back: cabinet doors and a towel bar
    for (const x of [-0.35, 0.35]) dark.push(bx(0.6, 0.5, 0.01, x, 0.64, -D / 2 - 0.004, mulc(BODY, 0.85)), bx(0.04, 0.12, 0.02, x + (x < 0 ? 0.24 : -0.24), 0.66, -D / 2 - 0.012, C3(0x2a2a2a)));
    if (!v) {
      // steam wells with domed lids, a griddle, mustard and ketchup, a napkin box
      for (const x of [-0.42, 0.0]) steel.push(cylC(0.17, 0.17, 0.32, 10, C3(0xd8dcdf), false).rotateZ(PI / 2).scale(1, 0.45, 1).translate(x, y1 + 0.03, 0.05), bx(0.04, 0.03, 0.06, x, y1 + 0.12, 0.05, C3(0x2a2a2a)));
      dark.push(bx(0.42, 0.03, 0.5, 0.45, y1 + 0.03, 0.0, C3(0x2a2a2c)));
      for (const [x, z, c] of [[0.35, -0.24, C3(0xc8241e)], [0.43, -0.24, C3(0xe8b81e)], [0.51, -0.24, C3(0xc8241e)]]) bits.push(cyl(0.028, 0.028, 0.18, 6, c).translate(x, y1 + 0.03, z), cyl(0.008, 0.016, 0.05, 5, c).translate(x, y1 + 0.21, z));
      bits.push(bx(0.16, 0.14, 0.1, 0.62, y1 + 0.1, 0.2, C3(0xd8d8d4)));
    } else {
      // freezer lids with handles, a stack of cones
      for (const x of [-0.36, 0.36]) paintP.push(bx(0.68, 0.04, D - 0.08, x, y1 + 0.035, 0, C3(0xe8e4dc))), dark.push(bx(0.2, 0.025, 0.03, x, y1 + 0.07, 0.25, C3(0x6a6e70)));
      for (let k = 0; k < 5; k++) bits.push(cylC(0.024, 0.006, 0.09, 6, C3(0xd8a050)).rotateX(PI).translate(0.6, y1 + 0.15 + k * 0.02, -0.2));
    }
    // wheels at the +x end, legs at the -x end, push handle at -x
    for (const s of [-1, 1]) {
      dark.push(cylC(0.28, 0.28, 0.05, 14, C3(0x1c1c1c)).rotateX(PI / 2).translate(0.52, 0.28, s * (D / 2 + 0.05)));
      steel.push(cylC(0.12, 0.12, 0.055, 10, C3(0xb8bcc0)).rotateX(PI / 2).translate(0.52, 0.28, s * (D / 2 + 0.052)));
      steel.push(rod(-0.62, y0, s * 0.3, -0.62, 0.0, s * 0.3, 0.02, C3(0x9a9ea2), 5));
      steel.push(rod(-W / 2, 0.92, s * 0.25, -W / 2 - 0.3, 1.0, s * 0.25, 0.018, C3(0xb8bcc0), 6));
    }
    steel.push(rod(0.52, 0.28, -D / 2 - 0.05, 0.52, 0.28, D / 2 + 0.05, 0.02, C3(0x8a8e92), 5), rod(-W / 2 - 0.3, 1.0, -0.26, -W / 2 - 0.3, 1.0, 0.26, 0.02, C3(0x1a1a1a), 6));
    // umbrella on a pole at the vendor's corner
    steel.push(rod(-0.55, y1, -0.22, -0.55, 2.35, -0.22, 0.02, C3(0xd8d4c8), 6));
    const umb = umbrellaGeo(1.05, 2.0, 2.38, v ? C3(0xf2f0ea) : C3(0x1d4f91), v ? C3(0xe880a8) : C3(0xf2c020), 0.12, v ? C3(0xe880a8) : C3(0x1d4f91));
    umb.translate(-0.55, 0, -0.22); cloth.push(umb);
    const parts = [
      { geometry: boxUV(merge(steel), 2), material: M.steel(), castShadow: true },
      { geometry: merge(dark), material: M.metal(), castShadow: true },
      { geometry: merge(atlas), material: M.atlas2(), castShadow: false },
      { geometry: merge(cloth), material: M.canvas(), castShadow: true },
      { geometry: merge(bits), material: M.plastic(), castShadow: false },
    ];
    if (paintP.length) parts.push({ geometry: boxUV(merge(paintP), 1.4), material: M.grimy(), castShadow: true });
    return { parts, radius: 0, colliders: [{ x: -0.5, z: 0, r: 0.45 }, { x: 0.05, z: 0, r: 0.45 }, { x: 0.55, z: 0, r: 0.45 }], vendor: { x: -0.1, z: -0.9, ry: 0 } };
  }
  // A frame chalkboard sign, both faces readable
  function makeSandwichboard() {
    const wood = [], face = [], slate = [];
    const PW = 0.6, PH = 0.92, th = Math.atan2(0.24, PH);
    for (const s of [1, -1]) {
      const g = [], f = [], sl = [];
      g.push(bx(0.04, PH, 0.025, -PW / 2 + 0.02, 0, 0, C3(0x7a5434)), bx(0.04, PH, 0.025, PW / 2 - 0.02, 0, 0, C3(0x7a5434)), bx(PW, 0.05, 0.025, 0, PH / 2 - 0.025, 0, C3(0x7a5434)), bx(PW, 0.05, 0.025, 0, -PH / 2 + 0.08, 0, C3(0x7a5434)));
      sl.push(bx(PW - 0.08, PH - 0.15, 0.012, 0, 0.02, 0, C3(0x1e2a24)));
      const q = quadUV(PW - 0.08, PH - 0.15, AT2.chalk); q.translate(0, 0.02, 0.0075); f.push(q);
      for (const [list, src] of [[wood, g], [face, f], [slate, sl]]) for (const x of src) { x.rotateX(-th); x.translate(0, PH / 2 * Math.cos(th) + 0.01, 0.12); if (s < 0) x.rotateY(PI); list.push(x); }
    }
    wood.push(bx(0.5, 0.02, 0.02, 0, PH * Math.cos(th) + 0.02, 0, C3(0x5a5a5a)));
    return {
      parts: [
        { geometry: boxUV(merge(wood), 2), material: M.wood(), castShadow: true },
        { geometry: merge(slate), material: M.metal(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
      ],
      radius: 0.32,
    };
  }
  // parked bicycle on its kickstand (leans toward +x), front +z; v0 red road bike, v1 teal city bike with a basket
  function makeBicycle(v) {
    const frame = [], tires = [], spokes = [], dark = [], basket = [];
    const FC = v ? C3(0x2a6a6e) : C3(0xa8201c), BLK = C3(0x161616), SIL = C3(0xb8bcc0), wr = 0.34, zr = -0.52, zf = 0.52;
    for (const z of [zr, zf]) {
      tires.push(prep(new THREE.TorusGeometry(wr - 0.018, 0.018, 4, 16)).rotateY(PI / 2).translate(0, wr, z));
      const q = quadUV(0.66, 0.66, AT2.spokes); q.rotateY(PI / 2); q.translate(0, wr, z); spokes.push(q);
    }
    paint(tires[0], BLK); paint(tires[1], BLK);
    const RA = [0, wr, zr], BB = [0, 0.3, -0.06], ST = [0, 0.84, -0.2], HT = [0, 0.86, 0.36], HB = [0, 0.7, 0.41], FA = [0, wr, zf];
    const tubeAB = (a, b, rad = 0.016, col = FC) => frame.push(rod(a[0], a[1], a[2], b[0], b[1], b[2], rad, col, 4));
    tubeAB(BB, HB, 0.02); tubeAB([0, 0.8, -0.19], HT, 0.017); tubeAB(BB, ST, 0.018); tubeAB(HB, HT, 0.024);
    for (const s of [-1, 1]) { tubeAB([s * 0.01, 0.3, -0.06], [s * 0.05, wr, zr], 0.011); tubeAB([s * 0.01, 0.8, -0.19], [s * 0.05, wr, zr], 0.01); tubeAB([s * 0.02, 0.7, 0.41], [s * 0.05, wr, zf], 0.012); }
    tubeAB(ST, [0, 0.95, -0.23], 0.012, SIL);
    dark.push(ell(0, 0.97, -0.22, 0.07, 0.03, 0.13, BLK, 0));
    tubeAB(HT, [0, 0.97, 0.33], 0.014, SIL);
    const bw = v ? 0.28 : 0.22;
    dark.push(rod(-bw, 0.97, 0.33, bw, 0.97, 0.33, 0.012, v ? SIL : BLK, 4), rod(-bw - 0.1, 0.97, 0.33, -bw, 0.97, 0.33, 0.017, BLK, 4), rod(bw, 0.97, 0.33, bw + 0.1, 0.97, 0.33, 0.017, BLK, 4));
    // drivetrain on the right side (-x): chainring, crank, pedals, chain
    dark.push(cylC(0.09, 0.09, 0.008, 10, C3(0x7a7e82)).rotateZ(PI / 2).translate(-0.05, 0.3, -0.06), cylC(0.04, 0.04, 0.008, 6, C3(0x7a7e82)).rotateZ(PI / 2).translate(-0.05, wr, zr));
    dark.push(bx(0.012, 0.012, 0.47, -0.052, 0.355, (zr - 0.06) / 2, BLK), bx(0.012, 0.012, 0.47, -0.052, 0.27, (zr - 0.06) / 2, BLK));
    for (const s of [-1, 1]) { dark.push(bx(0.02, 0.16, 0.025, s * 0.08, 0.3 - s * 0.06, -0.06 + s * 0.03, SIL, s * 0.4), bx(0.09, 0.02, 0.06, s * 0.13, 0.3 - s * 0.14, -0.06 + s * 0.06, BLK)); }
    // kickstand on the left (+x)
    dark.push(rod(0.04, 0.3, -0.16, 0.2, 0.02, -0.26, 0.01, SIL, 4));
    if (v) {
      // front basket: a wire crate on a small rack over the front wheel, a rear rack and fenders
      const bc = C3(0x2a2a2a);
      for (let k = 0; k < 4; k++) { const q = quadUV(0.34, 0.22, AT2.crate, bc); q.translate(0, 0, 0.14); q.rotateY(k * PI / 2); q.translate(0, 0.98, 0.55); basket.push(q); }
      const bq = quadUV(0.28, 0.28, AT2.crate, bc); bq.rotateX(-PI / 2); bq.translate(0, 0.88, 0.55); basket.push(bq);
      frame.push(rod(0, 0.86, 0.42, 0, 0.87, 0.55, 0.008, SIL, 4));
      for (const z of [zr, zf]) { const f = []; for (let k = 0; k <= 4; k++) { const a = 0.3 + k / 4 * 1.9; f.push(new V3(0, wr + Math.sin(a) * (wr + 0.03), z + Math.cos(a) * (wr + 0.03) * (z > 0 ? 1 : -1))); } frame.push(tubeC(f, 0.022, FC, 4)); }
    }
    const lean = (list) => list.map((g) => g.rotateZ(-0.1));
    const parts = [
      { geometry: merge(lean(frame)), material: M.metal(), castShadow: true },
      { geometry: merge(lean([...tires, ...dark])), material: M.metal(), castShadow: true },
      { geometry: merge(lean(spokes)), material: M.atlas2Cut(), castShadow: false },
    ];
    if (basket.length) parts.push({ geometry: merge(lean(basket)), material: M.atlas2Cut(), castShadow: false });
    return { parts, radius: 0, colliders: [{ x: 0.04, z: -0.36, r: 0.24 }, { x: 0.04, z: 0.36, r: 0.24 }] };
  }
  // square cast iron tree grate 1.2 m, flush with the sidewalk: mulch under the slots; the street tree goes in the middle
  function makeTreegrate() {
    const soil = prep(new THREE.PlaneGeometry(1.18, 1.18)); soil.rotateX(-PI / 2); soil.translate(0, 0.004, 0); paint(soil, C3(0x7a5a3e));
    const gr = quadUV(1.2, 1.2, AT2.grate); gr.rotateX(-PI / 2); gr.translate(0, 0.014, 0);
    const fr = [];
    for (const s of [-1, 1]) fr.push(bx(1.26, 0.016, 0.03, 0, 0.008, s * 0.615, C3(0x2a2826)), bx(0.03, 0.016, 1.2, s * 0.615, 0.008, 0, C3(0x2a2826)));
    return {
      parts: [
        { geometry: boxUV(soil, 1.6), material: M.soil(), castShadow: false },
        { geometry: gr, material: M.atlas2Cut(), castShadow: false },
        { geometry: merge(fr), material: M.metal(), castShadow: false },
      ],
      radius: 0, trunk: { x: 0, z: 0, r: 0.19 },
    };
  }
  // single head parking meter on a post (window and coin plate face +z)
  function makeParkingmeter() {
    const g = [], face = [];
    const HC = C3(0x8e949a), PC = C3(0x5a5e62);
    g.push(lathe([[0.06, 0], [0.06, 0.02], [0.032, 0.05], [0.03, 1.07], [0.045, 1.09], [0.045, 1.11]], 8, PC));
    g.push(bx(0.17, 0.22, 0.13, 0, 1.22, 0, HC));
    const top = prep(new THREE.CylinderGeometry(0.085, 0.085, 0.13, 12, 1, false, -PI / 2, PI)); top.rotateX(-PI / 2); top.translate(0, 1.33, 0); g.push(paint(top, HC));
    g.push(cylC(0.02, 0.02, 0.03, 8, C3(0xc8ccd0)).rotateZ(PI / 2).translate(0.1, 1.2, 0.0));
    const q = quadUV(0.12, 0.18, AT2.meterFace); q.translate(0, 1.26, 0.0662); face.push(q);
    return {
      parts: [
        { geometry: boxUV(merge(g), 3), material: M.steel(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
      ],
      radius: 0.1,
    };
  }
  // city information kiosk: a slab with two backlit panels (lit at night). v0 map and zoo ad, v1 two ads
  function makeKiosk(v) {
    const frame = [], lit = [];
    const FC = C3(0x2a2e32);
    frame.push(bx(1.32, 2.3, 0.3, 0, 1.27, 0, FC), bx(1.38, 0.12, 0.36, 0, 0.06, 0, mulc(FC, 0.8)), bx(1.42, 0.07, 0.4, 0, 2.455, 0, mulc(FC, 1.2)));
    for (const s of [1, -1]) {
      const q = quadUV(1.1, 1.78, s > 0 ? (v ? AT2.ad0 : AT2.map) : (v ? AT2.ad1 : AT2.ad0)); if (s < 0) q.rotateY(PI); q.translate(0, 1.28, s * 0.152); lit.push(setGlow(q, 0.85));
      frame.push(bx(1.18, 0.04, 0.02, 0, 2.2, s * 0.155, mulc(FC, 1.3)), bx(1.18, 0.04, 0.02, 0, 0.37, s * 0.155, mulc(FC, 1.3)));
    }
    return {
      parts: [
        { geometry: boxUV(merge(frame), 2), material: M.metal(), castShadow: true },
        { geometry: merge(lit), material: M.atlas2Lit(), castShadow: false },
      ],
      radius: 0, colliders: [{ x: -0.36, z: 0, r: 0.3 }, { x: 0.36, z: 0, r: 0.3 }],
    };
  }
  // pay phone on a pedestal with an aluminum shroud and a lit PHONE sign on top
  function makePhonebooth() {
    const steel = [], dark = [], face = [], lit = [];
    const AL = C3(0xb4b8bc);
    steel.push(bx(0.1, 1.15, 0.1, 0, 0.575, -0.1, C3(0x7a7e82)), bx(0.3, 0.04, 0.3, 0, 0.02, -0.1, C3(0x6a6e72)));
    steel.push(bx(0.56, 0.72, 0.02, 0, 1.47, -0.14, AL));
    for (const s of [-1, 1]) steel.push(bx(0.02, 0.72, 0.34, s * 0.28, 1.47, 0.02, AL));
    steel.push(bx(0.6, 0.04, 0.38, 0, 1.85, 0.02, AL), bx(0.5, 0.025, 0.16, 0, 1.13, 0.02, AL));
    dark.push(bx(0.24, 0.44, 0.1, 0, 1.45, -0.08, C3(0x9aa0a4)));
    const kq = quadUV(0.2, 0.3, AT2.phoneKeys); kq.translate(0, 1.42, -0.0285); face.push(kq);
    dark.push(roundBox(0.06, 0.24, 0.07, 0.025, C3(0x1a1a1a)).translate(-0.16, 1.5, -0.05), rod(-0.16, 1.38, -0.05, -0.1, 1.28, -0.06, 0.008, C3(0x9aa0a4), 4));
    steel.push(bx(0.58, 0.14, 0.08, 0, 1.94, -0.04, C3(0x1d4f91)));
    for (const s of [1, -1]) { const q = quadUV(0.56, 0.12, AT2.phoneSign); if (s < 0) q.rotateY(PI); q.translate(0, 1.94, -0.04 + s * 0.041); lit.push(setGlow(q, 0.9)); }
    return {
      parts: [
        { geometry: boxUV(merge(steel), 2), material: M.steel(), castShadow: true },
        { geometry: merge(dark), material: M.metal(), castShadow: true },
        { geometry: merge(face), material: M.atlas2(), castShadow: false },
        { geometry: merge(lit), material: M.atlas2Lit(), castShadow: false },
      ],
      radius: 0.3,
    };
  }
  // classic cast iron post clock, about 4.4 m, two lit faces (+z and -z)
  function makeStreetclock() {
    const iron = [], faces = [];
    const blk = C3(0x1d2420);
    iron.push(lathe([[0.34, 0], [0.34, 0.1], [0.28, 0.14], [0.28, 0.3], [0.24, 0.36], [0.2, 0.5], [0.16, 0.58], [0.15, 0.66]], 12, blk));
    iron.push(lathe([[0.11, 0.66], [0.09, 3.3]], 12, (y, a) => mulc(blk, Math.floor(a / TAU * 12 + 0.5) % 2 ? 0.75 : 1.25)));
    iron.push(lathe([[0.12, 1.6], [0.12, 1.68]], 12, blk), lathe([[0.1, 3.28], [0.15, 3.36], [0.17, 3.44], [0.12, 3.5], [0.1, 3.56]], 12, blk));
    const yc = 3.98, rr = 0.42, dep = 0.2;
    iron.push(cylC(rr, rr, dep, 24, blk).rotateX(PI / 2).translate(0, yc, 0));
    for (const s of [1, -1]) iron.push(lathe([[rr + 0.02, 0], [rr + 0.03, 0.02], [rr - 0.01, 0.035]], 24, mulc(blk, 1.3)).rotateX(s * PI / 2).translate(0, yc, s * dep / 2));
    iron.push(lathe([[0.08, yc + rr - 0.02], [0.1, yc + rr + 0.06], [0.06, yc + rr + 0.16], [0.03, yc + rr + 0.2], [0.05, yc + rr + 0.24], [0, yc + rr + 0.36]], 8, mulc(blk, 1.1)));
    iron.push(lathe([[0.1, 3.56], [0.14, 3.58], [0.08, yc - rr + 0.04]], 8, blk));
    for (const s of [1, -1]) {
      const f = prep(new THREE.CircleGeometry(rr - 0.03, 24)), u = f.attributes.uv.array, rc = AT2.clock;
      for (let i = 0; i < u.length; i += 2) { const fu = 0.5 + (u[i] - 0.5) * (rr - 0.03) / (rr + 0.02) * 0.98, fv = 0.5 + (u[i + 1] - 0.5) * (rr - 0.03) / (rr + 0.02) * 0.98; u[i] = lerp(rc[0], rc[2], fu); u[i + 1] = lerp(rc[1], rc[3], fv); }
      if (s < 0) f.rotateY(PI);
      f.translate(0, yc, s * (dep / 2 + 0.002)); faces.push(setGlow(paint(f, [1, 1, 1]), 1.0));
    }
    return {
      parts: [
        { geometry: boxUV(merge(iron), 3), material: M.metal(), castShadow: true },
        { geometry: merge(faces), material: M.atlas2Lit(), castShadow: false },
      ],
      radius: 0.32,
    };
  }
  // long wooden planter box (2.4 x 0.6 m, 0.55 tall) full of flowers (v0 cedar with reds and whites, v1 charcoal with purples, yellows, grasses)
  function makePlanterbox(v) {
    const r = rng(620 + v), wood = [], soil = [], cards = [];
    const WC = v ? C3(0x3a3c3a) : C3(0x9a6a44), L2 = 2.4, D2 = 0.6, H = 0.55;
    for (const s of [-1, 1]) { wood.push(bx(L2, H - 0.05, 0.035, 0, (H - 0.05) / 2, s * (D2 / 2 - 0.018), WC), bx(0.035, H - 0.05, D2, s * (L2 / 2 - 0.018), (H - 0.05) / 2, 0, WC)); }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) wood.push(bx(0.07, H, 0.07, sx * (L2 / 2 - 0.03), H / 2, sz * (D2 / 2 - 0.03), mulc(WC, 0.85)));
    for (const s of [-1, 1]) wood.push(bx(L2 + 0.04, 0.035, 0.09, 0, H + 0.012, s * (D2 / 2 - 0.02), mulc(WC, 1.08)), bx(0.09, 0.035, D2, s * (L2 / 2 - 0.02), H + 0.012, 0, mulc(WC, 1.08)));
    const sl = prep(new THREE.PlaneGeometry(L2 - 0.08, D2 - 0.08)); sl.rotateX(-PI / 2); sl.translate(0, H - 0.06, 0); soil.push(paint(sl, C3(0x3e3024)));
    const schemes = [[[0xd8302a, 0], [0xf4f2ee, 1], [0xe86a8a, 0]], [[0x8a4ac8, 2], [0xf2d040, 1], [0xc8a0e8, 0]]][v];
    const cellUV = (k) => [(k % 2) * 0.5, k < 2 ? 0.5 : 0, (k % 2) * 0.5 + 0.5, k < 2 ? 1 : 0.5];
    for (let i = 0; i < 34; i++) {
      const x = -L2 / 2 + 0.12 + r() * (L2 - 0.24), z = (r() - 0.5) * (D2 - 0.2), sc = schemes[i % 3];
      cards.push({ p: new V3(x, H + 0.12 + r() * 0.08, z), n: new V3(0, 1, 0), c: mulc(C3(sc[0]), 0.85 + r() * 0.3), s: 0.32 + r() * 0.12, uv: cellUV(sc[1]) });
      if (i % 2) cards.push({ p: new V3(x + (r() - 0.5) * 0.1, H + 0.06, z), n: new V3(0, 1, 0), c: mulc(C3(0x3a6a2a), 0.85 + r() * 0.3), s: 0.38, uv: cellUV(3) });
    }
    if (v) for (let i = 0; i < 6; i++) cards.push({ p: new V3(-1.0 + i * 0.4, H + 0.3, (r() - 0.5) * 0.2), n: new V3(0, 1, 0), c: mulc(C3(0x8a9a5a), 0.9 + r() * 0.2), s: 0.6, uv: cellUV(2) });
    return {
      parts: [
        { geometry: boxUV(merge(wood), 2), material: M.wood(), castShadow: true },
        { geometry: boxUV(merge(soil), 1.2), material: M.soil(), castShadow: false },
        { geometry: cardList(cards, r), material: M.flowers(), castShadow: true, depthMaterial: flowerDepth() },
      ],
      radius: 0, colliders: [{ x: -0.8, z: 0, r: 0.4 }, { x: 0, z: 0, r: 0.4 }, { x: 0.8, z: 0, r: 0.4 }],
    };
  }
  // traffic cone 0.71 m (28 in): orange with two white reflective collars on a black base
  function makeCone() {
    const OR = C3(0xf0601a), WH2 = C3(0xf0f0ea);
    const prof = [[0.16, 0.035], [0.152, 0.08], [0.11, 0.3], [0.11, 0.3], [0.087, 0.42], [0.087, 0.42], [0.066, 0.52], [0.066, 0.52], [0.058, 0.56], [0.058, 0.56], [0.043, 0.63], [0.043, 0.63], [0.03, 0.7], [0.0, 0.71]];
    const ringCol = [OR, OR, OR, WH2, WH2, OR, OR, OR, OR, WH2, WH2, OR, OR, OR];
    const cone = lathe(prof, 14, (y, a, rr, k) => ringCol[k], { smooth: true });
    const base = lathe([[0.19 * Math.SQRT2, 0], [0.19 * Math.SQRT2, 0.035], [0.15 * Math.SQRT2, 0.04], [0, 0.04]], 4, C3(0x1a1a1a), { phi0: PI / 4, facet: true });
    return { parts: [{ geometry: merge([cone, base]), material: M.plastic(), castShadow: true }], radius: 0.2 };
  }
  // construction barricade (type II): two striped rails on folding A legs, an amber lamp on top (lit at night)
  function makeBarrier() {
    const rails = [], legs = [], stripes = [], lamp = [], lens = [];
    const W = 1.3;
    for (const y of [0.95, 0.62]) {
      rails.push(bx(W, 0.2, 0.025, 0, y, 0, C3(0xf2f0ea)));
      for (const s of [1, -1]) { const q = quadUV(W - 0.02, 0.19, AT2.stripes); if (s < 0) q.rotateY(PI); q.translate(0, y, s * 0.0135); stripes.push(q); }
    }
    for (const x of [-0.52, 0.52]) {
      for (const s of [-1, 1]) legs.push(rod(x, 1.08, s * 0.03, x, 0.0, s * 0.34, 0.022, C3(0xf2f0ea), 5), bx(0.06, 0.03, 0.1, x, 0.015, s * 0.34, C3(0x2a2a2a)));
      legs.push(rod(x, 0.3, -0.24, x, 0.3, 0.24, 0.01, C3(0x9a9ea2), 4));
    }
    lamp.push(bx(0.04, 0.12, 0.04, 0.52, 1.14, 0, C3(0x2a2a2a)), cyl(0.07, 0.07, 0.04, 10, C3(0xe8b020)).translate(0.52, 1.2, 0));
    lens.push(setGlow(cyl(0.065, 0.06, 0.08, 10, C3(0xffa020)).translate(0.52, 1.24, 0), 1.6));
    return {
      parts: [
        { geometry: merge([...rails, ...legs, ...lamp]), material: M.plastic(), castShadow: true },
        { geometry: merge(stripes), material: M.atlas2(), castShadow: false },
        { geometry: merge(lens), material: smat('amberLamp', { emissive: 0xffa030, glow: 'night' }), castShadow: false },
      ],
      radius: 0, colliders: [{ x: -0.45, z: 0, r: 0.3 }, { x: 0, z: 0, r: 0.3 }, { x: 0.45, z: 0, r: 0.3 }],
    };
  }

  /* ---------- parking lots ---------- */
  // attendant booth 1.6 x 1.6 m: panel walls, glass all round, a sliding window on +z, door on -z, lit PARKING sign and a ceiling light
  function makeParkbooth() {
    const wall = [], frame = [], glass = [], atlas = [], lit = [], lens = [], con = [];
    const WC = C3(0xe4dccb), FR = C3(0x3a3428), hs = 0.8, yb = 1.0, yt = 2.25;
    con.push(bx(1.9, 0.12, 1.9, 0, 0.06, 0, C3(0xb2aea4)));
    for (let k = 0; k < 4; k++) {
      const g = [bx(1.6, yb - 0.12, 0.08, 0, (yb + 0.12) / 2, hs - 0.04, WC)], f = [bx(1.6, 0.06, 0.1, 0, yb, hs - 0.04, FR), bx(1.6, 0.08, 0.1, 0, yt, hs - 0.04, FR), bx(0.05, yt - yb, 0.08, 0, (yb + yt) / 2, hs - 0.04, FR)];
      const gl = [K.vPanel(-0.78, hs - 0.04, -0.03, hs - 0.04, yb + 0.03, yt - 0.04), K.vPanel(0.03, hs - 0.04, 0.78, hs - 0.04, yb + 0.03, yt - 0.04)];
      if (k === 2) { g.length = 0; g.push(bx(0.9, yb - 0.12, 0.08, -0.35, (yb + 0.12) / 2, hs - 0.04, WC)); f.push(bx(0.06, yt - 0.12, 0.1, 0.12, (yt + 0.12) / 2, hs - 0.04, FR), bx(0.06, yt - 0.12, 0.1, 0.76, (yt + 0.12) / 2, hs - 0.04, FR)); gl.push(K.vPanel(0.16, hs - 0.04, 0.72, hs - 0.04, 0.2, yb)); }
      for (const [list, src] of [[wall, g], [frame, f], [glass, gl]]) for (const q of src) { q.rotateY(k * PI / 2); list.push(q); }
    }
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) frame.push(bx(0.08, yt - 0.12, 0.08, sx * (hs - 0.04), (yt + 0.12) / 2, sz * (hs - 0.04), FR));
    frame.push(bx(2.1, 0.14, 2.1, 0, yt + 0.11, 0, C3(0x5a5650)), bx(2.14, 0.24, 0.04, 0, yt + 0.06, 1.05, C3(0x123a6a)), bx(2.14, 0.24, 0.04, 0, yt + 0.06, -1.05, C3(0x123a6a)));
    for (const s of [1, -1]) { const q = quadUV(0.96, 0.23, AT2.parkSign); if (s < 0) q.rotateY(PI); q.translate(0, yt + 0.06, s * 1.0725); lit.push(setGlow(q, 0.95)); }
    const rq = quadUV(0.36, 0.46, AT2.rates); rq.translate(0.45, 0.58, hs + 0.002); atlas.push(rq);
    // inside: counter, cash box, stool, ceiling light
    wall.push(bx(1.4, 0.05, 0.36, 0, 1.0, 0.55, C3(0x8a7a62)), bx(0.3, 0.12, 0.25, 0.35, 1.085, 0.55, C3(0x3a3c3e)));
    frame.push(rod(0, 0, 0.05, 0, 0.62, 0.05, 0.025, C3(0x6a6e70), 5), cyl(0.18, 0.18, 0.06, 10, C3(0x2a2a2a)).translate(0, 0.62, 0.05));
    lens.push(setGlow(bx(0.6, 0.03, 0.3, 0, yt - 0.03, 0, C3(0xf0eee6)), 1.4));
    return {
      parts: [
        { geometry: boxUV(merge(wall), 1.5), material: M.grimy(), castShadow: true },
        { geometry: merge(frame), material: M.metal(), castShadow: true },
        { geometry: merge(glass), material: glassMat(), castShadow: false, depthMaterial: null },
        { geometry: merge(atlas), material: M.atlas2(), castShadow: false },
        { geometry: merge(lit), material: M.atlas2Lit(), castShadow: false },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        { geometry: boxUV(merge(con), 1.2), material: M.concrete(), castShadow: false },
        poolPart(poolGeo(2.6, 0, 0.4, 0.13, 1.2)),
      ],
      radius: 0, colliders: [{ x: -0.42, z: -0.42, r: 0.5 }, { x: 0.42, z: -0.42, r: 0.5 }, { x: -0.42, z: 0.42, r: 0.5 }, { x: 0.42, z: 0.42, r: 0.5 }],
      light: { x: 0, y: yt - 0.1, z: 0 }, window: { x: 0, z: 1.2 },
    };
  }
  // precast concrete wheel stop, 1.8 m (v0 bare, v1 painted yellow); its length runs along x
  function makeWheelstop(v) {
    const col = v ? C3(0xd8b42a) : C3(0xa8a49a);
    const g = prism([[-0.09, 0], [0.09, 0], [0.078, 0.1], [0.052, 0.125], [-0.052, 0.125], [-0.078, 0.1]], -0.9, 0.9, col);
    const holes = [];
    for (const x of [-0.6, 0.6]) holes.push(cyl(0.022, 0.022, 0.004, 6, C3(0x2a2a2a)).translate(x, 0.124, 0));
    return { parts: [{ geometry: boxUV(merge([g, ...holes]), 1.5), material: M.concrete(), castShadow: true }], radius: 0 };
  }
  // parking lot light: 9 m pole on a concrete pier; v0 two shoebox heads back to back (along x), v1 one head reaching +z.
  // light: the first head's lens; lights: every head
  function makeLotlight(v) {
    const pole = [], heads = [], lens = [], pier = [], pools = [];
    pier.push(lathe([[0.32, 0], [0.32, 0.72], [0.29, 0.78], [0.2, 0.8]], 12, C3(0xb0aca2)));
    pole.push(lathe([[0.13, 0.78], [0.13, 0.84], [0.1, 0.88], [0.085, 8.9], [0.09, 8.95], [0, 9.0]], 8, C3(0x3c3a36)));
    const dirs = v ? [[0, 1]] : [[1, 0], [-1, 0]], lights = [];
    for (const [dx, dz] of dirs) {
      const ax = dx * 0.75, az = dz * 0.75, y = 8.85;
      heads.push(rod(dx * 0.06, y, dz * 0.06, ax, y, az, 0.04, C3(0x3c3a36), 6));
      heads.push(bx(dx ? 0.64 : 0.48, 0.14, dx ? 0.48 : 0.64, ax + dx * 0.3, y, az + dz * 0.3, C3(0x3c3a36)));
      const lx = ax + dx * 0.3, lz = az + dz * 0.3;
      lens.push(setGlow(bx(dx ? 0.56 : 0.4, 0.012, dx ? 0.4 : 0.56, lx, y - 0.075, lz, C3(0xf4f0e6)), 1.8));
      lights.push({ x: lx, y: y - 0.09, z: lz });
      pools.push(poolPart(poolGeo(9.5, lx, lz, 0.03, 1), 0.14));
    }
    return {
      parts: [
        { geometry: boxUV(merge(pier), 1.4), material: M.concrete(), castShadow: true },
        { geometry: merge([...pole, ...heads]), material: M.metal(), castShadow: true },
        { geometry: merge(lens), material: M.lamp(), castShadow: false },
        ...pools,
      ],
      radius: 0.34, light: lights[0], lights,
    };
  }

  const STREET_PROPS2 = {
    stopsign: makeStopsign, streetsign2: makeStreetsign2, oneway: makeOneway, noparking: makeNoparking, parkingsign: makeParkingsign,
    speedlimit: makeSpeedlimit, busstopsign: makeBusstopsign, crosswalksign: makeCrosswalksign,
    dumpster: makeDumpster, trashbags: makeTrashbags, recycling: makeRecycling, pallet: makePallet, crates: makeCrates, acunit: makeAcunit,
    gaspipe: makeGaspipe, fence8: makeFence8,
    cafetable: makeCafetable, foodcart: makeFoodcart, sandwichboard: makeSandwichboard, bicycle: makeBicycle, treegrate: makeTreegrate,
    parkingmeter: makeParkingmeter, kiosk: makeKiosk, phonebooth: makePhonebooth, streetclock: makeStreetclock, planterbox: makePlanterbox,
    cone: makeCone, barrier: makeBarrier,
    parkbooth: makeParkbooth, wheelstop: makeWheelstop, lotlight: makeLotlight,
  };
  Object.assign(PROPS, STREET_PROPS2);
  Object.assign(VARIANTS, {
    streetsign2: 4, oneway: 2, dumpster: 2, trashbags: 2, crates: 2, acunit: 2, gaspipe: 2, fence8: 2,
    cafetable: 2, foodcart: 2, bicycle: 2, kiosk: 2, planterbox: 2, wheelstop: 2, lotlight: 2,
  });

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
     Road, sidewalk, alley, lot and plaza surfaces (shared materials, no vertex colors needed)
     The uv each quad must carry (u, v):
       road      the 14 m city street: u 0..1 across 14 m (left curb to right curb, looking along +v), v = meters along / 12.
                 From the center out on each side: double yellow (0.05..0.15 m), travel lane to 3.5 m, solid white line
                 3.5..3.6 m, parking lane 3.6..6.6 m (a curb side T mark every 6 m, at v = 0 and 0.5 of each tile),
                 concrete gutter pan 6.6..7.0 m. Parked car centers sit 5.8 m from the center (u 0.0857 and 0.9143),
                 stall centers at v = 0.25 and 0.75 (+ whole numbers).
       country   u 0..1 across 7 m, v = meters along / 12
       junction  world meters / 10 (both axes)
       zebra     u 0..1 across 14 m (curb to curb), v 0..1 over the crosswalk depth (drawn for 3 m). Opaque: it covers the
                 lane lines under it, the way real lane lines stop at a crosswalk.
       sidewalk  world meters / 1.5 (one slab per unit)
       curb      u = meters along, v = meters up the face (and meters across the top, 0 at the road edge)
       paving    world meters / 2
       alley     u = meters across / 4, the drain line at u = 0.5 (u = (x - alley center) / 4 + 0.5), v = meters along / 6
       parking   u = meters / 10.4 across the stalls (4 stalls of 2.6 m), v = meters / 18 along the bays: a stall row from
                 v 0 to 0.3 (5.4 m deep, head line at v = 0), the aisle 0.3..0.7 (7.2 m), the facing row 0.7..1.0
                 (head line at v = 1). Stall centers: u = (i + 0.5) / 4, v = 0.15 and 0.85.
       plaza     world meters / 3.6 (6 x 6 granite pavers of 0.6 m)
       puddle    u, v 0..1 over one puddle quad (2 to 4 m across), laid 0.01 m above the surface under it
     ============================================================ */
  // fast per pixel grain: fine noise plus aggregate stones (lighter and darker single pixels and pairs)
  function grain(c, w, h, r, amt, stones = 0.06, light = [150, 148, 142], dark = [26, 26, 28]) {
    const img = c.getImageData(0, 0, w, h), d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (r() - 0.5) * amt;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
      const s = r();
      if (s < stones) {
        const lt = s < stones * 0.4, col = lt ? light : dark, k = 0.22 + r() * 0.36;
        for (let j = 0; j < (r() < 0.35 ? 2 : 1); j++) {
          const q = i + j * 4; if (q + 2 >= d.length) break;
          d[q] += (col[0] - d[q]) * k; d[q + 1] += (col[1] - d[q + 1]) * k; d[q + 2] += (col[2] - d[q + 2]) * k;
        }
      }
    }
    c.putImageData(img, 0, 0);
  }
  // a wandering crack (sealed with tar when seal > 0): from (x, y) in px, heading a (radians), length len px
  function crack(c, r, x, y, a, len, wdt, alpha, branch = 0.3) {
    c.lineJoin = 'round'; c.lineCap = 'round';
    c.strokeStyle = `rgba(16,16,17,${alpha})`; c.lineWidth = wdt;
    c.beginPath(); c.moveTo(x, y);
    const n = Math.max(6, Math.round(len / 7));
    for (let k = 0; k < n; k++) {
      a += (r() - 0.5) * 0.7; x += Math.cos(a) * len / n; y += Math.sin(a) * len / n; c.lineTo(x, y);
      if (r() < branch / n * 3) { const sx = x, sy = y; c.stroke(); crack(c, r, sx, sy, a + (r() < 0.5 ? 1 : -1) * (0.6 + r() * 0.7), len * (0.15 + r() * 0.25), wdt * 0.6, alpha * 0.8, 0); c.strokeStyle = `rgba(16,16,17,${alpha})`; c.lineWidth = wdt; c.beginPath(); c.moveTo(x, y); }
    }
    c.stroke();
  }
  // alligator cracking: a little net of fine cracks over an ellipse (px)
  function alligator(c, r, cx, cy, rx, ry, alpha) {
    c.strokeStyle = `rgba(20,20,21,${alpha})`; c.lineWidth = 1.1; c.lineJoin = 'round';
    const pts = [];
    for (let i = 0; i < 26; i++) { const a = r() * TAU, d = Math.sqrt(r()); pts.push([cx + Math.cos(a) * rx * d, cy + Math.sin(a) * ry * d]); }
    for (const p of pts) {
      const near = pts.filter((q) => q !== p).sort((a, b) => Math.hypot(a[0] - p[0], a[1] - p[1]) - Math.hypot(b[0] - p[0], b[1] - p[1])).slice(0, 3);
      for (const q of near) { c.beginPath(); c.moveTo(p[0], p[1]); c.lineTo((p[0] + q[0]) / 2 + (r() - 0.5) * 3, (p[1] + q[1]) / 2 + (r() - 0.5) * 3); c.lineTo(q[0], q[1]); c.stroke(); }
    }
  }
  /* asphalt base: W x H px for wm x hm meters (u across canvas x, v along canvas y).
     o: base color, patches, cracks (+ crackX), seams [x m], alligator, blots */
  function asphalt(c, w, h, r, wm, hm, o = {}) {
    const px = w / wm, py = h / hm;
    c.fillStyle = o.base || '#545558'; c.fillRect(0, 0, w, h);
    // broad tone blotches and medium mottling
    for (let i = 0; i < 80; i++) { const s = (0.8 + r() * 3.2) * px, v = r() < 0.5 ? '30,30,32' : '140,140,136'; c.fillStyle = `rgba(${v},${0.02 + r() * 0.035})`; const ex = 0.4 + r() * 0.9, rot = r() * PI; wrapDraw(w, h, r() * w, r() * h, s * 1.5, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * ex, rot, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 700; i++) { const s = (0.06 + r() * 0.3) * px, v = r() < 0.55 ? '34,34,36' : '128,126,120'; c.fillStyle = `rgba(${v},${0.03 + r() * 0.06})`; wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (0.5 + r() * 0.5), r() * PI, 0, TAU); c.fill(); }); }
    // paving seams: a slightly darker, glossier sealed band along v
    for (const sx of o.seams || []) {
      const x = sx * px, bw = (0.12 + r() * 0.06) * px;
      const g = c.createLinearGradient(x - bw, 0, x + bw, 0); g.addColorStop(0, 'rgba(24,24,26,0)'); g.addColorStop(0.5, 'rgba(24,24,26,0.22)'); g.addColorStop(1, 'rgba(24,24,26,0)');
      c.fillStyle = g; c.fillRect(x - bw, 0, bw * 2, h);
      c.strokeStyle = 'rgba(14,14,15,0.45)'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x, 0);
      for (let y = 0; y <= h; y += 12) c.lineTo(x + Math.sin(y * 0.05 + sx) * 1.2 + (r() - 0.5) * 1.2, y);
      c.stroke();
    }
    // a few old patches with sealed seams (most utility patches come from the shader, so the tile does not repeat them)
    for (let i = 0; i < (o.patches || 0); i++) {
      const pw = (0.8 + r() * 1.6) * px, ph = (0.9 + r() * 1.8) * py, x = (o.patchX ? o.patchX(r) : r()) * w, y = r() * h, rot = (r() - 0.5) * 0.04;
      wrapDraw(w, h, x, y, Math.max(pw, ph), (X, Y) => {
        c.save(); c.translate(X, Y); c.rotate(rot);
        c.fillStyle = `rgba(32,32,34,${0.12 + r() * 0.08})`; c.fillRect(-pw / 2, -ph / 2, pw, ph);
        c.strokeStyle = 'rgba(14,14,16,0.55)'; c.lineWidth = 0.04 * px; c.strokeRect(-pw / 2, -ph / 2, pw, ph);
        c.restore();
      });
    }
    for (let i = 0; i < (o.alligator || 0); i++) alligator(c, r, (o.crackX ? o.crackX(r) : r()) * w, r() * h, (0.4 + r() * 0.5) * px, (0.6 + r() * 0.9) * py, 0.5);
    // cracks: long sealed ones (tar snakes) and thin open ones
    for (let i = 0; i < (o.cracks || 0); i++) {
      const sealed = r() < 0.55, along = r() < 0.6;
      crack(c, r, (o.crackX ? o.crackX(r) : r()) * w, r() * h, along ? (r() < 0.5 ? PI / 2 : -PI / 2) + (r() - 0.5) * 0.4 : (r() < 0.5 ? 0 : PI) + (r() - 0.5) * 0.5,
        (0.8 + r() * 3.5) * px, sealed ? (0.025 + r() * 0.02) * px : 1.1 + r() * 0.8, sealed ? 0.55 + r() * 0.25 : 0.6, sealed ? 0.1 : 0.5);
    }
  }
  // tire wear (lighter polished bands with streaks) and oil drip bands, along v at lane centers xs (meters)
  function laneWear(c, r, w, h, px, xs, track = 0.9) {
    for (const lc of xs) {
      // oil and drips down the middle of the lane
      let g = c.createLinearGradient((lc - 0.55) * px, 0, (lc + 0.55) * px, 0);
      g.addColorStop(0, 'rgba(18,18,20,0)'); g.addColorStop(0.5, 'rgba(18,18,20,0.14)'); g.addColorStop(1, 'rgba(18,18,20,0)');
      c.fillStyle = g; c.fillRect((lc - 0.55) * px, 0, 1.1 * px, h);
      for (let i = 0; i < 34; i++) { const s = (0.025 + r() * 0.07) * px; c.fillStyle = `rgba(14,14,16,${0.05 + r() * 0.12})`; wrapDraw(w, h, (lc + (r() - 0.5) * 0.6) * px, r() * h, s * 4, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (1.5 + r() * 2.5), 0, 0, TAU); c.fill(); }); }
      for (const off of [-track, track]) {
        const x = (lc + off) * px, bw = 0.32 * px;
        g = c.createLinearGradient(x - bw, 0, x + bw, 0);
        g.addColorStop(0, 'rgba(150,150,146,0)'); g.addColorStop(0.5, 'rgba(150,150,146,0.09)'); g.addColorStop(1, 'rgba(150,150,146,0)');
        c.fillStyle = g; c.fillRect(x - bw, 0, bw * 2, h);
        for (let i = 0; i < 40; i++) { c.fillStyle = r() < 0.6 ? `rgba(20,20,22,${0.04 + r() * 0.06})` : `rgba(170,170,166,${0.03 + r() * 0.05})`; c.fillRect(x + (r() - 0.5) * bw * 1.6, r() * h, 1 + r() * 1.5, (0.5 + r() * 3) * px); }
      }
    }
  }
  // worn traffic paint: a stripe x..x+w, y..y+h (px) with ragged edges, thinner spots and aggregate showing through
  function paintStripe(c, r, x, y, w, h, col, o = {}) {
    const fade = o.fade == null ? 0.88 : o.fade, along = h >= w;
    c.fillStyle = col;
    const n = Math.max(1, Math.round((along ? h : w) / 6));
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, j = () => (r() - 0.5) * 1.2;
      c.globalAlpha = fade * (0.82 + 0.18 * r());
      if (along) c.fillRect(x + j(), y + t0 * h, w + j(), (t1 - t0) * h + 0.5);
      else c.fillRect(x + t0 * w, y + j(), (t1 - t0) * w + 0.5, h + j());
    }
    c.globalAlpha = 1;
    // thin, scuffed stretches: asphalt colored film plus dark specks
    const spots = Math.max(1, Math.round((along ? h : w) / 90 * (o.wear || 1)));
    for (let i = 0; i < spots; i++) {
      const L = (0.25 + r() * 0.5) * (along ? h : w) * 0.2, p = r();
      const sx = along ? x : x + p * w, sy = along ? y + p * h : y, sw = along ? w : L, sh = along ? L : h;
      c.fillStyle = `rgba(70,70,72,${0.15 + r() * 0.3})`; c.fillRect(sx, sy, sw, sh);
      for (let k = 0; k < sw * sh / 6; k++) { c.fillStyle = `rgba(40,40,42,${0.3 + r() * 0.5})`; c.fillRect(sx + r() * sw, sy + r() * sh, 1 + r(), 1 + r()); }
    }
    for (let k = 0; k < w * h / 40; k++) { c.fillStyle = `rgba(46,46,48,${0.2 + r() * 0.5})`; c.fillRect(x + r() * w, y + r() * h, 1 + r() * 1.2, 1 + r() * 1.2); }
  }
  // concrete gutter pan along v from x0 to x1 meters (curb at x0 or x1, given by curbAt)
  function gutterPan(c, r, w, h, px, py, x0, x1, curbAt) {
    const X0 = x0 * px, X1 = x1 * px, W = X1 - X0;
    c.fillStyle = '#7e7d78'; c.fillRect(X0, 0, W, h);
    for (let i = 0; i < W * h / 30; i++) { c.fillStyle = r() < 0.5 ? `rgba(60,58,54,${0.2 + r() * 0.3})` : `rgba(170,168,160,${0.15 + r() * 0.25})`; c.fillRect(X0 + r() * W, r() * h, 1 + r(), 1 + r()); }
    // grime: darker toward the curb, a wet line along the flow, joints every 3 m, the lip against the asphalt
    const cx = curbAt * px, dir = curbAt === x0 ? 1 : -1;
    let g = c.createLinearGradient(cx, 0, cx + dir * W, 0);
    g.addColorStop(0, 'rgba(52,46,36,0.55)'); g.addColorStop(0.35, 'rgba(60,54,44,0.25)'); g.addColorStop(1, 'rgba(60,54,44,0.05)');
    c.fillStyle = g; c.fillRect(X0, 0, W, h);
    for (let i = 0; i < 26; i++) { const y = r() * h, len = (0.4 + r() * 2.4) * py; c.fillStyle = `rgba(38,34,28,${0.12 + r() * 0.2})`; c.fillRect(cx + dir * (0.06 + r() * 0.12) * px - 3, y, 6 + r() * 6, len); }
    for (let y = 0; y < h; y += 3 * py) { c.fillStyle = 'rgba(30,30,30,0.6)'; c.fillRect(X0, y - 1, W, 2.2); }
    c.fillStyle = 'rgba(26,26,26,0.55)'; c.fillRect(curbAt === x0 ? X1 - 1.5 : X0 - 0.5, 0, 2, h);
    // sand, grit, leaves and bits of litter
    for (let i = 0; i < 520; i++) {
      const t = Math.pow(r(), 1.8), x = cx + dir * t * W * 0.9, y = r() * h, k = r();
      c.fillStyle = k < 0.78 ? `rgba(${140 + r() * 40 | 0},${130 + r() * 30 | 0},${104 + r() * 26 | 0},${0.3 + r() * 0.35})` : k < 0.92 ? `rgba(${100 + r() * 40 | 0},${66 + r() * 24 | 0},${34 + r() * 16 | 0},${0.45 + r() * 0.35})` : `rgba(220,216,204,${0.35 + r() * 0.35})`;
      const s = k < 0.6 ? 1 + r() * 1.5 : 1.5 + r() * 3;
      c.fillRect(x, y, s, s * (0.6 + r()));
    }
  }
  TXS.road = () => canvasTex('st_road14', 1024, 1024, (c, w, h, r) => {
    const px = w / 14, py = h / 12, X = (m) => m * px;
    asphalt(c, w, h, r, 14, 12, { patches: 1, cracks: 10, alligator: 1, seams: [3.55, 7.0, 10.45], crackX: (rr) => [0.15, 0.32, 0.45, 0.6, 0.72, 0.86][(rr() * 6) | 0] + (rr() - 0.5) * 0.06 });
    laneWear(c, r, w, h, px, [5.25, 8.75], 0.88);
    // parking lanes: lighter (less traffic), drips are added per stall by the shader
    for (const [a, b] of [[0.4, 3.4], [10.6, 13.6]]) { c.fillStyle = 'rgba(120,120,116,0.05)'; c.fillRect(X(a), 0, X(b - a), h); }
    gutterPan(c, r, w, h, px, py, 0, 0.4, 0); gutterPan(c, r, w, h, px, py, 13.6, 14, 14);
    // paint: double yellow, solid white lane lines, T marks at the curb side every 6 m
    for (const x of [6.85, 7.05]) paintStripe(c, r, X(x), 0, X(0.1), h, '#d6ac34', { fade: 0.86 });
    for (const x of [3.4, 10.5]) paintStripe(c, r, X(x), 0, X(0.1), h, '#e6e4dc', { fade: 0.84 });
    for (const y of [0, 6]) for (const side of [0, 1]) {
      const yy = y * py, stem = (xa, xb) => paintStripe(c, r, X(xa), yy - X(0.05), X(xb - xa), X(0.1), '#e6e4dc', { fade: 0.78 });
      const bar = (x) => { for (const o of [0, h]) paintStripe(c, r, X(x), o + yy - 0.3 * py, X(0.1), 0.6 * py, '#e6e4dc', { fade: 0.78 }); };
      for (const o of [0, h]) { if (side) { c.save(); c.translate(0, o); stem(12.65, 13.55); c.restore(); } else { c.save(); c.translate(0, o); stem(0.45, 1.35); c.restore(); } }
      bar(side ? 13.5 : 0.4);
    }
    // a few cracks run through the paint too
    for (let i = 0; i < 4; i++) crack(c, r, X(2 + r() * 10), r() * h, (r() < 0.5 ? 0 : PI) + (r() - 0.5) * 0.4, (1 + r() * 2.5) * px, 1.2, 0.55, 0.4);
    grain(c, w, h, r, 14, 0.07);
  }, { srgb: true });
  TXS.country = () => canvasTex('st_country3', 1024, 1024, (c, w, h, r) => {
    const px = w / 7, py = h / 12;
    asphalt(c, w, h, r, 7, 12, { base: '#5c5d5f', patches: 2, cracks: 14, alligator: 1, seams: [3.5] });
    laneWear(c, r, w, h, px, [1.75, 5.25], 0.8);
    for (const x0 of [0, 1]) for (let i = 0; i < 90; i++) {
      const y = r() * h, d = (0.03 + r() * 0.15) * px;
      c.fillStyle = `rgba(40,38,30,${0.3 + r() * 0.4})`; c.beginPath(); c.ellipse(x0 ? w : 0, y, d, d * (1 + r() * 2), 0, 0, TAU); c.fill();
    }
    for (const x of [0.3, 6.7]) paintStripe(c, r, x * px - 0.06 * px, 0, 0.12 * px, h, '#e2e0d6', { fade: 0.8 });
    // dashed yellow center: 3 m dash, 9 m gap (one dash per 12 m tile)
    paintStripe(c, r, 3.5 * px - 0.055 * px, h - 3 * py, 0.11 * px, 3 * py, '#d8b030', { fade: 0.88 });
    grain(c, w, h, r, 14, 0.07);
  }, { srgb: true });
  TXS.junction = () => canvasTex('st_junction3', 1024, 1024, (c, w, h, r) => {
    asphalt(c, w, h, r, 10, 10, { patches: 1, cracks: 7, alligator: 1 });
    // turning traffic leaves faint curved wear and drips
    for (let i = 0; i < 6; i++) {
      const cx = r() * w, cy = r() * h, rad = (3 + r() * 6) * w / 10, a0 = r() * TAU;
      c.strokeStyle = `rgba(160,160,156,${0.04 + r() * 0.04})`; c.lineWidth = 0.35 * w / 10;
      c.beginPath(); c.arc(cx, cy, rad, a0, a0 + 0.8 + r()); c.stroke();
    }
    for (let i = 0; i < 40; i++) { const s = (0.025 + r() * 0.06) * w / 10; c.fillStyle = `rgba(14,14,16,${0.04 + r() * 0.1})`; wrapDraw(w, h, r() * w, r() * h, s * 2, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (1 + r()), r() * PI, 0, TAU); c.fill(); }); }
    grain(c, w, h, r, 14, 0.07);
  }, { srgb: true });
  // crosswalk: 11 continental bars (0.6 m, 0.6 m apart) curb to curb over the same asphalt and gutters as the road.
  // Worn paint is scuffed and thinned in the wheel paths (streaks along the travel direction, aggregate showing through).
  TXS.zebra = () => canvasTex('st_zebra14', 1024, 256, (c, w, h, r) => {
    const px = w / 14, py = h / 3;
    asphalt(c, w, h, r, 14, 3, { cracks: 3 });
    gutterPan(c, r, w, h, px, py, 0, 0.4, 0); gutterPan(c, r, w, h, px, py, 13.6, 14, 14);
    const paths = [7 - 2.6, 7 - 0.9, 7 + 0.9, 7 + 2.6, 7 - 5.3, 7 + 5.3];
    const wearAt = (xm) => paths.reduce((m, p, i) => Math.max(m, Math.exp(-Math.pow((xm - p) / 0.32, 2)) * (i < 4 ? 1 : 0.45)), 0);
    for (let i = 0; i < 11; i++) {
      const x0 = 0.7 + i * 1.2, X0 = x0 * px, BW = 0.6 * px, y0 = 0.12 * py, y1 = h - 0.12 * py;
      // the bar, a little ragged at the ends
      c.fillStyle = '#ecebe4';
      for (let x = 0; x < BW; x += 3) { const j0 = (r() - 0.5) * 2.2, j1 = (r() - 0.5) * 2.2; c.globalAlpha = 0.86 + r() * 0.12; c.fillRect(X0 + x, y0 + j0, 3.2, y1 - y0 - j0 + j1); }
      c.globalAlpha = 1;
      // scuffing: per column of pixels, the wear of the wheel path there
      for (let x = 0; x < BW; x += 1) {
        const wv = wearAt((X0 + x) / px);
        if (wv < 0.05) continue;
        // a film of dirt, thicker where tires roll, broken into streaks along the travel direction
        const streaks = 2 + Math.round(wv * 6);
        for (let k = 0; k < streaks; k++) {
          const sy = y0 + r() * (y1 - y0), sl = (0.1 + r() * 0.9) * (y1 - y0) * 0.6;
          c.fillStyle = `rgba(72,72,74,${(0.12 + r() * 0.3) * wv})`; c.fillRect(X0 + x, sy, 1, sl);
        }
        // aggregate tops showing through thin paint
        const specks = Math.round(wv * (y1 - y0) * 0.3);
        for (let k = 0; k < specks; k++) { c.fillStyle = `rgba(38,38,40,${0.35 + r() * 0.45})`; c.fillRect(X0 + x, y0 + r() * (y1 - y0), 1 + r() * 0.8, 1 + r() * 1.5); }
      }
      // light general wear everywhere on the bar
      for (let k = 0; k < BW * (y1 - y0) / 55; k++) { c.fillStyle = `rgba(52,52,54,${0.25 + r() * 0.4})`; c.fillRect(X0 + r() * BW, y0 + r() * (y1 - y0), 1 + r(), 1 + r()); }
    }
    grain(c, w, h, r, 12, 0.05);
  }, { srgb: true, clamp: true });
  // sidewalk slab: broom finished concrete with gum spots and stains (per slab tone, joints, cracks and patches come from the shader)
  TXS.sidewalk = () => canvasTex('st_sidewalk2', 512, 512, (c, w, h, r) => {
    c.fillStyle = gray(0.86); c.fillRect(0, 0, w, h);
    for (let i = 0; i < 90; i++) { const s = 10 + r() * 60; c.fillStyle = gray(0.78 + r() * 0.2, 0.16); wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.arc(X, Y, s, 0, TAU); c.fill(); }); }
    // broom lines across the slab
    for (let y = 0; y < h; y += 2 + r() * 3) { c.fillStyle = gray(r() < 0.5 ? 0.7 : 1, 0.05 + r() * 0.05); c.fillRect(0, y, w, 1); }
    // stains: drips, a coffee splash, rust
    for (let i = 0; i < 7; i++) { const s = 8 + r() * 26; c.fillStyle = r() < 0.7 ? gray(0.5, 0.1) : 'rgba(120,80,40,0.1)'; wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (0.5 + r() * 0.5), r() * 3, 0, TAU); c.fill(); }); }
    // chewing gum: dark fresh ones and flattened pale gray ones
    for (let i = 0; i < 34; i++) {
      const x = r() * w, y = r() * h, s = 2 + r() * 3.5, old = r() < 0.55;
      c.fillStyle = old ? gray(0.62 + r() * 0.1, 0.8) : gray(0.2 + r() * 0.15, 0.85);
      c.beginPath(); c.ellipse(x, y, s, s * (0.75 + r() * 0.3), r() * 3, 0, TAU); c.fill();
      if (old) { c.strokeStyle = gray(0.45, 0.5); c.lineWidth = 0.8; c.stroke(); }
    }
    grain(c, w, h, r, 22, 0.08, [255, 255, 255], [120, 120, 120]);
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
  // alley (4 m wall to wall, 6 m along): old concrete slabs, a dished drain channel down the middle, asphalt patches,
  // grease and water stains, grime and weeds along the walls and in the joints
  TXS.alley = () => canvasTex('st_alley', 1024, 1024, (c, w, h, r) => {
    const px = w / 4, py = h / 6;
    c.fillStyle = '#8b8984'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < 160; i++) { const s = (0.2 + r() * 0.9) * px, v = r() < 0.6 ? '60,58,54' : '170,168,160'; c.fillStyle = `rgba(${v},${0.04 + r() * 0.06})`; wrapDraw(w, h, r() * w, r() * h, s, (X, Y) => { c.beginPath(); c.ellipse(X, Y, s, s * (0.4 + r() * 0.6), r() * PI, 0, TAU); c.fill(); }); }
    // the drain channel: darker, damp, with a wet line and silt
    let g = c.createLinearGradient(1.6 * px, 0, 2.4 * px, 0);
    g.addColorStop(0, 'rgba(40,40,38,0)'); g.addColorStop(0.5, 'rgba(36,36,34,0.38)'); g.addColorStop(1, 'rgba(40,40,38,0)');
    c.fillStyle = g; c.fillRect(1.6 * px, 0, 0.8 * px, h);
    for (let i = 0; i < 200; i++) { c.fillStyle = `rgba(${90 + r() * 30 | 0},${80 + r() * 20 | 0},${60 + r() * 20 | 0},${0.2 + r() * 0.3})`; c.fillRect((2 + (r() - 0.5) * 0.25) * px, r() * h, 2 + r() * 4, 2 + r() * 10); }
    c.strokeStyle = 'rgba(24,24,24,0.5)'; c.lineWidth = 3; c.beginPath(); c.moveTo(2 * px, 0); for (let y = 0; y <= h; y += 16) c.lineTo(2 * px + (r() - 0.5) * 3, y); c.stroke();
    // grease and water stains where bins and doors stand: irregular, built from many faint dabs, with a trail toward the drain
    for (let i = 0; i < 7; i++) {
      const side = r() < 0.5 ? 0 : 1, y = r() * h, x0 = side ? w - (0.15 + r() * 0.45) * px : (0.15 + r() * 0.45) * px, s0 = (0.25 + r() * 0.35) * px;
      for (let k = 0; k < 26; k++) {
        const a = r() * TAU, d = Math.sqrt(r()) * s0, ds = s0 * (0.12 + r() * 0.25);
        c.fillStyle = `rgba(30,28,24,${0.03 + r() * 0.05})`;
        wrapDraw(w, h, x0 + Math.cos(a) * d, y + Math.sin(a) * d * 1.3, ds * 2, (X, Y) => { c.beginPath(); c.ellipse(X, Y, ds, ds * (0.5 + r()), r() * PI, 0, TAU); c.fill(); });
      }
      const g2 = c.createLinearGradient(x0, 0, 2 * px, 0); g2.addColorStop(0, 'rgba(36,34,30,0.07)'); g2.addColorStop(1, 'rgba(36,34,30,0)');
      c.fillStyle = g2; c.fillRect(Math.min(x0, 2 * px), y - s0 * 0.15, Math.abs(2 * px - x0), s0 * 0.3);
    }
    // slab joints: across every 3 m, and the two sides of the channel
    for (const y of [0, 3]) { c.fillStyle = 'rgba(28,28,28,0.65)'; c.fillRect(0, y * py - 1.5, w, 3); }
    for (const x of [1.75, 2.25]) { c.fillStyle = 'rgba(28,28,28,0.45)'; c.fillRect(x * px - 1, 0, 2, h); }
    // saw cut asphalt patches (utility repairs) between joints
    for (const [x0, x1, y0, y1] of [[0.25, 1.35, 0.6, 2.1]]) {
      const X0 = x0 * px, X1 = x1 * px, Y0 = y0 * py, Y1 = y1 * py;
      c.fillStyle = 'rgba(84,84,86,0.9)'; c.fillRect(X0, Y0, X1 - X0, Y1 - Y0);
      for (let k = 0; k < (X1 - X0) * (Y1 - Y0) / 10; k++) { c.fillStyle = r() < 0.5 ? 'rgba(30,30,32,0.45)' : 'rgba(130,128,122,0.35)'; c.fillRect(X0 + r() * (X1 - X0), Y0 + r() * (Y1 - Y0), 1.5, 1.5); }
      c.strokeStyle = 'rgba(16,16,18,0.7)'; c.lineWidth = 3; c.strokeRect(X0, Y0, X1 - X0, Y1 - Y0);
    }
    // cracks
    for (let i = 0; i < 12; i++) crack(c, r, r() * w, r() * h, r() * TAU, (0.3 + r() * 1.6) * px, 1.2 + r(), 0.6, 0.5);
    // grime along the walls, weeds in the joints and at the walls
    for (const [x0, x1] of [[0, 0.35], [3.65, 4]]) {
      g = c.createLinearGradient(x0 * px, 0, x1 * px, 0);
      g.addColorStop(x0 ? 0 : 1, 'rgba(50,46,38,0)'); g.addColorStop(x0 ? 1 : 0, 'rgba(50,46,38,0.45)');
      c.fillStyle = g; c.fillRect(x0 * px, 0, (x1 - x0) * px, h);
    }
    const weed = (x, y, s) => { for (let k = 0; k < 7; k++) { c.fillStyle = `rgba(${50 + r() * 40 | 0},${90 + r() * 50 | 0},${30 + r() * 20 | 0},${0.7 + r() * 0.3})`; c.beginPath(); c.ellipse(x + (r() - 0.5) * s, y + (r() - 0.5) * s, s * 0.35, s * 0.12, r() * PI, 0, TAU); c.fill(); } };
    for (let i = 0; i < 40; i++) weed(r() < 0.5 ? (0.03 + r() * 0.12) * px : w - (0.03 + r() * 0.12) * px, r() * h, 6 + r() * 12);
    for (let i = 0; i < 14; i++) weed(r() * w, (r() < 0.5 ? 0 : 3) * py + (r() - 0.5) * 4, 4 + r() * 7);
    grain(c, w, h, r, 16, 0.06, [190, 188, 180], [40, 40, 40]);
  }, { srgb: true });
  // parking lot module: 4 stalls (2.6 m) by a double row (5.4 m + 7.2 m aisle + 5.4 m), stall lines and turning wear
  TXS.parking = () => canvasTex('st_parking', 1024, 1024, (c, w, h, r) => {
    const px = w / 10.4, py = h / 18;
    asphalt(c, w, h, r, 10.4, 18, { base: '#57585a', patches: 1, cracks: 9, alligator: 1 });
    // turning marks in the aisle
    for (let i = 0; i < 7; i++) {
      const cx = r() * w, cy = (5.4 + r() * 7.2) * py, rad = (2 + r() * 4) * px, a0 = r() * TAU;
      c.strokeStyle = `rgba(20,20,22,${0.05 + r() * 0.06})`; c.lineWidth = 0.18 * px;
      c.beginPath(); c.ellipse(cx, cy, rad, rad * py / px * 0.6, 0, a0, a0 + 0.6 + r() * 0.8); c.stroke();
    }
    // tire wear where cars pull in and out of each stall
    for (let i = 0; i < 4; i++) for (const row of [0, 1]) for (const off of [-0.8, 0.8]) {
      const x = ((i + 0.5) * 2.6 + off) * px, y0 = row ? 12.6 * py : 0, y1 = row ? h : 5.4 * py;
      const g = c.createLinearGradient(x - 0.25 * px, 0, x + 0.25 * px, 0);
      g.addColorStop(0, 'rgba(150,150,146,0)'); g.addColorStop(0.5, 'rgba(150,150,146,0.05)'); g.addColorStop(1, 'rgba(150,150,146,0)');
      c.fillStyle = g; c.fillRect(x - 0.25 * px, y0, 0.5 * px, y1 - y0);
    }
    // stall lines (0.1 m): separators down each row, head lines on the module edges (shared with the next module)
    const col = '#e8e6da';
    for (let i = 0; i <= 4; i++) {
      const x = i * 2.6 * px, lw = 0.12 * px;
      for (const [y0, y1] of [[0, 5.4], [12.6, 18]]) {
        if (i === 0 || i === 4) paintStripe(c, r, i ? w - lw / 2 : 0, y0 * py, lw / 2, (y1 - y0) * py, col, { fade: 0.92 });
        else paintStripe(c, r, x - lw / 2, y0 * py, lw, (y1 - y0) * py, col, { fade: 0.92 });
      }
    }
    paintStripe(c, r, 0, 0, w, 0.06 * py, col, { fade: 0.92 }); paintStripe(c, r, 0, h - 0.06 * py, w, 0.06 * py, col, { fade: 0.92 });
    grain(c, w, h, r, 14, 0.07);
  }, { srgb: true });
  // plaza pavers: 6 x 6 flamed granite squares of 0.6 m in a 3.6 m tile (near neutral: the shader picks each paver's stone)
  TXS.plaza = () => canvasTex('st_plaza', 1024, 1024, (c, w, h, r) => {
    const n = 6, s = w / n;
    c.fillStyle = '#5a5854'; c.fillRect(0, 0, w, h);
    for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
      const x = i * s + 1.5, y = j * s + 1.5, ps = s - 3, v = 0.86 + r() * 0.1;
      c.fillStyle = gray(v); c.fillRect(x, y, ps, ps);
      // flamed surface: soft mottling and mineral grains
      for (let k = 0; k < 26; k++) { const rr = 6 + r() * 26; c.fillStyle = gray(v + (r() - 0.5) * 0.12, 0.25); c.beginPath(); c.arc(x + r() * ps, y + r() * ps, rr, 0, TAU); c.fill(); }
      // tooled edge: a little lighter rim, a shadow line on two sides
      c.fillStyle = 'rgba(255,255,255,0.12)'; c.fillRect(x, y, ps, 3); c.fillRect(x, y, 3, ps);
      c.fillStyle = 'rgba(0,0,0,0.12)'; c.fillRect(x, y + ps - 3, ps, 3); c.fillRect(x + ps - 3, y, 3, ps);
    }
    // grout lines a little dirty, a few stains and gum spots
    for (let i = 0; i < 10; i++) { const rr = 10 + r() * 40; c.fillStyle = r() < 0.7 ? 'rgba(40,36,30,0.08)' : 'rgba(110,80,40,0.08)'; wrapDraw(w, h, r() * w, r() * h, rr, (X, Y) => { c.beginPath(); c.ellipse(X, Y, rr, rr * 0.7, r() * 3, 0, TAU); c.fill(); }); }
    for (let i = 0; i < 22; i++) { const g2 = r() < 0.5; c.fillStyle = g2 ? 'rgba(160,160,158,0.8)' : 'rgba(50,50,52,0.85)'; c.beginPath(); c.ellipse(r() * w, r() * h, 2.5 + r() * 3, 2 + r() * 2.5, r() * 3, 0, TAU); c.fill(); }
    grain(c, w, h, r, 26, 0.16, [250, 250, 248], [40, 40, 44]);
  });

  /* shader extras for the surfaces: world space tone variation (breaks up repeats) and fine grain for close views, and per kind:
     road: utility patches, oil drips per parking stall, manholes in the travel lanes and storm drain grates in the gutters,
     varied per 12 m tile; junction: patches and manholes per 10 m cell; sidewalk: per slab offsets, tones, tooled edges,
     joints, cracked, patched and newer slabs; curb: a joint every 3 m and grime at the gutter; alley: grease stains;
     parking: oil drips per stall; plaza: a stone per paver */
  const GLSL_SURF = `
float stBox(vec2 p, vec2 c, vec2 h, float e) { vec2 d = abs(p - c) - h; return 1.0 - smoothstep(-e, e, max(d.x, d.y)); }
vec3 stPatch(vec3 col, vec2 p, vec2 c, vec2 h, float seed) {
  vec2 d = abs(p - c) - h; float sd = max(d.x, d.y);
  float inside = 1.0 - smoothstep(-0.015, 0.015, sd);
  float seam = 1.0 - smoothstep(0.012, 0.05, abs(sd));
  float g = stN(p * 7.0 + seed) * 0.6 + stN(p * 21.0 - seed) * 0.4;
  col = mix(col, col * (0.72 + 0.12 * g), inside);
  return col * (1.0 - seam * 0.5);
}
float stStain(vec2 p, vec2 c, float r, float seed) {
  vec2 q = (p - c) / r;
  float d = length(q * vec2(1.0, 0.8)) + (stN(q * 2.3 + seed) - 0.5) * 0.7;
  return (1.0 - smoothstep(0.25, 1.0, d)) * (0.55 + 0.45 * stN(q * 5.0 - seed));
}
vec3 stManhole(vec3 col, vec2 m, vec2 ctr) {
  vec2 d = m - ctr; float r = length(d);
  if (r > 0.45) return col;
  float disc = 1.0 - smoothstep(0.31, 0.325, r);
  float rimL = smoothstep(0.29, 0.30, r) * (1.0 - smoothstep(0.31, 0.325, r));
  vec2 gq = abs(fract(d * 9.0) - 0.5);
  float grid = step(0.36, max(gq.x, gq.y)) * step(r, 0.25);
  float ringL = smoothstep(0.255, 0.26, r) * (1.0 - smoothstep(0.27, 0.275, r));
  vec3 iron = vec3(0.12, 0.115, 0.11) * (0.75 + 0.5 * stN(m * 30.0));
  iron = mix(iron, vec3(0.25, 0.24, 0.22), max(grid, max(rimL, ringL)) * 0.8);
  col = mix(col, iron, disc);
  float halo = smoothstep(0.45, 0.33, r) * (1.0 - disc);
  return col * (1.0 - halo * 0.3);
}
vec3 stGrate(vec3 col, vec2 m, vec2 ctr, vec2 hs, float across) {
  vec2 q = m - ctr;
  float outer = stBox(m, ctr, hs, 0.008), inner = stBox(m, ctr, hs - 0.05, 0.006);
  float halo = stBox(m, ctr, hs + 0.35, 0.3) * (1.0 - outer);
  col *= 1.0 - halo * 0.35;
  float slots = smoothstep(0.35, 0.45, abs(fract((across > 0.5 ? q.y : q.x) / 0.07) - 0.5) * 2.0);
  vec3 iron = vec3(0.13, 0.12, 0.11) * (0.75 + 0.5 * stN(m * 26.0));
  vec3 g = mix(iron, vec3(0.012), slots * inner);
  return mix(col, g, outer);
}`;
  const SURF = {
    road: `
    {
      vec2 m = vec2(vStUv.x * 14.0, fract(vStUv.y) * 12.0);
      float tile = floor(vStUv.y);
      // a utility patch inside one lane (so the paint lines stay)
      if (stH(vec2(tile, 3.7)) > 0.6) {
        float lane = floor(stH(vec2(tile, 8.1)) * 4.0);
        float x0 = lane < 0.5 ? 0.55 : lane < 1.5 ? 3.7 : lane < 2.5 ? 7.3 : 10.75;
        float x1 = lane < 0.5 ? 3.25 : lane < 1.5 ? 6.7 : lane < 2.5 ? 10.3 : 13.45;
        float wdt = mix(0.8, x1 - x0, stH(vec2(tile, 1.3)));
        float cx = mix(x0 + wdt * 0.5, x1 - wdt * 0.5, stH(vec2(tile, 2.9)));
        float len = mix(1.2, 4.5, stH(vec2(tile, 4.4)));
        float cy = mix(len * 0.5 + 0.3, 12.0 - len * 0.5 - 0.3, stH(vec2(tile, 5.5)));
        diffuseColor.rgb = stPatch(diffuseColor.rgb, m, vec2(cx, cy), vec2(wdt * 0.5, len * 0.5), tile);
      }
      // oil drips under parked cars (the engine end of each stall)
      if (m.x < 3.4 || m.x > 10.6) {
        float side = step(7.0, m.x), si = floor(m.y / 6.0);
        vec2 sid = vec2(tile * 2.0 + si, side);
        float hs = stH(sid + 0.37);
        if (hs > 0.25) {
          vec2 c = vec2(mix(1.2, 12.8, side) + (stH(sid + 1.1) - 0.5) * 0.5, si * 6.0 + mix(1.5, 4.5, side) + (stH(sid + 2.3) - 0.5) * 0.8);
          diffuseColor.rgb *= 1.0 - stStain(m, c, 0.35 + 0.35 * stH(sid + 3.9), hs * 9.0) * 0.45 * hs;
        }
      }
      // manhole covers in the travel lanes of some tiles
      if (stH(vec2(tile, 0.71)) > 0.55) {
        float sx = stH(vec2(tile, 3.1)) > 0.5 ? 1.0 : -1.0;
        diffuseColor.rgb = stManhole(diffuseColor.rgb, m, vec2(7.0 + sx * (1.1 + stH(vec2(tile, 6.6)) * 1.3), 2.0 + stH(vec2(tile, 9.2)) * 8.0));
      }
      // storm drain grates at the curb
      {
        float side = step(7.0, m.x);
        if (stH(vec2(tile, 11.0 + side)) > 0.55) {
          float gy = 1.5 + stH(vec2(tile, 12.0 + side)) * 9.0;
          diffuseColor.rgb = stGrate(diffuseColor.rgb, m, vec2(mix(0.36, 13.64, side), gy), vec2(0.3, 0.5), 1.0);
        }
      }
    }`,
    junction: `
    {
      vec2 cell = floor(vStUv), m = fract(vStUv) * 10.0;
      if (stH(cell + 0.71) > 0.7) diffuseColor.rgb = stManhole(diffuseColor.rgb, m, vec2(3.0 + stH(cell + 2.0) * 4.0, 3.0 + stH(cell + 5.0) * 4.0));
      if (stH(cell + 7.7) > 0.72) {
        vec2 hs = vec2(0.5 + stH(cell + 1.7) * 1.4, 0.5 + stH(cell + 2.7) * 1.4);
        diffuseColor.rgb = stPatch(diffuseColor.rgb, m, vec2(hs.x + 0.3 + stH(cell + 3.3) * (9.4 - 2.0 * hs.x), hs.y + 0.3 + stH(cell + 4.3) * (9.4 - 2.0 * hs.y)), hs, cell.x + cell.y);
      }
    }`,
    sidewalk: `
    {
      vec2 slab = floor(vStUv), f = fract(vStUv);
      float h1 = stH(slab + 5.0), h2 = stH(slab + 9.1), h3 = stH(slab + 13.7), h4 = stH(slab + 21.3);
      // newer replaced slabs: lighter and cleaner
      if (h3 < 0.08) diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.333))) * 1.12, 0.6);
      diffuseColor.rgb *= 0.9 + 0.14 * h1;
      // tooled border band and the joint groove
      float e = min(min(f.x, 1.0 - f.x), min(f.y, 1.0 - f.y));
      diffuseColor.rgb *= mix(1.04, 1.0, smoothstep(0.02, 0.035, e));
      diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.003, 0.011, e));
      // cracks: a wandering line corner to edge, the far side a touch darker (it settled)
      if (h2 < 0.2) {
        vec2 a = vec2(stH(slab + 1.3), 0.0), b = vec2(1.0, stH(slab + 2.9));
        if (h2 < 0.1) { a = vec2(0.0, stH(slab + 3.3)); b = vec2(stH(slab + 4.7), 1.0); }
        vec2 ab = b - a, n = normalize(vec2(-ab.y, ab.x));
        float d = dot(f - a, n) + (stN(f * 9.0 + slab) - 0.5) * 0.06 + (stN(f * 31.0 - slab) - 0.5) * 0.015;
        diffuseColor.rgb *= mix(0.42, 1.0, smoothstep(0.0025, 0.006, abs(d)));
        diffuseColor.rgb *= d > 0.0 ? 0.95 : 1.0;
      }
      // an asphalt patch where a corner broke off
      if (h4 < 0.06) {
        vec2 q = vec2(h4 < 0.03 ? f.x : 1.0 - f.x, f.y);
        float cut = q.x + q.y + (stN(f * 6.0 + slab) - 0.5) * 0.12;
        float p = 1.0 - smoothstep(0.34, 0.36, cut + (stN(f * 15.0 - slab) - 0.5) * 0.08);
        vec3 asph = vec3(0.13, 0.13, 0.135) * (0.7 + 0.6 * stN(f * 60.0 + slab));
        diffuseColor.rgb = mix(diffuseColor.rgb, asph, p);
      }
    }`,
    curb: `
    {
      float jf = fract(vStUv.x / 3.0); diffuseColor.rgb *= mix(0.5, 1.0, smoothstep(0.004, 0.012, min(jf, 1.0 - jf) * 3.0));
      float grime = (1.0 - smoothstep(0.0, 0.07, vStUv.y)) * (0.6 + 0.4 * stN(vec2(vStUv.x * 1.3, 0.5)));
      diffuseColor.rgb *= 1.0 - grime * 0.4;
      diffuseColor.rgb *= 0.92 + 0.1 * stN(vec2(vStUv.x * 4.0, vStUv.y * 9.0));
    }`,
    alley: `
    {
      vec2 tile = floor(vStUv), m = fract(vStUv) * vec2(4.0, 6.0);
      float hs = stH(tile + 0.5);
      if (hs > 0.45) {
        float side = stH(tile + 1.5) > 0.5 ? 3.3 : 0.7;
        diffuseColor.rgb *= 1.0 - stStain(m, vec2(side, 1.0 + stH(tile + 2.5) * 4.0), 0.5 + 0.5 * stH(tile + 3.5), tile.x + tile.y * 3.0) * 0.5;
      }
    }`,
    parking: `
    {
      vec2 m = fract(vStUv) * vec2(10.4, 18.0), mod0 = floor(vStUv);
      float row = step(9.0, m.y), si = floor(m.x / 2.6);
      vec2 sid = mod0 * 13.0 + vec2(si, row);
      float hs = stH(sid + 0.37);
      if (hs > 0.2) {
        vec2 c = vec2((si + 0.5) * 2.6 + (stH(sid + 1.1) - 0.5) * 0.5, mix(1.3, 16.7, row) + (stH(sid + 2.3) - 0.5) * 0.7);
        diffuseColor.rgb *= 1.0 - stStain(m, c, 0.35 + 0.4 * stH(sid + 3.9), hs * 9.0) * 0.5 * hs;
      }
    }`,
    plaza: `
    {
      vec2 pv = floor(vStUv * 6.0);
      float h = stH(pv + 0.5), h2 = stH(pv + 7.5);
      vec3 stone = h < 0.55 ? vec3(0.62, 0.61, 0.58) : h < 0.85 ? vec3(0.64, 0.59, 0.51) : vec3(0.5, 0.5, 0.5);
      diffuseColor.rgb *= stone * (0.94 + 0.1 * h2);
    }`,
  };
  const SURF_TONE = { road: 0.22, junction: 0.22, zebra: 0.22, country: 0.22, sidewalk: 0.22, curb: 0.18, paving: 0.22, alley: 0.24, parking: 0.22, plaza: 0.12 };
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
      // sampling with explicit gradients so tile jumps (offsets, mirrors) leave no seam line from the mip choice
      const grad = (uvx) => `
  #if __VERSION__ >= 300
    vec4 sampledDiffuseColor = textureGrad(map, ${uvx}, dFdx(vStUv), dFdy(vStUv));
  #else
    vec4 sampledDiffuseColor = texture2D(map, ${uvx});
  #endif
  diffuseColor *= sampledDiffuseColor;`;
      let mapCode = '#include <map_fragment>';
      // sidewalk: each slab samples its own random spot of the texture
      if (kind === 'sidewalk') mapCode = `
  vec2 slabO = floor(vStUv);
  vec2 offO = vec2(stH(slabO), stH(slabO + 17.0));` + grad('vStUv + offO');
      // road, alley, lot and plaza tiles are mirrored at random (their markings are symmetric) so the repeat does not show
      if (kind === 'road' || kind === 'alley' || kind === 'parking' || kind === 'plaza') mapCode = `
  vec2 tT = floor(vStUv), sUv = vStUv;
  if (stH(tT + 0.123) > 0.5) sUv.x = 2.0 * tT.x + 1.0 - sUv.x;
  if (stH(tT + 0.456) > 0.5) sUv.y = 2.0 * tT.y + 1.0 - sUv.y;` + grad('sUv');
      const tone = SURF_TONE[kind] || 0.2;
      sh.fragmentShader = sh.fragmentShader.replace('void main() {', `varying vec3 vStW;\nvarying vec2 vStUv;\n${GLSL_NOISE}\n${GLSL_SURF}\nvoid main() {`)
        .replace('#include <map_fragment>', mapCode + `
  {
    float big = stN(vStW.xz * 0.045) * 0.6 + stN(vStW.xz * 0.21 + 3.0) * 0.4;
    diffuseColor.rgb *= ${(1 - tone / 2).toFixed(3)} + ${tone.toFixed(3)} * big;
    diffuseColor.rgb *= 0.97 + 0.06 * stN(vStW.xz * 37.0);
  }
  ${SURF[kind] || ''}`);
    };
    m.customProgramCacheKey = () => 'st-surf2-' + kind;
    return m;
  }

  /* puddle decal: a wet, darker patch with a sky reflection and a sun glint; the outline comes from world space noise so no two
     puddles match. Premultiplied blending: the ground under it is darkened by alpha, the reflection is added. */
  let puddleM = null;
  function puddleMat() {
    if (puddleM) return puddleM;
    const u = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, THREE.UniformsLib.lights]);
    u.uTime = windU.time; u.uNight = nightU;
    puddleM = new THREE.ShaderMaterial({
      uniforms: u, fog: true, lights: true, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor, blendEquation: THREE.AddEquation,
      polygonOffset: true, polygonOffsetFactor: -6, polygonOffsetUnits: -12,
      vertexShader: `
varying vec3 vW; varying vec2 vUv2;
#include <common>
#include <fog_pars_vertex>
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  #ifdef USE_INSTANCING
    w = modelMatrix * instanceMatrix * vec4(position, 1.0);
  #endif
  vW = w.xyz; vUv2 = uv;
  vec4 mvPosition = viewMatrix * w;
  gl_Position = projectionMatrix * mvPosition;
  #include <fog_vertex>
}`,
      fragmentShader: `
uniform float uTime, uNight;
varying vec3 vW; varying vec2 vUv2;
#include <common>
#include <fog_pars_fragment>
#include <bsdfs>
#include <lights_pars_begin>
${GLSL_NOISE}
void main() {
  vec2 p = vW.xz;
  float r = length((vUv2 - 0.5) * 2.0);
  float n = stN(p * 0.9) * 0.6 + stN(p * 2.4 + 5.0) * 0.3 + stN(p * 7.0 - 3.0) * 0.1;
  float edge = 0.58 + (n - 0.5) * 0.75;
  float water = 1.0 - smoothstep(edge - 0.06, edge, r);
  float damp = (1.0 - smoothstep(edge, edge + 0.2, r)) * (1.0 - water) * (0.6 + 0.4 * stN(p * 5.0));
  if (water + damp < 0.003) discard;
  vec3 V = normalize(cameraPosition - vW);
  vec2 g = vec2(stN(p * 6.0 + uTime * 0.25) - stN(p * 6.0 - uTime * 0.2 + 9.0), stN(p * 5.0 - uTime * 0.22 + 4.0) - stN(p * 7.0 + uTime * 0.18 + 2.0));
  vec3 N = normalize(vec3(g.x * 0.04, 1.0, g.y * 0.04));
  float fres = 0.03 + 0.62 * pow(1.0 - clamp(dot(N, V), 0.0, 1.0), 4.0);
  vec3 sky = vec3(0.5, 0.62, 0.8), gnd = vec3(0.1);
  #if NUM_HEMI_LIGHTS > 0
    sky = hemisphereLights[0].skyColor; gnd = hemisphereLights[0].groundColor;
  #endif
  vec3 R = reflect(-V, N);
  float up = smoothstep(0.05, 0.6, R.y + (stN(p * 0.35 + 2.0) - 0.5) * 0.25);
  vec3 refl = mix(mix(gnd * 0.4, sky, 0.5), sky, up) * fres;
  #if NUM_DIR_LIGHTS > 0
    vec3 ld = normalize((vec4(directionalLights[0].direction, 0.0) * viewMatrix).xyz);
    vec3 vV = normalize((viewMatrix * vec4(V, 0.0)).xyz), vN = normalize((viewMatrix * vec4(N, 0.0)).xyz);
    refl += directionalLights[0].color * pow(max(dot(vN, normalize(ld + vV)), 0.0), 400.0) * 3.0;
  #endif
  refl += vec3(1.0, 0.75, 0.45) * uNight * fres * 0.12 * (0.5 + 0.5 * stN(p * 0.7));
  float rim = water * (1.0 - smoothstep(edge - 0.16, edge - 0.03, r));
  float a = water * (0.5 + 0.18 * (1.0 - rim)) + damp * 0.3;
  vec3 col = refl * water;
  #ifdef USE_FOG
    float ff = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    col *= ff; a *= ff;
  #endif
  gl_FragColor = vec4(col, a);
}`,
    });
    puddleM.userData.aaOffset = 1;
    return puddleM;
  }
  let surfCache = null;
  function streetMaterials() {
    if (surfCache) return surfCache;
    surfCache = {
      road: surfMat('road', { map: TXS.road() }),
      country: surfMat('country', { map: TXS.country() }),
      junction: surfMat('junction', { map: TXS.junction() }),
      zebra: surfMat('zebra', { map: TXS.zebra(), polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
      sidewalk: surfMat('sidewalk', { map: TXS.sidewalk(), color: K.lcol(0xc6c2ba) }),
      curb: surfMat('curb', { map: TXS.curb(), color: K.lcol(0xcfcac0) }),
      paving: surfMat('paving', { map: TXS.paving() }),
      alley: surfMat('alley', { map: TXS.alley() }),
      parking: surfMat('parking', { map: TXS.parking() }),
      plaza: surfMat('plaza', { map: TXS.plaza(), color: K.lcol(0xf2f0ea) }),
      puddle: puddleMat(),
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
    if (kind === 'wagon') {
      // station wagon: sedan nose, the roof carried to a near upright tailgate, three side windows, roof rails
      const hw = 0.91, hb = 0.86, zN = 2.4, zT = -2.4;
      const hood = k(2.12, 'hood', 0.81, 0.78, 0.21, hw, hb, 0.6);
      const deck = k(-2.26, 'hood', 1.0, 0.97, 0.24, hw - 0.01, hb, 0.6);
      return {
        L: 4.8, W: 1.82, H: 1.47, wr: 0.325, tireW: 0.215, track: 1.56, axles: [1.42, -1.33],
        keys: [
          ...endKeys(deck, -2.26, zT, { top: 0.97, belt: 0.94, yb: 0.38, hw: 0.8, hb: 0.76 }).reverse(), deck,
          k(-2.12, 'roof', 1.42, 0.98, 0.21, hw, hb, 0.6), k(-1.0, 'roof', 1.47, 0.975, 0.19, hw, hb, 0.62),
          k(0.35, 'roof', 1.46, 0.96, 0.18, hw, hb, 0.63), k(1.2, 'hood', 0.98, 0.93, 0.19, hw, hb, 0.6), k(1.7, 'hood', 0.9, 0.86, 0.2, hw, hb, 0.6), hood,
          ...endKeys(hood, 2.12, zN, { top: 0.66, belt: 0.64, yb: 0.3, hw: 0.73, hb: 0.68 }),
        ],
        windows: [[-2.02, -1.25], [-1.13, -0.17], [-0.07, 1.12]], pillars: [[-0.17, -0.07], [-1.25, -1.13]],
        details: {
          seams: [0.98, -0.12, -1.05], handles: [0.36, -0.5], mirrorZ: 1.02, beltMold: [-2.02, 1.12], hoodSeam: 1.17, trunkSeam: null,
          head: { len: 0.25, s0: 3.8, s1: 6.6, face: [0.6, 0.53, 0.63] }, grille: [0.36, 0.45, 0.58, 'grille2'], intake: [0.5, 0.33, 0.41], plateF: 0.4,
          tail: { len: 0.16, s0: 3.9, s1: 6.1, face: [0.62, 0.7, 0.94] }, plateR: 0.55, bumperR: 0.45, bumperF: 0.36,
          cabin: [-2.1, 1.18], floorY: 0.31, innerHW: 0.78, belt: 0.96, roofY: 1.44, driverX: 0.36, seats: [{ z: 0.0 }, { z: -0.9, bench: true, heads: true }], seatCol: 0x5a4a3a,
          roofRails: [-1.9, 0.2],
        },
      };
    }
    if (kind === 'coupe') {
      // two door coupe: low, long doors, a fastback roof sweeping down to a short deck
      const hw = 0.91, hb = 0.86, zN = 2.275, zT = -2.275;
      const hood = k(2.02, 'hood', 0.76, 0.73, 0.22, hw, hb, 0.6);
      const deck = k(-2.0, 'hood', 0.97, 0.94, 0.24, hw - 0.005, hb, 0.6);
      return {
        L: 4.55, W: 1.82, H: 1.34, wr: 0.33, tireW: 0.235, track: 1.57, axles: [1.38, -1.3],
        keys: [
          ...endKeys(deck, -2.0, zT, { top: 0.84, belt: 0.82, yb: 0.36, hw: 0.75, hb: 0.71 }).reverse(), deck,
          k(-1.58, 'hood', 0.99, 0.95, 0.22, hw, hb, 0.6), k(-0.92, 'roof', 1.27, 0.95, 0.2, hw, hb, 0.55),
          k(-0.3, 'roof', 1.34, 0.94, 0.19, hw, hb, 0.6), k(0.32, 'roof', 1.33, 0.93, 0.19, hw, hb, 0.61),
          k(1.12, 'hood', 0.93, 0.9, 0.2, hw, hb, 0.6), k(1.62, 'hood', 0.85, 0.82, 0.21, hw, hb, 0.6), hood,
          ...endKeys(hood, 2.02, zN, { top: 0.6, belt: 0.58, yb: 0.3, hw: 0.72, hb: 0.67 }),
        ],
        windows: [[-1.0, -0.36], [-0.26, 1.02]], pillars: [[-0.36, -0.26]],
        details: {
          seams: [0.98, -0.3], handles: [-0.14], mirrorZ: 0.96, beltMold: [-1.0, 1.02], hoodSeam: 1.1, trunkSeam: -1.52,
          head: { len: 0.26, s0: 3.8, s1: 6.6, face: [0.62, 0.5, 0.6] }, grille: [0.4, 0.38, 0.52, 'grille'], intake: [0.58, 0.3, 0.37], plateF: 0.33,
          tail: { len: 0.18, s0: 3.8, s1: 5.6, face: [0.5, 0.68, 0.8] }, plateR: 0.47, bumperR: 0.4, bumperF: 0.32,
          cabin: [-1.0, 1.08], floorY: 0.3, innerHW: 0.78, belt: 0.93, roofY: 1.32, driverX: 0.36, seats: [{ z: 0.05 }, { z: -0.72, bench: true }], seatCol: 0x2a2a2c,
        },
      };
    }
    return null;
  }

  /* assemble one vehicle kind / variant into instanced parts */
  const vehCache = {};
  const VEHICLES = { sedan: 2, hatch: 1, suv: 1, van: 1, pickup: 1, taxi: 1, truck: 1, animalvan: 1, wagon: 1, coupe: 1, motorcycle: 2 };
  function vehicle(kind = 'sedan', variant = 0) {
    if (!VEHICLES[kind]) kind = 'sedan';
    const v = ((Math.floor(variant) % VEHICLES[kind]) + VEHICLES[kind]) % VEHICLES[kind];
    const key = kind + ':' + v;
    if (vehCache[key]) return vehCache[key];
    if (kind === 'motorcycle') return (vehCache[key] = buildMotorcycle(v));
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

  /* ---------- the motorcycle: built from parts, not the loft. Front +z, wheels at z = +-0.72 (2.1 m long overall),
     v0 red with a small windscreen, v1 black. Painted parts carry their own color (no tint). The rider is extra:
     res.rider = { geometry, material } in the same frame, for bikes on the move (parked bikes have no rider). ---------- */
  function motoArc(cy, cz, R0, w, a0, a1, col, seg = 8) {
    // a fender: a curved band over a wheel in the y-z plane (angle from +z toward +y), edges curling down
    const S = solid(), ctr = new V3(0, cy, cz);
    const P = (a, x, dr) => new V3(x, cy + Math.sin(a) * (R0 + dr), cz + Math.cos(a) * (R0 + dr));
    for (let i = 0; i < seg; i++) {
      const t0 = lerp(a0, a1, i / seg), t1 = lerp(a0, a1, (i + 1) / seg);
      for (const [x0, x1, d0, d1] of [[-w / 2, 0, -0.03, 0], [0, w / 2, 0, -0.03]]) {
        const A = P(t0, x0, d0), B = P(t0, x1, d1), C = P(t1, x1, d1), D = P(t1, x0, d0);
        S.quad(A, B, C, D, col, (c) => new V3().subVectors(c, ctr).setX(0));
        const o = -0.006, Ai = P(t0, x0, d0 + o), Bi = P(t0, x1, d1 + o), Ci = P(t1, x1, d1 + o), Di = P(t1, x0, d0 + o);
        S.quad(Ai, Bi, Ci, Di, mulc(col, 0.45), (c) => new V3().subVectors(ctr, c).setX(0));
      }
    }
    return S.geo();
  }
  function buildMotorcycle(v) {
    const PNT = [C3(0x8e1a14), C3(0x1e2024)][v], BLK = C3(0x141516), CHR = C3(0xc8ccd0), ALU = C3(0x8a8e92), RUB = C3(0x1c1c1c);
    const body = [], trim = [], lights = [], glass = [];
    const wr = 0.31, zF = 0.72, zR = -0.72, Rr = (a, b, rad, col, seg = 6) => trim.push(whiteUV(rod(a[0], a[1], a[2], b[0], b[1], b[2], rad, col, seg)));
    // tank, tail cowl, side covers, fenders
    const tank = ell(0, 0.93, 0.18, 0.16, 0.12, 0.31, PNT, 2);
    eachVertex(tank, (p) => { if (p.y < 0.87) p.y = 0.87 - (0.87 - p.y) * 0.4; if (p.z > 0.3) p.y -= (p.z - 0.3) * 0.35; });
    smoothNormals(tank); body.push(tank);
    body.push(ell(0, 0.8, -0.5, 0.11, 0.075, 0.27, PNT, 1));
    for (const s of [1, -1]) body.push(bx(0.025, 0.15, 0.26, s * 0.12, 0.68, -0.2, PNT));
    body.push(motoArc(wr, zF, wr + 0.04, 0.13, 0.75, 2.35, PNT), motoArc(wr, zR, wr + 0.05, 0.17, 0.55, 1.75, PNT));
    // seat
    const seat = ell(0, 0.85, -0.22, 0.14, 0.065, 0.32, BLK, 1);
    eachVertex(seat, (p) => { if (p.y < 0.83) p.y = 0.83; }); smoothNormals(seat); trim.push(whiteUV(seat));
    // frame, swingarm, shocks
    Rr([0, 0.96, 0.5], [0, 0.42, 0.24], 0.026, BLK); Rr([0, 0.95, 0.48], [0, 0.86, -0.06], 0.026, BLK); Rr([0, 0.86, -0.06], [0, 0.38, -0.1], 0.026, BLK);
    for (const s of [1, -1]) {
      Rr([s * 0.1, 0.8, -0.05], [s * 0.1, 0.8, -0.62], 0.016, BLK);
      Rr([s * 0.11, 0.38, -0.1], [s * 0.11, wr, zR], 0.024, ALU);
      Rr([s * 0.12, 0.42, -0.58], [s * 0.12, 0.8, -0.4], 0.016, CHR);
      trim.push(whiteUV(cylC(0.03, 0.03, 0.16, 8, C3(0x8a2a1a)).rotateX(-0.43).translate(s * 0.12, 0.62, -0.49)));
      // fork: chrome tubes and alloy sliders
      Rr([s * 0.1, wr, zF], [s * 0.1, 0.62, 0.6], 0.032, ALU); Rr([s * 0.1, 0.62, 0.6], [s * 0.1, 0.99, 0.48], 0.022, CHR);
      // foot pegs
      Rr([s * 0.1, 0.36, -0.02], [s * 0.24, 0.36, -0.02], 0.014, BLK);
      // turn signals
      lights.push(setGlow(whiteUV(ell(s * 0.15, 0.9, 0.6, 0.03, 0.022, 0.035, C3(0xffa418), 0)), 0), setGlow(whiteUV(ell(s * 0.13, 0.76, -0.74, 0.03, 0.022, 0.035, C3(0xffa418), 0)), 0));
      // mirrors
      Rr([s * 0.27, 1.06, 0.46], [s * 0.31, 1.2, 0.44], 0.008, BLK); trim.push(whiteUV(ell(s * 0.31, 1.22, 0.44, 0.055, 0.035, 0.018, BLK, 0)));
    }
    trim.push(whiteUV(bx(0.28, 0.04, 0.09, 0, 0.98, 0.49, ALU)), whiteUV(bx(0.26, 0.04, 0.08, 0, 0.82, 0.55, ALU)));
    // engine: crankcase, two cylinders with fins, side covers
    trim.push(whiteUV(bx(0.26, 0.22, 0.38, 0, 0.42, 0.06, ALU)));
    for (const [cz, a] of [[0.17, 0.42], [-0.02, -0.38]]) {
      const c = cylC(0.072, 0.072, 0.24, 10, ALU); c.rotateX(a); c.translate(0, 0.6, cz); trim.push(whiteUV(c));
      for (const t of [-0.05, 0.03]) { const f = cylC(0.09, 0.09, 0.012, 10, ALU); f.translate(0, t, 0); f.rotateX(a); f.translate(0, 0.6, cz); trim.push(whiteUV(f)); }
      const hd = cylC(0.08, 0.07, 0.06, 10, CHR); hd.translate(0, 0.14, 0); hd.rotateX(a); hd.translate(0, 0.6, cz); trim.push(whiteUV(hd));
    }
    for (const s of [1, -1]) trim.push(whiteUV(cylC(0.11, 0.11, 0.03, 12, CHR).rotateZ(PI / 2).translate(s * 0.14, 0.42, 0.04)));
    // exhaust on the right (-x): header pipes into a muffler swept up at the back
    Rr([0, 0.66, 0.27], [-0.1, 0.42, 0.34], 0.024, CHR); Rr([-0.1, 0.42, 0.34], [-0.16, 0.33, 0.05], 0.024, CHR); Rr([-0.16, 0.33, 0.05], [-0.17, 0.4, -0.3], 0.026, CHR);
    trim.push(whiteUV(cylC(0.055, 0.05, 0.48, 10, CHR).rotateX(PI / 2 - 0.16).translate(-0.17, 0.45, -0.52)));
    // chain on the left (+x), kickstand on the left
    trim.push(whiteUV(bx(0.012, 0.016, 0.66, 0.13, 0.4, -0.34, BLK)), whiteUV(bx(0.012, 0.016, 0.66, 0.13, 0.3, -0.36, BLK)));
    Rr([0.12, 0.33, -0.06], [0.3, 0.0, 0.02], 0.012, BLK, 4);
    // handlebar, grips, gauges
    Rr([-0.3, 1.06, 0.46], [0.3, 1.06, 0.46], 0.012, BLK); Rr([-0.38, 1.06, 0.46], [-0.27, 1.06, 0.46], 0.02, RUB); Rr([0.27, 1.06, 0.46], [0.38, 1.06, 0.46], 0.02, RUB);
    Rr([0, 0.99, 0.48], [0, 1.06, 0.46], 0.016, BLK);
    trim.push(whiteUV(cylC(0.055, 0.05, 0.05, 10, BLK).rotateX(-0.6).translate(0, 1.06, 0.55)));
    // headlight in a chrome shell, tail light, plate
    trim.push(whiteUV(cylC(0.095, 0.08, 0.13, 12, CHR).rotateX(PI / 2).translate(0, 0.9, 0.62)));
    { const ln = prep(new THREE.CircleGeometry(0.085, 12)); ln.translate(0, 0.9, 0.687); const u = ln.attributes.uv.array, h = vuv('head'); for (let i = 0; i < u.length; i += 2) { u[i] = lerp(h[0], h[2], 0.2 + u[i] * 0.3); u[i + 1] = lerp(h[1], h[3], 0.2 + u[i + 1] * 0.6); } lights.push(setGlow(paint(ln, C3(0xe8eef2)), 1.6)); }
    trim.push(whiteUV(bx(0.12, 0.05, 0.06, 0, 0.79, -0.75, BLK)));
    lights.push(endQuad(-0.781, -1, -0.055, 0.055, 0.775, 0.805, C3(0xffffff), vuv('tail'), 0.85));
    trim.push(endQuad(-0.83, -1, -0.09, 0.09, 0.6, 0.72, [1, 1, 1], vuv('plate')), whiteUV(bx(0.04, 0.08, 0.1, 0, 0.7, -0.78, BLK)));
    if (v === 0) { const ws = quadUV(0.34, 0.26, vuv('white'), C3(0x2a3a44)); ws.rotateX(-0.45); ws.translate(0, 1.1, 0.6); glass.push(ws); }
    const parts = [
      { geometry: setTint(merge(body.map(whiteUV)), 0), material: VM.paint(), tint: false, castShadow: true },
      { geometry: merge(trim), material: VM.trim(), tint: false, castShadow: true },
      { geometry: merge(lights), material: VM.lights(), tint: false, castShadow: false },
    ];
    if (glass.length) parts.push({ geometry: merge(glass), material: VM.glass(), tint: false, castShadow: false });
    for (const p of parts) { p.geometry.computeBoundingBox(); p.geometry.computeBoundingSphere(); }
    const rider = riderGeo();
    const res = {
      kind: 'motorcycle', variant: v, parts,
      wheel: { geometry: wheelGeo(wr, 0.14, 'alloy'), material: VM.wheel() },
      wheels: [{ x: 0, y: wr, z: zF, r: wr }, { x: 0, y: wr, z: zR, r: wr }], len: 2.1, wid: 0.8, h: 1.25,
      lights: { head: [{ x: 0, y: 0.9, z: 0.69 }], tail: [{ x: 0, y: 0.79, z: -0.78 }] },
      rider: { geometry: rider, material: smat('rider', { std: true, roughness: 0.62 }) },
      lean: -0.12,
    };
    res.tris = parts.reduce((n, p) => n + tris(p.geometry), 0);
    return res;
  }
  // a rider sitting on the motorcycle: helmet, jacket, jeans, gloves on the grips, boots on the pegs
  function riderGeo() {
    const JK = C3(0x2c3038), JN = C3(0x34486a), HL = C3(0xe4e4e0), VIS = C3(0x141618), GL = C3(0x1a1a1a), BT = C3(0x2a2018);
    const g = [];
    g.push(ell(0, 0.93, -0.2, 0.17, 0.11, 0.15, JN, 1));
    const torso = ell(0, 0.0, 0.0, 0.19, 0.27, 0.13, JK, 1); torso.rotateX(0.38); torso.translate(0, 1.17, -0.1); g.push(torso);
    g.push(ell(0, 1.43, 0.03, 0.06, 0.06, 0.06, JK, 0));
    g.push(ell(0, 1.56, 0.07, 0.13, 0.14, 0.15, HL, 1), ell(0, 1.55, 0.15, 0.1, 0.06, 0.08, VIS, 1));
    for (const s of [1, -1]) {
      g.push(tubeC([new V3(s * 0.18, 1.36, 0.0), new V3(s * 0.24, 1.2, 0.2), new V3(s * 0.33, 1.08, 0.44)], 0.05, JK, 6));
      g.push(ell(s * 0.34, 1.07, 0.46, 0.045, 0.04, 0.05, GL, 0));
      g.push(tubeC([new V3(s * 0.1, 0.92, -0.18), new V3(s * 0.19, 0.88, 0.12), new V3(s * 0.18, 0.46, 0.0)], 0.07, JN, 6));
      g.push(ell(s * 0.18, 0.4, 0.04, 0.05, 0.06, 0.12, BT, 1));
    }
    const m = merge(g);
    m.computeBoundingBox(); m.computeBoundingSphere();
    return m;
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
