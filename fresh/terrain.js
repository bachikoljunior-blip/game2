// Original shared height field. Mesh and placements use the same triangular surface.
export const TERRAIN = Object.freeze({width:160,depth:200,columns:64,rows:80,step:2.5});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
export function terrainVertexHeight(x,z){
  const edge=smooth(clamp((Math.abs(x)-5)/28,0,1));
  const ridge=4.3+Math.sin(z*.065+x*.07)*1.65+Math.sin(z*.13-x*.12)*.85;
  const shoulder=Math.exp(-((x+15)**2/100+(z-9)**2/330))*1.3;
  return Math.max(0,(ridge+shoulder)*edge);
}
export function groundHeightAt(x,z){
  const gx=clamp((x+80)/2.5,0,64-1e-9),gz=clamp((z+100)/2.5,0,80-1e-9);
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
  const x0=-80+ix*2.5,z0=-100+iz*2.5;
  const a=terrainVertexHeight(x0,z0),b=terrainVertexHeight(x0+2.5,z0);
  const c=terrainVertexHeight(x0,z0+2.5),d=terrainVertexHeight(x0+2.5,z0+2.5);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
export function shrineBaseSize(obstacle){return {width:obstacle.w,depth:obstacle.d,height:.56};}
