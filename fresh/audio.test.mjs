import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUND_CATEGORIES,EVENT_SOUNDS,soundForEvent,footSurfaceAt,generateSound,createEventReader,createFootstepTracker,createGameAudio,ambienceIntensity,footstepMix} from './audio.js';
import {measureSound} from './audio-analysis.mjs';
import {createWorld} from './simulation.js';

// PCM and scheduling regressions; neither is an independent listening verdict.
test('every generated material is finite, bounded, non-silent and has silent endpoints',()=>{
  for(const name of Object.keys(SOUND_CATEGORIES)){
    const {data}=generateSound(name);let peak=0,energy=0;
    for(const value of data){assert.ok(Number.isFinite(value));peak=Math.max(peak,Math.abs(value));energy+=value*value;}
    assert.ok(peak>.002,`${name} is silent`);assert.ok(peak<=.751,`${name} exceeded source headroom`);
    assert.ok(energy>0);assert.equal(data[0],0);assert.equal(data.at(-1),0);
    assert.notDeepEqual(data,generateSound(name,1).data,`${name} variants must differ`);
  }
});
test('all emitted current simulation event types have an explicit sound mapping',async()=>{
  const {readFile}=await import('node:fs/promises');const source=await readFile(new URL('./simulation.js',import.meta.url),'utf8');
  const types=[...source.matchAll(/event\(w,\s*'([^']+)'/g)].map(match=>match[1]);
  assert.ok(types.length>=10);for(const type of types)assert.ok(EVENT_SOUNDS[type],type);
});
test('exploration encounters retain their own material and discovery cue',()=>{
  for(const [encounter,name] of Object.entries({water:'water',leaves:'leaves',birds:'birds',gust:'wind'}))assert.equal(soundForEvent({type:'environment-encounter',encounter}),name);
  assert.equal(soundForEvent({type:'discovery'}),'discovery');assert.equal(soundForEvent({type:'exploration-loop'}),'rejoin');
});
test('same-tick hit and death and duplicate-type events all deliver once across array pruning',()=>{
  const reader=createEventReader(),a={type:'hit',time:2},b={type:'death',time:2},c={type:'hit',time:2};
  assert.deepEqual(reader.read([a,b,c]),[a,b,c]);assert.deepEqual(reader.read([b,c]),[]);
  const next={type:'hit',time:2};assert.deepEqual(reader.read([b,c,next]),[next]);
  reader.reset();assert.deepEqual(reader.read([a]),[a]);
});
test('walk contacts follow real position and elapsed time, ignoring wall push, repeat frames and dodge',()=>{
  const world=createWorld(),tracker=createFootstepTracker();tracker.update(world);
  const travel=(distance,seconds)=>{world.time+=seconds;world.player.x+=distance;return tracker.update(world);};
  world.player.stride=40;assert.deepEqual(travel(0,.3),[],'intended stride cannot produce wall footsteps');
  assert.deepEqual(travel(.71,.71/1.8),[]);
  let steps=travel(.01,.01/1.8);assert.equal(steps.length,1);assert.equal(steps[0].right,true);
  steps=travel(.72,.4);assert.equal(steps.length,1);assert.equal(steps[0].right,false);
  assert.deepEqual(tracker.update(world),[],'the same simulation snapshot cannot replay contact');
  world.player.state='dodge';assert.deepEqual(travel(.8,.2),[]);
  world.player.state='idle';assert.deepEqual(travel(0,.2),[]);
  tracker.reset();assert.deepEqual(tracker.update(world),[]);
});
test('a 250ms movement frame uses 3.8m/s running stride and does not sound the old .72m contact',()=>{
  const world=createWorld(),tracker=createFootstepTracker();tracker.update(world);
  world.time=.25;world.player.x=.95;assert.deepEqual(tracker.update(world),[]);
  world.time+=.18/3.8;world.player.x+=.18;
  const steps=tracker.update(world);assert.equal(steps.length,1);assert.equal(steps[0].right,true);
});
test('walk-to-run-to-walk preserves contact phase and alternating feet without replay at speed changes',()=>{
  const world=createWorld(),tracker=createFootstepTracker();tracker.update(world);const heard=[];
  const travel=(distance,speed)=>{world.time+=distance/speed;world.player.x+=distance;const steps=tracker.update(world);heard.push(...steps.map(step=>step.right));return steps.length;};
  assert.equal(travel(.36,1.8),0); // Half of one walking step.
  assert.equal(travel(.56,3.8),1); // Half of one running step completes it.
  assert.equal(travel(1.12,3.8),1);
  world.time+=3;assert.deepEqual(tracker.update(world),[],'stopping must retain phase without advancing');
  world.player.stride+=100;world.time+=.25;assert.deepEqual(tracker.update(world),[],'blocked running is silent');
  assert.equal(travel(.73,1.8),1);
  assert.deepEqual(heard,[true,false,true]);
});
test('steady walk and run contact counts are independent of 60Hz versus 250ms delivery',()=>{
  const capture=(speed,dt)=>{
    const world=createWorld(),tracker=createFootstepTracker();tracker.update(world);const feet=[];
    const frames=Math.round(3.75/dt);
    for(let i=1;i<=frames;i++){world.time=i*dt;world.player.x=speed*world.time;feet.push(...tracker.update(world).map(step=>step.right));}
    return feet;
  };
  for(const [speed,count] of [[1.8,9],[3.8,12]]){
    const regular=capture(speed,1/60),dropped=capture(speed,.25);
    assert.equal(regular.length,count);assert.deepEqual(dropped,regular);
    assert.ok(regular.every((right,index)=>right===(index%2===0)));
  }
});
class Parameter{constructor(){this.value=0;}cancelScheduledValues(){}setValueAtTime(value){this.value=value;}linearRampToValueAtTime(value){this.value=value;}setTargetAtTime(value){this.value=value;}}
class Node{constructor(){this.gain=new Parameter();this.pan=new Parameter();this.playbackRate=new Parameter();this.connected=true;this.stopped=false;}connect(node){this.destination=node;return node;}disconnect(){this.connected=false;}start(at){this.started=true;this.at=at;}stop(){this.stopped=true;}}
class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination=new Node();this.sources=[];this.gains=[];}
  createGain(){const gain=new Node();this.gains.push(gain);return gain;}createStereoPanner(){return new Node();}
  createBuffer(channels,length,sampleRate){return{copyToChannel(){},duration:length/sampleRate};}
  createBufferSource(){const node=new Node();this.sources.push(node);return node;}
  resume(){this.state='running';return Promise.resolve();}suspend(){this.state='suspended';return Promise.resolve();}
}
test('audio lifecycle consumes all events, cancels all voices, and starts one ambience bed per resume',async()=>{
  const context=new Context(),audio=createGameAudio({context}),world=createWorld();
  const resume=audio.resume(world);audio.update(world,.01);
  assert.equal(context.sources.length,0,'do not start a second bed before resume settles');await resume;
  audio.update(world,.01);assert.equal(audio.diagnostics().categories.wind,1);
  world.events.push({type:'hit',time:1,target:'player'},{type:'death',time:1,target:'sentinel'});
  assert.equal(audio.update(world,.01).length,2);
  assert.equal(audio.diagnostics().categories.hit,1);assert.equal(audio.diagnostics().categories.death,1);
  audio.update(world,.01);assert.equal(audio.diagnostics().categories.hit,1);
  audio.pause();assert.equal(audio.diagnostics().liveVoices,0);assert.ok(context.sources.every(source=>source.stopped&&!source.connected));
  await audio.resume(world);audio.update(world,.01);assert.equal(audio.diagnostics().categories.wind,2);
  assert.equal(audio.diagnostics().categories.hit,1,'resume does not replay retained events');
  const pending=audio.resume(world);audio.pause();await pending;audio.update(world,.01);
  assert.equal(audio.diagnostics().liveVoices,0,'stale resume cannot restart sound');
  const retry=createWorld();await audio.resume(retry);audio.update(retry,.01);
  assert.equal(audio.diagnostics().categories.wind,3);assert.equal(audio.diagnostics().steps,0);
  audio.pause();
});

