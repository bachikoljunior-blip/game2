import test from 'node:test';
import assert from 'node:assert/strict';
import {retryDodgeUntilObserved} from './input-observation.mjs';

function crossingPulse(){
  let wall=0,dodges=2,reads=0,taps=0;
  return {now:()=>wall,counts:()=>({reads,taps}),
    read:async()=>{wall+=++reads===1?2990:4;return {mode:'playing',dodges,worldTime:31.12,lastDodgeEventTime:dodges>2?31.11666666666618:null,browserObservedAtMs:wall};},
    tap:async()=>{taps++;wall+=160;dodges++;}};
}
test('the old read/tap/deadline loop misses a successful final pulse, while the new loop observes it once',async()=>{
  const old=crossingPulse();let acknowledged=false;
  do{const seen=await old.read();if(seen.dodges>2){acknowledged=true;break;}await old.tap();}while(old.now()<3000);
  assert.equal(acknowledged,false);assert.deepEqual(old.counts(),{reads:1,taps:1});
  const current=crossingPulse(),record={};
  const seen=await retryDodgeUntilObserved({before:2,...current,record});
  assert.equal(seen.dodges,3);assert.deepEqual(current.counts(),{reads:2,taps:1});
  assert.equal(record.pulses[0].startedElapsedMs,2990);assert.equal(record.pulses[0].finishedElapsedMs,3150);
  assert.equal(record.acknowledgement.elapsedMs,3154);assert.equal(record.acknowledgement.lastDodgeEventTime,31.11666666666618);
  assert.equal(record.acknowledgementTiming,'observed-after-input-deadline');
});
test('an unsuccessful final pulse gets exactly one last read and no extra input or polling window',async()=>{
  let wall=0,reads=0,taps=0;const record={};
  await assert.rejects(retryDodgeUntilObserved({before:0,now:()=>wall,record,
    read:async()=>{wall+=++reads===1?2999:5;return {mode:'playing',dodges:0};},tap:async()=>{taps++;wall+=160;}}),/final read.*3000ms/);
  assert.equal(reads,2);assert.equal(taps,1);assert.equal(record.status,'unacknowledged');assert.equal(record.observations[1].elapsedMs,3164);
});
test('a slow initial diagnostic read cannot start a fresh pulse at or beyond the input deadline',async()=>{
  for(const duration of [3000,3001]){
    let wall=0,taps=0;const record={};
    await assert.rejects(retryDodgeUntilObserved({before:0,now:()=>wall,record,
      read:async()=>{wall=duration;return {mode:'playing',dodges:0};},tap:async()=>{taps++;}}),/3000ms/);
    assert.equal(taps,0);assert.equal(record.observations.length,1);
  }
});
test('a within-window counter acknowledgement needs no duplicate pulse and retains its observed time',async()=>{
  let wall=10000,taps=0;const record={};
  const result=await retryDodgeUntilObserved({before:2,now:()=>wall,record,
    read:async()=>{wall+=25;return {mode:'playing',dodges:3,worldTime:9.2,lastDodgeEventTime:9.1};},tap:async()=>{taps++;}});
  assert.equal(taps,0);assert.equal(result.dodges,3);assert.equal(record.acknowledgement.elapsedMs,25);
  assert.equal(record.acknowledgementTiming,'observed-within-input-window');assert.equal(record.inputDeadlineAtMs,13000);
});
test('deadline includes apparatus setup and terminal mission state cannot be mistaken for an acknowledgement',async()=>{
  let wall=3010,taps=0;const expired={};
  await assert.rejects(retryDodgeUntilObserved({before:0,startedAt:0,now:()=>wall,record:expired,
    read:async()=>({mode:'playing',dodges:0}),tap:async()=>{taps++;}}),/3000ms/);assert.equal(taps,0);
  const terminal={};
  await assert.rejects(retryDodgeUntilObserved({before:2,now:()=>0,record:terminal,
    read:async()=>({mode:'defeat',dodges:2}),tap:async()=>{taps++;}}),/Mission ended/);
  assert.equal(taps,0);assert.equal(terminal.status,'failed');
});
