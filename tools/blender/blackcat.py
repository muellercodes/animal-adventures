# A black cat (round 7): the tabby's body (cat.py, the same mesh: BASE) with a solid black coat and yellow-gold eyes.
# Only its color maps, whisker strands and settings are its own: run tools/blender/coat.py blackcat after the cat.
# The coat must not read as a dark hole: a warm black, coat strokes with brownish tips that catch the light, a faint
# rusty cast along the back, and a glossier surface (roughK) so the shape shows in its highlights.
import os
BREED = dict(ID='blackcat')
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cat.py')).read(), 'cat.py', 'exec'))
BASE = 'cat'
OWN_HAIR = True

KB = {
    'coat': hexc(0x1A1816), 'rust': hexc(0x2E241D), 'belly': hexc(0x242120), 'sheen': hexc(0x5E5954), 'earIn': hexc(0x4C3A38),
    'nose': hexc(0x2A2224), 'lid': hexc(0x100C0A), 'pad': hexc(0x201A1A),
}


def paint(P, N, c):
    R = _regions(P, N, c)
    Pm = R['Pm']
    n1 = fbm(Pm * 25, 3, 11)
    n2 = fbm(Pm * 140, 3, 12)
    col = np.tile(KB['coat'], (len(P), 1)) * (0.9 + 0.2 * n1)[:, None]
    # a faint rusty cast along the back (black coats go brownish in the sun), a softer, browner belly
    col = mix(col, KB['rust'], R['top'] * (0.12 + 0.3 * n1))
    col = mix(col, KB['belly'], sstep(-0.4, -0.85, N[:, 1]) * 0.5)
    # inside the ears: dark skin with a few gray hairs
    col = mix(col, KB['earIn'], R['ear'] * R['earIn'] * 0.75)
    # bare parts: the nose leather, lid rims and pads all black
    col = mix(col, KB['nose'], R['nose'])
    col = mix(col, KB['lid'], R['lid'] + R['lip'] * 0.5 + R['phil'] * 0.5)
    col = mix(col, KB['pad'], R['pad'] * R['paw'])
    # coat hairs: the strokes' tips catch the light, so the coat and the shape of the face show
    s, tone = _strands(P, N, R)
    hair = s * (0.3 + 0.45 * tone) * (1 - R['nose']) * (1 - R['ear'] * R['earIn']) * (1 - R['lid'])
    col = mix(col, KB['sheen'], hair * 0.6)
    col = mix(col, K['ball'], R['ball'])
    rough = 0.5 + 0.08 * (n2 - 0.5) - 0.2 * R['nose']
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def baby_paint(P, N, c, col):
    """kittens: the same black, a little browner and fluffier (fuzzy brown tips)"""
    R = _regions(P, N, c)
    keep = np.clip(R['nose'] + R['ball'] + R['lid'] + R['lip'] + R['phil'] + R['pad'] * R['paw'] + R['ear'] * R['earIn'], 0, 1)
    n2 = fbm(R['Pm'] * 140, 3, 12)
    return np.clip(mix(col, hexc(0x2E2620) * (0.9 + 0.2 * n2[:, None]), 0.35 * (1 - keep)), 0, 1).astype(F)


_meta = meta


def meta(st):
    m = _meta(st)
    # yellow-gold eyes (kittens' are blue); a glossier coat: its sheen shows the shape
    m['eye'].update({'iris': 0xD8A21C, 'rim': 0x5A4008, 'lidCol': st['lidCol'], 'babyLidCol': 0x221C18})
    m.update({'roughK': 0.84, 'rim': [0.08, 0.08, 0.1], 'flat': 0x1E1A17})
    return m


def hair_texture():
    """dark whiskers (most black cats' are black, a few white), dark eyebrow whiskers"""
    import smallfur as SF
    wh = [(0.0, (0.1, 0.09, 0.08)), (0.7, (0.2, 0.18, 0.16)), (1.0, (0.45, 0.42, 0.4))]
    whd = [(0.0, (0.08, 0.07, 0.06)), (1.0, (0.3, 0.28, 0.26))]
    furn = [(0.0, (0.25, 0.22, 0.2)), (1.0, (0.4, 0.37, 0.34))]
    cols = [dict(kind='hair', stops=wh, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=whd, n=12, wid=1.8, end=(0.95, 1.0), wave=0.02, root=1.0),
            dict(kind='hair', stops=furn, n=40, wid=1.2, end=(0.5, 1.0), wave=0.1, root=0.05)]
    return SF.strand_texture((96, 128), cols, seed=29)
