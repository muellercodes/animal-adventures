# Shared helpers for the bunny, squirrel and hedgehog (on top of carnivore.py): a strand texture painted column by
# column with color bands along the hair (a squirrel's tail hairs: rust, a black band, a buff tip) or with spines
# (a hedgehog's: cream root, dark band, pale point), and locks of hair along a curved tail.
import numpy as np
from sdf import V, F, nrm

from cards import _hash


def _band_color(stops, t):
    """color along the strand at t (0 root .. 1 tip) from stops [(t, rgb), ...]"""
    ts = np.array([s[0] for s in stops], np.float64)
    cs = np.array([s[1] for s in stops], np.float64)
    return np.stack([np.interp(t, ts, cs[:, k]) for k in range(3)], -1)


def strand_texture(size, cols, seed=1):
    """RGBA strand texture (root at the top row, tips at the bottom), one spec per column:
    {'kind': 'hair' | 'spine', 'stops': [(t, rgb 0..1), ...], 'n': strands, 'wid': strand width in texels,
     'end': (shortest, longest) strand end as a share of the height, 'wave': sideways wave (share of the column),
     'root': share of the height that stays dense at the root (hair), 'jit': color jitter}.
    Spines are straight tapering shafts, all reaching near the bottom, with a sharp point."""
    W, H = size
    nc = len(cols)
    cw = W / nc
    col = np.zeros((H, W, 3)); acc = np.zeros((H, W))
    y = np.arange(H) + 0.5
    for c, spec in enumerate(cols):
        kind = spec.get('kind', 'hair')
        stops = spec['stops']
        n = spec.get('n', 30)
        e0, e1 = spec.get('end', (0.6, 1.0))
        for s in range(n):
            j = c * 1000 + s
            r = [_hash(j, seed + q) for q in range(9)]
            if kind == 'spine':
                # spines side by side across the column, a little uneven
                x0 = c * cw + cw * ((s + 0.5 + 0.5 * (r[0] - 0.5)) / n)
                end = H * (e0 + (e1 - e0) * r[1])
                xs = x0 + (r[5] - 0.5) * cw * 0.12 * (y / H)
                t = np.clip(y / end, 0, 1)
                wid = spec.get('wid', 3.0) * (0.85 + 0.3 * r[6]) * np.clip(1.0 - t ** 2.2, 0, 1) * np.clip(0.55 + 3.0 * t, 0, 1)
            else:
                x0 = c * cw + cw * (0.5 + 0.86 * (0.5 * (r[0] + _hash(j, seed + 9)) - 0.5))
                end = H * (e0 + (e1 - e0) * r[1] ** 0.6)
                amp = cw * spec.get('wave', 0.08) * (0.5 + r[2]); fr = 1.5 + 3 * r[3]; ph = 6.28 * r[4]
                drift = (r[5] - 0.5) * cw * 0.3
                xs = x0 + amp * np.sin(ph + fr * np.pi * y / H) + drift * (y / H) ** 2
                t = np.clip(y / end, 0, 1)
                wid = spec.get('wid', 1.0) * (0.55 + 0.7 * r[6]) * np.clip(1 - t ** 3, 0, 1)
            rows = np.where(y < end)[0]
            if not len(rows):
                continue
            xc, wr = xs[rows], np.maximum(wid[rows], 0.12)
            xi = np.floor(xc).astype(np.int64)[:, None] + np.arange(-5, 6)[None, :]
            cov = np.clip(wr[:, None] * 0.5 + 0.5 - np.abs(xi + 0.5 - xc[:, None]), 0, 1)
            ok = (xi >= int(c * cw)) & (xi < int((c + 1) * cw)) & (cov > 0)
            rr = np.broadcast_to(rows[:, None], xi.shape)[ok]
            xx, cv = xi[ok], cov[ok]
            tt = rr / end
            cc = _band_color(stops, tt) * (1 + spec.get('jit', 0.15) * (r[7] - 0.5))
            if kind == 'spine':
                # a lit ridge down the middle of each spine
                cc = cc * (0.8 + 0.35 * cv[:, None])
            a = cv * (1 - acc[rr, xx])
            col[rr, xx] += cc * a[:, None]
            acc[rr, xx] += a
        if kind == 'hair':
            root = spec.get('root', 0.1)
            xr = ((np.arange(W) + 0.5) - c * cw) / cw * 2 - 1
            inside = (np.arange(W) >= int(c * cw)) & (np.arange(W) < int((c + 1) * cw))
            f = np.clip(1 - (y / H) / root, 0, 1)[:, None] * (np.clip(1 - xr ** 4, 0, 1) * inside)[None, :]
            fill = _band_color(stops, np.zeros(1))[0] * 0.8
            col = col + fill[None, None, :] * ((1 - acc) * f)[..., None] * 0.9
            acc = acc + (1 - acc) * f * 0.9
    base = _band_color(cols[0]['stops'], np.zeros(1))[0]
    rgb = np.where(acc[..., None] > 1e-4, col / np.maximum(acc[..., None], 1e-4), base[None, None, :])
    # bleed colors into the empty texels (per column) so filtering never pulls in a wrong color
    for c in range(nc):
        a0, a1 = int(c * cw), int((c + 1) * cw)
        blk = rgb[:, a0:a1]; m = acc[:, a0:a1] > 1e-3
        if m.any():
            mean = blk[m].mean(0)
            blk[~m] = mean
    return np.concatenate([np.clip(rgb, 0, 1), np.clip(acc, 0, 1)[..., None]], 2)


def path_frame(pts):
    """tangents and a side vector (x) along a polyline in the y-z plane"""
    pts = np.asarray(pts, np.float64)
    T = np.gradient(pts, axis=0)
    T /= np.maximum(np.linalg.norm(T, axis=1, keepdims=True), 1e-9)
    X = np.tile(np.array([1.0, 0, 0]), (len(pts), 1))
    U = np.cross(T, X)
    U /= np.maximum(np.linalg.norm(U, axis=1, keepdims=True), 1e-9)
    return T, X, U
