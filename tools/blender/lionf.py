# The lioness (round 12): the lion's girl, her own sculpt on the lion's skeleton (game/models/lionf.json, which the game
# uses for a girl lion, see SEX_LOOK in 00_core.js). Made at the lion's size (KS = 4.2, cat units as in lion.py); the
# game scales a lioness to 0.88 of the lion.
# She is the lion (lion.py, panthera.py) without the mane and with a lighter build: a slimmer neck, lighter shoulders and
# forelegs, a slimmer chest and a little smaller paws, a finer head (narrower and a little lower, the length kept, so the
# face reads long: _FineFrame) with ears that stand free and a little bigger. An even tawny coat, a paler throat, chest
# and belly, the faint spots a grown lioness keeps low on the belly and the legs, black ear backs, the black tuft at the
# end of the tail. Her cub is a plain lion cub: the cat's round little body (no mane to pull in), the lion cub's coat.
# Make it with: VOXEL=0.0092 TRIS=5000 TEX=768 BLENDER_PY=... python3 tools/blender/make.py lionf (the rig step does not
# apply: export the lion's rig as work/lionf-rig.json, python3 tools/blender/export_rig.py lion tools/blender/work/lionf-rig.json)
import numpy as np
from sdf import V, F, sstep, fbm, worley
import carnivore as CV
from carnivore import mix, hexc
import panthera as PT
import lion as LN

KS = LN.KS
ID = 'lionf'
# the head made finer: narrower about the head frame's middle (KX over the skull and the cheeks, KXM over the muzzle)
# and a little lower (KU), the length kept
KX, KXM, KU = 0.9, 0.95, 0.95


class _FineFrame(PT.DropFrame):
    """the lion's head frame (with the muzzle dropped) with every part placed in it narrower (by kx at the skull, kxm
    over the muzzle) and lower by ku"""
    def __init__(self, f, drop, kx, kxm, ku):
        super().__init__(f.o, f.a, f.u, *drop)
        self.kx, self.kxm, self.ku = kx, kxm, ku

    def _k(self, s):
        return self.kx + (self.kxm - self.kx) * sstep(0.048, 0.078, s)

    def loc(self, Q):
        L = super().loc(Q)
        L[:, 0] = L[:, 0] / self._k(L[:, 2])
        L[:, 1] = L[:, 1] / self.ku
        return L

    def pt(self, s, u, x=0.0):
        return super().pt(s, u * self.ku, x * float(self._k(np.float64(s))))


def _scale_rows(rows, ks, cols=(2, 3, 4)):
    """loft or sweep rows with their section sizes scaled (one factor per row)"""
    out = []
    for r, k in zip(rows, ks):
        r = list(r)
        for c in cols:
            r[c] = r[c] * k
        out.append(tuple(r))
    return out


T = {k: v for k, v in LN.T.items() if k not in ('FUR_X', 'extra', 'tail_tip', 'cub')}
T.update(
    HF=_FineFrame(LN.T['HF'], LN.T['DROP'], KX, KXM, KU), DROP=None,
    # a slimmer chest and shoulders (the half widths), the chest a little less deep in front
    TRUNK=[(z, top - 0.002 * sstep(0.0, 0.08, z), yw, bot + 0.003 * sstep(0.0, 0.06, z), hw * (0.96 - 0.04 * sstep(-0.03, 0.06, z)), e1, e2)
           for z, top, yw, bot, hw, e1, e2 in LN.T['TRUNK']],
    # the neck: no mane, a slimmer neck and throat
    NECK=_scale_rows(LN.T['NECK'], [0.97, 0.93, 0.92, 0.93, 0.95]),
    THROAT=[((0.0, 0.186, 0.148), (0.037, 0.039, 0.031), 0.019), ((0.0, 0.2, 0.11), (0.046, 0.048, 0.039), 0.023)],
    CHEEK=((0.022, -0.018, 0.042), (0.0096, 0.0118, 0.0175)),
    EYE_R=0.0072,
    # the ears stand free (no mane round them), a little closer and lower on the narrower skull
    EAR_B=V(0.0265, 0.2952, 0.1855), EAR_A=[0.5, 0.86, -0.1], EAR_L=0.0222, EAR_W=0.0175,
    SHOULDER=((0.032, 0.17, 0.108), (0.025, 0.228, 0.08), 0.021, 0.015),
    FORE_K=(1.45, 1.26), HIND_K=(1.38, 1.13),
    FLEG_X=[((0.04, 0.2, 0.118), (0.044, 0.115, 0.078), 0.03, 0.0205, 0.8, 0.02), ((0.04, 0.1, 0.086), (0.039, 0.05, 0.089), 0.0145, 0.011, 0.9, 0.012)],
    F_TOES=[tuple(v * 0.95 for v in t) for t in LN.T['F_TOES']], F_PAD=tuple(v * 0.95 for v in LN.T['F_PAD']),
    H_TOES=[tuple(v * 0.97 for v in t) for t in LN.T['H_TOES']], H_PAD=tuple(v * 0.97 for v in LN.T['H_PAD']),
    COL=dict(LN.T['COL'], ground=hexc(0xB88C52), back=hexc(0xA07A4A), cream=hexc(0xDAC6A0), ear=hexc(0x1E1712)),
    BACK_K=0.36,
)
C = PT.load(ID, T)
PT.setup(C)
_baby_offset0 = C.baby_offset


