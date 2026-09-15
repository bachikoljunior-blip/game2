// Original, boot-generated material sounds. These are synthesized PCM, not
// recordings. The same generator is used by the game and the listening export.
import { advanceLocomotionPhase } from './character-motion.js';
import { distanceFromRoute } from './route-layout.js';
import { EXPLORATION } from './exploration.js';
import { sampleWind } from './wind.js';
const TAU=Math.PI*2;
export const SOUND_CATEGORIES=Object.freeze({
  wind:11.3,leaves:2.1,cloth:.30,footEarth:.19,footStone:.16,swish:.38,
  parry:1.3,block:.68,hit:.34,death:1.15,dodge:.52,evade:.26,
  signal:2.6,victory:4.8,defeat:2.1,route:.38,landmark:.75,rejoin:.55,consequence:.42,water:4.7,birds:2.8,discovery:.9,
});
export const EVENT_SOUNDS=Object.freeze({swing:'swish',dodge:'dodge',evade:'evade',parry:'parry',block:'block',hit:'hit',death:'death',
  signal:'signal',route:'route',landmark:'landmark','route-rejoin':'rejoin','route-consequence':'consequence',
  'environment-encounter':'leaves',discovery:'discovery','exploration-loop':'rejoin'});
export function soundForEvent(event){return event.type==='environment-encounter'?({water:'water',leaves:'leaves',birds:'birds',gust:'wind'}[event.encounter]??'leaves'):EVENT_SOUNDS[event.type];}
export function randomSource(seed){let s=seed>>>0;return()=>{s+=0x6D2B79F5;let t=s;t=Math.imul(t^t>>>15,t|1);t^=t+Math.imul(t^t>>>7,t|61);return((t^t>>>14)>>>0)/4294967296;};}
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const envelope=(t,attack,decay)=>t<0?0:(1-Math.exp(-t/attack))*Math.exp(-t/decay);
// Pressure is the vegetation field's normalized load, not pascals. A dedicated
// air bus follows it slowly; weapon contact and foot weight do not pump with wind.
export const AMBIENCE_MIX=Object.freeze({windGain:.40,leafGain:.24,windInterval:9.6,windJitter:.8,leafInterval:5.8,leafJitter:5.2});
export function ambienceIntensity(pressure){return .55+.25*clamp((pressure-.28)/.44,0,1);}
export function footstepMix(speed){
  const pace=clamp((speed-.4)/3.4,0,1);
  return {gain:.42+.38*pace,rate:.97+.08*pace,clothGain:.07+.07*pace};
}
export function generateSound(name,variant=0,sampleRate=24000){
  if(!(name in SOUND_CATEGORIES))throw new Error(`Unknown generated sound: ${name}`);
  const duration=SOUND_CATEGORIES[name],data=new Float32Array(Math.ceil(duration*sampleRate));
  const seed=Array.from(name).reduce((v,c)=>Math.imul(v,31)+c.charCodeAt(0),73)+variant*997;
  const random=randomSource(seed),detune=.95+random()*.1;
  const grains=Array.from({length:name==='wind'?28:name==='leaves'?36:16},()=>({
    at:random()*duration,width:.025+random()*(name==='wind'?1.7:name==='leaves'?.32:.08),strength:.2+random()*.8,
  }));
  const modes=(base,ratios,decay)=>ratios.map((ratio,i)=>({hz:base*ratio*detune,level:1/(1+i*.8),decay:decay/(1+i*.62)}));
  const metal=modes(name==='parry'?1320:620,[1,1.49,2.13,2.81,3.63],name==='parry'?.44:.15);
  const bell=modes(name==='victory'?246:344,[1,2.71,4.09,5.43],name==='victory'?1.25:.52);
  const harmony=bell.map(m=>({...m,hz:m.hz*1.5})),wood=modes(name==='landmark'?420:240,name==='landmark'?[1,1.83,3.2]:[1,2.18,3.45],name==='landmark'?.09:.065);
  const chirps=Array.from({length:4},(_,index)=>({at:.18+index*.43+random()*.13,hz:2650+random()*1800,length:.048+random()*.046,sweep:600+random()*1300}));
  // Band-limited stochastic material excitation; no bass oscillator represents
  // a sole, and quiet air carries midrange turbulence rather than mic rumble.
  const lowpass=hz=>{let state=0;const a=1-Math.exp(-TAU*hz/sampleRate);return n=>(state+=a*(n-state));};
  const airTop=lowpass(1700),airTop2=lowpass(1700),airFloor=lowpass(200),airFloor2=lowpass(200);
  const soleTop=lowpass(1900),soleTop2=lowpass(1900),soleFloor=lowpass(220),soleFloor2=lowpass(220);
  const fibreTop=lowpass(3900),fibreTop2=lowpass(3900),fibreFloor=lowpass(1000),fibreFloor2=lowpass(1000);
  const materialRandom=randomSource(seed+11317);
  const leafBursts=Array.from({length:5},(_,i)=>({at:.12+i*.35+materialRandom()*.18,width:.035+materialRandom()*.055,gain:.45+materialRandom()*.55}));
  const grit=Array.from({length:7},(_,i)=>({at:.009+i*.013+materialRandom()*.009,width:.002+materialRandom()*.004,gain:.4+materialRandom()*.6}));
  const settle=.027+materialRandom()*.012;
  const contactMaterial=['leaves','cloth','footEarth','footStone'].includes(name);
  const usePockets=name!=='wind'&&!['leaves','footEarth','footStone'].includes(name);
  let low=0,mid=0;
  const resonance=(t,set)=>t<0?0:set.reduce((sum,m)=>sum+Math.sin(TAU*m.hz*t)*Math.exp(-t/m.decay)*m.level,0);
  for(let i=0;i<data.length;i++){
    const t=i/sampleRate,n=random()*2-1;
    low+=.012*(n-low);mid+=.18*(n-mid);const high=n-mid;
    let air=0,sole=0,fibre=0;
    if(name==='wind'){const base=airTop2(airTop(n)),high=base-airFloor(base);air=high-airFloor2(high);}
    if(contactMaterial){
      const base=soleTop2(soleTop(n)),high=base-soleFloor(base);sole=high-soleFloor2(high);
      const top=fibreTop2(fibreTop(n)),fine=top-fibreFloor(top);fibre=fine-fibreFloor2(fine);
    }
    let pockets=0;
    if(usePockets)for(const grain of grains){const q=(t-grain.at)/grain.width;if(Math.abs(q)<3)pockets+=grain.strength*Math.exp(-q*q*3);}
    let value=0;
    switch(name){
      case 'wind':{
        const swell=.69+.17*Math.sin(t*.49+detune*4)+.09*Math.sin(t*1.07+variant);
        value=air*.110*swell;break;
      }
      case 'leaves':{
        let flutter=0;for(const burst of leafBursts){const q=(t-burst.at)/burst.width;flutter+=burst.gain*Math.exp(-q*q*2);}
        value=(fibre*.14+sole*.014)*flutter;break;
      }
      case 'water':value=(mid*.075+high*.042+low*.19)*(.5+pockets*.2);break;
      case 'birds':for(const chirp of chirps){const q=t-chirp.at;if(q>0&&q<chirp.length){const f=q/chirp.length;value+=(Math.sin(TAU*(chirp.hz*q+chirp.sweep*q*q/(2*chirp.length)))+high*.07)*Math.pow(Math.sin(Math.PI*f),2)*.042;}}break;
      case 'discovery':value=resonance(t-.08,bell)*.023*envelope(t-.08,.004,.36)+(mid*.06+high*.01)*envelope(t,.04,.19);break;
      case 'cloth':value=(fibre*.11+sole*.032)*envelope(t,.020,.052)*(1+pockets*.12);break;
      case 'footEarth':case 'footStone':{
        const stone=name==='footStone';
        // Woven sandal contact -> forefoot settlement -> scattered soil/fibre
        // grains. Softer earth spreads the contact; paving has a shorter edge.
        value=(sole*(stone?.40:.29)+fibre*(stone?.041:.025))*envelope(t,stone?.0018:.0035,stone?.010:.015);
        value+=(sole*(stone?.062:.048)+fibre*(stone?.036:.052))*envelope(t-settle,.006,stone?.019:.031);
        let debris=0;for(const grain of grit){const q=(t-grain.at)/grain.width;debris+=grain.gain*Math.exp(-q*q*2);}
        value+=fibre*debris*(stone?.007:.026);break;
      }
      case 'swish':value=(mid*.18+high*.20)*Math.exp(-Math.pow((t-.17)/.055,2))*(.7+pockets*.22);break;
      case 'parry':case 'block':value=resonance(t,metal)*.12*envelope(t,.0008,2)+high*.36*envelope(t,.0007,.018)+mid*.27*envelope(t,.001,.044);break;
      case 'hit':value=(low*3+mid*.42)*envelope(t,.001,.04)+high*.10*envelope(t,.001,.018)+mid*.20*envelope(t-.035,.012,.09);break;
      case 'death':value=(low*2.2+mid*.14)*envelope(t-.24,.004,.095)+(mid*.32+high*.025)*envelope(t-.07,.028,.18)*(1+pockets*.4);break;
      case 'dodge':value=(mid*.43+high*.033)*envelope(t,.045,.13)+(low*1.7+mid*.16)*envelope(t-.34,.002,.035);break;
      case 'evade':value=(mid*.18+high*.1)*Math.exp(-Math.pow((t-.075)/.042,2));break;
      case 'signal':value=(mid*.17+high*.024)*envelope(t,.04,.5)*(1+pockets*.7)+resonance(t-.14,bell)*.058*envelope(t-.14,.002,3);break;
      case 'victory':value=(low*.4+mid*.05)*envelope(t,.4,1.4)+resonance(t-.18,bell)*.045*envelope(t-.18,.005,5)+resonance(t-1.05,harmony)*.031*envelope(t-1.05,.012,4);break;
      case 'defeat':value=(low*.65+mid*.045)*envelope(t,.15,.45)+(low*1.2+mid*.12)*envelope(t-.18,.004,.09);break;
      case 'route':value=(mid*.20+high*.025)*envelope(t,.02,.075)*(1+pockets*.4);break;
      case 'landmark':value=(mid*.10+high*.028)*envelope(t,.045,.19)*pockets+resonance(t,wood)*.025*envelope(t,.001,1);break;
      case 'rejoin':value=(mid*.1+high*.025)*envelope(t,.07,.14)*pockets;break;
      case 'consequence':value=(mid*.30+high*.02)*envelope(t,.02,.12)+resonance(t,wood)*.035*envelope(t,.002,1);break;
    }
    // Both ends reach zero; independently seeded ambience grains overlap and
    // crossfade, rather than repeating a short noise buffer with a hard seam.
    const fadeIn=name==='wind'?2.2:name==='leaves'?.09:.001;
    const fadeOut=name==='wind'?2.5:name==='leaves'?.35:.025;
    data[i]=value*Math.min(1,t/fadeIn)*Math.min(1,(duration-t)/fadeOut);
  }
  let sum=0,peak=0;for(const value of data)sum+=value;
  const mean=sum/data.length;
  for(let i=0;i<data.length;i++){data[i]-=mean*Math.min(1,i/48,(data.length-1-i)/48);peak=Math.max(peak,Math.abs(data[i]));}
  if(peak>.75)for(let i=0;i<data.length;i++)data[i]*=.75/peak;
  data[0]=data[data.length-1]=0;
  return {name,variant,sampleRate,duration,data};
}

