// Browser apparatus only: observes diagnostics and delivers ordinary controls.
// Never pauses the simulation, changes an actor, or relaxes a camera contract.
import { OBSTACLES } from './simulation.js';

export const COMPOSITION_TIMEOUT_MS=45000;
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const nearestEnemy=world=>world.enemies.filter(enemy=>enemy.hp>0)
  .sort((a,b)=>distance(world.player,a)-distance(world.player,b))[0]??null;

export function compositionReady(camera,framesKey,compositionKey){
  const composition=camera[compositionKey];
  const composed=camera[framesKey]>0&&composition&&Object.values(composition).every(subject=>subject.inFrame);
  return !!composed&&(framesKey==='rejoinVistaFrames'
    ? Number.isFinite(camera.rejoinFrameError)&&camera.rejoinFrameError<=.18&&camera.rejoinSightlineClearance>.3
    : Number.isFinite(camera.arrivalFrameError)&&camera.arrivalFrameError<=.18);
}

async function snapshot(page){
  return page.evaluate(()=>{
    const {world,camera,render}=freshDiagnostics();
    return {world,camera,renderFrame:render.frame};
  });
}

function observe(progress,state,now){
  const {world,camera,renderFrame}=state,p=world.player;
  const observation={elapsedMs:now-progress.startedAt,renderFrame,worldTime:world.time,mode:world.mode,
    player:{x:p.x,z:p.z,yaw:p.yaw,hp:p.hp,posture:p.posture,state:p.state},locked:world.locked,
    enemies:world.enemies.filter(enemy=>enemy.hp>0).map(({id,x,z,hp,state})=>({id,x,z,hp,state})),
    camera:{frame:camera.frame,rejoinVistaFrames:camera.rejoinVistaFrames,rejoinFrameError:camera.rejoinFrameError,
      rejoinSightlineClearance:camera.rejoinSightlineClearance,arrivalOverviewFrames:camera.arrivalOverviewFrames,
      arrivalFrameError:camera.arrivalFrameError}};
  progress.last=observation;
  if(progress.samples.at(-1)?.renderFrame!==renderFrame){
    if(progress.samples.length<200)progress.samples.push(observation);else progress.omitted++;
  }
}

function failure(message,progress){
  progress.status='failed';progress.failure=message;
  return new Error(`${message}; last rendered observation: ${JSON.stringify(progress.last)}`);
}

export async function waitForComposition(page,framesKey,compositionKey,
  {deadline=Infinity,progress={},now=Date.now}={}){
  Object.assign(progress,{kind:framesKey,startedAt:now(),status:'waiting',samples:[],omitted:0});
  const until=Math.min(deadline,progress.startedAt+COMPOSITION_TIMEOUT_MS);
  while(now()<until){
    const state=await snapshot(page);observe(progress,state,now());
    if(state.world.mode!=='playing')throw failure('Mission ended during composition wait',progress);
    if(compositionReady(state.camera,framesKey,compositionKey)){
      if(now()>=until)break;
      progress.status='passed';progress.elapsedMs=now()-progress.startedAt;
      return {frames:state.camera[framesKey],composition:state.camera[compositionKey],frame:state.camera.frame,
        progress:{elapsedMs:progress.elapsedMs,renderFramesObserved:progress.samples.length,
          firstRenderFrame:progress.samples[0]?.renderFrame,lastRenderFrame:state.renderFrame}};
    }
    await page.waitForTimeout(Math.min(100,Math.max(0,until-now())));
  }
  throw failure('Composition did not satisfy its unchanged gate within the 45000ms/mission deadline',progress);
}

export function postRejoinCameraState({world,camera}){
  const frame=camera.frame,horizontal=Math.hypot(frame.x-frame.lookX,frame.z-frame.lookZ);
  const downAngleDegrees=Math.atan2(frame.y-frame.lookY,horizontal)*180/Math.PI;
  return {mode:world.mode,locked:world.locked,playerState:world.player.state,frame,horizontal,downAngleDegrees};
}

