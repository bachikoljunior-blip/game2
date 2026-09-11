#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { chunk, encodePNG } from '../.kit/lib/image/png.mjs';
import { inspectMotionPNG, motionPlans } from './motion-capture.mjs';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function rgbaPNG(width, height, rgba) {
  assert.equal(rgba.length, width * height * 4);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; ihdr[9] = 6;
  const raw = Buffer.alloc(height * (width * 4 + 1));
  for (let y = 0; y < height; y++) {
    const start = y * (width * 4 + 1);
    raw[start] = 0;
    rgba.copy(raw, start + 1, y * width * 4, (y + 1) * width * 4);
  }
  return Buffer.concat([
    PNG_SIG,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

function rgbImage(width, height, pixel) {
  const rgb = Buffer.alloc(width * height * 3);
  for (let i = 0; i < width * height; i++) {
    const [r, g, b] = pixel(i % width, Math.floor(i / width));
    rgb.set([r, g, b], i * 3);
  }
  return encodePNG(width, height, rgb);
}

const size = { width: 8, height: 8 };
const gradient = rgbImage(8, 8, (x, y) => [20 + x * 11, 30 + y * 9, 40 + (x + y) * 4]);
const black = rgbImage(8, 8, () => [0, 0, 0]);
const constant = rgbImage(8, 8, () => [40, 80, 120]);

test('motion PNG gate accepts an opaque native-size image with real variance', () => {
  const result = inspectMotionPNG(gradient, { expectedDimensions: size });
  assert.deepEqual(result.faults, []);
  assert.ok(result.uniqueVisibleRGB > 2);
  assert.ok(result.populationVarianceRGB.every((value) => value > 0));
});

test('motion PNG gate rejects black, constant, and wrong-size evidence', () => {
  assert.match(inspectMotionPNG(black, { expectedDimensions: size }).faults.join(' '), /black/i);
  assert.match(inspectMotionPNG(constant, { expectedDimensions: size }).faults.join(' '), /single visible RGB/i);
  assert.match(inspectMotionPNG(gradient, {
    expectedDimensions: { width: 9, height: 8 },
  }).faults.join(' '), /expected native 9x8/i);
});

test('HUD colours cannot make an otherwise empty world pass', () => {
  const opaqueHUD = Buffer.alloc(8 * 8 * 4);
  for (let i = 0; i < 64; i++) opaqueHUD.set([220, 40 + i, 20, 255], i * 4);
  const hud = {
    png: rgbaPNG(8, 8, opaqueHUD), bounds: [0, 0, 8, 8], viewport: [8, 8],
    bitmap: [8, 8], transform: 'none',
  };
  const result = inspectMotionPNG(gradient, { expectedDimensions: size, hud });
  assert.equal(result.unoccludedWorld.samples, 0);
  assert.match(result.faults.join(' '), /No unoccluded background pixels/i);
});

test('transparent HUD pixels leave independently varied world evidence', () => {
  const transparentHUD = Buffer.alloc(8 * 8 * 4);
  const hud = {
    png: rgbaPNG(8, 8, transparentHUD), bounds: [0, 0, 8, 8], viewport: [8, 8],
    bitmap: [8, 8], transform: 'none',
  };
  const result = inspectMotionPNG(gradient, { expectedDimensions: size, hud });
  assert.deepEqual(result.faults, []);
  assert.equal(result.unoccludedWorld.samples, 64);
  assert.ok(result.unoccludedWorld.uniqueRGB > 2);
});

test('combat motion plan gets reactions through the validated DOM-input player script', () => {
  const [locomotion, combat] = motionPlans({
    gestureSafe: true,
    gestureCentre: { x: 608, y: 164 },
    stickOrigin: { x: 177, y: 265 },
    stickRadius: 56,
  });
  assert.equal(locomotion.frames + combat.frames, 300);
  assert.equal(combat.frames, 180);
  assert.deepEqual(combat.conditions, {
    playerScript: 'aggressive-v2',
    reactionFloorMs: 200,
    inputPath: 'DOM pointer and registered guard zone',
    injectedCombatState: false,
  });
  assert.ok(combat.actions.some((action) => action.do === 'bot' && action.on === true
    && action.policy === 'aggressive'));
  assert.ok(combat.actions.some((action) => action.do === 'bot' && action.on === false));
  assert.equal(combat.actions.some((action) => action.do === 'set'), false,
    'the sample must not inject a combat state');
});
