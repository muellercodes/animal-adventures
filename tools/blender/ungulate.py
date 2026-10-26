# Shared helpers for the hooved animals (deer.py, goat.py, moose.py): the horse's field helpers made generic (local
# evaluation boxes, mirroring, grooves, flattened round cones), split hooves and dewclaws, ears, eye openings, antlers
# and horns as smooth tube chains with polyline coordinates (for ridges and rings), coat strokes, hair placement on
# the sculpt, and the paint finish. All in game rig space (meters, x left, y up, z forward), the +x side.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, length, _hash


def box(P, lo, hi):
    return np.all((P >= lo) & (P <= hi), axis=1)


def local(P, lo, hi, fn, far=1.0):
    """evaluate fn only inside the box (keeps big grids fast); far elsewhere"""
    m = box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = np.full(len(P), far, F)
    if m.any():
        out[m] = fn(P[m])
    return out


def local_n(P, lo, hi, fn, n, far=1.0):
    m = box(P, np.asarray(lo, F), np.asarray(hi, F))
    out = [np.full(len(P), far, F) for _ in range(n)]
    if m.any():
        for o, r in zip(out, fn(P[m])):
            o[m] = r
    return out


def mirror(P):
    Q = P.copy(); Q[:, 0] = np.abs(Q[:, 0]); return Q


def groove(s, width, depth):
    return depth * np.exp(-(s / width) ** 2)


def eround(Q, a, b, ra, rb, sx=1.0, cx=0.0):
    """round cone squashed across x by sx about the column x = cx (flat legs, tendons)"""
    R = Q.copy(); R[:, 0] = cx + (R[:, 0] - cx) / sx
    a = np.array(a, F); b = np.array(b, F)
    a[0] = cx + (a[0] - cx) / sx; b[0] = cx + (b[0] - cx) / sx
    return round_cone(R, a, b, ra, rb) * min(1.0, sx)


