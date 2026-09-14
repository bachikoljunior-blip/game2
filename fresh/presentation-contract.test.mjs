import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeCameraFrame,foregroundObstacleOpacity,interpolateCameraFrame} from './camera-framing.js';

const angle=(camera,a,b)=>{
  const ax=a.x-camera.x,az=a.z-camera.z,bx=b.x-camera.x,bz=b.z-camera.z;
  return Math.acos(Math.max(-1,Math.min(1,(ax*bx+az*bz)/(Math.hypot(ax,az)*Math.hypot(bx,bz)))));
};

test('locked camera separates player and close target instead of stacking them',()=>{
  const player={x:0,z:0,hp:100},enemy={id:'sentinel',x:0,z:-1.8,hp:100};
  const frame=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,16/9,{});
  assert.ok(Math.abs(frame.x-player.x)>1.7);
  assert.ok(angle(frame,player,enemy)>.18);
  assert.ok(frame.lookZ<player.z,'focus leads toward the locked target');
});

test('portrait framing preserves a smaller lateral offset',()=>{
  const player={x:2,z:3,hp:100},enemy={id:'sentinel',x:2,z:-5,hp:100};
  const landscape=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,16/9,{});
  const portrait=computeCameraFrame({player,enemies:[enemy],locked:enemy.id},0,9/16,{});
  assert.ok(Math.abs(portrait.x-player.x)<Math.abs(landscape.x-player.x));
});

test('a reversing lock bearing cannot pull the interpolated camera overhead',()=>{
  const world={player:{x:0,z:0,hp:100},enemies:[{id:'e',x:0,z:-1.8,hp:100}],locked:'e'};
  const current=computeCameraFrame(world,0,844/390,{});
  world.enemies[0].z=1.8;
  const desired=computeCameraFrame(world,0,844/390,{});
  // This interval makes the previous Cartesian lerp pass exactly through the duel.
  interpolateCameraFrame(current,desired,Math.log(2)/8,true);
  assert.ok(Math.hypot(current.x-current.lookX,current.z-current.lookZ)>4.5);
  for(let n=0;n<60;n++){
    world.enemies[0].z=n%2?1.8:-1.8;
    interpolateCameraFrame(current,computeCameraFrame(world,0,844/390,{}),1/60,true);
    assert.ok(Math.hypot(current.x-current.lookX,current.z-current.lookZ)>4.5);
  }
});

test('coincident fighters retain a finite camera direction and standoff',()=>{
  const world={player:{x:2,z:1,hp:100,yaw:.7},enemies:[{id:'e',x:2,z:1,hp:100}],locked:'e'};
  const frame=computeCameraFrame(world,0,390/844,{});
  assert.ok(Object.values(frame).every(Number.isFinite));
  assert.ok(Math.hypot(frame.x-frame.lookX,frame.z-frame.lookZ)>4.5);
});

test('victory framing shows the signal from an authored oblique angle',()=>{
  const world={mode:'victory',player:{x:.4,z:-18.8,hp:100},enemies:[],locked:null};
  const frame=computeCameraFrame(world,0,16/9,{});
  assert.ok(frame.x>3,'camera moves beside the signal instead of facing the wall from behind the player');
  assert.ok(frame.z>-14,'camera retains the shrine, signal and player in depth');
  assert.ok(frame.lookZ<-18.5,'camera looks back toward the lit signal');
});

test('only the near foreground torii post fades for the verified first encounter frame',()=>{
  const camera={x:-3.8547,z:11.0246},focus={x:0,z:6.176};
  assert.ok(foregroundObstacleOpacity(camera,focus,{x:-3.5,z:7})<=.2);
  assert.equal(foregroundObstacleOpacity(camera,focus,{x:3.5,z:7}),1);
  assert.equal(foregroundObstacleOpacity({x:-3.5,z:15},focus,{x:-3.5,z:7}),1);
});

test('interface gives labels an opaque backing and keeps victory title off the lamp',()=>{
  const css=readFileSync(new URL('./mission.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
  const html=readFileSync(new URL('./index.html',import.meta.url),'utf8');
  assert.match(css,/#objective,#enemy\{[^}]*background:#10191d/);
  assert.match(css,/#enemy:empty\{display:none\}/);
  assert.match(css,/#menu\[data-mode="victory"\] h1/);
  assert.match(css,/#menu\[data-mode="victory"\] \.result-heading\{display:block/);
  assert.match(css,/#menu\[data-mode="victory"\]::before/);
  assert.match(css,/@media\(max-aspect-ratio:4\/5\)/);
  assert.match(html,/class="result-heading">灯、谷へ</);
  assert.match(main,/menu\.dataset\.mode=world\.mode/);
  assert.match(main,/input\.setActive\(false\);hud\.hidden=true;menu\.hidden=false/);
});

test('generated landscape replaces flat background and cone bamboo without external assets',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  assert.match(source,/new T\.ShaderMaterial/);
  assert.match(source,/new T\.PlaneGeometry\(160,200,64,80\)/);
  assert.match(source,/const leafCluster=mergeGeometries/);
  assert.match(source,/new T\.DodecahedronGeometry/);
  assert.match(source,/const rim=new T\.DirectionalLight/);
  assert.match(source,/new T\.CircleGeometry\(\.46,20\)/);
  assert.match(source,/signalHalo\.visible=world\.signalLit/);
  assert.doesNotMatch(source,/new T\.ConeGeometry\(1\.6-j\*\.22,2\.5,5\)/);
  assert.doesNotMatch(source,/TextureLoader|\.glb|\.gltf|fetch\(/);
});

test('scene and actor pass preserves density while clearing combat silhouettes and sheathing the victory pose',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  assert.match(source,/new T\.InstancedMesh\(grassGeo,grassMat,3000\)/);
  assert.match(source,/\(near\?4\.8:9\)/);
  assert.match(source,/const pathCenter=Math\.sin\(\(z\+8\)\*\.13\)\*\.42/);
  assert.match(source,/playerBlade=material\('#e7f4f4'/);
  assert.match(source,/enemyBlade=material\('#ffe0a6'/);
  assert.match(source,/enemyBlade\.emissiveIntensity=\.24/);
  assert.match(source,/const scabbard=mesh\(body/);
  assert.match(source,/rigs\.set\(id,\{root,body,limbs,sword,scabbard,ring,signal\}\)/);
  assert.match(source,/r\.sword\.visible=!\(world\.mode==='victory'&&a\.id==='player'\)/);
});

test('foreground, signal and actor hierarchy are generated without changing gameplay geometry',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  const simulation=readFileSync(new URL('./simulation.js',import.meta.url),'utf8');
  assert.match(source,/const toriiPosts=\[\]/);
  assert.match(source,/foregroundObstacleOpacity\(smoothedFrame,look,post\.obstacle\)/);
  assert.match(source,/const SIGNAL_HEIGHT=3\.15/);
  assert.match(source,/signalLight\.intensity=world\.signalLit\?3\.2:0/);
  assert.match(source,/const skirtFront=/);
  assert.match(source,/const forearmWrap=/);
  assert.match(source,/const facePlane=/);
  assert.match(simulation,/\{ x: -3\.5, z: 7, w: \.55, d: \.55, h: 4\.5 \}/);
  assert.match(simulation,/\{ x: 3\.5, z: 7, w: \.55, d: \.55, h: 4\.5 \}/);
});
