import {readFileSync,writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {performance} from 'node:perf_hooks';
const root=new URL('../../../',import.meta.url),file=new URL('fresh/presentation.js',root);
const moduleUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const three=moduleUrl(`export * from ${JSON.stringify(import.meta.resolve('three'))}; export class WebGLRenderer{constructor(){this.shadowMap={};}setPixelRatio(){}setSize(){}render(){}}`);
const context=new Proxy({createRadialGradient:()=>({addColorStop(){}})},{get:(o,k)=>o[k]??(()=>{})});
Object.assign(globalThis,{document:{createElement:()=>({getContext:()=>context})},innerWidth:1280,innerHeight:720,devicePixelRatio:1});
const fingerprint=array=>createHash('sha256').update(Buffer.from(array.buffer,array.byteOffset,array.byteLength)).digest('hex');
const base='3622a5827fa196e7aeea25c89bfda4fde2dc51bd';
const previousScene=moduleUrl(execFileSync('git',['show',base+':fresh/scene-art.js'],{cwd:root,encoding:'utf8'}).replace(/from '([^']+)'/g,(_,p)=>`from ${JSON.stringify(p.startsWith('.')?new URL(p,file).href:import.meta.resolve(p))}`));
async function run(source,tag){
 const resolved=source.replace(/from '([^']+)'/g,(_,p)=>`from ${JSON.stringify(p==='three'?three:tag==='baseline'&&p==='./scene-art.js'?previousScene:p.startsWith('.')?new URL(p,file).href:import.meta.resolve(p))}`);
 const {createPresentation}=await import(moduleUrl(resolved)),samples=[];let last;
 for(let i=0;i<3;i++){
  const started=performance.now(),view=createPresentation({}),duration=performance.now()-started;
  const result={cpuGenerationMs:duration,meshCount:0,vertexCount:0,triangleInstances:0,uniqueGeometryVertices:0,vegetation:[],sceneArt:view.scene.userData.sceneArt??null};
  const geometries=new Set();view.scene.traverse(mesh=>{
   if(!mesh.isMesh)return;const g=mesh.geometry,count=g.attributes.position.count,instances=mesh.isInstancedMesh?mesh.count:1;
   result.meshCount++;result.vertexCount+=count*instances;result.triangleInstances+=(g.index?g.index.count:count)/3*instances;
   if(!geometries.has(g)){geometries.add(g);result.uniqueGeometryVertices+=count;}
   if(mesh.name.startsWith('bamboo-leaves-')||mesh.name.startsWith('maple-leaves-')||g.attributes.windSupport)result.vegetation.push({name:mesh.name,position:fingerprint(g.attributes.position.array)});
   if(g.attributes.position.count===5265)result.groundPosition=fingerprint(g.attributes.position.array);
  });samples.push(result);last=view;
 }
 if(true){
  const surfaces=[];last.scene.traverse(mesh=>{
   if(!mesh.name.startsWith('route-rock-stratum-'))return;
   const g=mesh.geometry,m=mesh.material;surfaces.push({name:mesh.name,positions:Array.from(g.attributes.position.array),normals:Array.from(g.attributes.normal.array),colors:Array.from(g.attributes.color.array),indices:g.index?Array.from(g.index.array):null,color:m.color.toArray()});
  });writeFileSync(new URL(tag+'-surfaces.json',import.meta.url),JSON.stringify(surfaces));
 }
 return {samples,medianCpuGenerationMs:samples.map(s=>s.cpuGenerationMs).sort((a,b)=>a-b)[1]};
}
const baseline=await run(execFileSync('git',['show',base+':fresh/presentation.js'],{cwd:root,encoding:'utf8'}),'baseline');
const candidate=await run(readFileSync(file,'utf8'),'candidate');
const a=baseline.samples[0],b=candidate.samples[0];
const report={base,kind:'Node CPU construction and geometry inspection; Canvas2D/WebGL stubs; not GPU, device or game render',baseline,candidate,delta:Object.fromEntries(['meshCount','vertexCount','triangleInstances','uniqueGeometryVertices'].map(k=>[k,b[k]-a[k]])),vegetationPositionEqual:JSON.stringify(a.vegetation)===JSON.stringify(b.vegetation),groundPositionEqual:a.groundPosition===b.groundPosition};
writeFileSync(new URL('measurements.json',import.meta.url),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({baseline:{meshCount:a.meshCount,vertexCount:a.vertexCount,triangles:a.triangleInstances,cpuMs:baseline.medianCpuGenerationMs,sceneArt:a.sceneArt},candidate:{meshCount:b.meshCount,vertexCount:b.vertexCount,triangles:b.triangleInstances,cpuMs:candidate.medianCpuGenerationMs,sceneArt:b.sceneArt},delta:report.delta,vegetationPositionEqual:report.vegetationPositionEqual,groundPositionEqual:report.groundPositionEqual}));
