# Signed distance toolkit (numpy) for sculpting animals by script: primitives, smooth booleans, noise, and a
# marching cubes mesher. All shapes work on point arrays P of shape (N, 3) in game rig space (x left, y up, z forward).
# Distances are approximate away from the surface; only the zero level and smooth blends need them.
import numpy as np

F = np.float32


def V(*a):
    return np.array(a, dtype=F)


def nrm(v):
    v = np.asarray(v, dtype=F)
    return v / np.linalg.norm(v)


def length(P):
    return np.sqrt(np.einsum('ij,ij->i', P, P))


def sat(x):
    return np.clip(x, 0, 1)


def sstep(a, b, x):
    t = sat((x - a) / (b - a))
    return t * t * (3 - 2 * t)


def smin(a, b, k):
    if k <= 0:
        return np.minimum(a, b)
    h = np.maximum(k - np.abs(a - b), 0) / k
    return np.minimum(a, b) - h * h * k * 0.25


def smax(a, b, k):
    return -smin(-a, -b, k)


# ---------- primitives ----------
def ellipsoid(P, c, r):
    q = (P - c) / r
    k0 = length(q)
    k1 = length(q / r)
    return k0 * (k0 - 1) / np.maximum(k1, 1e-9)


def frame(P, c, ax, up):
    """local coordinates of P in an orthonormal frame: ax (local z), up (local y), side = up x ax (local x)"""
    ax = nrm(ax)
    up = nrm(np.asarray(up, dtype=F) - ax * np.dot(up, ax))
    sd = np.cross(up, ax)
    D = P - c
    return np.stack([D @ sd, D @ up, D @ ax], axis=1)


def superellipsoid(P, c, r, e=2.0, rb=None, ax=None, up=(0, 1, 0)):
    """r = (rx, ry_top, rz); rb = bottom ry (defaults to ry_top); optional rotated frame (ax = local z axis)"""
    Q = frame(P, c, ax, up) if ax is not None else P - c
    ry = np.where(Q[:, 1] > 0, r[1], r[1] if rb is None else rb)
    q = (np.abs(Q[:, 0] / r[0]) ** e + np.abs(Q[:, 1] / ry) ** e + np.abs(Q[:, 2] / r[2]) ** e) ** (1 / e)
    return (q - 1) * np.minimum(np.minimum(r[0], ry), r[2])


