# The peahen (round 16): the peacock's body (peafowl.py, the same mesh: BASE) with her own colors. Brown-gray all over
# with faint barring on the back and the wings, a metallic green lower neck and a bronzy breast, a brown crown, white
# stripes on her face and a white throat, a pale belly. Her own color map and feather atlas (brown primaries and tail,
# barred brown coverts, a small brown crest tipped green; the train cell is never used: she has no train). Her chicks
# borrow the peacock's baby maps. Her json says "look": "peahen" (the game's peafowl spec: no train, a smaller crest).
# Run tools/blender/coat.py peafowlf after the peafowl. (_paint_o: on the first rig's heights, see peafowl.py's last part)
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'peafowl.py')).read(), 'peafowl.py', 'exec'))
BASE = 'peafowl'
ID = 'peafowlf'
# (no baby_paint(): her chicks use the peacock's baby maps)

KH = {'brown': hexc(0x7E6A54), 'brownDk': hexc(0x5A4A3A), 'gray': hexc(0x8E8274), 'green': hexc(0x2C6A4A), 'greenHi': hexc(0x3E8A5E),
      'bronze': hexc(0x6A5A34), 'belly': hexc(0xE2D8C4), 'white': hexc(0xF0EEE8), 'crown': hexc(0x6A5640)}


def _paint_o(P, N, c):
    R, Pm, Nm, fl, sz, feath, pl = _plum(P, N, c)
    x, y, z = Pm[:, 0], Pm[:, 1], Pm[:, 2]
    n1 = fbm(Pm * 25, 3, 61)
    blue, back, wg, belly, thigh, face = _zones(Pm, Nm, R)
    cfa = np.maximum(pl['c'], 1e-4)
    # brown-gray body, faintly barred and edged paler, a pale belly
    col = mix(np.tile(KH['brown'], (len(P), 1)), KH['gray'], sstep(-0.2, 0.4, Nm[:, 1]) * 0.35 + 0.2 * (n1 - 0.5))
    col = mix(col, KH['brownDk'], sstep(0.45, 0.65, np.sin(pl['a'] / 0.005) * 0.5 + 0.5) * 0.35 * pl['cov'] * np.clip(back + wg, 0, 1))
    col = mix(col, KH['belly'], belly * sstep(0.5, 0.56, y))
    # the neck: brown crown and nape, metallic green lower neck, a bronzy breast
    nk = blue
    nc = mix(np.tile(KH['green'], (len(P), 1)), KH['greenHi'], sstep(0.2, 0.8, Nm[:, 1]) * 0.35)
    nc = mix(nc, KH['crown'], sstep(0.88, 0.95, y))
    nc = mix(nc, KH['bronze'], sstep(0.62, 0.56, y) * 0.7)
    col = mix(col, nc, nk)
    # the white throat and the face's white stripes
    th = sstep(0.0, 0.5, Nm[:, 2]) * sstep(0.94, 0.97, y) * sstep(0.985, 0.97, y) * np.clip(R['head'] + R['neck'], 0, 1)
    col = mix(col, KH['white'], np.clip(face + th, 0, 1))
    col = mix(col, (K['thigh'] * 0.85 + K['barDk'] * 0.15), thigh * (1 - blue))
    col *= (0.97 + 0.05 * pl['id'] + 0.03 * (n1 - 0.5))[:, None]
    bl = R['bill']
    col = mix(col, mix(np.tile(K['bill'], (len(P), 1)), K['barDk'], sstep(0.345, 0.354, z) * 0.4), bl)
    lg = np.clip(R['tarsus'] + R['toes'] + R['drum'] * sstep(0.24, 0.2, y), 0, 1)
    col = mix(col, K['leg'], lg)
    col = mix(col, K['claw'], R['claws'])
    rough = 0.72 + 0.06 * (n1 - 0.5)
    rough = np.where(nk > 0.5, 0.55, rough)
    rough = np.where(bl > 0.5, 0.42, rough)
    rough = np.where(lg > 0.5, 0.55, rough)
    return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)


def _cells():
    F_ = B.FeatherCell
    br, br2, bf, bk = hexc(0x6E5A44), hexc(0x4E3E2E), hexc(0x9A8670), hexc(0x4A3C2E)

    def prim(s, t, side):
        return _vn(s, t, br, br2, 0.4)

    def cov(s, t, side):
        return _barred(s, t, bf, bk, 7)

    def crest(s, t, side):
        return mix(np.tile(hexc(0x6A5640), (len(s), 1)), hexc(0x3E7A5A), sstep(0.3, 1.0, np.abs(s)) * 0.6)

    def tail(s, t, side):
        return _vn(s, t, hexc(0x6A5640), hexc(0x4A3A2A), 0.5)

    cr = F_('eye', crest, w=0.25, shaft=hexc(0x4A3E32))
    cr.eye = dict(t=0.86, rt=0.12, rs=0.75, rings=[(0.6, hexc(0x5A4A38)), (1.0, hexc(0x3E7A5A))], fringe=0.0, bare=0.7)
    return [F_('flight', prim, w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x3E3024)),
            F_('round', prim, w=0.72, outer=0.8, tip=0.45, shaft=hexc(0x3E3024)),
            F_('round', cov, w=0.8, outer=0.85, tip=0.8, shaft=hexc(0x3E3024)),
            F_('round', cov, w=0.8, outer=0.9, tip=1.2, shaft=hexc(0x3E3024)),
            F_('round', cov, w=0.76, outer=0.85, tip=0.6, shaft=hexc(0x3E3024)),
            F_('round', tail, w=0.7, outer=0.85, tip=0.7, shaft=hexc(0x3E3024)),
            cr,
            F_('round', tail, w=0.62, outer=0.85, tip=0.6, shaft=hexc(0x3E3024))]


# (her atlas can be the usual size: no eyespot feathers to keep sharp)
FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=_cells, out=(512, 256))
_meta_b = meta


def meta(st):
    m = _meta_b(st)
    m.update({'flat': 0x7E6A54, 'look': 'peahen'})
    m['eye'] = dict(m['eye'], lidCol=0x7E6A54)
    return m
