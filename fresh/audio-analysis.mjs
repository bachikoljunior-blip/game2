// Signal measurements, not perceptual judgments. Whole-clip zero-padded FFT
// retains transient energy; fractions use one-sided power including DC/Nyquist.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import * as candidate from './audio.js';

export function measureSound(data,sampleRate=24000){
  let size=1;while(size<data.length)size*=2;
  const real=new Float64Array(size),imaginary=new Float64Array(size);real.set(data);
  for(let i=1,j=0;i<size;i++){
    let bit=size>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;
    if(i<j)[real[i],real[j]]=[real[j],real[i]];
  }
  for(let width=2;width<=size;width*=2){
    const angle=-2*Math.PI/width,cos=Math.cos(angle),sin=Math.sin(angle),half=width/2;
    for(let start=0;start<size;start+=width){
      let wr=1,wi=0;
      for(let offset=0;offset<half;offset++){
        const a=start+offset,b=a+half,r=real[b]*wr-imaginary[b]*wi,q=real[b]*wi+imaginary[b]*wr;
        real[b]=real[a]-r;imaginary[b]=imaginary[a]-q;real[a]+=r;imaginary[a]+=q;
        const next=wr*cos-wi*sin;wi=wr*sin+wi*cos;wr=next;
      }
    }
  }
  const bands=[{label:'below200Hz',min:0,max:200},{label:'200to1000Hz',min:200,max:1000},
    {label:'1000to4000Hz',min:1000,max:4000},{label:'above4000Hz',min:4000,max:Infinity}];
  let power=0,weightedHz=0;
  for(let i=0;i<=size/2;i++){
    const hz=i*sampleRate/size,p=(real[i]**2+imaginary[i]**2)*(i===0||i===size/2?1:2);
    power+=p;weightedHz+=p*hz;const band=bands.find(b=>hz>=b.min&&hz<b.max);band.power=(band.power??0)+p;
  }
  let energy=0,peak=0;for(const sample of data){energy+=sample*sample;peak=Math.max(peak,Math.abs(sample));}
  let accumulated=0,t10=null,t90=null;
  for(let i=0;i<data.length;i++){accumulated+=data[i]**2;if(t10===null&&accumulated>=energy*.1)t10=i/sampleRate;if(t90===null&&accumulated>=energy*.9){t90=i/sampleRate;break;}}
  const frameLength=Math.round(sampleRate*.02),frames=[];
  for(let start=0;start<data.length;start+=frameLength){let sum=0,count=Math.min(frameLength,data.length-start);for(let i=0;i<count;i++)sum+=data[start+i]**2;frames.push(Math.sqrt(sum/count));}
  const maxFrame=Math.max(...frames),rms=Math.sqrt(energy/data.length);
  return {seconds:data.length/sampleRate,rms,peak,energy10to90Ms:(t90-t10)*1000,centroidHz:weightedHz/power,
    active20msFramesFraction:frames.filter(v=>v>=maxFrame*.15).length/frames.length,
    bands:Object.fromEntries(bands.map(b=>[b.label,{energyFraction:b.power/power,rms:rms*Math.sqrt(b.power/power)}]))};
}

function measureMix(samples,sampleRate=24000){
  let sum=0,peak=0,max50msRms=0,active=0,frames=0;const window=sampleRate*.05*2;
  for(let start=0;start<samples.length;start+=window){
    const count=Math.min(window,samples.length-start);let energy=0;
    for(let i=start;i<start+count;i++){energy+=samples[i]**2;peak=Math.max(peak,Math.abs(samples[i]));}
    sum+=energy;const rms=Math.sqrt(energy/count);max50msRms=Math.max(max50msRms,rms);frames++;if(rms>=.001)active++;
  }
  const rms=Math.sqrt(sum/samples.length);
  return {rms,rmsDbFS:20*Math.log10(rms),peak,max50msRms,max50msRmsDbFS:20*Math.log10(max50msRms),fraction50msFramesAboveMinus60dBFS:active/frames};
}

