#!/usr/bin/env node

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePNG } from './luma.mjs';
import { region, stats } from './probe.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).map((arg) => {
  const [key, value] = arg.replace(/^--/, '').split('=');
  return [key, value ?? true];
}));
const tag = String(args.tag || '').replace(/^-/, '');
if (!tag) {
  console.error('usage: verify-r9.mjs --tag=<post-fix capture tag>');
  process.exit(2);
}

const shotsDir = join(root, 'shots');
const files = Object.fromEntries(['hero', 'wide', 'torii', 'valley', 'sun'].map((shot) => [
  shot, join(shotsDir, `phone-${shot}-${tag}.png`),
]));
for (const [shot, path] of Object.entries(files)) {
  if (!existsSync(path)) {
    console.error(`[r9] missing ${shot}: ${path}`);
    process.exit(2);
  }
}

const images = Object.fromEntries(Object.entries(files).map(([name, path]) => [
  name, decodePNG(readFileSync(path)),
]));

function box(shot, x, y, w, h) {
  const img = images[shot];
  return stats(img, region(img, `${x / img.width},${y / img.height},${w / img.width},${h / img.height}`));
}

function meanLuma(stat) {
  const [r, g, b] = stat.meanRGB;
  return +(0.2126 * r + 0.7152 * g + 0.0722 * b).toFixed(2);
}

function hue([r0, g0, b0]) {
  const r = r0 / 255, g = g0 / 255, b = b0 / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
  if (d === 0) return 0;
  let h;
  if (max === r) h = ((g - b) / d) % 6;
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}

function hueDistance(a, b) {
  const d = Math.abs(a - b);
  return Math.min(d, 360 - d);
}

function lumaAt(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
}

function rgbAt(img, x, y) {
  const i = (y * img.width + x) * img.channels;
  return [img.data[i], img.data[i + 1], img.data[i + 2]];
}

function shadowEdge() {
  const img = images.hero;
  const edges = [];
  for (let y = 770; y <= 800; y++) {
    let edge = null;
    for (let x = 880; x <= 980; x++) {
      if (lumaAt(img, x, y) < 8) { edge = x; break; }
    }
    edges.push(edge);
  }
  const foundRows = edges.filter((edge) => edge !== null).length;
  let longestRepeat = 1, run = 1, maxJump = 0;
  for (let i = 1; i < edges.length; i++) {
    if (edges[i] !== null && edges[i] === edges[i - 1]) run++;
    else run = 1;
    longestRepeat = Math.max(longestRepeat, run);
    if (edges[i] !== null && edges[i - 1] !== null) maxJump = Math.max(maxJump, Math.abs(edges[i] - edges[i - 1]));
  }
  const column = [];
  for (let y = 755; y <= 790; y++) column.push(lumaAt(img, 960, y));
  const low = Math.min(...column), high = Math.max(...column);
  const lo = low + (high - low) * 0.1, hi = low + (high - low) * 0.9;
  let transition = 0, longestTransition = 0;
  for (const value of column) {
    if (value > lo && value < hi) transition++;
    else transition = 0;
    longestTransition = Math.max(longestTransition, transition);
  }
  return { edges, foundRows, longestRepeat, maxJump, transitionPixels: longestTransition };
}

function skyColumn() {
  const img = images.hero;
  const values = [];
  for (let y = 30; y <= 405; y++) values.push(lumaAt(img, 2400, y));
  const top = rgbAt(img, 2400, 30), horizon = rgbAt(img, 2400, 405);
  return {
    lumaSpan: +(Math.max(...values) - Math.min(...values)).toFixed(2),
    top,
    horizon,
    coolTop: top[2] > top[0],
    warmHorizon: horizon[0] > horizon[2],
  };
}

function brightest(shot, x, y, w, h) {
  const img = images[shot];
  let best = { luma: -1, rgb: [0, 0, 0], x, y };
  for (let py = y; py < y + h; py++) {
    for (let px = x; px < x + w; px++) {
      const rgb = rgbAt(img, px, py);
      const luma = 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
      if (luma > best.luma) best = { luma, rgb, x: px, y: py };
    }
  }
  const max = Math.max(...best.rgb), min = Math.min(...best.rgb);
  best.luma = +best.luma.toFixed(2);
  best.saturation = max === 0 ? 0 : +((max - min) / max).toFixed(3);
  return best;
}

const shadow = box('hero', 1400, 1010, 100, 40);
const lit = box('hero', 1150, 830, 120, 50);
const shadowLuma = meanLuma(shadow), litLuma = meanLuma(lit);
const edge = shadowEdge();
// Clean sky only. The original boxes at hero (1400,200) and (1250,60) overlap the
// foreground torii, so their near-black geometry inflated luma spread and made a sky
// failure look healthier than it was. These two boxes were inspected against r9v1 at
// native resolution and contain no foreground silhouette.
const sky = box('hero', 2000, 80, 300, 150);
const skyCloudA = box('torii', 1850, 30, 300, 150);
const skyLine = skyColumn();
const valleyBoxes = [
  [200, 250], [1200, 300], [2100, 350], [300, 800], [1900, 900], [1100, 1050],
].map(([x, y]) => box('valley', x, y, 300, 150));
const valleyHues = valleyBoxes.map((value) => +hue(value.meanRGB).toFixed(1));
let valleyHueSpread = 0;
for (let i = 0; i < valleyHues.length; i++) for (let j = i + 1; j < valleyHues.length; j++) {
  valleyHueSpread = Math.max(valleyHueSpread, hueDistance(valleyHues[i], valleyHues[j]));
}
const valleyWhole = stats(images.valley, region(images.valley, '0,0,1,1'));
const sakuraHero = box('hero', 420, 165, 40, 30);
// The earlier (950,880 200x100) box is the approach/torii leg, not the tree. Round 9's
// foliage audit disproved that probe by back-projecting the wide pose and measuring the
// visible canopy here. Keep this coordinate beside the code so a future camera reframe
// cannot silently turn a ground sample into a blossom requirement again.
const sakuraWide = box('wide', 950, 460, 200, 110);
const mountain = box('torii', 2030, 700, 70, 40);
const lantern = brightest('hero', 1585, 760, 80, 80);
const lanternNear = box('hero', 1560, 1090, 90, 40);
const lanternFar = box('hero', 1900, 1090, 90, 40);

