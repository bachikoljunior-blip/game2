#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GOD_RAY_NEAR_OCCLUDER,
  godRayOccluderCompensation,
  godRayOccluderKeep,
  sanitizeGodRayRadiance,
} from '../src/render/PostFX.js';

// A fighter at the 4 m follow-camera distance with world depth exposed beside
// their silhouette must not be promoted into a full-height radial blocker.
assert.equal(godRayOccluderKeep(4, 4.4, 18), 0);
assert.equal(godRayOccluderKeep(4, 20, 4.3), 0);

// Continuous nearby terrain has no cross-ray depth discontinuity and remains a
// blocker.  This is what prevents the repair from painting shafts across the floor.
assert.equal(godRayOccluderKeep(4, 4.4, 4.7), 1);

// Distant architecture retains the authored shaft silhouette even when backed by sky.
assert.equal(godRayOccluderKeep(18, 1000, 1000), 1);

// The transition is bounded and monotone: only the near field can be bypassed.
const distanceSweep = [4, 6, 8, 10, 12, 14].map((z) => godRayOccluderKeep(z, 30, 30));
for (let i = 1; i < distanceSweep.length; i++) {
  assert.ok(distanceSweep[i] >= distanceSweep[i - 1]);
}
assert.equal(distanceSweep[0], 0);
assert.equal(distanceSweep.at(-1), 1);

// Missing near-silhouette samples are reconstructed from the kept integral, but
// the cap forbids a mostly-hidden ray from becoming a new bright streak.
assert.equal(godRayOccluderCompensation(1, 1), 1);
assert.equal(godRayOccluderCompensation(1, 0.8), 1.25);
assert.equal(
  godRayOccluderCompensation(1, 0.1),
  GOD_RAY_NEAR_OCCLUDER.maxCompensation,
);
assert.equal(godRayOccluderCompensation(1, 0), 1);

// CPU contract mirror only: this does not compile or execute GLSL. An additive light
// path must be monotone: radiance in the authored range is bit-for-bit unchanged, while
// negative/non-finite reconstruction values cannot darken the source image.
assert.deepEqual(sanitizeGodRayRadiance([0.25, 2, 120]), [0.25, 2, 120]);
assert.deepEqual(sanitizeGodRayRadiance([-0.25, Number.NaN, -Infinity]), [0, 0, 0]);
assert.deepEqual(sanitizeGodRayRadiance([Infinity, 20000, 0]), [16384, 16384, 0]);

// Source guards prevent a future cleanup from silently reverting alpha to a
// constant or paying one depth fetch for every radial sample.  Depth classification
// belongs in the quarter-resolution occlusion pass; the blur consumes packed alpha.
const source = readFileSync(new URL('../src/render/PostFX.js', import.meta.url), 'utf8');
assert.match(source, /gl_FragColor = vec4\(emit, keep\);/);
assert.match(source, /keptWeight \+= illum \* sampleValue\.a;/);
// These are static source guards, not evidence of shader compilation, precision, GPU
// cost, or pixel correctness. The rendered CI capture owns those claims.
const radianceHelper = source.match(/vec3 nonNegativeRadiance\(vec3 c\) \{[\s\S]*?\n\}/)?.[0];
assert.ok(radianceHelper, 'nonNegativeRadiance GLSL helper is missing');
assert.match(radianceHelper, /c\.r > 0\.0 \? min\(c\.r, 16384\.0\) : 0\.0/);
assert.match(radianceHelper, /c\.g > 0\.0 \? min\(c\.g, 16384\.0\) : 0\.0/);
assert.match(radianceHelper, /c\.b > 0\.0 \? min\(c\.b, 16384\.0\) : 0\.0/);
assert.match(source, /vec3 src = nonNegativeRadiance\(texture2D\(tScene, vUv\)\.rgb\);/);
assert.match(source, /color \+= nonNegativeRadiance\(texture2D\(tGod, uv\)\.rgb\)/);
const blur = source.slice(source.indexOf('const FRAG_GOD_BLUR'), source.indexOf('const FRAG_DOF_COC'));
assert.doesNotMatch(blur, /tDepth/);
assert.match(source, /if \(this\._godRays && this\.rtGodA\) this\._passGodRays/);

console.log(JSON.stringify({
  status: 'PASS',
  distanceSweep,
  continuousNearGroundKeep: godRayOccluderKeep(4, 4.4, 4.7),
  distantArchitectureKeep: godRayOccluderKeep(18, 1000, 1000),
  cappedCompensation: godRayOccluderCompensation(1, 0.1),
}, null, 2));