def round_cone(P, a, b, r1, r2):
    """capsule from a (radius r1) to b (radius r2), exact (Inigo Quilez)"""
    a = np.asarray(a, F); b = np.asarray(b, F)
    ba = b - a
    l2 = float(np.dot(ba, ba))
    rr = r1 - r2
    a2 = l2 - rr * rr
    il2 = 1.0 / l2
    pa = P - a
    y = pa @ ba
    z = y - l2
    xv = pa * l2 - np.outer(y, ba)
    x2 = np.einsum('ij,ij->i', xv, xv)
    y2 = y * y * l2
    z2 = z * z * l2
    k = np.sign(rr) * rr * rr * x2
    out = (np.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1
    m1 = np.sign(z) * a2 * z2 > k
    out = np.where(m1, np.sqrt(x2 + z2) * il2 - r2, out)
    m2 = np.sign(y) * a2 * y2 < k
    out = np.where(m2, np.sqrt(x2 + y2) * il2 - r1, out)
    return out


def chain(P, pts, radii, k=0.0):
    d = None
    for i in range(len(pts) - 1):
        di = round_cone(P, pts[i], pts[i + 1], radii[i], radii[i + 1])
        d = di if d is None else smin(d, di, k)
    return d


_loft_cache = {}


def loft(P, keys, mirror_x=True):
    """generalized cylinder along z. keys: rows (z, top, yw, bot, w, eTop, eBot); the section at z is a superellipse
    with half width w at height yw, reaching up to top and down to bot. Outside [z0, z1] the shape is closed.
    Keys are joined by smooth monotone cubics (linear joins would leave a crease ring at every key)."""
    K = np.asarray(keys, dtype=F)
    key = K.tobytes()
    if key not in _loft_cache:
        from scipy.interpolate import PchipInterpolator
        _loft_cache[key] = PchipInterpolator(K[:, 0].astype(np.float64), K[:, 1:].astype(np.float64), axis=0)
    z = np.clip(P[:, 2], K[0, 0], K[-1, 0])
    col = list(_loft_cache[key](z).astype(F).T)
    top, yw, bot, w, eT, eB = col
    up = P[:, 1] > yw
    h = np.where(up, top - yw, yw - bot)
    e = np.where(up, eT, eB)
    x = np.abs(P[:, 0]) if mirror_x else P[:, 0]
    q = (np.abs(x / w) ** e + np.abs((P[:, 1] - yw) / h) ** e) ** (1 / e)
    # one distance scale for the whole section, so the field has no step at the widest line
    d = (q - 1) * np.minimum(w, 0.5 * (top - bot))
    # beyond the ends: rounded caps (a hard corner there would print a crease into nearby blends)
    kc = 0.5 * float(min(K[0, 4], K[-1, 4], 0.5 * (K[0, 1] - K[0, 3]), 0.5 * (K[-1, 1] - K[-1, 3])))
    d = smax(d, smax(K[0, 0] - P[:, 2], P[:, 2] - K[-1, 0], 0), kc)
    return d


def plane_y(P, y0):
    return y0 - P[:, 1]


# ---------- noise ----------
def _hash(ix, iy, iz, seed=0):
    h = (ix.astype(np.int64) * 73856093) ^ (iy.astype(np.int64) * 19349663) ^ (iz.astype(np.int64) * 83492791) ^ (seed * 2654435761)
    h = (h ^ (h >> 13)) * 1274126177
    h = h ^ (h >> 16)
    return ((h & 0xFFFFFF).astype(F)) / F(16777216)


def vnoise(P, seed=0):
    """value noise in [0, 1] with smooth interpolation"""
    f = np.floor(P)
    i = f.astype(np.int64)
    t = (P - f).astype(F)
    t = t * t * (3 - 2 * t)
    out = 0
    for dz in (0, 1):
        for dy in (0, 1):
            for dx in (0, 1):
                w = (t[:, 0] if dx else 1 - t[:, 0]) * (t[:, 1] if dy else 1 - t[:, 1]) * (t[:, 2] if dz else 1 - t[:, 2])
                out = out + w * _hash(i[:, 0] + dx, i[:, 1] + dy, i[:, 2] + dz, seed)
    return out


def fbm(P, oct=4, seed=0, lac=2.03, gain=0.5):
    s, a, n = 0, 0.5, 0
    for o in range(oct):
        s = s + a * vnoise(P * (lac ** o) + o * 17.13, seed + o)
        n += a
        a *= gain
    return s / n


def worley(P, seed=0):
    """F1 and F2 cell distances (cell units)"""
    f = np.floor(P).astype(np.int64)
    f1 = np.full(len(P), 9.0, F)
    f2 = np.full(len(P), 9.0, F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                fx = cx + _hash(cx, cy, cz, seed) - P[:, 0]
                fy = cy + _hash(cx, cy, cz, seed + 1) - P[:, 1]
                fz = cz + _hash(cx, cy, cz, seed + 2) - P[:, 2]
                d = np.sqrt(fx * fx + fy * fy + fz * fz)
                m = d < f1
                f2 = np.where(m, f1, np.minimum(f2, d))
                f1 = np.where(m, d, f1)
    return f1, f2


# ---------- meshing ----------
def mesh_box(field, lo, hi, h, chunk=24):
    """Polygonize field over a box (no mirroring). Returns (verts, faces)."""
    from skimage.measure import marching_cubes
    xs = np.arange(lo[0], hi[0] + h, h, dtype=F)
    ys = np.arange(lo[1], hi[1] + h, h, dtype=F)
    zs = np.arange(lo[2], hi[2] + h, h, dtype=F)
    vol = np.empty((len(xs), len(ys), len(zs)), dtype=F)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    for z0 in range(0, len(zs), chunk):
        zz = zs[z0:z0 + chunk]
        P = np.empty((len(xs), len(ys), len(zz), 3), dtype=F)
        P[..., 0] = X[..., None]; P[..., 1] = Y[..., None]; P[..., 2] = zz[None, None, :]
        vol[:, :, z0:z0 + len(zz)] = field(P.reshape(-1, 3)).reshape(len(xs), len(ys), len(zz))
    v, f, _, _ = marching_cubes(vol, 0.0, spacing=(h, h, h), allow_degenerate=False)
    return v.astype(F) + np.asarray(lo, F), f


def crop(v, f, lo, hi, inside=True):
    """keep the triangles whose centroid is inside (or outside) the box"""
    c = v[f].mean(1)
    m = np.all((c >= lo) & (c <= hi), axis=1)
    f = f[m if inside else ~m]
    used = np.unique(f)
    idx = np.full(len(v), -1); idx[used] = np.arange(len(used))
    return v[used], idx[f]


def mirror(v, f):
    vm = v.copy(); vm[:, 0] *= -1
    return np.concatenate([v, vm]), np.concatenate([f, f[:, ::-1] + len(v)])


def mesh_half(field, lo, hi, h, chunk=24):
    """Polygonize field(P) (P: (N,3)) over x in [0, hi.x] and mirror it to the -x side. Returns (verts, faces).
    The grid has a plane at x = 0, so both halves share the cut exactly and weld cleanly."""
    from skimage.measure import marching_cubes
    xs = np.arange(0, hi[0] + h, h, dtype=F)
    ys = np.arange(lo[1], hi[1] + h, h, dtype=F)
    zs = np.arange(lo[2], hi[2] + h, h, dtype=F)
    vol = np.empty((len(xs), len(ys), len(zs)), dtype=F)
    X, Y = np.meshgrid(xs, ys, indexing='ij')
    for z0 in range(0, len(zs), chunk):
        zz = zs[z0:z0 + chunk]
        P = np.empty((len(xs), len(ys), len(zz), 3), dtype=F)
        P[..., 0] = X[..., None]
        P[..., 1] = Y[..., None]
        P[..., 2] = zz[None, None, :]
        vol[:, :, z0:z0 + len(zz)] = field(P.reshape(-1, 3)).reshape(len(xs), len(ys), len(zz))
    v, f, _, _ = marching_cubes(vol, 0.0, spacing=(h, h, h), allow_degenerate=False)
    v = v.astype(F) + np.array([0, lo[1], lo[2]], F)
    # drop triangles of the x = 0 cap (MC closes nothing there, but be safe) and mirror
    nv = len(v)
    vm = v.copy(); vm[:, 0] *= -1
    fm = f[:, ::-1] + nv
    V2 = np.concatenate([v, vm]); F2 = np.concatenate([f, fm])
    # weld vertices on the x = 0 plane
    on = np.where(np.abs(v[:, 0]) < 1e-7)[0]
    remap = np.arange(len(V2))
    remap[on + nv] = on
    F2 = remap[F2]
    used = np.unique(F2)
    idx = np.full(len(V2), -1); idx[used] = np.arange(len(used))
    return V2[used], idx[F2]
