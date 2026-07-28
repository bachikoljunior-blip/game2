#!/usr/bin/env node
/**
 * contact-sheet.mjs — tile the captured shots into one image per profile.
 *
 * The art-direction critic judges composition, palette coherence and tonal range
 * *across* the shot set, not shot by shot, so it needs to see them together. Reading
 * twelve separate PNGs loses exactly the comparison that matters.
 *
 * Composited in headless Chromium because it is already a dependency and gives us a
 * real 2D canvas — no image library needed.
 *
 *   node tools/contact-sheet.mjs                # all profiles found in shots/
 *   node tools/contact-sheet.mjs --tag=r3       # only files tagged -r3
 */

import { chromium } from 'playwright';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'shots');

const argv = Object.fromEntries(
  process.argv.slice(2).map((a) => {
    const [k, v] = a.replace(/^--/, '').split('=');
    return [k, v ?? true];
  }),
);
const tag = argv.tag ? `-${argv.tag}` : '';
const COLS = Number(argv.cols) || 3;
const CELL = Number(argv.cell) || 720;

function group() {
  const files = readdirSync(OUT).filter((f) => f.endsWith('.png') && !f.startsWith('sheet-'));
  const byProfile = new Map();
  for (const f of files) {
    const stem = basename(f, '.png');
    if (tag) { if (!stem.endsWith(tag)) continue; }
    else if (/-[a-z0-9]+$/.test(stem.replace(/^[a-z]+-[a-z]+/i, ''))) { /* keep, tags are optional */ }
    const [profile, ...rest] = stem.split('-');
    const shot = rest.join('-').replace(new RegExp(`${tag}$`), '') || 'shot';
    if (!byProfile.has(profile)) byProfile.set(profile, []);
    byProfile.get(profile).push({ file: join(OUT, f), shot });
  }
  return byProfile;
}

async function main() {
  const groups = group();
  if (groups.size === 0) { console.error('no shots found in shots/'); process.exit(2); }

  const browser = await chromium.launch();
  const page = await browser.newPage();

  for (const [profile, entries] of groups) {
    entries.sort((a, b) => a.shot.localeCompare(b.shot));
    const rows = Math.ceil(entries.length / COLS);
    const cellH = Math.round(CELL * 0.5625);
    const LABEL = 26;
    const W = COLS * CELL;
    const H = rows * (cellH + LABEL);

    const images = entries.map((e) => ({
      shot: e.shot,
      data: 'data:image/png;base64,' + readFileSync(e.file).toString('base64'),
    }));

    const dataUrl = await page.evaluate(async ({ images, COLS, CELL, cellH, LABEL, W, H, profile }) => {
      const c = document.createElement('canvas');
      c.width = W; c.height = H;
      const g = c.getContext('2d');
      g.fillStyle = '#0a0a0c';
      g.fillRect(0, 0, W, H);

      for (let i = 0; i < images.length; i++) {
        const col = i % COLS, row = (i / COLS) | 0;
        const x = col * CELL, y = row * (cellH + LABEL);
        const img = new Image();
        await new Promise((r) => { img.onload = r; img.onerror = r; img.src = images[i].data; });

        // Letterbox rather than stretch: the critic is judging framing, so the
        // aspect ratio of each capture has to survive the contact sheet.
        const sc = Math.min(CELL / img.width, cellH / img.height);
        const dw = img.width * sc, dh = img.height * sc;
        g.drawImage(img, x + (CELL - dw) / 2, y + LABEL + (cellH - dh) / 2, dw, dh);

        g.fillStyle = '#f2e3cf';
        g.font = '600 15px ui-monospace, monospace';
        g.textBaseline = 'middle';
        g.fillText(`${profile} · ${images[i].shot}`, x + 10, y + LABEL / 2 + 1);
        g.strokeStyle = 'rgba(242,227,207,0.14)';
        g.strokeRect(x + 0.5, y + 0.5, CELL - 1, cellH + LABEL - 1);
      }
      return c.toDataURL('image/png');
    }, { images, COLS, CELL, cellH, LABEL, W, H, profile });

    const out = join(OUT, `sheet-${profile}${tag}.png`);
    writeFileSync(out, Buffer.from(dataUrl.split(',')[1], 'base64'));
    console.log(`${out}  (${entries.length} shots, ${W}×${H})`);
  }

  await browser.close();
}

main().catch((e) => { console.error(e); process.exit(3); });
