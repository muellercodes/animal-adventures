# Chinese dragon (round 17): Rosemary's dragon, "purple pink and blue: purple in the middle, blue on top, and pink on
# the bottom". The classic long Chinese dragon: about 6 m from the snout to the tip of the tail and no thicker than a
# big python (a body about 30 cm across), four short legs with eagle's feet (three toes forward and one back, long
# hooked claws), a long head with a broad snout and an upturned nose with big nostrils, big round eyes under heavy
# brows, a long mouth, two branching deer-like antlers, a small beard under the chin, a flowing mane of flame-shaped
# locks down the neck and on the cheeks, tufts at the elbows, a ridge of fin spines all down the back and a tuft of
# hair at the tail tip. The belly is in wide bands like a snake's and the body in carp scales. Blue on top, purple on
# the sides, pink underneath, blended where they meet; the mane, beard, tufts and spines a deep blue going violet at
# their tips, the antlers pale pink going lavender, ivory claws, golden eyes. The whiskers are the game's
# (40_animals.js: they bend as it moves). The baby has the same colors and its own shape (baby_offset): antler buds,
# a short mane and beard, a low crest and a small tuft.
#
# On the lizard template (lizkit.py), laid out in base units and scaled by KS = 12 (the numbers below are written in
# game meters and divided by KS: G()). The body chain has more bones than a lizard's (s1 .. s4 in the trunk, neck1
# and neck2, ten tail bones; the same table as SPEC.chinesedragon in 40_animals.js), so the chain the weights and the
# bend rings follow is this file's own (spine_chain, spine_line).
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, ellipsoid, round_cone, chain, fbm, _hash
import lizkit as LK

M = LK.load('chinesedragon')
KS = 12.0


def G(*a):
    """game meters to base units"""
    return V(*[v / KS for v in a])


def g(v):
    return v / KS


M.BOUNDS = (G(-0.42, -0.01, -3.62), G(0.42, 1.2, 2.81))
# the body loft (game meters; the same rows as CDR.body in 40_animals.js): z, top, height of the widest line, bottom,
# half width, exponents (top, bottom)
ROWS = [
    (-3.2, 0.448, 0.42, 0.396, 0.01, 2.0, 2.0), (-3.1, 0.465, 0.42, 0.38, 0.026, 2.0, 2.0), (-2.9, 0.481, 0.42, 0.364, 0.045, 2.0, 2.0),
    (-2.5, 0.5, 0.42, 0.346, 0.066, 2.0, 2.0), (-2.0, 0.521, 0.42, 0.326, 0.088, 2.1, 2.0), (-1.4, 0.543, 0.42, 0.305, 0.11, 2.1, 2.0),
    (-0.85, 0.56, 0.42, 0.289, 0.128, 2.1, 2.0), (-0.35, 0.572, 0.42, 0.277, 0.142, 2.1, 2.0), (0.0, 0.578, 0.42, 0.272, 0.148, 2.1, 2.0),
    (0.5, 0.582, 0.42, 0.268, 0.152, 2.1, 2.0), (1.0, 0.584, 0.42, 0.268, 0.153, 2.1, 2.0), (1.4, 0.584, 0.423, 0.27, 0.15, 2.1, 2.0),
    (1.62, 0.586, 0.428, 0.277, 0.142, 2.1, 2.0), (1.8, 0.598, 0.448, 0.306, 0.126, 2.1, 2.0), (1.95, 0.628, 0.49, 0.356, 0.114, 2.1, 2.0),
    (2.08, 0.668, 0.534, 0.405, 0.113, 2.2, 2.0), (2.18, 0.704, 0.56, 0.432, 0.134, 2.4, 2.1), (2.3, 0.722, 0.57, 0.442, 0.142, 2.5, 2.1),
    (2.42, 0.698, 0.57, 0.452, 0.126, 2.6, 2.2), (2.54, 0.672, 0.568, 0.462, 0.11, 2.8, 2.2), (2.64, 0.656, 0.565, 0.47, 0.097, 2.8, 2.2),
    (2.71, 0.645, 0.562, 0.478, 0.084, 2.6, 2.1), (2.75, 0.626, 0.556, 0.492, 0.062, 2.3, 2.0), (2.775, 0.6, 0.55, 0.51, 0.032, 2.1, 2.0),
]
M.BODY = [tuple(v / KS for v in r[:5]) + tuple(r[5:]) for r in ROWS]
M.TAIL_TIP = G(0, 0.42, -3.2)
M.Z_HEAD, M.Z_TAIL = g(2.12), g(-0.15)
# (the long body in short pieces, so its islands pack well into the square maps)
M.UV_Z = [g(1.1), g(0.2), g(-0.75), g(-1.7), g(-2.55)]
M.HEAD_BOX = (G(-0.26, 0.36, 2.04), G(0.26, 0.8, 2.81))
M.LEG_BOX = (G(-0.36, -0.01, -0.3), G(0.36, 0.52, 1.86))
M.FOOT_BOX = (G(-0.38, -0.01, -0.26), G(0.38, 0.15, 1.92))