// A matched authored scene, rendered from exact generated source buffers and
// nominal contact rates/gains with a constant-pressure air bus. It is not a
// simulation event trace, browser output, randomized contact capture or SPL.
function modelMix(implementation,version){
  const rate=24000,seconds=60,newMix=version==='after',random=candidate.randomSource(9331),layers={};
  for(const name of ['wind','leaves','steps','cloth','combat'])layers[name]=new Float32Array(rate*seconds*2);
  const bank={},cursors={},windTimes=[],leafTimes=[];
  const add=(layer,name,at,gain,pan=0,playbackRate=1)=>{
    const index=cursors[name]??0;cursors[name]=(index+1)%(name==='wind'||name==='leaves'?3:4);
    const key=`${name}/${index}`,data=bank[key]??=(implementation.generateSound(name,index,rate).data),out=layers[layer],offset=Math.round(at*rate);
    const bus=newMix&&(name==='wind'||name==='leaves')?candidate.ambienceIntensity(.45):1;
    const left=Math.cos((pan+1)*Math.PI/4)*gain*.78*bus,right=Math.sin((pan+1)*Math.PI/4)*gain*.78*bus;
    for(let i=0;i*playbackRate<data.length-1&&offset+i<rate*seconds;i++){
      const p=i*playbackRate,j=Math.floor(p),v=data[j]*(1-(p-j))+data[j+1]*(p-j);
      out[(offset+i)*2]+=v*left;out[(offset+i)*2+1]+=v*right;
    }
  };
  for(let at=0;at<seconds;){
    windTimes.push(at);add('wind','wind',at,newMix?candidate.AMBIENCE_MIX.windGain:.7,random()*.4-.2);
    at+=(newMix?candidate.AMBIENCE_MIX.windInterval:8.1)+random()*(newMix?candidate.AMBIENCE_MIX.windJitter:.7);
  }
  for(let at=.6;at<seconds;){
    leafTimes.push(at);const r=random(),gain=newMix?candidate.AMBIENCE_MIX.leafGain*(.8+r*.4):.35+r*.18;
    add('leaves','leaves',at,gain,random()*1.4-.7,newMix?.96+random()*.08:.88+random()*.24);
    at+=(newMix?candidate.AMBIENCE_MIX.leafInterval:2.3)+random()*(newMix?candidate.AMBIENCE_MIX.leafJitter:3.5);
  }
  for(const [surface,start,speed] of [['footStone',5,1.8],['footEarth',17,1.8],['footStone',31,3.8],['footEarth',40,3.8]]){
    const interval=(speed===1.8?.72:1.12)/speed,step=newMix?candidate.footstepMix(speed):{gain:.8,rate:1,clothGain:.23};
    for(let i=0;i<20;i++){
      add('steps',surface,start+i*interval,step.gain,i%2?.045:-.045,step.rate);
      add('cloth','cloth',start+i*interval,step.clothGain);
    }
  }
  for(const [name,at] of [['swish',50],['parry',50.18],['swish',52],['block',52.18],['swish',54],['hit',54.18]])add('combat',name,at,1);
  const quiet=new Float32Array(rate*seconds*2),full=new Float32Array(quiet.length);
  for(let i=0;i<quiet.length;i++){quiet[i]=layers.wind[i]+layers.leaves[i]+layers.steps[i]+layers.cloth[i];full[i]=quiet[i]+layers.combat[i];}
  const measured=Object.fromEntries(Object.entries(layers).map(([key,samples])=>[key,measureMix(samples)]));
  measured.quiet=measureMix(quiet);measured.full=measureMix(full);
  const overlaps=windTimes.slice(1).map((at,i)=>Math.max(0,Math.min(seconds,windTimes[i]+implementation.SOUND_CATEGORIES.wind)-at));
  return {seconds,channels:2,sampleRate:rate,constantPressure:.45,method:'Controlled authored schedule, cyclic material variants and nominal contact gain/rate; environmental random seed 9331. Not actual browser PCM or a simulation event trace.',stepGroups:'20 stone walk at 5s; 20 earth walk at 17s; 20 stone run at 31s; 20 earth run at 40s',
    combat:'swish/parry at 50/50.18s, swish/block 52/52.18s, swish/hit 54/54.18s',measured,
    wind:{starts:windTimes,overlapSeconds:overlaps,totalOverlapSeconds:overlaps.reduce((a,b)=>a+b,0),scheduledContinuousAir:true},leaves:{starts:leafTimes},
    balance:{footPeak50msAboveWindAverageDb:measured.steps.max50msRmsDbFS-measured.wind.rmsDbFS,
      combatPeak50msAboveWindAverageDb:measured.combat.max50msRmsDbFS-measured.wind.rmsDbFS}};
}

