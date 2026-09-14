import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {mergeGeometries} from 'three/addons/utils/BufferGeometryUtils.js';
import {indexForBatch} from './batch-geometry.js';

test('indexed architectural pieces and unindexed rocks merge without losing faces or vertex data',()=>{
  const parts=[new T.BoxGeometry(1,1,1),new T.CylinderGeometry(.2,.3,1,8),new T.DodecahedronGeometry(1,1)];
  assert.ok(parts[0].index);assert.equal(parts[2].index,null);
  const count=parts.reduce((n,g)=>n+(g.index?.count??g.getAttribute('position').count),0);
  const positions=Array.from(parts[2].getAttribute('position').array);
  const merged=mergeGeometries(parts.map(indexForBatch));
  assert.ok(merged);assert.equal(merged.index.count,count);
  assert.deepEqual(Array.from(parts[2].getAttribute('position').array),positions);
  for(const key of ['position','normal','uv'])assert.equal(merged.getAttribute(key).count,parts.reduce((n,g)=>n+g.getAttribute(key).count,0));
  parts.forEach(g=>g.dispose());merged.dispose();
});