# big round eyes under heavy brows
M.EYE_R, M.EYE_DIR = g(0.042), V(0.85, 0.2, 0.45)
M.LID_W, M.LID_H, M.LID_OFF = g(0.036), g(0.034), 0.0
M.LIDS = (g(0.014), g(0.012), g(0.004))
M.setup()
M.EYE_C = M.seat_eye(g(0.635), g(2.37), g(0.004))
# the upturned nose: big flared nostrils on a swollen pad at the top of the snout's tip
M.NOSTRIL = G(0.045, 0.654, 2.735)
M.NOSTRIL_R = (G(0.028, 0.02, 0.03), G(0.016, 0.012, 0.014))
M.EAR = None
M.MOUTH = G(0.0, 0.53, 2.75)
M.MOUTH_LINE = [G(0.0, 0.528, 2.768), G(0.05, 0.53, 2.74), G(0.1, 0.535, 2.58), G(0.126, 0.546, 2.38)]
M.MOUTH_R = [g(0.007), g(0.007), g(0.006), g(0.0035)]
M.MOUTH_DEPTH = g(0.009)
M.SNOUT = (G(0.0, 0.58, 2.7), G(0.06, 0.045, 0.05), g(0.03))
M.HEAD_BLOBS = [
    (G(0.045, 0.64, 2.715), G(0.03, 0.02, 0.036), g(0.02)),      # the nostril pads
    (G(0.0, 0.674, 2.52), G(0.05, 0.02, 0.14), g(0.03)),          # the ridge down the snout
    (G(0.075, 0.705, 2.35), G(0.048, 0.03, 0.13), g(0.03)),      # the heavy brow over the eye, on back to the antler
    (G(0.116, 0.545, 2.24), G(0.056, 0.075, 0.085), g(0.04)),     # the jaw muscles
]
M.MANDIBLE = (G(0.09, 0.492, 2.3), G(0.036, 0.494, 2.73), g(0.055), g(0.034), g(0.03))
M.BLOBS = [
    (G(0.1, 0.4, 1.6), G(0.07, 0.08, 0.1), g(0.05)),              # the shoulder
    (G(0.1, 0.4, 0.0), G(0.08, 0.09, 0.12), g(0.05)),             # the hip
]

# the legs (game meters): short, the elbow out behind, the knee forward; eagle's feet
SH, EL, WR = G(0.1, 0.4, 1.6), G(0.195, 0.29, 1.52), G(0.215, 0.08, 1.6)
HP, KN, AN = G(0.1, 0.4, 0.0), G(0.205, 0.3, 0.1), G(0.225, 0.085, -0.03)
M.HAND, M.FOOT = G(0.22, 0.025, 1.665), G(0.23, 0.025, 0.035)
M.FLEG = [
    ('chain', [SH, G(0.15, 0.36, 1.57), EL], [g(0.075), g(0.064), g(0.055)], g(0.02), 0.0),
    ('chain', [EL, G(0.208, 0.18, 1.555), WR], [g(0.052), g(0.045), g(0.038)], g(0.015), g(0.015)),
    ('ball', EL + G(0.003, 0, -0.003), G(0.05, 0.048, 0.048), g(0.015)),
    ('pad', M.HAND + G(0.0, 0.004, -0.012), (g(0.045), g(0.022), g(0.05)), g(0.02), None, g(0.02)),
]
M.HLEG = [
    ('chain', [HP, G(0.155, 0.37, 0.06), KN], [g(0.085), g(0.07), g(0.058)], g(0.025), 0.0),
    ('ball', G(0.14, 0.36, 0.02), G(0.085, 0.08, 0.1), g(0.03)),   # the thigh
    ('chain', [KN, G(0.218, 0.19, 0.03), AN], [g(0.054), g(0.046), g(0.039)], g(0.015), g(0.015)),
    ('ball', KN + G(0.003, 0, -0.003), G(0.052, 0.05, 0.05), g(0.015)),
    ('pad', M.FOOT + G(0.0, 0.004, -0.02), (g(0.047), g(0.022), g(0.06)), g(0.02), nrm([0.0, 0, 1]), g(0.02)),
]
M.LEG_K = (g(0.03), g(0.035))
# eagle's feet: three long toes forward, one back (the hallux), long hooked talons
M.F_TOES = [(-28, g(0.1), g(0.026)), (0, g(0.12), g(0.03)), (28, g(0.1), g(0.026)), (180, g(0.075), g(0.026))]
M.H_TOES = [(-28, g(0.105), g(0.028)), (0, g(0.125), g(0.032)), (28, g(0.105), g(0.028)), (180, g(0.08), g(0.028))]
M.TOE_R = (g(0.017), g(0.019))
M.CLAW = 1.5
M.HIND5 = None
M.TOE_K = g(0.008)
_RNG = np.random.default_rng(17)


# ---------- the crest, mane, beard, antlers, tufts ----------
CREST_Z = [g(v) for v in (-3.1, -2.7, -2.0, -1.0, 0.0, 1.0, 1.45, 1.68)]
CREST_H = [g(v) for v in (0.035, 0.055, 0.075, 0.095, 0.105, 0.105, 0.09, 0.0)]


