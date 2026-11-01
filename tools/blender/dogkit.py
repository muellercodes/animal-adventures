# Dog breeds. Every breed is the golden retriever (dog.py) refitted to its own build: the golden's sculpted trunk,
# neck and legs are evaluated through a smooth map (Fit: an overall scale, longer or shorter legs, a deeper or
# shallower body, a longer, wider or slimmer one, the head carried higher), the golden's head through a second map
# (the skull and the muzzle each with their own length, width and depth, the whole head turned and scaled), and each
# breed brings its own ears, tail, eyes, paws, coat colors and coat length. The game refits the procedural skeleton
# and body with the same numbers (dogFit in game/src/40_animals.js), so a breed's Fit there and here must match.
# A breed file (lab.py, dalmatian.py, husky.py, beagle.py, chihuahua.py) describes the breed and paints its coat;
# Breed.export() fills in everything else the pipeline asks a species file for.
import numpy as np
from sdf import V, F, nrm, smin, smax, sstep, sat, ellipsoid, superellipsoid, round_cone, sweep, fbm, worley, length
import carnivore as CV
from carnivore import local, local_n, mirror, mix, hexc, rnd, wsum
import dog as G

YP, YC = 0.07, 0.31        # golden heights where the paws end and the legs meet the body
X0F, X0H = 0.077, 0.081    # middle lines of the golden's legs


def _I(a, b, t):
    """integral of smoothstep(a, b, .) up to t: a slope that blends smoothly from one scale to another"""
    x = np.clip((t - a) / (b - a), 0, 1)
    return (b - a) * (x ** 3 - 0.5 * x ** 4) + np.maximum(0, t - b)


def _rot_x(v, p):
    """turn a vector about x by p radians (positive lifts what points forward)"""
    c, s = np.cos(p), np.sin(p)
    return np.array([v[0], v[1] * c + v[2] * s, -v[1] * s + v[2] * c], F)


def _lerp(a, b, t):
    return a + (b - a) * t


class Fit:
    """golden rig space -> breed rig space. Body: x * kw, the height through Y (paws as they are, the legs times kL,
    the body above them times kB), z * kz, all times s; the upper neck and the head moved by neck = (dy, dz) (times s).
    Legs keep their own thickness: kLW about their middle lines. Head: the golden head frame moved with the neck,
    turned by pitch, scaled by k (times s); in it the skull and the muzzle have their own lengths (kS, kM), widths
    (kSW, kMW, and kTW at the nose) and depths (kDome over the skull, kJaw under it, kMD for the muzzle)."""

    def __init__(self, s=1.0, kL=1.0, kB=1.0, kz=1.0, kw=1.0, kLW=1.0, neck=(0.0, 0.0), head=None):
        self.s, self.kL, self.kB, self.kz, self.kw, self.kLW = s, kL, kB, kz, kw, kLW
        self.nk = np.asarray(neck, np.float64)
        H = dict(k=1.0, pitch=0.0, kS=1.0, kM=1.0, kSW=1.0, kMW=1.0, kTW=None, kDome=1.0, kMD=1.0, kJaw=1.0)
        H.update(head or {})
        if H['kTW'] is None:
            H['kTW'] = H['kMW']
        self.H = H
        ys = np.linspace(-0.4, 1.8, 22001)
        self._ys, self._Ys = ys, self.Y(ys)
        ts = np.linspace(-0.4, 0.8, 24001)
        self._ts, self._Ts = ts, self.hs(ts)
        self.kd = (kw * kB * kz) ** (1 / 3)          # distance scale of the body field
        self.kdl = (kLW * kL * kz) ** (1 / 3)        # of the legs
        self.sh = s * H['k']
        self.kdh = (H['kSW'] * H['kDome'] * H['kS']) ** (1 / 3)
        self.ho = self.fwd(G.HF.o[None, :])[0]
        self.ha, self.hu = _rot_x(G.HF.a, H['pitch']), _rot_x(G.HF.u, H['pitch'])
        self.HF = CV.Frame(self.ho, self.ha, self.hu)

    # ----- body -----
    def Y(self, y):
        return y + (self.kL - 1) * _I(YP - 0.02, YP + 0.02, y) + (self.kB - self.kL) * _I(YC - 0.03, YC + 0.03, y)

    def Yinv(self, Y):
        return np.interp(Y, self._Ys, self._ys)

    @staticmethod
    def wneck(y, z):
        return sstep(0.52, 0.7, y) * sstep(0.18, 0.26, z)

    def fwd(self, P, leg=None):
        P = np.asarray(P, np.float64)
        x, y, z = P[:, 0], P[:, 1], P[:, 2]
        if leg:
            x0 = X0F if leg == 'f' else X0H
            X = np.where(x < 0, -1, 1) * (x0 * self.kw + (np.abs(x) - x0) * self.kLW)
        else:
            X = x * self.kw
        w = self.wneck(y, z)
        return (self.s * np.stack([X, self.Y(y) + w * self.nk[0], z * self.kz + w * self.nk[1]], 1)).astype(F)

    def inv(self, Q, leg=None):
        q = np.asarray(Q, np.float64) / self.s
        y = self.Yinv(q[:, 1])
        z = q[:, 2] / self.kz
        if np.any(self.nk):
            for _ in range(5):
                w = self.wneck(y, z)
                y = self.Yinv(q[:, 1] - w * self.nk[0])
                z = (q[:, 2] - w * self.nk[1]) / self.kz
        if leg:
            x0 = X0F if leg == 'f' else X0H
            x = np.where(q[:, 0] < 0, -1, 1) * (x0 + (np.abs(q[:, 0]) - x0 * self.kw) / self.kLW)
        else:
            x = q[:, 0] / self.kw
        return np.stack([x, y, z], 1).astype(F)

    def slope(self, y):
        """dY/dy at golden heights y"""
        return 1 + (self.kL - 1) * sstep(YP - 0.02, YP + 0.02, y) + (self.kB - self.kL) * sstep(YC - 0.03, YC + 0.03, y)

    # ----- head -----
    def hs(self, t):
        H = self.H
        return H['kS'] * t + (H['kM'] - H['kS']) * _I(0.105, 0.135, t)

    def hsinv(self, T):
        return np.interp(T, self._Ts, self._ts)

    def hkx(self, t):
        H = self.H
        return _lerp(_lerp(H['kSW'], H['kMW'], sstep(0.09, 0.16, t)), H['kTW'], sstep(0.17, 0.24, t))

    def hku(self, t, u):
        H = self.H
        k = sstep(0.095, 0.14, t)
        return np.where(u > 0, _lerp(H['kDome'], H['kMD'], k), _lerp(H['kJaw'], H['kMD'], k))

    def head_local_fwd(self, Lg):
        t = Lg[:, 2]
        return np.stack([Lg[:, 0] * self.hkx(t), Lg[:, 1] * self.hku(t, Lg[:, 1]), self.hs(t)], 1).astype(F)

    def head_local_inv(self, Lb):
        t = self.hsinv(Lb[:, 2])
        return np.stack([Lb[:, 0] / self.hkx(t), Lb[:, 1] / self.hku(t, Lb[:, 1]), t], 1).astype(F)

    def head_fwd(self, P):
        """golden rig points on the head -> breed rig points"""
        Lb = self.head_local_fwd(G.HF.loc(np.atleast_2d(np.asarray(P, F))))
        return self.from_hloc(Lb)

    def from_hloc(self, Lb):
        """breed head-local coordinates (x, u, s in golden units) -> breed rig points"""
        Lb = np.atleast_2d(np.asarray(Lb, F))
        return (self.ho[None] + self.sh * (self.ha[None] * Lb[:, 2:3] + self.hu[None] * Lb[:, 1:2] + V(1, 0, 0)[None] * Lb[:, 0:1])).astype(F)

    def hloc(self, P):
        """breed rig points -> breed head-local coordinates (x, u, s) in golden units"""
        return (self.HF.loc(np.asarray(P, F)) / self.sh).astype(F)

    def head_inv(self, P):
        """breed rig points -> golden rig points (through the head's map), and their golden head-local coordinates"""
        Lg = self.head_local_inv(self.hloc(P))
        o, a, u = G.HF.o, G.HF.a, G.HF.u
        Pg = (o[None] + a[None] * Lg[:, 2:3] + u[None] * Lg[:, 1:2] + V(1, 0, 0)[None] * Lg[:, 0:1]).astype(F)
        return Pg, Lg

    def head_w(self, P):
        """how much a breed point belongs to the head (the head's map) rather than to the body's"""
        Lb = self.hloc(P)
        return (sstep(-0.045, -0.008, Lb[:, 2]) * sstep(-0.13, -0.09, Lb[:, 1])).astype(F)

    def gpt(self, P):
        """the golden point a breed point stands for (body and head maps blended at the back of the skull), for
        reusing the golden's regions, markings and coat flow"""
        P = np.asarray(P, F)
        Pb = self.inv(P)
        Ph, _ = self.head_inv(P)
        w = self.head_w(P)[:, None]
        return (Pb * (1 - w) + Ph * w).astype(F)


