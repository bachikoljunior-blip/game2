import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { playthroughAction } from './playthrough-policy.mjs';
import { createTouchPlaythroughSession, touchPlaythroughAction } from './touch-playthrough-policy.mjs';
import { ROUTE_FORK } from './route-layout.js';

const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
await mkdir(out,{recursive:true});
const errors=[];
const report={date:new Date().toISOString(),sourceRevision:process.env.GITHUB_SHA??null,
  environment:'Chromium / SwiftShader; complementary real-input route matrix, not physical-device performance',
  result:'passed',errors,recordings:[],missions:{}};
const persist=()=>writeFile(new URL('route-matrix-report.json',out),JSON.stringify(report,null,2)+'\n');
const launch=()=>chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,
  args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
function recording(id,size){
  const item={id,file:`${id}-continuous.webm`,size,status:'recording',startedAt:new Date().toISOString(),events:[],
    audio:'not captured; audio remains not measured',
    timing:'Approximate wall-clock offsets from page creation; not exact video/input synchronization.'};
  report.recordings.push(item);return item;
}
function mark(item,event,detail){item.events.push({event,offsetMs:Date.now()-Date.parse(item.startedAt),...(detail===undefined?{}:{detail})});}
async function finish(context,video,item){
  try{
    mark(item,'context-close');await context.close();await rename(await video.path(),new URL(item.file,out));
    item.status='saved';item.closedAt=new Date().toISOString();
  }catch(error){item.status='failed';item.failure=String(error);report.result='failed';process.exitCode=1;}
  await persist();
}
function mission(route){return {preferred:route,entry:null,choice:null,landmark:null,consequence:null,rejoin:null,ridgeSamples:[],checkpoints:[],victoryObservedElapsedMs:null};}
function assertRoute(result,route){
  const expected=route==='left'?{landmark:'石灯',consequence:'early-retainer'}:{landmark:'風布',consequence:'overlook-warden'};
  assert.equal(result.after.mode,'victory');assert.equal(result.after.signalLit,true);assert.equal(result.after.totals.kills,3);
  assert.equal(result.after.routeChoice,route);assert.equal(result.after.routePhase,'rejoined');
  assert.equal(result.after.routeLandmark,expected.landmark);assert.equal(result.after.routeConsequence,expected.consequence);
  assert.ok(result.after.routeChoiceTime<result.after.routeLandmarkTime&&result.after.routeLandmarkTime<result.after.routeRejoinTime);
  assert.ok(result.entry&&result.choice&&result.landmark&&result.consequence&&result.rejoin);
  assert.ok(result.ridgeSamples.length>0);
  const clearance=ROUTE_FORK.obstacle.w/2+.35;
  assert.ok(result.ridgeSamples.every(sample=>route==='left'?sample.x<=-clearance:sample.x>=clearance),`must remain on ${route} of the solid ridge`);
  assert.ok(result.checkpoints.some(world=>world.totals.kills===3&&world.mode==='playing'),'postcombat arrival objective must remain observable');
  assert.ok(Number.isFinite(result.victoryObservedElapsedMs)&&result.victoryObservedElapsedMs<=180000);
}
function assertRetry(world){
  assert.equal(world.signalLit,false);assert.equal(world.pathCleared,false);assert.equal(world.totals.kills,0);
  assert.equal(world.routeChoice,null);assert.equal(world.routePhase,'approach');assert.equal(world.routeChoiceTime,null);assert.equal(world.routeChoicePosition,null);
  assert.equal(world.routeLandmark,null);assert.equal(world.routeLandmarkTime,null);assert.equal(world.routeConsequence,null);assert.equal(world.routeConsequenceTime,null);
  assert.equal(world.routeRejoinTime,null);assert.equal(world.routeRejoinPosition,null);assert.equal(world.player.hp,100);assert.equal(world.player.z,18);
}
function observe(result,item,w,lastSample){
  if(!result.entry&&w.totals.kills>=1&&!w.routeChoice&&w.player.z<=ROUTE_FORK.splitStartZ+4&&w.player.z>ROUTE_FORK.obstacleFrontZ+.5){
    result.entry={time:w.time,position:{x:w.player.x,z:w.player.z}};mark(item,'fork-entry',result.entry);
  }
  if(!result.choice&&w.routeChoice){
    result.choice={route:w.routeChoice,time:w.routeChoiceTime,position:w.routeChoicePosition};mark(item,'route-choice',result.choice);
  }
  if(!result.landmark&&w.routeLandmark){
    result.landmark={id:w.routeLandmark,time:w.routeLandmarkTime,position:{x:w.player.x,z:w.player.z}};mark(item,'route-landmark',result.landmark);
  }
  if(!result.consequence&&w.routeConsequence){
    result.consequence={id:w.routeConsequence,time:w.routeConsequenceTime,position:{x:w.player.x,z:w.player.z}};mark(item,'route-consequence',result.consequence);
  }
  if(!result.rejoin&&w.routePhase==='rejoined'){
    result.rejoin={time:w.routeRejoinTime,position:w.routeRejoinPosition};mark(item,'route-rejoin',result.rejoin);
  }
  if(w.routeChoice&&w.player.z<=ROUTE_FORK.obstacleFrontZ&&w.player.z>=ROUTE_FORK.obstacleBackZ&&w.time-lastSample.value>=.5){
    result.ridgeSamples.push({time:w.time,x:w.player.x,z:w.player.z});lastSample.value=w.time;
  }
}

