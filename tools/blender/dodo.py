# round 17: dodo (the boy), on the hen's skeleton at 1.5 of her size with shorter legs (refit.py: chicken.py runs in a
# private copy, C; DROP 0.04 between YA 0.02 and YB 0.12 brings the body down over the feet, the same numbers as
# dropBird in the game's SPEC.dodo; the shapes and paints here are in the hen's units before that). Its own: a huge,
# round, heavy body, highest at the rump, the thighs hidden in the belly feathers; a short thick neck; a big head with
# bare skin round the eye and the base of the bill; the huge bill: long and deep, a hooked, swollen tip on the upper
# mandible, a ridged base; tiny wings (the game's short pale wing feathers on a small arm); a rounded rump for the
# tail tuft (the game's curly pale tail feathers); stout, short, thick-scaled legs with four thick toes and dark claws.
# Blue-gray plumage, darker on the back and the head, pale gray to whitish below; grayish-olive bare face; the bill pale
# yellow-green with a dark hook and a black-edged pale base; yellow legs. The girl is the same, a little smaller. The
# chick: gray down.
# Make it with: VOXEL=0.003 TRIS=6200 TEX=768 BLENDER_PY=... python3 tools/blender/make.py dodo
import sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, round_cone, chain, loft, fbm, vnoise, worley, length
import bird as B
from bird import local, local_n, mirror, groove, hexc, mix
import refit

ID = 'dodo'
KS = 1.5
DROP, YA, YB = 0.04, 0.02, 0.12
_M = sys.modules[__name__]
C = refit.load('chicken', ID + '_base')

# ---------- shape (hen units, before the leg drop) ----------
C.BOUNDS = (V(-0.25, -0.001, -0.235), V(0.25, 0.46, 0.28))
C.PATCHES = [(V(0.0, 0.36, 0.1), V(0.045, 0.45, 0.27), 0.0008), (V(0.0, -0.001, -0.045), V(0.1, 0.016, 0.085), 0.0006)]
C.EYE_C = V(0.0242, 0.4185, 0.131)
C.EYE_R = 0.0052
C.EYE_DIR = nrm([0.93, 0.14, 0.34])
C.EYE_UP = nrm(np.array([0, 1, 0], F) - C.EYE_DIR * C.EYE_DIR[1])
C.EYE_SIDE = np.cross(C.EYE_UP, C.EYE_DIR)
C.LID_R = 0.0041
C.MOUTH = V(0.0, 0.369, 0.262)
C.NOSTRIL = V(0.0115, 0.418, 0.182)
C.SH, C.EL, C.WR, C.WT = V(0.075, 0.3, 0.045), V(0.1118, 0.3, 0.045), V(0.1578, 0.3, 0.045), V(0.1923, 0.3, 0.045)
C.ARM_BOX = (V(0.03, 0.27, 0.0), V(0.24, 0.33, 0.09))
C.TOES = [dict(a=-30, len=0.05, r=0.0072, r1=0.0048, claw=0.012, n=3), dict(a=0, len=0.06, r=0.0078, r1=0.005, claw=0.013, n=4),
          dict(a=30, len=0.048, r=0.0072, r1=0.0048, claw=0.012, n=4), dict(a=180, len=0.026, r=0.006, r1=0.004, claw=0.01, lift=0.004, n=2, hind=True)]
