# Step 4 (numpy): the game textures. Rasterizes the game mesh's UV layout, reads the baked high-detail surface
# (position, normal, occlusion), paints the skin (species paint()), adds fine detail as a height field (species
# detail(): pores, wrinkles, bristles) and encodes the final normals for three.js' normal mapping without tangents
# (the per-triangle cotangent frame it builds from screen derivatives), so the shading matches the bake exactly.
# Writes work/<id>-color.png, work/<id>-nrm.png (rgb normal, roughness in a separate grey map) at the texture size.
# Usage: <blender python> tools/blender/texture.py pig
import importlib, os, sys, time
import numpy as np
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
S = importlib.import_module(SP)
WORK = os.path.join(HERE, 'work')
F = np.float32
t0 = time.time()
lo = np.load(os.path.join(WORK, f'{SP}-lo.npz'))
bk = np.load(os.path.join(WORK, f'{SP}-bake.npz'))
R = bk['nrm'].shape[0]          # working resolution (2x the texture)
TEX = bk['ao'].shape[0]


def rasterize(Vh, Fh, UVf, R):
    """per texel (row 0 = v 0): triangle id (-1 none) and barycentrics"""
    tid = np.full((R, R), -1, np.int32)
    bar = np.zeros((R, R, 3), F)
    for t in range(len(Fh)):
        uv = UVf[t] * R - 0.5
        x0, y0 = np.floor(uv.min(0)).astype(int); x1, y1 = np.ceil(uv.max(0)).astype(int)
        x0, y0 = max(x0, 0), max(y0, 0); x1, y1 = min(x1, R - 1), min(y1, R - 1)
        if x1 < x0 or y1 < y0:
            continue
        X, Y = np.meshgrid(np.arange(x0, x1 + 1), np.arange(y0, y1 + 1))
        a, b, c = uv
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(den) < 1e-12:
            continue
        l0 = ((b[1] - c[1]) * (X - c[0]) + (c[0] - b[0]) * (Y - c[1])) / den
        l1 = ((c[1] - a[1]) * (X - c[0]) + (a[0] - c[0]) * (Y - c[1])) / den
        l2 = 1 - l0 - l1
        m = (l0 >= -1e-4) & (l1 >= -1e-4) & (l2 >= -1e-4)
        ys, xs = Y[m], X[m]
        tid[ys, xs] = t
        bar[ys, xs] = np.stack([l0[m], l1[m], l2[m]], 1)
    return tid, bar


def tri_gradients(Vh, Fh, UVf):
    """surface gradients of u and of v on each triangle (the directions three.js calls T and B)"""
    p = Vh[Fh]
    e1, e2 = p[:, 1] - p[:, 0], p[:, 2] - p[:, 0]
    d1, d2 = UVf[:, 1] - UVf[:, 0], UVf[:, 2] - UVf[:, 0]
    g11, g12, g22 = (e1 * e1).sum(1), (e1 * e2).sum(1), (e2 * e2).sum(1)
    det = g11 * g22 - g12 * g12
    det = np.where(np.abs(det) < 1e-20, 1e-20, det)
    out = []
    for k in range(2):
        r1, r2 = d1[:, k], d2[:, k]
        a = (g22 * r1 - g12 * r2) / det
        b = (g11 * r2 - g12 * r1) / det
        out.append(a[:, None] * e1 + b[:, None] * e2)
    return out[0].astype(F), out[1].astype(F)


def pad(img, valid, n):
    """grow island colors outward n texels so mipmaps and bilinear filtering never pull in the background"""
    img = img.copy(); v = valid.copy()
    for _ in range(n):
        acc = np.zeros_like(img); cnt = np.zeros(v.shape, F)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            sv = np.roll(np.roll(v, dy, 0), dx, 1)
            si = np.roll(np.roll(img, dy, 0), dx, 1)
            acc += si * sv[..., None]; cnt += sv
        new = (~v) & (cnt > 0)
        img[new] = acc[new] / cnt[new][:, None]
        v = v | new
        if v.all():
            break
    img[~v] = img[v].mean(0)
    return img


