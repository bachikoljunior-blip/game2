import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld,advance,STEP,OBSTACLES} from './simulation.js';
import {SIGNAL,canLightSignal,objectiveText} from './mission.js';
import {playthroughAction} from './playthrough-policy.mjs';
const ticks=(w,n,i={})=>{for(let t=0;t<n;t++)stepWorld(w,i);};
test('read-only playthrough policy can complete combat and reach the signal without state shortcuts',()=>{
 for(const route of ['left','right']){
  const w=createWorld(),before=JSON.stringify(w);
  assert.ok(playthroughAction(w,route));assert.equal(JSON.stringify(w),before,'policy must only read state');
  for(let i=0;i<1800&&w.mode==='playing';i++)advance(w,.1,playthroughAction(w,route));
  assert.equal(w.mode,'victory');assert.equal(w.routeChoice,route);assert.equal(w.routePhase,'rejoined');
  assert.equal(w.routeLandmark,route==='left'?'石灯':'風布');
  assert.equal(w.routeConsequence,route==='left'?'early-retainer':'overlook-warden');
  assert.ok(w.routeChoiceTime<w.routeLandmarkTime&&w.routeLandmarkTime<w.routeRejoinTime);
  assert.equal(w.signalLit,true);assert.equal(w.totals.kills,3);assert.ok(w.player.hp>0);
 }
});
test('normal movement goes towards the torii, fresh retry restores state',()=>{
 const w=createWorld();ticks(w,120,{z:-1});assert.ok(w.player.z<11);assert.equal(createWorld().player.z,18);
});
test('obstacle separation does not trap a player embedded at its centre',()=>{
 const w=createWorld(),o=OBSTACLES[0];w.player.x=o.x;w.player.z=o.z;stepWorld(w,{x:0});assert.ok(Math.abs(w.player.x-o.x)>.5||Math.abs(w.player.z-o.z)>.5);
});
test('one swing hits a nearby target exactly once, never a rear target',()=>{
 const w=createWorld();w.enemies[0].z=16.5;w.enemies[0].cooldown=10;
 stepWorld(w,{attack:true});ticks(w,30);assert.equal(w.enemies[0].hp,66);assert.equal(w.totals.hits,1);
 const b=createWorld();b.enemies[0].z=19.5;b.enemies[0].cooldown=10;stepWorld(b,{attack:true});ticks(b,30);assert.equal(b.enemies[0].hp,100);
});
test('new guard deflects a frontal strike and held guard only blocks',()=>{
 for(const [age,kind]of [[0,'parry'],[.4,'block']]){
  const w=createWorld(),e=w.enemies[0];e.z=16.5;e.yaw=Math.PI;e.state='attack';e.age=.17;
  w.player.state='guard';w.player.guardAge=age;stepWorld(w,{guard:true});assert.ok(w.events.some(e=>e.type===kind));assert.equal(w.player.hp,100);
 }
});
test('dodge protects during its active interval',()=>{
 const w=createWorld(),e=w.enemies[0];e.z=16.5;e.yaw=Math.PI;e.state='attack';e.age=.17;
 w.player.state='dodge';w.player.age=.1;stepWorld(w);assert.equal(w.player.hp,100);assert.ok(w.events.some(e=>e.type==='evade'));
});

test('a neutral locked dodge retreats without oscillating through the target',()=>{
 const w=createWorld();w.player.x=0;w.player.z=0;w.enemies=w.enemies.slice(0,1);
 Object.assign(w.enemies[0],{x:0,z:-1.65,state:'windup'});w.locked=w.enemies[0].id;
 let priorZ=0;
 for(let n=0;n<27;n++){
  stepWorld(w,n===0?{dodge:true}:{});
  assert.ok(w.player.z>priorZ,'retreat must not reverse direction to chase the locked enemy');
  assert.ok(Math.hypot(w.player.x-w.enemies[0].x,w.player.z-w.enemies[0].z)>=1.65);
  priorZ=w.player.z;
 }
 assert.ok(w.player.z>3&&w.player.z<3.3);assert.equal(w.player.hp,100);
});