async function runDesktopRight(){
  const size={width:1280,height:720},browser=await launch();
  const context=await browser.newContext({viewport:size,recordVideo:{dir:new URL('recording-temp/',out).pathname,size}});
  const page=await context.newPage(),video=page.video(),item=recording('desktop-right',size),result=mission('right');
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await page.goto('http://127.0.0.1:4178/?diagnostic=1');await page.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);
    await page.click('#start');mark(item,'full-mission-start');
    const deadline=Date.now()+180000,held=new Set(),lastSample={value:-Infinity};let kills=-1;
    while(Date.now()<deadline){
      const w=await page.evaluate(()=>freshDiagnostics().world);
      if(w.totals.kills!==kills){result.checkpoints.push(w);kills=w.totals.kills;mark(item,'kills',kills);}
      if(w.mode!=='playing'){if(w.mode==='victory')result.victoryObservedElapsedMs=Date.now()-(deadline-180000);break;}
      observe(result,item,w,lastSample);
      const action=playthroughAction(w,'right'),wanted=new Set();
      if(action.x)wanted.add(action.x>0?'KeyD':'KeyA');if(action.z)wanted.add(action.z>0?'KeyS':'KeyW');
      for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
      for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
      if(action.lock)await page.keyboard.press('KeyE');if(action.attack)await page.mouse.click(800,360);
      await page.waitForTimeout(100);
    }
    for(const key of held)await page.keyboard.up(key);
    result.after=await page.evaluate(()=>freshDiagnostics().world);assertRoute(result,'right');mark(item,'victory');
    await page.screenshot({path:new URL('desktop-right-victory.png',out).pathname});await page.click('#start');
    result.retry=await page.evaluate(()=>freshDiagnostics().world);assertRetry(result.retry);mark(item,'clean-retry');
    assert.deepEqual(errors,[]);
  }catch(error){report.result='failed';result.failure=String(error);result.failureState=await page.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;}
  report.missions.desktopRight=result;await finish(context,video,item);await browser.close();
}

