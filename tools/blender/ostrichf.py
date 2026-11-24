# The ostrich hen (round 16): the boy's body (ostrich.py, the same mesh: BASE) with her own colors. Gray-brown body
# feathers with paler edges, dull grayish white wing and tail plumes, a grayer bare neck and legs (no breeding pink).
# Her own color map and feather atlas; her chicks borrow the boy's baby maps (they look alike). Her json says
# "look": "hen". The game makes her 0.9 of his size (SEX_LOOK). Run tools/blender/coat.py ostrichf after the ostrich.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'ostrich.py')).read(), 'ostrich.py', 'exec'))
BASE = 'ostrich'
ID = 'ostrichf'
# (no baby_paint(): her chicks use the boy's baby maps)

KH = {'body': hexc(0x645648), 'bodyDk': hexc(0x4A3E34), 'edge': hexc(0x8A7A68), 'plume': hexc(0xB0A698), 'skin': hexc(0x9C8478), 'skinPale': hexc(0x8C7C74),
      'down': hexc(0x7A706A), 'scute': hexc(0x907068)}


def paint(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 8, 3, 51)
    body, plume = _zones(Pm, R)
    col = mix(np.tile(KH['skin'], (len(P), 1)), KH['skinPale'], sstep(1.4, 2.0, y) * 0.6)
    dn = sstep(0.45, 0.75, fbm(Pm * 120, 2, 52)) * np.clip(R['neck'] + R['head'], 0, 1) * 0.5
    col = mix(col, KH['down'], dn)
    # gray-brown feathers with paler edges, darker on the back
    bc = mix(np.tile(KH['body'], (len(P), 1)), KH['bodyDk'], sstep(0.2, 0.8, Nm[:, 1]) * 0.4 + 0.25 * (n1 - 0.5))
    bc = mix(bc, KH['edge'], sstep(0.006, 0.0, pl['e']) * 0.55 * pl['cov'])
    bc = mix(bc, KH['plume'], plume * (0.8 + 0.2 * n1))
    col = mix(col, bc, body)
    fr = sstep(-0.01, 0.015, z - (HMETA[2] + (HPAW[2] - HMETA[2]) * sat((HMETA[1] - y) / (HMETA[1] - HPAW[1]))))
    col = mix(col, KH['scute'], np.clip(R['tarsus'] * fr + R['toes'] * sstep(0.02, 0.04, y), 0, 1) * 0.5)
    col = mix(col, K['claw'], R['claws'])
    bl = R['bill']
    bcol = mix(np.tile(K['bill'], (len(P), 1)), K['billTip'], sstep(0.57, 0.6, z) * 0.6 + sstep(0.4, 0.9, np.abs(Nm[:, 0])) * 0.2)
    col = mix(col, bcol, bl)
    col = mix(col, K['lash'], R['lids'] * 0.6)
    rough = 0.82 + 0.06 * (n1 - 0.5)
    rough = np.where(body < 0.5, 0.6, rough)
    rough = np.where(bl > 0.5, 0.42, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _cells():
    """the hen: dull grayish white plumes, gray-brown coverts"""
    F_ = B.FeatherCell
    w, w2, bk, bk2 = hexc(0xC8BEB2), hexc(0xA89C8E), hexc(0x7A6C5E), hexc(0x9A8A7A)

    def plume(s, t, side):
        return _vn(s, t, w, w2, 0.45)

    def cov(s, t, side):
        return _vn(s, t, bk, bk2, 0.5)

    return [F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xB0A698)),
            F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xB0A698)),
            F_('round', cov, w=0.85, outer=0.9, tip=0.9, shaft=hexc(0x5A4E42)),
            F_('round', cov, w=0.85, outer=0.9, tip=1.1, shaft=hexc(0x5A4E42)),
            F_('round', plume, w=0.86, outer=0.95, tip=1.0, shaft=hexc(0xB0A698)),
            F_('round', plume, w=0.9, outer=0.95, tip=1.1, shaft=hexc(0xB0A698)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.9, shaft=hexc(0x5A4E42)),
            F_('round', cov, w=0.8, outer=0.9, tip=0.8, shaft=hexc(0x5A4E42))]


FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells)
_meta_b = meta


def meta(st):
    m = _meta_b(st)
    m.update({'flat': 0x7A6C5E, 'look': 'hen'})
    return m
