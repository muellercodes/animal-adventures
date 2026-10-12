# Animal Adventures

A game by Rosemary. Pick an animal, eat food, earn leaves, and explore six worlds. It runs in the browser on a tablet, phone or computer.

**Play it:** https://muellercodes.github.io/animal-adventures/

## How it plays

- **Start animals:** duck, swan, chicken, tree frog, lizard (black with yellow spots), garter snake and bunny. All of them are free, and you can switch any time.
- **Food:** apples, worms, small fish, fish, grass, berries, carrots, pine cones and acorns. Each animal eats different things, and food your animal can eat glows. Every animal has a favorite food that's worth more.
- **Leaves:** leaves are the money in the game. You earn them by eating (1 leaf, or 2 for a favorite) and by finding a new world for the first time (10 leaves).
- **Shop:** spend leaves on more animals: squirrel, turtle, fox, owl, deer, parrot and moose. There's also a pretend leaf store where you can "buy" leaf packs. A grown-up has to answer a times-table question first, and no real money is involved.
- **Worlds:** Land, Sky Lands, Forest, Swamp, Jungle and Meadow. Only animals that fly can go to the Sky Lands. Animals that swim (or fly) can go in the water, which is where the fish are.
- **Day and night:** a day lasts 12 minutes and a night lasts 10. At night it gets dark and the fireflies come out. Owls can see farther in the dark.
- **People:** friendly people walk around the Land and the Meadow and want animals as pets. Say yes and your person follows you around and brings you snacks.

Tap or drag to walk. On a computer, the arrow keys or WASD work too.

## Saves

The game saves on the device by itself. If you make an account (a name and a password, no email), your game also saves online so you can keep playing on another device. The newest save wins.

The backend is a tiny [Cloudflare Worker](worker/src/index.js) with a [D1](https://developers.cloudflare.com/d1/) (SQLite) database, the same setup as [Emberblood](https://github.com/muellercodes/emberblood). It fits in Cloudflare's free tier and doesn't get paused or deleted when nobody plays for a while. Passwords are hashed with PBKDF2-SHA256, sessions are random tokens stored only as hashes, and nothing personal is collected.

## Project layout

```
game/game.html   the whole game (markup, styles and script in one file)
game/config.json address of the cloud save API
build.mjs        builds docs/index.html
docs/            the published site (GitHub Pages serves this folder)
worker/          Cloudflare Worker API + D1 schema
```

## Building

```bash
node build.mjs                                   # uses game/config.json
API_BASE=http://127.0.0.1:8787 node build.mjs    # point at a local worker
API_BASE= node build.mjs                         # no cloud saves
```

Then open `docs/index.html`, or serve the folder (`npx serve docs`).

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
