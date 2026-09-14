// Test-player decisions only. A recorded failure of the prior dodge-only route
// remains a failure; this additional defensive route does not modify game state.
import {playthroughAction} from './playthrough-policy.mjs';

export function touchPlaythroughAction(world) {
  const p=world.player,base=playthroughAction(world);
  const live=world.enemies.filter(e=>e.hp>0);
  const target=live.find(e=>e.id===world.locked)||live.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  if(!target)return {...base,guard:false,dodge:false};
  const d=Math.hypot(target.x-p.x,target.z-p.z);
  const ready=p.state==='idle'||p.state==='guard';
  // After a block has loaded posture, interrupt a newly starting windup instead
  // of holding guard until it breaks. A late windup still calls for defense.
  const opening=(target.state==='attack'&&target.age>.34)||target.state==='stagger'||target.state==='broken'||(target.state==='idle'&&target.cooldown>0)||
    (p.posture>0&&target.state==='windup'&&target.age<.3);
  const dodge=!Math.hypot(p.dodgeX,p.dodgeZ)&&ready&&target.state==='windup'&&target.age<.3&&d<2.4;
  return {...base,x:d>3?base.x:0,z:d>3?base.z:0,guard:d<=4.2,
    dodge,attack:ready&&d<=1.95&&opening};
}
