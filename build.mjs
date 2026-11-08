// Builds the game into docs/index.html (served by GitHub Pages) and dist/artifact.html.
// Usage: node build.mjs                      (uses game/config.json for the cloud save API)
//        API_BASE=http://127.0.0.1:8787 node build.mjs
//        NO_ASSETS=1 node build.mjs         (skip the pre-rendered icons and world pictures)
//        INLINE_MODELS=1 node build.mjs     (put the animal models in the page itself, as before round 11)
// The animal models go next to the page in a few models-<n>-<hash>.json files, which the page loads before the game
// starts (a page can be at most 16 MB as an artifact, and the models alone are more than half of that).
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ORDER = ['00_core', '35_envkit', '36_city', '37_street', '38_food', '39_snow', '39_zoo', '40_animals', '45_people', '49_plan', '50_world', '60_actors', '62_town', '63_traffic', '64_citylife', '65_audio', '66_zoo', '68_net', '70_game'];
const cfg = JSON.parse(readFileSync('game/config.json', 'utf8'));
const api = process.env.API_BASE ?? cfg.apiBase ?? '';

const OUT = process.env.OUT || 'docs', DIST = process.env.DIST || 'dist';   // OUT/DIST let test builds go somewhere else
// EXTRA=a.js,b.js adds test-only scripts right after the scenery modules (stand-ins while art is being made)
const files = ORDER.map((f) => `game/src/${f}.js`);
files.splice(files.indexOf('game/src/37_street.js') + 1, 0, ...(process.env.EXTRA || '').split(',').filter(Boolean));
const js = `(() => {\n'use strict';\n${files.map((f) => readFileSync(f, 'utf8')).join('\n')}\n})();\n`;
mkdirSync(DIST, { recursive: true });
writeFileSync(`${DIST}/game.js`, js);
execFileSync(process.execPath, ['--check', `${DIST}/game.js`], { stdio: 'inherit' });
if (/—/.test(js)) { console.error('em dash found in game code'); process.exit(1); }