def hexc(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


def mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


def finish(C, ao, valid, floor=0.35):
    """fold ambient occlusion into the color (linear light)"""
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (floor + (1 - floor) * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


def rgb_int(c):
    return int(round(c[0] * 255)) << 16 | int(round(c[1] * 255)) << 8 | int(round(c[2] * 255))


def lid_color(col, eyeD, r):
    """the coat just around the eye (the game draws the closing lids on the eye ball in this color)"""
    m = sstep(r + 0.03, r + 0.016, eyeD) * sstep(r + 0.008, r + 0.014, eyeD)
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.8
    return rgb_int(np.clip(lid, 0, 1))


# ---------- hooves ----------
def toe(Q, c, side, L, w, hf, hh, slope, gap):
    """one claw of a split hoof (c: ground center of the whole hoof, side +1 outer claw toward +x, -1 inner claw).
    Seen from below a long D with a flat inner wall and a pointed tip; the front wall leans back (slope = how far the
    coronet sits behind the toe per meter of height); hf height at the toe, hh at the heel."""
    x = Q[:, 0] - c[0]
    y = Q[:, 1]
    z = Q[:, 2] - c[2]
    k = np.clip(y / hf, 0, 1.3)
    zc = z + slope * y
    xc = (x - side * (gap * 0.5 + w * 0.5)) * side           # + toward the outer wall of this claw
    b = L * 0.5 * (1 - 0.1 * k)
    # narrower toward the tip, flat on the inside (toward the other claw)
    t = sat(zc / b)
    a = w * 0.5 * (1 - 0.12 * k) * (1 - 0.55 * t ** 1.6)
    e = np.where(xc < 0, 5.0, 2.2)
    r = (np.abs(xc / np.maximum(a, 1e-4)) ** e + np.abs(zc / b) ** 2.2) ** (1 / 2.2)
    d_side = (r - 1) * np.minimum(a, b) * 0.9
    top = hh + (hf - hh) * sat(0.5 + zc / (2 * b)) ** 1.3
    d = smax(smax(d_side, y - top, 0.006), -y + 0.0004, 0.003)
    return d


def cloven(Q, c, L, W, hf, hh, slope, gap=0.003):
    """a split hoof: two claws side by side (W the width of both)"""
    w = (W - gap) * 0.5
    return np.minimum(toe(Q, c, 1, L, w, hf, hh, slope, gap), toe(Q, c, -1, L, w, hf, hh, slope, gap))


def dewclaws(Q, c, spread, r, l, down):
    """two small horny claws behind the fetlock (c: between them), pointing down and back"""
    d = None
    for s in (1, -1):
        a = c + V(s * spread, 0, 0)
        b = a + down * l
        e = round_cone(Q, a, b, r, r * 0.35)
        d = e if d is None else np.minimum(d, e)
    return d


# ---------- ears ----------
def ear(Q, B, A, Nn, L, hw0, cup=0.7, th0=0.011, th1=0.0035, tip=0.0, base_r=None, roll=0.0):
    """cupped ear standing out from B along A, its opening facing Nn; hw0 the widest half width. tip 0 gives a round
    tip (deer, goat), 1 a pointed one (horse). roll curls the edges toward the opening."""
    C = np.cross(Nn, A)
    D = Q - B
    a, c, n = D @ A, D @ C, D @ Nn
    u = np.clip(a / L, 0, 1)
    rnd_ = np.sqrt(np.maximum(1 - ((u - 0.42) / 0.6) ** 2, 0.0))
    pt = np.maximum(np.sin(np.pi * np.clip(u * 0.8 + 0.2, 0, 1)), 0) ** 0.75 * (1 - 0.25 * u)
    hw = hw0 * (rnd_ * (1 - tip) + pt * tip) + 0.0012
    k = np.clip(c / np.maximum(hw, 1e-4), -1.2, 1.2)
    mid = hw * k * k * cup * (1 - 0.5 * u) - 0.01 * (1 - u) ** 1.5 + roll * hw * k ** 4
    th = 0.5 * (th0 * (1 - u) + th1 * u)
    d_out = np.abs(c) - hw
    d_th = np.abs(n - mid) - th
    d_end = np.maximum(-a, a - L)
    d = smax(smax(d_out, d_th, 0.003), d_end, 0.006)
    br = base_r if base_r is not None else (0.03, 0.028, 0.026)
    d = smin(d, ellipsoid(Q, B + A * 0.012 - Nn * 0.01, V(*br)), 0.012)
    return d


def ear_coords(Q, B, A, Nn):
    """along the ear, across it, and out of its opening"""
    C = np.cross(Nn, A)
    D = Q - B
    return D @ A, D @ C, D @ Nn


# ---------- eyes ----------
def eye_parts(Q, C, R, Dr, lid_w, lid_h, lid_off, mound=(0.009, 0.0075, 0.0035), brow=None):
    """lid mound around the eye (add), the opening in front of the eye (carve), the eyeball (add), brow ridge (add)"""
    up = nrm(np.array([0, 1, 0], F) - Dr * Dr[1])
    sd = np.cross(up, Dr)
    D = Q - C
    s, u, g = D @ sd, D @ up, D @ Dr
    L = np.stack([s, u, g], 1)
    lids = ellipsoid(L, V(0.0, 0.001, -0.003), V(R + mound[0], R + mound[1], R + mound[2]))
    ua = u - lid_off
    ap = np.sqrt((s / lid_w) ** 2 + (ua / lid_h) ** 2) - 1
    ap = ap + 0.25 * sstep(0.45, 1.0, np.abs(s) / lid_w) * (np.abs(ua) / lid_h)
    carve = smax(ap * lid_h, -g, 0.0015)
    ball = length(D) - R * 0.86
    if brow is None:
        brow = ((-0.03, 0.026, -0.016), (0.012, 0.03, -0.012), 0.008, 0.006)
    br = round_cone(L, V(*brow[0]), V(*brow[1]), brow[2], brow[3])
    return carve, lids, ball, br


# ---------- antlers and horns: smooth chains of round cones along polylines ----------
def chain(Q, pts, rad, k=0.0):
    d = None
    for i in range(len(pts) - 1):
        e = round_cone(Q, pts[i], pts[i + 1], rad[i], rad[i + 1])
        d = e if d is None else smin(d, e, k)
    return d


def resample(pts, rad, n):
    """smooth (monotone cubic) resampling of a polyline and its radii to n points"""
    from scipy.interpolate import PchipInterpolator
    pts = np.asarray(pts, np.float64); rad = np.asarray(rad, np.float64)
    s = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    f = PchipInterpolator(s, np.concatenate([pts, rad[:, None]], 1), axis=0)
    o = f(np.linspace(0, s[-1], n))
    return o[:, :3].astype(F), o[:, 3].astype(F)


def frames(pts):
    """parallel transport frames along a polyline: tangent, normal, binormal per point"""
    T = np.gradient(np.asarray(pts, np.float64), axis=0)
    T /= np.linalg.norm(T, axis=1, keepdims=True)
    up = np.array([0, 1, 0.0]) if abs(T[0][1]) < 0.9 else np.array([1, 0, 0.0])
    Nv = np.cross(T[0], up); Nv /= np.linalg.norm(Nv)
    Ns, Bs = [], []
    for i in range(len(pts)):
        Nv = Nv - T[i] * np.dot(Nv, T[i]); Nv /= np.linalg.norm(Nv)
        Ns.append(Nv.copy()); Bs.append(np.cross(T[i], Nv))
    return T.astype(F), np.array(Ns, F), np.array(Bs, F)


def tube_coords(Q, pts, rad):
    """for each point the nearest place on a polyline: arc length, distance to the axis minus the radius there, the
    angle around the axis (parallel transport frame) and the tube's index of the segment"""
    pts = np.asarray(pts, F); rad = np.asarray(rad, F)
    T, Nf, Bf = frames(pts)
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))]).astype(F)
    best = np.full(len(Q), np.inf, F); bs = np.zeros(len(Q), F); ba = np.zeros(len(Q), F); bi = np.zeros(len(Q), np.int32)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ab = b - a
        l2 = float(ab @ ab)
        t = np.clip(((Q - a) @ ab) / l2, 0, 1)
        C = a + np.outer(t, ab)
        r = rad[i] + (rad[i + 1] - rad[i]) * t
        dist = length(Q - C) - r
        m = dist < best
        best = np.where(m, dist, best); bs = np.where(m, arc[i] + t * np.sqrt(l2), bs); bi = np.where(m, i, bi)
        nn = Nf[i] + (Nf[i + 1] - Nf[i]) * t[:, None]; bb = Bf[i] + (Bf[i + 1] - Bf[i]) * t[:, None]
        R = Q - C
        ang = np.arctan2((R * bb).sum(1), (R * nn).sum(1))
        ba = np.where(m, ang, ba)
    return bs, best, ba, bi


