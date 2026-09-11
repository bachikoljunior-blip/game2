import assert from 'node:assert/strict';
import { foliageStructureAudit } from '../src/render/Foliage.js';

const audit = foliageStructureAudit();

assert.equal(audit.tree.sakura.coincidentCentres, 0,
  'sakura must not rebuild its crown from exact-centre crossed planes');
assert.equal(audit.tree.sakura.cards, 405,
  'five separated cards at each real branch tip must survive the generator');
assert.ok(audit.tree.sakura.triangles <= 810,
  'the replacement cannot exceed the old 972-triangle sakura leaf mesh');
assert.ok(audit.tree.sakura.crownRadius > 0.25,
  'removing crossings cannot collapse the crown to a narrow column');

assert.ok(audit.tree.cedar.woodTriangles >= 500,
  'the grove must retain a visible trunk and recursive branch scaffold');
assert.ok(audit.tree.cedar.cards >= 100 && audit.tree.cedar.cards <= 140,
  'cedar clusters must remain numerous but bounded enough for branch gaps');

for (const [i, plan] of audit.bamboo.entries()) {
  assert.deepEqual(plan.levels, [0, 1, 2], `bamboo archetype ${i} needs three reach scales`);
  assert.ok(plan.maxReach / plan.minReach >= 1.9,
    `bamboo archetype ${i} must separate major branch and leaf-cluster reach`);
  assert.ok(plan.maxAngle - plan.minAngle >= 0.35,
    `bamboo archetype ${i} cannot collapse back to one chevron angle`);
  assert.ok(plan.nonQuantisedBands >= Math.ceil(plan.sprays * 0.6),
    `bamboo archetype ${i} cannot return to exact shared height bands`);
}
assert.equal(audit.blossomVoids.count, 5);
assert.equal(audit.blossomVoids.outerPerimeterUntouched, true,
  'internal sky pockets must not replace the organic outer mask');

console.log(JSON.stringify({
  result: 'PASS-STRUCTURE-ONLY',
  limitation: 'This check cannot certify native or 25% visual quality; fresh capture and independent review remain mandatory.',
  audit,
}, null, 2));