TRUNK = [
    (-0.212, 0.332, 0.312, 0.288, 0.02, 2.0, 2.0),
    (-0.192, 0.358, 0.302, 0.236, 0.066, 2.1, 2.0),
    (-0.152, 0.372, 0.286, 0.19, 0.1, 2.2, 2.1),
    (-0.092, 0.374, 0.27, 0.16, 0.12, 2.3, 2.2),
    (-0.022, 0.366, 0.262, 0.15, 0.125, 2.3, 2.3),
    (0.038, 0.352, 0.262, 0.155, 0.118, 2.3, 2.3),
    (0.083, 0.342, 0.27, 0.175, 0.1, 2.2, 2.2),
    (0.113, 0.336, 0.283, 0.21, 0.075, 2.1, 2.1),
    (0.13, 0.334, 0.3, 0.255, 0.045, 2.0, 2.0),
    (0.138, 0.332, 0.31, 0.29, 0.02, 2.0, 2.0),
]
UPPER = [
    (0.142, 0.428, 0.41, 0.398, 0.0175, 2.2, 2.4),
    (0.165, 0.4305, 0.41, 0.397, 0.016, 2.2, 2.6),
    (0.19, 0.4275, 0.408, 0.396, 0.0138, 2.1, 2.6),
    (0.212, 0.4205, 0.403, 0.394, 0.0118, 2.1, 2.5),
    (0.232, 0.412, 0.396, 0.389, 0.0104, 2.0, 2.3),
    (0.246, 0.4025, 0.387, 0.38, 0.0092, 2.0, 2.1),
    (0.255, 0.391, 0.378, 0.371, 0.0076, 2.0, 2.0),
    (0.2605, 0.38, 0.37, 0.3635, 0.0058, 2.0, 2.0),
    (0.2625, 0.3705, 0.364, 0.3585, 0.004, 2.0, 2.0),
]
LOWER = [
    (0.144, 0.398, 0.39, 0.3805, 0.0155, 2.2, 2.2),
    (0.17, 0.397, 0.39, 0.3825, 0.0138, 2.2, 2.2),
    (0.2, 0.396, 0.39, 0.385, 0.011, 2.1, 2.1),
    (0.225, 0.394, 0.39, 0.387, 0.0082, 2.0, 2.0),
    (0.242, 0.391, 0.388, 0.3862, 0.0055, 2.0, 2.0),
]
TOM = [(0.144, 0.398), (0.17, 0.397), (0.2, 0.396), (0.225, 0.394), (0.242, 0.391), (0.252, 0.384), (0.26, 0.372)]


def _tom(z):
    return np.interp(z, [t[0] for t in TOM], [t[1] for t in TOM]).astype(F)


def trunk(P):
    """the huge round body, highest at the rump, a full low breast, the thighs hidden in the belly feathers"""
    Q = mirror(P)
    d = loft(Q, TRUNK)
    d = smin(d, ellipsoid(Q, V(0, 0.252, 0.06), V(0.105, 0.1, 0.085)), 0.04)          # full breast
    d = smin(d, ellipsoid(Q, V(0, 0.34, -0.185), V(0.05, 0.04, 0.04)), 0.03)          # the rump under the tail tuft
    d = smin(d, ellipsoid(Q, V(0, 0.175, -0.03), V(0.09, 0.04, 0.1)), 0.04)           # the belly over the legs
    return d


def neck(P):
    Q = mirror(P)
    d = chain(Q, [V(0, 0.3, 0.07), V(0, 0.35, 0.098), V(0, 0.388, 0.112), V(0, 0.405, 0.115)], [0.07, 0.048, 0.036, 0.032], 0.02)
    # a ruff of loose feathers round the neck
    return smin(d, ellipsoid(Q, V(0, 0.335, 0.085), V(0.065, 0.045, 0.055)), 0.025)


def head(P):
    Q = mirror(P)
    d = ellipsoid(Q, V(0, 0.415, 0.118), V(0.027, 0.028, 0.034))
    d = smin(d, ellipsoid(Q, V(0, 0.41, 0.14), V(0.022, 0.023, 0.02)), 0.01)        # the face into the bill
    d = smin(d, ellipsoid(Q, V(0, 0.392, 0.128), V(0.019, 0.016, 0.026)), 0.01)     # the throat under the bill
    return d


def beak(P):
    """the huge bill: the upper mandible long and deep with a swollen hook at its tip, the lower one tucked in under
    it; a raised rim round the base, the long nostril slit"""
    Q = mirror(P)
    y, z = Q[:, 1], Q[:, 2]
    d = smin(loft(Q, UPPER), loft(Q, LOWER), 0.0015)
    yt = _tom(z)
    d = d + groove(y - yt, 0.0005, 0.0007) * sstep(0.148, 0.156, z) * sstep(0.258, 0.25, z)
    d = d - 0.0012 * sstep(0.0035, 0.0, np.abs(z - 0.149)) * sstep(0.385, 0.39, y)              # the ridged base
    d = d - 0.001 * sstep(0.236, 0.25, z) * sstep(0.395, 0.405, y)                                 # the swollen hook
    nl = (Q - C.NOSTRIL) * V(1.4, 1.6, 0.2)
    return d + 0.0012 * np.exp(-(length(nl) / 0.0016) ** 2)


def drum(P):
    """the short feathered thigh, mostly in the belly"""
    Q = mirror(P)
    return round_cone(Q, V(0.045, 0.2, 0.012), V(0.047, 0.13, 0.008), 0.04, 0.024)


