# Shared pieces for the sculpted birds (duck, chicken, swan, parrot, owl): signed distance helpers, scaly legs and
# toes with claws and webs, the wing arm (the leading edge of the wing, skinned to the wing bones), the plumage
# pattern (overlapping contour feathers for paint and fine detail), down for the babies, and skin weights made from
# the sculpt's own parts. Units are meters in game rig space (x left, y up, z forward, ground at y = 0).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, frame, fbm, vnoise, worley, length, _hash, axis_steps


# ---------- small helpers ----------
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
    """like local for a function returning n arrays"""
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


def lin(C):
    return np.where(C <= 0.04045, C / 12.92, ((C + 0.055) / 1.055) ** 2.4)


def srgb(L):
    return np.where(L <= 0.0031308, L * 12.92, 1.055 * np.power(np.maximum(L, 0), 1 / 2.4) - 0.055)


def flat_cone(Q, a, b, ra, rb, squash, up=(0, 1, 0)):
    """round cone from a to b with its cross-section squashed across 'up' (squash < 1: thinner along up)"""
    ax = nrm(np.asarray(b, F) - np.asarray(a, F))
    L = frame(Q, np.asarray(a, F), ax, up)
    L[:, 1] /= squash
    ln = float(np.linalg.norm(np.asarray(b, F) - np.asarray(a, F)))
    return round_cone(L, V(0, 0, 0), V(0, 0, ln), ra, rb) * squash


# ---------- legs and feet ----------
def _dir(a, pitch=0.0):
    a = np.radians(a)
    return np.array([np.sin(a), 0.0, np.cos(a)], F)


def toes(Q, foot, defs, ground=0.0):
    """toes fanning from a foot point. defs: dicts with a (deg from +z toward +x), len, r (root radius), r1 (tip),
    claw (length), lift (tip height, hind toes), n (phalanges). Returns toe and claw distances and the toe tips."""
    dt, dc, tips = None, None, []
    for t in defs:
        dv = _dir(t['a'])
        r0, r1 = t['r'], t.get('r1', t['r'] * 0.62)
        n = t.get('n', 3)
        lift = t.get('lift', 0.0)
        pts, rad = [], []
        for i in range(n + 1):
            f = i / n
            p = foot + dv * t['len'] * f
            # rest on the ground: centers at their radius, a gentle knuckle arch, hind toes lifted
            r = r0 + (r1 - r0) * f
            y = ground + r + lift * f + (foot[1] - ground - r0) * (1 - f) ** 3 + 0.18 * r0 * np.sin(np.pi * f) ** 2
            pts.append(V(p[0], y, p[2])); rad.append(r)
        d = chain(Q, pts, rad, r0 * 0.4)
        # knuckle pads under each joint
        for i in range(1, n):
            d = smin(d, ellipsoid(Q, pts[i] + V(0, -rad[i] * 0.25, 0), V(rad[i] * 1.12, rad[i] * 0.9, rad[i] * 1.2)), r0 * 0.3)
        tip = pts[-1]
        tips.append((tip, dv, rad[-1]))
        if t.get('claw'):
            L = t['claw']
            cr = t.get('clawR', rad[-1] * 0.85)
            c0 = tip + dv * rad[-1] * 0.2 + V(0, rad[-1] * 0.15, 0)
            c1 = c0 + dv * L * 0.55 + V(0, L * 0.02 - t.get('clawDrop', 0.15) * L, 0)
            c2 = c0 + dv * L + V(0, -t.get('clawDrop', 0.15) * L * 3.2, 0)
            c2[1] = max(c2[1], ground + 0.0003)
            cd = chain(Q, [c0, c1, c2], [cr, cr * 0.62, cr * 0.12], 0.0004)
            dc = cd if dc is None else np.minimum(dc, cd)
        dt = d if dt is None else np.minimum(dt, d)
    if dc is None:
        dc = np.full(len(Q), 1.0, F)
    return dt, dc, tips


