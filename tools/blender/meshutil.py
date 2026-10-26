# Mesh helpers shared by the Blender steps: numpy <-> Blender meshes, the mirrored game mesh, skin weights.
import numpy as np
import bpy

F = np.float32


def mesh(name, v, f):
    """Blender mesh from numpy arrays (game coordinates are used as they are)"""
    me = bpy.data.meshes.new(name)
    me.vertices.add(len(v)); me.vertices.foreach_set('co', np.asarray(v, F).ravel())
    f = np.asarray(f, np.int32)
    me.loops.add(f.size); me.loops.foreach_set('vertex_index', f.ravel())
    me.polygons.add(len(f)); me.polygons.foreach_set('loop_start', np.arange(0, f.size, 3, dtype=np.int32))
    me.update(); me.validate()
    me.shade_smooth()
    return me


def tube_uv(pts, rad, segs):
    """tube along a polyline with a cylinder unwrap (u along, v around), closed at the tip"""
    n = len(pts)
    T = np.gradient(pts, axis=0); T /= np.linalg.norm(T, axis=1, keepdims=True)
    Nv = np.cross(T[0], [1, 0, 0]); Nv /= np.linalg.norm(Nv)
    V, UV, Fc = [], [], []
    arc = np.concatenate([[0], np.cumsum(np.linalg.norm(np.diff(pts, axis=0), axis=1))])
    circ = 2 * np.pi * rad.max()
    for i in range(n):
        Nv = Nv - T[i] * np.dot(Nv, T[i]); Nv /= np.linalg.norm(Nv)
        B = np.cross(T[i], Nv)
        for j in range(segs + 1):
            a = 2 * np.pi * j / segs
            V.append(pts[i] + (Nv * np.cos(a) + B * np.sin(a)) * rad[i])
            UV.append([arc[i], j / segs * circ])
    r = segs + 1
    for i in range(n - 1):
        for j in range(segs):
            a, b = i * r + j, i * r + j + 1
            Fc += [[a, b, a + r], [b, b + r, a + r]]
    V.append(pts[-1] + T[-1] * rad[-1] * 0.9); UV.append([arc[-1] + rad[-1], circ * 0.5])
    t = len(V) - 1
    for j in range(segs):
        Fc.append([(n - 1) * r + j, (n - 1) * r + j + 1, t])
    return np.array(V, F), np.array(Fc, np.int64), np.array(UV, F)


def weld_ids(pos, tol=1e-6):
    key = np.round(pos / tol).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    return inv.ravel()


def vertex_normals(pos, tri, weld):
    """area weighted normals accumulated over welded positions (UV seams and the mirror seam stay smooth)"""
    nw = weld.max() + 1
    p = pos[tri]
    fn = np.cross(p[:, 1] - p[:, 0], p[:, 2] - p[:, 0])
    acc = np.zeros((nw, 3))
    for k in range(3):
        np.add.at(acc, weld[tri[:, k]], fn)
    acc /= np.maximum(np.linalg.norm(acc, axis=1, keepdims=True), 1e-12)
    return acc[weld].astype(F)


def game_mesh(V, Fh, UVf, is_tail):
    """split the half mesh by UV, mirror the body to -x (same UVs, flipped winding), append the tail"""
    corners_v = Fh.ravel()
    corners_uv = UVf.reshape(-1, 2)
    key = np.concatenate([corners_v[:, None].astype(np.float64), np.round(corners_uv.astype(np.float64) * 1e6)], 1)
    uk, cid = np.unique(key, axis=0, return_inverse=True)
    cid = cid.ravel()
    gv = uk[:, 0].astype(np.int64)
    pos = V[gv].copy()
    uv = (uk[:, 1:] / 1e6).astype(F)
    tri = cid.reshape(-1, 3)
    tail_v = np.zeros(len(pos), bool)
    tail_v[np.unique(tri[is_tail].ravel())] = True
    body_tri = tri[~is_tail]
    # mirror: every body vertex off the plane gets a twin
    off = (~tail_v) & (pos[:, 0] > 1e-7)
    twin = np.arange(len(pos))
    nidx = np.where(off)[0]
    twin[nidx] = len(pos) + np.arange(len(nidx))
    mp = pos[nidx].copy(); mp[:, 0] *= -1
    pos2 = np.concatenate([pos, mp])
    uv2 = np.concatenate([uv, uv[nidx]])
    mirrored = np.concatenate([np.zeros(len(pos), bool), np.ones(len(nidx), bool)])
    tail2 = np.concatenate([tail_v, np.zeros(len(nidx), bool)])
    mtri = twin[body_tri][:, ::-1]
    idx = np.concatenate([body_tri, mtri, tri[is_tail]])
    # weld by position, keeping the tail apart from the body (it pokes into the rump)
    weld = weld_ids(pos2 + tail2[:, None] * 10.0)
    nrm = vertex_normals(pos2, idx, weld)
    return dict(pos=pos2.astype(F), nrm=nrm, uv=uv2, idx=idx.astype(np.int32).ravel(), weld=weld, mirrored=mirrored, tail=tail2,
                corner=cid.reshape(-1, 3), twin=twin)


