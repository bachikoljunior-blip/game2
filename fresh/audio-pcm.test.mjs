import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {measurePcm,decodePcm} from './audio-pcm.mjs';
test('audibility gate rejects mute, nonfinite and clipping independently of decoded duration',()=>{
  const silence=new Float32Array(48000);assert.equal(measurePcm(silence).valid,false);
  const signal=Float32Array.from(silence,(_,i)=>Math.sin(i*.07)*.08);assert.equal(measurePcm(signal).valid,true);
  signal[100]=NaN;assert.ok(measurePcm(signal).failures.includes('nonfinite PCM'));
  signal.fill(1);assert.ok(measurePcm(signal).failures.includes('clipped PCM'));
});
test('a deliberately muted encoded recording decodes successfully but fails the actual PCM gate',async()=>{
  const directory=await mkdtemp(new URL('../audio-probe-',import.meta.url));
  try{
    const encoded=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','sine=frequency=800:duration=1','-af','volume=0','-c:a','libopus','-f','webm','pipe:1']);
    assert.equal(encoded.status,0,encoded.stderr?.toString());const path=`${directory}/muted.webm`;await writeFile(path,encoded.stdout);
    const {measurement}=decodePcm(path);assert.ok(measurement.seconds>=.9);assert.equal(measurement.nonfinite,0);assert.equal(measurement.valid,false);assert.ok(measurement.failures.includes('silent or inaudible PCM'));
  }finally{await rm(directory,{recursive:true,force:true});}
});
