# Packs a sculpted model's mesh for the game (format 2), and converts format 1 models to it.
#
# Format 2 stores only the +x half of the mirrored body; the game makes the -x half when it loads the model. Vertices
# are numbered by first use in triangle order, every attribute is split into planes (one per component and byte),
# delta coded where it helps, and the whole block is deflated (raw deflate, inflated by the game). About a quarter of
# the format 1 size for the same mesh.
#
# Stored vertex order: the body vertices (used by the body triangles) first, then the others (tail tube; never
# mirrored). A body vertex off the middle plane (quantized x != 32768) gets a mirror twin, numbered after all stored
# vertices in the order of the vertices it mirrors. Triangles: body, then the others; the game adds the mirrored body
# triangles (twins, reversed winding) between the two.
#
# Blocks after inflating (n = stored vertices, t = stored triangles), all little endian bytes:
#   pos   3 x (n low bytes, n high bytes) of zigzag deltas of u16 (x quantized symmetric: 32768 = middle plane);
#         deltas wrap around (sums are taken modulo 65536, or 256 for byte values)
#   uv    2 x (n low, n high) zigzag deltas of u16
#   nrm   2 x n zigzag deltas of the i8 octahedral normal
#   bone  4 x n bone indices (into the json bones)          weight  4 x n weights (sum 255)
#   rough n roughness
#   tri   (3t low, 3t high) zigzag of (high water + 1 - index)
#   fur   (optional, json fur) 2 x n zigzag deltas of the i8 octahedral comb direction, n fur length (0..255 = 0..fur.len)
#   cards (optional, json cards: nv, ntri) the hair cards, never mirrored: pos, uv, nrm, bone, weight as above,
#         baby 3 x (nv low, nv high) zigzag deltas of i16 (baby offset, cards.bscale meters per unit), tri
#   bdelta (optional, json bdelta = scale in meters) the baby's own shape change per stored vertex (adult space):
#         3 x n zigzag deltas of i8 q with the square law d = s |s| bdelta, s = q / 127; a mirror twin gets x negated
# Usage (convert a format 1 model in place, baby offsets included): python3 tools/blender/modelpack.py <id>
# New baby offsets for a format 2 model from its species' baby_offset() (no Blender work files needed):
#   <python with numpy and scipy> tools/blender/modelpack.py --baby <id>
import json, os, sys, zlib
import numpy as np


def zz(d):
    d = d.astype(np.int64)
    return np.where(d >= 0, 2 * d, -2 * d - 1)


def planes16(a):
    a = np.asarray(a, np.int64)
    assert a.min() >= 0 and a.max() < 65536, (a.min(), a.max())
    return (a & 255).astype(np.uint8).tobytes() + (a >> 8).astype(np.uint8).tobytes()


def delta16(col):
    """16 bit values (signed ones are stored as their low 16 bits): deltas wrap around like the game's sums"""
    d = np.diff(np.asarray(col, np.int64) & 0xFFFF, prepend=0)
    return planes16(zz(((d + 32768) % 65536) - 32768))


def delta8(col):
    d = np.diff(np.asarray(col, np.int64) & 0xFF, prepend=0)
    return zz(((d + 128) % 256) - 128).astype(np.uint8).tobytes()


def tris(idx):
    t = np.asarray(idx, np.int64).ravel()
    out = np.empty(len(t), np.int64)
    hw = -1
    for i, v in enumerate(t):
        out[i] = hw + 1 - v
        if v > hw:
            hw = v
    return planes16(zz(out))


def first_use(idx, n, start=0):
    """vertex renumbering by first use in triangle order (unused vertices last)"""
    m = np.full(n, -1, np.int64)
    k = start
    for v in np.asarray(idx).ravel():
        if m[v] < 0:
            m[v] = k; k += 1
    rest = np.where(m < 0)[0]
    m[rest] = k + np.arange(len(rest))
    return m


