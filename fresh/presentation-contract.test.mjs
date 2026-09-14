import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {computeCameraFrame} from './camera-framing.js';

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

test('interface gives labels an opaque backing and keeps victory title off the lamp',()=>{
  const css=readFileSync(new URL('./mission.css',import.meta.url),'utf8');
  const main=readFileSync(new URL('./main.js',import.meta.url),'utf8');
  assert.match(css,/#objective,#enemy\{[^}]*background:#10191d/);
  assert.match(css,/#enemy:empty\{display:none\}/);
  assert.match(css,/#menu\[data-mode="victory"\] h1/);
  assert.match(main,/menu\.dataset\.mode=world\.mode/);
  assert.match(main,/input\.setActive\(false\);hud\.hidden=true;menu\.hidden=false/);
});

test('generated landscape replaces flat background and cone bamboo without external assets',()=>{
  const source=readFileSync(new URL('./presentation.js',import.meta.url),'utf8');
  assert.match(source,/new T\.ShaderMaterial/);
  assert.match(source,/new T\.PlaneGeometry\(160,200,64,80\)/);
  assert.match(source,/const leafCluster=mergeGeometries/);
  assert.doesNotMatch(source,/new T\.ConeGeometry\(1\.6-j\*\.22,2\.5,5\)/);
  assert.doesNotMatch(source,/TextureLoader|\.glb|\.gltf|fetch\(/);
});