class Tubes:
    """a set of branching tubes (antler beam and tines, a horn): smoothly resampled once, then a field (smooth union,
    k = fillet radius where a tine leaves the beam) and per point coordinates of the nearest tube"""

    def __init__(self, tubes, n=24, k=0.006):
        self.raw = tubes
        self.tubes = [resample(p, r, max(6, int(n * min(1.0, np.linalg.norm(np.diff(np.asarray(p), axis=0), axis=1).sum() / 0.25) + 4))) for p, r in tubes]
        self.k = k
        allp = np.concatenate([p for p, _ in self.tubes]); allr = np.concatenate([r for _, r in self.tubes])
        self.lo = allp.min(0) - allr.max() - 0.01
        self.hi = allp.max(0) + allr.max() + 0.01

    def field(self, Q, far=0.05):
        """smooth union of the tubes; each segment is evaluated only near its own bounding box"""
        d = np.full(len(Q), far, F)
        for j, (p, r) in enumerate(self.tubes):
            e = np.full(len(Q), far, F)
            for i in range(len(p) - 1):
                m = r[i] + self.k + 0.012
                lo = np.minimum(p[i], p[i + 1]) - m; hi = np.maximum(p[i], p[i + 1]) + m
                sel = box(Q, lo, hi)
                if sel.any():
                    e[sel] = np.minimum(e[sel], round_cone(Q[sel], p[i], p[i + 1], r[i], r[i + 1]))
            d = smin(d, e, self.k)
        return d

    def coords(self, Q):
        """(tube index, arc length, arc fraction, distance from the surface, angle around the axis) of the nearest tube"""
        best = np.full(len(Q), np.inf, F); out = [np.zeros(len(Q), F) for _ in range(4)]
        for j, (p, r) in enumerate(self.tubes):
            s, d, a, _ = tube_coords(Q, p, r)
            L = float(np.linalg.norm(np.diff(p, axis=0), axis=1).sum())
            m = d < best
            best = np.where(m, d, best)
            for o, v in zip(out, (np.full(len(Q), j, F), s, s / L, a)):
                o[:] = np.where(m, v, o)
        return out[0].astype(np.int32), out[1], out[2], best, out[3]


