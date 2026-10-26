# Sculpted animal models (Blender pipeline)

Makes a realistic body for one species with Blender, fitted to the skeleton the game already uses, and writes it to
`game/models/<id>.*`. `build.mjs` embeds those files in the page and `game/src/40_animals.js` uses the model instead of
the procedural loft body. Everything else (bones, walk/run/eat/sleep animation, baby proportions, eyes and blinking,
collar, moods, swimming) keeps working through the same rig API. The pig and the frog have models so far.

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
| lowpoly | `lowpoly.py` | decimates to the game budget (about 6k triangles, more kept on the eyes, snout and hooves), keeps the +x half and unwraps it (the other half mirrors it, so both sides share texels), packs a separate tail island, transfers skin weights from the procedural mesh (or Blender automatic weights with `WEIGHTS=heat`), smooths them and applies species fixes |
| bake | `bake.py` | Cycles bakes the sculpt's surface position and normal (2048) and ambient occlusion (1024) onto the game mesh's UVs |
| texture | `texture.py` | rasterizes the UV layout, paints the skin (`paint()`), adds pores, wrinkles and bristles as a height field (`detail()`) and encodes normals for three.js' normal mapping without tangents (the per-triangle frame it builds from screen derivatives), so the game shades exactly what was baked |
| export | `export.py` | writes `game/models/<id>.json`, `<id>.bin` (quantized positions, uvs, triangles, octahedral normals, 4 bone weights, roughness per vertex) and WebP color and normal maps |

## A species file (`pig.py`)

All in game rig space (meters, x left, y up, z forward, feet on y = 0), built around the bone pivots from the rig
export. It provides: `BOUNDS`, `PATCHES` (fine bake-only boxes), `shape(P)` (the signed distance field), `parts(P)`
(named part distances for paint masks), `tail_curve()` and `TAIL_RINGS`, `keep(P)` (decimation protection),
`bone_tips()` (bone segments for automatic weights), `fix_weights()` and `WEIGHT_SMOOTH`, `paint()`, `detail()`,
`finish()` (folds ambient occlusion into the color), `stats()`, `meta()` (eye, lids, lashes, iris, mouth, collar
placement written to the json) and `MAP_QUALITY`. `sdf.py` has the primitives, smooth booleans, noise and meshing.

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
  shaped body, wing arm pulled into the shoulder, thin legs), written after the mesh data as int8 x3 with a square
  law scale (`md.bdelta`). The game adds it through the bones' baby maps, so it follows the rig like the rest.
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


## Budget

About 6.3k triangles, 4.8k vertices, 1024 x 1024 color and normal maps: 136 KB mesh + 71 KB + 52 KB maps, about 350 KB
once base64 in the page. The frog: about 7.1k triangles, 6k vertices, 512 x 512 maps, about 305 KB in the page
(`VOXEL=0.0004 TRIS=7200 TEX=512`).