test('band measurement locates a known low tone and a known fibre-band tone',()=>{
  for(const [hz,band] of [[100,'below200Hz'],[2000,'1000to4000Hz']]){
    const tone=Float32Array.from({length:24000},(_,i)=>Math.sin(2*Math.PI*hz*i/24000)*.2),measurement=measureSound(tone);
    assert.ok(measurement.bands[band].energyFraction>.99);
    assert.ok(Math.abs(measurement.rms-.2/Math.sqrt(2))<1e-6);
  }
});
test('air and woven-sole spectra do not regain the old sub-200Hz roar or heel thump',()=>{
  for(let variant=0;variant<4;variant++)for(const name of ['wind','footStone','footEarth']){
    const {data,sampleRate}=generateSound(name,variant),m=measureSound(data,sampleRate);
    assert.ok(m.bands.below200Hz.energyFraction<.14,`${name}/${variant} low-frequency energy ${m.bands.below200Hz.energyFraction}`);
    assert.ok(m.bands['200to1000Hz'].energyFraction>.10,`${name}/${variant} must retain contact/air body, not only hiss`);
    if(name!=='wind')assert.ok(m.energy10to90Ms<100,`${name}/${variant} contact became a sustained impact`);
  }
});
test('leaf packets have audible pauses within the buffer instead of a continuous dense wash',()=>{
  for(let variant=0;variant<3;variant++){
    const m=measureSound(generateSound('leaves',variant).data);
    assert.ok(m.active20msFramesFraction<.6);
  }
});
test('walk and run change contact force without transposing the sole into a bass impact',()=>{
  const walk=footstepMix(1.8),run=footstepMix(3.8);
  assert.ok(run.gain>walk.gain&&walk.gain>footstepMix(.4).gain);
  assert.ok(run.gain/walk.gain<1.5);
  assert.ok(walk.rate>.98&&run.rate<1.06);
  assert.ok(run.clothGain<run.gain*.2);
});
test('wind has its own bounded slow bus and sparse schedule while contacts keep the master gain',async()=>{
  const context=new Context(),audio=createGameAudio({context}),world=createWorld();await audio.resume(world);audio.update(world,0);
  const master=context.gains[0],air=context.gains[1],wind=context.sources[0];
  assert.equal(wind.destination.destination.destination,air);
  assert.equal(air.destination,master);assert.equal(master.gain.value,.78);
  assert.ok(ambienceIntensity(-1)>=.55);assert.ok(ambienceIntensity(2)<=.8);
  world.time=.4;world.player.x+=.72;context.currentTime=.4;audio.update(world,.4);
  const foot=context.sources.find(source=>source.buffer.duration===SOUND_CATEGORIES.footStone);
  assert.ok(foot);assert.equal(foot.destination.destination.destination,master);
  assert.ok(foot.destination.gain.value<.8);
  for(let i=5;i<=900;i++){world.time=context.currentTime=i/10;audio.update(world,.1);}
  for(const [duration,minimum,maximum] of [[SOUND_CATEGORIES.wind,9.6,10.5],[SOUND_CATEGORIES.leaves,5.8,11.1]]){
    const times=context.sources.filter(source=>source.buffer.duration===duration).map(source=>source.at);
    assert.ok(times.length>=5);
    for(let i=1;i<times.length;i++){const gap=times[i]-times[i-1];assert.ok(gap>=minimum-1e-8&&gap<=maximum+1e-8,`ambient interval ${gap}`);}
  }
  assert.equal(master.gain.value,.78);audio.pause();assert.equal(audio.diagnostics().liveVoices,0);
});

