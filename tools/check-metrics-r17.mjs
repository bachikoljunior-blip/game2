import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { animStartup, audioPeak, postureResolution } from './interaction-metrics.mjs';

function trace(motionStart, chain = false) {
  const emotion = [];
  for (let f = 0; f < 150; f++) {
    const second = chain && f >= 100;
    const attack = f >= 60;
    const clock = (f - (second ? 100 : 60)) / 60;
    const moving = second ? f >= 110 && f < 115 : f >= motionStart && f < motionStart + 4;
    const active = second ? f >= 115 && f < 120 : f >= 80 && f < 85;
    // These synthetic pre-attack rows explicitly represent independently
    // qualified settled idle; tests below remove that qualification as controls.
    emotion.push([1, 2, 3].map((id) => [id, moving ? .012 : .001, attack ? 1 : 0,
      active ? 1 : 0, attack ? clock : 0, second ? 'second' : 'first', attack ? 0 : 1,
      id, 0, 3, 0, 0, attack ? 0 : 2]));
  }
  return { columns: { emotion }, stateNames: ['idle', 'attack'], frames: 150, events: [] };
}
assert.equal(animStartup(trace(62))[0].verdict, 'pass', '300ms motion then held tell must count');
assert.equal(animStartup(trace(75))[0].verdict, 'fail', '83ms real tell remains a failure');
assert.equal(animStartup(trace(62, true))[0].verdict, 'fail', 'a chained attack cannot borrow the previous tell');
assert.equal(animStartup(trace(200))[0].verdict, 'fail', 'state alone is never evidence of visible startup');
const contaminated = trace(62);
for (let f = 0; f < 30; f++) for (const row of contaminated.columns.emotion[f]) {
  row[1] = .04; row[6] = 0;
}
const calibrated = animStartup(contaminated)[0];
assert.equal(calibrated.verdict, 'pass', 'excluded braking/pose-transition frames must not inflate idle calibration');
assert.equal(calibrated.measured.idleMotionFloorM, .001);
assert.equal(calibrated.measured.calibration[0].unfilteredIdleMedianM, .04);
const shortWithTransitions = trace(75);
for (let f = 0; f < 30; f++) for (const row of shortWithTransitions.columns.emotion[f]) {
  row[1] = .04; row[6] = 0;
}
assert.equal(animStartup(shortWithTransitions)[0].verdict, 'fail', 'removing calibration contamination must not excuse an 83ms tell');
const insufficient = trace(62);
for (let f = 0; f < 31; f++) for (const row of insufficient.columns.emotion[f]) row[6] = 0;
const inadequate = animStartup(insufficient)[0];
assert.equal(inadequate.verdict, 'inconclusive');
assert.equal(inadequate.measured.attacks, 3);
assert.equal(inadequate.measured.uncalibratedAttacks, 3, 'insufficient calibration keeps every attack in the result');
const legacy = trace(62);
for (const rows of legacy.columns.emotion) for (const row of rows) row.length = 6;
assert.equal(animStartup(legacy)[0].verdict, 'inconclusive', 'legacy idle labels cannot prove stationary pose calibration');
const mixed = trace(62);
for (const rows of mixed.columns.emotion) rows[0][6] = 0;
const partial = animStartup(mixed)[0];
assert.equal(partial.verdict, 'inconclusive', 'one uncalibrated enemy cannot be omitted to pass');
assert.equal(partial.measured.attacks, 3);
assert.equal(partial.measured.measuredAttacks, 2);
const partialFailure = trace(75);
for (const rows of partialFailure.columns.emotion) rows[0][6] = 0;
assert.equal(animStartup(partialFailure)[0].verdict, 'fail', 'a demonstrated short tell remains fail when another enemy is uncalibrated');
function withSeparateCalibration(motionStart) {
  const observation = trace(motionStart);
  const tail = 1800 - observation.columns.emotion.length;
  for (let f = 0; f < tail; f++) observation.columns.emotion.push([1, 2, 3].map(id =>
    [id, .001, 0, 0, 0, null, 0]));
  observation.frames = 1800;
  observation.observation = { phase: 'gameplay-observation', frames: 1800,
    calibrationFramesIncluded: 0, authoredFrames: 900 };
  for (const rows of observation.columns.emotion) for (const row of rows) row[6] = 0;
  const subjects = [1, 2, 3].map(enemy => ({ enemy, archetype: 'ronin', rig: `same-rig-${enemy}`,
    rigScale: 1, height: 1.75, rootScale: [1, 1, 1], visualScale: [1, 1, 1],
    spawn: { position: [enemy, 0, 3], seed: 100 + enemy, alerted: true, faceTarget: true, target: 7 } }));
  observation.idleCalibration = {
    phase: 'rig-idle-calibration', dtMs: 1000 / 60, stride: 1, frames: 120, completedFrames: 120,
    method: 'same-instance Enemy._updateAnim at 60 Hz before AI activation',
    limitation: 'calibrated Rig idle noise, not natural AI waiting', resetLifecycle: 'Enemy.reset(position, opts)',
    enemyAnimUpdates: 360, worldMatrixUpdates: 120,
    attacks: 0, activeSamples: 0, attackStateSamples: 0, events: [],
    subjects, observationSubjects: structuredClone(subjects), stateNames: ['idle', 'attack'], errors: [],
    columns: { emotion: Array.from({ length: 120 }, () => subjects.map(s =>
      [s.enemy, .001, 0, 0, 0, null, 1, s.enemy, 0, 3, 0, 0, 2])) },
  };
  return observation;
}
const separate = withSeparateCalibration(62);
assert.equal(animStartup(separate)[0].verdict, 'pass');
assert.equal(animStartup(separate)[0].measured.attacks, 3, 'calibration samples never enter attack observation');
assert.equal(animStartup(withSeparateCalibration(75))[0].verdict, 'fail', 'separate calibration retains 83ms failure');
assert.equal(animStartup(withSeparateCalibration(200))[0].verdict, 'fail', 'separate calibration retains motionless failure');
const calibrationAttack = withSeparateCalibration(62);
calibrationAttack.idleCalibration.columns.emotion[110][0][3] = 1;
const invalidPhase = animStartup(calibrationAttack)[0];
assert.equal(invalidPhase.verdict, 'inconclusive', 'calibration must prove zero attacks from raw data');
assert.equal(invalidPhase.measured.attacks, 3, 'faulty calibration still retains every observation attack');
const missingAnimUpdate = withSeparateCalibration(62);
missingAnimUpdate.idleCalibration.enemyAnimUpdates--;
assert.equal(animStartup(missingAnimUpdate)[0].verdict, 'inconclusive', 'partial _updateAnim calibration cannot pass');
const calibrationTelegraph = withSeparateCalibration(62);
calibrationTelegraph.idleCalibration.events.push({ name: 'telegraph' });
assert.equal(animStartup(calibrationTelegraph)[0].verdict, 'inconclusive', 'calibration must have zero attack events');
const wrongRig = withSeparateCalibration(62);
wrongRig.idleCalibration.observationSubjects[0].rig = 'different-rig';
assert.equal(animStartup(wrongRig)[0].verdict, 'inconclusive', 'another Rig cannot supply the observed enemy floor');
const wrongScale = withSeparateCalibration(62);
wrongScale.idleCalibration.observationSubjects[0].rootScale[0] = 2;
assert.equal(animStartup(wrongScale)[0].verdict, 'inconclusive', 'different scale cannot supply the observed enemy floor');
const incompleteCalibration = withSeparateCalibration(62);
incompleteCalibration.idleCalibration.columns.emotion.pop();
assert.equal(animStartup(incompleteCalibration)[0].verdict, 'inconclusive', 'incomplete raw calibration cannot pass');
const transitioningCalibration = withSeparateCalibration(62);
for (const rows of transitioningCalibration.idleCalibration.columns.emotion) for (const row of rows) {
  row[6] = 1; row[11] = 32;
}
assert.equal(animStartup(transitioningCalibration)[0].verdict, 'inconclusive', 'pose transitions cannot calibrate idle noise even if the summary flag is wrong');
const turningCalibration = withSeparateCalibration(62);
for (const rows of turningCalibration.idleCalibration.columns.emotion) for (const row of rows) {
  row[6] = 1; row[11] = 8;
}
assert.equal(animStartup(turningCalibration)[0].verdict, 'inconclusive', 'a stationary XYZ root that turns cannot calibrate idle noise even if the summary flag is wrong');
const shortObservation = withSeparateCalibration(62);
shortObservation.frames = shortObservation.observation.frames = 1799;
assert.equal(animStartup(shortObservation)[0].verdict, 'inconclusive', 'calibration time cannot be counted toward the 1800-frame gameplay observation');
const missingRequestedCalibration = trace(62);
missingRequestedCalibration.observation = { phase: 'gameplay-observation' };
missingRequestedCalibration.idleCalibration = null;
assert.equal(animStartup(missingRequestedCalibration)[0].verdict, 'inconclusive', 'a missing requested calibration cannot silently fall back to observation idle');
const sampledOnly = audioPeak({ peak: .1, samples: 6, truePeakEstimateDb: -20, impacts: ['a', 'b', 'c', 'd', 'e'] })[0];
assert.equal(sampledOnly.verdict, 'inconclusive', 'sample/interpolated peaks are not ITU-R true peak');
assert.equal(sampledOnly.measured.truePeak, null);
assert.equal(audioPeak({ peak: .1, samples: 6, impacts: [], truePeak: {
  standard: 'ITU-R BS.1770-4', dbfs: -1.2 } })[0].verdict, 'pass');
