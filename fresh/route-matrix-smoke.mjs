import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { playthroughAction } from './playthrough-policy.mjs';
import { createTouchPlaythroughSession, touchPlaythroughAction } from './touch-playthrough-policy.mjs';
import { ENDING_PHRASES, SIGNAL, canLightSignal } from './mission.js';
import { usesRejoinVista } from './camera-framing.js';
import { ROUTE_FORK } from './route-layout.js';
import { waitForComposition as observeComposition, settleRejoinAndLock, keyboardRejoinControls, touchRejoinControls } from './rejoin-evidence.mjs';

const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
await mkdir(out,{recursive:true});
const errors=[];
const checkedOutRevision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
const report={date:new Date().toISOString(),sourceRevision:checkedOutRevision,ciClaimedRevision:process.env.GITHUB_SHA??null,
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
async function waitForComposition(page,framesKey,compositionKey,deadline){
  const progress={};(report.cameraWaits??=[]).push(progress);
  return observeComposition(page,framesKey,compositionKey,{deadline,progress});
}
async function finish(context,video,item){
  try{
    mark(item,'context-close');await context.close();await rename(await video.path(),new URL(item.file,out));
    item.status='saved';item.closedAt=new Date().toISOString();
  }catch(error){item.status='failed';item.failure=String(error);report.result='failed';process.exitCode=1;}
  await persist();
}
async function cameraContract(page){
  const metric=await page.evaluate(()=>freshDiagnostics().camera);
  assert.ok(metric.lockedFrames>0,'must observe actual locked combat renders');
  assert.ok(Number.isFinite(metric.minHorizontalStandoff)&&metric.minHorizontalStandoff>=3.5,'lock transitions must retain horizontal standoff');
  assert.ok(metric.maxDownAngleDegrees<=35,'lock transitions must not pass above the duel');
  return metric;
}
function mission(route){return {preferred:route,entry:null,choice:null,landmark:null,consequence:null,rejoinApproach:null,rejoin:null,rejoinCameraSettled:null,arrivalView:null,arrival:null,signalInput:null,signalLit:null,ridgeSamples:[],checkpoints:[],victoryObservedElapsedMs:null};}
function assertRoute(result,route){
  const expected=route==='left'?{landmark:'石灯',consequence:'early-retainer'}:{landmark:'風布',consequence:'overlook-warden'};
  assert.equal(result.after.mode,'victory');assert.equal(result.after.signalLit,true);assert.equal(result.after.totals.kills,3);
  assert.equal(result.after.routeChoice,route);assert.equal(result.after.routePhase,'rejoined');
  assert.equal(result.after.routeLandmark,expected.landmark);assert.equal(result.after.routeConsequence,expected.consequence);
  assert.ok(result.after.routeChoiceTime<result.after.routeLandmarkTime&&result.after.routeLandmarkTime<result.after.routeRejoinTime);
  assert.ok(result.entry&&result.choice&&result.landmark&&result.consequence&&result.rejoinApproach&&result.rejoin&&result.rejoinCameraSettled&&result.arrivalView&&result.arrival&&result.signalInput&&result.signalLit);
  assert.ok(result.arrival.distance<=SIGNAL.radius);assert.equal(result.signalLit.event?.type,'signal');
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
  if(w.routePhase==='branch'&&w.routeChoice&&w.player.z<=ROUTE_FORK.obstacleFrontZ&&w.player.z>=ROUTE_FORK.obstacleBackZ&&w.time-lastSample.value>=.5){
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
      if(w.mode!=='playing'){
        if(w.mode==='victory'){
          result.victoryObservedElapsedMs=Date.now()-(deadline-180000);
          if(!result.signalLit){result.signalLit={time:w.time,position:{x:w.player.x,z:w.player.z},event:w.events.find(event=>event.type==='signal')??null};mark(item,'signal-lit',result.signalLit);}
        }
        break;
      }
      observe(result,item,w,lastSample);
      if(!result.rejoinApproach&&usesRejoinVista(w)){
        for(const key of held){await page.keyboard.up(key);held.delete(key);}
        const camera=await waitForComposition(page,'rejoinVistaFrames','rejoinComposition',deadline);
        result.rejoinApproach={time:w.time,position:{x:w.player.x,z:w.player.z},camera};
        mark(item,'rejoin-approach',result.rejoinApproach);await page.waitForTimeout(1200);continue;
      }
      if(result.rejoin&&!result.rejoinCameraSettled){
        for(const key of held){await page.keyboard.up(key);held.delete(key);}
        result.rejoinDefense={};
        await settleRejoinAndLock(page,keyboardRejoinControls(page,held),{
          deadline,progress:result.rejoinDefense,
          onSettled:camera=>{result.rejoinCameraSettled=camera;mark(item,'rejoin-camera-settled',camera);},
          onLock:lock=>mark(item,'rejoin-lock-acknowledged',lock)
        });
        assert.equal(result.rejoinCameraSettled.mode,'playing');assert.equal(result.rejoinCameraSettled.locked,null);assert.equal(result.rejoinCameraSettled.playerState,'guard');
        assert.ok(result.rejoinCameraSettled.downAngleDegrees<=30);continue;
      }
      if(!result.arrivalView&&canLightSignal(w)){
        for(const key of held){await page.keyboard.up(key);held.delete(key);}
        const camera=await waitForComposition(page,'arrivalOverviewFrames','arrivalComposition',deadline);
        result.arrivalView={time:w.time,position:{x:w.player.x,z:w.player.z},camera};
        mark(item,'post-rejoin-shrine-view',result.arrivalView);await page.waitForTimeout(900);continue;
      }
      if(!result.arrival&&canLightSignal(w)){
        for(const key of held){await page.keyboard.up(key);held.delete(key);}
        const objective=await page.locator('#objective').innerText();
        result.arrival={time:w.time,position:{x:w.player.x,z:w.player.z},distance:Math.hypot(w.player.x-SIGNAL.x,w.player.z-SIGNAL.z),objective};
        assert.match(objective,/E または「灯す」で、谷へ合図を送る/);mark(item,'destination-arrival',result.arrival);await page.waitForTimeout(900);continue;
      }
      const action=playthroughAction(w,'right'),wanted=new Set();
      if(action.x)wanted.add(action.x>0?'KeyD':'KeyA');if(action.z)wanted.add(action.z>0?'KeyS':'KeyW');
      for(const key of held)if(!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
      for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
      if(action.lock){
        if(canLightSignal(w)&&!result.signalInput){result.signalInput={time:w.time,input:'KeyE',position:{x:w.player.x,z:w.player.z}};mark(item,'signal-input',result.signalInput);}
        await page.keyboard.press('KeyE');
      }
      if(action.attack)await page.mouse.click(800,360);
      await page.waitForTimeout(100);
    }
    for(const key of held)await page.keyboard.up(key);
    result.after=await page.evaluate(()=>freshDiagnostics().world);assertRoute(result,'right');result.camera=await cameraContract(page);mark(item,'victory');
    assert.equal(await page.locator('#menu').getAttribute('data-mode'),'victory');
    assert.match(await page.locator('#objective').innerText(),/社の灯が、谷への合図になった/);
    assert.deepEqual(await page.locator('#message').locator(':scope > *').allTextContents(),ENDING_PHRASES);
    await page.waitForTimeout(500);assert.equal(await page.locator('#hud').isHidden(),true);
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
    const tapPair=async(a,b)=>{
      const first=tapId++,second=tapId++;
      contacts.set(first,{...a,id:first});contacts.set(second,{...b,id:second});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[...contacts.values()]});await page.waitForTimeout(50);
      contacts.delete(first);contacts.delete(second);
      await cdp.send('Input.dispatchTouchEvent',{type:contacts.size?'touchMove':'touchEnd',touchPoints:[...contacts.values()]});await page.waitForTimeout(110);
    };
    const tapDodgeUntilObserved=async before=>{
      const startedAt=Date.now(),record={};(result.recoveryDodgeAcknowledgements??=[]).push(record);
      const {retryDodgeUntilObserved}=await import('./input-observation.mjs');
      return retryDodgeUntilObserved({before,startedAt,timeoutMs:3000,record,tap:()=>tap(dodge),read:()=>page.evaluate(()=>{
        const w=freshDiagnostics().world,last=w.events.findLast(event=>event.type==='dodge'&&event.source==='player');
        return {mode:w.mode,dodges:w.totals.dodges,worldTime:w.time,lastDodgeEventTime:last?.time??null,browserObservedAtMs:Date.now()};
      })});
    };
    const tapLockUntilObserved=async targetId=>{
      await tap(lock);const acknowledgementDeadline=Date.now()+3000;
      do{
        const observed=await page.evaluate(()=>({mode:freshDiagnostics().world.mode,locked:freshDiagnostics().world.locked}));
        if(observed.mode!=='playing')throw new Error(`Mission ended before the ${targetId} lock was acknowledged`);
        if(observed.locked===targetId)return;
        await page.waitForTimeout(50);
      }while(Date.now()<acknowledgementDeadline);
      throw new Error(`${targetId} lock was not observed before its 3000ms input deadline`);
    };
    const waitForRetainerLockAfterPair=async beforeDodges=>{
      const acknowledgementDeadline=Date.now()+3000;let observed=null,pairActivityObserved=false;
      do{
        observed=await page.evaluate(()=>({mode:freshDiagnostics().world.mode,locked:freshDiagnostics().world.locked,dodges:freshDiagnostics().world.totals.dodges}));
        pairActivityObserved ||= observed.locked!==null||observed.dodges>beforeDodges;
        if(observed.mode!=='playing')throw new Error('Mission ended before combined lock and dodge input was acknowledged');
        if(observed.locked==='retainer')return observed;
        // Do not resend the still-pending lock pulse: a second accepted lock
        // would toggle the target back off. Wait for a rendered simulation
        // frame, which can lag the 160ms physical pulse under CI recording.
        await page.waitForTimeout(50);
      }while(Date.now()<acknowledgementDeadline);
      throw new Error(`Retainer lock was not observed before its 3000ms paired-input deadline (pair activity: ${pairActivityObserved})`);
    };
    const deadline=Date.now()+180000,lastSample={value:-Infinity},touchSession=createTouchPlaythroughSession();let kills=-1;result.guardObserved=false;result.blockOrParryObserved=false;
    while(Date.now()<deadline){
      const w=await page.evaluate(()=>freshDiagnostics().world);
      result.guardObserved ||= w.player.state==='guard';result.blockOrParryObserved ||= w.events.some(event=>event.type==='block'||event.type==='parry');
      if(w.totals.kills!==kills){result.checkpoints.push(w);kills=w.totals.kills;mark(item,'kills',kills);}
      if(w.mode!=='playing'){
        if(w.mode==='victory'){
          result.victoryObservedElapsedMs=Date.now()-(deadline-180000);
          if(!result.signalLit){result.signalLit={time:w.time,position:{x:w.player.x,z:w.player.z},event:w.events.find(event=>event.type==='signal')??null};mark(item,'signal-lit',result.signalLit);}
        }
        break;
      }
      observe(result,item,w,lastSample);
      if(!result.rejoinApproach&&usesRejoinVista(w)){
        if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
        const camera=await waitForComposition(page,'rejoinVistaFrames','rejoinComposition',deadline);
        result.rejoinApproach={time:w.time,position:{x:w.player.x,z:w.player.z},camera};
        mark(item,'rejoin-approach',result.rejoinApproach);await page.waitForTimeout(1200);continue;
      }
      if(result.rejoin&&!result.rejoinCameraSettled){
        if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
        result.rejoinDefense={};
        const controls=touchRejoinControls({contacts,begin,end,send:params=>cdp.send('Input.dispatchTouchEvent',params),
          guard,stick,pulseLock:()=>tap(lock)});
        await settleRejoinAndLock(page,controls,{
          deadline,progress:result.rejoinDefense,
          onSettled:camera=>{result.rejoinCameraSettled=camera;mark(item,'rejoin-camera-settled',camera);},
          onLock:lock=>mark(item,'rejoin-lock-acknowledged',lock)
        });
        assert.equal(result.rejoinCameraSettled.mode,'playing');assert.equal(result.rejoinCameraSettled.locked,null);assert.equal(result.rejoinCameraSettled.playerState,'guard');
        assert.ok(result.rejoinCameraSettled.downAngleDegrees<=30);continue;
      }
      if(!result.arrivalView&&canLightSignal(w)){
        if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
        const camera=await waitForComposition(page,'arrivalOverviewFrames','arrivalComposition',deadline);
        result.arrivalView={time:w.time,position:{x:w.player.x,z:w.player.z},camera};
        mark(item,'post-rejoin-shrine-view',result.arrivalView);await page.waitForTimeout(900);continue;
      }
      if(!result.arrival&&canLightSignal(w)){
        if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
        const objective=await page.locator('#objective').innerText();
        result.arrival={time:w.time,position:{x:w.player.x,z:w.player.z},distance:Math.hypot(w.player.x-SIGNAL.x,w.player.z-SIGNAL.z),objective};
        assert.match(objective,/E または「灯す」で、谷へ合図を送る/);assert.equal(await page.locator('[data-action=lock]').innerText(),'灯す');mark(item,'destination-arrival',result.arrival);await page.waitForTimeout(900);continue;
      }
      const action=touchPlaythroughAction(w,'left',touchSession);
      if(action.guard&&!contacts.has(1))await begin(1,guard);if(!action.guard&&contacts.has(1))await end(1);
      if(action.lockAndDodge){
        await tapPair(lock,dodge);
        const paired=await waitForRetainerLockAfterPair(w.totals.dodges);
        if(paired.dodges<=w.totals.dodges)await tapDodgeUntilObserved(w.totals.dodges);
      }
      else if(action.dodge)await (action.dodgeNeedsAcknowledgement?tapDodgeUntilObserved(w.totals.dodges):tap(dodge));else if(action.lock){
        if(canLightSignal(w)&&!result.signalInput){result.signalInput={time:w.time,input:'touch-lock',position:{x:w.player.x,z:w.player.z}};mark(item,'signal-input',result.signalInput);}
        await (action.targetId?tapLockUntilObserved(action.targetId):tap(lock));
      }else if(action.attack)await tap(attack);
      else if(action.x||action.z){
        await begin(4,stick);contacts.set(4,{x:stick.x+action.x*32,y:stick.y+action.z*32,id:4});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[...contacts.values()]});await page.waitForTimeout(100);await end(4);await page.waitForTimeout(40);
      }else await page.waitForTimeout(80);
    }
    if(contacts.size)await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});contacts.clear();
    result.after=await page.evaluate(()=>freshDiagnostics().world);assertRoute(result,'left');result.camera=await cameraContract(page);
    assert.ok(Math.hypot(result.after.player.dodgeX,result.after.player.dodgeZ)>.5&&result.guardObserved&&result.blockOrParryObserved);
    assert.equal(await page.locator('#menu').getAttribute('data-mode'),'victory');
    assert.match(await page.locator('#objective').innerText(),/社の灯が、谷への合図になった/);
    assert.deepEqual(await page.locator('#message').locator(':scope > *').allTextContents(),ENDING_PHRASES);
    await page.waitForTimeout(500);assert.equal(await page.locator('#hud').isHidden(),true);
    mark(item,'victory');await page.screenshot({path:new URL('touch-left-victory.png',out).pathname});await page.locator('#start').tap();
    result.retry=await page.evaluate(()=>freshDiagnostics().world);assertRetry(result.retry);mark(item,'clean-retry');assert.deepEqual(errors,[]);
  }catch(error){report.result='failed';result.failure=String(error);result.failureState=await page.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;}
  report.missions.touchLeft=result;await finish(context,video,item);await browser.close();
}

for(const [name,route] of [['desktopRight',runDesktopRight],['touchLeft',runTouchLeft]]){
  try{await route();}
  catch(error){report.result='failed';(report.setupOrShutdownFailures??=[]).push({name,failure:String(error)});process.exitCode=1;}
}
await persist();console.log(JSON.stringify(report));