// pre-rendered animal icons and world pictures (made by tools/assets.py)
const assets = { icons: {}, worlds: {} };
if (!process.env.NO_ASSETS && existsSync('game/assets')) {
  for (const f of readdirSync('game/assets')) {
    const m = f.match(/^(icon|world)-([a-z]+(?:-baby)?)\.(png|jpg)$/); if (!m) continue;
    const uri = `data:image/${m[3] === 'jpg' ? 'jpeg' : 'png'};base64,${readFileSync(`game/assets/${f}`).toString('base64')}`;
    assets[m[1] === 'icon' ? 'icons' : 'worlds'][m[2]] = uri;
  }
}
// sculpted animal models (made by tools/blender): game/models/<id>.json names its mesh data and texture files,
// which go into the page as base64. A species without a model keeps its procedural body. NO_MODELS=1 leaves them out.
const models = {};
let modelBytes = 0;
if (!process.env.NO_MODELS && existsSync('game/models')) {
  const mime = { webp: 'image/webp', jpg: 'image/jpeg', png: 'image/png' };
  for (const f of readdirSync('game/models')) {
    const m = f.match(/^([a-z]+)\.json$/); if (!m) continue;
    const md = JSON.parse(readFileSync(`game/models/${f}`, 'utf8'));
    // (a coat variant has no mesh of its own: it names the model it shares, md.base, and brings only its own maps)
    if (md.data) md.data = readFileSync(`game/models/${md.data}`).toString('base64');
    for (const k in md.maps) md.maps[k] = `data:${mime[md.maps[k].split('.').pop()]};base64,${readFileSync(`game/models/${md.maps[k]}`).toString('base64')}`;
    models[m[1]] = md;
  }
  modelBytes = JSON.stringify(models).length;
}
// the models in packs of about 6 MB, named by their content so a browser never keeps a stale one
const packs = [];
mkdirSync(OUT, { recursive: true });
for (const dir of [OUT, DIST]) for (const f of readdirSync(dir)) if (/^models-\d+-[0-9a-f]+\.json$/.test(f)) unlinkSync(`${dir}/${f}`);
if (!process.env.INLINE_MODELS && Object.keys(models).length) {
  let cur = {}, size = 0;
  const flush = () => {
    if (!size) return;
    const text = JSON.stringify(cur), name = `models-${packs.length}-${createHash('sha1').update(text).digest('hex').slice(0, 10)}.json`;
    for (const dir of [OUT, DIST]) writeFileSync(`${dir}/${name}`, text);
    packs.push(name); cur = {}; size = 0;
  };
  for (const id of Object.keys(models).sort()) {
    const n = JSON.stringify(models[id]).length;
    if (size && size + n > 6e6) flush();
    cur[id] = models[id]; size += n;
  }
  flush();
}
// loads the packs (with a progress note on the title card) and hands the models to the game when they are all in;
// if one cannot be loaded the game still starts, with the simple built-in bodies for those animals
const loader = `<script>
window.AA_MODEL_PACKS = ${JSON.stringify(packs)};
window.AA_MODELS_READY = (function () {
  var packs = window.AA_MODEL_PACKS, got = [], tot = [];
  if (!packs.length) return Promise.resolve(window.AA_MODELS || {});
  function note() {
    var el = document.getElementById('titleBody'), a = 0, b = 0;
    for (var i = 0; i < packs.length; i++) { a += got[i] || 0; b += tot[i] || 0; }
    if (el && b) el.innerHTML = '<p>Loading the animals... ' + Math.min(99, Math.round((100 * a) / b)) + '%</p>';
  }
  return Promise.all(packs.map(function (u, i) {
    return new Promise(function (res) {
      var x = new XMLHttpRequest();
      x.open('GET', u);
      x.onprogress = function (e) { got[i] = e.loaded; if (e.lengthComputable) tot[i] = e.total; note(); };
      x.onload = function () { var j = null; try { j = JSON.parse(x.responseText); } catch (e) { console.error('model pack', u, e); } res(j || {}); };
      x.onerror = function () { console.error('model pack', u, 'did not load'); res({}); };
      x.send();
    });
  })).then(function (all) { var m = {}; for (var i = 0; i < all.length; i++) for (var k in all[i]) m[k] = all[i][k]; return m; });
})();
</script>
`;
const three = readFileSync('game/vendor/three.min.js', 'utf8');
const shell = readFileSync('game/shell.html', 'utf8');
const scripts = `<script>\n${three}\n</script>\n<script>window.AA_ASSETS = ${JSON.stringify(assets)};</script>\n` +
  (process.env.INLINE_MODELS && Object.keys(models).length ? `<script>window.AA_MODELS = ${JSON.stringify(models)};</script>\n` : '') + loader + `<script>\n${js}</script>\n`;

const cut = shell.indexOf('</style>') + '</style>'.length;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="description" content="Animal Adventures: a game by Rosemary. Pick an animal, eat food, earn leaves and explore seven worlds.">
<meta name="theme-color" content="#2C5534">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Animal Adventures">
<meta property="og:title" content="Animal Adventures">
<meta property="og:description" content="A game by Rosemary. Pick an animal, eat food, earn leaves and explore seven worlds.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>window.AA_API = ${JSON.stringify(api)};</script>
${shell.slice(0, cut)}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>
</head>
<body>
${shell.slice(cut)}
${scripts}</body>
</html>
`;
writeFileSync(`${OUT}/index.html`, page);
// artifact flavor: no document wrapper (the host adds one) and no cloud saves
writeFileSync(`${DIST}/artifact.html`, shell + '\n' + scripts);
const n = Object.keys(assets.icons).length + Object.keys(assets.worlds).length;
const nm = Object.keys(models).length;
console.log(`built ${OUT}/index.html (${(page.length / 1024).toFixed(0)} KB, ${n} pictures, ${nm} models${nm ? ` ${(modelBytes / 1024).toFixed(0)} KB` : ''}${packs.length ? ` in ${packs.length} files beside it` : ''}), cloud saves: ${api || 'off'}`);
