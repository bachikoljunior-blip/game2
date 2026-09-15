import test from 'node:test';
import assert from 'node:assert/strict';
import {ShaderLib} from 'three';
import {advanceEnvironmentClock,bendStem,clothDisplacement,createEnvironmentClock,installWindMaterial,sampleWind,signalFlame} from './wind.js';

test('the whole shared wind field stays bounded and advances continuously through gusts',()=>{
  for(const [x,z] of [[0,0],[-28,14],[30,10],[-12,-39]])for(let t=0;t<45;t+=.1){
    const a=sampleWind(x,z,t),b=sampleWind(x,z,t+1/60);
    assert.ok(a.pressure>.35&&a.pressure<1.5);
    assert.ok(Math.hypot(a.x-b.x,a.z-b.z)<.013,'no per-frame random kick');
  }
  const here=sampleWind(0,0,5),later=sampleWind(10,0,5+.55);
  // Fine turbulence varies spatially while the large gust travels down-valley.
  assert.ok(Math.hypot(here.x-later.x,here.z-later.z)<.04);
});
test('stem roots are immovable, tips lag and bend, and attached components meet at the same displaced point',()=>{
  const root={x:-22,y:3.2,z:14},height=11;
  for(let t=0;t<20;t+=.125){
    assert.deepEqual(bendStem(root,root,height,t),root);
    const joint={x:root.x,y:root.y+6.3,z:root.z};
    const trunk=bendStem(joint,root,height,t),branch=bendStem({...joint},root,height,t);
    assert.deepEqual(branch,trunk);
    const tip=bendStem({...root,y:root.y+height},root,height,t);
    assert.ok(Math.hypot(tip.x-root.x,tip.z-root.z)<.7,'frustum expansion covers the bounded bend');
    assert.ok(tip.y<=root.y+height,'bending does not stretch the stem upward');
  }
});
test('every vertex of the cloth top edge remains attached while the lower edge responds',()=>{
  for(let t=0;t<15;t+=.075)for(let x=-.9;x<=0;x+=.1){
    const fixed=clothDisplacement(x,0,t,5.9,-9.7);
    assert.ok(fixed.x===0&&fixed.y===0&&fixed.z===0);
    const loose=clothDisplacement(x,-1.6,t,5.9,-9.7);
    assert.ok(Math.hypot(loose.x,loose.y,loose.z)<.6);
  }
});
test('visible and shadow materials receive identical deformation and the same advancing time reference',()=>{
  const clock={value:7.4};
  for(const kind of ['vegetation','cloth','grass']){
    const visible={},depth={};installWindMaterial(visible,clock,kind);installWindMaterial(depth,clock,kind);
    const shader=()=>({uniforms:{},vertexShader:'void main(){\n#include <begin_vertex>\n}'}),a=shader(),b=shader();
    visible.onBeforeCompile(a);depth.onBeforeCompile(b);
    assert.equal(a.vertexShader,b.vertexShader);assert.equal(a.uniforms.windTime,clock);assert.equal(b.uniforms.windTime,clock);
    clock.value+=.1;assert.equal(a.uniforms.windTime.value,clock.value);
    assert.ok(a.vertexShader.includes('valleyWind'));
  }
});
test('wind injection preserves preprocessor line boundaries in the actual Three visible and depth shaders',()=>{
  for(const kind of ['vegetation','cloth','grass'])for(const source of [ShaderLib.standard.vertexShader,ShaderLib.depth.vertexShader]){
    const material={},shader={uniforms:{},vertexShader:source};installWindMaterial(material,{value:0},kind);material.onBeforeCompile(shader);
    for(const line of shader.vertexShader.split('\n'))if(line.includes('#'))assert.ok(line.trimStart().startsWith('#'),`invalid preprocessor boundary: ${line}`);
  }
});
test('the environment settles through victory but freezes in pause and resets on retry',()=>{
  const clock=createEnvironmentClock(),world={time:4,mode:'playing'};
  advanceEnvironmentClock(clock,world,1/60);const before=clock.value;
  advanceEnvironmentClock(clock,world,1,false);assert.equal(clock.value,before);
  world.mode='victory';advanceEnvironmentClock(clock,world,1/60,true);assert.ok(clock.value>before);
  const retry={time:0,mode:'playing'};assert.equal(advanceEnvironmentClock(clock,retry,0,false),true);assert.equal(clock.value,0);
});
test('signal ignition starts dark, settles without a pop and retains the original light and halo caps',()=>{
  assert.equal(signalFlame(0).light,0);assert.equal(signalFlame(0).opacity,0);
  assert.ok(signalFlame(.3).light<signalFlame(.6).light);
  let previous=signalFlame(0);
  for(let age=1/60;age<30;age+=1/60){
    const current=signalFlame(age);
    assert.ok(current.light>=0&&current.light<=3.2);
    assert.ok(current.emissive>=0&&current.emissive<=.36);
    assert.ok(current.opacity>=0&&current.opacity<=.08);
    assert.ok(Math.abs(current.light-previous.light)<.13);
    previous=current;
  }
});