def crest(P):
    M.setup()
    return M.crest(M.mirror(P), CREST_Z, CREST_H, g(0.075), g(0.034), lean=0.55, sink=g(0.012))


def _lock(pts, r0, r1=0.012, nrm_=None):
    """a flame-shaped lock of hair along pts, tapering from r0 to r1 (game meters), flattened against the skin along
    nrm_ (its points, radii and flattening axis)"""
    n = len(pts)
    rad = [g(r0 + (r1 - r0) * (i / (n - 1)) ** 0.8) for i in range(n)]
    return ([np.asarray(p, F) for p in pts], rad, nrm_)


def _mane_lock(z, a, L, rise, r0):
    """a lock of the mane rooted on the neck at z (game m), angle a round from the side: it lies back along the neck
    and lifts off it toward its tip, curling up"""
    ca, sa = np.cos(a), np.sin(a)
    pts = [M.surf_pt(g(z), a, -g(0.02))]
    for f, o in ((0.33, 0.03), (0.66, 0.06 + 0.4 * rise), (1.0, 0.08 + rise)):
        q = M.surf_pt(g(z - L * f), a + 0.12 * f, g(o))
        pts.append(q + V(0.0, g(0.04) * f * f, 0.0))
    return _lock(pts, r0, 0.014, V(ca, sa, 0.0))


def _locks():
    """the mane: ten rows of broad flame-shaped locks down the neck from the back of the head, lying back along it
    and lifting off at their tips, merged at their roots into one mass; locks on the cheeks behind the jaw and over
    the crown between the antlers"""
    out = []
    for ri, z in enumerate(np.linspace(2.2, 1.7, 8)):
        for ang in (1.48, 1.1, 0.72, 0.34):
            a = min(1.52, ang + (0.18 if ri % 2 else 0.0) + _RNG.uniform(-0.05, 0.05))
            out.append(_mane_lock(z, a, 0.42 + 0.08 * _RNG.uniform() - 0.08 * ri / 7, 0.07 + 0.06 * np.sin(a) + 0.03 * _RNG.uniform(), 0.06))
    # the cheeks (behind the corner of the jaw, flaring back), and the crown between the antlers
    for pts, r0 in (([G(0.12, 0.52, 2.3), G(0.16, 0.5, 2.2), G(0.2, 0.47, 2.1), G(0.23, 0.44, 2.0)], 0.06),
                    ([G(0.13, 0.59, 2.26), G(0.17, 0.59, 2.16), G(0.21, 0.58, 2.06), G(0.25, 0.58, 1.96)], 0.06),
                    ([G(0.1, 0.47, 2.32), G(0.13, 0.43, 2.24), G(0.16, 0.39, 2.15), G(0.18, 0.35, 2.06)], 0.05),
                    ([G(0.025, 0.715, 2.27), G(0.035, 0.75, 2.18), G(0.045, 0.79, 2.09), G(0.05, 0.82, 2.0)], 0.05)):
        out.append(_lock(pts, r0, 0.014, V(1.0, 0.0, 0.0) if pts[0][1] < g(0.7) else V(0.0, 1.0, 0.0)))
    return out


LOCKS = _locks()
# the beard: three locks hanging from the chin, merged into one pointed tuft that curls forward at its tip
BEARD = [_lock([G(0.0, 0.47, 2.6), G(0.0, 0.41, 2.55), G(0.0, 0.35, 2.49), G(0.0, 0.31, 2.46)], 0.065, 0.018),
         _lock([G(0.035, 0.47, 2.56), G(0.04, 0.41, 2.51), G(0.042, 0.36, 2.45), G(0.04, 0.33, 2.42)], 0.06, 0.017),
         _lock([G(0.06, 0.48, 2.5), G(0.065, 0.43, 2.45), G(0.068, 0.39, 2.39), G(0.065, 0.37, 2.36)], 0.05, 0.016)]
# the tail tuft: a flame of locks fanning back from the tip
TUFT = []
for ang, rad, L in ((90, 0.14, 0.42), (60, 0.15, 0.45), (30, 0.16, 0.47), (0, 0.16, 0.48), (-30, 0.15, 0.46), (-60, 0.14, 0.43), (-90, 0.12, 0.38), (90, 0.05, 0.5), (0, 0.06, 0.52), (-90, 0.04, 0.46)):
    a = np.radians(ang)
    dv = V(np.cos(a), np.sin(a), 0.0)
    c0 = G(0, 0.42, -3.04)
    TUFT.append(_lock([c0 + dv * g(0.02), c0 + dv * g(rad * 0.45) + G(0, 0, -L * 0.3), c0 + dv * g(rad * 0.85) + G(0, 0.0, -L * 0.65),
                       c0 + dv * g(rad) + G(0, 0.03 * np.sin(a), -L)], 0.07, 0.016))
