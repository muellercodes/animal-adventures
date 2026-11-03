/* ---------- round 10: zoo visitors ----------
   While you are near a zoo in the daytime, people come in through its gate and walk its route (49_plan ZOOS route): they
   stop at the pens, look at the animals, say what they see now and then, greet your animal if it comes close, and leave
   again by the gate. */
const ZOO_LINES = {
  giraffe: ['Look how tall the giraffes are!', 'That giraffe has such a long neck!'], rhino: ['That rhino is huge!', 'Look at its horn!'],
  croc: ["Don't get too close to the crocodiles!", 'I can only see its eyes!'], polar: ['The polar bears are so fluffy!', 'Look, a polar bear cub!'],
  leopard: ["Look at that snow leopard's tail!", 'It blends in with the rocks!'], aviary: ['I see an eagle!', 'The cockatiels are so pretty!'],
  otter: ['The otters are so cute!', 'Look at them swim!'], deer: ['Aww, a baby deer!', 'Look at the deer!'], moose: ['That moose is enormous!'],
  bats: ['The bats are hanging upside down!', 'Look at their big wings!'], fox: ["There's a fox!", 'I see a raccoon!'],
  goats: ['Can we pet the goats?', 'That goat is climbing!'], pigs: ['Oink oink!', 'The piglets are so little!'], bunnies: ['The bunnies are so soft!', 'Look, a hamster!'],
  hens: ['The chickens are pecking!', 'Cluck cluck!'], brachio: ['Its neck is so long!', 'It eats from the treetops!'], trex: ['Whoa, a T. rex!', 'Look at its tiny arms!'],
  saber: ['Look at those teeth!', 'A saber-toothed cat!'],
};
const Zoos = {
  t: 0,
  max: { cityzoo: 7, petting: 4, dino: 6 },
  update(dt) {
    const w = G.world, P = Player.b;
    if (!w || w.id !== 'land' || !Plan.ZOOS || !P) return;
    this.t -= dt;
    const open = (G.night || 0) < 0.45;
    for (const Z of Plan.ZOOS) {
      const d = P.room ? 1e9 : Math.hypot(P.pos.x - Z.x, P.pos.z - Z.z);
      const here = Folk.list.filter((q) => q.zoogoer && q.zoo === Z);
      // nobody is left at a zoo you went far away from
      if (d > 260) { for (const q of here) Folk.remove(q); continue; }
      if (!open || d > 170 || this.t > 0 || here.length >= (this.max[Z.id] || 4)) continue;
      this.t = 4 + Math.random() * 6;
      const [x0, z0] = this.pt(Z, 0);
      Folk.make(Town.freeName(), Folk.randomLook(Math.random() < 0.4), x0 + (Math.random() - 0.5) * 2, z0 + (Math.random() - 0.5) * 2, { zoogoer: true, zoo: Z, ri: 1, gaze: 0, said: false, state: 'zoo', pace: 0.95 + Math.random() * 0.3 });
    }
  },
  pt(Z, i) { const q = Z.route[Math.min(i, Z.route.length - 1)]; return [Z.x + q[0], Z.z + q[1]]; },
  pen(Z, id) { return Z.pens.find((p) => p.id === id) || null; },
  step(p, dt, P, dP) {
    const Z = p.zoo;
    let crouch = 0, reach = 0;
    if (p.gaze > 0) {
      // at a pen: face the animals, now and then say what you see
      p.gaze -= dt; p.speed = damp(p.speed, 0, 6, dt);
      const pen = this.pen(Z, Z.route[p.ri][2]);
      if (pen) Folk.face(p, dt, pen.wx, pen.wz);
      if (pen && !p.spoke && p.gaze < 3 && dP < 25 && Math.random() < 0.012) { p.spoke = true; G.ui.bubble(p, rnd(ZOO_LINES[pen.id] || ['Look!']), 2.4); }
      if (p.gaze <= 0) { p.ri++; p.spoke = false; }
    } else {
      const [tx, tz] = this.pt(Z, p.ri), left = Folk.walkTo(p, dt, tx, tz, 1.15 * p.pace);
      if (left !== undefined && left < 0.6) {
        if (p.ri >= Z.route.length - 1) { Folk.remove(p); return; }
        if (Z.route[p.ri][2]) p.gaze = 4 + Math.random() * 6; else p.ri++;
      }
    }
    // your animal comes close: say hello (once)
    if (P && !p.said && dP < 3.5 && !P.room) { p.said = true; G.ui.bubble(p, `Hello, ${SPECIES[P.sp].name.toLowerCase()}!`, 2); }
    Folk.pose(p, dt, crouch, reach, G.camera.position);
  },
};
