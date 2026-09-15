// Test driver only: reads a diagnostic snapshot; never writes game state.
import { SIGNAL, canLightSignal } from './mission.js';
import { ROUTE_FORK, routeEncounterActive, routeTravelGoal } from './route-layout.js';
import { OBSTACLES } from './simulation.js';
const shrine=OBSTACLES.find(obstacle=>obstacle.kind==='shrine');
function signalApproachGoal(position){
  // A guarded retreat can finish beside the solid shrine. Clear its front
  // before crossing toward the lamp; aiming straight at the lamp pushes into
  // the side wall. The front waypoint is inside the unchanged signal radius.
  const frontZ=shrine.z+shrine.d/2+1.1;
  const beside=Math.abs(position.x-shrine.x)>shrine.w/2;
  return {x:beside&&position.z<frontZ-.25?position.x:SIGNAL.x,z:frontZ};
}
export function playthroughAction(world, preferredRoute='left') {
  const p=world.player;
  const live=world.enemies.filter(e=>e.hp>0&&routeEncounterActive(world.routePhase,world.routeChoice,e.id));
  const locked=live.find(e=>e.id===world.locked);
  const nearest=live.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  const nearestDistance=nearest?Math.hypot(nearest.x-p.x,nearest.z-p.z):Infinity;
  const sentinelCleared=!world.enemies.some(e=>e.id==='sentinel'&&e.hp>0);
  const route=world.routeChoice||preferredRoute;
  const authoredGoal=sentinelCleared?routeTravelGoal(p,route):null;
  const threatBoundary=ROUTE_FORK.obstacle.w/2-.25;
  const outerBoundary=route==='right'?ROUTE_FORK.right.x+1.7:ROUTE_FORK.left.x-1.7;
  const withinOuterBoundary=enemy=>route==='right'?enemy.x<=outerBoundary:enemy.x>=outerBoundary;
  const sameSideThreat=nearest&&nearestDistance<=3.2&&
    (route==='right'?nearest.x>=threatBoundary:nearest.x<=-threatBoundary)&&withinOuterBoundary(nearest);
  const routeGoal=authoredGoal&&!locked&&!sameSideThreat?authoredGoal:null;
  const target=routeGoal?null:locked||nearest;
  const arrivalGoal=world.pathCleared&&!canLightSignal(world)?signalApproachGoal(p):null;
  const goal=routeGoal||target||arrivalGoal||SIGNAL,dx=goal.x-p.x,dz=goal.z-p.z,d=Math.hypot(dx,dz);
  const move=d>(target?1.75:.18),axisThreshold=routeGoal?.1:.25;
  return {x:move&&Math.abs(dx)>axisThreshold?Math.sign(dx):0,z:move&&Math.abs(dz)>axisThreshold?Math.sign(dz):0,
    lock:target?!world.locked&&d<10:!routeGoal&&canLightSignal(world),
    attack:!!target&&d<=1.95&&p.state==='idle',routeNavigating:!!routeGoal,targetId:target?.id??null};
}
