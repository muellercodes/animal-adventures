# Coat variants (round 7): a species that shares another species' sculpted mesh (BASE in its file, such as the black
# cat on the tabby's body) and paints only its own coat. Reads the base's work files (the game mesh, its UV layout and
# the bake), runs the variant's paint() and baby_paint(), and writes game/models/<id>.json (with "base": the game
# takes the mesh, skin weights, fur, cards and any map the variant does not bring from the base model) and the maps
# <id>-color.webp and <id>-baby.webp (and <id>-fur.webp when the variant has its own fur map, OWN_FUR = True, and
# <id>-hair.webp for its own hair card strands, OWN_HAIR = True). SIDES = True paints both sides of the body into maps
# twice as wide (+x side left, -x side right; the json says "sides" and the game picks the half by the side).
# Round 12 (boys and girls): a variant without baby_paint() writes no baby map (its babies borrow the base's and look
# like the base's babies: a duckling is a duckling), and a bird variant with its own FEATHER_ATLAS cells writes its own
# feather atlas (<id>-feather.webp and <id>-feathernrm.webp, see bird.py; the chicks' down atlas stays the base's).
# Run the base species' full pipeline first (it must be current: the variant's maps use its UV layout).
# Usage: <blender python> tools/blender/coat.py blackcat
import importlib, json, os, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
SP = sys.argv[1]
S = importlib.import_module(SP)
BASE = S.BASE
# texture.py loads the base's game mesh and bake when imported with the base as its species
sys.argv = [sys.argv[0], BASE]
import texture as TX
WORK = os.path.join(HERE, 'work')
OUT = os.path.join(ROOT, 'game', 'models')
F = np.float32
t0 = time.time()
lo, bk, R = TX.lo, TX.bk, TX.R

Vh, Fh, UVf = lo['half_v'], lo['half_f'], lo['half_uv']
tid, bar = TX.rasterize(Vh, Fh, UVf, R)
valid = tid >= 0
ti, br = tid[valid], bar[valid]
nrm_v = lo['nrm'][lo['corner']]
Nl = (nrm_v[ti] * br[..., None]).sum(1)
Nl /= np.linalg.norm(Nl, axis=1, keepdims=True)
Pl = (Vh[Fh][ti] * br[..., None]).sum(1)
bn, bp = bk['nrm'][valid], bk['pos'][valid]
hit = (np.abs(bp[:, :3]).sum(1) > 0) & (np.abs(bn[:, :3]).sum(1) > 0)
Ph = np.where(hit[:, None], bk['plo'] + bp[:, :3] * (bk['phi'] - bk['plo']), Pl).astype(F)
Nh = np.where(hit[:, None], bn[:, :3] * 2 - 1, Nl).astype(F)
Nh /= np.maximum(np.linalg.norm(Nh, axis=1, keepdims=True), 1e-9)
print(f'{SP} on {BASE}: raster {R}, {valid.mean() * 100:.0f}% covered ({time.time() - t0:.0f}s)')

comps = S.parts(Ph)
col, _ = S.paint(Ph, Nh, comps)
BABY = hasattr(S, 'baby_paint')
bcol = S.baby_paint(Ph, Nh, comps, col) if BABY else None
# SIDES: a coat that is not the same on both sides (a calico's patches): paint the -x side too (the same texels at
# mirrored points); the maps hold the +x side in their left half and the -x side in their right half
SIDES = getattr(S, 'SIDES', False)
if SIDES:
    Mx = np.array([-1, 1, 1], F)
    colm, _ = S.paint(Ph * Mx, Nh * Mx, comps)
    bcolm = S.baby_paint(Ph * Mx, Nh * Mx, comps, colm) if BABY else None
print(f'paint ({time.time() - t0:.0f}s)')


def img(vals, ch):
    a = np.zeros((R, R, ch), F); a[valid] = vals.reshape(-1, ch); return a


v2 = TX.down2(valid[..., None].astype(F))[..., 0] > 0
ao = bk['ao'][..., 0]
aov = ao > 0
ao = TX.pad(np.where(aov, ao, 0)[..., None], aov, 24)[..., 0]
PS = getattr(S, 'PAD_SMOOTH', 0)


def smooth_pad(A, keep):
    from scipy import ndimage
    near = ndimage.binary_dilation(v2, iterations=keep)
    Bl = np.stack([ndimage.uniform_filter(A[..., k], 33, mode='nearest') for k in range(A.shape[2])], 2)
    return np.where(near[..., None], A, Bl)


