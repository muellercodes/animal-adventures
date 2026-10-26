# Sculpted animal models (Blender pipeline)

Makes a realistic body for one species with Blender, fitted to the skeleton the game already uses, and writes it to
`game/models/<id>.*`. `build.mjs` embeds those files in the page and `game/src/40_animals.js` uses the model instead of
the procedural loft body. Everything else (bones, walk/run/eat/sleep animation, baby proportions, eyes and blinking,
collar, moods, swimming) keeps working through the same rig API. The pig (bare skin) and the horse (coat, mane and
tail) have models so far; `horse.py` is the example for furry animals.

Nothing is downloaded: the shape, skin colors and fine detail are all made by the scripts here.

## Setup

- Blender as a Python module (5.2) plus numpy, scipy, scikit-image and pillow in the same Python:
  `uv pip install --python <that python> scikit-image scipy pillow`
- Node and Playwright with Chromium (the same as `tools/assets.py`), for the export from the game.

## Run

```bash
BLENDER_PY=/path/to/python-with-bpy python3 tools/blender/make.py pig            # all steps, about 10 minutes
BLENDER_PY=... python3 tools/blender/make.py pig texture export                 # only some steps
VOXEL=0.003 BLENDER_PY=... python3 tools/blender/make.py pig sculpt export      # faster, coarser sculpt for trying things
BLENDER_PY=... python3 tools/blender/preview.py pig                             # Cycles renders of the sculpt
VOXEL=0.004 TRIS=6500 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py horse   # the horse as shipped, about 12 minutes
```

Then rebuild the game, and redraw the menu icons for the species (from a build made with `NO_ASSETS=1`):

```bash
NO_ASSETS=1 API_BASE= node build.mjs && python3 tools/assets.py pig && node build.mjs
```

`NO_MODELS=1 node build.mjs` builds the game with the procedural bodies only (for before/after comparisons).

## Steps

