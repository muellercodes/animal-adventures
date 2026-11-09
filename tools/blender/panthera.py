# Big cats of the genus Panthera (round 11): the lion, the tiger and the leopard on the cat template (bigcat.py). A
# species file (lion.py, tiger.py, leopard.py) gives its tables in the house cat's units (body, neck, head, tail and
# their landmarks) and its options in a dict T; load(ID, T) runs cat.py with them and setup(C) installs the parts the
# three share:
# - a big cat's head: the house cat's loft with a longer, deeper muzzle (every muzzle part moved forward by T['MS'], as
#   the saber-toothed cat does), full cheeks, brows over smaller eyes with round pupils, a bigger nose leather, the
#   mouth lines and nostrils; small rounded ears
# - stout legs on big round paws, a short coat in the sculpt (a little noise for the lie of the coat)
# - the coat painter coat(): the ground colors (darker along the back, warmer low on the flanks, pale underneath), the
#   face (pale muzzle and chin, pale marks round the eyes, black lips and whisker spots, the nose), dark ear backs,
#   the tail tip, the coat strokes, plus the species' own pattern as a hook (T['pattern']: none for the lion,
#   stripes for the tiger, rosettes for the leopard), and the cub's coat (baby_coat())
# - long white whiskers on the longer muzzle, the cub's rounder body (the cat's egg walk)
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, fbm, worley, _hash
import carnivore as CV
from carnivore import mirror, mix, hexc, rnd
import bigcat


def stout(keys, lo, hi):
    """thicker legs: the sections scaled by lo at the foot up to hi at the top"""
    out = []
    for k in keys:
        f = lo + (hi - lo) * min(1.0, max(0.0, (k[0] - 0.02) / 0.18))
        out.append((k[0], k[1], k[2] * f, k[3] * f, k[4] * f) + tuple(k[5:]))
    return out


def locks(Q, amt, k=(40.0, 55.0, 34.0), seed=99):
    """the lie of the coat: a low noise of a few mm"""
    return amt * (fbm(Q * V(*k), 3, seed) - 0.5) * 2.0


def cells(P, seed):
    """jittered 3D grid (cell units): distance to the nearest point, its offset (point - P) and a random value per cell"""
    f = np.floor(P).astype(np.int64)
    best = np.full(len(P), 9.0, F)
    off = np.zeros((len(P), 3), F)
    rid = np.zeros(len(P), F)
    for dz in (-1, 0, 1):
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                cx, cy, cz = f[:, 0] + dx, f[:, 1] + dy, f[:, 2] + dz
                o = np.stack([cx + _hash(cx, cy, cz, seed) - P[:, 0], cy + _hash(cx, cy, cz, seed + 1) - P[:, 1],
                              cz + _hash(cx, cy, cz, seed + 2) - P[:, 2]], 1)
                d = np.linalg.norm(o, axis=1)
                m = d < best
                best = np.where(m, d, best)
                off[m] = o[m]
                rid = np.where(m, _hash(cx, cy, cz, seed + 3), rid)
    return best.astype(F), off, rid.astype(F)


class DropFrame(CV.Frame):
    """the head frame with the muzzle dropped: in front of s0 the local up coordinate is sheared by k (a smooth knee), so
    every muzzle part, paint mask and whisker that is placed in the head frame comes down with it (a big cat's muzzle
    slopes down from the eyes more than a house cat's)"""
    def __init__(self, o, a, u, k, s0, knee=0.012):
        super().__init__(o, a, u)
        self.k, self.s0, self.knee = k, s0, knee

    def _g(self, s):
        t = s - self.s0
        return 0.5 * (t + np.sqrt(t * t + self.knee * self.knee)) - 0.5 * self.knee

    def loc(self, Q):
        L = super().loc(Q)
        L[:, 1] = L[:, 1] + self.k * self._g(L[:, 2])
        return L

    def pt(self, s, u, x=0.0):
        return super().pt(s, u - self.k * float(self._g(np.float64(s))), x)


