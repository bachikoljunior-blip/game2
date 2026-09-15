import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createWorld} from './simulation.js';
import {headlessPresentation} from './vegetation-test-support.mjs';

test('draw:false retains production updates while inspection records exactly one draw after a full settle',async()=>{
  const normal=await headlessPresentation(),quiet=await headlessPresentation(),worlds=[createWorld(),createWorld()];
  worlds.forEach(world=>Object.assign(world.player,{x:-12.152201271544866,z:-38.75898447460243,yaw:0}));
  for(let i=0;i<96;i++){
    worlds.forEach(world=>{world.time=i/12;});
    normal.render(worlds[0],1/12,0,{animate:true});quiet.render(worlds[1],1/12,0,{animate:true,draw:false});
  }
  assert.equal(normal.renderer.renderCalls,96,'the default production path still submits every frame');
  assert.equal(quiet.renderer.renderCalls,0,'settling does not queue unseen frames');
  assert.deepEqual(quiet.vegetation.textureUniform.value.image.data,normal.vegetation.textureUniform.value.image.data,'all spring and support states match');
  assert.deepEqual(quiet.cameraDiagnostics(),normal.cameraDiagnostics(),'camera tracking and foreground decisions still run');
  assert.deepEqual(quiet.actorDiagnostics(),normal.actorDiagnostics(),'pose and contact updates still run');
  const transforms=view=>{const all=[];view.scene.traverse(o=>all.push([o.name,o.position.toArray(),o.quaternion.toArray(),o.scale.toArray(),o.visible,o.isMesh?o.material.opacity:null]));return all;};
  assert.deepEqual(transforms(quiet),transforms(normal),'every scene transform and opacity matches before inspection');
  worlds[1].time=8;quiet.render(worlds[1],1/12,0,{animate:true,draw:false});
  quiet.renderInspection(new T.Vector3(-14,6,11),new T.Vector3(-22,4,11));
  assert.equal(quiet.renderer.renderCalls,1,'a recorded frame submits one inspection view');
  quiet.render(worlds[1],1/12);assert.equal(quiet.renderer.renderCalls,2,'omitting draw:false immediately restores ordinary drawing');
});
