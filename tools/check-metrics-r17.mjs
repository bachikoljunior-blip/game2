import assert from 'node:assert/strict';
import { animStartup, postureResolution } from './interaction-metrics.mjs';

function trace(motionStart, chain = false) {
  const emotion = [];
  for (let f = 0; f < 150; f++) {
    const second = chain && f >= 100;
    const attack = f >= 60;
    const clock = (f - (second ? 100 : 60)) / 60;
    const moving = second ? f >= 110 && f < 115 : f >= motionStart && f < motionStart + 4;
    const active = second ? f >= 115 && f < 120 : f >= 80 && f < 85;
    emotion.push([1, 2, 3].map((id) => [id, moving ? .012 : .001, attack ? 1 : 0, active ? 1 : 0, attack ? clock : 0]));
  }
  return { columns: { emotion }, stateNames: ['idle', 'attack'], frames: 150, events: [] };
}
assert.equal(animStartup(trace(62))[0].verdict, 'pass', '300ms motion then held tell must count');
assert.equal(animStartup(trace(75))[0].verdict, 'fail', '83ms real tell remains a failure');
assert.equal(animStartup(trace(62, true))[0].verdict, 'fail', 'a chained attack cannot borrow the previous tell');
assert.equal(animStartup(trace(200))[0].verdict, 'fail', 'state alone is never evidence of visible startup');
const events = Array.from({ length: 20 }, (_, f) => ({ name: 'mark', label: `encounter:${f}`, f }));
for (let id = 1; id <= 5; id++) {
  events.push({ name: 'execution', phase: 'impact', victim: { id }, f: 30 + id });
  events.push({ name: 'death', entity: { id, faction: 'oni' }, f: 30 + id });
}
assert.equal(postureResolution({ events })[0].measured.postureResolvedFraction, 1, 'execution payload names victim, not entity');
console.log('Metrics: held, genuinely short, chained and absent windups distinguished; actual execution payload accepted.');
