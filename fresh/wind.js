import { VEGETATION_ATTRIBUTES, VEGETATION_GLSL } from './vegetation-physics.js';
export { VEGETATION_ATTRIBUTES } from './vegetation-physics.js';
// A travelling, bounded wind field shared by stems, branches, grass, cloth and
// airborne leaves. Pressure is normalized dynamic pressure, not wind speed/Pa.
// Vegetation converts one unit to 4 Pa: this is a mild breeze, not a storm.
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
  const pressure=.46+.12*Math.sin(t*.47)+.04*Math.sin(t*.89+.7)+.02*Math.sin(t*1.31+x*.019-z*.027);
  const direction=.44+.10*Math.sin(t*.27)+.04*Math.sin(t*.73);
  return {x:Math.cos(direction)*pressure,z:Math.sin(direction)*pressure,pressure};
}
export function bendStem(point,root,height,time){
  const h=Math.max(0,point.y-root.y),u=clamp(h/height,0,1),wind=sampleWind(root.x,root.z,time-u*.32);
  const amplitude=height*.009*u*u,dx=wind.x*amplitude,dz=wind.z*amplitude;
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
  float pressure=.46+.12*sin(t*.47)+.04*sin(t*.89+.7)+.02*sin(t*1.31+p.x*.019-p.y*.027);
  float direction=.44+.10*sin(t*.27)+.04*sin(t*.73);
  return vec3(cos(direction)*pressure,sin(direction)*pressure,pressure);
}
vec3 stemWind(vec3 p,vec4 root){
  float h=max(0.,p.y-root.y),u=clamp(h/root.w,0.,1.);
  vec3 w=valleyWind(root.xz,windTime-u*.32);
  vec2 d=w.xy*(root.w*.009*u*u);
  return p+vec3(d.x,-dot(d,d)/max(.2,2.*h),d.y);
}`;
export const VEGETATION_TRANSFORM='transformed=windPosition;';
export const CLOTH_TRANSFORM=`
  float loose=clamp(-position.y/1.6,0.,1.);
  vec3 w=valleyWind(modelMatrix[3].xz,windTime-loose*.23);
  transformed.x+=w.x*.09*loose*loose;
  transformed.y-=.014*loose*loose;
  transformed.z+=loose*loose*(w.y*.3+sin(windTime*2.3-loose*5.+position.x*2.)*.065*w.z);`;
// Three blades retain their authored geometry/population, but have different
// bending modes. A damped response filters a travelling gust plus small eddies.
// The Jacobian below transports the normal through the very same displacement.
export const GRASS_GLSL=`
attribute float grassBlade;
float grassResponse(float t,float f,float phase,float omega){
  float r=f/omega,a=1.-r*r,b=1.1*r;
  return (a*sin(t*f+phase)-b*cos(t*f+phase))/(a*a+b*b);
}
void grassDeform(out vec3 p,out vec3 n){
  vec2 root=instanceMatrix[3].xz;
  float seed=dot(root,vec2(.71,1.13))+grassBlade*2.31,t=windTime-root.x*.055-root.y*.034,
    omega=12.+grassBlade*2.7+sin(seed),
    pressure=.46+.12*grassResponse(t,.47,0.,omega)+.04*grassResponse(t,.89,.7,omega)+.02*grassResponse(t,1.31,root.x*.019-root.y*.027,omega),
    ripple=.055*grassResponse(windTime,7.4+grassBlade*.8,seed,omega),
    direction=.44+.10*sin(t*.27)+.04*sin(t*.73),
    h=max(0.,position.y),flex=.19/(1.+grassBlade*.24);
  vec2 worldBend=vec2(cos(direction),sin(direction))*(pressure+ripple)*flex;
  vec2 axisX=normalize(vec2(instanceMatrix[0].x,instanceMatrix[0].z)),axisZ=normalize(vec2(instanceMatrix[2].x,instanceMatrix[2].z));
  vec2 d=vec2(dot(worldBend,axisX),dot(worldBend,axisZ));
  float shortening=dot(d,d)*h*h*h*2./3.,vertical=1.-2.*dot(d,d)*h*h;
  p=position+vec3(d.x*h*h,-shortening,d.y*h*h);
  n=normalize(vec3(normal.x,(normal.y-2.*h*dot(d,normal.xz))/vertical,normal.z));
}`;
export const GRASS_TRANSFORM='transformed=windPosition;';
export function installWindMaterial(material,clock,kind='vegetation'){
  material.onBeforeCompile=shader=>{
    shader.uniforms.windTime=clock;
    if(kind==='vegetation'){
      shader.uniforms.vegetationModes=clock.vegetation?.textureUniform??{value:null};
      shader.uniforms.vegetationModesSize=clock.vegetation?.textureSizeUniform??{value:null};
    }
    // Three's source begins with a preprocessor directive. Every injected
    // section must end its own line in both the visible and shadow programs.
    shader.vertexShader=WIND_GLSL+'\n'+(kind==='vegetation'?VEGETATION_ATTRIBUTES+VEGETATION_GLSL:kind==='grass'?GRASS_GLSL:'')+'\n'+shader.vertexShader;
    if(kind!=='cloth'){
      shader.vertexShader=shader.vertexShader.replace(/void main\(\)\s*\{/,`void main() {\nvec3 windPosition;vec3 windNormal;${kind==='grass'?'grassDeform':'vegetationDeform'}(windPosition,windNormal);\n`);
      shader.vertexShader=shader.vertexShader.replace('#include <beginnormal_vertex>','#include <beginnormal_vertex>\nobjectNormal=windNormal;\n');
    }
    shader.vertexShader=shader.vertexShader.replace('#include <begin_vertex>',
      '#include <begin_vertex>\n'+(kind==='cloth'?CLOTH_TRANSFORM:kind==='grass'?GRASS_TRANSFORM:VEGETATION_TRANSFORM));
  };
  material.customProgramCacheKey=()=>`valley-wind-v3-modal-${kind}`;
  return material;
}
