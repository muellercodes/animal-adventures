# Step 5: write the model the game loads: game/models/<id>.json (layout, eyes, mouth, fur and card settings), <id>.bin
# (format 2: the +x half of the mesh with skin weights, packed and deflated by modelpack.py; the game mirrors it)
# and the WebP maps: <id>-color.webp, <id>-normal.webp, and when the species has them <id>-fur.webp (fur length and
# density for the fur shells) and <id>-hair.webp (strand texture of the hair cards, with alpha).
# Usage: <blender python> tools/blender/export.py pig
import importlib, io, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
import modelpack as MP
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
S = importlib.import_module(SP)
WORK = os.path.join(HERE, 'work')
OUT = os.path.join(ROOT, 'game', 'models')
os.makedirs(OUT, exist_ok=True)
lo = np.load(os.path.join(WORK, f'{SP}-lo.npz'))
stats = json.load(open(os.path.join(WORK, f'{SP}-stats.json')))

pos, nrm, uv, idx = lo['pos'], lo['nrm'], lo['uv'], lo['idx'].reshape(-1, 3)
si, sw, bones = lo['si'], lo['sw'], [str(b) for b in lo['bones']]
mirrored = lo['mirrored']
n0 = int((~mirrored).sum())                 # the stored half: every vertex that is not a mirror twin
assert not mirrored[:n0].any()
nt_tail = int(lo['half_tail'].sum())
nb = (len(idx) - nt_tail) // 2              # body triangles; then their mirror twins, then the tail
tb, tt = idx[:nb], idx[2 * nb:]
assert tb.max() < n0 and (len(tt) == 0 or tt.max() < n0)
q, bbox = MP.quant_pos(pos[:n0])
quv = np.round(np.clip(uv[:n0], 0, 1) * 65535).astype(np.int64)
qo = MP.oct_enc(nrm[:n0])
# weights to bytes summing to 255
w = np.round(sw[:n0] * 255).astype(np.int64)
w[:, 0] += 255 - w.sum(1)
# roughness per vertex (it only changes by region), sampled from the roughness map
rm = np.asarray(Image.open(os.path.join(WORK, f'{SP}-rough.png')).convert('L'))
R0 = rm.shape[0]
px = np.clip((uv[:n0, 0] * R0).astype(int), 0, R0 - 1); py = np.clip(((1 - uv[:n0, 1]) * R0).astype(int), 0, R0 - 1)
rgh = rm[py, px]
body = dict(q=q, uv=quv, oct=qo, si=si[:n0], sw=w, rough=rgh, tri=tb)

# fur: comb direction (along the skin) and length per vertex
fur = None
FUR = getattr(S, 'FUR', None)
if FUR:
    P, Nn = pos[:n0].astype(np.float32), nrm[:n0].astype(np.float32)
    comps = S.parts(P)
    flen, _ = S.fur(P, Nn, comps)
    fl = S.flow(P, Nn)
    fl = fl - Nn * (fl * Nn).sum(1, keepdims=True)
    bad = np.linalg.norm(fl, axis=1) < 1e-6
    fl[bad] = np.cross(Nn[bad], [1, 0, 0])
    fl /= np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)
    fur = dict(oct=MP.oct_enc(fl), len=np.clip(np.round(flen / FUR['len'] * 255), 0, 255).astype(np.uint8))

# hair cards
cards = None
if hasattr(S, 'cards'):
    import cards as CA
    from scipy.spatial import cKDTree
    # the skin weights near a point (average of the 4 nearest vertices, tail tube included), for card roots
    bodyv = np.arange(len(pos))
    tree = cKDTree(pos[bodyv])

    def skin(p):
        _, k = tree.query(np.asarray(p, np.float64), k=4)
        d = {}
        for j in bodyv[k]:
            for b, wt in zip(si[j], sw[j]):
                if wt > 0:
                    d[bones[b]] = d.get(bones[b], 0) + float(wt) / 4
        return d
    C = CA.build(S.cards(), S.HAIR, bones, skin)
    cq, cbox = MP.quant_pos(C['pos'])
    bs = max(float(np.abs(C['baby']).max()) / 32000, 1e-6)
    cw = np.round(C['sw'] * 255).astype(np.int64); cw[:, 0] += 255 - cw.sum(1)
    cards = dict(q=cq, uv=np.round(np.clip(C['uv'], 0, 1) * 65535).astype(np.int64), oct=MP.oct_enc(C['nrm']), si=C['si'], sw=cw,
                 baby=np.round(C['baby'] / bs).astype(np.int64), tri=C['tri'])

blob, js = MP.pack(body, tt, fur, cards)
open(os.path.join(OUT, f'{SP}.bin'), 'wb').write(blob)