def load(ID, T):
    """cat.py in its own module with the species' tables (T: see lion.py)"""
    MS = lambda v: 0.054 + (v - 0.054) * T['MS']
    br = dict(
        ID=ID, TRUNK=T['TRUNK'], NECK=T['NECK'], HEAD=T['HEAD'], BOUNDS=T['BOUNDS'], TAIL=T['TAIL'], TB=T['TB'],
        TAIL_BONES=list(T['TB']), TAIL_TD=T['TAIL_TD'], EYE_AT=T['EYE_AT'], EYE_R=T['EYE_R'], LID_W=T['LID_W'], LID_H=T['LID_H'],
        SLANT=T['SLANT'], SINK=T.get('SINK', 0.42), NOSE_S=MS(0.096), MOUTH_AT=T['MOUTH_AT'], EAR_B=T['EAR_B'], EAR_A=T['EAR_A'],
        EAR_N=T['EAR_N'], EAR_L=T['EAR_L'], EAR_W=T['EAR_W'], BOX=T['BOX'])
    if T.get('HF') is not None or T.get('DROP'):
        hf = T.get('HF') or CV.Frame(V(0.0, 0.292, 0.178), V(0.0, -0.074, 1.0), V(0.0, 1.0, 0.0))
        if T.get('DROP'):
            hf = DropFrame(hf.o, hf.a, hf.u, *T['DROP'])
        br['HF'] = hf
    C = bigcat.load(br)
    C.T, C.MS = T, MS
    return C


