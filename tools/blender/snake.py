# Eastern garter snake. No sculpt: the body is an exact tube (cross sections along the straight rest pose, the head
# shaped by its own sections plus eye sockets, nostrils and the mouth line), built directly as the game mesh with
# even rings for bending (make_game_mesh) and evaluated exactly per texel instead of baked (make_bake). The scales
# (keeled dorsal scales in staggered rows, wide belly plates, head plates and lip scales) and the stripes are laid
# out in tube coordinates: s, the distance back from the tip of the snout, and th, the angle around from the top.
import json, os
import numpy as np
from sdf import V, F, nrm, sstep, fbm, vnoise, _hash

ID = 'snake'
Z_TIP = 0.472                 # tip of the snout (game rig z)
L = 0.983                     # snout to tail tip
# cross sections: s, center height, half width, top, bottom, exponent
SECT = [
    (0.0000, 0.0174, 0.0012, 0.0010, 0.0010, 2.0),
    (0.0018, 0.0174, 0.0042, 0.0035, 0.0032, 2.2),
    (0.0060, 0.0172, 0.0068, 0.0056, 0.0053, 2.4),
    (0.0120, 0.0170, 0.0089, 0.0068, 0.0068, 2.6),
    (0.0200, 0.0170, 0.0106, 0.0077, 0.0080, 2.7),
    (0.0300, 0.0169, 0.0122, 0.0083, 0.0088, 2.7),
    (0.0400, 0.0167, 0.0130, 0.0086, 0.0094, 2.6),
    (0.0480, 0.0166, 0.0122, 0.0090, 0.0098, 2.4),
    (0.0570, 0.0166, 0.0108, 0.0097, 0.0103, 2.2),
    (0.0700, 0.0164, 0.0116, 0.0108, 0.0110, 2.2),
    (0.0900, 0.0158, 0.0140, 0.0130, 0.0126, 2.15),
    (0.1500, 0.0160, 0.0158, 0.0146, 0.0136, 2.15),
    (0.3500, 0.0166, 0.0172, 0.0158, 0.0146, 2.15),
    (0.5800, 0.0166, 0.0172, 0.0158, 0.0146, 2.15),
    (0.7000, 0.0136, 0.0140, 0.0129, 0.0119, 2.15),
    (0.8000, 0.0098, 0.0100, 0.0092, 0.0085, 2.15),
    (0.8800, 0.0066, 0.0066, 0.0061, 0.0056, 2.15),
    (0.9400, 0.0040, 0.0038, 0.0035, 0.0033, 2.15),
    (0.9700, 0.0026, 0.0022, 0.0020, 0.0019, 2.15),
    (0.9830, 0.0020, 0.0005, 0.0005, 0.0005, 2.1),
]
_K = np.asarray(SECT, np.float64)
from scipy.interpolate import PchipInterpolator
_SECT = PchipInterpolator(_K[:, 0], _K[:, 1:], axis=0)


def sect(s):
    c = _SECT(np.clip(s, 0, L)).astype(F)
    return c[:, 0], c[:, 1], c[:, 2], c[:, 3], c[:, 4]


# head landmarks in tube coordinates
EYE_S, EYE_TH, EYE_R = 0.0255, 1.10, 0.0032
NOS_S, NOS_TH = 0.0042, 0.80


def mouth_th(s):
    """angle of the mouth line from the top: a little below the side, rising toward the corner of the gape"""
    return 1.80 - 0.14 * np.clip(s / 0.042, 0, 1)


def base_rho(s, th, yc=None):
    """distance from the section center along the ray at angle th (superellipse section)"""
    yc, w, t, b, e = sect(s)
    h = np.where(np.cos(th) > 0, t, b)
    st, ct = np.abs(np.sin(th)) + 1e-9, np.abs(np.cos(th)) + 1e-9
    return (1.0 / ((st / w) ** e + (ct / h) ** e) ** (1 / e)).astype(F), yc