def tarsus(P):
    """the stout, thick-scaled tarsus"""
    Q = mirror(P)
    j = round_cone(Q, V(0.046, 0.13, 0.006), C.HMETA + V(0, -0.002, 0.0), 0.0135, 0.0118)
    t = B.flat_cone(Q, C.HMETA + V(0, -0.002, 0.0), C.HPAW + V(0, 0.005, -0.002), 0.0105, 0.0095, 0.85, up=(1, 0, 0))
    pad = ellipsoid(Q, C.HPAW + V(0, -0.0006, 0.002), V(0.0125, 0.0075, 0.014))
    return smin(smin(j, t, 0.006), pad, 0.005)


def arm(P):
    """the tiny wing's arm, hidden under its few feathers"""
    Q = mirror(P)
    return B.wing_arm(Q, [C.SH + V(-0.012, -0.004, -0.004), C.EL, C.WR, C.WT], [0.026, 0.022, 0.016, 0.006], [0.009, 0.0075, 0.0058, 0.0024], lead=0.62)


C.trunk, C.neck, C.head, C.beak, C.drum, C.tarsus, C.arm = trunk, neck, head, beak, drum, tarsus, arm
C.comb = C.wattles = lambda P: np.full(len(P), 1.0, F)
C.HEAD_BOX = (V(-0.05, 0.35, 0.07), V(0.05, 0.455, 0.272))
C.NECK_BOX = (V(-0.11, 0.24, 0.0), V(0.11, 0.43, 0.16))
C.EYE_BOX = (V(-0.035, 0.405, 0.118), V(0.035, 0.432, 0.146))
C.LEG_BOX = (V(-0.09, -0.002, -0.045), V(0.09, 0.215, 0.085))


def shape(P):
    d = local(P, (-0.14, 0.11, -0.235), (0.14, 0.4, 0.16), trunk)
    d = smin(d, local(P, *C.NECK_BOX, neck), 0.03)
    h = local(P, *C.HEAD_BOX, head)
    ca, li, ba = local_n(P, *C.EYE_BOX, C.eye_parts, 3)
    h = smin(h, li, 0.003)
    h = smax(h, -ca, 0.0008)
    h = smin(h, ba, 0.0004)
    h = smin(h, local(P, *C.HEAD_BOX, beak), 0.004)
    d = smin(d, h, 0.015)
    lg = smin(local(P, *C.LEG_BOX, drum), local(P, *C.LEG_BOX, tarsus), 0.008)
    ft, cl = local_n(P, *C.LEG_BOX, C.feet, 2)
    lg = smin(lg, smin(ft, cl, 0.0008), 0.004)
    d = smin(d, lg, 0.02)
    return smin(d, local(mirror(P), *C.ARM_BOX, arm), 0.012)


def grid(h):
    lo, hi = C.BOUNDS
    xs = B.axis_steps(0.0, hi[0], [(0.0, 0.14, h * 0.8)], h)
    ys = B.axis_steps(lo[1], hi[1], [(lo[1], 0.018, h * 0.35), (0.018, 0.12, h * 0.6), (0.36, 0.45, h * 0.5)], h)
    zs = B.axis_steps(lo[2], hi[2], [(-0.05, 0.08, h * 0.6), (0.1, 0.27, h * 0.5)], h)
    return xs, ys, zs


C.shape, C.grid = shape, grid


# ---------- skinning ----------
def _spine_u(P):
    y, z = P[:, 1], P[:, 2]
    ut = 1.5 + np.clip((z + 0.17) / 0.03, -1, 0)
    un = np.interp(y, [0.3, 0.33, 0.36, 0.4, 0.45], [1.5, 2.0, 3.0, 4.0, 5.0]).astype(F)
    yn = y - 0.33 - 0.9 * np.maximum(0, 0.09 - z)
    k = sstep(0.0, 0.03, yn)
    return (ut * (1 - k) + un * k).astype(F)


C._spine_u = _spine_u
C.WCFG = dict(C.WCFG, groups=[('body', ['trunk', 'neck']), ('head', ['head', 'bill', 'lids']), ('drum', ['drum']), ('tarsus', ['tarsus']),
                              ('foot', ['toes', 'claws']), ('arm', ['arm'])], spine_u=_spine_u, arm=(C.SH, C.EL, C.WR, C.WT), arm_root=(0.095, 0.075))
_bt0 = C.bone_tips


def bone_tips(P):
    t = _bt0(P)
    t['tail'] = V(0, 0.36, -0.21)
    for s, sg in (('L', 1), ('R', -1)):
        t['whand' + s] = C.WT * V(sg, 1, 1)
    return t


