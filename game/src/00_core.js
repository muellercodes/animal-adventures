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
  pumpkin: { name: 'Pumpkins' },
  // round 7: more kinds of food (where they show up: 50_world foodPoint)
  seeds: { name: 'Seeds' }, corn: { name: 'Corn' }, lettuce: { name: 'Lettuce' }, mushroom: { name: 'Mushrooms' }, bugs: { name: 'Bugs' },
  twigs: { name: 'Leafy twigs' }, watermelon: { name: 'Watermelon' }, banana: { name: 'Bananas' }, bread: { name: 'Bread' },
  hotdog: { name: 'Hot dogs' }, petfood: { name: 'Pet food' }, hay: { name: 'Hay' },
};
// swim/fly/hop/climb are what the animal can do; swimSpeed and flySpeed are m/s
// egg: hatches from an egg (shell color); outdoor: when adopted it lives in a pen in the yard instead of inside the house
const SPECIES = {
  duck: { name: 'Duck', many: 'Ducks', eats: ['worm', 'smallfish', 'grass', 'berries', 'bread', 'seeds', 'bugs', 'corn', 'lettuce'], fav: 'smallfish', fly: true, swim: true, swimSpeed: 2.4, flySpeed: 10, egg: 0xdfe8d8, outdoor: true, baby: 'Duckling' },
  swan: { name: 'Swan', many: 'Swans', eats: ['grass', 'smallfish', 'berries', 'bread', 'lettuce', 'corn'], fav: 'grass', fly: true, swim: true, swimSpeed: 2.4, flySpeed: 9, egg: 0xe8e4da, outdoor: true, baby: 'Cygnet' },
  chicken: { name: 'Chicken', many: 'Chickens', eats: ['worm', 'berries', 'acorn', 'grass', 'carrot', 'pumpkin', 'seeds', 'corn', 'bugs', 'bread', 'lettuce', 'watermelon'], fav: 'worm', egg: 0xc8946a, outdoor: true, baby: 'Chick' },
  frog: { name: 'Tree frog', many: 'Tree frogs', eats: ['worm', 'smallfish', 'bugs'], fav: 'worm', swim: true, hop: true, climb: true, swimSpeed: 1.8, hopV: 3.0, baby: 'Froglet' },
  lizard: { name: 'Lizard', many: 'Lizards', eats: ['worm', 'berries', 'apple', 'bugs', 'lettuce', 'banana'], fav: 'worm', climb: true, egg: 0xf0ece0, baby: 'Baby lizard' },
  snake: { name: 'Garter snake', many: 'Garter snakes', eats: ['worm', 'smallfish', 'fish', 'bugs'], fav: 'fish', swim: true, swimSpeed: 1.8, noJump: true, baby: 'Baby snake' },
  bunny: { name: 'Bunny', many: 'Bunnies', eats: ['grass', 'carrot', 'apple', 'berries', 'lettuce', 'hay', 'corn'], fav: 'carrot', hop: true, hopV: 3.3, baby: 'Baby bunny' },
  squirrel: { name: 'Squirrel', many: 'Squirrels', eats: ['acorn', 'pinecone', 'berries', 'apple', 'pumpkin', 'seeds', 'corn', 'mushroom'], fav: 'acorn', hop: true, climb: true, hopV: 2.9, price: 150, baby: 'Baby squirrel' },
  hedgehog: { name: 'Hedgehog', many: 'Hedgehogs', eats: ['worm', 'berries', 'apple', 'bugs', 'petfood', 'mushroom'], fav: 'worm', noJump: true, price: 200, baby: 'Hoglet' },
  turtle: { name: 'Turtle', many: 'Turtles', eats: ['grass', 'berries', 'worm', 'smallfish', 'lettuce', 'mushroom', 'watermelon', 'bugs', 'banana'], fav: 'berries', swim: true, swimSpeed: 2.2, noJump: true, price: 250, egg: 0xf2efe6, baby: 'Baby turtle' },
  pig: { name: 'Pig', many: 'Pigs', eats: ['apple', 'carrot', 'acorn', 'grass', 'pumpkin', 'worm', 'corn', 'bread', 'watermelon', 'mushroom', 'lettuce', 'banana'], fav: 'pumpkin', price: 300, outdoor: true, baby: 'Piglet' },
  goat: { name: 'Goat', many: 'Goats', eats: ['grass', 'apple', 'carrot', 'berries', 'pumpkin', 'hay', 'twigs', 'corn', 'lettuce', 'banana', 'bread'], fav: 'apple', price: 350, outdoor: true, baby: 'Kid goat' },
  fox: { name: 'Fox', many: 'Foxes', eats: ['worm', 'berries', 'apple', 'smallfish', 'bugs', 'hotdog', 'bread'], fav: 'berries', price: 400, hunter: true, baby: 'Fox kit' },
  weasel: { name: 'Weasel', many: 'Weasels', eats: ['worm', 'carrot', 'smallfish', 'berries', 'bugs'], fav: 'carrot', price: 250, baby: 'Weasel kit' },
  otter: { name: 'Otter', many: 'Otters', eats: ['fish', 'smallfish', 'worm', 'bugs'], fav: 'fish', swim: true, swimSpeed: 4.2, price: 450, baby: 'Otter pup' },
  raccoon: { name: 'Raccoon', many: 'Raccoons', eats: ['berries', 'apple', 'worm', 'smallfish', 'acorn', 'pumpkin', 'corn', 'bread', 'hotdog', 'petfood', 'watermelon', 'banana', 'bugs', 'mushroom'], fav: 'apple', climb: true, price: 500, baby: 'Raccoon kit' },
  owl: { name: 'Owl', many: 'Owls', eats: ['worm', 'smallfish', 'bugs'], fav: 'worm', fly: true, nightEyes: true, flySpeed: 8, price: 600, hunter: true, egg: 0xf4f2ee, baby: 'Owlet' },
  deer: { name: 'Deer', many: 'Deer', eats: ['grass', 'acorn', 'apple', 'carrot', 'pumpkin', 'twigs', 'corn', 'mushroom', 'lettuce', 'hay'], fav: 'apple', price: 800, outdoor: true, baby: 'Fawn' },
  parrot: { name: 'Parrot', many: 'Parrots', eats: ['berries', 'apple', 'acorn', 'seeds', 'banana', 'corn', 'watermelon'], fav: 'berries', fly: true, flySpeed: 10, price: 1000, egg: 0xf6f3ec, baby: 'Parrot chick' },
  horse: { name: 'Horse', many: 'Horses', eats: ['grass', 'apple', 'carrot', 'pumpkin', 'hay', 'corn', 'watermelon'], fav: 'carrot', price: 1200, outdoor: true, baby: 'Foal' },
  moose: { name: 'Moose', many: 'Moose', eats: ['grass', 'apple', 'carrot', 'twigs', 'lettuce'], fav: 'grass', swim: true, swimSpeed: 2.2, price: 1500, outdoor: true, baby: 'Moose calf' },
  dog: { name: 'Dog', many: 'Dogs', eats: ['fish', 'apple', 'carrot', 'worm', 'pumpkin', 'petfood', 'hotdog', 'bread', 'watermelon'], fav: 'fish', swim: true, swimSpeed: 2.0, price: 350, baby: 'Puppy' },
  cat: { name: 'Cat', many: 'Cats', eats: ['smallfish', 'fish', 'worm', 'bugs', 'petfood'], fav: 'smallfish', climb: true, price: 300, baby: 'Kitten' },
};
const STARTERS = ['duck', 'swan', 'chicken', 'frog', 'lizard', 'snake', 'bunny'];
const SHOP = ['squirrel', 'hedgehog', 'weasel', 'turtle', 'pig', 'cat', 'goat', 'dog', 'fox', 'otter', 'raccoon', 'owl', 'deer', 'parrot', 'horse', 'moose'];
const SMALL_PREY = ['chicken', 'frog', 'lizard', 'bunny', 'squirrel', 'duck', 'hedgehog', 'weasel'];
const WORLD_ORDER = ['land', 'sky', 'forest', 'swamp', 'jungle', 'meadow'];
const PACKS = [{ id: 's', leaves: 100, price: '$0.99' }, { id: 'm', leaves: 300, price: '$1.99' }, { id: 'l', leaves: 1000, price: '$4.99' }];
const PEOPLE_NAMES = ['Maya', 'Leo', 'Nora', 'Sam', 'Ivy', 'Ben', 'Ruth', 'Omar', 'June', 'Eli', 'Hazel', 'Theo', 'Ada', 'Finn'];
const SKIN = ['#F3D3B8', '#E6B691', '#C98E66', '#9A6544', '#6B4430'];
const HAIR = ['#2B1E16', '#5A3A22', '#A8692E', '#D9B66A', '#8B2E1F', '#1E1E1E', '#B8B2A8'];
const SHIRT = ['#3F6FB8', '#C9533A', '#D9A43A', '#7A55A8', '#3E8E6E', '#C9577F', '#E8E2D4', '#55606B'];
const PANTS = ['#2F3E5E', '#4A4A4A', '#6B4A2B', '#2E5A7A', '#6E6A5A'];
const SHOES = ['#2A2A2A', '#5A3A22', '#E8E8E8', '#7A2E2E'];

