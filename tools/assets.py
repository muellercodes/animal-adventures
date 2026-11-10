# Renders the animal icons (grown-up and baby) and world pictures used in the menus into game/assets/.
# The #assets page pretends it is summer, so the pictures have no autumn or Halloween things in them.
# Run after building with assets off:  NO_ASSETS=1 API_BASE= node build.mjs && python3 tools/assets.py
# To redraw only some animals' icons (no world pictures):  python3 tools/assets.py pig goat
# To redraw only some world pictures:  WORLDS=snow python3 tools/assets.py
# PAGE=<path to a built index.html> uses another build than docs/index.html.
# Needs Playwright with Chromium (WebGL runs in software, so this takes a few minutes).
import base64, os, sys, threading, functools, http.server, socketserver
from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'game', 'assets')
os.makedirs(OUT, exist_ok=True)
SHOTS = {  # camera position, look-at point (relative to the world spawn) for each world picture
    'land': ([28, 20, -14], [92, 2, -58]), 'forest': ([30, 14, 48], [-6, 6, 4]), 'swamp': ([26, 11, 30], [-6, 0, -4]),
    'jungle': ([-30, 16, 34], [20, 2, -6]), 'meadow': ([40, 16, 46], [-10, 2, -20]), 'sky': ([46, 30, 60], [0, 2, 0]),
    'snow': ([10, 14, 50], [-10, 8, -60]), 'savanna': ([40, 9, 40], [-20, 3, -10]),
}
# the page loads its animal models from files beside it (build.mjs), so serve its folder over http
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
PAGE = os.environ.get('PAGE', os.path.join(ROOT, 'docs', 'index.html'))
srv = socketserver.ThreadingTCPServer(('127.0.0.1', 0), functools.partial(Quiet, directory=os.path.dirname(os.path.abspath(PAGE))))
srv.daemon_threads = True
threading.Thread(target=srv.serve_forever, daemon=True).start()
with sync_playwright() as p:
    b = p.chromium.launch(args=['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 640, 'height': 360}, device_scale_factor=1)
    pg.goto(f'http://127.0.0.1:{srv.server_address[1]}/' + os.path.basename(PAGE) + '#assets', wait_until='load')
    pg.wait_for_function('window.__aa', timeout=180000)
    pg.evaluate('__aa.manual(true)')
    pg.evaluate('() => __aa.Animals.ready')   # sculpted models: their maps decode after the page loads
    only = sys.argv[1:]
    # WORLDS=snow,land redraws only those world pictures (no icons)
    worlds_only = [w for w in os.environ.get('WORLDS', '').split(',') if w]
    if worlds_only: only = ['-']
    ids = [] if worlds_only else (only or pg.evaluate('Object.keys(__aa.SPECIES)'))
    # round 12: a grown-up boy or girl that looks different (its own sculpt or no antlers) gets its own picture,
    # icon-<id><m|f>.png; "lionf" on the command line draws only that one
    looks = pg.evaluate('''() => { const o = {}; for (const id in __aa.SEX_LOOK) for (const sx of ['m', 'f']) { const L = __aa.SEX_LOOK[id][sx]; if (L && (L.model || L.horns != null)) (o[id] = o[id] || []).push(sx); } return o; }''')
    for sp in list(ids):
        if sp not in looks and sp[:-1] in looks and sp[-1] in looks[sp[:-1]]:
            ids.remove(sp)
            url = pg.evaluate(f'__aa.animalIcon("{sp[:-1]}", 1, "{sp[-1]}")')
            open(os.path.join(OUT, f'icon-{sp}.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
            print('icon', sp)
    for sp in ids:
        for sx in looks.get(sp, []):
            url = pg.evaluate(f'__aa.animalIcon("{sp}", 1, "{sx}")')
            open(os.path.join(OUT, f'icon-{sp}{sx}.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
            print('icon', sp + sx)
        url = pg.evaluate(f'__aa.animalIcon("{sp}")')
        open(os.path.join(OUT, f'icon-{sp}.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
        url = pg.evaluate(f'__aa.animalIcon("{sp}", 0)')
        open(os.path.join(OUT, f'icon-{sp}-baby.png'), 'wb').write(base64.b64decode(url.split(',')[1]))
        print('icon', sp)
    for wid, (cam, look) in ({k: SHOTS[k] for k in worlds_only} if worlds_only else {} if only else SHOTS).items():
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
