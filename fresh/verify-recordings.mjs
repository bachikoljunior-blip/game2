import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/',import.meta.url);
const decodedDir=new URL('decoded/',out),derivedDir=new URL('derived/',out);
await mkdir(decodedDir,{recursive:true});await mkdir(derivedDir,{recursive:true});
const report={date:new Date().toISOString(),result:'passed',recordings:[],apparatusFailures:[],recordingFailures:[],
 scope:'Video integrity, provenance and C04 material-readiness apparatus only. Silent software-rendered browser recordings; no source-blind verdict, audio result or smartphone performance claim. Decoded frames can repeat.'};
const sha256=async file=>createHash('sha256').update(await readFile(file)).digest('hex');
const ff=(args,timeout=300000)=>execFileSync('ffmpeg',['-v','error',...args],{timeout,maxBuffer:4*1048576});
const probe=file=>JSON.parse(execFileSync('ffprobe',['-v','error','-count_frames','-show_streams','-show_format','-of','json',file.pathname],{encoding:'utf8',timeout:120000,maxBuffer:1048576}));
const ordered=(events,names)=>{
 let prior=-1;
 for(const name of names){const index=events.findIndex((event,i)=>i>prior&&event.event===name);assert.ok(index>prior,`missing or misordered ${name} checkpoint`);prior=index;}
};
const safeRead=async name=>{
 try{return JSON.parse(await readFile(new URL(name,out),'utf8'));}
 catch(error){report.apparatusFailures.push(`${name}: ${error}`);return null;}
};
const browser=await safeRead('browser-report.json'),matrix=await safeRead('route-matrix-report.json');
const expectedSha=process.env.GITHUB_SHA??'';
if(!/^[a-f0-9]{40}$/.test(expectedSha))report.apparatusFailures.push('expected CI revision must be provided');
for(const [name,apparatus] of [['browser',browser],['route-matrix',matrix]])if(apparatus){
 if(apparatus.sourceRevision!==expectedSha)report.apparatusFailures.push(`${name} sourceRevision ${apparatus.sourceRevision} does not equal ${expectedSha}`);
 if(apparatus.ciClaimedRevision!==expectedSha)report.apparatusFailures.push(`${name} ciClaimedRevision ${apparatus.ciClaimedRevision} does not equal ${expectedSha}`);
 if(apparatus.result!=='passed')report.apparatusFailures.push(`${name} apparatus result was ${apparatus.result}`);
}
report.sourceRevision=browser?.sourceRevision??matrix?.sourceRevision??null;
const recordings=[...(browser?.recordings??[]),...(matrix?.recordings??[])];
const expectedIds=['desktop','touch','desktop-right','touch-left'];
if(JSON.stringify(recordings.map(item=>item.id))!==JSON.stringify(expectedIds))report.apparatusFailures.push(`recording ids were ${JSON.stringify(recordings.map(item=>item.id))}, expected ${JSON.stringify(expectedIds)}`);
const reportsById=new Map(recordings.map(item=>[item.id,item]));

