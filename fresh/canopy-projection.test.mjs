import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {headlessPresentation} from './vegetation-test-support.mjs';
import {createWorld} from './simulation.js';

// A geometric regression for the native arrival symptom (one-pixel-high
// horizontal crowns). These are projected production vertices, not a raster,
// a GPU measurement, or an acceptance test for natural canopy appearance.
test('fixed support-bound bamboo sprays retain screen height in the normal arrival camera without more leaves or drawables',async t=>{
 const view=await headlessPresentation(),world=createWorld();view.beginWorld(world);view.render(world,1/60,0,{draw:false});view.scene.updateMatrixWorld();view.camera.updateMatrixWorld();
 assert.deepEqual(view.camera.position.toArray(),[.85,2.8,23.8]);
 const rows=[],frustum=new T.Frustum().setFromProjectionMatrix(new T.Matrix4().multiplyMatrices(view.camera.projectionMatrix,view.camera.matrixWorldInverse));
 let leaves=0,storedVertices=0,woodFaces=0,nearFaces=0,farFaces=0,activeFaces=0,batches=0;
 view.scene.traverse(mesh=>{const g=mesh.geometry,lod=g?.userData.vegetationLod;if(lod?.kind!=='bamboo')return;batches++;storedVertices+=g.attributes.position.count;
  let selected=0;
  for(const group of lod.groups.values()){
   selected+=(group.level?group.far:group.near).length;
   if(group.far===group.near)continue;
   const wood=Array.from(group.near).filter(i=>g.attributes.leafPivot.getW(i)===0).length/3,near=group.near.length/3-wood,far=group.far.length/3-wood;
   assert.equal(near,36*7);assert.equal(far,2);woodFaces+=wood;nearFaces+=near;farFaces+=far;leaves+=near/7;
   if(!frustum.intersectsBox(group.bounds))continue;
   const indices=Array.from(group.far).filter(i=>g.attributes.leafPivot.getW(i)<0),points=indices.map(i=>new T.Vector3(...view.vegetation.deformVertex(g,i,world.time)).project(view.camera));
   if(points.some(p=>Math.abs(p.x)>1||Math.abs(p.y)>1||p.z<0||p.z>1))continue;
   const ys=points.map(p=>(1-p.y)*360);let area=0;
   for(let i=0;i<points.length;i+=3){const [a,b,c]=points.slice(i,i+3);area+=Math.abs((b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x))*480*360*.5;}
   rows.push({height:Math.max(...ys)-Math.min(...ys),area,far:group.level===1});
  }
  assert.equal(g.drawRange.start,0);assert.equal(g.drawRange.count,selected,'submitted indices exactly match the selected representations');activeFaces+=selected/3;
 });
 const median=key=>rows.map(r=>r[key]).sort((a,b)=>a-b)[Math.floor(rows.length/2)],far=rows.filter(r=>r.far).length;
 assert.equal(leaves,32400);assert.equal(nearFaces,226800);assert.equal(farFaces,1800);assert.equal(woodFaces,37800);assert.ok(rows.length>300);
 assert.ok(median('height')>5,'normal crowns must have more than a one-pixel vertical footprint');assert.ok(median('area')>20,'the height must come from a visible plane, not another edge-on line');
 assert.ok(far>rows.length*.8,'grazing fallback must not spend full leaf geometry on most distant visible twigs');
 t.diagnostic(JSON.stringify({scope:'Unshaded projection only; native quality/performance unmeasured',fullyVisibleTwigs:rows.length,far,medianHeightPixels:median('height'),medianQuadAreaPixels:median('area'),leaves,storedVertices,batches,activeFaces,woodFaces,nearFaces,farFaces}));
});
