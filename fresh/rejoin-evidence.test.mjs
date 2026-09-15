import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, advance, OBSTACLES } from './simulation.js';
import { computeCameraFrame, interpolateCameraFrame } from './camera-framing.js';
import { compositionReady, waitForComposition, rejoinRetreatVector, settleRejoinAndLock,
  keyboardRejoinControls, touchRejoinControls } from './rejoin-evidence.mjs';

const framed={leftExit:{inFrame:true},rightExit:{inFrame:true},sharedJoin:{inFrame:true}};
test('a visible projection still fails when the camera has not cleared the ridge',()=>{
  const camera={rejoinVistaFrames:11,rejoinComposition:framed,rejoinFrameError:4.2999699034751995,
    rejoinSightlineClearance:-.6974614598084408};
  assert.equal(compositionReady(camera,'rejoinVistaFrames','rejoinComposition'),false);
  assert.equal(compositionReady({...camera,rejoinFrameError:.18,rejoinSightlineClearance:.3},'rejoinVistaFrames','rejoinComposition'),false);
  assert.equal(compositionReady({...camera,rejoinFrameError:.18,rejoinSightlineClearance:.301},'rejoinVistaFrames','rejoinComposition'),true);
});

function compositionApparatus({frozen=false}={}){
  let time=0;
  return {now:()=>time,page:{
    async evaluate(){
      const frame=Math.floor(time/1000),y=Math.min(11.5,2.8+(frozen?0:frame)*.4);
      return {world:{mode:'playing',time:frame*.25,player:{state:'idle',hp:100},enemies:[],locked:null},renderFrame:frame,
        camera:{frame:{y},rejoinVistaFrames:frame,rejoinComposition:framed,rejoinFrameError:11.5-y,
          rejoinSightlineClearance:y*(1-7.25/10.2)-2.8}};
    },async waitForTimeout(ms){time+=ms;}
  }};
}

test('a one-frame-per-second camera receives time to meet the original visibility gate',async()=>{
  const {page,now}=compositionApparatus(),progress={};
  const result=await waitForComposition(page,'rejoinVistaFrames','rejoinComposition',{now,progress,deadline:180000});
  assert.ok(now()>10000&&now()<45000);
  assert.equal(progress.status,'passed');assert.ok(result.frame.y>=11.32);
  assert.equal(result.progress.renderFramesObserved,progress.samples.length);
  assert.ok(progress.samples.length<30,'only actual render changes are retained');
});

test('composition budget obeys the original mission deadline and preserves terminal evidence',async()=>{
  const {page,now}=compositionApparatus({frozen:true}),progress={};
  await assert.rejects(waitForComposition(page,'rejoinVistaFrames','rejoinComposition',{now,progress,deadline:1700}),/mission deadline/);
  assert.equal(now(),1700);assert.equal(progress.status,'failed');
  assert.equal(progress.last.camera.rejoinFrameError,8.7);
});

test('a frozen composition fails at 45 seconds instead of accepting the timeout',async()=>{
  const {page,now}=compositionApparatus({frozen:true}),progress={};
  await assert.rejects(waitForComposition(page,'rejoinVistaFrames','rejoinComposition',{now,progress}),/45000ms/);
  assert.equal(now(),45000);assert.equal(progress.status,'failed');
});

function rejoinedWorld(route){
  const world=createWorld();Object.assign(world,{routeChoice:route,routePhase:'rejoined',routeChoiceTime:28,
    routeRejoinTime:57,routeLandmark:route==='left'?'石灯':'風布'});
  Object.assign(world.player,{x:route==='left'?-.9825799683698208:1.925687467431362,z:-17.4840710913104,
    hp:route==='left'?52:100,yaw:Math.PI/4});
  for(const enemy of world.enemies)if(enemy.id!==(route==='left'?'warden':'retainer'))Object.assign(enemy,{hp:0,state:'dead'});
  world.totals.kills=2;return world;
}

test('left-route escape increases distance and avoids the shrine that blocks a rear retreat',()=>{
  const world=rejoinedWorld('left'),p=world.player,enemy=world.enemies[2];
  const move=rejoinRetreatVector(world),n=Math.hypot(move.x,move.z);
  assert.ok(move.x<0);assert.ok(n>0);
  for(const travel of [.35,.8,1.4,2.2]){
    const x=p.x+move.x/n*travel,z=p.z+move.z/n*travel;
    assert.ok(!OBSTACLES.some(o=>Math.abs(x-o.x)<o.w/2+.4&&Math.abs(z-o.z)<o.d/2+.4));
    assert.ok(Math.hypot(x-enemy.x,z-enemy.z)>Math.hypot(p.x-enemy.x,p.z-enemy.z));
  }
});

