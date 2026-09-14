import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {groundHeightAt,terrainVertexHeight,shrineBaseSize} from './terrain.js';
import {OBSTACLES} from './simulation.js';

test('ground sampling agrees with actual rendered triangles, including diagonal interiors',()=>{
  const g=new T.PlaneGeometry(160,200,64,80);g.rotateX(-Math.PI/2);
  const p=g.getAttribute('position');
  for(let i=0;i<p.count;i++)p.setY(i,terrainVertexHeight(p.getX(i),p.getZ(i)));
  const mesh=new T.Mesh(g,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.updateMatrixWorld();
  const ray=new T.Raycaster(),direction=new T.Vector3(0,-1,0);
  for(let z=-32.71;z<25;z+=3.83)for(let x=-24.39;x<25;x+=2.97){
    ray.set(new T.Vector3(x,30,z),direction);
    const hit=ray.intersectObject(mesh)[0];assert.ok(hit);
    assert.ok(Math.abs(hit.point.y-groundHeightAt(x,z))<1e-5);
  }
  g.dispose();mesh.material.dispose();
});
test('the verified central path stays level while the valley shoulders rise',()=>{
  for(let z=-28;z<=23;z++)for(const x of [-4,0,4])assert.equal(groundHeightAt(x,z),0);
  assert.ok(groundHeightAt(-18,9)>1);
  assert.ok(groundHeightAt(20,9)>1);
});
test('shrine decorative base cannot project beyond the solid collision footprint',()=>{
  const o=OBSTACLES.find(o=>o.h>=5),b=shrineBaseSize(o);
  assert.ok(b.width<=o.w&&b.depth<=o.d);
  const stoppedZ=o.z+o.d/2+.35;
  assert.ok(stoppedZ-.15>o.z+b.depth/2,'the stopped foot is in front of the base');
});