# tufts behind the elbows and the knees (on the legs: fix_extra gives them to the leg's bones)
ELBOWS = [_lock([G(0.2, 0.29, 1.51), G(0.22, 0.3, 1.45), G(0.24, 0.31, 1.39), G(0.255, 0.33, 1.32)], 0.05, 0.013, V(1, 0, 0)),
          _lock([G(0.2, 0.24, 1.53), G(0.225, 0.235, 1.47), G(0.245, 0.235, 1.42), G(0.26, 0.24, 1.37)], 0.04, 0.012, V(1, 0, 0)),
          _lock([G(0.21, 0.3, 0.07), G(0.23, 0.31, 0.01), G(0.25, 0.33, -0.06), G(0.265, 0.35, -0.13)], 0.052, 0.013, V(1, 0, 0)),
          _lock([G(0.205, 0.25, 0.08), G(0.23, 0.245, 0.02), G(0.25, 0.245, -0.04), G(0.262, 0.25, -0.1)], 0.042, 0.012, V(1, 0, 0))]
# the antlers (one side; the field is mirrored): a main beam up and back from the top of the head, three tines
A0 = G(0.06, 0.7, 2.215)
ANTLER = [
    ([A0, G(0.09, 0.8, 2.13), G(0.135, 0.905, 1.99), G(0.17, 0.98, 1.84), G(0.19, 1.02, 1.68)], [g(0.034), g(0.028), g(0.023), g(0.017), g(0.012)]),
    ([G(0.095, 0.815, 2.12), G(0.125, 0.93, 2.18), G(0.14, 0.99, 2.22)], [g(0.02), g(0.015), g(0.011)]),
    ([G(0.135, 0.905, 1.995), G(0.175, 1.01, 2.03), G(0.19, 1.07, 2.05)], [g(0.018), g(0.014), g(0.011)]),
    ([G(0.17, 0.98, 1.85), G(0.19, 1.08, 1.86)], [g(0.014), g(0.011)]),
]


def _chains(Q, items, k):
    """union of tapering chains (points, radii[, flattening axis]), each evaluated only near its own box; a lock with
    an axis is squashed to two thirds of its thickness along it (broad and flat against the skin)"""
    out = np.full(len(Q), 1.0, F)
    for it in items:
        pts, rad = it[0], it[1]
        ax = it[2] if len(it) > 2 else None
        P = np.asarray(pts, F)
        lo = P.min(0) - max(rad) - 0.002
        hi = P.max(0) + max(rad) + 0.002
        m = M.box(Q, lo, hi)
        if m.any():
            X = Q[m]
            if ax is not None:
                n_ = np.asarray(ax, F) / np.linalg.norm(ax)
                X = X + np.outer((X - P[0]) @ n_, n_) * 0.5
            d = chain(X, pts, rad, k)
            out[m] = smin(out[m], d, k * 0.5)
    return out


def mane(P):
    return _chains(M.mirror(P), LOCKS, g(0.04))


def beard(P):
    return _chains(M.mirror(P), BEARD, g(0.06))


def tuft(P):
    return _chains(M.mirror(P), TUFT, g(0.07))


def elbows(P):
    return _chains(M.mirror(P), ELBOWS, g(0.03))


FANGS = [([G(0.07, 0.52, 2.705), G(0.073, 0.5, 2.71), G(0.075, 0.478, 2.712)], [g(0.014), g(0.01), g(0.004)])]


def fangs(P):
    return _chains(M.mirror(P), FANGS, g(0.004))


def antler(P):
    Q = M.mirror(P)
    d = _chains(Q, ANTLER, g(0.008))
    # the burr: a knobbly ring where the antler leaves the head
    return smin(d, ellipsoid(Q, A0 + G(0.0, 0.012, 0.0), G(0.046, 0.024, 0.046)), g(0.008))


M.EXTRAS = [
    ('crest', crest, g(0.012), None),
    ('mane', mane, g(0.02), (G(-0.4, 0.3, 1.2), G(0.4, 0.98, 2.36))),
    ('beard', beard, g(0.016), (G(-0.16, 0.26, 2.26), G(0.16, 0.54, 2.68))),
    ('antler', antler, g(0.014), (G(-0.28, 0.62, 1.6), G(0.28, 1.16, 2.33))),
    ('tuft', tuft, g(0.016), (G(-0.26, 0.19, -3.62), G(0.26, 0.65, -2.98))),
    ('elbows', elbows, g(0.014), (G(-0.34, 0.18, -0.2), G(0.34, 0.42, 1.58))),
    ('fangs', fangs, g(0.004), (G(-0.1, 0.46, 2.68), G(0.1, 0.53, 2.73))),
]
M.BODY_EXTRAS = ('crest', 'mane', 'beard', 'antler', 'tuft', 'fangs')

