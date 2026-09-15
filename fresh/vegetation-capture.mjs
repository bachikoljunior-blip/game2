// Authored-time production-scene inspection. Playback rate is chosen to inspect
// dynamics; it does not measure real-time performance or certify naturalness.
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { mkdir, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
const root=resolve(new URL('..',import.meta.url).pathname),out=resolve(root,'AI_DEVELOPMENT/EVIDENCE/fresh-20260915-art/vegetation');
const revision=execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim();
await mkdir(out,{recursive:true});const temp=await mkdtemp(resolve(root,'.vegetation-inspection-'));
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0}canvas{display:block;width:100vw;height:100vh}</style></head><body><canvas id="scene"></canvas><script type="module">
import * as T from 'three';
import {createPresentation} from '/@fs/${root}/fresh/presentation.js';
import {createWorld} from '/@fs/${root}/fresh/simulation.js';
import {groundHeightAt} from '/@fs/${root}/fresh/terrain.js';
import {chooseVegetationInspection} from '/@fs/${root}/fresh/vegetation-inspection.js';
const view=createPresentation(document.querySelector('canvas'));await view.assetsReady;let world,previous,inspection;
window.foliageFrame=(name,t)=>{
 if(name!==previous){world=createWorld();previous=name;inspection=null;}
 const specimens=view.scene.userData.vegetationSpecimens;
 if(!specimens?.bamboo||!specimens?.maple)throw new Error('The production specimen roots are required.');
 const specimen=name==='bamboo'?specimens.bamboo:specimens.maple;
 world.player.x=specimen.x+6;world.player.z=specimen.z+8;world.time=t;
 view.render(world,1/12,0,{animate:true});
 const {x,y,z,height}=specimen,close=name==='maple-leaf';
 // Select once after settling, then keep the same viewpoint for every frame.
 if(t>=8&&!inspection)inspection=chooseVegetationInspection(view,specimen,{close,time:t});
 const position=inspection?new T.Vector3(...inspection.position):new T.Vector3(x+height*.82,y+height*.59,z+height*1.32);
 const target=inspection?new T.Vector3(...inspection.target):new T.Vector3(x,y+height*.5,z);
 view.renderInspection(position,target);view.camera.updateMatrixWorld();
 const projections=[new T.Vector3(x,y,z),new T.Vector3(x,y+height,z)].map(p=>p.project(view.camera).toArray());
 return {name,time:t,specimen,inspection,camera:view.camera.position.toArray(),projections,landscape:view.landscapeDiagnostics(),render:view.renderer.info.render};
};window.foliageReady=true;
</script></body></html>`;
await writeFile(resolve(temp,'index.html'),html);
const server=await createServer({configFile:false,root:temp,server:{host:'127.0.0.1',port:4194,strictPort:true,fs:{allow:[root]}}});
const report={sourceRevision:revision,scope:'Actual production vegetation at fixed inspection cameras, 12 authored frames per second. Gameplay obstruction fading is restored to base opacity for these plant studies. Camera selection checks other woody objects with the reported target-support exclusions; its zero count does not mean all woody geometry is clear. Self/other/all woody ray counts are saved separately at selection time. Root and undeformed stem-tip projections are framing guides; actual branch/leaf visibility and motion require native-media review. Not ordinary input or camera-obstruction verification, physical-device timing, perceptual or source-blind quality acceptance.',fps:12,cases:[],errors:[]};
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
 const page=await browser.newPage({viewport:{width:960,height:720}});
 page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
 await page.goto('http://127.0.0.1:4194/');await page.waitForFunction(()=>window.foliageReady,null,{timeout:90000});
 for(const [name,duration] of [['maple',12],['maple-leaf',6],['bamboo',12]]){
  const folder=resolve(out,name);await mkdir(folder,{recursive:true});const samples=[],frames=duration*12;
  // Settle the ordinary simulation for 8 authored seconds before filming.
  for(let i=0;i<96;i++)await page.evaluate(([n,t])=>foliageFrame(n,t),[name,i/12]);
  for(let i=0;i<frames;i++){
   const sample=await page.evaluate(([n,t])=>foliageFrame(n,t),[name,8+i/12]);
   if(i===0)assert.equal(sample.inspection.selectionOccludedRays,0,'selection rays avoid other woody objects with the documented target-support exclusions; all-wood clearance is not asserted');
   if(name!=='maple-leaf')for(const p of sample.projections)assert.ok(Math.abs(p[0])<.94&&Math.abs(p[1])<.94&&p[2]>-1&&p[2]<1,'root and stem tip remain in frame');
   if(i%6===0)samples.push({frame:i,...sample});
   await page.screenshot({path:resolve(folder,String(i).padStart(4,'0')+'.png')});
  }
  const video=resolve(out,name+'.mp4');
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','12','-i',resolve(folder,'%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','19',video]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',video,'-f','null','-']);
  for(let i=0;i<frames;i++)if(i%12!==0)await rm(resolve(folder,String(i).padStart(4,'0')+'.png'));
  report.cases.push({name,duration,frames,video:name+'.mp4',fullDecode:'passed',samples});console.log(JSON.stringify({vegetation:name,frames}));
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await server.close();await rm(temp,{recursive:true,force:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