# maps
maps = {'color': f'{SP}-color.webp', 'normal': f'{SP}-normal.webp'}
Image.open(os.path.join(WORK, f'{SP}-color.png')).convert('RGB').save(os.path.join(OUT, maps['color']), 'WEBP', quality=S.MAP_QUALITY[0], method=6)
Image.open(os.path.join(WORK, f'{SP}-nrm.png')).convert('RGB').save(os.path.join(OUT, maps['normal']), 'WEBP', quality=S.MAP_QUALITY[1], method=6)
if hasattr(S, 'baby_paint'):
    # babies colored differently: a second color map (the game swaps it in with the baby material)
    maps['babyColor'] = f'{SP}-baby.webp'
    Image.open(os.path.join(WORK, f'{SP}-babycolor.png')).convert('RGB').save(os.path.join(OUT, maps['babyColor']), 'WEBP', quality=S.MAP_QUALITY[0], method=6)
if hasattr(S, 'paint_baby'):
    # (or paint_baby: the newborn's own color map (BABY_MAP = size, WebP quality; babies are small on screen, so it can be smaller)
    maps['babyColor'] = f'{SP}-color-baby.webp'
    bsz, bq = getattr(S, 'BABY_MAP', (0, S.MAP_QUALITY[0]))
    im = Image.open(os.path.join(WORK, f'{SP}-color-baby.png')).convert('RGB')
    if bsz and bsz != im.size[0]:
        im = im.resize((bsz, bsz), Image.LANCZOS)
    im.save(os.path.join(OUT, maps['babyColor']), 'WEBP', quality=bq, method=6)
if FUR:
    maps['fur'] = f'{SP}-fur.webp'
    Image.open(os.path.join(WORK, f'{SP}-fur.png')).convert('RGB').save(os.path.join(OUT, maps['fur']), 'WEBP', quality=FUR.get('quality', 80), method=6)
if cards is not None:
    maps['hair'] = f'{SP}-hair.webp'
    import cards as CA
    hp = os.path.join(WORK, f'{SP}-hair.png')
    CA.save_texture(CA.texture(S.HAIR), hp)
    Image.open(hp).save(os.path.join(OUT, maps['hair']), 'WEBP', quality=S.HAIR.get('quality', 85), method=6)

meta = {'v': 2, 'id': SP, 'data': f'{SP}.bin', 'enc': 'deflate', 'raw': js['raw'], 'maps': maps, 'nv': js['nv'], 'ntri': js['ntri'], 'nbv': js['nbv'], 'nbt': js['nbt'],
        'bbox': bbox, 'bones': bones}
meta.update(S.meta(stats))
if FUR:
    # meters per uv unit on the body (so the strand pattern keeps its real size)
    hv, hf, huv = lo['half_v'], lo['half_f'], lo['half_uv']
    body_t = ~lo['half_tail']
    p = hv[hf[body_t]]
    a3 = np.linalg.norm(np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]), axis=1).sum()
    u = huv[body_t]
    e1, e2 = u[:, 1] - u[:, 0], u[:, 2] - u[:, 0]
    a2 = np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0]).sum()
    meta['fur'] = dict({k: v for k, v in FUR.items() if k != 'quality'}, uvm=round(float(np.sqrt(a3 / a2)), 4))
if cards is not None:
    meta['cards'] = dict(js['cards'], bbox=cbox, bscale=bs, rough=S.HAIR.get('rough', 0.55), alpha=S.HAIR.get('alpha', 0.3))
# belly contact point under the hips (for lying down)
rig = json.load(open(os.path.join(WORK, f'{SP}-rig.json')))['adult']
hips = [b['p'] for b in rig['bones'] if b['name'] == 'hips']
if hips and 'belly' not in meta:    # (a snake has no hips: the game keeps its belly point at the origin; a species
    # with its legs close to the middle, like the fox, gives its own point in meta())
    hz = hips[0][2]
    k = max(1.0, rig['size']['length'] / 1.2)
    near = (np.abs(pos[:, 0]) < 0.04 * k) & (np.abs(pos[:, 2] - hz) < 0.05 * k) & ~lo['tail']
    meta['belly'] = [0.0, round(float(pos[near, 1].min()), 4), hz]
# optional species hook for more maps (the birds' baby down and feather atlas). Note: the birds' hook appends their baby
# offsets to the mesh data the way format 1 stored it; format 2 (deflated) does not take them yet
if hasattr(S, 'export_extra'):
    S.export_extra(meta, OUT, WORK)
json.dump(meta, open(os.path.join(OUT, f'{SP}.json'), 'w'), indent=1)
sizes = {f: os.path.getsize(os.path.join(OUT, f)) for f in [f'{SP}.bin', f'{SP}.json'] + list(meta['maps'].values())}
tot = sum(sizes.values())
print(f'{SP}: {len(pos)} verts {len(idx)} tris (stored {js["nv"]} / {js["ntri"]})' + (f', cards {js["cards"]["nv"]} verts {js["cards"]["ntri"]} tris' if cards is not None else '') + ';',
      ', '.join(f'{k} {v // 1024} KB' for k, v in sizes.items()), f'; total {tot // 1024} KB, as base64 about {tot * 4 // 3 // 1024} KB')
