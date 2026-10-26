# Runs the whole model pipeline for one species, or part of it.
# Usage: BLENDER_PY=/path/to/python-with-bpy python3 tools/blender/make.py pig [first step] [last step]
# Steps: rig (export from the game), sculpt, lowpoly, bake, texture, export. See README.md.
import os, subprocess, sys, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SP = sys.argv[1] if len(sys.argv) > 1 else 'pig'
STEPS = ['rig', 'sculpt', 'lowpoly', 'bake', 'texture', 'export']
a = STEPS.index(sys.argv[2]) if len(sys.argv) > 2 else 0
b = STEPS.index(sys.argv[3]) if len(sys.argv) > 3 else len(STEPS) - 1
BPY = os.environ.get('BLENDER_PY', 'python3')
ARGS = {'sculpt': [os.environ.get('VOXEL', '0.002')], 'lowpoly': [os.environ.get('TRIS', '6000'), os.environ.get('WEIGHTS', 'transfer')], 'bake': [os.environ.get('TEX', '1024')]}
for st in STEPS[a:b + 1]:
    t = time.time()
    py = sys.executable if st == 'rig' else BPY
    script = 'export_rig.py' if st == 'rig' else f'{st}.py'
    print(f'== {st}', flush=True)
    subprocess.run([py, os.path.join(HERE, script), SP] + ARGS.get(st, []), cwd=ROOT, check=True)
    print(f'== {st} done in {time.time() - t:.0f}s', flush=True)