| step | script | what it does |
| --- | --- | --- |
| rig | `export_rig.py` | builds the game without models and exports the species' skeleton (bone names, parents, rest positions), eyes, mouth and procedural mesh with its skin weights to `work/<id>-rig.json` |
| sculpt | `sculpt.py` | evaluates the species' signed distance field (`<id>.py`) on a 2 mm voxel grid (+x half, mirrored), meshes it with marching cubes, remeshes small features (eyes, snout, hooves, ears) at 0.6 to 1 mm for baking, adds the tail tube |
| lowpoly | `lowpoly.py` | decimates to the game budget (about 6k triangles, more kept on the eyes, snout and hooves), keeps the +x half and unwraps it (the other half mirrors it, so both sides share texels; per region with the species' `uv_regions()`, islands scaled by `uv_weight()` when `UV_AVERAGE` is on), packs a separate tail island, transfers skin weights from the procedural mesh (or Blender automatic weights with `WEIGHTS=heat`), smooths them and applies species fixes |
| bake | `bake.py` | Cycles bakes the sculpt's surface position and normal (2048) and ambient occlusion (1024) onto the game mesh's UVs |
| texture | `texture.py` | rasterizes the UV layout, paints the skin (`paint()`), adds pores, wrinkles and bristles as a height field (`detail()`) and encodes normals for three.js' normal mapping without tangents (the per-triangle frame it builds from screen derivatives), so the game shades exactly what was baked |
| export | `export.py` | writes `game/models/<id>.json`, `<id>.bin` (format 2, see below) and WebP maps: color, normal, and for furry species fur (length, density) and hair (strand texture of the hair cards, with alpha) |

## Model data (format 2, `modelpack.py`)

`<id>.bin` holds only the +x half of the body; the game makes the mirrored half when it loads the model (x negated,
left and right bones swapped). Vertices are numbered by first use, each attribute is stored as byte planes with
delta coding, and the whole thing is deflated (the game has a small synchronous inflater). For the pig that is 38 KB
instead of 140 KB. Optional blocks: fur (comb direction and fur length per vertex) and hair cards (their own mesh,
never mirrored, with a newborn offset per vertex). The game still reads format 1 models; `python3
tools/blender/modelpack.py <id>` converts one in place.

## A species file (`pig.py`)

All in game rig space (meters, x left, y up, z forward, feet on y = 0), built around the bone pivots from the rig
export. It provides: `BOUNDS`, `PATCHES` (fine bake-only boxes), `shape(P)` (the signed distance field), `parts(P)`
(named part distances for paint masks), `tail_curve()` and `TAIL_RINGS`, `keep(P)` (decimation protection),
`bone_tips()` (bone segments for automatic weights), `fix_weights()` and `WEIGHT_SMOOTH`, `paint()`, `detail()`,
`finish()` (folds ambient occlusion into the color), `stats()`, `meta()` (eye, lids, lashes, iris, mouth, collar
placement written to the json) and `MAP_QUALITY`. `sdf.py` has the primitives, smooth booleans, noise and meshing
(`sweep()` lofts along a curved path: necks, legs). Optional: `PREVIEW` (camera views for `preview.py`), `UV_AVERAGE`,
`uv_weight()` and `uv_regions()` (texture layout), and for furry species `FUR`, `fur()`, `flow()`, `cards()` and
`HAIR` (below).

## How to do a furry animal

A sculpted body alone looks shaved. `horse.py` is the example for everything below; the game side needs no changes
(the model's json switches it on).

1. **Sculpt the body under the coat**, as for the pig: the shape the skin would have, not the outline of the fur.
   Long fur makes its own outline at close range (shells) and the paint carries it further away.
2. **Fur direction**: `flow(P, N=None)` returns the direction the hair lies at each point (unit vectors, rig space):
   from the nose toward the tail along the body, down the sides, down the legs, down the face toward the nose, out
   along the ears and the tail. Blend regions with smooth steps (see the horse). Keep the x component mirrored
   (`f[:, 0] *= sign(x)`); the stored half is +x.
3. **Fur length and density**: `fur(P, N, comps)` returns (length in meters, density 0..1) per point; length 0 where
   there is no fur (eyeballs and lid rims, nose pad, lips, hooves, paw pads, claws, chestnuts). Shorter on the face and
   lower legs, longer on the belly, the back of the legs, the ears' insides, a fox's ruff, a squirrel's tail.
4. **`FUR` settings** (written to the model json; the game reads them):
   `len` the longest fur (m; per-vertex and per-texel lengths are stored relative to it), `n` shell layers at close
   range (detail 2), `n1` layers at detail 1 (default 0; every animal of the species in view pays for them),
   `lean` how far the tips comb over along the flow (times the length; 1.5 to 2.5 lies flat, 0.3 to 0.8 stands up),
   `tile` strand spacing (m), `babyLen` and `babyLean` (newborns: longer, fluffier, more upright), `shade` (how dark
   the lowest layer is, default 0.7), `quality` (WebP of the fur map). Starting points:

   | coat | species | len | body length | lean | tile | n |
   | --- | --- | --- | --- | --- | --- | --- |
   | short, sleek | horse, deer, goat, moose | 0.01 | about 0.55 of len | 1.8 | 0.0017 | 4 |
   | medium | fox, raccoon, otter, weasel | 0.025 | 0.6 to 0.9 | 1.0 to 1.3 | 0.0016 | 4 to 5 |
   | long, fluffy | bunny, squirrel | 0.035 | 0.7 to 1.0 | 0.5 to 0.8 | 0.0014 | 5 |
   | spines | hedgehog | 0.01 on the face and belly only | | 1.0 | 0.0015 | 3 |

   Hedgehog spines are not fur: sculpt the spine coat as bumps and paint, or make them hair cards.
5. **Coat in the paint**: far away there are no shells, so the color and normal maps carry the coat. The horse's
   `strands()` draws short strokes along the flow by texture bombing (one possible stroke per small cell, its
   direction taken from `flow()` at the cell), so the strokes turn with the flow without smearing; it is used a
   little in the color and as height in the normal map. Raise the stroke size and contrast for long coats.
6. **Hair cards** for manes, tails, long tufts and whiskers: `cards()` returns ribbons (root to tip points, widths,
   shading normals, the texture column, bone weights per point and optional newborn points), `HAIR` sets the strand
   texture (see `cards.py`). Weight the root with `'_skin'` (export.py replaces it with the skin weights of the body
   under it, so the hair stays on the skin in every pose) and let the tips follow other bones (the horse's mane
   bones, the tail bones). Put the newborn shape in `baby` (a foal's short upright mane, a short tail); the game
   blends to it with the baby proportions. Build them from the sculpt with `_surface()` (rays to the body surface,
   all at once) and finish with `_push_out()` so no hair ends up inside the body.
7. **Texture layout**: `uv_regions(P)` (an integer label per face: head, neck, trunk, upper and lower legs, hooves)
   unwraps each region on its own, so no long island runs from the body up the neck into the head; that took the
   horse from about 50% to 65% of the texture used. `UV_AVERAGE = True` gives every island the same texel size, and
   `uv_weight(P)` (linear scale per island) gives the face more: 1.7 on the head and about 0.9 elsewhere for the horse.
8. **Check** at detail 2 close up (the coat), detail 1 and 0 (no shells; the paint must hold), the baby, the collar at
   all three details (it rides on the shells by itself), eating and sleeping (hair must not come off the skin).

Bake costs: the strokes make `texture` take about 4 minutes at 1024; everything else is like the pig.

## Budget

Pig: about 6.3k triangles, 4.8k vertices, 1024 x 1024 color and normal maps: 38 KB mesh (format 2; 136 KB before) +
71 KB + 52 KB maps, about 215 KB once base64 in the page.

Horse: 7.0k body triangles plus 2.0k in the hair cards; 1024 maps for color and normal (WebP 80), 512 fur map, 384 x 384
strand texture: 82 KB mesh and cards + 24 + 40 + 8 + 54 KB maps, about 283 KB in the page. Close up (detail 2) the
fur shells add 4 layers over the coated triangles (about 22k triangles, one draw call); detail 1 and 0 draw the body
and the cards only.