// Probe the four contract filenames independently of report parsing/status. A
// corrupt or missing JSON record therefore cannot hide a finalized raw video.
for(const id of expectedIds){
 const item=reportsById.get(id),expectedFile=`${id}-continuous.webm`;
 const entry={id,file:expectedFile,status:item?.status??'metadata-missing',events:item?.events??[]};
 try{
  const desktop=id.startsWith('desktop'),expectedSize=desktop?{width:1280,height:720}:{width:844,height:844};
  const file=new URL(expectedFile,out),bytes=await stat(file),metadata=probe(file);
  const video=metadata.streams.filter(stream=>stream.codec_type==='video'),audio=metadata.streams.filter(stream=>stream.codec_type==='audio');
  // Decode before validating dimensions, report status or event metadata.
  ff(['-xerror','-i',file.pathname,'-map','0:v:0','-f','null','-']);
  assert.equal(video.length,1);assert.equal(audio.length,0,'audio capture is not provided by this recording method');
  assert.equal(video[0].width,expectedSize.width);assert.equal(video[0].height,expectedSize.height);
  const durationSeconds=Number(metadata.format.duration),decodedFrames=Number(video[0].nb_read_frames);
  assert.ok(Number.isFinite(durationSeconds)&&durationSeconds>0);assert.ok(decodedFrames>=300,'continuous evidence must contain at least300 decoded video frames');
  // Every structurally readable raw file is fully decoded before event checks,
  // so bad apparatus metadata cannot suppress video-integrity evidence.
  const rawSha=await sha256(file);
  Object.assign(entry,{sha256:rawSha,bytes:bytes.size,width:video[0].width,height:video[0].height,durationSeconds,decodedFrames,audioTracks:audio.length,fullDecode:'passed'});
  assert.ok(item,`${id} report metadata is missing`);assert.equal(item.status,'saved');assert.equal(item.file,expectedFile);assert.deepEqual(item.size,expectedSize);
  let priorOffset=-1;
  for(const event of item.events){assert.ok(Number.isFinite(event.offsetMs)&&event.offsetMs>=priorOffset,'event offsets must be finite and monotonic');priorOffset=event.offsetMs;}
  const names=item.events.map(event=>event.event);
  ordered(item.events,['full-mission-start','fork-entry','route-choice','rejoin-approach','route-rejoin','post-rejoin-shrine-view','destination-arrival','signal-input','signal-lit','victory','clean-retry','context-close']);
  const choice=item.events.find(event=>event.event==='route-choice'),landmark=item.events.find(event=>event.event==='route-landmark'),
    consequence=item.events.find(event=>event.event==='route-consequence'),approach=item.events.find(event=>event.event==='rejoin-approach'),
    rejoin=item.events.find(event=>event.event==='route-rejoin'),postView=item.events.find(event=>event.event==='post-rejoin-shrine-view'),
    arrival=item.events.find(event=>event.event==='destination-arrival'),signalInput=item.events.find(event=>event.event==='signal-input'),signalLit=item.events.find(event=>event.event==='signal-lit');
  const expectedRoute=new Map([['desktop','left'],['touch','right'],['desktop-right','right'],['touch-left','left']]).get(id);
  assert.equal(choice.detail.route,expectedRoute);
  for(const checkpoint of [landmark,consequence])assert.ok(checkpoint&&checkpoint.offsetMs>=choice.offsetMs&&checkpoint.offsetMs<=rejoin.offsetMs,'landmark and consequence must occur after choice and no later than physical reconvergence');
  assert.ok(approach.offsetMs<rejoin.offsetMs&&rejoin.offsetMs<=postView.offsetMs&&postView.offsetMs<=arrival.offsetMs&&arrival.offsetMs<signalInput.offsetMs&&signalInput.offsetMs<=signalLit.offsetMs);
  assert.ok(item.events.filter(event=>event.event==='kills').some(event=>event.detail===3));
  assert.equal(names.at(-1),'context-close');
  const approximateIntervalSeconds=item.events.at(-1).offsetMs/1000;
  assert.ok(Math.abs(durationSeconds-approximateIntervalSeconds)<=2,'recording length must agree with the capture interval within2s');
  const touchFilter=desktop?null:'crop=844:390:0:0';
  const snapshotEvents=['fork-entry','route-landmark','route-consequence','rejoin-approach','route-rejoin','post-rejoin-shrine-view','destination-arrival','signal-lit'];
  const routeCaptureOffsets=new Map();
  if(Math.abs(landmark.offsetMs-consequence.offsetMs)<=100){
   const semanticOrder=[landmark,consequence].sort((a,b)=>a.detail.time-b.detail.time||a.event.localeCompare(b.event));
   const shared=Math.max(landmark.offsetMs,consequence.offsetMs),separation=Math.min(300,Math.max(140,Math.abs(landmark.detail.time-consequence.detail.time)*1000+80));
   routeCaptureOffsets.set(semanticOrder[0].event,Math.max(choice.offsetMs+80,shared-separation));
   routeCaptureOffsets.set(semanticOrder[1].event,Math.min(approach.offsetMs-80,shared+separation));
  }
  const snapshots=[];
  for(const name of snapshotEvents){
   const checkpoint=item.events.find(event=>event.event===name),filename=`decoded-${id}-${name}.png`,snapshotFile=new URL(filename,decodedDir);
   const captureOffsetMs=routeCaptureOffsets.get(name)??checkpoint.offsetMs+(name==='signal-lit'?400:0);
   const args=['-ss',String(captureOffsetMs/1000),'-i',file.pathname];if(touchFilter)args.push('-vf',touchFilter);args.push('-frames:v','1','-y',snapshotFile.pathname);
   ff(args,120000);const snapshotBytes=(await stat(snapshotFile)).size;assert.ok(snapshotBytes>0,`${filename} must contain a decoded frame`);
   snapshots.push({event:name,file:`decoded/${filename}`,bytes:snapshotBytes,sha256:await sha256(snapshotFile),approximateOffsetSeconds:captureOffsetMs/1000,eventOffsetSeconds:checkpoint.offsetMs/1000,semanticWorldTime:checkpoint.detail?.time??null});
  }
  const routeSpecificEvents=[landmark,consequence].sort((a,b)=>a.detail.time-b.detail.time||a.offsetMs-b.offsetMs||a.event.localeCompare(b.event)).map(event=>event.event);
  const fixedFiveEvents=['fork-entry',...routeSpecificEvents,'rejoin-approach','signal-lit'];
  const fixedFive=fixedFiveEvents.map(name=>snapshots.find(snapshot=>snapshot.event===name));
  assert.equal(new Set(fixedFive.map(frame=>frame.sha256)).size,5,'fixed-five frames must be byte-distinct; recapture a criterion-bearing checkpoint instead of duplicating a frame');
  assert.ok(fixedFive.every((frame,index)=>index===0||frame.approximateOffsetSeconds>fixedFive[index-1].approximateOffsetSeconds),'fixed-five capture offsets must follow semantic gameplay order');
  const fixedManifest=`${id}-fixed-five.json`,fixedFile=new URL(fixedManifest,derivedDir);
  await writeFile(fixedFile,JSON.stringify({sourceRaw:expectedFile,sourceSha256:rawSha,route:expectedRoute,order:fixedFiveEvents,frames:fixedFive},null,2)+'\n');
  const clipStart=Math.max(0,(item.events.find(event=>event.event==='fork-entry').offsetMs-500)/1000),
    clipEnd=(signalLit.offsetMs+1400)/1000,clipName=`${id}-fork-to-signal.mp4`,clipFile=new URL(clipName,derivedDir);
  const clipFilter=desktop?'scale=960:540':'crop=844:390:0:0,scale=960:444,pad=960:540:0:48:black';
  ff(['-ss',String(clipStart),'-i',file.pathname,'-t',String(clipEnd-clipStart),'-vf',clipFilter,'-an','-c:v','libx264','-preset','veryfast','-crf','22','-movflags','+faststart','-y',clipFile.pathname]);
  ff(['-xerror','-i',clipFile.pathname,'-map','0:v:0','-f','null','-']);
  const clipProbe=probe(clipFile),clipBytes=(await stat(clipFile)).size;
  Object.assign(entry,{approximateIntervalSeconds,intervalToleranceSeconds:2,snapshots,
    fixedFive:{file:`derived/${fixedManifest}`,order:fixedFiveEvents},derivedClip:{file:`derived/${clipName}`,sha256:await sha256(clipFile),bytes:clipBytes,
      durationSeconds:Number(clipProbe.format.duration),fullDecode:'passed',touchViewportCrop:desktop?null:{source:'844x844',crop:'844x390+0+0',output:'960x540 with 48px top/bottom padding'}},
    alignment:'Wall-clock event offsets are approximate; video/input synchronization has not been measured. Visual continuity still requires independent review.'});
 }catch(error){
  entry.failure=String(error);report.recordingFailures.push({id,failure:String(error)});
 }
 report.recordings.push(entry);
}
if(report.apparatusFailures.length||report.recordingFailures.length||report.recordings.length!==4){report.result='failed';process.exitCode=1;}
await writeFile(new URL('recording-report.json',out),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