def setup(C):
    """the parts the three big cats share, installed into the cat module C (its functions look them up there)"""
    T, MS = C.T, C.MS
    C.FORE, C.HIND = stout(C.FORE, *T['FORE_K']), stout(C.HIND, *T['HIND_K'])
    _trunk, _fleg, _hleg, _tail, _regions0 = C.trunk, C.fleg, C.hleg, C.tail, C._regions
    _keep, _bone_tips = C.keep, C.bone_tips

    def trunk(P):
        Q = mirror(P)
        d = _trunk(P)
        # the shoulder blades and the muscle over them (big cats walk with them rolling over the back)
        sh = T.get('SHOULDER')
        if sh:
            d = smin(d, round_cone(Q, V(*sh[0]), V(*sh[1]), sh[2], sh[3]), 0.025)
        return d - T['COAT'] - locks(Q, T['LOCKS'])

    def neck(P):
        Q = mirror(P)
        d = C.sweep(Q, C.NECK) - T['COAT']
        for c, r, k in T['THROAT']:
            d = smin(d, ellipsoid(Q, V(*c), V(*r)), k)
        return d

    def head(P):
        Q = mirror(P)
        L = C.HF.loc(Q)
        d = C.loft(L, C.HEAD)
        ck = T['CHEEK']
        d = smin(d, ellipsoid(L, V(*ck[0]), V(*ck[1])), 0.012)
        # brows: a ridge over each eye, the stop between them
        b = T['BROW']
        d = smin(d, round_cone(L, V(0.007, b, 0.06), V(0.021, b - 0.0015, 0.062), 0.0045, 0.004), 0.006)
        # whisker pads and chin, the nose leather on top
        ns = C.NOSE_S
        d = smin(d, ellipsoid(L, V(T.get('PAD_X', 0.0105), -0.0165, MS(0.084)), V(*T['PADS'])), 0.005)
        d = smin(d, ellipsoid(L, V(0.0, -0.029, MS(0.08)), V(*T['CHIN'])), 0.004)
        if T.get('BRIDGE'):
            # a broad flat bridge down the top of the muzzle
            w = T['BRIDGE']
            d = smin(d, round_cone(L, V(0.0, 0.009 - w, 0.064), V(0.0, -0.001 - w, ns - 0.006), w, w * 0.85), 0.008)
        NL = L - V(0.0, -0.0052, ns - 0.0024)
        NL[:, 0] = NL[:, 0] / (1.0 + 70.0 * np.clip(NL[:, 1], -0.005, 0.005))
        d = smin(d, ellipsoid(NL, V(0.0, 0.0, 0.0), V(*T['NOSE'])), 0.003)
        # the mouth lines and the nostrils
        m = mouth_line(C, L)
        d = smax(d, -(m + 0.0002) / 2.0, 0.0005)
        d = smax(d, -ellipsoid(L, V(0.0036, -0.0046, ns + 0.0029), V(0.0014, 0.001, 0.0015)), 0.0005)
        if T.get('RUFF'):
            d = smin(d, T['RUFF'](C, L), 0.008)
        return d

    def ear(P):
        Q = mirror(P)
        return CV.ear(Q, C.EAR_B, C.EAR_A, C.EAR_N, C.EAR_L, C.EAR_W, 'round', th0=0.0042, th1=0.0024, cup=0.8, tipin=0.0,
                      base_r=(0.008, 0.006, 0.005))

    def fleg(P):
        Q = mirror(P)
        d = _fleg(P) - T['COAT'] * 0.75
        for a, b, r1, r2, kx, k in T.get('FLEG_X', []):
            d = smin(d, C.flat_cone(Q, V(*a), V(*b), r1, r2, kx), k)
        return d

    def hleg(P):
        # the thigh tops cut off under the line of the back (the house cat's stood up over the hips)
        return smax(_hleg(P) - T['COAT'] * 0.75, mirror(P)[:, 1] - T['HIP_CUT'], 0.012)

    def paws(P):
        """big round paws, the claws drawn in"""
        Q = mirror(P)
        a, _ = CV.paw(Q, C.PAW_F, T['F_TOES'], pad=T['F_PAD'], claw=None, yaw=0.06)
        b, _ = CV.paw(Q, C.PAW_H, T['H_TOES'], pad=T['H_PAD'], claw=None, yaw=0.04)
        return np.minimum(a, b) - 0.001, np.full(len(P), 1.0, F)

    def tail(P):
        return _tail(P) - locks(mirror(P), T['LOCKS'])

    C.trunk, C.neck, C.head, C.ear, C.fleg, C.hleg, C.paws, C.tail = trunk, neck, head, ear, fleg, hleg, paws, tail
    # fine sculpt boxes: eyes, the longer muzzle, ears, paws
    HF = C.HF
    mz0 = HF.pt(0.064, 0.0) * V(0, 1, 1) + V(0.0, -0.05, -0.004)
    mz1 = HF.pt(C.NOSE_S + 0.006, 0.0) * V(0, 1, 1) + V(0.032, 0.012, 0.004)
    C.PATCHES = [C.PATCHES[0], (mz0, mz1, 0.0003), C.PATCHES[2]] + T['PAW_PATCHES']

    def bone_tips(P):
        tl, names = T['TAIL'], list(T['TB'])
        end = V(0, tl[-1][0], tl[-1][1])
        Q = dict(P)
        for b in ('tail2', 'tail3'):
            Q.setdefault(b, end)
        t = _bone_tips(Q)
        for b in ('tail1', 'tail2', 'tail3', 'tail4'):
            t.pop(b, None)
        for i, b in enumerate(names):
            t[b] = P[names[i + 1]] if i + 1 < len(names) else end
        return t
    C.bone_tips = bone_tips

    def regions(P, N, c):
        """the cat's paint regions with the big cat's nose, lips and philtrum"""
        r = _regions0(P, N, c)
        L = r['L']
        ns = C.NOSE_S
        NL = L - V(0.0, -0.0052, ns - 0.0024)
        NL[:, 0] = NL[:, 0] / (1.0 + 70.0 * np.clip(NL[:, 1], -0.005, 0.005))
        nr = V(*T['NOSE']) + V(0.0006, 0.0005, 0.0)
        r['nose'] = sstep(0.0006, -0.0002, ellipsoid(NL, V(0.0, 0.0, 0.0), nr)) * sstep(ns - 0.008, ns - 0.0035, L[:, 2])
        m = mouth_line(C, L)
        r['lip'] = sstep(0.0016, 0.0005, m) * sstep(-0.012, -0.016, L[:, 1]) * r['head']
        r['phil'] = sstep(0.001, 0.0004, np.abs(L[:, 0])) * sstep(-0.0095, -0.012, L[:, 1]) * sstep(-0.025, -0.022, L[:, 1]) * sstep(ns - 0.008, ns - 0.004, L[:, 2]) * r['head']
        return r
    C._regions = regions

    # ---------- the coat ----------
    _fur = C.fur

    def fur(P, N, c):
        ln, de = _fur(P, N, c)
        ln = ln * T['FUR_K']
        if T.get('FUR_X'):
            ln = T['FUR_X'](C, P, N, c, ln)
        return np.clip(ln, 0, C.FUR['len']).astype(F), de
    C.fur = fur
    C.FUR = dict(T['FUR'])
    C.paint = lambda P, N, c: coat(C, P, N, c)
    C.baby_paint = lambda P, N, c, col: baby_coat(C, P, N, c, col)
    C.KITTEN = T['KITTEN']
    C.cards = lambda: whiskers(C)
    C.hair_texture = hair_texture
    _meta = C.meta

    def meta(st):
        m = _meta(st)
        m['eye'].update(dict(T['EYE_META'], pupil='round'))
        m.update(T['META'])
        return m
    C.meta = meta
    C.MAP_QUALITY = T['MAP_QUALITY']
    C.BABY_TEX = T['BABY_TEX']
    return C


