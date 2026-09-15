// Reproducible original-PCM audition. This is a designed listening sequence,
// explicitly not a live gameplay recording or a quality/comparison verdict.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SOUND_CATEGORIES,EVENT_SOUNDS,AMBIENCE_MIX,ambienceIntensity,footstepMix,generateSound} from './audio.js';
const out=new URL(process.env.AUDIO_OUTPUT?`${process.env.AUDIO_OUTPUT.replace(/\/$/,'')}/`:'../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/audio/generated/',import.meta.url);
await mkdir(out,{recursive:true});
const sampleRate=24000;
export function wav(data,channels=1){
  const bytes=Buffer.alloc(44+data.length*2);bytes.write('RIFF');bytes.writeUInt32LE(bytes.length-8,4);bytes.write('WAVEfmt ',8);bytes.writeUInt32LE(16,16);bytes.writeUInt16LE(1,20);bytes.writeUInt16LE(channels,22);bytes.writeUInt32LE(sampleRate,24);bytes.writeUInt32LE(sampleRate*channels*2,28);bytes.writeUInt16LE(channels*2,32);bytes.writeUInt16LE(16,34);bytes.write('data',36);bytes.writeUInt32LE(data.length*2,40);
  data.forEach((value,index)=>bytes.writeInt16LE(Math.round(Math.max(-1,Math.min(1,value))*32767),44+index*2));return bytes;
}
const catalog=[],bank={};
for(const [name,duration] of Object.entries(SOUND_CATEGORIES)){
  const generated=generateSound(name,0,sampleRate);bank[name]=generated.data;
  const bytes=wav(generated.data);await writeFile(new URL(`${name}.wav`,out),bytes);
  let peak=0,energy=0;for(const value of generated.data){peak=Math.max(peak,Math.abs(value));energy+=value*value;}
  catalog.push({name,file:`${name}.wav`,seconds:duration,peak,rms:Math.sqrt(energy/generated.data.length),sha256:createHash('sha256').update(bytes).digest('hex')});
}
const walk=footstepMix(1.8),run=footstepMix(3.8),airGain=ambienceIntensity(.45);
const timeline=[
  ['wind',0,AMBIENCE_MIX.windGain,-.12],['leaves',1,AMBIENCE_MIX.leafGain,.55],['footStone',2,walk.gain,0,walk.rate],['cloth',2,walk.clothGain,0],['footStone',2.4,walk.gain,0,walk.rate],['cloth',2.4,walk.clothGain,0],['footEarth',3.1,walk.gain,0,walk.rate],['footEarth',3.5,walk.gain,0,walk.rate],
  ['birds',.1,.65,-.4],['water',3.8,.55,.5],['discovery',5.7,.8,0],['route',4.4,.7,0],['landmark',5.1,.7,-.3],['consequence',6,.7,.3],['swish',7,1,0],['cloth',7,.45,0],['parry',7.18,1,.25],
  ['wind',10,AMBIENCE_MIX.windGain,.1],['swish',9.5,1,.2],['block',9.68,1,0],['dodge',11,1,0],['evade',11.15,.7,.1],['leaves',12,AMBIENCE_MIX.leafGain,-.6],
  ['swish',13,1,0],['hit',13.18,1,.2],['swish',14.3,1,0],['hit',14.48,1,.2],['death',14.48,1,.2],
  ['rejoin',16,.7,0],['wind',20,AMBIENCE_MIX.windGain,-.1],['footStone',18,walk.gain,0,walk.rate],['footStone',18.4,walk.gain,0,walk.rate],['footStone',18.8,walk.gain,0,walk.rate],['cloth',18.8,walk.clothGain,0],
  ['signal',20,1,0],['victory',20,1,0],['leaves',23,AMBIENCE_MIX.leafGain,.5],
];
function mixTimeline(timeline,seconds){
  const mix=new Float32Array(sampleRate*seconds*2),variants={};
  for(const [name,at,gain,pan,rate=1] of timeline){
    const variant=variants[name]??0;variants[name]=(variant+1)%(name==='wind'||name==='leaves'?3:4);
    const data=generateSound(name,variant,sampleRate).data,offset=Math.round(at*sampleRate),bus=name==='wind'||name==='leaves'?airGain:1;
    const left=Math.cos((pan+1)*Math.PI/4)*gain*.78*bus,right=Math.sin((pan+1)*Math.PI/4)*gain*.78*bus;
    for(let i=0;i*rate<data.length-1&&offset+i<mix.length/2;i++){
      const position=i*rate,source=Math.floor(position),fraction=position-source,value=data[source]*(1-fraction)+data[source+1]*fraction;
      mix[(offset+i)*2]+=value*left;mix[(offset+i)*2+1]+=value*right;
    }
  }
  let peak=0;for(const value of mix)peak=Math.max(peak,Math.abs(value));if(peak>=1)throw new Error(`Audition mix clips: ${peak}`);
  return {bytes:wav(mix,2),peak};
}
const sequence=mixTimeline(timeline,33);await writeFile(new URL('generated-scene-audition.wav',out),sequence.bytes);
const quietTimeline=[...[[0,-.1],[10,.1],[20,-.1]].map(([at,pan])=>['wind',at,AMBIENCE_MIX.windGain,pan]),...[[1,.5],[9,-.4],[18,.5],[27,-.5]].map(([at,pan])=>['leaves',at,AMBIENCE_MIX.leafGain,pan])];
for(const [name,start,pace,interval] of [['footStone',3,walk,.4],['footEarth',12,walk,.4],['footStone',21,run,1.12/3.8],['footEarth',26,run,1.12/3.8]])
  for(let i=0;i<8;i++)quietTimeline.push([name,start+i*interval,pace.gain,i%2?.045:-.045,pace.rate],['cloth',start+i*interval,pace.clothGain,0]);
quietTimeline.sort((a,b)=>a[1]-b[1]);const quiet=mixTimeline(quietTimeline,33);await writeFile(new URL('quiet-walk-and-run.wav',out),quiet.bytes);
const report={kind:'generated PCM listening assets',provenance:'Original source synthesis from fresh/audio.js. No field recording, reference recording or external runtime audio. The scene is a designed sequence, not a gameplay capture.',qualityVerdict:'not measured',liveBrowserCapture:'not performed by this script',sampleRate,catalog,eventMap:EVENT_SOUNDS,
  mix:{master:.78,airPressure:.45,airGain,walk,run},scene:{file:'generated-scene-audition.wav',seconds:33,peak:sequence.peak,timeline,sha256:createHash('sha256').update(sequence.bytes).digest('hex')},
  quiet:{file:'quiet-walk-and-run.wav',seconds:33,peak:quiet.peak,timeline:quietTimeline,scope:'Quiet air; four alternating 8-contact groups: stone walk, earth walk, stone run, earth run. Fixed pressure and designed contact times, not a live capture.',sha256:createHash('sha256').update(quiet.bytes).digest('hex')}};
await writeFile(new URL('manifest.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:out.pathname,files:catalog.length+3,scenePeak:sequence.peak,quietPeak:quiet.peak,qualityVerdict:report.qualityVerdict}));