def features(s, th):
    """radial offsets (m) on the head: eye socket rim and brow, nostril, mouth groove, the lower jaw set in, the
    notch at the tip where the tongue comes out"""
    a = np.abs(th)
    head = sstep(0.07, 0.05, s)
    d = np.zeros_like(s, dtype=F)
    # eye: a rim around the socket and a brow over it (the eye ball itself is drawn by the game)
    rr = np.sqrt(((s - EYE_S) / 1.0) ** 2 + ((a - EYE_TH) * 0.0105) ** 2)
    d += 0.00035 * np.exp(-((rr - EYE_R * 1.08) / (EYE_R * 0.28)) ** 2)
    d += 0.0005 * np.exp(-((s - EYE_S) / 0.0045) ** 2 - ((a - 0.72) / 0.16) ** 2)
    # nostril
    rn = np.sqrt((s - NOS_S) ** 2 + ((a - NOS_TH) * 0.006) ** 2)
    d -= 0.00055 * np.exp(-(rn / 0.00055) ** 2)
    d += 0.00025 * np.exp(-((rn - 0.0009) / 0.0004) ** 2)
    # mouth line; the lower jaw a little inside the upper lip
    mt = mouth_th(s)
    on = sstep(0.0455, 0.040, s) * sstep(0.0008, 0.0025, s)
    d -= 0.00045 * np.exp(-((a - mt) / 0.045) ** 2) * on
    d -= 0.00035 * sstep(mt + 0.04, mt + 0.2, a) * sstep(0.05, 0.04, s)
    # notch at the tip of the upper jaw for the tongue
    d -= 0.0006 * np.exp(-((s - 0.0012) / 0.0012) ** 2 - ((a - mt + 0.05) / 0.25) ** 2) * (a > 1.2)
    return d * head


def surface(s, th):
    """game rig position of the surface at (s, th); th < 0 is the mirrored (-x) side"""
    rho, yc = base_rho(s, th)
    rho = rho + features(s, th)
    x = rho * np.sin(th)
    y = yc + rho * np.cos(th)
    z = Z_TIP - s
    return np.stack([x, y, z], -1).astype(F)


def normal(s, th):
    e = 1e-4
    ps = surface(s + e, th) - surface(np.maximum(s - e, 0), th)
    pt = surface(s, th + e) - surface(s, th - e)
    n = np.cross(pt, ps)
    n /= np.maximum(np.linalg.norm(n, axis=-1, keepdims=True), 1e-12)
    return n.astype(F)


def tube_coords(P):
    """(s, th) of points on the rest pose surface (th >= 0, mirrored side folded over)"""
    s = (Z_TIP - P[:, 2]).astype(F)
    yc = sect(s)[0]
    th = np.arctan2(np.abs(P[:, 0]), P[:, 1] - yc).astype(F)
    return s, th


# eye placement: the ball sits a little inside the surface at the socket so it bulges out of it
def _eye():
    s, th = np.array([EYE_S], F), np.array([EYE_TH], F)
    p = surface(s, th)[0]
    n = normal(s, th)[0]
    d = nrm(V(0.86, 0.3, 0.4))           # looking out to the side and a little forward
    return (p - n * EYE_R * 0.52).astype(F), d.astype(F)


EYE_C, EYE_DIR = _eye()
MOUTH = surface(np.array([0.0015], F), np.array([np.pi * 0.62], F))[0] + V(0, 0, 0.0005)

# ---------- game mesh ----------
NSEG = 12                     # segments around the half section (0 = top .. pi = belly)
STRIPS = [0.0, 0.25 * L, 0.5 * L, 0.75 * L, L]   # the tube is unwrapped as four strips stacked in the map
UV_M = 0.012                  # margin around each strip (uv)


def rings():
    s = list(np.arange(0.0018, 0.072, 0.0026)) + list(np.arange(0.072, L - 0.03, 0.0074)) + list(np.arange(L - 0.03, L - 0.0006, 0.003))
    s = sorted(set([round(v, 6) for v in s] + [round(v, 6) for v in STRIPS[1:-1]]))
    return np.array(s, np.float64)


def strip_of(s):
    return np.clip(np.searchsorted(np.asarray(STRIPS[1:-1]), s, side='right'), 0, 3)


def uv_of(s, th, k):
    a, b = STRIPS[k], STRIPS[k + 1]
    u = UV_M + (1 - 2 * UV_M) * (s - a) / (b - a)
    v = k * 0.25 + UV_M + (0.25 - 2 * UV_M) * th / np.pi
    return np.stack([u, v], -1).astype(F)


