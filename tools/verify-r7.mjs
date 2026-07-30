/**
 * verify-r7.mjs — check every falsifiable prediction the round-7 owners made.
 *
 * Each team was required to return its claim as "region -> expected number" rather than
 * as prose, precisely so this pass can be mechanical. A prediction that comes back
 * byte-identical is the interesting result: it means the branch that team edited does not
 * draw those pixels, which is what round 5 shipped and round 6 had to revert.
 *
 *   node tools/verify-r7.mjs <beforeTag> <afterTag>
 */

import { readFileSync } from 'node:fs';
import { decodePNG } from './luma.mjs';

const [, , BEFORE = 'r7', AFTER = 'r7v'] = process.argv;

function px(tag, shot) {
  // decodePNG returns `channels` — these captures are 3-channel RGB, not RGBA. Hard-coding
  // a stride of 4 walks the buffer at the wrong offset and produces plausible-looking
  // garbage (and NaN off the end), which is the exact failure mode this project has hit
  // five times. Read the stride from the decoder, never assume it.
  const { width, height, channels, data } = decodePNG(readFileSync(`shots/phone-${shot}-${tag}.png`));
  return { width, height, channels, data };
}

/** Region stats over x,y,w,h given as fractions of the frame. */
function region(img, [fx, fy, fw, fh]) {
  const x0 = Math.round(fx * img.width), y0 = Math.round(fy * img.height);
  const x1 = Math.min(img.width, Math.round((fx + fw) * img.width));
  const y1 = Math.min(img.height, Math.round((fy + fh) * img.height));
  let r = 0, g = 0, b = 0, n = 0, green = 0, warm = 0;
  const lum = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
      r += R; g += G; b += B; n++;
      if (G > R && G > B) green++;
      if (R > G + 8 && R > B + 8) warm++;
      lum.push(0.2126 * R + 0.7152 * G + 0.0722 * B);
    }
  }
  lum.sort((a, c) => a - c);
  const q = (p) => lum[Math.min(lum.length - 1, Math.floor(p * lum.length))] ?? 0;
  const mean = [r / n, g / n, b / n];
  return {
    mean, n,
    p1: q(0.01), p50: q(0.5), p99: q(0.99),
    spread: q(0.99) - q(0.01),
    greenPct: (100 * green) / n,
    warmPct: (100 * warm) / n,
    RmB: mean[0] - mean[2],
    RoB: mean[2] > 0.001 ? mean[0] / mean[2] : Infinity,
  };
}

/** Mean |Laplacian| on luma — the "flat putty" number. */
function detail(img, [fx, fy, fw, fh]) {
  const x0 = Math.max(1, Math.round(fx * img.width)), y0 = Math.max(1, Math.round(fy * img.height));
  const x1 = Math.min(img.width - 1, Math.round((fx + fw) * img.width));
  const y1 = Math.min(img.height - 1, Math.round((fy + fh) * img.height));
  const L = (x, y) => {
    const i = (y * img.width + x) * img.channels;
    return 0.2126 * img.data[i] + 0.7152 * img.data[i + 1] + 0.0722 * img.data[i + 2];
  };
  let s = 0, n = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      s += Math.abs(4 * L(x, y) - L(x - 1, y) - L(x + 1, y) - L(x, y - 1) - L(x, y + 1));
      n++;
    }
  }
  return s / Math.max(1, n);
}

/** Mean RGB of the darkest `frac` of a region — the "dark population" the sky team fits. */
function darkest(img, [fx, fy, fw, fh], frac) {
  const x0 = Math.round(fx * img.width), y0 = Math.round(fy * img.height);
  const x1 = Math.min(img.width, Math.round((fx + fw) * img.width));
  const y1 = Math.min(img.height, Math.round((fy + fh) * img.height));
  const px2 = [];
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * img.width + x) * img.channels;
      const R = img.data[i], G = img.data[i + 1], B = img.data[i + 2];
      px2.push([0.2126 * R + 0.7152 * G + 0.0722 * B, R, G, B]);
    }
  }
  px2.sort((a, b) => a[0] - b[0]);
  const k = Math.max(1, Math.round(px2.length * frac));
  let r = 0, g = 0, b = 0, l = 0;
  for (let i = 0; i < k; i++) { l += px2[i][0]; r += px2[i][1]; g += px2[i][2]; b += px2[i][3]; }
  return { luma: l / k, mean: [r / k, g / k, b / k], RmB: (r - b) / k };
}

const cache = new Map();
const img = (tag, shot) => {
  const key = `${tag}/${shot}`;
  if (!cache.has(key)) cache.set(key, px(tag, shot));
  return cache.get(key);
};

