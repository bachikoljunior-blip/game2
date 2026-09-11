import assert from 'node:assert/strict';
import { Group, Vector3 } from 'three';
import { Rig } from '../src/anim/Rig.js';
import { CLIPS } from '../src/anim/Poses.js';
import { footPlant } from './interaction-metrics.mjs';

const baseline = process.argv.includes('--baseline');
const rounded = (n) => Number(n.toFixed(5));
const results = [];
// The fixture only replaces the ground and root controller. Every pose, phase,
// matrix update and leg solve runs through the shipped Rig implementation.
for (const slopeDegrees of [-15, 0, 15]) {
  for (const speed of [1.9, 5.4, 7.2]) {
    const slope = Math.tan(slopeDegrees * Math.PI / 180);
    const ground = (x, z) => 812 - z * slope;
    const normal = new Vector3(0, 1, slope).normalize();
    const hit = { hit: true, point: new Vector3(), normal };
    const ctx = { physics: { raycastDown(x, y, z, maxDist) {
      const h = ground(x, z);
      hit.hit = h <= y && h >= y - maxDist;
      hit.point.set(x, h, z);
      return hit;
    } } };
    const rig = new Rig(ctx, { autoBuild: false, cloth: false });
    rig.built = true;
    rig.root.position.y = ground(0, 0);
    rig.setGround(normal, true);
    rig.setLocomotion(speed, 0);
    const p = new Vector3(), prev = [new Vector3(), new Vector3()];
    const rows = [], contactDrift = [];
    const prevLocked = [false, false];
    let minClearance = Infinity, maxClearance = -Infinity, nonFinite = 0;
    for (let f = 0; f < 600; f++) {
      rig.root.position.z -= speed / 60;
      rig.root.position.y = ground(0, rig.root.position.z);
      rig.update(1 / 60);
      const row = [];
      for (let i = 0; i < 2; i++) {
        rig.bones[i ? 'footR' : 'footL'].getWorldPosition(p);
        const clearance = p.y - ground(p.x, p.z);
        const drift = Math.hypot(p.x - prev[i].x, p.z - prev[i].z);
        row.push(rounded(clearance), rounded(drift));
        if (f > 120) {
          minClearance = Math.min(minClearance, clearance);
          maxClearance = Math.max(maxClearance, clearance);
          if (rig._footLocked[1 - i] && prevLocked[i]) contactDrift.push(drift * 100);
        }
        prevLocked[i] = !!rig._footLocked[1 - i];
        prev[i].copy(p);
      }
      if (f > 120) rows.push(row);
      for (const bone of rig.boneList) if (!bone.matrixWorld.elements.every(Number.isFinite)) nonFinite++;
    }
    const result = footPlant({ columns: { feet: rows }, events: [] })[0];
    results.push({ slopeDegrees, speed, ...result.measured,
      stanceSamples: contactDrift.length,
      maxStanceDriftCm: rounded(Math.max(0, ...contactDrift)),
      minAnkleClearanceM: rounded(minClearance), maxAnkleClearanceM: rounded(maxClearance), nonFinite });
    if (!baseline) {
      assert.equal(result.verdict, 'pass', `${speed} m/s, ${slopeDegrees} degrees: ${JSON.stringify(result.measured)}`);
      assert.ok(result.measured.contactSamples > 100, 'Contact coverage cannot disappear to pass.');
      assert.ok(minClearance > 0.06, 'The ankle cannot be buried.');
      assert.ok(maxClearance > 0.14, 'The swing foot must leave the floor.');
      assert.equal(nonFinite, 0);
    }
  }
}
const secondary = [];
if (!baseline) {
  // Match the controller -> leaning body -> rig nesting used by Player. A
  // local-Y pelvis correction must still solve contacts in the world frame.
  for (const speed of [1.9, 5.4, 7.2]) {
    const ground = (x, z) => 812 - 0.15 * x - Math.tan(Math.PI / 12) * z;
    const rig = new Rig({ terrain: { heightAt: ground } }, { autoBuild: false, cloth: false });
    rig.built = true;
    rig.setGround(new Vector3(0.15, 1, Math.tan(Math.PI / 12)).normalize(), true);
    rig.setLocomotion(speed, 0);
    const root = new Group(), body = new Group();
    root.add(body); body.add(rig.root);
    root.rotation.y = 0.8; body.rotation.x = speed / 7.2 * 0.075; body.rotation.z = 0.2;
    const p = new Vector3(), prev = [new Vector3(), new Vector3()], rows = [];
    for (let f = 0; f < 600; f++) {
      root.position.x -= Math.sin(0.8) * speed / 60;
      root.position.z -= Math.cos(0.8) * speed / 60;
      root.position.y = ground(root.position.x, root.position.z);
      rig.update(1 / 60);
      const row = [];
      for (let i = 0; i < 2; i++) {
        rig.bones[i ? 'footR' : 'footL'].getWorldPosition(p);
        row.push(p.y - ground(p.x, p.z), Math.hypot(p.x - prev[i].x, p.z - prev[i].z));
        prev[i].copy(p);
      }
      if (f > 120) rows.push(row);
    }
    const result = footPlant({ columns: { feet: rows }, events: [] })[0];
    assert.equal(result.verdict, 'pass');
    assert.ok(result.measured.worstDriftCm <= 2);
    secondary.push({ check: 'transformed-parent-compound-slope', speed,
      p95DriftCm: result.measured.p95DriftCm, worstDriftCm: result.measured.worstDriftCm });
  }

  const transitions = new Rig({ terrain: { heightAt: () => 812 } }, { autoBuild: false, cloth: false });
  transitions.built = true; transitions.root.position.y = 812;
  const transitionRows = [], point = new Vector3(), previous = [new Vector3(), new Vector3()];
  for (let f = 0; f < 1200; f++) {
    const speed = f < 120 ? 0 : f < 360 ? 1.9 : f < 600 ? 5.4 : f < 840 ? 7.2 : f < 960 ? 0 : 5.4;
    transitions.setLocomotion(speed, 0);
    transitions.root.position.z -= speed / 60;
    transitions.update(1 / 60);
    const row = [];
    for (let i = 0; i < 2; i++) {
      transitions.bones[i ? 'footR' : 'footL'].getWorldPosition(point);
      row.push(point.y - 812, Math.hypot(point.x - previous[i].x, point.z - previous[i].z));
      previous[i].copy(point);
    }
    transitionRows.push(row);
  }
  const transitionResult = footPlant({ columns: { feet: transitionRows }, events: [] })[0];
  assert.ok(transitionResult.measured.worstDriftCm <= 2, 'Starting and stopping must not move a planted ankle.');
  secondary.push({ check: 'start-speed-change-stop-restart', ...transitionResult.measured });

  let mappedCases = 0, maxMarkerError = 0, maxPoseError = 0;
  for (const clip of Object.values(CLIPS)) {
    const first = clip.events.find((e) => e.name === 'hit-active-start');
    const last = clip.events.find((e) => e.name === 'hit-active-end');
    if (!first || !last) continue;
    for (const dt of [1 / 60, 1 / 30]) {
      for (const attack of [{ startup: 0.22, active: 0.11, recovery: 0.33 },
        { startup: 0.72, active: 0.26, recovery: 0.84 }]) {
        const rig = new Rig({}, { autoBuild: false, cloth: false });
        rig.built = true;
        let elapsed = 0;
        const seen = [];
        rig.on('*', (event) => {
          if (event.name === 'hit-active-start' || event.name === 'hit-active-end')
            seen.push({ name: event.name, time: elapsed, source: event.t });
        });
        const layer = rig.play(clip.name, { layer: 'base', fade: 0, attack, duration: 99 });
        assert.equal(layer.attackTimed, true, clip.name);
        const total = attack.startup + attack.active + attack.recovery;
        for (let f = 0; f < Math.ceil((total + 0.1) / dt); f++) {
          elapsed = (f + 1) * dt;
          rig.update(dt);
        }
        assert.deepEqual(seen.map((e) => e.name), ['hit-active-start', 'hit-active-end'], clip.name);
        for (let i = 0; i < 2; i++) {
          const expected = attack.startup + (i ? attack.active : 0);
          const error = seen[i].time - expected;
          assert.ok(error >= -1e-8 && error <= dt + 1e-8, `${clip.name}: marker error ${error}`);
          maxMarkerError = Math.max(maxMarkerError, error);
        }
        // Pose equality at the mapped startup endpoint independently compares the
        // timed layer to an ordinary source-clip sample, with procedural additives off.
        rig.play(clip.name, { layer: 'base', fade: 0, attack });
        rig._advanceLayers(attack.startup);
        rig._compose();
        const expectedRig = new Rig({}, { autoBuild: false, cloth: false });
        expectedRig.play(clip.name, { layer: 'base', fade: 0, offset: first.t });
        expectedRig.layers[0].weight = 1;
        expectedRig._compose();
        for (let i = 0; i < rig._outQ.length; i++)
          maxPoseError = Math.max(maxPoseError, Math.abs(rig._outQ[i] - expectedRig._outQ[i]));
        mappedCases++;
      }
    }
  }
  assert.ok(maxPoseError < 1e-6, 'The pose must use the same mapped clock as its hit markers.');
  secondary.push({ check: 'piecewise-attack-clock', cases: mappedCases,
    maxMarkerErrorMs: rounded(maxMarkerError * 1000), maxPoseQuaternionComponentError: maxPoseError });

  const noAttack = new Rig({}, { autoBuild: false });
  const normal = noAttack.play('slash_horizontal_r', { duration: 1.2, layer: 'base' });
  assert.equal(normal.attackTimed, false);
  assert.equal(normal.speed, CLIPS.slash_horizontal_r.duration / 1.2);
  const feint = noAttack.play('slash_horizontal_r', {
    duration: 1.2, layer: 'base', attack: { startup: 0.4, active: 0, recovery: 0.8 },
  });
  assert.equal(feint.attackTimed, false);
  assert.equal(feint.speed, CLIPS.slash_horizontal_r.duration / 1.2);
  secondary.push({ check: 'default-duration-and-zero-active', unchanged: true });

  for (const dt of [1 / 60, 1 / 30, 0.25]) {
    const rig = new Rig({}, { autoBuild: false, cloth: false });
    rig.built = true; rig.setLocomotion(5.4, 0);
    let maxLag = 0;
    for (let f = 0; f < 2000; f++) {
      rig.root.position.z -= 5.4 * dt;
      rig.root.rotation.y = 0.2 * Math.sin(f * 0.03);
      if (f % 23 === 0) { rig.addFlinch(); rig.addRecoil(); }
      rig.update(dt);
      for (const bone of rig.boneList) assert.ok(bone.matrixWorld.elements.every(Number.isFinite), `dt=${dt}, frame=${f}`);
      maxLag = Math.max(maxLag, Math.abs(rig._lagSpine));
    }
    assert.ok(maxLag < 0.05);
    secondary.push({ check: 'spring-finite', dt, frames: 2000, maxSpineLagRadians: rounded(maxLag) });
  }

  const bad = { hit: true, point: new Vector3(0, NaN, 0), normal: new Vector3(0, 1, 0) };
  const boundary = new Rig({ physics: { raycastDown: () => bad } }, { autoBuild: false, cloth: false });
  boundary.built = true;
  const warn = console.warn;
  let warnings = 0;
  try {
    console.warn = () => warnings++;
    for (let f = 0; f < 30; f++) boundary.update(f === 3 ? NaN : 1 / 60);
  } finally { console.warn = warn; }
  assert.equal(warnings, 1);
  assert.ok(boundary.boneList.every((b) => b.matrixWorld.elements.every(Number.isFinite)));
  bad.hit = false; bad.point.y = 999;
  assert.equal(boundary._probeGround(0, 1, 0, 2), false, 'A miss cannot reuse an old hit record.');
  secondary.push({ check: 'invalid-ground-and-time', finite: true, warnings });
}
console.log(JSON.stringify({ mode: baseline ? 'baseline' : 'verification', results, secondary }, null, 2));
