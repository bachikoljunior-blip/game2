import test from 'node:test';
import assert from 'node:assert/strict';
import {SOUND_CATEGORIES,EVENT_SOUNDS,soundForEvent,footSurfaceAt,generateSound,createEventReader,createFootstepTracker,createGameAudio} from './audio.js';
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
test('foot contacts follow actual position, alternate every .72m, and ignore wall push and dodge',()=>{
  const world=createWorld(),tracker=createFootstepTracker();tracker.update(world);
  world.player.stride=40;assert.deepEqual(tracker.update(world),[],'intended stride cannot produce wall footsteps');
  world.player.x=.71;assert.deepEqual(tracker.update(world),[]);
  world.player.x=.72;let steps=tracker.update(world);assert.equal(steps.length,1);assert.equal(steps[0].right,true);
  world.player.x=1.44;steps=tracker.update(world);assert.equal(steps.length,1);assert.equal(steps[0].right,false);
  world.player.state='dodge';world.player.x=2.2;assert.deepEqual(tracker.update(world),[]);
  world.player.state='idle';assert.deepEqual(tracker.update(world),[]);
  tracker.reset();assert.deepEqual(tracker.update(world),[]);
});
class Parameter{constructor(){this.value=0;}cancelScheduledValues(){}setValueAtTime(value){this.value=value;}linearRampToValueAtTime(value){this.value=value;}setTargetAtTime(value){this.value=value;}}
class Node{constructor(){this.gain=new Parameter();this.pan=new Parameter();this.playbackRate=new Parameter();this.connected=true;this.stopped=false;}connect(node){return node;}disconnect(){this.connected=false;}start(){this.started=true;}stop(){this.stopped=true;}}
class Context{
  constructor(){this.state='suspended';this.currentTime=0;this.destination=new Node();this.sources=[];}
  createGain(){return new Node();}createStereoPanner(){return new Node();}
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
