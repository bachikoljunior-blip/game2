import * as T from 'three';
import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {ROUTE_FORK} from '../../../fresh/route-layout.js';
import {groundHeightAt} from '../../../fresh/terrain.js';
import {createForegroundVisibility} from '../../../fresh/foreground-visibility.js';
const root=new URL('../../../',import.meta.url),file=new URL('fresh/scene-art.js',root),sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const load=async source=>{
 const text=source.replace(/from '([^']+)'/g,(_,p)=>`from ${JSON.stringify(p.startsWith('.')?new URL(p,file).href:import.meta.resolve(p))}`);
 return import('data:text/javascript;base64,'+Buffer.from(text).toString('base64'));
};
const samples=[];
for(const revision of ['3622a5827fa196e7aeea25c89bfda4fde2dc51bd','613efa56fa3d2f43314212c21935c8f01ee4e914','working-tree']){
 const source=revision==='working-tree'?readFileSync(file,'utf8'):execFileSync('git',['show',revision+':fresh/scene-art.js'],{cwd:root,encoding:'utf8'});
 const {createSceneArt}=await load(source),scene=new T.Scene(),visibility=createForegroundVisibility(),started=performance.now(),art=createSceneArt(scene,visibility),rocks=art.addRidge(ROUTE_FORK.obstacle);
 const generationCpuMs=performance.now()-started;scene.updateMatrixWorld(true);
 let vertices=0,triangles=0;const meshes=[],upper=[];
 for(const mesh of rocks){const p=mesh.geometry.attributes.position;let minimum=Infinity,maximum=-Infinity,below=0;
  for(let i=0;i<p.count;i++){const x=p.getX(i),y=p.getY(i),z=p.getZ(i),gap=y-groundHeightAt(x,z);minimum=Math.min(minimum,gap);maximum=Math.max(maximum,gap);if(gap<0)below++;if(y>=.059)upper.push([x,y,z]);}
  vertices+=p.count;triangles+=(mesh.geometry.index?.count??p.count)/3;meshes.push({name:mesh.name,vertices:p.count,minimumGroundGap:minimum,maximumGroundGap:maximum,verticesBelowGround:below});
 }
 const ray=new T.Raycaster();ray.far=6;const rays=[];
 const cast=(name,origin,direction)=>{ray.set(new T.Vector3(...origin),new T.Vector3(...direction));const hits=ray.intersectObjects(rocks);rays.push({name,origin,direction,far:ray.far,hits:hits.length,first:hits[0]?.point.toArray()??null});};
 for(const y of [0,.025,.054,.056]){cast('left-'+y,[-3,y,-9.25],[1,0,0]);cast('right-'+y,[3,y,-9.25],[-1,0,0]);}
 cast('below-base',[-3,-.09,-9.25],[1,0,0]);cast('above-rock',[-3,3,-9.25],[1,0,0]);
 cast('outside-front',[-3,.025,-4.15],[1,0,0]);cast('outside-back',[-3,.025,-14.35],[1,0,0]);
 cast('toward-front',[0,.025,-3.25],[0,0,-1]);cast('toward-back',[0,.025,-15.25],[0,0,1]);
 const sides=rocks.map(mesh=>mesh.material.side);for(const mesh of rocks)mesh.material.side=T.DoubleSide;
 for(const y of [.025,.054,.056])cast('independent-DoubleSide-'+y,[-3,y,-9.25],[1,0,0]);
 rocks.forEach((mesh,i)=>mesh.material.side=sides[i]);
 upper.sort((a,b)=>a[0]-b[0]||a[1]-b[1]||a[2]-b[2]);
 samples.push({revision,sourceSha256:sha(source),generationCpuMs,meshCount:rocks.length,vertices,triangles,meshes,rays,upperVertexMultisetSha256:sha(JSON.stringify(upper))});
}
const old=samples[1],fixed=samples[2];
const result={scope:'Actual Node geometry, ground samples and triangle raycasts; no native WebGL/shadows or PS4 acceptance',samples,
 delta:{meshes:fixed.meshCount-old.meshCount,vertices:fixed.vertices-old.vertices,triangles:fixed.triangles-old.triangles},
 upperVerticesPreserved:old.upperVertexMultisetSha256===fixed.upperVertexMultisetSha256};
writeFileSync(new URL('contact-results.json',import.meta.url),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify({delta:result.delta,upperVerticesPreserved:result.upperVerticesPreserved,samples:samples.map(s=>({revision:s.revision,vertices:s.vertices,triangles:s.triangles,minimum:Math.min(...s.meshes.map(m=>m.minimumGroundGap)),rays:s.rays.map(r=>({name:r.name,hits:r.hits}))}))}));