def horn(Q, pts, rad, flat=0.8, pitch=0.0, depth=0.0, keel=0.0, n=20):
    """a horn along a polyline: oval in section (flat = side to side over front to back), transverse ridges every pitch
    meters (depth deep) and a ridge (keel) along its front edge. Returns (field, arc fraction)."""
    p, r = resample(pts, rad, n)
    T, _, _ = frames(p)
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(p, axis=0), axis=1))]).astype(F)
    L = float(arc[-1])
    bs = np.zeros(len(Q), F); out = np.full(len(Q), 1.0, F)
    for i in range(len(p) - 1):
        a, b = p[i], p[i + 1]
        ab = b - a
        l2 = float(ab @ ab)
        t = np.clip(((Q - a) @ ab) / l2, 0, 1)
        C = a + np.outer(t, ab)
        R = Q - C
        tg = T[i] + (T[i + 1] - T[i]) * t[:, None]
        tg /= np.linalg.norm(tg, axis=1, keepdims=True)
        lat = np.array([1, 0, 0], F) - tg * tg[:, :1]
        lat /= np.maximum(np.linalg.norm(lat, axis=1, keepdims=True), 1e-6)
        fb = np.cross(tg, lat)
        xl, yf = (R * lat).sum(1), (R * fb).sum(1)
        rr = r[i] + (r[i + 1] - r[i]) * t
        s = arc[i] + t * np.sqrt(l2)
        ta = (R * tg).sum(1)
        e = np.sqrt((xl / flat) ** 2 + yf ** 2 + ta ** 2) * flat ** 0.5 - rr
        # keel: the front edge a little sharper
        e = e - keel * rr * sstep(0.6, 1.0, -yf / np.maximum(np.sqrt(xl * xl + yf * yf), 1e-6))
        if pitch:
            e = e - depth * (0.5 + 0.5 * np.cos(2 * np.pi * s / pitch)) * sstep(L, L * 0.6, s)
        m = e < out
        out = np.where(m, e, out); bs = np.where(m, s / L, bs)
    return out, bs


