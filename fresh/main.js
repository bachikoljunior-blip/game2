import './styles.css';
import {createWorld,advance} from './simulation.js';
import {createPresentation} from './presentation.js';
import {createInput} from './input.js';
const canvas=document.querySelector('#scene'),menu=document.querySelector('#menu'),hud=document.querySelector('#hud'),
  message=document.querySelector('#message'),start=document.querySelector('#start'),notice=document.querySelector('#notice');
let view,world=createWorld(),running=false,paused=false,last=0,audio=null,lastSound=-1,contextLost=false;
function pause(){if(!running)return;running=false;paused=true;input.setActive(false);menu.hidden=false;message.textContent='風の中で、ひと息。';start.textContent='続ける';audio?.suspend();}
const input=createInput(canvas,pause);
try{view=createPresentation(canvas);}catch(e){message.textContent='描画を開始できませんでした。WebGLが利用可能なブラウザで再読み込みしてください。';start.disabled=true;throw e;}
function sound(type){if(!audio||audio.state!=='running')return;const o=audio.createOscillator(),g=audio.createGain();o.type=type==='parry'?'triangle':'sine';o.frequency.setValueAtTime(type==='parry'?1500:160,audio.currentTime);o.frequency.exponentialRampToValueAtTime(70,audio.currentTime+.15);g.gain.setValueAtTime(.12,audio.currentTime);g.gain.exponentialRampToValueAtTime(.001,audio.currentTime+.2);o.connect(g).connect(audio.destination);o.start();o.stop(audio.currentTime+.21);o.onended=()=>{o.disconnect();g.disconnect();};}
start.addEventListener('click',()=>{
  if(contextLost)return;
  if(!paused){world=createWorld();lastSound=-1;}paused=false;running=true;menu.hidden=true;hud.hidden=false;notice.textContent='';input.setActive(true);last=performance.now();
  try{audio??=new AudioContext();audio.resume().catch(()=>{});}catch{/* Sound availability does not prevent playing. */}
});
document.querySelector('#pause').addEventListener('click',pause);
window.addEventListener('resize',()=>view.resize());
canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();contextLost=true;pause();start.disabled=true;message.textContent='描画を復旧しています…';});
canvas.addEventListener('webglcontextrestored',()=>{contextLost=false;start.disabled=false;message.textContent='描画が復旧しました。';view.resize();});
function frame(now){
  requestAnimationFrame(frame);const dt=last?Math.min(.25,(now-last)/1000):0;last=now;
  if(running){if(advance(world,dt,input.sample()))input.consume();
    document.querySelector('#health i').style.width=world.player.hp+'%';
    document.querySelector('#posture i').style.width=Math.min(100,world.player.posture)+'%';
    const near=world.enemies.filter(e=>e.hp>0).sort((a,b)=>Math.hypot(a.x-world.player.x,a.z-world.player.z)-Math.hypot(b.x-world.player.x,b.z-world.player.z))[0];
    const locked=world.enemies.find(e=>e.id===world.locked);
    document.querySelector('#enemy').textContent=locked?`対峙　${locked.hp} / 100`:'';
    document.querySelector('#objective').textContent=world.totals.kills?'社へ進む　残る剣士 '+(3-world.totals.kills):world.player.z<10?'構えを読む。弾いて、斬る。':'鳥居の先へ進む';
    const e=world.events.at(-1);if(e&&e.time>lastSound){lastSound=e.time;sound(e.type);notice.textContent=e.type==='parry'?'弾き':e.type==='block'?'受け':e.type==='death'?'決着':'';}
    if(!e)notice.textContent='';
    if(world.mode!=='playing'){running=false;paused=false;input.setActive(false);menu.hidden=false;message.textContent=world.mode==='victory'?'刃を納める。山の風が戻る。':'倒れた先にも、道は続く。';start.textContent='もう一度';}
  }
  if(!contextLost)view.render(world,dt,input.orbit);
}
requestAnimationFrame(frame);
if(new URLSearchParams(location.search).has('diagnostic'))Object.defineProperty(window,'freshDiagnostics',{value:()=>JSON.parse(JSON.stringify({world,running,paused,contextLost,render:view.renderer.info.render})),writable:false});
