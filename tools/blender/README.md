# Sculpted animal models (Blender pipeline)

Makes a realistic body for one species with Blender, fitted to the skeleton the game already uses, and writes it to
`game/models/<id>.*`. `build.mjs` embeds those files in the page and `game/src/40_animals.js` uses the model instead of
the procedural loft body. Everything else (bones, walk/run/eat/sleep animation, baby proportions, eyes and blinking,
collar, moods, swimming) keeps working through the same rig API. The pig (bare skin), frog, lizard, turtle, snake,
horse (coat, mane and tail), fox and raccoon have models so far; `horse.py` is the example for furry animals and
`carnivore.py` has the parts the small carnivores share.

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

Optional settings (defaults are the pig's): `TAIL_RINGS = 0` for an animal without a tail tube, `BAKE_DIST` (cage,
ray and occlusion distances in meters, smaller for small animals), `DISSOLVE_DEGENERATE = True` (drop the zero area
slivers the mirror cut leaves, so they do not use up the triangle budget). In `meta()`, the eye can ask for
`irisNet` (a fine dark network over the iris, for frogs) and the collar for `tilt` (pitch of the band's plane) and
`maxR` (ignore limbs farther out than this when slicing the neck).

## The frog (`frog.py`)

A smooth skinned animal (no fur), small (0.2 m), sitting with its legs folded in a Z. Things the next species can
reuse:
- Folded limbs: `_fold()` joins two limb segments that lie against each other with a blend only at the joint and a
  thin slit everywhere else, so the skin opens cleanly when the joint straightens (a hop). Without it the folded
  thigh, shank and foot fuse into one lump and stretch into fins.
- Skin weights from the sculpt's own parts (`fix_weights`): each vertex follows the part it lies on, and two
  neighbouring bones blend only within a few millimeters of their joint. Transferred weights from the procedural
  body were not good enough for the frog's extreme folds.
- Decimation: small, curved features (toes, discs) keep triangles by curvature alone and big smooth areas get almost
  none, so `keep()` protects the body and limbs instead (and never uses 1, which locks a vertex). Check where the
  triangles went per part before baking.
- Maps at 512 for a 0.2 m animal are about 0.4 mm a texel: skin granules need cells of about 3 texels or more.

Optional, for animals that are small, long or bendy (the lizard uses most of them): `TAIL_RINGS = 0` when the tail is
part of the field (no tail tube), `BAKE_CAGE = (cage, ray)` and `AO_DIST` (bake distances in meters, scaled to the
animal), `UV_PACK` (extra `uv.pack_islands` options, such as axis aligned islands), `unwrap(ob)` (its own UV islands
instead of smart project) and `lowpoly_fix(bm, hi)` (edits the decimated half before unwrapping). `meshfix.py` has the
fix-ups for `lowpoly_fix`: rings cut across a tail, neck or leg so it can bend (the decimator leaves smooth stretches
with almost no vertices), seam cuts, and removal of slivers and loose specks. `PIECES` (a list of fields) meshes
separate closed pieces that overlap without merging, like the turtle's rigid shell and the soft body that slides in and
out of it. A species can also skip the sculpt and build its game mesh and exact surface itself:
`make_game_mesh(work, rig, tris)` (called by the lowpoly step) and `make_bake(work, tex)` (called by the bake step); the
snake does that for its tube body, which is laid out as four strips in the maps.

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

## The small carnivores (`carnivore.py`)

The fox, raccoon, otter and weasel share `carnivore.py`: field helpers (`local`, `mirror`, `groove`), `Frame` (a head
frame along the muzzle), `Eye` (ball, almond lid opening with a slant, lid mound, `sink` to set the ball back so a
shut eye sits flush, and the eye's `meta()` with the game's own lids kept just behind the sculpted ones), `ear()`
(pointed or round, cupped), `paw()` (digitigrade toes on a pad), `hand()` and `web()` (flat hands and feet with long
digits, webbing between them), `strands()` (the coat strokes, with a per region length factor `lenk`), `whiskers()`
(hair cards rooted with `'_skin'`, shorter on babies) and `set_part()` for skin weight fixes. Things learned:
- `keep()` needs a floor over the whole body (about 0.44) or the decimator gives a fox's head, ears and paws nearly all
  the triangles and leaves 60 for the trunk; a lower floor on a long smooth tail (0.36 to 0.42) stops it taking too much.
- Every `local()` box has to reach past the blend radius of its part, or the field steps at the box wall and the mesh
  gets a crease right across the body.
- Noise added to an edge has to move both ends of `sstep(a, b, x)` together; when the ends swap the mask inverts and
  leaves white specks (the fox's tail tip did that).
- `meta()` can give `belly` (the contact point for lying down) when the legs are close to the middle; the export's own
  search under the hips finds the inside of the legs on a fox and the animal sleeps standing.
- A species with `baby_paint(P, N, comps, col)` gets a second color map for babies (`BABY_TEX`, 256 to 512 is enough):
  a fox kit's gray-brown fuzz and a weasel kit's grayer coat. The game swaps it in with the baby material (`babyColor`).
- A grizzled coat (the raccoon's black and white tipped guard hairs) makes a big WebP: `PAD_SMOOTH = 4` fills the
  padding farther than 4 texels from the islands with a smooth blur instead of smeared strokes, and quality 60 is
  enough for such a busy map.
- A `sweep()` rounds its end caps by half the smaller of its end widths, so a tapering tail or leg has a nearly flat
  disc at its thick end: start it inside the body, or the disc's rim prints a ring across the skin (the otter's tail
  and hips did that).
- Skin weight masks for paws need bounds on both sides along z: a mask for the hind feet "in front of the heel" also
  took the hands, and a raccoon kit's arm stretched across the meadow.
- Long bendy bodies (the otter swimming, the weasel standing up and curling to sleep) get rings from
  `meshfix.rings` in `lowpoly_fix`; decimate to fewer triangles (`TRIS`) so the total stays in budget after the cuts.

## Budget

Pig: about 6.3k triangles, 4.8k vertices, 1024 x 1024 color and normal maps: 38 KB mesh (format 2; 136 KB before) +
71 KB + 52 KB maps, about 215 KB once base64 in the page.

Horse: 7.0k body triangles plus 2.0k in the hair cards; 1024 maps for color and normal (WebP 80), 512 fur map, 384 x 384
strand texture: 82 KB mesh and cards + 24 + 40 + 8 + 54 KB maps, about 283 KB in the page. Close up (detail 2) the
fur shells add 4 layers over the coated triangles (about 22k triangles, one draw call); detail 1 and 0 draw the body
and the cards only.

Frog: about 7.1k triangles, 6k vertices, 512 x 512 maps, about 305 KB in the page (`VOXEL=0.0004 TRIS=7200 TEX=512`;
still the older model format, convert with `python3 tools/blender/modelpack.py frog`).

Fox (`VOXEL=0.002 TRIS=7000 TEX=1024`): 7.0k triangles plus 96 in the whiskers; 1024 color (WebP 72) and normal maps,
512 fur map, 512 kit color map: 59 KB mesh and cards + 67 + 33 + 13 + 8 + 4 KB, about 250 KB in the page.

Raccoon (`VOXEL=0.002 TRIS=7000 TEX=1024`): 7.0k triangles plus 96 in the whiskers; 1024 maps (color WebP 60 with
`PAD_SMOOTH`), 512 fur map: 59 KB + 103 + 30 + 13 + 4 KB, about 282 KB in the page.
