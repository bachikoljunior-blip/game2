import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {addForegroundRidge,characterSightPoints,createForegroundVisibility} from './foreground-visibility.js';
import {createWorld,OBSTACLES} from './simulation.js';
import {ROUTE_FORK} from './route-layout.js';
import {computeCameraFrame} from './camera-framing.js';
import {createCharacterRig} from './character-rig.js';
import {updateCharacterRig} from './character-motion.js';
import {groundHeightAt} from './terrain.js';
import {clothDisplacement,installWindMaterial} from './wind.js';
import {readFileSync} from 'node:fs';

const vector=p=>new T.Vector3(p.x,p.y,p.z);
function stage(player,enemy,time){
  const world=createWorld();world.time=time;world.routeChoice='right';world.routePhase='rejoined';world.locked=enemy.id;
  Object.assign(world.player,player);const target=world.enemies.find(a=>a.id===enemy.id);Object.assign(target,enemy);
  const points=[];
  for(const actor of [world.player,target]){
    actor.state='guard';actor.age=.25;
    const rig=createCharacterRig(actor.id);updateCharacterRig(rig,actor,world,.25,{groundHeightAt});characterSightPoints(rig,points);
  }
  return {world,points};
}
function banners(visibility,material){
  return ROUTE_FORK.right.markers.map((marker,i)=>{
    const geometry=new T.PlaneGeometry(.9,1.6,5,8);geometry.translate(-.45,-.8,0);
    const mesh=new T.Mesh(geometry,material);mesh.position.set(marker.x-.04,groundHeightAt(marker.x,marker.z)+2.5,marker.z);
    return visibility.add(mesh,{cloth:true,id:`cloth-${i}`});
  });
}

test('414 touch recorded duel positions expose both intervening banners without fading the third',()=>{
  // Actual 414 touch checkpoint 37.7333 and ridgeSamples35.7333–37.7333.
  // Alive guard poses and settled source camera reconstruct the preceding duel;
  // the recording did not log its per-frame pose/camera, so this is CPU repro.
  const {world,points}=stage(
    {x:5.113044932508011,z:-9.749571194670013,yaw:-.9679798877749056},
    {id:'warden',x:4.206928663754544,z:-10.373232406787855,yaw:2.1736127658148874},36.73333333333253);
  world.routePhase='branch';
  const frame=computeCameraFrame(world,0,844/390,{}),visibility=createForegroundVisibility();
  const source=new T.MeshStandardMaterial({side:T.DoubleSide}),meshes=banners(visibility,source);
  visibility.update(vector(frame),points,.25,world.time);
  assert.deepEqual(visibility.diagnostics().filter(e=>e.blocked).map(e=>e.id),['cloth-0','cloth-1']);
  assert.ok(meshes[0].material.opacity<.1&&meshes[1].material.opacity<.1);
  assert.equal(meshes[2].material.opacity,1);assert.equal(source.opacity,1);
  assert.equal(new Set(meshes.map(m=>m.material)).size,3);
});

test('414 desktop recorded first locked frame fades the intersecting ridge rock independently',()=>{
  // Exact route-matrix rejoinDefense.last, world25.9666667. The raw73–74s
  // combat frame itself lacks telemetry; this nearby recorded frame also
  // demonstrates the same ridge-to-locked-actor obstruction geometrically.
  const {points}=stage(
    {x:3.370114265250471,z:-18.025697589424706,yaw:-2.11446864380554},
    {id:'retainer',x:-1.6399486461171273,z:-14.99745275247502},25.966666666666473);
  const camera=new T.Vector3(4.694467962697406,4.299895969338188,-11.67964373633791);
  const visibility=createForegroundVisibility(),source=new T.MeshStandardMaterial();
  const collision=JSON.stringify(OBSTACLES),rocks=addForegroundRidge(visibility,new T.Scene(),source,ROUTE_FORK.obstacle);
  visibility.update(camera,points,.25,25.966666666666473);
  assert.deepEqual(visibility.diagnostics().filter(e=>e.blocked).map(e=>e.id),['route-rock-20']);
  assert.ok(rocks[20].material.opacity<.1);
  assert.ok(rocks.every((m,i)=>i===20||m.material.opacity===1),'the rest of the ridge stays solid');
  assert.equal(rocks.length,22);assert.equal(new Set(rocks.map(m=>m.material)).size,22);
  assert.equal(JSON.stringify(OBSTACLES),collision,'visibility cannot change collision');
});

