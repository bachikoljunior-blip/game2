// Export actual production pose/geometry for the explicitly non-WebGL CPU
// diagnostic renderer. Native CI remains the acceptance media.
import * as T from 'three';
import {writeFileSync,mkdirSync} from 'node:fs';
import {createCharacterRig} from '../character-rig.js';
import {updateCharacterRig} from '../character-motion.js';
const rig=createCharacterRig('player'),actor={id:'player',x:0,z:0,yaw:0,hp:100,state:'idle',age:0},world={time:0,mode:'playing',events:[]};
for(let i=0;i<24;i++){world.time+=1/60;actor.age+=1/60;updateCharacterRig(rig,actor,world,1/60);}
const textureNames={'mpfb-cc0-skin':'head','mpfb-cc0-eyes':'eyes','mpfb-cc0-hair':'hair','mpfb-cc0-eyebrows':'brows'},parts=[];
for(const group of [rig.body,rig.sword])group.traverseVisible(node=>{
  if(!node.isMesh)return;const geometry=node.geometry.clone().applyMatrix4(node.matrixWorld),a=geometry.attributes;
  const data={position:Array.from(a.position.array),normal:Array.from(a.normal.array),uv:a.uv?Array.from(a.uv.array):Array(a.position.count*2).fill(0),
    index:geometry.index?Array.from(geometry.index.array):Array.from({length:a.position.count},(_,i)=>i)};
  if(a.color)data.color=Array.from(a.color.array);
  const color=node.material.color.getRGB({},T.SRGBColorSpace);
  parts.push([data,textureNames[node.material.name]||null,[color.r,color.g,color.b]]);geometry.dispose();
});
mkdirSync('.pilot-inspection',{recursive:true});
writeFileSync('.pilot-inspection/production-rig.json',JSON.stringify({parts,head:rig.neck.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.13,-.035)).toArray(),
  hand:rig.sword.localToWorld(new T.Vector3(0,-.06,0)).toArray()}));
console.log('Exported actual production geometry and idle transforms for CPU inspection');
