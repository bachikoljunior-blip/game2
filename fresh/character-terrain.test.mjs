import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {createCharacterRig,createCharacterResources} from './character-rig.js';
import {sampleCharacterPose,updateCharacterRig} from './character-motion.js';

// The override permits an isolated actor worktree to verify the integrator's
// exact terrain without modifying files owned by the world implementation.
const terrainRoot=new URL(process.env.CHARACTER_TERRAIN_TEST_ROOT||'./',import.meta.url);
const {groundHeightAt}=await import(new URL('terrain.js',terrainRoot));
const {EXPLORATION}=await import(new URL('exploration.js',terrainRoot));
const vertex=new T.Vector3();
function figureClearance(rig){
  let minimum=Infinity,part=null;
  for(const group of [rig.body,rig.sword])group.traverseVisible(mesh=>{
    if(!mesh.isMesh)return;
    const positions=mesh.geometry.getAttribute('position');
    for(let i=0;i<positions.count;i++){
      vertex.fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld);
      const gap=vertex.y-groundHeightAt(vertex.x,vertex.z);
      if(gap<minimum){minimum=gap;part=mesh.parent.name;}
    }
  });
  return {minimum,part};
}
const states=[
  ['idle',[0,.5]],['guard',[.05,.12,.4]],['windup',[.10,.35,.6]],
  ['attack',[.05,.115,.18,.245,.34,.43,.65]],['stagger',[.05,.12,.30]],
  ['broken',[.20,.40,1.2,1.75]],['dodge',[.09,.25,.45]],
  ['dead',[.17,.48,.75,1.05,1.5]],['victory',[.5,1.4,1.8,2.4,3.3]],
];

test('all action phases fit the actual triangular terrain at six discoveries and eight facings',t=>{
  assert.equal(EXPLORATION.points.length,6);
  const resources=createCharacterResources(),rig=createCharacterRig('player',resources),report={};
  const before=JSON.stringify(states.map(([state])=>sampleCharacterPose(state,.65)));
  for(const place of EXPLORATION.points){
    let lowest=Infinity,poses=0;
    for(let facing=0;facing<8;facing++)for(const [state,ages] of states)for(const age of ages){
      const actor={id:'player',x:place.x,z:place.z,yaw:facing*Math.PI/4,hp:state==='dead'?0:100,state:state==='victory'?'idle':state,age};
      const world={time:5,mode:state==='victory'?'victory':state==='dead'?'defeat':'playing',events:[]};
      const frames=state==='victory'?Math.ceil(age*30):1;
      for(let n=0;n<frames;n++)updateCharacterRig(rig,actor,world,1/30,{groundHeightAt});
      const measured=figureClearance(rig);lowest=Math.min(lowest,measured.minimum);poses++;
      assert.ok(measured.minimum>=-.004,`${place.id} / ${state} ${age}s / yaw ${actor.yaw}: ${measured.part} penetrates ${-measured.minimum}m`);
      for(const foot of rig.motion.metrics.feet)assert.ok(foot.kneeRotationX<=.001,`${place.id} ${state}: reversed knee`);
      if(state!=='dead')for(const hand of rig.motion.metrics.hands)assert.ok(hand.reachError<.025,`${place.id} ${state}: grip exceeds reach ${hand.reachError}m`);
    }
    report[place.id]={poses,lowestClearance:lowest};
  }
  assert.equal(JSON.stringify(states.map(([state])=>sampleCharacterPose(state,.65))),before,'terrain projection must never mutate shared authored poses');
  t.diagnostic(JSON.stringify(report));
});

test('sloped running plants feet at their own world positions through acceleration and deceleration',()=>{
  const rig=createCharacterRig('sentinel');let contacts=0;
  for(const place of EXPLORATION.points)for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5]){
    const actor={id:'sentinel',x:place.x,z:place.z,yaw,hp:100,state:'idle',age:0},world={time:0,mode:'playing',events:[]};
    updateCharacterRig(rig,actor,world,1/60,{groundHeightAt});let previous=null;
    for(let n=0;n<90;n++){
      if(n<60){actor.x+=Math.sin(yaw)*3.8/60;actor.z-=Math.cos(yaw)*3.8/60;}
      actor.age+=1/60;world.time+=1/60;const current=updateCharacterRig(rig,actor,world,1/60,{groundHeightAt});
      for(let i=0;i<2;i++){
        const foot=current.feet[i],old=previous?.feet[i];
        assert.ok(foot.kneeRotationX<.001);assert.ok(foot.reachError<.025);
        if(old?.contact&&foot.contact){
          const slip=Math.hypot(foot.footWorld.x-old.footWorld.x,foot.footWorld.z-old.footWorld.z);
          assert.ok(slip<1e-7,`${place.id}: planted sole slips by ${slip}m`);contacts++;
        }
      }
      if(n%5===0){const measured=figureClearance(rig);assert.ok(measured.minimum>=-.006,`${place.id}: running ${measured.part} penetrates ${-measured.minimum}m`);}
      previous=current;
    }
  }
  assert.ok(contacts>500);
});

test('state blending on the steep sun-ring cannot accumulate terrain offsets or change authored poses',()=>{
  const place=EXPLORATION.points.find(point=>point.id==='sun-ring');
  const actor={id:'player',x:place.x,z:place.z,yaw:Math.PI*.75,hp:100,state:'idle',age:0},world={time:0,mode:'playing',events:[]},rig=createCharacterRig('player');
  for(let n=0;n<240;n++){
    actor.state=n%40<20?'guard':'idle';actor.age=(n%20)/60;world.time+=1/60;
    updateCharacterRig(rig,actor,world,1/60,{groundHeightAt});
    const measured=figureClearance(rig);
    assert.ok(measured.minimum>=-.004,`entry blend penetrates ${-measured.minimum}m`);
    assert.ok(rig.body.position.y<1.15,'ground offsets may not accumulate across transitions');
  }
});


test('parry and block keep grounded soles and reachable grips across discovery slopes',()=>{
  const rig=createCharacterRig('player');
  for(const place of EXPLORATION.points)for(const yaw of [0,Math.PI/2,Math.PI,Math.PI*1.5])for(const kind of ['parry','block']){
    const actor={id:'player',x:place.x,z:place.z,yaw,hp:100,state:'guard',age:.2},world={time:0,mode:'playing',events:[]};
    updateCharacterRig(rig,actor,world,1/60,{groundHeightAt});
    const planted=rig.motion.metrics.feet.map(foot=>({...foot.footWorld}));
    world.events=[{type:kind,target:'player',source:'sentinel',time:0}];
    for(const age of [0,.025,.05,.10,.18,.26]){
      const dt=age-world.time;world.time=age;actor.age=.2+age;
      const motion=updateCharacterRig(rig,actor,world,dt,{groundHeightAt}),clearance=figureClearance(rig);
      assert.ok(clearance.minimum>=-.004,`${place.id}/${kind}: ${clearance.part} penetrates ${-clearance.minimum}m`);
      motion.feet.forEach((foot,i)=>{assert.ok(foot.kneeRotationX<=.001);assert.ok(Math.hypot(foot.footWorld.x-planted[i].x,foot.footWorld.y-planted[i].y,foot.footWorld.z-planted[i].z)<1e-7);});
      assert.ok(motion.hands.every(hand=>hand.reachError<.025),`${place.id}/${kind}: grip exceeds reach`);
    }
  }
});
