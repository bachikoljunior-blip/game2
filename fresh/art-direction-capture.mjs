// Matched native image evidence for authored surfaces. This is an inspection
// rig, not ordinary play, a physical-device benchmark or blind reference media.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const repo=resolve(new URL('..',import.meta.url).pathname);
const moduleRoot=resolve(process.env.ART_SOURCE_ROOT||repo);
const out=resolve(process.env.ART_OUTPUT||resolve(repo,'AI_DEVELOPMENT/EVIDENCE/fresh-20260915-art'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:moduleRoot,encoding:'utf8'}).trim();
const temp=await mkdtemp(resolve(repo,'.art-inspection-'));
await mkdir(out,{recursive:true});
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#222a2d}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="scene"></canvas><script type="module">
import * as T from 'three';
import {createCharacterRig,createCharacterResources} from '/@fs/${moduleRoot}/fresh/character-rig.js';
import {updateCharacterRig} from '/@fs/${moduleRoot}/fresh/character-motion.js';
const canvas=document.querySelector('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true});
renderer.setPixelRatio(1);renderer.setSize(innerWidth,innerHeight);renderer.shadowMap.enabled=true;
renderer.shadowMap.type=T.PCFSoftShadowMap;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.02;
const scene=new T.Scene();scene.background=new T.Color('#404d51');
scene.add(new T.HemisphereLight('#bdccda','#3c3830',1.55));
const key=new T.DirectionalLight('#ffe2bc',3.4);key.position.set(-3,5,-4);key.castShadow=true;
key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-2,right:2,top:3,bottom:-1,near:.1,far:20});
key.shadow.camera.updateProjectionMatrix();key.shadow.bias=-.0002;key.shadow.normalBias=.008;scene.add(key,key.target);
const rim=new T.DirectionalLight('#bdccd8',1.35);rim.position.set(3,3,3);scene.add(rim);
const floor=new T.Mesh(new T.PlaneGeometry(30,30),new T.MeshStandardMaterial({color:'#515a59',roughness:.93}));
floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;scene.add(floor);
const camera=new T.PerspectiveCamera(38,innerWidth/innerHeight,.01,40),resources=createCharacterResources();
await resources.ready;
let rig,actor,world;const rigs=new Map();
function reset(id){if(rig)rig.root.visible=false;if(!rigs.has(id)){const created=createCharacterRig(id,resources);rigs.set(id,created);scene.add(created.root);}rig=rigs.get(id);rig.root.visible=true;
 actor={id,x:0,z:0,yaw:0,hp:100,state:'idle',age:0,stride:0};world={time:0,mode:'playing',events:[]};
 for(let i=0;i<24;i++){world.time+=1/60;actor.age+=1/60;updateCharacterRig(rig,actor,world,1/60);}}
window.artFrame=(id,view)=>{
 reset(id);rig.root.updateMatrixWorld(true);
 const head=rig.neck.getWorldPosition(new T.Vector3()).add(new T.Vector3(0,.135,0));
 let target=new T.Vector3(0,.94,0),offset;
 if(view==='face-front'){target=head;offset=new T.Vector3(0,.015,-.72);}
 else if(view==='face-threequarter'){target=head;offset=new T.Vector3(.46,.035,-.61);}
 else if(view==='face-profile'){target=head;offset=new T.Vector3(.71,.025,-.09);}
 else if(view==='back'){offset=new T.Vector3(.5,.12,3.5);}
 else if(view==='side'){offset=new T.Vector3(3.3,.14,-.3);}
 else {offset=new T.Vector3(1.3,.20,-3.15);}
 camera.position.copy(target).add(offset);camera.lookAt(target);camera.updateMatrixWorld();
 renderer.render(scene,camera);
 let vertices=0,invalid=0;rig.root.traverse(n=>{if(!n.isMesh)return;const a=n.geometry.getAttribute('position');
 for(let i=0;i<a.count;i++){vertices++;if(![a.getX(i),a.getY(i),a.getZ(i)].every(Number.isFinite))invalid++;}});
 return {id,view,vertices,invalid,camera:camera.position.toArray(),target:target.toArray(),metrics:rig.metrics,render:renderer.info.render};
};window.artReady=true;
</script></body></html>`;
await writeFile(resolve(temp,'index.html'),html);
const server=await createServer({configFile:false,root:temp,resolve:{dedupe:['three']},server:{host:'127.0.0.1',port:4193,strictPort:true,fs:{allow:[repo,moduleRoot]}}});
const report={sourceRevision:revision,runnerRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),
  scope:'Native 960x720 neutral-stage views of production character meshes and materials under fixed lights. Synthetic idle and inspection camera; not gameplay, performance or reference-quality acceptance.',images:[],errors:[]};
let browser;
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720}});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4193/');await page.waitForFunction(()=>window.artReady,null,{timeout:60000});
 for(const id of ['player','sentinel','retainer','warden'])for(const view of ['full','back','face-front','face-threequarter','face-profile']){
  const data=await page.evaluate(([id,view])=>artFrame(id,view),[id,view]);assert.equal(data.invalid,0);
  const file=id+'-'+view+'.png';await page.screenshot({path:resolve(out,file)});report.images.push({file,...data});
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await server.close();await rm(temp,{recursive:true,force:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({artStudy:report.result,images:report.images.length,sourceRevision:revision}));}
