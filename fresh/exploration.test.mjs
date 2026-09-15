import test from 'node:test';
import assert from 'node:assert/strict';
import {EXPLORATION,advanceExploration,constrainExplorationPosition,createExplorationState,explorationText,isExplorationWalkable} from './exploration.js';
import {groundHeightAt} from './terrain.js';
import {createWorld,OBSTACLES} from './simulation.js';

function* walkSamples(walk,reverse=false){
  const nodes=reverse?[...walk.nodes].reverse():walk.nodes;
  yield nodes[0];
  for(let i=1;i<nodes.length;i++){
    const a=nodes[i-1],b=nodes[i],steps=Math.ceil(Math.hypot(b.x-a.x,b.z-a.z)/(3.8/60));
    for(let n=1;n<=steps;n++)yield {x:a.x+(b.x-a.x)*n/steps,z:a.z+(b.z-a.z)*n/steps};
  }
}
test('every old battle-space coordinate remains traversable without moving the mission or its three enemies',()=>{
  for(let x=-13;x<=13;x+=.5)for(let z=-28;z<=23;z+=.5){
    const p={x,z};assert.equal(constrainExplorationPosition(p),p);assert.deepEqual(p,{x,z});
  }
  const world=createWorld();
  assert.deepEqual(world.enemies.map(e=>[e.id,e.x,e.z]),[['sentinel',0,1],['retainer',-3,-9],['warden',3,-16]]);
});
test('three side circuits can be walked in both directions with continuous feet, clear sightline props and no mission obstacle crossing',()=>{
  for(const walk of EXPLORATION.loops)for(const reverse of [false,true]){
    let previous=null;
    for(const p of walkSamples(walk,reverse)){
      assert.equal(isExplorationWalkable(p.x,p.z),true,`${walk.id} path is within its actual movement region`);
      const moved={...p};constrainExplorationPosition(moved);assert.deepEqual(moved,p);
      for(const obstacle of OBSTACLES){
        const dx=Math.max(0,Math.abs(p.x-obstacle.x)-obstacle.w/2),dz=Math.max(0,Math.abs(p.z-obstacle.z)-obstacle.d/2);
        assert.ok(Math.hypot(dx,dz)>=.35,`${walk.id} does not cross ${obstacle.kind}`);
      }
      const y=groundHeightAt(p.x,p.z);
      if(previous){
        const distance=Math.hypot(p.x-previous.x,p.z-previous.z);
        assert.ok(distance<=3.8/60+1e-7);
        assert.ok(Math.abs(y-previous.y)<=distance*.72+1e-7,'slope is a walk, not a vertical step');
      }
      previous={...p,y};
    }
  }
});
test('the expanded area has authored banks rather than allowing an empty larger rectangle',()=>{
  assert.equal(isExplorationWalkable(-28,14),true);
  assert.equal(isExplorationWalkable(34,-2),true);
  assert.equal(isExplorationWalkable(0,-48),true);
  for(const [x,z] of [[-38,25],[40,25],[-30,-45],[35,-45],[0,-55]])assert.equal(isExplorationWalkable(x,z),false);
  const p={x:-80,z:100};constrainExplorationPosition(p);assert.equal(isExplorationWalkable(p.x,p.z),true);
});
test('a normal-speed circuit discovers two distinct places, completes once and never changes combat values',()=>{
  for(const walk of EXPLORATION.loops)for(const reverse of [false,true]){
    const world=createWorld();world.exploration=createExplorationState();
    const before=JSON.stringify({hp:world.player.hp,enemies:world.enemies,totals:world.totals});
    for(const p of walkSamples(walk,reverse)){
      Object.assign(world.player,p);world.time+=1/60;advanceExploration(world,1/60);
    }
    assert.deepEqual([...world.exploration.discovered].sort(),[...walk.discoveries].sort());
    assert.deepEqual(world.exploration.completed,[walk.id]);
    assert.equal(world.events.filter(event=>event.type==='discovery').length,2);
    assert.equal(world.events.filter(event=>event.type==='environment-encounter').length,2);
    assert.equal(world.events.filter(event=>event.type==='exploration-loop').length,1);
    assert.equal(JSON.stringify({hp:world.player.hp,enemies:world.enemies,totals:world.totals}),before);
    for(const p of walkSamples(walk,reverse)){Object.assign(world.player,p);advanceExploration(world,1/60);}
    assert.equal(world.events.filter(event=>event.type==='discovery').length,2);
    assert.equal(world.events.filter(event=>event.type==='exploration-loop').length,1);
  }
});
test('abandoning an entrance or partial walk still permits a complete circuit from the opposite entrance',()=>{
  for(const walk of EXPLORATION.loops)for(const reverse of [false,true])for(const partial of [false,true]){
    const world=createWorld();world.exploration=createExplorationState();
    const nodes=reverse?[...walk.nodes].reverse():walk.nodes,first=nodes[0],last=nodes.at(-1);
    const visit=positions=>{
      for(const p of positions){
        Object.assign(world.player,p);world.time+=1/60;advanceExploration(world,1/60);
      }
    };
    visit([first]);
    if(partial)visit(walkSamples({nodes:[first,nodes[1],first]}));
    // Use the central corridor to reach the other entrance, reproducing an
    // abandoned visit without visiting the intervening circuit checkpoints.
    visit(walkSamples({nodes:[first,{x:first.x,z:-17},{x:last.x,z:-17},last]}));
    assert.equal(world.exploration.completed.includes(walk.id),false);
    visit(walkSamples(walk,!reverse));
    assert.deepEqual([...world.exploration.discovered].sort(),[...walk.discoveries].sort());
    assert.deepEqual(world.exploration.completed,[walk.id]);
    assert.equal(world.events.filter(e=>e.type==='exploration-loop'&&e.loop===walk.id).length,1);
    // Staying in the terminal entrance, then doing another full circuit, must
    // neither reset a completed walk nor emit a duplicate completion.
    visit(Array.from({length:120},()=>first));
    visit(walkSamples(walk,reverse));
    assert.deepEqual(world.exploration.completed,[walk.id]);
    assert.equal(world.events.filter(e=>e.type==='exploration-loop'&&e.loop===walk.id).length,1);
  }
});
test('discoveries need a living visitor and dwell; pause and retry cannot carry or manufacture progress',()=>{
  const world=createWorld(),place=EXPLORATION.points[0];world.exploration=createExplorationState();
  Object.assign(world.player,{x:place.x,z:place.z});
  advanceExploration(world,.4);assert.equal(world.exploration.discovered.length,0);
  world.mode='paused';advanceExploration(world,5);assert.equal(world.exploration.discovered.length,0);
  world.mode='playing';world.player.hp=0;advanceExploration(world,5);assert.equal(world.exploration.discovered.length,0);
  world.player.hp=100;advanceExploration(world,.4);assert.deepEqual(world.exploration.discovered,[place.id]);
  assert.match(explorationText(world),new RegExp(place.name));
  assert.deepEqual(createExplorationState().discovered,[]);
});
