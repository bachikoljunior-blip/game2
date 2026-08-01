/**
 * luma.mjs — tonal-range measurement, read from the saved PNG.
 *
 * The decoder and the histogram now live in `kit/lib/image`, shared with the other
 * repositories. What stays here is `HUD_MASKS`, which is KAGEROU's screen layout and nobody
 * else's.
 *
 * Why a saved PNG rather than the canvas, since this keeps getting re-asked: the WebGL
 * context is created with `preserveDrawingBuffer: false`, so `drawImage` on the canvas
 * outside the paint window yields a cleared buffer and every shot reports as pure black.
 * That failure is silent — it produces a perfectly plausible histogram of a frame that was
 * never there.
 *
 * The substitution was measured, not assumed: against `shots/phone-hero-kitcheck.png`
 * (2532x1170, 2,629,638 sampled pixels after masking) all twelve fields the previous
 * implementation returned are identical — p50 86, p1 3, p99 196, pctBelow16 8.024,
 * pctAbove240 0.054. The shared version additionally reports p25/p75/iqr and warm/cool
 * fractions, which is what proves the new code path is the one running rather than the
 * numbers being carried over untouched.
 */

export { decodePNG, encodePNG, crc32 } from '../kit/lib/image/png.mjs';
export { measureLuma, regionStats, region, cut, pixelRegion, compareRegion, loadImage } from '../kit/lib/image/measure.mjs';

/**
 * The HUD regions to mask, in fractional screen coordinates.
 *
 * The HUD is authored ink on near-black. Left in, it supplies the "true blacks" the grade is
 * being judged on and the tonal check passes for the wrong reason.
 */
export const HUD_MASKS = [
  { x: 0.74, y: 0.74, w: 0.26, h: 0.26 },   // keyboard hint card / action seals
  { x: 0.00, y: 0.68, w: 0.14, h: 0.32 },   // health column and stance seal
];

if (import.meta.url === `file://${process.argv[1]}`) {
  const { measureLuma } = await import('../kit/lib/image/measure.mjs');
  for (const f of process.argv.slice(2)) {
    console.log(f, JSON.stringify(measureLuma(f, HUD_MASKS)));
  }
}