def color_map(c):
    C = S.finish(TX.down2(TX.pad(img(c, 3), valid, 24)), ao, v2)
    return smooth_pad(C, PS) if PS else C


out = lambda a: Image.fromarray(np.clip(a[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
maps = {'color': f'{SP}-color.webp'}
cq = S.MAP_QUALITY[0]
both = lambda a, b: np.concatenate([color_map(a), color_map(b)], 1) if SIDES else color_map(a)
out(both(col, colm if SIDES else None)).save(os.path.join(WORK, f'{SP}-color.png'))
Image.open(os.path.join(WORK, f'{SP}-color.png')).save(os.path.join(OUT, maps['color']), 'WEBP', quality=cq, method=6)
if BABY:
    maps['babyColor'] = f'{SP}-baby.webp'
    im = out(both(bcol, bcolm if SIDES else None))
    bt = getattr(S, 'BABY_TEX', im.size[1])
    if bt != im.size[1]:
        im = im.resize((bt * (2 if SIDES else 1), bt), Image.LANCZOS)
    im.save(os.path.join(WORK, f'{SP}-babycolor.png'))
    im.save(os.path.join(OUT, maps['babyColor']), 'WEBP', quality=cq, method=6)
srgb = []
if hasattr(S, 'FEATHER_ATLAS'):
    # a bird variant's own feather atlas (same cell layout as the base's, its own colors and outlines), RGBA and normals
    import bird as BD
    fa = S.FEATHER_ATLAS
    rgba, nm = BD.feather_atlas(fa['cells'](), *fa['size'], seed=5)
    fo = tuple(fa.get('out') or fa['size'])
    fq = fa.get('quality', (86, 84, 80))
    pic = lambda a, mode: Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8)).convert(mode).resize(fo, Image.LANCZOS)
    pic(rgba, 'RGBA').save(os.path.join(WORK, f'{SP}-feather.png'))
    for key, fn, a, mode, q in (('feather', 'feather', rgba, 'RGBA', fq[0]), ('featherNormal', 'feathernrm', nm, 'RGB', fq[1])):
        maps[key] = f'{SP}-{fn}.webp'
        pic(a, mode).save(os.path.join(OUT, maps[key]), 'WEBP', quality=q, method=6, alpha_quality=fa.get('alpha_quality', 80))
    srgb.append('feather')
if getattr(S, 'OWN_FUR', False):
    flen, fden = S.fur(Ph, Nh, comps)
    Fm = TX.pad(img(np.stack([np.clip(flen / S.FUR['len'], 0, 1), np.clip(fden, 0, 1), np.zeros_like(fden)], 1).astype(F), 3), valid, 24)
    maps['fur'] = f'{SP}-fur.webp'
    out(TX.down2(TX.down2(Fm))).save(os.path.join(OUT, maps['fur']), 'WEBP', quality=S.FUR.get('quality', 80), method=6)
if getattr(S, 'OWN_HAIR', False):
    # its own strand texture for the hair cards (a black cat's dark whiskers), same layout as the base's
    import cards as CA
    hp = os.path.join(WORK, f'{SP}-hair.png')
    CA.save_texture(S.hair_texture(), hp)
    maps['hair'] = f'{SP}-hair.webp'
    Image.open(hp).save(os.path.join(OUT, maps['hair']), 'WEBP', quality=S.HAIR.get('quality', 85), method=6)
print(f'maps ({time.time() - t0:.0f}s)')

# the json: the base model's settings are the defaults; the variant's meta() (eyes, colors, roughness) overrides them
base = json.load(open(os.path.join(OUT, f'{BASE}.json')))
meta = {'v': 2, 'id': SP, 'base': BASE, 'maps': maps}
if SIDES:
    meta['sides'] = True
if srgb:
    # (only its own maps: the ones it borrows keep the base's)
    meta['srgb'] = srgb
meta.update(S.meta(S.stats(Ph, Nh, comps, col)))
if hasattr(S, 'COAT_FUR'):
    meta['fur'] = dict(base['fur'], **S.COAT_FUR)
json.dump(meta, open(os.path.join(OUT, f'{SP}.json'), 'w'), indent=1)
sizes = {f: os.path.getsize(os.path.join(OUT, f)) for f in [f'{SP}.json'] + list(maps.values())}
tot = sum(sizes.values())
print(f'{SP}:', ', '.join(f'{k} {v // 1024} KB' for k, v in sizes.items()), f'; total {tot // 1024} KB, as base64 about {tot * 4 // 3 // 1024} KB ({time.time() - t0:.0f}s)')
