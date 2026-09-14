import { chromium } from 'playwright';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { playthroughAction } from './playthrough-policy.mjs';
import { touchPlaythroughAction } from './touch-playthrough-policy.mjs';
import { ENDING_PHRASES } from './mission.js';
const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
await mkdir(out,{recursive:true});
const launchBrowser=()=>chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const desktopSize={width:1280,height:720};
const errors=[],browsers=[];
const report={date:new Date().toISOString(),sourceRevision:process.env.GITHUB_SHA??null,environment:'Chromium / SwiftShader; not physical-device performance',checks:[],errors,durationsMs:{},recordings:[]};
const persistReport=()=>writeFile(new URL('browser-report.json',out),JSON.stringify(report,null,2)+'\n');
function recording(id,size){
 const item={id,file:`${id}-continuous.webm`,size,status:'recording',startedAt:new Date().toISOString(),events:[],audio:'not captured; audio remains not measured',timing:'Approximate wall-clock offsets from page creation; not exact video/input synchronization. Decoded frame counts may contain repeats and are not independent performance samples.'};
 report.recordings.push(item);return item;
}
function mark(item,event,detail){item.events.push({event,offsetMs:Date.now()-Date.parse(item.startedAt),...(detail===undefined?{}:{detail})});}
async function finishRecording(context,video,item){
 try{
  mark(item,'context-close');await context.close();
  await rename(await video.path(),new URL(item.file,out));item.status='saved';item.closedAt=new Date().toISOString();
 }catch(e){item.status='failed';item.failure=String(e);report.result='failed';process.exitCode=1;}
 await persistReport();
}
async function resultLayout(p){
 const layout=await p.evaluate(()=>{
  const message=document.querySelector('#message'),button=document.querySelector('#start');
  return {fontSize:parseFloat(getComputedStyle(message).fontSize),heading:document.querySelector('.result-heading').getBoundingClientRect().toJSON(),message:message.getBoundingClientRect().toJSON(),button:button.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight},phrases:[...message.children].map(n=>({text:n.textContent,rect:n.getBoundingClientRect().toJSON(),lineHeight:parseFloat(getComputedStyle(n).lineHeight)}))};
 });
 assert.ok(layout.button.height>=48,'retry must have at least 48px height in every tested orientation');
 assert.ok(layout.fontSize>=14,'result copy must remain phone-readable');
 for(const b of [layout.heading,layout.message,layout.button])assert.ok(b.left>=0&&b.top>=0&&b.right<=layout.viewport.width&&b.bottom<=layout.viewport.height,'result content must fit the viewport');
 assert.deepEqual(layout.phrases.map(p=>p.text),ENDING_PHRASES);
 for(const phrase of layout.phrases)assert.ok(phrase.rect.height<=phrase.lineHeight+1,'authored phrases must remain intact at the tested viewport');
 return layout;
}
async function cameraContract(p){
 const metric=await p.evaluate(()=>freshDiagnostics().camera);
 assert.ok(metric.lockedFrames>0,'must observe actual locked combat renders');
 assert.ok(Number.isFinite(metric.minHorizontalStandoff)&&metric.minHorizontalStandoff>=3.5,'lock transitions must retain horizontal standoff');
 assert.ok(metric.maxDownAngleDegrees<=35,'lock transitions must not pass above the duel');
 return metric;
}
async function run(){
const browser=await launchBrowser();browsers.push(browser);
const desktop=await browser.newContext({viewport:desktopSize,recordVideo:{dir:new URL('recording-temp/',out).pathname,size:desktopSize}});
const page=await desktop.newPage();const desktopVideo=page.video();
page.on('pageerror',e=>errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const desktopRecording=recording('desktop',desktopSize);
const desktopStarted=Date.now();
try{
 await page.goto('http://127.0.0.1:4178/?diagnostic=1');await page.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);mark(desktopRecording,'title-ready',desktopSize);
 report.landscape=await page.evaluate(()=>freshDiagnostics().landscape);
 assert.ok(report.landscape.maxRootError<1e-5,'plant roots agree with the rendered ground');
 assert.ok(report.landscape.grassTriangles<=36000,'clustered grass preserves its prior triangle budget');
 await page.screenshot({path:new URL('title.png',out).pathname});
 await page.click('#start');await page.keyboard.down('KeyW');
 await page.waitForFunction(()=>freshDiagnostics().world.player.z<8,{},{timeout:90000});await page.keyboard.up('KeyW');
 report.checks.push('real start and keyboard movement through torii');
 await page.keyboard.press('KeyE');await page.waitForFunction(()=>freshDiagnostics().world.locked!==null);
 for(let i=0;i<8;i++){
  await page.mouse.click(800,360);await page.waitForTimeout(800);
  if(await page.evaluate(()=>freshDiagnostics().world.totals.hits>0))break;
 }
 report.combat=await page.evaluate(()=>freshDiagnostics());
 await page.screenshot({path:new URL('encounter.png',out).pathname});
 assert.ok(report.combat.world.totals.hits>0,'actual clicks must cause a hit');report.checks.push('real click causes enemy HP loss');
 await page.keyboard.press('Escape');await page.waitForFunction(()=>freshDiagnostics().paused);
 const time=await page.evaluate(()=>freshDiagnostics().world.time);await page.waitForTimeout(400);assert.equal(await page.evaluate(()=>freshDiagnostics().world.time),time);
 await page.click('#start');await page.waitForFunction(()=>freshDiagnostics().running);report.checks.push('pause freezes simulation and resumes');
 await page.evaluate(()=>{const c=document.querySelector('canvas');const gl=c.getContext('webgl2');window.restoreExtension=gl.getExtension('WEBGL_lose_context');window.restoreExtension.loseContext();});
 await page.waitForFunction(()=>freshDiagnostics().contextLost);
 await page.evaluate(()=>window.restoreExtension.restoreContext());await page.waitForFunction(()=>!freshDiagnostics().contextLost);await page.click('#start');
 report.checks.push('WebGL loss/restore and resume');
 await page.waitForFunction(()=>freshDiagnostics().world.mode==='defeat',{},{timeout:120000});await page.click('#start');
 const retry=await page.evaluate(()=>freshDiagnostics());assert.equal(retry.world.player.hp,100);assert.equal(retry.world.player.z,18);report.checks.push('death and real retry restore player');
 // Complete the newly authored objective with real input, never diagnostic mutations.
 const held=new Set(),fullDeadline=Date.now()+180000;
 report.mission={before:retry.world,checkpoints:[]};let lastKills=-1;mark(desktopRecording,'full-mission-start');
 while(Date.now()<fullDeadline){
  const w=await page.evaluate(()=>freshDiagnostics().world);
  if(w.totals.kills!==lastKills){report.mission.checkpoints.push(w);lastKills=w.totals.kills;mark(desktopRecording,'kills',lastKills);}
  if(w.mode!=='playing'){
   if(w.mode==='victory')report.mission.victoryObservedElapsedMs=Date.now()-(fullDeadline-180000);
   break;
  }
  const a=playthroughAction(w),wanted=new Set();
  if(a.x)wanted.add(a.x>0?'KeyD':'KeyA');if(a.z)wanted.add(a.z>0?'KeyS':'KeyW');
  for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
  for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
  if(a.lock)await page.keyboard.press('KeyE');
  if(a.attack)await page.mouse.click(800,360);
  await page.waitForTimeout(100);
 }
 for(const key of held)await page.keyboard.up(key);
 report.mission.after=await page.evaluate(()=>freshDiagnostics().world);
 assert.ok(Number.isFinite(report.mission.victoryObservedElapsedMs)&&report.mission.victoryObservedElapsedMs<=180000,'desktop victory must be observed within180seconds, not after the loop deadline');
 assert.equal(report.mission.after.mode,'victory');assert.equal(report.mission.after.signalLit,true);
 assert.equal(report.mission.after.totals.kills,3);
 assert.ok(report.mission.checkpoints.some(w=>w.totals.kills===3&&w.mode==='playing'),'last kill must leave the arrival objective active');
 assert.match(await page.locator('#message').innerText(),/社の灯がともった/);
 assert.equal(await page.locator('#menu').getAttribute('data-mode'),'victory');
 assert.equal(await page.locator('#menu h1').evaluate(node=>getComputedStyle(node).display),'none');
 assert.equal(await page.locator('.result-heading').evaluate(node=>getComputedStyle(node).display),'block');
 assert.match(await page.locator('.result-heading').innerText(),/灯、谷へ/);
 await page.waitForTimeout(500);
 assert.equal(await page.locator('#hud').isHidden(),true);
 report.desktopResult=await resultLayout(page);mark(desktopRecording,'victory');
 report.desktopCamera=await cameraContract(page);
 await page.screenshot({path:new URL('mission-victory.png',out).pathname});
 await page.waitForTimeout(3000);
 await page.click('#start');
 const clean=await page.evaluate(()=>freshDiagnostics().world);
 assert.equal(clean.signalLit,false);assert.equal(clean.pathCleared,false);assert.equal(clean.totals.kills,0);
 assert.equal(clean.player.hp,100);assert.equal(clean.player.z,18);assert.ok(clean.enemies.every(e=>e.hp===100));
 await page.waitForFunction(()=>document.querySelector('#objective').textContent==='谷へ合図を送るため、鳥居の先へ');
 report.checks.push('real-input full combat, postcombat arrival, signal, ending and clean retry');
 mark(desktopRecording,'clean-retry');
 assert.deepEqual(errors,[]);report.result='passed';
}catch(e){report.result='failed';report.failure=String(e);report.failureState=await page.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;await page.screenshot({path:new URL('failure.png',out).pathname}).catch(()=>{});}
report.durationsMs.desktop=Date.now()-desktopStarted;
report.desktopTimings=await page.evaluate(()=>window.freshDiagnostics?.(true).timings).catch(()=>null);
// Desktop and phone must not compete for the same software-rendering process. The
// previous run kept the desktop WebGL page alive and advanced only 39.8 seconds of
// simulation during a 180-second phone window. A clean browser also makes each
// apparatus independently reproducible instead of inheriting restored WebGL state.
await finishRecording(desktop,desktopVideo,desktopRecording);await browser.close();
const mobileBrowser=await launchBrowser();browsers.push(mobileBrowser);
const phoneVideoSize={width:844,height:844};
const phone=await mobileBrowser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1,recordVideo:{dir:new URL('recording-temp/',out).pathname,size:phoneVideoSize}});
const mobile=await phone.newPage(),mobileVideo=mobile.video();mobile.on('pageerror',e=>errors.push(String(e)));mobile.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const mobileRecording=recording('touch',phoneVideoSize);
mobileRecording.framing='844x390 landscape then390x844 portrait. Page is top-left on a fixed844x844 recording canvas; unused area is padding.';
const mobileStarted=Date.now();
try{
 await mobile.goto('http://127.0.0.1:4178/?diagnostic=1');mark(mobileRecording,'landscape',{width:844,height:390});await mobile.locator('#start').tap();
 const cdp=await phone.newCDPSession(mobile);
 const point=async selector=>{const b=await mobile.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const g=await point('[data-action=guard]'),l=await point('[data-action=lock]'),s=await point('#stick');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...g,id:1}]});
 await mobile.waitForFunction(()=>freshDiagnostics().world.player.state==='guard');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...g,id:1},{...l,id:2}]});
 // CDP touchEnd terminates all contacts; touchMove with the remaining active list
 // releases only the removed contact. https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchTouchEvent
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...g,id:1}]});
 await mobile.waitForTimeout(350);assert.equal(await mobile.evaluate(()=>freshDiagnostics().world.player.state),'guard');
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await mobile.waitForFunction(()=>freshDiagnostics().world.player.state==='idle');
 report.checks.push('mobile simultaneous guard/lock release preserves guard; cancel releases');
 const before=await mobile.evaluate(()=>freshDiagnostics().world.player.z);
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...s,id:3}]});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:s.x,y:s.y-32,id:3}]});
 await mobile.waitForFunction(z=>freshDiagnostics().world.player.z<z-.3,before,{timeout:15000});
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await mobile.waitForTimeout(300);
 const stopped=await mobile.evaluate(()=>freshDiagnostics().world.player.z);await mobile.waitForTimeout(350);
 assert.equal(await mobile.evaluate(()=>freshDiagnostics().world.player.z),stopped);report.checks.push('mobile joystick movement and cancel stop');
 await mobile.screenshot({path:new URL('mobile.png',out).pathname});
 // Run the complete authored objective through touch controls only. Diagnostics
 // are read-only; every state change below comes from a rendered control.
 await mobile.reload();await mobile.locator('#start').tap();
 const attackPoint=await point('[data-action=attack]'),lockPoint=await point('[data-action=lock]'),dodgePoint=await point('[data-action=dodge]');
 let tapId=10;const contacts=new Map();
 const beginContact=async(id,p)=>{contacts.set(id,{...p,id});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...contacts.values()]});};
 const endContact=async id=>{contacts.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:contacts.size?'touchMove':'touchEnd',touchPoints:[...contacts.values()]});};
 const tapPoint=async p=>{
  const id=tapId++;
  await beginContact(id,p);
  await mobile.waitForTimeout(50);
  await endContact(id);
  await mobile.waitForTimeout(110);
 };
 const touchDeadline=Date.now()+180000;report.touchMission={policy:'held guard, actual dodge, recovery counters and early-windup interruption; prior dodge-only failures retained',guardObserved:false,blockOrParryObserved:false,checkpoints:[]};let touchKills=-1;mark(mobileRecording,'full-mission-start');
 while(Date.now()<touchDeadline){
  const w=await mobile.evaluate(()=>freshDiagnostics().world);
  report.touchMission.guardObserved ||= w.player.state==='guard';
  report.touchMission.blockOrParryObserved ||= w.events.some(e=>e.type==='block'||e.type==='parry');
  if(w.totals.kills!==touchKills){report.touchMission.checkpoints.push(w);touchKills=w.totals.kills;mark(mobileRecording,'kills',touchKills);}
  if(w.mode!=='playing'){
   if(w.mode==='victory')report.touchMission.victoryObservedElapsedMs=Date.now()-(touchDeadline-180000);
   break;
  }
  const a=touchPlaythroughAction(w);
  if(a.guard&&!contacts.has(1))await beginContact(1,g);
  if(!a.guard&&contacts.has(1))await endContact(1);
  if(a.dodge)await tapPoint(dodgePoint);
  else if(a.lock)await tapPoint(lockPoint);
  else if(a.attack)await tapPoint(attackPoint);
  else if(a.x||a.z){
   await beginContact(4,s);
   contacts.set(4,{x:s.x+a.x*32,y:s.y+a.z*32,id:4});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...contacts.values()]});
   await mobile.waitForTimeout(100);
   await endContact(4);
   await mobile.waitForTimeout(40);
  }else await mobile.waitForTimeout(80);
 }
 await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
 report.touchMission.after=await mobile.evaluate(()=>freshDiagnostics().world);
 assert.ok(Number.isFinite(report.touchMission.victoryObservedElapsedMs)&&report.touchMission.victoryObservedElapsedMs<=180000,'touch victory must be observed within180seconds, not after the loop deadline');
 assert.ok(Math.hypot(report.touchMission.after.player.dodgeX,report.touchMission.after.player.dodgeZ)>.5,'real touch route must actually trigger a dodge');
 assert.ok(report.touchMission.guardObserved&&report.touchMission.blockOrParryObserved,'real route must include observed guarding and an actual block/parry');
 assert.equal(report.touchMission.after.mode,'victory');
 assert.equal(report.touchMission.after.signalLit,true);
 assert.equal(report.touchMission.after.totals.kills,3);
 assert.ok(report.touchMission.checkpoints.some(w=>w.totals.kills===3&&w.mode==='playing'));
 assert.equal(await mobile.locator('#menu').getAttribute('data-mode'),'victory');
 await mobile.waitForTimeout(500);
 report.landscapeResult=await resultLayout(mobile);mark(mobileRecording,'victory');
 report.touchCamera=await cameraContract(mobile);
 await mobile.screenshot({path:new URL('mobile-mission-victory.png',out).pathname});
 await mobile.waitForTimeout(3000);
 await mobile.setViewportSize({width:390,height:844});await mobile.waitForTimeout(500);
 report.portraitTypography=await resultLayout(mobile);mark(mobileRecording,'portrait',{width:390,height:844});
 const portraitResult=await mobile.evaluate(()=>{const menu=document.querySelector('#menu'),message=document.querySelector('#message'),button=document.querySelector('#start');return {fontSize:parseFloat(getComputedStyle(message).fontSize),panelHeight:getComputedStyle(menu,'::before').height,message:message.getBoundingClientRect().toJSON(),button:button.getBoundingClientRect().toJSON(),viewport:{width:innerWidth,height:innerHeight}};});
 assert.ok(portraitResult.fontSize>=14,'portrait result copy must remain phone-readable');
 assert.ok(portraitResult.message.bottom<=portraitResult.viewport.height&&portraitResult.button.bottom<=portraitResult.viewport.height,'portrait result content must remain in the viewport');
 report.portraitResult=portraitResult;report.checks.push('portrait victory result panel keeps readable copy and retry in viewport');
 await mobile.screenshot({path:new URL('mobile-mission-victory-portrait.png',out).pathname});
 await mobile.waitForTimeout(3000);
 await mobile.locator('#start').tap();
 const touchRetry=await mobile.evaluate(()=>freshDiagnostics().world);
 assert.equal(touchRetry.signalLit,false);assert.equal(touchRetry.totals.kills,0);
 assert.equal(touchRetry.player.hp,100);assert.equal(touchRetry.player.z,18);
 report.checks.push('touch-only full combat, arrival, signal, ending and clean retry');
 mark(mobileRecording,'clean-retry');
 assert.deepEqual(errors,[]);
}catch(e){report.result='failed';report.mobileFailure=String(e);report.mobileFailureState=await mobile.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;}
report.durationsMs.mobile=Date.now()-mobileStarted;
report.touchTimings=await mobile.evaluate(()=>window.freshDiagnostics?.(true).timings).catch(()=>null);
await finishRecording(phone,mobileVideo,mobileRecording);await mobileBrowser.close();
}
try{await run();}
catch(e){report.result='failed';report.setupOrShutdownFailure=String(e);process.exitCode=1;}
finally{
 await persistReport();
 for(const browser of browsers){try{if(browser.isConnected())await browser.close();}catch(e){report.result='failed';(report.cleanupFailures??=[]).push(String(e));process.exitCode=1;}}
 await persistReport();console.log(JSON.stringify(report));
}
