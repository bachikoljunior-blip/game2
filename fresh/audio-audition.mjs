// Reproducible original-PCM audition. This is a designed listening sequence,
// explicitly not a live gameplay recording or a quality/comparison verdict.
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {SOUND_CATEGORIES,EVENT_SOUNDS,generateSound} from './audio.js';
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
const timeline=[
  ['wind',0,.65,-.12],['leaves',1,.42,.55],['footStone',2,.8,0],['cloth',2,.23,0],['footStone',2.4,.8,0],['cloth',2.4,.23,0],['footEarth',3.1,.75,0],['footEarth',3.5,.75,0],
  ['birds',.1,.65,-.4],['water',3.8,.55,.5],['discovery',5.7,.8,0],['route',4.4,.7,0],['landmark',5.1,.7,-.3],['consequence',6,.7,.3],['swish',7,1,0],['cloth',7,.45,0],['parry',7.18,1,.25],
  ['wind',8.7,.65,.1],['swish',9.5,1,.2],['block',9.68,1,0],['dodge',11,1,0],['evade',11.15,.7,.1],['leaves',12,.38,-.6],
  ['swish',13,1,0],['hit',13.18,1,.2],['swish',14.3,1,0],['hit',14.48,1,.2],['death',14.48,1,.2],
  ['rejoin',16,.7,0],['wind',17.4,.65,-.1],['footStone',18,.8,0],['footStone',18.4,.8,0],['footStone',18.8,.8,0],['cloth',18.8,.23,0],
  ['signal',20,1,0],['victory',20,1,0],['leaves',23,.38,.5],
];
const mix=new Float32Array(sampleRate*29*2);
for(const [name,at,gain,pan] of timeline){
  const data=bank[name],offset=Math.round(at*sampleRate),left=Math.cos((pan+1)*Math.PI/4)*gain*.78,right=Math.sin((pan+1)*Math.PI/4)*gain*.78;
  for(let i=0;i<data.length&&offset+i<mix.length/2;i++){mix[(offset+i)*2]+=data[i]*left;mix[(offset+i)*2+1]+=data[i]*right;}
}
let peak=0;for(const value of mix)peak=Math.max(peak,Math.abs(value));if(peak>=1)throw new Error(`Audition mix clips: ${peak}`);
const sequence=wav(mix,2);await writeFile(new URL('generated-scene-audition.wav',out),sequence);
const report={kind:'generated PCM listening assets',provenance:'Original source synthesis from fresh/audio.js. No field recording, reference recording or external runtime audio. The scene is a designed sequence, not a gameplay capture.',qualityVerdict:'not measured',liveBrowserCapture:'not performed by this script',sampleRate,catalog,eventMap:EVENT_SOUNDS,scene:{file:'generated-scene-audition.wav',seconds:29,peak,timeline,sha256:createHash('sha256').update(sequence).digest('hex')}};
await writeFile(new URL('manifest.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({output:out.pathname,files:catalog.length+2,scenePeak:peak,qualityVerdict:report.qualityVerdict}));