test('head, chest and blade rays use the current rig transforms and cover a sword-only obstruction',()=>{
  const rig=createCharacterRig('player'),visibility=createForegroundVisibility();
  rig.root.position.set(4,2,-6);rig.root.rotation.y=.8;rig.sword.position.set(2,1,0);rig.sword.rotation.z=-.7;
  const points=characterSightPoints(rig),tip=new T.Vector3(.045,1.088,0).applyMatrix4(rig.sword.matrixWorld);
  assert.ok(points.at(-1).distanceTo(tip)<1e-10);assert.equal(points.length,10);
  const camera=tip.clone().add(new T.Vector3(0,0,4));
  const blocker=new T.Mesh(new T.BoxGeometry(.12,.12,.12),new T.MeshStandardMaterial());
  blocker.position.copy(tip).add(new T.Vector3(0,0,1));visibility.add(blocker);
  visibility.update(camera,points.slice(0,5),.1,0);assert.equal(blocker.material.opacity,1,'body rays alone miss this stone');
  visibility.update(camera,points,.1,0);assert.ok(blocker.material.opacity<.2,'blade rays protect a moving sword');
  rig.blade.visible=false;assert.equal(characterSightPoints(rig).length,5,'enclosed blade does not fade scenery');
});

test('wind-deformed cloth intersections preserve visible and depth shaders and source vertices',()=>{
  const clock={value:4},source=installWindMaterial(new T.MeshStandardMaterial({side:T.DoubleSide}),clock,'cloth');
  const depth=installWindMaterial(new T.MeshDepthMaterial({side:T.DoubleSide}),clock,'cloth');
  const geometry=new T.PlaneGeometry(.9,1.6,5,8);geometry.translate(-.45,-.8,0);
  const original=geometry.attributes.position.array.slice(),mesh=new T.Mesh(geometry,source);mesh.customDepthMaterial=depth;
  const visibility=createForegroundVisibility();visibility.add(mesh,{cloth:true});mesh.updateMatrixWorld();
  const x=-.015,y=-1.4,d=clothDisplacement(x,y,clock.value),point=new T.Vector3(x+d.x,y+d.y,d.z);
  assert.ok(point.x>0,'wind has moved the right edge outside its rest bounds');
  const camera=point.clone().add(new T.Vector3(0,0,2)),target=point.clone().add(new T.Vector3(0,0,-2));
  const staticRay=new T.Raycaster(camera,new T.Vector3(0,0,-1),0,4);
  assert.equal(staticRay.intersectObject(mesh).length,0,'unbent geometry misses the cloth edge');
  visibility.update(camera,[target],.1,clock.value);assert.ok(mesh.material.opacity<.2);
  assert.deepEqual(geometry.attributes.position.array,original,'ray probes do not double-bend render vertices');
  assert.equal(mesh.customDepthMaterial,depth);assert.equal(mesh.material.onBeforeCompile,source.onBeforeCompile);
  const vertexShader='#include <begin_vertex>',visibleShader={uniforms:{},vertexShader},depthShader={uniforms:{},vertexShader};
  mesh.material.onBeforeCompile(visibleShader);depth.onBeforeCompile(depthShader);
  assert.equal(visibleShader.vertexShader,depthShader.vertexShader);
  assert.equal(visibleShader.uniforms.windTime,clock);assert.equal(depthShader.uniforms.windTime,clock);
  assert.equal(mesh.material.customProgramCacheKey(),source.customProgramCacheKey());
});