def fur_x(C_, P, N, c, ln):
    """the tuft at the end of the tail (the lion's)"""
    R = C._regions(P, N, c)
    tf = R['tail'] * sstep(0.8, 0.86, R['tt'])
    return ln * (1 - tf) + tf * 0.02


def tail_tip(C_, R, col):
    return mix(col, LN.MK['tuft'], R['tail'] * sstep(0.8, 0.86, R['tt']))


def _spots(P, R, seed):
    """round spots about 1 cm across (cat units), a little uneven"""
    warp = np.stack([fbm(P * 60 + k, 2, seed + k) for k in range(3)], 1) - 0.5
    f1, _ = worley(P / 0.011 + warp * 0.5, seed + 5)
    return sstep(0.36, 0.22, f1)


def pattern(C_, R, P, N, col, under):
    """a paler throat and chest; the faint spots a grown lioness keeps low on the belly and on the legs"""
    Pm = R['Pm']
    y, z = Pm[:, 1], Pm[:, 2]
    body = (1 - R['head']) * (1 - R['tail'])
    chest = sstep(0.1, 0.14, z) * sstep(-0.1, -0.55, N[:, 1] - 0.5 * N[:, 2]) * sstep(0.235, 0.2, y) * body
    col = mix(col, C.T['COL']['cream'], chest * 0.4)
    sp = _spots(P, R, 140)
    belly = sstep(-0.5, -0.85, N[:, 1]) * sstep(0.14, 0.11, y) * sstep(-0.13, -0.09, z) * sstep(0.09, 0.05, z)
    leg = sstep(0.13, 0.09, y) * sstep(0.025, 0.04, y) * sstep(0.1, -0.5, R['Nm'][:, 0])
    k = sp * np.clip(belly * 0.16 + leg * 0.11, 0, 0.16) * body
    return mix(col, hexc(0x8E6A44), k)


def cub(C_, R, P, N, col, keep, c):
    """the lion cub's coat (lion.py: cub() without the mane): woolly and grayer, faint dark spots on the legs and the
    belly fading on the flanks, a small dark tip to the tail"""
    Pm = R['Pm']
    M = C._tabby(R, Pm, N)
    pale = M['pale']
    out = mix(col, hexc(0x9C8264), 0.35 * (1 - keep) * (1 - pale))
    warp = np.stack([fbm(P * 60 + k, 2, 80 + k) for k in range(3)], 1) - 0.5
    f1, _ = worley(P / 0.011 + warp * 0.5, 82)
    y = Pm[:, 1]
    leg = sstep(0.15, 0.11, y) * sstep(0.02, 0.04, y) * (1 - R['tail'])
    belly = sstep(-0.3, -0.7, N[:, 1]) * (1 - R['head'])
    flank = (1 - R['head']) * (1 - R['tail']) * sstep(0.12, 0.16, y)
    sp = sstep(0.36, 0.22, f1) * np.clip(leg * 0.55 + belly * 0.5 + flank * 0.22, 0, 0.6)
    out = mix(out, hexc(0x5A4430), sp * (1 - keep))
    out = mix(out, hexc(0x3A2A1C), R['tail'] * sstep(0.88, 0.94, R['tt']) * 0.8)
    return out


T['FUR_X'], T['tail_tip'], T['pattern'], T['cub'] = fur_x, tail_tip, pattern, cub


def finish_baby(Cimg, ao, valid):
    # as the lion's cub: less of the sculpt's occlusion in the cub's coat
    return CV.finish(Cimg, ao, valid, 0.18)


C.finish_baby = finish_baby
PT.install(globals(), C, KS)
