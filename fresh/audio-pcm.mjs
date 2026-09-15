// Technical PCM integrity/audibility checks only; not a listening-quality verdict.
import {spawnSync} from 'node:child_process';
export function measurePcm(samples,{sampleRate=24000,channels=2}={}){
  let peak=0,energy=0,nonfinite=0,clipped=0,active=0;
  for(const value of samples){if(!Number.isFinite(value)){nonfinite++;continue;}const magnitude=Math.abs(value);peak=Math.max(peak,magnitude);energy+=value*value;if(magnitude>=.999)clipped++;if(magnitude>1e-4)active++;}
  const count=samples.length,rms=count?Math.sqrt(energy/count):0,clipFraction=count?clipped/count:0,activeFraction=count?active/count:0;
  const limits={minSeconds:.5,minRms:1e-4,minPeak:.003,minActiveFraction:.001,maxClipFraction:.001,maxPeak:1.01};
  const seconds=count/(sampleRate*channels),failures=[];
  if(nonfinite)failures.push('nonfinite PCM');if(seconds<limits.minSeconds)failures.push('too short');
  if(rms<limits.minRms||peak<limits.minPeak||activeFraction<limits.minActiveFraction)failures.push('silent or inaudible PCM');
  if(clipFraction>limits.maxClipFraction||peak>limits.maxPeak)failures.push('clipped PCM');
  return {valid:failures.length===0,failures,samples:count,sampleRate,channels,seconds,peak,rms,nonfinite,clipped,clipFraction,activeFraction,limits};
}
export function decodePcm(path){
  const decoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',path,'-ar','24000','-ac','2','-f','f32le','pipe:1'],{maxBuffer:128*1024*1024});
  if(decoded.status!==0)throw new Error(decoded.stderr?.toString()||String(decoded.error));
  if(decoded.stdout.length%4)throw new Error('Malformed float32 PCM byte count');
  const samples=new Float32Array(decoded.stdout.length/4);for(let i=0;i<samples.length;i++)samples[i]=decoded.stdout.readFloatLE(i*4);
  return {samples,measurement:measurePcm(samples)};
}
