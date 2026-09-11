#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  GOD_RAY_NEAR_OCCLUDER,
  godRayOccluderCompensation,
  godRayOccluderKeep,
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

// Source guards prevent a future cleanup from silently reverting alpha to a
// constant or paying one depth fetch for every radial sample.  Depth classification
// belongs in the quarter-resolution occlusion pass; the blur consumes packed alpha.
const source = readFileSync(new URL('../src/render/PostFX.js', import.meta.url), 'utf8');
assert.match(source, /gl_FragColor = vec4\(emit, keep\);/);
assert.match(source, /keptWeight \+= illum \* sampleValue\.a;/);
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
