/* ---------- sound: everything is synthesized with Web Audio (no sound files) ---------- */
const Sound = (() => {
  let ac = null, master = null, sfx = null, amb = null, mus = null, noiseBuf = null;
  let on = true, musicOn = true;
  const A = {};          // ambience nodes
  let nextBird = 2, nextNote = 0, beat = 0, waterNear = 0, waterCheck = 0, stepAcc = 0, lastMode = '', flapT = 0, fireT = 0;

  function init() {
    if (ac) return true;
    try { ac = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ac = null; return false; }
    master = ac.createGain(); master.gain.value = on ? 0.85 : 0; master.connect(ac.destination);
    const comp = ac.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 4; comp.connect(master);
    sfx = gainNode(0.9, comp); amb = gainNode(0.55, comp); mus = gainNode(musicOn ? 0.16 : 0, comp);
    const len = ac.sampleRate * 2; noiseBuf = ac.createBuffer(1, len, ac.sampleRate);
    const d = noiseBuf.getChannelData(0); for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    startAmbience();
    return true;
  }
  function gainNode(v, to) { const g = ac.createGain(); g.gain.value = v; if (to) g.connect(to); return g; }
  function now() { return ac.currentTime; }
  function env(g, t, a, peak, d, sustain = 0) {
    g.gain.cancelScheduledValues(t); g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, sustain || 0.0001), t + a + d);
  }
  function out(vol, pan, bus) {
    const g = gainNode(vol, null);
    if (pan && ac.createStereoPanner) { const p = ac.createStereoPanner(); p.pan.value = clamp(pan, -1, 1); g.connect(p); p.connect(bus || sfx); }
    else g.connect(bus || sfx);
    return g;
  }
  // a tone with a pitch glide and an envelope
  function tone(o) {
    const t = o.t || now(), osc = ac.createOscillator(), g = ac.createGain();
    osc.type = o.type || 'sine'; osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, t + (o.glide || o.dur));
    if (o.vib) { const l = ac.createOscillator(), lg = ac.createGain(); l.frequency.value = o.vib; lg.gain.value = o.vibAmt || o.f * 0.03; l.connect(lg); lg.connect(osc.frequency); l.start(t); l.stop(t + o.dur + 0.1); }
    let node = osc;
    if (o.bp) { const f = ac.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = o.bp; f.Q.value = o.q || 2; node.connect(f); node = f; }
    if (o.lp) { const f = ac.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; node.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || out(o.vol || 0.3, o.pan));
    env(g, t, o.a || 0.01, 1, o.dur);
    osc.start(t); osc.stop(t + o.dur + 0.1);
  }
  // filtered noise burst
  function noise(o) {
    const t = o.t || now(), src = ac.createBufferSource(), g = ac.createGain(), f = ac.createBiquadFilter();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.type || 'bandpass'; f.frequency.setValueAtTime(o.f, t); f.Q.value = o.q || 1;
    if (o.f2) f.frequency.exponentialRampToValueAtTime(o.f2, t + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || out(o.vol || 0.3, o.pan));
    env(g, t, o.a || 0.005, 1, o.dur);
    src.start(t, Math.random() * 1.5); src.stop(t + o.dur + 0.1);
  }

  /* ---- ambience: wind, birds, crickets, water ---- */
  function startAmbience() {
    const wind = ac.createBufferSource(); wind.buffer = noiseBuf; wind.loop = true;
    const wf = ac.createBiquadFilter(); wf.type = 'lowpass'; wf.frequency.value = 380;
    const wg = gainNode(0.0, amb); wind.connect(wf); wf.connect(wg); wind.start();
    A.wind = wg; A.windF = wf;
    const water = ac.createBufferSource(); water.buffer = noiseBuf; water.loop = true;
    const lf = ac.createBiquadFilter(); lf.type = 'bandpass'; lf.frequency.value = 700; lf.Q.value = 0.7;
    const lg = gainNode(0.0, amb); water.connect(lf); lf.connect(lg); water.start(0, 0.7);
    A.water = lg;
    // crickets: a high tone gated quickly
    const cr = ac.createOscillator(); cr.frequency.value = 4600; const crg = ac.createGain(); crg.gain.value = 0;
    const gate = ac.createOscillator(); gate.type = 'square'; gate.frequency.value = 28; const gateG = ac.createGain(); gateG.gain.value = 0.5;
    gate.connect(gateG); gateG.connect(crg.gain);
    const crOut = gainNode(0.0, amb); cr.connect(crg); crg.connect(crOut); cr.start(); gate.start();
    A.crickets = crOut;
  }
  function birdCall(kind, vol, pan) {
    const t = now();
    if (kind === 'jungle') {
      const f = 500 + Math.random() * 500;
      tone({ t, f, f2: f * 1.8, dur: 0.35, type: 'sine', vol: vol * 0.7, pan, vib: 6, vibAmt: 40 });
      tone({ t: t + 0.4, f: f * 1.8, f2: f, dur: 0.4, type: 'sine', vol: vol * 0.6, pan });
      return;
    }
    if (kind === 'woodpecker') { for (let i = 0; i < 9; i++) noise({ t: t + i * 0.06, f: 1600, q: 3, dur: 0.03, vol: vol * 0.6, pan }); return; }
    const n = 2 + ((Math.random() * 5) | 0), base = 2400 + Math.random() * 2400;
    for (let i = 0; i < n; i++) {
      const f = base * (0.85 + Math.random() * 0.35);
      tone({ t: t + i * (0.09 + Math.random() * 0.06), f, f2: f * (Math.random() < 0.5 ? 1.25 : 0.8), dur: 0.07 + Math.random() * 0.05, vol: vol * 0.35, pan });
    }
  }
  function croak(vol, pan) {
    const t = now();
    for (let i = 0; i < 2; i++) tone({ t: t + i * 0.18, f: 170 + Math.random() * 40, dur: 0.14, type: 'sawtooth', lp: 700, vol: vol * 0.5, pan, vib: 30, vibAmt: 40 });
  }

  /* ---- music: soft plucked notes over slow chords ---- */
  const DAY_SCALE = [0, 2, 4, 7, 9], NIGHT_SCALE = [0, 3, 5, 7, 10];
  const CHORDS = [[0, 4, 7], [-3, 0, 4], [5, 9, 12], [7, 11, 14]];
  function scheduleMusic(night) {
    if (!musicOn || !ac) return;
    const spb = night ? 0.95 : 0.72;
    while (nextNote < now() + 0.4) {
      const t = Math.max(nextNote, now());
      const bar = Math.floor(beat / 4), chord = CHORDS[bar % CHORDS.length];
      const root = night ? 57 : 60;
      if (beat % 8 === 0) for (const c of chord) tone({ t, f: midi(root - 12 + c), dur: spb * 7.5, a: 0.8, type: 'sine', vol: 0.1, dest: mus });
      if (Math.random() < (night ? 0.45 : 0.7)) {
        const sc = night ? NIGHT_SCALE : DAY_SCALE, n = sc[(Math.random() * sc.length) | 0] + (Math.random() < 0.3 ? 12 : 0);
        tone({ t, f: midi(root + n), dur: spb * 1.6, a: 0.01, type: 'triangle', vol: 0.18, dest: mus });
      }
      beat++; nextNote = t + spb;
    }
  }
  const midi = (n) => 440 * Math.pow(2, (n - 69) / 12);

  /* ---- animal calls ---- */
  function call(b, opts = {}) {
    if (!ac || !on) return;
    const sp = b.sp, k = b.age < 0.6 ? 1.55 : 1, t = now(), vol = (opts.vol || 0.5), pan = opts.pan || 0;
    const T = (o) => tone(Object.assign({ vol, pan }, o));
    switch (sp) {
      case 'duck': for (let i = 0; i < 2; i++) T({ t: t + i * 0.2, f: 300 * k, f2: 230 * k, dur: 0.14, type: 'sawtooth', bp: 1100, q: 2.5 }); break;
      case 'swan': T({ t, f: 390 * k, f2: 340 * k, dur: 0.35, type: 'square', bp: 900, q: 2, vol: vol * 0.7 }); break;
      case 'chicken': for (let i = 0; i < 3; i++) T({ t: t + i * 0.13, f: (520 + i * 40) * k, f2: 460 * k, dur: 0.07, type: 'square', bp: 1400, q: 3 }); T({ t: t + 0.45, f: 700 * k, f2: 520 * k, dur: 0.3, type: 'square', bp: 1500, q: 3 }); break;
      case 'frog': croak(vol * 1.6, pan); break;
      case 'lizard': T({ t, f: 3200, f2: 3600, dur: 0.05 }); T({ t: t + 0.08, f: 3300, f2: 3700, dur: 0.05 }); break;
      case 'snake': noise({ t, f: 5000, type: 'highpass', dur: 0.8, vol: vol * 0.5, pan }); break;
      case 'bunny': T({ t, f: 95, f2: 60, dur: 0.12, vol: vol * 1.4 }); T({ t: t + 0.25, f: 95, f2: 60, dur: 0.12, vol: vol * 1.4 }); break;
      case 'squirrel': for (let i = 0; i < 8; i++) T({ t: t + i * 0.06, f: (2600 + Math.random() * 900) * (k > 1 ? 1.2 : 1), dur: 0.035, vol: vol * 0.6 }); break;
      case 'hedgehog': for (let i = 0; i < 4; i++) noise({ t: t + i * 0.11, f: 900, q: 1.5, dur: 0.06, vol: vol * 0.5, pan }); break;
      case 'turtle': for (let i = 0; i < 3; i++) T({ t: t + i * 0.12, f: 380, f2: 900, dur: 0.06, vol: vol * 0.5 }); break;
      case 'pig': for (let i = 0; i < 2; i++) T({ t: t + i * 0.28, f: 150 * k, f2: 120 * k, dur: 0.2, type: 'sawtooth', bp: 520, q: 3, vib: 25, vibAmt: 15 }); break;
      case 'goat': T({ t, f: 430 * k, f2: 380 * k, dur: 0.65, type: 'sawtooth', bp: 1100, q: 2, vib: 7.5, vibAmt: 35 }); break;
      case 'fox': for (let i = 0; i < 2; i++) T({ t: t + i * 0.3, f: 900 * k, f2: 1400 * k, glide: 0.08, dur: 0.22, type: 'triangle' }); break;
      case 'weasel': for (let i = 0; i < 7; i++) T({ t: t + i * 0.05, f: (1700 + Math.random() * 700) * k, dur: 0.03, type: 'square', bp: 2200, q: 3, vol: vol * 0.45 }); break;
      case 'otter': for (let i = 0; i < 2; i++) T({ t: t + i * 0.16, f: 2100, f2: 2900, dur: 0.1, vol: vol * 0.6 }); break;
      case 'raccoon': for (let i = 0; i < 6; i++) T({ t: t + i * 0.07, f: 1100 + Math.random() * 400, dur: 0.05, type: 'triangle', vol: vol * 0.6 }); break;
      case 'owl': T({ t, f: 410 * k, f2: 380 * k, dur: 0.5, a: 0.08, vol: vol * 0.9 }); T({ t: t + 0.7, f: 400 * k, f2: 370 * k, dur: 0.25, a: 0.05, vol: vol * 0.8 }); T({ t: t + 1.0, f: 400 * k, f2: 360 * k, dur: 0.45, a: 0.06, vol: vol * 0.8 }); break;
      case 'deer': T({ t, f: 900 * k, f2: 760 * k, dur: 0.35, vib: 9, vibAmt: 40, vol: vol * 0.6 }); break;
      case 'parrot': T({ t, f: 1150, f2: 1500, dur: 0.12, type: 'sawtooth', bp: 2000, q: 2, vib: 30, vibAmt: 150 }); T({ t: t + 0.18, f: 1400, f2: 1000, dur: 0.18, type: 'sawtooth', bp: 2100, q: 2, vib: 25, vibAmt: 120 }); break;
      case 'horse': T({ t, f: 650 * k, f2: 300 * k, dur: 1.1, type: 'sawtooth', bp: 1200, q: 1.5, vib: 13, vibAmt: 60 }); break;
      case 'moose': T({ t, f: 120 * k, f2: 90 * k, dur: 1.2, type: 'sawtooth', lp: 650, vol: vol * 1.2 }); break;
      // woof woof: two short barks, a voiced drop with a puff of breath (a puppy's are higher and yappier)
      case 'dog': for (let i = 0; i < 2; i++) { const t0 = t + i * 0.32; T({ t: t0, f: 330 * k, f2: 210 * k, dur: 0.16, type: 'sawtooth', bp: 800 * k, q: 1.6, vol: vol * 1.2 }); T({ t: t0, f: 660 * k, f2: 380 * k, dur: 0.1, type: 'square', bp: 1400 * k, q: 2, vol: vol * 0.35 }); noise({ t: t0, f: 900 * k, q: 1.2, dur: 0.09, vol: vol * 0.4, pan }); } break;
      // meow: rising into the "ee", then a long falling "ow"
      case 'cat': T({ t, f: 520 * k, f2: 760 * k, dur: 0.2, type: 'sawtooth', bp: 1500 * k, q: 1.8, vib: 6, vibAmt: 12, vol: vol * 0.8 }); T({ t: t + 0.18, f: 760 * k, f2: 470 * k, dur: 0.42, a: 0.03, type: 'sawtooth', bp: 1100 * k, q: 1.8, vib: 6, vibAmt: 14, vol: vol * 0.8 }); break;
    }
  }

  /* ---- per-frame: footsteps, splashes, flaps, ambience ---- */
  function update(dt, s) {
    if (!ac || ac.state !== 'running') return;
    const t = now();
    const daylight = 1 - s.night;
    // wind, crickets, water near the player
    A.wind.gain.setTargetAtTime(s.inside ? 0.0 : (s.world === 'sky' ? 0.32 : 0.12) * (0.7 + 0.3 * Math.sin(G.t * 0.21)), t, 0.6);
    A.crickets.gain.setTargetAtTime(!s.inside && s.world !== 'sky' && s.night > 0.6 ? 0.018 : 0, t, 1.2);
    waterCheck -= dt;
    if (waterCheck <= 0 && s.pos && G.world) {
      waterCheck = 1; waterNear = 0;
      if (G.world.def.water && !s.inside) for (let i = 0; i < 8; i++) { const a = (i / 8) * TAU; if (G.world.H(s.pos.x + Math.cos(a) * 6, s.pos.z + Math.sin(a) * 6) < 0) { waterNear = 1; break; } }
    }
    A.water.gain.setTargetAtTime(waterNear * 0.09, t, 0.8);
    nextBird -= dt;
    if (nextBird <= 0 && !s.inside) {
      nextBird = 2 + Math.random() * 5;
      const pan = Math.random() * 1.6 - 0.8;
      if (daylight > 0.5) {
        if (s.world === 'jungle') birdCall('jungle', 0.5, pan);
        else if (s.world === 'forest' && Math.random() < 0.25) birdCall('woodpecker', 0.4, pan);
        else if (s.world !== 'swamp' || Math.random() < 0.4) birdCall('song', 0.5, pan);
      } else if (s.world === 'swamp' || waterNear) croak(0.35, pan);
      else if (Math.random() < 0.15) call({ sp: 'owl', age: 1 }, { vol: 0.15, pan });
    }
    if (s.inside && s.night > 0.5) { fireT -= dt; if (fireT <= 0) { fireT = 0.08 + Math.random() * 0.4; noise({ f: 2500 + Math.random() * 2000, q: 4, dur: 0.02, vol: 0.06 }); } }
    scheduleMusic(s.night > 0.6);
    // the player's own movement
    const b = s.body; if (!b) return;
    const size = clamp(b.m.height, 0.08, 2), vol = clamp(0.06 + size * 0.12, 0.05, 0.3);
    if (lastMode !== b.mode) {
      if (b.mode === 'swim' && (lastMode === 'ground' || lastMode === 'air' || lastMode === 'fly')) splash(size);
      lastMode = b.mode;
    }
    if (b.mode === 'ground' && b.speed > 0.1 && !SPECIES[b.sp].hop) {
      stepAcc += (b.speed * dt) / Math.max(0.05, b.rig.stride * b.k * 0.5);
      if (stepAcc >= 1) { stepAcc = 0; step(s.inside ? 'floor' : 'grass', vol); }
    } else if (b.mode === 'swim' && b.speed > 0.2) {
      stepAcc += dt * 1.4; if (stepAcc >= 1) { stepAcc = 0; noise({ f: 900, q: 0.8, dur: 0.18, vol: vol * 0.5 }); }
    } else if (b.mode === 'fly' && b.vy > 0.5) {
      flapT -= dt; if (flapT <= 0) { flapT = 0.28; noise({ f: 500, f2: 260, q: 0.7, dur: 0.16, vol: 0.12 }); }
    }
  }
  function step(surface, vol) {
    if (surface === 'floor') { tone({ f: 180, f2: 120, dur: 0.05, vol: vol * 0.6 }); noise({ f: 1400, q: 2, dur: 0.03, vol: vol * 0.3 }); }
    else noise({ f: 1600 + Math.random() * 800, q: 0.9, dur: 0.06, vol: vol * 0.5 });
  }
  function splash(size) { noise({ f: 1800, f2: 400, type: 'lowpass', dur: 0.45, vol: clamp(0.15 + size * 0.2, 0.15, 0.45) }); }

  const api = {
    init, get ready() { return !!ac; },
    resume() { if (!init()) return; if (ac.state === 'suspended') ac.resume(); },
    setOn(v) { on = v; if (master) master.gain.setTargetAtTime(v ? 0.85 : 0, now(), 0.05); },
    setMusic(v) { musicOn = v; if (mus) mus.gain.setTargetAtTime(v ? 0.16 : 0, now(), 0.3); },
    update,
    call(b, opts) { call(b, opts); },
    hop(b) { if (ac && on) tone({ f: 120, f2: 70, dur: 0.07, vol: clamp(0.05 + b.m.height * 0.12, 0.04, 0.2) }); },
    land(b) { if (ac && on) noise({ f: 700, q: 0.8, dur: 0.08, vol: clamp(0.06 + b.m.height * 0.15, 0.05, 0.3) }); },
    eat() { if (!ac || !on) return; const t = now(); for (let i = 0; i < 3; i++) noise({ t: t + i * 0.11, f: 2600, type: 'highpass', dur: 0.05, vol: 0.18 }); },
    leaf(n) { if (!ac || !on) return; const t = now(); tone({ t, f: 1046, dur: 0.18, vol: 0.18, type: 'triangle' }); tone({ t: t + 0.08, f: 1568, dur: 0.22, vol: 0.16, type: 'triangle' }); if (n > 1) tone({ t: t + 0.16, f: 2093, dur: 0.3, vol: 0.14, type: 'triangle' }); },
    chime() { if (!ac || !on) return; const t = now(); [523, 659, 784, 1046].forEach((f, i) => tone({ t: t + i * 0.12, f, dur: 0.5, vol: 0.18, type: 'triangle' })); },
    door() { if (!ac || !on) return; const t = now(); tone({ t, f: 140, f2: 90, dur: 0.5, type: 'sawtooth', bp: 600, q: 4, vol: 0.12 }); tone({ t: t + 0.5, f: 80, f2: 50, dur: 0.15, vol: 0.3 }); },
    // a wooden gate swinging on its hinges, quieter the farther away it is
    creak(g) {
      if (!ac || !on) return;
      const P = Player.b, d = P ? Math.hypot(P.pos.x - g.x, P.pos.z - g.z) : 3, v = clamp(1 - d / 14, 0, 1);
      if (v <= 0) return;
      const t = now();
      tone({ t, f: 420, f2: 300, dur: 0.35, type: 'sawtooth', bp: 900, q: 9, vol: 0.05 * v, vib: 22, vibAmt: 40 });
      tone({ t: t + 0.32, f: 120, f2: 90, dur: 0.08, vol: 0.12 * v });
    },
    // a trap door snapping shut
    snap() { if (!ac || !on) return; const t = now(); noise({ t, f: 2400, q: 1.2, dur: 0.05, vol: 0.4 }); tone({ t, f: 300, f2: 120, dur: 0.12, type: 'square', vol: 0.18 }); },
    // the pound phone ringing
    ring() { if (!ac || !on) return; const t = now(); for (let i = 0; i < 4; i++) { tone({ t: t + i * 0.42, f: 880, dur: 0.16, type: 'triangle', vol: 0.12, vib: 20, vibAmt: 30 }); tone({ t: t + i * 0.42 + 0.18, f: 880, dur: 0.16, type: 'triangle', vol: 0.12, vib: 20, vibAmt: 30 }); } },
    // the school bell
    bell(d) { if (!ac || !on) return; const v = clamp(1 - (d || 0) / 120, 0.08, 1), t = now(); for (let i = 0; i < 5; i++) { tone({ t: t + i * 0.32, f: 1318, dur: 1.2, type: 'sine', vol: 0.16 * v }); tone({ t: t + i * 0.32, f: 2637, dur: 0.6, type: 'sine', vol: 0.05 * v }); } },
    // a car horn: two notes together; the bus has a lower, longer one
    honk(d, big) { if (!ac || !on) return; const v = clamp(1 - (d || 0) / 90, 0.1, 1), t = now(); for (const f of big ? [233, 294] : [415, 523]) { tone({ t, f, dur: big ? 0.55 : 0.32, type: 'square', bp: big ? 900 : 1500, q: 2, vol: 0.07 * v }); tone({ t: t + (big ? 0.7 : 0.42), f, dur: big ? 0.4 : 0.22, type: 'square', bp: big ? 900 : 1500, q: 2, vol: 0.07 * v }); } },
    knock() { if (!ac || !on) return; const t = now(); for (let i = 0; i < 3; i++) { tone({ t: t + i * 0.22, f: 190, f2: 120, dur: 0.08, vol: 0.4 }); noise({ t: t + i * 0.22, f: 500, q: 2, dur: 0.05, vol: 0.2 }); } },
    crack() { if (!ac || !on) return; noise({ f: 3000, type: 'highpass', dur: 0.06, vol: 0.3 }); tone({ f: 900, f2: 600, dur: 0.05, vol: 0.12 }); },
    tummy() { if (ac && on) tone({ f: 70, f2: 55, dur: 0.9, vol: 0.25, vib: 6, vibAmt: 10 }); },
    sneeze() { if (!ac || !on) return; const t = now(); tone({ t, f: 500, f2: 900, dur: 0.25, a: 0.18, vol: 0.12 }); noise({ t: t + 0.32, f: 3000, f2: 900, dur: 0.22, vol: 0.35 }); },
    click() { if (ac && on) tone({ f: 900, dur: 0.04, vol: 0.08, type: 'triangle' }); },
    hatch() { if (!ac || !on) return; const t = now(); noise({ t, f: 2500, type: 'highpass', dur: 0.15, vol: 0.4 }); [784, 988, 1175, 1568].forEach((f, i) => tone({ t: t + 0.15 + i * 0.1, f, dur: 0.4, vol: 0.16, type: 'triangle' })); },
    splash,
    // a wild animal calling from somewhere in the world
    wildCall(b, camPos, camYaw) {
      if (!ac || !on) return;
      const dx = b.pos.x - camPos.x, dz = b.pos.z - camPos.z, d = Math.hypot(dx, dz);
      if (d > 40) return;
      const pan = (dx * -Math.cos(camYaw) + dz * Math.sin(camYaw)) / Math.max(1, d);
      call(b, { vol: 0.45 / (1 + d / 6), pan: clamp(pan, -0.9, 0.9) });
    },
  };
  return api;
})();
