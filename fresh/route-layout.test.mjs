import test from 'node:test';
import assert from 'node:assert/strict';
import {createWorld,stepWorld} from './simulation.js';
import {ROUTE_FORK,routeCenterAt,routeChoiceAt,routeLabel,routePathCenters,routePathLength} from './route-layout.js';

test('one approach physically divides outside the ridge and reconverges',()=>{
  assert.deepEqual(routePathCenters(0),[0]);
  const middle=routePathCenters(ROUTE_FORK.obstacle.z);
  assert.deepEqual(middle,[ROUTE_FORK.left.x,ROUTE_FORK.right.x]);
  const required=ROUTE_FORK.obstacle.w/2+.35;
  assert.ok(middle[0]<=-required&&middle[1]>=required,'both route centres clear collision plus actor radius');
  assert.ok(middle[0]+ROUTE_FORK.pathHalfWidth<=-required,'left stone surface stays outside the expanded ridge');
  assert.ok(middle[1]-ROUTE_FORK.pathHalfWidth>=required,'right stone surface stays outside the expanded ridge');
  assert.deepEqual(routePathCenters(-18),[0]);
  assert.equal(routeCenterAt('left',ROUTE_FORK.splitStartZ),0);
  assert.equal(routeCenterAt('right',ROUTE_FORK.rejoinZ),0);
});

test('each side has a distinct landmark and the wind-cloth path is the longer consequence',()=>{
  assert.equal(ROUTE_FORK.left.landmark,'石灯');assert.equal(ROUTE_FORK.right.landmark,'風布');
  assert.equal(ROUTE_FORK.left.markers.length,3);assert.equal(ROUTE_FORK.right.markers.length,3);
  assert.ok(routePathLength('right')>routePathLength('left'));
  assert.match(ROUTE_FORK.left.consequence,/早く対峙/);assert.match(ROUTE_FORK.right.consequence,/見渡す/);
});

test('route choice exists only beside the ridge and records its real position once',()=>{
  assert.equal(routeChoiceAt({x:-4,z:0}),null);assert.equal(routeChoiceAt({x:4,z:-18}),null);
  assert.equal(routeChoiceAt({x:-12,z:-9}),null);assert.equal(routeChoiceAt({x:12,z:-9}),null);
  assert.equal(routeChoiceAt({x:-3,z:-9}),'left');assert.equal(routeChoiceAt({x:3,z:-9}),'right');
  const w=createWorld();Object.assign(w.player,{x:-3,z:-5});stepWorld(w);
  assert.equal(w.routeChoice,'left');assert.deepEqual(w.routeChoicePosition,{x:w.player.x,z:w.player.z});
  const chosenAt=w.routeChoiceTime;Object.assign(w.player,{x:3,z:-9});stepWorld(w);
  assert.equal(w.routeChoice,'left');assert.equal(w.routeChoiceTime,chosenAt);
  assert.equal(w.events.filter(e=>e.type==='route').length,1);
});

test('unknown route ids are rejected instead of silently becoming the left route',()=>{
  assert.throws(()=>routeLabel('typo'),RangeError);
});

test('the ridge stops a central shortcut while both ordinary movement routes pass it',()=>{
  const central=createWorld();Object.assign(central.player,{x:0,z:ROUTE_FORK.obstacleFrontZ+.8});
  for(let i=0;i<240;i++)stepWorld(central,{z:-1});
  assert.ok(central.player.z>=ROUTE_FORK.obstacleFrontZ+.35-1e-7);assert.equal(central.routeChoice,null);
  for(const [route,x] of [['left',ROUTE_FORK.left.x],['right',ROUTE_FORK.right.x]]){
    const w=createWorld();Object.assign(w.player,{x,z:ROUTE_FORK.obstacleFrontZ+.8});
    for(let i=0;i<240;i++)stepWorld(w,{z:-1});
    assert.equal(w.routeChoice,route);assert.ok(w.player.z<ROUTE_FORK.obstacleBackZ-.35);
  }
});
