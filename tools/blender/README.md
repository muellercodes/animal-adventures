# Sculpted animal models (Blender pipeline)

Makes a realistic body for one species with Blender, fitted to the skeleton the game already uses, and writes it to
`game/models/<id>.*`. `build.mjs` packs those files into `docs/models-*.json` beside the page (the sizes below that say "in the page" count what an animal adds to those files) and `game/src/40_animals.js` uses the model instead of
the procedural loft body. Everything else (bones, walk/run/eat/sleep animation, baby proportions, eyes and blinking,
collar, moods, swimming) keeps working through the same rig API. Models so far: the pig, frog, lizard, turtle,
snake, horse, duck, hen, macaw, owl, fox, raccoon, otter, weasel, deer, goat, moose, bunny, squirrel, hedgehog, dog and
cat, and since then the newer animals and, in round 12, the swan. `horse.py` is the example for furry animals, `carnivore.py` has the parts the small
carnivores share (the bunny, squirrel and hedgehog use it too, with `smallfur.py`), `ungulate.py` the hooved animals'
(`deer.py` for antlers), and `bird.py` the birds'. A baby with its own coat colors writes a second color map (`baby_paint()` or
`paint_baby()`), stored as the `babyColor` map.

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
instead of 140 KB. Optional blocks: fur (comb direction and fur length per vertex), hair cards (their own mesh,
never mirrored, with a newborn offset per vertex) and baby offsets (`bdelta`: the baby's own shape change per vertex,
from the species' `baby_offset(P, N, parts)`; export.py packs it for any species that has one). The game still reads
format 1 models; `python3 tools/blender/modelpack.py <id>` converts one in place (baby offsets included), and
`python3 tools/blender/modelpack.py --baby <id>` (a Python with numpy and scipy) gives a format 2 model new baby
offsets from its species file without the Blender work files, leaving the rest of the model byte for byte.

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
`irisNet` (a fine dark network over the iris, for frogs) and the collar for `tilt` (pitch of the band's plane),
`maxR` (ignore limbs farther out than this when slicing the neck), `taper` (each edge of the band rests on the skin
under it, for a neck that widens into the shoulders; otherwise the band is as wide as the widest skin across it) and
`wb` / `wbk` (the band follows only these bones, for that share of its weights: the pig's band would otherwise lift
off with the head when it eats). The baby's band: `babyAt`, `hug`, `babyK`, `babyMaxR` (see the birds).

A species can give its baby its own shape with `baby_offset(P, N, parts)` (offsets in adult space per vertex, before
the game's baby proportions; see the birds). The pig uses it for a rounder, shorter piglet (the trunk walks along its
normals onto an egg, `PIGLET`), together with the game's `modelSpec.baby` (bigger head and ears, shorter snout).

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

## The birds (`bird.py`, `duck.py`, `chicken.py`, `swan.py`, `parrot.py`, `owl.py`)

The sculpt is the body, neck, head, bill, eyelids, legs and feet. The wing and tail feathers stay separate blades in
the game (`spec.feathers`, one per feather bone), so wings still fold, spread and flap and tails still fan; a model
with a feather atlas only swaps what they look like. `bird.py` holds what the five share:
- `plumage()`: a feather pattern for the sculpt's surface (jittered 3D grids of feather tips at a few sizes, each
  point covered by the front-most feather; the species says the feather size and the flow direction per point). It
  gives the paint the feather id, its edge and position inside it (scallops, pale tips, bars) and `feather_height()`
  the height field for the normal map.
- `toes()`, `web()`, `scutes()`, `reticulate()`: feet with claws or webs and scaly legs. `wing_arm()`: the folded
  arm under the wing feathers (the blades cover it, it only has to be there and bend).
- `part_weights()`: skin weights from the sculpt's parts (spine coordinate for body, neck and head, groups for legs,
  wing arm, ear tufts, comb), as the frog does.
- `feather_atlas()` and `FeatherCell`: an 8 cell RGBA atlas of real feather outlines (flight feathers with a narrow
  outer vane, rounded coverts, curls, down puffs) with shaft, barbs, splits and a normal map, painted in numpy. The
  game cuts its rectangle blades with the alpha (`featherBladeCut`, `alphaTest`), so the shadows get the outlines.
  Painted at 1024 x 512 and written at `FEATHER_ATLAS['out']`.
- Babies: `paint_baby()` / `detail_baby()` give a second color and normal map (down instead of feathers, written at
  `BABY_MAPS['size']`), and `baby_offset()` (`baby_shape()`) gives each vertex its own baby shape change (round egg
  shaped body, wing arm pulled into the shoulder, thin legs), packed with the mesh (format 2 `bdelta` block, int8 x3
  with a square law scale `md.bdelta`). The game adds it through the bones' baby maps, so it follows the rig like the
  rest.
- Babies' down as fur shells: each bird has `FUR` with `babyOnly: True` (the game draws shells on the baby only; the
  adult keeps its feathers and is unchanged), and `fur()` / `flow()` from `down_fur()` / `down_flow()`: long, nearly
  upright down (`lean` 0.25 to 0.3, `tile` 0.0024 to 0.0036 so the tufts read as fluff, not dust), shorter on the
  head, wing arm and drumsticks, none on the bill, legs and feet, eyelids (and a hen's comb), short around the eyes and
  next to the bare parts so it never falls over the eye or the bill. The collar sinks into the down (`lift: 0.35`).
  Starting points: duckling and chick `len` 0.036, owlet 0.05 (legs and toes downy too, the facial disc short), macaw
  chick 0.034 and sparse (`den` 0.75), cygnet 0.05. About 15 to 19 KB more files per bird (fur block 6 KB, 384 fur map); at
  detail 2 the baby has 5 or 6 shell layers over its downy triangles.
- Hooks, all optional and off for the other species: `grid(h)` (a rectilinear marching cubes grid, finer where
  the bill and feet are), `UV_PACK` (extra pack_islands options), `extra_maps(X)` in `texture.py` and
  `export_extra(meta, out, work)` in `export.py`.

In the game (`40_animals.js`): `modelSpec` in a species spec overrides settings only when the sculpted model is
loaded (the folded wing pose that rests on the sculpted back, baby proportions); `spec.feathers(rest, md)` gets the
model's json and returns the atlas blade set (more blades: two primaries per hand bone with `dyaw`, marginal and
tertial coverts with `stdWing({ atlas: true })`); `md.srgb` names the extra color maps.

Lessons:
- Plumage reads at game distance from big shapes, not from the feather pattern: the mallard's head, ring, breast and
  speculum, the hen's dark tail and pale hackles. Keep the per-feather scallops soft (`feather_height` scale) or the
  body looks like scales.
- The folded wing must lie on the body: tune `modelSpec.anim.wing` (`folded`, `foldedPos`) per species with a wing
  debug view; the procedural values float the wing over the old cone body.
- Thin parts (bill tip, toes, comb) need the rectilinear grid or a patch, and a patch that crosses x = 0 must cut
  its core once, not mirrored (fixed in `sculpt.py`), or the bake source has holes.
- Raw int16 baby offsets cost 6 bytes a vertex; int8 with the square law is enough (sub millimeter where it matters).
- Baby offsets: `onto()` walks along the vertex normal and falls back to the nearest surface point where the normal
  is slanted (creases, inner faces), or single vertices shoot out as spikes. A long S shaped neck (swan) must not be
  pushed onto a fat neck: it folds up when the game's baby maps shorten it; keep its own shape and widen it there.
- Collars on a baby with its own shape: `babyAt` (band position along the neck for the baby), `hug` (the band comes
  in as well as out), `babyK` (thicker, wider band), `babyMaxR` (limb cutoff for the baby slice).
- The swan (`swan.py`) was made here first but not shipped (the adult was only a little better than the procedural
  one); it was redone and shipped in round 12, see "Round 12: the mute swan" below.

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
- Check the animal at the game camera's distance (fov 55, about 1.2 to 3 m away), not only close up: the mipmaps
  there mix neighbouring UV islands. The weasel's 512 maps had its cream belly islands 2 texels from the brown back
  and head islands, which showed as pale seam lines along the back and over the head; `UV_PACK =
  dict(margin_method='FRACTION', margin=0.016)` (8 texels apart; `UV_PACK` can now set the margin) and a `PAD_SMOOTH`
  wider than half the gap fixed it, with no visible loss close up.
- Long bendy bodies (the otter swimming, the weasel standing up and curling to sleep) get rings from
  `meshfix.rings` in `lowpoly_fix`; decimate to fewer triangles (`TRIS`) so the total stays in budget after the cuts.

## Hooved animals (`ungulate.py`: `deer.py`, `goat.py`, `moose.py`)

The deer (and the goat and moose after it) reuse the horse's approach; the field helpers that were module globals in
`horse.py` are generic functions in `ungulate.py`, plus:
- `cloven()` and `dewclaws()`: a split hoof (two claws, flat inner walls, pointed tips, the front wall leaning back) and
  the two little claws behind the fetlock. Put the dewclaws on the back of the pastern, not floating behind it.
- `Tubes`: antlers and other branching tubes as smooth unions of round cones along resampled polylines (each segment
  evaluated only near its box, so the fine bake patch stays fast), and per point coordinates of the nearest tube (arc
  length, angle around the axis) for ridges in `detail()` and the dark base / ivory tips in the paint. The deer puts
  the burr (a pearled ring) and its pearls only in a small box around the burr: evaluated over the whole antler patch
  they took minutes.
- Antlers and horns ride on their own bone (the game scales it to nothing on babies): weight only what lies above the
  burr to it (`(P - BURR) @ axis > 0`) and leave the pedicle on the head, short and blended in, or the baby's head gets
  holes or nubs where the antlers were.
