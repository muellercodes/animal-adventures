# Renders the animal icons (grown-up and baby) and world pictures used in the menus into game/assets/.
# The #assets page pretends it is summer, so the pictures have no autumn or Halloween things in them.
# Run after building with assets off:  NO_ASSETS=1 API_BASE= node build.mjs && python3 tools/assets.py
# To redraw only some animals' icons (no world pictures):  python3 tools/assets.py pig goat
# PAGE=<path to a built index.html> uses another build than docs/index.html.
# Needs Playwright with Chromium (WebGL runs in software, so this takes a few minutes).
import base64, os, sys
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets')
os.makedirs(OUT, exist_ok=True)
SHOTS = {  # camera position, look-at point (relative to the world spawn) for each world picture
    'land': ([28, 20, -14], [92, 2, -58]), 'forest': ([30, 14, 48], [-6, 6, 4]), 'swamp': ([26, 11, 30], [-6, 0, -4]),
    'jungle': ([-30, 16, 34], [20, 2, -6]), 'meadow': ([40, 16, 46], [-10, 2, -20]), 'sky': ([46, 30, 60], [0, 2, 0]),
}
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 360}, device_scale_factor=1)
    pg.goto('file://' + os.environ.get('PAGE', os.path.join(ROOT, 'docs', 'index.html')) + '#assets', wait_until='load')
    pg.wait_for_function('window.__aa', timeout=60000)
    pg.evaluate('__aa.manual(true)')
    pg.evaluate('() => __aa.Animals.ready')   # sculpted models: their maps decode after the page loads
    only = sys.argv[1:]
    ids = only or pg.evaluate('Object.keys(__aa.SPECIES)')
    for sp in ids:
        url = pg.evaluate(f'__aa.animalIcon("{sp}")')
        open(os.path.join(OUT, f'icon-{sp}.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
        url = pg.evaluate(f'__aa.animalIcon("{sp}", 0)')
        open(os.path.join(OUT, f'icon-{sp}-baby.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
        print('icon', sp)
    for wid, (cam, look) in ({} if only else SHOTS).items():
        url = pg.evaluate('''([wid, cam, look]) => {
          const a = __aa; a.loadWorld(wid); a.S.time = 260;
          a.step(3, 1 / 30, false);
          const s = a.G.world.def.spawn;
          a.camera.position.set(s[0] + cam[0], cam[1], s[1] + cam[2]);
          a.camera.near = 0.5; a.camera.aspect = 16 / 9; a.camera.updateProjectionMatrix();
          a.camera.lookAt(s[0] + look[0], look[1], s[1] + look[2]);
          a.G.world.updateView(a.camera.position, s[0] + look[0], s[1] + look[2], 400, 3);
          a.timeOfDay(0.016, a.camera.position.clone().setY(0));
          a.renderer.setPixelRatio(1); a.renderer.setSize(640, 360, false);
          a.renderer.render(a.scene, a.camera);
          return a.renderer.domElement.toDataURL('image/jpeg', 0.82);
        }''', [wid, cam, look])
        open(os.path.join(OUT, f'world-{wid}.jpg'), 'wb').write(base64.b64decode(url.split(',')[1]))
        print('world', wid)
    b.close()