def oct_enc(n):
    n = np.asarray(n, np.float64)
    n = n / np.maximum(np.abs(n).sum(1, keepdims=True), 1e-12)
    o = n[:, :2].copy()
    neg = n[:, 2] < 0
    o[neg] = (1 - np.abs(n[neg][:, [1, 0]])) * np.where(n[neg][:, :2] >= 0, 1, -1)
    return np.clip(np.round(o * 127), -127, 127).astype(np.int64)


def quant_pos(pos, bbox=None):
    """u16 positions; x symmetric about the middle plane (32768 = x 0, mirror = 65536 - q)"""
    pos = np.asarray(pos, np.float64)
    if bbox is None:
        lo, hi = pos.min(0), pos.max(0)
        hx = max(abs(lo[0]), abs(hi[0]))
        lo[0], hi[0] = -hx, hx
    else:
        lo, hi = np.array(bbox[:3], np.float64), np.array(bbox[3:], np.float64)
    q = np.empty(pos.shape, np.int64)
    q[:, 0] = np.round(pos[:, 0] / hi[0] * 32767) + 32768
    for k in (1, 2):
        q[:, k] = np.round((pos[:, k] - lo[k]) / (hi[k] - lo[k]) * 65535)
    return np.clip(q, 0, 65535), [round(float(x), 6) for x in list(lo) + list(hi)]


def deflate(b):
    c = zlib.compressobj(9, zlib.DEFLATED, -15, 9)
    return c.compress(b) + c.flush()


def bdelta_q(d):
    """baby offsets (n,3 meters) to (i8 values, scale): square law, fine for the small offsets, still reaching the big ones"""
    d = np.asarray(d, np.float64)
    sc = max(float(np.abs(d).max()), 1e-4)
    q = np.clip(np.round(np.sign(d) * np.sqrt(np.abs(d) / sc) * 127), -127, 127).astype(np.int64)
    return q, round(sc, 6)


def bdelta_m(q, sc):
    """i8 baby offset values back to meters (the game's decoding)"""
    q = np.asarray(q, np.float64)
    return q * np.abs(q) / 16129.0 * sc


def pack(body, other_tris=None, fur=None, cards=None, bdelta=None):
    """body: dict(q (n,3) u16 positions, uv (n,2) u16, oct (n,2) i8, si (n,4), sw (n,4) u8, rough (n,) u8,
    tri (t,3) body triangles of the half mesh); other_tris: triangles never mirrored (tail); fur: dict(oct (n,2), len (n,));
    cards: dict(q, uv, oct, si, sw, baby (nv,3) i16, tri); bdelta: (n,3) i8 baby offset values (bdelta_q).
    Returns (bytes, json fields)."""
    tb = np.asarray(body['tri'], np.int64).reshape(-1, 3)
    to = np.asarray(other_tris if other_tris is not None else np.zeros((0, 3)), np.int64).reshape(-1, 3)
    n = len(body['q'])
    used_b = np.unique(tb)
    m = first_use(tb, n)
    nbv = len(used_b)
    # the others after the body vertices (renumber the ones only the other triangles use)
    if len(to):
        # the other vertices by first use in the other triangles
        order = []
        mark = np.zeros(n, bool); mark[used_b] = True
        for v in to.ravel():
            if not mark[v]:
                mark[v] = True; order.append(v)
        order += [v for v in range(n) if not mark[v]]
        m = m.copy()
        m[np.array(order, np.int64)] = nbv + np.arange(len(order))
    inv = np.argsort(m)
    tb2, to2 = m[tb], m[to]
    q = np.asarray(body['q'], np.int64)[inv]
    out = []
    for k in range(3):
        out.append(delta16(q[:, k]))
    uv = np.asarray(body['uv'], np.int64)[inv]
    for k in range(2):
        out.append(delta16(uv[:, k]))
    oc = np.asarray(body['oct'], np.int64)[inv]
    for k in range(2):
        out.append(delta8(oc[:, k]))
    out.append(np.asarray(body['si'], np.uint8)[inv].T.tobytes())
    out.append(np.asarray(body['sw'], np.uint8)[inv].T.tobytes())
    out.append(np.asarray(body['rough'], np.uint8)[inv].tobytes())
    out.append(tris(np.concatenate([tb2, to2])))
    js = {'nv': int(n), 'ntri': int(len(tb2) + len(to2)), 'nbv': int(nbv), 'nbt': int(len(tb2))}
    if fur is not None:
        fo = np.asarray(fur['oct'], np.int64)[inv]
        for k in range(2):
            out.append(delta8(fo[:, k]))
        out.append(np.asarray(fur['len'], np.uint8)[inv].tobytes())
    if cards is not None:
        cq, ct = np.asarray(cards['q'], np.int64), np.asarray(cards['tri'], np.int64).reshape(-1, 3)
        cm = first_use(ct, len(cq))
        ci = np.argsort(cm)
        for k in range(3):
            out.append(delta16(cq[ci, k]))
        for k in range(2):
            out.append(delta16(np.asarray(cards['uv'], np.int64)[ci, k]))
        for k in range(2):
            out.append(delta8(np.asarray(cards['oct'], np.int64)[ci, k]))
        out.append(np.asarray(cards['si'], np.uint8)[ci].T.tobytes())
        out.append(np.asarray(cards['sw'], np.uint8)[ci].T.tobytes())
        bb = np.asarray(cards['baby'], np.int64)[ci]
        for k in range(3):
            out.append(delta16(bb[:, k]))
        out.append(tris(cm[ct]))
        js['cards'] = {'nv': int(len(cq)), 'ntri': int(len(ct))}
    if bdelta is not None:
        bq = np.asarray(bdelta, np.int64)[inv]
        for k in range(3):
            out.append(delta8(bq[:, k]))
    raw = b''.join(out)
    js['raw'] = len(raw)
    return deflate(raw), js


