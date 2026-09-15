// Original shared height field. Mesh and placements use the same triangular surface.
export const TERRAIN = Object.freeze({width:160,depth:200,columns:64,rows:80,step:2.5});
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const smooth=t=>t*t*(3-2*t);
export function terrainVertexHeight(x,z){
  const edge=smooth(clamp((Math.abs(x)-5)/28,0,1));
  const ridge=4.3+Math.sin(z*.065+x*.07)*1.65+Math.sin(z*.13-x*.12)*.85;
  const shoulder=Math.exp(-((x+15)**2/100+(z-9)**2/330))*1.3;
  // Optional walks climb the valley shoulders and circle behind the shrine.
  // Their continuous slopes share this exact surface with actors and roots.
  const eastRise=Math.exp(-((x-29)**2/210+(z+6)**2/900))*2.5;
  const westHollow=Math.exp(-((x+28)**2/100+(z-6)**2/500))*.8;
  const backRise=smooth(clamp((-z-30)/14,0,1))*(1.5+Math.sin(x*.085)*.45);
  return Math.max(0,(ridge+shoulder+eastRise-westHollow)*edge+backRise);
}
export function groundHeightAt(x,z){
  const gx=clamp((x+80)/2.5,0,64-1e-9),gz=clamp((z+100)/2.5,0,80-1e-9);
  const ix=Math.floor(gx),iz=Math.floor(gz),u=gx-ix,v=gz-iz;
  const x0=-80+ix*2.5,z0=-100+iz*2.5;
  const a=terrainVertexHeight(x0,z0),b=terrainVertexHeight(x0+2.5,z0);
  const c=terrainVertexHeight(x0,z0+2.5),d=terrainVertexHeight(x0+2.5,z0+2.5);
  return u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v);
}
// A piecewise-affine surface reaches its rectangle maximum at a clipped
// triangle vertex. Include rectangle corners AND diagonal/edge intersections;
// sampling only corners would miss a ridge crossing the rectangle interior.
const boundHeights=new Float64Array((TERRAIN.columns+1)*(TERRAIN.rows+1)).fill(NaN);
function boundVertex(ix,iz){
  const index=iz*(TERRAIN.columns+1)+ix;
  if(Number.isNaN(boundHeights[index]))boundHeights[index]=terrainVertexHeight(-80+ix*2.5,-100+iz*2.5);
  return boundHeights[index];
}
export function maximumGroundInRect(minX,minZ,maxX,maxZ){
  if([minX,minZ,maxX,maxZ].some(Number.isNaN))return Infinity;
  const x0=clamp((Math.min(minX,maxX)+80)/2.5,0,64-1e-9),x1=clamp((Math.max(minX,maxX)+80)/2.5,0,64-1e-9);
  const z0=clamp((Math.min(minZ,maxZ)+100)/2.5,0,80-1e-9),z1=clamp((Math.max(minZ,maxZ)+100)/2.5,0,80-1e-9);
  let maximum=-Infinity;
  for(let iz=Math.floor(z0);iz<=Math.floor(z1);iz++)for(let ix=Math.floor(x0);ix<=Math.floor(x1);ix++){
    const left=Math.max(x0,ix)-ix,right=Math.min(x1,ix+1)-ix,bottom=Math.max(z0,iz)-iz,top=Math.min(z1,iz+1)-iz;
    const a=boundVertex(ix,iz),b=boundVertex(ix+1,iz),c=boundVertex(ix,iz+1),d=boundVertex(ix+1,iz+1);
    const visit=(u,v)=>{maximum=Math.max(maximum,u+v<=1?a+(b-a)*u+(c-a)*v:d+(c-d)*(1-u)+(b-d)*(1-v));};
    visit(left,bottom);visit(right,bottom);visit(left,top);visit(right,top);
    for(const u of [left,right]){const v=1-u;if(v>=bottom&&v<=top)visit(u,v);}
    for(const v of [bottom,top]){const u=1-v;if(u>=left&&u<=right)visit(u,v);}
  }
  // Outward rounding is conservative; it only makes rejection less eager.
  return maximum+Number.EPSILON*Math.max(1,Math.abs(maximum))*16;
}
groundHeightAt.maximumInRect=maximumGroundInRect;
export function shrineBaseSize(obstacle){return {width:obstacle.w,depth:obstacle.d,height:.56};}
