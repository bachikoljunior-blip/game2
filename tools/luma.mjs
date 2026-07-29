/**
 * luma.mjs — tonal-range measurement, read from the saved PNG.
 *
 * The obvious place to measure is in-page off the canvas, and it does not work: the
 * WebGL context is created with `preserveDrawingBuffer: false`, so `drawImage` on the
 * canvas outside the paint window yields a cleared buffer and every shot reports as
 * pure black. Rather than pay for a preserved drawing buffer on a mobile-first build
 * just to satisfy the harness, decode the PNG we already wrote.
 *
 * Pure Node: zlib for the IDAT stream, a hand-rolled un-filter. No image dependency.
 */

import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Paeth predictor, per the PNG spec. */
function paeth(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
  return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
}

/** Decode an 8-bit RGB/RGBA non-interlaced PNG into { width, height, channels, data }. */
export function decodePNG(buf) {
  if (!buf.subarray(0, 8).equals(PNG_SIG)) throw new Error('not a PNG');
  let off = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];

  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.toString('ascii', off + 4, off + 8);
    const body = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      depth = body[8];
      colorType = body[9];
      interlace = body[12];
    } else if (type === 'IDAT') {
      idat.push(body);
    } else if (type === 'IEND') break;
    off += 12 + len;                       // length + type + data + CRC
  }

  if (depth !== 8) throw new Error(`unsupported bit depth ${depth}`);
  if (interlace !== 0) throw new Error('interlaced PNG not supported');
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0;
  if (!channels) throw new Error(`unsupported colour type ${colorType}`);

  const raw = inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const src = y * (stride + 1) + 1;
    const dst = y * stride;
    const prev = dst - stride;
    for (let x = 0; x < stride; x++) {
      const v = raw[src + x];
      const a = x >= channels ? out[dst + x - channels] : 0;
      const b = y > 0 ? out[prev + x] : 0;
      const c = x >= channels && y > 0 ? out[prev + x - channels] : 0;
      let r;
      switch (filter) {
        case 0: r = v; break;
        case 1: r = v + a; break;
        case 2: r = v + b; break;
        case 3: r = v + ((a + b) >> 1); break;
        case 4: r = v + paeth(a, b, c); break;
        default: throw new Error(`bad filter ${filter} on row ${y}`);
      }
      out[dst + x] = r & 0xff;
    }
  }
  return { width, height, channels, data: out };
}

/**
 * Rec.709 luma histogram and percentiles.
 *
 * `exclude` masks out screen-space rectangles in fractional coordinates — the HUD is
 * authored ink on near-black and would otherwise supply the "true blacks" the grade is
 * being judged on, which would make the check pass for the wrong reason.
 */
export function measureLuma(pngPath, exclude = []) {
  const { width, height, channels, data } = decodePNG(readFileSync(pngPath));
  const hist = new Uint32Array(256);
  let n = 0;

  const boxes = exclude.map((e) => ({
    x0: e.x * width, x1: (e.x + e.w) * width,
    y0: e.y * height, y1: (e.y + e.h) * height,
  }));

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let masked = false;
      for (let i = 0; i < boxes.length; i++) {
        const b = boxes[i];
        if (x >= b.x0 && x < b.x1 && y >= b.y0 && y < b.y1) { masked = true; break; }
      }
      if (masked) continue;
      const p = (y * width + x) * channels;
      hist[(0.2126 * data[p] + 0.7152 * data[p + 1] + 0.0722 * data[p + 2]) | 0]++;
      n++;
    }
  }

  const at = (frac) => {
    let acc = 0;
    const target = n * frac;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= target) return v; }
    return 255;
  };
  let below = 0, above = 0;
  for (let v = 0; v < 16; v++) below += hist[v];
  for (let v = 241; v < 256; v++) above += hist[v];

  return {
    width, height, samples: n,
    p01: at(0.001), p1: at(0.01), p10: at(0.10), p50: at(0.5),
    p90: at(0.90), p99: at(0.99), p999: at(0.999),
    pctBelow16: +(100 * below / n).toFixed(3),
    pctAbove240: +(100 * above / n).toFixed(3),
  };
}

/** The HUD regions to mask, in fractional screen coordinates. */
export const HUD_MASKS = [
  { x: 0.74, y: 0.74, w: 0.26, h: 0.26 },   // keyboard hint card / action seals
  { x: 0.00, y: 0.68, w: 0.14, h: 0.32 },   // health column and stance seal
];

if (import.meta.url === `file://${process.argv[1]}`) {
  for (const f of process.argv.slice(2)) {
    console.log(f, JSON.stringify(measureLuma(f, HUD_MASKS)));
  }
}
