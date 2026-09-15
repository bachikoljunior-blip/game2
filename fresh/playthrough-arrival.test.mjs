import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,advance,OBSTACLES} from './simulation.js';
import {canLightSignal} from './mission.js';
import {playthroughAction} from './playthrough-policy.mjs';
import {touchPlaythroughAction} from './touch-playthrough-policy.mjs';

// CI34957022718 / source7583f3b49f681091d2aaed5882b181e87d7ba012:
// both left-route recordings reached three kills, then remained on this shrine
// wall until the unchanged 180s browser deadline. Right-side mirrors exercise
// the same physical approach when a guard retreat ends on the other side.
const recordedStops=[
  {id:'desktop',x:-5.35,z:-19.815765033701993,hp:100},
  {id:'touch-left',x:-5.35,z:-19.519886611967728,hp:52},
];
const shrine=OBSTACLES.find(obstacle=>obstacle.kind==='shrine');
function clearedWorld(position){
  const world=createWorld();
  Object.assign(world,{routeChoice:position.x<0?'left':'right',routePhase:'rejoined',pathCleared:true});
  Object.assign(world.player,{x:position.x,z:position.z,hp:position.hp});
  world.enemies.forEach(enemy=>Object.assign(enemy,{hp:0,state:'dead'}));
  Object.assign(world.totals,{kills:3,hits:9});
  return world;
}
function shrineClearance(player){
  const x=Math.max(shrine.x-shrine.w/2,Math.min(shrine.x+shrine.w/2,player.x));
  const z=Math.max(shrine.z-shrine.d/2,Math.min(shrine.z+shrine.d/2,player.z));
  return Math.hypot(player.x-x,player.z-z);
}
for(const [name,policy] of [['keyboard',playthroughAction],['touch',touchPlaythroughAction]]){
  test(`${name} reaches the signal from recorded shrine-wall stops using only ordinary inputs`,()=>{
    for(const recorded of recordedStops)for(const side of [1,-1])for(const cadence of [1/60,.1,.25]){
      const world=clearedWorld({...recorded,x:recorded.x*side});
      const fixture=`${recorded.id}, side ${side}, cadence ${cadence}`;
      const initialHp=world.player.hp;
      for(let elapsed=0;elapsed<20&&world.mode==='playing';elapsed+=cadence){
        const before=JSON.stringify(world),action=policy(world,world.routeChoice);
        assert.equal(JSON.stringify(world),before,'the driver must only read state');
        assert.equal(action.targetId,null);assert.equal(action.attack,false);
        if(action.lock)assert.equal(canLightSignal(world),true,'the normal arrival gate must already permit a signal input');
        advance(world,cadence,action);
        assert.ok(shrineClearance(world.player)>=.35-1e-8,`no shrine collision bypass: ${fixture}`);
      }
      assert.equal(world.mode,'victory',fixture);
      assert.equal(world.signalLit,true);assert.equal(world.player.hp,initialHp);
      assert.equal(world.totals.kills,3);assert.equal(world.totals.swings,0);
      assert.ok(world.events.some(event=>event.type==='signal'),'normal lock input must emit the signal event');
    }
  });
}