def mouth_line(C, L):
    """distance to the mouth lines (the philtrum down from the nose, the lips back under the pads), stretched in u"""
    MS, ns = C.MS, C.NOSE_S
    M = L * V(1, 2.0, 1)
    m = round_cone(M, V(0.0, -0.012 * 2.0, ns + 0.001), V(0.0, -0.0235 * 2.0, ns - 0.004), 0.0004, 0.0004)
    m = smin(m, round_cone(M, V(0.0, -0.0235 * 2.0, ns - 0.004), V(0.013, -0.0262 * 2.0, MS(0.078)), 0.0004, 0.0004), 0.0006)
    m = smin(m, round_cone(M, V(0.013, -0.0262 * 2.0, MS(0.078)), V(0.02, -0.025 * 2.0, MS(0.066)), 0.0004, 0.0003), 0.0006)
    return m


def face(C, R):
    """face masks: pale (whisker pads, chin, under and over the eyes), dark (whisker spots, the line behind the pads)"""
    L, MS, T = R['L'], C.MS, C.T
    x, y, sv = L[:, 0], L[:, 1], L[:, 2]
    pads = sstep(0.019, 0.01, np.linalg.norm((L - V(T.get('PAD_X', 0.0105), -0.0165, MS(0.084))) / V(1.0, 1.0, 1.25), axis=1))
    chin = sstep(-0.025, -0.029, y) * sstep(0.055, 0.07, sv)
    # pale marks round the eyes: a patch under each eye, a spot over it
    E = C.HF.loc(C.EYE.c[None, :])[0]
    under = sstep(0.0065, 0.003, np.linalg.norm((L - (E + V(0.001, -0.0085, 0.001))) / V(1.25, 0.65, 1.0), axis=1))
    over = sstep(0.0055, 0.0025, np.linalg.norm((L - (E + V(-0.002, 0.0085, -0.002))) / V(1.0, 0.7, 1.0), axis=1))
    pale = np.clip(np.maximum.reduce([pads, chin, under * T['EYE_PALE'][0], over * T['EYE_PALE'][1]]), 0, 1)
    # whisker spots: rows of small dark dots on the pads
    g, _ = worley(L / V(0.0026, 0.0026, 0.0026), 91)
    spots = sstep(0.32, 0.2, g) * pads * sstep(0.006, 0.01, x) * sstep(-0.009, -0.012, y) * sstep(-0.022, -0.019, y)
    return pale, spots * T['WSPOTS']


