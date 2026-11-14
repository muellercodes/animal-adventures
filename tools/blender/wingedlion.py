# The winged lion (round 13): a whole African lion (lion.py on the panthera kit, as it is: the mane, the coat, the
# tufted tail) with a pair of golden eagle wings growing from its shoulder blades.
# The wings are the birds' (bird.py), grafted on the lion as the winged cat's are on the house cat (wingcat.py): in the
# game the wing bones and the feather blades (SPEC.wingedlion, wlionWing in 40_animals.js: the bald eagle's sculpted
# layout made 2.4 times as big, about 4.8 m across), here the feathered wing arm (bird.wing_arm, sculpted spread out
# flat in the rest pose, the span along +x from the shoulder pivot) on a muscular root that grows out of the shoulder
# blade behind the mane, weighted to the wing bones, plus the feather atlas the blades are cut from. The coat runs
# into the feathers over the root: the fur shells shorten and stop, the coat strokes fade, and small contour feathers
# start, growing bigger out along the arm.
# Golden eagle colors: tawny gold coverts with darker centers and pale edges, dark brown flight feathers with faint
# gray bars, near black finger tips; the arm's underside paler buff with fine bars.
# The cub: the lion cub (no mane, the woolly coat) with small downy wing buds (the game makes the wings small).
# graft() is shared with the girl (wingedlionf.py: the lioness with the same wings).
# Make it with: python3 tools/blender/export_rig.py wingedlion, then
# VOXEL=0.0092 TRIS=4600 TEX=768 BLENDER_PY=... python3 tools/blender/make.py wingedlion sculpt export
import os, sys
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, round_cone, fbm, vnoise
import carnivore as CV
from carnivore import mirror, mix, hexc, local
import panthera as PT
import bird as B

# ---------- the wing, in cat units (the game's bones / KS: SPEC.wingedlion, wlionWing) ----------
_KS = 4.2
_E = 2.4
WSH = V(0.2, 0.965, 0.168) / _KS
ARM = (0.16 * _E / _KS, 0.2 * _E / _KS, 0.15 * _E / _KS)
WPTS = [WSH, WSH + V(ARM[0], 0, 0), WSH + V(ARM[0] + ARM[1], 0, 0), WSH + V(sum(ARM), 0, 0)]
# the arm: a strong eagle's leading edge, broad and thick at the shoulder
WCHORD = [0.058, 0.042, 0.03, 0.011]
WTHICK = [0.024, 0.016, 0.0105, 0.0052]
# the root: a round muscle from the shoulder blade, inside the back, out into the arm
WROOT = (V(0.03, 0.222, 0.045), V(0.08, WSH[1], WSH[2] + 0.004), 0.017, 0.012)
# the box the wing arm and its root are evaluated in (the arm plus its blend radius)
WBOX = ((-0.34, 0.2, -0.006), (0.34, 0.285, 0.104))
ROOT = (0.05, 0.076)        # x over which the arm's skin blends from the chest onto the wing bones (and coat to feathers)
WTIP = WPTS[3][0] + 0.012


def warm(P):
    """the wing arm: the leading edge of the spread wing, a flat lens tapering to the tip of the hand, on its root"""
    Q = mirror(P)
    d = B.wing_arm(Q, WPTS, WCHORD, WTHICK, lead=0.6)
    a, b, ra, rb = WROOT
    # (the root a little flattened: wider along the body than it is thick)
    S = V(1.0, 1.25, 0.85)
    r = round_cone(Q * S, a * S, b * S, ra, rb) / 1.25
    return smin(d, r, 0.012)


def arm_mask(P):
    """1 on the feathered wing arm (out from the shoulder), 0 on the lion (geometry only)"""
    Q = mirror(P)
    return (sstep(ROOT[0], ROOT[1], Q[:, 0]) * sstep(0.2, 0.21, Q[:, 1]) * sstep(0.004, 0.014, Q[:, 2])
            * sstep(0.1, 0.09, Q[:, 2])).astype(F)


