// Capture the actual game's Web Audio master bus while normal DOM input runs.
// This is a browser recording, unlike audio-audition.mjs's designed sequence.
import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {decodePcm} from './audio-pcm.mjs';
import {waitForAudioTime} from './audio-capture-clock.mjs';
const out=new URL('../AI_DEVELOPMENT/EVIDENCE/fresh-20260913/audio/',import.meta.url);
await mkdir(out,{recursive:true});
const revision=spawnSync('git',['rev-parse','HEAD'],{cwd:new URL('..',import.meta.url),encoding:'utf8'});
assert.equal(revision.status,0,revision.stderr);
const bundleReads=[];
const report={provenance:{sourceSha:revision.stdout.trim(),ciSha:process.env.GITHUB_SHA??null,requestedUrl:process.env.FRESH_URL??'http://127.0.0.1:4178/?diagnostic=1',bundles:[]},kind:'actual browser master-bus capture',qualityVerdict:'not measured',physicalDevice:false,events:[],result:'running'};
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const page=await browser.newPage({viewport:{width:960,height:600}});
const errors=[];page.on('pageerror',error=>errors.push(String(error)));
page.on('response',response=>{if(response.request().resourceType()==='script')bundleReads.push((async()=>{const bytes=await response.body();return {url:response.url(),name:new URL(response.url()).pathname.split('/').at(-1),status:response.status(),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')};})());});
await page.addInitScript({content:`window.__waitForAudioTime=${waitForAudioTime.toString()};`});
await page.addInitScript(()=>{
  const Native=window.AudioContext||window.webkitAudioContext,nativeConnect=AudioNode.prototype.connect;
  window.AudioContext=class extends Native{
    constructor(...args){
      super(...args);const sink=this.createMediaStreamDestination(),captureGain=this.createGain();
      captureGain.connect(sink);this.__captureSink=captureGain;
      function begin(){
        const chunks=[],recorder=new MediaRecorder(sink.stream,{mimeType:'audio/webm;codecs=opus'});
        const stopped=new Promise(resolve=>recorder.addEventListener('stop',resolve,{once:true}));
        recorder.addEventListener('dataavailable',event=>{if(event.data.size)chunks.push(event.data);});recorder.start(250);
        return {recorder,async finish(){recorder.stop();await stopped;return Array.from(new Uint8Array(await new Blob(chunks).arrayBuffer()));}};
      }
      const context=this;
      window.__audioCapture={...begin(),async mutedProbe(){
        const muteScheduledAt=context.currentTime+.03;
        captureGain.gain.cancelScheduledValues(context.currentTime);
        captureGain.gain.setValueAtTime(0,muteScheduledAt);
        const gainArrival=await window.__waitForAudioTime(context,muteScheduledAt);
        // CI34949745102 captured only a leading transient: >1e-4 through
        // 14.04ms, with the decoded codec tail gone by 393.02ms. Drain the
        // existing stream for 750ms of actual rendered silence before creating
        // the new recorder; do not trim samples or relax the PCM gate.
        const drain=await window.__waitForAudioTime(context,muteScheduledAt+.75);
        if(captureGain.gain.value!==0)throw new Error('Capture gain did not reach zero');
        const recorderAudioStart=context.currentTime,probe=begin();
        const capture=await window.__waitForAudioTime(context,recorderAudioStart+1.2);
        return {bytes:await probe.finish(),timing:{muteScheduledAt,gainArrival,drain,drainSeconds:.75,recorderAudioStart,capture}};
      }};
    }
  };
  AudioNode.prototype.connect=function(destination,...rest){
    const result=nativeConnect.call(this,destination,...rest);
    if(destination===this.context.destination&&this.context.__captureSink)nativeConnect.call(this,this.context.__captureSink);
    return result;
  };
});
try{
  const documentResponse=await page.goto(report.provenance.requestedUrl);
  report.provenance.actualUrl=page.url();report.provenance.documentSha256=createHash('sha256').update(await documentResponse.body()).digest('hex');
  await page.waitForFunction(()=>window.freshDiagnostics?.().render.calls>0);
  await page.click('#start');await page.waitForFunction(()=>freshDiagnostics().audio.contextState==='running');
  const mark=async name=>report.events.push({name,at:new Date().toISOString(),state:await page.evaluate(()=>({worldTime:freshDiagnostics().world.time,audio:freshDiagnostics().audio}))});
  await mark('started');
  const initial=await page.evaluate(()=>freshDiagnostics().world.player.z);
  await page.keyboard.down('KeyW');await page.waitForFunction(z=>freshDiagnostics().world.player.z<z-2,initial,{timeout:90000});await page.keyboard.up('KeyW');
  await mark('actual-movement');
  await page.mouse.click(740,340);await page.waitForFunction(()=>freshDiagnostics().audio.categories.swish>=1,{},{timeout:30000});
  await page.waitForFunction(()=>freshDiagnostics().world.player.state==='idle',{},{timeout:30000});
  await page.keyboard.press('Space');await page.waitForFunction(()=>freshDiagnostics().audio.categories.dodge>=1,{},{timeout:30000});
  await mark('swing-and-dodge');await page.waitForTimeout(1200);
  await page.keyboard.press('Escape');await page.waitForFunction(()=>freshDiagnostics().paused);
  const paused=await page.evaluate(()=>freshDiagnostics().audio);assert.equal(paused.active,false);assert.equal(paused.liveVoices,0);
  await mark('paused-all-voices-stopped');await page.waitForTimeout(600);
  await page.click('#start');await page.waitForFunction(()=>freshDiagnostics().audio.contextState==='running');await page.waitForTimeout(1800);
  const after=await page.evaluate(()=>freshDiagnostics().audio);assert.ok(after.steps>=2);assert.ok(after.categories.wind>=2);assert.deepEqual(after.unknownEvents,[]);
  await mark('resumed');
  const bytes=Buffer.from(await page.evaluate(()=>window.__audioCapture.finish()));
  const webm=new URL('actual-gameplay-audio.webm',out),wav=new URL('actual-gameplay-audio.wav',out);
  await writeFile(webm,bytes);
  const decode=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-xerror','-i',webm.pathname,'-ar','24000','-ac','2','-y',wav.pathname],{encoding:'utf8'});
  assert.equal(decode.status,0,decode.stderr||String(decode.error));
  report.recording={webm:'actual-gameplay-audio.webm',wav:'actual-gameplay-audio.wav',bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),decode:'passed',scope:'Actual generated master bus from normal Start, movement, swing, dodge, pause and resume. No guaranteed coverage of combat contact or every sound category.'};
  report.pcm=decodePcm(webm.pathname).measurement;
  assert.ok(report.pcm.valid,`Actual recording rejected: ${report.pcm.failures.join(', ')}`);
  // The same live output graph keeps producing sound/counters, but this capture
  // branch is deliberately muted. Decode must pass and PCM validation must fail.
  const mutedProbe=await page.evaluate(()=>window.__audioCapture.mutedProbe()),mutedBytes=Buffer.from(mutedProbe.bytes);
  const mutedFile=new URL('muted-negative-probe.webm',out);await writeFile(mutedFile,mutedBytes);
  const mutedPcm=decodePcm(mutedFile.pathname).measurement;
  report.negativeProbe={timing:mutedProbe.timing,file:'muted-negative-probe.webm',sha256:createHash('sha256').update(mutedBytes).digest('hex'),decode:'passed',pcm:mutedPcm,expected:'reject silent capture',rejected:!mutedPcm.valid};
  assert.equal(mutedPcm.valid,false,'a deliberately muted recording must fail the PCM gate');
  assert.ok(mutedPcm.failures.includes('silent or inaudible PCM'));
  report.provenance.bundles=await Promise.all(bundleReads);assert.ok(report.provenance.bundles.length>0,'served script hashes are required');
  assert.deepEqual(errors,[]);report.result='passed';
}catch(error){report.result='failed';report.failure=String(error);report.failureState=await page.evaluate(()=>window.freshDiagnostics?.()).catch(()=>null);process.exitCode=1;}
finally{report.provenance.bundles=await Promise.all(bundleReads).catch(()=>report.provenance.bundles);await writeFile(new URL('actual-capture-report.json',out),JSON.stringify(report,null,2)+'\n');await browser.close();}
console.log(JSON.stringify({result:report.result,out:out.pathname,failure:report.failure}));