// Use the existing collision geometry to select a clear escape segment. A
// lateral retreat avoids the shrine directly behind the arrival position.
// The authored arena bounds are supplied by the caller if its map changes.
export function rejoinRetreatVector(world,{obstacles=OBSTACLES,bounds={minX:-12.5,maxX:12.5,minZ:-27.5,maxZ:22.5}}={}){
  const p=world.player,enemy=nearestEnemy(world);
  if(!enemy||distance(p,enemy)>=6.5)return {x:0,z:0,targetId:enemy?.id??null};
  const directions=[[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  const clear=point=>point.x>=bounds.minX&&point.x<=bounds.maxX&&point.z>=bounds.minZ&&point.z<=bounds.maxZ&&
    !obstacles.some(o=>Math.abs(point.x-o.x)<o.w/2+.4&&Math.abs(point.z-o.z)<o.d/2+.4);
  const choices=directions.map(([x,z])=>{
    const n=Math.hypot(x,z),heading={x:x/n,z:z/n};
    const points=[.35,.8,1.4,2.2].map(travel=>({x:p.x+heading.x*travel,z:p.z+heading.z*travel}));
    return {x,z,score:points.every(clear)?distance(points.at(-1),enemy)+(z===0?.05:0):-Infinity};
  }).filter(choice=>choice.score>distance(p,enemy));
  choices.sort((a,b)=>b.score-a.score);
  if(!choices.length)throw new Error('No collision-safe rejoin retreat increases separation from the live enemy');
  return {x:choices[0].x,z:choices[0].z,targetId:enemy.id};
}

export function keyboardRejoinControls(page,held){
  return {
    async guard(){if(!held.has('KeyQ')){await page.keyboard.down('KeyQ');held.add('KeyQ');}},
    async move(x,z){
      const wanted=new Set();if(x)wanted.add(x>0?'KeyD':'KeyA');if(z)wanted.add(z>0?'KeyS':'KeyW');
      for(const key of ['KeyW','KeyA','KeyS','KeyD'])if(held.has(key)&&!wanted.has(key)){await page.keyboard.up(key);held.delete(key);}
      for(const key of wanted)if(!held.has(key)){await page.keyboard.down(key);held.add(key);}
    },
    pulseLock:()=>page.keyboard.press('KeyE')
  };
}

export function touchRejoinControls({contacts,begin,end,send,guard,stick,pulseLock}){
  let previous='0,0';
  return {
    async guard(){if(!contacts.has(1))await begin(1,guard);},
    async move(x,z){
      const next=`${x},${z}`;if(next===previous)return;
      if(!x&&!z){if(contacts.has(4))await end(4);}
      else{
        if(!contacts.has(4))await begin(4,stick);
        contacts.set(4,{x:stick.x+x*32,y:stick.y+z*32,id:4});
        await send({type:'touchMove',touchPoints:[...contacts.values()]});
      }
      previous=next;
    },
    pulseLock
  };
}

export async function settleRejoinAndLock(page,controls,
  {deadline=Infinity,progress={},onSettled=()=>{},onLock=()=>{},now=Date.now,retreatOptions}={}){
  Object.assign(progress,{kind:'rejoin-defense',startedAt:now(),status:'spacing',samples:[],omitted:0,lockPulses:0});
  const until=Math.min(deadline,progress.startedAt+COMPOSITION_TIMEOUT_MS);
  let settled=null,state=null;
  if(now()>=until)throw failure('Mission deadline elapsed before rejoin defense could begin',progress);
  await controls.guard();
  try{
    while(now()<until){
      state=await snapshot(page);observe(progress,state,now());
      if(state.world.mode!=='playing')throw failure('Mission ended during the guarded rejoin retreat',progress);
      if(state.world.locked!==null)throw failure('Rejoin descent started with a live lock',progress);
      const camera=postRejoinCameraState(state),enemy=nearestEnemy(state.world);
      const safe=!enemy||distance(state.world.player,enemy)>=5.2;
      if(safe&&camera.playerState==='guard'&&Number.isFinite(camera.downAngleDegrees)&&camera.downAngleDegrees<=30){
        await controls.move(0,0);
        // Observe the released movement before recording the settled frame.
        state=await snapshot(page);observe(progress,state,now());
        settled=postRejoinCameraState(state);
        if(settled.mode==='playing'&&settled.locked===null&&settled.playerState==='guard'&&settled.downAngleDegrees<=30){
          if(now()>=until){settled=null;break;}
          progress.settled=settled;onSettled(settled);break;
        }
        settled=null;
      }
      const direction=rejoinRetreatVector(state.world,retreatOptions);
      await controls.move(direction.x,direction.z);
      await page.waitForTimeout(Math.min(80,Math.max(0,until-now())));
    }
    if(!settled)throw failure('Guarded rejoin camera did not settle within the 45000ms/mission deadline',progress);
    const target=nearestEnemy(state.world);
    if(target){
      if(distance(state.world.player,target)>=12)throw failure('Rejoin target is outside the unchanged lock radius',progress);
      if(now()>=deadline)throw failure('Mission deadline elapsed before the guarded rejoin lock pulse',progress);
      // Guard remains held across the one delivered pulse and acknowledgement.
      progress.status='lock-pending';progress.lockTarget=target.id;progress.lockPulses++;
      await controls.pulseLock();
      const acknowledgeUntil=Math.min(deadline,now()+3000);let acknowledged=false;
      while(now()<acknowledgeUntil){
        state=await snapshot(page);observe(progress,state,now());
        if(state.world.mode!=='playing')throw failure('Mission ended before the guarded rejoin lock was acknowledged',progress);
        if(state.world.locked===target.id){
          if(now()>=acknowledgeUntil)break;
          progress.lockAcknowledged={targetId:target.id,worldTime:state.world.time,hp:state.world.player.hp,
            playerState:state.world.player.state,position:{x:state.world.player.x,z:state.world.player.z}};
          onLock(progress.lockAcknowledged);acknowledged=true;break;
        }
        await page.waitForTimeout(Math.min(50,Math.max(0,acknowledgeUntil-now())));
      }
      if(!acknowledged)throw failure('The single guarded rejoin lock pulse was not acknowledged within 3000ms/mission deadline',progress);
    }
    progress.status='passed';progress.elapsedMs=now()-progress.startedAt;
    return settled;
  }catch(error){
    progress.status='failed';progress.failure??=String(error);throw error;
  }finally{await controls.move(0,0);}
}