async function main(){
  const out=resolve(process.env.AUDIO_ANALYSIS_OUTPUT??'audio-analysis-output');await mkdir(out,{recursive:true});
  let before=null;
  if(process.env.AUDIO_BASELINE_SOURCE){
    const path=resolve(process.env.AUDIO_BASELINE_SOURCE),source=await readFile(path,'utf8');
    // The archived source's dependencies stay at the chosen checkout; only its
    // exact synthesis/mix code is compared. There is no network or evaluation API.
    const module=source.replace(/from '(\.\/[^']+)'/g,(_,relative)=>`from '${new URL(relative,import.meta.url).href}'`);
    before={module:await import(`data:text/javascript;base64,${Buffer.from(module).toString('base64')}`),sha256:createHash('sha256').update(source).digest('hex')};
  }
  const names=['wind','leaves','cloth','footEarth','footStone'],versions={};
  for(const [label,implementation] of [...(before?[['before',before.module]]:[]),['after',candidate]]){
    versions[label]={};
    for(const name of names)versions[label][name]=Array.from({length:4},(_,variant)=>{
      const sound=implementation.generateSound(name,variant);return {variant,...measureSound(sound.data,sound.sampleRate)};
    });
  }
  const changes=before?Object.fromEntries(names.map(name=>{
    const a=versions.before[name][0],b=versions.after[name][0];return [name,{rmsDbChange:20*Math.log10(b.rms/a.rms),
      lowBandDbChange:20*Math.log10(b.bands.below200Hz.rms/a.bands.below200Hz.rms),
      beforeLowEnergyPct:100*a.bands.below200Hz.energyFraction,afterLowEnergyPct:100*b.bands.below200Hz.energyFraction,
      beforeEnergy10to90Ms:a.energy10to90Ms,afterEnergy10to90Ms:b.energy10to90Ms}];
  })):null;
  const modeledMix=Object.fromEntries([...(before?[['before',before.module]]:[]),['after',candidate]].map(([name,implementation])=>[name,modelMix(implementation,name)]));
  if(before)modeledMix.dbChanges=Object.fromEntries(Object.keys(modeledMix.after.measured).map(layer=>[layer,{
    rmsDb:modeledMix.after.measured[layer].rmsDbFS-modeledMix.before.measured[layer].rmsDbFS,
    peak50msDb:modeledMix.after.measured[layer].max50msRmsDbFS-modeledMix.before.measured[layer].max50msRmsDbFS}]));
  const result={kind:'PCM spectral and temporal measurements',perceptualQuality:'not measured',formalComparison:'not measured',
    baselineSourceSha256:before?.sha256??null,candidateSourceSha256:createHash('sha256').update(await readFile(new URL('./audio.js',import.meta.url))).digest('hex'),
    sampleRate:24000,method:'Whole-clip zero-padded radix-2 FFT; one-sided energy; no normalization or mastering. RMS in digital full scale, not physical SPL. Variant 0 deltas plus all four variants.',
    versions,changes,modeledMix,mix:{before:{windGain:.7,windIntervalSeconds:[8.1,8.8],leafIntervalSeconds:[2.3,5.8],footGainAllSpeeds:.8,master:.78},
      after:{...candidate.AMBIENCE_MIX,airBusAtPressure045:candidate.ambienceIntensity(.45),walk:candidate.footstepMix(1.8),run:candidate.footstepMix(3.8),master:.78}}};
  await writeFile(resolve(out,'analysis.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({output:out,changes,mix:result.mix,modeledMix,perceptualQuality:result.perceptualQuality},null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))await main();
