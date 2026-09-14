// Test-player decisions only. A recorded failure of the prior dodge-only route
// remains a failure; this additional defensive route does not modify game state.
import {playthroughAction} from './playthrough-policy.mjs';

export function touchPlaythroughAction(world, preferredRoute='left') {
  const p=world.player,base=playthroughAction(world,preferredRoute);
  const live=world.enemies.filter(e=>e.hp>0);
  const target=live.find(e=>e.id===base.targetId);
  if(!target)return {...base,guard:false,dodge:false};
  const d=Math.hypot(target.x-p.x,target.z-p.z);
  // Inputs arrive after the observed frame. Establish spacing before close
  // contact, then guard a strike and press the attack instead of waiting for a
  // narrow animation window which may have expired by delivery time.
  const missedContactRecovery=p.state==='guard'&&p.guardAge>=2&&target.state==='windup';
  const press=p.posture>0||world.totals.hits>0||missedContactRecovery;
  // Read each stance rather than repeating defensive inputs: one spacing
  // dodge remains sufficient, the quick retainer is traded with after the
  // first posture contact, and the heavier opponents are held on guard.
  // These predicates are world-derived and cannot write or shortcut state.
  const dodge=!Math.hypot(p.dodgeX,p.dodgeZ)&&d<3;
  const guard=d<=4.2&&(target.id!=='retainer'||p.posture<20);
  return {...base,x:d>3?base.x:0,z:d>3?base.z:0,guard,
    dodge,attack:press&&d<=1.95};
}
