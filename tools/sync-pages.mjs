#!/usr/bin/env node

import { cpSync, existsSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = resolve(root, 'dist');
const docs = resolve(root, 'docs');

if (!existsSync(resolve(dist, 'index.html'))) {
  console.error('[pages] dist/index.html is missing; run npm run build first.');
  process.exit(1);
}

// Both paths are fixed project children; never accept an external or environment target.
rmSync(docs, { recursive: true, force: true });
cpSync(dist, docs, { recursive: true });
writeFileSync(resolve(docs, '.nojekyll'), '');

if (!existsSync(resolve(docs, 'index.html')) || !existsSync(resolve(docs, 'assets'))) {
  console.error('[pages] generated publication directory is incomplete.');
  process.exit(1);
}

console.log('[pages] synced dist/ to docs/ for main/root GitHub Pages publication');