// Object identity survives the simulation's rolling event-array filter. Unlike
// a timestamp cursor, this delivers every event when hit/death share one tick.
export function createEventReader(){
  let seen=new WeakSet();
  return {read(events){const fresh=[];for(const event of events){if(!seen.has(event)){seen.add(event);fresh.push(event);}}return fresh;},reset(){seen=new WeakSet();}};
}
// Main paving uses the same branching centre lines and tile span as presentation.
// Optional trails are earth: their timber is upright framing, not a floor. Only
// the actual low stepping stones / valley-frame paving add stone contact there.
export function footSurfaceAt(x,z){
  if(z>=-19&&z<=24&&distanceFromRoute(x,z)<=.65+.2)return 'footStone';
  const onTile=(cx,cz,w,d,yaw=0)=>{const dx=x-cx,dz=z-cz,c=Math.cos(yaw),s=Math.sin(yaw);return Math.abs(c*dx-s*dz)<=w/2+.08&&Math.abs(s*dx+c*dz)<=d/2+.08;};
  const stream=EXPLORATION.points.find(p=>p.id==='stream-stones');
  if(stream)for(let i=-2;i<=2;i++)if(onTile(stream.x,stream.z+i*.8,.88,.53,i*.08))return 'footStone';
  const frame=EXPLORATION.points.find(p=>p.id==='valley-frame');
  if(frame)for(let i=-2;i<=2;i++)if(onTile(frame.x+i*.55,frame.z-1.6,.4,.6))return 'footStone';
  return 'footEarth';
}
export function createFootstepTracker(){
  const actors=new Map();
  return {reset(){actors.clear();},update(world){
    const steps=[];
    for(const actor of [world.player,...world.enemies]){
      let track=actors.get(actor.id);
      if(!track){track={x:actor.x,z:actor.z,time:world.time,cycles:0};actors.set(actor.id,track);continue;}
      const distance=Math.hypot(actor.x-track.x,actor.z-track.z),seconds=world.time-track.time;
      track.x=actor.x;track.z=actor.z;track.time=world.time;
      if(actor.hp<=0||!['idle','guard','run','walk'].includes(actor.state)||distance>3||seconds<=0)continue;
      // Share the actor's unwrapped gait phase. Real simulation elapsed time
      // preserves speed/cadence after dropped frames; changing speed cannot
      // reinterpret old travel or replay a contact from the previous stride.
      const previousContact=Math.floor(track.cycles*2);
      track.cycles=advanceLocomotionPhase(track.cycles,distance,seconds);
      const contact=Math.floor(track.cycles*2);
      for(let index=previousContact+1;index<=contact;index++)
        steps.push({actor,right:index%2===1,surface:footSurfaceAt(actor.x,actor.z),speed:distance/seconds});
    }
    return steps;
  }};
}

