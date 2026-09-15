import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { preview } from 'vite';

// Run after: npx vite build --config fresh/vite.config.mjs
// This separate production-preview probe does not change mission/input deadlines.
const root=fileURLToPath(new URL('../',import.meta.url));
const out=resolve(root,process.env.FRESH_ASSET_EVIDENCE||'AI_DEVELOPMENT/EVIDENCE/fresh-asset-readiness');
const origin='http://127.0.0.1:4178';
const stems=['young-asian-male','brown-eye','short-hair','eyebrows'];
const heldStem=stems[0],assetTimeoutMs=60000,holdMs=350,settleMs=500;
const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
const assetStem=url=>{
  const name=new URL(url).pathname.split('/').at(-1);
  return stems.find(stem=>new RegExp(`^${stem}(?:-[A-Za-z0-9_-]+)?\\.png$`).test(name))??null;
};
const isGlErrorDiagnostic=text=>
  /\b(?:GL_)?(?:INVALID_ENUM|INVALID_VALUE|INVALID_OPERATION|INVALID_FRAMEBUFFER_OPERATION|OUT_OF_MEMORY|CONTEXT_LOST(?:_WEBGL)?)\b/i.test(text)||
  /\b(?:WebGL|OpenGL)\b[^\n]*(?:\berror\b|\bcontext\s+(?:lost|loss)\b)/i.test(text);
const report={schemaVersion:1,date:new Date().toISOString(),result:'running',
  sourceRevision:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  ciClaimedRevision:process.env.GITHUB_SHA??null,
  apparatusSha256:sha256(await readFile(fileURLToPath(import.meta.url))),
  environment:'Chromium / SwiftShader production preview; not physical-device performance or a visual quality comparison',
  textureObservationScope:'Decoded images supplied to the original WebGL API; void API calls do not prove successful GPU transfer or absence of unreported GPU errors. GL error state is not consumed.',
  url:`${origin}/?diagnostic=1`,requiredTextureStems:stems,heldOrAbortedTexture:heldStem,
  limits:{assetTimeoutMs,holdMs,settleMs},cases:[],errors:[]};
await mkdir(out,{recursive:true});
const persist=()=>writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');
const errorText=error=>error?.stack||String(error);

// Observation only: delegate each original WebGL call with unchanged arguments,
// then record decoded HTMLImageElements supplied to that API. These void calls
// may fail without throwing; submission is not proof of successful GPU transfer.
// No synthetic image, decode(), GL error consumption, or Promise resolution.
function installObservation(requiredStems){
  const observation={unhandledRejections:[],textureApiSubmissions:[],wrappedMethods:[]};
  Object.defineProperty(window,'__freshAssetObservation',{value:observation});
  addEventListener('unhandledrejection',event=>{
    const reason=event.reason;
    observation.unhandledRejections.push({atMs:performance.now(),reason:String(reason),stack:reason?.stack??null});
    // Deliberately do not preventDefault: pageerror remains an independent check.
  });
  for(const type of ['WebGLRenderingContext','WebGL2RenderingContext']){
    const prototype=window[type]?.prototype;
    if(!prototype)continue;
    for(const method of ['texImage2D','texSubImage2D']){
      const original=prototype[method];
      if(typeof original!=='function')continue;
      Object.defineProperty(prototype,method,{configurable:true,writable:true,value:function(...args){
        const result=Reflect.apply(original,this,args);
        for(const source of args){
          if(!(source instanceof HTMLImageElement))continue;
          const url=source.currentSrc||source.src;
          const name=new URL(url,location.href).pathname.split('/').at(-1);
          const stem=requiredStems.find(value=>new RegExp(`^${value}(?:-[A-Za-z0-9_-]+)?\\.png$`).test(name));
          if(stem&&!observation.textureApiSubmissions.some(submission=>submission.url===url)){
            observation.textureApiSubmissions.push({stem,url,method,type,atMs:performance.now(),
              complete:source.complete,naturalWidth:source.naturalWidth,naturalHeight:source.naturalHeight});
          }
        }
        return result;
      }});
      observation.wrappedMethods.push(`${type}.${method}`);
    }
  }
}

