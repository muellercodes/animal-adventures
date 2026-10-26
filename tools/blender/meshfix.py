# Fix-ups for the decimated game mesh (the +x half as a BMesh), for a species' lowpoly_fix(bm, hi):
# - rings(): the decimator keeps hardly any vertices along smooth stretches (it takes a lizard's tail or a turtle's
#   neck down to a few long triangles), and those cannot bend with the bones. Cut planes across them every pitch and
#   put the new vertices back on the sculpt.
# - cut(): one plane cut through chosen faces (optionally marked as a UV seam).
# - finish(): merge the slivers the cuts leave, keep the middle line exact, triangulate, drop loose specks.
import numpy as np


def tree(hi):
    """BVH of the high detail body, for putting new vertices back on the sculpt"""
    from mathutils.bvhtree import BVHTree
    return BVHTree.FromPolygons(hi['v'].tolist(), hi['f'].tolist())


def cut(bm, tr, p0, ax, faces, seam=False, snap=0.003):
    """bisect the given faces with the plane (p0, normal ax); new vertices go to the nearest sculpt point within snap
    (None: stay where the plane cut them); with seam the new edges become UV seams"""
    import bmesh
    if not faces:
        return
    edges = list({e for f in faces for e in f.edges})
    verts = list({v for f in faces for v in f.verts})
    res = bmesh.ops.bisect_plane(bm, geom=verts + edges + faces, plane_co=p0, plane_no=ax)
    for el in res['geom_cut']:
        if seam and isinstance(el, bmesh.types.BMEdge):
            el.seam = True
        if snap is None or not isinstance(el, bmesh.types.BMVert):
            continue
        mid = abs(el.co.x) < 1e-6
        loc, n, i, dist = tr.find_nearest(el.co, snap)
        if loc is not None:
            el.co = loc
        if mid or el.co.x < 0:
            el.co.x = 0.0


def crossing(bm, p0, ax):
    """faces the plane (p0, ax) passes through, with their centers and distances from the line through p0 along ax"""
    out = []
    for f in bm.faces:
        dd = [(v.co - p0).dot(ax) for v in f.verts]
        if not (min(dd) < 0 < max(dd)):
            continue
        c = f.calc_center_median()
        q = c - p0
        out.append((f, c, (q - ax * q.dot(ax)).length))
    return out


def rings(bm, tr, a, b, pitch, ok):
    """cut rings across the segment a -> b every pitch (first one half a pitch in); ok(center, p0, radius) picks the
    faces each ring goes through"""
    from mathutils import Vector
    a, b = Vector([float(x) for x in a]), Vector([float(x) for x in b])
    ax = b - a
    L = ax.length
    ax.normalize()
    for t in np.arange(pitch * 0.5, L, pitch):
        p0 = a + ax * float(t)
        cut(bm, tr, p0, ax, [f for f, c, r in crossing(bm, p0, ax) if ok(c, p0, r)])


def finish(bm, min_area=2e-7):
    import bmesh
    # cuts that pass right by a vertex leave slivers of no area: merge them away (and keep the middle line exact)
    bmesh.ops.dissolve_degenerate(bm, dist=2e-5, edges=bm.edges[:])
    for v in bm.verts:
        if v.co.x < 3e-5:
            v.co.x = 0.0
    bmesh.ops.triangulate(bm, faces=bm.faces[:])
    # triangles left with no area (three vertices in a line), or lying in the middle plane (the mirrored half would
    # cover them back to back), would give their vertices no normal
    flat = [f for f in bm.faces if f.calc_area() < 1e-11 or all(v.co.x == 0.0 for v in f.verts)]
    if flat:
        bmesh.ops.delete(bm, geom=flat, context='FACES_ONLY')
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context='VERTS')
    drop_crumbs(bm, min_area)


def drop_crumbs(bm, min_area=2e-7):
    """delete tiny loose pieces (a claw tip or a sliver of a groove the voxel grid caught as a separate speck)"""
    import bmesh
    seen, kill = set(), []
    for f0 in bm.faces:
        if f0 in seen:
            continue
        comp, stack = [], [f0]
        seen.add(f0)
        while stack:
            f = stack.pop(); comp.append(f)
            for e in f.edges:
                for g in e.link_faces:
                    if g not in seen:
                        seen.add(g); stack.append(g)
        if len(comp) < 12 or sum(f.calc_area() for f in comp) < min_area:
            kill += comp
    if kill:
        bmesh.ops.delete(bm, geom=kill, context='FACES')
