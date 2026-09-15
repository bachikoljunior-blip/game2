// Separate render study, never loaded by the production game. Frames are clocked
// at 12 fps to inspect poses and continuity; this is not a device-FPS measurement.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';

const root=resolve(new URL('..',import.meta.url).pathname);
const out=resolve(root,'AI_DEVELOPMENT/EVIDENCE/fresh-20260913/motion-study');
await mkdir(out,{recursive:true});
const temp=await mkdtemp(resolve(root,'.motion-study-'));
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
const cases=[
  ['idle',3],['start-run-stop',4],['turn',3],['guard',2],['windup-attack',3],
  ['attack',3],['dodge',2],['hit',2],['parry',2],['block',2],['broken',2.5],['death',3],['victory',4],['wind',4]
];
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#101820}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;left:16px;top:12px;color:#fff;font:16px/20px system-ui;max-width:300px;background:#15232de8;padding:8px 12px}</style></head><body><canvas id="scene"></canvas><div id="label"></div><script type="module">
import {createPresentation} from '/@fs/${root}/fresh/presentation.js';
import * as T from 'three';
import {createWorld,OBSTACLES} from '/@fs/${root}/fresh/simulation.js';
import {groundHeightAt} from '/@fs/${root}/fresh/terrain.js';
import {explorationSolidAt} from '/@fs/${root}/fresh/exploration.js';
const view=createPresentation(document.querySelector('canvas'));
let world, previous='';
const event=(type,target='player')=>({type,time:world.time,source:'sentinel',target,x:world.player.x,z:world.player.z});
const raycaster=new T.Raycaster();
function solidAt(point,radius){
 const obstacle=OBSTACLES.find(o=>point.y<groundHeightAt(o.x,o.z)+o.h+radius&&
  Math.hypot(Math.max(0,Math.abs(point.x-o.x)-o.w/2),Math.max(0,Math.abs(point.z-o.z)-o.d/2))<radius);
 return obstacle?.kind??explorationSolidAt(point.x,point.z,radius)?.id??null;
}
function inspectComposition(){
 view.scene.updateMatrixWorld(true);view.camera.updateMatrixWorld(true);
 const actor=view.scene.getObjectByName('actor-player'),bounds=new T.Box3(),failures=[];
 if(!actor)throw new Error('Motion study player rig is missing');
 const canvas=document.querySelector('canvas').getBoundingClientRect(),label=document.querySelector('#label').getBoundingClientRect();
 const ndcMin=new T.Vector3(Infinity,Infinity,Infinity),ndcMax=new T.Vector3(-Infinity,-Infinity,-Infinity);
 let vertices=0,outsideFrame=0,behindLabel=0;
 actor.traverseVisible(mesh=>{
  if(!mesh.isMesh||mesh.material.transparent||mesh.material.visible===false)return;
  const positions=mesh.geometry.getAttribute('position'),unique=mesh.geometry.userData.contactPositions;
  const count=unique?unique.length/3:positions.count;
  for(let i=0;i<count;i++){
   const point=unique?new T.Vector3().fromArray(unique,i*3):new T.Vector3().fromBufferAttribute(positions,i);
   point.applyMatrix4(mesh.matrixWorld);bounds.expandByPoint(point);
   const p=point.project(view.camera);ndcMin.min(p);ndcMax.max(p);vertices++;
   if(![p.x,p.y,p.z].every(Number.isFinite)||Math.abs(p.x)>.96||Math.abs(p.y)>.96||p.z<=-1||p.z>=1)outsideFrame++;
   const x=canvas.left+(p.x+1)*canvas.width/2,y=canvas.top+(1-p.y)*canvas.height/2;
   if(x>=label.left&&x<=label.right&&y>=label.top&&y<=label.bottom)behindLabel++;
  }
 });
 // Check the actual rendered rig vertices against the viewport and measured
 // DOM label. Empty AABB corners or a full-width top band would force a needlessly
 // distant camera and make fingers, feet and blade harder to inspect.
 if(!vertices||outsideFrame)failures.push('visible actor vertices leave the inspection frame');
 if(behindLabel)failures.push('visible actor vertices overlap the study label');
 const camera=view.camera.position,groundClearance=camera.y-groundHeightAt(camera.x,camera.z),cameraSolid=solidAt(camera,.25);
 if(groundClearance<.35)failures.push('study camera intersects terrain');
 if(cameraSolid)failures.push('study camera intersects '+cameraSolid);
 const probes=[['body',actor.getObjectByName('ribcage')],['head',actor.getObjectByName('neck')]];
 actor.traverse(node=>{if(node.name==='ankle')probes.push(['foot-'+probes.length,node]);});
 const scenery=[];
 for(const node of view.scene.children)if(!node.name.startsWith('actor-'))node.traverseVisible(mesh=>{
  if(mesh.isMesh)scenery.push(mesh);
 });
 const sightlines=probes.map(([name,node])=>{
  const point=node.getWorldPosition(new T.Vector3());if(name.startsWith('foot'))point.y+=.025;
  const delta=point.clone().sub(camera),distance=delta.length();let obstruction=null;
  // Check the shared collision volumes and triangular terrain even when a
  // camera starts inside a one-sided rendered mesh. Also raycast the actual
  // scenery so a decorative surface cannot silently hide a head or either foot.
  for(let t=0;t<1;t+=.10/distance){
   const sample=camera.clone().addScaledVector(delta,t);
   obstruction=solidAt(sample,.02);
   if(sample.y-groundHeightAt(sample.x,sample.z)<.02)obstruction='terrain';
   if(obstruction)break;
  }
  raycaster.set(camera,delta.normalize());raycaster.near=.01;raycaster.far=Math.max(.01,distance-.05);
  const hit=raycaster.intersectObjects(scenery,false).find(h=>{
   const material=Array.isArray(h.object.material)?h.object.material[h.face?.materialIndex??0]:h.object.material;
   return h.object.visible&&material?.visible!==false&&(!material?.transparent||material.opacity>=.95);
  });
  if(hit)obstruction=hit.object.name||hit.object.type;
  if(obstruction)failures.push(name+' sightline intersects '+obstruction);
  return {name,world:point.toArray(),projection:point.clone().project(view.camera).toArray(),obstruction};
 });
 if(sightlines.length!==4)failures.push('both feet and upper-body probes are required');
 return {passed:failures.length===0,failures,camera:camera.toArray(),groundClearance,cameraSolid,
  actorBounds:{min:bounds.min.toArray(),max:bounds.max.toArray()},projectedBounds:{min:ndcMin.toArray(),max:ndcMax.toArray()},
  vertices,outsideFrame,behindLabel,label:{left:label.left,top:label.top,right:label.right,bottom:label.bottom},sightlines};
}
window.studyFrame=(name,t,dt)=>{
 if(name!==previous){world=createWorld();world.player.stride=0;world.enemies.forEach((e,i)=>{e.x=8+i*2;e.z=0;e.hp=100;});previous=name;}
 const p=world.player;world.time+=dt;world.events=[];p.state='idle';p.age=t;p.hp=100;world.mode='playing';
 // Synthetic poses stay on the ordinary flat approach (z=18 through 8.5).
 // The real shrine victory and route traversal belong to the four input films.
 if(name==='start-run-stop'){const run=Math.min(2.5,Math.max(0,t-.45));p.z=18-run*3.8;p.stride=run*3.8;}
 if(name==='turn'){p.yaw=Math.min(Math.PI,Math.max(0,t-.5)*2.1);p.x=Math.max(0,t-1.9)*1.5;p.stride=Math.max(0,t-1.9)*1.5;}
 if(name==='guard'){p.state=t<.25?'idle':'guard';p.age=Math.max(0,t-.25);}
 if(name==='windup-attack'){const age=t%1.6;p.state=age<.65?'windup':age<1.3?'attack':'idle';p.age=age<.65?age:age<1.3?age-.65:age-1.3;}
 if(name==='attack'){const age=t%1.1;p.state=age<.65?'attack':'idle';p.age=age<.65?age:age-.65;}
 if(name==='dodge'){const age=t%1.2;p.state=age<.46?'dodge':'idle';p.age=age<.46?age:age-.46;p.dodgeX=1;p.dodgeZ=0;p.x=-3.22+Math.min(age,.46)*7+Math.floor(t/1.2)*3.22;}
 if(name==='hit'){const age=t%1.2;p.state=age<.38?'stagger':'idle';p.age=age<.38?age:age-.38;if(age<dt)world.events=[event('hit')];}
 // Both successful defense reactions belong to the guarding recipient. The
 // interrupted attacker uses stagger/broken, rather than this defender pose.
 if(name==='parry'||name==='block'){const age=t%1.2;p.state='guard';p.age=t;if(age<dt)world.events=[event(name)];}
 if(name==='broken'){p.state=t<1.8?'broken':'idle';p.age=t<1.8?t:t-1.8;}
 if(name==='death'){p.state='dead';p.hp=0;p.age=t;world.mode='defeat';if(t<dt*1.1)world.events=[event('death')];}
 if(name==='victory'){world.mode='victory';world.signalLit=true;p.state='idle';}
 if(name==='wind'){p.x=4.5;}
 // Ordinary presentation code renders every sample. The study camera only
 // changes composition afterward, to inspect feet and clothing at native scale.
 view.render(world,dt,0,{animate:true});
 const ground=groundHeightAt(p.x,p.z),wide=name==='wind';
 const cameraX=p.x+2.5,cameraZ=p.z-(wide?5.2:3.6),height=wide?2.1:1.45;
 view.camera.position.set(cameraX,Math.max(ground,groundHeightAt(cameraX,cameraZ))+height,cameraZ);
 view.camera.lookAt(p.x,ground+(wide?1.35:.95),p.z);
 document.querySelector('#label').textContent=name+' · synthetic / 12 fps · '+t.toFixed(2)+' s';
 const composition=inspectComposition();
 view.renderer.render(view.scene,view.camera);
 return {world:{state:p.state,age:p.age,x:p.x,y:ground,z:p.z,hp:p.hp},composition,actors:view.actorDiagnostics(),landscape:view.landscapeDiagnostics()};
};window.studyReady=true;
</script></body></html>`;
await writeFile(resolve(temp,'index.html'),html);
const server=await createServer({configFile:false,root:temp,server:{host:'127.0.0.1',port:4191,strictPort:true,fs:{allow:[root]}}});
let browser;
const errors=[],report={sourceRevision:revision,scope:'Actual generated rig/environment rendered at authored 12 fps in an isolated study, with synthetic scene states on the ordinary approach and an inspection camera. Victory inspects the salute/sheathing motion here; the four normal-input route films verify the actual shrine ending. Not normal-input gameplay, real-time performance, or source-blind reference comparison.',fps:12,cases:[],errors};
try{
 await server.listen();
 browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:540}});
 page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 await page.goto('http://127.0.0.1:4191/');await page.waitForFunction(()=>window.studyReady,{},{timeout:60000});
 for(const [name,duration] of cases){
  const folder=resolve(out,name);await mkdir(folder,{recursive:true});const frames=Math.ceil(duration*12),samples=[];
  for(let i=0;i<frames;i++){
   const sample=await page.evaluate(([n,t,dt])=>studyFrame(n,t,dt),[name,i/12,1/12]);
   if(!sample.composition.passed){report.failedFrame={name,frame:i,...sample};await page.screenshot({path:resolve(folder,`${String(i).padStart(4,'0')}.png`)});}
   assert.equal(sample.composition.passed,true,`${name} frame ${i}: ${sample.composition.failures.join('; ')}`);
   if(i%3===0)samples.push({frame:i,...sample});
   await page.screenshot({path:resolve(folder,`${String(i).padStart(4,'0')}.png`)});
  }
  const video=resolve(out,`${name}.mp4`);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','12','-i',resolve(folder,'%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','20',video]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',video,'-f','null','-']);
  report.cases.push({name,duration:frames/12,frames,compositionChecks:frames,video:`${name}.mp4`,fullDecode:'passed',samples});
  // Preserve a few native frames with the full video; repetitive render inputs
  // are reproducible from this exact runner and need not fill the artifact.
  for(let i=0;i<frames;i++)if(i%6!==0)await rm(resolve(folder,`${String(i).padStart(4,'0')}.png`));
  console.log(JSON.stringify({study:name,frames,fullDecode:'passed'}));
 }
 assert.deepEqual(errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await server.close();await rm(temp,{recursive:true,force:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