M.PATCHES = [
    (G(0.03, 0.55, 2.27), G(0.18, 0.74, 2.47), g(0.0028)),       # eye, lids and brow
    (G(0.0, 0.46, 2.55), G(0.13, 0.7, 2.79), g(0.0035)),         # snout tip, nostrils, lips
    (G(0.02, 0.66, 1.62), G(0.24, 1.15, 2.31), g(0.0042)),       # the antler
    (G(0.14, -0.01, 1.52), G(0.32, 0.1, 1.82), g(0.0035)),       # front foot
    (G(0.15, -0.01, -0.12), G(0.33, 0.1, 0.2), g(0.0035)),       # hind foot
]
M.SC = dict(body=g(0.03), leg=g(0.022), head=g(0.02), ring=g(0.03), belly=g(0.05), lip=g(0.03))
M.RINGS = False
M.GRAN_H = 0.14
M.UV_HEAD = 1.6
M.KEEP_FLOOR = 0.28
M.FEET_KEEP = 0.22
M.BODY_REACH = g(0.22)
M.LEG_REACH = g(0.08)
M.BEND_PITCH = (g(0.08), g(0.05))
M.BAKE_CAGE = (g(0.016), g(0.05))
M.AO_DIST = g(0.25)
M.SPINE_BLEND = g(0.07)
M.LEG_BLEND = g(0.035)

FWD = ['hips', 's1', 's2', 's3', 's4', 'chest', 'neck1', 'neck2', 'head']


def _tails(R):
    return sorted([n for n in R if n.startswith('tail') and n[4:].isdigit()], key=lambda n: int(n[4:]))


def spine_chain():
    """bones along the middle line from the tail tip forward and the points between them (each bone owns the stretch
    from its pivot away from the hips; the hips own the stretch from the first tail bone to the first trunk bone)"""
    R = M.rig()
    tails = _tails(R)
    bones = list(reversed(tails)) + FWD
    pts = [M.TAIL_TIP] + [R[n] for n in reversed(tails)] + [R[n] for n in FWD[1:]]
    pts.append(V(0, float(M.MOUTH[1]), float(M.MOUTH[2]) + 0.001))
    return bones, pts


def spine_line():
    R = M.rig()
    tails = _tails(R)
    pts = [V(0, float(M.iz(np.array([M.BK[0, 0]], F), 2)[0]), M.BK[0, 0] + 0.004)]
    pts += [R[n] for n in reversed(tails)] + [R[n] for n in FWD]
    pts += [V(0, float(M.MOUTH[1]), float(M.MOUTH[2]))]
    return pts


M.spine_chain = spine_chain
M.spine_line = spine_line


def fix_extra(W, P, names, bi):
    """the antlers, the beard and the crown's lock go with the head (the chain would give an antler's tip to the
    neck); the tufts behind the elbows and knees go with the forearm and the shin"""
    Wn = W.copy()
    hd = np.zeros(len(names), F); hd[bi['head']] = 1
    near = lambda d, w: sstep(w, 0.0, d)
    k = np.maximum.reduce([near(antler(P), g(0.02)), near(beard(P), g(0.02)), near(fangs(P), g(0.01))])
    k = np.maximum(k, near(M.local(P, *M.HEAD_BOX, mane), g(0.02)) * sstep(g(2.1), g(2.18), P[:, 2]))
    Wn = Wn * (1 - k[:, None]) + hd[None, :] * k[:, None]
    e = near(elbows(P), g(0.015)) * sstep(0.0, g(0.005), M.body(P) - elbows(P))
    for s, sg in (('L', 1), ('R', -1)):
        mine = (P[:, 0] * sg > 0)
        for front, bn in ((True, 'fore'), (False, 'shin')):
            zon = (P[:, 2] > g(0.8)) if front else (P[:, 2] < g(0.8))
            kk = e * mine * zon
            w1 = np.zeros(len(names), F); w1[bi[bn + s]] = 1
            Wn = Wn * (1 - kk[:, None]) + w1[None, :] * kk[:, None]
    return Wn


M.fix_extra = fix_extra


def keep_extra(P):
    Pm = M.mirror(P)
    x, y = Pm[:, 0], Pm[:, 1]
    k = sstep(g(0.012), 0.0, crest(P)) * 0.34
    k = np.maximum(k, sstep(g(0.012), 0.0, M.local(P, G(-0.28, 0.62, 1.6), G(0.28, 1.16, 2.33), antler)) * 0.42)
    k = np.maximum(k, sstep(g(0.012), 0.0, M.local(P, G(-0.4, 0.3, 1.2), G(0.4, 0.98, 2.36), mane)) * 0.3)
    k = np.maximum(k, sstep(g(0.012), 0.0, M.local(P, G(-0.16, 0.26, 2.26), G(0.16, 0.54, 2.68), beard)) * 0.3)
    k = np.maximum(k, sstep(g(0.012), 0.0, M.local(P, G(-0.26, 0.19, -3.62), G(0.26, 0.65, -2.98), tuft)) * 0.3)
    # (the template's feet test is for a lizard's sprawl: these feet are closer in)
    k = np.maximum(k, sstep(g(0.1), g(0.05), y) * sstep(g(0.15), g(0.18), x) * M.FEET_KEEP)
    return k.astype(F)


M.keep_extra = keep_extra


