import test from 'node:test';
import assert from 'node:assert/strict';
import {performance} from 'node:perf_hooks';
import {groundHeightAt,maximumGroundInRect,TERRAIN} from './terrain.js';
import {createCharacterRig,createCharacterResources} from './character-rig.js';
import {updateCharacterRig} from './character-motion.js';

// Independent oracle: clip each full terrain triangle against the query
// rectangle and evaluate its resulting polygon vertices on the shared surface.
function clippedMaximum(rect){
  let [x0,z0,x1,z1]=rect;
  [x0,x1]=[Math.min(x0,x1),Math.max(x0,x1)].map(x=>Math.max(-80,Math.min(80-2.5e-9,x)));
  [z0,z1]=[Math.min(z0,z1),Math.max(z0,z1)].map(z=>Math.max(-100,Math.min(100-2.5e-9,z)));
  const clip=(polygon,axis,limit,sign)=>{
    const result=[];
    for(let i=0;i<polygon.length;i++){
      const a=polygon[i],b=polygon[(i+1)%polygon.length],insideA=(a[axis]-limit)*sign>=0,insideB=(b[axis]-limit)*sign>=0;
      if(insideA)result.push(a);
      if(insideA!==insideB){const t=(limit-a[axis])/(b[axis]-a[axis]);result.push([a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t]);}
    }
    return result;
  };
  let maximum=-Infinity;
  for(let iz=Math.floor((z0+100)/2.5);iz<=Math.floor((z1+100)/2.5);iz++)for(let ix=Math.floor((x0+80)/2.5);ix<=Math.floor((x1+80)/2.5);ix++){
    const x=-80+ix*2.5,z=-100+iz*2.5,a=[x,z],b=[x+2.5,z],c=[x,z+2.5],d=[x+2.5,z+2.5];
    for(let polygon of [[a,b,c],[d,c,b]]){
      for(const [axis,limit,sign] of [[0,x0,1],[0,x1,-1],[1,z0,1],[1,z1,-1]])polygon=clip(polygon,axis,limit,sign);
      for(const [px,pz] of polygon)maximum=Math.max(maximum,groundHeightAt(px,pz));
    }
  }
  return maximum;
}

test('terrain maximum matches clipped triangles at grid lines, diagonals, negatives and clamped edges',()=>{
  const cases=[[30,10,30,10],[-31.25,-8.75,-29.8,-7.7],[-30,-10,-27.5,-7.5],[-29.9,-9.9,-27.6,-7.6],
    [31.25,11.25,28.75,8.75],[79.5,99.5,90,110],[-95,-110,-79.2,-98.8],[-95,110,-90,120],[-80,-100,80,100],
    [-Infinity,-Infinity,Infinity,Infinity],[3,-3,3,4],[-2,6,2,6]];
  let seed=7919;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
  for(let i=0;i<80;i++){const x=-90+random()*180,z=-110+random()*220;cases.push([x,z,x+random()*7,z+random()*7]);}
  for(const rect of cases){
    const maximum=maximumGroundInRect(...rect),expected=clippedMaximum(rect);
    assert.ok(maximum>=expected-1e-12,`${rect}: non-conservative ${maximum} < ${expected}`);
    assert.ok(Math.abs(maximum-expected)<1e-10,`${rect}: maximum is not tight`);
  }
  assert.equal(maximumGroundInRect(NaN,0,1,1),Infinity);
  assert.equal(groundHeightAt.maximumInRect,maximumGroundInRect);
  assert.equal(TERRAIN.step,2.5);
});

test('bound preserves each articulated pose and lift while reducing exact height queries on the 48k figure',t=>{
  const resources=createCharacterResources(),reports=[];
  for(const state of ['dead','broken','dodge']){
    const reference=createCharacterRig('player',resources),accelerated=createCharacterRig('player',resources);
    let oldCalls=0,newCalls=0,oldMs=0,newMs=0,boundCalls=0;
    const exact=(x,z)=>{oldCalls++;return groundHeightAt(x,z);},bounded=(x,z)=>{newCalls++;return groundHeightAt(x,z);};
    bounded.maximumInRect=(...rect)=>{boundCalls++;return maximumGroundInRect(...rect);};
    const actor={id:'player',x:30,z:10,yaw:Math.PI*.75,hp:state==='dead'?0:100,state,age:0},world={time:0,mode:state==='dead'?'defeat':'playing',events:[]};
    const oldNodes=[],newNodes=[];reference.root.traverse(node=>oldNodes.push(node));accelerated.root.traverse(node=>newNodes.push(node));
    for(let frame=0;frame<90;frame++){
      actor.age=frame/60;world.time=frame/60;
      let start=performance.now();const a=updateCharacterRig(reference,actor,world,1/60,{groundHeightAt:exact});oldMs+=performance.now()-start;
      start=performance.now();const b=updateCharacterRig(accelerated,actor,world,1/60,{groundHeightAt:bounded});newMs+=performance.now()-start;
      assert.deepEqual(b,a,`${state}/${frame}: pose/contact metrics changed`);
      for(let n=0;n<oldNodes.length;n++)assert.deepEqual(newNodes[n].matrixWorld.elements,oldNodes[n].matrixWorld.elements,`${state}/${frame}/${n}: articulated geometry moved`);
    }
    assert.ok(boundCalls>0);assert.ok(newCalls<oldCalls*.65,`${state}: ${newCalls}/${oldCalls} exact height calls`);
    reports.push({state,frames:90,oldCalls,newCalls,boundCalls,heightCallReduction:1-newCalls/oldCalls,oldMsPerFrame:oldMs/90,newMsPerFrame:newMs/90});
  }
  t.diagnostic(JSON.stringify({kind:'Node CPU, same current generated figure, not browser/device timing',reports}));
});

test('generic flat and nonterrain providers retain the previous no-bound fallback',()=>{
  const resources=createCharacterResources();
  for(const heightAt of [()=>0,(x,z)=>.2*x-.1*z+.3]){
    const rig=createCharacterRig('player',resources),actor={id:'player',x:2,z:1,yaw:.8,hp:0,state:'dead',age:1},world={time:1,mode:'defeat',events:[]};
    const motion=updateCharacterRig(rig,actor,world,1/60,{groundHeightAt:heightAt});
    assert.ok(Number.isFinite(motion.bodyGroundLift)&&Number.isFinite(motion.weaponGroundLift));
    assert.equal(heightAt.maximumInRect,undefined);
  }
});