def web(Q, foot, defs, thick, reach=0.92, sag=0.22, ground=0.0):
    """webbing between neighbouring front toes (sorted by angle): a thin sheet near the ground out to a concave margin"""
    fr = sorted([t for t in defs if not t.get('hind')], key=lambda t: t['a'])
    D = Q - foot
    rho = np.hypot(D[:, 0], D[:, 2])
    th = np.degrees(np.arctan2(D[:, 0], D[:, 2]))
    out = np.full(len(Q), 1.0, F)
    for i in range(len(fr) - 1):
        a0, L0 = fr[i]['a'], fr[i]['len'] * reach
        a1, L1 = fr[i + 1]['a'], fr[i + 1]['len'] * reach
        s = (th - a0) / (a1 - a0)
        R = (L0 + (L1 - L0) * sat(s)) * (1 - sag * np.sin(np.pi * sat(s)))
        dp = rho - R
        da = np.maximum(-s, s - 1) * np.maximum(rho, 0.002) * np.radians(a1 - a0)
        # the web lies on the toes' upper half, dipping a little between them
        yw = ground + fr[i]['r'] * 1.15 - 0.25 * fr[i]['r'] * np.sin(np.pi * sat(s)) + (foot[1] - ground) * sat(1 - rho / 0.02) ** 2 * 0.6
        dy = np.abs(Q[:, 1] - yw) - thick * 0.5
        w = np.maximum(np.maximum(dp, da), dy)
        out = np.minimum(out, w)
    return out


# ---------- the wing arm ----------
def wing_arm(Q, pts, chord, thick, lead=0.6):
    """leading edge of the spread wing (rest pose: span along +x). pts: shoulder, elbow, wrist, tip on the bone
    line; chord and thick (full sizes per point). The section is a flattened ellipse whose front sits 'lead' of the
    chord ahead of the bone line, so the feather bases tuck under its back edge."""
    d = None
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]
        ca, cb = chord[i] * 0.5, chord[i + 1] * 0.5
        ta, tb = thick[i] * 0.5, thick[i + 1] * 0.5
        off_a = V(0, 0, (lead - 0.5) * chord[i]); off_b = V(0, 0, (lead - 0.5) * chord[i + 1])
        # anisotropic: squash z by the thickness / chord ratio, so a round cone becomes a flat lens
        k = 0.5 * (ta / ca + tb / cb)
        S = V(1, 1, k)
        Qs = Q * S
        di = round_cone(Qs, (a + off_a) * S, (b + off_b) * S, ta, tb)
        d = di if d is None else smin(d, di, 0.004)
    return d


# ---------- plumage ----------
# Contour feathers lie like shingles: every feather points down the feather flow and its tip covers the base of the
# feathers behind it. On a 3D jittered grid of feather tips (one per cell), a surface point is covered by the
# feathers whose outline (projected onto its tangent plane) contains it; the visible one is the front-most, the one
# whose tip lies closest downstream. Feather size changes over the body (tiny on the head, big on the flanks and
# back), so the pattern is made at a few discrete sizes and each feather exists in one of them by chance in
# proportion to the size wanted there (the two sizes mix feather by feather where they meet).
SCALES = (0.0025, 0.004, 0.0065, 0.010, 0.015, 0.022, 0.032, 0.045)


def _layer_w(size, c):
    """weight of the layer of size c for a wanted feather size (log space hat between the neighbouring layers)"""
    i = SCALES.index(c)
    ls = np.log(np.maximum(size, 1e-6))
    lc = np.log(c)
    lo = np.log(SCALES[i - 1]) if i > 0 else lc - 1
    hi = np.log(SCALES[i + 1]) if i + 1 < len(SCALES) else lc + 1
    w = np.where(ls < lc, (ls - lo) / (lc - lo), (hi - ls) / (hi - lc))
    if i == 0:
        w = np.where(ls < lc, 1.0, w)
    if i == len(SCALES) - 1:
        w = np.where(ls > lc, 1.0, w)
    return np.clip(w, 0, 1).astype(F)