async function snapshot(page){
  return page.evaluate(()=>{
    const d=window.freshDiagnostics?.(),start=document.querySelector('#start'),message=document.querySelector('#message');
    return {atMs:performance.now(),running:d?.running,paused:d?.paused,contextLost:d?.contextLost,
      worldTime:d?.world?.time,assets:d?.actors?.assets,render:d?.render,actors:d?.actors,
      start:{disabled:start?.disabled,text:start?.textContent},message:message?.textContent,
      observation:window.__freshAssetObservation};
  });
}
function gated(state,expectedState){
  assert.equal(state.assets?.state,expectedState);
  assert.equal(state.assets.textureCount,4);
  assert.equal(state.start.disabled,true);
  assert.equal(state.running,false);
  assert.equal(state.contextLost,false);
  assert.equal(state.render?.calls,0,'no scene rendering before successful asset readiness');
}
async function clickDisabledStart(page){
  // Locator.click waits for enabled; a real pointer click exercises the disabled UI.
  const box=await page.locator('#start').boundingBox();
  assert.ok(box&&box.width>0&&box.height>0,'disabled start is visible');
  await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
}
function validatePngResponses(item,expectedStems){
  assert.deepEqual(item.pngResponses.map(response=>response.stem).sort(),[...expectedStems].sort(),
    'exactly the expected production PNG responses were received');
  for(const response of item.pngResponses){
    assert.equal(new URL(response.url).origin,origin,'required PNGs are served from the game origin');
    assert.equal(response.status,200);
    assert.match(response.contentType,/^image\/png(?:;|$)/);
    assert.equal(response.signature,'89504e470d0a1a0a');
    assert.ok(response.width>0&&response.height>0&&response.bytes>24);
  }
}

