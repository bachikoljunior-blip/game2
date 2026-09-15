import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createSceneArt} from './scene-art.js';
import {createForegroundVisibility,characterSightPoints} from './foreground-visibility.js';
import {ROUTE_FORK,routePathCenters} from './route-layout.js';
import {OBSTACLES,createWorld} from './simulation.js';
import {createCharacterRig} from './character-rig.js';
import {updateCharacterRig} from './character-motion.js';
import {groundHeightAt} from './terrain.js';

const stage=()=>{const scene=new T.Scene(),visibility=createForegroundVisibility(),art=createSceneArt(scene,visibility);return {scene,visibility,art};};
test('the fractured ridge has actual side contact through the ground, with no low air tunnel',()=>{
  const {scene,art}=stage(),fork=ROUTE_FORK.obstacle,rocks=art.addRidge(fork);scene.updateMatrixWorld(true);
  for(const mesh of rocks){
    const p=mesh.geometry.attributes.position;let minimum=Infinity;
    for(let i=0;i<p.count;i++)minimum=Math.min(minimum,p.getY(i)-groundHeightAt(p.getX(i),p.getZ(i)));
    assert.ok(minimum<-.07,'each fade section must extend into the actual terrain');
  }
  const ray=new T.Raycaster();ray.far=6;
  for(const y of [0,.025,.054,.056]){
    ray.set(new T.Vector3(-3,y,-9.25),new T.Vector3(1,0,0));
    assert.ok(ray.intersectObjects(rocks).length>0,`air tunnel at y=${y}`);
    ray.set(new T.Vector3(3,y,-9.25),new T.Vector3(-1,0,0));
    assert.ok(ray.intersectObjects(rocks).length>0,`open opposite side at y=${y}`);
  }
  for(const [origin,direction] of [
    [[-3,-.09,-9.25],[1,0,0]], [[-3,3,-9.25],[1,0,0]],
    [[-3,.025,fork.z+fork.d/2+.1],[1,0,0]], [[-3,.025,fork.z-fork.d/2-.1],[1,0,0]],
  ]){
    ray.set(new T.Vector3(...origin),new T.Vector3(...direction));
    assert.equal(ray.intersectObjects(rocks).length,0,'contact repair cannot extend below its base or outside the unchanged envelope');
  }
  // Each end also needs a closed lateral face, not only the two long sides.
  for(const side of [-1,1]){
    ray.set(new T.Vector3(0,.025,fork.z+side*(fork.d/2+1)),new T.Vector3(0,0,-side));
    assert.ok(ray.intersectObjects(rocks).length>0,'open end beneath the ridge');
  }
});
test('new exposed rock triangles cover the collision spine and leave both walking corridors clear',()=>{
  const {scene,art}=stage(),fork=ROUTE_FORK.obstacle,rocks=art.addRidge(fork);scene.updateMatrixWorld(true);
  const bounds=new T.Box3().setFromObject(scene),ray=new T.Raycaster();
  assert.ok(bounds.min.x>=fork.x-fork.w/2-1e-6&&bounds.max.x<=fork.x+fork.w/2+1e-6);
  assert.ok(bounds.min.z>=fork.z-fork.d/2-1e-6&&bounds.max.z<=fork.z+fork.d/2+1e-6);
  assert.ok(bounds.max.y<=fork.h);
  for(let z=fork.z-fork.d/2+.03;z<fork.z+fork.d/2;z+=.31)for(let x=-2.15;x<2.2;x+=.29){
    ray.set(new T.Vector3(x,4,z),new T.Vector3(0,-1,0));
    const hit=ray.intersectObjects(rocks)[0];assert.ok(hit&&hit.point.y>=.049,'no false shortcut through the collision rectangle');
  }
  for(let z=-17.2;z< -1.5;z+=.23)for(const x of routePathCenters(z))for(const dx of [-.34,0,.34]){
    ray.set(new T.Vector3(x+dx,4,z),new T.Vector3(0,-1,0));
    assert.equal(ray.intersectObjects(rocks).length,0,'actor corridor remains visually clear');
  }
});
test('new lower ridge clears historic anatomy rays and still fades on actual intersecting triangles',()=>{
  const {scene,visibility,art}=stage(),rocks=art.addRidge(ROUTE_FORK.obstacle),world=createWorld(),points=[];
  for(const actor of [Object.assign(world.player,{x:3.370114265250471,z:-18.025697589424706,yaw:-2.11446864380554}),
    Object.assign(world.enemies.find(e=>e.id==='retainer'),{x:-1.6399486461171273,z:-14.99745275247502})]){
    actor.state='guard';actor.age=.25;const rig=createCharacterRig(actor.id);updateCharacterRig(rig,actor,world,.25,{groundHeightAt});characterSightPoints(rig,points);
  }
  scene.updateMatrixWorld(true);const camera=new T.Vector3(4.694467962697406,4.299895969338188,-11.67964373633791);
  visibility.update(camera,points,.25,25.966666666666473);
  assert.equal(visibility.diagnostics().filter(e=>e.blocked).length,0,'the tapered far end clears the historic sightline');
  const p=rocks[0].geometry.attributes.position,n=rocks[0].geometry.attributes.normal;
  const center=new T.Vector3().fromBufferAttribute(p,0).add(new T.Vector3().fromBufferAttribute(p,1)).add(new T.Vector3().fromBufferAttribute(p,2)).multiplyScalar(1/3);
  const normal=new T.Vector3().fromBufferAttribute(n,0);
  visibility.update(center.clone().addScaledVector(normal,2),[center.clone().addScaledVector(normal,-.2)],.25,0);
  assert.ok(rocks[0].material.opacity<.1,'an actual surface triangle exercises the positive obstruction case');
  assert.ok(rocks.some(m=>m.material.opacity===1),'distant sections retain their opaque appearance');
  visibility.reset();assert.ok(rocks.every(m=>m.material.opacity===1&&m.material.depthWrite&&m.castShadow));
});
test('the rebuilt shrine keeps feet clear at the unchanged collision boundary',()=>{
  const {scene,art}=stage(),shrine=OBSTACLES.find(o=>o.kind==='shrine');art.addShrine(shrine);art.finish();scene.updateMatrixWorld(true);
  const ray=new T.Raycaster(),front=shrine.z+shrine.d/2;
  for(let x=-4.8;x<4.9;x+=.31){
    ray.set(new T.Vector3(x,1,front+.19),new T.Vector3(0,-1,0));
    assert.equal(ray.intersectObjects(scene.children).length,0,'no new foundation on the stopped foot');
  }
  ray.set(new T.Vector3(0,4,front+1),new T.Vector3(0,0,-1));
  assert.ok(ray.intersectObjects(scene.children).length>0,'the wall has an actual visible surface');
});