// This fixture runs the real fixed-step combat and bounded camera interpolation
// with delayed test controls. It is not a rendered or physical-device result.
function delayedRejoinApparatus(route,{ignoreLock=false}={}){
  const world=rejoinedWorld(route),initialHp=world.player.hp;
  let time=0,nextFrame=500,frames=0;
  const input={x:0,z:0,guard:false,lock:false},calls=[];
  const current={x:0,y:11.5,z:-7,lookX:0,lookY:.8,lookZ:-17.2};
  function elapse(ms){
    const until=time+ms;
    while(nextFrame<=until){
      time=nextFrame;advance(world,.25,input);input.lock=false;
      interpolateCameraFrame(current,computeCameraFrame(world,0,844/390,{}),.25,true);
      nextFrame+=500;frames++;
    }
    time=until;
  }
  const page={async evaluate(){return structuredClone({world,camera:{frame:current},renderFrame:frames});},
    async waitForTimeout(ms){elapse(ms);}};
  const controls={
    async guard(){input.guard=true;calls.push('guard-on');elapse(160);},
    async move(x,z){if(input.x!==x||input.z!==z){input.x=x;input.z=z;calls.push(['move',x,z]);elapse(160);}},
    async pulseLock(){assert.equal(input.guard,true);calls.push('lock');if(!ignoreLock)input.lock=true;elapse(160);}
  };
  return {world,initialHp,page,controls,now:()=>time,calls,input};
}

for(const route of ['left','right'])test(`${route} descent with live pursuit retains health and acknowledges one guarded lock`,async()=>{
  const fixture=delayedRejoinApparatus(route),progress={},events=[];
  const settled=await settleRejoinAndLock(fixture.page,fixture.controls,{now:fixture.now,deadline:180000,progress,
    onSettled:()=>events.push('settled'),onLock:()=>events.push('locked')});
  assert.equal(fixture.world.mode,'playing');assert.equal(fixture.world.player.hp,fixture.initialHp);
  assert.equal(fixture.world.totals.kills,2,'the remaining enemy is still live during the camera stage');
  assert.equal(settled.locked,null);assert.equal(settled.playerState,'guard');assert.ok(settled.downAngleDegrees<=30);
  assert.equal(fixture.world.locked,route==='left'?'warden':'retainer');
  assert.equal(fixture.calls.filter(call=>call==='lock').length,1);assert.equal(progress.lockPulses,1);
  assert.equal(fixture.input.guard,true);assert.equal(fixture.input.x,0);assert.equal(fixture.input.z,0);
  assert.deepEqual(events,['settled','locked']);assert.equal(progress.status,'passed');
  assert.ok(progress.samples.some(sample=>sample.worldTime>0),'the simulation advances throughout the stage');
});

test('a missing lock acknowledgement fails without sending a second toggle or dropping guard',async()=>{
  const fixture=delayedRejoinApparatus('left',{ignoreLock:true}),progress={};
  await assert.rejects(settleRejoinAndLock(fixture.page,fixture.controls,{now:fixture.now,deadline:180000,progress}),/single guarded rejoin lock pulse/);
  assert.equal(fixture.calls.filter(call=>call==='lock').length,1);assert.equal(fixture.input.guard,true);
  assert.equal(progress.status,'failed');assert.equal(progress.last.locked,null);
});

test('keyboard movement changes preserve the held guard across the lock pulse',async()=>{
  const keys=new Set(),held=new Set(),page={keyboard:{async down(key){keys.add(key);},async up(key){keys.delete(key);},
    async press(key){assert.equal(key,'KeyE');assert.ok(keys.has('KeyQ'));}}};
  const controls=keyboardRejoinControls(page,held);
  await controls.guard();await controls.move(-1,0);await controls.move(0,0);await controls.pulseLock();
  assert.deepEqual([...keys],['KeyQ']);assert.deepEqual([...held],['KeyQ']);
});

test('touch joystick release and lock dispatch retain the same guard contact',async()=>{
  const contacts=new Map(),events=[];
  const controls=touchRejoinControls({contacts,guard:{x:700,y:300},stick:{x:80,y:300},
    async begin(id,p){contacts.set(id,{...p,id});events.push(['begin',id]);},
    async end(id){contacts.delete(id);events.push(['end',id]);},
    async send(event){assert.ok(event.touchPoints.some(point=>point.id===1));events.push(['move']);},
    async pulseLock(){assert.ok(contacts.has(1));assert.ok(!contacts.has(4));events.push(['lock']);}});
  await controls.guard();await controls.move(-1,0);await controls.move(-1,0);await controls.move(0,0);await controls.pulseLock();
  assert.ok(contacts.has(1));assert.deepEqual(events,[['begin',1],['begin',4],['move'],['end',4],['lock']]);
});
