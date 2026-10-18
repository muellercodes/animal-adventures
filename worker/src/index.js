// Animal Adventures API: accounts, cloud saves, and live multiplayer.
// Runs on Cloudflare Workers with a D1 (SQLite) database. Nothing here pauses when idle.
// Multiplayer: one Durable Object per world relays where each signed-in player's animal is.
const ENC = new TextEncoder();
const NAME_RE = /^[A-Za-z0-9_-]{3,20}$/;
const DAY = 86400000;
const SESSION_MS = 365 * DAY;      // sessions last a year and renew while you keep playing
const RENEW_BELOW = 330 * DAY;
const MAX_SAVE = 64 * 1024;
const ITER = 100000;               // PBKDF2 iterations (the Workers runtime caps this at 100k)

const b64u = (buf) => { const b = new Uint8Array(buf); let s = ''; for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { s = s.replace(/-/g, '+').replace(/_/g, '/'); while (s.length % 4) s += '='; const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
const sha256 = async (s) => b64u(await crypto.subtle.digest('SHA-256', ENC.encode(s)));
const randToken = (n = 32) => b64u(crypto.getRandomValues(new Uint8Array(n)));
function safeEq(a, b) { if (a.length !== b.length) return false; let r = 0; for (let i = 0; i < a.length; i++) r |= a[i] ^ b[i]; return r === 0; }
async function pbkdf2(pass, salt, iter) {
  const key = await crypto.subtle.importKey('raw', ENC.encode(pass), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: iter }, key, 256));
}
async function hashPassword(pass) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2$${ITER}$${b64u(salt)}$${b64u(await pbkdf2(pass, salt, ITER))}`;
}
async function checkPassword(pass, stored) {
  const [kind, iter, salt, hash] = String(stored).split('$');
  if (kind !== 'pbkdf2') return false;
  return safeEq(await pbkdf2(pass, unb64u(salt), +iter), unb64u(hash));
}

class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }

function corsHeaders(req, env) {
  const origin = req.headers.get('Origin');
  if (!origin) return {};
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = allowed.includes(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
  if (!ok) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET,POST,PUT,OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type,Authorization', 'Access-Control-Max-Age': '86400', Vary: 'Origin' };
}
const json = (data, status, cors) => new Response(JSON.stringify(data), { status: status || 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...cors } });

async function body(req) {
  const len = +(req.headers.get('Content-Length') || 0);
  if (len > MAX_SAVE + 4096) throw new HttpError(413, 'That is too big.');
  const text = await req.text();
  if (text.length > MAX_SAVE + 4096) throw new HttpError(413, 'That is too big.');
  try { return JSON.parse(text || '{}'); } catch { throw new HttpError(400, 'Bad request.'); }
}

// simple fixed-window rate limit stored in D1
async function limit(env, key, max, windowMs) {
  const now = Date.now();
  const row = await env.DB.prepare('SELECT n, reset_at FROM limits WHERE k = ?').bind(key).first();
  if (!row || row.reset_at < now) { await env.DB.prepare('INSERT INTO limits (k, n, reset_at) VALUES (?, 1, ?) ON CONFLICT(k) DO UPDATE SET n = 1, reset_at = excluded.reset_at').bind(key, now + windowMs).run(); return; }
  if (row.n >= max) throw new HttpError(429, 'Too many tries. Take a break and try again in a few minutes.');
  await env.DB.prepare('UPDATE limits SET n = n + 1 WHERE k = ?').bind(key).run();
}

async function newSession(env, userId) {
  const token = randToken(), now = Date.now();
  await env.DB.prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)').bind(await sha256(token), userId, now, now + SESSION_MS).run();
  return token;
}
async function authUser(req, env) {
  const h = req.headers.get('Authorization') || '';
  const m = h.match(/^Bearer ([A-Za-z0-9_-]{20,100})$/);
  if (!m) throw new HttpError(401, 'Please sign in.');
  return authToken(m[1], env);
}
async function authToken(token, env) {
  const th = await sha256(token), now = Date.now();
  const row = await env.DB.prepare('SELECT s.user_id AS id, s.expires_at AS exp, u.name AS name FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?').bind(th).first();
  if (!row) throw new HttpError(401, 'Please sign in again.');
  if (row.exp < now) { await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(th).run(); throw new HttpError(401, 'Please sign in again.'); }
  if (row.exp - now < RENEW_BELOW) {
    await env.DB.batch([
      env.DB.prepare('UPDATE sessions SET expires_at = ? WHERE token_hash = ?').bind(now + SESSION_MS, th),
      env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(now, row.id),
    ]);
  }
  return { id: row.id, name: row.name, th };
}
const ip = (req) => req.headers.get('CF-Connecting-IP') || 'local';
function creds(b) {
  const username = String(b.username || '').trim(), password = String(b.password || '');
  if (!NAME_RE.test(username)) throw new HttpError(400, 'Names are 3 to 20 letters or numbers.');
  if (password.length < 6 || password.length > 128) throw new HttpError(400, 'Passwords need at least 6 characters.');
  return { username, password };
}

const routes = {
  'GET /api/health': async () => ({ ok: true, service: 'animal-adventures', time: Date.now() }),

  'POST /api/register': async (req, env) => {
    const { username, password } = creds(await body(req));
    await limit(env, 'reg:' + ip(req), 6, 3600000);
    const exists = await env.DB.prepare('SELECT id FROM users WHERE name = ?').bind(username).first();
    if (exists) throw new HttpError(409, 'That name is taken. Try another one.');
    const now = Date.now();
    const res = await env.DB.prepare('INSERT INTO users (name, pass, created_at, last_seen) VALUES (?, ?, ?, ?)').bind(username, await hashPassword(password), now, now).run();
    const id = res.meta.last_row_id;
    return { token: await newSession(env, id), user: { id, name: username } };
  },

  'POST /api/login': async (req, env) => {
    const { username, password } = creds(await body(req));
    const key = 'login:' + ip(req);
    const lim = await env.DB.prepare('SELECT n, reset_at FROM limits WHERE k = ?').bind(key).first();
    if (lim && lim.reset_at > Date.now() && lim.n >= 12) throw new HttpError(429, 'Too many tries. Take a break and try again in a few minutes.');
    const u = await env.DB.prepare('SELECT id, name, pass FROM users WHERE name = ?').bind(username).first();
    if (!u || !(await checkPassword(password, u.pass))) { await limit(env, key, 1000, 600000); throw new HttpError(401, "That name and password don't match."); }
    await env.DB.prepare('UPDATE users SET last_seen = ? WHERE id = ?').bind(Date.now(), u.id).run();
    return { token: await newSession(env, u.id), user: { id: u.id, name: u.name } };
  },

  'POST /api/logout': async (req, env) => {
    const u = await authUser(req, env);
    await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(u.th).run();
    return { ok: true };
  },

  'GET /api/me': async (req, env) => { const u = await authUser(req, env); return { user: { id: u.id, name: u.name } }; },

  'GET /api/save': async (req, env) => {
    const u = await authUser(req, env);
    const row = await env.DB.prepare('SELECT data, updated_at FROM saves WHERE user_id = ?').bind(u.id).first();
    return { save: row ? JSON.parse(row.data) : null, updated: row ? row.updated_at : null };
  },

  'PUT /api/save': async (req, env) => {
    const u = await authUser(req, env);
    const s = (await body(req)).save;
    if (!s || typeof s !== 'object' || Array.isArray(s) || s.v !== 1) throw new HttpError(400, "That doesn't look like an Animal Adventures save.");
    const data = JSON.stringify(s);
    if (data.length > MAX_SAVE) throw new HttpError(413, 'That save is too big.');
    const now = Date.now();
    await env.DB.prepare('INSERT INTO saves (user_id, data, updated_at) VALUES (?, ?, ?) ON CONFLICT(user_id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at').bind(u.id, data, now).run();
    return { ok: true, updated: now };
  },
};

/* ---- multiplayer ---- */
const WORLDS = ['land', 'forest', 'swamp', 'jungle', 'meadow', 'sky'];
const SPECIES = ['duck', 'swan', 'chicken', 'frog', 'lizard', 'snake', 'bunny', 'squirrel', 'hedgehog', 'turtle', 'pig', 'goat', 'fox', 'otter', 'raccoon', 'owl', 'deer', 'parrot', 'horse', 'moose'];
const MODES = ['ground', 'air', 'swim', 'fly', 'climb', 'perch', 'sleep'];
const MAX_IN_WORLD = 60;

// the browser can't send an Authorization header on a WebSocket, so the token rides in Sec-WebSocket-Protocol: "aa, <token>"
async function play(req, env, url) {
  if ((req.headers.get('Upgrade') || '').toLowerCase() !== 'websocket') return new Response('Expected a WebSocket.', { status: 426 });
  const origin = req.headers.get('Origin') || '';
  const allowed = String(env.ALLOWED_ORIGINS || '').split(',').map((x) => x.trim()).filter(Boolean);
  if (!allowed.includes(origin) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return new Response('Not allowed.', { status: 403 });
  const world = url.searchParams.get('w');
  if (!WORLDS.includes(world)) return new Response('Unknown world.', { status: 400 });
  const protos = (req.headers.get('Sec-WebSocket-Protocol') || '').split(',').map((x) => x.trim());
  const token = protos.find((x) => /^[A-Za-z0-9_-]{20,100}$/.test(x) && x !== 'aa');
  if (!token) return new Response('Please sign in.', { status: 401 });
  let user;
  try { user = await authToken(token, env); } catch (e) { return new Response('Please sign in again.', { status: 401 }); }
  const headers = new Headers(req.headers);
  headers.set('X-AA-User', String(user.id));
  const stub = env.WORLDS.get(env.WORLDS.idFromName(world));
  return stub.fetch(new Request(req.url, { headers }));
}
const num = (v, lo, hi, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d);
// only numbers and fixed words are relayed: no names or free text ever reach other players
function cleanState(m) {
  if (!m || typeof m !== 'object' || !SPECIES.includes(m.sp)) return null;
  const r = (v) => Math.round(v * 100) / 100;
  return {
    sp: m.sp, age: r(num(m.age, 0, 1, 1)), x: r(num(m.x, -1e6, 1e6)), y: r(num(m.y, -2000, 2000)), z: r(num(m.z, -1e6, 1e6)),
    yaw: r(num(m.yaw, -100, 100)), speed: r(num(m.speed, 0, 40)), vy: r(num(m.vy, -60, 60)), eat: r(num(m.eat, 0, 1)),
    mode: MODES.includes(m.mode) ? m.mode : 'ground', room: typeof m.room === 'string' && /^[A-Za-z0-9:_-]{0,40}$/.test(m.room) ? m.room : '',
  };
}

export class WorldRoom {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async fetch(req) {
    const uid = req.headers.get('X-AA-User') || '';
    const all = this.ctx.getWebSockets();
    // one animal per account in a world: a new tab replaces the old one
    for (const old of this.ctx.getWebSockets('u' + uid)) { try { old.close(4000, 'Playing somewhere else'); } catch (e) {} }
    if (all.length >= MAX_IN_WORLD) return new Response('This world is full right now.', { status: 503 });
    const pair = new WebSocketPair(), client = pair[0], server = pair[1];
    this.ctx.acceptWebSocket(server, ['u' + uid]);
    const id = crypto.randomUUID().slice(0, 8);
    server.serializeAttachment({ id, st: null, n: 0, win: Date.now() });
    const others = [];
    for (const ws of this.ctx.getWebSockets()) { if (ws === server) continue; const a = ws.deserializeAttachment(); if (a && a.st) others.push({ id: a.id, st: a.st }); }
    server.send(JSON.stringify({ type: 'hello', you: id, others }));
    return new Response(null, { status: 101, webSocket: client, headers: { 'Sec-WebSocket-Protocol': 'aa' } });
  }
  send(from, msg) {
    const text = JSON.stringify(msg);
    for (const ws of this.ctx.getWebSockets()) if (ws !== from) { try { ws.send(text); } catch (e) {} }
  }
  async webSocketMessage(ws, data) {
    if (typeof data !== 'string' || data.length > 600) return;
    const a = ws.deserializeAttachment(); if (!a) return;
    // at most 20 messages a second per player
    const now = Date.now();
    if (now - a.win > 1000) { a.win = now; a.n = 0; }
    if (++a.n > 20) { ws.serializeAttachment(a); return; }
    let m; try { m = JSON.parse(data); } catch (e) { return; }
    if (m.type === 'st') {
      const st = cleanState(m.st); if (!st) return;
      a.st = st; ws.serializeAttachment(a);
      this.send(ws, { type: 'st', id: a.id, st });
    } else if (m.type === 'call') {
      ws.serializeAttachment(a);
      if (a.st) this.send(ws, { type: 'call', id: a.id });
    } else ws.serializeAttachment(a);
  }
  async webSocketClose(ws, code) {
    const a = ws.deserializeAttachment();
    if (a) this.send(ws, { type: 'bye', id: a.id });
    try { ws.close(code === 1005 ? 1000 : code, 'bye'); } catch (e) {}
  }
  async webSocketError(ws) {
    const a = ws.deserializeAttachment();
    if (a) this.send(ws, { type: 'bye', id: a.id });
  }
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const url = new URL(req.url);
    if (url.pathname === '/api/play') return play(req, env, url);
    const route = routes[`${req.method} ${url.pathname}`];
    if (!route) return json({ error: 'Not found.' }, 404, cors);
    try { return json(await route(req, env), 200, cors); }
    catch (e) {
      if (e instanceof HttpError) return json({ error: e.message }, e.status, cors);
      console.error(e);
      return json({ error: 'Something went wrong. Try again.' }, 500, cors);
    }
  },
  // daily tidy-up: expired sessions and old rate-limit rows
  async scheduled(event, env) {
    const now = Date.now();
    await env.DB.batch([
      env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(now),
      env.DB.prepare('DELETE FROM limits WHERE reset_at < ?').bind(now),
    ]);
  },
};
