# A mallard hen (round 12): the drake's body (duck.py, the same mesh: BASE) with her own plumage. Mottled brown and buff
# all over (every feather a dark brown center inside a buff margin, smaller and streakier on the neck and the breast,
# paler on the belly), a dark crown, a dark stripe through the eye between the pale eyebrow and the paler buff cheeks, a
# pale throat, an orange bill with a dark saddle on top, orange legs and feet, and the drake's blue speculum with its
# black and white borders. Her own color map, feather atlas colors (the wing and the tail) and settings; her ducklings
# borrow the drake's baby maps (they look alike). Her json says "look": "hen", so the game leaves out the drake's two
# curled tail feathers. Run tools/blender/coat.py duckf after the duck.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'duck.py')).read(), 'duck.py', 'exec'))
BASE = 'duck'
ID = 'duckf'
# (no baby_paint(): her ducklings use the drake's baby maps)

KH = {
    'brn': hexc(0x8A6642), 'brnDk': hexc(0x3E2A1A), 'buff': hexc(0xCBA878), 'buffLt': hexc(0xD9BE94), 'belly': hexc(0xCDB08A),
    'crown': hexc(0x45301E), 'stripe': hexc(0x3A2A1C), 'face': hexc(0xC4A47A), 'throat': hexc(0xD8C29A), 'nape': hexc(0x5A4128),
    'cov': hexc(0x786250), 'covDk': hexc(0x5A4836), 'under': hexc(0xE6E2D8),
    'bill': hexc(0xE0882E), 'billLo': hexc(0xE69A3E), 'saddle': hexc(0x3A2C22), 'nail': hexc(0x2E2420), 'nostril': hexc(0x2A1E14),
    'leg': hexc(0xEE8A2C), 'legDk': hexc(0xB8551A), 'web': hexc(0xE47A26), 'claw': hexc(0x302A26), 'lid': hexc(0x2A2016),
}


def _stripe_y(z):
    """the eye stripe's middle line: from the base of the bill through the eye, a little lower behind it"""
    return EYE_C[1] + 0.1 * (z - EYE_C[2])


