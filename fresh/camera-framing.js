const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function computeCameraFrame(world,orbit,aspect,out){
  const p=world.player;
  const target=world.enemies.find(enemy=>enemy.id===world.locked&&enemy.hp>0);
  if(target){
    const dx=target.x-p.x,dz=target.z-p.z,distance=Math.max(.001,Math.hypot(dx,dz));
    const nx=dx/distance,nz=dz/distance;
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
