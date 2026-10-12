# Animal Adventures

A game by Rosemary. Pick an animal, eat food, earn leaves, and explore six worlds in 3D. It runs in the browser on a tablet, phone or computer.

**Play it:** https://muellercodes.github.io/animal-adventures/

## How it plays

- **Start animals:** duck, swan, chicken, tree frog, lizard (black with yellow spots), garter snake and bunny. All of them are free, and you can switch any time.
- **Real animal moves:** bunnies, frogs and squirrels hop, snakes slither, ducks waddle and paddle, and the duck, swan, owl and parrot can fly. Animals that swim can go in the water, where the fish are.
- **Food:** apples fall under apple trees, acorns under oaks, pine cones under pines, berries by bushes, carrots grow in the garden and fish swim in the ponds. Food your animal can eat glows. Walk up to it and tap Eat. Every animal has a favorite food that's worth more. Food your animal can't eat does nothing to you.
- **Leaves:** leaves are the money in the game. You earn them by eating (1 leaf, or 2 for a favorite) and by finding a new world for the first time (10 leaves).
- **Shop:** spend leaves on more animals: squirrel, turtle, fox, owl, deer, parrot and moose. There's also a pretend leaf store where you can "buy" leaf packs. A grown-up has to answer a times-table question first, and no real money is involved.
- **Worlds:** Land (a farm with a barn, garden, orchard and pond), Sky Lands (floating islands, only for animals that fly), Forest, Swamp, Jungle and Meadow.
- **Wild animals:** each world has wild animals that wander, graze, rest at night and run (or fly) away if something big comes at them too fast. Play as the same kind of animal and some of them will tag along with you.
- **Day and night:** a day lasts 12 minutes and a night lasts 10. The sun moves across the sky, sunsets glow, and at night the stars and fireflies come out. Owls can see better in the dark.
- **People:** friendly people walk around the Land and the Meadow. They crouch down and ask if your animal will be their pet. Say yes and your person follows you around, pets you and brings you snacks.

## Controls

On a phone or tablet: drag on the left side to walk (push farther to run), drag on the right side to look around, pinch to zoom. Tap Jump, and tap it again in the air to fly. While flying, hold Flap to go up and Land to come down.

On a computer: WASD or the arrow keys to walk, Shift to walk slowly, Space to jump (press again in the air to fly, hold to flap up), E to eat, C to land, drag with the mouse to look around and scroll to zoom.

## Saves

The game saves on the device by itself. If you make an account (a name and a password, no email), your game also saves online so you can keep playing on another device. The newest save wins.

The backend is a tiny [Cloudflare Worker](worker/src/index.js) with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, the same setup as [Emberblood](https://github.com/muellercodes/emberblood). It fits in Cloudflare's free tier and doesn't get paused or deleted when nobody plays for a while. Passwords are hashed with PBKDF2-SHA256, sessions are random tokens stored only as hashes, and nothing personal is collected.

## Project layout

```
game/shell.html         page markup and styles
game/src/00_core.js     game data (animals, food, prices) and helpers
game/src/35_envkit.js   3D scenery: trees, plants, barn, grass, water, sky, clouds, food
game/src/40_animals.js  the 14 animals as 3D models with walk, hop, swim, fly and eat animation
game/src/45_people.js   the people
game/src/50_world.js    the six worlds: terrain, water, where things grow
game/src/60_actors.js   movement, wild animal and people behavior, food
game/src/70_game.js     rendering, camera, controls, day and night, menus, saves
game/vendor/            three.js r149
game/assets/            pre-rendered menu pictures (made by tools/assets.py)
game/config.json        address of the cloud save API
build.mjs               builds docs/index.html
docs/                   the published site (GitHub Pages serves this folder)
worker/                 Cloudflare Worker API + D1 schema
```

Everything 3D is built from code when the game loads (no model or texture files), using [three.js](https://threejs.org).

## Building

```bash
node build.mjs                                   # uses game/config.json
API_BASE=http://127.0.0.1:8787 node build.mjs    # point at a local worker
API_BASE= node build.mjs                         # no cloud saves
```

Then open `docs/index.html`, or serve the folder (`npx serve docs`).

To redraw the animal icons and world pictures in the menus after changing a model or a world:

```bash
NO_ASSETS=1 API_BASE= node build.mjs && python3 tools/assets.py && node build.mjs
```

## Running the backend

```bash
cd worker
npm install
npx wrangler login
npx wrangler d1 create animal-adventures        # copy the database_id into wrangler.toml
npx wrangler d1 execute animal-adventures --remote --file=schema.sql
npx wrangler deploy
```

The live game uses `https://animal-adventures-api.muellercodes.workers.dev`. Allowed browser origins are set by `ALLOWED_ORIGINS` in `wrangler.toml` (localhost is always allowed for testing).

## License

MIT. See [LICENSE](LICENSE).