test('fade is local, continuous, pauseable and fully restores opacity, depth and shadows',()=>{
  const visibility=createForegroundVisibility(),source=new T.MeshStandardMaterial();
  const mesh=new T.Mesh(new T.BoxGeometry(1,2,.2),source);mesh.castShadow=true;visibility.add(mesh);
  const camera=new T.Vector3(0,0,3),target=new T.Vector3(0,0,-3);
  visibility.update(camera,[target],1/60,0);const first=mesh.material.opacity;
  assert.ok(first<1&&first>.6);assert.equal(mesh.material.depthWrite,false);
  visibility.update(camera,[target],.25,0);assert.ok(mesh.material.opacity<.1);assert.equal(mesh.castShadow,false);
  const paused=mesh.material.opacity;visibility.update(camera,[],.25,0,{animate:false});assert.equal(mesh.material.opacity,paused);
  visibility.update(camera,[],.05,0);assert.ok(mesh.material.opacity<=paused,'brief clearance does not flash opaque');
  for(let i=0;i<12;i++)visibility.update(camera,[],.25,0);
  assert.equal(mesh.material.opacity,1);assert.equal(mesh.material.transparent,false);
  assert.equal(mesh.material.depthWrite,true);assert.equal(mesh.castShadow,true);assert.equal(source.opacity,1);
  visibility.update(new T.Vector3(0,0,-4),[target],.25,0);assert.equal(mesh.material.opacity,1,'objects beyond the actor do not fade');
  visibility.update(camera,[target],.25,0);visibility.reset();assert.equal(mesh.material.opacity,1);
});

// Instantiate the actual scene builders and rig/camera integration in Node.
// Only WebGL submission and Canvas2D painting are stubs: this verifies geometry
// and material behaviour, and is explicitly not a rendered image or perf test.
async function headlessPresentation(){
  const moduleUrl=source=>'data:text/javascript;base64,'+Buffer.from(source).toString('base64');
  const three=moduleUrl(`export * from ${JSON.stringify(import.meta.resolve('three'))};
    export class WebGLRenderer{constructor(){this.shadowMap={};}setPixelRatio(){}setSize(){}render(){}}`);
  const file=new URL('./presentation.js',import.meta.url);
  const source=readFileSync(file,'utf8').replace(/from '([^']+)'/g,(_,path)=>
    `from ${JSON.stringify(path==='three'?three:path.startsWith('.')?new URL(path,file).href:import.meta.resolve(path))}`);
  const {createPresentation}=await import(moduleUrl(source));
  const keys=['document','innerWidth','innerHeight','devicePixelRatio'],before=keys.map(k=>Object.getOwnPropertyDescriptor(globalThis,k));
  const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(object,key)=>object[key]??(()=>{})});
  Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})},innerWidth:960,innerHeight:540,devicePixelRatio:1});
  try{return createPresentation({});}finally{keys.forEach((k,i)=>before[i]?Object.defineProperty(globalThis,k,before[i]):delete globalThis[k]);}
}

test('actual generated water-route leaf cells protect the unlocked actor without shared-material fading',async()=>{
  const view=await headlessPresentation(),leaves=[];
  view.scene.traverse(mesh=>{if(mesh.name.startsWith('bamboo-leaves-')||mesh.name.startsWith('maple-leaves-'))leaves.push(mesh);});
  assert.ok(leaves.length>15);assert.equal(new Set(leaves.map(m=>m.material)).size,leaves.length);
  let obstructed=0;
  // Actual414 stream-stones waypoint position. Environment visual clock was
  // not recorded, so sample its wind phases instead of inventing an exact one.
  for(let time=0;time<=24;time+=2){
    const world=createWorld();world.time=time;Object.assign(world.player,{x:-28.04996390689809,z:-1.241622183966374,yaw:0,age:time});
    view.beginWorld(world);view.render(world,.25);
    const faded=view.cameraDiagnostics().foregroundObjects.filter(e=>e.id.includes('-leaves-'));
    if(faded.length)obstructed++;
    assert.ok(faded.length<=3,'only intersecting nearby cells fade');
    const distant=leaves.filter(m=>m.geometry.boundingBox.distanceToPoint(view.camera.position)>20);
    assert.ok(distant.length>5);assert.ok(distant.every(m=>m.material.opacity===1));
    assert.ok(leaves.every(m=>m.customDepthMaterial&&m.material.customProgramCacheKey().includes('vegetation')));
  }
  assert.ok(obstructed>0,'the source-generated leaf that covers the unlocked actor is detected');
});