def graft(C, ID):
    """adds the wings to the lion's (or the lioness's) cat module C: its shape, parts, grid, weights, coat, fur and
    cub, all in cat units (PT.install then puts the hooks into the species file in game meters)"""
    C.BOUNDS = (V(-WTIP - 0.008, 0.0, -0.4), V(WTIP + 0.008, 0.375, 0.31))
    LBOX = ((-0.13, -0.01, -0.41), (0.13, 0.38, 0.32))
    shape0, parts0, keep0, lowpoly_fix0 = C.shape, C.parts, C.keep, C.lowpoly_fix
    uvr0, uvw0, fix_weights0, regions0 = C.uv_regions, C.uv_weight, C.fix_weights, C._regions
    flow0, paint0, detail0, fur0, baby_offset0, baby_paint0 = C.flow, C.paint, C.detail, C.fur, C.baby_offset, C.baby_paint

    def shape(P):
        # the lion only within its own box (out along the wing only the arm is there)
        d = local(P, *LBOX, shape0)
        return smin(d, local(P, *WBOX, warm), 0.01)

    def parts(P):
        c = parts0(P)
        c['warm'] = local(P, *WBOX, warm)
        return c

    def grid(h):
        """the lion's grid, plus coarse steps out along the wing (it changes slowly along its span) and fine steps
        across its thickness"""
        from sdf import axis_steps
        lo, hi = C.BOUNDS
        ez0, ez1 = C.BOX['ear'][0][2], C.BOX['ear'][1][2]
        xs = axis_steps(0.0, hi[0], [(0.008, C.BOX['ear'][1][0], h * 0.7), (0.135, hi[0], h * 2.0)], h)
        ys = axis_steps(lo[1], hi[1], [(WSH[1] - 0.016, WSH[1] + 0.016, h * 0.5)], h)
        zs = axis_steps(lo[2], hi[2], [(ez0, ez1, h * 0.42)], h)
        return xs, ys, zs

    def keep(P):
        return np.maximum(keep0(P), 0.5 * arm_mask(P)).astype(F)

    def lowpoly_fix(bm, hi):
        """the lion's rings, and rings across the wing arm so it bends at the shoulder, elbow and wrist"""
        import meshfix as MX
        lowpoly_fix0(bm, hi)
        tr = MX.tree(hi)
        for j in range(3):
            a = WPTS[j] + V(-0.016 if j else 0.012, 0, 0)
            MX.rings(bm, tr, a, a + V(0.032, 0, 0), 0.009, lambda c, p0, r: c.x > 0.05 and c.y > 0.2 and r < 0.04)
        MX.finish(bm, 5e-9)

    def uv_regions(P):
        lab = uvr0(P)
        Q = mirror(P)
        lab[(Q[:, 0] > 0.07) & (Q[:, 1] > 0.2) & (Q[:, 2] > 0.0) & (Q[:, 2] < 0.104)] = 10
        return lab

    def uv_weight(P):
        # the wing arm is mostly under the covert blades: fewer texels
        return (uvw0(P) * (1 - 0.35 * arm_mask(P))).astype(F)

    def fix_weights(W, wpos, names, G, weld):
        """the lion's weights, then the wing arm on the wing bones by its place along the span (blended at the joints,
        the root into the chest); nothing else may follow the wing or feather bones"""
        W = fix_weights0(W, wpos, names, G, weld)
        bi = {n: i for i, n in enumerate(names)}
        wing = [i for n, i in bi.items() if n[:-1] in ('wing', 'wfore', 'whand') or (n[0] == 'f' and n[1:-1].isdigit())]
        P = wpos.astype(F)
        Q = mirror(P)
        da = warm(P)
        db = np.minimum.reduce([C.trunk(P), local(P, *C.BOX['fleg'], C.fleg), local(P, *C.BOX['neck'], C.neck)])
        arm = (da < db + 0.002) & (Q[:, 0] > ROOT[0] - 0.008) & (Q[:, 1] > 0.195)
        lost = W[:, wing].sum(1)
        W[:, wing] = 0
        W[:, bi['chest']] += lost
        x = Q[:, 0]
        ua = np.interp(x, [WPTS[0][0], WPTS[1][0], WPTS[2][0], WPTS[3][0] + 0.05], [0.0, 1.0, 2.0, 3.0]).astype(F)
        rootb = 1 - sstep(ROOT[0], ROOT[1], x)
        side = np.where(P[:, 0] >= 0, 'L', 'R')
        W[arm] = W[arm] * rootb[arm, None]
        for nm, w in B.blend_chain(ua, ['wing', 'wfore', 'whand'], 0.12):
            for s in 'LR':
                ms = arm & (side == s)
                W[ms, bi[nm + s]] += w[ms] * (1 - rootb[ms])
        bad = W.sum(1) < 1e-6
        W[bad, bi['chest']] = 1
        return W / np.maximum(W.sum(1, keepdims=True), 1e-9)

    def regions(P, N, c):
        r = regions0(P, N, c)
        am = arm_mask(P)
        near = sstep(0.0015, -0.0005, c['warm'] - np.minimum(np.minimum(c['trunk'], c['fleg']), c['neck']))
        r['arm'] = (np.maximum(near, am * sstep(0.004, 0.0, c['warm'])) * am).astype(F)
        return r

    def strands(P, N, R):
        # the cat's coat strokes, none on the feathers
        key = (len(P), float(P[:7].sum()))
        if key not in C._scache:
            EYE = C.EYE
            dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['pad'] * R['paw']) * (1 - 0.7 * R['lip']) * sstep(EYE.r + 0.0015, EYE.r + 0.004, R['eyeD'])
            dens = dens * (1 - R['arm'])
            C._scache[key] = CV.strands(P, N, dens, C.flow, 0.0024, 0.0032, 0.0058, 0.00042, seed=93, lenk=lambda Q: C._lenk(mirror(Q)))
        return C._scache[key]

    def flow(P, N=None):
        """the lion's coat flow; on the wing arm the feathers lie back toward the trailing edge and out along the span"""
        f = flow0(P, N)
        am = arm_mask(P)
        wd = np.tile(nrm(V(0.3, 0.0, -1.0)), (len(P), 1))
        wd[:, 0] *= np.sign(P[:, 0] + 1e-12)
        f = f * (1 - am)[:, None] + wd * am[:, None]
        return (f / np.maximum(np.linalg.norm(f, axis=1, keepdims=True), 1e-9)).astype(F)

    pl_cache = {}

    def plumage(P, N):
        key = (len(P), float(P[:7].sum()))
        if key not in pl_cache:
            pl_cache.clear()
            x = mirror(P)[:, 0]
            # small contour feathers where the coat stops, bigger coverts out along the arm
            size = (0.0045 + 0.0095 * sstep(0.05, 0.2, x)).astype(F)
            pl_cache[key] = B.plumage(P, N, C.flow(P, N), size, seed=13)
        return pl_cache[key]

    def wing_paint(P, N, col, R, baby=False):
        am = R['arm']
        on = am > 0.001
        if not on.any():
            return col
        Pq, Nq = P[on], N[on]
        Qm = mirror(Pq)
        up = Nq[:, 1]
        x = Qm[:, 0]
        if baby:
            # the cub's wing bud: pale tawny down
            n2 = fbm(Qm * 140, 3, 12)
            c = mix(np.tile(KW['down'], (len(Pq), 1)), KW['downHi'], n2)
            c = mix(c, KW['downLo'], sstep(-0.2, -0.7, up) * 0.4)
        else:
            pl = plumage(Pq, Nq)
            # golden tawny coverts on top (paler out along the arm), the leading edge darker brown, buff underneath
            c = mix(np.tile(KW['gold'], (len(Pq), 1)), KW['tawny'], sstep(0.07, 0.2, x) * 0.6)
            c = mix(c, KW['brown'], sstep(0.3, 0.9, Nq[:, 2]) * 0.55)
            c = mix(c, KW['buff'], sstep(-0.1, -0.6, up) * 0.85)
            # each feather: a darker center (along its shaft), a pale fringe at its tip edge
            ctr = sstep(0.6, 0.15, np.abs(pl['b']) / np.maximum(pl['w'], 1e-6)) * sstep(-0.2, 0.2, up)
            c = mix(c, KW['brown'], ctr * 0.4 * pl['cov'])
            tip = sstep(0.0011, 0.0002, pl['e']) * pl['cov']
            c = mix(c, KW['edge'], tip * 0.5)
            # fine dark bars on the buff underside
            bars = sstep(0.55, 0.85, np.sin(-pl['a'] / np.maximum(pl['c'], 1e-4) * 9.0) * 0.5 + 0.5) * sstep(-0.1, -0.5, up)
            c = mix(c, KW['bar'], bars * 0.35 * pl['cov'])
            c *= (0.94 + 0.12 * pl['id'])[:, None]
        out = col.copy()
        out[on] = mix(col[on], c, am[on])
        return out

    def paint(P, N, c):
        col, rough = paint0(P, N, c)
        R = C._regions(P, N, c)
        col = wing_paint(P, N, col, R)
        rough = rough * (1 - R['arm']) + 0.72 * R['arm']
        return np.clip(col, 0, 1).astype(F), np.clip(rough, 0.2, 0.95).astype(F)

    def detail(P, N, c):
        h = detail0(P, N, c)
        R = C._regions(P, N, c)
        on = R['arm'] > 0.001
        if on.any():
            pl = plumage(P[on], N[on])
            h[on] = h[on] * (1 - R['arm'][on]) + B.feather_height(pl, 0.05) * R['arm'][on]
        return h

    def fur(P, N, c):
        ln, de = fur0(P, N, c)
        R = C._regions(P, N, c)
        return (ln * (1 - R['arm'])).astype(F), de

    def baby_offset(P, N, c):
        # (the lion's cub pulls its mane in onto the body without the mane: without the wing arm too, or the mane
        # over the shoulders lands on the arm's root and leaves a shelf there)
        C.shape = shape0
        try:
            d = baby_offset0(P, N, c)
        finally:
            C.shape = shape
        return (d * (1 - arm_mask(P))[:, None]).astype(F)

    def baby_paint(P, N, c, col):
        out = baby_paint0(P, N, c, col)
        R = C._regions(P, N, c)
        return np.clip(wing_paint(P, N, out, R, baby=True), 0, 1).astype(F)

    C.shape, C.parts, C.grid, C.keep, C.lowpoly_fix = shape, parts, grid, keep, lowpoly_fix
    C.uv_regions, C.uv_weight, C.fix_weights, C._regions, C._strands = uv_regions, uv_weight, fix_weights, regions, strands
    C.flow, C.paint, C.detail, C.fur, C.baby_offset, C.baby_paint = flow, paint, detail, fur, baby_offset, baby_paint
    C.PREVIEW = dict(C.PREVIEW)
    C.PREVIEW.update({
        'side': ((1.25, 0.25, -0.05), (0, 0.17, -0.05), 34),
        'front3q': ((0.85, 0.5, 0.85), (0, 0.18, -0.02), 40),
        'top': ((0.01, 1.4, -0.05), (0, 0.17, -0.05), 42),
        'rear3q': ((-0.75, 0.55, -0.85), (0, 0.18, -0.05), 40),
        'root': ((0.3, 0.42, 0.18), (0.06, 0.24, 0.04), 30),
        'rootback': ((0.22, 0.4, -0.25), (0.05, 0.24, 0.03), 30),
        'wing': ((0.3, 0.5, 0.35), (0.17, 0.24, 0.05), 32),
        'under': ((0.25, -0.12, 0.3), (0.12, 0.22, 0.04), 36),
    })
    return C


