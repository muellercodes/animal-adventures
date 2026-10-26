# Exports an animal's procedural rig from the game: skeleton (bone names, parents, rest positions in rig root space),
# eye and mouth points, and the procedural mesh with its skin weights. The Blender scripts use it as the shape
# reference and the weight source.
# Usage: python3 tools/blender/export_rig.py pig [out.json]
# Builds the game without models (NO_MODELS=1) into tools/blender/work/build, so the export is always the procedural
# body. Needs Node and Playwright with Chromium (the same setup as tools/assets.py).
import json, os, subprocess, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
WORK = os.path.join(ROOT, 'tools', 'blender', 'work')
OUT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(WORK, f'{SP}-rig.json')
BUILD = os.path.join(WORK, 'build')
os.makedirs(BUILD, exist_ok=True)
env = dict(os.environ, OUT=BUILD, DIST=BUILD, NO_ASSETS='1', NO_MODELS='1', API_BASE='')
subprocess.run(['node', 'build.mjs'], cwd=ROOT, env=env, check=True)

JS = r'''(sp) => {
  const a = __aa, V = a.THREE.Vector3;
  const grab = (age) => {
    const r = a.Animals.build(sp);
    r.setAge(age);
    r.setDetail(1);
    // back to the rest pose: the animator already posed the bones once
    r.root.traverse((o) => { if (o.isBone) { o.position.copy(o.userData.p0); o.quaternion.identity(); o.scale.set(1, 1, 1); } });
    r.root.updateMatrixWorld(true);
    const meshes = [], eyes = [];
    let skel = null;
    r.root.traverse((o) => {
      if (o.isSkinnedMesh && o.visible) {
        skel = o.skeleton;
        const g = o.geometry, at = g.attributes, A = (n) => (at[n] ? Array.from(at[n].array) : null);
        meshes.push({ kind: at.color ? 'accent' : 'body', pos: A('position'), nrm: A('normal'), idx: Array.from(g.index.array), si: A('skinIndex'), sw: A('skinWeight'),
          col: A('color'), baby: g.morphAttributes.position ? Array.from(g.morphAttributes.position[0].array) : null });
      } else if (o.isMesh && !o.isSkinnedMesh && o.geometry.type === 'SphereGeometry' && o.parent && !o.parent.isBone) {
        const p = new V(), q = new a.THREE.Quaternion();
        o.getWorldPosition(p); o.getWorldQuaternion(q);
        eyes.push({ p: p.toArray(), r: o.scale.x, dir: new V(0, 1, 0).applyQuaternion(q).toArray(), up: new V(0, 0, 1).applyQuaternion(q).toArray() });
      }
    });
    const bones = skel.bones.map((b) => ({ name: b.name, parent: b.parent && b.parent.isBone ? b.parent.name : null, p: b.getWorldPosition(new V()).toArray() }));
    return { age, bones, meshes, eyes, mouth: r.mouthWorld(new V()).toArray(), size: { length: r.length, height: r.height, radius: r.radius, eyeHeight: r.eyeHeight } };
  };
  return { id: sp, adult: grab(1), baby: grab(0) };
}'''

with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 320, 'height': 240})
    pg.goto('file://' + os.path.join(BUILD, 'index.html') + '#test', wait_until='load')
    pg.wait_for_function('window.__aa', timeout=90000)
    pg.evaluate('__aa.manual(true)')
    data = pg.evaluate(JS, SP)
    b.close()
json.dump(data, open(OUT, 'w'))
ad = data['adult']
print(f'{OUT}: {len(ad["bones"])} bones, {len(ad["eyes"])} eyes, meshes', [(m['kind'], len(m['pos']) // 3, len(m['idx']) // 3) for m in ad['meshes']])