def unpack_v2(md, blob):
    """format 2 back to its stored arrays (the inverse of pack, in stored order): dict(q, uv, oct, si, sw, rough, tri,
    and fur, cards, bdelta when the json has them). tri holds every stored triangle (body first, md['nbt'] of them)."""
    raw = zlib.decompress(blob, -15)
    assert len(raw) == md['raw'], (len(raw), md['raw'])
    o = [0]

    def plane(k):
        a = np.frombuffer(raw, np.uint8, k, o[0]).astype(np.int64); o[0] += k; return a

    def unz(v):
        return np.where(v & 1, -((v + 1) >> 1), v >> 1)

    def d16(k):
        lo, hi = plane(k), plane(k)
        return np.cumsum(unz(lo | (hi << 8))) & 0xFFFF

    def d8(k):
        a = np.cumsum(unz(plane(k))) & 0xFF
        return np.where(a >= 128, a - 256, a)

    def tri(k):
        lo, hi = plane(k), plane(k)
        z = unz(lo | (hi << 8))
        out = np.empty(k, np.int64); hw = -1
        for i in range(k):
            v = hw + 1 - z[i]; out[i] = v
            if v > hw:
                hw = v
        return out

    def mesh(n):
        q = np.stack([d16(n) for _ in range(3)], 1)
        uv = np.stack([d16(n) for _ in range(2)], 1)
        oc = np.stack([d8(n) for _ in range(2)], 1)
        si = np.stack([plane(n) for _ in range(4)], 1)
        sw = np.stack([plane(n) for _ in range(4)], 1)
        return dict(q=q, uv=uv, oct=oc, si=si, sw=sw)
    n = md['nv']
    out = mesh(n)
    out['rough'] = plane(n)
    out['tri'] = tri(md['ntri'] * 3).reshape(-1, 3)
    if md.get('fur'):
        out['fur'] = dict(oct=np.stack([d8(n), d8(n)], 1), len=plane(n))
    if md.get('cards'):
        c = md['cards']
        cm = mesh(c['nv'])
        cm['baby'] = np.stack([d16(c['nv']) for _ in range(3)], 1)
        cm['baby'] = np.where(cm['baby'] >= 32768, cm['baby'] - 65536, cm['baby'])
        cm['tri'] = tri(c['ntri'] * 3).reshape(-1, 3)
        out['cards'] = cm
    if md.get('bdelta'):
        out['bdelta'] = np.stack([d8(n) for _ in range(3)], 1)
    assert o[0] == len(raw), (o[0], len(raw))
    return out