def down2(a):
    return a.reshape(a.shape[0] // 2, 2, a.shape[1] // 2, 2, -1).mean((1, 3))


if __name__ == '__main__':
    Vh, Fh, UVf = lo['half_v'], lo['half_f'], lo['half_uv']
    tid, bar = rasterize(Vh, Fh, UVf, R)
    valid = tid >= 0
    print(f'raster {R}: {valid.mean() * 100:.0f}% covered ({time.time() - t0:.0f}s)')
    ti = tid[valid]; br = bar[valid]
    nrm_v = lo['nrm'][lo['corner']]                     # per half triangle corner: game vertex normal
    Nl = (nrm_v[ti] * br[..., None]).sum(1)
    Nl /= np.linalg.norm(Nl, axis=1, keepdims=True)
    Pl = (Vh[Fh][ti] * br[..., None]).sum(1)
    gu, gv = tri_gradients(Vh, Fh, UVf)
    Gu, Gv = gu[ti], gv[ti]
    # three.js projects its frame onto the plane of the interpolated normal
    Tu = Gu - Nl * (Gu * Nl).sum(1, keepdims=True)
    Tv = Gv - Nl * (Gv * Nl).sum(1, keepdims=True)
    # baked high detail surface (texels the cage rays missed fall back to the game mesh)
    bn, bp = bk['nrm'][valid], bk['pos'][valid]
    # Blender leaves texels it did not bake at zero (alpha is 1 everywhere)
    hit = (np.abs(bp[:, :3]).sum(1) > 0) & (np.abs(bn[:, :3]).sum(1) > 0)
    Ph = np.where(hit[:, None], bk['plo'] + bp[:, :3] * (bk['phi'] - bk['plo']), Pl).astype(F)
    Nh = np.where(hit[:, None], bn[:, :3] * 2 - 1, Nl).astype(F)
    Nh /= np.maximum(np.linalg.norm(Nh, axis=1, keepdims=True), 1e-9)
    print(f'hits {hit.mean() * 100:.1f}% ({time.time() - t0:.0f}s)')
    # paint and detail
    comps = S.parts(Ph)
    col, rough = S.paint(Ph, Nh, comps)
    # babies colored differently (a fox kit's gray-brown fuzz): an optional second color map
    bcol = S.baby_paint(Ph, Nh, comps, col) if hasattr(S, 'baby_paint') else None
    h = S.detail(Ph, Nh, comps)
    # fur shells (species with FUR): fur length (meters) and strand density per texel
    FUR = getattr(S, 'FUR', None)
    if FUR:
        flen, fden = S.fur(Ph, Nh, comps)
    print(f'paint + detail ({time.time() - t0:.0f}s)')
    # height gradient in texture space -> surface gradient through the cotangent frame
    H = np.zeros((R, R), F); H[valid] = h
    def dd(axis):
        p = np.roll(H, -1, axis); m = np.roll(H, 1, axis)
        vp = np.roll(valid, -1, axis); vm = np.roll(valid, 1, axis)
        g = np.where(vp & vm, (p - m) * 0.5, np.where(vp, p - H, np.where(vm, H - m, 0)))
        return g[valid] * R          # per uv unit
    dhdu, dhdv = dd(1), dd(0)
    grad = dhdu[:, None] * Gu + dhdv[:, None] * Gv
    n = Nh - grad
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    # encode for three.js: n = normalize(T s mx + B s my + N mz) with s = 1 / max(|T|, |B|)
    s = 1.0 / np.sqrt(np.maximum((Tu * Tu).sum(1), (Tv * Tv).sum(1)))[:, None]
    M = np.stack([Tu * s, Tv * s, Nl], 2)
    mapn = np.linalg.solve(M.astype(np.float64), n.astype(np.float64)[..., None])[..., 0]
    mapn /= np.linalg.norm(mapn, axis=1, keepdims=True)
    mapn[:, 2] = np.maximum(mapn[:, 2], 0.05)
    mapn /= np.linalg.norm(mapn, axis=1, keepdims=True)
    print(f'normals encoded ({time.time() - t0:.0f}s)')
    # assemble, pad, halve
    def img(vals, ch):
        a = np.zeros((R, R, ch), F); a[valid] = vals.reshape(-1, ch); return a
    C = pad(img(col, 3), valid, 24)
    N = pad(img(mapn.astype(F), 3), valid, 24)
    Ro = pad(img(rough, 1), valid, 24)
    C, N, Ro = down2(C), down2(N), down2(Ro)
    N /= np.linalg.norm(N, axis=2, keepdims=True)
    v2 = down2(valid[..., None].astype(F))[..., 0] > 0
    ao = bk['ao'][..., 0]
    aov = ao > 0
    ao = pad(np.where(aov, ao, 0)[..., None], aov, 24)[..., 0]
    C = S.finish(C, ao, v2)
    import json
    json.dump(S.stats(Ph, Nh, comps, col), open(os.path.join(WORK, f'{SP}-stats.json'), 'w'))
    out = lambda a: Image.fromarray(np.clip(a[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
    out(C).save(os.path.join(WORK, f'{SP}-color.png'))
    out(N * 0.5 + 0.5).save(os.path.join(WORK, f'{SP}-nrm.png'))
    out(Ro[..., 0]).save(os.path.join(WORK, f'{SP}-rough.png'))
    out(ao).save(os.path.join(WORK, f'{SP}-ao.png'))
    if bcol is not None:
        Cb = S.finish(down2(pad(img(bcol, 3), valid, 24)), ao, v2)
        im = out(Cb)
        bt = getattr(S, 'BABY_TEX', TEX)
        if bt != TEX:
            im = im.resize((bt, bt), Image.LANCZOS)
        im.save(os.path.join(WORK, f'{SP}-babycolor.png'))
    if FUR:
        # fur map at half the texture size: R length (of FUR['len']), G density
        Fm = pad(img(np.stack([np.clip(flen / FUR['len'], 0, 1), np.clip(fden, 0, 1), np.zeros_like(fden)], 1).astype(F), 3), valid, 24)
        out(down2(down2(Fm))).save(os.path.join(WORK, f'{SP}-fur.png'))
    print(f'textures {TEX} saved ({time.time() - t0:.0f}s)')
