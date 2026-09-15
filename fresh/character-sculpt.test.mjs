import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {eyeSurface,eyeDisc,faceRibbon,loft} from './character-sculpt.js';
import {createCharacterRig} from './character-rig.js';

function visibleFromFront(geometry,x,y){
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({side:T.FrontSide}));
  mesh.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(x,y,-1),new T.Vector3(0,0,1),0,2);
  const hits=ray.intersectObject(mesh,false);
  geometry.dispose();mesh.material.dispose();return hits.length>0;
}

test('both upper and lower eyelids remain visible with the actual one-sided skin material',()=>{
  for(const side of [-1,1])for(const upper of [false,true]){
    assert.ok(visibleFromFront(eyeSurface(side,{lid:true,upper}),side*.038,.158+(upper?1:-1)*.0044),
      `${side<0?'left':'right'} ${upper?'upper':'lower'} eyelid is culled from the face front`);
  }
});

test('both nostril contours face the camera even when their authored paths run in opposite directions',()=>{
  for(const side of [-1,1]){
    const geometry=faceRibbon([[side*.006,.107,.0018],[side*.012,.106,.002],[side*.019,.109,.0015]],.0022);
    assert.ok(visibleFromFront(geometry,side*.012,.106),`${side<0?'left':'right'} nostril is culled`);
  }
});

test('the rounded iris and pupil are visible through a front-facing eye',()=>{
  for(const side of [-1,1])for(const [radius,offset] of [[.0039,.0031],[.0017,.0040]])
    assert.ok(visibleFromFront(eyeDisc(side,radius,offset),side*.038+radius*.2,.158),`eye disc ${side} is culled`);
});

test('a rotated sleeve section closes both ends instead of exposing its hollow interior',()=>{
  const geometry=loft([[-.3,.09,.07,0],[.04,.06,.06,0]],{segments:24,rows:12});
  const mesh=new T.Mesh(geometry,new T.MeshStandardMaterial({side:T.FrontSide}));
  mesh.rotation.set(.63,.41,-.32);mesh.updateMatrixWorld(true);
  for(const [y,sign] of [[-.3,-1],[.04,1]]){
    const center=new T.Vector3(0,y,0).applyMatrix4(mesh.matrixWorld);
    const outward=new T.Vector3(0,sign,0).transformDirection(mesh.matrixWorld);
    const ray=new T.Raycaster(center.clone().addScaledVector(outward,.05),outward.clone().negate(),0,.10);
    assert.ok(ray.intersectObject(mesh,false).length>0,`section end ${sign} remains open`);
  }
});

test('the thin rear sash can be seen from both sides of its actual rendered face',()=>{
  const rig=createCharacterRig('player'),sash=rig.ties.find(node=>node.name==='sash-tail');
  rig.root.updateMatrixWorld(true);
  const mesh=sash.children.find(node=>node.isMesh),positions=mesh.geometry.attributes.position;
  const first=Math.floor(positions.count/6)*3;
  const a=new T.Vector3().fromBufferAttribute(positions,first).applyMatrix4(mesh.matrixWorld);
  const b=new T.Vector3().fromBufferAttribute(positions,first+1).applyMatrix4(mesh.matrixWorld);
  const c=new T.Vector3().fromBufferAttribute(positions,first+2).applyMatrix4(mesh.matrixWorld);
  const center=a.clone().add(b).add(c).multiplyScalar(1/3);
  const normal=b.clone().sub(a).cross(c.clone().sub(a)).normalize();
  for(const side of [-1,1]){
    const ray=new T.Raycaster(center.clone().addScaledVector(normal,.01*side),normal.clone().multiplyScalar(-side),0,.02);
    assert.ok(ray.intersectObject(mesh,false).length>0,`sash face side ${side} is culled`);
  }
});
