# Shared helpers for the medium coated carnivores (fox, raccoon, otter, weasel): field helpers, a frame for the
# head, eyes with lids, pointed or round ears, paws with toes, coat strokes along the fur flow, hair cards
# (whiskers, tufts) and the bits of the species files that are the same for all of them. Units are meters in game
# rig space (x left, y up, z forward, ground at y = 0); the species files hold the anatomy, colors and settings.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, length, fbm, vnoise, _hash


# ---------- field helpers ----------
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


def hexc(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)


def mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (k - c) * t


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


class Frame:
    """an orthonormal frame: origin o, axis a (local s), up u (local u), side x; lengths in meters"""
    def __init__(self, o, a, u):
        self.o = np.asarray(o, F)
        self.a = nrm(a)
        u = np.asarray(u, F)
        self.u = nrm(u - self.a * np.dot(u, self.a))

    def loc(self, Q):
        """(x side, u up, s along) of rig points (x is not mirrored here)"""
        D = Q - self.o
        return np.stack([D[:, 0], D @ self.u, D @ self.a], 1)

    def pt(self, s, u, x=0.0):
        return self.o + self.a * s + self.u * u + V(1, 0, 0) * x


# ---------- eyes ----------
class Eye:
    """eye ball center c, radius r, gaze dir; the lid opening is an ellipse lid_w x lid_h across the eye, lifted by
    off, its outer corner raised by slant (an almond eye), and it is cut out of a lid mound"""
    def __init__(self, c, r, d, lid_w, lid_h, off=0.0, slant=0.0, mound=(0.007, 0.006, 0.003), ball=0.86, sink=0.0):
        # sink: move the ball back into the head along the gaze (times r), so a shut eye is flush with the face
        self.r = float(r)
        self.d = nrm(d)
        self.c = np.asarray(c, F) - self.d * (sink * self.r)
        self.up = nrm(np.array([0, 1, 0], F) - self.d * self.d[1])
        self.side = np.cross(self.up, self.d)        # toward the outer corner on the +x eye
        self.lid_w, self.lid_h, self.off, self.slant, self.mound, self.ballk = lid_w, lid_h, off, slant, mound, ball

    def loc(self, Q):
        D = Q - self.c
        return np.stack([D @ self.side, D @ self.up, D @ self.d], 1)

    def parts(self, Q):
        """carve (the opening in front of the ball), lids (mound around it), ball (smaller than the game's eye)"""
        L = self.loc(Q)
        s, u, g = L[:, 0], L[:, 1], L[:, 2]
        r = self.r
        lids = ellipsoid(L, V(0.0, 0.0006, -0.002), V(r + self.mound[0], r + self.mound[1], r + self.mound[2]))
        ua = u - self.off - self.slant * s
        ap = np.sqrt((s / self.lid_w) ** 2 + (ua / self.lid_h) ** 2) - 1
        # pointed corners: the opening narrows toward both ends (almond)
        ap = ap + 0.3 * sstep(0.4, 1.0, np.abs(s) / self.lid_w) * (np.abs(ua) / self.lid_h)
        carve = smax(ap * self.lid_h, -g - r * 0.35, 0.0012)
        ball = length(Q - self.c) - r * self.ballk
        return carve, lids, ball

    def meta(self):
        # the game draws its own lids on the eye ball; keep them just behind the sculpted opening while the eye is open
        up, dn = (self.off + self.lid_h) / self.r, (self.off - self.lid_h) / self.r
        up, dn = min(0.95, up + 0.3), max(-0.95, dn - 0.3)
        return [round(float(v), 5) for v in self.c], round(self.r, 5), [round(float(v), 4) for v in self.d], [round(up, 3), round(dn, 3), 0.3]


# ---------- ears ----------
def ear(Q, B, A, Nn, L, hw0, shape='point', th0=0.006, th1=0.002, cup=0.7, tipin=0.0, base_r=None):
    """an ear standing on the head at B, along A, its opening facing Nn: 'point' (fox: a broad triangle with a sharp
    tip) or 'round' (raccoon, otter, weasel: a short rounded flap). Q must be mirrored (+x side)."""
    C = np.cross(Nn, A)
    D = Q - B
    a, c, n = D @ A, D @ C, D @ Nn
    u = np.clip(a / L, 0, 1)
    if shape == 'point':
        hw = hw0 * np.clip(1 - u, 0, 1) ** 0.85 * (0.75 + 0.25 * np.sqrt(np.clip(u * 4, 0, 1))) + 0.0006
    else:
        hw = hw0 * np.sqrt(np.clip(1 - u * u, 0, 1)) * (0.8 + 0.2 * np.sqrt(np.clip(u * 3, 0, 1))) + 0.0006
    k = np.clip(c / np.maximum(hw, 1e-4), -1.2, 1.2)
    mid = hw * k * k * cup * (1 - 0.5 * u) - 0.25 * hw0 * (1 - u) ** 1.5 * cup + tipin * u * u
    th = 0.5 * (th0 * (1 - u) + th1 * u)
    d_out = np.abs(c) - hw
    d_th = np.abs(n - mid) - th
    d_end = np.maximum(-a, a - L)
    d = smax(smax(d_out, d_th, 0.0015), d_end, 0.003)
    br = base_r if base_r is not None else (hw0 * 0.75, hw0 * 0.6, hw0 * 0.6)
    d = smin(d, ellipsoid(Q, B - A * (br[1] * 0.35), V(*br)), min(br) * 0.6)
    return d