async function runTouchLeft(){
  const viewport={width:844,height:390},size={width:844,height:844},browser=await launch();
  const context=await browser.newContext({viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,recordVideo:{dir:new URL('recording-temp/',out).pathname,size}});
  const page=await context.newPage(),video=page.video(),item=recording('touch-left',size),result=mission('left');
  item.framing='844x390 landscape on a fixed844x844 recording canvas; unused area is padding.';
  page.on('pageerror',error=>errors.push(String(error)));page.on('console',message=>{if(message.type()==='error')errors.push(message.text());});
  try{
    await page.goto('http://127.0.0.1:4178/?diagnostic=1');await page.locator('#start').tap();mark(item,'full-mission-start');
    const cdp=await context.newCDPSession(page),point=async selector=>{const b=await page.locator(selector).boundingBox();return {x:b.x+b.width/2,y:b.y+b.height/2};};
    const guard=await point('[data-action=guard]'),attack=await point('[data-action=attack]'),lock=await point('[data-action=lock]'),dodge=await point('[data-action=dodge]'),stick=await point('#stick');
    const contacts=new Map();let tapId=10;
    const begin=async(id,p)=>{contacts.set(id,{...p,id});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...contacts.values()]});};
    const end=async id=>{contacts.delete(id);await cdp.send('Input.dispatchTouchEvent',{type:contacts.size?'touchMove':'touchEnd',touchPoints:[...contacts.values()]});};
    const tap=async p=>{const id=tapId++;await begin(id,p);await page.waitForTimeout(50);await end(id);await page.waitForTimeout(110);};
    const tapDodgeUntilObserved=async before=>{
      const retryDeadline=Date.now()+3000;
      do{
        await tap(dodge);
        const observed=await page.evaluate(()=>({mode:freshDiagnostics().world.mode,dodges:freshDiagnostics().world.totals.dodges}));
        if(observed.mode!=='playing'||observed.dodges>before)return;
      }while(Date.now()<retryDeadline);
      throw new Error('Recovery dodge was not observed before its 3000ms input deadline');
    };
    const deadline=Date.now()+180000,lastSample={value:-Infinity},touchSession=createTouchPlaythroughSession();let kills=-1;result.guardObserved=false;result.blockOrParryObserved=false;
    while(Date.now()<deadline){
      const w=await page.evaluate(()=>freshDiagnostics().world);
      result.guardObserved ||= w.player.state==='guard';result.blockOrParryObserved ||= w.events.some(event=>event.type==='block'||event.type==='parry');
      if(w.totals.kills!==kills){result.checkpoints.push(w);kills=w.totals.kills;mark(item,'kills',kills);}
      if(w.mode!=='playing'){if(w.mode==='victory')result.victoryObservedElapsedMs=Date.now()-(deadline-180000);break;}
      observe(result,item,w,lastSample);
      const action=touchPlaythroughAction(w,'left',touchSession);
      if(action.guard&&!contacts.has(1))await begin(1,guard);if(!action.guard&&contacts.has(1))await end(1);
      if(action.dodge)await (action.dodgeNeedsAcknowledgement?tapDodgeUntilObserved(w.totals.dodges):tap(dodge));else if(action.lock)await tap(lock);else if(action.attack)await tap(attack);
      else if(action.x||action.z){
        await begin(4,stick);contacts.set(4,{x:stick.x+action.x*32,y:stick.y+action.z*32,id:4});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...contacts.values()]});await page.waitForTimeout(100);await end(4);await page.waitForTimeout(40);
      }else await page.waitForTimeout(80);
    }
    if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
    result.after=await page.evaluate(()=>freshDiagnostics().world);assertRoute(result,'left');
    assert.ok(Math.hypot(result.after.player.dodgeX,result.after.player.dodgeZ)>.5&&result.guardObserved&&result.blockOrParryObserved);
    mark(item,'victory');await page.screenshot({path:new URL('touch-left-victory.png',out).pathname});await page.locator('#start').tap();
    result.retry=await page.evaluate(()=>freshDiagnostics().world);assertRetry(result.retry);mark(item,'clean-retry');assert.deepEqual(errors,[]);
  }catch(error){report.result='failed';result.failure=String(error);result.failureState=await page.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;}
  report.missions.touchLeft=result;await finish(context,video,item);await browser.close();
}

try{await runDesktopRight();await runTouchLeft();}
catch(error){report.result='failed';report.setupOrShutdownFailure=String(error);process.exitCode=1;}
finally{await persist();console.log(JSON.stringify(report));}