def coat(C, P, N, c, baby=False):
    """the big cat's coat (cat units): ground, pale underparts and face, the species' pattern, the face, ears, tail
    tip, bare parts and coat strokes"""
    T = C.T
    K = T['COL']
    R = C._regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    M = C._tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(K['ground'], (len(P), 1))
    col = mix(col, K['warm'], sstep(0.0, -0.5, N[:, 1]) * 0.45)
    col = mix(col, K['back'], R['top'] * T['BACK_K'] * (1 - R['head'] * 0.5))
    col *= (0.93 + 0.14 * n1)[:, None]
    # (NO_EYERING: without the house cat's pale ring round the eyes, which made goggles on the tiger)
    pale = M['pale'] * (1 - T.get('NO_EYERING', 0) * M['eyering'])
    under = np.clip(np.maximum(sstep(-0.35, -0.75, N[:, 1]) * 0.85, pale), 0, 1) * (1 - R['tail'] * sstep(0.0, 0.5, N[:, 1]))
    col = mix(col, mix(np.tile(K['cream'], (len(P), 1)), K['white'], np.clip(M['chin'] + sstep(-0.6, -0.9, N[:, 1]), 0, 1)), under * 0.85)
    fp, fd = face(C, R)
    col = mix(col, K['white'], fp * R['head'] * 0.88)
    if T.get('pattern'):
        col = T['pattern'](C, R, P, N, col, under)
    col = mix(col, K['dark'], fd * R['head'] * 0.8)
    # ears: dark backs, pale insides
    eb = R['ear'] * (1 - R['earIn'])
    col = mix(col, K['ear'], eb * 0.85)
    if T.get('EAR_SPOT'):
        # a white spot on the back of each ear (the tiger's; the leopard's is smaller and softer)
        es = float(T['EAR_SPOT'])
        sp = sstep(0.32 * es, 0.18 * es, np.hypot(R['ea'] / C.EAR_L - 0.42, R['ec'] / C.EAR_W * 0.9))
        col = mix(col, K['white'], eb * sp * 0.9 * es)
    col = mix(col, K['earIn'], R['ear'] * R['earIn'] * 0.7)
    if T.get('tail_tip'):
        col = T['tail_tip'](C, R, col)
    nose = mix(np.tile(K['nose'], (len(P), 1)), K['noseDark'], sstep(0.4, 0.8, n2) * T['NOSE_MOTTLE'])
    # the nose leather's dark rim
    nr = R['nose'] * (1 - sstep(0.5, 0.95, R['nose']))
    col = mix(col, nose, R['nose'])
    col = mix(col, K['noseDark'], nr * 0.6)
    col = mix(col, K['lips'], R['phil'] * 0.6 + R['lip'] * 0.85)
    col = mix(col, K['lid'], R['lid'])
    col = mix(col, K['pad'], R['pad'] * R['paw'])
    if T.get('extra'):
        col = T['extra'](C, R, P, N, col)
    s, tone = C._strands(P, N, R)
    col *= (1 + s * T['STROKE'] * (tone - 0.4) - 0.05 * (1 - s))[:, None]
    col = mix(col, C.K['ball'], R['ball'])
    rough = 0.66 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid'] - 0.15 * R['lip']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_coat(C, P, N, c, col):
    """the cub's own coat over the adult's colors: T['cub'](C, R, P, N, col, keep, c) does the species' part"""
    R = C._regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    out = C.T['cub'](C, R, P, N, col, keep, c)
    return np.clip(out, 0, 1).astype(F)


def whiskers(C):
    """long white whiskers in rows on the whisker pads of the longer muzzle, two over each eye"""
    MS, HF, EYE = C.MS, C.HF, C.EYE
    T = C.T
    rows = []
    for i in range(12):
        r_, k_ = i // 3, i % 3
        s0 = MS(0.076 + 0.006 * k_) + 0.0015 * (rnd(i, 1) - 0.5)
        u0 = -0.0125 - 0.003 * r_ + 0.0008 * (rnd(i, 2) - 0.5)
        root = HF.pt(s0, u0, 0.0145 + 0.0015 * k_)
        d = nrm(V(0.85, 0.0, 0.0) + HF.a * (0.18 - 0.25 * k_ / 2) + HF.u * (0.1 - 0.12 * r_) + V(0, 0.05 * (rnd(i, 3) - 0.5), 0))
        rows.append((root, d, T['WHISKER'] * (1 + 0.25 * rnd(i, 4)) * (1 - 0.1 * r_), 0.0009, 0.12, 0))
    wk = []
    for sg in (1, -1):
        m = V(sg, 1, 1)
        wk += CV.whiskers([(root * m, d * m, ln, w, droop, col) for root, d, ln, w, droop, col in rows], baby=0.6)
        for j in range(2):
            root = EYE.c + V(0.002 + 0.004 * j, 0.0105, -0.004 - 0.002 * j)
            d = nrm(V(0.7, 0.55, 0.35 - 0.2 * j))
            wk += CV.whiskers([(root * m, d * m, 0.022 + 0.004 * j, 0.0006, -0.1, 0)], baby=0.6)
    roots = np.array([cd['pts'][0] for cd in wk], F)
    g = CV.gradient(C.shape, roots, 0.0003)
    dd = C.shape(roots)
    for cd, gg, d0 in zip(wk, g, dd):
        cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.0005)
    return wk


def hair_texture():
    """white whiskers"""
    import smallfur as SF
    wh = [(0.0, (0.84, 0.82, 0.78)), (1.0, (0.97, 0.96, 0.94))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0) for _ in range(3)]
    return SF.strand_texture((96, 128), cols, seed=29)


def install(g, C, KS):
    bigcat.install(g, C, KS)