# the wing arm's colors (golden eagle)
KW = {'gold': hexc(0x7A5630), 'tawny': hexc(0x9C7440), 'brown': hexc(0x3E2A1A), 'buff': hexc(0x9A8466), 'edge': hexc(0xB09060),
      'bar': hexc(0x4A3828), 'down': hexc(0xA8946E), 'downHi': hexc(0xBCA884), 'downLo': hexc(0x94805E)}


# ---------- the feather atlas for the wing blades (cells in the game's order: prim, sec, gcov, cov, tert, -, -, lesser) ----------
def _cells():
    F_ = B.FeatherCell
    dk, br, brL, gray, gold, tawny, pale, black = (hexc(0x2C1E12), hexc(0x4A321E), hexc(0x664628), hexc(0x6E6458), hexc(0x8A6234),
                                                   hexc(0xA67C44), hexc(0xC09A62), hexc(0x16100A))

    def mottle(s, t, k, seed):
        """soft mottling across the vane (the feathers are not one flat color)"""
        return vnoise(np.stack([s * 3.0 * k, t * 9.0 * k, np.full(len(s), seed, F)], 1), 50 + seed) - 0.5

    def prim(s, t, side):
        # dark brown; faint gray bars on the inner vane's basal half; the finger tips near black
        c = mix(np.tile(br, (len(s), 1)), dk, sstep(0.0, 0.6, s) * 0.45)
        bars = sstep(0.5, 0.85, np.sin(t * 2 * np.pi * 6.0 + 0.8 * s) * 0.5 + 0.5) * sstep(0.62, 0.3, t) * sstep(0.1, -0.4, s)
        c = mix(c, gray, bars * 0.45)
        c = c * (1 + 0.12 * mottle(s, t, 1.0, 1))[:, None]
        return mix(c, black, sstep(0.55, 0.95, t) * 0.65)

    def sec(s, t, side):
        # dark brown with faint gray bars, a darker band at the tip
        c = mix(np.tile(br, (len(s), 1)), dk, sstep(0.3, -0.6, s) * 0.35)
        bars = sstep(0.55, 0.85, np.sin(t * 2 * np.pi * 5.0 + 0.5 * s) * 0.5 + 0.5) * sstep(0.8, 0.5, t)
        c = mix(c, gray, bars * 0.35)
        c = c * (1 + 0.12 * mottle(s, t, 1.0, 2))[:, None]
        return mix(c, dk, sstep(0.78, 0.95, t) * 0.6)

    def gcov(s, t, side):
        # dark brown, the edges and the tip paler and warmer
        c = mix(np.tile(br, (len(s), 1)), dk, sstep(0.5, 0.0, np.abs(s)) * 0.35)
        c = c * (1 + 0.16 * mottle(s, t, 1.3, 3))[:, None]
        return mix(c, tawny, sstep(0.55, 1.0, np.abs(s)) * 0.35 + sstep(0.86, 1.0, t) * 0.45)

    def cov(s, t, side):
        # a dark brown center, golden tawny toward the edges, a pale fringe at the tip
        c = mix(np.tile(gold, (len(s), 1)), br, sstep(0.6, 0.1, np.abs(s)) * sstep(0.1, 0.5, t) * sstep(1.0, 0.75, t) * 0.7)
        c = c * (1 + 0.18 * mottle(s, t, 1.5, 4))[:, None]
        return mix(c, pale, sstep(0.75, 1.0, np.abs(s)) * 0.3 + sstep(0.88, 1.0, t) * 0.45)

    def tert(s, t, side):
        c = mix(np.tile(br, (len(s), 1)), brL, sstep(0.4, 1.0, np.abs(s)) * 0.45)
        bars = sstep(0.6, 0.85, np.sin(t * 2 * np.pi * 4.0) * 0.5 + 0.5) * sstep(0.8, 0.4, t)
        c = mix(c, gray, bars * 0.25)
        c = c * (1 + 0.14 * mottle(s, t, 1.2, 5))[:, None]
        return mix(c, tawny, sstep(0.86, 1.0, t) * 0.4)

    def lesser(s, t, side):
        # the golden eagle's pale tawny bar over the arm
        c = mix(np.tile(tawny, (len(s), 1)), br, sstep(0.45, 0.0, np.abs(s)) * sstep(0.15, 0.55, t) * 0.5)
        c = c * (1 + 0.18 * mottle(s, t, 1.6, 6))[:, None]
        return mix(c, pale, sstep(0.75, 1.0, np.abs(s)) * 0.3 + sstep(0.85, 1.0, t) * 0.35)

    # (the shafts only a little darker than the vanes: dark shafts drew black lines along the folded feathers)
    return [F_('finger', prim, w=0.6, outer=0.55, tip=0.42, shaft=hexc(0x3A2818), notch=0.4),
            F_('round', sec, w=0.76, outer=0.8, tip=0.5, shaft=hexc(0x3A2818)),
            F_('round', gcov, w=0.74, outer=0.85, tip=0.9, shaft=hexc(0x4A3420)),
            F_('round', cov, w=0.72, outer=0.9, tip=1.2, shaft=hexc(0x6A4C2C)),
            F_('round', tert, w=0.7, outer=0.85, tip=0.9, shaft=hexc(0x4A3420)),
            None, None,
            F_('round', lesser, w=0.74, outer=0.9, tip=1.2, shaft=hexc(0x7A5832))]