def ear_coords(Q, B, A, Nn):
    """(along, across, out of the opening) of mirrored points in an ear's frame"""
    C = np.cross(Nn, A)
    D = Q - B
    return D @ A, D @ C, D @ Nn


# ---------- paws ----------
def paw(Q, c, toes, pad=None, claw=None, yaw=0.0):
    """a digitigrade paw on the ground: c = center under the toes' knuckles (x, ground y, z), toes = list of
    (side offset, forward offset, radius, length, lift), pad = (radii) of the main pad block behind the toes,
    claw = (length, radius) or None. yaw turns the paw about y (radians, + toward +x). Returns (paw, claws)."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    D = Q - c
    x = D[:, 0] * cy - D[:, 2] * sy
    z = D[:, 0] * sy + D[:, 2] * cy
    L = np.stack([x, D[:, 1], z], 1)
    d = None
    cl = np.full(len(Q), 1.0, F)
    for (ox, oz, r, ln, lift) in toes:
        a = V(ox * 0.7, r + lift, oz - ln * 0.5)
        b = V(ox, r * 0.95, oz + ln * 0.5)
        t = round_cone(L, a, b, r * 1.05, r)
        d = t if d is None else smin(d, t, r * 0.6)
        if claw:
            tip = b + V(ox * 0.12, -r * 0.55, r * 0.9 + claw[0])
            cl = np.minimum(cl, round_cone(L, b + V(0, r * 0.15, r * 0.45), tip, claw[1], claw[1] * 0.25))
    if pad is not None:
        d = smin(d, ellipsoid(L, V(0, pad[1] * 0.9, -pad[2] * 0.5), V(*pad)), pad[1] * 0.8)
    # flat sole
    d = smax(d, -L[:, 1] + 0.0004, 0.0025)
    return d, cl


def hand(Q, c, fingers, palm, yaw=0.0, claw=None, palm_c=(0.0, 0.0)):
    """a flat hand or foot on the ground (raccoon hands and feet, otter and weasel feet): palm = radii of the palm
    block, centered (palm_c = side, forward offsets) over c (on the ground); fingers = list of (angle in degrees from
    forward toward +x, base distance from c, length, radius): slender digits ending in a small pad, with a claw beyond
    them when claw = (length, radius). Returns (hand, claws)."""
    cy, sy = np.cos(yaw), np.sin(yaw)
    D = Q - c
    x = D[:, 0] * cy - D[:, 2] * sy
    z = D[:, 0] * sy + D[:, 2] * cy
    L = np.stack([x, D[:, 1], z], 1)
    d = ellipsoid(L, V(palm_c[0], palm[1] * 0.9, palm_c[1]), V(*palm))
    cl = np.full(len(Q), 1.0, F)
    for (ang, b0, ln, r) in fingers:
        a = np.radians(ang)
        dv = V(np.sin(a), 0.0, np.cos(a))
        p0 = V(np.sin(a) * b0, r * 1.15, np.cos(a) * b0)
        p1 = p0 + dv * ln + V(0, -r * 0.2, 0)
        d = smin(d, round_cone(L, p0, p1, r * 1.1, r * 0.9), r * 0.9)
        d = smin(d, ellipsoid(L, p1 + V(0, -r * 0.1, 0), V(r * 1.05, r * 0.9, r * 1.1)), r * 0.5)
        if claw:
            tip = p1 + dv * (r * 0.9 + claw[0]) + V(0, -r * 0.55, 0)
            cl = np.minimum(cl, round_cone(L, p1 + V(0, r * 0.35, 0) + dv * (r * 0.3), tip, claw[1], claw[1] * 0.3))
    d = smax(d, -L[:, 1] + 0.0004, 0.002)
    return d, cl


def web(Q, c, fingers, yaw=0.0, reach=0.8, th=0.0011, lift=None):
    """the webbing between the digits of a hand from hand(): a thin plate filling the fan between the first and the
    last digit, out to reach of their length (an otter's feet)"""
    cy, sy = np.cos(yaw), np.sin(yaw)
    D = Q - c
    x = D[:, 0] * cy - D[:, 2] * sy
    z = D[:, 0] * sy + D[:, 2] * cy
    a0, a1 = np.radians(fingers[0][0]), np.radians(fingers[-1][0])
    # boundary rays (outward normals in the x-z plane)
    n0 = np.array([-np.cos(a0), np.sin(a0)], F)
    n1 = np.array([np.cos(a1), -np.sin(a1)], F)
    da = np.maximum(x * n0[0] + z * n0[1], x * n1[0] + z * n1[1])
    rr = np.sqrt(x * x + z * z)
    R = max(f[1] + f[2] * reach for f in fingers)
    y0 = lift if lift is not None else fingers[len(fingers) // 2][3] * 0.9
    d = np.maximum(np.maximum(da, rr - R), np.abs(D[:, 1] - y0) - th)
    return d


# ---------- rays and clearance (hair cards) ----------
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


def push_out(shape, P, clear, e=0.0005):
    """move points closer to the body than clear out along the field gradient"""
    P = P.astype(F).copy()
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


def gradient(shape, P, e=0.0005):
    d = shape(P)
    g = np.stack([shape(P + np.eye(3, dtype=F)[k] * e) - d for k in range(3)], 1) / e
    return g / np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)


# ---------- coat ----------
def strands(P, N, dens, flow, cell, l0, l1, wid, seed=70, lenk=None):
    """coat hairs as short strokes along the flow: one possible stroke per cell (texture bombing, so the strokes
    follow the flow wherever it turns). lenk(points) scales the stroke length and width by region. Returns coverage
    0..1 and a per stroke random value (for tinting)"""
    out = np.zeros(len(P), F)
    tone = np.zeros(len(P), F)
    on = dens > 0.01
    Q, Nq, D = P[on], N[on], dens[on]
    G = np.floor(Q / cell).astype(np.int64)
    best = np.zeros(len(Q), F)
    bt = np.zeros(len(Q), F)
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
                kk = lenk(s0) if lenk is not None else 1.0
                Lh = Lh * kk
                rr = Q - s0
                rr = rr - Nq * (rr * Nq).sum(1, keepdims=True)
                t = np.clip((rr * fl).sum(1) / Lh, 0, 1)
                dist = np.linalg.norm(rr - fl * (Lh * t)[:, None], axis=1)
                w = wid * np.sqrt(kk) * (1 - 0.6 * t)
                line = sstep(w * 2.0, w * 0.3, dist) * (1 - 0.4 * t) * (h3 < D)
                v = line * (0.6 + 0.4 * h0)
                m = v > best
                best = np.where(m, v, best)
                bt = np.where(m, h1, bt)
    out[on] = best
    tone[on] = bt
    return out, tone


def finish(C, ao, valid, k=0.35):
    """fold ambient occlusion into the color (linear light)"""
    lin = np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)
    lin = lin * (k + (1 - k) * ao[..., None])
    return np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(np.maximum(lin, 0), 1 / 2.4) - 0.055)


