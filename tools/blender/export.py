# Step 5: write the model the game loads: game/models/<id>.json (layout, eyes, mouth), <id>.bin (quantized mesh and
# skin weights) and two WebP maps (<id>-color.webp, <id>-normal.webp).
# Binary layout (little endian): positions u16 x3 (in the bbox), uvs u16 x2, triangles u16 x3, normals i8 x2
# (octahedral), bone indices u8 x4 (into json bones), weights u8 x4 (sum 255), roughness u8.
# Usage: <blender python> tools/blender/export.py pig
import importlib, io, json, os, sys
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
sys.path.insert(0, HERE)
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
S = importlib.import_module(SP)
WORK = os.path.join(HERE, 'work')
OUT = os.path.join(ROOT, 'game', 'models')
os.makedirs(OUT, exist_ok=True)
lo = np.load(os.path.join(WORK, f'{SP}-lo.npz'))
stats = json.load(open(os.path.join(WORK, f'{SP}-stats.json')))

pos, nrm, uv, idx = lo['pos'], lo['nrm'], lo['uv'], lo['idx']
si, sw, bones = lo['si'], lo['sw'], [str(b) for b in lo['bones']]
nv, nt = len(pos), len(idx) // 3
assert nv < 65536
lo3, hi3 = pos.min(0), pos.max(0)
q = np.round((pos - lo3) / (hi3 - lo3) * 65535).astype(np.uint16)
quv = np.round(np.clip(uv, 0, 1) * 65535).astype(np.uint16)
# octahedral normals
n = nrm / np.abs(nrm).sum(1, keepdims=True)
o = n[:, :2].copy()
neg = n[:, 2] < 0
o[neg] = (1 - np.abs(n[neg][:, [1, 0]])) * np.where(n[neg][:, :2] >= 0, 1, -1)
qo = np.clip(np.round(o * 127), -127, 127).astype(np.int8)
# weights to bytes summing to 255
w = np.round(sw * 255).astype(np.int32)
w[:, 0] += 255 - w.sum(1)
# roughness per vertex (it only changes by region: wet snout, hooves, lids), sampled from the roughness map
rm = np.asarray(Image.open(os.path.join(WORK, f'{SP}-rough.png')).convert('L'))
R0 = rm.shape[0]
px = np.clip((uv[:, 0] * R0).astype(int), 0, R0 - 1); py = np.clip(((1 - uv[:, 1]) * R0).astype(int), 0, R0 - 1)
rgh = rm[py, px].astype(np.uint8)
blob = q.tobytes() + quv.tobytes() + idx.astype(np.uint16).tobytes() + qo.tobytes() + si.astype(np.uint8).tobytes() + w.astype(np.uint8).tobytes() + rgh.tobytes()
open(os.path.join(OUT, f'{SP}.bin'), 'wb').write(blob)

# maps: color, normal
Image.open(os.path.join(WORK, f'{SP}-color.png')).convert('RGB').save(os.path.join(OUT, f'{SP}-color.webp'), 'WEBP', quality=S.MAP_QUALITY[0], method=6)
Image.open(os.path.join(WORK, f'{SP}-nrm.png')).convert('RGB').save(os.path.join(OUT, f'{SP}-normal.webp'), 'WEBP', quality=S.MAP_QUALITY[1], method=6)

meta = {
    'v': 1, 'id': SP, 'data': f'{SP}.bin', 'maps': {'color': f'{SP}-color.webp', 'normal': f'{SP}-normal.webp'},
    'nv': int(nv), 'ntri': int(nt), 'bbox': [round(float(x), 6) for x in list(lo3) + list(hi3)], 'bones': bones,
}
meta.update(S.meta(stats))
# belly contact point under the hips (for lying down)
rig = json.load(open(os.path.join(WORK, f'{SP}-rig.json')))['adult']
hz = [b['p'] for b in rig['bones'] if b['name'] == 'hips'][0][2]
near = (np.abs(pos[:, 0]) < 0.04) & (np.abs(pos[:, 2] - hz) < 0.05) & ~lo['tail']
meta['belly'] = [0.0, round(float(pos[near, 1].min()), 4), hz]
json.dump(meta, open(os.path.join(OUT, f'{SP}.json'), 'w'), indent=1)
sizes = {f: os.path.getsize(os.path.join(OUT, f)) for f in (f'{SP}.bin', f'{SP}-color.webp', f'{SP}-normal.webp', f'{SP}.json')}
tot = sum(sizes.values())
print(f'{SP}: {nv} verts {nt} tris;', ', '.join(f'{k} {v // 1024} KB' for k, v in sizes.items()), f'; total {tot // 1024} KB, as base64 about {tot * 4 // 3 // 1024} KB')