const f2 = (v) => (Number.isFinite(v) ? v.toFixed(2) : String(v));
const rows = [];
function check(team, label, shot, box, metric, expect) {
  const a = img(BEFORE, shot), b = img(AFTER, shot);
  let before, after;
  if (metric === 'detail') { before = detail(a, box); after = detail(b, box); }
  else if (metric.startsWith('dark:')) {
    const frac = Number(metric.slice(5));
    before = darkest(a, box, frac); after = darkest(b, box, frac);
    before = before.luma; after = after.luma;
  } else {
    before = region(a, box)[metric]; after = region(b, box)[metric];
  }
  const identical = Math.abs(after - before) < 1e-9;
  rows.push({ team, label: `${shot} ${label}`, metric, before, after, expect, identical });
}

// ---------------------------------------------------------------- sky
const SUN_NEAR = [0.30, 0.30, 0.15, 0.20];
check('sky', 'near-sun sky', 'sun', SUN_NEAR, 'RmB', 'R-B >= 40');
check('sky', 'near-sun sky', 'sun', SUN_NEAR, 'p50', 'p50 170-195 (was 210)');
check('sky', 'cloud deck', 'sun', [0.02, 0.10, 0.42, 0.28], 'RmB', 'warmer');
check('sky', 'cloud deck', 'torii', [0.62, 0.02, 0.36, 0.26], 'detail', 'cloud form, was 1.40');
check('sky', 'tight shadow', 'sun', [0.360, 0.9125, 0.030, 0.005], 'RoB', 'R/B <= 1.3 (was 3.77)');
check('sky', 'lit sand', 'sun', [0.310, 0.9125, 0.030, 0.005], 'RoB', 'R/B 2.7-3.0 (hold)');
for (const s of ['hero', 'wide', 'torii', 'valley', 'sun']) {
  check('sky', 'dark population lower 45%', s, [0.0, 0.55, 1.0, 0.45], 'dark:0.15', 'level');
}

// ---------------------------------------------------------------- postfx
check('postfx', 'lantern skirt 45px', 'sun', [0.712, 0.40, 0.012, 0.02], 'p50', '179.5 -> 195');
check('postfx', 'lantern skirt 60px', 'sun', [0.736, 0.40, 0.012, 0.02], 'p50', '166.8 -> 179');
check('postfx', 'lantern skirt 75px', 'sun', [0.760, 0.40, 0.012, 0.02], 'p50', '160.6 -> 172');
check('postfx', 'lantern core', 'torii', [0.535, 0.53, 0.035, 0.06], 'p50', 'halation up');
check('postfx', 'god shaft on post', 'sun', [0.4375, 0.495, 0.010, 0.010], 'p50', '40 -> 90');
check('postfx', 'god shaft low post', 'sun', [0.4375, 0.751, 0.010, 0.010], 'p50', '25 -> 48');

// ---------------------------------------------------------------- foliage
check('foliage', 'bamboo band', 'valley', [0.30, 0.20, 0.16, 0.22], 'greenPct', '3.02 -> >11');
check('foliage', 'bamboo band', 'valley', [0.30, 0.20, 0.16, 0.22], 'warmPct', '91.13 -> <80');
check('foliage', 'bamboo left', 'wide', [0.00, 0.20, 0.30, 0.25], 'greenPct', '13.55 -> >21');
check('foliage', 'sky specks', 'valley', [0.28, 0.03, 0.34, 0.08], 'dark:0.004', 'luma 62.5 -> >100');
check('foliage', 'canopy core', 'hero', [0.10, 0.10, 0.16, 0.20], 'RmB', '29 -> >=40');

// ---------------------------------------------------------------- world
check('world', 'meadow near', 'valley', [0.30, 0.33, 0.28, 0.13], 'spread', '74.9 -> >=100');
check('world', 'meadow near', 'valley', [0.30, 0.33, 0.28, 0.13], 'detail', '5.68 -> >=7.5');
check('world', 'valley slope', 'valley', [0.10, 0.28, 0.45, 0.30], 'detail', '6.69 -> >=8.5');
check('world', 'valley band', 'valley', [0.30, 0.42, 0.28, 0.05], 'detail', '7.48 -> >=9.5');
check('world', 'plateau strip', 'wide', [0.60, 0.78, 0.16, 0.05], 'detail', '3.94 -> >=4.8');
check('world', 'plateau', 'wide', [0.50, 0.55, 0.30, 0.28], 'detail', '5.82 -> >=7.0');
check('world', 'DIAGNOSTIC dark mid-ground', 'wide', [0.05, 0.50, 0.22, 0.16], 'detail', '2.58 -> 3.2-4.5');

const w = (s, n) => String(s).padEnd(n);
console.log(`${w('team', 8)}${w('region', 42)}${w('metric', 10)}${w('before', 11)}${w('after', 11)}expected`);
console.log('-'.repeat(110));
let identicalCount = 0;
for (const r of rows) {
  if (r.identical) identicalCount++;
  console.log(
    w(r.team, 8) + w(r.label, 42) + w(r.metric, 10) +
    w(f2(r.before), 11) + w(f2(r.after) + (r.identical ? ' =!' : ''), 11) + r.expect,
  );
}
console.log('-'.repeat(110));
console.log(`${rows.length} predictions checked; ${identicalCount} byte-identical (=! means that branch does not draw those pixels)`);
