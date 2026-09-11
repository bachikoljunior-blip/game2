import assert from 'node:assert/strict';
import { PerspectiveCamera, Vector2, Vector3, Quaternion } from 'three';
import { EventBus } from '../src/core/EventBus.js';
import { EffectsSystem } from '../src/fx/Effects.js';
import { PlayerCamera } from '../src/gameplay/PlayerCamera.js';

// Deterministic class-level fixture. It measures authored shake and event routing;
// it is not rendered phone evidence and does not close BM-CAMERA-04 by itself.
globalThis.window = Object.assign(new EventTarget(), { innerWidth: 844, innerHeight: 390 });

const bus = new EventBus();
const ctx = {
  bus,
  camera: new PerspectiveCamera(58, 844 / 390, 0.12, 900),
  input: { state: { look: new Vector2() } },
  player: {
    position: new Vector3(0, 812, 0), yaw: 0, height: 1.75, radius: 0.34,
    speed: 0, isAlive: true, setOpacity() {},
  },
};
const fx = ctx.fx = new EffectsSystem(ctx);
fx._subscribe();
const playerCamera = ctx.playerCamera = new PlayerCamera(ctx);
await playerCamera.init();

let busErrors = 0;
const priorError = console.error;
console.error = () => { busErrors++; };
try {
  bus.emit('camera-shake', { amount: 0.42, duration: 0.4, freq: 26 });
} finally {
  console.error = priorError;
}

assert.equal(busErrors, 0, 'camera-shake must not recurse into EventBus error handling');
assert.equal(fx.trauma, 0.42, 'one event must add trauma exactly once');
assert.equal(fx.traumaDecay, 2.5, '0.4 s duration must author a 2.5/s decay');
assert.equal(fx.shakeFreq, 26, 'event frequency must reach the sole shake owner');
assert.equal('trauma' in playerCamera, false, 'PlayerCamera must not retain duplicate shake state');

// The compatibility call is one-way into Effects and must not call back into the camera.
playerCamera.addShake(0.18, 0.5, 17);
assert.equal(fx.trauma, 0.6);
assert.equal(fx.traumaDecay, 2);
assert.equal(fx.shakeFreq, 17);

const outPos = new Vector3();
const outQuat = new Quaternion();
fx._updateShake(1 / 60);
assert.ok(Math.abs(fx.trauma - (0.6 - 2 / 60)) < 1e-12);
assert.ok(Math.abs(fx._shakeSeed - 17 / 60) < 1e-12);
assert.equal(fx.getShakeOffset(outPos, outQuat), true);
assert.ok(outPos.toArray().every(Number.isFinite));
assert.ok(outQuat.toArray().every(Number.isFinite));

// Perfect-deflect authored amplitude, measured through the actual Effects output
// and PlayerCamera's final-pose application for the binding 130 ms window.
fx.trauma = 0;
fx._shakeSeed = 0;
fx.shakeOffset.set(0, 0, 0);
fx.shakeQuat.identity();
bus.emit('camera-shake', { amount: 0.42, duration: 0.4, freq: 26 });
playerCamera.snap();
const subject = new Vector3(0, 812.95, 0);
let maxFrameWidthFraction = 0;
for (let frame = 0; frame < 8; frame++) {
  ctx.camera.position.copy(playerCamera._camPos);
  ctx.camera.lookAt(playerCamera._lookTarget);
  ctx.camera.updateMatrixWorld();
  const calm = subject.clone().project(ctx.camera);

  fx._updateShake(1 / 60);
  playerCamera._applyPose(1 / 60);
  const shaken = subject.clone().project(ctx.camera);
  maxFrameWidthFraction = Math.max(maxFrameWidthFraction, Math.abs(shaken.x - calm.x) / 2);
}
assert.ok(maxFrameWidthFraction <= 0.04,
  `perfect-deflect shake moved the subject ${(maxFrameWidthFraction * 100).toFixed(3)}% of frame width`);

// A snap is a lifecycle discontinuity: it must not carry pose transients from a
// prior scenario into the first frame of a paired ablation.
playerCamera.pitch = 1.1;
playerCamera._fov = 63;
playerCamera._punch = 1;
playerCamera._speedNorm = 1;
playerCamera._hitstop = 0.2;
playerCamera.snap();
assert.ok(Math.abs(playerCamera.pitch - 14 * Math.PI / 180) < 1e-12);
assert.equal(playerCamera._fov, playerCamera._baseFov);
assert.equal(playerCamera._punch, 0);
assert.equal(playerCamera._speedNorm, 0);
assert.equal(playerCamera._hitstop, 0);

// Duration authors the decay rate for full trauma; a 0.42 impulse therefore
// reaches zero in ceil(0.42 * 0.4 * 60) = 11 unscaled 60 Hz steps.
fx.trauma = 0;
fx._shakeSeed = 0;
fx.addShake(0.42, 0.4, 26);
let decayFrames = 0;
while (fx.trauma > 0 && decayFrames < 120) { fx._updateShake(1 / 60); decayFrames++; }
assert.equal(decayFrames, 11, '0.42 trauma at 2.5/s decays in 0.183 s by trauma design');
assert.equal(fx.trauma, 0);

playerCamera.dispose();
for (const off of fx._unsub) off?.();

console.log(JSON.stringify({
  eventApplications: 1,
  authored: { amount: 0.42, durationSeconds: 0.4, frequencyHz: 26 },
  peakSubjectShiftPercentFrameWidth: +(maxFrameWidthFraction * 100).toFixed(4),
  traumaDecayFrames60Hz: decayFrames,
  busErrors,
  owner: 'EffectsSystem',
}, null, 2));
