#!/usr/bin/env node
/**
 * probe.mjs — pixel evidence for the visual review.
 *
 * The critic brief demands measurements ("quote coordinates and RGB values") and the review
 * images are 2532x1170, so anything read off a downscaled view of the whole frame is a guess.
 * This crops a region at native resolution and reports what is actually in it, so a finding
 * can be stated as a number.
 *
 *   node tools/probe.mjs crop  shots/phone-wide-r5.png 0.1,0.45,0.5,0.25 out.png
 *   node tools/probe.mjs stats shots/phone-wide-r5.png 0.1,0.45,0.5,0.25
 *   node tools/probe.mjs px    shots/phone-wide-r5.png 760,515,127,47      # pixel box
 *
 * Regions are `x,y,w,h` as fractions of the frame, matching HUD_MASKS in luma.mjs. The
 * implementation is `kit/lib/image`, shared with the other repositories; `stats` is exported
 * under its old name so `verify-r9.mjs` keeps working unchanged.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { decodePNG, encodePNG } from '../kit/lib/image/png.mjs';
import { cut, pixelRegion, region, regionStats } from '../kit/lib/image/measure.mjs';

export { region, cut, pixelRegion };
/** Historical name kept for `verify-r9.mjs`. */
export const stats = regionStats;

if (import.meta.url === `file://${process.argv[1]}`) {
  const [cmd, file, spec, out] = process.argv.slice(2);
  if (!cmd || !file || !spec) {
    console.error('usage: probe.mjs crop|stats|px <png> x,y,w,h [out.png]');
    process.exit(2);
  }
  const img = decodePNG(readFileSync(file));
  const r = cmd === 'px'
    ? pixelRegion(img, ...spec.split(',').map(Number))
    : region(img, spec);

  if (cmd === 'crop') {
    writeFileSync(out || 'crop.png', encodePNG(r.w, r.h, cut(img, r)));
    console.log(`${out || 'crop.png'} ${r.w}x${r.h} from ${r.x0},${r.y0}`);
  } else {
    console.log(JSON.stringify(regionStats(img, r)));
  }
}
