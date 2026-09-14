import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance} from './simulation.js';
import {touchPlaythroughAction} from './touch-playthrough-policy.mjs';

test('defensive test player can guard, dodge, counter and arrive at delayed observation intervals',()=>{
 for(const route of ['left','right']){
  for(const interval of [1/60,.1,.2,.25]){
    const world=createWorld();let guardSeen=false,dodgeSeen=false,blockSeen=false;
    for(let i=0;world.mode==='playing'&&i*interval<150;i++){
      const before=JSON.stringify(world),input=touchPlaythroughAction(world,route);
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
    const world=createWorld();let held={x:0,z:0,guard:false},guardSeen=false,dodgeSeen=false,blockSeen=false;
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
      const snapshot=JSON.stringify(world),a=touchPlaythroughAction(world,route);
      assert.equal(JSON.stringify(world),snapshot,'policy cannot mutate world');
      elapse(delay); // World continues while the observed decision is in flight.
      if(a.guard!==held.guard){
        elapse(delay);held.guard=a.guard; // Separate guard-contact command.
      }
      if(a.dodge||a.lock||a.attack){
        elapse(delay);
        const key=a.dodge?'dodge':a.lock?'lock':'attack';
        elapse(.05+delay,{...held,[key]:true});
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
