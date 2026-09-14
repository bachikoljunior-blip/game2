// Test driver only: reads a diagnostic snapshot; never writes game state.
import { SIGNAL } from './mission.js';
export function playthroughAction(world) {
  const p=world.player;
  const target=world.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z))[0];
  const goal=target||SIGNAL,dx=goal.x-p.x,dz=goal.z-p.z,d=Math.hypot(dx,dz);
  const move=d>(target?1.75:.6);
  return {x:move&&Math.abs(dx)>.25?Math.sign(dx):0,z:move&&Math.abs(dz)>.25?Math.sign(dz):0,
    lock:target?!world.locked&&d<10:world.pathCleared&&d<=SIGNAL.radius,
    attack:!!target&&d<=1.95&&p.state==='idle'};
}
