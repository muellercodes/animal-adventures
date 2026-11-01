# An orange (ginger) mackerel tabby (round 7): the tabby's body (cat.py, the same mesh: BASE) and its stripe pattern in
# ginger: rust bars on a warm orange ground, a cream chin, throat and chest, a pale belly, a pink nose and amber eyes.
# Only its color maps and settings are its own: run tools/blender/coat.py orangecat after the cat.
import os
BREED = dict(ID='orangecat')
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))
BASE = 'cat'

KO = {
    'ground': hexc(0xD08840), 'warm': hexc(0xE2A35E), 'ticked': hexc(0xB8682C), 'stripe': hexc(0x93461A), 'stripeHi': hexc(0xAE5A26),
    'buff': hexc(0xF0D4A8), 'white': hexc(0xF7EEDE), 'nose': hexc(0xDC8C82), 'noseRim': hexc(0x8A4636), 'earIn': hexc(0xEDB4A4),
    'pad': hexc(0x9A5448), 'lid': hexc(0x5E3018),
}


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm, L = R['Pm'], R['L']
    M = _tabby(R, Pm, N)
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(KO['ground'], (len(P), 1))
    col = mix(col, KO['warm'], sstep(0.0, -0.6, N[:, 1]) * 0.5)
    col = mix(col, KO['ticked'], R['top'] * 0.4 * (1 - R['head'] * 0.5))
    col *= (0.93 + 0.14 * n1)[:, None]
    # cream chin, whisker pads, throat and chest; the pale mask reaches further up the chest than on the brown tabby
    chest = sstep(-0.1, -0.55, N[:, 1] - 0.5 * N[:, 2]) * sstep(0.1, 0.14, Pm[:, 2]) * (1 - R['head'])
    pale = np.clip(np.maximum(M['pale'], chest * 0.8), 0, 1)
    pal = mix(np.tile(KO['buff'], (len(P), 1)), KO['white'], np.clip(M['chin'] + M['pads'] * 0.7 + M['eyering'] * 0.4, 0, 1))
    col = mix(col, pal, pale)
    # rust stripes, softer than the brown tabby's black ones
    st = M['stripes'] * (1 - chest * 0.6)
    col = mix(col, KO['stripeHi'], sstep(0.05, 0.55, st) * 0.7)
    col = mix(col, KO['stripe'] * (0.88 + 0.24 * n2[:, None]), sstep(0.45, 0.95, st) * 0.75)
    col = mix(col, KO['ticked'], R['ear'] * (1 - R['earIn']) * 0.5)
    col = mix(col, KO['earIn'], R['ear'] * R['earIn'] * 0.85)
    nose = mix(np.tile(KO['nose'], (len(P), 1)), KO['noseRim'], sstep(0.4, 0.8, n2) * 0.15)
    col = mix(col, nose, R['nose'])
    col = mix(col, KO['noseRim'], R['phil'] * 0.4 + R['lip'] * 0.3)
    col = mix(col, KO['lid'], R['lid'])
    col = mix(col, KO['pad'], R['pad'] * R['paw'])
    s, tone = _strands(P, N, R)
    col *= (1 + s * 0.22 * (tone - 0.4) - 0.04 * (1 - s))[:, None]
    tick = s * sstep(0.18, 0.08, tone) * (1 - pale) * (1 - st) * (1 - R['ear'] * R['earIn'])
    col = mix(col, KO['stripe'], tick * 0.15)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.64 + 0.08 * (n2 - 0.5) - 0.25 * R['nose'] - 0.3 * R['lid']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens: a paler, creamier orange with clear fuzzy stripes"""
    R = _regions(P, N, c)
    Pm = R['Pm']
    M = _tabby(R, Pm, N)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    st = M['stripes']
    out = mix(col, hexc(0xE4AC70), 0.3 * (1 - keep) * (1 - st) * (1 - M['pale']))
    out = mix(out, hexc(0xA4501E), sstep(0.25, 0.75, st) * 0.4 * (1 - keep))
    return np.clip(out, 0, 1).astype(F)


_meta = meta


def meta(st):
    m = _meta(st)
    # warm amber eyes (kittens' are blue)
    m['eye'].update({'iris': 0xD4882A, 'rim': 0x6A3A10, 'babyLidCol': 0xA06A44})
    m.update({'flat': 0xD08A48})
    return m