async function runCase(mode){
  const item={mode,result:'running',startedAt:new Date().toISOString(),observations:[],
    interceptedRequests:[],pngResponses:[],requestFailures:[],consoleErrors:[],consoleWarnings:[],pageErrors:[],errors:[]};
  report.cases.push(item);
  let browser,page,release;
  const responses=[],routeJobs=[];
  const released=new Promise(resolveRelease=>{release=resolveRelease;});
  try{
    browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH,
      args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
    item.browserVersion=browser.version();
    const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block'});
    await context.addInitScript(installObservation,stems);
    page=await context.newPage();page.setDefaultTimeout(15000);
    page.on('pageerror',error=>item.pageErrors.push(errorText(error)));
    page.on('console',message=>{
      const event={text:message.text(),location:message.location()};
      if(message.type()==='error')item.consoleErrors.push(event);
      if(message.type()==='warning')item.consoleWarnings.push(event);
    });
    page.on('requestfailed',request=>item.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
    page.on('response',response=>{
      const stem=assetStem(response.url());
      if(!stem)return;
      responses.push((async()=>{
        const bytes=await response.body();
        item.pngResponses.push({stem,url:response.url(),status:response.status(),
          contentType:response.headers()['content-type']??'',bytes:bytes.length,sha256:sha256(bytes),
          signature:bytes.subarray(0,8).toString('hex'),
          width:bytes.length>=24?bytes.readUInt32BE(16):0,height:bytes.length>=24?bytes.readUInt32BE(20):0});
      })().catch(error=>item.errors.push(`PNG response read: ${errorText(error)}`)));
    });
    await page.route(url=>assetStem(url.href)===heldStem,route=>{
      const job=(async()=>{
      const event={url:route.request().url(),action:mode==='normal'?'hold-then-continue':'abort',
        interceptedAt:new Date().toISOString()};
      item.interceptedRequests.push(event);
      if(item.interceptedRequests.length!==1){
        item.errors.push('Unexpected retry of the selected PNG');
        await route.continue();return;
      }
      if(mode==='normal'){await released;event.releasedAt=new Date().toISOString();await route.continue();}
      else{event.abortedAt=new Date().toISOString();await route.abort('failed');}
      })().catch(error=>item.errors.push(`PNG route: ${errorText(error)}`));
      routeJobs.push(job);return job;
    });
    await page.goto(report.url,{waitUntil:'domcontentloaded',timeout:assetTimeoutMs});
    await page.waitForFunction(()=>Boolean(window.freshDiagnostics?.().actors?.assets),null,{timeout:assetTimeoutMs});
    if(mode==='normal'){
      await page.waitForFunction(()=>window.freshDiagnostics().actors.assets.pendingCount===1,null,{timeout:assetTimeoutMs});
      assert.equal(item.interceptedRequests.length,1,'the required PNG is actually held');
      const pending=await snapshot(page);item.observations.push({phase:'held-pending',...pending});
      gated(pending,'loading');assert.equal(pending.assets.readyCount,3);assert.equal(pending.assets.failedCount,0);
      await clickDisabledStart(page);await page.waitForTimeout(holdMs);
      const stillPending=await snapshot(page);item.observations.push({phase:'held-after-click',...stillPending});
      gated(stillPending,'loading');assert.equal(stillPending.assets.pendingCount,1);
      assert.equal(stillPending.worldTime,pending.worldTime,'simulation stays stopped during the held request');
      release();
      await page.waitForFunction(()=>{
        const d=window.freshDiagnostics();
        return d.actors.assets.state==='ready'&&!document.querySelector('#start').disabled&&d.render.calls>0;
      },null,{timeout:assetTimeoutMs});
      const ready=await snapshot(page);item.observations.push({phase:'ready-before-start',...ready});
      assert.equal(ready.running,false);assert.equal(ready.assets.pendingCount,0);
      assert.equal(ready.assets.readyCount,4);assert.equal(ready.assets.failedCount,0);
      assert.equal(ready.assets.error,null);assert.equal(ready.start.text,'山道へ');
      await page.click('#start');
      await page.waitForFunction(time=>{
        const d=window.freshDiagnostics();return d.running&&d.world.time>time&&d.render.calls>0;
      },ready.worldTime,{timeout:assetTimeoutMs});
      await page.waitForTimeout(settleMs);
      const playing=await snapshot(page);item.observations.push({phase:'started-and-rendered',...playing});
      assert.equal(playing.assets.state,'ready');assert.equal(playing.running,true);
      assert.equal(Object.keys(playing.actors.rigs).length,4);
      assert.ok(playing.actors.rigs.player,'actual player rig is present');
      for(const rig of Object.values(playing.actors.rigs)){
        assert.equal(rig.importedTextureAssets,4);assert.equal(rig.importedGeometryAssets,1);
        assert.equal(rig.assetSource,'MakeHuman MPFB hm08 CC0');assert.equal(rig.textureState,'ready');
        assert.ok(rig.drawMeshes>0&&rig.triangles>0);
      }
      assert.deepEqual(playing.observation.textureApiSubmissions.map(submission=>submission.stem).sort(),[...stems].sort(),
        'all four real PNG images were decoded and supplied to WebGL');
      for(const submission of playing.observation.textureApiSubmissions)assert.ok(submission.complete&&submission.naturalWidth>0&&submission.naturalHeight>0);
    }else{
      await page.waitForFunction(()=>{
        const a=window.freshDiagnostics().actors.assets;return a.state==='failed'&&a.pendingCount===0;
      },null,{timeout:assetTimeoutMs});
      const failed=await snapshot(page);item.observations.push({phase:'failed-visible',...failed});
      gated(failed,'failed');assert.equal(failed.assets.readyCount,3);assert.equal(failed.assets.failedCount,1);
      assert.ok(failed.assets.error,'asset failure is retained in diagnostics');
      assert.equal(failed.start.text,'読み込み失敗');assert.match(failed.message,/人物の読み込みに失敗しました/);
      assert.equal(await page.locator('#message').isVisible(),true,'user sees the failure message');
      await clickDisabledStart(page);await page.waitForTimeout(settleMs);
      const stillFailed=await snapshot(page);item.observations.push({phase:'failed-after-click',...stillFailed});
      gated(stillFailed,'failed');assert.equal(stillFailed.worldTime,failed.worldTime);
      assert.deepEqual(stillFailed.observation.textureApiSubmissions,[],'failed readiness must not submit partial textures');
    }
    await page.screenshot({path:resolve(out,`${mode==='normal'?'normal':'failed'}.png`)});
    item.screenshot=mode==='normal'?'normal.png':'failed.png';
    await Promise.all(responses);
    validatePngResponses(item,mode==='normal'?stems:stems.filter(stem=>stem!==heldStem));
    if(mode==='normal'){
      for(const submission of item.observations.at(-1).observation.textureApiSubmissions){
        const response=item.pngResponses.find(value=>value.url===submission.url);
        assert.ok(response,'WebGL image submission belongs to an actual fetched PNG');
        assert.equal(submission.naturalWidth,response.width);assert.equal(submission.naturalHeight,response.height);
      }
    }
  }catch(error){item.errors.push(errorText(error));
    if(page&&!item.screenshot){
      try{item.failureState=await snapshot(page);await page.screenshot({path:resolve(out,mode==='normal'?'normal.png':'failed.png')});
        item.screenshot=mode==='normal'?'normal.png':'failed.png';
      }catch(captureError){item.errors.push(`Failure capture: ${errorText(captureError)}`);}
    }
  }finally{
    release();
    await Promise.all(routeJobs);
    if(page){
      try{item.finalObservation=await page.evaluate(()=>window.__freshAssetObservation??null);}
      catch(error){item.errors.push(`Final observation: ${errorText(error)}`);}
    }
    await Promise.all(responses);
    if(browser)await browser.close().catch(error=>item.errors.push(`Browser close: ${errorText(error)}`));
    // Only the specifically injected request failure is expected. No broad
    // message substring suppression: any unrelated console/page/network error fails.
    const abortedUrl=mode==='failed'?item.interceptedRequests[0]?.url:null;
    item.expectedRequestFailures=item.requestFailures.filter(event=>abortedUrl&&event.url===abortedUrl&&event.error==='net::ERR_FAILED');
    item.expectedConsoleErrors=item.consoleErrors.filter(event=>abortedUrl&&event.location.url===abortedUrl&&event.text==='Failed to load resource: net::ERR_FAILED');
    const unexpectedRequests=item.requestFailures.filter(event=>!item.expectedRequestFailures.includes(event));
    const unexpectedConsole=item.consoleErrors.filter(event=>!item.expectedConsoleErrors.includes(event));
    item.glErrorDiagnostics=[...item.consoleErrors,...item.consoleWarnings].filter(event=>isGlErrorDiagnostic(event.text));
    if(unexpectedRequests.length)item.errors.push({unexpectedRequests});
    if(unexpectedConsole.length)item.errors.push({unexpectedConsole});
    if(item.glErrorDiagnostics.length)item.errors.push({glErrorDiagnostics:item.glErrorDiagnostics});
    if(item.pageErrors.length)item.errors.push({pageErrors:item.pageErrors});
    if(item.finalObservation?.unhandledRejections.length)item.errors.push({unhandledRejections:item.finalObservation.unhandledRejections});
    if(item.interceptedRequests.length!==1)item.errors.push('Expected exactly one intercepted required PNG');
    if(mode==='failed'&&item.expectedRequestFailures.length!==1)item.errors.push('Expected exactly one matching aborted network failure');
    if(!item.finalObservation?.wrappedMethods.length)item.errors.push('Browser texture observation was not installed');
    item.result=item.errors.length?'failed':'passed';item.finishedAt=new Date().toISOString();await persist();
  }
}

let server;
try{
  report.builtIndexSha256=sha256(await readFile(resolve(root,'fresh-dist/index.html')));
  server=await preview({configFile:resolve(root,'fresh/vite.config.mjs'),
    preview:{host:'127.0.0.1',port:4178,strictPort:true}});
  for(const mode of ['normal','failed'])await runCase(mode);
  report.result=report.cases.length===2&&report.cases.every(item=>item.result==='passed')?'passed':'failed';
}catch(error){report.result='failed';report.errors.push(errorText(error));}
finally{
  if(server)await server.close().catch(error=>{
    report.result='failed';report.errors.push(`Preview close: ${errorText(error)}`);
  });
  report.finishedAt=new Date().toISOString();await persist();
}
console.log(JSON.stringify({result:report.result,report:resolve(out,'report.json'),cases:report.cases.map(({mode,result})=>({mode,result}))}));
if(report.result!=='passed')process.exitCode=1;
