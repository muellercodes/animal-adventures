# A calico cat (round 7): the tabby's body (cat.py, the same mesh: BASE) in white with big patches of orange and black
# (patches with crisp edges, not stripes), green eyes. White on the belly, chest, throat, chin and muzzle, a blaze up
# the face and white legs and paws; the colored patches lie over the back, the head and the tail, different on each
# side like a real calico's (SIDES: the color maps hold both sides, the game picks the half by the side of the body).
# Only its color maps and settings are its own: run tools/blender/coat.py calico after the cat.
import os
BREED = dict(ID='calico')
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))
BASE = 'cat'
SIDES = True

KC = {
    'white': hexc(0xF2EEE6), 'shade': hexc(0xDCD6CC), 'orange': hexc(0xD48A44), 'orangeDk': hexc(0xB86A2C), 'black': hexc(0x221D1A),
    'blackHi': hexc(0x3A322C), 'nose': hexc(0xE0A096), 'noseRim': hexc(0x9A5A50), 'earIn': hexc(0xEDBDB0), 'pad': hexc(0xC88A84),
    'lid': hexc(0x2A1E18),
}


def _patches(R, Pm, N, P):
    """white (0..1) and, where it is not white, black (0) or orange (1); P are the points on their own side (the
    patches differ from side to side, the white areas are nearly the same)"""
    L = R['L']
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    s, u = L[:, 2], L[:, 1]
    hd, tl = R['head'], R['tail']
    up = np.clip(N[:, 1], -1, 1)
    w1 = fbm(Pm * 30, 3, 73) - 0.5
    # white underneath (belly, chest, throat), up the legs to the elbows and stifles, chin, muzzle and a blaze
    under = sstep(0.05 + 0.25 * w1, -0.3 + 0.25 * w1, up - 0.35 * sstep(0.08, 0.14, z) * (1 - hd)) * (1 - hd) * (1 - tl)
    legs = sstep(0.125 + 0.03 * w1, 0.095 + 0.03 * w1, y) * (1 - tl)
    muzzle = sstep(0.064, 0.072, s + 0.02 * w1) * hd + sstep(-0.012, -0.02, u) * hd
    blaze = sstep(0.0045 + 0.2 * np.clip(s - 0.03, 0, 1), 0.002 + 0.2 * np.clip(s - 0.03, 0, 1), x) * sstep(0.03, 0.045, s) * sstep(0.03, 0.015, u) * hd
    # a white saddle spot and white on the shoulder
    spot = sstep(0.62, 0.66, fbm(P * 9 + 4.0, 3, 74)) * (1 - hd) * (1 - tl)
    white = np.clip(np.maximum.reduce([under, legs, muzzle, blaze, spot]), 0, 1)
    # the colored patches: orange or black in big crisp-edged areas
    o = fbm(P * 7.0 + 1.7, 3, 71) - fbm(P * 7.0 - 3.1, 3, 72)
    orange = sstep(-0.02, 0.02, o + 0.12 * sstep(-0.06, -0.12, z) - 0.08 * hd)
    # the face: dark around each eye (black on one side, orange on the other, as it falls), the tail's tip half black
    eyes = sstep(0.022, 0.016, R['eyeD']) * hd
    orange = orange * (1 - eyes) + eyes * sstep(-0.01, 0.01, P[:, 0] + 0.0001 * w1)
    orange = np.where(tl > 0.5, orange * sstep(0.6, 0.5, R['tt']), orange)
    return white, orange


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    white, orange = _patches(R, Pm, N, P)
    org = mix(np.tile(KC['orange'], (len(P), 1)), KC['orangeDk'], R['top'] * 0.35 + 0.25 * (n1 - 0.5))
    blk = mix(np.tile(KC['black'], (len(P), 1)), KC['blackHi'], R['top'] * 0.3 * n1)
    col = mix(blk, org, orange)
    wht = mix(np.tile(KC['white'], (len(P), 1)), KC['shade'], sstep(0.2, -0.6, N[:, 1]) * 0.35)
    col = mix(col, wht, white)
    col *= (0.95 + 0.1 * n1)[:, None]
    col = mix(col, KC['earIn'], R['ear'] * R['earIn'] * 0.85)
    nose = mix(np.tile(KC['nose'], (len(P), 1)), KC['noseRim'], sstep(0.4, 0.8, n2) * 0.15)
    col = mix(col, nose, R['nose'])
    col = mix(col, KC['noseRim'], R['phil'] * 0.35 + R['lip'] * 0.25)
    col = mix(col, KC['lid'], R['lid'])
    col = mix(col, KC['pad'], R['pad'] * R['paw'])
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.2 * (tone - 0.4) - 0.04 * (1 - s))[:, None]
    col = mix(col, KC['blackHi'] * 1.4, s * (1 - white) * (1 - orange) * 0.25 * tone)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens: the same patches, softer, the white a little creamy"""
    R = _regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    white, orange = _patches(R, R['Pm'], N, P)
    out = mix(col, hexc(0xF0E8DA), white * 0.4 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


_meta = meta


def meta(st):
    m = _meta(st)
    # green eyes (kittens' are blue)
    m['eye'].update({'iris': 0x86A63A, 'rim': 0x3A4A10, 'babyLidCol': 0x8A7A70})
    m.update({'flat': 0xE6DED2})
    return m
