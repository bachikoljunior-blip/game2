import {SIGNAL} from './mission.js';
const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function computeCameraFrame(world,orbit,aspect,out){
  const p=world.player;
  if(world.mode==='victory'){
    const portrait=aspect<.8;
    const wide=aspect>1.9;
    out.x=SIGNAL.x+(portrait?2.4:3.2);
    out.y=portrait?3.15:3.35;
    out.z=SIGNAL.z+(portrait?6.25:6.5);
    out.lookX=(p.x+SIGNAL.x)*.5-(wide?1.15:portrait?0:.7);
    out.lookY=1.55;
    out.lookZ=(p.z+SIGNAL.z)*.5-.25;
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
    out.y=p.hp>0?3:2.5;
    out.z=p.z-nz*back-nx*side;
    out.lookX=p.x+nx*lead;
    out.lookY=1.25;
    out.lookZ=p.z+nz*lead;
    return out;
  }
  const cos=Math.cos(orbit),sin=Math.sin(orbit);
  out.x=p.x+.85*cos+5.8*sin;
  out.y=(p.hp>0?0:-.3)+2.8;
  out.z=p.z-.85*sin+5.8*cos;
  out.lookX=p.x;
  out.lookY=1.25;
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