# ---------- ears ----------
class DropEar:
    """a soft drop ear hanging from the fold B along A, its flat side facing out along N, L long and W half wide
    (meters). Outline: w0 = width at the fold (of W), um = where it is widest (of L), p = tip roundness (2 round, 1
    pointed). sc = the dog's head scale (thickness, blends); swing = how far the tip swings forward, standoff = how
    far its lower part stands off the cheek, cup = how much it wraps round the cheek (golden 1)."""
    kind = 'drop'

    def __init__(self, B, A, N, L, W, sc, w0=0.78, um=0.33, p=2.0, th=1.0, cup=1.0, swing=1.0, standoff=1.0, fold=1.0):
        self.B = np.asarray(B, F)
        self.A = nrm(A)
        N = nrm(N)
        self.N = nrm(N - self.A * np.dot(N, self.A))
        self.C = np.cross(self.N, self.A).astype(F)        # across the ear, toward the front
        self.L, self.W, self.sc = float(L), float(W), float(sc)
        self.w0, self.um, self.p, self.th, self.cup, self.swing, self.standoff, self.fold = w0, um, p, th, cup, swing, standoff, fold

    def coords(self, Q):
        D = Q - self.B
        return D @ self.A, D @ self.C, D @ self.N

    def half_width(self, u):
        um, p = self.um, self.p
        lo = self.w0 + (1 - self.w0) * np.sqrt(np.clip(u / um, 0, 1))
        hi = np.clip(1 - np.clip((u - um) / (1 - um), 0, 1) ** p, 0, 1) ** (1 / p)
        return self.W * np.where(u < um, lo, hi)

    def sdf(self, Q):
        a, c, n = self.coords(Q)
        sc, kl, kw = self.sc, self.L / 0.105, self.W / 0.04
        u = np.clip(a / self.L, 0, 1)
        hw = self.half_width(u) + 0.002 * sc
        cc = c - (0.006 * u + 0.004 * np.sin(np.pi * u)) * kl * sc * self.swing
        k = np.clip(cc / np.maximum(hw, 1e-4), -1.3, 1.3)
        mid = -0.009 * k * k * kw * sc * self.cup + (0.01 * u * u + 0.004 * u) * kl * sc * self.standoff
        th = (0.0065 * (1 - u) + 0.0042 * u) * sc * self.th * (1 - 0.35 * k * k)
        d_out = np.abs(cc) - hw
        d_th = np.abs(n - mid) - np.maximum(th, 0.0015 * sc)
        d_end = np.maximum(-a + 0.004 * sc, a - self.L)
        d = smax(smax(d_out, d_th, 0.004 * sc), d_end, 0.008 * sc)
        # the fold: the ear leather rolls over the top of the skull here
        f = self.fold * sc
        d = smin(d, ellipsoid(Q, self.B + self.A * 0.004 * sc - self.N * 0.004 * sc, V(0.012 * f, 0.012 * f, 0.03 * f * kw)), 0.01 * sc)
        return d

    def mask(self, Q, pad=0.0):
        """1 on the ear flap (mirrored points), soft at its edges"""
        a, c, n = self.coords(Q)
        u = np.clip(a / self.L, 0, 1)
        hw = self.half_width(u)
        p = pad + 0.012 * self.sc
        return (sstep(-0.006 * self.sc, 0.01 * self.sc, a) * sstep(hw + p, hw, np.abs(c)) * sstep(0.03 * self.sc, 0.014 * self.sc, np.abs(n))
                * sstep(self.L + p, self.L, a)).astype(F)

    def tip(self):
        return self.B + self.A * self.L


class ErectEar:
    """an ear standing up from the head at B along A, its opening facing N (carnivore.ear): L long, W half wide at the
    base (meters), 'point' or 'round'"""
    kind = 'erect'

    def __init__(self, B, A, N, L, W, sc, shape='point', th0=0.006, th1=0.002, cup=0.7, tipin=0.0, base_r=None):
        self.B = np.asarray(B, F)
        self.A = nrm(A)
        N = nrm(N)
        self.N = nrm(N - self.A * np.dot(N, self.A))
        self.C = np.cross(self.N, self.A).astype(F)
        self.L, self.W, self.sc = float(L), float(W), float(sc)
        self.shape, self.th0, self.th1, self.cup, self.tipin, self.base_r = shape, th0, th1, cup, tipin, base_r

    def coords(self, Q):
        D = Q - self.B
        return D @ self.A, D @ self.C, D @ self.N

    def half_width(self, u):
        if self.shape == 'point':
            return self.W * np.clip(1 - u, 0, 1) ** 0.85 * (0.75 + 0.25 * np.sqrt(np.clip(u * 4, 0, 1)))
        return self.W * np.sqrt(np.clip(1 - u * u, 0, 1)) * (0.8 + 0.2 * np.sqrt(np.clip(u * 3, 0, 1)))

    def sdf(self, Q):
        return CV.ear(Q, self.B, self.A, self.N, self.L, self.W, self.shape, self.th0, self.th1, self.cup, self.tipin, self.base_r)

    def mask(self, Q, pad=0.0):
        a, c, n = self.coords(Q)
        u = np.clip(a / self.L, 0, 1)
        hw = self.half_width(u)
        p = pad + 0.006 * self.sc
        return (sstep(-0.004 * self.sc, 0.006 * self.sc, a) * sstep(hw + p, hw, np.abs(c)) * sstep(0.03 * self.sc, 0.014 * self.sc, np.abs(n))
                * sstep(self.L + p, self.L, a)).astype(F)

    def tip(self):
        return self.B + self.A * self.L