def oct_dec(o):
    """i8 octahedral normals back to unit vectors (the game's octDec)"""
    x, y = o[:, 0] / 127.0, o[:, 1] / 127.0
    z = 1 - np.abs(x) - np.abs(y)
    neg = z < 0
    ox = x.copy()
    x = np.where(neg, (1 - np.abs(y)) * np.where(ox >= 0, 1, -1), x)
    y = np.where(neg, (1 - np.abs(ox)) * np.where(y >= 0, 1, -1), y)
    n = np.stack([x, y, z], 1)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-12)


def positions(md, U):
    """stored vertex positions (meters, rig space) from unpack_v2 arrays"""
    b, q = md['bbox'], U['q']
    return np.stack([(q[:, 0] - 32768) / 32767.0 * b[3], b[1] + (b[4] - b[1]) * q[:, 1] / 65535.0, b[2] + (b[5] - b[2]) * q[:, 2] / 65535.0], 1)


def rebaby(sp, models):
    """give a format 2 model new baby offsets from its species file's baby_offset(P, N, parts) (the same call the
    export step makes), keeping everything else byte for byte; for models whose Blender work files are gone"""
    import importlib
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    S = importlib.import_module(sp)
    mj = os.path.join(models, f'{sp}.json')
    md = json.load(open(mj))
    assert md.get('v') == 2, 'convert to format 2 first'
    U = unpack_v2(md, open(os.path.join(models, md['data']), 'rb').read())
    P, N = positions(md, U).astype(np.float32), oct_dec(U['oct']).astype(np.float32)
    q, sc = bdelta_q(S.baby_offset(P, N, S.parts(P)))
    md['bdelta'] = sc
    blob, js = repack(md, U, bdelta=q)
    md['raw'] = js['raw']
    open(os.path.join(models, md['data']), 'wb').write(blob)
    json.dump(md, open(mj, 'w'), indent=1)
    print(f'{sp}: baby offsets up to {sc * 1000:.1f} mm; {len(blob)} bytes')


def repack(md, U, bdelta=None, fur=None):
    """write a format 2 model again from unpack_v2 arrays, optionally with new baby offsets (i8 values) or fur;
    returns (bytes, json fields). Vertex order and the mesh stay as they were."""
    nbt = md['nbt']
    body = dict(q=U['q'], uv=U['uv'], oct=U['oct'], si=U['si'], sw=U['sw'], rough=U['rough'], tri=U['tri'][:nbt])
    cards = U.get('cards')
    if fur is None:
        fur = U.get('fur')
    if bdelta is None:
        bdelta = U.get('bdelta')
    return pack(body, U['tri'][nbt:], fur, cards, bdelta)


def unpack_v1(md, b):
    """format 1 model: the full mirrored mesh as written by the first export.py"""
    nv, nt = md['nv'], md['ntri']
    o = [0]

    def take(dt, k):
        a = np.frombuffer(b, dt, k, o[0]); o[0] += a.nbytes; return a
    q = take(np.uint16, nv * 3).reshape(-1, 3).astype(np.int64)
    uv = take(np.uint16, nv * 2).reshape(-1, 2).astype(np.int64)
    idx = take(np.uint16, nt * 3).reshape(-1, 3).astype(np.int64)
    oc = take(np.int8, nv * 2).reshape(-1, 2).astype(np.int64)
    si = take(np.uint8, nv * 4).reshape(-1, 4)
    sw = take(np.uint8, nv * 4).reshape(-1, 4)
    r = take(np.uint8, nv)
    # the birds' baby offsets were appended after the mesh (i8 x3 per vertex, square law, scale md bdelta)
    bd = take(np.int8, nv * 3).reshape(-1, 3).astype(np.int64) if md.get('bdelta') else None
    assert o[0] == len(b), ('format 1 data left over', len(b) - o[0])
    bb = md['bbox']
    pos = np.array(bb[:3]) + (np.array(bb[3:]) - np.array(bb[:3])) * q / 65535.0
    return dict(pos=pos, uv=uv, oct=oc, si=si, sw=sw, rough=r, idx=idx, bdelta=bd)