def plumage(P, N, flow, size, shape=None, seed=0):
    """feather pattern on surface points P (normals N, unit flow directions, wanted feather spacing in meters).
    shape(P) -> (width factor, tip roundness 0 pointed .. 1 round, length factor) per point, optional.
    Returns a dict of per-point arrays: a (along the flow from the visible feather's tip, <= 0), b (across, signed),
    w (its half width), r (tip radius), c (its size class), e (distance inside its outline from the tip edge, m),
    id (0..1 per feather), cov (1 where a feather was found)."""
    n = len(P)
    out = {k: np.zeros(n, F) for k in ('a', 'b', 'w', 'r', 'c', 'e', 'id', 'cov', 'len')}
    out['a'][:] = -1.0
    side = np.cross(N, flow)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
    fl = np.cross(side, N)
    wf, rf, lf = shape(P) if shape is not None else (np.ones(n, F), np.ones(n, F), np.ones(n, F))
    best = np.full(n, -9.0, F)
    for li, c in enumerate(SCALES):
        lw = _layer_w(size, c)
        on = lw > 0.002
        if not on.any():
            continue
        ix = np.where(on)[0]
        Q, Fl, Sd, Nq, W = P[ix], fl[ix], side[ix], N[ix], lw[ix]
        G = np.floor(Q / c).astype(np.int64)
        bq = best[ix]
        res = {k: out[k][ix].copy() for k in out}
        for dz in (-1, 0, 1):
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    cc = G + np.array([dx, dy, dz])
                    s = seed * 31 + li * 7
                    h0, h1, h2, h3, h4 = (_hash(cc[:, 0], cc[:, 1], cc[:, 2], s + k) for k in range(5))
                    T = (cc + np.stack([h0, h1, h2], 1)) * c
                    live = h3 < W
                    D = Q - T
                    dn = (D * Nq).sum(1)
                    live &= np.abs(dn) < c * 0.75
                    a = (D * Fl).sum(1)
                    b = (D * Sd).sum(1)
                    w = c * 0.62 * (0.85 + 0.3 * h4) * wf[ix]
                    r = np.maximum(w * (0.25 + 0.75 * rf[ix]), 1e-6)
                    L = c * 2.6 * lf[ix]
                    # outline: a strip of half width w, closed by an elliptic tip of length r
                    tipz = a > -r
                    q = np.where(tipz, np.sqrt((b / w) ** 2 + ((a + r) / r) ** 2), np.abs(b) / w)
                    inside = live & (q < 1) & (a > -L) & (a <= 0)
                    better = inside & (a > bq)
                    if better.any():
                        e = np.where(tipz, (1 - q) * np.minimum(w, r), (1 - q) * w)
                        e = np.minimum(e, np.where(tipz, 9.0, -a - r + (1 - q) * w))
                        bq = np.where(better, a, bq)
                        for k, v in (('a', a), ('b', b), ('w', w), ('r', r), ('e', e), ('id', h4 * 0.5 + h0 * 0.5), ('len', L)):
                            res[k] = np.where(better, v, res[k])
                        res['c'] = np.where(better, c, res['c'])
                        res['cov'] = np.where(better, 1.0, res['cov'])
        best[ix] = bq
        for k in out:
            out[k][ix] = res[k]
    return out


def feather_height(pl, k=0.07):
    """height (m) of the overlapping feathers: each visible feather rises a little toward its tip and drops at the
    tip edge onto the feathers behind; the vanes curve down a little to the sides"""
    c = np.maximum(pl['c'], 1e-4)
    L = np.maximum(pl['len'], 1e-4)
    rise = sat(1 + pl['a'] / (0.9 * c))
    edge = sstep(0.0, 0.3 * c, pl['e'])
    h = k * c * (0.35 + 0.65 * rise) * edge
    h -= 0.02 * c * (pl['b'] / np.maximum(pl['w'], 1e-6)) ** 2
    return h * pl['cov']


def down(P, flow, N, cell=0.0016, seed=0):
    """baby down: soft wisps leaning along the flow; returns (height-like 0..1, tip brightness 0..1)"""
    side = np.cross(N, flow)
    side /= np.maximum(np.linalg.norm(side, axis=1, keepdims=True), 1e-9)
    fl = np.cross(side, N)
    # stretched noise along the flow: strands
    a = (P * fl).sum(1)
    s = (P * side).sum(1)
    n1 = fbm(np.stack([s / cell * 1.6, a / cell * 0.35, (P * N).sum(1) / cell], 1), 3, seed)
    n2 = vnoise(np.stack([s / cell * 4.0, a / cell * 0.8, P[:, 1] / cell], 1), seed + 5)
    clump = fbm(P / (cell * 6), 2, seed + 9)
    h = sat(0.55 * n1 + 0.3 * n2 + 0.35 * clump - 0.1)
    tip = sstep(0.55, 0.85, h)
    return h.astype(F), tip.astype(F)


