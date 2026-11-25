# round 17: a girl robin: the boy's body (robin.py, the same mesh: BASE) with her own, paler plumage: a gray-brown head
# only a little darker than her back (no black), a duller, paler orange breast, a fainter eye ring, paler flight
# feathers. Her own color map, feather atlas and settings; her chicks borrow the boy's baby maps (fledglings look
# alike). Run tools/blender/coat.py robinf after the robin.
import os
exec(compile(open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'robin.py')).read(), 'robin.py', 'exec'))
BASE = 'robin'
ID = 'robinf'
_M = sys.modules[__name__]
# (no baby_paint(): her chicks use the boy's baby maps)

KF = dict(K, back=hexc(0x6A6158), backHi=hexc(0x7A7066), head=hexc(0x4A4440), headHi=hexc(0x5A534C),
          breast=hexc(0xC0713E), breastHi=hexc(0xD08A56), breastDk=hexc(0xA86034))


def paint_f(P, N, c):
    return paint_with(P, N, c, KF, head_k=0.9, ring_k=0.7)


C.paint = paint_f
_meta_m = C.meta


def meta_f(st):
    m = _meta_m(st)
    m['flat'] = 0x7A5A44
    return m


C.meta = meta_f
FEATHER_ATLAS = dict(FEATHER_ATLAS, cells=lambda: cells((hexc(0x5A534C), hexc(0x6A6158), hexc(0x3E3832), hexc(0x8A8076), hexc(0x3A3530), hexc(0x302A26))))