# ---------- the tail ----------
class Tail:
    """the tail: a sweep through keys (y, z, r, flag) in rig space from its root; the flag (feathering or brush, part of
    the sculpt) on the path normal's side (the underside for a tail going back and down, the outside of a tail curled
    up over the back). bones: the keys where tail1, tail2, tail3 sit."""

    def __init__(self, keys, bones=(1, 3, 5), flag_e=1.8, side=0.95):
        self.K = np.asarray(keys, F)
        if self.K.shape[1] < 4:
            self.K = np.concatenate([self.K, np.zeros((len(self.K), 1), F)], 1)
        self.bi = bones
        self.flag_e, self.side = flag_e, side
        from scipy.interpolate import PchipInterpolator
        K_ = self.K[:, :2].astype(np.float64)
        seg = np.linalg.norm(np.diff(K_, axis=0), axis=1)
        s = np.concatenate([[0], np.cumsum(seg)])
        f = PchipInterpolator(s, K_, axis=0)
        n = 120
        ss = np.linspace(0, s[-1], n)
        yz = f(ss)
        self.TP = np.stack([np.zeros(n), yz[:, 0], yz[:, 1]], 1).astype(F)
        self.TT = (ss / s[-1]).astype(F)
        self.len = float(s[-1])
        self.kt = (s / s[-1]).astype(F)          # t of each key
        from scipy.spatial import cKDTree
        self.tree = cKDTree(self.TP)
        self.bones = [V(0, self.K[i, 0], self.K[i, 1]) for i in bones]
        self.TB_T = [float(self.kt[i]) for i in bones]
        self.rmax = float((self.K[:, 2] + self.K[:, 3]).max())

    def keys(self):
        return [(y, z, r + f, r * self.side, r, self.flag_e if f > 0.1 * r else 2.0, 2.0) for y, z, r, f in self.K]

    def sdf(self, Q):
        return sweep(Q, self.keys())

    def t(self, P):
        """position along the tail (0 root .. 1 tip) and distance from its middle line (mirrored points)"""
        yz = np.stack([np.zeros(len(P)), P[:, 1], P[:, 2]], 1).astype(np.float64)
        d, k = self.tree.query(yz)
        return self.TT[k], d.astype(F)

    def radius(self, t):
        return np.interp(t, self.kt, self.K[:, 2]).astype(F), np.interp(t, self.kt, self.K[:, 3]).astype(F)

    def weights(self, t):
        w = np.zeros((len(t), 3), F)
        e = self.TB_T[1:]
        for i in range(3):
            lo = sstep(e[i - 1] - 0.06, e[i - 1] + 0.06, t) if i > 0 else np.ones_like(t)
            hi = 1 - sstep(e[i] - 0.06, e[i] + 0.06, t) if i < 2 else np.ones_like(t)
            w[:, i] = lo * hi
        return w / np.maximum(w.sum(1, keepdims=True), 1e-9)

    def dir(self, P):
        tt, _ = self.t(P)
        k = np.clip((tt * (len(self.TP) - 1)).astype(int), 0, len(self.TP) - 2)
        d = self.TP[k + 1] - self.TP[k]
        return (d / np.maximum(np.linalg.norm(d, axis=1, keepdims=True), 1e-9)).astype(F)

    def normal(self, P):
        """the path normal (the sweep section's 'top' side) at the nearest path point"""
        d = self.dir(P)
        return np.stack([np.zeros(len(d), F), d[:, 2], -d[:, 1]], 1)

    def box(self, pad):
        lo = self.TP.min(0) - self.rmax - pad
        hi = self.TP.max(0) + self.rmax + pad
        lo[0], hi[0] = -self.rmax - pad, self.rmax + pad
        return lo.astype(F), hi.astype(F)


TAIL_BONES = ['tail1', 'tail2', 'tail3']


def _box_of(pts, pad):
    pts = np.asarray(pts, F)
    lo, hi = pts.min(0) - pad, pts.max(0) + pad
    return lo.astype(F), hi.astype(F)


def _corners(lo, hi):
    lo, hi = np.asarray(lo, F), np.asarray(hi, F)
    return np.array([[x, y, z] for x in (lo[0], hi[0]) for y in (lo[1], hi[1]) for z in (lo[2], hi[2])], F)


