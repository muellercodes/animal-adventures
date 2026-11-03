/* ============================================================
   Zoo kit (round 10)
     Env.zooArch(text, o)  the entrance of a zoo: two stone pillars and a beam with a painted name board hanging under it.
       o: { w: opening width between the pillars (m), h: height, bg: board color, ink: letter color, stone: pillar color }
       Front faces +z. userData.colliders: the pillars [{ x, z, r }].
   ============================================================ */
(() => {
  const K = Env._k;
  const { L, mulc, merge, boxG, meshOf, mat } = K;
  const boardCache = {};
  function boardTex(text, bg, ink) {
    const key = text + bg + ink;
    if (boardCache[key]) return boardCache[key];
    const cv = document.createElement('canvas'); cv.width = 1024; cv.height = 220;
    const c = cv.getContext('2d');
    c.fillStyle = bg; c.fillRect(0, 0, cv.width, cv.height);
    c.strokeStyle = 'rgba(255,255,255,0.55)'; c.lineWidth = 10; c.strokeRect(14, 14, cv.width - 28, cv.height - 28);
    let size = 150;
    const font = (s) => `bold ${s}px Grandstander, 'Trebuchet MS', 'Arial Rounded MT Bold', Verdana, sans-serif`;
    c.font = font(size);
    while (c.measureText(text).width > cv.width - 120 && size > 60) { size -= 6; c.font = font(size); }
    c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillText(text, cv.width / 2 + 5, cv.height / 2 + 9);
    c.fillStyle = ink; c.fillText(text, cv.width / 2, cv.height / 2 + 4);
    const t = new THREE.CanvasTexture(cv); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4;
    boardCache[key] = t;
    return t;
  }
  Env.zooArch = (text, o = {}) => {
    const W = o.w || 8, Hh = o.h || 5.4, stone = L(o.stone || 0x8c8478), grp = new THREE.Group();
    grp.name = 'zooArch';
    const gs = [];
    for (const sx of [-1, 1]) {
      gs.push(boxG(1.0, Hh, 1.0, sx * (W / 2 + 0.5), Hh / 2, 0, stone, 2));
      gs.push(boxG(1.3, 0.32, 1.3, sx * (W / 2 + 0.5), Hh + 0.16, 0, mulc(stone, 0.85), 1));
      gs.push(boxG(1.25, 0.4, 1.25, sx * (W / 2 + 0.5), 0.2, 0, mulc(stone, 0.8), 1));
    }
    gs.push(boxG(W + 2, 0.4, 0.6, 0, Hh - 0.25, 0, mulc(stone, 0.92), 2));
    grp.add(meshOf(merge(gs), mat('archStone', { std: true, roughness: 0.85 })));
    const bw = W - 0.4, bh = bw * 220 / 1024;
    const m = new THREE.MeshLambertMaterial({ map: boardTex(text, o.bg || '#2f6b3a', o.ink || '#fff3d0'), fog: true });
    for (const side of [1, -1]) {
      const face = new THREE.Mesh(new THREE.PlaneGeometry(bw, bh), m);
      face.position.set(0, Hh - 0.5 - bh / 2, side * 0.08); if (side < 0) face.rotation.y = Math.PI;
      grp.add(face);
    }
    // the board's back plank and two short chains
    const wood = [boxG(bw + 0.1, bh + 0.1, 0.12, 0, Hh - 0.5 - bh / 2, 0, L(0x6a4e34), 1)];
    for (const sx of [-1, 1]) wood.push(boxG(0.06, 0.12, 0.06, sx * bw * 0.4, Hh - 0.47, 0, L(0x3a3c40), 1));
    grp.add(meshOf(merge(wood), mat('zooBoardWood', { std: true, roughness: 0.8 })));
    grp.userData = { colliders: [{ x: -(W / 2 + 0.5), z: 0, r: 0.65 }, { x: W / 2 + 0.5, z: 0, r: 0.65 }] };
    return grp;
  };
})();
