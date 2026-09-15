import './styles.css';
import './mission.css';
import {createWorld,advance} from './simulation.js';
import {createPresentation} from './presentation.js';
import {createInput} from './input.js';
import {createGameAudio} from './audio.js';
import {explorationText} from './exploration.js';
import {INTRO,ENDING_PHRASES,objectiveText,canLightSignal} from './mission.js';
const canvas=document.querySelector('#scene'),menu=document.querySelector('#menu'),hud=document.querySelector('#hud'),
  message=document.querySelector('#message'),start=document.querySelector('#start'),notice=document.querySelector('#notice'),objective=document.querySelector('#objective'),exploration=document.querySelector('#exploration');
let view,world=createWorld(),running=false,paused=false,last=0,contextLost=false;
const audio=createGameAudio();
const timings={scope:'Actual rAF intervals and JavaScript advance/render call durations in this browser; not isolated GPU time or physical-device performance. Includes each recorded mode; bounded to first3000 callbacks.',samples:[],omitted:0};
let previousFrameStamp=null;
message.textContent=INTRO;
function showEnding(){
  message.replaceChildren(...ENDING_PHRASES.map(text=>{
    const phrase=document.createElement('span');phrase.className='ending-phrase';phrase.textContent=text;return phrase;
  }));
}
menu.dataset.mode='intro';
function pause(){audio.pause();if(!running)return;running=false;paused=true;input.setActive(false);menu.hidden=false;menu.dataset.mode='pause';message.textContent='風の中で、ひと息。';start.textContent='続ける';}
const input=createInput(canvas,pause);
try{view=createPresentation(canvas);}catch(e){message.textContent='描画を開始できませんでした。WebGLが利用可能なブラウザで再読み込みしてください。';start.disabled=true;throw e;}
start.addEventListener('click',()=>{
  if(contextLost)return;
  if(!paused){world=createWorld();view.beginWorld(world);}paused=false;running=true;menu.hidden=true;menu.dataset.mode='playing';hud.hidden=false;notice.textContent='';input.setActive(true);
  audio.resume(world);last=performance.now();
});
document.querySelector('#pause').addEventListener('click',pause);
window.addEventListener('resize',()=>view.resize());
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;pause();start.disabled=true;message.textContent='描画を復旧しています…';});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;start.disabled=false;message.textContent='描画が復旧しました。';view.resize();});
function frame(now){
  requestAnimationFrame(frame);const interval=previousFrameStamp===null?null:now-previousFrameStamp;
  previousFrameStamp=now;const dt=last?Math.min(.25,(now-last)/1000):0;last=now;
  let simulationMs=0;
  if(running){const simulationStart=performance.now();if(advance(world,dt,input.sample()))input.consume();simulationMs=performance.now()-simulationStart;
    document.querySelector('#health i').style.width=world.player.hp+'%';
    document.querySelector('#posture i').style.width=Math.min(100,world.player.posture)+'%';
    const locked=world.enemies.find(e=>e.id===world.locked);
    document.querySelector('#enemy').textContent=locked?`対峙　${locked.hp} / 100`:'';
    const newObjective=objectiveText(world);
    if(objective.textContent!==newObjective)objective.textContent=newObjective;
    const discovery=explorationText(world);if(exploration.textContent!==discovery)exploration.textContent=discovery;exploration.hidden=!discovery;
    const lockButton=document.querySelector('[data-action=lock]'),label=canLightSignal(world)?'灯す':'注視';
    if(lockButton.textContent!==label)lockButton.textContent=label;
    const freshEvents=audio.update(world,dt,input.orbit);
    for(const e of freshEvents)if(['parry','block','death'].includes(e.type))notice.textContent=e.type==='parry'?'弾き':e.type==='block'?'受け':'決着';
    if(!world.events.length)notice.textContent='';
    if(world.mode!=='playing'){running=false;paused=false;input.setActive(false);hud.hidden=true;menu.hidden=false;menu.dataset.mode=world.mode;if(world.mode==='victory')showEnding();else message.textContent='灯はまだ消えている。もう一度、山道へ。';start.textContent='もう一度';}
  }
  // Let generated ambience and the ending's short musical tail finish after
  // simulation ends. A pause, hidden page, or lost context silences all voices.
  if(!running&&!paused&&!contextLost&&world.mode!=='playing')audio.update(world,dt,input.orbit);
  let renderCallMs=null;
  if(!contextLost){const renderStart=performance.now();view.render(world,dt,input.orbit,{animate:running||world.mode==='victory'||world.mode==='defeat'});renderCallMs=performance.now()-renderStart;}
  if(timings.samples.length<3000)timings.samples.push({mode:world.mode,running,intervalMs:interval,simulationMs,renderCallMs});else timings.omitted++;
}
requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('diagnostic'))Object.defineProperty(window,'freshDiagnostics',{value:(includeTimings=false)=>JSON.parse(JSON.stringify({world,running,paused,contextLost,input:{orbit:input.orbit},audio:audio.diagnostics(),render:view.renderer.info.render,camera:view.cameraDiagnostics(),landscape:view.landscapeDiagnostics(),actors:view.actorDiagnostics(),...(includeTimings?{timings}:{})})),writable:false});
