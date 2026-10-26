# Hair cards: manes, forelocks, tails and other long hair as ribbons with a strand texture (alpha), skinned to the
# game skeleton like the body. Used by export.py when the species file has cards(); no Blender needed.
#
# A species' cards() returns a list of cards, each a dict:
#   pts   (k, 3) points from the root to the tip (game rig space)
#   w     (k,) ribbon width at each point (meters)
#   nrm   (k, 3) shading normal at each point (the skin under a mane, or out from the middle of a tail)
#   side  (k, 3) optional direction the ribbon spreads across (default: across the hair, in the skin plane)
#   col   strand texture column 0..HAIR['cols'] - 1
#   bones list of k dicts {bone name: weight} (skin weights at each point)
#   baby  (k, 3) optional points of the same card on a newborn (the game blends to them with the baby proportions)
# HAIR in the species file sets the strand texture: size (w, h), cols, colors base / hi / tip (sRGB 0..1), seed,
# strands per column, root (how far down the root stays dense), rough (roughness), alpha (alpha test).
import numpy as np
from PIL import Image

F = np.float32


def ribbon(card):
    pts = np.asarray(card['pts'], np.float64)
    k = len(pts)
    T = np.gradient(pts, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    N = np.asarray(card['nrm'], np.float64)
    N = N - T * (N * T).sum(1, keepdims=True)
    N /= np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    S = np.asarray(card['side'], np.float64) if card.get('side') is not None else np.cross(N, T)
    S = S - T * (S * T).sum(1, keepdims=True)
    S /= np.maximum(np.linalg.norm(S, axis=1, keepdims=True), 1e-9)
    w = np.asarray(card['w'], np.float64)[:, None]
    V = np.stack([pts - S * w * 0.5, pts + S * w * 0.5], 1).reshape(-1, 3)
    Nv = np.repeat(N, 2, 0)
    t = np.linspace(0, 1, k)
    tri = []
    for i in range(k - 1):
        a, b = 2 * i, 2 * i + 2
        tri += [[a, b, a + 1], [a + 1, b, b + 1]]
    return V, Nv, t, np.array(tri, np.int64)


def build(cards, hair, bones, skin=None):
    """all cards in one mesh: positions, normals, uvs, skin weights (indices into bones, 4 per vertex, sum 1),
    baby offsets (newborn position - adult position). A weight under the key '_skin' is shared out like the body's
    skin weights at that point (skin(p) -> {bone: weight}), so roots move exactly with the skin they grow from."""
    cols = hair.get('cols', 8)
    P, N, UV, SI, SW, B, T = [], [], [], [], [], [], []
    o = 0
    bi = {b: i for i, b in enumerate(bones)}
    for c in cards:
        V, Nv, t, tri = ribbon(c)
        k = len(t)
        u0, u1 = (c['col'] + 0.06) / cols, (c['col'] + 0.94) / cols
        uv = np.stack([np.tile([u0, u1], k), np.repeat(1 - t, 2)], 1)   # root at the top of the texture
        P.append(V); N.append(Nv); UV.append(uv); T.append(tri + o); o += len(V)
        for p, wd in zip(c['pts'], c['bones']):
            if '_skin' in wd:
                k = wd['_skin']
                wd = {n: w for n, w in wd.items() if n != '_skin'}
                for n, w in (skin(p).items() if skin else []):
                    wd[n] = wd.get(n, 0) + w * k
            items = sorted(wd.items(), key=lambda x: -x[1])[:4]
            s = sum(w for _, w in items) or 1.0
            row_i = [bi[n] for n, _ in items] + [0] * (4 - len(items))
            row_w = [w / s for _, w in items] + [0.0] * (4 - len(items))
            SI += [row_i, row_i]; SW += [row_w, row_w]
        bp = np.asarray(c['baby'], np.float64) if c.get('baby') is not None else np.asarray(c['pts'], np.float64)
        d = bp - np.asarray(c['pts'], np.float64)
        B.append(np.repeat(d, 2, 0))
    return dict(pos=np.concatenate(P).astype(F), nrm=np.concatenate(N).astype(F), uv=np.concatenate(UV).astype(F),
                si=np.array(SI, np.int64), sw=np.array(SW, np.float64), baby=np.concatenate(B), tri=np.concatenate(T))


def _hash(i, s):
    x = (np.asarray(i, np.int64) * 374761393 + s * 668265263) & 0xFFFFFFFF
    x = ((x ^ (x >> 13)) * 1274126177) & 0xFFFFFFFF
    return ((x ^ (x >> 16)) & 0xFFFFFF) / float(1 << 24)


def texture(hair):
    """strand texture: cols columns of locks, the root at the top (v 0) and the tips at the bottom; RGBA in 0..1"""
    W, H = hair.get('size', (512, 512))
    cols = hair.get('cols', 8)
    base, hi, tip = (np.asarray(hair[k], np.float64) for k in ('base', 'hi', 'tip'))
    seed = hair.get('seed', 1)
    nstr = hair.get('strands', 70)
    cw = W / cols
    col = np.zeros((H, W, 3)); acc = np.zeros((H, W))
    y = np.arange(H) + 0.5
    for c in range(cols):
        for s in range(nstr):
            j = c * 1000 + s
            r = [_hash(j, seed + q) for q in range(8)]
            # each strand: a gentle wave across the column, ending somewhere in the lower part (tips taper)
            # more strands in the middle of the lock than at its edges, so a card has no straight sides
            x0 = c * cw + cw * (0.5 + 0.86 * (0.5 * (r[0] + _hash(j, seed + 9)) - 0.5))
            end = H * (0.55 + 0.45 * r[1] ** 0.6)
            amp = cw * (0.04 + 0.1 * r[2]); fr = 1.5 + 3 * r[3]; ph = 6.28 * r[4]
            drift = (r[5] - 0.5) * cw * 0.3
            xs = x0 + amp * np.sin(ph + fr * np.pi * y / H) + drift * (y / H) ** 2
            wid = (0.55 + 0.7 * r[6]) * np.clip(1 - (y / end) ** 3, 0, 1)
            shade = 0.6 + 0.8 * r[7]
            rows = np.where(y < end)[0]
            xc, wr = xs[rows], np.maximum(wid[rows], 0.15)
            xi = np.floor(xc).astype(np.int64)[:, None] + np.arange(-3, 4)[None, :]
            cov = np.clip(wr[:, None] + 0.5 - np.abs(xi + 0.5 - xc[:, None]), 0, 1)
            ok = (xi >= int(c * cw)) & (xi < int((c + 1) * cw)) & (cov > 0)
            rr = np.broadcast_to(rows[:, None], xi.shape)[ok]
            xx, cv = xi[ok], cov[ok]
            f = (rr / H)[:, None]
            cc = base + (hi - base) * np.clip(shade - 0.6, 0, 1) * 0.6
            cc = cc + (tip - cc) * np.clip((f - 0.55) / 0.45, 0, 1) * (0.35 + 0.65 * r[7])
            a = cv * (1 - acc[rr, xx])
            col[rr, xx] += cc * a[:, None]
            acc[rr, xx] += a
    # a dense root: the first part of every lock is nearly opaque
    root = hair.get('root', 0.12)
    xr = (np.arange(W) + 0.5) % cw / cw * 2 - 1
    f = np.clip(1 - (y / H) / root, 0, 1)[:, None] * np.clip(1 - xr ** 4, 0, 1)[None, :]
    fill = base * 0.8
    col = col + fill[None, None, :] * ((1 - acc) * f)[..., None] * 0.9
    acc = acc + (1 - acc) * f * 0.9
    rgb = np.where(acc[..., None] > 1e-4, col / np.maximum(acc[..., None], 1e-4), base[None, None, :])
    # bleed colors into the empty texels so filtering never pulls in black
    return np.concatenate([np.clip(rgb, 0, 1), np.clip(acc, 0, 1)[..., None]], 2)


def save_texture(img, path):
    Image.fromarray(np.clip(img * 255 + 0.5, 0, 255).astype(np.uint8), 'RGBA').save(path)