def onto(P, N, sdf, iters=10, step=0.012, maxd=0.06):
    """move points along their normals onto the zero level of sdf (offsets, meters; damped steps, capped length)"""
    Q = P.copy()
    for _ in range(iters):
        Q = Q - N * np.clip(sdf(Q), -step, step)[:, None]
    d = Q - P
    # where the normal runs at a slant to the surface (creases, the inner faces of wattles) the walk along it goes
    # far or misses: take the nearest point on the surface instead (steps down the field's gradient)
    s0 = np.abs(sdf(P))
    bad = (np.linalg.norm(d, axis=1) > 2.0 * s0 + 0.004) | (np.abs(sdf(Q)) > 0.002)
    if bad.any():
        Pb = P[bad].copy()
        e = 0.0008
        for _ in range(5):
            g = np.stack([sdf(Pb + V(*o)) - sdf(Pb - V(*o)) for o in ((e, 0, 0), (0, e, 0), (0, 0, e))], 1)
            g /= np.maximum(np.linalg.norm(g, axis=1, keepdims=True), 1e-9)
            Pb = Pb - g * sdf(Pb)[:, None]
        d[bad] = Pb - P[bad]
    ln = np.linalg.norm(d, axis=1, keepdims=True)
    return d * np.minimum(1, maxd / np.maximum(ln, 1e-9))


def shrink_to_axis(P, a, b, rt):
    """offsets that pull points radially toward the segment a-b until they lie rt from it (a thinner limb)"""
    t, _ = seg_t(P, a, b)
    C = a + (b - a) * t[:, None]
    r = P - C
    ln = np.linalg.norm(r, axis=1, keepdims=True)
    return -r * np.clip(1 - rt / np.maximum(ln, 1e-9), 0, 1)


def baby_shape(P, N, R, body_sdf, leg, shoulder, fluff, maxd=0.06, extra=None):
    """per vertex offsets (adult space) that turn the adult into the baby before the game's proportion maps: body and
    neck onto body_sdf (an egg of down), the wing arm folded away into the shoulder, the drumsticks thinned to the
    downy legs (leg = (a, b, radius, the game's baby leg width factor)), uneven puffs of down (fluff = (amp, cell)),
    and the species' own extra(Q, Nm, R) offsets (mirrored space: a swan's knob, an owl's ear tufts)"""
    Q = mirror(P)
    Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.sign(P[:, 0] + 1e-9)
    body = np.clip(R['trunk'] + R.get('neck', 0), 0, 1)
    d = onto(Q, Nm, body_sdf, maxd=maxd) * body[:, None]
    if extra is not None:
        d += extra(Q, Nm, R)
    d += (shoulder - Q) * R['arm'][:, None]
    d += shrink_to_axis(Q, leg[0], leg[1], leg[2]) * (R['drum'] / leg[3])[:, None]
    fl = np.clip(body + R['head'] * 0.5, 0, 1)
    d += fluff_offset(Q, Nm, fluff[0], fluff[1], 5) * fl[:, None]
    d[:, 0] *= np.sign(P[:, 0] + 1e-9)
    return d


def fluff_offset(P, N, amp, cell, seed=0):
    """uneven puffs of down along the normals (silhouette fuzz for the babies)"""
    n = fbm(P / cell, 2, seed) - 0.45
    return N * (amp * n)[:, None]


# ---------- scales on legs and toes ----------
def scutes(P, axis, cell, seed=0):
    """overlapping transverse plates along an axis (front of the tarsus, top of the toes): ridge at each plate's
    lower edge. Returns (height 0..1, groove 0..1)"""
    t = (P @ axis) / cell + 0.25 * fbm(P / (cell * 2), 2, seed)
    f = t - np.floor(t)
    h = f ** 1.5
    g = sstep(0.12, 0.0, f) + sstep(0.9, 1.0, f)
    return h.astype(F), g.astype(F)


def reticulate(P, cell, seed=0):
    """small round scales (back of the tarsus, soles): cells with grooves between them"""
    f1, f2 = worley(P / cell, seed)
    h = sat(1 - f1 / 0.75) ** 0.7
    g = sstep(0.12, 0.0, f2 - f1)
    return h.astype(F), g.astype(F)


