// Same-process, same-input CPU comparison. This is not device or GPU timing.
import {performance} from 'node:perf_hooks';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {groundHeightAt} from '../terrain.js';

const baseline=pathToFileURL(resolve(process.env.CHARACTER_BASELINE_ROOT||'.pilot-inspection/cloth-baseline')+'/');
const roots={baseline,new:new URL('../',import.meta.url)};
roots.baseline=new URL('fresh/',baseline);
const results={scope:'Local Node process CPU and wall time; same actor/input/terrain, no renderer; not mobile or GPU performance',samples:{}};
const median=a=>[...a].sort((a,b)=>a-b)[Math.floor(a.length/2)];
for(const [name,root] of Object.entries(roots)){
  const {createCharacterRig}=await import(new URL('character-rig.js',root));
  const {updateCharacterRig}=await import(new URL('character-motion.js',root));
  const rig=createCharacterRig('player'),cases={};
  for(const kind of ['running','attacking','falling']){
    const runs=[];
    for(let repeat=-1;repeat<3;repeat++){
      let actor,world;const cpu=process.cpuUsage(),start=performance.now();let groundSamples=0;
      for(let frame=0;frame<180;frame++){
        const k=frame%30;
        if(k===0){actor={id:'player',x:-11.2,z:7,yaw:.7,hp:kind==='falling'?0:100,state:kind==='falling'?'dead':kind==='attacking'?'attack':'idle',age:0};world={time:0,mode:kind==='falling'?'defeat':'playing',events:[]};}
        actor.age=k/30;world.time+=1/30;
        if(kind==='running'){actor.x+=.025;actor.z-=.025;}
        updateCharacterRig(rig,actor,world,1/30,{groundHeightAt});
        groundSamples+=rig.panels.reduce((sum,p)=>sum+(p.surfaceMetrics?.groundSamples||0),0);
      }
      const usage=process.cpuUsage(cpu),wallMs=performance.now()-start;
      if(repeat>=0)runs.push({wallMs,cpuMs:(usage.user+usage.system)/1000,groundSamples});
    }
    cases[kind]={frames:180,medianWallMs:median(runs.map(r=>r.wallMs)),medianCpuMs:median(runs.map(r=>r.cpuMs)),runs};
  }
  results.samples[name]={metrics:rig.metrics,cases};
}
results.ratios=Object.fromEntries(Object.keys(results.samples.new.cases).map(kind=>[kind,
  {cpu:results.samples.new.cases[kind].medianCpuMs/results.samples.baseline.cases[kind].medianCpuMs,
   additionalCpuMsPerFrame:(results.samples.new.cases[kind].medianCpuMs-results.samples.baseline.cases[kind].medianCpuMs)/180}]));
writeFileSync('.pilot-inspection/cloth-cpu.json',JSON.stringify(results,null,2)+'\n');
console.log(JSON.stringify(results.ratios,null,2));