const checks = [
  {
    criterion: 'R9-FILL-001',
    pass: shadowLuma >= 9 && shadowLuma <= 13 && shadow.detail >= 6 && shadow.meanRGB[2] / shadow.meanRGB[0] >= 0.9 && shadowLuma / litLuma >= 0.18 && shadowLuma / litLuma <= 0.25,
    metrics: { shadow, lit, shadowMeanLuma: shadowLuma, litMeanLuma: litLuma, blueRed: +(shadow.meanRGB[2] / shadow.meanRGB[0]).toFixed(3), valueRatio: +(shadowLuma / litLuma).toFixed(3) },
  },
  {
    criterion: 'R9-SHADOW-EDGE-001',
    // A wide sparse-kernel experiment erased this shadow and made every edge `null`;
    // longestRepeat=1/maxJump=0 then passed vacuously. The scan is meaningful only when
    // the expected dark band is present through most of the fixed 31-row window.
    pass: edge.foundRows >= 24 && edge.longestRepeat <= 3 && edge.maxJump <= 6 && edge.transitionPixels >= 6,
    metrics: edge,
    limitation: 'Contact-versus-far penumbra comparison still requires native visual inspection.',
  },
  {
    criterion: 'R9-SKY-001',
    pass: sky.saturation >= 0.28 && skyLine.lumaSpan >= 45 && skyLine.coolTop && skyLine.warmHorizon && Math.max(sky.detail, skyCloudA.detail) >= 4,
    metrics: { sky, secondCloudBox: skyCloudA, column: skyLine },
  },
  {
    criterion: 'R9-VALLEY-001',
    pass: null,
    metrics: { boxes: valleyBoxes, hues: valleyHues, hueSpread: +valleyHueSpread.toFixed(1), whole: valleyWhole },
    limitation: 'BLOCKED: these six fixed boxes predate the Round 9 valley position/target/FOV change and no longer sample the named semantic regions. Preserve the values as history; do not use them to accept or reject the reframed valley.',
  },
  {
    criterion: 'R9-SAKURA-001-HUE',
    pass: sakuraHero.meanRGB[2] / sakuraHero.meanRGB[0] >= 0.78 && sakuraWide.meanRGB[2] / sakuraWide.meanRGB[0] >= 0.65,
    metrics: { hero: sakuraHero, wide: sakuraWide, heroBlueRed: +(sakuraHero.meanRGB[2] / sakuraHero.meanRGB[0]).toFixed(3), wideBlueRed: +(sakuraWide.meanRGB[2] / sakuraWide.meanRGB[0]).toFixed(3) },
    limitation: 'Facet width and alpha falloff require a native crop/manual or dedicated edge-segmentation check.',
  },
  {
    criterion: 'R9-FAR-RANGE-001-PARTIAL',
    pass: mountain.detail >= 5.5 && mountain.lumaSpread >= 55,
    metrics: { mountain },
    limitation: 'Matched-flank hue split and silhouette congruence remain separate checks.',
  },
  {
    criterion: 'R9-LANTERN-001',
    pass: lantern.saturation >= 0.25 && lantern.luma < 250 && meanLuma(lanternNear) / meanLuma(lanternFar) >= 2.2,
    metrics: { core: lantern, nearGround: lanternNear, farGround: lanternFar, groundRatio: +(meanLuma(lanternNear) / meanLuma(lanternFar)).toFixed(3) },
    limitation: 'Post gradient/falloff still requires the native crop.',
  },
];

const output = {
  schemaVersion: 1,
  round: 9,
  tag,
  generatedAt: new Date().toISOString(),
  checks,
  summary: {
    passed: checks.filter((check) => check.pass === true).map((check) => check.criterion),
    failed: checks.filter((check) => check.pass === false).map((check) => check.criterion),
    blocked: checks.filter((check) => check.pass === null).map((check) => check.criterion),
    manualStillRequired: ['R9-SAKURA-001 form', 'R9-FAR-RANGE-001 flank/silhouette', 'R9-DRESSING-001', 'R9-CINEMATIC-001', 'contact-versus-far shadow softness'],
  },
};

const outDir = join(root, 'AI_DEVELOPMENT', 'EVIDENCE');
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, `${tag}-metrics.json`);
writeFileSync(outPath, JSON.stringify(output, null, 2));

for (const check of checks) {
  console.log(`${check.pass === true ? 'PASS' : check.pass === false ? 'FAIL' : 'BLOCKED'} ${check.criterion}`);
}
console.log(`wrote ${outPath}`);
process.exit(output.summary.failed.length || output.summary.blocked.length ? 1 : 0);