# ---------- skin weights ----------
def part_weights(W, wpos, names, c, cfg):
    """skin weights from the sculpt's own parts. cfg: groups [(name, [part keys])] for body, head, drum, tarsus, foot,
    arm (and extra groups bound to one bone: (name, keys, bone)); spine (bone names), spine_u(Q) (coordinate along
    the spine for body points), head_u; y ranges: knee (thigh above it), hipb (drumstick top into the belly), ankle_d
    (drumstick bottom to the tarsus), ankle (tarsus top to the shin), pad (tarsus bottom to the toes), toe_up (toes
    into the tarsus); arm: shoulder, elbow, wrist, tip points and the root blend (x from, to)."""
    bi = {n: i for i, n in enumerate(names)}
    Wn = np.zeros_like(W)
    P = wpos.astype(F)
    side = np.where(P[:, 0] >= 0, 'L', 'R')
    Q = mirror(P)
    gnames = [g[0] for g in cfg['groups']]
    D = np.stack([np.minimum.reduce([c[k] for k in g[1]]) if len(g[1]) > 1 else c[g[1][0]] for g in cfg['groups']], 1)
    bias = np.array([cfg.get('bias', {}).get(n, 0.0) for n in gnames], F)
    own = np.argmin(D + bias, 1)
    y = P[:, 1]
    G = {n: own == i for i, n in enumerate(gnames)}

    def put(mask, bone, w):
        w = np.maximum(w, 0)
        if bone in bi:
            Wn[mask, bi[bone]] += w[mask]
            return
        for s in 'LR':
            m = mask & (side == s)
            Wn[m, bi[bone + s]] += w[m]

    body = G['body'] | G['head']
    u = cfg['spine_u'](Q)
    u = np.where(G['head'], np.maximum(u, cfg.get('head_u', len(cfg['spine']) - 0.65)), u)
    for nm, w in blend_chain(u, cfg['spine'], cfg.get('beta', 0.3)):
        put(body, nm, w)
    for g in cfg['groups']:
        if len(g) > 2:
            put(G[g[0]], g[2], np.ones(len(P), F))
    m = G['drum']
    th = sstep(*cfg['knee'], y)
    hp = sstep(*cfg['hipb'][:2], y) * cfg['hipb'][2]
    an = 0.5 * sstep(*cfg['ankle_d'], y)
    put(m, 'shin', (1 - th) * (1 - an)); put(m, 'thigh', th * (1 - hp)); put(m, 'hips', th * hp); put(m, 'hmeta', (1 - th) * an)
    m = G['tarsus']
    k0 = 0.5 * sstep(*cfg['ankle'], y)
    k1 = 0.5 * sstep(*cfg['pad'], y)
    put(m, 'hmeta', 1 - k0 - k1); put(m, 'shin', k0); put(m, 'hpaw', k1)
    m = G['foot']
    k = 0.4 * sstep(*cfg['toe_up'], y)
    put(m, 'hpaw', 1 - k); put(m, 'hmeta', k)
    if 'arm' in G:
        m = G['arm']
        sh, el, wr, wt = cfg['arm']
        x = Q[:, 0]
        ua = np.interp(x, [sh[0], el[0], wr[0], wt[0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
        rootb = sstep(*cfg['arm_root'], x) * 0.7
        for nm, w in blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
            put(m, nm, w * (1 - rootb))
        put(m, 'hips', rootb)
    Wn[:, bi['ctag']] = 0
    s = Wn.sum(1, keepdims=True)
    return np.where(s > 0, Wn / np.maximum(s, 1e-9), W)


def blend_chain(u, bones, beta):
    """weights over a chain of bones from a continuous coordinate u (bone i owns u in [i, i + 1]), blended over
    +-beta at each boundary. Returns a list of (bone, weight array)."""
    out = []
    nb = len(bones)
    for j, nm in enumerate(bones):
        lo = sstep(j - beta, j + beta, u) if j > 0 else np.ones_like(u)
        hi = sstep(j + 1 + beta, j + 1 - beta, u) if j < nb - 1 else np.ones_like(u)
        out.append((nm, lo * hi))
    return out


def seg_t(P, a, b):
    ab = b - a
    t = ((P - a) @ ab) / float(ab @ ab)
    return np.clip(t, 0, 1), t


def finish_ao(C, ao, floor=0.3):
    """fold ambient occlusion into the color (linear light)"""
    L = lin(C) * (floor + (1 - floor) * ao[..., None])
    return srgb(L)


# ---------- feather blade atlas ----------
# The game's feather blades (wings, tails) map one atlas cell each: u across the blade (0..1), v along it (root to
# tip). The atlas holds a real feather per cell: its outline in the alpha channel (the blade is cut to it), the vane
# colors, the shaft, the barbs and a few splits, and a normal map (shaft ridge, convex vane, barb grooves).
class FeatherCell:
    def __init__(self, kind, color, w=0.42, outer=0.8, tip=0.4, shaft=None, notch=0.0, gloss=0):
        self.kind, self.color, self.w, self.outer, self.tip, self.shaft, self.notch, self.gloss = kind, color, w, outer, tip, shaft, notch, gloss


NCOL = 8          # cells across the atlas (the game's FNC)
CELL_M = 0.004    # the game's cell margin (fraction of the atlas width)


def _dilate(rgb, valid, n):
    rgb = rgb.copy(); v = valid.copy()
    for _ in range(n):
        acc = np.zeros_like(rgb); cnt = np.zeros(v.shape, F)
        for dy, dx in ((0, 1), (0, -1), (1, 0), (-1, 0)):
            sv = np.roll(np.roll(v, dy, 0), dx, 1)
            acc += np.roll(np.roll(rgb, dy, 0), dx, 1) * sv[..., None]; cnt += sv
        new = (~v) & (cnt > 0)
        rgb[new] = acc[new] / cnt[new][:, None]
        v = v | new
        if v.all():
            break
    rgb[~v] = rgb[v].mean(0) if v.any() else 0.5
    return rgb


def feather_atlas(cells, W, H, seed=0):
    """paint the atlas: returns rgba (H, W, 4) and normal (H, W, 3), both 0..1, row 0 = feather roots"""
    cw = W // NCOL
    yy, xx = np.mgrid[0:H, 0:W].astype(F)
    k = (xx // cw).astype(int)
    xc = xx - k * cw + 0.5
    half = cw * 0.5 - CELL_M * W
    s = (xc - cw * 0.5) / half                   # -1..1 across the blade (+ = outer vane)
    t = (yy + 0.5) / H                            # 0 root .. 1 tip
    rgb = np.zeros((H, W, 3), F); alpha = np.zeros((H, W), F); hgt = np.zeros((H, W), F)
    for ci, cell in enumerate(cells):
        if cell is None:
            continue
        m = k == ci
        S, T = s[m], t[m]
        X, Y = xc[m], yy[m]
        n = len(S)
        hs = _hash(np.floor(Y).astype(np.int64), np.full(n, ci, np.int64), np.zeros(n, np.int64), seed)
        if cell.kind == 'down':
            # a soft round puff of down: wisps radiating from its root, a ragged outline
            cy = (T - 0.42) / 0.55
            r = np.sqrt(S * S + cy * cy)
            th = np.arctan2(S, cy + 0.9)
            strand = fbm(np.stack([th * 9, r * 2.5, np.full(n, ci, F)], 1), 3, seed + ci)
            wisp = vnoise(np.stack([th * 40, r * 6, np.full(n, ci * 3.0, F)], 1), seed + 7 + ci)
            edge = 0.78 + 0.22 * strand
            env = sstep(edge, edge - 0.3, r) * sstep(0.0, 0.06, T)
            a = sat(env * (0.7 + 0.5 * wisp) - 0.15 * (1 - env))
            col = cell.color(S, T, np.sign(S))
            col = col * (0.82 + 0.3 * wisp)[:, None]
            rgb[m] = col; alpha[m] = sstep(0.25, 0.6, a); hgt[m] = a * 2
            continue
        # vane half width along the feather (fraction of the blade half width), per side
        w = np.full(n, cell.w, F) * (1 - 0.12 * T)
        side_w = np.where(S > 0, w * cell.outer, w)
        grow = sstep(0.04, 0.2, T)
        tipz = cell.tip
        if cell.kind == 'flight':
            # long pointed tip, the narrow outer vane tapering first
            tp = sat((T - (1 - tipz)) / tipz)
            side_w = side_w * np.sqrt(np.maximum(0, 1 - tp ** np.where(S > 0, 1.6, 2.4)))
        elif cell.kind == 'curl':
            tp = sat((T - 0.4) / 0.6)
            side_w = side_w * (1 - tp ** 1.5) + 0.04
        else:
            # rounded tip (an ellipse over the last part of the vane)
            tp = sat((T - (1 - tipz * 0.5)) / (tipz * 0.5))
            side_w = side_w * np.sqrt(np.maximum(0, 1 - tp ** 2))
        if cell.notch:
            side_w = side_w * (1 - 0.35 * sstep(0.08, 0.0, np.abs(T - (1 - cell.notch))) * (S < 0))
        side_w = side_w * (0.25 + 0.75 * grow)
        # barbs: lines leaving the shaft toward the tip; ragged ends and a few splits
        bq = (Y - np.abs(X - cw * 0.5) * 1.3) / 3.1
        bi = np.floor(bq).astype(np.int64)
        bh = _hash(bi, np.full(n, ci, np.int64), (S > 0).astype(np.int64), seed + 3)
        edge = side_w * (1 + 0.05 * (bh - 0.5)) - 0.012 * np.abs(np.sin(bq * np.pi))
        inside = np.abs(S) < edge
        split = (bh < 0.07) & (np.abs(S) > edge * (0.35 + 0.5 * _hash(bi, np.full(n, ci, np.int64), np.ones(n, np.int64), seed + 4)))
        split &= np.abs(bq - bi - 0.5) < 0.22
        downy = sstep(0.24, 0.1, T)
        fuzz = vnoise(np.stack([X * 0.7, Y * 0.25, np.full(n, ci, F)], 1), seed + 5)
        a = inside & ~split & ((downy < 0.5) | (fuzz > downy * 0.8))
        sw = (2.6 * (1 - T) + 0.7) / half
        shaft = np.abs(S) < sw
        a |= shaft & (T > 0.005)
        col = cell.color(S, T, np.sign(S))
        col = mix(col, np.minimum(col * 1.25 + 0.08, 1), downy * 0.6)
        bar = np.sin(bq * 2 * np.pi)
        col = col * (0.94 + 0.06 * bar + 0.04 * (fuzz - 0.5))[:, None]
        if cell.shaft is not None:
            col = mix(col, cell.shaft, shaft.astype(F) * sstep(0.98, 0.85, T))
        rgb[m] = col
        alpha[m] = a.astype(F)
        # height (pixel units): shaft ridge, convex vane, barb grooves
        hgt[m] = shaft * 2.2 + (1 - (S / np.maximum(side_w, 1e-3)) ** 2) * 2.0 * inside - 0.35 * sstep(0.5, 1.0, bar) * inside
    gy, gx = np.gradient(hgt)
    nrmv = np.stack([-gx * 0.6, gy * 0.6, np.ones_like(gx)], -1)
    nrmv /= np.linalg.norm(nrmv, axis=-1, keepdims=True)
    valid = alpha > 0.5
    rgb = _dilate(rgb, valid, 6)
    nm = _dilate(nrmv * 0.5 + 0.5, valid, 6)
    return np.concatenate([rgb, alpha[..., None]], -1), nm


def save_atlas(S, work):
    """write <id>-feather.png (rgba), <id>-feathernrm.png and <id>-babyfeather.png from the species' cells"""
    from PIL import Image
    fa = S.FEATHER_ATLAS
    W, H = fa['size']
    img = lambda a: Image.fromarray(np.clip(a * 255 + 0.5, 0, 255).astype(np.uint8))
    rgba, nm = feather_atlas(fa['cells'](), W, H, seed=5)
    img(rgba).save(f'{work}/{S.ID}-feather.png')
    img(nm).save(f'{work}/{S.ID}-feathernrm.png')
    if fa.get('baby'):
        rgba_b, _ = feather_atlas(fa['baby'](), W // 2, H // 2, seed=6)
        img(rgba_b).save(f'{work}/{S.ID}-babyfeather.png')


# ---------- baby maps and the feather atlas (texture step hook) ----------
def extra_maps(S, X):
    """texture.py hook: the baby color and normal maps (down instead of feathers) from paint_baby / detail_baby, on the
    same UV layout, and the feather atlas"""
    import time
    from PIL import Image
    t0 = time.time()
    R, valid, Gu, Gv, Tu, Tv, Nl, Nh = X['R'], X['valid'], X['Gu'], X['Gv'], X['Tu'], X['Tv'], X['Nl'], X['Nh']
    col, rough = S.paint_baby(X['Ph'], Nh, X['comps'])
    h = S.detail_baby(X['Ph'], Nh, X['comps'])
    mapn = encode_normals(h, R, valid, Gu, Gv, Tu, Tv, Nl, Nh)
    pad, down2 = X['pad'], X['down2']
    def img(vals, ch):
        a = np.zeros((R, R, ch), F); a[valid] = vals.reshape(-1, ch); return a
    C = down2(pad(img(col, 3), valid, 24))
    Nn = down2(pad(img(mapn.astype(F), 3), valid, 24))
    Nn /= np.linalg.norm(Nn, axis=2, keepdims=True)
    C = S.finish(C, X['ao'], X['v2'])
    size = S.BABY_MAPS['size']
    out = lambda a: Image.fromarray(np.clip(a[::-1] * 255 + 0.5, 0, 255).astype(np.uint8))
    c_im, n_im = out(C), out(Nn * 0.5 + 0.5)
    if size != c_im.size[0]:
        c_im = c_im.resize((size, size), Image.LANCZOS); n_im = n_im.resize((size, size), Image.LANCZOS)
    c_im.save(f"{X['work']}/{S.ID}-babycolor.png")
    n_im.save(f"{X['work']}/{S.ID}-babynrm.png")
    print(f'baby maps ({time.time() - t0:.0f}s)')
    if hasattr(S, 'FEATHER_ATLAS'):
        save_atlas(S, X['work'])
        print(f'feather atlas ({time.time() - t0:.0f}s)')


def encode_normals(h, R, valid, Gu, Gv, Tu, Tv, Nl, Nh):
    """height field (per valid texel) to the normal map encoding texture.py uses (three.js cotangent frame)"""
    H = np.zeros((R, R), F); H[valid] = h
    def dd(axis):
        p = np.roll(H, -1, axis); m = np.roll(H, 1, axis)
        vp = np.roll(valid, -1, axis); vm = np.roll(valid, 1, axis)
        g = np.where(vp & vm, (p - m) * 0.5, np.where(vp, p - H, np.where(vm, H - m, 0)))
        return g[valid] * R
    grad = dd(1)[:, None] * Gu + dd(0)[:, None] * Gv
    n = Nh - grad
    n /= np.linalg.norm(n, axis=1, keepdims=True)
    s = 1.0 / np.sqrt(np.maximum((Tu * Tu).sum(1), (Tv * Tv).sum(1)))[:, None]
    M = np.stack([Tu * s, Tv * s, Nl], 2)
    mapn = np.linalg.solve(M.astype(np.float64), n.astype(np.float64)[..., None])[..., 0]
    mapn /= np.linalg.norm(mapn, axis=1, keepdims=True)
    mapn[:, 2] = np.maximum(mapn[:, 2], 0.05)
    mapn /= np.linalg.norm(mapn, axis=1, keepdims=True)
    return mapn


def export_extra(S, meta, out_dir, work):
    """export.py hook: baby maps and feather atlases as WebP next to the model, named in the json"""
    import os
    from PIL import Image
    q = getattr(S, 'BABY_MAPS', {}).get('quality', (82, 80))
    fa = getattr(S, 'FEATHER_ATLAS', {})
    fq = fa.get('quality', (86, 84, 80))
    # the atlases are painted large and written smaller (out = feather atlas size; the baby atlas is half of it)
    fo = fa.get('out')
    fb = (fo[0] // 2, fo[1] // 2) if fo else None
    srgb_keys = []
    for key, fn, mode, qual, size in (('babyColor', 'babycolor', 'RGB', q[0], None), ('babyNormal', 'babynrm', 'RGB', q[1], None),
                                      ('feather', 'feather', 'RGBA', fq[0], fo), ('featherNormal', 'feathernrm', 'RGB', fq[1], fo),
                                      ('babyFeather', 'babyfeather', 'RGBA', fq[2], fb)):
        src = os.path.join(work, f'{S.ID}-{fn}.png')
        if not os.path.exists(src):
            continue
        dst = f'{S.ID}-{fn}.webp'
        im = Image.open(src).convert(mode)
        if size and im.size != tuple(size):
            im = im.resize(tuple(size), Image.LANCZOS)
        im.save(os.path.join(out_dir, dst), 'WEBP', quality=qual, method=6, alpha_quality=fa.get('alpha_quality', 80))
        meta['maps'][key] = dst
        if key in ('babyColor', 'feather', 'babyFeather'):
            srgb_keys.append(key)
    meta['srgb'] = srgb_keys
    # (the baby's own shape change per vertex, baby_offset(), is packed with the mesh by export.py)
    # belly contact point under the hips from the body's midline only (the legs of a bird stand close to it)
    lo = np.load(os.path.join(work, f'{S.ID}-lo.npz'))
    pos = lo['pos']
    hz = meta['belly'][2]
    near = (np.abs(pos[:, 0]) < 0.012) & (np.abs(pos[:, 2] - hz) < 0.04)
    if near.any():
        meta['belly'][1] = round(float(pos[near, 1].min()), 4)
    if 'feather' in meta['maps']:
        meta['feathers'] = {'cols': NCOL}
