/* ---------- multiplayer: everyone signed in walks around together ----------
   One WebSocket per world to the game server. Only numbers and the animal kind are shared:
   other players show up as their animal with a label like "Bunny", never a name. */
const Net = {
  ws: null, world: null, token: null, you: null, open: false, others: new Map(),
  sendT: 0, beatT: 0, last: '', retry: 0, retryT: 0, blocked: false,
  wanted() { return !!(API && cloud.token && R.mode === 'play' && G.world && S.started); },
  update(dt) {
    if (!this.wanted() || this.blocked) { if (this.ws) this.close(); this.retryT = 0; return; }
    if (this.ws && (this.world !== S.world || this.token !== cloud.token)) this.close();
    if (!this.ws) { this.retryT -= dt; if (this.retryT <= 0) this.connect(); }
    if (this.open) this.sendState(dt);
    this.drawOthers(dt);
  },
  connect() {
    this.world = S.world; this.token = cloud.token;
    let ws;
    try { ws = new WebSocket(API.replace(/^http/, 'ws') + '/api/play?w=' + encodeURIComponent(this.world), ['aa', cloud.token]); }
    catch (e) { this.retryT = 10; return; }
    this.ws = ws;
    ws.onopen = () => { if (ws !== this.ws) return; this.open = true; this.retry = 0; this.last = ''; this.sendT = 0; };
    ws.onmessage = (e) => { if (ws === this.ws) this.receive(e.data); };
    ws.onclose = (e) => {
      if (ws !== this.ws) return;
      this.ws = null; this.open = false; this.clearOthers();
      // replaced by another tab: stay off in this one; otherwise try again, waiting longer each time
      if (e.code === 4000) { this.blocked = true; UI.toast('You are playing online in another window.'); return; }
      this.retry++; this.retryT = Math.min(30, 2 * Math.pow(1.6, this.retry));
    };
    ws.onerror = () => {};
  },
  close() { const ws = this.ws; this.ws = null; this.open = false; this.clearOthers(); if (ws) { try { ws.close(1000); } catch (e) {} } },
  // where am I: outdoors, or which room (rooms out in the wilds are named after their landmark)
  roomKey(rm) { if (!rm) return ''; const h = rm.house; return h ? (h.own ? h.own.key + ':' + h.kind : 'h' + h.id) : 'r'; },
  state() {
    const b = Player.b; if (!b) return null;
    const r = (v) => Math.round(v * 100) / 100;
    return { sp: b.sp, age: r(b.age), x: r(b.pos.x), y: Math.round(b.pos.y * 10) / 10, z: r(b.pos.z), yaw: r(b.yaw), speed: r(b.speed), vy: r(b.vy), eat: r(b.eat), mode: b.mode, room: this.roomKey(b.room) };
  },
  sendState(dt) {
    this.sendT -= dt; this.beatT -= dt;
    const st = this.state(); if (!st) return;
    const key = JSON.stringify(st);
    if (this.sendT > 0) return;                       // at most about 8 a second
    if (key === this.last && this.beatT > 0) return;  // nothing new: just a hello every 5 seconds
    this.last = key; this.sendT = 0.12; this.beatT = 5;
    this.raw({ type: 'st', st });
  },
  sendCall() { if (this.open) this.raw({ type: 'call' }); },
  raw(m) { try { this.ws.send(JSON.stringify(m)); } catch (e) {} },
  receive(text) {
    let m; try { m = JSON.parse(text); } catch (e) { return; }
    if (m.type === 'hello') { this.you = m.you; for (const o of m.others || []) this.setState(o.id, o.st); }
    else if (m.type === 'st') this.setState(m.id, m.st);
    else if (m.type === 'bye') this.drop(m.id);
    else if (m.type === 'call') { const o = this.others.get(m.id); if (o && o.b.rig.root.visible) Sound.wildCall(o.b, camera.position, Cam.yaw); }
  },
  setState(id, st) {
    if (!st || !SPECIES[st.sp]) return;
    let o = this.others.get(id);
    if (o && (o.sp !== st.sp || Math.abs(o.age - st.age) > 0.05)) { this.drop(id); o = null; }
    if (!o) {
      const b = newBody(st.sp, st.age);
      b.remote = true; if (b.rig.setDetail) b.rig.setDetail(1);
      b.pos.set(st.x, st.y, st.z); b.yaw = st.yaw;
      G.scene.add(b.rig.root);
      o = { id, b, sp: st.sp, age: st.age, st, t: 0, tag: null };
      this.others.set(id, o);
    }
    o.st = st; o.t = 0;
  },
  drop(id) { const o = this.others.get(id); if (!o) return; G.scene.remove(o.b.rig.root); if (o.tag) o.tag.remove(); this.others.delete(id); },
  clearOthers() { for (const id of [...this.others.keys()]) this.drop(id); },
  // glide each animal toward where its player said it is (and a little ahead, so it doesn't stutter)
  drawOthers(dt) {
    const P = Player.b, here = this.roomKey(P && P.room), w = G.world;
    for (const o of this.others.values()) {
      const b = o.b, st = o.st;
      o.t += dt;
      if (o.t > 25) { this.drop(o.id); continue; }
      const show = st.room === here && Math.hypot(st.x - camera.position.x, st.z - camera.position.z) < 170;
      b.rig.root.visible = show;
      if (!show) { b.pos.set(st.x, st.y, st.z); continue; }
      const ahead = Math.min(o.t, 0.3) * st.speed, tx = st.x + Math.sin(st.yaw) * ahead, tz = st.z + Math.cos(st.yaw) * ahead;
      const far = Math.hypot(tx - b.pos.x, tz - b.pos.z) > 12;
      const k = far ? 1 : 1 - Math.exp(-10 * dt);
      b.pos.x += (tx - b.pos.x) * k; b.pos.z += (tz - b.pos.z) * k;
      const ground = st.mode === 'ground' || st.mode === 'sleep' ? w.H(b.pos.x, b.pos.z) : null;
      b.pos.y = ground !== null && ground > -100 ? ground : b.pos.y + (st.y - b.pos.y) * k;
      const turn = angDiff(b.yaw, st.yaw); b.yaw += far ? turn : turn * (1 - Math.exp(-10 * dt));
      b.turn = damp(b.turn, turn / Math.max(dt, 0.001) * 0.1, 6, dt);
      b.speed = st.speed; b.mode = st.mode; b.vy = st.vy; b.eat = st.eat;
      b.idle = b.speed < 0.06 ? b.idle + dt : 0;
      poseBody(b, dt, true);
    }
  },
  count() { let n = 0; for (const o of this.others.values()) n++; return n; },
};
