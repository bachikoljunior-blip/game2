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
  ['attack',3],['dodge',2],['hit',2],['parry',2],['broken',2.5],['death',3],['victory',4],['wind',4]
];
const html=`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;background:#101820}canvas{display:block;width:100vw;height:100vh}#label{position:fixed;left:16px;top:12px;color:#fff;font:16px system-ui;background:#15232de8;padding:8px 12px}</style></head><body><canvas id="scene"></canvas><div id="label"></div><script type="module">
import {createPresentation} from '/@fs/${root}/fresh/presentation.js';
import {createWorld} from '/@fs/${root}/fresh/simulation.js';
const view=createPresentation(document.querySelector('canvas'));
let world, previous='', elapsed=0;
const event=(type,target='player')=>({type,time:world.time,source:'sentinel',target,x:0,z:0});
window.studyFrame=(name,t,dt)=>{
 if(name!==previous){world=createWorld();world.player.x=0;world.player.z=0;world.player.stride=0;world.enemies.forEach((e,i)=>{e.x=8+i*2;e.z=0;e.hp=100;});previous=name;elapsed=0;}
 const p=world.player;world.time+=dt;world.events=[];p.state='idle';p.age=t;p.hp=100;world.mode='playing';
 if(name==='start-run-stop'){const run=Math.min(2.5,Math.max(0,t-.45));p.z=-run*3.8;p.stride=run*3.8;}
 if(name==='turn'){p.yaw=Math.min(Math.PI,Math.max(0,t-.5)*2.1);p.x=Math.max(0,t-1.9)*1.5;p.stride=Math.max(0,t-1.9)*1.5;}
 if(name==='guard'){p.state=t<.25?'idle':'guard';p.age=Math.max(0,t-.25);}
 if(name==='windup-attack'){const age=t%1.6;p.state=age<.65?'windup':age<1.3?'attack':'idle';p.age=age<.65?age:age<1.3?age-.65:age-1.3;}
 if(name==='attack'){const age=t%1.1;p.state=age<.65?'attack':'idle';p.age=age<.65?age:age-.65;}
 if(name==='dodge'){const age=t%1.2;p.state=age<.46?'dodge':'idle';p.age=age<.46?age:age-.46;p.dodgeX=1;p.dodgeZ=0;p.x=Math.min(age,.46)*7+Math.floor(t/1.2)*3.22;}
 if(name==='hit'||name==='parry'){const age=t%1.2;p.state=age<.38?'stagger':'idle';p.age=age<.38?age:age-.38;if(age<dt)world.events=[event(name==='hit'?'hit':'parry')];}
 if(name==='broken'){p.state=t<1.8?'broken':'idle';p.age=t<1.8?t:t-1.8;}
 if(name==='death'){p.state='dead';p.hp=0;p.age=t;world.mode='defeat';if(t<dt*1.1)world.events=[event('death')];}
 if(name==='victory'){world.mode='victory';world.signalLit=true;p.state='idle';p.x=-.4;p.z=-18.8;}
 if(name==='wind'){p.x=5;p.z=8;}
 // Ordinary presentation code renders every sample. The study camera only
 // changes composition afterward, to inspect feet and clothing at native scale.
 view.render(world,dt,0,{animate:true});
 if(name==='wind'){view.camera.position.set(5,3,16);view.camera.lookAt(11,3.5,4);}
 else{view.camera.position.set(p.x+2.5,1.45,p.z-3.6);view.camera.lookAt(p.x,.95,p.z);}
 view.renderer.render(view.scene,view.camera);
 document.querySelector('#label').textContent=name+' · '+t.toFixed(2)+' s';
 elapsed=t;return {world:{state:p.state,age:p.age,x:p.x,z:p.z,hp:p.hp},actors:view.actorDiagnostics(),landscape:view.landscapeDiagnostics()};
};window.studyReady=true;
</script></body></html>`;
await writeFile(resolve(temp,'index.html'),html);
const server=await createServer({configFile:false,root:temp,server:{host:'127.0.0.1',port:4191,strictPort:true,fs:{allow:[root]}}});
let browser;
const errors=[],report={sourceRevision:revision,scope:'Actual generated rig/environment rendered at authored 12 fps in an isolated study, with synthetic scene states and a close inspection camera. Not normal-input gameplay, real-time performance, or source-blind reference comparison.',fps:12,cases:[],errors};
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
   if(i%3===0)samples.push({frame:i,...sample});
   await page.screenshot({path:resolve(folder,`${String(i).padStart(4,'0')}.png`)});
  }
  const video=resolve(out,`${name}.mp4`);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-y','-framerate','12','-i',resolve(folder,'%04d.png'),'-c:v','libx264','-pix_fmt','yuv420p','-crf','20',video]);
  execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',video,'-f','null','-']);
  report.cases.push({name,duration:frames/12,frames,video:`${name}.mp4`,fullDecode:'passed',samples});
  // Preserve a few native frames with the full video; repetitive render inputs
  // are reproducible from this exact runner and need not fill the artifact.
  for(let i=0;i<frames;i++)if(i%6!==0)await rm(resolve(folder,`${String(i).padStart(4,'0')}.png`));
  console.log(JSON.stringify({study:name,frames,fullDecode:'passed'}));
 }
 assert.deepEqual(errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await server.close();await rm(temp,{recursive:true,force:true});await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');}
