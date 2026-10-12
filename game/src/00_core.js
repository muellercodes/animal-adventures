/* ---------- core: constants, game data, math helpers ---------- */
const TAU = Math.PI * 2;
const DAY_LEN = 12 * 60, NIGHT_LEN = 10 * 60, CYCLE = DAY_LEN + NIGHT_LEN;
const WATER = 0;
const GRAV = 14;
const SAVE_KEY = 'animal-adventures-v1';
const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const damp = (a, b, rate, dt) => a + (b - a) * (1 - Math.exp(-rate * dt));
function angDiff(a, b) { let d = (b - a) % TAU; if (d > Math.PI) d -= TAU; if (d < -Math.PI) d += TAU; return d; }
function rng(seed) { let s = (seed >>> 0) || 1; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function hash2(x, z, s) {
  let h = Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(z | 0, 0x165667b1) ^ Math.imul(s | 0, 0x9e3779b1);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
// 2D gradient noise, roughly -1..1
function makeNoise(seed) {
  const r = rng(seed), p = new Uint16Array(512), gx = new Float32Array(256), gz = new Float32Array(256);
  const perm = []; for (let i = 0; i < 256; i++) perm.push(i);
  for (let i = 255; i > 0; i--) { const j = (r() * (i + 1)) | 0; const t = perm[i]; perm[i] = perm[j]; perm[j] = t; }
  for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
  for (let i = 0; i < 256; i++) { const a = r() * TAU; gx[i] = Math.cos(a); gz[i] = Math.sin(a); }
  const fade = (t) => t * t * t * (t * (t * 6 - 15) + 10);
  return (x, z) => {
    const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi, X = xi & 255, Z = zi & 255;
    const u = fade(xf), v = fade(zf);
    const aa = p[X + p[Z]], ab = p[X + p[Z + 1]], ba = p[X + 1 + p[Z]], bb = p[X + 1 + p[Z + 1]];
    const d00 = gx[aa] * xf + gz[aa] * zf, d10 = gx[ba] * (xf - 1) + gz[ba] * zf;
    const d01 = gx[ab] * xf + gz[ab] * (zf - 1), d11 = gx[bb] * (xf - 1) + gz[bb] * (zf - 1);
    return (d00 + (d10 - d00) * u + ((d01 + (d11 - d01) * u) - (d00 + (d10 - d00) * u)) * v) * 1.41;
  };
}
function fbm(n, x, z, oct = 4) { let s = 0, a = 0.5, f = 1, t = 0; for (let i = 0; i < oct; i++) { s += a * n(x * f + i * 31.7, z * f - i * 17.1); t += a; f *= 2.03; a *= 0.5; } return s / t; }
const linear = (hex) => new THREE.Color(hex).convertSRGBToLinear();

/* ---------- game data ---------- */
const FOODS = {
  apple: { name: 'Apples' }, worm: { name: 'Worms' }, smallfish: { name: 'Small fish', water: true }, fish: { name: 'Fish', water: true },
  grass: { name: 'Grass' }, berries: { name: 'Berries' }, carrot: { name: 'Carrots' }, pinecone: { name: 'Pine cones' }, acorn: { name: 'Acorns' },
};
// swim/fly/hop are what the animal can do; swimSpeed and flySpeed are m/s
const SPECIES = {
  duck: { name: 'Duck', many: 'Ducks', eats: ['worm', 'smallfish', 'grass', 'berries'], fav: 'smallfish', fly: true, swim: true, swimSpeed: 2.4, flySpeed: 10 },
  swan: { name: 'Swan', many: 'Swans', eats: ['grass', 'smallfish', 'berries'], fav: 'grass', fly: true, swim: true, swimSpeed: 2.4, flySpeed: 9 },
  chicken: { name: 'Chicken', many: 'Chickens', eats: ['worm', 'berries', 'acorn', 'grass', 'carrot'], fav: 'worm' },
  frog: { name: 'Tree frog', many: 'Tree frogs', eats: ['worm', 'smallfish'], fav: 'worm', swim: true, hop: true, swimSpeed: 1.8, hopV: 3.0 },
  lizard: { name: 'Lizard', many: 'Lizards', eats: ['worm', 'berries', 'apple'], fav: 'worm' },
  snake: { name: 'Garter snake', many: 'Garter snakes', eats: ['worm', 'smallfish', 'fish'], fav: 'fish', swim: true, swimSpeed: 1.8, noJump: true },
  bunny: { name: 'Bunny', many: 'Bunnies', eats: ['grass', 'carrot', 'apple', 'berries'], fav: 'carrot', hop: true, hopV: 3.3 },
  squirrel: { name: 'Squirrel', many: 'Squirrels', eats: ['acorn', 'pinecone', 'berries', 'apple'], fav: 'acorn', hop: true, hopV: 2.9, price: 40 },
  turtle: { name: 'Turtle', many: 'Turtles', eats: ['grass', 'berries', 'worm', 'smallfish'], fav: 'berries', swim: true, swimSpeed: 2.2, noJump: true, price: 60 },
  fox: { name: 'Fox', many: 'Foxes', eats: ['worm', 'berries', 'apple', 'smallfish'], fav: 'berries', price: 90, hunter: true },
  owl: { name: 'Owl', many: 'Owls', eats: ['worm', 'smallfish'], fav: 'worm', fly: true, nightEyes: true, flySpeed: 8, price: 120, hunter: true },
  deer: { name: 'Deer', many: 'Deer', eats: ['grass', 'acorn', 'apple', 'carrot'], fav: 'apple', price: 150 },
  parrot: { name: 'Parrot', many: 'Parrots', eats: ['berries', 'apple', 'acorn'], fav: 'berries', fly: true, flySpeed: 10, price: 200 },
  moose: { name: 'Moose', many: 'Moose', eats: ['grass', 'apple', 'carrot'], fav: 'grass', swim: true, swimSpeed: 2.2, price: 300 },
};
const STARTERS = ['duck', 'swan', 'chicken', 'frog', 'lizard', 'snake', 'bunny'];
const SHOP = ['squirrel', 'turtle', 'fox', 'owl', 'deer', 'parrot', 'moose'];
const SMALL_PREY = ['chicken', 'frog', 'lizard', 'bunny', 'squirrel', 'duck'];
const WORLD_ORDER = ['land', 'sky', 'forest', 'swamp', 'jungle', 'meadow'];
const PACKS = [{ id: 's', leaves: 100, price: '$0.99' }, { id: 'm', leaves: 300, price: '$1.99' }, { id: 'l', leaves: 1000, price: '$4.99' }];
const PEOPLE_NAMES = ['Maya', 'Leo', 'Nora', 'Sam', 'Ivy', 'Ben', 'Ruth', 'Omar', 'June', 'Eli', 'Hazel', 'Theo', 'Ada', 'Finn'];
const SKIN = ['#F3D3B8', '#E6B691', '#C98E66', '#9A6544', '#6B4430'];
const HAIR = ['#2B1E16', '#5A3A22', '#A8692E', '#D9B66A', '#8B2E1F', '#1E1E1E', '#B8B2A8'];
const SHIRT = ['#3F6FB8', '#C9533A', '#D9A43A', '#7A55A8', '#3E8E6E', '#C9577F', '#E8E2D4', '#55606B'];
const PANTS = ['#2F3E5E', '#4A4A4A', '#6B4A2B', '#2E5A7A', '#6E6A5A'];
const SHOES = ['#2A2A2A', '#5A3A22', '#E8E8E8', '#7A2E2E'];

/* ---------- save state ---------- */
const fresh = () => ({ v: 1, d3: true, saved: 0, leaves: 0, owned: [], animal: 'duck', world: 'land', visited: [], time: 120, hunger: 100, x: null, z: null, started: false });
const S = fresh();