test('foot materials follow both branch tiles, rejoin, paving ends and optional stone pads',()=>{
  for(const [x,z] of [[0,18],[-3.45,-9],[4.55,-9],[0,-18],[0,-19],[-28,-2],[30,8.4]])assert.equal(footSurfaceAt(x,z),'footStone',`${x},${z}`);
  for(const [x,z] of [[0,-9],[-3.45-1,-9],[4.55+1,-9],[0,-20],[0,25],[-17,19],[30,10],[-28,-1.6]])assert.equal(footSurfaceAt(x,z),'footEarth',`${x},${z}`);
});
test('delayed resume keeps same-tick events after pruning, while pause and retry discard their old queue',async()=>{
  const context=new Context();let resolve;
  context.resume=()=>new Promise(done=>{resolve=()=>{context.state='running';done();};});
  const audio=createGameAudio({context}),world=createWorld();const resume=audio.resume(world);
  const hit={type:'hit',time:1,target:'player'},death={type:'death',time:1,target:'sentinel'};
  world.events=[hit,death];assert.deepEqual(audio.update(world,.1),[hit,death]);
  assert.equal(audio.diagnostics().pendingEvents,2);world.events=[];audio.update(world,.1);
  resolve();await resume;audio.update(world,.1);
  assert.equal(audio.diagnostics().categories.hit,1);assert.equal(audio.diagnostics().categories.death,1);assert.equal(audio.diagnostics().pendingEvents,0);
  const pausedResume=audio.resume(world);world.events=[{type:'hit',time:2,target:'player'}];audio.update(world,.1);audio.pause();resolve();await pausedResume;
  assert.equal(audio.diagnostics().pendingEvents,0);
  const again=audio.resume(world);resolve();await again;audio.update(world,.1);assert.equal(audio.diagnostics().categories.hit,1,'paused event must not replay');
  const old=audio.resume(world);world.events=[{type:'hit',time:3,target:'player'}];audio.update(world,.1);const finishOld=resolve;
  const retryWorld=createWorld(),retry=audio.resume(retryWorld);finishOld();await old;resolve();await retry;audio.update(retryWorld,.1);
  assert.equal(audio.diagnostics().categories.hit,1,'retry cannot inherit an unheard old event');audio.pause();
});