def uv_regions_extra(Pm, lab):
    """the antlers and the mane get their own islands"""
    P = Pm
    lab = lab.copy()
    a = M.local(P, G(-0.28, 0.62, 1.6), G(0.28, 1.16, 2.33), antler)
    mn = M.local(P, G(-0.4, 0.3, 1.2), G(0.4, 0.98, 2.36), mane)
    bd = M.body(P)
    lab[(a < g(0.01)) & (a < bd)] = 20
    lab[(mn < g(0.01)) & (mn < bd - g(0.01))] = 21
    return lab


M.uv_regions_extra = uv_regions_extra


def uv_weight(P):
    z = P[:, 2]
    return (0.95 + (M.UV_HEAD - 0.95) * sstep(M.Z_HEAD - 0.005, M.Z_HEAD + 0.01, z) - 0.25 * sstep(M.Z_TAIL - 0.08, M.BK[0, 0], z)).astype(F)


M.uv_weight = uv_weight


# ---------- regions and scales ----------
def regions_extra(r, P, N, c):
    bd = c['body']
    for k in ('crest', 'mane', 'beard', 'antler', 'tuft', 'elbows', 'fangs'):
        r[k] = sstep(g(0.006), 0.0, c[k]) * sstep(-g(0.002), g(0.006), bd - c[k])
    r['hair'] = np.maximum.reduce([r['mane'], r['beard'], r['tuft'], r['elbows']])
    r['extra'] = np.maximum.reduce([r['hair'], r['crest'], r['antler'], r['fangs']])
    r['claw'] = np.maximum(r['claw'], r['fangs'])
    r['belly'] = r['belly'] * (1 - r['extra'])
    r['top'] = r['top'] * (1 - r['extra'])
    return r


M.regions_extra = regions_extra

NA = 28                        # carp scales around the whole body
TH_B = 2.22                    # the belly bands start this far round from the top (radians)


def _radius(s):
    z = -s
    w = M.iz(z, 4)
    h = 0.5 * (M.iz(z, 1) - M.iz(z, 3))
    return np.maximum(0.5 * (w + h), g(0.012))


_S = np.linspace(-M.BK[-1, 0], -M.BK[0, 0], 4000)
_ds = _S[1] - _S[0]
_ROW = np.concatenate([[0.0], np.cumsum(_ds / (2 * np.pi * _radius(_S[:-1]) / NA * 0.86))])
_ROWB = np.concatenate([[0.0], np.cumsum(_ds / (2 * np.pi * _radius(_S[:-1]) / NA * 1.7))])


def carp(z, th):
    """overlapping carp scales in staggered rows along the body: height (0..1), edge distance (0 at the rim) and the
    scale's center (row, column). The scale nearer the head lies on top, so each shows its rounded free edge, toward
    the tail."""
    rc = np.interp(-z, _S, _ROW).astype(F)
    cc = (th / np.pi * (NA / 2)).astype(F)
    n = len(z)
    best = np.full(n, 1e9, F); H = np.zeros(n, F); E = np.zeros(n, F); CR = np.zeros(n, F); CC = np.zeros(n, F)
    i0 = np.floor(rc)
    for di in (-1, 0, 1):
        i = i0 + di
        st = 0.5 * (np.abs(i) % 2)
        j0 = np.floor(cc - st)
        for dj in (-1, 0, 1):
            j = j0 + dj
            ci, cj = i + 0.5, j + 0.5 + st
            a = (rc - ci) / 0.5 / 1.42
            b = (cc - cj) / 0.5 / 1.12
            d = np.sqrt(a * a + b * b)
            ok = (d < 1.0) & (i < best)
            h = (0.25 + 0.75 * sstep(-1.0, 0.85, a)) * sstep(1.0, 0.86, d)
            best = np.where(ok, i, best)
            H = np.where(ok, h, H); E = np.where(ok, 1 - d, E); CR = np.where(ok, ci, CR); CC = np.where(ok, cj, CC)
    return H, E, CR, CC