C.bone_tips = bone_tips


# ---------- plumage (hen units) ----------
K = {
    'gray': hexc(0x767C86), 'grayHi': hexc(0x8A909A), 'grayDk': hexc(0x5A606A), 'pale': hexc(0xB4B6B4), 'head': hexc(0x5C6068),
    'skin': hexc(0x9A9886), 'skinDk': hexc(0x7A7868), 'bill': hexc(0xCACA92), 'billHi': hexc(0xDCDAA8), 'hook': hexc(0x3A3A30),
    'base': hexc(0x1E1E1C), 'nostril': hexc(0x4A4A3A), 'leg': hexc(0xD8B23A), 'legDk': hexc(0xA88424), 'claw': hexc(0x3A3428), 'lid': hexc(0x7A7868),
}


def _face(Pm, R):
    """the bare skin round the eye and forward to the base of the bill"""
    d1 = np.linalg.norm((Pm - (C.EYE_C + V(-0.002, -0.001, 0.003))) * V(0.7, 1.0, 0.7), axis=1)
    d2 = np.linalg.norm((Pm - V(0.013, 0.408, 0.142)) * V(0.8, 1.0, 1.3), axis=1)
    return np.clip(sstep(0.0115, 0.008, d1) + sstep(0.012, 0.008, d2), 0, 1) * np.clip(R['head'] + R['lids'], 0, 1)


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 30, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    mid = sstep(0.001, 0.004, np.abs(x)) * pl['cov']
    # blue-gray, darker on the back, pale gray to whitish below, each feather a shade different, soft scallops
    col = mix(np.tile(K['gray'], (n, 1)), K['grayHi'], (fid - 0.4) * 0.5)
    col = mix(col, K['grayDk'], sstep(0.2, 0.9, Nm[:, 1]) * 0.45)
    col = mix(col, K['pale'], sstep(-0.15, -0.75, Nm[:, 1]) * sstep(-0.16, -0.08, z) * 0.8)
    col = mix(col, col * 0.8, sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * 0.4 * mid)
    col = mix(col, K['head'], np.clip(R['head'] + R['lids'], 0, 1) * 0.7)
    col *= (0.94 + 0.12 * n1)[:, None]
    face = _face(Pm, R)
    col = mix(col, mix(np.tile(K['skin'], (n, 1)), K['skinDk'], sstep(0.4, 0.8, fbm(Pm * 600, 2, 31)) * 0.4), face)
    # the bill: pale yellow-green, the swollen hook dark, the ridged base edged black, the nostril slit
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (n, 1)), K['billHi'], sstep(0.3, 0.9, Nm[:, 1]) * 0.35)
    bcol = mix(bcol, K['hook'], sstep(0.232, 0.248, z) * sstep(0.37, 0.38, y + 0.3 * (z - 0.24)) * 0.95)
    bcol = mix(bcol, K['base'], sstep(0.0045, 0.0015, np.abs(z - 0.149)) * 0.9)
    bcol = mix(bcol, K['nostril'], sstep(0.0018, 0.0008, length((Pm - C.NOSTRIL) * V(1.4, 1.6, 0.2))))
    col = mix(col, bcol, bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    sc = B.scutes(Pm, V(0, 1, 0), 0.0055, 41)[1]
    col = mix(col, mix(np.tile(K['leg'], (n, 1)), K['legDk'], sc * 0.5), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.8)
    rough = 0.82 + 0.06 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.4, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    rough = np.where(face > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def detail(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    h = np.zeros(len(P), F)
    hd = np.clip(R['head'] + R['lids'], 0, 1)
    h += B.feather_height(pl, 0.04) * feath * (1 - 0.6 * hd)
    f1, _ = worley(Pm / 0.0009, 62)
    h -= 0.00003 * sstep(0.3, 0.0, f1) * _face(Pm, R)
    h -= 0.00002 * sstep(0.5, 1.0, np.sin(Pm[:, 2] / 0.0008)) * R['bill']
    h += C._leg_h(P, c, R) * 1.4
    return h


KB = {'down': hexc(0x8A8A8C), 'downLt': hexc(0xA4A4A6), 'bill': hexc(0x6A6A5E), 'leg': hexc(0xB8A070), 'claw': hexc(0x5A5244)}


def paint_baby(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    n = len(P)
    dn, tip = B.down(Pm, fl, Nm, 0.0024, 72)
    col = mix(np.tile(KB['down'], (n, 1)), KB['downLt'], tip * 0.4 + sstep(-0.3, -0.8, Nm[:, 1]) * 0.3)
    col *= (0.8 + 0.3 * dn)[:, None]
    col = mix(col, KB['bill'], R['bill'])
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, KB['leg'], lg)
    col = mix(col, KB['claw'], R['claws'])
    col = mix(col, KB['down'] * 0.6, R['lids'] * 0.7)
    rough = np.where(R['bill'] + lg > 0.5, 0.5, 0.93)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _baby_body(Q):
    """the chick in adult space: a round egg of down and a thick neck up to the head"""
    d = ellipsoid(Q, V(0, 0.26, -0.03), V(0.1, 0.1, 0.14))
    return smin(d, round_cone(Q, V(0, 0.31, 0.06), V(0, 0.4, 0.115), 0.05, 0.03), 0.04)


def baby_offset(P, N, c):
    return B.baby_shape(P, N, C._own(c), _baby_body, (V(0.045, 0.1, 0.008), V(0.045, 0.2, 0.01), 0.014, 1.25), C.SH + V(-0.02, -0.01, -0.01), (0.004, 0.005))


C.paint, C.detail, C.paint_baby, C.baby_offset = paint, detail, paint_baby, baby_offset
C.FUR = dict(len=0.04, n=6, lean=0.3, tile=0.0026, babyLen=1.0, babyLean=0.3, shade=0.9, babyOnly=True, quality=80)


def fur(P, N, c):
    return B.down_fur(P, c, C.FUR['len'], ['bill', 'tarsus', 'toes', 'claws', 'lids'],
                      {'head': 0.6, 'neck': 0.85, 'arm': 0.75, 'drum': 0.7}, (C.EYE_C, C.EYE_R), seed=72)


C.fur = fur
_meta0 = C.meta


def meta(st):
    m = _meta0(st)
    m['eye'].update({'iris': 0xE8DCA8, 'irisR': 0.85, 'pupilR': 0.42, 'rim': 0x5A4A20, 'babyIris': 0x2A2018, 'babyLidCol': 0x7A7A7C, 'lid': [0.78, -0.78, 0.12]})
    m.update({'flat': 0x767C86, 'rim': [0.12, 0.12, 0.12]})
    return m


C.meta = meta
C.stats = lambda P, N, c, col: {'lidCol': 0x8A8876}


# ---------- feather blades (atlas cells: 0 primaries, 1 secondaries, 2 coverts, 3 coverts, 5 the tail tuft) ----------
def _cells():
    F_ = B.FeatherCell
    gr, grL, pale, wh, sh = hexc(0x7A808A), hexc(0x9EA2A8), hexc(0xC8CAC8), hexc(0xE8E6DE), hexc(0x8A8C8E)

    def vn(c0, c1):
        def fn(s, t, side):
            return mix(np.tile(c0, (len(s), 1)), c1, sstep(0.5, 1.0, np.abs(s)) * 0.4 + sstep(0.6, 1.0, t) * 0.3)
        return fn

    def tuft(s, t, side):
        c = mix(np.tile(wh, (len(s), 1)), pale, sstep(0.5, 1.0, np.abs(s)) * 0.5)
        return mix(c, hexc(0xD8D2C0), sstep(0.3, 0.0, t) * 0.5)

    return [F_('round', vn(pale, wh), w=0.7, outer=0.7, tip=0.7, shaft=sh),
            F_('round', vn(grL, pale), w=0.76, outer=0.8, tip=0.7, shaft=sh),
            F_('round', vn(gr, grL), w=0.8, outer=0.85, tip=0.9, shaft=sh),
            F_('round', vn(gr, grL), w=0.8, outer=0.9, tip=1.1, shaft=sh),
            F_('round', vn(grL, pale), w=0.76, outer=0.85, tip=0.8, shaft=sh),
            F_('curl', tuft, w=0.6, outer=0.9, tip=0.8, shaft=hexc(0xC8C4B8)),
            F_('round', vn(gr, grL), w=0.78, outer=0.9, tip=0.9, shaft=sh),
            F_('round', vn(gr, grL), w=0.8, outer=0.9, tip=0.8, shaft=sh)]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0x8A8A8C), hexc(0x707072)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 8


C.FEATHER_ATLAS = dict(C.FEATHER_ATLAS, cells=_cells, baby=_baby_cells)
refit.api(globals(), C, KS, DROP, YA, YB)