- A tail that lifts a long way (the deer's flag) is its own piece (`PIECES = [body, tail]`, see the turtle): blended
  into the rump it would drag the skin up with it. Weight it in `fix_weights` by which piece a vertex lies on.
- Newborns with their own coat (fawn spots): `paint_baby(P, N, c)` paints a second color map (`texture.py` writes
  `<id>-color-baby.png`, `export.py` adds it as the `babyColor` map at `BABY_MAP = (size, quality)`), and the game
  uses it with the baby proportions. Spots that should line up (the fawn's rows along the spine) are placed on the rows
  explicitly; jittered-grid spots never form rows.
- Hair cards also suit short tufts: the deer's white tail fringe is 21 small cards weighted to the tail bones directly
  (not `'_skin'`: the nearest skin to a card tip can be the rump).
- Belly line: keep the belly ellipsoid above the brisket, and keep the stifle (front of the thigh) from hanging below
  the belly, or it reads as a ball under the flank; a flat ellipsoid from the belly to the stifle makes the flank fold.
- Every `_local` box must hold its whole part plus the blend radius: where a box cuts a part, the field jumps and the
  smooth union leaves a crease that the bake prints into the normal map (the goat's neck box cut across its chest and
  drew a bib there). A quick check: evaluate each part on a coarse grid and compare where it is below its blend radius
  with its box.
- Deer, goat and moose coats are matte: roughness about 0.62 (the horse's 0.44 looks like plastic on them).
- Horns (`goat.py`): `horn()` sweeps an oval section (flattened side to side, a keel in front) along a polyline with
  transverse ridges every few millimeters. Keep the first 1.5 to 2 cm of the horn on the head (`HORN_STUB`) and only
  the rest on the horn bone: on a kid that stub is the horn bud. Small horn buds are also sculpted under the horns.
- A beard is a few hair cards hanging from the chin with `'_skin'` roots; their baby points pull them in to nothing.
- A goat's body reads as a box unless the croup slopes down to the tail, the buttocks curve back and under to the hock,
  and the loft exponents stay near 2 (2.4 and up gives square sections).
- Palmate antlers (`moose.py`): each palm is a plate built from a 2D outline (rasterized, eroded and grown back so the
  points get round tips, sampled bilinearly) in its own frame, thick at the beam and thin in the points, dished by
  `palm_cup()`; the brow palm is a second, smaller plate reaching forward. Lay the palm's face up, forward and in:
  standing up like a fan or lying flat both look wrong from the side.
- Big animals: the moose's sculpt at 5 mm plus fine patches was too big to bake in the 7 GB the machine had (Cycles was
  killed); 6 mm with 2 to 3.4 mm patches bakes fine and looks the same in the game.

## The small furry animals (`bunny.py`, `squirrel.py`, `hedgehog.py`, `smallfur.py`)

They reuse `carnivore.py` (eyes, ears, hands, coat strokes, whiskers). `smallfur.py` adds `strand_texture()`: a hair
card texture painted column by column with color bands along the strand (`stops`), as wavy hairs or as straight
tapering spines. A species uses it through `hair_texture()` (export.py writes that instead of `cards.texture(HAIR)`).
- The bunny (`bunny.py`, eastern cottontail): its own ear (`ear()`: long, cupped, rolled into a cone at the root,
  thicker rims), a finer grid across the ears (`grid()`: they are thin plates facing forward), a split upper lip and
  slit nostrils, big hind feet as a flat loft under a big haunch. The agouti coat is the stroke tone: dark tipped and
  buff banded strokes over a gray-brown base (`_strands` tone below 0.3 dark, above 0.65 buff); a rusty nape patch,
  pale eye rings, a white belly and the white underside of the cottontail; veins painted and raised a little inside the
  pink ears. Kits get their own color map (a darker fuzz and a white blaze).
- The squirrel (`squirrel.py`, American red squirrel): hands with long fingers and curved claws (`CV.hand`), dark ear
  tufts and whiskers as cards, a white eye ring kept flat (no fur over it, which is what made today's dotted halo), a
  black line along the flank above the white belly. The tail is the signature: a big round plume swept along a curve
  (`TAIL`) under the longest fur shells, painted rust with black tipped guard hairs, and 64 thin locks (cards) all
  around it that lie along the plume, flare out toward their tips and face out. What did not work: locks only out to
  the sides read as a flat strap from the side; locks standing across the tail show their unlit backs (cards are two
  sided and the back face takes the flipped normal) and, with a dense root (`root` 0.15 to 0.3 in the strand texture)
  or a strong black band, read as dark flakes, most of all at detail 1 and 0 and in the menu icon where there are no
  shells; a small plume needs very long shells to look bushy. Tail skin weights come from the position along its middle
  line (`tail_t`, `tail_weights`), and the cards' points use the same, so the locks follow the tail bones.
  `meshfix.rings` across the body and along the tail (15 mm apart) let it sit up, climb and curl up.
- The hedgehog (`hedgehog.py`, European hedgehog): the spines are real geometry, about 1,350 straight cards of two
  points (2 triangles each) rooted over the spine coat (rays in toward the middle of the dome from a Fibonacci sphere,
  kept where `spine_w()` says spines grow, then mirrored), leaning back along the flow at 20 to 45 degrees and turned a
  little about the normal so they cross. Each card carries six spines from an 8 column spine texture
  (`strand_texture` kind 'spine': cream root, a dark band, a pale point; one column all pale). Turn the cards only a
  little about their own axis: two sided cards show their unlit backs as dark patches. The skin under them is painted
  with the same banded spines (`_spine_strokes`: several spines per cell, the cell as big as the longest spine so a 3 x 3
  x 3 neighborhood finds every spine, the flow taken at the texel; fast enough at 1536 texels) for far away and between
  the cards. Fur shells only on the face, the belly, the legs and a skirt along the spine line. Every card point is
  weighted with `'_skin'`, and the dome's skin weights are smooth bands (rump, hips, chest, neck), so it rolls up into a
  ball with the spines on. Hoglets get short spines (the cards' newborn offsets) and a pale strand texture of their own
  (`babyHair`, written by `export_extra()`; the game's card material takes it for babies).
- The slice for the collar can meet another part of the body: the squirrel's neck plane also cuts the tail tip curled
  over its back, and the band stretched up to it. `'collar': {'maxR': ...}` in `meta()` ignores it.
- Memory: a nearest-point search of every texel against a polyline (N x points arrays) took over 2 GB at 1536 texels
  and the texture step was killed; use a KD tree (`scipy.spatial.cKDTree`).
- A round eye open wide (a rabbit's or a squirrel's): `'lid': [1.1, -1.1, 0.1]` in `meta()` keeps the game's lids off
  the corners of the ball until it blinks (the default curve brings them down at the sides), and a dark `lidCol`, or the
  pale eye ring makes a shut eye look like a pale ball. The carnivore helper's `cextra` "eye open" shot can catch a
  blink; `ceye` sets the lids explicitly.
- Small animals: the game camera's near plane is 5 cm, so close-up test cameras must stay farther than that (the
  carnivore helper's eye shots clipped into the bunny's head).

## The pets (`dog.py`, `cat.py`)

A golden retriever (with a little yellow Labrador in it) and a brown mackerel tabby, the last two that use
`carnivore.py` (eyes, paws, ears, coat strokes, whiskers). Things that are new or that took a few tries:
- People know exactly what a dog's and a cat's face look like, so look at the head from the front, the side and 3/4
  (the `headfront`, `head3q` and `headside` preview views) before anything else. The dog's head read as a hound or a
  Great Dane until the skull was clearly wider than the muzzle from above (the loft narrows sharply in front of the
  eyes, then the muzzle runs nearly parallel), the forehead rose steeply at the stop, the muzzle got shorter and deeper
  with the flews hanging at the sides, and the nose became a flat fronted superellipsoid (as an ellipsoid it was a shiny
  black ball). The cat's nose leather is a small rounded triangle (an ellipsoid squeezed in x toward its bottom), not a
  prism; its eyes sit far back in their sockets (`sink` 0.42) or the game's eye balls bulge out of the face.
- `flat_cone()` (in both files): a round cone flattened across x, for the thigh and the upper arm, which are wide from
  the side and flat from the front. Ellipsoids there read as balls stuck to the legs. A flank fold (another flat cone
  from the belly to the stifle) stops the notch between the belly and the thigh.
- The dog's drop ears (`drop_ear()`): a leaf shaped plate hanging from the fold along `EAR_A`, cupped around the
  cheek, its lower part a little off it, thick at the fold and thinner at the tip and edges; weighted to the ear bones
  from the fold down. Its fringe is sculpted (a thin wavy plate past its edges, see the breeds below) under longer
  fur shells: cards along its lower edge hung off it like a comb, and on a puppy they stood out as orange flaps.
- The tail's feathering (the flag) is sculpted: the sweep's section is deeper on the underside (`FLAG`, the 'top' side
  for a path going back and down) with a pointed exponent, under longer fur shells, and only a few wide, short cards
  hang from its lower edge as wisps. Cards alone, however many, hung under the tail like a comb. The tail's rings and
  skin weights reach the bottom of the flag (`r < 0.065`, `td < 0.075`).
- Paint masks for pale regions must leave out the ears: the throat mask (normals facing forward and down) also caught
  the ears' forward edges and drew a cream stripe down each ear.
- The tabby pattern is painted from 3D masks (`_tabby()`): mackerel bars about 15 mm apart down the flanks (from the
  height on the body, leaning back as they go down, broken by noise), the dark spine line, bars on the legs, the dark
  backs of the hind feet, rings on the tail and its dark tip, the M on the forehead, two lines over each cheek, belly
  spots from a Worley grid, necklaces, plus ticking (dark tipped coat strokes). Fine stripes everywhere look busy; a few
  wide ones and soft ticking read better.
- Babies: both have `baby_offset()` (the trunk walks onto an egg, as the pig's does, so the puppy and the kitten get a
  round barrel and a full little belly). Keep the egg's top at the adult back line, or the back gets a hump where the
  weight mask fades, and the egg as long as the trunk, or the rump gets a lump. `modelSpec.baby.eye` stays near 1:
  the sculpted sockets already grow with the head, and the procedural factor (1.18, 1.25) made the eyes poke out.
  `fluff` must be 0 for the cat's model (the kitten's fur shells are its fluff; the procedural fluff made lumps).
  Kittens have blue eyes (`babyIris`).
- Cards for ear furnishings (pale tufts inside the cat's ears) read as white spikes at game distance; the coat inside
  the ear does the job.

## Dog breeds (`dogkit.py`: `lab.py`, `dalmatian.py`, `husky.py`, `beagle.py`, `chihuahua.py`)

Every breed is the golden retriever (`dog.py`) refitted, so a new breed is a page of numbers and its coat, not a new
sculpt. `dogkit.Fit` maps golden rig space to the breed's: an overall scale `s`, the legs (`kL`) and the body above
them (`kB`) taller or shorter (one smooth height map, the paws kept as they are), the body longer (`kz`) or wider
(`kw`), stouter or slimmer legs (`kLW`, about each leg's middle line) and the head carried higher or further forward
(`neck`, fading in up the neck). The golden's trunk, neck and legs are evaluated through the inverse map (the field
times the local scale is still a good enough distance). The head has its own map: the golden head frame moved with the
neck, turned by `pitch`, scaled by `k`, and in it the skull and the muzzle each with their own length (`kS`, `kM`),
width (`kSW`, `kMW`, `kTW` at the nose) and depth (`kDome`, `kJaw`, `kMD`); a breed can add shape in its head frame
(`head_extra`: the chihuahua's apple dome, the beagle's flews) or on the body (`body_extra`: the husky's ruff). Ears
(`DropEar`, `ErectEar`), the tail (`Tail`: a sweep with an optional brush or flag on its normal side), the eyes and
the paws are the breed's own, placed through the maps. The game refits the procedural skeleton and body with the same
numbers (`dogFit` and `dogBreed` in `game/src/40_animals.js`), so the bones match the sculpt; change both together.
- The golden's paint masks, coat flow and texture regions are reused through `Fit.gpt()`: every breed point maps to
  the golden point it stands for (the body's map, the head's in front of the back of the skull, blended), so "the
  chest", "the backs of the legs" or "the muzzle" mean the same on a chihuahua. The breeds paint on top of them: the
  black Lab's glossy black, the Dalmatian's round spots (a cell grid with a spot in most cells, smaller on the head,
  the legs and the tail), the husky's saddle and mask, the beagle's tricolor, the chihuahua's fawn.
- Puppies: the trunk walks onto the golden's egg (refitted); the tops of the legs round into it; the throat is tucked
  and the nape filled up to the back of the bigger head; the golden's feathering goes back to the bare body; and the
  head is pulled toward a puppy's (`dog.puppy_head()`: a round skull, a short muzzle as big in section as the adult's,
  a big nose, rounder eyes). The game's baby head map now shortens a dog's muzzle along the head's axis
  (`baby.muzzleDir`): toward the mouth, which sits low, it squashed the jaw up and left a ball with a beak.
- The golden got sculpted feathering (`feathering()`: fringes down the backs of the forelegs, the trousers, the bib and
  a wavy fringe along the underline, `_fringe()` plates with wavy edges) and a fringe on its ears (thinner, past the
  back edge most, toward the bottom), all finished by longer fur shells and the coat strokes. `EAR_C` points back, not
  forward.

## Round 7: the bald eagle, the chickadee and the rhino (`eagle.py`, `chickadee.py`, `rhino.py`)

Two more birds on `bird.py` and the biggest land animal on `ungulate.py`. Things that are new or took a few tries:
- The eagle's bill is two lofts (`UPPER`, `LOWER`: stations along z with a center height, a half width and a depth),
  not capsules: a deep, wide base on the cere, a culmen that curves down into a short hook, and the lower mandible
  tucked inside the upper one. Capsule chains read as a long tusk. The heavy brow is a separate chain of balls over
  the eye (`brow()`); the white hood is painted (`_hood()`), with the feather pattern turned off along x = 0 so the
  two mirrored halves leave no seam on the crown, throat and bib (also in the chickadee).
- Soaring wings: a new feather atlas kind, `'finger'` (`bird.py`): an emarginated primary, full vanes up to `1 -
  notch`, then both vanes step in to a narrow finger with a rounded tip. The eagle has one fingered primary per hand
  bone, spread in flight (`primSpread`) so the tips stand apart like fingers.
- In the game (`animBird`, both off for the other birds): `anim.soar` (long glides with a few slow beats, wings held
  flat) and `anim.grab` (eating in flight: legs swung forward and down, talons open, body pitched up, wings raised).
  The grab pose plays when the eagle eats while in the air (`grab: true` in its `SPECIES` entry); letting a player
  eat in flight needs a change in `Player.tryEat` (`60_actors.js`), which refuses to eat while flying.
- The eagle's folded wing: the long primaries cross over the tail; tune `folded` / `foldedPos` with the wing debug
  view until the tips meet behind the tail and the wrist sits in the side, or the folded wing splays out.
- The chickadee is tiny (13.5 cm): `VOXEL=0.0006` and 0.11 to 0.12 mm patches for the bill, eyes and feet. Its marks (black cap and
  bib, white cheek, buff flanks, white wing edges) are painted from 3D masks and must be big: the bib reads at game
  distance only when it reaches well down the breast. The chick's yellow gape is a small puffy rim at the bill corners
  (`_baby_extra()` in its `baby_offset()`), painted yellow in the baby map.
- Babies' backs: the folded wing feathers of a chick or eaglet drew dark streaks down the back; the down shells and a
  small `modelSpec.baby.wing` (0.2) avoid them.
- The rhino (`rhino.py`) is the horse/moose recipe at 4 m: a long head carried low (a loft along its own frame
  `hp()`), the hump over the neck, a barrel trunk, pillar legs on round three-nailed feet, a thin tail with a tuft.
  The skin folds are `folds()`: each fold is a crease plus an overhang along a curve (neck, shoulder, flank, legs), and
  the paint darkens them. The hide's pattern (creases around small plates and long wrinkles) is in the normal map; fine
  pits there made the normal map 180 KB, so they are left out.
- Horns: `U.horn()` sections (flattened, a keel in front) along a polyline. Each horn is on its own bone (`horn`,
  `horn2`) with the pivot at the top of its stub (`HORN_STUB` 3.5 cm), weighted only past the stub and only on the
  nearest horn. On the calf the game scales the horn bones to nothing and the stub stays as the nub; the calf's color
  map paints the nub skin colored (a dark horn color there read as a hole).
- Tube ears (`ears()`): a round cone minus a smaller inner cone, with a slit open to the front and side (`U.ear()`
  was too thin at this size and broke up in the voxels). Only the rim gets dark hair; dark hair inside made black
  leaves of them.

## The cockatiel and the crocodile (`cockatiel.py`, `crocodile.py`)

- The cockatiel is the macaw (`parrot.py`) built small: every shape is laid out in the macaw's units and scaled by
  `KS = 0.42` on the way out (the pipeline hooks take points `/ KS` and give distances `* KS`), so the bird helpers
  (`bird.py`: plumage, down, the feather atlas, part weights) work unchanged. Its own parts: a round head with full
  cheeks and a low ridge on the crown, a short thick neck, a small beak, the yellow face and crown (the back of the head
  and the nape stay gray) and the round orange cheek patch. The crest is game feather blades on its own bone (`crest`,
  child of `head`, nine narrow yellow blades turned to face sideways), raised when happy or flying and laid back flat
  asleep (`anim.crest`, `crestHappy`, `crestFly`, `crestSleep` in `animBird`). The cockatiel sleeps facing forward with
  the head sunk (a turned-back head made the laid-back crest point up). The wing cells make the white patch: greater
  and lesser coverts white, flight feathers dark gray. `fix_weights` puts every vertex well out along the arm on the
  wing bones (a few wing tip vertices fell to the hips and stuck out sideways when the wing folded). The chick: pale
  yellow down in tufts over pink skin (thin on the head and the neck), a short down crest (`baby.roles.crest = 'ear'`,
  `baby.ear` sizes it).
- The crocodile is one loft from the tail tip to the snout (`BODY`) with the head features on top: a flat skull table,
  raised orbits with the eyes looking up and out, the nasal disc at the tip, a jaw groove with the lower jaw set in a
  little, and conical teeth of both jaws along the jaw line (`TEETH`: the big fourth lower tooth stays visible). The
  snout was laid out long and then shortened in front of the eyes (`zf()`, every z ahead of `Z0` goes through it) to a
  Nile crocodile's proportions. Keeled scutes in rows on the back, the nuchal group, the tail's double crest of upright
  plates merging into one (`scutes()`). Legs with toes and claws, webbed hind feet (`bird.toes`, `bird.web`). The skin
  is a height field per texel (`skin()`): round scales, square belly plates in rows, pitted scutes, small pits on the
  jaws. Weights: the trunk, neck, head and tail are one smooth chain along z; legs keep the transferred weights minus
  any spine bones (a little head weight in the shoulders tore the hatchling's skin, whose head is scaled up).
- The hatchling has its own color map (`paint_baby`: bright yellow, about a dozen black bands, dark mottling on the
  head, pale belly) and its own size (`size.baby` in the spec: about 68 cm at age 0 before the game's 0.42, so about
  28 cm in the game). `setAge` reads `size.baby` for the rig's length, height, radius, eye height and float depth, and
  sets `R.strideK` so the legged animator scales the stride and foot lift with it (adult steps tore the hatchling's
  legs). In the water it floats with the eyes, the nostrils and the back just above the surface (`floatDepth`,
  `swimPitch`, `swimHead`), the legs tucked back along the body (`swimTuck`) and the tail sweeping (`anim.swimSweep`).

## The brachiosaurus (`brachiosaurus.py`)

- Brachiosaurus altithorax at about 0.6 of its real size, so it stays playable: about 13.0 m long, the head 7.5 m up,
  2.4 m wide. Units are meters like every other species, so it is sculpted coarse (`VOXEL=0.03`) on a rectilinear grid
  that is finer over the head and the feet (`grid()`), with fine bake patches over the eye, the snout and the feet.
- Shape: a deep trunk loft (`TRUNK`) on front legs longer than the hind legs, so the back slopes down to the tail; the
  neck is a sweep (`NECK`) rising steeply like a giraffe's; the head is a loft in its own frame (`hframe()`: forward and
  a little down) with the arched crest over the nostrils as a dome in front of the eyes, a broad rounded snout, a plain
  lip line (no smile) and fleshy nostrils near the front; the tail is a sweep held off the ground. Pillar legs are
  sweeps; the front foot is a horseshoe column open at the back with a curved thumb claw on the inside, the hind foot a
  long pad with three claws on the inner toes turned out.
- Skin (height field per texel): small domed scales everywhere (finer on the head), bigger plates over the back, long
  wrinkles, creases across the neck and rings round the legs. Paint: muted gray-brown with an olive cast on top, soft
  darker mottling, a paler belly. The hatchling has its own small color map (paler, bolder blotches).
- Round 16b (the audit found a small smooth bulb of a head, a plain elephant gray body and column legs): the skull roof
  behind the eyes lower, so the nasal arch stands up in front of and above the eyes as the head's highest point (a
  taller dome, the nostrils high on its front, a low ridge joining it back between the eyes); a longer, deeper, broad
  rounded snout; a bigger eye (`EYE_R` 3.4 cm, set into the side of the head by `_seat()`) in a socket hollow under
  the brow. `TRIS` 5700 (was 5300) and a lower keep floor (0.33), so the head gets about a fifth more triangles (it
  looked low-poly). The hatchling's arch is only about half as tall (`baby_offset()`: a young sauropod's arch is low,
  and the full dome on the baby's big short head looked like a hammer). The legs: a thicker wrist below a slimmer forearm, the ankle with its heel pushed out behind
  below a slimmer shin; the front foot flares a little at its base, with four blunt nails round its front and a bigger
  thumb claw. Paint: a dark olive-brown back, warm gray-brown flanks, a pale belly and underside of the neck and tail.
  The neck's part box now reaches past its blend into the head (it cut a seam across the arch).
- Weights are the sculpt's own: the trunk and the tail by z, the neck by its place along the straight line from the
  neck's pivot to the head's (nearest point on a bent path jumped between bones at the throat), the head on the head,
  the legs by height down each leg, blending into the chest or the hips at the top. Claw tips just below the ground
  fell outside every part box and went to the spine (spikes on the hatchling); the boxes now reach below the ground.
- The hatchling is the game's baby maps (head 0.55, short neck and tail, chunky legs) with its own size
  (`size.baby`, about 1 m long in the game). It is so much smaller than the adult that the usual relative baby morph
  folded its neck into a zigzag when it bent: a vertex shared by two bones turned about the adult's far-off pivots.
  `baby.rebind` (game, round 8) skins such a baby about its own rest pose instead: the morph carries the whole offset
  and `applyAge` sets the bind matrices to the current rest pose. The paw pivots sit near the ground so the small feet
  stand on it. `meta()` gives the belly point for lying down (the deepest part of the belly).

## The T. rex (`trex.py`)

- Tyrannosaurus rex at full size: 11.7 m long, 2.1 m wide, the hips 3.45 m up, the top of the back and the head 4.3 m.
  The body is one loft from the tail tip to the chest (level, balanced over the hips, a keel under the hips that it
  rests on lying down), the neck a short thick sweep, the head a loft in its own frame (`hframe()`): deep and wide at
  the back so the eyes look forward, heavy brow bosses and small hornlets, a rugose snout, closed lips (`lip_u()`) with
  only the tips of the upper teeth showing (`TEETH`), no grin. Huge thighs, thick shins, three big toes with claws
  (`bird.toes`) and a dewclaw; tiny two-fingered arms with claws.
- Skin (height field per texel): pebbly scales, bigger ones down the back, rugose knobs on the head, rings on the shins.
  Paint: earthy brown with an olive top, a paler belly, faint darker bands and a darker mask round the eye.
- Round 16b (the audit found a hippo's head: a low wide skull with small eyes on its top corners, a bulbous snout, a
  straight row of crocodile-toy teeth, one plain gray-beige skin): the head loft is wide only at the back, where the
  cheeks and the jaw joints sit low, with a narrow skull roof above them (a low top exponent, the sides slope in), so
  the eyes sit on those sloping sides and look forward; in front of the eyes it narrows fast into a tall snout with
  flat sides and a blunt deep tip. A brow ridge runs from the postorbital boss over the eye to the lacrimal hornlet and
  on along the top edge of the snout; the jaw muscles bulge behind the eye, the antorbital hollow sits in front of it.
  The lips cover the teeth but for the tips of a few uneven ones (`TEETH`), along a lip line (`lip_u()`) whose corner
  is below the back of the eye and whose tooth row bulges down a little. A bigger eye (`EYE_R` 5.6 cm, set into the
  side of the head by `_seat()`), its opening carved only just in front of it (the open cut along the gaze notched the
  brow), a brighter iris with a smaller pupil and paler lids round it. Paint: a dark olive-brown back, warm brown
  flanks, a pale cream belly, throat and underside of the jaw, each pebble a shade of its own; deeper pebbles in the
  normal map. The neck's part box now reaches past its blend into the head (it cut a seam across the cheek). The
  hatchling is the same head through the game's baby maps (short snout, big eyes) and was left as it was.
- It is a biped in the legged animator (`anim.biped`, round 10: the hind legs are the first legs in its list, so the
  leg height comes from them): the two legs alternate at every speed; eating, it tips forward over the hips and bends
  its knees (`eatPitch`, `eatDrop`); asleep it folds its legs under it and lays its head down (`sleep.style 'fold'`).
- The hatchling: the game's baby maps with its own size (`size.baby`, `baby.rebind`), long legs, a big head with big
  eyes, a short snout, and downy fuzz: fur shells on babies only (`FUR` with `babyOnly`, `fur()`, `flow()`), 4.5 cm in
  rig units (the baby maps do not scale shell length). Its tiny arms take the role `arm` (`baby.roles`): as legs they
  counted in how far the baby skeleton drops and left it floating. The eating crouch shrinks with it (`R.strideK`).
- Weights are the sculpt's own: the body chain by z, the legs by height (the toes on the paw bone), the arms along the
  upper arm and the forearm, rooted in the chest.
- Two fixes for every `baby.rebind` baby (round 10): the baby collar plan took the bone offsets on top of a morph that
  already carries them (the band and the tag landed far below the neck), and `baby.tagK` shrinks the tag for a baby far
  smaller than the adult (crocodile 0.4, T. rex 0.3). The crocodile hatchling now uses `baby.rebind` too: its folds at
  the front legs and the neck are gone.

## The giraffe (`giraffe.py`)

- A reticulated giraffe at full size: 5.05 m to the tips of the ossicones, 4.1 m from the lips to the rump, 1.0 m wide.
  A short deep trunk loft on very long legs (sweeps with knobby knees, hocks and fetlocks, cloven hooves `U.cloven`), the
  withers high and the back sloping down to the rump, the neck a sweep with a short mane along its top (`MANE`: round
  cones on the neck's top line), the head a loft in its own frame with big eyes, two ossicones with black hair knobs
  (`OSS`), a median lump, leaf ears (`U.ear`, on their own bones), soft lips; a long thin tail with a black tuft.
- The coat is a Voronoi pattern (`_reticulate()`): polygon patches parted by thin white lines, darker centers, the cells
  shrinking up the neck (0.18 to 0.1 m), down the legs and on the face; plain cream below the knees and the hocks, a
  paler belly, a tan face, a pale muzzle. The calf has its own small color map: paler orange patches, wider lines.
- Weights: the trunk by z, the neck along its straight line from the base to the poll, the head and the ears, the legs
  by height (the hooves on the paw bones), the tail down its length.
- Animation (game): a pace (both legs on one side together), a gallop with the hind legs first and the body rocking
  (`pitchRun`), the neck nodding (`nod`, `runNeck`); eating, the front legs splay a little (`eatSplay`) and the neck
  swings down to the ground; asleep it folds its legs and curls the neck back over its body (`sleep.neck` yaw 3.0).
  The calf is the game's baby maps (long legs, a shorter neck, a bigger head and eyes): about 1.7 m tall in the game.

## Round 10: the fruit bat (`bat.py`)

A flying fox built on the carnivore helpers (head frame, eye, ear, coat strokes, fur shells), sculpted in its
flight pose with the wings spread flat in the plane of the arm (y = `YM`). Things that are new or took a few tries:
- The membranes are part of the sculpt: a thin plate (1.3 to 2 mm thick, rounded rims) cut to a 2D outline in the
  x-z plane (`_outline()`: the leading edge in front of the arm and the 2nd finger, scalloped trailing edges between
  the finger tips, the arm wing's long hollow edge back to the flank), its signed distance rastered once at 0.5 mm
  (`_memb2d()`) and looked up bilinearly. The fingers, forearm, humerus and thumb are round cones in the same plane.
  `grid()` samples y finely (0.5 mm) only across the wing plane, so the plate meshes cleanly at a 2 to 3 mm voxel.
- Every skin weight is made in `fix_weights` (`WEIGHT_SMOOTH = (0, 0)`): the hand wing by the direction from the
  wrist, between the two neighboring finger bones; the arm wing on its own bones (`f4` to `f9`, the game's
  `BAT.plag`, like a bird's tertials and secondaries) between the two nearest along the arm, the arm itself at the
  leading edge, the 5th finger behind the wrist, the hips at the flank. Weighting the arm wing to the hips and the
  arm bones directly made huge panels when the wing folded (a vertex between two bones that turn 80 and 165 degrees
  lands far from both); its own bones fold back along the arm with it, and the game shrinks them across the wing as
  it folds (`fb[i].sc`), so the membrane gathers in like a real one.
- Only wing parts may take wing weights: body vertices near the wing plane (the ruff, the cheeks) once took the arm's
  and moved with the folding wing, and the thumb claw's tip stayed on the head (a spike from the folded wing back to
  where the thumb was); `onw` now needs the wing parts nearer than the body, and everything out past the flank is wing.
- A quick check for weights like these: dump the game's bone matrices for a pose (each bone's `matrixWorld` relative
  to the rig root), skin the `-lo.npz` mesh with them in numpy, and list the vertices that land far from the body.
  It found both bugs above faster than renders did.
- Pups: the game gives them a bigger head and eyes and short wings (`baby.wing`); `baby_paint` makes them gray with a
  pale wash where the ruff will be, and the fur shells are longer.
- Round 16b (re-sculpt): a flying fox's face instead of a ball with eyes stuck on: a narrower, lower cranium and a
  long tapering muzzle (`HEAD`, the nose at `NOSE_S` 0.086), smaller eyes (5.3 mm) set back into the skull at the stop
  under a brow ridge (`BROW`), bigger pointed ears (2.6 cm), a warmer brown iris. The arm wing's trailing edge meets the
  flank at the hip (`_outline()`); it ran on behind the rump, and that part (on the hips) stuck out as a flat point when
  the wing folded. In the game (`BAT` in 40_animals.js): folded, the fingers lie back along the forearm toward the
  elbow and shrink toward the wrist in the wing plane (`BAT.fscl`, read by `wingPose` only when the wing has `fscl`), as
  a real bat folds its long phalanges, so the folded hand ends by the elbow instead of standing out past the rump as a
  blade; hanging asleep they fan out and shrink less, so the wings still wrap the body; the arm wing's own bones fold
  down along the flank (`BAT.plag`, `sc` 0.25).

The butterfly and the caterpillar (round 10) are procedural (no Blender files): see `SPEC.butterfly`,
`SPEC.caterpillar` and their animators in `40_animals.js`.

## Round 11: the cow (`cow.py`)

A Holstein dairy cow at full size: 2.45 m from the nose to the rump, 1.45 m at the withers, built like the giraffe (a
trunk loft, a neck sweep, the head as a loft in its own frame `hframe()`, leg sweeps, `U.cloven` hooves and
`U.dewclaws`). Things that are new:
- Dairy shape: a flat-topped, angular back (loft exponents 2.4 to 2.6 above the widest line) over a round deep belly,
  the hooks, thurls, pins and tail head as small ellipsoids, a soft hollow in front of the hooks, a thin neck with a
  small dewlap (a thin plate under the throat), a modest udder in two halves with four teats (its own part, weighted
  to the hips). Rib grooves in the sculpt read as stripes: left out.
- The head: a long face with a flat forehead, a bony poll as a ridge between the ears, deep cheeks, a big flat nose pad
  (a superellipsoid plate in the head frame) with comma nostrils at its sides, thick lips, eyes at the edges of the
  forehead under a bony brow, ears held out sideways (`U.ear`, on their own bones).
- Both sides painted (`SIDES = True`): a Holstein's patches are never mirror images, and the game camera looks at the
  back and the rump all the time, where mirrored patches show. The color map holds the +x side in its left half and
  the -x side in its right half (`"sides": true` in `meta()`; the game already reads it, see `coat.py`). The species
  does it itself in `extra_maps()`: texture.py writes the +x side, the hook paints the mirrored points and writes both
  halves into the same png, so the shared steps stay unchanged. The patch field is evaluated at the real (unmirrored)
  point: a low-frequency fbm with a little domain warp, cut with a narrow step so the edges are crisp but wavy, a little
  more black over the back, white on the legs below the knees and hocks, the belly, the udder and the switch. The head
  is black with an irregular white blaze (a star on the forehead, narrower down the face, wider over the muzzle, a little
  off the middle) down to the pink-gray nose pad.
- Texture layout (`unwrap()`, also the camel's): each `uv_regions()` region is unwrapped conformally on its own after
  cutting seams at the region borders and down the inner side of every leg (`_leg_angle()`: the angle round the leg's
  middle line jumps across +-pi there). Smart project per region had split the decimated mesh into dozens of single
  triangle islands; this took the texture used from 46% to 55%.
- The calf: the game's baby maps (long legs, big head, ears and eyes, a shorter muzzle) and `baby_offset()`, which
  walks each udder point up onto the belly (`U.surface` against the trunk and thighs), so a calf has no udder.


## Round 11: the camel (`camel.py`)

A dromedary at full size: 3.0 m from the lips to the rump, 1.9 m at the shoulder, the hump 2.2 m up; the cow's layout
(trunk loft, neck sweep, head frame, leg sweeps, per region conformal `unwrap()`). Things that are new:
- The hump is its own part (`hump()`: an ellipsoid rounder in front with a long slope down to the croup, a shaggy
  top) on the trunk (`trunk_base()`), so the calf's baby offsets can walk it down onto the back (`U.surface` against
  the trunk without it), leaving a tiny hump.
- The neck dips down from the shoulders and curves up to the head. A sweep's first section must start inside the
  trunk: its start cap is a flat disc, and with the first key at the front of the shoulders it showed as a cut-off
  face above the withers. The neck's skin weights follow the arc along the polyline of its pivots (`_neck_u()`), not a
  straight line, since the curve doubles back.
- The feet (`foot()`): two broad toe lobes on a flat heel pad, a cleft between the toes open in front, a small nail on
  each toe; knee calluses and the chest pad are sculpted and painted dark.
- The head: a rounded skull, heavy brows over hooded eyes (`LID_OFF` below the middle, long lashes), small round ears
  standing up at the back, slit nostrils on top of the muzzle, a split upper lip over a droopy lower lip.
- Standing tall behind (second pass): the croup runs nearly level from the hump to the tail, the stifle sits high under
  the belly (1.24 m) inside a flank fold, the hock well behind (z -1.02) and about level with the knees in front, the
  hind cannon upright. The first rig had the stifle low and forward and the hock under the rump, so the camel looked
  like it was squatting; the rig's hind leg pivots and the sculpt's `HIND` sweep moved together.
- Kneeling to sleep is the game's `fold` style with the legs tucked straight under (`front: [0.1, 1.6, 1.4]`,
  `hind: [0.19, 0, 0.12]`, the hind feet a little forward so they stay under the rump with the longer hind leg, no
  roll) and the neck held up (`neck: [0.2, -0.2]`; the chest pad is the belly point).
  Eating it splays its front legs a little without dropping (a camel's neck reaches the ground).
- The calf: its own pale color map (`paint_baby`, darker than it looks in a photo: the game's sunlight washes it
  out) and woolly fur shells on babies only (`FUR` with `babyOnly`, 5 cm in rig units), the game's baby maps (very
  long legs, a short body, a shorter neck) with `modelSpec.baby.eye` 1.0 (the sculpted sockets grow with the head).
  Its closed lids get their own color (`babyLidCol` from `paint_baby` round the eye in `stats()`): with the adult's
  they showed as brown balls on the pale calf. The gecko hatchling does the same.
- Round 16b (re-sculpt; the head read as a llama's or a sheep's): a longer face with a convex (Roman) nose (`HEAD`:
  a high forehead between the brows, a shallow dip in front of the eyes, the arch of the nose), a narrower muzzle with
  the bridge pinched in above the lips, the upper lip in two lobes with a deep split down its front, longer slit
  nostrils (`NOSE_C`), the lower lip part of the jaw instead of a lump; the brow ridge a shelf over each eye (lower and
  further forward, blended in wide), longer lashes (24, 3.4 cm), the ears smaller and held back. Coat: broad warmer and
  paler patches and a sun-bleached back (`K['warm']`), and long hair in strokes (`_shag_strands()`, `U.strands` on the
  `shag` mask: the hump, the withers and shoulders, the throat, the upper legs) in the color, dark tips over paler
  roots, and in the height field.


## Round 11: the leopard gecko (`gecko.py`)

A leopard gecko, 21 cm from the snout to the tail tip, built from the lizard: the same layout (one loft from the tail
tip to the snout, head features in a head box, legs as chains, toes with claws, conformal body strips between seams
plus smart project for the legs, rings where it bends) with its own numbers, and the lizard's generic helpers
imported from `lizard.py` (`_cells`, `_rows`, `_local_n`, ...), so the lizard itself is untouched. Things that are new:
- Leopard gecko shape: a wide, tall, rounded head with big bulging eyes (`EYE_R` 4.1 mm) in thick lid rings (they have
  real eyelids; the game's lids blink over them), a short rounded snout, a wide mouth curving up behind the eye; a
  plump body held up on slender legs; slender toes with small claws and no pads; a fat carrot tail in rings (a
  shallow groove every 3.2 mm). Leopard geckos do not climb (no `climb` in the spec).
- Skin: fine domed granules (0.5 to 0.7 mm) with raised round tubercles scattered over the back, the flanks and the
  legs (a sparse cell pattern) and lined up on the tail's rings; small flat belly scales in rows. Granule-level color
  noise made the color map four times bigger for nothing visible at game distance; the granules live in the normal
  map only.
- Paint: yellow with black leopard spots (two cell sizes, smaller on the head and the legs) evaluated at the real
  point, so the two sides differ (`SIDES`, as the cow, for both the adult's and the hatchling's maps), white flanks
  and belly, the tail lilac-white with yellow spotted bands. The hatchling's own map: broad black-brown bands across a
  yellow body, a dark cap behind a pale snout, a black and white banded tail. `BABY_MAP` is `(0, q)` so export.py does
  not squash the two-sided map into a square; `extra_maps()` sizes it.
- Iris: plain gray with a vertical slit (`pupil: 'v'`); the frogs' `irisNet` looked blotchy on the hatchling's
  bigger eye. `modelSpec.baby.eye` 1.0 (the sculpted socket grows with the head).


## Budget

Pig: about 6.3k triangles, 4.8k vertices, 1024 x 1024 color and normal maps: 38 KB mesh (format 2; 136 KB before) +
71 KB + 52 KB maps, about 215 KB once base64 in the page.

Horse: 7.0k body triangles plus 2.0k in the hair cards; 1024 maps for color and normal (WebP 80), 512 fur map, 384 x 384
strand texture: 82 KB mesh and cards + 24 + 40 + 8 + 54 KB maps, about 283 KB in the page. Close up (detail 2) the
fur shells add 4 layers over the coated triangles (about 22k triangles, one draw call); detail 1 and 0 draw the body
and the cards only.

Frog: about 7.1k triangles, 6k vertices, 512 x 512 maps, about 305 KB in the page (`VOXEL=0.0004 TRIS=7200 TEX=512`),
converted to format 2 with `modelpack.py`.

Birds (`VOXEL=0.002 TRIS=6000 TEX=768`): about 6k body triangles and 4k vertices, 768 color and normal maps, 512 baby
maps, a 512 x 256 feather atlas; 38 to 42 KB mesh with baby offsets (format 2; 128 to 138 KB in format 1), 160 to
205 KB of files, about 215 to 275 KB in the page each. In the game about 8.7k to 9k triangles with the feather blades
(about 2k) and eyes. A rebuild of the duck with the scripts here gives the shipped model again (same mesh, maps byte
for byte).

Fox (`VOXEL=0.002 TRIS=7000 TEX=1024`): 7.0k triangles plus 96 in the whiskers; 1024 color (WebP 72) and normal maps,
512 fur map, 512 kit color map: 59 KB mesh and cards + 67 + 33 + 13 + 8 + 4 KB, about 250 KB in the page.

Raccoon (`VOXEL=0.002 TRIS=7000 TEX=1024`): 7.0k triangles plus 96 in the whiskers; 1024 maps (color WebP 60 with
`PAD_SMOOTH`), 512 fur map: 59 KB + 103 + 30 + 13 + 4 KB, about 282 KB in the page.

Otter (`VOXEL=0.002 TRIS=5400 TEX=1024`, then rings across the body and tail): 8.2k triangles plus 144 in the whiskers;
1024 maps, 512 fur and pup color maps: 66 KB + 32 + 54 + 9 + 3 + 5 KB, about 232 KB in the page. The wet coat is
clumps of strands (`_clumps()`: wide tapering strokes, light ridges and dark partings, glossy roughness); pups get a
dry, even coat in their own color map.

Weasel (`VOXEL=0.0008 TRIS=4600 TEX=512`, then rings across the body, neck and tail so it stands up and curls up
smoothly): 7.9k triangles plus 80 in the whiskers; 512 maps, 256 kit color map: 64 KB + 19 + 9 + 3 + 5 + 4 KB, about
145 KB in the page.

Close up (detail 2) the four carnivores' fur shells come to 31k to 35k triangles in one draw call (4 or 5 layers over
the coated triangles); detail 1 and 0 draw the body and the whiskers only (7k to 8.4k triangles).

Deer: 7.2k body triangles plus 126 in the tail fringe cards; 1024 color and normal maps, 512 fawn color map, 512 fur
map, 128 x 128 strand texture: 62 KB mesh + 55 + 52 + 21 + 12 + 8 KB maps, about 287 KB in the page
(`VOXEL=0.0035 TRIS=7200 WEIGHTS=transfer`, about 25 minutes on a busy machine).

Goat: 7.0k body triangles plus 140 in the beard cards; 1024 color and normal maps, 512 fur map, 128 x 128 strand
texture: 56 KB mesh + 64 + 43 + 12 + 8 KB maps, about 251 KB in the page (`VOXEL=0.0025 TRIS=7000 WEIGHTS=transfer`).

Moose: 7.6k triangles; 1024 color and normal maps, 512 calf color map, 512 fur map: 57 KB mesh + 32 + 52 + 11 + 11 KB
maps, about 222 KB in the page (`VOXEL=0.006 TRIS=7600 WEIGHTS=transfer`).

Frog: about 7.1k triangles, 6k vertices, 512 x 512 maps, about 305 KB in the page (`VOXEL=0.0004 TRIS=7200 TEX=512`;
still the older model format, convert with `python3 tools/blender/modelpack.py frog`).

Bunny (`VOXEL=0.002 TRIS=7000 TEX=768`): 7.0k triangles plus 144 in the whiskers; 768 color and normal maps, 384 fur
and kit color maps: 57 KB mesh and cards + 77 + 17 + 9 + 14 + 5 KB, about 245 KB in the page. Fur shells at detail 2:
5 layers, 34k triangles.

Squirrel (`VOXEL=0.0012 TRIS=4800 TEX=768`, then rings across the body and along the tail): 6.7k triangles plus 516 in
the cards (whiskers, ear tufts, 64 tail locks); 768 color and normal maps, 384 fur map, 384 x 256 strand texture: 66 KB
mesh and cards + 48 + 19 + 7 + 48 KB, about 255 KB in the page. Fur shells at detail 2: 5 layers, about 34k triangles.

Hedgehog (`VOXEL=0.001 TRIS=3400 TEX=768`, then rings across the dome): 6.2k triangles plus 2.7k in the cards (1,350
spine cards and the whiskers), 8.9k in all; 768 color and normal maps, 384 fur map, 256 hoglet color map, two 432 x 192
strand textures (spines, the hoglets' pale spines): 80 KB mesh and cards + 64 + 18 + 7 + 5 + 18 + 18 KB, about 286 KB in
the page. Fur shells (face, belly, skirt) at detail 2: 3 layers, 9k triangles.

Dog (`VOXEL=0.0035 TRIS=5000 TEX=1024`, then rings across the body and neck and along the tail): 7.4k triangles plus
244 in the cards (30 wisps of tail feathering and the whiskers); 1024 color and normal maps, 512 fur and puppy color
maps, 256 x 256 strand texture: 76 KB mesh and cards + 58 + 34 + 15 + 9 + 38 KB, about 312 KB in the page. Fur shells at detail
2: 5 layers. About 30 minutes on the shared machine (the coat strokes make `texture` take 12 of them).

Cat (`VOXEL=0.0025 TRIS=4200 TEX=1024`, then rings across the body and neck and along the tail): 7.0k triangles plus 192
in the whiskers; 1024 color and normal maps, 512 fur map, 384 kitten color map, 96 x 128 strand texture: 67 KB mesh and
cards + 62 + 27 + 13 + 14 + 6 KB, about 258 KB in the page. Fur shells at detail 2: 4 layers.

Dog breeds (`dogkit.py`, `TRIS=5000 TEX=1024`, `VOXEL` 0.0036 for the Lab and the Dalmatian, 0.0034 husky, 0.0026
beagle, 0.0016 chihuahua: finer for the smaller dogs): 7.2k to 7.6k triangles plus 64 in the whiskers each; 1024
color and normal maps, 512 fur and puppy color maps, a small whisker texture. Black Lab 115 KB of files (about 153 KB
in the page: a black coat compresses well), Dalmatian 152 KB (203 KB), husky 173 KB (231 KB), beagle 165 KB (220 KB),
chihuahua 147 KB (197 KB). About 15 to 20 minutes each on the shared machine.

Bald eagle (`VOXEL=0.0028 TRIS=6400 TEX=768`): 6.4k body triangles, 9.4k in the game with the feather blades and eyes
(the eaglet's down shells at detail 2: 43k); 768 color and normal maps, 512 baby maps, 512 x 256 feather atlas: 48 KB
mesh + 21 + 40 + 8 + 10 + 9 + 18 + 2 + 8 KB, about 225 KB in the page.

Chickadee (`VOXEL=0.0005 TRIS=6000 TEX=768`): 6.0k body triangles, 8.0k in the game (the chick's shells at detail 2:
35k); same maps as the eagle: 45 KB mesh + 17 + 36 + 6 + 9 + 7 + 19 + 2 + 7 KB, about 206 KB in the page.

Rhino (`VOXEL=0.0085 TRIS=7600 WEIGHTS=transfer TEX=1024`, `PAD_SMOOTH = 3`, normal map WebP 56): 7.6k triangles
(8.3k in the game with the eyes, 8.6k at detail 2); 1024 color and normal maps, 512 calf color map: 56 KB mesh (with
the calf's horn nub offsets) + 44 + 117 + 4 KB, about 297 KB in the page. About 25 minutes on the shared machine.

cards + 58 + 26 + 14 + 15 + 6 KB, about 249 KB in the page. Fur shells at detail 2: 4 layers.

Coat variants on the cat's mesh (`python tools/blender/coat.py <id>`, about 4 minutes each): black cat 25 KB color + 1 KB
kitten color + 5 KB whisker strands, about 44 KB in the page; orange cat 57 + 12 KB, about 93 KB; calico (both sides,
2048 x 1024 and 768 x 384) 113 + 22 KB, about 180 KB.

Siamese (`VOXEL=0.0025 TRIS=4200 TEX=1024`): 7.0k triangles plus 192 in the whiskers; 66 KB mesh and cards + 45 + 29 + 10
+ 4 + 6 KB, about 216 KB in the page. Fluffy white cat (same settings): 5.9k triangles plus 192; 59 KB + 30 + 40 + 15 +
3 + 6 KB, about 203 KB; fur shells at detail 2: 6 layers, at detail 1: 2.

Hamster (`VOXEL=0.0008 TRIS=5200 TEX=768`, then rings across the body): 7.6k triangles plus 128 in the whiskers; 768
color and normal maps, 384 fur map, 256 pup color map: 59 KB mesh and cards + 39 + 14 + 8 + 5 + 4 KB, about 178 KB in
the page. Fur shells at detail 2: 4 layers.

Mute swan (round 12, `VOXEL=0.004 TRIS=6200 TEX=768`, about 15 minutes on the shared machine): 6.2k body triangles,
9.3k in the game with the feather blades and the eyes (the cygnet's down shells at detail 2: 35k); 768 color and normal
maps (WebP 68 and 50), 512 cygnet maps, 384 fur map, 512 x 256 feather atlas: 52 KB mesh with the cygnet's offsets + 27
+ 39 + 10 + 10 + 9 + 18 + 2 + 8 KB, 178 KB of files, about 231 KB in the page plus about 40 KB of icons. The normal map
(the white plumage shows its feathers only as relief) and the mesh are most of it.

Griffin (round 13, `VOXEL=0.0088 TRIS=4000 TEX=768`, about 6 minutes for the whole run on the shared machine): 7.7k body
triangles, 9.8k in the game with the wing blades (10.5k with the eyes at detail 1; 47k at detail 2, where the fur
shells cover the eagle's half too: the chick-cub's down is there, and the grown-up's shader drops it); 768 color and
normal maps (WebP 56 and 44), 256 chick-cub color map, 384 fur map (with the baby-only channel), 512 x 256 feather
atlas and its down atlas: 70 KB mesh with the chick-cub's offsets + 26 + 25 + 5 + 9 + 14 + 2 + 6 KB, 160 KB of files,
about 214 KB in the page plus 36 KB of icons (about 47 KB in the page), about 261 KB in all.

Winged lion (round 13, `VOXEL=0.0092 TRIS=4600 TEX=768`, about 6 minutes on the shared machine): 7.6k triangles plus 224
in whisker cards (about 10k in the game with the 88 wing blades, 2.1k triangles, and the eyes); 768 maps (color WebP 70,
normal 56), 256 cub map, fur and whisker textures, 512 x 256 feather atlas and its down atlas: 74 KB mesh and cards + 29
+ 24 + 5 + 7 + 5 + 15 + 1 + 6 KB, 172 KB of files (round 16b, the lion's new head and mane), about 222 KB in the page plus about 48 KB of icons (36 KB of PNG).
Winged lioness (same settings): 8.2k triangles plus 224; 74 KB + 27 + 17 + 5 + 5 + 5 + 15 + 1 + 6 KB, 160 KB of files,
about 218 KB in the page plus a 19 KB icon (her cub uses the winged lion cub's icon).

Zebra (round 15, `VOXEL=0.0035 TRIS=6500 WEIGHTS=transfer TEX=1024`, about 12 minutes on the shared machine, 8 of them
the texture step): 7.2k body triangles plus 684 in the cards (the mane's fringe, the forelock, the tassel); 1024 color
(WebP 72) and normal (70) maps, 384 foal color map, 512 fur map, two 192 x 256 strand textures (the foal's is brown):
73 KB mesh and cards + 115 + 39 + 28 + 11 + 15 + 15 KB, 299 KB of files, about 399 KB in the page plus 66 KB of icons
(the girl uses the boy's). The color map is most of it: the stripes do not compress. Texture memory with mipmaps: about
13 MB on a computer, about 5.3 MB on a phone (the color and normal maps drawn down to 512).

Narwhal (round 14, `VOXEL=0.007 TRIS=4300 WEIGHTS=transfer TEX=768`, about 4 minutes on the shared machine): 6.6k
triangles (about 8k in the game with the tusk's 1.3k and the eyes); 1536 x 768 color map (both sides, WebP 66), 768
normal map (WebP 56), 512 x 256 calf map: 42 KB mesh + 69 + 8 + 2 KB, 124 KB of files, about 166 KB in the page plus
about 56 KB of icons (42 KB of PNG: the male with his tusk, framed by `SPEC.narwhal.icon`; the girl; the calf) and 22 KB
of code, about 244 KB in all. Texture memory: about 10 MB with mipmaps on a computer, about 2.8 MB on a phone (the color and normal maps
capped at 512).

Round 16b re-sculpts (the same settings and map sizes as before, so the same texture memory; about 6 minutes each
on the shared machine): fruit bat (`VOXEL=0.002 TRIS=6500 TEX=768`) 6.5k triangles, 93 KB of files (89 KB before);
camel (`VOXEL=0.008 TRIS=3700 TEX=768 WEIGHTS=transfer`) 7.2k triangles, 84 KB (83 KB); narwhal (`VOXEL=0.007 TRIS=4300
WEIGHTS=transfer TEX=768`) 6.6k triangles, 113 KB (124 KB: the fine speckles compress better than the blotches; the
mesh is 1.6 KB bigger with the calf's baby offsets).

Manatee (round 15, `VOXEL=0.005 TRIS=4600 WEIGHTS=transfer TEX=1024`, about 5 minutes on the shared machine): 7.0k
triangles (about 8.2k in the game with the 570 triangles of lip bristles and the eyes); 1024 color map (WebP 70; a dark,
even skin compresses to 5 KB), 1024 normal map with the wrinkles (WebP 58), 256 calf color map: 44 KB mesh + 5 + 33 +
1 KB, 85 KB of files, about 114 KB in the page plus about 46 KB of icons (34 KB of PNG). Texture memory: about 11 MB
with mipmaps on a computer, about 3 MB on a phone (the color and normal maps capped at 512).

Round 16 small and tree birds (`TRIS=6000 TEX=768`, a few minutes each on the shared machine; the same maps as the
chickadee: 768 color and normal maps, 384 or 512 baby maps, 384 fur map, 512 x 256 feather atlas): cardinal
(`VOXEL=0.0008`) 6.0k body triangles, 159 KB of files (about 212 KB in the page), the girl's coat (`cardinalf`) 39 KB;
blue jay (`VOXEL=0.001`) 6.0k, 162 KB (216 KB); hummingbird (`VOXEL=0.00031`) 5.9k, 167 KB (222 KB), the boy's coat
(`hummingbirdm`) 42 KB; toucan (`VOXEL=0.0018`) 6.0k, 170 KB (227 KB); snowy owl (`VOXEL=0.0022`) 6.0k, 182 KB (243 KB),
the boy's coat (`snowyowlm`) 41 KB. Texture memory with mipmaps: about 10 to 11.4 MB each on a computer and 6.7 to 8 MB
on a phone (2.8 MB more for a boy's or girl's own coat, only when one is on screen), the same as the chickadee.

Round 16 birds (the steps above; each about 5 to 8 minutes of Blender on the shared machine). Texture memory with
mipmaps, on a computer and on a phone (color and normal maps capped at 512); the maps decode the first time a species
is used:
- Flamingo (`VOXEL=0.004 TRIS=6200 TEX=768`): 6.2k body triangles; 768 color and normal maps, 384 chick maps and fur
  map, 512 x 256 feather atlas: 52 KB mesh + 21 + 37 + 6 + 10 + 6 + 18 + 1 + 7 KB, 164 KB of files, about 219 KB in the
  page. 9.7 MB / 6.4 MB.
- Emperor penguin (`VOXEL=0.004 TRIS=5600 TEX=768`): 5.6k triangles; 768 color and normal maps, 384 chick maps and fur
  map, no feather atlas (no feather blades): 43 KB + 16 + 15 + 7 + 6 + 4 KB, 95 KB of files, about 127 KB in the page.
  8.2 MB / 4.9 MB.
- Atlantic puffin (`VOXEL=0.0011 TRIS=6000 TEX=768`): 6.0k body triangles; the flamingo's set of maps: 48 KB + 23 + 25
  + 3 + 8 + 5 + 12 + 1 + 6 KB, 137 KB of files, about 182 KB in the page. 9.7 MB / 6.4 MB.
- Ostrich (`VOXEL=0.007 TRIS=6200 TEX=1024`): 6.2k body triangles; 1024 color and normal maps, 384 chick maps, 512 fur
  map, 512 x 256 feather atlas: 48 KB + 32 + 65 + 6 + 12 + 5 + 18 + 1 + 8 KB, 201 KB of files, about 268 KB in the page.
  15.0 MB / 7.0 MB. The hen (`ostrichf`, her color map and atlas on his mesh): 54 KB of files (about 72 KB in the
  page), 6.7 MB / 2.7 MB more when she is on screen.
- Peafowl (`VOXEL=0.003 TRIS=6000 TEX=768`): 6.0k body triangles plus the train's 138 eyespot feather blades; the
  flamingo's set of maps (the atlas drawn at 1024 x 512 and saved at 512 x 256: saved at 1024 it cost a phone 4 MB
  more): 49 KB + 46 + 41 + 6 + 10 + 7 + 23 + 1 + 8 KB, 198 KB of files, about 264 KB in the page. 9.7 MB / 6.4 MB. The
  peahen (`peafowlf`): 40 KB of files (about 53 KB in the page), 4.3 MB / 2.7 MB more.

## More cats and a hamster (round 7: `cat.py` as a template, `coat.py`, `hamster.py`)

Five more cats (`blackcat`, `orangecat`, `calico`, `siamese`, `whitecat`) and a Syrian hamster. The tabby got its fixes
on the way (see "The tabby, second pass").
- `cat.py` is a template for the other cats: a breed file sets `BREED` (overrides for the named settings `cat.py`
  reads with `_o()`: the loft tables, eye, nose, mouth and ear placement, the part boxes `BOX`, bounds), runs
  `cat.py` in its own module (`exec`) and then replaces the functions it needs (`head`, `trunk`, `paint`, `fur`,
  `meta`, ...). Every function looks names up in the module it runs in, so a replaced `head()` is the one `shape()`,
  `parts()` and the paint masks use. Settings only read at call time (`PATCHES`, `FUR`, `KITTEN`, colors) can simply
  be reassigned after the `exec`.
- Coat variants share a mesh (`coat.py`): `blackcat.py`, `orangecat.py` and `calico.py` set `BASE = 'cat'` and only
  paint. `python tools/blender/coat.py blackcat` (Blender's Python, after the cat's own pipeline) reads the cat's work
  files (game mesh, UV layout, bake), runs the variant's `paint()` and `baby_paint()` and writes its color maps and a
  json naming `"base": "cat"`. The game takes the mesh, skin weights, fur, cards and every map the variant does not
  bring (normal, fur, hair) from the base model, so a variant costs only its color maps (black cat 32 KB, orange cat
  and calico about 90 KB in the page). Options: `OWN_HAIR` (its own whisker strands: the black cat's are dark),
  `OWN_FUR`, `COAT_FUR` (fur settings over the base's), and in `meta()` `roughK` (scales the shared roughness).
  Rerun the variants whenever the base model is rebuilt: their maps use its UV layout.
- `SIDES` (the calico): the game mirrors one half of the body, so a painted pattern is the same on both sides, which
  a calico's patches never are. `coat.py` then paints the -x side too (the paint at mirrored points) into maps twice
  as wide (+x left, -x right) and the json says `"sides": true`; the model shader picks the half by the side of the
  vertex in the rest pose and samples with the derivatives of the whole layout, so the middle line has no seam. Only
  the color maps double; the normal and fur maps stay shared.
- A black coat that does not read as a hole: a warm black, not pure black, with coat strokes whose tips catch the light,
  a faint rusty cast along the back. A variant's paint roughness is not used (the roughness per vertex comes with the
  shared mesh); `roughK` scales it: 1.08 for the black cat, whose highlights show more on the dark coat (at 0.84 it
  looked like black plastic).
- The Siamese (`siamese.py`): a slimmer trunk and neck, slender legs with small oval paws, a thin whip tail, a long
  wedge head (the top line runs straight from the crown to the nose, the sides narrow evenly, flat cheeks, narrow
  whisker pads), big ears set low and wide (the ear bone moves with them: the species' spec in the game), almond eyes
  slanted up (`SLANT` 0.3) sunk deeper (`SINK` 0.58: on the narrow head the game's eye ball stood out of the lids) with
  the game's lids drawn as an almond (`lid` in `meta()`). The points come from 3D masks: the mask over the whole face
  (the lids and the skin round the eyes are not part of the head's own field, so they need their own ring), the ears,
  the legs from the elbows and hocks down, the tail. Short close-lying coat: the cat's fur lengths times 0.45, `lean`
  2.2. Kittens are nearly all cream with the first faint fawn-gray on the ears, nose and tail.
- The fluffy white cat (`whitecat.py`): the sculpt is the body inside the coat plus the coat's volume, since far away
  (no shells) the silhouette has to be fluffy by itself: about 11 mm over the trunk, a ruff around the neck that falls
  over the chest, britches, a plumed tail, stockier legs, soft clumps of locks over all of it (`_locks()`, a low
  frequency noise of a few mm) and wider blends (its own `shape()`), so the coat runs smoothly over the shoulders and
  thighs. A round head with full cheeks and a short broad muzzle, big round copper eyes set wide, small ears with
  rounded tips set wide and low (a finer grid in height across them too: the small round tips came out saw-toothed).
  Long fur shells close up (`len` 0.038, 6 layers, `lean` 0.55, a darker lowest layer `shade` 0.6 for depth) and 2
  layers at detail 1 (`n1`). White whiskers (its own strand texture).
- The tabby's `grid()` (finer z and x spacing across the ears) suits every cat; the ears of a cat are thin plates
  facing forward, and on the plain 2.5 mm grid they came out torn, which showed as ragged spikes in the game.

### The tabby, second pass

- Ears: thicker plates (3.5 to 1.6 mm), the finer grid across them, more triangles kept on them, and no fur shells
  along their rims (only a little at the base and in the middle of the inside): the ragged spikes are gone.
- Eyes: a smaller, more almond opening (`LID_W` 0.0079, `LID_H` 0.0055, `SLANT` 0.21) and a narrower, fainter pale ring
  round them. Eyebrow whiskers shorter and pale (long ones with dark roots read as spikes over the ears).
- Coat: the necklaces thinner, fewer and broken, the nape lines and belly spots softer (the neck and chest read as a
  zebra's).
- Kittens: bold fuzzy stripes (a tabby kitten's pattern is clear, the first one was washed out), the top of the thigh
  pulled in against the body in the baby offsets (it stood out over the hip once the game shortened the legs), and in
  the game a shorter body and legs that do not thicken (`modelSpec.baby`).
- Sitting: the tail curls round to the front paws (`sit.wrap` in the game: each tail bone turns its segment toward a
  direction on the ground, in the rig's frame, blended in with the sit).

### The hamster (`hamster.py`)

A Syrian (golden) hamster, 15 cm: a round compact body with the belly close to the ground, a big head that runs into the
body, full cheek pouches, small round thin ears, shiny black bulging eyes, a small pink nose over a split lip,
whiskers, short legs (only the forearms, the little pink hands with four fingers and the long pink hind feet show) and a
stub of a tail. Golden with darker ticking along the back, white belly, chest, chin and lower cheeks, a dark cheek
flash behind each pouch. Things that are new:
- Cheek pouches: cheek bones (`cheekL`, `cheekR`, children of the head) and the pouch skin weighted to them; the game
  scales them up as the hamster eats (`anim.cheeks`, `cheekPuff`: they fill while it eats and empty over about 14 s).
- Eating sitting up (`anim.eatUp`): it grabs the food with its head down, then sits up on its hind legs with its front
  paws at its mouth and nibbles (the sit-up pose and `sitPaws`), and drops back down at the end.
- A tiny animal: `VOXEL=0.0008`, bake distances in millimeters (`BAKE_DIST`), maps at 768, eyes 3.4 mm across.

Cockatiel (`VOXEL=0.0009 TRIS=6000 TEX=768 WEIGHTS=transfer`): 6.0k body triangles plus about 1.9k in the feather
blades (wings, tail, crest) and the eyes, 8.6k in the game; 768 color and normal maps, 512 chick maps, 512 fur map, a
512 x 256 feather atlas: 46 KB mesh + 16 + 50 + 13 + 11 + 10 + 20 + 2 + 9 KB, 183 KB of files, about 244 KB in the page.

Crocodile (`VOXEL=0.006 TRIS=3300 TEX=704 WEIGHTS=transfer`; TRIS here gives about twice as many in the game mesh):
7.9k triangles; 704 color and normal maps (WebP 60 and 52), 384 hatchling color map: 62 KB mesh + 46 + 81 + 31 KB,
222 KB of files, about 296 KB in the page. About 10 minutes for the whole run on the shared machine.

Brachiosaurus (`VOXEL=0.03 TRIS=5300 TEX=1024 WEIGHTS=transfer`): 8.5k triangles; 1024 color (WebP 68) and normal (WebP
50) maps, 384 hatchling color map: 58 KB mesh + 18 + 123 + 4 KB, 206 KB of files, about 275 KB in the page. About 4
minutes for the whole run. Round 16b (`TRIS=5700`): 8.7k triangles, 61 KB mesh (with the hatchling's arch offsets) + 25
+ 121 + 4 KB, 213 KB of files, about 284 KB in the page. Texture memory with mipmaps (unchanged): about 12 MB on a
computer, about 3.6 MB on a phone (the color and normal maps capped at 512).

T. rex (`VOXEL=0.03 TRIS=4400 TEX=768 WEIGHTS=transfer`): 6.9k triangles; 768 color (WebP 64) and normal (WebP 34) maps,
256 hatchling color map, 384 fur map: 55 KB mesh + 14 + 51 + 3 + 8 KB, 134 KB of files, about 190 KB in the page plus
about 33 KB of icons (the round 10 budget is about 220 KB per animal, icons included). Round 16b (same settings): 6.9k
triangles, 56 KB mesh + 22 + 64 + 3 + 8 KB (the countershading and the deeper pebbles cost about 21 KB), 155 KB of
files, about 207 KB in the page. Texture memory with mipmaps (unchanged): about 7.4 MB on a computer, about 3.9 MB on a
phone.

Giraffe (`VOXEL=0.02 TRIS=3600 TEX=768 WEIGHTS=transfer`): 6.4k triangles; 768 color (WebP 40: the patch pattern is
most of the bytes) and normal (WebP 44) maps, 192 calf color map: 48 KB mesh + 58 + 18 + 9 KB, 135 KB of files, about
192 KB in the page plus about 45 KB of icons.

## Round 10: the polar bear (`polarbear.py`)

A polar bear, 2.45 m from the nose to the tail and 1.3 m at the shoulder, in meters like the other big animals (the
cat template's numbers are cat sized; a bear is its own file in the cat file's layout). Things that are new:
- The long coat is part of the sculpt (about 5 to 10 cm over the body, soft clumps of locks from a low frequency
  noise, `_locks()`), with long fur shells over it (`len` 0.1, 5 layers), so it is bulky and a little shaggy far away
  too. Its outline needs thick legs: as tubes under a fluffy body the legs read thin and the bear read as a sheep.
- A long narrow head with a Roman nose (a ridge down the top of the muzzle), small round furry ears, small eyes, a big
  black nose pad with slit nostrils, black lips painted as a thin band only toward the front (a wide band all along the
  mouth read as a painted smile).
- Plantigrade hind feet: the heel (`HEEL`) on the ground behind a long sole (`CV.paw` with a long pad); the front paws
  turned in (`yaw` -0.18, the pigeon-toed walk). The game's rolling walk is `anim.roll`.
- Swimming low with the head and the back above the water: `floatDepth` 1.12 and, in the game, `anim.swimTrail` (round
  10): the hind legs trail behind with a small kick while the front legs paddle.
- The collar: the neck is carried low, so a slice across it also cut the front paws and the shoulders below it; the
  collar sits near the head (`at: ['neck2', 'head', 0.3]`) and ignores anything farther than `maxR` 0.3.
- Budget (`VOXEL=0.01 TRIS=5600 TEX=768`, then rings across the body and the neck): 8.0k triangles, no cards; 768 color
  and normal maps (normal WebP 58), 384 fur map, 256 cub color map: 70 KB mesh + 22 + 15 + 7 + 2 KB, about 160 KB in the
  page plus about 30 KB of icons.

## Round 10: big cats on the cat template (`bigcat.py`, `snowleopard.py`)

A big cat is the house cat scaled up: `bigcat.load(breed)` runs `cat.py` in its own module with the breed's overrides
(its own TRUNK, NECK, HEAD, TAIL tables and landmarks, in cat units), the breed replaces the functions it needs there
(`C.paint = paint`, `C.head = head`; inside them it calls the template's hooks as `C.x`), and
`bigcat.install(globals(), C, KS)` sets the pipeline's hooks in game meters: points are divided by KS on the way in and
lengths multiplied by KS on the way out (shape, parts, grid, weights, rings in `lowpoly_fix`, meta, kitten offsets,
whisker cards). All of the cat's masks, weights, coat strokes and kitten offsets work unchanged at any size. The game's
skeleton is `SPEC.cat()` scaled by the same factor (`bigCat(k)` in 40_animals.js), with any bones the breed moves (its
own tail) moved the same way in both places.

`cat.py` takes three more overrides for this (its own defaults are unchanged, so the cats' files are too):
`TAIL_BONES` and `TB` (a tail with more or fewer bones: the tail weights are spread over however many there are) and
`TAIL_TD` (how far from the tail's middle line a point still rides on the tail bones: a thick tail needs more).

The snow leopard (KS 2.5: about 1.2 m from the nose to the rump, a 1 m tail):
- A deeper, wider body than the house cat's (the belly lower, so the legs look shorter), a thick neck and a full
  throat, stout legs (`_stout`: the leg sections thickened most at the foot) on big round paws, small rounded ears,
  smaller eyes with round pupils (a big cat's pupils are round; the house cat's slit pupils and big eyes made it read
  as a white kitty).
- A long thick tail on four bones, carried low and curling up at the tip (the cat's tail has three).
- A coat in the sculpt (about 1 cm, `_locks()` noise) under long fur shells. The coat on the thighs fades out over the
  hips: it made the thigh tops stand up over the back, worse on a cub.
- Paint: smoky gray along the back, pale gray-cream sides, white underneath; open broken rosettes on the body (Worley
  rings), small solid spots on the head and the legs, blotches and then rings on the tail and a dark tip. The first
  palette rendered nearly white in the game's sunlight; the coat colors are about 20% darker than they look in a
  photo. Cubs: grayer, with bold solid spots.
- Budget (`VOXEL=0.0062 TRIS=4600 TEX=768`): 6.5k triangles plus 192 in whisker cards; 768 maps (color WebP 62,
  normal 54), 256 cub map (`BABY_TEX`), fur and whisker textures: 63 KB mesh + 41 + 11 + 8 + 7 + 5 KB, about 187 KB in
  the page plus about 31 KB of icons. (The rosettes make the color map the biggest of the three big cats'.)

The saber-toothed cat, Smilodon fatalis (`smilodon.py`, KS 3.8: about 1.85 m from the nose to the rump, 0.95 m at the
shoulder):
- A heavy deep body, the back sloping from high humped shoulders (a big round cone over the shoulder blades) down to the
  hips, very thick forelegs (`_stout` plus a great upper arm and forearm), big paws, a thick neck. The thigh tops are cut
  off under the line of the back (`smax` with a plane): the house cat's thighs stood up over the hips.
- A bobtail on two bones (`TAIL_BONES`, `TB`).
- Its own `head()`, the house cat's with the muzzle lengthened (the head table's front rows and every muzzle part moved
  forward by `_MS`: the house cat's short flat face read as a hamster with tusks), a lower forehead, brows over smaller
  deep-set eyes, a bigger nose, and the flange of the lower jaw as a deep flat-fronted chin.
- The sabers: two curved blades (round cones flattened across, `fang()`), set outside the lower jaw so they show from
  the upper lip down (set inside it they showed only below the chin). Painted ivory from the same distance function,
  no fur on them, kept by the decimation (`keep`), in the head's UV island, weighted to the head bone. A kitten's are
  pulled up toward the gum in its baby offsets, so only the tips show.
- A plain tawny coat, short (fur shells at 55% of the cat's lengths), faint darker spots, a pale muzzle and chin with
  dark whisker spots, a dark tip to the tail. Kittens: bold dark spots. Whisker cards as the cat's.
- Round 16b: the lion's head frame (`PT.DropFrame`) and skull (cheekbones, the heavy brow, a low flat crown, a long deep
  square muzzle, a bigger nose); the upper lips hang in deep flanges over the roots of the sabers, the chin flange is
  deeper and squarer with a long deep jaw behind it, and the sabers are a little longer so they reach well below it; no
  tear lines (on the new brow they read as a frown); a heavier neck, thicker forelegs and a bigger hump over the
  shoulders; the spots a little smaller and clearer, a darker line down the back. The game shortens a kitten's muzzle
  (`modelSpec.baby.muzzle` 0.8).
- Budget (`VOXEL=0.0085 TRIS=4800 TEX=768`): 6.7k triangles plus 192 in whisker cards; 768 maps (color WebP 72, normal
  58), 384 kitten map, fur and whisker textures: 65 KB mesh + 26 + 15 + 9 + 5 + 6 KB, 130 KB of files (round 16b), about
  174 KB in the page plus about 36 KB of icons.

Fruit bat (`VOXEL=0.002 TRIS=6500 TEX=768`, normal map WebP 64): 6.5k triangles (7.2k in the game with the eyes, 15.6k
at detail 2 with 4 fur shell layers); 768 color and normal maps (the membranes get a smaller share of them,
`uv_weight`), 256 pup color map, fur map: 45 KB mesh + 12 + 20 + 1 + 8 KB, about 120 KB in the page, 190 KB with its
two icons. The procedural butterfly (2.9k triangles, 3.7k at detail 2) and caterpillar (2.2k) add only code and icons.

Cow (`VOXEL=0.0065 TRIS=4000 TEX=768 WEIGHTS=transfer`, then rings across the neck, the legs and the tail): 6.4k
triangles (7.4k in the game with the eyes); 768 color map with both sides (1536 x 768, WebP 74) and 768 normal map
(WebP 58), no calf map (the calf has the same patches): 38 KB mesh (with the calf's udder offsets) + 32 + 15 KB, about
116 KB in the page plus about 61 KB of icons. About 9 minutes for the whole run on the shared machine.

Camel (`VOXEL=0.008 TRIS=3700 TEX=768 WEIGHTS=transfer`, then rings across the neck, the legs and the tail): 7.3k
triangles (8.0k in the game with the eyes; the calf's fur shells at detail 2 on top); 768 color (WebP 72) and normal
(WebP 58) maps, 256 calf color map, 384 fur map (calf only): 49 KB mesh (with the calf's hump offsets) + 12 + 14 + 1 +
5 KB, about 112 KB in the page plus about 55 KB of icons. About 9 minutes for the whole run.

Leopard gecko (`VOXEL=0.0004 TRIS=4400 TEX=512`, then the body seams and rings): 7.2k triangles (7.9k in the game with
the eyes); 512 color map with both sides (1024 x 512, WebP 50), 512 normal map (WebP 42), 256 hatchling color map with
both sides (512 x 256): 47 KB mesh + 48 + 42 + 11 KB, about 199 KB in the page plus about 28 KB of icons. The granules
make the normal map the biggest part; at 640 it was 78 KB.

## Round 11: the winged cat and the unicorn (`wingcat.py`, `unicorn.py`)

Two legged animals with feathered bird wings: the birds' wing (bones and atlas blades, `stdWing`) grafted on a cat
and a horse.
- In the game each spec adds the bird wing bones (`wingL`, `wforeL`, `whandL` and the feather bones) with `parent:
  'chest'`, and `spec.feathers` returns the atlas blades for the model (procedural blades for the fallback body).
  `anim.wings` (round 11, `animLegged`; null for every other species) poses them with the bird animator's linkage:
  folded along the back on the ground, half open and shaken when happy, beating with glides between a few beats in
  flight (`every`, `beats`, `climb` as the eagle's soar), the body bobbing a little with each downstroke (`bob`), the
  legs tucked in their own flight pose (`legs.f`, `legs.h`: up and forward in leg heights, flex, toe curl). The folded
  wings take the chest's own pitch and yaw back out, so they stay along the back while the chest bends to eat, sit or
  curl up asleep. `spec.lowerBlink = false` keeps the mammal's upper lid blink (a spec with `feathers` blinks like a
  bird otherwise).
- The folded pose: the shoulder pivots sit on top of the back, so a bird's folded wing (trailing edge up over the
  back) stood up like a fin, and lower rolls sank it into the coat. What works is a moderate roll (-30 for the cat,
  -40 for the unicorn) with `foldedPos` lifting the shoulder out of the coat and a little out to the side; the wings
  then lie on the back like a cape and cover it from above. `wtune.py`-style tuning (set the shoulder bones by hand
  after the animator has folded everything else) saves a rebuild per try.
- The sculpt has the feathered wing arm (`bird.wing_arm`) in the rest pose, spread straight out from the shoulder
  pivot, so the bounds reach out along x: `grid()` takes coarse steps out along the wing (it changes slowly along its
  span), fine ones across its thickness, and the unicorn evaluates the horse only within its own box. The arm's skin
  weights are set in `fix_weights` (place along the span, blended at the joints, the root into the chest over a few
  centimeters); nothing else may keep weights on the wing, horn or feather bones (the procedural rig's blades and horn
  tube are in the weight transfer source). Rings across the arm only around the shoulder, elbow and wrist (rings all
  along it took 1,500 triangles). The arm is painted with `bird.plumage` coverts and has no fur shells.
- Each writes its own feather atlas (`extra_maps` / `export_extra`: only the atlases, not the birds' baby maps) with
  five cells (primaries, secondaries, greater and lesser coverts, tertials) and a down atlas for the babies' wings.
- Winged cat: the tabby template with a silver mackerel tabby palette (the cat's `K`, about 20% darker than it looks:
  the first try rendered white with black stripes), green eyes, barn-owl gray wings (coverts finely peppered, flight
  feathers paling to white with faint bars). Kittens: the tabby kitten's body and stripes, small down wings
  (`baby.wing` 0.5). It still climbs like the other cats.
- Unicorn: the horse template run in the module with its parts replaced: a white coat with faint dapples (a strong
  Worley net read as a giraffe's patches), a gray-pink muzzle, dark skin round the eyes, pale hooves; the spiral horn
  (two grooves wound 4.5 times, ivory with gold in the grooves and a faint pearly tint), its base weighted from the
  head onto the horn bone over the first 9 cm, so the foal's horn (the game scales the bone away) draws in to a round
  bud; feathering (a sculpted bell of hair over each hoof under long fur shells, and cards hanging from the fetlocks);
  a longer mane (two layers walking over the neck), a forelock parted round the horn, a longer, fuller tail, and a
  strand texture with pastel tips (pink, lavender, blue, mint, peach) in its columns. The wings are a swan's (s 6, 5 m
  across), white, beating slowly (1.5 a second).

Winged cat (`VOXEL=0.0025 TRIS=3300 TEX=768`): 7.3k triangles plus 192 in the whiskers (10.0k in the game with the
wing blades and eyes, 29k at detail 2 with 4 fur shell layers); 768 color (WebP 56) and normal (44) maps, 256 kitten
color map, fur map, feather atlas 512 x 256 and its down atlas: 69 KB mesh and cards + 33 + 16 + 7 + 8 + 6 + 13 + 1 +
4 KB, about 220 KB in the page plus its two icons (29 KB).

Unicorn (`VOXEL=0.0045 TRIS=4400 TEX=768`): 6.7k triangles plus 1.7k in the hair cards (11.5k in the game with the
wing blades and eyes, 19.8k at detail 2 with the fur shells); 768 color (WebP 68) and normal (46) maps, 256 foal color
map, fur map, 192 x 256 strand texture, feather atlases: 78 KB mesh and cards + 16 + 23 + 2 + 5 + 18 + 12 + 1 + 4 KB,
about 222 KB in the page plus its two icons (43 KB). About 15 minutes for the whole run on the shared machine.

## Round 11: the lion, the tiger and the leopard (`panthera.py`: `lion.py`, `tiger.py`, `leopard.py`)

Three big cats of the genus Panthera on the cat template, built the way the snow leopard is (`bigcat.py` underneath),
with what they share in `panthera.py`: `load(ID, T)` runs `cat.py` with the species' tables and landmarks from the dict
`T` (cat units), `setup(C)` installs the shared parts, and the species file replaces what it needs before
`PT.install(globals(), C, KS)`. In the game, `bigPanthera(k, o)` (40_animals.js, in the lion's block) does the same for
the three specs: the scaled cat with the species' own tail bones and fallback tail, round pupils, a big cat's walk and
short charge, asleep flat out.
- The head. With the house cat's head scaled up (wide set eyes, a short muzzle level with them, round full cheeks) all
  three read as hamsters close up. A big cat's face is long: the muzzle is longer (`MS`, every muzzle part moved
  forward, as the saber-toothed cat does), the head is pitched down a little more (`HF`), and the muzzle drops away in
  front of the eyes (`DROP`: `DropFrame` is a head frame whose up coordinate is sheared in front of `s0`, so the muzzle
  parts, the paint masks and the whiskers placed in the frame all come down with it). The eyes sit closer together
  (about 0.016 from the middle instead of 0.019), the cheeks are smaller, the whisker pads bigger (`PAD_X`, `PADS`) and
  the nose leather bigger. The loft's last row must stay narrow: a wide square end swallowed the pads and the nose and
  made a capybara.
- `coat()` is the one painter: the ground colors (darker along the back, warmer low down, pale underneath), the face
  (white muzzle and chin, pale marks under and over the eyes, `EYE_PALE`), black lips and whisker spots, the nose with
  its dark rim (`NOSE_MOTTLE`), dark ear backs with an optional pale spot (`EAR_SPOT`: 1 for the tiger, 0.55 for the
  leopard), the coat strokes, and hooks for the species: `pattern` (stripes, rosettes), `extra` (the mane), `tail_tip`,
  and `cub` for `baby_coat()`.
- Shared tools options (off for every other species): `finish_baby` (texture.py, passed on by bigcat.py) folds less of
  the sculpt's occlusion into a baby's color map.
- Round 16b switches in `panthera.py` (off for the leopard and the griffin, whose renders stay the same): `HEAD_X` (the
  species' own head parts, added before the nose leather and the mouth lines are cut), `BROW` None (no stock brow, for a
  species that sculpts its own in `HEAD_X`), `EYE_UNDER` and `EYE_OVER` (where the pale marks under and over the eye sit,
  as offsets from the eye; the old places lie inside the head once the cheekbones and the brow stand out past the eye).
- Round 16b heads (the lion, the lioness, the tiger and, on its own file, the saber-toothed cat): the old ones read as a
  capybara's dome (the frame pitched 15 degrees and the muzzle dropped 0.38 put the nose 10 cm below the eye and only 15
  cm in front of it). Now the head frame is pitched 10 degrees and the muzzle dropped 0.15, the crown is flatter, the
  skull widest at the cheekbones just behind and under the eyes (`HEAD_X`), a heavy brow ridge over each eye that the eye
  sits forward under, and a long, square muzzle (loft exponents about 3) with a broad flat bridge (`BRIDGE`), bigger
  whisker pads and a bigger nose leather. The pale marks under the eyes and the faces' paint follow the head frame.
  Quick previews without Blender (marching cubes over the head's box and a flat render of the sculpt with its paint, a
  few seconds each) were enough to shape them; check at the game camera after export, the fur shells soften the forms.

The lion (`lion.py`, KS 4.2: about 2.05 m from the nose to the rump, 1.05 m at the shoulder, a 1 m tail with its tuft):
- The mane is part of the sculpt, so it keeps its outline far away: a ruff framing the face, sideburns over the
  cheeks, a heavy sheath down the neck (a sweep along the neck), a cape over the shoulders and a fringe down the chest,
  cut clear of the face (`_face_cut`: the front edge runs behind the eyes, further back on top and further forward
  under the chin), with a hollow round each ear so the ears stand free, and hanging locks (noise stretched across the
  hair). Long fur shells over it (up to 5.5 cm), tawny gold round the face darkening to brown and nearly black at the
  back and on the chest, in streaks, with longer coat strokes (`lenk`). The ruff rides on the head bone
  (`fix_weights`), so the face does not pull out of it when the lion eats; the game's fallback has a mane loft too,
  which also gives the sculpted mane its skin weights.
- Round 16b: the mane no longer reaches the cheeks or the crown: it starts behind the cheekbones and, on top, between the
  ears (`_face_cut`), the ruff is narrower, it hangs in locks (`_locks`: a noise stretched along the hair, down and back,
  folded at its middle so the locks are round with sharp partings) and its edge over the shoulders and under the chest is
  ragged (a low noise added to the field there; the shoulder part ends a little further forward so the tongues stay
  inside the neck's box). Paint: gold ruff to about 7 cm behind the face, darkening behind in streaks along the locks, the
  thin rear edge lighter and running out into the coat in tongues (`extra`); a ruddier bridge and a dark edged nose
  (`face_x`, `nose_edge`, also the lioness's), a darker back (`BACK_K` 0.7). The cub's nose is pink, and the game shortens
  its muzzle (`modelBaby.muzzle` 0.78 in `SPEC.lion`, also the winged lion's cub).
- Cubs have no mane: their baby offsets pull every mane vertex in onto the body under it (`body0()`, the lion without
  the mane), their color map paints the coat that would be there (`coat()` without the mane hook), and they take less
  of the sculpt's occlusion (`finish_baby`), or the mane's locks and the crease under it showed as a gray cape.
  The mane's fur shells stay a little longer on a cub's neck (the fur length per vertex is shared). Faint spots on the
  legs and belly, a small dark tail tip, a bigger head in the game (`baby.head` 1.75 for the three).
- Budget (`VOXEL=0.0092 TRIS=5000 TEX=768`): 6.8k triangles plus 224 in whisker cards; 768 maps (color WebP 70, normal
  56), 256 cub map, fur and whisker textures: 73 KB mesh and cards + 29 + 23 + 5 + 7 + 5 KB, 146 KB of files (round 16b;
  138 KB before, the mane's locks are in the normal map), about 195 KB in the page plus about 33 KB of icons. About 12
  minutes for the whole run on the shared machine.

The Bengal tiger (`tiger.py`, KS 4.0: about 1.95 m from the nose to the rump, 1 m at the shoulder, the house cat's tail
made thicker, about 1.05 m):
- A long low body with a loose belly fold, heavy shoulders and forelegs, a round head with a ruff of fur flaring over
  the cheeks (`RUFF`, part of the head's field), a broad muzzle, small round ears set wide with a white spot on each
  black back (`EAR_SPOT`).
- The stripes come from `_bands()`: one group of stripes per whole number of a coordinate, each group a single stripe
  or a pair that forks (the gap between the two opens toward one end), each with its own length and tapering to points
  at both ends. Down the flanks the coordinate runs along the body and leans back lower down, and the stripes stop a
  little short of the spine (the half body is mirrored, so stripes reaching the spine would join their twins into bands
  across it); gentle arcs round the haunch on the thighs (from a far center: a near one drew targets); few on the
  shoulders and forelegs; broken bars across the forehead (wavy lines there read as a zebra's), lines back over the
  crown and the white cheeks, a line back from each eye; rings on the tail and a black tip. White on the belly, the
  insides of the legs, the chest, the cheeks and the ruff, the muzzle and chin, and a spot over each eye; no pale ring
  round the eyes (`NO_EYERING`: the house cat's ring made goggles).
- Cubs wear the grown-up's coat (no cub color map: the stripes would cost the page as much again); their fluff is the
  longer fur shells, and the game gives them the big head and paws.
- Round 16b: the head as the lion's (broader, a shorter muzzle), the ruff moved down to the jaw and grown out of the cheek
  (in `HEAD_X`, blended wider than the `RUFF` hook) in locks; a bigger nose; the white of the cheeks reaching up under the
  eyes, a big white spot over each eye on the skin (`_brow_spot`, `EYE_OVER`), and the face's own stripes: bars across
  the forehead from just over the brows, short in the middle and longer out to the sides, three bold stripes down and
  back across each white cheek into the ruff, a line back from the eye; a richer orange, deeper along the back and paler
  toward the belly. The game shortens a cub's muzzle (`modelBaby.muzzle` 0.8).
- It swims: low in the water (`floatDepth` 0.23 times k), the head and the top of the back out, paddling.
- Budget (`VOXEL=0.0088 TRIS=4300 TEX=768`): 6.5k triangles plus 224 in whisker cards; 768 maps (color WebP 52: the
  stripes are most of the bytes, normal 50), fur and whisker textures: 64 KB mesh and cards + 53 + 14 + 6 + 5 KB, 145 KB
  of files (round 16b), about 193 KB in the page plus about 31 KB of icons.

The African leopard (`leopard.py`, KS 2.7: about 1.3 m from the nose to the rump, 0.65 m at the shoulder, a 0.95 m tail
on four bones):
- A long slender body with a deep chest, short strong legs on big paws, a broad round head with a strong jaw, small
  round ears, the snow leopard's four-bone tail made thinner, hanging low with the tip curled up. It climbs (the cat's
  climbing, the tail held out).
- Rosettes (`spots()`): a coarse cell grid gives each rosette's ring (a band round the cell's point), a fine grid breaks
  the ring into blobs (three to six round each center), and the center is a little darker than the ground. Thin rings
  of small dots read as a cheetah's: the blobs are wide enough to join into broken rings. Solid spots on the head
  (small), the neck and the legs, blotches on the white belly, spots then rings on the tail and white under its tip,
  black ear backs with a soft pale spot (`EAR_SPOT` 0.55).
- Cubs: grayer and woolly, the same pattern softened into smudges (`soft`).
- Budget (`VOXEL=0.0062 TRIS=4200 TEX=768`): 6.7k triangles plus 224 in whisker cards; 768 maps (color WebP 40: the
  spots are most of the bytes, normal 46), 192 cub map, fur and whisker textures: 65 KB mesh and cards + 47 + 13 + 5 +
  5 + 5 KB, 144 KB of files, about 192 KB in the page plus about 28 KB of icons.

## Round 11: more lizards on one template (`lizkit.py`: `beardeddragon.py`, ...)

The lace monitor (`lizard.py`) stays as it is; the round 11 lizards share `lizkit.py`, a template made from it. A species
file loads the template into its own module (`M = lizkit.load(id)`), sets its tables and landmarks in base units (an
animal about half a meter long, so the template's blend radii, bake distances and scale sizes fit), replaces the
functions it needs (`M.paint = paint`, they look names up in M when called) and calls `lizkit.install(globals(), M, KS)`,
which scales every pipeline hook by KS on the way out, as `bigcat.py` does for the big cats. The template has:
- the body as one loft from the tail tip to the snout (`BODY`: z, top, height of the widest line, bottom, half width,
  exponents), ellipsoids added to it (`BLOBS`: girdles, throat) and to the head (`HEAD_BLOBS`, `SNOUT`, `MANDIBLE`),
  the nostril, ear opening, mouth groove along `MOUTH_LINE` and the eye (lid mound, opening, ball; `seat_eye()` puts
  the ball into the side of the head instead of standing out of it like goggles), legs as capsule chains with joint
  balls and a sole (`FLEG`, `HLEG`), toes with hooked claws (`F_TOES`, `H_TOES`), and `EXTRAS` (named fields unioned
  into the body: spikes, crests, dewlaps; `cones()` and `crest()` help build them);
- skin weights made entirely from the sculpt and the game skeleton's pivots (read from the rig export): the trunk, neck,
  head and tail as one chain along the middle line (each bone owns the stretch from its pivot to the next, blended over
  a few mm), each leg along its own bones and into its girdle, a vertex counted as leg where the leg's field is nearer
  than the body's;
- rings across the body, tail and legs (`BEND_PITCH`; fewer through a wide trunk, they cost triangles), texture regions
  (head, trunk, tail in parts, legs, feet) with the head getting more of the map (`UV_HEAD`);
- scales as a height field per texel: granular beads, keeled rings round the tail, rows of belly plates, lip plates;
  `regions()` gives the paint its masks (head, tail, legs, belly, lips, eye, claws, the extras').

The game side is the same idea: `lizardKin(o)` in `40_animals.js` makes a species' spec from its bones and loft rows in
base units and `o.k` (the procedural body is the Blender file's loft, so the rig the sculpt is fitted to matches it).

The bearded dragon (`beardeddragon.py`, Pogona vitticeps, 50 cm, KS 1): a wide flat body, a broad triangular head with a
short blunt snout (the first one read as a monitor until the snout was shortened and deepened), the beard as a full
throat pouch with rows of soft spines along the jaw and across the throat, tufts of spines round the ear and behind the
jaw angle, a fringe of spikes along each flank and spiky scales over the back (about 90 cones per side, `spike()`),
stout legs and a thick thigh. Sandy tan with an orange wash over the head, two rows of darker blotches down the back,
a banded tail, a pale belly; the flanks below the fringe keep most of the body color (a pale band there looked wrong).
The hatchling has its own color map (the markings bolder). In the game it does push-ups and bobs its head.
Round 16b (the audit found a smooth orange loaf of a head with the eyes lost in it and a monitor's body): the head is a
broad triangle seen from above (straight sides tapering from the spiky jaw corners to a blunt snout, the snout top
sloping down to it; the old snout stayed wide to its tip), a bigger eye (`EYE_R` 4.2 mm, set in by `seat_eye()`) under a
longer brow ridge, a brighter iris; longer, thicker spikes round the sides of the head, along the jaw edge (sticking out
sideways and down, so the beard shows from the side) and in the flank fringe; the tail a tenth shorter (`_tail_z()`)
and thicker at its base; a softer orange wash and fainter blotches and bands. All of it is in `beardeddragon.py`
(`lizkit.py` is unchanged).
- Budget (`VOXEL=0.0012 TRIS=2900 TEX=768`, `BEND_PITCH` 13.5 and 5 mm): 7.0k triangles; 768 color (WebP 50) and normal
  (WebP 32) maps, 320 hatchling color map: 52 KB mesh + 47 + 48 + 13 KB, 163 KB of files, about 217 KB in the page plus
  about 23 KB of icons. The per-scale color jitter and the dark grooves cost most of the color map: keep them soft.
  Round 16b (same settings): 6.7k triangles, 52 KB + 46 + 51 + 14 KB, 163 KB of files (the same). Texture memory with
  mipmaps (unchanged): about 6.8 MB on a computer, about 3.3 MB on a phone.

The green iguana (`iguana.py`, Iguana iguana, 1.5 m, KS 3): a body a little flattened from side to side on long legs with
long toes (the fourth hind toe longest), a deep head with full jowls, the subtympanic shield (`shield()`: a big round
domed plate below the ear drum, painted pale gray-green with a dark rim; pure white read as a button), the dewlap
(`dewlap()`: a thin plate in the middle plane from the chin to the chest, cut to an outline `DEW`, with small spines
along its front edge), the crest (`lizkit.crest()`: blade spines every 1 cm, tallest over the neck, fading out a third
of the way down the tail) and the long whip tail. Green, the head grayer, faint broken bars down the flanks, broad
dark bands round the tail. The eyes are set into the head with `seat_eye()` (the first ones stood out like goggles).
The hatchling (`size.baby` in the game, about 32 cm there) has its own color map (a brighter, more even green) and its
own shape (`baby_offset()`: the dewlap pulled up to the throat and the crest low, as on a real hatchling).
- Budget (`VOXEL=0.0018 TRIS=2800 TEX=768`): 7.3k triangles; 768 color (WebP 50) and normal (WebP 32) maps, 320
  hatchling color map: 59 KB mesh (with the hatchling offsets) + 31 + 51 + 10 KB, 153 KB of files, about 204 KB in the
  page plus about 16 KB of icons.

The chameleon (`chameleon.py`, a male panther chameleon, Furcifer pardalis, 45 cm with its tail, KS 1):
- A deep body flattened from side to side (the loft's upper exponent below 2 makes the arched back a ridge), a low
  crest of cones along it, a short neck, a low casque rising behind the eyes (the loft's top raised there plus a thin
  ridge; separate ridge chains read as antlers), ridges from the eyes to a small nose, the downturned mouth line.
- The turret eyes: `eye_parts()` is replaced by a ball of skin round each eyeball, drawn out a little along the gaze,
  with a small round hole for the pupil (`LID_W`). Each turret is weighted to its own bone (`eyeL`, `eyeR`, children
  of the head, pivots at the eye centers; `fix_extra()`), and the model's eye names that bone (`'bone': 'eyeL'` in the
  eye meta), so the game turns the turret and the eyeball together. The game's iris is small (`irisR` 0.26) so the
  hole shows the pupil with a ring of gold; the lids stay open at the ball's edges and close the hole when it blinks.
- The tail is not part of the loft: `tail()` sweeps a tapering tube along `tail_path()`, back from the hips and curled
  down and forward into a spiral (an exponential spiral in the middle plane), with eight bones placed along the curve
  (`tail_pivots()`, copied into the game's bone table). Its weights go by arc length along the dense curve
  (`spine_weights()`), its rings follow the curve with a reach of about the tail's radius (a larger reach also cut the
  next coil), and the paint and texture regions use the position along the curve (`tailS`).
- Legs held under the body, elbows back and knees forward; zygodactyl feet (`bundle()`: each foot two mittens of
  fused toes, three inside and two outside on the front feet, two and three on the hind, small claws at their tips).
- Paint: green with blue bars round the body and red cores in them, a white stripe along the lower flank from the
  corner of the mouth, red stripes radiating from the eye, green and red rays on the turrets, a banded tail, red spots
  on the legs. `stats()` also measures the mean brightness of the skin (`chroma.lum` in the json) for the game's color
  change. The hatchling has its own dull gray-brown color map.
- In the game (`40_animals.js`, both off for every other species): `spec.extend(R, A, rig)` adds a species' own
  per-frame steps after the animator and its own rig methods (the chameleon's eyes darting about each by itself and
  both turning onto the food, the tongue strike, `rig.setTint(color, amount, now)`; the Komodo dragon's tongue
  flicks), and `anim.rock` sways the body back and forth over the planted feet. The color change gives each chameleon
  its own copies of the skin materials with a tint uniform: the skin blends toward the color by brightness, so the
  banded pattern shows through it.
- Budget (`VOXEL=0.0011 TRIS=2600 TEX=768`): 6.8k triangles; 768 color (WebP 52) and normal (WebP 25) maps, 320
  hatchling color map: 52 KB mesh + 44 + 53 + 7 KB, 158 KB of files, about 211 KB in the page plus about 34 KB of
  icons (the banded pattern makes them the biggest of the four).

Synthetic rigs: the lizkit species make every skin weight themselves, so their rig export only has to give the bone
pivots; a rig json written from the species' bone table (bones times k, mirrored ones doubled, the collar tag, one
dummy triangle as the procedural mesh) gives the same model as the browser export.

The Komodo dragon (`komodo.py`, Varanus komodoensis, 2.8 m, KS 5.6) is the template's own monitor made heavy: a deep
broad body on thick upright legs with big curved claws, a long thick neck with loose folds across its sides (`folds()`)
and a full throat, a long flat head with a rounded snout, small eyes under a brow, slit nostrils near the tip, a long
muscular tail. Dull gray-brown with paler and darker mottling, faint reddish blotches and pale speckles, the head
grayer. The hatchling has its own color map (bright yellow bands across a black body, an orange-pink head and neck);
the game makes it slim and small (`size.baby`, about half a meter in the game).
Round 16b (the audit found a rock-like lump of a head with tiny eyes, and the hatchling's bands too bold): a longer,
narrower snout with a flat top and steep sides (a high top exponent in the head rows), a clear jaw line (a deeper mouth
groove, paler lip scales), a bigger eye (`EYE_R` 1.5 cm in the game) under a heavier brow, a bigger ear opening,
deeper folds across the neck and loose skin under the throat, coarser beaded scales (`SC`; the fine ones blurred into a
rocky crust at the map's resolution), lighter grooves between the head's scales, a brighter iris. The hatchling's
bands are narrower and softer (a dull ochre on a dark brown-gray, more speckled). The forked tongue is the game's
(unchanged). All of it is in `komodo.py`.
- Budget (`VOXEL=0.0065 TRIS=2800 TEX=768`): 7.9k triangles; 768 color (WebP 50) and normal (WebP 30) maps, 256
  hatchling color map: 54 KB mesh + 29 + 50 + 16 KB, 152 KB of files, about 203 KB in the page plus about 29 KB of
  icons. Round 16b (same settings): 7.9k triangles, 57 KB + 28 + 60 + 14 KB (the coarser scales cost the normal map
  about 10 KB), 160 KB of files, about 213 KB in the page. Texture memory with mipmaps (unchanged): about 6.6 MB on a
  computer, about 3.2 MB on a phone.

## Round 11: the cheetah on the cat template with longer legs (`cheetah.py`)

A cheetah (KS 2.6: about 1.25 m from the nose to the rump, 0.78 m at the shoulder, a 0.8 m tail). New on the way:
- `bigcat.LegWarp` (`bigcat.install(..., warp=W)`): a map from the cat's units to the species' own that lifts the body by
  `dy` and stretches the legs between heights `ya` and `yb` to make up for it (smooth over `w`, so there is no crease);
  behind the rump (z below `z1`, fading out by `z0`) points are only lifted, so a tail that hangs low keeps its round
  section. Every hook goes through it (points in through the inverse, positions out through the map, baby offsets as the
  difference of two mapped points), so all of cat.py's shapes, masks and weights still work. The game moves the bones,
  lofts, eyes and accents with the same numbers (`legWarp` in 40_animals.js). Without a warp `install` does exactly what
  it did before (the snow leopard's and Smilodon's hooks give the same numbers bit for bit).
- A smaller head without new tables: `HeadFrame` (in cheetah.py) is the cat's head frame with every local length scaled
  by `HS` (0.8), so the head's parts, eyes, mouth, masks and whiskers all shrink together; `head()` hands back its
  distances times HS. The game scales the fallback's head, ears, eyes and nose about the same origin.
- The cheetah's own head (rounder skull, high forehead, flatter cheeks, smaller whisker pads, a broad nose), a deep chest
  and a tucked-up waist (no belly flap), long lean thighs cut off under the back line, slender legs, small narrow paws.
- Paint: solid round spots from a Worley grid laid out in the cheetah's own height (`WARP.fwd`, so the stretched legs do
  not stretch them), smaller on the legs and the head, faint on the white belly; the tail's spots turn into rings, then
  a white tip. The tear lines are a line in the head frame's (up, along) plane on the +x side of the face (a line in two
  of the three coordinates lands once on the convex face; the first try in all three ran inside the head). A white
  crescent under the eyes only (a full pale ring made cartoon eyes), cream whisker pads, black lips.
- Cubs: smoky dark with the silvery mantle: a pale band over the crown, the nape and the back in the cub's color map, a
  ridge of hair along it in the baby offsets (6.5 mm), and the adult's nape crest fur (longer fur along the mantle) times
  `babyLen` 2.
- In the game: the fastest runner (run 15 m/s, a stride of up to 4.6 m at 3.4 strides a second, a short stance, the back
  flexing hard: `flexRun` 0.42); asleep lying with the legs folded under (`fold`: the cat's curl stuck its long legs out).
- Budget (`VOXEL=0.0065 TRIS=4600 TEX=768`): 7.6k triangles plus 192 in whisker cards; 768 maps (color WebP 60, normal
  54), 256 cub map, fur and whisker textures: 74 KB mesh + 43 + 13 + 2 + 6 + 5 KB, 148 KB of files, about 197 KB in the
  page plus about 31 KB of icons.

## Round 11: the ocelot on the cat template (`ocelot.py`)

An ocelot (KS 1.6: about 0.8 m from the nose to the rump, 0.4 m at the shoulder, a 0.35 m tail), the house cat's
skeleton and animation at about twice its size: a sturdier body (deeper and wider, the belly lower), a thick neck,
stout legs on big front paws (the "fat hands", a heavier forearm), rounded ears, big golden eyes, a longer muzzle than
the house cat's with a low ridge down the bridge of the nose and narrower cheeks (its own `head()`), a shorter tail on
the cat's three tail bones.
- Paint: chains of open blotches along the flanks from a Worley grid stretched along the body and sloping down toward
  the rear (`_marks()`: black rims, broken here and there, cinnamon centers), four bold nape stripes from the crown to
  the shoulders, solid spots on the legs, the white belly and the head, a banded tail with a dark tip, two black stripes
  on each cheek and a line from the inner corner of each eye down beside the nose (`_face()`), white rings round the
  eyes (narrow: a wide ring made cartoon eyes), black ear backs with a white spot in the middle of each.
- Kittens: grayer and softer, the marks bold, fuzzy and filled in, blue eyes.
- In the game: walk 0.9, run 6 m/s; climbs and swims with the house cat's poses (the head held a little higher swimming).
- Budget (`VOXEL=0.004 TRIS=4200 TEX=768`): 6.8k triangles plus 192 in whisker cards; 768 maps (color WebP 60, normal
  56), 256 kitten map, fur and whisker textures: 64 KB mesh + 49 + 14 + 10 + 6 + 6 KB, 153 KB of files, about 204 KB in
  the page plus about 33 KB of icons.

## Round 11: the giant panda on the polar bear's file (`panda.py`)

A giant panda, about 1.45 m from the nose to the tail and 0.78 m at the shoulder. `panda.py` runs `polarbear.py` in its
own module (as `bigcat.load` runs cat.py), replaces its tables and the parts that differ, all in the polar bear's
units, and `bigcat.install(globals(), B, KP)` scales the hooks by KP = 0.6 into game meters (install works for any
species file with the usual hooks; the panda adds a plain `grid()`). The game's skeleton is the polar bear's with the
neck, head and ear bones moved, scaled by the same factor (`SPEC.panda`).
- Shape: a level back (the polar bear's rump stands higher), a slimmer trunk, a short thick neck with the head close to
  the shoulders, a big round head (the head frame scaled by HK 1.15, as the cheetah's is scaled down) with full cheeks
  (the jaw muscles), a crown, a short broad muzzle and a small black nose pad, round thick ears standing on top, small
  eyes, the polar bear's thick legs, big paws (pigeon-toed in front) and woolly coat in the sculpt.
- A short mouth line (a long deep cut along the lips read as a grin with white teeth under it).
- The pattern from 3D masks (`_black()`): eye patches as ovals in the head frame's (side, up) plane, their long axis
  running down and out from the brow over the cheek; the ears and a ring round their base; the legs (where the leg
  parts are nearer than the trunk), up over the thighs to the hips; the band over the shoulders, its middle moving
  forward as it runs down each side to the front legs, and under the chest between them; the neck and the throat stay
  white. Cubs: the same pattern, the white a little whiter.
- In the game: it sits back on its haunches to eat with its front paws at its mouth (`eatSit`, a round 11 option of the
  legged animator, off for every other species: with `eatUp` the food is picked up head down, then the sit pose takes
  over instead of the hamster's sit-up, the front paws go to `paws` [up, forward, flex] from the shoulder and the neck
  bends by `neck`, chewing); it climbs (the cat's climb settings), sleeps flat on its front with its head on its paws,
  sits now and then when it stands still.
- Budget (`VOXEL=0.006 TRIS=5200 TEX=768`, then rings across the body and the neck): 7.4k triangles, no cards; 768 color
  and normal maps (WebP 70 and 56: the coat is mostly flat white and black), 256 cub map, 384 fur map: 67 KB mesh + 22 +
  17 + 4 + 7 KB, 120 KB of files, about 160 KB in the page plus about 49 KB of icons.

## Round 12: a rooster, a mallard hen, a female cockatiel and a female panther chameleon

Boys and girls (`SEX_LOOK` in `game/src/00_core.js`): where the real animals look different, the other sex has its own
model, `game/models/<id><m|f>.json`, on the species' skeleton and spec.
- Coat variants (`coat.py`): `duckf.py`, `cockatielf.py` and `chameleonf.py` run the base species' file in their own
  module (as the black cat runs cat.py), set `BASE` and replace the paint (and for the birds the feather atlas cells and
  `meta()`). New in `coat.py`: a variant without `baby_paint()` writes no baby map, so its babies borrow the base's
  (ducklings, chicks and hatchlings of both sexes look alike), and a variant with `FEATHER_ATLAS` writes its own
  feather atlas and its normals (`<id>-feather.webp`, `<id>-feathernrm.webp`, named in `srgb`; the babies' down atlas
  stays the base's). Run them after the base species' pipeline up to the bake (the work files must be current: a
  rebuild of the duck, chicken and cockatiel with the scripts here, and the chameleon's round 11 work files, give the
  shipped models byte for byte).
- The mallard hen: mottled brown and buff (each feather a dark center in a buff margin, streakier on the neck and the
  breast, plainer on the belly), a dark crown, a dark stripe through the eye between a pale eyebrow and buff cheeks, a
  pale throat, an orange bill with a dark saddle, orange feet, the drake's blue speculum with its black and white
  borders; brown tertials, tail feathers and coverts in her atlas. Her json says `"look": "hen"`: the game's duck spec
  leaves out the drake's two curled tail feathers.
- The female cockatiel: gray, the male's yellow face and crest only a faint yellow wash on gray, a duller orange cheek
  patch, fine pale yellow bars under the tail, the outer tail feathers barred pale yellow all along, pale yellow spots
  on the inner webs of the flight feathers (they show from below, in flight).
- The female panther chameleon: tan to peach and pink with rust-brown bars, a faint pale flank stripe, brown rays from
  the eye turrets, a banded tail, no green, blue or red. The game scales her to 0.82. The color change works on her as
  on the male (`chroma.lum` in her json is her own map's mean brightness).
- The rooster (`chickenm.py`, his own sculpt on the chicken's skeleton: copy `work/chicken-rig.json` to
  `work/chickenm-rig.json`, then `make.py chickenm sculpt export`): chicken.py runs in his module and the parts that
  differ are replaced. A big upright single comb with five rounded points and a blade behind the head (`_comb_top()`:
  an arch times a cosine row of points), two long wattle lobes, bigger red earlobes, a fuller hackle cape, a deeper
  breast, a fuller saddle, thicker legs with real spurs (`spur`, its own part, weighted with the tarsus, pulled back into
  the leg for the chick by `baby_offset`'s `extra`). Paint: deep mahogany red, golden-orange hackles (not on the front of
  the neck) and saddle, a dark glossy breast and belly; his atlas: black primaries edged red, the red wing bay, the
  green-black wing bar, the red wing bow, green-black tail feathers and sickles, golden saddle hackles. His json says
  `"look": "rooster"`, and the game's chicken spec gives him his own blades: the same wing with red tertials, a steep
  tent of green-black tail feathers, two sickles each side that arch up, back and down (blades bent in their own plane,
  `arc` in `featherBladeCut`), lesser sickles over the tail's sides, saddle hackles over the base of the tail; and a
  prouder stance (`grownStance`: the body raised in front, the neck upright, the tail up, faded in as he grows, so his
  chick stands as any chick). His chick: the hen's chick (down maps painted alike, the comb, wattles and spurs fold away).
- Budget: duck hen 107 KB of files (82 KB color map, 21 KB atlas), about 143 KB in the page; female cockatiel 39 KB,
  about 53 KB; female chameleon 43 KB, about 57 KB; rooster (`VOXEL=0.002 TRIS=6200 TEX=768`) 6.2k body triangles,
  about 9k in the game with the blades and eyes, 196 KB of files (50 KB mesh, 25 + 51 KB color and normal maps, 37 KB of
  baby maps, 18 KB atlas), about 261 KB in the page (the hen: 268 KB). Plus one icon each (`icon-<id><m|f>.png`).

## Round 12: the lioness and the Holstein bull (`lionf.py`, `cowm.py`)

Boys and girls that look different get their own sculpt on the species' own skeleton, `game/models/<id><m|f>.json`
(see `SEX_LOOK` in 00_core.js and `Animals.build(id, { sex })`). A variant is made like any model, with two
differences: its file runs the species' file first and changes what differs, and the rig step does not apply (the
variant has no `SPEC` of its own): export the species' rig under the variant's name, then run the other steps.

```bash
python3 tools/blender/export_rig.py lion tools/blender/work/lionf-rig.json
VOXEL=0.0092 TRIS=5000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py lionf sculpt export
python3 tools/blender/export_rig.py cow tools/blender/work/cowm-rig.json
VOXEL=0.0065 TRIS=4000 TEX=768 WEIGHTS=transfer BLENDER_PY=... python3 tools/blender/make.py cowm sculpt export
```

The lioness (`lionf.py`): lion.py's tables (`import lion`, so she follows the lion) without the mane hooks, made at the
lion's size (the game scales a lioness to 0.88). Her neck is the plain big cat neck about 7% slimmer, her throat,
shoulder blades, forelegs (`FORE_K`, `FLEG_X`), chest and front paws lighter. Her head (round 16b) is her own skull in the lion's
head frame: narrower and lighter than his, a flatter crown, smaller cheekbones, the same long square muzzle and heavy
brow (it was the lion's head narrowed, `_FineFrame`, which kept his dome); her ears stand free and a little bigger. The coat: the lion's, a little sandier and more even along the
back, a paler throat and chest (`pattern`), faint spots low on the belly and the legs, black ear backs, the black tuft.
Her cub is a plain lion cub: the cat's round little body (nothing to pull in, so no lumpy neck), the lion cub's coat and
its lighter occlusion (`finish_baby`). Budget: 7.4k triangles plus 224 in whisker cards; 768 maps (color WebP 70,
normal 56), 256 cub map, fur and whisker textures: 71 KB mesh and cards + 26 + 13 + 5 + 4 + 5 KB, 128 KB of files,
about 171 KB in the page plus a 16 KB icon (the cub uses the lion cub's icon). About 7 minutes on the shared machine.

The Holstein bull (`cowm.py`): cow.py runs in its module (`exec`, so every cow function looks up the bull's tables and
landmarks), then the bull replaces what differs. No udder (its box lies out of the body, so its parts and paint masks
are empty and cow.py's code stays as it is). A thick, deep neck with a crest (a roll of muscle along the top, highest a
little in front of the withers) and a deep dewlap with a wavy lower edge down to a deep brisket; heavy shoulders, a
little thicker legs, rounder hindquarters (the hooks and pins show less), the flank tucked up. His head is the cow's in
a warped head frame (`hframe()` and `hp()`: 22% broader over the forehead and eyes, 12% over the muzzle, 8% shorter,
6% deeper), so the eyes, ears, nose pad, nostrils, mouth and paint masks follow; a broad poll and a mat of curly hair
over the forehead (a little lumpy in the sculpt, curls in the fine detail, brownish highlights on the black). His own
patches (`_patches` with seeds picked so both flanks are a little over half black, the neck and shoulders darker) and
his own narrow blaze; polled; no genital detail. His calf is a plain calf: the baby offsets walk every vertex off the
head onto the cow's own body without its udder (cow.py's fields, `_calf_body()`), fading out toward the head (the eyes
are placed by bones, so the head keeps his shape; the game's big calf head covers it). His collar sits a little further up the neck than
the cow's (`at` 0.8, behind the crest) and the calf's band hugs the calf's neck (`hug`, as the birds' do; a band that
only moves out floated at the bull's neck outline on a sleeping calf). Budget: 6.4k triangles (7.5k in
the game with the eyes); 768 color map with both sides (1536 x 768, WebP 74) and 768 normal map (WebP 58), no calf map:
44 KB mesh (with the calf's offsets) + 35 + 16 KB, 96 KB of files, about 128 KB in the page plus a 25 KB icon. About 5
minutes for the whole run.

## Round 12: the mute swan (`swan.py`)

The swan was the last animal on the procedural body; an earlier sculpt was not shipped because it read as a white
goose. `swan.py` is redone around what makes a mute swan read as one at the game camera: the black and orange face and
the S shaped neck, then the white feathers and the folded wing close up.
- The head is made level in its own frame (`hl()`, `hw()`: u forward from the back of the skull, v up, x across) and
  turned down by `HEAD_PITCH` (34 degrees), so the bill points down at the top of the neck. A long skull with a flat
  crown, the forehead sloping down to the knob; the bill as two lofts in the head frame (`UPPER`, `LOWER`): deep at the
  base under the knob, the culmen sloping straight down to the nail, a little wider toward the rounded tip, the lower
  mandible tucked under it, an oval nostril pit near the culmen.
- The knob is its own part (`knob()`, `KNOB_H`) and `KNOB_K` scales it on the same base (1.0; a cob's knob is bigger
  than a pen's, so a later boy or girl look can change only this). The cygnet's knob is pressed into the bill by its
  baby offsets.
- The black of the face is painted from masks in the head frame (`_face()`): the base of the bill (its edge slanting
  back from in front of the knob down to the gape), the bare lores narrowing from the bill to the eye, a thin ring
  round the eye, the lower mandible and the nostrils; the knob and the nail are black parts. The orange of the upper
  mandible is a little darker at the sides and lighter along the culmen. (A lore mask without a front end covered the
  whole side of the bill: stop it at the bill's base.)
- The neck is a `sweep()` along an S: forward out of the breast, back in the middle, arching forward over into the
  head; thick at the base. Around the tight bend under the head the sweep needs many samples (`n=160`) or the nape
  shows facets.
- The body is a long boat (`TRUNK`): a level back, a deep round breast, a broad flat belly, the rear tapering up into
  the short pointed tail. The folded wing is sculpted on it: a layer `WING_T` thick over the upper side whose lower edge
  (`WING_EDGE`) is the clean line along the flank, rounded at the shoulder, with the tertials raised a little over the
  rump and the primaries crossing over the base of the tail. In the paint its feathers are long and narrow
  (`_fshape()`, `_wing_mask()`) with soft gray lines along their edges; the white shows its feathers by shadow only.
- The game's wing blades lie inside the sculpted body while the wing is folded (`modelSpec` `folded`, `foldedPos` and
  shorter primaries, `prim: 0.94`): flat blades over the curved side of a swan read as paddles stuck on. They come out
  when it flies, jumps or flutters. The tail fan is narrow (14 degrees) and lies along the sculpted tail with only the
  tips showing.
- The wing arm leaves the body through a slim root (`arm()`), and its first few centimeters stay with the hips
  (`fix_weights()`): with part of the root on the shoulder bone the folded wing dented the back, with a thick root left
  behind it made a fin. Only vertices that really are on the arm get that: far from every part all the part distances
  are equal, so a plain argmin picks the arm too (the bill's tip went to the hips that way).
- The decimator threw a few vertices of the thin arm tip far off the sculpt (8 cm out, with no part near them, so their
  weights went to the head and stretched spikes across the cygnet); `lowpoly_fix()` puts any vertex more than 4 mm off
  the sculpt back on it.
- Texture layout (`uv_regions()`, `UV_AVERAGE`, `uv_weight()`): the head and bill get 2.5 times the texels of the
  rest, or the black and orange edges of the face were jagged.
- The cygnet: the game's baby neck maps shorten each neck bone along its own segment and thicken it across, so the
  adult's S (the neck well off the bone line) folded into a zigzag; the baby offsets move the neck onto the bone line
  (`BABY_NECK_Z`), up into the nape. The knob comes down onto the culmen line and gets down, the bill is narrowed and
  made shallower toward the tip, gray-brown down, a slate gray bill. The body walks onto the downy egg along the egg's
  normals (along the sculpt's, the wing's lower edge kept a crease), its flow has no folded wing in it, and its maps
  use the smooth game mesh normals and less occlusion on the body and neck (`extra_maps()`), so the adult's wing edge
  and feather creases do not show through the down.
- In the game (`SPEC.swan.modelSpec`, only with the model): asleep the neck is laid back over the body and the head
  rests on the back (`sleepNeck`, found with a small forward kinematics fit of the neck chain to points over the back),
  tiny wing blades on the cygnet (0.04). The procedural swan (no model) is unchanged.
- Budget: see the Budget section.

## Round 13: the griffin (`griffin.py`)

The front half of a golden eagle and the back half of a lion, on the lion's big-cat template (`panthera.py`,
`bigcat.py`) at KS 3.8: about 2.45 m from the beak to the tip of the tail, 1.4 m at the top of the head, about 4.6 m
across the spread wings. The game's skeleton is `SPEC.griffin` (`bigPanthera` with the lion's tail; `GRIF` in
40_animals.js): the cat's, with the neck and head bones moved up for a raised neck and a head carried high, the ear
bones holding the feather tufts, and the birds' wing bones on the chest. griffin.py keeps the same numbers.

```bash
python3 tools/blender/export_rig.py griffin
VOXEL=0.0088 TRIS=4000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py griffin sculpt export
```

- The head is eagle.py's (the bald eagle's skull, bill, cere and nostril), mapped onto the griffin's head bone and
  scaled by `SE` (2.8; at 2.5 the head looked small on the thick neck): `to_eagle()` and `from_eagle()`, distances
  times `RE` back into cat units. It has its own heavier brow (`brow_e()`, a little further out, so it shades the
  eye from above) and a 12% bigger eye (`eye_e()`); the fierce look is that brow over the amber eye, the gray lid skin
  and the dark face. The beak is painted in the eagle's own coordinates: the yellow cere, a horn-yellow base, horn
  gray, the dark hook, and a small yellow gape (a gape mask not limited across x painted a yellow spot on the cheek).
  Golden eagle colors: dark brown, a golden crown and nape (the hackles), the face darker.
- The tufts are the ear bones' part (`ear()`): a narrow flat point swept up and back from the back of the crown,
  notched where its feathers part, dark with golden edges. Broad pale ones read as a cat's ears.
- The neck is a thick `sweep()` rising out of the chest. The feathered chest and shoulders end in the ruff:
  `_tip_rows()` and `feather_edge()` give the last two rows of big feathers, their pointed tips of uneven length
  lying back over the fur; the feather coat (`ruff_t()`) is a few millimeters thick in front of the edge and a little
  more over the shoulders, with a small step at each row's tips. Paint: dark brown on the neck and chest,
  golden-brown toward the edge, the last row golden-tawny toward its tips, the fur just behind a little browner
  (`furJoin`) and its fur shells a little longer. A plain edge read as a costume's seam; the color running across it
  and the uneven tips make the join look grown.
- The front legs are eagle legs on the cat's front leg bones: the lion's upper arm and forearm cut off above `HEM`,
  the trousers (a round cone with a shaggy hem of feather points) over a round bare tarsus (`TARSUS`, scutes in front,
  small round scales behind) down to the eagle foot (eagle.py's toes times `FK`, three forward and one back). The
  talons curve down to the ground (`clawDrop` 0.5; straighter ones stuck out forward like needles). The whole foot is
  on `fpaw` below 3 cm, blending into `fmeta` above it (`fix_weights()`), so the cat's walk lifts and curls it as it
  does a paw.
- Part masks come from the nearest part (`_own()`). A part that is the smooth union of others is always nearest, so
  the feet without their talons (`paws_soft()`) and the leg without its tarsus (`fleg_up()`) are parts of their own
  for the masks.
- The wings: the wing arm (`bird.wing_arm`) spread in the rest pose and weighted as wingcat.py's. In the game the
  eagle's atlas wing (one long fingered primary per hand bone) times 2.33 on the chest (`griffinWing()`), with broader
  secondaries, tertials and primaries than the eagle's (the eagle's layout at this size looked like a comb), folded as
  a cape over the back (`folded` roll -45, pitch -4: the tips a little down; positive pitches raised them over the
  hips), slow deep beats (1.4 a second) and long glides. The atlas: dark brown flight feathers, grayer and barred on
  their inner vanes (the undersides), brown coverts golden toward the tips. Pale square coverts read as boards on the
  folded wing.
- The chick-cub: the cat's round little body (baby offsets), the ruff's coat pulled in, the game's big head (1.7)
  with its big beak, small tufts (`ear` 0.45), downy wing buds (`wing` 0.3). White down on the eagle's half, painted
  and as fur shells. A vertex's fur length is shared by the grown-up and the baby, so the eagle's half carries the
  down's length, and the fur map's third channel marks it as the baby's only (`fur_babymask()`, written by
  texture.py; `babyMask` in `FUR`): the grown-up's shells leave it out (`aaMShellCompileB` in 40_animals.js, a shader
  program of its own, so every other species' shells are as before). The down runs into the cub's woolly spotted coat
  over a few centimeters; a dark beak with a yellow cere and gape, pale feet, gray talons.
- The fallback body (no models): the lion's, with SPEC.eagle's head loft, beak, cere, brow and eye mapped the same
  way (`grifEg`), the feather tufts, eagle toes on the front paws and the feathered coat painted.

## Round 13: the winged lion and the winged lioness (`wingedlion.py`, `wingedlionf.py`)

A whole lion (lion.py on the panthera kit, as it is: the mane, the coat, the tufted tail) with a pair of golden eagle
wings growing from its shoulder blades. The girl is the lioness (lionf.py, as it is) with the same wings, her own model
`wingedlionf.json` on the winged lion's skeleton (`SEX_LOOK.wingedlion`: the game scales her to 0.88).

```bash
python3 tools/blender/export_rig.py wingedlion
python3 tools/blender/export_rig.py wingedlion tools/blender/work/wingedlionf-rig.json
VOXEL=0.0092 TRIS=4600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py wingedlion sculpt export
VOXEL=0.0092 TRIS=4600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py wingedlionf sculpt export
```

- `graft(C, ID)` in wingedlion.py adds the wings to a big cat's cat module (the lion's or the lioness's, in cat units,
  before `PT.install`): the feathered wing arm (`bird.wing_arm`, spread flat in the rest pose as the winged cat's) on a
  flattened round root muscle that grows out of the shoulder blade, the shape and parts with the arm (the cat evaluated
  only in its own box), a grid with coarse steps out along the wing and fine ones across its thickness, rings across the
  arm at the shoulder, elbow and wrist, the arm in its own UV region with fewer texels, its skin weights on the wing bones
  by its place along the span (the root blending into the chest; nothing else keeps weights on the wing or feather
  bones), the coat strokes and fur shells stopping on the arm, the feather flow, and the arm's paint: small contour
  feathers where the coat stops, growing into golden tawny coverts with dark centers and pale fringes out along the arm,
  darker brown along the leading edge, pale buff with fine bars underneath. The lioness's file is a few lines on it.
- The wing pivot sits on the side of the shoulder (x 0.2 m, just under the mane's edge on the lion), not on top of the
  back: a pivot near the spine had to slide 15 cm down the flank for the folded wing to clear the body, and the root's
  skin stretched across the shoulder like a dark sheet. Out at the side the folded pose moves it only about 8 cm.
- The cub (`baby_offset`): the lion's cub pulls the mane in onto the body without it; that body must not have the wing
  arm in it (`C.shape` is swapped back for the call), or the mane over the shoulders lands on the arm's root and leaves a
  shelf there. Its wing buds are small (`baby.wing` 0.34) and downy (the cub's map paints the arm with tawny down, and
  the down atlas covers the blades).
- The feather atlas (cells: fingered primaries, secondaries, greater coverts, coverts, tertials, and lesser coverts in
  the last cell): dark brown flight feathers with faint gray bars, near black finger tips, golden tawny coverts with dark
  centers, soft mottling in every cell (the flat vane colors read as plastic spoons on a folded wing this size), and
  shafts only a little darker than their vanes (black shafts drew lines along every folded feather).
- In the game (`SPEC.wingedlion`, 40_animals.js): the bald eagle's sculpted wing layout (`birdWing`: one long fingered
  primary per hand bone, broad secondaries under three rows of coverts, tertials and their coverts) made 2.4 times as
  big, about 4.9 m across, and `anim.wings` (the winged cat's and the unicorn's): slow deep beats (1.35 a second, 48
  degrees) in threes every 7 seconds and long glides on wings held 4 degrees up, the front paws tucked up under the chest
  and the hind legs stretched out behind, the tail streaming.
- The folded pose was fitted, not guessed (a one-off script, not in the repo): the game's wing linkage (birdWing and the
  legged animator's wingPose) replayed in numpy, every blade sampled and checked against the sculpt's distance field,
  and the pose (roll, yaw, pitch, the pivot's shift and the three sets' folded angles) searched so the feathers lie 2 to 6
  cm outside the body (the fur shells), the primaries' tips not far out to the side or far behind the rump. Poses that
  hang the wing down the flank came out as a flat panel with the long primaries inside the haunch; the fit lays the wing
  over the upper flank with the coverts in rows over the shoulder and the primaries crossing over the rump as an
  eagle's cross over its tail. Check it by replaying the pose against the sculpt before rendering: a render shows a wing
  that is inside the body only as a missing wing.
- Shared game option (off for every other species): `fs.under` in a spec's `feathers()` (an sRGB color and an amount)
  makes the undersides of the atlas blades paler toward that color, keeping the atlas's light and dark (the bars), in a
  small shader patch (`featherUnderCompile`). The blades' front faces are their undersides (featherBladeCut's triangles
  face down).
- Budget: see the Budget section.

## Round 14: the narwhal (`narwhal.py`)

A grown-up male narwhal: 4.3 m from the front of the melon to the notch of the flukes (4.55 m to the trailing edges of
the flukes, 6.7 m to the tip of the tusk), 1.0 m deep and 0.93 m wide, the belly on y = 0. The nearest bodies before it were the crocodile (one loft
from the tail to the snout) and the otter (rings so a long body bends); the narwhal is simpler than both: no legs, no
fur, a smooth wet skin.

```bash
python3 tools/blender/export_rig.py narwhal
VOXEL=0.007 TRIS=4300 WEIGHTS=transfer TEX=768 BLENDER_PY=... python3 tools/blender/make.py narwhal sculpt export
```

- Shape: one loft (`BODY`) from the end of the tail stock to the head, a spindle thickest just behind the flippers; the
  tail stock's sections have exponents under 2 above and below, which gives it its keels. The head in front of the neck
  is the loft's own rounded front (`_front_keys()`: the keys follow a quarter ellipse in both views, ending in a tiny
  section). A separate melon ellipsoid on the loft, or a loft that stopped short of the front, both left a rim round the
  face (a dome pressed into a ring, seen from the front); a loft end with a wide last section prints a flat disc on the
  face. The upper lip and the short lower jaw are two ellipsoids blended in under it, the mouth a short groove rising a
  little to its corner (`mouth_y`), the jaw set in under it; small eyes low on the head behind the corner of the mouth in a
  soft lid ring; one crescent blowhole on top (horns forward); a slight crease behind the head.
- No dorsal fin: a low bumpy ridge (`ridge_h`, at most 2.2 cm) along the top line from the middle of the back to the
  tail stock.
- The flippers (`flipper()`): a paddle in its own frame (`FL_ROOT`, `FL_AX`), its half chord, chord center (the leading
  edge rounder), half thickness and an upward curl at the tip given along its length. The flukes (`fluke()`): a plate
  whose outline is the leading and trailing edge along x (`FK_ZL`, `FK_ZT`): the trailing edge bulges back and has a deep
  V notch in the middle (the notch comes from the mirror at x = 0), the tips sweep forward and lift a little; a rounded
  airfoil thickness along the chord with a minimum so the trailing edge meshes. `grid()` samples y finely across the
  fluke plane.
- The tusk is not sculpted: the model is one mirrored half, and the tusk grows from the left side of the upper jaw only.
  The game adds it as a rigid piece on the `tusk` bone (`narwhalTusk()` in 40_animals.js: a tube twisted along a
  left-handed helix with five grooves, a turn every 0.6 m, tapering to a smoother, paler blunt point, a ring of skin at
  the lip). The tusk bone is the species' horn bone (`baby.roles.tusk = 'horn'`), so a calf's and a girl's scales away.
- Weights are all the sculpt's own (`fix_weights`, `WEIGHT_SMOOTH = (0, 0)`): the body one chain along z (`SPINE`,
  `SPINE_Z`, blended over `SPINE_B` at each joint: each bone bends the body behind its pivot, the neck and head the part
  in front), the fluke plate on the fluke bone from a little out of the middle (the root shared with the tail stock;
  the fluke's leading edge lies in front of the fluke pivot and must not stay on tail2), the flippers on their bones from
  just outside the body. Rings across the body around the spine joints (`lowpoly_fix`); the chest between the hips and
  the neck is rigid, so it needs none.
- Paint (`paint()`, both sides, `SIDES` as the cow's: from the top the spots of a mirrored back read as a Rorschach blot):
  a gray-white ground, cream underneath and gray up the back; marbling from a noise cut at a level taken from its
  measured quantiles (`_FQ`), so the dark covers a set share of the skin by how dense it should be there (`_density`:
  about 72% on the back and the head, a third half way down the flanks, almost none on the belly); round ragged spots
  down the flanks; small pale spots in the dark of the back; the flukes and flippers darker with dark edges; a few old
  scratches as faint pale lines and grooves (`_scratches`, also in `detail()`). The first passes, a solid black cape and
  big round blotches on white, read as a Holstein in the game's sunlight, which shows a gray much paler than the map;
  so the back's ground is mid gray (0x6E7276) and the darks dark gray, not black. A quick check while painting: paint
  the sculpt's vertices with numpy and splat side, top and under views (seconds instead of a texture run).
- The calf has its own small map (`paint_baby`: a plain slate blue-gray, paler underneath), doubled side by side in
  `extra_maps()` for the two-sided material; its shape is the game's baby maps (`SPEC.narwhal.baby`: a bigger head,
  a blunter melon, a shorter body, `noDrop`).
- Round 16b: the mottling is fine speckles instead of big blotches (`_mottle()`: ragged spots at three sizes, about 1 to
  6 cm, how many and how big by `_density`: they run together over the back and the head into a dark mottling with pale
  flecks, thin out down the flanks and leave the belly nearly clear), the mouth line painted fainter. The calf's head is
  small and round, not a sperm whale calf's square one: `baby_offset()` lowers the top of the head in front of the
  blowhole into a sloping forehead and a rounder, lower melon (up to 9 cm), and its baby maps no longer blunt the melon
  or enlarge the head (`SPEC.narwhal.baby`: head 1.02, muzzle 1.0, body 0.88 long). The sculpt is unchanged. The
  manatee (made from this file) does not import it.
- No collar: `meta()` has no collar place, so the game makes none (no `ctag` bone, `setCollar` does nothing,
  `leashWorld` is null).
- In the game (`SPEC.narwhal`, `animWhale` in 40_animals.js, `anim.type 'whale'`): up-and-down fluke strokes with a wave
  running back along the body (`anim.wave`, `anim.lag`), faster and bigger with speed, a slow hover with small beats and
  sculling flippers when still, a bend and a bank into turns, the tail trailing when the game pitches the whole body to
  dive or rise (the rig root's rotation.x, set by the Diving part); stranded on the ground a slow flop, the tail lifting;
  asleep it logs at the surface; eating a head dip and a snap; happy a slow roll right over. The menu picture of the
  male is framed on the whole length with the tusk (`SPEC.narwhal.icon`, read by `animalIcon` through
  `rig.iconFrame()`; every other animal is framed as before).
- Budget: see the Budget section.

## Round 15: the manatee (`manatee.py`)

An Amazonian manatee, a grown-up: 2.63 m from the lip pads to the edge of the paddle, 0.9 m deep and 0.84 m wide, the
belly on y = 0. Made from `narwhal.py` (one loft, flippers on their own frames, a flat tail plate, weights all from the
sculpt's own parts); the steps are the narwhal's.

```bash
python3 tools/blender/export_rig.py manatee
VOXEL=0.005 TRIS=4600 WEIGHTS=transfer TEX=1024 BLENDER_PY=... python3 tools/blender/make.py manatee sculpt export
```

- Shape: one loft (`BODY`) from the tail stock to the head, thickest at the chest, the top line falling smoothly over
  the head to the top of the snout, ending in a small rounded front (`_front_keys()`) inside the muzzle. The muzzle is
  a big ellipsoid blended on (`MUZ_C`, `MUZ_R`), with the two pads of the split upper lip in front and under it
  (`PAD_C`, `PAD_R`, mirrored: the cleft comes from the mirror at x = 0) and the short lower lip tucked in under them
  (`LOW_C`). A first try with the loft ending in a quick dome in front of a smaller muzzle printed a forehead ledge;
  the loft has to fall smoothly into the muzzle. The mouth is a groove between the pads and the lower lip; two
  crescent nostrils with closed flaps on top of the front of the snout (`NOSE`); tiny eyes (9.5 mm) in a puckered lid
  ring; a pinhole ear. Long flippers with no nails (`flipper()`, swept back and down). The paddle (`fluke()`) is a
  round spoon: its outline along x (`FK_ZL`, `FK_ZT`) meets at the tip and is flat across x = 0, so the mirror makes
  no notch; its thickness runs on from the tail stock and thins to a rounded rim.
- Weights (`fix_weights`): the narwhal's chain along z, plus the lip pads and the lower front of the muzzle on the
  `snout` bone (the game works the lips with it when eating).
- Skin (`detail()`): two nets of fine creases (`_wrinkles`: Worley cell edges, stretched along the body so most run
  round it), deeper folds round the neck and the flipper roots, follicle pits on the lip pads, sparse hair pits, a few
  shallow scars. All of it is in the normal map; the color map is nearly even.
- Paint: dark slate gray (the game's light shows it much paler than the map: the first pass at 0x4D5154 read
  mid gray), darker along the back with a faint green film of algae, the muzzle browner, the lip pads dark; the white
  to pink chest and belly patch is a noise cut inside a soft oval under the chest (`_regions`: `patch`), so its edge
  is ragged with gray islands in it. A first pass cut from a box of smoothsteps read as a pasted rectangle. The calf
  (`paint_baby`) is paler gray with the patch faint.
- No collar (`meta()` has no collar place). The lip bristles are not sculpted: the game adds them as a rigid piece on
  the snout bone (`manateeBristles()` in 40_animals.js, both sides in one geometry, roots on the pad ellipsoids where
  they stand out of the muzzle), so they must follow `PAD_C`, `PAD_R`, `MUZ_C` and `MUZ_R` here if those change.
- In the game: `SPEC.manatee` and `animManatee` (the narwhal's `animWhale` with the manatee's own steps on top: the lip
  twitching and working, the flippers sweeping in to the mouth when eating, no snap, the head tipped up at the
  surface, asleep low in the water rising slowly to breathe).

## Round 15: the plains zebra (`zebra.py`)

A plains zebra (Burchell's), the horse refitted: about 1.33 m at the shoulder and 2.3 m from the nose to the rump.

```bash
python3 tools/blender/export_rig.py zebra
VOXEL=0.0035 TRIS=6500 WEIGHTS=transfer TEX=1024 BLENDER_PY=... python3 tools/blender/make.py zebra sculpt export
```

- The refit: `fwd()` maps a horse rig point to the zebra's, an overall scale (0.87), the legs shorter (0.86) between
  the pasterns and the body by two smooth ramps (the dog breeds' `DOGI`, so the hooves and the body keep their shape), a
  little wider (1.04) and longer (1.03); `inv()` maps back (y through a table). The game's `SPEC.zebra` refits the
  horse's skeleton, fallback lofts, eyes and gaits with the same numbers (`ZEB`, `zebY` in 40_animals.js); change both
  together. zebra.py imports horse.py as `H` and replaces what differs in that module, in horse units: the ears (`zear`:
  bigger, broader, rounded tips), the mane (`zmane`: a short stiff plate swept along the crest, striped like the neck,
  under longer upright fur shells, with a fringe of cards along its top that hardly flop), the tail (`htail_curve`: a
  long thin dock to the hocks; the tube's skin weights by height over the three tail bones; a black tassel of cards on
  its lower half) and `H.shape` (the bigger ear's box). Every pipeline hook takes zebra points, maps them back and calls
  the horse's code; part distances (the paint masks) stay in horse units, heights and fur lengths are scaled back.
- The stripes are a phase field (`_phase()`: stripes counted, one black and one white per unit), each region its own:
  upright on the barrel; bands round the neck (arc length along the neck's middle line) running on down the chest and
  up into the mane; a fan from the flank fold over the haunch (`HC`, `FAN_R`: the angle round it, so the stripes stand
  upright over the rear flank, rise back over the haunch toward the tail and lie level at the back of the thigh, closer
  together toward the flank fold, as a zebra's do), with a small term across the spine that makes the chevron saddle on
  top of the rump; rings down the legs, closer toward the hooves; rings on the dock. The regions blend their phases
  (phases matched at a point in each blend; a blend of two phases whose gradients oppose makes a bullseye, so the
  haunch's phase runs the same way as the barrel's). The face is not blended: its stripes are rays from the face's
  middle line in each cross section (as far apart as `LAM['face']` over the forehead and the nose, wider down the
  cheeks) and run across the neck's, so `_stripes()` switches from one set to the other along an uneven line behind
  the jaw; blended, they made a band of fine gray lines there. Anti-aliasing: the edge width comes from the phase's
  gradient along the surface (a numeric gradient), about a texel at 1024. Then the dark line along the spine and under
  the belly, faint brown shadow stripes in the middle of the white ones on the haunch, a black muzzle, dark pasterns, the
  ears white with a dark band and tip on the back, the mane's top edge dark. Burchell's legs are often paler below the
  knee; these keep thin rings to the hooves.
- A quick check while painting: the scratch tool that paints the sculpt's vertices with numpy and splats side, 3/4,
  top, rear and head views (as the narwhal's) took seconds per try; the head needs the full sculpt's points.
- The foal: the horse's foal proportions with longer legs (`baby.leg` 1.08), its own color map (`baby_paint`: the same
  stripes in brown on cream with softer edges, a brown muzzle) and its own strand texture (`babyHair`, brown and cream,
  written by `export_extra()` and named in `srgb`), longer fluffier fur shells (`babyLen` 2.6).
- In the game: the horse's gaits and actions with the stride, foot lift and bob scaled to the shorter legs; the girl is
  the boy at 0.94 (`SEX_LOOK.zebra`); the call is a barking "kwa-ha-ha" (65_audio.js).
- Budget: see the Budget section.


## Round 16: small and tree birds on bigger and smaller bird bodies (`refit.py`: `cardinal.py`, `bluejay.py`, `hummingbird.py`, `toucan.py`, `snowyowl.py`)

Five birds made from existing bird files instead of from nothing: the northern cardinal (1.6 times the chickadee), the
blue jay (2.0 times the chickadee), the ruby-throated hummingbird (0.62 times the chickadee, with short legs), the toco
toucan (0.88 times the macaw, `parrot.py`) and the snowy owl (1.12 times the great horned owl, `owl.py`).
- `refit.load(base, name)` runs the base bird's file in a private module of its own, so a species can replace its
  shapes, constants, paints and feather cells there without touching the base (in the base's units: the cardinal's
  bill is drawn in chickadee millimeters). `refit.api(globals(), C, KS, DROP)` then writes the pipeline's hooks into
  the new species' module in game meters: points go to the base as `P / KS`, lengths come back times `KS`. `DROP`
  shortens the legs (the hummingbird's): the body comes down that far between the feet and the knees
  (`y' = y - DROP * sstep(0.002, 0.022, y)`, solved backwards for the base), the feet keep their shape. The game's
  specs use the same numbers: `songBird(o)` in 40_animals.js builds the cardinal, the blue jay and the hummingbird
  from the chickadee's numbers times `k` (and the same leg drop); `scaleBird(spec, k)` sizes the macaw's and the
  owl's specs for the toucan and the snowy owl.
- Each species' own parts: the cardinal's thick cone bill and pointed crest (a ridge sculpted on the crown; the game's
  crest blades lie back along it), the blue jay's stout straight bill and crest, the hummingbird's long thin bill,
  tiny feet and slimmer body, the toucan's bill (one loft, deep at the base and narrow across, saw-toothed cutting
  edges) with a thicker neck and the wing arm shortened to the toucan's short round wings, the snowy owl's head with
  no ear tufts.
- Paint: masks from the base's units (the cardinal's black mask: everything in front of a line from over the bill to
  the front of the eye and down the throat; the jay's necklace: a band along a tilted plane, kept off the nape; the
  toucan's white bib, bare orange and blue eye skin, the orange bill with its red ridge, black tip and base line; the
  snowy owl's broken bars). Boys and girls that differ in color are coat variants on the same mesh (`coat.py`):
  `cardinalf.py` (the tan-brown girl), `hummingbirdm.py` (the boy's ruby throat and dark tail; his json says
  `"look": "m"`, so the game gives him the forked tail) and `snowyowlm.py` (the nearly white boy).
- `color-baby.webp` from `export.py`'s generic `paint_baby` path is not used by birds (their baby maps come from
  `bird.export_extra`); delete it after an export.
- Budget: see the Budget section.

## Round 16: big and water birds (`flamingo.py`, `penguin.py`, `puffin.py`, `ostrich.py`, `peafowl.py`)

Five birds on the shared bird parts (`bird.py`), laid out like `swan.py`: an SDF sculpt around the game's skeleton
(`SPEC.<id>` in 40_animals.js, exported with `export_rig.py`), the wing arm flat out to the side under the game's
feather blades, the same steps as the other birds. The two girls with their own colors are coat variants on the boy's
mesh (`coat.py`), as the hen and the lioness.

```bash
python3 tools/blender/export_rig.py flamingo     # and penguin, puffin, ostrich, peafowl
VOXEL=0.004 TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py flamingo sculpt export
VOXEL=0.004 TRIS=5600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py penguin sculpt export
VOXEL=0.0011 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py puffin sculpt export
VOXEL=0.007 TRIS=6200 TEX=1024 BLENDER_PY=... python3 tools/blender/make.py ostrich sculpt export
BLENDER_PY=... python3 tools/blender/coat.py ostrichf
VOXEL=0.003 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py peafowl sculpt export
BLENDER_PY=... python3 tools/blender/coat.py peafowlf
```

(export.py also writes a `<id>-color-baby.webp` that nothing reads for these five; delete it.) A new feather atlas
cell kind in `bird.py`, `'eye'` (`cell.eye`: the eyespot's rings, its fringe of loose barbs, a bare shaft below), is
used only by the peacock's train and crest; the other kinds draw as before.

- The American flamingo (about 1.4 m): an egg shaped body with the folded wing over its upper side and the long pink
  tertials over the tail, a thin S neck (a `sweep()` as the swan's), a small head and the thick bill bent down at its
  middle (pale pink, black tip), long bare legs with the ankle knob halfway down, webbed feet. Vivid pink-orange (a
  first pass read pale salmon in the game light: saturate it), black flight feathers in the atlas. The chick: gray
  down, a straight dark bill, thick gray legs. In the game: rests and sleeps on one leg after standing still a while
  (`anim.oneLeg`, the other leg folded up under the belly), sweeps its upside-down bill side to side when it eats
  (`eatSweep`, `eatElev`), the head tucked onto the back asleep (`sleepNeck`, fitted as the swan's). The girl is the boy
  at 0.88 (`SEX_LOOK`). A flock wades in the Swamp's shallows (`wade: true` in its wildlife entry: targets where the
  water is 3 to 55 cm deep) and six live in the City Zoo's flamingo pen round a shallow pool.
- The emperor penguin (about 1.1 m): built upright like the owl. A heavy pear shaped trunk (a vertical loft, `vl()`),
  a small round head, a long slender bill with an orange plate below, short legs inside the belly, big black feet with
  claws. The flippers are the wing arm, sculpted as stiff paddles (`arm()`), and the game hangs no feather blades on
  them (`sets: []`). Black back and head, white belly, the yellow-orange ear patch joined to the pale yellow of the
  upper breast. The chick: silver-gray down, a black head with a white face mask. In the game: swims level with the
  flippers beating and the feet trailing (`anim.dive`, `flat`), slides on its belly on snow and ice when it runs
  (`anim.slide`; `onSnow()` and `st.slide` in 60_actors.js, and it goes faster that way). Six live in the City Zoo's
  penguin exhibit: snowy ground, snow rocks and a cold pool 2.4 m deep to dive in.
- The Atlantic puffin (about 30 cm): built level like the chickadee (`standPitch` stands it up). A chunky body, a big
  round head, the tall triangular summer bill as a loft (`BILL_KEYS`): a blue-gray base plate edged yellow, the
  red-orange outer half with yellow grooves, the yellow rosette at the gape and the dark plates round the eye. Black
  back, crown and collar, a pale gray face, white below, orange legs. The puffling: dark gray fluff. In the game: flies,
  swims and dives (wings half open and beating under the water); a colony on the Arctic island and a few out on the
  water.
- The common ostrich (about 2.4 m to the top of the head): a big round body of loose black feathers with the folded
  wing over its side, white plumes at the wing and tail (feather blades, the atlas's plume cells), a long bare neck
  darker at the base, a small flat head with big eyes and a flat bill, huge bare thighs, long scaly legs and two toes on
  each foot (a big one with a thick claw, a small outer one). Texture 1024 for the big bird. The girl (`ostrichf.py`,
  `"look": "hen"`) is gray-brown with dull grayish plumes and a grayer neck, 0.9 of his size; her chicks use his baby
  maps (buff down with dark stripes). In the game: runs fast (`run` 13) with the wings held half out, not beating
  (`anim.runWings`); no jumping; groups in the Savanna.
- The Indian peafowl: a long body carried level, a slender upright neck, a small head with a short stout bill, long
  legs with a spur. The rig was first made too tall in the leg: `peafowl.py` ends with a warp of heights (`_YO` to
  `_YN`) that moves the first sculpt's parts onto the lowered rig, so the shapes stayed and only the proportions
  changed (the `_o` functions are the first ones, in old heights). The train, crest and tail are the game's feather
  blades: 25 train rays (`trainC`, `tr1L`..`tr12L` and their R twins, bones of their own on the hips) carrying eyespot
  feathers (atlas cell 5, `'eye'`), a fan of tufted crest shafts (cell 6). The train rays are the species' horn bones,
  so a chick and the peahen have none (`SEX_LOOK` `horns: 0`). At rest the train is a low ridge (the middle rays slope
  less than the outer ones, `TR.roof`: a flat sheet read as a line from the side) and keeps trailing on the ground when
  he tips forward to eat. His display (`spec.extend`): a happy moment (a call, being petted), or now and then when he
  stands about, swings each ray up into a half circle fan, which shivers when it is fully up; not while he eats. His
  menu picture shows the fan up (`spec.icon` calls `R.trainFan`). The crest's bare shafts are too thin to see, so the
  crest feathers are short (a longer crest floated over the head). Iridescent
  blue neck and breast, white face stripes, a bronze-green scaled back, barred buff coverts, rufous primaries. The
  peahen (`peafowlf.py`, `"look": "peahen"`): brown-gray with faint barring, a metallic green lower neck, a white
  throat, a smaller crest, no train, 0.9 of his size; her chicks use his baby maps (tan down). In the game: in the
  City Zoo, the Safari Park and by the farm on the Land.
- Budget: see the Budget section.


## Round 17: six birds refitted from existing birds (`robin.py`, `barnowl.py`, `raven.py`, `roboteagle.py`, `kiwi.py`, `dodo.py`)

All six are `refit.py` species (round 16): the base bird's file runs in a private copy, the new species replaces its
shapes, paints, weights and feather cells there in the base's units, and the game's spec is made from the base spec
with the same numbers (`songBird` for the robin, `scaleBird` for the rest). New in `refit.api`: nothing; `DROP`, `YA`
and `YB` (the leg band) are now used beyond the hummingbird, and the game has the same warp as `dropBird(spec, D, ya,
yb)` in 40_animals.js (shorter legs for the dodo, longer for the barn owl).

```bash
python3 tools/blender/export_rig.py robin       # and barnowl, raven, roboteagle, kiwi, dodo
VOXEL=0.0009 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py robin sculpt export
BLENDER_PY=... python3 tools/blender/coat.py robinf
VOXEL=0.0013 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py barnowl sculpt export
VOXEL=0.002 TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py raven sculpt export
VOXEL=0.0028 TRIS=6400 TEX=768 BLENDER_PY=... python3 tools/blender/make.py roboteagle sculpt export
VOXEL=0.0016 TRIS=6000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py kiwi sculpt export
VOXEL=0.003 TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py dodo sculpt export
```

(Delete the `<id>-color-baby.webp` export.py writes for each; nothing reads it. Delete only these six by name: other
species ship a `-color-baby.webp` of their own.)

- The American robin: the chickadee at 1.85 (as the cardinal at 1.6), a smaller head and a slimmer body, a slender
  pointed bill. Paint zones from 3D masks in chickadee units (`_zones()`): the blackish head above a line from the chin
  under the eye to the nape, the brick-orange breast on the front and the underside, white low on the belly and under
  the tail, a white throat with fine black streaks, the broken eye ring (`_eyering()`: an arc over the eye and one
  under it, in the eye's own frame). The girl (`robinf.py`, a coat on his mesh): a gray-brown head, a paler breast, a
  fainter ring. The fledgling: gray-brown down with a spotted orange-buff breast. In the game the tail is shorter than
  the chickadee's scaled one (a first pass sticking out 14 cm read as a stick).
- The barn owl: the great horned owl at 0.64 with the legs 3 cm (owl units) longer (`DROP -0.03` over y 0.012 to 0.13),
  no ear tufts, a slimmer body and the barn owl's face: `heart(x, y)`, about the signed distance to a heart outline in
  the face plane (two round lobes over the eyes, a notch on the forehead, a point under the bill), the face cut flat,
  dished inside the heart, a raised rim along it, a ridge down the middle, smaller eyes set deeper, a smaller bill.
  `_discs()` is replaced so the paint, the owlet's soft face and its down all follow the heart. The golden-buff
  upperparts wrap round the flanks (the folded wing hangs at the back, so a flank left white read as a white owl from
  the side); each feather tip veiled gray with a white dot tipped black.
- The common raven: the bald eagle at 0.72 with the raven's bill (eagle-style `UPPER`/`LOWER` lofts: long, deep,
  gently arched, a slight droop, no cere or hook), a bristle tuft over the nostrils, no brow, shaggy throat hackles
  (a bulge and longer pointed feathers in `_size`/`_fshape`), short feathered thighs over long bare black legs, thinner
  toes with curved claws. The longer bill needs the head box, bounds and bill patch made longer. Glossy black with a
  blue-purple sheen where the feathers face up (low roughness, so the lift's sky reflection does the rest); a wedge
  tail in the game (`taper` 0.34).
- The robot eagle: the bald eagle itself (KS 1), every feather of its plumage pattern painted as a metal plate:
  gunmetal with a few brushed steel plates, the silver hood and undertail where the eagle is white, a dark seam inside
  each plate's visible edge, two rivets at its base, brushed streaks along it; a polished dark bronze bill with a panel
  line where the cere was, bronze talons, jointed steel legs. Its json says `"metal": 1` (the game's model and feather
  materials get that metalness and the lift's new `metal` kind: full sky reflection, sun shine, no wrap) and its eye
  `glow` (the iris lights itself; the lids cover the light). The eaglet: round plates (Worley cells) in steel and
  silver, no down (`del C.FUR`), 384 baby maps. Its atlas: plates in feather outlines with panel lines and rivets.
- The brown kiwi: the hen's legs at 0.9, everything else its own: a pear-shaped body highest at the rump, no tail or
  wings (`del C.FEATHER_ATLAS`; the game's spec has no feather blades and builds no feather mesh), the neck and head
  moved down and forward (the game's spec moves those bones; `_spine_u` weights the neck along z, not y), a long thin
  curved bill (a `chain`) with the nostrils at its tip, whisker bristles painted round its base, thick legs. Hair-like
  feathers: `_fshape` makes every plumage feather narrow, pointed and long, and the paint streaks each one. The girl is
  the sculpt; a boy is the game's 0.85.
- The dodo: the hen's skeleton at 1.5 with shorter legs (`DROP 0.04` over y 0.02 to 0.12; the whole body comes down
  6 cm), its own body (a huge round loft, a full breast, a rump for the tail tuft), a short thick ruffed neck, a big
  head with bare skin round the eye, the huge bill (lofts with a swollen hook, a ridged base, a long nostril slit),
  stout legs, and a smaller wing arm on its own small wing bones (`C.SH`.. `C.WT` from the game's `stdWing` at s 0.46).
  The tail tuft and the few wing feathers are the game's blades (atlas cell 5 is `'curl'`).
- Budget (`TEX=768`; texture memory with mipmaps once the species is used, desktop / phone): robin 5.97k triangles, 176
  KB of files (about 234 KB in the page), 9.7 / 6.4 MB, the girl's coat 42 KB (about 56 KB), 4.3 / 2.7 MB more when a
  girl is on screen; barn owl 5.99k, 190 KB (253 KB), 10.9 / 7.6 MB; raven 6.18k, 164 KB (218 KB), 10.9 / 7.6 MB; robot
  eagle 6.39k, 251 KB (335 KB: the plates do not compress), 9.0 / 5.7 MB; kiwi 5.99k, 163 KB (218 KB), 9.4 / 6.1 MB;
  dodo 6.2k, 182 KB (243 KB), 10.9 / 7.6 MB. Icons 14 to 32 KB each. About 3 to 4 minutes of Blender each on the
  shared machine.
