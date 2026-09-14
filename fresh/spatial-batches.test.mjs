import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {partitionInstances} from './spatial-batches.js';

test('spatial grass batches preserve every authored transform and color',()=>{
  const geometry=new T.PlaneGeometry(.16,.82,1,2),material=new T.MeshBasicMaterial();
  const source=new T.InstancedMesh(geometry,material,90),matrix=new T.Matrix4(),q=new T.Quaternion();
  for(let i=0;i<source.count;i++){
    q.setFromAxisAngle(new T.Vector3(0,1,0),i*.7);
    matrix.compose(new T.Vector3(i%10*9-40,Math.sin(i),Math.floor(i/10)*11-44),q,new T.Vector3(.7+i*.005,.7+i*.005,.7+i*.005));
    source.setMatrixAt(i,matrix);source.setColorAt(i,new T.Color().setRGB(i/100,.6,.4));
  }
  const records=mesh=>Array.from({length:mesh.count},(_,i)=>JSON.stringify([
    ...mesh.instanceMatrix.array.slice(i*16,i*16+16),...mesh.instanceColor.array.slice(i*3,i*3+3)
  ]));
  const groups=partitionInstances(source);
  assert.ok(groups.length>1);assert.deepEqual(groups.flatMap(records).sort(),records(source).sort());
  assert.equal(groups.reduce((n,g)=>n+g.count,0),source.count);
  assert.ok(groups.every(g=>g.geometry===geometry&&g.material===material));
  for(const g of groups){
    const retained=g.boundingSphere.radius;g.computeBoundingSphere();
    assert.ok(Math.abs(retained-g.boundingSphere.radius-.3)<1e-10);
  }
});
