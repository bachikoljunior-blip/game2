import test from 'node:test';
import assert from 'node:assert/strict';
import {DirectionalLight,Vector3} from 'three';
import {EXPLORATION} from './exploration.js';
import {groundHeightAt} from './terrain.js';
import {followSunShadow,shadowCenterFor,SUN_SHADOW} from './sun-shadow.js';

function sun(){
  const light=new DirectionalLight();light.shadow.mapSize.set(SUN_SHADOW.mapSize,SUN_SHADOW.mapSize);
  Object.assign(light.shadow.camera,{left:-SUN_SHADOW.width/2,right:SUN_SHADOW.width/2,top:SUN_SHADOW.height/2,bottom:-SUN_SHADOW.height/2,near:1,far:110});
  light.shadow.camera.updateProjectionMatrix();return light;
}
test('the unchanged sun direction and texel density cover the player and tall props at every discovery',()=>{
  const light=sun(),expected=new Vector3(SUN_SHADOW.offset.x,SUN_SHADOW.offset.y,SUN_SHADOW.offset.z);
  for(const point of [...EXPLORATION.points,{x:0,z:18},{x:0,z:-19.6}]){
    const y=groundHeightAt(point.x,point.z);followSunShadow(light,{x:point.x,y:y+.8,z:point.z});
    assert.ok(light.position.clone().sub(light.target.position).distanceTo(expected)<1e-12);
    for(const dx of [-3,0,3])for(const dz of [-3,0,3])for(const height of [0,2,12]){
      const projected=new Vector3(point.x+dx,y+height,point.z+dz).project(light.shadow.camera);
      assert.ok(Math.abs(projected.x)<1&&Math.abs(projected.y)<1&&projected.z>-1&&projected.z<1,
        'nearby terrain, characters and canopy stay inside the active shadow frustum');
    }
  }
  assert.equal(light.shadow.camera.right-light.shadow.camera.left,56);
  assert.equal(light.shadow.camera.top-light.shadow.camera.bottom,64);
  assert.equal(light.shadow.mapSize.x,2048);assert.equal(light.shadow.mapSize.y,2048);
});
test('sub-texel travel leaves the light-space projection fixed and larger travel moves in whole texels',()=>{
  const light=sun(),center=shadowCenterFor({x:30,y:5,z:10});followSunShadow(light,center);
  const elements=light.shadow.camera.matrixWorld.elements,right=new Vector3(elements[0],elements[1],elements[2]);
  const tx=SUN_SHADOW.width/SUN_SHADOW.mapSize,base=new Vector3(center.x,center.y,center.z);
  const tiny=base.clone().addScaledVector(right,tx*.2),near=shadowCenterFor(tiny);
  assert.ok(new Vector3(near.x,near.y,near.z).distanceTo(base)<1e-11);
  const further=base.clone().addScaledVector(right,tx*1.2),next=shadowCenterFor(further);
  const moved=new Vector3(next.x,next.y,next.z).sub(base).dot(right);
  assert.ok(Math.abs(moved-tx)<1e-11);
});
