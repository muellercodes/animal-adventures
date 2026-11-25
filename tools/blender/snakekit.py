# round 17: bigger snakes on the garter snake's tube (snake.py): the king cobra, the western diamondback rattlesnake and
# the green anaconda. A species file gives its numbers to make(globals(), ...): snake.py runs in a module of its own
# with the species' cross sections, head landmarks and scales, all in "garter units" (the garter's head is 0.045 long),
# and the pipeline hooks made here scale everything by KS into game meters (KS is the head scale, kH in the game's
# snakeKit in 40_animals.js). The game rig is laid out the same way: the tip of the snout at 0.48 of the length, the
# first body bone 0.052 KS behind it. Like the garter there is no sculpt: the tube is built as the game mesh with even
# rings and evaluated exactly per texel (make_game_mesh, make_bake).
import os, types
import numpy as np
from sdf import V, F, nrm, sstep, fbm, vnoise, _hash

HERE = os.path.dirname(os.path.abspath(__file__))


def base(over):
    """snake.py in a module of its own, with the species' settings (garter units) and what depends on them redone"""
    m = types.ModuleType('snake_' + over['ID'])
    m.__dict__['__file__'] = os.path.join(HERE, 'snake.py')
    exec(compile(open(os.path.join(HERE, 'snake.py')).read(), 'snake.py', 'exec'), m.__dict__)
    m.__dict__.update(over)
    from scipy.interpolate import PchipInterpolator
    K = np.asarray(m.SECT, np.float64)
    m._K = K
    m._SECT = PchipInterpolator(K[:, 0], K[:, 1:], axis=0)
    m.STRIPS = [0.0, 0.25 * m.L, 0.5 * m.L, 0.75 * m.L, m.L]
    m._cache.clear()
    return m


def eye(m, d):
    """the eye ball a little inside the surface at the socket, looking along d"""
    s, th = np.array([m.EYE_S], F), np.array([m.EYE_TH], F)
    p = m.surface(s, th)[0]
    n = m.normal(s, th)[0]
    return (p - n * m.EYE_R * 0.52).astype(F), nrm(np.asarray(d, F)).astype(F)


def dorsal(m, keel):
    """the garter's staggered dorsal scales (_dorsal) with the keel as a setting: smooth scales for keel 0"""
    def _dorsal(s, th):
        dth = 2 * np.pi / m.NROW
        best1 = np.full(len(s), 9.0, F); best2 = np.full(len(s), 9.0, F)
        cs = np.zeros(len(s), F); ct = np.zeros(len(s), F)
        j0 = np.round(th / dth)
        for dj in (-1, 0, 1):
            j = j0 + dj
            off = 0.5 * (np.abs(j) % 2)
            for di in (-1, 0, 1):
                i = np.floor(s / m.P_S - off) + di
                sc = (i + off + 0.5) * m.P_S
                tc = j * dth
                d = np.sqrt(((s - sc) / m.P_S) ** 2 + ((th - tc) / dth) ** 2)
                k = d < best1
                best2 = np.where(k, best1, np.minimum(best2, d))
                best1 = np.where(k, d, best1)
                cs = np.where(k, sc, cs); ct = np.where(k, tc, ct)
        e = best2 - best1
        a = (s - cs) / m.P_S
        b = (th - ct) / dth
        h = (0.5 + 0.9 * np.clip(a + 0.5, 0, 1)) * sstep(0.0, 0.18, e)
        if keel:
            h += keel * np.exp(-(b / 0.09) ** 2) * sstep(-0.35, 0.1, a) * sstep(0.0, 0.12, e)
        return h, e, cs, ct
    return _dorsal


