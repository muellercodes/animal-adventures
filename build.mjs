// Builds the game into docs/index.html (served by GitHub Pages) and dist/artifact.html.
// Usage: node build.mjs                      (uses game/config.json for the cloud save API)
//        API_BASE=http://127.0.0.1:8787 node build.mjs
//        NO_ASSETS=1 node build.mjs         (skip the pre-rendered icons and world pictures)
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const ORDER = ['00_core', '35_envkit', '40_animals', '45_people', '50_world', '60_actors', '70_game'];
const cfg = JSON.parse(readFileSync('game/config.json', 'utf8'));
const api = process.env.API_BASE ?? cfg.apiBase ?? '';

const js = `(() => {\n'use strict';\n${ORDER.map((f) => readFileSync(`game/src/${f}.js`, 'utf8')).join('\n')}\n})();\n`;
mkdirSync('dist', { recursive: true });
writeFileSync('dist/game.js', js);
execFileSync(process.execPath, ['--check', 'dist/game.js'], { stdio: 'inherit' });
if (/—/.test(js)) { console.error('em dash found in game code'); process.exit(1); }

// pre-rendered animal icons and world pictures (made by tools/assets.py)
const assets = { icons: {}, worlds: {} };
if (!process.env.NO_ASSETS && existsSync('game/assets')) {
  for (const f of readdirSync('game/assets')) {
    const m = f.match(/^(icon|world)-([a-z]+)\.(png|jpg)$/); if (!m) continue;
    const uri = `data:image/${m[3] === 'jpg' ? 'jpeg' : 'png'};base64,${readFileSync(`game/assets/${f}`).toString('base64')}`;
    assets[m[1] === 'icon' ? 'icons' : 'worlds'][m[2]] = uri;
  }
}
const three = readFileSync('game/vendor/three.min.js', 'utf8');
const shell = readFileSync('game/shell.html', 'utf8');
const scripts = `<script>\n${three}\n</script>\n<script>window.AA_ASSETS = ${JSON.stringify(assets)};</script>\n<script>\n${js}</script>\n`;

const cut = shell.indexOf('</style>') + '</style>'.length;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover,user-scalable=no">
<meta name="description" content="Animal Adventures: a game by Rosemary. Pick an animal, eat food, earn leaves and explore six worlds.">
<meta name="theme-color" content="#2C5534">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
<meta name="apple-mobile-web-app-title" content="Animal Adventures">
<meta property="og:title" content="Animal Adventures">
<meta property="og:description" content="A game by Rosemary. Pick an animal, eat food, earn leaves and explore six worlds.">
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
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', page);
// artifact flavor: no document wrapper (the host adds one) and no cloud saves
writeFileSync('dist/artifact.html', shell + '\n' + scripts);
const n = Object.keys(assets.icons).length + Object.keys(assets.worlds).length;
console.log(`built docs/index.html (${(page.length / 1024).toFixed(0)} KB, ${n} pictures), cloud saves: ${api || 'off'}`);
