import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {eyeSurface,faceRibbon} from './character-sculpt.js';
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