# ---------- coat strokes ----------
def strands(P, N, dens, flow, cell=0.0032, l0=0.006, l1=0.012, wid=0.00045, seed=70):
    """coat hairs as short strokes along the flow: one possible stroke per cell (texture bombing, so the strokes follow
    the flow wherever it turns). Returns coverage 0..1"""
    out = np.zeros(len(P), F)
    on = dens > 0.01
    Q, Nq, D = P[on], N[on], dens[on]
    G = np.floor(Q / cell).astype(np.int64)
    best = np.zeros(len(Q), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                c = G + np.array([dx, dy, dz])
                h0, h1, h2, h3, h4 = (_hash(c[:, 0], c[:, 1], c[:, 2], seed + s) for s in range(5))
                s0 = ((c + np.stack([h0, h1, h2], 1)) * cell).astype(F)
                fl = flow(s0)
                fl = fl - Nq * (fl * Nq).sum(1, keepdims=True)
                fl /= np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)
                Lh = l0 + (l1 - l0) * h4
                rr = Q - s0
                rr = rr - Nq * (rr * Nq).sum(1, keepdims=True)
                t = np.clip((rr * fl).sum(1) / Lh, 0, 1)
                dist = np.linalg.norm(rr - fl * (Lh * t)[:, None], axis=1)
                w = wid * (1 - 0.6 * t)
                line = sstep(w * 2.0, w * 0.3, dist) * (1 - 0.4 * t) * (h3 < D)
                best = np.maximum(best, line * (0.6 + 0.4 * h0))
    out[on] = best
    return out


def spots(P, cell, r0, r1, seed=90):
    """round spots on a jittered grid (fawn spots): coverage 0..1 and the spot cell's random value"""
    G = np.floor(P / cell).astype(np.int64)
    best = np.zeros(len(P), F); hv = np.zeros(len(P), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                c = G + np.array([dx, dy, dz])
                h0, h1, h2, h3 = (_hash(c[:, 0], c[:, 1], c[:, 2], seed + s) for s in range(4))
                s0 = (c + 0.15 + 0.7 * np.stack([h0, h1, h2], 1)) * cell
                r = r0 + (r1 - r0) * h3
                d = length((P - s0).astype(F))
                v = sstep(r, r * 0.6, d)
                m = v > best
                best = np.where(m, v, best); hv = np.where(m, h3, hv)
    return best, hv


# ---------- hair placed on the sculpt ----------
def surface(shape, o, d, far=0.5, steps=160):
    """first points where the body surface is met going from o (outside) along d; o, d (n, 3), all rays at once"""
    o = np.atleast_2d(np.asarray(o, np.float64)); d = np.atleast_2d(np.asarray(d, np.float64))
    d = d / np.linalg.norm(d, axis=1, keepdims=True)
    ts = np.linspace(0, far, steps)
    P = (o[:, None, :] + ts[None, :, None] * d[:, None, :]).reshape(-1, 3).astype(F)
    inside = shape(P).reshape(len(o), steps) < 0
    k = np.where(inside.any(1), inside.argmax(1), steps - 1)
    lo, hi = ts[np.maximum(k - 1, 0)], ts[k]
    for _ in range(18):
        m = 0.5 * (lo + hi)
        s = shape((o + m[:, None] * d).astype(F)) < 0
        hi = np.where(s, m, hi); lo = np.where(s, lo, m)
    return (o + hi[:, None] * d).astype(F)


def push_out(shape, P, clear):
    """move points closer to the body than clear out along the field gradient"""
    P = P.astype(F).copy()
    e = 0.002
    for _ in range(5):
        d = shape(P)
        m = d < clear
        if not m.any():
            break
        Q = P[m]
        g = np.stack([shape(Q + np.eye(3, dtype=F)[k] * e) - d[m] for k in range(3)], 1) / e
        g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
        P[m] = Q + g * (clear - d[m])[:, None]
    return P


def rnd(i, k):
    x = (i * 7919 + k * 104729 + 12345) % 2147483647
    for _ in range(3):
        x = (x * 48271) % 2147483647
    return (x % 100000) / 100000.0


def wsum(*pairs):
    d = {}
    for n, w in pairs:
        if w > 1e-4:
            d[n] = d.get(n, 0) + w
    return d


def seg_t(P, a, b):
    """position along the segment a -> b (0..1, clamped) and distance from it"""
    ab = b - a
    t = np.clip(((P - a) @ ab) / float(ab @ ab), 0, 1)
    return t, length(P - (a + np.outer(t, ab)))