test('a directional dodge keeps the chosen direction as facing and input change',()=>{
 const w=createWorld();w.player.x=0;w.player.z=0;w.enemies=w.enemies.slice(0,1);
 Object.assign(w.enemies[0],{x:0,z:-1.65,state:'windup'});w.locked=w.enemies[0].id;
 for(let n=0;n<27;n++)stepWorld(w,n===0?{dodge:true,x:1}:{x:-1,z:-1});
 assert.ok(w.player.x>3);assert.ok(Math.abs(w.player.z)<1e-8);
});
test('60Hz and quarter-second frame delivery yield identical simulation',()=>{
 const a=createWorld(),b=createWorld();for(let i=0;i<600;i++)advance(a,STEP,{z:-1});for(let i=0;i<40;i++)advance(b,.25,{z:-1});
 assert.equal(a.ticks,b.ticks);assert.deepEqual(a.player,b.player);assert.deepEqual(a.totals,b.totals);
});
test('low render interval retains input and cannot repeat one attack pulse',()=>{
 const w=createWorld();assert.equal(advance(w,.001,{attack:true}),false);assert.equal(advance(w,.02,{attack:true}),true);assert.equal(w.player.state,'attack');
});
test('terminal states stop simulation; no absent measurement is counted',()=>{
 const w=createWorld();w.routeChoice='left';w.routePhase='rejoined';w.enemies.forEach(e=>e.hp=0);w.player.z=SIGNAL.z+1;stepWorld(w);stepWorld(w,{lock:true});assert.equal(w.mode,'victory');const t=w.time;ticks(w,50);assert.equal(w.time,t);
 const dead=createWorld();dead.player.hp=0;stepWorld(dead);assert.equal(dead.mode,'defeat');
});
test('clearing the path requires a living arrival at the signal, not just the last kill',()=>{
 const w=createWorld();w.enemies.forEach(e=>e.hp=0);stepWorld(w);
 assert.equal(w.mode,'playing');assert.equal(w.signalLit,false);
 assert.equal(objectiveText(w),'道は開いた。分かれた参道を通って灯へ');
 w.player.z=SIGNAL.z+1;stepWorld(w,{lock:true});assert.equal(w.mode,'playing');assert.equal(w.signalLit,false,'arrival without a real route choice cannot light the signal');
 const chosen=createWorld();chosen.routeChoice='left';chosen.routePhase='rejoined';chosen.enemies.forEach(e=>e.hp=0);chosen.player.z=SIGNAL.z+1;
 stepWorld(chosen);stepWorld(chosen,{lock:true});assert.equal(chosen.mode,'victory');assert.equal(chosen.signalLit,true);
 assert.equal(chosen.events.filter(e=>e.type==='signal').length,1);
 assert.equal(createWorld().signalLit,false);
 const alive=createWorld();alive.player.z=SIGNAL.z+1;stepWorld(alive);
 assert.equal(alive.mode,'playing');assert.equal(alive.signalLit,false);
 const dead=createWorld();dead.enemies.forEach(e=>e.hp=0);dead.player.z=SIGNAL.z+1;dead.player.hp=0;stepWorld(dead);
 assert.equal(dead.mode,'defeat');assert.equal(dead.signalLit,false);
});
test('a route choice cannot light the signal before physical reconvergence',()=>{
 for(const route of ['left','right']){
  const w=createWorld();w.routeChoice=route;w.routePhase='branch';w.pathCleared=true;
  w.enemies.forEach(enemy=>enemy.hp=0);Object.assign(w.player,{x:SIGNAL.x,z:SIGNAL.z});
  assert.equal(canLightSignal(w),false);
 }
});
test('branch enemies activate only after their route is chosen or paths reconverge',()=>{
 const w=createWorld(),retainer=w.enemies.find(enemy=>enemy.id==='retainer'),warden=w.enemies.find(enemy=>enemy.id==='warden');
 Object.assign(w.player,{x:0,z:0});Object.assign(retainer,{x:-2,z:0});Object.assign(warden,{x:2,z:0});
 stepWorld(w);assert.equal(retainer.stride,0);assert.equal(warden.stride,0);
 w.routeChoice='right';w.routePhase='branch';stepWorld(w);
 assert.equal(retainer.stride,0);assert.ok(warden.stride>0);
 w.routePhase='rejoined';stepWorld(w);assert.ok(retainer.stride>0);
});
test('signal activation uses distance, not only forward progress; batched time agrees',()=>{
 const a=createWorld(),b=createWorld();
 for(const w of [a,b]){w.routeChoice='right';w.routePhase='rejoined';w.enemies.forEach(e=>e.hp=0);w.player.x=3;w.player.z=SIGNAL.z+1;stepWorld(w);assert.equal(w.signalLit,false);}
 for(let i=0;i<60;i++)advance(a,STEP,{x:-1});for(let i=0;i<4;i++)advance(b,.25,{x:-1});
 stepWorld(a,{lock:true});stepWorld(b,{lock:true});
 assert.equal(a.mode,'victory');assert.equal(b.mode,a.mode);assert.deepEqual(a.player,b.player);
 assert.equal(a.events.filter(e=>e.type==='signal').length,1);
});
test('last kill at the lamp cannot finish the mission without a subsequent signal input',()=>{
 const w=createWorld();w.routeChoice='left';w.routePhase='rejoined';w.player.z=SIGNAL.z+1;w.enemies.forEach(e=>e.hp=0);
 stepWorld(w,{lock:true});assert.equal(w.pathCleared,true);assert.equal(w.mode,'playing');assert.equal(w.signalLit,false);
 ticks(w,120);assert.equal(w.mode,'playing');assert.equal(w.signalLit,false);
 stepWorld(w,{lock:true});assert.equal(w.mode,'victory');assert.equal(w.signalLit,true);
});
test('enemy lunge preserves fighting distance and finishes an undefended player',()=>{
 const w=createWorld();w.player.z=6.89;w.enemies[0].z=5.53;w.enemies[0].hp=66;
 for(let i=0;i<1200;i++)advance(w,STEP);
 assert.equal(w.mode,'defeat');assert.equal(w.player.hp,0);assert.equal(w.totals.received,5);
 assert.ok(Math.hypot(w.player.x-w.enemies[0].x,w.player.z-w.enemies[0].z)>=1.1-1e-8);
});