def make_game_mesh(work, rig, tris=None):
    import meshutil as MU
    S_ = rings()
    th = np.linspace(0, np.pi, NSEG + 1)
    nr = len(S_)
    ss, tt = np.meshgrid(S_, th, indexing='ij')
    Vr = surface(ss.ravel().astype(F), tt.ravel().astype(F)).reshape(nr, NSEG + 1, 3)
    Vr[:, 0, 0] = 0; Vr[:, -1, 0] = 0
    verts = list(Vr.reshape(-1, 3))
    tip = len(verts); verts.append(np.array([0, sect(np.array([0.0], F))[0][0], Z_TIP + 0.0003], F))
    end = len(verts); verts.append(np.array([0, sect(np.array([L], F))[0][0], Z_TIP - L], F))
    Vh = np.array(verts, F)
    vid = lambda i, j: i * (NSEG + 1) + j
    Fh, UVf = [], []
    for i in range(nr - 1):
        k = int(strip_of(0.5 * (S_[i] + S_[i + 1])))
        for j in range(NSEG):
            a, b, c, d = vid(i, j), vid(i, j + 1), vid(i + 1, j), vid(i + 1, j + 1)
            # +x side seen from outside: (top, next ring) winding as the mirrored mesh expects
            for tri in ((a, b, c), (b, d, c)):
                Fh.append(tri)
                UVf.append([uv_of(S_[i if q in (a, b) else i + 1], th[j if q in (a, c) else j + 1], k) for q in tri])
    for j in range(NSEG):          # caps: snout tip and tail tip
        tri = (tip, vid(0, j), vid(0, j + 1))
        Fh.append(tri)
        UVf.append([uv_of(0.0, 0.5 * (th[j] + th[j + 1]), 0), uv_of(S_[0], th[j], 0), uv_of(S_[0], th[j + 1], 0)])
        tri = (end, vid(nr - 1, j + 1), vid(nr - 1, j))
        Fh.append(tri)
        UVf.append([uv_of(L, 0.5 * (th[j] + th[j + 1]), 3), uv_of(S_[-1], th[j + 1], 3), uv_of(S_[-1], th[j], 3)])
    Fh = np.array(Fh, np.int64)
    UVf = np.array(UVf, F)
    # orientation check: normals out
    c = Vh[Fh].mean(1)
    n = np.cross(Vh[Fh[:, 1]] - Vh[Fh[:, 0]], Vh[Fh[:, 2]] - Vh[Fh[:, 0]])
    s_c, _ = tube_coords(c)
    out = c - np.stack([np.zeros(len(c)), sect(s_c)[0], Z_TIP - np.clip(s_c, 0.004, L - 0.004)], 1)
    flip = (n * out).sum(1) < 0
    Fh[flip] = Fh[flip][:, ::-1]; UVf[flip] = UVf[flip][:, ::-1]
    is_tail = np.zeros(len(Fh), bool)
    G = MU.game_mesh(Vh, Fh, UVf, is_tail)
    W = MU.weights(G, rig, 'transfer', __import__(ID))
    G.update(W)
    np.savez_compressed(os.path.join(work, f'{ID}-lo.npz'), half_v=Vh, half_f=Fh, half_uv=UVf, half_tail=is_tail, **G)
    print(f'{ID}: {nr} rings, half {len(Fh)} tris, game mesh {len(G["pos"])} verts {len(G["idx"]) // 3} tris, {int(flip.sum())} flipped')


def make_bake(work, tex):
    """the exact surface per texel at twice the map size (what bake.py gets from Cycles for a sculpt)"""
    R = tex * 2
    iy, ix = np.mgrid[0:R, 0:R]
    u = (ix.ravel() + 0.5) / R; v = (iy.ravel() + 0.5) / R
    k = np.clip(np.floor(v / 0.25).astype(int), 0, 3)
    tv = (v - k * 0.25 - UV_M) / (0.25 - 2 * UV_M)
    tu = (u - UV_M) / (1 - 2 * UV_M)
    a = np.asarray(STRIPS)[k]; b = np.asarray(STRIPS)[k + 1]
    s = np.clip(a + np.clip(tu, -0.02, 1.02) * (b - a), 0, L).astype(F)
    th = (np.clip(tv, -0.03, 1.03) * np.pi).astype(F)
    ok = (tu > -0.02) & (tu < 1.02) & (tv > -0.03) & (tv < 1.03)
    P = surface(s, th); N = normal(s, th)
    plo, phi = P[ok].min(0) - 0.01, P[ok].max(0) + 0.01
    pos = np.zeros((R * R, 4), F); nr_ = np.zeros((R * R, 4), F)
    pos[ok, :3] = (P[ok] - plo) / (phi - plo); pos[:, 3] = 1
    nr_[ok, :3] = N[ok] * 0.5 + 0.5; nr_[:, 3] = 1
    ao = np.ones((tex, tex, 4), F)
    np.savez_compressed(os.path.join(work, f'{ID}-bake.npz'), nrm=nr_.reshape(R, R, 4), pos=pos.reshape(R, R, 4), ao=ao, plo=plo, phi=phi)


