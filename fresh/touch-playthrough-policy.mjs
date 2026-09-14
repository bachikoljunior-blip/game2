// Test-player decisions only. A recorded failure of the prior dodge-only route
// remains a failure; this additional defensive route does not modify game state.
import {playthroughAction} from './playthrough-policy.mjs';

export function touchPlaythroughAction(world) {
  const p=world.player,base=playthroughAction(world);
  const live=world.enemies.filter(e=>e.hp>0);
  const target=live.find(e=>e.id===world.locked)||live.sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  if(!target)return {...base,guard:false,dodge:false};
  const d=Math.hypot(target.x-p.x,target.z-p.z);
  // Inputs arrive after the observed frame. Establish spacing before close
  // contact, then guard a strike and press the attack instead of waiting for a
  // narrow animation window which may have expired by delivery time.
  const press=p.posture>0||world.totals.hits>0;
  const dodge=!Math.hypot(p.dodgeX,p.dodgeZ)&&d<3;
  return {...base,x:d>3?base.x:0,z:d>3?base.z:0,guard:d<=4.2,
    dodge,attack:press&&d<=1.95};
}
