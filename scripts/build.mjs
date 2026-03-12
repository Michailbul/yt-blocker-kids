import * as esbuild from 'esbuild';
import { cpSync, mkdirSync, rmSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = resolve(root, 'dist');
const isWatch = process.argv.includes('--watch');

// Clean dist
if (existsSync(dist)) rmSync(dist, { recursive: true });
mkdirSync(dist, { recursive: true });

// Copy static assets
const staticDir = resolve(root, 'static');
const staticFiles = ['manifest.json', 'popup.html', 'popup.css', 'content.css'];
for (const f of staticFiles) {
  cpSync(resolve(staticDir, f), resolve(dist, f));
}
cpSync(resolve(staticDir, 'icons'), resolve(dist, 'icons'), { recursive: true });
cpSync(resolve(staticDir, 'fonts'), resolve(dist, 'fonts'), { recursive: true });

// Shared esbuild options
const shared = {
  bundle: true,
  sourcemap: false,
  minify: false,
  target: 'chrome120',
  logLevel: 'info',
};

// Build background (service worker — IIFE, single file)
const bgOptions = {
  ...shared,
  entryPoints: [resolve(root, 'src/background.ts')],
  outfile: resolve(dist, 'background.js'),
  format: 'iife',
  platform: 'browser',
};

// Build content script (IIFE, injected into YouTube pages)
const contentOptions = {
  ...shared,
  entryPoints: [resolve(root, 'src/content.ts')],
  outfile: resolve(dist, 'content.js'),
  format: 'iife',
  platform: 'browser',
};

// Build popup (IIFE, loaded in popup.html)
const popupOptions = {
  ...shared,
  entryPoints: [resolve(root, 'src/popup.ts')],
  outfile: resolve(dist, 'popup.js'),
  format: 'iife',
  platform: 'browser',
};

if (isWatch) {
  const contexts = await Promise.all([
    esbuild.context(bgOptions),
    esbuild.context(contentOptions),
    esbuild.context(popupOptions),
  ]);
  await Promise.all(contexts.map(ctx => ctx.watch()));
  console.log('Watching for changes...');
} else {
  await Promise.all([
    esbuild.build(bgOptions),
    esbuild.build(contentOptions),
    esbuild.build(popupOptions),
  ]);
  console.log('Build complete → dist/');
}
