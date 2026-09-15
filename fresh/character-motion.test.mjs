import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from 'three';
import {ANATOMY,createCharacterRig,createCharacterResources} from './character-rig.js';
import {ATTACK_PHASES,LOCOMOTION,sampleCharacterPose,solveTwoBone,updateCharacterRig} from './character-motion.js';

function fixture(id='player'){
  const actor={id,x:0,z:0,yaw:0,hp:100,state:'idle',age:0};
  const world={time:0,mode:'playing',events:[],locked:null};
  return {actor,world,rig:createCharacterRig(id)};
}
function frame(f,dt=1/60,options={}){f.actor.age+=dt;f.world.time+=dt;return updateCharacterRig(f.rig,f.actor,f.world,dt,options);}
function finiteTree(node){
  if(typeof node==='number')assert.ok(Number.isFinite(node));
  else if(node&&typeof node==='object')Object.values(node).forEach(finiteTree);
}

test('forward knee pole preserves exact segment lengths and bends the knee behind its forward thigh',()=>{
  const origin=new T.Vector3(0,.88,0);
  for(const z of [-.42,-.2,0,.2,.42]){
    const target=new T.Vector3(0,.095,z),solution=solveTwoBone(origin,target,new T.Vector3(0,0,-1),ANATOMY.thigh,ANATOMY.shin);
    assert.ok(Math.abs(origin.distanceTo(solution.joint)-ANATOMY.thigh)<1e-8);
    assert.ok(Math.abs(solution.joint.distanceTo(solution.end)-ANATOMY.shin)<1e-8);
    assert.ok(new T.Euler().setFromQuaternion(solution.lowerQuaternion).x<0,'a negative sagittal knee rotation folds the shin back');
    assert.ok(solution.bendAngle>0&&solution.bendAngle<Math.PI);
  }
});

test('authored cut shares the unchanged preparation, active and recovery interval',()=>{
  assert.deepEqual(ATTACK_PHASES,{activeStart:.18,activeEnd:.34,end:.65});
  for(const t of [0,.10,.179999])assert.equal(sampleCharacterPose('attack',t).active,false);
  for(const t of [.18,.245,.34])assert.equal(sampleCharacterPose('attack',t).active,true);
  for(const t of [.340001,.50,.65])assert.equal(sampleCharacterPose('attack',t).active,false);
  const before=sampleCharacterPose('attack',.18),after=sampleCharacterPose('attack',.34);
  assert.ok(after.weapon[1]<before.weapon[1]-.35,'the cut descends through the actual hit window');
  assert.ok(after.weapon[2]<before.weapon[2]-.40,'the blade moves into the facing opponent');
  assert.ok(sampleCharacterPose('attack',.43).weapon[1]<after.weapon[1],'follow-through continues after the hit window');
});

test('running follows actual displacement, preserves planted feet and keeps every knee anatomically flexed',()=>{
  const f=fixture('sentinel');frame(f);let last=null,plantPairs=0,maxPlantDrift=0,maxReach=0,lifts=0;
  for(let n=0;n<240;n++){
    f.actor.z-=3.8/60;const motion=frame(f);finiteTree(motion);
    motion.feet.forEach((foot,i)=>{
      assert.ok(foot.kneeRotationX<=.000001,'no frame may reverse a knee');
      assert.ok(foot.kneeFlexion>.05&&foot.kneeFlexion<2.7);
      maxReach=Math.max(maxReach,foot.reachError);
      if(!foot.contact&&foot.footLocal[1]>.15)lifts++;
      const old=last?.feet[i];
      if(old?.contact&&foot.contact){plantPairs++;maxPlantDrift=Math.max(maxPlantDrift,Math.hypot(foot.footWorld.x-old.footWorld.x,foot.footWorld.z-old.footWorld.z));}
    });last=motion;
  }
  assert.ok(plantPairs>100);assert.ok(maxPlantDrift<1e-8,`stance drift ${maxPlantDrift}`);
  assert.ok(lifts>40,'swing has an actual toe clearance arc');assert.ok(maxReach<.025,`leg target reach error ${maxReach}`);
  const expected=((240*3.8/60)/(2*LOCOMOTION.stepDistance))%1;
  assert.ok(Math.abs(last.gaitPhase-expected)<1e-9);
});

test('blocked movement intent cannot advance the gait and stopping settles without frozen running limbs',()=>{
  const f=fixture();frame(f);for(let n=0;n<60;n++){f.actor.z-=3.8/60;frame(f);}
  const phase=f.rig.motion.phase;
  for(let n=0;n<120;n++){f.actor.stride=(f.actor.stride||0)+3.8/60;frame(f);}
  assert.equal(f.rig.motion.phase,phase);assert.ok(f.rig.motion.speed<.001);
  assert.ok(f.rig.motion.gaitWeight<.001);assert.equal(f.rig.motion.metrics.phase,'idle');
  assert.ok(Math.abs(f.rig.motion.metrics.feet[0].footLocal[2]+.07)<.001);
});

test('every action remains finite, reachable and on the correct knee side through continuous transitions',()=>{
  const f=fixture();frame(f);
  for(const [state,duration] of [['guard',.35],['windup',.65],['attack',.65],['stagger',.38],['broken',1.8],['dodge',.46],['idle',.4]]){
    f.actor.state=state;f.actor.age=0;
    for(let n=0;n<Math.ceil(duration*60);n++){
      const motion=frame(f);finiteTree(motion);
      for(const foot of motion.feet){assert.ok(foot.kneeRotationX<.001);assert.ok(foot.reachError<.015,`${state}: leg reach ${foot.reachError}`);}
      for(const hand of motion.hands)assert.ok(hand.reachError<.02,`${state}: grip error ${hand.reachError}`);
      assert.equal(motion.attackActive,state==='attack'&&f.actor.age>=.18&&f.actor.age<=.34);
    }
  }
});