def make(g, m, KS, tex_rings=None, eye_dir=(0.86, 0.3, 0.4), baby_offset=None):
    """installs the pipeline hooks in the species module g for the snake module m at scale KS"""
    m.EYE_C, m.EYE_DIR = eye(m, eye_dir)
    m.MOUTH = m.surface(np.array([0.0015], F), np.array([np.pi * 0.62], F))[0] + V(0, 0, 0.0005)
    ID = m.ID
    L = m.L

    def rings():
        """even rings: close on the head, about 130 along the body, close again at the tail tip"""
        if tex_rings is not None:
            return tex_rings(m)
        sp = (L - 0.1) / 130
        s = list(np.arange(0.0018, 0.072, 0.0026)) + list(np.arange(0.072, L - 0.03, sp)) + list(np.arange(L - 0.03, L - 0.0006, 0.003))
        s = sorted(set([round(v, 6) for v in s] + [round(v, 6) for v in m.STRIPS[1:-1]]))
        return np.array(s, np.float64)

    def make_game_mesh(work, rig, tris=None):
        import meshutil as MU
        S_ = rings()
        th = np.linspace(0, np.pi, m.NSEG + 1)
        nr = len(S_)
        ss, tt = np.meshgrid(S_, th, indexing='ij')
        Vr = m.surface(ss.ravel().astype(F), tt.ravel().astype(F)).reshape(nr, m.NSEG + 1, 3)
        Vr[:, 0, 0] = 0; Vr[:, -1, 0] = 0
        verts = list(Vr.reshape(-1, 3))
        tip = len(verts); verts.append(np.array([0, m.sect(np.array([0.0], F))[0][0], m.Z_TIP + 0.0003], F))
        end = len(verts); verts.append(np.array([0, m.sect(np.array([L], F))[0][0], m.Z_TIP - L], F))
        Vh = np.array(verts, F)
        vid = lambda i, j: i * (m.NSEG + 1) + j
        Fh, UVf = [], []
        for i in range(nr - 1):
            k = int(m.strip_of(0.5 * (S_[i] + S_[i + 1])))
            for j in range(m.NSEG):
                a, b, c, d = vid(i, j), vid(i, j + 1), vid(i + 1, j), vid(i + 1, j + 1)
                for tri in ((a, b, c), (b, d, c)):
                    Fh.append(tri)
                    UVf.append([m.uv_of(S_[i if q in (a, b) else i + 1], th[j if q in (a, c) else j + 1], k) for q in tri])
        for j in range(m.NSEG):
            Fh.append((tip, vid(0, j), vid(0, j + 1)))
            UVf.append([m.uv_of(0.0, 0.5 * (th[j] + th[j + 1]), 0), m.uv_of(S_[0], th[j], 0), m.uv_of(S_[0], th[j + 1], 0)])
            Fh.append((end, vid(nr - 1, j + 1), vid(nr - 1, j)))
            UVf.append([m.uv_of(L, 0.5 * (th[j] + th[j + 1]), 3), m.uv_of(S_[-1], th[j + 1], 3), m.uv_of(S_[-1], th[j], 3)])
        Fh = np.array(Fh, np.int64)
        UVf = np.array(UVf, F)
        c = Vh[Fh].mean(1)
        n = np.cross(Vh[Fh[:, 1]] - Vh[Fh[:, 0]], Vh[Fh[:, 2]] - Vh[Fh[:, 0]])
        s_c, _ = m.tube_coords(c)
        out = c - np.stack([np.zeros(len(c)), m.sect(s_c)[0], m.Z_TIP - np.clip(s_c, 0.004, L - 0.004)], 1)
        flip = (n * out).sum(1) < 0
        Fh[flip] = Fh[flip][:, ::-1]; UVf[flip] = UVf[flip][:, ::-1]
        Vh = (Vh * KS).astype(F)   # game meters
        is_tail = np.zeros(len(Fh), bool)
        G = MU.game_mesh(Vh, Fh, UVf, is_tail)
        W = MU.weights(G, rig, 'transfer', __import__(ID))
        G.update(W)
        np.savez_compressed(os.path.join(work, f'{ID}-lo.npz'), half_v=Vh, half_f=Fh, half_uv=UVf, half_tail=is_tail, **G)
        print(f'{ID}: {nr} rings, half {len(Fh)} tris, game mesh {len(G["pos"])} verts {len(G["idx"]) // 3} tris, {int(flip.sum())} flipped')

    def make_bake(work, tex):
        """the exact surface per texel at twice the map size, in game meters"""
        R = tex * 2
        pos = np.zeros((R * R, 4), F); nr_ = np.zeros((R * R, 4), F)
        pos[:, 3] = 1; nr_[:, 3] = 1
        lo_, hi_ = np.full(3, 1e9, F), np.full(3, -1e9, F)
        Ps, rows = [], np.array_split(np.arange(R), 8)
        for rr in rows:   # (in bands, to keep the memory down)
            iy, ix = np.meshgrid(rr, np.arange(R), indexing='ij')
            u = (ix.ravel() + 0.5) / R; v = (iy.ravel() + 0.5) / R
            k = np.clip(np.floor(v / 0.25).astype(int), 0, 3)
            tv = (v - k * 0.25 - m.UV_M) / (0.25 - 2 * m.UV_M)
            tu = (u - m.UV_M) / (1 - 2 * m.UV_M)
            a = np.asarray(m.STRIPS)[k]; b = np.asarray(m.STRIPS)[k + 1]
            s = np.clip(a + np.clip(tu, -0.02, 1.02) * (b - a), 0, L).astype(F)
            th = (np.clip(tv, -0.03, 1.03) * np.pi).astype(F)
            ok = (tu > -0.02) & (tu < 1.02) & (tv > -0.03) & (tv < 1.03)
            P = m.surface(s, th) * KS; N = m.normal(s, th)
            idx = rr[0] * R + np.arange(len(s))
            Ps.append((idx[ok], P[ok].astype(F), N[ok].astype(F)))
            lo_ = np.minimum(lo_, P[ok].min(0)); hi_ = np.maximum(hi_, P[ok].max(0))
        plo, phi = lo_ - 0.01 * KS, hi_ + 0.01 * KS
        for idx, P, N in Ps:
            pos[idx, :3] = (P - plo) / (phi - plo)
            nr_[idx, :3] = N * 0.5 + 0.5
        ao = np.ones((tex, tex, 4), F)
        np.savez_compressed(os.path.join(work, f'{ID}-bake.npz'), nrm=nr_.reshape(R, R, 4), pos=pos.reshape(R, R, 4), ao=ao, plo=plo, phi=phi)

    def fix_weights(W, wpos, names, G, weld):
        return m.fix_weights(W, (wpos / KS).astype(F), names, G, weld)

    def parts(P):
        Pu = (P / KS).astype(F)
        c = m.parts(Pu)
        c['Pu'] = Pu
        return c

    g.update(dict(
        ID=ID, make_game_mesh=make_game_mesh, make_bake=make_bake, fix_weights=fix_weights, WEIGHT_SMOOTH=m.WEIGHT_SMOOTH,
        parts=parts, finish=m.finish, stats=m.stats, KS=KS, M=m,
    ))
    if baby_offset is not None:
        g['baby_offset'] = lambda P, N, c: (baby_offset(c['s'], c['th'], c['Pu'], N) * KS).astype(F)