# ---------- a breed ----------
class Breed:
    """a dog breed refitted from the golden retriever. fit: Fit; ear: DropEar or ErectEar (or a function of the Fit
    returning one); tail: Tail (or a function of the Fit); eye: dict(k radius factor, d = (dx, du, ds) moved in the
    golden head frame, dir turned by (yaw, pitch), lid_w, lid_h, slant, sink, off); paw: paw size factor;
    head_extra(Lb, d, fit): more shape on the head in its own frame (golden units); body_extra(P, d, breed): more
    shape on the body (a ruff, feathering); coat: dict(cell, l0, l1, wid, dens) for the coat strokes."""

    def __init__(self, id, fit, ear, tail, eye=None, paw=1.0, head_extra=None, body_extra=None, coat=None, puppy=None, nose=1.0,
                 whiskers=1.0, collar=None, bounds_pad=(0.0, 0.0, 0.0), pup_head=None):
        self.id = id
        self.pup_head = pup_head
        self.fit = fit
        f = fit
        self.s, self.sh = f.s, f.sh
        self.ear = ear(f) if callable(ear) else ear
        self.tail_ = tail(f) if callable(tail) else tail
        E = dict(k=1.0, d=(0.0, 0.0, 0.0), turn=(0.0, 0.0), lid_w=1.0, lid_h=1.0, slant=0.1, sink=0.3, off=1.0, mound=1.0)
        E.update(eye or {})
        self.E = E
        ge = G.HF.pt(0.108 + E['d'][2], 0.014 + E['d'][1], 0.0425 + E['d'][0])
        c0 = f.head_fwd(ge[None])[0]
        dr = _rot_x(G.EYE.d, f.H['pitch'] + E['turn'][1])
        cy, sy = np.cos(E['turn'][0]), np.sin(E['turn'][0])
        dr = nrm(V(dr[0] * cy + dr[2] * sy, dr[1], -dr[0] * sy + dr[2] * cy))
        ek = f.sh * E['k']
        self.ek = ek
        m = E['mound']
        self.EYE = CV.Eye(c0, 0.0108 * ek, dr, lid_w=0.0104 * ek * E['lid_w'], lid_h=0.0066 * ek * E['lid_h'], off=0.0006 * ek * E['off'],
                          slant=E['slant'], mound=(0.0034 * ek * m, 0.003 * ek * m, 0.0012 * ek * m), sink=E['sink'])
        self.kpaw = paw
        self.sp = f.s * paw
        self.head_extra, self.body_extra = head_extra, body_extra
        C = dict(cell=0.0055, l0=0.008, l1=0.016, wid=0.0009, seed=91)
        C.update(coat or {})
        self.coat = C
        self.nose = nose
        self.whisk = whiskers
        self.collar = collar or {'at': ['neck2', 'head', 0.15], 'lift': 0.35, 'maxR': 0.085 * f.s * f.kw}
        self.PAW_F = f.fwd(G.PAW_F[None], 'f')[0]
        self.PAW_H = f.fwd(G.PAW_H[None], 'h')[0]
        # the puppy's rounder barrel (the golden's egg refitted)
        g = G.PUPPY
        self.PUPPY = dict(c=f.fwd(g['c'][None])[0], r=(g['r'][0] * f.s * f.kw, g['r'][1] * f.s * f.kB, g['r'][2] * f.s * f.kz), rb=g['rb'] * f.s * f.kB,
                          e=g['e'], maxd=g['maxd'] * f.s)
        if puppy:
            self.PUPPY.update(puppy)
        self._boxes(bounds_pad)
        self._scache = {}

    # ----- where things are -----
    def _boxes(self, pad3):
        f, s, sh = self.fit, self.s, self.sh
        bx = {}
        def body_box(lo, hi, leg=None, pad=0.02):
            return _box_of(f.fwd(_corners(lo, hi), leg), pad * s)
        bx['trunk'] = body_box((-0.17, 0.25, -0.45), (0.17, 0.62, 0.33), pad=0.03)
        bx['neck'] = body_box((-0.17, 0.3, -0.06), (0.17, 0.79, 0.45), pad=0.04)
        hb = f.head_fwd(_corners((-0.13, 0.55, 0.27), (0.13, 0.8, 0.64)))
        bx['head'] = _box_of(hb, 0.03 * sh)
        bx['eye'] = _box_of([self.EYE.c - 2.6 * self.EYE.r, self.EYE.c + 2.6 * self.EYE.r], 0.002)
        bx['eye'][0][0] = -bx['eye'][1][0]
        ea = self.ear
        ept = [ea.B + ea.A * ea.L * u + ea.C * ea.W * v + ea.N * 0.02 * sh * w for u in (0, 0.5, 1) for v in (-1.2, 1.2) for w in (-1, 1)]
        ept += [ea.B - ea.A * 0.02 * sh]
        b = _box_of(ept, 0.03 * sh)
        bx['ear'] = (np.array([-b[1][0], b[0][1], b[0][2]], F), b[1])
        bx['fleg'] = body_box((-0.16, -0.01, 0.02), (0.16, 0.62, 0.32), 'f', 0.03)
        bx['hleg'] = body_box((-0.17, -0.01, -0.47), (0.17, 0.66, -0.06), 'h', 0.03)
        pf, ph = self.PAW_F, self.PAW_H
        bx['paw'] = (V(-max(pf[0], ph[0]) - 0.06 * self.sp, -0.01, ph[2] - 0.06 * self.sp), V(max(pf[0], ph[0]) + 0.06 * self.sp, 0.07 * self.sp, pf[2] + 0.07 * self.sp))
        bx['tail'] = self.tail_.box(0.03 * s)
        self.box = bx
        allp = np.concatenate([_corners(*v) for v in bx.values()])
        lo, hi = allp.min(0) - 0.01, allp.max(0) + 0.01
        lo[1] = 0.0
        hi = hi + np.asarray(pad3, F)
        lo[0], hi[0] = -max(-lo[0], hi[0]), max(-lo[0], hi[0])
        self.BOUNDS = (lo.astype(F), hi.astype(F))

    # ----- the field -----
    def trunk(self, P):
        return G.trunk(self.fit.inv(P)) * (self.s * self.fit.kd)

    def neck(self, P):
        return G.neck(self.fit.inv(P)) * (self.s * self.fit.kd)

    def head(self, P):
        Pg, Lg = self.fit.head_inv(P)
        d = G.head(Pg) * (self.sh * self.fit.kdh)
        if self.head_extra is not None:
            d = self.head_extra(self.fit.hloc(mirror(P)), d, self)
        return d

    def eye_parts(self, P):
        return self.EYE.parts(mirror(P))

    def ears(self, P):
        return self.ear.sdf(mirror(P))

    def fleg(self, P):
        return G.fleg(self.fit.inv(P, 'f')) * (self.s * self.fit.kdl)

    def hleg(self, P):
        return G.hleg(self.fit.inv(P, 'h')) * (self.s * self.fit.kdl)

    def paws(self, P):
        """round compact paws (the golden's, scaled by sp), the front dewclaw"""
        Q = mirror(P)
        k = self.sp
        ft = [tuple(v * k for v in t) for t in G.F_TOES]
        ht = [tuple(v * k for v in t) for t in G.H_TOES]
        a, ca = CV.paw(Q, self.PAW_F, ft, pad=tuple(v * k for v in (0.026, 0.02, 0.024)), claw=(0.006 * k, 0.0026 * k), yaw=0.1)
        b, cb = CV.paw(Q, self.PAW_H, ht, pad=tuple(v * k for v in (0.024, 0.019, 0.023)), claw=(0.0055 * k, 0.0024 * k), yaw=0.06)
        o = self.PAW_F
        dw = round_cone(Q, o + V(-0.012, 0.05, -0.031) * k, o + V(-0.017, 0.038, -0.023) * k, 0.0045 * k, 0.0028 * k)
        cdw = round_cone(Q, o + V(-0.017, 0.037, -0.022) * k, o + V(-0.019, 0.03, -0.017) * k, 0.0018 * k, 0.0008 * k)
        return np.minimum(smin(a, dw, 0.006 * k), b), np.minimum.reduce([ca, cb, cdw])

    def tail(self, P):
        return self.tail_.sdf(mirror(P))

    def parts(self, P):
        ca, li, ba = self.eye_parts(P)
        pw, cl = self.paws(P)
        return {'trunk': self.trunk(P), 'neck': self.neck(P), 'head': self.head(P), 'ear': self.ears(P), 'lids': li, 'ball': ba,
                'fleg': self.fleg(P), 'hleg': self.hleg(P), 'paw': pw, 'claw': cl, 'tail': self.tail(P)}

    def shape(self, P):
        s, sh, bx = self.s, self.sh, self.box
        d = local(P, *bx['trunk'], self.trunk)
        d = smin(d, local(P, *bx['neck'], self.neck), 0.07 * s)
        h = local(P, *bx['head'], self.head)
        ca, li, ba = local_n(P, *bx['eye'], self.eye_parts, 3)
        e = self.ek
        h = smin(h, li, 0.005 * e)
        h = smax(h, -ca, 0.0018 * e)
        h = smin(h, ba, 0.001 * e)
        d = smin(d, h, 0.035 * sh)
        d = smin(d, local(P, *bx['ear'], self.ears), 0.012 * sh)
        d = smin(d, local(P, *bx['fleg'], self.fleg), 0.045 * s)
        d = smin(d, local(P, *bx['hleg'], self.hleg), 0.05 * s)
        pw, cl = local_n(P, *bx['paw'], self.paws, 2)
        d = smin(d, pw, 0.012 * self.sp)
        d = np.minimum(d, cl)
        d = smin(d, local(P, *bx['tail'], self.tail), 0.03 * s)
        if self.body_extra is not None:
            d = self.body_extra(P, d, self)
        return d

    # ----- for the pipeline -----
    def patches(self):
        e, s, sh = self.EYE, self.s, self.sh
        k = self.ek
        # the eye and its lids
        out = [(V(e.c[0] - 0.02 * k, e.c[1] - 0.02 * k, e.c[2] - 0.02 * k), V(e.c[0] + 0.02 * k, e.c[1] + 0.02 * k, e.c[2] + 0.022 * k), 0.0006 * min(1.0, k))]
        # muzzle, nose and lips: the golden's box through the head's map
        mb = self.fit.head_fwd(_corners(G.HF.pt(0.19, 0.0) * V(0, 1, 1) + V(0.0, -0.075, -0.01), G.HF.pt(0.258, 0.0) * V(0, 1, 1) + V(0.045, 0.02, 0.01)))
        lo, hi = _box_of(mb, 0.004 * sh)
        lo[0] = 0.0
        out.append((lo, hi, 0.0008 * min(1.0, sh)))
        ea = self.ear
        ept = [ea.B + ea.A * ea.L * u + ea.C * ea.W * v + ea.N * 0.012 * sh * w for u in (0, 1) for v in (-1.15, 1.15) for w in (-1, 1)]
        lo, hi = _box_of(ept, 0.006 * sh)
        lo[0] = max(lo[0], 0.004 * sh)
        out.append((lo, hi, 0.0012 * min(1.0, sh)))
        k = self.sp
        pf, ph = self.PAW_F, self.PAW_H
        out.append((pf + V(-0.037, -0.001, -0.037) * k, pf + V(0.038, 0.04, 0.038) * k, 0.0009 * min(1.0, k)))
        out.append((ph + V(-0.036, -0.001, -0.038) * k, ph + V(0.039, 0.04, 0.042) * k, 0.0009 * min(1.0, k)))
        return out

    def preview(self):
        """the golden's camera views refitted"""
        f, out = self.fit, {}
        for name, (p, t, fov) in G.PREVIEW.items():
            p, t = V(*p), V(*t)
            if name in ('face', 'faceside', 'eye', 'muzzle', 'headside', 'headtop', 'headfront', 'head3q'):
                tb = f.head_fwd(t[None])[0]
                pb = tb + (p - t) * self.sh
            else:
                tb = f.fwd(t[None])[0]
                pb = tb + (p - t) * self.s
            out[name] = (tuple(float(v) for v in pb), tuple(float(v) for v in tb), fov)
        return out

    def keep(self, P):
        Pm = mirror(P)
        Pg = self.fit.gpt(Pm)
        _, td = self.tail_.t(Pm)
        tl = sstep(self.tail_.rmax * 1.6, self.tail_.rmax * 1.1, td) * sstep(0.006 * self.s, 0.0, self.tail(Pm) - self.trunk(Pm) + 0.004 * self.s)
        K = G.KEEP
        base = K[0] + (K[6] - K[0]) * tl
        e = sstep(0.034 * self.ek, 0.016 * self.ek, np.linalg.norm(Pm - self.EYE.c, axis=1)) * K[1]
        L = G.HF.loc(Pg)
        hd = sstep(-0.02, 0.02, L[:, 2]) * sstep(0.56, 0.6, Pg[:, 1]) * K[2] * self.fit.head_w(Pm)
        m = sstep(0.19, 0.22, L[:, 2]) * sstep(-0.09, -0.07, L[:, 1]) * K[3] * self.fit.head_w(Pm)
        er = self.ear.mask(Pm) * K[4]
        pw = sstep(0.045 * self.sp, 0.028 * self.sp, Pm[:, 1]) * K[5]
        return np.maximum.reduce([base, e, hd, m, er, pw]).astype(F)

    def lowpoly_fix(self, bm, hi):
        import meshfix as MX
        f, s = self.fit, self.s
        tr = MX.tree(hi)
        a, b = f.fwd(np.array([[0.0, 0.48, 0.2], [0.0, 0.49, -0.37]], F))
        y_lo = float(f.fwd(np.array([[0, 0.3, 0]], F))[0, 1])
        MX.rings(bm, tr, a, b, 0.05 * s, lambda c, p0, r: c.y > y_lo and r < 0.17 * s * max(f.kw, f.kB))
        pts = f.fwd(np.array([[0, k[0], k[1]] for k in G.NECK], F))
        zn = float(f.fwd(np.array([[0, 0.5, 0.2]], F))[0, 2])
        yn = float(f.fwd(np.array([[0, 0.42, 0.2]], F))[0, 1])
        for p, q in zip(pts[:-2], pts[1:-1]):
            MX.rings(bm, tr, p, q, 0.05 * s, lambda c, p0, r: r < 0.12 * s * f.kw and c.z > zn and c.y > yn)
        T = self.tail_
        tp = [V(0, y, z) for y, z, _, _ in T.K]
        rr = T.rmax * 1.5
        def on_tail(c, p0, r):
            if r > rr:
                return False
            q = np.array([[abs(c.x), c.y, c.z]], F)
            return bool(self.tail(q)[0] < self.trunk(q)[0] - 0.003 * s)
        for p, q in zip(tp[:-1], tp[1:]):
            MX.rings(bm, tr, p, q, 0.038 * s, on_tail)
        MX.finish(bm, 2e-8 * s * s)

    def uv_regions(self, P):
        Pm = mirror(P)
        Pg = self.fit.gpt(Pm)
        L = G.HF.loc(Pg)
        y, z = Pg[:, 1], Pg[:, 2]
        lab = np.full(len(P), 2)
        hw = self.fit.head_w(Pm)
        head = (L[:, 2] > -0.012) & (y > 0.58) & (hw > 0.5)
        neck = ~head & (z > 0.2) & (y > 0.45)
        fleg = (z > 0.05) & (y < 0.4) & ~neck
        hleg = (z <= 0.05) & (y < 0.44) & (z > -0.38)
        _, td = self.tail_.t(Pm)
        tl = (td < self.tail_.rmax * 1.3) & (self.tail(Pm) < self.trunk(Pm) - 0.002 * self.s)
        lab[neck] = 1
        lab[head] = 0
        lab[fleg] = 3
        lab[fleg & (y < 0.2)] = 4
        lab[hleg] = 5
        lab[hleg & (y < 0.2)] = 6
        lab[tl] = 7
        lab[self.ear.mask(Pm, pad=0.004 * self.sh) > 0.5] = 8
        return lab

    def uv_weight(self, P):
        Pm = mirror(P)
        Pg = self.fit.gpt(Pm)
        L = G.HF.loc(Pg)
        head = sstep(-0.02, 0.02, L[:, 2]) * sstep(0.58, 0.62, Pg[:, 1])
        paw = sstep(0.06 * self.sp, 0.03 * self.sp, Pm[:, 1])
        under = sstep(0.4, 0.36, Pg[:, 1]) * sstep(0.05, 0.03, Pg[:, 0]) * sstep(0.34, 0.25, Pg[:, 1])
        return (0.9 + 0.85 * head + 0.25 * paw - 0.25 * under).astype(F)

    def bone_tips(self, P):
        f = self.fit
        t = {'hips': P['chest'], 'rump': P['hips'], 'chest': P['neck'], 'neck': P['neck2'], 'neck2': P['head'], 'head': f.head_fwd(G.HF.pt(0.24, 0.0)[None])[0],
             'tail1': P['tail2'], 'tail2': P['tail3'], 'tail3': V(0, *self.tail_.K[-1, :2])}
        for sd, sg in (('L', 1), ('R', -1)):
            m = V(sg, 1, 1)
            t['thigh' + sd] = P['shin' + sd]; t['shin' + sd] = P['hmeta' + sd]; t['hmeta' + sd] = P['hpaw' + sd]; t['hpaw' + sd] = (self.PAW_H + V(0, 0.01, 0.03) * self.sp) * m
            t['arm' + sd] = P['fore' + sd]; t['fore' + sd] = P['fmeta' + sd]; t['fmeta' + sd] = P['fpaw' + sd]; t['fpaw' + sd] = (self.PAW_F + V(0, 0.01, 0.03) * self.sp) * m
            t['ear' + sd] = self.ear.tip() * m
        return t

    def fix_weights(self, W, wpos, names, G_, weld):
        bi = {n: i for i, n in enumerate(names)}
        W[:, bi['ctag']] = 0
        x = wpos[:, 0]
        Pm = mirror(wpos)
        y = Pm[:, 1]
        s = self.s
        for b in names:
            if b.endswith('L') and b[:-1] + 'R' in bi:
                r = bi[b[:-1] + 'R']; l = bi[b]
                pos = x > 0.01 * s
                W[pos, l] += W[pos, r]; W[pos, r] = 0
                neg = x < -0.01 * s
                W[neg, r] += W[neg, l]; W[neg, l] = 0
        # the tail: by position along its middle line, blending into the rump at its root
        T = self.tail_
        tt, td = T.t(Pm)
        tdist = self.tail(Pm)
        on = (td < T.rmax * 1.4) & (tdist < self.trunk(Pm) + 0.002 * s)
        if on.any():
            tw = T.weights(tt[on])
            k = (sstep(0.0, 0.08, tt[on]) * sstep(-0.004 * s, -0.012 * s, tdist[on] - self.trunk(Pm[on])))[:, None]
            k = np.maximum(k, sstep(0.08, 0.16, tt[on])[:, None])
            rows = np.zeros((on.sum(), W.shape[1]), F)
            for i, b in enumerate(TAIL_BONES):
                rows[:, bi[b]] = tw[:, i]
            W[on] = W[on] * (1 - k) + rows * k
        # ears ride on the ear bones, blending into the head at the fold
        ea = self.ear
        a, c, n = ea.coords(Pm)
        on = (ea.sdf(Pm) < 0.003 * self.sh) & (a > -0.006 * self.sh) & (self.head(wpos) > -0.002 * self.sh)
        k = sstep(-0.004 * self.sh, 0.02 * self.sh, a)
        for sd, sg in (('L', 1), ('R', -1)):
            CV.set_part(W, bi, on & (x * sg > 0), 'ear' + sd, k)
        # paws: the toes and pads on the paw bones
        sp = self.sp
        for sd, sg in (('L', 1), ('R', -1)):
            for c0, b in ((self.PAW_F, 'fpaw'), (self.PAW_H, 'hpaw')):
                near = (np.abs(x - sg * c0[0]) < 0.045 * sp) & (Pm[:, 2] > c0[2] - 0.03 * sp) & (Pm[:, 2] < c0[2] + 0.05 * sp) & (y < 0.045 * sp)
                CV.set_part(W, bi, near, b + sd, sstep(0.04 * sp, 0.022 * sp, y))
        sm = W.sum(1, keepdims=True)
        return W / np.maximum(sm, 1e-9)

    # ----- coat: flow, regions, strokes -----
    def flow(self, P, N=None):
        """the golden's coat flow through the maps; the ears and the tail their own"""
        f = self.fit
        Pg = f.gpt(P)
        fl = G.flow(Pg, None)
        # stretch with the body's map, turn with the head
        yg = mirror(Pg)[:, 1]
        fl = fl * np.stack([np.full(len(P), f.kw, F), f.slope(yg).astype(F), np.full(len(P), f.kz, F)], 1)
        hw = f.head_w(mirror(P))[:, None]
        c, sn = np.cos(f.H['pitch']), np.sin(f.H['pitch'])
        fr = np.stack([fl[:, 0], fl[:, 1] * c + fl[:, 2] * sn, -fl[:, 1] * sn + fl[:, 2] * c], 1)
        fl = fl * (1 - hw) + fr * hw
        Q = mirror(P)
        sg = np.where(P[:, 0] < 0, -1.0, 1.0).astype(F)
        # the tail: along it, the brush or feathering hanging off its normal side
        T = self.tail_
        _, td = T.t(Q)
        wt = sstep(T.rmax * 1.6, T.rmax * 1.0, td) * sstep(0.003 * self.s, -0.004 * self.s, self.tail(Q) - self.trunk(Q))
        tdir = T.dir(Q) + 0.35 * T.normal(Q)
        tdir[:, 0] = tdir[:, 0] * sg
        fl = fl * (1 - wt)[:, None] + tdir * wt[:, None]
        # the ears: down a drop ear, up an erect one
        ea = self.ear
        we = ea.mask(Q)
        ed = (ea.A + 0.25 * ea.C)[None, :] * np.ones((len(P), 1), F)
        ed[:, 0] = ed[:, 0] * sg
        fl = fl * (1 - we)[:, None] + ed * we[:, None]
        fl = fl / np.maximum(np.linalg.norm(fl, axis=1, keepdims=True), 1e-9)
        return fl.astype(F)

    def regions(self, P, N, c):
        """the golden's regions (through the maps, so its masks for the head, the chest, the legs... still apply) with
        the breed's own eyes, nose, ears, paws and tail"""
        f = self.fit
        x = P[:, 0]
        r = {}
        Pm = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.where(x < 0, -1, 1)
        Pg = mirror(f.gpt(Pm))
        r['Pm'], r['Nm'], r['Pg'] = Pm, Nm, Pg
        L = G.HF.loc(Pg)
        r['L'] = L
        E = self.EYE
        de = np.linalg.norm(Pm - E.c, axis=1)
        r['eyeD'] = de
        r['ball'] = sstep(0.001, 0.0002, c['ball']) * sstep(E.r + 0.004 * self.ek, E.r + 0.001 * self.ek, de)
        El = E.loc(Pm)
        ua = El[:, 1] - E.off - E.slant * El[:, 0]
        ring = np.sqrt((El[:, 0] / (E.lid_w + 0.0028 * self.ek)) ** 2 + (ua / (E.lid_h + 0.0025 * self.ek)) ** 2)
        r['lid'] = sstep(1.15, 0.9, ring) * (1 - r['ball']) * sstep(E.r + 0.01 * self.ek, E.r + 0.005 * self.ek, de)
        hw = f.head_w(Pm)
        r['hw'] = hw
        r['head'] = sstep(-0.015, 0.012, L[:, 2]) * sstep(0.005 * self.sh, 0.0, c['head']) * sstep(0.2, 0.6, hw)
        r['nose'] = sstep(0.0012, 0.0, superellipsoid(L, V(0.0, -0.004, G.NOSE_S - 0.002), (0.0162, 0.0122, 0.0112), 3.0, rb=0.011)) * sstep(G.NOSE_S - 0.01, G.NOSE_S - 0.005, L[:, 2]) * r['head']
        lipu = -0.0515 - 0.004 * sstep(0.2, 0.145, L[:, 2])
        r['lip'] = sstep(0.0022, 0.0008, np.abs(L[:, 1] - lipu)) * sstep(0.135, 0.15, L[:, 2]) * r['head']
        ea = self.ear
        a, cc, n = ea.coords(Pm)
        r['ea'], r['ec'], r['en'] = a, cc, n
        r['ear'] = sstep(0.003 * self.sh, 0.0008 * self.sh, c['ear']) * sstep(-0.004 * self.sh, 0.01 * self.sh, a)
        r['earIn'] = sstep(0.1, -0.4, Nm @ ea.N)
        y = Pm[:, 1]
        sp = self.sp
        r['paw'] = sstep(0.004 * sp, 0.0, c['paw']) * sstep(0.045 * sp, 0.03 * sp, y)
        r['pad'] = sstep(-0.2, -0.75, N[:, 1]) * sstep(0.008 * sp, 0.003 * sp, y)
        r['claw'] = sstep(0.001 * sp, 0.0, c['claw'])
        T = self.tail_
        tt, td = T.t(Pm)
        r['tt'], r['td'] = tt, td
        r['tail'] = sstep(0.008 * self.s, 0.0, c['tail']) * sstep(0.004 * self.s, -0.004 * self.s, c['tail'] - c['trunk']) * sstep(T.rmax * 1.6, T.rmax * 1.1, td)
        # the side of the tail its flag or brush is on (the path normal)
        r['tailUnder'] = sstep(-0.1, 0.5, (Nm * T.normal(Pm)).sum(1)) * r['tail']
        r['top'] = sstep(0.3, 0.85, N[:, 1])
        return r

    def markings(self, R, N):
        """the golden's pale feathering masks (chest, throat, belly, backs of the legs, under the tail...) and the
        saddle, muzzle and brows, through the maps"""
        Pg = R['Pg']
        L = R['L']
        y, z = Pg[:, 1], Pg[:, 2]
        w2 = fbm(Pg * 30, 2, 42) - 0.5
        hd = R['head']
        Nm = R['Nm']
        chest = sstep(0.16, 0.24, z) * sstep(0.55, 0.42, y + 0.1 * w2) * sstep(0.2, -0.4, N[:, 1] - N[:, 2] * 0.3) * (1 - hd)
        throat = sstep(0.25, 0.32, z) * sstep(-0.1, -0.6, N[:, 1] - 0.5 * N[:, 2]) * (1 - hd)
        belly = sstep(-0.35, -0.8, N[:, 1]) * sstep(0.44, 0.38, y) * (1 - R['tail'])
        fback = sstep(0.05, 0.12, z) * sstep(-0.1, -0.7, N[:, 2]) * sstep(0.1, 0.2, y) * sstep(0.4, 0.32, y)
        trousers = sstep(-0.18, -0.24, z) * sstep(0.0, -0.6, N[:, 2]) * sstep(0.2, 0.3, y) * sstep(0.52, 0.42, y) * (1 - R['tail'])
        inner = sstep(0.0, -0.5, Nm[:, 0]) * sstep(0.42, 0.34, y) * sstep(0.08, 0.14, y)
        under_tail = R['tailUnder']
        legs = sstep(0.3, 0.2, y) * (1 - R['tail'])
        saddle = R['top'] * (1 - hd) * sstep(0.44, 0.5, y) * (1 - R['tail'] * 0.5)
        muzzle = hd * sstep(0.13, 0.17, L[:, 2])
        brow = hd * sstep(0.022, 0.012, np.linalg.norm(Pg - (G.EYE.c + V(-0.004, 0.017, -0.004)), axis=1))
        return dict(chest=chest, throat=throat, belly=belly, fback=fback, trousers=trousers, inner=inner, under_tail=under_tail, legs=legs,
                    saddle=saddle, muzzle=muzzle, brow=brow, w2=w2)

    def strands(self, P, N, R, lenk=None):
        key = (len(P), float(P[:7].sum()))
        if key not in self._scache:
            C = self.coat
            dens = 0.92 * (1 - R['nose']) * (1 - R['ball']) * (1 - R['claw']) * (1 - R['pad']) * (1 - 0.7 * R['lip']) * sstep(self.EYE.r + 0.003 * self.ek, self.EYE.r + 0.008 * self.ek, R['eyeD'])
            self._scache[key] = CV.strands(P, N, dens, self.flow, C['cell'], C['l0'], C['l1'], C['wid'], seed=C['seed'], lenk=lenk)
        return self._scache[key]

    def bare(self, col, R, n1, n2, nose=None, lip=None, pad=None, claw=None, clawLt=None, rim=None):
        """the bare parts on top of the coat: lips, eye rims, nose leather, pads, claws"""
        K = G.K
        lip = K['lip'] if lip is None else lip
        col = mix(col, lip, R['lip'] * 0.55)
        col = mix(col, lip if rim is None else rim, R['lid'] * 0.95)
        nose = K['nose'] if nose is None else nose
        nos = mix(np.tile(nose, (len(col), 1)), np.clip(nose + 0.13, 0, 1), sstep(0.3, 0.8, n2) * 0.6)
        col = mix(col, nos, R['nose'])
        col = mix(col, K['pad'] if pad is None else pad, R['pad'] * R['paw'])
        col = mix(col, mix(np.tile(K['claw'] if claw is None else claw, (len(col), 1)), K['clawLt'] if clawLt is None else clawLt, sstep(0.4, 0.7, n1)), R['claw'])
        return col

    def detail(self, P, N, c):
        R = self.regions(P, N, c)
        Pm = R['Pm']
        h = np.zeros(len(P), F)
        s, tone = self.strands(P, N, R)
        h += 0.00011 * min(1.0, self.coat['l1'] / 0.016) * s * (1 - R['ball']) * (1 - R['nose']) * (1 - R['lip'])
        g1, _ = worley(Pm / (0.0011 * min(1.0, self.sh)), 58)
        h -= 0.00006 * sstep(0.35, 0.1, g1) * R['nose']
        g2, _ = worley(Pm / (0.0016 * min(1.0, self.sp)), 59)
        h += 0.00008 * sstep(0.1, 0.5, g2) * R['pad'] * R['paw']
        return h

    def finish(self, C, ao, valid):
        return CV.finish(C, ao, valid, 0.45)

    def stats(self, P, N, c, col):
        R = self.regions(P, N, c)
        return {'lidCol': CV.lid_color(col, R['eyeD'], self.EYE.r)}

    def meta_base(self, st, iris=0x5C3416, babyIris=0x2E2A2A, babyLid=0xC8A070, flat=0xC98C48, rim=(0.22, 0.14, 0.06), pupilR=0.46):
        p, r, d, lid = self.EYE.meta()
        f = self.fit
        belly = f.fwd(np.array([[0.0, 0.41, -0.14]], F))[0]
        mouth = f.head_fwd(G.MOUTH[None])[0]
        return {
            'eye': {'p': p, 'r': r, 'dir': d, 'lid': lid, 'iris': iris, 'irisR': 0.9, 'pupilR': pupilR, 'rim': 0x1A0E06,
                    'lidCol': st['lidCol'], 'babyLidCol': babyLid, 'babyIris': babyIris},
            'collar': self.collar,
            'belly': [0.0, round(float(belly[1]), 4), round(float(belly[2]), 4)],
            'mouth': [round(float(v), 4) for v in mouth],
            'tint': [1.0, 1.0, 1.0], 'babyTint': [1.0, 1.0, 1.0],
            'rim': list(rim), 'flat': flat,
        }

    # ----- puppies -----
    def _egg_walk(self, Q, Nm):
        g = self.PUPPY
        egg = lambda X: superellipsoid(X, g['c'], g['r'], g['e'], rb=g['rb'])
        X = Q.copy()
        st = 0.008 * self.s
        for _ in range(16):
            X = X - Nm * np.clip(egg(X), -st, st)[:, None]
        d = X - Q
        ln = np.linalg.norm(d, axis=1, keepdims=True)
        return d * np.minimum(1, g['maxd'] / np.maximum(ln, 1e-9))

    def baby_offset(self, P, N, c):
        """the deep chest and tucked loin round off into a puppy's barrel (the golden's egg, refitted); the head gets
        the puppy's rounder skull and softer muzzle (dog.puppy_head, through the head's map)"""
        f = self.fit
        Q = mirror(P)
        Nm = N.copy(); Nm[:, 0] = N[:, 0] * np.where(P[:, 0] < 0, -1, 1)
        d = self._egg_walk(Q, Nm)
        legd = np.minimum(c['fleg'], c['hleg'])
        Pg = f.inv(Q)
        y, z, s = Pg[:, 1], Pg[:, 2], self.s
        w = sstep(0.07 * s, -0.02 * s, c['trunk'] - legd)
        w = np.maximum(w, 0.6 * sstep(0.3, 0.4, y) * sstep(-0.1, -0.16, z) + 0.35 * sstep(0.36, 0.44, y) * sstep(0.05, 0.1, z))
        w = w * sstep(-0.02 * s, 0.06 * s, np.minimum(c['head'], c['neck']) - c['trunk']) * sstep(0.3, 0.16, z) * sstep(-0.52, -0.43, z)
        w = w * (1 - sstep(0.03 * s, -0.005 * s, c['tail'] - c['trunk']))
        d = d * w[:, None]
        # the throat tucked in, the nape filled up to the back of the bigger head (as the golden's)
        g = G.PUPPY
        thr = sstep(0.2, 0.28, z) * sstep(0.4, 0.46, y) * sstep(0.66, 0.6, y) * sstep(-0.1, -0.5, Nm[:, 1] - 0.4 * Nm[:, 2])
        d = d - Nm * (g['throat'] * s * thr)[:, None]
        hw = f.head_w(Q)
        nape = sstep(0.19, 0.31, z) * sstep(0.55, 0.62, y) * sstep(-0.2, 0.3, Nm[:, 1] - 0.5 * Nm[:, 2]) * (1 - hw)
        d = d + Nm * (g['nape'] * self.sh * nape)[:, None]
        # the head: the golden's puppy head offsets (in its head frame) carried through the head's map
        on = hw > 0.01
        if on.any():
            Lb = f.hloc(Q[on])
            Lg = f.head_local_inv(Lb)
            ec = f.head_local_inv(f.hloc(self.EYE.c[None]))[0]
            dg = G.puppy_head(Lg, {k: v[on] for k, v in c.items()}, self.sh, (ec, self.EYE.r / self.sh), self.pup_head)
            # golden head-local offsets -> breed rig offsets (the head's map is close to a scale here)
            t = Lg[:, 2]
            Db = np.stack([dg[:, 0] * f.hkx(t), dg[:, 1] * f.hku(t, Lg[:, 1]), dg[:, 2] * f.H['kS']], 1) * self.sh
            Db = self.fit.ha[None] * Db[:, 2:3] + self.fit.hu[None] * Db[:, 1:2] + V(1, 0, 0)[None] * Db[:, 0:1]
            d[on] = d[on] + Db * hw[on][:, None]
        d[:, 0] *= np.where(P[:, 0] < 0, -1, 1)
        return d.astype(F)

    # ----- whiskers -----
    def whiskers(self, shape_fn, n=4, length=1.0, col=0):
        rows = []
        f = self.fit
        for i in range(n):
            s0 = 0.162 + 0.03 * (i % 3) / 2 + 0.004 * (rnd(i, 1) - 0.5)
            u0 = -0.022 - 0.01 * (i // 3) + 0.003 * (rnd(i, 2) - 0.5)
            root = f.from_hloc(f.head_local_fwd(np.array([[0.031 - 0.004 * (i % 3) / 2, u0, s0]], F)))[0]
            d = nrm(V(0.8, 0.0, 0.0) + f.ha * (-0.2 + 0.4 * (i % 3) / 2) + f.hu * (0.15 - 0.25 * (i // 3)))
            rows.append((root, d, (0.03 + 0.012 * rnd(i, 4)) * self.sh * length, 0.0008 * min(1.0, self.sh * 1.4), 0.15, col))
        wk = []
        for sg in (1, -1):
            m = V(sg, 1, 1)
            wk += CV.whiskers([(root * m, d * m, ln, w, droop, cl) for root, d, ln, w, droop, cl in rows], baby=0.6)
        roots = np.array([cd['pts'][0] for cd in wk], F)
        g = CV.gradient(shape_fn, roots)
        dd = shape_fn(roots)
        for cd, gg, d0 in zip(wk, g, dd):
            cd['pts'][0] = cd['pts'][0] - gg * (d0 + 0.001 * self.sh)
        return wk

    # ----- the module -----
    def export(self, g):
        """fill in the species module g (a breed file's globals) with everything it does not define itself"""
        names = dict(BOUNDS=self.BOUNDS, BAKE_DIST=tuple(v * max(0.5, self.s) for v in G.BAKE_DIST), DISSOLVE_DEGENERATE=True, TAIL_RINGS=0,
                     EYE=self.EYE, PATCHES=self.patches(), PREVIEW=self.preview(), KEEP=G.KEEP, UV_AVERAGE=True, UV_PACK=G.UV_PACK,
                     WEIGHT_SMOOTH=G.WEIGHT_SMOOTH, MAP_QUALITY=G.MAP_QUALITY, PAD_SMOOTH=G.PAD_SMOOTH, BABY_TEX=G.BABY_TEX,
                     shape=self.shape, parts=self.parts, keep=self.keep, lowpoly_fix=self.lowpoly_fix, uv_regions=self.uv_regions,
                     uv_weight=self.uv_weight, bone_tips=self.bone_tips, fix_weights=self.fix_weights, flow=self.flow, detail=self.detail,
                     finish=self.finish, stats=self.stats, baby_offset=self.baby_offset)
        for k, v in names.items():
            if k not in g:
                g[k] = v
