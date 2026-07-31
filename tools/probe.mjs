#!/usr/bin/env node
/**
 * probe.mjs — pixel evidence for the visual review.
 *
 * The critic brief demands measurements ("quote coordinates and RGB values") and the
 * review images are 2532×1170, so anything read off a downscaled view of the whole
 * frame is a guess. This crops a region at native resolution and reports what is
 * actually in it, so a finding can be stated as a number.
 *
 *   node tools/probe.mjs crop shots/phone-wide-r5.png 0.1,0.45,0.5,0.25 out.png
 *   node tools/probe.mjs stats shots/phone-wide-r5.png 0.1,0.45,0.5,0.25
 *
 * Regions are `x,y,w,h` as fractions of the frame, matching HUD_MASKS in luma.mjs.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { decodePNG } from './luma.mjs';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function chunk(type, body) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(body.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), body]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}

/** Minimal RGB PNG writer — filter 0 rows, one IDAT. */
function encodePNG(width, height, rgb) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  const raw = Buffer.alloc(height * (width * 3 + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (width * 3 + 1)] = 0;
    rgb.copy(raw, y * (width * 3 + 1) + 1, y * width * 3, (y + 1) * width * 3);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function region(img, spec) {
  const [fx, fy, fw, fh] = spec.split(',').map(Number);
  const x0 = Math.max(0, Math.round(fx * img.width));
  const y0 = Math.max(0, Math.round(fy * img.height));
  const w = Math.min(img.width - x0, Math.round(fw * img.width));
  const h = Math.min(img.height - y0, Math.round(fh * img.height));
  return { x0, y0, w, h };
}

export function cut(img, r) {
  const out = Buffer.alloc(r.w * r.h * 3);
  for (let y = 0; y < r.h; y++) {
    for (let x = 0; x < r.w; x++) {
      const s = ((y + r.y0) * img.width + (x + r.x0)) * img.channels;
      const d = (y * r.w + x) * 3;
      out[d] = img.data[s]; out[d + 1] = img.data[s + 1]; out[d + 2] = img.data[s + 2];
    }
  }
  return out;
}

/**
 * What a hostile eye is actually reacting to when it calls a region "flat putty":
 * the spread of luma inside it and how much high-frequency energy the surface has.
 * `detail` is mean |Laplacian|, the same read used to score the massif in round 4.
 */
export function stats(img, r) {
  const px = cut(img, r);
  const lum = new Float64Array(r.w * r.h);
  let rs = 0, gs = 0, bs = 0, satSum = 0;
  for (let i = 0; i < r.w * r.h; i++) {
    const R = px[i * 3], G = px[i * 3 + 1], B = px[i * 3 + 2];
    lum[i] = 0.2126 * R + 0.7152 * G + 0.0722 * B;
    rs += R; gs += G; bs += B;
    const mx = Math.max(R, G, B), mn = Math.min(R, G, B);
    satSum += mx === 0 ? 0 : (mx - mn) / mx;
  }
  const n = r.w * r.h;
  const sorted = Float64Array.from(lum).sort();
  const q = (f) => sorted[Math.min(n - 1, Math.floor(f * n))];
  let detail = 0, dn = 0;
  for (let y = 1; y < r.h - 1; y++) {
    for (let x = 1; x < r.w - 1; x++) {
      const i = y * r.w + x;
      detail += Math.abs(4 * lum[i] - lum[i - 1] - lum[i + 1] - lum[i - r.w] - lum[i + r.w]);
      dn++;
    }
  }
  return {
    box: `${r.x0},${r.y0} ${r.w}x${r.h}`,
    meanRGB: [rs / n, gs / n, bs / n].map((v) => +v.toFixed(1)),
    saturation: +(satSum / n).toFixed(3),
    luma: { p1: +q(0.01).toFixed(1), p50: +q(0.5).toFixed(1), p99: +q(0.99).toFixed(1) },
    lumaSpread: +(q(0.99) - q(0.01)).toFixed(1),
    detail: +(detail / dn).toFixed(2),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file, spec, out] = process.argv.slice(2);
  if (!cmd || !file || !spec) {
    console.error('usage: probe.mjs crop|stats <png> x,y,w,h [out.png]');
    process.exit(2);
  }
  const img = decodePNG(readFileSync(file));
  const r = region(img, spec);
  if (cmd === 'crop') {
    writeFileSync(out || 'crop.png', encodePNG(r.w, r.h, cut(img, r)));
    console.log(`${out || 'crop.png'} ${r.w}x${r.h} from ${r.x0},${r.y0}`);
  } else {
    console.log(JSON.stringify(stats(img, r)));
  }
}