def _mottle(pl, cfa, rel, k_center, k_margin):
    """per feather: dark center (a broad streak along the shaft), buff margin round the tip and the sides, 0..1 each"""
    margin = sstep(0.2 * cfa, 0.07 * cfa, pl['e'])
    center = sstep(0.8, 0.42, rel) * sstep(0.05 * cfa, 0.22 * cfa, pl['e']) * k_center
    return center * pl['cov'], margin * pl['cov'] * k_margin


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    Z = _zones(Pm, Nm, R)
    n = len(P)
    n1 = fbm(Pm * 40, 3, 11)
    n2 = fbm(Pm * 160, 2, 12)
    fid = pl['id']
    cfa = np.maximum(pl['c'], 1e-4)
    rel = np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)
    hdz = np.clip(Z['green'], 0, 1)
    # the body: brown, a little darker and richer on the back, paler and plainer on the belly
    back = np.clip(np.maximum(Z['back'], Z['scap']) + Z['rump'], 0, 1)
    col = mix(np.tile(KH['brn'], (n, 1)), KH['buff'], 0.25 + 0.25 * (fid - 0.5))
    col = mix(col, KH['belly'], Z['belly'] * 0.6)
    col = mix(col, KH['brn'] * 0.85, back * 0.5)
    # mottling: dark centers and buff margins, bolder on the back and the flanks, small and streaky on the breast
    cen, mar = _mottle(pl, cfa, rel, 0.85 - 0.45 * Z['belly'] - 0.25 * Z['breast'], 0.75 - 0.3 * Z['belly'])
    col = mix(col, KH['buffLt'], mar * (1 - hdz))
    col = mix(col, KH['brnDk'], cen * (1 - hdz) * (1 - mar))
    # a second dark mark inside the bigger flank and back feathers (a buff notch splits the center)
    big = sstep(0.009, 0.014, cfa) * (1 - Z['belly'])
    notch = sstep(0.18, 0.05, np.abs(rel - 0.35)) * sstep(-0.55 * cfa, -0.35 * cfa, pl['a']) * sstep(-0.15 * cfa, -0.3 * cfa, pl['a'])
    col = mix(col, KH['buff'], notch * big * cen * 0.6)
    # under the tail: buff with dark spots
    col = mix(col, KH['buffLt'], Z['vent'] * 0.5)
    # the head and the upper neck: dark crown and nape, the eye stripe, a pale eyebrow, buff cheeks finely streaked, pale throat
    ys = _stripe_y(z)
    side = sstep(0.004, 0.01, x)
    crown = sstep(ys + 0.004, ys + 0.0095, y + 0.03 * sat(-Nm[:, 2] - 0.1) + 0.0025 * (n2 - 0.5)) * hdz
    stripe = sstep(0.0034, 0.0014, np.abs(y - ys + 0.0006 * (n2 - 0.5))) * sstep(0.13, 0.15, z) * side * hdz
    throat = sstep(0.37, 0.355, y) * sstep(0.004, -0.002, x - 0.012) * sstep(0.15, 0.17, z) * hdz
    nape = sstep(-0.2, -0.7, Nm[:, 2]) * hdz
    hcol = mix(np.tile(KH['face'], (n, 1)), KH['brn'], sstep(0.33, 0.3, y) * 0.35)
    hcen, hmar = _mottle(pl, cfa, rel * 1.6, 1.0, 0.4)
    hcol = mix(hcol, KH['brnDk'], hcen * 0.55 * (1 - throat))
    hcol = mix(hcol, KH['throat'], throat * 0.8)
    hcol = mix(hcol, KH['nape'], nape * 0.65)
    hcol = mix(hcol, KH['crown'] * (0.9 + 0.2 * n2)[:, None], crown)
    hcol = mix(hcol, KH['stripe'], stripe * (1 - crown))
    col = mix(col, hcol, hdz)
    # wing arm (spread wing): brown coverts above, white below
    acol = mix(np.tile(KH['cov'], (n, 1)), KH['covDk'], sstep(0.2 * cfa, 0.0, pl['e']) * 0.3)
    acol = mix(acol, KH['buff'], sstep(0.12 * cfa, 0.0, pl['e']) * 0.4)
    acol = mix(acol, KH['under'], sstep(0.1, -0.3, Nm[:, 1]))
    col = mix(col, acol, R['arm'])
    col = mix(col, KH['brn'] * 1.05, R['drum'] * 0.6)
    # feather by feather: brightness, shade under each tip
    shade = 1 - 0.07 * sstep(0.45 * cfa, 1.3 * cfa, -pl['a']) * pl['cov']
    col *= ((0.97 + 0.06 * fid) * (0.95 + 0.1 * n1) * shade)[:, None] * feath[:, None] + (1 - feath)[:, None]
    # bill: orange with a dark saddle over the middle of the upper mandible (blotchy edges), dark nail and nostrils
    yt = _tom_y(z)
    bl = R['bill']
    bcol = mix(np.tile(KH['bill'], (n, 1)), KH['billLo'], sstep(yt + 0.0005, yt - 0.0015, y) * 0.6)
    sad = sstep(0.0095, 0.006, x + 0.003 * (n2 - 0.5)) * sstep(0.198, 0.208, z) * sstep(0.252, 0.24, z + 0.006 * (n2 - 0.5)) * sstep(yt + 0.0025, yt + 0.005, y)
    bcol = mix(bcol, KH['saddle'], sad * 0.92)
    bcol = mix(bcol, KH['saddle'], sstep(0.62, 0.8, fbm(Pm * 1400, 2, 13)) * sstep(yt + 0.002, yt + 0.004, y) * sstep(0.2, 0.21, z) * 0.6)
    bcol = mix(bcol, KH['nostril'], sstep(0.0016, 0.0007, np.linalg.norm((Pm - NOSTRIL) * V(1, 1.4, 0.45), axis=1)))
    bcol = mix(bcol, KH['bill'] * 0.62, sstep(0.0011, 0.0003, np.abs(y - yt)) * 0.5)
    col = mix(col, bcol, bl)
    nl = sstep(0.0008, -0.0004, c['nail'])
    col = mix(col, KH['nail'], np.maximum(R['nail'], nl * bl))
    col = mix(col, KH['crown'], sstep(0.0012, 0.0, np.abs(c['bill'] - c['head'])) * sstep(0.18, 0.19, z) * 0.5)
    col = mix(col, KH['lid'], R['lids'] * 0.8)
    # legs and feet: orange, as the drake's
    lg = np.clip(R['tarsus'] + R['toes'] + R['web'], 0, 1)
    lcol = mix(np.tile(KH['leg'], (n, 1)), KH['web'], R['web'] * 0.6)
    lcol = mix(lcol, KH['legDk'], sstep(0.004, 0.0, y) * 0.35)
    col = mix(col, lcol, lg)
    col = mix(col, KH['claw'], R['claws'])
    rough = 0.82 + 0.06 * (n1 - 0.5)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.52, rough)
    rough = np.where(R['claws'] + R['nail'] > 0.5, 0.36, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _cells():
    F_ = B.FeatherCell
    sp_blue, sp_pur = hexc(0x2B3C9E), hexc(0x4A2E92)
    brn, brnDk, buff, buffLt = hexc(0x6E5236), hexc(0x3E2C1C), hexc(0xC4A478), hexc(0xD8C2A0)

    def prim(s, t, side):
        c = _vn(s, t, hexc(0x5C5246), hexc(0x463E35), 0.6)
        return mix(c, hexc(0x8C8274), sstep(0.3, 0.0, t) * 0.5)

    def sec(s, t, side):
        # the speculum: blue to purple, a black band and a white tip (the drake's, on a browner base)
        c = mix(np.tile(hexc(0x76685A), (len(s), 1)), sp_blue, sstep(0.34, 0.4, t))
        c = mix(c, sp_pur, sstep(0.4, 0.8, t) * (0.3 + 0.5 * sat(np.abs(s))) * sstep(0.84, 0.8, t))
        c = mix(c, hexc(0x0E0E12), sstep(0.8, 0.83, t))
        return mix(c, hexc(0xF4F3EF), sstep(0.89, 0.92, t))

    def gcov(s, t, side):
        # greater coverts: brown, a black band and a white bar (the speculum's front border)
        c = _vn(s, t, hexc(0x766452), hexc(0x5E4E3E), 0.4)
        c = mix(c, hexc(0x111113), sstep(0.62, 0.66, t))
        return mix(c, hexc(0xF4F3EF), sstep(0.74, 0.78, t))

    def lcov(s, t, side):
        c = _vn(s, t, hexc(0x766250), hexc(0xA48C6C), 0.7)
        return mix(c, hexc(0x5A4836), sstep(0.5, 0.0, np.abs(s)) * sstep(0.85, 0.4, t) * 0.4)

    def tert(s, t, side):
        # tertials: dark brown centers, wide buff margins
        c = _vn(s, t, brn, buff, 0.9)
        return mix(c, brnDk, sstep(0.45, 0.15, np.abs(s)) * sstep(0.92, 0.6, t) * 0.7)

    def tail(s, t, side):
        # tail feathers: pale brown mottled, whitish margins
        c = _vn(s, t, hexc(0x9A8466), hexc(0xE0D2B6), 1.0)
        c = mix(c, hexc(0x6A5640), sstep(0.5, 0.15, np.abs(s)) * sstep(0.55, 0.85, 0.5 + 0.5 * np.sin(t * 34 + s * 3)) * 0.5)
        return mix(c, hexc(0xE6DCC4), sstep(0.8, 0.97, t) * 0.7)

    def tcov(s, t, side):
        # uppertail coverts: dark brown with buff margins (no black curls on a hen)
        c = _vn(s, t, brn, buffLt, 0.95)
        return mix(c, brnDk, sstep(0.45, 0.12, np.abs(s)) * sstep(0.9, 0.5, t) * 0.75)

    def under(s, t, side):
        return _vn(s, t, hexc(0xE9E8E3), hexc(0xF7F6F2), 0.6)

    return [F_('flight', prim, w=0.64, outer=0.5, tip=0.42, shaft=hexc(0x2E2A26), notch=0.0),
            F_('round', sec, w=0.74, outer=0.8, tip=0.4, shaft=hexc(0x3A3530)),
            F_('round', gcov, w=0.8, outer=0.85, tip=0.75, shaft=hexc(0x5A4E42)),
            F_('round', lcov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x6A5A48)),
            F_('round', tert, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0x3A2C20)),
            F_('round', tail, w=0.66, outer=0.85, tip=0.55, shaft=hexc(0xC8BCA4)),
            F_('round', tcov, w=0.7, outer=0.9, tip=0.8, shaft=hexc(0x4A3826)),
            F_('round', under, w=0.8, outer=0.9, tip=0.6, shaft=hexc(0xD8D6D0))]


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells)
_meta_d = meta


def meta(st):
    m = _meta_d(st)
    # her own lid color (from her face), a browner far color; "look": "hen" (the game's duck spec: no curled tail feathers)
    m.update({'flat': 0x8C7050, 'rim': [0.1, 0.08, 0.06], 'look': 'hen'})
    return m
