import assert from 'node:assert/strict';
import { readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
const report={date:new Date().toISOString(),result:'passed',recordings:[],scope:'Video integrity and provenance only. Silent software-rendered browser recordings; no source-blind verdict, audio result or smartphone performance claim. Decoded frames can repeat.'};
try{
 const browser=JSON.parse(await readFile(new URL('browser-report.json',out),'utf8'));
 const matrix=JSON.parse(await readFile(new URL('route-matrix-report.json',out),'utf8'));
 report.sourceRevision=browser.sourceRevision;
 assert.match(process.env.GITHUB_SHA??'',/^[a-f0-9]{40}$/,'expected CI revision must be provided');
 assert.equal(browser.sourceRevision,process.env.GITHUB_SHA,'evidence must belong to this revision');
 assert.equal(matrix.sourceRevision,process.env.GITHUB_SHA,'route-matrix evidence must belong to this revision');
 assert.equal(browser.result,'passed','a recording must not hide a failed browser mission');
 assert.equal(matrix.result,'passed','a complementary route recording must not hide a failed mission');
 const recordings=[...browser.recordings,...matrix.recordings];
 assert.deepEqual(recordings.map(r=>r.id),['desktop','touch','desktop-right','touch-left']);
 for(const item of recordings){
  assert.equal(item.status,'saved');
  assert.equal(item.file,`${item.id}-continuous.webm`);
  assert.deepEqual(item.size,item.id.startsWith('desktop')?{width:1280,height:720}:{width:844,height:844});
  const file=new URL(item.file,out),bytes=await stat(file);
  const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file.pathname],{encoding:'utf8',timeout:120000,maxBuffer:1048576}));
  const video=probe.streams.filter(s=>s.codec_type==='video'),audio=probe.streams.filter(s=>s.codec_type==='audio');
  assert.equal(video.length,1);assert.equal(audio.length,0,'audio capture is not provided by this recording method');
  assert.equal(video[0].width,item.size.width);assert.equal(video[0].height,item.size.height);
  const durationSeconds=Number(probe.format.duration),decodedFrames=Number(video[0].nb_read_frames);
  assert.ok(Number.isFinite(durationSeconds)&&durationSeconds>0);
  assert.ok(decodedFrames>=300,'continuous evidence must contain at least300 decoded video frames; repeats are not independent samples');
  const eventNames=item.events.map(e=>e.event);
  let priorOffset=-1,priorIndex=-1;
  for(const event of item.events){assert.ok(Number.isFinite(event.offsetMs)&&event.offsetMs>=priorOffset,'event offsets must be finite and monotonic');priorOffset=event.offsetMs;}
  for(const name of ['full-mission-start','fork-entry','route-choice']){
   const index=eventNames.indexOf(name);assert.ok(index>priorIndex,`missing or misordered ${name} checkpoint`);priorIndex=index;
  }
  const routeChoice=item.events.find(e=>e.event==='route-choice');
  const landmark=item.events.find(e=>e.event==='route-landmark');
  const consequence=item.events.find(e=>e.event==='route-consequence');
  const rejoin=item.events.find(e=>e.event==='route-rejoin');
  const expectedRoute=new Map([['desktop','left'],['touch','right'],['desktop-right','right'],['touch-left','left']]).get(item.id);
  assert.equal(routeChoice.detail.route,expectedRoute);
  for(const checkpoint of [landmark,consequence,rejoin]){
   assert.ok(checkpoint&&checkpoint.offsetMs>=routeChoice.offsetMs,'route landmark, consequence and rejoin must follow the choice');
  }
  assert.ok(rejoin.offsetMs>=landmark.offsetMs&&rejoin.offsetMs>=consequence.offsetMs,'rejoin must follow both route-specific observations');
  priorIndex=eventNames.indexOf('route-rejoin');
  for(const name of ['victory','clean-retry','context-close']){
   const index=eventNames.indexOf(name);assert.ok(index>priorIndex,`missing or misordered ${name} checkpoint`);priorIndex=index;
  }
  assert.equal(eventNames.at(-1),'context-close');
  const approximateIntervalSeconds=item.events.at(-1).offsetMs/1000;
  assert.ok(Math.abs(durationSeconds-approximateIntervalSeconds)<=2,'recording length must agree with the capture interval within2s of recorder startup/tail uncertainty');
  assert.ok(item.events.filter(e=>e.event==='kills').some(e=>e.detail===3));
  execFileSync('ffmpeg',['-v','error','-xerror','-i',file.pathname,'-map','0:v:0','-f','null','-'],{timeout:120000,maxBuffer:1048576});
  const snapshots=[];
  for(const name of ['fork-entry','route-choice','route-landmark','route-rejoin']){
   const checkpoint=item.events.find(event=>event.event===name),snapshot=`${item.id}-${name}.png`,snapshotFile=new URL(snapshot,out);
   execFileSync('ffmpeg',['-v','error','-ss',String(checkpoint.offsetMs/1000),'-i',file.pathname,'-frames:v','1','-y',snapshotFile.pathname],{timeout:120000,maxBuffer:1048576});
   const snapshotBytes=(await stat(snapshotFile)).size;assert.ok(snapshotBytes>0,`${snapshot} must contain a decoded frame`);
   snapshots.push({event:name,file:snapshot,bytes:snapshotBytes,approximateOffsetSeconds:checkpoint.offsetMs/1000});
  }
  report.recordings.push({id:item.id,file:item.file,sha256:createHash('sha256').update(await readFile(file)).digest('hex'),bytes:bytes.size,width:video[0].width,height:video[0].height,durationSeconds,approximateIntervalSeconds,intervalToleranceSeconds:2,decodedFrames,audioTracks:audio.length,fullDecode:'passed',events:item.events,snapshots,alignment:'Wall-clock event offsets are approximate; video/input synchronization has not been measured. Visual continuity must still be reviewed.'});
 }
}catch(e){report.result='failed';report.failure=String(e);process.exitCode=1;}
await writeFile(new URL('recording-report.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
