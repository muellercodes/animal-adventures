# Sculpted animal models (Blender pipeline)

Makes a realistic body for one species with Blender, fitted to the skeleton the game already uses, and writes it to
`game/models/<id>.*`. `build.mjs` embeds those files in the page and `game/src/40_animals.js` uses the model instead of
the procedural loft body. Everything else (bones, walk/run/eat/sleep animation, baby proportions, eyes and blinking,
collar, moods, swimming) keeps working through the same rig API. Models so far: the pig, frog, lizard, turtle,
snake, horse, duck, hen, macaw, owl, fox, raccoon, otter, weasel, deer, goat, moose, bunny, squirrel, hedgehog, dog and
cat (every animal but the swan). `horse.py` is the example for furry animals, `carnivore.py` has the parts the small
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
- The swan (`swan.py`) is made but not shipped: the adult is only a little better than the procedural one. With the
  down shells the cygnet is now better than the procedural one (gray-brown and fluffy like a real cygnet), but the
  adult is still not clearly better, so the swan stays procedural. Run `VOXEL=0.004 TRIS=6500 TEX=1024 ... make.py
  swan` to make it.

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
  from the fold down. Its fringe is only longer fur shells: cards along its lower edge hung off it like a comb, and on a
  puppy they stood out as orange flaps. The tail's feathering cards are wide (30 to 38 mm) and overlap; narrow ones read
  as separate strips. Their newborn points shrink to 0.2 of their length.
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

Dog (`VOXEL=0.004 TRIS=5000 TEX=1024`, then rings across the body and neck and along the tail): 7.3k triangles plus 304
in the cards (40 locks of tail feathering and the whiskers); 1024 color and normal maps, 512 fur and puppy color maps,
256 x 256 strand texture: 71 KB mesh and cards + 58 + 24 + 13 + 8 + 38 KB, about 287 KB in the page. Fur shells at detail
2: 5 layers. About 30 minutes on the shared machine (the coat strokes make `texture` take 12 of them).

Cat (`VOXEL=0.0025 TRIS=4200 TEX=1024`, then rings across the body and neck and along the tail): 6.9k triangles plus 192
in the whiskers; 1024 color and normal maps, 512 fur map, 384 kitten color map, 96 x 128 strand texture: 67 KB mesh and
cards + 63 + 27 + 14 + 14 + 6 KB, about 259 KB in the page. Fur shells at detail 2: 4 layers.
