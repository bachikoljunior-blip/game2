// Export actual production pose/geometry for the explicitly non-WebGL CPU
// diagnostic renderer. Native CI remains the acceptance media.
import * as T from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createCharacterRig} from '../character-rig.js';
import {updateCharacterRig} from '../character-motion.js';
const id=process.env.CHARACTER_INSPECTION_ID||'player';
const rig=createCharacterRig(id),actor={id,x:0,z:0,yaw:0,hp:100,state:'idle',age:0},world={time:0,mode:'playing',events:[]};
const study=process.argv[2]||'idle',studyFrame=Number(process.argv[3]||'14');
const directedState=process.env.CHARACTER_INSPECTION_STATE,directedAge=Number(process.env.CHARACTER_INSPECTION_AGE||'.3');
if(directedState){
  actor.state=directedState==='victory'?'idle':directedState;actor.hp=directedState==='dead'?0:100;world.mode=directedState==='victory'?'victory':directedState==='dead'?'defeat':'playing';
  for(let t=0;t<=directedAge+1e-8;t+=1/60){actor.age=t;world.time=t;updateCharacterRig(rig,actor,world,1/60);}
}
else if(study==='idle')for(let i=0;i<24;i++){world.time+=1/60;actor.age+=1/60;updateCharacterRig(rig,actor,world,1/60);}
else for(let i=0;i<=studyFrame;i++){
  world.time+=1/12;actor.age=i/12;
  if(study==='run')actor.z=-Math.min(2.5,Math.max(0,i/12-.45))*3.8;
  if(study==='death'){actor.state='dead';actor.hp=0;world.mode='defeat';}
  updateCharacterRig(rig,actor,world,1/12);
}
const textureNames={'mpfb-cc0-skin':'head','mpfb-cc0-eyes':'eyes','mpfb-cc0-hair':'hair','mpfb-cc0-eyebrows':'brows'},parts=[];
for(const group of [rig.body,rig.sword])group.traverseVisible(node=>{
  if(!node.isMesh)return;const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld),a=geometry.attributes;
  const data={position:Array.from(a.position.array),normal:Array.from(a.normal.array),uv:a.uv?Array.from(a.uv.array):Array(a.position.count*2).fill(0),
    index:geometry.index?Array.from(geometry.index.array):Array.from({length:a.position.count},(_,i)=>i),twoSided:node.material.side===T.DoubleSide};
  if(a.color)data.color=Array.from(a.color.array);
  const color=node.material.color.getRGB({},T.SRGBColorSpace);
  parts.push([data,textureNames[node.material.name]||null,[color.r,color.g,color.b]]);geometry.dispose();
});
mkdirSync('.pilot-inspection',{recursive:true});
const suffix=(id==='player'?'':`-${id}`)+(directedState?`-${directedState}-${directedAge}`:study==='idle'?'':`-${study}-${studyFrame}`);
writeFileSync(`.pilot-inspection/production-rig${suffix}.json`,JSON.stringify({parts,suffix,study:directedState||study,detailed:!!directedState||study==='idle',center:[actor.x,.94,actor.z],head:rig.neck.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.13,-.035)).toArray(),
  hand:rig.sword.localToWorld(new T.Vector3(0,-.06,0)).toArray()}));
console.log(`Exported actual production geometry and ${directedState||study} transforms for CPU inspection`);