/* ---------- save state ---------- */
// ages: species -> 0 (newborn) .. 1 (grown up). names: nicknames. homes: species -> the person who adopted it.
const fresh = () => ({ v: 1, d3: true, saved: 0, leaves: 0, owned: [], animal: 'duck', world: 'land', visited: [], time: 120, hunger: 100, x: null, z: null, started: false,
  ages: {}, names: {}, homes: {}, sick: 0, hatched: [], treats: {}, sound: true, music: true });
const ADULT_AT = 1, FLY_AGE = 0.6;
const ageOf = (sp) => (S.ages[sp] === undefined ? 1 : S.ages[sp]);
const nameOf = (sp) => S.names[sp] || SPECIES[sp].name;
const stageName = (sp) => { const a = ageOf(sp); return a < 0.4 ? SPECIES[sp].baby : a < 1 ? 'Young ' + SPECIES[sp].name.toLowerCase() : SPECIES[sp].name; };
// what day of the year is it (for holidays)
const TODAY = (() => { const m = /date=(\d{4}-\d{2}-\d{2})/.exec(location.hash); return m ? new Date(m[1] + 'T12:00:00') : /assets/.test(location.hash) ? new Date(2026, 6, 1, 12) : new Date(); })();
const HOLIDAY = (() => { const m = TODAY.getMonth() + 1, d = TODAY.getDate(); if (m === 10 || (m === 11 && d <= 2)) return 'halloween'; return null; })();
const AUTUMN = (() => { const m = TODAY.getMonth() + 1, d = TODAY.getDate(); return (m === 9 && d >= 20) || m === 10 || (m === 11 && d <= 20); })();
const S = fresh();
