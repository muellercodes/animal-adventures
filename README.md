# Animal Adventures

A game by Rosemary. Pick an animal, eat food, earn leaves, and explore six worlds in 3D. It runs in the browser on a tablet, phone or computer.

**Play it:** https://muellercodes.github.io/animal-adventures/

## How it plays

- **Start animals:** duck, swan, chicken, tree frog, lizard (black with yellow spots), garter snake and bunny. All of them are free, and you can switch any time.
- **Growing up:** every new animal starts as a baby. Birds, frogs, lizards and turtles hatch from an egg (tap to crack it open), and the others are born. Babies grow by eating, and a bird has to be more than half grown before it can fly. You can give each animal a nickname.
- **Real animal moves:** bunnies, frogs and squirrels hop, snakes slither, ducks waddle and paddle, and the duck, swan, owl and parrot can fly. Animals that swim can go in the water, where the fish are. Frogs, lizards, squirrels and raccoons can climb trees.
- **Taking care of your animal:** your tummy goes down over time. If it stays empty too long your animal catches a cold (sneezing, no running or flying) until it eats, sleeps or sees the vet.
- **Food:** apples fall under apple trees, acorns under oaks, pine cones under pines, berries by bushes, carrots grow in the garden and fish swim in the ponds. Food your animal can eat glows. Walk up to it and tap Eat. Every animal has a favorite food that's worth more. Food your animal can't eat does nothing to you.
- **Leaves:** leaves are the money in the game. You earn them by eating (1 leaf, or 2 for a favorite) and by finding a new world for the first time (10 leaves).
- **Shop:** spend leaves on 13 more animals, from a squirrel (150 leaves) up to a horse and a moose. The others are a hedgehog, turtle, pig, goat, fox, otter, raccoon, owl, deer and parrot. There's also a pretend leaf store where you can "buy" leaf packs. A grown-up has to answer a times-table question first, and no real money is involved.
- **Worlds:** Land (a farm with a barn, garden, orchard, pond and lake, plus a village on Maple Street), Sky Lands (floating islands, only for grown-up animals that fly), Forest, Swamp, Jungle and Meadow. The worlds are bigger now, with lakes, ponds, giant trees and more kinds of trees (oak, maple, birch, willow, pine, palm).
- **Wild animals:** each world has wild animals that wander, graze, rest at night and run (or fly) away if something big comes at them too fast. Play as the same kind of animal and some of them will tag along with you.
- **Day and night:** a day lasts 12 minutes and a night lasts 10. The sun moves across the sky, sunsets glow, and at night the stars and fireflies come out. Owls can see better in the dark.
- **People:** friendly people walk around the Land and the Meadow. They crouch down and ask if your animal will be their pet. Say yes and your person follows you around, pets you and brings you snacks.
- **Homes:** when someone adopts you, you get a home in the village. Small animals become indoor pets with a bed and a food bowl inside the house. Farm animals (duck, swan, chicken, pig, goat, deer, horse, moose) are outdoor pets with a pen in the back yard. The Home button takes you there, and you can sleep in your bed to skip the night.
- **Houses and the animal pound:** you can walk into the houses during the day. At the end of Maple Street is the animal pound, with animals in cages, a vet who makes sick animals better, and pens. Wait in a pen and a visitor may come to adopt you.
- **Holidays:** in the fall the leaves change color and drift down. From October 1 to November 2 there are pumpkins and jack-o'-lanterns, and at night you can go trick or treating at the houses for candy.
- **Sound:** animal calls, footsteps, wind, birds, crickets, frogs and a little music, all made by the game itself. Both can be turned off in Settings.

## Controls

On a phone or tablet: drag on the left side to walk (push farther to run), drag on the right side to look around, pinch to zoom. Tap Jump, and tap it again in the air to fly. While flying, hold Flap to go up and Land to come down. A purple button shows up when there's something to do right where you are (Go in, Go home, Sleep, Climb, Trick or treat, See the vet). Call makes your animal's sound.

On a computer: WASD or the arrow keys to walk, Shift to walk slowly, Space to jump (press again in the air to fly, hold to flap up), E to eat, F to do the purple-button thing, V to call, C to land, drag with the mouse to look around and scroll to zoom.

## Saves

The game saves on the device by itself, and a small "Saved" sign shows when it does. If you make an account (a name and a password, no email), your game also saves online so you can keep playing on another device. The newest save wins.

The backend is a tiny [Cloudflare Worker](worker/src/index.js) with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, the same setup as [Emberblood](https://github.com/muellercodes/emberblood). It fits in Cloudflare's free tier and doesn't get paused or deleted when nobody plays for a while. Passwords are hashed with PBKDF2-SHA256, sessions are random tokens stored only as hashes, and nothing personal is collected.

## Project layout

```
game/shell.html         page markup and styles
game/src/00_core.js     game data (animals, food, prices) and helpers
game/src/35_envkit.js   3D scenery: trees, plants, barn, grass, water, sky, clouds, food
game/src/35_envkit.js   (also houses and rooms, the pound, pens, pumpkins, nests and eggs)
game/src/40_animals.js  the 20 animals as 3D models (grown-up and baby) with walk, hop, swim, fly, climb and eat animation
game/src/45_people.js   the people
game/src/50_world.js    the six worlds: terrain, water, where things grow, the village
game/src/60_actors.js   movement, wild animal and people behavior, homes, food
game/src/65_audio.js    all the sounds and music (Web Audio, made in code)
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
