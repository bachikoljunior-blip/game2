import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForAudioTime} from './audio-capture-clock.mjs';
test('recorder boundary waits for audio progress despite elapsed wall time',async()=>{
  const context={state:'running',currentTime:1};let polls=0,wall=0;
  const times=[1,1,1.1,1.3,1.76];
  const result=await waitForAudioTime(context,1.75,{now:()=>wall,poll:async()=>{wall+=500;context.currentTime=times[polls++];}});
  assert.equal(polls,5);assert.equal(result.audioStart,1);assert.equal(result.target,1.75);assert.equal(result.audioReached,1.76);assert.equal(result.wallElapsedMs,2500);
});
test('a suspended or stalled audio clock fails instead of starting a premature muted recording',async()=>{
  await assert.rejects(waitForAudioTime({state:'suspended',currentTime:0},.75),/Audio clock stopped/);
  let wall=0;
  await assert.rejects(waitForAudioTime({state:'running',currentTime:0},.75,{now:()=>wall,timeoutMs:100,poll:async()=>{wall+=60;}}),/Audio clock did not reach/);
});
