#!/usr/bin/env node
import assert from 'node:assert/strict';
import test from 'node:test';
import { deflateSync } from 'node:zlib';
import { chunk, encodePNG } from '../.kit/lib/image/png.mjs';
import { inspectMotionPNG, motionPlans, combatCoverage, diagnosticCombatPlan } from './motion-capture.mjs';

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
    enemyArchetype: 'ronin',
    stationaryOpeningFrames: 60,
    reactionFloorMs: 200,
    fixtureSelection: 'Existing 20-encounter trace had ronin reactions by authored frames 39 and 45; single-ashigaru attempts had none.',
    inputPath: 'DOM pointer and registered guard zone',
    injectedCombatState: false,
  });
  assert.equal(combat.actions.find((action) => action.method === 'spawnWave')?.args?.[1]?.archetypes?.[0], 'ronin');
  assert.ok(combat.actions.some((action) => action.do === 'bot' && action.on === true
    && action.policy === 'aggressive'));
  assert.ok(combat.actions.some((action) => action.do === 'bot' && action.on === false));
  assert.equal(combat.actions.some((action) => action.do === 'set'), false,
    'the sample must not inject a combat state');
});

test('incoming-attack coverage rejects the observed player-only counterattack', () => {
  const enemy = { id: 9000, state: 'attack', move: { startup: 0.52 }, attackTime: 0.1, weaponActive: false };
  const frames = [
    { frame: 0, player: { id: 1 }, enemies: [] },
    { frame: 7, player: { id: 1 }, enemies: [enemy] },
    { frame: 38, player: { id: 1 }, enemies: [{ ...enemy, attackTime: 0.52, weaponActive: true }] },
  ];
  const outgoing = [
    { f: 78, name: 'hit', attacker: { id: 1 }, target: { id: 9000 } },
    { f: 78, name: 'damage-taken', entity: { id: 9000 } },
  ];
  const coverage = combatCoverage(frames, outgoing);
  assert.equal(coverage.enemyStartupFrames, 1);
  assert.equal(coverage.enemyActiveFrames, 1);
  assert.equal(coverage.reactionEvents.length, 2);
  assert.equal(coverage.enemyReactionEvents.length, 0);
  for (const name of ['hit', 'parry']) {
    assert.equal(combatCoverage(frames, [{ f: 38, name, attacker: { id: 9000 } }]).enemyReactionEvents.length, 1);
  }
  assert.equal(combatCoverage(frames, [{ f: 30, name: 'hit', attacker: { id: 9000 } }]).enemyReactionEvents.length, 0);
  assert.equal(combatCoverage(frames.slice(0, 2), [{ f: 78, name: 'hit', attacker: { id: 9000 } }]).enemyReactionEvents.length, 0);
});

test('black-ribbon diagnostic keeps the reported ashigaru fixture isolated from the motion plan', () => {
  const [, combat] = motionPlans({
    gestureSafe: true,
    gestureCentre: { x: 608, y: 164 },
    stickOrigin: { x: 177, y: 265 },
    stickRadius: 56,
  });
  const diagnostic = diagnosticCombatPlan(combat);
  assert.equal(combat.conditions.enemyArchetype, 'ronin');
  assert.equal(diagnostic.conditions.enemyArchetype, 'ashigaru');
  assert.equal(diagnostic.conditions.stationaryOpeningFrames, 3);
  assert.equal(diagnostic.frames, 39);
  assert.equal(diagnostic.render, false);
  assert.equal(diagnostic.actions.filter((action) => action.method === 'spawnWave').length, 1);
  assert.equal(diagnostic.actions.find((action) => action.method === 'spawnWave').args[1].archetypes[0], 'ashigaru');
  assert.equal(diagnostic.actions.some((action) => action.do === 'bot' && action.f === 3), true);
});
