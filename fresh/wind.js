// A travelling, bounded wind field shared by stems, branches, grass, cloth and
// airborne leaves. Secondary motion is delayed; nothing uses a random frame kick.
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export function createEnvironmentClock(){return {value:0,world:null,lastWorldTime:0};}
export function advanceEnvironmentClock(clock,world,seconds,animate=true){
  const reset=clock.world!==world||world.time<clock.lastWorldTime;
  if(reset)clock.value=world.time;
  clock.world=world;clock.lastWorldTime=world.time;
  if(animate)clock.value+=clamp(seconds,0,.1);
  return reset;
}
export function signalFlame(age){
  const u=clamp(age/.72,0,1),rise=u*u*(3-2*u);
  const breath=.96+.019*Math.sin(age*7.13)+.012*Math.sin(age*11.71+.6)+.008*Math.sin(age*3.17);
  return {light:Math.min(3.2,3.2*rise*breath),emissive:.36*rise*breath,
    opacity:.08*rise*breath,scale:1.9*(.87+.13*rise)+.018*rise*Math.sin(age*5.23)};
}
export function sampleWind(x,z,time){
  const t=time-x*.055-z*.034;
  const swell=.5+.5*Math.sin(t*.39+Math.sin(t*.17)*.7);
  const pressure=.48+swell*swell*.85+.12*Math.sin(t*1.13+x*.019-z*.027);
  const direction=.44+.18*Math.sin(t*.23)+.07*Math.sin(t*.61);
  return {x:Math.cos(direction)*pressure,z:Math.sin(direction)*pressure,pressure};
}
export function bendStem(point,root,height,time){
  const h=Math.max(0,point.y-root.y),u=clamp(h/height,0,1),wind=sampleWind(root.x,root.z,time-u*.32);
  const amplitude=height*.042*u*u,dx=wind.x*amplitude,dz=wind.z*amplitude;
  return {x:point.x+dx,y:point.y-(dx*dx+dz*dz)/Math.max(.2,2*h),z:point.z+dz};
}
export function clothDisplacement(x,y,time,worldX=0,worldZ=0){
  const loose=clamp(-y/1.6,0,1),wind=sampleWind(worldX,worldZ,time-loose*.23);
  return {x:wind.x*.09*loose*loose,y:-.014*loose*loose,
    z:loose*loose*(wind.z*.3+Math.sin(time*2.3-loose*5+x*2)*.065*wind.pressure)};
}
export const WIND_GLSL=`
uniform float windTime;
vec3 valleyWind(vec2 p,float time){
  float t=time-p.x*.055-p.y*.034;
  float swell=.5+.5*sin(t*.39+sin(t*.17)*.7);
  float pressure=.48+swell*swell*.85+.12*sin(t*1.13+p.x*.019-p.y*.027);
  float direction=.44+.18*sin(t*.23)+.07*sin(t*.61);
  return vec3(cos(direction)*pressure,sin(direction)*pressure,pressure);
}
vec3 stemWind(vec3 p,vec4 root){
  float h=max(0.,p.y-root.y),u=clamp(h/root.w,0.,1.);
  vec3 w=valleyWind(root.xz,windTime-u*.32);
  vec2 d=w.xy*(root.w*.042*u*u);
  return p+vec3(d.x,-dot(d,d)/max(.2,2.*h),d.y);
}`;
export const VEGETATION_ATTRIBUTES=`attribute vec4 windRoot; attribute vec4 windBranch; attribute vec4 windLeaf;`;
export const VEGETATION_TRANSFORM=`
  vec3 branchWind=valleyWind(windRoot.xz,windTime-.35);
  float reach=length(position.xz-windBranch.xz);
  float branchFlex=reach*reach*windBranch.w;
  transformed+=vec3(branchWind.x*.035,-branchWind.z*.028,branchWind.y*.035)*branchFlex;
  float flutter=sin(windTime*3.3-windLeaf.x*.51-windLeaf.z*.37)*windLeaf.w;
  transformed.y+=flutter*.025*branchWind.z;
  transformed=stemWind(transformed,windRoot);`;
export const CLOTH_TRANSFORM=`
  float loose=clamp(-position.y/1.6,0.,1.);
  vec3 w=valleyWind(modelMatrix[3].xz,windTime-loose*.23);
  transformed.x+=w.x*.09*loose*loose;
  transformed.y-=.014*loose*loose;
  transformed.z+=loose*loose*(w.y*.3+sin(windTime*2.3-loose*5.+position.x*2.)*.065*w.z);`;
export const GRASS_TRANSFORM=`
  vec3 w=valleyWind(instanceMatrix[3].xz,windTime-position.y*.2);
  float height=max(0.,position.y);
  vec2 d=w.xy*.16*height*height;
  vec2 axisX=normalize(vec2(instanceMatrix[0].x,instanceMatrix[0].z));
  vec2 axisZ=normalize(vec2(instanceMatrix[2].x,instanceMatrix[2].z));
  transformed.x+=dot(d,axisX);transformed.z+=dot(d,axisZ);
  transformed.y-=dot(d,d)/max(.2,height*2.);`;
export function installWindMaterial(material,clock,kind='vegetation'){
  material.onBeforeCompile=shader=>{
    shader.uniforms.windTime=clock;
    shader.vertexShader=WIND_GLSL+(kind==='vegetation'?VEGETATION_ATTRIBUTES:'')+shader.vertexShader;
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n'+(kind==='cloth'?CLOTH_TRANSFORM:kind==='grass'?GRASS_TRANSFORM:VEGETATION_TRANSFORM));
  };
  material.customProgramCacheKey=()=>`valley-wind-v2-${kind}`;
  return material;
}