def convert(sp, models):
    """format 1 -> 2: finds the mirrored half (each body triangle has a mirror triangle), keeps one side"""
    mj = os.path.join(models, f'{sp}.json')
    md = json.load(open(mj))
    if md.get('v') != 1:
        print(sp, 'is already format', md.get('v')); return
    raw1 = open(os.path.join(models, md['data']), 'rb').read()
    M = unpack_v1(md, raw1)
    pos, idx = M['pos'], M['idx']
    nv = len(pos)
    # export.py 1 wrote: half body triangles, their mirror twins (reversed winding), then the tail; find the count
    nb = 0
    for c in range(len(idx) // 2, 0, -1):
        a, b = pos[idx[:c]], pos[idx[c:2 * c]][:, ::-1] * np.array([-1, 1, 1])
        if np.abs(a - b).max() < 1e-4:
            nb = c
            break
    assert nb > 0, 'no mirror structure found'
    tb = idx[:nb]
    to = idx[2 * nb:]
    # keep the vertices of the half (body triangles) and the others; drop the twins
    keep = np.unique(np.concatenate([tb.ravel(), to.ravel()]))
    remap = np.full(nv, -1, np.int64); remap[keep] = np.arange(len(keep))
    q, bbox = quant_pos(pos[keep])
    # the body half lies on +x (keep x >= 0 there); twins of vertices on the middle plane are themselves
    body = dict(q=q, uv=M['uv'][keep], oct=M['oct'][keep], si=M['si'][keep], sw=M['sw'][keep], rough=M['rough'][keep], tri=remap[tb])
    # baby offsets: the kept vertices' own (a twin's is the mirror of its vertex's, which the game makes again)
    bd = M['bdelta'][keep] if M['bdelta'] is not None else None
    if bd is not None:
        tw = idx[nb:2 * nb][:, ::-1].ravel()
        src = tb.ravel()
        dx = M['bdelta'][tw, 0] + M['bdelta'][src, 0]
        print(f'{sp}: baby offsets of mirror twins differ by up to {int(np.abs(dx).max())} (x, i8 units) and '
              f'{int(np.abs(M["bdelta"][tw, 1:] - M["bdelta"][src, 1:]).max())} (y, z)')
    blob, js = pack(body, remap[to], bdelta=bd)
    md2 = {k: v for k, v in md.items() if k not in ('nv', 'ntri', 'bbox')}
    md2.update({'v': 2, 'enc': 'deflate', 'bbox': bbox, **js})
    open(os.path.join(models, md['data']), 'wb').write(blob)
    keys = ['v', 'id', 'data', 'enc', 'raw', 'maps', 'nv', 'ntri', 'nbv', 'nbt', 'bbox', 'bones']
    out = {k: md2[k] for k in keys if k in md2}
    out.update({k: v for k, v in md2.items() if k not in out})
    json.dump(out, open(mj, 'w'), indent=1)
    print(f'{sp}: format 1 {len(raw1)} bytes -> format 2 {len(blob)} bytes ({js["nv"]} of {nv} vertices stored, {js["ntri"]} of {len(idx)} triangles)')


if __name__ == '__main__':
    root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    if sys.argv[1:2] == ['--baby']:
        for sp in sys.argv[2:]:
            rebaby(sp, os.path.join(root, 'game', 'models'))
    else:
        for sp in sys.argv[1:]:
            convert(sp, os.path.join(root, 'game', 'models'))
