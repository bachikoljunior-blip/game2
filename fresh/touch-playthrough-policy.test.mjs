import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance} from './simulation.js';
import {createTouchPlaythroughSession,touchPlaythroughAction} from './touch-playthrough-policy.mjs';

test('defensive test player can guard, dodge, counter and arrive at delayed observation intervals',()=>{
 for(const route of ['left','right']){
  for(const interval of [1/60,.1,.2,.25]){
    const world=createWorld(),session=createTouchPlaythroughSession();let guardSeen=false,dodgeSeen=false,blockSeen=false;
    for(let i=0;world.mode==='playing'&&i*interval<150;i++){
      const before=JSON.stringify(world),input=touchPlaythroughAction(world,route,session);
      assert.equal(JSON.stringify(world),before,'test policy only reads the world');
      advance(world,interval,input);
      guardSeen ||= world.player.state==='guard';
      dodgeSeen ||= Math.hypot(world.player.dodgeX,world.player.dodgeZ)>.5;
      blockSeen ||= world.events.some(e=>e.type==='block'||e.type==='parry');
    }
    assert.equal(world.mode,'victory',`${route} observation interval ${interval}`);
    assert.equal(world.totals.kills,3);assert.ok(guardSeen&&dodgeSeen&&blockSeen);
    assert.equal(world.routeChoice,route);assert.equal(world.routePhase,'rejoined');
  }
 }
});

test('separate observation, delivery and release delays preserve a usable touch route',()=>{
 for(const route of ['left','right']){
  for(const delay of [0,.1,.25,.5]){
    const world=createWorld(),session=createTouchPlaythroughSession();let held={x:0,z:0,guard:false},guardSeen=false,dodgeSeen=false,blockSeen=false;
    const elapse=(seconds,delivered=held)=>{
      for(let elapsed=0;elapsed<seconds-1e-9;elapsed+=1/60){
        advance(world,Math.min(1/60,seconds-elapsed),delivered);
        // A button press is delivered once. Guard and joystick survive until
        // their own contact is released, including while commands are pending.
        delivered={...delivered,attack:false,dodge:false,lock:false};
        guardSeen ||= world.player.state==='guard';
        dodgeSeen ||= Math.hypot(world.player.dodgeX,world.player.dodgeZ)>.5;
        blockSeen ||= world.events.some(e=>e.type==='block'||e.type==='parry');
      }
    };
    while(world.mode==='playing'&&world.time<150){
      const snapshot=JSON.stringify(world),a=touchPlaythroughAction(world,route,session);
      assert.equal(JSON.stringify(world),snapshot,'policy cannot mutate world');
      elapse(delay); // World continues while the observed decision is in flight.
      if(a.guard!==held.guard){
        elapse(delay);held.guard=a.guard; // Separate guard-contact command.
      }
      if(a.dodge||a.lock||a.attack){
        elapse(delay);
        const key=a.dodge?'dodge':a.lock?'lock':'attack';
        const beforePulse=world.totals.dodges;
        elapse(.05+delay,{...held,[key]:true});
        if(key==='dodge'&&a.dodgeNeedsAcknowledgement){
          for(let retry=0;world.mode==='playing'&&world.totals.dodges===beforePulse&&retry<18;retry++){
            elapse(.11);elapse(.05,{...held,dodge:true});
          }
        }
        elapse(.11); // Only this button is released; guard remains held.
      }else if(a.x||a.z){
        elapse(delay); // Start stick at its neutral centre.
        elapse(delay); // Separate movement command.
        elapse(.10+delay,{...held,x:a.x,z:a.z});
        elapse(.04);
      }else elapse(.08);
    }
    assert.equal(world.mode,'victory',`${route} delivery delay ${delay}`);
    assert.equal(world.totals.kills,3);assert.ok(guardSeen&&dodgeSeen&&blockSeen);
    assert.equal(world.routeChoice,route);assert.equal(world.routePhase,'rejoined');
  }
 }
});

