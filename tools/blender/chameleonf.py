# A female panther chameleon (round 12): the male's body (chameleon.py, the same mesh: BASE) with her own coat. Females
# are smaller (the game scales her to 0.82) and never show the male's bright greens, blues and reds: tan to peach and
# pink with darker rust-brown bars round the body, a faint pale stripe along the flank, brown rays from the eye turrets
# and brown bands along the tail. Only her color map and settings are her own (her hatchlings borrow the male's baby
# map, they look alike): run tools/blender/coat.py chameleonf after the chameleon. The game's color change (setTint)
# keeps working on her: it keeps her pattern by brightness, measured on her own map (chroma.lum).
import os
import numpy as np
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'chameleon.py')).read(), 'chameleon.py', 'exec'))
BASE = 'chameleon'
ID = 'chameleonf'

KF = {
    'tan': M.hexc(0xB88A68), 'tanLt': M.hexc(0xCA9E7A), 'peach': M.hexc(0xD68A6C), 'pink': M.hexc(0xCE766E), 'bar': M.hexc(0x683A2A),
    'barDk': M.hexc(0x4A2A20), 'stripe': M.hexc(0xE2CCB0), 'belly': M.hexc(0xD8B696), 'brown': M.hexc(0x7E4E36), 'lip': M.hexc(0xDEC4A8),
    'claw': M.hexc(0x6A5A4A), 'ball': M.hexc(0x141010),
}


def paint_f(P, N, c):
    H, E, C, R = M.scales(P, N, c)
    Pm, Nm = R['Pm'], R['Nm']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    j = M.jit(C)
    n1 = fbm(Pm * 70, 2, 81) - 0.5
    n3 = fbm(Pm * 25, 2, 86) - 0.5
    # tan, lighter along the back, granules a little uneven
    col = M.mix(M.tile(KF['tan'], n), KF['tanLt'], 0.22 * j + 0.3 * sstep(0.0, 0.7, Nm[:, 1]))
    # bars round the body (darker rust-brown, about 2.4 cm apart, as the male's), the pale bands between them peach to pink
    bar = 0.5 + 0.5 * np.cos(2 * np.pi * (C[:, 2] - 0.014) / 0.026 + n1 * 2.2 + n3 * 2.5)
    trunk = sstep(-0.075, -0.06, z) * sstep(0.064, 0.05, z) * (1 - R['leg'])
    top = sstep(M.iz(z, 1) - 0.004, M.iz(z, 1) - 0.014, y)
    col = M.mix(col, KF['peach'], sstep(0.45, 0.15, bar) * trunk * 0.55)
    col = M.mix(col, KF['pink'], sstep(0.3, 0.05, bar) * trunk * top * 0.45 * sstep(-0.25, 0.15, n3))
    col = M.mix(col, KF['bar'], sstep(0.58, 0.82, bar) * trunk * (0.5 + 0.35 * top))
    col = M.mix(col, KF['barDk'], sstep(0.86, 0.97, bar) * trunk * top * 0.45)
    # a faint pale stripe along the lower flank, from the corner of the mouth to the hips
    ys = _stripe_y(np.clip(z, -0.06, 0.06))
    sw = sstep(0.0034, 0.0016, np.abs(y - ys - n1 * 0.002)) * sstep(-0.064, -0.05, z) * sstep(0.09, 0.075, z) * (1 - R['leg'])
    col = M.mix(col, KF['stripe'], sw * 0.55)
    below = sstep(0.0, -0.004, y - ys) * sstep(-0.065, -0.05, z) * sstep(0.085, 0.07, z) * (1 - R['leg'])
    col = M.mix(col, KF['belly'], below * 0.6)
    col = M.mix(col, KF['stripe'], sstep(0.0018, 0.0008, x) * sstep(M.iz(z, 3) + 0.003, M.iz(z, 3) + 0.001, y) * sstep(-0.06, -0.05, z) * sstep(0.12, 0.1, z) * 0.7)
    # the head: brown rays from the eye back and down across the cheeks, the casque edges darker, pale lips
    head = sstep(M.Z_HEAD - 0.004, M.Z_HEAD + 0.004, z) * (1 - R['turret'])
    D = Pm - M.EYE_C
    ang = np.arctan2(D[:, 1], -D[:, 2])
    rad = np.hypot(D[:, 1], D[:, 2])
    st = 0.5 + 0.5 * np.cos(ang * 5.0 + 0.6)
    col = M.mix(col, KF['brown'], sstep(0.7, 0.85, st) * sstep(0.022, 0.006, rad) * sstep(0.004, 0.008, rad) * head * 0.7)
    col = M.mix(col, KF['peach'], sstep(0.003, 0.0, np.abs(z - 0.09) - 0.003) * sstep(0.084, 0.08, y) * head * 0.35)
    col = M.mix(col, KF['bar'], R['casque'] * sstep(0.5, 0.95, Nm[:, 1]) * 0.3)
    col = M.mix(col, KF['lip'], R['lip'] * 0.35)
    # the turret: tan with brown rays round the pupil, a dark ring at the hole
    tr = 0.5 + 0.5 * np.cos(R['turA'] * 7)
    col = M.mix(col, M.mix(M.tile(KF['tanLt'], n), KF['brown'], sstep(0.55, 0.8, tr) * 0.7), R['turret'])
    col = M.mix(col, KF['barDk'], R['turret'] * sstep(0.8, 0.95, R['turG']) * 0.7)
    # the tail: brown bands along its curve
    ts = R['tailS']
    tb = 0.5 + 0.5 * np.cos(2 * np.pi * ts * 9 + n1)
    col = M.mix(col, KF['bar'], sstep(0.5, 0.75, tb) * R['tail'] * 0.65)
    col = M.mix(col, KF['peach'], sstep(0.3, 0.1, tb) * R['tail'] * 0.35)
    # the legs: tan with small brown spots
    sp = sstep(0.0014, 0.0009, M.cells(C, 0.005, 82)[0]) * R['leg'] * (1 - R['toe'])
    col = M.mix(col, KF['brown'], sp * 0.6)
    col = M.mix(col, KF['stripe'], R['crest'] * 0.5)
    col = col * (0.74 + 0.26 * sstep(0.0, 0.22, E))[:, None]
    col *= (0.96 + 0.08 * fbm(Pm * 90, 2, 83))[:, None]
    col = M.mix(col, KF['claw'], R['claw'])
    col = M.mix(col, KF['ball'], R['ball'])
    rough = 0.6 + 0.12 * (1 - sstep(0.0, 0.2, E)) - 0.2 * R['claw'] - 0.3 * R['ball']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


M.paint = paint_f
_meta_m = M.meta


def _meta_f(st):
    m = _meta_m(st)
    m['eye']['lidCol'] = 0xA8805E
    m.update({'rim': [0.05, 0.035, 0.03], 'flat': 0xB89070})
    return m


M.meta = _meta_f
