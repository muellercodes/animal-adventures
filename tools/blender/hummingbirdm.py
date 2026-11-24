# round 16: a boy ruby-throated hummingbird: the girl's body (hummingbird.py, the same mesh: BASE) with his own plumage.
# The ruby throat (the gorget): scaly, glittering ruby red feathers from the chin down to a white collar, nearly black at
# the chin and at the edges (it looks black from some angles); darker green flanks; a dark forked tail. His json says
# "look": "m", so the game's hummingbird spec gives him the forked tail blades. His own color map, feather atlas and
# settings; his chicks borrow the girl's baby maps (chicks look alike). Run tools/blender/coat.py hummingbirdm after
# the hummingbird.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'hummingbird.py')).read(), 'hummingbird.py', 'exec'))
BASE = 'hummingbird'
ID = 'hummingbirdm'
_M = sys.modules[__name__]
# (no baby_paint(): his chicks use the girl's baby maps)

KM = {'ruby': hexc(0xB8102C), 'rubyHi': hexc(0xE0284A), 'rubyDk': hexc(0x3A0810), 'chin': hexc(0x141012), 'flank': hexc(0x6E8A60)}


def paint_m(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = C._plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 300, 3, 11)
    col, thr = _base(Pm, Nm, R, pl, n)
    col = mix(col, KM['flank'], sstep(0.3, 0.8, np.abs(Nm[:, 0])) * sstep(0.1, -0.5, Nm[:, 1]) * sstep(0.03, 0.0, z) * 0.5)
    # the gorget: each feather a bright ruby tip on a dark base (scales), darker toward the chin and the edges
    gor = thr * sstep(0.051, 0.055, y)
    cfa = np.maximum(pl['c'], 1e-4)
    tipk = sstep(-0.2 * cfa, 0.5 * cfa, pl['a'])
    rub = mix(np.tile(KM['ruby'], (n, 1)), KM['rubyHi'], tipk * 0.55 + sat(Nm[:, 2]) * 0.2)
    rub = mix(rub, KM['rubyDk'], sstep(0.3, 0.9, np.abs(Nm[:, 0])) * 0.55 + (1 - tipk) * 0.35)
    rub = mix(rub, KM['chin'], sstep(0.0685, 0.0705, y) * sstep(0.044, 0.047, z) + sstep(0.06, 0.0675, y) * sstep(0.034, 0.03, z) * 0.6)
    col = mix(col, rub, gor)
    col *= (0.95 + 0.1 * n1)[:, None]
    col, bl, lg = _bare(col, Pm, R, n)
    rough = 0.56 + 0.06 * (n1 - 0.5) - 0.12 * sstep(0.0, 0.8, Nm[:, 1]) * feath - 0.2 * gor
    rough = np.where(bl > 0.5, 0.3, rough)
    rough = np.where(lg > 0.5, 0.5, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


C.paint = paint_m
_meta_f = C.meta


def meta_m(st):
    m = _meta_f(st)
    m.update({'flat': 0x4E7A4C, 'look': 'm'})
    return m


C.meta = meta_m


def _tail_dark(s, t, side):
    c = mix(np.tile(hexc(0x2A2632), (len(s), 1)), hexc(0x18161C), sstep(0.0, -0.6, s) * 0.5)
    return mix(c, hexc(0x3A4A3C), sstep(0.4, 0.0, t) * 0.4)


def _cells_m():
    return cells(_tail_dark, _tail_dark)


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells_m)