assert.equal(audioPeak({ peak: .1, samples: 6, impacts: [], truePeak: {
  standard: 'ITU-R BS.1770-4', dbfs: -.8 } })[0].verdict, 'fail');
const events = Array.from({ length: 20 }, (_, f) => ({ name: 'mark', label: `encounter:${f}`, f }));
for (let id = 1; id <= 5; id++) {
  events.push({ name: 'execution', phase: 'impact', victim: { id }, f: 30 + id });
  events.push({ name: 'death', entity: { id, faction: 'oni' }, f: 30 + id });
  events.push({ name: 'death', f: 30 + id }); // anonymous compatibility notification
}
const executionResolution = postureResolution({ events })[0];
assert.equal(executionResolution.measured.enemyDeaths, 5, 'anonymous compatibility deaths do not inflate the denominator');
assert.equal(executionResolution.measured.postureResolvedFraction, 1, 'execution payload names victim, not entity');
const path = process.argv.find(arg => arg.startsWith('--trace='))?.slice('--trace='.length);
if (path) {
  const actual = animStartup(JSON.parse(readFileSync(path, 'utf8')))[0];
  console.log(JSON.stringify({ source: path, result: actual }, null, 2));
}
console.log('Metrics: held/short/chained/motionless tells, qualified and separate calibration with attack/identity/scale/completeness controls, and execution payload checks passed.');
