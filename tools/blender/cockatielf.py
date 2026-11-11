# A female cockatiel (round 12, normal gray): the male's body (cockatiel.py, the same mesh: BASE) with her own plumage.
# Her face and crest are mostly gray with only a faint yellow wash, her orange cheek patch is duller, and the undersides
# of her tail and flight feathers are barred and spotted with pale yellow (the tail's outer feathers barred all along,
# pale yellow spots on the inner webs of the flight feathers, fine bars under the tail). Her own color map, feather atlas
# and settings; her chicks borrow the male's baby maps (they look alike). Run tools/blender/coat.py cockatielf after the
# cockatiel.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'cockatiel.py')).read(), 'cockatiel.py', 'exec'))
BASE = 'cockatiel'
ID = 'cockatielf'
_M = sys.modules[__name__]
# (no baby_paint(): her chicks use the male's baby maps)

KF = {'wash': hexc(0xA9A27A), 'washHi': hexc(0xB8AC74), 'cheek': hexc(0xC87A4C), 'bar': hexc(0xE6D486), 'gray': hexc(0x86847F)}


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    col = mix(np.tile(KF['gray'], (n, 1)), K['grayHi'], sstep(0.2, 0.9, Nm[:, 1]) * 0.22 + (fid - 0.5) * 0.12)
    col = mix(col, K['breast'], sstep(0.0, -0.6, Nm[:, 1]) * sstep(0.0, 0.06, z) * 0.6)
    col = mix(col, K['grayDk'], sstep(-0.2, -0.8, Nm[:, 1]) * sstep(0.0, -0.06, z) * 0.35)
    col = mix(col, K['grayDk'], sstep(0.45 * cfa, 1.2 * cfa, -pl['a']) * 0.22 * pl['cov'])
    col = mix(col, K['grayDk'], sstep(-0.1, -0.13, z) * sstep(0.2, 0.18, y) * 0.6)
    # under the tail: fine pale yellow bars across the feathers
    under = sstep(-0.08, -0.12, z) * sstep(0.21, 0.18, y) * sstep(0.0, -0.5, Nm[:, 1])
    bars = sstep(0.3, 0.8, np.sin(2 * np.pi * (pl['a'] / 0.0024) + pl['id'] * 6.0)) * sstep(0.0, 0.002, pl['e'])
    col = mix(col, KF['bar'], under * bars * 0.7)
    col *= (0.95 + 0.1 * n1)[:, None]
    # the face: the male's yellow area as only a faint wash on gray, a little stronger round the beak and the eye
    yel, cheek = _masks(Pm, Nm, R)
    near = sstep(0.11, 0.125, z) * sstep(0.35, 0.37, y)
    col = mix(col, KF['wash'], yel * (0.55 + 0.25 * near) * (0.85 + 0.3 * (fid - 0.5)))
    # a duller, smaller orange cheek patch with soft edges
    col = mix(col, KF['cheek'], sstep(0.15, 0.85, cheek) * 0.72)
    bl = R['bill']
    bcol = mix(np.tile(K['beak'], (n, 1)), K['beakDk'], sstep(0.136, 0.124, z) * 0.5 + sstep(0.15, 0.156, z) * 0.3)
    col = mix(col, bcol, bl)
    lg = np.clip(R['tarsus'] + R['toes'], 0, 1)
    col = mix(col, mix(np.tile(K['foot'], (n, 1)), K['footHi'], sstep(0.4, 0.9, fbm(Pm * 300, 2, 34)) * 0.4), lg)
    col = mix(col, K['claw'], R['claws'])
    col = mix(col, K['lid'], R['lids'] * 0.85)
    rough = 0.72 + 0.06 * (n1 - 0.5) - 0.08 * sstep(0.1, 0.8, Nm[:, 1]) * feath
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.6, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _cells():
    F_ = B.FeatherCell
    g, gd, gdd, wh, whd = hexc(0x8A8985), hexc(0x605F5C), hexc(0x484744), hexc(0xEEECE4), hexc(0xD2CFC6)
    pale, paleDk = hexc(0xE8D88E), hexc(0xCDBB6C)

    def spots(s, t, k):
        """round pale yellow spots in a row along the inner web (s < 0), about 7 along the feather"""
        u = (t * 7.0) % 1.0 - 0.5
        d = np.sqrt((u / 0.28) ** 2 + ((s + 0.48) / 0.3) ** 2)
        return sstep(1.0, 0.7, d) * sstep(0.12, 0.22, t) * sstep(0.88, 0.75, t) * (s < -0.05) * k

    def prim(s, t, side):
        c = mix(np.tile(gd, (len(s), 1)), gdd, sstep(0.1, -0.4, s) * 0.6)
        c = mix(c, gdd, sstep(0.6, 1.0, t) * 0.3)
        return mix(c, pale, spots(s, t, 0.85))

    def sec(s, t, side):
        c = mix(_vn(s, t, g, gd, 0.5), gd, sstep(0.0, -0.5, s) * 0.4)
        return mix(c, pale, spots(s, t, 0.6))

    def white(s, t, side):
        return mix(_vn(s, t, wh, whd, 0.4), g, sstep(0.25, 0.0, t) * 0.5)

    def cov(s, t, side):
        return _vn(s, t, g, gd, 0.4)

    def bars(s, t, k, n=9.0):
        """pale yellow bars across both webs, a little wavy, fading out at the base"""
        b = 0.5 + 0.5 * np.sin(2 * np.pi * (t * n + 0.08 * np.abs(s)))
        return sstep(0.45, 0.8, b) * sstep(0.12, 0.3, t) * k

    def tail(s, t, side):
        # the central pair: gray, faintly barred
        c = mix(_vn(s, t, gd, gdd, 0.4), gdd, sstep(0.5, 1.0, t) * 0.4)
        return mix(c, paleDk, bars(s, t, 0.3))

    def touter(s, t, side):
        # the outer tail feathers: barred pale yellow and gray all along
        c = mix(_vn(s, t, g, gd, 0.5), gd, sstep(0.6, 1.0, t) * 0.4)
        return mix(c, pale, bars(s, t, 0.85))

    def crest(s, t, side):
        # gray with a faint yellow wash at the base, darker toward the tip
        c = _vn(s, t, hexc(0x96938A), hexc(0x83817A), 0.4)
        c = mix(c, hexc(0xB4AA7A), sstep(0.5, 0.0, t) * 0.45)
        return mix(c, g * 0.85, sstep(0.55, 0.95, t) * 0.7)

    return [F_('flight', prim, w=0.55, outer=0.45, tip=0.25, shaft=hexc(0x2E2D2B)),
            F_('round', sec, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x3A3936)),
            F_('round', white, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0xC8C6C0)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.0, shaft=hexc(0x4A4946)),
            F_('flight', tail, w=0.5, outer=0.9, tip=0.25, shaft=hexc(0x2E2D2B)),
            F_('flight', touter, w=0.55, outer=0.9, tip=0.3, shaft=hexc(0x3A3936)),
            F_('flight', crest, w=0.42, outer=0.9, tip=0.3, shaft=hexc(0x8C8670)),
            F_('round', white, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0xC8C6C0))]


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells)
_meta_c = meta


def meta(st):
    m = _meta_c(st)
    m.update({'flat': 0x878580})
    return m
