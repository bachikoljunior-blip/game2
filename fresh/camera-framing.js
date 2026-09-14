import {SIGNAL} from './mission.js';
import {ROUTE_FORK,isRouteId} from './route-layout.js';
import {groundHeightAt} from './terrain.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function usesRejoinVista(world){
  if(world.mode!=='playing'||world.routePhase!=='branch'||!isRouteId(world.routeChoice))return false;
  const routeEnemy=world.enemies.find(enemy=>enemy.id===ROUTE_FORK[world.routeChoice].enemyId);
  return routeEnemy?.hp<=0&&world.player.z<=ROUTE_FORK.obstacleBackZ+1.4;
}

export const usesArrivalFrame=world=>world.mode==='playing'&&world.pathCleared&&
  world.routePhase==='rejoined'&&!world.signalLit;

function signalFrame(world,aspect,out){
  const p=world.player,portrait=aspect<.8,wide=aspect>1.9;
  // The lateral offset keeps the unchanged signal position visible between the
  // authored shrine lattice while preserving the same frame through lighting.
  out.x=SIGNAL.x+(portrait?4:4.8);
  out.y=portrait?3.15:3.35;
  out.z=SIGNAL.z+(portrait?6.25:6.5);
  out.lookX=(p.x+SIGNAL.x)*.5-(wide?1.15:portrait?0:.7);
  out.lookY=1.55;
  out.lookZ=(p.z+SIGNAL.z)*.5-.25;
  return out;
}

// A solid landmark remains part of the world and collision map, but a post that
// sits very near the camera can cover a large fraction of a duel.  This pure
// test keeps the fade local to the near, forward-facing post instead of making
// the whole gate translucent.
export function foregroundObstacleOpacity(camera,focus,obstacle){
  const vx=focus.x-camera.x,vz=focus.z-camera.z,length=Math.hypot(vx,vz);
  if(length<.001)return 1;
  const px=obstacle.x-camera.x,pz=obstacle.z-camera.z,distance=Math.hypot(px,pz);
  const forward=(px*vx+pz*vz)/length;
  const lateral=Math.abs(px*vz-pz*vx)/length;
  return distance<=4.6&&forward>.15&&forward<length+1.5&&lateral<=2.65?.16:1;
}

export function computeCameraFrame(world,orbit,aspect,out){
  const p=world.player;
  const ground=groundHeightAt(p.x,p.z);
  if(world.mode==='victory'||usesArrivalFrame(world))return signalFrame(world,aspect,out);
  // After the chosen-route encounter, reveal both physical exits as the player
  // crosses their shared join. The solid ridge, route geometry and simulation
  // remain unchanged; only the authored camera moves above their silhouette.
  if(usesRejoinVista(world)){
    out.x=0;
    out.y=11.5;
    out.z=-7;
    out.lookX=0;
    out.lookY=.8;
    out.lookZ=ROUTE_FORK.rejoinZ;
    return out;
  }
  const target=world.enemies.find(enemy=>enemy.id===world.locked&&enemy.hp>0);
  if(target){
    const dx=target.x-p.x,dz=target.z-p.z,distance=Math.max(.001,Math.hypot(dx,dz));
    const nx=distance>.05?dx/distance:Math.sin(p.yaw??orbit),nz=distance>.05?dz/distance:-Math.cos(p.yaw??orbit);
    const portrait=aspect<.8;
    // Close duels need much stronger parallax: a distant over-shoulder camera
    // puts both bodies on almost the same screen ray even with a small offset.
    const close=clamp((5-distance)/3,0,1);
    const back=portrait?6.5-close*2.7:5.8-close*1.8;
    const side=portrait?1.25+close*1.45:clamp(1.55+aspect*.28,1.75,2.15)+close*1.95;
    const lead=Math.min(2.35,distance*.38);
    out.x=p.x-nx*back+nz*side;
    out.y=ground+(p.hp>0?3:2.5);
    out.z=p.z-nz*back-nx*side;
    out.lookX=p.x+nx*lead;
    out.lookY=ground+1.25;
    out.lookZ=p.z+nz*lead;
    return out;
  }
  const cos=Math.cos(orbit),sin=Math.sin(orbit);
  out.x=p.x+.85*cos+5.8*sin;
  out.y=ground+(p.hp>0?0:-.3)+2.8;
  out.z=p.z-.85*sin+5.8*cos;
  out.lookX=p.x;
  out.lookY=ground+1.25;
  out.lookZ=p.z-.6;
  return out;
}

// Position interpolation cuts through the duel when the lock bearing reverses.
// Interpolate the horizontal orbit and radius around a moving focus instead.
export function interpolateCameraFrame(current,wanted,dt,initialized){
  if(!initialized)return Object.assign(current,wanted);
  const alpha=1-Math.exp(-Math.max(0,Math.min(dt,.1))*8);
  const oldRadius=Math.hypot(current.x-current.lookX,current.z-current.lookZ);
  const newRadius=Math.hypot(wanted.x-wanted.lookX,wanted.z-wanted.lookZ);
  const oldAngle=Math.atan2(current.x-current.lookX,current.z-current.lookZ);
  const newAngle=Math.atan2(wanted.x-wanted.lookX,wanted.z-wanted.lookZ);
  const delta=Math.atan2(Math.sin(newAngle-oldAngle),Math.cos(newAngle-oldAngle));
  const angle=oldAngle+delta*alpha,radius=oldRadius+(newRadius-oldRadius)*alpha;
  for(const key of ['lookX','lookY','lookZ','y'])current[key]+=(wanted[key]-current[key])*alpha;
  current.x=current.lookX+Math.sin(angle)*radius;
  current.z=current.lookZ+Math.cos(angle)*radius;
  return current;
}