def lid_color(col, eyed, r):
    """the coat just around the eye (the game draws the closing lids on the eye ball in this color)"""
    m = sstep(r + 0.012, r + 0.006, eyed) * sstep(r + 0.002, r + 0.005, eyed)
    lid = (col * m[:, None]).sum(0) / max(m.sum(), 1e-6) * 0.85
    return int(round(lid[0] * 255)) << 16 | int(round(lid[1] * 255)) << 8 | int(round(lid[2] * 255))


# ---------- skin weights ----------
def set_part(W, bi, mask, bone, k=1.0):
    """move a share k of the weights of the masked vertices to one bone"""
    if not mask.any():
        return
    k = np.asarray(k, F)
    if k.ndim:
        k = k[mask][:, None]
    row = np.zeros(W.shape[1], F); row[bi[bone]] = 1
    W[mask] = W[mask] * (1 - k) + row[None, :] * k


# ---------- hair cards ----------
def whiskers(rows, bone='head', baby=0.55):
    """whisker cards: rows of (root, direction, length, width, droop, curl side vector); returns cards with a single
    dark strand column (col) set by the caller"""
    out = []
    for root, dirv, ln, w, droop, col in rows:
        k = 5
        ts = np.linspace(0, 1, k)
        dirv = nrm(dirv)
        pts = np.array([root + dirv * (ln * t) + V(0, -droop * ln * t * t, 0) for t in ts], F)
        side = nrm(np.cross(dirv, V(0, 1, 0)))
        nr = nrm(np.cross(side, dirv))
        out.append({'pts': pts, 'w': np.linspace(w, w * 0.35, k), 'nrm': np.tile(nr, (k, 1)), 'side': np.tile(V(0, 1, 0), (k, 1)), 'col': col,
                    'bones': [{'_skin': 1.0} if t == 0 else {bone: 1.0} for t in ts], 'baby': np.array([pts[0] + (p - pts[0]) * baby for p in pts], F)})
    return out
