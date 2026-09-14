import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance} from './simulation.js';
import {touchPlaythroughAction} from './touch-playthrough-policy.mjs';

test('defensive test player can guard, dodge, counter and arrive at delayed observation intervals',()=>{
  for(const interval of [1/60,.1,.2,.25]){
    const world=createWorld();let guardSeen=false,dodgeSeen=false,blockSeen=false;
    for(let i=0;world.mode==='playing'&&i*interval<150;i++){
      const before=JSON.stringify(world),input=touchPlaythroughAction(world);
      assert.equal(JSON.stringify(world),before,'test policy only reads the world');
      advance(world,interval,input);
      guardSeen ||= world.player.state==='guard';
      dodgeSeen ||= Math.hypot(world.player.dodgeX,world.player.dodgeZ)>.5;
      blockSeen ||= world.events.some(e=>e.type==='block'||e.type==='parry');
    }
    assert.equal(world.mode,'victory',`observation interval ${interval}`);
    assert.equal(world.totals.kills,3);assert.ok(guardSeen&&dodgeSeen&&blockSeen);
  }
});