test('left-retainer recovery retries until an observed dodge acknowledges it',()=>{
  const world=createWorld(),session=createTouchPlaythroughSession(),sentinel=world.enemies.find(enemy=>enemy.id==='sentinel');
  Object.assign(sentinel,{hp:0,state:'dead'});
  Object.assign(world,{routeChoice:'left',routeChoiceTime:20,routePhase:'branch',locked:'retainer'});
  Object.assign(world.player,{x:-2.55,z:-5.7,posture:40,dodgeX:0,dodgeZ:1});
  Object.assign(world.enemies.find(enemy=>enemy.id==='retainer'),{x:-3,z:-7.5});
  Object.assign(world.totals,{hits:3,received:1,kills:1,dodges:1});
  assert.equal(touchPlaythroughAction(world,'left',session).dodge,false,'entry counters establish the encounter baseline');
  world.totals.received++;
  const before=JSON.stringify(world),first=touchPlaythroughAction(world,'left',session);
  assert.equal(JSON.stringify(world),before,'test policy only reads the world');assert.equal(first.dodge,true);assert.equal(first.dodgeNeedsAcknowledgement,true);
  assert.equal(touchPlaythroughAction(world,'left',session).dodge,true,'a rejected pulse leaves recovery pending');
  world.totals.dodges++;
  assert.equal(touchPlaythroughAction(world,'left',session).dodge,false,'an observed dodge acknowledges recovery');
  world.totals.received++;
  assert.equal(touchPlaythroughAction(world,'left',session).dodge,false,'the encounter schedules only one recovery');
});

test('guarded retainer contact starts acknowledged recovery before a direct hit',()=>{
  const world=createWorld(),session=createTouchPlaythroughSession();
  Object.assign(world.enemies.find(enemy=>enemy.id==='sentinel'),{hp:0,state:'dead'});
  Object.assign(world.enemies.find(enemy=>enemy.id==='retainer'),{x:-3.15,z:-8.4});
  Object.assign(world,{time:24.18333333333324,routeChoice:'left',routeChoiceTime:23.766666666666598,
    routePhase:'branch',routeConsequence:'early-retainer',locked:'retainer'});
  Object.assign(world.player,{x:-2.55,z:-5.700225336253143,posture:34,dodgeX:0,dodgeZ:1});
  Object.assign(world.totals,{hits:3,received:1,kills:1,dodges:1});
  touchPlaythroughAction(world,'left',session);
  world.events=[{type:'block',time:world.time,source:'retainer',target:'player',x:world.player.x,z:world.player.z}];
  const action=touchPlaythroughAction(world,'left',session);
  assert.equal(action.dodge,true);assert.equal(action.dodgeNeedsAcknowledgement,true);assert.equal(action.guard,true);
});

test('deadline-driven recovery survives the modeled failed left encounter phase',()=>{
  const world=createWorld(),session=createTouchPlaythroughSession(),retainer=world.enemies.find(enemy=>enemy.id==='retainer');
  Object.assign(world.enemies.find(enemy=>enemy.id==='sentinel'),{hp:0,state:'dead'});
  // Player position/counters come from the artifact. The unsampled retainer
  // point models its authored 0.42-second pursuit after route commitment.
  // The recording shows the first direct hit before the lock HUD appears, so
  // this checkpoint must begin unlocked as the real failed run did.
  Object.assign(retainer,{x:-3.15,z:-8.4,state:'idle',age:24.18333333333324});
  Object.assign(world,{time:24.18333333333324,ticks:1451,routeChoice:'left',routeChoiceTime:23.766666666666598,
    routePhase:'branch',routeConsequence:'early-retainer',locked:null});
  Object.assign(world.player,{x:-2.55,z:-5.700225336253143,hp:76,posture:0,state:'idle',age:.2,dodgeX:0,dodgeZ:1});
  Object.assign(world.totals,{hits:3,received:1,parries:0,kills:1,dodges:1});
  let held={x:0,z:0,guard:false};const delay=.5;
  const elapse=(seconds,delivered=held)=>{
    for(let elapsed=0;elapsed<seconds-1e-9;elapsed+=1/60){
      advance(world,Math.min(1/60,seconds-elapsed),delivered);
      delivered={...delivered,attack:false,dodge:false,lock:false};
    }
  };
  while(world.mode==='playing'&&retainer.hp>0&&world.time<50){
    const action=touchPlaythroughAction(world,'left',session);elapse(delay);
    if(action.guard!==held.guard){elapse(delay);held.guard=action.guard;}
    if(action.dodge||action.lock||action.attack){
      const key=action.dodge?'dodge':action.lock?'lock':'attack',before=world.totals.dodges;elapse(delay);
      elapse(.05+delay,{...held,[key]:true});
      if(key==='dodge'&&action.dodgeNeedsAcknowledgement){
        for(let retry=0;world.mode==='playing'&&world.totals.dodges===before&&retry<18;retry++){
          elapse(.11);elapse(.05,{...held,dodge:true});
        }
      }
      elapse(.11);
    }else if(action.x||action.z){
      elapse(delay);elapse(delay);elapse(.10+delay,{...held,x:action.x,z:action.z});elapse(.04);
    }else elapse(.08);
  }
  assert.ok(world.player.hp>0,`player died before the retainer: ${JSON.stringify(world.totals)}`);
  assert.equal(retainer.hp,0,'the retainer must fall after the acknowledged recovery');
});