def scales_extra(H, E, C, R, P, N, c):
    Pm = R['Pm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    yw = M.iz(z, 2)
    th = np.arctan2(x, y - yw)
    R['th'] = th
    body = (1 - R['head']) * (1 - R['leg']) * (1 - R['extra'])
    pitch = 2 * np.pi * _radius(-z) / NA * 0.86
    # carp scales over the back and sides
    m = body > 0.01
    if m.any():
        h, e, cr, cc = carp(z[m], th[m])
        k = body[m] * sstep(TH_B + 0.04, TH_B - 0.04, th[m])
        H[m] = H[m] * (1 - k) + h * 0.13 * pitch[m] * k
        E[m] = E[m] * (1 - k) + e * 0.5 * k
        C[m] = np.where(k[:, None] > 0.5, np.stack([cr * 0.001, cc * 0.001, np.full(m.sum(), 0.5, F)], 1), C[m])
    # the belly in wide bands right across, each overlapping the next toward the tail, the free edge raised
    bel = body * sstep(TH_B - 0.04, TH_B + 0.04, th)
    R['bands'] = bel
    mb = bel > 0.01
    if mb.any():
        rb = np.interp(-z[mb], _S, _ROWB)
        a = rb - np.floor(rb)
        hb = (0.4 + 0.6 * a) * sstep(0.0, 0.07, a) * sstep(1.0, 0.9, a) * sstep(TH_B, TH_B + 0.1, th[mb])
        eb = np.minimum(np.minimum(a, 1 - a), sstep(TH_B, TH_B + 0.14, th[mb]) * 0.5)
        k = bel[mb]
        H[mb] = H[mb] * (1 - k) + hb * 0.1 * pitch[mb] * 1.7 * k
        E[mb] = E[mb] * (1 - k) + eb * k
        C[mb] = np.where(k[:, None] > 0.5, np.stack([np.floor(rb) * 0.001, np.full(mb.sum(), 0.9, F), np.zeros(mb.sum(), F)], 1), C[mb])
    # hair: strands along the locks (mostly back, down in the beard); the crest's fin rays; the antlers' ridges
    hair = R['hair']
    if (hair > 0.01).any():
        st = np.where(R['beard'] > 0.5, fbm(Pm * np.array([900, 110, 900], F), 2, 81), fbm(Pm * np.array([900, 900, 120], F), 2, 82))
        H = H * (1 - hair) + hair * g(0.0035) * sstep(0.3, 0.7, st)
        E = E * (1 - hair) + hair * 0.5
    cr = R['crest']
    if (cr > 0.01).any():
        ray = 0.5 + 0.5 * np.sin(z / (g(0.075) / 6) * 2 * np.pi)
        H = H * (1 - cr) + cr * g(0.002) * sstep(0.4, 0.9, ray)
        E = E * (1 - cr) + cr * 0.5
    an = R['antler']
    if (an > 0.01).any():
        H = H * (1 - an) + an * g(0.003) * sstep(0.35, 0.75, fbm(Pm * np.array([500, 160, 500], F), 3, 83))
        E = E * (1 - an) + an * 0.5
    return H, E, C


M.scales_extra = scales_extra


# ---------- paint ----------
K = {
    'blue': M.hexc(0x2F6FE0), 'blueDk': M.hexc(0x2253B8), 'blueLt': M.hexc(0x5A9AF2),
    'purple': M.hexc(0x7A3CC8), 'purpleLt': M.hexc(0x9A62E0),
    'pink': M.hexc(0xF28CC4), 'pinkDk': M.hexc(0xD8689F), 'pinkLt': M.hexc(0xF8B4DA),
    'mane': M.hexc(0x3B2FA0), 'maneTip': M.hexc(0x7A48D0), 'spine': M.hexc(0x3440B0), 'spineTip': M.hexc(0x8C5ADA),
    'antler': M.hexc(0xF2C8E4), 'antlerTip': M.hexc(0xC6B4F2), 'claw': M.hexc(0xF0E4CE), 'clawTip': M.hexc(0xFFF6EA),
    'nose': M.hexc(0xE070A8), 'lip': M.hexc(0xF6A6D0), 'ball': M.hexc(0x141010), 'foot': M.hexc(0xB878D0),
}


def paint(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    th = R['th']
    # the angle round from the top: the section's on the body and head, the surface's own on the legs
    tl = np.arccos(np.clip(Nm[:, 1], -1, 1))
    th = th * (1 - R['leg']) + tl * R['leg']
    j = M.jit(C)
    col = M.mix(M.tile(K['blue'], n), K['blueDk'], sstep(0.5, 0.0, th) * 0.35)
    col = M.mix(col, K['purple'], sstep(0.98, 1.3, th))
    col = M.mix(col, K['pink'], sstep(1.86, 2.16, th))
    # each scale its own a little (a lighter sheen in the middle of some, the color shifting a touch)
    col = M.mix(col, M.mix(M.mix(M.tile(K['blueLt'], n), K['purpleLt'], sstep(0.98, 1.3, th)), K['pinkLt'], sstep(1.86, 2.16, th)), 0.35 * j * (1 - R['extra']))
    # the belly bands: the free edge of each a deeper pink
    col = M.mix(col, K['pinkDk'], R['bands'] * sstep(0.12, 0.0, E) * 0.5)
    # lips and nose pads pinker; the lower legs and feet purple-pink, the soles pink
    col = M.mix(col, K['lip'], R['lip'] * 0.6)
    npd = np.linalg.norm((Pm - G(0.045, 0.645, 2.715)) / G(0.05, 0.04, 0.055), axis=1)
    col = M.mix(col, K['nose'], sstep(1.1, 0.7, npd) * 0.6)
    low = R['leg'] * sstep(g(0.17), g(0.08), y)
    col = M.mix(col, M.mix(M.tile(K['foot'], n), K['pink'], sstep(-0.2, -0.7, Nm[:, 1])), low * 0.85)
    # the mane, beard and tufts: deep blue going violet toward their tips
    tip = sstep(0.0, g(0.16), c['body'])
    hc = M.mix(M.tile(K['mane'], n), K['maneTip'], tip)
    hc = hc * (0.82 + 0.3 * fbm(Pm * np.array([700, 700, 90], F), 2, 84))[:, None]
    col = M.mix(col, hc, R['hair'])
    # the crest's spines: deep blue at the root, violet at the tips, the rays darker
    ctip = sstep(0.0, g(0.08), c['body'])
    sc = M.mix(M.tile(K['spine'], n), K['spineTip'], ctip)
    col = M.mix(col, sc, R['crest'])
    # the antlers: pale pink at the burr going lavender toward the tips
    at = np.clip(np.linalg.norm(Pm - A0, axis=1) / g(0.5), 0, 1)
    acol = M.mix(M.tile(K['antler'], n), K['antlerTip'], sstep(0.15, 0.95, at))
    acol = acol * (0.86 + 0.18 * fbm(Pm * np.array([400, 140, 400], F), 2, 85))[:, None]
    col = M.mix(col, acol, R['antler'])
    # grooves between the scales darker, the scales' middles a little lighter
    sk = 1 - R['extra']
    col = col * (1 - sk[:, None] * (0.3 - 0.3 * sstep(0.0, 0.2, E))[:, None])
    col *= (0.97 + 0.06 * fbm(Pm * 60, 2, 86))[:, None]
    cc = M.mix(M.tile(K['claw'], n), K['clawTip'], sstep(g(0.03), g(0.004), y) * 0.6)
    col = M.mix(col, cc, R['claw'])
    col = M.mix(col, K['ball'], R['ball'])
    col = M.openings(col, R)
    rough = 0.36 + 0.2 * (1 - sstep(0.0, 0.2, E)) + 0.08 * R['bands'] + 0.25 * R['hair'] + 0.18 * R['antler'] + 0.1 * R['crest']
    rough = rough - 0.1 * R['claw'] - 0.25 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.15, 0.95).astype(F)


M.paint = paint


def baby_offset(P, N, c):
    """the baby's own shape: antler buds (the antlers drawn down toward their burrs), a short mane, beard, tufts and
    tail tuft (each pulled most of the way back to the skin), a low crest"""
    Pm = M.mirror(P)
    sg = np.where(P[:, 0] < 0, -1.0, 1.0).astype(F)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    out = np.zeros_like(P)
    bd = c['body']
    # (a generous reach: the game mesh's vertices at a lock's or a tine's tip lie a few cm off the sculpt, and one
    # left out would stretch into a long spike)
    on = lambda k: sstep(g(0.04), g(0.015), c[k]) * sstep(-g(0.01), g(0.01), bd - c[k])
    ka = on('antler')
    d = (A0 - Pm) * 0.8
    d[:, 0] *= sg
    out += d * ka[:, None]
    kc = on('crest')
    out[:, 1] -= kc * np.maximum(y - M.iz(z, 1), 0) * 0.6
    kh = np.maximum.reduce([on('mane'), on('beard'), on('tuft'), on('elbows')])
    yc = M.iz(z, 2)
    Dv = np.stack([x, y - yc, np.zeros_like(z)], 1)
    L = np.maximum(np.linalg.norm(Dv, axis=1, keepdims=True), 1e-6)
    pull = -(Dv / L) * np.maximum(bd, 0)[:, None] * 0.6
    pull[:, 0] *= sg
    # (the tail tuft and the locks also come in along the body)
    pull[:, 2] += np.where(z < g(-2.9), (g(-3.1) - z) * 0.55, 0.0)
    out += pull * kh[:, None]
    return out.astype(F)


M.baby_offset = baby_offset
M.MAP_QUALITY = (62, 48)
M.EYE_META = dict(iris=0xE8B020, irisR=0.86, pupilR=0.42, rim=0x3A1A08)
M.TINT = dict(tint=[1.0, 1.0, 1.0], babyTint=[1.0, 1.0, 1.0], rim=[0.05, 0.04, 0.08], flat=0x7A3CC8)
M.COLLAR = {'at': ['neck1', 'neck2', 0.5], 'r': 0.9, 'maxR': g(0.2)}
M.PREVIEW = {k: (tuple(G(*p)), tuple(G(*t)), f) for k, (p, t, f) in {
    'side': ((8.5, 0.7, -0.3), (0, 0.55, -0.3), 42), 'front3q': ((3.2, 1.6, 4.6), (0, 0.55, 1.2), 36),
    'head3q': ((1.1, 0.95, 3.6), (0, 0.66, 2.3), 30), 'top': ((0.01, 9.0, -0.3), (0, 0.5, -0.3), 42),
    'feet': ((1.0, 0.3, 2.3), (0.2, 0.1, 1.6), 30), 'rear3q': ((-3.0, 1.6, -5.5), (0, 0.5, -1.5), 40),
}.items()}


_meta0 = M.meta


def meta(st):
    """the template's, and the belly under the hips (for lying down)"""
    m = _meta0(st)
    m['belly'] = [0.0, g(0.272), 0.0]
    return m


M.meta = meta
LK.install(globals(), M, KS)