def _lap_smooth(W, tri, it, lam):
    n = W.shape[0]
    e = np.concatenate([tri[:, [0, 1]], tri[:, [1, 2]], tri[:, [2, 0]]])
    e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=n).astype(F)[:, None]
    for _ in range(it):
        acc = np.zeros_like(W)
        np.add.at(acc, e[:, 0], W[e[:, 1]])
        W = (1 - lam) * W + lam * acc / np.maximum(deg, 1)
    return W


def weights(G, RIG, mode, S):
    """skin weights per game vertex: (bone indices into RIG['bones'], weights), 4 per vertex"""
    names = [b['name'] for b in RIG['bones']]
    bi = {n: i for i, n in enumerate(names)}
    weld = G['weld']
    nw = weld.max() + 1
    wpos = np.zeros((nw, 3), F); wpos[weld] = G['pos']
    tri = weld[G['idx'].reshape(-1, 3)]
    me = mesh('skin', wpos, tri)
    ob = bpy.data.objects.new('skin', me); bpy.context.scene.collection.objects.link(ob)
    deform = [n for n in names if n != 'ctag']
    Wm = np.zeros((nw, len(names)), F)
    if mode == 'heat':
        arm = bpy.data.armatures.new('arm')
        ao = bpy.data.objects.new('arm', arm); bpy.context.scene.collection.objects.link(ao)
        for o in bpy.context.view_layer.objects: o.select_set(False)
        bpy.context.view_layer.objects.active = ao; ao.select_set(True)
        bpy.ops.object.mode_set(mode='EDIT')
        P = {b['name']: np.array(b['p'], F) for b in RIG['bones']}
        par = {b['name']: b['parent'] for b in RIG['bones']}
        tips = S.bone_tips(P)
        for n in deform:
            eb = arm.edit_bones.new(n)
            eb.head = P[n]; eb.tail = tips[n]
        for n in deform:
            if par[n] and par[n] in arm.edit_bones:
                arm.edit_bones[n].parent = arm.edit_bones[par[n]]
        bpy.ops.object.mode_set(mode='OBJECT')
        for o in bpy.context.view_layer.objects: o.select_set(False)
        ob.select_set(True); ao.select_set(True)
        bpy.context.view_layer.objects.active = ao
        bpy.ops.object.parent_set(type='ARMATURE_AUTO')
    else:
        # transfer from the game's procedural mesh (nearest face, interpolated)
        sv, sf, sw = [], [], []
        o = 0
        for m in RIG['meshes']:
            p = np.array(m['pos'], F).reshape(-1, 3)
            sv.append(p); sf.append(np.array(m['idx']).reshape(-1, 3) + o); o += len(p)
            si = np.array(m['si']).reshape(-1, 4); swt = np.array(m['sw'], F).reshape(-1, 4)
            Wv = np.zeros((len(p), len(names)), F)
            for k in range(4):
                np.add.at(Wv, (np.arange(len(p)), si[:, k]), swt[:, k])
            sw.append(Wv)
        sv, sf, sw = np.concatenate(sv), np.concatenate(sf), np.concatenate(sw)
        src = bpy.data.objects.new('src', mesh('src', sv, sf)); bpy.context.scene.collection.objects.link(src)
        for j, n in enumerate(names):
            g = src.vertex_groups.new(name=n)
            for i in np.where(sw[:, j] > 1e-4)[0]:
                g.add([int(i)], float(sw[i, j]), 'REPLACE')
            ob.vertex_groups.new(name=n)
        md = ob.modifiers.new('dt', 'DATA_TRANSFER')
        md.object = src
        md.use_vert_data = True
        md.data_types_verts = {'VGROUP_WEIGHTS'}
        md.vert_mapping = 'POLYINTERP_NEAREST'
        md.layers_vgroup_select_src = 'ALL'
        md.layers_vgroup_select_dst = 'NAME'
        for o2 in bpy.context.view_layer.objects: o2.select_set(False)
        bpy.context.view_layer.objects.active = ob; ob.select_set(True)
        bpy.ops.object.modifier_apply(modifier='dt')
    for v in ob.data.vertices:
        for g in v.groups:
            n = ob.vertex_groups[g.group].name
            if n in bi:
                Wm[v.index, bi[n]] = g.weight
    # species fixes (the tail tube is all tail, ...), then smooth and keep the 4 biggest
    Wm = S.fix_weights(Wm, wpos, names, G, weld)
    Wm = _lap_smooth(Wm, tri, S.WEIGHT_SMOOTH[0], S.WEIGHT_SMOOTH[1]) if S.WEIGHT_SMOOTH[0] else Wm
    Wm = S.fix_weights(Wm, wpos, names, G, weld)
    order = np.argsort(-Wm, axis=1)[:, :4]
    top = np.take_along_axis(Wm, order, 1)
    top[top < 0.01] = 0
    s = top.sum(1, keepdims=True)
    top = np.where(s > 0, top / np.maximum(s, 1e-9), np.array([1, 0, 0, 0], F))
    order = np.where(s > 0, order, bi['hips'] if 'hips' in bi else 0)   # (a snake has no hips: its first bone)
    return dict(si=order[weld].astype(np.uint8), sw=top[weld].astype(F), bones=np.array(names))
