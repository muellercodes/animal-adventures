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

The butterfly and the caterpillar (round 10) are procedural (no Blender files): see `SPEC.butterfly`,
`SPEC.caterpillar` and their animators in `40_animals.js`.

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
minutes for the whole run.

T. rex (`VOXEL=0.03 TRIS=4400 TEX=768 WEIGHTS=transfer`): 6.9k triangles; 768 color (WebP 64) and normal (WebP 34) maps,
256 hatchling color map, 384 fur map: 55 KB mesh + 14 + 51 + 3 + 8 KB, 134 KB of files, about 190 KB in the page plus
about 33 KB of icons (the round 10 budget is about 220 KB per animal, icons included).

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
- Budget (`VOXEL=0.0085 TRIS=4800 TEX=768`): 6.9k triangles plus 192 in whisker cards; 768 maps (color WebP 72, normal
  58), 384 kitten map, fur and whisker textures: 65 KB mesh + 26 + 14 + 9 + 5 + 6 KB, about 173 KB in the page plus about
  27 KB of icons.

Fruit bat (`VOXEL=0.002 TRIS=6500 TEX=768`, normal map WebP 64): 6.5k triangles (7.2k in the game with the eyes, 15.6k
at detail 2 with 4 fur shell layers); 768 color and normal maps (the membranes get a smaller share of them,
`uv_weight`), 256 pup color map, fur map: 45 KB mesh + 12 + 20 + 1 + 8 KB, about 120 KB in the page, 190 KB with its
two icons. The procedural butterfly (2.9k triangles, 3.7k at detail 2) and caterpillar (2.2k) add only code and icons.

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
- Budget (`VOXEL=0.0065 TRIS=4600 TEX=768`): 7.4k triangles plus 192 in whisker cards; 768 maps (color WebP 60, normal
  54), 256 cub map, fur and whisker textures: 74 KB mesh + 43 + 13 + 2 + 6 + 5 KB, 148 KB of files, about 197 KB in the
  page plus about 31 KB of icons.
