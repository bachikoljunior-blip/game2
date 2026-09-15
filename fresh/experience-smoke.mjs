import {chromium} from 'playwright';
import {mkdir,writeFile,rename} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {EXPLORATION} from './exploration.js';

const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
await mkdir(out,{recursive:true});
const report={sourceRevision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),environment:'Actual Chromium DOM/CDP input, SwiftShader; not physical-phone performance',checks:[],exploration:[],errors:[]};
let browser;
const launch=()=>chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const attach=page=>{page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});};
const snapshot=page=>page.evaluate(()=>freshDiagnostics());
try{
 browser=await launch();
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,deviceScaleFactor:1});
 const page=await context.newPage();attach(page);await page.goto('http://127.0.0.1:4178/?diagnostic=1');await page.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);await page.tap('#start');
 const cdp=await context.newCDPSession(page),contacts=new Map();
 const send=async(type)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:[...contacts.values()]});
 const begin=async(id,x,y)=>{contacts.set(id,{id,x,y});await send('touchStart');};
 const move=async(id,x,y)=>{contacts.set(id,{id,x,y});await send('touchMove');};
 const end=async(id)=>{contacts.delete(id);await send(contacts.size?'touchMove':'touchEnd');};
 const cancel=async()=>{contacts.clear();await send('touchCancel');};
 const settle=()=>page.waitForTimeout(150);
 for(const [name,points] of [['short',[[540,145],[545,147]]],['vertical',[[540,145],[541,185]]],['long',[[560,140],[470,150],[410,155]]],['return',[[540,145],[590,145],[540,145]]]]){
  const before=await snapshot(page);await begin(11,...points[0]);for(const p of points.slice(1))await move(11,...p);await end(11);await settle();const after=await snapshot(page);
  assert.equal(after.world.totals.swings,before.world.totals.swings,`${name} canvas gesture must never attack`);
  if(name==='long')assert.ok(Math.abs(after.input.orbit-before.input.orbit)>.2,'long swipe must rotate the camera');
  report.checks.push(`touch ${name} gesture: no attack`);
 }
 await begin(11,540,145);await move(11,590,145);await cancel();await settle();
 assert.equal((await snapshot(page)).world.totals.swings,0);report.checks.push('native touch cancel causes no attack');
 await begin(11,540,145);await begin(12,640,145);await move(12,670,145);await end(12);await end(11);await settle();
 assert.equal((await snapshot(page)).world.totals.swings,0);report.checks.push('two canvas fingers cannot synthesize an attack');
 // Losing capture uses the real browser capture API; no input or game state is written.
 await page.evaluate(()=>{window.captureId=null;document.querySelector('canvas').addEventListener('gotpointercapture',e=>window.captureId=e.pointerId,{once:true});});
 await begin(11,540,145);await move(11,550,145);
 await page.evaluate(()=>{const c=document.querySelector('canvas');if(window.captureId!==null&&c.hasPointerCapture(window.captureId))c.releasePointerCapture(window.captureId);});
 await end(11);await settle();assert.equal((await snapshot(page)).world.totals.swings,0);report.checks.push('lost canvas pointer capture cannot attack');
 const center=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
 const guard=await center('[data-action=guard]'),attack=await center('[data-action=attack]');
 await begin(21,guard.x,guard.y);await page.waitForFunction(()=>freshDiagnostics().world.player.state==='guard');
 await begin(22,540,145);await move(22,600,145);await end(22);
 assert.equal((await snapshot(page)).world.player.state,'guard');
 await begin(23,attack.x,attack.y);await end(23);await page.waitForFunction(()=>freshDiagnostics().world.totals.swings===1);
 await page.waitForFunction(()=>freshDiagnostics().world.player.state==='guard');
 await cancel();await page.waitForFunction(()=>freshDiagnostics().world.player.state==='idle');
 report.checks.push('guard survives camera swipe and dedicated attack; own cancellation releases it');
 await context.close();await browser.close();browser=await launch();
 const pc=await browser.newPage({viewport:{width:1280,height:720}});attach(pc);await pc.goto('http://127.0.0.1:4178/?diagnostic=1');await pc.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);await pc.click('#start');
 await pc.mouse.move(800,250);await pc.mouse.down();await pc.mouse.move(875,250,{steps:4});await pc.mouse.up();await pc.waitForTimeout(250);assert.equal((await snapshot(pc)).world.totals.swings,0);
 await pc.mouse.click(800,250);await pc.waitForFunction(()=>freshDiagnostics().world.totals.swings===1);report.checks.push('desktop drag rotates without attack; click attacks once');
 await pc.close();
 // Each optional circuit starts on an untouched new world and uses keyboard
 // movement only. Visits dwell near their authored object; no teleport or cheat.
 for(const loop of EXPLORATION.loops){
  const size={width:960,height:540},ctx=await browser.newContext({viewport:size,recordVideo:{dir:new URL('recording-temp/',out).pathname,size}}),p=await ctx.newPage(),video=p.video();attach(p);
  const item={id:loop.id,name:loop.name,points:[],result:'running'};report.exploration.push(item);
  try{
   await p.goto('http://127.0.0.1:4178/?diagnostic=1');await p.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);await p.click('#start');
   const held=new Set(),deadline=Date.now()+240000;
   const goals=loop.id==='memory'?[{x:-10,z:18},{x:-10,z:-18},...loop.nodes]:[{x:loop.nodes[0].x,z:18},...loop.nodes];
   for(const goal of goals){
    while(Date.now()<deadline){
     const w=(await snapshot(p)).world;assert.equal(w.mode,'playing',`${loop.id}: stay alive during exploration`);
     const dx=goal.x-w.player.x,dz=goal.z-w.player.z;if(Math.hypot(dx,dz)<1.3)break;
     const keys=new Set();if(Math.abs(dx)>.45)keys.add(dx>0?'KeyD':'KeyA');if(Math.abs(dz)>.45)keys.add(dz>0?'KeyS':'KeyW');
     for(const key of held)if(!keys.has(key)){await p.keyboard.up(key);held.delete(key);}for(const key of keys)if(!held.has(key)){await p.keyboard.down(key);held.add(key);}
     await p.waitForTimeout(90);
    }
    for(const key of held)await p.keyboard.up(key);held.clear();
    assert.ok(Date.now()<deadline,`${loop.id}: ordinary-input circuit time budget`);
    const places=EXPLORATION.points.filter(place=>Math.hypot(place.x-goal.x,place.z-goal.z)<3);
    if(places.length)await p.waitForFunction(ids=>ids.every(id=>freshDiagnostics().world.exploration.discovered.includes(id)),places.map(x=>x.id),{timeout:15000});
    item.points.push({goal,world:(await snapshot(p)).world});
    if(places.length)await p.screenshot({path:new URL(`explore-${places[0].id}.png`,out).pathname});
   }
   const final=(await snapshot(p)).world;assert.ok(loop.discoveries.every(id=>final.exploration.discovered.includes(id)));assert.ok(final.exploration.completed.includes(loop.id));
   assert.equal(final.signalLit,false);item.result='passed';item.final=final;report.checks.push(`ordinary keyboard circuit ${loop.id}: both discoveries and loop completion`);
  }finally{await ctx.close();await rename(await video.path(),new URL(`exploration-${loop.id}.webm`,out));}
 }
 assert.deepEqual(report.errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);process.exitCode=1;console.error(error);}
finally{await browser?.close();await writeFile(new URL('experience-report.json',out),JSON.stringify(report,null,2)+'\n');}