# ---------- skinning ----------
WEIGHT_SMOOTH = (3, 0.5)


def fix_weights(W, wpos, names, G, weld):
    bi = {n: i for i, n in enumerate(names)}
    W[:, bi['ctag']] = 0
    s, _ = tube_coords(wpos)
    # the head moves as one piece, blended into the neck behind the jaws
    k = sstep(0.058, 0.044, s)[:, None]
    hw = np.zeros_like(W); hw[:, bi['head']] = 1
    W = W * (1 - k) + hw * k
    return W


# ---------- scales, paint and detail ----------
def _hex(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


K = {
    'body': _hex(0x2F3324), 'dark': _hex(0x111310), 'stripe': _hex(0xE3CC5C), 'stripeDk': _hex(0xB49A3A), 'lat': _hex(0xD4CC86),
    'belly': _hex(0xC4C88E), 'bellyDk': _hex(0x8E9462), 'head': _hex(0x3B3A26), 'lip': _hex(0xB8B27A), 'skin': _hex(0xE0DACA),
    'gap': _hex(0x0C0D0A),
}
NROW = 19                     # dorsal scale rows around the body
P_S = 0.0056                  # dorsal scale length along the body
P_V = 0.0062                  # belly plate length
TH_V = 2.42                   # where the belly plates begin (angle from the top)
_cache = {}


def parts(P):
    s, th = tube_coords(P)
    return {'s': s, 'th': th}


def _dorsal(s, th):
    """staggered rows of keeled scales: height, distance to the scale edge (0..0.5), the scale's center (s, th)"""
    dth = 2 * np.pi / NROW
    best1 = np.full(len(s), 9.0, F); best2 = np.full(len(s), 9.0, F)
    cs = np.zeros(len(s), F); ct = np.zeros(len(s), F)
    j0 = np.round(th / dth)
    for dj in (-1, 0, 1):
        j = j0 + dj
        off = 0.5 * (np.abs(j) % 2)
        for di in (-1, 0, 1):
            i = np.floor(s / P_S - off) + di
            sc = (i + off + 0.5) * P_S
            tc = j * dth
            # rhombic cells: distance stretched along the body, scales a little longer than wide
            d = np.sqrt(((s - sc) / P_S) ** 2 * 1.0 + ((th - tc) / dth) ** 2 * 1.0)
            m = d < best1
            best2 = np.where(m, best1, np.minimum(best2, d))
            best1 = np.where(m, d, best1)
            cs = np.where(m, sc, cs); ct = np.where(m, tc, ct)
    e = best2 - best1
    a = (s - cs) / P_S                       # -0.5 front .. 0.5 back
    b = (th - ct) / dth
    h = (0.5 + 0.9 * np.clip(a + 0.5, 0, 1)) * sstep(0.0, 0.18, e)
    h += 0.55 * np.exp(-(b / 0.09) ** 2) * sstep(-0.35, 0.1, a) * sstep(0.0, 0.12, e)
    return h, e, cs, ct


def scales(P, N, c):
    key = (len(P), float(P[:7].sum()))
    if key in _cache:
        return _cache[key]
    s, th = c['s'], c['th']
    n = len(s)
    r = sect(s)[2]
    # body scales
    hd, ed, cs, ct = _dorsal(s, th)
    H = hd * 0.13 * P_S * (r / 0.017) ** 0.5
    E = ed.copy()
    # belly plates: wide, overlapping toward the tail, the free edge raised
    bel = sstep(TH_V - 0.06, TH_V + 0.02, th) * sstep(0.06, 0.08, s)
    iv = np.floor(s / P_V)
    av = s / P_V - iv
    hv = 0.10 * P_V * (0.45 + 0.55 * av) * sstep(0.0, 0.08, av) * sstep(1.0, 0.9, av) * sstep(TH_V - 0.02, TH_V + 0.08, th)
    ev = np.minimum(np.minimum(av, 1 - av), sstep(TH_V - 0.02, TH_V + 0.12, th) * 0.5)
    H = H * (1 - bel) + hv * bel
    E = E * (1 - bel) + ev * bel
    CS = np.where(bel > 0.5, (iv + 0.5) * P_V, cs); CT = np.where(bel > 0.5, np.pi, ct)
    # head: large plates on top (seams), lip scales along the mouth, smooth scales elsewhere
    head = sstep(0.068, 0.054, s)
    seam = _head_seams(s, th)
    mt = mouth_th(s)
    lipU = sstep(mt - 0.42, mt - 0.32, th) * sstep(mt - 0.04, mt - 0.1, th)
    lipL = sstep(mt + 0.04, mt + 0.1, th) * sstep(mt + 0.5, mt + 0.4, th)
    lpit = 0.0031
    il = np.floor((s - 0.002) / lpit)
    al = (s - 0.002) / lpit - il
    lips = np.maximum(lipU, lipL) * sstep(0.046, 0.04, s)
    hl = 0.00012 * sstep(0.0, 0.12, al) * sstep(1.0, 0.88, al)
    hh = 0.00022 * sstep(0.0, 0.0006, seam) + 0.00002 * (fbm(P * 2000, 2, 91) - 0.5)
    hh = hh * (1 - lips) + hl * lips
    H = H * (1 - head) + hh * head
    E = E * (1 - head) + np.minimum(seam / 0.0012, 0.5) * head
    out = (H.astype(F), E.astype(F), CS.astype(F), CT.astype(F), bel, head, lips, lipU, seam)
    _cache[key] = out
    return out


def _head_seams(s, th):
    """distance (m, along the surface roughly) to the seams between the big head plates: rostral, internasals,
    prefrontals, frontal and supraoculars, parietals"""
    r = sect(s)[2]
    xt = th * r * 1.05                       # arc from the top midline
    d = np.full(len(s), 1.0, F)
    top = sstep(1.25, 1.05, th)
    for s0 in (0.0035, 0.0085, 0.0150, 0.0320, 0.0490):
        d = np.minimum(d, np.abs(s - s0) + (1 - top) * 1.0)
    # the midline between the paired plates (not through the frontal)
    mid = (s < 0.015) | ((s > 0.032) & (s < 0.049))
    d = np.where(mid & (s > 0.0035), np.minimum(d, np.abs(xt)), d)
    # frontal: a shield narrowing toward the back, supraoculars beside it
    fw = 0.0042 - 0.0012 * np.clip((s - 0.015) / 0.017, 0, 1)
    fr = (s > 0.015) & (s < 0.032)
    d = np.where(fr, np.minimum(d, np.abs(xt - fw)), d)
    d = np.where(fr, np.minimum(d, np.abs(xt - 0.0092) + 0.0), d)
    return d.astype(F)


def paint(P, N, c):
    H, E, CS, CT, bel, head, lips, lipU, seam = scales(P, N, c)
    s, th = c['s'], c['th']
    n = len(s)
    col = np.tile(K['body'], (n, 1))
    jit = _hash(np.round(CS * 5000).astype(np.int64), np.round(CT * 300).astype(np.int64), np.zeros(n, np.int64), 92)
    col *= (0.88 + 0.24 * jit)[:, None]
    # checkered dark spots in two rows on each side between the stripes (by scale)
    dth = 2 * np.pi / NROW
    jr = np.round(CT / dth)
    blk = np.floor(CS / (P_S * 2.2) + 0.5 * (jr % 2))
    chk = ((blk % 2) == 0) & (((jr >= 2) & (jr <= 4)) | (jr == 7))
    col = _mix(col, K['dark'], chk * 0.85 * sstep(0.08, 0.12, s))
    # three yellow stripes: one down the middle of the back (the center row and half of each next one), one low on
    # each side (the 2nd and 3rd rows above the belly plates), fading out at the end of the tail
    dor = sstep(1.1, 0.9, th / dth)
    lat = ((jr >= 5) & (jr <= 6)).astype(F)
    ycol = _mix(np.tile(K['stripe'], (n, 1)), K['stripeDk'], 0.4 * jit)
    fade = sstep(0.07, 0.09, s) * sstep(L - 0.02, L - 0.12, s)
    col = _mix(col, ycol, dor * fade)
    col = _mix(col, K['lat'], lat * fade * 0.9)
    # the skin between the scales shows pale in places
    col = _mix(col, K['skin'], sstep(0.06, 0.0, E) * 0.35 * (1 - head) * (1 - bel) * sstep(0.6, 0.85, vnoise(P * 900, 93)))
    col = col * (0.6 + 0.4 * sstep(0.0, 0.12, E))[:, None] * (1 - head[:, None]) + col * head[:, None]
    # belly: pale green-yellow, small dark marks at the outer ends of the plates
    bc = _mix(np.tile(K['belly'], (n, 1)), K['bellyDk'], sstep(TH_V + 0.15, TH_V + 0.02, th) * sstep(0.55, 0.85, vnoise(np.stack([CS * 400, th * 3, s * 0], 1), 94)))
    col = _mix(col, bc, bel)
    # head: olive brown on top with two small pale spots on the parietals; pale lips with dark bars between the
    # lip scales; a pale chin and throat
    hc = np.tile(K['head'], (n, 1)) * (0.92 + 0.12 * fbm(P * 600, 2, 95))[:, None]
    ps = np.exp(-(((s - 0.044) / 0.0018) ** 2 + ((th * sect(s)[2] - 0.0022) / 0.0011) ** 2))
    hc = _mix(hc, K['lip'], ps * 0.8)
    hc = _mix(hc, K['dark'], sstep(0.0004, 0.0, seam) * 0.5)
    # (dark bars between pale lip scales read as a row of teeth at game distance: keep the sutures faint)
    lc = _mix(np.tile(K['lip'], (n, 1)), K['head'], sstep(0.1, 0.02, np.minimum(*_lipfrac(s))) * 0.3 * lipU)
    lc = _mix(lc, K['head'], sstep(mouth_th(s) - 0.12, mouth_th(s) - 0.36, th) * 0.85)
    hc = _mix(hc, lc, lips)
    hc = _mix(hc, K['lip'], sstep(mouth_th(s) + 0.3, mouth_th(s) + 0.5, th) * sstep(0.07, 0.05, s))
    col = _mix(col, hc, head)
    # mouth line, nostril, eye socket: dark
    col = _mix(col, K['gap'], np.exp(-((th - mouth_th(s)) / 0.035) ** 2) * sstep(0.044, 0.04, s) * sstep(0.0008, 0.002, s) * 0.7)
    rn = np.sqrt((s - NOS_S) ** 2 + ((th - NOS_TH) * 0.006) ** 2)
    col = _mix(col, K['gap'], sstep(0.0008, 0.0004, rn))
    re = np.sqrt((s - EYE_S) ** 2 + ((th - EYE_TH) * 0.0105) ** 2)
    col = _mix(col, K['gap'], sstep(EYE_R * 1.02, EYE_R * 0.9, re))
    rough = 0.42 + 0.1 * (1 - sstep(0.0, 0.15, E)) + 0.08 * bel - 0.12 * head * (1 - lips)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _lipfrac(s):
    lp = 0.0031
    a = (s - 0.002) / lp - np.floor((s - 0.002) / lp)
    return a, 1 - a


def _mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def detail(P, N, c):
    return scales(P, N, c)[0]


def finish(C, ao, valid):
    return C


MAP_QUALITY = (72, 72)


def stats(P, N, c, col):
    return {}


def meta(st):
    return {
        'eye': {'p': [round(float(v), 5) for v in EYE_C], 'r': EYE_R, 'dir': [round(float(v), 4) for v in EYE_DIR], 'lid': [0.95, -0.95, 0],
                'iris': 0x3A2A14, 'irisR': 0.92, 'pupilR': 0.5, 'noBlink': True, 'lidCol': 0x3B3A26},
        'mouth': [round(float(v), 4) for v in MOUTH],
        'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.05, 0.03], 'flat': 0x2F3324,
    }
