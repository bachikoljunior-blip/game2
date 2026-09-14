#!/usr/bin/env node

import assert from 'node:assert/strict';
import { Vector3 } from 'three';
import { Rig } from '../src/anim/Rig.js';

const quality = { tier: 1, cloth: true };

function maximumTriangleEdge(rig) {
  const geometry = rig.mesh.geometry;
  const source = geometry.attributes.position;
  const index = geometry.index.array;
  const points = [new Vector3(), new Vector3(), new Vector3()];
  rig.root.updateMatrixWorld(true);
  rig.skeleton.update();
  let maximum = 0;
  for (let i = 0; i < index.length; i += 3) {
    for (let j = 0; j < 3; j++) {
      points[j].fromBufferAttribute(source, index[i + j]);
      rig.mesh.applyBoneTransform(index[i + j], points[j]);
    }
    maximum = Math.max(maximum,
      points[0].distanceTo(points[1]),
      points[1].distanceTo(points[2]),
      points[2].distanceTo(points[0]));
  }
  return maximum;
}

function maximumAbs(array) {
  let value = 0;
  for (let i = 0; i < array.length; i++) {
    assert.ok(Number.isFinite(array[i]), `non-finite dynamic cloth value at ${i}`);
    value = Math.max(value, Math.abs(array[i]));
  }
  return value;
}

function verifyClothBatch(variant, costume) {
  const rig = new Rig({ quality }, {
    variant,
    faction: variant === 'oni' ? 'oni' : 'player',
    height: variant === 'oni' ? 1.70 : 1.75,
    costume,
    weapon: costume.weapon || 'katana',
    cloth: true,
  });
  const batch = rig.clothBatch;
  const position = batch.geometry.attributes.position.array;
  const normal = batch.geometry.attributes.normal.array;
  assert.strictEqual(position, batch.pos, `${variant}: position attribute must share the solver array`);
  assert.strictEqual(normal, batch.nor, `${variant}: normal attribute must share the solver array`);
  assert.ok(maximumAbs(position) > 0.8, `${variant}: first frame must contain authored cloth positions`);
  assert.ok(maximumAbs(normal) > 0.5, `${variant}: first frame must contain cloth normals`);

  rig.play('atk_spear_thrust', {
    layer: 'base', duration: 1.28,
    attack: { startup: 0.52, active: 0.10, recovery: 0.66 },
  });
  for (let frame = 0; frame < 80; frame++) rig.update(1 / 60);
  assert.ok(maximumAbs(position) < 2.2, `${variant}: cloth escaped the conservative rig extent`);

  const bodyEdge = maximumTriangleEdge(rig);
  assert.ok(bodyEdge < 0.25, `${variant}: body contains a spanning triangle (${bodyEdge.toFixed(3)} m)`);
  const base = rig.weaponGuard.getWorldPosition(new Vector3());
  const tip = rig.weaponTip.getWorldPosition(new Vector3());
  const weaponLength = base.distanceTo(tip);
  assert.ok(weaponLength > 0.65 && weaponLength < 0.80,
    `${variant}: weapon socket length is unbounded (${weaponLength.toFixed(3)} m)`);
  rig.dispose();
  return { bodyEdge, weaponLength, clothExtent: maximumAbs(position) };
}

const player = verifyClothBatch('player', {
  chest: 'kimono', sleeves: 'haori', sash: true, topknot: true, weapon: 'katana',
});
const ashigaru = verifyClothBatch('oni', {
  silhouette: 'ashigaru', hat: 'jingasa', armour: 'light', chest: 'do_maru',
  sleeves: 'kosode', sashimono: true, sash: true, mask: false, weapon: 'yari',
});

console.log(JSON.stringify({ status: 'PASS', player, ashigaru }, null, 2));