export function createGameAudio(options={}){
  let context=options.context??null,master=null,airBus=null,bank=null,active=false,ready=false,muted=false,worldRef=null,epoch=0;
  let nextWind=0,nextLeaves=0,sequence=0,lastMode='playing',orbit=0;
  const pending=[],voices=new Set(),events=createEventReader(),feet=createFootstepTracker(),random=randomSource(8173);
  const counters={events:0,steps:0,unknownEvents:[],categories:{}};
  function init(){
    if(bank)return true;
    try{
      context??=new (globalThis.AudioContext||globalThis.webkitAudioContext)();
      master=context.createGain();master.gain.value=0;master.connect(context.destination);
      airBus=context.createGain();airBus.gain.value=ambienceIntensity(.45);airBus.connect(master);
      bank={};
      for(const name of Object.keys(SOUND_CATEGORIES)){
        bank[name]=Array.from({length:name==='wind'||name==='leaves'?3:4},(_,variant)=>{
          const generated=generateSound(name,variant),buffer=context.createBuffer(1,generated.data.length,generated.sampleRate);
          buffer.copyToChannel(generated.data,0);return buffer;
        });
      }
      return true;
    }catch{return false;}
  }
  function stopAll(){
    for(const voice of [...voices]){
      voice.source.onended=null;
      try{voice.source.stop();}catch{/* already stopped */}
      for(const node of voice.nodes)node.disconnect();voices.delete(voice);
    }
  }
  function spatial(actor,world){
    if(!actor||!world||actor.id==='player')return {gain:1,pan:0};
    const dx=actor.x-world.player.x,dz=actor.z-world.player.z,distance=Math.hypot(dx,dz);
    return {gain:1/(1+distance*.12),pan:clamp((dx*Math.cos(orbit)-dz*Math.sin(orbit))/Math.max(3,distance),-.9,.9)};
  }
  function play(name,{at=context?.currentTime??0,gain=1,pan=0,rate=1}={}){
    if(!bank||!active||!ready||context.state!=='running'||!(name in bank))return;
    const source=context.createBufferSource(),level=context.createGain(),nodes=[source,level];
    source.buffer=bank[name][sequence++%bank[name].length];source.playbackRate.value=rate;
    level.gain.value=gain;source.connect(level);
    const destination=name==='wind'||name==='leaves'?airBus:master;
    if(context.createStereoPanner){const panner=context.createStereoPanner();panner.pan.value=pan;level.connect(panner);panner.connect(destination);nodes.push(panner);}else level.connect(destination);
    const voice={source,nodes};voices.add(voice);
    source.onended=()=>{for(const node of nodes)node.disconnect();voices.delete(voice);};
    source.start(at);counters.categories[name]=(counters.categories[name]??0)+1;
  }
  function reset(world){
    epoch++;pending.length=0;stopAll();events.reset();feet.reset();worldRef=world;lastMode='playing';sequence=0;
    if(world)feet.update(world);nextWind=context?.currentTime??0;nextLeaves=nextWind+.8;
  }
  function resume(world){
    const changed=worldRef!==world;
    if(changed)reset(world);
    active=true;ready=false;const ticket=++epoch;
    if(!init()){active=false;pending.length=0;return Promise.resolve(false);}
    // Resume is called only by the user's Start/Continue gesture. A subsequent
    // pause invalidates this continuation, so it cannot resurrect ambient sound.
    const operation=context.resume?.()??Promise.resolve();
    return Promise.resolve(operation).then(()=>{
      if(ticket!==epoch||!active)return false;
      master.gain.cancelScheduledValues(context.currentTime);
      master.gain.setValueAtTime(0,context.currentTime);
      master.gain.linearRampToValueAtTime(muted?0:.78,context.currentTime+.08);
      ready=true;nextWind=context.currentTime;nextLeaves=nextWind+.6;return true;
    }).catch(()=>{if(ticket===epoch){active=false;ready=false;pending.length=0;}return false;});
  }
  function pause(){
    active=false;ready=false;epoch++;pending.length=0;stopAll();
    if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setValueAtTime(0,context.currentTime);}
    context?.suspend?.().catch(()=>{});
  }
  function update(world,dt,cameraOrbit=0){
    if(worldRef!==world)reset(world);orbit=cameraOrbit;
    const fresh=events.read(world.events);counters.events+=fresh.length;
    if(!active)return fresh;
    pending.push(...fresh);
    // Retained events may age out of world.events while AudioContext.resume()
    // waits. Keep them until the first ready update; pause/retry invalidate them.
    if(!ready||!bank||context.state!=='running')return fresh;
    if(ready&&bank&&context.state==='running'){
      const now=context.currentTime;
      airBus.gain.setTargetAtTime(ambienceIntensity(sampleWind(world.player.x,world.player.z,world.time).pressure),now,.65);
      if(now>=nextWind){play('wind',{gain:AMBIENCE_MIX.windGain,pan:random()*.4-.2});nextWind=now+AMBIENCE_MIX.windInterval+random()*AMBIENCE_MIX.windJitter;}
      if(now>=nextLeaves){play('leaves',{gain:AMBIENCE_MIX.leafGain*(.8+random()*.4),pan:random()*1.4-.7,rate:.96+random()*.08});nextLeaves=now+AMBIENCE_MIX.leafInterval+random()*AMBIENCE_MIX.leafJitter;}
    }
    for(const event of pending.splice(0)){
      const name=soundForEvent(event);
      if(!name){if(!counters.unknownEvents.includes(event.type))counters.unknownEvents.push(event.type);continue;}
      const actor=[world.player,...world.enemies].find(a=>a.id===(event.type==='swing'||event.type==='dodge'?event.source:event.target));
      const position=spatial(actor,world);
      const environmentGain=name==='wind'?.24:name==='leaves'?.34:1;
      play(name,{...position,gain:position.gain*environmentGain,rate:name==='signal'||name==='wind'?1:.96+random()*.08});
      if(name==='swish'||name==='dodge')play('cloth',{...position,gain:position.gain*.45});
    }
    if(world.mode==='playing')for(const step of feet.update(world)){
      counters.steps++;const position=spatial(step.actor,world),contact=footstepMix(step.speed);
      play(step.surface,{...position,gain:position.gain*contact.gain*(.96+random()*.08),pan:clamp(position.pan+(step.right?.045:-.045),-1,1),rate:contact.rate*(.985+random()*.03)});
      play('cloth',{...position,gain:position.gain*contact.clothGain,rate:.96+random()*.08});
    }
    if(world.mode!==lastMode){if(world.mode==='victory'||world.mode==='defeat')play(world.mode);lastMode=world.mode;}
    return fresh;
  }
  return {resume,pause,reset,update,play,
    setMuted(value){muted=!!value;if(master){master.gain.cancelScheduledValues(context.currentTime);master.gain.setTargetAtTime(active&&!muted?.78:0,context.currentTime,.02);}},
    diagnostics(){return {available:!!bank,contextState:context?.state??'unavailable',active,ready,muted,pendingEvents:pending.length,liveVoices:voices.size,...structuredClone(counters),provenance:'Original synthesized PCM generated at startup; no runtime audio files or field recordings.'};},
  };
}