def _baby_cells():
    F_ = B.FeatherCell
    g1, g2 = hexc(0xA89272), hexc(0x847052)

    def dn(s, t, side):
        return mix(np.tile(g1, (len(s), 1)), g2, sstep(0.5, 0.0, t) * 0.4)
    return [F_('down', dn)] * 5 + [None, None, F_('down', dn)]


FEATHER_ATLAS = {'size': (1024, 512), 'out': (512, 256), 'cells': _cells, 'baby': _baby_cells, 'quality': (70, 76, 64),
                 'alpha_quality': 50}


def make_extra(g):
    """the feather atlas hooks for the species file g (its ID names the files)"""
    def extra_maps(X):
        """the feather atlases (the cub's coat is baby_paint's map, written by texture.py)"""
        B.save_atlas(sys.modules[g['__name__']], X['work'])

    def export_extra(meta_, out_dir, work):
        """the feather atlases as WebP, named in the json (the game cuts the wing blades from them)"""
        from PIL import Image
        fa = g['FEATHER_ATLAS']
        fo = fa['out']
        fb = (fo[0] // 2, fo[1] // 2)
        srgb = list(meta_.get('srgb', []))
        for key, fn, mode, qual, size in (('feather', 'feather', 'RGBA', fa['quality'][0], fo), ('featherNormal', 'feathernrm', 'RGB', fa['quality'][1], fo),
                                          ('babyFeather', 'babyfeather', 'RGBA', fa['quality'][2], fb)):
            im = Image.open(os.path.join(work, f"{g['ID']}-{fn}.png")).convert(mode)
            if im.size != tuple(size):
                im = im.resize(tuple(size), Image.LANCZOS)
            dst = f"{g['ID']}-{fn}.webp"
            im.save(os.path.join(out_dir, dst), 'WEBP', quality=qual, method=6, alpha_quality=fa['alpha_quality'])
            meta_['maps'][key] = dst
            if key != 'featherNormal':
                srgb.append(key)
        meta_['srgb'] = srgb
        meta_['feathers'] = {'cols': B.NCOL}
    g['extra_maps'], g['export_extra'] = extra_maps, export_extra


# ---------- the winged lion: lion.py as it is, with the wings ----------
import lion as LN
KS = LN.KS
C = graft(LN.C, 'wingedlion')
PT.install(globals(), C, KS)
ID = 'wingedlion'
make_extra(globals())