test('parry reaction belongs to the defender and decays instead of replaying retained events',()=>{
  const f=fixture();f.actor.state='guard';for(let n=0;n<30;n++)frame(f);
  f.world.events=[{type:'parry',target:'player',source:'sentinel',time:f.world.time}];frame(f);
  const initial=f.rig.motion.impact;assert.ok(initial>.5);
  for(let n=0;n<60;n++)frame(f);
  assert.ok(f.rig.motion.impact<.001);assert.equal(f.rig.motion.impactKind,'parry');
});

test('death finishes progressively after simulation time freezes and pause freezes the entire rig',()=>{
  const f=fixture();frame(f);f.actor.state='dead';f.actor.hp=0;f.actor.age=0;f.world.mode='defeat';
  const first=updateCharacterRig(f.rig,f.actor,f.world,1/60),firstHeight=first.pelvis[1];
  for(let n=0;n<110;n++)updateCharacterRig(f.rig,f.actor,f.world,1/60);
  assert.equal(f.rig.motion.metrics.phase,'rest-dead');assert.ok(f.rig.motion.metrics.pelvis[1]<firstHeight-.5);
  assert.ok(f.rig.body.rotation.x>1.3,'loss of balance, collapse and settling replace an instant 90 degree flip');
  const before=JSON.stringify(f.rig.motion.metrics),matrices=[];f.rig.root.traverse(node=>matrices.push(node.matrixWorld.toArray()));
  for(let n=0;n<60;n++)updateCharacterRig(f.rig,f.actor,f.world,1/60,{animate:false});
  assert.equal(JSON.stringify(f.rig.motion.metrics),before);
  const after=[];f.rig.root.traverse(node=>after.push(node.matrixWorld.toArray()));assert.deepEqual(after,matrices);
});

test('a falling character keeps the scabbard, elbows and visible figure above the ground',()=>{
  const f=fixture();f.actor.hp=0;f.actor.state='dead';f.world.mode='defeat';const vertex=new T.Vector3();let minimum=Infinity;
  for(let n=0;n<54;n++){
    f.actor.age=n/30;updateCharacterRig(f.rig,f.actor,f.world,1/30);
    f.rig.root.traverse(node=>{
      if(!node.isMesh||!node.visible)return;
      const positions=node.geometry.getAttribute('position');
      for(let i=0;i<positions.count;i++)minimum=Math.min(minimum,vertex.fromBufferAttribute(positions,i).applyMatrix4(node.matrixWorld).y);
    });
  }
  assert.ok(minimum>-.006,`generated geometry penetrates the floor by ${-minimum}m`);
});

test('victory raises, aligns and inserts the sword before hiding the enclosed blade; retry resets everything',()=>{
  const f=fixture();frame(f);f.world.mode='victory';let sawAlign=false,sawInsertion=false;
  for(let n=0;n<225;n++){
    const motion=updateCharacterRig(f.rig,f.actor,f.world,1/60);
    if(motion.phase==='salute'){sawAlign=true;assert.equal(f.rig.blade.visible,true);}
    if(motion.sheathProgress>.2&&motion.sheathProgress<.8){sawInsertion=true;assert.equal(f.rig.blade.visible,true);}
  }
  assert.ok(sawAlign&&sawInsertion);assert.equal(f.rig.blade.visible,false);assert.equal(f.rig.sword.visible,true,'the hilt remains visible in the scabbard');
  assert.equal(f.rig.motion.metrics.sheathed,true);
  const freshActor={...f.actor,state:'idle',age:0};f.world.mode='playing';f.world.time=0;
  updateCharacterRig(f.rig,freshActor,f.world,1/60);
  assert.equal(f.rig.motion.metrics.sheathed,false);assert.equal(f.rig.blade.visible,true);assert.equal(f.rig.motion.victoryAge,0);
});

test('large facing changes have bounded turns and a visible corrective foot lift',()=>{
  const f=fixture();frame(f);f.actor.yaw=Math.PI;let lifted=false,old=0;
  for(let n=0;n<60;n++){
    const motion=frame(f);assert.ok(Math.abs(motion.root.yaw-old)<=9/60+1e-8);old=motion.root.yaw;
    if(motion.phase==='pivot'&&motion.feet.some(foot=>foot.footLocal[1]>.10))lifted=true;
  }
  assert.ok(lifted);assert.ok(Math.abs(f.rig.motion.yaw-Math.PI)<.001);
});

test('generated costumes share boot resources and keep detail attached to articulated joints',()=>{
  const resources=createCharacterResources(),a=createCharacterRig('player',resources),b=createCharacterRig('warden',resources);
  assert.equal(resources.weave.isDataTexture,true);assert.equal(a.metrics.externalRuntimeAssets,0);
  assert.ok(a.metrics.generatedParts>140);assert.ok(a.metrics.drawMeshes<90,'static details are merged per joint');
  assert.ok(b.metrics.generatedParts>a.metrics.generatedParts,'the warden has its own helmet and face guard');
  assert.equal(a.limbs[0].ankle.parent,a.limbs[0].knee);assert.equal(a.limbs[0].wrist.parent,a.limbs[0].elbow);
  assert.equal(a.panels.length,4);assert.equal(a.ties.length,3);assert.equal(a.scabbard.parent,a.body);
});
