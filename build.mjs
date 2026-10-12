// Builds the game into docs/index.html (served by GitHub Pages) and dist/artifact.html.
// Usage: node build.mjs                      (uses game/config.json for the cloud save API)
//        API_BASE=http://127.0.0.1:8787 node build.mjs
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const cfg = JSON.parse(readFileSync('game/config.json', 'utf8'));
const api = process.env.API_BASE ?? cfg.apiBase ?? '';
const src = readFileSync('game/game.html', 'utf8');

// syntax check the inline script before shipping anything
const js = src.slice(src.indexOf('<script>') + 8, src.lastIndexOf('</script>'));
mkdirSync('dist', { recursive: true });
writeFileSync('dist/game.js', js);
execFileSync(process.execPath, ['--check', 'dist/game.js'], { stdio: 'inherit' });

const cut = src.indexOf('</style>') + '</style>'.length;
const page = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="Animal Adventures: a game by Rosemary. Pick an animal, eat food, earn leaves and explore six worlds.">
<meta name="theme-color" content="#2C5534">
<meta name="apple-mobile-web-app-capable" content="yes">
<meta name="mobile-web-app-capable" content="yes">
<meta name="apple-mobile-web-app-title" content="Animal Adventures">
<meta property="og:title" content="Animal Adventures">
<meta property="og:description" content="A game by Rosemary. Pick an animal, eat food, earn leaves and explore six worlds.">
<link rel="icon" href="favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="apple-touch-icon.png">
<script>window.AA_API = ${JSON.stringify(api)};</script>
${src.slice(0, cut)}
<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}</style>
</head>
<body>
${src.slice(cut)}
</body>
</html>
`;
mkdirSync('docs', { recursive: true });
writeFileSync('docs/index.html', page);
// artifact flavor: no document wrapper (the host adds one) and no cloud saves
writeFileSync('dist/artifact.html', src);
console.log(`built docs/index.html (${(page.length / 1024).toFixed(0)} KB), cloud saves: ${api || 'off'}`);