def meta_scaled(m, KS, eye_extra=None, extra=None):
    """the json settings: the eye and the mouth in game meters"""
    e = {'p': [round(float(v) * KS, 5) for v in m.EYE_C], 'r': round(m.EYE_R * KS, 5), 'dir': [round(float(v), 4) for v in m.EYE_DIR], 'lid': [0.95, -0.95, 0],
         'irisR': 0.92, 'pupilR': 0.5, 'noBlink': True}
    e.update(eye_extra or {})
    out = {'eye': e, 'mouth': [round(float(v) * KS, 4) for v in m.MOUTH], 'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0], 'rim': [0.04, 0.05, 0.03]}
    out.update(extra or {})
    return out


def small_scales(u, v, cell, seed):
    """small irregular scales (2D Worley cells over u, v in meters): distance to the nearest edge, as a part of the
    cell, and each point's cell center (for a color per scale)"""
    gu, gv = u / cell, v / cell
    iu, iv = np.floor(gu), np.floor(gv)
    b1 = np.full(len(u), 9.0, F); b2 = np.full(len(u), 9.0, F); cu = np.zeros(len(u), F); cv = np.zeros(len(u), F)
    for du in (-1, 0, 1):
        for dv in (-1, 0, 1):
            a, b = (iu + du).astype(np.int64), (iv + dv).astype(np.int64)
            ju = a + 0.15 + 0.7 * _hash(a, b, np.zeros_like(a), seed)
            jv = b + 0.15 + 0.7 * _hash(a, b, np.ones_like(a), seed)
            d = np.sqrt((gu - ju) ** 2 + (gv - jv) ** 2)
            k = d < b1
            b2 = np.where(k, b1, np.minimum(b2, d)); b1 = np.where(k, d, b1)
            cu = np.where(k, ju, cu); cv = np.where(k, jv, cv)
    return (b2 - b1).astype(F), (cu * cell).astype(F), (cv * cell).astype(F)


def mix(c, k, t):
    t = np.clip(t, 0, 1)[:, None]
    return c + (np.asarray(k, F) - c) * t


def hexc(h):
    return np.array([((h >> 16) & 255) / 255, ((h >> 8) & 255) / 255, (h & 255) / 255], F)
